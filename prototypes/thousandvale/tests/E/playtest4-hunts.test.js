// Play-test 4 S14 (streams E + A): "kill-quest areas (fen croakers) point at an area that may not have them — show
// where they spawn when in the right area". Checked against the camps the SERVER spawns (server/load.mjs, the same
// layout the province runs), not against the placement files' guesses:
//  * every kill / collect step of every quest file points at an area holding that monster, and the circle in which
//    its kills count holds at least min(count, 4) of them (tools/content-hunts.mjs adds copies where it did not);
//  * every step carries `areas` (each one really holds the type) — what the map draws;
//  * the published files are current (hunts.json = the live areas; E's marks = the runtime's markers);
//  * radiant kill jobs point at real areas too; the quest log the client gets carries the areas.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { loadLayouts } from '../../server/load.mjs';
import { createQuestBook, NEAR_M } from '../../js/sim/quests.js';
import { huntAreas, pickArea, areaHas } from '../../js/sim/hunts.js';
import { headsIn, regionOf, stepType, NEED_CAP } from '../../tools/content-hunts.mjs';
import { realServer, joinReal, rec, run } from '../A/pt1-helpers.js';

const root = new URL('../../', import.meta.url);
const readJ = f => JSON.parse(readFileSync(new URL(f, root), 'utf8'));
const OTHER_ZONES = new Set(Object.entries(readJ('data/world/province-map.json').provinces).filter(([k]) => k !== 'torbor_downs').flatMap(([, p]) => Object.keys(p.map || {})));   // Expansion 1: another province's zones (tests/C/vharlen-content.test.js checks Vharlen's)
const q = console.log; console.log = () => {};
const L = (await loadLayouts(['torbor_downs'])).layouts[0];
console.log = q;
const book = createQuestBook({ layout: L, zones: L.zones, rares: L.rares, jobs: L.jobs, rng: () => 0.3 });
const live = huntAreas(L.camps, L.zoneOf);

test('S14: every kill / collect step in the quest files is loaded, points at its monster, and its circle holds enough', () => {
  const ids = [];
  for (const f of readdirSync(new URL('data/quests/', root))) {
    if (!f.endsWith('.json') || f === 'test.json') continue;
    const d = readJ('data/quests/' + f);
    if (d && OTHER_ZONES.has(d.zone)) continue;      // another province's quests (this layout is Torbor's; tests/C/vharlen-content.test.js)
    for (const qq of (d && Array.isArray(d.quests) ? d.quests : [])) if ((qq.steps || []).some(st => st.kind === 'kill' || st.kind === 'collect')) ids.push(qq.id);
  }
  assert.ok(ids.length >= 90, 'kill quests found: ' + ids.length);
  const bad = [];
  let steps = 0;
  for (const id of ids) {
    const def = book.defs.get(id);
    if (!def) { bad.push(id + ': not loaded'); continue; }
    def.steps.forEach((st, i) => {
      const type = stepType(st); if (!type) return;
      steps++;
      if (!st.at) { bad.push(`${id}#${i}: no marker`); return; }
      if (!headsIn(L.camps, type, st.at)) bad.push(`${id}#${i}: marker has no ${type}`);
      const need = Math.min(NEED_CAP, st.count || 1), have = headsIn(L.camps, type, regionOf(st));
      if (have < need) bad.push(`${id}#${i}: ${have}/${need} ${type} where it counts`);
      if (!st.areas || !st.areas.length) bad.push(`${id}#${i}: no areas`);
      for (const a of st.areas || []) if (!L.camps.some(c => c.type === type && areaHas(a, c))) bad.push(`${id}#${i}: an area without ${type}`);
      if (st.nearAt) for (const a of st.areas || []) assert.ok(Math.hypot(a.x - st.nearAt.x, a.z - st.nearAt.z) <= a.r + (st.nearAt.r || 12) + NEAR_M, `${id}#${i}: a near step only shows areas where kills count`);
    });
  }
  console.log(`# ${steps} kill/collect steps over ${ids.length} quests`);
  assert.deepEqual(bad, []);
});

test('S14: the fen croaker quests point at fen croakers (the owner\'s case)', () => {
  const croak = [...book.defs.values()].flatMap(d => d.steps.filter(st => stepType(st) === 'fen_croaker').map(st => ({ d, st })));
  assert.ok(croak.length >= 5);
  for (const { d, st } of croak) assert.ok(headsIn(L.camps, 'fen_croaker', regionOf(st)) >= Math.min(4, st.count), d.id);
  // "in the reeds at Tench Pool": the place the text names wins over the camp nearest the giver
  const ring = book.defs.get('the_fairy_ring').steps[0], pool = [...book.placeOf.values()].find(p => p.name === 'Tench Pool');
  assert.ok(pool && Math.hypot(ring.at.x - pool.x, ring.at.z - pool.z) < 300, 'the fairy ring\'s croakers are at Tench Pool');
});

test('S14: the published files are current (run tools/content-hunts.mjs after tools/place-vignettes.mjs)', () => {
  const file = readJ('data/quests/marks/torbor_downs-hunts.json');
  assert.deepEqual(Object.keys(file.types).sort(), [...live.keys()].sort(), 'same monster types');
  for (const [type, list] of live) assert.deepEqual(file.types[type], JSON.parse(JSON.stringify(list)), type + ' areas match the live camps');
  const marks = readJ('data/quests/marks/torbor_downs.json').quests;
  for (const def of book.defs.values()) def.steps.forEach((st, i) => {
    const m = marks[def.id] && marks[def.id].steps[i];
    if (!stepType(st) || !m) return;
    assert.deepEqual([m.x, m.z, m.r], [Math.round(st.at.x), Math.round(st.at.z), Math.round(st.at.r)], `${def.id}#${i} E's mark = the runtime's marker`);
  });
});

test('S14: pickArea prefers the quest zone, the named place, then a full area over a thin one', () => {
  const list = [{ x: 0, z: 0, r: 30, n: 1, zone: 'a' }, { x: 300, z: 0, r: 30, n: 6, zone: 'a' }, { x: 50, z: 0, r: 30, n: 9, zone: 'b' }, { x: 2000, z: 0, r: 30, n: 2, zone: 'a' }];
  assert.equal(pickArea(list, { ref: { x: 0, z: 0 }, zone: 'a', count: 6 }).x, 300, 'thin + near loses to full + a bit further');
  assert.equal(pickArea(list, { ref: { x: 0, z: 0 }, zone: 'a', count: 1 }).x, 0, 'one needed: the nearest');
  assert.equal(pickArea(list, { ref: { x: 0, z: 0 }, zone: 'a', count: 6, place: { x: 2000, z: 0, r: 10 } }).x, 2000, 'the place the text names');
});

test('S14: radiant kill jobs point at real areas of their monster', () => {
  const givers = (L.townObjects || []).flat().filter(o => o && o.npc && ['elder', 'sergeant', 'captain', 'quartermaster'].includes(o.npc.role));
  let kills = 0;
  for (const g of givers.slice(0, 12)) {
    const jb = createQuestBook({ layout: L, zones: L.zones, rares: L.rares, jobs: L.jobs, rng: () => 0.42 });
    for (const off of jb.offers({ level: 3, quests: { active: {}, done: {}, jobs: {} } }, { key: 'g' + g.x, npcId: g.npc.id, name: g.name, role: g.npc.role, x: g.x, z: g.z })) {
      for (const st of off.steps) if (st.kind === 'kill' && st.areas) { kills++; assert.ok(st.areas.length && st.at, off.name); }
    }
  }
  console.log('# job kill steps with areas: ' + kills);
});

test('S14: the quest log a player gets carries each kill step\'s areas', async () => {
  const { srv, clock, world } = await realServer();
  const a = await joinReal(srv, clock, 'Huntress', 'ranger');
  const o = rec(world, a);
  const logs = []; a.on('quests', m => logs.push(m));
  o.char.quests ||= { active: {}, done: {}, jobs: {} };
  o.char.quests.active.croakers_in_the_keepnet = { step: 0, n: 0 };
  o.char.quests.active.zz_dummy = { step: 0, n: 0 };
  a.quest('abandon', 'zz_dummy');                   // any quest change sends the log
  await run(clock, 400);
  const v = (logs.pop() || {}).active || [];
  const k = v.find(x => x.id === 'croakers_in_the_keepnet');
  assert.ok(k, 'the quest is in the log: ' + JSON.stringify(logs).slice(0, 200));
  const st = k.steps[0];
  assert.ok(Array.isArray(st.areas) && st.areas.length, 'areas sent');
  for (const ar of st.areas) for (const f of ['x', 'z', 'r', 'n', 'zone']) assert.ok(ar[f] !== undefined, f);
  a.close(); await srv.stop();
});
