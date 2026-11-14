// Choosing a class (owner 2026-11-13: "pick the base class straight away"). Used by the hero creator and, for a hero
// saved before classes came at creation, by the class screen that opens before they can play. Looking is separate from
// choosing (lessons rule 47): a tile only shows that class's details; the screen's own button commits.
//   classTiles(content, picked)   the four tiles (data-class="<id>")
//   classDetail(content, id)      the picked class: what it does, its resource, its first skills with their numbers
import { PATH_BONUS } from '../rules/sheet.js';
import { skillIcon } from './icons.js';
import { skillText, RES_NAME } from '../rules/skill-text.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/** One line each: how the class fights. */
export const ROLE = { fighter: 'Up close · takes the hits', rogue: 'Blades and bows · sets up the kill', mage: 'Spells from range · slows the pack', healer: 'Keeps the party up · holy damage' };
const bonusText = id => { const b = PATH_BONUS[id]; if (!b) return ''; return [b.hpPct && `+${b.hpPct}% health`, b.armourPct && `+${b.armourPct}% armour`, b.dodge && `+${b.dodge}% dodge`, b.dr && `${b.dr}% less damage taken`].filter(Boolean).join(', '); };
/** The skills a new hero of this class has on day one (level-1 actives of the class, starters first). */
export function firstSkills(content, id) {
  const P = content.paths[id]; if (!P) return [];
  const S = content.skills, first = Object.values(S).filter(s => s.kind === 'active' && s.owner === id && (s.reqLevel || 1) <= 1 && !s.hidden && !s.autoAttack);
  const at = s => { const i = (P.starter || []).indexOf(s.id); return i < 0 ? 99 : i; };
  return first.sort((a, b) => at(a) - at(b));
}
export function classTiles(content, picked) {
  return `<div class="class-tiles" role="radiogroup" aria-label="Class">${Object.entries(content.paths).map(([id, p]) => {
    const em = content.skills[(p.starter || [])[0]];
    return `<button class="class-tile ct-${id}${picked === id ? ' on' : ''}" data-class="${id}" role="radio" aria-checked="${picked === id}">
      <span class="em">${em ? skillIcon(em, content, 40) : ''}</span><b>${esc(p.name)}</b><small>${esc(ROLE[id] || '')}</small></button>`;
  }).join('')}</div>`;
}
export function classDetail(content, id) {
  const p = content.paths[id]; if (!p) return '<div class="class-detail empty"><p>Pick a class to see how it plays.</p></div>';
  const bonus = bonusText(id);
  return `<div class="class-detail cd-${id}"><div class="cd-head"><b>${esc(p.name)}</b><span class="res-pill res-${esc(p.resource)}">${esc(RES_NAME[p.resource] || 'Mana')}</span></div>
    <p>${esc(p.blurb)}</p>${bonus ? `<p class="bonus">Built to take hits: ${esc(bonus)}</p>` : ''}
    <ul class="cd-skills">${firstSkills(content, id).map(s => `<li><span class="ic">${skillIcon(s, content, 30)}</span><span><b>${esc(s.name)}</b><small>${esc(skillText(s, 1, 1))}</small></span></li>`).join('')}</ul>
    <p class="cd-more">New skills every level up to 8, a talent point every level from 2, and a specialization at 10.</p></div>`;
}
