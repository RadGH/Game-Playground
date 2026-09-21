// node --test prototypes/farhold/tests/round14-combat.test.js
//
// Round 14 — weapon identity, the grip, and the balance pass.
//
// The user's brief was "make all weapon types more unique... hammers should smash, swords should
// slash, and polearms should add some range... melee weapons are currently terrible compared to
// ranged and wands". Each of those is a promise, and each of them is checkable:
//
//   * a hammer breaks armour and staggers, and nothing else does it as hard
//   * a sword's finisher is the widest cut a one-hander has
//   * a polearm's thrust out-reaches EVERY enemy in data/enemies.json by at least two metres
//   * the best damage per second in the game is a melee weapon, not a bow
//
// Everything here is pure arithmetic over the real modules and the real data.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  STRIKES, WEAPON_PATTERNS, WEAPON_TRAITS, RANGED, profileOf, strikeAt, traitsOf,
  isStaff, isWand, OFFHAND_DAMAGE, withArea,
} from '../js/weapons.js';
import { Rpg, heldLookFor, offhandLookFor, attuneWeapon } from '../js/rpg.js';
import { FARHOLD_WEAPON_INFO, FARHOLD_HELD, FARHOLD_OFFHAND_INFO } from '../../../avatar-3d/js/chibi2-weapon-ids.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = f => JSON.parse(readFileSync(join(here, f), 'utf8'));
const items = read('../../emberveil/data/items.json');
const balance = read('../data/balance.json');
const enemies = read('../data/enemies.json');
const rpg = new Rpg(items, balance);
// every weapon in the game passes through `attuneWeapon` — drop, chest, shelf, bench — so the
// tests generate one the same way the game does
const make = (key, level = 20) => attuneWeapon(rpg.loot.generate(key, 'normal', 'medium', { level }));

// ---------------------------------------------------------------- the fixed bugs

test('TWO_HANDED_SCALE no longer carries a damage share nobody reads', () => {
  const src = readFileSync(join(here, '../js/weapons.js'), 'utf8');
  const decl = src.match(/const TWO_HANDED_SCALE = \{[^}]*\}/)[0];
  assert.ok(!/damage/.test(decl),
    'the dead `damage: 1.25` is back — profileOf never returned it, so it did nothing for the life of the game');
});

test('the two-hander bonus is real now, and it reaches the weapons it was written for', () => {
  for (const key of ['greatsword', 'sword2h', 'axe2h', 'halberd']) {
    const item = make(key);
    assert.ok(profileOf(item).damageTrait >= 1.2, `${key} still collects nothing for taking both hands`);
    // …and it arrives on the strike, which is what main.js multiplies by
    assert.ok(strikeAt(item, 0).damage > strikeAt(item, 0).baseDamage, `${key}'s bonus never reaches the swing`);
  }
  // a one-hander does not get it
  assert.equal(profileOf(make('longsword')).damageTrait, 1);
});

test("a bow's rate of fire is designed rather than inherited from the dagger swing clock", () => {
  const bow = profileOf(make('bow'));
  const light = WEAPON_PATTERNS.dagger;
  assert.ok(WEAPON_PATTERNS.bow, 'a bow must have a row of its own');
  assert.ok(bow.every > light.every * 2, 'a bow should not fire at melee speed');
  assert.ok(RANGED.bow.kind === 'draw' && RANGED.bow.min > 0, 'a bow must have a draw');
  assert.ok(RANGED.crossbow.reload >= 1.2, 'a crossbow must have a reload');
  /**
   * R16 — A JAVELIN IS NOT COUNTED. "I do not want any ammunition system in the game at this
   * point." So the assertion is the other way round now: nothing in the ranged table may carry a
   * count, because a count is an ammunition system however small it is.
   */
  for (const [key, plan] of Object.entries(RANGED)) {
    assert.equal(plan.carried, undefined, `${key} carries ammunition, and nothing in this game does`);
  }
  // an arrow is no longer a free area attack
  assert.ok(balance.player.arrowSplash <= 1, 'an arrow should hit what you aimed at');
});

test('a quarterstaff is a pole, not a wand — even though items.json files it under magic', () => {
  const raw = items.weaponBases.quarterstaff;
  assert.equal(raw.weaponCategory, 'magic', 'the shared file is not ours to change, and should not have been');
  const item = make('quarterstaff');
  assert.equal(item.weaponCategory, 'light', 'attuneWeapon must reclassify it ON THE ITEM');
  assert.equal(isStaff(item), false, 'it must not cast a free area spell every 0.41 seconds');
  assert.equal(profileOf(item).pattern.join(','), 'jab,sweep,jab,sweep');
});

// ---------------------------------------------------------------- weapon identity

test('a hammer smashes: armour break, a stagger, and the heaviest finisher there is', () => {
  for (const key of ['hammer', 'warhammer']) {
    const t = traitsOf(make(key));
    assert.ok(t.armourBreak > 0, `${key} should strip armour`);
    assert.equal(t.guard ?? 0, 0, 'a hammer does not parry');
    assert.ok(profileOf(make(key)).pattern.includes('slam'), `${key} should finish with a smash`);
  }
  // nothing else pushes as hard or removes as much of a fight
  const most = Object.entries(STRIKES).sort((a, b) => b[1].push - a[1].push)[0][0];
  assert.equal(most, 'slam');
});

test('a sword slashes: the widest one-handed finisher in the game, and it flows', () => {
  const sword = profileOf(make('sword'));
  assert.equal(sword.pattern[2], 'arc', 'a sword should finish with a wide cut');
  const arc = strikeAt(make('sword'), 2);
  const thrust = strikeAt(make('rapier'), 0);
  assert.ok(arc.arc > thrust.arc * 3, 'the arc cut should cover far more ground than a thrust');
  assert.ok(traitsOf(make('obsidian_scimitar')).flow, 'a sabre rewards hitting');
  assert.ok((traitsOf(make('longsword')).guard ?? 0) > 0, 'a sword should parry a little');
});

test('THE POLEARM PROMISE: a halberd thrust out-reaches every enemy in the game', () => {
  const halberd = make('halberd');
  const thrust = strikeAt(halberd, 0);
  assert.equal(thrust.key, 'thrust');
  const worst = Math.max(...Object.values(enemies.enemies || enemies).map(e => e.reach || 0).filter(Number.isFinite));
  assert.ok(worst > 0, 'no enemy reach was found in data/enemies.json');
  assert.ok(thrust.reach >= worst + 2,
    `a halberd reaches ${thrust.reach.toFixed(1)} m and the longest enemy reach is ${worst} m — that is not "polearms add range"`);
  assert.ok(traitsOf(halberd).pierceLine >= 2, 'a halberd thrust should be a line through bodies, not a cone');
  assert.ok(traitsOf(halberd).brace > 0, 'standing your ground with a polearm should be worth something');
  // a spear is the one-handed version: shorter, fewer bodies, and the shield stays on
  const spear = make('spear');
  assert.ok(strikeAt(spear, 0).reach < thrust.reach);
  assert.ok(traitsOf(spear).pierceLine < traitsOf(halberd).pierceLine);
  assert.equal(spear.twoHanded ?? false, false);
});

test('a dagger trades raw damage for the back, and an axe for a cut that keeps working', () => {
  const dagger = traitsOf(make('dagger'));
  assert.ok(dagger.damage < 1, 'a dagger should not be the highest sustained damage in the game');
  assert.ok(dagger.backstab > 2, 'a dagger in the back should be worth taking one for');
  assert.ok(traitsOf(make('battleaxe')).bleed > 0, 'an axe should open a vein');
  assert.ok(traitsOf(make('rapier')).guard > 0, 'a rapier parries');
  assert.ok(STRIKES.lunge.pen > 0.35, 'a rapier lunge should go through armour');
});

test('every family in the pattern table has traits or a written reason not to', () => {
  const noTraits = ['longbow'];
  for (const key of Object.keys(WEAPON_PATTERNS)) {
    if (noTraits.includes(key)) continue;
    assert.ok(WEAPON_TRAITS[key], `${key} has a rhythm but no identity`);
  }
});

// ---------------------------------------------------------------- the balance pass

/** Damage per second for one weapon, from the real modules, at level 20 with identical gear. */
function dpsOf(key, { offKey = null } = {}) {
  const weapon = make(key, 20);
  const unit = {
    level: 20, xp: 0, str: 30, dex: 30, int: 30, con: 10,
    equipment: { weapon }, perkFlags: {}, perks: [], talents: [],
  };
  if (offKey) unit.equipment.offhand = make(offKey, 20);
  const d = rpg.derive(unit);
  const profile = profileOf(weapon);
  const avg = (d.damage[0] + d.damage[1]) / 2;
  let total = 0, time = 0;
  for (let i = 0; i < profile.pattern.length; i++) {
    const s = strikeAt(weapon, i);
    total += avg * s.damage;
    time += s.every;
  }
  // a bow's shot is worth its draw, a crossbow's its bolt, a javelin's its throw — the multiplier
  // lives in RANGED and is applied by the controller on release, so the table has to count it
  const shot = RANGED[weapon.baseKey] || RANGED[weapon.subtype];
  if (shot) total *= shot.kind === 'draw' ? shot.powerFull : (shot.power ?? 1);
  let dps = total / time;
  if (offKey && d.offDamage) {
    const offAvg = (d.offDamage[0] + d.offDamage[1]) / 2;
    const off = profileOf(unit.equipment.offhand);
    let oTotal = 0, oTime = 0;
    for (let i = 0; i < off.pattern.length; i++) {
      const s = strikeAt(unit.equipment.offhand, i);
      oTotal += offAvg * s.damage * OFFHAND_DAMAGE;
      oTime += s.every;
    }
    dps += oTotal / oTime;
  }
  return dps;
}

test('the weapon is what scales with level, not the flat bonus on your gear', () => {
  const base = { level: 20, str: 30, dex: 30, int: 30, con: 10, perkFlags: {}, perks: [], talents: [] };
  const great = rpg.derive({ ...base, equipment: { weapon: make('greatsword') } });
  const dagger = rpg.derive({ ...base, equipment: { weapon: make('dagger') } });
  const ratio = ((great.damage[0] + great.damage[1]) / 2) / ((dagger.damage[0] + dagger.damage[1]) / 2);
  assert.ok(ratio > 2.2,
    `a greatsword's average hit is only ${ratio.toFixed(2)}x a dagger's — gear is still diluting the weapon`);
  // …and it holds at every level, not just at 20
  for (const level of [1, 10, 35, 50]) {
    const g = rpg.derive({ ...base, level, equipment: { weapon: make('greatsword', level) } });
    const d = rpg.derive({ ...base, level, equipment: { weapon: make('dagger', level) } });
    const r = ((g.damage[0] + g.damage[1]) / 2) / ((d.damage[0] + d.damage[1]) / 2);
    assert.ok(r > 1.8, `at level ${level} the ratio collapsed to ${r.toFixed(2)}x`);
  }
});

test('the off hand rolls its OWN dice, which kills the off-hand-dagger exploit', () => {
  const base = { level: 20, str: 30, dex: 30, int: 30, con: 10, perkFlags: {}, perks: [], talents: [] };
  const withDagger = rpg.derive({ ...base, equipment: { weapon: make('longsword'), offhand: make('dagger') } });
  assert.ok(withDagger.offDamage, 'the off hand has no dice of its own');
  assert.ok(withDagger.offDamage[1] < withDagger.damage[1],
    'a dagger in the off hand should not hit as hard as the longsword in the main one');
  // and the whole build is worse than a pair of longswords, which is the honest answer
  assert.ok(dpsOf('longsword', { offKey: 'dagger' }) < dpsOf('longsword', { offKey: 'longsword' }),
    'a dagger off-hand still beats a real weapon — the exploit is back');
});

test('melee out-damages ranged when it is standing next to the thing', () => {
  const table = {};
  for (const key of ['greatsword', 'axe2h', 'sword2h', 'halberd', 'warhammer', 'hammer', 'battleaxe',
    'longsword', 'sword', 'rapier', 'spear', 'dagger', 'iron_mace', 'bow', 'shortbow', 'crossbow', 'javelin']) {
    table[key] = dpsOf(key);
  }
  const best = Object.entries(table).sort((a, b) => b[1] - a[1])[0];
  const ranged = ['bow', 'shortbow', 'crossbow', 'javelin'];
  assert.ok(!ranged.includes(best[0]),
    `the best sustained damage in the game is still ${best[0]} at ${Math.round(best[1])}`);
  for (const key of ranged) {
    assert.ok(table[key] < table.greatsword * 1.15,
      `${key} does ${Math.round(table[key])} against a greatsword's ${Math.round(table.greatsword)} — at eleven times the range`);
  }
  // …and the whole spread stays inside a band, so nothing is a trap and nothing is the only answer
  const values = Object.values(table);
  const spread = Math.max(...values) / Math.min(...values);
  assert.ok(spread < 2.8, `the spread across every weapon is ${spread.toFixed(2)}x`);
});

test('a two-handed weapon beats the one-handers it gave up a shield for', () => {
  assert.ok(dpsOf('greatsword') > dpsOf('longsword'), 'a greatsword still loses to a longsword');
  assert.ok(dpsOf('axe2h') > dpsOf('battleaxe'));
  assert.ok(dpsOf('sword2h') > dpsOf('sword'));
});

// ---------------------------------------------------------------- the grip

test('THE GRIP RULE: a weapon points away from the fist, not up the forearm', () => {
  for (const [id, info] of Object.entries(FARHOLD_WEAPON_INFO)) {
    // hand space: -y is out past the fingertips, +y runs up the forearm toward the elbow
    assert.ok(info.headY < 0, `${id}'s head is at y ${info.headY} — behind the fist, travelling the wrong way`);
    assert.ok(info.buttY > 0, `${id}'s butt is at y ${info.buttY} — out past the fingers, which is where the head goes`);
    assert.ok(info.headY < info.buttY);
  }
});

test('a shield is strapped to the forearm, and a buckler is the only thing centre-gripped', () => {
  for (const [id, info] of Object.entries(FARHOLD_OFFHAND_INFO)) {
    assert.equal(info.bone, 'elbowL', `${id} is still gripped in the fist`);
  }
  assert.equal(offhandLookFor({ isShield: true, slot: 'offhand' }).id, 'fh_heater_shield');
});

test('no weapon renders as a member of another family', () => {
  const wrong = [];
  for (const key of Object.keys(items.weaponBases)) {
    const item = make(key, 10);
    const look = heldLookFor(item);
    const info = FARHOLD_WEAPON_INFO[look.id];
    if (!info) continue;                       // a bow, a staff, an orb — the original vocabulary
    const sub = item.subtype || item.baseKey;
    const expect = {
      greatsword: 'greatsword', sword2h: 'greatsword', axe2h: 'axe', battleaxe: 'axe',
      halberd: 'polearm', spear: 'polearm', javelin: 'polearm',
      wand: 'wand', quarterstaff: 'staff', warhammer: 'hammer', hammer: 'hammer',
    }[sub];
    if (expect && info.family !== expect) wrong.push(`${key}: ${look.id} is a ${info.family}, not a ${expect}`);
  }
  assert.deepEqual(wrong, [], wrong.join('; '));
});

test('every staff wears the topper its element asks for, rather than an orb for all seven', () => {
  const seen = new Set();
  for (const element of ['fire', 'ice', 'lightning', 'poison', 'shadow', 'holy', 'arcane']) {
    const item = { type: 'weapon', subtype: 'staff', baseKey: 'staff', rarity: 'normal', castElement: element };
    seen.add(heldLookFor(item).id);
  }
  assert.ok(seen.size >= 4, `only ${seen.size} staff toppers across seven elements`);
});

test('rarity is more than a tint: a legendary weapon carries detail a common one does not', () => {
  const common = heldLookFor({ type: 'weapon', subtype: 'sword', baseKey: 'sword', rarity: 'normal' });
  const legend = heldLookFor({ type: 'weapon', subtype: 'sword', baseKey: 'sword', rarity: 'legendary' });
  assert.equal(common.quality, 0);
  assert.ok(legend.quality >= 3);
  assert.ok(FARHOLD_HELD.includes(common.id));
});
