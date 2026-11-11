// The damage model (ruling 41) and threat (ruling 42). Pure: every function takes its rng.
//   hit check (level gap, vanilla-WoW style) -> dodge -> block -> armour or resist -> crit -> threat
// Units: chances and resists are WHOLE percentage points everywhere (12 = 12%), the same as data/affixes.json.
export const DAMAGE_TYPES = ['physical', 'fire', 'frost', 'storm', 'poison', 'shadow'];
export const RESIST_CAP = 75;
export const GCD = 1.5;               // seconds (ruling 3)
export const CRIT_MULT = 1.5;

/** A same-level normal monster's numbers; the bestiary scales from these (hp 1.0 = this). Tuned so a level-L
 *  Wanderer with a level-L weapon kills one in ~6-10 swings (docs/ITEMS.md) and a pack of 3-6 is a real fight. */
export function monsterBaseline(L) {
  const weaponDps = 4 + 1.5 * L + 0.02 * L * L;
  return {
    hp: Math.round(weaponDps * 6.5 + 6),                       // ~7-9 weapon swings; skills make it fewer
    dmg: +(1.8 + 1.0 * L + 0.02 * L * L).toFixed(1),          // per hit, ~1 hit every 2 s
    armour: Math.round(8 + 6 * L),
    attackSpeed: 0.5,
  };
}

/** Fraction of physical damage armour stops against an attacker of `attackerLevel` (cap 75%). */
export const armourReduction = (armour, attackerLevel) => Math.min(0.75, Math.max(0, armour) / (Math.max(0, armour) + 10 * attackerLevel + 50));
export const resistReduction = (pct, penalty = 0) => Math.min(RESIST_CAP, Math.max(-100, pct - penalty)) / 100;

/** Chance to land a hit (whole points). Level-gap rule: 95% against your own level (spells 96%), -3 a level above you,
 *  never below 50; +1 a level below you, never above 99. */
export function hitChance(attackerLevel, defenderLevel, spell = false) {
  const gap = defenderLevel - attackerLevel, base = spell ? 96 : 95;
  return gap > 0 ? Math.max(50, base - 3 * gap) : Math.min(99, base - gap);
}

/**
 * One blow. a/d = { level, crit, dodge, block: { chance, amount } | null, armour, resists: { fire.. } , resistPenalty }
 * opts = { amount, type, spell, canDodge, canBlock, noCrit, critBonus }
 * -> { result: 'miss'|'dodge'|'block'|'hit'|'crit', amount, mitigated }
 */
export function resolveHit(a, d, opts, rng) {
  const { type = 'physical', spell = false } = opts;
  if (rng() * 100 >= hitChance(a.level, d.level, spell)) return { result: spell ? 'resist' : 'miss', amount: 0, mitigated: 0 };
  if (!spell && opts.canDodge !== false && rng() * 100 < (d.dodge || 0)) return { result: 'dodge', amount: 0, mitigated: 0 };
  let amount = Math.max(0, opts.amount), result = 'hit', blocked = 0;
  if (!spell && opts.canBlock !== false && d.block && rng() * 100 < d.block.chance) { blocked = Math.min(amount, d.block.amount); amount -= blocked; result = 'block'; }
  if (!opts.noCrit && result !== 'block' && rng() * 100 < (a.crit || 0) + (opts.critBonus || 0)) { amount *= CRIT_MULT; result = 'crit'; }
  const red = type === 'physical' ? armourReduction(d.armour || 0, a.level) : resistReduction(d.resists?.[type] || 0, d.resistPenalty || 0);
  const after = amount * (1 - red);
  return { result, amount: Math.max(result === 'block' && after < 0.5 ? 0 : 1, Math.round(after)), mitigated: Math.round(amount - after + blocked) };
}

// ---- threat (light, ruling 42) ----------------------------------------------------------------------------------------
export const THREAT = { damage: 1, healing: 0.5, taunt: 1.3 };
/** Add threat; table is a Map(id -> number). */
export const addThreat = (table, id, n) => table.set(id, (table.get(id) || 0) + n);
/** A taunt puts the taunter 30% above whoever was on top. */
export function taunt(table, id) { let top = 0; for (const v of table.values()) top = Math.max(top, v); table.set(id, Math.max(table.get(id) || 0, top * THREAT.taunt + 10)); }
/** Who a monster should hit: top threat, but only switch to a new target once it beats the current by 10% in melee
 *  (30% at range), so monsters don't ping-pong. */
export function pickTarget(table, current, alive, ranged = false) {
  let best = null, bestV = -1;
  for (const [id, v] of table) { if (!alive(id)) continue; if (v > bestV) { best = id; bestV = v; } }
  if (current && alive(current) && table.has(current) && best !== current) {
    if (bestV < table.get(current) * (ranged ? 1.3 : 1.1)) return current;
  }
  return best;
}
