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
  speed: { capPct: 40, floorPct: -50, ranged: true, staff: true, caster: true },
  sight: { step: 0.5, skip: 0.6, ttl: 2 },
  knockInterrupt: { normal: 0.6, champion: 0.3, rare: 0.2, boss: 0, minPush: 0.5 },
  dummy: { hpMult: 400, resetSec: 3, reference: 'road_brigand' },
  wanderer: { hpMult: 0.5, dmgMult: 2, playerM: 40, noticeM: 12, leashM: 25, respawnSec: 45, savedBelow: 0.35, helpedShare: 0.2, quietSec: 4 },
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
  return 1 / (1 + hastePct(cfg, ch) / 100);
}
/** Y7: the rate multiplier of a basic attack of `kind` made while moving (1 = no change). Never above 1, never 0. */
export function movingPace(engine, kind = 'melee') {
  const v = engine?.combatCfg?.moving?.[kind];
  return Number.isFinite(v) && v > 0 ? Math.min(1, v) : 1;
}

/** How a weapon attacks, as js/rules/cast.js names it: 'staff' | 'bolt' | 'arrow' | 'melee'. */
export const kindOfWeapon = w => (isStaff(w) ? 'staff' : (w?.castElement && w?.ranged) ? 'bolt' : w?.ranged ? 'arrow' : 'melee');

/** Seconds between two basic attacks of a weapon by its own pattern, before any attack speed. `style` = its caster style row. */
export function baseEvery(item, { style = null } = {}) {
  if (!item || item.type !== 'weapon') return strikeAt(null, 0)?.every ?? 0.46;
  if (item.noAttack) return null;
  if (isStaff(item)) return 0.28;                              // rpg.js swingPlanFor: a staff's `afterCast`
  const rp = item.ranged && item.weaponCategory !== 'magic' ? rangedPlan(item) : null;
  if (rp?.kind === 'draw') return (rp.full ?? 0.95) + 0.12;     // draw to the nock + afterShot (cast.js draws to FULL for a click)
  const n = Math.max(1, profileOf(item)?.pattern?.length || 1);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += strikeAt(item, i)?.every ?? 0.6;
  return (sum / n) * (style?.pace ?? 1);
}
/** Attacks per second of a weapon alone (its card): null for something that does not attack (an orb, a shield). */
export function weaponAps(item, { style = null } = {}) {
  const e = baseEvery(item, { style });
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
