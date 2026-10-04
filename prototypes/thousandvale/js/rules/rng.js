// Thousandvale — seeded random numbers and the room clock. Nothing under js/rules/ may touch
// Math.random or Date.now (tests/C/purity.test.mjs greps for it): every roll comes from a stream
// that is named and seeded, so a fight replays bit-for-bit from (seed, inputs).
//
// The generator is Emberveil's mulberry32 (`makeRng`), the same one Farhold's EnemyField uses, so a
// parity fixture can hand both sides the same seed and expect the same dice.

import { makeRng, hashStr } from './farhold.js';

export { makeRng };

/**
 * A family of independent streams off one seed: `streams.get('combat')`, `streams.get('loot')`.
 * A stream's seed is `hash(seed:name)`, so adding a new stream never shifts an existing one.
 */
export function createStreams(seed = 1) {
  const made = new Map();
  return {
    seed,
    get(name) {
      let r = made.get(name);
      if (!r) { r = makeRng(hashStr(`${seed}:${name}`)); made.set(name, r); }
      return r;
    },
  };
}

/** A clock a room advances itself. `now()` is seconds since the room opened. */
export function createClock(start = 0) {
  let t = start;
  return {
    now: () => t,
    advance(dt) { t += dt; return t; },
    set(v) { t = v; },
  };
}
