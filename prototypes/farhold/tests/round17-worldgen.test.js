// node --test prototypes/farhold/tests/round17-worldgen.test.js
//
// Round 17 — the world-generation cluster. Three reports, seven faults, one coordinate:
//
//   4. "At the location (seed 56138, Chodikvraun III, biome Grassland, x 11572, z 2995, altitude 24)
//      the center of the town has a bunch of stuff semi-underwater. The water does not touch the
//      shoreline. There is a tower inside of the bridge. And the bridge only connects to one side of
//      the road (I think the road just stops)."
//   6. "The river collides with a road here and messes with the water. Can we make sure crossings
//      like this generated raised bridges instead? (… x 11547, z 3152)"
//   7. "Try to prevent spawning Clay and other resources directly on the road."
//
// `tools/probe-worldgen.mjs` builds that exact world and prints a number for each of them; this is
// the same measurements, turned into rules and run over several worlds so a fix cannot hold on one
// seed and let go everywhere else.
//
// Everything drives the REAL modules. `js/planet.js`, `js/water-plan.js`, `js/resources.js` and
// proctown have no Three.js in them, so node runs the same code the game runs. `js/features.js`
// does need Three, so the two things it does with the terrain — the footprint water test and the
// bridge test — are restated here, and the last test in this file reads the source to check the
// restatement has not quietly drifted out of date. That is the pattern round 16 set.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createWorld, makeTerrain, setMetresPerCell, M_PER_CELL_DEFAULT, M_PER_CELL } from '../js/planet.js';
import { footprintOf, streetLanes } from '../js/town-plan.js';
import { ringCrossings } from '../js/roadplan.js';
import { waterRibbon } from '../js/water-plan.js';
import { createNodeWorld } from '../js/resources.js';
import { planTown, cultureFor } from '../../../proctown/js/townplan.js';
import { describeBuilding, radiusOf } from '../../../proctown/js/buildkit.js';

const here = dirname(fileURLToPath(import.meta.url));
const resourceData = JSON.parse(readFileSync(join(here, '../data/resources.json'), 'utf8'));

/** The worlds these rules are checked over. Small maps so the whole file stays a few seconds. */
const SEEDS = [1, 7, 11, 19, 1337];
const worlds = SEEDS.map(seed => {
  const wr = createWorld({ seed, width: 128, height: 64 });
  return { seed, wr, t: makeTerrain(wr.world, wr.planet) };
});

/** The settlements a town builder would lay out, in metres. */
function townsOf(t) {
  return (t.world.nodes || [])
    .filter(n => n.type === 'settlement' || n.type === 'port')
    .map(n => ({ ...n, wx: n.x * t.metresPerCell, wz: n.y * t.metresPerCell }));
}

/** Is this point inside a crossing's deck footprint? The same rectangle `spannedAt` tests. */
const covers = (c, x, z, pad = 0) => {
  const dx = x - c.x, dz = z - c.z;
  return Math.abs(dx * c.tx + dz * c.tz) <= c.halfLength + pad
    && Math.abs(dx * -c.tz + dz * c.tx) <= c.halfWidth + pad;
};

/**
 * The plan `js/features.js` builds for one settlement, with the same seed fold, the same high
 * streets and the same `buildable` test. Restated rather than imported because features.js needs a
 * WebGL context; `features.js has not drifted away from this file` at the bottom checks it matches.
 */
function planFor(t, node, seed) {
  const size = node.size || 1;
  const { ring } = footprintOf(size);
  const cx = node.wx, cz = node.wz;
  const culture = cultureFor({ race: node.race, biome: node.biome });
  const plan = planTown({
    seed: (seed ^ (node.id * 2654435761)) >>> 0,
    size,
    culture,
    links: ringCrossings(t.roadPaths, cx, cz, ring, { limit: 4 }).map(c => [c.dx, c.dz]),
    heightAt: (lx, lz) => t.heightAt(cx + lx, cz + lz),
    buildable: (lx, lz) => {
      const x = cx + lx, z = cz + lz;
      if (t.roadAt(x, z) > 0.45) return false;
      if (t.bridgedAt(x, z, 2)) return false;
      return !t.underwater(x, z) && t.riverAt(x, z) <= 0.3 && t.slopeAt(x, z, 6) <= 0.62;
    },
  });
  return { plan, culture, cx, cz, ring, size };
}

/** `dryFor` from js/features.js: a ring of samples at the thing's own radius, with freeboard. */
const FREEBOARD = 0.4;
function dryFor(t, x, z, radius = 0) {
  if (t.bridgedAt(x, z, radius)) return false;
  if (t.underwater(x, z)) return false;
  if (radius < 0.5) return true;
  for (let a = 0; a < 8; a++) {
    const px = x + Math.cos((a / 8) * Math.PI * 2) * radius;
    const pz = z + Math.sin((a / 8) * Math.PI * 2) * radius;
    const water = t.waterAt(px, pz);
    if (water && t.heightAt(px, pz) < water.surface + FREEBOARD) return false;
  }
  return true;
}

// ------------------------------------------------------------------ 4a. nothing is built in the water

test('a town builds nothing with part of its footprint in the water', () => {
  /**
   * Item 4a. Every water test in features.js asked about ONE point — the middle of the thing being
   * placed — so a hut whose centre cleared the river by a few centimetres went down with a third of
   * itself in it. At Feafungate (the user's own town) that was the well, the waypoint pad, a market
   * stall and a length of the town wall.
   *
   * What is checked is the property, not the four: for every plot the planner offers, either
   * `dryFor` refuses it or none of its footprint is in the water.
   */
  let towns = 0, plots = 0, refused = 0;
  for (const { seed, wr, t } of worlds) {
    for (const node of townsOf(t)) {
      const { plan, culture } = planFor(t, node, wr.world.seed ?? seed);
      towns++;
      for (const plot of plan.plots) {
        const x = node.wx + plot.cx, z = node.wz + plot.cz;
        const desc = describeBuilding({
          plot, culture, townSeed: 1, seed: 1, want: plot.want || 'house', district: plot.district,
        });
        const r = radiusOf(desc);
        plots++;
        if (!dryFor(t, x, z, r)) { refused++; continue; }
        // it was accepted, so nothing under it may be wet
        for (let a = 0; a < 8; a++) {
          const px = x + Math.cos((a / 8) * Math.PI * 2) * r;
          const pz = z + Math.sin((a / 8) * Math.PI * 2) * r;
          const water = t.waterAt(px, pz);
          const under = water ? water.surface - t.heightAt(px, pz) : -Infinity;
          assert.ok(under < FREEBOARD,
            `seed ${seed}: a ${plot.want} at ${x | 0},${z | 0} stands ${under.toFixed(2)} m into the water`);
        }
      }
    }
  }
  assert.ok(towns > 20, `only ${towns} towns planned`);
  assert.ok(plots > 200, `only ${plots} plots checked`);
  // the guard has to actually bite somewhere, or this test is proving nothing
  assert.ok(refused > 0, 'not one plot anywhere was refused for water — the test has stopped working');
});

test('the town square goes where you can stand', () => {
  /**
   * Item 4a, the other half. proctown took whichever block sat nearest the middle, and Farhold hangs
   * the well, the stalls and the civic district off it — so a settlement the world map founded in a
   * river channel put its square, and everything that rings it, in the water.
   */
  let squares = 0, wet = 0;
  for (const { wr, t, seed } of worlds) {
    for (const node of townsOf(t)) {
      const { plan, cx, cz } = planFor(t, node, wr.world.seed ?? seed);
      squares++;
      const x = cx + plan.square.cx, z = cz + plan.square.cz;
      if (t.underwater(x, z) || t.riverAt(x, z) > 0.3) wet++;
    }
  }
  assert.ok(squares > 20, `only ${squares} squares`);
  assert.equal(wet, 0, `${wet} town squares of ${squares} are in the water or on a riverbank`);
});

// ------------------------------------------------------------------ 4c. nothing stands in a bridge

test('nothing a town builds stands inside a bridge deck', () => {
  /**
   * Item 4c — *"there is a tower inside of the bridge"*. A crossing's footprint is a hole: the
   * terrain under it is left carved so the water runs through, and the deck carries you. `roadAt`
   * does NOT read 1.0 across all of it (a road bends and ends; the deck runs straight), so the
   * ground at the far end of a bridge read as perfectly good building land.
   *
   * Plots, wall segments, towers and gatehouses — everything `place()` stands on the ground.
   */
  let checked = 0;
  for (const { wr, t, seed } of worlds) {
    for (const node of townsOf(t)) {
      const { plan, cx, cz, size } = planFor(t, node, wr.world.seed ?? seed);
      const spots = plan.plots.map(p => [cx + p.cx, cz + p.cz]);
      const { wall, walled } = footprintOf(size);
      if (walled) {
        const gates = ringCrossings(t.roadPaths, cx, cz, wall).map(c => c.angle);
        const SEG = 6;
        const segments = Math.max(8, Math.round((Math.PI * 2 * wall) / SEG));
        for (let i = 0; i < segments; i++) {
          const a = ((i + 0.5) / segments) * Math.PI * 2;
          spots.push([cx + Math.cos(a) * wall, cz + Math.sin(a) * wall]);
        }
        const towers = [...gates.flatMap(g => [g - 0.26, g + 0.26]),
          ...[0, 1, 2, 3].map(i => (i / 4) * Math.PI * 2 + 0.4)].slice(0, 10);
        for (const a of [...towers, ...gates.slice(0, 4)]) {
          spots.push([cx + Math.cos(a) * wall, cz + Math.sin(a) * wall]);
        }
      }
      for (const [x, z] of spots) {
        checked++;
        // `place()` refuses anything `dryFor` refuses, and `dryFor` asks `bridgedAt` first
        if (!dryFor(t, x, z, 3)) continue;
        const clash = t.crossings.find(c => covers(c, x, z));
        assert.equal(clash, undefined,
          `seed ${seed}: something at ${x | 0},${z | 0} stands inside the bridge at ${clash?.x | 0},${clash?.z | 0}`);
      }
    }
  }
  assert.ok(checked > 400, `only ${checked} placements checked`);
});

test("a town's streets stop at a bridge instead of being draped over the hole", () => {
  // The same fault, one system along: a street lane is drawn on the ground, and the ground inside a
  // crossing's footprint is the river bed. Ten of Feafungate's lanes ran over its bridge.
  let lanes = 0, over = 0;
  for (const { wr, t, seed } of worlds) {
    for (const node of townsOf(t)) {
      const { plan, cx, cz } = planFor(t, node, wr.world.seed ?? seed);
      for (const lane of streetLanes(plan, {
        cx, cz, terrain: t,
        skip: (x, z) => t.underwater(x, z) || t.riverAt(x, z) > 0.3 || t.bridgedAt(x, z),
      })) {
        lanes++;
        for (const p of lane.points) {
          if (t.crossings.some(c => covers(c, p[0], p[1]))) { over++; break; }
        }
      }
    }
    assert.ok(seed);
  }
  assert.ok(lanes > 200, `only ${lanes} street lanes drawn`);
  assert.equal(over, 0, `${over} street lanes are still drawn over a bridge deck`);
});

// --------------------------------------------------------- 6. every crossing is a bridge, not a plug

test('a road whose carriageway is over a river gets a bridge, whatever the angle', () => {
  /**
   * Item 6. Three separate things stopped one being built, and all three are in this one number.
   *
   *   * the lift was sampled at the road's POINTS and the river passed between two of them;
   *   * the junction-levelling pass pulled a deck back down into the water afterwards;
   *   * `crossesSquarely` vetoed any road meeting the water at under 44 degrees — including one
   *     whose middle was in the middle of the channel.
   *
   * Measured on the user's own world before the fix, 24 of 59 road samples that sat over the water
   * had no bridge and a plug of earth instead.
   */
  let wet = 0, spanned = 0;
  const missed = [];
  for (const { seed, t } of worlds) {
    for (const r of t.roadPaths) {
      for (let i = 0; i + 1 < r.points.length; i++) {
        const [ax, az] = r.points[i], [bx, bz] = r.points[i + 1];
        const len = Math.hypot(bx - ax, bz - az) || 1;
        for (let d = 0; d < len; d += 4) {
          const x = ax + ((bx - ax) * d) / len, z = az + ((bz - az) * d) / len;
          const river = t.riverInfoAt(x, z);
          if (!river || river.dist > river.half) continue;       // not over the water itself
          wet++;
          // a metre of slack at the very edge of a deck: `halfWidth` is measured from the road's
          // centre line and two roads meeting inside one channel put a sample just past it
          if (t.crossings.some(c => covers(c, x, z, 1))) { spanned++; continue; }
          missed.push(`seed ${seed} road ${r.id} at ${x | 0},${z | 0}`);
        }
      }
    }
  }
  assert.ok(wet > 100, `only ${wet} road samples sit over a river across five worlds`);
  assert.ok(spanned / wet > 0.97,
    `${wet - spanned} of ${wet} road samples over a river have no bridge: ${missed.slice(0, 6).join('; ')}`);
});

test('every bridge deck is clear above the water it spans', () => {
  // The clearance `findCrossings` demands is `bridgeClearance * 0.6`; the lift builds to the full
  // `bridgeClearance`. Anything under the first is not a bridge, it is a ford.
  let checked = 0;
  for (const { seed, t } of worlds) {
    for (const c of t.crossings) {
      checked++;
      assert.ok(c.deck > c.surf + 1.4,
        `seed ${seed}: a "bridge" at ${c.x | 0},${c.z | 0} stands ${(c.deck - c.surf).toFixed(2)} m over its river`);
      // and the road that carries it agrees, at the middle where the deck height came from
      const road = t.roadSurfaceAt(c.x, c.z);
      assert.ok(road === null || road > c.surf + 1.4,
        `seed ${seed}: the road at ${c.x | 0},${c.z | 0} is ${(c.surf - road).toFixed(2)} m under its own bridge`);
    }
  }
  assert.ok(checked > 20, `only ${checked} crossings across five worlds`);
});

test('the junction levelling pass can no longer pull a deck into the river', () => {
  /**
   * The specific mechanism, checked on its own so a future change to the merge cannot bring it
   * back quietly. Every road point carries the floor it may never go under (`path.floor`), written
   * before the junction pass runs and applied after it.
   */
  let joined = 0, points = 0;
  for (const { seed, t } of worlds) {
    for (const path of t.roadPaths) {
      if (!(path.joins || []).length) continue;
      joined++;
      for (let i = 0; i < path.surface.length; i++) {
        points++;
        if (path.floor[i] === -Infinity) continue;
        assert.ok(path.surface[i] >= path.floor[i] - 1e-6,
          `seed ${seed}: road ${path.id} point ${i} sits ${(path.floor[i] - path.surface[i]).toFixed(2)} m `
          + 'under the water it was lifted clear of');
      }
    }
  }
  assert.ok(joined > 0, 'no road in five worlds was merged at a junction — the merge has stopped working');
  assert.ok(points > 100, `only ${points} points on merged roads`);
});

test('a bridge does not run on past the end of its own road', () => {
  /**
   * Item 4d — *"the bridge only connects to one side of the road (I think the road just stops)"*.
   * `back` and `fwd` measured how far the WATER reached along the crossing's tangent and nothing
   * asked whether there was any road out there, so a road ending at the settlement it serves — road
   * 58 on the user's world ends at the exact cell of a town node that sits in a river — let the deck
   * run thirty-seven metres past its last point into an empty field, with `roadAt` reading 0.00 for
   * the last nineteen of them.
   *
   * The deck may still stick out as far as the CHANNEL it has to cover (that floor is deliberate:
   * a deck that stops inside the water is worse than one that stops just past the tarmac), so what
   * is measured is the overhang beyond both of those, which has to be nothing.
   */
  let checked = 0, worst = 0, where = null;
  for (const { seed, t } of worlds) {
    for (const c of t.crossings) {
      checked++;
      for (const side of [-1, 1]) {
        // how far the carriageway runs from the middle of the bridge, this way
        let run = 0;
        for (let d = 4; d <= c.halfLength + 40; d += 2) {
          if (t.roadAt(c.x + c.tx * side * d, c.z + c.tz * side * d) <= 0.45) break;
          run = d;
        }
        const river = t.riverInfoAt(c.x, c.z);
        const floor = (river ? river.half : 4) + 4;      // the channel the deck must cover regardless
        const over = c.halfLength - Math.max(run, floor);
        if (over > worst) { worst = over; where = `seed ${seed} at ${c.x | 0},${c.z | 0}`; }
      }
    }
  }
  assert.ok(checked > 20, `only ${checked} crossings`);
  // four metres is `CROSS_STEP`: the walk that finds the end of the carriageway steps in that, so a
  // deck may finish one step past the last sample that was still on it. Thirty-seven was the bug.
  assert.ok(worst <= 6,
    `a bridge deck runs ${worst.toFixed(1)} m past the end of its own road and past the water (${where})`);
});

// ------------------------------------------------------------------ 4b. the water meets its bank

test("a river's channel has a rim, so the sheet has something to stop against", () => {
  /**
   * Item 4b — *"the water does not touch the shoreline."* The carve blended from the flat bed back
   * to the NATURAL ground at `reach`, and the natural ground carries up to 78 m of relief noise —
   * so the rim of the channel was wherever that noise left it. Measured before the fix, 28% of
   * river edges on seed 7 had no point anywhere out to `reach` that reached the water line, and the
   * sheet then ran the full width and stopped in mid-air.
   *
   * The residue is real topography — a river spilling into a basin, and a river mouth at the sea,
   * where the bank genuinely does not come back — so this asks for a large majority rather than
   * for all of them, and the skirt closes what is left the way it always has.
   */
  let edges = 0, met = 0, worst = 0;
  for (const { t } of worlds) {
    for (const river of t.riverPaths.slice(0, 40)) {
      for (let i = 0; i < river.points.length; i += 3) {
        const [x, z] = river.points[i];
        const surf = river.surface[i];
        const p = river.points[Math.max(0, i - 1)], q = river.points[Math.min(river.points.length - 1, i + 1)];
        const dx = q[0] - p[0], dz = q[1] - p[1];
        const len = Math.hypot(dx, dz) || 1;
        const nx = -dz / len, nz = dx / len;
        for (const side of [1, -1]) {
          edges++;
          let top = -Infinity;
          for (let d = river.half; d <= river.reach; d += 1.5) {
            top = Math.max(top, t.heightAt(x + nx * side * d, z + nz * side * d));
          }
          if (top >= surf) met++;
          else worst = Math.max(worst, surf - top);
        }
      }
    }
  }
  assert.ok(edges > 500, `only ${edges} river edges over five worlds`);
  assert.ok(met / edges > 0.9,
    `only ${((met / edges) * 100).toFixed(1)}% of river edges have a bank that comes back up to the water`);
  assert.ok(worst < 120, `a bank falls ${worst.toFixed(0)} m short of its river — that is not a bank at all`);
});

test("the sheet's edge lands on the waterline, not a step up the bank", () => {
  /**
   * The coarse walk in `waterRibbon` steps in half a channel width and takes the first step where
   * the bank has come back up, so on anything but a cliff the edge landed somewhere UP the bank and
   * the rim of the sheet stood proud of the shore — which is the other half of *"the water does not
   * touch the shoreline"*.
   *
   * Driven against ground whose answer is known exactly rather than against a world, because "how
   * far out is the waterline" has one right answer on a plane and no closed form on a planet: a
   * river 6 m wide at y = 5, on a bank that rises 1 in 10 from the edge of the channel. The
   * waterline is at 23 m out; the step is 3 m, so the old walk landed at 24 and the sheet's rim
   * stood 10 cm above the shore all the way along.
   */
  const SLOPE = 0.1, HALF = 3, Y = 5;
  const bank = {
    width: 8,
    // 1.0 m under the water at the channel's edge, climbing away from the line on both sides
    heightAt: (x, z) => (Math.abs(z) <= HALF ? -20 : (Y - 1) + (Math.abs(z) - HALF) * SLOPE),
  };
  const trueEdge = HALF + 1 / SLOPE;                 // where the ground first reaches y = 5
  const pts = [[0, 0], [10, 0], [20, 0], [30, 0], [40, 0]];
  const part = waterRibbon(pts, pts.map(() => Y), HALF, { terrain: bank, reach: 60, skirt: 2 });
  let worst = 0;
  for (let i = 0; i < pts.length; i++) {
    for (const side of [0, 1]) {
      const v = (i * 2 + side) * 3;
      const out = Math.abs(part.position[v + 2] - pts[i][1]);
      assert.ok(out >= trueEdge - 1e-6, `the sheet stopped ${(trueEdge - out).toFixed(2)} m short of the waterline`);
      worst = Math.max(worst, out - trueEdge);
    }
  }
  // the coarse step here is max(1.5, half * 0.5) = 1.5 m; five halvings is under 5 cm of it
  assert.ok(worst < 0.1, `the sheet's edge lands ${worst.toFixed(2)} m up the bank past the waterline`);

  // …and on the real thing, an edge that found a bank is standing on ground at the water line
  const { t } = worlds[1];
  let checked = 0, high = 0;
  for (const river of t.riverPaths.slice(0, 12)) {
    if (river.points.length < 10) continue;
    const real = waterRibbon(river.points, river.surface, river.half,
      { terrain: t, reach: river.reach, skirt: river.depth });
    for (let i = 0; i < river.points.length; i++) {
      for (const side of [0, 1]) {
        const v = (i * 2 + side) * 3;
        const ex = real.position[v], ey = real.position[v + 1], ez = real.position[v + 2];
        const out = Math.hypot(ex - river.points[i][0], ez - river.points[i][1]);
        if (out >= river.reach - 1e-6) continue;       // ran the full width: no bank was found
        checked++;
        // half a channel width used to be the error. Anything the two-bank trim pulled back in
        // reads LOW, not high, so the number that means anything is how far above the water a rim
        // can stand.
        if (t.heightAt(ex, ez) > ey + 4) high++;
      }
    }
  }
  assert.ok(checked > 100, `only ${checked} sheet edges found a bank at all`);
  assert.ok(high / checked < 0.1,
    `${((high / checked) * 100).toFixed(1)}% of sheet edges stop more than 4 m up their own bank`);
});

// ------------------------------------------------------------------ 7. nothing is dug out of a road

test('no resource seam sits on a road or on a bridge', () => {
  /**
   * Item 7 — *"try to prevent spawning Clay and other resources directly on the road."* The scatter
   * never knew where the roads were: 1.8% of the seams around the user's town were on one.
   *
   * Nine tiles a world is about 130 seams a tile, which is enough to catch a rule that only mostly
   * works.
   */
  let seams = 0, onRoad = 0;
  const shown = [];
  for (const { seed, t, wr } of worlds) {
    const ore = createNodeWorld({ data: resourceData, seed, terrain: t, planet: wr.planet, band: 'medium' });
    // somewhere with roads in it: the biggest settlement
    const towns = townsOf(t).sort((a, b) => (b.size || 1) - (a.size || 1));
    if (!towns.length) continue;
    const { wx, wz } = towns[0];
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const n of ore.around(wx + dx * ore.TILE, wz + dz * ore.TILE)) {
          seams++;
          const r = n.radius ?? 2;
          if (t.roadAt(n.x, n.z) > 0.45 || t.bridgedAt(n.x, n.z, r)) {
            onRoad++;
            if (shown.length < 5) shown.push(`seed ${seed} ${n.resource} at ${n.x | 0},${n.z | 0}`);
          }
        }
      }
    }
  }
  assert.ok(seams > 1000, `only ${seams} seams generated across five worlds`);
  assert.equal(onRoad, 0, `${onRoad} seams of ${seams} are on a road: ${shown.join('; ')}`);
});

test('keeping seams off the road does not move the ones beside it', () => {
  /**
   * Round 12's lesson, restated as a rule. A tile's rng is shared by everything generated after it,
   * so rejecting a spot inside the scatter — or breaking out of its loop — consumes a different
   * number of rng calls and every seam downstream moves. The road filter marks `gone` AFTER the
   * scatter, exactly as the underwater and cliff rejections do, so the survivors have to be in the
   * same places with the same amounts as they were without a terrain at all.
   */
  const { t, wr } = worlds[1];
  const withRoads = createNodeWorld({ data: resourceData, seed: 7, terrain: t, planet: wr.planet, band: 'medium' });
  /**
   * The same world with only the ROAD filter switched off — same biomes, same `underwater`, same
   * `riverAt`, so the scatter makes exactly the same rng calls and picks exactly the same kinds.
   * Handing `terrain: null` (or stubbing the water out) changes which kinds are on the table near
   * a river, which is a different experiment: the first attempt at this test did that and came back
   * with a seam that had turned from stone into clay, which is `waterNear` doing its job.
   */
  const unfiltered = { ...t, roadAt: () => 0, bridgedAt: () => false };
  const bare = createNodeWorld({ data: resourceData, seed: 7, terrain: unfiltered, planet: wr.planet, band: 'medium' });
  const towns = townsOf(t).sort((a, b) => (b.size || 1) - (a.size || 1));
  const { wx, wz } = towns[0] || { wx: 0, wz: 0 };
  const a = new Map(withRoads.around(wx, wz).map(n => [n.id, n]));
  const b = bare.around(wx, wz);
  assert.ok(b.length > 20, `only ${b.length} seams in the unfiltered tiles`);
  assert.ok(a.size < b.length, 'the terrain filter dropped nothing at all — check the test world');
  for (const n of b) {
    const kept = a.get(n.id);
    if (!kept) continue;                     // dropped: underwater, a cliff, or a road
    assert.equal(kept.x, n.x, `seam ${n.id} moved in x`);
    assert.equal(kept.z, n.z, `seam ${n.id} moved in z`);
    assert.equal(kept.resource, n.resource, `seam ${n.id} changed what it holds`);
    assert.equal(kept.initial, n.initial, `seam ${n.id} changed how much it holds`);
  }
});

// ------------------------------------------------------------------ the restatement stays honest

test('features.js has not drifted away from this file', () => {
  // The same guard round 16 put on the deck chain: this file restates two things features.js does,
  // and a restatement is only honest while the original still does it.
  const src = readFileSync(join(here, '../js/features.js'), 'utf8');
  assert.match(src, /const dryFor = \(x, z, radius = 0\)/,
    'features.js no longer has the footprint water test this file restates');
  assert.match(src, /terrain\.bridgedAt\?\.\(x, z, radius\)/,
    'the footprint test stopped asking whether it is standing on a bridge');
  assert.match(src, /if \(!dryFor\(x, z, foot \?\? \(BUILDING_SOLIDS\[key\]\?\.\[0\] \|\| 0\)\)\) return false;/,
    '`place()` no longer runs its placement through the footprint test');
  assert.match(src, /\|\| !!terrain\.bridgedAt\?\.\(x, z\)/,
    'the town streets no longer stop at a bridge deck');
  assert.match(src, /if \(terrain\.bridgedAt\?\.\(x, z, 2\)\) return false;/,
    'the town planner is no longer told where the bridges are');

  const planet = readFileSync(join(here, '../js/planet.js'), 'utf8');
  assert.match(planet, /bridgedAt: \(x, z, pad = 0\) => spannedAt\(x, z, pad\)/,
    'js/planet.js no longer publishes the bridge footprint');
  assert.match(planet, /path\.floor = floor;/, 'a road no longer carries the water floor it may not go under');

  const res = readFileSync(join(here, '../js/resources.js'), 'utf8');
  assert.match(res, /if \(terrain && onTheRoad\(terrain, n\)\) n\.gone = true;/,
    'the resource scatter no longer drops the seams that land on a road');
});

test('the metres-per-cell knob is left where it was found', () => {
  // A stray `setMetresPerCell` in a test file changes the size of every world built after it, in
  // every other file in the run. This one never touches it; the assertion is the reminder.
  assert.equal(M_PER_CELL, M_PER_CELL_DEFAULT);
  setMetresPerCell(M_PER_CELL_DEFAULT);
});

// ---------------------------------------------------------------------------------------------
// R17 (lead) — §5 the settlement anchor
//
// The worldgen pass stopped every individual thing a town builds from standing in water. It left
// the harder half: at Feafungate (seed 56138) the map NODE is in the middle of a river, so 41% of
// the ground inside the town ring was water and the builder was simply dropping sixteen of the
// hundred and thirty-nine things it wanted to put down — nothing looked broken, there was just a
// hole where half a town should be.
//
// The cell does not move (roads are routed to it, and four other modules derive their own metres
// from it). The ANCHOR moves, by less than a cell, which is under the precision of all of them.

import { settlementAnchor } from '../js/town-plan.js';

test('§5.1 a dry anchor is left exactly where it was', () => {
  // nothing is wet anywhere: the function must not shuffle a town that has no problem
  const dry = { underwater: () => false, riverAt: () => 0 };
  const out = settlementAnchor(dry, 1000, 2000, 68, 224);
  assert.equal(out.x, 1000);
  assert.equal(out.y, 2000);
});

test('§5.2 a river through the middle moves the town off it', () => {
  // a 60 m band of river running north-south through x = 1000
  const wet = {
    underwater: x => Math.abs(x - 1000) < 30,
    riverAt: x => (Math.abs(x - 1000) < 30 ? 1 : 0),
  };
  const out = settlementAnchor(wet, 1000, 2000, 68, 224);
  assert.ok(Math.abs(out.x - 1000) > 30, 'the anchor is out of the channel');
  assert.equal(wet.underwater(out.x), false, 'and the anchor itself is dry');
});

test('§5.3 it never moves further than one cell, whatever the cell is', () => {
  const allWet = { underwater: () => true, riverAt: () => 1 };
  for (const cell of [64, 224, 448]) {
    const out = settlementAnchor(allWet, 5000, 5000, 68, cell);
    const moved = Math.hypot(out.x - 5000, out.y - 5000);
    assert.ok(moved <= cell * 0.7 + 0.001, `moved ${moved} with a ${cell} m cell`);
  }
});

test('§5.4 nowhere dry to go means it stays put rather than picking somewhere worse', () => {
  const allWet = { underwater: () => true, riverAt: () => 1 };
  const out = settlementAnchor(allWet, 5000, 5000, 68, 224);
  // every candidate is refused for being in the water, so the original point survives
  assert.equal(out.x, 5000);
  assert.equal(out.y, 5000);
});

test('§5.5 the same world gives the same anchor every time — a town does not wander', () => {
  const wet = { underwater: x => Math.abs(x - 1000) < 30, riverAt: x => (Math.abs(x - 1000) < 30 ? 1 : 0) };
  const a = settlementAnchor(wet, 1000, 2000, 68, 224);
  const b = settlementAnchor(wet, 1000, 2000, 68, 224);
  assert.deepEqual(a, b);
});
