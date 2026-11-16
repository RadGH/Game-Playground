// Seeded smooth noise in WORLD tile coordinates. Because every region samples the same function at its own world
// position, terrain, coasts and biomes line up across region edges with no stitching.
export function hash2(seed, x, y) {
  let h = (seed | 0) ^ Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const fade = t => t * t * (3 - 2 * t);
/** Value noise, 0..1, cell size `scale` tiles. */
export function value(seed, x, y, scale) {
  const fx = x / scale, fy = y / scale, ix = Math.floor(fx), iy = Math.floor(fy), tx = fade(fx - ix), ty = fade(fy - iy);
  const a = hash2(seed, ix, iy), b = hash2(seed, ix + 1, iy), c = hash2(seed, ix, iy + 1), d = hash2(seed, ix + 1, iy + 1);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}
/** Fractal noise: octaves of value noise, 0..1. */
export function fbm(seed, x, y, scale, octaves = 4, gain = 0.5) {
  let sum = 0, amp = 1, norm = 0, s = scale;
  for (let i = 0; i < octaves; i++) { sum += value(seed + i * 1013, x, y, s) * amp; norm += amp; amp *= gain; s /= 2; if (s < 1) break; }
  return sum / norm;
}
