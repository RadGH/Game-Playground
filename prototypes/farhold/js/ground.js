// Farhold — where a body's feet go: the ground, or a bridge deck over it.
//
// Round 23. *"The bridge … has no physics and characters are clipping through it."* The player has
// stood on bridge decks since round 16 (`js/player.js` asks the obstacle fields' `standAt`), and
// nothing else in the game ever did. Enemies (js/actors.js), companions (js/pets.js) and every
// townsperson (js/town.js) set `y = terrain.heightAt(x, z)` — which under a bridge is the river
// BED, because a bridge's footprint is a hole the terrain leaves open for the water. So a wolf
// following you over a bridge walked along the bottom of the river beneath you, and a companion
// trying to keep up refused the "water" and teleported back to your side every frame.
//
// One function for every walker, instead of each module growing its own copy:
//
//   groundAt(terrain, x, z, feet)   // the height to stand at: the terrain, or a deck under `feet`
//   deckAt(terrain, x, z, feet)     // just the deck, or null
//   wetAt(terrain, x, z, feet)      // is this water you would be IN, rather than over on a bridge?
//
// `feet` is how high the body is now. A deck counts only if its top is at or below the feet plus
// `CLEARANCE` (js/collide.js) — so something swimming under a bridge is not snatched up on to it,
// and a body walking along a road rises on to the deck the way the player does, one small step at
// a time. Leave it out (Infinity) for "put me on whatever is here", which is what a spawn wants.
//
// The decks come from `planBridge` in js/bridge-plan.js — the same plan js/features.js draws and
// files for the player — so there is still only one answer to "where is the top of this bridge".

import { ObstacleField, CLEARANCE } from './collide.js';
import { planBridge, fileDeck } from './bridge-plan.js';

const indexes = new WeakMap();

/**
 * Every bridge on a terrain, planned once and filed into a deck-only obstacle field. Built lazily
 * on first use and kept for the terrain's lifetime; a dungeon's terrain has no crossings and gets
 * an empty one, so the lookups below cost a map read and nothing else there.
 */
export function bridgeIndex(terrain) {
  if (!terrain || typeof terrain !== 'object') return null;
  let idx = indexes.get(terrain);
  if (idx) return idx;
  const field = new ObstacleField(32);
  const plans = [];
  // R27 M6: the terrain's own plans when it has them, so `bridgedAt` and the decks are one list
  const made = terrain.bridgePlans?.() || (terrain.crossings || []).map(c => planBridge(c, terrain));
  for (const plan of made) {
    fileDeck(plan, field);
    plans.push(plan);
  }
  idx = { field, plans };
  indexes.set(terrain, idx);
  return idx;
}

/** Forget a terrain's bridges — for a terrain whose crossings were edited after it was built. */
export function forgetBridges(terrain) { if (terrain) indexes.delete(terrain); }

/** The top of the bridge deck under this point that a body at `feet` could be standing on, or null. */
export function deckAt(terrain, x, z, feet = Infinity, radius = 0) {
  const idx = bridgeIndex(terrain);
  if (!idx || !idx.plans.length) return null;
  return idx.field.standAt(x, z, feet, radius, { decksOnly: true });
}

/** The height a walker stands at: the terrain, or a bridge deck above it. */
export function groundAt(terrain, x, z, feet = Infinity, radius = 0) {
  const bare = terrain.heightAt(x, z);
  const deck = deckAt(terrain, x, z, Number.isFinite(feet) ? Math.max(feet, bare) : feet, radius);
  return deck !== null && deck > bare ? deck : bare;
}

/**
 * Water a walker would be standing IN. Over a bridge the water is still there, under the deck, and
 * every "never walk into the river" rule in the game was reading it — which is why nothing but the
 * player would ever set foot on a bridge.
 */
export function wetAt(terrain, x, z, feet = Infinity, { test = 'underwater' } = {}) {
  const wet = test === 'waterAt' ? !!terrain.waterAt(x, z) : !!terrain.underwater(x, z);
  if (!wet) return false;
  // R27 M6: water you can WADE is not water you are in — a ford's stones sit 0.3 m under the
  // surface, and a wolf that will not follow you across one is a wolf that never leaves its bank
  if (wadeable(terrain, x, z)) return false;
  return deckAt(terrain, x, z, feet) === null;
}

/**
 * R27 M6 — THE WADE RULE, one number for everybody. Water shallower than `WADE_DEPTH` is walked
 * through (slowly — see js/player.js), never swum: a ford, a beach, the edge of a stream. The
 * player, a mount, a vehicle, an enemy and a companion all ask this, so a ford is a ford to all of
 * them. Depth is `terrain.waterAt`'s, the same number the swim test in js/player.js reads.
 */
export const WADE_DEPTH = 0.5;
export function wadeable(terrain, x, z) {
  const w = terrain.waterAt?.(x, z);
  return !!w && w.depth < WADE_DEPTH;
}

/**
 * R27 M7 — A CLIFF IS A WALL, FOR EVERYBODY WHO WALKS.
 *
 * Round 21 put real cliff faces into the ground (a narrow crease 2-4 m across at Super tiny, 10-20 m
 * tall — slope 6 to 10 where it is steepest), and nothing treated them as anything but a hill. The
 * player divided their speed by `1 + steep * 1.6` and walked up a 20 m face at a fifth of the pace;
 * an enemy had no slope term at all and ran straight up it at full speed — so the wolf chasing you
 * reached the top of a cliff before you did.
 *
 * The line is round 21's own cliff band: ground steeper than 63 degrees (`tan 63` = 1.96), measured
 * across `sample` metres either side with the terrain's own `slopeAt` — the terraform-aware one, so
 * a face you have levelled is not a face any more. That is ~0.1-1.7% of the land on the standard
 * worlds (see RPG.md), and never a road: the road corridor is calmed (js/planet.js `roadCalmAt`) and
 * the test checks every drawn road point is under the line.
 *
 * `sure` is a mount's `mountSlope` (0..0.8): each whole point of it adds `perSure` degrees, capped at
 * `capDeg`. A surefooted elk takes what a pony will not, but nothing walks up a wall.
 *
 * ESCAPE. A walker refused for `escape` seconds running is let through, at `scramble` metres a
 * second of CLIMB (not of pace — a 20 m face is still a long pull). Nobody is ever stuck in a pit:
 * that plus "a road is always a way up" is the guarantee. `body.cliffPinned` holds the clock and
 * `body.cliffClimb` the metres earned.
 */
export const CLIFF = {
  deg: 63, capDeg: 70, perSure: 10,
  sample: 1,
  escape: 3, scramble: 1.2,
  /** Horizontal metres a second a body standing ON a face slides back down it. */
  slide: 2.5,
};

/** The steepest grade (rise over run) a walker with this much `sure` may walk up. */
export function cliffGrade(sure = 0) {
  const deg = Math.min(CLIFF.capDeg, CLIFF.deg + Math.max(0, sure) * CLIFF.perSure);
  return Math.tan(deg * Math.PI / 180);
}

/** How steep the ground is here, measured the way the cliff rule measures it. */
export const steepAt = (terrain, x, z) => terrain.slopeAt(x, z, CLIFF.sample);

/**
 * May a walker step from (fromX, fromZ) to (x, z)?
 *
 * Level and downhill steps always may — you can walk (or fall) off a cliff. An uphill step may not
 * when the ground rises past the line IN THE DIRECTION OF THE STEP (over the `sample` metres ahead
 * of where it lands), or when the step itself climbs faster than the line — a galloping
 * horse at 20 fps covers two metres a frame, which is a whole face at Super tiny.
 *
 * Why along the step and not the steepest way: a road runs up to a bridge beside the hole the
 * bridge's footprint leaves in the ground (js/planet.js `spannedAt`), and a quay runs along a river
 * channel. The steepest slope at such a point is the drop into the hole, and the road you are
 * walking along is gentle — measured the steepest way, 42 road points on five worlds refused a
 * walker going up to a bridge. A body pushing straight at a face still meets the whole face.
 *
 * `feet` is how high the body is. A body already at or above the ground it is stepping on to is not
 * climbing anything — it is on a bridge deck or a roof, or it jumped high enough. A body stepping
 * OFF a deck or a roof (feet over the ground it is leaving) on to ground a kerb's height higher is
 * taking a step, not a climb.
 */
export function climbable(terrain, x, z, fromX, fromZ, sure = 0, feet = null) {
  const to = terrain.heightAt(x, z);
  let from = terrain.heightAt(fromX, fromZ);
  if (to <= from) return true;
  if (feet != null) {
    if (feet >= to - 0.05) return true;
    if (feet > from + 0.05) {
      if (to - feet <= 0.35) return true;
      from = feet;
    }
  }
  const run = Math.hypot(x - fromX, z - fromZ);
  if (run < 1e-6) return true;
  const grade = cliffGrade(sure);
  const dx = (x - fromX) / run, dz = (z - fromZ) / run, s = CLIFF.sample;
  // (a kerb's worth of rise in one step is a step, not a climb)
  // …and the ground AHEAD of where it lands, a metre on: a face 20 cm across (the steepest part of
  // a round-21 crease is) sits between two samples of a centred difference and averages away
  const refused = (to - from > 0.35 && (to - from) / run >= grade)
    || (terrain.heightAt(x + dx * s, z + dz * s) - to) / s >= grade;
  // A ROAD IS ALWAYS A WAY UP. Asked last, because it is the rare case: where two roads' graded
  // surfaces meet at different heights `heightAt` has a step in it (1.4 m at Stonecrown, seed 7),
  // and a road must never be the thing that pins you. No cliff is ever on a road (the road corridor
  // breaches the face — js/planet.js `roadCalmAt`), so this costs the rule nothing.
  return !refused || (terrain.roadAt?.(x, z) || 0) > ROAD_WAY;
}

/** How much road (`roadAt`) makes ground a road for the cliff rule — the same line the road pace uses. */
export const ROAD_WAY = 0.45;

/**
 * Is the body standing ON a face — steep both uphill and downhill of it, over half a metre each
 * way? The edge of a bridge's hole or a river's channel is steep on one side only (the road on the
 * other side is flat), and that is ground to stand on, not a face to slide off.
 */
function onFace(terrain, x, z, n, grade) {
  const hl = Math.hypot(n[0], n[2]);
  if (hl < 1e-6) return false;
  const ux = -n[0] / hl, uz = -n[2] / hl, s = 0.5;
  const h = terrain.heightAt(x, z);
  return (terrain.heightAt(x + ux * s, z + uz * s) - h) / s >= grade
    && (h - terrain.heightAt(x - ux * s, z - uz * s)) / s >= grade;
}

const nrmScratch = [0, 1, 0];

/**
 * One step for a walker, with the cliff rule applied. Returns where it may go, in `out`.
 *
 * Refused, the step keeps its part ALONG the face (the contour) and loses its part up it, so a body
 * pushing diagonally into a cliff slides along the foot instead of stopping dead — which is what
 * lets a chasing wolf find the way round. `body.cliffPinned` counts the seconds refused; past
 * `CLIFF.escape` the climb is let through at `CLIFF.scramble` m/s of rise.
 */
export function cliffStep(terrain, body, nx, nz, dt, { sure = 0, feet = null } = {}, out = [0, 0]) {
  const fx = body.x, fz = body.z;
  out[0] = nx; out[1] = nz;
  if (climbable(terrain, nx, nz, fx, fz, sure, feet)) {
    // free for a moment: the escape clock runs down (a single clear frame mid-climb does not reset it)
    body.cliffFree = (body.cliffFree || 0) + dt;
    if (body.cliffFree > 0.4) { body.cliffPinned = 0; body.cliffClimb = 0; }
    return out;
  }
  body.cliffFree = 0;
  body.cliffPinned = (body.cliffPinned || 0) + dt;
  if (body.cliffPinned >= CLIFF.escape) {
    /**
     * Scrambling: the body earns `scramble` metres of climb a second, and takes the step once it
     * has earned the step's rise. Earned, not scaled: the steepest part of a face is near-vertical
     * (a round-21 crease drops six metres in a few centimetres), so a step cut down to "climb no
     * faster than" still went up the whole wall the frame it crossed that line. A wall of any
     * steepness now takes its height over `scramble` seconds.
     */
    body.cliffClimb = (body.cliffClimb || 0) + CLIFF.scramble * dt;
    const base = Math.max(terrain.heightAt(fx, fz), feet ?? -Infinity);
    const rise = terrain.heightAt(nx, nz) - base;
    if (rise <= body.cliffClimb) { body.cliffClimb -= Math.max(0, rise); return out; }
    out[0] = fx; out[1] = fz;
    return out;
  }
  // keep the part of the step that runs along the face
  const n = terrain.normalAt(nx, nz, CLIFF.sample, nrmScratch);
  const hl = Math.hypot(n[0], n[2]);
  if (hl > 1e-6) {
    const ux = -n[0] / hl, uz = -n[2] / hl;          // uphill
    const sx = nx - fx, sz = nz - fz;
    const up = sx * ux + sz * uz;
    if (up > 0) {
      const ax = fx + sx - up * ux, az = fz + sz - up * uz;
      if (climbable(terrain, ax, az, fx, fz, sure, feet)) { out[0] = ax; out[1] = az; return out; }
    }
  }
  out[0] = fx; out[1] = fz;
  return out;
}

/**
 * A body standing ON a face slides back off it, down the terrain's normal — the terraform-aware
 * `normalAt`, so a face that has been edited slides the way it is drawn. Not while it is escaping
 * (that is the climb it was granted), and not when it is up on a deck or a roof over the slope.
 * Returns true when it moved the body.
 */
export function cliffSlide(terrain, body, dt, { sure = 0, feet = null } = {}) {
  if ((body.cliffPinned || 0) >= CLIFF.escape) return false;
  const ground = terrain.heightAt(body.x, body.z);
  if (feet != null && feet > ground + 0.05) return false;
  const grade = cliffGrade(sure);
  if (steepAt(terrain, body.x, body.z) < grade) return false;
  const n = terrain.normalAt(body.x, body.z, CLIFF.sample, nrmScratch);
  if (!onFace(terrain, body.x, body.z, n, grade)) return false;
  const hl = Math.hypot(n[0], n[2]);
  body.x += (n[0] / hl) * CLIFF.slide * dt;
  body.z += (n[2] / hl) * CLIFF.slide * dt;
  return true;
}

export { CLEARANCE };
