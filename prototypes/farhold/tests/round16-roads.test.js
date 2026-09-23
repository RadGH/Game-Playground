// node --test prototypes/farhold/tests/round16-roads.test.js
//
// Round 16 — three reports, all about a road meeting something it did not agree with.
//
//   1. "At seed 4477, Delta Thiakean II, biome Beach, x 50788, z 23588, altitude 5, heading SSW
//      there is a wall on the road with no gate, can't get through."
//   2. "In the same town at x 50850, z 23523 there is a road clipping into the water, and the water
//      level is lower on one side of the road. Since the road is near the water but doesn't need to
//      cross it, it would be better to shape alongside the river like a quay."
//   3. "For other situations where roads overlap rivers I've seen them pull the terrain up, cutting
//      off the water, is it possible to have bridges span the gap in that case rather than to raise
//      the elevation up, and ensure the player can walk across the river."
//
// Everything here drives the REAL modules. `js/planet.js`, `js/roadplan.js`, `js/water-plan.js` and
// `js/collide.js` have no Three.js in them, so node can run the same code the game runs; the only
// thing that is restated rather than imported is the couple of magic numbers `js/features.js` uses
// for a town's ring, which `footprintOf` in js/town-plan.js already owns.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, createSystem, makeTerrain, setMetresPerCell } from '../js/planet.js';
import { generatePlanetMap } from '../../../universe/js/planetmap.js';
import { ringCrossings } from '../js/roadplan.js';
import { footprintOf } from '../js/town-plan.js';
import { waterRibbon } from '../js/water-plan.js';
import { ObstacleField, CLEARANCE } from '../js/collide.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/** The settlements a town builder would lay out, in metres. */
function townsOf(t) {
  return (t.world.nodes || [])
    .filter(n => n.type === 'settlement' || n.type === 'port')
    .map(n => ({ ...n, wx: n.x * t.metresPerCell, wz: n.y * t.metresPerCell }));
}

/** Is this point inside a crossing's deck footprint? The same rectangle `spannedAt` tests. */
const covers = (c, x, z) => {
  const dx = x - c.x, dz = z - c.z;
  return Math.abs(dx * c.tx + dz * c.tz) <= c.halfLength
    && Math.abs(dx * -c.tz + dz * c.tx) <= c.halfWidth;
};

// ---------------------------------------------------------------------- 1. the gate on the road

test('every road that crosses a town wall gets a gate there, over many seeds and sizes', () => {
  // `features.js` blanks the wall for about two segments either side of each gate bearing; the
  // half-angle it uses is (SEG * 1.9) / wallR with SEG = 6. Anything inside that is a way through.
  const SEG = 6;
  let towns = 0, walled = 0, crossings = 0;
  for (const seed of [3, 7, 11, 19, 41, 4477]) {
    const wr = createWorld({ seed, width: 128, height: 64 });
    const t = makeTerrain(wr.world, wr.planet);
    for (const node of townsOf(t)) {
      towns++;
      const { ring, wall, walled: hasWall } = footprintOf(node.size || 1);
      if (!hasWall) continue;
      walled++;
      const gates = ringCrossings(t.roadPaths, node.wx, node.wz, wall);
      const half = (SEG * 1.9) / wall;
      for (const c of gates) {
        crossings++;
        // the crossing really is on the ring…
        assert.ok(Math.abs(Math.hypot(c.dx, c.dz) - wall) < 0.5,
          `a "crossing" ${Math.hypot(c.dx, c.dz).toFixed(1)} m out on a ${wall} m ring`);
        // …and the wall is open within a couple of metres of where the road arrives
        const opened = gates.some(g => {
          const diff = Math.abs(((c.angle - g.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
          return diff < half;
        });
        assert.ok(opened, `the wall is solid where road ${c.id} arrives at bearing ${(c.angle * 180 / Math.PI) | 0}`);
      }
      // the town planner asks the same question for its high streets, and must get the same answer
      const links = ringCrossings(t.roadPaths, node.wx, node.wz, ring, { limit: 4 });
      assert.ok(links.length <= 4);
      for (const l of links) assert.ok(Math.abs(Math.hypot(l.dx, l.dz) - ring) < 0.5);
    }
  }
  assert.ok(towns > 20, `only ${towns} towns checked`);
  assert.ok(walled > 0, 'none of the test worlds had a walled city');
  assert.ok(crossings > 0, 'no road reached any walled city, which cannot be right');
});

test('the old annulus scan is what missed the gate at Pewargate, and the walk finds it', () => {
  // The user's own world, reproduced exactly: the default planet-size knob is 0.35, the seed search
  // steps 4477 -> 4480, and Delta Thiakean II is the second planet of that system.
  setMetresPerCell(640 * 0.35);
  try {
    const { system } = createSystem({ seed: 4480 });
    const planet = system.planets.find(p => p.name === 'Delta Thiakean II');
    assert.ok(planet, 'seed 4480 no longer has a Delta Thiakean II');
    const world = generatePlanetMap(planet, { width: 256, height: 128, regionScale: 1 });
    const t = makeTerrain(world, planet);
    const node = townsOf(t).find(n => Math.hypot(n.wx - 50788, n.wz - 23588) < 200);
    assert.ok(node, 'the town the user was standing outside is gone');
    const { wall } = footprintOf(node.size || 1);

    // what the wall used to ask: every road SAMPLE POINT within SEG * 1.6 of the ring
    const scan = [];
    for (const r of t.roadPaths) for (const [x, z] of r.points || []) {
      if (Math.abs(Math.hypot(x - node.wx, z - node.wz) - wall) <= 6 * 1.6) scan.push([x, z]);
    }
    assert.equal(scan.length, 0,
      'the sample scan now finds something — this test no longer demonstrates the bug');

    // what it asks now
    const gates = ringCrossings(t.roadPaths, node.wx, node.wz, wall);
    assert.ok(gates.length >= 2, `only ${gates.length} crossings found at Pewargate`);
    // the user was at bearing 131 degrees from the middle of town, in front of solid masonry
    const reported = Math.atan2(23588 - node.wz, 50788 - node.wx);
    const near = gates.some(g => {
      const diff = Math.abs(((g.angle - reported + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      return diff < (6 * 1.9) / wall;
    });
    assert.ok(near, 'there is still no gate where the user walked into the wall');
  } finally {
    setMetresPerCell(640);
  }
});

// ------------------------------------------------------- 2 and 3. the dam, the bridge and the quay

test('a road crossing a river does not raise the terrain in the channel', () => {
  let checked = 0;
  for (const seed of [1, 7, 11, 1337]) {
    const wr = createWorld({ seed, width: 128, height: 64 });
    const t = makeTerrain(wr.world, wr.planet);
    for (const c of t.crossings) {
      checked++;
      // Walk ACROSS the road, along the river, through the middle of the crossing. The ground under
      // the deck has to stay below the water line the whole way — that is the water running under
      // the bridge instead of into an earth plug.
      const ax = -c.tz, az = c.tx;              // across the road is along the river
      // stop half a metre inside the footprint: the last sample sits exactly on the boundary the
      // deck clamp fades out at, and a boundary is not the middle of a channel
      const inner = c.halfWidth - 0.5;
      for (let d = -inner; d <= inner; d += 1) {
        const x = c.x + ax * d, z = c.z + az * d;
        const h = t.heightAt(x, z);
        /**
         * ROUND 17 — AGAINST THE RIVER'S SURFACE HERE, NOT THE ONE RECORDED AT THE MIDDLE.
         *
         * `c.surf` is the water at the crossing's own centre, and a river falls. That did not matter
         * while a footprint was six metres either side of the road; it does now that two roads over
         * one river merge into one wider bridge (11.2 m either side on seed 7), because the walk
         * then reaches ground whose own stretch of river is a fifth of a metre higher than the
         * middle's. The ground there was 0.10 m UNDER its own water and 0.23 m over the number this
         * line used to compare against.
         *
         * What the test is for is unchanged: no earth plug anywhere under a bridge.
         */
        const here = t.riverInfoAt(x, z);
        /**
         * …AND ONLY WHERE THERE IS A CHANNEL TO PLUG.
         *
         * Two roads over one river merge into one wider bridge, and round 17 widened the window
         * that decides when (two decks eleven metres apart used to come out as two bridges with a
         * 17 cm step between them). A merged footprint is 22 m across where the river is 12, so the
         * walk now runs out onto the BANK — and a bank is meant to be above the water. The plug
         * this test exists to catch is in the channel; the sibling test below walks the same line
         * and requires it to be wet from end to end, which is the other half of the same fact.
         */
        if (!here || here.dist > here.half + 2) continue;
        const line = Math.max(c.surf, here.surface);
        assert.ok(h < line + 0.01,
          `seed ${seed}: the ground stands ${(h - line).toFixed(2)} m above the river INSIDE the crossing`);
      }
      // …and the river is still a river there: the game agrees there is water under the deck
      const water = t.waterAt(c.x, c.z);
      assert.ok(water && water.depth > 0.2, `seed ${seed}: no water left under a bridge`);
      // the deck itself is clear above it
      assert.ok(c.deck > c.surf + 1, `seed ${seed}: a "bridge" deck only ${(c.deck - c.surf).toFixed(2)} m over the water`);
      assert.ok(c.halfLength > c.halfWidth, 'a bridge that is wider than it is long');
    }
  }
  assert.ok(checked > 10, `only ${checked} crossings checked across four worlds`);
});

test('the channel under a crossing is continuous, from bank to bank', () => {
  // Report 3's second half: "ensure the player can walk across the river" only matters if the river
  // is still there. Walk the whole wetted width along the river line through the crossing and check
  // nothing dry has appeared in the middle of it.
  const wr = createWorld({ seed: 7, width: 128, height: 64 });
  const t = makeTerrain(wr.world, wr.planet);
  let tested = 0;
  for (const c of t.crossings.slice(0, 20)) {
    const ax = -c.tz, az = c.tx;
    const inner = c.halfWidth - 0.5;
    let wet = 0, dry = 0;
    for (let d = -inner; d <= inner; d += 0.5) {
      const w = t.waterAt(c.x + ax * d, c.z + az * d);
      if (w) wet++; else dry++;
    }
    if (wet + dry < 4) continue;
    tested++;
    assert.equal(dry, 0, `a dry step in the middle of the channel at ${c.x | 0},${c.z | 0}`);
  }
  assert.ok(tested > 3, `only ${tested} crossings had a channel to walk`);
});

test('the bridge deck carries the player where the ground no longer does', () => {
  // The collider `js/features.js` files for each crossing, checked against the one thing that
  // matters: standing on the middle of the bridge, `standAt` hands back the deck.
  const wr = createWorld({ seed: 7, width: 128, height: 64 });
  const t = makeTerrain(wr.world, wr.planet);
  const field = new ObstacleField();
  field.setGround((x, z) => t.heightAt(x, z));
  for (const c of t.crossings) field.addDeck(c.x, c.z, c.angle, c.halfLength, c.halfWidth, c.deck + 0.26);
  assert.ok(t.crossings.length > 0, 'this world has no crossing to test');

  for (const c of t.crossings.slice(0, 20)) {
    const feet = c.deck + 0.26;
    const top = field.standAt(c.x, c.z, feet, 0.4);
    assert.ok(top !== null, `nothing to stand on in the middle of the bridge at ${c.x | 0},${c.z | 0}`);
    /**
     * ROUND 17 — WITHIN A STEP OF THE DECK FILED HERE, NOT EXACTLY IT.
     *
     * A road crossing a river at forty degrees gets a bridge now (it used to be waved through as a
     * quay and dammed instead), so a merged pair of roads twelve metres apart can put TWO bridges
     * over one river. Their decks are graded independently and come out a few centimetres apart,
     * and `standAt` hands back the higher of the two — which is the right answer for a player and
     * not the one this line asked for. The thing that matters is that you are standing on a bridge
     * at this bridge's height, and `CLEARANCE` is the project's own word for "near enough to stand
     * on".
     */
    assert.ok(top >= c.deck + 0.26 - 0.01 && top - (c.deck + 0.26) <= CLEARANCE,
      `the deck is ${(top - (c.deck + 0.26)).toFixed(2)} m from where it was filed`);
    // the ground under it really has gone away, or this proves nothing
    assert.ok(t.heightAt(c.x, c.z) < c.deck - 1, 'the terrain is still holding the road up here');
    // a deck is walked ON, not into: it must never push you sideways, or the road would be a wall
    const [rx, rz] = field.resolve(c.x, c.z, 0.4);
    assert.ok(Math.hypot(rx - c.x, rz - c.z) < 1e-9, 'the bridge deck pushed the player out of itself');
    // and it stops at its own edge, rather than being an invisible floor over the whole river
    const ax = -c.tz, az = c.tx;
    const px = c.x + ax * (c.halfWidth + 3), pz = c.z + az * (c.halfWidth + 3);
    /**
     * R21 — …unless the ground three metres to the side is ANOTHER BRIDGE.
     *
     * The same round-17 note above applies to this line and was only ever applied to the one before
     * it: a river can carry two crossings a dozen metres apart, and then a point just off the edge
     * of one is genuinely standing on the other. Round 21's cliffs changed where seed 7's roads run
     * and produced exactly that pair — two decks 13.9 m apart, half-width 5.75 each, so the probe
     * at +8.75 m lands inside the neighbour.
     *
     * Asserting "nothing here" was always asserting something stronger than the game needs. What
     * matters is that THIS deck stops at its own edge, so the probe is skipped where a different
     * crossing legitimately covers it.
     */
    const covered = t.crossings.some(o => {
      if (o === c) return false;
      const dx = px - o.x, dz = pz - o.z;
      return Math.abs(dx * o.tx + dz * o.tz) <= o.halfLength
        && Math.abs(dx * -o.tz + dz * o.tx) <= o.halfWidth;
    });
    if (!covered) {
      const off = field.standAt(px, pz, feet, 0.4);
      assert.equal(off, null, 'the deck carries on past the side of the bridge');
    }
  }
});

test('a deck does not become solid, and a plain obstacle still behaves', () => {
  const field = new ObstacleField();
  field.setGround(() => 0);
  field.addDeck(0, 0, 0, 20, 3, 5);               // along +Z, 40 long, 6 wide, top at 5 m
  field.add(30, 0, 2, 4);                          // an ordinary lump beside it
  assert.equal(field.blocked(0, 0), false, 'a deck reads as solid ground');
  assert.equal(field.blocked(30, 0), true, 'an ordinary obstacle stopped being solid');
  assert.equal(field.standAt(0, 0, 5, 0.4), 5, 'the deck is not standable from on top of it');
  assert.equal(field.standAt(0, 0, 1, 0.4), null, 'you can stand on a deck from underneath it');
  assert.equal(field.standAt(0, 25, 5, 0.4), null, 'the deck runs past its own end');
  assert.equal(field.standAt(8, 0, 5, 0.4), null, 'the deck runs past its own side');
  // rotated a quarter turn, the long axis swaps
  const turned = new ObstacleField();
  turned.addDeck(0, 0, Math.PI / 2, 20, 3, 5);
  assert.equal(turned.standAt(15, 0, 5, 0.4), 5, 'a turned deck did not turn');
  assert.equal(turned.standAt(0, 15, 5, 0.4), null, 'a turned deck is still lying the old way');
});

test('a quay, not a slumped bank: the road beside a river has a defined edge', () => {
  // Report 2. Two things are being checked, and the second one is the interesting one.
  //
  //   1. A road is never in the water it runs beside. That is the user's "clipping into the water",
  //      and it has to survive the bridge change: opening the channel under a crossing must not
  //      also drop the carriageway into a river somewhere else.
  //   2. The quay actually shapes the bank. `quayRise` is the module's own knob, so the test builds
  //      the SAME world twice — once with the quay and once with it switched off — and asserts the
  //      bank comes out drier and less sunk with it. A shaping pass that cannot be measured against
  //      its own absence is decoration, and this project has enough of those already.
  const measure = (opts) => {
    let onRoad = 0, submerged = 0, worstRoad = 0, bank = 0, dry = 0, worstSink = 0;
    for (const seed of [1, 7, 11, 19, 1337]) {
      const wr = createWorld({ seed, width: 128, height: 64 });
      const t = makeTerrain(wr.world, wr.planet, opts);
      for (const road of t.roadPaths) {
        for (let i = 1; i + 1 < road.points.length; i++) {
          const [ax, az] = road.points[i], [bx, bz] = road.points[i + 1];
          const len = Math.hypot(bx - ax, bz - az) || 1;
          const tx = (bx - ax) / len, tz = (bz - az) / len, nx = -tz, nz = tx;
          for (let step = 0; step < len; step += 6) {
            const u = step / len;
            const cx0 = ax + tx * step, cz0 = az + tz * step;
            const deck = road.surface[i] + (road.surface[i + 1] - road.surface[i]) * u;
            for (const side of [1, -1]) {
              for (let off = 0; off <= road.half + 3; off += 1) {
                const x = cx0 + nx * side * off, z = cz0 + nz * side * off;
                const river = t.riverInfoAt(x, z);
                if (!river) continue;
                if (!(deck > river.surface + 0.5)) continue;          // a ford, not a road above water
                if (t.crossings.some(c => covers(c, x, z))) continue; // under a bridge, not on a bank
                const ground = t.heightAt(x, z);
                if (off <= road.half) {
                  onRoad++;
                  if (ground < river.surface - 0.01) {
                    submerged++;
                    worstRoad = Math.max(worstRoad, river.surface - ground);
                  }
                }
                // the bank beside a road that runs ALONGSIDE the river — the quay's own case
                const dot = Math.abs(tx * river.dir[0] + tz * river.dir[1]);
                if (dot >= 0.72 && river.dist >= river.half) {
                  bank++;
                  if (ground >= river.surface) dry++;
                  else worstSink = Math.max(worstSink, river.surface - ground);
                }
              }
            }
          }
        }
      }
    }
    return { onRoad, submerged, worstRoad, bank, dry, worstSink };
  };

  const withQuay = measure(undefined);
  // `quayRise` is how far above the water the lip stands; a big negative puts the lip below the
  // river bed, so `Math.max` keeps the carved ground and the quay is off.
  const without = measure({ quayRise: -999 });

  assert.ok(withQuay.onRoad > 300, `only ${withQuay.onRoad} carriageway samples beside a river`);
  assert.equal(withQuay.submerged, 0,
    `${withQuay.submerged} carriageway samples sat under the river beside them (worst ${withQuay.worstRoad.toFixed(2)} m)`);
  assert.ok(withQuay.bank > 100, `only ${withQuay.bank} riverbank samples beside a road running alongside`);
  assert.ok(withQuay.dry >= without.dry,
    `the quay left ${without.dry - withQuay.dry} more bank samples under water than no quay at all`);
  assert.ok(withQuay.worstSink < without.worstSink - 0.5,
    `the deepest sunk bank beside a road is ${withQuay.worstSink.toFixed(2)} m with the quay and ${without.worstSink.toFixed(2)} m without it — the quay is not shaping anything`);
});

test('you can walk a road across a bridge without climbing anything', () => {
  // The whole point of report 3's second half. `js/features.js` needs Three.js, so the deck chain
  // it files is restated here — and the test below this one checks the file still builds it this
  // way, so the restatement cannot quietly drift out of date.
  const chainFor = (t) => {
    const field = new ObstacleField();
    field.setGround((x, z) => t.heightAt(x, z));
    for (const c of t.crossings) {
      const STEP = 4, n = Math.max(1, Math.ceil(c.halfLength / STEP));
      for (let i = -n; i < n; i++) {
        const d = ((i + 0.5) / n) * c.halfLength;
        const sx = c.x + c.tx * d, sz = c.z + c.tz * d;
        field.addDeck(sx, sz, c.angle, c.halfLength / n + 0.2, c.halfWidth,
          (t.roadSurfaceAt(sx, sz) ?? c.deck) + 0.225 * 1.15);
      }
    }
    return field;
  };

  let walked = 0, worstStep = 0, swims = 0;
  for (const seed of [1, 7, 11, 1337]) {
    const wr = createWorld({ seed, width: 128, height: 64 });
    const t = makeTerrain(wr.world, wr.planet);
    const field = chainFor(t);
    for (const c of t.crossings.slice(0, 12)) {
      const road = t.roadPaths.find(r => String(r.id) === String(c.road));
      if (!road) continue;
      // the road's own line, resampled every two metres, for the stretch around the crossing
      const line = [];
      for (let i = 0; i + 1 < road.points.length; i++) {
        const [ax, az] = road.points[i], [bx, bz] = road.points[i + 1];
        const len = Math.hypot(bx - ax, bz - az) || 1;
        for (let d = 0; d < len; d += 2) line.push([ax + (bx - ax) * d / len, az + (bz - az) * d / len]);
      }
      const near = line.filter(p => Math.hypot(p[0] - c.x, p[1] - c.z) < c.halfLength + 14);
      if (near.length < 8) continue;
      // start on the dry end and walk in, which is the only way a player ever arrives
      const first = near[0], last = near[near.length - 1];
      const order = t.heightAt(first[0], first[1]) >= t.heightAt(last[0], last[1]) ? near : near.slice().reverse();
      walked++;
      let feet = t.heightAt(order[0][0], order[0][1]);
      for (const [x, z] of order) {
        const bare = t.heightAt(x, z);
        const roof = field.standAt(x, z, feet, 0.4);
        const ground = roof !== null && roof > bare ? roof : bare;
        worstStep = Math.max(worstStep, ground - feet);
        const water = t.waterAt(x, z);
        // 1.3 m is `swimDepth` in js/player.js — deeper than that and the character is swimming
        if (water && water.depth > 1.3 && ground < water.surface) swims++;
        feet = ground;
      }
    }
  }
  assert.ok(walked > 15, `only ${walked} crossings were walked`);
  assert.ok(worstStep <= CLEARANCE + 1e-6,
    `crossing a bridge asks the player to climb ${worstStep.toFixed(2)} m in one step (CLEARANCE is ${CLEARANCE})`);
  assert.equal(swims, 0, `${swims} steps where walking the road drops the player into the river`);
});

test('features.js still files a chain of decks, not one flat plank', () => {
  // The restatement above is only honest while this holds. A single `addDeck` over the whole span
  // is the version that left a 1.95 m ledge where the plank met the ramping road.
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../js/features.js'), 'utf8');
  assert.match(src, /solids\.addDeck\(/, 'features.js no longer files a deck collider for a bridge');
  assert.match(src, /terrain\.roadSurfaceAt\(sx, sz\)/,
    'the deck chain no longer takes its height from the road it sits on');
  assert.match(src, /const n = Math\.max\(1, Math\.ceil\(halfLength \/ STEP\)\)/,
    'the bridge collider went back to being one rectangle over the whole span');
});

// ------------------------------------------------------------------ 4. the sheet's two banks agree

test("a river sheet's two banks agree in width", () => {
  const wr = createWorld({ seed: 7, width: 128, height: 64 });
  const t = makeTerrain(wr.world, wr.planet);
  let widest = 0, checked = 0;
  for (const river of t.riverPaths.slice(0, 12)) {
    if (river.points.length < 10) continue;
    const part = waterRibbon(river.points, river.surface, river.half,
      { terrain: t, reach: river.reach, skirt: river.depth });
    const tol = Math.max(river.half, 4);
    for (let i = 0; i < river.points.length; i++) {
      const l = part.position.slice(i * 6, i * 6 + 3);
      const r = part.position.slice(i * 6 + 3, i * 6 + 6);
      const left = Math.hypot(l[0] - river.points[i][0], l[2] - river.points[i][1]);
      const right = Math.hypot(r[0] - river.points[i][0], r[2] - river.points[i][1]);
      widest = Math.max(widest, Math.abs(left - right) - tol);
      assert.ok(Math.abs(left - right) <= tol + 1e-6,
        `one bank runs ${left.toFixed(1)} m out and the other ${right.toFixed(1)} m, on a ${(river.half * 2).toFixed(1)} m river`);
      assert.ok(left >= river.half - 1e-6 && right >= river.half - 1e-6, 'the sheet narrowed inside the channel');
      assert.equal(l[1], r[1], 'the two banks are at different water levels');
      checked++;
    }
  }
  assert.ok(checked > 200, `only ${checked} river cross-sections checked`);
  assert.ok(widest <= 1e-6, 'a bank got past the tolerance');
});

test('an embankment on one side cannot pull the sheet off-centre', () => {
  // A flat world with a wall down one side of the river: exactly what a road embankment is, and
  // what made the user see "the water level is lower on one side of the road".
  const pts = [[0, 0], [10, 0], [20, 0], [30, 0], [40, 0]];
  const heights = pts.map(() => 5);
  const banked = {
    // dead flat and under water everywhere, except a wall 6 m to one side
    heightAt: (x, z) => (z <= -6 ? 9 : 0),
    width: 8,
  };
  const part = waterRibbon(pts, heights, 3, { terrain: banked, reach: 40, skirt: 2 });
  for (let i = 0; i < pts.length; i++) {
    const l = part.position.slice(i * 6, i * 6 + 3);
    const r = part.position.slice(i * 6 + 3, i * 6 + 6);
    const left = Math.abs(l[2] - pts[i][1]), right = Math.abs(r[2] - pts[i][1]);
    assert.ok(Math.abs(left - right) <= 4 + 1e-6,
      `the wall pulled the sheet to ${left.toFixed(1)} m one side and ${right.toFixed(1)} m the other`);
  }
});
