// Farhold — round 17: build your own class, and the company that walks with you.
//
// The user's item, in full, is at the top of prototypes/farhold/CLASSES.md. Ten jobs came out of
// it and this file is the one place every rule in them is asserted without a browser:
//
//   * the spell tier list covers every skill all thirty classes hand out, and its rungs ARE
//     data/skills.json's `unlockAt` rather than a second ladder somebody typed
//   * a pick may only take a spell its slot's level could have unlocked
//   * two two-handers is refused without Doubled Grasp and allowed with it
//   * unlearn hands back exactly one pick
//   * the bonus crate is three items and none of them is worse than magic
//   * three follower slots at level 1, four at 20, five at 30
//   * The Kept Company moves the FOLLOWER limit and no longer moves a summon's count
//   * "If you have 5 follower slots and hire 4 mercenaries, you can only summon one wolf"
//   * a follower's numbers track its owner's level

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  spellCatalogue, createBuild, pickSpell, pickRefusal, unlearnSpell, slotsOf,
  loadoutRefusal, loadoutOf, installCustomClass, removeCustomClass, buildRefusal,
  rollStartingCrate, atLeastRarity, applyOpeningKit, PICK_COUNT,
} from '../js/classbuild.js';
import {
  slotsForLevel, perTypeCapFor, admit, boardFor, priceOf, scaleFollower,
  followerBonus, createFollowers,
} from '../js/followers.js';
import { ARMS, KEYSTONES, buildForest, perkBonuses } from '../js/perks.js';
import { createSkillBar } from '../js/skills.js';
import { Rpg } from '../js/rpg.js';
import { roadHireOffer } from '../js/hire.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = p => JSON.parse(readFileSync(join(here, '..', p), 'utf8'));

const classData = read('data/classes.json');
const skillData = read('data/skills.json');
const classLooks = JSON.parse(readFileSync(join(here, '../../emberveil/data/class-looks.json'), 'utf8'));
const cbData = read('data/classbuild.json');
const mercData = read('data/mercenaries.json');
const balance = read('data/balance.json');
const items = JSON.parse(readFileSync(join(here, '../../emberveil/data/items.json'), 'utf8'));

/** A fresh copy of the three data objects, because `installCustomClass` mutates them. */
function freshData() {
  return {
    classData: JSON.parse(JSON.stringify(classData)),
    skillData: JSON.parse(JSON.stringify(skillData)),
    classLooks: JSON.parse(JSON.stringify(classLooks)),
  };
}

// ---------------------------------------------------------------------------- 1. the tier list

test('1.1 — the spell catalogue covers every skill every class hands out', () => {
  const cat = spellCatalogue({ classData, skillData, data: cbData });
  const everyClassSkill = new Set(Object.values(skillData.classes).flat());
  for (const id of everyClassSkill) {
    assert.ok(cat.byId.has(id), `${id} is handed out by a class and is not in the tier list`);
  }
  // …and the other way: nothing in the list is invented
  for (const s of cat.spells) {
    assert.ok(skillData.skills[s.id], `${s.id} is in the tier list and not in data/skills.json`);
  }
  assert.equal(cat.spells.length, Object.keys(skillData.skills).length);
});

test('1.2 — a spell\'s tier is the EARLIEST level any class grants it on', () => {
  const cat = spellCatalogue({ classData, skillData, data: cbData });
  const unlockAt = skillData.unlockAt;
  for (const [, ids] of Object.entries(skillData.classes)) {
    ids.forEach((id, i) => {
      const at = unlockAt[i] ?? unlockAt[unlockAt.length - 1];
      assert.ok(cat.byId.get(id).tier <= at, `${id} is offered at ${at} by a class and tiered later`);
    });
  }
  // power_strike is a level-1 skill for the warrior, so it is tier 1 even though the rogue gets it
  // in slot 4; meteor is nobody's opening
  assert.equal(cat.byId.get('power_strike').tier, 1);
  assert.equal(cat.byId.get('meteor').tier, 24);
});

test('1.3 — the two ladders must agree, and a mismatch throws rather than going quiet', () => {
  const bent = JSON.parse(JSON.stringify(cbData));
  bent.tiers[3].level = 13;                       // skills.json says 12
  assert.throws(() => spellCatalogue({ classData, skillData, data: bent }), /do not match/);
});

// ---------------------------------------------------------------------------- 2. the point-buy

test('2.1 — a pick matches the EXISTING unlock ladder, slot for slot', () => {
  const cat = spellCatalogue({ classData, skillData, data: cbData });
  assert.deepEqual(cat.unlockAt, skillData.unlockAt);
  const build = createBuild(cbData);
  const slots = slotsOf(build, cat);
  assert.equal(slots.length, PICK_COUNT);
  slots.forEach((s, i) => assert.equal(s.level, skillData.unlockAt[i]));
  // slot 1 opens at level 1, so a level-24 spell cannot go in it
  assert.match(pickRefusal(build, 0, 'meteor', cat), /level 24 spell/);
  // …and every option offered for a slot is genuinely takeable
  for (const s of slots) for (const opt of s.options) assert.ok(opt.tier <= s.level);
});

test('2.2 — nothing may be picked twice', () => {
  const cat = spellCatalogue({ classData, skillData, data: cbData });
  const build = createBuild(cbData);
  assert.equal(pickSpell(build, 0, 'power_strike', cat).ok, true);
  // R20 — slot 2 opens at level 3, so the duplicate check needs a character who has got there
  const again = pickSpell(build, 1, 'power_strike', cat, { level: MAX_LEVEL });
  assert.equal(again.ok, false);
  assert.match(again.why, /already in slot 1/);
});

test('2.3 — unlearn hands back exactly one pick, and it can be spent again', () => {
  const cat = spellCatalogue({ classData, skillData, data: cbData });
  const build = createBuild(cbData);
  pickSpell(build, 0, 'power_strike', cat, { level: MAX_LEVEL });
  pickSpell(build, 1, 'cleave', cat, { level: MAX_LEVEL });
  const before = build.spells.filter(Boolean).length;
  assert.equal(before, 2);

  const out = unlearnSpell(build, 0);
  assert.equal(out.ok, true);
  assert.equal(out.refunded, 'power_strike');
  assert.equal(build.spells.filter(Boolean).length, before - 1, 'exactly one pick came back');
  assert.equal(build.spells[1], 'cleave', 'and nothing else moved');

  // the slot it came out of is spendable again, on the same spell or a different one
  assert.equal(pickSpell(build, 0, 'aimed_shot', cat, { level: MAX_LEVEL }).ok, true);
  assert.equal(build.spells.filter(Boolean).length, before);
  // unlearning an empty slot refunds nothing at all
  assert.equal(unlearnSpell(build, 5).ok, false);
});

// ---------------------------------------------------------------------------- 3. the loadout

test('3.1 — every loadout names weapons and armour the game actually has', () => {
  for (const l of cbData.loadouts) {
    assert.ok(items.weaponBases[l.main], `${l.id} main: no base called ${l.main}`);
    if (l.off) assert.ok(items.weaponBases[l.off], `${l.id} off: no base called ${l.off}`);
    if (l.offArmour) assert.ok(items.armorBases[l.offArmour], `${l.id} offArmour: ${l.offArmour}`);
    for (const key of cbData.armour[l.armour] || []) {
      assert.ok(items.armorBases[key], `${l.id} armour tier ${l.armour}: ${key}`);
    }
  }
});

test('3.2 — two two-handers is refused without Doubled Grasp and allowed with it', () => {
  const forest = buildForest();
  const loadout = cbData.loadouts.find(l => l.id === 'doubled_two_handers');
  assert.ok(loadout, 'the dual two-hander loadout exists');
  assert.equal(loadout.needsPerk, 'doubled_grasp');

  // nobody, and a character who has taken nothing
  assert.match(loadoutRefusal(loadout, { player: null, forest }), /Doubled Grasp/);
  assert.match(loadoutRefusal(loadout, { player: { perks: [] }, forest }), /Doubled Grasp/);

  // the keystone is a NODE in the forest; a save carries the node id, not the keystone id
  const node = [...forest.byId.values()].find(n => n.keystoneId === 'doubled_grasp');
  assert.ok(node, 'the melee arm ends in Doubled Grasp');
  assert.equal(loadoutRefusal(loadout, { player: { perks: [node.id] }, forest }), null);

  // every other loadout is available to anybody
  for (const l of cbData.loadouts.filter(x => !x.needsPerk)) {
    assert.equal(loadoutRefusal(l, { player: { perks: [] }, forest }), null, l.id);
  }
});

test('3.3 — a branded loadout will not start without an element, and every element is a real one', () => {
  const build = createBuild(cbData);
  build.loadout = 'elemental_staff';
  build.element = null;
  const cat = spellCatalogue({ classData, skillData, data: cbData });
  fillAll(build, cat);
  assert.match(buildRefusal(build, cat, cbData), /element/);
  build.element = 'fire';
  assert.equal(buildRefusal(build, cat, cbData), null);
});

// ---------------------------------------------------------------------------- 4. installing it

test('4.1 — a custom build becomes a class the rest of the game can read', () => {
  const d = freshData();
  const cat = spellCatalogue({ ...d, data: cbData });
  const build = createBuild(cbData);
  build.loadout = 'longbow';
  build.name = 'Roadwarden';
  const want = ['aimed_shot', 'poison_dart', 'multi_shot', 'mend', 'pinning_shot', 'rain_of_arrows'];
  want.forEach((id, i) => assert.equal(pickSpell(build, i, id, cat, { level: MAX_LEVEL }).ok, true, `${id} in slot ${i}`));

  const def = installCustomClass({ ...d, data: cbData, build });
  assert.equal(def.id, 'custom');
  assert.equal(def.name, 'Roadwarden');
  assert.equal(def.starter, 'bow');
  assert.deepEqual(def.skills, want);
  // the three tables main.js reads
  assert.ok(d.classData.classes.find(c => c.id === 'custom'), 'classData carries it');
  assert.deepEqual(d.skillData.classes.custom, want, 'skillData carries the picks in slot order');
  assert.ok(d.classLooks.classes.custom, 'and there is a body to walk around in');

  // …and the skill bar built from it is the six that were picked, unlocked on the real ladder
  const player = { classId: 'custom', level: 1, derived: {}, perkFlags: {} };
  const bar = createSkillBar({ data: d.skillData, player, rpg: null });
  assert.deepEqual(bar.slots.map(s => s.id), want);
  assert.deepEqual(bar.slots.map(s => s.unlockAt), skillData.unlockAt);

  // installing a second time replaces rather than adding a second "custom"
  installCustomClass({ ...d, data: cbData, build });
  assert.equal(d.classData.classes.filter(c => c.id === 'custom').length, 1);
  removeCustomClass({ ...d, data: cbData });
  assert.equal(d.classData.classes.filter(c => c.id === 'custom').length, 0);
});

test('4.2 — the in-game respec reaches the KEYS, not only the screen', () => {
  const d = freshData();
  const cat = spellCatalogue({ ...d, data: cbData });
  const build = createBuild(cbData);
  const want = ['power_strike', 'cleave', 'curse', 'drain', 'whirlwind', 'execute'];
  want.forEach((id, i) => pickSpell(build, i, id, cat, { level: MAX_LEVEL }));
  installCustomClass({ ...d, data: cbData, build });

  const player = { classId: 'custom', level: 30, derived: {}, perkFlags: {} };
  const bar = createSkillBar({ data: d.skillData, player, rpg: null });
  assert.equal(bar.slots[2].id, 'curse');

  // unlearn slot 3 and spend it on something else — this is the whole of "unlearn at any time"
  unlearnSpell(build, 2);
  pickSpell(build, 2, 'smoke', cat, { level: MAX_LEVEL });
  installCustomClass({ ...d, data: cbData, build });
  bar.relearn(d.skillData.classes.custom);
  assert.equal(bar.slots[2].id, 'smoke', 'key 3 fires the new spell, not the old one');
  assert.equal(bar.slots[2].unlockAt, skillData.unlockAt[2]);
});

// ---------------------------------------------------------------------------- 5. the opening kit

test('5.1 — the bonus crate rolls three items and none of them is worse than magic', () => {
  const rpg = new Rpg(items, { ...balance, seed: 7 });
  for (let seed = 1; seed <= 25; seed++) {
    const got = rollStartingCrate({ rpg, spec: cbData.opening.crate, level: 1 });
    assert.equal(got.length, 3, 'three items, every time');
    for (const item of got) {
      assert.ok(atLeastRarity(item, 'magic'), `${item.name} came out ${item.rarity}`);
    }
  }
});

test('5.2 — choosing the crate pays the gold and fills the bag; choosing a companion does not', () => {
  const d = freshData();
  const cat = spellCatalogue({ ...d, data: cbData });
  const rpg = new Rpg(items, { ...balance, seed: 11 });

  const build = createBuild(cbData);
  fillAll(build, cat);
  build.opening = { kind: 'crate', companion: null };
  const def = installCustomClass({ ...d, data: cbData, build });

  const player = rpg.createPlayer({ name: 'Test', classId: 'custom' });
  const goldBefore = player.gold || 0;
  const out = applyOpeningKit({ player, rpg, classDef: def, data: cbData });
  assert.equal(out.ok, true);
  assert.equal(out.items.length, 3);
  assert.equal(player.gold, goldBefore + cbData.opening.crate.gold);
  assert.ok(player.bag.length >= 3);
  // …and it is paid exactly once, however many times the hook runs
  assert.equal(applyOpeningKit({ player, rpg, classDef: def, data: cbData }).ok, false);

  // the companion branch instead: no crate, no gold, and a `pet` the class carries like any other
  const d2 = freshData();
  const build2 = createBuild(cbData);
  fillAll(build2, cat);
  build2.opening = { kind: 'companion', companion: 'grove_wolf' };
  const def2 = installCustomClass({ ...d2, data: cbData, build: build2 });
  assert.deepEqual(def2.pet, { id: 'grove_wolf', count: 1, verb: 'is followed by' });
  const p2 = rpg.createPlayer({ name: 'Test2', classId: 'custom' });
  const gold2 = p2.gold || 0;
  const out2 = applyOpeningKit({ player: p2, rpg, classDef: def2, data: cbData });
  assert.equal(out2.items.length, 0);
  assert.equal(p2.gold, gold2);
});

test('5.3 — a dual loadout puts a second weapon in the off hand, and the element is honoured', () => {
  const d = freshData();
  const cat = spellCatalogue({ ...d, data: cbData });
  const rpg = new Rpg(items, { ...balance, seed: 3 });

  const build = createBuild(cbData);
  fillAll(build, cat);
  build.loadout = 'knife_pair';
  const def = installCustomClass({ ...d, data: cbData, build });
  const player = rpg.createPlayer({ name: 'Two Knives', classId: 'custom' });
  // main.js equips the starter before the hook runs, so the test does the same
  const starter = rpg.loot.generate(def.starter, 'normal', 'low', { rng: rpg.rng });
  rpg.equip(player, starter, { force: true });
  applyOpeningKit({ player, rpg, classDef: def, data: cbData });
  assert.ok(player.equipment.offhand, 'the second dagger went in the off hand');

  // a branded caster comes out attuned to the element that was chosen, not to a hash of its id
  const d2 = freshData();
  const build2 = createBuild(cbData);
  fillAll(build2, cat);
  build2.loadout = 'wand_focus';
  build2.element = 'ice';
  const def2 = installCustomClass({ ...d2, data: cbData, build: build2 });
  const p2 = rpg.createPlayer({ name: 'Rime', classId: 'custom' });
  const wand = rpg.loot.generate(def2.starter, 'normal', 'low', { rng: rpg.rng });
  rpg.equip(p2, wand, { force: true });
  applyOpeningKit({ player: p2, rpg, classDef: def2, data: cbData });
  assert.equal(p2.equipment.weapon.castElement, 'ice');
});

// ---------------------------------------------------------------------------- 6. follower slots

test('6.1 — three slots at level 1, four at 20, five at 30', () => {
  const rules = mercData.slots;
  assert.equal(slotsForLevel(1, null, rules), 3);
  assert.equal(slotsForLevel(19, null, rules), 3);
  assert.equal(slotsForLevel(20, null, rules), 4);
  assert.equal(slotsForLevel(29, null, rules), 4);
  assert.equal(slotsForLevel(30, null, rules), 5);
  assert.equal(slotsForLevel(50, null, rules), 5, 'and no more from levels alone');
});

test('6.2 — The Kept Company moves the FOLLOWER limit and no longer moves a summon\'s count', () => {
  const arm = ARMS.find(a => a.key === 'wild');
  assert.equal(arm.name, 'The Kept Company');

  // nothing in the arm or its keystone grants the old `petSlots` any more
  const armStats = [...arm.minor, ...arm.major].map(([stat]) => stat);
  assert.ok(!armStats.includes('petSlots'), 'the arm no longer grants petSlots');
  assert.ok(armStats.includes('followerSlots'), 'the arm grants followerSlots');
  const pack = KEYSTONES.find(k => k.id === 'the_pack');
  assert.equal(pack.grants.petSlots, undefined, 'The Pack no longer grants petSlots');
  assert.equal(pack.grants.followerSlots, 2);

  // a character who has taken the node has one more slot and one more of each summon
  const forest = buildForest();
  const node = [...forest.byId.values()].find(n => n.grants?.followerSlots);
  assert.ok(node, 'there is a node in the forest that grants it');
  const { stats } = perkBonuses({ perks: [node.id] }, forest);
  assert.ok(stats.followerSlots >= 1);
  assert.equal(slotsForLevel(1, stats, mercData.slots), 3 + stats.followerSlots);
  assert.equal(perTypeCapFor({ spellCount: 1, derived: stats, rules: mercData.perType }), 1 + stats.followerSlots);

  // …and a summoning SKILL still puts down only what its own row says
  const player = { classId: 'necromancer', level: 40, mp: 999, maxMp: 999, hp: 999, maxHp: 999, derived: { ...zeroDerived(), ...stats }, perkFlags: {} };
  const bar = createSkillBar({ data: skillData, player, rpg: fakeRpg() });
  const at = bar.slots.findIndex(s => s.shape === 'summon');
  const plan = bar.use(at);
  assert.equal(plan.ok, true);
  assert.equal(plan.petCount, skillData.skills[bar.slots[at].id].count || 1,
    'the cast puts down the spell\'s own number and the perk adds nothing to it');
  assert.equal(plan.petCap, (skillData.skills[bar.slots[at].id].count || 1) + stats.followerSlots,
    'the perk raises the CAP instead');
});

test('6.3 — the old petSlots affix still counts for something rather than going dead', () => {
  // js/effects.js is not this round's file and still grants `petSlots` from `cond_companionExtra`.
  // An affix nobody reads is the fault this whole round is about, so both keys are added up.
  assert.equal(followerBonus({ followerSlots: 1, petSlots: 1 }), 2);
  assert.equal(slotsForLevel(1, { petSlots: 2 }, mercData.slots), 5);
});

// ---------------------------------------------------------------------------- 7. the summon caps

test('7.1 — one per type, unless the spell itself says otherwise', () => {
  const capOf = (count, derived) => perTypeCapFor({ spellCount: count, derived, rules: mercData.perType });
  assert.equal(capOf(1, null), 1);
  assert.equal(capOf(3, null), 3, 'a spell that summons three may have three');
  assert.equal(capOf(1, { followerSlots: 2 }), 3);

  const wolves = [{ defId: 'grove_wolf', origin: 'summon' }];
  const second = admit({ defId: 'grove_wolf', origin: 'summon', alive: wolves, limit: 5, perTypeCap: 1, name: 'a wolf' });
  assert.equal(second.ok, false);
  assert.match(second.why, /One of each kind/);
  // a different creature is fine — the cap is per type
  assert.equal(admit({ defId: 'bone_thrall', origin: 'summon', alive: wolves, limit: 5, perTypeCap: 1 }).ok, true);
});

test('7.2 — "If you have 5 follower slots and hire 4 mercenaries, you can only summon one wolf"', () => {
  // five slots is level 30 with no perks, which is exactly the ladder above
  const limit = slotsForLevel(30, null, mercData.slots);
  assert.equal(limit, 5);

  const company = [
    { defId: 'blade_for_hire', origin: 'mercenary' },
    { defId: 'longshot', origin: 'mercenary' },
    { defId: 'field_mender', origin: 'mercenary' },
    { defId: 'shield_warden', origin: 'mercenary' },
  ];
  const cap = perTypeCapFor({ spellCount: 1, derived: null, rules: mercData.perType });

  // the fifth slot admits one wolf
  const first = admit({ defId: 'grove_wolf', origin: 'summon', alive: company, limit, perTypeCap: cap, name: 'a wolf' });
  assert.equal(first.ok, true, 'the one free slot takes the wolf');

  // …and the second wolf has nowhere to stand
  company.push({ defId: 'grove_wolf', origin: 'summon' });
  const second = admit({ defId: 'grove_wolf', origin: 'summon', alive: company, limit, perTypeCap: cap, name: 'a wolf' });
  assert.equal(second.ok, false, 'and only one');
  assert.match(second.why, /5 of 5 follower slots/);

  // nor does a fifth mercenary
  assert.equal(admit({ defId: 'blade_for_hire', origin: 'mercenary', alive: company, limit, perTypeCap: cap }).ok, false);
});

test('7.3 — the gate is installed ON js/pets.js, so every door asks the same question', async () => {
  const pets = fakePets();
  const player = { level: 30, gold: 100000, derived: zeroDerived(), followers: { contracts: [] } };
  const followers = createFollowers({
    data: mercData, skillData, pets, getPlayer: () => player, getAt: () => ({ x: 0, z: 0 }),
  });
  assert.equal(followers.limit(), 5);

  for (const id of ['blade_for_hire', 'longshot', 'field_mender', 'shield_warden']) {
    const out = await followers.hire(id, {});
    assert.equal(out.ok, true, `${id} was hired`);
  }
  assert.equal(followers.report().used, 4);
  assert.equal(followers.report().free, 1);

  // the last slot takes one wolf and then refuses, through pets.summon rather than around it
  const made = await pets.summon('grove_wolf', player, { count: 3, origin: 'summon' });
  assert.equal(made.length, 1, 'three were asked for and one slot was free');
  assert.match(made.refused, /5 of 5 follower slots/);

  // let one mercenary go and the slot comes straight back
  const who = followers.report().followers.find(f => f.origin === 'mercenary');
  assert.equal(followers.dismiss(who.uid).ok, true);
  assert.equal(followers.report().free, 1);
  assert.equal(followers.contracts().length, 3, 'and the contract went with them');
});

// ---------------------------------------------------------------------------- 8. mercenaries

test('8.1 — every mercenary type is whole, and its upgrades name spells that exist', () => {
  assert.ok(mercData.mercenaries.length >= 6, 'a VARIETY of types, not one');
  const roles = new Set(mercData.mercenaries.map(m => m.role));
  assert.ok(roles.size >= 4, `only ${roles.size} kinds of fighter`);
  for (const m of mercData.mercenaries) {
    assert.ok(m.id && m.name && m.blurb, `${m.id} is missing its words`);
    assert.ok(m.hp > 0 && m.dmg?.length === 2, `${m.id} has no numbers`);
    assert.ok(m.look?.avatar, `${m.id} has no body`);
    assert.ok((m.abilities || []).length >= 1, `${m.id} has no spells of its own`);
    for (const a of m.abilities) {
      assert.ok(a.name && a.cooldown > 0, `${m.id}/${a.id} is not a castable thing`);
      if (a.status) assert.ok(skillData.statuses[a.status], `${m.id}/${a.id}: no status ${a.status}`);
    }
    for (const up of m.upgrades || []) {
      assert.ok(up.atLevel > 1, `${m.id} upgrade at level ${up.atLevel}`);
      if (up.ability) {
        const known = mercData.abilities[up.ability] || m.abilities.some(a => a.id === up.ability);
        assert.ok(known, `${m.id} grows into ${up.ability} and nothing defines it`);
      }
    }
  }
});

test('8.2 — a broker\'s board is the same board for the same place and week', () => {
  const a = boardFor({ mercenaries: mercData.mercenaries, townId: 12, townSize: 4, level: 20, day: 5, scaling: mercData.scaling });
  const b = boardFor({ mercenaries: mercData.mercenaries, townId: 12, townSize: 4, level: 20, day: 5, scaling: mercData.scaling });
  assert.deepEqual(a.map(m => m.id), b.map(m => m.id), 'walking out and back in does not reshuffle it');
  const later = boardFor({ mercenaries: mercData.mercenaries, townId: 12, townSize: 4, level: 20, day: 40, scaling: mercData.scaling });
  assert.notDeepEqual(a.map(m => m.id), later.map(m => m.id), 'and it does restock');
  // a hamlet cannot support the expensive ones
  const hamlet = boardFor({ mercenaries: mercData.mercenaries, townId: 3, townSize: 1, level: 1, day: 1, scaling: mercData.scaling });
  for (const m of hamlet) assert.ok((m.minTownSize ?? 1) <= 1 && (m.minLevel ?? 1) <= 3, m.id);
  // and a price climbs with the level of the person buying
  const cheap = priceOf(mercData.mercenaries[0], 1, mercData.scaling);
  const dear = priceOf(mercData.mercenaries[0], 30, mercData.scaling);
  assert.ok(dear > cheap * 2, `${cheap} -> ${dear}`);
});

test('8.3 — the road captain sells one of the ten types rather than always the same sellsword', () => {
  const opts = { mercenaries: mercData.mercenaries, playerLevel: 20, gold: 99999, scaling: mercData.scaling };
  const seen = new Set();
  for (const id of ['w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8']) {
    const offer = roadHireOffer({ id, name: 'A captain' }, opts);
    assert.ok(offer.mercId, 'the offer says which type it is');
    assert.ok(offer.rows.some(r => r[0] === 'Casts'), 'and what they cast');
    seen.add(offer.mercId);
    // the same person always sells the same thing
    assert.equal(roadHireOffer({ id, name: 'A captain' }, opts).mercId, offer.mercId);
  }
  assert.ok(seen.size > 1, 'and it is not one product with extra words');
});

// ---------------------------------------------------------------------------- 9. levelling

test('9.1 — a follower\'s numbers track its owner\'s level', () => {
  const def = mercData.mercenaries.find(m => m.id === 'blade_for_hire');
  const perLevel = balance.pets?.perLevel ?? 1.13;
  const at1 = scaleFollower({ def, level: 1, perLevel });
  const at20 = scaleFollower({ def, level: 20, perLevel });
  assert.equal(at1.hp, def.hp);
  assert.ok(at20.hp > at1.hp * 8, `level 20 health ${at20.hp} against ${at1.hp}`);
  assert.ok(at20.dmg[0] > at1.dmg[0] * 8);
  // the exact promise: the same compounding step the class companions have always used
  assert.equal(at20.hp, Math.round(def.hp * Math.pow(perLevel, 19)));

  /**
   * R22 — AND IT IS THE SAME STEP THE ENEMIES USE, WHICH IT WAS NOT.
   *
   * `pets.perLevel` was 1.17 against `enemies.perLevel` 1.13, so a companion's share of a kill grew
   * by (1.17/1.13)^(level-1) — 2.1x by 22 and 5.5x by 50 — and a hired blade went from "helps" to
   * "kills everything before you have swung". This is the assertion that keeps them together: the
   * rule is that they are the SAME NUMBER, not that either one is any particular value.
   */
  assert.equal(balance.pets.perLevel, balance.enemies.perLevel,
    'a companion grows at a different rate from the things it fights');
  assert.equal(mercData.scaling.perLevel, balance.enemies.perLevel,
    'a mercenary grows at a different rate from a class companion');

  /**
   * R22 — and matching the exponents is only half of it, because the player's own damage is not an
   * exponent at all: it comes out of the weapon in their hand. `ownerDamage` is the ceiling that
   * relates the two. Under it nothing changes; over it a companion is pulled back to a share.
   */
  const capped = scaleFollower({ def, level: 20, perLevel, ownerDamage: [20, 40] });
  assert.ok(capped.dmg[1] <= 40 * 0.75 + 1, `a companion out-hits its owner: ${capped.dmg.join('-')}`);
  assert.ok(capped.dmg[0] < capped.dmg[1], 'the capped pair kept its spread');
  const loose = scaleFollower({ def, level: 20, perLevel, ownerDamage: [4000, 9000] });
  assert.deepEqual(loose.dmg, at20.dmg, 'the ceiling changed a companion that was nowhere near it');

  // …and an upgrade is applied to the BASE numbers rather than compounding on every re-cost
  const grown = { dmgMult: 1.16, hpMult: 1, armorAdd: 12 };
  const up = scaleFollower({ def, level: 20, perLevel, grown });
  assert.equal(up.dmg[0], Math.round(def.dmg[0] * Math.pow(perLevel, 19) * 1.16));
  assert.equal(up.armor, at20.armor + 12);
});

test('9.2 — the upgrade thresholds are data, and every type grows into something', () => {
  for (const m of mercData.mercenaries) {
    assert.ok((m.upgrades || []).length >= 1, `${m.id} never gets any better`);
    const levels = m.upgrades.map(u => u.atLevel);
    assert.deepEqual(levels, [...levels].sort((a, b) => a - b), `${m.id}'s upgrades are out of order`);
    const grows = m.upgrades.some(u => u.held || u.offhand || u.top || u.dmgMult || u.hpMult);
    const learns = m.upgrades.some(u => u.ability);
    assert.ok(grows || learns, `${m.id} has upgrades that do nothing`);
  }
  // "some companions should equip better weapons or learn new skills" — both, across the ten
  assert.ok(mercData.mercenaries.some(m => m.upgrades.some(u => u.held || u.offhand || u.top)));
  assert.ok(mercData.mercenaries.some(m => m.upgrades.some(u => u.ability)));
});

// ---------------------------------------------------------------------------- helpers

/**
 * Fill every slot with the first thing that fits it.
 *
 * NOT `cat.tiers[i].spells[0]`, which is the trap the first version of this file fell into: tier 5
 * (level 18) has no spells of its own at all — no class hands anything out for the first time at
 * 18 — and a slot takes anything at or below its level, not only things of exactly its tier.
 */
function fillAll(build, cat, level = MAX_LEVEL) {
  for (let i = 0; i < PICK_COUNT; i++) {
    const options = slotsOf(build, cat, { level })[i].options;
    pickSpell(build, i, options[0].id, cat, { level });
  }
  return build;
}

/**
 * R20 — a level past the last rung of the ladder.
 *
 * A pick is now gated by how far the character has actually got: the title screen builds a level-1
 * character and so may only fill the opening slot, and the other five are chosen from the
 * character sheet as the levels come. Everything in this file that wants a FULL build is therefore
 * building one for somebody who has reached level 24, which is what `MAX_LEVEL` says out loud.
 */
const MAX_LEVEL = 99;

/** Everything `rpg.derive` declares that this file's callers read, at zero. */
function zeroDerived() {
  return {
    damage: [10, 14], spellPower: 0, cooldownReduction: 0, followerSlots: 0, petSlots: 0,
    maxHp: 100, maxMp: 100,
  };
}

/** Enough of `rpg` for `createSkillBar` to build a plan. */
function fakeRpg() {
  return { fx: { sum: () => 0, product: () => 1 } };
}

/**
 * A stand-in for js/pets.js — the same three-method contract the follower book uses, and nothing
 * else. js/pets.js imports Three.js, so it cannot be opened in node at all; what CAN be tested is
 * that the book asks the gate for every door, which is the whole of job 10.
 */
function fakePets() {
  const list = [];
  let gate = null;
  const defs = new Map();
  let n = 0;
  return {
    pets: list,
    register: def => { defs.set(def.id, def); return def; },
    setGate: fn => { gate = fn; },
    waiting: () => [],
    async summon(defId, owner, { count = 1, origin = 'summon', name = null } = {}) {
      const def = defs.get(defId) || { id: defId, name: defId, hp: 40, dmg: [4, 6] };
      const made = [];
      made.refused = null;
      for (let i = 0; i < count; i++) {
        const allow = gate ? gate(defId, { origin, name: name || def.name }) : { ok: true };
        if (!allow.ok) { made.refused = allow.why; break; }
        const unit = {
          id: 'u' + (++n), defId, origin, name: name || def.name,
          hp: def.hp, maxHp: def.hp, level: owner.level || 1, dying: null,
          state: 'follow', abilities: [],
        };
        list.push(unit);
        made.push(unit);
      }
      return made;
    },
    remove(uid) {
      const i = list.findIndex(p => p.id === uid);
      if (i < 0) return false;
      list.splice(i, 1);
      return true;
    },
  };
}
