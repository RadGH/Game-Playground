// Oathwild — talents: points from levels and use-skill milestones, rows gated by level and by
// attributes / use-skills / classes / proficiencies. Pure. The ONE reader of data/talents.json.
//
//   char.talents = { id: rank }
//   talentPointsEarned(rules, char) / talentPointsLeft
//   talentRefusal(rules, char, id, ctx)   null or why (player words). ctx = { attrs, profs } from the sheet
//   takeTalent(rules, char, id, ctx)      { ok, why }
//   talentMods(rules, char)               [{ source, mods }] for the sheet
//   talentProfs(rules, char)              { prof: [source names] }

import { milestonesReached } from './skills-use.js';
import { requirementGaps } from './classes.js';

const T = rules => rules.data.talents;
export const talentDef = (rules, id) => T(rules).talents[id] || null;
export const talentIds = rules => Object.keys(T(rules).talents);

export function talentPointsEarned(rules, char) {
  const fromLevels = T(rules).pointLevels.filter(l => (char.level || 1) >= l).length;
  return fromLevels + milestonesReached(rules, char);
}
export const talentPointsSpent = char => Object.values(char.talents || {}).reduce((s, v) => s + v, 0);
export const talentPointsLeft = (rules, char) => talentPointsEarned(rules, char) - talentPointsSpent(char);

/** The character level a row opens at. */
export const rowLevel = (rules, row) => T(rules).rows[String(row)] || 1;

/** Why the next rank of talent `id` cannot be taken, or null. ctx = { attrs: totals, profs: { prof: [...] } }. */
export function talentRefusal(rules, char, id, ctx = {}) {
  const def = talentDef(rules, id);
  if (!def) return 'There is no such talent.';
  const have = char.talents?.[id] || 0;
  if (have >= (def.ranks || 1)) return `${def.name} is at its highest rank.`;
  const lvl = rowLevel(rules, def.row);
  if ((char.level || 1) < lvl) return `${def.name} opens at character level ${lvl}.`;
  const req = def.requires || {};
  const gaps = requirementGaps(rules, char, req, { attrs: ctx.attrs });
  if (req.anyAttr) {
    const A = ctx.attrs || {};
    const ok = Object.entries(req.anyAttr).some(([k, n]) => (A[k] ?? 0) >= n);
    if (!ok) gaps.push(Object.entries(req.anyAttr).map(([k, n]) => `${rules.data.attributes.names[k]} ${n}`).join(' or '));
  }
  for (const p of req.prof || []) if (!ctx.profs?.[p]) gaps.push(`${rules.data.proficiency.names[p]} training first`);
  if (req.classCount && Object.keys(char.classLevels || {}).length < req.classCount) gaps.push(`levels in ${req.classCount} classes`);
  if (gaps.length) return `${def.name} needs ${gaps.join(', ')}.`;
  if (talentPointsLeft(rules, char) <= 0) return 'No talent points left — you earn one at levels 3, 6 and 9, and one for every 25 in a skill.';
  return null;
}

export function takeTalent(rules, char, id, ctx = {}) {
  const why = talentRefusal(rules, char, id, ctx);
  if (why) return { ok: false, why };
  char.talents = char.talents || {};
  char.talents[id] = (char.talents[id] || 0) + 1;
  return { ok: true, why: null };
}

export function talentMods(rules, char) {
  const out = [];
  for (const [id, rank] of Object.entries(char.talents || {})) {
    const def = talentDef(rules, id);
    if (!def || !rank || !def.grants?.mods) continue;
    const mods = {};
    for (const [k, v] of Object.entries(def.grants.mods)) mods[k] = v * rank;
    out.push({ source: `${def.name} (talent)`, mods });
  }
  return out;
}

export function talentProfs(rules, char) {
  const out = {};
  for (const [id, rank] of Object.entries(char.talents || {})) {
    const def = talentDef(rules, id);
    if (!def || !rank) continue;
    for (const p of def.grants?.prof || []) (out[p] = out[p] || []).push(`${def.name} (talent)`);
  }
  return out;
}

/** Respec: every talent point back. */
export function refundTalents(char) { char.talents = {}; }
