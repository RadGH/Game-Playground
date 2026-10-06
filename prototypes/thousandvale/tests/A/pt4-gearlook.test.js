// Play-test 4 S15 (stream A side): dual-wielded wands — the off-hand wand is on the wearer's `info.gear.offhand`, so
// the client (D-world) can draw the second wand. Real rules, a sorcerer with two wands.
import test from 'node:test';
import assert from 'node:assert/strict';
import { realServer, joinReal, rec, run } from './pt1-helpers.js';
import { rulesEngine } from '../../js/rules/index.js';

test('S15: a second wand in the off hand rides on info.gear.offhand (base wand), seen by others', async () => {
  const { srv, clock, world } = await realServer();
  const a = await joinReal(srv, clock, 'Twowands', 'sorcerer'), b = await joinReal(srv, clock, 'Looker', 'warrior');
  const o = rec(world, a);
  world.transfer(rec(world, b), o.room, { x: o.entity.x + 2, z: o.entity.z }, 'test'); await run(clock, 300);
  const eng = rulesEngine(), rng = o.room.rules.room.streams.get('loot');
  const wand = () => { for (let k = 0; k < 60; k++) { const it = eng.rpg.rollDrop({ level: 3, rng, chance: 1, bases: ['wand'] }); if (it && /wand/.test(it.baseKey || '')) return it; } return null; };
  world.grant(o, { items: [wand(), wand()], gold: 0, reason: 'test' }); await run(clock, 200);
  const [w1, w2] = o.char.bag.slice(-2);
  a.item('equip', w1.uid, 'weapon'); await run(clock, 200);
  a.item('equip', w2.uid, 'offhand'); await run(clock, 300);
  const g = o.entity.info().gear || {};
  assert.equal(g.offhand && g.offhand.base, 'wand', 'off hand: ' + JSON.stringify(g));
  assert.equal(g.weapon && g.weapon.base, 'wand');
  assert.equal(b.mirror.infos.get(o.entity.id).gear.offhand.base, 'wand', 'the other player sees it');
  a.close(); b.close(); await srv.stop();
});

test('follow-up: info.gear.<slot> carries the item level (lvl) and tier, so others draw tier 2 on a plain level-15+ piece', async () => {
  const { srv, clock, world } = await realServer();
  const a = await joinReal(srv, clock, 'Plated', 'warrior');
  const o = rec(world, a);
  const eng = rulesEngine(), rng = o.room.rules.room.streams.get('loot');
  let chest = null;
  for (let k = 0; k < 80 && !chest; k++) { const it = eng.rpg.rollDrop({ level: 18, rng, chance: 1, bases: ['heavy_chest'] }); if (it && it.slot === 'chest' && !it.theme) chest = it; }
  assert.ok(chest, 'a plain level-18 chest');
  world.grant(o, { items: [chest], gold: 0, reason: 'test' }); await run(clock, 200);
  o.char.level = 20; o.entity.setLevel && o.entity.setLevel(20);
  a.item('equip', o.char.bag.at(-1).uid); await run(clock, 300);
  const g = o.entity.info().gear || {};
  assert.ok(g.chest && g.chest.lvl >= 15, 'lvl on the worn chest: ' + JSON.stringify(g.chest));
  a.close(); await srv.stop();
});
