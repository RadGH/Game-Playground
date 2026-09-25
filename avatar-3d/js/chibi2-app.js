import * as THREE from 'three';
import { createScene } from './scene.js';
import { createMiiCharacter } from './mii.js';
import { createChibi2Character, CHIBI2_ANIMS } from './chibi2.js';
import { normalizeAvatar } from '../../avatar-2d/js/render.js';
import { SpellFx } from './spellfx.js';
import { BatchedSpellFx } from './spellfx-batched.js';
import { Assets } from '../../assets/js/assets.js';
import { installTooltips } from '../../shared/tooltip.js';
import { loadClassOutfits, dressAs } from './class-outfits.js';

const $ = id => document.getElementById(id);
const data = await (await fetch('./data/chibi2-presets.json')).json();
// 2026-09-25 class outfits (data/class-outfits.json): any preset can be dressed as any class
const outfits = await loadClassOutfits();
const params = new URLSearchParams(location.search);
const state = { engine: params.get('engine') === 'original' ? 'original' : 'chibi2', view: params.get('view') || 'combat', preset: 0, fxMode: 'batched', spells: true, rate: 4, paused: false, turntable: false, shadows: 'contact', resolution: 1 };
if (!['combat', 'portrait', 'pair'].includes(state.view)) state.view = 'combat';
let avatar = normalizeAvatar(data.presets[0].avatar);
const scene = createScene($('stage'), { background: 0xdce5df, ground: false, pixelRatio: 1, shadows: false, preserveDrawingBuffer: false });
scene.renderer.toneMapping = THREE.ACESFilmicToneMapping; scene.renderer.toneMappingExposure = 1.15;
scene.scene.fog = new THREE.Fog(0xdce5df, 14, 32);
scene.controls.maxDistance = 22; scene.controls.minDistance = 2;
scene.scene.children.find(o => o.isHemisphereLight).intensity = 2.0;
const key = scene.scene.children.find(o => o.isDirectionalLight && o.castShadow);
key.position.set(-3, 7, 5); key.intensity = 3;
Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6 });
key.shadow.camera.updateProjectionMatrix();
key.shadow.normalBias = 0.025; key.shadow.bias = -0.0002;
const assets = await Assets.open('../assets/');
const textures = await assets.fxTextures(THREE, { size: 128 });
let actors = [], fx, generation = 0, building = false, benchmarkActive = false, disposed = false;
let time = 0, nextCast = 0.6, castIndex = 0, realLast = performance.now(), readoutAt = 0;
const frameTimes = [], sampleListeners = new Set();
const elements = ['fire', 'ice', 'arcane', 'holy', 'lightning', 'nature'];
const ground = createGround();
const shadows = createContactShadows();
let results = [];

function createGround() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const c = canvas.getContext('2d'); c.fillStyle = '#a5b7aa'; c.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    c.fillStyle = ['#aabaad', '#b0beb0', '#a8b7a8', '#b6c2b4'][(x * 3 + y * 7) % 4];
    c.fillRect(x * 64 + 2, y * 64 + 2, 59, 59);
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(3, 3); texture.anisotropy = 4;
  const floor = new THREE.Mesh(new THREE.CircleGeometry(6.2, 64), new THREE.MeshStandardMaterial({ map: texture, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.007; floor.receiveShadow = true; scene.scene.add(floor);
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.32, 0), new THREE.MeshStandardMaterial({ color: '#82988d', roughness: 1, flatShading: true }), 14);
  const matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion(), pos = new THREE.Vector3(), size = new THREE.Vector3();
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * Math.PI * 2;
    pos.set(Math.sin(a) * 5.5, 0.06, Math.cos(a) * 5.5);
    size.set(0.8 + (i % 3) * 0.25, 0.45, 0.8 + (i % 2) * 0.3);
    rotation.setFromEuler(new THREE.Euler(i, i * 0.4, 0)); matrix.compose(pos, rotation, size); rocks.setMatrixAt(i, matrix);
  }
  scene.scene.add(rocks); return floor;
}
function createContactShadows() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
  const c = canvas.getContext('2d'), gradient = c.createRadialGradient(32, 32, 4, 32, 32, 31);
  gradient.addColorStop(0, '#182e2b90'); gradient.addColorStop(0.55, '#182e2b48'); gradient.addColorStop(1, '#182e2b00');
  c.fillStyle = gradient; c.fillRect(0, 0, 64, 64);
  const material = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false, toneMapped: false });
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), material, 8); mesh.count = 0; scene.scene.add(mesh); return mesh;
}
function resetCamera() {
  const aspect = $('stage').clientWidth / $('stage').clientHeight;
  const fight = state.view === 'combat', pair = state.view === 'pair';
  const width = fight ? 7.4 : pair ? 3.7 : 2.2, height = fight ? 3.7 : 2.45;
  const distance = Math.max(height, width / aspect) / (2 * Math.tan(THREE.MathUtils.degToRad(35) / 2));
  scene.controls.target.set(0, fight ? 0.62 : 0.9, 0);
  scene.camera.position.set(fight ? 0.15 : 0.3, fight ? distance * 0.47 : 1.65, distance);
  scene.controls.update();
}
function bodyStats(ctrl) {
  if (ctrl.stats) return ctrl.stats();
  let triangles = 0, meshes = 0;
  ctrl.group.traverse(o => { if (o.isMesh) { meshes++; triangles += (o.geometry.index?.count || o.geometry.attributes.position.count) / 3; } });
  return { triangles, meshes, bones: 0 };
}
function makeFx() {
  if (fx) { fx.dispose(); fx.clearPool(); }
  const Fx = state.fxMode === 'batched' ? BatchedSpellFx : SpellFx;
  fx = new Fx(scene.scene, { camera: scene.camera, textures, scale: 1, maxParticles: 160, maxLive: 24 });
}
function syncUi() {
  for (const b of document.querySelectorAll('[data-engine]')) { b.setAttribute('aria-pressed', b.dataset.engine === state.engine); b.disabled = state.view === 'pair' || benchmarkActive || building; }
  for (const b of document.querySelectorAll('[data-view]')) b.setAttribute('aria-pressed', b.dataset.view === state.view);
  $('pair-labels').hidden = state.view !== 'pair';
  $('scene-label').textContent = state.view === 'combat' ? 'THE PRACTICE GROUNDS' : data.presets[state.preset].name.toUpperCase();
  $('actor-label').textContent = state.view === 'combat' ? '4 versus 4' : 'Character study';
  $('fx-mode').value = state.fxMode; $('spells').checked = state.spells;
  $('preset').value = state.preset; $('rate').value = state.rate; $('rate-value').textContent = state.rate;
  $('shadows').value = state.shadows; $('resolution').value = state.resolution; $('turntable').checked = state.turntable;
  $('cloth').value = avatar.top.color; $('hair').value = avatar.hair.color; $('skin').value = avatar.body.skin;
  $('animation').disabled = state.view === 'combat' || building || benchmarkActive;
  $('model-label').textContent = state.view === 'pair' ? 'Chibi 2' : state.engine === 'chibi2' ? 'Chibi 2' : 'Original';
  const subject = actors[state.view === 'pair' ? 1 : 0];
  if (subject) { const s = bodyStats(subject.ctrl); $('model-stats').textContent = `${s.triangles.toLocaleString()} triangles / ${s.meshes} meshes / ${s.bones} bones`; }
  setPauseIcon();
}
function applyRendering() {
  scene.renderer.shadowMap.enabled = state.shadows === 'dynamic'; scene.renderer.shadowMap.needsUpdate = true;
  if (scene.renderer.getPixelRatio() !== state.resolution) { scene.renderer.setPixelRatio(state.resolution); scene.resize(); }
  frameTimes.length = 0;
}
function busy(on) {
  for (const control of document.querySelectorAll('button, input, select')) control.disabled = on;
  if (!on) syncUi();
}
async function rebuild() {
  const token = ++generation; building = true; busy(true);
  $('state').textContent = 'Preparing characters';
  makeFx();
  for (const actor of actors) { actor.ctrl.group.removeFromParent(); actor.ctrl.dispose(); }
  actors = []; time = 0; nextCast = 0.6; castIndex = 0; frameTimes.length = 0;
  for (const id of ['fps', 'p95', 'calls', 'triangles', 'effects']) $(id).textContent = '--';
  const count = state.view === 'combat' ? 8 : state.view === 'pair' ? 2 : 1;
  const colors = ['#397a76', '#687ca2', '#a85b62', '#7a8153', '#8b5c65', '#72708d', '#97784e', '#526e83'];
  const matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
  for (let i = 0; i < count; i++) {
    const a = structuredClone(avatar);
    if (count === 8 && i > 0) {
      a.top.color = colors[i]; a.offhand.color = colors[i]; a.hair.color = ['#4a3432', '#bcb096', '#302e36', '#895a38'][i % 4];
      const faces = [
        ['round', 'round', 'arched', 'small', 'smile'], ['oval', 'almond', 'straight', 'button', 'neutral'],
        ['square', 'narrow', 'angry', 'long', 'frown'], ['heart', 'anime', 'worried', 'dot', 'o'],
        ['wide', 'sleepy', 'thick', 'wide', 'smirk'], ['long', 'wink', 'raised', 'small', 'grin'],
        ['chiseled', 'slit', 'thin', 'hook', 'fangs'],
      ][i - 1];
      if (faces) { [a.headShape, a.eyes.id, a.brows.id, a.nose.id, a.mouth.id] = faces; a.extras.id = ['none', 'freckles', 'scar', 'blush', 'none', 'third_eye', 'scar_cheek'][i - 1]; a.facialHair.id = i === 3 ? 'mustache' : i === 6 ? 'goatee' : 'none'; a.accessory.id = i === 4 ? 'round_glasses' : 'none'; }
    }
    const engine = state.view === 'pair' ? (i === 0 ? 'original' : 'chibi2') : state.engine;
    const ctrl = await (engine === 'chibi2' ? createChibi2Character(a) : createMiiCharacter(a));
    if (token !== generation || disposed) { ctrl.dispose(); return; }
    const side = i < 4 ? -1 : 1, rank = i % 4;
    const x = count === 8 ? side * (rank % 2 === 0 ? 1.1 : 2.8) : count === 2 ? (i === 0 ? -0.9 : 0.9) : 0;
    const z = count === 8 ? (rank < 2 ? 0.72 : -0.82) : 0;
    ctrl.group.position.set(x, 0, z); ctrl.group.rotation.y = count === 8 ? -side * 0.75 : 0;
    ctrl.group.userData.fxHeight = ctrl.metrics().totalHeight;
    scene.scene.add(ctrl.group);
    const home = ctrl.group.position.clone(); actors.push({ ctrl, engine, home, target: null, poseUntil: 0 });
    matrix.compose(new THREE.Vector3(x, 0.006, z), rotation, new THREE.Vector3(0.9, 0.65, 1)); shadows.setMatrixAt(i, matrix);
    ctrl.setAnim(count === 8 ? (engine === 'chibi2' ? 'ready' : 'idle') : $('animation').value);
  }
  shadows.count = count; shadows.instanceMatrix.needsUpdate = true;
  shadows.computeBoundingSphere();
  // Compile the new materials before collecting frame times or exposing the ready state.
  scene.renderer.render(scene.scene, scene.camera);
  building = false; busy(benchmarkActive); syncUi();
  $('state').textContent = 'Ready'; resetCamera(); realLast = 0;
}
function point(actor, fraction = 0.62) { return actor.ctrl.group.position.clone().add(new THREE.Vector3(0, actor.ctrl.metrics().totalHeight * fraction, 0)); }
function cast() {
  if (actors.length !== 8) return;
  const token = generation, n = castIndex++, source = actors[n % 8], target = actors[(n + 4 + Math.floor(n / 8) % 3) % 8];
  const element = elements[n % elements.length];
  source.ctrl.setAnim(source.engine === 'chibi2' ? (n % 3 === 0 ? 'attack' : 'cast') : (n % 3 === 0 ? 'attack' : 'wave'));
  source.poseUntil = time + 1.2;
  if (!state.spells) return;
  fx.cast({ at: source.home, element, ms: 350 });
  fx.projectile({ from: point(source), to: point(target), element, ms: 420 }).then(() => {
    if (token !== generation || disposed || !state.spells) return;
    fx.impact({ at: point(target), element, height: target.ctrl.metrics().totalHeight, crit: false });
    target.ctrl.setAnim(target.engine === 'chibi2' ? 'hit' : 'talk'); target.poseUntil = time + 0.5;
  });
  if (n % 4 === 0) fx.heal({ at: actors[(n + 2) % 8].home });
  if (n % 6 === 0) { fx.clearStatuses(target.ctrl.group); fx.status(target.ctrl.group, ['regen', 'barrier', 'burn'][Math.floor(n / 6) % 3], true); }
}
function stats() {
  const info = scene.renderer.info.render, times = [...frameTimes].sort((a, b) => a - b), avg = times.reduce((a, b) => a + b, 0) / Math.max(1, times.length);
  return { engine: state.engine, view: state.view, fxMode: state.fxMode, actors: actors.length, fps: avg ? 1000 / avg : 0, p95: times[Math.floor(times.length * 0.95)] || 0, calls: info.calls, triangles: info.triangles, effects: fx?.liveCount || 0, sprites: fx?.stats() || {}, actor: actors[0] ? bodyStats(actors[0].ctrl) : null };
}
scene.addTicker(dt => {
  const now = performance.now(), raw = realLast ? now - realLast : 0; realLast = now;
  if (!building && !document.hidden && raw > 0) {
    frameTimes.push(raw); if (frameTimes.length > 180) frameTimes.shift();
    for (const sample of sampleListeners) sample(raw, scene.renderer.info.render);
  }
  if (!building && !state.paused) {
    // Fixed steps during a comparison give every renderer the same number of simulation updates.
    const step = benchmarkActive ? 1 / 60 : dt; time += step;
    for (const actor of actors) {
      actor.ctrl.update(step);
      if (actor.poseUntil && time >= actor.poseUntil) { actor.ctrl.setAnim(actor.engine === 'chibi2' ? 'ready' : 'idle'); actor.poseUntil = 0; }
      if (state.turntable && state.view !== 'combat') actor.ctrl.group.rotation.y += step * 0.45;
    }
    if (state.view === 'combat' && time >= nextCast) { cast(); nextCast = time + 1 / state.rate; }
    fx?.update(step);
  }
  if (!building && state.paused) fx?.syncSprites?.();
  if (now - readoutAt > 400 && !building && frameTimes.length >= 10) {
    readoutAt = now; const s = stats();
    $('fps').textContent = s.fps.toFixed(0); $('p95').textContent = s.p95.toFixed(1); $('calls').textContent = s.calls.toLocaleString();
    $('triangles').textContent = s.triangles >= 1000 ? (s.triangles / 1000).toFixed(1) + 'k' : s.triangles;
    $('effects').textContent = s.effects;
  }
});

function sampleFrames(count) {
  return new Promise((resolve, reject) => {
    const values = [], timeout = setTimeout(() => { sampleListeners.delete(sample); reject(new Error('Comparison timed out. Keep this tab visible.')); }, 45000);
    function sample(ms, render) {
      values.push({ ms, calls: render.calls, triangles: render.triangles });
      if (values.length >= count) { clearTimeout(timeout); sampleListeners.delete(sample); resolve(values); }
    }
    sampleListeners.add(sample);
  });
}
async function benchmark({ frames = 120, warmup = 45 } = {}) {
  if (benchmarkActive || building) return [];
  const before = { ...state }; benchmarkActive = true; results = []; busy(true);
  state.view = 'combat'; state.spells = true; state.paused = false; state.turntable = false;
  const cases = [
    { engine: 'original', fxMode: 'original', label: 'Original / original' },
    { engine: 'chibi2', fxMode: 'original', label: 'Chibi 2 / original' },
    { engine: 'chibi2', fxMode: 'batched', label: 'Chibi 2 / batched' },
  ];
  try {
    for (let i = 0; i < cases.length; i++) {
      Object.assign(state, cases[i]); await rebuild();
      $('bench-state').textContent = `${i + 1} / 3: ${cases[i].label}`; $('state').textContent = 'Measuring';
      await sampleFrames(warmup); const samples = await sampleFrames(frames);
      const times = samples.map(s => s.ms).sort((a, b) => a - b), avg = key => samples.reduce((sum, s) => sum + s[key], 0) / samples.length;
      results.push({ label: cases[i].label, frames, warmup, frameAvg: avg('ms'), frameP95: times[Math.floor(times.length * 0.95)], calls: avg('calls'), triangles: avg('triangles'), actor: stats().actor, settings: { shadows: state.shadows, resolution: state.resolution, rate: state.rate, width: scene.renderer.domElement.width, height: scene.renderer.domElement.height } });
      renderResults();
    }
    $('bench-state').textContent = `${frames} measured frames per run / ${state.shadows} shadows / ${state.resolution}x`;
    $('download-results').hidden = false;
    return structuredClone(results);
  } finally {
    Object.assign(state, before); benchmarkActive = false; await rebuild(); busy(false);
  }
}
function renderResults() {
  $('results').replaceChildren(...results.map(r => {
    const tr = document.createElement('tr');
    for (const value of [r.label, r.frameAvg.toFixed(1) + ' ms', r.frameP95.toFixed(1) + ' ms', Math.round(r.calls).toLocaleString(), Math.round(r.triangles).toLocaleString()]) {
      const td = document.createElement('td'); td.textContent = value; tr.append(td);
    }
    return tr;
  }));
}
function download(url, filename) { const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); }
function onError(error) { $('state').textContent = error.message; $('bench-state').textContent = error.message; console.error(error); }
for (const [i, p] of data.presets.entries()) $('preset').add(new Option(p.name, i));
for (const name of CHIBI2_ANIMS) $('animation').add(new Option(name[0].toUpperCase() + name.slice(1), name));
for (const button of document.querySelectorAll('[data-view]')) button.addEventListener('click', () => { state.view = button.dataset.view; rebuild().catch(onError); });
for (const button of document.querySelectorAll('[data-engine]')) button.addEventListener('click', () => { state.engine = button.dataset.engine; rebuild().catch(onError); });
const presetLook = () => { const o = outfits[$('outfit').value]; const a = data.presets[state.preset].avatar; return normalizeAvatar(o ? dressAs(a, o) : a); };
for (const id of Object.keys(outfits).sort()) $('outfit').add(new Option(id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), id));
$('preset').addEventListener('change', () => { state.preset = +$('preset').value; avatar = presetLook(); rebuild().catch(onError); });
$('outfit').addEventListener('change', () => { avatar = presetLook(); rebuild().catch(onError); });
for (const [id, field] of [['cloth', 'top'], ['hair', 'hair'], ['skin', 'body']]) $(id).addEventListener('change', () => { avatar[field][id === 'skin' ? 'skin' : 'color'] = $(id).value; rebuild().catch(onError); });
$('animation').addEventListener('change', () => { for (const a of actors) a.ctrl.setAnim($('animation').value); });
$('fx-mode').addEventListener('change', () => { state.fxMode = $('fx-mode').value; rebuild().catch(onError); });
$('spells').addEventListener('change', () => { state.spells = $('spells').checked; generation++; makeFx(); });
$('rate').addEventListener('input', () => { state.rate = +$('rate').value; $('rate-value').textContent = state.rate; });
$('shadows').addEventListener('change', () => { state.shadows = $('shadows').value; applyRendering(); });
$('resolution').addEventListener('change', () => { state.resolution = +$('resolution').value; applyRendering(); });
$('turntable').addEventListener('change', () => { state.turntable = $('turntable').checked; });
$('pause').addEventListener('click', () => { state.paused = !state.paused; setPauseIcon(); });
$('reset-camera').addEventListener('click', resetCamera);
$('capture').addEventListener('click', () => { scene.renderer.render(scene.scene, scene.camera); download(scene.snapshot(), 'chibi2-' + state.view + '.png'); });
$('benchmark').addEventListener('click', () => benchmark().catch(onError));
$('download-results').addEventListener('click', () => { const url = URL.createObjectURL(new Blob([JSON.stringify({ date: new Date().toISOString(), userAgent: navigator.userAgent, results }, null, 2)], { type: 'application/json' })); download(url, 'chibi2-comparison.json'); setTimeout(() => URL.revokeObjectURL(url), 1000); });
function setPauseIcon() {
  const name = state.paused ? 'play' : 'pause';
  $('pause').setAttribute('aria-label', state.paused ? 'Play' : 'Pause'); $('pause').dataset.tip = state.paused ? 'Play animation' : 'Pause animation';
  $('pause').innerHTML = `<i data-lucide="${name}"></i>`; window.lucide?.createIcons();
}
$('reset-camera').innerHTML = '<i data-lucide="rotate-ccw"></i>';
$('capture').innerHTML = '<i data-lucide="camera"></i>'; setPauseIcon(); installTooltips();
const resizeObserver = new ResizeObserver(() => { if (!benchmarkActive) resetCamera(); }); resizeObserver.observe($('stage'));
addEventListener('pagehide', event => { if (event.persisted) return; disposed = true; generation++; resizeObserver.disconnect(); scene.dispose(); fx?.dispose(); fx?.clearPool(); for (const a of actors) a.ctrl.dispose(); });
await rebuild();
window.chibi2 = { state, scene, get actors() { return actors; }, get fx() { return fx; }, get building() { return building; }, get results() { return results; }, stats, rebuild, benchmark,
  async configure(options) { Object.assign(state, options); if (options.preset != null) avatar = normalizeAvatar(data.presets[options.preset].avatar); applyRendering(); await rebuild(); },
};
