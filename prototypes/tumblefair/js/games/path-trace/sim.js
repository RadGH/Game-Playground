// STEADY HAND — a glowing path winds up a tall board, wide at the start and narrower and wigglier the further it
// goes. Everyone races their own dot along the SAME path at the same moment, on their own phone (the others' dots are
// see-through ghosts on yours). Drag anywhere: the dot moves with your finger, like a trackpad, so your finger never
// covers it. Touch the edge and it goes BZZT: the dot is sent back a little and frozen for half a second. Three rounds,
// each path trickier (narrower, more wiggles, tighter pinches). A round: first to the top 5 points, then 3 / 2 / 1,
// +2 for a clean run (no buzz), +1 for every 3 s left on the clock; anyone still on the path at the bell gets up to
// 3 points for how far they got. Most points after three paths wins. Solo: medals at 15 / 22 / 28.
//
// TIMING (the Dirt Dash way): one pure `advance` moves a dot one 50 ms tick, on the server AND on the player's phone.
// The phone sends the finger's movement for each tick (`tr` { k, d: [[dx, dy], …] }, rounded to 0.1); the server plays
// them in tick order (k up to AHEAD_T ahead of its own clock), so both sides land on exactly the same dot, the phone
// answers at once, and a finish is timed by the tick it happened on. A quiet phone is carried on (standing still) once
// it is LAG_T ticks behind. The phone rolls back to the server's dot (`priv`) if they ever disagree.
import { placeOrder, r1 } from '../toss-kit.js';

export const meta = {
  id: 'path-trace', title: 'Steady Hand', blurb: 'Guide your dot up the winding path without touching the edge — fastest steady hand wins!',
  how: ['Drag anywhere: your dot moves with your finger.', 'Stay on the glowing path to the top. Touch the edge = BZZT, sent back!', 'First up wins the round. Three paths, each one trickier.'],
  kind: 'ui', min: 1, max: 4, seconds: 70, scoring: 'points', unit: 'points', tags: ['action'], card: 'card-path-trace', css: true,
  controls: { a: 'Trace' },
};
export const BW = 100, BH = 150, DT = 0.05, STEP = 2.2;
export const COUNT_S = 3, SHOW_S = 1.6, DONE_S = 2.4, AHEAD_T = 3, LAG_T = 24;
export const ROUNDS = [
  { legs: 5, w0: 9, w1: 5.2, wig: 1, pinch: 1, limit: 16 },
  { legs: 6, w0: 7.6, w1: 4.2, wig: 2, pinch: 2, limit: 16 },
  { legs: 7, w0: 6.6, w1: 3.4, wig: 3, pinch: 3, limit: 18 },
];
export const LEVELS = {
  easy: { width: 1.2, vmax: 58, back: 5, freeze: 8 },
  normal: { width: 1, vmax: 54, back: 7, freeze: 10 },
  hard: { width: 0.86, vmax: 50, back: 9, freeze: 12 },
};
export const PTS = { place: [5, 3, 2, 1], clean: 2, perSecs: 3, partial: 3 };
export const MEDALS = [15, 22, 28];

/** One path's recipe from the seed: control points zig-zagging up the board, wiggle stretches and pinches. Small, so
 *  it goes in init and each phone builds the same path with buildPath. */
export function makeSpec(rng, round) {
  const R = ROUNDS[round], c = [[50, BH - 8]];
  let side = rng.chance(0.5) ? -1 : 1;
  for (let i = 1; i <= R.legs; i++) {
    const y = BH - 8 - (BH - 20) * i / R.legs, x = i === R.legs ? 50 : 50 + side * rng.range(22, 38);
    c.push([r1(x), r1(y)]); side = -side;
  }
  const wig = [], pinch = [];
  for (let i = 0; i < R.wig; i++) { const s = r1(0.2 + 0.6 * (i + rng()) / R.wig); wig.push([s, r1(s + rng.range(0.08, 0.14)), r1(rng.range(2.2, 3.6)), r1(rng.range(0.9, 1.4))]); }
  for (let i = 0; i < R.pinch; i++) pinch.push([r1(0.25 + 0.65 * (i + rng()) / R.pinch), r1(rng.range(0.04, 0.07))]);
  return { c, w0: R.w0, w1: R.w1, wig, pinch };
}
/** The path: points every STEP units along a smooth curve through the control points, wiggles added along the
 *  normal, and each point's half-width (narrowing from w0 to w1, dipping at a pinch). */
export function buildPath(spec, L = LEVELS.normal) {
  const c = spec.c, dense = [];
  const cr = (p0, p1, p2, p3, t) => 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
  for (let i = 0; i < c.length - 1; i++) {
    const p0 = c[Math.max(0, i - 1)], p1 = c[i], p2 = c[i + 1], p3 = c[Math.min(c.length - 1, i + 2)];
    for (let j = 0; j < 40; j++) { const t = j / 40; dense.push([cr(p0[0], p1[0], p2[0], p3[0], t), cr(p0[1], p1[1], p2[1], p3[1], t)]); }
  }
  dense.push(c[c.length - 1].slice());
  // resample by arc length
  const pts = [dense[0]]; let acc = 0;
  for (let i = 1; i < dense.length; i++) {
    let [ax, ay] = dense[i - 1]; const [bx, by] = dense[i]; let seg = Math.hypot(bx - ax, by - ay);
    while (acc + seg >= STEP) { const u = (STEP - acc) / seg; ax += (bx - ax) * u; ay += (by - ay) * u; pts.push([ax, ay]); seg = Math.hypot(bx - ax, by - ay); acc = 0; }
    acc += seg;
  }
  pts.push(dense[dense.length - 1]);
  const n = pts.length, out = [], w = [];
  for (let i = 0; i < n; i++) {
    const s = i / (n - 1), a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], tx = b[0] - a[0], ty = b[1] - a[1], tl = Math.hypot(tx, ty) || 1;
    let off = 0;
    for (const [s0, s1, amp, f] of spec.wig) if (s > s0 && s < s1) { const u = (s - s0) / (s1 - s0); off += Math.sin(u * Math.PI) * amp * Math.sin((s - s0) * (n - 1) * STEP * 2 * Math.PI / (12 * f)); }
    out.push([Math.max(3, Math.min(BW - 3, pts[i][0] - ty / tl * off)), Math.max(3, Math.min(BH - 3, pts[i][1] + tx / tl * off))]);
    let half = (spec.w0 + (spec.w1 - spec.w0) * s) * L.width;
    for (const [ps, pl] of spec.pinch) { const d = Math.abs(s - ps) / pl; if (d < 1) half *= 1 - 0.32 * (1 - d * d); }
    w.push(Math.max(2.4, half));
  }
  return { pts: out, w, n };
}
/** How far (in points along the path) and how far off the middle (x, y) is, looking only near point `from`. */
export function nearest(path, x, y, from, ahead) {
  let best = -1, bd = Infinity;
  const i0 = Math.max(0, from - 3), i1 = Math.min(path.n - 2, from + ahead);
  for (let i = i0; i <= i1; i++) {
    const [ax, ay] = path.pts[i], [bx, by] = path.pts[i + 1], ex = bx - ax, ey = by - ay, L2 = ex * ex + ey * ey || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / L2)), d = Math.hypot(x - ax - ex * t, y - ay - ey * t);
    if (d < bd) { bd = d; best = t > 0.5 ? i + 1 : i; }
  }
  return { i: best, d: bd };
}
export const newTracer = path => ({ x: path.pts[0][0], y: path.pts[0][1], prog: 0, buzz: 0, frz: 0, done: -1, k: 0 });
/** One 50 ms tick of a dot: move by the finger's (dx, dy) (no faster than vmax), stay on the path or BZZT. Returns an
 *  event or null. Pure: the server and the phone both run it. */
export function advance(tr, dx, dy, path, L = LEVELS.normal) {
  const k = tr.k++;
  if (tr.done >= 0) return null;
  if (tr.frz > 0) { tr.frz--; return null; }
  let len = Math.hypot(dx, dy); const max = L.vmax * DT;
  if (len > max) { dx *= max / len; dy *= max / len; len = max; }
  if (len < 1e-9) return null;
  const nx = tr.x + dx, ny = tr.y + dy, ahead = Math.ceil(len / STEP) + 3;
  const mid = nearest(path, tr.x + dx / 2, tr.y + dy / 2, tr.prog, ahead), end = nearest(path, nx, ny, tr.prog, ahead);
  if (mid.d > path.w[mid.i] || end.d > path.w[end.i]) {
    tr.buzz++; tr.frz = L.freeze; tr.prog = Math.max(0, Math.min(tr.prog, end.i) - L.back);
    tr.x = path.pts[tr.prog][0]; tr.y = path.pts[tr.prog][1];
    return { e: 'buzz', k, x: r1(nx), y: r1(ny) };
  }
  tr.x = nx; tr.y = ny; if (end.i > tr.prog) tr.prog = end.i;
  if (tr.prog >= path.n - 2) { tr.done = k; return { e: 'finish', k }; }
  return null;
}

export function create({ rng, players, difficulty = 'normal' }) {
  const L = LEVELS[difficulty] || LEVELS.normal, pids = players.map(p => p.pid), solo = pids.length === 1;
  const specs = ROUNDS.map((_, i) => makeSpec(rng, i)), paths = specs.map(s => buildPath(s, L));
  const total = Object.fromEntries(pids.map(p => [p, 0])), rows = Object.fromEntries(pids.map(p => [p, []]));
  let phase = 'count', round = -1, left = COUNT_S, el = 0, tick = 0, over = false, T = null, places = 0, lastK = -1;
  const events = [];
  function startRound() {
    round++; phase = 'show'; left = SHOW_S; tick = 0; places = 0; lastK = -1;
    T = new Map(pids.map(p => [p, newTracer(paths[round])]));
    events.push({ e: 'round', r: round });
  }
  const limitT = () => Math.round(ROUNDS[round].limit / DT);
  function play(pid, tr, dx, dy) {
    const ev = advance(tr, dx, dy, paths[round], L);
    if (!ev) return;
    if (ev.e === 'finish') {
      // two dots on the same tick share the place
      if (ev.k !== lastK) { places = Object.values(rows).filter(r => r[round]?.fin).length; lastK = ev.k; }
      const place = places, pts = (solo ? PTS.place[0] : PTS.place[place] || 0) + (tr.buzz ? 0 : PTS.clean) + Math.floor((limitT() - ev.k) * DT / PTS.perSecs);
      rows[pid][round] = { fin: true, place: place + 1, pts, buzz: tr.buzz, t: Math.round(ev.k * DT * 10) / 10 };
      total[pid] += pts; ev.place = place + 1; ev.pts = pts; ev.clean = !tr.buzz;
    }
    events.push({ ...ev, pid });
  }
  function endRound() {
    for (const [pid, tr] of T) if (!rows[pid][round]) { const pts = Math.min(PTS.partial, Math.floor(tr.prog / (paths[round].n - 1) * (PTS.partial + 1))); rows[pid][round] = { fin: false, pts, buzz: tr.buzz, prog: Math.round(tr.prog / (paths[round].n - 1) * 100) }; total[pid] += pts; }
    phase = 'done'; left = DONE_S; events.push({ e: 'roundEnd', r: round, rows: Object.fromEntries(pids.map(p => [p, rows[p][round]])) });
  }
  return {
    events,
    init: () => ({ specs, rounds: ROUNDS, level: L, bw: BW, bh: BH, pts: PTS, solo, medals: MEDALS, ahead: AHEAD_T }),
    act(pid, a, d) {
      if (a !== 'tr' || phase !== 'go' || over || !T?.has(pid) || !d || typeof d !== 'object' || !Array.isArray(d.d) || d.d.length > 8) return;
      const tr = T.get(pid), k0 = Math.floor(+d.k); if (!Number.isFinite(k0) || k0 < 0) return;
      for (let i = 0; i < d.d.length; i++) {
        const k = k0 + i, q = d.d[i]; if (k < tr.k) continue; if (k > tick + AHEAD_T || k >= limitT()) break;
        if (!Array.isArray(q) || !q.every(v => typeof v === 'number' && Number.isFinite(v))) return;
        while (tr.k < k) play(pid, tr, 0, 0);                  // (a gap: those ticks stood still)
        play(pid, tr, Math.round(q[0] * 10) / 10, Math.round(q[1] * 10) / 10);
      }
    },
    step(dt) {
      if (over) return;
      el += dt;
      if (phase === 'count' || phase === 'show' || phase === 'done') {
        left -= dt;
        if (left > 1e-9) return;
        if (phase === 'count') return startRound();
        if (phase === 'show') { phase = 'go'; tick = 0; events.push({ e: 'go', r: round }); return; }
        if (round + 1 < ROUNDS.length) return startRound();
        over = true; return;
      }
      tick++;
      for (const [pid, tr] of T) while (tr.k < Math.min(tick - LAG_T, limitT())) play(pid, tr, 0, 0);
      if (tick >= limitT() || [...T.values()].every(tr => tr.done >= 0)) endRound();
    },
    state() {
      const g = { phase, r: round, el: r1(el), tick, left: phase === 'go' ? Math.max(0, Math.ceil(ROUNDS[round].limit - tick * DT)) : Math.max(0, Math.ceil(left)), sc: { ...total } };
      // each dot: [x, y, progress %, buzzes, place (0 = still going)]
      if (T) g.d = Object.fromEntries([...T].map(([pid, tr]) => [pid, [r1(tr.x), r1(tr.y), Math.round(tr.prog / (paths[round].n - 1) * 100), tr.buzz, rows[pid][round]?.place || 0]]));
      return g;
    },
    /** The player's own dot, exactly (the phone rolls back to it if its own simulation disagrees). */
    priv(pid) { const tr = T?.get(pid); return tr && phase === 'go' ? { r: round, tr: { ...tr } } : null; },
    get over() { return over; },
    result() {
      const scores = { ...total };
      const r = { order: placeOrder(pids, p => scores[p] * 1000 - rows[p].reduce((n, x) => n + (x?.buzz || 0), 0)), scores, unit: meta.unit };
      if (solo) r.medal = MEDALS.filter(m => scores[pids[0]] >= m).length;
      return r;
    },
    get _phase() { return phase; }, get _round() { return round; }, get _tick() { return tick; }, get _T() { return T; }, _paths: paths, _rows: rows, _level: L,
  };
}

/** A tracer bot (tests, UI bots): the finger movement for one tick that heads for the middle of the path `look` points
 *  ahead at `speed` units a second, plus `wobble` (a random shake). Returns [dx, dy]. */
export function traceStep(path, tr, { speed = 50, look = 3, wobble = 0, rnd = () => 0.5 } = {}) {
  const j = Math.min(path.n - 1, tr.prog + look), [tx, ty2] = path.pts[j], dx = tx - tr.x, dy = ty2 - tr.y, d = Math.hypot(dx, dy) || 1, v = Math.min(d, speed * DT);
  return [Math.round((dx / d * v + (rnd() * 2 - 1) * wobble) * 10) / 10, Math.round((dy / d * v + (rnd() * 2 - 1) * wobble) * 10) / 10];
}
