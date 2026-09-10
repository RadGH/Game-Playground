// Voice Lab UI. All logic that a game would reuse lives in voice.js / fx.js / engines/*; this file is only the demo.
import { el, knob, select, checkbox, button, textInput, panel, toast, downloadJSON, copyText, readJSONFile, rng } from '../../shared/ui.js';
import { makeStore } from '../../shared/store.js';
import { synthesize, play, say, stopAll, DEFAULT_VOICE, KNOB_RANGES, normalizeVoice, getContext, activeCount } from './voice.js';
import { ENGINES, ENGINE_ORDER } from './engines/index.js';
import { FX_DEFAULTS, describeFx } from './fx.js';
import { encodeWav } from './dsp.js';
import * as espeakEngine from './engines/espeak.js';
import * as piperEngine from './engines/piper.js';
import * as webspeechEngine from './engines/webspeech.js';

const store = makeStore('voice-lab', 1);
const PRESETS = await (await fetch('data/presets.json')).json();
const SAMPLE_LINES = [
  'Hi there, how are you doing today?',
  'Lost the game. Anyway, welcome to the village.',
  'Get away from my turnips, you thieving goblin!',
  'The elves of Thalen Wood do not forgive. We remember.',
  'I have lived four hundred winters and I will not die in this one.',
  'Fireball! Fireball! Why is nobody running?',
  'Kaelith Vorrun, the Ashen Lich, greets you. Be brief.',
  'Two hundred, three hundred, four hundred. That is your share.',
  'Is anyone there? Hello? I can hear you breathing.',
  "[[h@l'oU maI n'eIm Iz kaIl'IT]]",
];

// ---------- state ----------
let voice = normalizeVoice(store.get('current', PRESETS.presets[4].voice));
let activePreset = store.get('activePreset', 'adult_male');
let lastResult = null; let autoPlay = store.get('autoPlay', false); let followEngine = true;
const status = document.getElementById('status');
const setStatus = t => { status.textContent = t; };

// ---------- left column: engines + presets + saved ----------
const left = document.getElementById('left');
const engineList = el('div', { class: 'engine-list' });
const engineInfo = el('div');
function licenseBadge(meta) { const c = meta.commercial === 'yes' ? 'ok' : meta.commercial === 'conditional' ? 'warn' : 'bad'; const t = meta.commercial === 'yes' ? 'commercial OK' : meta.commercial === 'conditional' ? meta.license : 'NOT commercial'; return el('span', { class: 'badge ' + c, text: t }); }
function renderEngines() {
  engineList.replaceChildren(...ENGINE_ORDER.map(id => { const m = ENGINES[id].meta; return el('button', { class: id === voice.engine ? 'on' : '', onclick: () => setEngine(id) }, el('span', { text: m.name }), licenseBadge(m)); }));
  const m = ENGINES[voice.engine].meta;
  engineInfo.replaceChildren(
    el('p', { class: 'small' }, el('b', { text: 'License: ' }), m.license + '. ', el('span', { class: 'muted', text: m.licenseNote })),
    el('p', { class: 'small' }, el('b', { text: 'Size: ' }), m.size, ' · ', el('b', { text: 'Offline: ' }), String(m.offline)),
    el('p', { class: 'small' }, el('b', { text: 'Quality: ' }), m.quality),
    el('p', { class: 'small' }, el('b', { text: 'Crowds: ' }), m.crowd),
    el('div', { class: 'small' }, el('b', { text: 'Pros' }), el('ul', { class: 'pc' }, ...m.pros.map(t => el('li', { text: t })))),
    el('div', { class: 'small' }, el('b', { text: 'Cons' }), el('ul', { class: 'pc' }, ...m.cons.map(t => el('li', { text: t })))),
  );
}
const presetGrid = el('div', { class: 'preset-grid' });
function renderPresets() {
  presetGrid.replaceChildren();
  for (const g of PRESETS.groups) {
    presetGrid.append(el('div', { class: 'muted small', style: { gridColumn: '1 / -1', marginTop: '4px' }, text: g }));
    for (const p of PRESETS.presets.filter(p => p.group === g)) presetGrid.append(el('button', { class: p.id === activePreset ? 'on' : '', title: p.desc, onclick: () => applyPreset(p) }, p.name));
  }
}
const savedList = el('div');
function renderSaved() {
  const saved = store.get('saved', {});
  savedList.replaceChildren(...Object.entries(saved).map(([name, v]) => el('div', { class: 'row' },
    el('button', { class: 'small', style: { flex: 1, textAlign: 'left' }, onclick: () => { setVoice(v); activePreset = null; renderPresets(); toast('Loaded ' + name); } }, name),
    el('button', { class: 'small', title: 'delete', onclick: () => { delete saved[name]; store.set('saved', saved); renderSaved(); } }, '✕'))));
  if (!Object.keys(saved).length) savedList.append(el('p', { class: 'muted small', text: 'No saved voices yet.' }));
}
left.append(
  panel('Engine', engineList, engineInfo),
  panel('Presets', el('label', { class: 'row small' }, checkbox('Preset also switches engine', followEngine, v => followEngine = v)), presetGrid),
  panel('Saved voices (this browser)', savedList),
);

// ---------- middle column ----------
const main = document.getElementById('main');
const textArea = el('textarea', { id: 'text' }); textArea.value = store.get('text', SAMPLE_LINES[0]);
const lineSel = select('Sample line', SAMPLE_LINES.map((l, i) => ({ value: String(i), label: l.length > 60 ? l.slice(0, 57) + '…' : l })), null, i => { textArea.value = SAMPLE_LINES[+i]; store.set('text', textArea.value); if (autoPlay) speak(); });
lineSel.select.insertBefore(el('option', { value: '', text: '— pick a sample line —' }), lineSel.select.firstChild); lineSel.select.value = '';
textArea.addEventListener('input', () => store.set('text', textArea.value));
const wave = el('canvas', { id: 'wave', width: 800, height: 90 });
const infoLine = el('div', { class: 'info-line', text: 'Nothing synthesized yet.' });
const btnSay = button('▶ Say it', () => speak(), 'primary');
const btnStop = button('■ Stop', () => { stopAll(); setStatus('stopped'); });
const btnWav = button('⬇ WAV', () => { if (!lastResult) return toast('Nothing to download'); const a = el('a', { href: URL.createObjectURL(encodeWav(lastResult.samples, lastResult.sampleRate)), download: `voice-${voice.engine}.wav` }); document.body.append(a); a.click(); a.remove(); });
const autoCb = checkbox('Auto-play when a knob changes', autoPlay, v => { autoPlay = v; store.set('autoPlay', v); });
const piperProgress = el('div', { style: { display: 'none' } }, el('span', { class: 'small muted', id: 'piper-msg' }), el('progress', { max: 100, value: 0 }));
piperEngine.onProgress(p => { piperProgress.style.display = 'block'; piperProgress.querySelector('progress').value = p.total ? p.loaded / p.total * 100 : 0; piperProgress.querySelector('#piper-msg').textContent = `Downloading ${p.url.split('/').pop()} — ${(p.loaded / 1048576).toFixed(1)} / ${(p.total / 1048576).toFixed(1)} MB`; if (p.loaded >= p.total) setTimeout(() => piperProgress.style.display = 'none', 1500); });

// compare
const cmpBody = el('tbody');
const cmpBtn = button('Play this line on every engine', async () => {
  cmpBody.replaceChildren(); stopAll();
  const text = textArea.value.trim();
  for (const id of ENGINE_ORDER) {
    const v = { ...voice, engine: id, variant: id === voice.engine ? voice.variant : (id === 'piper' ? 'en_US-hfc_female-medium' : 'custom') };
    const row = el('tr', {}, el('td', { text: ENGINES[id].meta.name }), el('td', { text: '…' }), el('td', { text: '' }), el('td', {}, licenseBadge(ENGINES[id].meta))); cmpBody.append(row);
    try {
      setStatus('comparing: ' + id);
      if (!ENGINES[id].meta.yieldsBuffer) { const t0 = performance.now(); await say(text, v).then(r => r.done); row.children[1].textContent = 'n/a (direct)'; row.children[2].textContent = ((performance.now() - t0) / 1000).toFixed(1) + ' s (played)'; continue; }
      const r = await synthesize(text, v, { noCache: true }); row.children[1].textContent = r.info.totalMs.toFixed(0) + ' ms'; row.children[2].textContent = r.duration.toFixed(2) + ' s audio';
      await play(r).done;
    } catch (e) { row.children[1].textContent = 'error'; row.children[2].textContent = e.message; }
  }
  setStatus('compare done');
});
const cmpPanel = panel('Compare engines', el('p', { class: 'small muted', text: 'Same text and knobs, each engine in turn. Synthesis time is CPU cost per line; that is the number that decides how many NPCs can talk.' }), cmpBtn,
  el('table', { class: 'cmp-table' }, el('thead', {}, el('tr', {}, el('th', { text: 'Engine' }), el('th', { text: 'Synth time' }), el('th', { text: 'Result' }), el('th', { text: 'License' }))), cmpBody));

// crowd test
const crowdN = knob('Talkers', { min: 1, max: 60, step: 1, value: 8 });
const crowdSpread = knob('Start spread (s)', { min: 0, max: 4, step: 0.1, value: 1.5 });
const crowdLog = el('div', { class: 'crowd-log' });
const crowdBtn = button('Run crowd test', async () => {
  stopAll(); crowdLog.replaceChildren();
  const n = crowdN.value, r = rng(Date.now() & 0xffff), presets = PRESETS.presets.filter(p => p.voice.engine !== 'piper' && p.voice.engine !== 'webspeech');
  const lines = SAMPLE_LINES.filter(l => !l.startsWith('[['));
  const t0 = performance.now(); let synthMs = 0; const results = [];
  for (let i = 0; i < n; i++) {
    const p = r.pick(presets), v = { ...p.voice, engine: crowdEngine.value === 'preset' ? p.voice.engine : crowdEngine.value, pitch: Math.min(1, Math.max(0, (p.voice.pitch ?? 0.5) + r.range(-0.1, 0.1))) };
    const line = r.pick(lines);
    const ts = performance.now(); const res = await synthesize(line, v, { noCache: true }); const ms = performance.now() - ts; synthMs += ms;
    results.push({ res, v, line, p, ms });
    crowdLog.append(el('div', { text: `#${i + 1} ${p.name} [${v.engine}] ${ms.toFixed(0)} ms — "${line.slice(0, 40)}"` }));
  }
  const wall = performance.now() - t0;
  crowdLog.append(el('div', { style: { color: 'var(--accent2)' }, text: `Synthesized ${n} lines in ${wall.toFixed(0)} ms wall (${(synthMs / n).toFixed(0)} ms avg). Playing all with random pan and start offsets…` }));
  for (const { res } of results) play(res, { when: r.range(0, crowdSpread.value), pan: r.range(-1, 1), volume: 0.6 });
  setStatus(`crowd: ${n} talkers`);
});
const crowdEngine = select('Engine', [{ value: 'preset', label: "each preset's own engine" }, 'espeak', 'sam', 'babble'], 'preset');
const crowdPanel = panel('Crowd stress test', el('p', { class: 'small muted', text: 'Synthesizes N random NPC lines with random presets, reports CPU time, then plays them all overlapping. This is the real answer to "how many characters can talk at once".' }), crowdEngine, crowdN, crowdSpread, crowdBtn, crowdLog);

// engine comparison table (static, from meta)
const compareTable = el('table', {}, el('thead', {}, el('tr', {}, ...['Engine', 'License', 'Size', 'Quality', 'Crowds', 'Knobs', 'Phonemes'].map(t => el('th', { text: t })))),
  el('tbody', {}, ...ENGINE_ORDER.map(id => { const m = ENGINES[id].meta; return el('tr', {}, el('td', { text: m.name }), el('td', {}, licenseBadge(m), el('div', { class: 'small muted', text: m.license })), el('td', { text: m.size }), el('td', { text: m.quality }), el('td', { text: m.crowd }), el('td', { class: 'small', text: m.knobs.join(', ') }), el('td', { text: m.supportsPhonemes ? 'yes' : 'no' })); })));

// phoneme cheat sheet (espeak / SAM)
const phonPanel = panel('Phoneme input cheat sheet',
  el('p', { class: 'small muted', text: 'Wrap text in [[ ]] to bypass the dictionary. espeak uses its own ASCII alphabet (below); SAM uses ARPAbet-like codes (AH, EY, IY, OW, UW…). This is how lingo will feed pronunciations of invented words.' }),
  el('table', { class: 'phon-table' }, el('tbody', {},
    ...[["a", "cat"], ["A:", "father"], ["e", "bed"], ["i:", "see"], ["I", "sit"], ["O", "hot (UK)"], ["u:", "boot"], ["U", "put"], ["V", "cup"], ["3:", "bird"], ["@", "about (schwa)"], ["eI", "day"], ["aI", "my"], ["OI", "boy"], ["oU", "go"], ["aU", "now"],
      ["T", "thin"], ["D", "this"], ["S", "ship"], ["Z", "vision"], ["tS", "chin"], ["dZ", "judge"], ["N", "sing"], ["j", "yes"], ["'", "stress on next syllable"], [",", "secondary stress"], ["_", "short pause"], ["_:", "long pause"]]
      .map(([k, v]) => el('tr', {}, el('td', { text: k }), el('td', { text: v }))))));
phonPanel.classList.add('closed');
const tablePanel = panel('Engine comparison table', compareTable); tablePanel.classList.add('closed');

main.append(
  el('div', { class: 'panel' }, lineSel, textArea, el('div', { class: 'row say-row' }, btnSay, btnStop, btnWav, autoCb), piperProgress, wave, infoLine),
  cmpPanel, crowdPanel, tablePanel, phonPanel,
);

// ---------- right column: knobs, engine options, fx, json ----------
const right = document.getElementById('right');
const knobEls = {};
const knobPanel = panel('Voice knobs');
for (const [k, [lo, hi, title]] of Object.entries(KNOB_RANGES)) {
  knobEls[k] = knob(k, { min: lo, max: hi, step: k === 'intonation' ? 1 : 0.01, value: voice[k], title }, v => { voice[k] = v; changed(); });
  knobPanel.append(knobEls[k]);
}
const genderChips = el('div', { class: 'chips gender-chips' });
function renderGender() { genderChips.replaceChildren(...[['m', 'masc'], ['f', 'fem'], ['n', 'neutral']].map(([v, l]) => el('span', { class: 'chip' + (voice.gender === v ? ' on' : ''), text: l, onclick: () => { voice.gender = v; renderGender(); changed(); } }))); }
renderGender();
const accentSel = select('Accent', espeakEngine.ACCENTS, voice.accent, v => { voice.accent = v; changed(); });
const variantSel = select('Variant', [], voice.variant, v => { voice.variant = v; changed(); });
const babbleSel = select('Babble mode', [{ value: 'letters', label: 'letters (Animalese)' }, { value: 'syllables', label: 'syllables' }, { value: 'simlish', label: 'simlish (word → fixed syllables)' }], voice.babbleMode, v => { voice.babbleMode = v; changed(); });
const singCb = checkbox('Sing mode (SAM: flat pitch per phoneme)', voice.sing, v => { voice.sing = v; changed(); });
const piperDl = button('Download this Piper voice now', async () => { setStatus('downloading piper voice…'); try { await piperEngine.download(voice.variant || 'en_US-hfc_female-medium'); toast('Voice ready'); } catch (e) { toast('Download failed: ' + e.message); } setStatus('idle'); }, 'small');
const engineOptsPanel = panel('Engine options', el('div', { class: 'row' }, el('label', { text: 'Gender' }), genderChips), accentSel, variantSel, babbleSel, singCb, piperDl);

const fxEls = {};
const fxPanel = panel('Effects (post-processing)');
const FX_KNOBS = [
  ['pitchShift', -24, 24, 0.5, 'Pitch only, semitones'], ['formant', -12, 12, 0.5, 'Vocal tract size only, semitones'], ['speed', 0.25, 3, 0.05, 'Duration only'], ['chipmunk', 0.25, 3, 0.05, 'Raw resample: pitch+size+speed (cheapest)'],
  ['bright', -1, 1, 0.05, 'Spectral tilt'], ['highpass', 0, 2000, 10, 'Hz, 0 = off'], ['lowpass', 0, 8000, 50, 'Hz, 0 = off'],
  ['robot', 0, 1, 0.01, 'Ring modulation amount'], ['robotHz', 10, 400, 1, 'Ring mod frequency'], ['vibrato', 0, 1, 0.01, 'Pitch wobble'], ['vibratoHz', 0.5, 12, 0.1, ''], ['tremolo', 0, 1, 0.01, 'Volume wobble'], ['tremoloHz', 0.5, 16, 0.1, ''],
  ['lofi', 0, 1, 0.01, 'Bitcrush'], ['chorus', 0, 1, 0.01, ''], ['echo', 0, 1, 0.01, ''], ['echoSec', 0.05, 0.6, 0.01, ''], ['reverb', 0, 1, 0.01, ''], ['reverbSize', 0, 1, 0.01, ''], ['gain', 0, 2, 0.05, ''],
];
for (const [k, lo, hi, st, title] of FX_KNOBS) { fxEls[k] = knob(k, { min: lo, max: hi, step: st, value: voice.fx[k] ?? FX_DEFAULTS[k], title }, v => { if (v === FX_DEFAULTS[k]) delete voice.fx[k]; else voice.fx[k] = v; changed(); }); fxPanel.append(fxEls[k]); }
fxPanel.append(button('Reset effects', () => { voice.fx = {}; syncUI(); changed(); }, 'small'));

const jsonArea = el('textarea', { id: 'json' });
const nameInput = textInput('Name', '', null, { placeholder: 'my voice' });
const jsonPanel = panel('Voice JSON',
  el('p', { class: 'small muted', text: 'This is the "voice" section of the shared character JSON. Paste it into a game or into Claude.' }),
  jsonArea,
  el('div', { class: 'row' }, button('Apply JSON', () => { try { setVoice(JSON.parse(jsonArea.value)); activePreset = null; renderPresets(); toast('Applied'); } catch (e) { toast('Bad JSON: ' + e.message); } }, 'small'), button('Copy', () => copyText(jsonArea.value), 'small'), button('Export file', () => downloadJSON({ schema: 1, voice }, 'voice.json'), 'small'), button('Import file', async () => { try { const j = await readJSONFile(); setVoice(j.voice || j); activePreset = null; renderPresets(); } catch (e) { toast('Import failed'); } }, 'small')),
  nameInput, button('Save to browser', () => { const n = nameInput.value.trim(); if (!n) return toast('Give it a name'); const saved = store.get('saved', {}); saved[n] = voice; store.set('saved', saved); renderSaved(); toast('Saved ' + n); }, 'small'));
right.append(knobPanel, engineOptsPanel, fxPanel, jsonPanel);

// ---------- behaviour ----------
function setEngine(id) { voice.engine = id; if (id === 'piper' && (!voice.variant || !voice.variant.startsWith('en_'))) voice.variant = 'en_US-hfc_female-medium'; if (id !== 'piper' && voice.variant?.startsWith('en_')) voice.variant = 'custom'; renderEngines(); syncUI(); changed(); }
function setVoice(v) { voice = normalizeVoice(v); renderEngines(); syncUI(); changed(); }
function applyPreset(p) { activePreset = p.id; store.set('activePreset', p.id); const v = { ...DEFAULT_VOICE, ...p.voice, fx: { ...(p.voice.fx || {}) } }; if (!followEngine) { v.engine = voice.engine; if (v.engine !== 'piper' && v.variant?.startsWith('en_')) v.variant = 'custom'; } setVoice(v); renderPresets(); if (!autoPlay) speak(); }
async function syncUI() {
  for (const k in knobEls) knobEls[k].set(voice[k]);
  for (const k in fxEls) fxEls[k].set(voice.fx[k] ?? FX_DEFAULTS[k]);
  renderGender(); accentSel.set(voice.accent);
  const supported = ENGINES[voice.engine].meta.knobs;
  for (const k in knobEls) knobEls[k].style.opacity = supported.includes(k) ? 1 : 0.35;
  accentSel.style.display = voice.engine === 'espeak' ? '' : 'none';
  babbleSel.style.display = voice.engine === 'babble' ? '' : 'none';
  singCb.style.display = voice.engine === 'sam' ? '' : 'none';
  piperDl.style.display = voice.engine === 'piper' ? '' : 'none';
  genderChips.parentElement.style.display = voice.engine === 'espeak' ? '' : 'none';
  fxPanel.style.opacity = ENGINES[voice.engine].meta.yieldsBuffer ? 1 : 0.35;
  // variant options per engine
  let opts = [];
  if (voice.engine === 'espeak') opts = espeakEngine.VARIANTS.map(v => ({ value: v, label: v === 'custom' ? 'custom (use knobs)' : v }));
  else if (voice.engine === 'piper') opts = piperEngine.VOICES;
  else if (voice.engine === 'webspeech') { try { await webspeechEngine.load(); } catch {} opts = webspeechEngine.voiceOptions(); }
  variantSel.style.display = opts.length ? '' : 'none';
  variantSel.select.replaceChildren(...opts.map(o => el('option', { value: o.value, text: o.label })));
  if (opts.length && !opts.some(o => o.value === voice.variant)) voice.variant = opts[0].value;
  variantSel.set(voice.variant);
  jsonArea.value = JSON.stringify(voice, null, 2);
}
let changeTimer;
function changed() { store.set('current', voice); jsonArea.value = JSON.stringify(voice, null, 2); if (autoPlay) { clearTimeout(changeTimer); changeTimer = setTimeout(() => speak(), 250); } }

async function speak() {
  const text = textArea.value.trim(); if (!text) return;
  getContext(); stopAll();
  try {
    setStatus('synthesizing (' + voice.engine + ')…'); btnSay.disabled = true;
    const { result, done } = await say(text, voice, { noCache: false });
    lastResult = result;
    if (result) { drawWave(result); infoLine.textContent = `${voice.engine}: ${result.info.totalMs.toFixed(0)} ms to synthesize, ${result.duration.toFixed(2)} s of audio @ ${result.sampleRate} Hz. fx: ${describeFx(result.info.fxApplied)}` + (result.info.variantText ? `\n--- espeak variant file ---\n${result.info.variantText}` : '') + (result.info.opts ? `\nengine opts: ${JSON.stringify(result.info.opts)}` : ''); }
    else { wave.getContext('2d').clearRect(0, 0, wave.width, wave.height); infoLine.textContent = 'Web Speech API: played directly by the browser, no audio buffer available.'; }
    setStatus('playing'); await done; setStatus('idle');
  } catch (e) { console.error(e); infoLine.textContent = 'Error: ' + e.message; setStatus('error'); toast(e.message); }
  finally { btnSay.disabled = false; }
}
function drawWave(r) {
  const c = wave.getContext('2d'), w = wave.width, h = wave.height; c.clearRect(0, 0, w, h); c.fillStyle = '#5ab0ff';
  const step = Math.max(1, Math.floor(r.samples.length / w));
  for (let x = 0; x < w; x++) { let mn = 1, mx = -1; for (let i = x * step; i < (x + 1) * step && i < r.samples.length; i++) { mn = Math.min(mn, r.samples[i]); mx = Math.max(mx, r.samples[i]); } c.fillRect(x, (1 - mx) * h / 2, 1, Math.max(1, (mx - mn) * h / 2)); }
}

renderEngines(); renderPresets(); renderSaved(); syncUI();
setStatus('idle');
// expose for tests / console
window.voiceLab = { get voice() { return voice; }, setVoice, applyPreset, speak, synthesize, PRESETS, ENGINES };
