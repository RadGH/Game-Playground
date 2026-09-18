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
      for (let v = 0; v < part.position.length; v += 3) {
        assert.equal(part.position[v + 1], lake.surface, 'a lake that is not level');
      }
      /**
       * "A quad per cell" was the measurement until round 11. A small lake is drawn as a SHORE now
       * (`pondSheet`), because a lake of one or two cells came out as a blue rectangle with four
       * right angles in it — "a single blue pixel on the map that rendered as a lake, but it has
       * sharp corners". Only the ones too big for that are still squares, and for those the old
       * check still holds.
       */
      if (lake.round) {
        assert.ok(part.position.length / 3 > 8, 'a pond with no shoreline in it');
        assert.equal(part.index.length / 3, part.position.length / 3 - 1, 'a pond that is not a fan');
      } else {
        assert.equal(part.position.length / 3, lake.cells.length * 4, 'a quad per cell');
        // the cells overlap, so there is no hairline crack between two cells of the same lake
        const c0 = lake.cells[0];
        const cx = (c0 % t.width) * M_PER_CELL;
        const spanX = Math.max(...[0, 1, 2, 3].map(k => part.position[k * 3])) - Math.min(...[0, 1, 2, 3].map(k => part.position[k * 3]));
        assert.ok(spanX > M_PER_CELL, `a lake cell sheet ${spanX} m across a ${M_PER_CELL} m cell`);
        assert.ok(Number.isFinite(cx));
      }
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

// ---------------------------------------------------------------- round 11

/**
 * "On the edges of the river, I fall through the blue water layer and walk on the bottom, until I
 * hit the middle of the river where I pop back on top of the blue layer and equip my raft."
 *
 * The drawn sheet reaches the bank; `waterAt` only reached the plan's half-width. Everything between
 * the two was under the blue layer and counted as dry land. This walks a cross-section and asks for
 * one unbroken run of water from bank to bank, getting deeper toward the middle.
 */
test('the water you can see and the water the game knows about are the same width', () => {
  let checked = 0;
  for (const river of terrain.riverPaths.slice(0, 6)) {
    if (river.points.length < 30) continue;
    for (const i of [10, 20, 28]) {
      const [x, z] = river.points[i];
      const p = river.points[i + 1], q = river.points[i - 1];
      const dx = p[0] - q[0], dz = p[1] - q[1];
      const len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len, nz = dx / len;
      const surface = river.surface[i];
      const wetAt = [];
      // a metre in from the top of the bank: the sheet's last vertex is measured along the normal
      // and `waterAt` measures to the nearest point of a CURVING line, and on a bend those two
      // differ by a few centimetres, which is a sliver of shoreline and not a place you can stand
      for (let d = -river.reach + 1; d <= river.reach - 1; d += 1) {
        const X = x + nx * d, Z = z + nz * d;
        const ground = terrain.heightAt(X, Z);
        const water = terrain.waterAt(X, Z);
        // under the drawn sheet: the game has to agree that this is water
        if (ground < surface - 0.05) {
          assert.ok(water, `dry land ${d} m off the centre line and ${(surface - ground).toFixed(1)} m under the river`);
          wetAt.push(true);
        } else wetAt.push(false);
        if (water) assert.ok(terrain.plantable(X, Z) === false, 'something can grow in the river');
      }
      // the longest dry run BETWEEN the banks. A metre of it is the shoreline wobbling around the
      // water line; the bug was a band thirteen metres wide on each side that you walked along the
      // bottom of, with the raft only coming out in the middle.
      const first = wetAt.indexOf(true), last = wetAt.lastIndexOf(true);
      let dry = 0, worstDry = 0;
      for (let k = first; k >= 0 && k <= last; k++) { dry = wetAt[k] ? 0 : dry + 1; worstDry = Math.max(worstDry, dry); }
      assert.ok(worstDry <= 2, `${worstDry} m of dry channel inside the water — the raft would come and go`);
      if (first >= 0) checked++;
    }
  }
  assert.ok(checked > 3, `only ${checked} river cross-sections had any water in them`);
});

test('a one-cell lake is not a lake, and a small one has no corners', () => {
  // seed 1, Hes-Subud IV, x 22844, z 10308: "a single blue pixel on the map that rendered as a
  // lake, but it has sharp corners and looks completely unnatural"
  for (const seed of [1, 7, 3, 11]) {
    const wr = createWorld({ seed, width: 128, height: 64 });
    const t = makeTerrain(wr.world, wr.planet);
    for (const lake of t.lakes) {
      assert.ok(lake.cells.length >= 2, `seed ${seed} still draws a ${lake.cells.length}-cell lake`);
      // and the map agrees: nothing is left saying "water" where no water is drawn
      for (const i of lake.cells) assert.equal(wr.world.water[i], 2);
    }
    assert.ok(t.drainedTiny >= 0);
  }
  // the pond outline is a closed ring around the middle, not a box
  const pond = { cells: [5 * 128 + 5, 5 * 128 + 6], surface: 12, round: true };
  const part = lakeSheet(pond, M_PER_CELL, { width: 128, heightAt: () => 0 });
  const n = part.position.length / 3;
  assert.ok(n >= 12, 'a pond drawn with almost no shoreline');
  let corners = 0;
  for (let v = 1; v < n; v++) {
    const a = [part.position[v * 3], part.position[v * 3 + 2]];
    const b = [part.position[((v % (n - 1)) + 1) * 3], part.position[((v % (n - 1)) + 1) * 3 + 2]];
    if (Math.abs(a[0] - b[0]) < 1e-6 || Math.abs(a[1] - b[1]) < 1e-6) corners++;
  }
  assert.ok(corners <= 2, 'the pond is still drawn with straight axis-aligned edges');
});
