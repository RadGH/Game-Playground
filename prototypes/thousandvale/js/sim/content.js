// Zone content the server places (stream A, reading stream E's data). Pure: the caller passes `readJson(path)`
// (fetch in a Worker, fs under Node); paths are relative to the game folder.
//
//   const content = await loadZoneContent(readJson, 'test')
//   -> { sheet, encounterInfo: { id: { name, body } }, vignettes: { recipes, placements } | null }    (missing files give empty content, never a throw)
//
// Used by createWorld({ zoneSheet: content.sheet, encounterInfo: content.encounterInfo }).

export const PROVINCE_FILES = ['data/provinces/torbor_downs.json'];
export const VIGNETTE_FILES = ['data/vignettes/m1.json', 'data/vignettes/m2.json', 'data/vignettes/m2b.json'];

export async function loadZoneContent(readJson, zone = 'test') {
  const out = { sheet: null, encounterInfo: {}, vignettes: null };
  for (const f of PROVINCE_FILES) {
    try {
      const p = await readJson(f);
      // the zone's own sheet; M1 has one sheet, so a re-baked starter zone falls back to the first one
      const z = p && p.zones && (p.zones[zone] || Object.values(p.zones)[0]);
      if (z) { out.sheet = { ...z, province: p.name || null }; break; }
    } catch { /* no sheet */ }
  }
  // vignettes: every recipe file + this zone's placements (stream E)
  try {
    const recipes = [];
    for (const f of VIGNETTE_FILES) { try { const d = await readJson(f); recipes.push(...(d.vignettes || [])); } catch { /* skip */ } }
    const placements = await readJson(`data/vignettes/placements/${zone}.json`);
    out.vignettes = { recipes, placements: placements.placements || [] };
  } catch { out.vignettes = null; }
  try {
    const idx = await readJson('data/encounters/index.json');
    for (const f of idx.files || []) {
      try { const e = await readJson('data/encounters/' + f); if (e && e.id) out.encounterInfo[e.id] = { name: e.name || e.id, body: e.body || null }; } catch { /* skip */ }
    }
  } catch { /* no encounters */ }
  return out;
}

/**
 * A whole province (stream B's bakes + stream E's sheet), for a multi-zone province room.
 *   await loadProvinceContent(readJson, readBytes, 'torbor_downs', { parseTerrain, parseNav?, createProvinceTerrain })
 * -> { key, name, terrain, zones: [{ key (world zone id), eid (E's id), sheet, vignettes, events }], encounterInfo, events (realm),
 *      zoneEvents, directorRules, starter, starterProvince }
 * readBytes(path) -> Uint8Array. A zone whose bake is missing is left out (logged by the caller).
 */
export async function loadProvinceContent(readJson, readBytes, provinceId, { parseTerrain, parseNav = null, createProvinceTerrain, log = () => {} }) {
  const map = (await readJson('data/world/province-map.json')).provinces[provinceId];
  if (!map) throw new Error('no province ' + provinceId + ' in data/world/province-map.json');
  let sheet = null;
  for (const f of PROVINCE_FILES) { try { const p = await readJson(f); if (p.id === provinceId) { sheet = p; break; } } catch { /* next */ } }
  const recipes = [];
  for (const f of VIGNETTE_FILES) { try { recipes.push(...((await readJson(f)).vignettes || [])); } catch { /* skip */ } }
  // what E's placements refer to: site templates, hooks, treasure chains (per zone: its quest file)
  const opt = async f => { try { return await readJson(f); } catch { return null; } };
  const sites = await opt('data/provinces/sites.json');
  const hooks = ((await opt('data/hooks.json')) || {}).hooks || [];
  const treasure = ((await opt('data/quests/treasure.json')) || {}).chains || [];
  const wayside = Object.fromEntries((((await opt('data/vignettes/wayside.json')) || {}).kinds || []).map(k => [k.id, k]));   // roadside dressing kinds
  const zones = [], parts = [];
  for (const [eid, wid] of Object.entries(map.map)) {
    let reader;
    try { reader = parseTerrain(await readBytes(`data/zones/${wid}/terrain.bin`)); } catch (err) { log('zone ' + wid + ' not baked: ' + err.message); continue; }
    const [, zx, zy] = /^z(\d+)_(\d+)$/.exec(wid).map(Number);
    let nav = null;     // B's nav.bin (trees, rocks, buildings, deep water): monsters step round them (stream C)
    if (parseNav) { try { nav = parseNav(await readBytes(`data/zones/${wid}/nav.bin`)); } catch { /* not baked */ } }
    parts.push({ key: wid, zx, zy, reader, nav });
    let vignettes = null;
    for (const f of [`data/vignettes/placements/${wid}.json`, `data/vignettes/placements/${eid}.json`]) {
      try {
        const pl = await readJson(f);
        if (pl.terrainHash && reader.meta.inputHash && pl.terrainHash !== reader.meta.inputHash) { log(`vignettes ${f}: made for another bake (${pl.terrainHash} vs ${reader.meta.inputHash}), skipped`); continue; }
        // placements are in zone metres: move them into world metres
        const ox = zx * 2048, oz = zy * 2048;
        // placements[] + features[] (hooks that ARE a bake feature: a ford, a settlement, a `pts` line)
        vignettes = { recipes, sites, hooks, treasure, wayside, quests: await opt(`data/quests/${eid}.json`),
          placements: [...(pl.placements || []), ...(pl.features || []).map(f => ({ ...f, feature: true }))].map(p => ({ ...p, x: p.x + ox, z: p.z + oz, ...(Array.isArray(p.path) ? { path: p.path.map(([a, b]) => [a + ox, b + oz]) } : {}), ...(Array.isArray(p.pts) ? { pts: p.pts.map(([a, b]) => [a + ox, b + oz]) } : {}) })) };
        break;
      } catch { /* none yet */ }
    }
    const zs = sheet && sheet.zones ? sheet.zones[eid] : null;
    // the zone's quest file (data/quests/<E zone id>.json) and its placements: the quest runtime reads both
    // B's town plans (building plots by `want`, the squares): where the town folk work and sleep (schedules.json)
    const bp = await opt(`data/zones/${wid}/placements.json`);
    const plan = { settlements: [], buildings: [], squares: [] };
    for (const p of (bp && bp.placements) || []) {
      const wx = p.x + zx * 2048, wz = p.z + zy * 2048, d = p.data || {};
      if (p.kind === 'settlement') plan.settlements.push({ id: p.id, name: d.name, kind: d.kind, x: wx, z: wz });
      else if (p.kind === 'building') plan.buildings.push({ town: d.town, want: d.want, x: wx, z: wz, yaw: p.yaw || 0, d: d.d || 6 });
      else if (p.kind === 'town_square') plan.squares.push({ town: d.town, x: wx, z: wz });
    }
    zones.push({ key: wid, eid, sheet: zs ? { ...zs, id: eid } : null, vignettes, plan, quests: (vignettes && vignettes.quests) || await opt(`data/quests/${eid}.json`), placements: vignettes ? vignettes.placements : [] });
  }
  if (!parts.length) throw new Error('province ' + provinceId + ': no zone is baked');
  const startE = sheet && sheet.grid ? sheet.grid.start : null;
  const starter = startE ? map.map[startE] : parts[0].key;
  const terrain = createProvinceTerrain({ key: provinceId, zones: parts, starter });
  const encounterInfo = (await loadZoneContent(readJson, 'none')).encounterInfo;
  // realm + zone events (stream E's data/quests/events.json; PLAN §5.2), placed at the sites B baked
  const evData = await opt('data/quests/events.json');
  const { events, zoneEvents } = provinceEvents(evData, { provinceId, map: map.map, terrain, sheet, encounterInfo });
  for (const z of zones) z.events = zoneEvents.filter(e => e.zone === z.key);
  // a province whose band starts at level 1 is where new characters begin: its copies open earlier (PLAN §8.2: ~150)
  const starterProvince = !!(sheet && Array.isArray(sheet.band) && sheet.band[0] <= 1);
  const rares = (await opt('data/provinces/rares.json')) || {};
  const jobs = await opt('data/quests/jobs.json');
  const schedules = await opt('data/provinces/schedules.json');
  const horizon = await opt('data/world/horizon.json');      // stream B's 32 m world horizon manifest (joined.room.horizon)
  // the living roads (P19, stream E): who travels, along which routes, and what they say (js/sim/travellers.js)
  const tv = await opt('data/provinces/travellers.json'), rt = await opt(`data/provinces/${provinceId}-routes.json`);
  const travel = tv && rt ? { kinds: tv.kinds || {}, rules: tv.rules || {}, folkKinds: tv.folk || {}, routes: rt.routes || [], chatter: (await opt('data/names/chatter.json')) || { pools: {}, rules: {} }, names: (await opt('data/names/torbor.json')) || {} } : null;
  return { travel, key: provinceId, name: sheet ? sheet.name : provinceId, terrain, zones, encounterInfo, events, zoneEvents, directorRules: (evData && evData.director) || null, starter, starterProvince, rares, jobs, schedules, horizon };
}

/**
 * events.json -> this province's REALM events (director candidates) and ZONE events (each copy runs its own), in
 * world metres. A site is a bake site id, `{settlement: name}` (a hub town, else a settlement site, else the zone's
 * event arena) or, for a flyover, the event arenas of its `zones`. Without events.json: the sheet's world boss.
 */
export function provinceEvents(evData, { provinceId, map, terrain, sheet = null, encounterInfo = {} }) {
  const sites = terrain.reader.meta.sites || [];
  const byId = id => sites.find(s => s.id === id);
  const arenaOf = eid => byId('event_' + eid) || null;
  const siteOf = (site, eid) => {
    if (typeof site === 'string') return byId(site) || arenaOf(eid);
    if (site && site.settlement) return sites.find(s => s.type === 'settlement' && s.name === site.settlement && s.hub) || sites.find(s => s.type === 'settlement' && s.name === site.settlement) || arenaOf(eid);
    return arenaOf(eid);
  };
  const bandOf = eid => ((sheet && sheet.zones && sheet.zones[eid]) || {}).band || (sheet && sheet.band) || [1, 50];
  const nameOf = eid => ((sheet && sheet.zones && sheet.zones[eid]) || {}).name || null;
  const events = [], zoneEvents = [];
  const min = m => (m == null ? undefined : m * 60000);
  const common = (e, s) => ({ id: e.id, name: e.name || (encounterInfo[e.encounter || e.boss] || {}).name || e.id, kind: e.kind || 'boss', province: provinceId,
    x: s.x, z: s.z, r: Math.max(s.r || s.radius || 40, 30), level: e.level || 5, waves: e.waves || [], boss: e.boss || e.encounter || null, monster: e.monster || null,
    durationMs: min(e.durationMinutes), announce: [].concat(e.announce || []), reward: e.reward || null, enrol: e.autoEnrolMetres || 60 });
  if (evData) {
    for (const e of evData.realm || []) {
      const zs = e.zones || [e.zone];
      if (!zs.every(z => map[z])) continue;                  // another province's event
      if (e.kind === 'flyover') {
        const arenas = zs.map(arenaOf).filter(Boolean).map(s => ({ x: s.x, z: s.z }));
        if (!arenas.length) continue;
        events.push({ ...common(e, { ...arenas[0], r: 40 }), arenas, zone: map[zs[0]], zoneName: nameOf(zs[0]), band: bandOf(zs[0]), schedule: e.schedule, minOnline: e.minOnline, minInBand: e.minInBand, weight: e.weight });
        continue;
      }
      const s = siteOf(e.site, e.zone);
      if (!s) continue;
      // E's `roam`: now and then the boss marches on a neighbouring zone's event arena (the director picks; M3)
      const roamTo = e.roam && Array.isArray(e.roam.toZones) ? e.roam.toZones.map(z => { const a = arenaOf(z); return a && map[z] ? { zone: map[z], zoneName: nameOf(z), x: a.x, z: a.z, r: Math.max(a.r || a.radius || 40, 30) } : null; }).filter(Boolean) : [];
      events.push({ ...common(e, s), zone: map[e.zone], zoneName: nameOf(e.zone), band: bandOf(e.zone), schedule: e.schedule, minOnline: e.minOnline, minInBand: e.minInBand, weight: e.weight, ...(roamTo.length ? { roamTo, roam: { chance: e.roam.chance ?? 0.25 } } : {}) });
    }
    for (const e of evData.zone || []) {
      if (!map[e.zone]) continue;
      const s = siteOf(e.site, e.zone);
      if (!s) continue;
      const every = e.every && e.every.minutes ? e.every.minutes : [35, 55];
      zoneEvents.push({ ...common(e, s), zone: map[e.zone], zoneName: nameOf(e.zone), eid: e.zone, everyMs: [every[0] * 60000, every[1] * 60000], warnMs: min(e.warnMinutes) || 0 });
    }
  } else if (sheet && sheet.worldBoss) {
    const wb = sheet.worldBoss, s = byId(wb.id), info = encounterInfo[wb.id] || {};
    if (s) events.push({ id: wb.id, name: info.name || wb.id, kind: 'worldboss', province: provinceId, x: s.x, z: s.z, r: s.r || 50, boss: wb.id, level: bandOf(wb.zone)[1] || 10, band: bandOf(wb.zone), zone: map[wb.zone], waves: [], schedule: { type: 'weighted' }, weight: 1 });
  }
  return { events, zoneEvents };
}
