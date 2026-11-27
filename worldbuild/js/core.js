// World Build — small shared helpers: seeded randomness, grids, the GRID SPLIT height sampler, a binary heap and
// line helpers. Pure (no DOM, no three.js), so the same code runs in Node, in the page's worker and in tests.
//
// Noise and the seeded random generator are World Forge's (worldgen/js/noise.js); lines (smoothLine, segDist) are
// Oathwild's own (prototypes/oathwild/js/world/terrain.js), so a road drawn here bends exactly like one in the game.

export { makeNoise2D, fbm, ridged, billow, smoothstep, clamp, lerp, hashStr, makeRng, subSeed } from '../../worldgen/js/noise.js';
export { smoothLine, segDist } from '../../prototypes/oathwild/js/world/terrain.js';
import { makeRng, hashStr, clamp } from '../../worldgen/js/noise.js';

/** A random generator for one named job: same world seed + same label = the same numbers, whatever ran before. */
export const rngFor = (seed, label) => makeRng((hashStr(String(label)) ^ Math.imul(seed >>> 0, 2654435761)) >>> 0);

export const r2 = v => Math.round(v * 100) / 100;
export const r1 = v => Math.round(v * 10) / 10;

/**
 * A height-style grid: vertex (i, k) sits at (minX + i·cell, minZ + k·cell), index k·nx + i (terrain.js layout).
 * `sample` interpolates on the same two triangles per cell as Oathwild's terrain (GRID SPLIT: the diagonal runs
 * from (i, k+1) to (i+1, k)), so a mesh built from the grid is exactly the measured surface (lessons rule 22).
 */
export function makeGrid({ minX, minZ, cell, nx, nz }, Type = Float32Array, fill = 0) {
  const data = new Type(nx * nz);
  if (fill) data.fill(fill);
  return { minX, minZ, cell, nx, nz, data, maxX: minX + (nx - 1) * cell, maxZ: minZ + (nz - 1) * cell };
}
export function gridSample(g, x, z, arr = g.data) {
  const fx = clamp((x - g.minX) / g.cell, 0, g.nx - 1.000001), fz = clamp((z - g.minZ) / g.cell, 0, g.nz - 1.000001);
  const i = Math.floor(fx), k = Math.floor(fz), u = fx - i, v = fz - k, j = k * g.nx + i;
  const h00 = arr[j], h10 = arr[j + 1], h01 = arr[j + g.nx], h11 = arr[j + g.nx + 1];
  if (u + v <= 1) return h00 + (h10 - h00) * u + (h01 - h00) * v;
  return h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
}
/** Plain bilinear (for coarse fields where the triangle split does not matter). */
export function gridBilinear(g, x, z, arr = g.data) {
  const fx = clamp((x - g.minX) / g.cell, 0, g.nx - 1.000001), fz = clamp((z - g.minZ) / g.cell, 0, g.nz - 1.000001);
  const i = Math.floor(fx), k = Math.floor(fz), u = fx - i, v = fz - k, j = k * g.nx + i;
  return (arr[j] * (1 - u) + arr[j + 1] * u) * (1 - v) + (arr[j + g.nx] * (1 - u) + arr[j + g.nx + 1] * u) * v;
}
/** Nearest vertex index. */
export function gridNearest(g, x, z) {
  const i = clamp(Math.round((x - g.minX) / g.cell), 0, g.nx - 1), k = clamp(Math.round((z - g.minZ) / g.cell), 0, g.nz - 1);
  return k * g.nx + i;
}
/** Call fn(i, k, x, z, j) for every vertex within the square of half-size r round (x, z). */
export function gridBox(g, x, z, r, fn) {
  const i0 = Math.max(0, Math.floor((x - r - g.minX) / g.cell)), i1 = Math.min(g.nx - 1, Math.ceil((x + r - g.minX) / g.cell));
  const k0 = Math.max(0, Math.floor((z - r - g.minZ) / g.cell)), k1 = Math.min(g.nz - 1, Math.ceil((z + r - g.minZ) / g.cell));
  for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) fn(i, k, g.minX + i * g.cell, g.minZ + k * g.cell, k * g.nx + i);
}
/** Catmull-Rom (bicubic) sample of a coarse grid — smooth enough that an 8 m field upsampled to 2 m shows no facets. */
export function gridCubic(g, x, z, arr = g.data) {
  const fx = clamp((x - g.minX) / g.cell, 0, g.nx - 1.000001), fz = clamp((z - g.minZ) / g.cell, 0, g.nz - 1.000001);
  const i = Math.floor(fx), k = Math.floor(fz), u = fx - i, v = fz - k;
  const at = (ii, kk) => arr[clamp(kk, 0, g.nz - 1) * g.nx + clamp(ii, 0, g.nx - 1)];
  const cr = (a, b, c, d, t) => b + 0.5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * (b - c) + d - a)));
  const row = kk => cr(at(i - 1, kk), at(i, kk), at(i + 1, kk), at(i + 2, kk), u);
  return cr(row(k - 1), row(k), row(k + 1), row(k + 2), v);
}

/** A min-heap of (priority, value) pairs on typed arrays — Dijkstra / A* / priority flood over millions of cells. */
export function makeHeap(cap = 1024) {
  let pri = new Float64Array(cap), val = new Int32Array(cap), n = 0;
  const grow = () => { const p = new Float64Array(cap * 2), v = new Int32Array(cap * 2); p.set(pri); v.set(val); pri = p; val = v; cap *= 2; };
  return {
    get size() { return n; },
    push(p, v) {
      if (n >= cap) grow();
      let i = n++;
      while (i > 0) { const up = (i - 1) >> 1; if (pri[up] <= p) break; pri[i] = pri[up]; val[i] = val[up]; i = up; }
      pri[i] = p; val[i] = v;
    },
    topPri() { return pri[0]; },
    pop() {
      const out = val[0], lastP = pri[--n], lastV = val[n];
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && pri[c + 1] < pri[c]) c++;
        if (pri[c] >= lastP) break;
        pri[i] = pri[c]; val[i] = val[c]; i = c;
      }
      pri[i] = lastP; val[i] = lastV;
      return out;
    },
  };
}

/** Distance from (x, z) to a polyline [{x, z}…] (or [[x, z]…]). */
export function polyDist(x, z, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const ax = a.x ?? a[0], az = a.z ?? a[1], bx = b.x ?? b[0], bz = b.z ?? b[1];
    const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz;
    const t = L ? clamp(((x - ax) * dx + (z - az) * dz) / L, 0, 1) : 0;
    const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
    if (d < best) best = d;
  }
  return best;
}
/** Where segments p1-p2 and q1-q2 cross: { x, z, t, u } or null (same rule as terrain.js). */
export function segCross(p1, p2, q1, q2) {
  const rx = p2.x - p1.x, rz = p2.z - p1.z, sx = q2.x - q1.x, sz = q2.z - q1.z;
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((q1.x - p1.x) * sz - (q1.z - p1.z) * sx) / den;
  const u = ((q1.x - p1.x) * rz - (q1.z - p1.z) * rx) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: p1.x + rx * t, z: p1.z + rz * t, t, u };
}
/** Douglas-Peucker: keep the points needed to stay within `tol` metres of the line. */
export function simplify(pts, tol) {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let best = -1, bi = -1;
    for (let i = a + 1; i < b; i++) {
      const d = polyDist(pts[i][0], pts[i][1], [pts[a], pts[b]]);
      if (d > best) { best = d; bi = i; }
    }
    if (best > tol) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/**
 * Control points spaced evenly enough for Catmull-Rom (terrain.js smoothLine): long segments are split into parts of
 * at most `maxSeg` m, points closer than `minSeg` m are dropped. Uneven spacing (a 400 m segment next to a 10 m one)
 * makes the curve loop and leaves gaps of 20 m between its samples.
 */
export function evenPoints(pts, maxSeg = 14, minSeg = 3) {
  if (pts.length < 2) return pts.slice();
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = out[out.length - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < minSeg && i < pts.length - 1) continue;
    const n = Math.max(1, Math.ceil(L / maxSeg));
    for (let k = 1; k <= n; k++) out.push(k === n ? b : [Math.round((a[0] + (b[0] - a[0]) * k / n) * 100) / 100, Math.round((a[1] + (b[1] - a[1]) * k / n) * 100) / 100]);
  }
  if (out.length > 2) { const a = out[out.length - 2], b = out[out.length - 1]; if (Math.hypot(b[0] - a[0], b[1] - a[1]) < minSeg) out.splice(out.length - 2, 1); }
  return out;
}

/** A cheap 32-bit fingerprint of typed-array bytes (FNV-1a over the raw bytes) — determinism + pinned-area tests. */
export function fingerprint(...arrays) {
  let h = 2166136261 >>> 0;
  for (const a of arrays) {
    const b = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
    for (let i = 0; i < b.length; i++) { h ^= b[i]; h = Math.imul(h, 16777619) >>> 0; }
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
export function fingerprintText(s) { return (hashStr(s) >>> 0).toString(16).padStart(8, '0'); }

/** Stage timer: const t = timer(); …; t.lap('shape') → ms. Uses performance.now where it exists. */
export function timer() {
  const now = () => (globalThis.performance?.now ? performance.now() : Date.now());
  let last = now();
  const laps = {};
  return { lap(name) { const t = now(); laps[name] = Math.round(t - last); last = t; return laps[name]; }, laps };
}
