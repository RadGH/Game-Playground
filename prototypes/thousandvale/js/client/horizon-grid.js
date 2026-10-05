// The far horizon's pure half (stream D): no three.js, no DOM — so horizon-worker.js can run it off the main thread,
// horizon.js can run it on the main thread when workers are missing, and node tests can run it as is.
//
// The grid is stream B's data/world/horizon.bin (js/rules/horizon-read.js): the whole world at 32 m, EXACT in baked
// zones (every sample is that zone's own ground sample). It is cut into square chunks of CHUNK samples (64 = one
// 2,048 m zone on high/medium, 128 = four zones on low so the far world is fewer draw calls); each chunk is built at a
// stride picked by its distance from the camera (1 = every sample, 2, 4, 8, 16), with a skirt hanging down from its
// edges so a coarse chunk beside a fine one, or beside a loaded zone, never shows a crack of sky.
//
//   const g = prepareGrid(arrayBuffer)              // { meta, W, H, step, drawn, wet, biome, palette }
//   gridHeightAt(g, x, z)                           // WORLD metres, the drawn surface (water = its surface)
//   buildChunk(g, ci, cj, chunk, stride, holes?)    // { pos, nor, col, idx, tris, ci, cj, stride } typed arrays
//   lodFor(dist, quality, current)                  // stride for a chunk `dist` metres away (with hysteresis)

import { parseHorizon } from '../rules/horizon-read.js';

/** Samples per chunk side by quality. 64 samples x 32 m = one 2,048 m zone. */
export const CHUNK = { high: 64, medium: 64, low: 128 };

/** [up to metres, stride] rings by quality; the last ring reaches the end of the world. */
export const LOD_RINGS = {
  high: [[2600, 1], [6500, 2], [13000, 4], [Infinity, 8]],
  medium: [[1800, 1], [5000, 2], [11000, 4], [Infinity, 8]],
  low: [[1500, 2], [5000, 4], [12000, 8], [Infinity, 16]],
};

/** Stride for a chunk whose nearest point is `dist` m from the camera. 10% hysteresis around each ring's edge. */
export function lodFor(dist, quality = 'high', current = 0) {
  const rings = LOD_RINGS[quality] || LOD_RINGS.high;
  let want = rings[rings.length - 1][1];
  for (const [r, s] of rings) if (dist <= r) { want = s; break; }
  if (current && current !== want) {
    // stay at the current stride while within 10% of the edge that separates it from `want`
    const ring = rings.find(([, s]) => s === Math.min(current, want));
    if (ring && Math.abs(dist - ring[0]) < ring[0] * 0.1) return current;
  }
  return want;
}

const srgbToLinear = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
function hexLinear(hex) {
  const v = parseInt(String(hex).replace('#', ''), 16) || 0;
  return [srgbToLinear(((v >> 16) & 255) / 255), srgbToLinear(((v >> 8) & 255) / 255), srgbToLinear((v & 255) / 255)];
}
const SEA = hexLinear('#2a5468'), LAKE = hexLinear('#2f6378'), ROCK = hexLinear('#7b766d'), SNOW = hexLinear('#e6eaee');

/** Parse horizon.bin and lay out what the mesh needs: drawn heights (water flattened to its surface), wet flags, biomes. */
export function prepareGrid(buffer) {
  const h = parseHorizon(buffer);
  const W = h.width, H = h.height, N = W * H;
  const hg = h.heightGrid(), wg = h.waterGrid();
  const drawn = new Float32Array(N), wet = new Uint8Array(N);
  for (let k = 0; k < N; k++) {
    const w = wg[k];
    if (w === w) { wet[k] = hg[k] < 0 || h.layers.biome[k] <= 2 ? 1 : 2; drawn[k] = Math.max(hg[k], w); }   // 1 sea, 2 lake/river
    else drawn[k] = hg[k];
  }
  const palette = (h.biomes || []).map(b => hexLinear(b[2]).map(c => c * 0.78));   // map colours are bright: toward the ground textures' tones
  return { meta: h.meta, W, H, step: h.step, drawn, wet, biome: h.layers.biome, palette };
}

/** The drawn surface at world metres: the triangle split horizon-read.js uses, clamped to the world. */
export function gridHeightAt(g, x, z) {
  const { W, H, step, drawn } = g;
  const cl = (v, a, b) => (v < a ? a : v > b ? b : v);
  const fx = cl((Number.isFinite(x) ? x : 0) / step, 0, W - 1.000001), fz = cl((Number.isFinite(z) ? z : 0) / step, 0, H - 1.000001);
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, w = fz - j;
  const h10 = drawn[j * W + i + 1], h01 = drawn[(j + 1) * W + i];
  if (u + w <= 1) { const h00 = drawn[j * W + i]; return h00 + (h10 - h00) * u + (h01 - h00) * w; }
  const h11 = drawn[(j + 1) * W + i + 1]; return h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - w);
}

/** Chunks across and down for a chunk size. */
export const chunkCounts = (g, chunk) => ({ cx: Math.ceil((g.W - 1) / chunk), cz: Math.ceil((g.H - 1) / chunk) });

/**
 * One chunk's geometry at a stride: a (n+1)² grid of vertices in WORLD metres (normals from central differences at the
 * same stride, so a coarse chunk is shaded like the land it stands for), plus a skirt — the edge ring again, dropped
 * by `skirtDepth(stride)` — so neighbours of another stride or a loaded zone meet without a gap. `holes` (the zones
 * loaded in full, world-metre rects) leaves out every cell under one, so nothing is drawn — or rasterised and thrown
 * away — beneath the real ground; zone edges fall on sample lines at every stride (64 is a multiple of 1..16).
 */
export function buildChunk(g, ci, cj, chunk, stride, holes = null) {
  const { W, H, step, drawn, wet, biome, palette } = g;
  const i0 = ci * chunk, j0 = cj * chunk;
  const n = Math.ceil(Math.min(chunk, W - 1 - i0) / stride), m = Math.ceil(Math.min(chunk, H - 1 - j0) / stride);
  const nx = n + 1, nz = m + 1, core = nx * nz, ring = 2 * (nx + nz) - 4, V = core + ring;
  const pos = new Float32Array(V * 3), nor = new Float32Array(V * 3), col = new Float32Array(V * 3);
  const si = a => Math.min(W - 1, i0 + a * stride), sj = b => Math.min(H - 1, j0 + b * stride);
  const hAt = (i, j) => drawn[(j < 0 ? 0 : j >= H ? H - 1 : j) * W + (i < 0 ? 0 : i >= W ? W - 1 : i)];
  for (let b = 0, v = 0; b < nz; b++) for (let a = 0; a < nx; a++, v++) {
    const i = si(a), j = sj(b), k = j * W + i, y = drawn[k];
    pos[v * 3] = i * step; pos[v * 3 + 1] = y; pos[v * 3 + 2] = j * step;
    const ddx = (hAt(i - stride, j) - hAt(i + stride, j)) / (2 * stride * step), ddz = (hAt(i, j - stride) - hAt(i, j + stride)) / (2 * stride * step);
    const len = Math.hypot(ddx, 1, ddz);
    const ny = 1 / len;
    nor[v * 3] = ddx / len; nor[v * 3 + 1] = ny; nor[v * 3 + 2] = ddz / len;
    let r, gg, bb;
    if (wet[k]) [r, gg, bb] = wet[k] === 1 ? SEA : LAKE;
    else {
      const p = palette[biome[k]] || palette[5] || [0.12, 0.25, 0.07];
      r = p[0]; gg = p[1]; bb = p[2];
      const steep = 1 - ny;                                         // 0 flat .. ~0.3 at 45°
      if (steep > 0.12) { const t = Math.min(1, (steep - 0.12) * 5); r += (ROCK[0] - r) * t; gg += (ROCK[1] - gg) * t; bb += (ROCK[2] - bb) * t; }
      if (y > 900) { const t = Math.min(1, (y - 900) / 300); r += (SNOW[0] - r) * t; gg += (SNOW[1] - gg) * t; bb += (SNOW[2] - bb) * t; }
    }
    col[v * 3] = r; col[v * 3 + 1] = gg; col[v * 3 + 2] = bb;
  }
  // the edge ring, walked once round (a along the top, down the right, back along the bottom, up the left)
  const edge = [];
  for (let a = 0; a < nx; a++) edge.push(a);
  for (let b = 1; b < nz; b++) edge.push(b * nx + n);
  for (let a = n - 1; a >= 0; a--) edge.push(m * nx + a);
  for (let b = m - 1; b >= 1; b--) edge.push(b * nx);
  const drop = skirtDepth(stride);
  edge.forEach((src, e) => {
    const v = core + e;
    for (let c = 0; c < 3; c++) { pos[v * 3 + c] = pos[src * 3 + c]; nor[v * 3 + c] = nor[src * 3 + c]; col[v * 3 + c] = col[src * 3 + c]; }
    pos[v * 3 + 1] -= drop;
  });
  const hs = (holes || []).filter(h => h.maxX > i0 * step && h.minX < si(n) * step && h.maxZ > j0 * step && h.minZ < sj(m) * step);
  const inHole = (a, b) => {
    if (!hs.length) return false;
    const x = (si(a) + si(a + 1)) * 0.5 * step, z = (sj(b) + sj(b + 1)) * 0.5 * step;
    for (const h of hs) if (x > h.minX && x < h.maxX && z > h.minZ && z < h.maxZ) return true;
    return false;
  };
  const maxTris = n * m * 2 + edge.length * 2;
  const full = V > 65535 ? new Uint32Array(maxTris * 3) : new Uint16Array(maxTris * 3);
  let q = 0;
  for (let b = 0; b < m; b++) for (let a = 0; a < n; a++) {
    if (inHole(a, b)) continue;
    const p = b * nx + a, p1 = p + 1, r = p + nx, r1 = r + 1;
    full[q++] = p; full[q++] = r; full[q++] = p1; full[q++] = p1; full[q++] = r; full[q++] = r1;
  }
  const idx = full;
  // skirt quads: both windings so it reads from either side (it is a wall hanging under an edge)
  for (let e = 0; e < edge.length; e++) {
    const a0 = edge[e], a1 = edge[(e + 1) % edge.length], s0 = core + e, s1 = core + (e + 1) % edge.length;
    idx[q++] = a0; idx[q++] = a1; idx[q++] = s0;
    idx[q++] = a1; idx[q++] = s1; idx[q++] = s0;
  }
  const tris = q / 3;
  const bounds = { minX: i0 * step, minZ: j0 * step, maxX: si(n) * step, maxZ: sj(m) * step };
  return { ci, cj, stride, pos, nor, col, idx: q === full.length ? full : full.slice(0, q), tris, bounds, holed: hs.length > 0 };
}

/** How far a chunk's skirt hangs: enough to cover the step between a chunk and a neighbour drawn twice as coarse. */
export const skirtDepth = stride => 12 + stride * 14;

/** Chunk rectangle in world metres (before building it). */
export function chunkRect(g, ci, cj, chunk) {
  const s = g.step;
  return { minX: ci * chunk * s, minZ: cj * chunk * s, maxX: Math.min(g.W - 1, (ci + 1) * chunk) * s, maxZ: Math.min(g.H - 1, (cj + 1) * chunk) * s };
}

/** Distance from a point to a rectangle in xz (0 inside). */
export function rectDistance(r, x, z) {
  const dx = x < r.minX ? r.minX - x : x > r.maxX ? x - r.maxX : 0, dz = z < r.minZ ? r.minZ - z : z > r.maxZ ? z - r.maxZ : 0;
  return Math.hypot(dx, dz);
}

/** Is rect `r` covered by the union of `holes`? (checked on a 2,048 m lattice — loaded zones are zone-aligned) */
export function coveredBy(r, holes, cell = 2048) {
  if (!holes.length) return false;
  for (let z = r.minZ + cell / 2; z < r.maxZ; z += cell) for (let x = r.minX + cell / 2; x < r.maxX; x += cell) {
    if (!holes.some(h => x > h.minX && x < h.maxX && z > h.minZ && z < h.maxZ)) return false;
  }
  return true;
}

/** Does any hole overlap rect `r` (without covering it)? Such a chunk is built with the holes cut out. */
export const touchedBy = (r, holes) => holes.some(h => h.maxX > r.minX && h.minX < r.maxX && h.maxZ > r.minZ && h.minZ < r.maxZ);
