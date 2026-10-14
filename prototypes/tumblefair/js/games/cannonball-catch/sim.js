// CANNONBALL CATCH — co-op. The players guard the courtyard in front of a toy castle. Cannons on both sides lob
// cannonballs high over the wall; each one shows a target ring and a shadow where it will come down (~1.6 s warning,
// shorter in later waves). Be standing in the ring when it lands and you catch it (+1 for you). A missed ball bounces
// into the castle and knocks off a heart; lose every heart and the castle falls. A is a DIVE: a quick belly-flop
// lunge that reaches further but leaves you on the ground for a moment. With three or more players some balls are BIG
// (marked x2): it takes two people in the ring to catch one — alone, it flattens you and still dents the castle.
// Four waves of 15 s, each faster. The castle wins if it is still standing at the bell, or once the team reaches the
// catch goal.
import { makeBody, stepBody, separate, spawnRing, F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

export const meta = {
  id: 'cannonball-catch', title: 'Cannonball Catch', blurb: 'Catch the cannonballs before they hit the castle!',
  how: ['Stand in the ring where a cannonball will land to catch it.', 'Miss one and the castle loses a heart. Spread out!', 'DIVE to reach a far one. Big x2 balls need two catchers.'],
  kind: 'arena', min: 1, max: 4, seconds: 60, scoring: 'coop', unit: 'catches', tags: ['coop', 'action'],
  controls: { stick: true, a: 'Dive' }, move: { speed: 6.4, accel: 30, carryMul: 0.65, stunDrag: 4 },
  arena: { shape: 'rect', hw: 8, hd: 5.5, wall: true }, pitch: 56, card: 'card-cannonball-catch', css: true,
};

export const RULES = {
  hearts: 5, heartsPer2: 1,                // +1 heart for each player past the second (more balls, and big ones) (more balls in the air)
  catchR: 1.05, diveCatchR: 1.45,          // body centre to landing point
  dive: 0.32, diveSpeed: 11, diveH: 0.35, diveRest: 0.3, diveCool: 1.1,
  hold: 0.35,                              // you hug a caught ball this long (slowed)
  squash: 1.1,                             // a big ball caught alone flattens you for this long
  bigFrom: 1, bigChance: 0.15, bigSlow: 0.45,   // big balls from wave index 1 (the 2nd wave), only with 3+ players; they fly 0.45 s longer
  spread: 2.4,                             // landing spots in flight keep at least this far apart
  edge: 0.8,                               // and this far inside the courtyard walls
  aimed: 0.8, reach: 0.72,                 // most shots land within reach * (speed * flight) of a player; the rest anywhere
  waveLen: 15, lull: 1.4,                  // each wave: 15 s, the first 1.4 s of it quiet (a breather + the banner)
  waves: [                                 // seconds between shots (solo) and flight time per wave
    { every: 1.7, flight: 1.8 },
    { every: 1.35, flight: 1.7 },
    { every: 1.1, flight: 1.55 },
    { every: 0.9, flight: 1.4 },
  ],
};
export const heartsFor = n => RULES.hearts + Math.max(0, n - 2) * RULES.heartsPer2;
/** Shots come this many times as often with n players (each player can cover a part of the yard). */
export const crowd = n => 0.55 + 0.35 * n;
/** The catch goal: about 85% of the shots a whole match throws (worked out from the wave table). */
export function goalFor(n) {
  let shots = 0;
  RULES.waves.forEach(w => { shots += (RULES.waveLen - RULES.lull) / (w.every / crowd(n)); });
  return Math.round(shots * 0.85);
}
const r2 = v => Math.round(v * 100) / 100;
/** The cannons stand on platforms this far out to each side (x); a ball starts there. */
export const CANNON_X = 11;

export function create({ rng, players }) {
  const n = players.length, bodies = new Map(), spawns = spawnRing(n, n === 1 ? 0 : 2.6, Math.PI / 2), A = meta.arena;
  players.forEach((p, i) => bodies.set(p.pid, makeBody(spawns[i].x, spawns[i].z * 0.7, 0)));
  const P = new Map(players.map(p => [p.pid, { prevB: 0, dive: 0, rest: 0, cool: 0, hold: 0, squash: 0, catches: 0 }]));
  let balls = [], bid = 0, next = RULES.lull + 0.4, hearts = heartsFor(n), caught = 0, wave = 0, time = meta.seconds, elapsed = 0, over = false, success = false;
  const goal = goalFor(n), events = [];

  // a landing spot: usually somewhere a player could run to in time (so a catch is always on), but never on top of a
  // ball already in the air, which is what makes the team spread out
  function spot(flight) {
    let x = 0, z = 0;
    const aimed = rng.chance(RULES.aimed), reach = meta.move.speed * flight * RULES.reach;
    const lx = A.hw - RULES.edge, lz = A.hd - RULES.edge;
    for (let k = 0; k < 16; k++) {
      if (aimed) { const b = bodies.get(rng.pick(players).pid), a = rng.range(0, Math.PI * 2), r = rng.range(1.2, reach); x = b.x + Math.sin(a) * r; z = b.z + Math.cos(a) * r; }
      else { x = rng.range(-lx, lx); z = rng.range(-lz, lz); }
      x = Math.max(-lx, Math.min(lx, x)); z = Math.max(-lz, Math.min(lz, z));
      if (!balls.some(b => Math.hypot(b.x - x, b.z - z) < RULES.spread)) break;
    }
    return { x: r2(x), z: r2(z) };
  }
  function fire() {
    const w = RULES.waves[wave], at = spot(w.flight), side = rng.chance(0.5) ? -1 : 1;
    const big = n >= 3 && wave >= RULES.bigFrom && rng.chance(RULES.bigChance) ? 1 : 0;
    // from a cannon off the side of the courtyard, somewhere along its depth
    const flight = w.flight + (big ? RULES.bigSlow : 0), fz = r2(rng.range(-A.hd + 1, A.hd - 1));
    balls.push({ id: ++bid, fx: side * CANNON_X, fz, x: at.x, z: at.z, left: flight, total: flight, big });
    events.push({ e: 'fire', side, z: fz });
  }
  function land(ball) {
    const near = [];
    for (const p of players) {
      const b = bodies.get(p.pid), s = P.get(p.pid);
      if (s.squash > 0) continue;                                   // flattened: cannot catch
      const d = Math.hypot(b.x - ball.x, b.z - ball.z);
      if (d <= (s.dive > 0 || s.rest > 0 ? RULES.diveCatchR : RULES.catchR)) near.push({ pid: p.pid, d });   // arms out all through a dive
    }
    near.sort((a, b) => a.d - b.d);
    if (ball.big && near.length >= 2) { for (const { pid } of near.slice(0, 2)) catchIt(pid); caught++; events.push({ e: 'catch', pids: near.slice(0, 2).map(c => c.pid), big: 1, x: ball.x, z: ball.z }); return; }
    if (!ball.big && near.length) { catchIt(near[0].pid); caught++; events.push({ e: 'catch', pids: [near[0].pid], big: 0, x: ball.x, z: ball.z }); return; }
    let hurt = ball.big ? 2 : 1;
    if (ball.big && near.length === 1) {                           // caught alone: flattened, and it still dents the wall
      const s = P.get(near[0].pid), b = bodies.get(near[0].pid); s.squash = RULES.squash; s.hold = 0; b.flags = (b.flags | F.STUN) & ~F.CARRY; b.vx = b.vz = 0; hurt = 1;
      events.push({ e: 'squash', pid: near[0].pid });
    }
    hearts = Math.max(0, hearts - hurt);
    events.push({ e: 'miss', x: ball.x, z: ball.z, hurt, hearts });
  }
  function catchIt(pid) {
    const s = P.get(pid), b = bodies.get(pid);
    s.catches++; s.hold = RULES.hold; b.flags |= F.CARRY;
  }
  function finish(ok) {
    over = true; success = ok; time = Math.max(0, time);
    for (const b of bodies.values()) { b.flags = (b.flags | F.FROZEN) & ~(F.STUN | F.AIR); b.y = 0; b.vx = b.vz = 0; }
    events.push({ e: 'end', ok: ok ? 1 : 0 });
  }
  return {
    bodies, events,
    init: () => ({ hearts: heartsFor(n), goal, left: Math.ceil(time) }),
    input(pid, inp) {
      const b = bodies.get(pid), s = P.get(pid); if (!b || over) return;
      const bits = inp?.b | 0, pa = (bits & IN.A) && !(s.prevB & IN.A); s.prevB = bits;
      if (pa && s.cool <= 0 && !(b.flags & F.STUN)) {
        s.dive = RULES.dive; s.cool = RULES.diveCool; s.hold = 0;
        b.vx = Math.sin(b.yaw) * RULES.diveSpeed; b.vz = Math.cos(b.yaw) * RULES.diveSpeed; b.flags = (b.flags | F.STUN | F.AIR) & ~F.CARRY;
        events.push({ e: 'dive', pid });
      }
      stepBody(b, inp, meta.move, meta.arena);
    },
    step(dt) {
      if (over) return;
      elapsed += dt;
      separate(bodies.values());
      for (const [pid, b] of bodies) {
        const s = P.get(pid);
        if (s.cool > 0) s.cool -= dt;
        if (s.dive > 0) {
          s.dive -= dt; const t = 1 - Math.max(0, s.dive) / RULES.dive; b.y = r2(4 * RULES.diveH * t * (1 - t));
          if (s.dive <= 0) { b.y = 0; b.flags &= ~F.AIR; s.rest = RULES.diveRest; }
        } else if (s.rest > 0) { s.rest -= dt; if (s.rest <= 0 && s.squash <= 0) b.flags &= ~F.STUN; }
        if (s.squash > 0) { s.squash -= dt; if (s.squash <= 0) b.flags &= ~F.STUN; }
        if (s.hold > 0) { s.hold -= dt; if (s.hold <= 0) b.flags &= ~F.CARRY; }
      }
      // waves: each starts with a quiet moment, then the cannons fire faster and faster
      const w = Math.min(RULES.waves.length - 1, Math.floor(elapsed / RULES.waveLen));
      if (w !== wave) { wave = w; next = RULES.lull; events.push({ e: 'wave', n: wave + 1 }); }
      next -= dt;
      if (next <= 0) { next = RULES.waves[wave].every / crowd(n) * rng.range(0.85, 1.15); fire(); }
      for (const ball of balls) { ball.left -= dt; if (ball.left <= 0) land(ball); }
      balls = balls.filter(b => b.left > 0);
      time -= dt;
      if (hearts <= 0) finish(false);
      else if (caught >= goal) finish(true);
      else if (time <= 0) finish(true);
    },
    state() {
      const sc = {}; for (const p of players) sc[p.pid] = P.get(p.pid).catches;
      // a ball: [id, from x, from z, to x, to z, seconds left, flight time, big]
      return { bl: balls.map(b => [b.id, b.fx, b.fz, b.x, b.z, r2(b.left), r2(b.total), b.big]), hp: hearts, c: caught, w: wave + 1, sc, left: Math.ceil(time) };
    },
    get over() { return over; },
    result() {
      const scores = {}; for (const p of players) scores[p.pid] = P.get(p.pid).catches;
      return { coop: { success: over ? success : hearts > 0 }, order: [players.map(p => p.pid)], scores, unit: meta.unit };
    },
  };
}
