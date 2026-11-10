// World preview: generate a Roverlands world and fly round it. For checking the world without the game.
// URL: world.html?seed=7&quality=medium&at=home|sandbox|river|bog|canyon|summit|ford_w|ford_e|bridge|switchback
//      &map=county (Wayfare County; at= home|marrow_flats|port_lindell|highgate|copperton|switchback|gorge|giants|runway|
//                   launch|rustwild|summit|scarp|lake|farm)
//      &map=moon (the Moon; at= home|base|landing|depot|orrin|kestle|vandry|breach|rille|ridge|mare|boulders|jump|
//                 overview|planet)
//      &map=station (Lantern Station; at= dock|hub|cupola|lab|greenhouse|sleep|airlock|outside)
//      &x=..&z=..&h=(metres above ground)&yaw=(deg)&pitch=(deg)&time=10.5
// window.rlWorld = { ready, world, view, setCam(x, y, z, yawDeg, pitchDeg), placeCam(name), debug() }   (for tests)

import * as THREE from 'three';
import { generateWorldSteps } from '../world/worldgen.js';
import { generateWorldAsync } from '../world/world-async.js';
import { createWorldView } from './world-view/index.js';
import { createSimpleView } from './simple-view.js';
import { worldToMap } from './world-view/mapimage.js';

const Q = new URLSearchParams(location.search);
const MAP = ['county', 'moon', 'station'].includes(Q.get('map')) ? Q.get('map') : 'classic';
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
  // built in a worker (world-async.js; ?worker=0 builds it on the page, a step at a time)
  if (Q.get('worker') === '0') {
    for (const step of generateWorldSteps({ seed: Number($('seed').value) || 0, map: MAP })) {
      bar.style.width = (step.progress * 40) + '%'; label.textContent = step.label;
      await new Promise(r => setTimeout(r, 0));
      if (step.world) world = step.world;
    }
    world.builtIn = 'page';
  } else {
    world = await generateWorldAsync({ seed: Number($('seed').value) || 0, map: MAP }, (f, l) => { bar.style.width = (f * 40) + '%'; label.textContent = l; });
  }
  api.genMs = Math.round(performance.now() - t0);
  api.genIn = world.builtIn;
  placeCam(Q.get('at') || 'home');
  if (Q.get('x')) {
    const x = Number(Q.get('x')), z = Number(Q.get('z'));
    setCam(x, world.heightAt(x, z) + Number(Q.get('h') || 3), z, Number(Q.get('yaw') || 0), Number(Q.get('pitch') || -10));
  }
  if (Q.get('view') === 'simple') {
    // the plain fallback renderer (the game's ?view=simple), wrapped to the bits of the full view's API used here
    const sv = createSimpleView({ THREE, renderer, scene, camera, world });
    const maps = new Map();
    view = { ...sv, preload() {}, resize() {}, setQuality: async () => {}, setTime() {},
      render() { renderer.info.reset(); renderer.render(scene, camera); },
      mapImage: (px) => { if (!maps.has(px)) maps.set(px, sv.mapImage(px)); return maps.get(px); },
      worldToMap: (x, z, px) => worldToMap(world, x, z, px),
      debug: () => ({ quality: 'simple', calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, things: { instances: 0, farMeshes: 0 }, terrainChunks: 1 }) };
    renderer.info.autoReset = false;
  } else {
    view = await createWorldView({ THREE, renderer, scene, camera, world, quality: $('quality').value, hour: Number($('time').value),
      onProgress: (f, l) => { bar.style.width = (40 + f * 60) + '%'; label.textContent = l; } });
  }
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
  if (world.map === 'county') return placeCountyCam(name);
  if (world.map === 'moon') return placeMoonCam(name);
  if (world.map === 'station') return placeStationCam(name);
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
/** Wayfare County views: [target x, z, camera back (m), up (m), from which side]. */
function placeCountyCam(name) {
  const s = world.sites;
  const city = s.cities.find(c => c.id === name);
  let tx = 0, tz = 0, back = 60, up = 20, dir = [0.35, 1];
  if (name === 'home') { tx = s.home.x; tz = s.home.z; back = 40; up = 12; }
  else if (city) { tx = city.x; tz = city.z; back = city.hz + 140; up = 70; }
  else if (name === 'switchback') { tx = 175; tz = -470; back = 330; up = 120; dir = [0.25, 1]; }
  else if (name === 'hairpin') {
    // the second hairpin from the bottom, from above the outside of the bend looking back across it, so the U-turn and
    // both legs climbing into it are in the frame. The ground outside a bend falls away (the old camera stood on it
    // at a driver's height, ~20 m BELOW the road, and saw only the rock face under it), so the height is taken from the
    // road at the bend, not from the ground under the camera
    const h = world.switchback.hairpins[1] || world.switchback.hairpins[0];
    const d = [h.x - 175, 0.3 * Math.abs(h.x - 175)], dl = Math.hypot(d[0], d[1]), bk = h.r + 46;
    const cx = h.x + bk * d[0] / dl, cz = h.z + bk * d[1] / dl;
    const cy = Math.max(world.heightAt(cx, cz) + 4, h.y + 22);
    const dx = h.x - cx, dz = h.z - cz;
    setCam(cx, cy, cz, (Math.atan2(-dx, -dz) * 180) / Math.PI, (Math.atan2(h.y - cy, Math.hypot(dx, dz)) * 180) / Math.PI);
    view?.preload(camera.position); return;
  }
  else if (name === 'street') {
    // down a Port Lindell street from a car's height
    const c = s.cities.find(q => q.id === 'port_lindell'), r = world.roads.find(q => q.town === 'port_lindell' && q.pts.length > 80);
    const p = r.pts[Math.floor(r.pts.length * 0.3)], q = r.pts[Math.floor(r.pts.length * 0.3) + 20];
    setCam(p[0], c.y + 2.2, p[1], (Math.atan2(-(q[0] - p[0]), -(q[1] - p[1])) * 180) / Math.PI, -6);
    view?.preload(camera.position); return;
  }
  else if (name === 'highway') {
    const r = world.roads.find(q => q.cls === 'highway' && q.kind !== 'bridge' && q.pts.length > 200);
    const i = Math.floor(r.pts.length * 0.45), p = r.pts[i], q = r.pts[i + 15];
    setCam(p[0] + 1.5, world.heightAt(p[0], p[1]) + 2.4, p[1], (Math.atan2(-(q[0] - p[0]), -(q[1] - p[1])) * 180) / Math.PI, -5);
    view?.preload(camera.position); return;
  }
  else if (name === 'peaks') { const v = s.survey.find(q => q.id === 'thornhorn'); tx = v.x; tz = v.z; back = 900; up = 60; dir = [0.9, 1]; }
  else if (name === 'gorge') { const b = s.bridges.find(b => b.high); tx = b.x0; tz = (b.z0 + b.z1) / 2; back = 140; up = 16; dir = [1, 0.25]; }
  else if (name === 'giants') { const g = world.objects.find(o => o.kind === 'tree_giant'); tx = g.x; tz = g.z; back = 45; up = 4; }
  else if (name === 'runway') { const r = s.runway; tx = r.x0 + 150; tz = r.z0; back = 120; up = 25; dir = [-1, -0.25]; }
  else if (name === 'launch') { tx = s.launch.x; tz = s.launch.z; back = 120; up = 30; dir = [-0.6, -1]; }
  else if (name === 'rustwild') { const c = s.rustwild.camps[0]; tx = c.x; tz = c.z; back = 120; up = 40; }
  else if (name === 'summit') { const v = s.survey[0]; tx = v.x; tz = v.z; back = 200; up = 60; }
  else if (name === 'scarp') { tx = -260; tz = -395; back = 160; up = 25; }
  else if (name === 'lake') { const l = world.lakes[0]; tx = l.x; tz = l.z; back = 300; up = 60; dir = [1, -0.4]; }
  else if (name === 'farm') { const p = s.farms.plots[0]; tx = p.x; tz = p.z; back = 120; up = 40; }
  const l = Math.hypot(dir[0], dir[1]);
  const cx = tx + back * dir[0] / l, cz = tz + back * dir[1] / l;
  const cy = Math.max(world.heightAt(cx, cz), world.waterAt(cx, cz) ?? -1e9) + up;
  const dx = tx - cx, dz = tz - cz, dy = world.heightAt(tx, tz) - cy;
  setCam(cx, cy, cz, (Math.atan2(-dx, -dz) * 180) / Math.PI, (Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI);
  view?.preload(camera.position);
}
/** Moon views: [target x, z, camera back (m), up (m), from which side]. */
function placeMoonCam(name) {
  const s = world.sites;
  const crater = s.craters.find(c => c.id === name);
  let tx = 0, tz = 0, back = 60, up = 20, dir = [0.35, 1];
  if (name === 'home') { tx = s.home.x; tz = s.home.z; back = 45; up = 10; }
  else if (name === 'base') { tx = s.base.x; tz = s.base.z - 20; back = 150; up = 45; dir = [0.6, 1]; }
  else if (name === 'landing') { tx = s.landing.x; tz = s.landing.z; back = 80; up = 25; dir = [1, 0.5]; }
  else if (name === 'depot') { tx = s.depot.x; tz = s.depot.z; back = 90; up = 25; }
  else if (crater) { tx = crater.x; tz = crater.z; back = crater.R * 2.1; up = crater.R * 0.55; dir = [0.5, 1]; }
  else if (name === 'breach') { const c = s.craters.find(q => q.id === 'orrin'); tx = c.x; tz = c.z; back = c.R * 1.25; up = 12; dir = [c.breach.x - c.x, c.breach.z - c.z]; }
  else if (name === 'rille') {
    // down the channel from just above its floor
    const p = world.rille.pts, i = Math.floor(p.length * 0.45), a = p[i], b = p[i + 6];
    setCam(a[0], a[2] + 3, a[1], (Math.atan2(-(b[0] - a[0]), -(b[1] - a[1])) * 180) / Math.PI, -4);
    view?.preload(camera.position); return;
  }
  else if (name === 'ridge') { const c = world.ridge.crest; tx = c.x; tz = c.z; back = 760; up = 70; dir = [-0.75, 1]; }
  else if (name === 'mare') { const v = s.survey.find(q => q.id === 'hush_flat'); tx = v.x; tz = v.z; back = 20; up = 2.5; dir = [0.2, 1]; }
  else if (name === 'boulders') { const f = s.fields[0]; tx = f.x; tz = f.z; back = 110; up = 16; dir = [-1, 0.7]; }
  else if (name === 'jump') { const r = s.ramps.find(q => !q.ramp.startsWith('practice')) || s.ramps[0]; tx = r.x; tz = r.z; back = 26; up = 4; dir = [-Math.sin(r.yaw), -Math.cos(r.yaw)]; }
  else if (name === 'overview') { tx = -120; tz = 200; back = 560; up = 300; dir = [0.2, 1]; }
  else if (name === 'planet') {
    // stand at the base and look toward the planet over the north horizon
    const d = world.space.planet.dir, v = s.survey.find(q => q.id === 'hush_flat');
    setCam(v.x, world.heightAt(v.x, v.z) + 2.5, v.z, (Math.atan2(-d[0], -d[2]) * 180) / Math.PI, 12);
    view?.preload(camera.position); return;
  }
  const l = Math.hypot(dir[0], dir[1]);
  const cx = tx + back * dir[0] / l, cz = tz + back * dir[1] / l;
  const cy = world.heightAt(cx, cz) + up;
  const dx = tx - cx, dz = tz - cz, dy = world.heightAt(tx, tz) - cy;
  setCam(cx, cy, cz, (Math.atan2(-dx, -dz) * 180) / Math.PI, (Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI);
  view?.preload(camera.position);
}
/** Lantern Station views: inside each module (from one end, looking along it), and outside. */
function placeStationCam(name) {
  const st = world.station, room = st.rooms.find(r => r.id === name);
  if (name === 'outside') { setCam(28, 22, 46, 20, -26); return; }
  if (name === 'cupola') { setCam(0, -6.4, 2.2, 0, -62); return; }
  if (name === 'dock') { setCam(-17, 0.4, 0, -90, -4); return; }
  if (room) {
    const long = room.h[0] >= room.h[2] ? 0 : 2;
    const p = room.c.slice(); p[long] += room.h[long] - 0.8; p[1] += 0.6;
    const yaw = long === 0 ? 90 : 0;     // look back along the long axis (yaw 90 = toward -x, 0 = toward -z)
    setCam(p[0], p[1], p[2], yaw, -6);
    return;
  }
  setCam(0, 0, 3.2, 0, 0);
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
  const names = world.map === 'moon'
    ? ['home', 'base', 'landing', 'depot', 'orrin', 'breach', 'kestle', 'vandry', 'rille', 'ridge', 'mare', 'boulders', 'jump', 'planet', 'overview']
    : world.map === 'station'
    ? ['dock', 'hub', 'cupola', 'lab', 'greenhouse', 'sleep', 'airlock', 'outside']
    : world.map === 'county'
    ? ['home', 'marrow_flats', 'port_lindell', 'street', 'highway', 'highgate', 'copperton', 'switchback', 'hairpin', 'peaks', 'gorge', 'giants', 'runway', 'launch', 'rustwild', 'summit', 'scarp', 'lake', 'farm']
    : ['home', 'sandbox', 'river', 'bog', 'canyon', 'summit', 'switchback', 'bridge', 'ford_w', 'ford_e', 'junction', 'farm', 'dunes'];
  for (const n of names) {
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
    if (!big && l.kind !== 'region' && l.kind !== 'flag' && l.kind !== 'base' && l.kind !== 'city') continue;
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
  if (!world.interior && camera.position.y < g + 1.2) camera.position.y = g + 1.2;
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
