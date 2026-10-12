// Thousandvale — the LEVEL GAP (play-test 1, P26).
//
//   "At level 2, destroyed by (and barely injure) a level 4-5 creature."
//
// Farhold has no level-gap rule at all: a monster's health grows 13% a level and its damage 8.5%
// (balance.json `enemies.perLevel` / `dmgPerLevel`), and nothing else looks at the two levels. A
// pair of crag hyenas two levels up beat a level-2 character five times in six (tests/C/level-gap).
// So Thousandvale softens a SMALL gap: a monster 1-3 levels above you hits you softer and takes more
// from you (data/rules/progression.json `levelGap`); past 3 the last step holds and the monster's own
// curve keeps 4+ hard. A monster below you is Farhold's, unchanged; so is player against player.
//
// It is ONE wrapper round the engine's `rpg.strike`, which every hit in js/rules/ goes through
// (swings, skills, DoT-less strikes, followers, monster bites), so no call site can miss it and none
// applies it twice (the playground's "one multiplier, two owners" lesson). The parity fixtures turn
// it off (`engine.levelGap = null`) — tests/C/parity-kit.mjs — because Farhold has no such rule.

import { strikeMult } from './perk-rules.js';
import { itemStrikeMult } from './buffs.js';

const friendly = u => !!u && (u.kind === 'player' || u.owner != null || u.side === 'friend');
const foe = u => !!u && u.side === 'foe';

/** The multiplier for one hit, or 1. `cfg` = engine.levelGap. */
export function gapMult(cfg, attacker, defender) {
  if (!cfg || !attacker || !defender) return 1;
  const la = attacker.level || 1, ld = defender.level || 1;
  if (friendly(attacker) && foe(defender) && ld > la) return step(cfg.playerDamage, ld - la);
  if (foe(attacker) && friendly(defender) && la > ld) return step(cfg.monsterDamage, la - ld);
  return 1;
}
const step = (list, g) => (Array.isArray(list) && list.length ? list[Math.min(g, list.length - 1)] ?? 1 : 1);

/** Wrap `engine.rpg.strike` once (idempotent). Reads `engine.levelGap` on every hit, so it can be switched. */
export function installLevelGap(engine) {
  const rpg = engine.rpg;
  if (rpg._levelGap) return;
  const strike = rpg.strike;
  rpg._levelGap = true;
  rpg.strike = function levelGapStrike(attacker, defender, rng, opts) {
    // the level gap, and the perk forest's hit rules (js/rules/perk-rules.js) — one place for both
    const k = gapMult(engine.levelGap, attacker, defender) * strikeMult(attacker, defender, opts) * itemStrikeMult(attacker, defender);   // + shop buffs (buffs.js)
    // round 9 (D-UI's damage meter): OVERKILL — Farhold's result carries the whole hit, not what the body had left;
    // the health before the hit is known only here. `result.over` = the part of a killing blow past zero health.
    const before = defender ? (defender.hp ?? defender.maxHp ?? 0) : 0;
    const o = opts || {};
    const res = k === 1 ? strike.call(this, attacker, defender, rng, opts) : strike.call(this, attacker, defender, rng, { ...o, multiplier: (o.multiplier ?? 1) * k });
    if (res && res.dead && res.amount > before && before > 0) res.over = Math.round(res.amount - before);
    // round 9 (found by tests/C/promote): "Burning damage you apply lasts 2s longer" (and every other `statusLonger`
    // power) was only asked for statuses that land through landStatus — a skill that STACKS its status (Firebolt's burn:
    // Farhold's skillmech addStacks, inside the strike) never asked, so the card was true for a wand and false for the
    // pyromancer's own bolt. The stack's clock is lengthened here, once per hit, never past its base length + the bonus.
    const stack = o.rules && o.rules.stack;
    if (stack && res && res.mech && res.mech.stacked && attacker && attacker.equipment && engine.tvGear) {
      const st = defender.statuses && defender.statuses[stack.status], spec = engine.statuses[stack.status] || {};
      const longer = st ? this.fx.sum(attacker, 'statusLonger', { type: stack.status, spec }) : 0;
      if (longer > 0) st.remaining = Math.min(st.remaining + longer, (spec.seconds || 4) + longer);
    }
    return res;
  };
}
