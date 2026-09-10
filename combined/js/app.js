// Combined demo: one character JSON → 2D portrait, 3D body (Mii mode), voice (Voice Lab), lines (Lingo).
import { el, knob, select, button, panel, toast, downloadJSON, copyText, readJSONFile, checkbox } from '../../shared/ui.js';
import { renderSVG, normalizeAvatar } from '../../avatar-2d/js/render.js';
import { randomAvatar } from '../../avatar-2d/js/random.js';
import { createScene } from '../../avatar-3d/js/scene.js';
import { createMiiCharacter } from '../../avatar-3d/js/mii.js';
import { say, synthesize, play, stopAll, normalizeVoice, getContext } from '../../voice-lab/js/voice.js';
import { Lingo, Speaker, SLIDERS } from '../../lingo/js/lingo.js';

const status = document.getElementById('status'); const setStatus = t => status.textContent = t;
const load = async p => (await fetch(p)).json();
const [CHARS, lexData, grammarData, traitsData, avatarPresets, voicePresets] = await Promise.all([load('data/characters.json'), load('../lingo/data/lexicon.json'), load('../lingo/data/grammar.json'), load('../lingo/data/traits.json'), load('../avatar-2d/data/presets.json'), load('../voice-lab/data/presets.json')]);
const lingo = new Lingo({ lexicon: lexData, grammar: grammarData, traits: traitsData });
const intents = lingo.grammar.intents();

// ---------- characters ----------
function toSpeaker(ch) { const entry = lingo.lexicon.get(ch.entry) || { id: ch.id, type: 'person', proper: true, pronouns: ch.pronouns || 'they', race: ch.race || 'human', forms: { sg: ch.name, short: ch.name.split(' ')[0] } }; return new Speaker({ id: ch.id, name: entry.forms?.short || ch.name, entry, lexicon: lingo.lexicon, speech: JSON.parse(JSON.stringify(ch.speech)) }); }
function randomCharacter(seedName) {
  const races = Object.keys(avatarPresets.raceRules); const race = races[Math.floor(Math.random() * races.length)];
  const raceEntry = lingo.lexicon.byType('race').find(r => r.id === race) ? race : 'human';
  const name = seedName || (['Ash', 'Bryn', 'Cael', 'Dara', 'Eira', 'Fenn', 'Garrick', 'Hesper', 'Ilya', 'Jory'][Math.floor(Math.random() * 10)] + ' ' + ['Blackwood', 'Mire', 'Stone', 'Vell', 'Thorne', 'Kestrel'][Math.floor(Math.random() * 6)]);
  const pronouns = ['he', 'she', 'they'][Math.floor(Math.random() * 3)];
  const traitIds = traitsData.traits.map(t => t.id).sort(() => Math.random() - 0.5).slice(0, 2 + Math.floor(Math.random() * 2));
  const vp = voicePresets.presets.filter(p => p.voice.engine === 'espeak'); const voice = { ...vp[Math.floor(Math.random() * vp.length)].voice, gender: pronouns === 'he' ? 'm' : pronouns === 'she' ? 'f' : 'n' };
  return { schema: 1, id: 'rnd_' + Date.now(), name, race: raceEntry, pronouns, avatar: randomAvatar(avatarPresets, { race }), voice, speech: { ...SLIDERS, formality: Math.random(), verbosity: Math.random(), cheer: Math.random(), aggression: Math.random(), confidence: Math.random(), traits: traitIds, custom: {}, customRate: {}, tics: Math.random() < 0.3 ? [['um', 'stutter', 'drawl', 'clipped', 'flowery', 'hesitant'][Math.floor(Math.random() * 6)]] : [], mood: +(Math.random() * 2 - 1).toFixed(2) } };
}
const state = { A: JSON.parse(JSON.stringify(CHARS.characters[0])), B: JSON.parse(JSON.stringify(CHARS.characters[1])), spA: null, spB: null, opinionAB: -0.3, opinionBA: 0.1, speaking: false, mute: false, useBabble: false };
state.spA = toSpeaker(state.A); state.spB = toSpeaker(state.B);

// ---------- stage ----------
const main = document.getElementById('main');
const stage = el('div', { id: 'stage' }); const subtitle = el('div', { class: 'subtitle' }); stage.append(subtitle);
const scene = createScene(stage); scene.camera.position.set(0, 1.5, 4.6); scene.controls.target.set(0, 0.9, 0);
const bodies = { A: null, B: null };
async function buildBody(key) { if (bodies[key]) { scene.scene.remove(bodies[key].group); bodies[key].dispose(); } const c = await createMiiCharacter(state[key].avatar); c.group.position.x = key === 'A' ? -0.9 : 0.9; c.group.rotation.y = key === 'A' ? 0.5 : -0.5; c.group.userData.character = false; scene.scene.add(c.group); bodies[key] = c; }
scene.addTicker((dt, t) => { bodies.A?.update(dt, t); bodies.B?.update(dt, t); });
await Promise.all([buildBody('A'), buildBody('B')]);

const intentSel = select('Intent', intents, 'greet');
const log = el('div');
const muteCb = checkbox('Mute voices', false, v => { state.mute = v; if (v) stopAll(); });
const babbleCb = checkbox('Babble instead of words (crowd-safe engine)', false, v => { state.useBabble = v; });
const speechCb = checkbox('Show phoneme speech text', false);
let cancel = false;
async function sayLine(key, intent, opinion) {
  const sp = state['sp' + key], other = state['sp' + (key === 'A' ? 'B' : 'A')];
  const out = lingo.speak(intent, { speaker: sp, listener: other, opinion });
  const line = el('div', { class: 'line ' + (key === 'B' ? 'b' : '') + ' now' }, el('span', { class: 'who', text: sp.name + ':' }), el('span', { text: out.text }), el('div', { class: 'meta', text: `${intent} · ${out.entry?.id || 'custom'} · ${out.tags.join(',')}` + (speechCb.value ? ` · speech: ${out.speech}` : '') }));
  log.prepend(line); subtitle.replaceChildren(el('span', {}, el('span', { class: 'who', text: sp.name }), out.text));
  bodies[key]?.setAnim('talk'); bodies[key === 'A' ? 'B' : 'A']?.setAnim('idle');
  if (!state.mute) {
    try { getContext(); const voice = state.useBabble ? { engine: 'babble', pitch: state[key].voice.pitch, speed: 0.6, depth: state[key].voice.depth, intonation: 3 } : normalizeVoice(state[key].voice); const text = voice.engine === 'espeak' ? out.speech : out.text; const { result, done } = await say(text, voice); setStatus(`${sp.name} speaking (${voice.engine}, ${result ? result.info.totalMs.toFixed(0) + ' ms synth' : 'direct'})`); await done; }
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
  const plan = lingo.planConversation(state.spA, state.spB, state.opinionAB, state.opinionBA, turnsK.value);
  let key = 'A'; for (const intent of plan) { if (cancel) break; await sayLine(key, intent, key === 'A' ? state.opinionAB : state.opinionBA); await new Promise(r => setTimeout(r, 250)); key = key === 'A' ? 'B' : 'A'; }
  subtitle.replaceChildren(); state.speaking = false;
}, 'primary');
const stopBtn = button('■ Stop', () => { cancel = true; stopAll(); bodies.A?.setAnim('idle'); bodies.B?.setAnim('idle'); subtitle.replaceChildren(); state.speaking = false; });
main.append(el('div', { class: 'panel' }, stage, el('div', { class: 'row' }, intentSel, sayBtn, sayBBtn), el('div', { class: 'row' }, turnsK, convBtn, stopBtn), el('div', { class: 'row' }, muteCb, babbleCb, speechCb)), panel('Transcript', log));

// ---------- left: character cards ----------
const left = document.getElementById('left');
function card(key) {
  const wrap = el('div');
  const render = () => {
    const ch = state[key], sp = state['sp' + key];
    wrap.replaceChildren(
      el('div', { class: 'row' }, select('', [...CHARS.characters.map(c => ({ value: c.id, label: c.name })), { value: '__random', label: '🎲 random character' }], CHARS.characters.some(c => c.id === ch.id) ? ch.id : '__random', async v => { state[key] = v === '__random' ? randomCharacter() : JSON.parse(JSON.stringify(CHARS.characters.find(c => c.id === v))); state['sp' + key] = toSpeaker(state[key]); await buildBody(key); render(); renderJson(); })),
      el('div', { class: 'charcard' }, el('div', { class: 'portrait', html: renderSVG(ch.avatar) }), el('div', { class: 'info' }, el('div', { class: 'name', text: ch.name }), el('div', { class: 'muted', text: `${sp.entity.ref('race')?.sg || ch.race || '?'} · ${sp.entity.pronounSet.they}/${sp.entity.pronounSet.them}` }), el('div', { text: 'traits: ' + (ch.speech.traits.join(', ') || 'none') }), el('div', { text: `voice: ${ch.voice.engine} · pitch ${ch.voice.pitch} · depth ${ch.voice.depth}` }), el('div', { class: 'muted', text: ch.speech.custom.catchphrase ? '“' + ch.speech.custom.catchphrase + '”' : '' }))),
      knob('mood', { min: -1, max: 1, step: 0.05, value: ch.speech.mood }, v => { ch.speech.mood = v; sp.mood = v; renderJson(); }),
      knob(key === 'A' ? 'opinion of B' : 'opinion of A', { min: -1, max: 1, step: 0.05, value: key === 'A' ? state.opinionAB : state.opinionBA }, v => { if (key === 'A') state.opinionAB = v; else state.opinionBA = v; }),
      el('div', { class: 'row' }, button('▶ Test voice', async () => { try { getContext(); const { done } = await say(ch.speech.custom.catchphrase || `I am ${ch.name}.`, ch.voice); await done; } catch (e) { toast(e.message); } }, 'small'), button('Wave', () => { bodies[key]?.setAnim('wave'); setTimeout(() => bodies[key]?.setAnim('idle'), 2000); }, 'small'), button('Walk', () => { bodies[key]?.setAnim(bodies[key]?.anim === 'walk' ? 'idle' : 'walk'); }, 'small'), button('Die', () => { bodies[key]?.setAnim('dead'); }, 'small')),
    );
  };
  render(); wrap.render = render; return wrap;
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
window.combined = { state, lingo, sayLine, bodies, scene };
