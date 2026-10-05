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
import { parseTerrain, parseNav } from '../js/rules/terrain-read.js';
import { J, ROOT, allVignettes, questFiles, provinceMap } from './content-lib.mjs';
import { POINT_TYPES, zoneContext, provinceComponents, discProblem, findSpot, findPoint, openPoint, walkLine, hintFrom, hintScore, rngFor, KIND_RULES, settlementEdge } from './content-place.mjs';

const PROV = 'torbor_downs';
const arg = process.argv[2] || null;
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
/** names imposed on stream B's World Forge places that the M1 content already uses */
const IMPOSE_EXTRA = { test: { mipider_ford: 'Fitockpi Ford' } };

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
for (const [eid, wid] of zones) bad += placeZone(eid, wid);
places._doc = `Stream E. Settlement names for ${SHEET.name} on stream B's bake (tools/place-vignettes.mjs). Per E zone: \`world\` zone id; \`rename\` = B settlement/crossing id -> the name the sheet and quests use (B: impose at bake time, like Torborhold); \`asks\` = a settlement the sheet needs where the world has none (B: place a planned settlement of that kind and radius at x, z — zone metres — with that name; E's placements already keep clear of the circle). After B re-bakes, E re-runs the placer and asks that now exist drop out.`;
places.province = PROV;
writeFileSync(placesFile, JSON.stringify(places, null, 2) + '\n');
if (bad) { console.error(`${bad} problem(s)`); process.exitCode = 1; }

function placeZone(eid, wid) {
  const dir = `data/zones/${wid}/`;
  if (!existsSync(new URL(dir + 'nav.bin', ROOT))) { console.error(`${wid}: not baked`); return 1; }
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
  for (const w of want) {           // a B settlement already carrying the name (Torborhold, or an ask B has baked) keeps it
    const k = free.findIndex(s => s.data.name === w.name);
    if (k >= 0) { w.at = free[k]; free.splice(k, 1); }
  }
  for (const w of want) if (!w.at && free.length) { w.at = free.shift(); rename[w.at.id] = w.name; }
  const start = bSettle[0] ? { x: bSettle[0].x, z: bSettle[0].z } : null;
  const asks = [];
  const cell = { gx: zs.grid[0], gy: zs.grid[1] };
  let ctx = zoneContext({ terrain, nav, placements: bake, start, province: PCOMP, cell });
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
  ctx = zoneContext({ terrain, nav, placements: bake, start: town0, reserve: asks.map(a => ({ ...a })), province: PCOMP, cell });
  for (const s of ctx.settlements) { if (rename[s.id]) s.name = rename[s.id]; }
  places.zones[eid] = { world: wid, rename, asks };

  const P = ctx.placed, features = [];
  // point-like things get radius 1 so stream B's bake keeps scatter off them (B reads `radius || 12`)
  const push = rec => { if (POINT_TYPES.has(rec.type)) rec.radius = 1; P.push(rec); return rec; };
  const named = () => [
    ...ctx.settlements.map(s => ({ name: s.name, x: s.x, z: s.z, r: s.r, kind: 'settlement', id: s.id || s.name })),
    ...bake.filter(p => ['crossing', 'landmark', 'lair', 'pass'].includes(p.kind)).map(p => ({ name: rename[p.id] || p.data.name, x: p.x, z: p.z, r: 15, kind: p.kind, id: p.id })),
    ...P.filter(p => p.name && p.radius != null && !POINT_TYPES.has(p.type)).map(p => ({ name: p.name, x: p.x, z: p.z, r: p.radius, kind: p.type, id: p.id })),
  ];
  const nearOf = (hint, min, max) => hint.near ? { x: hint.near.x, z: hint.near.z, min: (hint.near.r || 0) + min, max: (hint.near.r || 0) + max } : null;
  const pickW = (weights) => { const e = Object.entries(weights || {}); let t = e.reduce((s, [, w]) => s + w, 0) * rnd(); for (const [k, w] of e) { t -= w; if (t <= 0) return k; } return e[0] && e[0][0]; };
  const byArch = SITES.byArchetype[zs.archetype];
  const extras = ARCH.archetypes[zs.archetype].extras || {};
  const count = v => Array.isArray(v) ? v[0] + Math.floor(rnd() * (v[1] - v[0] + 1)) : (v || 0);

  // ---- forts ---------------------------------------------------------------------------------------------
  const fortN = Math.max(1, extras.forts || 1);
  for (let i = 0; i < fortN; i++) {
    const tpl = (i === 0 && fortTemplateFor(zs.fort, zs.archetype)) || pickW(byArch.forts);
    const T = SITES.forts[tpl];
    const name = i === 0 ? zs.fort : `${zs.town} Outpost`;
    const roadPref = (x, z) => { const d = ctx.roadDist(x, z); return d < 140 ? 140 - d : 0; };
    const spot = findSpot(ctx, rnd, 'fort', T.radius, { score: roadPref, spread: 1 });
    if (!spot) { problems.push(`fort ${name}`); continue; }
    push({ type: 'fort', id: `fort_${eid}_${i}`, name, template: tpl, friendly: !!T.friendly, x: spot.x, z: spot.z, yaw: faceRoad(spot), radius: T.radius, level: lo });
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
        push({ type: 'farm', id: `farm_${eid}_${i}`, name: farmName(tpl, home, flavour), template: tpl, flavour, settlement: home ? home.name : null, x: spot.x, z: spot.z, yaw: faceRoad(spot), radius: T.radius, level: lo });
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
    push({ type: 'cave', id: `cave_${eid}_${i}`, name: T.name, template: tpl, plan: { ...T.plan, level: lo + 1 }, x: spot.x, z: spot.z, yaw: faceDownhill(spot), radius: 10, level: lo + 1 });
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
    push({ type: 'vignette', id, name: v.name, x: spot.x, z: spot.z, yaw: +(rnd() * Math.PI * 2).toFixed(2), radius: v.radius, biome: terrain.biomes[terrain.biomeAt(spot.x, spot.z)].key, biomeFits: biomeOk(spot.x, spot.z), level: 1 });
  }
  // ---- wilds camps (the sheet's camp mix, each twice) ----------------------------------------------------
  (zs.camps || []).forEach((c, ci) => {
    for (let n = 0; n < 2; n++) {
      const hint = hintFrom(c.where, named());
      const near = nearOf(hint, 60, 320);
      const spot = findSpot(ctx, rnd, 'camp', 10, { near, tries: 1500, spread: 1, score: hintScore(ctx, hint) }) || (near ? findSpot(ctx, rnd, 'camp', 10, { spread: 1, score: hintScore(ctx, hint) }) : null);
      if (!spot) { problems.push(`camp ${c.type}`); continue; }
      push({ type: 'camp', id: `camp_${eid}_${ci}_${n}`, monster: c.type, with: c.with || null, level: c.level, count: c.count, x: spot.x, z: spot.z, yaw: 0, radius: 10 });
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
      push({ type: 'rare', id: rid, slot, name: enc.name || rid, x: spot.x, z: spot.z, yaw: 0, radius: 15, path, respawnMin: [20, 60], level: zs.band[1] });
      return;
    }
    problems.push(`rare ${rid}`);
  });
  // ---- waystones -----------------------------------------------------------------------------------------
  const ws = [];
  for (const s of ctx.settlements) {
    const p = findPoint(ctx, rnd, { x: s.x, z: s.z, min: s.r + 8, max: s.r + 30 }, { clearance: 2, keepFrom: ws, minSep: 20, prefer: (x, z) => -Math.abs(ctx.roadDist(x, z) - 8) });
    if (p) ws.push(push({ type: 'waystone', id: `ws_${wid}_${slug(s.name)}`, name: s.name, x: p.x, z: p.z, yaw: 0, settlement: s.name }));
    else problems.push(`waystone ${s.name}`);
  }
  const door = bake.find(p => p.kind === 'dungeon_door');
  if (door) { const p = findPoint(ctx, rnd, { x: door.x, z: door.z, min: 42, max: 60 }, { clearance: 2 }) || findPoint(ctx, rnd, { x: door.x, z: door.z, min: 42, max: 90 }, { clearance: 1, avoidRoad: false }); if (p) push({ type: 'waystone', id: `ws_${wid}_door`, name: door.data?.name || 'Dungeon entrance', x: p.x, z: p.z, yaw: 0, door: door.id }); else problems.push('waystone door'); }
  const wb = SHEET.worldBoss && SHEET.worldBoss.zone === eid ? bake.find(p => p.id === SHEET.worldBoss.id) : null;
  if (wb) { const p = findPoint(ctx, rnd, { x: wb.x, z: wb.z, min: (wb.data?.r || 100) + 20, max: (wb.data?.r || 100) + 60 }, { clearance: 2 }); if (p) push({ type: 'waystone', id: `ws_${wid}_worldboss`, name: 'Grimtallow\'s Hollow', x: p.x, z: p.z, yaw: 0, event: wb.id }); else problems.push('waystone world boss'); }
  // ---- quest NPCs ----------------------------------------------------------------------------------------
  const q = QUESTS[eid];
  const npcKeep = new Map();
  for (const [nid, n] of Object.entries((q && q.npcs) || {})) {
    const p = npcSpot(n.at, npcKeep);
    if (!p) { problems.push(`npc ${nid} at ${n.at}`); continue; }
    push({ type: 'npc', id: nid, name: n.name, role: n.role, at: n.at, x: p.x, z: p.z, yaw: +(rnd() * 6.28).toFixed(2) });
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
  writeFileSync(new URL(`data/vignettes/placements/${wid}.json`, ROOT), JSON.stringify(file, null, 1) + '\n');
  const counts = {}; P.forEach(p => counts[p.type] = (counts[p.type] || 0) + 1);
  console.log(`${wid} ${eid.padEnd(18)} ${JSON.stringify(counts)} asks ${asks.length}${problems.length ? ' PROBLEMS ' + problems.join('; ') : ''}`);
  return problems.length;

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
  function npcSpot(at, keep) {
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
    if (/a ford/.test(need) && hint.near && hint.near.kind === 'crossing') rec = { x: hint.near.x, z: hint.near.z, radius: null, how: 'at the crossing' };
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
    if (/cliff|slope|hill/.test(need)) return ctx.steepDist(rec.x, rec.z) < reach;
    return true;
  }
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
