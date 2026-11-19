// Damage: types, resistances, critical hits in tiers, and status effects. ONE place turns a hit into a number, so the
// item card, the damage numbers and the rules always agree (lessons rule 33: each multiplier applied in one place).

export const DAMAGE_TYPES = ['kinetic', 'energy', 'explosive', 'fire', 'electric', 'cryo', 'void'];
export const DAMAGE_NAMES = { kinetic: 'Kinetic', energy: 'Energy', explosive: 'Explosive', fire: 'Fire', electric: 'Electric', cryo: 'Cryo', void: 'Void' };
// round 7: cryo chills (three chills close together freeze), void ignores resistances and front armour and tugs

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
  const res = dtype === 'void' ? 0 : target.resist?.[dtype] ?? 0;      // void ignores resistances
  let n = amount * (1 - res);
  if ((dtype === 'kinetic' || dtype === 'explosive') && target.armour) n *= 100 / (100 + target.armour);
  if (target.status?.corrode > 0) n *= 1.25;
  return Math.max(0, n);
}

/** Status effects a damage type can leave behind (chance per hit set by the weapon's `status` value). */
export const STATUS_OF = { fire: 'burn', electric: 'shock', energy: null, kinetic: null, explosive: null, cryo: 'chill', void: 'rift' };
/** Cryo and void always leave their status (at least this chance per hit) — the element is the point of the weapon. */
export const STATUS_FLOOR = { cryo: 0.6, void: 0.5 };
export const STATUS = {
  burn: { label: 'Burning', time: 3, dps: 0.12 },          // dps × the hit's damage, per second
  shock: { label: 'Shocked', time: 0.8 },                   // can't move or attack (bosses: slowed instead)
  corrode: { label: 'Corroded', time: 5 },                  // takes 25% more damage
  slow: { label: 'Slowed', time: 2, mul: 0.6 },             // round 5: spore gas — a mech moves at mul × speed (mech.js)
  chill: { label: 'Chilled', time: 3, mul: 0.6, stacks: 3, gap: 0.25 },   // round 7 cryo: moves and attacks at mul × speed;
  frozen: { label: 'Frozen', time: 1.5, immune: 2 },        // `stacks` chills (at most one per `gap` s) → frozen: can't move or attack
  rift: { label: 'Rift', time: 0.6, pull: 1.4 },            // round 7 void: tugged toward the hit point at `pull` tiles/s (bosses never)
};

/** Something that can't be frozen or tugged: bosses, rival aces / frames (mechs), structures. */
const heavy = t => !!(t.boss || t.parts || t.ace || t.weapons || t.structure);

/** A status from a hit, with the element rules (chill stacking into frozen, the rift point). hx/hz = where it landed. */
export function applyElement(target, id, now, hitDamage = 0, hx = target.x, hz = target.z) {
  target.status ||= {};
  if (id === 'chill') {
    if (target.weapons) { addStatus(target, 'slow'); return; }            // a frame (versus, a rival ace): slowed like spore gas
    const C = STATUS.chill;
    if ((target.chillAt ?? -9) > now - C.gap) { target.status.chill = C.time; return; }
    if ((target.chillAt ?? -9) < now - C.time) target.chillN = 0;          // stacks only count inside the chill's time
    target.chillAt = now; target.chillN = (target.chillN || 0) + 1; target.status.chill = C.time;
    target.look = (target.look | 0) | LOOK.chill;
    if (target.chillN >= C.stacks && !heavy(target) && (target.frozenUntil ?? -9) + STATUS.frozen.immune < now) {
      target.status.frozen = STATUS.frozen.time; target.frozenUntil = now + STATUS.frozen.time; target.chillN = 0; target.justFroze = true;
      target.look |= LOOK.frozen;
    }
    return;
  }
  if (id === 'rift') { if (heavy(target)) return; target.status.rift = STATUS.rift.time; target.riftX = hx; target.riftZ = hz; target.look = (target.look | 0) | LOOK.rift; return; }
  addStatus(target, id, hitDamage);
}

/** Put a status on a target (longer time wins; burn keeps the stronger tick). */
export function addStatus(target, id, hitDamage = 0) {
  target.status ||= {};
  const s = STATUS[id]; if (!s) return;
  target.status[id] = Math.max(target.status[id] || 0, s.time);
  if (id === 'burn') target.burnDps = Math.max(target.burnDps || 0, hitDamage * s.dps);
}

/** Status look bits (the renderer and co-op snapshots read target.look): what is on it right now. */
export const LOOK = { chill: 1, frozen: 2, rift: 4, burn: 8, shock: 16, corrode: 32 };

/** Tick statuses down; returns burn damage taken this step. Also keeps target.look (status bits) current. */
export function tickStatus(target, dt) {
  if (!target.status) return 0;
  let burn = 0, look = 0;
  for (const k in target.status) {
    if (target.status[k] <= 0) continue;
    if (k === 'burn') burn += (target.burnDps || 0) * Math.min(dt, target.status[k]);
    target.status[k] = Math.max(0, target.status[k] - dt);
    if (k === 'burn' && target.status[k] === 0) target.burnDps = 0;
    if (target.status[k] > 0) look |= LOOK[k] || 0;
  }
  target.look = look;
  return burn;
}

export const isStunned = t => ((t.status?.shock || 0) > 0 || (t.status?.frozen || 0) > 0) && !t.boss;
/** Movement and attack speed share from statuses (shock halves, chill slows). */
export const slowOf = t => ((t.status?.shock || 0) > 0 ? 0.5 : 1) * ((t.status?.chill || 0) > 0 ? STATUS.chill.mul : 1);
