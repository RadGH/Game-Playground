// Oathwild — the ONE door into Farhold, Emberveil and Thousandvale's rules (ARCH.md "Layout").
//
// Every number Oathwild borrows comes through here, imported by path and never copied: Farhold's
// character sheet + strike maths (`Rpg`), its statuses (`applyStatus` / `tickStatuses`), its weapon
// timing, its affix tiers; Emberveil's seeded dice; Thousandvale's threat table and hand rules; and
// the shared number formatter. tests/rules/drift.test.mjs pins the numbers Oathwild depends on, so a
// change in one of those games cannot silently change Oathwild.
//
// Rules for this file:
//   * import only modules that load in plain Node (no three.js, no DOM) — tests/rules/purity.test.mjs
//   * never edit a Farhold / Emberveil / Thousandvale file (live games use them). Anything Oathwild
//     needs that they lack is written in js/rules/, or laid over their data in memory at load.

export { Rpg, displayName, itemScore, describeAffix } from '../../../farhold/js/rpg.js';

export {
  applyStatus, tickStatuses, slowOf, buffsOf, outgoingFrom, incomingFrom,
  effectiveMult, cooldownPower, STATUS_POWER_SHARE, ELEMENT_STATUS, TICK_EVERY,
} from '../../../farhold/js/skills.js';

export {
  swingTiming, strikeAt, rangedPlan, isRangedWeapon, oneHanded, OFFHAND_DAMAGE, profileOf, RANGED, SHOT_REACH,
} from '../../../farhold/js/weapons.js';

export { itemLevelFor, requirementFor, tierFor, AFFIX_TIERS, rollAffixValue } from '../../../farhold/js/affixes.js';

export { makeRng, hashStr } from '../../../emberveil/js/rng.js';

export {
  addThreat, threatFromHeal, pickTarget, taunt as tauntThreat, clearThreat, notice as noticeThreat, threatRows, forget as forgetThreat, THREAT,
} from '../../../thousandvale/js/rules/threat.js';

export { handOf, handText } from '../../../thousandvale/js/rules/hands.js';

export { fmt, hp as fmtHp, pct as fmtPct, pctOf as fmtPctOf, sign as fmtSign, range as fmtRange, secs as fmtSecs, hasLongDecimal } from '../../../../shared/format.js';

/** Where the borrowed data lives, relative to this file (js/rules/data.js reads these). */
export const FARHOLD_DATA = '../../../farhold/data/';
export const EMBERVEIL_DATA = '../../../emberveil/data/';
export const THOUSANDVALE_DATA = '../../../thousandvale/data/rules/';
