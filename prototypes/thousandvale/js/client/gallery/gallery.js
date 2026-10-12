// UI gallery — the page around the frame: the scene list (left), the device frame (middle), the notes (right).
// The frame itself is ui-gallery-frame.html in an <iframe> sized to the device, so the game's stylesheets see the
// device's real viewport (media queries, vw / vh, fixed positions). State lives in the address:
//   ui-gallery.html#scene=perks&device=phone-l&layout=proposed&variant=a&glyphs=xbox
import { SCENES, GROUPS, DEVICES, deviceById, sceneById, sceneFits } from './scenes.js';

const $ = id => document.getElementById(id);
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids.filter(k => k != null)); return e; };
const read = () => { const p = new URLSearchParams(location.hash.slice(1)); const device = deviceById(p.get('device') || 'desktop').id; return { scene: sceneById(p.get('scene'))?.id || 'hud', device, layout: p.get('layout') || (device === 'desktop' || device === 'laptop' ? 'current' : 'proposed'), variant: p.get('variant') === 'b' ? 'b' : 'a', glyphs: p.get('glyphs') || 'xbox', safe: p.get('safe') === '1' }; };
let S = read();
const write = () => { const p = new URLSearchParams({ scene: S.scene, device: S.device }); const d = deviceById(S.device); if (d.phone || d.pad) p.set('layout', S.layout); if (d.phone && S.layout === 'proposed') p.set('variant', S.variant); if (d.pad) p.set('glyphs', S.glyphs); if (S.safe && d.phone) p.set('safe', '1'); const h = '#' + p; if (location.hash !== h) history.replaceState(null, '', h); };
const frameUrl = () => { const d = deviceById(S.device); const p = new URLSearchParams({ scene: S.scene, device: S.device, layout: d.phone || d.pad ? S.layout : 'current' }); if (d.phone) p.set('variant', S.variant); if (d.pad) p.set('glyphs', S.glyphs); if (S.safe && d.phone) p.set('safe', '1'); return 'ui-gallery-frame.html?' + p; };

// a phone opening the gallery gets the scenes full-screen, with a picker (no frame inside a frame)
if (Math.min(innerWidth, innerHeight) < 500 && matchMedia('(pointer: coarse)').matches) location.replace('ui-gallery-frame.html?scene=' + S.scene + '&device=auto&layout=' + (new URLSearchParams(location.hash.slice(1)).get('layout') || 'proposed'));

function seg(host, items, cur, on) {
  host.replaceChildren(...items.map(([id, label, tip]) => { const b = el('button', { type: 'button', textContent: label, title: tip || '' }); b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(id === cur)); b.onclick = () => on(id); return b; }));
}
function drawTop() {
  const d = deviceById(S.device);
  seg($('g-devices'), DEVICES.map(x => [x.id, x.label.replace('iPhone 15 Pro — ', 'Phone, ').replace(' (desktop frame)', '')]), S.device, id => { const was = deviceById(S.device), now = deviceById(id); S.device = id; if (!(now.phone || now.pad)) S.layout = 'current'; else if (!(was.phone || was.pad)) S.layout = 'proposed'; if (!sceneFits(sceneById(S.scene), id)) S.scene = 'hud'; go(); });
  $('g-layout').hidden = !(d.phone || d.pad);
  seg($('g-layout'), d.pad ? [['current', 'Keyboard hints'], ['proposed', 'Controller hints']] : [['current', 'Today', 'The game as it is, on a phone-sized screen'], ['proposed', 'Proposed', 'The phone layout (a proposal — off in the game)']], S.layout, id => { S.layout = id; go(); });
  $('g-variant').hidden = !(d.phone && S.layout === 'proposed');
  seg($('g-variant'), [['a', 'A — arcs', 'Skills on two arcs round the attack button; the stick appears under your thumb'], ['b', 'B — grid', 'On its side: skills in a flat 2 × 4 grid; the stick stays put']], S.variant, id => { S.variant = id; go(); });
  $('g-glyphs').hidden = !(d.pad && S.layout === 'proposed');
  seg($('g-glyphs'), [['xbox', 'Xbox'], ['playstation', 'PlayStation'], ['generic', 'Generic']], S.glyphs, id => { S.glyphs = id; go(); });
  $('g-safe-wrap').hidden = !d.phone; $('g-safe').checked = S.safe;
}
function drawList() {
  const f = $('g-find').value.trim().toLowerCase();
  $('g-scenes').replaceChildren(...GROUPS.flatMap(g => {
    const list = SCENES.filter(s => s.group === g && (!f || (s.title + ' ' + s.id).toLowerCase().includes(f)));
    if (!list.length) return [];
    return [el('h3', { textContent: g }), ...list.map(s => { const a = el('a', { href: '#scene=' + s.id, textContent: s.title, className: (s.id === S.scene ? 'on ' : '') + (sceneFits(s, S.device) ? '' : 'off') }); a.onclick = e => { e.preventDefault(); if (!sceneFits(s, S.device)) S.device = s.only[0]; S.scene = s.id; if (deviceById(S.device).phone || deviceById(S.device).pad) S.layout = S.layout || 'proposed'; go(); }; return a; })];
  }));
}
function drawNotes(extra = null) {
  const s = sceneById(S.scene), d = deviceById(S.device);
  $('n-title').textContent = s.title;
  const key = d.phone ? 'phone' : d.pad ? 'pad' : 'desktop';
  const blocks = [];
  if (s.notes?.all) blocks.push(el('p', { textContent: s.notes.all }));
  const mine = s.notes?.[key];
  if (mine) blocks.push(el('h3', { textContent: d.phone ? (S.layout === 'proposed' ? 'On a phone — the proposal' : 'On a phone — the proposal (switch to “Proposed” to see it)') : d.pad ? 'With a controller' : 'On a desktop' }), ...mine.split('\n').map(t => el('p', { textContent: t })));
  for (const k of ['phone', 'pad']) if (k !== key && s.notes?.[k]) blocks.push(el('details', {}, el('summary', { textContent: k === 'phone' ? 'On a phone' : 'With a controller' }), ...s.notes[k].split('\n').map(t => el('p', { textContent: t }))));
  $('n-notes').replaceChildren(...blocks);
  $('n-modules').replaceChildren(...(s.modules || []).map(m => el('li', {}, el('a', { href: m, target: '_blank', rel: 'noopener', textContent: m }))), el('li', { className: 'n-small', textContent: 'plus the game’s own stylesheets and index.html’s markup' }));
  $('n-link').value = location.href;
  $('n-errors').replaceChildren(...(extra?.errors?.length ? [el('h3', { textContent: 'Problems in this scene' }), el('ul', { className: 'n-bad' }, ...extra.errors.map(t => el('li', { textContent: t })))] : []));
}
function fit() {
  const d = deviceById(S.device), stage = $('g-stage'), fr = $('g-frame');
  const pad = d.phone ? 14 : 0;
  const availW = stage.clientWidth - 24 - pad * 2, availH = stage.clientHeight - 56 - pad * 2;
  const k = Math.min(1, availW / d.w, availH / d.h);
  fr.style.width = d.w + 'px'; fr.style.height = d.h + 'px';
  fr.style.transform = `scale(${k.toFixed(4)})`;
  fr.style.marginRight = (d.w * (k - 1)) + 'px'; fr.style.marginBottom = (d.h * (k - 1)) + 'px';
  fr.className = 'g-frame' + (d.phone ? ' phone' : '') + (d.pad ? ' pad' : '');
  $('g-under').textContent = `${d.label} — ${d.w} × ${d.h} CSS px${k < 0.995 ? `, shown at ${Math.round(k * 100)}%` : ''}${d.safe ? ` · safe area: ${Object.entries(d.safe).filter(([, v]) => v).map(([n, v]) => `${n} ${v}`).join(', ')}` : ''}`;
}
let loaded = '';
function go() {
  write(); drawTop(); drawList(); drawNotes(); fit();
  const url = frameUrl();
  $('g-alone').href = url;
  if (url !== loaded) { loaded = url; $('g-stage').classList.add('loading'); $('g-iframe').src = url; }
}
addEventListener('message', e => { if (e.data?.gallery === 'ready') { $('g-stage').classList.remove('loading'); drawNotes(e.data); } });
addEventListener('hashchange', () => { S = read(); go(); });
addEventListener('resize', fit);
$('g-find').addEventListener('input', drawList);
$('g-safe').addEventListener('change', e => { S.safe = e.target.checked; go(); });
$('n-link').addEventListener('focus', e => e.target.select());
// left / right step through the scenes (when the frame does not have the keyboard)
addEventListener('keydown', e => { if (e.target.closest('input')) return; const list = SCENES.filter(s => sceneFits(s, S.device)); const i = list.findIndex(s => s.id === S.scene); if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); S.scene = list[(i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length].id; go(); document.querySelector('.g-list a.on')?.scrollIntoView({ block: 'nearest' }); } });
go();
