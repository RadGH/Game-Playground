// node --test proctown/tests/townplan.test.js
//
// The planner is the module Farhold imports, so these are the guarantees the game relies on. The
// important one is `no building ever sits on a street` — that is the entire reason the plan is built
// out of plots instead of coordinates, and if it ever fails the design has been undone.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  planTown, overlaps, summarise, footprintOf, makeRng,
  CULTURES, STREET_CLASSES, WANT_ORDER, WANT_FROM,
} from '../js/townplan.js';

const CULTURE_KEYS = Object.keys(CULTURES);
const SEEDS = [1, 2, 3, 7, 11, 42, 99, 256, 777, 4096, 20260918];

test('the same seed is the same town, every time', () => {
  for (const culture of CULTURE_KEYS) {
    const a = planTown({ seed: 42, size: 4, culture });
    const b = planTown({ seed: 42, size: 4, culture });
    assert.deepEqual(summarise(a), summarise(b));
    assert.deepEqual(a.plots, b.plots, `${culture} did not reproduce its plots`);
  }
});

test('a different seed is a different town', () => {
  // if two neighbouring seeds produce identical plans the generator is not using the seed
  const a = summarise(planTown({ seed: 7, size: 4, culture: 'human' }));
  const b = summarise(planTown({ seed: 8, size: 4, culture: 'human' }));
  assert.notDeepEqual(a, b);
});

test('NOTHING sits on a street, in any culture, at any size, on any seed', () => {
  for (const culture of CULTURE_KEYS) {
    for (const seed of SEEDS) {
      for (const size of [1, 2, 3, 4, 5, 6]) {
        const plan = planTown({ seed, size, culture });
        const hits = overlaps(plan);
        assert.equal(hits.length, 0,
          `${culture} seed ${seed} size ${size}: ${hits.length} overlap(s), first ${JSON.stringify(hits[0])}`);
      }
    }
  }
});

test('every plot is inside the town footprint', () => {
  for (const culture of CULTURE_KEYS) {
    const plan = planTown({ seed: 11, size: 5, culture });
    for (const p of plan.plots) {
      const far = Math.hypot(p.cx, p.cz);
      assert.ok(far <= plan.ring + 1, `${culture}: a plot sits ${far.toFixed(1)} m out of a ${plan.ring} m ring`);
    }
  }
});

test('a bigger settlement really is bigger', () => {
  for (const culture of CULTURE_KEYS) {
    const small = planTown({ seed: 5, size: 1, culture });
    const big = planTown({ seed: 5, size: 6, culture });
    assert.ok(big.plots.length > small.plots.length, `${culture}: size 6 is not busier than size 1`);
    assert.ok(big.ring > small.ring);
  }
});

test('a walled town always has at least two ways in, and never more than four', () => {
  for (const culture of CULTURE_KEYS) {
    for (const seed of SEEDS) {
      const plan = planTown({ seed, size: 5, culture });
      assert.ok(plan.wall, `${culture} seed ${seed}: size 5 should be walled`);
      const n = plan.wall.gates.length;
      assert.ok(n >= 2 && n <= 4, `${culture} seed ${seed}: ${n} gates`);
    }
  }
});

test('gates are spread around the wall, not stacked on one side', () => {
  const plan = planTown({ seed: 3, size: 6, culture: 'human' });
  const gates = plan.wall.gates;
  for (let i = 0; i < gates.length; i++) {
    for (let j = i + 1; j < gates.length; j++) {
      const apart = Math.abs(((gates[i].angle - gates[j].angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      assert.ok(apart > 0.6, 'two gates are practically on top of each other');
    }
  }
});

test('every plot faces a real direction and knows its district', () => {
  const plan = planTown({ seed: 21, size: 5, culture: 'dwarf' });
  for (const p of plan.plots) {
    assert.ok(Number.isFinite(p.facing), 'a plot with no frontage would put a door on a blank wall');
    assert.ok(['civic', 'craft', 'residential'].includes(p.district));
    assert.ok(p.want, 'every plot gets something to build');
  }
});

test('what a town wants follows its size', () => {
  // barracks are size 4 and up; a hamlet must not have one
  const hamlet = planTown({ seed: 9, size: 1, culture: 'human' });
  assert.ok(!hamlet.plots.some(p => p.want === 'barracks'), 'a hamlet raised a barracks');
  const city = planTown({ seed: 9, size: 6, culture: 'human' });
  const wanted = new Set(city.plots.map(p => p.want));
  for (const key of WANT_ORDER) {
    if ((WANT_FROM[key] ?? 0) <= 6) assert.ok(wanted.has(key), `a city has no ${key}`);
  }
});

test('the trades get the big plots, not an alley', () => {
  const plan = planTown({ seed: 13, size: 6, culture: 'human' });
  const area = p => p.w * p.d;
  const hall = plan.plots.find(p => p.want === 'hall');
  const homes = plan.plots.filter(p => p.want === 'house' || p.want === 'hut');
  const medianHome = homes.map(area).sort((a, b) => a - b)[Math.floor(homes.length / 2)];
  assert.ok(area(hall) >= medianHome, 'the hall was squeezed onto a smaller plot than a typical house');
});

test('the culture genuinely changes the shape of the town', () => {
  // a dwarf splits at the middle and square on; a halfling wanders. If those come out the same, the
  // jitter knob is doing nothing and every culture is one culture.
  const dwarf = planTown({ seed: 31, size: 5, culture: 'dwarf' });
  const halfling = planTown({ seed: 31, size: 5, culture: 'halfling' });
  assert.notEqual(dwarf.plots.length, halfling.plots.length);
});

test('street classes are a real hierarchy', () => {
  for (let i = 1; i < STREET_CLASSES.length; i++) {
    assert.ok(STREET_CLASSES[i].width < STREET_CLASSES[i - 1].width, 'a lane is not narrower than a main street');
  }
  const plan = planTown({ seed: 6, size: 6, culture: 'human' });
  const classes = new Set(plan.streets.map(s => s.cls));
  assert.ok(classes.size > 1, 'a city should have more than one grade of street');
});

test('footprintOf matches what the plan actually uses', () => {
  for (const size of [1, 3, 6]) {
    const f = footprintOf(size);
    const plan = planTown({ seed: 2, size, culture: 'human' });
    assert.equal(plan.ring, f.ring);
    assert.equal(!!plan.wall, f.walled);
  }
});

test('the seeded generator is stable and in range', () => {
  const rng = makeRng(12345);
  const first = [rng(), rng(), rng()];
  const again = makeRng(12345);
  assert.deepEqual(first, [again(), again(), again()]);
  for (const v of first) assert.ok(v >= 0 && v < 1);
});
