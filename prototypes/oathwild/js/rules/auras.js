// Oathwild — buffs and debuffs on top of Farhold's statuses. Pure. The ONE reader of data/auras.json.
//
// A status lives on a body as Farhold's entry (`unit.statuses[id]`, skills.js applyStatus) plus
// Oathwild's own stamps: `source` (who put it there), `spell` (from what), `beneficial`, `dispel`.
//
//   statusRow(rules, id)                        the merged row (Farhold + auras.json)
//   applyAura(rules, target, id, opts)          → the entry, or null if refused (immune / weaker)
//   tickAuras(rules, unit, dt)                  → { damage, healed, bySource: { id: n }, expired: [ids] }
//   dispel(rules, unit, kind, { count, beneficial })  → removed ids
//   control(unit)                               { root, act, cast } — what the body may do now
//   auraNumbers(rules, unit, entry)             the live numbers one entry carries (describe.js prints them)
//   isBeneficial(rules, id) / dispelKind(rules, id) / iconOf(rules, id)

import { applyStatus, tickStatuses, buffsOf } from './farhold.js';

export const statusRow = (rules, id) => rules.statuses[id] || null;
export const iconOf = (rules, id) => statusRow(rules, id)?.icon || `aura_${id}`;

const BENEFICIAL_KINDS = new Set(['buff', 'form']);
export const isBeneficial = (rules, id, entry = null) => BENEFICIAL_KINDS.has(entry?.kind || statusRow(rules, id)?.kind);

/** Which cure removes it: magic | poison | curse | none (auras.json default rule by element). */
export function dispelKind(rules, id, entry = null) {
  const row = statusRow(rules, id) || {};
  if (row.dispel) return row.dispel;
  const el = entry?.element || row.element;
  if (el === 'poison') return 'poison';
  if (el === 'shadow') return 'curse';
  if (el === 'physical') return 'none';
  return 'magic';
}

const CONTROL = new Set(['root', 'sleep', 'fear', 'silence', 'stagger', 'knockdown', 'stasis', 'disarm', 'transmuted', 'turned']);

/**
 * Put status `id` on `target`. opts:
 *   over        fields laid over the status row (a spell's own numbers: { takeMore: 0.25, seconds: 10 })
 *   power       the DoT's base (Farhold: hit × STATUS_POWER_SHARE × statusMult); 1 for buffs
 *   source      the body id that applied it; spell: the spell id
 *   bonusSeconds  extra seconds (spell ranks, modifiers); strength: x on a buff's numbers
 *   stackMax    stack instead of refresh (poison from a dart, frostbite)
 * Stacking (auras.json `stacking`): one of each per body; a weaker copy from someone else only
 * lengthens the timer; a stronger copy replaces it.
 */
export function applyAura(rules, target, id, { over = {}, power = 1, source = null, spell = null, bonusSeconds = 0, strength = 1, stackMax = null } = {}) {
  // a spell's own buff (`buff_<spell>`) has no table row: its `over` is the whole row
  const row = statusRow(rules, id) || (over.kind ? { seconds: 6, name: over.name || id } : null);
  if (!row) return null;
  const spec = { ...row, ...over };
  if (stackMax) spec.stackMax = stackMax;
  if (strength !== 1) for (const f of ['damage', 'resist', 'takeMore', 'dealLess', 'haste', 'move', 'armor', 'healPerSecond', 'slow']) if (typeof spec[f] === 'number' && spec[f] > 0) spec[f] = Math.min(f === 'slow' ? 0.9 : 5, spec[f] * strength);
  const existing = target.statuses?.[id];
  const secs = (spec.seconds || 4) + bonusSeconds;
  if (existing && !spec.stackMax && existing.source !== source && (existing.power || 0) > power) {
    existing.remaining = Math.max(existing.remaining, secs);
    return existing;
  }
  const entry = applyStatus(target, id, spec, power, { longer: bonusSeconds });
  if (!entry) return null;
  const e = target.statuses[id] || entry;
  e.source = source; e.spell = spell;
  e.total = Math.max(e.total || 0, e.remaining);
  e.beneficial = isBeneficial(rules, id, e);
  e.dispel = dispelKind(rules, id, e);
  return e;
}

/** Remove a status (its timer ran out elsewhere, a form ended, a cure). */
export function removeAura(target, id) {
  if (target.statuses?.[id]) { delete target.statuses[id]; return true; }
  return false;
}

/**
 * Tick every status by `dt`. Damage over time lands once a second (Farhold); `bySource` splits it
 * between the bodies that applied it (for threat, XP credit and the damage meter).
 */
export function tickAuras(rules, unit, dt) {
  const before = new Set(Object.keys(unit.statuses || {}));
  const dots = [];
  for (const [id, st] of Object.entries(unit.statuses || {})) if (st.perSecond > 0 && !st.beneficial) dots.push({ id, source: st.source, w: st.perSecond * (st.power || 1) });
  const hpBefore = unit.hp;
  const damage = tickStatuses(unit, dt);
  const healed = Math.max(0, (unit.hp - hpBefore) + damage);
  const bySource = {};
  const wsum = dots.reduce((s, d) => s + d.w, 0);
  if (damage > 0 && wsum > 0) for (const d of dots) if (d.source != null) bySource[d.source] = (bySource[d.source] || 0) + damage * d.w / wsum;
  const expired = [...before].filter(id => !unit.statuses?.[id]);
  return { damage, healed, bySource, expired };
}

/** Remove up to `count` statuses a cure of `kind` reaches ('magic', 'poison', 'curse'; 'any' for all). */
export function dispel(rules, unit, kind = 'magic', { count = 1, beneficial = false } = {}) {
  const out = [];
  for (const [id, st] of Object.entries(unit.statuses || {})) {
    if (out.length >= count) break;
    if (!!st.beneficial !== beneficial) continue;
    const k = st.dispel || dispelKind(rules, id, st);
    if (k === 'none') continue;
    if (kind !== 'any' && k !== kind) continue;
    delete unit.statuses[id];
    out.push(id);
  }
  return out;
}

/** What a body may do with its statuses: move, act (attack), cast. Knocked down = staggered (nothing until it is up). */
export function control(unit) {
  const s = unit.statuses || {};
  const asleep = !!(s.sleep || s.stasis || s.transmuted);
  const staggered = !!(s.stagger || s.knockdown);     // knocked down (data/combat.json knock): flat on the ground
  return {
    move: !(s.root || asleep || staggered),
    act: !(asleep || staggered || s.fear),
    cast: !(asleep || staggered || s.fear || s.silence),
    fleeing: !!s.fear && !asleep,
  };
}
export const isControlStatus = id => CONTROL.has(id);

/** The numbers one entry carries right now, for the tooltip. */
export function auraNumbers(rules, unit, entry) {
  return {
    remaining: Math.max(0, entry.remaining || 0),
    total: entry.total || entry.remaining || 0,
    stacks: entry.stacks || 1,
    tick: entry.perSecond > 0 ? entry.perSecond * (entry.power || 1) : 0,
    healPerSecond: entry.healPerSecond > 0 ? entry.healPerSecond * (unit.maxHp || 0) : 0,
    damage: entry.damage || 0, resist: entry.resist || 0, takeMore: entry.takeMore || 0, dealLess: entry.dealLess || 0,
    haste: entry.haste || 0, move: entry.move || 0, slow: entry.slow || 0, armor: entry.armor || 0,
  };
}

/** Everything the body's statuses add up to (Farhold's buffsOf), for movement and swing speed. */
export const auraTotals = unit => buffsOf(unit);

/** Data for the client's buff bar: every status as a row (describe.js adds the text). */
export function auraList(rules, unit) {
  return Object.entries(unit.statuses || {}).map(([id, st]) => ({
    id, name: st.name || statusRow(rules, id)?.name || id, icon: iconOf(rules, id),
    kind: st.beneficial ? 'buff' : (CONTROL.has(id) ? 'control' : 'debuff'),
    dispel: st.dispel || dispelKind(rules, id, st), source: st.source ?? null, spell: st.spell ?? null,
    ...auraNumbers(rules, unit, st),
  }));
}
