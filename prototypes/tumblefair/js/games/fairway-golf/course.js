// FAIRWAY GOLF — the course: 18 hand-made holes and the geometry every other file reads. Pure (no DOM, no
// Math.random): the server builds a hole from it, the tests build it, and the browser draws the SAME layout object the
// server measured lies on (init() sends it), so a ball that looks like it is in the bunker IS in the bunker.
//
// Units: yards. Axes: x across (+ = right, looking from the tee), y down the hole (+ = toward the green). The tee is at
// (0, 0). The browser maps (x, y) to the scene as (x * S, -y * S).
//
// A hole template:
//   n, name, par
//   c:      control points of the hole's centre line, tee first; smoothed (Chaikin) and cut into short steps.
//           It runs ~20 yards past the green so there is rough behind it.
//   fw:     fairway spans [s0, s1, halfWidth] in yards ALONG the centre line (s1 < 0 = that far short of the
//           green's centre). Distance is to the clipped line, so a fairway has round ends.
//   rw, ow: rough half width (default 40) and the edge of the woods (default rw + 22); past ow is out of bounds.
//   green:  [x, y, rx, ry, rot]  an ellipse (rx across, ry along, rot radians anticlockwise); the fringe is 2.5 yd more.
//   pins:   [[dx, dy], ...] cup offsets from the green's centre (in the green's own frame); the course seed picks one.
//   slope:  [gx, gy] how the green tilts (yd/s² of push on a rolling ball, scaled by the difficulty).
//   bunkers, water: [[x, y, rx, ry, rot], ...] ellipses.   creeks: [{ pts: [[x, y], ...], w }] (w = half width).
//   trees:  [[x, y, R], ...] extra clumps of trees (radius R) besides the ones that line the woods.
//   wind:   optional multiplier (an exposed hole is windier).
//
// lieAt(H, x, y) answers what the ball is lying on, in this priority (the drawing stacks the same way):
//   green > fringe > sand > water > tee > fairway > rough > woods > oob
import { makeRng } from '../../shared/rng.js';

export const FRINGE = 2.5;
export const LIES = ['tee', 'fairway', 'rough', 'woods', 'sand', 'fringe', 'green', 'water', 'oob'];
export const LIE_NAME = { tee: 'Tee', fairway: 'Fairway', rough: 'Rough', woods: 'Trees', sand: 'Bunker', fringe: 'Fringe', green: 'Green', water: 'Water', oob: 'Out of bounds' };
export const TEE_BOX = { x0: -8, x1: 8, y0: -6, y1: 3 };

export const HOLES = [
  { n: 1, name: 'Opening Drive', par: 4, c: [[0, 0], [0, 200], [-6, 300], [-8, 385], [-8, 410]], fw: [[40, -14, 20]],
    green: [-8, 385, 14, 16, 0], pins: [[0, 0], [4, 6], [-5, -5]], slope: [0.2, -0.15],
    bunkers: [[-31, 235, 8, 14, 0.1], [10, 372, 6, 9, 0], [-25, 393, 6, 8, 0]] },
  { n: 2, name: 'Willow Pond', par: 3, c: [[0, 0], [3, 155], [3, 178]], fw: [[110, -11, 14]],
    green: [3, 155, 13, 12, 0], pins: [[0, 0], [5, -3], [-4, 3]], slope: [-0.25, 0.1],
    water: [[18, 138, 11, 9, 0.3]], bunkers: [[-12, 162, 5, 7, 0]] },
  { n: 3, name: 'Long Meadow', par: 5, c: [[0, 0], [0, 230], [18, 360], [30, 525], [30, 550]], fw: [[40, 262, 22], [292, -15, 18]],
    green: [30, 525, 13, 17, 0.1], pins: [[0, 0], [-3, 7], [4, -6]], slope: [-0.15, -0.3],
    creeks: [{ pts: [[-70, 279], [0, 276], [40, 284], [100, 280]], w: 4 }],
    bunkers: [[-19, 215, 7, 10, 0], [43, 505, 6, 9, 0], [18, 540, 6, 6, 0]] },
  { n: 4, name: "Hawk's Bend", par: 4, c: [[0, 0], [0, 220], [-60, 300], [-110, 370], [-122, 388]], fw: [[45, -14, 20]],
    green: [-110, 370, 13, 15, 0.6], pins: [[0, 0], [3, 5], [-4, -4]], slope: [0.2, 0.2],
    trees: [[-38, 218, 14]], bunkers: [[19, 235, 8, 12, 0], [-93, 362, 5, 8, 0.6]] },
  { n: 5, name: 'Short Shot', par: 3, c: [[0, 0], [-4, 135], [-4, 155]], fw: [[95, -10, 12]],
    green: [-4, 135, 11, 11, 0], pins: [[0, 0], [3, -3], [-3, 3]], slope: [0.3, 0],
    bunkers: [[-18, 132, 5, 8, 0], [10, 138, 5, 8, 0], [-4, 150, 8, 4, 0]] },
  { n: 6, name: 'Ridge Run', par: 4, c: [[0, 0], [5, 180], [0, 360], [0, 385]], fw: [[40, 190, 22], [190, 280, 13], [280, -13, 17]],
    green: [0, 360, 12, 14, 0], pins: [[0, 0], [-3, 5], [4, -4]], slope: [0, -0.35],
    bunkers: [[-23, 225, 7, 12, 0], [20, 240, 7, 12, 0], [14, 350, 5, 7, 0]] },
  { n: 7, name: 'Lakeside', par: 5, c: [[0, 0], [10, 260], [0, 420], [-10, 540], [-10, 565]], fw: [[40, -15, 21]],
    green: [-10, 540, 14, 16, 0], pins: [[0, 0], [5, 4], [-4, -6]], slope: [0.25, -0.1],
    water: [[-56, 300, 20, 170, 0], [-32, 516, 10, 9, 0]], bunkers: [[31, 270, 8, 12, 0], [9, 556, 6, 6, 0]] },
  { n: 8, name: 'The Island', par: 3, c: [[0, 0], [0, 145], [0, 165]], fw: [],
    green: [0, 145, 11, 10, 0], pins: [[0, 0], [3, 2], [-3, -2]], slope: [0.15, 0.2],
    water: [[0, 140, 25, 23, 0]] },
  { n: 9, name: 'Home Stretch', par: 4, c: [[0, 0], [-8, 250], [0, 420], [0, 445]], fw: [[40, 366, 21], [389, -14, 15]],
    green: [0, 420, 14, 15, 0], pins: [[0, 0], [-4, 5], [5, -3]], slope: [-0.2, -0.2],
    creeks: [{ pts: [[-80, 378], [0, 382], [80, 376]], w: 4 }], bunkers: [[-29, 245, 8, 12, 0.1], [17, 430, 5, 8, 0]] },
  { n: 10, name: 'Birch Corner', par: 4, c: [[0, 0], [0, 210], [55, 290], [95, 375], [102, 395]], fw: [[45, -14, 20]],
    green: [95, 375, 13, 14, -0.45], pins: [[0, 0], [-3, 5], [4, -4]], slope: [-0.2, 0.15],
    trees: [[36, 205, 13]], bunkers: [[-20, 235, 8, 12, 0], [111, 365, 5, 8, -0.45]] },
  { n: 11, name: 'Sandy Hollow', par: 3, c: [[0, 0], [6, 185], [6, 205]], fw: [[115, 138, 14], [165, -15, 14]],
    green: [6, 185, 14, 15, 0], pins: [[0, 0], [4, 6], [-5, -4]], slope: [-0.3, -0.1],
    bunkers: [[4, 152, 20, 8, 0.05], [23, 192, 5, 7, 0]] },
  { n: 12, name: 'Twin Ponds', par: 4, c: [[0, 0], [0, 345], [0, 370]], fw: [[40, -13, 20]],
    green: [0, 345, 12, 13, 0], pins: [[0, 0], [3, 4], [-4, -3]], slope: [0.2, -0.25],
    water: [[-24, 235, 13, 20, 0], [26, 252, 13, 20, 0]], bunkers: [[13, 356, 5, 7, 0]] },
  { n: 13, name: 'Big Sky', par: 5, c: [[0, 0], [-5, 280], [5, 560], [5, 585]], fw: [[40, -15, 26]], wind: 1.4,
    green: [5, 560, 14, 17, 0], pins: [[0, 0], [-4, 6], [5, -5]], slope: [-0.2, -0.2],
    bunkers: [[-32, 270, 9, 13, 0], [27, 300, 8, 12, 0], [-15, 470, 8, 8, 0], [21, 548, 6, 8, 0], [-10, 576, 7, 4, 0]] },
  { n: 14, name: 'Narrow Gate', par: 4, c: [[0, 0], [0, 330], [0, 350]], fw: [[40, -12, 14]], rw: 26, ow: 46,
    green: [0, 330, 11, 12, 0], pins: [[0, 0], [3, -3], [-3, 3]], slope: [0.3, 0.1],
    bunkers: [[-16, 320, 5, 8, 0], [15, 338, 5, 7, 0]] },
  { n: 15, name: 'Clifftop', par: 3, c: [[0, 0], [-6, 200], [-6, 222]], fw: [[140, -15, 15]], wind: 1.3,
    green: [-6, 200, 13, 15, 0], pins: [[0, 0], [4, 5], [-4, -5]], slope: [0.2, -0.3],
    bunkers: [[-25, 195, 6, 10, 0], [-22, 176, 6, 6, 0]] },
  { n: 16, name: 'S-Bend', par: 5, c: [[0, 0], [0, 200], [-40, 290], [-40, 380], [0, 470], [0, 505], [0, 528]], fw: [[40, 314, 20], [352, -14, 18]],
    green: [0, 505, 13, 15, 0], pins: [[0, 0], [3, 5], [-4, -4]], slope: [-0.25, 0.15],
    creeks: [{ pts: [[-120, 332], [-40, 334], [40, 328]], w: 4 }], trees: [[24, 312, 11]], bunkers: [[-62, 250, 7, 10, 0.4], [17, 495, 5, 8, 0]] },
  { n: 17, name: 'Lighthouse', par: 3, c: [[0, 0], [0, 165], [0, 185]], fw: [[110, -12, 13]],
    green: [0, 165, 12, 13, 0], pins: [[0, 0], [-4, 4], [3, -4]], slope: [0.3, 0],
    water: [[40, 110, 22, 92, 0]], bunkers: [[-16, 160, 5, 8, 0]] },
  { n: 18, name: 'Grand Finish', par: 4, c: [[0, 0], [6, 240], [0, 440], [0, 465]], fw: [[40, -14, 21]],
    green: [0, 440, 14, 15, 0], pins: [[0, 0], [-4, -5], [5, 5]], slope: [0.25, -0.2],
    water: [[-31, 420, 12, 22, 0]], bunkers: [[27, 250, 8, 13, 0], [18, 432, 5, 8, 0], [-4, 459, 8, 4, 0]] },
];

const r1 = v => Math.round(v * 10) / 10;

/** Which template holes a round of `holes` plays, in order, from the round's course seed. 18 = all, in order. */
export function pickHoles(course, holes) {
  const all = HOLES.map(h => h.n);
  if (holes >= 18) return all;
  const rng = makeRng((course >>> 0) + 101);
  if (holes === 9) return rng() < 0.5 ? all.slice(0, 9) : all.slice(9);
  const byPar = p => rng.shuffle(HOLES.filter(h => h.par === p).map(h => h.n));
  const [p3, p4, p5] = [byPar(3), byPar(4), byPar(5)];
  let pick;
  if (holes <= 3) pick = [p3[0], p4[0], p5[0]];
  else if (holes <= 6) pick = [p3[0], p3[1], p4[0], p4[1], p5[0], p5[1]];
  else pick = rng.shuffle(all).slice(0, holes);
  return pick.slice(0, holes).sort((a, b) => a - b);
}
/** The template number for round hole `hole` (0-based) of a `holes`-hole round on course `course`. */
export const holeNumber = (course, holes, hole) => { const list = pickHoles(course, holes); return list[Math.max(0, Math.min(list.length - 1, hole))]; };

// ---------------------------------------------------------------- building a hole
const mirrorE = (e, m) => (m ? [-e[0], e[1], e[2], e[3], -(e[4] || 0)] : [e[0], e[1], e[2], e[3], e[4] || 0]);
/**
 * The layout of one hole, as sent to every browser: template `n`, mirrored left-right or not, pin option `pin`.
 * Everything here is plain numbers (JSON-safe); hydrate() adds the derived lookups.
 */
export function buildLayout(n, { mirror = false, pin = 0 } = {}) {
  const T = HOLES[n - 1], m = mirror ? -1 : 1;
  const c = T.c.map(([x, y]) => [x * m, y]);
  const green = mirrorE(T.green, mirror);
  const po = T.pins[((pin % T.pins.length) + T.pins.length) % T.pins.length], cr = Math.cos(green[4]), sr = Math.sin(green[4]);
  const ox = po[0] * m, oy = po[1];
  const cup = { x: r1(green[0] + ox * cr - oy * sr), y: r1(green[1] + ox * sr + oy * cr) };
  const L = {
    n: T.n, name: T.name, par: T.par, mirror: !!mirror, pin, c,
    fw: T.fw.map(f => f.slice()), rw: T.rw ?? 40, ow: T.ow ?? (T.rw ?? 40) + 22,
    green, cup, slope: [T.slope[0] * m, T.slope[1]],
    bunkers: (T.bunkers || []).map(e => mirrorE(e, mirror)), water: (T.water || []).map(e => mirrorE(e, mirror)),
    creeks: (T.creeks || []).map(k => ({ pts: k.pts.map(([x, y]) => [x * m, y]), w: k.w })),
    wind: T.wind || 1, trees: [],
  };
  const H = hydrate(L);
  L.yards = Math.round(nearestOnLine(H, cup.x, cup.y).s);
  L.trees = growTrees(H, T, m);
  indexTrees(L);
  return L;
}

/** Add the derived lookups (dense centre line, distances along it, a tree grid) to a layout. */
export function hydrate(L) {
  if (L._h) return L;
  // Chaikin smoothing, three rounds, ends kept
  let P = L.c.map(p => p.slice());
  for (let k = 0; k < 3; k++) {
    const Q = [P[0]];
    for (let i = 0; i < P.length - 1; i++) { const a = P[i], b = P[i + 1]; Q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); }
    Q.push(P[P.length - 1]); P = Q;
  }
  // even steps of ~4 yards
  const dense = [P[0]];
  for (let i = 0; i < P.length - 1; i++) { const a = P[i], b = P[i + 1], d = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(d / 4)); for (let k = 1; k <= n; k++) dense.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); }
  const S = [0]; for (let i = 1; i < dense.length; i++) S.push(S[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
  Object.defineProperty(L, '_h', { value: true, enumerable: false });
  Object.defineProperty(L, 'line', { value: dense, enumerable: false, writable: true });
  Object.defineProperty(L, 'S', { value: S, enumerable: false, writable: true });
  Object.defineProperty(L, 'len', { value: S[S.length - 1], enumerable: false, writable: true });
  const gS = nearestOnLine(L, L.green[0], L.green[1]).s;
  Object.defineProperty(L, 'gS', { value: gS, enumerable: false, writable: true });
  Object.defineProperty(L, 'spans', { value: L.fw.map(([a, b, w]) => [a < 0 ? gS + a : a, b < 0 ? gS + b : b, w]), enumerable: false, writable: true });
  indexTrees(L);
  return L;
}
function indexTrees(L) {
  const grid = new Map();
  for (const t of L.trees || []) { const k = cellKey(Math.floor(t[0] / 10), Math.floor(t[1] / 10)); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(t); }
  Object.defineProperty(L, 'tgrid', { value: grid, enumerable: false, writable: true, configurable: true });
}
const cellKey = (i, j) => i * 100003 + j;
/** Trees whose canopy could cover (x, y) (within 5 yards of its cell). */
export function treesNear(H, x, y) {
  const out = [], i0 = Math.floor((x - 5) / 10), i1 = Math.floor((x + 5) / 10), j0 = Math.floor((y - 5) / 10), j1 = Math.floor((y + 5) / 10);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const c = H.tgrid.get(cellKey(i, j)); if (c) out.push(...c); }
  return out;
}

/** The woods: trees every ~9 yards down both sides past the rough, plus the template's clumps. [x, y, r, h] each. */
function growTrees(H, T, m) {
  const rng = makeRng(T.n * 7919 + (m < 0 ? 17 : 3)), out = [];
  const ok = (x, y) => { const l = lieAt(H, x, y); return l === 'woods' || l === 'oob'; };
  const clear = (x, y) => Math.hypot(x, y) > 14 && Math.hypot(x - H.cup.x, y - H.cup.y) > H.green[2] + H.green[3] + 8;
  const add = (x, y) => { if (ok(x, y) && clear(x, y)) out.push([r1(x), r1(y), r1(2.6 + rng() * 1.8), r1(9 + rng() * 6)]); };
  for (let s = -12; s < H.len + 14; s += 8) {
    const p = pointAt(H, s), nx = p.ny, ny = -p.nx;            // the right-hand normal
    for (const side of [-1, 1]) {
      const k = 1 + (rng() < 0.55 ? 1 : 0);
      for (let j = 0; j < k; j++) { const d = H.rw + 4 + rng() * (H.ow - H.rw + 26), along = (rng() - 0.5) * 7; add(p.x + side * nx * d + p.nx * along, p.y + side * ny * d + p.ny * along); }
    }
  }
  for (const [cx, cy, R] of T.trees || []) {
    const x0 = cx * m, n = Math.round(R * R / 11);
    for (let j = 0; j < n; j++) { const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * R; const x = x0 + Math.cos(a) * r, y = cy + Math.sin(a) * r, l = lieAt(H, x, y); if (l !== 'water' && l !== 'sand' && l !== 'green' && l !== 'fringe' && l !== 'fairway' && clear(x, y)) out.push([r1(x), r1(y), r1(2.8 + rng() * 1.6), r1(10 + rng() * 5)]); }
  }
  return out;
}

// ---------------------------------------------------------------- geometry
/** The centre line at distance s along it: { x, y, nx, ny } (n = the unit direction of play there). */
export function pointAt(H, s) {
  const S = H.S, P = H.line;
  if (s <= 0) { const d = dirOf(P[0], P[1]); return { x: P[0][0] + d[0] * s, y: P[0][1] + d[1] * s, nx: d[0], ny: d[1] }; }
  if (s >= H.len) { const n = P.length, d = dirOf(P[n - 2], P[n - 1]); return { x: P[n - 1][0] + d[0] * (s - H.len), y: P[n - 1][1] + d[1] * (s - H.len), nx: d[0], ny: d[1] }; }
  let lo = 0, hi = S.length - 1; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (S[mid] <= s) lo = mid; else hi = mid; }
  const t = (s - S[lo]) / Math.max(1e-9, S[hi] - S[lo]), a = P[lo], b = P[hi], d = dirOf(a, b);
  return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, nx: d[0], ny: d[1] };
}
const dirOf = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1; return [dx / L, dy / L]; };
/** Nearest point on the centre line: { d (distance), s (along) }. */
export function nearestOnLine(H, x, y) {
  const P = H.line, S = H.S; let best = Infinity, bs = 0;
  for (let i = 0; i < P.length - 1; i++) {
    const ax = P[i][0], ay = P[i][1], ex = P[i + 1][0] - ax, ey = P[i + 1][1] - ay, L2 = ex * ex + ey * ey || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / L2)), dx = x - ax - ex * t, dy = y - ay - ey * t, d = dx * dx + dy * dy;
    if (d < best) { best = d; bs = S[i] + (S[i + 1] - S[i]) * t; }
  }
  return { d: Math.sqrt(best), s: bs };
}
/** Distance from (x, y) to the centre line clipped to [s0, s1]. */
function spanDist(H, x, y, s0, s1) {
  const P = H.line, S = H.S; let best = Infinity;
  for (let i = 0; i < P.length - 1; i++) {
    if (S[i + 1] < s0 || S[i] > s1) continue;
    const L = S[i + 1] - S[i] || 1e-9, t0 = Math.max(0, (s0 - S[i]) / L), t1 = Math.min(1, (s1 - S[i]) / L);
    const ex = P[i + 1][0] - P[i][0], ey = P[i + 1][1] - P[i][1];
    const ax = P[i][0] + ex * t0, ay = P[i][1] + ey * t0, fx = ex * (t1 - t0), fy = ey * (t1 - t0), L2 = fx * fx + fy * fy || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - ax) * fx + (y - ay) * fy) / L2)), dx = x - ax - fx * t, dy = y - ay - fy * t, d = dx * dx + dy * dy;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}
/** Is (x, y) inside ellipse e = [x, y, rx, ry, rot] grown by `grow` yards? */
export function inEllipse(e, x, y, grow = 0) {
  const dx = x - e[0], dy = y - e[1], c = Math.cos(e[4] || 0), s = Math.sin(e[4] || 0);
  const u = (dx * c + dy * s) / (e[2] + grow), v = (-dx * s + dy * c) / (e[3] + grow);
  return u * u + v * v <= 1;
}
function segDist(x, y, a, b) {
  const ex = b[0] - a[0], ey = b[1] - a[1], L2 = ex * ex + ey * ey || 1e-9, t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (y - a[1]) * ey) / L2));
  return Math.hypot(x - a[0] - ex * t, y - a[1] - ey * t);
}
export function inCreek(k, x, y) { for (let i = 0; i < k.pts.length - 1; i++) if (segDist(x, y, k.pts[i], k.pts[i + 1]) <= k.w) return true; return false; }
export const onTeeBox = (x, y) => x >= TEE_BOX.x0 && x <= TEE_BOX.x1 && y >= TEE_BOX.y0 && y <= TEE_BOX.y1;

/** What the ground is at (x, y): one of LIES. */
export function lieAt(H, x, y) {
  const g = H.green;
  if (inEllipse(g, x, y)) return 'green';
  if (inEllipse(g, x, y, FRINGE)) return 'fringe';
  for (const b of H.bunkers) if (inEllipse(b, x, y)) return 'sand';
  for (const w of H.water) if (inEllipse(w, x, y)) return 'water';
  for (const k of H.creeks) if (inCreek(k, x, y)) return 'water';
  if (onTeeBox(x, y)) return 'tee';
  const { d } = nearestOnLine(H, x, y);
  if (d <= H.rw + 0.01) { for (const [s0, s1, w] of H.spans) if (spanDist(H, x, y, s0, s1) <= w) return 'fairway'; return 'rough'; }
  return d <= H.ow ? 'woods' : 'oob';
}
/** The bounding box of everything playable: [x0, x1, y0, y1]. */
export function bounds(H) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of H.line) { x0 = Math.min(x0, x - H.rw); x1 = Math.max(x1, x + H.rw); y0 = Math.min(y0, y - H.rw); y1 = Math.max(y1, y + H.rw); }
  return [x0, x1, Math.max(y0, -20), y1];
}
/** A point on the centre line about `ahead` yards further on than (x, y) — where a lay-up should go. */
export function layupFrom(H, x, y, ahead) {
  const s = Math.min(nearestOnLine(H, x, y).s + ahead, H.gS);
  return pointAt(H, s);
}
