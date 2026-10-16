// Chibi 4 step 7 comparison page: Chibi 2 vs Chibi 4 side by side, the same clip, measured cost, and a crowd test.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createChibi2Character } from '../../js/chibi2.js';
import { normalizeAvatar } from '../../../avatar-2d/js/render.js';
import { createChibi4Character } from './chibi4.js';

const q = new URLSearchParams(location.search);
// the step-0 baseline looks (Chibi 2's closest pieces to the reference sheets)
const LOOKS = {
  mage: { body: { race: 'human', skin: '#e0ac69', height: 0.6, width: 0.5 }, headShape: 'oval', hair: { id: 'side_part', color: '#6b4a2a' },
    eyes: { id: 'round', color: '#4a6b8a' }, brows: { id: 'straight' }, nose: { id: 'small' }, mouth: { id: 'smile', color: '#b5484d' }, facialHair: { id: 'full' },
    hat: { id: 'none' }, top: { id: 'trim_robe', color: '#2a3a8a', color2: '#d8b040' }, bottom: { id: 'pants', color: '#1a2a5a' },
    shoes: { id: 'boots', color: '#5a4030' }, cape: { id: 'none' }, decor: { id: 'none' }, held: { id: 'none' } },
  elf: { body: { race: 'elf', skin: '#f0c8a0', height: 0.6, width: 0.45, gender: 'female' }, headShape: 'oval', hair: { id: 'braid', color: '#8a3a1a' },
    eyes: { id: 'round', color: '#4a7a5a' }, brows: { id: 'straight' }, nose: { id: 'small' }, mouth: { id: 'smile', color: '#b5484d' },
    hat: { id: 'none' }, top: { id: 'travel_shirt', color: '#3a6a3a', color2: '#8a6a4a' }, bottom: { id: 'pants', color: '#4a3020' },
    shoes: { id: 'boots', color: '#5a4030' }, cape: { id: 'none' }, decor: { id: 'none' }, held: { id: 'none' } },
};

const host = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
host.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x9a9da2);
scene.add(new THREE.HemisphereLight(0xffffff, 0x556070, 1.3));
const key = new THREE.DirectionalLight(0xfff2e0, 2.4); key.position.set(-2, 4, 3); scene.add(key);
const rim = new THREE.DirectionalLight(0xcfe0ff, 1.1); rim.position.set(2, 3, -3); scene.add(rim);
const ground = new THREE.Mesh(new THREE.CircleGeometry(30, 48), new THREE.MeshStandardMaterial({ color: 0x80848a, roughness: 1 }));
ground.rotation.x = -Math.PI / 2; scene.add(ground);
const cam = new THREE.PerspectiveCamera(32, 1, 0.05, 200);
cam.position.set(-0.55, 1.4, 6.6);
const controls = new OrbitControls(cam, renderer.domElement); controls.target.set(-0.55, 0.95, 0); controls.update();
function resize() { const w = host.clientWidth, h = host.clientHeight; renderer.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

const show = { chibi2: [], chibi4: [] };
const stat = { chibi2: {}, chibi4: {} };
const t0 = performance.now();
for (const [i, who] of ['mage', 'elf'].entries()) {
  let t = performance.now();
  const a2 = await createChibi2Character(normalizeAvatar(LOOKS[who]));
  stat.chibi2.buildMs = (stat.chibi2.buildMs || 0) + (performance.now() - t);
  a2.group.position.set(-3.3 + i * 0.95, 0, 0); scene.add(a2.group); show.chibi2.push(a2);
  t = performance.now();
  const a4 = await createChibi4Character(LOOKS[who], { model: who });
  stat.chibi4.buildMs = (stat.chibi4.buildMs || 0) + (performance.now() - t);
  a4.group.position.set(-1.1 + i * 0.95, 0, 0); scene.add(a4.group); show.chibi4.push(a4);
}
const labels = document.createElement('div'); labels.className = 'c4labels';
labels.innerHTML = '<span>Chibi 2 (today)</span><span>Chibi 4 (experiment)</span>'; document.body.append(labels);

// ---- measured cost: draw one system at a time and read the renderer's counters
function measure(sys) {
  for (const s of ['chibi2', 'chibi4']) for (const a of show[s]) a.group.visible = s === sys;
  ground.visible = false;
  renderer.info.autoReset = false; renderer.info.reset();
  renderer.render(scene, cam);
  const r = { calls: renderer.info.render.calls / 2, triangles: Math.round(renderer.info.render.triangles / 2) };
  renderer.info.autoReset = true;
  for (const s of ['chibi2', 'chibi4']) for (const a of show[s]) a.group.visible = true;
  ground.visible = true;
  return r;
}
const m2 = measure('chibi2'), m4 = measure('chibi4');
const s4 = show.chibi4.map(a => a.stats());
const bytes4 = s4.reduce((n, s) => n + s.bytes, 0);
const s2 = show.chibi2.map(a => a.stats?.() || {});
const rows = [
  ['', 'Chibi 2', 'Chibi 4'],
  ['draw calls / character (as drawn here)', m2.calls, m4.calls],
  ['triangles / character (as drawn here)', m2.triangles.toLocaleString(), m4.triangles.toLocaleString()],
  ['Chibi 4 distance versions', '—', s4[0].lodTriangles.map(n => n.toLocaleString()).join(' / ')],
  ['bones', s2[0].bones ?? '—', s4[0].bones],
  ['download', 'none (built in code)', `${(bytes4 / 1048576).toFixed(1)} MB for both (GLB)`],
  ['first build (both characters)', `${Math.round(stat.chibi2.buildMs)} ms`, `${Math.round(stat.chibi4.buildMs)} ms (incl. download)`],
];
const st = document.getElementById('stats');
for (const r of rows) { const tr = document.createElement('tr'); for (const c of r) { const td = document.createElement('td'); td.textContent = c; tr.append(td); } st.append(tr); }
window.__c4stats = { chibi2: m2, chibi4: m4, lodTriangles: s4.map(s => s.lodTriangles), bytes: bytes4, build: stat };

// ---- animation buttons
let anim = q.get('anim') || 'walk';
function setAll(name) {
  anim = name;
  for (const s of ['chibi2', 'chibi4']) for (const a of show[s]) a.setAnim(name);
  for (const b of document.querySelectorAll('#anims button')) b.classList.toggle('primary', b.dataset.anim === name);
}
for (const n of ['idle', 'walk', 'run', 'cast', 'attack', 'hit', 'talk', 'dead']) {
  const b = document.createElement('button'); b.textContent = n; b.dataset.anim = n; b.onclick = () => setAll(n);
  document.getElementById('anims').append(b);
}
setAll(anim);
document.getElementById('lod').onchange = e => { for (const a of show.chibi4) a.lod.autoUpdate = e.target.checked; if (!e.target.checked) for (const a of show.chibi4) a.lod.levels.forEach((l, i) => l.object.visible = i === 0); };

// ---- crowd test
const crowdRows = document.getElementById('crowd');
window.__c4perf = [];
let crowd = [], crowdSys = null;
async function runCrowd(n, sys) {
  for (const a of crowd) { a.dispose(); a.group.removeFromParent(); }
  crowd = [];
  for (const s of ['chibi2', 'chibi4']) for (const a of show[s]) a.group.visible = false;
  const cols = Math.ceil(Math.sqrt(n));
  const t = performance.now();
  for (let i = 0; i < n; i++) {
    const who = i % 2 ? 'elf' : 'mage';
    const a = sys === 'chibi4' ? await createChibi4Character(LOOKS[who], { model: who }) : await createChibi2Character(normalizeAvatar(LOOKS[who]));
    a.group.position.set((i % cols - cols / 2) * 1.6, 0, -Math.floor(i / cols) * 1.6);
    a.setAnim('walk'); a.update?.(Math.random());
    scene.add(a.group); crowd.push(a);
  }
  const build = performance.now() - t;
  crowdSys = sys;
  // Thousandvale-ish camera: up and back
  const saved = cam.position.clone(), savedT = controls.target.clone();
  cam.position.set(0, 9, 14 + cols); controls.target.set(0, 0.8, -cols * 0.8); controls.update();
  await new Promise(r => setTimeout(r, 400));
  renderer.info.reset();
  let frames = 0; const start = performance.now();
  await new Promise(res => { const tick = () => { frames++; if (performance.now() - start < 3000) requestAnimationFrame(tick); else res(); }; requestAnimationFrame(tick); });
  const fps = frames / ((performance.now() - start) / 1000);
  renderer.render(scene, cam);
  const res = { sys, n, fps: Math.round(fps * 10) / 10, buildMs: Math.round(build), calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
  window.__c4perf.push(res);
  const tr = document.createElement('tr');
  tr.innerHTML = `<td>${n} × ${sys === 'chibi4' ? 'Chibi 4' : 'Chibi 2'}</td><td>${res.fps} fps</td><td>${res.calls} draw calls</td><td>${res.triangles.toLocaleString()} triangles</td><td>built in ${res.buildMs} ms</td>`;
  crowdRows.append(tr);
  for (const a of crowd) { a.dispose(); a.group.removeFromParent(); }
  crowd = []; crowdSys = null;
  for (const s of ['chibi2', 'chibi4']) for (const a of show[s]) a.group.visible = true;
  cam.position.copy(saved); controls.target.copy(savedT); controls.update();
  return res;
}
for (const b of document.querySelectorAll('[data-crowd]')) b.onclick = () => runCrowd(+b.dataset.crowd, b.dataset.sys);
window.__c4crowd = runCrowd;

const clock = new THREE.Clock();
let frame = 0;
renderer.setAnimationLoop(() => {
  const dt = Math.min(0.05, clock.getDelta());
  for (const s of ['chibi2', 'chibi4']) for (const a of show[s]) a.update(dt);
  for (const a of crowd) a.update(dt);
  renderer.render(scene, cam);
  if (++frame === 20) document.body.dataset.ready = '1';
});
if (q.get('crowd')) {
  const n = +q.get('crowd');
  for (const sys of (q.get('sys') ? [q.get('sys')] : ['chibi2', 'chibi4'])) await runCrowd(n, sys);
  document.body.dataset.crowdDone = '1';
}
