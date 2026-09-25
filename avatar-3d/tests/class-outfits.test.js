// The shared class outfits (avatar-3d/data/class-outfits.json): every part id is one the shared 2D
// normaliser keeps (Farhold normalises every look before building it, so an unknown id would quietly
// become the slot default), and `dressAs` copies rather than changes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dressAs, OUTFIT_SLOTS } from '../js/class-outfits.js';
import { normalizeAvatar } from '../../avatar-2d/js/render.js';
import { PARTS } from '../../avatar-2d/js/parts/index.js';

const DATA = JSON.parse(readFileSync(new URL('../data/class-outfits.json', import.meta.url)));
const LOOKS = JSON.parse(readFileSync(new URL('../../prototypes/emberveil/data/class-looks.json', import.meta.url)));

test('every outfit part survives the shared normaliser', () => {
  for (const [cls, outfit] of Object.entries(DATA.classes)) {
    for (const slot of Object.keys(outfit)) {
      assert.ok(OUTFIT_SLOTS.includes(slot), `${cls}.${slot} is not an outfit slot`);
      const id = outfit[slot].id;
      assert.ok(id === 'none' || PARTS[slot]?.[id], `${cls}.${slot} = ${id} is not a registered part`);
      const kept = normalizeAvatar(dressAs(LOOKS.classes[cls]?.avatar || {}, outfit))[slot].id;
      assert.equal(kept, id, `${cls}.${slot} = ${id} was dropped by the normaliser`);
    }
  }
});

test('every outfit is for a real class, and the horned helm is the fighter\'s alone', () => {
  for (const cls of Object.keys(DATA.classes)) assert.ok(LOOKS.classes[cls], `${cls} is not a class`);
  const horned = Object.entries(DATA.classes).filter(([, o]) => o.hat?.id === 'horned_helm').map(([c]) => c);
  assert.deepEqual(horned, ['fighter']);
  const hats = ['warrior', 'fighter', 'knight', 'paladin', 'runesmith', 'druid', 'shaman', 'tactician'].map(c => DATA.classes[c].hat.id);
  assert.equal(new Set(hats).size, hats.length, 'two of the armoured classes share a helm');
});

test('dressAs copies, and hands:false leaves the hands alone', () => {
  const a = { hat: { id: 'none' }, held: { id: 'staff_orb' }, eyes: { id: 'round' } };
  const snap = JSON.stringify(a);
  const b = dressAs(a, DATA.classes.fighter, { hands: false });
  assert.equal(JSON.stringify(a), snap);
  assert.equal(b.hat.id, 'horned_helm');
  assert.equal(b.held.id, 'staff_orb');
  assert.equal(b.eyes.id, 'round');
  assert.equal(dressAs(a, DATA.classes.fighter).held.id, 'fh_greatsword');
});
