// R14 — finding a material, and the answer to "where do you find clay?".
//
//   "I previously asked for a scan tool to locate resources. Where is that? Where do you find clay?
//    We need a way for the player to locate materials, through combination of scanning in the world
//    or filters on the map."
//
// Clay was never rare. It was invisible: `clay_bank` carries `nearWater: true`, its own description
// says "Cut out of a riverbank with your hands if you have to" — and nothing read the flag, so clay
// banks were scattered evenly over six whole biomes instead of sitting at the water's edge. Clay
// gates the furnace AND the kiln, the first two machines in the game, so a player who could not find
// it could not start refining at all. That is the same shape of bug as `deep_vein`'s `indoors` one
// round earlier: a rule written into the data and read by nobody.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { materialIndex, whereToFind, createNodeField, kindsForBiome } from '../js/resources.js';

const DATA = JSON.parse(readFileSync(new URL('../data/resources.json', import.meta.url)));

test('every material the world yields is in the index, and knows where it lives', () => {
  const idx = materialIndex(DATA);
  assert.ok(idx.size >= 20, `only ${idx.size} materials indexed`);
  for (const [id, row] of idx) {
    assert.ok(row.name, `${id} has no name`);
    assert.ok(row.kinds.length, `${id} is yielded by nothing`);
    assert.ok(Number.isFinite(row.hardness), `${id} has no tool tier`);
    assert.ok(Array.isArray(row.biomes), `${id} has no biome list`);
  }
});

test('clay has an answer, and it is the water\'s edge', () => {
  const idx = materialIndex(DATA);
  const clay = idx.get('clay');
  assert.ok(clay, 'there is no clay in the game, which would explain a lot');
  assert.equal(clay.nearWater, true, 'clay stopped being a riverbank thing');
  assert.equal(clay.hardness, 0, 'clay needs a tool now — it should be bare hands');
  assert.ok(clay.biomes.includes('grassland'), 'clay left the most common biome in the game');
  const line = whereToFind(clay);
  assert.match(line, /water/i, `"${line}" does not tell you to look at the water`);
  assert.match(line, /bare hands/i, `"${line}" does not say you can dig it by hand`);
});

test('a material you can only get underground says so, and one you can get above ground does not', () => {
  const idx = materialIndex(DATA);
  // iron comes out of a deep vein (indoors) AND an ore outcrop (not) — telling the player to find a
  // cave for it would be a lie, so `indoors` means "ONLY underground"
  const iron = idx.get('iron_ore');
  assert.equal(iron.indoors, false, 'iron was declared cave-only, and it is not');
  assert.doesNotMatch(whereToFind(iron), /underground/i);

  // …and something that really is cave-only must still say so
  const onlyIndoors = [...idx.values()].find(r => r.indoors);
  if (onlyIndoors) assert.match(whereToFind(onlyIndoors), /underground/i);
});

test('the furnace and the kiln both want clay, which is why this matters', () => {
  /**
   * R18 — RE-AIMED AT THE PRICE THAT IS ACTUALLY CHARGED.
   *
   * This read `machines[id].build` out of data/refining.json. That block was one of 38 dead second
   * prices: only data/structures.json's `cost` is ever spent (js/buildplan.js `alignCatalogue` ->
   * js/build.js), and the two files disagreed on 25 of 35 buildings. Deleting the dead copies broke
   * this test, which is the test doing its job — it was asserting a design intent ("clay matters
   * because the things you build want it") against a number nobody paid.
   *
   * The intent is unchanged and still worth guarding; it just has to ask the live file. Note the
   * key is `cost` here and the vocabulary is the catalogue's, which is why `clay` is `clay` and not
   * an alias.
   */
  const structures = JSON.parse(readFileSync(new URL('../data/structures.json', import.meta.url)));
  const rows = Object.fromEntries((structures.structures || []).map(r => [r.id, r]));
  const wantsClay = Object.entries(rows).filter(([, r]) => (r.cost || {}).clay > 0).map(([k]) => k);
  assert.ok(wantsClay.includes('furnace'), 'the furnace stopped costing clay');
  assert.ok(wantsClay.includes('kiln'), 'the kiln stopped costing clay');
});

test('away from water, a kind that wants water is not on the table', () => {
  // `waterNear` is what createNodeField reads. Given a world with no water anywhere, no clay bank
  // may be placed — and given one that is all water's edge, some must be.
  const dry = createNodeField({
    data: DATA, area: { x: 0, z: 0, radius: 400 }, biome: 'grassland', count: 120,
    waterNear: () => false,
  });
  assert.equal(dry.filter(n => n.kind === 'clay_bank').length, 0,
    'a clay bank was placed in the middle of a dry plain');
  assert.ok(dry.length > 0, 'filtering the kinds must not thin out every OTHER seam as well');

  const wet = createNodeField({
    data: DATA, area: { x: 0, z: 0, radius: 400 }, biome: 'grassland', count: 120,
    waterNear: () => true,
  });
  assert.ok(wet.filter(n => n.kind === 'clay_bank').length > 0,
    'no clay bank anywhere on a whole riverbank');
});

test('with no waterNear given at all, nothing changes — the node tests hand in plain data', () => {
  const a = createNodeField({ data: DATA, area: { x: 0, z: 0, radius: 300 }, biome: 'grassland', count: 40 });
  assert.ok(a.length > 0);
  // and `kindsForBiome` is untouched: it still does not know about water, by design
  const kinds = kindsForBiome(DATA, 'grassland');
  assert.ok(kinds.some(([id]) => id === 'clay_bank'), 'clay is no longer a grassland kind at all');
});

test('no node kind names a biome that does not exist, or one that is under water', () => {
  // `createNodeWorld` marks any node standing on water `gone`, so listing a water biome is the same
  // as not listing anything: R14 found three kinds doing it.
  const src = readFileSync(new URL('../../../worldgen/js/biomes.js', import.meta.url), 'utf8');
  const keys = new Set([...src.matchAll(/key:\s*'([A-Za-z]+)'/g)].map(m => m[1]));
  assert.ok(keys.size > 20, 'could not read the biome keys');
  const WATER = new Set(['deepOcean', 'ocean', 'shallows', 'coast', 'lake', 'seaIce', 'river']);
  for (const [id, kind] of Object.entries(DATA.nodeKinds || {})) {
    for (const b of kind.biomes || []) {
      assert.ok(keys.has(b), `${id} lists biome "${b}", which World Forge has never heard of`);
      assert.ok(!WATER.has(b), `${id} lists "${b}", which is under water — every node placed there is deleted`);
    }
  }
});
