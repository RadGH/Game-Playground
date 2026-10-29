// Value noise for the map generator. PURE and deterministic: only + - * / and floor, and the
// position hash from rng.js — no Math.sin, no Math.random.

import { hash2 } from '../sim/rng.js';

const INV = 1 / 4294967296;

/** Value at an integer lattice point, in [0, 1). */
function lattice(ix, iy, salt) { return hash2(ix, iy, salt) * INV; }

/** Smooth value noise at (x, y) (lattice spacing 1), in [0, 1). */
export function valueNoise(x, y, salt = 0) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = lattice(ix, iy, salt), b = lattice(ix + 1, iy, salt);
  const c = lattice(ix, iy + 1, salt), d = lattice(ix + 1, iy + 1, salt);
  const top = a + (b - a) * sx, bot = c + (d - c) * sx;
  return top + (bot - top) * sy;
}

/** Fractal noise: `oct` octaves, each half the size and half the weight. Returns [0, 1). */
export function fbm(x, y, salt = 0, oct = 4) {
  let sum = 0, amp = 1, norm = 0, f = 1;
  for (let o = 0; o < oct; o++) {
    sum += valueNoise(x * f, y * f, salt + o * 101) * amp;
    norm += amp; amp *= 0.5; f *= 2;
  }
  return sum / norm;
}
