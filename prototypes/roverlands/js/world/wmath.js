// Small maths for the world generator that gives the SAME answer on every JavaScript engine.
//
// The world is generated on every player's machine from the seed, and the object list must come out identical on
// all of them (object ids are indices, and "object 812 was broken" has to mean the same tree everywhere). IEEE-754
// promises that + - * / and Math.sqrt are correctly rounded, so they agree bit for bit across Chrome, Safari and
// Firefox. Math.sin / cos / exp / pow / atan2 / hypot do NOT carry that promise — two engines may differ in the last
// bit, and a tree that sits exactly on a threshold can then exist on one machine and not the other. So nothing that
// decides a height, a surface or an object uses them: `dsin` / `dcos` below are plain polynomials, and the noise we
// import from highdef-3d/js/noise.js is built from integer hashes and polynomials only.
//
// (Yaw angles handed to the renderer are allowed to use atan2 — a 1e-16 rad difference in how a fence panel is turned
// changes nothing that is shared.)

import { value2 } from '../../../../highdef-3d/js/noise.js';

export { value2 };
export const PI = 3.141592653589793;
export const TAU = 6.283185307179586;
const HALF_PI = 1.5707963267948966;

/** Deterministic sine: range-reduce to [-pi/2, pi/2], then a Taylor series good to ~1e-9. */
export function dsin(x) {
  x -= TAU * Math.floor((x + PI) / TAU);          // [-pi, pi)
  if (x > HALF_PI) x = PI - x; else if (x < -HALF_PI) x = -PI - x;
  const x2 = x * x;
  return x * (1 - x2 / 6 * (1 - x2 / 20 * (1 - x2 / 42 * (1 - x2 / 72 * (1 - x2 / 110 * (1 - x2 / 156))))));
}
export const dcos = (x) => dsin(x + HALF_PI);

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export function smoothstep(e0, e1, x) {
  let t = (x - e0) / (e1 - e0);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return t * t * (3 - 2 * t);
}

/** Fractal value noise, ~0..1. Same algorithm as noise.js fbm but with plain arguments (no per-call object). */
export function fbm(x, y, seed, oct = 4) {
  let s = 0, a = 1, n = 0, f = 1;
  for (let i = 0; i < oct; i++) { s += value2(x * f, y * f, seed + i * 1013) * a; n += a; a *= 0.5; f *= 2; }
  return s / n;
}
/** Ridged noise, ~0..1, creases on top (mountain ridges). */
export function ridged(x, y, seed, oct = 4) {
  let s = 0, a = 1, n = 0, f = 1, prev = 1;
  for (let i = 0; i < oct; i++) {
    let v = 1 - Math.abs(value2(x * f, y * f, seed + i * 7717) * 2 - 1);
    v *= v; s += v * a * prev; prev = v; n += a; a *= 0.5; f *= 2;
  }
  return s / n;
}

/** Seeded 0..1 generator (mulberry32) — integer maths only. */
export function makeRng(seed) {
  let a = (seed >>> 0) || 0x9e3779b9;
  return function rng() {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Integer hash of a few ints -> 0..1 (for per-cell decisions that must not depend on visiting order). */
export function hash01(a, b, c = 0) {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
