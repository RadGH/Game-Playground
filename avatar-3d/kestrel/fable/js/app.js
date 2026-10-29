// Kestrel fable attempt — preview page. One renderer, one actor; views match the review page's cameras
// (compare.js `placeCamera`) so the shots line up with the Codex references. Sheet modes draw a grid of views,
// expressions or poses into one canvas for the screenshot tool.
import * as THREE from 'three';
import { createKestrelCharacter, KESTREL_ANIMS, KESTREL_EXPRESSIONS, KESTREL_INFO } from './kestrel.js';
import { lookFor } from '../../js/looks.js';

const $ = s => document.querySelector(s);
const qs = new URLSearchParams(location.search);
const state = {
  body: qs.get('body') === 'female' ? 'female' : 'male',
  view: qs.get('view') || 'front', anim: qs.get('anim') || 'idle', expr: qs.get('expr') || 'neutral',
  outfit: qs.get('outfit') === '1', lod: qs.get('lod') === '1', wire: qs.get('wire') === '1', spin: false, look: false,
  sheet: qs.get('sheet') || '', freeze: qs.get('freeze') === '1',
};
const VIEWS = { front: 'Front', left: 'Left side', back: 'Back', right: 'Right side', three: '3/4', face: 'Face', free: 'Free', hand: 'Hand', foot: 'Foot' };
const report = window.__kf = { ready: false, info: KESTREL_INFO, stats: null, error: null };

const canvas = $('#view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene(); scene.background = new THREE.Color('#c9ccd1');
scene.add(new THREE.HemisphereLight('#ffffff', '#8a8f99', 1.6));
const key = new THREE.DirectionalLight('#ffffff', 2.2); key.position.set(2, 4, 3); scene.add(key);
const rim = new THREE.DirectionalLight('#dfe8ff', 0.9); rim.position.set(-3, 3, -2); scene.add(rim);
const floor = new THREE.Mesh(new THREE.CircleGeometry(0.9, 40), new THREE.MeshStandardMaterial({ color: '#b5b9c0', roughness: 1 }));
floor.rotation.x = -Math.PI / 2; floor.position.y = -0.002; scene.add(floor);
const cam = new THREE.PerspectiveCamera(30, 0.75, 0.05, 50);
let yaw = 0, actor = null;

/** The review page's cameras. Left view = the character's left side (they face picture-left); 3/4 turns to picture-left. */
function placeCamera(cam, view, h, yaw, aspect = 0.75) {
  const dirs = { front: [0, 1], back: [0, -1], left: [1, 0], right: [-1, 0], three: [0.72, 0.7], free: [Math.sin(yaw), Math.cos(yaw)] };
  cam.aspect = aspect;
  if (view === 'face') {
    const head = h * 0.93; cam.fov = 22;
    cam.position.set(Math.sin(yaw) * 0.85, head, Math.cos(yaw) * 0.85); cam.lookAt(0, head, 0);
  } else if ((view === 'hand' || view === 'foot') && actor) {
    const b = actor.parts[view === 'hand' ? 'handR' : 'footR'], t = new THREE.Vector3(); b.getWorldPosition(t);
    if (view === 'hand') t.y -= 0.07; else { t.y -= 0.04; t.z += 0.06; }
    cam.fov = 20; const a = yaw + (view === 'hand' ? -0.9 : 0.6);
    cam.position.set(t.x + Math.sin(a) * 0.5, t.y + (view === 'hand' ? 0.05 : 0.25), t.z + Math.cos(a) * 0.5); cam.lookAt(t);
  } else {
    let [x, z] = dirs[view] || dirs.front;
    if (yaw && view !== 'free') { const c = Math.cos(yaw), s = Math.sin(yaw); [x, z] = [x * c + z * s, -x * s + z * c]; }
    const d = h * 2.55; cam.fov = 30;
    cam.position.set(x * d, h * 0.52, z * d); cam.lookAt(0, h * 0.5, 0);
  }
  cam.updateProjectionMatrix();
}

async function build() {
  const t0 = performance.now();
  const look = lookFor(state.body, state.outfit);
  if (qs.get('hair')) look.hair.id = qs.get('hair');                 // dev: try another hair style
  const next = await createKestrelCharacter(look, { lod: state.lod ? 1 : 0 });
  if (actor) { scene.remove(actor.group); actor.dispose(); }
  actor = next; scene.add(actor.group);
  actor.setAnim(state.anim, 0, true); actor.setExpression(state.expr, 1, 0.001);
  apply();
  const s = actor.stats();
  report.stats = { ...s, height: actor.metrics().height, pageBuildMs: performance.now() - t0 };
  $('#line').textContent = `${s.triangles.toLocaleString()} triangles · ${s.drawCalls} draw call · ${s.bones} bones · ${actor.metrics().height.toFixed(2)} m · built in ${Math.round(s.buildMs)} ms`;
}
function apply() {
  if (!actor) return;
  actor.setAnim(state.anim, 0.15, true); actor.setExpression(state.expr);
  actor.group.traverse(o => { if (o.isMesh) [].concat(o.material).forEach(m => { m.wireframe = state.wire; }); });
}

function buttons(host, items, k) {
  const el = $(host); el.innerHTML = '';
  for (const [v, text] of items) {
    const b = document.createElement('button'); b.textContent = text; b.dataset.v = v; if (state[k] === v) b.className = 'on';
    b.onclick = async () => { state[k] = v; for (const x of el.children) x.classList.toggle('on', x.dataset.v === v); if (k === 'body') await build(); else apply(); };
    el.appendChild(b);
  }
}

// ---------- the sheet modes (one grid in one canvas) ----------
async function drawSheet(kind) {
  document.body.classList.add('sheet');
  const W = +(qs.get('w') || 1200), H = +(qs.get('h') || (kind === 'views' ? 800 : kind === 'poses' ? 1000 : 820));
  canvas.width = W; canvas.height = H; canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  renderer.setPixelRatio(1); renderer.setSize(W, H, false); renderer.setScissorTest(true);
  const h = actor.metrics().height;
  let cells;
  if (kind === 'views') cells = ['front', 'three', 'left', 'back', 'right', 'face'].map(v => ({ view: v, label: VIEWS[v] }));
  else if (kind === 'expr') cells = KESTREL_EXPRESSIONS.map(e => ({ view: 'face', expr: e, label: e }));
  else if (kind === 'clip') cells = Array.from({ length: 8 }, (_, i) => ({ view: qs.get('view') || 'three', anim: state.anim, u: i / 8, label: `${state.anim} ${i}/8` }));
  else cells = KESTREL_ANIMS.map(a => ({ view: 'three', anim: a, label: a }));
  const cols = kind === 'poses' || kind === 'clip' ? 8 : 6, rows = Math.ceil(cells.length / cols);
  const cw = Math.floor(W / cols), ch = Math.floor(H / rows);
  // settle the face driver (no blink mid-shot)
  actor.setBlink(0); actor.setGaze(0, 0);
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i], x = (i % cols) * cw, y = H - (Math.floor(i / cols) + 1) * ch;
    if (c.expr) { actor.setExpression(c.expr, 1, 0.001); actor.setAnim('idle', 0, true); }
    if (c.anim) { actor.setAnim(c.anim, 0, true); actor.setExpression('neutral', 1, 0.001); }
    // advance to a telling frame of the clip
    const at = { idle: 0.3, ready: 0.4, walk: 0.25, run: 0.3, sprint: 0.3, crouch: 0.5, attack: 0.42, aim: 0.5, interact: 0.5, cast: 0.62, hit: 0.25, guard: 0.5, wave: 0.42, talk: 0.6, jump: 0.5, dead: 0.95 };
    const secs = c.anim ? (c.u ?? at[c.anim] ?? 0.4) * clipLen(c.anim) : 0.35;
    if (c.u != null) { actor.setAnim(c.anim, 0, true); }
    let left = secs; while (left > 0) { const d = Math.min(0.05, left); actor.update(d); left -= d; }
    if (!c.anim) actor.update(0.3);
    const view = c.view === 'three' && c.anim ? 'three' : c.view;
    placeCamera(cam, c.anim === 'dead' ? 'left' : view, h, 0, cw / ch);
    if (c.anim === 'dead') { cam.position.set(h * 2.2, h * 0.9, h * 0.6); cam.lookAt(0, 0.15, -0.1); cam.updateProjectionMatrix(); }
    if (c.anim === 'jump') { cam.position.y += 0.25; cam.lookAt(0, h * 0.62, 0); cam.updateProjectionMatrix(); }
    renderer.setViewport(x, y, cw, ch); renderer.setScissor(x, y, cw, ch);
    renderer.render(scene, cam);
  }
  renderer.setScissorTest(false);
  // labels
  const ctx = canvas.getContext('2d');          // not available on a WebGL canvas: labels go in the page title instead
  document.title = `Kestrel fable — ${kind} sheet (${cells.map(c => c.label).join(', ')})`;
}
function clipLen(name) { return { idle: 3.6, ready: 1.8, walk: 1.0, run: 0.62, sprint: 0.52, crouch: 2.6, attack: 0.9, aim: 2.2, interact: 1.3, cast: 1.3, hit: 0.55, guard: 2.2, wave: 2.0, talk: 2.6, jump: 1.05, dead: 1.3 }[name] || 1; }

// ---------- boot ----------
async function boot() {
  buttons('#c-body', [['male', 'Male'], ['female', 'Female']], 'body');
  buttons('#c-view', Object.entries(VIEWS), 'view');
  buttons('#c-anim', KESTREL_ANIMS.map(a => [a, a]), 'anim');
  buttons('#c-expr', KESTREL_EXPRESSIONS.map(e => [e, e]), 'expr');
  for (const [id, k] of [['#c-outfit', 'outfit'], ['#c-spin', 'spin'], ['#c-wire', 'wire'], ['#c-lod', 'lod'], ['#c-look', 'look']]) {
    $(id).checked = state[k]; $(id).onchange = async e => { state[k] = e.target.checked; if (k === 'outfit' || k === 'lod') await build(); else if (k === 'look') actor.lookAt(state.look ? cam.position : null, { head: 0.4 }); else apply(); };
  }
  let drag = null;
  canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, yaw }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', e => { if (drag) yaw = drag.yaw + (e.clientX - drag.x) * 0.012; });
  canvas.addEventListener('pointerup', () => { drag = null; });
  canvas.addEventListener('dblclick', () => { yaw = 0; });
  await build();
  if (state.sheet) { await drawSheet(state.sheet); report.ready = true; return; }
  if (state.freeze) { actor.setBlink(0); actor.setGaze(0, 0); for (let i = 0; i < 20; i++) actor.update(0.05); }
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (!state.freeze) actor.update(dt);
    if (state.spin) yaw += dt * 0.6;
    const r = canvas.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
    if (canvas.width !== w || canvas.height !== h) { renderer.setPixelRatio(1); renderer.setSize(w, h, false); }
    placeCamera(cam, state.view, actor.metrics().height, yaw, w / h);
    if (state.look) actor.lookAt(cam.position, { head: 0.4 });
    renderer.render(scene, cam);
    if (!report.ready) report.ready = true;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
boot().catch(err => { report.error = String(err?.message || err); document.body.insertAdjacentHTML('beforeend', `<p class="bad">Failed: ${report.error}</p>`); });
