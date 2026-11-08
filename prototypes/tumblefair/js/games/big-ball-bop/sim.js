// BIG BALL BOP (Expansion 1 M5, 2026-11-07) — the team game. A long lawn with a goal at each end and one GIANT beach
// ball (1.2 m round): heavy, bouncy and a bit floaty. Run into it to push it; A is a big BELLY-BUMP: close to the ball
// it bops it hard the way you face (and up in the air), anywhere else it is a little lunge that knocks over whoever is
// in front of you. B hops (over a belly-bump, or into the ball for a header). The ball bounces off the side walls and
// rolls on; a goal stops the clock for a moment ("GOAL!"), then it drops back in the middle.
// Teams follow the lobby colours: red + green (seats 0 + 2) score in the RIGHT goal, blue + pink (seats 1 + 3) in the
// LEFT. 2 players = 1 v 1, 4 = 2 v 2; with 3 the short side gets GOALIE GUS, a big friendly keeper who shuffles about
// in front of their goal (he is part of the game, not a player). Alone: you against Gus — score as many as you can (with
// "Rival when alone" off, Gus stays home and you shoot at an empty goal).
// Result: the team with more goals first (a draw = one group); everybody's score is their team's goals.
import { makeBody, stepBody, separate, F, BODY_R } from '../../shared/arena.js';
import { r2, clamp, byDiff, knock, presses } from '../boss-kit.js';

export const meta = {
  id: 'big-ball-bop', title: 'Big Ball Bop', blurb: 'Bump the giant beach ball into the other team’s goal!',
  how: ['Bop the giant beach ball into the other goal!', 'Run into it to push it. A: belly-bump (near the ball: a big bop). B: hop.', 'Red + green score on the RIGHT, blue + pink on the LEFT.'],
  kind: 'arena', min: 1, max: 4, seconds: 75, scoring: 'points', unit: 'goals', tags: ['action', 'social'],
  controls: { stick: true, a: 'Bump', b: 'Hop' }, move: { speed: 6.0, accel: 22, stunDrag: 2.2, boostMul: 1.7 },
  arena: { shape: 'rect', hw: 10, hd: 6, wall: true }, pitch: 50, card: 'card-big-ball-bop', css: true, rival: true,
};

export const RULES = {
  R: 1.2, gravity: 7.5, bounceY: 0.55, roll: 0.42, airDrag: 0.08, wall: 0.8, maxV: 14,
  goalW: 3.2, net: 1.8, push: 1.25, lift: 0.25, squeeze: 5.5,
  kickR: 0.95, kickCone: 1.15, kickV: 10.5, kickUp: 4.2, kickCool: 0.65, lunge: 0.3, lungeHit: 1.15, lungeKnock: 6.5, lungeStun: 0.5,
  hop: 0.5, hopH: 0.9, hopCool: 0.35, header: 3.2,
  start: 2.0, goalPause: 2.2, kickoff: 0.9,
  gus: { r: 0.6, off: 1.35, speed: { easy: 0.9, normal: 1.25, hard: 1.7 }, wander: 1.9, slap: 3.0 },
};
export const teamOfSeat = seat => seat % 2;
/** The x of the goal team t SHOOTS at (team 0 = red + green shoots right). */
export const goalX = t => (t === 0 ? 1 : -1) * meta.arena.hw;
const TEAM_NAMES = ['Red + Green', 'Blue + Pink'];

export function create({ rng, players, difficulty = 'normal', rivals = true }) {
  const n = players.length, pids = players.map(p => p.pid), bodies = new Map(), A = meta.arena, { R } = RULES;
  // teams by seat colour; if everybody happens to sit on one side (seats 0 + 2 only), split them by order instead
  let team = new Map(players.map(p => [p.pid, teamOfSeat(p.seat)]));
  if (n >= 2 && new Set(team.values()).size === 1) team = new Map(players.map((p, i) => [p.pid, i % 2]));
  const members = [0, 1].map(t => pids.filter(p => team.get(p) === t));
  // Goalie Gus: keeps the goal of the short side (3 players), or of the side you shoot at when you are alone
  let gusTeam = null;
  if (n === 3) gusTeam = members[0].length < members[1].length ? 0 : 1;
  else if (n === 1 && rivals !== false) gusTeam = 1 - team.get(pids[0]);
  const gus = gusTeam == null ? null : { x: -goalX(gusTeam) + Math.sign(goalX(gusTeam)) * RULES.gus.off, z: 0, t: rng.range(0, 6), slap: 0 };   // he guards the goal his team defends
  const kickoffSpot = (pid) => { const t = team.get(pid), k = members[t].indexOf(pid), m = members[t].length; return { x: (t === 0 ? -1 : 1) * 4.2, z: m > 1 ? (k ? 2 : -2) : 0, yaw: t === 0 ? Math.PI / 2 : -Math.PI / 2 }; };
  for (const pid of pids) { const s = kickoffSpot(pid); bodies.set(pid, makeBody(s.x, s.z, s.yaw)); }
  const P = new Map(pids.map(pid => [pid, { cool: 0, lunge: 0, hop: 0, hopCool: 0, stun: 0, bops: 0, goals: 0 }]));
  const ball = { x: 0, z: 0, y: 2.6, vx: rng.range(-0.4, 0.4), vz: rng.range(-0.4, 0.4), vy: 0, last: null };
  const goals = [0, 0];
  let time = meta.seconds, phase = 'ready', left = RULES.start, over = false, lastGoal = null;
  const events = [];

  function freezeAll(on) { for (const b of bodies.values()) { if (on) { b.flags |= F.FROZEN; b.vx = b.vz = 0; } else b.flags &= ~F.FROZEN; } }
  function kickoff() {
    for (const pid of pids) { const s = kickoffSpot(pid), b = bodies.get(pid); b.x = s.x; b.z = s.z; b.yaw = s.yaw; b.vx = b.vz = 0; b.y = 0; b.flags &= ~(F.STUN | F.AIR | F.BOOST); const st = P.get(pid); st.hop = 0; st.lunge = 0; st.stun = 0; }
    Object.assign(ball, { x: 0, z: rng.range(-0.5, 0.5), y: 2.6, vx: rng.range(-0.3, 0.3), vz: rng.range(-0.3, 0.3), vy: 0, last: null });
    if (gus) gus.z = 0;
    freezeAll(true); phase = 'kickoff'; left = RULES.kickoff; events.push({ e: 'kickoff' });
  }
  function scored(t) {
    goals[t]++; lastGoal = t; phase = 'goal'; left = RULES.goalPause;
    const by = ball.last != null && team.get(ball.last) === t ? ball.last : null;
    if (by != null) P.get(by).goals++;
    ball.vx *= 0.15; ball.vz *= 0.15;
    events.push({ e: 'goal', team: t, by, own: ball.last != null && team.get(ball.last) !== t ? ball.last : null, g: goals.slice() });
  }
  function bop(pid) {
    const b = bodies.get(pid), s = P.get(pid);
    const dx = ball.x - b.x, dz = ball.z - b.z, d = Math.hypot(dx, dz), fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
    const ang = Math.acos(clamp((dx * fx + dz * fz) / (d || 1), -1, 1));
    if (ball.y < 2.2 && d <= R + BODY_R + RULES.kickR && ang <= RULES.kickCone) {
      const wob = rng.range(-0.12, 0.12);         // a beach ball never goes quite where you meant
      let ux = fx * 0.65 + dx / (d || 1) * 0.35, uz = fz * 0.65 + dz / (d || 1) * 0.35; const L = Math.hypot(ux, uz) || 1; ux /= L; uz /= L;
      [ux, uz] = [ux * Math.cos(wob) + uz * Math.sin(wob), -ux * Math.sin(wob) + uz * Math.cos(wob)];
      ball.vx = ux * RULES.kickV; ball.vz = uz * RULES.kickV; ball.vy = RULES.kickUp; ball.last = pid; s.bops++;
      events.push({ e: 'bop', pid, x: r2(ball.x), z: r2(ball.z) });
      return;
    }
    // a lunge: a short burst forward that knocks over whoever is right in front
    s.lunge = RULES.lunge; b.flags |= F.BOOST; events.push({ e: 'lunge', pid });
  }
  function moveBall(dt) {
    // gravity + bounce
    ball.vy -= RULES.gravity * dt; ball.y += ball.vy * dt;
    if (ball.y <= 0) { if (ball.vy < -2.2) events.push({ e: 'thud', x: r2(ball.x), z: r2(ball.z), v: r2(-ball.vy) }); ball.y = 0; ball.vy = ball.vy < -1 ? -ball.vy * RULES.bounceY : 0; }
    const drag = ball.y > 0.05 ? RULES.airDrag : RULES.roll, k = Math.max(0, 1 - drag * dt);
    ball.vx *= k; ball.vz *= k;
    const sp = Math.hypot(ball.vx, ball.vz); if (sp > RULES.maxV) { ball.vx *= RULES.maxV / sp; ball.vz *= RULES.maxV / sp; }
    ball.x += ball.vx * dt; ball.z += ball.vz * dt;
    // side walls
    if (ball.z > A.hd - R) { ball.z = A.hd - R; if (ball.vz > 0) { ball.vz = -ball.vz * RULES.wall; events.push({ e: 'wall' }); } }
    if (ball.z < -A.hd + R) { ball.z = -A.hd + R; if (ball.vz < 0) { ball.vz = -ball.vz * RULES.wall; events.push({ e: 'wall' }); } }
    // end walls, with the goal mouth in the middle of each
    for (const sx of [1, -1]) {
      const edge = sx * A.hw, inMouth = Math.abs(ball.z) < RULES.goalW - R * 0.35;
      if (sx * ball.x > A.hw - R && !inMouth && sx * ball.x < A.hw + 0.2) { ball.x = edge - sx * R; if (sx * ball.vx > 0) { ball.vx = -ball.vx * RULES.wall; events.push({ e: 'wall' }); } }
      // the posts
      for (const pz of [RULES.goalW, -RULES.goalW]) {
        const dx = ball.x - edge, dz = ball.z - pz, d = Math.hypot(dx, dz), min = R + 0.15;
        if (d < min && d > 1e-6) { const nx = dx / d, nz = dz / d; ball.x = edge + nx * min; ball.z = pz + nz * min; const vn = ball.vx * nx + ball.vz * nz; if (vn < 0) { ball.vx -= 1.8 * vn * nx; ball.vz -= 1.8 * vn * nz; events.push({ e: 'post' }); } }
      }
      // inside the net: it cannot leave through the back or the sides
      if (sx * ball.x > A.hw) { ball.z = clamp(ball.z, -RULES.goalW + R * 0.6, RULES.goalW - R * 0.6); if (sx * ball.x > A.hw + RULES.net) { ball.x = sx * (A.hw + RULES.net); ball.vx = -ball.vx * 0.2; } }
    }
  }
  /** The players (and Gus) push the ball; a hop into it is a header. */
  function touchBall() {
    // every push is worked out from the ball as it was at the start of the step and then added up, so the order the
    // players are listed in never matters; two players shoving from opposite sides squeeze it up into the air
    let px = 0, pz = 0, dvx = 0, dvz = 0, up = ball.vy, last = ball.last, sides = 0, sx0 = 0, sz0 = 0;
    for (const [pid, b] of bodies) {
      if (b.flags & (F.FROZEN | F.OUT)) continue;
      if (ball.y > 1.6 + b.y) continue;
      const dx = ball.x - b.x, dz = ball.z - b.z, d = Math.hypot(dx, dz), min = R + BODY_R;
      if (d >= min || d < 1e-6) continue;
      const nx = dx / d, nz = dz / d, vrel = (b.vx - ball.vx) * nx + (b.vz - ball.vz) * nz;
      px += nx * (min - d); pz += nz * (min - d);              // the ball gives way (it is light for its size)
      if (vrel > 0) { dvx += nx * vrel * RULES.push; dvz += nz * vrel * RULES.push; up = Math.max(up, vrel * RULES.lift); last = pid; if (sides++) { if (nx * sx0 + nz * sz0 < -0.3) up = Math.max(up, RULES.squeeze); } else { sx0 = nx; sz0 = nz; } }
      if (b.flags & F.AIR && up < RULES.header) { up = RULES.header; last = pid; events.push({ e: 'header', pid }); }
    }
    ball.x += px; ball.z += pz; ball.vx += dvx; ball.vz += dvz; if (up > ball.vy + 0.5) events.push({ e: up >= RULES.squeeze ? 'squeeze' : 'lift' }); ball.vy = up; ball.last = last;
    if (gus) {
      const dx = ball.x - gus.x, dz = ball.z - gus.z, d = Math.hypot(dx, dz), min = R + RULES.gus.r;
      if (ball.y < 1.8 && d < min && d > 1e-6) {
        const nx = dx / d, nz = dz / d, vn = ball.vx * nx + ball.vz * nz;
        ball.x = gus.x + nx * min; ball.z = gus.z + nz * min;
        if (vn < 0) { ball.vx -= 1.7 * vn * nx; ball.vz -= 1.7 * vn * nz; }
        if (gus.slap <= 0) {                        // a big two-handed slap away from his goal (once in a while, not every step)
          gus.slap = 0.8; ball.vx += -Math.sign(gus.x) * RULES.gus.slap; ball.vy = Math.max(ball.vy, 2.6); ball.last = null;
          events.push({ e: 'save', x: r2(gus.x), z: r2(gus.z) });
        }
      }
    }
  }
  function moveGus(dt) {
    if (!gus) return;
    gus.t += dt; gus.slap = Math.max(0, gus.slap - dt);
    const want = clamp(ball.z * 0.8 + Math.sin(gus.t * 0.9) * RULES.gus.wander, -RULES.goalW + 0.5, RULES.goalW - 0.5), sp = byDiff(difficulty, RULES.gus.speed);
    gus.z += clamp(want - gus.z, -sp * dt, sp * dt);
    for (const b of bodies.values()) {          // he is solid
      const dx = b.x - gus.x, dz = b.z - gus.z, d = Math.hypot(dx, dz), min = RULES.gus.r + BODY_R;
      if (d < min) { if (d < 1e-6) b.x += Math.sign(-gus.x) * min; else { b.x = gus.x + dx / d * min; b.z = gus.z + dz / d * min; } }
    }
  }
  freezeAll(true);
  return {
    bodies, events,
    init: () => ({ teams: Object.fromEntries(team), gus: gus ? { team: gusTeam } : null, goalW: RULES.goalW, solo: n === 1, names: TEAM_NAMES }),
    input(pid, inp) {
      const b = bodies.get(pid), s = P.get(pid); if (!b || over) return;
      const pr = presses(s, inp), free = !(b.flags & (F.STUN | F.FROZEN));
      if (pr.b && free && s.hop <= 0 && s.hopCool <= 0) { s.hop = RULES.hop; b.flags |= F.AIR; events.push({ e: 'hop', pid }); }
      if (pr.a && free && s.cool <= 0 && phase === 'play') { s.cool = RULES.kickCool; bop(pid); }
      stepBody(b, inp, meta.move, A);
    },
    step(dt) {
      if (over) return;
      time -= dt; left -= dt;
      separate(bodies.values());
      for (const [pid, b] of bodies) {
        const s = P.get(pid);
        s.cool = Math.max(0, s.cool - dt); s.hopCool = Math.max(0, s.hopCool - dt);
        if (s.stun > 0) { s.stun -= dt; if (s.stun <= 0) b.flags &= ~F.STUN; }
        if (s.hop > 0) { s.hop -= dt; const k = 1 - Math.max(0, s.hop) / RULES.hop; b.y = r2(4 * RULES.hopH * k * (1 - k)); if (s.hop <= 0) { s.hop = 0; b.y = 0; b.flags &= ~F.AIR; s.hopCool = RULES.hopCool; } }
        if (s.lunge > 0) {
          s.lunge -= dt;
          for (const [o, ob] of bodies) {           // a belly-bump knocks over whoever is in front (not a hopper)
            if (o === pid || (ob.flags & (F.AIR | F.STUN))) continue;
            const dx = ob.x - b.x, dz = ob.z - b.z, d = Math.hypot(dx, dz);
            if (d < RULES.lungeHit && dx * Math.sin(b.yaw) + dz * Math.cos(b.yaw) > 0.2) { knock(ob, b.x, b.z, RULES.lungeKnock); P.get(o).stun = RULES.lungeStun; s.lunge = 0; events.push({ e: 'bump', pid, on: o }); }
          }
          if (s.lunge <= 0) b.flags &= ~F.BOOST;
        }
      }
      if (phase === 'play' || phase === 'goal') { moveGus(dt); moveBall(dt); if (phase === 'play') touchBall(); }
      if (phase === 'play') {
        if (ball.x > A.hw + R * 0.4) scored(0);
        else if (ball.x < -A.hw - R * 0.4) scored(1);
      }
      if (left <= 0) {
        if (phase === 'ready' || phase === 'kickoff') { phase = 'play'; freezeAll(false); events.push({ e: 'go' }); }
        else if (phase === 'goal') kickoff();
      }
      if (time <= 0) {
        over = true; phase = 'end'; freezeAll(true);
        events.push({ e: 'end', g: goals.slice() });
      }
    },
    state() {
      const sc = {}; for (const pid of pids) sc[pid] = goals[team.get(pid)];
      const g = { ph: phase, b: [r2(ball.x), r2(ball.z), r2(ball.y), r2(ball.vx), r2(ball.vz)], gs: goals.slice(), sc, left: Math.max(0, Math.ceil(time)), pl: r2(Math.max(0, left)) };
      if (gus) g.gu = [r2(gus.x), r2(gus.z)];
      if (phase === 'goal') g.lg = lastGoal;
      return g;
    },
    get over() { return over; },
    get goals() { return goals.slice(); },
    result() {
      const scores = {}; for (const pid of pids) scores[pid] = goals[team.get(pid)];
      if (n === 1) return { order: [pids.slice()], scores, unit: meta.unit };
      const order = goals[0] === goals[1] ? [pids.slice()] : (goals[0] > goals[1] ? [members[0], members[1]] : [members[1], members[0]]).filter(g => g.length);
      return { order, scores, unit: meta.unit };
    },
  };
}
