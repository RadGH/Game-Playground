// Flow fields (PLAN M4: raids walk on flow fields — wade shallow water, avoid deep water and lava, go round cliffs,
// use roads, chew the weakest wall when that is cheaper than the way round). PURE.
//
// A field is a Dijkstra distance from a set of GOAL cells outward over a window of the map (the box round a nest and
// its target, grown by a margin — the whole map if that box cannot reach). The caller gives `cost(x, y)`: the price
// of stepping INTO cell (x, y) — Infinity = impassable, a number ≥ BLOCK = a blocker the walker must break first
// (a wall section, a gate, a building it may attack; the price is BLOCK plus how long the chewing takes), anything
// else = walking time. Steps go 8 ways; a diagonal step needs BOTH side cells open (not a blocker, not impassable),
// so a wall band one diagonal thick can never be slipped through (js/world/vectors.js stamps 4-connected bands).
//
// The search is incremental: `step(budget)` settles up to `budget` cells and returns true when the field is done, so
// a raid's field is built over a few ticks while the raid is still forming (PLAN §1.3 budgets).
//   const f = createFlowField({ W, H, box: [x0, y0, x1, y1], goals: [[x, y]...], cost })
//   f.step(60000) → done? · f.at(x, y) → distance (Infinity outside / unreachable) · f.next(x, y, salt) → [x, y] | null
//   f.path(x, y, maxSteps) → [[x, y]...] the greedy walk to a goal (the predicted path the scope draws)

export const BLOCK = 50;
const SQ2 = 1.4142135623730951;
const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DY = [0, 0, 1, -1, 1, -1, 1, -1];

export function createFlowField({ W, H, box, goals, cost }) {
  const x0 = Math.max(0, box[0] | 0), y0 = Math.max(0, box[1] | 0);
  const x1 = Math.min(W - 1, box[2] | 0), y1 = Math.min(H - 1, box[3] | 0);
  const w = x1 - x0 + 1, h = y1 - y0 + 1, N = w * h;
  const dist = new Float32Array(N).fill(Infinity);
  const shut = new Uint8Array(N);
  // the cost of each cell, read once (the cost function may be slow: Map lookups for walls and buildings)
  const cst = new Float32Array(N).fill(-1);
  const costAt = (k) => { let c = cst[k]; if (c < 0) { c = cost(x0 + (k % w), y0 + ((k / w) | 0)); cst[k] = c; } return c; };
  let hf = new Float64Array(1 << 12), hn = new Int32Array(1 << 12), hs = 0;
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
  for (const [gx, gy] of goals) {
    const x = gx - x0, y = gy - y0;
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const k = y * w + x;
    if (dist[k] === 0) continue;
    dist[k] = 0; push(0, k);
  }
  const open = (k) => { const c = costAt(k); return c < BLOCK && c < Infinity; };
  let done = hs === 0, settled = 0;

  function step(budget = Infinity) {
    let n = 0;
    while (hs > 0 && n < budget) {
      const cur = pop();
      if (shut[cur]) continue;
      shut[cur] = 1; n++; settled++;
      const cx = cur % w, cy = (cur / w) | 0, d = dist[cur];
      // the walker steps from the neighbour INTO cur: it pays cur's cost (goal cells cost nothing to enter)
      const enter = d === 0 && goalSet.has(cur) ? 1 : costAt(cur);
      if (enter === Infinity) continue;
      for (let k = 0; k < 8; k++) {
        const nx = cx + DX[k], ny = cy + DY[k];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const nk = ny * w + nx;
        if (shut[nk]) continue;
        const nc = costAt(nk);
        if (nc === Infinity) continue;
        if (k >= 4) {
          // diagonal: both side cells must be open
          if (!open(cy * w + nx) || !open(ny * w + cx)) continue;
        }
        const nd = d + enter * (k >= 4 ? SQ2 : 1);
        if (nd < dist[nk]) { dist[nk] = nd; push(nd, nk); }
      }
    }
    if (hs === 0) done = true;
    return done;
  }
  const goalSet = new Set();
  for (const [gx, gy] of goals) { const x = gx - x0, y = gy - y0; if (x >= 0 && y >= 0 && x < w && y < h) goalSet.add(y * w + x); }

  function at(x, y) {
    x |= 0; y |= 0;
    if (x < x0 || y < y0 || x > x1 || y > y1) return Infinity;
    return dist[(y - y0) * w + (x - x0)];
  }
  /** The neighbour to step to from (x, y): the lowest distance (ties broken by `salt` so a crowd spreads). */
  function next(x, y, salt = 0) {
    x |= 0; y |= 0;
    let best = null, bd = Infinity, bs = 0;
    if (at(x, y) === 0) return null; // at a goal
    for (let k = 0; k < 8; k++) {
      const nx = x + DX[k], ny = y + DY[k];
      const dn = at(nx, ny);
      if (dn === Infinity) continue;
      const a = nx - x0, b = ny - y0;
      if (k >= 4) {
        const ax = x - x0, ay = y - y0;
        if (ax < 0 || ay < 0 || ax >= w || ay >= h) continue;
        if (!open(ay * w + a) || !open(b * w + ax)) continue;
      }
      // what is left from here by way of n: the price of stepping into n, then n's own distance
      const nk = b * w + a;
      const enter = dn === 0 && goalSet.has(nk) ? 1 : costAt(nk);
      if (enter === Infinity) continue;
      const d = dn + enter * (k >= 4 ? SQ2 : 1);
      // equal-ish distances: a stable per-walker preference so a party fans out instead of walking in single file
      const s = ((salt * 2654435761 + k * 40503) >>> 0) & 1023;
      if (d < bd - 0.05 || (Math.abs(d - bd) <= 0.05 && best && s > bs)) { bd = d; best = [nx, ny]; bs = s; }
    }
    return best;
  }
  /** Is (x, y) a blocker the walker must break? (cost ≥ BLOCK, finite) */
  function blocker(x, y) {
    if (x < x0 || y < y0 || x > x1 || y > y1) return false;
    const k = (y - y0) * w + (x - x0);
    if (goalSet.has(k)) return false;
    const c = costAt(k);
    return c >= BLOCK && c < Infinity;
  }
  function isGoal(x, y) { return x >= x0 && y >= y0 && x <= x1 && y <= y1 && goalSet.has((y - y0) * w + (x - x0)); }
  function path(x, y, maxSteps = 4000) {
    const out = [[x | 0, y | 0]];
    let cx = x | 0, cy = y | 0;
    for (let i = 0; i < maxSteps; i++) {
      if (at(cx, cy) === 0) break;
      const n = next(cx, cy, 0);
      if (!n) break;
      [cx, cy] = n; out.push([cx, cy]);
    }
    return out;
  }
  return { step, at, next, path, blocker, isGoal, box: [x0, y0, x1, y1], get done() { return done; }, get settled() { return settled; }, w, h };
}
