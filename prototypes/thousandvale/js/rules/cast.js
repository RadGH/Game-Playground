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

import { basicSpeed, flightOf, projOf, projFields } from './projectiles.js';
import { onKill as perkOnKill } from './perk-rules.js';
import {
  weaponHands, OFFHAND_DAMAGE, strikeAt, withArea, isStaff, elementOf, statusOf,
  applyStatus, controlFor, feel, STATUS_POWER_SHARE, drawPower, chargeAt, chargedForm, staffSpell,
  wandBehaviour, STAFF_CHARGE, talentPlan,
} from './farhold.js';
import { castSkillPlan, installSkillRuntime, throwBolt, runtimeFor } from './cast-skills.js';
import { killGold, goldFound } from './economy.js';
import { wandStyle, staffStyle, riderOf, isHeldFocus, isCaster, isSceptre, attackReach } from './caster-forms.js';

/** rpg.js CAST_ELEMENTS, element -> the status it leaves (Farhold main.js `statusForElement`). */
const ELEMENT_LEAVES = { fire: 'burn', ice: 'chill', lightning: 'shock', poison: 'poison', shadow: 'curse', arcane: null };

/**
 * Play-test 3 R5 — "gloom staff: no attack animation, no particle effect. ALL weapons need a prominent effect."
 * What every basic-attack event carries so the client can draw it without knowing the item: `wk` how the weapon
 * attacks (melee | arrow | bolt | staff), `wt` its type (items.json `subtype`: sword, staff, wand, bow…), `el` its
 * element (physical included — the client picks a look per element), `two` two-handed. The full event list is in
 * docs/protocol.md "Basic attacks" and docs/requests.md (C/A -> D-world, play-test 3 R5).
 */
export function weaponTag(weapon, kind = 'melee') {
  return { wk: kind, wt: weapon?.subtype || weapon?.baseKey || weapon?.key || 'fist', two: weapon?.twoHanded ? 1 : undefined };
}

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
    // the perk forest's `dotPct`: +% from your burns, poisons, bleeds and curses (a harmful status only)
    const dot = target.side === 'foe' && caster?.derived?.dotPct;
    const entry = applyStatus(target, type, spec, dot ? power * (1 + dot / 100) : power, { longer, strength });
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
    const xpCfg = engine.xpCfg || balance.xp || {};          // R2: kills x progression.json xp.killMult
    const lootRng = room.streams.get('loot');
    // Q3/Q4 — PARTY LOOT. When the room takes party loot (`combat.partyLoot`, js/rules/index.js -> the
    // host), a party that tagged the kill gets ONE drop for the corpse, rolled once with the party's
    // average magic find, and the host decides who gets what (free items / Need-Greed-Skip by threshold,
    // js/rules/loot-rules.js). A solo tagger — or any tagging when the room does not take party loot —
    // keeps its own roll, exactly as before.
    const taggers = [];
    for (const [id] of e.damageBy || []) { const p = field.get(id); if (p && p.kind === 'player') taggers.push(p); }
    const groups = new Map();
    if (combat.partyLoot) for (const p of taggers) if (p.partyId != null) (groups.get(p.partyId) || groups.set(p.partyId, []).get(p.partyId)).push(p);
    const partyDrop = new Map();          // member -> true: its items went to the party pile
    for (const [pid, members] of groups) {
      if (members.length < 2) continue;
      const mf = members.reduce((a, m) => a + (m.derived?.magicFind || 0), 0) / members.length;
      const drops = rpg.rollDrops(e, { rng: lootRng, magicFind: mf }) || [];
      for (const it of drops) it.uid = `${room.id}:${++uidN}`;
      for (const m of members) partyDrop.set(m, true);
      combat.partyLoot(members, drops, e, pid);
    }
    for (const p of taggers) {
      p.kills = (p.kills || 0) + 1;
      const back = rpg.onKillRestore(p);
      const post = rpg.fx.onKill({ self: p, target: e, applyStatus: (t, type, spec) => applyStatus(t, type, spec) });
      if (post.heal) p.hp = Math.min(p.maxHp, p.hp + post.heal);
      if (post.gold) p.gold += foundGold(p, post.gold);
      if (post.cooldownCut) p.skills.refresh(post.cooldownCut);
      if (post.rally) applyStatus(p, 'rally', statuses.rally, 1);
      if (post.petHeal) room.followers?.heal(p, post.petHeal);
      const rtk = runtimeFor(combat);
      rtk.withCaster(p, () => {
        if (post.breath) {
          for (const other of field.near(e.x, e.z, post.breath.radius, e)) {
            field.strikeArea(other.x, other.z, 1.5, p, { element: post.breath.element, power: 0.6, kind: 'unique' });
            applyStatus(other, post.breath.status, statuses[post.breath.status], 6);
          }
        }
        if (post.spreadStatuses && e.statuses) {
          for (const other of field.near(e.x, e.z, post.spreadStatuses, e)) for (const [type, st] of Object.entries(e.statuses)) applyStatus(other, type, statuses[type], st.power);
        }
        rtk.afterKill(p, post, e);
      });
      // the perk forest's own kill rules (js/rules/perk-rules.js): Momentum, Spoils, Contagion
      perkOnKill(field, p, e, { statuses, lastHit: e.lastHitBy === p.id });
      let award = rpg.killXpFor(p, e, engine.xpCfgFor ? engine.xpCfgFor(e.level) : xpCfg);      // W4: low-level monsters pay more
      // `xpFind` (gear and perks): Farhold's gainXp applies it; when the ROOM awards the experience it
      // never sees the sheet, so it is applied here (and only here)
      if (combat.award && p.derived?.xpFind) award = Math.round(award * (1 + p.derived.xpFind / 100));
      // owner feedback 7 (V2): a kill pays by its LEVEL and rank (data/rules/prices.json), not by Farhold's health curve;
      // gold find is applied here and nowhere else
      const coin = engine.prices
        ? goldFound(engine.prices, killGold(engine.prices, e.level || 1, { rank: e.rank, boss: !!e.boss, defGold: e.goldBase ?? null }), p.derived?.goldFind || 0)
        : foundGold(p, e.gold);
      const drops = partyDrop.has(p) ? [] : rpg.rollDrops(e, { rng: lootRng, magicFind: p.derived.magicFind }) || [];
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
  combat.attack = (ch, { hand = 'main', yaw = null, held = null, target = null } = {}) => {
    if (!ch || ch.dead || ch.removed) return { ok: false, why: 'dead' };
    if (ch.tvCast) runtimeFor(combat).cancelRevive(ch, 'acted');       // play-test 5 T4: swinging ends a revive being cast
    if (yaw != null && Number.isFinite(yaw)) ch.yaw = yaw;
    const hands = weaponHands(ch);
    const weapon = hand === 'off' ? hands.off : hands.main;
    if (hand === 'off' && !hands.dual) return { ok: false, why: 'no off-hand weapon' };
    const kind = isStaff(weapon) ? 'staff' : (weapon?.castElement && weapon?.ranged) ? 'bolt' : weapon?.ranged ? 'arrow' : 'melee';
    // play-test 5 (T15/T16): `form` = the caster style this attack takes; `imbue` = a sceptre's elemental swing
    const forms = engine.casterForms || null;
    const style = forms ? (kind === 'bolt' ? wandStyle(forms, weapon) : kind === 'staff' ? staffStyle(forms, weapon) : null) : null;
    const tag = { ...weaponTag(weapon, kind), el: elementOf(weapon) || 'physical',     // R5: on every swing event
      ...(style ? { form: style.key } : {}), ...(forms && kind === 'melee' && isSceptre(weapon) && weapon.castElement ? { imbue: 1 } : {}) };
    if (hand === 'off' && forms && isHeldFocus(weapon)) return { ok: false, why: 'a focus is held, not swung' };
    // Farhold: only a melee weapon swings from the off hand. Thousandvale (T15): an off-hand WAND fires its own bolt.
    if (hand === 'off' && kind !== 'melee' && !(forms && kind === 'bolt')) return { ok: false, why: 'the off hand only swings' };
    // play-test 5 T14: a ranged or caster attack on a NAMED target further than the attack really reaches is refused
    // before anything is spent — "a short-range cone starts shooting from out of range and waits for the enemy"
    if (forms && hand !== 'off' && target && kind !== 'melee') {
      const reach = attackReach(engine, ch);
      const d = Math.hypot(target.x - ch.x, target.z - ch.z) - (target.bodyR || 0.5);
      if (reach != null && d > reach + forms.rangeSlack) return { ok: false, why: `out of range (${Math.round(d)} m, reaches ${Math.round(reach)} m)`, refused: 'range', reach };
    }

    const clock = ch.swing;
    const t = now();
    const readyKey = hand === 'off' ? 'offReady' : 'mainReady';
    if (t + 1e-9 < clock[readyKey]) return { ok: false, why: 'not ready', wait: clock[readyKey] - t };
    const plan = ch.derived.swing?.[hand === 'off' ? 'off' : 'main'];

    // ---- a held weapon (a drawn bow, a charged staff): the release is the attack. The client says
    // how long it held; the server never believes more than the time since the weapon was ready.
    if (hand === 'main' && (plan?.hold === 'draw' || plan?.hold === 'charge')) {
      // the pattern step walks on every release, as the controller's mainStep does (it picks the shape)
      if (t - (clock.lastAt ?? -Infinity) > CAST.COMBO_RESET + (clock.lastEvery || 0)) { clock.mainStep = 0; ch.combo = 0; }
      const hstep = clock.mainStep++;
      const h = Math.max(0, Math.min(Number.isFinite(held) ? held : 0, t - (clock.readySince ?? clock[readyKey] ?? 0), 5));
      if (plan.hold === 'draw') {
        const after = plan.afterShot ?? 0.12;
        // play-test 2 Q1: "entering combat spams the weapon and reads 'not drawn, not drawn'". The client's
        // basic-attack key and its auto-attack send a CLICK (no `held`), and a click on a bow was refused
        // outright. Farhold never refuses one either (player.js: "a click still shoots" keeps drawing to the
        // nock on its own, and holding looses itself at full draw — `autoLoose`). So the server draws for you:
        //   * no `held` (a click / auto-attack): draw to FULL and loose on its own — a steady stream of full
        //     shots, the same cadence as holding the button in Farhold (draw.full + afterShot);
        //   * a `held` short of the nock: keep drawing to the nock and loose the weak shot;
        //   * a `held` past the nock: loose at once, at that draw's power (the parity path, unchanged).
        const auto = !Number.isFinite(held);
        const d = auto ? null : drawPower(plan.draw, h);
        if (auto || !d.ready) {
          const goal = auto ? (plan.draw?.full ?? 0.95) : (plan.draw?.min ?? 0.35);
          const wait = Math.max(0, goal - h);
          const power = drawPower(plan.draw, goal).power;
          clock[readyKey] = t + wait + after;
          clock.readySince = clock[readyKey];
          clock.lastAt = t + wait; clock.lastEvery = after;
          clock.drawing = { until: t + wait, target: target?.id ?? null };
          field.emit({ t: 'swing', id: ch.id, hand, step: 0, clip: 'draw', wind: wait, every: wait + after, range: plan.range, ...tag });
          combat.later(wait, () => {
            clock.drawing = null;
            if (ch.dead || ch.removed) return;
            // a drawn arrow follows the target it was drawn on (the room faced you at it when you pressed)
            const tg = target && target.dying == null && !target.dead && !target.removed ? target : null;
            if (tg) ch.yaw = Math.atan2(tg.x - ch.x, tg.z - ch.z);
            field.emit({ t: 'swing', id: ch.id, hand, step: 0, clip: 'shoot', wind: 0, every: after, range: plan.range, ...tag });
            resolveArrow(ch, weapon, power, hstep);
          }, ch.id);
          return { ok: true, hand, kind, drawing: true, wind: wait, every: wait + after, power };
        }
        clock[readyKey] = t + after;
        clock.readySince = clock[readyKey];
        clock.lastAt = t; clock.lastEvery = after;
        field.emit({ t: 'swing', id: ch.id, hand, step: 0, clip: 'shoot', wind: 0, every: after, range: plan.range, ...tag });
        resolveArrow(ch, weapon, d.power, hstep);
        return { ok: true, hand, kind, power: d.power, every: after };
      }
      // the staff's channel drinks mana while held: hold no longer than you can pay for
      const c = plan.charge || STAFF_CHARGE;
      const affordable = (c.mana || 0) > 0 ? (ch.mp || 0) / c.mana : Infinity;
      const hh = h > c.min ? Math.max(c.min, Math.min(h, affordable)) : h;
      clock[readyKey] = t + (plan.afterCast ?? 0.28);
      clock.readySince = clock[readyKey];
      clock.lastAt = t; clock.lastEvery = plan.afterCast ?? 0.28;
      field.emit({ t: 'swing', id: ch.id, hand, step: 0, clip: 'castStaff', wind: 0, every: plan.afterCast ?? 0.28, ...tag });
      resolveStaff(ch, weapon, hh, c, hstep, { target });
      return { ok: true, hand, kind, held: hh, every: plan.afterCast ?? 0.28 };
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
      : kind === 'bolt' ? () => resolveWand(ch, weapon, step, { hand, target })
        : () => resolveArrow(ch, weapon, plan?.power ?? 1, step);
    if (wind <= 0) fire(); else pending.push({ at: t + wind, fn: fire, who: ch.id });
    const shapeNow = kind === 'melee' ? strikeAt(weapon, step) : null;
    field.emit({ t: 'swing', id: ch.id, hand, step, clip: stepRow?.clip || 'attack', wind, every, ...tag, ...(shapeNow ? { reach: shapeNow.reach, arc: shapeNow.arc, strike: shapeNow.key || undefined } : {}) });
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
  function resolveArrow(ch, weapon, power, step = 0) {
    if (runtimeFor(combat).formBasic(ch, 'main')) return;
    const mods = rpg.attackMods(ch, 'arrow', { weapon, hand: 'main' });
    // swingWith posts the weapon's strike shape for every kind of attack; a melee skill borrows it
    feel.swing.charge = null;
    ch.lastStrike = { ...withArea(strikeAt(weapon, step), ch.derived.areaPct || 0) };
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
      // owner feedback 8 (W14): a slower arrow that is seen, and that homes on what it was loosed at
      const P = room.engine.projectiles || null;
      const prey = P && target ? target.enemy : null;
      const fly = P ? basicSpeed(P, weapon?.subtype) : speed;
      const flight = P ? flightOf(P, dist, fly) : dist / speed;
      field.emit({ t: 'fx', kind: 'arrow', id: ch.id, element, from: { x: ch.x, z: ch.z }, to: prey ? prey.id : at, ms: Math.round(flight * 1000), basic: 1, ...(P ? projFields(P, { speed: fly, proj: projOf(P, { element, wt: weapon?.subtype }), home: !!prey, skill: 'basic' }) : {}), ...weaponTag(weapon, 'arrow'), el: element });
      const brand = brandFor(ch, leaves);
      // main.js bursts a quiver's arrowBurst at the moment of the shot, around what the scan found
      if (target && burst > 0) {
        const c = target.enemy;
        for (const { enemy, result } of field.strikeArea(c.x, c.z, burst, ch, { falloff: 0.4, power: 0.55, kind: 'burst' })) if (enemy !== c) brand(enemy, result);
      }
      combat.later(flight, () => {
        if (ch.removed) return;
        if (prey) { at.x = prey.x; at.z = prey.z; }          // where it is now, or where it fell
        const hits = field.strikeArea(at.x, at.z, balance.player?.arrowSplash ?? 2.6, ch, { element, applyStatus: hookFor(ch), power, kind: 'arrow' });   // main.js onArrowLand: the draw's power and nothing else
        for (const { enemy, result } of hits) brand(enemy, result);
        runtimeFor(combat).resolveAttack(ch, mods, hits, { x: ch.x, z: ch.z, at: { x: at.x, z: at.z }, element });
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
  function resolveWand(ch, weapon, step, { hand = 'main', target = null, scale = 1, echo = false } = {}) {
    if (hand !== 'off' && runtimeFor(combat).formBasic(ch, 'main')) return;
    const forms = engine.casterForms || null;
    const st = forms ? wandStyle(forms, weapon) : null;
    const mods = rpg.attackMods(ch, 'bolt', { weapon, hand });
    // an off-hand wand (Thousandvale only) hits for the off-hand share; an Echo rider repeats at its own share
    const share = (mods.power || 1) * (hand === 'off' ? (forms?.offhandBolt ?? OFFHAND_DAMAGE) : 1) * scale;
    feel.swing.charge = null;
    const shape = { ...withArea(strikeAt(weapon, step), ch.derived.areaPct || 0) };
    if (mods.scale && mods.scale !== 1) shape.scale = (shape.scale || 1) * mods.scale;
    if (hand !== 'off') ch.lastStrike = shape;
    const element = mods.element || elementOf(weapon);
    const leaves = mods.element ? ELEMENT_LEAVES[mods.element] || null : statusOf(weapon);
    const how = st?.how || (st ? {} : wandBehaviour(weapon));
    const a = aimOfCh(ch);
    const mult = st?.mult ?? how.mult ?? 1;
    const brand = brandFor(ch, leaves);
    const rt = runtimeFor(combat);
    const tagOf = () => ({ basic: 1, ...weaponTag(weapon, 'bolt'), el: element, ...(st ? { form: st.key } : {}), ...(hand === 'off' ? { hand: 'off' } : {}) });
    const after = hits => { if (st) afterCasterHits(ch, weapon, hits, { hand, echo, element, share, redo: k => resolveWand(ch, weapon, step, { hand, target, scale: scale * k, echo: true }) }); };

    // ---- play-test 5 T15: the shapes that are not a projectile
    if (st && st.shape !== 'bolt') {
      const opts = { element, onHit: brand, applyStatus: hookFor(ch), power: mult * share, kind: 'bolt' };
      const yaw = Math.round(Math.atan2(a.dx, a.dz) * 1000) / 1000;
      if (st.shape === 'cone') {
        const reach = st.range * shape.scale, arc = st.arc * shape.scale;
        field.emit({ t: 'fx', kind: 'attack', id: ch.id, ...tagOf(), shape: 'cone', x: ch.x, z: ch.z, yaw, reach: Math.round(reach * 100) / 100, arc: Math.round(arc * 1000) / 1000 });
        const hits = field.strike(ch, ch, { reach, arc, strike: shape, ...opts });
        rt.resolveAttack(ch, mods, hits, { x: ch.x, z: ch.z, at: null, element });
        after(hits);
      } else if (st.shape === 'beam') {
        const len = st.range, to = { x: ch.x + a.dx * len, z: ch.z + a.dz * len };
        field.emit({ t: 'fx', kind: 'attack', id: ch.id, ...tagOf(), shape: 'beam', x: ch.x, z: ch.z, yaw, reach: len, w: st.width, to });
        const hits = field.strikeSegment(ch.x + a.dx * 0.5, ch.z + a.dz * 0.5, to.x, to.z, st.width / 2 * shape.scale + 0.4, ch, { ...opts, falloff: 1 });
        rt.resolveAttack(ch, mods, hits, { x: ch.x, z: ch.z, at: null, element });
        after(hits);
      } else if (st.shape === 'nova') {
        const r = st.radius * shape.scale;
        field.emit({ t: 'fx', kind: 'attack', id: ch.id, ...tagOf(), shape: 'nova', x: ch.x, z: ch.z, yaw, r: Math.round(r * 100) / 100 });
        const hits = field.strikeArea(ch.x, ch.z, r, ch, { ...opts, falloff: 0.35 });
        rt.resolveAttack(ch, mods, hits, { x: ch.x, z: ch.z, at: null, element });
        after(hits);
      } else {                                       // lob: an arc onto the target (else as far as it reaches along the aim)
        const tg = target && target.dying == null && !target.removed ? target : null;
        let dx = a.dx, dz = a.dz, dist = st.range;
        if (tg) { const ex = tg.x - ch.x, ez = tg.z - ch.z, len = Math.hypot(ex, ez) || 1; dx = ex / len; dz = ez / len; dist = Math.min(st.range, len); }
        const at = { x: ch.x + dx * dist, z: ch.z + dz * dist };
        const ms = Math.max(0.2, dist / (st.speed || 20));
        const r = st.radius * shape.scale;
        field.emit({ t: 'fx', kind: 'attack', id: ch.id, ...tagOf(), shape: 'lob', x: ch.x, z: ch.z, yaw, to: at, r: Math.round(r * 100) / 100, ms: Math.round(ms * 1000) });
        combat.later(ms, () => {
          if (ch.removed) return;
          rt.withCaster(ch, () => {
            const hits = field.strikeArea(at.x, at.z, r, ch, { ...opts, falloff: 0.5 });
            rt.resolveAttack(ch, mods, hits, { x: ch.x, z: ch.z, at: { x: at.x, z: at.z }, element });
            after(hits);
          });
        }, ch.id);
      }
      return;
    }

    const plan = {
      element, range: st && !st.how ? st.range : (weapon.castRange ?? 34) * (how.slow ? 0.85 : 1),
      splash: (st?.splash ?? how.splash ?? 2.2) * shape.scale, projectiles: how.projectiles || 1, spread: how.spread || 0,
      chains: how.chains || 0, homing: how.homing || 0, status: leaves, statusSpec: leaves ? statuses[leaves] : null,
    };
    const opts = { element, onHit: brand, applyStatus: hookFor(ch), power: mult * share * shape.damage, kind: 'bolt' };
    // main.js passes `{ ...meleeOpts, power: how.mult * share }`, so the strike shape's own share is NOT in a wand bolt
    opts.power = mult * share;
    plan.mods = mods;
    plan.fxTag = tagOf();      // R5: the client draws the wand's own bolt
    // T15: a forking / warding / pooling bolt and a focus rider act when the bolt lands (`collect` is handed its hits)
    let landed = false;
    const collect = st ? hits => {
      if (!landed) {
        landed = true;
        const first = hits.find(h => h.result?.amount > 0)?.enemy || null;
        if (first && st.split) {
          const used = new Set(hits.map(h => h.enemy));
          const shards = [];
          for (const e of field.near(first.x, first.z, st.split.range, first).filter(x => !used.has(x) && x.dying == null).slice(0, st.split.shards)) {
            field.emit({ t: 'fx', kind: 'bolt', id: ch.id, element, from: { x: first.x, z: first.z }, to: e.id, ms: 120, ...plan.fxTag, fork: 1 });
            shards.push(e.id);
            for (const h of field.strikeArea(e.x, e.z, 1, ch, { ...opts, falloff: 1, power: opts.power * st.split.keep })) hits.push(h);
          }
          field.emit({ t: 'fx', kind: 'chain', id: ch.id, element, first: first.id, targets: shards, fork: 1, ...plan.fxTag });
        }
        if (first && st.pool) rt.dropPool(ch, { x: first.x, z: first.z, r: st.pool.radius, seconds: st.pool.seconds, element, power: st.pool.power * share });
        if (first && st.ward) wardUp(ch, st.ward);
        after(hits);
      }
      return hits;
    } : (h => h);
    throwBolt(combat, ch, plan, a, a.dx, a.dz, opts, {}, collect);
    // Twin Bolt: a second bolt a beat behind the first, at a share of its damage
    if (mods.twin) combat.later(mods.twin.ms / 1000, () => throwBolt(combat, ch, { ...plan, mods: null, fxTag: plan.fxTag }, aimOfCh(ch), Math.sin(ch.yaw), Math.cos(ch.yaw), { ...opts, power: mult * share * mods.twin.power }), ch.id);
  }

  /** T15: a ward — each attack that hits tops up a small barrier (never past its cap). */
  function wardUp(u, w, by = null) {
    const capAmt = Math.round(u.maxHp * (w.cap ?? 0.1));
    const add = Math.round(u.maxHp * (w.share ?? 0.02));
    if ((u.barrier || 0) >= capAmt) { u.castBarrierFor = Math.max(u.castBarrierFor || 0, w.seconds ?? 4); return; }
    u.barrier = Math.min(capAmt, (u.barrier || 0) + add);
    if (u.kind === 'player') u.castBarrierFor = Math.max(u.castBarrierFor || 0, w.seconds ?? 4); else u.barrierFor = w.seconds ?? 4;
    field.emit({ t: 'fx', kind: 'ward', id: u.id, by: (by || u).id, amt: add });
  }

  /**
   * T15: what an off-hand FOCUS adds to a caster's main-hand attack once its hits are in (data/rules/caster-forms.json
   * `focusRiders`): Echo (every Nth attack repeats), Burst (a small burst round the first enemy struck), Ward (a
   * barrier), Siphon (mana). Never on the off hand's own bolt, never on an echo.
   */
  function afterCasterHits(ch, weapon, hits, { hand = 'main', echo = false, element, share = 1, redo = null } = {}) {
    const forms = engine.casterForms;
    if (!forms || hand === 'off' || echo || !isCaster(weapon)) return;
    const rider = riderOf(forms, weaponHands(ch).off);
    if (!rider) return;
    const first = hits.find(h => h.result?.amount > 0)?.enemy || null;
    if (rider.key === 'echo') {
      ch.swing.riderN = (ch.swing.riderN || 0) + 1;
      if (ch.swing.riderN % (rider.every || 4) === 0 && redo) combat.later(rider.delay ?? 0.25, () => { if (!ch.dead && !ch.removed) { field.emit({ t: 'fx', kind: 'rider', id: ch.id, rider: 'echo' }); redo(rider.mult ?? 0.6); } }, ch.id);
      return;
    }
    if (!first) return;
    if (rider.key === 'burst') {
      field.emit({ t: 'fx', kind: 'rider', id: ch.id, rider: 'burst', x: first.x, z: first.z, r: rider.radius, el: element });
      runtimeFor(combat).withCaster(ch, () => field.strikeArea(first.x, first.z, rider.radius, ch, { element, power: (rider.mult ?? 0.35) * share, falloff: 0.5, proc: true, kind: 'focus' }));
    } else if (rider.key === 'ward') wardUp(ch, rider);
    else if (rider.key === 'siphon') { ch.mp = Math.min(ch.maxMp ?? ch.mp, (ch.mp || 0) + (rider.mana || 0)); field.emit({ t: 'fx', kind: 'rider', id: ch.id, rider: 'siphon', amt: rider.mana || 0 }); }
  }

  /**
   * A STAFF (main.js `swingWith` staff branch): a close-range spell by element, free to cast. A tap
   * is the ordinary spell; a real charge is its charged form (jet, dome, wall, mortar, storm).
   */
  function resolveStaff(ch, weapon, held, c, step = 0, { target = null } = {}) {
    if (runtimeFor(combat).formBasic(ch, 'main')) return;
    const mods = rpg.attackMods(ch, 'staff', { weapon, hand: 'main' });
    const share = mods.power || 1;
    const charge = chargeAt(held, c);                       // posts the charge for withArea to fold in
    if (charge.mana > 0) ch.mp = Math.max(0, (ch.mp || 0) - charge.mana);
    const shape = { ...withArea(strikeAt(weapon, step), ch.derived.areaPct || 0) };
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
    const tvStyle = engine.casterForms ? staffStyle(engine.casterForms, weapon) : null;      // play-test 5 T15
    // R5: the staff's spell, drawn — the shape it really takes (a charged form, else the element's own spell)
    if (!tvStyle) {
      const form = charged?.shape || (spell.shape === 'nova' || spell.shape === 'cone' || spell.shape === 'wave' ? spell.shape : 'bolt');
      const reachM = form === 'jet' ? (spell.range || 9) * shape.scale * (charged.rangeScale || 1.45) : (form === 'cone' || form === 'wave') ? (spell.range || 9) * shape.scale : form === 'bolt' || form === 'mortar' || form === 'storm' ? (spell.range || 12) * shape.scale : undefined;
      field.emit({ t: 'fx', kind: 'attack', id: ch.id, ...weaponTag(weapon, 'staff'), el: element, shape: form, spell: spell.key || undefined, charged: charged ? 1 : undefined,
        x: ch.x, z: ch.z, yaw: Math.round(Math.atan2(a.dx, a.dz) * 1000) / 1000, r: form === 'nova' || form === 'dome' || form === 'wall' ? Math.round(radius * 100) / 100 : undefined,
        reach: reachM != null ? Math.round(reachM * 100) / 100 : undefined, arc: form === 'cone' ? (spell.arc || 0.9) * shape.scale : form === 'jet' ? (spell.arc || 0.9) * shape.scale * 0.8 : form === 'wave' ? 0.45 : undefined });
    }
    // ---- play-test 5 T15: Thousandvale's two staff styles (a lance, an aegis ring) replace the element's spell
    if (tvStyle) {
      const k = (tvStyle.mult ?? 1) * share * (shape.charge?.power || 1);
      const yawR = Math.round(Math.atan2(a.dx, a.dz) * 1000) / 1000;
      const tvTag = { ...weaponTag(weapon, 'staff'), el: element, form: tvStyle.key, basic: 1 };
      if (tvStyle.shape === 'beam') {
        const len = tvStyle.range * shape.scale, to = { x: ch.x + a.dx * len, z: ch.z + a.dz * len };
        field.emit({ t: 'fx', kind: 'attack', id: ch.id, ...tvTag, shape: 'beam', x: ch.x, z: ch.z, yaw: yawR, reach: Math.round(len * 100) / 100, w: tvStyle.width, to });
        const hits = field.strikeSegment(ch.x + a.dx * 0.5, ch.z + a.dz * 0.5, to.x, to.z, tvStyle.width / 2 + 0.4, ch, { element, onHit: brand, applyStatus: hook, power: k, falloff: 1, kind: 'staff' });
        for (const { enemy } of hits) statusOn(enemy, 0.6);
        rt.resolveAttack(ch, mods, hits, { x: ch.x, z: ch.z, at: null, element });
      } else {
        const r = tvStyle.radius * shape.scale;
        field.emit({ t: 'fx', kind: 'attack', id: ch.id, ...tvTag, shape: 'nova', x: ch.x, z: ch.z, yaw: yawR, r: Math.round(r * 100) / 100, ward: tvStyle.ward ? 1 : undefined });
        const hits = field.strikeArea(ch.x, ch.z, r, ch, { falloff: 0.35, element, power: k, kind: 'staff' });
        for (const { enemy, result } of hits) { brand(enemy, result); statusOn(enemy, 0.6); }
        rt.resolveAttack(ch, mods, hits, { x: ch.x, z: ch.z, at: null, element });
        if (tvStyle.ward && hits.some(h => h.result?.amount > 0)) {
          wardUp(ch, tvStyle.ward);
          if (tvStyle.ward.allies) for (const u of rt.allies(ch)) if (u !== ch && u.dying == null && !u.dead && Math.hypot(u.x - ch.x, u.z - ch.z) <= r) wardUp(u, tvStyle.ward, ch);
        }
      }
      return;
    }
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
      const domeHits = field.strikeArea(ch.x, ch.z, radius, ch, { falloff: 0.2, element, power: share * (spell.mult || 1) * (shape.charge?.power || 1), kind: 'staff' });
      rt.resolveAttack(ch, mods, domeHits, { x: ch.x, z: ch.z, at: null, element });
      for (const { enemy, result } of domeHits) {
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
      const novaHits = field.strikeArea(ch.x, ch.z, radius, ch, { falloff: 0.35, element, power: share * (spell.mult || 1) * (shape.charge?.power || 1), kind: 'staff' });
      for (const { enemy, result } of novaHits) { brand(enemy, result); statusOn(enemy, 0.6); }
      rt.resolveAttack(ch, mods, novaHits, { x: ch.x, z: ch.z, at: null, element });
    } else if (spell.shape === 'cone' || spell.shape === 'wave') {
      const range = (spell.range || 9) * shape.scale;
      const wide = spell.shape === 'cone' ? (spell.arc || 0.9) * shape.scale : 0.45;
      const coneHits = field.strike(ch, ch, { reach: range, arc: wide, ...coneOpts });
      for (const { enemy } of coneHits) statusOn(enemy, 0.6);
      rt.resolveAttack(ch, mods, coneHits, { x: ch.x, z: ch.z, at: null, element });
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
      // T15: Arc Lash's card says it chains — on a tap Farhold throws one plain bolt (only the charged storm jumps).
      // Thousandvale makes the tap honest: it jumps `spell.chains` times.
      else if (engine.casterForms && spell.shape === 'chain') plan.chains = spell.chains || 3;
      plan.mods = mods;
      plan.fxTag = { basic: 1, ...weaponTag(weapon, 'staff'), el: element };
      throwBolt(combat, ch, plan, a, a.dx, a.dz, { ...opts, power: (spell.mult || 1) * (shape.charge?.power || 1) * (mods.power || 1) });
    }
  }

  /** The damage half of a swing — exactly `swingWith`'s melee branch, at the moment it lands. */
  function resolveSwing(ch, hand, step, weapon) {
    if (ch.dead || ch.removed) return [];
    // main.js swingWith's first line: in a shape form the basic attack is the form's own
    if (runtimeFor(combat).formBasic(ch, hand)) return [];
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
    // R5: the swing itself, drawn at the moment it lands (a trail along the arc, in the weapon's element)
    const imbued = !!(engine.casterForms && isSceptre(weapon) && weapon.castElement);      // T16
    field.emit({ t: 'fx', kind: 'attack', id: ch.id, ...weaponTag(weapon, 'melee'), el: element, shape: 'swing', hand, step, ...(imbued ? { imbue: 1 } : {}), x: ch.x, z: ch.z, yaw: Math.round((ch.yaw || 0) * 1000) / 1000, reach: Math.round(reach * 100) / 100, arc: Math.round(arc * 1000) / 1000, strike: shape.key || undefined });
    const hits = field.strike(ch, ch, { reach, arc, ...opts });
    runtimeFor(combat).resolveAttack(ch, mods, hits, { x: ch.x, z: ch.z, at: null, element });   // unique powers
    if (ch.perkFlags?.sunder && shape.last) for (const h of hits) h.enemy.armor = Math.max(0, (h.enemy.armor || 0) - 8);
    if (imbued) afterCasterHits(ch, weapon, hits, { hand, element, share, redo: null });                 // T15: a focus rider on a sceptre
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
  combat.resolveWand = (ch, w, step = 0, opts = {}) => resolveWand(ch, w, step, opts);
  combat.resolveArrow = (ch, w, power = 1, step = 0) => resolveArrow(ch, w, power, step);

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
    // due timers fire in the order they fall due (as setTimeout does), ties in the order they were set;
    // something a timer schedules for "now" fires in this same pass
    const t = now();
    for (;;) {
      let best = -1;
      for (let i = 0; i < pending.length; i++) if (pending[i].at <= t + 1e-9 && (best < 0 || pending[i].at < pending[best].at - 1e-12)) best = i;
      if (best < 0) break;
      pending.splice(best, 1)[0].fn();
    }
    // main.js frame order: timers (above), the field (monsters), the skill bars, the skill runtime, pools
    combat.tickMonsters?.(dt);
    // main.js frame order: the field, then the companions, then the skill bars
    room.followers?.tick(dt, runtimeFor(combat).petHooks);
    for (const p of field.players) if (!p.dead) p.skills.update(dt, { fighting: true });
    combat.tickExtra?.(dt);
  };
  combat.later = (seconds, fn, who = null) => pending.push({ at: now() + Math.max(0, seconds), fn, who });

  installSkillRuntime(combat);
  return combat;
}
