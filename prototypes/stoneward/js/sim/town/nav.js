// Paths over cells. PURE. The step cost IS the travel time: a cell costs 100 / walk%, so a paved road
// (walk 175) costs about half what grass does, and a path finder that minimises cost picks the
// fastest way, not the shortest. Solid cells and open water block; a bridge carries you over.
//
// Coordinates here are UNWRAPPED (x may run below 0 or past W); sim.cell wraps them. A search is
// bounded (maxNodes) so a hopeless request costs a few ms, not a frame.

export function createNav(sim) {
  const { M } = sim;
  const W = sim.W;

  /** Travel cost of a cell (Infinity = can't enter). */
  function cost(x, y) {
    const p = sim.cell(x, y); if (!p) return Infinity;
    const { c, i } = p;
    const m = c.mat[i];
    if (m) {
      if (m === M.id.bridge) return 100 / M.walk[m];
      if (M.liquid[m]) return Infinity;                // water and lava
      const w = M.walk[m];
      if (!w) return Infinity;
      return 100 / Math.min(w, M.walk[c.ground[i]] || 100);
    }
    const g = M.walk[c.ground[i]];
    return g ? 100 / g : Infinity;
  }

  // a binary heap of node ids keyed by f
  function heap() {
    const ids = [], fs = [];
    return {
      get size() { return ids.length; },
      push(id, f) { ids.push(id); fs.push(f); let k = ids.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (fs[p] <= fs[k]) break; [ids[p], ids[k]] = [ids[k], ids[p]]; [fs[p], fs[k]] = [fs[k], fs[p]]; k = p; } },
      pop() { const top = ids[0]; const li = ids.pop(), lf = fs.pop(); if (ids.length) { ids[0] = li; fs[0] = lf; let k = 0; for (;;) { const a = 2 * k + 1, b = a + 1; let m = k; if (a < ids.length && fs[a] < fs[m]) m = a; if (b < ids.length && fs[b] < fs[m]) m = b; if (m === k) break; [ids[m], ids[k]] = [ids[k], ids[m]]; [fs[m], fs[k]] = [fs[k], fs[m]]; k = m; } } return top; },
    };
  }

  const DX = [1, 0, -1, 0, 1, 1, -1, -1], DY = [0, 1, 0, -1, 1, -1, 1, -1];
  /**
   * Fastest path from (sx, sy) to (tx, ty). Returns { path: [[x, y], ...] (start excluded), cost } or
   * null. `near` = stop when within that many cells of the target (so you can walk UP TO a building).
   */
  function find(sx, sy, tx, ty, { near = 0, maxNodes = 30000, costFn = cost, wrapW = W } = {}) {
    const W = wrapW;
    sx = Math.floor(sx); sy = Math.floor(sy); tx = Math.floor(tx); ty = Math.floor(ty);
    // bring the target to the copy nearest the start
    while (tx - sx > W / 2) tx -= W; while (sx - tx > W / 2) tx += W;
    const span = Math.max(Math.abs(tx - sx), Math.abs(ty - sy)) + 40;
    const ox = Math.min(sx, tx) - (span - Math.abs(tx - sx)) / 2 | 0, oy = Math.min(sy, ty) - (span - Math.abs(ty - sy)) / 2 | 0;
    const S = span + 1;
    const key = (x, y) => (y - oy) * S + (x - ox);
    const g = new Map(), from = new Map(), open = heap();
    const h = (x, y) => Math.max(Math.abs(x - tx), Math.abs(y - ty)) * 0.57;   // optimistic: the fastest road
    const k0 = key(sx, sy); g.set(k0, 0); open.push(k0, h(sx, sy));
    let found = -1, n = 0;
    while (open.size && n++ < maxNodes) {
      const k = open.pop();
      const x = (k % S) + ox, y = Math.floor(k / S) + oy;
      if (Math.max(Math.abs(x - tx), Math.abs(y - ty)) <= near) { found = k; break; }
      const gk = g.get(k);
      for (let d = 0; d < 8; d++) {
        const nx = x + DX[d], ny = y + DY[d];
        if (nx < ox || ny < oy || nx >= ox + S || ny >= oy + S) continue;
        let c = costFn(nx, ny);
        if (!isFinite(c)) {
          // the target cell itself may be solid (a building): allow stepping onto it as the last step
          if (!(nx === tx && ny === ty)) continue;
          c = 1;
        }
        if (d >= 4) { if (!isFinite(costFn(x + DX[d], y)) || !isFinite(costFn(x, y + DY[d]))) continue; c *= 1.414; }
        const nk = key(nx, ny), ng = gk + c;
        if (ng < (g.get(nk) ?? Infinity)) { g.set(nk, ng); from.set(nk, k); open.push(nk, ng + h(nx, ny)); }
      }
    }
    if (found < 0) return null;
    const path = [];
    for (let k = found; k !== k0; k = from.get(k)) path.push([(k % S) + ox, Math.floor(k / S) + oy]);
    path.reverse();
    return { path, cost: g.get(found) };
  }

  /**
   * Long trips (a mine 1-2 km out): the same search on 4x4-cell TILES. A tile costs what its
   * cheapest sampled cell costs (a road through it counts), times `offroad` when no road crosses
   * it — carts crawl on grass. Returns { path: [[x, y], ...] tile centres, cost } or null.
   */
  const T = 4;
  // tile costs barely change (a road laid, a wall built), so they are remembered for a while: the
  // long searches that mines, raiders and caravans run would otherwise re-measure the same ground
  const tileCache = new Map();
  function tileCost(tx, ty, offroad) {
    const key = (((tx % (W / T)) + W / T) % (W / T)) * 65536 + ty * 8 + Math.min(7, Math.round(offroad));
    const hit = tileCache.get(key);
    if (hit && sim.tick - hit.t < 1200) return hit.c;
    const c = tileCostRaw(tx, ty, offroad);
    tileCache.set(key, { c, t: sim.tick });
    if (tileCache.size > 400000) tileCache.clear();
    return c;
  }
  function tileCostRaw(tx, ty, offroad) {
    let best = Infinity, road = false;
    for (const [ox, oy] of [[1, 1], [2, 2], [3, 1], [1, 3], [2, 0], [0, 2]]) {
      const x = tx * T + ox, y = ty * T + oy;
      const c = cost(x, y);
      if (c < best) best = c;
      const p = sim.cell(x, y);
      if (p && (M.flag.road[p.c.ground[p.i]] || p.c.mat[p.i] === M.id.bridge)) road = true;
    }
    return road ? best : best * offroad;
  }
  function findLong(sx, sy, tx, ty, { offroad = 1, maxNodes = 60000 } = {}) {
    const a = find(Math.floor(sx / T), Math.floor(sy / T), Math.floor(tx / T), Math.floor(ty / T), { near: 1, maxNodes, costFn: (x, y) => tileCost(x, y, offroad), wrapW: W / T });
    if (!a) return null;
    return { path: a.path.map(([x, y]) => [x * T + 2, y * T + 2]), cost: a.cost * T };
  }

  return { find, findLong, cost };
}
