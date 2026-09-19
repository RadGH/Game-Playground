// node --test prototypes/farhold/tests/weapon-facts.test.js
//
// Round 12, items 4.7, 4.13 and 4.18 — three things the player could not see.
//
//   4.7  "I got a weapon called 'truthseeker' that shoots a projectile. How am I supposed to know
//         that without testing it? All weapons should indicate if they are melee or ranged, and one
//         hand or two handed. Wands and staves should also display their element type."
//   4.13 "Make it so boats, at least the starting raft, goes faster - approx the same speed as a
//         horse."
//   4.18 "I found a mercenary in town who joined me but it should have opened a dialog where they
//         offered to join me and I was able to accept/deny."
//
// All three are pure data and arithmetic, so all three are testable without a browser.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  weaponFacts, describeWeapon, familyOf, isRangedWeapon, patternText, handedText, SHOT_REACH,
} from '../js/weapons.js';
import { Rpg, attuneWeapon } from '../js/rpg.js';
import { VEHICLES, HORSE_PACE } from '../js/gear.js';
import { hireOffer, HIRE_ROLE_WORDS } from '../js/hire.js';
import { hasLongDecimal } from '../../../shared/format.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = f => JSON.parse(readFileSync(join(here, f), 'utf8'));
const items = read('../../emberveil/data/items.json');
const balance = read('../data/balance.json');
const enemies = read('../data/enemies.json');
const rpg = new Rpg(items, balance);
const make = (key, level = 10) => attuneWeapon(rpg.loot.generate(key, 'normal', 'medium', { level }));

// ------------------------------------------------------------------ 4.7 — say what you are

test('every weapon base says melee or ranged and one hand or two, with no gaps', () => {
  const bases = Object.entries(items.weaponBases);
  assert.ok(bases.length > 40, 'the base list did not load');
  for (const [key, base] of bases) {
    if (base.type !== 'weapon') continue;
    const item = make(key);
    if (!item) continue;
    const f = weaponFacts(item);

    assert.ok(f.tags.length === 3, `${key}: ${f.tags.length} facts, wanted three`);
    assert.ok(f.tags[0] === 'Melee' || f.tags[0] === 'Ranged', `${key} is neither melee nor ranged`);
    assert.ok(f.tags[1] === 'One-handed' || f.tags[1] === 'Two-handed', `${key} does not say how many hands`);
    assert.ok(f.tags[2] && f.tags[2] !== 'Weapon', `${key} has no family word`);
    assert.ok(f.headline.includes('·'), `${key} headline "${f.headline}" is not the three-part line`);
    assert.ok(f.line.length > 20, `${key} has no sentence`);
    assert.ok(f.handNote, `${key} never says what happens to the off hand`);
    // the written line must never leak a float tail — shared/format.js exists for this
    assert.ok(!hasLongDecimal(f.line), `${key}: "${f.line}"`);
    assert.ok(!hasLongDecimal(patternText(item)), `${key}: "${patternText(item)}"`);
    assert.ok(!hasLongDecimal(handedText(item)), `${key}: "${handedText(item)}"`);

    // the facts and the old flags must agree, or two screens will say different things
    assert.equal(f.ranged, isRangedWeapon(item), `${key} disagrees with itself about range`);
    assert.equal(f.hands, item.hands, `${key}: facts say ${f.hands} hands, markHands says ${item.hands}`);
  }
});

test('a bow is ranged and two-handed; a sword is melee and one-handed', () => {
  const bow = make('bow');
  assert.equal(weaponFacts(bow).ranged, true);
  assert.equal(weaponFacts(bow).twoHanded, true);
  assert.equal(weaponFacts(bow).family, 'Bow');
  assert.match(weaponFacts(bow).headline, /^Ranged · Two-handed · Bow$/);

  const sword = make('sword');
  assert.equal(weaponFacts(sword).ranged, false);
  assert.equal(weaponFacts(sword).twoHanded, false);
  assert.match(weaponFacts(sword).headline, /^Melee · One-handed · Sword$/);

  // a javelin is thrown, and this game's rule is that throwing takes both hands
  const javelin = make('javelin');
  assert.equal(weaponFacts(javelin).ranged, true);
  assert.equal(weaponFacts(javelin).hands, 2);
  assert.match(weaponFacts(javelin).line, /thrown/);
});

test('Truthseeker — the weapon that started this — says it shoots, and what it shoots', () => {
  // it is a unique on the `wand` base, so it was ranged and elemental and admitted to neither
  const unique = rpg.loot.generateUnique
    ? attuneWeapon(rpg.loot.generateUnique('truthseeker', rpg.rng))
    : null;
  assert.ok(unique, 'Truthseeker did not generate');
  const f = weaponFacts(unique);
  assert.equal(f.ranged, true, 'Truthseeker still does not say it shoots');
  assert.equal(f.hands, 1);
  assert.ok(f.elementName, 'a wand with no element on the card is the original complaint');
  assert.match(f.headline, /^Ranged · One-handed · \w+ Wand$/);
  assert.ok(f.castLine.includes('bolt'), `castLine was "${f.castLine}"`);
  assert.ok(f.castLine.includes('34'), 'the card never says how far the bolt carries');
  // and the fields are written onto the item, which is what hud.js reads
  assert.equal(unique.rangeClass, 'ranged');
  assert.equal(unique.gripWord, 'One-handed');
  assert.ok(unique.weaponHeadline && unique.weaponLine && unique.elementNote);
});

test('every wand and staff shows its element; plain steel shows none', () => {
  for (const key of ['wand', 'scepter', 'staff', 'orb', 'tome', 'emberbrand_wand', 'bramble_staff']) {
    const item = make(key);
    if (!item) continue;
    const f = weaponFacts(item);
    assert.ok(f.elementName, `${key} has no element word`);
    assert.ok(f.elementNote.includes(f.elementName), `${key}: "${f.elementNote}"`);
    assert.ok(f.tags[2].startsWith(f.elementName) || f.tags[2].includes(f.elementName),
      `${key}: the headline "${f.headline}" does not carry the element`);
  }
  // a staff casts instead of swinging, and says so rather than printing a swing rhythm
  const staff = make('staff');
  assert.ok(weaponFacts(staff).castLine.includes('spell'));
  assert.ok(patternText(staff).includes('spell'), 'a staff card still describes a swing');

  const sword = make('sword');
  assert.equal(weaponFacts(sword).elementName, null);
  assert.equal(weaponFacts(sword).castLine, null);
});

test('the shot ranges in weapons.js match the ones the game actually uses', () => {
  // SHOT_REACH is a copy, because weapons.js loads no data. This is the thing that stops it drifting.
  assert.equal(SHOT_REACH.bow, balance.player.arrowRange,
    'weapons.js SHOT_REACH.bow and balance.json player.arrowRange disagree');
  const wand = make('wand');
  assert.equal(SHOT_REACH.wand, wand.castRange,
    'weapons.js SHOT_REACH.wand and rpg.attuneWeapon castRange disagree');
});

test('a weapon bought in a shop describes itself exactly like one that dropped', () => {
  // town.js rolled its stock straight out of the generator, so a shop wand had no element at all
  // createTownFolk needs Three.js and a scene, so this reads the call rather than running it
  const src = readFileSync(join(here, '../js/town.js'), 'utf8');
  assert.match(src, /attuneWeapon\(rpg\.loot\.generate\(/,
    'shop stock is not attuned, so a wand on a shelf has no element and no headline');
});

test('familyOf finds the family of a road weapon with no table row of its own', () => {
  assert.equal(familyOf({ type: 'weapon', baseKey: 'obsidian_scimitar' }), 'Sabre');
  assert.equal(familyOf({ type: 'weapon', subtype: 'crossbow' }), 'Crossbow');
  assert.equal(familyOf(null), 'Fists');
});

test('describeWeapon leaves anything that is not a weapon alone', () => {
  const ring = { type: 'accessory', name: 'A ring' };
  describeWeapon(ring);
  assert.equal(ring.weaponHeadline, undefined);
  assert.equal(weaponFacts(ring).isWeapon, false);
});

// ------------------------------------------------------------------ 4.13 — the raft

test('the raft really is horse pace, and gear.js has not drifted from balance.json', () => {
  const horse = balance.player.moveSpeed * balance.player.mountSpeed;
  assert.equal(HORSE_PACE, horse, 'gear.js HORSE_PACE and balance.json disagree');
  const raft = VEHICLES.boat.kinds.raft;
  assert.ok(Math.abs(raft.speed - horse) / horse < 0.1,
    `the raft does ${raft.speed} m/s against a horse's ${horse}`);
  // …and it is a real change: it used to be 3.4, which is barely faster than swimming
  assert.ok(raft.speed > balance.player.swimSpeed * 3, 'the raft is still a floating log');
});

// ------------------------------------------------------------------ 4.18 — the hire offer

const captain = read('../data/wanderers.json').kinds.find(k => k.key === 'mercenary_captain');
const sellsword = enemies.pets.find(p => p.id === 'sellsword');

test('a mercenary makes an offer with a price, a purse and something to judge them by', () => {
  const o = hireOffer({ ...captain, name: 'Tolvi', level: 9 },
    { playerLevel: 9, gold: 500, pet: sellsword });
  assert.equal(o.kind, 'hire');
  assert.equal(o.name, 'Tolvi');
  assert.equal(o.price, captain.hire.gold);
  assert.equal(o.gold, 500);
  assert.equal(o.afford, true);
  assert.equal(o.refusal, null);
  assert.ok(o.acceptText.includes(String(o.price)), 'the button does not say the price');
  assert.ok(o.declineText, 'there is no way to say no');
  assert.ok(o.lines.length, 'the person says nothing');

  // what they bring: the things you would want to know before paying
  const labels = o.rows.map(r => r[0]);
  for (const want of ['Fights as', 'Level', 'Health', 'Hits for', 'Reach']) {
    assert.ok(labels.includes(want), `the offer never says "${want}"`);
  }
  const hits = o.rows.find(r => r[0] === 'Hits for')[1];
  assert.ok(hits.includes(String(captain.hire.dmg[0])), `"${hits}" does not carry the real damage`);
  for (const [, value] of o.rows) assert.ok(!hasLongDecimal(String(value)), `"${value}"`);
});

test('an offer you cannot afford says so instead of lighting the button', () => {
  const o = hireOffer(captain, { playerLevel: 3, gold: 12, pet: sellsword });
  assert.equal(o.afford, false);
  assert.match(o.refusal, /180 gold/);
  assert.match(o.refusal, /you have 12/);
});

test('the offer describes the body you actually get, not a stock character', () => {
  const o = hireOffer(captain, { playerLevel: 1, gold: 9999, pet: sellsword });
  const carrying = o.rows.find(r => r[0] === 'Carrying');
  assert.ok(carrying, 'the offer never says what they are armed with');
  assert.ok(carrying[1].includes('sword'), `"${carrying[1]}" does not match the sellsword's look`);
  const role = o.rows.find(r => r[0] === 'Fights as')[1];
  assert.ok(role.startsWith(HIRE_ROLE_WORDS[sellsword.role].name), `"${role}"`);
});

test('nothing to offer is not an offer', () => {
  assert.equal(hireOffer(null), null);
});

test('the talk panel can put an offer up on its own, and closing it decides nothing', () => {
  // talkui.js needs a document, so this reads its source — enough to catch the wiring going away.
  const src = readFileSync(join(here, '../js/talkui.js'), 'utf8');
  assert.match(src, /function showOffer\(/, 'the panel cannot show a standalone offer');
  assert.match(src, /show, showOffer, close, render/, 'showOffer is not exported from the panel');
  assert.match(src, /handlers\.hire\?\./, 'a hireable person in a town has no accept button');
  assert.match(src, /handlers\.declineHire\?\./, 'a hireable person in a town has no deny button');
  assert.match(src, /dismiss\?\./, 'walking away from an offer is treated as an answer');
});
