// Lingo demo UI. Engine lives in lingo.js / morph.js; this file only builds the knobs.
import { el, knob, select, checkbox, button, textInput, panel, toast, downloadJSON, copyText, readJSONFile } from '../../shared/ui.js';
import { makeStore } from '../../shared/store.js';
import { Lingo, Lexicon, Speaker, Entity, SLIDERS, CUSTOM_SLOTS, DEFAULT_FILTERS, respellToEspeak } from './lingo.js';

const store = makeStore('lingo', 1);
const load = async f => (await fetch('data/' + f)).json();
const [lexData, grammarData, traitsData, speakersData] = await Promise.all([load('lexicon.json'), load('grammar.json'), load('traits.json'), load('speakers.json')]);
const savedLex = store.get('lexicon'); if (savedLex) lexData.entries = savedLex.entries;
const lingo = new Lingo({ lexicon: lexData, grammar: grammarData, traits: traitsData });
const TRAITS = traitsData.traits; const status = document.getElementById('status');

// ---------- speakers ----------
function makeSpeaker(def) { return new Speaker({ id: def.id, name: def.name, entry: lingo.lexicon.get(def.entry), lexicon: lingo.lexicon, speech: JSON.parse(JSON.stringify(def.speech)) }); }
function customSpeaker(name = 'Custom', race = 'human', pronouns = 'they') { const entry = { id: 'custom_' + name.toLowerCase().replace(/\W+/g, '_'), type: 'person', proper: true, pronouns, race, forms: { sg: name, short: name } }; return new Speaker({ id: entry.id, name, entry, lexicon: lingo.lexicon, speech: { ...SLIDERS, traits: [], custom: {}, customRate: {}, tics: [], mood: 0 } }); }
const state = { A: null, B: null, opinionAB: 0, opinionBA: 0, showSpeech: false, voice: false };
const savedA = store.get('speakerA'); state.A = savedA ? new Speaker({ ...savedA, entry: savedA.entry, lexicon: lingo.lexicon }) : makeSpeaker(speakersData.speakers[0]);
state.B = makeSpeaker(speakersData.speakers[1]);

// ---------- left: speaker editors ----------
const left = document.getElementById('left');
function speakerEditor(key) {
  const wrap = el('div'); const get = () => state[key];
  const sel = select('', [...speakersData.speakers.map(s => ({ value: s.id, label: s.name })), { value: '__custom', label: '— custom character —' }], get().id, id => { state[key] = id === '__custom' ? customSpeaker() : makeSpeaker(speakersData.speakers.find(s => s.id === id)); rebuild(); changed(); });
  const nameIn = textInput('Name', get().name, v => { get().name = v; get().entry.forms.sg = v; get().entry.forms.short = v; changed(); });
  const raceSel = select('Race', lingo.lexicon.byType('race').map(r => ({ value: r.id, label: r.forms.sg })), get().entry.race || 'human', v => { get().entry.race = v; changed(); });
  const pronSel = select('Pronouns', ['he', 'she', 'they', 'it'], typeof get().entry.pronouns === 'string' ? get().entry.pronouns : 'they', v => { get().entry.pronouns = v; changed(); });
  const traitChips = el('div', { class: 'chips' });
  const renderTraits = () => traitChips.replaceChildren(...TRAITS.map(t => el('span', { class: 'chip' + (get().has(t.id) ? ' on' : ''), title: t.desc, text: t.name, onclick: () => { const tr = get().speech.traits; const i = tr.indexOf(t.id); if (i >= 0) tr.splice(i, 1); else tr.push(t.id); renderTraits(); changed(); } })));
  renderTraits();
  const sliders = el('div');
  for (const k of [...Object.keys(SLIDERS), 'mood']) sliders.append(knob(k, { min: k === 'mood' ? -1 : 0, max: 1, step: 0.05, value: get().speech[k] ?? 0, title: SLIDER_DOC[k] }, v => { get().speech[k] = v; changed(); }));
  const slots = el('div', { class: 'slot-grid' });
  for (const s of CUSTOM_SLOTS) { const inp = el('input', { type: 'text', value: get().custom(s) || '', placeholder: SLOT_DOC[s] || '' }); inp.addEventListener('input', () => { if (inp.value.trim()) get().speech.custom[s] = inp.value; else delete get().speech.custom[s]; changed(); }); slots.append(el('label', { text: s }), inp); }
  const ticChips = el('div', { class: 'chips' });
  const renderTics = () => ticChips.replaceChildren(...Object.keys(DEFAULT_FILTERS).filter(t => t !== 'contractions').map(t => el('span', { class: 'chip' + (get().speech.tics.includes(t) ? ' on' : ''), text: t, onclick: () => { const arr = get().speech.tics; const i = arr.indexOf(t); if (i >= 0) arr.splice(i, 1); else arr.push(t); renderTics(); changed(); } })));
  renderTics();
  wrap.append(el('div', { class: 'speaker-head' }, sel), nameIn, raceSel, pronSel,
    panel('Traits (RimWorld-style; weight phrase tags)', traitChips),
    panel('Sliders', sliders),
    panel('Custom slots (Tomodachi-style)', el('p', { class: 'small muted', text: 'Used instead of the generic word/phrase most of the time. prefix/suffix wrap whole lines; catchphrase is appended sometimes; mood slots replace mood lines.' }), slots),
    panel('Verbal tics (post-filters)', ticChips));
  return wrap;
}
const SLIDER_DOC = { formality: 'formal ↔ casual wording, contractions', verbosity: 'short ↔ long lines; how often prefix/suffix/catchphrase attach', cheer: 'happy ↔ gloomy phrase weighting', aggression: 'gentle ↔ aggressive/crude', confidence: 'timid ↔ confident', mood: 'runtime mood: -1 furious/sad … +1 joyful' };
const SLOT_DOC = { greeting: 'Well met', farewell: 'Walk with the Root', catchphrase: 'The roots remember.', prefix: 'Lost the game.', suffix: 'as I always say', happy: 'a whole happy line', angry: 'a whole angry line', sad: 'a whole sad line', worried: 'a whole worried line', yes: 'Aye', no: 'Piss off', thanks: 'Much obliged', curse: 'rot and ruin', oath: 'by the Root' };
let editorA, editorB;
function rebuild() {
  editorA?.remove(); editorB?.remove();
  editorA = panel('Speaker A (the one talking)', speakerEditor('A'));
  editorB = panel('Speaker B (listener / reply)', speakerEditor('B')); editorB.classList.add('closed');
  left.prepend(editorA, editorB);
}
const opinionPanel = panel('Relationship', knob('A → B opinion', { min: -1, max: 1, step: 0.05, value: 0, title: 'How A feels about B (-1 hates, +1 loves). Weights friendly/hostile tags and the conversation planner.' }, v => { state.opinionAB = v; changed(); }), knob('B → A opinion', { min: -1, max: 1, step: 0.05, value: 0 }, v => { state.opinionBA = v; changed(); }));
left.append(opinionPanel); rebuild();

// ---------- middle ----------
const main = document.getElementById('main');
const intents = lingo.grammar.intents();
const intentSel = select('Intent', intents, 'greet', () => { intentDoc.textContent = grammarData.meta.intentDoc[intentSel.value] || ''; });
const intentDoc = el('div', { class: 'intent-doc', text: grammarData.meta.intentDoc.greet });
const output = el('div');
const speechCb = checkbox('Show speech text ([[phonemes]] for the Voice Lab)', false, v => { state.showSpeech = v; });
const voiceCb = checkbox('Speak lines with Voice Lab (loads ../voice-lab)', false, v => { state.voice = v; if (v) loadVoice(); });
let voiceApi = null; async function loadVoice() { if (voiceApi) return voiceApi; try { voiceApi = await import('../../voice-lab/js/voice.js'); const presets = await (await fetch('../voice-lab/data/presets.json')).json(); voiceApi.presets = presets.presets; toast('Voice Lab loaded'); } catch (e) { toast('Voice Lab not available: ' + e.message); state.voice = false; voiceCb.set(false); } return voiceApi; }
async function speakAloud(text, sp) { const v = await loadVoice(); if (!v) return; const preset = sp.voice || v.presets.find(p => p.id === (sp.entry.race === 'orc' ? 'gruff' : sp.entry.race === 'goblin' ? 'tiny_fairy' : sp.entry.race === 'undead' ? 'undead' : sp.entry.pronouns === 'she' ? 'adult_female' : 'adult_male'))?.voice; try { await v.say(text, preset).then(r => r.done); } catch (e) { toast('voice error: ' + e.message); } }
function renderLine(out, sp, cls = '') {
  const meta = `${out.intent}${out.entry ? ' · ' + out.entry.id : ''}${out.tags?.length ? ' · tags: ' + out.tags.join(',') : ''}${out.parts?.prefix ? ' · prefix' : ''}${out.parts?.suffix ? ' · suffix' : ''}${out.parts?.catchphrase ? ' · catchphrase' : ''}${out.parts?.customBody ? ' · custom mood line' : ''}`;
  const binds = Object.entries(out.bindings || {}).filter(([k]) => !['speaker', 'listener', 'listenerSpeaker'].includes(k)).map(([k, v]) => `${k}=${v.id}`).join(' ');
  return el('div', { class: 'line ' + cls }, el('span', { class: 'who', text: sp.name + ':' }), el('span', { text: out.text }), el('div', { class: 'meta', text: meta + (binds ? ' · ' + binds : '') }), state.showSpeech ? el('div', { class: 'speech', text: 'speech: ' + out.speech }) : null);
}
function ctxA() { return { speaker: state.A, listener: state.B, opinion: state.opinionAB }; }
const sayBtn = button('Say it', async () => { const out = lingo.speak(intentSel.value, ctxA()); output.prepend(renderLine(out, state.A)); if (state.voice) speakAloud(out.speech, state.A); }, 'primary');
const say10 = button('10 variations', () => { for (let i = 0; i < 10; i++) output.prepend(renderLine(lingo.speak(intentSel.value, ctxA()), state.A)); });
const allIntents = button('One of each intent', () => { for (const it of intents) output.prepend(renderLine(lingo.speak(it, ctxA()), state.A)); });
const clearBtn = button('Clear', () => output.replaceChildren(), 'small');
const sayPanel = el('div', { class: 'panel' }, el('h3', { text: 'Make A talk to B' }), intentSel, intentDoc, el('div', { class: 'row' }, sayBtn, say10, allIntents, clearBtn), el('div', { class: 'row' }, speechCb, voiceCb), output);

// conversation
const convOut = el('div'); const turnsK = knob('Turns', { min: 2, max: 16, step: 1, value: 8 });
const convBtn = button('Simulate conversation', async () => {
  convOut.replaceChildren(); const lines = lingo.converse(state.A, state.B, { turns: turnsK.value, opinionAB: state.opinionAB, opinionBA: state.opinionBA });
  for (const l of lines) { convOut.append(renderLine({ ...l, bindings: {} }, l.speaker, l.speaker === state.B ? 'b' : '')); if (state.voice) await speakAloud(l.speech, l.speaker); }
}, 'primary');
const convPanel = panel('Conversation simulator', el('p', { class: 'small muted', text: 'A and B take turns. The planner picks beats from opinion + traits (hostile → insults/threats, friendly → compliments/flirting), and reacts (insult → retort, question → answer). Opinion sliders are in the left column.' }), turnsK, convBtn, convOut);

// template tester
const tplIn = el('textarea', { class: 'tpl' }); tplIn.value = store.get('tpl', "{#greetword}, {listener.name}! {$race.cap.pl} like you owe me {$item.a}. {speaker.they.cap} {speaker.verb(is)} {~tired|hungry|done}, {listener.name}. {listener.race.adj.cap} pride! {3, plural, one{# coin} other{# coins}}.");
tplIn.addEventListener('input', () => store.set('tpl', tplIn.value));
const tplOut = el('div');
const tplBtn = button('Expand ×5', () => { tplOut.replaceChildren(); for (let i = 0; i < 5; i++) { try { const r = lingo.expand(tplIn.value, ctxA()); tplOut.append(el('div', { class: 'line', text: r.text })); } catch (e) { tplOut.append(el('div', { class: 'line', style: { borderColor: 'var(--bad)' }, text: 'Error: ' + e.message })); break; } } });
const cheat = el('table', { class: 'cheat' }, el('tbody', {}, ...[
  ['{listener.name}', 'binding + property: short name'], ['{speaker.race.pl}', 'follow references: speaker → race entry → plural'], ['{item.a} {item.the} {item.pl} {item.poss}', 'articles (proper nouns skip them, mass nouns get "some"), plural, possessive'],
  ['{x.cap} {x.upper} {x.lower} {x.title}', 'case'], ['{speaker.they} {speaker.them} {speaker.their} {speaker.themself}', 'pronouns from the entity'], ['{speaker.verb(is)} {crowd.verb(has)} {x.verb(walks,walk)}', 'verb agreement (3rd-singular form in, plural derived or given)'],
  ['{#symbol} {#symbol.cap}', 'expand a grammar symbol (weighted by tags/traits/conditions)'], ['{$race} {$race.pl} {$item2.a}', 'random lexicon entry of that type, stable within the line; suffix a digit for a second one'],
  ['{~a|b|c}', 'inline random alternative'], ['{n, plural, =0{none} one{# thing} other{# things}}', 'plural branch; # = the number'], ['{who, select, mara{her} other{them}}', 'select on an entity id or value'],
  ['{item.count} {item.num} {item.ordinal}', 'number, number words, ordinal'], ['{x.or(fallback)}', 'fallback when missing'], ['{{ }}', 'literal braces'],
].map(([k, v]) => el('tr', {}, el('td', { text: k }), el('td', { text: v })))));
const tplPanel = panel('Template tester', el('p', { class: 'small muted', text: 'Try any template against Speaker A and B. Bindings available: speaker, listener, any lexicon id (e.g. {elf.pl}), $type picks.' }), tplIn, tplBtn, tplOut, cheat);

// coverage
const covGrid = el('div', { class: 'cov' });
function renderCoverage() {
  const ctx = ctxA(); const w = lingo.tagWeights(state.A, ctx); covGrid.replaceChildren();
  for (const it of intents) {
    const list = lingo.grammar.symbols[it] || []; let alive = 0;
    for (const e of list) { let ok = true, ww = e.w ?? 1; for (const t of e.tags || []) { if (w[t] === 0) ok = false; else if (w[t] != null) ww *= w[t]; } if (ok && ww > 0 && (!e.cond || lingo.cond(e.cond, ctx))) alive++; }
    covGrid.append(el('div', { class: 'c' + (alive === 0 ? ' dead' : ''), title: `${alive} of ${list.length} phrases reachable` }, el('span', { text: it }), el('span', { text: `${alive}/${list.length}` })));
  }
}
const weightsOut = el('div', { class: 'tag-list' });
function renderWeights() { const w = lingo.tagWeights(state.A, ctxA()); weightsOut.textContent = Object.entries(w).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ×${v.toFixed(2)}`).join('  '); }
const covPanel = panel('Coverage for Speaker A', el('p', { class: 'small muted', text: 'How many phrases per intent this personality can still reach (traits with weight 0 remove lines; conditions on mood/opinion/race remove more). Red = dead intent: add phrases or soften the trait.' }), covGrid, el('h3', { text: 'Tag weights', style: { marginTop: '8px' } }), weightsOut);
covPanel.classList.add('closed');
main.append(sayPanel, convPanel, tplPanel, covPanel);

// ---------- right: lexicon editor + speech JSON ----------
const right = document.getElementById('right');
const lexList = el('div', { class: 'lex-list' }); let lexSel = null;
const typeFilter = select('Type', ['all', ...Object.keys(lingo.lexicon.types)], 'all', renderLex);
function renderLex() {
  lexList.replaceChildren(...lingo.lexicon.all().filter(e => typeFilter.value === 'all' || e.type === typeFilter.value).map(e => el('div', { class: 'e' + (lexSel === e.id ? ' on' : ''), onclick: () => { lexSel = e.id; fillForm(e); renderLex(); } }, el('span', { text: e.forms.sg }), el('span', { class: 't', text: e.type + (e.pron ? ' 🔊' : '') }))));
}
const f = {}; const form = el('div', { class: 'slot-grid' });
for (const [k, ph] of [['id', 'unique_id'], ['type', 'race | person | item …'], ['sg', 'singular / name'], ['pl', 'plural (blank = auto)'], ['adj', 'adjective (elven)'], ['people', 'the Elves'], ['lang', 'Elvish'], ['short', 'short name'], ['pronouns', 'he | she | they | it'], ['race', 'race id (persons)'], ['tags', 'comma,separated'], ['respell', 'pronunciation: THAY-len'], ['espeak', 'espeak phonemes (auto from respell)']]) { f[k] = el('input', { type: 'text', placeholder: ph }); form.append(el('label', { text: k }), f[k]); }
const properCb = checkbox('proper (no article)', false), massCb = checkbox('mass noun (some ale)', false);
f.respell.addEventListener('input', () => { f.espeak.value = f.respell.value ? respellToEspeak(f.respell.value) : ''; });
function fillForm(e) { for (const k of ['id', 'type', 'short', 'race']) f[k].value = e[k] ?? ''; for (const k of ['sg', 'pl', 'adj', 'people', 'lang', 'short']) f[k].value = e.forms?.[k] ?? ''; f.pronouns.value = typeof e.pronouns === 'string' ? e.pronouns : ''; f.tags.value = (e.tags || []).join(','); f.respell.value = e.pron?.respell ?? ''; f.espeak.value = e.pron?.espeak ?? (e.pron?.respell ? respellToEspeak(e.pron.respell) : ''); properCb.set(!!e.proper); massCb.set(!!e.mass); }
function readForm() { const forms = {}; for (const k of ['sg', 'pl', 'adj', 'people', 'lang', 'short']) if (f[k].value.trim()) forms[k] = f[k].value.trim(); const e = { id: f.id.value.trim(), type: f.type.value.trim() || 'item', forms, tags: f.tags.value.split(',').map(s => s.trim()).filter(Boolean) }; if (properCb.value) e.proper = true; if (massCb.value) e.mass = true; if (f.pronouns.value.trim()) e.pronouns = f.pronouns.value.trim(); if (f.race.value.trim()) e.race = f.race.value.trim(); if (f.respell.value.trim()) e.pron = { respell: f.respell.value.trim(), espeak: f.espeak.value.trim() || respellToEspeak(f.respell.value.trim()) }; return e; }
function persistLex() { store.set('lexicon', { entries: lingo.lexicon.all() }); lingo.invalidatePronunciations(); }
const lexPanel = panel('Dictionary (lexicon)', el('p', { class: 'small muted', text: 'The game-defined dictionary. Add your races, spells, places; templates use them through {$type} picks and {id.form} references. Saved in this browser.' }), typeFilter, lexList, form, el('div', { class: 'row' }, properCb, massCb),
  el('div', { class: 'row' }, button('Add / update', () => { const e = readForm(); if (!e.id || !e.forms.sg) return toast('id and sg are required'); lingo.lexicon.add(e); persistLex(); lexSel = e.id; renderLex(); toast('Saved ' + e.id); }, 'small'), button('Delete', () => { if (!lexSel) return; lingo.lexicon.remove(lexSel); persistLex(); lexSel = null; renderLex(); }, 'small'), button('New', () => { lexSel = null; for (const k in f) f[k].value = ''; properCb.set(false); massCb.set(false); renderLex(); }, 'small')),
  el('div', { class: 'row' }, button('Export lexicon', () => downloadJSON({ types: lingo.lexicon.types, entries: lingo.lexicon.all() }, 'lexicon.json'), 'small'), button('Import', async () => { try { const j = await readJSONFile(); for (const e of j.entries || []) lingo.lexicon.add(e); persistLex(); renderLex(); toast('Imported'); } catch { toast('Import failed'); } }, 'small'), button('Reset to sample', () => { store.remove('lexicon'); location.reload(); }, 'small')));
renderLex();

const speechJson = el('textarea', { id: 'speech-json' });
function renderJson() { speechJson.value = JSON.stringify({ id: state.A.id, name: state.A.name, race: state.A.entry.race, pronouns: state.A.entry.pronouns, speech: state.A.speech }, null, 2); }
const jsonPanel = panel('Speaker A → character JSON (speech section)', el('p', { class: 'small muted', text: 'The "speech" section of the shared character JSON, plus identity. Paste it into a game or into Claude.' }), speechJson,
  el('div', { class: 'row' }, button('Apply', () => { try { const j = JSON.parse(speechJson.value); const sp = customSpeaker(j.name || 'Custom', j.race || 'human', j.pronouns || 'they'); sp.speech = { ...sp.speech, ...j.speech }; state.A = sp; rebuild(); changed(); } catch (e) { toast('Bad JSON'); } }, 'small'), button('Copy', () => copyText(speechJson.value), 'small'), button('Export', () => downloadJSON(JSON.parse(speechJson.value), (state.A.id || 'speaker') + '.speech.json'), 'small'), button('Import', async () => { try { const j = await readJSONFile(); speechJson.value = JSON.stringify(j, null, 2); } catch {} }, 'small')));
right.append(lexPanel, jsonPanel);

function changed() { store.set('speakerA', { id: state.A.id, name: state.A.name, entry: state.A.entry, speech: state.A.speech }); renderJson(); renderCoverage(); renderWeights(); }
changed(); status.textContent = `${lingo.lexicon.all().length} words · ${Object.values(lingo.grammar.symbols).reduce((a, b) => a + b.length, 0)} phrases · ${intents.length} intents`;
window.lingoLab = { lingo, state, speak: (intent) => lingo.speak(intent, ctxA()), converse: (n) => lingo.converse(state.A, state.B, { turns: n, opinionAB: state.opinionAB, opinionBA: state.opinionBA }), Speaker, Entity };
