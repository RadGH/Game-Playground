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

export { CLEARANCE };
