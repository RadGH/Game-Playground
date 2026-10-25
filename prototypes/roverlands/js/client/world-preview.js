// World preview: generate a Roverlands world and fly round it. For checking the world without the game.
// URL: world.html?seed=7&quality=medium&at=home|sandbox|river|bog|canyon|summit|ford_w|ford_e|bridge|switchback
//      &x=..&z=..&h=(metres above ground)&yaw=(deg)&pitch=(deg)&time=10.5
// window.rlWorld = { ready, world, view, setCam(x, y, z, yawDeg, pitchDeg), placeCam(name), debug() }   (for tests)

import * as THREE from 'three';
import { generateWorldSteps } from '../world/worldgen.js';
import { createWorldView } from './world-view/index.js';

const Q = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const canvas = $('view');
$('seed').value = Q.get('seed') || 7;
$('quality').value = Q.get('quality') || 'medium';
$('time').value = Q.get('time') || 10.5;

const api = { ready: false };
window.rlWorld = api;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setSize(innerWidth, innerHeight, false);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.3, 6000);
camera.rotation.order = 'YXZ';

let world, view;
const look = { yaw: 0, pitch: -0.15 };
const keys = new Set();

async function boot() {
  $('loading').classList.remove('done');
  const bar = $('bar').firstElementChild, label = $('label');
  const t0 = performance.now();
  for (const step of generateWorldSteps({ seed: Number($('seed').value) || 0 })) {
    bar.style.width = (step.progress * 40) + '%'; label.textContent = step.label;
    await new Promise(r => setTimeout(r, 0));
    if (step.world) world = step.world;
  }
  api.genMs = Math.round(performance.now() - t0);
  placeCam(Q.get('at') || 'home');
  if (Q.get('x')) {
    const x = Number(Q.get('x')), z = Number(Q.get('z'));
    setCam(x, world.heightAt(x, z) + Number(Q.get('h') || 3), z, Number(Q.get('yaw') || 0), Number(Q.get('pitch') || -10));
  }
  view = await createWorldView({ THREE, renderer, scene, camera, world, quality: $('quality').value, hour: Number($('time').value),
    onProgress: (f, l) => { bar.style.width = (40 + f * 60) + '%'; label.textContent = l; } });
  $('loading').classList.add('done');
  fillJump();
  api.world = world; api.view = view; api.ready = true;
}

// ---- camera ---------------------------------------------------------------------------------------------------------
function setCam(x, y, z, yawDeg = 0, pitchDeg = -10) {
  camera.position.set(x, y, z);
  look.yaw = (yawDeg * Math.PI) / 180; look.pitch = (pitchDeg * Math.PI) / 180;
  applyLook();
}
function applyLook() { camera.rotation.set(look.pitch, look.yaw, 0); }
/** A named view: stand back from the place and look at it. */
function placeCam(name) {
  const s = world.sites;
  const flag = s.flags.find(f => f.id === name);
  const node = world.roadGraph.nodes.find(n => n.id === name || n.id === name + '_s');
  let tx, tz, back = 40, up = 14;
  let from = 1;   // 1 = stand south of the place looking north, -1 = north looking south
  if (name === 'home') { tx = s.home.x; tz = s.home.z + 20; back = 70; up = 16; from = -1; }
  else if (name === 'sandbox') { tx = world.objects[s.ramps[2].id].x + 25; tz = s.ramps[2].z; back = 70; up = 22; }
  else if (flag) { tx = flag.x; tz = flag.z; back = 45; up = 16; }
  else if (name === 'bridge') { const b = s.bridges[0]; tx = b.x0; tz = (b.z0 + b.z1) / 2; back = 45; up = 10; }
  else if (name === 'switchback') { tx = 540; tz = -250; back = 150; up = 60; }
  else if (node) { tx = node.x; tz = node.z; back = 35; up = 9; }
  else { tx = 0; tz = 0; }
  // stand to the south (toward home) looking north at it
  const cx = tx + back * 0.35, cz = tz + back * from;
  const cy = Math.max(world.heightAt(cx, cz), world.waterAt(cx, cz) ?? -1e9) + up;
  const dx = tx - cx, dz = tz - cz, dy = world.heightAt(tx, tz) - cy;
  setCam(cx, cy, cz, (Math.atan2(-dx, -dz) * 180) / Math.PI, (Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI);
  view?.preload(camera.position);
}
api.setCam = setCam;
api.placeCam = placeCam;
api.debug = () => ({ ...view.debug(), genMs: api.genMs, objects: world.objects.length, decor: world.decor.length });
api.frames = (n = 3) => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });

canvas.addEventListener('click', () => canvas.requestPointerLock?.());
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas) return;
  look.yaw -= e.movementX * 0.0025; look.pitch = Math.max(-1.5, Math.min(1.5, look.pitch - e.movementY * 0.0025)); applyLook();
});
let touch = null;
canvas.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') touch = { x: e.clientX, y: e.clientY, id: e.pointerId }; });
canvas.addEventListener('pointermove', (e) => {
  if (!touch || e.pointerId !== touch.id) return;
  look.yaw -= (e.clientX - touch.x) * 0.005; look.pitch = Math.max(-1.5, Math.min(1.5, look.pitch - (e.clientY - touch.y) * 0.005));
  touch.x = e.clientX; touch.y = e.clientY; applyLook();
});
canvas.addEventListener('pointerup', () => { touch = null; });
addEventListener('keydown', (e) => { if (e.target.tagName === 'INPUT') return; keys.add(e.code); if (e.code === 'KeyM') $('map').classList.toggle('big'); });
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  view?.resize(innerWidth, innerHeight);
});

// ---- panel -----------------------------------------------------------------------------------------------------------
$('go').addEventListener('click', () => {
  const u = new URL(location.href);
  u.searchParams.set('seed', $('seed').value); u.searchParams.set('quality', $('quality').value);
  location.href = u.toString();
});
$('quality').addEventListener('change', async () => { if (view) await view.setQuality($('quality').value); });
$('time').addEventListener('input', () => view?.setTime(Number($('time').value)));
function fillJump() {
  const j = $('jump');
  for (const n of ['home', 'sandbox', 'river', 'bog', 'canyon', 'summit', 'switchback', 'bridge', 'ford_w', 'ford_e', 'junction', 'farm', 'dunes']) {
    const o = document.createElement('option'); o.value = n; o.textContent = n.replace('_', ' '); j.appendChild(o);
  }
  j.addEventListener('change', () => { if (j.value) placeCam(j.value); j.value = ''; });
}

// ---- the map ---------------------------------------------------------------------------------------------------------
const mapCv = $('map'), mg = mapCv.getContext('2d');
function drawMapPanel() {
  const big = mapCv.classList.contains('big');
  const px = big ? 800 : 300;
  if (mapCv.width !== px) { mapCv.width = mapCv.height = px; }
  mg.drawImage(view.mapImage(1024), 0, 0, px, px);
  mg.font = `${big ? 13 : 9}px system-ui`; mg.textAlign = 'center';
  for (const l of world.labels) {
    if (!big && l.kind !== 'region' && l.kind !== 'flag' && l.kind !== 'base') continue;
    const [x, y] = view.worldToMap(l.x, l.z, px);
    mg.fillStyle = '#0009'; mg.fillText(l.text, x + 1, y + 1);
    mg.fillStyle = l.kind === 'flag' ? '#ffe28a' : l.kind === 'water' ? '#cfe8ff' : '#fff';
    mg.fillText(l.text, x, y);
  }
  for (const f of world.sites.flags) {
    const [x, y] = view.worldToMap(f.x, f.z, px);
    mg.fillStyle = '#e83'; mg.beginPath(); mg.arc(x, y, big ? 5 : 3, 0, 7); mg.fill();
  }
  const [cx, cy] = view.worldToMap(camera.position.x, camera.position.z, px);
  mg.save(); mg.translate(cx, cy); mg.rotate(-look.yaw + Math.PI);
  mg.fillStyle = '#fff'; mg.strokeStyle = '#000'; mg.beginPath(); mg.moveTo(0, -7); mg.lineTo(5, 6); mg.lineTo(-5, 6); mg.closePath(); mg.fill(); mg.stroke();
  mg.restore();
}

// ---- the loop --------------------------------------------------------------------------------------------------------
let last = performance.now(), fps = 60, mapT = 0;
const _f = new THREE.Vector3(), _r = new THREE.Vector3();
function frame() {
  requestAnimationFrame(frame);
  if (!api.ready) return;
  const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  fps += (1 / Math.max(1e-3, dt) - fps) * 0.05;
  const sp = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 80 : 18) * dt;
  camera.getWorldDirection(_f); _r.crossVectors(_f, camera.up).normalize();
  if (keys.has('KeyW')) camera.position.addScaledVector(_f, sp);
  if (keys.has('KeyS')) camera.position.addScaledVector(_f, -sp);
  if (keys.has('KeyD')) camera.position.addScaledVector(_r, sp);
  if (keys.has('KeyA')) camera.position.addScaledVector(_r, -sp);
  if (keys.has('KeyE')) camera.position.y += sp;
  if (keys.has('KeyQ')) camera.position.y -= sp;
  const g = world.heightAt(camera.position.x, camera.position.z);
  if (camera.position.y < g + 1.2) camera.position.y = g + 1.2;
  view.update(dt, camera);
  view.render(dt);
  if ((mapT -= dt) <= 0) { mapT = 0.25; drawMapPanel(); updateStats(); }
}
function updateStats() {
  const p = camera.position, d = view.debug();
  const s = world.surfaceAt(p.x, p.z);
  $('stats').textContent =
    `${fps.toFixed(0)} fps · ${d.calls} draws · ${(d.triangles / 1e6).toFixed(2)}M tris · ${d.quality}\n` +
    `${world.biomeAt(p.x, p.z)} · ${s.name} · ground ${g1(world.heightAt(p.x, p.z))} m · at ${p.x.toFixed(0)}, ${p.z.toFixed(0)}\n` +
    `world ${api.genMs} ms · ${world.objects.length} objects · ${d.things.instances} drawn near · ${d.things.farMeshes} far`;
}
const g1 = (v) => v.toFixed(1);

boot().then(() => requestAnimationFrame(frame)).catch((e) => { console.error(e); $('label').textContent = 'Failed: ' + e.message; });
