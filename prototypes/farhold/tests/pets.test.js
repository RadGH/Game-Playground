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
