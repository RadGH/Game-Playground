// Seeded random numbers (mulberry32). Every random choice in a match comes from one of these, so a match can be
// replayed from its seed and a test can pin an outcome.
export function makeRng(seed = 1) {
  let a = (seed >>> 0) || 1;
  const next = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const rng = () => next();
  rng.int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));            // inclusive
  rng.range = (lo, hi) => lo + next() * (hi - lo);
  rng.pick = list => list[Math.floor(next() * list.length)];
  rng.shuffle = list => { const a2 = list.slice(); for (let i = a2.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [a2[i], a2[j]] = [a2[j], a2[i]]; } return a2; };
  rng.chance = p => next() < p;
  rng.fork = () => makeRng(Math.floor(next() * 4294967296));
  return rng;
}
export const hashStr = s => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
