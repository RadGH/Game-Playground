// Seeded random numbers. Same seed, same sequence, every time.
export function hash(...parts) {
  let h = 2166136261 >>> 0;
  for (const p of parts) { const s = String(p); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } h ^= 0x9e3779b9; h = Math.imul(h, 2246822519) >>> 0; }
  return h >>> 0;
}
export function rng(seed) {
  let a = seed >>> 0 || 1;
  const r = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  r.int = (n) => Math.floor(r() * n);
  r.range = (a, b) => a + r() * (b - a);
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.weighted = (obj) => { let tot = 0; for (const k in obj) tot += obj[k]; let x = r() * tot; for (const k in obj) { x -= obj[k]; if (x <= 0) return k; } return Object.keys(obj)[0]; };
  r.state = () => a; r.setState = (s) => { a = s >>> 0; };
  return r;
}
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const TAU = Math.PI * 2;
