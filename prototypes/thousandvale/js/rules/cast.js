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
  weaponHands, OFFHAND_DAMAGE, strikeAt, withArea, isStaff, isWand, elementOf, statusOf,
  applyStatus, controlFor, feel, STATUS_POWER_SHARE,
} from './farhold.js';
import { castSkillPlan, installSkillRuntime } from './cast-skills.js';

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
      const levels = rpg.gainXp(p, award);
      const coin = foundGold(p, e.gold);
      p.gold += coin;
      const drops = rpg.rollDrops(e, { rng: lootRng, magicFind: p.derived.magicFind }) || [];
      for (const it of drops) it.uid = `${room.id}:${++uidN}`;
      field.emit({ t: 'reward', to: p.id, from: e.id, xp: award, levels: levels || 0, level: p.level, gold: coin, restore: back, items: drops });
    }
  };
  const foundGold = (p, amount) => Math.max(0, Math.round(amount * (1 + (p.derived?.goldFind || 0) / 100)));

  // ------------------------------------------------------------------ the basic attack (main.js swingWith)

  /**
   * One basic attack. `yaw` is the facing the client swung at (validated as a number; the
   * server keeps the position). The swing clock is the weapon's own pattern, scaled by haste,
   * exactly as Farhold's controller runs it; damage lands after the wind-up.
   */
  combat.attack = (ch, { hand = 'main', yaw = null } = {}) => {
    if (!ch || ch.dead || ch.removed) return { ok: false, why: 'dead' };
    if (yaw != null && Number.isFinite(yaw)) ch.yaw = yaw;
    const hands = weaponHands(ch);
    const weapon = hand === 'off' ? hands.off : hands.main;
    if (hand === 'off' && !hands.dual) return { ok: false, why: 'no off-hand weapon' };
    const kind = isStaff(weapon) ? 'staff' : (weapon?.castElement && weapon?.ranged) ? 'bolt' : weapon?.ranged ? 'arrow' : 'melee';
    if (kind !== 'melee') return { ok: false, why: `${kind} attacks are not ported yet` };

    const clock = ch.swing;
    const t = now();
    const readyKey = hand === 'off' ? 'offReady' : 'mainReady';
    if (t + 1e-9 < clock[readyKey]) return { ok: false, why: 'not ready', wait: clock[readyKey] - t };
    // the pattern starts over when you stop swinging (player.js comboResetSeconds)
    if (t - (clock.lastAt ?? -Infinity) > CAST.COMBO_RESET + (clock.lastEvery || 0)) { clock.mainStep = 0; clock.offStep = 0; ch.combo = 0; }
    const step = hand === 'off' ? clock.offStep : clock.mainStep;

    // the clock: the weapon's own `every` for this step, scaled by haste (main.js line ~8905)
    const base = balance.player?.attackEvery ?? 0.62;
    const hasteK = (ch.derived.attackEvery ?? base) / base;
    const sp = strikeAt(weapon, step);
    let every = sp.every * hasteK;
    const plan = ch.derived.swing?.[hand === 'off' ? 'off' : 'main'];
    const nSteps = plan?.steps?.length || 1;
    if (hand !== 'off' && plan?.flow && step > 0 && (step % nSteps) === nSteps - 1) every *= 0.35;
    const stepRow = plan?.steps?.[step % nSteps];
    let wind = ((stepRow?.windMs ?? 0) / 1000) * (sp.every > 0 ? every / sp.every : 1);
    let recover = wind * 0.45;
    const room90 = every * 0.9;
    if (wind + recover > room90 && wind + recover > 0) { const k = room90 / (wind + recover); wind *= k; recover *= k; }
    clock[readyKey] = t + every;
    clock.lastAt = t; clock.lastEvery = every;
    if (hand === 'off') clock.offStep++; else clock.mainStep++;

    const fire = () => resolveSwing(ch, hand, step, weapon);
    if (wind <= 0) fire(); else pending.push({ at: t + wind, fn: fire, who: ch.id });
    field.emit({ t: 'swing', id: ch.id, hand, step, clip: stepRow?.clip || 'attack', wind, every });
    return { ok: true, hand, step, wind, every };
  };

  /** The damage half of a swing — exactly `swingWith`'s melee branch, at the moment it lands. */
  function resolveSwing(ch, hand, step, weapon) {
    if (ch.dead || ch.removed) return [];
    const kind = 'melee';
    const mods = rpg.attackMods(ch, kind, { weapon, hand });
    const share = (hand === 'off' ? OFFHAND_DAMAGE : 1) * (mods.power || 1);
    feel.swing.charge = null;                 // a staff's charge is per player; never a leftover
    const shape = { ...withArea(strikeAt(weapon, step), ch.derived.areaPct || 0) };
    if (mods.scale && mods.scale !== 1) shape.scale = (shape.scale || 1) * mods.scale;
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
    for (const p of field.players) if (!p.dead) p.skills.update(dt, { fighting: true });
    combat.tickExtra?.(dt);
  };
  combat.later = (seconds, fn, who = null) => pending.push({ at: now() + Math.max(0, seconds), fn, who });

  installSkillRuntime(combat);
  return combat;
}
