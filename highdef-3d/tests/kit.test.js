// The model kits.
//
// Three separate files build geometry — trees, rocks and the surface textures — and they all have
// to agree on one attribute contract, because the renderer merges and instances them together. A
// geometry with its attributes in a different order, or missing one, does not fail loudly: it
// either refuses to merge or renders as garbage. So the contract is checked here, on every builder
// at every detail level.
//
// `three` is resolved to the copy vendored in this repository by a small loader hook, so this test
// needs no package install.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./three-loader.mjs', import.meta.url);

const Trees = await import('../js/kit/trees.js');
const Rocks = await import('../js/kit/rocks.js');

const CONTRACT = [
  ['position', 3], ['normal', 3], ['uv', 2], ['color', 3], ['aWind', 2],
];

function checkGeometry(geo, what) {
  assert.ok(geo, `${what}: no geometry at all`);
  const names = Object.keys(geo.attributes);
  assert.deepEqual(names, CONTRACT.map(c => c[0]),
    `${what}: attributes are ${names.join(', ')} — the contract is ${CONTRACT.map(c => c[0]).join(', ')} in that order`);
  for (const [name, size] of CONTRACT) {
    assert.equal(geo.attributes[name].itemSize, size, `${what}: ${name} should hold ${size} numbers`);
  }
  const count = geo.attributes.position.count;
  assert.ok(count > 0, `${what}: empty`);
  for (const [name] of CONTRACT) {
    const a = geo.attributes[name];
    assert.equal(a.count, count, `${what}: ${name} has a different number of vertices`);
    for (let i = 0; i < a.array.length; i++) {
      assert.ok(Number.isFinite(a.array[i]), `${what}: ${name} holds a NaN at ${i}`);
    }
  }
  const w = geo.attributes.aWind;
  for (let i = 0; i < w.count; i++) {
    assert.ok(w.getX(i) >= 0 && w.getX(i) <= 1.001, `${what}: wind strength out of range`);
    assert.ok(w.getY(i) >= 0 && w.getY(i) <= 1.001, `${what}: wind phase out of range`);
  }
  assert.ok(geo.boundingSphere, `${what}: no bounding sphere, so it will never be culled correctly`);
}

function baseAtGround(geo, what) {
  // Everything is modelled with its base at y = 0 so the scatter can drop it straight onto the
  // terrain height. A plant floating 30 cm above the grass is the single most obvious tell.
  const p = geo.attributes.position;
  let min = Infinity;
  for (let i = 0; i < p.count; i++) min = Math.min(min, p.getY(i));
  assert.ok(min <= 0.05, `${what}: the lowest point is ${min.toFixed(3)} m — it would float`);
}

test('every tree species builds at every detail level', () => {
  for (const species of Object.keys(Trees.SPECIES)) {
    for (const lod of [0, 1, 2]) {
      const built = Trees.buildTree(species, { rng: Trees.makeRng(7), lod });
      assert.ok(built.height > 0, `${species}: no height`);
      const sp = Trees.SPECIES[species];
      assert.ok(built.height >= sp.minHeight * 0.7 && built.height <= sp.maxHeight * 1.5,
        `${species} came out ${built.height.toFixed(1)} m, outside its ${sp.minHeight}-${sp.maxHeight} m range`);
      for (const part of ['bark', 'foliage']) {
        if (!built[part] || built[part].attributes.position.count === 0) continue;
        checkGeometry(built[part], `${species} lod${lod} ${part}`);
      }
      // Only the woody part has to reach the ground — a canopy starts well above it. If the trunk
      // does not touch y = 0 the whole tree hovers when the scatter drops it on the terrain.
      if (built.bark && built.bark.attributes.position.count) {
        baseAtGround(built.bark, `${species} lod${lod} trunk`);
      }
    }
  }
});

test('detail levels really do get cheaper', () => {
  for (const species of Object.keys(Trees.SPECIES)) {
    const tri = (lod) => {
      const b = Trees.buildTree(species, { rng: Trees.makeRng(3), lod });
      let n = 0;
      for (const part of ['bark', 'foliage']) if (b[part]) n += b[part].attributes.position.count / 3;
      return n;
    };
    const t0 = tri(0), t1 = tri(1), t2 = tri(2);
    assert.ok(t1 <= t0, `${species}: level 1 (${t1}) is not cheaper than level 0 (${t0})`);
    assert.ok(t2 <= t1, `${species}: level 2 (${t2}) is not cheaper than level 1 (${t1})`);
    assert.ok(t0 < 7000, `${species}: ${t0} triangles at full detail is over budget`);
    assert.ok(t2 < 200, `${species}: ${t2} triangles at the cheapest level is over budget`);
  }
});

test('the small plants build too', () => {
  const groups = [
    ['bush', Trees.buildBush, ['shrub', 'berry_bush', 'juniper', 'bramble', 'heather']],
    ['fern', Trees.buildFern, ['fern', 'broadleaf', 'reed', 'cattail']],
    ['flower', Trees.buildFlower, ['daisy', 'bluebell', 'thistle', 'mushroom_cap', 'toadstool']],
    ['debris', Trees.buildLogsAndDebris, ['fallen_log', 'broken_stump', 'branch_pile', 'root_arch']],
  ];
  for (const [label, fn, kinds] of groups) {
    for (const kind of kinds) {
      for (const lod of [0, 1, 2]) {
        const built = fn(kind, { rng: Trees.makeRng(5), lod });
        let any = false;
        for (const part of ['bark', 'foliage']) {
          if (!built[part] || built[part].attributes.position.count === 0) continue;
          any = true;
          checkGeometry(built[part], `${label} ${kind} lod${lod} ${part}`);
        }
        assert.ok(any, `${label} ${kind} lod${lod} produced nothing at all`);
      }
    }
  }
  const tuft = Trees.buildGrassTuft({ rng: Trees.makeRng(9) });
  checkGeometry(tuft.foliage, 'grass tuft');
});

test('the leaf atlas cells stay inside the texture and pick the right row', () => {
  for (let row = 0; row < Trees.LEAF_ATLAS_ROWS; row++) {
    for (let col = 0; col < Trees.LEAF_ATLAS_COLS; col++) {
      const c = Trees.cellRect(col, row);
      assert.ok(c.u0 >= 0 && c.u1 <= 1 && c.v0 >= 0 && c.v1 <= 1, 'a cell falls off the atlas');
      assert.ok(c.u1 > c.u0 && c.v1 > c.v0, 'a cell has no area');
      // the atlas is uploaded with the canvas flipped, so row 0 must sit at the TOP (high v)
      const height = 1 / Trees.LEAF_ATLAS_ROWS;
      assert.ok(Math.abs(c.v1 - (1 - row * height)) < 0.01, `row ${row} is not where the atlas puts it`);
    }
  }
});

test('every rock, cliff, prop and ground detail builds at every level', () => {
  const sets = [
    ['rock', Rocks.buildRock, Rocks.CATALOG.rocks],
    ['cliff', Rocks.buildCliff, Rocks.CATALOG.cliffs],
    ['prop', Rocks.buildProp, Rocks.CATALOG.props],
    ['ground', Rocks.buildGroundDetail, Rocks.CATALOG.ground],
  ];
  for (const [label, fn, catalog] of sets) {
    const kinds = catalog.map(c => (typeof c === 'string' ? c : c.kind || c.id || c.name));
    assert.ok(kinds.length > 0, `${label}: the catalogue is empty`);
    for (const kind of kinds) {
      for (const lod of [0, 1, 2]) {
        const built = fn(kind, { rng: Rocks.makeRng(13), lod });
        checkGeometry(built.geometry, `${label} ${kind} lod${lod}`);
        assert.ok(built.height > 0, `${label} ${kind}: no height`);
      }
    }
  }
});

test('the same seed builds the same rock', () => {
  const a = Rocks.buildRock('boulder', { seed: 42 });
  const b = Rocks.buildRock('boulder', { seed: 42 });
  assert.deepEqual(Array.from(a.geometry.attributes.position.array),
                   Array.from(b.geometry.attributes.position.array));
  const c = Rocks.buildRock('boulder', { seed: 43 });
  assert.notDeepEqual(Array.from(a.geometry.attributes.position.array),
                      Array.from(c.geometry.attributes.position.array));
});

test('a rock sits in the ground rather than on it', () => {
  for (const kind of ['boulder', 'stone', 'slab', 'mossy_boulder']) {
    const built = Rocks.buildRock(kind, { seed: 8 });
    const p = built.geometry.attributes.position;
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < p.count; i++) { min = Math.min(min, p.getY(i)); max = Math.max(max, p.getY(i)); }
    assert.ok(min < 0, `${kind}: nothing below ground, it will look like it is resting on a table`);
    assert.ok(min > -(max - min) * 0.45, `${kind}: buried too deep (${min.toFixed(2)} of ${(max - min).toFixed(2)})`);
  }
});

test('the kits agree on the same attribute order, so their geometry can be merged', async () => {
  const { mergeGeometries } = await import('three/addons/utils/BufferGeometryUtils.js');
  const a = Trees.buildTree('pine', { seed: 1, lod: 2 }).bark;
  const b = Trees.buildLogsAndDebris('fallen_log', { seed: 2, lod: 2 }).bark;
  const merged = mergeGeometries([a.index ? a.toNonIndexed() : a, b.index ? b.toNonIndexed() : b], false);
  assert.ok(merged, 'two geometries from the same kit refused to merge');
  const rocksMerged = Rocks.mergeParts([
    Rocks.buildRock('stone', { seed: 1, lod: 2 }).geometry,
    Rocks.buildRock('pebble', { seed: 2, lod: 2 }).geometry,
  ]);
  assert.ok(rocksMerged, 'two rocks refused to merge');
});
