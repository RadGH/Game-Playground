// The 2026-09-26 code review fixes: consumables do something, the belt keys use them, swimming follows the
// campaign unlock, saves drop the act maps and keep the run's state, and the death purse is not charged a death on
// "Return to the lamp-post".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../../js/core/data.js';
import { createGame, enterRoom } from '../../js/core/state.js';
import { generateKitRoom } from '../../js/world/kits.js';
import { newHero, onDeath } from '../../js/modes/campaign.js';
import { applyStats } from '../../js/rpg/hero.js';
import { ensureInventory, addToSatchel } from '../../js/rpg/items.js';
import { useConsumable, useBelt, stepConsumables } from '../../js/rpg/consume.js';
import { snapshot } from '../../js/save/save.js';
import { createActMaps } from '../../js/modes/actmap.js';

const data = await loadData();
function game() {
  const g = createGame({ data, seed: 3 }); g.flags = {};
  enterRoom(g, generateKitRoom('fight_small', { id: 't', act: 'act1', seed: 3, noEnemies: true }), 'w');
  newHero(g, 'lamplighter', {}); ensureInventory(g.hero, data); applyStats(g.hero, g.player, data); g.player.hp = g.player.maxHp; g.player.oil = g.player.maxOil;
  return g;
}
const tick = (g, n, I = {}) => { for (let k = 0; k < n; k++) stepConsumables(g, I); };

test('a mending tonic heals over its time, lamp oil fills the lantern, Clearwater cleanses', () => {
  const g = game(), p = g.player; p.hp = 10; p.oil = 0;
  useConsumable(g, data.items.byId.tonic_small); tick(g, 150);
  assert.ok(Math.abs(p.hp - (10 + p.maxHp * 0.35)) < 1, `hp ${p.hp}`);
  useConsumable(g, data.items.byId.lamp_oil); assert.equal(p.oil, Math.min(p.maxOil, 40));
  p.statuses = { burn: { t: 3 }, radiant: { t: 3 } }; useConsumable(g, data.items.byId.tonic_clear);
  assert.deepEqual(Object.keys(p.statuses), ['radiant']);
});

test('a belt key uses the belted stack and clears the slot when it runs out', () => {
  const g = game(), h = g.hero; addToSatchel(h, data, 'lamp_oil', 1); const it = h.satchel.find(x => x.base === 'lamp_oil');
  h.belt = [it.uid, null, null, null]; g.player.oil = 0;
  tick(g, 1, { pressed: { belt1: true } });
  assert.equal(g.player.oil, Math.min(g.player.maxOil, 40)); assert.equal(h.belt[0], null); assert.ok(!h.satchel.some(x => x.base === 'lamp_oil'));
  assert.equal(useBelt(g, 0), false);
});

test('a thrown pot bursts after its fuse and hurts what is in reach', async () => {
  const g = game(); const { createActor } = await import('../../js/entities/actor.js');
  const d = createActor('dummy', { name: 'Dummy', x: g.player.x + g.player.facing * 40, y: g.player.y, w: 6, h: 10, hp: 500 }); g.entities.push(d);
  useConsumable(g, data.items.byId.bomb_ember); tick(g, 60); assert.equal(d.hp, 500, 'not before the fuse');
  tick(g, 40); assert.ok(d.hp < 500, 'burst');
});

test('saves drop the act maps and carry purse, visited rooms, bestiary and stats', () => {
  const g = game(); g.actMaps = createActMaps(data, 3); g.purse = { room: 't', x: 1, y: 2, amount: 9 }; g.visited = { t: true }; g.bestiary = { wax_mite: 2 }; g.stats = { deaths: 1 };
  const s = snapshot(g); const json = JSON.stringify(s);
  assert.equal(s.world.actMaps, undefined); assert.ok(json.length < 20000, `${json.length} bytes`);
  assert.deepEqual(s.world.purse, g.purse); assert.deepEqual(s.world.visitedRooms, ['t']); assert.deepEqual(s.bestiary, { wax_mite: 2 }); assert.equal(s.stats.deaths, 1);
});

test('returning to the lamp-post drops a purse but is not a death', () => {
  const g = game(); g.hero.currency.pennies = 100; g.stats = {};
  const lost = onDeath(g, { countDeath: false }); assert.ok(lost > 0 && g.purse?.amount === lost); assert.equal(g.stats.deaths || 0, 0);
  onDeath(g); assert.equal(g.stats.deaths, 1);
});
