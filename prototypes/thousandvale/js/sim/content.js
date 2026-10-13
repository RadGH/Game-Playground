// Zone content the server places (stream A, reading stream E's data). Pure: the caller passes `readJson(path)`
// (fetch in a Worker, fs under Node); paths are relative to the game folder.
//
//   const content = await loadZoneContent(readJson, 'test')
//   -> { sheet, encounterInfo: { id: { name, body } }, vignettes: { recipes, placements } | null }    (missing files give empty content, never a throw)
//
// Used by createWorld({ zoneSheet: content.sheet, encounterInfo: content.encounterInfo }).

export const PROVINCE_FILES = ['data/provinces/torbor_downs.json'];
export const VIGNETTE_FILES = ['data/vignettes/m1.json', 'data/vignettes/m2.json', 'data/vignettes/m2b.json', 'data/vignettes/curios.json', 'data/vignettes/setpieces.json'];   // curios: P19 mini vignettes; setpieces: play-test 2 Q18

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
      try { const e = await readJson('data/encounters/' + f); if (e && e.id) out.encounterInfo[e.id] = { name: e.name || e.id, body: e.body || null, ...(Number.isFinite(e.level) ? { level: e.level } : {}), ...(e.announce ? { announce: { r: e.announce.r || 300 } } : {}), ...(e.secret ? { secret: true } : {}), ...(e.tier ? { tier: e.tier } : {}) }; } catch { /* skip */ }
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
  // a zone's quest file may `include` other files (stream E, play-test 2: start.json, classes.json, setpieces.json are parts
  // of zone 'test'): their npcs and quests are merged into it
  const questsOf = async eid => {
    const q = await opt(`data/quests/${eid}.json`);
    if (!q || !Array.isArray(q.include)) return q;
    const out = { ...q, npcs: { ...(q.npcs || {}) }, quests: [...(q.quests || [])] };
    for (const f of q.include) {
      const part = await opt('data/quests/' + String(f).replace(/^.*\//, ''));
      if (!part) { log('quest include ' + f + ' missing'); continue; }
      Object.assign(out.npcs, part.npcs || {});
      for (const d of part.quests || []) if (!out.quests.some(x => x.id === d.id)) out.quests.push(d);
    }
    return out;
  };
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
        // play-test 3 R2: E's extra monster camps near the start live in <zone>.hunt.json (B's bake never reads it)
        let hunt = [];
        try { const h = await readJson(`data/vignettes/placements/${wid}.hunt.json`); if (!h.terrainHash || !reader.meta.inputHash || h.terrainHash === reader.meta.inputHash) hunt = h.placements || []; else log(`hunt ${wid}: made for another bake, skipped`); } catch { /* none */ }
        // play-test 4 S14: camps that make every kill quest's area hold enough of its monster (<zone>.quest.json, tools/content-hunts.mjs)
        try { const h = await readJson(`data/vignettes/placements/${wid}.quest.json`); if (!h.terrainHash || !reader.meta.inputHash || h.terrainHash === reader.meta.inputHash) hunt = [...hunt, ...(h.placements || [])]; else log(`quest camps ${wid}: made for another bake, skipped`); } catch { /* none */ }
        vignettes = { recipes, sites, hooks, treasure, wayside, quests: await questsOf(eid),
          placements: [...(pl.placements || []), ...hunt, ...(pl.features || []).map(f => ({ ...f, feature: true }))].map(p => ({ ...p, x: p.x + ox, z: p.z + oz, ...(Array.isArray(p.path) ? { path: p.path.map(([a, b]) => [a + ox, b + oz]) } : {}), ...(Array.isArray(p.pts) ? { pts: p.pts.map(([a, b]) => [a + ox, b + oz]) } : {}) })) };
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
      else if (p.kind === 'building') plan.buildings.push({ id: p.id, town: d.town, want: d.want, x: wx, z: wz, yaw: p.yaw || 0, w: d.w || 6, d: d.d || 6, role: d.role || null, office: d.office || null, lit: d.lit ?? null, label: d.label || null });   // id: the plot an office takes over (Q10)
      else if (p.kind === 'town_square') plan.squares.push({ town: d.town, x: wx, z: wz });
    }
    zones.push({ key: wid, eid, sheet: zs ? { ...zs, id: eid } : null, vignettes, plan, quests: (vignettes && vignettes.quests) || await questsOf(eid), placements: vignettes ? vignettes.placements : [] });
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
  // play-test 2: shop stock (Q11) and mounts (Q16), stream E's data (A has stand-ins for both)
  const shops = await opt('data/provinces/shops.json');
  const mounts = await opt('data/provinces/mounts.json');
  const offices = await opt('data/provinces/offices.json');      // Q10: E's one-plot-per-NPC offices per hub town
  const horizon = await opt('data/world/horizon.json');      // stream B's 32 m world horizon manifest (joined.room.horizon)
  // the living roads (P19, stream E): who travels, along which routes, and what they say (js/sim/travellers.js)
  const tv = await opt('data/provinces/travellers.json'), rt = await opt(`data/provinces/${provinceId}-routes.json`);
  // play-test 4 S9: stream E's wanderers (pedlars with a shop, errand runners with a delivery, storytellers) walk the same
  // routes — their kinds join travellers.json's and every route's allowed list; their `rules` override travellers.json's
  const wd = await opt('data/provinces/wanderers.json');
  const cartsData = await opt('data/provinces/carts.json');
  const wk = (wd && wd.kinds) || {};
  if (shops && wd && wd.shops) shops.kinds = { ...(shops.kinds || {}), ...wd.shops };      // the pedlar's pack sells like any shop
  const travel = tv && rt ? { kinds: { ...(tv.kinds || {}), ...wk }, rules: { ...(tv.rules || {}), ...((wd && wd.rules) || {}) }, folkKinds: tv.folk || {}, fighters: tv.fighters || null,
    routes: [...(rt.routes || []).map(r => (Array.isArray(r.kinds) && Object.keys(wk).length ? { ...r, kinds: [...r.kinds, ...Object.keys(wk).filter(k => !r.kinds.includes(k))] } : r)),
      // X7 (owner feedback 9, E's note): a guaranteed cart on the road — each carts.json `roaming.runs[]` is a route of its own over the same road
      // that carries ONLY its `only` kinds (no wanderer kinds appended), so there is always one to flag down
      ...(((cartsData && cartsData.roaming && cartsData.roaming.runs) || []).map(run => { const base = (rt.routes || []).find(r => r.id === run.route); return base && Array.isArray(run.only) && run.only.length ? { ...base, id: run.id, kinds: run.only.slice(), run: true, ...(run.carts ? { groups: run.carts } : {}) } : null; }).filter(Boolean))],
    chatter: (await opt('data/names/chatter.json')) || { pools: {}, rules: {} }, names: (await opt('data/names/torbor.json')) || {} } : null;
  const marks = ((await opt(`data/quests/marks/${provinceId}.json`)) || {}).quests || null;   // P17: E's map mark per quest
  // play-test 4: data files that ride straight through buildLayout's `extra` into the province's L
  // play-test 5 T25: angling — C's numbers, E's fish / recipes / rods and E's pool spots (js/sim/angling.js)
  const fishNumbers = await opt('data/rules/fishing.json');
  const angling = fishNumbers ? { numbers: fishNumbers, content: await opt('data/provinces/angling.json'), pools: await opt('data/provinces/angling-pools.json') } : null;
  // V2 (owner feedback 7): stream E's economy knobs (js/sim/economy-knobs.js reads them; an older `data/rules/economy.json` `server` block is read too)
  // W9 (P-core): professions — the numbers, the content and where the nodes stand (js/sim/professions.js); its job frames join the board's
  const profNumbers = await opt('data/rules/professions.json');
  const professions = profNumbers ? { numbers: profNumbers, content: await opt('data/provinces/professions.json'), nodes: await opt('data/provinces/professions-nodes.json') } : null;
  if (jobs && Array.isArray(jobs.frames) && professions && professions.content && Array.isArray(professions.content.jobs)) for (const f of professions.content.jobs) if (!jobs.frames.some(x => x.id === f.id)) jobs.frames.push(f);
  const extra = { professions, economy: (await opt('data/provinces/economy.json')) || (await opt('data/rules/economy.json')), angling, refunds: await opt('data/provinces/refunds.json'), wanderers: wd, treasure: await opt('data/provinces/road-events.json'), affixes: await opt('data/encounters/affixes.json'), spawnHints: await opt(`data/quests/marks/${provinceId}-hunts.json`),
    titles: await opt('data/names/titles.json'), givers: await opt('data/quests/marks/givers.json'), carts: cartsData, guards: await opt('data/provinces/guards.json'), names: await opt('data/names/torbor.json') };
  return { extra, travel, marks, key: provinceId, name: sheet ? sheet.name : provinceId, terrain, zones, encounterInfo, events, zoneEvents, directorRules: (evData && evData.director) || null, starter, starterProvince, rares, jobs, schedules, horizon, shops, mounts, offices };
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
  /** X7 (owner feedback 9): the gates a raid comes in by (E's `raid.gates`, zone metres of `raid.zone`) in world metres. */
  const raidOf = e => {
    const g = e.raid && Array.isArray(e.raid.gates) ? e.raid.gates : null, zm = /^z(\d+)_(\d+)$/.exec((e.raid && e.raid.zone) || '');
    if (!g || !g.length || !zm) return {};
    const ox = +zm[1] * 2048, oz = +zm[2] * 2048;
    return { raid: { gates: g.filter(q => Number.isFinite(q.x) && Number.isFinite(q.z)).map(q => ({ id: q.id || null, x: q.x + ox, z: q.z + oz, out: Array.isArray(q.out) ? [+q.out[0] || 0, +q.out[1] || 0] : [0, 0], main: !!q.main })), ...(Array.isArray(e.raid.spawnOutM) ? { spawnOutM: e.raid.spawnOutM } : {}) } };
  };
  const common = (e, s) => ({ id: e.id, name: e.name || (encounterInfo[e.encounter || e.boss] || {}).name || e.id, kind: e.kind || 'boss', province: provinceId,
    x: s.x, z: s.z, r: Math.max(s.r || s.radius || 40, 30), level: e.level || 5, waves: e.waves || [], boss: e.boss || e.encounter || null, monster: e.monster || null, bossName: e.bossName || null,
    durationMs: min(e.durationMinutes), announce: [].concat(e.announce || []), reward: e.reward || null, enrol: e.autoEnrolMetres || 60,
    where: e.where || null, blurb: e.blurb || null, info: e.info || null });   // P27: where it is + what to do (E); T12 (play-test 5): E's `info` block (what, objective, durationSec, onSuccess, onFail, rewardText)
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
      events.push({ ...common(e, s), ...raidOf(e), zone: map[e.zone], zoneName: nameOf(e.zone), band: bandOf(e.zone), schedule: e.schedule, minOnline: e.minOnline, minInBand: e.minInBand, weight: e.weight, ...(e.startOn ? { startOn: e.startOn } : {}), ...(roamTo.length ? { roamTo, roam: { chance: e.roam.chance ?? 0.25 } } : {}) });
    }
    for (const e of evData.zone || []) {
      if (!map[e.zone]) continue;
      const s = siteOf(e.site, e.zone);
      if (!s) continue;
      // play-test 3 R3: a zone event starts when a player comes near (countdown, then the waves) and rests between runs
      const dz = (evData.director && evData.director.zone) || {};
      const rest = e.cooldownMinutes || dz.cooldownMinutes || (e.every && e.every.minutes) || [3, 5];
      const cool = [rest[0] * 60000, (rest[1] ?? rest[0]) * 60000];
      zoneEvents.push({ ...common(e, s), zone: map[e.zone], zoneName: nameOf(e.zone), eid: e.zone, everyMs: cool, cooldownMs: cool,
        countdownMs: Math.round((e.countdownSeconds ?? dz.countdownSeconds ?? 15) * 1000), nearM: e.nearMetres ?? dz.nearMetres ?? 50, warnMs: 0, ...(e.startOn ? { startOn: e.startOn } : {}) });
    }
  } else if (sheet && sheet.worldBoss) {
    const wb = sheet.worldBoss, s = byId(wb.id), info = encounterInfo[wb.id] || {};
    if (s) events.push({ id: wb.id, name: info.name || wb.id, kind: 'worldboss', province: provinceId, x: s.x, z: s.z, r: s.r || 50, boss: wb.id, level: bandOf(wb.zone)[1] || 10, band: bandOf(wb.zone), zone: map[wb.zone], waves: [], schedule: { type: 'weighted' }, weight: 1 });
  }
  return { events, zoneEvents };
}
