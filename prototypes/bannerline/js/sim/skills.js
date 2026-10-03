// The skill runtime (PLAN §6.3), built for lockstep: a cast plan (talents.js) is executed against
// sim state; anything that happens later (repeats, bolts in flight, delayed ground strikes) is a
// timer { atTick, kind, args } and anything that lingers is a zone (zones.js) or a status.
//
// Shapes implemented: melee (arc + reach), around (radius), self, bolt (range, projectiles, spread,
//   splash), ground (point + radius; line {length, width, across}; delay; repeats). Still to come
//   with their heroes: dash, summon, form, place (M6). castSkill throws for an unknown shape, so data
//   can never silently do nothing.
// Effects: damage (mult x weapon hit), status / statuses, stack {status, add, max} + statusMult,
//   knock {push, stagger}, pullIn, taunt, selfBuff (movePct, resist, resistPerFoe, every-nth-hit
//   shockwave, damage), bonusIf crowd, repeats {count, every}, pool (zone), detonate, trail.

import { dist2, faceOf, wrapAngle, clamp, sin, cos } from './mathx.js';
import { secToTicks, addTimer, liveEnt } from './state.js';
import { planFor } from './talents.js';
import { addStatus, statusDef, isStunned, findStatus } from './statuses.js';
import { dealDamage } from './combat.js';
import { weaponHit, heroDamageFactor } from './heroes.js';
import { addZone } from './zones.js';
import { castPowerMult } from './items.js';

export const SHAPES = ['melee', 'around', 'self', 'bolt', 'ground'];
const BOLT_SPEED = 24;   // m/s

export function skillDmgType(data, hero, plan) {
  if (!plan.element || plan.element === 'physical') return hero.dmgType;
  return data.damage.types.includes(plan.element) ? plan.element : hero.dmgType;
}

/** Why the player cannot cast `slot` now, or null. */
export function castRefusal(ctx, p, slot) {
  const { state, data } = ctx;
  if (state.result) return 'over';
  const sk = p.skills.find(s => s.slot === slot);
  if (!sk) return 'bad';
  const hero = liveEnt(state, p.heroEnt);
  if (!hero) return 'dead';
  if (isStunned(hero)) return 'stunned';
  if (sk.rank <= 0) return 'rank';
  if (state.tick < sk.readyAt) return 'cooldown';
  const plan = planFor(data, p, sk.id);
  if (hero.mp < plan.mp) return 'mana';
  return null;
}

/** Can the player learn a rank in `slot`? */
export function learnRefusal(data, p, slot) {
  const sk = p.skills.find(s => s.slot === slot);
  if (!sk) return 'bad';
  if (p.skillPts <= 0) return 'points';
  const R = data.heroes.ranks;
  if (sk.rank >= R.max) return 'maxRank';
  const need = (slot === 'R' ? R.ultLevels : R.basicLevels)[sk.rank];
  if (p.level < need) return 'level';
  return null;
}

/** Apply a status the way skills do (exported for traits and tests). */
export function applyStatus(ctx, hero, e, id, wh, extra = {}) { applyStatusTo(ctx, hero, e, id, wh, extra); }

export function enemiesOf(ctx, hero) {
  const out = [];
  for (const e of ctx.state.ents) if (e.alive && !e._gone && e.field === hero.field && e.team !== hero.team) out.push(e);
  return out;
}

function inCircle(ctx, hero, x, z, radius) {
  const out = [];
  for (const e of enemiesOf(ctx, hero)) { const r = radius + e.r; if (dist2(x, z, e.x, e.z) <= r * r) out.push(e); }
  return out;
}

// distance squared from (px, pz) to the segment a-b
function segDist2(ax, az, bx, bz, px, pz) {
  const vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz;
  let t = L2 > 0 ? ((px - ax) * vx + (pz - az) * vz) / L2 : 0;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  return dist2(ax + vx * t, az + vz * t, px, pz);
}

/** Where a ground skill lands: the aim point clamped to range (and to the field). */
export function groundPoint(ctx, hero, plan, aimX, aimZ) {
  const f = ctx.map.fields[hero.field];
  const range = plan.range || 10;
  let x = aimX, z = aimZ;
  if (x == null || z == null) { x = hero.x + sin(hero.face) * range / 2; z = hero.z + cos(hero.face) * range / 2; }
  const dx = x - hero.x, dz = z - hero.z, d = Math.sqrt(dx * dx + dz * dz);
  if (d > range) { x = hero.x + dx / d * range; z = hero.z + dz / d * range; }
  return { x: clamp(x, f.x0, f.x1), z: clamp(z, f.z0, f.z1) };
}

/** The line a `line` ground skill covers: centre (x,z), direction `face`, half-length. */
function lineOf(hero, plan, x, z) {
  const toward = faceOf(x - hero.x, z - hero.z);
  const face = plan.line.across ? toward + 1.5707963267948966 : toward;
  return { face, half: plan.line.length / 2, width: plan.radius ? plan.radius * 2 : (plan.line.width || 2) };
}

function groundTargets(ctx, hero, plan, x, z) {
  if (!plan.line) return inCircle(ctx, hero, x, z, plan.radius || 2);
  const L = lineOf(hero, plan, x, z);
  const hx = sin(L.face) * L.half, hz = cos(L.face) * L.half;
  const out = [];
  for (const e of enemiesOf(ctx, hero)) {
    const r = L.width / 2 + e.r;
    if (segDist2(x - hx, z - hz, x + hx, z + hz, e.x, e.z) <= r * r) out.push(e);
  }
  return out;
}

function targetsFor(ctx, hero, plan, aimFace) {
  const out = [];
  if (plan.shape === 'around') return inCircle(ctx, hero, hero.x, hero.z, plan.radius);
  if (plan.shape === 'melee') {
    const half = (plan.arc || 1.4) / 2;
    for (const e of enemiesOf(ctx, hero)) {
      const r = (plan.reach || 2) + e.r;
      const d2 = dist2(hero.x, hero.z, e.x, e.z);
      if (d2 > r * r) continue;
      if (d2 < 0.0001) { out.push(e); continue; }
      const a = faceOf(e.x - hero.x, e.z - hero.z);
      if (Math.abs(wrapAngle(a - aimFace)) <= half + 0.15) out.push(e);
    }
  }
  return out;
}

function crowdBonus(plan, hits) {
  let m = 1;
  for (const b of plan.bonusIf || []) {
    const [kind, per, cap] = b.when.split(':');
    if (kind === 'crowd') m *= 1 + Math.min(+cap || 9, +per * Math.max(0, hits - 1));
  }
  return m;
}

function shove(ctx, from, e, metres, away, field) {
  if (e._traits && e._traits.indexOf('unstoppable') >= 0) return;   // traits.js: no knockback or pull
  const dx = e.x - from.x, dz = e.z - from.z;
  const d = Math.sqrt(dx * dx + dz * dz) || 1;
  const move = away ? metres : -Math.min(metres, Math.max(0, d - (from.r || 0) - e.r - 0.3));
  if (!away && move === 0) return;
  const fx = e.x, fz = e.z;
  e.x = clamp(e.x + dx / d * move, field.x0 + e.r, field.x1 - e.r);
  e.z = clamp(e.z + dz / d * move, field.z0 + 0.5, field.z1 - 0.5);
  if (Math.abs(move) > 3) { e.px = e.x; e.pz = e.z; }
  ctx.emit('knock', { id: e.id, fromX: fx, fromZ: fz, toX: e.x, toZ: e.z });
}

/** Burn-style stacking statuses and plain statuses from a plan, on one target. */
function applyPlanStatuses(ctx, hero, plan, e, wh, hits) {
  if (plan.status && plan.shape !== 'self') applyStatusTo(ctx, hero, e, plan.status, wh, { perSecond: plan.statusMult });
  if (plan.stack) applyStatusTo(ctx, hero, e, plan.stack.status, wh, { add: plan.stack.add, max: plan.stack.max, perSecond: plan.statusMult });
  for (const st of plan.statuses || []) if (!st.minCrowd || hits >= st.minCrowd) applyStatusTo(ctx, hero, e, st.id, wh, st);
}

function applyStatusTo(ctx, hero, e, id, wh, extra = {}) {
  const def = statusDef(ctx.data, id);
  if (!def) return;
  const ticks = secToTicks(extra.seconds ?? def.seconds);
  if (def.kind === 'dot') addStatus(ctx, e, id, { ticks, stacks: extra.add || 1, maxStacks: extra.max || def.maxStacks || 1, power: (extra.perSecond ?? def.perSecond) * wh, src: hero.id });
  else if (def.kind === 'slow') addStatus(ctx, e, id, { ticks, power: extra.slow ?? def.slow, src: hero.id });
  else if (def.kind === 'debuff') addStatus(ctx, e, id, { ticks, power: def.takeMore || 0, src: hero.id });
  else addStatus(ctx, e, id, { ticks, src: hero.id });
}

/** detonate: consume part of each target's damage-over-time for `share` of what it had left. */
function detonate(ctx, hero, plan, e) {
  const d = plan.detonate;
  for (const id of d.types || []) {
    const s = findStatus(e, id);
    if (!s || !e.alive || e._gone) continue;
    const left = Math.max(0, s.until - ctx.state.tick) / 20 * s.power * s.stacks;
    const keep = d.keep ?? 0;
    if (keep > 0) s.stacks = Math.min(s.stacks, keep);
    else { s.until = ctx.state.tick; }
    if (left > 0) dealDamage(ctx, hero, e, left * d.share, statusDef(ctx.data, id).dmgType || hero.dmgType, { skill: plan.id, raw: true });
  }
}

/** Apply a plan's hit effects to a list of targets. `from` is where knock/pull is measured from. */
function hitTargets(ctx, hero, plan, targets, from = hero) {
  const { data, map } = ctx;
  const field = map.fields[hero.field];
  const type = skillDmgType(data, hero, plan);
  const wh = weaponHit(ctx, hero);
  if (plan.detonate) for (const e of targets) detonate(ctx, hero, plan, e);
  if (plan.mult) {
    const amount = wh * plan.mult * heroDamageFactor(ctx, hero) * crowdBonus(plan, targets.length);
    for (const e of targets) dealDamage(ctx, hero, e, amount, type, { skill: plan.id });
  }
  for (const e of targets) {
    if (!e.alive || e._gone) continue;
    applyPlanStatuses(ctx, hero, plan, e, wh, targets.length);
    if (plan.knock) {
      if (plan.knock.push) shove(ctx, from, e, plan.knock.push, true, field);
      if (plan.knock.stagger) addStatus(ctx, e, 'stun', { ticks: secToTicks(plan.knock.stagger), src: hero.id });
    }
    if (plan.pullIn && plan.pullIn.metres) shove(ctx, from, e, plan.pullIn.metres, false, field);
  }
}

function poolAt(ctx, hero, plan, x, z, line) {
  const pl = plan.pool;
  if (!pl) return;
  addZone(ctx, {
    owner: hero, x, z, radius: pl.radius || (line ? line.width / 2 : plan.radius || 2), length: line ? line.half * 2 : 0, face: line ? line.face : 0,
    seconds: pl.seconds, perSecond: (pl.power || 0) * weaponHit(ctx, hero) * heroDamageFactor(ctx, hero),
    dmgType: pl.element && ctx.data.damage.types.includes(pl.element) ? pl.element : hero.dmgType, slow: pl.slow || 0, skill: plan.id,
  });
}

/** Cast a skill. Caller already checked castRefusal. */
export function castSkill(ctx, p, slot, aimX, aimZ) {
  const { state, data } = ctx;
  const sk = p.skills.find(s => s.slot === slot);
  const hero = liveEnt(state, p.heroEnt);
  const plan = planFor(data, p, sk.id);
  if (!SHAPES.includes(plan.shape)) throw new Error(`Skill shape "${plan.shape}" has no runtime yet`);
  const pm = castPowerMult(ctx, hero);   // unique powers that empower every Nth cast
  if (pm !== 1 && plan.mult) plan.mult *= pm;
  hero.mp -= plan.mp;
  sk.readyAt = state.tick + secToTicks(plan.cooldown);
  if (aimX != null && aimZ != null && (aimX !== hero.x || aimZ !== hero.z)) hero.face = faceOf(aimX - hero.x, aimZ - hero.z);
  hero.act = 'cast'; hero.actTick = state.tick;
  let px = hero.x, pz = hero.z;
  if (plan.shape === 'ground') ({ x: px, z: pz } = groundPoint(ctx, hero, plan, aimX, aimZ));
  ctx.emit('cast', { id: hero.id, slot, skill: sk.id, shape: plan.shape, x: px, z: pz, face: hero.face, radius: plan.radius || 0, arc: plan.arc || 0, reach: plan.reach || 0, range: plan.range || 0, delay: plan.delay ? secToTicks(plan.delay) : 0, line: plan.line ? plan.line.length : 0 });
  selfEffects(ctx, hero, p, plan);
  if (plan.shape === 'bolt') fireBolts(ctx, hero, p, plan, aimX, aimZ, pm);
  else if (plan.shape === 'ground') {
    if (plan.delay) addTimer(state, state.tick + secToTicks(plan.delay), 'ground', { hero: hero.id, player: p.id, skill: sk.id, x: px, z: pz, hx: hero.x, hz: hero.z, pm });
    else groundStrike(ctx, hero, p, plan, px, pz, hero);
  } else if (plan.shape !== 'self') hitTargets(ctx, hero, plan, targetsFor(ctx, hero, plan, hero.face));
  if (plan.repeats && plan.repeats.count > 1) {
    const every = Math.max(1, secToTicks(plan.repeats.every));
    for (let n = 1; n < plan.repeats.count; n++) addTimer(state, state.tick + every * n, 'pulse', { hero: hero.id, player: p.id, skill: sk.id, n, x: px, z: pz, pm });
  }
}

function selfEffects(ctx, hero, p, plan) {
  const { data } = ctx;
  if (plan.shape === 'self' && plan.status) {
    const def = statusDef(data, plan.status);
    let power = def.damage || 0;
    if (plan.taunt) power += Math.min(plan.taunt.perTauntCap || 0, (plan.taunt.perTaunt || 0) * tauntCount(ctx, hero, plan.taunt));
    addStatus(ctx, hero, plan.status, { ticks: secToTicks(def.seconds), power, src: hero.id });
  }
  if (plan.taunt) doTaunt(ctx, hero, plan.taunt);
  if (plan.selfBuff || plan.trail) {
    const buff = JSON.parse(JSON.stringify(plan.selfBuff || {}));
    if (plan.trail) { buff.trail = JSON.parse(JSON.stringify(plan.trail)); buff.trailPower = plan.mult || 0; buff.trailType = skillDmgType(data, hero, plan); }
    const s = addStatus(ctx, hero, plan.id, { ticks: secToTicks(Math.max((plan.selfBuff && plan.selfBuff.seconds) || 0, (plan.trail && plan.trail.seconds) || 0, 0.05)), src: hero.id, buff });
    if (s && plan.trail) { s.tx = hero.x; s.tz = hero.z; s.tAt = ctx.state.tick; s.tUntil = ctx.state.tick + secToTicks(plan.trail.seconds); }
  }
  if (plan.shape === 'self' && plan.pool) poolAt(ctx, hero, plan, hero.x, hero.z, null);
}

function groundStrike(ctx, hero, p, plan, x, z, from) {
  const line = plan.line ? lineOf(from, plan, x, z) : null;
  const targets = groundTargets(ctx, from === hero ? hero : { ...hero, x: from.x, z: from.z }, plan, x, z);
  hitTargets(ctx, hero, plan, targets, { x, z, r: 0 });
  poolAt(ctx, hero, plan, x, z, line);
}

const withPm = (plan, pm) => { if (pm && pm !== 1 && plan.mult) plan.mult *= pm; return plan; };

/** Timer: a delayed ground strike (Fallstone). */
export function groundLands(ctx, args) {
  const hero = liveEnt(ctx.state, args.hero) || ctx.state.ents.find(e => e.id === args.hero);
  if (!hero) return;
  const p = ctx.state.players[args.player];
  const plan = withPm(planFor(ctx.data, p, args.skill), args.pm);
  ctx.emit('pulse', { id: hero.id, skill: args.skill, x: args.x, z: args.z, radius: plan.radius || 0 });
  groundStrike(ctx, hero, p, plan, args.x, args.z, { x: args.hx, z: args.hz });
}

function fireBolts(ctx, hero, p, plan, aimX, aimZ, pm = 1) {
  const { state } = ctx;
  const n = Math.max(1, Math.round(plan.projectiles ?? 1));   // total bolts (talent `add` counts from 1)
  const spread = plan.spread || 0;
  const range = plan.range || 12;
  let base = hero.face;
  if (aimX != null && aimZ != null && (aimX !== hero.x || aimZ !== hero.z)) base = faceOf(aimX - hero.x, aimZ - hero.z);
  for (let k = 0; k < n; k++) {
    const a = base + (k - (n - 1) / 2) * spread;
    const dx = sin(a), dz = cos(a);
    // first enemy along the ray
    let best = null, bt = range;
    for (const e of enemiesOf(ctx, hero)) {
      const rx = e.x - hero.x, rz = e.z - hero.z;
      const t = rx * dx + rz * dz;
      if (t < 0 || t > range + e.r) continue;
      const px = rx - dx * t, pz = rz - dz * t;
      if (px * px + pz * pz <= (e.r + 0.35) * (e.r + 0.35) && t < bt) { bt = t; best = e; }
    }
    const tx = best ? best.x : hero.x + dx * range, tz = best ? best.z : hero.z + dz * range;
    const ticks = Math.max(1, Math.round(Math.max(bt, 0.5) / BOLT_SPEED * 20));
    ctx.emit('bolt', { id: hero.id, skill: plan.id, fromX: hero.x, fromZ: hero.z, toX: tx, toZ: tz, ticks, dst: best ? best.id : -1 });
    addTimer(state, state.tick + ticks, 'bolt', { hero: hero.id, player: p.id, skill: plan.id, x: tx, z: tz, target: best ? best.id : -1, pm });
  }
}

/** Timer: a bolt lands (splash around the target if it is still alive, else where it was aimed). */
export function boltLands(ctx, args) {
  const { state, data } = ctx;
  const hero = state.ents.find(e => e.id === args.hero);
  if (!hero) return;
  const p = state.players[args.player];
  const plan = withPm(planFor(data, p, args.skill), args.pm);
  const t = liveEnt(state, args.target);
  const x = t ? t.x : args.x, z = t ? t.z : args.z;
  let targets;
  if (plan.splash) targets = inCircle(ctx, hero, x, z, plan.splash);
  else targets = t ? [t] : [];
  if (!hero.alive && !targets.length) return;
  hitTargets(ctx, hero, plan, targets, { x, z, r: 0 });
  poolAt(ctx, hero, plan, x, z, null);
  ctx.emit('pulse', { id: hero.id, skill: args.skill, x, z, radius: plan.splash || 0.5 });
}

function tauntCount(ctx, hero, t) {
  let n = 0;
  const r2 = t.radius * t.radius;
  for (const e of enemiesOf(ctx, hero)) if (e.kind !== 'hero' && dist2(e.x, e.z, hero.x, hero.z) <= r2) n++;
  return n;
}

function doTaunt(ctx, hero, t) {
  const r2 = t.radius * t.radius;
  const ticks = secToTicks(t.seconds);
  for (const e of enemiesOf(ctx, hero)) {
    if (e.kind === 'hero' || dist2(e.x, e.z, hero.x, hero.z) > r2) continue;
    if (!addStatus(ctx, e, 'taunt', { ticks, src: hero.id })) continue;
    e.target = hero.id;
    ctx.emit('taunt', { id: e.id, by: hero.id, ticks });
  }
}

/** Timer: a repeat of a multi-hit skill (around: centred on the hero now; ground: same point). */
export function skillPulse(ctx, args) {
  const hero = liveEnt(ctx.state, args.hero);
  if (!hero) return;
  const p = ctx.state.players[args.player];
  const plan = withPm(planFor(ctx.data, p, args.skill), args.pm);
  if (plan.shape === 'ground') { ctx.emit('pulse', { id: hero.id, skill: args.skill, x: args.x, z: args.z, radius: plan.radius || 0 }); groundStrike(ctx, hero, p, { ...plan, pool: null }, args.x, args.z, hero); return; }
  ctx.emit('pulse', { id: hero.id, skill: args.skill, x: hero.x, z: hero.z, radius: plan.radius || plan.reach || 0 });
  hitTargets(ctx, hero, plan, targetsFor(ctx, hero, plan, hero.face));
}

/** Trail self-buffs drop a burning zone every `every` s once the hero has moved `step` m. */
export function trailTick(ctx) {
  const { state } = ctx;
  for (const h of state.ents) {
    if (h.kind !== 'hero' || !h.alive) continue;
    for (const s of h.statuses) {
      const tr = s.buff && s.buff.trail;
      if (!tr || state.tick >= s.tUntil) continue;
      if (state.tick - s.tAt < secToTicks(tr.every)) continue;
      if (dist2(h.x, h.z, s.tx, s.tz) < tr.step * tr.step) continue;
      s.tAt = state.tick; s.tx = h.x; s.tz = h.z;
      addZone(ctx, { owner: h, x: h.x, z: h.z, radius: tr.radius, seconds: tr.burns, perSecond: s.buff.trailPower * weaponHit(ctx, h) * heroDamageFactor(ctx, h), dmgType: s.buff.trailType || h.dmgType, skill: s.id });
    }
  }
}

/** A plain damaging ring around an entity (Iron Resolve shockwave). */
export function pulseAround(ctx, hero, { radius, mult, skill }) {
  ctx.emit('pulse', { id: hero.id, skill, x: hero.x, z: hero.z, radius });
  const amount = weaponHit(ctx, hero) * mult * heroDamageFactor(ctx, hero);
  for (const e of inCircle(ctx, hero, hero.x, hero.z, radius)) dealDamage(ctx, hero, e, amount, hero.dmgType, { skill });
}
