// node --test prototypes/farhold/tests/weapons.test.js
//
// A weapon is a PATTERN now, not a damage number, and the perk forest is a tree you walk rather
// than a list you spend. Both are pure arithmetic, so all of it is testable without a browser: the
// rhythms are distinct, a two-hander really does take the off hand, the forest's shape really is
// the cost, and a skill's talents really do change the plan that gets cast.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  STRIKES, WEAPON_PATTERNS, profileOf, strikeAt, patternGlyphs, patternText,
  handsOf, offhandRefusal, handPlans, withArea, OFFHAND_DAMAGE,
  isStaff, isWand, staffSpell, wandBehaviour, STAFF_SPELLS, WAND_BEHAVIOURS,
} from '../js/weapons.js';
import {
  buildForest, allocate, canTake, refundAll, perkBonuses, pointsFor, pointsLeft,
  ARMS, KEYSTONES, TALENT_NODES, NODE_KINDS, armProgress,
} from '../js/perks.js';
import {
  treeFor, pickTalent, clearTalent, talentPlan, talentsOn, talentSummary,
  TALENT_LIBRARY, TIER_LEVELS,
} from '../js/skilltalents.js';
import { Rpg } from '../js/rpg.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = f => JSON.parse(readFileSync(join(here, f), 'utf8'));
const items = read('../../emberveil/data/items.json');
const balance = read('../data/balance.json');
const rpg = new Rpg(items, balance);
const make = (key, level = 10) => rpg.loot.generate(key, 'normal', 'medium', { level });

// ---------------------------------------------------------------- patterns

test('every weapon type swings differently, and says so in glyphs', () => {
  const seen = new Map();
  for (const key of Object.keys(WEAPON_PATTERNS)) {
    const item = make(key) || { baseKey: key, type: 'weapon' };
    const p = profileOf(item);
    assert.ok(p.pattern.length >= 1, `${key} has no pattern`);
    for (const strike of p.pattern) assert.ok(STRIKES[strike], `${key} uses an unknown strike "${strike}"`);
    assert.ok(p.reach > 0 && p.every > 0, `${key} has nonsense numbers`);
    const glyphs = patternGlyphs(item);
    assert.ok(glyphs.length > 0, `${key} draws no glyphs`);
    seen.set(key, p.pattern.join('-') + '|' + p.reach.toFixed(1));
  }
  // …and they are genuinely different from each other, not one table copied twelve times
  assert.ok(new Set(seen.values()).size > Object.keys(WEAPON_PATTERNS).length * 0.6,
    'most weapons swing identically');
});

test('a dagger trades reach for speed, and a two-hander the other way round', () => {
  // "Daggers would have a narrow attack range but make up for it in speed."
  const dagger = profileOf(make('dagger'));
  const great = profileOf(make('greatsword'));
  assert.ok(dagger.reach < great.reach * 0.6, `dagger reaches ${dagger.reach} against ${great.reach}`);
  assert.ok(dagger.every < great.every * 0.5, `dagger swings every ${dagger.every}s against ${great.every}s`);
  // and a two-hander sweeps wider
  assert.ok(great.arc > dagger.arc, 'a greatsword does not sweep wider than a dagger');
  assert.equal(great.twoHanded, true);
});

test('a rapier thrusts and a longsword slashes, in that order, and the combo resets', () => {
  const rapier = make('rapier'), longsword = make('longsword');
  assert.equal(strikeAt(rapier, 0).key, 'thrust');
  assert.equal(strikeAt(rapier, 1).key, 'thrust');
  // round 14: the rapier finishes with a lunge, and the pattern wraps after three
  assert.equal(strikeAt(rapier, 2).key, 'lunge', 'the rapier finisher is missing');
  assert.equal(strikeAt(rapier, 3).key, 'thrust', 'the pattern must wrap');
  assert.equal(strikeAt(longsword, 0).key, 'slash');
  assert.equal(strikeAt(longsword, 2).key, 'overhead', 'the longsword finisher is missing');
  // the last strike of a pattern knows it is the last — `sunder` and the like hang off that
  assert.equal(strikeAt(longsword, 2).last, true);
  assert.equal(strikeAt(longsword, 0).last, false);
  // a thrust reaches further and a sweep is wider than the plain slash they are measured against
  assert.ok(STRIKES.thrust.reach > STRIKES.slash.reach);
  assert.ok(STRIKES.sweep.arc > STRIKES.slash.arc);
});

test('a road weapon swings like the family it belongs to', () => {
  // `obsidian_scimitar` has no row of its own, and should not fall back to a generic
  const scimitar = profileOf({ baseKey: 'obsidian_scimitar', type: 'weapon', weaponCategory: 'light' });
  assert.deepEqual(scimitar.pattern, WEAPON_PATTERNS.scimitar.pattern);
  // and something genuinely unknown still gets a sane rhythm from its category
  const odd = profileOf({ baseKey: 'nonsense_blade', type: 'weapon', weaponCategory: 'heavy' });
  assert.ok(odd.pattern.length && odd.reach > 0 && odd.every > 0);
  // …including nothing at all
  const fists = profileOf(null);
  assert.ok(fists.unarmed && fists.every > 0);
});

// ---------------------------------------------------------------- hands

test('a two-handed weapon takes the off hand, and says why', () => {
  const player = rpg.createPlayer({ level: 40 });
  const sword = make('sword'), dagger = make('dagger'), great = make('greatsword');

  rpg.equip(player, sword, { force: true });
  rpg.equip(player, dagger, { into: 'offhand', force: true });
  assert.equal(handsOf(player).dual, true, 'two one-handers should be dual wielding');

  rpg.equip(player, great, { force: true });
  const hands = handsOf(player);
  assert.equal(hands.mainTwo, true);
  assert.equal(hands.dual, false);
  assert.equal(hands.offhandBlocked, true);
  const why = offhandRefusal(player, dagger);
  assert.match(why, /both hands/);

  // the equip path refuses it too, rather than doing nothing
  const out = rpg.equip(player, dagger, { into: 'offhand' });
  assert.ok(out?.refused, 'an off-hand weapon went on under a two-hander');
});

test('Doubled Grasp is the keystone that lets you carry two of them', () => {
  // "For the keystone perks, add one that allows you to equip two 2-handed melee weapons."
  const player = rpg.createPlayer({ level: 40 });
  rpg.equip(player, make('greatsword'), { force: true });
  rpg.equip(player, make('axe2h'), { into: 'offhand', force: true });
  assert.equal(handsOf(player).dual, false, 'two two-handers should need the keystone');
  player.perkFlags = { doubleGrip: true };
  assert.equal(handsOf(player).dual, true, 'the keystone did not free the hand');
  assert.equal(offhandRefusal(player, make('axe2h')), null);
  // the keystone exists in the forest, at the end of the melee arm, and it costs something
  const stone = KEYSTONES.find(k => k.flag === 'doubleGrip');
  assert.ok(stone, 'no Doubled Grasp keystone');
  assert.equal(stone.arm, 'melee');
  assert.ok(stone.cost, 'a keystone with no cost is a stat node with a bigger circle');
  assert.ok(stone.grants.haste < 0, 'the cost is not actually paid');
  // …and nothing player-facing borrows another game's name for it
  for (const k of KEYSTONES) assert.ok(!/titan'?s grip/i.test(k.name), `${k.id} still carries the old name`);
});

test('with the keystone, a SECOND two-hander goes in the free hand instead of replacing the first', () => {
  // Reported in play: "I took the keystone and equipped a two handed weapon, then tried to equip a
  // second greatsword — it just replaced my main hand instead of equipping into my off hand."
  const player = rpg.createPlayer({ level: 40 });
  player.perkFlags = { doubleGrip: true };
  const first = make('greatsword');
  const second = make('axe2h');
  rpg.equip(player, first, { force: true });
  rpg.equip(player, second, { force: true });          // no `into` — the bag has one click
  const held = [player.equipment.weapon, player.equipment.offhand];
  assert.ok(held.includes(first) && held.includes(second), 'one of the two two-handers went to the bag');
  assert.ok(!player.bag.includes(first) && !player.bag.includes(second));
  assert.equal(handsOf(player).dual, true);
  // and a two-hander picked up afterwards no longer sweeps the off hand into the bag
  const third = make('greatsword');
  third.name = 'Better Greatsword';
  rpg.equip(player, third, { force: true });
  assert.ok(player.equipment.offhand, 'equipping a two-hander emptied the keystone-held off hand');
});

test('without the keystone, a second two-hander still takes the main hand', () => {
  const player = rpg.createPlayer({ level: 40 });
  rpg.equip(player, make('greatsword'), { force: true });
  const second = make('axe2h');
  rpg.equip(player, second, { force: true });
  assert.equal(player.equipment.weapon, second, 'a two-hander should replace a two-hander');
  assert.equal(player.equipment.offhand, undefined, 'the off hand is not free without the keystone');
});


test('each hand swings on its own clock, and the off hand hits for less', () => {
  const player = rpg.createPlayer({ level: 40 });
  rpg.equip(player, make('sword'), { force: true });
  rpg.equip(player, make('dagger'), { into: 'offhand', force: true });
  const plans = handPlans(player, { mainStep: 0, offStep: 0 });
  assert.equal(plans.length, 2);
  assert.equal(plans[0].hand, 'main');
  assert.equal(plans[1].hand, 'off');
  assert.equal(plans[1].share, OFFHAND_DAMAGE);
  assert.ok(OFFHAND_DAMAGE < 1, 'a second weapon should not simply be twice the damage');
  // the two clocks are genuinely different, which is what "separate cooldowns" means
  assert.notEqual(plans[0].strike.every.toFixed(2), plans[1].strike.every.toFixed(2));

  // with a shield in the off hand there is only one swing
  const player2 = rpg.createPlayer({ level: 40 });
  rpg.equip(player2, make('sword'), { force: true });
  const shield = make('shield');
  if (shield) {
    rpg.equip(player2, shield, { into: 'offhand', force: true });
    assert.equal(handPlans(player2).length, 1, 'a shield should be held, not swung');
    assert.equal(handsOf(player2).heldOff, true);
  }
});

// ---------------------------------------------------------------- area

test('the area stat widens the swing and the drawing together', () => {
  const base = strikeAt(make('sword'), 0);
  const big = withArea(base, 50);
  assert.ok(big.arc > base.arc, 'the arc did not widen');
  assert.ok(big.reach > base.reach, 'the reach did not grow');
  assert.ok(big.splash > base.splash, 'the splash did not grow');
  assert.ok(big.scale > 1, 'nothing for the renderer to scale by');
  // reach grows more slowly than the arc, or a dagger build out-ranges a halberd
  assert.ok((big.reach / base.reach) < (big.arc / base.arc));
  // zero does nothing at all
  const same = withArea(base, 0);
  assert.equal(same.arc, base.arc);
  assert.equal(same.reach, base.reach);
});

// ---------------------------------------------------------------- staves and wands

test('every staff casts a spell instead of swinging, and every element has several', () => {
  const staff = make('staff');
  assert.equal(isStaff(staff), true);
  assert.equal(isWand(staff), false);
  for (const [element, list] of Object.entries(STAFF_SPELLS)) {
    assert.ok(list.length >= 3, `${element} has only ${list.length} staff spells`);
    for (const s of list) {
      assert.ok(s.name && s.shape && s.mult > 0, `${element}:${s.key} is incomplete`);
    }
  }
  // fire has the shapes the play-test asked for by name
  const fire = STAFF_SPELLS.fire.map(s => s.shape);
  for (const want of ['cone', 'nova', 'wave', 'lob']) {
    assert.ok(fire.includes(want), `fire has no ${want}`);
  }
  // the same staff always casts the same thing
  const a = staffSpell(staff, 'fire'), b = staffSpell(staff, 'fire');
  assert.equal(a.key, b.key);
});

test('every wand throws a bolt that does something different', () => {
  const wand = make('wand');
  assert.equal(isWand(wand), true);
  assert.equal(isStaff(wand), false);
  const behaviours = new Set();
  for (let i = 0; i < 60; i++) {
    behaviours.add(wandBehaviour({ id: 'w' + i, baseKey: 'wand' }).key);
  }
  assert.ok(behaviours.size >= 4, `only ${behaviours.size} wand behaviours ever appeared`);
  // the asked-for ones are all there
  const keys = WAND_BEHAVIOURS.map(b => b.key);
  for (const want of ['burst', 'split', 'chain', 'seeking']) assert.ok(keys.includes(want), `no ${want} wand`);
  // and a given wand never changes its mind
  assert.equal(wandBehaviour(wand).key, wandBehaviour(wand).key);
});

// ---------------------------------------------------------------- the perk forest

test('the forest has a hub, four arms, oddballs between them and a keystone at each end', () => {
  const forest = buildForest();
  assert.ok(forest.nodes.length > 60, `only ${forest.nodes.length} nodes`);
  const kinds = {};
  for (const n of forest.nodes) kinds[n.kind] = (kinds[n.kind] || 0) + 1;
  assert.equal(kinds.hub, 1);
  assert.equal(kinds.keystone, ARMS.length, 'one keystone an arm');
  assert.ok(kinds.talent >= ARMS.length, 'not every arm has a talent node');
  assert.ok(kinds.minor > kinds.major, 'majors should be rarer than minors');
  // every arm is represented, and the oddballs belong to none of them
  for (const arm of ARMS) {
    assert.ok(forest.nodes.some(n => n.arm === arm.key), `${arm.key} has no nodes`);
  }
  assert.ok(forest.nodes.some(n => n.oddball), 'no oddballs between the arms');
  // nothing is stranded: every node has at least one link
  for (const n of forest.nodes) {
    assert.ok((forest.neighbours.get(n.id) || []).length > 0, `${n.id} is cut off`);
  }
});

test('the shape of the tree is the cost: you walk to a keystone, you are not handed it', () => {
  const forest = buildForest();
  const player = { level: 60, perks: [] };
  const keystone = forest.nodes.find(n => n.kind === 'keystone');
  assert.equal(canTake(player, forest, keystone.id).ok, false, 'a keystone was reachable from the hub');

  // walk toward it, counting the points
  let steps = 0;
  while (steps < 200 && !(player.perks || []).includes(keystone.id)) {
    const next = forest.nodes.find(n => n.arm === keystone.arm && canTake(player, forest, n.id).ok);
    if (!next) break;
    allocate(player, forest, next.id);
    steps++;
  }
  assert.ok(player.perks.includes(keystone.id), 'never reached the keystone');
  assert.ok(steps > 8, `a keystone cost only ${steps} points — it should be a real walk`);
});

test('points come from levels, and run out', () => {
  const forest = buildForest();
  assert.equal(pointsFor(1), 0, 'a level-1 character has nothing to spend yet');
  assert.ok(pointsFor(30) > pointsFor(20));
  const player = { level: 5, perks: [] };
  const before = pointsLeft(player);
  assert.equal(before, pointsFor(5));
  let spent = 0;
  while (pointsLeft(player) > 0) {
    const next = forest.nodes.find(n => canTake(player, forest, n.id).ok);
    if (!next) break;
    allocate(player, forest, next.id);
    spent++;
  }
  assert.equal(spent, before);
  const any = forest.nodes.find(n => !player.perks.includes(n.id) && n.id !== 'start');
  assert.match(canTake(player, forest, any.id).why, /No points left|connects/);
  // and a refund gives all of them back at once
  assert.equal(refundAll(player), spent);
  assert.equal(pointsLeft(player), before);
});

test('what you walked past is what you get', () => {
  const forest = buildForest();
  const player = { level: 60, perks: [] };
  for (let i = 0; i < 25; i++) {
    const next = forest.nodes.find(n => n.arm === 'arcane' && canTake(player, forest, n.id).ok);
    if (!next) break;
    allocate(player, forest, next.id);
  }
  const { stats, flags, keystones } = perkBonuses(player, forest);
  assert.ok(Object.keys(stats).length > 3, 'a long walk granted almost nothing');
  assert.ok(stats.int > 0 || stats.spellPower > 0, 'the arcane arm gave no arcane stats');
  // walking one arm should not hand you another arm's keystone
  assert.ok(!keystones.includes('doubled_grasp'), 'the arcane walk collected a melee keystone');
  const walked = armProgress(player, forest);
  assert.ok(walked.arcane > walked.melee, 'the arm counter is wrong');
  // every talent node in the forest names a flag the game can actually read
  for (const t of TALENT_NODES) assert.ok(t.flag && t.desc && t.arm, `${t.id} is incomplete`);
  assert.ok(typeof flags === 'object');
});

test('every node kind is declared, and every keystone names an arm that exists', () => {
  for (const [key, kind] of Object.entries(NODE_KINDS)) {
    assert.equal(kind.key, key);
    assert.ok(kind.name && kind.size > 0);
  }
  const armKeys = ARMS.map(a => a.key);
  for (const k of KEYSTONES) assert.ok(armKeys.includes(k.arm), `${k.id} is on an arm that does not exist`);
  for (const t of TALENT_NODES) assert.ok(armKeys.includes(t.arm), `${t.id} is on an arm that does not exist`);
  // …and no arm is missing a keystone
  for (const arm of armKeys) assert.ok(KEYSTONES.some(k => k.arm === arm), `${arm} has no keystone`);
});

// ---------------------------------------------------------------- per-skill talents

test('every skill gets three tiers, and you may only take one from each', () => {
  const tree = treeFor('firebolt', 'bolt');
  assert.equal(tree.tiers.length, 3);
  for (const tier of tree.tiers) {
    assert.ok(tier.nodes.length >= 2, `tier ${tier.tier} offers only ${tier.nodes.length}`);
    assert.ok(tier.nodes.length <= 3, `tier ${tier.tier} offers ${tier.nodes.length} — the ask was 2-3`);
    for (const n of tier.nodes) assert.equal(n.tier, tier.tier, `${n.id} is in the wrong tier`);
  }
  assert.deepEqual(tree.tiers.map(t => t.level), TIER_LEVELS);

  const player = { level: 20, skillTalents: {} };
  assert.equal(pickTalent(player, 'firebolt', 1, 'fan', { shape: 'bolt' }).ok, true);
  assert.equal(player.skillTalents.firebolt[1], 'fan');
  /**
   * R20 — A SPENT TIER IS NOT RE-SPENT FOR FREE. It used to replace silently.
   *
   * That was the right call while the sheet ALSO cleared a talent for free; now that undoing one
   * is a person in a town and a price, a free swap would be the same undo wearing a different hat
   * — click the other node in the tier and the first one is gone, no gold, no walk. One per tier
   * is still the whole rule; what changed is that emptying the tier costs something.
   */
  const swap = pickTalent(player, 'firebolt', 1, 'pierce', { shape: 'bolt' });
  assert.equal(swap.ok, false, 'a spent tier can still be re-spent for free');
  assert.match(swap.why, /Unbinder/);
  assert.equal(player.skillTalents.firebolt[1], 'fan', 'and the refusal left the old pick alone');
  assert.equal(talentsOn(player, 'firebolt').length, 1);

  // emptied, the tier takes a new one — and that is js/retrain.js's only job here
  clearTalent(player, 'firebolt', 1);
  assert.equal(pickTalent(player, 'firebolt', 1, 'pierce', { shape: 'bolt' }).ok, true);
  assert.equal(player.skillTalents.firebolt[1], 'pierce');

  // a talent from another skill's board is refused
  clearTalent(player, 'firebolt', 1);
  assert.equal(pickTalent(player, 'firebolt', 1, 'wide', { shape: 'bolt' }).ok, false);
});

test('a tier is locked until its level', () => {
  const player = { level: 1, skillTalents: {} };
  assert.equal(pickTalent(player, 'firebolt', 1, 'fan').ok, true);
  const late = pickTalent(player, 'firebolt', 3, 'echo');
  assert.equal(late.ok, false);
  assert.match(late.why, /level 18/);
  player.level = 18;
  assert.equal(pickTalent(player, 'firebolt', 3, 'echo').ok, true);
});

test('a talent changes the plan that gets cast, not a number on a sheet', () => {
  // "Talents should be fundamentally different from just regular affixes, they should change combat
  // or allow multiple projectiles or add effects to impacts or chance to proc."
  const player = { level: 20, skillTalents: {} };
  const base = { projectiles: 1, damage: 40, mult: 1, cooldown: 6, splash: 0 };
  assert.deepEqual(talentPlan(player, 'firebolt', base), base, 'an untalented skill must come back untouched');

  pickTalent(player, 'firebolt', 1, 'fan');
  const fanned = talentPlan(player, 'firebolt', base);
  assert.equal(fanned.projectiles, 3, 'Fanned did not fan');
  assert.ok(fanned.damage < base.damage, 'three bolts for full damage each');
  assert.ok(fanned.spread > 0);

  pickTalent(player, 'firebolt', 2, 'chain');
  const chained = talentPlan(player, 'firebolt', base);
  assert.equal(chained.chains, 2);

  pickTalent(player, 'firebolt', 3, 'cauterise');
  const full = talentPlan(player, 'firebolt', base);
  assert.ok(full.critBurn > 0, 'Cauterise did not attach');
  // "High level characters should have really fancy spells" — the drawing grows with the build
  assert.ok(full.fxScale > 1.4, `three talents only scaled the effect to ${full.fxScale}`);
  assert.equal(full.talentFx.length, 3, 'each talent should name a visual change');

  // and taking one back undoes exactly that one
  clearTalent(player, 'firebolt', 1);
  assert.equal(talentPlan(player, 'firebolt', base).projectiles, 1);
  assert.equal(talentsOn(player, 'firebolt').length, 2);
  assert.match(talentSummary(player, 'firebolt'), /Chaining/);
});

test('a skill is only offered talents that make sense for its shape', () => {
  // a ground rune cannot be "fanned", and a nova cannot "pierce"
  const ground = treeFor('rune', 'ground');
  const ids = ground.tiers.flatMap(t => t.nodes.map(n => n.id));
  assert.ok(!ids.includes('fan'), 'a ground rune was offered Fanned');
  assert.ok(!ids.includes('pierce'), 'a ground rune was offered Piercing');
  // every offered id is a real talent, for every shape
  for (const shape of ['bolt', 'nova', 'cone', 'beam', 'ground', 'swipe', 'dash', 'buff', 'heal', 'summon']) {
    for (const tier of treeFor('x', shape).tiers) {
      assert.ok(tier.nodes.length >= 2, `${shape} tier ${tier.tier} has only ${tier.nodes.length}`);
      for (const n of tier.nodes) assert.ok(TALENT_LIBRARY[n.id], `${shape} offers an unknown talent`);
    }
  }
});
