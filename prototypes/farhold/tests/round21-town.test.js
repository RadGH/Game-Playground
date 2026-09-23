// Farhold — round 21: the town square, the streets, and what stands beside a road.
//
// Three play-test reports, one town (seed 25392, Kydsel IV, x 5265 z 1683):
//   1. "There is often an event directly at the town center node, which almost always has a road
//      going directly through it… It makes this town square dense."
//   2. "There are lots of sub-roads that are totally meaningless and/or don't connect to the main
//      road… several roads (and the waypoint) overlapping the main road."
//   3. "Some small pillars… are off center, spilling into the middle of the road."

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { streetLanes } from '../js/town-plan.js';

/** A flat world with one road running along z = 0, eight metres wide. */
function roadTerrain() {
  return {
    heightAt: () => 0,
    slopeAt: () => 0,
    underwater: () => false,
    riverAt: () => 0,
    waterAt: () => null,
    bridgedAt: () => false,
    roadAt: (x, z) => (Math.abs(z) <= 4 ? 1 : 0),
    clampToWorld: (x, z) => [x, z],
    roadPaths: [{ points: [[-500, 0], [500, 0]], half: 4 }],
  };
}

test('a street that lies on the world road is not drawn a second time on top of it', () => {
  const terrain = roadTerrain();
  // one street straight down the carriageway, one honest street away from it
  const plan = {
    streets: [
      { pts: [[-60, 0], [60, 0]], cls: 'main', width: 5 },
      { pts: [[-60, 30], [60, 30]], cls: 'main', width: 5 },
    ],
  };
  const skip = (x, z) => terrain.roadAt(x, z) > 0.45;
  const lanes = streetLanes(plan, { cx: 0, cz: 0, terrain, skip, prune: true });
  for (const lane of lanes) {
    for (const [x, z] of lane.points) {
      assert.ok(terrain.roadAt(x, z) <= 0.45,
        `a town street is still being paved on the world road at ${x | 0},${z | 0}`);
    }
  }
});

test('paving that reaches nothing is dropped, and paving that reaches the road is kept', () => {
  const terrain = roadTerrain();
  const plan = {
    streets: [
      // a real high street, running from the road out into the town
      { pts: [[0, 5], [0, 60]], cls: 'main', width: 5 },
      // a lane hanging off it
      { pts: [[0, 40], [40, 40]], cls: 'lane', width: 3.2 },
      // …and an alley in a field, a hundred metres from anything. This is the reported bug.
      { pts: [[200, 200], [214, 206]], cls: 'alley', width: 2.2 },
      // a scrap of paving RIGHT BESIDE the high street, so only its length can disqualify it
      { pts: [[3, 30], [4.4, 30]], cls: 'alley', width: 2.2 },
    ],
  };
  const skip = (x, z) => terrain.roadAt(x, z) > 0.45;
  const kept = streetLanes(plan, { cx: 0, cz: 0, terrain, skip, prune: true });
  const reaches = (lane, x, z) => lane.points.some(p => Math.hypot(p[0] - x, p[1] - z) < 3);

  assert.ok(kept.some(l => reaches(l, 0, 30)), 'the high street was dropped');
  assert.ok(kept.some(l => reaches(l, 30, 40)), 'a lane joined to the high street was dropped');
  assert.ok(kept.some(l => reaches(l, 0, 55)), 'the high street was dropped');
  assert.ok(!kept.some(l => reaches(l, 207, 203)), 'the orphan alley in the field is still drawn');
  assert.ok(!kept.some(l => reaches(l, 3.7, 30)), 'a 1.4 m scrap of paving is still drawn');

  // and without `prune` the function stays the pure transform the older tests drive it as
  const raw = streetLanes(plan, { cx: 0, cz: 0, terrain, skip });
  assert.ok(raw.length > kept.length, 'pruning must be opt-in');
});

test('pruning never leaves a town with no streets at all', () => {
  const terrain = roadTerrain();
  // nothing is a main, nothing touches the road: the longest run still has to survive
  const plan = {
    streets: [
      { pts: [[100, 100], [140, 100]], cls: 'alley', width: 2.2 },
      { pts: [[300, 300], [308, 300]], cls: 'alley', width: 2.2 },
    ],
  };
  const kept = streetLanes(plan, { cx: 0, cz: 0, terrain, skip: null, prune: true });
  assert.ok(kept.length >= 1, 'a town with only alleys lost every one of them');
});
