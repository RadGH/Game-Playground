// What blocks walking, and walking floods (PLAN §0.4: the world is flat; deep water, lava and cliff
// lines are its edges). PURE.

import { EDGE, BRIDGE } from './grid.js';

/** Can a person walk on this cell? (shallow water: yes, slowly; deep water, lava, cliffs: no) */
export function walkable(M, c) {
  if (c & EDGE) return false;
  if (c & BRIDGE) return true;
  return M.walk[c & 255] > 0;
}

/**
 * Flood fill over walkable cells (8-way, no cutting a blocked corner) from (sx, sy).
 * Returns a Uint8Array W*H in ROW-MAJOR order (1 = reached).
 */
export function floodWalk(g, M, sx, sy) {
  const W = g.W, H = g.H;
  const walk = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) walk[y * W + x] = walkable(M, g.cells[g.idx(x, y)]) ? 1 : 0;
  return floodMask(walk, W, H, sx, sy);
}

/** 8-way flood over a row-major 0/1 mask; diagonal steps need one open side. */
export function floodMask(walk, W, H, sx, sy) {
  const seen = new Uint8Array(W * H);
  if (!walk[sy * W + sx]) return seen;
  const q = new Int32Array(W * H);
  let h = 0, t = 0;
  q[t++] = sy * W + sx; seen[sy * W + sx] = 1;
  while (h < t) {
    const p = q[h++];
    const x = p % W, y = (p / W) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const k = ny * W + nx;
      if (seen[k] || !walk[k]) continue;
      if (dx && dy && !walk[y * W + nx] && !walk[ny * W + x]) continue;
      seen[k] = 1; q[t++] = k;
    }
  }
  return seen;
}
