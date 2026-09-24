// Farhold R24 — the Chibi 2 overhaul (avatar-3d, 2026-09-24) as the game uses it.
//
// Chibi 2 now has a clip per weapon FAMILY (an axe chops, a mace smashes, a dagger stabs, a polearm
// is driven with both hands), its own clips for the OFF hand, and a pair of clips for two
// two-handers at once (the Doubled Grasp keystone). It also builds any held weapon in the left hand.
// These check that Farhold routes its swings to those clips and hands the off hand a look it can
// see — a dual wielder's second weapon used to render as nothing at all.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./three-loader.mjs', import.meta.url);

const { clipFor, animFamilyOf, CLIP_SECONDS } = await import('../js/weapons.js');
const { offhandLookFor, heldLookFor } = await import('../js/rpg.js');
const { CHIBI2_COMBAT_RIDE } = await import('../../../avatar-3d/js/chibi2-motion.js');

test('a weapon family plays its own clip, and every clip Farhold can ask for is one the body builds', () => {
  assert.equal(animFamilyOf({ baseKey: 'battleaxe', subtype: 'axe' }), 'axe');
  assert.equal(animFamilyOf({ baseKey: 'iron_mace', subtype: 'mace' }), 'mace');
  assert.equal(animFamilyOf({ baseKey: 'warhammer', subtype: 'hammer' }), 'hammer');
  assert.equal(animFamilyOf({ baseKey: 'dagger', subtype: 'dagger' }), 'dagger');
  assert.equal(animFamilyOf({ baseKey: 'halberd', subtype: 'polearm' }), 'polearm');
  assert.equal(animFamilyOf({ baseKey: 'sword', subtype: 'sword' }), null);
  assert.equal(clipFor('cleave', { family: 'axe' }), 'chop');
  assert.equal(clipFor('overhead', { family: 'mace' }), 'smash');
  assert.equal(clipFor('jab', { family: 'dagger' }), 'stab');
  assert.equal(clipFor('thrust', { family: 'polearm', twoHanded: true }), 'thrust2h');
  assert.equal(clipFor('slash', { step: 1 }), 'slashBack', 'a sword still alternates its cuts');
  const asked = new Set();
  for (const shape of ['jab', 'slash', 'thrust', 'sweep', 'cleave', 'overhead', 'arc', 'slam', 'lunge', 'shot']) {
    for (const family of [null, 'axe', 'mace', 'hammer', 'dagger', 'polearm']) for (const twoHanded of [false, true]) for (const off of [false, true]) for (const pairedTwo of [false, true]) for (const last of [false, true]) {
      asked.add(clipFor(shape, { family, twoHanded, off, pairedTwo, last }));
    }
  }
  for (const clip of asked) {
    assert.ok(clip === 'attack' || CHIBI2_COMBAT_RIDE.includes(clip), `${clip} is asked for and never built`);
    assert.ok(CLIP_SECONDS[clip] > 0, `${clip} has no length for setRate`);
  }
});

test('the off hand swings as the off hand, and Doubled Grasp brings both two-handers down together', () => {
  assert.equal(clipFor('slash', { off: true }), 'offSlash');
  assert.equal(clipFor('thrust', { off: true }), 'offThrust');
  assert.equal(clipFor('cleave', { pairedTwo: true }), 'chop');
  assert.equal(clipFor('slam', { pairedTwo: true, last: true }), 'twinSlam');
  assert.equal(clipFor('arc', { pairedTwo: true, last: true }), 'twinCleave');
});

test('a second weapon in the off hand is SEEN, and a tome is the off-hand book', () => {
  const sword = { type: 'weapon', subtype: 'sword', baseKey: 'sword', rarity: 'normal' };
  assert.equal(offhandLookFor(sword).id, heldLookFor(sword).id, 'the off-hand sword renders as nothing');
  const greatsword = { type: 'weapon', subtype: 'sword2h', baseKey: 'greatsword', twoHanded: true, rarity: 'normal' };
  assert.equal(offhandLookFor(greatsword).id, 'fh_greatsword');
  assert.equal(offhandLookFor({ type: 'weapon', subtype: 'tome', baseKey: 'tome' }).id, 'book');
  assert.equal(offhandLookFor({ type: 'weapon', subtype: 'dagger', baseKey: 'dagger' }).id, 'dagger', 'a dagger keeps its own off-hand model');
  assert.equal(offhandLookFor({ isShield: true }).id, 'fh_heater_shield');
  // and a wand + tome is the wizard: the wand in the right hand, the book in the left
  assert.equal(heldLookFor({ type: 'weapon', subtype: 'wand', baseKey: 'wand' }).id, 'fh_wand');
});
