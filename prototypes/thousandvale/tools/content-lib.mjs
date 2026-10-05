// Stream E — shared helpers for the content tools (assign-vignettes, place-vignettes) and stream E tests.
// Node only (reads files). Pure logic lives in the functions; nothing here writes.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { parseTerrain } from '../js/rules/terrain-read.js';

export const ROOT = new URL('../', import.meta.url);
export const J = p => JSON.parse(readFileSync(new URL(p, ROOT), 'utf8'));
export const VIGNETTE_FILES = ['data/vignettes/m1.json', 'data/vignettes/m2.json', 'data/vignettes/m2b.json'];
export const allVignettes = () => VIGNETTE_FILES.flatMap(f => J(f).vignettes);
const NOT_ZONE = new Set(['jobs.json', 'treasure.json', 'province.json', 'events.json']);
export const questFiles = () => readdirSync(new URL('data/quests/', ROOT)).filter(f => f.endsWith('.json') && !NOT_ZONE.has(f)).map(f => J('data/quests/' + f));

/** E zone id -> world zone id for a province (stream B's data/world/province-map.json). */
export const provinceMap = (prov = 'torbor_downs') => J('data/world/province-map.json').provinces[prov].map;

/**
 * Vignettes that quests, quest NPCs and treasure steps in a zone NAME — they have to be placed in that zone.
 * -> { <E zone id>: Set<vignette id> }
 */
export function pinnedVignettes() {
  const ids = new Set(allVignettes().map(v => v.id));
  const out = {};
  const add = (z, id) => { if (ids.has(id)) (out[z] ??= new Set()).add(id); };
  for (const q of questFiles()) {
    for (const n of Object.values(q.npcs || {})) add(q.zone, n.at);
    for (const qq of q.quests || []) {
      if (qq.startsFrom && qq.startsFrom.vignette) add(q.zone, qq.startsFrom.vignette);
      for (const s of qq.steps || []) if (s.vignette) add(q.zone, s.vignette);
    }
  }
  for (const c of J('data/quests/treasure.json').chains) for (const s of [...c.steps, c.cache]) if (typeof s.at === 'string') add(s.zone, s.at);
  return out;
}

/** Biome keys covering >= `min` of each baked zone (sampled every 32 m). -> { <E zone id>: [key…] (+ .water = share of samples under water) } */
export const WET_BIOMES = new Set(['lake', 'coast', 'beach', 'marsh']);
/** A vignette that only makes sense by water (every biome tag wet) does not go in a zone that has none of those biomes and (almost) no water. */
export const dryMismatch = (v, real) => !!real && v.tags.biomes.every(b => WET_BIOMES.has(b)) && !v.tags.biomes.some(b => real.includes(b)) && (real.water || 0) < 0.01;
export function measuredBiomes(prov = 'torbor_downs', min = 0.03) {
  const out = {};
  for (const [eid, wid] of Object.entries(provinceMap(prov))) {
    const f = new URL(`data/zones/${wid}/terrain.bin`, ROOT);
    if (!existsSync(f)) continue;
    const t = parseTerrain(readFileSync(f));
    const h = new Map(); let n = 0, wet = 0;
    for (let z = 16; z < t.extent; z += 32) for (let x = 16; x < t.extent; x += 32) {
      const px = t.bounds.minX + x, pz = t.bounds.minZ + z, k = t.biomes[t.biomeAt(px, pz)].key;
      h.set(k, (h.get(k) || 0) + 1); n++; if (t.waterAt(px, pz).depth > 0) wet++;
    }
    out[eid] = [...h].filter(([k, c]) => c / n >= min && k !== 'road').sort((a, b) => b[1] - a[1]).map(([k]) => k);
    out[eid].water = wet / n;
  }
  return out;
}
