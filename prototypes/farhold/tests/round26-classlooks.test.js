// Farhold 2026-09-25 — the character screen shows each class in its OWN outfit.
//
// The fault was that every class's starting armour was painted by tier over the class look: every
// heavy helm the horned helm, every cloth/medium helm a purple hood, every medium chest a green
// tunic. Now a starting piece carries its class's part (js/classwear.js), and these tests hold the
// preview — the same steps as the first morning — to the class's dressed look, slot by slot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);      // titlelook -> light.js imports three

const { createLookMaker } = await import('../js/titlelook.js');
const { dressClassLooks, ARMOUR_TARGET } = await import('../js/classwear.js');
const { installFoci } = await import('../js/foci.js');

const json = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const items = installFoci(json('../../emberveil/data/items.json'));
const balance = json('../data/balance.json');
const classes = json('../data/classes.json').classes;
const outfits = json('../../../avatar-3d/data/class-outfits.json').classes;
const classLooks = dressClassLooks(json('../../emberveil/data/class-looks.json'), outfits);
const maker = createLookMaker({ items, balance, classLooks });
const cls = id => classes.find(c => c.id === id);
const lookOf = id => maker.startingLook({ classDef: cls(id), avatar: classLooks.classes[id].avatar });
const SLOT_OF = { heavy_helm: 'head', medium_helm: 'head', cloth_helm: 'head', heavy_chest: 'chest', medium_chest: 'chest', light_chest: 'chest', cloth_chest: 'chest', light_boots: 'feet' };

test('every class starts wearing its own look, not a generic armour part', () => {
  for (const c of classes) {
    const look = lookOf(c.id), own = classLooks.classes[c.id].avatar;
    for (const key of c.startingArmour || []) {
      const target = ARMOUR_TARGET[SLOT_OF[key]];
      if (!target) continue;
      assert.deepEqual(look[target], own[target], `${c.id}: ${key} is drawn as ${look[target]?.id}, not its own ${own[target]?.id}`);
    }
  }
});

test('the horned helm is the fighter\'s alone, and nobody starts in the default green tunic or purple hood', () => {
  for (const c of classes) {
    const look = lookOf(c.id);
    if (c.id !== 'fighter') assert.notEqual(look.hat?.id, 'horned_helm', `${c.id} wears the fighter's horned helm`);
    assert.ok(!(look.top?.id === 'tunic' && !look.top?.color), `${c.id} is in an uncoloured tunic`);
    assert.ok(!(look.hat?.id === 'hood' && !look.hat?.color), `${c.id} is in an uncoloured hood`);
  }
  assert.equal(lookOf('fighter').hat.id, 'horned_helm');
});

test('the starting hands: warrior sword and board, fighter two-hander, paladin sword and book, rogue two daggers', () => {
  const w = lookOf('warrior'), f = lookOf('fighter'), p = lookOf('paladin'), r = lookOf('rogue');
  assert.equal(w.offhand.id, 'fh_heater_shield');
  assert.equal(f.held.id, 'fh_greatsword');
  assert.notEqual(f.offhand.id, 'torch', 'the fighter holds a torch in a hand his sword needs');
  assert.equal(p.held.id, 'fh_sword');
  assert.equal(p.offhand.id, 'book');
  assert.equal(r.held.id, 'fh_daggers');
  assert.equal(r.offhand.id, 'fh_dagger');
});

test('the paladin\'s Psalter makes spells stronger', () => {
  const base = items.armorBases.psalter;
  assert.ok(base, 'no psalter base');
  assert.ok(base.intrinsic.some(a => a.stat === 'spellPower' && a.value > 0));
});
