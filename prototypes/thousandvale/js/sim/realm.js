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
export function zoneEncounterCamps(terrain, ids, info = {}, zoneSheetId = null) {
  const sites = terrain.reader?.meta?.sites || [];
  const byName = n => sites.find(s => s.name === n);
  const out = [];
  ids.forEach((id, k) => {
    const known = ENCOUNTER_PLACES[id];
    const rank = known ? known.rank : id.startsWith('rare_') ? 'rare' : id.startsWith('elite_') ? 'elite' : 'boss';
    const enc = { id, rank, level: known ? known.level : null, near: known ? known.near : {}, respawnMs: known ? known.respawnMs : rank === 'rare' ? [20 * 60000, 60 * 60000] : rank === 'elite' ? 20 * 60000 : 30 * 60000, escort: known ? known.escort : null };
    let p = null;
    const placed = sites.find(s => s.id === id && (s.type === 'camp' || s.type === 'event'))
      || (rank === 'boss' && zoneSheetId ? sites.find(s => s.type === 'event' && s.id === 'event_' + zoneSheetId) : null);
    if (placed) p = { x: placed.x, z: placed.z };
    else if (enc.near.site && byName(enc.near.site)) { const s = byName(enc.near.site); p = { x: s.x + (enc.near.dx || 0), z: s.z + (enc.near.dz || 0) }; }
    else if (enc.near.kind && sites.find(s => s.kind === enc.near.kind)) { const s = sites.find(x => x.kind === enc.near.kind); p = { x: s.x + 18, z: s.z - 86 }; }
    else if (enc.near.between) { const [a, b] = enc.near.between.map(byName); if (a && b) p = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }; }
    if (!p) {                              // no named place: out in the zone, away from its settlements
      const hub = sites.find(x => x.type === 'settlement' && x.hub) || sites.find(x => x.type === 'settlement') || terrain.spawn;
      p = walkableNear(terrain, hub.x, hub.z, 320 + k * 60, 1.3 + k * 1.7);
      for (let t = 0; t < 6 && inSettlement(terrain, p, 20); t++) p = walkableNear(terrain, hub.x, hub.z, 420 + k * 60 + t * 50, 2.1 + k + t);
    }
    if (terrain.walkable && !terrain.walkable(p.x, p.z)) p = walkableNear(terrain, p.x, p.z, 8, 0);
    const meta = info[id] || {};
    const level = enc.level || meta.level || 5;
    out.push({ type: meta.body || 'wolf', level, x: p.x, z: p.z, count: 1, radius: 2, rank: enc.rank, encounter: id, name: meta.name || null, respawnMs: enc.respawnMs });
    for (const e of enc.escort || []) out.push({ type: e.type, level: Math.max(1, level - 2), x: p.x + 5, z: p.z + 3, count: e.count, radius: 7, respawnMs: enc.respawnMs });
  });
  return out;
}

/**
 * A province LAYOUT: everything the province process needs to build its rooms (PLAN §8.2).
 *   buildLayout({ key, name, terrain, zones: [{ key, sheet, vignettes, bounds? }], encounterInfo, copyCap })
 * `terrain` covers the whole province (one zone bake, or several stitched — js/sim/province-terrain.js;
 * its reader's `meta.sites` are in the same metres and carry `zone`). Per zone: its hub/town settlements
 * become TOWN hub rooms, its dungeon site a door, its sheet's monster mix a ring of camps round its main
 * settlement, its named encounters (elite, rares, event boss) at their sites, its vignettes.
 * Returns { key, name, terrain, towns, doors, camps, objects, waystones, sheet, copyCap, zoneOf, zones, gate }.
 */
export function buildLayout({ key, name = null, terrain, zones = [], encounterInfo = {}, copyCap = 300, vignetteContent = null, townRadius = null, starter = null }) {
  const allSites = terrain.reader?.meta?.sites || [];
  const multi = zones.length > 1 || allSites.some(s => s.zone);
  const zoneList = zones.length ? zones : [{ key, sheet: null }];
  for (const z of zoneList) if (!z.bounds) z.bounds = multi ? (terrain.zones || []).find(q => q.key === z.key)?.bounds : terrain.bounds;
  const sitesOf = z => (multi ? allSites.filter(s => s.zone === z.key) : allSites);
  const towns = [], doors = [], camps = [], objects = [];
  for (const z of zoneList) {
    const sites = sitesOf(z);
    const zt = { ...terrain, reader: { ...(terrain.reader || {}), meta: { ...(terrain.reader?.meta || {}), sites } }, spawn: z.bounds ? { x: (z.bounds.minX + z.bounds.maxX) / 2, z: (z.bounds.minZ + z.bounds.maxZ) / 2 } : terrain.spawn };
    const settled = sites.filter(s => s.type === 'settlement');
    const hubs = settled.filter(s => s.hub || s.kind === 'city' || s.kind === 'town');
    const zTowns = [];
    if (!hubs.length && !multi) { const t = findTown(zt, townRadius); zTowns.push({ ...t, zone: z.key }); }
    for (const s of hubs) {
      let c = { x: s.x, z: s.z };
      if (terrain.walkable && !terrain.walkable(c.x, c.z)) c = findWalkable(terrain, c) || c;
      zTowns.push({ x: c.x, z: c.z, r: townRadius ?? (Number.isFinite(s.radius) ? s.radius : TOWN_RADIUS[s.kind] || 60), name: s.name, kind: s.kind, hub: !!s.hub, zone: z.key });
    }
    towns.push(...zTowns);
    const centre = zTowns[0] || settled[0] || zt.spawn;
    const ring = { x: centre.x, z: centre.z, r: centre.r || (centre.radius || 40) };
    const dsite = sites.find(s => s.type === 'dungeon');
    const door = dsite ? { x: dsite.x, z: dsite.z, name: dsite.name || 'Dungeon entrance', yaw: dsite.yaw || 0, zone: z.key, sheet: z.sheet }
      : (!multi ? { ...findDoor(zt, ring), name: 'Barrow entrance', zone: z.key, sheet: z.sheet } : null);
    if (door) doors.push(door);
    if (z.vignettes && vignetteContent) { const v = vignetteContent(z.vignettes.placements, z.vignettes.recipes, { band: (z.sheet && z.sheet.band) || [1, 6] }); camps.push(...v.camps); objects.push(...v.objects); }
    if (z.sheet || !multi) camps.push(...wildsCamps(zt, ring, door || ring, z.sheet && z.sheet.camps));
    if (terrain.reader && (z.sheet || !multi)) camps.push(...zoneEncounterCamps(zt, zoneEncounterIds(z.sheet), encounterInfo, z.sheet && z.sheet.id));
  }
  // the starting zone's hub first (new characters and respawns default there), then other hubs
  const rank = t => (t.hub && t.zone === starter ? 0 : t.hub ? 1 : 2);
  towns.sort((a, b) => rank(a) - rank(b));
  towns.forEach((t, i) => { t.id = i; });
  const main = towns[0] || { ...terrain.spawn, r: 60, name: name || key };
  const sheet = zoneList[0].sheet || null;
  // waystones: one in every town square, one by every dungeon door (PLAN §5.2, NB4: they need discovering)
  const waystones = [];
  towns.forEach((t, i) => waystones.push({ key: `ws:${key}:t${i}`, name: t.name, x: t.x + 6, z: t.z + 6, town: i }));
  doors.forEach((d, i) => { const p = walkableNear(terrain, d.x, d.z, 10, 2.2); waystones.push({ key: `ws:${key}:d${i}`, name: d.name, x: p.x, z: p.z, door: i }); });
  const zoneOf = (x, zz) => {
    for (const q of zoneList) if (q.bounds && x >= q.bounds.minX && x < q.bounds.maxX && zz >= q.bounds.minZ && zz < q.bounds.maxZ) return q.key;
    return zoneList[0].key;
  };
  return { key, name: name || main.name, terrain, towns, doors, camps, objects, waystones, sheet, copyCap, zoneOf, zones: zoneList, gate: townGate(terrain, main, doors[0] || { x: main.x + 100, z: main.z }) };
}
