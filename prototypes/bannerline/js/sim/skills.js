// The skill runtime (PLAN §6.3), built for lockstep: a cast plan (talents.js) is executed against
// sim state; anything that happens later (repeats) is a timer { atTick, kind:'pulse', args }.
//
// M1 implements what the Warrior needs and is laid out to grow by shape and by effect:
//   shapes:  melee (arc + reach), around (radius), self
//            -> bolt, ground, dash, summon, form, place arrive with M3/M6 heroes (castShape throws
//               for an unknown shape so data cannot silently do nothing)
//   effects: damage, status, knock {push, stagger}, pullIn, taunt, selfBuff (incl. resistPerFoe +
//            every-nth-hit shockwave), bonusIf crowd, repeats {count, every}

import { dist2, faceOf, wrapAngle, clamp } from './mathx.js';
import { secToTicks, addTimer, liveEnt } from './state.js';
import { planFor } from './talents.js';
import { addStatus, statusDef, isStunned } from './statuses.js';
import { dealDamage } from './combat.js';
import { weaponHit, heroDamageFactor } from './heroes.js';

const SHAPES = { melee: true, around: true, self: true };

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

function enemiesOf(ctx, hero) {
  const out = [];
  for (const e of ctx.state.ents) if (e.alive && !e._gone && e.field === hero.field && e.team !== hero.team) out.push(e);
  return out;
}

function targetsFor(ctx, hero, plan, aimFace) {
  const out = [];
  if (plan.shape === 'around') {
    for (const e of enemiesOf(ctx, hero)) { const r = plan.radius + e.r; if (dist2(hero.x, hero.z, e.x, e.z) <= r * r) out.push(e); }
  } else if (plan.shape === 'melee') {
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

function shove(ctx, hero, e, metres, away, field) {
  const dx = e.x - hero.x, dz = e.z - hero.z;
  const d = Math.sqrt(dx * dx + dz * dz) || 1;
  let move = away ? metres : -Math.min(metres, Math.max(0, d - hero.r - e.r - 0.3));
  if (!away && move === 0) return;
  const fx = e.x, fz = e.z;
  e.x = clamp(e.x + dx / d * move, field.x0 + e.r, field.x1 - e.r);
  e.z = clamp(e.z + dz / d * move, field.z0 + 0.5, field.z1 - 0.5);
  if (Math.abs(move) > 3) { e.px = e.x; e.pz = e.z; }
  ctx.emit('knock', { id: e.id, fromX: fx, fromZ: fz, toX: e.x, toZ: e.z });
}

/** Apply a plan's hit effects to a list of targets. */
function hitTargets(ctx, hero, plan, targets) {
  const { data, map, state } = ctx;
  const field = map.fields[hero.field];
  const type = skillDmgType(data, hero, plan);
  const wh = weaponHit(ctx, hero);
  if (plan.mult) {
    const amount = wh * plan.mult * heroDamageFactor(ctx, hero) * crowdBonus(plan, targets.length);
    for (const e of targets) dealDamage(ctx, hero, e, amount, type, { skill: plan.id });
  }
  for (const e of targets) {
    if (!e.alive || e._gone) continue;
    if (plan.status && plan.shape !== 'self') applyStatusTo(ctx, hero, e, plan.status, wh);
    for (const st of plan.statuses || []) if (!st.minCrowd || targets.length >= st.minCrowd) applyStatusTo(ctx, hero, e, st.id, wh, st);
    if (plan.knock) {
      if (plan.knock.push) shove(ctx, hero, e, plan.knock.push, true, field);
      if (plan.knock.stagger) addStatus(ctx, e, 'stun', { ticks: secToTicks(plan.knock.stagger), src: hero.id });
    }
    if (plan.pullIn && plan.pullIn.metres) shove(ctx, hero, e, plan.pullIn.metres, false, field);
  }
}

function applyStatusTo(ctx, hero, e, id, wh, extra = {}) {
  const def = statusDef(ctx.data, id);
  if (!def) return;
  const ticks = secToTicks(extra.seconds ?? def.seconds);
  if (def.kind === 'dot') addStatus(ctx, e, id, { ticks, stacks: 1, maxStacks: def.maxStacks || 1, power: def.perSecond * wh, src: hero.id });
  else if (def.kind === 'slow') addStatus(ctx, e, id, { ticks, power: extra.slow ?? def.slow, src: hero.id });
  else if (def.kind === 'debuff') addStatus(ctx, e, id, { ticks, power: def.takeMore || 0, src: hero.id });
  else addStatus(ctx, e, id, { ticks, src: hero.id });
}

/** Cast a skill. Caller already checked castRefusal. */
export function castSkill(ctx, p, slot, aimX, aimZ) {
  const { state, data } = ctx;
  const sk = p.skills.find(s => s.slot === slot);
  const hero = liveEnt(state, p.heroEnt);
  const plan = planFor(data, p, sk.id);
  if (!SHAPES[plan.shape]) throw new Error(`Skill shape "${plan.shape}" has no runtime yet`);
  hero.mp -= plan.mp;
  sk.readyAt = state.tick + secToTicks(plan.cooldown);
  if (aimX != null && aimZ != null && (aimX !== hero.x || aimZ !== hero.z)) hero.face = faceOf(aimX - hero.x, aimZ - hero.z);
  hero.act = 'cast'; hero.actTick = state.tick;
  ctx.emit('cast', { id: hero.id, slot, skill: sk.id, shape: plan.shape, x: hero.x, z: hero.z, face: hero.face, radius: plan.radius || 0, arc: plan.arc || 0, reach: plan.reach || 0 });
  runPlan(ctx, hero, p, plan, hero.face);
  if (plan.repeats && plan.repeats.count > 1) {
    const every = Math.max(1, secToTicks(plan.repeats.every));
    for (let n = 1; n < plan.repeats.count; n++) addTimer(state, state.tick + every * n, 'pulse', { hero: hero.id, player: p.id, skill: sk.id, n });
  }
}

function runPlan(ctx, hero, p, plan, face, isRepeat = false) {
  const { data } = ctx;
  const wh = weaponHit(ctx, hero);
  // self effects (first cast only)
  if (!isRepeat) {
    if (plan.shape === 'self' && plan.status) {
      const def = statusDef(data, plan.status);
      let power = def.damage || 0;
      if (plan.taunt) power += Math.min(plan.taunt.perTauntCap || 0, (plan.taunt.perTaunt || 0) * tauntCount(ctx, hero, plan.taunt));
      addStatus(ctx, hero, plan.status, { ticks: secToTicks(def.seconds), power, src: hero.id });
    }
    if (plan.taunt) doTaunt(ctx, hero, plan.taunt);
    if (plan.selfBuff) addStatus(ctx, hero, plan.id, { ticks: secToTicks(plan.selfBuff.seconds), src: hero.id, buff: JSON.parse(JSON.stringify(plan.selfBuff)) });
  }
  if (plan.shape !== 'self') hitTargets(ctx, hero, plan, targetsFor(ctx, hero, plan, face));
  return wh;
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
    addStatus(ctx, e, 'taunt', { ticks, src: hero.id });
    e.target = hero.id;
    ctx.emit('taunt', { id: e.id, by: hero.id, ticks });
  }
}

/** Timer: a repeat of a multi-hit skill, centred on the hero where it is now. */
export function skillPulse(ctx, args) {
  const hero = liveEnt(ctx.state, args.hero);
  if (!hero) return;
  const p = ctx.state.players[args.player];
  const plan = planFor(ctx.data, p, args.skill);
  ctx.emit('pulse', { id: hero.id, skill: args.skill, x: hero.x, z: hero.z, radius: plan.radius || plan.reach || 0 });
  runPlan(ctx, hero, p, plan, hero.face, true);
}

/** A plain damaging ring around an entity (Iron Resolve shockwave). */
export function pulseAround(ctx, hero, { radius, mult, skill }) {
  ctx.emit('pulse', { id: hero.id, skill, x: hero.x, z: hero.z, radius });
  const amount = weaponHit(ctx, hero) * mult * heroDamageFactor(ctx, hero);
  const type = hero.dmgType;
  const targets = [];
  for (const e of enemiesOf(ctx, hero)) { const r = radius + e.r; if (dist2(hero.x, hero.z, e.x, e.z) <= r * r) targets.push(e); }
  for (const e of targets) dealDamage(ctx, hero, e, amount, type, { skill });
}

