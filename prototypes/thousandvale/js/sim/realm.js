// The layout of one zone as rooms (stream A, PLAN §8.2), worked out from its terrain:
//   town     the zone's town as a HUB room: a circle on the same terrain, shared by every copy, never copied
//   wilds    the open zone (one room per copy; copies open when one is full)
//   door     where the dungeon entrance stands in the wilds
//   camps    monster camps in the wilds, kept outside the town
// Pure. createWorld (js/sim/world.js) builds the rooms from this.

import { findWalkable } from './terrain.js';

export const TOWN_RADIUS = { city: 140, town: 90, village: 65, hamlet: 40 };

/** The zone's main settlement from the bake's sites (B's terrain.bin meta), else the spawn. */
export function findTown(terrain, radius = null) {
  const sites = terrain.reader?.meta?.sites || [];
  const rank = { city: 0, town: 1, village: 2, hamlet: 3 };
  const s = sites.filter(x => x.type === 'settlement').sort((a, b) => (rank[a.kind] ?? 9) - (rank[b.kind] ?? 9))[0];
  const c = s ? { x: s.x, z: s.z } : { ...terrain.spawn };
  const r = radius ?? (s ? TOWN_RADIUS[s.kind] || 60 : 60);
  let centre = c;
  if (terrain.walkable && !terrain.walkable(c.x, c.z)) centre = findWalkable(terrain, c) || c;
  return { x: centre.x, z: centre.z, r, name: s ? s.name : 'Town', kind: s ? s.kind : 'village' };
}

/** A walkable point at about `dist` metres from (x, z), searching round from bearing `a0`. */
export function walkableNear(terrain, x, z, dist, a0 = 0) {
  for (let k = 0; k < 32; k++) {
    const a = a0 + k * 0.7, d = dist + (k >> 3) * 12;
    const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
    if (inside(terrain, px, pz) && (!terrain.walkable || terrain.walkable(px, pz))) return { x: px, z: pz };
  }
  return { x: x + dist, z };
}
function inside(t, x, z) { const b = t.bounds; return x > b.minX + 8 && z > b.minZ + 8 && x < b.maxX - 8 && z < b.maxZ - 8; }

/** Where the dungeon door stands: outside the town, on walkable ground. */
export function findDoor(terrain, town) { return walkableNear(terrain, town.x, town.z, town.r + 110, 0.8); }

/** Where you appear when you walk out of the town (just outside its edge, toward the door). */
export function townGate(terrain, town, door) {
  const a = Math.atan2(door.z - town.z, door.x - town.x);
  return walkableNear(terrain, town.x, town.z, town.r + 6, a);
}

/** Wolf camps in rings outside the town, none near the door. */
export function wildsCamps(terrain, town, door) {
  const out = [];
  for (let i = 0; i < 8; i++) {
    const a = i * 0.79 + 0.3, d = town.r + 50 + (i % 4) * 35;
    let p = walkableNear(terrain, town.x, town.z, d, a);
    if (Math.hypot(p.x - door.x, p.z - door.z) < 30) p = walkableNear(terrain, town.x, town.z, d + 40, a + 0.4);
    out.push({ type: 'wolf', level: 1 + (i >> 1), x: p.x, z: p.z, count: 3 + (i % 2), radius: 10, respawnMs: 30000 });
  }
  // a guard pack at the dungeon door
  out.push({ type: 'wolf', level: 3, x: door.x + 14, z: door.z + 6, count: 2, radius: 5, respawnMs: 45000 });
  return out;
}
