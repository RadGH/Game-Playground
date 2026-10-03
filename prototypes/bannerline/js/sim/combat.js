// Damage, death and basic attacks.
//
// dealDamage is the ONE place damage lands: type-vs-armour table (data/damage.json), hero armour
// reduction (armor / (armor + 40)), status factors, unit traits (guard, hardened, champion escort),
// hero self-buffs (Iron Resolve), then death. Everything else (skills, DoTs, projectiles, traits)
// calls it.

import { q1, dist2 } from './mathx.js';
import { liveEnt, addTimer } from './state.js';
import { takenFactor, damageFactor, attackSpeedFactor, isStunned } from './statuses.js';
import { onUnitHurt, onUnitKilled, unitDamageFactor, incomingTraitFactor, beforeUnitDeath, onHitHero } from './traits.js';
import { payKill } from './economy.js';
import { heroDied, heroArmor, weaponHit, heroDamageFactor, heroPlayer } from './heroes.js';
import { pulseAround, applyStatus } from './skills.js';
import { gearStats, onBasicHit, lootForKill } from './items.js';
import { addStatus } from './statuses.js';
import { next } from './rng.js';

const PROJ_SPEED = 20;   // m/s for ranged unit shots

export function typePct(data, dmgType, armour) {
  const row = data.damage.pct[dmgType];
  return row && row[armour] != null ? row[armour] / 100 : 1;
}

/**
 * Apply damage from src (may be null) to dst.
 * opts: { raw } skip the type table (DoTs already typed when applied? no: raw = skip table+armor),
 *       { skill } for events, { dot }.
 * Returns damage actually dealt.
 */
export function dealDamage(ctx, src, dst, amount, dmgType, opts = {}) {
  const { state, data } = ctx;
  if (!dst || !dst.alive || dst._gone || !(amount > 0)) return 0;
  let dmg = amount;
  if (!opts.raw) {
    // Oil (PLAN §5.2): half of a hero's damage becomes the oil's type
    const oil = src && src.kind === 'hero' ? state.players[src.owner].oil : null;
    dmg *= oil ? 0.5 * typePct(data, dmgType, dst.armour) + 0.5 * typePct(data, oil, dst.armour) : typePct(data, dmgType, dst.armour);
  }
  dmg *= takenFactor(dst);
  if (dst.kind === 'hero') {
    if (!opts.raw) { const a = heroArmor(ctx, dst); dmg *= 1 - a / (a + 40); }
    dmg *= heroResist(ctx, dst);
    const ra = gearStats(data, heroPlayer(ctx, dst)).resistAll;
    if (ra) dmg *= 1 - ra / 100;
  } else {
    if (src && src.kind === 'hero' && dst._traits.indexOf('champion') >= 0) {
      const vc = gearStats(data, heroPlayer(ctx, src)).vsChampion;
      if (vc) dmg *= 1 + vc / 100;
    }
    dmg *= incomingTraitFactor(ctx, dst, src, dmgType);
  }
  if (!(dmg > 0)) return 0;
  dst.hp -= dmg;
  dst._lastHurt = state.tick;
  ctx.emit('hit', { src: src ? src.id : -1, dst: dst.id, amount: q1(dmg), dmgType, crit: !!opts.crit, skill: opts.skill || null });
  if (dst.kind === 'hero') { if (src && !opts.dot) onHitHero(ctx, src, dst); heroHurtBuffs(ctx, dst, src); }
  else {
    onUnitHurt(ctx, dst);
    // a unit hit by a hero turns on it (if the hero's engage slots allow): ranged heroes outrange unit
    // aggro, and without this the whole wave would walk past them
    if (src && src.kind === 'hero' && dst.target < 0 && !opts.dot) dst._aggroBy = src.id;
  }
  if (dst.hp <= 0) kill(ctx, dst, src);
  return dmg;
}

// Iron Resolve style: resist per nearby foe
function heroResist(ctx, hero) {
  let f = 1;
  for (const s of hero.statuses) {
    const rp = s.buff && s.buff.resistPerFoe;
    if (!rp) continue;
    const r2 = rp.radius * rp.radius;
    let n = 0;
    for (const e of ctx.state.ents) if (e.alive && !e._gone && e.team !== hero.team && e.field === hero.field && e.kind !== 'hero' && dist2(e.x, e.z, hero.x, hero.z) <= r2) n++;
    f *= 1 - Math.min(rp.cap, rp.per * n);
  }
  return f;
}

// everyNthHit shockwaves from self-buffs (Iron Resolve)
function heroHurtBuffs(ctx, hero, src) {
  if (!hero.alive) return;
  for (const s of hero.statuses) {
    const ev = s.buff && s.buff.every;
    if (!ev) continue;
    s.stacks++;
    if (s.stacks % ev.hits === 0) pulseAround(ctx, hero, { radius: ev.radius, mult: ev.mult, skill: s.id });
  }
}

/** Kill dst (credited to src). */
export function kill(ctx, dst, src) {
  const { state } = ctx;
  if (dst.kind === 'hero') { heroDied(ctx, dst, src); if (src) onUnitKilled(ctx, src, dst); return; }
  if (beforeUnitDeath(ctx, dst)) return;   // e.g. `rise` brought it back
  dst.hp = 0;
  dst.alive = false;
  dst._gone = true;
  dst.act = 'dead'; dst.actTick = state.tick;
  ctx.emit('death', { id: dst.id, killer: src ? src.id : -1, x: dst.x, z: dst.z });
  ctx.emit('remove', { id: dst.id, why: 'killed' });
  payKill(ctx, dst, src);
  lootForKill(ctx, dst);
  if (src) onUnitKilled(ctx, src, dst);
}

/** Can a attack b from where it stands? */
export function inReach(a, b, range) {
  const r = range + a.r + b.r;
  return dist2(a.x, a.z, b.x, b.z) <= r * r;
}

/** Run basic attacks for every entity that has a target in reach. */
export function runAttacks(ctx) {
  const { state, data } = ctx;
  for (const a of state.ents) {
    if (!a.alive || a._gone || a.target < 0 || a._wantAttack !== true) continue;
    if (isStunned(a)) continue;
    const t = liveEnt(state, a.target);
    if (!t) { a.target = -1; continue; }
    if (!inReach(a, t, a._range)) continue;
    if (state.tick < a._atkAt) continue;
    const asp = a.kind === 'hero' ? 1 + gearStats(data, heroPlayer(ctx, a)).attackSpeed / 100 : 1;
    const every = Math.max(4, Math.round(a._atkEvery / (attackSpeedFactor(a, data) * asp)));
    a._atkAt = state.tick + every;
    a.act = 'attack'; a.actTick = state.tick;
    let amount, type = a.dmgType, crit = false;
    if (a.kind === 'hero') {
      amount = weaponHit(ctx, a) * heroDamageFactor(ctx, a);
      const g = gearStats(data, heroPlayer(ctx, a));
      if (g.critChance > 0 && next(state.rng.combat) * 100 < g.critChance) { crit = true; amount *= 1.5 + g.critDamage / 100; }
    }
    else amount = a._dps * (a._atkEvery / 20) * a._mk * damageFactor(a) * unitDamageFactor(ctx, a);
    const ranged = a._range > 3;
    ctx.emit('attack', { src: a.id, dst: t.id, ranged });
    if (ranged) {
      const d = Math.sqrt(dist2(a.x, a.z, t.x, t.z));
      const ticks = Math.max(1, Math.round(d / PROJ_SPEED * 20));
      ctx.emit('shot', { src: a.id, dst: t.id, dmgType: type, ticks });
      addTimer(state, state.tick + ticks, 'proj', { src: a.id, dst: t.id, amount, type, crit, basic: a.kind === 'hero' });
    } else {
      const dealt = dealDamage(ctx, a, t, amount, type, { crit });
      if (a.kind === 'hero') heroBasicHit(ctx, a, t, dealt, type);
    }
  }
}

// a hero's basic attack landed: life steal (blade / pierce only), unique powers
function heroBasicHit(ctx, hero, target, dealt, type) {
  if (!hero.alive) return;
  const g = gearStats(ctx.data, heroPlayer(ctx, hero));
  if (g.lifeSteal > 0 && dealt > 0 && (type === 'blade' || type === 'pierce')) {
    const h = Math.min(hero.hpMax - hero.hp, dealt * g.lifeSteal / 100);
    if (h > 0) { hero.hp += h; ctx.emit('heal', { src: hero.id, dst: hero.id, amount: Math.round(h * 10) / 10 }); }
  }
  onBasicHit(ctx, hero, target, { applyStatus, addStatus, pulseAround, weaponHit });
}

/** Timer handler for projectiles. */
export function projectileLands(ctx, args) {
  const t = liveEnt(ctx.state, args.dst);
  if (!t) return;
  const src = liveEnt(ctx.state, args.src);
  const dealt = dealDamage(ctx, src, t, args.amount, args.type, { crit: !!args.crit });
  if (args.basic && src && src.kind === 'hero') heroBasicHit(ctx, src, t, dealt, args.type);
}

