// Adapter over Farhold's pure affix helpers (prototypes/farhold/js/affixes.js), PLAN §7.3.
//
// The Farhold functions default their rng argument to Math.random, which would desync a lockstep
// match. This adapter is the ONLY way the sim reaches them and it REQUIRES the sim's rng: calling
// without one throws. tests/sim-purity.test.js follows this import and allows Farhold's file one
// exception: the `rng = Math.random` default parameters the adapter never lets fire.
//
// Bannerline's affix rows (data/items-bl.json) use their own ids and percent units, so Farhold's
// per-id tuning tables do not apply to them: what is reused is the tier ladder (an affix rolled on a
// higher item level rolls bigger) and the rounding.

import { rollAffixValue, tierFor, tierMult, roundFor } from '../../../../farhold/js/affixes.js';
import { next } from '../rng.js';

/** Roll one affix value for an item of `ilvl` with the sim rng stream `stream`. */
export function rollAffix(def, ilvl, stream, cap) {
  if (!stream) throw new Error('rollAffix needs the sim rng stream (no Math.random in the sim)');
  const v = rollAffixValue(def, ilvl, () => next(stream));
  return cap != null && v > cap ? cap : v;
}

/** The tier an item level sits in (name + multiplier), for item cards. */
export function affixTier(ilvl) { const t = tierFor(ilvl); return { name: t.name, mult: tierMult(ilvl) }; }

export { roundFor };
