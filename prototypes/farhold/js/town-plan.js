// Farhold — what a town is made of, and how it is laid out.
//
// Split out of `js/features.js` for the same reason `js/dungeon-plan.js` and `js/water-plan.js`
// were: this is a catalogue and some arithmetic with no Three.js in it, so `node --test` can check
// that every building a town wants is a real building, that each one is solid, and that a small
// settlement drops the right things when it runs out of room.
//
// The geometry lives in `features.js`; the FACTS about each building live here.

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
};

/** The twelve added in round 8, for the tests and the docs. */
export const NEW_BUILDINGS = [
  'forge', 'inn', 'market', 'granary', 'chapel', 'barracks',
  'stable', 'mill', 'warehouse', 'watchpost', 'shrine', 'gatehouse',
];

/**
 * What a settlement of this size wants, in the order it gets built.
 *
 * The order is the design: whatever runs out of plots first is what a small town does without, so
 * the trades are at the top and the ornaments are at the bottom. A hamlet gets a granary and a
 * shrine; a city gets everything.
 */
export function wantsFor(size = 1) {
  const order = ['forge', 'inn', 'granary', 'chapel', 'stable', 'warehouse', 'barracks', 'mill', 'watchpost', 'shrine'];
  return order.filter(key => size >= (BUILDING_INFO[key]?.from ?? 0));
}

/**
 * The street skeleton of a settlement: how many streets radiate from the square, and how long.
 *
 * Kept here so a test can check that a bigger settlement really does get a bigger plan without
 * standing up a renderer.
 */
export function streetPlan(size = 1, ring = 30, rng = Math.random) {
  const count = Math.max(2, Math.min(6, 2 + size));
  const streets = [];
  for (let i = 0; i < count; i++) {
    streets.push({
      heading: (i / count) * Math.PI * 2 + rng() * 0.5,
      bend: (rng() - 0.5) * 0.35,
      length: (ring + 6) * (0.65 + rng() * 0.5),
    });
  }
  return streets;
}

/** How wide a settlement's footprint is, which is also where its quiet ground starts. */
export function footprintOf(size = 1) {
  const ring = 16 + size * 13;
  const wall = size >= 4 ? ring + 14 : ring;
  return { ring, wall, walled: size >= 4 };
}
