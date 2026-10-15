// Expansion 1 (stream P): two provinces in one realm — Torbor Downs and Vharlen on their own islands. Each province
// runs its OWN shops, carts, guards, names and economy; a character moved to the other island (by ship: a `moveTo`)
// lives there, is saved there and respawns there; the waystones (and the Callboard) never cross the sea; new
// characters always begin in the starter province (its band starts at level 1), whatever order the layouts come in.
//
// In-process on stand-in ground (three small islands: A and C share a continent, B is across the sea), plus the loader
// itself over the real data with a fixture second province laid over the file system (nothing written to data/).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { createWorld } from '../../js/sim/world.js';
import { createLoopbackServer } from '../../js/sim/loopback.js';
import { createMemoryStore } from '../../js/sim/store-memory.js';
import { createVirtualClock } from '../../js/net/clock.js';
import { memoryTokenStore } from '../../js/net/client.js';
import { standInTerrain } from '../../js/sim/terrain.js';
import { buildLayout } from '../../js/sim/realm.js';
import { mergeMounts, SEA_MSG } from '../../js/sim/province.js';
import { loadProvinceContent } from '../../js/sim/content.js';
import { provinceData, provinceDataPath, HOME_PROVINCE } from '../../js/sim/province-files.js';
import { createCallboard } from '../../js/sim/callboard.js';
import { parseTerrain, parseNav } from '../../js/rules/terrain-read.js';
import { createProvinceTerrain } from '../../js/sim/province-terrain.js';
import { economy } from '../../js/sim/economy-knobs.js';
import { makeClient, run, until, waitP } from './helpers.js';

const GAME = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const box = (c, types) => { const b = []; for (const t of types) c.on(t, m => b.push(Array.isArray(m) ? { t, list: m } : { ...m, t })); return b; };

/** A small island province: one hub town at the middle of a 1 km stand-in field, a carter, a guard, its own data. */
function isle(key, { town, band, continent, starter, goods, family, cartBase }) {
  const terrain = { ...standInTerrain(key.length, 1024), key, reader: { meta: { sites: [{ type: 'settlement', hub: true, kind: 'town', name: town, x: 512, z: 512, radius: 60 }] } } };
  const L = buildLayout({ key, name: town + ' Isle', terrain, zones: [{ key, sheet: { id: key, name: town + ' Isle', band, camps: [] } }],
    shops: { kinds: { general: { name: town + ' Goods', role: 'merchant', categories: {}, goods: [{ source: 'good', id: goods, price: 3 }] } }, goodsCatalog: { [goods]: { name: goods.replace(/_/g, ' '), desc: 'from ' + town } } },
    extra: {
      starterProvince: starter, continent,
      economy: { cart: { base: cartBase, metresPerGold: 250, minGold: 4 } },
      carts: { rules: {}, stops: [{ id: 'cart_' + key + '_1', town, x: 530, z: 512 }, { id: 'cart_' + key + '_2', town: town + ' Far', x: 900, z: 900 }], fares: { ['cart_' + key + '_1']: [{ to: 'cart_' + key + '_2', metres: 1000 }] } },
      guards: { raid: { say: { newcomer: ['Hold fast, ' + town + ' stands.'] } } },
      names: { given: { f: ['Ysa'], m: ['Orn'] }, family: [family] },
    } });
  L.townObjects[0].push({ type: 'npc', name: 'Carter', x: 530, z: 512, key: 'npc:' + key + ':carter', npc: { role: 'carter', cart: 'cart_' + key + '_1', says: [] } });
  L.townObjects[0].push({ type: 'npc', name: 'Guard', x: 500, z: 530, key: 'npc:' + key + ':guard', npc: { role: 'guard', says: [] }, guard: { rank: 'guard' } });
  return L;
}

async function realm() {
  const clock = createVirtualClock();
  const store = createMemoryStore({ now: clock.now });
  // the island across the sea FIRST: new characters must still begin on the starter island
  const B = isle('isle_b', { town: 'Port Vharl', band: [10, 12], continent: 'vharlen', starter: false, goods: 'b_salt', family: 'Basaltborn', cartBase: 50 });
  const A = isle('isle_a', { town: 'Torborhold', band: [1, 4], continent: 'torbor', starter: true, goods: 'a_bread', family: 'Meadowe', cartBase: 3 });
  const C = isle('isle_c', { town: 'Gullwick', band: [4, 6], continent: 'torbor', starter: false, goods: 'c_eel', family: 'Tidewell', cartBase: 3 });
  const world = createWorld({ store, layouts: [B, A, C], now: clock.now, lingerMs: 0, log: () => {}, roadEvents: false, travellers: false, newcomer: { underLevel: 0, firstMinutes: 0 } });
  const srv = createLoopbackServer({ clock, world });
  await srv.ready;
  return { srv, clock, world, store, A, B, C };
}
async function join1(srv, clock, name, tokenStore = memoryTokenStore()) {
  const c = makeClient(srv, clock, { tokenStore });
  await waitP(clock, c.ready);
  const ch = await waitP(clock, c.createChar({ name, cls: 'warrior' }));
  await waitP(clock, c.play(ch.id));
  await until(clock, () => !!c.joined, 5000);
  return { c, ch, tokenStore };
}
const rec = (world, c) => world.online.get(c.joined.you.char);
const objIn = (room, f) => [...room.objects.values()].find(f);
const provOfRoom = r => r.id.split('/')[0];

test('two provinces: new characters begin on the starter island; each island has its own shops, carts, guards, names and fares', async () => {
  const { srv, clock, world } = await realm();
  const { c } = await join1(srv, clock, 'Islander');
  const o = rec(world, c);
  assert.equal(provOfRoom(o.room), 'isle_a', 'began in the starter province although its layout came second: ' + o.room.id);
  const got = box(c, ['shopView', 'cartList', 'cartR']);
  const A = world.P.get('isle_a'), B = world.P.get('isle_b');
  assert.notEqual(A.shops, B.shops); assert.notEqual(A.carts, B.carts); assert.notEqual(A.roadEvents, B.roadEvents);

  // ---- on island A ----
  const merchantA = objIn(A.towns[0], x => x.data && x.data.npc && x.data.npc.role === 'merchant');
  world.transfer(o, A.towns[0], { x: merchantA.x + 1, z: merchantA.z }, 'test'); await run(clock, 300);
  c.shop('open', { npc: merchantA.id }); await run(clock, 300);
  let view = got.filter(m => m.t === 'shopView').at(-1);
  assert.deepEqual(view.stock.map(r => r.item.id), ['a_bread'], 'Torborhold sells its own goods');
  const carterA = objIn(A.towns[0], x => x.data && x.data.npc && x.data.npc.role === 'carter');
  world.transfer(rec(world, c), A.towns[0], { x: carterA.x + 1, z: carterA.z }, 'test'); await run(clock, 300);
  c.cart('list', carterA.id); await run(clock, 300);
  let list = got.filter(m => m.t === 'cartList').at(-1);
  assert.deepEqual(list.stops.map(s => s.id), ['cart_isle_a_2'], 'A\'s carts go to A\'s stops only');
  assert.equal(list.stops[0].fare, Math.max(4, Math.round(3 + 1000 / 250)), 'A\'s fare from A\'s economy');
  const guardA = objIn(A.towns[0], x => x.data && x.data.guard);
  assert.equal(guardA.data.guard.level, 1, 'A\'s guard at the floor of A\'s band');
  const smithA = objIn(A.towns[0], x => x.data && x.data.npc && x.data.npc.role === 'smith');
  assert.match(smithA.name, /Meadowe$/, 'a nameless Torbor smith takes a Torbor name: ' + smithA.name);

  // ---- the ship: a move to the other province (stream V calls moveTo with the dock) ----
  world.moveTo(rec(world, c), 'isle_b', { x: 515, z: 515 }, 'ship'); await run(clock, 300);
  const ob = rec(world, c);
  assert.equal(ob.room.id, 'isle_b/town:0', 'landed in Port Vharl: ' + ob.room.id);
  assert.equal(c.joined.room.province, 'isle_b');
  const merchantB = objIn(B.towns[0], x => x.data && x.data.npc && x.data.npc.role === 'merchant');
  world.transfer(ob, B.towns[0], { x: merchantB.x + 1, z: merchantB.z }, 'test'); await run(clock, 300);
  c.shop('open', { npc: merchantB.id }); await run(clock, 300);
  view = got.filter(m => m.t === 'shopView').at(-1);
  assert.deepEqual(view.stock.map(r => r.item.id), ['b_salt'], 'Port Vharl sells its own goods, not Torborhold\'s');
  const carterB = objIn(B.towns[0], x => x.data && x.data.npc && x.data.npc.role === 'carter');
  world.transfer(rec(world, c), B.towns[0], { x: carterB.x + 1, z: carterB.z }, 'test'); await run(clock, 300);
  c.cart('list', carterB.id); await run(clock, 300);
  list = got.filter(m => m.t === 'cartList').at(-1);
  assert.deepEqual(list.stops.map(s => s.id), ['cart_isle_b_2'], 'B\'s carts go to B\'s stops only');
  assert.equal(list.stops[0].fare, Math.max(4, Math.round(50 + 1000 / 250)), 'B\'s fare from B\'s own economy');
  c.cart('go', carterB.id, 'cart_isle_a_2'); await run(clock, 300);
  assert.equal(got.filter(m => m.t === 'cartR').at(-1).why, 'stop', 'no cart rides across the sea');
  const guardB = objIn(B.towns[0], x => x.data && x.data.guard);
  assert.equal(guardB.data.guard.level, 10, 'B\'s guard at the floor of B\'s band');
  const smithB = objIn(B.towns[0], x => x.data && x.data.npc && x.data.npc.role === 'smith');
  assert.match(smithB.name, /Basaltborn$/, 'a nameless Vharl smith takes a Vharl name: ' + smithB.name);
  c.close(); await srv.stop();
});

test('two provinces: saved on the other island, back there on login; dying there wakes in its towns, never the other island\'s', async () => {
  const { srv, clock, world, store } = await realm();
  const { c, ch, tokenStore } = await join1(srv, clock, 'Voyager');
  const o = rec(world, c);
  o.char.bind = 'isle_a/town:0';                                  // bound at Torborhold's inn
  world.moveTo(o, 'isle_b', { x: 700, z: 700 }, 'ship'); await run(clock, 300);
  const ob = rec(world, c);
  assert.equal(provOfRoom(ob.room), 'isle_b');
  assert.equal(ob.room.kind, 'wilds', 'out in the wilds of B');
  // dies: wakes in B's town (the bound inn is across the sea)
  ob.entity.kill(null); await run(clock, 100);
  c.respawn(); await run(clock, 400);
  assert.equal(rec(world, c).room.id, 'isle_b/town:0', 'respawned on the island they died on: ' + rec(world, c).room.id);
  // walk out to the wilds of B, log off; the save holds B; logging back in puts them there
  world.transfer(rec(world, c), world.P.get('isle_b').copies[0], { x: 720, z: 690 }, 'test'); await run(clock, 300);
  c.close(); await run(clock, 2000);
  await until(clock, () => !world.online.has(ch.id), 5000);
  const saved = (await waitP(clock, store.listChars(o.char.account))).find(x => x.id === ch.id);
  assert.match(String(saved.room), /^isle_b\//, 'saved on B: ' + JSON.stringify(saved).slice(0, 200));
  const c2 = makeClient(srv, clock, { tokenStore });
  await waitP(clock, c2.ready);
  await waitP(clock, c2.play(ch.id));
  await until(clock, () => !!c2.joined, 5000);
  assert.equal(provOfRoom(rec(world, c2).room), 'isle_b', 'logged back in on B: ' + rec(world, c2).room.id);
  assert.ok(Math.hypot(rec(world, c2).entity.x - 720, rec(world, c2).entity.z - 690) < 3, 'where they stood');
  c2.close(); await srv.stop();
});

test('two provinces: waystones reach another province on the same continent but never across the sea', async () => {
  const { srv, clock, world } = await realm();
  const { c } = await join1(srv, clock, 'Stonewalker');
  const o = rec(world, c);
  const got = box(c, ['travelR']);
  const A = world.P.get('isle_a'), B = world.P.get('isle_b'), C = world.P.get('isle_c');
  const wsA = A.L.waystones.find(w => w.town === 0), wsB = B.L.waystones.find(w => w.town === 0), wsC = C.L.waystones.find(w => w.town === 0);
  o.char.waystones = [wsA.key, wsB.key, wsC.key];
  o.char.gold = 500;
  world.transfer(o, A.towns[0], { x: wsA.x + 1, z: wsA.z }, 'test'); await run(clock, 300);
  c.travel(wsB.key); await run(clock, 300);
  let r = got.at(-1);
  assert.equal(r.ok, false); assert.equal(r.why, 'sea'); assert.equal(r.msg, SEA_MSG);
  assert.equal(rec(world, c).char.gold, 500, 'no fare taken');
  c.travel(wsC.key); await run(clock, 300);
  r = got.at(-1);
  assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.province, 'isle_c');
  const dist = Math.hypot(wsC.x - (wsA.x + 1), wsC.z - wsA.z);
  assert.equal(r.cost, economy().travel.base + Math.round((dist + economy().travel.crossProvinceMetres) / economy().travel.metresPerGold), 'the cross-province fare on the same continent');
  await run(clock, 2500);
  assert.equal(provOfRoom(rec(world, c).room), 'isle_c', 'arrived in the same-continent province');
  c.close(); await srv.stop();
});

test('the Callboard never offers (or pops) a dungeon on another island', () => {
  const presence = new Map([[1, { level: 12, online: true, continent: 'torbor' }], [2, { level: 12, online: true, continent: 'vharlen' }]]);
  const told = [];
  const gw = c => ({ sendJSON: m => told.push({ c, ...m }), err: () => {} });
  const B = createCallboard({ parties: { of: () => null }, presence, gwByChar: { get: gw }, now: () => 0 });
  B.addDungeons([{ key: 'torbor_downs:0', province: 'torbor_downs', door: 0, name: 'Barrow', level: 12, continent: 'torbor' }, { key: 'vharlen:0', province: 'vharlen', door: 0, name: 'The Throat', level: 12, continent: 'vharlen' }]);
  B.op({ charId: 1, err: () => {} }, { op: 'list' });
  B.op({ charId: 2, err: () => {} }, { op: 'list' });
  const l1 = told.find(m => m.c === 1 && m.state === 'list'), l2 = told.find(m => m.c === 2 && m.state === 'list');
  assert.deepEqual(l1.dungeons.map(d => d.key), ['torbor_downs:0']);
  assert.deepEqual(l2.dungeons.map(d => d.key), ['vharlen:0']);
});

test('mergeMounts: one table, untouched for one province; another province adds its own mounts', () => {
  const t = { mounts: [{ id: 'trail_horse' }] };
  assert.equal(mergeMounts([t]), t);
  assert.equal(mergeMounts([null, null]), null);
  assert.deepEqual(mergeMounts([t, { mounts: [{ id: 'ash_strider' }, { id: 'trail_horse' }] }]).mounts.map(m => m.id), ['trail_horse', 'ash_strider']);
  assert.ok(mergeMounts([null, { mounts: [{ id: 'ash_strider' }] }]).mounts.length > 1, 'the built-in table first when the first province has none');
});

test('the loader: a second province reads its own files, borrows the shared ones, never Torbor\'s placed ones', async () => {
  // a fixture province laid over the real file system: its own sheet, its own shops towns + carts, nothing else
  const FIX = 'fixture_isle';
  const files = {
    'data/world/province-map.json': (() => { const m = JSON.parse(readFileSync(join(GAME, 'data/world/province-map.json'), 'utf8')); m.provinces[FIX] = { block: [12, 2], size: [1, 1], continent: 'fixture', map: { fx_landing: 'z12_02' } }; return m; })(),
    [`data/provinces/${FIX}.json`]: { id: FIX, name: 'Fixture Isle', band: [10, 20], zones: { fx_landing: { name: 'The Landing', grid: [0, 0], band: [10, 12], archetype: 'coast' } }, grid: { w: 1, h: 1, start: 'fx_landing' } },
    [provinceDataPath(FIX, 'shops')]: { towns: { 'Port Fixture': { levelCap: 20, shops: ['general'] } } },
    [provinceDataPath(FIX, 'carts')]: { stops: [{ id: 'cart_fx', town: 'Port Fixture', x: 1, z: 1 }], fares: {} },
    [provinceDataPath(FIX, 'names')]: { given: { f: ['Ysa'], m: ['Orn'] }, family: ['Fixborn'] },
  };
  const readJson = async f => (f in files ? JSON.parse(JSON.stringify(files[f])) : JSON.parse(readFileSync(join(GAME, f), 'utf8')));
  const readBytes = async f => readFileSync(join(GAME, f));
  const c = await loadProvinceContent(readJson, readBytes, FIX, { parseTerrain, parseNav, createProvinceTerrain });
  const home = JSON.parse(readFileSync(join(GAME, 'data/provinces/shops.json'), 'utf8'));
  assert.equal(c.starterProvince, false, 'band 10-20 is not the starter');
  assert.equal(c.extra.starterProvince, false); assert.equal(c.extra.continent, 'fixture');
  for (const k of Object.keys(home.kinds)) assert.ok(c.shops.kinds[k], 'shop kind ' + k + ' borrowed from the shared file');
  assert.deepEqual(Object.keys(c.shops.towns), ['Port Fixture'], 'its own towns, never Torbor\'s');
  assert.deepEqual(c.extra.carts.stops.map(s => s.id), ['cart_fx'], 'its own carts');
  assert.equal(c.offices, null, 'no offices of its own = none (Torbor\'s are not lent)');
  assert.equal(c.extra.guards, null, 'no guard posts of its own');
  assert.equal(c.extra.givers, null);
  assert.ok(c.schedules && c.schedules.perTown, 'schedules borrowed');
  assert.equal(c.extra.names.family[0], 'Fixborn', 'its own names');
  assert.ok(c.extra.economy && c.extra.economy.unit, 'economy borrowed');
  assert.ok(!c.extra.angling || !c.extra.angling.pools, 'no fishing pools of its own');
  assert.ok(!c.extra.professions || !c.extra.professions.nodes, 'no gathering nodes of its own');
  assert.ok(!c.extra.professions || !(c.extra.professions.content.trainers || []).length, 'Torbor\'s trainers are not lent');
  assert.equal(c.zones.length, 1); assert.equal(c.zones[0].eid, 'fx_landing');
  // and Torbor Downs still reads exactly its old files
  assert.equal(provinceDataPath(HOME_PROVINCE, 'shops'), 'data/provinces/shops.json');
  assert.deepEqual(await provinceData(readJson, HOME_PROVINCE, 'shops'), home);
});
