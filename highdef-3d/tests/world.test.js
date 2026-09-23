// The world field: the same seed must always build the same land, the biomes have to make sense,
// and every query has to agree with every other query. If the heightmap and the raycast disagree
// even slightly, the character sinks into hills — so that agreement is checked here rather than
// discovered later by walking into one.

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorldSync, classify, BIOMES, BIOME_BY_ID, WORLD_DEFAULTS } from '../js/world.js';
import { fbm, ridged, value2, worley2, makeRng } from '../js/noise.js';

const small = generateWorldSync({ size: 256, cell: 1 });

test('noise is deterministic and stays in range', () => {
  for (let i = 0; i < 500; i++) {
    const x = i * 0.37, y = i * 0.11;
    const a = value2(x, y, 7), b = value2(x, y, 7);
    assert.equal(a, b, 'the same input must give the same number');
    assert.ok(a >= 0 && a <= 1, `value2 out of range: ${a}`);
    assert.ok(fbm(x, y) >= 0 && fbm(x, y) <= 1);
    assert.ok(ridged(x, y) >= 0 && ridged(x, y) <= 1);
  }
  const w = worley2(3.3, 4.1, 2);
  assert.ok(w.f1 <= w.f2, 'the nearest point cannot be further than the second nearest');
});

test('the same seed builds the same world', () => {
  const a = generateWorldSync({ size: 128, cell: 1, seed: 4242 });
  const b = generateWorldSync({ size: 128, cell: 1, seed: 4242 });
  assert.deepEqual(Array.from(a.heights.slice(0, 500)), Array.from(b.heights.slice(0, 500)));
  const c = generateWorldSync({ size: 128, cell: 1, seed: 4243 });
  assert.notDeepEqual(Array.from(a.heights.slice(0, 500)), Array.from(c.heights.slice(0, 500)));
});

test('height queries agree with the grid they came from', () => {
  // heightAt at a grid node must return exactly what the array holds, or the mesh and the
  // character's feet are reading two different landscapes.
  for (let i = 4; i < 40; i++) {
    const x = -small.half + i * small.cell;
    const z = -small.half + (i * 3 % 60) * small.cell;
    const j = Math.round((z + small.half) / small.cell);
    const k = Math.round((x + small.half) / small.cell);
    assert.ok(Math.abs(small.heightAt(x, z) - small.heights[j * small.dim + k]) < 1e-3);
  }
});

test('normals point up and are unit length', () => {
  for (let i = 0; i < 200; i++) {
    const x = (i * 7 % 200) - 100, z = (i * 13 % 200) - 100;
    const n = small.normalAt(x, z);
    const len = Math.hypot(n.x, n.y, n.z);
    assert.ok(Math.abs(len - 1) < 1e-6, `normal not unit length: ${len}`);
    assert.ok(n.y > 0, 'the ground cannot face downwards');
  }
});

test('a ray straight down lands on the ground', () => {
  for (let i = 0; i < 40; i++) {
    const x = (i * 11 % 180) - 90, z = (i * 23 % 180) - 90;
    const hit = small.raycast({ x, y: 400, z }, { x: 0, y: -1, z: 0 });
    assert.ok(hit, 'a downward ray inside the map must hit');
    assert.ok(Math.abs(hit.y - small.heightAt(x, z)) < 0.05,
      `the ray and the heightmap disagree by ${Math.abs(hit.y - small.heightAt(x, z))} m`);
  }
});

test('an angled ray lands on the ground too', () => {
  const hit = small.raycast({ x: -90, y: 200, z: -90 }, norm(0.5, -0.6, 0.55));
  assert.ok(hit);
  assert.ok(Math.abs(hit.y - small.heightAt(hit.x, hit.z)) < 0.05);
});

test('a ray that leaves the map returns nothing rather than throwing', () => {
  assert.equal(small.raycast({ x: 0, y: 500, z: 0 }, norm(1, 0.02, 0)), null);
});

test('the biome ladder covers every case', () => {
  const seen = new Set();
  for (let h = -10; h < 120; h += 1.5) {
    for (const slope of [0, 0.2, 0.45, 0.6, 0.9]) {
      for (const m of [0, 0.3, 0.5, 0.6, 0.72, 0.9]) {
        const id = classify(h, slope, m, 2.6, WORLD_DEFAULTS);
        assert.ok(BIOME_BY_ID[id], `classify returned an unknown biome id ${id}`);
        seen.add(id);
      }
    }
  }
  assert.equal(seen.size, Object.keys(BIOMES).length, 'some biome can never be reached');
});

test('a full-size world has land, sea and a bit of everything', () => {
  const w = generateWorldSync({});
  let under = 0;
  const counts = {};
  for (let i = 0; i < w.heights.length; i++) {
    if (w.heights[i] < w.waterLevel) under++;
    const label = BIOME_BY_ID[w.biome[i]].label;
    counts[label] = (counts[label] || 0) + 1;
  }
  const total = w.heights.length;
  assert.ok(under / total > 0.12 && under / total < 0.55, `water covers ${(under / total * 100).toFixed(0)}% — that is not a coastline`);
  const forest = (counts.Pinewood + counts.Birchwood + counts.Deepwood) / total;
  assert.ok(forest > 0.15, `only ${(forest * 100).toFixed(0)}% forest — the world would look bare`);
  assert.ok(w.max > 60, 'nothing worth calling a mountain');
});

test('the spawn point is somewhere you could actually stand', () => {
  const w = generateWorldSync({});
  for (const s of [w.findSpawn(1), w.findSpawn(2), w.findSpawn(99)]) {
    assert.ok(s.y > w.waterLevel, 'spawned in the sea');
    assert.ok(w.slopeAt(s.x, s.z) < 0.3, 'spawned on a cliff');
    assert.ok(w.contains(s.x, s.z), 'spawned off the edge of the map');
  }
});

test('the random number generator is stable', () => {
  const a = makeRng(7), b = makeRng(7);
  for (let i = 0; i < 50; i++) assert.equal(a(), b());
});

function norm(x, y, z) { const l = Math.hypot(x, y, z); return { x: x / l, y: y / l, z: z / l }; }
