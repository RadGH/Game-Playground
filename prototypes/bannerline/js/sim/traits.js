// Unit traits (data/units.json `traits`). Every trait id used in units.json has behaviour here;
// tests/dead-data.test.js checks each one changes the sim.
//
//   pack       several bodies per purchase (data only: `bodies`; leak split across them)
//   flying     ignores the ford (movement.js)
//   guard      allies within 4 m behind it take 30% less pierce damage
//   heal       heals allies within 8 m for 3% of their max HP a second
//   hardened   the first hit every 3 s deals half damage
//   enrage     +50% damage below 40% HP
//   rise       comes back once at 50% HP
//   feast      heals 30% of max HP on a kill
//   bleed      hits stack Bleed on the hero (2% max HP over 4 s, up to 3 stacks)
//   pounce     leaps 8 m onto the hero when it first gets in range (movement.js calls tryPounce)
//   raise      raises a Shambler every 6 s
//   champion   escort within 10 m deals +20% damage and takes 1/1.2 damage; announced at the gate
//   pack_call  howls a Wolf Pair every 12 s
//   ward        takes 30% less damage from hero skills
//   unstoppable immune to stun, root, slow, knockback, pull and taunt (statuses.js / skills.js ask)
//   volatile    bursts on death: heroes and pets within 3 m take a quarter of its max HP
//   regrow      regrows 1.5% of max HP a second
//   shred       its hits strip 3 armour from the hero for 6 s (stacks to 5)
//   split       dies into two of its `splitInto` unit (summoned: no bounty, no drops)
//   stealth     a hero only notices it within 3 m (movement.js / the AI ask isHidden)

import { dist2 } from './mathx.js';
import { secToTicks } from './state.js';
import { addStatus } from './statuses.js';
import { spawnSummon } from './economy.js';

export const TRAIT_IDS = ['pack', 'flying', 'guard', 'heal', 'hardened', 'enrage', 'rise', 'feast', 'bleed', 'pounce', 'raise', 'champion', 'pack_call',
  'ward', 'unstoppable', 'volatile', 'regrow', 'shred', 'split', 'stealth'];

export const K = {
  guardRange: 4, guardCut: 0.3,
  healRange: 8, healPct: 0.03,
  hardenedEvery: 3, hardenedCut: 0.5,
  enrageBelow: 0.4, enrageBonus: 0.5,
  riseHp: 0.5,
  feastHeal: 0.3,
  bleedPct: 0.02, bleedSeconds: 4, bleedMax: 3,
  pounceRange: 8,
  raiseEvery: 6, raiseUnit: 'shambler',
  champRange: 10, champBonus: 0.2,
  callEvery: 12, callUnit: 'wolf_pair',
  wardCut: 0.3, burstRange: 3, burstShare: 0.25, regrowPct: 0.015, shredArmor: 3, shredSeconds: 6, shredMax: 5, splitCount: 2, stealthRange: 3,
};
export const CC_IMMUNE = ['stun', 'root', 'slow', 'taunt'];

const has = (e, t) => e._traits.indexOf(t) >= 0;
export { has as hasTrait };

function champNear(ctx, e) {
  if (has(e, 'champion')) return false;
  const r2 = K.champRange * K.champRange;
  for (const o of ctx.state.ents) if (o !== e && o.alive && !o._gone && o.team === e.team && o.field === e.field && o._traits.indexOf('champion') >= 0 && dist2(o.x, o.z, e.x, e.z) <= r2) return true;
  return false;
}

/** Outgoing basic-attack factor for a unit. */
export function unitDamageFactor(ctx, a) {
  let f = 1;
  if (has(a, 'enrage') && a.hp < a.hpMax * K.enrageBelow) f *= 1 + K.enrageBonus;
  if (champNear(ctx, a)) f *= 1 + K.champBonus;
  return f;
}

/** Incoming damage factor for a unit (after the type table). */
export function incomingTraitFactor(ctx, dst, src, dmgType, opts = {}) {
  let f = 1;
  const { state } = ctx;
  if (opts.skill && has(dst, 'ward')) f *= 1 - K.wardCut;
  if (has(dst, 'hardened') && state.tick - dst._hardAt >= secToTicks(K.hardenedEvery)) { dst._hardAt = state.tick; f *= K.hardenedCut; }
  if (dmgType === 'pierce') {
    const r2 = K.guardRange * K.guardRange;
    for (const o of state.ents) {
      if (o === dst || !o.alive || o._gone || o.team !== dst.team || o.field !== dst.field || o._traits.indexOf('guard') < 0) continue;
      if (o.z >= dst.z && dist2(o.x, o.z, dst.x, dst.z) <= r2) { f *= 1 - K.guardCut; break; }
    }
  }
  if (champNear(ctx, dst)) f /= 1 + K.champBonus;
  return f;
}

export function onUnitHurt(ctx, e) { /* enrage is read live in unitDamageFactor */ }

/** Returns true if the unit cheats death. */
export function beforeUnitDeath(ctx, e) {
  if (has(e, 'rise') && !e._rose) {
    e._rose = true;
    e.hp = e.hpMax * K.riseHp;
    e.statuses.length = 0;
    ctx.emit('revive', { id: e.id });
    return true;
  }
  return false;
}

export function onUnitKilled(ctx, killer, victim) {
  if (killer.kind !== 'hero' && has(killer, 'feast') && killer.alive) {
    const h = Math.min(killer.hpMax - killer.hp, killer.hpMax * K.feastHeal);
    if (h > 0) { killer.hp += h; ctx.emit('heal', { src: killer.id, dst: killer.id, amount: Math.round(h * 10) / 10 }); }
  }
}

/** Is `e` hidden from a hero standing at (x, z)? (stealth) */
export function isHidden(e, x, z) {
  return e._traits.indexOf('stealth') >= 0 && dist2(e.x, e.z, x, z) > K.stealthRange * K.stealthRange && !e.statuses.some(s => s.id === 'revealed');   // Far Sight (powers.js)
}

/** Immune to crowd control (unstoppable)? */
export function ccImmune(e) { return e._traits && e._traits.indexOf('unstoppable') >= 0; }

/** A unit has just died: volatile bursts, split bodies. */
export function onUnitDeath(ctx, e) {
  const { state } = ctx;
  if (has(e, 'volatile')) {
    const r2 = K.burstRange * K.burstRange, amount = e.hpMax * K.burstShare;
    ctx.emit('pulse', { id: e.id, skill: 'volatile', x: e.x, z: e.z, radius: K.burstRange });
    for (const o of state.ents) {
      if (!o.alive || o._gone || o.field !== e.field || o.team === e.team || (o.kind !== 'hero' && o.kind !== 'pet' && o.kind !== 'turret')) continue;
      if (dist2(o.x, o.z, e.x, e.z) <= r2) ctx.dealDamage(ctx, null, o, amount, e.dmgType, { trait: 'volatile' });
    }
  }
  if (has(e, 'split')) {
    const uid = ctx.data.units.units[e.type].splitInto;
    for (let i = 0; i < K.splitCount; i++) spawnSummon(ctx, { ...e, x: e.x + (i ? 0.7 : -0.7), z: e.z + 0.3 }, uid);
  }
}

/** A unit hit a hero (basic attack). */
export function onHitHero(ctx, src, hero) {
  if (src.kind !== 'hero' && has(src, 'shred')) addStatus(ctx, hero, 'shred', { ticks: secToTicks(K.shredSeconds), stacks: 1, maxStacks: K.shredMax, src: src.id });
  if (src.kind !== 'hero' && has(src, 'bleed')) {
    addStatus(ctx, hero, 'bleed', { ticks: secToTicks(K.bleedSeconds), stacks: 1, maxStacks: K.bleedMax, power: hero.hpMax * K.bleedPct / K.bleedSeconds, src: src.id });
  }
}

/** Periodic traits, once per tick. */
export function traitTick(ctx) {
  const { state } = ctx;
  const second = state.tick % 20 === 0;
  const n = state.ents.length;
  for (let i = 0; i < n; i++) {
    const e = state.ents[i];
    if (!e.alive || e._gone || !e._traits.length) continue;
    if (second && has(e, 'heal')) {
      const r2 = K.healRange * K.healRange;
      for (const o of state.ents) {
        if (!o.alive || o._gone || o.team !== e.team || o.field !== e.field || o.kind === 'hero' || o.hp >= o.hpMax) continue;
        if (dist2(o.x, o.z, e.x, e.z) > r2) continue;
        const h = Math.min(o.hpMax - o.hp, o.hpMax * K.healPct);
        o.hp += h;
        ctx.emit('heal', { src: e.id, dst: o.id, amount: Math.round(h * 10) / 10 });
      }
    }
    if (second && has(e, 'regrow') && e.hp < e.hpMax) e.hp = Math.min(e.hpMax, e.hp + e.hpMax * K.regrowPct);
    if (has(e, 'raise') && state.tick - e._timerA >= secToTicks(K.raiseEvery)) {
      e._timerA = state.tick;
      spawnSummon(ctx, e, K.raiseUnit);
    }
    if (has(e, 'pack_call') && state.tick - e._timerB >= secToTicks(K.callEvery)) {
      e._timerB = state.tick;
      spawnSummon(ctx, e, K.callUnit);
    }
  }
}

/** Pounce: leap onto the target hero the first time it is within range. Returns true if it leapt. */
export function tryPounce(ctx, e, hero) {
  if (!has(e, 'pounce') || e._pounced) return false;
  const d2 = dist2(e.x, e.z, hero.x, hero.z);
  if (d2 > K.pounceRange * K.pounceRange) return false;
  e._pounced = true;
  const d = Math.sqrt(d2) || 1, stop = e.r + hero.r + 0.2;
  const fx = e.x, fz = e.z;
  e.x = hero.x - (hero.x - e.x) / d * stop;
  e.z = hero.z - (hero.z - e.z) / d * stop;
  ctx.emit('knock', { id: e.id, fromX: fx, fromZ: fz, toX: e.x, toZ: e.z });
  return true;
}
