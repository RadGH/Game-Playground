// Seeded random numbers. Same seed always gives the same sequence, so maps, waves and AI
// decisions can be replayed and tested. State is a single 32-bit number, so it saves easily.

export class Rng {
  constructor(seed = 1) {
    this.state = (seed >>> 0) || 1;
  }

  // mulberry32 — small, fast, good enough for games.
  next() {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min, max) { return min + this.next() * (max - min); }
  int(min, max) { return Math.floor(this.range(min, max + 1)); } // inclusive
  chance(p) { return this.next() < p; }
  pick(list) { return list[Math.floor(this.next() * list.length)]; }

  // Pick from [{w, ...}] or a {key: weight} object by weight.
  weighted(entries) {
    const list = Array.isArray(entries) ? entries : Object.entries(entries).map(([k, w]) => ({ k, w }));
    let total = 0;
    for (const e of list) total += Math.max(0, e.w);
    let r = this.next() * total;
    for (const e of list) { r -= Math.max(0, e.w); if (r <= 0) return e; }
    return list[list.length - 1];
  }

  shuffle(list) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }
}

// Turn any string into a 32-bit seed (for "type a word as the seed").
export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Cheap position hash used for per-cell color variation (not random state — pure function).
export function hash2(x, y) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}
