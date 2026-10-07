// Play-test 1, P22 (stream A): "start with basic gear: no armour = basic shorts + top; the full class outfit only as
// a preview; equipped gear must be visible". A new character keeps its class weapon (and off-hand) and nothing else;
// what a player wears is on its `info` (`gear`) for everyone to draw, and changes when gear changes; the rule runs
// once (kitV saved), and survives a reload.
import test from 'node:test';
import assert from 'node:assert/strict';
import { realServer, joinReal, rec, run, until } from './pt1-helpers.js';
import { loadAll } from './helpers.js';

test('P22: a new warrior wears only the longsword (+ shield); gear is on info and follows equip changes', async () => {
  const { srv, clock, world, store } = await realServer();
  const a = await joinReal(srv, clock, 'Plainclothes', 'warrior');
  const eq = a.joined.you.equipment;
  const slots = Object.keys(eq).filter(k => eq[k]);
  assert.ok(slots.includes('weapon'), 'keeps the class weapon');
  assert.deepEqual(slots.filter(s => !['weapon', 'offhand'].includes(s)), [], 'no armour on day one: ' + slots.join(','));
  const o = rec(world, a);
  assert.ok(o.char.kitV >= 1, 'the kit rule is recorded');
  assert.equal((o.char.bag || []).length, 0, 'the plate was not dumped in the bag');
  // others see what I wear
  const b = await joinReal(srv, clock, 'Onlooker', 'mage');
  world.transfer(rec(world, b), o.room, { x: o.entity.x + 2, z: o.entity.z }, 'test');
  await run(clock, 500);
  const seen = b.mirror.infos.get(o.entity.id);
  assert.ok(seen && seen.gear && seen.gear.weapon && seen.gear.weapon.base === 'longsword', 'gear on info: ' + JSON.stringify(seen && seen.gear));
  assert.ok(!seen.gear.chest, 'no chest piece drawn');
  // take the weapon off: everyone's info changes
  a.item('unequip', eq.weapon.uid, 'weapon');
  await until(clock, () => { const i = b.mirror.infos.get(o.entity.id); return i && i.gear && !i.gear.weapon; }, 3000);
  assert.ok(!b.mirror.infos.get(o.entity.id).gear.weapon, 'the onlooker saw the sword go');
  // the save: the rule is recorded (a reload never re-strips or hands out a fresh class kit)
  const charId = a.joined.you.char;
  a.close(); b.close();
  await run(clock, 3000);
  const saved = loadAll(store).find(c => c.id === charId);
  assert.ok(saved.kitV >= 1);
  assert.ok(!saved.equipment.chest && !(saved.equipment.equipment && saved.equipment.equipment.chest), 'no armour saved');
  await srv.stop();
});
