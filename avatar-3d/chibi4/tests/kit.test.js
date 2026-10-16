// Chibi 4 step 9 — the kit's pure rules and its build output (kit.json), no browser.
// Run: node --test avatar-3d/chibi4/tests/kit.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { outfitFor, dressOutfit, resolve, clipFor, CLIP_MAP, CHIBI2_NAMES, SLOTS, KIT_HAIRS, tintUniform, skinRatio, outfitKey, isLong } from '../js/chibi4-outfit.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const KIT = join(HERE, '..', 'models', 'kit');
const kit = body => JSON.parse(readFileSync(join(KIT, body, 'kit.json'), 'utf8'));
const CHIBI2_SRC = ['chibi2-motion.js', 'chibi2-motion-dual.js', 'chibi2-motion-prof.js'].map(f => readFileSync(join(HERE, '..', '..', 'js', f), 'utf8')).join('\n');

test('every Chibi 2 animation name is mapped (read from chibi2-motion*.js, not a copied list)', () => {
  const names = new Set();
  for (const m of CHIBI2_SRC.matchAll(/export const CHIBI2_\w+_ANIMS\s*=\s*\[([^\]]*)\]/g)) for (const n of m[1].matchAll(/'(\w+)'/g)) names.add(n[1]);
  for (const m of CHIBI2_SRC.matchAll(/export const CHIBI2_ANIMS\s*=\s*\[([^\]]*)\]/g)) for (const n of m[1].matchAll(/'(\w+)'/g)) names.add(n[1]);
  assert.ok(names.size >= 90, `found ${names.size} Chibi 2 names`);
  const missing = [...names].filter(n => !CLIP_MAP[n]);
  assert.deepEqual(missing, []);
});

for (const body of ['male', 'female']) {
  test(`${body} kit: every mapped clip exists, every garment has a file, bits are unique`, () => {
    const k = kit(body);
    const missing = CHIBI2_NAMES.filter(n => !(CLIP_MAP[n][0] in k.clips));
    assert.deepEqual(missing, []);
    for (const [id, slots] of Object.entries(SLOTS)) {
      assert.ok(k.garments[id], id);
      assert.deepEqual(k.garments[id].slots, slots, `${id} slots match the runtime table`);
      assert.ok(statSync(join(KIT, body, k.garments[id].file)).size > 1000);
    }
    for (const h of KIT_HAIRS) assert.ok(existsSync(join(KIT, body, k.hairs[h].file)), h);
    assert.equal(new Set(Object.values(k.bits)).size, Object.keys(k.bits).length);
    assert.ok(Math.max(...Object.values(k.bits)) < 16, 'mask bits travel in two 8-bit colour channels');
  });

  test(`${body} kit: step 6's feet-vs-hem check passes on every robe clip`, () => {
    const k = kit(body);
    const rows = Object.entries(k.robeTest);
    assert.ok(rows.length >= 4, 'walk, run, sprint, walkFormal');
    for (const [name, r] of rows) assert.equal(r.poking_vertices, 0, `${name}: ${JSON.stringify(r)}`);
  });

  test(`${body} kit: no knee bends the wrong way in any clip (owner: "the right leg was bent backwards")`, () => {
    const k = kit(body);
    const bad = Object.entries(k.knees).filter(([n, v]) => n !== 'idle_without_fix' && (v.l < -1 || v.r < -1));
    assert.deepEqual(bad, []);
  });

  test(`${body} kit: tight garments bend with the limb under them (the bent-leg bug: trousers skinned to the hip)`, () => {
    const a = kit(body).masks.weight_agreement;
    for (const g of ['trousers', 'undershirt', 'jerkin', 'boots_tall', 'bracers', 'sleeves', 'mantle']) assert.ok(a[g] >= 0.95, `${g}: ${a[g]}`);
  });

  test(`${body} kit: the files are compressed (meshopt) and small`, () => {
    const k = kit(body);
    assert.ok(k.files['body.glb'] < 700_000, `body.glb ${k.files['body.glb']}`);
    const raw = k.uncompressedBytes['body.glb'];
    assert.ok(raw > k.files['body.glb'] * 2, 'at least halved');
    const head = readFileSync(join(KIT, body, 'body.glb')).subarray(0, 4000).toString('latin1');
    assert.match(head, /EXT_meshopt_compression/);
  });
}

test('avatar JSON -> outfit: a robed mage, a woman in armour, an elf', () => {
  const mage = outfitFor({ body: { race: 'human' }, top: { id: 'trim_robe', color: '#2a3a8a' }, shoes: { id: 'boots' }, hair: { id: 'side_part' }, hat: { id: 'wizard_hat' } });
  assert.equal(mage.body, 'male');
  assert.deepEqual(mage.garments.map(g => g.id).sort(), ['boots_low', 'hat', 'mantle', 'robe', 'sleeves', 'trousers']);
  assert.ok(isLong(mage));
  const war = outfitFor({ body: { gender: 'female', race: 'elf' }, top: { id: 'plate_armor' }, hair: { id: 'long_braid' } });
  assert.equal(war.body, 'female'); assert.equal(war.race, 'elf'); assert.equal(war.hair.id, 'braid');
  assert.ok(['jerkin', 'pauldrons', 'bracers', 'boots_tall'].every(id => war.garments.some(g => g.id === id)));
  assert.ok(!isLong(war));
});

test('slots: a later garment replaces the one on the same place; never naked', () => {
  let o = resolve({ body: 'male', garments: [{ id: 'robe' }, { id: 'jerkin' }] });
  assert.ok(!o.garments.some(g => g.id === 'robe'), 'jerkin took the torso from the robe');
  assert.ok(o.garments.some(g => g.id === 'trousers'), 'legs covered once the robe went');
  o = dressOutfit(o, { shoulders: 'pauldrons' }); assert.ok(o.garments.some(g => g.id === 'pauldrons'));
  o = dressOutfit(o, { shoulders: 'mantle' }); assert.ok(!o.garments.some(g => g.id === 'pauldrons'));
  assert.equal(dressOutfit(o, ['robe', 'boots_tall']).garments.find(g => SLOTS[g.id].includes('feet')).id, 'boots_low', 'no knee boots under a robe');
  o = dressOutfit(o, { torso: null, shirt: null });
  assert.ok(o.garments.some(g => g.id === 'undershirt'), 'something on the torso');
  assert.notEqual(outfitKey(o), outfitKey(dressOutfit(o, 'hat')));
});

test('clips: a robe plays its robe-stride twin; one-shots and loops follow Chibi 2', () => {
  const clips = { idle: 1, walk: 1, walk_robe: 1, attack: 1, wave: 1 };
  assert.equal(clipFor('walk', clips, true).clip, 'walk_robe');
  assert.equal(clipFor('walk', clips, false).clip, 'walk');
  assert.equal(clipFor('attack', clips).loop, false);
  assert.equal(clipFor('walk', clips).loop, true);
  assert.equal(clipFor('nonsense', clips).clip, 'idle');
});

test('colours: tint keeps brightness, skin ratio is clamped', () => {
  const [r, g, b, w] = tintUniform('#ff0000', 0.2);
  assert.ok(r > 4 && g === 0 && b === 0 && w === 1);
  assert.equal(tintUniform(null, 0.2)[3], 0, 'no colour = untinted');
  const s = skinRatio('#ffffff', [0.01, 0.5, 0.5]);
  assert.ok(s.every(v => v <= 3 && v >= 0.15));
});
