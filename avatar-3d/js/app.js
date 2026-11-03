// Avatar 3D viewer/builder UI — Chibi 2 only (2026-10-21). It builds every look as Chibi 2.5 (`{ v25: true }`, the
// same as Thousandvale), so every 2.5 eye / brow / mouth / hair id and the 2.5 fields (pupil, iris, eye height…) show.
// The first procedural Chibi lives on as an archived showcase (chibi1.html); the Quaternius mode was removed.
import { el, knob, select, button, panel, toast, downloadJSON, copyText, readJSONFile, textInput, checkbox } from '../../shared/ui.js';
import { makeStore } from '../../shared/store.js';
import { renderSVG, normalizeAvatar } from '../../avatar-2d/js/render.js';
import { PARTS, SLOTS, SLOT_LABELS, COLOR_SLOTS, partIds } from '../../avatar-2d/js/parts/index.js';
import { randomAvatar } from '../../avatar-2d/js/random.js';
import { createScene } from './scene.js';
import { createChibi2Character } from './chibi2.js';
import { createChibi26Character } from './chibi26.js';
import { CHIBI2_EVERY_ANIMS, CHIBI2_MUSIC_ANIMS, CHIBI2_ANIM_GROUPS } from './chibi2-motion.js';
import { CHIBI26_ALL_ANIMS } from './chibi26-motion.js';
import { CHIBI2_RACES, CHIBI2_RACE_IDS, randomChibi2, roundOf } from './chibi2-races.js';
import { makeRng } from '../../avatar-2d/js/random.js';
import { CHIBI25_OPTIONS } from './chibi25-options.js';
import { attachHeldFlame } from './held-flame.js';
import { loadClassRoster } from './class-outfits.js';
// chibi2-v2.html loads this same page with <body data-version="2">: the OLD Chibi 2 (v2) builder, kept to compare with 2.5.
const V2 = document.body.dataset.version === '2';
const params = new URLSearchParams(location.search);
let CHARACTER_VERSION = params.get('v') === '2.6' || (!params.has('v') && localStorage.getItem('avatar-3d-version') === '2.6') ? '2.6' : '2.5';
let GRAPHICS_QUALITY = localStorage.getItem('avatar-3d-graphics-quality') || 'high';
let SIDE_BY_SIDE = params.get('compare') === '1';

const store = makeStore(V2 ? 'avatar-3d-v2' : 'avatar-3d', 1);
const DATA = await (await fetch('../avatar-2d/data/presets.json')).json();
let avatar = normalizeAvatar(store.get('current', DATA.presets[0].avatar));
const C2 = await (await fetch('./data/chibi2-presets.json')).json();
let name = store.get('name', 'Villager'); const mode = 'chibi2';
const status = document.getElementById('status'); const setStatus = t => status.textContent = t;

// ---------- middle: viewport ----------
const main = document.getElementById('main');
const viewport = el('div', { id: 'viewport' }); const overlay = el('div', { class: 'overlay', text: 'drag to orbit · wheel to zoom' }); viewport.append(overlay);
const modeBtns = V2 ? el('p', { class: 'small muted', html: '<b>Chibi 2 (v2) — ARCHIVED for comparison.</b> The model before 2.5 (still what Farhold, Emberveil and Bannerline build). The 2.5-only options in the menus fall back to a v2 part here. Current model: <a href="./">Avatar 3D</a> · archive: <a href="chibi1.html">Chibi 1</a>.' }) : el('p', { class: 'small muted', html: '<b>Chibi 2.5 / 2.6 review</b> · <a href="fit.html">Open the real-world fit scene</a> · <a href="chibi1.html">Chibi 1 (archived)</a> · <a href="chibi2-v2.html">Chibi 2 v2 (archived)</a> · <a href="chibi3.html">Chibi 3 (on hold)</a> · <a href="chibi4/">Chibi 4 (on hold)</a>.' });
const animChips = el('div', { class: 'chips anim-chips' });
const turntableCb = checkbox('Turntable', false, v => scene.setTurntable(v ? 0.6 : 0));
const handsFreeCb = checkbox('Hands free', false, v => character?.setHandsFree?.(v));
const anchorsInfo = el('span', { class: 'small muted' });
const versionSwitch = V2 ? null : el('div', { class: 'row', id: 'chibi-version-switch' }, el('label', { text: 'Version' }), ...['2.5', '2.6'].map(v => button(v, () => chooseVersion(v), 'small')), button('Side by side', () => { SIDE_BY_SIDE = !SIDE_BY_SIDE; syncVersionUrl(); rebuild(); }, 'small'));
main.append(el('div', { class: 'panel' }, modeBtns, versionSwitch, viewport, el('div', { class: 'row' }, el('label', { text: 'Animation' }), animChips), el('div', { class: 'row' }, turntableCb, button('📷 Snapshot PNG', () => { const a = el('a', { href: scene.snapshot(), download: slug(name) + '-3d.png' }); document.body.append(a); a.click(); a.remove(); }, 'small'), button('🎲 Random', () => rnd(null), 'primary'), button('Random face', () => rnd('face'), 'small'), button('Random outfit', () => rnd('outfit'), 'small'), handsFreeCb, anchorsInfo)));
const scene = createScene(viewport);
let character = null, comparisonCharacter = null; let building = false, pending = null;
function syncVersionUrl() { const u = new URL(location.href); u.searchParams.set('v', CHARACTER_VERSION); SIDE_BY_SIDE ? u.searchParams.set('compare', '1') : u.searchParams.delete('compare'); history.replaceState(null, '', u); localStorage.setItem('avatar-3d-version', CHARACTER_VERSION); }
function chooseVersion(v) { CHARACTER_VERSION = v; syncVersionUrl(); rebuild(); }
const chip = (a, cur) => el('span', { class: 'chip' + (a === cur ? ' on' : ''), text: a, onclick: () => { character?.setAnim(a); renderAnims(); } });
function renderAnims() {
  const cur = character?.anim;
  // Chibi 2's clips in their groups; `attack` plays whatever strike the hands suggest
  const groups = { ...CHIBI2_ANIM_GROUPS, ...(CHARACTER_VERSION === '2.6' ? { 'fit poses': ['seated', 'drive'] } : {}) };
  if (CHARACTER_VERSION === '2.6') {
    const shown = new Set(Object.values(groups).flat());
    const additional = CHIBI26_ALL_ANIMS.filter(clip => !shown.has(clip));
    if (additional.length) groups['More clips'] = additional;
  }
  animChips.replaceChildren(...Object.entries(groups).map(([g, list]) => el('div', { class: 'anim-group' }, el('b', { text: g }), ...list.map(a => chip(a, cur)))));
}
async function rebuild() {
  if (building) { pending = true; return; } building = true; setStatus('building ' + mode + '…');
  const selectedMode = mode;
  try {
    flame?.dispose(); flame = null;
    if (character) { scene.scene.remove(character.group); character.dispose(); character = null; }
    if (comparisonCharacter) { scene.scene.remove(comparisonCharacter.group); comparisonCharacter.dispose(); comparisonCharacter = null; }
    const buildStart = performance.now();
    const buildCharacter = CHARACTER_VERSION === '2.6' ? createChibi26Character : createChibi2Character;
    const anims = CHARACTER_VERSION === '2.6' ? CHIBI26_ALL_ANIMS : [...CHIBI2_EVERY_ANIMS, ...CHIBI2_MUSIC_ANIMS];
    const next = await buildCharacter(avatar, { anims, v25: !V2, graphics: GRAPHICS_QUALITY });
    const buildMs = performance.now() - buildStart;
    if (mode !== selectedMode) { next.dispose(); pending = true; }
    else {
      character = next; flame = attachHeldFlame(character, avatar);
      scene.scene.add(character.group); character.setAnim('idle'); character.setHandsFree?.(handsFreeCb.value); renderAnims();
      let comparisonBuildMs = 0;
      if (!V2 && SIDE_BY_SIDE) {
        character.group.position.x = CHARACTER_VERSION === '2.5' ? -0.55 : 0.55;
        const compareStart = performance.now();
        comparisonCharacter = CHARACTER_VERSION === '2.5'
          ? await createChibi26Character(avatar, { anims: CHIBI26_ALL_ANIMS, graphics: GRAPHICS_QUALITY })
          : await createChibi2Character(avatar, { anims: [...CHIBI2_EVERY_ANIMS, ...CHIBI2_MUSIC_ANIMS], v25: true });
        comparisonBuildMs = performance.now() - compareStart;
        comparisonCharacter.group.position.x = CHARACTER_VERSION === '2.5' ? 0.55 : -0.55;
        scene.scene.add(comparisonCharacter.group); comparisonCharacter.setAnim('idle');
      }
      if (!V2 && versionSwitch) { for (const b of versionSwitch.querySelectorAll('button')) b.classList.toggle('on', b.textContent === CHARACTER_VERSION || (b.textContent === 'Side by side' && SIDE_BY_SIDE)); }
      const modelMetrics = character.metrics?.(), h = modelMetrics?.totalHeight;
      anchorsInfo.textContent = h ? `height ≈ ${h.toFixed(2)} m${modelMetrics.headHeight ? ` · head ≈ ${modelMetrics.headHeight.toFixed(2)} m` : ''}` : '';
      const stats = character.stats(); let vertices = 0; character.group.traverse(o => { if (o.isMesh) vertices += o.geometry.attributes.position?.count || 0; });
      const versionLabel = V2 ? 'Chibi 2 (v2)' : `Chibi ${CHARACTER_VERSION}`;
      let summary = `${versionLabel}: ${stats.triangles.toLocaleString()} triangles · ${vertices.toLocaleString()} vertices · ${stats.meshes} draw calls · ${stats.bones} bones · ${buildMs.toFixed(1)} ms`;
      if (comparisonCharacter) {
        const s = comparisonCharacter.stats(); let v = 0; comparisonCharacter.group.traverse(o => { if (o.isMesh) v += o.geometry.attributes.position?.count || 0; });
        const other = CHARACTER_VERSION === '2.5' ? '2.6' : '2.5';
        summary += ` · ${other}: ${s.triangles.toLocaleString()} tris · ${v.toLocaleString()} verts · ${s.meshes} calls · ${s.bones} bones · ${comparisonBuildMs.toFixed(1)} ms`;
      }
      setStatus(summary);
    }
  } catch (e) { console.error(e); setStatus('error: ' + e.message); toast(e.message); }
  building = false; if (pending) { pending = false; rebuild(); }
}
let flame = null;
scene.addTicker((dt, t) => { character?.update(dt, t); comparisonCharacter?.update(dt, t); flame?.update(dt); });
/** Kept for old callers and tests: there is one renderer now. */
function setMode() { rebuild(); }

// presets + 2D compare
const presetGrid = el('div', { class: 'presets' });
for (const p of DATA.presets) presetGrid.append(el('div', { class: 'card', onclick: () => { avatar = normalizeAvatar(p.avatar); name = p.name; changed(); syncUI(); }, html: renderSVG(p.avatar) + `<div>${p.name}</div>` }));
const mini2d = el('div', { class: 'mini2d' });
const raceGrid = el('div', { class: 'presets' });
for (const p of C2.presets.filter(p => p.race)) raceGrid.append(el('div', { class: 'card', onclick: () => { avatar = normalizeAvatar(p.avatar); name = p.name; changed(); syncUI(); }, html: renderSVG(p.avatar) + `<div>${p.name}</div>` }));
// every class of every game (2026-10-22): Emberveil/Farhold's 30 + Thousandvale's Starcaller and Star Blade
const classGrid = el('div', { class: 'presets' });
for (const c of await loadClassRoster()) classGrid.append(el('div', { class: 'card', 'data-class': c.id, title: c.game === 'thousandvale' ? 'Thousandvale only' : '', onclick: () => { avatar = normalizeAvatar(c.avatar); name = c.name; changed(); syncUI(); }, html: renderSVG(c.avatar) + `<div>${c.name}</div>` }));
main.append(panel('Chibi 2 races and looks', raceGrid), panel('Classes (all games)', classGrid), panel('Presets (shared with Avatar 2D)', presetGrid));

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
const formSel = select('Body form', [{ value: 'masc', label: 'Masculine' }, { value: 'fem', label: 'Feminine' }], avatar.body.form || 'masc', v => { avatar.body.form = v; changed(); });
const chestSel = select('Chest size', [{ value: 'flat', label: 'Flat' }, { value: 'round', label: 'Round' }], avatar.body.chestSize || 'flat', v => { avatar.body.chestSize = v; changed(); });
const graphicsSel = select('Graphics', [{ value: 'high', label: 'Textures' }, { value: 'low', label: 'Solid colors' }], GRAPHICS_QUALITY, v => { GRAPHICS_QUALITY = v; localStorage.setItem('avatar-3d-graphics-quality', v); rebuild(); });
const cheeksCb = checkbox('Round cheeks', !!avatar.body.cheeks, v => { avatar.body.cheeks = v; changed(); });
const skinSw = colorSwatch(() => avatar.body.skin, v => { avatar.body.skin = v; changed(); });
const faceKnobs = {}; const faceKnob = (slot, key, label, min, max, step) => { const k = knob(label, { min, max, step, value: avatar[slot][key] ?? 0 }, v => { avatar[slot][key] = v; changed(); }); faceKnobs[slot + '.' + key] = k; return k; };
left.append(
  panel('Body', raceSel, formSel, chestSel, bodyKnobs.height, bodyKnobs.width, bodyKnobs.headSize, bodyKnobs.round, el('div', { class: 'row' }, el('label', { text: 'Skin' }), skinSw), cheeksCb, graphicsSel),
  panel('Head', slotRow('headShape'), slotRow('hair'), slotRow('ears'), slotRow('facialHair'), slotRow('extras'), slotRow('hat')),
  panel('Face', slotRow('eyes'), faceKnob('eyes', 'x', 'eye spacing', -1, 1, 0.05), faceKnob('eyes', 'y', 'eye height', -1, 1, 0.05), faceKnob('eyes', 'scale', 'eye size', 0.5, 1.6, 0.05), faceKnob('eyes', 'rot', 'eye tilt', -30, 30, 1), slotRow('brows'), slotRow('nose'), slotRow('mouth'), faceKnob('mouth', 'y', 'mouth height', -1, 1, 0.05), faceKnob('mouth', 'scale', 'mouth size', 0.5, 1.8, 0.05)),
  panel('Outfit', slotRow('top'), el('div', { class: 'row' }, el('label', { text: 'Top 2nd colour' }), colorSwatch(() => avatar.top.color2, v => { avatar.top.color2 = v; changed(); })), slotRow('bottom'), slotRow('shoes'), slotRow('accessory')),
  panel('Gear', slotRow('cape'), slotRow('held'), slotRow('offhand'), slotRow('decor')),
);

// Chibi 2.5 details: one control per extra field in CHIBI25_OPTIONS.fields (pupil, iris, eye height, brow thickness…),
// drawn from that table so a field added there shows up here with no page change. "default" deletes the key.
const details = el('div', { class: 'c25-details' });
function drawDetails() {
  const rows = [];
  for (const [slot, fields] of Object.entries(CHIBI25_OPTIONS.fields)) {
    for (const [key, spec] of Object.entries(fields)) {
      const label = `${SLOT_LABELS[slot] || slot}: ${key}`, cur = avatar[slot]?.[key];
      const put = v => { avatar[slot] = avatar[slot] || {}; if (v === undefined) delete avatar[slot][key]; else avatar[slot][key] = v; changed(); };
      let input;
      if (spec.ids) {
        input = el('select', { onchange: () => put(input.value === '' ? undefined : input.value) }, el('option', { value: '', text: `default (${spec.names?.[spec.default] || spec.default})` }), ...spec.ids.map(id => el('option', { value: id, text: spec.names?.[id] || id })));
        input.value = cur ?? '';
      } else if (spec.type === 'color') {
        const sw = colorSwatch(() => avatar[slot]?.[key] || spec.default || '#888888', v => put(v));
        input = el('span', { class: 'row' }, sw, button('unset', () => { put(undefined); sw.sync(); }, 'small'));
      } else if (spec.type === 'range') {
        input = knob(key, { min: spec.min, max: spec.max, step: 0.05, value: cur ?? spec.default }, v => put(v));
      } else if (spec.type === 'boolean') {
        input = checkbox(key, cur ?? spec.default, v => put(v));
      } else continue;
      if (spec.note) input.title = spec.note;
      rows.push(el('div', { class: 'slot-row' }, el('label', { text: label }), input));
    }
  }
  details.replaceChildren(...rows);
}
const bodyUi = el('section', { id: 'c25-body' });
import('./chibi25-body-ui.js').then(m => m.mountBodyUi?.(bodyUi, { get: () => avatar, set: next => { avatar = normalizeAvatar(next); changed(); syncUI(); } })).catch(e => console.warn('2.5 body controls', e));
if (!V2) left.append(panel('Chibi 2.5 details', details), panel('Chibi 2.5 body', bodyUi));

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
function syncUI() { drawDetails(); for (const s in slotEls) { slotEls[s].sel.value = s === 'headShape' ? avatar.headShape : avatar[s].id; slotEls[s].sw.sync?.(); } for (const k in bodyKnobs) bodyKnobs[k].set(k === 'round' ? roundOf(avatar) : avatar.body[k]); raceSel.set?.(avatar.body.race || 'human'); cheeksCb.set(!!avatar.body.cheeks); skinSw.sync(); for (const [k, kn] of Object.entries(faceKnobs)) { const [slot, key] = k.split('.'); kn.set(avatar[slot][key] ?? 0); } nameIn.set(name); renderJson(); mini2d.innerHTML = renderSVG(avatar); }
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
