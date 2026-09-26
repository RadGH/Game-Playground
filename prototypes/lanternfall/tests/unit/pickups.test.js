// Pickups (docs/08 §2.2-2.3): kill -> drops on the ground -> magnet within 24 cells -> collected with a
// 'pickup' event; full satchel leaves items on the ground; relics carry a light; a known strand becomes dust.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../../js/core/data.js';
import { createRng } from '../../js/core/rng.js';
import { createBus } from '../../js/core/bus.js';
import { createHero } from '../../js/rpg/hero.js';
import { createActor } from '../../js/entities/actor.js';
import { rollItem } from '../../js/rpg/items.js';
import { spawnPickup, stepPickups, dropLootFor, installLoot, collectDrop, pickupVisuals } from '../../js/entities/pickups.js';

const data = await loadData();
function game() {
  const g = { data, bus: createBus(), entities: [], rng: { loot: createRng(7) }, hero: createHero('lamplighter', data), player: { x: 100, y: 100, h: 10, oil: 10, maxOil: 100 }, time: 0, systems: [] };
  g.events = []; g.bus.on('pickup', e => g.events.push(e)); return g;
}
// stand-in for actor physics: gravity + a floor at y 100
const run = (g, n) => { for (let k = 0; k < n; k++) { for (const a of g.entities) if (a.kind === 'pickup') { a.px = a.x; a.py = a.y; if (!a.flying) a.vy += 1100 * a.gravity / 60; a.x += a.vx / 60; a.y += a.vy / 60; if (!a.flying && a.y > 100) { a.y = 100; a.vy = 0; a.vx *= 0.8; } } stepPickups(g); g.entities = g.entities.filter(e => !e.dead); } g.bus.flush(); };

test('a kill drops the table on the ground; pickups fly to the player and are collected with a pickup event', () => {
  const g = game(), def = data.enemies.byId.tallow_hound;
  const e = createActor('enemy', { x: 110, y: 100, w: 8, h: 6, extra: { def, level: 3 } });
  const drops = dropLootFor(g, e); assert.ok(drops.some(d => d.kind === 'pennies'));
  assert.equal(g.entities.filter(a => a.kind === 'pickup').length, drops.length); assert.ok(g.entities.every(a => a.intangible && a.team === 'none'));
  assert.deepEqual(dropLootFor(g, e), []); // one roll per corpse
  run(g, 120);
  assert.equal(g.entities.length, 0); assert.ok(g.hero.currency.pennies > 0);
  assert.ok(g.events.some(ev => ev.kind === 'pennies' && ev.amount > 0 && ev.color));
});

test('far pickups wait; a full satchel leaves an item glowing on the ground, currencies still auto-pick', () => {
  const g = game(); g.hero.satchelSlots = 0;
  const it = rollItem(data, { base: 'coat_guild', rng: createRng(1) });
  spawnPickup(g, { kind: 'item', item: it }, 105, 100); spawnPickup(g, { kind: 'pennies', amount: 5 }, 104, 100); spawnPickup(g, { kind: 'scrap', amount: 3 }, 300, 100);
  run(g, 120);
  assert.equal(g.hero.currency.pennies, 5); assert.ok(g.entities.some(a => a.drop.kind === 'item')); assert.ok(g.entities.some(a => a.drop.kind === 'scrap'));
  g.hero.satchelSlots = 20; run(g, 120); assert.ok(!g.entities.some(a => a.drop.kind === 'item')); assert.equal(g.hero.satchel[0].uid, it.uid);
  assert.ok(g.events.some(ev => ev.item?.uid === it.uid && ev.name === it.name));
});

test('relics carry a real light and a tall beam; oil tops up the lantern; a known strand becomes dust', () => {
  const g = game(), relic = rollItem(data, { base: 'relic_tallow_heart', ilvl: 6, rng: createRng(2) });
  const a = spawnPickup(g, { kind: 'item', item: relic }, 400, 100); assert.equal(a.light.r, 16); assert.equal(a.beam, 48);
  const v = pickupVisuals(g); assert.ok(v.lights.length === 1 && v.additive.length > 10);
  assert.ok(collectDrop(g, { kind: 'oil', amount: 30 })); assert.equal(g.player.oil, 40);
  assert.ok(collectDrop(g, { kind: 'oil', amount: 9999, full: true })); assert.equal(g.player.oil, 100);
  assert.ok(collectDrop(g, { kind: 'strand', id: 'strand_shape_ring' })); assert.equal(g.hero.strandDust, 1); // the Lamplighter starts knowing ring
  assert.ok(collectDrop(g, { kind: 'strand', id: 'strand_charm_echo' })); assert.equal(g.hero.satchel[0].base, 'strand_charm_echo');
  assert.ok(collectDrop(g, { kind: 'key', id: 'great_wick_act1' })); assert.ok(g.hero.keys.includes('great_wick_act1'));
});

test('installLoot wires the kill event and the tick system once; non-enemies drop nothing', () => {
  const g = game(); installLoot(g); installLoot(g); assert.equal(g.systems.length, 1);
  const e = createActor('enemy', { x: 500, y: 100, extra: { def: data.enemies.byId.dripling, level: 2 } });
  g.bus.emit('kill', { target: e }); g.bus.emit('kill', { target: createActor('pickup', { x: 0, y: 0 }) }); g.bus.flush();
  assert.ok(g.entities.length >= 1 && g.entities.every(a => a.kind === 'pickup'));
});
