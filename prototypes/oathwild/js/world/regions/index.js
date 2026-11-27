// Oathwild — the regions of a world (owner 2026-11-27: "new regions, separated by travel points and loading screens";
// docs/BRAINSTORM-2026-11-27-regions.md §1). The ONE reader of data/regions/index.json. Pure apart from reading files
// through js/world/boot.js readJson (fetch in a browser, fs under Node).
//
//   const index = await loadRegionIndex()                 the list: regions (name, levels, kind, loading), points, home
//   await bootRegion(id, { index, regions, home })        → W of that region (home = the Vale's W, already booted)
//   regionOf(index, id) · regionName(index, id)
//   pointsIn(index, W, id)                                 the travel points standing in region `id` (index + generator's)
//   pointById(index, places, id)                           a point anywhere: { ...point, region }
//   arrivalAt(point)                                       [x, z] a few metres in front of a point (where you arrive)
//
// A region of kind `wilds` is the Vale's map (js/world/boot.js bootWorld); `graveyard` = js/world/regions/graveyard.js;
// `dungeon` = js/world/dungeon/place.js. A new region of an existing kind is only a new data file + a row in the index.
import { readJson } from '../boot.js';

export const REGION_INDEX = new URL('../../../data/regions/index.json', import.meta.url);

export async function loadRegionIndex(read = readJson) {
  const idx = await read(REGION_INDEX);
  idx.points = Array.isArray(idx.points) ? idx.points : [];
  return idx;
}

export const regionOf = (index, id) => index?.regions?.[id] || null;
export const regionName = (index, id) => regionOf(index, id)?.name || id;
export const homeRegion = index => index?.home || 'vale';

/** Boot one region's place. The home region's W is booted by the host (it carries the map editor's layer). */
export async function bootRegion(id, { index, regions, home = null, read = readJson }) {
  const row = regionOf(index, id);
  if (!row) throw new Error(`oathwild: no region "${id}"`);
  let W;
  if (id === homeRegion(index)) W = home;
  else if (row.kind === 'graveyard') {
    W = await (await import('./graveyard.js')).bootGraveyard({ id, regions, read });
    // its camps, chests and roam rows join the rules' region table (js/rules/combat.js spawnCamp reads them there)
    if (regions?.regions && W.regionRules?.regions) Object.assign(regions.regions, W.regionRules.regions);
  }
  else if (row.kind === 'dungeon') W = await (await import('../dungeon/place.js')).bootDungeonPlace({ regions, file: row.data, read });
  else throw new Error(`oathwild: region "${id}" has kind "${row.kind}" with no generator`);
  W.region = id;
  W.regionRow = row;
  return W;
}

// A generator may name regions its own way (the graveyard: brightwater_vale, ashfield_catacombs) and give points as
// { name, arrive: [x, z], face, to: { region, point }, requires } — normalised here to the index's shape.
const REGION_ALIAS = { brightwater_vale: 'vale', thornmere_wilds: 'vale', ashfield_catacombs: 'catacombs' };
const POINT_ALIAS = { ashfield_gate: 'vale-east-road', crypt_stair: 'catacombs-main', ossuary_drop: 'catacombs-collapsed' };
function normPoint(p, region) {
  const to = typeof p.to === 'object' && p.to ? p.to : null;
  return {
    radius: 7, arrive: 6, ...p,
    label: p.label || (p.name ? p.name.replace(/^the /, 'The ') : 'The way on'),
    facing: p.facing ?? p.face ?? 0,
    to: to ? (POINT_ALIAS[to.point] || to.point) : p.to,
    toRegion: to ? (REGION_ALIAS[to.region] || to.region) : p.toRegion,
    region,
  };
}

/** Travel points in region `id`: the index's own rows plus the ones the region's generator placed (W.travel, W.entrances). */
export function pointsIn(index, W, id) {
  const out = (index?.points || []).filter(p => p.region === id).map(p => ({ ...p }));
  for (const p of [...(W?.travel || []), ...(W?.entrances || [])]) if (!out.some(q => q.id === p.id)) out.push(normPoint(p, id));
  // what is on the other side, for the prompt and the confirm window ("The road to Ashfield — levels 3-8")
  for (const p of out) {
    if (!p.to) continue;
    const dest = (index?.points || []).find(q => q.id === p.to);
    const toRegion = dest?.region || p.toRegion || null;
    if (toRegion) { p.toRegion = toRegion; p.toName = regionName(index, toRegion); p.toLevels = regionOf(index, toRegion)?.levels || null; }
  }
  return out;
}

/** A point by id in any booted region (places: id → { W }). */
export function pointById(index, places, id) {
  for (const [rid, P] of Object.entries(places || {})) {
    const hit = pointsIn(index, P.W, rid).find(p => p.id === id);
    if (hit) return hit;
  }
  return null;
}

/** Where you stand after arriving through a point: `arrive` metres in front of it, along its facing. */
export const arrivalAt = p => (Array.isArray(p.arrive) ? [...p.arrive] : [p.at[0] + Math.sin(p.facing || 0) * (p.arrive ?? 6), p.at[1] + Math.cos(p.facing || 0) * (p.arrive ?? 6)]);
