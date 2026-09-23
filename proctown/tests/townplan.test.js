// node --test proctown/tests/townplan.test.js
//
// The planner is the module Farhold imports, so these are the guarantees the game relies on. The
// important one is `no building ever sits on a street` — that is the entire reason the plan is built
// out of plots instead of coordinates, and if it ever fails the design has been undone.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  planTown, overlaps, summarise, footprintOf, makeRng, corners, demoTerrain,
  connectStreets, linkRoads, nearestOnStreets,
  CULTURES, STREET_CLASSES, WANT_ORDER, WANT_FROM, WALL_CLEARANCE,
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
      // every CORNER, not the centre — a rotated plot can have its middle inside and a corner out
      for (const [x, z] of corners(p)) {
        const far = Math.hypot(x, z);
        assert.ok(far <= plan.ring + 0.5, `${culture}: a plot corner sits ${far.toFixed(1)} m out of a ${plan.ring} m ring`);
      }
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

test('a planned culture holds one angle and a grown one does not', () => {
  // this is the test that would have caught `grammar` being dead data: it was written into seven
  // culture records and read in none, so every town came out a rectangular grid however the knobs
  // were set, and an elf settlement was a dwarf settlement with different numbers.
  const angleCount = culture => {
    const seen = new Set();
    for (let seed = 1; seed <= 12; seed++) {
      for (const p of planTown({ seed, size: 5, culture }).plots) seen.add(Math.round(p.angle * 57.3));
    }
    return seen.size;
  };
  // a planned town is rotated once at the root and never again: one angle per town, no more
  assert.ok(angleCount('dwarf') <= 14, 'a dwarf town should be a rigid grid');
  assert.ok(angleCount('desert') <= 14, 'a desert town should be a rigid grid');
  // a grown town bends: many more distinct angles than it has towns
  for (const culture of ['human', 'elf', 'undead', 'halfling', 'orc']) {
    assert.ok(angleCount(culture) > 20, `${culture} is coming out as a grid — is grammar wired?`);
  }
});

test('a grown town bends its streets and a planned one does not', () => {
  const bowed = culture => planTown({ seed: 5, size: 6, culture }).streets.filter(s => s.pts.length > 2).length;
  assert.equal(bowed('dwarf'), 0, 'a dwarf street should be straight');
  assert.ok(bowed('elf') > 0, 'an elf street should bend');
});

test('the ground changes a grown plan and is ignored by a planned one', () => {
  // elves follow the land; dwarves cut through it. Two different heightfields, same seed.
  const flat = () => 0;
  const hilly = demoTerrain(3);
  const shape = plan => plan.plots.map(p => Math.round(p.angle * 57.3)).join(',');

  const elfFlat = shape(planTown({ seed: 8, size: 5, culture: 'elf', heightAt: flat }));
  const elfHill = shape(planTown({ seed: 8, size: 5, culture: 'elf', heightAt: hilly }));
  assert.notEqual(elfFlat, elfHill, 'an elf town ignored the terrain it was built on');

  const dwarfFlat = shape(planTown({ seed: 8, size: 5, culture: 'dwarf', heightAt: flat }));
  const dwarfHill = shape(planTown({ seed: 8, size: 5, culture: 'dwarf', heightAt: hilly }));
  assert.equal(dwarfFlat, dwarfHill, 'a dwarf town bent to the terrain; it should cut through it');
});

test('every culture builds a town worth walking into', () => {
  // the shrink that keeps rotated blocks out of their siblings costs floor area, and it compounds.
  // Left unchecked it took an elf settlement down to four buildings while a dwarf one had
  // thirty-seven. Nothing may fall off a cliff like that again.
  for (const culture of Object.keys(CULTURES)) {
    const counts = [];
    for (let seed = 1; seed <= 25; seed++) counts.push(planTown({ seed, size: 5, culture }).plots.length);
    const median = counts.sort((a, b) => a - b)[12];
    assert.ok(median >= 15, `${culture} builds a median of ${median} plots at size 5 — that is a hamlet, not a town`);
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
  for (const s of plan.streets) assert.ok(s.pts.length >= 2, 'a street needs at least two points');
  const classes = new Set(plan.streets.map(s => s.cls));
  assert.ok(classes.size > 1, 'a city should have more than one grade of street');
});

test('footprintOf is where a town STARTS, and a clear site of any real size stays there', () => {
  // From size 3 up the base footprint is ample, so nothing should make it grow. Below that the ring
  // is only a couple of blocks across and a hamlet has to spread a little to hold a handful of
  // houses at all — `footprintOf` is the starting point, not a promise, and that is the whole reason
  // the growth exists.
  for (const size of [3, 4, 5, 6]) {
    const f = footprintOf(size);
    const plan = planTown({ seed: 2, size, culture: 'human' });
    assert.equal(plan.ring, f.ring, `size ${size} grew on clear ground`);
    assert.equal(!!plan.wall, f.walled);
  }
  for (const size of [0, 1, 2]) {
    const f = footprintOf(size);
    const plan = planTown({ seed: 2, size, culture: 'human' });
    assert.ok(plan.ring >= f.ring, 'a settlement never shrinks below its footprint');
    assert.ok(plan.ring <= f.ring * 1.7, `size ${size} sprawled to ${Math.round(plan.ring)} m`);
  }
});

test('a town whose ground is taken COVERS MORE OF IT rather than emptying out', () => {
  // A road through the middle takes about a third of a settlement's area, and no amount of
  // subdividing makes more ground: Hollowcrown went from 31 plots on clear ground to 15 with its
  // real terrain, and every finer attempt stayed at 15. A real town spreads along the bank and up
  // the road instead, so the ring grows until it has the plots it needs.
  const road = (lx) => Math.abs(lx) > 10;          // a 20 m corridor straight through
  const clear = planTown({ seed: 11, size: 4, culture: 'human' });
  const crossed = planTown({ seed: 11, size: 4, culture: 'human', buildable: road });

  assert.ok(crossed.ring > clear.ring, 'a town that lost ground did not spread to make up for it');
  assert.ok(crossed.plots.length >= clear.plots.length,
    `a road left it with ${crossed.plots.length} plots against ${clear.plots.length} on clear ground`);
  // and the wall goes with it, or a grown town stands outside its own defences
  assert.ok(crossed.wallRadius > clear.wallRadius);
  // nothing may end up on the blocked ground
  for (const p of crossed.plots) assert.ok(road(p.cx), 'a plot was laid in the road corridor');
});

test('the seeded generator is stable and in range', () => {
  const rng = makeRng(12345);
  const first = [rng(), rng(), rng()];
  const again = makeRng(12345);
  assert.deepEqual(first, [again(), again(), again()]);
  for (const v of first) assert.ok(v >= 0 && v < 1);
});

test('a town is mostly homes, not a row of trades', () => {
  // One plot per trade, biggest first, sounds right and is not: a settlement wants a dozen trades
  // from size 4 up, so on a plan that yields nineteen plots thirteen of them became a forge, an inn,
  // a chapel and a barracks, and the "city" had six homes in it. In the game that read as a town
  // with nobody living in it.
  for (const culture of Object.keys(CULTURES)) {
    for (const size of [4, 5, 6]) {
      for (const seed of [3, 11, 42]) {
        const plan = planTown({ seed, size, culture });
        if (plan.plots.length < 9) continue;                  // too small to say anything about
        const homes = plan.plots.filter(p => p.want === 'house' || p.want === 'hut').length;
        assert.ok(homes >= plan.plots.length * 0.55,
          `${culture} size ${size} seed ${seed}: ${homes} homes of ${plan.plots.length} plots`);
      }
    }
  }
});

test('the trades still arrive in want order, so a small town drops the bottom of the list', () => {
  const small = planTown({ seed: 3, size: 4, culture: 'human' });
  const big = planTown({ seed: 3, size: 6, culture: 'human' });
  const tradesIn = plan => new Set(plan.plots.map(p => p.want).filter(w => w !== 'house' && w !== 'hut'));
  const a = tradesIn(small), b = tradesIn(big);
  // whatever the smaller town has, the bigger one has too — it does not swap one trade for another
  for (const want of a) assert.ok(b.has(want), `the bigger town lost the ${want} the smaller one has`);
});

// ---------------------------------------------------------------------------- one network

/** How many separate pieces a set of streets is in. The pass that fixes this also measures it. */
function pieces(plan) {
  const probe = connectStreets({ streets: plan.streets.slice(), square: plan.square });
  return probe.groups || 1;
}

test('every town is ONE connected street network — no paving with no road attached to it', () => {
  // Reported in play: "There are still random flat rectangles in town I think are supposed to be
  // roads, can they be interconnected somehow… They still don't feel quite natural." A street that
  // reaches nothing is a slab in a field, and there is no way for a player to read it as a road.
  for (const culture of CULTURE_KEYS) {
    for (const seed of [1, 2, 3, 7, 11]) {
      for (const size of [1, 2, 3, 4, 5, 6]) {
        const plan = planTown({ seed, size, culture });
        if (plan.streets.length < 2) continue;
        assert.equal(pieces(plan), 1,
          `${culture} size ${size} seed ${seed} came out in more than one piece`);
      }
    }
  }
});

test('the highway comes into town, and becomes a street of the town', () => {
  const links = [[-40, 0], [0, 42]];
  const plan = planTown({ seed: 7, size: 4, culture: 'human', links });
  const high = plan.streets.filter(st => st.highway);
  assert.ok(high.length >= 1, 'no road was brought into the town at all');
  // each one starts where the road arrives…
  for (const st of high) {
    assert.ok(links.some(([lx, lz]) => Math.hypot(st.pts[0][0] - lx, st.pts[0][1] - lz) < 0.01),
      'a high street does not start where the road arrives');
    // …and ends ON the existing plan, which is what "connect to the real roads" means
    const others = plan.streets.filter(o => o !== st);
    const end = nearestOnStreets(others, st.pts[st.pts.length - 1][0], st.pts[st.pts.length - 1][1]);
    assert.ok(end && end.distance < 1.5, 'a high street ends in a field');
  }
  assert.equal(pieces(plan), 1);
});

test('a spur is a STREET, so nothing is ever built on one', () => {
  // The whole design rests on "a plot cannot overlap a street" — a spur crosses a block rather than
  // bounding it, so it is the one kind of street that could break that if the plots were cut first.
  for (const culture of CULTURE_KEYS) {
    for (const seed of [1, 5, 13, 42]) {
      for (const size of [2, 4, 6]) {
        const plan = planTown({ seed, size, culture, links: [[-30, 10], [25, -30]] });
        assert.equal(overlaps(plan).length, 0,
          `${culture} size ${size} seed ${seed}: something is standing on a street`);
      }
    }
  }
});

test('linkRoads does nothing when the road already meets the plan', () => {
  const out = { streets: [{ pts: [[0, 0], [20, 0]], cls: 'main', width: 5 }], square: { cx: 0, cz: 0, r: 5 } };
  assert.equal(linkRoads(out, [[10, 0.5]]), 0, 'a redundant high street was laid anyway');
  assert.equal(out.streets.length, 1);
  assert.equal(linkRoads(out, [[10, 30]]), 1, 'a road arriving 30 m away was not brought in');
});

// ------------------------------------------------------------------------ round 22: the wall

test('R22 — no plot touches the wall, in any culture, at any size, on any seed', () => {
  /**
   * *"At this location houses clip through the wall."* (Farhold, seed 25392, Kydsel IV.)
   *
   * The fault was a consumer's — Farhold recomputed its own unscaled ring instead of reading
   * `plan.wallRadius` — but `overlaps()` had no wall in it at all, which is why nothing in the
   * shared library could have caught it. It has one now, and this is the sweep: every corner of
   * every plot, inside the masonry with `WALL_CLEARANCE` metres of daylight, on a clear site and
   * on one where the ground is taken and the ring has to grow.
   */
  const road = lx => Math.abs(lx) > 10;             // a 20 m corridor through the middle
  let walled = 0, grown = 0;
  for (const culture of CULTURE_KEYS) {
    for (const seed of SEEDS) {
      for (const size of [4, 5, 6]) {
        for (const buildable of [null, road]) {
          const plan = planTown({ seed, size, culture, buildable: buildable || undefined });
          if (!plan.wall) continue;
          walled++;
          if (plan.wallRadius > footprintOf(size).wall + 0.01) grown++;
          const hits = overlaps(plan).filter(h => h.kind === 'plot-wall');
          assert.deepEqual(hits, [],
            `${culture} size ${size} seed ${seed}: ${hits.length} plots reach the wall`
            + (hits[0] ? `, worst ${hits[0].over.toFixed(1)} m past a ${plan.wallRadius.toFixed(0)} m wall` : ''));
          for (const p of plan.plots) {
            for (const [x, z] of corners(p)) {
              assert.ok(Math.hypot(x, z) <= plan.wallRadius - WALL_CLEARANCE,
                `${culture} size ${size} seed ${seed}: a plot corner ${Math.hypot(x, z).toFixed(1)} m out`);
            }
          }
        }
      }
    }
  }
  assert.ok(walled > 100, `only ${walled} walled towns checked`);
  assert.ok(grown > 0, 'no town in the sweep grew its ring — this test can no longer see the bug');
});

test('R22 — a link stays ON the wall when the town grows to fit it', () => {
  /**
   * `links` are worked out by the caller against the town's normal size. A crowded site then
   * retries at `ringScale` up to 1.65, and the links used to stay where they were — in the middle
   * of the bigger town rather than on its edge — so `linkRoads` laid the high street from an inside
   * point and the road arrived at the wall with nothing joining it.
   */
  const road = lx => Math.abs(lx) > 10;
  const base = footprintOf(4);
  const link = [base.wall, 0];                      // a road arriving due east, on the wall
  const grown = planTown({ seed: 11, size: 4, culture: 'human', buildable: road, links: [link] });
  assert.ok(grown.wallRadius > base.wall + 0.01, 'this site no longer grows — pick another seed');
  const high = grown.streets.filter(s => s.highway);
  assert.equal(high.length, 1, `${high.length} high streets for one link`);
  const [sx, sz] = high[0].pts[0];
  assert.ok(Math.abs(Math.hypot(sx, sz) - grown.wallRadius) < 0.01,
    `the high street starts ${Math.hypot(sx, sz).toFixed(1)} m out on a ${grown.wallRadius.toFixed(1)} m wall`);
  assert.ok(Math.abs(Math.atan2(sz, sx)) < 1e-6, 'the link changed bearing as well as distance');

  // …and a town that does not grow leaves its links exactly where they were put
  const plain = planTown({ seed: 2, size: 4, culture: 'human', links: [link] });
  assert.equal(plain.wallRadius, base.wall);
  const kept = plain.streets.find(s => s.highway);
  assert.ok(kept && Math.hypot(kept.pts[0][0] - link[0], kept.pts[0][1] - link[1]) < 1e-9,
    'a link moved on a town that never grew');
});
