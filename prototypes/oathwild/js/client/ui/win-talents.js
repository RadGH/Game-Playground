// Talents: four rows that open at character levels 1 / 4 / 7 / 10, each talent with its ranks; points come at levels
// 3, 6 and 9 and from every 25 in a skill. A talent you can't take yet says why on its own card (lessons rule 10).
//
//   app.openWindow('talents') → .win-talents  (.tal-card[data-talent], [data-act="take"][data-talent])
import { openWin, esc } from './kit.js';
import { tipAttrs } from './tip.js';
import { glyph } from './icons.js';
import { talentDef, talentIds, talentPointsLeft, talentRefusal, rowLevel } from '../../rules/talents.js';
import { attrTotals } from '../../rules/sheet.js';
import { profSources } from '../../rules/proficiency.js';
import { describeTalent } from '../../rules/describe.js';
import { fmt } from '../../../../../shared/format.js';

export function open(app) {
  const w = openWin({ id: 'talents', title: 'Talents', size: 'wide', cls: 'win-talents', render: (body) => render(app, body), foot: (el, w) => wire(app, el, w) });
  if (!w._on) { w._on = true; w.follow(app, 'me', () => JSON.stringify(app.me)); }   // only when my character changed (the server refreshes every 2 s)
  return w;
}

function render(app) {
  const c = app.me?.char;
  if (!c) return '<p class="ow-empty">Your character is still on the way.</p>';
  const rules = app.rules, left = talentPointsLeft(rules, c);
  const ctx = { attrs: attrTotals(rules, c), profs: profSources(rules, c) };
  const rows = {};
  for (const id of talentIds(rules)) { const d = talentDef(rules, id); (rows[d.row] = rows[d.row] || []).push(id); }
  const head = `<div class="tal-head ow-card"><span class="tal-points ${left > 0 ? 'has' : ''}">${glyph('star', 20)}<b>${fmt(left)}</b> talent point${left === 1 ? '' : 's'} to spend</span><small class="ow-dim">Points at levels ${rules.data.talents.pointLevels.map(l => fmt(l)).join(', ')} and for every 25 in a skill.</small></div>`;
  return head + Object.keys(rows).sort((a, b) => a - b).map(r => {
    const open = (c.level || 1) >= rowLevel(rules, +r);
    return `<section class="ow-section tal-row ${open ? '' : 'is-closed'}"><h3>Row ${fmt(+r)} <span class="ow-dim">${open ? '' : `· opens at level ${fmt(rowLevel(rules, +r))}`}</span></h3><div class="tal-grid">${rows[r].map(id => {
      const d = talentDef(rules, id), have = c.talents?.[id] || 0, max = d.ranks || 1;
      const why = have < max ? talentRefusal(rules, c, id, ctx) : null;
      const m = describeTalent(rules, c, id);
      const state = have >= max ? 'is-max' : have ? 'is-have' : why ? 'is-locked' : 'is-open';
      return `<div class="tal-card ${state}${d.cornerstone ? ' is-corner' : ''}" data-talent="${esc(id)}">
        <button type="button" class="tal-main" ${tipAttrs('talent', { id })}><b>${esc(d.name)}</b>${d.cornerstone ? '<small class="ow-gold">Cornerstone</small>' : ''}
        <span class="cls-pips">${Array.from({ length: max }, (_, i) => `<i class="${i < have ? 'on' : ''}"></i>`).join('')}</span>
        <span class="tal-text">${esc((m.lines || []).slice(0, 2).join(' '))}</span></button>
        ${have >= max ? '<span class="ow-good tal-state">Taken</span>' : why ? `<span class="tal-why">${esc(why)}</span>` : `<button type="button" class="ow-btn ow-primary ow-small" data-act="take" data-talent="${esc(id)}">${glyph('plus', 16)}${have ? `Rank ${fmt(have + 1)}` : 'Take'}</button>`}
      </div>`;
    }).join('')}</div></section>`;
  }).join('');
}

function wire(app, el, w) {
  el.innerHTML = `<button type="button" class="ow-btn" data-act="sheet">${glyph('people', 18)}Character</button><button type="button" class="ow-btn" data-act="classes">${glyph('level', 18)}Classes</button>`;
  for (const k of ['sheet', 'classes']) el.querySelector(`[data-act="${k}"]`).onclick = () => { w.close(); app.openWindow(k); };
  w.body.querySelectorAll('[data-act="take"]').forEach(b => { b.onclick = () => { app.act('talent', { id: b.dataset.talent }); app.sfx('ui.click'); }; });
}
