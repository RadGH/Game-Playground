// Thousandvale — the THREAT TABLE (PLAN §6.2, §7). Farhold has none: an enemy there goes for the
// one player, or for a companion that bit it in the last five seconds (actors.js `aimOf`). An MMO
// party needs the classic table instead, so a tank can hold a pack off a healer.
//
// Rules (all numbers in THREAT below, one place to tune):
//   * damage dealt adds its amount × the attacker's threat multiplier (a tank stance raises it);
//   * healing adds HEAL_SHARE of the amount healed, split across every monster already fighting
//     the healed ally (healing never pulls a monster that was not engaged);
//   * being noticed adds a tiny NOTICE amount, so the first body seen is the first target;
//   * a monster switches off its current target only when somebody passes SWITCH_MELEE (in reach)
//     or SWITCH_RANGED (out of reach) of the current target's threat — no ping-ponging;
//   * a TAUNT forces the target for its seconds AND lifts the taunter to the top threat × TAUNT_LIFT,
//     so the monster stays when the taunt runs out;
//   * dead, gone or untargetable entries are skipped; `forget(id)` drops one (a player left, died).
//
// State lives on the monster (`m.threat: Map<id, number>`, `m.targetId`, `m.tauntBy`, `m.tauntFor`)
// so a saved/handed-off monster carries it, and two rooms can never share it.

export const THREAT = {
  HEAL_SHARE: 0.5,
  NOTICE: 1,
  SWITCH_MELEE: 1.1,
  SWITCH_RANGED: 1.3,
  TAUNT_LIFT: 1.1,
  /** seconds a taunt holds when the skill does not say */
  TAUNT_SECONDS: 3,
};

function table(m) { return m.threat || (m.threat = new Map()); }

/** Add raw threat from `who` (an entity with `id`, optionally `threatMult`). Returns the new value. */
export function addThreat(m, who, amount) {
  if (!m || !who || who.id == null || !(amount > 0) || m.dying != null) return 0;
  const k = who.threatMult ?? 1;
  const t = table(m);
  const v = (t.get(who.id) || 0) + amount * k;
  t.set(who.id, v);
  if (m.targetId == null) m.targetId = who.id;
  return v;
}

/** Damage `who` dealt to `m`. */
export function threatFromDamage(m, who, amount) { return addThreat(m, who, amount); }

/** `healer` healed `ally` for `amount`: threat on every monster already fighting `ally`. */
export function threatFromHeal(monsters, healer, ally, amount) {
  if (!(amount > 0) || !healer || !ally) return 0;
  const engaged = monsters.filter(m => m.dying == null && m.threat?.has(ally.id));
  if (!engaged.length) return 0;
  const each = (amount * THREAT.HEAL_SHARE) / engaged.length;
  for (const m of engaged) addThreat(m, healer, each);
  return engaged.length;
}

/** `m` noticed `who` (proximity aggro). */
export function notice(m, who) {
  if (!m || !who) return;
  const t = table(m);
  if (!t.has(who.id)) t.set(who.id, THREAT.NOTICE);
  if (m.targetId == null) m.targetId = who.id;
}

/** Force `m` onto `who` for `seconds`, and lift `who` to the top of the table. */
export function taunt(m, who, seconds = THREAT.TAUNT_SECONDS) {
  if (!m || !who || m.dying != null || m.removed) return;
  const t = table(m);
  let top = 0;
  for (const v of t.values()) if (v > top) top = v;
  t.set(who.id, Math.max(t.get(who.id) || 0, top * THREAT.TAUNT_LIFT, THREAT.NOTICE));
  m.tauntBy = who.id;
  m.tauntFor = Math.max(m.tauntFor || 0, seconds);
  m.targetId = who.id;
}

/** Drop one entry (left the room, died and released). */
export function forget(m, id) {
  if (!m?.threat) return;
  m.threat.delete(id);
  if (m.targetId === id) m.targetId = null;
  if (m.tauntBy === id) { m.tauntBy = null; m.tauntFor = 0; }
}

/** Wipe it (a reset / leash home). */
export function clearThreat(m) {
  if (!m) return;
  m.threat?.clear();
  m.targetId = null; m.tauntBy = null; m.tauntFor = 0;
}

/**
 * Who `m` should be hitting now. `lookup(id)` returns the entity or null; `usable(ent)` says
 * whether it may be chosen (alive, in the room, not untargetable). `reach` is m's melee reach,
 * for the 110%/130% switch rule. Ticks the taunt clock by `dt`.
 * Returns the entity or null (nobody on the table it can hit).
 */
export function pickTarget(m, lookup, usable, dt = 0) {
  if (m.tauntFor > 0) m.tauntFor = Math.max(0, m.tauntFor - dt);
  if (m.tauntFor > 0) {
    const by = m.tauntBy != null ? lookup(m.tauntBy) : null;
    if (by && usable(by)) { m.targetId = by.id; return by; }
    m.tauntFor = 0; m.tauntBy = null;
  }
  const t = m.threat;
  if (!t || !t.size) { m.targetId = null; return null; }
  const cur = m.targetId != null ? lookup(m.targetId) : null;
  const curOk = cur && usable(cur);
  const curV = curOk ? (t.get(cur.id) || 0) : 0;
  let best = null, bestV = -1;
  for (const [id, v] of t) {
    const e = lookup(id);
    if (!e || !usable(e)) continue;
    if (v > bestV) { bestV = v; best = e; }
  }
  if (!best) { m.targetId = null; return null; }
  if (curOk && best !== cur) {
    const close = Math.hypot(best.x - m.x, best.z - m.z) <= (m.reach || 2.4) + 0.5;
    const need = curV * (close ? THREAT.SWITCH_MELEE : THREAT.SWITCH_RANGED);
    if (bestV < need) return cur;
  }
  m.targetId = best.id;
  return best;
}

/** The table as plain rows, highest first — for the client's threat meter and for tests. */
export function threatRows(m) {
  return [...(m?.threat || new Map())].map(([id, v]) => ({ id, threat: v })).sort((a, b) => b.threat - a.threat);
}
