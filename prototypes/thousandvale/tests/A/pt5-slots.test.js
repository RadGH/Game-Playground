// Play-test 5 (stream A) — stream C's slots addendum: `back` (a cloak), `waist` (a belt), `light` (a worn lantern / torch).
// They are equipped and taken off like any piece, saved and restored, drawn by others (`info.gear`), and travel through
// mail and crates like any item.
import test from 'node:test';
import assert from 'node:assert/strict';
import { slotFits, crateItem, openCrate } from '../../js/sim/crates.js';
import { realServer, joinReal, rec, run, until } from './pt1-helpers.js';
import { loadAll, makeClient } from './helpers.js';
import { memoryTokenStore } from '../../js/net/client.js';
import { waitP } from './pt1-helpers.js';

const on = (c, t) => { const l = []; c.on(t, m => l.push(m)); return l; };
const BASES = { back: 'travel_cloak', waist: 'leather_belt', light: 'hand_lantern' };

test('back / waist / light: equip into their own slots, others see them on info.gear, unequip by slot, save + reload keeps them worn, mail carries them', async () => {
  const { srv, clock, world, store } = await realServer({ roadEvents: false });
  const P = world.province;
  // a client whose login token we keep, so the same account can come back
  const tokens = memoryTokenStore();
  const a = makeClient(srv, clock, { tokenStore: tokens });
  await waitP(clock, a.ready);
  const made = await waitP(clock, a.createChar({ name: 'Cloaked', cls: 'warrior' }));
  await waitP(clock, a.play(made.id)); await until(clock, () => !!a.joined, 5000);
  const b = await joinReal(srv, clock, 'Watcher', 'mage');
  const o = rec(world, a), ob = rec(world, b), rules = o.room.rules;
  assert.ok(Array.isArray(rules.SLOTS) && ['back', 'waist', 'light'].every(s => rules.SLOTS.includes(s)), 'the rules know the slots: ' + rules.SLOTS);
  const items = Object.entries(BASES).map(([slot, base]) => { const it = rules.makeItem(o.entity, { base, rarity: 'magic', level: 1 }); assert.ok(it && it.slot === slot, base + ' is a ' + slot + ' item: ' + JSON.stringify(it && it.slot)); return JSON.parse(JSON.stringify(it)); });
  P.grant(o, { items, reason: 'test' }); await run(clock, 200);
  const ir = on(a, 'itemR'), eqs = on(a, 'equip');
  for (const slot of Object.keys(BASES)) {
    const it = o.char.bag.find(i => i.slot === slot);
    a.item('equip', it.uid); await until(clock, () => ir.some(m => m.uid === it.uid), 2000);
    const r = ir.find(m => m.uid === it.uid);
    assert.equal(r.ok, true, slot + ': ' + JSON.stringify(r)); assert.equal(r.slot, slot);
  }
  const eq = eqs.at(-1).equipment;
  for (const slot of Object.keys(BASES)) assert.ok(eq[slot] && eq[slot].uid, slot + ' is worn');
  // others draw it
  P.transfer(ob, o.room, { x: o.entity.x + 2, z: o.entity.z }, 'test'); await run(clock, 600);
  const seen = b.mirror.infos.get(o.entity.id);
  for (const [slot, base] of Object.entries(BASES)) assert.ok(seen.gear[slot] && seen.gear[slot].base === base && seen.gear[slot].rarity, 'info.gear.' + slot + ': ' + JSON.stringify(seen.gear[slot]));
  // a catalog piece carries its model id
  const cat = rules.makeItem(o.entity, { base: 'g5_swallowtail', rarity: 'normal', level: 20 });
  if (cat) { assert.equal(cat.slot, 'back'); assert.ok(cat.g5 || (cat.look && cat.look.g5), 'a catalog cloak names its model'); }
  // saved and restored: log out, come back, still worn
  const charId = o.char.id;
  await P.saveNow(o); await P.flushJournal();
  const saved = loadAll(store).find(c => c.id === charId);
  const savedEq = saved.equipment.equipment || saved.equipment;
  for (const slot of Object.keys(BASES)) assert.ok(savedEq[slot], 'saved: ' + slot + ' in ' + Object.keys(savedEq));
  a.close(); await run(clock, 3000);
  assert.ok(!world.online.get(charId), 'logged out');
  const a2 = makeClient(srv, clock, { tokenStore: tokens });
  await waitP(clock, a2.ready);
  await waitP(clock, a2.play(charId)); await until(clock, () => !!a2.joined, 5000);
  const eq2 = a2.joined.you.equipment;
  for (const slot of Object.keys(BASES)) assert.ok(eq2[slot] && eq2[slot].uid === eq[slot].uid, 'restored on the way back in: ' + slot);
  const o2 = rec(world, a2);
  for (const slot of Object.keys(BASES)) assert.ok(o2.entity.gear[slot], 'and drawn again: ' + slot);
  a2.close();
  b.close(); await srv.stop();
});

test('back / waist / light: unequip by slot puts the piece in the bag and off info.gear; it posts by mail; a crate of that slot holds one', async () => {
  const { srv, clock, world } = await realServer({ roadEvents: false });
  const P = world.province;
  const a = await joinReal(srv, clock, 'Beltless', 'warrior');
  const o = rec(world, a), rules = o.room.rules;
  const belt = JSON.parse(JSON.stringify(rules.makeItem(o.entity, { base: 'leather_belt', rarity: 'normal', level: 1 })));
  P.grant(o, { items: [belt], reason: 'test' }); await run(clock, 200);
  const it = o.char.bag.find(i => i.slot === 'waist');
  const eqs = on(a, 'equip');
  a.item('equip', it.uid); await until(clock, () => eqs.length);
  assert.ok(o.entity.gear.waist, 'drawn');
  a.item('unequip', it.uid, 'waist'); await until(clock, () => eqs.length >= 2);
  assert.equal(eqs[1].slot, 'waist'); assert.equal(eqs[1].item, null);
  assert.ok(!eqs[1].equipment.waist && o.char.bag.some(i => i.uid === it.uid), 'back in the bag');
  assert.ok(!o.entity.gear.waist, 'no longer drawn');
  // by letter (the system post: the same escrow as any letter)
  const r = await P.mailTo({ to: o.char.id, subject: 'A cloak', body: 'Keep warm.', items: [rules.makeItem(o.entity, { base: 'travel_cloak', rarity: 'normal', level: 1 })] });
  assert.equal(r.ok, true);
  const list = on(a, 'mailList'), mr = on(a, 'mailR');
  a.mail('list'); await until(clock, () => list.length);
  a.mail('take', { id: list[0].mail[0].id }); await until(clock, () => mr.length);
  assert.equal(mr[0].ok, true);
  const cloak = o.char.bag.find(i => i.slot === 'back');
  assert.ok(cloak, 'the cloak arrived');
  a.item('equip', cloak.uid); await until(clock, () => eqs.length >= 3);
  assert.ok(eqs[2].equipment.back, 'and is worn');
  // crates
  for (const slot of ['back', 'waist', 'light']) {
    const [got] = openCrate(rules, o.entity, crateItem({ slot, min: 'common' }));
    assert.ok(got && slotFits(got, slot), `a ${slot} crate gave ${got && got.name} (${got && got.slot})`);
  }
  assert.ok(slotFits({ slot: 'back' }, 'jewellery') && slotFits({ slot: 'light' }, 'any'));
  a.close(); await srv.stop();
});
