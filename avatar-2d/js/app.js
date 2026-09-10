// Avatar 2D builder UI. The renderer (render.js), catalog (parts/) and random generator (random.js) are what a game reuses.
import { el, knob, select, button, panel, toast, downloadJSON, copyText, readJSONFile, textInput, checkbox } from '../../shared/ui.js';
import { makeStore } from '../../shared/store.js';
import { renderSVG, normalizeAvatar, DEFAULT_AVATAR, bodyMetrics } from './render.js';
import { PARTS, SLOTS, SLOT_LABELS, COLOR_SLOTS, partIds } from './parts/index.js';
import { randomAvatar } from './random.js';

const store = makeStore('avatar-2d', 1);
const DATA = await (await fetch('data/presets.json')).json();
let avatar = normalizeAvatar(store.get('current', DATA.presets[0].avatar));
let name = store.get('name', 'Villager');
const status = document.getElementById('status');

// ---------- middle: preview + actions + presets ----------
const main = document.getElementById('main');
const preview = el('div', { id: 'preview' });
const anchorsCb = checkbox('Show anchors', false, () => draw());
const raceSel = select('Race rules', ['any', ...Object.keys(DATA.raceRules)], 'any');
const seedIn = textInput('Seed', '', null, { placeholder: 'blank = random' });
const rnd = (only) => { const seed = seedIn.value.trim() ? hash(seedIn.value.trim()) : undefined; avatar = randomAvatar(DATA, { race: raceSel.value === 'any' ? null : raceSel.value, seed, base: only ? avatar : null, only }); if (!only) name = (raceSel.value === 'any' ? 'Random' : raceSel.value) + ' ' + Math.floor(Math.random() * 900 + 100); changed(); syncUI(); };
const actions = el('div', { class: 'row' }, button('🎲 Random', () => rnd(null), 'primary'), button('Random face', () => rnd('face')), button('Random outfit', () => rnd('outfit')), button('Random body', () => rnd('body')), raceSel, seedIn);
const exportRow = el('div', { class: 'row' }, button('⬇ PNG', () => exportPNG(), 'small'), button('⬇ SVG', () => { const blob = new Blob([renderSVG(avatar, { width: 600, height: 800 })], { type: 'image/svg+xml' }); const a = el('a', { href: URL.createObjectURL(blob), download: slug(name) + '.svg' }); document.body.append(a); a.click(); a.remove(); }, 'small'), button('Copy SVG markup', () => copyText(renderSVG(avatar)), 'small'), anchorsCb);
const presetGrid = el('div', { class: 'presets' });
for (const p of DATA.presets) presetGrid.append(el('div', { class: 'card', title: p.race, onclick: () => { avatar = normalizeAvatar(p.avatar); name = p.name; changed(); syncUI(); toast('Loaded ' + p.name); }, html: renderSVG(p.avatar) + `<div>${p.name}</div>` }));
const galleryHost = el('div');
const gallerySel = select('Show every part of', SLOTS.map(s => ({ value: s, label: SLOT_LABELS[s] })), 'hair', renderGallery);
function renderGallery() { const slot = gallerySel.value; galleryHost.replaceChildren(el('div', { class: 'gallery' }, ...partIds(slot).map(id => { const a = JSON.parse(JSON.stringify(avatar)); if (slot === 'headShape') a.headShape = id; else a[slot].id = id; return el('div', { class: 'g', onclick: () => { if (slot === 'headShape') avatar.headShape = id; else avatar[slot].id = id; changed(); syncUI(); }, html: renderSVG(a) + `<div>${id}</div>` }); }))); }
const galleryPanel = panel('Part gallery (current character wearing each option)', gallerySel, galleryHost); galleryPanel.classList.add('closed'); gallerySel.select.addEventListener('change', () => galleryPanel.classList.remove('closed'));
galleryPanel.querySelector('h3').addEventListener('click', () => { if (!galleryPanel.classList.contains('closed') && !galleryHost.children.length) renderGallery(); });
main.append(el('div', { class: 'panel' }, preview, actions, exportRow), panel('Presets', presetGrid), galleryPanel);

// ---------- left: slots + colours + body ----------
const left = document.getElementById('left');
const slotEls = {};
function slotRow(slot) {
  const ids = partIds(slot); const get = () => (slot === 'headShape' ? avatar.headShape : avatar[slot].id); const set = v => { if (slot === 'headShape') avatar.headShape = v; else avatar[slot].id = v; changed(); sel.value = v; };
  const sel = el('select', { onchange: () => set(sel.value) }, ...ids.map(id => el('option', { value: id, text: PARTS[slot][id].name || id })));
  const step = d => { const i = ids.indexOf(get()); set(ids[(i + d + ids.length) % ids.length]); };
  const sw = COLOR_SLOTS[slot] ? colorSwatch(() => avatar[slot].color, v => { avatar[slot].color = v; changed(); }) : el('span');
  const row = el('div', { class: 'slot-row' }, el('label', { text: SLOT_LABELS[slot] }), button('‹', () => step(-1)), sel, button('›', () => step(1)), sw);
  slotEls[slot] = { sel, sw }; return row;
}
function colorSwatch(get, set) { const input = el('input', { type: 'color' }); const b = el('button', { class: 'swatch', onclick: () => input.click() }, input); input.addEventListener('input', () => { set(input.value); b.style.background = input.value; }); b.sync = () => { const v = get() || '#000000'; input.value = v; b.style.background = v; }; b.sync(); return b; }
function paletteRow(colors, onPick) { return el('div', { class: 'palette' }, ...colors.map(c => el('div', { class: 'p', style: { background: c }, title: c, onclick: () => onPick(c) }))); }
const faceKnobs = {};
function faceKnob(slot, key, label, min, max, step) { const k = knob(label, { min, max, step, value: avatar[slot][key] ?? 0 }, v => { avatar[slot][key] = v; changed(); }); faceKnobs[slot + '.' + key] = k; return k; }
const bodyKnobs = {};
for (const k of ['height', 'width', 'headSize']) bodyKnobs[k] = knob(k, { min: 0, max: 1, step: 0.01, value: avatar.body[k] }, v => { avatar.body[k] = v; changed(); });
const skinSw = colorSwatch(() => avatar.body.skin, v => { avatar.body.skin = v; changed(); });
left.append(
  panel('Body', bodyKnobs.height, bodyKnobs.width, bodyKnobs.headSize, el('div', { class: 'row' }, el('label', { text: 'Skin' }), skinSw), paletteRow(DATA.palettes.skin, c => { avatar.body.skin = c; changed(); syncUI(); })),
  panel('Head', slotRow('headShape'), slotRow('hair'), paletteRow(DATA.palettes.hair, c => { avatar.hair.color = c; changed(); syncUI(); }), slotRow('ears'), slotRow('facialHair'), slotRow('extras')),
  panel('Face (Mii-style sliders)', slotRow('eyes'), paletteRow(DATA.palettes.eye, c => { avatar.eyes.color = c; changed(); syncUI(); }),
    el('div', { class: 'face-knobs' }, faceKnob('eyes', 'x', 'eye spacing', -1, 1, 0.05), faceKnob('eyes', 'y', 'eye height', -1, 1, 0.05), faceKnob('eyes', 'scale', 'eye size', 0.5, 1.6, 0.05), faceKnob('eyes', 'rot', 'eye tilt', -30, 30, 1)),
    slotRow('brows'), el('div', { class: 'face-knobs' }, faceKnob('brows', 'y', 'brow height', -1, 1, 0.05), faceKnob('brows', 'rot', 'brow tilt', -30, 30, 1), faceKnob('brows', 'x', 'brow spacing', -1, 1, 0.05)),
    slotRow('nose'), el('div', { class: 'face-knobs' }, faceKnob('nose', 'y', 'nose height', -1, 1, 0.05), faceKnob('nose', 'scale', 'nose size', 0.5, 1.8, 0.05)),
    slotRow('mouth'), el('div', { class: 'face-knobs' }, faceKnob('mouth', 'y', 'mouth height', -1, 1, 0.05), faceKnob('mouth', 'scale', 'mouth size', 0.5, 1.8, 0.05))),
  panel('Outfit', slotRow('top'), el('div', { class: 'row' }, el('label', { text: 'Top 2nd colour' }), colorSwatch(() => avatar.top.color2, v => { avatar.top.color2 = v; changed(); })), paletteRow(DATA.palettes.cloth, c => { avatar.top.color = c; changed(); syncUI(); }), slotRow('bottom'), slotRow('shoes'), slotRow('accessory'), slotRow('hat')),
);

// ---------- right: JSON + saved + catalog ----------
const right = document.getElementById('right');
const nameIn = textInput('Name', name, v => { name = v; store.set('name', v); renderJson(); });
const jsonArea = el('textarea', { id: 'json' });
function renderJson() { jsonArea.value = JSON.stringify({ schema: 1, name, avatar }, null, 2); }
const savedList = el('div', { class: 'saved' });
function renderSaved() { const saved = store.get('saved', {}); savedList.replaceChildren(...Object.entries(saved).map(([n, a]) => el('div', { class: 'card' }, el('div', { html: renderSVG(a) }), el('span', { style: { flex: 1 }, text: n }), button('Load', () => { avatar = normalizeAvatar(a); name = n; changed(); syncUI(); }, 'small'), button('✕', () => { delete saved[n]; store.set('saved', saved); renderSaved(); }, 'small')))); if (!Object.keys(saved).length) savedList.append(el('p', { class: 'muted small', text: 'Nothing saved yet.' })); }
const catalogTable = el('table', { class: 'catalog' }, el('tbody', {}, ...SLOTS.map(s => el('tr', {}, el('td', { text: s }), el('td', { text: partIds(s).join(', ') })))));
const catPanel = panel('Catalog (part ids for JSON)', catalogTable); catPanel.classList.add('closed');
right.append(
  panel('Character JSON (avatar section)', el('p', { class: 'small muted', text: 'Same shape is read by Avatar 3D. Paste into a game, or into Claude: "here is the wizard, add it".' }), nameIn, jsonArea,
    el('div', { class: 'row' }, button('Apply', () => { try { const j = JSON.parse(jsonArea.value); avatar = normalizeAvatar(j.avatar || j); if (j.name) { name = j.name; nameIn.set(name); } changed(); syncUI(); toast('Applied'); } catch (e) { toast('Bad JSON: ' + e.message); } }, 'small'), button('Copy', () => copyText(jsonArea.value), 'small'), button('Export', () => downloadJSON({ schema: 1, name, avatar }, slug(name) + '.avatar.json'), 'small'), button('Import', async () => { try { const j = await readJSONFile(); avatar = normalizeAvatar(j.avatar || j); if (j.name) { name = j.name; nameIn.set(name); } changed(); syncUI(); } catch { toast('Import failed'); } }, 'small')),
    button('Save to browser', () => { const saved = store.get('saved', {}); saved[name || 'unnamed'] = avatar; store.set('saved', saved); renderSaved(); toast('Saved ' + name); }, 'small')),
  panel('Saved characters', savedList), catPanel);

// ---------- behaviour ----------
function draw() { preview.innerHTML = renderSVG(avatar, { showAnchors: anchorsCb.value }); }
function changed() { store.set('current', avatar); draw(); renderJson(); }
function syncUI() { for (const s of SLOTS) { slotEls[s].sel.value = s === 'headShape' ? avatar.headShape : avatar[s].id; slotEls[s].sw.sync?.(); } for (const k in bodyKnobs) bodyKnobs[k].set(avatar.body[k]); skinSw.sync(); for (const [k, kn] of Object.entries(faceKnobs)) { const [slot, key] = k.split('.'); kn.set(avatar[slot][key] ?? 0); } nameIn.set(name); renderJson(); draw(); if (!galleryPanel.classList.contains('closed')) renderGallery(); }
function exportPNG() { const svg = renderSVG(avatar, { width: 600, height: 800 }); const img = new Image(); img.onload = () => { const c = el('canvas', { width: 600, height: 800 }); c.getContext('2d').drawImage(img, 0, 0); const a = el('a', { href: c.toDataURL('image/png'), download: slug(name) + '.png' }); document.body.append(a); a.click(); a.remove(); }; img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); }
function slug(s) { return String(s || 'character').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'character'; }
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
renderSaved(); syncUI();
status.textContent = SLOTS.map(s => partIds(s).length).reduce((a, b) => a + b, 0) + ' parts · ' + DATA.presets.length + ' presets';
window.avatar2d = { get avatar() { return avatar; }, set: a => { avatar = normalizeAvatar(a); changed(); syncUI(); }, renderSVG, randomAvatar: (o) => randomAvatar(DATA, o), DATA, PARTS, SLOTS, bodyMetrics };
