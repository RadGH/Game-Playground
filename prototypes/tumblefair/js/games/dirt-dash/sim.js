// DIRT DASH — a side-on dirt-bike race. Everyone rides the SAME bumpy track at once, each in their own lane (the other
// riders show as see-through ghosts in yours). Two buttons:
//   GAS   go faster. While you speed up the front wheel lifts — lift it too far and you flip over backwards.
//   LEAN  push the nose down (tap it to keep the front wheel on the dirt).
// In the AIR, GAS spins you backwards and LEAN spins you forwards: land with the bike level with the ground (or you
// crash for a second) and every full turn is a FLIP. A wheelie held on the ground scores too. Score = distance
// (1 point every 10 m) + tricks + a bonus for finishing first, second, third.
//
// NETCODE (why this game ticks the way it does): a bike is simulated in fixed 50 ms ticks by ONE pure function
// (stepBike), on the server and on the rider's own phone. The phone sends what its buttons were at each tick
// (`in` { k: tick, g, l }, on every change and every 4 ticks). The server only simulates a bike up to the newest tick
// it has heard from that phone, so it applies every press on exactly the tick the phone pressed it, and the two
// agree to the centimetre; a phone that goes quiet is carried on with its last buttons once it is LAG_T ticks behind.
// The phone draws its own bike from its own simulation and rolls back to the server's if they ever disagree.
import { placeOrder, r2 } from '../toss-kit.js';

export const meta = {
  id: 'dirt-dash', title: 'Dirt Dash', blurb: 'Race your dirt bike over the jumps, flip in the air and land it!',
  how: ['Hold GAS to go. The front lifts as you speed up: tap LEAN to keep it down.', 'In the air, GAS flips you back and LEAN flips you forward.', 'Land level with the ground or you crash! Flips, wheelies and distance all score.'],
  kind: 'ui', min: 1, max: 4, seconds: 62, scoring: 'points', unit: 'points', tags: ['action'], card: 'card-dirt-dash', css: true,
  controls: { a: 'Gas', b: 'Lean' },
};
export const DT = 0.05, TRACK = 500, STEP = 0.5, COUNT_S = 3, PLAY_S = 52, END_S = 3, LAG_T = 24, AHEAD_T = 3;
export const BIKE = { acc: 7.2, coast: 2.4, vmax: 17, grav: 9.8, lift: 0.62, drop: 2.4, push: 3.4, loop: 1.12, spin: 5.6, follow: 14, land: 0.6, perfect: 0.16, crash: 1.2 };
export const PTS = { flip: 10, front: 12, perfect: 2, air: 3, wheelie: 3, finish: [12, 7, 4, 2] };
export const LEVELS = { easy: { land: 1.2, lift: 0.85, ramp: 0.85 }, normal: { land: 1, lift: 1, ramp: 1 }, hard: { land: 0.85, lift: 1.12, ramp: 1.15 } };

/** The track's features from the seed: [{ k, x, ... }] (start flat 22 m, finish flat 30 m). */
export function makeFeatures(rng, L) {
  const out = []; let x = 22;
  while (x < TRACK - 40) {
    const r = rng(), f = r < 0.36 ? { k: 'kicker', len: 7, h: r2(rng.range(2.2, 3.2) * L.ramp), down: r2(rng.range(16, 22)) }
      : r < 0.52 ? { k: 'big', len: 9, h: r2(rng.range(3.4, 4.4) * L.ramp), down: r2(rng.range(22, 28)) }
      : r < 0.7 ? { k: 'whoops', n: rng.int(4, 6), amp: r2(rng.range(0.45, 0.7) * L.ramp), per: r2(rng.range(3, 3.8)) }
      : r < 0.85 ? { k: 'hill', len: r2(rng.range(22, 30)), h: r2(rng.range(3, 5)) }
      : { k: 'flat', len: r2(rng.range(8, 16)) };
    f.x = r2(x); out.push(f);
    x += (f.k === 'kicker' || f.k === 'big' ? f.len + f.down : f.k === 'whoops' ? f.n * f.per : f.len) + r2(rng.range(5, 12));
  }
  return out;
}
/** Ground heights every STEP metres (a little past the finish). */
export function buildTrack(features) {
  const n = Math.ceil((TRACK + 60) / STEP), H = new Float32Array(n + 1);
  for (const f of features) for (let i = 0; i <= n; i++) {
    const u = i * STEP - f.x; let h = null;
    if (f.k === 'kicker' || f.k === 'big') { if (u >= 0 && u <= f.len) h = f.h * (u / f.len) ** 1.35; else if (u > f.len && u <= f.len + f.down) h = f.h * (1 - (u - f.len) / f.down) ** 1.6 * 0.92; }
    else if (f.k === 'whoops') { if (u >= 0 && u <= f.n * f.per) h = f.amp * (1 - Math.cos(u / f.per * Math.PI * 2)) / 2 * 2; }
    else if (f.k === 'hill') { if (u >= 0 && u <= f.len) h = f.h * (1 - Math.cos(u / f.len * Math.PI * 2)) / 2; }
    if (h != null) H[i] = Math.max(H[i], h);
  }
  return H;
}
export function groundAt(H, x) { const f = Math.max(0, x) / STEP, i = Math.min(H.length - 2, Math.floor(f)), t = Math.min(1, f - i); return H[i] + (H[i + 1] - H[i]) * t; }
export function slopeAt(H, x) { return Math.atan2(groundAt(H, x + 0.25) - groundAt(H, x - 0.25), 0.5); }
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
export const newBike = () => ({ x: 2, y: 0, vx: 0, vy: 0, v: 0, ang: 0, av: 0, rot: 0, air: false, airT: 0, w: 0, wt: 0, crash: 0, done: false, pts: 0, flips: 0, crashes: 0 });
/** One 50 ms tick of a bike. inp = { g: 0|1, l: 0|1 }. Returns the tick's happenings: [{ e, pts?, ... }]. */
export function stepBike(b, inp, H, L = LEVELS.normal, dt = DT) {
  const out = [], gas = !!inp?.g, lean = !!inp?.l, B = BIKE;
  if (b.done) { b.v = Math.max(0, b.v - 6 * dt); b.x += b.v * dt; b.y = groundAt(H, b.x); b.ang = slopeAt(H, b.x); return out; }
  if (b.crash > 0) { b.crash -= dt; b.v = 0; b.vx = b.vy = 0; b.y = groundAt(H, b.x); b.ang = slopeAt(H, b.x); if (b.crash <= 0) { b.crash = 0; b.w = 0; } return out; }
  if (!b.air) {
    const s = Math.atan2(groundAt(H, b.x) - groundAt(H, b.x - 0.6), 0.6);   // the slope we are riding up (behind the wheel), so a lip launches us
    const was = b.v;
    b.v += ((gas ? B.acc : -B.coast) - B.grav * Math.sin(s) * 0.55) * dt; b.v = Math.max(0, Math.min(B.vmax, b.v));
    // the wheelie: speeding up lifts the front; no gas lets it drop; LEAN pushes it down
    if (gas && b.v > was + 1e-6) b.w += B.lift * L.lift * dt * (0.6 + b.v / B.vmax);
    if (!gas) b.w -= B.drop * dt; if (lean) b.w -= B.push * dt; b.w = Math.max(0, b.w);
    if (b.w > B.loop) { crash(b, out, 'loop'); return out; }
    if (b.w > 0.3) b.wt += dt; else if (b.wt) { if (b.wt >= 0.6) { const p = Math.round(b.wt * PTS.wheelie); b.pts += p; out.push({ e: 'wheelie', pts: p }); } b.wt = 0; }
    const vx = b.v * Math.cos(s), vy = b.v * Math.sin(s), nx = b.x + vx * dt, ny = b.y + vy * dt, gNext = groundAt(H, nx);
    if (gNext < ny - 0.06 && b.v > 4) { b.air = true; b.airT = 0; b.vx = vx; b.vy = vy; b.av = 0; b.rot = 0; b.x = nx; b.y = ny; b.ang = s + b.w; if (b.wt >= 0.6) { const p = Math.round(b.wt * PTS.wheelie); b.pts += p; out.push({ e: 'wheelie', pts: p }); } b.wt = 0; b.w = 0; out.push({ e: 'jump' }); }
    else { b.x = nx; b.y = gNext; b.ang = slopeAt(H, b.x) + b.w; }
  } else {
    b.vy -= B.grav * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.airT += dt;
    const want = gas ? B.spin : lean ? -B.spin : 0; b.av += (want - b.av) * Math.min(1, B.follow * dt);
    b.ang += b.av * dt; b.rot += b.av * dt;
    const gy = groundAt(H, b.x);
    if (b.y <= gy) {
      const s = slopeAt(H, b.x), diff = Math.abs(wrap(b.ang - s));
      b.y = gy; b.air = false;
      if (diff > B.land * L.land) { crash(b, out, 'land'); return out; }
      let pts = 0; const turns = Math.round((b.ang - s) / (Math.PI * 2)), flips = Math.abs(turns), front = turns < 0;   // whole turns since take-off (ang keeps counting in the air)
      if (flips) pts += flips * (front ? PTS.front : PTS.flip);
      if (b.airT >= 1) pts += PTS.air;
      const perfect = diff < B.perfect; if (perfect && (flips || b.airT >= 0.6)) pts += PTS.perfect;
      b.flips += flips; b.pts += pts;
      b.v = Math.max(3, (b.vx * Math.cos(s) + b.vy * Math.sin(s)) * (perfect ? 1 : 0.92)); b.ang = s; b.w = 0; b.av = 0;
      out.push({ e: 'land', flips, front, perfect, pts, air: r2(b.airT) });
    }
  }
  if (b.x >= TRACK && !b.done) { b.done = true; out.push({ e: 'finish' }); }
  return out;
}
function crash(b, out, why) { b.crash = BIKE.crash; b.air = false; b.v = 0; b.vx = b.vy = 0; b.w = 0; b.wt = 0; b.av = 0; b.crashes++; out.push({ e: 'crash', why }); }
/** A bike as a state row: [x, y, ang, flags (1 air, 2 crash, 4 done, 8 wheelie), tick done, v]. */
export const packBike = (b, k) => [r2(b.x), r2(b.y), r2(b.ang), (b.air ? 1 : 0) | (b.crash > 0 ? 2 : 0) | (b.done ? 4 : 0) | (b.w > 0.3 ? 8 : 0), k, r2(b.v)];
export const distPts = b => Math.floor(Math.min(TRACK, b.x) / 10);

export function create({ rng, players, difficulty = 'normal' }) {
  const L = LEVELS[difficulty] || LEVELS.normal, pids = players.map(p => p.pid), solo = pids.length === 1;
  const features = makeFeatures(rng, L), H = buildTrack(features);
  const R = new Map(pids.map(p => [p, { b: newBike(), k: 0, heard: -1, inp: { g: 0, l: 0 }, queue: [], place: 0, bonus: 0 }]));
  let phase = 'count', left = COUNT_S, el = 0, tick = 0, over = false, finished = 0;
  const events = [];
  const score = r => r.b.pts + distPts(r.b) + r.bonus;
  function advance(pid, r, to) {
    while (r.k < to) {
      while (r.queue.length && r.queue[0].k <= r.k) { const q = r.queue.shift(); r.inp = { g: q.g, l: q.l }; }
      for (const ev of stepBike(r.b, r.inp, H, L)) {
        if (ev.e === 'finish') { r.place = ++finished; r.bonus = PTS.finish[r.place - 1] || 0; ev.place = r.place; ev.pts = r.bonus; }
        events.push({ ...ev, pid, k: r.k, x: r2(r.b.x) });
      }
      r.k++;
    }
  }
  return {
    events,
    init: () => ({ features, track: TRACK, step: STEP, bike: BIKE, pts: PTS, level: L, play: PLAY_S, count: COUNT_S, solo, lagT: LAG_T }),
    act(pid, a, d) {
      const r = R.get(pid); if (a !== 'in' || !r || phase !== 'play' || over || !d || typeof d !== 'object') return;
      const k = Math.floor(+d.k); if (!Number.isFinite(k) || k < 0 || k > tick + AHEAD_T) return;
      const q = { k: Math.max(k, r.k), g: d.g ? 1 : 0, l: d.l ? 1 : 0 };
      r.queue = r.queue.filter(x => x.k <= q.k); r.queue.push(q); r.queue.sort((x, y) => x.k - y.k);
      r.heard = Math.max(r.heard, k);
    },
    step(dt) {
      if (over) return;
      if (phase === 'count') { left -= dt; if (left <= 0) { phase = 'play'; el = 0; tick = 0; } return; }
      if (phase === 'end') { left -= dt; if (left <= 0) over = true; return; }
      el += dt; tick++;
      for (const [pid, r] of R) advance(pid, r, Math.max(Math.min(tick, r.heard + 1), tick - LAG_T));
      if (el >= PLAY_S || [...R.values()].every(r => r.b.done)) {
        for (const [pid, r] of R) advance(pid, r, tick);
        phase = 'end'; left = END_S; events.push({ e: 'end' });
      }
    },
    state() {
      const sc = {}, bk = {}; for (const [pid, r] of R) { sc[pid] = score(r); bk[pid] = packBike(r.b, r.k); }
      return { phase, left: phase === 'count' ? Math.max(0, Math.ceil(left)) : phase === 'end' ? 0 : Math.max(0, Math.ceil(PLAY_S - el)), el: r2(el), sc, bk };
    },
    /** The rider's own bike, exactly (the phone rolls back to it when its own simulation disagrees). */
    priv(pid) { const r = R.get(pid); return r && phase === 'play' ? { k: r.k, b: r.b } : null; },
    get over() { return over; },
    result() {
      const scores = Object.fromEntries(pids.map(p => [p, score(R.get(p))]));
      return { order: placeOrder(pids, p => scores[p]), scores, unit: meta.unit, ...(solo ? { medal: [60, 110, 170].filter(m => scores[pids[0]] >= m).length } : {}) };
    },
    get _el() { return el; }, get _tick() { return tick; }, get _phase() { return phase; }, _R: R, _H: H, _features: features, _level: L,
  };
}
