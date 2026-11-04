// Avatar 3D builder (redesigned 2026-11-03). One page builds a look as Chibi 2.5 (what games use) or Chibi 2.6 (the new
// proportions), or both side by side. chibi2-v2.html loads this same page with <body data-version="2"> as the archived
// v2 builder (no version switch, no 2.5-only fields).
//
// Layout: a grouped page menu under the title bar (js/avatar-nav.js: each version's builder and tools, the shared
// viewers, the archive); LEFT = the character, one section per part of the body, each 2.5 extra field placed beside the
// part it belongs to (the old "Chibi 2.5 details" / "Chibi 2.5 body" boxes repeated Race and the whole outfit); MIDDLE =
// toolbar, viewport, measured stats, Animation (collapsible), Starting looks (tabs); RIGHT = 2D preview + JSON.
// Every <select> gets ◀ ▶ buttons (shared/ui.js stepper). Section open/closed state is remembered per browser.
import { el, knob, button, toast, downloadJSON, copyText, readJSONFile, textInput, checkbox, stepper } from '../../shared/ui.js';
import { makeStore } from '../../shared/store.js';
import { renderSVG, normalizeAvatar } from '../../avatar-2d/js/render.js';
import { PARTS, SLOT_LABELS, COLOR_SLOTS, partIds } from '../../avatar-2d/js/parts/index.js';
import { randomAvatar, makeRng } from '../../avatar-2d/js/random.js';
import { createScene } from './scene.js';
import { createChibi2Character } from './chibi2.js';
import { createChibi26Character } from './chibi26.js';
import { CHIBI2_EVERY_ANIMS, CHIBI2_MUSIC_ANIMS, CHIBI2_ANIM_GROUPS } from './chibi2-motion.js';
import { CHIBI26_ALL_ANIMS } from './chibi26-motion.js';
import { CHIBI2_RACES, CHIBI2_RACE_IDS, randomChibi2, roundOf } from './chibi2-races.js';
import { CHIBI25_OPTIONS } from './chibi25-options.js';
import { CHIBI25_BODY_OPTIONS } from './chibi25-body-options.js';
import { OUTFIT25 } from './chibi25-outfits.js';
import { attachHeldFlame } from './held-flame.js';
import { loadClassRoster } from './class-outfits.js';
import { renderAvatarNav } from './avatar-nav.js';

const V2 = document.body.dataset.version === '2';
const params = new URLSearchParams(location.search);
const prefs = (() => { try { return localStorage; } catch { return { getItem: () => null, setItem() {} }; } })();
let CHARACTER_VERSION = params.get('v') === '2.6' || (!params.has('v') && prefs.getItem('avatar-3d-version') === '2.6') ? '2.6' : '2.5';
let GRAPHICS_QUALITY = prefs.getItem('avatar-3d-graphics-quality') || 'high';
let SIDE_BY_SIDE = params.get('compare') === '1';

const store = makeStore(V2 ? 'avatar-3d-v2' : 'avatar-3d', 1);
const DATA = await (await fetch('../avatar-2d/data/presets.json')).json();
let avatar = normalizeAvatar(store.get('current', DATA.presets[0].avatar));
const C2 = await (await fetch('./data/chibi2-presets.json')).json();
let name = store.get('name', 'Villager'); const mode = 'chibi2';
const status = document.getElementById('status'); const setStatus = t => { status.textContent = t; };
const nice = s => s.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()).replace(/ ([A-Z])/g, (_, c) => ' ' + c.toLowerCase());

// ---------- page menu ----------
const nav = renderAvatarNav(document.getElementById('site-nav'), { here: V2 ? 'v2-archive' : 'builder-' + CHARACTER_VERSION.replace('.', '') });
const markNav = () => { if (V2) return; for (const a of nav.querySelectorAll('a')) { const here = a.getAttribute('href') === `./?v=${CHARACTER_VERSION}`; here ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'); } for (const d of nav.querySelectorAll('details')) d.classList.toggle('current', !!d.querySelector('[aria-current]')); };

// ---------- sections: <details> with a remembered open state ----------
const openState = store.get('sections', {});
let sectionCount = 0;
function section(title, { id, open = true, cls = '', hint } = {}, ...children) {
  const key = id || 's' + sectionCount++;
  const d = el('details', { class: 'a3-sec ' + cls, 'data-section': key });
  d.open = openState[key] ?? open;
  d.append(el('summary', {}, el('h2', { text: title }), hint ? el('span', { class: 'a3-sec-hint', text: hint }) : null), el('div', { class: 'a3-sec-body' }, ...children));
  d.addEventListener('toggle', () => { openState[key] = d.open; store.set('sections', openState); });
  return d;
}
let fieldId = 0;
/** One labelled row: label | control | (swatch). The label is tied to the control for screen readers. */
function field(label, control, extra = null, { only25 = false } = {}) {
  const q = 'select, input:not([type=color]):not([type=checkbox])';
  const target = control.matches?.(q) ? control : control.querySelector?.(q);
  if (target && !target.id) target.id = 'f' + fieldId++;
  if (!extra) control.classList?.add('span2');   // no swatch: the control takes the swatch column too
  const row = el('div', { class: 'slot-row' + (only25 ? ' c25-details' : '') }, el('label', { for: target?.id, text: label }), control, extra);
  return row;
}
function selectEl(rows, value, onChange, label) {
  const sel = el('select', { onchange: () => onChange(sel.value) }, ...rows.map(([v, t]) => el('option', { value: v, text: t })));
  sel.value = value ?? rows[0]?.[0] ?? '';
  const wrap = stepper(sel, label); wrap.select = sel; wrap.set = v => { sel.value = v; }; return wrap;
}
function colorSwatch(get, set, label) {
  const input = el('input', { type: 'color', tabindex: '-1', 'aria-hidden': 'true' });
  const b = el('button', { type: 'button', class: 'swatch', title: label + ' colour', 'aria-label': label + ' colour', onclick: () => input.click() }, input);
  input.addEventListener('input', () => { set(input.value); b.style.background = input.value; });
  b.sync = () => { const v = get() || '#000000'; input.value = v; b.style.background = v; }; b.sync(); return b;
}

// ---------- middle: toolbar, viewport, stats ----------
const main = document.getElementById('main');
const viewport = el('div', { id: 'viewport', role: 'img', 'aria-label': '3D preview of the character. Drag to turn, scroll or pinch to zoom.' });
viewport.append(el('div', { class: 'overlay', 'aria-hidden': 'true', text: 'drag to orbit · wheel to zoom' }));
const versionBtns = ['2.5', '2.6'].map(v => el('button', { type: 'button', class: 'seg', 'data-version': v, 'aria-pressed': 'false', title: v === '2.5' ? 'Chibi 2.5: what the games build today' : 'Chibi 2.6: the new realistic-cartoon proportions', onclick: () => chooseVersion(v) }, el('span', { text: 'Chibi ' + v })));
const compareBtn = el('button', { type: 'button', class: 'seg', 'aria-pressed': 'false', title: 'Show 2.5 and 2.6 together', onclick: () => { SIDE_BY_SIDE = !SIDE_BY_SIDE; syncVersionUrl(); rebuild(); } }, el('span', { text: 'Side by side' }));
const versionSwitch = V2 ? null : el('div', { class: 'segmented', id: 'chibi-version-switch', role: 'group', 'aria-label': 'Character version' }, ...versionBtns, compareBtn);
const graphicsSel = selectEl([['high', 'Textures'], ['low', 'Solid colours']], GRAPHICS_QUALITY, v => { GRAPHICS_QUALITY = v; prefs.setItem('avatar-3d-graphics-quality', v); rebuild(); }, 'Graphics');
const turntableCb = checkbox('Turntable', false, v => scene.setTurntable(v ? 0.6 : 0));
const handsFreeCb = checkbox('Hands free', false, v => character?.setHandsFree?.(v));
handsFreeCb.title = 'Put held items away, so emotes use both hands';
const snapshot = () => { const a = el('a', { href: scene.snapshot(), download: slug(name) + '-3d.png' }); document.body.append(a); a.click(); a.remove(); };
const resetView = () => { scene.camera.position.set(0, 1.4, 4.2); scene.controls.target.set(0, 0.95, 0); scene.controls.update(); };
const toolbar = el('div', { class: 'a3-toolbar' },
  versionSwitch,
  el('div', { class: 'a3-tools' },
    el('button', { type: 'button', class: 'primary', onclick: () => rnd(null), title: 'Random character (R)' }, '🎲 Random'),
    button('Random face', () => rnd('face'), 'small'), button('Random outfit', () => rnd('outfit'), 'small')));
const viewBar = el('div', { class: 'a3-viewbar' },
  turntableCb, handsFreeCb,
  el('span', { class: 'a3-inline' }, el('label', { text: 'Graphics', for: 'gfx' }), graphicsSel),
  el('span', { class: 'spacer' }),
  button('⟲ Reset view', resetView, 'small'), button('📷 Snapshot PNG', snapshot, 'small'));
graphicsSel.select.id = 'gfx';
const versionNote = el('p', { class: 'a3-version-note small muted' });
const statsStrip = el('div', { class: 'a3-stats', id: 'a3-stats' });
main.append(el('div', { class: 'panel a3-stage' }, toolbar, versionNote, viewport, viewBar, statsStrip));
if (V2) versionNote.innerHTML = '<b>Chibi 2 (v2), archived for comparison.</b> The model before 2.5 (still what Farhold, Emberveil and Bannerline build). The 2.5-only options are hidden here. Current builder: <a href="./">Avatar 3D</a>.';
const scene = createScene(viewport);
let character = null, comparisonCharacter = null; let building = false, pending = null;
function syncVersionUrl() { const u = new URL(location.href); u.searchParams.set('v', CHARACTER_VERSION); SIDE_BY_SIDE ? u.searchParams.set('compare', '1') : u.searchParams.delete('compare'); history.replaceState(null, '', u); prefs.setItem('avatar-3d-version', CHARACTER_VERSION); }
function chooseVersion(v) { CHARACTER_VERSION = v; syncVersionUrl(); markNav(); rebuild(); }
function syncVersionUi() {
  if (V2) return;
  for (const b of versionBtns) b.setAttribute('aria-pressed', String(b.dataset.version === CHARACTER_VERSION));
  compareBtn.setAttribute('aria-pressed', String(SIDE_BY_SIDE));
  versionNote.innerHTML = (CHARACTER_VERSION === '2.6'
    ? '<b>Chibi 2.6</b> · about 5 heads tall, sized to fit things made for a real adult. Not in any game yet. <a href="fit.html">Real-world fit check →</a>'
    : '<b>Chibi 2.5</b> · what Thousandvale, Tumblefair and the other games build today.')
    + (SIDE_BY_SIDE ? ` Side by side: <b>${CHARACTER_VERSION}</b> on the ${CHARACTER_VERSION === '2.5' ? 'left' : 'right'}.` : '');
  document.body.dataset.chibi = CHARACTER_VERSION;
}

// ---------- Animation (collapsible) ----------
const animChips = el('div', { class: 'chips anim-chips' });
const animNow = el('span', { class: 'a3-sec-hint', 'aria-live': 'polite' });
const chip = (a, cur) => el('button', { type: 'button', class: 'chip' + (a === cur ? ' on' : ''), 'aria-pressed': String(a === cur), text: a, onclick: () => { character?.setAnim(a); comparisonCharacter?.setAnim(a); renderAnims(); } });
function renderAnims() {
  const cur = character?.anim;
  animNow.textContent = cur ? 'playing: ' + cur : '';
  const groups = { ...CHIBI2_ANIM_GROUPS, ...(CHARACTER_VERSION === '2.6' && !V2 ? { 'fit poses': ['seated', 'drive'] } : {}) };
  if (CHARACTER_VERSION === '2.6' && !V2) {
    const shown = new Set(Object.values(groups).flat());
    const additional = CHIBI26_ALL_ANIMS.filter(clip => !shown.has(clip));
    if (additional.length) groups['More clips'] = additional;
  }
  animChips.replaceChildren(...Object.entries(groups).map(([g, list]) => el('div', { class: 'anim-group', role: 'group', 'aria-label': g }, el('b', { text: g }), ...list.map(a => chip(a, cur)))));
}
const animSection = section('Animation', { id: 'anim', cls: 'a3-anim' }, animChips);
animSection.querySelector('summary').append(animNow);

// ---------- Starting looks: tabs ----------
const pick = (look, n) => { avatar = normalizeAvatar(look); name = n; changed(); syncUI(); };
const card = (look, label, extra = {}) => el('button', { type: 'button', class: 'card', title: label, ...extra, onclick: () => pick(look, label), html: renderSVG(look) + `<div>${label}</div>` });
const raceGrid = el('div', { class: 'presets' }, ...C2.presets.filter(p => p.race).map(p => card(p.avatar, p.name)));
const classGrid = el('div', { class: 'presets' });
for (const c of await loadClassRoster()) classGrid.append(card(c.avatar, c.name, { 'data-class': c.id, title: c.game === 'thousandvale' ? c.name + ' (Thousandvale only)' : c.name }));
const presetGrid = el('div', { class: 'presets' }, ...DATA.presets.map(p => card(p.avatar, p.name)));
const TABS = [['races', 'Races', raceGrid], ['classes', 'Classes (all games)', classGrid], ['presets', 'Presets (shared with Avatar 2D)', presetGrid]];
const tabList = el('div', { class: 'a3-tabs', role: 'tablist', 'aria-label': 'Starting looks' });
const tabPanels = el('div');
let tabNow = store.get('tab', 'races');
function showTab(id, focus = false) {
  tabNow = id; store.set('tab', id);
  for (const b of tabList.children) { const on = b.dataset.tab === id; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); }
  for (const p of tabPanels.children) p.hidden = p.dataset.tab !== id;
}
for (const [id, label, grid] of TABS) {
  tabList.append(el('button', { type: 'button', role: 'tab', id: 'tab-' + id, 'aria-controls': 'tabp-' + id, 'data-tab': id, text: label, onclick: () => showTab(id) }));
  tabPanels.append(el('div', { role: 'tabpanel', id: 'tabp-' + id, 'aria-labelledby': 'tab-' + id, 'data-tab': id }, grid));
}
tabList.addEventListener('keydown', e => { const ids = TABS.map(t => t[0]); const i = ids.indexOf(tabNow); if (e.key === 'ArrowRight') showTab(ids[(i + 1) % ids.length], true); else if (e.key === 'ArrowLeft') showTab(ids[(i - 1 + ids.length) % ids.length], true); else return; e.preventDefault(); });
main.append(animSection, section('Starting looks', { id: 'looks', hint: 'click one to load it' }, tabList, tabPanels));
showTab(TABS.some(t => t[0] === tabNow) ? tabNow : 'races');

async function rebuild() {
  if (building) { pending = true; return; } building = true; setStatus('building…'); syncVersionUi();
  try {
    flame?.dispose(); flame = null;
    if (character) { scene.scene.remove(character.group); character.dispose(); character = null; }
    if (comparisonCharacter) { scene.scene.remove(comparisonCharacter.group); comparisonCharacter.dispose(); comparisonCharacter = null; }
    const keepAnim = lastAnim;
    const buildStart = performance.now();
    const v26 = !V2 && CHARACTER_VERSION === '2.6';
    const next = await (v26 ? createChibi26Character : createChibi2Character)(avatar, { anims: v26 ? CHIBI26_ALL_ANIMS : [...CHIBI2_EVERY_ANIMS, ...CHIBI2_MUSIC_ANIMS], v25: !V2, graphics: GRAPHICS_QUALITY });
    const buildMs = performance.now() - buildStart;
    character = next; flame = attachHeldFlame(character, avatar);
    scene.scene.add(character.group); character.setAnim(clipOk(keepAnim, v26) ? keepAnim : 'idle'); character.setHandsFree?.(handsFreeCb.value);
    let comparisonBuildMs = 0;
    if (!V2 && SIDE_BY_SIDE) {
      character.group.position.x = CHARACTER_VERSION === '2.5' ? -0.55 : 0.55;
      const compareStart = performance.now();
      comparisonCharacter = CHARACTER_VERSION === '2.5'
        ? await createChibi26Character(avatar, { anims: CHIBI26_ALL_ANIMS, graphics: GRAPHICS_QUALITY })
        : await createChibi2Character(avatar, { anims: [...CHIBI2_EVERY_ANIMS, ...CHIBI2_MUSIC_ANIMS], v25: true });
      comparisonBuildMs = performance.now() - compareStart;
      comparisonCharacter.group.position.x = CHARACTER_VERSION === '2.5' ? 0.55 : -0.55;
      scene.scene.add(comparisonCharacter.group); comparisonCharacter.setAnim(character.anim);
    }
    renderAnims();
    const row = (label, c, ms) => {
      const s = c.stats(); let v = 0; c.group.traverse(o => { if (o.isMesh) v += o.geometry.attributes.position?.count || 0; });
      const m = c.metrics?.();
      return { label, tris: s.triangles, verts: v, calls: s.meshes, bones: s.bones, ms, h: m?.totalHeight, head: m?.headHeight };
    };
    const versionLabel = V2 ? 'Chibi 2 (v2)' : `Chibi ${CHARACTER_VERSION}`;
    const rows = [row(versionLabel, character, buildMs)];
    if (comparisonCharacter) rows.push(row(CHARACTER_VERSION === '2.5' ? '2.6' : '2.5', comparisonCharacter, comparisonBuildMs));
    drawStats(rows);
    // one plain-text line too (tests and the status read it)
    setStatus(rows.map((r, i) => i === 0
      ? `${r.label}: ${r.tris.toLocaleString()} triangles · ${r.verts.toLocaleString()} vertices · ${r.calls} draw calls · ${r.bones} bones · ${r.ms.toFixed(1)} ms`
      : `${r.label}: ${r.tris.toLocaleString()} tris · ${r.verts.toLocaleString()} verts · ${r.calls} calls · ${r.bones} bones · ${r.ms.toFixed(1)} ms`).join(' · '));
  } catch (e) { console.error(e); setStatus('error: ' + e.message); toast(e.message); }
  building = false; if (pending) { pending = false; rebuild(); }
}
function clipOk(clip, v26) { return clip && (v26 ? CHIBI26_ALL_ANIMS : [...CHIBI2_EVERY_ANIMS, ...CHIBI2_MUSIC_ANIMS]).includes(clip); }
let lastAnim = null; // re-applied after a rebuild so editing a look does not reset the clip being reviewed
function drawStats(rows) {
  const head = el('tr', {}, ...['', 'Triangles', 'Vertices', 'Draw calls', 'Bones', 'Build', 'Height', 'Head'].map(t => el('th', { scope: 'col', text: t })));
  const body = rows.map(r => el('tr', {}, el('th', { scope: 'row', text: r.label }), ...[r.tris.toLocaleString(), r.verts.toLocaleString(), r.calls, r.bones, r.ms.toFixed(0) + ' ms', r.h ? r.h.toFixed(2) + ' m' : '—', r.head ? r.head.toFixed(2) + ' m' : '—'].map(t => el('td', { text: String(t) }))));
  statsStrip.replaceChildren(el('table', { class: 'small' }, el('caption', { class: 'sr-only', text: 'Measured numbers for the character on screen' }), el('thead', {}, head), el('tbody', {}, ...body)));
}
let flame = null;
scene.addTicker((dt, t) => { if (character) lastAnim = character.anim; character?.update(dt, t); comparisonCharacter?.update(dt, t); flame?.update(dt); });
/** Kept for old callers and tests: there is one renderer now. */
function setMode() { rebuild(); }

// ---------- left: the character, one section per part ----------
const left = document.getElementById('left');
left.append(el('h2', { class: 'sr-only', text: 'Character options' }));
const slotEls = {};
function slotRow(slot, label = SLOT_LABELS[slot]) {
  const get = () => (slot === 'headShape' ? avatar.headShape : avatar[slot].id);
  const set = v => { if (slot === 'headShape') avatar.headShape = v; else avatar[slot].id = v; changed(); };
  const extra = OUTFIT25[slot] ? new Set(Object.keys(OUTFIT25[slot])) : null;
  const ids = partIds(slot).filter(id => !V2 || !extra?.has(id));
  const sel = selectEl(ids.map(id => [id, PARTS[slot][id].name || id]), get(), set, label);
  const sw = COLOR_SLOTS[slot] ? colorSwatch(() => avatar[slot].color, v => { avatar[slot].color = v; changed(); }, label) : null;
  slotEls[slot] = { sel, sw }; return field(label, sel, sw);
}
// the 2.5 extra fields (CHIBI25_OPTIONS.fields), drawn beside the part they belong to; "default" deletes the key
const FIELD_LABELS = { 'eyes.pupil': 'Pupil', 'eyes.iris': 'Iris', 'eyes.white': 'Eye white', 'eyes.colorR': 'Right eye colour', 'eyes.blink': 'Blinks', 'eyes.height': 'Eye shape height', 'brows.thick': 'Brow thickness', 'brows.color': 'Brow colour', 'mouth.color': 'Lip colour', 'ears.scale': 'Ear size', 'facialHair.color': 'Beard colour', 'hair.color2': 'Hair 2nd colour' };
const extraEls = [];
function extraFields(slot) {
  if (V2) return [];
  const out = [];
  for (const [key, spec] of Object.entries(CHIBI25_OPTIONS.fields[slot] || {})) {
    const label = FIELD_LABELS[slot + '.' + key] || nice(key);
    const cur = () => avatar[slot]?.[key];
    const put = v => { avatar[slot] = avatar[slot] || {}; if (v === undefined) delete avatar[slot][key]; else avatar[slot][key] = v; changed(); };
    let control, extra = null, sync;
    if (spec.ids) {
      control = selectEl([['', `Default (${spec.names?.[spec.default] || spec.default})`], ...spec.ids.map(id => [id, spec.names?.[id] || id])], cur() ?? '', v => put(v === '' ? undefined : v), label);
      sync = () => control.set(cur() ?? '');
    } else if (spec.type === 'color') {
      const sw = colorSwatch(() => cur() || spec.default || '#888888', v => put(v), label);
      control = el('span', { class: 'a3-inline' }, sw, button('Reset', () => { put(undefined); sw.sync(); }, 'small'));
      control.querySelector('button.small').setAttribute('aria-label', 'Reset ' + label.toLowerCase());
      sync = () => sw.sync();
    } else if (spec.type === 'range') {
      control = knob(label, { min: spec.min, max: spec.max, step: spec.step || 0.05, value: cur() ?? spec.default }, v => put(v));
      sync = () => control.set(cur() ?? spec.default);
      if (spec.note) control.title = spec.note;
      const row = el('div', { class: 'c25-details' }, control); extraEls.push(sync); out.push(row); continue;
    } else if (spec.type === 'boolean') {
      control = checkbox(label, cur() ?? spec.default, v => put(v));
      sync = () => control.set(cur() ?? spec.default);
      if (spec.note) control.title = spec.note;
      extraEls.push(sync); out.push(el('div', { class: 'c25-details' }, control)); continue;
    } else continue;
    if (spec.note) control.title = spec.note;
    extraEls.push(sync);
    out.push(field(label, control, null, { only25: true }));
  }
  return out;
}

// body: the base dials (every version) then the 2.5 body fields (shape, posture, shoulders, legs, arms, tail)
const bodyKnobs = {};
const KNOB_LABELS = { height: 'Height', width: 'Width', headSize: 'Head size', round: 'Roundness' };
for (const k of ['height', 'width', 'headSize']) bodyKnobs[k] = knob(KNOB_LABELS[k], { min: 0, max: 1, step: 0.01, value: avatar.body[k] }, v => { avatar.body[k] = v; changed(); });
bodyKnobs.round = knob('Roundness', { min: 0, max: 1, step: 0.01, value: roundOf(avatar), title: 'A belly, wider hips, thicker limbs. Unset is the race default.' }, v => { avatar.body.round = v; changed(); });
for (const [k, kn] of Object.entries(bodyKnobs)) kn.dataset.key = k;
const B25 = CHIBI25_BODY_OPTIONS;
const raceSel = selectEl(CHIBI2_RACE_IDS.map(id => [id, CHIBI2_RACES[id].name || CHIBI2_RACES[id].label]), avatar.body.race || 'human', v => {
  avatar.body.race = v; delete avatar.body.round;
  const tail = B25.raceTails?.[v]?.[0]; if (!V2 && tail && (!avatar.body.tail || avatar.body.tail === 'none')) avatar.body.tail = tail;   // a race's own tail first
  changed(); syncUI();
}, 'Race');
const formSel = selectEl([['masc', 'Masculine'], ['fem', 'Feminine']], avatar.body.form || 'masc', v => { avatar.body.form = v; changed(); }, 'Body form');
const chestSel = selectEl([['flat', 'Flat'], ['round', 'Round']], avatar.body.chestSize || 'flat', v => { avatar.body.chestSize = v; changed(); }, 'Chest size');
const bodyPick = (key, spec, label) => { const s = selectEl(spec.ids.map(id => [id, spec.names?.[id] || id]), avatar.body[key] || spec.ids[0], v => { avatar.body[key] = v; changed(); }, label); s.key = key; return s; };
const shapeSel = bodyPick('shape', B25.shape, 'Body shape'), postureSel = bodyPick('posture', B25.posture, 'Posture'), tailSel = bodyPick('tail', B25.tail, 'Tail');
const bodySliders = {};
for (const k of ['shoulders', 'legs', 'arms']) { const spec = B25.sliders[k]; bodySliders[k] = knob({ shoulders: 'Shoulders', legs: 'Leg length', arms: 'Arm thickness' }[k], { min: spec.min, max: spec.max, step: 0.05, value: avatar.body[k] ?? spec.default, title: spec.note }, v => { avatar.body[k] = v; changed(); }); }
const skinSw = colorSwatch(() => avatar.body.skin, v => { avatar.body.skin = v; changed(); }, 'Skin');
const tailSw = colorSwatch(() => avatar.body.tailColor || avatar.hair?.color || '#6b4a2a', v => { avatar.body.tailColor = v; changed(); }, 'Tail');
const cheeksCb = checkbox('Round cheeks', !!avatar.body.cheeks, v => { avatar.body.cheeks = v; changed(); });
const faceKnobs = {}; const faceKnob = (slot, key, label, min, max, step) => { const k = knob(label, { min, max, step, value: avatar[slot][key] ?? 0 }, v => { avatar[slot][key] = v; changed(); }); faceKnobs[slot + '.' + key] = k; return k; };
const sub = t => el('h3', { class: 'a3-sub', text: t });
left.append(
  section('Body', { id: 'body' },
    field('Race', raceSel), field('Body form', formSel), field('Chest size', chestSel),
    ...(V2 ? [] : [field('Body shape', shapeSel, null, { only25: true }), field('Posture', postureSel, null, { only25: true })]),
    field('Skin', el('span', { class: 'a3-inline' }, skinSw), null), el('div', { class: 'a3-check' }, cheeksCb),
    sub('Proportions'), bodyKnobs.height, bodyKnobs.width, bodyKnobs.headSize, bodyKnobs.round,
    ...(V2 ? [] : [el('div', { class: 'c25-details' }, bodySliders.shoulders, bodySliders.legs, bodySliders.arms), field('Tail', tailSel, tailSw, { only25: true })])),
  section('Head and hair', { id: 'head' },
    slotRow('headShape'), slotRow('hair'), ...extraFields('hair'), slotRow('ears'), ...extraFields('ears'),
    slotRow('facialHair'), ...extraFields('facialHair'), slotRow('extras'), slotRow('hat')),
  section('Face', { id: 'face' },
    sub('Eyes'), slotRow('eyes'), ...extraFields('eyes'),
    faceKnob('eyes', 'x', 'Eye spacing', -1, 1, 0.05), faceKnob('eyes', 'y', 'Eye position', -1, 1, 0.05), faceKnob('eyes', 'scale', 'Eye size', 0.5, 1.6, 0.05), faceKnob('eyes', 'rot', 'Eye tilt', -30, 30, 1),
    sub('Brows, nose, mouth'), slotRow('brows'), ...extraFields('brows'), slotRow('nose'), slotRow('mouth'), ...extraFields('mouth'),
    faceKnob('mouth', 'y', 'Mouth position', -1, 1, 0.05), faceKnob('mouth', 'scale', 'Mouth size', 0.5, 1.8, 0.05)),
  section('Outfit', { id: 'outfit' },
    slotRow('top'), field('Top 2nd colour', el('span'), colorSwatch(() => avatar.top.color2, v => { avatar.top.color2 = v; changed(); }, 'Top 2nd')),
    slotRow('bottom'), slotRow('shoes'), slotRow('accessory'), slotRow('cape')),
  section('Held and gear', { id: 'gear' }, slotRow('held', 'Right hand'), slotRow('offhand', 'Left hand'), slotRow('decor')),
);

// ---------- right: 2D preview + JSON ----------
const right = document.getElementById('right');
const mini2d = el('div', { class: 'mini2d', role: 'img', 'aria-label': 'The same character drawn in 2D' });
const nameIn = textInput('Name', name, v => { name = v; store.set('name', v); renderJson(); });
const jsonArea = el('textarea', { id: 'json', 'aria-label': 'Character JSON', spellcheck: 'false' });
function renderJson() { jsonArea.value = JSON.stringify({ schema: 1, name, avatar }, null, 2); }
const applyJson = j => { avatar = normalizeAvatar(j.avatar || j); if (j.name) { name = j.name; nameIn.set(name); } changed(); syncUI(); };
right.append(
  section('Same character in 2D', { id: '2d' }, el('p', { class: 'small muted', text: 'One JSON, two renderers.' }), mini2d),
  section('Character JSON', { id: 'json' }, nameIn, jsonArea,
    el('div', { class: 'row' }, button('Apply', () => { try { applyJson(JSON.parse(jsonArea.value)); } catch { toast('Bad JSON'); } }, 'small'), button('Copy', () => copyText(jsonArea.value), 'small'), button('Export', () => downloadJSON({ schema: 1, name, avatar }, slug(name) + '.avatar.json'), 'small'), button('Import', async () => { try { applyJson(await readJSONFile()); } catch { toast('Import failed'); } }, 'small'))),
);

// ---------- behaviour ----------
let rebuildTimer;
function changed() { store.set('current', avatar); renderJson(); mini2d.innerHTML = renderSVG(avatar); clearTimeout(rebuildTimer); rebuildTimer = setTimeout(rebuild, 150); }
function syncUI() {
  for (const s in slotEls) { slotEls[s].sel.set(s === 'headShape' ? avatar.headShape : avatar[s].id); slotEls[s].sw?.sync?.(); }
  for (const k in bodyKnobs) bodyKnobs[k].set(k === 'round' ? roundOf(avatar) : avatar.body[k]);
  for (const [k, kn] of Object.entries(bodySliders)) kn.set(avatar.body[k] ?? B25.sliders[k].default);
  raceSel.set(avatar.body.race || 'human'); formSel.set(avatar.body.form || 'masc'); chestSel.set(avatar.body.chestSize || 'flat');
  for (const s of [shapeSel, postureSel, tailSel]) s.set(avatar.body[s.key] || B25[s.key].ids[0]);
  cheeksCb.set(!!avatar.body.cheeks); skinSw.sync(); tailSw.sync();
  for (const [k, kn] of Object.entries(faceKnobs)) { const [slot, key] = k.split('.'); kn.set(avatar[slot][key] ?? 0); }
  for (const f of extraEls) f();
  nameIn.set(name); renderJson(); mini2d.innerHTML = renderSVG(avatar);
}
function rnd(only) {
  // race-weighted: a dwarf rolls beards and heavy boots, an elf pointed ears and long hair — but a human can still roll pointed ears, just rarely
  const race = avatar.body.race || 'human', seed = Math.floor(Math.random() * 1e9);
  avatar = randomChibi2(randomAvatar, DATA, { race, seed, base: only ? avatar : null, only, makeRng, known: (slot, id) => !!PARTS[slot]?.[id] });
  if (!only) name = CHIBI2_RACES[race].name + ' ' + Math.floor(Math.random() * 900 + 100);
  changed(); syncUI();
}
// R = random character (not while typing in a field)
document.addEventListener('keydown', e => { if (e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.target.closest?.('input, textarea, select, [contenteditable]')) rnd(null); });
function slug(s) { return String(s || 'character').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'character'; }
markNav(); syncVersionUi(); syncUI(); setMode(mode);
window.avatar3d = { randomize: rnd, get avatar() { return avatar; }, get character() { return character; }, get mode() { return mode; }, setMode, set: a => { avatar = normalizeAvatar(a); changed(); syncUI(); }, scene, rebuild, isBuilding: () => building };
