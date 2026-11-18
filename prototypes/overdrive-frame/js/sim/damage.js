// Damage: types, resistances, critical hits in tiers, and status effects. ONE place turns a hit into a number, so the
// item card, the damage numbers and the rules always agree (lessons rule 33: each multiplier applied in one place).

export const DAMAGE_TYPES = ['kinetic', 'energy', 'explosive', 'fire', 'electric'];
export const DAMAGE_NAMES = { kinetic: 'Kinetic', energy: 'Energy', explosive: 'Explosive', fire: 'Fire', electric: 'Electric' };

/**
 * Critical tiers (past 100% chance, crits crit again): a chance of 2.3 is always tier 2, and tier 3 30% of the time.
 * Each tier adds the crit multiplier's bonus again: tier 0 = 1×, tier 1 = critMult, tier 2 = 1 + 2 × (critMult − 1)…
 * @returns {{ tier: number, mult: number }}
 */
export function rollCrit(r, chance, critMult) {
  const c = Math.max(0, chance);
  const tier = Math.floor(c) + (r.next() < c - Math.floor(c) ? 1 : 0);
  return { tier, mult: 1 + tier * (critMult - 1) };
}

/** The average damage multiplier from crits at this chance (for item cards: "about 2.6× with crits"). */
export const critAverage = (chance, critMult) => 1 + Math.max(0, chance) * (critMult - 1);

/** Resistance is a fraction per type (0.5 = takes half; negative = weak to it). Armour soaks a flat share of kinetic +
 *  explosive only, so energy weapons are the answer to heavy armour. */
export function mitigate(amount, dtype, target) {
  const res = target.resist?.[dtype] ?? 0;
  let n = amount * (1 - res);
  if ((dtype === 'kinetic' || dtype === 'explosive') && target.armour) n *= 100 / (100 + target.armour);
  if (target.status?.corrode > 0) n *= 1.25;
  return Math.max(0, n);
}

/** Status effects a damage type can leave behind (chance per hit set by the weapon's `status` value). */
export const STATUS_OF = { fire: 'burn', electric: 'shock', energy: null, kinetic: null, explosive: null };
export const STATUS = {
  burn: { label: 'Burning', time: 3, dps: 0.12 },          // dps × the hit's damage, per second
  shock: { label: 'Shocked', time: 0.8 },                   // can't move or attack (bosses: slowed instead)
  corrode: { label: 'Corroded', time: 5 },                  // takes 25% more damage
  slow: { label: 'Slowed', time: 2, mul: 0.6 },             // round 5: spore gas — a mech moves at mul × speed (mech.js)
};

/** Put a status on a target (longer time wins; burn keeps the stronger tick). */
export function addStatus(target, id, hitDamage = 0) {
  target.status ||= {};
  const s = STATUS[id]; if (!s) return;
  target.status[id] = Math.max(target.status[id] || 0, s.time);
  if (id === 'burn') target.burnDps = Math.max(target.burnDps || 0, hitDamage * s.dps);
}

/** Tick statuses down; returns burn damage taken this step. */
export function tickStatus(target, dt) {
  if (!target.status) return 0;
  let burn = 0;
  for (const k in target.status) {
    if (target.status[k] <= 0) continue;
    if (k === 'burn') burn += (target.burnDps || 0) * Math.min(dt, target.status[k]);
    target.status[k] = Math.max(0, target.status[k] - dt);
    if (k === 'burn' && target.status[k] === 0) target.burnDps = 0;
  }
  return burn;
}

export const isStunned = t => (t.status?.shock || 0) > 0 && !t.boss;
