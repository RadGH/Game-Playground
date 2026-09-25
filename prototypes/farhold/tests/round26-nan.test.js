// node --test prototypes/farhold/tests/round26-nan.test.js
//
// Round 26 — "When I stand nearby and look at these coordinates, a large black square fills my
// interface" (seed 19629, Thinareik, x 13318 z 2171; "I have noticed a black square appearing in a
// few other areas too").
//
// The chain: a road polyline carried the same point twice in a row → `roadDeck` gave that point an
// edge direction of (0, 0) → its side walls had a zero-length vertex normal → the lighting divided
// by it and wrote ONE NaN pixel → the bloom blurred that pixel across its whole mip chain, and NaN
// mixed with anything is NaN, so it became a black square that followed the camera.
//
// This file holds the geometry end: no ribbon or deck may hand the GPU a normal that is not a unit
// vector, whatever the polyline looks like. tests/round26-fixes.spec.js holds the picture end: a
// NaN from ANY material must not turn into more than the one pixel it came from.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { roadDeck } from '../js/water-plan.js';
import { laneRibbon } from '../js/roadplan.js';

const here = dirname(fileURLToPath(import.meta.url));

/** Every normal is a finite unit vector. */
function unitNormals(normal) {
  const bad = [];
  for (let i = 0; i < normal.length; i += 3) {
    const [x, y, z] = [normal[i], normal[i + 1], normal[i + 2]];
    const len = Math.hypot(x, y, z);
    if (![x, y, z].every(Number.isFinite) || Math.abs(len - 1) > 1e-6) bad.push({ i: i / 3, x, y, z });
  }
  return bad;
}
const finite = arr => arr.every(Number.isFinite);

// polylines a road can really produce: a repeated point in the middle, at the start, at the end,
// and a run of the same point three times
const LINES = {
  middle: [[0, 0], [10, 0], [10, 0], [20, 5], [30, 5]],
  start: [[0, 0], [0, 0], [0, 10], [0, 20]],   // heading north, so a made-up heading would show
  end: [[0, 0], [10, 0], [20, 0], [20, 0]],
  run: [[0, 0], [8, 2], [8, 2], [8, 2], [16, 4]],
  // the worst case: prev and next are the SAME point on either side of a middle one
  pinch: [[0, 0], [5, 0], [5, 0], [5, 0]],
};

for (const [name, points] of Object.entries(LINES)) {
  test(`roadDeck (a lifted road, drawn with sides): unit normals with a repeated point at the ${name}`, () => {
    const heights = points.map((_, i) => 10 + i * 0.3);
    const deck = roadDeck(points, heights, 7, { thick: 0.5, lift: 0.06 });
    assert.ok(finite(deck.position), 'a deck vertex is not a number');
    assert.deepEqual(unitNormals(deck.normal), [], 'a deck normal is zero or not a number — that is the black square');
  });

  test(`laneRibbon (a draped road or street): finite, full width, with a repeated point at the ${name}`, () => {
    const lane = { points, surface: points.map(() => 5), half: 3.5 };
    const r = laneRibbon(lane);
    assert.ok(finite(r.position));
    assert.deepEqual(unitNormals(r.normal), []);
    // a repeated point used to pinch the ribbon to a width of nothing — every cross-section is 7 m
    for (let i = 0; i < r.position.length; i += 6) {
      const w = Math.hypot(r.position[i] - r.position[i + 3], r.position[i + 2] - r.position[i + 5]);
      assert.ok(Math.abs(w - 7) < 1e-6, `cross-section ${i / 6} is ${w.toFixed(3)} m wide`);
    }
  });
}

test('every pass that reads the HDR frame refuses a NaN (js/postfx.js)', () => {
  const src = readFileSync(join(here, '../js/postfx.js'), 'utf8');
  // the shafts, the final grade and the bloom's high-pass: three readers, three guards
  assert.match(src, /bright\( vec2 uv \) \{\s*vec3 c = fhSafe\(/, 'the light shafts read the frame unguarded');
  assert.match(src, /vec3 hdr = fhSafe\( texture2D\( tDiffuse/, 'the final grade reads the frame unguarded');
  assert.match(src, /safeHighPass\(bloom\)/, 'the bloom\'s high-pass is never guarded');
});
