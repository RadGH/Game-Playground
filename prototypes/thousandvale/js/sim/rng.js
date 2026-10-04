// Copied from prototypes/bannerline/js/sim/rng.js (2026-10-04), unchanged below this line.
// Seeded random numbers for the sim: sfc32, state kept as a plain [a,b,c,d] array of uint32 so it
// lives inside sim state (snapshots and hashes include it). Each stream (combat, loot, ai, shop) is
// its own array, so drawing loot never shifts the combat sequence.
//
//   const s = seedStream(seed, 'combat');  next(s) -> [0,1)   int(s, n) -> 0..n-1
//
// Pure arithmetic; the same seed gives the same sequence on every JS engine.

function splitmix(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  };
}

/** FNV-1a of a short string, used to give each named stream its own seed. */
function saltOf(name) {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) { h ^= name.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/** A fresh stream state for (seed, name). */
export function seedStream(seed, name = '') {
  const sm = splitmix((seed ^ saltOf(name)) >>> 0);
  const s = [sm(), sm(), sm(), sm()];
  for (let i = 0; i < 12; i++) next(s);   // warm up
  return s;
}

/** Next uint32; mutates the stream array. */
export function nextU32(s) {
  const t = (((s[0] + s[1]) >>> 0) + s[3]) >>> 0;
  s[3] = (s[3] + 1) >>> 0;
  s[0] = (s[1] ^ (s[1] >>> 9)) >>> 0;
  s[1] = (s[2] + (s[2] << 3)) >>> 0;
  s[2] = ((s[2] << 21) | (s[2] >>> 11)) >>> 0;
  s[2] = (s[2] + t) >>> 0;
  return t >>> 0;
}

/** Float in [0, 1). */
export function next(s) { return nextU32(s) / 4294967296; }
/** Integer in [0, n). */
export function int(s, n) { return Math.floor(next(s) * n); }
/** Float in [a, b). */
export function range(s, a, b) { return a + (b - a) * next(s); }
/** One element of a non-empty array. */
export function pick(s, arr) { return arr[int(s, arr.length)]; }
/** True with probability p. */
export function chance(s, p) { return next(s) < p; }
