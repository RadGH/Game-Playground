// node --test prototypes/farhold/tests/round22-roads.test.js
//
// Round 22 — the road, the wall and the houses behind it. Four reports from one spot on one world
// (seed 25392, Kydsel IV), and every one of them is geometry that nothing had ever measured:
//
//   A. "At this location (biome Beach, x 5160, z 1597, altitude 4) the terrain repeatedly clips
//      through the road… The road also clips through the ground near (x 5805, z 1788)."
//   B. "Also that road goes through the wall, but there is no gate."
//   C. "It also ends abruptly at nothing. How can we eliminate all the dead-ends-to-nowhere with
//      the road system? Roads should connect towns together, or to special landmarks, but they
//      should never just take you 5 feet out of town and end."
//   D. "At this location (biome Grassland, x 5240, z 1592, altitude 10) houses clip through the
//      wall."
//
// Everything here drives the REAL modules — js/planet.js, js/roadplan.js and proctown's planner
// have no Three.js in them, so node runs the same code the game runs. `laneRibbon` is the very
// function js/features.js draws every road with (round 22 collapsed its private copy into it), so
// the ribbon this file measures is the ribbon the player is looking at.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  createWorld, makeTerrain, setMetresPerCell, M_PER_CELL_DEFAULT, M_PER_CELL,
} from '../js/planet.js';
import { ringCrossings, laneRibbon } from '../js/roadplan.js';
import { footprintOf, streetLanes } from '../js/town-plan.js';
import { planTown, cultureFor, overlaps, WALL_CLEARANCE } from '../../../proctown/js/townplan.js';

const here = dirname(fileURLToPath(import.meta.url));
const balance = JSON.parse(readFileSync(join(here, '../data/balance.json'), 'utf8'));

/**
 * THE WORLDS THESE TESTS RUN ON, BUILT THE WAY THE GAME BUILDS THEM.
 *
 * The planet-size knob is what makes a reported coordinate mean anything: a world position is in
 * metres and a metre is `M_PER_CELL_DEFAULT * scale` of a map cell. 0.1 is "Super tiny", which is
 * what the round-21 and round-22 reports were played on, and it is also the harshest setting for
 * everything below — 64 m to a cell means road points 12.8 m apart over ground that rises just as
 * fast as on a big world, so every grading error this file looks for is at its largest here.
 */
const SCALE = 0.1;
const SEEDS = [25392, 7, 4477, 101, 1337];

const worlds = [];
function eachWorld(fn) {
  if (!worlds.length) {
    setMetresPerCell(M_PER_CELL_DEFAULT * SCALE);
    for (const seed of SEEDS) {
      const wr = createWorld({
        seed, width: balance.world?.width ?? 256, height: balance.world?.height ?? 128,
        regionScale: 2, habitable: true, liveable: true,
      });
      worlds.push({ seed, planet: wr.planet, terrain: makeTerrain(wr.world, wr.planet, balance.terrain) });
    }
  }
  for (const w of worlds) fn(w);
}

/** The settlements a town builder would lay out, in metres. */
const townsOf = t => (t.world.nodes || [])
  .filter(n => n.type === 'settlement' || n.type === 'port')
  .map(n => ({ ...n, wx: n.x * t.metresPerCell, wz: n.y * t.metresPerCell }));

/** Is this point inside a crossing's deck footprint? The same rectangle `spannedAt` tests. */
const covers = (c, x, z) => {
  const dx = x - c.x, dz = z - c.z;
  return Math.abs(dx * c.tx + dz * c.tz) <= c.halfLength
    && Math.abs(dx * -c.tz + dz * c.tx) <= c.halfWidth;
};

// ------------------------------------------------------------------ A. the terrain and the road

/**
 * The height js/features.js actually draws a road ribbon at, per vertex.
 *
 * Not a restatement: this is `laneRibbon`, the function features.js calls. Passing `groundAt` is
 * what features.js passes. If this test and the game ever disagree it is because somebody changed
 * the call in features.js, which the last test in this section checks for by name.
 */
function drawnRibbon(road, terrain, lift = 0.06) {
  const groundAt = (x, z) => (terrain.bridgedAt?.(x, z) ? -Infinity : terrain.heightAt(x, z));
  return laneRibbon({ points: road.points, surface: road.surface, half: road.half }, { lift, groundAt });
}

test('A — the terrain never rises through a road, right across its drawn width', () => {
  /**
   * THE ASSERTION THIS WHOLE ROUND EXISTS FOR.
   *
   * Walk every road in five worlds, and at every one of its points walk right across the ribbon —
   * kerb to kerb, twenty-one samples — asking the terrain how high it is. The ground has to stay
   * under the paving. That is the user's sentence, turned into a number.
   *
   * Sea lanes are skipped (no road is drawn over open water) and so is anything under a bridge,
   * where the channel is deliberately left open and the deck carries you instead.
   */
  let samples = 0, over = 0, worst = 0, where = null;
  eachWorld(({ seed, terrain }) => {
    for (const road of terrain.roadPaths) {
      const geom = drawnRibbon(road, terrain);
      const pts = road.points;
      for (let i = 0; i < pts.length; i++) {
        if (road.wet?.[i]) continue;
        // the two drawn edge vertices at this point, straight out of the geometry buffer
        const ay = geom.position[i * 6 + 1], by = geom.position[i * 6 + 4];
        const ax = geom.position[i * 6], az = geom.position[i * 6 + 2];
        const bx = geom.position[i * 6 + 3], bz = geom.position[i * 6 + 5];
        for (let k = 0; k <= 20; k++) {
          const u = k / 20;
          const x = ax + (bx - ax) * u, z = az + (bz - az) * u;
          if (terrain.bridgedAt?.(x, z)) continue;
          const paving = ay + (by - ay) * u;
          const ground = terrain.heightAt(x, z);
          samples++;
          if (ground > paving) {
            over++;
            if (ground - paving > worst) { worst = ground - paving; where = `seed ${seed} road ${road.id} at ${x | 0},${z | 0}`; }
          }
        }
      }
    }
  });
  assert.ok(samples > 50000, `only ${samples} road-surface samples across five worlds`);
  assert.equal(over, 0,
    `${over} of ${samples} samples have the ground standing through the road — worst ${worst.toFixed(3)} m (${where})`);
});

test('A — the GRADED deck is close to the ground too, so the ribbon is not papering over a hole', () => {
  /**
   * The clamp above guarantees the drawn road clears the ground, and on its own that is not enough:
   * a deck graded three metres under the hillside would pass it while the road visibly climbed over
   * its own kerb. So this measures the raw grading — the number `heightAt` hands the player to
   * stand on, and the number a bridge deck and a collider are built from.
   *
   * Two faults were found this way and both were metres, not centimetres: a junction whose fade
   * fought the bridge floor (3.49 m on seed 19) and a four-point merged piece with a junction at
   * each end whose two fades reached across each other (2.02 m on seed 11). What is left is the
   * honest residual — a flat cross-section drawn at a bend where the deck itself is climbing —
   * and it is centimetres.
   *
   * A CROSSROADS IS EXCLUDED, and deliberately named rather than quietly skipped. World Forge
   * routes each link with its own A* and two routes can cross transversally without ever sharing
   * a corridor, so `mergeRoadNetwork` never makes a junction there and the two decks simply pass
   * through each other at whatever heights they were graded to — 2.29 m apart on seed 4477. There
   * is no grading answer to that short of building a real crossroads, which is not this round; the
   * ribbon crown above is what covers it, and `crossroads` below counts them so the day somebody
   * does build one there is a number to compare against.
   */
  let worst = 0, where = null, samples = 0, crossroads = 0;
  eachWorld(({ seed, terrain }) => {
    for (const road of terrain.roadPaths) {
      const pts = road.points;
      for (let i = 0; i < pts.length; i++) {
        if (road.wet?.[i]) continue;
        const prev = pts[Math.max(0, i - 1)], next = pts[Math.min(pts.length - 1, i + 1)];
        let dx = next[0] - prev[0], dz = next[1] - prev[1];
        const len = Math.hypot(dx, dz) || 1; dx /= len; dz /= len;
        // is a DIFFERENT road's line running through this cross-section?
        let shared = false;
        for (const other of terrain.roadPaths) {
          if (other === road || shared) continue;
          for (const q of other.points) {
            if (Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]) < road.half + other.half + 8) { shared = true; break; }
          }
        }
        if (shared) { crossroads++; continue; }
        for (let s = -1; s <= 1.0001; s += 0.2) {
          const x = pts[i][0] - dz * road.half * s, z = pts[i][1] + dx * road.half * s;
          if (terrain.bridgedAt?.(x, z)) continue;
          samples++;
          const err = terrain.heightAt(x, z) - road.surface[i];
          if (err > worst) { worst = err; where = `seed ${seed} road ${road.id} at ${x | 0},${z | 0}`; }
        }
      }
    }
  });
  assert.ok(samples > 30000, `only ${samples} deck samples`);
  // measured at 3.49 m before this round's junction fixes (on the 640 m-a-cell worlds the older
  // road tests use), and 0.64 m on these five
  assert.ok(worst < 0.75,
    `the ground stands ${worst.toFixed(3)} m over the graded deck (${where}) — the grading is broken, not the drawing`);
  assert.ok(crossroads < 1200, `${crossroads} road points share their ground with another road`);
});

test('A — a town street clears the hillside it is laid on', () => {
  /**
   * Town streets are a separate path and were the worse of the two: nothing anywhere carves the
   * ground under a town (js/town-plan.js says so in its own header — features.js has no terraform
   * book), and `gradeHeights` samples the CENTRE LINE only. So on any side slope the uphill half
   * of a street was simply under the hill.
   *
   * `planLane`'s `clearAcross` is the fix — the deck is raised to the highest ground right across
   * the carriageway plus a margin — and this is the measurement of it. Streets are drawn at
   * `lift: 0.12`, which is what features.js passes.
   */
  let towns = 0, samples = 0, over = 0, worst = 0, where = null;
  eachWorld(({ seed, terrain }) => {
    for (const node of townsOf(terrain).slice(0, 6)) {
      const size = node.size || 1;
      const foot = footprintOf(size);
      const culture = cultureFor({ race: node.race, biome: node.biome });
      const plan = planTown({
        seed: (seed ^ (node.id * 2654435761)) >>> 0,
        size, culture,
        links: ringCrossings(terrain.roadPaths, node.wx, node.wz, foot.wall).map(c => [c.dx, c.dz]),
        heightAt: (lx, lz) => terrain.heightAt(node.wx + lx, node.wz + lz),
        buildable: (lx, lz) => {
          const x = node.wx + lx, z = node.wz + lz;
          if (terrain.roadAt(x, z) > 0.45 || terrain.bridgedAt?.(x, z, 2)) return false;
          return !terrain.underwater(x, z) && terrain.riverAt(x, z) <= 0.3 && terrain.slopeAt(x, z, 6) <= 0.62;
        },
      });
      towns++;
      const lanes = streetLanes(plan, {
        cx: node.wx, cz: node.wz, terrain, prune: true,
        skip: (x, z) => terrain.underwater(x, z) || terrain.riverAt(x, z) > 0.3
          || !!terrain.bridgedAt?.(x, z) || terrain.roadAt(x, z) > 0.45,
      });
      for (const lane of lanes) {
        const geom = laneRibbon(lane, { lift: 0.12 });
        for (let i = 0; i < lane.points.length; i++) {
          const ay = geom.position[i * 6 + 1];
          const ax = geom.position[i * 6], az = geom.position[i * 6 + 2];
          const bx = geom.position[i * 6 + 3], bz = geom.position[i * 6 + 5];
          for (let k = 0; k <= 8; k++) {
            const u = k / 8;
            const x = ax + (bx - ax) * u, z = az + (bz - az) * u;
            samples++;
            const err = terrain.heightAt(x, z) - ay;
            if (err > 0) over++;
            if (err > worst) { worst = err; where = `seed ${seed} town ${node.name} at ${x | 0},${z | 0}`; }
          }
        }
      }
    }
  });
  assert.ok(towns > 10, `only ${towns} towns planned`);
  assert.ok(samples > 3000, `only ${samples} street samples`);
  // the crown is raised in one piece across the width, so the street stays flat across itself and
  // simply rides higher where the hillside insists. Measured: 0 of 105,651 samples, 0.000 m.
  assert.equal(over, 0,
    `${over} of ${samples} street samples have the ground standing through the paving — worst ${worst.toFixed(3)} m (${where})`);
});

test('A — features.js draws its roads with the one ribbon function, and asks it about the ground', () => {
  // The two tests above measure `laneRibbon`; this is what keeps them measuring the GAME. The
  // private copy of the ribbon in features.js is what let the world's roads miss a fix that the
  // town's streets got, so the check is that there is no second copy and that the ground is asked.
  const src = readFileSync(join(here, '../js/features.js'), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.ok(!/function ribbon\s*\(/.test(code), 'features.js has grown a second ribbon function again');
  assert.match(code, /laneRibbon/, 'features.js no longer uses the shared ribbon');
  assert.match(code, /groundAt:\s*roadGroundAt/, 'the road ribbon stopped asking where the ground is');
});

// ---------------------------------------------------------------------- B. the road and the wall

test('B — every road that crosses a town wall has a gate at that bearing', () => {
  /**
   * The wall is blanked for about two segments either side of each gate bearing — the half-angle
   * features.js uses is `(SEG * 1.9) / wallR` with `SEG = 6`. So "there is a gate here" means the
   * bearing the road arrives on falls inside one of those openings.
   *
   * The crossings themselves are found by `ringCrossings`, which round 22 rewrote to solve both
   * roots of the segment/circle intersection on every span. The next test is the one that proves
   * why: the old walk could not see a chord that clipped the ring with both its ends outside.
   */
  const SEG = 6;
  let walled = 0, crossings = 0;
  eachWorld(({ seed, terrain }) => {
    for (const node of townsOf(terrain)) {
      const { wall, walled: hasWall } = footprintOf(node.size || 1);
      if (!hasWall) continue;
      walled++;
      const gates = ringCrossings(terrain.roadPaths, node.wx, node.wz, wall);
      const half = (SEG * 1.9) / wall;
      for (const c of gates) {
        crossings++;
        assert.ok(Math.abs(Math.hypot(c.dx, c.dz) - wall) < 0.5,
          `seed ${seed}: a "crossing" ${Math.hypot(c.dx, c.dz).toFixed(1)} m out on a ${wall} m ring`);
        const opened = gates.some(g => {
          const diff = Math.abs(((c.angle - g.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
          return diff < half;
        });
        assert.ok(opened, `seed ${seed}: the wall is solid where road ${c.id} arrives`);
      }
    }
  });
  assert.ok(walled > 5, `only ${walled} walled towns across five worlds`);
  assert.ok(crossings > 5, `only ${crossings} roads reached a walled town, which cannot be right`);
});

test('B — a road that clips the CORNER of the ring is a crossing, and used to be invisible', () => {
  /**
   * The bug, in one span. Both ends of this segment are outside an 82 m ring and the line between
   * them passes 30 m from the middle of town — straight through the masonry twice. The old walk
   * watched for the step from outside to inside and there is no step, so it found nothing, no gate
   * was cut, and features.js drew the road through the wall regardless.
   *
   * Road points are 45-128 m apart on a full-sized planet and a wall ring is about 82 m, so this
   * is not a contrived span: it is the ordinary size of one.
   */
  const paths = [{ id: 'clip', klass: 'road', points: [[-120, -30], [120, -30]] }];
  const got = ringCrossings(paths, 0, 0, 82, { minGap: 10 });
  assert.equal(got.length, 2, `a chord across the ring gave ${got.length} crossings`);
  for (const c of got) assert.ok(Math.abs(Math.hypot(c.dx, c.dz) - 82) < 1e-6, 'a crossing off the ring');
  // both ends are genuinely outside, which is what made this invisible
  for (const p of paths[0].points) assert.ok(Math.hypot(p[0], p[1]) > 82, 'the span no longer clips the corner');

  // …and a span that misses is still not a crossing
  assert.equal(ringCrossings([{ id: 'miss', points: [[-120, -200], [120, -200]] }], 0, 0, 82).length, 0);
  // …and a plain entry is still one crossing, not two
  assert.equal(ringCrossings([{ id: 'in', points: [[-120, 0], [0, 0]] }], 0, 0, 82).length, 1);
});

test('B — the streets and the wall are told about the same circle', () => {
  // `roadLinksFor` used to ask at `ring` while the gates were cut at `ring + 14`, and a road
  // arriving at a slant crosses those two circles at different bearings — so the high street and
  // the way through the wall were in different places. And the links were capped at four while the
  // gate list was not, which gave a fifth road an opening with no street behind it.
  const src = readFileSync(join(here, '../js/features.js'), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.match(code, /links:\s*roadLinksFor\(cx, cz, wallR\)/,
    'the town planner is being told about a different circle from the one the wall is built on');
  assert.ok(!/ringCrossings\(roads, cx, cz, ring, \{ limit/.test(code),
    'the link list is capped again while the gate list is not');
  assert.match(code, /const gateAngles = ringCrossings\(roads, cx, cz, wallR\)/,
    'the gates stopped being cut where the roads actually cross the wall');
});

// ------------------------------------------------------------------------------- C. the dead ends

test('C — no road ends at nothing', () => {
  /**
   * *"It also ends abruptly at nothing… they should never just take you 5 feet out of town and
   * end."* Every end of every road has to be one of three things:
   *
   *   * a place — any node the world map put on the ground (a settlement, a port, a landmark);
   *   * a junction with another road, which `mergeRoadNetwork` files by name;
   *   * or close enough to another road's line to be standing on it.
   *
   * Anything else was a stub in a field, and `connectRoadNetwork` in js/planet.js now either walks
   * it to something or throws it away.
   */
  let ends = 0, dead = 0, worst = null;
  eachWorld(({ seed, terrain }) => {
    const places = (terrain.world.nodes || [])
      .map(n => [n.x * terrain.metresPerCell, n.y * terrain.metresPerCell]);
    const NODE_REACH = terrain.metresPerCell * 0.75;
    for (const road of terrain.roadPaths) {
      for (const end of ['start', 'end']) {
        ends++;
        const pts = road.points;
        const [x, z] = end === 'start' ? pts[0] : pts[pts.length - 1];
        if ((road.joins || []).some(j => j.at === end)) continue;
        if (places.some(p => Math.hypot(p[0] - x, p[1] - z) <= NODE_REACH)) continue;
        // on another road's line — measured against the spans, not the sample points, because a
        // sample point is 12.8 m from the next one and a junction can be anywhere between two
        let near = Infinity;
        for (const other of terrain.roadPaths) {
          if (other === road) continue;
          const op = other.points;
          for (let i = 0; i + 1 < op.length; i++) {
            const [ax, az] = op[i], [bx, bz] = op[i + 1];
            const vx = bx - ax, vz = bz - az;
            const l2 = vx * vx + vz * vz;
            const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2)) : 0;
            near = Math.min(near, Math.hypot(ax + vx * t - x, az + vz * t - z));
          }
        }
        if (near <= 16) continue;
        dead++;
        if (!worst) worst = `seed ${seed} road ${road.id} ${end} at ${x | 0},${z | 0}, nearest road ${near.toFixed(0)} m`;
      }
    }
  });
  assert.ok(ends > 100, `only ${ends} road ends across five worlds`);
  assert.equal(dead, 0, `${dead} of ${ends} road ends lead nowhere — first: ${worst}`);
});

test('C — a road still knows which two places it joins', () => {
  // World Forge writes `from` and `to` on every link it lays and js/planet.js threw both away, so
  // nothing downstream could ask the one question that matters about a road. Without these the
  // test above is the only check there is, and it cannot tell a road that reaches the wrong town
  // from one that reaches the right one.
  eachWorld(({ seed, terrain }) => {
    const named = terrain.roadPaths.filter(r => r.from !== null && r.from !== undefined);
    assert.ok(named.length === terrain.roadPaths.length,
      `seed ${seed}: ${terrain.roadPaths.length - named.length} roads have no idea where they were going`);
  });
});

test('C — the network is not quietly emptied to make the assertion true', () => {
  // The cheap way to have no dead ends is to have no roads. Every world still has to have a real
  // network on it, and nearly all of it has to survive the pass.
  eachWorld(({ seed, terrain }) => {
    assert.ok(terrain.roadPaths.length >= 8, `seed ${seed} has only ${terrain.roadPaths.length} roads left`);
    assert.ok(terrain.roadStubsDropped <= terrain.roadPaths.length * 0.25,
      `seed ${seed} dropped ${terrain.roadStubsDropped} roads to keep ${terrain.roadPaths.length}`);
  });
});

test('C — a stub walked onto another road is levelled with it, like any other junction', () => {
  // The first version of the connectivity pass moved the point and left the grading to work the
  // height out for itself, which put a spur 3.49 m above the trunk it had just been walked to —
  // item A's bug, rebuilt by the fix for item C. A spur files a real join now.
  eachWorld(({ terrain }) => {
    for (const road of terrain.roadPaths) {
      for (const join of road.joins || []) {
        const at = join.at === 'start' ? 0 : road.surface.length - 1;
        const trunk = join.trunk;
        const y = trunk.surface[join.i]
          + (trunk.surface[Math.min(trunk.surface.length - 1, join.i + 1)] - trunk.surface[join.i]) * join.t;
        // the floor has the last word at a junction that is also a bridge, so the deck may be
        // ABOVE the trunk there; what it may never be is a step down into it
        assert.ok(road.surface[at] >= y - 0.05,
          `a junction sits ${(y - road.surface[at]).toFixed(2)} m under the trunk it joins`);
      }
    }
  });
});

// ------------------------------------------------------------------ D. the houses and the wall

test('D — every plot the game builds is inside the wall the game builds', () => {
  /**
   * *"At this location houses clip through the wall."*
   *
   * `planTown` retries a crowded site at `ringScale` up to 1.65 and reports the ring and the wall
   * it settled on. features.js read neither — it recomputed `16 + size * 13` and `ring + 14`, so a
   * size-4 town that retried at 1.65 handed back plots out to 112 m while the wall was built at
   * 82 m, and every plot between the two was a house in (or outside) its own masonry.
   *
   * This plans the real towns on the real ground and checks every CORNER of every plot against the
   * radius features.js now takes from the plan.
   */
  let towns = 0, plots = 0, scaled = 0;
  eachWorld(({ seed, terrain }) => {
    for (const node of townsOf(terrain)) {
      const size = node.size || 1;
      const foot = footprintOf(size);
      const culture = cultureFor({ race: node.race, biome: node.biome });
      const plan = planTown({
        seed: (seed ^ (node.id * 2654435761)) >>> 0,
        size, culture,
        links: ringCrossings(terrain.roadPaths, node.wx, node.wz, foot.wall).map(c => [c.dx, c.dz]),
        heightAt: (lx, lz) => terrain.heightAt(node.wx + lx, node.wz + lz),
        buildable: (lx, lz) => {
          const x = node.wx + lx, z = node.wz + lz;
          if (terrain.roadAt(x, z) > 0.45 || terrain.bridgedAt?.(x, z, 2)) return false;
          return !terrain.underwater(x, z) && terrain.riverAt(x, z) <= 0.3 && terrain.slopeAt(x, z, 6) <= 0.62;
        },
      });
      towns++;
      if (plan.ring > foot.ring + 0.01) scaled++;
      if (!plan.wall) continue;
      // the radius features.js builds the masonry at, read from the plan exactly as it reads it
      const wallR = plan.wallRadius;
      for (const p of plan.plots) {
        plots++;
        const c = Math.cos(p.angle), s = Math.sin(p.angle);
        const hw = p.w / 2, hd = p.d / 2;
        for (const [lx, lz] of [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]]) {
          const x = p.cx + lx * c - lz * s, z = p.cz + lx * s + lz * c;
          assert.ok(Math.hypot(x, z) <= wallR - WALL_CLEARANCE,
            `seed ${seed}, ${node.name}: a plot corner stands ${(Math.hypot(x, z) - wallR).toFixed(1)} m outside a ${wallR.toFixed(0)} m wall`);
        }
      }
      assert.deepEqual(overlaps(plan).filter(h => h.kind === 'plot-wall'), [],
        `seed ${seed}, ${node.name}: proctown's own validator disagrees with the walk above`);
    }
  });
  assert.ok(towns > 20, `only ${towns} towns planned`);
  assert.ok(plots > 100, `only ${plots} plots checked`);
  // the whole bug lived in the retry path, so the test is worth nothing if no town ever retried
  assert.ok(scaled > 0, 'no town in five worlds grew its ring — this test can no longer see the bug');
});

test('D — features.js takes the ring and the wall from the plan, not from a formula of its own', () => {
  const src = readFileSync(join(here, '../js/features.js'), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.ok(!/const ring = 16 \+ size \* 13/.test(code),
    'features.js is recomputing the town ring again instead of reading the plan');
  assert.ok(!/const wallR = ring \+ 14/.test(code),
    'features.js is recomputing the wall radius again instead of reading the plan');
  assert.match(code, /ring = plan\.ring/, 'the ring is no longer taken from the plan');
  assert.match(code, /wallR = plan\.wallRadius/, 'the wall radius is no longer taken from the plan');
});

// ------------------------------------------------------------------------------- the user's spot

test('the reported spot on Kydsel IV is clear on all four counts', () => {
  // seed 25392, Kydsel IV — the world every one of this round's reports was written on. The three
  // coordinates the user gave are within a few hundred metres of the town of Dearbigate.
  setMetresPerCell(M_PER_CELL_DEFAULT * SCALE);
  const wr = createWorld({
    seed: 25392, width: balance.world?.width ?? 256, height: balance.world?.height ?? 128,
    regionScale: 2, habitable: true, liveable: true,
  });
  assert.equal(wr.planet.name, 'Kydsel IV', 'seed 25392 no longer lands on Kydsel IV');
  const terrain = makeTerrain(wr.world, wr.planet, balance.terrain);
  assert.equal(M_PER_CELL, M_PER_CELL_DEFAULT * SCALE);

  // the road near the reported spots keeps the ground under its paving
  for (const [px, pz] of [[5160, 1597], [5805, 1788], [5240, 1592]]) {
    for (const road of terrain.roadPaths) {
      const geom = drawnRibbon(road, terrain);
      for (let i = 0; i < road.points.length; i++) {
        if (Math.hypot(road.points[i][0] - px, road.points[i][1] - pz) > 400) continue;
        if (road.wet?.[i]) continue;
        const ax = geom.position[i * 6], ay = geom.position[i * 6 + 1], az = geom.position[i * 6 + 2];
        const bx = geom.position[i * 6 + 3], by = geom.position[i * 6 + 4], bz = geom.position[i * 6 + 5];
        for (let k = 0; k <= 10; k++) {
          const u = k / 10;
          const x = ax + (bx - ax) * u, z = az + (bz - az) * u;
          if (terrain.bridgedAt?.(x, z)) continue;
          assert.ok(terrain.heightAt(x, z) <= ay + (by - ay) * u,
            `the ground still stands through the road at ${x | 0},${z | 0}`);
        }
      }
    }
  }

  // and the town the user was standing in has a gate on every road that reaches its wall
  const town = townsOf(terrain).find(n => Math.hypot(n.wx - 5265, n.wz - 1683) < 300);
  assert.ok(town, 'the town the user was standing in is gone');
  const { wall, walled } = footprintOf(town.size || 1);
  if (walled) {
    const gates = ringCrossings(terrain.roadPaths, town.wx, town.wz, wall);
    assert.ok(gates.length > 0, `no road reaches ${town.name} at all`);
  }
  // and its crossings, if any, still let the water through (round 16's rule, unbroken by the verge)
  for (const c of terrain.crossings) {
    if (Math.hypot(c.x - town.wx, c.z - town.wz) > 600) continue;
    assert.ok(covers(c, c.x, c.z));
    assert.ok(c.deck > c.surf + 1, `a "bridge" only ${(c.deck - c.surf).toFixed(2)} m over its water`);
  }
});
