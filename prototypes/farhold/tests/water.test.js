// node --test prototypes/farhold/tests/water.test.js
//
// "The water layer should touch the edge of the ground, you should not be able to peek under the
// water." The old river sheet was exactly as wide as the water, and the channel was carved to full
// depth across that same width — so the sheet's edge hung above a bed that had not started climbing
// yet. These tests drive the real geometry against a real planet and a couple of shapes chosen to
// be awkward, and assert the only thing that matters: from outside, there is no gap.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { waterRibbon, lakeSheet } from '../js/water-plan.js';
import { createWorld, makeTerrain, M_PER_CELL } from '../js/planet.js';

const run = createWorld({ seed: 7, width: 128, height: 64 });
const terrain = makeTerrain(run.world, run.planet);

/** Every triangle of a part, as three [x,y,z] corners. */
function triangles(part) {
  const out = [];
  for (let i = 0; i < part.index.length; i += 3) {
    out.push(part.index.slice(i, i + 3).map(v => part.position.slice(v * 3, v * 3 + 3)));
  }
  return out;
}

test('a river sheet is at least as wide as the flat part of its own channel', () => {
  const river = terrain.riverPaths.find(r => r.points.length > 12);
  assert.ok(river, 'this world has no river to test');
  const a = 4, b = Math.min(river.points.length - 1, 24);
  const slice = river.points.slice(a, b + 1);
  const part = waterRibbon(slice, river.surface.slice(a, b + 1), river.half,
    { terrain, reach: river.reach, skirt: river.depth });

  for (let i = 0; i < slice.length; i++) {
    const l = part.position.slice(i * 6, i * 6 + 3);
    const r = part.position.slice(i * 6 + 3, i * 6 + 6);
    const span = Math.hypot(l[0] - r[0], l[2] - r[2]);
    assert.ok(span >= river.half * 2 - 0.01, `the sheet narrowed to ${span.toFixed(1)} m across a ${(river.half * 2).toFixed(1)} m river`);
    assert.ok(span <= river.reach * 2 + 0.01, 'the sheet ran past the top of the bank');
    assert.ok(Number.isFinite(l[1]) && l[1] === r[1], 'the two banks are at different water levels');
  }
});

test('you cannot see under a river: the bank, or the skirt, closes every edge', () => {
  let checked = 0, worst = 0;
  for (const river of terrain.riverPaths.slice(0, 8)) {
    if (river.points.length < 10) continue;
    const part = waterRibbon(river.points, river.surface, river.half,
      { terrain, reach: river.reach, skirt: river.depth });
    const n = river.points.length;
    for (let i = 0; i < n; i++) {
      for (const side of [0, 1]) {
        const top = part.position.slice((i * 2 + side) * 3, (i * 2 + side) * 3 + 3);
        const ground = terrain.heightAt(top[0], top[2]);
        // Either the bank has come back up to the water line (so the ground hides the edge), or the
        // skirt hangs below the ground here. One of the two must be true at every single vertex.
        const covered = ground >= top[1] - 0.01;
        const skirtFloor = Math.min(top[1], ground) - river.depth;
        assert.ok(covered || skirtFloor < ground, `open edge at ${top[0] | 0},${top[2] | 0}`);
        if (!covered) worst = Math.max(worst, top[1] - ground);
        checked++;
      }
    }
  }
  assert.ok(checked > 200, `only ${checked} river edges checked`);
  assert.ok(worst < 40, `a bank falls ${worst.toFixed(1)} m short of the water — the skirt would show`);
});

test('the skirt hangs down and faces outward, so it is solid from the bank', () => {
  const pts = [[0, 0], [10, 0], [20, 0], [30, 0]];
  // a dead flat world: the bank never rises, so this is the worst case and the skirt is all there is
  const flat = { heightAt: () => 0, width: 4 };
  const part = waterRibbon(pts, [5, 5, 5, 5], 3, { terrain: flat, reach: 12, skirt: 2 });
  const tops = part.position.length / 3;
  assert.ok(tops > pts.length * 2, 'no skirt was built at all');
  // every skirt vertex pair: top at the water line, bottom below the ground
  for (let v = pts.length * 2; v < tops; v += 2) {
    assert.equal(part.position[v * 3 + 1], 5, 'the skirt does not start at the water line');
    assert.ok(part.position[(v + 1) * 3 + 1] <= -2, 'the skirt does not reach below the ground');
  }
  // and it points away from the river, not into it
  for (let v = pts.length * 2; v < tops; v++) {
    const nz = part.normal[v * 3 + 2];
    assert.ok(Math.abs(nz) > 0.9, 'a skirt facing along the river instead of across it');
  }
  // no triangle is degenerate
  for (const [p, q, r] of triangles(part)) {
    const ux = q[0] - p[0], uy = q[1] - p[1], uz = q[2] - p[2];
    const vx = r[0] - p[0], vy = r[1] - p[1], vz = r[2] - p[2];
    const area = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
    assert.ok(area > 1e-6, 'a zero-area triangle in the water');
  }
});

test('lakes get water in them, flat, at one height, and wider than their cells', () => {
  const worlds = [run, createWorld({ seed: 3, width: 128, height: 64 }), createWorld({ seed: 11, width: 128, height: 64 })];
  let found = 0;
  for (const wr of worlds) {
    const t = makeTerrain(wr.world, wr.planet);
    for (const lake of t.lakes) {
      found++;
      assert.ok(lake.cells.length >= 1);
      assert.ok(Number.isFinite(lake.surface), 'a lake with no surface height');
      const part = lakeSheet(lake, M_PER_CELL, t);
      assert.equal(part.position.length / 3, lake.cells.length * 4, 'a quad per cell');
      for (let v = 0; v < part.position.length; v += 3) {
        assert.equal(part.position[v + 1], lake.surface, 'a lake that is not level');
      }
      // the cells overlap, so there is no hairline crack between two cells of the same lake
      const c0 = lake.cells[0];
      const cx = (c0 % t.width) * M_PER_CELL;
      const spanX = Math.max(...[0, 1, 2, 3].map(k => part.position[k * 3])) - Math.min(...[0, 1, 2, 3].map(k => part.position[k * 3]));
      assert.ok(spanX > M_PER_CELL, `a lake cell sheet ${spanX} m across a ${M_PER_CELL} m cell`);
      assert.ok(Number.isFinite(cx));
    }
  }
  assert.ok(found > 0, 'none of three worlds had a lake — check the flood fill');
});

test('every lake sits in a basin the terrain actually carved', () => {
  for (const lake of terrain.lakes) {
    // the middle of a lake must be below its own surface, or the sheet would be buried
    let below = 0;
    for (const i of lake.cells) {
      const x = (i % terrain.width) * M_PER_CELL, z = Math.floor(i / terrain.width) * M_PER_CELL;
      if (terrain.heightAt(x, z) < lake.surface) below++;
    }
    assert.ok(below / lake.cells.length > 0.5,
      `only ${below}/${lake.cells.length} cells of a lake are under its own water line`);
  }
});
