// node --test prototypes/farhold/tests/rpg.test.js
// Levels, gear and loot. The rules here are small, but they are the ones a player feels: a better
// weapon must actually hit harder, a level must actually matter, and a drop must be a real item
// from Emberveil's generator rather than a placeholder.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Rpg, xpForLevel, levelFromXp, itemScore, heldLookFor, offhandLookFor, LIVE_STATS, SLOTS, MAX_LEVEL, effectFor } from '../js/rpg.js';
import { FARHOLD_HELD, FARHOLD_OFFHAND } from '../../../avatar-3d/js/chibi2-weapon-ids.js';
import { EFFECTS } from '../js/effects.js';
import { makeRng } from '../../emberveil/js/rng.js';
import { allocate, canTake, pointsFor, pointsLeft } from '../js/perks.js';

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

test('levelling raises health and hands out perk points to spend', () => {
  // Round 7 replaced attribute point-buy with the perk forest: a level no longer accrues three
  // attribute points, it opens another step of the tree. The attributes are still there — they are
  // just something you walk to rather than something you are handed.
  const r = rpg();
  const p = r.createPlayer({});
  const hp1 = p.maxHp;
  const gained = r.gainXp(p, xpForLevel(4));
  assert.equal(gained, 3);
  assert.equal(p.level, 4);
  assert.ok(p.maxHp > hp1, 'levelling did not raise health');
  assert.ok(pointsLeft(p) > 0, 'four levels bought no perk points');
  assert.equal(pointsLeft(p), pointsFor(4));

  // spend one, and it has to be somewhere the tree can reach
  const reachable = r.forest.nodes.find(n => canTake(p, r.forest, n.id).ok);
  assert.ok(reachable, 'nothing at all is reachable from the hub');
  assert.equal(allocate(p, r.forest, reachable.id).ok, true);
  assert.equal(pointsLeft(p), pointsFor(4) - 1);
  r.refresh(p, { full: true });

  // …and a node on the far rim is not, however many points you have
  const rim = r.forest.nodes.find(n => n.kind === 'keystone');
  assert.equal(canTake(p, r.forest, rim.id).ok, false, 'a keystone was reachable from the hub');
  assert.match(canTake(p, r.forest, rim.id).why, /connects/);

  // spending every point stops you spending more
  while (pointsLeft(p) > 0) {
    const next = r.forest.nodes.find(n => canTake(p, r.forest, n.id).ok);
    if (!next) break;
    allocate(p, r.forest, next.id);
  }
  const any = r.forest.nodes.find(n => !(p.perks || []).includes(n.id));
  assert.equal(canTake(p, r.forest, any.id).ok, false, 'spent a point that was not there');
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
  /**
   * A BETTER ONE-HANDER WITH A HAND FREE EQUIPS BOTH, best in the main hand.
   *
   * The rule has always sent a WORSE one-hander to the empty off hand — that is how dual wielding
   * is reached at all, since the bag has one click. Round 13 made it symmetric: upgrading half of a
   * pair used to drop the other half in the bag, which is never what the player meant. Nothing goes
   * to the bag here because nothing came off.
   */
  const sword2 = r.loot.generate('rapier', 'magic', 'low', { rng: makeRng(6) });
  const replaced = r.equip(p, sword2);
  assert.equal(replaced, null, 'something was taken off when both hands could be full');
  assert.equal(p.equipment.weapon, sword2, 'the better weapon is not in the main hand');
  assert.equal(p.equipment.offhand, sword, 'the one it beat did not slide into the free hand');
  assert.ok(!p.bag.includes(sword), 'a weapon went to the bag with a hand free');
  // …and with the off hand full, a better weapon does swap and the old one goes to the bag
  r.unequip(p, 'offhand');
  p.equipment.offhand = shield;
  const sword3 = r.loot.generate('rapier', 'rare', 'high', { rng: makeRng(61) });
  assert.equal(r.equip(p, sword3, { force: true }), sword2, 'the replaced weapon did not come back');
  assert.ok(p.bag.includes(sword2), 'the replaced weapon vanished instead of going to the bag');
  r.unequip(p, 'offhand');

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

// Round 4 turned every affix on. This test used to assert the opposite — that `cond_cheatDeath` was
// carried and inert — and its whole job now is to make sure nothing ever goes back to being dead data.
test('every affix items.json can roll is wired, and a plain one still adds its number', () => {
  const r = rpg();
  const p = r.createPlayer({});
  const ring = {
    id: 'test', name: 'Test Ring', type: 'accessory', slot: 'ring', rarity: 'rare', quality: 'high',
    affixes: [{ stat: 'hp', value: 40 }, { stat: 'cond_cheatDeath', value: 0.2 }],
  };
  const before = p.maxHp;
  r.equip(p, ring);
  assert.equal(p.maxHp, before + 40, 'a plain affix did nothing');
  assert.deepEqual(p.derived.inert, [], 'something is still being carried without an effect');
  assert.ok(effectFor({ stat: 'cond_cheatDeath' }), 'cheat death is not in the registry');
});

test('NOTHING in items.json is dead data — every affix stat and legendary power has an effect', () => {
  const A = items.affixes;
  const missing = [];
  for (const list of Object.values(A)) {
    for (const a of list) if (!effectFor(a)) missing.push(a.stat);
  }
  for (const id of Object.keys(items.legendaryEffects)) {
    if (!EFFECTS['legendary:' + id]) missing.push('legendary:' + id);
  }
  assert.deepEqual([...new Set(missing)], [], 'these have no entry in js/effects.js');
});

test('every effect in the registry describes itself in plain language', () => {
  for (const [id, e] of Object.entries(EFFECTS)) {
    const text = e.desc(0.25);
    assert.ok(typeof text === 'string' && text.length > 3, `${id} has no description`);
    assert.ok(!/undefined|NaN|\[object/.test(text), `${id} describes itself as "${text}"`);
  }
});

// The bug the user hit in round 4: giving enemies a small `derived` bag made `attacker.derived`
// truthy, and `derived.damage` is undefined on an enemy, so every number in the fight was NaN.
test('no strike in the whole bestiary can produce a non-number, at any rank', () => {
  const r = rpg();
  const rng = makeRng(4242);
  const p = r.createPlayer({ classId: 'warrior', level: 8 });
  r.equip(p, r.loot.generate('longsword', 'rare', 'high', { rng: makeRng(3) }));
  const bad = [];
  for (const def of bestiary.enemies) {
    for (const rank of ['normal', 'champion', 'rare']) {
      const mods = r.pickModifiers(bestiary.modifiers, rank === 'rare' ? 2 : rank === 'champion' ? 1 : 0, rng);
      const e = r.makeEnemy(def, 8, rng, { rank, modifiers: mods });
      const out = r.strike(p, { ...e, hp: 1e6, maxHp: 1e6 }, rng);
      const back = r.strike(e, { ...p, hp: 1e6, maxHp: 1e6, derived: p.derived }, rng);
      if (!Number.isFinite(out.amount) || !Number.isFinite(back.amount)) bad.push(`${def.id}/${rank}`);
    }
  }
  assert.deepEqual(bad, [], 'these matchups rolled NaN damage');
});

test('ranks make an enemy harder and worth more, and a rare is worth more than a champion', () => {
  const r = rpg();
  const rng = makeRng(7);
  const def = bestiary.enemies[0];
  const plain = r.makeEnemy(def, 6, makeRng(7), { rank: 'normal' });
  const champ = r.makeEnemy(def, 6, makeRng(7), { rank: 'champion', modifiers: r.pickModifiers(bestiary.modifiers, 1, rng) });
  const rare = r.makeEnemy(def, 6, makeRng(7), { rank: 'rare', modifiers: r.pickModifiers(bestiary.modifiers, 2, rng), name: 'Someone' });
  assert.ok(champ.maxHp > plain.maxHp && rare.maxHp > champ.maxHp, 'ranks do not stack health');
  assert.ok(rare.xp > champ.xp && champ.xp > plain.xp, 'ranks do not pay more');
  assert.ok(rare.dropBonus > champ.dropBonus && champ.dropBonus > plain.dropBonus, 'ranks do not drop more');
  assert.equal(rare.name, 'Someone', 'a rare should carry its own name');
  assert.ok(champ.name !== plain.name, 'a champion should read differently from a plain one');
  assert.ok(rare.auras.length >= 1, 'a rare has nothing to see it by');
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
  for (const def of [...bestiary.enemies, ...bestiary.bosses]) {
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
  // the Chibi 2 held/offhand vocabulary — the original ids from chibi2-gear.js plus the Farhold
  // weapon kit, which is imported rather than retyped so a new model cannot go missing quietly
  const held = new Set([
    'none', 'book', 'bow', 'cleaver', 'crossbow', 'daggers', 'flame', 'greataxe', 'hammer',
    'hourglass', 'lightning', 'lute', 'mace', 'orb', 'rapier', 'ring_rune', 'saber', 'staff_crook',
    'staff_crystal', 'staff_orb', 'staff_skull', 'staff_totem', 'sword', 'warhammer',
    'quarterstaff', 'greatsword',
    ...FARHOLD_HELD,
  ]);
  const offhand = new Set(['none', 'dagger', 'heater_shield', 'kite_shield', 'map', 'quiver', 'buckler', ...FARHOLD_OFFHAND]);
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

// ---------------------------------------------------------------- phase 8: talents and passives

import { readFileSync as readTalents } from 'node:fs';
const talentData = JSON.parse(readTalents(join(here, '../data/talents.json'), 'utf8'));
const rpgT = () => new Rpg(items, balance, talentData);

test('levels hand out passive points and talent choices at the right rungs', () => {
  const r = rpgT();
  const p = r.createPlayer({});
  assert.equal(p.pendingPassive, 0);
  assert.equal(p.pendingTalent, 0);

  r.gainXp(p, xpForLevel(3));
  assert.equal(p.level, 3);
  assert.equal(p.pendingTalent, 1, 'a talent at level 3');
  assert.equal(p.pendingPassive, 0, 'no passive before level 5');

  r.gainXp(p, xpForLevel(10) - p.xp);
  assert.equal(p.level, 10);
  assert.equal(p.pendingPassive, 2, 'a passive point at 5 and at 10');
  assert.equal(p.pendingTalent, 2, 'talents at 3 and 8');
});

test('a passive point changes a real number, and cannot be spent twice', () => {
  const r = rpgT();
  const p = r.createPlayer({ level: 10 });
  const tree = r.passives(p);
  assert.ok(tree.length >= 3, 'a class has a tree');
  for (const node of tree) assert.ok(node.name && node.maxRank >= 1);

  // find one this game actually reads, and check it moves the stat it claims to
  const health = tree.find(n => n.maxHp);
  if (health) {
    const before = p.maxHp;
    const points = p.pendingPassive;
    assert.equal(r.spendPassive(p, health.id), true);
    assert.equal(p.pendingPassive, points - 1);
    assert.ok(p.maxHp > before, `${health.name} did not raise health`);
  }

  // you cannot spend what you do not have
  p.pendingPassive = 0;
  assert.equal(r.spendPassive(p, tree[0].id), false);
  // and nothing goes past its cap
  p.pendingPassive = 99;
  const node = tree[0];
  for (let i = 0; i < node.maxRank; i++) r.spendPassive(p, node.id);
  assert.equal(r.spendPassive(p, node.id), false, 'went past the maximum rank');
  assert.equal(p.passiveRanks[node.id], node.maxRank);
});

test('every talent changes something the game reads', () => {
  const FIELDS = ['damage', 'armor', 'moveSpeed', 'critChance', 'critDamage', 'magicFind', 'goldFind',
    'hpRegen', 'lifeSteal', 'maxHp', 'swimPct', 'mountPct', 'jumpPct', 'arrowRangePct', 'arrowSpeedPct', 'floatLift'];
  for (const t of talentData.talents) {
    const r = rpgT();
    const p = r.createPlayer({ level: 10 });
    r.equip(p, r.loot.generate('longsword', 'normal', 'medium', { rng: makeRng(2) }));
    const before = JSON.parse(JSON.stringify(p.derived));
    p.pendingTalent = 1;
    assert.equal(r.takeTalent(p, t.id), true, `${t.id} could not be taken`);
    const after = p.derived;
    const moved = FIELDS.some(f => JSON.stringify(after[f]) !== JSON.stringify(before[f]));
    assert.ok(moved, `${t.name} changed nothing the game reads`);
    assert.ok(t.desc && t.desc.length > 6, `${t.id} has no description`);
    // and it cannot be taken twice
    p.pendingTalent = 1;
    assert.equal(r.takeTalent(p, t.id), false, `${t.id} was taken twice`);
  }
});

test('armour is looked up by the base tier, and every tier maps to a real part', () => {
  const r = rpgT();
  const p = r.createPlayer({ level: 10 });
  const parts = new Set(['hood', 'feather_cap', 'horned_helm', 'dragon_helm', 'robe', 'strapped_leather',
    'tunic', 'scale_plate', 'plate', 'trim_robe', 'baggy', 'pants', 'greaves', 'sandals', 'boots', 'heavy', 'slippers']);
  let seen = 0;
  for (const key of Object.keys(items.armorBases)) {
    const base = items.armorBases[key];
    if (!['head', 'chest', 'legs', 'feet'].includes(base.slot)) continue;
    const item = r.loot.generate(key, 'normal', 'medium', { rng: makeRng(1) });
    if (!item) continue;
    r.equip(p, item);
    const look = r.gearLook(p);
    for (const part of Object.values(look)) {
      assert.ok(parts.has(part.id), `${key} (tier ${base.tier}) maps to "${part.id}", which Chibi 2 does not have`);
      seen++;
    }
  }
  assert.ok(seen > 6, `only ${seen} armour looks resolved`);
  // nothing worn, nothing shown
  assert.deepEqual(r.gearLook(r.createPlayer({})), {});
});

test('the passive tree and talents survive a save', () => {
  const r = rpgT();
  const p = r.createPlayer({ level: 15 });
  const node = r.passives(p)[0];
  r.spendPassive(p, node.id);
  r.takeTalent(p, talentData.talents[0].id);
  const json = JSON.parse(JSON.stringify({ passiveRanks: p.passiveRanks, talents: p.talents }));
  assert.equal(json.passiveRanks[node.id], 1);
  assert.deepEqual(json.talents, [talentData.talents[0].id]);
});
