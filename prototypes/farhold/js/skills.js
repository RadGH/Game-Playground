// Farhold — the skill bar.
//
// Six skills on keys 1-6, unlocked as you level, each with a cooldown and a mana cost, drawn with
// the spell effects `avatar-3d/js/spellfx.js` already has. Emberveil's skills are written for a
// turn-based party fight — "adjacent2", "row", "per_source" — which means nothing to one person
// standing in a field, so these are its ideas rebuilt around a shape, a radius and a cast.
//
// The model is pure: it decides what a skill does and to whom. The caller draws it and applies the
// damage, so the node tests can drive the whole thing without a renderer.
//
// Round 4 added: the other eight shapes (beam, ground, dash, summon), eight more statuses, level
// unlocks, and the two affixes that touch this file — `cooldownReduction` and
// `cond_skillMpCostReduce`.
//
// ROUND 11: **the skill talents were never applied to a skill.**
//
// "Fanned is unlocked but only ONE projectile appears." `js/skilltalents.js` has done the work
// since round 8 and `js/main.js` only ever called it for a staff's own spell — `castSkill` took
// what `use()` returned and drew that, so every one of the eighteen talents on the Skills screen
// was a sentence and nothing else. The fold happens HERE now, in `use()`, which is the one place
// every skill's plan is built, so nothing downstream had to change to make the whole board live.

import { talentPlan, talentsOn, castRulesFrom } from './skilltalents.js';

/** Statuses live on the target as `{ type, remaining, power, … }`. */
export function applyStatus(target, type, spec, power = 1, { longer = 0, strength = 1 } = {}) {
  if (!spec) return null;
  target.statuses = target.statuses || {};
  const existing = target.statuses[type];
  const entry = {
    type, remaining: (spec.seconds || 4) + longer, power: power * strength,
    perSecond: spec.perSecond ?? 0, slow: spec.slow ?? 0,
    damage: spec.damage ?? 0, resist: spec.resist ?? 0,
    takeMore: spec.takeMore ?? 0, dealLess: spec.dealLess ?? 0,
    haste: spec.haste ?? 0, move: spec.move ?? 0, armor: spec.armor ?? 0,
    healPerSecond: spec.healPerSecond ?? 0,
    element: spec.element, name: spec.name, kind: spec.kind,
  };
  // refreshing beats stacking: a second burn resets the timer rather than doubling the pain
  target.statuses[type] = existing ? { ...entry, remaining: Math.max(existing.remaining, entry.remaining) } : entry;
  return target.statuses[type];
}

/** How often a damage-over-time status actually lands, in seconds. */
export const TICK_EVERY = 1;

/**
 * Tick every status on a unit. Returns the damage it took this step (healing counts negative).
 *
 * **Damage over time lands in whole ticks, not per frame.** It used to take `perSecond * dt` sixty
 * times a second, which is arithmetically the same total and reads as nothing at all: "poison
 * damage, at least from the ranger's poison dart skill, seems to only do one damage per tick and is
 * almost useless". A second's worth arriving at once is the same damage and a legible number, and
 * it is how every game that has a poison does it.
 *
 * Healing still runs per frame — a regeneration that arrived in lumps would look like a stutter.
 */
export function tickStatuses(unit, dt, { resist = 1 } = {}) {
  if (!unit.statuses) return 0;
  let damage = 0, healed = 0;
  for (const [type, st] of Object.entries(unit.statuses)) {
    st.remaining -= dt;
    if (st.perSecond) {
      st.since = (st.since || 0) + dt;
      const expiring = st.remaining <= 0;
      // pay out on the tick, and pay out whatever is left over when the status runs out, so a
      // three-and-a-half-second burn does not silently drop its last half second
      if (st.since >= TICK_EVERY || expiring) {
        const span = expiring ? st.since : TICK_EVERY;
        damage += st.perSecond * st.power * span * resist;
        st.since = expiring ? 0 : st.since - TICK_EVERY;
      }
    }
    if (st.healPerSecond) healed += st.healPerSecond * (unit.maxHp || 0) * dt;
    if (st.remaining <= 0) delete unit.statuses[type];
  }
  if (healed > 0) unit.hp = Math.min(unit.maxHp ?? unit.hp, (unit.hp ?? 0) + healed);
  if (damage > 0) unit.hp = Math.max(0, (unit.hp ?? 0) - damage);
  return damage;
}

/** How much a unit's statuses slow it, 0..1. */
export function slowOf(unit) {
  let slow = 0;
  for (const st of Object.values(unit.statuses || {})) slow = Math.max(slow, st.slow || 0);
  return slow;
}

/** Everything a unit's statuses change about how it fights. */
export function buffsOf(unit) {
  let damage = 0, resist = 0, takeMore = 0, dealLess = 0, haste = 0, move = 0, armor = 0;
  for (const st of Object.values(unit.statuses || {})) {
    damage += st.damage || 0; resist += st.resist || 0;
    takeMore += st.takeMore || 0; dealLess += st.dealLess || 0;
    haste += st.haste || 0; move += st.move || 0; armor += st.armor || 0;
  }
  return {
    damage, resist: Math.min(0.8, resist), takeMore,
    dealLess: Math.min(0.8, dealLess), haste, move, armor,
  };
}

/** The single multiplier a unit's statuses put on damage it deals. */
export function outgoingFrom(unit) {
  const b = buffsOf(unit);
  return (1 + b.damage) * (1 - b.dealLess);
}
/** …and on damage it takes. */
export function incomingFrom(unit) {
  const b = buffsOf(unit);
  return (1 + b.takeMore) * (1 - b.resist);
}

export function createSkillBar({ data, player, rpg, unlocks = null }) {
  const ids = data.classes?.[player.classId] || data.classes?.ranger || [];
  const unlockAt = unlocks || data.unlockAt || [1, 3, 7, 12, 18, 24];
  const slots = ids.map((id, i) => ({
    id, ...(data.skills[id] || {}),
    cooldown: data.skills[id]?.cooldown ?? 6,
    ready: 0,
    unlockAt: unlockAt[i] ?? 1,
  }));

  function update(dt) {
    for (const s of slots) if (s.ready > 0) s.ready = Math.max(0, s.ready - dt);
    /**
     * HUNGER pays out here. `rpg.strike` cannot reach into the bar, so a kill taken by a skill with
     * the Hunger talent leaves the seconds owed on the player and this hands them to the right
     * slot on the next frame. Without it the talent was a sentence: the plan carried `killRefund`
     * and nothing ever looked at it.
     */
    const owed = player.cooldownRefund;
    if (owed && owed.seconds > 0) {
      const s = slots.find(x => x.id === owed.skill);
      if (s) s.ready = Math.max(0, s.ready - owed.seconds);
      player.cooldownRefund = null;
    }
  }

  /**
   * Every cooldown comes back sooner with `cooldownReduction` on your gear — and with the
   * Quickened talent, which is a share of the skill's own cooldown rather than a share of yours.
   */
  function cooldownFor(s) {
    const cut = Math.min(60, player.derived?.cooldownReduction || 0) / 100;
    let base = s.cooldown;
    for (const node of talentsOn(player, s.id)) {
      if (node.mod?.cooldownPct) base *= 1 + node.mod.cooldownPct / 100;
    }
    return Math.max(0.5, base * (1 - cut));
  }
  /** …and cost less with `cond_skillMpCostReduce`, which is a FLAT saving, not a percentage. */
  function costFor(s) {
    const off = rpg?.fx ? rpg.fx.sum(player, 'costFlat') : 0;
    return Math.max(0, Math.round((s.mp || 0) - off));
  }

  /**
   * BLOOD PRICE, the arcane keystone: "Skills cost health instead of mana, and never fail for want
   * of it." It was a flag nothing read. This is the only place a skill is paid for, so it is the
   * only place the swap can happen — and because the cost never fails, a skill is only ever refused
   * for its cooldown or its level.
   */
  function bloodPrice() { return !!player.perkFlags?.bloodMagic; }

  function unlocked(s) { return (player.level || 1) >= s.unlockAt; }

  /** Can this slot be used right now, and if not, why? */
  function check(index) {
    const s = slots[index];
    if (!s) return { ok: false, why: null };
    if (!unlocked(s)) return { ok: false, why: `${s.name} unlocks at level ${s.unlockAt}` };
    if (s.ready > 0) return { ok: false, why: `${s.name} is not ready (${s.ready.toFixed(1)}s)` };
    if (!bloodPrice() && costFor(s) > player.mp) return { ok: false, why: `Not enough mana for ${s.name}` };
    return { ok: true, skill: s };
  }

  /**
   * Fire a slot. Returns a plan for the caller to draw and apply:
   *   { skill, kind: 'melee'|'around'|'bolt'|'beam'|'ground'|'dash'|'summon'|'self', … }
   */
  function use(index) {
    const can = check(index);
    if (!can.ok) return { ok: false, why: can.why };
    const s = can.skill;
    const cost = costFor(s);
    // Blood Price pays in health and never kills you outright — a keystone that could end the run
    // on a mistimed cast would only teach people not to press the button.
    if (bloodPrice()) player.hp = Math.max(1, player.hp - cost);
    else player.mp = Math.max(0, player.mp - cost);
    s.ready = cooldownFor(s);

    const d = player.derived;
    // spell power lifts anything that is not a plain physical swing
    const magic = s.element && s.element !== 'physical' ? 1 + (d.spellPower || 0) : 1;
    const mid = ((d.damage[0] + d.damage[1]) / 2) * (s.mult || 1) * magic;
    const plan = {
      ok: true,
      skill: s,
      kind: s.shape,
      element: s.element || 'physical',
      mult: (s.mult || 1) * magic,
      damage: Math.max(1, Math.round(mid)),
      reach: s.reach ?? 3, arc: s.arc ?? 1.5,
      radius: s.radius ?? 0, range: s.range ?? 0, splash: s.splash ?? 0, width: s.width ?? 1.8,
      // a bolt can be a fan of several: Multi Shot firing one arrow was not a multi shot
      projectiles: Math.max(1, s.projectiles ?? 1), spread: s.spread ?? 0,
      status: s.status || null,
      statusSpec: s.status ? data.statuses[s.status] : null,
      // A skill whose whole point is what it leaves behind says so, and its status hits harder than
      // the same status applied as a side effect of something else.
      statusMult: s.statusMult ?? 1,
      heal: s.heal ? Math.round(player.maxHp * s.heal) : 0,
      healFrac: s.heal || 0,
      /**
       * `petSlots` — the perk the play-test asked about by name ("One more companion follows you —
       * what companion?"). It is a real number now: every summoning skill calls up that many more.
       * The class roster you start the run with is summoned in js/main.js and still needs its own
       * line; see the note on `petSlots` in js/perks.js.
       */
      pet: s.pet || null,
      petCount: Math.max(1, (s.count || 1) + Math.round(d.petSlots || 0)),
      pets: !!s.pets,
      spent: cost,
      paidWith: bloodPrice() ? 'health' : 'mana',
    };

    /**
     * AND NOW THE TALENTS. This one line is the whole of D7: the board was built, the modifiers
     * were written and tested, and nothing ever ran them on a skill you actually cast.
     */
    const out = talentPlan(player, s.id, plan);

    /**
     * Deepening lengthens what the skill leaves on the target. `statusSpec` is the shared row out of
     * `data/skills.json`, so it is CLONED before the seconds are changed — writing to it would have
     * made every burn in the game longer for the rest of the run.
     */
    if (out.statusLonger && out.statusSpec) {
      out.statusSpec = { ...out.statusSpec, seconds: (out.statusSpec.seconds || 4) + out.statusLonger };
    }
    /**
     * The hit-time talents ride on the player until the swing lands — `rpg.strike` reads them back.
     * Cleared to null when this skill has none, so a plain skill can never inherit the last one's.
     */
    player.castRules = castRulesFrom(s.id, out);
    return out;
  }

  /** Cut every cooldown by `n` seconds — the `skill_refresh` legendary does this on a kill. */
  function refresh(n) { for (const s of slots) s.ready = Math.max(0, s.ready - n); }

  return {
    slots, update, use, check, refresh, cooldownFor, costFor,
    /** For the HUD. */
    state: () => slots.map(s => ({
      id: s.id, name: s.name, desc: s.desc, mp: costFor(s),
      ready: s.ready, cooldown: cooldownFor(s),
      locked: !unlocked(s), unlockAt: s.unlockAt,
      usable: unlocked(s) && s.ready <= 0 && costFor(s) <= player.mp,
      // `shape` and `element` were missing, and the Skills screen asks for `chosen.shape || 'bolt'`
      // — so every skill in the game was offered the BOLT talent tree. A ground rune was offered
      // "Fanned". They are cheap to carry and nothing else has to change.
      shape: s.shape, element: s.element,
    })),
  };
}
