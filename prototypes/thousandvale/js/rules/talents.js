// Thousandvale — PER-SKILL TALENT TREES (play-test 1, P6).
//
//   "add TALENTS (skill-specific, each changes the skill meaningfully, not % changes)."
//
// Every skill has a small tree: four tiers (levels 3/8/18/28), one pick per tier, two or three nodes
// a tier. The trees start from Farhold's own (data/skills.json `talents`: two bespoke nodes a tier,
// written for that one skill, plus one shared library node) and data/rules/talents.json says what
// Thousandvale changes, at load, in memory (data/skills.json is shared with Farhold and untouched):
//   * a library node that is only a number ("+35% damage", "30% shorter cooldown") is dropped;
//   * a library node that would do nothing on THIS skill's shape in js/rules/cast-skills.js (a fan of
//     bolts on a melee swing, a ground pool on a bolt) is dropped;
//   * a dropped tier gets a working rule node instead (`substitutes`), one the skill does not offer yet;
//   * the six bespoke nodes Farhold wrote as plain numbers are rewritten (`replace`).
// The result is written back onto the row as a Farhold tree (`row.talents`), so Farhold's own
// `talentPlan` folds the picks into every cast and Farhold's `describeNode` writes every card.
//
// Picks live on the sheet as Farhold keeps them (`unit.skillTalents = { skillId: { tier: nodeId } }`).
// A pick into an EMPTY tier is free; a filled tier is emptied only by `unpick` / `reset` (the
// Unbinder in town, who charges gold — `retrainPrice`).

import { TALENT_LIBRARY, describeNode, describeMod, nodeFor } from './farhold.js';

export const TIER_LEVELS = [3, 8, 18, 28];

/** Plan dimensions that are only a NUMBER: a node made only of these (set/add/mul) is a plain node. */
const PLAIN_DIM = /(^|\.)(mult|cooldown|mp|radius|reach|range|width|arc|seconds|statusMult|statusSeconds|heal|share|every|power|damage|resist|haste|movePct|speed|delay|chainFalloff|spread)$/;

/** Is this node only a number (a percentage or a bigger/smaller dimension)? */
export function isPlainNode(node, plainLibs = []) {
  if (!node) return true;
  if (!node.bespoke && node.id && plainLibs.includes(node.id)) return true;
  const m = node.mod || {};
  for (const k of Object.keys(m)) {
    if (k === 'when') continue;
    if (k === 'mul') continue;                                     // a multiplier is always only a number
    if (k === 'set' || k === 'add') {
      for (const [d, v] of Object.entries(m[k] || {})) {
        if (v && typeof v === 'object') return false;              // a new sub-effect (an onEnter, a status list…)
        if (/\.basic\./.test(d)) return false;                      // a rider on the form's basic attack
        if (/^form\.stats\./.test(d) && typeof v === 'number') continue;   // a form's stat line is only a number
        if (!PLAIN_DIM.test(d)) return false;
      }
      continue;
    }
    return false;                                                  // a vocabulary key or a library rule
  }
  return true;
}

/** What a skill row is for the library's shape rules: 'bolt' | 'melee' | ... and whether it deals damage. */
const dealsDamage = row => !!row && row.mult > 0 && row.shape !== 'summon';
/** Does library node `id` actually do something on this row in Thousandvale? */
export function libWorks(id, row, libShapes = {}) {
  const rule = libShapes[id];
  if (!rule || !row) return false;
  if (rule === 'any') return true;
  if (rule === 'damage') return dealsDamage(row);
  return Array.isArray(rule) && rule.includes(row.shape) && dealsDamage(row);
}

/** The Thousandvale tree for one row: Farhold's `talents` object, rewritten. Pure. */
export function tvTalentsFor(skillId, row, policy = {}) {
  const T = row?.talents;
  if (!T) return null;
  const plainLibs = policy.plainLibs || [];
  const libShapes = policy.libShapes || {};
  const replace = policy.replace || {};
  const out = {};
  const report = { dropped: [], substituted: [], replaced: [] };
  const offered = new Set(Object.values(T).map(t => t?.lib).filter(Boolean));
  for (const tier of [1, 2, 3, 4]) {
    const t = T[tier] || T[String(tier)] || {};
    const nodes = (t.nodes || []).map(nd => {
      const r = replace[`${skillId}:${tier}:${nd.id}`];
      if (r) { report.replaced.push(`${tier}:${nd.id}->${r.id}`); return { ...r }; }
      return nd;
    });
    let lib = t.lib || null;
    if (lib && (plainLibs.includes(lib) || !libWorks(lib, row, libShapes))) {
      report.dropped.push(`${tier}:${lib}`);
      offered.delete(lib);
      lib = null;
      const sub = policy.substitutes?.[tier] || {};
      const kinds = dealsDamage(row) ? [row.shape, 'damage', 'any'] : ['any'];
      for (const kind of kinds) {
        const pick = (sub[kind] || []).find(id => !offered.has(id) && libWorks(id, row, libShapes) && !plainLibs.includes(id));
        if (pick) { lib = pick; offered.add(pick); report.substituted.push(`${tier}:${pick}`); break; }
      }
    }
    out[tier] = { ...(lib ? { lib } : {}), nodes };
  }
  return { talents: out, report };
}

/**
 * Rewrite every row's tree in place (engine boot, in memory). Keeps Farhold's original on
 * `row.farholdTalents` for the parity fixtures and the audit. Returns a report.
 */
export function installTalentTrees(skillData, policy = {}) {
  const totals = { skills: 0, dropped: 0, substituted: 0, replaced: 0 };
  if (!skillData?.skills || skillData._tvTalents) return totals;
  for (const [id, row] of Object.entries(skillData.skills)) {
    const tv = tvTalentsFor(id, row, policy);
    if (!tv) continue;
    row.farholdTalents = row.talents;
    row.talents = tv.talents;
    totals.skills++;
    totals.dropped += tv.report.dropped.length;
    totals.substituted += tv.report.substituted.length;
    totals.replaced += tv.report.replaced.length;
  }
  skillData._tvTalents = true;
  return totals;
}

/** The nodes of one tier of a row, as objects (bespoke first, then the library node). */
export function tierNodes(row, tier) {
  const t = row?.talents?.[tier] || row?.talents?.[String(tier)];
  if (!t) return [];
  const out = (t.nodes || []).map(nd => ({ ...nd, tier, bespoke: true }));
  if (t.lib && TALENT_LIBRARY[t.lib]) out.push({ ...TALENT_LIBRARY[t.lib], tier, bespoke: false });
  return out;
}

/** The card line for a node on this row. */
export function nodeText(node, row, statuses = {}, skills = {}) {
  const heals = row?.shape === 'self' && !row?.mult;
  if (!node.bespoke) return heals ? describeMod(node.mod, { heals }) : (node.desc || describeMod(node.mod));
  // a resource rider names the skill's own resource (Farhold's card printed "Spends all your undefined")
  let nd = node;
  if (node.mod?.resource && !node.mod.resource.id && row?.resource?.id) nd = { ...node, mod: { ...node.mod, resource: { ...node.mod.resource, id: row.resource.id } } };
  return describeNode(nd, { statuses, skills, heals, row, formLabel: id => id });
}

const picksOf = (unit, skillId) => unit?.skillTalents?.[skillId] || {};

/** The skills this character may put talents into: the ones on its bar whose slot is open. */
export function talentSkills(unit) {
  return (unit?.skills?.slots || []).map((s, i) => ({ slot: i + 1, id: s.empty ? null : s.id, open: !s.empty && (unit.level || 1) >= s.unlockAt, unlockAt: s.unlockAt }));
}

/**
 * Take a talent. Refusals (`{ ok: false, why }`): not your skill, slot not open yet, tier not open yet,
 * not a node of that tier, the tier already holds one (the Unbinder empties it).
 */
export function pickTalent(engine, unit, skillId, tier, nodeId) {
  tier = Number(tier);
  const row = engine.skillData.skills[skillId];
  const mine = talentSkills(unit).find(s => s.id === skillId);
  if (!row || !mine) return { ok: false, why: 'That skill is not on your bar.' };
  if (!mine.open) return { ok: false, why: `${row.name} opens at level ${mine.unlockAt}.` };
  const level = TIER_LEVELS[tier - 1];
  if (!level) return { ok: false, why: 'No such tier.' };
  if ((unit.level || 1) < level) return { ok: false, why: `That tier opens at level ${level}.` };
  const node = tierNodes(row, tier).find(nd => nd.id === nodeId);
  if (!node) return { ok: false, why: 'That talent is not on this tier.' };
  const held = picksOf(unit, skillId)[tier];
  if (held) {
    const worn = nodeFor(row, tier, held);
    return { ok: false, why: `${worn?.name || 'A talent'} is already on this tier. An Unbinder in town will take it off.` };
  }
  unit.skillTalents = { ...(unit.skillTalents || {}), [skillId]: { ...picksOf(unit, skillId), [tier]: nodeId } };
  return { ok: true, node: { id: node.id, name: node.name } };
}

/** Empty one tier (the Unbinder). */
export function unpickTalent(unit, skillId, tier) {
  const picks = { ...picksOf(unit, skillId) };
  if (!picks[tier]) return { ok: false, why: 'Nothing is on that tier.' };
  delete picks[tier];
  unit.skillTalents = { ...(unit.skillTalents || {}), [skillId]: picks };
  return { ok: true };
}

/** Empty every tier of every skill (or of one skill). Returns how many picks were taken off. */
export function resetTalents(unit, skillId = null) {
  let n = 0;
  const all = { ...(unit.skillTalents || {}) };
  for (const id of Object.keys(all)) {
    if (skillId && id !== skillId) continue;
    n += Object.values(all[id] || {}).filter(Boolean).length;
    all[id] = {};
  }
  unit.skillTalents = all;
  return n;
}

/** Drop picks that no longer exist (a tree changed, a skill left the bar). Safe to run more than once. */
export function cleanTalents(engine, unit) {
  const out = {};
  const onBar = new Set(talentSkills(unit).map(s => s.id).filter(Boolean));
  for (const [skillId, picks] of Object.entries(unit.skillTalents || {})) {
    const row = engine.skillData.skills[skillId];
    if (!row || !onBar.has(skillId)) continue;
    for (const [tier, id] of Object.entries(picks || {})) {
      if (tierNodes(row, Number(tier)).some(nd => nd.id === id) && (unit.level || 1) >= (TIER_LEVELS[tier - 1] ?? Infinity)) (out[skillId] || (out[skillId] = {}))[tier] = id;
    }
  }
  unit.skillTalents = out;
  return out;
}

/** The talent screen's data (D): every skill on the bar, every tier, every node, what is picked. */
export function talentView(engine, unit) {
  const data = engine.skillData;
  return talentSkills(unit).filter(s => s.id).map(s => {
    const row = data.skills[s.id];
    const picks = picksOf(unit, s.id);
    return {
      slot: s.slot, skillId: s.id, name: row.name, shape: row.shape, element: row.element || null, open: s.open, unlockAt: s.unlockAt,
      tiers: TIER_LEVELS.map((level, i) => {
        const tier = i + 1;
        return {
          tier, level, open: s.open && (unit.level || 1) >= level, picked: picks[tier] || null,
          nodes: tierNodes(row, tier).map(nd => ({
            id: nd.id, name: nd.name, desc: nodeText(nd, row, data.statuses || {}, data.skills), fx: nd.fx || null,
            bespoke: !!nd.bespoke, requires: nd.requires || null, picked: picks[tier] === nd.id,
          })),
        };
      }),
    };
  });
}
