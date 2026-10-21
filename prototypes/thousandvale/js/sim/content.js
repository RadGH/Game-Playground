// Zone content the server places (stream A, reading stream E's data). Pure: the caller passes `readJson(path)`
// (fetch in a Worker, fs under Node); paths are relative to the game folder.
//
//   const content = await loadZoneContent(readJson, 'test')
//   -> { sheet, encounterInfo: { id: { name, body } }, vignettes: { recipes, placements } | null }    (missing files give empty content, never a throw)
//
// Used by createWorld({ zoneSheet: content.sheet, encounterInfo: content.encounterInfo }).

import { provinceData, namesPath, HOME_PROVINCE } from './province-files.js';
import { refineNav } from '../rules/nav-refine.js';            // [D-world #38]
import { growForest, clearOf } from '../rules/forest.js';       // [D-world #26] the woods the client draws
import { parseScatter } from '../rules/terrain-read.js';         // [D-world #38]

export const PROVINCE_FILES = ['data/provinces/torbor_downs.json'];      // the single-zone loader's sheets (loadZoneContent); a whole province reads data/provinces/<id>.json
export const VIGNETTE_FILES = ['data/vignettes/m1.json', 'data/vignettes/m2.json', 'data/vignettes/m2b.json', 'data/vignettes/curios.json', 'data/vignettes/setpieces.json',
  'data/vignettes/vharlen-vignettes.json', 'data/vignettes/vharlen-curios.json'];   // curios: P19 mini vignettes; setpieces: play-test 2 Q18; vharlen-*: [W] the island's own (ids `vh_`, never a Torbor id)
/** [W] Files whose `curios` list is read as recipes. Torbor's curios.json lists its recipes under `curios`, which this loader
 *  has never read (only `vignettes`), so its curio objects have never reached the server; that is left exactly as it
 *  was here (reported to the lead) and only the island's own curio file is read. */
const OWN_CURIOS = new Set(['data/vignettes/vharlen-curios.json']);
/** Roadside dressing kinds (`wayside` placements): Torbor's and each other province's own catalogue ([W] ids `vh_`). */
export const WAYSIDE_FILES = ['data/vignettes/wayside.json', 'data/vignettes/vharlen-wayside.json'];

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
    for (const f of VIGNETTE_FILES) { try { const d = await readJson(f); recipes.push(...(d.vignettes || []), ...(OWN_CURIOS.has(f) ? d.curios || [] : [])); } catch { /* skip */ } }
    const placements = await readJson(`data/vignettes/placements/${zone}.json`);
    out.vignettes = { recipes, placements: placements.placements || [] };
  } catch { out.vignettes = null; }
  try {
    const idx = await readJson('data/encounters/index.json');
    for (const f of idx.files || []) {
      try { const e = await readJson('data/encounters/' + f); if (e && e.id) out.encounterInfo[e.id] = { name: e.name || e.id, body: e.body || null, ...(Number.isFinite(e.level) ? { level: e.level } : {}), ...(e.announce ? { announce: { r: e.announce.r || 300 } } : {}), ...(e.secret ? { secret: true } : {}), ...(e.tier ? { tier: e.tier } : {}), ...(e.place && typeof e.place === 'object' ? { place: e.place } : {}) }; } catch { /* skip */ }
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
  try { const p = await readJson(`data/provinces/${provinceId}.json`); if (p && (!p.id || p.id === provinceId)) sheet = p; } catch { /* no sheet of its own */ }
  if (!sheet) for (const f of PROVINCE_FILES) { try { const p = await readJson(f); if (p.id === provinceId) { sheet = p; break; } } catch { /* next */ } }
  // Expansion 1 (stream P): every per-province data file through js/sim/province-files.js — Torbor Downs reads the files it
  // always did; another province its own `<prov>-<file>` (shared rules lent from Torbor's where it has none)
  const pdata = thing => provinceData(readJson, provinceId, thing);
  const recipes = [];
  for (const f of VIGNETTE_FILES) { try { const d = await readJson(f); recipes.push(...(d.vignettes || []), ...(OWN_CURIOS.has(f) ? d.curios || [] : [])); } catch { /* skip */ } }
  // what E's placements refer to: site templates, hooks, treasure chains (per zone: its quest file)
  const opt = async f => { try { return await readJson(f); } catch { return null; } };
  const sites = await pdata('sites');
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
  const wayside = {};   // roadside dressing kinds (every province's catalogue: ids never collide)
  for (const f of WAYSIDE_FILES) for (const k of (((await opt(f)) || {}).kinds || [])) wayside[k.id] = k;
  const zones = [], parts = [];
  for (const [eid, wid] of Object.entries(map.map)) {
    let reader;
    try { reader = parseTerrain(await readBytes(`data/zones/${wid}/terrain.bin`)); } catch (err) { log('zone ' + wid + ' not baked: ' + err.message); continue; }
    const [, zx, zy] = /^z(\d+)_(\d+)$/.exec(wid).map(Number);
    let nav = null;     // B's nav.bin (trees, rocks, buildings, deep water): monsters step round them (stream C)
    if (parseNav) { try { nav = parseNav(await readBytes(`data/zones/${wid}/nav.bin`)); } catch { /* not baked */ } }
    const part = { key: wid, zx, zy, reader, nav };
    parts.push(part);
    let vignettes = null, vigRaw = [];      // [D-world #26] vigRaw: the zone's own vignette placements (zone metres) the woods keep off
    for (const f of [`data/vignettes/placements/${wid}.json`, `data/vignettes/placements/${eid}.json`]) {
      try {
        const pl = await readJson(f);
        if (pl.terrainHash && reader.meta.inputHash && pl.terrainHash !== reader.meta.inputHash) { log(`vignettes ${f}: made for another bake (${pl.terrainHash} vs ${reader.meta.inputHash}), skipped`); continue; }
        vigRaw = pl.placements || [];
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
    // [D-world #38 / #26] round colliders for trees and rocks (js/rules/nav-refine.js) over the woods the client draws
    // (js/rules/forest.js, kept off the bake's set pieces and the vignettes) — the client wraps the same files the same way
    if (nav) { try { part.nav = refineNav(nav, growForest(parseScatter(await readBytes(`data/zones/${wid}/scatter.bin`)), nav, { ox: zx * 2048, oz: zy * 2048, clear: clearOf((bp && bp.placements) || [], vigRaw) })); } catch { /* no scatter: the grid answers */ } }
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
  const rares = (await pdata('rares')) || {};
  const jobs = await opt('data/quests/jobs.json');
  const schedules = await pdata('schedules');
  // play-test 2: shop stock (Q11) and mounts (Q16), stream E's data (A has stand-ins for both)
  const shops = await pdata('shops');
  const mounts = await pdata('mounts');
  const offices = await pdata('offices');      // Q10: E's one-plot-per-NPC offices per hub town
  const horizon = await opt('data/world/horizon.json');      // stream B's 32 m world horizon manifest (joined.room.horizon)
  // the living roads (P19, stream E): who travels, along which routes, and what they say (js/sim/travellers.js)
  const tv = await pdata('travellers'), rt = await opt(`data/provinces/${provinceId}-routes.json`);
  // play-test 4 S9: stream E's wanderers (pedlars with a shop, errand runners with a delivery, storytellers) walk the same
  // routes — their kinds join travellers.json's and every route's allowed list; their `rules` override travellers.json's
  const wd = await pdata('wanderers');
  const cartsData = await pdata('carts');
  const names = (await opt(namesPath(provinceId, sheet))) || (provinceId === HOME_PROVINCE ? null : await opt(namesPath(HOME_PROVINCE)));      // a province's own names, else Torbor's
  const wk = (wd && wd.kinds) || {};
  if (shops && wd && wd.shops) shops.kinds = { ...(shops.kinds || {}), ...wd.shops };      // the pedlar's pack sells like any shop
  const travel = tv && rt ? { kinds: { ...(tv.kinds || {}), ...wk }, rules: { ...(tv.rules || {}), ...((wd && wd.rules) || {}) }, folkKinds: tv.folk || {}, fighters: tv.fighters || null,
    routes: [...(rt.routes || []).map(r => (Array.isArray(r.kinds) && Object.keys(wk).length ? { ...r, kinds: [...r.kinds, ...Object.keys(wk).filter(k => !r.kinds.includes(k))] } : r)),
      // X7 (owner feedback 9, E's note): a guaranteed cart on the road — each carts.json `roaming.runs[]` is a route of its own over the same road
      // that carries ONLY its `only` kinds (no wanderer kinds appended), so there is always one to flag down
      ...(((cartsData && cartsData.roaming && cartsData.roaming.runs) || []).map(run => { const base = (rt.routes || []).find(r => r.id === run.route); return base && Array.isArray(run.only) && run.only.length ? { ...base, id: run.id, kinds: run.only.slice(), run: true, ...(run.carts ? { groups: run.carts } : {}) } : null; }).filter(Boolean))],
    chatter: (await opt('data/names/chatter.json')) || { pools: {}, rules: {} }, names: names || {} } : null;
  const marks = ((await opt(`data/quests/marks/${provinceId}.json`)) || {}).quests || null;   // P17: E's map mark per quest
  // play-test 4: data files that ride straight through buildLayout's `extra` into the province's L
  // play-test 5 T25: angling — C's numbers, E's fish / recipes / rods and E's pool spots (js/sim/angling.js)
  const fishNumbers = await opt('data/rules/fishing.json');
  const angling = fishNumbers ? { numbers: fishNumbers, content: await pdata('angling'), pools: await pdata('angling-pools') } : null;
  // V2 (owner feedback 7): stream E's economy knobs (js/sim/economy-knobs.js reads them; an older `data/rules/economy.json` `server` block is read too)
  // W9 (P-core): professions — the numbers, the content and where the nodes stand (js/sim/professions.js); its job frames join the board's
  const profNumbers = await opt('data/rules/professions.json');
  const professions = profNumbers ? { numbers: profNumbers, content: await pdata('professions'), nodes: await pdata('professions-nodes') } : null;
  if (jobs && Array.isArray(jobs.frames) && professions && professions.content && Array.isArray(professions.content.jobs)) for (const f of professions.content.jobs) if (!jobs.frames.some(x => x.id === f.id)) jobs.frames.push(f);
  const extra = { professions, economy: (await pdata('economy')) || (await opt('data/rules/economy.json')), angling, refunds: await pdata('refunds'), wanderers: wd, treasure: await pdata('road-events'), affixes: await opt('data/encounters/affixes.json'), spawnHints: await opt(`data/quests/marks/${provinceId}-hunts.json`),
    titles: await opt('data/names/titles.json'), givers: await pdata('givers'), carts: cartsData, guards: await pdata('guards'), names,
    hazards: await pdata('hazards'),      // [S] Expansion 1 §4: Vharlen's springs, geysers, vents (js/sim/hazards.js)
    packs: await pdata('packs'), packRoutes: await pdata('pack-routes'),      // [Packs] wandering packs (js/sim/packs.js) and the routes they walk (tools/content-packs.mjs)
    ships: await opt('data/provinces/ships.json'),      // [V] Expansion 1 §6: the realm's harbours and sailings (js/sim/ships.js)
    achievements: await opt('data/rules/achievements.json'),      // feedback #106: achievements and trophies (js/sim/achievements.js)
    // Expansion 1: what the server needs to keep provinces apart — the starter (new characters begin there) and the
    // continent (waystones and free event travel never cross the sea; province-map `continent`, else the province itself)
    starterProvince: !!(sheet && Array.isArray(sheet.band) && sheet.band[0] <= 1), continent: map.continent || provinceId };
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
