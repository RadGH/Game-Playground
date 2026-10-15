// Owner feedback 8 on the REAL rules — W19 (report #40): a backpack on the back gives bonus bag slots; it cannot come off
// (or be swapped for a smaller one / a cloak) while those slots hold things, and the refusal says why and how many.
// W22 (report #43): lanterns and torches left the game — what a character owns is paid back at entry, the `light` slot
// leaves the save, and nothing is lost.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as rulesIndex from '../../js/rules/index.js';
import { realServer, joinReal, rec, run, until, waitP } from './pt1-helpers.js';
import { makeClient } from './helpers.js';
import { memoryTokenStore } from '../../js/net/client.js';
import { economy } from '../../js/sim/economy-knobs.js';
import { BAG_MAX } from '../../js/sim/province.js';
import { tabCounts } from '../../js/sim/bag-tabs.js';

const box = (c, types) => { const b = []; for (const t of types) c.on(t, m => b.push({ ...m, t })); return b; };
const junk = n => Array.from({ length: n }, (_, i) => ({ name: 'Pebble ' + i, rarity: 'normal', kind: 'junk', value: 1 }));

test('W19: capacity = base + the pack\'s slots; the pack will not come off while its extra room is in use', async () => {
  const { srv, clock, world } = await realServer();
  const a = await joinReal(srv, clock, 'Packer', 'warrior');
  const o = rec(world, a), e = o.entity, rules = o.room.rules;
  const base = economy().bag.base;
  assert.ok(base >= 24 && base < BAG_MAX, 'a base under the ceiling: ' + base);
  assert.equal(a.joined.you.bagMax, base, 'no pack: the base');
  const got = box(a, ['itemR', 'you', 'err', 'sheet']);
  // a real backpack out of C's rules
  const pack = rules.makeItem(e, { base: 'trail_rucksack', rarity: 'normal', level: 10 });
  assert.ok(pack && pack.slot === 'back' && pack.bagSlots > 0, 'C makes a pack with bag slots: ' + JSON.stringify(pack).slice(0, 200));
  const small = rules.makeItem(e, { base: 'sling_satchel', rarity: 'normal', level: 1 });
  assert.ok(small.bagSlots < pack.bagSlots);
  world.grant(o, { items: [pack, small], gold: 0, reason: 'test' }); await run(clock, 100);
  const mine = uid => o.char.bag.find(i => i.name === uid.name && i.bagSlots === uid.bagSlots);
  a.item('equip', mine(pack).uid); await run(clock, 300);
  assert.equal(got.filter(m => m.t === 'itemR').at(-1).ok, true, JSON.stringify(got.filter(m => m.t === 'itemR').at(-1)));
  assert.equal(got.filter(m => m.t === 'you' && m.bagMax).at(-1).bagMax, base + pack.bagSlots, 'the client is told the new size');
  // fill the Items tab to the brim (round 11, #11: Equipment and Items are counted on their own; the satchel is in Equipment)
  const items = () => tabCounts(o.char.bag).items;
  world.grant(o, { items: junk(base + pack.bagSlots - items()), gold: 0, reason: 'test' }); await run(clock, 100);
  assert.equal(items(), base + pack.bagSlots, 'every Items square used');
  const g0 = o.char.gold;
  world.grant(o, { items: junk(1), gold: 0, reason: 'test' }); await run(clock, 100);
  assert.equal(items(), base + pack.bagSlots, 'one more does not fit');
  // round 11 (Market stream, owner #25): it is posted to you, never turned into gold
  assert.equal(o.char.gold, g0, 'not paid in gold any more');
  assert.ok(world.counters.bagPosted >= 1, 'it went to the post');
  // take the pack off: refused, with the number (the pack itself goes into Equipment, which has room)
  const eqUid = (() => { const u = e.r && e.r.unit && e.r.unit.equipment && e.r.unit.equipment.back; return u ? u.uid : (o.char.equipment.back || {}).uid; })();
  a.item('unequip', eqUid, 'back'); await run(clock, 300);
  let r = got.filter(m => m.t === 'itemR').at(-1);
  assert.equal(r.ok, false); assert.equal(r.why, 'bagSlots'); assert.equal(r.need, pack.bagSlots, 'the Items tab is over by the pack\'s squares');
  assert.match(r.msg, new RegExp('^Empty ' + pack.bagSlots + ' more bag slot'));
  // swap to the SMALLER pack: refused by the difference
  a.item('equip', mine(small).uid); await run(clock, 300);
  r = got.filter(m => m.t === 'itemR').at(-1);
  assert.equal(r.ok, false); assert.equal(r.why, 'bagSlots'); assert.equal(r.need, pack.bagSlots - small.bagSlots);
  // empty enough, and it comes off
  for (let k = 0; k < pack.bagSlots; k++) { const it = o.char.bag.find(i => i.kind === 'junk'); a.item('destroy', it.uid); await run(clock, 250); }
  assert.equal(items(), base);
  const gear0 = tabCounts(o.char.bag).gear;
  a.item('unequip', eqUid, 'back'); await run(clock, 300);
  assert.equal(tabCounts(o.char.bag).gear, gear0 + 1, 'the pack is in the bag; Items is exactly full');
  assert.equal(got.filter(m => m.t === 'you' && m.bagMax).at(-1).bagMax, base);
  a.close(); await srv.stop();
});

test('W22: lanterns and torches in the bag are paid back at entry (C\'s list price), the light slot leaves the save, a letter says so', async () => {
  assert.equal(typeof rulesIndex.isLightItem, 'function'); assert.equal(typeof rulesIndex.lightRefund, 'function');
  const lightItems = { is: rulesIndex.isLightItem, refund: rulesIndex.lightRefund };
  const { srv, clock, world } = await realServer({ lightItems });
  const tokens = memoryTokenStore();
  const a = makeClient(srv, clock, { tokenStore: tokens });
  await waitP(clock, a.ready);
  const ch = await waitP(clock, a.createChar({ name: 'Lamplit', cls: 'warrior' }));
  await waitP(clock, a.play(ch.id));
  const o = rec(world, a), id = o.char.id;
  // an old save: a lantern and a bundle of torches in the bag, a lantern worn in the light slot
  const lantern = { uid: 'old-lantern-1', name: 'Hand Lantern', base: 'hand_lantern', slot: 'light', rarity: 'normal', level: 3, value: 12 };
  const torches = { uid: 'old-torch-1', name: 'Bundle of Torches', id: 'torch_bundle', kind: 'good', use: { type: 'light' }, n: 3, value: 2 };
  const sword = { uid: 'old-sword-1', name: 'Plain Sword', slot: 'weapon', rarity: 'normal', value: 5 };
  assert.ok(rulesIndex.isLightItem(lantern) && rulesIndex.isLightItem(torches) && !rulesIndex.isLightItem(sword), 'C knows which are lights');
  const want = rulesIndex.lightRefund(lantern) + rulesIndex.lightRefund(torches);
  assert.ok(want > 0, 'they are worth something: ' + want);
  o.char.bag.push(lantern, torches, sword);
  const gold0 = o.char.gold || 0;
  await world.saveNow(o); await world.flushJournal();
  a.close(); await until(clock, () => !world.online.has(id), 5000);
  // the same account logs in again
  const b = makeClient(srv, clock, { tokenStore: tokens });
  const chat = [], mailNew = [];
  b.on('chat', m => chat.push(m)); b.on('mailNew', m => mailNew.push(m));
  await waitP(clock, b.ready);
  const j = await waitP(clock, b.play(id));
  await run(clock, 500);
  const o2 = rec(world, b);
  assert.ok(!o2.char.bag.some(i => i.uid === 'old-lantern-1' || i.uid === 'old-torch-1'), 'the lights are gone from the bag');
  assert.ok(o2.char.bag.some(i => i.uid === 'old-sword-1'), 'nothing else was touched');
  assert.ok(!j.you.bag.some(i => i.uid === 'old-lantern-1'), 'and the client never sees them');
  assert.equal(o2.char.gold, gold0 + want, 'paid C\'s list price for both: ' + want);
  assert.equal(j.you.gold, gold0 + want);
  assert.ok(chat.some(m => m.ch === 'system' && /Lanterns and torches were removed/.test(m.text) && m.text.includes(want + ' gold')), 'told in plain words: ' + JSON.stringify(chat.slice(-2)));
  await until(clock, () => mailNew.length);
  assert.equal(o2.char.flags.lightRefund, want);
  // a second login pays nothing more
  await world.saveNow(o2); await world.flushJournal();
  b.close(); await until(clock, () => !world.online.has(id), 5000);
  const c = makeClient(srv, clock, { tokenStore: tokens });
  await waitP(clock, c.ready); await waitP(clock, c.play(id)); await run(clock, 300);
  assert.equal(rec(world, c).char.gold, gold0 + want, 'once');
  // one that arrives later (the post, a trade) is swept within a few seconds, live
  const o3 = rec(world, c), bag = [];
  c.on('bag', m => bag.push(m));
  o3.char.bag.push({ ...lantern, uid: 'late-lantern' });
  await run(clock, 6000);
  assert.ok(!o3.char.bag.some(i => i.uid === 'late-lantern'), 'a late one goes too');
  assert.ok(bag.some(m => (m.remove || []).includes('late-lantern')), 'and the client is told');
  assert.equal(o3.char.gold, gold0 + want + rulesIndex.lightRefund(lantern));
  // the worn slot of an old save does not survive an entry
  o3.char.equipment = { ...(o3.char.equipment || {}), light: { ...lantern, uid: 'worn-lantern' } };
  await world.saveNow(o3); await world.flushJournal();
  c.close(); await until(clock, () => !world.online.has(id), 5000);
  const d = makeClient(srv, clock, { tokenStore: tokens });
  await waitP(clock, d.ready); const j4 = await waitP(clock, d.play(id)); await run(clock, 300);
  assert.ok(!rec(world, d).char.equipment.light, 'no light slot in the character');
  assert.ok(!j4.you.equipment.light, 'nor in what the client is sent');
  assert.ok(rec(world, d).char.gold >= gold0 + want + rulesIndex.lightRefund(lantern), 'and a worn one is never taken for nothing');
  d.close(); await srv.stop();
});
