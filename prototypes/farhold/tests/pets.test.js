// node --test prototypes/farhold/tests/pets.test.js
//
// R18 — THE ABILITY THAT FROZE THE PICTURE.
//
// `js/pets.js` `castAbility` decided whether an ability needs something to aim at with two
// separate conditions:
//
//     if (!ab.heal && !target) continue;          // skipped when ab.heal is set
//     if (ab.heal && !ab.mult) { …heal…; continue; }   // skipped when ab.mult is ALSO set
//     …
//     if (Math.hypot(target.x - p.x, target.z - p.z) > reach) continue;   // target is null here
//
// An ability carrying BOTH `heal` and `mult` passes the first (it has a heal) and the second (it
// also has a mult) and lands in the damage path with nothing to aim at. `data/mercenaries.json`'s
// `tithe` is exactly that pair — `{mult: 1.6, heal: 0.05}`, the Bonesinger's, learned at level 18.
// Hire one, reach 18, stand in a quiet field: `tick` throws, `js/main.js` calls it from the frame
// loop with no try/catch, and requestAnimationFrame re-throws every frame. The picture freezes
// while the game runs on, which reads as a hang rather than an error.
//
// The rule is one exported predicate now, so this file can ask it of every ability in the data
// without needing a scene. That is the check that was missing: the bug was not a hard algorithm,
// it was one combination of data fields that nobody had tried.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * `js/pets.js` draws bodies, so it imports `three`. In a browser that resolves through
 * index.html's import map; under `node --test` it resolves through tests/three-loader.mjs, which
 * exists for exactly this. Three itself loads fine in node — it only touches WebGL when you make a
 * renderer — so the module can be imported and its pure rules asked about. This is why pets.js had
 * no test file at all, and why the crash below lived in it for as long as it did.
 */
register(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), 'three-loader.mjs')).href);
const { isPureHeal } = await import('../js/pets.js');

const read = f => JSON.parse(readFileSync(new URL(f, import.meta.url), 'utf8'));
const mercs = read('../data/mercenaries.json');

/** Every ability the game can hand a follower, from wherever it is declared. */
function allAbilities() {
  const out = [];
  const walk = (o, where) => {
    if (Array.isArray(o)) { o.forEach((v, i) => walk(v, `${where}[${i}]`)); return; }
    if (!o || typeof o !== 'object') return;
    // an ability row is anything with a cooldown and either a heal or a damage multiplier
    if (o.cooldown != null && (o.heal != null || o.mult != null)) out.push({ where, ab: o });
    for (const [k, v] of Object.entries(o)) walk(v, `${where}/${k}`);
  };
  walk(mercs, 'mercenaries.json');
  return out;
}

test('every ability declares itself either a pure heal or something that needs a target', () => {
  const list = allAbilities();
  assert.ok(list.length >= 5, `only found ${list.length} abilities — the walk is not finding them`);

  for (const { where, ab } of list) {
    const pure = isPureHeal(ab);
    // the invariant: anything that deals damage is NOT target-free, however much it also heals
    if (ab.mult != null) {
      assert.equal(pure, false,
        `${where} (${ab.id || ab.name}) has mult ${ab.mult} and would be treated as a pure heal — `
        + 'it will reach the damage path with a null target and throw inside the frame loop');
    }
    // …and a heal with no damage half must be target-free, or a healer never heals out of combat
    if (ab.heal != null && ab.mult == null) {
      assert.equal(pure, true, `${where} (${ab.id || ab.name}) is a pure heal but is not treated as one`);
    }
  }
});

test('tithe — the exact ability that froze the render loop — needs a target', () => {
  const tithe = mercs.abilities?.tithe;
  assert.ok(tithe, 'data/mercenaries.json no longer has `tithe`; re-aim this test at whatever replaced it');
  // the two fields whose combination is the whole bug, asserted so the data moving is not silent
  assert.ok(tithe.heal, 'tithe lost its heal');
  assert.ok(tithe.mult, 'tithe lost its damage multiplier');
  assert.equal(isPureHeal(tithe), false,
    'tithe both heals AND hits, so it needs a target — treating it as a pure heal is the crash');
});

test('isPureHeal is total: it never throws and never guesses', () => {
  // `castAbility` calls this on whatever the data holds, so it has to survive the odd shapes
  for (const odd of [null, undefined, {}, { cooldown: 5 }, { heal: 0 }, { mult: 0 }, { heal: 0.1, mult: 0 }]) {
    assert.equal(typeof isPureHeal(odd), 'boolean', `isPureHeal(${JSON.stringify(odd)}) was not a boolean`);
  }
  // a zero heal is not a heal, and a zero mult is not damage
  assert.equal(isPureHeal({ heal: 0.1 }), true);
  assert.equal(isPureHeal({ heal: 0.1, mult: 1.6 }), false);
  assert.equal(isPureHeal({ mult: 1.6 }), false);
  assert.equal(isPureHeal({ heal: 0, mult: 0 }), false, 'an ability that does nothing is not a heal');
});

// ================================================================= R18 — the summons nobody could cast

/**
 * "Class companions do NOT count toward summon per-type caps. A druid's two starting grove wolves
 *  are separate from `call_wolf`; the spell always works." — the user's ruling.
 *
 * `admit` counted `alive` whole. A druid STARTS with two `grove_wolf` (CLASS_PETS) and `call_wolf`
 * summons a `grove_wolf` against a per-type cap of 1, so the spell was refused from the moment the
 * character existed; a necromancer with three thralls got "You have 3 of 3 follower slots filled".
 * Every class summon spell in the game was unreachable — silently, and AFTER js/skills.js had spent
 * the mana and started a 26-second cooldown, because `made.refused` was read by nobody.
 */
const { admit } = await import('../js/followers.js');
const { CLASS_PETS } = await import('../js/pets.js');

/** The party a class starts with, in the shape `admit` reads. */
function startingCompanions(classId) {
  const spec = CLASS_PETS[classId];
  if (!spec) return [];
  const out = [];
  for (let i = 0; i < (spec.count || 1); i++) out.push({ defId: spec.id, origin: 'companion' });
  for (let i = 0; i < (spec.extra?.count || 0); i++) out.push({ defId: spec.extra.id, origin: 'companion' });
  return out;
}

test('every class that starts with companions can still cast its own summon', () => {
  for (const [classId, spec] of Object.entries(CLASS_PETS)) {
    const alive = startingCompanions(classId);
    // the spell summons the SAME kind the class already has — the exact collision
    const got = admit({ defId: spec.id, origin: 'summon', alive, limit: 3, perTypeCap: 1, name: spec.id });
    assert.equal(got.ok, true,
      `a ${classId} cannot cast its own summon with its starting companions out: "${got.why}"`);
  }
});

test('companions do not fill the slots, but summons and hires still compete for them', () => {
  // three companions do not block a summon, however many there are
  const many = [
    { defId: 'bone_thrall', origin: 'companion' },
    { defId: 'bone_thrall', origin: 'companion' },
    { defId: 'bone_archer', origin: 'companion' },
  ];
  assert.equal(admit({ defId: 'grove_wolf', alive: many, limit: 3, perTypeCap: 1 }).ok, true,
    'class companions are still spending follower slots');

  // …but the limit is real for everything that is not a companion
  const hired = [
    { defId: 'blade', origin: 'mercenary' },
    { defId: 'bowman', origin: 'mercenary' },
    { defId: 'grove_wolf', origin: 'summon' },
  ];
  const full = admit({ defId: 'hunting_cat', alive: hired, limit: 3, perTypeCap: 1 });
  assert.equal(full.ok, false, 'three hires and summons did not fill three slots');
  assert.match(full.why, /slots/i);

  // and the per-type cap still bites on actual summons
  const two = [{ defId: 'grove_wolf', origin: 'summon' }];
  assert.equal(admit({ defId: 'grove_wolf', alive: two, limit: 3, perTypeCap: 1 }).ok, false,
    'the per-type cap no longer limits repeat summons');
});
