// Item Vault demo UI.
import { el, select, button, panel, toast, downloadJSON, copyText, knob, checkbox } from '../../shared/ui.js';
import { makeStore } from '../../shared/store.js';
import { ItemCatalog, RARITY } from './items.js';
import { NameGen } from '../../namegen/js/namegen.js';

const store = makeStore('items', 1);
const [cat, gen] = await Promise.all([ItemCatalog.load('data/'), NameGen.load('../namegen/data/')]);
const status = document.getElementById('status');
const state = { race: store.get('race', 'dwarf'), category: '', rarity: 'any', tags: new Set(), count: 8 };

// ---------- left: filters ----------
const left = document.getElementById('left');
const raceChips = el('div', { class: 'chips race-chips' });
function renderRaces() { raceChips.replaceChildren(el('span', { class: 'chip' + (!state.race ? ' on' : ''), text: 'any', onclick: () => { state.race = ''; renderRaces(); refresh(); } }), ...cat.races.map(r => el('span', { class: 'chip' + (state.race === r ? ' on' : ''), text: r, onclick: () => { state.race = r; store.set('race', r); renderRaces(); refresh(); } }))); }
const catSel = select('Category', [{ value: '', label: 'any' }, ...cat.categories], '', v => { state.category = v; refresh(); });
const rarSel = select('Rarity', ['any', ...RARITY], 'any', v => { state.rarity = v; refresh(); });
const countK = knob('Roll how many', { min: 1, max: 30, step: 1, value: 8 }, v => state.count = v);
const tagCloud = el('div', { class: 'tag-cloud' });
function renderTags() { tagCloud.replaceChildren(...cat.tags.slice(0, 120).map(t => el('span', { class: 'chip' + (state.tags.has(t) ? ' on' : ''), text: t, onclick: () => { state.tags.has(t) ? state.tags.delete(t) : state.tags.add(t); renderTags(); refresh(); } }))); }
left.append(panel('Race (affinity)', el('p', { class: 'small muted', text: 'Items each race favours are weighted up; exclusives only appear for their race.' }), raceChips), panel('Filters', catSel, rarSel, countK), panel('Tags (all must match)', tagCloud));
renderRaces(); renderTags();

// ---------- middle: loot + catalog ----------
const main = document.getElementById('main');
const lootList = el('div'); let lastRolls = [];
function lootCard(r) { return el('div', { class: 'loot ' + r.rarity, onclick: () => copyText(JSON.stringify(r, (k, v) => k === 'base' ? undefined : v, 2)) }, el('div', { class: 'n', text: r.fullName }), el('div', { class: 'm', text: `${r.rarity} · ${r.category}/${r.sub} · ${r.material || 'no material'} · ${r.quality}${r.enchant ? ' · ' + r.enchant : ''} · ${r.value} silver · tags: ${r.tags.slice(0, 10).join(', ')}` }), el('div', { class: 'l', text: r.desc + ' ' + (r.lore || '') })); }
function rollMany() { lootList.replaceChildren(); lastRolls = []; for (let i = 0; i < state.count; i++) { const r = cat.roll({ race: state.race || null, category: state.category || undefined, rarity: state.rarity, tags: [...state.tags], namegen: gen }); if (!r) { lootList.append(el('p', { class: 'muted', text: 'Nothing matches those filters.' })); break; } lastRolls.push(r); lootList.append(lootCard(r)); } renderJson(); }
const catalogHost = el('div', { class: 'catalog' });
function renderCatalog() {
  const rows = cat.query({ race: state.race || null, category: state.category || undefined, tags: [...state.tags], rarity: state.rarity === 'any' ? undefined : state.rarity });
  catalogHost.replaceChildren(el('table', {}, el('thead', {}, el('tr', {}, ...['item', 'category', 'rarity', 'value', 'affinity / tags'].map(t => el('th', { text: t })))), el('tbody', {}, ...rows.map(({ item, weight }) => el('tr', {}, el('td', { title: item.desc }, el('b', { text: item.name }), item.exclusive ? el('span', { class: 'badge warn', text: item.exclusive + ' only', style: { marginLeft: '6px' } }) : null), el('td', { text: item.category + '/' + item.sub }), el('td', { text: item.rarity }), el('td', { text: item.value.join('–') }), el('td', { class: 'aff', text: Object.entries(item.affinity).map(([r, w]) => `${r}:${w}`).join(' ') + ' · ' + item.tags.join(' ') }))))));
  status.textContent = `${rows.length} of ${cat.items.length} items match · ${state.race || 'any race'}`;
}
main.append(el('div', { class: 'panel' }, el('div', { class: 'row' }, button('🎲 Roll loot', rollMany, 'primary'), button('Export rolls JSON', () => downloadJSON(lastRolls.map(r => ({ ...r, base: undefined })), 'loot.json'), 'small'), button('Export as lingo lexicon', () => downloadJSON({ entries: lastRolls.map(r => cat.toLexiconEntry(r)) }, 'loot-lexicon.json'), 'small'), el('span', { class: 'small muted', text: 'click a card to copy its JSON' })), lootList), panel('Catalog (filtered)', el('div', { class: 'row' }, button('Export whole catalog as lingo lexicon', () => downloadJSON({ entries: cat.items.map(i => cat.toLexiconEntry(i)) }, 'items-lexicon.json'), 'small')), catalogHost));

// ---------- right: counts + JSON ----------
const right = document.getElementById('right');
const counts = el('table', { class: 'counts' }); const byCat = {}; for (const i of cat.items) byCat[i.category] = (byCat[i.category] || 0) + 1;
counts.append(el('tbody', {}, ...Object.entries(byCat).map(([c, n]) => el('tr', {}, el('td', { text: c }), el('td', { text: n }))), el('tr', {}, el('td', {}, el('b', { text: 'total' })), el('td', {}, el('b', { text: cat.items.length })))));
const raceCounts = el('table', { class: 'counts' }); raceCounts.append(el('tbody', {}, ...cat.races.map(r => el('tr', {}, el('td', { text: r }), el('td', { text: `${cat.items.filter(i => (i.affinity[r] ?? 0) >= 2).length} favoured · ${cat.items.filter(i => i.exclusive === r).length} exclusive` })))));
const jsonArea = el('textarea', { id: 'json' }); function renderJson() { jsonArea.value = JSON.stringify(lastRolls.slice(0, 2).map(r => ({ ...r, base: undefined })), null, 2); }
right.append(panel('Catalog size', counts, el('h3', { text: 'Per race', style: { marginTop: '8px' } }), raceCounts), panel('Rolled item JSON (first 2)', el('p', { class: 'small muted', text: 'A rolled item = catalog base + material + quality + enchant + optional artifact name (from Name Forge) + value + lore. toLexiconEntry() gives Lingo its plural and tags.' }), jsonArea));
function refresh() { renderCatalog(); }
refresh(); rollMany();
window.itemVault = { cat, gen, state, roll: rollMany, last: () => lastRolls };
