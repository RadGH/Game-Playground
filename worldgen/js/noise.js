// Noise for the world generator. Pure functions, no DOM, no dependencies — written here so a game can
// vendor this one file. Everything is seeded: the same seed always gives the same field.
//
//   import { makeNoise2D, makeNoise3D, fbm, ridged, warp2, makeRng } from './noise.js';
//   const n = makeNoise2D(1234);
//   const h = fbm(n, x * 0.01, y * 0.01, { octaves: 5, gain: 0.5, lacunarity: 2 });   // 0..1
//
// The 2D/3D noise is simplex (gradient noise on a simplex grid): cheap, no visible grid lines, and
// the gradient table is shuffled by the seed so two seeds give completely different worlds.

/** mulberry32 — small seeded random. rng() → 0..1, plus .int/.range/.pick/.weighted helpers. */
export function makeRng(seed) {
  let a = (seed ?? Math.floor(Math.random() * 1e9)) >>> 0;
  const next = () => {
    a += 0x6D2B79F5; let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (lo, hi) => lo + next() * (hi - lo);
  next.int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
  next.pick = arr => arr[Math.floor(next() * arr.length)];
  next.weighted = (items, w) => { let total = 0; for (const it of items) total += w(it); let r = next() * total; for (const it of items) { r -= w(it); if (r <= 0) return it; } return items[items.length - 1]; };
  next.shuffle = arr => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
  return next;
}

/** Stable 32-bit hash of a string — for deriving sub-seeds ("rivers", "moisture", …) from one world seed. */
export function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
/** Derive a child seed from a parent seed and a label, so each pass has its own noise but one seed rules them all. */
export function subSeed(seed, label) { return (hashStr(label) ^ Math.imul(seed >>> 0, 2654435761)) >>> 0; }

const GRAD2 = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
const GRAD3 = [[1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1], [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]];

function permTable(seed) {
  const rng = makeRng(seed); const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  rng.shuffle(p);
  const perm = new Uint8Array(512); for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  return perm;
}

const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;

/** 2D simplex noise for a seed. Returns f(x, y) → about -1..1. */
export function makeNoise2D(seed) {
  const perm = permTable(seed);
  return function noise2(xin, yin) {
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s), j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t), y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let n = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) { const g = GRAD2[perm[ii + perm[jj]] & 7]; t0 *= t0; n += t0 * t0 * (g[0] * x0 + g[1] * y0); }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) { const g = GRAD2[perm[ii + i1 + perm[jj + j1]] & 7]; t1 *= t1; n += t1 * t1 * (g[0] * x1 + g[1] * y1); }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) { const g = GRAD2[perm[ii + 1 + perm[jj + 1]] & 7]; t2 *= t2; n += t2 * t2 * (g[0] * x2 + g[1] * y2); }
    return 70 * n;
  };
}

const F3 = 1 / 3, G3 = 1 / 6;

/** 3D simplex noise for a seed. Handy for wrapping a map around a cylinder, or for animated fields. */
export function makeNoise3D(seed) {
  const perm = permTable(seed ^ 0x9e3779b9);
  return function noise3(xin, yin, zin) {
    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s), j = Math.floor(yin + s), k = Math.floor(zin + s);
    const t = (i + j + k) * G3;
    const x0 = xin - (i - t), y0 = yin - (j - t), z0 = zin - (k - t);
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
      else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
    } else {
      if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
      else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
      else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    }
    const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 3 * G3, y3 = y0 - 1 + 3 * G3, z3 = z0 - 1 + 3 * G3;
    const ii = i & 255, jj = j & 255, kk = k & 255;
    let n = 0;
    const corner = (tt, gi, x, y, z) => { if (tt <= 0) return 0; const g = GRAD3[gi % 12]; const t2 = tt * tt; return t2 * t2 * (g[0] * x + g[1] * y + g[2] * z); };
    n += corner(0.6 - x0 * x0 - y0 * y0 - z0 * z0, perm[ii + perm[jj + perm[kk]]], x0, y0, z0);
    n += corner(0.6 - x1 * x1 - y1 * y1 - z1 * z1, perm[ii + i1 + perm[jj + j1 + perm[kk + k1]]], x1, y1, z1);
    n += corner(0.6 - x2 * x2 - y2 * y2 - z2 * z2, perm[ii + i2 + perm[jj + j2 + perm[kk + k2]]], x2, y2, z2);
    n += corner(0.6 - x3 * x3 - y3 * y3 - z3 * z3, perm[ii + 1 + perm[jj + 1 + perm[kk + 1]]], x3, y3, z3);
    return 32 * n;
  };
}

/**
 * Fractal noise (fBm): several octaves of the same noise at doubling frequency and halving amplitude.
 * opts: { octaves=5, gain=0.5, lacunarity=2, freq=1 }. Result is normalised to 0..1.
 */
export function fbm(noise, x, y, opts = {}) {
  const { octaves = 5, gain = 0.5, lacunarity = 2, freq = 1 } = opts;
  let amp = 1, f = freq, sum = 0, norm = 0;
  for (let o = 0; o < octaves; o++) { sum += amp * noise(x * f, y * f); norm += amp; amp *= gain; f *= lacunarity; }
  return (sum / norm) * 0.5 + 0.5;
}

/** Ridged multifractal: 1-|noise| per octave, which turns smooth hills into sharp ridge lines (mountain spines). */
export function ridged(noise, x, y, opts = {}) {
  const { octaves = 5, gain = 0.5, lacunarity = 2, freq = 1, sharpness = 2 } = opts;
  let amp = 1, f = freq, sum = 0, norm = 0, prev = 1;
  for (let o = 0; o < octaves; o++) {
    let n = 1 - Math.abs(noise(x * f, y * f));
    n = Math.pow(n, sharpness);
    sum += amp * n * prev; norm += amp; prev = n * 0.5 + 0.5;
    amp *= gain; f *= lacunarity;
  }
  return sum / norm;
}

/** Billowy noise: |noise| per octave — rounded lumps, good for dunes and cloud-ish fields. */
export function billow(noise, x, y, opts = {}) {
  const { octaves = 4, gain = 0.5, lacunarity = 2, freq = 1 } = opts;
  let amp = 1, f = freq, sum = 0, norm = 0;
  for (let o = 0; o < octaves; o++) { sum += amp * Math.abs(noise(x * f, y * f)); norm += amp; amp *= gain; f *= lacunarity; }
  return sum / norm;
}

/**
 * Domain warp: offset the sample point by another noise field before sampling. This is what stops
 * coastlines looking like soap bubbles — it stretches and folds them.
 * Returns { x, y } to sample with.
 */
export function warp2(nx, ny, x, y, amount = 1, freq = 1) {
  const wx = nx(x * freq, y * freq), wy = ny(x * freq + 5.2, y * freq + 1.3);
  return { x: x + wx * amount, y: y + wy * amount };
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** Rescale an array in place so its values span 0..1. Returns { min, max }. */
export function normalize(arr) {
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < arr.length; i++) { if (arr[i] < min) min = arr[i]; if (arr[i] > max) max = arr[i]; }
  const span = max - min || 1;
  for (let i = 0; i < arr.length; i++) arr[i] = (arr[i] - min) / span;
  return { min, max };
}

/** Value of the array at a given fraction of the sorted order (0.5 = median). Used to pick a sea level that hits a target ocean share. */
export function quantile(arr, q) {
  const copy = Float64Array.from(arr); copy.sort();
  return copy[clamp(Math.floor(q * (copy.length - 1)), 0, copy.length - 1)];
}

/** One pass of a 3x3 box blur over a width×height array. Cheap smoothing for climate fields. */
export function blur(arr, width, height, passes = 1) {
  let src = arr, tmp = new Float32Array(arr.length);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      let sum = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
        sum += src[yy * width + xx]; n++;
      }
      tmp[y * width + x] = sum / n;
    }
    src.set(tmp);
  }
  return arr;
}
