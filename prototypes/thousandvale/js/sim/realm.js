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
  // the bake marks the zone's hub settlement (`hub: true`, stream B); else the biggest settlement
  const s = sites.find(x => x.type === 'settlement' && x.hub) || sites.filter(x => x.type === 'settlement').sort((a, b) => (rank[a.kind] ?? 9) - (rank[b.kind] ?? 9))[0];
  const c = s ? { x: s.x, z: s.z } : { ...terrain.spawn };
  const r = radius ?? (s ? (Number.isFinite(s.radius) ? s.radius : TOWN_RADIUS[s.kind] || 60) : 60);   // B's bake may give `radius`
  let centre = c;
  if (terrain.walkable && !terrain.walkable(c.x, c.z)) centre = findWalkable(terrain, c) || c;
  return { x: centre.x, z: centre.z, r, name: s ? s.name : 'Town', kind: s ? s.kind : 'village' };
}

/** Inside (or within `pad` m of) any settlement circle the bake lists (hub, hamlets, cities)? */
export function inSettlement(terrain, p, pad = 0) {
  for (const s of terrain.reader?.meta?.sites || []) if (s.type === 'settlement' && Math.hypot(p.x - s.x, p.z - s.z) < (s.radius || 40) + pad) return true;
  return false;
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
export function findDoor(terrain, town) {
  const site = (terrain.reader?.meta?.sites || []).find(x => x.type === 'dungeon');   // B's bake may place it
  if (site && (!terrain.walkable || terrain.walkable(site.x, site.z))) return { x: site.x, z: site.z, name: site.name || null };
  return walkableNear(terrain, town.x, town.z, town.r + 110, 0.8);
}

/** Where you appear when you walk out of the town (just outside its edge, toward the door). */
export function townGate(terrain, town, door) {
  const a = Math.atan2(door.z - town.z, door.x - town.x);
  return walkableNear(terrain, town.x, town.z, town.r + 6, a);
}

/**
 * Monster camps in rings outside the town, none near the door. `mix` = the zone sheet's camp list
 * (stream E: data/provinces/<p>.json zones.<zone>.camps: {type, level:[lo,hi], count:[lo,hi], with?});
 * without one, wolves.
 */
export function wildsCamps(terrain, town, door, mix = null) {
  const out = [];
  const n = mix && mix.length ? Math.max(8, mix.length * 2) : 8;
  for (let i = 0; i < n; i++) {
    const a = i * (6.283 / n) + 0.3, d = town.r + 50 + (i % 4) * 35 + Math.floor(i / 8) * 60;
    let p = walkableNear(terrain, town.x, town.z, d, a);
    for (let k = 0; k < 6 && (Math.hypot(p.x - door.x, p.z - door.z) < 30 || inSettlement(terrain, p, 20)); k++) p = walkableNear(terrain, town.x, town.z, d + 40 * (k + 1), a + 0.4 * (k + 1));
    if (inSettlement(terrain, p, 20)) continue;
    if (mix && mix.length) {
      const m = mix[i % mix.length];
      const [l0, l1] = Array.isArray(m.level) ? m.level : [m.level || 1, m.level || 1];
      const [c0, c1] = Array.isArray(m.count) ? m.count : [m.count || 3, m.count || 3];
      const level = l0 + (Math.floor(i / mix.length) % (l1 - l0 + 1)), count = c0 + (i % (c1 - c0 + 1));
      out.push({ type: m.type, level, x: p.x, z: p.z, count, radius: 10, respawnMs: 30000 });
      if (m.with) out.push({ type: m.with, level, x: p.x + 4, z: p.z + 3, count: Math.max(1, count >> 1), radius: 6, respawnMs: 30000 });
    } else out.push({ type: 'wolf', level: 1 + (i >> 1), x: p.x, z: p.z, count: 3 + (i % 2), radius: 10, respawnMs: 30000 });
  }
  // a guard pack at the dungeon door
  const g = mix && mix.length ? mix[0] : { type: 'wolf' };
  out.push({ type: g.type, level: 3, x: door.x + 14, z: door.z + 6, count: 2, radius: 5, respawnMs: 45000 });
  return out;
}

/**
 * The zone's named encounters (stream E's asks): the elite's camp at the ford, two roaming rares,
 * the zone event boss on its event site. Positions come from the bake's sites when B publishes them
 * (`{type:'camp'|'event', id}`), else from first guesses near the named settlements. `info` = encounter id ->
 * { name, body } (the script files). Each camp carries `encounter` + `name` onto the monster it spawns.
 */
export const ENCOUNTER_PLACES = {
  elite_hobb_gallowsby: { rank: 'elite', level: 5, near: { kind: 'ford' }, respawnMs: 20 * 60000,
    escort: [{ type: 'road_brigand', count: 2 }, { type: 'brigand_archer', count: 2 }] },
  rare_grisel_thornhide: { rank: 'rare', level: 4, near: { between: ['Torborhold', 'Wamonhold'] }, respawnMs: [20 * 60000, 60 * 60000] },
  rare_sallowmaw: { rank: 'rare', level: 5, near: { site: 'Mawehaven', dz: 110 }, respawnMs: [20 * 60000, 60 * 60000] },
  event_grandmother_skein: { rank: 'boss', level: 7, near: { site: 'Mawehaven', dx: -100 }, respawnMs: 30 * 60000 },
};
/** Which named encounters a zone has: the zone sheet's `elite`, `rares`, `eventBoss` (stream E), else all known. */
export function zoneEncounterIds(sheet) {
  if (!sheet) return Object.keys(ENCOUNTER_PLACES);
  return [sheet.elite, ...(sheet.rares || []), sheet.eventBoss].filter(Boolean);
}
export function zoneEncounterCamps(terrain, ids, info = {}) {
  const sites = terrain.reader?.meta?.sites || [];
  const byName = n => sites.find(s => s.name === n);
  const out = [];
  for (const id of ids) {
    const enc = ENCOUNTER_PLACES[id] ? { id, ...ENCOUNTER_PLACES[id] } : null;
    if (!enc) continue;
    let p = null;
    const placed = sites.find(s => s.id === enc.id && (s.type === 'camp' || s.type === 'event'));
    if (placed) p = { x: placed.x, z: placed.z };
    else if (enc.near.site && byName(enc.near.site)) { const s = byName(enc.near.site); p = { x: s.x + (enc.near.dx || 0), z: s.z + (enc.near.dz || 0) }; }
    else if (enc.near.kind && sites.find(s => s.kind === enc.near.kind)) { const s = sites.find(x => x.kind === enc.near.kind); p = { x: s.x + 18, z: s.z - 86 }; }
    else if (enc.near.between) { const [a, b] = enc.near.between.map(byName); if (a && b) p = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }; }
    if (!p) {                              // the named places are not in this zone: out in the wilds, away from the hub
      const hub = sites.find(x => x.type === 'settlement' && x.hub) || terrain.spawn;
      p = walkableNear(terrain, hub.x, hub.z, 320 + out.length * 15, 1.3 + out.length * 0.9);
    }
    if (terrain.walkable && !terrain.walkable(p.x, p.z)) p = walkableNear(terrain, p.x, p.z, 8, 0);
    const meta = info[enc.id] || {};
    out.push({ type: meta.body || 'wolf', level: enc.level, x: p.x, z: p.z, count: 1, radius: 2, rank: enc.rank, encounter: enc.id, name: meta.name || null, respawnMs: enc.respawnMs });
    for (const e of enc.escort || []) out.push({ type: e.type, level: Math.max(1, enc.level - 2), x: p.x + 5, z: p.z + 3, count: e.count, radius: 7, respawnMs: enc.respawnMs });
  }
  return out;
}
