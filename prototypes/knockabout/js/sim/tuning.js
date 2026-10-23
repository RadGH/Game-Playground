// Knockabout — tuning and data loading. PURE: no DOM, no three.js.
// Works in Node (fs) and the browser (fetch + top-level await). No import attributes on purpose
// (they killed a live page on Steam Deck browsers before — see the playground's memory notes).

const IS_NODE = typeof process !== 'undefined' && !!(process.versions && process.versions.node) && typeof window === 'undefined';

/** Load a JSON file relative to this module (e.g. '../../data/tuning.json'). */
export async function loadJSON(rel) {
  const url = new URL(rel, import.meta.url);
  if (IS_NODE) {
    const fs = await import('node:fs');
    return JSON.parse(fs.readFileSync(url, 'utf8'));
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error('Knockabout: could not load ' + url + ' (' + res.status + ')');
  return res.json();
}

export const TUNING = await loadJSON('../../data/tuning.json');

/** Deep-merge `over` onto a copy of `base` (plain objects only; arrays replace). */
export function mergeTuning(base, over) {
  const out = JSON.parse(JSON.stringify(base));
  if (!over) return out;
  (function walk(dst, src) {
    for (const k of Object.keys(src)) {
      const v = src[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && dst[k] && typeof dst[k] === 'object') walk(dst[k], v);
      else dst[k] = v;
    }
  })(out, over);
  return out;
}

/** Seeded random numbers (mulberry32). Same seed, same sequence — everything random in the sim goes through this. */
export function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  const rng = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.range = (lo, hi) => lo + (hi - lo) * rng();
  rng.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * rng());
  rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
  return rng;
}
