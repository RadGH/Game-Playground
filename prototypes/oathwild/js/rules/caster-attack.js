// Oathwild — a magic weapon's BASIC ATTACK in the world sim: the wand / tome / staff style, the sceptre's elemental
// swing, and what an off-hand focus adds (Echo, Burst, Ward, Siphon). Pure.
//
// The plan comes from js/rules/casters.js (`sheet.caster`, the same object the item card is written from). This file
// only carries it out, with the world sim's own shapes — js/rules/combat.js hands them over as `ops` (fireBolt,
// coneHit, lineHit, aroundHit, schedule, hit, emit, foesNear), so a wand's cone is the same cone a spell uses.
//
//   casterAttack(world, u, { dir, at, power, haste, echo }, ops)   one basic attack (sets u.swingAt unless it is an echo)
//   casterAfterHit(world, u, t, row, ctx, res, ops)         what happens once per attack when it first lands
//   steerBolt(world, p, owner, dt, ops)                      a seeking bolt turns toward the nearest enemy ahead
//
// Events (besides the usual hit / projectile): { t:'attack', who, look, el, shape, dir, at?, r?, len?, w?, arc?, ms?,
// n?, seconds? } for the client to draw the style; { t:'hop', who, from, to, el, look } for a chain jump or a fork's
// shard; { t:'rider', who, rider, amt? } for a siphon; 'barrier' for a ward.

import { planEvery } from './casters.js';
import { applyAura } from './auras.js';

const r2 = v => Math.round(v * 100) / 100;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/** Where a lobbed or placed attack lands: the crosshair's ground point clamped to reach, else along the aim. */
function landingPoint(world, u, dir, at, range, ops) {
  if (Array.isArray(at) && at.length >= 2) {
    const x = +at[0], z = +(at.length > 2 ? at[2] : at[1]);
    if (Number.isFinite(x) && Number.isFinite(z)) {
      const d = Math.hypot(x - u.x, z - u.z);
      if (d <= range) return { x, z };
      return { x: u.x + (x - u.x) / d * range, z: u.z + (z - u.z) / d * range };
    }
  }
  // no crosshair point (a bot, an old client): the nearest enemy within a few degrees of the aim, else full reach
  const lim = Math.cos(((world.rules.data.combat.aimAssist?.degrees) || 8) * Math.PI / 180);
  let best = null, bd = Infinity;
  for (const t of ops.foesNear(world, u, u, range)) {
    const d = dist(t, u) || 1;
    if (((t.x - u.x) * dir.x + (t.z - u.z) * dir.z) / d < lim) continue;
    if (d < bd) { bd = d; best = t; }
  }
  return best ? { x: best.x, z: best.z } : { x: u.x + dir.x * range, z: u.z + dir.z * range };
}

/** One basic attack with the caster plan on `u.sheet.caster`. */
export function casterAttack(world, u, { dir, at = null, power = 1, haste = 1, echo = null } = {}, ops) {
  const plan = u.sheet.caster;
  const step = u.swingStep || 0;
  if (!echo) {
    // held down, each attack is timed from when the last one was DUE (not when the 20 Hz tick got to it), so the rate
    // over a fight is exactly the card's "every 0.72s" rather than rounded up to whole ticks
    const from = u.swingAt && world.t - u.swingAt < 0.1 ? u.swingAt : world.t;
    u.swingAt = from + Math.max(0.2, planEvery(plan, haste, step));
    if (plan.shape === 'melee') u.swingStep = (step + 1) % plan.pattern.length;
  }
  const k = power * (echo ? echo.mult : 1);
  const row = { mult: plan.mult * k, element: plan.element, applies: plan.status ? [{ id: plan.status, over: {} }] : [] };
  const ctx = { powerRange: u.sheet.spell.int, basic: true, vis: `w:${plan.element}:${plan.look}`, cx: { plan, first: false, echo: !!echo } };
  const D = [r2(dir.x), r2(dir.z)];
  const ev = extra => ops.emit(world, { t: 'attack', who: u.id, look: plan.look, el: plan.element, shape: plan.shape, dir: D, ...(echo ? { echo: 1 } : {}), ...extra });
  switch (plan.shape) {
    case 'cone':
      ev({ len: plan.reach, arc: plan.arc });
      ops.coneHit(world, u, { ...row, reach: plan.reach, arc: plan.arc }, dir, ctx);
      break;
    case 'beam':
      ev({ len: plan.range, w: plan.width });
      ops.lineHit(world, u, { ...row, range: plan.range, width: plan.width }, { x: u.x, z: u.z }, dir, plan.range, { ...ctx, width: plan.width });
      break;
    case 'nova':
      ev({ r: plan.radius });
      ops.aroundHit(world, u, { ...row, radius: plan.radius }, { x: u.x, z: u.z }, ctx);
      break;
    case 'melee': {
      const s = plan.pattern[step % plan.pattern.length];
      ev({ len: s.reach, arc: s.arc, strike: s.name });
      ops.coneHit(world, u, { ...row, mult: row.mult * s.damage, reach: s.reach, arc: s.arc }, dir, ctx);
      break;
    }
    case 'lob': {
      const p = landingPoint(world, u, dir, at, plan.range, ops);
      const ms = Math.max(0.2, dist(p, u) / plan.speed);
      ev({ at: [r2(p.x), r2(p.z)], r: plan.radius, ms: Math.round(ms * 1000) });
      ops.schedule(world, ms, { type: 'area', caster: u.id, row: { ...row, radius: plan.radius }, at: p, powerRange: ctx.powerRange, basic: true, vis: ctx.vis, cx: ctx.cx });
      break;
    }
    case 'ground': {
      const p = landingPoint(world, u, dir, at, plan.range, ops);
      const n = Math.max(1, Math.round(plan.ground.seconds / plan.ground.every));
      ev({ at: [r2(p.x), r2(p.z)], r: plan.radius, seconds: plan.ground.seconds });
      for (let i = 0; i < n; i++) ops.schedule(world, i * plan.ground.every, { type: 'area', caster: u.id, row: { ...row, radius: plan.radius }, at: p, powerRange: ctx.powerRange, basic: true, vis: ctx.vis, cx: i === 0 ? ctx.cx : null });
      break;
    }
    default: {
      ev({ n: plan.projectiles, len: plan.range });
      const bolt = {
        ...row, range: plan.range, projectiles: plan.projectiles, spread: plan.spread, splash: plan.splash,
        ricochet: plan.chains ? { bounces: plan.chains.n, range: plan.chains.range, keep: plan.chains.keep } : null,
        homing: plan.homing || null,
      };
      ops.fireBolt(world, u, bolt, dir, { ...ctx, speed: plan.speed });
    }
  }
  // Echo: every Nth attack repeats itself a moment later, weaker (never an echo of an echo)
  const r = plan.rider;
  if (r?.key === 'echo' && !echo) {
    u.casterCount = (u.casterCount || 0) + 1;
    if (u.casterCount % (r.every || 4) === 0) ops.schedule(world, r.delay ?? 0.25, { type: 'casterEcho', caster: u.id, dir: { ...dir }, at, power, mult: r.mult ?? 0.6 });
  }
}

/** A ward: each attack that hits adds `share` of maximum health to the barrier, never past `cap`. */
function wardUp(world, who, w, by, ops) {
  const cap = Math.round(who.maxHp * (w.cap ?? 0.1));
  const add = Math.round(who.maxHp * (w.share ?? 0.02));
  const before = who.barrier || 0;
  who.barrier = Math.min(cap, before + add);
  applyAura(world.rules, who, 'barrier', { over: { seconds: w.seconds ?? 4 }, source: by.id });
  if (who.barrier > before) ops.emit(world, { t: 'barrier', who: who.id, amount: who.barrier - before, from: by.id, ward: 1 });
}

/**
 * Called by combat.js `hit` after every landed hit that carries a caster context: the first one of each attack sets
 * off the style's extras (fork shards, lingering ground, a ward) and the off hand's rider (Burst, Ward, Siphon).
 */
export function casterAfterHit(world, u, t, row, ctx, res, ops) {
  const cx = ctx.cx;
  if (!cx || cx.first || !(res?.amount > 0)) return;
  cx.first = true;
  const plan = cx.plan;
  const plain = { powerRange: ctx.powerRange, basic: true, vis: ctx.vis };     // follow-up hits never trigger this again
  if (plan.split) {
    const shards = ops.foesNear(world, u, t, plan.split.range).filter(o => o !== t && o.alive).sort((a, b) => dist(a, t) - dist(b, t)).slice(0, plan.split.shards);
    for (const o of shards) {
      ops.emit(world, { t: 'hop', who: u.id, from: [r2(t.x), r2(t.z)], to: [r2(o.x), r2(o.z)], el: plan.element, look: plan.look });
      ops.hit(world, u, o, { ...row, mult: row.mult * plan.split.keep }, plain);
    }
  }
  if (plan.pool) {
    const P = plan.pool, at = { x: t.x, z: t.z };
    const ticks = Math.max(1, Math.round(P.seconds / P.every));
    ops.emit(world, { t: 'attack', who: u.id, look: plan.look, el: plan.element, shape: 'pool', at: [r2(at.x), r2(at.z)], r: P.radius, seconds: P.seconds });
    for (let i = 1; i <= ticks; i++) ops.schedule(world, i * P.every, { type: 'area', caster: u.id, row: { ...row, mult: row.mult * P.power, radius: P.radius }, at, powerRange: ctx.powerRange, basic: true, vis: ctx.vis });
  }
  if (plan.ward) {
    wardUp(world, u, plan.ward, u, ops);
    if (plan.ward.allies) for (const a of world.units.values()) if (a !== u && a.kind === 'player' && a.alive && !a.downed && dist(a, u) <= (plan.radius || 5)) wardUp(world, a, plan.ward, u, ops);
  }
  const r = plan.rider;
  if (!r || cx.echo) return;
  if (r.key === 'burst') {
    ops.emit(world, { t: 'attack', who: u.id, look: 'rider:burst', el: plan.element, shape: 'burst', at: [r2(t.x), r2(t.z)], r: r.radius });
    for (const o of ops.foesNear(world, u, t, r.radius)) ops.hit(world, u, o, { ...row, mult: row.mult * r.mult }, plain);
  } else if (r.key === 'ward') wardUp(world, u, r, u, ops);
  else if (r.key === 'siphon') {
    const before = u.mp;
    u.mp = Math.min(u.maxMp, u.mp + (r.mana || 0));
    ops.emit(world, { t: 'rider', who: u.id, rider: 'siphon', amt: Math.round(u.mp - before) });
  }
}

/** A seeking bolt: turns (at most `turnPerSecond` radians a second) toward the nearest enemy ahead of it. */
export function steerBolt(world, p, owner, dt, ops) {
  const h = p.homing;
  const lim = Math.cos((h.coneDeg || 50) * Math.PI / 180);
  let best = null, bd = Infinity;
  for (const t of ops.foesNear(world, owner, p, h.seekMetres || 14)) {
    if (p.hit.has(t.id)) continue;
    const dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz) || 1;
    if ((dx * p.dx + dz * p.dz) / d < lim) continue;
    if (d < bd) { bd = d; best = t; }
  }
  if (!best) return;
  const want = Math.atan2(best.x - p.x, best.z - p.z), now = Math.atan2(p.dx, p.dz);
  let turn = ((want - now + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  const maxT = (h.turnPerSecond || 5) * dt;
  turn = Math.max(-maxT, Math.min(maxT, turn));
  p.dx = Math.sin(now + turn); p.dz = Math.cos(now + turn);
}
