// Deterministic noise for the High Def world.
//
// Everything here is pure maths with no three.js and no browser API, so the node tests can load it
// and the same seed always produces the same landscape. Three kinds of noise are on offer:
//
//   value2/value3  — the cheap building block: random values on a lattice, smoothly interpolated.
//   fbm            — several octaves of value noise stacked, each one half the size and half the
//                    strength of the last. This is the "rolling hills" shape.
//   ridged         — fbm folded so the peaks come to a crease instead of a dome. This is mountains.
//
// On top of those there is domain warping (feed the noise a position that has itself been pushed
// around by more noise), which is the one trick that turns obviously-computery hills into terrain
// with valleys and spurs that look like water carved them.

/** A small fast seeded random number generator. Returns a function giving 0..1. */
export function makeRng(seed = 1) {
  let a = (seed >>> 0) || 1;
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer hash → 0..1. The backbone of every lattice below. */
function hash2(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function hash3(x, y, z, seed) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smootherstep: 6t^5 - 15t^4 + 10t^3. Used instead of a straight line so the lattice never shows. */
function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
function lerp(a, b, t) { return a + (b - a) * t; }

/** Value noise in 2D. Returns 0..1. */
export function value2(x, y, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = fade(xf), v = fade(yf);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

/** Value noise in 3D. Returns 0..1. */
export function value3(x, y, z, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = fade(xf), v = fade(yf), w = fade(zf);
  const c000 = hash3(xi, yi, zi, seed), c100 = hash3(xi + 1, yi, zi, seed);
  const c010 = hash3(xi, yi + 1, zi, seed), c110 = hash3(xi + 1, yi + 1, zi, seed);
  const c001 = hash3(xi, yi, zi + 1, seed), c101 = hash3(xi + 1, yi, zi + 1, seed);
  const c011 = hash3(xi, yi + 1, zi + 1, seed), c111 = hash3(xi + 1, yi + 1, zi + 1, seed);
  const x00 = lerp(c000, c100, u), x10 = lerp(c010, c110, u);
  const x01 = lerp(c001, c101, u), x11 = lerp(c011, c111, u);
  return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w);
}

/**
 * Fractal noise: octaves of value2 stacked. Returns roughly 0..1.
 * `lacunarity` is how much smaller each octave is, `gain` how much quieter.
 */
export function fbm(x, y, { seed = 0, octaves = 5, lacunarity = 2.0, gain = 0.5, freq = 1 } = {}) {
  let sum = 0, amp = 1, norm = 0, f = freq;
  for (let i = 0; i < octaves; i++) {
    sum += value2(x * f, y * f, seed + i * 1013) * amp;
    norm += amp;
    amp *= gain; f *= lacunarity;
  }
  return sum / norm;
}

/**
 * Ridged fractal noise: each octave is folded around its middle so the tops come to a sharp crease.
 * This is what gives mountain ridgelines instead of smooth blobs. Returns roughly 0..1.
 */
export function ridged(x, y, { seed = 0, octaves = 5, lacunarity = 2.0, gain = 0.5, freq = 1 } = {}) {
  let sum = 0, amp = 1, norm = 0, f = freq, prev = 1;
  for (let i = 0; i < octaves; i++) {
    let n = 1 - Math.abs(value2(x * f, y * f, seed + i * 7717) * 2 - 1);
    n *= n;                       // sharpen the crease
    sum += n * amp * prev;        // let the big ridges gate where the small ones appear
    prev = n;
    norm += amp;
    amp *= gain; f *= lacunarity;
  }
  return sum / norm;
}

/** Billowy noise — the opposite fold, giving puffy dune-like mounds. Returns roughly 0..1. */
export function billow(x, y, opts = {}) {
  const { seed = 0, octaves = 4, lacunarity = 2.0, gain = 0.5, freq = 1 } = opts;
  let sum = 0, amp = 1, norm = 0, f = freq;
  for (let i = 0; i < octaves; i++) {
    sum += Math.abs(value2(x * f, y * f, seed + i * 3301) * 2 - 1) * amp;
    norm += amp; amp *= gain; f *= lacunarity;
  }
  return sum / norm;
}

/**
 * Domain warp: move the sample point itself with two more noise fields before reading the real one.
 * A little of this (strength ~0.3) is the cheapest way to stop terrain looking like a blanket.
 */
export function warp2(x, y, { seed = 0, strength = 0.35, freq = 0.7 } = {}) {
  const qx = fbm(x * freq, y * freq, { seed: seed + 91, octaves: 3 }) * 2 - 1;
  const qy = fbm(x * freq + 5.2, y * freq + 1.3, { seed: seed + 193, octaves: 3 }) * 2 - 1;
  return [x + qx * strength, y + qy * strength];
}

/**
 * Worley / cellular noise: the distance to the nearest of a scattered set of points.
 * Returns { f1, f2, id } — f1 is the nearest distance (0..~1), f2 the second nearest, and the
 * difference between the two draws the cell walls, which is how you get cracked mud and rock joints.
 */
export function worley2(x, y, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let f1 = 9, f2 = 9, id = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = xi + dx, cy = yi + dy;
      const px = cx + hash2(cx, cy, seed);
      const py = cy + hash2(cx, cy, seed + 7);
      const d = Math.hypot(px - x, py - y);
      if (d < f1) { f2 = f1; f1 = d; id = (cx * 73856093) ^ (cy * 19349663); }
      else if (d < f2) { f2 = d; }
    }
  }
  return { f1, f2, id: id >>> 0 };
}

/** Clamp helper used all over the world builder. */
export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
/** Map a value from one range to another, clamped to 0..1 at the ends. */
export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0 || 1e-6), 0, 1);
  return t * t * (3 - 2 * t);
}
/** Straight-line remap with clamping. */
export function remap(x, a, b, c, d) { return c + (clamp((x - a) / (b - a || 1e-6), 0, 1)) * (d - c); }
