// Oathwild — the map editor page (owner 2026-11-26: "Can we create a map editor so i can add more trees or fix bridges,
// possibly give you realtime access to update what i see"). Draws the world with the GAME'S OWN renderer and look
// (view.js sky + light + post, atmos mist + cloud shade, ambient life, effect zones, water, grass), from the same pure
// world code the server walks (js/world/*), with the editor's layer (data/edits.json) applied by js/world/edits.js.
// Every change goes to the DEV world server (/ws/edit, server/editor.js), which checks it, writes the file, rebuilds and
// tells every editor and every game page to redraw — including this one.
//
// window.editor  { state(), app, link, fly, tool(name), select… } and window.gameEye.state() for tests and game-eye.
import * as THREE from 'three';
import { bootRules } from '../../js/rules/boot.js';
import { bootWorld } from '../../js/world/boot.js';
import { understory, TREE_SPECIES, DECOR_KINDS } from '../../js/world/scatter.js';
import { worldScene } from '../../js/world/live.js';
import { createGround } from '../../js/game/ground.js';
import { normEdits, ZONE_KINDS, LOOK_FIELDS, GROUND_KINDS, thingRef } from '../../js/world/edits.js';
import { createView, QUALITY } from '../../js/client/render/view.js';
import { createAmbient } from '../../js/client/render/ambient.js';
import { createWeatherView } from '../../js/client/render/weather.js';
import { createLook } from '../../js/client/render/look.js';
import { mountWeatherPicker } from '../../js/client/weather-picker.js';
import { mountLookPicker } from '../../js/client/ui/look-panel.js';
import { createZones } from '../../js/client/render/zones.js';
import { makeWorldView, dropWorldView, rebuildAppWorld } from '../../js/client/live-edits.js';
import { loadTuning } from '../../../../shared/tune.js';
import { installTooltips } from '../../../../shared/tooltip.js';
import { ask, tell, askText } from '../../../../shared/dialog.js';
import { stopPageZoom } from '../../../../shared/no-zoom.js';
import { toast } from '../../js/client/ui/kit.js';
import { createLink } from './link.js';
import { createFly } from './fly.js';
import { createOverlays } from './overlays.js';
import { createTopMap } from './topmap.js';

const Q = new URLSearchParams(location.search);
const LITE = navigator.webdriver || Q.has('lite');
const PREFS_KEY = 'oathwild.editor';
const prefs = (() => { try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'); } catch { return {}; } })();
const savePrefs = () => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* private window */ } };
const phone = matchMedia('(pointer: coarse)').matches && Math.min(innerWidth, innerHeight) < 700;
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nice = id => String(id).replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

const TOOLS = [
  { id: 'look', name: 'Look', key: 'V', icon: '👁', tip: 'Fly round and look. Drag to turn, WASD to fly, Q / E down and up.' },
  { id: 'trees', name: 'Trees', key: 'T', icon: '🌳', tip: 'Place, move and remove trees and rocks; brush forests in or out.' },
  { id: 'bridges', name: 'Bridges', key: 'B', icon: '🌉', tip: 'Ends, deck height, width, kind and the level run onto each bridge.' },
  { id: 'lines', name: 'Roads', key: 'R', icon: '〰', tip: 'Drag the points of a road or river; add or remove points.' },
  { id: 'ground', name: 'Ground', key: 'G', icon: '⛰', tip: 'Raise, lower, flatten or smooth the ground with a brush.' },
  { id: 'things', name: 'Things', key: 'H', icon: '⛺', tip: 'Move shrines, chests, camps, people and props.' },
  { id: 'effects', name: 'Effects', key: 'F', icon: '✨', tip: 'Fog, fireflies, leaves, dust, light shafts, marsh glow, embers and colour zones.' },
  { id: 'looks', name: 'Looks', key: 'L', icon: '🎨', tip: 'Each region\'s colour look: grade, bloom, mist, fog and sun colour.' },
  { id: 'notes', name: 'Notes', key: 'N', icon: '📌', tip: 'Pin a note for Claude ("this bridge floats"). Green = done.' },
];
const PHONE_TOOLS = new Set(['look', 'notes', 'effects', 'trees']);

const progress = (k, text) => { const b = document.querySelector('#loading .ow-loading-bar i'); if (b) b.style.width = `${Math.round(k * 100)}%`; const p = document.querySelector('#loading p'); if (p && text) p.textContent = text; };

const ed = {
  app: null, link: null, fly: null, ov: null, map: null, ready: false, tool: 'look', sel: null, draft: null,
  server: { edits: normEdits(null), lines: null, bridges: [], report: { orphans: [] }, marker: null, history: [], undo: 0, redo: 0 },
  overlay: { lines: !!prefs.lines, colliders: !!prefs.colliders, areas: !!prefs.areas, ids: !!prefs.ids, zones: prefs.zones !== false },
  opts: { species: prefs.species || 'oak-a', size: 1, decor: 'boulder', treeMode: 'place', brushR: 20, density: 0.5, areaMode: 'set', ground: 'raise', groundR: 8, groundAmt: 1, zoneKind: 'fog', region: null, follow: prefs.follow !== false },
  busy: 0, hover: null, grabbing: false,
};
window.editor = ed;
window.gameEye = { state: () => ({ screen: 'editor', view: ed.ready ? 'ready' : 'loading', tool: ed.tool, connected: ed.link?.state, cam: ed.fly ? { x: r1(ed.fly.pos.x), y: r1(ed.fly.pos.y), z: r1(ed.fly.pos.z) } : null, edits: ed.server.history.length }), app: null };

async function boot() {
  stopPageZoom();
  progress(0.05, 'Reading the old oaths…');
  const quality = ['low', 'medium', 'high'].includes(Q.get('quality')) ? Q.get('quality') : LITE ? 'low' : prefs.quality || 'medium';
  const [rules, art, critters] = await Promise.all([
    bootRules({ seed: 7 }),
    fetch(new URL('../../data/art.json', import.meta.url)).then(r => r.json()),
    fetch(new URL('../../data/critters.json', import.meta.url)).then(r => r.json()).catch(() => ({ critters: {} })),
  ]);
  art.critters = critters.critters;
  progress(0.3, 'Raising the hills…');
  const W = await bootWorld({ regions: rules.data.regions });
  progress(0.55, 'Planting the woods…');
  const scattered = worldScene(W);
  scattered.trees.push(...(W.town?.trees || []));
  scattered.understory = understory(W.terrain, W.data.placements, scattered.trees);
  const app = { rules, art, W, scattered, ground: createGround(W.terrain, W.data.placements, scattered, W.town), settings: { quality }, view: null, worldView: null, zones: null };
  ed.app = app; window.gameEye.app = app;
  progress(0.7, 'Lighting the sky…');
  app.view = createView(document.getElementById('view'), { quality });
  try { app.tuning = await loadTuning(new URL('../../data/tuning.json', import.meta.url), { game: 'oathwild' }); app.view.tuning = app.tuning; } catch { app.tuning = null; }
  app.worldView = makeWorldView(app);
  app.zones = createZones(app.view, { T: W.terrain, edits: W.data.edits, quality });
  app.ambient = createAmbient(app.view, { T: W.terrain, trees: scattered.trees, chimneys: app.worldView.chimneys || [], quality, sound: null });
  // weather (preview from the top bar) and the Look (the game's presets; kept with the game's own settings on this device)
  app.weather = createWeatherView(app.view, { heightAt: (x, z) => app.ground.y(x, z), T: W.terrain, quality, seed: 7 });
  app.view.afterWeather = () => app.weather.apply();
  try { app.settings.look = JSON.parse(localStorage.getItem('oathwild.settings') || '{}').look; } catch { /* private window */ }
  app.lookStyle = createLook(app);
  if (app.tuning) app.view.tuning = app.lookStyle.tuning(app.tuning);
  app.lookStyle.applyFx();
  app.view.afterQuality = q => { app.weather.setQuality(q); app.lookStyle.applyFx(); };
  ed.fly = createFly(app.view.camera, app.view.renderer.domElement, { heightAt: (x, z) => app.W.terrain.heightAt(x, z), lookWithLeft: e => !ed.grabbing && (ed.tool === 'look' || e.pointerType === 'touch'), blocked: () => !!document.querySelector('.gdlg') });
  const start = prefs.cam || { x: -200, z: 0, yaw: 0.9, pitch: -0.5 };
  ed.fly.jump(start.x, start.z, { yaw: start.yaw ?? 0.9, pitch: start.pitch ?? -0.5, height: 30, back: 45 });
  if (Q.get('at')) { const [x, z] = Q.get('at').split(',').map(Number); if (Number.isFinite(x) && Number.isFinite(z)) ed.fly.jump(x, z, { height: 30, back: 45 }); }
  ed.ov = createOverlays(app.view.scene, { heightAt: (x, z) => app.W.terrain.heightAt(x, z) });
  buildUi();
  ed.link = createLink({ on: onServer, onState: s => { setConn(s); } });
  progress(1, 'Ready.');
  document.getElementById('loading').classList.add('gone');
  setTimeout(() => document.getElementById('loading')?.remove(), 700);
  await app.worldView.ready?.();
  ed.ready = true;
  loop();
}

// ---------------------------------------------------------------- server messages
async function onServer(m) {
  const S = ed.server;
  if (m.t === 'state' || m.t === 'edit') {
    const before = JSON.stringify(ed.app.W.data.edits), mapBefore = JSON.stringify(ed.app.W.data.map);
    Object.assign(S, { edits: normEdits(m.edits), report: m.report || S.report, history: m.history || S.history, undo: m.undo ?? S.undo, redo: m.redo ?? S.redo, bridges: m.bridges || S.bridges });
    if (m.map) S.lines = m.map;
    if ('marker' in m) S.marker = m.marker;
    const mapChanged = m.mapFull && JSON.stringify(m.mapFull) !== mapBefore;
    const editsChanged = JSON.stringify(S.edits) !== before;
    if (editsChanged || mapChanged) {
      const touched = m.t === 'state' ? 'all' : m.touched;
      ed.app.W.data.edits = S.edits;
      if (touched === 'notes' || touched === 'zones' || touched === 'looks') ed.app.zones.setEdits(S.edits);
      else await redrawWorld({ edits: S.edits, map: mapChanged ? m.mapFull : null });
    }
    if (m.t === 'edit' && m.by !== ed.link.who) toast(`${nice(m.by)}: ${m.what}`, 'info', 2600);
    if (m.t === 'edit' && m.by === 'claude' && ed.opts.follow && m.at) ed.fly.jump(m.at[0], m.at[1], { height: 26, back: 38 });
    refreshAll();
  } else if (m.t === 'marker') { S.marker = m.marker; drawMarks(); if (m.marker?.by === 'claude' && ed.opts.follow) ed.fly.jump(m.marker.at[0], m.marker.at[1], { height: 26, back: 38 }); }
}
let redrawing = null;
async function redrawWorld({ edits, map }) {
  const app = ed.app;
  setBusy(+1, 'Redrawing the world…');
  try {
    redrawing = rebuildAppWorld(app, { edits, map });
    await redrawing;
    const old = app.worldView;
    app.worldView = makeWorldView(app);
    await app.worldView.ready?.();
    dropWorldView(app, old);
    app.zones.setEdits(edits);
    ed.map.draw();
  } finally { redrawing = null; setBusy(-1); }
}

// ---------------------------------------------------------------- sending edits
async function send(op, okText = null) {
  setBusy(+1, 'Saving…');
  try {
    const r = await ed.link.op(op);
    if (okText) toast(okText, 'good', 1800);
    return r;
  } catch (e) { toast(e.message, 'bad', 4200); return null; } finally { setBusy(-1); }
}
function setBusy(d, text) {
  ed.busy = Math.max(0, ed.busy + d);
  const el = document.querySelector('.ed-busy');
  if (el) { el.hidden = !ed.busy; if (text && d > 0) el.textContent = text; }
}

// ---------------------------------------------------------------- picking
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
/** Where the pointer meets the ground (stepped along the ray, then narrowed). → [x, z] | null */
function groundAt(cx, cy) {
  const c = ed.app.view.renderer.domElement.getBoundingClientRect();
  ndc.set((cx - c.left) / c.width * 2 - 1, -((cy - c.top) / c.height) * 2 + 1);
  ray.setFromCamera(ndc, ed.app.view.camera);
  const o = ray.ray.origin, d = ray.ray.direction, T = ed.app.W.terrain;
  let prev = 0;
  for (let t = 1; t < 1600; t += t < 100 ? 1 : 3) {
    const x = o.x + d.x * t, z = o.z + d.z * t, y = o.y + d.y * t;
    const w = T.waterAt(x, z), g = Math.max(T.heightAt(x, z), w && w.depth > 0 ? w.surface : -1e9);
    if (y <= g) {
      let a = prev, b = t;
      for (let i = 0; i < 12; i++) { const m = (a + b) / 2; const xm = o.x + d.x * m, zm = o.z + d.z * m; if (o.y + d.y * m <= T.heightAt(xm, zm)) b = m; else a = m; }
      const x2 = o.x + d.x * b, z2 = o.z + d.z * b;
      if (!T.inPlay(x2, z2) && (x2 < T.bounds.minX || x2 > T.bounds.maxX || z2 < T.bounds.minZ || z2 > T.bounds.maxZ)) return null;
      return [r2(x2), r2(z2)];
    }
    prev = t;
  }
  return null;
}
function screenOf(x, y, z) {
  const v = new THREE.Vector3(x, y, z).project(ed.app.view.camera);
  if (v.z > 1) return null;
  const c = ed.app.view.renderer.domElement.getBoundingClientRect();
  return [(v.x + 1) / 2 * c.width + c.left, (1 - v.y) / 2 * c.height + c.top];
}
/** Nearest of `list` ({ at:[x,z] } or { x, z }) to a ground point, within `max` metres. */
function nearest(list, at, max) {
  let best = null, bd = max;
  for (const it of list) { const x = it.at ? it.at[0] : it.x, z = it.at ? it.at[1] : it.z; const d = Math.hypot(x - at[0], z - at[1]); if (d < bd) { bd = d; best = it; } }
  return best;
}
function allThings() {
  const W = ed.app.W, P = W.data.placements, out = [];
  const label = { buildings: 'Building', props: 'Prop', shrines: 'Shrine', chests: 'Chest', objects: 'Quest object', camps: 'Camp', roam: 'Roaming pack' };
  for (const g of Object.keys(label)) for (const p of P[g] || []) if (Array.isArray(p.at)) {
    // a moved prop keeps the ref it had where place-world put it (pristine)
    const orig = (W.pristine?.placements?.[g] || []).find(q => (p.id ? q.id === p.id : false)) || null;
    const ref = p.id ? thingRef(g, p) : (Object.entries(ed.server.edits.moves).find(([, mv]) => mv.at[0] === p.at[0] && mv.at[1] === p.at[1])?.[0] || thingRef(g, p));
    out.push({ ref, group: g, at: p.at, name: p.name || nice(p.art || p.id || g), kind: label[g], facing: p.facing || 0, orig });
  }
  for (const [id, n] of Object.entries(W.data.npcs?.npcs || {})) if (Array.isArray(n.at)) out.push({ ref: `npcs:${id}`, group: 'npcs', at: n.at, name: n.role ? nice(id) : n.name, kind: 'Person', facing: n.face || 0 });
  return out;
}

// ---------------------------------------------------------------- pointer on the world
function installPointer() {
  const cv = ed.app.view.renderer.domElement;
  let down = null;
  cv.addEventListener('pointermove', e => {
    if (e.pointerType !== 'touch') { ed.hover = groundAt(e.clientX, e.clientY); showHover(); }
    if (down && down.drag) { const at = groundAt(e.clientX, e.clientY); if (at) dragTo(down, at); }
    if (down && down.paint) { const at = groundAt(e.clientX, e.clientY); if (at && Math.hypot(at[0] - down.last[0], at[1] - down.last[1]) > Math.max(2, ed.opts.groundR * 0.6) && down.strokes.length < 40) { down.strokes.push(at); down.last = at; ed.ov.brush(at, ed.opts.groundR, true); } }
  });
  cv.addEventListener('pointerdown', e => {
    if (e.button !== 0 || ed.tool === 'look') return;
    const at = groundAt(e.clientX, e.clientY); if (!at) return;
    down = { at, x: e.clientX, y: e.clientY, drag: null, paint: false };
    startDrag(down, at, e);
    if (down.drag || down.paint) { ed.grabbing = true; try { cv.setPointerCapture(e.pointerId); } catch { /* fine */ } }
  }, true);
  cv.addEventListener('pointerup', async e => {
    const d = down; down = null; ed.grabbing = false;
    if (!d) return;
    const at = groundAt(e.clientX, e.clientY) || d.at;
    const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y);
    if (d.drag) return endDrag(d, at, moved);
    if (d.paint) return endPaint(d);
    if (moved < 8 && ed.fly.lastDragMoved < 8) click(at, e);
  });
}
function showHover() {
  const at = ed.hover;
  if (ed.tool === 'ground') ed.ov.brush(at, ed.opts.groundR, true);
  else if (ed.tool === 'trees' && ed.opts.treeMode === 'area') ed.ov.brush(at, ed.opts.brushR, true);
  else ed.ov.brush(null);
  const pos = document.querySelector('.ed-pos');
  if (pos && at) { const T = ed.app.W.terrain, band = T.levelBandAt(...at); pos.textContent = `${at[0].toFixed(1)}, ${at[1].toFixed(1)} · height ${T.heightAt(...at).toFixed(1)} m · ${nice(T.regionAt(...at))} · levels ${band[0]}–${band[1]}`; }
}
function startDrag(d, at) {
  const sel = ed.sel;
  if (ed.tool === 'things') { const t = nearest(allThings(), at, 4); if (t) { ed.sel = { kind: 'thing', ...t }; d.drag = { kind: 'thing', thing: t }; renderPanel(); } }
  else if (ed.tool === 'trees' && ed.opts.treeMode === 'move') { const t = nearest(ed.app.scattered.trees, at, 3); if (t) d.drag = { kind: 'tree', tree: t }; }
  else if (ed.tool === 'effects' && sel?.kind === 'zone') { const z = ed.server.edits.zones.find(q => q.id === sel.id); if (z && Math.hypot(z.at[0] - at[0], z.at[1] - at[1]) < Math.max(3, z.r * 0.25)) d.drag = { kind: 'zone', zone: z }; }
  else if (ed.tool === 'bridges' && ed.draft) { for (const end of ['a', 'b']) { const p = ed.draft[end] || ed.server.bridges.find(b => b.id === ed.draft.id)?.[end]; if (p && Math.hypot(p[0] - at[0], p[1] - at[1]) < 3) d.drag = { kind: 'end', end }; } }
  else if (ed.tool === 'lines' && ed.draft?.points) { const i = ed.draft.points.findIndex(p => Math.hypot(p[0] - at[0], p[1] - at[1]) < 4); if (i >= 0 && ed.opts.lineMode !== 'remove') { d.drag = { kind: 'point', i }; ed.draft.sel = i; } }
  else if (ed.tool === 'ground') { d.paint = true; d.strokes = [at]; d.last = at; }
}
function dragTo(d, at) {
  const k = d.drag.kind;
  if (k === 'thing') { d.drag.to = at; ed.ov.pick(at, 2); }
  else if (k === 'tree') { d.drag.to = at; ed.ov.pick(at, 1.5); }
  else if (k === 'zone') { d.drag.to = at; ed.ov.zones([{ ...d.drag.zone, at }], d.drag.zone.id, true); }
  else if (k === 'end') { const bb = ed.server.bridges.find(b => b.id === ed.draft.id); for (const e of ['a', 'b']) if (!ed.draft[e] && bb) ed.draft[e] = [...bb[e]]; ed.draft[d.drag.end] = ed.opts.snap ? snapToRoad(at, ed.draft.road) : at; ed.ov.bridge(ed.server.bridges.find(b => b.id === ed.draft.id), ed.draft); renderPanel(); }
  else if (k === 'point') { ed.draft.points[d.drag.i] = at; ed.ov.points(ed.draft.points, d.drag.i, ed.draft.line === 'rivers' ? 0x6fc0ff : 0xffffff); }
}
async function endDrag(d, at, moved) {
  const k = d.drag.kind;
  if (moved < 6 && k !== 'end' && k !== 'point') { ed.ov.pick(null); return click(at); }
  if (k === 'thing') { await send({ op: 'thing.move', ref: d.drag.thing.ref, at }, `${d.drag.thing.name} moved.`); ed.sel = null; }
  else if (k === 'tree') { const t = d.drag.tree; await send({ op: 'tree.move', id: t.id, art: t.art, scale: t.scale, rot: t.rot, at }, 'Tree moved.'); }
  else if (k === 'zone') { await send({ op: 'zone.set', id: d.drag.zone.id, at }); }
  else if (k === 'point') { await sendLine(); }
  ed.ov.pick(null);
  refreshAll();
}
async function endPaint(d) {
  const o = ed.opts, T = ed.app.W.terrain;
  const y = o.ground === 'flatten' ? T.heightAt(...d.strokes[0]) : undefined;
  const ops = d.strokes.map(at => ({ op: 'ground', kind: o.ground, at, r: o.groundR, amount: o.groundAmt, ...(y != null ? { y } : {}) }));
  await send(ops.length === 1 ? ops[0] : { op: 'batch', ops }, null);
}
function snapToRoad(at, roadId) {
  const T = ed.app.W.terrain, r = T.roads.find(q => q.id === roadId);
  if (!r) return at;
  let best = at, bd = Infinity;
  for (let i = 0; i < r.pts.length - 1; i++) {
    const a = r.pts[i], b = r.pts[i + 1], dx = b.x - a.x, dz = b.z - a.z, L = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((at[0] - a.x) * dx + (at[1] - a.z) * dz) / L)), x = a.x + dx * t, z = a.z + dz * t, dd = Math.hypot(x - at[0], z - at[1]);
    if (dd < bd) { bd = dd; best = [r2(x), r2(z)]; }
  }
  return best;
}
async function click(at) {
  const o = ed.opts, S = ed.server;
  switch (ed.tool) {
    case 'trees': {
      if (o.treeMode === 'place') return send(TREE_SPECIES[o.species] ? { op: 'tree.add', art: o.species, at, scale: o.size } : { op: 'decor.add', art: o.species, at, scale: o.size, rot: Math.random() * 6.28 }, null);
      if (o.treeMode === 'remove') {
        const t = nearest(ed.app.scattered.trees, at, 3), d = nearest(ed.app.scattered.decor.filter(q => q.solid || true), at, 1.6);
        if (d && (!t || Math.hypot(d.x - at[0], d.z - at[1]) < Math.hypot(t.x - at[0], t.z - at[1]))) return send({ op: 'decor.remove', id: d.id }, 'Removed.');
        if (t) return send({ op: 'tree.remove', id: t.id }, 'Tree removed.');
        return toast('No tree or rock there.', 'info');
      }
      if (o.treeMode === 'area') return send({ op: 'tree.area', at, r: o.brushR, density: o.areaMode === 'clear' ? 0 : o.density, mode: o.areaMode === 'add' ? 'add' : 'set', ...(o.areaKinds ? { kinds: [o.species].filter(k => TREE_SPECIES[k]) } : {}) }, o.areaMode === 'clear' ? 'Trees cleared.' : 'Trees planted.');
      if (o.treeMode === 'move') return toast('Drag a tree to move it.', 'info');
      return;
    }
    case 'ground': return null;
    case 'things': { const t = nearest(allThings(), at, 4); ed.sel = t ? { kind: 'thing', ...t } : null; renderPanel(); return; }
    case 'effects': {
      const inside = S.edits.zones.filter(q => Math.hypot(q.at[0] - at[0], q.at[1] - at[1]) < q.r).sort((a, b) => a.r - b.r)[0];
      if (o.placingZone) { o.placingZone = false; const r = await send({ op: 'zone.add', kind: o.zoneKind, at }, `${ZONE_KINDS[o.zoneKind].name} added.`); if (r?.id) ed.sel = { kind: 'zone', id: r.id }; renderPanel(); return; }
      ed.sel = inside ? { kind: 'zone', id: inside.id } : null; renderPanel(); refreshOverlays(); return;
    }
    case 'notes': {
      const n = nearest(S.edits.notes, at, 3);
      if (n) { ed.sel = { kind: 'note', id: n.id }; renderPanel(); return; }
      const text = await askText({ title: 'Pin a note here', text: 'What should change at this spot? Claude reads these (map-edit.mjs notes) and turns them green when done.', placeholder: 'e.g. more trees here, this bridge floats', ok: 'Pin it', maxLength: 300 });
      if (text) await send({ op: 'note.add', at, text }, 'Note pinned.');
      return;
    }
    case 'bridges': { const b = nearest(S.bridges.map(q => ({ ...q, at: q.at })), at, 30); if (b) selectBridge(b.id); return; }
    case 'lines': {
      if (ed.draft?.points && o.lineMode === 'add') { insertPoint(at); return sendLine(); }
      if (ed.draft?.points && o.lineMode === 'remove') { const i = ed.draft.points.findIndex(p => Math.hypot(p[0] - at[0], p[1] - at[1]) < 4); if (i >= 0 && ed.draft.points.length > 2) { ed.draft.points.splice(i, 1); return sendLine(); } return; }
      const T = ed.app.W.terrain; let best = null, bd = 12;
      for (const kind of ['roads', 'rivers']) for (const L of T[kind]) for (const p of L.pts) { const dd = Math.hypot(p.x - at[0], p.z - at[1]); if (dd < bd) { bd = dd; best = { line: kind, id: L.id }; } }
      if (best) selectLine(best.line, best.id);
      return;
    }
    default:
  }
}
function insertPoint(at) {
  const P = ed.draft.points; let bi = 0, bd = Infinity;
  for (let i = 0; i < P.length - 1; i++) { const [ax, az] = P[i], [bx, bz] = P[i + 1], dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((at[0] - ax) * dx + (at[1] - az) * dz) / L)); const d = Math.hypot(ax + dx * t - at[0], az + dz * t - at[1]); if (d < bd) { bd = d; bi = i; } }
  P.splice(bi + 1, 0, at);
}
async function sendLine() { const d = ed.draft; await send({ op: 'line.set', line: d.line, id: d.id, points: d.points }, `${d.name || nice(d.id)} reshaped.`); }
function selectBridge(id) {
  const b = ed.server.bridges.find(q => q.id === id); if (!b) return;
  const decl = (ed.server.lines?.crossings || []).find(c => c.id === id) || {};
  ed.draft = { id, road: b.road, a: decl.a || null, b: decl.b || null, deck: b.deck, width: b.width, ramp: decl.ramp ?? 1.5, kind: b.kind, art: b.art || (b.kind === 'bridge' ? 'bridge-wood' : null) };
  ed.sel = { kind: 'bridge', id };
  ed.fly.jump(b.at[0], b.at[1], { height: 12, back: 30, pitch: -0.3, yaw: Math.atan2(b.b[0] - b.a[0], b.b[1] - b.a[1]) + Math.PI / 2 });   // side on
  renderPanel(); refreshOverlays();
}
function selectLine(line, id) {
  const L = (ed.server.lines?.[line] || []).find(q => q.id === id) || ed.app.W.data.map[line].find(q => q.id === id);
  if (!L) return;
  ed.draft = { line, id, name: L.name, points: L.points.map(p => [...p]), sel: -1 };
  ed.sel = { kind: 'line', line, id };
  renderPanel(); refreshOverlays();
}

// ---------------------------------------------------------------- UI
function buildUi() {
  const ui = document.getElementById('ed-ui');
  document.body.classList.toggle('ed-phone', phone);
  ui.innerHTML = `
    <header class="ed-top">
      <a class="ed-title" href="../" data-tip="Back to the game">Oathwild <b>Map Editor</b></a>
      <span class="ed-conn" data-state="connecting" data-tip="The editor saves through the DEV world server (port 8661). Green = connected."><i></i><span>Connecting…</span></span>
      <span class="ed-busy" hidden>Saving…</span>
      <span class="ed-grow"></span>
      <button class="ow-btn ow-small ow-ghost" data-act="undo" data-tip="Undo the last change (Ctrl+Z) — anyone's, the server keeps one list">↶ Undo</button>
      <button class="ow-btn ow-small ow-ghost" data-act="redo" data-tip="Redo (Ctrl+Y)">↷ Redo</button>
      <label class="ed-sel" data-tip="The game's graphics setting: Low is what most phones see"><span>Quality</span>
        <select data-act="quality">${Object.keys(QUALITY).map(q => `<option value="${q}"${q === ed.app.settings.quality ? ' selected' : ''}>${nice(q)}</option>`).join('')}</select></label>
      <div class="ed-weather" data-slot="weather" hidden></div>
      <div class="ed-weather" data-slot="look" hidden></div>
      <button class="ow-btn ow-small" data-act="map" data-tip="The map from above (M). Click a spot to fly there.">🗺 Map</button>
      <button class="ow-btn ow-small ed-more" data-act="layers" data-tip="What to show on top of the world">Layers ▾</button>
    </header>
    <div class="ed-layers" hidden>
      ${[['lines', 'Road and river lines'], ['colliders', 'Colliders (what stops a walker)'], ['areas', 'Level areas'], ['ids', 'Tree and rock names'], ['zones', 'Effect zone rings']].map(([k, n]) => `<label><input type="checkbox" data-layer="${k}"${ed.overlay[k] ? ' checked' : ''}> ${n}</label>`).join('')}
      <label><input type="checkbox" data-follow${ed.opts.follow ? ' checked' : ''}> Fly to where Claude edits</label>
    </div>
    <nav class="ed-tools" aria-label="Tools">${TOOLS.filter(t => !phone || PHONE_TOOLS.has(t.id)).map(t => `<button class="ed-tool" data-tool="${t.id}" aria-pressed="${t.id === ed.tool}" data-tip="${esc(t.name)} (${t.key}) — ${esc(t.tip)}"><span class="ed-ico" aria-hidden="true">${t.icon}</span><span>${t.name}</span></button>`).join('')}</nav>
    <aside class="ed-panel" aria-live="polite"></aside>
    <div class="ed-foot"><span class="ed-pos">Point at the ground to see where you are.</span></div>
    <div class="ed-mapwrap" hidden><div class="ed-mapbox"><div class="ed-maphead"><h2>The map</h2><span>Click a spot to fly there. Orange pins = notes, green = done, blue ring = where Claude last worked.</span><button class="ow-x" data-act="mapclose" aria-label="Close the map">✕</button></div></div></div>
    ${phone ? `<div class="ed-stick" aria-label="Move"><i></i></div><div class="ed-lift"><button class="ow-btn ow-small" data-lift="1" aria-label="Fly up">▲</button><button class="ow-btn ow-small" data-lift="-1" aria-label="Fly down">▼</button></div>` : ''}`;
  ed.map = createTopMap(ui.querySelector('.ed-mapbox'), { getT: () => ed.app.W.terrain, onJump: (x, z) => { ed.fly.jump(x, z, { height: 40, back: 55 }); ui.querySelector('.ed-mapwrap').hidden = true; } });
  ed.map.draw();
  // the weather + Look pickers in the top bar (once, with the toolbar — not on every world redraw)
  ed.wxPick = mountWeatherPicker(ui.querySelector('[data-slot="weather"]'), { weather: ed.app.weather });
  ed.lookPick = mountLookPicker(ui.querySelector('[data-slot="look"]'), {
    get: () => ed.app.settings.look || { id: 'classic' },
    set: next => {
      ed.app.settings.look = next; ed.app.lookStyle.set(next);
      try { const all = JSON.parse(localStorage.getItem('oathwild.settings') || '{}'); all.look = next; localStorage.setItem('oathwild.settings', JSON.stringify(all)); } catch { /* private window */ }
    },
  });
  installTooltips();
  installPointer();
  ui.addEventListener('click', onUiClick);
  ui.addEventListener('change', onUiChange);
  ui.addEventListener('input', onUiInput);
  addEventListener('keydown', onKey);
  if (phone) installPhoneMove(ui);
  renderPanel(); refreshOverlays();
}
function setConn(s) {
  const el = document.querySelector('.ed-conn'); if (!el) return;
  el.dataset.state = s;
  el.querySelector('span').textContent = s === 'open' ? 'Connected (dev)' : s === 'connecting' ? 'Connecting…' : 'Not connected — start the dev world server';
}
function installPhoneMove(ui) {
  const st = ui.querySelector('.ed-stick'), knob = st.querySelector('i');
  let id = null, cx = 0, cy = 0;
  st.addEventListener('pointerdown', e => { id = e.pointerId; const r = st.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; try { st.setPointerCapture(e.pointerId); } catch { /* a pointer the browser no longer tracks */ } move(e); });
  const move = e => { if (e.pointerId !== id) return; const dx = (e.clientX - cx) / 50, dy = (e.clientY - cy) / 50, l = Math.hypot(dx, dy), k = l > 1 ? 1 / l : 1; ed.fly.stick.x = dx * k; ed.fly.stick.y = dy * k; knob.style.transform = `translate(${dx * k * 34}px, ${dy * k * 34}px)`; };
  st.addEventListener('pointermove', move);
  const up = e => { if (e.pointerId !== id) return; id = null; ed.fly.stick.x = ed.fly.stick.y = 0; knob.style.transform = ''; };
  st.addEventListener('pointerup', up); st.addEventListener('pointercancel', up);
  for (const b of ui.querySelectorAll('[data-lift]')) { b.addEventListener('pointerdown', () => { ed.fly.lift = +b.dataset.lift; }); for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => { ed.fly.lift = 0; }); }
}
function setTool(id) {
  if (!TOOLS.some(t => t.id === id)) return;
  ed.tool = id; ed.sel = null; ed.draft = null; ed.opts.placingZone = false;
  for (const b of document.querySelectorAll('[data-tool]')) b.setAttribute('aria-pressed', String(b.dataset.tool === id));
  renderPanel(); refreshOverlays(); showHover();
}
function onKey(e) {
  if (/input|textarea|select/i.test(e.target?.tagName || '') || document.querySelector('.gdlg')) return;
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); doUndo(e.shiftKey ? 'redo' : 'undo'); return; }
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') { e.preventDefault(); doUndo('redo'); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.code === 'KeyM') { toggleMap(); return; }
  if (e.code === 'Escape') { const mw = document.querySelector('.ed-mapwrap'); if (mw && !mw.hidden) { mw.hidden = true; return; } ed.sel = null; ed.draft = null; renderPanel(); refreshOverlays(); return; }
  if (e.code === 'Delete' || e.code === 'Backspace') { deleteSelected(); return; }
  const t = TOOLS.find(x => 'Key' + x.key === e.code);
  if (t && !['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE'].includes(e.code)) setTool(t.id);
}
async function doUndo(which) { setBusy(+1, which === 'undo' ? 'Undoing…' : 'Redoing…'); try { await (which === 'undo' ? ed.link.undo() : ed.link.redo()); } catch (err) { toast(err.message, 'info'); } finally { setBusy(-1); } }
function toggleMap() { const mw = document.querySelector('.ed-mapwrap'); mw.hidden = !mw.hidden; if (!mw.hidden) drawMarks(); }
async function deleteSelected() {
  const s = ed.sel; if (!s) return;
  if (s.kind === 'zone' && await ask({ title: 'Remove this effect zone?', text: 'Players stop seeing it at once. Undo brings it back.', ok: 'Remove', danger: true })) { await send({ op: 'zone.remove', id: s.id }, 'Zone removed.'); ed.sel = null; }
  if (s.kind === 'note' && await ask({ title: 'Remove this note?', text: 'Mark it done instead to keep a record.', ok: 'Remove', danger: true })) { await send({ op: 'note.remove', id: s.id }); ed.sel = null; }
  renderPanel(); refreshOverlays();
}

async function onUiClick(e) {
  const b = e.target.closest('button, [data-tool]'); if (!b) return;
  const d = b.dataset, o = ed.opts;
  if (d.tool) return setTool(d.tool);
  if (d.act === 'undo' || d.act === 'redo') return doUndo(d.act);
  if (d.act === 'map') return toggleMap();
  if (d.act === 'mapclose') { document.querySelector('.ed-mapwrap').hidden = true; return; }
  if (d.act === 'layers') { const l = document.querySelector('.ed-layers'); l.hidden = !l.hidden; return; }
  if (d.mode) { o[d.modeKey || 'treeMode'] = d.mode; renderPanel(); showHover(); return; }
  if (d.act === 'goto') { const [x, z] = d.at.split(',').map(Number); ed.fly.jump(x, z, { height: 22, back: 32 }); return; }
  if (d.act === 'bridge') return selectBridge(d.id);
  if (d.act === 'line') return selectLine(d.line, d.id);
  if (d.act === 'bridge-apply') { const dr = ed.draft; await send({ op: 'bridge.set', id: dr.id, ...(dr.a && dr.b ? { a: dr.a, b: dr.b } : {}), deck: dr.deck, width: dr.width, ramp: dr.ramp, kind: dr.kind, ...(dr.kind === 'bridge' && dr.art ? { art: dr.art } : {}) }, 'Bridge saved.'); return selectBridge(dr.id); }
  if (d.act === 'bridge-reset') { await send({ op: 'bridge.set', id: ed.draft.id, a: null, b: null, deck: null, width: null, ramp: null }, 'Bridge back to its worked-out shape.'); return selectBridge(ed.draft.id); }
  if (d.act === 'bridge-step') { const k = d.key; ed.draft[k] = r2((ed.draft[k] ?? 0) + Number(d.step)); renderPanel(); refreshOverlays(); return; }
  if (d.act === 'zone-place') { o.zoneKind = d.kind || o.zoneKind; o.placingZone = true; toast(`Click the ground to place ${ZONE_KINDS[o.zoneKind].name.toLowerCase()}.`, 'info'); renderPanel(); return; }
  if (d.act === 'zone') { ed.sel = { kind: 'zone', id: d.id }; const z = ed.server.edits.zones.find(q => q.id === d.id); if (z) ed.fly.jump(z.at[0], z.at[1], { height: Math.min(60, 12 + z.r * 0.4), back: Math.min(90, 20 + z.r * 0.6) }); renderPanel(); refreshOverlays(); return; }
  if (d.act === 'zone-remove') { ed.sel = { kind: 'zone', id: d.id }; return deleteSelected(); }
  if (d.act === 'note') { ed.sel = { kind: 'note', id: d.id }; const n = ed.server.edits.notes.find(q => q.id === d.id); if (n) ed.fly.jump(n.at[0], n.at[1], { height: 16, back: 24 }); renderPanel(); return; }
  if (d.act === 'note-done' || d.act === 'note-open') { await send({ op: d.act === 'note-done' ? 'note.done' : 'note.open', id: d.id }); return; }
  if (d.act === 'note-remove') { ed.sel = { kind: 'note', id: d.id }; return deleteSelected(); }
  if (d.act === 'thing-reset') { await send({ op: 'thing.reset', ref: d.ref }, 'Back where it was.'); ed.sel = null; renderPanel(); return; }
  if (d.act === 'thing-turn') { const s = ed.sel; if (!s) return; s.facing = r2((s.facing || 0) + Number(d.step)); await send({ op: 'thing.move', ref: s.ref, at: s.at, facing: s.facing }); return; }
  if (d.act === 'look-reset') { await send({ op: 'look.set', region: o.region, values: Object.fromEntries(Object.keys(LOOK_FIELDS).map(k => [k, null])) }, 'Region look back to the game\'s own.'); return; }
  if (d.act === 'orphan-drop') { await send({ op: 'orphan.drop', id: d.id }, 'Old edit taken out.'); return; }
}
function onUiChange(e) {
  const t = e.target, d = t.dataset, o = ed.opts;
  if (d.act === 'quality') return setQuality(t.value);
  if (d.layer) { ed.overlay[d.layer] = t.checked; prefs[d.layer] = t.checked; savePrefs(); refreshOverlays(); return; }
  if ('follow' in d) { o.follow = t.checked; prefs.follow = t.checked; savePrefs(); return; }
  if (d.opt) { o[d.opt] = t.type === 'checkbox' ? t.checked : t.type === 'range' || t.type === 'number' ? Number(t.value) : t.value; if (d.opt === 'species') { prefs.species = t.value; savePrefs(); } renderPanel(); showHover(); return; }
  if (d.draft) { ed.draft[d.draft] = t.type === 'number' || t.type === 'range' ? Number(t.value) : t.value; renderPanel(); refreshOverlays(); return; }
  if (d.zone) return zoneField(d.zone, t);
  if (d.look) return lookField(d.look, t);
}
let zoneTimer = 0, lookTimer = 0;
function onUiInput(e) {
  const t = e.target, d = t.dataset;
  if (t.type === 'range') { const out = t.parentElement.querySelector('output'); if (out) out.textContent = t.value; }
  if (d.zone && t.type === 'range') { clearTimeout(zoneTimer); zoneTimer = setTimeout(() => zoneField(d.zone, t), 250); }
  if (d.look && (t.type === 'range' || t.type === 'color')) { clearTimeout(lookTimer); lookTimer = setTimeout(() => lookField(d.look, t), 250); }
  if (d.opt && t.type === 'range') { ed.opts[d.opt] = Number(t.value); showHover(); }
}
function zoneField(k, t) { const s = ed.sel; if (s?.kind !== 'zone') return; const v = t.type === 'color' ? t.value : t.type === 'select-one' ? t.value : k === 'mist' ? Number(t.value) / 10000 : Number(t.value); send({ op: 'zone.set', id: s.id, [k]: v }); }
function lookField(k, t) { send({ op: 'look.set', region: ed.opts.region, values: { [k]: t.type === 'color' ? t.value : k === 'mist' ? Number(t.value) / 10000 : Number(t.value) } }); }
async function setQuality(q) {
  const app = ed.app;
  prefs.quality = q; savePrefs();
  setBusy(+1, 'Changing the graphics…');
  try {
    app.settings.quality = q; app.view.setQuality(q);
    const old = app.worldView; app.worldView = makeWorldView(app); await app.worldView.ready?.(); dropWorldView(app, old);
    app.zones.dispose(); app.zones = createZones(app.view, { T: app.W.terrain, edits: ed.server.edits, quality: q });
    app.ambient.dispose(); app.ambient = createAmbient(app.view, { T: app.W.terrain, trees: app.scattered.trees, chimneys: app.worldView.chimneys || [], quality: q, sound: null });
  } finally { setBusy(-1); }
}

// ---------------------------------------------------------------- the side panel (one per tool)
const range = (label, key, v, min, max, step, attr = 'data-opt', tip = '') => `<label class="ed-row"${tip ? ` data-tip="${esc(tip)}"` : ''}><span>${label}</span><input type="range" ${attr}="${key}" min="${min}" max="${max}" step="${step}" value="${v}"><output>${v}</output></label>`;
const seg = (key, cur, list) => `<div class="ed-seg" role="group">${list.map(([v, n, tip]) => `<button class="ow-btn ow-small${cur === v ? ' on' : ''}" data-mode="${v}" data-mode-key="${key}" aria-pressed="${cur === v}"${tip ? ` data-tip="${esc(tip)}"` : ''}>${n}</button>`).join('')}</div>`;
function renderPanel() {
  const P = document.querySelector('.ed-panel'); if (!P) return;
  const S = ed.server, o = ed.opts, tool = TOOLS.find(t => t.id === ed.tool);
  let h = `<h2>${tool.icon} ${tool.name}</h2><p class="ed-help">${esc(tool.tip)}</p>`;
  if (ed.tool === 'look') {
    if (phone) h += '<p class="ed-help">Drag the world to turn · the stick flies · ▲ ▼ up and down · <b>Map</b> to jump anywhere. Notes pins a message where you tap.</p>';
    else h += `<p class="ed-help">Right-drag (or drag with this tool) to turn · <b>WASD</b> fly · <b>Q / E</b> down / up · <b>Shift</b> faster · wheel forward · <b>M</b> map. Keys pick tools: T trees, B bridges, R roads, G ground, H things, F effects, L looks, N notes.</p>`;
    h += reportHtml() + historyHtml();
  } else if (ed.tool === 'trees') {
    h += seg('treeMode', o.treeMode, [['place', 'Place', 'Click to place the chosen kind'], ['move', 'Move', 'Drag a tree'], ['remove', 'Remove', 'Click a tree or rock'], ['area', 'Brush', 'Plant or clear a whole area']]);
    if (o.treeMode === 'place' || o.treeMode === 'area') {
      h += `<label class="ed-row"><span>Kind</span><select data-opt="species"><optgroup label="Trees">${Object.keys(TREE_SPECIES).map(k => `<option value="${k}"${k === o.species ? ' selected' : ''}>${nice(k)} (${TREE_SPECIES[k].h} m)</option>`).join('')}</optgroup>${o.treeMode === 'place' ? `<optgroup label="Rocks and plants">${DECOR_KINDS.map(k => `<option value="${k}"${k === o.species ? ' selected' : ''}>${nice(k)}</option>`).join('')}</optgroup>` : ''}</select></label>`;
    }
    if (o.treeMode === 'place') h += range('Size', 'size', o.size, 0.5, 2, 0.05);
    if (o.treeMode === 'area') {
      h += seg('areaMode', o.areaMode, [['set', 'Set density', 'Replace the trees inside with this density'], ['add', 'Add more', 'Keep the trees, add more between them'], ['clear', 'Clear', 'Remove every tree inside']]);
      h += range('Brush size (m)', 'brushR', o.brushR, 4, 80, 1);
      if (o.areaMode !== 'clear') h += range('Density', 'density', o.density, 0.05, 1, 0.05, 'data-opt', '1 = a tree every 9 m, as thick as the deepest wood');
      h += `<label class="ed-row ed-check"><input type="checkbox" data-opt="areaKinds"${o.areaKinds ? ' checked' : ''}> Only the chosen kind (else the region's mix)</label>`;
    }
    const list = S.edits.trees;
    h += `<p class="ed-stat">${list.add.length} added · ${list.remove.length} removed · ${list.areas.length} brushed areas · ${S.edits.decor.add.length + S.edits.decor.remove.length} rock edits</p>`;
  } else if (ed.tool === 'bridges') {
    h += `<div class="ed-list">${S.bridges.map(b => `<button class="ed-item${ed.draft?.id === b.id ? ' on' : ''}" data-act="bridge" data-id="${b.id}"><b>${esc(b.name || nice(b.id))}</b><span>${b.kind === 'ford' ? 'Ford' : b.art === 'bridge-stone' ? 'Stone bridge' : 'Wooden bridge'} · deck ${b.deck.toFixed(1)} m · water ${b.surface?.toFixed(1)} m</span></button>`).join('')}</div>`;
    const dr = ed.draft;
    if (dr) {
      const b = S.bridges.find(q => q.id === dr.id);
      const num = (k, label, step, tip) => `<div class="ed-row" data-tip="${esc(tip)}"><span>${label}</span><button class="ow-btn ow-small" data-act="bridge-step" data-key="${k}" data-step="-${step}" aria-label="${label} down">−</button><input type="number" step="${step}" data-draft="${k}" value="${dr[k]}"><button class="ow-btn ow-small" data-act="bridge-step" data-key="${k}" data-step="${step}" aria-label="${label} up">+</button></div>`;
      h += `<h3>${esc(b?.name || nice(dr.id))}</h3>`;
      h += num('deck', 'Deck height (m)', 0.1, `The walked height of the deck. Water is at ${b?.surface?.toFixed(2)} m.`);
      h += num('width', 'Width (m)', 0.5, 'Across the deck, rail to rail');
      h += num('ramp', 'Level run (m)', 0.5, 'Metres of road held level with the deck past each end before it slopes away');
      h += `<label class="ed-row"><span>Kind</span><select data-draft="kind"><option value="bridge"${dr.kind === 'bridge' ? ' selected' : ''}>Bridge</option><option value="ford"${dr.kind === 'ford' ? ' selected' : ''}>Ford (wade across)</option></select></label>`;
      if (dr.kind === 'bridge') h += `<label class="ed-row"><span>Built of</span><select data-draft="art"><option value="bridge-wood"${dr.art === 'bridge-wood' ? ' selected' : ''}>Wood</option><option value="bridge-stone"${dr.art === 'bridge-stone' ? ' selected' : ''}>Stone</option></select></label>`;
      h += `<p class="ed-help">Drag the yellow balls to move the ends${dr.a ? '' : ' (they follow the river until you do)'}.</p><label class="ed-row ed-check"><input type="checkbox" data-opt="snap"${o.snap ? ' checked' : ''}> Keep the ends on the road</label>`;
      h += `<div class="ed-btns"><button class="ow-btn ow-primary" data-act="bridge-apply">Save bridge</button><button class="ow-btn ow-ghost" data-act="bridge-reset" data-tip="Forget the hand-set ends, deck, width and run">Work it out again</button></div>`;
    } else h += '<p class="ed-help">Pick a crossing above, or click one in the world.</p>';
  } else if (ed.tool === 'lines') {
    const L = S.lines || { roads: [], rivers: [] };
    h += seg('lineMode', o.lineMode || 'move', [['move', 'Move points', 'Drag a point'], ['add', 'Add point', 'Click near the line'], ['remove', 'Remove point', 'Click a point']]);
    if (ed.draft?.points) h += `<h3>${esc(ed.draft.name || nice(ed.draft.id))} · ${ed.draft.points.length} points</h3><p class="ed-help">The road is graded and cut into the ground from these points (and every crossing worked out again) when you let go.</p>`;
    h += `<details open><summary>Roads</summary><div class="ed-list">${L.roads.map(r => `<button class="ed-item${ed.draft?.id === r.id ? ' on' : ''}" data-act="line" data-line="roads" data-id="${r.id}"><b>${esc(r.name || nice(r.id))}</b><span>${r.points.length} points${r.town ? ' · town street' : ''}</span></button>`).join('')}</div></details>`;
    h += `<details><summary>Rivers</summary><div class="ed-list">${L.rivers.map(r => `<button class="ed-item${ed.draft?.id === r.id ? ' on' : ''}" data-act="line" data-line="rivers" data-id="${r.id}"><b>${esc(r.name || nice(r.id))}</b><span>${r.points.length} points</span></button>`).join('')}</div></details>`;
  } else if (ed.tool === 'ground') {
    h += seg('ground', o.ground, GROUND_KINDS.map(k => [k, nice(k)]));
    h += range('Brush size (m)', 'groundR', o.groundR, 2, 40, 1);
    h += range(o.ground === 'flatten' || o.ground === 'smooth' ? 'Strength' : 'Height (m)', 'groundAmt', o.groundAmt, o.ground === 'flatten' || o.ground === 'smooth' ? 0.1 : 0.2, o.ground === 'flatten' || o.ground === 'smooth' ? 1 : 6, 0.1);
    h += `<p class="ed-help">Click, or drag to paint (one undo step per drag). Flatten levels to the height where you start. Roads, towns and river beds are cut in after the brush, so they keep their shape.</p><p class="ed-stat">${S.edits.ground.length} strokes in the layer</p>`;
  } else if (ed.tool === 'things') {
    const s = ed.sel?.kind === 'thing' ? ed.sel : null;
    if (s) h += `<h3>${esc(s.name)}</h3><p class="ed-stat">${s.kind} · ${s.at.map(v => v.toFixed(1)).join(', ')}</p><div class="ed-btns"><button class="ow-btn ow-small" data-act="thing-turn" data-step="-0.3927">⟲ Turn</button><button class="ow-btn ow-small" data-act="thing-turn" data-step="0.3927">⟳ Turn</button>${S.edits.moves[s.ref] ? `<button class="ow-btn ow-small ow-ghost" data-act="thing-reset" data-ref="${esc(s.ref)}">Put back</button>` : ''}</div>`;
    else h += '<p class="ed-help">Drag a shrine, chest, camp, person or prop to move it. Click one to turn it.</p>';
    const moved = Object.keys(S.edits.moves);
    h += `<p class="ed-stat">${moved.length} moved</p>${moved.length ? `<div class="ed-list">${moved.map(r => `<button class="ed-item" data-act="goto" data-at="${S.edits.moves[r].at.join(',')}"><b>${esc(nice(r.split(':')[1]))}</b><span>${esc(nice(r.split(':')[0]))}</span></button>`).join('')}</div>` : ''}`;
  } else if (ed.tool === 'effects') {
    h += `<div class="ed-add">${Object.entries(ZONE_KINDS).map(([k, z]) => `<button class="ow-btn ow-small${o.placingZone && o.zoneKind === k ? ' on' : ''}" data-act="zone-place" data-kind="${k}">+ ${z.name}</button>`).join('')}</div>`;
    const z = ed.sel?.kind === 'zone' ? S.edits.zones.find(q => q.id === ed.sel.id) : null;
    if (z) {
      const D = ZONE_KINDS[z.kind] || {};
      const zr = (label, k, min, max, step, tip) => range(label, k, z[k] ?? D[k] ?? 0, min, max, step, 'data-zone', tip);
      h += `<h3>${esc(z.name || ZONE_KINDS[z.kind]?.name || z.kind)}</h3>`;
      h += `<label class="ed-row"><span>Kind</span><select data-zone="kind">${Object.entries(ZONE_KINDS).map(([k, q]) => `<option value="${k}"${k === z.kind ? ' selected' : ''}>${q.name}</option>`).join('')}</select></label>`;
      h += zr('Size (m)', 'r', 2, 300, 1) + zr('Soft edge (m)', 'soft', 0, 150, 1, 'How far it fades in as you walk in') + zr('Amount', 'amount', 0, 3, 0.05, 'More or fewer particles');
      h += `<h3>Colour of the air inside</h3>${range('Mist (0–100)', 'mist', Math.round((z.mist ?? D.mist ?? 0) * 10000), 0, 100, 1, 'data-zone', 'Extra low mist inside the zone')}${zr('Colour (saturation)', 'saturation', -0.4, 0.4, 0.01)}${zr('Contrast', 'contrast', -0.3, 0.3, 0.01)}${zr('Brightness', 'exposure', -0.3, 0.3, 0.01)}${zr('Glow (bloom)', 'bloom', -0.2, 0.4, 0.01)}<label class="ed-row"><span>Tint</span><input type="color" data-zone="tint" value="${z.tint || D.tint || '#ffffff'}"></label>${zr('Tint strength', 'tintAmount', 0, 0.5, 0.01)}`;
      h += `<p class="ed-help">Drag the white ball to move it. Delete key removes it.</p><div class="ed-btns"><button class="ow-btn ow-small ow-danger" data-act="zone-remove" data-id="${z.id}">Remove zone</button></div>`;
    }
    h += `<div class="ed-list">${S.edits.zones.map(q => `<button class="ed-item${ed.sel?.id === q.id ? ' on' : ''}" data-act="zone" data-id="${q.id}"><b>${esc(q.name || ZONE_KINDS[q.kind]?.name || q.kind)}</b><span>${ZONE_KINDS[q.kind]?.name || q.kind} · ${q.r} m</span></button>`).join('')}</div>`;
    const L = ed.app.zones?.look;
    if (L) h += `<p class="ed-stat">Here: ${L.zones.length ? `inside ${L.zones.length} zone${L.zones.length > 1 ? 's' : ''}` : 'no zone'} · ${ed.app.zones.stats.particles} particles drawn</p>`;
  } else if (ed.tool === 'looks') {
    const regions = S.lines?.regions || Object.keys(ed.app.W.data.map.regions);
    o.region = o.region || regions[0];
    h += seg('region', o.region, regions.map(r => [r, nice(r)]));
    const L = S.edits.looks[o.region] || {}, base = ed.app.zones?.look || {};
    const lim = LOOK_FIELDS;
    const names = { exposure: 'Brightness', saturation: 'Colour (saturation)', contrast: 'Contrast', warm: 'Warmth', bloom: 'Glow (bloom)', mist: 'Low mist' };
    for (const k of ['exposure', 'saturation', 'contrast', 'warm', 'bloom', 'mist']) {
      // mist is shown in steps of 0.0001 (0–60) so no long decimals reach the screen
      const m = k === 'mist' ? 10000 : 1, v = Math.round((L[k] ?? base[k] ?? 0) * m * 100) / 100, step = k === 'mist' ? 1 : 0.01;
      h += range(`${names[k]}${k === 'mist' ? ' (0–60)' : ''}${L[k] == null ? ' (game)' : ''}`, k, v, lim[k][0] * m, lim[k][1] * m, step, 'data-look');
    }
    const hex = a => '#' + (a || [1, 1, 1]).map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('');
    h += `<label class="ed-row"><span>Fog colour${L.fogColour ? '' : ' (game)'}</span><input type="color" data-look="fogColour" value="${L.fogColour || hex(base.fogColour)}"></label>`;
    h += `<label class="ed-row"><span>Sun colour${L.sunColour ? '' : ' (game)'}</span><input type="color" data-look="sunColour" value="${L.sunColour || hex(base.sunColour)}"></label>`;
    h += `<p class="ed-help">Fades across the border between the regions. Low quality has no grade (brightness, mist, fog and sun still change). Keep it lively — a washed-out picture is the bug we keep fixing.</p><div class="ed-btns"><button class="ow-btn ow-small ow-ghost" data-act="look-reset">Back to the game's look</button></div>`;
  } else if (ed.tool === 'notes') {
    h += '<p class="ed-help">Click the ground to pin a note. Claude sees them with <code>map-edit.mjs notes</code>.</p>';
    const n = ed.sel?.kind === 'note' ? S.edits.notes.find(q => q.id === ed.sel.id) : null;
    if (n) h += `<div class="ed-note ${n.done ? 'done' : ''}"><p>${esc(n.text)}</p><span>${esc(nice(n.by))}${n.done ? ` · done by ${esc(nice(n.doneBy || ''))}` : ''}</span>${n.reply ? `<p class="ed-reply">${esc(n.reply)}</p>` : ''}<div class="ed-btns">${n.done ? `<button class="ow-btn ow-small" data-act="note-open" data-id="${n.id}">Open again</button>` : `<button class="ow-btn ow-small" data-act="note-done" data-id="${n.id}">Mark done</button>`}<button class="ow-btn ow-small ow-danger" data-act="note-remove" data-id="${n.id}">Remove</button></div></div>`;
    h += `<div class="ed-list">${S.edits.notes.slice().reverse().map(q => `<button class="ed-item ${q.done ? 'done' : 'open'}${ed.sel?.id === q.id ? ' on' : ''}" data-act="note" data-id="${q.id}"><b>${esc(q.text.slice(0, 60))}</b><span>${q.done ? 'Done' : 'Open'} · ${esc(nice(q.by))}</span></button>`).join('') || '<p class="ed-help">No notes yet.</p>'}</div>`;
  }
  P.innerHTML = h;
  const u = document.querySelector('[data-act="undo"]'), r = document.querySelector('[data-act="redo"]');
  if (u) u.disabled = !S.undo; if (r) r.disabled = !S.redo;
}
function reportHtml() {
  const o = ed.server.report?.orphans || [];
  if (!o.length) return '<p class="ed-stat ed-good">Every edit found its target.</p>';
  return `<h3>Edits whose target is gone (${o.length})</h3><p class="ed-help">The world changed under these (a re-run of the generator, a moved road). They stay in the file until you take them out.</p><div class="ed-list">${o.map(x => `<div class="ed-item"><b>${esc(x.kind)} ${esc(x.id || x.ref)}</b><span>${esc(x.why)}</span><button class="ow-btn ow-small" data-act="orphan-drop" data-id="${esc(x.id || x.ref)}">Take out</button></div>`).join('')}</div>`;
}
function historyHtml() {
  const H = ed.server.history || [];
  return `<h3>Recent changes</h3><div class="ed-list ed-hist">${H.slice().reverse().slice(0, 25).map(e => `<${e.spot ? 'button' : 'div'} class="ed-item"${e.spot ? ` data-act="goto" data-at="${e.spot.join(',')}"` : ''}><b>${esc(e.what)}</b><span>${esc(nice(e.by))} · ${esc(String(e.at).slice(11, 16))}</span></${e.spot ? 'button' : 'div'}>`).join('') || '<p class="ed-help">Nothing changed yet this session.</p>'}</div>`;
}

// ---------------------------------------------------------------- overlays + labels
let ovAt = { x: 1e9, z: 1e9 };
function refreshOverlays() {
  const app = ed.app, T = app.W.terrain, at = ed.fly.pos;
  ed.ov.lines(T, ed.overlay.lines || ed.tool === 'lines');
  ed.ov.areas(T, ed.overlay.areas);
  ed.ov.colliders(app.ground, at, ed.overlay.colliders);
  ed.ov.zones(ed.server.edits.zones, ed.sel?.kind === 'zone' ? ed.sel.id : null, ed.overlay.zones || ed.tool === 'effects');
  ed.ov.bridge(ed.tool === 'bridges' && ed.draft ? ed.server.bridges.find(b => b.id === ed.draft.id) : null, ed.draft);
  ed.ov.points(ed.tool === 'lines' && ed.draft?.points ? ed.draft.points : null, ed.draft?.sel ?? -1, ed.draft?.line === 'rivers' ? 0x6fc0ff : 0xffffff);
  ed.ov.notes(ed.server.edits.notes);
  ed.ov.marker(ed.server.marker);
  ovAt = { x: at.x, z: at.z };
}
function refreshAll() { renderPanel(); refreshOverlays(); drawMarks(); }
function drawMarks() { ed.map?.marks({ cam: { x: ed.fly.pos.x, z: ed.fly.pos.z, yaw: ed.fly.yaw }, marker: ed.server.marker, notes: ed.server.edits.notes, zones: ed.server.edits.zones }); }
const labelPool = [];
function labels() {
  const host = document.getElementById('ed-labels'), T = ed.app.W.terrain, at = ed.fly.pos, out = [];
  for (const n of ed.server.edits.notes) out.push({ at: n.at, y: 4.9, text: n.text.length > 42 ? n.text.slice(0, 40) + '…' : n.text, cls: n.done ? 'done' : 'note' });
  if (ed.server.marker?.at) out.push({ at: ed.server.marker.at, y: 31, text: `${nice(ed.server.marker.by || 'claude')}: ${ed.server.marker.what || ''}`, cls: 'claude' });
  if (ed.overlay.ids) {
    for (const t of ed.app.scattered.trees) if (Math.abs(t.x - at.x) < 40 && Math.abs(t.z - at.z) < 40) out.push({ at: [t.x, t.z], y: 2.2, text: t.id, cls: 'id' });
    for (const d of ed.app.scattered.decor) if (d.solid && Math.abs(d.x - at.x) < 25 && Math.abs(d.z - at.z) < 25) out.push({ at: [d.x, d.z], y: 1, text: d.id, cls: 'id' });
  }
  if (ed.tool === 'things') for (const t of allThings()) if (Math.hypot(t.at[0] - at.x, t.at[1] - at.z) < 90) out.push({ at: t.at, y: 3, text: t.name, cls: ed.sel?.ref === t.ref ? 'sel' : 'thing' });
  if (ed.tool === 'effects' || ed.overlay.zones) for (const z of ed.server.edits.zones) if (Math.hypot(z.at[0] - at.x, z.at[1] - at.z) < z.r + 120) out.push({ at: z.at, y: 2.5, text: z.name || ZONE_KINDS[z.kind]?.name || z.kind, cls: 'zone' });
  if (ed.overlay.areas) for (const a of T.map.areas || []) out.push({ at: a.at, y: 6, text: `${a.name || nice(a.id || '')} · levels ${a.levels.join('–')}`, cls: 'area' });
  let n = 0;
  for (const L of out) {
    if (n >= 160) break;
    const p = screenOf(L.at[0], T.heightAt(L.at[0], L.at[1]) + L.y, L.at[1]);
    if (!p || p[0] < -50 || p[1] < -20 || p[0] > innerWidth + 50 || p[1] > innerHeight + 20) continue;
    let el = labelPool[n];
    if (!el) { el = document.createElement('span'); host.append(el); labelPool.push(el); }
    if (el.textContent !== L.text) el.textContent = L.text;
    el.className = 'ed-lab ' + L.cls; el.style.transform = `translate(${Math.round(p[0])}px, ${Math.round(p[1])}px) translate(-50%, -100%)`; el.hidden = false;
    n++;
  }
  for (let i = n; i < labelPool.length; i++) labelPool[i].hidden = true;
}

// ---------------------------------------------------------------- the frame
let last = performance.now(), camSave = 0, markAt = 0, lastMarkPos = null;
function loop() {
  requestAnimationFrame(loop);
  const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
  const app = ed.app, f = ed.fly;
  f.update(dt);
  // the ground under the middle of the screen is "where we are" (shadows, zones, ambient, the near-only overlays)
  const look = { x: f.pos.x - Math.sin(f.yaw) * 20 * Math.cos(f.pitch), z: f.pos.z - Math.cos(f.yaw) * 20 * Math.cos(f.pitch) };
  app.view.follow(look.x, app.W.terrain.heightAt(look.x, look.z), look.z);
  app.worldView.update(dt, look);
  app.ambient.wet = app.weather.update(dt, { at: look }).rain;
  app.ambient.update(dt, look);
  app.zones.update(dt, { x: f.pos.x, z: f.pos.z });
  app.view.render();
  labels();
  if (Math.hypot(ovAt.x - f.pos.x, ovAt.z - f.pos.z) > 25 && (ed.overlay.colliders)) refreshOverlays();
  if ((camSave -= dt) <= 0) { camSave = 2; prefs.cam = { x: r1(look.x), z: r1(look.z), yaw: r2(f.yaw), pitch: r2(f.pitch) }; savePrefs(); drawMarks(); }
  // tell the server where this editor is looking (others see it as a marker only when it is Claude's)
  if ((markAt -= dt) <= 0 && ed.link?.state === 'open' && ed.link.who === 'claude') { markAt = 1; if (!lastMarkPos || Math.hypot(look.x - lastMarkPos[0], look.z - lastMarkPos[1]) > 5) { lastMarkPos = [r1(look.x), r1(look.z)]; ed.link.marker(lastMarkPos, 'looking'); } }
}

boot().catch(e => {
  console.error(e);
  const p = document.querySelector('#loading p');
  if (p) p.textContent = 'Something went wrong while loading the editor. Reload the page to try again.';
});
export { ed, tell };
