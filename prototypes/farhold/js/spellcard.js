// Farhold R23 — one way to show a skill on a card, for the title screen and the class builder.
//
// Round 21 made every skill description a generated sentence with every number in it (WORDING.md),
// which is right for a tooltip and too much for a list: the class card on the character step was a
// 130-pixel column of forty-word paragraphs, and the builder's spell list was a wall of them. So a
// card now leads with the few facts you compare spells by — what it is, what element, how hard it
// hits, what it costs — as chips, and the full sentence sits under them, clamped to two lines, with
// the whole of it in the tooltip and on the card you have selected.
//
//   import { skillFacts, skillBody } from './spellcard.js';
//   skillFacts(skill, statuses)  // → [{ text: 'Projectile', kind: 'shape' }, { text: 'Fire', kind: 'el', el: 'fire' }, …]
//   skillBody(skill)             // → the description without its "12 mana, 4s cooldown." tail
//
// Pure: no DOM, so a node test can read it.

const SHAPE_LABEL = {
  melee: 'Melee', around: 'Around you', dash: 'Dash', bolt: 'Projectile', ground: 'Ground target',
  self: 'Self', beam: 'Beam', summon: 'Summon',
};

const cap = s => String(s || '').replace(/^./, c => c.toUpperCase());
const pct = v => `${Math.round(v * 100)}%`;
/** Seconds, with at most one decimal — "4s", "1.5s". */
const secs = v => `${Math.round((v ?? 0) * 10) / 10}s`;

/**
 * The facts a player compares two skills by, in the order they read them.
 *
 * @param {object} skill     a row of data/skills.json
 * @param {object} [statuses] data/skills.json's `statuses`, for the status's own name
 * @returns {{text: string, kind: string, el?: string}[]}
 */
export function skillFacts(skill, statuses = {}) {
  if (!skill) return [];
  const out = [];
  out.push({ text: SHAPE_LABEL[skill.shape] || cap(skill.shape || 'Skill'), kind: 'shape' });
  const el = skill.element || 'physical';
  out.push({ text: cap(el), kind: 'el', el });
  if (skill.mult) {
    const n = skill.projectiles > 1 ? `${skill.projectiles} × ` : '';
    out.push({ text: `${n}${pct(skill.mult)} weapon damage`, kind: 'hit' });
  }
  if (skill.heal) out.push({ text: `Heals ${pct(skill.heal)}`, kind: 'heal' });
  if (skill.shape === 'summon') out.push({ text: skill.count > 1 ? `Summons ${skill.count}` : 'Summons 1', kind: 'hit' });
  if (skill.status) out.push({ text: statuses?.[skill.status]?.name || cap(skill.status), kind: 'status' });
  out.push({ text: skill.mp ? `${skill.mp} mana` : 'No mana cost', kind: 'cost' });
  out.push({ text: `${secs(skill.cooldown ?? 6)} cooldown`, kind: 'cost' });
  return out;
}

/**
 * The description without the cost clause the chips already show.
 * `descShort` is js/skills.js's own cost-free line when the skill bar has been built; on the title
 * screen only the stored `desc` exists, so its last sentence is taken off by pattern.
 */
export function skillBody(skill) {
  if (!skill) return '';
  if (skill.descShort) return skill.descShort;
  const desc = String(skill.desc || '');
  const cut = desc.replace(/\s*(?:No mana cost|\d+(?:\.\d+)? mana),\s*\d+(?:\.\d+)?s cooldown\.\s*$/, '');
  return cut || desc;
}
