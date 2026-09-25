// Seedable random helper with every convenience the prototype needs (pick / range / chance / int / weighted / shuffle).
export function makeRng(seed) {
  let a = (seed ?? Math.floor(Math.random() * 1e9)) >>> 0;
  const next = () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  next.pick = arr => arr[Math.floor(next() * arr.length)]; next.range = (lo, hi) => lo + next() * (hi - lo); next.chance = p => next() < p;
  next.int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
  next.weighted = (items, w) => { let total = 0; for (const it of items) total += w(it); let r = next() * total; for (const it of items) { r -= w(it); if (r <= 0) return it; } return items[items.length - 1]; };
  next.shuffle = arr => { const c = [...arr]; for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; } return c; };
  return next;
}
