// Terrain for the room sim (stream A). Two sources, one shape:
//   loadZoneTerrain(bytes)   a baked zone (stream B's terrain.bin via js/rules/terrain-read.js)
//   standInTerrain(seed)     a smooth seeded field for tests and when no bake is present
// Both return { key, heightAt, walkable, bounds:{minX,minZ,maxX,maxZ}, size (metres), spawn:{x,z} }.

import { parseTerrain } from '../rules/terrain-read.js';

export function loadZoneTerrain(bytes, key = 'test') {
  const t = parseTerrain(bytes);
  const b = t.bounds;
  let spawn = t.meta.spawn || { x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2 };
  if (!t.walkable(spawn.x, spawn.z)) spawn = findWalkable(t, spawn) || spawn;
  return {
    key, reader: t,
    heightAt: t.heightAt, walkable: t.walkable,
    bounds: b, size: Math.max(b.maxX - b.minX, b.maxZ - b.minZ), origin: { x: b.minX, z: b.minZ },
    spawn,
  };
}

/** Spiral out from p for the nearest walkable point. */
export function findWalkable(t, p, maxR = 400) {
  for (let r = 4; r <= maxR; r += 4) {
    for (let k = 0; k < 16; k++) {
      const a = k / 16 * Math.PI * 2, x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      if (t.walkable(x, z)) return { x, z };
    }
  }
  return null;
}

/** A gentle seeded height field over size × size metres (no water, nothing too steep). */
export function standInTerrain(seed = 1, size = 2048) {
  const s = (seed >>> 0) % 1000;
  const heightAt = (x, z) => 20
    + 8 * Math.sin((x + s * 7) / 97) * Math.cos((z - s * 3) / 131)
    + 3 * Math.sin((x - z) / 41 + s)
    + 1.5 * Math.cos((x * 0.7 + z) / 23);
  const bounds = { minX: 0, minZ: 0, maxX: size, maxZ: size };
  const walkable = (x, z) => x >= 0 && z >= 0 && x <= size && z <= size;
  return { key: null, heightAt, walkable, bounds, size, origin: { x: 0, z: 0 }, spawn: { x: size / 2, z: size / 2 } };
}
