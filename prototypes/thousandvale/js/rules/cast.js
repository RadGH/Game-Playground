// Thousandvale — the CAST PIPELINE: a player's attack and skill intents, resolved on the server.
//
// Forked from Farhold's main.js (`swingWith` line ~9126, `castSkill` line ~1588, `reportHit`
// ~2321, `onEnemyKilled` ~2646) over plain {x, z} positions and a room's field, with no HUD, no
// sound and no Three.js. The numbers are never forked: the skill PLAN comes from Farhold's own
// skill bar (skills.js `use`), every hit is Farhold's `rpg.strike`, every status Farhold's
// `applyStatus`. tests/C/parity-*.test.mjs pin that the same character, weapon, seed and target
// give the same damage here and in Farhold's own EnemyField.
//
// Usage (inside `room.run`):
//   const combat = createCombat(room);                    // once per room, after attachField
//   combat.attack(ch, { hand: 'main', yaw })              // a basic attack intent
//   combat.cast(ch, slot, { aim: {x, z}, target: id })    // a skill intent
//   combat.tick(dt)                                       // pending wind-ups, delayed strikes
//
// Every refusal returns { ok: false, why } — the client shows `why`, the evil-client suite checks
// nothing happened.

import {
  weaponHands, OFFHAND_DAMAGE, strikeAt, withArea, isStaff, elementOf, statusOf,
  applyStatus, controlFor, feel, STATUS_POWER_SHARE, drawPower, chargeAt, chargedForm, staffSpell,
  wandBehaviour, STAFF_CHARGE, talentPlan,
} from './farhold.js';
import { castSkillPlan, installSkillRuntime, throwBolt, runtimeFor } from './cast-skills.js';

/** rpg.js CAST_ELEMENTS, element -> the status it leaves (Farhold main.js `statusForElement`). */
const ELEMENT_LEAVES = { fire: 'burn', ice: 'chill', lightning: 'shock', poison: 'poison', shadow: 'curse', arcane: null };

export const CAST = {
  /** Farhold player.js `comboResetSeconds`: stop swinging this long and the pattern starts over */
  COMBO_RESET: 1.1,
  /** PLAN §7: melee range tolerance for lag */
  MELEE_SLACK: 0.5,
};

export function createCombat(room) {
  const field = room.field;
  const engine = room.engine;
  const rpg = engine.rpg;
  const statuses = engine.statuses;
  const balance = engine.balance;
  const pending = [];          // { at, fn } — wind-ups and delayed strikes, in room-clock seconds
  const now = () => room.clock.now();

  const combat = { room, field, pending };

  // ------------------------------------------------------------------ statuses (main.js landStatus)

  /** A status `caster` puts on `target`, with the caster's own duration/strength powers. */
  function landStatus(caster, type, spec, target, power = 1) {
    if (!type || !spec || !target) return null;
    if (target !== caster) {
      const ctl = controlFor(target, type, spec.seconds ?? 3);
      if (ctl.id !== type) { type = ctl.id; spec = { ...(statuses[ctl.id] || {}), seconds: ctl.seconds, ...(ctl.slow ? { slow: ctl.slow } : {}) }; }
      else if (ctl.seconds !== (spec.seconds ?? 3)) spec = { ...spec, seconds: ctl.seconds };
    }
    const longer = rpg.fx.sum(caster, 'statusLonger', { type, spec });
    const strength = rpg.fx.product(caster, 'statusPower', { type });
    const entry = applyStatus(target, type, spec, power, { longer, strength });
    if (entry) entry.by = caster.id;          // who to credit (threat, tagging) for a DoT tick
    return entry;
  }
  combat.landStatus = landStatus;
  /** main.js `statusHook`, per caster */
  const hookFor = caster => (target, type, spec) => { if (target && spec) landStatus(caster, type, spec, target, 1); };
  combat.hookFor = hookFor;

  // ------------------------------------------------------------------ rewards (main.js onEnemyKilled)

  /**
   * Shared tagging (PLAN §7): everybody who put damage in gets the kill — xp, gold, the kill's
   * restore and their OWN loot roll. Loot rolls on the room's 'loot' stream and every item gets a
   * uid (room id + counter) so the journal can prove it is never duplicated.
   */
  let uidN = 0;
  field.onKill = (e) => {
    const xpCfg = balance.xp || {};
    const lootRng = room.streams.get('loot');
    for (const [id] of e.damageBy || []) {
      const p = field.get(id);
      if (!p || p.kind !== 'player') continue;
      p.kills = (p.kills || 0) + 1;
      const back = rpg.onKillRestore(p);
      const post = rpg.fx.onKill({ self: p, target: e, applyStatus: (t, type, spec) => applyStatus(t, type, spec) });
      if (post.heal) p.hp = Math.min(p.maxHp, p.hp + post.heal);
      if (post.gold) p.gold += foundGold(p, post.gold);
      if (post.cooldownCut) p.skills.refresh(post.cooldownCut);
      if (post.rally) applyStatus(p, 'rally', statuses.rally, 1);
      const award = rpg.killXpFor(p, e, xpCfg);
      const coin = foundGold(p, e.gold);
      const drops = rpg.rollDrops(e, { rng: lootRng, magicFind: p.derived.magicFind }) || [];
      for (const it of drops) it.uid = `${room.id}:${++uidN}`;
      // the room owns experience, gold and the bag when it says so (js/rules/index.js sets `award`);
      // otherwise (tests, the parity fixtures) the sheet keeps them itself, as Farhold does
      let levels = 0;
      if (combat.award) combat.award(p, { xp: award, gold: coin, items: drops, from: e });
      else { levels = rpg.gainXp(p, award) || 0; p.gold += coin; }
      field.emit({ t: 'reward', to: p.id, from: e.id, xp: award, levels, level: p.level, gold: coin, restore: back, items: drops });
    }
  };
  const foundGold = (p, amount) => Math.max(0, Math.round(amount * (1 + (p.derived?.goldFind || 0) / 100)));

  // ------------------------------------------------------------------ the basic attack (main.js swingWith)

  /**
   * One basic attack. `yaw` is the facing the client swung at (validated as a number; the
   * server keeps the position). The swing clock is the weapon's own pattern, scaled by haste,
   * exactly as Farhold's controller runs it; damage lands after the wind-up.
   */
  combat.attack = (ch, { hand = 'main', yaw = null, held = 0 } = {}) => {
    if (!ch || ch.dead || ch.removed) return { ok: false, why: 'dead' };
    if (yaw != null && Number.isFinite(yaw)) ch.yaw = yaw;
    const hands = weaponHands(ch);
    const weapon = hand === 'off' ? hands.off : hands.main;
    if (hand === 'off' && !hands.dual) return { ok: false, why: 'no off-hand weapon' };
    const kind = isStaff(weapon) ? 'staff' : (weapon?.castElement && weapon?.ranged) ? 'bolt' : weapon?.ranged ? 'arrow' : 'melee';
    if (hand === 'off' && kind !== 'melee') return { ok: false, why: 'the off hand only swings' };

    const clock = ch.swing;
    const t = now();
    const readyKey = hand === 'off' ? 'offReady' : 'mainReady';
    if (t + 1e-9 < clock[readyKey]) return { ok: false, why: 'not ready', wait: clock[readyKey] - t };
    const plan = ch.derived.swing?.[hand === 'off' ? 'off' : 'main'];

    // ---- a held weapon (a drawn bow, a charged staff): the release is the attack. The client says
    // how long it held; the server never believes more than the time since the weapon was ready.
    if (hand === 'main' && (plan?.hold === 'draw' || plan?.hold === 'charge')) {
      const h = Math.max(0, Math.min(Number.isFinite(held) ? held : 0, t - (clock.readySince ?? clock[readyKey] ?? 0), 5));
      if (plan.hold === 'draw') {
        const d = drawPower(plan.draw, h);
        if (!d.ready) return { ok: false, why: 'not drawn', need: plan.draw?.min };
        clock[readyKey] = t + (plan.afterShot ?? 0.12);
        clock.readySince = clock[readyKey];
        clock.lastAt = t; clock.lastEvery = plan.afterShot ?? 0.12;
        field.emit({ t: 'swing', id: ch.id, hand, step: 0, clip: 'shoot', wind: 0, every: plan.afterShot ?? 0.12 });
        resolveArrow(ch, weapon, d.power);
        return { ok: true, hand, kind, power: d.power };
      }
      // the staff's channel drinks mana while held: hold no longer than you can pay for
      const c = plan.charge || STAFF_CHARGE;
      const affordable = (c.mana || 0) > 0 ? (ch.mp || 0) / c.mana : Infinity;
      const hh = h > c.min ? Math.max(c.min, Math.min(h, affordable)) : h;
      clock[readyKey] = t + (plan.afterCast ?? 0.28);
      clock.readySince = clock[readyKey];
      clock.lastAt = t; clock.lastEvery = plan.afterCast ?? 0.28;
      field.emit({ t: 'swing', id: ch.id, hand, step: 0, clip: 'castStaff', wind: 0, every: plan.afterCast ?? 0.28 });
      resolveStaff(ch, weapon, hh, c);
      return { ok: true, hand, kind, held: hh };
    }

    // ---- a click weapon (melee, wand, crossbow, javelin): the weapon's own pattern clock
    // the pattern starts over when you stop swinging (player.js comboResetSeconds)
    if (t - (clock.lastAt ?? -Infinity) > CAST.COMBO_RESET + (clock.lastEvery || 0)) { clock.mainStep = 0; clock.offStep = 0; ch.combo = 0; }
    const step = hand === 'off' ? clock.offStep : clock.mainStep;
    // the clock: the weapon's own `every` for this step, scaled by haste (main.js line ~8905)
    const base = balance.player?.attackEvery ?? 0.62;
    const hasteK = (ch.derived.attackEvery ?? base) / base;
    const sp = strikeAt(weapon, step);
    const nSteps = plan?.steps?.length || 1;
    const stepRow = plan?.steps?.[step % nSteps];
    let every = (kind === 'arrow' && stepRow?.every ? stepRow.every : sp.every) * hasteK;
    if (hand !== 'off' && plan?.flow && step > 0 && (step % nSteps) === nSteps - 1) every *= 0.35;
    let wind = ((stepRow?.windMs ?? 0) / 1000) * (sp.every > 0 ? every / sp.every : 1);
    let recover = wind * 0.45;
    const room90 = every * 0.9;
    if (wind + recover > room90 && wind + recover > 0) { const k = room90 / (wind + recover); wind *= k; recover *= k; }
    clock[readyKey] = t + every;
    clock.readySince = clock[readyKey];
    clock.lastAt = t; clock.lastEvery = every;
    if (hand === 'off') clock.offStep++; else clock.mainStep++;

    const fire = kind === 'melee' ? () => resolveSwing(ch, hand, step, weapon)
      : kind === 'bolt' ? () => resolveWand(ch, weapon, step)
        : () => resolveArrow(ch, weapon, plan?.power ?? 1);
    if (wind <= 0) fire(); else pending.push({ at: t + wind, fn: fire, who: ch.id });
    field.emit({ t: 'swing', id: ch.id, hand, step, clip: stepRow?.clip || 'attack', wind, every });
    return { ok: true, hand, kind, step, wind, every };
  };

  /** The facing as Farhold's `aim()`, flat. */
  const aimOfCh = ch => ({ x: ch.x, y: (ch.y || 0) + 1.6, z: ch.z, dx: Math.sin(ch.yaw), dy: 0, dz: Math.cos(ch.yaw) });

  /** A brand's status, as main.js `brandHit`. */
  const brandFor = (ch, leaves) => (enemy, result) => {
    if (leaves && statuses[leaves] && result?.amount > 0) landStatus(ch, leaves, statuses[leaves], enemy, Math.max(1, result.amount * 0.7));
  };

  /**
   * A BOW / CROSSBOW / JAVELIN (main.js `swingWith` ranged branch + `onArrowLand`). The arrow lands
   * where it was aimed — on the first body along the shot, or at full range — after its flight,
   * and strikes everything within the arrow splash at the draw's power.
   */
  function resolveArrow(ch, weapon, power) {
    const mods = rpg.attackMods(ch, 'arrow', { weapon, hand: 'main' });
    const element = mods.element || elementOf(weapon);
    const leaves = mods.element ? ELEMENT_LEAVES[mods.element] || null : statusOf(weapon);
    const plan = ch.derived.swing?.main;
    const range = plan?.range ?? balance.player?.arrowRange ?? 46;
    const speed = balance.player?.arrowSpeed ?? 42;
    const shots = Math.max(1, Math.round(ch.derived.arrowsPerShot || 1), mods.shots || 1);
    const spread = shots > 1 ? 0.08 : 0;
    const homing = ch.derived.arrowHoming || 0;
    const burst = ch.derived.arrowBurst || 0;
    const a = aimOfCh(ch);
    for (let i = 0; i < shots; i++) {
      const k = shots === 1 ? 0 : (i / (shots - 1) - 0.5) * 2;
      const yaw = Math.atan2(a.dx, a.dz) + k * spread;
      const dx = Math.sin(yaw), dz = Math.cos(yaw);
      const target = scanLine(ch.x, ch.z, dx, dz, range, 1.1 + homing * 2.6);
      const dist = target ? target.distance : range;
      const at = { x: ch.x + dx * dist, z: ch.z + dz * dist };
      field.emit({ t: 'fx', kind: 'arrow', id: ch.id, element, from: { x: ch.x, z: ch.z }, to: at, ms: Math.round(dist / speed * 1000) });
      const brand = brandFor(ch, leaves);
      // main.js bursts a quiver's arrowBurst at the moment of the shot, around what the scan found
      if (target && burst > 0) {
        const c = target.enemy;
        for (const { enemy, result } of field.strikeArea(c.x, c.z, burst, ch, { falloff: 0.4, power: 0.55, kind: 'burst' })) if (enemy !== c) brand(enemy, result);
      }
      combat.later(dist / speed, () => {
        if (ch.removed) return;
        const hits = field.strikeArea(at.x, at.z, balance.player?.arrowSplash ?? 2.6, ch, { element, applyStatus: hookFor(ch), power, kind: 'arrow' });   // main.js onArrowLand: the draw's power and nothing else
        for (const { enemy, result } of hits) brand(enemy, result);
      }, ch.id);
    }
  }
  function scanLine(x, z, dx, dz, range, width) {
    let best = null, bestT = Infinity;
    for (const e of field.monsters) {
      if (e.dying != null) continue;
      const ex = e.x - x, ez = e.z - z, tt = ex * dx + ez * dz;
      if (tt < 0 || tt > range) continue;
      if (Math.hypot(ex - dx * tt, ez - dz * tt) > width + (e.reach || 2) * 0.3) continue;
      if (tt < bestT) { bestT = tt; best = e; }
    }
    return best ? { enemy: best, distance: bestT } : null;
  }

  /** A WAND (main.js `swingWith` wand branch): its behaviour row decides the bolt. */
  function resolveWand(ch, weapon, step) {
    const mods = rpg.attackMods(ch, 'bolt', { weapon, hand: 'main' });
    const share = mods.power || 1;
    feel.swing.charge = null;
    const shape = { ...withArea(strikeAt(weapon, step), ch.derived.areaPct || 0) };
    if (mods.scale && mods.scale !== 1) shape.scale = (shape.scale || 1) * mods.scale;
    ch.lastStrike = shape;
    const element = mods.element || elementOf(weapon);
    const leaves = mods.element ? ELEMENT_LEAVES[mods.element] || null : statusOf(weapon);
    const how = wandBehaviour(weapon);
    const plan = {
      element, range: (weapon.castRange ?? 34) * (how.slow ? 0.85 : 1),
      splash: (how.splash ?? 2.2) * shape.scale, projectiles: how.projectiles || 1, spread: how.spread || 0,
      chains: how.chains || 0, homing: how.homing || 0, status: leaves, statusSpec: leaves ? statuses[leaves] : null,
    };
    const a = aimOfCh(ch);
    const opts = { element, onHit: brandFor(ch, leaves), applyStatus: hookFor(ch), power: (how.mult || 1) * share * shape.damage, kind: 'bolt' };
    // main.js passes `{ ...meleeOpts, power: how.mult * share }`, so the strike shape's own share is NOT in a wand bolt
    opts.power = (how.mult || 1) * share;
    throwBolt(combat, ch, plan, a, a.dx, a.dz, opts);
  }

  /**
   * A STAFF (main.js `swingWith` staff branch): a close-range spell by element, free to cast. A tap
   * is the ordinary spell; a real charge is its charged form (jet, dome, wall, mortar, storm).
   */
  function resolveStaff(ch, weapon, held, c) {
    const mods = rpg.attackMods(ch, 'staff', { weapon, hand: 'main' });
    const share = mods.power || 1;
    const charge = chargeAt(held, c);                       // posts the charge for withArea to fold in
    if (charge.mana > 0) ch.mp = Math.max(0, (ch.mp || 0) - charge.mana);
    const shape = { ...withArea(strikeAt(weapon, 0), ch.derived.areaPct || 0) };
    if (mods.scale && mods.scale !== 1) shape.scale = (shape.scale || 1) * mods.scale;
    ch.lastStrike = shape;
    const element = mods.element || elementOf(weapon);
    const leaves = mods.element ? ELEMENT_LEAVES[mods.element] || null : statusOf(weapon);
    const brand = brandFor(ch, leaves);
    const hook = hookFor(ch);
    const opts = { element, onHit: brand, applyStatus: hook, power: share * shape.damage, kind: 'staff' };
    // Farhold's field.strike falls back to the swing just posted (feel.swing.strike): the staff's
    // own strike shape is what a cone's knockback and stagger come from. Passed explicitly here.
    const coneOpts = { ...opts, strike: shape };
    const spell = staffSpell(weapon, element);
    const charged = shape.charge && !shape.charge.tap ? chargedForm(spell) : null;
    const base = Math.max(1, Math.round((ch.derived.damage[1] || 6) * (spell.mult || 1) * share));
    const radius = (spell.radius || spell.width || 3) * shape.scale;
    const a = aimOfCh(ch);
    const statusOn = (enemy, k) => { if (spell.status) landStatus(ch, spell.status, statuses[spell.status], enemy, Math.max(1, base * k)); };
    const rt = runtimeFor(combat);
    if (charged?.shape === 'jet') {
      const range = (spell.range || 9) * shape.scale * (charged.rangeScale || 1.45);
      const wide = (spell.arc || 0.9) * shape.scale * 0.8;
      const ticks = charged.ticks || 5;
      for (let i = 0; i < ticks; i++) combat.later(i * 0.13, () => {
        if (ch.dead) return;
        for (const { enemy } of field.strike(ch, ch, { reach: range, arc: wide, ...coneOpts, power: opts.power / ticks })) statusOn(enemy, 0.4);
      }, ch.id);
      return;
    }
    if (charged?.shape === 'dome') {
      for (const { enemy, result } of field.strikeArea(ch.x, ch.z, radius, ch, { falloff: 0.2, element, power: share * (spell.mult || 1) * (shape.charge?.power || 1), kind: 'staff' })) {
        brand(enemy, result); statusOn(enemy, 0.6);
        rt.push(enemy, ch.x, ch.z, charged.push || 2.4);
      }
      return;
    }
    if (charged?.shape === 'wall') {
      const ahead = 4.5 * shape.scale;
      rt.dropPool(ch, { x: ch.x + a.dx * ahead, z: ch.z + a.dz * ahead, r: radius * 1.15, seconds: charged.seconds || 3, element, power: share * (spell.mult || 1) * (shape.charge?.power || 1) * 0.5 });
      return;
    }
    if (spell.shape === 'nova') {
      for (const { enemy, result } of field.strikeArea(ch.x, ch.z, radius, ch, { falloff: 0.35, element, power: share * (spell.mult || 1) * (shape.charge?.power || 1), kind: 'staff' })) { brand(enemy, result); statusOn(enemy, 0.6); }
    } else if (spell.shape === 'cone' || spell.shape === 'wave') {
      const range = (spell.range || 9) * shape.scale;
      const wide = spell.shape === 'cone' ? (spell.arc || 0.9) * shape.scale : 0.45;
      for (const { enemy } of field.strike(ch, ch, { reach: range, arc: wide, ...coneOpts })) statusOn(enemy, 0.6);
    } else {
      const plan = talentPlan(ch, 'staff:' + spell.key, {
        element, range: (spell.range || 12) * shape.scale, splash: radius, projectiles: 1, spread: 0,
        status: spell.status || leaves, statusSpec: (spell.status || leaves) ? statuses[spell.status || leaves] : null,
      });
      if (charged?.shape === 'mortar') {
        // Farhold main.js labels the plan `kind: 'ground'` with a 1.4x radius and a 3 s pool, then
        // throws it through fireBolt — which reads neither, so its mortar IS the ordinary bolt. Kept
        // identical here (parity); reported as a Farhold dead-data finding in js/rules/README.md.
        plan.kind = 'ground'; plan.radius = radius * 1.4; plan.groundRadius = radius * 1.4; plan.ground = Math.max(plan.ground || 0, 3);
      }
      if (charged?.shape === 'storm') plan.chains = charged.chains || 5;
      throwBolt(combat, ch, plan, a, a.dx, a.dz, { ...opts, power: (spell.mult || 1) * (shape.charge?.power || 1) * (mods.power || 1) });
    }
  }

  /** The damage half of a swing — exactly `swingWith`'s melee branch, at the moment it lands. */
  function resolveSwing(ch, hand, step, weapon) {
    if (ch.dead || ch.removed) return [];
    const kind = 'melee';
    const mods = rpg.attackMods(ch, kind, { weapon, hand });
    const share = (hand === 'off' ? OFFHAND_DAMAGE : 1) * (mods.power || 1);
    feel.swing.charge = null;                 // a staff's charge is per player; never a leftover
    const shape = { ...withArea(strikeAt(weapon, step), ch.derived.areaPct || 0) };
    if (mods.scale && mods.scale !== 1) shape.scale = (shape.scale || 1) * mods.scale;
    ch.lastStrike = shape;
    const reach = shape.reach;
    const arc = mods.fullCircle ? Math.PI * 2 : shape.arc;
    const element = mods.element || elementOf(weapon);
    const leaves = mods.element ? ELEMENT_LEAVES[mods.element] || null : statusOf(weapon);
    const brandHit = (enemy, result) => {
      if (leaves && statuses[leaves] && result?.amount > 0) landStatus(ch, leaves, statuses[leaves], enemy, Math.max(1, result.amount * 0.7));
    };
    const opts = { element, onHit: brandHit, applyStatus: hookFor(ch), power: share * shape.damage, strike: shape, kind: 'swing' };
    const hits = field.strike(ch, ch, { reach, arc, ...opts });
    if (ch.perkFlags?.sunder && shape.last) for (const h of hits) h.enemy.armor = Math.max(0, (h.enemy.armor || 0) - 8);
    const swung = { self: ch, mana: 0 };
    rpg.fx.onSwing(swung);
    if (swung.mana > 0) ch.mp = Math.min(ch.derived.maxMp || ch.mp, ch.mp + swung.mana);
    const splash = (balance.player?.meleeSplash ?? 1) * (shape.splash || 1);
    if (splash > 0) {
      const dx = Math.sin(ch.yaw), dz = Math.cos(ch.yaw);
      const already = new Set(hits.map(h => h.enemy));
      for (const { enemy, result } of field.strikeArea(ch.x + dx * reach * 0.6, ch.z + dz * reach * 0.6, splash, ch, { falloff: 0.3, element, power: share * shape.damage, kind: 'splash' })) {
        if (!already.has(enemy)) { brandHit(enemy, result); hits.push({ enemy, result }); }
      }
    }
    return hits;
  }
  combat.resolveSwing = resolveSwing;

  // ------------------------------------------------------------------ skills

  /** A skill intent: Farhold's skill bar decides the plan, js/rules/cast-skills.js acts on it. */
  combat.cast = (ch, slot, intent = {}) => {
    if (!ch || ch.dead || ch.removed) return { ok: false, why: 'dead' };
    if (!Number.isInteger(slot) || slot < 0 || slot >= ch.skills.slots.length) return { ok: false, why: 'no such slot' };
    if (intent.yaw != null && Number.isFinite(intent.yaw)) ch.yaw = intent.yaw;
    return castSkillPlan(combat, ch, slot, intent);
  };
  combat.statusPowerShare = STATUS_POWER_SHARE;

  // ------------------------------------------------------------------ the tick

  /** Fire every pending wind-up / delayed strike that is due, then tick the skill bars. */
  combat.tick = (dt) => {
    const t = now();
    for (let i = 0; i < pending.length;) {
      if (pending[i].at <= t + 1e-9) { const p = pending.splice(i, 1)[0]; p.fn(); } else i++;
    }
    // main.js frame order: timers (above), the field (monsters), the skill bars, the skill runtime, pools
    combat.tickMonsters?.(dt);
    for (const p of field.players) if (!p.dead) p.skills.update(dt, { fighting: true });
    combat.tickExtra?.(dt);
  };
  combat.later = (seconds, fn, who = null) => pending.push({ at: now() + Math.max(0, seconds), fn, who });

  installSkillRuntime(combat);
  return combat;
}
