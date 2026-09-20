// Farhold — what a town is made of, and how it is laid out.
//
// Split out of `js/features.js` for the same reason `js/dungeon-plan.js` and `js/water-plan.js`
// were: this is a catalogue and some arithmetic with no Three.js in it, so `node --test` can check
// that every building a town wants is a real building, that each one is solid, and that a small
// settlement drops the right things when it runs out of room.
//
// The geometry lives in `features.js`; the FACTS about each building live here.

import { planLane, resample, LANE_SPACING } from './roadplan.js';

/**
 * Every building a settlement may contain.
 *
 *   cap     how many of them may exist at once across the whole world (one InstancedMesh each)
 *   solid   [radius, height] in metres for collision; [0, 0] means you walk over it
 *   from    the smallest settlement size that wants one
 *   role    who stands in it, when `js/town.js` has somebody of that kind
 *
 * Round 8 added the twelve after `bridge`: "update towns to be more complex, have 12 new bespoke
 * buildings, and have their own road network between them".
 */
export const BUILDING_INFO = {
  // ---- the originals
  hut: { cap: 400, solid: [2.6, 4], from: 0, role: null },
  house: { cap: 400, solid: [3.6, 6], from: 0, role: null },
  hall: { cap: 200, solid: [6.0, 8], from: 3, role: 'elder' },
  tower: { cap: 200, solid: [2.6, 12], from: 4, role: null },
  wall: { cap: 700, solid: [3.2, 4], from: 4, role: null },
  well: { cap: 120, solid: [1.4, 3], from: 0, role: null },
  bridge: { cap: 120, solid: [0, 0], from: 0, role: null },

  // ---- round 8
  forge: { cap: 120, solid: [3.4, 5], from: 2, role: 'smith' },
  inn: { cap: 120, solid: [4.4, 8], from: 2, role: 'innkeeper' },
  market: { cap: 200, solid: [2.6, 3], from: 2, role: 'merchant' },
  granary: { cap: 160, solid: [3.0, 7], from: 1, role: null },
  chapel: { cap: 100, solid: [4.2, 9], from: 3, role: null },
  barracks: { cap: 100, solid: [4.8, 4], from: 4, role: 'guard' },
  stable: { cap: 120, solid: [3.8, 3], from: 2, role: null },
  mill: { cap: 90, solid: [2.8, 8], from: 2, role: null },
  warehouse: { cap: 140, solid: [5.6, 5], from: 3, role: null },
  watchpost: { cap: 160, solid: [2.0, 6], from: 3, role: 'guard' },
  shrine: { cap: 140, solid: [1.0, 3], from: 0, role: null },
  gatehouse: { cap: 80, solid: [4.0, 7], from: 4, role: null },
  street: { cap: 900, solid: [0, 0], from: 0, role: null },
  /**
   * The waypoint pad, and the sigils cut into its face.
   *
   * Two meshes rather than one because the sigils have to light up on their own: the pad is grey
   * concrete whether or not you have been here, and the ring only glows once the town has been
   * entered. One design on every world and in every culture — it is a single network, not a local
   * monument, so it has to read as one thing wherever it is found.
   */
  waypoint: { cap: 60, solid: [0, 0], from: 0, role: null },
  waysigil: { cap: 60, solid: [0, 0], from: 0, role: null },
  /** The town's notice board — a real object you walk up to, not the whole settlement. */
  noticeboard: { cap: 60, solid: [0.9, 2.4], from: 1, role: null },
};

/** The twelve added in round 8, for the tests and the docs. */
export const NEW_BUILDINGS = [
  'forge', 'inn', 'market', 'granary', 'chapel', 'barracks',
  'stable', 'mill', 'warehouse', 'watchpost', 'shrine', 'gatehouse',
];

/**
 * `wantsFor` AND `streetPlan` USED TO LIVE HERE. THEY ARE GONE ON PURPOSE.
 *
 * They were the old spoke planner: a settlement got N streets radiating from a square, and the
 * buildings were dropped along them. `proctown/js/townplan.js` replaced all of it in round 11 — the
 * town is cut into blocks and the CUTS become the streets, which is why a plot can no longer sit on
 * a road — and these two were kept alive by nothing but a test that still imported them.
 *
 * That is worse than plain dead code: a function with a passing test beside it looks load-bearing,
 * and the next person to read this file would reasonably believe the game still plans towns this
 * way. `wantsFor` in particular had a genuinely different answer to the one the game now uses
 * (proctown caps trades at a third of the plots), so the test was asserting a rule that is no
 * longer true anywhere.
 */

/** How wide a settlement's footprint is, which is also where its quiet ground starts. */
export function footprintOf(size = 1) {
  const ring = 16 + size * 13;
  const wall = size >= 4 ? ring + 14 : ring;
  return { ring, wall, walled: size >= 4 };
}

// ---------------------------------------------------------------------------- streets as lanes

/**
 * ROUND 14 — A TOWN STREET IS THE SAME KIND OF THING AS A ROAD BETWEEN TOWNS.
 *
 * *"The tiles in town clip through the terrain. It would be better if they behaved like the regular
 * roads, which we've worked on to get smooth on the terrain."*
 *
 * A street was a row of white slabs: one every three metres, each turned to its span's bearing,
 * each stretched to its span's length, each sitting on the ground height at its OWN midpoint. Round
 * 11 tried to close the seams by halving the step and overlapping each slab by a third, and round 13
 * paved every junction with a square pad to fill the wedge where two bearings met. Both of those are
 * patches on the wrong model. On a slope consecutive slabs still step past each other, and a slab is
 * flat while the ground under it is not, so a corner of it goes under.
 *
 * `streetLanes` turns proctown's street polylines into the same LANE the world's roads and the build
 * tool's roads now use — resampled so there are no gaps, corners rounded in the plan so there is no
 * wedge, and `laneRibbon` draws each as one continuous strip of triangles that can only meet the
 * ground the way the ground goes.
 *
 * **It grades LIGHTLY on purpose.** The world's roads are smoothed four times because js/planet.js
 * then carves the terrain down to meet them. Nothing carves the ground under a town — features.js
 * has no terraform book and painting brushes from there would put a permanent edit in the save every
 * time a settlement was rebuilt — so a street has to follow the hillside rather than cut through it.
 * Two passes keeps a street readable as a street and keeps it on the ground.
 *
 *   import { streetLanes } from './town-plan.js';
 *   for (const lane of streetLanes(plan, { cx, cz, terrain })) push(streets, laneRibbon(lane, { lift: 0.12, color }));
 */
export function streetLanes(plan, { cx = 0, cz = 0, terrain = null, skip = null, gradePasses = 2 } = {}) {
  const lanes = [];
  for (const st of plan?.streets || []) {
    /**
     * Sampled BEFORE the water check, not after.
     *
     * proctown gives a street as a handful of corners — an alley straight through a town can be two
     * points ninety metres apart. Asking "is this point in the river?" of two corners answers about
     * two corners and tells you nothing about the eighty-eight metres between them, so a street
     * would happily be laid straight across the water. Sampling first means the check is asked every
     * three metres, which is where the river actually is.
     */
    const world = resample((st.pts || []).map(([lx, lz]) => [cx + lx, cz + lz]), LANE_SPACING);
    /**
     * A street stops at the water and picks up again on the far side, the same way the world's roads
     * do at a sea lane (see `wetAt` in js/features.js). Breaking the run rather than skipping one
     * point is the lesson round 13 learned the hard way: skipping a single point leaves a hole where
     * the join should be, because the ribbon either side of it no longer shares an edge.
     */
    let run = [];
    const flush = () => {
      if (run.length >= 2) {
        lanes.push(planLane(run, {
          terrain,
          half: (st.width || 4) / 2,
          gradePasses,
          klass: st.cls || 'street',
          surface: 'street',
        }));
      }
      run = [];
    };
    for (const p of world) {
      if (skip && skip(p[0], p[1])) flush();
      else run.push(p);
    }
    flush();
  }
  return lanes;
}
