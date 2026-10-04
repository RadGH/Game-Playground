// Thousandvale — the ONE door into Farhold's shared formula modules (PLAN §6.1).
//
// Every number in a Thousandvale fight comes from Farhold's own code, imported here by path and
// never copied: `rpg.strike`, the skill plans, the talent trees, the statuses, the affixes, the
// uniques, the weapon patterns. If Farhold changes a rule, Thousandvale changes with it, and the
// parity fixtures in tests/C/ go red if the forked orchestration (js/rules/cast.js,
// js/rules/monster-ai.js) stops agreeing with it.
//
// Rules for this file:
//   * import only modules that load in plain Node (no Three.js, no DOM). tests/C/purity.test.mjs
//     checks it, and checks that nothing else under js/rules/ imports a Farhold path directly.
//   * never edit a Farhold file. Anything Thousandvale needs that Farhold lacks is a fork in
//     js/rules/, or is injected into data in memory at load (as Farhold itself does).

const F = '../../../farhold/js/';

export {
  Rpg, attuneWeapon, elementOf, statusOf, setLevelCap, levelCap, xpForLevel, levelFromXp,
  MAX_LEVEL, eventXp, displayName, itemScore,
} from '../../../farhold/js/rpg.js';

export {
  createSkillBar, applyStatus, tickStatuses, slowOf, buffsOf, outgoingFrom, incomingFrom,
  STATUS_POWER_SHARE, ELEMENT_STATUS, effectiveMult, setStatusFx, setStatusPulse, setStatusExpire,
  describeSkill,
} from '../../../farhold/js/skills.js';

export {
  world as mechWorld, setMechEnv, mechEnv, resetWorld, untargetable, crossesWall, blocksRanged,
  placeObject, tickPlaced, addCorpse, takeCorpses, addWall, tickWalls, controlFor, isRooted,
  isAsleep, isSilenced, CAPS as MECH_CAPS, ringsFor, gainResource, resourceOf,
  statusRef, queue as queueMech, formOf, repeatsOf, statusStatsKey,
} from '../../../farhold/js/skillmech.js';

export {
  strikeAt, withArea, handsOf as weaponHands, OFFHAND_DAMAGE, isStaff, isWand, isRangedWeapon,
  traitsOf, wandBehaviour, staffSpell, tuneWeapons, meleeSpanOf, swingTiming, profileOf,
  chargeAt, drawPower, chargedForm, rangedPlan, STAFF_CHARGE,
} from '../../../farhold/js/weapons.js';

export { feel, tuneFeel, staggerFor, pushFor, COMBAT_FEEL, PUSH_RESIST } from '../../../farhold/js/combat-feel.js';
export { installUniques } from '../../../farhold/js/uniques.js';
export { EFFECTS } from '../../../farhold/js/effects.js';
export { installFoci } from '../../../farhold/js/foci.js';
export { talentPlan, pickTalent, tiersOpen, treeFor } from '../../../farhold/js/skilltalents.js';
export { groundAt, wetAt, cliffStep, climbable } from '../../../farhold/js/ground.js';
export { makeRng, hashStr } from '../../../emberveil/js/rng.js';

/** Where Farhold lives, relative to this file — for the drift guard and the data loader. */
export const FARHOLD_JS = F;
export const FARHOLD_DATA = '../../../farhold/data/';
export const EMBERVEIL_DATA = '../../../emberveil/data/';
