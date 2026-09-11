// Name Forge demo UI. The engine is namegen.js; this page just turns knobs.
import { el, select, button, panel, toast, downloadJSON, copyText, textInput, knob, checkbox } from '../../shared/ui.js';
import { makeStore } from '../../shared/store.js';
import { NameGen } from './namegen.js';
import { Library } from '../../library/js/library.js';
import { loadDeps, makeCharacter } from '../../library/js/make.js';
const LIB = await Library.open('../library/'); let DEPS = null;

const store = makeStore('namegen', 1);
const gen = await NameGen.load('data/');
const status = document.getElementById('status');
const CATS = { 'person.full': 'Person (full name)', 'person.given': 'Given name', 'person.family': 'Family name', 'person.epithet': 'Epithet / title', faction: 'Faction', region: 'Region / realm', settlement: 'Settlement', landmark: 'Landmark', object: 'Artifact / object', motto: 'Motto' };
const state = { race: store.get('race', 'elf'), category: store.get('category', 'person.full'), gender: store.get('gender', 'any'), count: 12, seed: '', favs: store.get('favs', []) };

// ---------- left: controls ----------
const left = document.getElementById('left');
const raceChips = el('div', { class: 'chips race-chips' });
function renderRaces() { raceChips.replaceChildren(...gen.races.map(r => el('span', { class: 'chip' + (state.race === r ? ' on' : ''), text: r, onclick: () => { state.race = r; store.set('race', r); renderRaces(); renderLang(); go(); } }))); }
const catSel = select('Category', Object.entries(CATS).map(([value, label]) => ({ value, label })), state.category, v => { state.category = v; store.set('category', v); go(); });
const genderSel = select('Gender', [{ value: 'any', label: 'any' }, { value: 'm', label: 'masc' }, { value: 'f', label: 'fem' }, { value: 'n', label: 'neutral' }], state.gender, v => { state.gender = v; store.set('gender', v); go(); });
const countK = knob('How many', { min: 1, max: 60, step: 1, value: 12 }, v => state.count = v);
const seedIn = textInput('Seed', '', v => state.seed = v, { placeholder: 'blank = random (same seed = same names)' });
const langInfo = el('div');
function renderLang() {
  const L = gen.lang(state.race); const ph = L.phonology;
  langInfo.replaceChildren(el('p', { class: 'small' }, el('b', { text: L.name }), ` — ${L.style.join(', ')}. ${L.notes || ''}`),
    el('table', { class: 'lang-info' }, el('tbody', {}, el('tr', {}, el('td', { text: 'onsets' }), el('td', { text: Object.keys(ph.onsets).filter(Boolean).join(' ') })), el('tr', {}, el('td', { text: 'vowels' }), el('td', { text: Object.keys(ph.nuclei).join(' ') })), el('tr', {}, el('td', { text: 'codas' }), el('td', { text: Object.keys(ph.codas).filter(Boolean).join(' ') })), el('tr', {}, el('td', { text: 'endings' }), el('td', { text: `m: ${ph.endings.m.filter(Boolean).join(' ')} · f: ${ph.endings.f.filter(Boolean).join(' ')}` })), el('tr', {}, el('td', { text: 'lexicon' }), el('td', { text: Object.entries(L.lexicon).slice(0, 12).map(([k, v]) => `${k}=${v}`).join(' ') + (Object.keys(L.lexicon).length > 12 ? ' …' : '') })))),
    el('div', { class: 'small muted', text: `${L.curated.given.m.length + L.curated.given.f.length + L.curated.given.n.length} curated given names · ${L.curated.familyNative.length} family names · ${L.curated.epithets.length} epithets` }));
}
left.append(panel('Race', raceChips), panel('What', catSel, genderSel, countK, seedIn, button('⚒ Generate', () => go(), 'primary')), panel('Language', langInfo));
renderRaces(); renderLang();

// ---------- middle: results ----------
const main = document.getElementById('main');
const results = el('div', { class: 'names' }); let last = [];
function card(r, fav = false) {
  const forms = Object.entries(r.forms).filter(([k]) => k !== 'sg').map(([k, v]) => `${k}: ${v}`).join(' · ');
  return el('div', { class: 'name', title: 'click to favourite / copy', onclick: () => { toggleFav(r); copyText(r.text); } }, el('div', { class: 't', text: r.text }), r.forms?.short && state.category === 'person.full' ? button('+ library', async (ev) => { ev.stopPropagation(); DEPS = DEPS || await loadDeps('../'); const ch = makeCharacter({ name: r.text, race: r.race || state.race, gender: r.gender === 'm' || r.gender === 'f' ? r.gender : undefined, seed: r.seed }, DEPS); ch.respell = r.respell; ch.short = r.forms.short; ch.nameGloss = r.gloss?.join(' + '); LIB.putCharacter(ch, { source: 'namegen' }); toast(`${r.text} added to the library as a full character`); }, 'small') : null, r.gloss.length ? el('div', { class: 'g', text: '“' + r.gloss.join(' + ') + '”' }) : null, el('div', { class: 'g', text: r.respell }), forms ? el('div', { class: 'f', text: forms }) : null);
}
function go() {
  const seed = state.seed.trim() ? [...state.seed.trim()].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) : undefined;
  last = gen.batch(state.category, state.count, { race: state.race, gender: state.gender, seed });
  results.replaceChildren(...last.map(r => card(r))); renderJson();
  status.textContent = `${last.length} × ${CATS[state.category]} · ${state.race}`;
}
const allTable = el('div');
const allBtn = button('One of everything, every race', () => {
  const cats = ['person.full', 'faction', 'settlement', 'landmark', 'object', 'motto'];
  allTable.replaceChildren(el('table', { class: 'grid-all' }, el('thead', {}, el('tr', {}, el('th', { text: 'race' }), ...cats.map(c => el('th', { text: c.replace('person.full', 'person') })))), el('tbody', {}, ...gen.races.map(race => el('tr', {}, el('th', { text: race }), ...cats.map(c => el('td', { text: gen.generate(c, { race }).text })))))));
});
main.append(el('div', { class: 'panel' }, el('div', { class: 'row' }, button('⚒ Generate', () => go(), 'primary'), button('Export batch JSON', () => downloadJSON(last, `${state.race}-${state.category}.json`), 'small'), button('Export as lingo lexicon', () => downloadJSON({ entries: last.map(r => gen.toLexiconEntry(r)) }, `${state.race}-${state.category}-lexicon.json`), 'small'), el('span', { class: 'small muted', text: 'click a name to favourite it and copy it' })), results), panel('Overview', allBtn, allTable));

// ---------- right: favourites + JSON ----------
const right = document.getElementById('right');
const favList = el('div', { class: 'names fav' });
function toggleFav(r) { const i = state.favs.findIndex(f => f.text === r.text); if (i >= 0) state.favs.splice(i, 1); else state.favs.push(r); store.set('favs', state.favs); renderFavs(); }
function renderFavs() { favList.replaceChildren(...state.favs.map(r => card(r, true))); if (!state.favs.length) favList.append(el('p', { class: 'muted small', text: 'Click names to collect them here.' })); }
const jsonArea = el('textarea', { id: 'json' });
function renderJson() { jsonArea.value = JSON.stringify(last.slice(0, 3), null, 2); }
right.append(panel('Favourites', el('div', { class: 'row' }, button('Export favourites (lingo lexicon)', () => downloadJSON({ entries: state.favs.map(r => gen.toLexiconEntry(r)) }, 'favourites-lexicon.json'), 'small'), button('Clear', () => { state.favs = []; store.set('favs', []); renderFavs(); }, 'small')), favList), panel('Result JSON (first 3)', el('p', { class: 'small muted', text: 'Each result carries parts, gloss (concept meanings), forms (plural, adjective, people, possessive, short), a pronunciation respelling and tags. toLexiconEntry() turns it into a Lingo dictionary entry.' }), jsonArea));
renderFavs(); go();
window.nameForge = { gen, state, go, last: () => last };
