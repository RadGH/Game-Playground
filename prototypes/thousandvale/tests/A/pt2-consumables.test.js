// Lead's call after play-test 2 (stream A): potions and food are usable. item {op:'use'} by uid or 'id:<kind>' (a hotbar slot),
// one shared potion cooldown, food mends out of combat over time and a hit ends it. Stand-in world + the real rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createVirtualClock } from '../../js/net/clock.js';
import { makeServer, joinAs, run } from './helpers.js';
import { realServer, joinReal, rec as recR } from './pt1-helpers.js';
import { POTION_CD_MS } from '../../js/sim/consumables.js';

const rec = (W, c) => W.online.get(c.joined.you.char);
const box = (c, types) => { const b = []; for (const t of types) c.on(t, m => b.push(Array.isArray(m) ? { t, list: m } : { ...m, t })); return b; };
const potion = (id = 'healing_potion') => ({ kind: 'potion', id, name: 'Healing Potion', rarity: 'normal' });
const ration = () => ({ kind: 'good', id: 'travel_rations', name: 'Travel rations', rarity: 'normal', use: { type: 'food', regen: 0.04, seconds: 20 } });

test('a potion heals (by uid or by kind), costs the item, and starts the shared cooldown; full health refuses without spending', async () => {
  const clock = createVirtualClock();
  const srv = makeServer({ clock }); await srv.ready;
  const W = srv.world;
  const a = await joinAs(srv, clock, 'Drinker');
  const o = rec(W, a), e = o.entity;
  W.grant(o, { items: [potion(), potion(), { ...potion('mana_potion'), name: 'Mana Potion' }, { kind: 'good', id: 'whetstone', name: 'Whetstone', use: { type: 'buff' } }], gold: 0, reason: 'test' }); await run(clock, 200);
  const got = box(a, ['itemR', 'you']);
  a.item('use', 'id:healing_potion'); await run(clock, 100);
  assert.equal(got.find(x => x.t === 'itemR').why, 'full', 'full health: refused');
  const held = id => o.char.bag.filter(i => i.id === id).reduce((n, i) => n + (i.count || 1), 0);      // play-test 6 U5: potions stack
  assert.equal(held('healing_potion'), 2, 'nothing spent');
  assert.equal(o.char.bag.filter(i => i.id === 'healing_potion').length, 1, 'two potions are one stack');
  e.setHp(Math.round(e.hpMax * 0.3)); const hp0 = e.hp;
  a.item('use', o.char.bag.find(i => i.id === 'healing_potion').uid); await run(clock, 100);
  assert.ok(e.hp > hp0, 'healed'); assert.equal(held('healing_potion'), 1, 'one used');
  assert.ok(got.some(x => x.t === 'you' && x.potionCd === POTION_CD_MS));
  e.setHp(Math.round(e.hpMax * 0.3));
  a.item('use', 'id:healing_potion'); await run(clock, 100);
  const cd = got.filter(x => x.t === 'itemR').pop();
  assert.equal(cd.why, 'cooldown'); assert.ok(cd.cd > 0 && cd.cd <= POTION_CD_MS);
  a.item('use', 'id:mana_potion'); await run(clock, 100);
  assert.equal(got.filter(x => x.t === 'itemR').pop().why, 'cooldown', 'the cooldown is shared');
  await run(clock, POTION_CD_MS + 200, 100);
  e.setHp(Math.round(e.hpMax * 0.3));
  a.item('use', 'id:healing_potion'); await run(clock, 100);
  assert.equal(got.filter(x => x.t === 'itemR').pop().ok, true, 'again after the cooldown');
  a.item('use', 'id:whetstone'); await run(clock, 100);
  assert.equal(got.filter(x => x.t === 'itemR').pop().why, 'notYet'); assert.ok(o.char.bag.some(i => i.id === 'whetstone'), 'kept');
  a.close(); await srv.stop();
});

test('food mends over time out of combat; a hit ends the meal; you cannot start eating in a fight', async () => {
  const clock = createVirtualClock();
  const srv = makeServer({ clock }); await srv.ready;
  const W = srv.world;
  const a = await joinAs(srv, clock, 'Eater');
  W.transfer(rec(W, a), W.copies[0], { x: W.gate.x + 30, z: W.gate.z }, 'test'); await run(clock, 200);
  const o = rec(W, a), e = o.entity;
  W.grant(o, { items: [ration(), ration()], gold: 0, reason: 'test' }); await run(clock, 200);
  const got = box(a, ['itemR', 'you']);
  e.setHp(Math.round(e.hpMax * 0.2)); const hp0 = e.hp;
  a.item('use', 'id:travel_rations'); await run(clock, 3100, 50);
  assert.ok(got.some(x => x.t === 'you' && x.regen && x.regen.kind === 'food'));
  assert.ok(e.hp >= hp0 + Math.floor(e.hpMax * 0.04) * 2, 'mending: ' + hp0 + ' -> ' + e.hp);
  const wolf = e.room.spawn({ kind: 'monster', type: 'wolf', level: 1, x: e.x + 30, z: e.z, team: 2 });
  e.room.event({ type: 'hit', s: wolf.id, d: e.id, n: 1, kind: 'dmg' }); await run(clock, 1100, 50);
  assert.ok(got.some(x => x.t === 'you' && x.regen === null), 'a hit ends it');
  a.item('use', 'id:travel_rations'); await run(clock, 100);
  assert.equal(got.filter(x => x.t === 'itemR').pop().why, 'combat');
  assert.equal(o.char.bag.filter(i => i.id === 'travel_rations').length, 1, 'not eaten');
  a.close(); await srv.stop();
});

test('with the real rules: a bought healing potion heals through C\'s rules.restore', async () => {
  const { srv, clock, world } = await realServer();
  const a = await joinReal(srv, clock, 'Realdrink', 'warrior');
  const o = recR(world, a), e = o.entity;
  world.grant(o, { items: [potion()], gold: 0, reason: 'test' }); await run(clock, 200);
  e.r.unit.hp = Math.round(e.r.unit.maxHp * 0.3); await run(clock, 200);
  const hp0 = e.hp;
  a.item('use', 'id:healing_potion'); await run(clock, 300);
  assert.ok(e.hp > hp0 && e.r.unit.hp === e.hp, 'healed on the sheet and the entity: ' + hp0 + ' -> ' + e.hp);
  a.close(); await srv.stop();
});

test('C\'s asks: an innkeeper binds a home (saved; respawn goes there); the room host knows the night; oats speed up a ride; a torch bundle is refused (lights left the game, W22)', async () => {
  const { srv, clock, world, store } = await realServer();
  const a = await joinReal(srv, clock, 'Homebody', 'warrior');
  const o = recR(world, a);
  const pv = world.P.values().next().value;
  const town = pv.towns[1] || pv.towns[0];
  assert.equal(typeof town.host.isNight, 'function'); assert.equal(typeof town.host.isNight(), 'boolean');
  const inn = [...town.objects.values()].find(x => x.data && x.data.npc && x.data.npc.role === 'innkeeper');
  assert.ok(inn, 'an innkeeper in ' + town.name);
  world.transfer(o, town, { x: inn.x + 1, z: inn.z }, 'test'); await run(clock, 300);
  const got = box(a, ['bindR', 'used', 'you', 'itemR']);
  a.use(inn.id); await run(clock, 200);
  assert.equal(got.find(x => x.t === 'used').bind, true);
  a.bind(inn.id); await run(clock, 200);
  assert.equal(got.find(x => x.t === 'bindR').ok, true);
  assert.equal(o.char.bind, town.id, 'saved on the character');
  // die out in the wilds near the FIRST town: wake at home
  world.transfer(o, pv.copies[0], { x: pv.L.towns[0].x + 200, z: pv.L.towns[0].z }, 'test'); await run(clock, 300);
  recR(world, a).entity.kill(null); await run(clock, 200);
  a.respawn(); await run(clock, 500);
  assert.equal(recR(world, a).room, town, 'respawned at the bound inn');
  // oats: a riding-speed item buff multiplies the mount
  const o2 = recR(world, a);
  o2.char.mounts = ['trail_horse']; o2.mount = 'trail_horse';
  const base = o2.entity.speedMul;
  o2.room.rules.itemBuffs = () => ({ mountSpeedPct: 0.1 });
  world.transfer(o2, o2.room, { x: o2.entity.x, z: o2.entity.z }, 'test');
  o2.entity.mount = 'trail_horse'; o2.entity.speedMul = 1.4;
  await run(clock, 1200);
  const horse = world.mountBook ? world.mountBook.get('trail_horse').speed : 1.4;      // round 11: the horse's own speed (1.35 since #44)
  assert.ok(Math.abs(o2.entity.speedMul - horse * 1.1) < 1e-6, 'oats: ' + o2.entity.speedMul + ' (was ' + base + ')');
  // W22 (round 8): torches left the game — the rules refuse to light one, in a sentence. A charged good still counts down
  // and its count still survives a reload (a whetstone bundle stands in for the old torch bundle).
  world.grant(o2, { items: [{ kind: 'good', id: 'torch_bundle', name: 'Bundle of torches', use: { type: 'light', minutes: 10, charges: 6 } }], gold: 0, reason: 'test' }); await run(clock, 200);
  a.item('use', 'id:torch_bundle'); await run(clock, 200);
  const no = got.filter(x => x.t === 'itemR').pop();
  assert.equal(no.ok, false); assert.equal(no.why, 'gone'); assert.match(no.msg, /removed from the game/);
  await world.flushJournal(); await run(clock, 100);
  const acct = o2.char.account, id = o2.char.id;
  a.close(); await run(clock, 500);
  const re = await store.takeChar(acct, id, 'test-reader', 1000);
  assert.equal(re.char.bind, town.id, 'the home survives a reload');
  await srv.stop();
});
