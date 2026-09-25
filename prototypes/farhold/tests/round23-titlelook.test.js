// Farhold R23 — the title screen's 3D character wears what the run will put on it.
//
// js/titlelook.js repeats the steps `begin()` + `applyGearLook()` in js/main.js take for a new
// character, on a throwaway `Rpg` over a COPY of the items. These check the three promises that
// file makes: the hands are the class's real starter kit, the preview never touches the game's own
// data, and a custom class's build is not marked as spent by being looked at.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';

register('./three-loader.mjs', import.meta.url);

const json = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const items = json('../../emberveil/data/items.json');
const balance = json('../data/balance.json');
const classData = json('../data/classes.json');
const skillData = json('../data/skills.json');
const classLooks = json('../../emberveil/data/class-looks.json');
const classbuildData = json('../data/classbuild.json');

const { createLookMaker } = await import('../js/titlelook.js');
const { heldLookFor } = await import('../js/rpg.js');
const { createBuild, installCustomClass } = await import('../js/classbuild.js');

const cls = id => classData.classes.find(c => c.id === id);

test('every preset class is holding its own starter weapon, the one begin() gives it', () => {
  const maker = createLookMaker({ items, balance });
  for (const c of classData.classes) {
    const look = maker.startingLook({ classDef: c, avatar: classLooks.classes[c.id]?.avatar });
    const base = items.weaponBases?.[c.starter];
    assert.ok(look.held && look.held.id && look.held.id !== 'none', `${c.id} is empty-handed`);
    if (base) {
      // the same mapping main.js uses, from the base alone — a staff's topper depends on its
      // element, which is rolled, so only the non-staff ids are compared exactly
      const expect = heldLookFor({ subtype: base.subtype, baseKey: c.starter });
      if (base.subtype !== 'staff') assert.equal(look.held.id, expect.id, `${c.id} holds the wrong thing`);
    }
  }
});

test('a preset class carries the torch in a free hand, and on the belt when both hands are busy', () => {
  // 2026-09-25: the warrior starts with a shield, the fighter with a two-hander, and a bow is held in
  // the LEFT hand — so those three hang the torch on the belt rather than drawing it in a hand that
  // is already holding something (the ranger's torch was drawn in the same fist as the bow)
  const maker = createLookMaker({ items, balance, classLooks });
  for (const id of ['stormcaller', 'swashbuckler', 'tactician']) {
    const look = maker.startingLook({ classDef: cls(id), avatar: {} });
    assert.equal(look.offhand?.id, 'torch', `${id}'s torch is missing from the free hand`);
  }
  for (const id of ['ranger', 'warrior', 'fighter']) {
    const look = maker.startingLook({ classDef: cls(id), avatar: {} });
    assert.notEqual(look.offhand?.id, 'torch', `${id} holds the torch in a hand that is busy`);
    assert.equal(look.decor?.id, 'belt_torch', `${id}'s torch is not on the belt`);
  }
});

test('the face is the one passed in, and the game\'s items are untouched', () => {
  const before = JSON.stringify(items);
  const maker = createLookMaker({ items, balance });
  const face = { ...(classLooks.classes.knight?.avatar || {}), eyes: { id: 'sleepy', color: '#123456' } };
  const look = maker.startingLook({ classDef: cls('knight'), avatar: face });
  assert.deepEqual(look.eyes, face.eyes);
  assert.equal(JSON.stringify(items), before, 'building a preview changed data/items.json in memory');
});

function customClass(loadoutId) {
  const cd = structuredClone(classData);
  const build = createBuild(classbuildData);
  if (loadoutId) build.loadout = loadoutId;
  installCustomClass({ classData: cd, skillData: structuredClone(skillData), classLooks: structuredClone(classLooks), data: classbuildData, build });
  return { build, def: cd.classes.find(c => c.id === (classbuildData.custom?.id || 'custom')) };
}

test('a custom build is looked at, not spent: `granted` stays false', () => {
  const { build, def } = customClass(null);
  const maker = createLookMaker({ items, balance, classbuildData });
  maker.startingLook({ classDef: def, avatar: {} });
  assert.equal(def.build.granted, false, 'the preview marked the opening kit as already given');
  assert.equal(build.granted, false);
});

test('a custom loadout puts its shield or its second weapon in the off hand, and the torch on the belt', () => {
  const maker = createLookMaker({ items, balance, classbuildData });
  const board = maker.startingLook({ classDef: customClass('blade_board').def, avatar: {} });
  assert.match(board.offhand?.id || '', /shield/, 'Blade and Board has no shield');
  assert.equal(board.decor?.id, 'belt_torch');
  const knives = maker.startingLook({ classDef: customClass('knife_pair').def, avatar: {} });
  assert.equal(knives.offhand?.id, 'fh_dagger', 'the second knife is not in the off hand');
  // and the two builds are not served out of one cache entry
  assert.notEqual(board.held?.id, undefined);
});
