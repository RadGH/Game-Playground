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

const cache = new Map();

export function loadClientTerrain(key) {
  const k = key || 'standin';
  if (!cache.has(k)) cache.set(k, key ? loadZone(key).catch(err => { console.warn('[terrain] zone', key, 'failed, using the stand-in:', err.message); return standin(); }) : Promise.resolve(standin()));
  return cache.get(k);
}

async function loadZone(key) {
  const res = await fetch(new URL(`../../data/zones/${encodeURIComponent(key)}/terrain.bin`, import.meta.url));
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const t = parseTerrain(await res.arrayBuffer());
  return {
    key, name: t.meta.name || key, reader: t,
    heightAt: t.heightAt, walkable: t.walkable,
    waterAt: (x, z) => t.waterAt(x, z),
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
