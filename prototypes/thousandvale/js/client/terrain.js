// The client's ground: the SAME terrain the server walks on.
//
//   joined.room.terrain = 'test'  -> data/zones/test/terrain.bin through stream B's reader
//                                    (js/rules/terrain-read.js — drawn = measured, one diagonal)
//   joined.room.terrain = null    -> stream A's stand-in field (js/sim/terrain.js standInTerrain(1, 2048))
//
// Both come back in one shape the mesh, the scatter and prediction read:
//   { key, heightAt, walkable, waterAt, slopeDeg, biomeKey, bounds, origin, extent, res, step,
//     heightGrid(), waterGrid(), spawn, sites, name }

import { parseTerrain } from '../rules/terrain-read.js';
import { standInTerrain } from '../sim/terrain.js';
import { parseScatter } from '../rules/terrain-read.js';
import { perf } from './perf.js';

const cache = new Map();

export function loadClientTerrain(key) {
  const k = key || 'standin';
  if (!cache.has(k)) cache.set(k, key ? loadZone(key).catch(err => { console.warn('[terrain] zone', key, 'failed, using the stand-in:', err.message); return standin(); }) : Promise.resolve(standin()));
  return cache.get(k);
}

async function loadZone(key) {
  const res = await fetch(new URL(`../../data/zones/${encodeURIComponent(key)}/terrain.bin`, import.meta.url));
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const buf = await res.arrayBuffer();
  const t = perf.span('zone:parse', () => parseTerrain(buf));
  return {
    key, name: t.meta.name || key, reader: t,
    heightAt: t.heightAt, walkable: t.walkable, groundAt: t.groundAt ? (x, z) => t.groundAt(x, z) : null,
    waterAt: (x, z) => t.waterAt(x, z), moveAt: t.moveAt ? (x, z) => t.moveAt(x, z) : null,
    slopeDeg: (x, z) => t.slopeAt(x, z),
    biomeKey: (x, z) => t.biomes[t.biomeAt(x, z)]?.key || 'grassland',
    bounds: t.bounds, origin: t.origin, extent: t.extent, res: t.size, step: t.step,
    heightGrid: () => t.heightGrid(), waterGrid: () => t.waterGrid(),
    spawn: t.meta.spawn || { x: t.origin.x + t.extent / 2, z: t.origin.z + t.extent / 2 },
    sites: t.meta.sites || [],
  };
}

/** The stand-in field has no grid of its own; sample it at 4 m so the mesh has one (it is smooth). */
function standin() {
  const s = standInTerrain(1, 2048);
  const step = 4, res = Math.round(s.size / step) + 1;
  let grid = null;
  const heightGrid = () => {
    if (!grid) { grid = new Float32Array(res * res); for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) grid[j * res + i] = s.heightAt(s.origin.x + i * step, s.origin.z + j * step); }
    return grid;
  };
  const slopeDeg = (x, z) => {
    const e = 1, dx = (s.heightAt(x + e, z) - s.heightAt(x - e, z)) / (2 * e), dz = (s.heightAt(x, z + e) - s.heightAt(x, z - e)) / (2 * e);
    return Math.atan(Math.hypot(dx, dz)) * 180 / Math.PI;
  };
  return {
    key: null, name: 'The Vale', heightAt: s.heightAt, walkable: s.walkable,
    waterAt: () => ({ kind: 'none', surface: NaN, depth: 0 }), slopeDeg, biomeKey: () => 'grassland',
    bounds: s.bounds, origin: s.origin, extent: s.size, res, step,
    heightGrid, waterGrid: () => null, spawn: s.spawn, sites: [],
  };
}

// ---------------------------------------------------------------------------------------------------
// M2: a province is many zones stitched edge to edge in WORLD metres (js/sim/province-terrain.js: zone
// (zx, zy) covers x in [zx*2048, zx*2048 + 2048]). Each zone's files are zone-local; `worldZone` moves one
// into world metres without copying a sample, so its mesh, scatter and placements all land where the
// server's composite reader says they are.

/** A zone's side layers: scatter.bin and placements.json (both optional — the M0 test zone has neither). */
export async function loadZoneExtras(key) {
  const base = new URL(`../../data/zones/${encodeURIComponent(key)}/`, import.meta.url);
  const json = u => fetch(u).then(r => (r.ok ? r.json() : null)).catch(() => null);
  const [scatter, placements, vigW] = await Promise.all([
    fetch(new URL('scatter.bin', base)).then(r => (r.ok ? r.arrayBuffer() : null)).then(b => (b ? parseScatter(b) : null)).catch(() => null),
    json(new URL('placements.json', base)),
    json(new URL(`../../vignettes/placements/${encodeURIComponent(key)}.json`, base)),
  ]);
  // vignette placements may be filed under stream E's zone id (data/world/province-map.json)
  let vig = vigW;
  if (!vig) {
    const map = await provinceMap();
    const eid = map.byWorld[key];
    if (eid) vig = await json(new URL(`../../vignettes/placements/${encodeURIComponent(eid)}.json`, base));
  }
  return { scatter, placements: placements ? placements.placements || [] : [], vignettes: vig ? vig.placements || [] : [], vignetteFile: vig || null, vignetteHash: vig ? vig.terrainHash || null : null };
}

/** The same terrain shape, offset by (ox, oz) into world metres. */
export function worldZone(T, ox, oz) {
  if (!ox && !oz) return { ...T, ox: 0, oz: 0 };
  const b = T.bounds;
  return {
    ...T, ox, oz,
    heightAt: (x, z) => T.heightAt(x - ox, z - oz),
    groundAt: T.groundAt ? (x, z) => T.groundAt(x - ox, z - oz) : null,
    walkable: (x, z) => T.walkable(x - ox, z - oz),
    waterAt: (x, z) => T.waterAt(x - ox, z - oz),
    moveAt: T.moveAt ? (x, z) => T.moveAt(x - ox, z - oz) : null,
    slopeDeg: (x, z) => T.slopeDeg(x - ox, z - oz),
    biomeKey: (x, z) => T.biomeKey(x - ox, z - oz),
    bounds: { minX: b.minX + ox, minZ: b.minZ + oz, maxX: b.maxX + ox, maxZ: b.maxZ + oz },
    origin: { x: T.origin.x + ox, z: T.origin.z + oz },
    spawn: { x: T.spawn.x + ox, z: T.spawn.z + oz },
    sites: (T.sites || []).map(s => ({ ...s, x: s.x + ox, z: s.z + oz })),
  };
}

/** Which zone cell a world point is in (the province's own rule). */
export const ZONE_M = 2048;
export const zoneCell = (x, z) => [Math.floor(x / ZONE_M), Math.floor(z / ZONE_M)];
/** Distance from a point to a rectangle (0 inside). */
export function rectDist(b, x, z) {
  const dx = Math.max(b.minX - x, 0, x - b.maxX), dz = Math.max(b.minZ - z, 0, z - b.maxZ);
  return Math.hypot(dx, dz);
}
/**
 * Which zones to have loaded for a point: the one you stand in plus any whose edge is within `near`
 * metres; anything already loaded stays until it is `far` away (no flapping at a border).
 */
export function zonesWanted(zones, x, z, loaded = new Set(), { near = 450, far = 900, max = 4 } = {}) {
  const ranked = zones.map(q => ({ key: q.key, d: rectDist(q.bounds, x, z) })).sort((a, b) => a.d - b.d);
  const out = [];
  for (const r of ranked) {
    if (out.length >= max) break;
    if (r.d === 0 || r.d < near || (loaded.has(r.key) && r.d < far)) out.push(r.key);
  }
  return out;
}

/** data/world/province-map.json as { provinces, byWorld: { worldZone: eZone } } (cached). */
let pmap = null;
export function provinceMap() {
  if (!pmap) pmap = fetch(new URL('../../data/world/province-map.json', import.meta.url)).then(r => (r.ok ? r.json() : { provinces: {} })).catch(() => ({ provinces: {} }))
    .then(m => { const byWorld = {}; for (const p of Object.values(m.provinces || {})) for (const [e, w] of Object.entries(p.map || {})) byWorld[w] = e; return { ...m, byWorld }; });
  return pmap;
}
