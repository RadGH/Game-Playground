// Seeded random numbers and trig tables for the sim. PURE: no Math.random, no clock.
//
// The generator is xoshiro128** (four 32-bit words of state). `split(name)` gives each system its
// own stream, derived from the master seed and the system's NAME, so adding a new system never
// shifts the numbers an existing one draws (PLAN §4.3).
//
// Trig: `sinT(a)` / `cosT(a)` take an angle in 1/1024 of a turn and return a fixed-point value in
// 1/65536. The table is built with a Taylor series that only uses + * /, so every browser and node
// build the same table bit for bit (Math.sin is allowed to differ in the last bit between engines).

/** 32-bit string hash (FNV-1a), used to name streams. */
export function hashStr(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** splitmix32: spreads one 32-bit number into a well-mixed one. */
export function mix32(x) {
  x = (x + 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

/** Hash of an integer position (and an optional salt): same input always gives the same output. */
export function hash2(x, y, salt = 0) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(salt | 0, 0x9e3779b1);
  return mix32(h >>> 0);
}

/**
 * Create a generator. `seed` is a number; `state` (optional) restores a saved [u32 x4].
 * Methods: next() u32, float() [0,1), int(n) [0,n), range(a,b) [a,b], chance(p), pick(arr),
 * split(name) → a new independent generator, save() → [u32 x4].
 */
export function createRng(seed, state = null) {
  const s = new Uint32Array(4);
  if (state) s.set(state);
  else {
    let x = (seed >>> 0) || 1;
    for (let i = 0; i < 4; i++) { x = mix32(x + i * 0x632be5ab); s[i] = x; }
    if (!(s[0] | s[1] | s[2] | s[3])) s[0] = 1;
  }
  const seed0 = seed >>> 0;
  function rotl(v, k) { return ((v << k) | (v >>> (32 - k))) >>> 0; }
  function next() {
    const result = Math.imul(rotl(Math.imul(s[1], 5) >>> 0, 7), 9) >>> 0;
    const t = (s[1] << 9) >>> 0;
    s[2] ^= s[0]; s[3] ^= s[1]; s[1] ^= s[2]; s[0] ^= s[3];
    s[2] ^= t; s[3] = rotl(s[3], 11);
    return result;
  }
  const rng = {
    next,
    /** [0,1) with 32 bits of precision. */
    float() { return next() / 4294967296; },
    /** Integer in [0, n). */
    int(n) { return n <= 1 ? 0 : Math.floor((next() / 4294967296) * n); },
    /** Integer in [a, b] inclusive. */
    range(a, b) { return a + Math.floor((next() / 4294967296) * (b - a + 1)); },
    chance(p) { return next() / 4294967296 < p; },
    pick(arr) { return arr[Math.floor((next() / 4294967296) * arr.length)]; },
    /** An independent stream named after a system. Depends on the master seed and the name only. */
    split(name) { return createRng(mix32(seed0 ^ hashStr(name))); },
    save() { return Array.from(s); },
    load(st) { s.set(st); },
  };
  return rng;
}

// ---- Trig tables --------------------------------------------------------------------------------

export const ANGLES = 1024; // one turn
const SIN = new Int32Array(ANGLES);
(function buildSin() {
  // Taylor series on [-pi, pi], using only + * / (bit-identical across engines).
  const PI = 3.141592653589793;
  for (let i = 0; i < ANGLES; i++) {
    let x = (i / ANGLES) * 2 * PI;
    if (x > PI) x -= 2 * PI;
    let term = x, sum = x;
    for (let n = 1; n < 12; n++) {
      term = (-term * x * x) / ((2 * n) * (2 * n + 1));
      sum += term;
    }
    SIN[i] = Math.round(sum * 65536);
  }
})();

/** sin of an angle in 1/1024 turn, as fixed point 1/65536. */
export function sinT(a) { return SIN[a & (ANGLES - 1)]; }
/** cos of an angle in 1/1024 turn, as fixed point 1/65536. */
export function cosT(a) { return SIN[(a + 256) & (ANGLES - 1)]; }

/** Integer square root (floor). */
export function isqrt(n) {
  if (n <= 0) return 0;
  return Math.floor(Math.sqrt(n)); // sqrt is correctly rounded by IEEE 754, so this is the same everywhere
}

/** 8 compass directions (0 = east, counter-clockwise in screen space where +y is south). */
export const DIR8 = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
