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

// ---------------------------------------------------------------- play-test 8 (W18): far hills and mountains are WOODED
//
// "Mountains in the distance lack trees. In Oregon, mountains are covered in trees!" The horizon painted every biome
// its map colour and turned anything steeper than ~28 degrees to bare rock, so the far hills (the two commonest land
// biomes here are Hills and Mountains) were smooth olive and grey. Two things fix that, both decided by ONE rule:
//
//   treeCover(biomeKey, y, steep, patch)  -> 0..1   how wooded a sample is
//
//   * the TINT: the ground colour is pulled toward that biome's canopy colour by the cover, AFTER the rock tint, so a
//     wooded slope is dark green right up to the tree line and only cliffs and summits show stone;
//   * the SHAPES: on the nearest horizon ring (stride 1) wooded cells grow small four-sided spires — one stands for a
//     clump of trees — built into the chunk's own geometry in the worker. Same mesh, same material, no extra draw call;
//     the silhouette of a far ridge is a ragged tree line instead of a smooth painted hill.
/** How wooded each biome is at its best (0 = never a tree). Keys are horizon.bin's biome keys. */
export const TREE_COVER = {
  temperateForest: 1, rainforest: 1, borealForest: 1, blighted: 0.9, hallowed: 0.7, mountains: 0.8, hills: 0.62, veiledHills: 0.5,
  orchard: 0.55, marsh: 0.35, shrubland: 0.3, grassland: 0.16, savanna: 0.1, graveyard: 0.25, pasture: 0.04,
};
/** Canopy colour by biome (sRGB hex): conifers are darker and bluer than broadleaf woods. */
export const CANOPY = { default: '#2c5f2e', temperateForest: '#2f6a33', rainforest: '#1d5a2c', borealForest: '#1f4a36', mountains: '#234f38', hills: '#2f6130', blighted: '#3a2c48', hallowed: '#6fbf8a', veiledHills: '#3d4a5c', marsh: '#35553a', savanna: '#5a6a2e' };
/**
 * Ground palettes by region (stream T, docs/EXPANSION-1.md): Vharlen, the Burning Isle, uses the same biome ids as the
 * rest of the world but they mean other ground there (js/client/terrain-view.js GROUND_PALETTES): black sand for
 * `beach`, sulphur for `desert`, pumice for `ashPlain`… Inside a region's rectangle (world metres; the island's block,
 * tools/lib/world-core.mjs CONTINENTS) the horizon paints with that region's colours, cover and canopy instead.
 */
export const GROUND_REGIONS = [{ palette: 'vharl', minX: 22528, minZ: 18432, maxX: 28672, maxZ: 24576 },
  // Torbor Downs regenerated (play-test 12, #81): its own biome looks (terrain-view.js GROUND_PALETTES.downs)
  { palette: 'downs', minX: 22528, minZ: 2048, maxX: 30720, maxZ: 10240 }];
export const REGION_PALETTES = {
  vharl: {
    colors: { beach: '#2e2c2b', coast: '#2e2c2b', desert: '#c8b03a', ashPlain: '#a19c94', badlands: '#3c3a3c', volcanic: '#5e3a30', glimmerwaste: '#2a2433',
      marsh: '#4a3f30', mountains: '#353336', rainforest: '#2b5a30', shrubland: '#4f6a3a', savanna: '#6a6a48', blighted: '#4a4440', road: '#6a5f52' },
    cover: { rainforest: 1, shrubland: 0.45, savanna: 0.15, marsh: 0.15, blighted: 0.22 },
    canopy: { default: '#2b4a2a', rainforest: '#24512a', shrubland: '#3d5a2c', savanna: '#4f5a2e', marsh: '#3e4a30', blighted: '#2a2624' },
    rock: '#3a383b',
  },
  downs: {
    colors: { grassland: '#6f9a48', temperateForest: '#3f6a34', borealForest: '#2f4f40', hills: '#7a5a6a', hallowed: '#8aa858', marsh: '#3e5038',
      badlands: '#9a5a3c', shrubland: '#9a9030', savanna: '#b09a50', veiledHills: '#3a3034', tundra: '#7f877a', mountains: '#7b766d', snowyPeaks: '#d8dce0', beach: '#c8c0ae', road: '#7a6446' },
    cover: { temperateForest: 1, borealForest: 1, hallowed: 0.45, hills: 0.12, marsh: 0.25, shrubland: 0.12, savanna: 0.08, veiledHills: 0.35, grassland: 0.12, tundra: 0.05, badlands: 0.06, mountains: 0.3 },
    canopy: { default: '#2c5f2e', temperateForest: '#2f6a33', borealForest: '#1f4a36', hallowed: '#4f8a3a', hills: '#3a4a2c', marsh: '#3a5536', veiledHills: '#2a2226', savanna: '#5a6a2e', shrubland: '#5a5a24' },
    rock: '#7b766d',
  },
};
/** The region palette a world point is drawn with (null = the world's own). */
export function regionAt(x, z) { for (const r of GROUND_REGIONS) if (x >= r.minX && x < r.maxX && z >= r.minZ && z < r.maxZ) return r.palette; return null; }

/** Trees thin out between these heights (metres) and stop: the snow tint starts at 900, so the last trees stand in the first snow. */
export const TREE_LINE = { from: 780, to: 940 };
/**
 * Slope (1 - normal.y): full cover up to `from` (about 49 degrees), none past `to` (60 degrees: a cliff). Measured before
 * choosing: a quarter of this world's Mountains cells are steeper than 53 degrees — with a real forest's 40-degree limit
 * the range the owner was looking at stayed two-thirds bare.
 */
export const TREE_SLOPE = { from: 0.34, to: 0.5 };
/** Most tree spires in one chunk by quality (4 triangles each). Low draws the tint only. */
export const TREE_SPIRES = { high: 2400, medium: 1000, low: 0 };
const sstep = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
/**
 * Pure: how wooded a sample is. `patch` (0..1, a slow noise) breaks the cover into woods and clearings: full forest
 * biomes stay nearly solid, half-wooded ones (hills) become stands of trees with open ground between.
 */
export function treeCover(biomeKey, y = 0, steep = 0, patch = 0.5, table = TREE_COVER) {
  const base = table[biomeKey] || 0;
  if (!base || y < 0.5) return 0;
  const height = 1 - sstep(TREE_LINE.from, TREE_LINE.to, y), slope = 1 - sstep(TREE_SLOPE.from, TREE_SLOPE.to, steep);
  const clump = base >= 0.95 ? 0.8 + 0.2 * patch : sstep(1 - base - 0.22, 1 - base + 0.22, patch) * (0.55 + 0.45 * base) + base * 0.18;
  return Math.max(0, Math.min(1, clump * height * slope));
}
/** A stable 0..1 number for a lattice point (no state: a tree stands where it stood last frame and last session). */
export function hash2(i, j, k = 0) { let h = (Math.imul(i | 0, 374761393) ^ Math.imul(j | 0, 668265263) ^ Math.imul(k | 0, 1274126177)) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

/**
 * Play-test 11 (Z25, live #26: "trees on distant mountains are very low res … their low quality model is particularly
 * bad"): one far tree. It was a four-sided pyramid (5 vertices, 4 triangles); now a two-tier SIX-sided conifer — a broad
 * lower skirt of boughs and a narrower upper crown, darker underneath and catching the light at the tips, each tree a
 * little lighter or darker than its neighbours — 14 vertices, 12 triangles. `old: true` keeps the pyramid (`?spire=4`).
 */
export const SPIRE = Object.freeze({ verts: 14, tris: 12, oldVerts: 5, oldTris: 4 });
export function writeSpire(pos, nor, col, o, x, y, z, hgt, rad, turn, gn, cc, tint = 1, old = false) {
  const put = (v, px, py, pz, ax, ay, az, k) => {
    const vi = (o + v) * 3, nl = Math.hypot(ax, ay, az) || 1;
    pos[vi] = px; pos[vi + 1] = py; pos[vi + 2] = pz;
    nor[vi] = ax / nl; nor[vi + 1] = ay / nl; nor[vi + 2] = az / nl;
    col[vi] = cc[0] * k * tint; col[vi + 1] = cc[1] * k * tint; col[vi + 2] = cc[2] * k * tint;
  };
  if (old) {
    for (let q = 0; q < 5; q++) {
      const ang = turn + q * 1.5708, top = q === 4;
      put(q, top ? x : x + Math.cos(ang) * rad, top ? y + hgt : y - 1.5, top ? z : z + Math.sin(ang) * rad, gn[0] + (top ? 0 : Math.cos(ang) * 0.45), gn[1], gn[2] + (top ? 0 : Math.sin(ang) * 0.45), top ? 1.25 : 0.72);
    }
    return 5;
  }
  // tier 1: a wide skirt from just under the ground to 62 % up; tier 2: a crown from 34 % up to the top
  const tiers = [[y - 1.5, rad, y + hgt * 0.62, 0.62, 0.98], [y + hgt * 0.34, rad * 0.66, y + hgt, 0.8, 1.28]];
  let v = 0;
  for (const [y0, r, yTop, kBase, kTop] of tiers) {
    for (let q = 0; q < 6; q++) {
      const ang = turn + q * 1.0472;
      put(v++, x + Math.cos(ang) * r, y0, z + Math.sin(ang) * r, gn[0] + Math.cos(ang) * 0.7, gn[1] + 0.25, gn[2] + Math.sin(ang) * 0.7, kBase);
    }
    put(v++, x, yTop, z, gn[0], gn[1] + 1, gn[2], kTop);
  }
  return 14;
}
/** Index the triangles of a spire written at vertex `o` into idx at `q`; returns the new q. */
export function indexSpire(idx, q, o, old = false) {
  if (old) { for (let f = 0; f < 4; f++) { idx[q++] = o + f; idx[q++] = o + 4; idx[q++] = o + (f + 1) % 4; } return q; }
  for (let t = 0; t < 2; t++) { const b = o + t * 7; for (let f = 0; f < 6; f++) { idx[q++] = b + f; idx[q++] = b + 6; idx[q++] = b + (f + 1) % 6; } }
  return q;
}
/** Slow value noise over the sample lattice (cells of `cell` samples), 0..1: where the woods are. */
export function patchNoise(i, j, cell = 9) {
  const x = i / cell, z = j / cell, x0 = Math.floor(x), z0 = Math.floor(z), u = x - x0, w = z - z0, su = u * u * (3 - 2 * u), sw = w * w * (3 - 2 * w);
  const a = hash2(x0, z0, 7), b = hash2(x0 + 1, z0, 7), c = hash2(x0, z0 + 1, 7), e = hash2(x0 + 1, z0 + 1, 7);
  const big = (a + (b - a) * su) * (1 - sw) + (c + (e - c) * su) * sw;
  return Math.max(0, Math.min(1, big * 0.8 + hash2(i >> 1, j >> 1, 3) * 0.2));
}

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
  // W18: per biome id, its key (for the cover table) and its canopy colour
  const keys = (h.biomes || []).map(b => b[0]), canopy = keys.map(k => hexLinear(CANOPY[k] || CANOPY.default));
  // per region palette: the same arrays by biome id, drawn inside that region's rectangle
  const regions = {};
  for (const [name, P] of Object.entries(REGION_PALETTES)) {
    regions[name] = {
      palette: keys.map((k, i) => (P.colors[k] ? hexLinear(P.colors[k]).map(c => c * 0.78) : palette[i])),
      canopy: keys.map(k => hexLinear(P.canopy[k] || P.canopy.default)), cover: P.cover, rock: hexLinear(P.rock),
    };
  }
  return { meta: h.meta, W, H, step: h.step, drawn, wet, biome: h.layers.biome, palette, keys, canopy, regions };
}
/** The arrays to colour a sample with: the region's if the point lies in one, else the world's. */
function paintFor(g, x, z) {
  const r = g.regions && regionAt(x, z);
  const R = r && g.regions[r];
  return R ? { palette: R.palette, canopy: R.canopy, cover: R.cover, rock: R.rock } : { palette: g.palette, canopy: g.canopy || [], cover: TREE_COVER, rock: ROCK };
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
export function buildChunk(g, ci, cj, chunk, stride, holes = null, opts = null) {
  const { W, H, step, drawn, wet, biome, palette } = g;
  const keys = g.keys || [], canopy = g.canopy || [], wooded = opts?.trees !== false && keys.length > 0;
  const maxSpires = stride === 1 && wooded ? Math.max(0, opts?.spires | 0) : 0;
  const i0 = ci * chunk, j0 = cj * chunk;
  const n = Math.ceil(Math.min(chunk, W - 1 - i0) / stride), m = Math.ceil(Math.min(chunk, H - 1 - j0) / stride);
  const nx = n + 1, nz = m + 1, core = nx * nz, ring = 2 * (nx + nz) - 4, V = core + ring;
  let pos = new Float32Array(V * 3), nor = new Float32Array(V * 3), col = new Float32Array(V * 3);
  const cover = maxSpires ? new Float32Array(core) : null;
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
    const PT = paintFor(g, i * step, j * step), pal = PT.palette, ROCKc = PT.rock;
    if (wet[k]) [r, gg, bb] = wet[k] === 1 ? SEA : LAKE;
    else {
      const p = pal[biome[k]] || pal[5] || [0.12, 0.25, 0.07];
      r = p[0]; gg = p[1]; bb = p[2];
      const steep = 1 - ny;                                         // 0 flat .. ~0.3 at 45°
      if (steep > 0.12) { const t = Math.min(1, (steep - 0.12) * 5); r += (ROCKc[0] - r) * t; gg += (ROCKc[1] - gg) * t; bb += (ROCKc[2] - bb) * t; }
      // W18: wooded ground is canopy-coloured — after the rock tint, so a forested slope stays green up to the tree line
      if (wooded) {
        const cv = treeCover(keys[biome[k]], y, steep, patchNoise(i, j), PT.cover);
        if (cv > 0.01) {
          const cc = PT.canopy[biome[k]] || PT.canopy[5], mottle = 0.86 + 0.28 * hash2(i, j, 11), t = Math.min(0.92, cv * 1.05);
          r += (cc[0] * mottle - r) * t; gg += (cc[1] * mottle - gg) * t; bb += (cc[2] * mottle - bb) * t;
          if (cover) cover[v] = cv;
        }
      }
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
  // W18: tree spires on wooded cells (stride 1 only: a cell is one 32 m sample square). Up to two a cell by cover, each
  // at a stable spot inside it; when a chunk has more wooded cells than its budget, every k-th one is kept (evenly thinned).
  const spires = [];
  if (maxSpires && cover) {
    let wantN = 0;
    for (let b = 0; b < m; b++) for (let a = 0; a < n; a++) { const cv = cover[b * nx + a]; if (cv > 0.2 && !inHole(a, b)) wantN += cv > 0.6 ? 2 : 1; }
    const keep = wantN > maxSpires ? maxSpires / wantN : 1;
    for (let b = 0; b < m; b++) for (let a = 0; a < n; a++) {
      const v = b * nx + a, cv = cover[v];
      if (!(cv > 0.2) || inHole(a, b)) continue;
      const i = si(a), j = sj(b);
      for (let t = 0; t < (cv > 0.6 ? 2 : 1); t++) {
        if (keep < 1 && hash2(i, j, 20 + t) > keep) continue;
        if (hash2(i, j, 30 + t) > cv * 1.15) continue;                 // thin cover = fewer of its cells carry a clump
        const u = 0.15 + 0.7 * hash2(i, j, 40 + t), w = 0.15 + 0.7 * hash2(i, j, 50 + t);
        const h00 = pos[v * 3 + 1], h10 = pos[(v + 1) * 3 + 1], h01 = pos[(v + nx) * 3 + 1], h11 = pos[(v + nx + 1) * 3 + 1];
        const y = (h00 * (1 - u) + h10 * u) * (1 - w) + (h01 * (1 - u) + h11 * u) * w;
        spires.push(v, (i + u) * step, y, (j + w) * step, 9 + 9 * hash2(i, j, 60 + t), 5.5 + 4 * hash2(i, j, 70 + t), hash2(i, j, 80 + t));
      }
    }
  }
  const oldSp = opts?.spire === 4, SV = oldSp ? SPIRE.oldVerts : SPIRE.verts, ST = oldSp ? SPIRE.oldTris : SPIRE.tris;
  const nSp = spires.length / 7, V2 = V + nSp * SV;
  if (nSp) {
    const grow = a => { const o = new Float32Array(V2 * 3); o.set(a); return o; };
    pos = grow(pos); nor = grow(nor); col = grow(col);
    for (let s = 0; s < nSp; s++) {
      const src = spires[s * 7], x = spires[s * 7 + 1], y = spires[s * 7 + 2], z = spires[s * 7 + 3], hgt = spires[s * 7 + 4], rad = spires[s * 7 + 5], turn = spires[s * 7 + 6] * 1.5708;
      const k = (sj(Math.floor(src / nx)) * W + si(src % nx)), cn = paintFor(g, x, z).canopy, cc = cn[biome[k]] || cn[5] || [0.03, 0.1, 0.03];
      // lit like the slope it stands on (the sides lean out so they catch the sun differently)
      writeSpire(pos, nor, col, V + s * SV, x, y, z, hgt, rad, turn, [nor[src * 3], nor[src * 3 + 1], nor[src * 3 + 2]], cc, 0.88 + 0.24 * spires[s * 7 + 6], oldSp);
    }
  }
  const maxTris = n * m * 2 + edge.length * 2 + nSp * ST;
  const full = V2 > 65535 ? new Uint32Array(maxTris * 3) : new Uint16Array(maxTris * 3);
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
  for (let s = 0; s < nSp; s++) q = indexSpire(idx, q, V + s * SV, oldSp);
  const tris = q / 3;
  const bounds = { minX: i0 * step, minZ: j0 * step, maxX: si(n) * step, maxZ: sj(m) * step };
  return { ci, cj, stride, pos, nor, col, idx: q === full.length ? full : full.slice(0, q), tris, bounds, holed: hs.length > 0, spires: nSp };
}

/** Biomes whose slopes the zone bake leaves bare (no scatter trees) and the canopy fills in INSIDE loaded zones. */
export const CANOPY_BIOMES = ['mountains'];
/** Most canopy spires in one chunk inside loaded zones, by quality. */
export const CANOPY_SPIRES = { high: 3600, medium: 1600, low: 0 };      // (looked at: 1,500 left the near range mostly bare rock)
/**
 * W18, the other half: the mountains the owner was looking at are two kilometres off — inside a zone that is loaded in
 * full, where the horizon is cut away and the ground is the real terrain. The zone bake scatters almost no trees on the
 * Mountains biome, so those slopes were bare rock. This builds ONLY tree spires, for the cells of this chunk that lie
 * UNDER the loaded zones (`holes`) and whose biome is in CANOPY_BIOMES, by the same cover rule and at the same stable
 * spots as the horizon's own (so a slope does not change when its zone loads). They are distant dressing — nothing you
 * can bump into — on ground steep enough that nobody walks it. -> { pos, nor, col, idx, tris, spires } or null.
 */
export function buildCanopy(g, ci, cj, chunk, holes = null, opts = null) {
  const { W, H, step, drawn, wet, biome } = g, keys = g.keys || [], canopy = g.canopy || [];
  const max = Math.max(0, opts?.spires | 0), allow = new Set(opts?.biomes || CANOPY_BIOMES);
  if (!max || !holes?.length || !keys.length) return null;
  const i0 = ci * chunk, j0 = cj * chunk, n = Math.min(chunk, W - 1 - i0), m = Math.min(chunk, H - 1 - j0);
  const inHole = (x, z) => { for (const h of holes) if (x > h.minX && x < h.maxX && z > h.minZ && z < h.maxZ) return true; return false; };
  const hAt = (i, j) => drawn[(j < 0 ? 0 : j >= H ? H - 1 : j) * W + (i < 0 ? 0 : i >= W ? W - 1 : i)];
  const list = [];
  for (let b = 0; b < m; b++) for (let a = 0; a < n; a++) {
    const i = i0 + a, j = j0 + b, k = j * W + i;
    if (wet[k] || !allow.has(keys[biome[k]]) || !inHole((i + 0.5) * step, (j + 0.5) * step)) continue;
    const ddx = (hAt(i - 1, j) - hAt(i + 1, j)) / (2 * step), ddz = (hAt(i, j - 1) - hAt(i, j + 1)) / (2 * step), len = Math.hypot(ddx, 1, ddz);
    const cv = treeCover(keys[biome[k]], drawn[k], 1 - 1 / len, patchNoise(i, j), paintFor(g, i * step, j * step).cover);
    if (!(cv > 0.2)) continue;
    // up close a slope needs more trees than a far ridge does: up to five clumps a 32 m cell (the first two stand where the
    // horizon's own stood, so the slope does not rearrange itself when its zone loads)
    for (let t = 0; t < Math.round(1 + cv * 4); t++) {
      if (hash2(i, j, 30 + t) > cv * 1.15) continue;
      const u = 0.1 + 0.8 * hash2(i, j, 40 + t), w = 0.1 + 0.8 * hash2(i, j, 50 + t);
      const y = (hAt(i, j) * (1 - u) + hAt(i + 1, j) * u) * (1 - w) + (hAt(i, j + 1) * (1 - u) + hAt(i + 1, j + 1) * u) * w;
      list.push([(i + u) * step, y, (j + w) * step, 9 + 9 * hash2(i, j, 60 + t), 5.5 + 4 * hash2(i, j, 70 + t), hash2(i, j, 80 + t) * 1.5708, ddx / len, 1 / len, ddz / len, biome[k], hash2(i, j, 20 + t)]);
    }
  }
  if (!list.length) return null;
  const keep = list.length > max ? max / list.length : 1, kept = keep < 1 ? list.filter(s => s[10] <= keep) : list, N = kept.length;
  if (!N) return null;
  const oldSp = opts?.spire === 4, SV = oldSp ? SPIRE.oldVerts : SPIRE.verts, ST = oldSp ? SPIRE.oldTris : SPIRE.tris;
  const pos = new Float32Array(N * SV * 3), nor = new Float32Array(N * SV * 3), col = new Float32Array(N * SV * 3), idx = N * SV > 65535 ? new Uint32Array(N * ST * 3) : new Uint16Array(N * ST * 3);
  // Z25: the root of every tree (x, y, z, height, turn) — near-trees.js swaps the nearest for real kit trees
  const roots = new Float32Array(N * 5);
  let q = 0;
  kept.forEach(([x, y, z, hgt, rad, turn, nx0, ny0, nz0, bi], s) => {
    const cc = paintFor(g, x, z).canopy[bi] || canopy[bi] || [0.03, 0.1, 0.03];
    writeSpire(pos, nor, col, s * SV, x, y, z, hgt, rad, turn, [nx0, ny0, nz0], cc, 0.88 + 0.24 * (turn / 1.5708), oldSp);
    q = indexSpire(idx, q, s * SV, oldSp);
    roots.set([x, y, z, hgt, turn], s * 5);
  });
  return { ci, cj, pos, nor, col, idx, tris: N * ST, spires: N, roots, sv: SV };
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
