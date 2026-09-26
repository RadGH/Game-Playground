// Farhold — what a town is made of, and how it is laid out.
//
// Split out of `js/features.js` for the same reason `js/dungeon-plan.js` and `js/water-plan.js`
// were: this is a catalogue and some arithmetic with no Three.js in it, so `node --test` can check
// that every building a town wants is a real building, that each one is solid, and that a small
// settlement drops the right things when it runs out of room.
//
// The geometry lives in `features.js`; the FACTS about each building live here.

import { planLane, resample, LANE_SPACING } from './roadplan.js';
import { footprintOf, wallTier } from '../../../proctown/js/townplan.js';
// R27 M3 — the town-edge kinds live with the rest of the building kit
import { WALL_KINDS, FENCE_KINDS } from '../../../proctown/js/buildkit.js';

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
  // R23: 1400 — a wall piece now also fills the kerb beside a gate, and a cap that runs out drops
  // masonry the collider map still expects to be there
  wall: { cap: 1400, solid: [3.2, 4], from: 4, role: null },
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

  // ---- R27 M3: town edges by culture (see `edgeKey` below and proctown/js/buildkit.js)
  ...edgeCatalogue(),
};

/**
 * R27 M3 — ONE INSTANCED MESH PER WALL KIND, EACH WITH THE STONE WALL'S OWN BUDGET.
 *
 * The stone kit keeps the plain keys (`wall`, `tower`, `gatehouse`) so every test and system that
 * already looks those up still finds a human town's wall where it always was; the other five kinds
 * are `wall_palisade`, `tower_hedge`, `gatehouse_bone` and so on. Same caps and same collision
 * shapes as stone, because the collider never varies by kind — only the drawing does.
 *
 * The low edges are DECORATION ONLY and say so with `solid: [0, 0]`: a fence round a village you
 * could not step over would be a trap (a quest giver on the far side of a fence with no gap), so
 * none of these files a collider anywhere — features.js places them with `solid: false`.
 */
function edgeCatalogue() {
  const out = {};
  for (const kind of WALL_KINDS) {
    if (kind === 'stone') continue;
    out[`wall_${kind}`] = { cap: 1400, solid: [3.2, 4], from: 4, role: null };
    out[`tower_${kind}`] = { cap: 200, solid: [2.6, 12], from: 4, role: null };
    out[`gatehouse_${kind}`] = { cap: 80, solid: [4.0, 7], from: 4, role: null };
  }
  for (const kind of FENCE_KINDS) out[`fence_${kind}`] = { cap: 2400, solid: [0, 0], from: 2, role: null };
  out.boundstone = { cap: 400, solid: [0, 0], from: 1, role: null };
  out.banner = { cap: 240, solid: [0, 0], from: 1, role: null };
  return out;
}

/** The mesh a piece of a town's edge goes into: `edgeKey('palisade', 'tower')` -> 'tower_palisade'. */
export function edgeKey(kind = 'stone', piece = 'wall') {
  return kind === 'stone' || !WALL_KINDS.includes(kind) ? piece : `${piece}_${kind}`;
}

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

/**
 * How wide a settlement's footprint is, and what kind of edge it has. R27 M2: these are the
 * PLANNER's own functions, re-exported. This file used to carry a byte-for-byte copy of
 * `footprintOf`, and the "size >= 4 is a wall" rule was written out in six places across the two
 * projects. There is one of each now, in proctown/js/townplan.js.
 */
export { footprintOf, wallTier };

// ---------------------------------------------------------------------------- R27 M2: one town size

/**
 * THE PLANS WE HAVE SEEN, so a caller that is not js/features.js can ask how big a town REALLY is.
 *
 * `planTown` retries a crowded site at 1.3x or 1.65x its ring, and only the plan knows which one it
 * took. Before this, six systems each worked a town's size out from `16 + size * 13` and never saw
 * the growth — so a size-5 wall stood at 157 m while the enemies' no-spawn circle stopped at 113 m,
 * and a pack could spawn and wander forty metres inside a city's wall.
 *
 * Filed two ways: on the node object itself (features' settlements are what town.js, waypoints.js
 * and main.js pass around), and by id for callers holding a different copy of the same node
 * (js/sites.js reads `terrain.world.nodes`). The id table belongs to one world at a time and is
 * emptied by `forgetPlans()` when js/features.js is built for a new one.
 */
const planByNode = new WeakMap();
let planById = new Map();

/** File a town's plan, once js/features.js has made it. */
export function rememberPlan(node, plan) {
  if (!node || !plan) return;
  if (typeof node === 'object') planByNode.set(node, plan);
  if (node.id != null) planById.set(node.id, plan);
}

/** A new world: every id means a different town now. */
export function forgetPlans() { planById = new Map(); }

/** The plan filed for this node, if the town has been planned yet. */
export function planOf(node) {
  if (!node) return null;
  return (typeof node === 'object' && planByNode.get(node)) || planById.get(node.id) || null;
}

/**
 * HOW FAR A TOWN REACHES: `{ ring, wall, walled, tier, plots, planned }`.
 *
 *   ring    metres from the centre to the outermost plot
 *   wall    metres to the wall — or to the ring, for a settlement with none
 *   walled  whether there is a real wall (a `'wall'` tier)
 *   tier    `wallTier(size)`
 *   plots   how many plots the plan cut, or null before it has been planned
 *
 * Reads the planner's real `plan.ring` / `plan.wallRadius` when the town has been planned, and the
 * unscaled footprint otherwise. The footprint is a FLOOR, never an answer that wins over the plan:
 * the planner only ever grows a town, so an early caller (js/sites.js keeping its castles clear,
 * before any town has been planned) gets a smaller number than the truth, never a bigger one.
 *
 *   import { townExtent } from './town-plan.js';
 *   const { wall, walled } = townExtent(node);
 */
export function townExtent(node = {}, plan = null) {
  const size = node?.size || 1;
  const fp = footprintOf(size);
  const tier = wallTier(size);
  const p = plan || planOf(node);
  const ring = Math.max(fp.ring, Number.isFinite(p?.ring) ? p.ring : 0);
  const wall = Math.max(fp.wall, ring, Number.isFinite(p?.wallRadius) ? p.wallRadius : 0);
  return {
    ring, wall, walled: tier === 'wall', tier,
    plots: p?.plots ? p.plots.length : null,
    planned: !!p,
  };
}

/**
 * R27 M2 — WHAT A TOWN BRINGS TO A MUSTER: its planned plot count, its own guard bodies and its
 * real wall, for js/muster.js `baseForTown`. main.js used to hand over `town.size` as the plot
 * count, YOUR colony's guards, and `town.walled` — which nothing ever set — so the walled bonus
 * never applied anywhere. One function, so the test builds its town through the same path.
 *
 *   civics.muster.baseForTown(town, musterFacts(town, folk.guardsOf(town.id)))
 */
export function musterFacts(node, guards = 0) {
  const ext = townExtent(node);
  return { plots: ext.plots ?? 0, guards: guards || 0, walled: ext.walled };
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
export function streetLanes(plan, {
  cx = 0, cz = 0, terrain = null, skip = null, gradePasses = 2,
  /**
   * R21 — drop paving that leads nowhere. Opt-in, because this function is otherwise a pure
   * transform from a plan to ribbons and several tests drive it as one: handed a plan with two
   * streets they expect two streets back, cut or not. The GAME wants the pruning; a unit test
   * asking "does a break make two runs instead of one with a hole" does not. See `keepConnected`.
   */
  prune = false,
  /**
   * ROUND 22 — how far past its own kerb a street has to clear the ground, in metres.
   *
   * *"At this location the terrain repeatedly clips through the road."* The world's roads have the
   * terrain carved down to meet them; a town street has nothing (see the note above about the
   * terraform book), and `gradeHeights` only ever samples the CENTRE LINE. On any side slope the
   * uphill half of the ribbon is therefore under the hill. Two metres past the kerb covers the
   * innermost terrain ring's own cell size, which is what decides how far a triangle can carry a
   * hillside across the paving before anyone can see it.
   */
  clearAcross = 2,
} = {}) {
  const lanes = [];
  const runs = [];
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
        runs.push({ pts: run, half: (st.width || 4) / 2, cls: st.cls || 'street' });
      }
      run = [];
    };
    for (const p of world) {
      if (skip && skip(p[0], p[1])) flush();
      else run.push(p);
    }
    flush();
  }

  for (const r of (prune ? keepConnected(runs, terrain) : runs)) {
    lanes.push(planLane(r.pts, {
      terrain, half: r.half, gradePasses, klass: r.cls, surface: 'street',
      clearAcross: terrain?.heightAt ? clearAcross : 0,
    }));
  }
  return lanes;
}

/** How short a piece of paving has to be before it is not a street at all. */
const MIN_RUN = 5.5;
/** How close two runs must come to count as joined. Their own half-widths, plus a stride. */
const JOIN_SLACK = 1.6;

/**
 * R21 — DROP THE PAVING THAT GOES NOWHERE.
 *
 * The play-test: *"There are lots of sub-roads that are totally meaningless and/or don't connect to
 * the main road."* Measured on the reported town: 164 planned streets, of which **159 were alleys
 * averaging 11 m**, 69 of them under 8 m, and **308 of 318 endpoints were dead ends** — the alleys
 * did not even share corners with each other. 1,785 m of alley for 37 plots.
 *
 * proctown DOES have a connectivity pass (`connectStreets`, added in round 13 for exactly this
 * complaint) and it is not enough, because of an ORDERING problem that round could not see: it
 * decides connectivity in PLAN space, and then the run is cut afterwards and elsewhere — here, by
 * `skip`, at the water, at a bridge deck and (new this round) at the world road. A street the
 * planner certified as connected is sliced into pieces after the fact, and the far piece is an
 * orphan ribbon in a field. That is the "random flat rectangles" report, returning by a different
 * door.
 *
 * So the same question is asked again, on the runs that will actually be drawn:
 *
 *   * a `main` or `lane` run is a seed — those are the spine of the town;
 *   * a run touching the WORLD ROAD is a seed too, because the road is the street there. This
 *     matters more than it sounds: the new road `skip` means every street that used to be drawn on
 *     top of the carriageway now ENDS at it, and every one of those would otherwise read as an
 *     orphan;
 *   * anything else is kept only if it reaches something already kept, growing to a fixed point;
 *   * and a run under `MIN_RUN` is a paving slab, not a street, so it goes whatever it touches.
 */
function keepConnected(runs, terrain) {
  const live = runs.filter(r => lengthOf(r.pts) >= MIN_RUN);
  if (live.length <= 1) return live;

  const onRoad = r => {
    if (!terrain?.roadAt) return false;
    for (const [x, z] of [r.pts[0], r.pts[r.pts.length - 1]]) {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        if (terrain.roadAt(x + Math.cos(a) * 5, z + Math.sin(a) * 5) > 0.45) return true;
      }
    }
    return false;
  };

  const keep = new Set();
  live.forEach((r, i) => { if (r.cls === 'main' || r.cls === 'lane' || onRoad(r)) keep.add(i); });
  // nothing anchored it — fall back to the longest run, so a town is never left with no streets
  if (!keep.size) {
    let best = 0;
    live.forEach((r, i) => { if (lengthOf(r.pts) > lengthOf(live[best].pts)) best = i; });
    keep.add(best);
  }

  let grew = true;
  while (grew) {
    grew = false;
    for (let i = 0; i < live.length; i++) {
      if (keep.has(i)) continue;
      for (const j of keep) {
        if (!meet(live[i], live[j])) continue;
        keep.add(i); grew = true; break;
      }
    }
  }
  return live.filter((_, i) => keep.has(i));
}

function lengthOf(pts) {
  let out = 0;
  for (let i = 1; i < pts.length; i++) out += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return out;
}

/** Do two runs come close enough anywhere along their length to be one network? */
function meet(a, b) {
  const reach = a.half + b.half + JOIN_SLACK;
  const r2 = reach * reach;
  for (const [ax, az] of a.pts) {
    for (const [bx, bz] of b.pts) {
      const dx = ax - bx, dz = az - bz;
      if (dx * dx + dz * dz <= r2) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------- where a settlement stands

/**
 * The driest spot within about a cell of where a settlement was filed.
 *
 * Scored by how much of the town's own ring would be dry, because that is what the player sees —
 * a centre that happens to be a metre above the waterline with a river either side of it is not a
 * better place to put a town than one thirty metres up the bank.
 *
 * Exported because `tools/probe-worldgen.mjs` and the round-17 tests have to ask the same
 * question the game asks — a probe that works the answer out for itself is a probe that can agree
 * with a bug.
 *
 * `cell` is the map cell in metres — the anchor never moves further than that, because every
 * consumer that derives metres from `node.x * M_PER_CELL` has exactly that much slack.
 *
 * Returns the original point unchanged when it is already good enough (85% dry), so the great
 * majority of towns on the planet are not touched at all and no existing world is reshuffled.
 */
export function settlementAnchor(terrain, x0, z0, ring, cell = 224) {
  const wetness = (x, z) => {
    let dry = 0, n = 0;
    // the centre, then two rings of eight — sixteen samples is enough to tell a river through the
    // middle from a pond at the edge, and cheap enough to run for every settlement at load
    for (const r of [0, ring * 0.5, ring]) {
      const steps = r === 0 ? 1 : 8;
      for (let a = 0; a < steps; a++) {
        const px = x + Math.cos((a / steps) * Math.PI * 2) * r;
        const pz = z + Math.sin((a / steps) * Math.PI * 2) * r;
        n++;
        if (!terrain.underwater(px, pz) && terrain.riverAt(px, pz) < 0.3) dry++;
      }
    }
    return dry / n;
  };
  const here = wetness(x0, z0);
  if (here >= 0.85) return { x: x0, y: z0 };
  let best = { x: x0, y: z0, score: here };
  // a fixed spiral: two rings of twelve, out to just under one cell
  for (const r of [cell * 0.35, cell * 0.7]) {
    for (let a = 0; a < 12; a++) {
      const px = x0 + Math.cos((a / 12) * Math.PI * 2) * r;
      const pz = z0 + Math.sin((a / 12) * Math.PI * 2) * r;
      // a candidate that is itself in the water is not a candidate, however dry its ring is
      if (terrain.underwater(px, pz)) continue;
      const score = wetness(px, pz);
      // strictly better, so the first candidate at the smaller radius wins a tie and the town
      // moves as little as it can get away with
      if (score > best.score + 0.001) best = { x: px, y: pz, score };
    }
  }
  return best;
}

/**
 * ROUND 23 — WHERE THE GATE GUARDS STAND.
 *
 * *"Let's make them open instead and have a guard by each entrance."* Two per opening, one either
 * side of the road just outside the wall, in front of the gate towers and facing out along the road
 * — close enough to read as "the gate is watched", far enough off the carriageway that you do not
 * have to walk round them.
 *
 * `gates` is `features.gatesOf(id)`: `{ x, z, yaw, open, span, depth, tx, tz, ox, oz }`, where
 * (tx, tz) runs along the wall and (ox, oz) points out of the town. Pure, so a node test checks the
 * posts against the colliders the gate itself filed.
 */
export function sentryPosts(gates = []) {
  const out = [];
  for (const [i, g] of gates.entries()) {
    // just past the outer face of the gate, and a metre beyond the edge of the opening
    const outward = (g.depth ?? 3.4) / 2 + 1.4;
    const aside = (g.open ?? 8) / 2 + 1.0;
    for (const side of [-1, 1]) {
      out.push({
        gate: i, side,
        x: g.x + g.ox * outward + g.tx * side * aside,
        z: g.z + g.oz * outward + g.tz * side * aside,
        facing: g.yaw,                           // the gate's +Z is out along the road
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------- R27 M3: arrival

/** Metres past the edge you have to walk back out before the arrival card can fire again. */
export const ARRIVAL_REARM = 30;

/**
 * Where "arriving" happens: the wall for a walled town, the ring for an open one — from
 * `townExtent`, and from nowhere else (a third answer to "where does this town end" is exactly the
 * fault round 21 and M2 spent two rounds removing).
 */
export function arrivalRadius(node) {
  const ext = townExtent(node);
  return ext.walled ? ext.wall : ext.ring;
}

/**
 * R27 M3 — THE ARRIVAL CARD FIRES ONCE PER ENTRY.
 *
 * `step(x, z, towns)` returns the town you have just walked INTO, or null. A town fires when you
 * cross its `arrivalRadius` inwards; it re-arms only when you are `rearm` metres back OUT past that
 * radius, so walking round the market, or along the inside of the wall, never fires it twice. A town
 * you are already inside the first time the watch sees it (a load, a waypoint jump) is marked as
 * entered without a card — you did not walk in.
 *
 * State is per node object (a WeakMap), so a new world's settlements start fresh with no reset call.
 */
export function createArrivalWatch({ rearm = ARRIVAL_REARM, radiusOf = arrivalRadius } = {}) {
  let inside = new WeakMap();
  return {
    step(x, z, towns = []) {
      let fired = null;
      for (const t of towns) {
        const r = radiusOf(t);
        const d = Math.hypot((t.wx ?? t.x) - x, (t.wz ?? t.z) - z);
        const was = inside.get(t);
        if (was === undefined) { inside.set(t, d < r); continue; }
        if (!was && d < r) { inside.set(t, true); if (!fired) fired = t; }
        else if (was && d > r + rearm) inside.set(t, false);
      }
      return fired;
    },
    reset() { inside = new WeakMap(); },
  };
}

/** The game's one watch — main.js asks it once a frame. */
const sharedArrivals = createArrivalWatch();
export const arrivalAt = (x, z, towns) => sharedArrivals.step(x, z, towns);

/** What each role in a town is to a traveller, in the fewest words. */
const SERVICE_WORD = {
  merchant: 'market', smith: 'smith', innkeeper: 'inn', elder: 'elder', gambler: 'gambler',
  broker: 'mercenaries', unbinder: 'unbinder',
};

/**
 * The arrival card's facts: `{ name, size, holder, services }`.
 *
 *   size      the settlement's own tier word (hamlet / village / town / city / capital)
 *   holder    the display name of whoever holds the zone, or null
 *   services  one word per kind of person in js/town.js's roster who does something for you
 */
export function arrivalCard(node, { roster = [], holder = null } = {}) {
  const services = [];
  for (const role of roster || []) {
    const word = SERVICE_WORD[role?.key];
    if (word && !services.includes(word)) services.push(word);
  }
  return {
    name: node?.name || 'a settlement',
    size: node?.kind || node?.tier || (wallTier(node?.size || 1) === 'wall' ? 'city' : 'village'),
    holder: holder || null,
    services,
  };
}
