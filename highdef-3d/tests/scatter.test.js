// Placement rules. The things that must never happen: a tree in a lake, a fern on a cliff face, a
// different forest every time you load the same seed. Each of those is cheap to check here and
// awkward to spot by eye once there are forty thousand plants.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { generateWorldSync, BIOMES } from '../js/world.js';
import { scatterLayer, scatterWorld, nearbyInstances } from '../js/scatter.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const rules = JSON.parse(readFileSync(resolve(HERE, '..', 'data', 'vegetation.json'), 'utf8'));
const world = generateWorldSync({ size: 512, cell: 1, seed: 20260922 });

function all(cells) {
  const out = [];
  for (const arr of cells.values()) out.push(...arr);
  return out;
}

test('the rules file names only biomes that exist', () => {
  for (const [layer, spec] of Object.entries(rules.layers)) {
    for (const biome of Object.keys(spec.biomes)) {
      assert.ok(BIOMES[biome], `${layer} plants in an unknown biome "${biome}"`);
    }
    for (const b of Object.keys(BIOMES)) {
      assert.ok(spec.biomes[b], `${layer} has no rule for the ${b} biome`);
    }
  }
});

test('nothing is planted in the water', () => {
  for (const layer of Object.keys(rules.layers)) {
    const items = all(scatterLayer(world, rules.layers[layer], layer, { seed: 5 }));
    for (const p of items) {
      assert.ok(world.heightAt(p.x, p.z) >= world.waterLevel,
        `a ${layer} ${p.kind} is standing in ${(world.waterLevel - world.heightAt(p.x, p.z)).toFixed(2)} m of water`);
    }
  }
});

test('nothing is planted on a cliff face', () => {
  for (const [layer, spec] of Object.entries(rules.layers)) {
    const items = all(scatterLayer(world, spec, layer, { seed: 5 }));
    for (const p of items) {
      assert.ok(world.slopeAt(p.x, p.z) <= spec.maxSlope + 1e-6,
        `a ${layer} ${p.kind} is on a ${world.slopeAt(p.x, p.z).toFixed(2)} slope, the limit is ${spec.maxSlope}`);
    }
  }
});

test('every kind that is placed is one the rules asked for', () => {
  for (const [layer, spec] of Object.entries(rules.layers)) {
    const allowed = new Set(Object.values(spec.biomes).flatMap(b => Object.keys(b.weights)));
    for (const p of all(scatterLayer(world, spec, layer, { seed: 5 }))) {
      assert.ok(allowed.has(p.kind), `${layer} produced "${p.kind}", which no biome asks for`);
    }
  }
});

test('the same seed grows the same forest', () => {
  const a = all(scatterLayer(world, rules.layers.trees, 'trees', { seed: 11 }));
  const b = all(scatterLayer(world, rules.layers.trees, 'trees', { seed: 11 }));
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i += 37) {
    assert.equal(a[i].x, b[i].x);
    assert.equal(a[i].kind, b[i].kind);
    assert.equal(a[i].rot, b[i].rot);
  }
  const c = all(scatterLayer(world, rules.layers.trees, 'trees', { seed: 12 }));
  assert.notEqual(a.length === c.length && a[0]?.x === c[0]?.x, true);
});

test('trees do not stand inside each other', () => {
  const spec = rules.layers.trees;
  const cells = scatterLayer(world, spec, 'trees', { seed: 3 });
  for (const arr of cells.values()) {
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const d = Math.hypot(arr[i].x - arr[j].x, arr[i].z - arr[j].z);
        assert.ok(d >= spec.clearRadius - 1e-6, `two trees are ${d.toFixed(2)} m apart`);
      }
    }
  }
});

test('a forest biome really does get more trees than a meadow', () => {
  const items = all(scatterLayer(world, rules.layers.trees, 'trees', { seed: 8 }));
  const per = {};
  for (const p of items) per[p.biome] = (per[p.biome] || 0) + 1;
  const area = {};
  for (let i = 0; i < world.biome.length; i++) {
    const label = Object.values(BIOMES).find(b => b.id === world.biome[i])?.label;
    area[label] = (area[label] || 0) + 1;
  }
  const rate = (name) => (per[name] || 0) / Math.max(1, area[name] || 1);
  assert.ok(rate('Pinewood') > rate('Meadow') * 2, 'a pinewood should be far denser than a meadow');
  assert.ok(rate('Deepwood') >= rate('Pinewood') * 0.9, 'the deep wood should be the thickest of all');
});

test('turning the density down plants fewer things', () => {
  const full = all(scatterLayer(world, rules.layers.bushes, 'bushes', { seed: 2, density: 1 })).length;
  const half = all(scatterLayer(world, rules.layers.bushes, 'bushes', { seed: 2, density: 0.35 })).length;
  assert.ok(half < full * 0.75, `density 0.35 gave ${half} against ${full} at full`);
});

test('an exclusion circle stays empty', () => {
  const keep = { x: 20, z: -30, r: 24 };
  const items = all(scatterLayer(world, rules.layers.trees, 'trees', { seed: 4, exclusions: [keep] }));
  for (const p of items) {
    assert.ok(Math.hypot(p.x - keep.x, p.z - keep.z) >= keep.r, 'something grew inside the clearing');
  }
});

test('the whole run reports counts, and the lookup finds what is near a point', () => {
  const s = scatterWorld(world, rules, { seed: 20 });
  for (const layer of Object.keys(rules.layers)) {
    assert.ok(s.counts[layer] > 0, `nothing at all was planted for ${layer}`);
  }
  const spot = all(s.trees)[0];
  const near = nearbyInstances(s, 'trees', rules.layers.trees.cellSize, spot.x, spot.z, 5, world.half);
  assert.ok(near.some(p => p.x === spot.x && p.z === spot.z), 'the lookup missed a tree it was standing on');
  for (const p of near) assert.ok(Math.hypot(p.x - spot.x, p.z - spot.z) <= 5 + 1e-6);
});
