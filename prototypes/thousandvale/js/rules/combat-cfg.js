// Thousandvale — its own COMBAT KNOBS (owner feedback 10: Y7 moving attacks, Y9 one number a swing, Y26 attack speed,
// Y10 walls, Y12 knock interrupts, Y17 dummies, Y21 wilderness fighters). Pure.
//
// data/rules/combat.json holds the numbers; this file validates them once (engine boot) and answers the three
// questions about a basic attack's CLOCK that used to be worked out in three places with three answers:
//   * hasteK       how much shorter the sheet's attack speed makes one attack (capped — Y26)
//   * movingPace   the rate multiplier while the attacker is moving (Y7; 1 = full rate)
//   * attack rate  attacks per second of a weapon alone (an item card) and of a character (the sheet, the slot-0 card)
// js/rules/cast.js applies exactly these, so a card, the sheet row and the real cadence cannot disagree.
//
// A parity engine has no `engine.combatCfg`: Farhold's own clock runs and nothing here is consulted.

import { strikeAt, profileOf, rangedPlan, isStaff, weaponHands, STAFF_CHARGE } from './farhold.js';

const num = (v, d) => (Number.isFinite(+v) ? +v : d);

export const COMBAT_DEFAULTS = Object.freeze({
  melee: { foldSplash: true },
  moving: { melee: 1, arrow: 1, bolt: 1, staff: 1, form: 1 },
  speed: { capPct: 40, floorPct: -50, ranged: true, staff: true, caster: true, basicPace: 1 },
  // owner #37 (2026-10-15): what a skill is worth against a basic attack — `damage` multiplies every skill's damage share
  // (its hits, repeats, zones, pools and the burns it lays), never a basic attack, a follower or a heal
  skills: { damage: 1 },
  sight: { step: 0.5, skip: 0.6, ttl: 2 },
  knockInterrupt: { normal: 0.6, champion: 0.3, rare: 0.2, boss: 0, minPush: 0.5 },
  dummy: { hpMult: 400, resetSec: 3, reference: 'road_brigand' },
  wanderer: { hpMult: 0.5, dmgMult: 2, playerM: 40, noticeM: 12, leashM: 25, respawnSec: 45, savedBelow: 0.35, helpedShare: 0.2, quietSec: 4 },
  // round 11 Z62: the dagger. Farhold's back-stab (x2.2 + a bleed) was counted when the target FACED you; here every
  // dagger hit gets `edgePct` more, and one from behind — more than `backDeg` degrees from where the target looks, the
  // same test a skill's "from behind" bonus uses — gets `backstabPct` more on top and makes it bleed (js/rules/field.js)
  dagger: { edgePct: 120, backstabPct: 50, backDeg: 100 },
  // play-test 12 (#75, owner: "the enemies only ever walk … I can just kite them forever"): how fast a monster CLOSES on
  // what it fights (js/rules/monster-ai.js chaseSpeed) — only while that quarry is moving AWAY from it faster than `movingAbove`
  // m/s and more than `gapAbove` m outside its reach (a player who stands, or walks in, to fight meets the pack as before). Its bestiary speed is its stroll; chasing it runs at
  // `chaseMul` x that, kept inside [chaseMin, chaseMax] (never slower than the bestiary speed). Some monsters SPRINT (champions do not: a pack's leader sprinting at a lone ranger lost tests/C/packs-balance) —
  // by role (`sprintRoles`), kind (`sprintKinds`) or rank (`sprintRanks`): a burst at `sprintSpeed` for `sprintSec`,
  // at most once every `sprintEverySec`, when it is more than `sprintGap` m outside its reach. The player runs at 8.1
  // and auto-attacks on the move at 0.70 of that (movement.js MOVE.fight): a runner who stops attacking pulls away from
  // nearly everything, a kiter does not, and a sprinter closes the gap now and then.
  pursuit: { movingAbove: 2, gapAbove: 3, chaseMul: 1.35, chaseMin: 4.2, chaseMax: 5.8, sprintSpeed: 9.2, sprintSec: 1.8, sprintEverySec: 8, sprintGap: 5, sprintRoles: ['skirmisher'], sprintKinds: [], sprintRanks: ['rare', 'boss'] },
  // owner #2 / #61 (2026-10-15): a weapon's damage share by family, and the melee guard (js/rules/attributes.js)
  families: {
    heavy: { damagePct: 18, guardPct: 15, oneHandGuardPct: 10 },
    light: { damagePct: 18, guardPct: 10, oneHandGuardPct: 10 },
    magic: { damagePct: 18, guardPct: 10, oneHandGuardPct: 10 },
  },
});

/** Validate + fill combat.json once. Null when the file is absent (the caller then keeps Farhold's behaviour). */
export function buildCombatCfg(cfg) {
  if (!cfg || typeof cfg !== 'object') return null;
  const out = {};
  for (const [k, d] of Object.entries(COMBAT_DEFAULTS)) {
    const row = cfg[k] && typeof cfg[k] === 'object' ? cfg[k] : {};
    out[k] = {};
    for (const [f, dv] of Object.entries(d)) out[k][f] = typeof dv === 'number' ? num(row[f], dv) : (row[f] ?? dv);
  }
  return out;
}

/** The sheet's attack speed in percent, inside the cap (Y26). */
export function hastePct(cfg, ch) {
  const h = ch?.derived?.haste || 0;
  return Math.max(cfg?.speed?.floorPct ?? -50, Math.min(cfg?.speed?.capPct ?? 40, h));
}
/**
 * The factor one attack's clock is multiplied by: 1 / (1 + attack speed). With no knobs (a parity engine) it is
 * Farhold's own `derived.attackEvery / balance.attackEvery`, which is the same formula without the cap.
 */
export function hasteK(engine, ch) {
  const cfg = engine?.combatCfg;
  const base = engine?.balance?.player?.attackEvery ?? 0.62;
  if (!cfg) return (ch?.derived?.attackEvery ?? base) / base;
  return basicPace(engine) / (1 + hastePct(cfg, ch) / 100);
}
/**
 * Owner #37 (2026-10-15): "weapon attacks are slower (all weapons attack very, very fast)". Every basic attack's clock —
 * a swing pattern, a bow's draw, a wand's bolt, a staff's tap, a tome — is this many times as long (combat.json
 * `speed.basicPace`); 1 on an engine without the knobs. The same number the card, the sheet and the fight read.
 */
export function basicPace(engine) {
  const v = engine?.combatCfg?.speed?.basicPace;
  return Number.isFinite(v) && v > 0 ? v : 1;
}
/** Y7: the rate multiplier of a basic attack of `kind` made while moving (1 = no change). Never above 1, never 0. */
export function movingPace(engine, kind = 'melee') {
  const v = engine?.combatCfg?.moving?.[kind];
  return Number.isFinite(v) && v > 0 ? Math.min(1, v) : 1;
}

/** How a weapon attacks, as js/rules/cast.js names it: 'staff' | 'bolt' | 'arrow' | 'melee'. */
export const kindOfWeapon = w => (isStaff(w) ? 'staff' : (w?.castElement && w?.ranged) ? 'bolt' : w?.ranged ? 'arrow' : 'melee');

/** Seconds between two basic attacks of a weapon by its own pattern, before any attack speed. `style` = its caster style row. */
export function baseEvery(item, { style = null, pace = 1 } = {}) {
  if (!item || item.type !== 'weapon') return (strikeAt(null, 0)?.every ?? 0.46) * pace;
  if (item.noAttack) return null;
  if (isStaff(item)) return 0.28 * pace;                       // rpg.js swingPlanFor: a staff's `afterCast`
  const rp = item.ranged && item.weaponCategory !== 'magic' ? rangedPlan(item) : null;
  if (rp?.kind === 'draw') return ((rp.full ?? 0.95) + 0.12) * pace;     // draw to the nock + afterShot (cast.js draws to FULL for a click)
  const n = Math.max(1, profileOf(item)?.pattern?.length || 1);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += strikeAt(item, i)?.every ?? 0.6;
  return (sum / n) * (style?.pace ?? 1) * pace;
}
/** Attacks per second of a weapon alone (its card): null for something that does not attack (an orb, a shield). */
export function weaponAps(item, { style = null, pace = 1 } = {}) {
  const e = baseEvery(item, { style, pace });
  return e > 0 ? Math.round(100 / e) / 100 : null;
}
/**
 * Attacks per second of a CHARACTER's hand right now: the weapon's pattern (the plan the sheet derived), the caster
 * style's pace, attack speed inside the cap. `styleOf(item)` answers the caster style row (cast.js passes its own).
 */
export function attackRate(engine, ch, hand = 'main', { styleOf = null } = {}) {
  const hands = weaponHands(ch);
  const w = hand === 'off' ? hands.off : hands.main;
  if (hand === 'off' && (!hands.dual || !w || w.type !== 'weapon' || w.noAttack)) return null;
  const cfg = engine?.combatCfg || null;
  const k = hasteK(engine, ch);
  const kind = kindOfWeapon(w);
  const plan = ch?.derived?.swing?.[hand === 'off' ? 'off' : 'main'];
  const style = styleOf ? styleOf(w) : null;
  let every;
  if (hand !== 'off' && plan?.hold === 'draw') every = ((plan.draw?.full ?? 0.95) + (plan.afterShot ?? 0.12)) * (cfg?.speed?.ranged ? k : 1);
  else if (hand !== 'off' && plan?.hold === 'charge') every = (plan.afterCast ?? 0.28) * (cfg?.speed?.staff ? k : 1);
  else {
    const steps = plan?.steps?.length ? plan.steps : null;
    const n = steps ? steps.length : Math.max(1, profileOf(w)?.pattern?.length || 1);
    let sum = 0;
    for (let i = 0; i < n; i++) sum += (kind === 'arrow' && steps?.[i]?.every ? steps[i].every : strikeAt(w, i)?.every ?? 0.6);
    every = (sum / n) * k * (style?.pace ?? 1);
  }
  return every > 0 ? { every, aps: Math.round(100 / every) / 100, kind } : null;
}
export const apsText = aps => (aps > 0 ? `${+(+aps).toFixed(2)} attack${aps === 1 ? '' : 's'} per second` : '');
export { STAFF_CHARGE };

// ------------------------------------------------------------------------------------------------ the dagger (Z62)

/**
 * Round 11 Z62 — is `attacker` behind `target`? True when the line from the target to the attacker is more than
 * `deg` degrees from where the target looks (`facing`), when the skill's own rules say the hit counts as from behind
 * (`rules.behind`, e.g. Slip Away), or when the target wears a mark that makes every hit count from behind. The same
 * test Farhold's js/skillmech.js `behind()` gives a skill's "more damage from behind", so a card says one thing.
 */
export function isBehind(attacker, target, { deg = 100, rules = null } = {}) {
  if (rules?.behind) return true;
  if (Object.values(target?.statuses || {}).some(st => st?.kind === 'tag' && st.fromBehind)) return true;
  if (attacker?.x == null || target?.x == null) return false;
  const away = Math.atan2(attacker.x - target.x, attacker.z - target.z);
  const delta = Math.abs(((away - (target.facing || 0) + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
  return delta > deg * Math.PI / 180;
}

/** The dagger rule of this engine (`{ edgePct, backstabPct, backDeg }`), or null on a parity engine (Farhold's rule runs). */
export const daggerRule = engine => engine?.combatCfg?.dagger || null;

/** The multiplier one dagger hit gets: `edge` always, x `back` more from behind. */
export function daggerMult(rule, behind) {
  const edge = 1 + (rule.edgePct || 0) / 100;
  return behind ? edge * (1 + (rule.backstabPct || 0) / 100) : edge;
}

/** One card sentence, from the same numbers the fight reads. */
export function daggerText(rule) {
  if (!rule) return '';
  return `Dagger: every hit deals ${Math.round(rule.edgePct)}% more damage. A hit from behind — standing in the ${Math.round(360 - 2 * rule.backDeg)}° wedge at the target's back, or when a skill says its hit counts as from behind — deals ${Math.round(rule.backstabPct)}% more on top and makes the target bleed.`;
}
