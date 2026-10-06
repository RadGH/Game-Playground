#!/usr/bin/env node
// Stream E — place a province's content on stream B's baked zones (PLAN §3.4/§3.5, M2).
//
//   node tools/place-vignettes.mjs                  every zone of Torbor Downs  -> data/vignettes/placements/<world zone>.json
//   node tools/place-vignettes.mjs z12_02           one world zone (or an E zone id, e.g. `ashcombe`)
//   node tools/place-vignettes.mjs test             the M0 fixture zone (vignettes only, the M1 behaviour)
//
// Also writes data/provinces/torbor_downs-places.json: which of B's settlements carry which sheet name, and
// "asks" — a town/hamlet the sheet needs where World Forge put none (stream B places a planned settlement there
// at bake time). Re-run after any re-bake, after tools/assign-vignettes.mjs, and after editing quests/treasure.
// Same inputs -> same files (seeded per zone). See tools/content-place.mjs for the rules every spot obeys.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { parseTerrain, parseNav, NAV } from '../js/rules/terrain-read.js';
import { boringWalk, SIGHT, LIMIT as BORING_LIMIT } from './boring-walk.mjs';
import { J, ROOT, allVignettes, questFiles, provinceMap } from './content-lib.mjs';
import { POINT_TYPES, zoneContext, provinceComponents, discProblem, findSpot, findPoint, openPoint, walkLine, hintFrom, hintScore, rngFor, KIND_RULES, settlementEdge, levelField, campLevels, heavyOk, capCount, countCapAt, groundPieces } from './content-place.mjs';
import { fillDensity, fillHunting, HUNT, routesFor, placeWords } from './content-living.mjs';
import { placeSetpieces, slotFolk } from './content-setpieces.mjs';
import { buildOffices } from './content-offices.mjs';
import { writeShops } from './content-shops.mjs';

const PROV = 'torbor_downs';
const arg = process.argv.slice(2).find(a => !a.startsWith('--')) || null;
// --keep=z12_02,…: keep these zones' placement files as they are (stream B's checked-in bake of the M1 zone is made FROM
// our file, so changing it breaks B's fresh-bake test); they still feed the routes, event places and quest marks
const KEEP = new Set((process.argv.find(a => a.startsWith('--keep=')) || '--keep=').slice(7).split(',').filter(Boolean));
if (arg === 'test') { await legacyTest(); process.exit(); }

const SHEET = J(`data/provinces/${PROV}.json`);
const MAP = provinceMap(PROV);
const SITES = J('data/provinces/sites.json');
const ASSIGN = J(`data/vignettes/assignment/${PROV}.json`).zones;
const RARES = J('data/provinces/rares.json');
const TREASURE = J('data/quests/treasure.json').chains;
const HOOKS = J('data/hooks.json').hooks;
const VIG = new Map(allVignettes().map(v => [v.id, v]));
const QUESTS = Object.fromEntries(questFiles().map(q => [q.zone, q]));
const ARCH = J('data/provinces/archetypes.json');
/** play-test 2 (Q18): hand-designed set pieces pinned near the start (tools/content-setpieces.mjs) */
const SETPIECES = J('data/vignettes/setpieces.json').vignettes;
const TRAVELLERS = J('data/provinces/travellers.json');
/** where each free-standing set piece stood last run (kept while still fair — tools/content-setpieces.mjs) */
const SP_PINS_FILE = new URL('data/provinces/setpiece-pins.json', ROOT);
const SP_PINS = existsSync(SP_PINS_FILE) ? JSON.parse(readFileSync(SP_PINS_FILE, 'utf8')) : { _doc: '', pins: {} };
/** play-test 2 (Q10): every town NPC's office (tools/content-offices.mjs) — quest NPCs with an office stand at its door */
const OFFICES = buildOffices(PROV_ID());
const OFFICE_OF = new Map(Object.values(OFFICES.towns).flatMap(t => t.offices.filter(o => o.npc).map(o => [o.npc, { ...o, town: t.name }])));
const ROUTES = existsSync(new URL(`data/provinces/${PROV_ID()}-routes.json`, ROOT)) ? J(`data/provinces/${PROV_ID()}-routes.json`) : null;
function PROV_ID() { return 'torbor_downs'; }
/** names imposed on stream B's World Forge places that the M1 content already uses */
const WAYSIDE = J('data/vignettes/wayside.json').kinds;
const IMPOSE_EXTRA = { test: { mipider_ford: 'Fitockpi Ford' } };
/** hooks pinned beside a named stream B road (the cliff is cut there by B's bake on request): hook id -> road id */
const HOOK_ROAD = { the_long_stair: 'road_138' };
/** stream B's pinned sites (doors, event arenas, named camps): B never moves them for our placements */
const PINS = existsSync(new URL('data/world/site-pins.json', ROOT)) ? J('data/world/site-pins.json') : {};
/** P26: the level field — levels rise gently from the start hub (tools/content-place.mjs levelField) */
const HUBW = (() => {
  const se = SHEET.grid.start, hub = J(`data/zones/${MAP[se]}/placements.json`).placements.find(p => p.kind === 'settlement' && p.data.hub);
  return { x: SHEET.zones[se].grid[0] * 2048 + hub.x, z: SHEET.zones[se].grid[1] * 2048 + hub.z };
})();
const LF = levelField({ sheet: SHEET, hub: HUBW });
const typeMid = c => Array.isArray(c.level) ? (c.level[0] + c.level[1]) / 2 : (c.level || 1);

// reachability is judged from the province hub over every baked zone stitched together
const PCOMP = (() => {
  const zl = Object.entries(MAP).filter(([, wid]) => existsSync(new URL(`data/zones/${wid}/nav.bin`, ROOT)))
    .map(([eid, wid]) => ({ eid, gx: SHEET.zones[eid].grid[0], gy: SHEET.zones[eid].grid[1], nav: parseNav(readFileSync(new URL(`data/zones/${wid}/nav.bin`, ROOT))) }));
  const se = SHEET.grid.start, hub = J(`data/zones/${MAP[se]}/placements.json`).placements.find(p => p.kind === 'settlement' && p.data.hub);
  return provinceComponents(zl, { gx: SHEET.zones[se].grid[0], gy: SHEET.zones[se].grid[1], x: hub.x, z: hub.z });
})();
const zones = Object.entries(MAP).filter(([eid, wid]) => !arg || arg === eid || arg === wid);
if (!zones.length) { console.error('no such zone: ' + arg); process.exit(1); }
const placesFile = new URL(`data/provinces/${PROV}-places.json`, ROOT);
const places = existsSync(placesFile) ? JSON.parse(readFileSync(placesFile, 'utf8')) : { zones: {} };
let bad = 0;
const states = zones.map(([eid, wid]) => placeZone(eid, wid)).filter(st => st && typeof st === 'object');
for (const st of states) if (KEEP.has(st.wid)) {
  const kept = J(`data/vignettes/placements/${st.wid}.json`);
  st.kept = true; st.file = kept; st.ctx.placed.length = 0; st.ctx.placed.push(...kept.placements); kept.placements = st.ctx.placed;
}
fillBoring(states.filter(st => !st.kept));
for (const st of states) if (!st.kept) fillDensity(st, { LF, typeMid });         // P19: something to see or do every ~100 m (tools/content-living.mjs)
for (const st of states) if (!st.kept) patchRoads(st);                // the same measure tests/E/living.test.js uses, as a last pass
for (const st of states) st.file.levels = LF.span(st.eid);
// play-test 3 R2: monsters near the start, in a file of their own (<zone>.hunt.json — B's bake never reads it, so it runs on kept zones too)
for (const st of states) {
  const h = fillHunting(st, { LF, typeMid });
  const hf = new URL(`data/vignettes/placements/${st.wid}.hunt.json`, ROOT);
  if (!h.file.length) { if (existsSync(hf)) writeFileSync(hf, JSON.stringify({ _doc: 'empty', zone: st.wid, terrainHash: st.file.terrainHash, placements: [] }, null, 1) + '\n'); continue; }
  writeFileSync(hf, JSON.stringify({ _doc: `Stream E (play-test 3 R2). Extra monster camps near the start for world zone ${st.wid}: solos and pairs (a third roaming a small loop) wherever the level ramp is <= ${HUNT.maxLevel} — tools/content-living.mjs fillHunting. Same record shape as the main placements file (type camp, stray/roam, hunt: true); js/sim/content.js merges them. Not read by stream B's bake (monsters need no cleared ground).`, zone: st.wid, eid: st.eid, terrainHash: st.file.terrainHash, stats: h.stats, placements: h.file }, null, 1) + '\n');
  console.log(`${st.wid} hunt ${JSON.stringify(h.stats)}`);
}
if (!arg) livingFiles(states);                                      // routes, event places, quest marks (whole province only)
{ // keep the free set pieces where they are next run (B levels the ground under them; they must not wander off it)
  for (const st of states) for (const p of st.file.placements) if (p.setpiece && !p.bound) SP_PINS.pins[p.id] = { zone: st.wid, x: p.x, z: p.z, yaw: p.yaw };
  SP_PINS._doc = 'Stream E. Where each free-standing set piece (data/vignettes/setpieces.json, not bound to a stream B piece) was placed, zone metres. tools/place-vignettes.mjs keeps a set piece on its old spot while that spot is still fair, so a B re-bake (which levels and clears the ground under our discs) never makes it move. Delete an entry to let the placer choose again.';
  writeFileSync(SP_PINS_FILE, JSON.stringify(SP_PINS, null, 1) + '\n');
}
if (!arg) { writeShops(OFFICES.townShops); writeFileSync(new URL('data/provinces/offices.json', ROOT), JSON.stringify(OFFICES, null, 1) + '\n'); console.log(`offices: ${Object.values(OFFICES.towns).reduce((a, t) => a + t.offices.length, 0)} in ${Object.keys(OFFICES.towns).length} towns${OFFICES.problems.length ? ' PROBLEMS ' + OFFICES.problems.join('; ') : ''}`); }
for (const st of states) {
  const { file, wid, eid } = st;
  if (st.kept) { console.log(`${wid} kept as it is`); continue; }
  writeFileSync(new URL(`data/vignettes/placements/${wid}.json`, ROOT), JSON.stringify(file, null, 1) + '\n');
  const counts = {}; file.placements.forEach(p => counts[p.type] = (counts[p.type] || 0) + 1);
  console.log(`${wid} ${eid.padEnd(18)} ${JSON.stringify(counts)} asks ${places.zones[eid].asks.length}${file.problems.length ? ' PROBLEMS ' + file.problems.join('; ') : ''}`);
  bad += file.problems.length;
}
places._doc = `Stream E. Settlement names for ${SHEET.name} on stream B's bake (tools/place-vignettes.mjs). Per E zone: \`world\` zone id; \`rename\` = B settlement/crossing id -> the name the sheet and quests use (B: impose at bake time, like Torborhold); \`asks\` = a settlement the sheet needs where the world has none (B: place a planned settlement of that kind and radius at x, z — zone metres — with that name; E's placements already keep clear of the circle). After B re-bakes, E re-runs the placer and asks that now exist drop out.`;
places.province = PROV;
writeFileSync(placesFile, JSON.stringify(places, null, 2) + '\n');
if (bad) { console.error(`${bad} problem(s)`); process.exitCode = 1; }

function placeZone(eid, wid) {
  const dir = `data/zones/${wid}/`;
  if (!existsSync(new URL(dir + "nav.bin", ROOT))) { console.error(`${wid}: not baked`); process.exitCode = 1; return null; }
  const terrain = parseTerrain(readFileSync(new URL(dir + 'terrain.bin', ROOT)));
  const nav = parseNav(readFileSync(new URL(dir + 'nav.bin', ROOT)));
  const bake = J(dir + 'placements.json').placements;
  const zs = SHEET.zones[eid], rnd = rngFor(PROV + ':' + wid);
  const problems = [];
  const lo = zs.band[0];

  // ---- settlement names + asks -------------------------------------------------------------------------
  const want = [{ name: zs.town, kind: eid === SHEET.grid.start ? 'town' : (zs.archetype === 'crown_ring' ? 'city' : 'town'), r: 70 }, ...(zs.hamlets || []).map(h => ({ name: h, kind: 'hamlet', r: 40 }))];
  const bSettle = bake.filter(p => p.kind === 'settlement').sort((a, b) => (b.data.hub - a.data.hub) || (b.data.radius - a.data.radius));
  const rename = { ...(IMPOSE_EXTRA[eid] || {}) };
  const free = [...bSettle];
  // rename keys are the World Forge name's slug (B keeps it as data.wfName once it has imposed ours), so the file is
  // the same before and after B's re-bake
  const wfKey = s => slug(s.data.wfName || s.data.name);
  for (const w of want) {           // a B settlement already carrying the name (Torborhold, or an ask B has baked) keeps it
    const k = free.findIndex(s => s.data.name === w.name);
    if (k >= 0) { w.at = free[k]; free.splice(k, 1); if (w.at.data.wfName && w.at.data.wfName !== w.name) rename[wfKey(w.at)] = w.name; }
  }
  for (const w of want) if (!w.at && free.length) { w.at = free.shift(); rename[wfKey(w.at)] = w.name; }
  const start = bSettle[0] ? { x: bSettle[0].x, z: bSettle[0].z } : null;
  // an ask stream B has already baked stays in the list (B re-reads it every bake): same name, kind, spot, radius
  const prevAsks = ((places.zones[eid] || {}).asks || []);
  const asks = want.filter(w => w.at && w.at.data.ask).map(w => prevAsks.find(a => a.name === w.name) || { name: w.name, kind: w.kind, x: w.at.x, z: w.at.z, r: w.r });
  const cell = { gx: zs.grid[0], gy: zs.grid[1] };
  const pinned = new Set(Object.keys(PINS[wid] || {}));
  let ctx = zoneContext({ terrain, nav, placements: bake, start, province: PCOMP, cell, pinned });
  for (const w of want.filter(w => !w.at)) {
    // stream B's rule: a hub keeps r + 200 m from every edge, any other settlement r + 70 m. Flattest ground first,
    // then a little steeper (B levels a settlement's circle when it plans it).
    const margin = w.r + 80;
    let spot = null;
    for (const slope of [10, 14, 18, 22]) {
      KIND_RULES.settlement.slope = slope;
      spot = findSpot(ctx, rnd, 'settlement', w.r + 20, { tries: 4000, spread: 0.5, score: (x, z) => {
        if (x < margin || z < margin || x > ctx.extent - margin || z > ctx.extent - margin) return -Infinity;
        const rd = ctx.roadDist(x, z); return (rd < 160 ? 160 - rd : 0) + (w.kind !== 'hamlet' ? -Math.hypot(x - 1024, z - 1024) * 0.15 : 0);
      } });
      if (spot) break;
    }
    KIND_RULES.settlement.slope = 10;
    if (!spot) { problems.push(`no room for settlement ${w.name}`); continue; }
    const ask = { name: w.name, kind: w.kind, x: spot.x, z: spot.z, r: w.r };
    asks.push(ask);
    ctx.settlements.push({ ...ask, source: 'ask' });
  }
  // rebuild once so the main component is the one the (first) town sits in
  const town0 = want[0].at ? { x: want[0].at.x, z: want[0].at.z } : asks[0] || start;
  ctx = zoneContext({ terrain, nav, placements: bake, start: town0, reserve: asks.filter(a => !want.some(w => w.at && w.name === a.name)).map(a => ({ ...a })), province: PCOMP, cell, pinned });
  for (const s of ctx.settlements) { const k = slug(s.wfName || s.name); if (rename[k]) s.name = rename[k]; }
  places.zones[eid] = { world: wid, rename, asks, ...nameAsks(eid, wid) };

  const P = ctx.placed, features = [];
  const lvl = (x, z) => LF.at(eid, x, z), top = zs.band[1];
  const lvlFloor = (x, z) => Math.max(1, Math.min(top, Math.floor(lvl(x, z))));
  // point-like things get radius 1 so stream B's bake keeps scatter off them (B reads `radius || 12`)
  const push = rec => { if (POINT_TYPES.has(rec.type)) rec.radius = 1; P.push(rec); return rec; };
  const named = () => [
    ...ctx.settlements.map(s => ({ name: s.name, x: s.x, z: s.z, r: s.r, kind: 'settlement', id: s.id || s.name })),
    ...bake.filter(p => ['crossing', 'landmark', 'lair', 'pass'].includes(p.kind)).map(p => ({ name: rename[slug(p.data.wfName || p.data.name)] || p.data.name, x: p.x, z: p.z, r: 15, kind: p.kind, id: p.id })),
    ...P.filter(p => p.name && p.radius != null && !POINT_TYPES.has(p.type)).map(p => ({ name: p.name, x: p.x, z: p.z, r: p.radius, kind: p.type, id: p.id })),
  ];
  const nearOf = (hint, min, max) => hint.near ? { x: hint.near.x, z: hint.near.z, min: (hint.near.r || 0) + min, max: (hint.near.r || 0) + max } : null;
  const pickW = (weights) => { const e = Object.entries(weights || {}); let t = e.reduce((s, [, w]) => s + w, 0) * rnd(); for (const [k, w] of e) { t -= w; if (t <= 0) return k; } return e[0] && e[0][0]; };
  const byArch = SITES.byArchetype[zs.archetype];
  const extras = ARCH.archetypes[zs.archetype].extras || {};
  const count = v => Array.isArray(v) ? v[0] + Math.floor(rnd() * (v[1] - v[0] + 1)) : (v || 0);

  // ---- set pieces (play-test 2, Q18) — first, so they get the best ground near the start -----------------
  {
    const [gx, gy] = zs.grid, m = /^z(\d+)_(\d+)$/.exec(wid);
    const spPlaced = placeSetpieces({ list: SETPIECES, eid, ctx, rnd, push, problems, terrain, lvlFloor, top, faceRoad, bake, pins: SP_PINS.pins,
      hubAt: (x, z) => Math.hypot(gx * 2048 + x - HUBW.x, gy * 2048 + z - HUBW.z), routes: ROUTES, org: m ? [+m[1] * 2048, +m[2] * 2048] : [0, 0] });
    // stream B's other set pieces: a worker at each marked slot (gravedigger, farmer, picker, innkeeper…)
    const TF = TRAVELLERS.folk;
    slotFolk({ bake, eid, push, ctx, walkLine, taken: new Set([...spPlaced.values()].map(r => r.bound).filter(Boolean)), chatterFor: role => (TF[role] && TF[role].chatter) || null });
  }
  // ---- forts ---------------------------------------------------------------------------------------------
  const fortN = Math.max(1, extras.forts || 1);
  for (let i = 0; i < fortN; i++) {
    const tpl = (i === 0 && fortTemplateFor(zs.fort, zs.archetype)) || pickW(byArch.forts);
    const T = SITES.forts[tpl];
    const name = i === 0 ? zs.fort : `${zs.town} Outpost`;
    const roadPref = (x, z) => { const d = ctx.roadDist(x, z); return d < 140 ? 140 - d : 0; };
    const spot = findSpot(ctx, rnd, 'fort', T.radius, { score: roadPref, spread: 1 });
    if (!spot) { problems.push(`fort ${name}`); continue; }
    push({ type: 'fort', id: `fort_${eid}_${i}`, name, template: tpl, friendly: !!T.friendly, x: spot.x, z: spot.z, yaw: faceRoad(spot), radius: T.radius, level: Math.min(top, lvlFloor(spot.x, spot.z) + 1) });
  }
  // ---- farms ---------------------------------------------------------------------------------------------
  const farmBase = Math.max(2, count(extras.farms) || 2), farmBurned = count(extras.burnedFarms), farmCorrupt = count(extras.corruptedFarms);
  const farmN = farmBase + farmBurned + farmCorrupt;
  const farmFlavour = i => i < farmBase ? null : i < farmBase + farmBurned ? 'burned' : 'corrupted';
  for (let i = 0; i < farmN; i++) {
    let tpl = pickW(byArch.farms);
    for (let tryTpl = 0; tryTpl < 3; tryTpl++) {
      const T = SITES.farms[tpl];
      const needsWater = T.needs ? (tpl === 'mill' ? 30 : 12) : 0;
      const home = ctx.settlements[i % Math.max(1, ctx.settlements.length)];
      const near = home ? { x: home.x, z: home.z, min: home.r + T.radius + 25, max: home.r + 450 } : null;
      const spot = findSpot(ctx, rnd, 'farm', T.radius, { near, tries: 2000, spread: 0.6, score: (x, z) => {
        if (needsWater && ctx.waterDist(x, z) > T.radius + needsWater) return -Infinity;
        return -settlementEdge(ctx, x, z) * 0.2;
      } });
      if (spot) {
        const flavour = farmFlavour(i);
        push({ type: 'farm', id: `farm_${eid}_${i}`, name: farmName(tpl, home, flavour), template: tpl, flavour, settlement: home ? home.name : null, x: spot.x, z: spot.z, yaw: faceRoad(spot), radius: T.radius, level: lvlFloor(spot.x, spot.z), ...(countCapAt(LF.dist(eid, spot.x, spot.z)) ? { countCap: countCapAt(LF.dist(eid, spot.x, spot.z)) } : {}) });
        break;
      }
      tpl = tryTpl === 0 ? (byArch.farms.sheep ? 'sheep' : 'arable') : 'pig';   // no water / no room: a dry-land farm instead
      if (tryTpl === 2) problems.push(`farm ${i}`);
    }
  }
  // ---- caves ---------------------------------------------------------------------------------------------
  const caveN = (rnd() < 0.5 ? 1 : 2) + count(extras.smallShafts ? [1, 2] : 0) + count(extras.beastDens ? [1, 1] : 0);
  for (let i = 0; i < Math.min(4, caveN); i++) {
    const tpl = extras.smallShafts && i >= 1 ? 'old_shaft' : extras.beastDens && i >= 1 ? 'beast_den' : pickW(byArch.caves);
    const T = SITES.caves[tpl];
    const spot = findSpot(ctx, rnd, 'cave', 10, { spread: 1, score: (x, z) => { const d = ctx.steepDist(x, z); return d < 120 ? 200 - d * 1.5 : 0; } });
    if (!spot) { problems.push(`cave ${tpl}`); continue; }
    const cl = Math.min(top, lvlFloor(spot.x, spot.z) + 1);
    push({ type: 'cave', id: `cave_${eid}_${i}`, name: T.name, template: tpl, plan: { ...T.plan, level: cl }, x: spot.x, z: spot.z, yaw: faceDownhill(spot), radius: 10, level: cl });
  }
  // ---- the zone hook -------------------------------------------------------------------------------------
  const hook = HOOKS.find(h => h.id === zs.hook);
  if (hook) placeHook(hook);
  // ---- vignettes -----------------------------------------------------------------------------------------
  const wet = new Set(['lake', 'coast', 'beach', 'marsh']);
  for (const id of ASSIGN[eid] || []) {
    const v = VIG.get(id);
    const wantsWater = v.tags.biomes.every(b => wet.has(b));
    const biomeOk = (x, z) => v.tags.biomes.includes(terrain.biomes[terrain.biomeAt(x, z)].key);
    const spot = findSpot(ctx, rnd, 'vignette', v.radius, { tries: 3000, spread: 1.2, score: (x, z) => (biomeOk(x, z) ? 120 : 0) + (wantsWater ? Math.max(0, 140 - ctx.waterDist(x, z)) : 0) });
    if (!spot) { problems.push(`vignette ${id}`); continue; }
    push({ type: 'vignette', id, name: v.name, x: spot.x, z: spot.z, yaw: +(rnd() * Math.PI * 2).toFixed(2), radius: v.radius, biome: terrain.biomes[terrain.biomeAt(spot.x, spot.z)].key, biomeFits: biomeOk(spot.x, spot.z), level: 1, levelBase: lvlFloor(spot.x, spot.z), levelCap: Math.min(top, lvlFloor(spot.x, spot.z) + 1), ...(countCapAt(LF.dist(eid, spot.x, spot.z)) ? { countCap: countCapAt(LF.dist(eid, spot.x, spot.z)) } : {}) });
  }
  // ---- wilds camps (the sheet's camp mix, each twice) ----------------------------------------------------
  (zs.camps || []).forEach((c, ci) => {
    for (let n = 0; n < 2; n++) {
      const hint = hintFrom(c.where, named());
      const near = nearOf(hint, 60, 320);
      // P26: a weaker type goes where the ramp is low, a stronger one further out
      const hs = hintScore(ctx, hint), want = Math.min(top, Math.max(LF.span(eid)[0], typeMid(c)));
      const sc = (x, z) => (heavyOk(c.type, lvl(x, z)) ? hs(x, z) - 30 * Math.abs(lvl(x, z) - want) : -Infinity);
      const spot = findSpot(ctx, rnd, 'camp', 10, { near, tries: 1500, spread: 1, score: sc }) || (near ? findSpot(ctx, rnd, 'camp', 10, { spread: 1, score: sc }) : null);
      if (!spot) { problems.push(`camp ${c.type}`); continue; }
      push({ type: 'camp', id: `camp_${eid}_${ci}_${n}`, monster: c.type, with: LF.dist(eid, spot.x, spot.z) < 900 ? null : (c.with || null), level: campLevels(lvl(spot.x, spot.z), top), count: capCount(c.count, LF.dist(eid, spot.x, spot.z)), x: spot.x, z: spot.z, yaw: 0, radius: 10 });
    }
  });
  // ---- rares: spawn + a walkable roaming loop ------------------------------------------------------------
  (RARES[eid] || []).forEach((rid, slot) => {
    let enc = {}; try { enc = J(`data/encounters/${rid}.json`); } catch { /* id only */ }
    const hint = hintFrom(enc.place || '', named());
    for (let attempt = 0; attempt < 30; attempt++) {
      const near = attempt < 15 ? nearOf(hint, 150, 450) : null;
      const hs = hintScore(ctx, hint);   // the best-scoring spot can fail its loop every time: widen with noise per attempt
      const spot = findSpot(ctx, rnd, 'rare', 15, { near, tries: 600, spread: 0.5, score: (x, z) => hs(x, z) + rnd() * attempt * 40 });
      if (!spot) continue;
      const path = roamLoop(spot);
      if (!path) continue;
      push({ type: 'rare', id: rid, slot, name: enc.name || rid, x: spot.x, z: spot.z, yaw: 0, radius: 15, path, respawnMin: [20, 60], level: Math.min(top, lvlFloor(spot.x, spot.z) + 2) });
      return;
    }
    problems.push(`rare ${rid}`);
  });
  // ---- waystones (P14: one per place, never two within 60 m) ---------------------------------------------
  // A hub town (stream A's town room: a hub, town or city) gets its stone INSIDE its circle by the square, else
  // stream A adds a second one in the square; a dungeon door gets its stone 10-30 m away, inside A's 40 m rule,
  // else A adds a second one by the door. The door is pinned (data/world/site-pins.json), so standing close never
  // moves it. Named after the zone's dungeon (the sheet's `dungeon.name`), not B's generic "Barrow entrance".
  const ws = [];
  const WS_SEP = 60;
  const wsPush = rec => { if (ws.some(w => Math.hypot(w.x - rec.x, w.z - rec.z) < WS_SEP)) { problems.push(`waystone ${rec.name} within ${WS_SEP} m of another`); return; } ws.push(push(rec)); };
  const townRoom = s => s.hub || ['town', 'city', 'capital'].includes(s.kind);
  for (const s of ctx.settlements) {
    let p = null;
    if (townRoom(s)) {
      const sq = bake.find(b => b.kind === 'town_square' && b.data.town === s.id), c = sq ? { x: sq.x, z: sq.z } : s;
      p = findPoint(ctx, rnd, { x: c.x, z: c.z, min: 5, max: Math.max(12, s.r * 0.5) }, { allowTown: true, avoidRoad: false, clearance: 2, keepFrom: ws, minSep: WS_SEP, prefer: (x, z) => -Math.hypot(x - c.x, z - c.z) });
    }
    if (!p) p = findPoint(ctx, rnd, { x: s.x, z: s.z, min: s.r + 8, max: s.r + 30 }, { clearance: 2, keepFrom: ws, minSep: WS_SEP, prefer: (x, z) => -Math.abs(ctx.roadDist(x, z) - 8) });
    if (p) wsPush({ type: 'waystone', id: `ws_${wid}_${slug(s.name)}`, name: s.name, x: p.x, z: p.z, yaw: 0, settlement: s.name });
    else problems.push(`waystone ${s.name}`);
  }
  const door = bake.find(p => p.kind === 'dungeon_door');
  const doorName = (zs.dungeon && zs.dungeon.name) || door?.data?.name || 'Dungeon entrance';
  if (door) {
    const p = findPoint(ctx, rnd, { x: door.x, z: door.z, min: 10, max: 30 }, { clearance: 2, avoidRoad: false, keepFrom: ws, minSep: WS_SEP })
      || findPoint(ctx, rnd, { x: door.x, z: door.z, min: 6, max: 36 }, { clearance: 1, avoidRoad: false, keepFrom: ws, minSep: WS_SEP });
    if (p) wsPush({ type: 'waystone', id: `ws_${wid}_door`, name: doorName, x: p.x, z: p.z, yaw: 0, door: door.id });
    else problems.push('waystone door');
    // the door guard (P26): a pack of the zone's weakest type at the ramp's level, instead of stream A's fixed level-3 one
    const weakest = (zs.camps || []).slice().sort((a, b) => typeMid(a) - typeMid(b))[0];
    const g = weakest && findSpot(ctx, rnd, 'stray', 6, { near: { x: door.x, z: door.z, min: 38, max: 70 }, tries: 1500, spread: 0, score: (x, z) => -Math.hypot(x - door.x, z - door.z) });
    if (weakest && !g) problems.push('door guard');
    if (g) push({ type: 'camp', id: `camp_${eid}_door`, monster: weakest.type, with: null, level: campLevels(lvl(g.x, g.z), top), count: capCount([2, 2], LF.dist(eid, g.x, g.z)), x: g.x, z: g.z, yaw: 0, radius: 6, doorGuard: true });
  }
  const wb = SHEET.worldBoss && SHEET.worldBoss.zone === eid ? bake.find(p => p.id === SHEET.worldBoss.id) : null;
  if (wb) { const p = findPoint(ctx, rnd, { x: wb.x, z: wb.z, min: (wb.data?.r || 100) + 20, max: (wb.data?.r || 100) + 60 }, { clearance: 2, keepFrom: ws, minSep: WS_SEP }); if (p) wsPush({ type: 'waystone', id: `ws_${wid}_worldboss`, name: 'Grimtallow\'s Hollow', x: p.x, z: p.z, yaw: 0, event: wb.id }); else problems.push('waystone world boss'); }
  // ---- quest NPCs ----------------------------------------------------------------------------------------
  const q = QUESTS[eid];
  const npcKeep = new Map();
  for (const [nid, n] of Object.entries((q && q.npcs) || {})) {
    const p = npcSpot(n.at, npcKeep, nid);
    if (!p) { problems.push(`npc ${nid} at ${n.at}`); continue; }
    push({ type: 'npc', id: nid, name: n.name, role: n.role, at: n.at, x: p.x, z: p.z, yaw: p.yaw ?? +(rnd() * 6.28).toFixed(2),
      ...(p.office ? { office: p.office } : {}), ...(n.trains ? { trains: n.trains } : {}) });
  }
  // ---- treasure clues + caches ---------------------------------------------------------------------------
  for (const c of TREASURE) {
    c.steps.forEach((s, k) => { if (s.zone === eid) placeTreasure(c, s, k, 'treasure_clue'); });
    if (c.cache.zone === eid) placeTreasure(c, c.cache, c.steps.length, 'treasure_cache');
  }

  // ---- checks on stream B's own sites (door, event arenas, world boss) -----------------------------------
  const checks = bake.filter(p => ['dungeon_door', 'event_site', 'camp_site'].includes(p.kind)).map(p => {
    const r = p.kind === 'dungeon_door' ? 3 : (p.data?.r || 20) * 0.6;
    let ok = openPoint(ctx, p.x, p.z, { allowRoad: true, slope: 35 }) || ring(p, 4).some(q2 => openPoint(ctx, q2.x, q2.z, { allowRoad: true, slope: 35 }));
    let share = ring(p, r).filter(q2 => openPoint(ctx, q2.x, q2.z, { allowRoad: true, slope: 35 })).length / 16;
    return { id: p.id, kind: p.kind, x: p.x, z: p.z, reachable: ok, openShare: +share.toFixed(2) };
  });

  const file = {
    _doc: `Stream E. Content placements for world zone ${wid} (E zone '${eid}', ${zs.name}) — tools/place-vignettes.mjs against stream B's bake (terrain ${terrain.meta.inputHash}). Zone metres. type: vignette (id = recipe id in data/vignettes/*.json; rotate recipe offsets by yaw, js/sim/vignettes.js vignettePoint) · fort/farm/cave (template = data/provinces/sites.json key) · camp (monster, with, level [lo,hi], count [lo,hi]) · rare (encounter id, slot, path = roaming loop, every leg walkable) · waystone · npc (quest NPC id from data/quests/<zone>.json) · treasure_clue / treasure_cache (chain id from data/quests/treasure.json, step index) · hook (data/hooks.json) as a disc. \`features\` = hooks that ARE an existing feature (at a crossing, the settlement itself, a line across the zone with pts) — not keep-clear discs. Everything with a radius is on dry walkable ground in the zone's main walkable component, off roads, streets, plots and settlements.`,
    zone: wid, sheetZone: eid, province: PROV, terrainHash: terrain.meta.inputHash, band: zs.band, archetype: zs.archetype,
    rules: KIND_RULES, mainWalkableShare: +ctx.mainShare.toFixed(3), settlements: ctx.settlements.map(s => ({ name: s.name, kind: s.kind, x: s.x, z: s.z, r: s.r, source: s.source, bakeId: s.id || null })),
    checks, problems, placements: P, features,
  };
  return { eid, wid, zs, ctx, rnd, file, nav, bake };

  // ---- helpers (closures over this zone) -----------------------------------------------------------------
  function ring(p, r) { return Array.from({ length: 16 }, (_, a) => ({ x: p.x + Math.cos(a / 16 * 6.283) * r, z: p.z + Math.sin(a / 16 * 6.283) * r })); }
  function faceRoad(s) {
    let best = null, bd = Infinity;
    for (let a = 0; a < 16; a++) { const x = s.x + Math.cos(a / 16 * 6.283) * 60, z = s.z + Math.sin(a / 16 * 6.283) * 60; const d = ctx.roadDist(x, z); if (d < bd) { bd = d; best = { x, z }; } }
    return +Math.atan2(best.x - s.x, best.z - s.z).toFixed(2);     // protocol: yaw = atan2(dx, dz)
  }
  function faceDownhill(s) {
    const h = (x, z) => terrain.heightAt(x, z); let best = 0, low = Infinity;
    for (let a = 0; a < 16; a++) { const x = s.x + Math.cos(a / 16 * 6.283) * 20, z = s.z + Math.sin(a / 16 * 6.283) * 20; if (h(x, z) < low) { low = h(x, z); best = Math.atan2(x - s.x, z - s.z); } }
    return +best.toFixed(2);
  }
  function roamLoop(c) {
    const n = 5, R = 60 + rnd() * 50, a0 = rnd() * 6.283, pts = [];
    for (let i = 0; i < n; i++) {
      let p = null;
      for (let t = 0; t < 12 && !p; t++) {
        const a = a0 + i / n * 6.283 + (rnd() - 0.5) * 0.6, r = R * (0.7 + rnd() * 0.5);
        const x = Math.round(c.x + Math.cos(a) * r), z = Math.round(c.z + Math.sin(a) * r);
        if (openPoint(ctx, x, z, { slope: 30 }) && settlementEdge(ctx, x, z) > 60 && (!pts.length || walkLine(ctx, pts[pts.length - 1], { x, z }))) p = { x, z };
      }
      if (!p) return null;
      pts.push(p);
    }
    if (!walkLine(ctx, pts[pts.length - 1], pts[0]) || !walkLine(ctx, c, pts[0])) return null;
    return pts.map(p => [p.x, p.z]);
  }
  function placeOf(at) {
    if (typeof at === 'string') {
      const v = P.find(p => p.type === 'vignette' && p.id === at); if (v) return { kind: 'vignette', p: v };
      const s = ctx.settlements.find(s2 => s2.name === at); if (s) return { kind: 'settlement', p: s };
      const f = P.find(p => p.type === 'fort' && p.name === at); if (f) return { kind: 'fort', p: f };
      const n = named().find(x => x.name === at); if (n) return { kind: n.kind, p: n };
    }
    return null;
  }
  function npcSpot(at, keep, nid = null) {
    const off = nid && OFFICE_OF.get(nid);
    if (off && off.town === at && off.door) {          // Q10: a town NPC with an office stands at its own door
      const k = keep.get(at) || []; keep.set(at, k);
      const p = findPoint(ctx, rnd, { x: off.door.x, z: off.door.z, min: 0, max: 4 }, { allowTown: true, avoidRoad: false, clearance: 0.8, keepFrom: k, minSep: 3, prefer: (x, z) => -Math.hypot(x - off.door.x, z - off.door.z) });
      if (p) { k.push(p); return { ...p, office: off.plot, yaw: off.door.yaw }; }
    }
    const pl = placeOf(at); if (!pl) return null;
    const k = keep.get(at) || []; keep.set(at, k);
    let p;
    if (pl.kind === 'settlement') {
      const sq = bake.find(b => b.kind === 'town_square' && b.data.town === pl.p.id);
      const c = sq ? { x: sq.x, z: sq.z } : pl.p;
      p = findPoint(ctx, rnd, { x: c.x, z: c.z, min: 3, max: Math.max(12, pl.p.r * 0.6) }, { allowTown: true, avoidRoad: false, keepFrom: k, minSep: 4, prefer: (x, z) => -Math.hypot(x - c.x, z - c.z) });
    } else if (pl.kind === 'fort') p = findPoint(ctx, rnd, { x: pl.p.x, z: pl.p.z, min: 2, max: pl.p.radius * 0.5 }, { keepFrom: k, minSep: 3 });
    else p = findPoint(ctx, rnd, { x: pl.p.x, z: pl.p.z, min: 2.5, max: Math.max(5, (pl.p.radius || 10) * 0.6) }, { keepFrom: k, minSep: 3, avoidRoad: false });
    if (p) k.push(p);
    return p;
  }
  function placeTreasure(chain, s, k, type) {
    const at = s.at;
    let p = null, where = null;
    if (typeof at === 'string' || (at && at.site)) {
      const name = typeof at === 'string' ? at : at.site;
      const pl = placeOf(name);
      if (pl && pl.kind === 'vignette') { p = findPoint(ctx, rnd, { x: pl.p.x, z: pl.p.z, min: 3, max: pl.p.radius * 0.8 }, { avoidRoad: false }); where = 'vignette ' + name; }
      else if (pl && pl.kind === 'settlement') { p = findPoint(ctx, rnd, { x: pl.p.x, z: pl.p.z, min: pl.p.r + 5, max: pl.p.r + 35 }); where = 'edge of ' + name; }
      else if (pl && pl.kind === 'fort') { p = findPoint(ctx, rnd, { x: pl.p.x, z: pl.p.z, min: 2, max: pl.p.radius * 0.6 }); where = 'fort ' + name; }
      else if (pl) { p = findPoint(ctx, rnd, { x: pl.p.x, z: pl.p.z, min: 8, max: 40 }, { avoidRoad: true }); where = pl.kind + ' ' + name; }
    }
    if (!p && at) {
      const hint = hintFrom(at.landmark || at.site || at, named());
      const sc = hintScore(ctx, hint);
      if (hint.near) { p = findPoint(ctx, rnd, { x: hint.near.x, z: hint.near.z, min: (hint.near.r || 0) + 40, max: (hint.near.r || 0) + 180 }, { prefer: sc }); where = 'near ' + hint.near.name; }
      if (!p) { const sp = findSpot(ctx, rnd, 'camp', 4, { score: (x, z) => sc(x, z) + Math.min(300, settlementEdge(ctx, x, z)) * 0.3, spread: 0.2, tries: 1500 }); if (sp) { p = sp; where = 'secluded'; } }
    }
    if (!p) { problems.push(`treasure ${chain.id} step ${k}`); return; }
    push({ type, id: `${chain.id}_${k}`, chain: chain.id, step: k, clue: s.clue || null, how: s.how || null, shimmer: s.shimmer || null, x: p.x, z: p.z, yaw: 0, where });
  }
  function placeHook(h) {
    const need = String(h.tags.needs || '');
    const hint = hintFrom(`${h.at && h.at.site} ${need}`, named());
    const size = +(need.match(/(\d+)\s*m/) || [])[1] || 0;
    const R = Math.max(15, Math.min(55, size ? size / 2 : 20));
    let rec = null;
    const pinRoad = HOOK_ROAD[h.id] && bake.find(b => b.id === HOOK_ROAD[h.id]);
    if (pinRoad) {
      const pts = pinRoad.data.pts.filter(q => q[0] >= 0 && q[1] >= 0 && q[0] <= ctx.extent && q[1] <= ctx.extent);
      const mid = pts[Math.floor(pts.length / 2)] || pts[0];
      const spot = mid && (findSpot(ctx, rnd, 'hook', 15, { near: { x: mid[0], z: mid[1], min: 20, max: 90 }, tries: 3000, spread: 0, score: (x, z) => -ctx.roadDist(x, z) - Math.hypot(x - mid[0], z - mid[1]) * 0.5 - (z > mid[1] ? 40 : 0) }));
      if (spot) rec = { x: spot.x, z: spot.z, radius: 15, how: `beside ${pinRoad.id} (the pass road): stream B cuts the cliff here` };
    }
    if (rec) { /* pinned */ }
    else if (/a ford/.test(need) && hint.near && hint.near.kind === 'crossing') rec = { x: hint.near.x, z: hint.near.z, radius: null, how: 'at the crossing' };
    else if (/through the city/.test(need) && hint.near && hint.near.kind === 'settlement') rec = { x: hint.near.x, z: hint.near.z, radius: null, r: hint.near.r, how: 'the settlement itself' };
    else if (/line across/.test(need)) {
      const x0 = 900 + Math.round(rnd() * 250), pts = [];
      for (let z = 80; z <= ctx.extent - 80; z += 40) { const x = x0 + Math.round(Math.sin(z / 300) * 120); if (openPoint(ctx, x, z, { slope: 40 }) && settlementEdge(ctx, x, z) > 40) pts.push([x, z]); }
      rec = { x: x0, z: 1024, radius: null, pts, how: 'a line north to south; gaps where the ground or a road breaks it' };
    } else {
      const near = /road/.test(need) ? null : nearOf(hint, R + 40, R + 400);
      const sc = hintScore(ctx, { ...hint, water: hint.water || /water|lake|beach|stream/.test(need), steep: hint.steep || /cliff|slope|hill/.test(need), road: /road/.test(need) });
      // near the named place first; if the ground there cannot give what the hook needs, anywhere in the zone
      for (const [nr, rr] of [[near, R], [null, R], [null, 15]]) {
        const spot = findSpot(ctx, rnd, 'hook', rr, { near: nr, tries: 3000, spread: 0.3, score: sc });
        if (!spot) continue;
        const cand = { x: spot.x, z: spot.z, radius: rr, how: 'best fit for: ' + need };
        if (!rec) rec = cand;
        if (needMet(need, cand)) { rec = cand; break; }
      }
    }
    if (!rec) { problems.push('hook ' + h.id); return; }
    const met = needMet(need, rec);
    const out = { type: 'hook', id: h.id, name: h.name, kind: h.kind, x: rec.x, z: rec.z, yaw: 0, radius: rec.radius, pts: rec.pts, where: rec.how, needMet: met };
    // a hook that IS an existing feature (a ford, the city, a line across the zone) is not a disc: it goes in
    // `features`, which stream B's bake does not read as a keep-clear disc
    if (rec.radius == null) { delete out.radius; features.push(out); } else push(out);
  }
  function needMet(need, rec) {
    const reach = 80 + (rec.radius || rec.r || 0);
    if (/water|lake|beach|stream|ford|river/.test(need)) return ctx.waterDist(rec.x, rec.z) < reach;
    if (/cliff|slope|hill/.test(need) && /road/.test(need) && ctx.roadDist(rec.x, rec.z) > reach) return false;
    if (/cliff|slope|hill/.test(need)) return ctx.steepDist(rec.x, rec.z) < reach;
    return true;
  }
}

/**
 * PLAN §16 "longest boring walk <= 250 m": while a road stretch or an open pocket is out of sight of everything for
 * too long, drop a filler there — a wayside dressing (data/vignettes/wayside.json) or a camp from the zone's mix,
 * alternating. Zones not being placed this run count with their files from disk.
 */
function fillBoring(states) {
  const byWid = new Map(states.map(st => [st.wid, st]));
  const all = Object.entries(MAP).map(([eid, wid]) => {
    const st = byWid.get(wid);
    if (st) return { id: wid, gx: st.zs.grid[0], gy: st.zs.grid[1], nav: st.nav, bake: st.bake, file: st.file };
    const f = new URL(`data/vignettes/placements/${wid}.json`, ROOT);
    if (!existsSync(f)) return null;
    return { id: wid, gx: SHEET.zones[eid].grid[0], gy: SHEET.zones[eid].grid[1], nav: parseNav(readFileSync(new URL(`data/zones/${wid}/nav.bin`, ROOT))), bake: J(`data/zones/${wid}/placements.json`).placements, file: J(`data/vignettes/placements/${wid}.json`) };
  }).filter(Boolean);
  const reachable = gi => PCOMP.label[gi] === PCOMP.main;
  const goal = BORING_LIMIT - 10, n = new Map(), dead = new Set();
  for (let iter = 0; iter < 80; iter++) {
    const r = boringWalk(all, { reachable });
    const want = [];
    for (const p of r.pockets) if (2 * (p.d - SIGHT) > goal) want.push({ zone: p.zone, x: p.x, z: p.z, road: false });
    if (r.road.worst > goal && r.road.cut) want.push({ zone: r.road.at.zone, x: r.road.cut.x, z: r.road.cut.z, road: true });
    let added = 0;
    for (const w of want) {
      const st = byWid.get(w.zone); if (!st) continue;
      const key = `${w.zone}:${Math.round(w.x / 40)}:${Math.round(w.z / 40)}`; if (dead.has(key)) continue;
      const k = n.get(w.zone) || 0;
      const { ctx, rnd, zs, eid } = st;
      // alternate wayside / camp; if the preferred kind finds no room, try the other before giving up on the spot
      let camp = k % 2 === 1 && (zs.camps || []).length > 0, spot = null;
      // the wayside kind is chosen first (its radius is the disc that is checked), by the biome of the pocket
      const pb = ctx.terrain.biomes[ctx.terrain.biomeAt(w.x, w.z)].key;
      const fits = WAYSIDE.filter(w2 => !w2.biomes.length || w2.biomes.includes(pb));
      const pool = fits.length ? fits : WAYSIDE, wk = pool[Math.floor(rnd() * pool.length)];
      for (const c of camp ? [true, false] : [false, (zs.camps || []).length > 0]) {
        const R = c ? 10 : wk.radius, kind = c ? 'camp' : 'wayside';
        for (const max of w.road ? [60, 120] : [80, 160]) {
          spot = findSpot(ctx, rnd, kind, R, { near: { x: w.x, z: w.z, min: w.road ? R + 8 : 0, max }, tries: 1200, spread: 0, score: (x, z) => -Math.hypot(x - w.x, z - w.z) });
          if (spot) break;
        }
        if (spot) { camp = c; break; }
        if (c === false && !(zs.camps || []).length) break;
      }
      if (!spot) { dead.add(key); continue; }
      n.set(w.zone, k + 1); added++;
      if (camp) {
        const fl = LF.at(eid, spot.x, spot.z), fd = LF.dist(eid, spot.x, spot.z);
        const ok = zs.camps.filter(c2 => heavyOk(c2.type, fl));
        const c = (ok.length ? ok : zs.camps)[Math.floor(k / 2) % (ok.length || zs.camps.length)];
        ctx.placed.push({ type: 'camp', id: `camp_${eid}_f${k}`, monster: c.type, with: fd < 900 ? null : (c.with || null), level: campLevels(fl, zs.band[1]), count: capCount([2, 3], fd), x: spot.x, z: spot.z, yaw: 0, radius: 10, filler: true });
      } else {
        ctx.placed.push({ type: 'wayside', id: `${wk.id}_${eid}_${k}`, kind: wk.id, name: wk.name, x: spot.x, z: spot.z, yaw: +(rnd() * 6.28).toFixed(2), radius: wk.radius, filler: true });
      }
    }
    if (!added) break;
  }
}

/**
 * A last pass over the roads with the INDEPENDENT measure tests/E/living.test.js uses (every 16 m road sample within
 * 50 m of a placement edge, a path point, a settlement or a B site): fillDensity's own grid can call a stretch covered
 * that this measure does not (play-test 2 re-place: 6 samples on one road in z11_04). Drops a wayside dressing by each
 * uncovered stretch until none is left (or no spot can be found).
 */
function patchRoads(st) {
  const { file, nav, bake, ctx, rnd, eid } = st, ZM = 2048, dead = new Set();
  for (let iter = 0; iter < 40; iter++) {
    const pois = [...groundPieces(bake), ...file.placements.map(p => ({ x: p.x, z: p.z, r: p.radius || 2 })), ...file.placements.flatMap(p => (p.path || []).map(([x, z]) => ({ x, z, r: 8 }))),
      ...file.settlements.map(s => ({ x: s.x, z: s.z, r: s.r })), ...bake.filter(b => b.kind === 'event_site' || b.kind === 'camp_site').map(b => ({ x: b.x, z: b.z, r: b.data.r || 20 })),
      ...bake.filter(b => ['dungeon_door', 'crossing', 'bridge', 'landmark'].includes(b.kind)).map(b => ({ x: b.x, z: b.z, r: 8 }))];
    let worst = null;
    for (let z = 48; z < ZM - 48; z += 16) for (let x = 48; x < ZM - 48; x += 16) {
      const k = Math.round(z / nav.step) * nav.size + Math.round(x / nav.step), b = nav.bits[k];
      if (!(b & NAV.WALK) || !(b & NAV.ROAD) || (b & (NAV.DEEP | NAV.STEEP | NAV.BUILDING | NAV.TOWN | NAV.SHALLOW | NAV.SOLID))) continue;
      if (dead.has(k)) continue;
      if (file.settlements.some(s => Math.hypot(s.x - x, s.z - z) < s.r)) continue;
      let d = Infinity; for (const p of pois) { const q = Math.hypot(p.x - x, p.z - z) - p.r; if (q < d) d = q; if (d <= 50) break; }
      if (d > 50 && (!worst || d > worst.d)) worst = { x, z, d, k };
    }
    if (!worst) return;
    const wk = WAYSIDE[Math.floor(rnd() * WAYSIDE.length)];
    const spot = findSpot(ctx, rnd, 'wayside', wk.radius, { near: { x: worst.x, z: worst.z, min: wk.radius + 6, max: 45 }, tries: 1500, spread: 0, score: (x, z) => -Math.hypot(x - worst.x, z - worst.z) });
    if (!spot) { dead.add(worst.k); continue; }
    ctx.placed.push({ type: 'wayside', id: `${wk.id}_${eid}_rp${iter}`, kind: wk.id, name: wk.name, x: spot.x, z: spot.z, yaw: +(rnd() * 6.28).toFixed(2), radius: wk.radius, filler: true });
  }
}

/**
 * The province-wide files the living world needs (whole-province runs only):
 *   data/provinces/<prov>-routes.json  the travellers' routes (tools/content-living.mjs routesFor)
 *   data/quests/events.json            every event's `where` (words for the map/tracker) and its level capped by the ramp
 *   data/quests/marks/<prov>.json      a map mark for every quest's giver and every step (world metres)
 */
function livingFiles(states) {
  // WORLD metres, as stream A uses them (js/sim/content.js): world zone z<zx>_<zy> starts at zx*2048, zy*2048
  const ZM = 2048, byE = new Map(states.map(st => [st.eid, st]));
  const org = st => { const m = /^z(\d+)_(\d+)$/.exec(st.wid); return [+m[1] * ZM, +m[2] * ZM]; };
  const W = (st, x, z) => ({ x: Math.round(org(st)[0] + x), z: Math.round(org(st)[1] + z) });
  // ---- routes --------------------------------------------------------------------------------------------------
  const R = routesFor(states.map(st => ({ eid: st.eid, wid: st.wid, gx: org(st)[0] / ZM, gy: org(st)[1] / ZM, bake: st.bake })));
  writeFileSync(new URL(`data/provinces/${PROV}-routes.json`, ROOT), JSON.stringify({
    _doc: `Stream E (P19). Travellers' routes for ${SHEET.name}, WORLD metres as stream A uses them (world zone z<zx>_<zy> starts at zx*2048, zy*2048): stream B's roads stitched across the province, one route per pair of settlements joined by road with no third settlement on the way. pts every ~16 m along the road. kinds = data/provinces/travellers.json kinds whose minRouteM the route meets. Stream A walks traveller groups along these (travellers.json rules) and has them talk (data/names/chatter.json). Made by tools/place-vignettes.mjs; re-run after a re-bake.`,
    province: PROV, hub: (() => { const st = byE.get(SHEET.grid.start); return W(st, HUBW.x - st.zs.grid[0] * ZM, HUBW.z - st.zs.grid[1] * ZM); })(), towns: R.towns, unanchored: R.unanchored, routes: R.routes }, null, 1) + '\n');
  console.log(`routes: ${R.routes.length} (${Math.round(R.routes.reduce((a, r) => a + r.length, 0) / 1000)} km), unanchored towns: ${R.unanchored.join(', ') || 'none'}`);
  // ---- events: where + level -------------------------------------------------------------------------------------
  const evFile = new URL('data/quests/events.json', ROOT), evTxt = readFileSync(evFile, 'utf8'), EV = JSON.parse(evTxt);
  const siteOf = (st, e) => {
    if (typeof e.site === 'string') return st.bake.find(b => b.id === e.site) || st.bake.find(b => b.id === 'event_' + e.zone);
    if (e.site && e.site.settlement) { const t = st.ctx.settlements.find(q => q.name === e.site.settlement); return t ? { x: t.x, z: t.z } : null; }
    return st.bake.find(b => b.id === 'event_' + e.zone);
  };
  for (const e of [...EV.realm, ...EV.zone]) {
    const zonesOf = e.zones || [e.zone], spots = [];
    for (const z of zonesOf) { const st = byE.get(z); const s = st && siteOf(st, { ...e, zone: z }); if (s) spots.push({ st, s }); }
    if (!spots.length) { console.error(`event ${e.id}: no site`); continue; }
    const { st, s } = spots[0];
    const words = placeWords(st.ctx, s.x, s.z);
    e.where = spots.length > 1 ? `over ${spots.map(q => q.st.zs.name).join(', ')}` : `${st.zs.name}: ${words}`;
    e.map = spots.map(q => ({ zone: q.st.wid, ...W(q.st, q.s.x, q.s.z) }));
    if (e.kind === 'worldboss' || e.kind === 'flyover') continue;
    // P26: never more than 2 levels over what the ground around it holds (the first-hour raid on Torborhold was 4-5)
    e.levelAuthored ??= e.level;
    const lv = Math.min(e.levelAuthored, Math.max(1, Math.floor(LF.at(st.eid, s.x, s.z))) + 2);
    e.level = Math.max(lv, LF.span(st.eid)[0]);
    for (const w of e.waves || []) { w.levelAuthored ??= w.level; w.level = Math.max(1, Math.min(e.level, w.levelAuthored, w.levelAuthored - e.levelAuthored + e.level)); }
  }
  const ind = (evTxt.match(/\n( +)"/) || [, '  '])[1].length;
  writeFileSync(evFile, JSON.stringify(EV, null, ind) + '\n');
  // ---- quest marks ---------------------------------------------------------------------------------------------------
  const marks = {};
  const allP = states.flatMap(st => st.file.placements.map(p => ({ p, st })));
  const at = (st, x, z, r) => ({ zone: st.wid, ...W(st, x, z), r: Math.round(r) });
  for (const st of states) {
    const q = QUESTS[st.eid]; if (!q) continue;
    const npcAt = id => { const h = allP.find(({ p }) => p.type === 'npc' && p.id === id); return h ? at(h.st, h.p.x, h.p.z, 6) : null; };
    const vigAt = id => { const h = allP.find(({ p }) => p.type === 'vignette' && p.id === id); return h ? at(h.st, h.p.x, h.p.z, h.p.radius || 12) : null; };
    const siteAt = name => {
      for (const s2 of [st, ...states]) {
        const b = s2.bake.find(x => x.id === name || (x.data && x.data.name === name)) || s2.ctx.settlements.find(x => x.name === name);
        if (b) return at(s2, b.x, b.z, (b.data && b.data.r) || b.r || 30);
        const pl = s2.file.placements.find(x => x.name === name && x.radius != null);
        if (pl) return at(s2, pl.x, pl.z, pl.radius);
      }
      return null;
    };
    for (const qq of q.quests || []) {
      const giver = (qq.giver && npcAt(qq.giver)) || (qq.startsFrom && vigAt(qq.startsFrom.vignette)) || null;
      const ref = giver ? { x: giver.x, z: giver.z } : W(st, 1024, 1024);
      const steps = (qq.steps || []).map(sp => {
        switch (sp.kind) {
          case 'kill': case 'collect': {
            const type = sp.type || sp.from;
            const near = sp.near ? (vigAt(sp.near) || siteAt(sp.near)) : null;
            if (near) return { ...near, r: Math.max(near.r, 120) };
            const c = allP.filter(({ p }) => p.type === 'camp' && (p.monster === type || p.with === type)).map(h => { const w = W(h.st, h.p.x, h.p.z); return { h, d: Math.hypot(w.x - ref.x, w.z - ref.z), home: h.st === st }; })
              .sort((a, b) => (b.home - a.home) || (a.d - b.d))[0];
            return c ? at(c.h.st, c.h.p.x, c.h.p.z, 150) : null;
          }
          case 'killOne': case 'killRare': {
            const id2 = sp.encounter || sp.rare || (RARES[sp.zone] || [])[sp.slot ?? 0];
            const h = allP.find(({ p }) => p.type === 'rare' && p.id === id2);
            if (h) return at(h.st, h.p.x, h.p.z, 120);
            return siteAt(id2) || siteAt('event_' + st.eid);
          }
          case 'visit': case 'use': return (sp.vignette && vigAt(sp.vignette)) || (sp.site && siteAt(sp.site)) || null;
          case 'talk': case 'deliver': return (sp.npc && npcAt(sp.npc)) || null;
          case 'clear': { const d = st.bake.find(b => b.kind === 'dungeon_door'); return d ? at(st, d.x, d.z, 20) : null; }
          case 'escort': case 'reach': return (typeof sp.to === 'string' && (vigAt(sp.to) || siteAt(sp.to))) || null;
          default: return null;
        }
      });
      marks[qq.id] = { zone: st.wid, giver, steps };
    }
  }
  const missing = Object.entries(marks).flatMap(([id, m]) => m.steps.map((s2, i) => (s2 ? null : `${id}#${i}`)).filter(Boolean));
  writeFileSync(new URL(`data/quests/marks/${PROV}.json`, ROOT), JSON.stringify({
    _doc: 'Stream E (P17). A map mark for every story quest: the giver and each step, WORLD metres + the world zone id + a radius (an area for kill/collect steps: the nearest camp of that type to the giver). Shown by the tracker, the journal and the map next to each step\'s `where` text (data/quests/<zone>.json). null = nowhere fixed. Made by tools/place-vignettes.mjs from the placements; re-run after a re-bake.',
    missing, quests: marks }, null, 1) + '\n');
  if (missing.length) console.log(`quest marks: ${missing.length} step(s) with no fixed place: ${missing.join(', ')}`);
}

/** The sheet names its fort ("Torbor Watchtower", "the Abbey Wall"): the name picks the template it promises. */
function fortTemplateFor(name, archetype) {
  const n = String(name || '').toLowerCase();
  if (archetype === 'blight' || /warband/.test(n)) return 'warband_stockade';
  if (/toll/.test(n)) return 'toll_fort';
  if (/ruin|broken|old |mossy/.test(n)) return 'ruined_fort';
  if (/tower/.test(n)) return 'watchtower_garrison';
  if (/keep|battery|gatehouse|wall|bastion/.test(n)) return 'stone_keep';
  if (/stockade|redoubt|fort/.test(n)) return 'palisade_fort';
  return null;
}
function farmName(tpl, home, flavour) {
  const base = { arable: 'Farm', sheep: 'Sheepfold', pig: 'Piggery', orchard: 'Orchard', fishing_plot: 'Fishing Plot', mill: 'Mill' }[tpl] || 'Farm';
  const pre = flavour === 'burned' ? 'Burned ' : flavour === 'corrupted' ? 'Blighted ' : '';
  return home ? `${pre}${home.name} ${base}` : `${pre}${base}`;
}
function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); }

/** The M0 fixture zone (no nav.bin): vignettes from m1.json only, as M1 shipped. */
async function legacyTest() {
  const { findTown, findDoor } = await import('../js/sim/realm.js');
  const t = parseTerrain(readFileSync(new URL('data/zones/test/terrain.bin', ROOT)));
  const recipes = J('data/vignettes/m1.json').vignettes;
  const town = findTown(t), door = findDoor(t, town);
  const RULES = { townGap: 160, doorGap: 70, spacing: 140, margin: 60 };
  let s = 0x9e3779b9 ^ 4;
  const rnd = () => { s = (s + 0x6d2b79f5) >>> 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  const dry = (x, z) => t.walkable(x, z) && t.waterAt(x, z).depth <= 0;
  const fits = (v, x, z) => {
    if (x < t.bounds.minX + RULES.margin || z < t.bounds.minZ + RULES.margin || x > t.bounds.maxX - RULES.margin || z > t.bounds.maxZ - RULES.margin) return false;
    if (!v.tags.biomes.includes(t.biomes[t.biomeAt(x, z)].key)) return false;
    if (Math.hypot(x - town.x, z - town.z) < RULES.townGap || Math.hypot(x - door.x, z - door.z) < RULES.doorGap) return false;
    if (!dry(x, z)) return false;
    for (let a = 0; a < 8; a++) for (const f of [0.5, 1]) { const px = x + Math.cos(a * Math.PI / 4) * v.radius * f, pz = z + Math.sin(a * Math.PI / 4) * v.radius * f; if (!dry(px, pz) || t.slopeAt(px, pz) > 22) return false; }
    return true;
  };
  const out = [];
  for (const v of recipes) {
    let best = null;
    for (let tries = 0; tries < 6000 && !best; tries++) {
      const x = t.bounds.minX + rnd() * t.extent, z = t.bounds.minZ + rnd() * t.extent;
      if (!fits(v, x, z) || out.some(o => Math.hypot(o.x - x, o.z - z) < RULES.spacing)) continue;
      best = { x: Math.round(x), z: Math.round(z) };
    }
    if (!best) { console.error(`no spot for ${v.id}`); process.exitCode = 1; continue; }
    out.push({ id: v.id, type: 'vignette', name: v.name, x: best.x, z: best.z, yaw: +(rnd() * Math.PI * 2).toFixed(2), radius: v.radius, biome: t.biomes[t.biomeAt(best.x, best.z)].key, level: 1 });
  }
  const file = { _doc: `Stream E. Vignette placements for zone 'test' (absolute metres, zone coordinates). Made by tools/place-vignettes.mjs test from data/vignettes/m1.json against data/zones/test/terrain.bin (input ${t.meta.inputHash}); re-run after a re-bake. The recipe's relative coordinates are rotated by yaw around (x, z).`, zone: 'test', terrainHash: t.meta.inputHash, town: { x: town.x, z: town.z, r: town.r }, rules: RULES, placements: out };
  writeFileSync(new URL('data/vignettes/placements/test.json', ROOT), JSON.stringify(file, null, 2) + '\n');
  console.log(out.map(o => `${o.id} ${o.x},${o.z} ${o.biome}`).join('\n'));
}

/**
 * Play-test 2: a set piece of ours BOUND to one of stream B's ground pieces gives that piece our name (B's
 * data/world/set-pieces.json says "stream E may add or override pieces/lanes per zone with `setPieces` / `lanes` in
 * data/provinces/<sheet>-places.json (same id = E's wins)"): B's authored entry, renamed, and every lane whose signpost
 * names the old name. -> { setPieces?, lanes? }
 */
function nameAsks(eid, wid) {
  const W = existsSync(new URL('data/world/set-pieces.json', ROOT)) ? J('data/world/set-pieces.json') : { zones: {} };
  const zw = W.zones[wid]; if (!zw) return {};
  const setPieces = [], lanes = [], ren = new Map();
  for (const v of SETPIECES) {
    if (!v.bind || v.bind.zone !== eid || !v.bind.name) continue;
    const a = (zw.pieces || []).find(p => p.id === v.bind.piece);
    if (!a || a.name === v.name) continue;
    setPieces.push({ ...a, name: v.name, eSetpiece: v.id });      // (not `for`: B's clearings use that key)
    ren.set(a.name, v.name);
  }
  for (const l of zw.lanes || []) if ((l.to || []).some(t => ren.has(t))) lanes.push({ ...l, to: l.to.map(t => ren.get(t) || t) });
  return { ...(setPieces.length ? { setPieces } : {}), ...(lanes.length ? { lanes } : {}) };
}
