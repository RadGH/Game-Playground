// node --test prototypes/thousandvale/tests/C/parity-uniques.test.mjs
//
// PARITY for UNIQUE-ITEM POWERS (js/uniques.js: the attack powers resolveAttack carries out — chain,
// ricochet, split, slam, cleave, burning ground, twin bolts, volleys — the kill powers, the on-hurt
// powers and the auras). EVERY unique in the game (Emberveil's and Farhold's 184, foci included),
// worn by a character who then makes a dozen basic attacks into a pack that bites back and dies,
// against Farhold's real runtime with main.js's uniqueEnv transcribed (farhold-oracle-skills.mjs).
// Weapon uniques are worn by a class that fights with that kind of weapon's hands; armour, jewellery
// and off-hands by a warrior.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runUniques } from './parity-kit.mjs';
import { parityEngineFor as engineFor } from './setup.mjs';

const engine = await engineFor(1);
const ALL = engine.items.uniques;
const weaponClass = u => {
  const base = engine.items.weaponBases?.[u.baseItemId] || {};
  if (base.subtype === 'staff' || /staff/.test(u.baseItemId || '')) return 'mage';
  if (base.subtype === 'wand') return 'stormcaller';
  if (base.ranged) return 'ranger';
  if (base.subtype === 'dagger') return 'rogue';
  return 'warrior';
};

const BATCH = 20;
for (let i = 0; i < ALL.length; i += BATCH) {
  const batch = ALL.slice(i, i + BATCH);
  test(`uniques ${i + 1}-${i + batch.length}: every power lands the same in Farhold and Thousandvale`, async () => {
    for (const u of batch) {
      const classId = u.slot === 'weapon' ? weaponClass(u) : 'warrior';
      const r = await runUniques({ classId, uniqueIds: [u.id] });
      assert.deepEqual(r.problems, [], `${u.id} (${u.legendaryEffect || u.slot})`);
    }
  });
}
