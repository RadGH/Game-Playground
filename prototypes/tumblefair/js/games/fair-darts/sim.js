// FAIR DARTS — everyone at their own dartboard at once, nine darts each in three sets of three. Your aim is a little
// glowing ring that wanders over the board by itself and "breathes": it swings wide, then drifts in close to the
// bullseye for a moment, then swings wide again. Tap THROW at the calm moment. The dart lands where the ring was when
// you let go. Rings: gold bullseye 10, then 5, 3, 2, 1, off the board 0. The LAST set of three counts double, so the
// lead can change right at the end. Most points wins. Alone: medals.
//
// TIMING (Ring Toss / Apple Bobbing): every aim path is a fixed function of the play clock (in init, the same on the
// phone and the server). The phone sends `throw` { t } — WHEN it let go — and the server works out where the ring was
// then (toss-kit.js phoneTime checks t is not in the future and not too old).
import { phoneTime, placeOrder, r1, r2 } from '../toss-kit.js';

export const meta = {
  id: 'fair-darts', title: 'Fair Darts', blurb: 'Steady your wobbly aim and land darts on the bullseye!',
  how: ['Your aim ring wanders and breathes in and out.', 'Tap THROW when it drifts in close to the gold bullseye.', 'Bullseye 10, then 5, 3, 2, 1. The last three darts count DOUBLE!'],
  kind: 'ui', min: 1, max: 4, seconds: 54, scoring: 'points', unit: 'points', tags: ['action'], card: 'card-fair-darts', css: true,
  controls: { a: 'Throw' },
};
export const R = 50;                                   // board radius, in board units (the board is drawn 0..100 across)
export const RINGS = [{ r: 4.5, pts: 10 }, { r: 12, pts: 5 }, { r: 22, pts: 3 }, { r: 34, pts: 2 }, { r: R, pts: 1 }];
export const COUNT_S = 3, PLAY_S = 44, END_S = 3, DARTS = 9, SET = 3, COOL_S = 0.6, LAG_S = 1.0, AHEAD_S = 0.15;
export const MEDALS = [30, 55, 80];
export const LEVELS = {
  easy: { amax: 38, calm: 0.07, wb: 1.3, w: [1.1, 1.6] },
  normal: { amax: 46, calm: 0.07, wb: 1.85, w: [1.65, 2.35] },
  hard: { amax: 52, calm: 0.07, wb: 2.5, w: [2.4, 3.2] },
};
/** Where the aim ring of `path` is at play time t: [x, y] from the board's centre (board units). */
export function aimAt(path, t) {
  const A = path.a * (path.c + (1 - path.c) * Math.abs(Math.sin(path.wb * t + path.pb)));
  return [A * Math.sin(path.w1 * t + path.p1), A * Math.cos(path.w2 * t + path.p2)];
}
/** Points for a dart at (x, y) from the centre (before the double), and which ring (0 = bullseye, 5 = off the board). */
export function ringOf(x, y) { const d = Math.hypot(x, y); const i = RINGS.findIndex(q => d <= q.r); return i < 0 ? { ring: RINGS.length, pts: 0 } : { ring: i, pts: RINGS[i].pts }; }
export const isDouble = k => k >= DARTS - SET;
/** The aim path for each dart (one list per player, in seat order). */
export function makePaths(rng, n, L) {
  return Array.from({ length: n }, () => Array.from({ length: DARTS }, () => ({
    a: L.amax, c: L.calm, wb: r2(L.wb * rng.range(0.92, 1.08)), pb: r2(rng.range(0, 3.14)),
    w1: r2(L.w[0] * rng.range(0.9, 1.1)), w2: r2(L.w[1] * rng.range(0.9, 1.1)), p1: r2(rng.range(0, 6.28)), p2: r2(rng.range(0, 6.28)),
  })));
}
export const valid = d => d && typeof d === 'object' && Number.isFinite(d.t);

export function create({ rng, players, difficulty = 'normal' }) {
  const L = LEVELS[difficulty] || LEVELS.normal, pids = players.map(p => p.pid), solo = pids.length === 1;
  const paths = makePaths(rng, pids.length, L), idx = new Map(pids.map((p, i) => [p, i]));
  const S = Object.fromEntries(pids.map(p => [p, { pts: 0, n: 0, last: null, darts: [], bulls: 0 }]));
  let phase = 'count', left = COUNT_S, el = 0, over = false;
  const events = [];
  return {
    events,
    init: () => ({ paths, rings: RINGS, r: R, darts: DARTS, set: SET, cool: COOL_S, play: PLAY_S, count: COUNT_S, solo, medals: MEDALS, order: pids }),
    act(pid, a, d) {
      if (a !== 'throw' || !S[pid] || phase !== 'play' || over || !valid(d)) return;
      const s = S[pid]; if (s.n >= DARTS) return;
      const t = phoneTime(d, el, s.last, { ahead: AHEAD_S, lag: LAG_S, gap: COOL_S, max: PLAY_S });
      if (t == null) return;
      const k = s.n, [x, y] = aimAt(paths[idx.get(pid)][k], t), { ring, pts: base } = ringOf(x, y), pts = base * (isDouble(k) ? 2 : 1);
      s.n++; s.last = t; s.pts += pts; if (ring === 0) s.bulls++;
      if (k % SET === 0) s.darts = [];
      s.darts.push([r1(x), r1(y)]);
      events.push({ e: 'dart', pid, k, x: r1(x), y: r1(y), ring, pts });
    },
    step(dt) {
      if (over) return;
      if (phase === 'count') { left -= dt; if (left <= 0) { phase = 'play'; el = 0; } return; }
      if (phase === 'play') {
        el += dt;
        if (el >= PLAY_S || pids.every(p => S[p].n >= DARTS)) { phase = 'end'; left = END_S; events.push({ e: 'end' }); }
      } else { left -= dt; if (left <= 0) over = true; }
    },
    state() {
      const sc = {}, n = {}, dts = {}; for (const p of pids) { sc[p] = S[p].pts; n[p] = S[p].n; dts[p] = S[p].darts; }
      return { phase, left: phase === 'count' ? Math.max(0, Math.ceil(left)) : phase === 'end' ? 0 : Math.max(0, Math.ceil(PLAY_S - el)), el: Math.floor(el * 2) / 2, sc, n, dt: dts };
    },
    get over() { return over; },
    result() {
      const scores = Object.fromEntries(pids.map(p => [p, S[p].pts]));
      return { order: placeOrder(pids, p => S[p].pts), scores, unit: meta.unit, ...(solo ? { medal: MEDALS.filter(m => S[pids[0]].pts >= m).length } : {}) };
    },
    get _el() { return el; }, get _phase() { return phase; }, _stats: S, _paths: paths, _idx: idx, _level: L,
  };
}
/** The best moment to throw dart `path` in [from, to]: the time the ring is closest to the centre (a bot's eye). */
export function bestTime(path, from, to, step = 0.02) {
  let best = from, bd = Infinity;
  for (let t = from; t <= to; t += step) { const [x, y] = aimAt(path, t), d = Math.hypot(x, y); if (d < bd) { bd = d; best = t; } }
  return best;
}
