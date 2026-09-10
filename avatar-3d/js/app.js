// Avatar 3D viewer/builder UI. Reuses the 2D catalog + presets + random generator; renders with mii.js or quaternius.js.
import { el, knob, select, button, panel, toast, downloadJSON, copyText, readJSONFile, textInput, checkbox } from '../../shared/ui.js';
import { makeStore } from '../../shared/store.js';
import { renderSVG, normalizeAvatar } from '../../avatar-2d/js/render.js';
import { PARTS, SLOTS, SLOT_LABELS, COLOR_SLOTS, partIds } from '../../avatar-2d/js/parts/index.js';
import { randomAvatar } from '../../avatar-2d/js/random.js';
import { createScene } from './scene.js';
import { createMiiCharacter } from './mii.js';
import { createQuaterniusCharacter, CLIPS, MAP } from './quaternius.js';

const store = makeStore('avatar-3d', 1);
const DATA = await (await fetch('../avatar-2d/data/presets.json')).json();
let avatar = normalizeAvatar(store.get('current', DATA.presets[0].avatar));
let name = store.get('name', 'Villager'); let mode = store.get('mode', 'mii');
const status = document.getElementById('status'); const setStatus = t => status.textContent = t;

// ---------- middle: viewport ----------
const main = document.getElementById('main');
const viewport = el('div', { id: 'viewport' }); const overlay = el('div', { class: 'overlay', text: 'drag to orbit · wheel to zoom' }); viewport.append(overlay);
const modeBtns = el('div', { class: 'row mode-btns' }, button('Mii-style (procedural)', () => setMode('mii')), button('Quaternius (CC0 meshes)', () => setMode('quaternius')));
const animChips = el('div', { class: 'chips anim-chips' });
const turntableCb = checkbox('Turntable', false, v => scene.setTurntable(v ? 0.6 : 0));
const anchorsInfo = el('span', { class: 'small muted' });
main.append(el('div', { class: 'panel' }, modeBtns, viewport, el('div', { class: 'row' }, el('label', { text: 'Animation' }), animChips), el('div', { class: 'row' }, turntableCb, button('📷 Snapshot PNG', () => { const a = el('a', { href: scene.snapshot(), download: slug(name) + '-3d.png' }); document.body.append(a); a.click(); a.remove(); }, 'small'), button('🎲 Random', () => rnd(null), 'primary'), button('Random face', () => rnd('face'), 'small'), button('Random outfit', () => rnd('outfit'), 'small'), raceSelHolder(), anchorsInfo)));
function raceSelHolder() { window.__raceSel = select('Race', ['any', ...Object.keys(DATA.raceRules)], 'any'); return window.__raceSel; }
const scene = createScene(viewport);
let character = null; let building = false, pending = null;
const MII_ANIMS = ['idle', 'walk', 'run', 'wave', 'talk', 'dead'];
function renderAnims() { const list = mode === 'mii' ? MII_ANIMS : CLIPS; const cur = character?.anim; animChips.replaceChildren(...list.map(a => el('span', { class: 'chip' + (a === cur ? ' on' : ''), text: a, onclick: () => { character?.setAnim(a); renderAnims(); } }))); }
async function rebuild() {
  if (building) { pending = true; return; } building = true; setStatus('building ' + mode + '…');
  try {
    if (character) { scene.scene.remove(character.group); character.dispose(); character = null; }
    character = mode === 'mii' ? await createMiiCharacter(avatar) : await createQuaterniusCharacter(avatar);
    scene.scene.add(character.group); character.setAnim(mode === 'mii' ? 'idle' : 'Idle_Loop'); renderAnims();
    const h = mode === 'mii' ? character.metrics().totalHeight : null; anchorsInfo.textContent = h ? `height ≈ ${h.toFixed(2)} m` : '';
    setStatus(mode === 'mii' ? 'Mii-style: primitives + face texture' : 'Quaternius: ' + character.group.children.length + ' mesh parts');
  } catch (e) { console.error(e); setStatus('error: ' + e.message); toast(e.message); }
  building = false; if (pending) { pending = false; rebuild(); }
}
scene.addTicker((dt, t) => character?.update(dt, t));
function setMode(m) { mode = m; store.set('mode', m); for (const b of modeBtns.children) b.classList.toggle('on', (b.textContent.startsWith('Mii') ? 'mii' : 'quaternius') === m); frameSel.style.display = m === 'quaternius' ? '' : 'none'; rebuild(); }

// presets + 2D compare
const presetGrid = el('div', { class: 'presets' });
for (const p of DATA.presets) presetGrid.append(el('div', { class: 'card', onclick: () => { avatar = normalizeAvatar(p.avatar); name = p.name; changed(); syncUI(); }, html: renderSVG(p.avatar) + `<div>${p.name}</div>` }));
const mini2d = el('div', { class: 'mini2d' });
main.append(panel('Presets (shared with Avatar 2D)', presetGrid), panel('Quaternius mapping notes', el('p', { class: 'small', html: 'Free-tier files: 2 bodies (male/female "Superhero"), 6 hairstyles + beard, 2 outfit sets (Peasant, Ranger) × body/arms/legs/feet, 43 animation clips. 2D ids map onto them (<code>MAP</code> in <code>quaternius.js</code>): hair → nearest of Buzzed/SimpleParted/Long/Buns/BuzzedFemale; tops robe/tunic/dress/rags… → Peasant, plate/leather/chainmail/coat → Ranger; hood/pauldrons when the JSON asks; skin = light/dark texture + tint; hair/eyes/outfit tinted from JSON colours. Face sliders and 2D face parts are <b>not</b> applied here (the Quaternius head has its own modelled face); use Mii mode for those. Height/width scale bones (thighs, spine) and the animation still plays.' })));

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
const skinSw = colorSwatch(() => avatar.body.skin, v => { avatar.body.skin = v; changed(); });
const frameSel = select('Body frame', [{ value: 'm', label: 'male (Quaternius)' }, { value: 'f', label: 'female (Quaternius)' }], avatar.body.frame || 'm', v => { avatar.body.frame = v; changed(); });
const faceKnobs = {}; const faceKnob = (slot, key, label, min, max, step) => { const k = knob(label, { min, max, step, value: avatar[slot][key] ?? 0 }, v => { avatar[slot][key] = v; changed(); }); faceKnobs[slot + '.' + key] = k; return k; };
left.append(
  panel('Body', bodyKnobs.height, bodyKnobs.width, bodyKnobs.headSize, el('div', { class: 'row' }, el('label', { text: 'Skin' }), skinSw), frameSel),
  panel('Head', slotRow('headShape'), slotRow('hair'), slotRow('ears'), slotRow('facialHair'), slotRow('extras'), slotRow('hat')),
  panel('Face (Mii mode)', slotRow('eyes'), faceKnob('eyes', 'x', 'eye spacing', -1, 1, 0.05), faceKnob('eyes', 'y', 'eye height', -1, 1, 0.05), faceKnob('eyes', 'scale', 'eye size', 0.5, 1.6, 0.05), faceKnob('eyes', 'rot', 'eye tilt', -30, 30, 1), slotRow('brows'), slotRow('nose'), slotRow('mouth'), faceKnob('mouth', 'y', 'mouth height', -1, 1, 0.05), faceKnob('mouth', 'scale', 'mouth size', 0.5, 1.8, 0.05)),
  panel('Outfit', slotRow('top'), el('div', { class: 'row' }, el('label', { text: 'Top 2nd colour' }), colorSwatch(() => avatar.top.color2, v => { avatar.top.color2 = v; changed(); })), slotRow('bottom'), slotRow('shoes'), slotRow('accessory')),
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
function syncUI() { for (const s in slotEls) { slotEls[s].sel.value = s === 'headShape' ? avatar.headShape : avatar[s].id; slotEls[s].sw.sync?.(); } for (const k in bodyKnobs) bodyKnobs[k].set(avatar.body[k]); skinSw.sync(); for (const [k, kn] of Object.entries(faceKnobs)) { const [slot, key] = k.split('.'); kn.set(avatar[slot][key] ?? 0); } frameSel.set(avatar.body.frame || 'm'); nameIn.set(name); renderJson(); mini2d.innerHTML = renderSVG(avatar); }
function rnd(only) { const race = window.__raceSel.value; avatar = randomAvatar(DATA, { race: race === 'any' ? null : race, base: only ? avatar : null, only }); if (!only) name = (race === 'any' ? 'Random' : race) + ' ' + Math.floor(Math.random() * 900 + 100); changed(); syncUI(); }
function slug(s) { return String(s || 'character').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'character'; }
syncUI(); setMode(mode);
window.avatar3d = { get avatar() { return avatar; }, get character() { return character; }, get mode() { return mode; }, setMode, set: a => { avatar = normalizeAvatar(a); changed(); syncUI(); }, scene, rebuild, isBuilding: () => building };
