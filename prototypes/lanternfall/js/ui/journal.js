// Journal — Satchel tab (docs/02 §18): Bestiary (monsters you have fought), People (and "People you could still
// help" for the Kindling flags, 01), and the Wick Book (named wicks). Reads game state only.
import { el, cap } from './menukit.js';
const heroOf = ctx => (typeof ctx.hero === 'function' ? ctx.hero() : ctx.hero) || ctx.game?.hero;
const KINDLING = [['tallow_cooled', 'Brother Seld hopes Mother Tallow can be cooled, not burned.'], ['pim_trusted', 'Pim wants to carry a lantern post for you.'], ['hollis_lantern', "Hollis Crane's brother had a lantern…"], ['pale_kept', 'Sister Unna asks you to keep the Market Cistern flooded.'], ['nell_alive', 'Nell is going on one last hunt in Stilt Town.'], ['widow_mercy', 'The Mothwife asks you to end the Widow with Gleam.'], ['knell_spared', 'Deacon Marl will deal if you spare the Knell.'], ['corvin_freed', 'Someone is caught in the root.']];
export const journal = {
  id: 'journal', title: 'Journal', satchel: true,
  render(root, ctx) {
    const g = ctx.game || {}, H = heroOf(ctx) || {}, D = ctx.data || {};
    const seen = Object.keys(g.bestiary || {});
    const beasts = seen.length ? seen.map(id => { const d = D.enemies?.byId?.[id]; return el('div', { class: 'lf-panel' }, el('b', { text: d?.name || id }), el('span', { class: 'dim small', text: ` — killed ${g.bestiary[id]}` }), d ? el('p', { class: 'small', text: `Weak to: ${Object.entries(d.resist || {}).filter(([, v]) => v < 0).map(([k]) => cap(k)).join(', ') || 'nothing in particular'}.` }) : null); }) : [el('p', { class: 'dim', text: 'Nothing fought yet.' })];
    const help = KINDLING.filter(([f]) => g.flags?.[`hint_${f}`] && !H.kindling?.[f]).map(([f, t]) => el('li', { text: t }));
    const wicks = (H.wicks || []).filter(w => w.dish || w.name).map(w => el('li', { text: `${w.dish || w.name} — ${cap(w.flame)} ${cap(w.shape)}${(w.charms || []).length ? ' + ' + w.charms.map(cap).join(', ') : ''}` }));
    root.append(el('div', { class: 'lf-frame-body col' },
      el('h3', { class: 'lf-h', text: 'Bestiary' }), ...beasts,
      el('h3', { class: 'lf-h', text: 'People you could still help' }), help.length ? el('ul', {}, ...help) : el('p', { class: 'dim', text: 'No one is asking yet.' }),
      el('h3', { class: 'lf-h', text: 'Wick Book' }), wicks.length ? el('ul', {}, ...wicks) : el('p', { class: 'dim', text: 'Odile names wicks that burn in well.' })));
  },
};
export const screens = [journal];
