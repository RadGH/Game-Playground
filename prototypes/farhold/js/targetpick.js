/**
 * Round 28 — WHICH ENEMY THE TARGET BAR SHOWS.
 *
 *   "Farhold often shows the wrong enemy's health bar."
 *
 * Round 16 made the bar read `aim()`'s hitscan, which was the right idea with the wrong question.
 * `EnemyField.hitScan` answers "what would a shot fired down this line hit FIRST" — so it takes the
 * nearest body along the ray whose centre is within `1.1 + reach * 0.3` METRES of it (1.7 m for an
 * ordinary 2 m reach). A fixed width in metres is a cone that is enormous close to the camera: a
 * wolf five metres out and 1.6 m to the side of the crosshair (about 18 degrees off) counted as
 * "under the reticle", and because the nearest one wins, it beat the champion the crosshair was
 * actually sitting on twenty metres further down the same line. That is right for an arrow, which
 * really would clip the wolf first. It is wrong for "what am I looking at".
 *
 * And when nothing was under the reticle for 1.4 s, the bar fell back to `field.target()`, a flat
 * guess from the player's feet by facing and distance — which ignored the enemy you were actually
 * hitting, so in melee (where the over-the-shoulder crosshair is often not on the body you are
 * swinging at) the bar swapped to whichever neighbour was more in front of you.
 *
 * This module is pure (no Three.js, no DOM) so node tests can drive it.
 *
 *   lookedAt(enemies, ray)   the body the crosshair is ON: inside its silhouette wins (the front one
 *                            if two overlap), otherwise the one the smallest ANGLE away, within a
 *                            small slack. Distance along the ray only breaks ties.
 *   chooseTarget(state, …)   looked-at > the one you were just looking at (1.4 s) > the one you last
 *                            hit (4 s) > the old facing guess.
 */

/** How long the bar keeps the thing you were looking at after the crosshair slips off it. */
export const LOOK_STICK = 1.4;
/** How long the thing you last hit keeps the bar when you are not looking at anything. */
export const STRUCK_STICK = 4;
/** Angular slack past a body's silhouette that still counts as "on it", in radians (~2.3 deg). */
export const LOOK_SLACK = 0.04;

/** Where a body's middle is: the same point `EnemyField.land` puts a hit number. */
export function bodyCentreY(e) {
  return (e.y || 0) + 0.9 * (e.scale || 1) + (e.hover || 0);
}

/** How wide a body is seen, in metres: its own radius, never less than a slim person. */
export function bodyRadius(e) {
  return Math.max(0.45, (e.bodyR || 0.6) * (e.scale || 1));
}

const alive = e => e && e.dying == null && !e.removed && !(e.hp <= 0);

/**
 * The enemy the crosshair is on, or null.
 *
 * `ray` is { x, y, z, dx, dy, dz, range } with a unit direction. `range` should stop at the ground
 * the crosshair meets (plus a little, since a body stands ON that ground), so nothing behind a hill
 * is picked.
 */
export function lookedAt(enemies, ray, { slack = LOOK_SLACK } = {}) {
  const { x, y, z, dx, dy, dz, range = 260 } = ray;
  let best = null, bestMiss = Infinity, bestT = Infinity;
  for (const e of enemies || []) {
    if (!alive(e)) continue;
    const ex = e.x - x, ey = bodyCentreY(e) - y, ez = e.z - z;
    const t = ex * dx + ey * dy + ez * dz;
    if (t < 0.5 || t > range) continue;
    const off = Math.hypot(ex - dx * t, ey - dy * t, ez - dz * t);
    // how far OUTSIDE the silhouette the crosshair is, as an angle; 0 = on the body
    const miss = Math.max(0, off - bodyRadius(e)) / t;
    if (miss > slack) continue;
    if (miss < bestMiss - 1e-9 || (Math.abs(miss - bestMiss) <= 1e-9 && t < bestT)) {
      best = e; bestMiss = miss; bestT = t;
    }
  }
  return best;
}

/** The enemy the player's side hit most recently, if that was within `maxAge` seconds. */
export function lastStruck(enemies, clock, { maxAge = STRUCK_STICK, near = null, maxDistance = 40 } = {}) {
  let best = null;
  for (const e of enemies || []) {
    if (!alive(e) || !(e.struckAt != null) || clock - e.struckAt > maxAge) continue;
    if (near && Math.hypot(e.x - near.x, e.z - near.z) > maxDistance) continue;
    if (!best || e.struckAt > best.struckAt) best = e;
  }
  return best;
}

/**
 * One frame of the target bar's choice. `state` is { unit, for } and is kept between frames.
 *
 *   looked   what the crosshair is on this frame (lookedAt)
 *   struck   () => the enemy you last hit (lastStruck), asked only when needed
 *   guess    () => the old facing/distance guess, asked only when needed
 */
export function chooseTarget(state, { looked = null, struck = null, guess = null, dt = 0 } = {}) {
  if (alive(looked)) {
    state.unit = looked; state.for = LOOK_STICK;
    return looked;
  }
  if (state.for > 0) {
    state.for -= dt;
    if (state.for > 0 && alive(state.unit)) return state.unit;
  }
  state.unit = null; state.for = 0;
  const hit = typeof struck === 'function' ? struck() : struck;
  if (alive(hit)) return hit;
  const g = typeof guess === 'function' ? guess() : guess;
  return alive(g) ? g : null;
}
