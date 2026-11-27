// Oathwild — load the world content (map, placements, quests, NPCs) and build the terrain + quest book once.
// The only file under js/world/ that reads files (fetch in a browser, fs under Node), like js/rules/boot.js.
//
//   const W = await bootWorld({ regions: rules.data.regions })   → { data, terrain, book }
//   WORLD_DATA_FILES / loadWorldData(readJson)                    for hosts that read files their own way

import { createTerrain } from './terrain.js';
import { createQuestBook } from './quests.js';
import { planTowns } from './town.js';
import { normEdits, applyPlaceEdits } from './edits.js';

export const WORLD_DATA_FILES = { map: '../../data/map.json', placements: '../../data/placements.json', quests: '../../data/quests.json', npcs: '../../data/npcs.json', towns: '../../data/towns.json' };

export async function loadWorldData(readJson) {
  const out = {};
  for (const [k, p] of Object.entries(WORLD_DATA_FILES)) out[k] = await readJson(new URL(p, import.meta.url));
  // the map editor's layer (js/world/edits.js); a missing file = no edits
  try { out.edits = normEdits(await readJson(new URL('../../data/edits.json', import.meta.url))); } catch { out.edits = normEdits(null); }
  return out;
}

/** Read one JSON file (fetch in a browser, the file system under Node) — the arena's loader uses it too (js/world/arena-place.js). */
export async function readJson(url) {
  if (typeof process !== 'undefined' && process.versions?.node && url.protocol === 'file:') {
    const { readFile } = await import('node:fs/promises');
    return JSON.parse(await readFile(url, 'utf8'));
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error(`oathwild world data: ${url} -> HTTP ${r.status}`);
  return r.json();
}

/** `regions` = data/regions.json (rules.data.regions) — camps and chests live there. */
export async function bootWorld({ regions, data = null } = {}) {
  const d = data || await loadWorldData(readJson);
  d.edits = normEdits(d.edits);
  // untouched copy: a rebuild after a live edit starts again from this (js/world/live.js); below moves things in place
  const pristine = JSON.parse(JSON.stringify(d));
  const terrain = createTerrain(d.map, { ground: d.edits.ground });
  // moved shrines / chests / camps / props / NPC spots, and heights under ground strokes (same on server and browser)
  const editOrphans = applyPlaceEdits(d, terrain);
  // the towns (js/world/town.js): houses, yards, lamps, villagers; a townsperson stands at their work spot
  const town = planTowns(terrain, d.towns || {}, { placements: d.placements, npcs: d.npcs?.npcs });
  for (const [id, s] of Object.entries(town.spots)) { const n = d.npcs?.npcs?.[id]; if (n) { n.at = s.at; n.face = s.face; n.idle = s.idle; } }
  // an NPC the editor moved stands where it was put, also in town
  for (const [ref, mv] of Object.entries(d.edits.moves)) { const [g, id] = ref.split(':'); const n = g === 'npcs' && d.npcs?.npcs?.[id]; if (n && Array.isArray(mv.at)) { n.at = [...mv.at]; if (Number.isFinite(mv.facing)) n.face = mv.facing; } }
  const book = createQuestBook({ ...d, regions });
  return { data: d, terrain, book, town, editOrphans, pristine };
}
