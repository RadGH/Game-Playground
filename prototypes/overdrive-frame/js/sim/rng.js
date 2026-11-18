// Seeded random numbers for the mission rules. Same seed → same mission, on every computer (the co-op server and each
// player run the same rules). The state is a plain number so a save or a network snapshot can carry it.

/** A random source whose whole state is `.s` (a 32-bit number). */
export function makeRng(seed = 1) {
  const R = {
    s: (seed >>> 0) || 1,
    next() {                       // mulberry32
      let t = (R.s = (R.s + 0x6D2B79F5) >>> 0);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    range(a, b) { return a + (b - a) * R.next(); },
    int(a, b) { return a + Math.floor(R.next() * (b - a + 1)); },
    pick(list) { return list[Math.floor(R.next() * list.length)]; },
    chance(p) { return R.next() < p; },
  };
  return R;
}

/** Mix numbers into one seed (mission seed + wave + spawn index…). */
export function mixSeed(...parts) {
  let h = 2166136261 >>> 0;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    h ^= 0x9e3779b9; h = Math.imul(h, 16777619) >>> 0;
  }
  return h || 1;
}
