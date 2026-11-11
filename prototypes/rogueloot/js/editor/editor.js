// The zone editor (M11, ruling 15). Opens data/zones/<id>.json, draws it with the GAME's own zone view (so what you
// edit is what you play), and edits the readable shape lists in place. Tools:
//   Select  click a prop / spawn / chest / marker / shape point; drag to move; Delete removes; R turns a prop
//   Prop    pick a kind, click to place          Paint  pick a surface, drag a stroke (a path shape)
//   Hill    click and drag (radius), height in the panel (negative = hollow)
//   Water / Cliff / Scatter / Patrol   click points, Enter (or Finish) to close the shape
//   Spawn / Chest / Marker               click to place (settings in the panel)
// Check runs js/world/check.js; Save writes through the DEV server (Download works anywhere); Play-test opens the game
// in this zone. Undo/redo keep every edit.
import * as THREE from 'three';
import { buildArea } from '../world/zone.js';
import { checkZone } from '../world/check.js';
import { PROP_KIT } from '../world/props.js';
import { SURFACES } from '../world/zone.js';
import { buildZoneView } from '../client/zone-view.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const r1 = v => Math.round(v * 10) / 10;

// ---- view: the game's zone view under a top-down orthographic camera ------------------------------------------------
const canvas = $('#view'), renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene(); scene.fog = new THREE.Fog('#9fd2e8', 1e4, 1e5); scene.background = new THREE.Color('#9fd2e8');
scene.add(new THREE.HemisphereLight('#fff6dc', '#4b6a3a', 1.3)); const sun = new THREE.DirectionalLight('#ffe2b0', 2); sun.position.set(-30, 60, 20); scene.add(sun);
const cam = new THREE.OrthographicCamera(-50, 50, 50, -50, 0.1, 500); cam.position.set(0, 200, 0); cam.up.set(0, 0, -1); cam.lookAt(0, 0, 0);
const view = { scene, renderer, camera: cam, groundY: null };
let zoom = 70, panX = 0, panZ = 0;
function resize() { const w = canvas.clientWidth, h = canvas.clientHeight; renderer.setSize(w, h, false); const a = w / h; cam.left = -zoom * a; cam.right = zoom * a; cam.top = zoom; cam.bottom = -zoom; cam.position.set(panX, 200, panZ); cam.lookAt(panX, 0, panZ); cam.updateProjectionMatrix(); }
addEventListener('resize', resize);
const overlay = new THREE.Group(); scene.add(overlay);

// ---- state ------------------------------------------------------------------------------------------------------------
let zone = null, zoneGroup = null, tool = 'select', sel = null, undo = [], redo = [], drawing = null, dirty = false;
const settings = { prop: 'tree', surface: 'dirt', brush: 4, hillH: 2.5, spawnTag: 'pack', spawnLevel: 1, chestTier: 'chest', markerKind: 'waypoint', scatterKinds: 'tree,pine,bush', scatterN: 20, yaw: 0, scale: 1 };
const TOOLS = [['select', '↖ Select'], ['prop', '🌳 Prop'], ['paint', '🖌 Paint'], ['hill', '⛰ Hill'], ['water', '💧 Water'], ['cliff', '🪨 Cliff'], ['scatter', '🌲 Scatter'], ['spawn', '👹 Spawn'], ['patrol', '🚶 Patrol'], ['chest', '🧰 Chest'], ['marker', '📍 Marker']];

function edit(fn) { undo.push(JSON.stringify(zone)); if (undo.length > 120) undo.shift(); redo = []; fn(zone); dirty = true; rebuild(); }
function rebuild() {
  clearTimeout(rebuild.t);
  rebuild.t = setTimeout(() => {
    if (zoneGroup) { scene.remove(zoneGroup); zoneGroup.traverse(o => { o.geometry?.dispose?.(); }); }
    const area = buildArea(zone);
    zoneGroup = buildZoneView(view, area, { quality: 'high' });
    scene.fog.near = 1e4; scene.fog.far = 1e5;
    drawOverlay(); panel(); status(dirty ? 'unsaved changes' : '');
  }, 60);
}
function status(t) { $('#status').textContent = t; }

// ---- overlay: spawns, chests, markers, shapes -------------------------------------------------------------------------
const disc = (x, z, r, color, y = 0.3) => { const m = new THREE.Mesh(new THREE.CircleGeometry(r, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75, depthTest: false })); m.position.set(x, y + (view.groundY?.(x, z) || 0), z); m.renderOrder = 10; overlay.add(m); return m; };
const line = (pts, color, closed = false) => { const p = pts.map(([x, z]) => new THREE.Vector3(x, 0.4 + (view.groundY?.(x, z) || 0), z)); if (closed) p.push(p[0]); const g = new THREE.BufferGeometry().setFromPoints(p); const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color, depthTest: false })); l.renderOrder = 11; overlay.add(l); };
const TAG_COLOR = { pack: '#e2382c', patrol: '#ff9a2a', swarm: '#b03ae2' };
function drawOverlay() {
  if (!zone) return;
  overlay.clear(); $('#marks').innerHTML = '';
  for (const [i, s] of (zone.spawns || []).entries()) { disc(s.x, s.z, 1.6, TAG_COLOR[s.tag || 'pack']); label(s.x, s.z, `${s.tag || 'pack'} L${s.level ?? '?'}`, isSel('spawn', i)); if (s.route) line(s.route, '#ff9a2a'); }
  for (const [i, c] of (zone.chests || []).entries()) { disc(c.x, c.z, 1.1, '#ffd040'); label(c.x, c.z, c.tier, isSel('chest', i)); }
  for (const [i, m] of (zone.markers || []).entries()) { disc(m.x, m.z, 1.3, m.kind === 'start' ? '#3ecf5a' : '#4a8aff'); label(m.x, m.z, m.kind + (m.id ? ': ' + m.id : ''), isSel('marker', i)); }
  for (const [i, sc] of (zone.scatter || []).entries()) { if (sc.poly) line(sc.poly, isSel('scatter', i) ? '#ffffff' : '#2f6f2f', true); else if (sc.circle) line(circ(sc.circle), '#2f6f2f', true); }
  for (const w of zone.water || []) line(w.poly, '#1a6a9a', true);
  for (const c of zone.cliffs || []) line(c.path, '#5a4a3a');
  if (sel?.kind === 'prop') { const p = zone.props[sel.i]; if (p) disc(p.x, p.z, (PROP_KIT[p.k]?.r || 0.5) * (p.s || 1) + 0.4, '#ffffff', 0.2); }
  if (drawing?.pts?.length) line(drawing.pts, '#ffffff', drawing.closed);
  const [x0, z0, x1, z1] = zone.bounds; line([[x0, z0], [x1, z0], [x1, z1], [x0, z1]], '#ff3b2f', true);
}
const circ = ([x, z, r]) => Array.from({ length: 24 }, (_, i) => [x + Math.cos(i / 24 * 6.283) * r, z + Math.sin(i / 24 * 6.283) * r]);
const isSel = (kind, i) => sel?.kind === kind && sel.i === i;
const labels = [];
function label(x, z, text, on) { const el = document.createElement('span'); el.className = 'mk' + (on ? ' on' : ''); el.textContent = text; el.dataset.x = x; el.dataset.z = z; $('#marks').append(el); placeLabel(el); }
function placeLabel(el) { const v = new THREE.Vector3(+el.dataset.x, 0, +el.dataset.z).project(cam); el.style.left = (v.x * 0.5 + 0.5) * canvas.clientWidth + 'px'; el.style.top = (-v.y * 0.5 + 0.5) * canvas.clientHeight + 'px'; }

// ---- pointer: world position on the ground plane ----------------------------------------------------------------------
function worldAt(e) { const r = canvas.getBoundingClientRect(), nx = (e.clientX - r.left) / r.width * 2 - 1, ny = -((e.clientY - r.top) / r.height * 2 - 1); const v = new THREE.Vector3(nx, ny, 0).unproject(cam); return [r1(v.x), r1(v.z)]; }
function pickAt(x, z) {
  const near = (px, pz, r) => Math.hypot(px - x, pz - z) < r;
  for (const [kind, list, r] of [['marker', zone.markers, 2], ['chest', zone.chests, 1.6], ['spawn', zone.spawns, 2]]) for (let i = (list || []).length - 1; i >= 0; i--) if (near(list[i].x, list[i].z, r)) return { kind, i };
  let best = null, bd = 2.2;
  for (let i = 0; i < (zone.props || []).length; i++) { const p = zone.props[i], d = Math.hypot(p.x - x, p.z - z); if (d < Math.max(bd, (PROP_KIT[p.k]?.r || 0.5) * (p.s || 1)) && d < (best ? bd : Infinity)) { best = { kind: 'prop', i }; bd = d; } }
  if (best) return best;
  for (let i = 0; i < (zone.scatter || []).length; i++) { const sc = zone.scatter[i]; if (sc.poly && inPoly(x, z, sc.poly)) return { kind: 'scatter', i }; }
  return null;
}
const inPoly = (x, z, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, zi] = poly[i], [xj, zj] = poly[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };
const listOf = kind => ({ prop: 'props', spawn: 'spawns', chest: 'chests', marker: 'markers', scatter: 'scatter' }[kind]);

let drag = null, panning = null;
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId);
  if (e.button === 2 || e.button === 1 || (e.pointerType !== 'mouse' && tool === 'select' && !pickAt(...worldAt(e)))) { panning = { x: e.clientX, y: e.clientY, px: panX, pz: panZ }; return; }
  const [x, z] = worldAt(e);
  if (tool === 'select') { sel = pickAt(x, z); if (sel) { drag = { x, z, moved: false, snap: JSON.stringify(zone) }; } drawOverlay(); panel(); return; }
  if (tool === 'prop') return edit(Z => (Z.props ||= []).push({ k: settings.prop, x, z, ...(settings.yaw ? { yaw: settings.yaw } : {}), ...(settings.scale !== 1 ? { s: settings.scale } : {}) }));
  if (tool === 'spawn') return edit(Z => (Z.spawns ||= []).push({ x, z, level: settings.spawnLevel, ...(settings.spawnTag !== 'pack' ? { tag: settings.spawnTag } : {}) }));
  if (tool === 'chest') return edit(Z => (Z.chests ||= []).push({ x, z, tier: settings.chestTier, level: settings.spawnLevel }));
  if (tool === 'marker') return edit(Z => (Z.markers ||= []).push({ kind: settings.markerKind, x, z, ...(settings.markerKind !== 'start' ? { id: `${Z.id}_${settings.markerKind}${(Z.markers || []).length}` } : {}) }));
  if (tool === 'paint') { drawing = { kind: 'paint', pts: [[x, z]] }; return; }
  if (tool === 'hill') { drawing = { kind: 'hill', c: [x, z], r: 1 }; return; }
  if (['water', 'cliff', 'scatter', 'patrol'].includes(tool)) { drawing ||= { kind: tool, pts: [], closed: tool !== 'cliff' && tool !== 'patrol' }; drawing.pts.push([x, z]); drawOverlay(); panel(); }
});
canvas.addEventListener('pointermove', e => {
  if (panning) { const k = zoom * 2 / canvas.clientHeight; panX = panning.px - (e.clientX - panning.x) * k; panZ = panning.pz - (e.clientY - panning.y) * k; resize(); drawOverlay(); return; }
  const [x, z] = worldAt(e);
  if (drag && sel) { const it = zone[listOf(sel.kind)][sel.i]; if (sel.kind === 'scatter') return; it.x = r1(it.x + x - drag.x); it.z = r1(it.z + z - drag.z); drag.x = x; drag.z = z; drag.moved = true; drawOverlay(); return; }
  if (drawing?.kind === 'paint') { const last = drawing.pts[drawing.pts.length - 1]; if (Math.hypot(last[0] - x, last[1] - z) > 1.5) { drawing.pts.push([x, z]); drawOverlay(); } }
  if (drawing?.kind === 'hill') drawing.r = Math.max(2, r1(Math.hypot(x - drawing.c[0], z - drawing.c[1])));
  status(`x ${x}  z ${z}`);
});
canvas.addEventListener('pointerup', () => {
  if (panning) { panning = null; return; }
  if (drag) { if (drag.moved) { undo.push(drag.snap); redo = []; dirty = true; rebuild(); } drag = null; return; }
  if (drawing?.kind === 'paint') { const pts = drawing.pts; drawing = null; edit(Z => (Z.surfaces ||= []).push(pts.length > 1 ? { s: settings.surface, path: pts, width: settings.brush * 2 } : { s: settings.surface, circle: [...pts[0], settings.brush] })); }
  if (drawing?.kind === 'hill') { const d = drawing; drawing = null; edit(Z => (Z.heights ||= []).push({ hill: [...d.c, d.r, settings.hillH] })); }
});
canvas.addEventListener('wheel', e => { e.preventDefault(); zoom = Math.max(8, Math.min(220, zoom * (1 + Math.sign(e.deltaY) * 0.1))); resize(); drawOverlay(); }, { passive: false });
function finishShape() {
  const d = drawing; if (!d) return; drawing = null;
  if (d.pts.length < (d.closed ? 3 : 2)) { drawOverlay(); return; }
  if (d.kind === 'water') edit(Z => (Z.water ||= []).push({ poly: d.pts }));
  if (d.kind === 'cliff') edit(Z => (Z.cliffs ||= []).push({ path: d.pts, h: 5 }));
  if (d.kind === 'scatter') edit(Z => (Z.scatter ||= []).push({ k: settings.scatterKinds.split(',').map(s => s.trim()).filter(k => PROP_KIT[k]), poly: d.pts, n: settings.scatterN }));
  if (d.kind === 'patrol') { if (sel?.kind === 'spawn') edit(Z => { Z.spawns[sel.i].route = d.pts; Z.spawns[sel.i].tag = 'patrol'; }); else status('Pick a spawn first, then draw its route.'); }
}
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); doUndo(); }
  else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) { e.preventDefault(); doRedo(); }
  else if (e.key === 'Enter') finishShape();
  else if (e.key === 'Escape') { drawing = null; sel = null; drawOverlay(); panel(); }
  else if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { const s = sel; sel = null; edit(Z => Z[listOf(s.kind)].splice(s.i, 1)); }
  else if (e.key.toLowerCase() === 'r' && sel?.kind === 'prop') edit(Z => { const p = Z.props[sel.i]; p.yaw = r1(((p.yaw || 0) + Math.PI / 8) % (Math.PI * 2)); });
  else { const t = TOOLS.findIndex(([, l], i) => e.key === String(i + 1)); if (t >= 0 && t < 9) setTool(TOOLS[t][0]); }
});
function doUndo() { if (!undo.length) return; redo.push(JSON.stringify(zone)); zone = JSON.parse(undo.pop()); sel = null; dirty = true; rebuild(); }
function doRedo() { if (!redo.length) return; undo.push(JSON.stringify(zone)); zone = JSON.parse(redo.pop()); sel = null; dirty = true; rebuild(); }

// ---- panels -----------------------------------------------------------------------------------------------------------
function setTool(t) { tool = t; drawing = null; $('#tools').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.t === t)); panel(); drawOverlay(); }
$('#tools').innerHTML = TOOLS.map(([t, l], i) => `<button data-t="${t}" title="${l} (${i + 1})">${l}</button>`).join('');
$('#tools').querySelectorAll('button').forEach(b => b.onclick = () => setTool(b.dataset.t));
const opt = (list, cur) => list.map(v => `<option ${v === cur ? 'selected' : ''}>${v}</option>`).join('');
function panel() {
  if (!zone) return;
  const P = $('#panel'); let h = '';
  if (tool === 'prop') h += `<h3>Prop</h3><div class="palette">${Object.entries(PROP_KIT).map(([k, v]) => `<button data-prop="${k}" class="${k === settings.prop ? 'on' : ''}">${esc(v.name)}</button>`).join('')}</div>
    <label>Turn <input type="range" min="0" max="6.28" step="0.2" data-set="yaw" value="${settings.yaw}"></label><label>Size <input type="number" step="0.1" min="0.3" max="4" data-set="scale" value="${settings.scale}"></label>`;
  if (tool === 'paint') h += `<h3>Paint</h3><div class="palette">${Object.entries(SURFACES).map(([k, c]) => `<button data-surface="${k}" class="${k === settings.surface ? 'on' : ''}"><i style="background:${c}"></i>${k}</button>`).join('')}</div><label>Brush radius <input type="number" min="1" max="20" data-set="brush" value="${settings.brush}"></label><p>Drag to paint a stroke; a click paints a circle.</p>`;
  if (tool === 'hill') h += `<h3>Hill</h3><label>Height (negative = hollow) <input type="number" step="0.5" data-set="hillH" value="${settings.hillH}"></label><p>Click the middle and drag out the radius.</p>`;
  if (['water', 'cliff', 'scatter', 'patrol'].includes(tool)) h += `<h3>${tool}</h3><p>Click points, then <b>Enter</b> or <button id="finish">Finish</button>. Esc cancels.</p>${tool === 'scatter' ? `<label>Kinds (comma separated) <input data-set="scatterKinds" value="${esc(settings.scatterKinds)}"></label><label>How many <input type="number" data-set="scatterN" value="${settings.scatterN}"></label>` : ''}${tool === 'patrol' ? '<p>Select a spawn first (Select tool), then draw its route here.</p>' : ''}`;
  if (tool === 'spawn' || tool === 'chest') h += `<h3>${tool}</h3>${tool === 'spawn' ? `<label>Kind <select data-set="spawnTag">${opt(['pack', 'patrol', 'swarm'], settings.spawnTag)}</select></label>` : `<label>Tier <select data-set="chestTier">${opt(['crate', 'chest', 'lockedChest', 'bossHoard'], settings.chestTier)}</select></label>`}<label>Level <input type="number" min="1" max="60" data-set="spawnLevel" value="${settings.spawnLevel}"></label>`;
  if (tool === 'marker') h += `<h3>Marker</h3><label>Kind <select data-set="markerKind">${opt(['start', 'waypoint', 'exit', 'entrance', 'portal', 'npc', 'quest', 'stash', 'vendor'], settings.markerKind)}</select></label>`;
  if (sel) { const it = zone[listOf(sel.kind)][sel.i]; h += `<h3>Selected ${sel.kind}</h3><textarea id="sel-json" spellcheck="false">${esc(JSON.stringify(it, null, 1))}</textarea><div class="row"><button id="sel-apply">Apply</button><button id="sel-del">Delete</button></div>`; }
  h += `<h3>Zone</h3><label>Id <input id="z-id" value="${esc(zone.id)}"></label><label>Name <input id="z-name" value="${esc(zone.name)}"></label>
    <label>Levels <input id="z-lv" value="${(zone.levels || [1, 1]).join('-')}"></label><label>Spawn table <input id="z-table" value="${esc(zone.table || '')}"></label>
    <label>Theme <select id="z-theme">${opt(['meadow', 'shore', 'forest', 'marsh', 'highland', 'ruins', 'grave', 'cave', 'cellar', 'crypt', 'catacomb', 'mine'], zone.theme)}</select></label><label>Bounds <input id="z-bounds" value="${zone.bounds.join(',')}"></label>
    <div id="check-out"></div>`;
  P.innerHTML = h;
  P.querySelectorAll('[data-prop]').forEach(b => b.onclick = () => { settings.prop = b.dataset.prop; panel(); });
  P.querySelectorAll('[data-surface]').forEach(b => b.onclick = () => { settings.surface = b.dataset.surface; panel(); });
  P.querySelectorAll('[data-set]').forEach(i => i.onchange = () => { const k = i.dataset.set; settings[k] = i.type === 'number' || i.type === 'range' ? +i.value : i.value; });
  P.querySelector('#finish')?.addEventListener('click', finishShape);
  P.querySelector('#sel-apply')?.addEventListener('click', () => { try { const v = JSON.parse($('#sel-json').value); edit(Z => { Z[listOf(sel.kind)][sel.i] = v; }); } catch (e) { status('That is not valid JSON: ' + e.message); } });
  P.querySelector('#sel-del')?.addEventListener('click', () => { const s = sel; sel = null; edit(Z => Z[listOf(s.kind)].splice(s.i, 1)); });
  const zf = (id, fn) => P.querySelector(id).onchange = e => edit(Z => fn(Z, e.target.value));
  zf('#z-id', (Z, v) => { Z.id = v.toLowerCase().replace(/[^a-z0-9_]/g, '_'); }); zf('#z-name', (Z, v) => { Z.name = v; }); zf('#z-table', (Z, v) => { Z.table = v; }); zf('#z-theme', (Z, v) => { Z.theme = v; });
  zf('#z-lv', (Z, v) => { const [a, b] = v.split(/[^0-9]+/).map(Number); Z.levels = [a || 1, b || a || 1]; });
  zf('#z-bounds', (Z, v) => { const b = v.split(',').map(Number); if (b.length === 4 && b.every(Number.isFinite)) Z.bounds = b; });
}

// ---- files ------------------------------------------------------------------------------------------------------------
const dataUrl = f => new URL('../../data/' + f, import.meta.url);
async function open(id) { zone = await (await fetch(dataUrl(`zones/${id}.json`), { cache: 'no-cache' })).json(); undo = []; redo = []; sel = null; dirty = false; const [x0, z0, x1, z1] = zone.bounds; panX = (x0 + x1) / 2; panZ = (z0 + z1) / 2; zoom = Math.max(x1 - x0, z1 - z0) * 0.55; resize(); rebuild(); history.replaceState(null, '', '?zone=' + id); }
async function list() { const idx = await (await fetch(dataUrl('zones/index.json'), { cache: 'no-cache' })).json(); $('#zone-pick').innerHTML = idx.zones.map(z => `<option>${z}</option>`).join(''); return idx.zones; }
$('#zone-pick').onchange = e => { if (!dirty || confirm('Drop unsaved changes?')) open(e.target.value); };
$('#new').onclick = () => { const id = prompt('New zone id (lower_case):', 'new_zone'); if (!id) return; zone = { id: id.toLowerCase().replace(/[^a-z0-9_]/g, '_'), name: id, levels: [1, 3], table: '', theme: 'meadow', bounds: [-80, -80, 80, 80], base: 'grass', surfaces: [], heights: [], water: [], cliffs: [], props: [], scatter: [], spawns: [], chests: [], markers: [{ kind: 'start', x: 0, z: 0 }] }; undo = []; redo = []; dirty = true; panX = panZ = 0; zoom = 90; resize(); rebuild(); };
$('#undo').onclick = doUndo; $('#redo').onclick = doRedo;
$('#check').onclick = () => { const r = checkZone(zone); $('#check-out').innerHTML = `<h3>${r.ok ? '✅ All good' : '⚠ ' + r.problems.length + ' problem(s)'}</h3><ul>${r.problems.map(p => `<li>${esc(p)}</li>`).join('')}</ul><small>${esc(JSON.stringify(r.stats))}</small>`; };
$('#download').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(zone, null, 1)], { type: 'application/json' })); a.download = zone.id + '.json'; a.click(); };
$('#save').onclick = async () => {
  try {
    const res = await fetch(new URL('../../../../editor/save', import.meta.url), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(zone) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || !out.ok) throw new Error(out.msg || `The server said ${res.status}.`);
    dirty = false; status(`Saved ${zone.id}${out.problems.length ? ` — ${out.problems.length} check problem(s)` : ' — all checks pass'}`); await list(); $('#zone-pick').value = zone.id;
  } catch (e) { status('Not saved: ' + e.message + ' (Download still works)'); }
};
$('#play').onclick = () => window.open(`index.html?zone=${encodeURIComponent(zone.id)}`, '_blank');
window.editor = { get zone() { return zone; }, setTool, finishShape, open, check: () => checkZone(zone) };

const ids = await list(); const want = new URLSearchParams(location.search).get('zone');
setTool('select'); await open(ids.includes(want) ? want : ids[0]); $('#zone-pick').value = zone.id;
(function loop() { requestAnimationFrame(loop); renderer.render(scene, cam); for (const el of $('#marks').children) placeLabel(el); })();
