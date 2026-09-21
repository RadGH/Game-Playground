// Loads ../data/elements.json once, in a page or in node, and hands back the two tables.
//
//   import { BASELINE, RARE, RARE_BY_KEY, rareFor } from './elements.js';
//
// The JSON file is the single source of truth (a game can read it directly without any of this
// code). The module uses top-level await, so importers just get the data — no load() call.

const url = new URL('../data/elements.json', import.meta.url);

let raw;
/**
 * "In a browser?" is `process`, not `window`.
 *
 * This used to ask for `window`, which a page has and **a Web Worker does not** — so any worker
 * that reached this module took the node branch and died on `import('node:fs')`, with the only
 * symptom being "Failed to fetch dynamically imported module: node:fs" on the page that started it.
 * Farhold's title-screen map preview (prototypes/farhold/js/worldpreview-worker.js) builds a whole
 * world off the main thread and imports system.js, which imports this, which is how it turned up.
 * Node 18+ has a global `fetch` too, so asking for `fetch` alone would not have worked either.
 */
if (typeof process === 'undefined' || !process.versions?.node) {
  raw = await (await fetch(url)).json();
} else {
  const { readFileSync } = await import('node:fs');
  raw = JSON.parse(readFileSync(url, 'utf8'));
}

/** The four materials every world carries in some amount. */
export const BASELINE = raw.baseline;
/** The interesting half: 1–2 of these per planet, drawn by archetype. */
export const RARE = raw.rare;
export const BASELINE_BY_KEY = Object.fromEntries(BASELINE.map(e => [e.key, e]));
export const RARE_BY_KEY = Object.fromEntries(RARE.map(e => [e.key, e]));
export const ELEMENTS = raw;

/** Every rare element that can turn up on a given planet archetype. */
export function rareFor(archetype) { return RARE.filter(e => e.worlds.includes(archetype)); }

/** Look up either table by key. */
export function elementByKey(key) { return RARE_BY_KEY[key] || BASELINE_BY_KEY[key] || null; }
