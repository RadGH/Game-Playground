// CHIP-IN CHALLENGE — everyone at once, from their own mat at the front of a practice green. Aim with the stick,
// hold A to charge (a landing ring on the grass shows where the ball will come down), let go to chip: the ball flies
// in an arc (its shadow races to the landing spot), lands, checks and rolls a little. Where it STOPS scores: the
// bullseye ring 50, then 25 / 10 / 5; roll it into the cup for a CHIP-IN (100). Land it straight in one of the two
// buckets at the back for a BUCKET BONUS (75). Balls are solid on the green, so a good chip can knock a rival's
// resting ball (its points are already banked — but it is in the way of yours). Five shots each; most points wins.
// Rolling uses js/games/golf-kit.js. Solo: score attack with medals.
import { makeBody, stepBody } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';
import { makeBall, stepBalls, charge, assistYaw } from '../golf-kit.js';

export const meta = {
  id: 'chip-in', title: 'Chip-In Challenge', blurb: 'Chip onto the green — the closer to the flag, the more points!',
  how: ['Point the stick to aim. Hold A — the ring shows where it lands.', 'Bullseye 50, rings 25 / 10 / 5. In the cup = 100!', 'Land it in a bucket for 75. Five shots each.'],
  kind: 'arena', min: 1, max: 4, seconds: 60, scoring: 'points', unit: 'points', tags: ['action'],
  controls: { stick: true, a: 'Chip (hold)' },
  move: { speed: 0.01, accel: 40 },
  arena: { shape: 'rect', hw: 8.4, hd: 6.4, wall: false }, pitch: 58, card: 'card-chip-in', css: true,
};

export const SHOTS = 5;
export const CENTER = { x: 0, z: -1.6 };
export const BUCKETS = [{ x: -4.6, z: -4.4, r: 0.48 }, { x: 4.6, z: -4.4, r: 0.48 }];
export const RINGS = [[0.75, 50], [1.6, 25], [2.6, 10], [3.6, 5]];       // [radius, points], inside out
export const CHIP_IN = 100, BUCKET = 75;
export const GREEN_R = 4.4;                                                // off the green the ball dies in the rough
export const LEVELS = {
  easy:   { ring: 1.2, scatter: 0, period: 2.2, help: 12, roll: 0.22, cupR: 0.3, cap: 2.6 },
  normal: { ring: 1, scatter: 0.12, period: 1.8, help: 8, roll: 0.28, cupR: 0.24, cap: 2.2 },
  hard:   { ring: 0.85, scatter: 0.3, period: 1.4, help: 4, roll: 0.36, cupR: 0.2, cap: 1.9 },
};
const MAT_Z = 5.0, r2 = v => Math.round(v * 100) / 100;
/** Carry (metres in the air) for a power 0..1. */
export const carryFor = p => 2 + 10 * Math.max(0, Math.min(1, p));
/** Flight time and peak height of a chip that carries d metres. */
export const flightOf = d => ({ T: 0.65 + d * 0.06, apex: 0.7 + d * 0.2 });
/** The mat spots for n players, across the front. */
export const matsFor = n => Array.from({ length: n }, (_, i) => ({ x: r2((i - (n - 1) / 2) * 3.1), z: MAT_Z }));
/** The points for a ball resting at (x, z) (ring sizes scaled by the level). */
export function ringPoints(x, z, scale = 1) {
  const d = Math.hypot(x - CENTER.x, z - CENTER.z);
  for (const [r, p] of RINGS) if (d <= r * scale) return p;
  return 0;
}
/** Where a chip from (x, z) at yaw with power p lands, with no scatter (the landing ring the phone draws). */
export function landing(x, z, yaw, p) { const d = carryFor(p); return { x: x + Math.sin(yaw) * d, z: z + Math.cos(yaw) * d }; }
export const aimTargets = () => [CENTER, ...BUCKETS];
export const COURSE = { walls: [{ ax: -8, az: -6, bx: 8, bz: -6 }, { ax: 8, az: -6, bx: 8, bz: 6 }, { ax: -8, az: -6, bx: -8, bz: 6 }], roll: 1.5, lin: 0.6 };

export function create({ rng, players, difficulty = 'normal' }) {
  const L = LEVELS[difficulty] || LEVELS.normal, n = players.length, mats = matsFor(n), bodies = new Map(), events = [];
  const course = { ...COURSE, cup: { x: CENTER.x, z: CENTER.z, r: L.cupR, cap: L.cap } };
  const P = new Map(players.map((p, i) => [p.pid, { i, mat: mats[i], ball: null, st: 0, left: SHOTS, pts: [], held: 0, prevA: 0, fly: null, rollT: 0, sumD: 0 }]));
  // st: 0 ready to chip, 1 in the air, 2 rolling, 3 all shots taken
  players.forEach((p, i) => { const b = makeBody(mats[i].x, mats[i].z + 0.6, Math.PI); bodies.set(p.pid, b); });
  let time = meta.seconds - 1, elapsed = 0, over = false;
  const resting = [];                                  // balls that have stopped: [{ pid, ball }] — solid, one per player
  function chip(pid, s, b) {
    const p = charge(s.held, L.period); s.held = 0;
    if (p < 0.02) return;
    const yaw = assistYaw(null, s.mat.x, s.mat.z, b.yaw, aimTargets(), L.help), land = landing(s.mat.x, s.mat.z, yaw, p);
    if (L.scatter) { land.x += rng.range(-L.scatter, L.scatter); land.z += rng.range(-L.scatter, L.scatter); }
    const d = carryFor(p), f = flightOf(d);
    s.fly = { fx: s.mat.x, fz: s.mat.z, tx: r2(land.x), tz: r2(land.z), T: f.T, apex: f.apex, t: 0, yaw, d };
    const old = resting.findIndex(r => r.pid === pid); if (old >= 0) resting.splice(old, 1);   // your last ball is picked up
    s.ball = null; s.st = 1; s.left--; b.yaw = yaw;
    events.push({ e: 'chip', pid, tx: s.fly.tx, tz: s.fly.tz, T: r2(f.T), apex: r2(f.apex), p: r2(p) });
  }
  function score(pid, s, pts, kind) {
    s.pts.push(pts); s.st = s.left > 0 ? 0 : 3; s.rollT = 0;
    if (kind !== 'bucket' && kind !== 'cup') resting.push({ pid, ball: s.ball });
    s.sumD += s.ball ? Math.hypot(s.ball.x - CENTER.x, s.ball.z - CENTER.z) : 0;
    events.push({ e: 'score', pid, pts, kind, x: r2(s.ball?.x ?? 0), z: r2(s.ball?.z ?? 0) });
  }
  const total = s => s.pts.reduce((a, b) => a + b, 0);
  return {
    bodies, events,
    init: () => ({ mats, shots: SHOTS, level: L, center: CENTER, buckets: BUCKETS, rings: RINGS, green: GREEN_R }),
    input(pid, inp) {
      const b = bodies.get(pid), s = P.get(pid); if (!b || !s) return;
      const x0 = b.x, z0 = b.z; stepBody(b, inp, meta.move, meta.arena); b.vx = b.vz = 0;
      b.x = r2(s.mat.x - Math.sin(b.yaw) * 0.6); b.z = r2(s.mat.z - Math.cos(b.yaw) * 0.6);          // stand behind your mat, facing your aim
      if (over) { b.x = x0; b.z = z0; return; }
      const a = (inp?.b | 0) & IN.A;
      if (s.st === 0) { if (a) s.held += 0.05; else if (s.prevA && s.held > 0) chip(pid, s, b); }
      else s.held = 0;
      s.prevA = a;
    },
    step(dt) {
      if (over) return;
      time -= dt; elapsed += dt;
      const rolling = [];
      for (const p of players) {
        const s = P.get(p.pid);
        if (s.st === 1) {
          s.fly.t += dt;
          if (s.fly.t >= s.fly.T) {
            const F = s.fly; s.fly = null;
            const bk = BUCKETS.find(B => Math.hypot(F.tx - B.x, F.tz - B.z) <= B.r);
            s.ball = makeBall(F.tx, F.tz);
            if (bk) { events.push({ e: 'land', pid: p.pid, x: F.tx, z: F.tz }); score(p.pid, s, BUCKET, 'bucket'); continue; }
            const v = 0.6 + F.d * L.roll; s.ball.vx = Math.sin(F.yaw) * v; s.ball.vz = Math.cos(F.yaw) * v; s.ball.still = false;
            s.st = 2; events.push({ e: 'land', pid: p.pid, x: F.tx, z: F.tz });
          }
        }
        if (s.st === 2) rolling.push(p.pid);
      }
      if (rolling.length || resting.some(r => !r.ball.still)) {
        const list = [...rolling.map(pid => P.get(pid).ball), ...resting.map(r => r.ball)], owners = [...rolling, ...resting.map(r => r.pid)];
        const ev = stepBalls(list, course, elapsed, dt);
        for (const e of ev) if (e.e === 'ball') events.push({ e: 'clack', x: e.x, z: e.z, pid: owners[e.i] });
        for (const pid of rolling) {
          const s = P.get(pid), b = s.ball;
          if (Math.hypot(b.x - CENTER.x, b.z - CENTER.z) > GREEN_R) { b.vx *= 0.8; b.vz *= 0.8; }     // the rough grabs it
          s.rollT += dt;
          if (b.in) { score(pid, s, CHIP_IN, 'cup'); continue; }
          if (b.still || s.rollT > 6) { b.still = true; b.vx = b.vz = 0; score(pid, s, ringPoints(b.x, b.z, L.ring), 'ring'); }
        }
        for (const r of resting) { r.ball.still = r.ball.still || Math.hypot(r.ball.vx, r.ball.vz) < 0.08; }
      }
      if (players.every(p => P.get(p.pid).st === 3) || time <= 0) { over = true; events.push({ e: 'end' }); }
    },
    state() {
      const sc = {}; for (const p of players) sc[p.pid] = total(P.get(p.pid));
      const b = players.map(p => {
        const s = P.get(p.pid); let x = 0, z = 0, y = 0;
        if (s.fly) { const k = Math.min(1, s.fly.t / s.fly.T); x = s.fly.fx + (s.fly.tx - s.fly.fx) * k; z = s.fly.fz + (s.fly.tz - s.fly.fz) * k; y = 4 * s.fly.apex * k * (1 - k); }
        else if (s.ball) { x = s.ball.x; z = s.ball.z; }
        return [p.pid, r2(x), r2(z), r2(y), s.st, s.left, s.st === 0 ? Math.round(charge(s.held, L.period) * 100) : 0];
      });
      return { b, rest: resting.map(r => [r.pid, r2(r.ball.x), r2(r.ball.z)]), sc, left: Math.max(0, Math.ceil(time)) };
    },
    get over() { return over; },
    result() {
      const rows = players.map(p => { const s = P.get(p.pid); return { pid: p.pid, tot: total(s), shots: SHOTS - s.left, d: Math.round(s.sumD * 10) / 10 }; });
      // most points; a tie goes to whoever took more shots (doing nothing never ties someone trying), then the
      // nearer balls on average
      rows.sort((a, b) => b.tot - a.tot || b.shots - a.shots || a.d / Math.max(1, a.shots) - b.d / Math.max(1, b.shots));
      const order = [];
      for (const r of rows) { const g = order[order.length - 1]; if (g && g.tot === r.tot && g.shots === r.shots && g.d === r.d) g.pids.push(r.pid); else order.push({ ...r, pids: [r.pid] }); }
      return { order: order.map(o => o.pids), scores: Object.fromEntries(rows.map(r => [r.pid, r.tot])), unit: meta.unit, shots: Object.fromEntries(players.map(p => [p.pid, P.get(p.pid).pts.slice()])) };
    },
    _debug: { player: pid => P.get(pid), resting: () => resting },
  };
}
