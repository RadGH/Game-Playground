// Seeded random streams (docs/10-TECH-DATA.md §4.4). mulberry32, the same algorithm as shared/ui.js
// rng(), so a seed means the same thing across the playground — but with state()/setState() for saves
// and named forks.

/** Mix any number of strings/numbers into one 32-bit seed (FNV-1a over their text, then avalanche). */
export function hashSeed(...parts) {
  let h = 2166136261 >>> 0;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    h ^= 0x9e37; h = Math.imul(h, 16777619) >>> 0;
  }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0; h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0; h ^= h >>> 16;
  return h >>> 0;
}

export function createRng(seed = 1) {
  let a = (seed >>> 0) || 1;
  const next = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const r = {
    next,
    /** integer in [lo, hi] inclusive */
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    range: (lo, hi) => lo + next() * (hi - lo),
    pick: arr => arr[Math.floor(next() * arr.length)],
    chance: p => next() < p,
    /** pick from a list of objects by weight field */
    weighted(list, key = 'w') {
      let total = 0; for (const e of list) total += e[key] || 0;
      let x = next() * total;
      for (const e of list) { x -= e[key] || 0; if (x < 0) return e; }
      return list[list.length - 1];
    },
    shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; },
    fork: name => createRng(hashSeed(a, name)),
    state: () => a,
    setState: s => { a = s >>> 0; },
  };
  return r;
}
