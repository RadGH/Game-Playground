// Farhold R28 — what a skill card needs to SAY about the round-28 mechanics.
//
// Round 28 gave skills charges, recast windows, class resources (Flair, Poise, Grudge), shapes,
// stances, tempers and songs that change the OTHER skills on the bar, and a bespoke talent tree
// per skill. The engine writes all of it into the generated sentence (js/skills.js
// `describeSkill`), which is right for a tooltip and hopeless for scanning: a player choosing
// between two spells wants to see "3 charges" or "Shape" as a chip, and a druid looking at
// Briarback wants to know what Thornlash TURNS INTO before pressing it.
//
// Everything here is pure (no DOM), so the node tests read it, and every screen — the sheet's
// Skills tab, the bar's hover card, the title screen's class card and the custom-class builder —
// asks the same functions instead of each inventing its own wording.
//
//   mechFacts(row)                    chips for the mechanics a row carries
//   formVersions(row, ctx)            what this skill becomes in each shape / stance / temper / song
//   formTransforms(formRow, ids, ctx) for a shape skill: what each OTHER skill on the bar becomes
//   talentChanges(row, node, ctx)     the numbers one talent node moves on its skill (before → after)
//   formLabelOf(id, skills)           "Briarback shape", "Open stance", "Fire Temper", …

import { fmt, secs } from '../../../shared/format.js';
import { FORM_LABEL, resolveForm } from './skillmech.js';
import { describeSkill, effectiveMult } from './skills.js';
import { talentPlan } from './skilltalents.js';

const cap = s => String(s || '').replace(/^./, c => c.toUpperCase());
const pct = v => `${Math.round((v || 0) * 100)}%`;

/** What the group of a form is called on a chip. */
export const GROUP_WORD = { shape: 'Shape', stance: 'Stance', temper: 'Temper', song: 'Song' };

/** The ids a form skill can put you in — one for a toggle, several for a cycle. */
export function formIdsOf(row) {
  const f = row?.form;
  if (!f) return [];
  if (Array.isArray(f.options) && f.options.length) return f.options.map(o => o.id).filter(Boolean);
  return f.id ? [f.id] : [];
}

/**
 * A form id as a player reads it: "Briarback shape", "Open stance", "Fire Temper". The data's own
 * form name wins (a content agent may add a stance this table has never heard of), then the
 * engine's label table, then the id itself.
 */
export function formLabelOf(id, skills = {}) {
  for (const row of Object.values(skills || {})) {
    const f = row?.form;
    if (!f) continue;
    const opts = Array.isArray(f.options) ? f.options : [f];
    const hit = opts.find(o => o?.id === id);
    if (!hit) continue;
    const group = hit.group || f.group || 'shape';
    const name = hit.name || FORM_LABEL[id] || cap(id);
    if (group === 'shape' && !/shape$/i.test(name)) return `${name} shape`;
    if (group === 'stance' && !/stance$/i.test(name)) return `${name} stance`;
    return name;
  }
  return FORM_LABEL[id] || cap(String(id || '').replace(/_/g, ' '));
}

/**
 * Chips for the round-28 mechanics on a row. Each has a `tip` — the one sentence a hover adds.
 * Kinds: `form` (green, a state you enter), `mech` (a rule about pressing it).
 */
export function mechFacts(row, { skills = {} } = {}) {
  if (!row) return [];
  const out = [];
  const f = row.form;
  if (f) {
    const group = f.group || 'shape';
    const word = GROUP_WORD[group] || cap(group);
    const ids = formIdsOf(row);
    let how;
    if (f.cycle && ids.length > 1) how = `cycles ${ids.map(id => formLabelOf(id, skills).replace(/ (stance|shape|temper|song)$/i, '')).join(' → ')}`;
    else if (f.seconds) how = `lasts ${secs(f.seconds)}`;
    else how = 'toggle';
    out.push({ text: `${word} · ${how}`, kind: 'form', tip: `${word}s are exclusive: entering one leaves the ${group} you were in.` });
  }
  if (row.forms && Object.keys(row.forms).length) {
    out.push({
      text: `Changes in ${Object.keys(row.forms).length} ${Object.keys(row.forms).length === 1 ? 'form' : 'forms'}`,
      kind: 'form',
      tip: `Becomes ${Object.entries(row.forms).map(([id, o]) => `${o.name || row.name} in ${formLabelOf(id, skills)}`).join(', ')}.`,
    });
  }
  const ch = row.charges;
  if (ch) {
    const max = typeof ch === 'number' ? ch : ch.max || 1;
    out.push({ text: `${fmt(max)} charges`, kind: 'mech', tip: 'The cooldown brings charges back one at a time.' });
  }
  if (row.recast) out.push({ text: `Recast ${secs(row.recast.window ?? 4)}`, kind: 'mech', tip: 'Press the key again inside the window for the second part.' });
  const res = row.resource;
  if (res?.id) {
    const name = cap(res.id);
    if (res.gain) out.push({ text: `Builds ${name}`, kind: 'res', res: res.id, tip: `${name} is shown as pips over your skill bar, up to 5.` });
    if (res.spend) out.push({ text: `Spends ${name}`, kind: 'res', res: res.id, tip: `Stronger for each ${name} point you hold when you cast it.` });
  }
  if (row.hpCost) out.push({ text: `Costs ${pct(typeof row.hpCost === 'number' ? row.hpCost : row.hpCost.share)} health`, kind: 'mech' });
  if (row.channel) out.push({ text: `Channel ${secs(row.channel.seconds ?? 3)}`, kind: 'mech', tip: 'Press again to end it early.' });
  if (row.elementFrom) out.push({ text: { temper: 'Element from Temper', song: 'Element from song', cycle: 'Element cycles' }[row.elementFrom] || 'Element changes', kind: 'mech' });
  if (row.elementPool || row.statusPool || row.variance) out.push({ text: 'Random roll', kind: 'mech', tip: 'The skill bar shows the next roll in the slot corner.' });
  if (row.place?.kind) out.push({ text: { pulse: 'Places a post', zone: 'Places a zone', trap: 'Sets a trap' }[row.place.kind] || 'Places an object', kind: 'mech' });
  if (row.summon?.temporary) out.push({ text: 'Temporary summon', kind: 'mech', tip: 'Takes no follower slot.' });
  return out;
}

/** The row as it reads while `formId` is on (a fake player that is in only that form). */
function rowIn(row, formId) {
  const group = 'shape';     // resolveForm only asks which form ids are active, not their group
  return resolveForm(row, { forms: { [group]: { id: formId } } });
}

/**
 * Every version of a skill that changes with forms — its own first, then one per form it has an
 * override for. `[]` for a row with no `forms`.
 */
export function formVersions(row, { statuses = {}, skills = {}, unlockAt = 1 } = {}) {
  if (!row?.forms) return [];
  const base = { ...row };
  delete base.forms;
  const out = [{ formId: null, label: 'Own body', name: row.name, desc: describeSkill(base, statuses, { cost: true, unlockAt, skills }) }];
  for (const id of Object.keys(row.forms)) {
    const r = rowIn(row, id);
    out.push({ formId: id, label: formLabelOf(id, skills), name: r.name || row.name, desc: describeSkill(r, statuses, { cost: true, unlockAt, skills }) });
  }
  return out;
}

/**
 * For a form skill (Briarback Shape, a stance, a temper, a song): what each OTHER skill in `ids`
 * becomes while that form is on. One group per form the skill can enter (a cycling temper has
 * three). A form with nothing on the bar to change returns its group with `entries: []`.
 *
 * `unlockAts` maps a skill id to its slot's unlock level, for the damage the card quotes.
 */
export function formTransforms(formRow, ids = [], { statuses = {}, skills = {}, unlockAts = {} } = {}) {
  const forms = formIdsOf(formRow);
  return forms.map(fid => ({
    formId: fid,
    label: formLabelOf(fid, skills),
    entries: ids.filter(id => skills[id]?.forms?.[fid]).map(id => {
      const r = rowIn(skills[id], fid);
      return { skillId: id, baseName: skills[id].name, name: r.name || skills[id].name, desc: describeSkill(r, statuses, { cost: true, unlockAt: unlockAts[id] ?? 1, skills }) };
    }),
  }));
}

const SHAPE_WORD = {
  melee: 'strike in front', around: 'around you', dash: 'dash', bolt: 'projectile', ground: 'ground target',
  self: 'on yourself', beam: 'beam', summon: 'summon', cone: 'cone', wave: 'wave',
};
const count = o => (o && typeof o === 'object' ? o.count ?? o.max : o);

/** The numbers worth comparing before and after a talent, in reading order. */
const DELTA_FIELDS = [
  ['shape', 'Shape', v => SHAPE_WORD[v] || v],
  ['dmg', 'Damage', v => `${Math.round(v * 100)}%`],
  ['heal', 'Healing', v => `${Math.round((typeof v === 'object' ? v.share : v) * 100)}%`],
  ['cooldown', 'Cooldown', v => secs(v)],
  ['mp', 'Mana', v => fmt(v)],
  ['charges', 'Charges', v => fmt(count(v))],
  ['projectiles', 'Projectiles', v => fmt(v)],
  ['repeats', 'Strikes', v => fmt(count(v))],
  ['pierce', 'Pierces', v => fmt(v)],
  ['chains', 'Jumps', v => fmt(v)],
  ['count', 'Summons', v => fmt(v)],
  ['radius', 'Radius', v => `${fmt(v)} m`],
  ['reach', 'Reach', v => `${fmt(v)} m`],
  ['range', 'Range', v => `${fmt(v)} m`],
  ['arc', 'Arc', v => `${Math.round(v * 180 / Math.PI)}°`],
];

function numbersOf(plan, unlockAt) {
  const out = { ...plan };
  if (plan.mult && plan.shape !== 'summon') out.dmg = effectiveMult(plan, unlockAt);
  return out;
}

/**
 * What one talent node changes on its skill, as before → after pairs: `[{ label, from, to }]`.
 * Only fields that actually move are listed; a node that only adds a behaviour (a knockback, a
 * trap) returns `[]` and its sentence says the rest.
 */
export function talentChanges(row, node, { skillId = null, tier = null, unlockAt = 1 } = {}) {
  if (!row || !node) return [];
  const id = skillId || node.skillId || 'skill';
  const t = tier ?? node.tier ?? 1;
  const before = { ...row, kind: row.shape };
  let after;
  try {
    after = talentPlan({ level: 99, skillTalents: { [id]: { [t]: node.id } } }, id, before, row);
  } catch { return []; }
  if (!after || after === before) return [];
  const a = numbersOf(before, unlockAt), b = numbersOf(after, unlockAt);
  const out = [];
  for (const [k, label, show] of DELTA_FIELDS) {
    const x = a[k], y = b[k];
    // a library node's `mult` on a skill that deals no damage (War Cry) is not "damage"
    if (k === 'dmg' && x == null) continue;
    if (y == null || y === '' || (typeof y === 'object' && count(y) == null && k !== 'heal')) continue;
    // a skill with no `repeats` strikes once; any other field it lacks is simply new
    const sx = x == null ? (k === 'repeats' ? '1' : null) : show(x), sy = show(y);
    if (sx === sy) continue;
    out.push({ label, from: sx, to: sy });
  }
  return out;
}
