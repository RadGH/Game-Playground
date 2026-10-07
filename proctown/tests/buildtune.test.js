// node --test proctown/tests/buildtune.test.js
//
// The two OPT-IN additions Thousandvale's play-test 5 asked of the kit, and the promise that goes with any opt-in in a
// file Farhold builds its towns from: WITHOUT the option, nothing moves.
//   describeBuilding({ tune })   taller storeys and doors, nothing dug in, the plot filled, a minimum storey count
//   gatehouseParts(kind, open)   a gatehouse as wide as the opening the wall needs, with jambs that keep their size
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KIT, CULTURE_KEYS, describeBuilding, partsFor, roofsCover, fitToPlot, wallKitParts, gatehouseParts, ALL_WALL_KINDS, MESHES } from '../js/buildkit.js';

const SEEDS = [1, 2, 3, 7, 11, 42, 99, 256, 777, 4096];
const PLOTS = [[4, 4], [8.6, 3.7], [7, 6], [12, 9], [18, 14], [5.5, 7.5]];
const WANTS = ['house', 'hall', 'forge', 'inn', 'shop', 'temple', 'stable', 'study', 'jeweller', 'market'];
const plot = (w, d, q, seed) => ({ cx: seed * 3.1, cz: w, w, d, angle: 0.3, facing: 0.3 + q * Math.PI / 2 });
const TUNE = { storeyHeight: [3.3, 3.9], doorHeight: [2.6, 3.0], doorWidth: [1.3, 1.8], sink: 0, windowScale: 1.3, minPitch: 0.8, roofBias: { turf_mound: 0.35 }, fill: 0.9, minStoreys: 2 };
function each(fn) {
  for (const culture of CULTURE_KEYS) for (const seed of SEEDS) for (const [w, d] of PLOTS) {
    const want = WANTS[(seed + Math.round(w)) % WANTS.length];
    fn({ plot: plot(w, d, seed % 4, seed), culture, seed, townSeed: 5, want });
  }
}

test('tune is opt-in: no tune, tune null and an empty tune are the same building, part for part', () => {
  let n = 0;
  each(args => {
    const a = describeBuilding(args), b = describeBuilding({ ...args, tune: null }), c = describeBuilding({ ...args, tune: {} });
    assert.deepEqual(b, a); assert.deepEqual(c, a);
    assert.deepEqual(partsFor(c), partsFor(a));
    n++;
  });
  assert.ok(n >= 400);
});

test('tune: storeys and doors take the heights asked for, nothing is dug in, and the door stands on the ground', () => {
  each(args => {
    const d = describeBuilding({ ...args, tune: TUNE });
    assert.ok(d.storeyHeight >= 3.3 - 1e-9 && d.storeyHeight <= 3.9 + 1e-9, `storey ${d.storeyHeight}`);
    assert.ok(d.door.h >= 2.6 - 1e-9 && d.door.h <= 3.0 + 1e-9, `door ${d.door.h}`);
    assert.ok(d.door.h <= d.storeyHeight - 0.25 + 1e-9, 'a door taller than its storey');
    assert.ok(d.storeys >= 2, 'minStoreys');
    for (const m of d.masses) assert.equal(m.sink, 0);
    const door = partsFor(d).find(p => p.tag === 'door' && p.mesh === 'box');
    assert.ok(door.y >= -1e-9, `the door starts ${door.y} m under the ground`);
    assert.ok(roofsCover(d), 'a tuned roof still covers its walls');
    for (const p of partsFor(d)) assert.ok(MESHES.includes(p.mesh) && [p.x, p.y, p.z, p.w, p.h, p.d].every(Number.isFinite));
  });
});

test('tune: the building stays ON ITS PLOT and facing the same way — only its size inside the plot changes', () => {
  let grew = 0, n = 0;
  each(args => {
    const a = describeBuilding(args), d = describeBuilding({ ...args, tune: TUNE });
    const fit = fitToPlot(args.plot), availW = Math.max(2.4, fit.w - KIT.knobs.plotInset * 2), availD = Math.max(2.4, fit.d - KIT.knobs.plotInset * 2);
    assert.ok(d.footprint.w <= availW + 1e-9 && d.footprint.d <= availD + 1e-9, 'a tuned building left its plot');
    assert.ok(d.footprint.w >= availW * 0.9 - 1e-9 && d.footprint.d >= availD * 0.9 - 1e-9, 'fill');
    assert.equal(d.yaw, a.yaw); assert.deepEqual(d.plotFit, a.plotFit); assert.equal(d.base, a.base);
    if (d.footprint.w * d.footprint.d > a.footprint.w * a.footprint.d * 1.2) grew++;
    n++;
  });
  assert.ok(grew > n * 0.3, `the plot is used: ${grew}/${n} footprints grew by a fifth or more`);
});

test('tune: a roof is as steep as asked where its type allows, and a turf mound is rarer', () => {
  let mounds = 0, moundsTuned = 0, n = 0;
  for (const seed of Array.from({ length: 300 }, (_, i) => i + 1)) {
    const args = { plot: plot(7, 6, 1, seed), culture: 'halfling', seed, want: 'shop' };
    const a = describeBuilding(args), d = describeBuilding({ ...args, tune: TUNE });
    if (a.roofType === 'turf_mound') mounds++;
    if (d.roofType === 'turf_mound') moundsTuned++;
    assert.ok(d.roofPitch >= Math.min(0.8, KIT.roofs[d.roofType].pitch[1]) - 1e-9, `${d.roofType} pitch ${d.roofPitch}`);
    n++;
  }
  assert.ok(moundsTuned < mounds * 0.7, `turf mounds ${mounds} -> ${moundsTuned} of ${n}`);
});

test('gatehouseParts: 4.2 m is the kit piece; wider keeps the passage clear and the jambs their own size', () => {
  for (const kind of ALL_WALL_KINDS) {
    assert.deepEqual(gatehouseParts(kind, 4.2), wallKitParts(kind, 'gatehouse'), kind);
    assert.deepEqual(gatehouseParts(kind), wallKitParts(kind, 'gatehouse'), kind);
    const kit = wallKitParts(kind, 'gatehouse');
    for (const open of [5, 6.2, 9, 11.4, 14]) {
      const parts = gatehouseParts(kind, open);
      assert.equal(parts.length, kit.length);
      parts.forEach((p, i) => {
        assert.ok([p.x, p.y, p.z, p.w, p.h, p.d].every(Number.isFinite), kind);
        const turned = Math.abs(Math.sin(p.yaw || 0)) > 0.7, half = (turned ? p.d : p.w) / 2;
        // the gatehouse rule, at the new width: nothing in the passage below 4.9 m (tilted stakes lean AWAY from it)
        if (p.y < 4.85 && !p.rz && !p.rx) assert.ok(Math.abs(p.x) - half >= open / 2 - 1e-6, `${kind} @${open}: a part in the passage at x ${p.x}`);
        assert.ok(Math.abs(p.z) + (turned ? p.w : p.d) / 2 <= 1.96, `${kind}: deeper than the kit`);
        // a jamb is the kit's jamb, moved: same size
        const k = kit[i], kHalf = (turned ? k.d : k.w) / 2;
        if (kHalf * 2 <= 4.2) { assert.equal(p.w, k.w); assert.equal(p.d, k.d); assert.equal(p.h, k.h); }
        else assert.ok(Math.abs(half * 2 - (kHalf * 2 + open - 4.2)) < 1e-9, 'a lintel that did not grow with the opening');
      });
    }
  }
});
