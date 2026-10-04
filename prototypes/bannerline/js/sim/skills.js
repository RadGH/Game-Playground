// The skill runtime (PLAN §6.3), built for lockstep: a cast plan (talents.js) is executed against
// sim state; anything that happens later (repeats, bolts in flight, delayed ground strikes) is a
// timer { atTick, kind, args } and anything that lingers is a zone (zones.js) or a status.
//
// Shapes implemented: melee (arc + reach), around (radius), self (incl. a `form` toggle), bolt (range,
//   projectiles, spread, splash, split), ground (point + radius; line; delay; repeats incl. scatter;
//   place = a trap), dash (to 'back' / 'target'), summon (pets + howl). castSkill throws for an
//   unknown shape, so data can never silently do nothing.
// M6 effects: pen, bonusIf distance, place (trap), split, dash, empowerNext, consumes, onHit.healPet,
//   howl, barrier, selfBuff reflect / petsOnly, taunt.target / taunt.by 'pet', statuses lockout.
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
import { summonPets, petsOf } from './pets.js';
import { buildTurret, repair, buffTurrets } from './turrets.js';
import { next } from './rng.js';
import { refreshHero } from './heroes.js';

export const SHAPES = ['melee', 'around', 'self', 'bolt', 'ground', 'dash', 'summon', 'turret'];
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

/** bonusIf distance:start:per:cap — more damage the further the target is from the hero. */
function distanceBonus(plan, hero, e) {
  let m = 1;
  for (const b of plan.bonusIf || []) {
    const parts = b.when.split(':');
    if (parts[0] !== 'distance') continue;
    const d = Math.sqrt(dist2(hero.x, hero.z, e.x, e.z));
    m *= 1 + Math.min(+parts[3], +parts[2] * Math.max(0, d - +parts[1]));
  }
  return m;
}

function crowdBonus(plan, hits) {
  let m = 1;
  for (const b of plan.bonusIf || []) {
    const [kind, per, cap] = b.when.split(':');
    if (kind === 'crowd') m *= 1 + Math.min(+cap || 9, +per * Math.max(0, hits - 1));
  }
  return m;
}

/** Knockback / pull as a real push (owner R2.5): a velocity that friction bleeds off over the next
 *  ticks (movement.js knockTick), so the body slides `metres` in total, shoves what it runs into and
 *  stops at walls. No teleport. */
export function shove(ctx, from, e, metres, away, field) {
  if (e._traits && e._traits.indexOf('unstoppable') >= 0) return;   // traits.js: no knockback or pull
  let dx = e.x - from.x, dz = e.z - from.z;
  let d = Math.sqrt(dx * dx + dz * dz);
  if (d < 1e-6) { dx = sin(from.face || 0); dz = cos(from.face || 0); d = 1; }
  const move = away ? metres : -Math.min(metres, Math.max(0, d - (from.r || 0) - e.r - 0.3));
  if (move === 0) return;
  const v0 = move * (1 - KNOCK_FRICTION);       // sum of v0 * f^n over the slide = move
  e._kvx += dx / d * v0; e._kvz += dz / d * v0;
  ctx.emit('knock', { id: e.id, vx: e._kvx, vz: e._kvz, metres: Math.abs(move) });
}
export const KNOCK_FRICTION = 0.6;   // share of the push left after each tick (a 4 m shove slides for ~0.5 s)

/** Burn-style stacking statuses and plain statuses from a plan, on one target. */
function applyPlanStatuses(ctx, hero, plan, e, wh, hits) {
  if (plan.status && plan.shape !== 'self') applyStatusTo(ctx, hero, e, plan.status, wh, { perSecond: plan.statusMult });
  if (plan.stack) applyStatusTo(ctx, hero, e, plan.stack.status, wh, { add: plan.stack.add, max: plan.stack.max, perSecond: plan.statusMult });
  for (const st of plan.statuses || []) if (!st.minCrowd || hits >= st.minCrowd) applyStatusTo(ctx, hero, e, st.id, wh, st);
}

function applyStatusTo(ctx, hero, e, id, wh, extra = {}) {
  const def = statusDef(ctx.data, id);
  if (!def) return;
  // lockout: once applied, the same status cannot land on this target again for `lockout` s
  if (extra.lockout) {
    if (findStatus(e, 'lock_' + id)) return;
    addStatus(ctx, e, 'lock_' + id, { ticks: secToTicks(extra.lockout), src: hero.id });
  }
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
    for (const e of targets) {
      let a = amount * distanceBonus(plan, hero, e);
      if (plan.consumes) { const tag = findStatus(e, plan.consumes.tag); if (tag) { a *= 1 + plan.consumes.mult; tag.until = ctx.state.tick; } }
      dealDamage(ctx, hero, e, a, type, { skill: plan.id, pen: plan.pen || 0 });
    }
  }
  if (plan.onHit && plan.onHit.healPet && targets.length) {
    for (const pet of petsOf(ctx.state, hero.owner)) { const h = Math.min(pet.hpMax - pet.hp, pet.hpMax * plan.onHit.healPet); if (h > 0) { pet.hp += h; ctx.emit('heal', { src: hero.id, dst: pet.id, amount: Math.round(h * 10) / 10 }); } }
  }
  if (plan.taunt && plan.taunt.target) for (const e of targets) {
    if (e.kind === 'hero' || !e.alive || e._gone) continue;
    const ticks = secToTicks(plan.taunt.seconds);
    if (addStatus(ctx, e, 'taunt', { ticks, src: hero.id })) { e.target = hero.id; ctx.emit('taunt', { id: e.id, by: hero.id, ticks }); }
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
  if (plan.shape === 'ground' || plan.shape === 'turret') ({ x: px, z: pz } = groundPoint(ctx, hero, plan, aimX, aimZ));
  ctx.emit('cast', { id: hero.id, slot, skill: sk.id, fx: plan.fxId || sk.id, shape: plan.shape, x: px, z: pz, face: hero.face, radius: plan.radius || 0, arc: plan.arc || 0, reach: plan.reach || 0, range: plan.range || 0, delay: plan.delay ? secToTicks(plan.delay) : 0, line: plan.line ? plan.line.length : 0 });
  selfEffects(ctx, hero, p, plan);
  if (plan.shape === 'bolt') fireBolts(ctx, hero, p, plan, aimX, aimZ, pm);
  else if (plan.shape === 'ground') {
    if (plan.delay) addTimer(state, state.tick + secToTicks(plan.delay), 'ground', { hero: hero.id, player: p.id, skill: sk.id, x: px, z: pz, hx: hero.x, hz: hero.z, pm });
    else if (plan.place) placeTrap(ctx, hero, plan, px, pz);
    else groundStrike(ctx, hero, p, plan, px, pz, hero);
  } else if (plan.shape === 'dash') dashTo(ctx, hero, plan, aimX, aimZ);
  else if (plan.shape === 'summon') summonWith(ctx, hero, plan);
  else if (plan.shape === 'turret') buildTurret(ctx, hero, plan, px, pz, sk.rank, weaponHit(ctx, hero));
  else if (plan.shape !== 'self') hitTargets(ctx, hero, plan, targetsFor(ctx, hero, plan, hero.face));
  if (plan.form) toggleForm(ctx, hero, p, plan);
  if (plan.empowerNext) addStatus(ctx, hero, 'empower', { ticks: secToTicks(plan.empowerNext.seconds), stacks: plan.empowerNext.count, maxStacks: plan.empowerNext.count, power: plan.empowerNext.mult, src: hero.id });
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
    if (plan.taunt && !plan.taunt.target) power += Math.min(plan.taunt.perTauntCap || 0, (plan.taunt.perTaunt || 0) * tauntCount(ctx, hero, plan.taunt));
    addStatus(ctx, hero, plan.status, { ticks: secToTicks(def.seconds), power, src: hero.id });
  }
  if (plan.taunt && !plan.taunt.target) {
    if (plan.taunt.by === 'pet') for (const pet of petsOf(ctx.state, hero.owner)) doTaunt(ctx, pet, plan.taunt);
    else doTaunt(ctx, hero, plan.taunt);
  }
  if (plan.repair) repair(ctx, hero, plan.repair);
  if (plan.turretBuff) buffTurrets(ctx, hero, plan);
  if (plan.barrier) addStatus(ctx, hero, 'barrier', { ticks: secToTicks(plan.barrier.seconds), power: hero.hpMax * plan.barrier.share, src: hero.id });
  if (plan.selfBuff && plan.selfBuff.petsOnly) {
    for (const pet of petsOf(ctx.state, hero.owner)) addStatus(ctx, pet, plan.id, { ticks: secToTicks(plan.selfBuff.seconds), src: hero.id, buff: JSON.parse(JSON.stringify(plan.selfBuff)) });
  } else if (plan.selfBuff || plan.trail) {
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
  const tagged = plan.split && t && splitReady(plan, t);
  hitTargets(ctx, hero, plan, targets, { x, z, r: 0 });
  poolAt(ctx, hero, plan, x, z, null);
  ctx.emit('pulse', { id: hero.id, skill: args.skill, x, z, radius: plan.splash || 0.5 });
  if (tagged) splitShards(ctx, hero, plan, t, x, z);
}

function tauntCount(ctx, hero, t) {
  let n = 0;
  const r2 = t.radius * t.radius;
  for (const e of enemiesOf(ctx, hero)) if (e.kind !== 'hero' && dist2(e.x, e.z, hero.x, hero.z) <= r2) n++;
  return n;
}

function doTaunt(ctx, by, t) {
  const r2 = t.radius * t.radius;
  const ticks = secToTicks(t.seconds);
  for (const e of enemiesOf(ctx, by)) {
    if (e.kind === 'hero' || e.kind === 'pet' || dist2(e.x, e.z, by.x, by.z) > r2) continue;
    if (!addStatus(ctx, e, 'taunt', { ticks, src: by.id })) continue;
    e.target = by.id;
    ctx.emit('taunt', { id: e.id, by: by.id, ticks });
  }
}

// ── M6 shapes and effects ────────────────────────────────────────────────────────────────────

/** dash: leap `dash.range` back from the aim ('back') or toward it ('target'); splash where you stood. */
function dashTo(ctx, hero, plan, aimX, aimZ) {
  const f = ctx.map.fields[hero.field];
  const range = (plan.dash && plan.dash.range) || plan.range || 4;
  let dx = sin(hero.face), dz = cos(hero.face);
  if (aimX != null && aimZ != null && (aimX !== hero.x || aimZ !== hero.z)) { const d = Math.sqrt(dist2(hero.x, hero.z, aimX, aimZ)); dx = (aimX - hero.x) / d; dz = (aimZ - hero.z) / d; }
  const back = !plan.dash || plan.dash.to === 'back';
  let go = range;
  if (!back && aimX != null) go = Math.min(range, Math.sqrt(dist2(hero.x, hero.z, aimX, aimZ)));
  const sx = hero.x, sz = hero.z;
  if (plan.splash) hitTargets(ctx, hero, plan, inCircle(ctx, hero, sx, sz, plan.splash), { x: sx, z: sz, r: 0 });
  hero.x = clamp(hero.x + (back ? -dx : dx) * go, f.x0 + hero.r, f.x1 - hero.r);
  hero.z = clamp(hero.z + (back ? -dz : dz) * go, f.z0 + 0.5, f.leakZ - 0.5);
  hero.px = hero.x; hero.pz = hero.z;
  if (!back && !plan.splash) hitTargets(ctx, hero, plan, inCircle(ctx, hero, hero.x, hero.z, 2.5));
  ctx.emit('dash', { id: hero.id, fromX: sx, fromZ: sz, toX: hero.x, toZ: hero.z, skill: plan.id, fx: plan.fxId || plan.id });
}

/** summon: pets next to the hero, then the howl (haste + damage for the hero and every pet). */
function summonWith(ctx, hero, plan) {
  if (plan.pet) summonPets(ctx, hero, plan.pet, plan.count || 1);
  if (plan.howl) {
    const ticks = secToTicks(plan.howl.seconds);
    const allies = [hero, ...petsOf(ctx.state, hero.owner)];
    if (plan.howl.radius) {   // Running Howl also reaches allied heroes nearby
      const r2 = plan.howl.radius * plan.howl.radius;
      for (const e of ctx.state.ents) if (e.kind === 'hero' && e !== hero && e.alive && e.team === hero.team && e.field === hero.field && dist2(e.x, e.z, hero.x, hero.z) <= r2) allies.push(e);
    }
    for (const e of allies) {
      if (plan.howl.status) addStatus(ctx, e, plan.howl.status, { ticks, src: hero.id });
      if (plan.howl.damage) addStatus(ctx, e, 'howl', { ticks, src: hero.id, buff: { damage: plan.howl.damage } });
    }
  }
}

/** place: a trap that arms, waits, and springs on the first enemy inside its trigger radius. */
function placeTrap(ctx, hero, plan, x, z) {
  const { state } = ctx;
  const P = plan.place;
  const mine = state.zones.filter(zz => zz.kind === 'trap' && zz.owner === hero.id && zz.skill === plan.id);
  if (mine.length >= (P.max || 1)) { const old = mine[0]; old.until = state.tick; }
  const zone = addZone(ctx, { owner: hero, x, z, radius: P.radius || 2, seconds: P.seconds || 30, perSecond: 0, dmgType: skillDmgType(ctx.data, hero, plan), skill: plan.id });
  zone.kind = 'trap';
  zone.armAt = state.tick + secToTicks(P.arm || 0);
  zone.trigger = P.triggerRadius || zone.radius;
  zone.strike = JSON.parse(JSON.stringify(P.strike || {}));
  zone.tag = P.tag ? JSON.parse(JSON.stringify(P.tag)) : null;
  zone.player = hero.owner;
}

/** zones.js calls this for a trap each tick: spring when an enemy steps in. Returns true if sprung. */
export function trapTick(ctx, zone) {
  const { state, data } = ctx;
  if (state.tick < zone.armAt) return false;
  const r2 = zone.trigger * zone.trigger;
  let hit = false;
  for (const e of state.ents) if (e.alive && !e._gone && e.field === zone.field && e.team !== zone.team && e.kind !== 'hero' && e.kind !== 'pet' && e._traits.indexOf('flying') < 0 && dist2(e.x, e.z, zone.x, zone.z) <= r2) { hit = true; break; }
  if (!hit) return false;
  const hero = state.ents.find(e => e.id === zone.owner);
  if (!hero) return false;
  const p = state.players[zone.player];
  const wh = weaponHit(ctx, hero);
  ctx.emit('trap', { zone: zone.id, x: zone.x, z: zone.z, radius: zone.radius });
  const targets = inCircle(ctx, hero, zone.x, zone.z, zone.radius).filter(e => e.kind !== 'hero');
  const amount = wh * (zone.strike.mult || 0) * heroDamageFactor(ctx, hero);
  for (const e of targets) {
    if (amount > 0) dealDamage(ctx, hero, e, amount, zone.dmgType, { skill: zone.skill });
    if (!e.alive || e._gone) continue;
    if (zone.strike.status) applyStatusTo(ctx, hero, e, zone.strike.status, wh);
    if (zone.tag) addStatus(ctx, e, zone.tag.id, { ticks: secToTicks(zone.tag.seconds), power: (statusDef(data, zone.tag.id) || {}).takeMore || 0, src: hero.id });
  }
  zone.until = state.tick;
  return true;
}

function splitReady(plan, t) {
  const w = plan.split.when || '';
  if (w.startsWith('tag:')) return !!findStatus(t, w.slice(4));
  return true;
}

/** split: an arrow that hits a tagged target throws shards at the nearest other enemies. */
function splitShards(ctx, hero, plan, t, x, z) {
  const S = plan.split;
  const r2 = S.range * S.range;
  const near = enemiesOf(ctx, hero).filter(e => e !== t && dist2(e.x, e.z, x, z) <= r2);
  const order = near.map(e => ({ e, d: dist2(e.x, e.z, x, z) }));
  for (let i = 1; i < order.length; i++) for (let j = i; j > 0 && (order[j].d < order[j - 1].d || (order[j].d === order[j - 1].d && order[j].e.id < order[j - 1].e.id)); j--) { const tmp = order[j]; order[j] = order[j - 1]; order[j - 1] = tmp; }
  const amount = weaponHit(ctx, hero) * (plan.mult || 0) * (S.keep || 0.5) * heroDamageFactor(ctx, hero);
  for (let i = 0; i < Math.min(S.shards, order.length); i++) {
    const e = order[i].e;
    ctx.emit('bolt', { id: hero.id, skill: plan.id, fromX: x, fromZ: z, toX: e.x, toZ: e.z, ticks: 2, dst: e.id, shard: true });
    dealDamage(ctx, hero, e, amount, skillDmgType(ctx.data, hero, plan), { skill: plan.id });
  }
}

/** form: toggle a shape (Briarback). The stats, the basic attack and the per-skill overrides read
 *  player.form; entering runs onEnter (a taunt). */
function toggleForm(ctx, hero, p, plan) {
  const F = plan.form;
  if (p.form === F.id) { if (F.toggle === false) return; p.form = null; ctx.emit('form', { player: p.id, form: null, id: hero.id }); }   // toggle false: casting again keeps the form
  else {
    p.form = F.id;
    ctx.emit('form', { player: p.id, form: F.id, id: hero.id });
    if (F.onEnter && F.onEnter.taunt) doTaunt(ctx, hero, F.onEnter.taunt);
  }
  refreshHero(ctx, p);
}

/** The form block a player is in (from the skill that grants it), or null. */
export function activeForm(data, p) {
  if (!p.form) return null;
  const hero = data.heroes.heroes[p.hero];
  for (const sid of Object.values(hero.slots)) { const f = data.heroes.skills[sid].form; if (f && f.id === p.form) return f; }
  return null;
}

/** Timer: a repeat of a multi-hit skill (around: centred on the hero now; ground: same point). */
export function skillPulse(ctx, args) {
  const hero = liveEnt(ctx.state, args.hero);
  if (!hero) return;
  const p = ctx.state.players[args.player];
  const plan = withPm(planFor(ctx.data, p, args.skill), args.pm);
  if (plan.shape === 'ground') {
    let x = args.x, z = args.z;
    if (plan.repeats && plan.repeats.scatter) {   // scatter: each volley lands somewhere inside the area
      const st = ctx.state.rng.combat, a = next(st) * 6.283185307179586, r = Math.sqrt(next(st)) * (plan.radius || 2) * 0.6;
      x += sin(a) * r; z += cos(a) * r;
    }
    ctx.emit('pulse', { id: hero.id, skill: args.skill, x, z, radius: plan.radius || 0 });
    groundStrike(ctx, hero, p, { ...plan, pool: null }, x, z, hero);
    return;
  }
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
export function pulseAround(ctx, at, { radius, mult, skill, by }) {
  const hero = by || at;   // `at` may be a point-like copy (a unique striking around the target)
  ctx.emit('pulse', { id: hero.id, skill, x: at.x, z: at.z, radius });
  const amount = weaponHit(ctx, hero) * mult * heroDamageFactor(ctx, hero);
  for (const e of inCircle(ctx, hero, at.x, at.z, radius)) dealDamage(ctx, hero, e, amount, hero.dmgType, { skill });
}
