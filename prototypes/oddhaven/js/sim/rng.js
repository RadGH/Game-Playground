// Seeded random numbers. The state is one uint32 kept in the world state (s.rng), so a save carries it and
// nothing here holds anything between calls.

/** Next float in 0..1 and advance s.rng (mulberry32). */
export function rand(s) {
  s.rng = (s.rng + 0x6D2B79F5) | 0;
  let x = s.rng;
  x = Math.imul(x ^ (x >>> 15), x | 1);
  x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
}
export const randInt = (s, lo, hi) => lo + Math.floor(rand(s) * (hi - lo + 1));
export const pick = (s, list) => list[Math.floor(rand(s) * list.length)];
export function pickWeighted(s, list, weightOf) {
  let total = 0;
  for (const it of list) total += weightOf(it);
  let r = rand(s) * total;
  for (const it of list) { r -= weightOf(it); if (r <= 0) return it; }
  return list[list.length - 1];
}
export function shuffle(s, list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand(s) * (i + 1));
    const t = list[i]; list[i] = list[j]; list[j] = t;
  }
  return list;
}
/** FNV-1a of a string, as 8 hex digits. */
export function hashString(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, '0');
}
