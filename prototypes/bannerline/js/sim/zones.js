// Ground zones ("pools"): lingering areas left by skills (Burning Line, Slow Burner, Cinder Stride's
// trail). Plain data in state.zones: { id, owner, team, field, x, z, radius, length, face, until,
// every, nextAt, amount, dmgType, slow, skill }. A zone with length > 0 is a capsule: a segment of
// that length centred on (x, z) running along direction `face`, with `radius` as its half-width. It deals `amount` every `every` ticks to enemies of `team` inside it.

import { dist2, sin, cos } from './mathx.js';
import { liveEnt, secToTicks } from './state.js';
import { addStatus } from './statuses.js';
import { dealDamage } from './combat.js';
import { trapTick } from './skills.js';

const ZONE_EVERY = 10;

/** Distance squared from point to the zone's core (circle centre or capsule segment). */
export function zoneDist2(z, x, zz) {
  if (!z.length) return dist2(z.x, z.z, x, zz);
  const hx = sin(z.face) * z.length / 2, hz = cos(z.face) * z.length / 2;
  const ax = z.x - hx, az = z.z - hz, bx = z.x + hx, bz = z.z + hz;
  const vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz;
  let t = L2 > 0 ? ((x - ax) * vx + (zz - az) * vz) / L2 : 0;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  return dist2(ax + vx * t, az + vz * t, x, zz);
}

export function inZone(z, e) { const r = z.radius + e.r; return zoneDist2(z, e.x, e.z) <= r * r; }

/** opts: { owner (hero ent), x, z, radius, length?, face?, seconds, perSecond (damage per second), dmgType, slow?, skill } */
export function addZone(ctx, o) {
  const { state } = ctx;
  const z = {
    id: state.nextZone++, owner: o.owner.id, team: o.owner.team, field: o.owner.field,
    x: o.x, z: o.z, radius: o.radius, length: o.length || 0, face: o.face || 0,
    until: state.tick + secToTicks(o.seconds), every: ZONE_EVERY, nextAt: state.tick + ZONE_EVERY,
    amount: (o.perSecond || 0) * ZONE_EVERY / 20, dmgType: o.dmgType, slow: o.slow || 0, skill: o.skill || null,
  };
  state.zones.push(z);
  ctx.emit('zone', { zone: z.id, x: z.x, z: z.z, radius: z.radius, length: z.length, face: z.face, ticks: z.until - state.tick, skill: z.skill, dmgType: z.dmgType });
  return z;
}

export function zoneTick(ctx) {
  const { state } = ctx;
  if (!state.zones.length) return;
  for (const z of state.zones) {
    if (state.tick >= z.until) continue;
    if (z.kind === 'trap') { trapTick(ctx, z); continue; }
    if (state.tick < z.nextAt) continue;
    z.nextAt += z.every;
    const src = liveEnt(state, z.owner);
    for (const e of state.ents) {
      if (!e.alive || e._gone || e.field !== z.field || e.team === z.team || !inZone(z, e)) continue;
      if (z.amount > 0) dealDamage(ctx, src, e, z.amount, z.dmgType, { skill: z.skill, dot: true });
      if (z.slow && e.alive && !e._gone) addStatus(ctx, e, 'slow', { ticks: z.every + 2, power: z.slow, src: z.owner });
    }
  }
  if (state.zones.some(z => z.until <= state.tick)) {
    for (const z of state.zones) if (z.until <= state.tick) ctx.emit('zoneEnd', { zone: z.id });
    state.zones = state.zones.filter(z => z.until > state.tick);
  }
}
