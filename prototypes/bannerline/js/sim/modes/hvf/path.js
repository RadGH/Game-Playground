// Grid A* for Hunters vs Farmers movers (characters, army). 8 directions, no corner cutting, integer
// costs (10 straight, 14 diagonal), octile heuristic, a binary heap ordered by (f, cell index) so the
// same query gives the same path on every engine. Returns a list of cell indices from the first step
// to the goal, or null.

import { canStand, canStep } from './grid.js';

const DIRS = [[1, 0, 10], [-1, 0, 10], [0, 1, 10], [0, -1, 10], [1, 1, 14], [1, -1, 14], [-1, 1, 14], [-1, -1, 14]];

let scratch = null;
function buffers(n) {
  if (!scratch || scratch.n !== n) scratch = { n, g: new Int32Array(n), from: new Int32Array(n), stamp: new Int32Array(n), closed: new Int32Array(n), gen: 0 };
  scratch.gen++;
  return scratch;
}

/**
 * opts: { who, maxNodes (default 30000), near: true = stop at the first cell within 1 step of the goal
 *         when the goal itself cannot be stood on (a tree to chop, a building to reach),
 *         closest: true = when the goal cannot be reached, go to the reached cell nearest to it }
 */
export function findPath(ctx, g, from, goal, opts) {
  const { map } = ctx, cols = map.cols, rows = map.rows;
  const who = opts.who, maxNodes = opts.maxNodes || 30000;
  const goalOk = canStand(g, who, goal);
  if (from === goal) return [];
  const gx = goal % cols, gz = (goal / cols) | 0;
  const isGoal = c => c === goal || (!goalOk && opts.near && Math.abs((c % cols) - gx) <= 1 && Math.abs(((c / cols) | 0) - gz) <= 1);
  if (!goalOk && !opts.near && !opts.closest) return null;
  const B = buffers(cols * rows), gen = B.gen;
  const heapF = [], heapC = [];
  const h = c => { const dx = Math.abs((c % cols) - gx), dz = Math.abs(((c / cols) | 0) - gz); return dx < dz ? 14 * dx + 10 * (dz - dx) : 14 * dz + 10 * (dx - dz); };
  const less = (i, j) => heapF[i] < heapF[j] || (heapF[i] === heapF[j] && heapC[i] < heapC[j]);
  const swap = (i, j) => { const f = heapF[i]; heapF[i] = heapF[j]; heapF[j] = f; const c = heapC[i]; heapC[i] = heapC[j]; heapC[j] = c; };
  const push = (f, c) => { heapF.push(f); heapC.push(c); let i = heapF.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (!less(i, p)) break; swap(i, p); i = p; } };
  const pop = () => {
    const c = heapC[0], last = heapF.length - 1;
    swap(0, last); heapF.pop(); heapC.pop();
    let i = 0;
    for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heapF.length && less(l, m)) m = l; if (r < heapF.length && less(r, m)) m = r; if (m === i) break; swap(i, m); i = m; }
    return c;
  };
  B.stamp[from] = gen; B.g[from] = 0; B.from[from] = -1;
  push(h(from), from);
  let expanded = 0, found = -1, best = from, bestH = h(from);
  while (heapF.length) {
    const c = pop();
    if (B.closed[c] === gen) continue;
    B.closed[c] = gen;
    if (isGoal(c)) { found = c; break; }
    const hc = h(c);
    if (hc < bestH || (hc === bestH && c < best)) { bestH = hc; best = c; }
    if (++expanded > maxNodes) break;
    const x = c % cols, z = (c / cols) | 0;
    for (const [dx, dz, cost] of DIRS) {
      const nx = x + dx, nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= cols || nz >= rows) continue;
      const n = nz * cols + nx;
      if (B.closed[n] === gen) continue;
      if (!canStep(ctx, g, who, c, n)) continue;
      // no corner cutting: both orthogonal neighbours must be passable for a diagonal step
      if (dx && dz && (!canStep(ctx, g, who, c, z * cols + nx) || !canStep(ctx, g, who, c, nz * cols + x))) continue;
      const ng = B.g[c] + cost;
      if (B.stamp[n] === gen && B.g[n] <= ng) continue;
      B.stamp[n] = gen; B.g[n] = ng; B.from[n] = c;
      push(ng + h(n), n);
    }
  }
  if (found < 0) { if (!opts.closest || best === from) return null; found = best; }
  const path = [];
  for (let c = found; c !== from; c = B.from[c]) path.push(c);
  path.reverse();
  return path;
}
