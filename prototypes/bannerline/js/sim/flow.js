// Flow fields: one per field, computed once when the match is built (not part of state). Each cell
// stores its walking distance to the Keep's leak line; units walk down the distance gradient, so
// they go around walls and spread naturally. Grid resolution: map.grid.cell metres.
//
//   const flow = buildFlow(field, cell)      field = sim.map.fields[i] (world coords)
//   flowDir(flow, x, z) -> { x, z }          unit vector, world coords

const STRAIGHT = 10, DIAG = 14;

// tiny binary heap of [cost, idx] ordered by (cost, idx) so ties resolve the same everywhere
function heapPush(h, c, i) {
  h.push(c, i);
  let n = h.length / 2 - 1;
  while (n > 0) {
    const p = (n - 1) >> 1;
    if (h[2 * p] < h[2 * n] || (h[2 * p] === h[2 * n] && h[2 * p + 1] <= h[2 * n + 1])) break;
    let t = h[2 * p]; h[2 * p] = h[2 * n]; h[2 * n] = t;
    t = h[2 * p + 1]; h[2 * p + 1] = h[2 * n + 1]; h[2 * n + 1] = t;
    n = p;
  }
}
function heapPop(h) {
  const c = h[0], i = h[1];
  const lc = h.pop(), li = h.pop();
  // h.pop() above removed the last pair in reverse order: li is cost, lc is idx
  const m = h.length / 2;
  if (m > 0) {
    h[0] = li; h[1] = lc;
    let n = 0;
    for (;;) {
      const l = 2 * n + 1, r = l + 1;
      let s = n;
      const lt = (a, b) => h[2 * a] < h[2 * b] || (h[2 * a] === h[2 * b] && h[2 * a + 1] < h[2 * b + 1]);
      if (l < m && lt(l, s)) s = l;
      if (r < m && lt(r, s)) s = r;
      if (s === n) break;
      let t = h[2 * s]; h[2 * s] = h[2 * n]; h[2 * n] = t;
      t = h[2 * s + 1]; h[2 * s + 1] = h[2 * n + 1]; h[2 * n + 1] = t;
      n = s;
    }
  }
  return [c, i];
}

export function buildFlow(field, cell = 1) {
  const cols = Math.round((field.x1 - field.x0) / cell), rows = Math.round((field.z1 - field.z0) / cell);
  const N = cols * rows;
  const blocked = new Uint8Array(N);
  const dist = new Float64Array(N).fill(Infinity);
  const cx = c => field.x0 + (c + 0.5) * cell, cz = r => field.z0 + (r + 0.5) * cell;
  for (const w of field.walls) {
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = cx(c), z = cz(r);
      if (x >= w.x0 && x <= w.x1 && z >= w.z0 && z <= w.z1) blocked[r * cols + c] = 1;
    }
  }
  const heap = [];
  const half = field.keep.w / 2;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = r * cols + c;
    if (!blocked[i] && cz(r) >= field.leakZ && Math.abs(cx(c) - field.keep.x) <= half) { dist[i] = 0; heapPush(heap, 0, i); }
  }
  while (heap.length) {
    const [d, i] = heapPop(heap);
    if (d > dist[i]) continue;
    const r = (i / cols) | 0, c = i - r * cols;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
      const j = nr * cols + nc;
      if (blocked[j]) continue;
      if (dr && dc && (blocked[r * cols + nc] || blocked[nr * cols + c])) continue;   // no corner cutting
      const nd = d + (dr && dc ? DIAG : STRAIGHT);
      if (nd < dist[j]) { dist[j] = nd; heapPush(heap, nd, j); }
    }
  }
  // gradient directions
  const dx = new Float64Array(N), dz = new Float64Array(N);
  const at = (r, c, fallback) => (r < 0 || c < 0 || r >= rows || c >= cols || blocked[r * cols + c] || dist[r * cols + c] === Infinity) ? fallback : dist[r * cols + c];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = r * cols + c, d0 = dist[i];
    if (blocked[i] || d0 === Infinity) continue;
    let gx = at(r, c - 1, d0) - at(r, c + 1, d0);
    let gz = at(r - 1, c, d0) - at(r + 1, c, d0);
    if (d0 === 0) { gx = 0; gz = 1; }
    const len = Math.sqrt(gx * gx + gz * gz);
    if (len > 0) { dx[i] = gx / len; dz[i] = gz / len; } else { dz[i] = 1; }
  }
  return { cols, rows, cell, x0: field.x0, z0: field.z0, dist, dx, dz, blocked };
}

/** Unit direction toward the Keep at world (x, z). */
export function flowDir(flow, x, z) {
  let c = Math.floor((x - flow.x0) / flow.cell), r = Math.floor((z - flow.z0) / flow.cell);
  if (c < 0) c = 0; else if (c >= flow.cols) c = flow.cols - 1;
  if (r < 0) r = 0; else if (r >= flow.rows) r = flow.rows - 1;
  const i = r * flow.cols + c;
  if (flow.dx[i] === 0 && flow.dz[i] === 0) return { x: 0, z: 1 };
  return { x: flow.dx[i], z: flow.dz[i] };
}

/** True if world (x, z) is inside a wall cell. */
export function isBlocked(flow, x, z) {
  const c = Math.floor((x - flow.x0) / flow.cell), r = Math.floor((z - flow.z0) / flow.cell);
  if (c < 0 || r < 0 || c >= flow.cols || r >= flow.rows) return true;
  return flow.blocked[r * flow.cols + c] === 1;
}
