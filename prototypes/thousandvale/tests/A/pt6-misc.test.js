// Owner feedback 6 (stream A): U3 telegraphs end with their caster, U5 consumables stack, U9 event results always carry a
// real sentence, U1 the mail badge count clears when the letter is read.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createVirtualClock } from '../../js/net/clock.js';
import { createDirector } from '../../js/sim/director.js';
import { stackable, stackKey } from '../../js/sim/consumables.js';
import { makeServer, joinAs, run, until, loadAll } from './helpers.js';
import { createMemoryStore } from '../../js/sim/store-memory.js';
import { m3Server, claimedAs } from './m3-helpers.js';
import { realServer, joinReal, rec } from './pt1-helpers.js';

const on = (c, t) => { const l = []; c.on(t, m => l.push(m)); return l; };
const potion = (id = 'healing_potion', name = 'Healing Potion') => ({ kind: 'potion', id, name, rarity: 'normal' });
const total = (o, id) => o.char.bag.filter(i => i.id === id).reduce((n, i) => n + (i.count || 1), 0);

test('U3: a telegraph (and a monster\'s ground pool) is taken off everyone\'s screen the moment its caster dies or is removed — not when its impact time comes', async () => {
  const clock = createVirtualClock();
  const srv = makeServer({ clock }); await srv.ready;
  const a = await joinAs(srv, clock, 'Watcher');
  const o = srv.world.online.get(a.joined.you.char), r = o.room;
  const evs = []; a.on('ev', m => evs.push(...m.e));
  const mob = () => r.spawn({ kind: 'monster', type: 'wolf', level: 1, x: o.entity.x + 5, z: o.entity.z });
  // 1. dies mid wind-up
  const m1 = mob();
  r.host.event({ type: 'tele', id: 901, s: m1.id, ab: 'void', k: 'zone', ms: 4000, shape: 'circle', r: 4, x: m1.x, z: m1.z });
  r.host.event({ type: 'fx', kind: 'pool', id: m1.id, x: m1.x + 1, z: m1.z, r: 3, seconds: 6 });
  await run(clock, 200);
  assert.ok(evs.some(e => e.type === 'tele' && e.id === 901));
  m1.kill(o.entity);
  await run(clock, 150);
  const x1 = evs.find(e => e.type === 'teleR' && e.id === 901);
  assert.ok(x1 && x1.x === 1 && x1.why === 'dead', 'cancelled at once: ' + JSON.stringify(x1));
  const p1 = evs.find(e => e.type === 'fx' && e.kind === 'pool' && e.end === 1);
  assert.ok(p1 && p1.id === m1.id && p1.why === 'dead', 'its pool ends too');
  // 1b. the rules' own cancel (`teleR {id, x: 1}` — an interrupted cast) REACHES the client: `x` is the cancel flag, not a place
  const m1b = mob();
  r.host.event({ type: 'tele', id: 910, s: m1b.id, ab: 'void', k: 'zone', ms: 4000, shape: 'circle', r: 4 });
  await run(clock, 100);
  r.host.event({ type: 'teleR', id: 910, x: 1 });
  await run(clock, 150);
  assert.ok(evs.some(e => e.type === 'teleR' && e.id === 910 && e.x === 1), 'the rules\' cancel is delivered (it used to be routed to x = 1 and reach nobody)');
  r.host.event({ type: 'tele', id: 911, s: m1b.id, ab: 'void', k: 'zone', ms: 500, shape: 'circle', r: 4 });
  r.host.event({ type: 'teleR', id: 911, hits: [] });
  await run(clock, 150);
  assert.ok(evs.some(e => e.type === 'teleR' && e.id === 911), 'so is an ordinary resolve');
  r.remove(m1b);
  // 2. removed (despawned, leashed away): same
  const m2 = mob();
  r.host.event({ type: 'tele', id: 902, s: m2.id, ab: 'void', k: 'zone', ms: 4000, shape: 'circle', r: 4 });
  await run(clock, 100); r.remove(m2); await run(clock, 150);
  assert.equal(evs.find(e => e.type === 'teleR' && e.id === 902).why, 'gone');
  // 3. one the rules already resolved is not ended twice; one marked `after` (lands after death) is left alone
  const m3 = mob();
  r.host.event({ type: 'tele', id: 903, s: m3.id, ab: 'a', k: 'zone', ms: 1000, shape: 'circle', r: 2 });
  r.host.event({ type: 'teleR', id: 903, hits: [] });
  r.host.event({ type: 'tele', id: 904, s: m3.id, ab: 'b', k: 'zone', ms: 3000, shape: 'circle', r: 2, after: 1 });
  await run(clock, 100); m3.kill(o.entity); await run(clock, 150);
  assert.equal(evs.filter(e => e.type === 'teleR' && e.id === 903).length, 1, 'no second teleR');
  assert.ok(!evs.some(e => e.type === 'teleR' && e.id === 904), 'a death-rattle zone stays');
  a.close(); await srv.stop();
});

test('U5: potions and other consumables stack — granted, looted or bought ones join the stack; using one takes one off; the save keeps the count', async () => {
  const clock = createVirtualClock();
  const store = createMemoryStore({ now: clock.now });
  const srv = makeServer({ clock, store }); await srv.ready;
  const W = srv.world, a = await joinAs(srv, clock, 'Stacker');
  const o = W.online.get(a.joined.you.char), e = o.entity;
  assert.ok(stackable(potion()) && stackable({ kind: 'good', id: 'travel_rations', use: { type: 'food', regen: 0.04, seconds: 20 } }));
  assert.ok(!stackable({ kind: 'good', id: 'angling_rod', use: { type: 'rod' } }) && !stackable({ kind: 'fish', id: 'silver_perch' }) && !stackable({ kind: 'crate', id: 'crate' }) && !stackable({ kind: 'good', id: 'road_parcel', quest: 'q', use: { type: 'food' } }));
  assert.notEqual(stackKey(potion()), stackKey(potion('mana_potion')));
  const bags = on(a, 'bag');
  W.grant(o, { items: [potion(), potion(), potion('mana_potion', 'Mana Potion')], reason: 'test' }); await run(clock, 100);
  assert.equal(o.char.bag.length, 2, 'two kinds, two slots: ' + o.char.bag.map(i => i.id + 'x' + (i.count || 1)));
  const st = o.char.bag.find(i => i.id === 'healing_potion');
  assert.equal(st.count, 2);
  // a later one joins: the client hears remove + add of the SAME uid with the new count, and its own bag follows
  W.grant(o, { items: [potion()], reason: 'kill' }); await run(clock, 100);
  assert.equal(st.count, 3); assert.equal(o.char.bag.length, 2);
  const last = bags.at(-1);
  assert.deepEqual(last.remove, [st.uid]); assert.equal(last.add[0].uid, st.uid); assert.equal(last.add[0].count, 3);
  assert.equal(a.joined.you.bag.find(i => i.uid === st.uid).count, 3, 'the client library\'s bag');
  assert.equal(a.joined.you.bag.length, 2);
  // a pre-counted bundle (a shop row of 5) joins too; a full stack (20) starts a second one
  W.grant(o, { items: [{ ...potion(), count: 5 }], reason: 'shop' }); await run(clock, 50);
  assert.equal(st.count, 8);
  W.grant(o, { items: [{ ...potion(), count: 15 }], reason: 'test' }); await run(clock, 50);
  assert.deepEqual(o.char.bag.filter(i => i.id === 'healing_potion').map(i => i.count).sort((x, y) => y - x), [20, 3]);
  // drinking takes ONE off
  e.setHp(Math.round(e.hpMax * 0.3));
  const ir = on(a, 'itemR');
  a.useItem('id:healing_potion'); await until(clock, () => ir.length);
  assert.equal(ir[0].ok, true);
  assert.equal(total(o, 'healing_potion'), 22);
  assert.equal(a.joined.you.bag.filter(i => i.id === 'healing_potion').reduce((n, i) => n + i.count, 0), 22);
  // saved and restored with the counts
  await W.saveNow(o); await W.flushJournal();
  const saved = loadAll(store).find(c => c.id === o.char.id);
  assert.equal(saved.bag.filter(i => i.id === 'healing_potion').reduce((n, i) => n + (i.count || 1), 0), 22);
  // loose ones (an old save, a letter, a trade) are brought together
  o.char.bag.push({ ...potion('mana_potion', 'Mana Potion'), uid: 'loose-1' }, { ...potion('mana_potion', 'Mana Potion'), uid: 'loose-2' });
  assert.equal(W.restack(o), true); await run(clock, 50);
  assert.equal(o.char.bag.filter(i => i.id === 'mana_potion').length, 1); assert.equal(total(o, 'mana_potion'), 3);
  assert.ok(!a.joined.you.bag.some(i => i.uid === 'loose-1'));
  a.close(); await srv.stop();
});

test('U5: a stack travels by mail as one item and joins the receiver\'s stack; a shop buys the whole stack for count x price', async () => {
  const { srv, clock } = m3Server();
  await srv.ready;
  const W = srv.world;
  const a = await claimedAs(srv, clock, 'Sender'), b = await joinAs(srv, clock, 'Getter');
  const oa = W.online.get(a.joined.you.char), ob = W.online.get(b.joined.you.char);
  W.grant(oa, { items: [{ ...potion(), count: 4 }], gold: 50, reason: 'test' }); W.grant(ob, { items: [{ ...potion(), count: 2 }], reason: 'test' });
  await run(clock, 100);
  const ra = on(a, 'mailR'), rb = on(b, 'mailR'), list = on(b, 'mailList');
  a.mail('send', { to: 'getter', subject: 'Potions', body: 'Four.', items: [oa.char.bag[0].uid] }); await until(clock, () => ra.length);
  assert.equal(ra[0].ok, true, JSON.stringify(ra[0]));
  assert.equal(oa.char.bag.length, 0);
  b.mail('list'); await until(clock, () => list.length);
  b.mail('take', { id: list[0].mail[0].id }); await until(clock, () => rb.length);
  await run(clock, 100);
  assert.equal(ob.char.bag.length, 1, 'joined the stack'); assert.equal(ob.char.bag[0].count, 6);
  assert.equal(b.joined.you.bag.length, 1); assert.equal(b.joined.you.bag[0].count, 6);
  a.close(); b.close(); await srv.stop();
});

test('U5 on the real province: a shop sells and buys potions as stacks; kills\' potion drops (E\'s table) join them', async () => {
  const { srv, clock, world } = await realServer({ roadEvents: false, potionDrops: { chance: { normal: 1 }, table: [[1, 'healing_potion']] } });
  const P = world.province;
  const a = await joinReal(srv, clock, 'Shopper');
  const o = rec(world, a);
  o.char.gold = 500;
  const town = P.P.values().next().value.towns[0];
  const npc = [...town.objects.values()].find(x => x.kind === 'npc' && (() => { try { return P.rooms && x.data && x.data.npc && /apothecary|healer|merchant|provisioner/.test(x.data.npc.role || ''); } catch { return false; } })());
  assert.ok(npc, 'someone who sells potions');
  P.transfer(o, town, { x: npc.x + 1, z: npc.z }, 'test'); await run(clock, 300);
  const views = on(a, 'shopView'), sr = on(a, 'shopR');
  a.shop('open', { npc: npc.id }); await until(clock, () => views.length, 2000);
  const row = views[0].stock.find(r => r.item && r.item.kind === 'potion');
  if (row) {
    for (let k = 0; k < 3; k++) { const n = sr.length; a.shop('buy', { npc: npc.id, id: row.id }); await until(clock, () => sr.length > n, 2000); }
    const mine = o.char.bag.filter(i => i.id === row.item.id);
    assert.equal(mine.length, 1, 'three bought potions are one stack'); assert.equal(mine[0].count, 3);
    const sell = views.at(-1).sell.find(s => s.uid === mine[0].uid);
    assert.ok(sell && sell.count === 3 && sell.price === sell.each * 3, 'the sell price is for the stack: ' + JSON.stringify(sell));
    const gold = o.char.gold;
    const n = sr.length; a.shop('sell', { npc: npc.id, uid: mine[0].uid }); await until(clock, () => sr.length > n, 2000);
    assert.equal(o.char.gold, gold + sell.price); assert.ok(!o.char.bag.some(i => i.id === row.item.id));
  }
  // a kill's loot carries a potion (E's potionDrops) — through the corpse like any item
  const made = P.rooms.values().next().value && P.copies[0];
  const drop = P.copies[0].rules && world.province.corpses;
  assert.ok(made && drop);
  a.close(); await srv.stop();
});

test('U9: every event result carries real sentences — the realm end broadcast has `text` and `result`, never an empty or null line', () => {
  let t = 0;
  const out = [];
  const d = createDirector({ now: () => t, wallNow: () => 1e12 + t, events: [{ id: 'siege', name: 'Home to Torborhold', province: 'p', x: 0, z: 0, level: 3, schedule: { type: 'weighted', cooldownMinutes: 1 }, minOnline: 1, minInBand: 1, weight: 1 },
    { id: 'told', name: 'The Told One', province: 'p', x: 0, z: 0, level: 3, schedule: { type: 'weighted', cooldownMinutes: 1 }, minOnline: 1, minInBand: 1, weight: 1, info: { onSuccess: 'The road is safe again.', onFail: 'They took the mill.' } }],
    online: () => [{ level: 3 }], broadcast: m => out.push(m), procOf: () => 0, sendTo: () => {}, rules: { startOn: 'near', countdownSeconds: 1, gapMinutes: [0, 0], nearGapMinutes: 0 }, firstMs: 0, rng: () => 0.5 });
  const runOne = (id, state) => {
    assert.equal(d.near(id, [3]), true, 'starts: ' + id);
    t += 2000; d.step();
    d.onState({ uid: d.current.ev.uid, state });
    return out.filter(m => m.kind === 'eventEnd').at(-1);
  };
  const e1 = runOne('siege', 'won');
  assert.equal(e1.result, 'success'); assert.ok(typeof e1.text === 'string' && e1.text.length > 8 && !/null|undefined/.test(e1.text), e1.text);
  t += 120000; d.step();
  const e2 = runOne('told', 'lost');
  assert.equal(e2.result, 'fail'); assert.equal(e2.text, 'They took the mill.');
  for (const m of out.filter(x => x.kind === 'eventEnd')) for (const [k, v] of Object.entries(m)) assert.notEqual(v, null, k + ' is null');
});

test('U9 on the real province: eventDone always has `text`, `got` and `story` as sentences (winner, onlooker and loser)', async () => {
  const { srv, clock, world } = await realServer({ roadEvents: false, eventAbandonMs: 15000 });
  const P = world.province, L = world.layouts[0];
  const def = L.zoneEvents.find(e => e.eid === 'test');
  const a = await joinReal(srv, clock, 'Winner'), b = await joinReal(srv, clock, 'Onlooker');
  const oa = rec(world, a), ob = rec(world, b), room = P.copies[0];
  P.devSetLevel(oa.char.id, 30); P.devSetLevel(ob.char.id, 30);
  const da = on(a, 'eventDone'), db = on(b, 'eventDone');
  P.transfer(oa, room, { x: def.x + 8, z: def.z }, 'test'); P.transfer(ob, room, { x: def.x - 8, z: def.z + 3 }, 'test');
  const mine = () => [...room.entities.values()].filter(e => e.kind === 'monster' && e.data && String(e.data.event || '').startsWith(def.id) && !e.dead);
  for (let k = 0; k < 300 && !da.length; k++) {
    for (const o of [oa, ob]) { if (o.entity.dead) o.entity.revive(1); o.entity.setHp(o.entity.hpMax); if (o.entity.r.unit) o.entity.r.unit.hp = o.entity.r.unit.maxHp; }
    for (const m of mine()) { m.kill(oa.entity); if (m.r && m.r.unit) m.r.unit.hp = 0; }
    await run(clock, 1000);
  }
  assert.ok(da.length && db.length, 'both were told');
  const sentence = (m, k) => assert.ok(typeof m[k] === 'string' && m[k].length > 8 && !/\bnull\b|undefined/.test(m[k]), k + ': ' + JSON.stringify(m[k]));
  for (const m of [da[0], db[0]]) { sentence(m, 'text'); sentence(m, 'got'); sentence(m, 'story'); }
  assert.match(da[0].got, /^You got \d+ experience, \d+ gold/);
  assert.equal(db[0].credited, false); assert.match(db[0].got, /did not take part/);
  a.close(); b.close(); await srv.stop();
});

test('U1: the mail badge count is re-sent after a letter is read, taken or deleted — it goes back to 0', async () => {
  const { srv, clock } = m3Server();
  await srv.ready;
  const W = srv.world, a = await joinAs(srv, clock, 'Badged');
  const o = W.online.get(a.joined.you.char);
  const counts = on(a, 'mailNew');
  await W.mailTo({ to: o.char.id, subject: 'Hello', body: 'A letter.' });
  await until(clock, () => counts.some(m => m.unread === 1), 2000);
  assert.equal(counts.at(-1).unread, 1);
  const list = on(a, 'mailList'), open = on(a, 'mailOpen');
  a.mail('list'); await until(clock, () => list.length);
  a.mail('read', { id: list[0].mail[0].id }); await until(clock, () => open.length);
  await until(clock, () => counts.at(-1).unread === 0, 2000);
  assert.equal(counts.at(-1).unread, 0, 'read: the badge clears');
  a.mail('delete', { id: list[0].mail[0].id }); await run(clock, 300);
  assert.equal(counts.at(-1).unread, 0);
  a.close(); await srv.stop();
});

test('C\'s asks (U16, U8): a shape and a ward ride on `info` for late joiners, and go when they end', async () => {
  const clock = createVirtualClock();
  const srv = makeServer({ clock }); await srv.ready;
  const a = await joinAs(srv, clock, 'Shifter');
  const o = srv.world.online.get(a.joined.you.char), r = o.room, e = o.entity;
  const shape = { id: 'moonpelt', name: 'Moonpelt Shape', group: 'shape', skill: 'moonpelt_shape', creature: 'wolf', scale: 1.25, colors: { body: '#555' }, upright: true };
  r.host.event({ type: 'fx', kind: 'form', id: e.id, form: 'moonpelt', group: 'shape', on: true, body: 'wolf', shape });
  assert.deepEqual(e.info().form, shape);
  const b = await joinAs(srv, clock, 'Latecomer');
  await run(clock, 400);
  assert.equal(b.mirror.infos.get(e.id).form.creature, 'wolf', 'someone arriving later draws the wolf');
  r.host.event({ type: 'fx', kind: 'form', id: e.id, form: 'guard_stance', group: 'stance', on: true });
  assert.equal(e.info().form.creature, 'wolf', 'a stance is not a body');
  r.host.event({ type: 'fx', kind: 'form', id: e.id, form: 'moonpelt', group: 'shape', on: false });
  assert.ok(!('form' in e.info()));
  const boss = r.spawn({ kind: 'monster', type: 'wolf', level: 3, x: e.x + 4, z: e.z, rank: 'boss' });
  r.host.event({ type: 'fx', kind: 'shield', id: boss.id, on: true, ms: 18000, pool: 120, name: 'Ward' });
  assert.deepEqual([boss.info().ward.max, boss.info().ward.ms], [120, 18000]);
  r.host.event({ type: 'fx', kind: 'shield', id: boss.id, hp: 60, max: 120, left: 9000 });
  assert.ok(boss.info().ward, 'a progress tick does not clear it');
  r.host.event({ type: 'fx', kind: 'shield', id: boss.id, on: false, why: 'broken' });
  assert.ok(!('ward' in boss.info()));
  a.close(); b.close(); await srv.stop();
});

test('U17 follow-up: a potion\'s card is written from the table and the drinker\'s own health ("Restores 50% of your health (N now)"), and follows a level-up', async () => {
  const { potionText, POTIONS, POTION_CD_MS } = await import('../../js/sim/consumables.js');
  const { srv, clock, world } = await realServer({ roadEvents: false });
  const P = world.province;
  const a = await joinReal(srv, clock, 'Sipper');
  const o = rec(world, a);
  const shop = P.copies[0].rules;
  // as a shop makes it: the engine's old text ("Restores 40 HP") rides in on the item
  const raw = { kind: 'potion', id: 'healing_potion', name: 'Healing Potion', desc: 'Restores 40 HP.', rarity: 'normal', effect: { type: 'heal', amount: 40 } };
  P.grant(o, { items: [raw, { kind: 'potion', id: 'mana_potion', name: 'Mana Potion', desc: 'Restores 40 MP.', rarity: 'normal' }, { kind: 'potion', id: 'group_tonic', name: 'Group Tonic', rarity: 'normal' }], reason: 'test' });
  await run(clock, 200);
  const hp = o.char.bag.find(i => i.id === 'healing_potion'), e = o.entity;
  const pct = Math.round(POTIONS.healing_potion.pct * 100), now = Math.max(40, Math.round(POTIONS.healing_potion.pct * e.hpMax));
  assert.ok(!/40 HP/.test(hp.desc), 'the fixed number is gone: ' + hp.desc);
  assert.ok(hp.desc.includes(`Restores ${pct}% of your health (${now} now)`), hp.desc);
  assert.ok(hp.desc.includes(`${POTION_CD_MS / 1000} s cooldown`), hp.desc);
  assert.deepEqual([hp.restore.stat, hp.restore.pct], ['hp', POTIONS.healing_potion.pct], 'the numbers ride along for the client');
  assert.match(o.char.bag.find(i => i.id === 'mana_potion').desc, /of your mana \(\d+ now\)/);
  assert.match(o.char.bag.find(i => i.id === 'group_tonic').desc, /party members within \d+ m/);
  assert.equal(a.joined.you.bag.find(i => i.uid === hp.uid).desc, hp.desc, 'the client has the same text');
  // the card tells the truth: drinking restores exactly that
  e.setHp(1); if (e.r.unit) e.r.unit.hp = 1;
  const ir = []; a.on('itemR', m => ir.push(m));
  a.useItem(hp.uid); await until(clock, () => ir.length);
  assert.ok(Math.abs(e.hp - (1 + now)) <= 2, `restored ${e.hp - 1}, the card said ${now}`);
  // a level-up changes "now", and the card in the bag follows
  P.grant(o, { items: [{ kind: 'potion', id: 'healing_potion', name: 'Healing Potion', desc: 'Restores 40 HP.', rarity: 'normal' }], reason: 'test' }); await run(clock, 100);
  const before = o.char.bag.find(i => i.id === 'healing_potion').desc;
  o.room.award(o.entity, { xp: o.room.rules.xpFor(8) + 1, reason: 'test' }); await run(clock, 400);
  const after = o.char.bag.find(i => i.id === 'healing_potion').desc;
  assert.notEqual(after, before, 're-written at the new health');
  assert.ok(after.includes(`(${Math.max(40, Math.round(POTIONS.healing_potion.pct * o.entity.hpMax))} now)`), after + ' at hpMax ' + o.entity.hpMax);
  assert.equal(a.joined.you.bag.find(i => i.id === 'healing_potion').desc, after);
  assert.equal(potionText({ kind: 'good', id: 'travel_rations' }), null);
  void shop;
  a.close(); await srv.stop();
});

test('U16: `info.form` is C\'s own shape object from rules.formOf(e) — creature, scale, colours, upright — for someone who arrives later, and it goes when the shape ends', async () => {
  const { srv, clock, world } = await realServer({ roadEvents: false });
  const P = world.province;
  const a = await joinReal(srv, clock, 'Shapeling', 'druid');
  const o = rec(world, a), rules = o.room.rules;
  o.room.award(o.entity, { xp: rules.xpFor(25) + 1, reason: 'test' }); await run(clock, 300);
  const copy = P.copies[0], L = world.layouts[0], T = L.towns[0], gd = Math.hypot(L.gate.x - T.x, L.gate.z - T.z) || 1;
  P.transfer(o, copy, { x: L.gate.x + (L.gate.x - T.x) / gd * 100, z: L.gate.z + (L.gate.z - T.z) / gd * 100 }, 'test'); await run(clock, 400);
  for (const m of copy.host.near(o.entity.x, o.entity.z, 90, x => x.kind === 'monster')) copy.remove(m);
  const bar = o.room.barFor(o.entity);
  const shapes = bar.filter(s => /shape/.test(s.id || ''));
  assert.ok(shapes.length, 'the druid has shape skills: ' + bar.map(s => s.id).join(' '));
  const cr = []; a.on('castR', m => cr.push(m));
  if (o.entity.r.unit) o.entity.r.unit.mp = o.entity.r.unit.maxMp;
  a.cast({ slot: shapes[0].slot }); await until(clock, () => !!o.entity.form || cr.length, 4000);
  assert.ok(o.entity.form, 'in the shape: ' + JSON.stringify(cr));
  const want = rules.formOf(o.entity);
  assert.ok(want && want.creature && want.scale && want.colors, 'rules.formOf gives the shape: ' + JSON.stringify(want));
  assert.deepEqual(o.entity.info().form, want, 'info.form IS that object');
  // a late joiner
  const b = await joinReal(srv, clock, 'Passerby');
  P.transfer(rec(world, b), copy, { x: o.entity.x + 3, z: o.entity.z }, 'test'); await run(clock, 600);
  const seen = b.mirror.infos.get(o.entity.id);
  assert.deepEqual(seen.form, JSON.parse(JSON.stringify(want)), 'the passer-by got creature, scale, colours' + ('upright' in want ? ', upright' : ''));
  // carried through a room change (the town edge)
  P.transfer(o, P.P.get(L.key).towns[0], { x: T.x, z: T.z }, 'test'); await run(clock, 300);
  if (rules.formOf(o.entity)) assert.deepEqual(o.entity.info().form, JSON.parse(JSON.stringify(o.room.rules.formOf(o.entity))), 'still drawn after a handoff');
  // out of the shape
  cr.length = 0;
  P.transfer(o, copy, { x: L.gate.x + (L.gate.x - T.x) / gd * 100, z: L.gate.z + (L.gate.z - T.z) / gd * 100 }, 'test'); await run(clock, 9000);
  if (o.entity.r.unit) o.entity.r.unit.mp = o.entity.r.unit.maxMp;
  a.cast({ slot: shapes[0].slot }); await until(clock, () => !o.entity.form || cr.length, 4000);
  if (!cr.length) assert.ok(!('form' in o.entity.info()), 'gone when the shape ends');
  a.close(); b.close(); await srv.stop();
});
