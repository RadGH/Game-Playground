// Farhold phase 3 (the rest of it) — a fight worth having.
//
// Four skills on keys 1-4, a cooldown and a mana cost each, drawn with the spell effects
// `avatar-3d/js/spellfx.js` already has. Emberveil's skills are written for a turn-based party
// fight — "adjacent2", "row", "per_source" — which means nothing to one person standing in a field,
// so these are its ideas rebuilt around a radius, a cooldown and a cast.
//
// The model is pure: it decides what a skill does and to whom. The caller draws it and applies the
// damage, so the node tests can drive the whole thing without a renderer.

/** Statuses live on the target as `{ type, remaining, power }`. */
export function applyStatus(target, type, spec, power = 1) {
  if (!spec) return null;
  target.statuses = target.statuses || {};
  const existing = target.statuses[type];
  const entry = {
    type, remaining: spec.seconds, power,
    perSecond: spec.perSecond ?? 0, slow: spec.slow ?? 0,
    damage: spec.damage ?? 0, resist: spec.resist ?? 0,
    element: spec.element, name: spec.name,
  };
  // refreshing beats stacking: a second burn resets the timer rather than doubling the pain
  target.statuses[type] = existing ? { ...entry, remaining: Math.max(existing.remaining, entry.remaining) } : entry;
  return target.statuses[type];
}

/** Tick every status on a unit. Returns the damage it took this step. */
export function tickStatuses(unit, dt) {
  if (!unit.statuses) return 0;
  let damage = 0;
  for (const [type, st] of Object.entries(unit.statuses)) {
    st.remaining -= dt;
    if (st.perSecond) damage += st.perSecond * st.power * dt;
    if (st.remaining <= 0) delete unit.statuses[type];
  }
  if (damage > 0) unit.hp = Math.max(0, (unit.hp ?? 0) - damage);
  return damage;
}

/** How much a unit's statuses slow it, 0..1. */
export function slowOf(unit) {
  let slow = 0;
  for (const st of Object.values(unit.statuses || {})) slow = Math.max(slow, st.slow || 0);
  return slow;
}
/** Extra damage and damage resistance from buffs. */
export function buffsOf(unit) {
  let damage = 0, resist = 0;
  for (const st of Object.values(unit.statuses || {})) { damage += st.damage || 0; resist += st.resist || 0; }
  return { damage, resist: Math.min(0.8, resist) };
}

export function createSkillBar({ data, player, rpg }) {
  const ids = data.classes?.[player.classId] || data.classes?.ranger || [];
  const slots = ids.map(id => ({ id, ...(data.skills[id] || {}), cooldown: data.skills[id]?.cooldown ?? 6, ready: 0 }));

  function update(dt) {
    for (const s of slots) if (s.ready > 0) s.ready = Math.max(0, s.ready - dt);
  }

  /** Can this slot be used right now, and if not, why? */
  function check(index) {
    const s = slots[index];
    if (!s) return { ok: false, why: null };
    if (s.ready > 0) return { ok: false, why: `${s.name} is not ready (${s.ready.toFixed(1)}s)` };
    if ((s.mp || 0) > player.mp) return { ok: false, why: `Not enough mana for ${s.name}` };
    return { ok: true, skill: s };
  }

  /**
   * Fire a slot. Returns a plan for the caller to draw and apply:
   *   { skill, kind: 'melee'|'around'|'bolt'|'self', damage, radius, status, heal }
   */
  function use(index) {
    const can = check(index);
    if (!can.ok) return { ok: false, why: can.why };
    const s = can.skill;
    player.mp = Math.max(0, player.mp - (s.mp || 0));
    s.ready = s.cooldown;

    const d = player.derived;
    const mid = ((d.damage[0] + d.damage[1]) / 2) * (s.mult || 1);
    return {
      ok: true,
      skill: s,
      kind: s.shape,
      element: s.element || 'physical',
      mult: s.mult || 1,
      damage: Math.max(1, Math.round(mid)),
      reach: s.reach ?? 3, arc: s.arc ?? 1.5,
      radius: s.radius ?? 0, range: s.range ?? 0, splash: s.splash ?? 0,
      status: s.status || null,
      statusSpec: s.status ? data.statuses[s.status] : null,
      heal: s.heal ? Math.round(player.maxHp * s.heal) : 0,
    };
  }

  return {
    slots, update, use, check,
    /** For the HUD. */
    state: () => slots.map(s => ({
      id: s.id, name: s.name, desc: s.desc, mp: s.mp || 0,
      ready: s.ready, cooldown: s.cooldown,
      usable: s.ready <= 0 && (s.mp || 0) <= player.mp,
    })),
  };
}
