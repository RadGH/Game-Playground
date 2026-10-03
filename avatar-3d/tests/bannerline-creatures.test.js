// node --test avatar-3d/tests/bannerline-creatures.test.js
//
// The creatures Bannerline added (prototypes/bannerline/docs/PLAN.md §14) — tuskback, ghoul, bone
// colossus, crow, thornback — plus the new features they brought (trunk, howdah, fan ears, long tusks,
// feathers, hunch/crouch, ribs/bony, quad plates and the turtle's shell). Everything is the real
// builder in node: a feature is checked by turning it OFF and seeing the body lose meshes, which is
// the only proof that the flag is read by something.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';

register('./three-loader.mjs', import.meta.url);
const { createCreature, CREATURE_TYPES, normalizeCreature } = await import('../js/creatures.js');
const { compactCreature } = await import('../js/mesh-merge.js');

const NEW = ['tuskback', 'ghoul', 'bone_colossus', 'crow', 'thornback'];
const meshes = c => { let n = 0; c.group.traverse(o => { if (o.isMesh) n++; }); return n; };
const J = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));

test('every new type is in the catalog with a known body plan', () => {
  for (const t of NEW) {
    assert.ok(CREATURE_TYPES[t], t);
    assert.ok(['quad', 'biped', 'bat'].includes(CREATURE_TYPES[t].plan), t);
    assert.equal(normalizeCreature({ type: t }).type, t);
  }
});

test('each builds, has a sensible size, and animates every clip without throwing', async () => {
  const want = { tuskback: [2.0, 3.2], ghoul: [0.8, 1.6], bone_colossus: [2.2, 3.4], crow: [0.2, 0.9], thornback: [1.0, 1.7] };
  for (const t of NEW) {
    const c = await createCreature({ type: t });
    for (const a of ['idle', 'walk', 'run', 'attack', 'talk', 'fly', 'dead', 'idle']) { c.setAnim(a); c.update(0.13, 0.13); }
    const m = c.metrics();
    assert.ok(m.height >= want[t][0] && m.height <= want[t][1], `${t} height ${m.height.toFixed(2)} outside ${want[t]}`);
    c.group.traverse(o => { if (o.isMesh) for (const v of o.geometry.attributes.position.array) assert.ok(Number.isFinite(v), `${t}: NaN vertex`); });
  }
});

test('the war beast is bigger than the bear, and the colossus bigger than the titan', async () => {
  const h = async t => (await createCreature({ type: t })).metrics().height;
  assert.ok(await h('tuskback') > await h('bear') * 1.5);
  assert.ok(await h('bone_colossus') > await h('titan'));
});

test('each new feature is drawn: turning it off removes meshes', async () => {
  const cases = [['tuskback', 'trunk'], ['tuskback', 'howdah'], ['crow', 'feathers'], ['bone_colossus', 'ribs'], ['thornback', 'plates'], ['turtle', 'plates'], ['ghoul', 'spine']];
  for (const [type, f] of cases) {
    const on = meshes(await createCreature({ type }));
    const off = meshes(await createCreature({ type, features: { [f]: false } }));
    assert.notEqual(on, off, `${type}.${f} makes no difference`);
  }
});

test('the ghoul hunches: its head is in front of its feet', async () => {
  const c = await createCreature({ type: 'ghoul' }); c.setAnim('idle'); c.update(0.01, 0.01);
  c.group.updateMatrixWorld(true);
  const THREE = await import('three');
  const head = new THREE.Vector3();
  // the eyes are the glowing meshes; reading them avoids naming the builder's private groups
  let eyeZ = -Infinity; c.group.traverse(o => { if (o.isMesh && o.material.emissiveIntensity > 0.5) { o.getWorldPosition(head); eyeZ = Math.max(eyeZ, head.z); } });
  assert.ok(eyeZ > 0.25, `eyes at z ${eyeZ.toFixed(2)} — not hunched forward`);
});

test('the mesh merge folds each new creature into a handful of draw calls', async () => {
  for (const t of NEW) {
    const c = await createCreature({ type: t });
    const before = meshes(c);
    const r = compactCreature(c);
    assert.ok(meshes(c) <= 4, `${t}: ${meshes(c)} meshes after the merge (was ${before})`);
    assert.ok(r.before > 20, `${t}: suspiciously few parts (${r.before})`);
    // it still animates after the fold
    c.setAnim('walk'); c.update(0.2, 0.2);
  }
});

test('the designed bl_ looks resolve, and the library files each one', () => {
  const variants = J('../data/creature-variants.json').variants;
  const lib = J('../../library/data/defaults.json').entries;
  const bl = Object.values(variants).filter(v => v.id.startsWith('bl_'));
  assert.ok(bl.length >= 6);
  for (const t of NEW) assert.ok(bl.some(v => v.creature.type === t), `no designed look on ${t}`);
  assert.ok(variants.bl_iron_golem && variants.bl_iron_golem.creature.type === 'golem');
  for (const v of bl) {
    assert.ok(CREATURE_TYPES[v.creature.type], v.id);
    const e = lib.find(x => x.id === v.id);
    assert.ok(e, `library entry ${v.id} missing`);
    assert.equal(e.kind, 'enemy');
    assert.ok(e.tags.includes('bannerline'));
    assert.deepEqual(e.data.creature, v.creature);
    assert.ok(e.data.voice && e.data.speech);
  }
});
