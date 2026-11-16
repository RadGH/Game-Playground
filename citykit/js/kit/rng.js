// Seeded random numbers: same seed → same building, every time (tests and the review page rely on it).
export function rng(seed = 1) {
  let s = (Math.floor(seed) >>> 0) || 1;
  const next = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const r = () => next();
  r.range = (a, b) => a + (b - a) * next();
  r.int = (a, b) => Math.floor(a + (b - a + 1) * next());
  r.pick = arr => arr[Math.floor(next() * arr.length)];
  r.chance = p => next() < p;
  r.fork = (k = 1) => rng(Math.floor(next() * 1e9) + k);
  return r;
}
