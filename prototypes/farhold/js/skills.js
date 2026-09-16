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

/** Tick every status on a unit. Returns the damage it took this step (healing counts negative). */
export function tickStatuses(unit, dt, { resist = 1 } = {}) {
  if (!unit.statuses) return 0;
  let damage = 0, healed = 0;
  for (const [type, st] of Object.entries(unit.statuses)) {
    st.remaining -= dt;
    if (st.perSecond) damage += st.perSecond * st.power * dt * resist;
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
  }

  /** Every cooldown comes back sooner with `cooldownReduction` on your gear. */
  function cooldownFor(s) {
    const cut = Math.min(60, player.derived?.cooldownReduction || 0) / 100;
    return Math.max(0.5, s.cooldown * (1 - cut));
  }
  /** …and cost less with `cond_skillMpCostReduce`, which is a FLAT saving, not a percentage. */
  function costFor(s) {
    const off = rpg?.fx ? rpg.fx.sum(player, 'costFlat') : 0;
    return Math.max(0, Math.round((s.mp || 0) - off));
  }

  function unlocked(s) { return (player.level || 1) >= s.unlockAt; }

  /** Can this slot be used right now, and if not, why? */
  function check(index) {
    const s = slots[index];
    if (!s) return { ok: false, why: null };
    if (!unlocked(s)) return { ok: false, why: `${s.name} unlocks at level ${s.unlockAt}` };
    if (s.ready > 0) return { ok: false, why: `${s.name} is not ready (${s.ready.toFixed(1)}s)` };
    if (costFor(s) > player.mp) return { ok: false, why: `Not enough mana for ${s.name}` };
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
    player.mp = Math.max(0, player.mp - cost);
    s.ready = cooldownFor(s);

    const d = player.derived;
    // spell power lifts anything that is not a plain physical swing
    const magic = s.element && s.element !== 'physical' ? 1 + (d.spellPower || 0) : 1;
    const mid = ((d.damage[0] + d.damage[1]) / 2) * (s.mult || 1) * magic;
    return {
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
      heal: s.heal ? Math.round(player.maxHp * s.heal) : 0,
      healFrac: s.heal || 0,
      pet: s.pet || null, petCount: s.count || 1, pets: !!s.pets,
      spent: cost,
    };
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
    })),
  };
}
