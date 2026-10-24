// COURT CLASH — a quick game of two-hoop basketball on a toy outdoor court, 75 seconds. Teams follow the lobby
// colours like Net Gains: red + green (seats 0 + 2) shoot at the RIGHT hoop, blue + pink (seats 1 + 3) at the LEFT.
// Stick = move (you dribble automatically). A with the ball: HOLD and let go in the green to shoot (a meter over your
// head; the further out, the more power — outside the painted arc it is a 3), a quick TAP passes to your teammate,
// and close to the rim any press is a layup. A without the ball while a CPU teammate has it = "pass it here!".
// B = jump (a jumping defender close to a shooter can swat the shot), and close to whoever has the ball it is a steal
// try: grab it from behind and it nearly always works, reach in from the front and you might stumble.
// A team of one gets a CPU teammate when the other team has two (Dunk, or Swish on the blue side); alone you play 1v1
// against a CPU (Hopper). After a basket the other team gets the ball. Most points at the buzzer wins.
import { makeBody, stepBody, separate, F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';
import { release, stepFree, qualityOf, idealPower, tolFor, hoopDist, isThree, meterAt, HOOP_R, BALL_R, groupBy } from '../hoops-kit.js';

export const meta = {
  id: 'court-clash', title: 'Court Clash', blurb: 'Two hoops, one ball, 75 seconds — shoot, pass, steal and swat!',
  how: ['Red + green shoot right, blue + pink shoot left.', 'With the ball: HOLD A, let go in the green to shoot. Tap A to pass.', 'B = jump and steal. Outside the arc is worth 3!'],
  kind: 'arena', min: 1, max: 4, seconds: 75, scoring: 'points', unit: 'points', tags: ['action', 'coop'],
  controls: { stick: true, a: 'Shoot / pass', b: 'Steal / jump' },
  move: { speed: 5.4, accel: 24, carryMul: 0.45, stunDrag: 2.2 },
  arena: { shape: 'rect', hw: 9, hd: 5.2, wall: true }, pitch: 42, card: 'card-court-clash', css: true,
};

export const RIM = { x: 7.9, y: 2.75 }, REL_Y = 1.75, THREE_R = 5.2, LAYUP_R = 1.7, TAP = 0.22;
export const SAFE_S = 1.0;                                          // just got the ball: nobody can steal it for this long
export const STEAL_R = 1.3, BLOCK_R = 1.45, JUMP_S = 0.55, JUMP_H = 0.7, PICK_R = 0.75, START = 1.2, AFTER = 1.0;
/** The hoop team t shoots at (team 0 = red + green shoots right). */
export const hoopFor = t => (t === 0 ? { x: RIM.x, y: RIM.y, z: 0, r: HOOP_R, nx: -1, nz: 0 } : { x: -RIM.x, y: RIM.y, z: 0, r: HOOP_R, nx: 1, nz: 0 });
export const HOOPS = [hoopFor(0), hoopFor(1)];
export const teamOf = seat => seat % 2;
/** Meter period, the green band, how good / grabby the CPU is, by lobby difficulty. */
export const LEVELS = {
  easy:   { period: 1.7, tol: 0.1, cpuAim: 1.7, cpuSteal: 0.35, cpuBlock: 0.25, steal: 0.3 },
  normal: { period: 1.4, tol: 0.08, cpuAim: 1.15, cpuSteal: 0.7, cpuBlock: 0.45, steal: 0.25 },
  hard:   { period: 1.15, tol: 0.065, cpuAim: 0.75, cpuSteal: 1.2, cpuBlock: 0.65, steal: 0.2 },
};
export const CPU_NAMES = [['Dunk', 'Hopper'], ['Swish', 'Hopper']];
const r2 = v => Math.round(v * 100) / 100;

export function create({ rng, players, difficulty = 'normal' }) {
  const L = LEVELS[difficulty] || LEVELS.normal, { hw, hd } = meta.arena, events = [], bodies = new Map();
  const n = players.length;
  // everyone on the court: the players, plus CPU fill-ins (solo: one opponent; 3 players: a teammate for the lone one)
  const A = [];
  for (const p of players) A.push({ pid: p.pid, team: teamOf(p.seat), name: p.name });
  const count = t => A.filter(a => a.team === t).length;
  if (n === 1) A.push({ pid: null, team: 1 - A[0].team, name: CPU_NAMES[1 - A[0].team][1], cpu: true });
  else for (const t of [0, 1]) if (count(t) === 1 && count(1 - t) === 2) A.push({ pid: null, team: t, name: CPU_NAMES[t][0], cpu: true });
  A.forEach((a, i) => {
    const mates = A.filter(b => b.team === a.team), k = mates.indexOf(a), sx = a.team === 0 ? -1 : 1;
    a.i = i; a.body = makeBody(sx * 3.2, mates.length > 1 ? (k ? 1.6 : -1.6) : 0, sx > 0 ? -Math.PI / 2 : Math.PI / 2);
    a.held = 0; a.prevB = 0; a.stealCd = 0; a.safe = 0; a.jump = 0; a.stun = 0; a.noGrab = 0; a.pts = 0; a.plan = null; a.carry = 0; a.call = 0;
    if (a.pid != null) bodies.set(a.pid, a.body);
  });
  const byPid = new Map(A.filter(a => a.pid != null).map(a => [a.pid, a]));
  const mateOf = a => A.find(b => b !== a && b.team === a.team) || null;
  const score = [0, 0];
  const ball = { x: 0, y: 3.2, z: 0, vx: (rng() < 0.5 ? -1 : 1) * rng.range(0.8, 1.4), vy: 2.5, vz: rng.range(-0.6, 0.6),   // the tip-off bounces toward one side or the other
    holder: -1, last: -1, shot: null, pass: -1, dead: 0, give: -1 };
  let time = 0, over = false;
  const left = () => Math.max(0, Math.ceil(meta.seconds - 1 - time));
  const holderA = () => (ball.holder >= 0 ? A[ball.holder] : null);
  function take(a) { a.safe = SAFE_S; ball.holder = a.i; ball.last = a.i; ball.shot = null; ball.pass = -1; a.carry = 0; a.held = 0; }
  function loose(a, cd = 0.5) { ball.holder = -1; a.noGrab = cd; a.held = 0; a.body.flags &= ~F.CARRY; }
  function launchShot(a, p) {
    const b = a.body, H = hoopFor(a.team), d0 = hoopDist(b.x, b.z, H);
    const three = isThree(b.x, b.z, H, THREE_R), pts = three ? 3 : 2;
    let x = b.x, z = b.z, q, lat = 0, layup = d0 < LAYUP_R;
    // a defender in the way: close to you = the shot wobbles; jumping close = it may be swatted away
    let close = null, cd = 9; for (const o of A) if (o.team !== a.team) { const dd = Math.hypot(o.body.x - b.x, o.body.z - b.z); if (dd < cd) { cd = dd; close = o; } }
    if (close && close.jump > 0 && cd < BLOCK_R && rng() < (layup ? 0.45 : 0.6)) {
      loose(a, 0.6); const ax = b.x - close.body.x, az = b.z - close.body.z, k = Math.hypot(ax, az) || 1;
      Object.assign(ball, { x: b.x, y: REL_Y + 0.3, z: b.z, vx: ax / k * 4 + rng.range(-1, 1), vy: 2.2, vz: az / k * 4 + rng.range(-1, 1), last: close.i, shot: null });
      events.push({ e: 'block', by: close.i, on: a.i, x: r2(b.x), z: r2(b.z) }); return;
    }
    const contest = close && cd < 1.5 ? 1 - cd / 1.5 : 0;
    if (layup) {
      // a layup: step in to a soft spot 1.7 m out on your line and roll it in (most of the time)
      const ux = (b.x - H.x) / (d0 || 1), uz = (b.z - H.z) / (d0 || 1); x = H.x + ux * LAYUP_R; z = H.z + uz * LAYUP_R;
      q = rng() < 0.88 - contest * 0.45 ? 0 : (rng() < 0.5 ? -2.4 : 2.4);
    } else {
      q = qualityOf(p, d0, L.tol) + (contest ? rng.range(-1, 1) * contest * 1.1 : 0);
      lat = contest ? rng.range(-1, 1) * contest * 0.22 : 0;
    }
    const rel = release(x, REL_Y, z, H.x, H.z, H.y, q, lat);
    loose(a, 0.55); Object.assign(ball, rel, { last: a.i, shot: { team: a.team, pts, by: a.i } });
    a.body.flags &= ~F.CARRY;
    events.push({ e: 'shot', by: a.i, pts, layup: layup ? 1 : 0, q: r2(q), x: r2(b.x), z: r2(b.z) });
  }
  function pass(a) {
    const m = mateOf(a); if (!m) return false;
    const tx = m.body.x + m.body.vx * 0.35, tz = m.body.z + m.body.vz * 0.35, b = a.body, d = Math.hypot(tx - b.x, tz - b.z) || 0.1, T = Math.max(0.3, d / 11);
    loose(a, 0.45); Object.assign(ball, { x: b.x, y: 1.2, z: b.z, vx: (tx - b.x) / T, vy: 9.8 * T / 2, vz: (tz - b.z) / T, last: a.i, shot: null, pass: m.i });
    events.push({ e: 'pass', by: a.i, to: m.i }); return true;
  }
  function trySteal(a) {
    const h = holderA(); if (!h || h.team === a.team || a.stealCd > 0) return;
    if (h.safe > 0) { a.stealCd = 0.4; return; }
    const dx = a.body.x - h.body.x, dz = a.body.z - h.body.z, d = Math.hypot(dx, dz); if (d > STEAL_R) return;
    a.stealCd = 0.9;
    const behind = (Math.sin(h.body.yaw) * dx + Math.cos(h.body.yaw) * dz) < 0;
    if (rng() < L.steal + (behind ? 0.45 : 0) + (h.held > 0.15 ? 0.15 : 0)) { loose(h, 0.7); take(a); events.push({ e: 'steal', by: a.i, from: h.i }); }
    else { a.stun = 0.4; a.body.flags |= F.STUN; a.body.vx *= 0.3; a.body.vz *= 0.3; events.push({ e: 'reach', by: a.i }); }
  }
  /** One agent's buttons + movement for this tick (players from input(), CPUs from their brain). */
  function drive(a, inp) {
    const bits = inp?.b | 0, down = bits & IN.A, was = a.prevB & IN.A, pb = (bits & IN.B) && !(a.prevB & IN.B); a.prevB = bits;
    if (a.stun > 0) { stepBody(a.body, null, meta.move, meta.arena); return; }
    const mine = ball.holder === a.i;
    if (mine) {
      if (down) { a.held += 0.05; if (a.held > 0.12) a.body.flags |= F.CARRY; }
      else if (was) {
        const d = hoopDist(a.body.x, a.body.z, hoopFor(a.team));
        if (a.held < TAP && d >= LAYUP_R && mateOf(a)) pass(a);
        else launchShot(a, meterAt(a.held, L.period));
        a.held = 0;
      }
    } else { a.held = 0; a.body.flags &= ~F.CARRY; if (down && !was) { const h = holderA(); if (h && h.cpu && h.team === a.team) h.call = 0.6; } }
    if (pb) { if (a.jump <= 0) { a.jump = JUMP_S; events.push({ e: 'jump', by: a.i }); } if (!mine) trySteal(a); }
    stepBody(a.body, inp, meta.move, meta.arena);
  }
  // ---- the CPU (also what the tests' bots use, with their own skill)
  function brain(a, aim = L.cpuAim, grab = L.cpuSteal, block = L.cpuBlock) {
    const b = a.body, H = hoopFor(a.team), O = hoopFor(1 - a.team), h = holderA(), toward = (x, z, press = 0) => { const dx = x - b.x, dz = z - b.z, d = Math.hypot(dx, dz); return { mx: d < 0.2 ? 0 : dx / d * Math.min(1, d), mz: d < 0.2 ? 0 : dz / d * Math.min(1, d), b: press }; };
    if (h === a) {
      const d = hoopDist(b.x, b.z, H), m = mateOf(a);
      if (a.plan == null) a.plan = { want: 3.2 + rng() * 1.6 * (rng() < 0.25 ? 1.4 : 1), z: rng.range(-2.4, 2.4), p: null };
      let def = 9; for (const o of A) if (o.team !== a.team) def = Math.min(def, Math.hypot(o.body.x - b.x, o.body.z - b.z));
      if (a.held > 0) {                                  // charging: let go when the meter reaches the planned power
        if (meterAt(a.held, L.period) >= a.plan.p - 0.035 || a.held > L.period * 0.5) { a.plan = null; return { mx: 0, mz: 0, b: 0 }; }
        return { mx: 0, mz: 0, b: IN.A };
      }
      if (m && (a.call > 0 || (def < 1.0 && a.carry > 0.8 && rng() < 0.05))) { a.call = 0; a.plan = null; return { mx: 0, mz: 0, b: IN.A, tap: 1 }; }
      if (d < LAYUP_R * 0.9 || (d < a.plan.want && (def > 1.2 || a.carry > 1.6)) || a.carry > 3.5) {
        a.plan.p = Math.max(0.02, Math.min(0.98, idealPower(d) + (rng() * 2 - 1) * aim * tolFor(d, L.tol)));
        return { mx: 0, mz: 0, b: IN.A };
      }
      const tx = H.x - Math.sign(H.x) * Math.min(a.plan.want - 0.4, 3.4), tz = a.plan.z * (d > 4 ? 1 : 0.4);
      return toward(tx, tz);
    }
    a.plan = null;
    if (!h) {                                            // loose ball: the nearer one on the team chases it, the other drops back
      const mates = A.filter(o => o.team === a.team), near = mates.reduce((p, o) => (Math.hypot(o.body.x - ball.x, o.body.z - ball.z) < Math.hypot(p.body.x - ball.x, p.body.z - ball.z) ? o : p));
      if (near === a) return toward(ball.x + ball.vx * 0.25, ball.z + ball.vz * 0.25);
      return toward(O.x * 0.55, ball.z * 0.5);
    }
    if (h.team === a.team) return toward(H.x - Math.sign(H.x) * 3.6, h.body.z > 0 ? -2.3 : 2.3);
    // defend: stand between the ball and our hoop; reach in now and then, jump at a shooter
    const hx = h.body.x, hz = h.body.z, dx = O.x - hx, dz = O.z - hz, dd = Math.hypot(dx, dz) || 1, gx = hx + dx / dd * 0.95, gz = hz + dz / dd * 0.95;
    const dist = Math.hypot(hx - b.x, hz - b.z), inp = toward(gx, gz);
    if (dist < STEAL_R && a.stealCd <= 0 && h.safe <= 0 && rng() < grab * 0.04) inp.b = IN.B;
    if (dist < BLOCK_R && h.held > 0.12 && a.jump <= 0 && rng() < block * 0.25) inp.b = IN.B;
    return inp;
  }
  function score_(team, pts, by) {
    score[team] += pts; if (by >= 0 && A[by].team === team) A[by].pts += pts;
    ball.dead = AFTER; ball.shot = null; ball.give = 1 - team;
    events.push({ e: 'score', team, pts, by });
  }
  return {
    bodies, events,
    init: () => ({ who: A.map(a => ({ pid: a.pid, team: a.team, name: a.name, cpu: !!a.cpu })), hoops: HOOPS, rimY: RIM.y, threeR: THREE_R, relY: REL_Y, level: L, layupR: LAYUP_R }),
    input(pid, inp) { const a = byPid.get(pid); if (!a || over) return; if (time < START) { stepBody(a.body, null, meta.move, meta.arena); return; } drive(a, inp); },
    step(dt) {
      if (over) return;
      time += dt;
      for (const a of A) if (a.cpu) { if (time < START) continue; const inp = brain(a); if (inp.tap && ball.holder === a.i) { a.prevB = IN.A; a.held = 0.05; drive(a, { mx: 0, mz: 0, b: 0 }); } else drive(a, inp); }
      separate(A.map(a => a.body));
      for (const a of A) {
        if (a.stealCd > 0) a.stealCd -= dt; if (a.safe > 0) a.safe -= dt; if (a.noGrab > 0) a.noGrab -= dt; if (a.call > 0) a.call -= dt;
        if (a.stun > 0 && (a.stun -= dt) <= 0) a.body.flags &= ~F.STUN;
        if (a.jump > 0) { a.jump = Math.max(0, a.jump - dt); const k = 1 - a.jump / JUMP_S; a.body.y = r2(4 * JUMP_H * k * (1 - k)); if (a.jump > 0) a.body.flags |= F.AIR; else { a.body.flags &= ~F.AIR; a.body.y = 0; } }
      }
      // the ball
      const h = holderA();
      if (h) {
        h.carry += dt; const b = h.body;
        ball.x = b.x + Math.sin(b.yaw) * 0.42; ball.z = b.z + Math.cos(b.yaw) * 0.42; ball.y = 1 + b.y; ball.vx = b.vx; ball.vz = b.vz; ball.vy = 0;
      } else {
        for (let s = 0; s < 6; s++) for (const hit of stepFree(ball, HOOPS, dt / 6, meta.arena)) {
          if (hit.h === 'in' && ball.dead <= 0) { const team = hit.i === 0 ? 0 : 1, pts = ball.shot && ball.shot.team === team ? ball.shot.pts : 2; score_(team, pts, ball.shot ? ball.shot.by : ball.last); }
          else if (hit.h === 'rim' || hit.h === 'board') { if (ball.shot) events.push({ e: hit.h, x: r2(ball.x), z: r2(ball.z) }); }
          else if (hit.h === 'floor') ball.shot = null;
        }
        if (ball.dead > 0) {
          ball.dead -= dt;
          if (ball.dead <= 0) {                           // the team that was scored on takes it out
            const t = ball.give, cands = A.filter(a => a.team === t);
            const g = cands.reduce((p, o) => (Math.hypot(o.body.x - ball.x, o.body.z - ball.z) < Math.hypot(p.body.x - ball.x, p.body.z - ball.z) ? o : p));
            take(g); events.push({ e: 'inbound', to: g.i });
          }
        } else {
          let best = null, bd = PICK_R;
          for (const a of A) {
            if (a.stun > 0 || a.noGrab > 0) continue;
            const d = Math.hypot(a.body.x - ball.x, a.body.z - ball.z) - (ball.pass === a.i ? 0.25 : 0);
            if (d < bd && ball.y < 1.6 + a.body.y) { bd = d; best = a; }
          }
          if (best) { const was = ball.pass; take(best); events.push({ e: 'pick', by: best.i, caught: was === best.i ? 1 : 0, picked: was >= 0 && A[was].team !== best.team ? 1 : 0 }); }
        }
      }
      if (time >= meta.seconds - 1) { over = true; for (const a of A) { a.body.flags |= F.FROZEN; a.body.vx = a.body.vz = 0; } events.push({ e: 'end', score: [...score] }); }
    },
    state() {
      const sc = {}; for (const p of players) sc[p.pid] = score[teamOf(p.seat)];
      const hA = holderA();
      return {
        sc, s: [...score], left: left(), go: time >= START ? 1 : 0,
        b: [r2(ball.x), r2(ball.y), r2(ball.z), ball.holder, r2(ball.vx), r2(ball.vy), r2(ball.vz)],
        h: hA ? r2(hA.held) : 0,
        c: A.filter(a => a.cpu).map(a => [a.i, r2(a.body.x), r2(a.body.z), r2(a.body.yaw), r2(Math.hypot(a.body.vx, a.body.vz)), a.body.flags, r2(a.body.y)]),
      };
    },
    get over() { return over; },
    result() {
      const scores = {}; for (const p of players) scores[p.pid] = score[teamOf(p.seat)];
      return { order: groupBy(players.map(p => ({ pid: p.pid, key: scores[p.pid] }))), scores, unit: meta.unit, teams: [0, 1].filter(t => A.some(a => a.team === t && a.pid != null)).map(t => ({ team: t, pids: A.filter(a => a.team === t && a.pid != null).map(a => a.pid), score: score[t] })), own: Object.fromEntries(A.filter(a => a.pid != null).map(a => [a.pid, a.pts])) };
    },
    _debug: { A, ball, score, brain, get time() { return time; }, L },
  };
}
