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
    const k = gapMult(engine.levelGap, attacker, defender) * strikeMult(attacker, defender, opts);
    if (k === 1) return strike.call(this, attacker, defender, rng, opts);
    const o = opts || {};
    return strike.call(this, attacker, defender, rng, { ...o, multiplier: (o.multiplier ?? 1) * k });
  };
}
