// Farhold — round 20: one spell at creation, the rest as you level, and the Unbinder.
//
// The user's item, in full:
//
//   "Let's change the character creator so that you only pick the first level spell. When you reach
//    levels 3/7/12/18/24 (+ also change 7 to 6) unlock the next spell and have a 'spell available'
//    slot in the inventory screen so you can open the dialog to choose the next spell. Add an NPC at
//    town who is able to reset individual or all spells, perks, and talents, and remove the ability
//    to do it directly from the inventory. These should cost a small amount of gold we can tweak
//    later."
//
// Five things have to be true and this file is where every one of them is asserted without a
// browser:
//
//   * the ladder is 1/3/6/12/18/24, in BOTH files that state it
//   * a pick is gated by the character's own level, so the creator can only fill the opening slot
//   * an unfilled slot is a real, explainable empty slot on the bar — not a spell the game chose
//   * the Unbinder charges for every one of the six undos, refuses out loud, and never takes gold
//     for something it did not do
//   * nothing on the character sheet can undo a spell, a perk or a talent for free any more

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { register } from 'node:module';

import {
  spellCatalogue, createBuild, pickSpell, pickRefusal, slotsOf, pendingPicks,
  installCustomClass, buildRefusal, describeBuild, PICK_COUNT,
} from '../js/classbuild.js';
import { createSkillBar } from '../js/skills.js';
import { buildForest, allocate, spentBy } from '../js/perks.js';
import { pickTalent } from '../js/skilltalents.js';
import {
  priceOf, retrainMenu, spellRows, perkRows, talentRows, countTalents,
  forgetSpell, forgetAllSpells, forgetPerk, forgetAllPerks, forgetTalent, forgetAllTalents,
  DEFAULT_PRICES,
} from '../js/retrain.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = p => JSON.parse(readFileSync(join(here, '..', p), 'utf8'));
const readSrc = p => readFileSync(join(here, '..', p), 'utf8');

const classData = read('data/classes.json');
const skillData = read('data/skills.json');
const classLooks = JSON.parse(readFileSync(join(here, '../../emberveil/data/class-looks.json'), 'utf8'));
const cbData = read('data/classbuild.json');
const balance = read('data/balance.json');

const LADDER = [1, 3, 6, 12, 18, 24];

function freshData() {
  return {
    classData: JSON.parse(JSON.stringify(classData)),
    skillData: JSON.parse(JSON.stringify(skillData)),
    classLooks: JSON.parse(JSON.stringify(classLooks)),
  };
}

/** A build with only its opening spell, which is what the creator now produces. */
function starter(cat, id = 'power_strike') {
  const build = createBuild(cbData);
  assert.equal(pickSpell(build, 0, id, cat, { level: 1 }).ok, true);
  return build;
}

// ---------------------------------------------------------------------------- 1. the ladder

test('1.1 — the ladder is 1/3/6/12/18/24 in both files that state it', () => {
  assert.deepEqual(skillData.unlockAt, LADDER);
  assert.deepEqual(cbData.tiers.map(t => t.level), LADDER,
    'classbuild.json tiers and skills.json unlockAt have drifted — spellCatalogue throws on this');
  // and the catalogue is built from skills.json rather than from a third copy
  const cat = spellCatalogue({ classData, skillData, data: cbData });
  assert.deepEqual(cat.unlockAt, LADDER);
});

test('1.2 — level 7 is gone from every ladder the game reads', () => {
  assert.ok(!skillData.unlockAt.includes(7), 'skills.json still unlocks something at 7');
  assert.ok(!cbData.tiers.some(t => t.level === 7), 'classbuild.json still has a tier at 7');
  // the fallback ladders in code, for a caller that hands in no data at all
  for (const file of ['js/skills.js', 'js/classbuild.js', 'js/followers-ui.js']) {
    assert.doesNotMatch(readSrc(file), /\[1, 3, 7, 12, 18, 24\]/,
      `${file} still falls back to the old ladder`);
  }
});

// ------------------------------------------------------------- 2. one pick at creation

test('2.1 — a level-1 character may fill the opening slot and nothing else', () => {
  const cat = spellCatalogue({ classData, skillData, data: cbData });
  const build = createBuild(cbData);
  const slots = slotsOf(build, cat, { level: 1 });
  assert.equal(slots.filter(s => s.open).length, 1, 'more than one slot is open at level 1');
  assert.equal(slots[0].pending, true);
  assert.equal(pickSpell(build, 0, 'power_strike', cat, { level: 1 }).ok, true);
  const early = pickSpell(build, 1, 'cleave', cat, { level: 1 });
  assert.equal(early.ok, false);
  assert.match(early.why, /opens at level 3/);
  assert.equal(build.spells[1], null, 'the refusal still wrote the spell in');
});

test('2.2 — the creator is finished once the opening spell is picked', () => {
  const cat = spellCatalogue({ classData, skillData, data: cbData });
  const build = createBuild(cbData);
  assert.match(buildRefusal(build, cat, cbData), /spell you start with/);
  pickSpell(build, 0, 'power_strike', cat, { level: 1 });
  assert.equal(buildRefusal(build, cat, cbData), null,
    'the creator still demands all six before a run can start');
});

test('2.3 — every rung of the ladder opens exactly one more pick', () => {
  const cat = spellCatalogue({ classData, skillData, data: cbData });
  const build = starter(cat);
  // one spell in the bag, so at every rung the character is owed exactly (rungs reached - 1)
  for (let i = 0; i < LADDER.length; i++) {
    const level = LADDER[i];
    assert.equal(pendingPicks(build, cat, level), i,
      `at level ${level} the character is owed the wrong number of spells`);
    // …and one BELOW the rung, nothing has opened yet
    if (level > 1) assert.equal(pendingPicks(build, cat, level - 1), Math.max(0, i - 1));
  }
});

test('2.4 — a slot fills at its own level and not before', () => {
  const cat = spellCatalogue({ classData, skillData, data: cbData });
  const build = starter(cat);
  assert.match(pickRefusal(build, 2, 'cleave', cat, { level: 5 }), /opens at level 6/);
  assert.equal(pickRefusal(build, 2, 'cleave', cat, { level: 6 }), null);
  assert.equal(pickSpell(build, 2, 'cleave', cat, { level: 6 }).ok, true);
  assert.equal(pendingPicks(build, cat, 6), 1, 'slot 2 (level 3) is still owed');
});

/**
 * The two halves of the overwrite rule, which are NOT the same rule.
 *
 * Before the run starts a build is a draft and changing your mind is free — the first version of
 * this refused an overwrite from the moment the pick was made, which left the character creator's
 * one decision irreversible on the title screen with no way back short of an NPC in a town the
 * player has not reached. `build.granted` (set by `applyOpeningKit` as the character walks out of
 * the gate) is what separates them.
 */
test('2.5a — a draft build can change its mind, free, before the run starts', () => {
  const cat = spellCatalogue({ classData, skillData, data: cbData });
  const build = starter(cat);
  assert.equal(build.granted, false, 'a fresh build is already marked as started');
  const swap = pickSpell(build, 0, 'aimed_shot', cat, { level: 1 });
  assert.equal(swap.ok, true, 'the creator will not let you change the one choice it asks for');
  assert.equal(build.spells[0], 'aimed_shot');
  // …and the screen agrees the row is live, which is what draws the spell list beside it
  const slot = slotsOf(build, cat, { level: 1 })[0];
  assert.equal(slot.editable, true, 'a filled draft slot draws no spell list to change it with');
  assert.equal(slot.pending, false, 'a filled slot is not also owed');
});

test('2.5b — once the run has started, a filled slot is not overwritten for free', () => {
  const cat = spellCatalogue({ classData, skillData, data: cbData });
  const build = starter(cat);
  build.granted = true;                       // what `applyOpeningKit` does at the gate
  const over = pickSpell(build, 0, 'aimed_shot', cat, { level: 30 });
  assert.equal(over.ok, false, 'a spell can still be swapped out without paying anybody');
  assert.match(over.why, /Unbinder/);
  assert.equal(build.spells[0], 'power_strike');
  assert.equal(slotsOf(build, cat, { level: 30 })[0].editable, false);
});

test('2.6 — the level defaults to 1, so a caller that forgets cannot fill all six', () => {
  const cat = spellCatalogue({ classData, skillData, data: cbData });
  const build = createBuild(cbData);
  assert.equal(pickSpell(build, 0, 'power_strike', cat).ok, true);
  assert.equal(pickSpell(build, 3, 'meteor', cat).ok, false,
    'the level gate opens up when a caller passes no level');
});

// ------------------------------------------------------- 3. an empty slot on the real bar

test('3.1 — an unpicked slot stays empty instead of the game choosing for you', () => {
  const d = freshData();
  const cat = spellCatalogue({ ...d, data: cbData });
  const build = starter(cat);
  const def = installCustomClass({ ...d, data: cbData, build });
  assert.deepEqual(def.skills, ['power_strike', null, null, null, null, null],
    'installCustomClass invented spells for the empty slots');
  assert.deepEqual(d.skillData.classes.custom, def.skills);
});

test('3.2 — the bar explains an empty slot rather than crashing on it', () => {
  const d = freshData();
  const cat = spellCatalogue({ ...d, data: cbData });
  const build = starter(cat);
  installCustomClass({ ...d, data: cbData, build });

  const player = { classId: 'custom', level: 1, mp: 100, derived: {}, perkFlags: {} };
  const bar = createSkillBar({ data: d.skillData, player, rpg: null });
  const state = bar.state();
  assert.equal(state.length, PICK_COUNT);
  assert.equal(state[0].empty, false);
  assert.equal(state[0].usable, true, 'the one spell that was picked is not castable');

  // slot 2 opens at level 3: at level 1 it is empty and not yet owed
  assert.equal(state[1].empty, true);
  assert.equal(state[1].pending, false);
  assert.equal(state[1].usable, false);
  assert.match(bar.check(1).why, /opens at level 3/);
  // and pressing the key spends nothing
  const before = player.mp;
  assert.equal(bar.use(1).ok, false);
  assert.equal(player.mp, before, 'a dead key still charged mana');

  // at level 3 it is owed, and says where to go
  player.level = 3;
  const owed = bar.state();
  assert.equal(owed[1].pending, true);
  assert.match(bar.check(1).why, /choose its spell/i);
  assert.equal(bar.check(1).pending, true);
});

test('3.3 — an empty slot still reports a name, so nothing renders "undefined"', () => {
  const d = freshData();
  const cat = spellCatalogue({ ...d, data: cbData });
  installCustomClass({ ...d, data: cbData, build: starter(cat) });
  const player = { classId: 'custom', level: 30, mp: 100, derived: {}, perkFlags: {} };
  for (const s of createSkillBar({ data: d.skillData, player, rpg: null }).state()) {
    assert.equal(typeof s.name, 'string');
    assert.ok(s.name.length, 'a slot came back with no name at all');
    assert.equal(Number.isFinite(s.cooldown), true);
  }
});

test('3.4 — the card says a slot is chosen later, not that nothing was picked', () => {
  const cat = spellCatalogue({ classData, skillData, data: cbData });
  const d = describeBuild(starter(cat), cat, cbData, { level: 1 });
  assert.equal(d.picked, 1);
  assert.equal(d.pending, 0, 'a level-1 character is owed nothing beyond the opening spell');
  assert.equal(d.spells[0].name, 'Power Strike');
  assert.equal(d.spells[1].name, null);
  assert.equal(d.spells[1].pending, false);
  // …and at level 6 two of them have come due
  const later = describeBuild(starter(cat), cat, cbData, { level: 6 });
  assert.equal(later.pending, 2);
  assert.equal(later.spells[1].pending, true);
});

// ------------------------------------------------------------------ 4. the Unbinder

/**
 * js/town.js draws people, so it imports three. In a browser that resolves through index.html's
 * import map; under `node --test` it resolves through tests/three-loader.mjs, which points the one
 * bare specifier at the same vendored file. Registered here rather than at the top of the file so
 * that every other test in it runs even if the vendored copy ever goes missing.
 */
test('4.1 — there is an Unbinder, they stand in real settlements, and they wear a badge', async () => {
  register(pathToFileURL(join(here, 'three-loader.mjs')).href);
  const { ROLES, badgeFor } = await import('../js/town.js');
  const role = ROLES.find(r => r.key === 'unbinder');
  assert.ok(role, 'no Unbinder in the town roster');
  assert.equal(role.retrains, true);
  assert.ok(role.minSize <= 2, 'the Unbinder only appears in the biggest settlements');
  assert.ok(role.greeting && role.greeting.length > 20);
  const badge = badgeFor(role);
  assert.ok(badge, 'the Unbinder has no pip over their head, so nobody will find them');
  assert.equal(badge.kind, 'unbinder');
});

test('4.2 — prices come out of balance.json and climb with the level', () => {
  assert.ok(balance.retrain, 'balance.json carries no retrain block, so the prices are hard-coded');
  for (const kind of ['spell', 'perk', 'talent']) {
    assert.ok(balance.retrain[kind], `no price for a ${kind}`);
    const one = priceOf(kind, 'one', 1, balance.retrain);
    const all = priceOf(kind, 'all', 1, balance.retrain);
    assert.equal(one, balance.retrain[kind].one);
    assert.ok(all > one, `unbinding all ${kind}s costs no more than unbinding one`);
    assert.ok(priceOf(kind, 'one', 30, balance.retrain) > one, 'the price does not move with level');
  }
  // the module stands up on its own, for a caller with no data file
  assert.equal(priceOf('spell', 'one', 1, null), DEFAULT_PRICES.spell.one);
});

/** A character with a spell, two perks and a talent — one of each thing that can be unbound. */
function loaded() {
  const d = freshData();
  const cat = spellCatalogue({ ...d, data: cbData });
  const build = starter(cat);
  installCustomClass({ ...d, data: cbData, build });
  const forest = buildForest();
  const player = {
    classId: 'custom', level: 20, gold: 10000, perks: [], skillTalents: {},
    build: { ...build, custom: true },
  };
  allocate(player, forest, 'melee:1:1');
  allocate(player, forest, 'melee:2:1');
  assert.equal(pickTalent(player, 'firebolt', 1, 'fan', { shape: 'bolt' }).ok, true);
  return { d, cat, forest, player, build: player.build };
}

test('4.3 — the menu prices every undo and says why it will not do one', () => {
  const { cat, forest, player } = loaded();
  const menu = retrainMenu({
    player, build: player.build, cat, forest,
    skillState: [{ id: 'firebolt', name: 'Firebolt', shape: 'bolt' }],
    prices: balance.retrain,
  });
  assert.equal(menu.gold, 10000);
  assert.equal(menu.spellsLocked, null, 'a built class was told it cannot unbind its own spells');
  assert.equal(menu.spells.length, 1);
  assert.equal(menu.spells[0].slot, 0);
  assert.equal(menu.perks.length, 2);
  assert.equal(menu.talents.length, 1);
  assert.equal(menu.talents[0].skillName, 'Firebolt');
  // every "all of it" row knows what it would undo
  assert.equal(menu.spellsAll.count, 1);
  assert.equal(menu.perksAll.count, 2);
  assert.equal(menu.talentsAll.count, 1);
  // the perk in the middle of the walk cannot come out first, and says so
  const middle = menu.perks.find(r => r.id === 'melee:1:1');
  assert.ok(middle.refusal, 'a load-bearing perk was offered with no warning');
});

test('4.4 — a preset class is told its six are not its own to take apart', () => {
  const { cat, forest, player } = loaded();
  player.build = null;
  const menu = retrainMenu({ player, build: null, cat, forest, prices: balance.retrain });
  assert.ok(menu.spellsLocked, 'a preset class was offered a spell unbind it cannot have');
  assert.equal(menu.spells.length, 0);
  assert.equal(forgetSpell({ player, build: null, cat, slot: 0, prices: balance.retrain }).ok, false);
});

test('4.5 — unbinding a spell costs gold and opens the slot again', () => {
  const { cat, player, build } = loaded();
  const price = priceOf('spell', 'one', player.level, balance.retrain);
  const gold = player.gold;
  const out = forgetSpell({ player, build, cat, slot: 0, prices: balance.retrain });
  assert.equal(out.ok, true);
  assert.equal(out.spent, price);
  assert.equal(player.gold, gold - price);
  assert.equal(build.spells[0], null);
  assert.equal(pendingPicks(build, cat, player.level), 5, 'the slot did not come back open');
  // …and the slot can be filled again, free — with anything of its OWN tier, which for the
  // opening slot means a level-1 spell however high the character is
  assert.equal(pickSpell(build, 0, 'aimed_shot', cat, { level: player.level }).ok, true);
});

test('4.6 — every undo refuses out loud and takes nothing when it refuses', () => {
  const { cat, forest, player, build } = loaded();
  player.gold = 0;
  const calls = [
    () => forgetSpell({ player, build, cat, slot: 0, prices: balance.retrain }),
    () => forgetAllSpells({ player, build, cat, prices: balance.retrain }),
    () => forgetPerk({ player, forest, id: 'melee:2:1', prices: balance.retrain }),
    () => forgetAllPerks({ player, prices: balance.retrain }),
    () => forgetTalent({ player, skillId: 'firebolt', tier: 1, prices: balance.retrain }),
    () => forgetAllTalents({ player, prices: balance.retrain }),
  ];
  for (const call of calls) {
    const out = call();
    assert.equal(out.ok, false, 'an undo went through on an empty purse');
    assert.ok(out.why && /gold/i.test(out.why), `the refusal does not mention the price: ${out.why}`);
    assert.equal(out.spent, 0);
  }
  // and nothing was taken off the character
  assert.equal(build.spells[0], 'power_strike');
  assert.equal(spentBy(player), 2);
  assert.equal(countTalents(player), 1);
  assert.equal(player.gold, 0);
});

test('4.7 — a perk that holds another one up is refused, and costs nothing to be refused', () => {
  const { forest, player } = loaded();
  const gold = player.gold;
  const out = forgetPerk({ player, forest, id: 'melee:1:1', prices: balance.retrain });
  assert.equal(out.ok, false);
  assert.equal(player.gold, gold, 'a refused unbind still took the money');
  // the end of the walk comes out fine, and then the one behind it does too
  assert.equal(forgetPerk({ player, forest, id: 'melee:2:1', prices: balance.retrain }).ok, true);
  assert.equal(forgetPerk({ player, forest, id: 'melee:1:1', prices: balance.retrain }).ok, true);
  assert.equal(spentBy(player), 0);
});

test('4.8 — all of it, in one go, for the all-of-it price', () => {
  const { cat, player, build } = loaded();
  // three more spells first, so "all" is worth more than "one"
  for (const [slot, id] of [[1, 'cleave'], [2, 'curse']]) {
    assert.equal(pickSpell(build, slot, id, cat, { level: player.level }).ok, true);
  }
  let gold = player.gold;
  const spells = forgetAllSpells({ player, build, cat, prices: balance.retrain });
  assert.equal(spells.ok, true);
  assert.equal(spells.count, 3);
  assert.equal(spells.spent, priceOf('spell', 'all', player.level, balance.retrain));
  assert.equal(player.gold, gold - spells.spent);
  assert.deepEqual(build.spells, new Array(PICK_COUNT).fill(null));

  gold = player.gold;
  const perks = forgetAllPerks({ player, prices: balance.retrain });
  assert.equal(perks.count, 2);
  assert.equal(spentBy(player), 0);
  assert.equal(player.gold, gold - perks.spent);

  gold = player.gold;
  const talents = forgetAllTalents({ player, prices: balance.retrain });
  assert.equal(talents.count, 1);
  assert.equal(countTalents(player), 0);
  assert.equal(player.gold, gold - talents.spent);

  // and with nothing left, each one refuses rather than charging for nothing
  for (const out of [
    forgetAllSpells({ player, build, cat, prices: balance.retrain }),
    forgetAllPerks({ player, prices: balance.retrain }),
    forgetAllTalents({ player, prices: balance.retrain }),
  ]) {
    assert.equal(out.ok, false);
    assert.equal(out.spent, 0);
  }
});

test('4.9 — a talent comes off one tier of one skill, and the tier takes a new one after', () => {
  const { player } = loaded();
  const rows = talentRows({
    player, skillState: [{ id: 'firebolt', name: 'Firebolt', shape: 'bolt' }], prices: balance.retrain,
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].tier, 1);
  assert.ok(rows[0].name && rows[0].name !== 'fan', 'the row shows the raw id rather than the name');

  // a spent tier refuses a new pick until it is emptied — that is what the Unbinder is FOR
  assert.equal(pickTalent(player, 'firebolt', 1, 'pierce', { shape: 'bolt' }).ok, false);
  assert.equal(forgetTalent({ player, skillId: 'firebolt', tier: 1, prices: balance.retrain }).ok, true);
  assert.equal(pickTalent(player, 'firebolt', 1, 'pierce', { shape: 'bolt' }).ok, true);
  // …and unbinding one that is not there charges nothing
  const none = forgetTalent({ player, skillId: 'firebolt', tier: 3, prices: balance.retrain });
  assert.equal(none.ok, false);
  assert.equal(none.spent, 0);
});

test('4.9b — a spell\'s talents go out with it, free, and do not come back unpaid', () => {
  const { cat, player, build } = loaded();
  // the talent from `loaded()` is on firebolt; put firebolt on the bar so it is a real pairing
  build.spells[0] = 'firebolt';
  assert.equal(countTalents(player), 1);

  const gold = player.gold;
  const out = forgetSpell({ player, build, cat, slot: 0, prices: balance.retrain });
  assert.equal(out.ok, true);
  assert.equal(out.talents, 1, 'the spell went and its talents stayed behind');
  assert.equal(countTalents(player), 0);
  // …and it was not charged for twice
  assert.equal(gold - player.gold, priceOf('spell', 'one', player.level, balance.retrain));

  // re-learning it does not hand the old talents back for nothing
  assert.equal(pickSpell(build, 0, 'firebolt', cat, { level: player.level }).ok, true);
  assert.equal(countTalents(player), 0, 'the old talents came back unpaid');
});

test('4.10 — rows and menus never throw on a character who has done nothing', () => {
  const cat = spellCatalogue({ classData, skillData, data: cbData });
  const forest = buildForest();
  const blank = { level: 1, gold: 0, perks: [], skillTalents: {} };
  assert.deepEqual(spellRows({ player: blank, build: null, cat }), []);
  assert.deepEqual(perkRows({ player: blank, forest }), []);
  assert.deepEqual(talentRows({ player: blank }), []);
  const menu = retrainMenu({ player: blank, cat, forest, prices: balance.retrain });
  assert.equal(menu.spellsAll.count, 0);
  assert.ok(menu.perksAll.refusal, 'a wipe with nothing to wipe was offered as a live button');
});

// ------------------------------------- 5. nothing on the sheet undoes any of it for free

test('5.1 — the character sheet has no free undo for a spell, a perk or a talent', () => {
  const hud = readSrc('js/hud.js');
  const html = readSrc('index.html');
  const cb = readSrc('js/classbuild-ui.js');

  // the two perk buttons
  assert.doesNotMatch(html, /Take it all back/, 'the wholesale perk refund button is still in the page');
  assert.doesNotMatch(hud, /onRefundPerks\?\./, 'the sheet still calls the wholesale perk refund');
  assert.doesNotMatch(hud, /onRefundPerk\?\./);
  // the talent toggle
  assert.doesNotMatch(hud, /onClearTalent\?\./, 'clicking a taken talent still clears it');
  // the spell unlearn button
  assert.doesNotMatch(cb, /text: 'Unlearn'/, 'the builder still unlearns a spell for free');
  // …and each of the three screens says where it IS done
  for (const [name, src] of [['hud.js', hud], ['classbuild-ui.js', cb]]) {
    assert.match(src, /Unbinder/, `${name} removed the button without saying where to go`);
  }
});

test('5.1b — the clicked slot is the slot the chooser opens on', () => {
  const hud = readSrc('js/hud.js');
  const main = readSrc('js/main.js');
  const cb = readSrc('js/classbuild-ui.js');
  // the card knows which slot it is …
  assert.match(hud, /onChooseSpell\?\.\(i\)/, 'the spell card does not say which slot it is');
  // … main.js passes it on rather than dropping it …
  assert.match(main, /onChooseSpell: slot => openSpellChooser\(slot\)/, 'main.js throws the slot away');
  assert.match(main, /show\('spells', \{ slot \}\)/);
  // … and the builder opens on it
  assert.match(cb, /function show\(which = null, \{ slot = null \} = \{\}\)/);
});

test('5.1c — a talent tier that is already spent looks spent', () => {
  const hud = readSrc('js/hud.js');
  const css = readSrc('style.css');
  assert.match(hud, /' spent'/, 'a card in a spent tier gets no class of its own');
  assert.match(css, /\.talent-card\.spent/, 'a card in a spent tier is styled exactly like one you can take');
  assert.match(css, /content: "tier spent"/, 'the corner of a dead card still says "take"');
});

test('5.2 — main.js wires every one of the Unbinder\'s six, and the chooser', () => {
  const main = readSrc('js/main.js');
  for (const fn of ['forgetSpell', 'forgetAllSpells', 'forgetPerk', 'forgetAllPerks',
    'forgetTalent', 'forgetAllTalents']) {
    assert.match(main, new RegExp(`${fn}:`), `the talk panel has no ${fn} handler`);
    assert.match(main, new RegExp(`${fn}\\(\\{`), `${fn} is wired but never called`);
  }
  assert.match(main, /retrain: npc\.retrains/, 'the Unbinder is never handed their own menu');
  assert.match(main, /onChooseSpell:/, 'the sheet has no way to open the spell chooser');
  assert.match(main, /openSpellChooser/);
  // the talk panel has to draw what main.js hands it
  assert.match(readSrc('js/talkui.js'), /npc\.retrains/, 'the panel ignores an Unbinder entirely');
});

test('5.3 — the picked talents are saved, which they never were before', () => {
  const save = readSrc('js/save.js');
  assert.match(save, /skillTalents: player\.skillTalents/, 'talents are still dropped on reload');
  assert.match(save, /player\.skillTalents = p\.skillTalents/, 'talents are saved and never read back');
});
