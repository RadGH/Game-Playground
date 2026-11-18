// Flow field: one map, shared by every ground enemy, of "which way to the nearest player through the streets".
// Recomputed a few times a second with a breadth-first fill from every player's tile (8 directions, no corner
// cutting past buildings). Hundreds of enemies then each read one cell instead of searching a path each.
import { blocked } from './world.js';

const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];

export function makeFlow(W) {
  return { w: W.w, h: W.h, dist: new Float64Array(W.w * W.h), next: new Int32Array(W.w * W.h), t: 0, solid: new Uint8Array(W.w * W.h) };
}

/** Rebuild from the given goal points (players): shortest walking distance over open tiles (Dijkstra, costs 1 and 1.414). */
export function updateFlow(F, W, goals) {
  const { w, h, dist, next, solid } = F;
  for (let i = 0; i < w * h; i++) { solid[i] = blocked(W, (i % w) + 0.5, Math.floor(i / w) + 0.5, 0) ? 1 : 0; dist[i] = Infinity; next[i] = -1; }
  // simple binary-heap Dijkstra (1600–3000 cells: fast enough several times a second)
  const heap = []; const push = (d, i) => { heap.push([d, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = k * 2 + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
  for (const g of goals) {
    const gx = Math.max(0, Math.min(w - 1, Math.floor(g.x))), gz = Math.max(0, Math.min(h - 1, Math.floor(g.z))), i = gz * w + gx;
    dist[i] = 0; next[i] = i; push(0, i);
  }
  while (heap.length) {
    const [d, i] = pop(); if (d > dist[i]) continue;
    const x = i % w, z = (i / w) | 0;
    for (const [dx, dz, c] of DIRS) {
      const nx = x + dx, nz = z + dz; if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
      const j = nz * w + nx; if (solid[j]) continue;
      if (dx && dz && (solid[z * w + nx] || solid[nz * w + x])) continue;      // no squeezing diagonally past a corner
      const nd = d + c; if (nd < dist[j]) { dist[j] = nd; next[j] = i; push(nd, j); }
    }
  }
}

/** The direction (unit x, z) to walk from (x, z) toward the nearest goal along the streets, or null if cut off. */
export function flowDir(F, x, z) {
  const tx = Math.floor(x), tz = Math.floor(z); if (tx < 0 || tz < 0 || tx >= F.w || tz >= F.h) return null;
  const i = tz * F.w + tx, n = F.next[i]; if (n < 0 || n === i) return null;
  // aim two steps ahead for smoother corners
  const n2 = F.next[n] >= 0 ? F.next[n] : n;
  const ax = (n2 % F.w) + 0.5 - x, az = ((n2 / F.w) | 0) + 0.5 - z, l = Math.hypot(ax, az) || 1;
  return [ax / l, az / l];
}
export const flowDist = (F, x, z) => { const tx = Math.floor(x), tz = Math.floor(z); return tx < 0 || tz < 0 || tx >= F.w || tz >= F.h ? Infinity : F.dist[tz * F.w + tx]; };
