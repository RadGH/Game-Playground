// node --test prototypes/thousandvale/tests/E/living.test.js
// Stream E — the owner's play-test 1 items (agent/mmo/round-playtest1.md), checked on the REAL layout stream A builds
// from our files (loadProvinceContent + buildLayout), not only on our own files:
//   P14  no duplicate waystones ("two waystones both named Barrow Entrance a few feet apart")
//   P26  a level gradient round the start ("at level 2, destroyed by a level 4-5 creature; not enough low-level creatures")
//   P19  density + a living world ("massive empty areas … routes and people walking and talking")
//   P17  quests say what to do and where; a vignette's quest never asks you to kill the fight you just won
//   events have a place and a description the map can show ("The Collapse … no way to locate it")
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { loadProvinceContent } from '../../js/sim/content.js';
import { parseTerrain, parseNav, NAV } from '../../js/rules/terrain-read.js';
import { createProvinceTerrain } from '../../js/sim/province-terrain.js';
import { buildLayout } from '../../js/sim/realm.js';
import { vignetteContent } from '../../js/sim/vignettes.js';
import { levelField } from '../../tools/content-place.mjs';
import { questFiles } from '../../tools/content-lib.mjs';

const root = new URL('../../', import.meta.url);
const J = p => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const SHEET = J('data/provinces/torbor_downs.json');
const MAP = J('data/world/province-map.json').provinces.torbor_downs.map;
const EIDS = Object.keys(MAP);
const FILES = Object.fromEntries(EIDS.map(e => [e, J(`data/vignettes/placements/${MAP[e]}.json`)]));
const BAKE = Object.fromEntries(EIDS.map(e => [e, J(`data/zones/${MAP[e]}/placements.json`).placements]));
const EVENTS = J('data/quests/events.json');
const CURIOS = new Map(J('data/vignettes/curios.json').curios.map(c => [c.id, c]));
const WAYSIDE = new Set(J('data/vignettes/wayside.json').kinds.map(k => k.id));
const TRAV = J('data/provinces/travellers.json');
const CHAT = J('data/names/chatter.json');
const ROUTES = J('data/provinces/torbor_downs-routes.json');
const MARKS = J('data/quests/marks/torbor_downs.json');
const VIGS = new Map(['m1', 'm2', 'm2b'].flatMap(f => J(`data/vignettes/${f}.json`).vignettes).map(v => [v.id, v]));
const ZM = 2048;
const se = SHEET.grid.start, hubP = BAKE[se].find(p => p.kind === 'settlement' && p.data.hub);
// two frames: the SHEET grid (the placer's level field) and WORLD metres (stream A: world zone z<zx>_<zy> at zx*2048, zy*2048)
const LF = levelField({ sheet: SHEET, hub: { x: SHEET.zones[se].grid[0] * ZM + hubP.x, z: SHEET.zones[se].grid[1] * ZM + hubP.z } });
const ORG = eid => { const m = /^z(\d+)_(\d+)$/.exec(MAP[eid]); return [+m[1] * ZM, +m[2] * ZM]; };
const HUB = { x: ORG(se)[0] + hubP.x, z: ORG(se)[1] + hubP.z };

// stream A's real layout of the province, from our files
const C = await loadProvinceContent(async f => JSON.parse(readFileSync(new URL(f, root), 'utf8')), async f => readFileSync(new URL(f, root)), 'torbor_downs', { parseTerrain, parseNav, createProvinceTerrain });
const L = buildLayout({ key: 'torbor_downs', name: C.name, terrain: C.terrain, zones: C.zones, encounterInfo: C.encounterInfo, vignetteContent, starter: C.starter });

test('P14: the layout A builds has no duplicate waystones — none within 60 m of another, no name twice within 1 km', () => {
  const ws = L.waystones, bad = [];
  for (let i = 0; i < ws.length; i++) for (let j = i + 1; j < ws.length; j++) {
    const d = Math.hypot(ws[i].x - ws[j].x, ws[i].z - ws[j].z);
    if (d < 60) bad.push(`${ws[i].name} / ${ws[j].name}: ${d.toFixed(0)} m`);
    else if (ws[i].name === ws[j].name && d < 1000) bad.push(`two "${ws[i].name}" ${d.toFixed(0)} m apart`);
  }
  assert.deepEqual(bad, []);
  // every dungeon door has exactly one stone by it, every hub town exactly one inside it
  L.doors.forEach((d, i) => { if (d.kind !== 'cave') assert.equal(ws.filter(w => Math.hypot(w.x - d.x, w.z - d.z) < 40).length, 1, `door ${i} (${d.name})`); });
  L.towns.forEach((t, i) => assert.equal(ws.filter(w => w.town === i).length, 1, `town ${t.name}`));
});

test('P14: our door waystone stands 6-36 m from the door and carries the zone\'s dungeon name, not "Barrow entrance"', () => {
  for (const e of EIDS) {
    const door = BAKE[e].find(p => p.kind === 'dungeon_door'), w = FILES[e].placements.filter(p => p.type === 'waystone' && p.door);
    assert.equal(w.length, 1, e);
    const d = Math.hypot(w[0].x - door.x, w[0].z - door.z);
    assert.ok(d >= 6 && d <= 36, `${e}: ${d.toFixed(1)} m`);
    assert.equal(w[0].name, SHEET.zones[e].dungeon.name, e);
  }
});

test('P26: round the start nothing ordinary is above level 3 within 900 m, nothing above 4 within 1.5 km, and there is plenty at 1-2', () => {
  const bad = [], low = [];
  for (const c of L.camps) {
    const d = Math.hypot(c.x - HUB.x, c.z - HUB.z), named = c.rank === 'rare' || c.rank === 'elite' || c.rank === 'boss' || c.encounter;
    if (named) continue;                      // named fights: the next test
    if (!c.place) continue;    // stream A's own door guard, and vignette monsters (A applies levelBase/levelCap on request): next test
    if (d < 900 && c.level > 3) bad.push(`${c.type} L${c.level} at ${d.toFixed(0)} m (${c.place || c.vignette})`);
    if (d < 1500 && c.level > 4) bad.push(`${c.type} L${c.level} at ${d.toFixed(0)} m (${c.place || c.vignette})`);
    if (d < 900 && c.level <= 2) low.push(c);
  }
  assert.deepEqual(bad, []);
  assert.ok(low.length >= 30, `only ${low.length} groups of level 1-2 within 900 m of ${hubP.data.name}`);
  assert.ok(new Set(low.map(c => c.type)).size >= 3, 'more than one kind of thing to fight at level 1-2');
});

// Hobb Gallowsby's camp level is stream A's ENCOUNTER_PLACES (5); E asked A to read the encounter file's `level` (4)
test('P26: named fights and vignette monsters near the start stay near the ramp (the elite A places; vignette levelBase/levelCap A applies)', { todo: 'A: encounter `level` in zoneEncounterCamps + vignette levelBase/levelCap/countCap + farm pest countCap (docs/requests.md, E, play-test 1)' }, () => {
  const bad = [];
  for (const c of L.camps) {
    const d = Math.hypot(c.x - HUB.x, c.z - HUB.z);
    if (c.place && /^farm_/.test(c.place) && !c.rank && ((d < 400 && c.count > 2) || (d < 900 && c.count > 3))) bad.push(`${c.type} x${c.count} at ${d.toFixed(0)} m (pests of ${c.place})`);
    if (c.vignette && !c.place) { if ((d < 900 && c.level > 3) || (d < 1500 && c.level > 4)) bad.push(`${c.type} L${c.level} at ${d.toFixed(0)} m (vignette ${c.vignette})`); continue; }
    if (!(c.rank === 'rare' || c.rank === 'elite' || c.rank === 'boss' || c.encounter)) continue;
    if (d < 900 && c.level > Math.floor(1 + d / 550) + 2) bad.push(`${c.name || c.type} L${c.level} at ${d.toFixed(0)} m`);
  }
  assert.deepEqual(bad, []);
});

test('P26 (stream C\'s starting-area rules): solos and pairs within 400 m of the start, trios at most to 900 m, no crag hyena / frost stalker / brigand captain where the ramp is under 4', () => {
  const HEAVY = new Set(['crag_hyena', 'frost_stalker', 'brigand_captain']), bad = [];
  for (const c of L.camps) {
    if (!c.place || c.rank || /^farm_/.test(c.place)) continue;   // farm pests: A applies the farm's countCap (next-but-one test)
    const d = Math.hypot(c.x - HUB.x, c.z - HUB.z);
    if (d < 400 && c.count > 2) bad.push(`${c.type} x${c.count} at ${d.toFixed(0)} m (${c.place})`);
    if (d < 900 && c.count > 3) bad.push(`${c.type} x${c.count} at ${d.toFixed(0)} m (${c.place})`);
  }
  for (const e of EIDS) for (const p of FILES[e].placements.filter(q => q.type === 'camp')) {
    if (HEAVY.has(p.monster) && LF.at(e, p.x, p.z) < 4) bad.push(`${e} ${p.id}: ${p.monster} where the ramp is ${LF.at(e, p.x, p.z).toFixed(1)}`);
    const d = LF.dist(e, p.x, p.z);
    if (d < 400 && p.count[1] > 2) bad.push(`${e} ${p.id}: count ${p.count} at ${d.toFixed(0)} m`);
    if (d < 900 && (p.count[1] > 3 || p.with)) bad.push(`${e} ${p.id}: count ${p.count}${p.with ? ' + ' + p.with : ''} at ${d.toFixed(0)} m`);
  }
  assert.deepEqual(bad, []);
});

test('P26: every camp we place sits at the ramp\'s level for its spot, inside its zone\'s band; the weaker types sit nearer town', () => {
  const bad = [];
  for (const e of EIDS) {
    const band = SHEET.zones[e].band;
    for (const p of FILES[e].placements.filter(q => q.type === 'camp')) {
      const want = Math.max(1, Math.min(band[1], Math.floor(LF.at(e, p.x, p.z))));
      if (p.level[0] !== want) bad.push(`${e} ${p.id}: L${p.level[0]} where the ramp says ${want}`);
      if (p.level[0] < band[0] || p.level[1] > band[1]) bad.push(`${e} ${p.id}: ${p.level} outside band ${band}`);
    }
    assert.deepEqual(FILES[e].levels, LF.span(e), `${e} file levels`);
  }
  assert.deepEqual(bad, []);
  // the start zone: hounds (sheet 1-3) average nearer town than wisps (sheet 3-6)
  const mean = t => { const c = FILES[se].placements.filter(p => p.type === 'camp' && p.monster === t && !p.stray && !p.roam); return c.reduce((a, p) => a + Math.hypot(p.x - hubP.x, p.z - hubP.z), 0) / c.length; };
  assert.ok(mean('moor_hound') < mean('marsh_wisp'), `hounds ${mean('moor_hound').toFixed(0)} m vs wisps ${mean('marsh_wisp').toFixed(0)} m`);
});

test('P26: zone events and town raids are never more than 2 levels over the ground round them', () => {
  for (const e of [...EVENTS.zone, ...EVENTS.realm]) {
    if (e.kind === 'worldboss' || e.kind === 'flyover') continue;
    const m = e.map[0], eid = EIDS.find(k => MAP[k] === m.zone);
    const cap = Math.max(SHEET.zones[eid].band[0], Math.floor(LF.at(eid, m.x - ORG(eid)[0], m.z - ORG(eid)[1])) + 2);
    assert.ok(e.level <= cap, `${e.id}: level ${e.level} over ${cap}`);
    for (const w of e.waves || []) assert.ok(w.level <= e.level, `${e.id} wave ${w.type}: ${w.level} over the event's ${e.level}`);
  }
  assert.ok(EVENTS.realm.find(e => e.id === 'siege_torborhold').level <= 3, 'the raid on the start town');
});

test('P19: open ground and roads are covered — measured independently: >= 95% of reachable open ground within 50 m of something', () => {
  const bad = [];
  let allRoad = 0, allRok = 0;
  for (const e of EIDS) {
    const f = FILES[e], nav = parseNav(readFileSync(new URL(`data/zones/${MAP[e]}/nav.bin`, root)));
    const pois = [...f.placements.map(p => ({ x: p.x, z: p.z, r: p.radius || 2 })), ...f.placements.flatMap(p => (p.path || []).map(([x, z]) => ({ x, z, r: 8 }))),
      ...f.settlements.map(s => ({ x: s.x, z: s.z, r: s.r })), ...BAKE[e].filter(b => b.kind === 'event_site' || b.kind === 'camp_site').map(b => ({ x: b.x, z: b.z, r: b.data.r || 20 })),
      ...BAKE[e].filter(b => ['dungeon_door', 'crossing', 'bridge', 'landmark'].includes(b.kind)).map(b => ({ x: b.x, z: b.z, r: 8 }))];
    const grid = new Map(), G = 64;
    for (const p of pois) { const k = `${Math.floor(p.x / G)},${Math.floor(p.z / G)}`; (grid.get(k) || grid.set(k, []).get(k)).push(p); }
    const nearest = (x, z) => { let b = Infinity; for (let j = Math.floor(z / G) - 2; j <= Math.floor(z / G) + 2; j++) for (let i = Math.floor(x / G) - 2; i <= Math.floor(x / G) + 2; i++) for (const p of grid.get(`${i},${j}`) || []) b = Math.min(b, Math.hypot(p.x - x, p.z - z) - p.r); return b; };
    let open = 0, ok = 0, road = 0, rok = 0;
    for (let z = 48; z < ZM - 48; z += 16) for (let x = 48; x < ZM - 48; x += 16) {
      const k = Math.round(z / nav.step) * nav.size + Math.round(x / nav.step), b = nav.bits[k];
      if (!(b & NAV.WALK) || (b & (NAV.DEEP | NAV.STEEP | NAV.BUILDING | NAV.TOWN | NAV.SHALLOW | NAV.SOLID))) continue;
      if (f.settlements.some(s => Math.hypot(s.x - x, s.z - z) < s.r)) continue;
      const d = nearest(x, z);
      if (b & NAV.ROAD) { road++; if (d <= 50) rok++; } else { open++; if (d <= 50) ok++; }
    }
    if (ok / open < 0.95) bad.push(`${e}: open ${(ok / open * 100).toFixed(1)}%`);
    // roads: a zone may hold only a few dozen road samples (a footpath, a bridge on a cliff), so 90% per zone, 95% over all
    if (road && rok / road < 0.9) bad.push(`${e}: road ${(rok / road * 100).toFixed(1)}% of ${road}`);
    allRoad += road; allRok += rok;
  }
  if (allRok / allRoad < 0.95) bad.push(`province roads ${(allRok / allRoad * 100).toFixed(1)}%`);
  assert.deepEqual(bad, []);
});

test('P19: every zone has things to fight, roaming packs, curios to use and people at work; every record resolves', () => {
  const pools = new Set(Object.keys(CHAT.pools));
  for (const e of EIDS) {
    const pl = FILES[e].placements, n = f => pl.filter(f).length;
    assert.ok(n(p => p.type === 'camp') >= 100, `${e}: camps ${n(p => p.type === 'camp')}`);
    assert.ok(n(p => p.roam) >= 10, `${e}: roaming packs ${n(p => p.roam)}`);
    assert.ok(n(p => p.type === 'curio') >= 120, `${e}: curios ${n(p => p.type === 'curio')}`);
    assert.ok(n(p => p.type === 'folk') >= 10, `${e}: folk ${n(p => p.type === 'folk')}`);
    for (const p of pl) {
      if (p.type === 'curio') assert.ok(CURIOS.has(p.recipe), `${e} ${p.id}: recipe ${p.recipe}`);
      if (p.type === 'wayside') assert.ok(WAYSIDE.has(p.kind), `${e} ${p.id}: kind ${p.kind}`);
      if (p.type === 'folk') { assert.ok(TRAV.folk[p.role], `${e} ${p.id}: role ${p.role}`); for (const c of p.chatter) assert.ok(pools.has(c), `${e} ${p.id}: pool ${c}`); }
      if (p.type === 'camp') assert.ok((SHEET.zones[e].camps || []).some(c => c.type === p.monster), `${e} ${p.id}: ${p.monster} is not in the zone's mix`);
    }
    // no two of one curio within 350 m (variety on the walk)
    const cu = pl.filter(p => p.type === 'curio');
    for (let i = 0; i < cu.length; i++) for (let j = i + 1; j < cu.length; j++) if (cu[i].recipe === cu[j].recipe) assert.ok(Math.hypot(cu[i].x - cu[j].x, cu[i].z - cu[j].z) >= 350, `${e}: two ${cu[i].recipe}`);
  }
  // a stray never sits on top of a town: 70 m from any settlement edge
  for (const e of EIDS) for (const p of FILES[e].placements.filter(q => q.stray || q.roam)) for (const s of FILES[e].settlements) assert.ok(Math.hypot(p.x - s.x, p.z - s.z) - s.r >= 70 - 0.5, `${e} ${p.id} by ${s.name}`);
});

test('P19: travellers have routes along the real roads between neighbouring towns, kinds and lines that resolve', () => {
  assert.ok(ROUTES.routes.length >= 30, `${ROUTES.routes.length} routes`);
  const kinds = new Set(Object.keys(TRAV.kinds)), pools = new Set(Object.keys(CHAT.pools));
  for (const r of ROUTES.routes) {
    for (let i = 1; i < r.pts.length; i++) assert.ok(Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]) <= 40, `${r.id}: gap at ${i}`);
    for (const [end, t] of [[r.pts[0], r.from], [r.pts[r.pts.length - 1], r.to]]) assert.ok(Math.hypot(end[0] - t.x, end[1] - t.z) <= t.r + 60, `${r.id}: end far from ${t.name}`);
    for (const k of r.kinds) assert.ok(kinds.has(k), `${r.id}: kind ${k}`);
    assert.ok(Math.abs(r.pts.slice(1).reduce((a, p, i) => a + Math.hypot(p[0] - r.pts[i][0], p[1] - r.pts[i][1]), 0) - r.length) < r.length * 0.05 + 20, `${r.id}: length`);
  }
  // the start town is on the network
  assert.ok(ROUTES.routes.some(r => r.from.name === hubP.data.name || r.to.name === hubP.data.name), 'routes from the start town');
  for (const [id, k] of Object.entries(TRAV.kinds)) for (const c of k.chatter) assert.ok(pools.has(c), `${id}: pool ${c}`);
  for (const [id, f] of Object.entries(TRAV.folk)) for (const c of f.chatter) assert.ok(pools.has(c), `folk ${id}: pool ${c}`);
  // every token a line uses is declared, and enough lines need no token at all
  const tokens = new Set(Object.keys(CHAT.tokens));
  for (const [id, lines] of Object.entries(CHAT.pools)) {
    for (const l of lines) for (const m of l.matchAll(/\{(\w+)\}/g)) assert.ok(tokens.has(m[1]), `${id}: {${m[1]}}`);
    if (!/^(recent|worldboss|road)\./.test(id)) assert.ok(lines.some(l => !/\{/.test(l)), `${id}: every line needs a token`);
  }
  for (const a of Object.keys(J('data/provinces/archetypes.json').archetypes)) assert.ok(pools.has('archetype.' + a), `archetype.${a}`);
});

test('events: every event has a place (world metres in its zone) and words + a description the map can show', () => {
  for (const e of [...EVENTS.zone, ...EVENTS.realm]) {
    assert.ok(typeof e.where === 'string' && e.where.length > 8, `${e.id}: where`);
    assert.ok(typeof e.blurb === 'string' && e.blurb.length > 20, `${e.id}: blurb`);
    assert.ok(Array.isArray(e.map) && e.map.length >= 1, `${e.id}: map`);
    for (const m of e.map) {
      const eid = EIDS.find(k => MAP[k] === m.zone), [ox, oz] = ORG(eid);
      assert.ok(m.x >= ox && m.x < ox + ZM && m.z >= oz && m.z < oz + ZM, `${e.id}: ${m.x},${m.z} outside ${m.zone}`);
    }
    if (!e.zones) assert.ok(e.where.startsWith(SHEET.zones[e.zone].name), `${e.id}: where names the zone`);
  }
  const collapse = EVENTS.zone.find(e => e.name === 'The Collapse');
  assert.ok(collapse && /of /.test(collapse.where), `The Collapse: ${collapse && collapse.where}`);
});

test('P17: every quest step says what to do and where, every step has a map mark, and the tracker can show the giver', () => {
  const bad = [];
  for (const q of questFiles()) for (const qq of q.quests || []) {
    const m = MARKS.quests[qq.id];
    if (!m) { bad.push(`${qq.id}: no marks`); continue; }
    if (!m.giver) bad.push(`${qq.id}: no giver mark`);
    qq.steps.forEach((s, i) => {
      if (!s.text || s.text.length < 6) bad.push(`${qq.id}#${i}: text`);
      if (!s.where || s.where.length < 6) bad.push(`${qq.id}#${i}: where`);
      if (!m.steps[i]) bad.push(`${qq.id}#${i}: no mark`);
    });
  }
  assert.deepEqual(bad, []);
  assert.deepEqual(MARKS.missing, []);
});

test('P17: a quest a vignette hands out never asks you to kill the vignette\'s own monsters (you won that fight before you were asked)', () => {
  const bad = [];
  for (const q of questFiles()) for (const qq of q.quests || []) {
    const v = qq.startsFrom && VIGS.get(qq.startsFrom.vignette);
    if (!v) continue;
    const own = new Set((v.monsters || []).map(m => m.type));
    qq.steps.forEach((s, i) => { if (s.kind === 'kill' && own.has(s.type)) bad.push(`${qq.id}#${i}: kill ${s.type} — the ${v.name}'s own fight`); });
  }
  assert.deepEqual(bad, []);
  const cart = questFiles().flatMap(q => q.quests).find(q => q.id === 'the_carter_s_crates');
  assert.equal(cart.steps[0].kind, 'collect');
});

test('the living-world files carry no banned words, not even inside one (ember, veil, muster)', () => {
  for (const f of ['data/vignettes/curios.json', 'data/vignettes/wayside.json', 'data/provinces/travellers.json', 'data/names/chatter.json', 'data/quests/events.json', 'data/provinces/torbor_downs-routes.json']) {
    // shared Farhold monster ids (veil_spider) are ids, not names we wrote
    const t = readFileSync(new URL(f, root), 'utf8').replace(/"(type|with|boss|encounter|monster|id|site)": "[^"]*"/g, '');
    for (const w of ['ember', 'veil', 'muster']) assert.ok(!new RegExp(w, 'i').test(t), `${f}: ${w}`);
  }
  assert.ok(existsSync(new URL('data/quests/marks/torbor_downs.json', root)));
});
