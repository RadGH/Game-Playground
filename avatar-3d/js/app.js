// Avatar 3D viewer/builder UI. Chibi 2 is the flagship renderer; the original procedural Chibi and the
// Quaternius mesh mode are kept for comparison and marked DEPRECATED (2026-09-24). All three share the
// 2D catalog, presets and random generator; Chibi 2 adds races, roundness and its own clip groups.
import { el, knob, select, button, panel, toast, downloadJSON, copyText, readJSONFile, textInput, checkbox } from '../../shared/ui.js';
import { makeStore } from '../../shared/store.js';
import { renderSVG, normalizeAvatar } from '../../avatar-2d/js/render.js';
import { PARTS, SLOTS, SLOT_LABELS, COLOR_SLOTS, partIds } from '../../avatar-2d/js/parts/index.js';
import { randomAvatar } from '../../avatar-2d/js/random.js';
import { createScene } from './scene.js';
import { createMiiCharacter } from './mii.js';
import { createChibi2Character } from './chibi2.js';
import { CHIBI2_EVERY_ANIMS, CHIBI2_ANIM_GROUPS } from './chibi2-motion.js';
import { CHIBI2_RACES, CHIBI2_RACE_IDS, randomChibi2, roundOf } from './chibi2-races.js';
import { makeRng } from '../../avatar-2d/js/random.js';
import { createQuaterniusCharacter, CLIPS, MAP } from './quaternius.js';

const store = makeStore('avatar-3d', 1);
const DATA = await (await fetch('../avatar-2d/data/presets.json')).json();
let avatar = normalizeAvatar(store.get('current', DATA.presets[0].avatar));
const C2 = await (await fetch('./data/chibi2-presets.json')).json();
let name = store.get('name', 'Villager'); let mode = store.get('mode2', 'chibi2');
const status = document.getElementById('status'); const setStatus = t => status.textContent = t;

// ---------- middle: viewport ----------
const main = document.getElementById('main');
const viewport = el('div', { id: 'viewport' }); const overlay = el('div', { class: 'overlay', text: 'drag to orbit · wheel to zoom' }); viewport.append(overlay);
const modeBtns = el('div', { class: 'row mode-btns' }, ...[['chibi2', 'Chibi 2'], ['mii', 'Chibi (procedural) · deprecated'], ['quaternius', 'Quaternius · deprecated']].map(([id, label]) => {
  const b = button(label, () => setMode(id)); b.dataset.mode = id;
  if (id !== 'chibi2') { b.classList.add('deprecated'); b.title = 'Deprecated: kept only for comparison. Chibi 2 is the flagship model.'; }
  return b;
}));
const animChips = el('div', { class: 'chips anim-chips' });
const turntableCb = checkbox('Turntable', false, v => scene.setTurntable(v ? 0.6 : 0));
const handsFreeCb = checkbox('Hands free', false, v => character?.setHandsFree?.(v));
const anchorsInfo = el('span', { class: 'small muted' });
main.append(el('div', { class: 'panel' }, modeBtns, viewport, el('div', { class: 'row' }, el('label', { text: 'Animation' }), animChips), el('div', { class: 'row' }, turntableCb, button('📷 Snapshot PNG', () => { const a = el('a', { href: scene.snapshot(), download: slug(name) + '-3d.png' }); document.body.append(a); a.click(); a.remove(); }, 'small'), button('🎲 Random', () => rnd(null), 'primary'), button('Random face', () => rnd('face'), 'small'), button('Random outfit', () => rnd('outfit'), 'small'), handsFreeCb, anchorsInfo)));
const scene = createScene(viewport);
let character = null; let building = false, pending = null;
const MII_ANIMS = ['idle', 'walk', 'run', 'wave', 'talk', 'dead'];
const chip = (a, cur) => el('span', { class: 'chip' + (a === cur ? ' on' : ''), text: a, onclick: () => { character?.setAnim(a); renderAnims(); } });
function renderAnims() {
  const cur = character?.anim;
  if (mode === 'chibi2') {
    // Chibi 2's clips in their groups; `attack` plays whatever strike the hands suggest
    animChips.replaceChildren(...Object.entries(CHIBI2_ANIM_GROUPS).map(([g, list]) => el('div', { class: 'anim-group' }, el('b', { text: g }), ...list.map(a => chip(a, cur)))));
  } else animChips.replaceChildren(...(mode === 'mii' ? MII_ANIMS : CLIPS).map(a => chip(a, cur)));
}
async function rebuild() {
  if (building) { pending = true; return; } building = true; setStatus('building ' + mode + '…');
  const selectedMode = mode;
  try {
    if (character) { scene.scene.remove(character.group); character.dispose(); character = null; }
    const next = selectedMode === 'mii' ? await createMiiCharacter(avatar) : selectedMode === 'chibi2' ? await createChibi2Character(avatar, { anims: CHIBI2_EVERY_ANIMS }) : await createQuaterniusCharacter(avatar);
    if (mode !== selectedMode) { next.dispose(); pending = true; }
    else {
      character = next;
      scene.scene.add(character.group); character.setAnim(mode === 'quaternius' ? 'Idle_Loop' : 'idle'); character.setHandsFree?.(handsFreeCb.value); renderAnims();
      const h = character.metrics?.().totalHeight; anchorsInfo.textContent = h ? `height ≈ ${h.toFixed(2)} m` : '';
      setStatus(mode === 'mii' ? 'Chibi: primitives + face texture' : mode === 'chibi2' ? `Chibi 2: ${character.stats().triangles.toLocaleString()} triangles / ${character.stats().meshes} meshes` : 'Quaternius: ' + character.group.children.length + ' mesh parts');
    }
  } catch (e) { console.error(e); setStatus('error: ' + e.message); toast(e.message); }
  building = false; if (pending) { pending = false; rebuild(); }
}
scene.addTicker((dt, t) => character?.update(dt, t));
function setMode(m) { mode = ['mii', 'chibi2', 'quaternius'].includes(m) ? m : 'chibi2'; store.set('mode2', mode); for (const b of modeBtns.children) b.classList.toggle('on', b.dataset.mode === mode); frameSel.style.display = mode === 'quaternius' ? '' : 'none'; rebuild(); }

// presets + 2D compare
const presetGrid = el('div', { class: 'presets' });
for (const p of DATA.presets) presetGrid.append(el('div', { class: 'card', onclick: () => { avatar = normalizeAvatar(p.avatar); name = p.name; changed(); syncUI(); }, html: renderSVG(p.avatar) + `<div>${p.name}</div>` }));
const mini2d = el('div', { class: 'mini2d' });
const raceGrid = el('div', { class: 'presets' });
for (const p of C2.presets.filter(p => p.race)) raceGrid.append(el('div', { class: 'card', onclick: () => { avatar = normalizeAvatar(p.avatar); name = p.name; changed(); syncUI(); }, html: renderSVG(p.avatar) + `<div>${p.name}</div>` }));
main.append(panel('Chibi 2 races and looks', raceGrid), panel('Presets (shared with Avatar 2D)', presetGrid), panel('Renderers', el('p', { class: 'small', html: '<b>Chibi 2</b> is the flagship: races, roundness, a skinned body with modeled face features and ~90 animations. <b>Chibi (procedural)</b> and <b>Quaternius</b> are <b>deprecated</b> — kept only so the two can be compared; nothing new is built for them.' })), panel('Quaternius mapping notes', el('p', { class: 'small', html: 'Free-tier files: 2 bodies (male/female "Superhero"), 6 hairstyles + beard, 2 outfit sets (Peasant, Ranger) × body/arms/legs/feet, 43 animation clips. 2D ids map onto them (<code>MAP</code> in <code>quaternius.js</code>): hair → nearest of Buzzed/SimpleParted/Long/Buns/BuzzedFemale; tops robe/tunic/dress/rags… → Peasant, plate/leather/chainmail/coat → Ranger; hood/pauldrons when the JSON asks; skin = light/dark texture + tint; hair/eyes/outfit tinted from JSON colours. Face sliders and 2D face parts do not apply here because the Quaternius head is a separate model; use either Chibi mode for those. Height/width scale bones (thighs, spine) and the animation still plays.' })));

// ---------- left: same slot editor as 2D (subset relevant to 3D) ----------
const left = document.getElementById('left');
const slotEls = {};
function slotRow(slot) {
  const ids = partIds(slot); const get = () => (slot === 'headShape' ? avatar.headShape : avatar[slot].id); const set = v => { if (slot === 'headShape') avatar.headShape = v; else avatar[slot].id = v; changed(); };
  const sel = el('select', { onchange: () => set(sel.value) }, ...ids.map(id => el('option', { value: id, text: PARTS[slot][id].name || id })));
  const sw = COLOR_SLOTS[slot] ? colorSwatch(() => avatar[slot].color, v => { avatar[slot].color = v; changed(); }) : el('span');
  slotEls[slot] = { sel, sw }; return el('div', { class: 'slot-row' }, el('label', { text: SLOT_LABELS[slot] }), sel, sw);
}
function colorSwatch(get, set) { const input = el('input', { type: 'color' }); const b = el('button', { class: 'swatch', onclick: () => input.click() }, input); input.addEventListener('input', () => { set(input.value); b.style.background = input.value; }); b.sync = () => { const v = get() || '#000000'; input.value = v; b.style.background = v; }; b.sync(); return b; }
const bodyKnobs = {}; for (const k of ['height', 'width', 'headSize']) bodyKnobs[k] = knob(k, { min: 0, max: 1, step: 0.01, value: avatar.body[k] }, v => { avatar.body[k] = v; changed(); });
// Chibi 2: roundness (a belly, wider hips, thicker limbs) — unset means the race's own default
bodyKnobs.round = knob('roundness', { min: 0, max: 1, step: 0.01, value: roundOf(avatar) }, v => { avatar.body.round = v; changed(); });
/** The race is the Chibi 2 body variant ("Chibi 2 Human", "Chibi 2 Dwarf"…); Random rolls inside it. */
const raceSel = select('Race', CHIBI2_RACE_IDS.map(id => ({ value: id, label: CHIBI2_RACES[id].label })), avatar.body.race || 'human', v => { avatar.body.race = v; delete avatar.body.round; changed(); syncUI(); });
const cheeksCb = checkbox('Round cheeks', !!avatar.body.cheeks, v => { avatar.body.cheeks = v; changed(); });
const skinSw = colorSwatch(() => avatar.body.skin, v => { avatar.body.skin = v; changed(); });
const frameSel = select('Body frame', [{ value: 'm', label: 'male (Quaternius)' }, { value: 'f', label: 'female (Quaternius)' }], avatar.body.frame || 'm', v => { avatar.body.frame = v; changed(); });
const faceKnobs = {}; const faceKnob = (slot, key, label, min, max, step) => { const k = knob(label, { min, max, step, value: avatar[slot][key] ?? 0 }, v => { avatar[slot][key] = v; changed(); }); faceKnobs[slot + '.' + key] = k; return k; };
left.append(
  panel('Body', raceSel, bodyKnobs.height, bodyKnobs.width, bodyKnobs.headSize, bodyKnobs.round, el('div', { class: 'row' }, el('label', { text: 'Skin' }), skinSw), cheeksCb, frameSel),
  panel('Head', slotRow('headShape'), slotRow('hair'), slotRow('ears'), slotRow('facialHair'), slotRow('extras'), slotRow('hat')),
  panel('Face (Chibi / Chibi 2)', slotRow('eyes'), faceKnob('eyes', 'x', 'eye spacing', -1, 1, 0.05), faceKnob('eyes', 'y', 'eye height', -1, 1, 0.05), faceKnob('eyes', 'scale', 'eye size', 0.5, 1.6, 0.05), faceKnob('eyes', 'rot', 'eye tilt', -30, 30, 1), slotRow('brows'), slotRow('nose'), slotRow('mouth'), faceKnob('mouth', 'y', 'mouth height', -1, 1, 0.05), faceKnob('mouth', 'scale', 'mouth size', 0.5, 1.8, 0.05)),
  panel('Outfit', slotRow('top'), el('div', { class: 'row' }, el('label', { text: 'Top 2nd colour' }), colorSwatch(() => avatar.top.color2, v => { avatar.top.color2 = v; changed(); })), slotRow('bottom'), slotRow('shoes'), slotRow('accessory')),
  panel('Gear', slotRow('cape'), slotRow('held'), slotRow('offhand'), slotRow('decor')),
);

// ---------- right: JSON + 2D preview ----------
const right = document.getElementById('right');
const nameIn = textInput('Name', name, v => { name = v; store.set('name', v); renderJson(); });
const jsonArea = el('textarea', { id: 'json' });
function renderJson() { jsonArea.value = JSON.stringify({ schema: 1, name, avatar }, null, 2); }
right.append(
  panel('Same character in 2D', el('p', { class: 'small muted', text: 'One JSON, two renderers.' }), mini2d),
  panel('Character JSON (avatar section)', nameIn, jsonArea,
    el('div', { class: 'row' }, button('Apply', () => { try { const j = JSON.parse(jsonArea.value); avatar = normalizeAvatar(j.avatar || j); if (j.name) { name = j.name; nameIn.set(name); } changed(); syncUI(); } catch (e) { toast('Bad JSON'); } }, 'small'), button('Copy', () => copyText(jsonArea.value), 'small'), button('Export', () => downloadJSON({ schema: 1, name, avatar }, slug(name) + '.avatar.json'), 'small'), button('Import', async () => { try { const j = await readJSONFile(); avatar = normalizeAvatar(j.avatar || j); if (j.name) { name = j.name; nameIn.set(name); } changed(); syncUI(); } catch { toast('Import failed'); } }, 'small'))),
);

// ---------- behaviour ----------
let rebuildTimer;
function changed() { store.set('current', avatar); renderJson(); mini2d.innerHTML = renderSVG(avatar); clearTimeout(rebuildTimer); rebuildTimer = setTimeout(rebuild, 150); }
function syncUI() { for (const s in slotEls) { slotEls[s].sel.value = s === 'headShape' ? avatar.headShape : avatar[s].id; slotEls[s].sw.sync?.(); } for (const k in bodyKnobs) bodyKnobs[k].set(k === 'round' ? roundOf(avatar) : avatar.body[k]); raceSel.set?.(avatar.body.race || 'human'); cheeksCb.set(!!avatar.body.cheeks); skinSw.sync(); for (const [k, kn] of Object.entries(faceKnobs)) { const [slot, key] = k.split('.'); kn.set(avatar[slot][key] ?? 0); } frameSel.set(avatar.body.frame || 'm'); nameIn.set(name); renderJson(); mini2d.innerHTML = renderSVG(avatar); }
function rnd(only) {
  // race-weighted: a dwarf rolls beards and heavy boots, an elf pointed ears and long hair — but a human can still roll pointed ears, just rarely
  const race = avatar.body.race || 'human', seed = Math.floor(Math.random() * 1e9);
  avatar = randomChibi2(randomAvatar, DATA, { race, seed, base: only ? avatar : null, only, makeRng, known: (slot, id) => !!PARTS[slot]?.[id] });
  if (!only) name = CHIBI2_RACES[race].name + ' ' + Math.floor(Math.random() * 900 + 100);
  changed(); syncUI();
}
function slug(s) { return String(s || 'character').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'character'; }
syncUI(); setMode(mode);
window.avatar3d = { randomize: rnd, get avatar() { return avatar; }, get character() { return character; }, get mode() { return mode; }, setMode, set: a => { avatar = normalizeAvatar(a); changed(); syncUI(); }, scene, rebuild, isBuilding: () => building };
