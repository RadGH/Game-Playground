// Kestrel (opus) preview page: one character, every clip, every expression, outfit on/off, LOD, the review page's
// camera angles. Same lights and camera placement as the shared review page (../js/compare.js), so shots match.
import * as THREE from 'three';
import { createKestrelCharacter, KESTREL_ANIMS, EXPRESSIONS } from './kestrel.js';
import { lookFor } from '../../js/looks.js';

const $ = s => document.querySelector(s);
const qs = new URLSearchParams(location.search);
const state = {
  body: qs.get('body') === 'female' ? 'female' : 'male', view: qs.get('view') || 'front', anim: qs.get('anim') || 'idle',
  expr: qs.get('expr') || 'neutral', outfit: qs.get('outfit') === '1', lod: qs.get('lod') === '1', wire: qs.get('w') === '1', spin: false,
};
if (qs.get('skip')) globalThis.__kestrelSkip = qs.get('skip');
if (qs.get('noao')) globalThis.__kestrelNoAO = true;
const freeze = qs.has('t') ? +qs.get('t') : null;
if (qs.get('shot') === '1') document.body.classList.add('shot');
const report = window.__opus = { ready: false };

const canvas = $('#view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
const scene = new THREE.Scene();
scene.background = new THREE.Color(qs.get('bg') || '#c9ccd1');
scene.add(new THREE.HemisphereLight('#ffffff', '#8a8f99', 1.6));
const key = new THREE.DirectionalLight('#ffffff', 2.2); key.position.set(2, 4, 3); scene.add(key);
const rim = new THREE.DirectionalLight('#dfe8ff', 0.9); rim.position.set(-3, 3, -2); scene.add(rim);
const floor = new THREE.Mesh(new THREE.CircleGeometry(0.9, 40), new THREE.MeshStandardMaterial({ color: '#b5b9c0', roughness: 1 }));
floor.rotation.x = -Math.PI / 2; floor.position.y = -0.002; scene.add(floor);
const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
let yaw = 0;

function placeCamera(view, h) {
  const dirs = { front: [0, 1], back: [0, -1], left: [1, 0], right: [-1, 0], three: [0.72, 0.7], free: [Math.sin(yaw), Math.cos(yaw)] };
  if (view === 'face') {
    const head = h * 0.93;
    cam.fov = 22; cam.position.set(Math.sin(yaw) * 0.85, head, Math.cos(yaw) * 0.85); cam.lookAt(0, head, 0);
  } else if (view === 'head' || view === 'headL' || view === 'headB' || view === 'head3') {
    const hy = h * 0.905, a = { head: 0, headL: Math.PI / 2, headB: Math.PI, head3: 0.8 }[view] + yaw;
    cam.fov = 27; cam.position.set(Math.sin(a) * 0.95, hy, Math.cos(a) * 0.95); cam.lookAt(0, hy, 0);
  } else if (view === 'torso' || view === 'torsoB' || view === 'legs' || view === 'legsB') {
    const ty = { torso: 0.68, torsoB: 0.68, legs: 0.28, legsB: 0.28 }[view] * h, a = (view.endsWith('B') ? Math.PI : 0) + yaw;
    cam.fov = 30; cam.position.set(Math.sin(a) * 1.6, ty, Math.cos(a) * 1.6); cam.lookAt(0, ty, 0);
  } else if (view === 'hand' || view === 'handB' || view === 'foot') {
    const hp = new THREE.Vector3(); (view === 'foot' ? actor.parts.footR : actor.parts.handR).getWorldPosition(hp);
    const a = (view === 'handB' ? Math.PI * 0.75 : view === 'foot' ? 0.5 : -0.5) + yaw + (view === 'foot' ? 0 : Math.PI / 2);
    const c = hp.clone().add(view === 'foot' ? new THREE.Vector3(0, 0.03, 0.06) : new THREE.Vector3(0, -0.08, 0));
    cam.fov = 20; cam.position.set(c.x + Math.sin(a) * 0.7, c.y + 0.1, c.z + Math.cos(a) * 0.7); cam.lookAt(c);
  } else if (view === 'closeup') {
    const head = h * 0.92;
    cam.fov = 14; cam.position.set(Math.sin(yaw) * 0.85, head, Math.cos(yaw) * 0.85); cam.lookAt(0, head, 0);
  } else {
    let [x, z] = dirs[view] || dirs.front;
    if (yaw && view !== 'free') { const c = Math.cos(yaw), s = Math.sin(yaw); [x, z] = [x * c + z * s, -x * s + z * c]; }
    const d = h * 2.55;
    cam.fov = 30; cam.position.set(x * d, h * 0.52, z * d); cam.lookAt(0, h * 0.5, 0);
  }
  cam.updateProjectionMatrix();
}

let actor = null;
async function rebuild() {
  const t0 = performance.now();
  const look = lookFor(state.body, state.outfit);
  if (!actor) { actor = await createKestrelCharacter(look, { lod: state.lod ? 1 : 0 }); scene.add(actor.group); }
  else { await actor.setAvatar(look); actor.setLod(state.lod ? 1 : 0); }
  actor.setAnim(state.anim, 0, true);
  actor.setExpression(state.expr, 1, 0.001);
  actor.group.traverse(o => { if (o.isMesh && o.material && o !== floor) o.material.wireframe = state.wire; });
  if (freeze != null) { actor.update(0.001); actor.setBlink(0); for (let t = 0; t < freeze; t += 0.05) actor.update(Math.min(0.05, freeze - t)); actor.update(0.3); }
  const s = actor.stats();
  report.stats = { ...s, height: actor.metrics().height, ms: performance.now() - t0 };
  $('#line').textContent = `${s.triangles.toLocaleString()} triangles · ${s.drawCalls} draw call · ${s.bones} bones · ${actor.metrics().height.toFixed(2)} m · built in ${Math.round(s.buildMs)} ms`;
}

function buttons(host, items, k) {
  const el = $(host); el.innerHTML = '';
  for (const [v, text] of items) {
    const b = document.createElement('button'); b.textContent = text; b.dataset.v = v; if (state[k] === v) b.className = 'on';
    b.onclick = async () => { state[k] = v; for (const x of el.children) x.classList.toggle('on', x.dataset.v === v); if (k === 'anim') actor.setAnim(v, 0.15, true); else if (k === 'expr') actor.setExpression(v); else if (k !== 'view') await rebuild(); };
    el.appendChild(b);
  }
}
buttons('#c-body', [['male', 'Male'], ['female', 'Female']], 'body');
buttons('#c-view', [['front', 'Front'], ['left', 'Left'], ['back', 'Back'], ['right', 'Right'], ['three', '3/4'], ['face', 'Face'], ['free', 'Free']], 'view');
buttons('#c-anim', KESTREL_ANIMS.map(a => [a, a]), 'anim');
buttons('#c-expr', EXPRESSIONS.map(e => [e, e]), 'expr');
for (const [id, k] of [['#c-outfit', 'outfit'], ['#c-lod', 'lod'], ['#c-wire', 'wire'], ['#c-spin', 'spin']]) {
  $(id).checked = state[k]; $(id).onchange = async e => { state[k] = e.target.checked; if (k !== 'spin') await rebuild(); };
}
let drag = null;
canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, yaw }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', e => { if (drag) yaw = drag.yaw + (e.clientX - drag.x) * 0.012; });
canvas.addEventListener('pointerup', () => { drag = null; });
canvas.addEventListener('dblclick', () => { yaw = 0; });

let last = performance.now();
function frame(nowT) {
  const dt = Math.min(0.1, (nowT - last) / 1000); last = nowT;
  if (actor && freeze == null) actor.update(dt);
  if (state.spin) yaw += dt * 0.6;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * renderer.getPixelRatio())) renderer.setSize(w, h, false);
  cam.aspect = w / h;
  if (actor) placeCamera(state.view, actor.metrics().height);
  renderer.render(scene, cam);
  requestAnimationFrame(frame);
}
rebuild().then(() => { requestAnimationFrame(frame); report.ready = true; }).catch(err => { document.body.insertAdjacentHTML('beforeend', `<p class="bad">Failed: ${err.message}</p>`); report.error = String(err.stack || err); });
