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
import { heroDied, heroArmor, weaponHit, heroDamageFactor } from './heroes.js';
import { pulseAround } from './skills.js';

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
  if (!opts.raw) dmg *= typePct(data, dmgType, dst.armour);
  dmg *= takenFactor(dst);
  if (dst.kind === 'hero') {
    if (!opts.raw) { const a = heroArmor(ctx, dst); dmg *= 1 - a / (a + 40); }
    dmg *= heroResist(ctx, dst);
  } else {
    dmg *= incomingTraitFactor(ctx, dst, src, dmgType);
  }
  if (!(dmg > 0)) return 0;
  dst.hp -= dmg;
  dst._lastHurt = state.tick;
  ctx.emit('hit', { src: src ? src.id : -1, dst: dst.id, amount: q1(dmg), dmgType, crit: false, skill: opts.skill || null });
  if (dst.kind === 'hero') { if (src && !opts.dot) onHitHero(ctx, src, dst); heroHurtBuffs(ctx, dst, src); }
  else onUnitHurt(ctx, dst);
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
    const every = Math.max(4, Math.round(a._atkEvery / attackSpeedFactor(a)));
    a._atkAt = state.tick + every;
    a.act = 'attack'; a.actTick = state.tick;
    let amount, type = a.dmgType;
    if (a.kind === 'hero') amount = weaponHit(ctx, a) * heroDamageFactor(ctx, a);
    else amount = a._dps * (a._atkEvery / 20) * a._mk * damageFactor(a) * unitDamageFactor(ctx, a);
    const ranged = a._range > 3;
    ctx.emit('attack', { src: a.id, dst: t.id, ranged });
    if (ranged) {
      const d = Math.sqrt(dist2(a.x, a.z, t.x, t.z));
      const ticks = Math.max(1, Math.round(d / PROJ_SPEED * 20));
      ctx.emit('shot', { src: a.id, dst: t.id, dmgType: type, ticks });
      addTimer(state, state.tick + ticks, 'proj', { src: a.id, dst: t.id, amount, type });
    } else {
      dealDamage(ctx, a, t, amount, type);
      if (a.kind === 'hero') heroBasicHit(ctx, a, t);
    }
  }
}

function heroBasicHit(ctx, hero, target) { /* M3+: on-hit effects (Quarry, uniques) */ }

/** Timer handler for projectiles. */
export function projectileLands(ctx, args) {
  const t = liveEnt(ctx.state, args.dst);
  if (!t) return;
  const src = liveEnt(ctx.state, args.src);
  dealDamage(ctx, src, t, args.amount, args.type);
}

