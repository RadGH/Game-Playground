// Turrets: the Engineer's buildings (owner round 2, R2.8). An entity of kind 'turret' on the hero's
// team in its field: it never moves, cannot be pushed or crowd-controlled, shoots the nearest enemy
// in range (combat.js runs the shot like any ranged attacker), can be attacked and destroyed by enemy
// units (movement.js counts it as a defender), and expires after `turret.seconds`.
// How many may stand is `turret.max[rank - 1]`; building past it takes down the oldest.

import { baseEnt, liveEnt, secToTicks } from './state.js';
import { dist2 } from './mathx.js';
import { isHidden } from './traits.js';
import { addStatus } from './statuses.js';

export function turretsOf(state, ownerId) {
  const out = [];
  for (const e of state.ents) if (e.kind === 'turret' && e.owner === ownerId && e.alive && !e._gone) out.push(e);
  return out;
}

/** Build one turret at (x, z) for the plan's `turret` block at this skill rank. */
export function buildTurret(ctx, hero, plan, x, z, rank, weaponHit) {
  const { state } = ctx;
  const T = plan.turret;
  const p = state.players[hero.owner];
  const max = T.max[Math.max(0, Math.min(T.max.length, rank) - 1)] || 1;
  const mine = turretsOf(state, p.id);
  for (let i = 0; i <= mine.length - max; i++) { mine[i]._gone = true; mine[i].alive = false; ctx.emit('remove', { id: mine[i].id, why: 'expired' }); }
  const hp = T.hp + (T.hpPerLevel || 0) * (p.level - 1);
  const e = baseEnt(state, {
    kind: 'turret', type: plan.id, team: hero.team, owner: p.id, field: hero.field,
    x, z, face: hero.face, r: T.radius || 0.7, hp, hpMax: hp, armour: 'heavy', dmgType: T.dmgType || hero.dmgType,
    _spd: 0, _range: T.range, _atkEvery: secToTicks(T.attackEvery), _atkAt: state.tick + 10,
    _dps: weaponHit * T.mult / T.attackEvery, _traits: ['unstoppable'], _until: state.tick + secToTicks(T.seconds),
  });
  ctx.emit('spawn', { id: e.id, kind: 'turret', unit: plan.id, team: e.team, field: e.field });
  return e;
}

/** Turret thinking: the nearest visible enemy inside its range (sets target / _wantAttack). */
export function turretThink(ctx, e) {
  const { state } = ctx;
  e._wantAttack = false; e._vx = 0; e._vz = 0;
  let t = liveEnt(state, e.target);
  const reach = e._range + 1;
  if (!t || t.team === e.team || dist2(e.x, e.z, t.x, t.z) > reach * reach) {
    t = null;
    let bd = reach * reach;
    for (const o of state.ents) {
      if (!o.alive || o._gone || o.field !== e.field || o.team === e.team || o.kind === 'hero' || o.kind === 'pet' || o.kind === 'turret' || isHidden(o, e.x, e.z)) continue;
      const d = dist2(e.x, e.z, o.x, o.z);
      if (d < bd) { bd = d; t = o; }
    }
  }
  e.target = t ? t.id : -1;
  if (t) e._wantAttack = true;
  return t;
}

/** Expiry, once per tick. */
export function turretTick(ctx) {
  const { state } = ctx;
  for (const e of state.ents) {
    if (e.kind !== 'turret' || e._gone || !e.alive || state.tick < e._until) continue;
    e._gone = true; e.alive = false;
    ctx.emit('remove', { id: e.id, why: 'expired' });
  }
}

/** Field Repair: turrets within radius regain `share` of their health; the hero `self`. */
export function repair(ctx, hero, R) {
  const r2 = R.radius * R.radius;
  for (const e of turretsOf(ctx.state, hero.owner)) {
    if (dist2(e.x, e.z, hero.x, hero.z) > r2) continue;
    const h = Math.min(e.hpMax - e.hp, e.hpMax * R.share);
    if (h > 0) { e.hp += h; ctx.emit('heal', { src: hero.id, dst: e.id, amount: Math.round(h * 10) / 10 }); }
  }
  if (R.self) { const h = Math.min(hero.hpMax - hero.hp, hero.hpMax * R.self); if (h > 0) { hero.hp += h; ctx.emit('heal', { src: hero.id, dst: hero.id, amount: Math.round(h * 10) / 10 }); } }
}

/** Overcharge: a buff on every turret the hero owns. */
export function buffTurrets(ctx, hero, plan) {
  const B = plan.turretBuff;
  for (const e of turretsOf(ctx.state, hero.owner)) addStatus(ctx, e, plan.id, { ticks: secToTicks(B.seconds), src: hero.id, buff: { damage: B.damage || 0, attackSpeed: B.attackSpeed || 0 } });
}
