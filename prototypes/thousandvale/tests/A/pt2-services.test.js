// Play-test 2 (stream A): Q1 cast refusals, Q2 follow, Q8 statuses others see, Q11 shops, Q14/Q15 trade + friends-only,
// Q16 mounts, Q20/Q21 looks, Q22 display prefs, Q25 class names. Stand-in world (fast).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createVirtualClock } from '../../js/net/clock.js';
import { makeServer, makeClient, joinAs, run, until, waitP } from './helpers.js';
import { xpFor } from '../../js/sim/rules-v0.js';
import { MOVE, stepMove } from '../../js/sim/movement.js';

const rec = (W, c) => W.online.get(c.joined.you.char);
const box = (c, types) => { const b = []; for (const t of types) c.on(t, m => b.push(Array.isArray(m) ? { t, list: m } : { ...m, t })); return b; };

test('Q1: the same cast refusal is sent once per 2 s per slot, camelCase, with `need`', async () => {
  const clock = createVirtualClock();
  const createRules = () => ({ addEntity(e) { e.setMax(100, 10); e.setHp(100); }, intent() { return { ok: false, why: 'not drawn', need: 0.35 }; } });
  const srv = makeServer({ clock, worldOpts: { createRules } }); await srv.ready;
  const a = await joinAs(srv, clock, 'Archer');
  const got = box(a, ['castR']);
  for (let i = 0; i < 10; i++) { a.cast({ slot: 0 }); await run(clock, 100); }
  assert.equal(got.length, 1, 'one refusal, not ten: ' + got.length);
  assert.equal(got[0].why, 'notDrawn'); assert.equal(got[0].need, 0.35); assert.ok(got[0].text);
  await run(clock, 2100); a.cast({ slot: 0 }); await run(clock, 100);
  assert.equal(got.length, 2, 'again after the gap');
  a.close(); await srv.stop();
});

test('Q8: statuses ride on info.st for everyone; a death clears them and says so', async () => {
  const clock = createVirtualClock();
  const srv = makeServer({ clock }); await srv.ready;
  const W = srv.world;
  const a = await joinAs(srv, clock, 'Burning'), b = await joinAs(srv, clock, 'Watcher');
  for (const c of [a, b]) W.transfer(rec(W, c), W.copies[0], { x: W.gate.x + 30, z: W.gate.z }, 'test');
  await run(clock, 300);
  const e = rec(W, a).entity;
  e.r.unit = { statuses: { burning: { power: 1 } } };                  // the rules' own record (C keeps statuses on the unit)
  e.room.event({ type: 'fx', id: e.id, kind: 'status', status: 'burning', on: true });
  await run(clock, 300);
  assert.deepEqual(e.info().st, ['burning']);
  assert.deepEqual(b.mirror.infos.get(e.id).st, ['burning'], 'the other player has it in info');
  // a late arrival sees it too (info, not just the event)
  const c = await joinAs(srv, clock, 'Latecomer');
  W.transfer(rec(W, c), W.copies[0], { x: e.x + 2, z: e.z }, 'test'); await run(clock, 400);
  assert.deepEqual(c.mirror.infos.get(e.id).st, ['burning']);
  // death: cleared, with an fx off
  const evs = []; b.on('ev', m => evs.push(...m.e));
  e.kill(null); await run(clock, 300);
  assert.equal(e.info().st, undefined, 'no aura on a dead body');
  assert.ok(evs.some(x => x.type === 'fx' && x.kind === 'status' && x.status === 'burning' && x.on === false), 'fx off');
  a.respawn(); await run(clock, 400);
  assert.equal(rec(W, a).entity.info().st, undefined, 'revived clean');
  // a status that runs out silently is dropped by the once-a-second sweep
  const e2 = rec(W, b).entity;
  e2.r.unit = { statuses: { chilled: {} } };
  e2.room.event({ type: 'fx', id: e2.id, kind: 'status', status: 'chilled', on: true }); await run(clock, 200);
  assert.deepEqual(e2.info().st, ['chilled']);
  e2.r.unit.statuses = {}; await run(clock, 1200);
  assert.equal(e2.info().st, undefined);
  a.close(); b.close(); c.close(); await srv.stop();
});

test('Q11: the merchant sells, buys and buys back', async () => {
  const clock = createVirtualClock();
  const srv = makeServer({ clock }); await srv.ready;
  const W = srv.world;
  const a = await joinAs(srv, clock, 'Shopper');
  const o = rec(W, a);
  const merchant = [...W.townRoom.objects.values()].find(x => x.data && x.data.npc && x.data.npc.role === 'merchant');
  assert.ok(merchant, 'a merchant in town');
  W.transfer(o, W.townRoom, { x: merchant.x + 1, z: merchant.z }, 'test'); await run(clock, 300);
  o.char.gold = 5000;
  const got = box(a, ['shopView', 'shopR', 'bag']);
  a.shop('open', { npc: merchant.id }); await run(clock, 200);
  const v = got.find(x => x.t === 'shopView');
  assert.ok(v && v.stock.length > 0, 'something for sale');
  const row = v.stock[0];
  const bag0 = o.char.bag.length;
  a.shop('buy', { npc: merchant.id, id: row.id }); await run(clock, 200);
  assert.equal(o.char.bag.length, bag0 + 1, 'bought');
  assert.equal(o.char.gold, 5000 - row.price);
  const it = o.char.bag[o.char.bag.length - 1];
  const g1 = o.char.gold;
  a.shop('sell', { npc: merchant.id, uid: it.uid }); await run(clock, 200);
  assert.equal(o.char.bag.length, bag0, 'sold');
  assert.ok(o.char.gold > g1 && o.char.gold - g1 < row.price, 'sold for less than it cost');
  const v2 = got.filter(x => x.t === 'shopView').pop();
  assert.equal(v2.buyback[0].uid, it.uid, 'on the buy-back list');
  a.shop('back', { npc: merchant.id, uid: it.uid }); await run(clock, 200);
  assert.ok(o.char.bag.some(x => x.uid === it.uid), 'bought back, same item');
  assert.equal(o.char.gold, g1, 'for what it fetched');
  // too far / poor
  W.transfer(o, W.townRoom, { x: merchant.x + 20, z: merchant.z }, 'test'); await run(clock, 200);
  a.shop('open', { npc: merchant.id }); await run(clock, 200);
  assert.equal(got.filter(x => x.t === 'shopR').pop().why, 'far');
  a.close(); await srv.stop();
});

test('Q16: a mount at level 5; summon, faster, off when you cast or get hit; refused while fighting; the stablehand sells more', async () => {
  const clock = createVirtualClock();
  const srv = makeServer({ clock }); await srv.ready;
  const W = srv.world;
  const a = await joinAs(srv, clock, 'Rider'), b = await joinAs(srv, clock, 'Onlooker');
  const o = rec(W, a);
  const got = box(a, ['mountR', 'you']);
  a.mount('summon'); await run(clock, 200);
  assert.equal(got.find(x => x.t === 'mountR').why, 'none', 'no mount at level 1');
  o.room.award(o.entity, { xp: xpFor(5), reason: 'quest' }); await run(clock, 200);
  assert.ok(o.char.mounts.includes('trail_horse'), 'the first mount at level 5');
  assert.ok(got.some(x => x.t === 'you' && x.mountNew === 'trail_horse'));
  for (const c of [a, b]) W.transfer(rec(W, c), W.copies[0], { x: W.gate.x + 30, z: W.gate.z + (c === b ? 3 : 0) }, 'test');
  await run(clock, 300);
  // calling a mount is a 1.5 s cast (C's rules): a step breaks it
  a.mount('summon'); await run(clock, 300);
  assert.equal(got.filter(x => x.t === 'mountR').pop().casting, 1500);
  W.transfer(rec(W, a), rec(W, a).room, { x: rec(W, a).entity.x + 2, z: rec(W, a).entity.z }, 'test');
  await run(clock, 1500);
  assert.equal(rec(W, a).entity.mount, null, 'moving broke the call');
  assert.equal(got.filter(x => x.t === 'mountR').pop().why, 'interrupted');
  a.mount('summon'); await run(clock, 1700);
  const e = rec(W, a).entity;
  assert.equal(e.mount, 'trail_horse'); assert.ok(e.speedMul > 1);
  assert.equal(b.mirror.infos.get(e.id).mount, 'trail_horse', 'others see the rider');
  // faster, the same step on both sides
  const st = { x: 0, y: 0, z: 0, vy: 0, airborne: false, speedMul: e.speedMul };
  stepMove(st, { mx: 1, mz: 0, b: 0 }, 100, { heightAt: () => 0 });
  assert.ok(Math.abs(st.x - MOVE.run * e.speedMul * 0.1) < 1e-9);
  // casting gets you off
  a.cast({ slot: 0 }); await run(clock, 200);
  assert.equal(rec(W, a).entity.mount, null, 'off when attacking');
  assert.ok(got.some(x => x.t === 'you' && x.dismount === 'cast'));
  // a damaging hit from an enemy throws you (the trail horse's calm is low: roll until it does), a DoT tick never does
  await run(clock, 5200);
  a.mount('summon'); await run(clock, 1700);
  const e3 = rec(W, a).entity;
  assert.equal(e3.mount, 'trail_horse');
  const wolf = e3.room.spawn({ kind: 'monster', type: 'wolf', level: 1, x: e3.x + 30, z: e3.z, team: 2 });
  e3.room.event({ type: 'hit', s: 0, d: e3.id, n: 3, kind: 'dmg', skill: 'dot' }); await run(clock, 100);
  assert.equal(e3.mount, 'trail_horse', 'a burn tick does not throw you');
  for (let k = 0; k < 20 && e3.mount; k++) { e3.room.event({ type: 'hit', s: wolf.id, d: e3.id, n: 3, kind: 'dmg' }); await run(clock, 60); }
  assert.equal(e3.mount, null, 'thrown by a hit');
  a.mount('summon'); await run(clock, 200);
  assert.equal(got.filter(x => x.t === 'mountR').pop().why, 'combat', 'not while fighting (hit in the last 5 s)');
  // the stablehand sells the rest
  const r = W.townRoom;
  const stable = r.spawn({ kind: 'npc', type: 'npc', name: 'Stablehand', x: r.area.x + 3, z: r.area.z, team: 1, data: { npc: { role: 'stablehand' }, key: 'test:stable' } });
  W.transfer(o, r, { x: stable.x + 1, z: stable.z }, 'test'); await run(clock, 300);
  rec(W, a).char.gold = 1000;
  const sv = box(a, ['shopView']);
  a.shop('open', { npc: stable.id }); await run(clock, 200);
  const horse = sv[0].stock.find(x => x.mount && x.mount.id === 'pony');
  assert.ok(horse, 'a horse for sale');
  rec(W, a).entity.setLevel(10); rec(W, a).char.level = 10;
  a.shop('buy', { npc: stable.id, id: horse.id }); await run(clock, 200);
  assert.ok(rec(W, a).char.mounts.includes('pony'));
  assert.equal(rec(W, a).char.gold, 1000 - horse.price);
  a.close(); b.close(); await srv.stop();
});

test('Q14 + Q15: trade asked and accepted by entity id; "trade requests from friends only" refuses strangers until they are friends', async () => {
  const clock = createVirtualClock();
  const srv = makeServer({ clock }); await srv.ready;
  const W = srv.world;
  const a = await joinAs(srv, clock, 'Asker'), b = await joinAs(srv, clock, 'Picky');
  for (const c of [a, b]) W.transfer(rec(W, c), W.copies[0], { x: W.gate.x + 30, z: W.gate.z + (c === b ? 2 : 0) }, 'test');
  await run(clock, 300);
  const B = box(b, ['tradeAsk', 'settings', 'trade']), A = box(a, ['err', 'trade']);
  b.settings({ tradeFriendsOnly: true }); await run(clock, 300);
  assert.equal(B.filter(x => x.t === 'settings').pop().data.tradeFriendsOnly, true);
  a.tradeOp('ask', { id: rec(W, b).entity.id }); await run(clock, 200);
  assert.ok(A.some(x => x.t === 'err' && x.code === 'trade' && /friends/.test(x.msg)), 'refused with a reason');
  assert.equal(B.filter(x => x.t === 'tradeAsk').length, 0);
  const BE = box(b, ['err', 'friends']);
  b.friend('add', 'Asker'); await run(clock, 400);
  a.tradeOp('ask', { id: rec(W, b).entity.id }); await run(clock, 200);
  const ask = B.find(x => x.t === 'tradeAsk');
  assert.ok(ask, 'a friend may ask: ' + JSON.stringify(A) + JSON.stringify(B) + JSON.stringify(BE));
  b.tradeOp('accept', { id: ask.trade }); await run(clock, 200);
  assert.equal(A.filter(x => x.t === 'trade').pop().trade.state, 'open', 'the window opens on both sides');
  a.close(); b.close(); await srv.stop();
});

test('Q2 follow, Q22 prefs, Q25 class names, Q20 barber, Q21 the title-screen look', async () => {
  const clock = createVirtualClock();
  const srv = makeServer({ clock }); await srv.ready;
  const W = srv.world;
  // Q25: the character list names the class
  const c0 = makeClient(srv, clock);
  await waitP(clock, c0.ready);
  const made = await waitP(clock, c0.createChar({ name: 'Listed', cls: 'ranger' }));
  let list = null; c0.on('chars', l => { if (l.some(x => x.clsName)) list = l; });
  c0._raw('gw', JSON.stringify({ t: 'chars' })); await until(clock, () => !!list, 2000);
  assert.equal(list.find(x => x.id === made.id).clsName, 'Ranger');
  // Q21: a custom look saved from the title screen (cleaned: bad ids dropped, numbers clamped)
  const LR = box(c0, ['lookR']);
  c0.setLook(made.id, { race: 'elf', seed: 42, avatar: { hair: { id: 'ponytail', color: '#aa3300' }, hat: { id: 'no_such_hat' }, eyes: { id: 'round', scale: 99 }, body: { height: 5, skin: 'red' }, held: 'sword' } });
  await run(clock, 300);
  const lr = LR.pop();
  assert.ok(lr.ok, JSON.stringify(lr));
  assert.equal(lr.look.race, 'elf'); assert.equal(lr.look.custom.hair.id, 'ponytail');
  assert.ok(!lr.look.custom.hat, 'unknown part dropped'); assert.ok(!lr.look.custom.held, 'no held part in a look');
  assert.ok(lr.look.custom.eyes.scale <= 2.5 && lr.look.custom.body.height <= 2 && !lr.look.custom.body.skin, 'clamped');
  await waitP(clock, c0.play(made.id)); await until(clock, () => !!c0.joined, 3000);
  assert.equal(c0.joined.you.look.custom.hair.id, 'ponytail', 'the world uses it');
  assert.equal(c0.joined.you.clsName, 'Ranger');
  // the title-screen editor is refused while that character is in the world
  c0.setLook(made.id, { race: 'human', seed: 1 }); await run(clock, 300);
  assert.equal(LR.pop().why, 'online');
  const a = c0, b = await joinAs(srv, clock, 'Leader');
  for (const c of [a, b]) W.transfer(rec(W, c), W.copies[0], { x: W.gate.x + 30, z: W.gate.z + (c === b ? 3 : 0) }, 'test');
  await run(clock, 300);
  // Q2: follow a player yes, a monster no
  const F = box(a, ['followR']);
  a.follow(rec(W, b).entity.id); await run(clock, 100);
  assert.equal(F.pop().ok, true);
  const wolf = rec(W, a).room.spawn({ kind: 'monster', type: 'wolf', level: 1, x: rec(W, a).entity.x + 3, z: rec(W, a).entity.z, team: 2 });
  a.follow(wolf.id); await run(clock, 100);
  assert.equal(F.pop().why, 'hostile');
  // Q22: hide the helm -> nobody draws it
  const ea = rec(W, a).entity;
  ea.gear = null; rec(W, a).char.equipment = { head: { name: 'Hood', slot: 'head', uid: 'h1' }, chest: { name: 'Coat', slot: 'chest', uid: 'c1' } };
  a.pref('showHelm', false); await run(clock, 300);
  assert.ok(ea.info().gear && !ea.info().gear.head && ea.info().gear.chest, 'head piece hidden for all');
  assert.ok(!b.mirror.infos.get(ea.id).gear.head);
  a.pref('showGear', false); await run(clock, 300);
  assert.equal(ea.info().gearOff, 1); assert.ok(!ea.info().gear.chest);
  assert.equal(rec(W, a).char.prefs.showGear, false, 'saved');
  // Q20: a barber changes the look for gold; others get the new info.look
  const r = W.townRoom;
  const barber = r.spawn({ kind: 'npc', type: 'npc', name: 'Barber', x: r.area.x + 2, z: r.area.z, team: 1, data: { npc: { role: 'barber' }, key: 'test:barber' } });
  W.transfer(rec(W, a), r, { x: barber.x + 1, z: barber.z }, 'test');
  W.transfer(rec(W, b), r, { x: barber.x + 2, z: barber.z }, 'test'); await run(clock, 300);
  rec(W, a).char.gold = 100;
  a.barber(barber.id, { race: 'dwarf', custom: { facialHair: { id: 'full', color: '#552211' } } }); await run(clock, 300);
  const br = LR.pop();
  assert.ok(br.ok, JSON.stringify(br));
  assert.equal(rec(W, a).char.look.race, 'dwarf'); assert.equal(rec(W, a).char.gold, 100 - br.cost);
  assert.equal(b.mirror.infos.get(rec(W, a).entity.id).look.race, 'dwarf', 'others see the new look');
  a.close(); b.close(); await srv.stop();
});
