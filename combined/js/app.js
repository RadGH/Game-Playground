// Combined demo: one character JSON → 2D portrait, 3D body (Mii mode), voice (Voice Lab), lines (Lingo).
import { el, knob, select, button, panel, toast, downloadJSON, copyText, readJSONFile, checkbox } from '../../shared/ui.js';
import { renderSVG, normalizeAvatar } from '../../avatar-2d/js/render.js';
import { randomAvatar } from '../../avatar-2d/js/random.js';
import { createScene } from '../../avatar-3d/js/scene.js';
import { createMiiCharacter } from '../../avatar-3d/js/mii.js';
import { say, synthesize, play, stopAll, normalizeVoice, getContext } from '../../voice-lab/js/voice.js';
import { Lingo, Speaker, SLIDERS } from '../../lingo/js/lingo.js';
import { MemoryBank, generateEvent, ageWords, DAY, HOUR } from '../../lingo/js/memory.js';
import { Scene } from '../../lingo/js/context.js';
import { NameGen } from '../../namegen/js/namegen.js';
import { RelationGraph } from '../../lingo/js/relations.js';
import { ENGINE_ORDER, ENGINES } from '../../voice-lab/js/engines/index.js';

const status = document.getElementById('status'); const setStatus = t => status.textContent = t;
const load = async p => (await fetch(p)).json();
const [CHARS, lexData, grammarData, traitsData, avatarPresets, voicePresets, eventsData, scenesData, relationsData] = await Promise.all([load('data/characters.json'), load('../lingo/data/lexicon.json'), load('../lingo/data/grammar.json'), load('../lingo/data/traits.json'), load('../avatar-2d/data/presets.json'), load('../voice-lab/data/presets.json'), load('../lingo/data/events.json'), load('../lingo/data/scenes.json'), load('../lingo/data/relations.json')]);
const EV = eventsData.types; const RELATIONS = new RelationGraph(relationsData);
const lingo = new Lingo({ lexicon: lexData, grammar: grammarData, traits: traitsData });
const nameGen = await NameGen.load('../namegen/data/');
const intents = lingo.grammar.intents();

// ---------- characters ----------
function toSpeaker(ch) { const entry = lingo.lexicon.get(ch.entry) || { id: ch.id, type: 'person', proper: true, pronouns: ch.pronouns || 'they', race: ch.race || 'human', forms: { sg: ch.name, short: ch.short || ch.name.split(' ')[0] }, pron: ch.respell ? { respell: ch.respell } : undefined }; if (!lingo.lexicon.has(entry.id)) { lingo.lexicon.add(entry); lingo.invalidatePronunciations(); } return new Speaker({ id: ch.id, name: entry.forms?.short || ch.name, entry, lexicon: lingo.lexicon, speech: JSON.parse(JSON.stringify(ch.speech)) }); }
function randomCharacter(seedName) {
  const races = Object.keys(avatarPresets.raceRules); const race = races[Math.floor(Math.random() * races.length)];
  const raceEntry = lingo.lexicon.byType('race').find(r => r.id === race) ? race : 'human';
  const pronouns = ['he', 'she', 'they'][Math.floor(Math.random() * 3)];
  const generated = nameGen.generate('person.full', { race: nameGen.languages[race] ? race : 'human', gender: pronouns === 'he' ? 'm' : pronouns === 'she' ? 'f' : 'n' });
  const name = seedName || generated.text;
  const traitIds = traitsData.traits.map(t => t.id).sort(() => Math.random() - 0.5).slice(0, 2 + Math.floor(Math.random() * 2));
  const vp = voicePresets.presets.filter(p => p.voice.engine === 'espeak'); const voice = { ...vp[Math.floor(Math.random() * vp.length)].voice, gender: pronouns === 'he' ? 'm' : pronouns === 'she' ? 'f' : 'n' };
  return { schema: 1, id: 'rnd_' + Date.now(), name, race: raceEntry, pronouns, short: generated.forms.short, respell: generated.respell, nameGloss: generated.gloss.join(' + ') || undefined, avatar: randomAvatar(avatarPresets, { race }), voice, speech: { ...SLIDERS, formality: Math.random(), verbosity: Math.random(), cheer: Math.random(), aggression: Math.random(), confidence: Math.random(), traits: traitIds, custom: {}, customRate: {}, tics: Math.random() < 0.3 ? [['um', 'drawl', 'clipped', 'flowery', 'hesitant'][Math.floor(Math.random() * 5)]] : [], mood: +(Math.random() * 2 - 1).toFixed(2) } };
}
const state = { A: JSON.parse(JSON.stringify(CHARS.characters[0])), B: JSON.parse(JSON.stringify(CHARS.characters[1])), spA: null, spB: null, opinionAB: -0.3, opinionBA: 0.1, speaking: false, mute: false, useBabble: false, engineOverride: '', now: 20, scene: null, banks: {} };
function relOf(key) { const a = state['sp' + key], b = state['sp' + (key === 'A' ? 'B' : 'A')]; return RELATIONS.get(a.id, b.id); }
function bankFor(sp) { if (!state.banks[sp.id]) state.banks[sp.id] = new MemoryBank({ ownerId: sp.id, traits: sp.traits, eventTypes: EV, lexicon: lingo.lexicon }); state.banks[sp.id].traits = sp.traits; return state.banks[sp.id]; }
state.spA = toSpeaker(state.A); state.spB = toSpeaker(state.B);
RELATIONS.get(state.spA.id, state.spB.id).set('warmth', -0.3).set('respect', 0.3); RELATIONS.get(state.spB.id, state.spA.id).set('warmth', 0.1).set('respect', 0.2);

// ---------- stage ----------
const main = document.getElementById('main');
const stage = el('div', { id: 'stage' }); const subtitle = el('div', { class: 'subtitle' }); stage.append(subtitle);
const scene = createScene(stage); scene.camera.position.set(0, 1.5, 4.6); scene.controls.target.set(0, 0.9, 0);
const bodies = { A: null, B: null };
async function buildBody(key) { if (bodies[key]) { scene.scene.remove(bodies[key].group); bodies[key].dispose(); } const c = await createMiiCharacter(state[key].avatar); c.group.position.x = key === 'A' ? -0.9 : 0.9; c.group.rotation.y = key === 'A' ? 0.5 : -0.5; c.group.userData.character = false; scene.scene.add(c.group); bodies[key] = c; }
scene.addTicker((dt, t) => { bodies.A?.update(dt, t); bodies.B?.update(dt, t); });
await Promise.all([buildBody('A'), buildBody('B')]);

const intentSel = select('Intent', ['recall', ...intents], 'greet');
const log = el('div');
const muteCb = checkbox('Mute voices', false, v => { state.mute = v; if (v) stopAll(); });
const engineSel = select('Voice engine', [{ value: '', label: "each character's own (JSON)" }, ...ENGINE_ORDER.map(id => ({ value: id, label: ENGINES[id].meta.name }))], '', v => { state.engineOverride = v; });
const babbleCb = checkbox('Babble instead of words (crowd-safe engine)', false, v => { state.useBabble = v; });
const speechCb = checkbox('Show phoneme speech text', false);
let cancel = false;
async function sayLine(key, intent, opinion) {
  const sp = state['sp' + key], other = state['sp' + (key === 'A' ? 'B' : 'A')];
  const ctx = { speaker: sp, listener: other, relation: relOf(key), scene: state.scene };
  let out;
  if (intent === 'recall') { out = lingo.speakMemory(bankFor(sp), state.now, ctx); if (!out) out = lingo.speak('smalltalk', ctx); else { intent = out.intent; renderMemories?.(); } }
  else if (intent === 'recall_reply' && state.lastMemory) { out = lingo.replyToMemory(state.lastMemory, state.now, ctx); }
  else out = lingo.speak(intent, ctx);
  if (out.memory) state.lastMemory = out.memory; else if (intent !== 'recall_reply') state.lastMemory = null;
  const line = el('div', { class: 'line ' + (key === 'B' ? 'b' : '') + ' now' }, el('span', { class: 'who', text: sp.name + ':' }), el('span', { text: out.text }), el('div', { class: 'meta', text: `${intent} · ${out.entry?.id || 'custom'} · ${out.tags.join(',')}` + (speechCb.value ? ` · speech: ${out.speech}` : '') }));
  log.prepend(line); subtitle.replaceChildren(el('span', {}, el('span', { class: 'who', text: sp.name }), out.text));
  bodies[key]?.setAnim('talk'); bodies[key === 'A' ? 'B' : 'A']?.setAnim('idle');
  if (!state.mute) {
    try { getContext(); let voice = state.useBabble ? { engine: 'babble', pitch: state[key].voice.pitch, speed: 0.6, depth: state[key].voice.depth, intonation: 3 } : normalizeVoice(state[key].voice); if (state.engineOverride && !state.useBabble) voice = { ...voice, engine: state.engineOverride, variant: state.engineOverride === 'piper' ? (voice.gender === 'f' ? 'en_US-hfc_female-medium' : 'en_US-hfc_male-medium') : 'custom' }; const text = ['espeak', 'formant'].includes(voice.engine) ? out.speech : out.text; const { result, done } = await say(text, voice); setStatus(`${sp.name} speaking (${voice.engine}, ${result ? result.info.totalMs.toFixed(0) + ' ms synth' : 'direct'})`); await done; }
    catch (e) { console.error(e); toast('voice error: ' + e.message); await new Promise(r => setTimeout(r, 1200)); }
  } else await new Promise(r => setTimeout(r, 900 + out.text.length * 25));
  bodies[key]?.setAnim('idle'); line.classList.remove('now'); setStatus('idle');
  return out;
}
const sayBtn = button('A says it to B', async () => { if (state.speaking) return; state.speaking = true; await sayLine('A', intentSel.value, state.opinionAB); state.speaking = false; }, 'primary');
const sayBBtn = button('B says it to A', async () => { if (state.speaking) return; state.speaking = true; await sayLine('B', intentSel.value, state.opinionBA); state.speaking = false; });
const turnsK = knob('Turns', { min: 2, max: 14, step: 1, value: 6 });
const convBtn = button('▶ Conversation', async () => {
  if (state.speaking) return; state.speaking = true; cancel = false; log.replaceChildren();
  const plan = lingo.planConversation(state.spA, state.spB, relOf('A').opinion(), relOf('B').opinion(), turnsK.value, { banks: { [state.spA.id]: bankFor(state.spA), [state.spB.id]: bankFor(state.spB) }, now: state.now, scene: state.scene, relations: RELATIONS });
  let key = 'A'; for (const intent of plan) { if (cancel) break; await sayLine(key, intent, 0); await new Promise(r => setTimeout(r, 250)); key = key === 'A' ? 'B' : 'A'; }
  subtitle.replaceChildren(); state.speaking = false;
}, 'primary');
const stopBtn = button('■ Stop', () => { cancel = true; stopAll(); bodies.A?.setAnim('idle'); bodies.B?.setAnim('idle'); subtitle.replaceChildren(); state.speaking = false; });
main.append(el('div', { class: 'panel' }, stage, el('div', { class: 'row' }, intentSel, sayBtn, sayBBtn), el('div', { class: 'row' }, turnsK, convBtn, stopBtn), el('div', { class: 'row' }, engineSel, muteCb, babbleCb, speechCb)), panel('Transcript', log));


// ---------- scene + memories ----------
const sceneSel = select('Scene', [{ value: '', label: '— none —' }, ...scenesData.scenes.map(s => ({ value: s.id, label: s.name }))], '', v => { state.scene = v ? new Scene(scenesData.scenes.find(s => s.id === v), lingo.lexicon) : null; sceneInfo.textContent = state.scene ? `${state.scene.place || ''} · ${state.scene.timeOfDay} · danger ${state.scene.danger} · comfort ${state.scene.comfort} · ${state.scene.tags.join(', ')}${state.scene.threats.length ? ' · threats: ' + state.scene.threats.map(t => t.count + ' ' + t.pl).join(', ') : ''}` : 'No scene.'; scene.scene.background.set(state.scene?.has('dark') ? 0x0e1014 : state.scene?.has('holy') ? 0x2a2438 : state.scene?.comfort > 0.7 ? 0x2a2218 : 0x1e2128); });
const sceneInfo = el('div', { class: 'small muted', text: 'No scene.' });
const clockEl = el('span', { class: 'badge' }); const memList = el('div');
function renderMemories() {
  const d = Math.floor(state.now / DAY), h = Math.floor(state.now % DAY); clockEl.textContent = `Day ${d + 1}, ${String(h).padStart(2, '0')}:00`; memList.replaceChildren();
  for (const key of ['A', 'B']) { const sp = state['sp' + key], rows = bankFor(sp).list(state.now); memList.append(el('div', { class: 'small', style: { fontWeight: 600, marginTop: '4px' }, text: `${sp.name}: ${rows.length} memories` }));
    for (const { memory: m, salience } of rows.slice(0, 8)) memList.append(el('div', { class: 'mem' }, el('span', {}, el('b', { text: m.type }), ` ${ageWords(state.now - m.time).when}${m.count > 1 ? ' ×' + m.count : ''}${m.core ? ' ★' : ''} · ${Object.entries(m.bindings).map(([k, v]) => `${k}=${v.id}${v.count > 1 ? '×' + v.count : ''}`).join(' ')}`), el('div', { class: 'bar' }, el('div', { style: { width: Math.min(100, salience * 100) + '%' } })))); }
}
const evSel = select('Event', Object.keys(EV), 'combat');
function rollEvent(type, who = 'both') { const parts = who === 'both' ? [state.spA.id, state.spB.id] : [state['sp' + who].id]; const ev = generateEvent(type, EV[type], { lexicon: lingo.lexicon, rng: lingo.rng, participants: parts, time: state.now, exclude: [state.spA.id, state.spB.id] }); for (const id of parts) bankFor(id === state.spA.id ? state.spA : state.spB).remember(ev, state.now); RELATIONS.applyMemoryEvent(ev, { traitsOf: id => (id === state.spA.id ? state.spA : id === state.spB.id ? state.spB : null)?.traits || [], now: state.now }); cardA.render(); cardB.render(); renderMemories(); toast(`${type}: ${Object.entries(ev.bindings).map(([k, v]) => `${k}=${v.id}${v.count > 1 ? '×' + v.count : ''}`).join(', ')}`); }
function passTime(hours) { state.now += hours; for (const b of Object.values(state.banks)) b.tick(state.now); RELATIONS.tick(state.now); cardA.render(); cardB.render(); renderMemories(); }
main.append(panel('Scene + memories', el('p', { class: 'small muted', text: 'Pick where they are and what they have lived through. Conversations then favour the surroundings and bring up the strongest relevant memory; "recall" in the intent list forces one.' }), sceneSel, sceneInfo,
  el('div', { class: 'row' }, el('label', { text: 'Clock' }), clockEl, button('+6 h', () => passTime(6 * HOUR), 'small'), button('+1 day', () => passTime(DAY), 'small'), button('+1 week', () => passTime(7 * DAY), 'small'), button('+1 month', () => passTime(30 * DAY), 'small')),
  el('div', { class: 'row' }, evSel, button('Roll (both)', () => rollEvent(evSel.value, 'both'), 'small'), button('Roll for A', () => rollEvent(evSel.value, 'A'), 'small'), button('Roll for B', () => rollEvent(evSel.value, 'B'), 'small'), button('5 random', () => { const t = Object.keys(EV); for (let i = 0; i < 5; i++) rollEvent(t[Math.floor(Math.random() * t.length)], ['both', 'A', 'B'][i % 3]); }, 'small'), button('Clear', () => { state.banks = {}; renderMemories(); }, 'small')),
  memList));
renderMemories();

// ---------- left: character cards ----------
const left = document.getElementById('left');
function card(key) {
  const wrap = el('div');
  const render = () => {
    const ch = state[key], sp = state['sp' + key];
    wrap.replaceChildren(
      el('div', { class: 'row' }, select('', [...CHARS.characters.map(c => ({ value: c.id, label: c.name })), { value: '__random', label: '🎲 random character' }], CHARS.characters.some(c => c.id === ch.id) ? ch.id : '__random', async v => { state[key] = v === '__random' ? randomCharacter() : JSON.parse(JSON.stringify(CHARS.characters.find(c => c.id === v))); state['sp' + key] = toSpeaker(state[key]); delete state.banks[state['sp' + key].id]; await buildBody(key); render(); cardA.render?.(); cardB.render?.(); renderJson(); renderMemories(); })),
      el('div', { class: 'charcard' }, el('div', { class: 'portrait', html: renderSVG(ch.avatar) }), el('div', { class: 'info' }, el('div', { class: 'name', text: ch.name }), el('div', { class: 'muted', text: `${sp.entity.ref('race')?.sg || ch.race || '?'} · ${sp.entity.pronounSet.they}/${sp.entity.pronounSet.them}` }), el('div', { text: 'traits: ' + (ch.speech.traits.join(', ') || 'none') }), el('div', { text: `voice: ${ch.voice.engine} · pitch ${ch.voice.pitch} · depth ${ch.voice.depth}` }), el('div', { class: 'muted', text: ch.speech.custom.catchphrase ? '“' + ch.speech.custom.catchphrase + '”' : '' }))),
      knob('mood', { min: -1, max: 1, step: 0.05, value: ch.speech.mood }, v => { ch.speech.mood = v; sp.mood = v; renderJson(); }),
      relationBlock(key),
      el('div', { class: 'row' }, button('▶ Test voice', async () => { try { getContext(); const { done } = await say(ch.speech.custom.catchphrase || `I am ${ch.name}.`, ch.voice); await done; } catch (e) { toast(e.message); } }, 'small'), button('Wave', () => { bodies[key]?.setAnim('wave'); setTimeout(() => bodies[key]?.setAnim('idle'), 2000); }, 'small'), button('Walk', () => { bodies[key]?.setAnim(bodies[key]?.anim === 'walk' ? 'idle' : 'walk'); }, 'small'), button('Die', () => { bodies[key]?.setAnim('dead'); }, 'small')),
    );
  };
  render(); wrap.render = render; return wrap;
}
function relationBlock(key) {
  const rel = relOf(key); const other = state['sp' + (key === 'A' ? 'B' : 'A')]; const wrap = el('div');
  const summary = el('div', { class: 'small muted' });
  const refresh = () => { summary.textContent = `feels about ${other.name.split(' ')[0]}: ${rel.summary()} · ${rel.tags().join(', ') || 'no strong feelings'}`; };
  const knobs = el('div', { class: 'grid c2' }); for (const dim of ['warmth', 'respect', 'trust', 'fear']) knobs.append(knob(dim, { min: -1, max: 1, step: 0.05, value: rel.get(dim) }, v => { rel.set(dim, v); refresh(); }));
  const evSel = select('', ['kindness', 'insult', 'saved_life', 'betrayal', 'shared_victory', 'threatened', 'flirt_accepted', 'mockery', 'kept_word', 'cowardice_seen', 'bravery_seen', 'drank_together'], 'kindness');
  wrap.append(summary, knobs, el('div', { class: 'row' }, evSel, button('Apply', () => { rel.apply(evSel.value, { traits: state['sp' + key].traits, targetTraits: other.traits, now: state.now }); cardA.render?.(); cardB.render?.(); }, 'small')));
  refresh(); return wrap;
}
const cardA = card('A'), cardB = card('B');
left.append(panel('Character A', cardA), panel('Character B', cardB));

// ---------- right: JSON ----------
const right = document.getElementById('right');
const jsonArea = el('textarea', { id: 'json' });
function renderJson() { jsonArea.value = JSON.stringify(state.A, null, 2); }
right.append(panel('Character A — full JSON', el('p', { class: 'small muted', text: 'All three sections. Each experiment reads only its own section; a game can drop the ones it does not use.' }), jsonArea,
  el('div', { class: 'row' }, button('Apply to A', async () => { try { const j = JSON.parse(jsonArea.value); j.avatar = normalizeAvatar(j.avatar); state.A = j; state.spA = toSpeaker(j); await buildBody('A'); cardA.render(); toast('Applied'); } catch (e) { toast('Bad JSON: ' + e.message); } }, 'small'), button('Copy', () => copyText(jsonArea.value), 'small'), button('Export', () => downloadJSON(state.A, state.A.id + '.character.json'), 'small'), button('Import', async () => { try { const j = await readJSONFile(); jsonArea.value = JSON.stringify(j, null, 2); } catch {} }, 'small'))),
  panel('How the sections are used', el('table', { class: 'sections' }, el('tbody', {},
    el('tr', {}, el('td', { text: 'avatar' }), el('td', { text: '2D portrait (avatar-2d/render.js) and 3D body (avatar-3d/mii.js). Quaternius mode would read the same section.' })),
    el('tr', {}, el('td', { text: 'voice' }), el('td', { text: 'voice-lab/voice.js say(). espeak lines get [[phonemes]] from lingo for invented names.' })),
    el('tr', {}, el('td', { text: 'speech' }), el('td', { text: 'lingo Speaker: traits, sliders, custom slots, tics, mood. Intent + listener + opinion → line.' })),
    el('tr', {}, el('td', { text: 'entry' }), el('td', { text: 'lingo lexicon id for the person (name forms, race, pronouns). Random characters get an ad-hoc entry.' })))))
);
renderJson(); setStatus('ready');
window.combined = { state, lingo, sayLine, bodies, scene, rollEvent, passTime, bankFor, RELATIONS };
