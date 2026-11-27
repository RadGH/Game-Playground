// World Build — water on the coarse (8 m) grid: where rain drains, lakes, rivers that only ever run downhill.
// Pure. Used by shape.js; the 2 m channels are cut afterwards from the lines found here.
//
//   routeRiver(M, from, targets, opts)   cheapest mostly-downhill path between cells (Dijkstra) → [cell…]
//   carveRiverPath(M, path, opts)        lowers (or, in a basin, raises) the ground along the path so it falls all the
//                                        way, and opens a valley round it → the profile used
//   priorityFlood(M, outlets, blocked)   fills every pit so all water can leave → { filled, parent, order }
//   findLakes(M, F, opts)                pits deep and wide enough to hold water → [{ cells, level, … }]
//   traceStreams(M, F, opts)             rivers where enough rain gathers → [{ cells, flow }]

import { makeHeap } from './core.js';

const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/**
 * Dijkstra over the coarse grid from `from` (a cell) to the nearest cell in `isTarget`. Climbing is expensive, so the
 * path follows valleys; `blocked(j)` cells are never entered (the kept pinned area, the sea unless it is the target).
 */
export function routeRiver(M, from, isTarget, { blocked = () => false, climb = 60, high = 0.01, endLevel = 0 } = {}) {
  const { nx, nz, H } = M, N = nx * nz;
  const dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1);
  const heap = makeHeap(1 << 16);
  dist[from] = 0; heap.push(0, from);
  let hit = -1;
  while (heap.size) {
    const d = heap.topPri(), j = heap.pop();
    if (d > dist[j]) continue;
    if (j !== from && isTarget(j)) { hit = j; break; }
    const i = j % nx, k = (j - i) / nx;
    for (const [di, dk] of N8) {
      const ii = i + di, kk = k + dk;
      if (ii < 0 || kk < 0 || ii >= nx || kk >= nz) continue;
      const jj = kk * nx + ii;
      if (blocked(jj) && !isTarget(jj)) continue;
      const L = (di && dk ? 1.4142 : 1) * M.cell;
      const up = Math.max(0, H[jj] - H[j]);
      const c = L * (1 + high * Math.max(0, H[jj] - endLevel)) + climb * up;
      const nd = d + c;
      if (nd < dist[jj]) { dist[jj] = nd; prev[jj] = j; heap.push(nd, jj); }
    }
  }
  if (hit < 0) return null;
  const path = [];
  for (let j = hit; j >= 0; j = prev[j]) path.push(j);
  return path.reverse();
}

/**
 * Make the ground fall all the way along `path`: the bed starts at `startLevel` (or the ground), never rises, and ends
 * no lower than `endLevel` (a lake or pinned river it feeds keeps its own height). The valley round it is opened over
 * `valley` metres so the drainage that runs afterwards follows it. Returns the bed heights.
 */
export function carveRiverPath(M, path, { startLevel = null, endLevel = -Infinity, valley = 80, minDrop = 0.015, blocked = () => false } = {}) {
  const { nx, cell, H } = M;
  const n = path.length;
  const bed = new Float64Array(n);
  bed[0] = startLevel ?? H[path[0]];
  for (let i = 1; i < n; i++) bed[i] = Math.min(bed[i - 1] - minDrop, H[path[i]]);
  // never below the level it runs into: lift the tail evenly so it still falls
  if (Number.isFinite(endLevel)) {
    for (let i = n - 1; i >= 0; i--) bed[i] = Math.max(bed[i], endLevel + minDrop * (n - 1 - i));
    for (let i = 1; i < n; i++) bed[i] = Math.min(bed[i], bed[i - 1]);   // (keeps it monotone after the lift)
  }
  // open the valley: every cell within `valley` m of the path is pulled down towards the bed
  const R = Math.ceil(valley / cell);
  const best = new Map();
  for (let q = 0; q < n; q++) {
    const j = path[q], i = j % nx, k = (j - i) / nx;
    for (let dk = -R; dk <= R; dk++) for (let di = -R; di <= R; di++) {
      const ii = i + di, kk = k + dk;
      if (ii < 0 || kk < 0 || ii >= nx || kk >= M.nz) continue;
      const d = Math.hypot(di, dk) * cell;
      if (d > valley) continue;
      const jj = kk * nx + ii;
      if (blocked(jj)) continue;
      const cur = best.get(jj);
      if (!cur || d < cur[0]) best.set(jj, [d, bed[q]]);
    }
  }
  for (const [jj, [d, b]] of best) {
    if (d < cell * 0.75) { H[jj] = b; continue; }          // the bed itself, both ways (a basin gets a low bank)
    const t = d / valley, rise = (H[jj] - b);
    if (rise <= 0) continue;
    const target = b + rise * t * t * (3 - 2 * t);
    if (target < H[jj]) H[jj] = target;
  }
  return bed;
}

/**
 * Priority flood (Barnes et al.): fill pits so that from every cell water can run to an outlet, keeping a tiny slope
 * (eps) on the filled flats. `outlets` = [[cell, level]…]; `blocked(j)` cells are walls nothing flows into.
 */
export function priorityFlood(M, outlets, blocked = () => false, eps = 1e-3) {
  const { nx, nz, H } = M, N = nx * nz;
  const filled = new Float32Array(N), parent = new Int32Array(N).fill(-1), done = new Uint8Array(N);
  const order = new Int32Array(N);
  let o = 0;
  const heap = makeHeap(1 << 16);
  for (const [j, lvl] of outlets) { if (done[j]) continue; done[j] = 1; filled[j] = lvl; parent[j] = -2; heap.push(lvl, j); }
  while (heap.size) {
    const j = heap.pop();
    order[o++] = j;
    const i = j % nx, k = (j - i) / nx;
    for (const [di, dk] of N8) {
      const ii = i + di, kk = k + dk;
      if (ii < 0 || kk < 0 || ii >= nx || kk >= nz) continue;
      const jj = kk * nx + ii;
      if (done[jj] || blocked(jj)) continue;
      done[jj] = 1;
      filled[jj] = Math.max(H[jj], filled[j] + eps);
      parent[jj] = j;
      heap.push(filled[jj], jj);
    }
  }
  // drainage: each cell drains to its steepest lower neighbour on the filled surface (D8). The flood tree itself would
  // also drain everything, but it runs along flood fronts instead of down valleys, so streams would not gather.
  const down = new Int32Array(N).fill(-1);
  for (let j = 0; j < N; j++) {
    if (!done[j] || parent[j] === -2) { down[j] = parent[j] === -2 ? -2 : -1; continue; }
    const i = j % nx, k = (j - i) / nx;
    let best = -1, bs = 0;
    for (const [di, dk] of N8) {
      const ii = i + di, kk = k + dk;
      if (ii < 0 || kk < 0 || ii >= nx || kk >= nz) continue;
      const jj = kk * nx + ii;
      if (!done[jj]) continue;
      const s = (filled[j] - filled[jj]) / (di && dk ? 1.4142 : 1);
      if (s > bs) { bs = s; best = jj; }
    }
    down[j] = best >= 0 ? best : parent[j];
  }
  return { filled, parent: down, tree: parent, order: order.subarray(0, o), count: o };
}

/** Rain gathered: each cell's own rain (`rain(j)`) plus everything that drains through it. */
export function accumulate(M, F, rain) {
  const acc = new Float32Array(M.nx * M.nz);
  for (let q = F.count - 1; q >= 0; q--) {
    const j = F.order[q];
    acc[j] += rain(j);
    const p = F.parent[j];
    if (p >= 0) acc[p] += acc[j];
  }
  return acc;
}

/**
 * Pits the flood filled by more than `minDepth` m: a lake when it is big enough (`minCells`) or a brief asked for one
 * there (`wanted`: cells). → [{ cells:Int32Array, level, area, wantedIndex }]
 */
export function findLakes(M, F, { minDepth = 0.6, minCells = 40, wanted = [], maxLakes = 14, blocked = () => false } = {}) {
  const { nx, nz, H } = M, N = nx * nz;
  const comp = new Int32Array(N).fill(-1);
  const out = [];
  const isLake = j => !blocked(j) && F.filled[j] - H[j] > minDepth;
  for (let s = 0; s < N; s++) {
    if (comp[s] !== -1 || !isLake(s)) continue;
    const cells = [s]; comp[s] = out.length;
    for (let q = 0; q < cells.length; q++) {
      const j = cells[q], i = j % nx, k = (j - i) / nx;
      for (const [di, dk] of N8.slice(0, 4)) {
        const ii = i + di, kk = k + dk;
        if (ii < 0 || kk < 0 || ii >= nx || kk >= nz) continue;
        const jj = kk * nx + ii;
        if (comp[jj] === -1 && isLake(jj)) { comp[jj] = out.length; cells.push(jj); }
      }
    }
    let level = -Infinity;
    for (const j of cells) level = Math.max(level, F.filled[j]);
    const wantedIndex = wanted.findIndex(w => w.some(c => comp[c] === out.length));
    out.push({ cells: Int32Array.from(cells), level: Math.round(level * 100) / 100, area: cells.length * M.cell * M.cell, wantedIndex });
  }
  const keep = out.filter(l => l.wantedIndex >= 0 || l.cells.length >= minCells)
    .sort((a, b) => (b.wantedIndex >= 0) - (a.wantedIndex >= 0) || b.cells.length - a.cells.length)
    .slice(0, maxLakes + wanted.length);
  return keep;
}

/**
 * Rivers where rain gathers: a stream starts where `threshold` (in rain units) first drains through a cell, and runs
 * down the flood's drainage tree until it meets the sea, a lake, a river already traced, or an outlet. Biggest first,
 * so smaller ones end where they join. `stop(j)` = this cell already holds water. → [{ cells, flow, mouth }]
 */
export function traceStreams(M, F, acc, { threshold, stop, maxStreams = 20, minCells = 30, blocked = () => false }) {
  const { nx, nz } = M, N = nx * nz;
  const heads = [];
  const hasBigUpstream = new Uint8Array(N);
  for (let j = 0; j < N; j++) { const p = F.parent[j]; if (p >= 0 && acc[j] >= threshold) hasBigUpstream[p] = 1; }
  for (let j = 0; j < N; j++) if (acc[j] >= threshold && !hasBigUpstream[j] && !blocked(j) && !stop(j)) heads.push(j);
  // longest first: walk each head to its end to learn its length and the flow at its mouth
  const trial = heads.map(h => { let n = 0, j = h, last = h; while (j >= 0 && !stop(j) && n < 4000) { last = j; j = F.parent[j]; n++; } return { h, n, flow: acc[last] }; })
    .filter(t => t.n >= minCells).sort((a, b) => b.flow - a.flow || b.n - a.n);
  const taken = new Uint8Array(N), out = [];
  for (const t of trial) {
    if (out.length >= maxStreams) break;
    const cells = [];
    let j = t.h, mouth = 'outlet';
    while (j >= 0) {
      if (stop(j)) { mouth = 'water'; cells.push(j); break; }
      if (taken[j]) { mouth = 'river'; cells.push(j); break; }
      cells.push(j);
      const p = F.parent[j];
      if (p < 0) { mouth = F.parent[j] === -2 ? 'outlet' : 'end'; break; }
      j = p;
    }
    if (cells.length < minCells) continue;
    for (const c of cells) taken[c] = 1;
    out.push({ cells, flow: acc[cells[cells.length - 1]], mouth });
  }
  return { streams: out, taken, debug: { heads: heads.length, trial: trial.length, kept: out.length } };
}

/** Breadth-first distance (metres) from every `src` cell, up to `maxD`; Infinity beyond. */
export function distanceFrom(M, src, maxD) {
  const { nx, nz, cell } = M, N = nx * nz;
  // Float64 while searching: a Float32 distance rounds up, so an equal path looks shorter and is pushed again and again
  const d = new Float64Array(N).fill(Infinity);
  const heap = makeHeap(1 << 14);
  for (const j of src) { d[j] = 0; heap.push(0, j); }
  while (heap.size) {
    const dd = heap.topPri(), j = heap.pop();
    if (dd > d[j] || dd > maxD) continue;
    const i = j % nx, k = (j - i) / nx;
    for (const [di, dk] of N8) {
      const ii = i + di, kk = k + dk;
      if (ii < 0 || kk < 0 || ii >= nx || kk >= nz) continue;
      const jj = kk * nx + ii, nd = dd + (di && dk ? 1.4142 : 1) * cell;
      if (nd < d[jj]) { d[jj] = nd; heap.push(nd, jj); }
    }
  }
  return Float32Array.from(d);
}
