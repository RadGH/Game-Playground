// Route finding for everything that walks or rolls (PLAN M3). PURE.
//
// A* over the full-resolution cell grid, 8 ways, never cutting a blocked corner. The cost of a step is the time it
// takes in ticks for that carrier kind (data/vehicles.json): on foot a cell's own walk % applies (shallow water 35%,
// trees 55%) and a road or bridge multiplies by `road`; on wheels only `vehicle: true` cells, roads and bridges can be
// used, at `road` x speed on a road and `offRoad` x speed elsewhere. So a route IS a travel time, and a carrier that
// follows it can never arrive sooner than distance / top speed (§0.9 — nothing teleports).
//
// Routes are cached by (from, to, kind): a found one for 2 game minutes (so a new road is used from the next search
// on), a failed one for 30 s; anything that blocks cells (a building, a road taken up) clears the cache at once.

import { EDGE, ROAD, BRIDGE } from '../../world/grid.js';

const SQRT2 = 1.4142135623730951;
const KEEP = 2400, RETRY = 600;

/** Speed factor (multiplier on the carrier's top speed) of cell value c for vehicle row v, or 0 if it cannot enter. */
export function cellFactor(M, v, c) {
  if (c & EDGE) return 0;
  const onRoad = (c & (ROAD | BRIDGE)) !== 0;
  if (v.wheels) {
    if (onRoad) return v.road;
    return M.vehicle[c & 255] ? v.offRoad : 0;
  }
  if (c & BRIDGE) return v.road;
  const w = M.walk[c & 255];
  if (!w) return 0;
  return onRoad ? v.road : w / 100;
}

/** Cells a carrier moves per tick at full speed (speed in m/s, 0.5 m cells, 20 ticks a second). */
export const cellsPerTick = (v) => (v.speed * 2) / 20;

export function createPaths(sim) {
  const { g, M } = sim.world;
  const W = g.W, H = g.H, N = W * H;
  const gs = new Float32Array(N);
  const par = new Int32Array(N);
  const seen = new Uint32Array(N); // stamp: opened in search #stamp
  const shut = new Uint32Array(N);
  let stamp = 0;
  // binary heap of (f, node)
  let hf = new Float64Array(1 << 14), hn = new Int32Array(1 << 14), hs = 0;
  function push(f, n) {
    if (hs >= hf.length) { const a = new Float64Array(hf.length * 2); a.set(hf); hf = a; const b = new Int32Array(hn.length * 2); b.set(hn); hn = b; }
    let i = hs++;
    while (i > 0) { const p = (i - 1) >> 1; if (hf[p] <= f) break; hf[i] = hf[p]; hn[i] = hn[p]; i = p; }
    hf[i] = f; hn[i] = n;
  }
  function pop() {
    const n = hn[0], lf = hf[--hs], ln = hn[hs];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1; if (c >= hs) break;
      if (c + 1 < hs && hf[c + 1] < hf[c]) c++;
      if (hf[c] >= lf) break;
      hf[i] = hf[c]; hn[i] = hn[c]; i = c;
    }
    hf[i] = lf; hn[i] = ln;
    return n;
  }
  const cache = new Map();
  let cacheVer = -1;
  const stats = { searches: 0, hits: 0, opened: 0, failed: 0 };

  const cellAt = (k) => g.cells[g.idx(k % W, (k / W) | 0)];

  /**
   * Route from (ax, ay) to (bx, by) (cells) for vehicle row `v`. Returns { cells: Int32Array of row-major cell
   * indices from start to goal, ticks, len (cells walked), road (share of the length on roads) } or null.
   */
  function find(ax, ay, bx, by, v) {
    ax |= 0; ay |= 0; bx |= 0; by |= 0;
    if (cacheVer !== sim.routeVer) { cache.clear(); cacheVer = sim.routeVer; }
    const key = `${ay * W + ax}>${by * W + bx}:${v.id}`;
    const hit = cache.get(key);
    // a found route is kept for `keep` ticks (new roads are picked up when it is looked for again), a failed search
    // for `retry` ticks; anything that BLOCKS a cell (a building, a road taken up) bumps sim.routeVer and clears all
    if (hit && sim.tick - hit.at < (hit.r ? KEEP : RETRY)) { stats.hits++; return hit.r; }
    const r = search(ax, ay, bx, by, v);
    if (cache.size > 4000) cache.clear();
    cache.set(key, { r, at: sim.tick });
    return r;
  }

  function search(ax, ay, bx, by, v) {
    stats.searches++;
    if (ax < 0 || ay < 0 || bx < 0 || by < 0 || ax >= W || bx >= W || ay >= H || by >= H) return null;
    const speed = cellsPerTick(v);
    const maxF = Math.max(v.road, v.wheels ? v.offRoad : 1);
    const hmin = 1 / (speed * maxF);
    // standing just off the walkable ground (a cell that was built over): start from the nearest cell that is not
    let start = ay * W + ax;
    const goal = by * W + bx;
    if (!cellFactor(M, v, cellAt(start))) {
      start = -1;
      for (let d = 1; d <= 3 && start < 0; d++) for (let dy = -d; dy <= d && start < 0; dy++) for (let dx = -d; dx <= d; dx++) {
        const x = ax + dx, y = ay + dy;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        if (cellFactor(M, v, cellAt(y * W + x))) { start = y * W + x; ax = x; ay = y; break; }
      }
      if (start < 0) { stats.failed++; return null; }
    }
    if (!cellFactor(M, v, cellAt(goal))) { stats.failed++; return null; }
    stamp++;
    if (stamp === 0xffffffff) { seen.fill(0); shut.fill(0); stamp = 1; }
    hs = 0;
    gs[start] = 0; par[start] = -1; seen[start] = stamp;
    const h = (x, y) => { const dx = Math.abs(x - bx), dy = Math.abs(y - by); return (Math.max(dx, dy) + (SQRT2 - 1) * Math.min(dx, dy)) * hmin * 1.15; };
    push(h(ax, ay), start);
    let opened = 0;
    const budget = sim.data.econ.pathBudget;
    while (hs > 0) {
      const cur = pop();
      if (shut[cur] === stamp) continue;
      shut[cur] = stamp;
      if (cur === goal) break;
      if (++opened > budget) { stats.failed++; stats.opened += opened; return null; }
      const x = cur % W, y = (cur / W) | 0;
      const gc = gs[cur];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const k = ny * W + nx;
        if (shut[k] === stamp) continue;
        const f = cellFactor(M, v, g.cells[g.idx(nx, ny)]);
        if (!f) continue;
        if (dx && dy && (!cellFactor(M, v, g.cells[g.idx(x + dx, y)]) || !cellFactor(M, v, g.cells[g.idx(x, y + dy)]))) continue;
        const ng = gc + (dx && dy ? SQRT2 : 1) / (speed * f);
        if (seen[k] === stamp && ng >= gs[k]) continue;
        seen[k] = stamp; gs[k] = ng; par[k] = cur;
        push(ng + h(nx, ny), k);
      }
    }
    stats.opened += opened;
    if (shut[goal] !== stamp) { stats.failed++; return null; }
    let n = 0;
    for (let k = goal; k !== -1; k = par[k]) n++;
    const cells = new Int32Array(n);
    let i = n;
    for (let k = goal; k !== -1; k = par[k]) cells[--i] = k;
    let len = 0, road = 0;
    for (let j = 1; j < n; j++) {
      const a = cells[j - 1], b = cells[j];
      const step = (a % W !== b % W && ((a / W) | 0) !== ((b / W) | 0)) ? SQRT2 : 1;
      len += step;
      if (cellAt(b) & (ROAD | BRIDGE)) road += step;
    }
    return { cells, ticks: gs[goal], len, road: len ? road / len : 0 };
  }

  return { find, stats, cache, W };
}
