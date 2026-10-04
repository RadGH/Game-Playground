// The PARITY ORACLE for skills: Farhold's own skill bar (skills.js), its own skill runtime
// (skillrun.js — loaded for real, Three.js through Farhold's loader, with a scene and effects that
// draw nothing), its real EnemyField, and main.js's `castSkill` + `fireBolt` + `dropPool`
// TRANSCRIBED (they live inside main.js's 11,000-line closure). Timers are real `setTimeout`s —
// a fixture runs under node:test's mock timers and ticks them in step with the room clock.
//
// Drift: tests/C/drift.test.mjs hashes main.js castSkill; a Farhold edit there goes red.

import * as O from './farhold-oracle.mjs';

const FJS = new URL('../../../farhold/js/', import.meta.url);
const THREE = await import('three');   // through Farhold's three-loader, registered by farhold-oracle.mjs
const { createSkillBar, applyStatus, STATUS_POWER_SHARE } = await import(new URL('skills.js', FJS));
const { createSkillRuntime } = await import(new URL('skillrun.js', FJS));
const { setMechEnv } = await import(new URL('skillmech.js', FJS));
const { CAST_ELEMENTS } = await import(new URL('rpg.js', FJS));
const { pushFor } = await import(new URL('combat-feel.js', FJS));
const W = await import(new URL('weapons.js', FJS));
const { talentPlan } = await import(new URL('skilltalents.js', FJS));
const { elementOf, statusOf } = await import(new URL('rpg.js', FJS));

/** Something that answers every method with nothing (spellfx, fx, sound, hud). */
const sink = () => new Proxy(function () {}, {
  // a projectile resolves when it would land (a real timer), as the drawn one does in the game
  get: (t, k) => (k === 'then' ? undefined : k === 'projectile' ? ({ ms = 0 } = {}) => new Promise(r => setTimeout(r, ms)) : sink()),
  apply: () => undefined,
});

/**
 * Farhold's skill machinery around one player. `control` = { x, z, yaw }. `barRng` is what the
 * bar draws its dice from (Farhold: `rpg.rng`). Returns { bar, mech, cast(slot, aimPoint), tick(dt) }.
 */
export function farholdSkills(F, field, player, control, barRng, { followers = false } = {}) {
  F.rpg.rng = barRng;
  Object.assign(control, {
    y: 0, swing: 0, moving: 0,
    teleport(x, z) { this.x = x; this.z = z; player.x = x; player.z = z; },
    facing() { return [Math.sin(this.yaw), Math.cos(this.yaw)]; },
  });
  player.x = control.x; player.z = control.z;
  const statuses = F.skills.statuses;
  const bar = createSkillBar({ data: F.skills, player, rpg: F.rpg });
  const pools = [];
  let aimAt = null;
  const statusForElement = el => CAST_ELEMENTS.find(e => e.element === el)?.status || null;
  const landStatus = (type, spec, enemy, power = 1) => O.farholdLandStatus(F, player, type, spec, enemy, power);
  const statusHook = (target, type, spec) => { if (target && spec) landStatus(type, spec, target, 1); };
  const aim = () => {
    let dx = Math.sin(control.yaw), dz = Math.cos(control.yaw);
    if (aimAt) { const ax = aimAt.x - control.x, az = aimAt.z - control.z, l = Math.hypot(ax, az); if (l > 0.01) { dx = ax / l; dz = az / l; } }
    return { x: control.x, y: 1.6, z: control.z, dx, dy: 0, dz };
  };
  const groundTarget = range => {
    if (aimAt) {
      const dx = aimAt.x - control.x, dz = aimAt.z - control.z, d = Math.hypot(dx, dz);
      if (d <= range) return { x: aimAt.x, y: 0, z: aimAt.z, dist: d };
      return { x: control.x + dx / d * range, y: 0, z: control.z + dz / d * range, dist: range };
    }
    return { x: control.x + Math.sin(control.yaw) * range, y: 0, z: control.z + Math.cos(control.yaw) * range, dist: range };
  };
  const uniqueEnv = {
    push(e, fromX, fromZ, metres) {
      const dx = e.x - fromX, dz = e.z - fromZ;
      const len = Math.hypot(dx, dz) || 1;
      const sign = metres < 0 ? -1 : 1;
      const want = sign < 0 ? Math.min(-metres, len * 0.9) : metres;
      const m = pushFor(e, want);
      if (m > 0.01) e.push = { dx: sign * dx / len, dz: sign * dz / len, metres: m, t: 0.18, span: 0.18, done: 0 };
    },
    arc() {},
  };
  const pets = { pets: [], register() {}, summon: () => Promise.resolve([]), order: () => 0, reviveAll: () => Promise.resolve([]), canAdmit: () => ({ ok: true }) };
  const mech = createSkillRuntime({
    THREE, makeActor: async () => null, setActorAnim() {},
    scene: { add() {}, remove() {} }, spellfx: sink(), fx: sink(), sound: sink(), rpg: F.rpg, skillData: F.skills,
    hud: { log() {} }, field: () => field, pets: () => pets, player: () => player, control: () => control,
    skills: () => bar, terrain: () => O.flat(), actor: () => null,
    uniqueEnv, landStatus, statusHook, reportHit() {}, ringPoints: () => [],
    groundTarget, aim, castSkill: (p, o) => castSkill(p, o), running: () => true, playerLook: () => null,
    rpgApply: (u, id, spec) => applyStatus(u, id, spec, 1), gathering: () => false, building: () => false,
  });
  setMechEnv(mech.mechEnv);
  // Farhold keeps traps, walls and corpses in ONE module-level world (the very thing js/rules/room.js
  // exists to split); a previous fixture's Rampart would otherwise still be standing here
  mech.reset();

  function dropPool({ x, z, r, seconds, element = 'physical', power = 0.5 }) {
    pools.push({ x, z, r, left: seconds, life: seconds, every: 0.75, next: 0.75, element, power });
  }
  function tickPools(dt) {
    for (let i = pools.length - 1; i >= 0; i--) {
      const p = pools[i];
      p.left -= dt; p.next -= dt;
      if (p.next <= 0) {
        p.next = p.every;
        const hits = field.strikeArea(p.x, p.z, p.r, player, { falloff: 0.2, element: p.element, power: p.power, proc: true });
        const leaves = statusForElement(p.element);
        for (const h of hits) if (leaves && statuses[leaves] && h.result?.amount > 0) landStatus(leaves, statuses[leaves], h.enemy, Math.max(1, h.result.amount * 0.7));
      }
      if (p.left <= 0) pools.splice(i, 1);
    }
  }

  const BOLT_SPEED = 48;
  /** main.js fireBolt (line ~1438), ground plane, no terrain clip (flat), timers for the flight */
  function fireBolt(plan, a, dx, dy, dz, strikeOpts, hop = 0) {
    const homing = (!hop && plan.homing) ? plan.homing : 0;
    let target = field.hitScan(a.x, 0.9 + (a.yBody || 0), a.z, dx, 0, dz, { range: plan.range, width: 1.4 + homing * 2.6 });
    if (!target && homing > 0) {
      const reach = 2.5 + homing * 3.5;
      for (let t = 4; t <= plan.range && !target; t += 3) {
        const found = field.nearestTo(a.x + dx * t, a.z + dz * t, reach);
        if (!found) continue;
        const ex = found.x - a.x, ez = found.z - a.z, len = Math.hypot(ex, ez) || 1;
        if (len > plan.range) continue;
        dx = ex / len; dz = ez / len;
        target = { enemy: found, distance: len };
      }
    }
    const dist = (plan.pierce && !hop) ? plan.range : (target ? target.distance : plan.range);
    const to = { x: a.x + dx * dist, z: a.z + dz * dist };
    const flight = Math.max(90, (dist / BOLT_SPEED) * 1000);
    const chase = target?.enemy || null;
    setTimeout(() => {
      const at = chase && chase.dying == null ? { x: chase.x, z: chase.z } : to;
      const splash = plan.splash * (F.rpg.fx.sum(player, 'boltSplash') || 1);
      const hits = field.strikeArea(at.x, at.z, splash, player, { falloff: 0.5, ...strikeOpts });
      if (!hop && plan.skill) mech.afterBolt(plan, { ...at, y: 1 }, hits, strikeOpts, hop);
      const left = (plan.chains || 0) - hop;
      if (left > 0) {
        const conductors = field.near(at.x, at.z, 12, chase).filter(e => e.statuses?.shock);
        const next = (conductors.sort((p, q) => Math.hypot(p.x - at.x, p.z - at.z) - Math.hypot(q.x - at.x, q.z - at.z))[0]) || field.nearestTo(at.x, at.z, 8, chase) || null;
        if (next) {
          const ndx = next.x - at.x, ndz = next.z - at.z, nlen = Math.hypot(ndx, ndz) || 1;
          const keep = plan.chainFalloff ?? 0.65;
          fireBolt({ ...plan, range: 14 }, { x: at.x, y: 1, z: at.z }, ndx / nlen, 0, ndz / nlen, { ...strikeOpts, power: (strikeOpts?.power ?? 1) * keep }, hop + 1);
        }
      }
    }, flight);
  }

  /** main.js castSkill (line ~1588), every effect call left out */
  function castSkill(i, { echo = false } = {}) {
    const plan = echo ? i : bar.use(i);
    if (!plan.ok) return plan;
    if (mech.intercept(plan, echo ? null : i)) return plan;
    const castFrom = { x: control.x, z: control.z, yaw: control.yaw };
    const hpBefore = player.hp;
    const a = plan.frozenAim || aim();
    const power = plan.mult;
    const onHit = (enemy, result) => {
      if (plan.status && plan.statusSpec) landStatus(plan.status, plan.statusSpec, enemy, Math.max(1, plan.damage * STATUS_POWER_SHARE * (plan.statusMult || 1)));
    };
    const strikeOpts = mech.decorate(plan, { power, element: plan.element, skill: plan.skill?.id, onHit, applyStatus: statusHook });
    if (plan.barrier > 0) {
      const gained = Math.max(1, Math.round((plan.damage || 0) * plan.barrier));
      player.barrier = Math.max(player.barrier || 0, gained);
      player.castBarrierFor = plan.barrierSeconds || 6;
    }
    if (!echo) {
      const cast = F.rpg.fx.onCast({ self: player, skill: plan.skill, applyStatus: statusHook });
      if (cast.refund && plan.spent > 0) { if (plan.paidWith === 'health') player.hp = Math.min(player.maxHp, player.hp + plan.spent); else player.mp = Math.min(player.maxMp, player.mp + plan.spent); }
      if (cast.echoCast > 0) setTimeout(() => castSkill({ ...plan, mult: plan.mult * cast.echoCast, damage: Math.round(plan.damage * cast.echoCast) }, { echo: true }), 300);
      if (cast.shockwave) field.strikeArea(control.x, control.z, 7, player, { element: 'arcane', power: 1.2, onHit });
    }
    if (plan.kind === 'summon' && plan.summon && typeof plan.summon === 'object') {
      /* nothing drawn */
    } else if (plan.kind === 'summon') {
      /* followers: not in the fixtures */
    } else if (plan.kind === 'beam' && plan.delay > 0 && !plan.beamFired) {
      const strikeOnly = { ...plan, beamFired: true, sub: true, frozenAim: { ...a }, place: null, pool: null, selfBuff: null, summon: null, taunt: null, command: null, barrier: null, ward: null, counter: null, imbue: null, link: null, burst: null, again: null, afterimage: null, empowerNext: null, empowerRepeat: null, wall: null, rewind: null, cleanse: null, revive: null, healPets: null, overflowBarrier: null, allyStatus: null, corpseBurst: null, clusters: null, dashWith: null, resetOn: null };
      setTimeout(() => castSkill(strikeOnly, { echo: true }), plan.delay * 1000);
    } else if (plan.kind === 'beam') {
      let healed = 0;
      for (const e of field.enemies) {
        if (e.dying != null) continue;
        const ex = e.x - a.x, ez = e.z - a.z;
        const along = ex * a.dx + ez * a.dz;
        if (along < 0 || along > plan.range) continue;
        if (Math.hypot(ex - a.dx * along, ez - a.dz * along) > plan.width + (e.reach || 2) * 0.3) continue;
        const result = F.rpg.strike(player, e, field.rng, { multiplier: power, element: plan.element, applyStatus: statusHook, skill: plan.skill?.id, rules: plan.rules, noDamage: !!plan.noDamage });
        e.hitFlash = 0.18;
        if (e.state !== 'chase') e.state = 'chase';
        field.land(e, result, { strike: strikeOpts.knock, fromX: control.x, fromZ: control.z, element: plan.element });
        strikeOpts.onHit(e, result);
        healed += Math.round(result.amount * (plan.healFrac || 0));
        if (result.dead) field.kill(e);
      }
      if (healed) player.hp = Math.min(player.maxHp, player.hp + healed);
    } else if (plan.kind === 'ground' && (plan.line || mech.takesRepeats(plan))) {
      const spot = groundTarget(plan.range);
      plan.at = spot;
      if (!mech.line(plan, spot, strikeOpts)) mech.repeats(plan, spot, strikeOpts);
    } else if (plan.kind === 'ground') {
      const spot = groundTarget(plan.range);
      plan.at = spot;
      const pulse = () => {
        if (plan.pull) for (const e of field.enemies) {
          if (e.dying != null || Math.hypot(e.x - spot.x, e.z - spot.z) > plan.radius + 1) continue;
          uniqueEnv.push(e, spot.x, spot.z, -plan.pull);
        }
        field.strikeArea(spot.x, spot.z, plan.radius, player, { falloff: 0.55, ...strikeOpts });
      };
      if (plan.delay) setTimeout(() => pulse(true), plan.delay * 1000); else pulse(true);
      for (let k = 1; k < plan.repeats; k++) setTimeout(() => pulse(false), (plan.delay + k * (plan.repeatEvery || 0.5)) * 1000);
      if (plan.ground > 0) dropPool({ x: spot.x, z: spot.z, r: plan.groundRadius || plan.radius, seconds: plan.ground, element: plan.element, power: power * 0.35 });
    } else if (plan.kind === 'dash' && mech.dash(plan, a, strikeOpts)) {
      /* done */
    } else if (plan.kind === 'dash') {
      const spot = groundTarget(plan.range);
      const dist = Math.min(plan.range, spot.dist);
      field.strikeSegment(control.x + a.dx, control.z + a.dz, control.x + a.dx * dist, control.z + a.dz * dist, plan.splash, player, { ...strikeOpts, falloff: 0.8 });
      control.teleport(control.x + a.dx * dist, control.z + a.dz * dist);
    } else if (plan.kind === 'self') {
      if (plan.heal) {
        const lift = 1 + F.rpg.fx.sum(player, 'healBonus');
        player.hp = Math.min(player.maxHp, player.hp + Math.round(plan.heal * lift));
      }
      if (plan.status && plan.statusSpec) applyStatus(player, plan.status, plan.statusSpec, 1);
      if (plan.trail) player.trail = { left: plan.trail.seconds, step: plan.trail.step || 1.4, radius: plan.trail.radius, burns: plan.trail.burns, power: plan.mult, element: plan.element, lastX: control.x, lastZ: control.z };
    } else if (plan.kind === 'melee') {
      const cone = () => {
        if (player.hp <= 0) return;
        const hits = field.strike(control, player, { reach: plan.reach, arc: plan.arc, ...strikeOpts });
        if (!plan.breath && plan.splash > 0) {
          const [sx, sz] = control.facing();
          const already = new Set(hits.map(h => h.enemy));
          for (const h of field.strikeArea(control.x + sx * plan.reach * 0.6, control.z + sz * plan.reach * 0.6, plan.splash, player, { falloff: 0.3, ...strikeOpts })) {
            if (!already.has(h.enemy)) hits.push(h);
          }
        }
      };
      cone();
      for (let k = 1; k < plan.repeats; k++) setTimeout(() => cone(false), k * (plan.repeatEvery || 0.32) * 1000);
    } else if (plan.kind === 'around' && mech.takesRepeats(plan)) {
      mech.repeats(plan, { x: control.x, z: control.z }, strikeOpts);
    } else if (plan.kind === 'around') {
      field.strikeArea(control.x, control.z, plan.radius, player, { falloff: 0.6, ...strikeOpts });
      for (let k = 1; k < plan.repeats; k++) {
        setTimeout(() => {
          if (player.hp <= 0) return;
          field.strikeArea(control.x, control.z, plan.radius, player, { falloff: 0.6, ...strikeOpts });
        }, k * (plan.repeatEvery || 0.32) * 1000);
      }
      if (plan.ground > 0) dropPool({ x: control.x, z: control.z, r: plan.groundRadius || plan.radius, seconds: plan.ground, element: plan.element, power: power * 0.35 });
      if (plan.healFrac) player.hp = Math.min(player.maxHp, player.hp + Math.round(player.maxHp * plan.healFrac));
    } else {
      const n = plan.projectiles || 1;
      for (let k = 0; k < n; k++) {
        const off = n === 1 ? 0 : (k / (n - 1) - 0.5) * plan.spread;
        const cs = Math.cos(off), sn = Math.sin(off);
        fireBolt(plan, a, a.dx * cs - a.dz * sn, a.dy, a.dx * sn + a.dz * cs, strikeOpts);
      }
    }
    mech.afterCast(plan, { a, hpBefore, origin: castFrom });
    return plan;
  }

  /**
   * main.js `swingWith` staff / wand / bow branches (line ~9166-9440), effects left out. `held` is
   * the seconds the button was held (the controller's chargeAt / drawPower on release).
   */
  function rangedAttack(held = 0, step = 0) {
    const hands = W.handsOf(player);
    const weapon = hands.main;
    const kind = W.isStaff(weapon) ? 'staff' : (weapon?.castElement && weapon?.ranged) ? 'bolt' : weapon?.ranged ? 'arrow' : 'melee';
    const mods = F.rpg.attackMods(player, kind, { weapon, hand: 'main' });
    const share = mods.power || 1;
    // the controller drinks the staff's mana while the button is held (player.js spendMana): the
    // released total is chargeAt's own `mana`
    if (kind === 'staff') { const c = W.chargeAt(held, player.derived.swing?.main?.charge || W.STAFF_CHARGE); if (c.mana > 0) player.mp = Math.max(0, player.mp - c.mana); }
    const shape = { ...W.withArea(W.strikeAt(weapon, step), player.derived.areaPct || 0) };
    if (mods.scale && mods.scale !== 1) shape.scale = (shape.scale || 1) * mods.scale;
    const element = mods.element || elementOf(weapon);
    const leaves = mods.element ? statusForElement(mods.element) : statusOf(weapon);
    const brandHit = (enemy, result) => { if (leaves && statuses[leaves] && result?.amount > 0) landStatus(leaves, statuses[leaves], enemy, Math.max(1, result.amount * 0.7)); };
    const meleeOpts = { element, onHit: brandHit, applyStatus: statusHook, power: share * shape.damage };
    const a = aim();
    if (kind === 'staff') {
      const spell = W.staffSpell(weapon, element);
      const charged = shape.charge && !shape.charge.tap ? W.chargedForm(spell) : null;
      const base = Math.max(1, Math.round((player.derived.damage[1] || 6) * (spell.mult || 1) * share));
      const radius = (spell.radius || spell.width || 3) * shape.scale;
      if (charged && charged.shape === 'jet') {
        const range = (spell.range || 9) * shape.scale * (charged.rangeScale || 1.45);
        const wide = (spell.arc || 0.9) * shape.scale * 0.8;
        const ticks = charged.ticks || 5;
        for (let i = 0; i < ticks; i++) setTimeout(() => {
          for (const { enemy } of field.strike(control, player, { reach: range, arc: wide, ...meleeOpts, power: meleeOpts.power / ticks })) if (spell.status) landStatus(spell.status, statuses[spell.status], enemy, Math.max(1, base * 0.4));
        }, i * 130);
        return;
      }
      if (charged && charged.shape === 'dome') {
        for (const { enemy, result } of field.strikeArea(control.x, control.z, radius, player, { falloff: 0.2, element, power: share * (spell.mult || 1) * (shape.charge?.power || 1) })) {
          brandHit(enemy, result);
          if (spell.status) landStatus(spell.status, statuses[spell.status], enemy, Math.max(1, base * 0.6));
          const dx = enemy.x - control.x, dz = enemy.z - control.z, len = Math.hypot(dx, dz) || 1;
          const metres = pushFor(enemy, charged.push || 2.4);
          if (metres > 0.01) enemy.push = { dx: dx / len, dz: dz / len, metres, t: 0.18, span: 0.18, done: 0 };
        }
        return;
      }
      if (charged && charged.shape === 'wall') {
        const ahead = 4.5 * shape.scale;
        dropPool({ x: control.x + a.dx * ahead, z: control.z + a.dz * ahead, r: radius * 1.15, seconds: charged.seconds || 3, element, power: share * (spell.mult || 1) * (shape.charge?.power || 1) * 0.5 });
        return;
      }
      if (spell.shape === 'nova') {
        for (const { enemy, result } of field.strikeArea(control.x, control.z, radius, player, { falloff: 0.35, element, power: share * (spell.mult || 1) * (shape.charge?.power || 1) })) {
          brandHit(enemy, result);
          if (spell.status) landStatus(spell.status, statuses[spell.status], enemy, Math.max(1, base * 0.6));
        }
      } else if (spell.shape === 'cone' || spell.shape === 'wave') {
        const range = (spell.range || 9) * shape.scale;
        const wide = spell.shape === 'cone' ? (spell.arc || 0.9) * shape.scale : 0.45;
        for (const { enemy } of field.strike(control, player, { reach: range, arc: wide, ...meleeOpts })) if (spell.status) landStatus(spell.status, statuses[spell.status], enemy, Math.max(1, base * 0.6));
      } else {
        const plan = talentPlan(player, 'staff:' + spell.key, { element, range: (spell.range || 12) * shape.scale, splash: radius, projectiles: 1, spread: 0, status: spell.status || leaves, statusSpec: (spell.status || leaves) ? statuses[spell.status || leaves] : null });
        if (charged?.shape === 'mortar') { plan.kind = 'ground'; plan.radius = radius * 1.4; plan.groundRadius = radius * 1.4; plan.ground = Math.max(plan.ground || 0, 3); }
        else if (charged?.shape === 'storm') plan.chains = charged.chains || 5;
        fireBolt(plan, a, a.dx, a.dy, a.dz, { ...meleeOpts, power: (spell.mult || 1) * (shape.charge?.power || 1) * (mods.power || 1) });
      }
      return;
    }
    if (kind === 'bolt') {
      const how = W.wandBehaviour(weapon);
      const plan = { element, range: (weapon.castRange ?? 34) * (how.slow ? 0.85 : 1), splash: (how.splash ?? 2.2) * shape.scale, projectiles: how.projectiles || 1, spread: how.spread || 0, chains: how.chains || 0, homing: how.homing || 0, status: leaves, statusSpec: leaves ? statuses[leaves] : null };
      fireBolt(plan, a, a.dx, a.dy, a.dz, { ...meleeOpts, power: (how.mult || 1) * share });
      return;
    }
    if (kind === 'arrow') {
      // the arrow's landing (onArrowLand) at the first body along the shot, at the draw's power
      const plan = player.derived.swing?.main;
      const range = plan?.range ?? F.balance.player?.arrowRange ?? 46;
      const power = plan?.hold === 'draw' ? W.drawPower(plan.draw, held).power : (plan?.power ?? 1);
      const target = field.hitScan(control.x, 0.9, control.z, a.dx, 0, a.dz, { range, width: 1.1 + (player.derived.arrowHoming || 0) * 2.6 });
      const dist = target ? target.distance : range;
      const at = { x: control.x + a.dx * dist, z: control.z + a.dz * dist };
      setTimeout(() => {
        const hits = field.strikeArea(at.x, at.z, F.balance.player?.arrowSplash ?? 2.6, player, { element, applyStatus: statusHook, power });
        for (const { enemy, result } of hits) if (leaves && statuses[leaves] && result.amount > 0) landStatus(leaves, statuses[leaves], enemy, Math.max(1, result.amount * 0.7));
      }, dist / (F.balance.player?.arrowSpeed ?? 42) * 1000);
    }
  }

  return {
    bar, mech, rangedAttack,
    cast(slot, aimPoint = null) { aimAt = aimPoint; return castSkill(slot); },
    /** one frame: the skill bar's clocks, the runtime's tick (placed objects, walls, links), the pools */
    tick(dt) { bar.update(dt, { fighting: true }); mech.tick(dt, { fighting: true }); tickPools(dt); },
  };
}
