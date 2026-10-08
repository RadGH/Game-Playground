// W9 professions — the Professions list: ten skills with their levels, your tool, and what the next band unlocks.
// Shown as a block of the Character menu (`sheet.addSection`) and as a page of the journal (`journal.addTab`) — D-UI
// owns both frames; this file only draws into them.
//
// Every number is the server's (`you.professions.list`: level, xp, next, rank, tool) or read from the two data files
// (data/rules/professions.json: tiers, ranks, who teaches what · data/provinces/professions.json: what a tier holds).

import { h } from '../ui-panel.js';
import { fmt } from '../../../../../shared/format.js';
import { profIcon, PROF_TINT } from './prof-icons.js';

const ROLE_WORD = { prospector: 'the prospector', smith: 'a smith', armourer: 'an armourer', jeweller: 'a jeweller', bowyer: 'a bowyer', tailor: 'a tailor', stablehand: 'a stablehand', apothecary: 'an apothecary', innkeeper: 'an innkeeper', provisioner: 'a provisioner', angler: 'an angler' };
const list = a => (a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' or ' + a[a.length - 1]);

/** Who teaches a profession, in words ("a smith or the prospector"), from the data file's `roles`. Pure. */
export function teachersOf(id, numbers) {
  const roles = Object.entries(numbers?.roles || {}).filter(([k, r]) => k !== '_doc' && r && (r.trains || []).includes(id)).map(([k]) => ROLE_WORD[k] || 'the ' + k);
  return roles.length ? list(roles) : null;
}
/**
 * What the next band of a profession opens: { at (skill), tier, names: [...] } or — past the last tier, or for a
 * craft with tiers of its own — the next RANK: { at, rank }. null at the top. Pure.
 */
export function nextUnlock(row, numbers, content) {
  if (!row || !numbers) return null;
  const level = row.level || 1;
  const tier = (numbers.tiers || []).find(t => t.minSkill > level);
  if (tier && row.id !== 'angling') {
    const names = row.kind === 'gather'
      ? Object.values(content?.nodeKinds || {}).filter(k => k && k.prof === row.id && k.tier === tier.tier).map(k => k.name)
      : (content?.recipes || []).filter(r => r.prof === row.id && (r.tier || 1) === tier.tier).map(r => r.name);
    if (names.length || row.id === 'tempering') return { at: tier.minSkill, tier: tier.tier, names: [...new Set(names)].slice(0, 4), more: Math.max(0, new Set(names).size - 4), levels: tier.levels };
  }
  const rank = (numbers.skill?.ranks || []).find(([at]) => at > level);
  return rank ? { at: rank[0], rank: rank[1] } : null;
}
/** One line for the row: "At 25: Iron Boulder, Tin Vein" / "Next rank: Journeyman at 30" / "Mastered". Pure. */
export function unlockText(row, numbers, content) {
  if (!row.known) { const who = teachersOf(row.id, numbers); return who ? `Not learned. Taught by ${who}, for nothing.` : 'Not learned.'; }
  const u = nextUnlock(row, numbers, content);
  if (!u) return row.level >= (row.max || 100) ? 'Mastered.' : '';
  if (u.rank) return `Next rank: ${u.rank} at ${u.at}.`;
  if (row.id === 'tempering') return `At ${u.at}: work on tier ${u.tier} gear (item levels ${u.levels?.[0]}–${u.levels?.[1]}).`;
  return `At ${u.at}: ${u.names.join(', ')}${u.more ? ` and ${u.more} more` : ''}.`;
}

/** How far through its level a row is (0..1): `next` is what is still missing, the level's span comes from the data file's curve. Pure. */
export function levelFraction(r, numbers) {
  if (!r.known) return 0; if (r.next == null) return 1;
  const K = numbers?.skill; if (!K || r.id === 'angling') return r.xp + r.next > 0 && r.id === 'angling' ? Math.max(0, Math.min(1, r.xp / (r.xp + r.next))) : 0;
  const at = l => { const n = l - 1; return K.xpBase * n + K.xpPerLevel * n * (n + 1) / 2; }, span = at(r.level + 1) - at(r.level);
  return span > 0 ? Math.max(0, Math.min(1, 1 - r.next / span)) : 0;
}
/** The rows as DOM. `compact` = the Character menu's block (one line each); else the journal page (with the unlock line). */
export function professionRows(rows, { numbers = null, content = null, compact = false, onOpen = null } = {}) {
  if (!rows || !rows.length) return [h('p.empty', {}, 'No professions yet. A craftsman in any town teaches one — it costs nothing.')];
  const groups = [['gather', 'Gathering'], ['make', 'Making']];
  const out = [];
  for (const [kind, title] of groups) {
    const mine = rows.filter(r => r.kind === kind); if (!mine.length) continue;
    out.push(h('h4.pk-h', {}, title));
    out.push(h('ul.pk-list' + (compact ? '.compact' : ''), {}, ...mine.map(r => {
      const frac = levelFraction(r, numbers);
      const tip = r.known ? `${r.name} ${r.level} of ${r.max || 100}${r.rank ? ' — ' + r.rank : ''}.${r.next ? ` ${fmt(r.next, { decimals: 0 })} more to the next level.` : ''} ${unlockText(r, numbers, content)}` : unlockText(r, numbers, content);
      return h('li.pk-row' + (r.known ? '' : '.unknown'), { dataset: { prof: r.id, tip }, style: `--pt:${PROF_TINT[r.id] || '#d9b26a'}` },
        h('i.pk-ico', {}, profIcon(r.id, compact ? 18 : 22)),
        h('div.pk-main', {},
          h('div.pk-top', {}, h('b', {}, r.name), r.known ? h('span.pk-rank', {}, r.rank || '') : h('span.pk-rank', {}, 'Not learned'), r.known ? h('span.pk-lv', {}, `${r.level}`, h('small', {}, ` / ${r.max || 100}`)) : null),
          r.known ? h('div.pk-bar', {}, h('i', { style: `width:${(frac * 100).toFixed(1)}%` })) : null,
          compact ? null : h('small.pk-next', {}, unlockText(r, numbers, content)),
          compact || !r.known || r.kind !== 'gather' || r.id === 'angling' ? null : h('small.pk-tool' + (r.tool ? '' : '.lack'), {}, r.tool ? `Tool: ${r.tool.name}` : 'No tool in your bag — its teacher sells one.')),
        !compact && r.known && r.kind === 'make' && onOpen ? h('button.ghost.small.pk-open', { type: 'button', dataset: { open: r.id }, onclick: () => onOpen(r.id) }, 'Recipes') : null);
    })));
  }
  return out;
}
