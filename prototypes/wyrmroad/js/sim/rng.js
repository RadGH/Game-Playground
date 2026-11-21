// Seeded random numbers (xorshift32): the same seed always plays the same fight.
export function rng(seed) {
  let s = (seed >>> 0) || 1;
  const f = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  f.state = () => s; f.set = v => { s = (v >>> 0) || 1; };
  return f;
}
export const pick = (rand, arr) => arr[Math.floor(rand() * arr.length)];
export const between = (rand, a, b) => a + (b - a) * rand();
