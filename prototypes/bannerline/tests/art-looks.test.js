// node --test prototypes/bannerline/tests/art-looks.test.js   (stream C)
//
// Every unit and hero resolves to a body (data/looks.json + units.json), the creature units get their
// designed Bannerline look, the creature bodies build in node, the body factory honours the actors.js
// contract, and the baked icon set is not stale (every unit, hero and skill has a PNG).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';

register('../../../avatar-3d/tests/three-loader.mjs', import.meta.url);
const { createLooks, createBodyFactory } = await import('../js/view/unit-looks.js');
const J = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const data = {
  looks: J('../data/looks.json'), units: J('../data/units.json'), presets: J('../../../avatar-3d/data/chibi2-presets.json'),
  outfits: J('../../../avatar-3d/data/class-outfits.json'), variants: J('../../../avatar-3d/data/creature-variants.json'),
  warbands: J('../../farhold/data/warbands.json'),
};
const looks = createLooks(data);
const RACE_BODY = { freeholds: ['human', 'dwarf', 'halfling'], ashtusk: ['orc'], unburied: ['undead'], thornmane: ['beast'] };

test('every unit resolves to a body of its own race', () => {
  const ids = looks.unitIds();
  assert.equal(ids.length, Object.keys(data.units.units).length);
  for (const id of ids) {
    const L = looks.forUnit(id);
    if (L.kind === 'chibi2') assert.ok(RACE_BODY[L.race].includes(L.avatar.body?.race || 'human'), `${id}: ${L.avatar.body?.race} is not a ${L.race} body`);
    else assert.ok(L.spec.type, id);
  }
});

test('creature units use their designed bl_ look', () => {
  for (const id of looks.unitIds()) {
    const L = looks.forUnit(id);
    if (L.kind === 'creature') assert.ok(L.variant && L.variant.startsWith('bl_'), `${id} has no designed look`);
  }
});

test('Freeholds humans wear the Freeholds blue', () => {
  for (const id of ['levy', 'shieldbearer', 'banner_marshal']) {
    const a = looks.forUnit(id).avatar;
    assert.ok(JSON.stringify(a).toLowerCase().includes('#2f5d9e'), id);
  }
});

test('heroes resolve and carry a weapon', () => {
  for (const id of ['warrior', 'ranger', 'pyromancer', 'druid']) {
    const L = looks.forHero(id);
    assert.equal(L.kind, 'chibi2');
    assert.notEqual(L.avatar.held?.id || 'none', 'none', id);
  }
});

test('creature bodies build and answer the Chibi 2 clip names', async () => {
  for (const id of looks.unitIds()) {
    const L = looks.forUnit(id); if (L.kind !== 'creature') continue;
    const a = await looks.build(L);
    for (const clip of ['ready', 'walk', 'attack', 'cast', 'hit', 'dead']) { a.setAnim(clip); a.update(0.1, 0.1); }
    assert.ok(a.height > 0.2, id);
    assert.ok(a.stats().meshes <= 4, `${id}: ${a.stats().meshes} meshes, the merge did not run`);
    a.dispose();
  }
});

test('makeBody follows the actors.js contract (sync object + height, play, dispose)', async () => {
  const f = createBodyFactory(looks, { fallback: () => ({ object: { tide: true }, height: 0.9, play() {}, dispose() {} }) });
  const b = f.makeBody({ kind: 'unit', type: 'tuskback', id: 1 }, {}, {});
  assert.ok(b.object && b.object.isObject3D); assert.ok(b.height > 0); assert.equal(typeof b.play, 'function');
  await new Promise(r => setTimeout(r, 50));
  b.play('walk', 0.1); b.play('attack', 0.3); b.dispose();
  assert.equal(f.makeBody({ kind: 'tide', type: 'x' }, {}, {}).height, 0.9);
});

test('the baked icon set covers every unit, hero and skill', () => {
  const idx = J('../assets/icons/index.json'), heroes = J('../data/heroes.json');
  const want = { unit: looks.unitIds(), hero: looks.heroIds(), skill: Object.keys(heroes.skills || {}), item: Object.keys(J('../assets/icons/catalog.json').items) };
  for (const [kind, ids] of Object.entries(want)) for (const id of ids) {
    assert.ok(idx.kinds[kind]?.includes(id), `${kind}/${id} not baked: run tools/bake-icons.mjs`);
    assert.ok(existsSync(new URL(`../assets/icons/${kind}/${id}.png`, import.meta.url)), `${kind}/${id}.png missing`);
  }
});
