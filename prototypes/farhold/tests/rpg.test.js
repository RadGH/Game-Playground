// node --test prototypes/farhold/tests/rpg.test.js
// Levels, gear and loot. The rules here are small, but they are the ones a player feels: a better
// weapon must actually hit harder, a level must actually matter, and a drop must be a real item
// from Emberveil's generator rather than a placeholder.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Rpg, xpForLevel, levelFromXp, itemScore, heldLookFor, offhandLookFor, LIVE_STATS, SLOTS, MAX_LEVEL } from '../js/rpg.js';
import { makeRng } from '../../emberveil/js/rng.js';

const here = dirname(fileURLToPath(import.meta.url));
const items = JSON.parse(readFileSync(join(here, '../../emberveil/data/items.json'), 'utf8'));
const balance = JSON.parse(readFileSync(join(here, '../data/balance.json'), 'utf8'));
const bestiary = JSON.parse(readFileSync(join(here, '../data/enemies.json'), 'utf8'));
const rpg = () => new Rpg(items, balance);

test('the xp curve rises and never goes backwards', () => {
  assert.equal(xpForLevel(1), 0);
  for (let l = 2; l <= MAX_LEVEL; l++) assert.ok(xpForLevel(l) > xpForLevel(l - 1), `level ${l} is not past ${l - 1}`);
  assert.equal(levelFromXp(0), 1);
  assert.equal(levelFromXp(xpForLevel(5)), 5);
  assert.equal(levelFromXp(xpForLevel(5) - 1), 4);
  assert.equal(levelFromXp(1e9), MAX_LEVEL, 'the level cap holds');
});

test('a new character is alive, unarmed and carrying nothing', () => {
  const r = rpg();
  const p = r.createPlayer({ name: 'Wren' });
  assert.equal(p.level, 1);
  assert.equal(p.hp, p.maxHp);
  assert.ok(p.maxHp > 0);
  assert.deepEqual(p.bag, []);
  assert.deepEqual(p.equipment, {});
  assert.deepEqual(p.derived.damage.length, 2);
  assert.ok(p.derived.damage[0] >= 1 && p.derived.damage[1] > p.derived.damage[0]);
});

test('levelling raises health and hands out points to spend', () => {
  const r = rpg();
  const p = r.createPlayer({});
  const hp1 = p.maxHp;
  const gained = r.gainXp(p, xpForLevel(4));
  assert.equal(gained, 3);
  assert.equal(p.level, 4);
  assert.ok(p.maxHp > hp1, 'levelling did not raise health');
  assert.equal(p.pendingAttr, 3 * (balance.progression.attrPerLevel));
  const con = p.attrs.con;
  assert.equal(r.spendAttr(p, 'con'), true);
  assert.equal(p.attrs.con, con + 1);
  assert.ok(p.maxHp > hp1, 'CON did not feed health');
  p.pendingAttr = 0;
  assert.equal(r.spendAttr(p, 'con'), false, 'spent a point that was not there');
});

test('a better weapon hits harder, and armour is worth wearing', () => {
  const r = rpg();
  const p = r.createPlayer({});
  const bare = p.derived.damage[1];
  const dagger = r.loot.generate('dagger', 'normal', 'low', { rng: makeRng(1) });
  const great = r.loot.generate('greatsword', 'normal', 'high', { rng: makeRng(2) });
  r.equip(p, dagger);
  const withDagger = p.derived.damage[1];
  r.equip(p, great);
  assert.ok(withDagger > bare, 'a weapon did nothing');
  assert.ok(p.derived.damage[1] > withDagger, 'a greatsword is not better than a dagger');

  const chest = r.loot.generate('heavy_chest', 'normal', 'medium', { rng: makeRng(3) });
  const armorBefore = p.derived.armor;
  r.equip(p, chest);
  assert.ok(p.derived.armor > armorBefore, 'armour did nothing');
});

test('equipping swaps, keeps the old piece, and a two-hander clears the off hand', () => {
  const r = rpg();
  const p = r.createPlayer({});
  const sword = r.loot.generate('sword', 'normal', 'low', { rng: makeRng(4) });
  const shield = r.loot.generate('light_chest', 'normal', 'low', { rng: makeRng(5) });
  r.equip(p, sword);
  assert.equal(p.equipment.weapon, sword);
  const sword2 = r.loot.generate('rapier', 'magic', 'low', { rng: makeRng(6) });
  const replaced = r.equip(p, sword2);
  assert.equal(replaced, sword);
  assert.ok(p.bag.includes(sword), 'the replaced weapon vanished instead of going to the bag');

  // a two-handed weapon pushes the off hand back into the bag
  const twoHander = r.loot.generate('greatsword', 'normal', 'low', { rng: makeRng(7) });
  assert.equal(twoHander.twoHanded, true);
  p.equipment.offhand = shield;
  r.equip(p, twoHander);
  assert.equal(p.equipment.offhand, undefined);
  assert.ok(p.bag.includes(shield));

  const off = r.unequip(p, 'weapon');
  assert.equal(off, twoHander);
  assert.equal(p.equipment.weapon, undefined);
});

test('health keeps its share when gear changes, and is refilled on a level', () => {
  const r = rpg();
  const p = r.createPlayer({});
  p.hp = Math.round(p.maxHp / 2);
  const chest = r.loot.generate('heavy_chest', 'rare', 'high', { rng: makeRng(8) });
  r.equip(p, chest);
  const share = p.hp / p.maxHp;
  assert.ok(Math.abs(share - 0.5) < 0.06, `health share jumped to ${share.toFixed(2)} when gear changed`);
  r.gainXp(p, xpForLevel(3));
  assert.equal(p.hp, p.maxHp, 'a level did not heal');
});

test('only the affixes this phase understands change a character; the rest are declared, not dropped', () => {
  const r = rpg();
  const p = r.createPlayer({});
  const ring = {
    id: 'test', name: 'Test Ring', type: 'accessory', slot: 'ring', rarity: 'rare', quality: 'high',
    affixes: [{ stat: 'hp', value: 40 }, { stat: 'cond_cheatDeath', value: 1 }],
  };
  const before = p.maxHp;
  r.equip(p, ring);
  assert.equal(p.maxHp, before + 40, 'a live affix did nothing');
  assert.ok(p.derived.inert.includes('cond_cheatDeath'), 'an affix with no effect yet was silently swallowed');
  assert.ok(!('cond_cheatDeath' in LIVE_STATS));
});

test('a swing does damage, respects armour, and can finish an enemy', () => {
  const r = rpg();
  const p = r.createPlayer({ level: 6 });
  r.equip(p, r.loot.generate('longsword', 'rare', 'high', { rng: makeRng(9) }));
  const soft = r.makeEnemy({ id: 'a', name: 'Soft', hp: 400, dmg: [1, 2], armor: 0 }, 5, makeRng(10));
  const hard = r.makeEnemy({ id: 'b', name: 'Hard', hp: 400, dmg: [1, 2], armor: 200 }, 5, makeRng(10));
  let softTotal = 0, hardTotal = 0;
  const rng = makeRng(11);
  for (let i = 0; i < 300; i++) {
    softTotal += r.strike(p, { ...soft, hp: 1e6, maxHp: 1e6 }, rng).amount;
    hardTotal += r.strike(p, { ...hard, hp: 1e6, maxHp: 1e6 }, rng).amount;
  }
  assert.ok(softTotal > hardTotal * 1.8, `armour barely mattered (${softTotal} vs ${hardTotal})`);

  const doomed = r.makeEnemy(bestiary.enemies[2], 1, makeRng(12));
  let swings = 0;
  while (doomed.hp > 0 && swings < 200) { r.strike(p, doomed, rng); swings++; }
  assert.ok(doomed.hp === 0 && swings < 200, 'could not kill a level 1 rat');
});

test('enemies scale with their level and every table entry builds', () => {
  const r = rpg();
  for (const def of bestiary.enemies) {
    const low = r.makeEnemy(def, def.minLevel ?? 1, makeRng(1));
    const high = r.makeEnemy(def, (def.maxLevel ?? 20), makeRng(1));
    assert.ok(low.hp > 0 && low.dmg[1] > 0, `${def.id} builds with no health or damage`);
    assert.ok(high.hp > low.hp, `${def.id} does not get tougher with level`);
    assert.ok(high.xp > low.xp, `${def.id} does not pay more at a higher level`);
    assert.ok(def.look?.creature || def.look?.avatar, `${def.id} has no body to build`);
    assert.ok(['beast', 'humanoid'].includes(def.kind));
  }
});

test('the bestiary only points at biome families and item bases that exist', () => {
  const bases = { ...items.weaponBases, ...items.armorBases };
  const families = ['any', 'grass', 'jungle', 'desert', 'ice', 'tundra', 'ocean', 'rock', 'lava', 'toxic', 'crystal', 'void'];
  for (const def of bestiary.enemies) {
    for (const f of def.biomes || []) assert.ok(families.includes(f), `${def.id} lists unknown biome family ${f}`);
    for (const b of def.dropBases || []) assert.ok(bases[b], `${def.id} drops unknown base ${b}`);
  }
  for (const tier of balance.lootTiers) {
    for (const b of tier.bases) assert.ok(bases[b], `loot tier ${tier.minLevel} lists unknown base ${b}`);
  }
});

test('loot rolls produce real, wearable items across the level range', () => {
  const r = rpg();
  const rng = makeRng(99);
  const rarities = {};
  let rolled = 0;
  for (let level = 1; level <= 30; level++) {
    for (let i = 0; i < 60; i++) {
      const item = r.rollDrop({ level, rng });
      if (!item) continue;
      rolled++;
      rarities[item.setId ? 'set' : item.isUnique ? 'unique' : item.rarity] = (rarities[item.setId ? 'set' : item.isUnique ? 'unique' : item.rarity] || 0) + 1;
      assert.ok(item.name && item.name.length > 1, 'an item came out unnamed');
      const slot = item.type === 'weapon' ? 'weapon' : item.slot === 'ring1' ? 'ring' : item.slot;
      assert.ok(SLOTS.includes(slot), `item ${item.name} has slot ${slot}, which nothing can wear`);
      assert.ok(r.price(item) > 0);
    }
  }
  assert.ok(rolled > 400, `only ${rolled} drops from 1800 kills`);
  assert.ok(rarities.normal && rarities.magic && rarities.rare, 'the common rarities never appeared');
  assert.ok((rarities.legendary || 0) + (rarities.unique || 0) + (rarities.set || 0) > 0, 'nothing rare ever dropped');
  assert.ok((rarities.normal || 0) > (rarities.rare || 0), 'rare items are not rare');
});

test('a weapon always ends up in the character\'s hand as a part that exists', () => {
  const r = rpg();
  // the Chibi 2 held/offhand vocabulary, from avatar-3d
  const held = new Set(['none', 'book', 'bow', 'cleaver', 'crossbow', 'daggers', 'flame', 'greataxe', 'hammer', 'hourglass', 'lightning', 'lute', 'mace', 'orb', 'rapier', 'ring_rune', 'saber', 'staff_crook', 'staff_crystal', 'staff_orb', 'staff_skull', 'staff_totem', 'sword', 'warhammer', 'quarterstaff', 'greatsword']);
  const offhand = new Set(['none', 'dagger', 'heater_shield', 'kite_shield', 'map', 'quiver']);
  for (const key of Object.keys(items.weaponBases)) {
    const item = r.loot.generate(key, 'normal', 'low', { rng: makeRng(1) });
    const look = heldLookFor(item);
    assert.ok(held.has(look.id), `${key} maps to held part "${look.id}", which Chibi 2 does not have`);
  }
  assert.equal(heldLookFor(null).id, 'none');
  assert.ok(offhand.has(offhandLookFor(null).id));
  assert.ok(offhand.has(offhandLookFor(r.loot.generate('quiver', 'normal', 'low', { rng: makeRng(2) })).id));
});

test('the upgrade arrow points the right way', () => {
  const r = rpg();
  const weak = r.loot.generate('dagger', 'normal', 'low', { rng: makeRng(3) });
  const strong = r.loot.generate('greatsword', 'legendary', 'exotic', { rng: makeRng(4) });
  assert.ok(itemScore(strong) > itemScore(weak));
  assert.equal(itemScore(null), 0);
});
