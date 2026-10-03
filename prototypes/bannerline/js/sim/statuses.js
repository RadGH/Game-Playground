// Statuses on entities: { id, until, stacks, power, src, buff? }.
//   dot (burn, bleed): power = damage per second PER STACK, ticks every 10 ticks
//   slow: power = slow fraction; quarry: power = extra damage taken; might: power = damage bonus
//   stun / root: no power; taunt: src = who the unit must attack
//   hero self-buffs use the skill id as the status id and carry the skill's selfBuff block in `buff`

import { dealDamage } from './combat.js';
import { liveEnt } from './state.js';

const DOT_EVERY = 10;

export function statusDef(data, id) { return data.heroes.statuses[id] || null; }

export function findStatus(e, id) {
  for (const s of e.statuses) if (s.id === id) return s;
  return null;
}

/** Add or refresh a status. opts: { ticks, stacks (add), maxStacks, power, src, buff } */
export function addStatus(ctx, e, id, opts) {
  if (!e.alive || e._gone) return null;
  // unstoppable units shrug off crowd control (traits.js)
  if (e._traits && e._traits.indexOf('unstoppable') >= 0 && (id === 'stun' || id === 'root' || id === 'slow' || id === 'taunt')) return null;
  const until = ctx.state.tick + Math.max(1, opts.ticks | 0);
  let s = findStatus(e, id);
  if (s) {
    if (until > s.until) s.until = until;
    if (opts.stacks) s.stacks = Math.min(opts.maxStacks || 1, s.stacks + opts.stacks);
    if (opts.power != null && opts.power > s.power) s.power = opts.power;
    if (opts.src != null) s.src = opts.src;
    if (opts.buff) s.buff = opts.buff;
    return s;
  }
  s = { id, until, stacks: opts.stacks ? Math.min(opts.maxStacks || 1, opts.stacks) : 1, power: opts.power ?? 0, src: opts.src ?? -1 };
  if (opts.buff) s.buff = opts.buff;
  e.statuses.push(s);
  ctx.emit('status', { id: e.id, status: id, on: true });
  return s;
}

export function removeStatus(ctx, e, id) {
  const i = e.statuses.findIndex(s => s.id === id);
  if (i >= 0) { e.statuses.splice(i, 1); ctx.emit('status', { id: e.id, status: id, on: false }); }
}

/** Expire statuses and tick damage-over-time. */
export function tickStatuses(ctx) {
  const { state } = ctx;
  for (const e of state.ents) {
    if (!e.alive || e._gone || !e.statuses.length) continue;
    for (let i = 0; i < e.statuses.length; i++) {
      const s = e.statuses[i];
      const def = statusDef(ctx.data, s.id);
      if (def && def.healPerSecond && (state.tick - s.until) % DOT_EVERY === 0 && s.until > state.tick && e.hp < e.hpMax) {
        const h = Math.min(e.hpMax - e.hp, e.hpMax * def.healPerSecond * DOT_EVERY / 20);
        e.hp += h;
        ctx.emit('heal', { src: s.src, dst: e.id, amount: Math.round(h * 10) / 10 });
      }
      if (def && def.kind === 'dot' && (state.tick - s.until) % DOT_EVERY === 0 && s.until > state.tick) {
        const src = liveEnt(state, s.src) || null;
        dealDamage(ctx, src, e, s.power * s.stacks * DOT_EVERY / 20, def.dmgType, { dot: true, raw: true, status: s.id });
        if (!e.alive || e._gone) break;
      }
    }
    if (!e.alive || e._gone) continue;
    for (let i = e.statuses.length - 1; i >= 0; i--) {
      if (e.statuses[i].until <= state.tick) { const id = e.statuses[i].id; e.statuses.splice(i, 1); ctx.emit('status', { id: e.id, status: id, on: false }); }
    }
  }
}

export const isStunned = e => !!findStatus(e, 'stun');
export const isRooted = e => !!findStatus(e, 'root') || !!findStatus(e, 'stun');

/** Move-speed factor from statuses (slows, haste, self-buff movePct). */
export function moveFactor(e, data) {
  let f = 1;
  for (const s of e.statuses) {
    if (s.id === 'slow') f *= 1 - s.power;
    else if (s.id === 'haste') f *= 1 + (data ? data.heroes.statuses.haste.move : 0.2);
    else if (s.buff && s.buff.movePct) f *= 1 + s.buff.movePct;
  }
  return f < 0.1 ? 0.1 : f;
}

/** Outgoing damage factor from statuses. */
export function damageFactor(e) {
  let f = 1;
  for (const s of e.statuses) {
    if (s.id === 'might') f += s.power;
    else if (s.buff && s.buff.damage) f += s.buff.damage;
  }
  return f;
}

/** Attack-speed factor (higher = faster). */
export function attackSpeedFactor(e, data) {
  let f = 1;
  for (const s of e.statuses) {
    if (s.id === 'haste') f += data ? data.heroes.statuses.haste.attackSpeed : 0.3;
    else if (s.buff && s.buff.attackSpeed) f += s.buff.attackSpeed;   // Overcharge
  }
  return f;
}

/** Incoming damage factor from debuffs (quarry, flat self-buff resist). */
export function takenFactor(e) {
  let f = 1;
  for (const s of e.statuses) {
    if (s.id === 'quarry') f *= 1 + s.power;
    else if (s.buff && s.buff.resist) f *= 1 - s.buff.resist;
  }
  return f;
}
