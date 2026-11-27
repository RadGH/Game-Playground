// Tree Kit page — three views of the trees Oathwild draws (the same builder, tufts, materials and wind):
//   One tree   every knob of one species, its seed and detail level, drawn at a game size beside a 1.8 m person; notes
//              pinned on the tree for Claude; Save writes data/species.json (the game reads it) through the live channel
//   Species    every game kind (or every species) at its game height, a person beside each
//   Forest     a patch of wood in the ONE wind: strength / direction / gusts / wave sliders, weather, a storm button
// The live channel (tools/live.mjs, port 8670) keeps this page and Claude's command line (tools/tree-edit.mjs) on one
// working copy: a change from either side redraws here within a second, marked with who made it.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { fmt } from '../../shared/format.js';
import { stopPageZoom } from '../../shared/no-zoom.js';
import { DATA, SPECIES, knobsFor, getKnob, setKnob, forget } from './species.js';
import { buildStoryTree } from './build.js';
import { tuftAtlas } from './tufts.js';
import { treeMaterials } from './materials.js';
import { plantTrees } from './plant.js';
import { createWind, WIND_PRESETS, WEATHER_WIND, WIND_GLSL } from './wind.js';
import { sheafGeometry } from '../../proctown/js/propkit-three.js';
import { makeSurface } from '../../highdef-3d/js/kit/textures.js';
import { connectLive } from './live-client.js';

stopPageZoom();   // a pinch zooms the 3D view, never the whole page (iPhone)
const $ = id => document.getElementById(id);
const q = new URLSearchParams(location.search);
const PERSON = 1.8;
const PART_ORDER = ['Size', 'Trunk', 'Roots', 'Branches', 'Crown', 'Leaves', 'Bark', 'Wind'];
const m1 = v => fmt(v, { decimals: 1 }), m2 = v => fmt(v, { decimals: 2 });

// ---------------------------------------------------------------- state
const GAME = () => DATA.oathwild;
const kindsOf = id => Object.entries({ ...GAME().trees, ...GAME().understory }).filter(([, r]) => r.tree === id);
const firstId = q.get('tree') && SPECIES[q.get('tree')] ? q.get('tree') : 'oak';
const state = {
  mode: ['one', 'gallery', 'forest'].includes(q.get('mode')) ? q.get('mode') : 'one',
  id: firstId, kind: kindsOf(firstId)[0]?.[0] || null, seed: 11, lod: 1,
  gLod: 1, gSet: 'game', fLod: 1, patch: 'mixed', weather: 'clear', preset: 'breeze',
};

// ---------------------------------------------------------------- renderer + scene
const stage = $('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.info.autoReset = false;
stage.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(48, 1, 0.3, 1600);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.08; controls.maxPolarAngle = Math.PI * 0.495;
const hemi = new THREE.HemisphereLight('#dfeeff', '#4a5a30', 1.35); scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff0d0', 2.6); sun.position.set(60, 90, 40); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6; scene.add(sun, sun.target);
const SKY = {
  clear: { sky: '#9cc4e8', fog: '#b8d4ea', hemi: 1.35, sun: 2.6, near: 180, far: 620 },
  cloudy: { sky: '#a3afba', fog: '#b4bcc4', hemi: 1.45, sun: 1.2, near: 150, far: 520 },
  fog: { sky: '#b9c1c4', fog: '#bcc3c5', hemi: 1.5, sun: 0.6, near: 20, far: 220 },
  rain: { sky: '#7d8995', fog: '#8a959f', hemi: 1.2, sun: 0.55, near: 90, far: 380 },
  snow: { sky: '#c3ccd6', fog: '#cdd5dd', hemi: 1.55, sun: 0.9, near: 80, far: 360 },
  storm: { sky: '#4d5866', fog: '#5a6470', hemi: 0.95, sun: 0.35, near: 70, far: 300 },
};
scene.fog = new THREE.Fog('#b8d4ea', 180, 620);
function paintSky(w) {
  const s = SKY[w] || SKY.clear;
  scene.background = new THREE.Color(s.sky); scene.fog.color.set(s.fog); scene.fog.near = s.near; scene.fog.far = s.far;
  hemi.intensity = s.hemi; sun.intensity = s.sun; baseHemi = s.hemi;
}
let baseHemi = 1.35;
const meadow = makeSurface('meadow', { size: 512, seed: 5 });
meadow.map.wrapS = meadow.map.wrapT = THREE.RepeatWrapping; meadow.map.repeat.set(90, 90); meadow.map.anisotropy = 8;
const ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: meadow.map, color: '#9fb486' }));
ground.receiveShadow = true; scene.add(ground);

// ---------------------------------------------------------------- the ONE wind (the page's copy; the game has its own)
const wind = createWind({ seed: 3, ...WIND_PRESETS.breeze, angle: 0.5 });
const held = q.get('wind');
if (held && WIND_PRESETS[held]) { state.preset = held; wind.now(WIND_PRESETS[held]); }

// ---------------------------------------------------------------- a 1.8 m person (the game's textured body, not a 2D cut-out)
let personSrc = null;
const personReady = new GLTFLoader().loadAsync('../avatar-3d/fal/models/final/male.glb').then(g => {
  const root = g.scene; root.updateMatrixWorld(true);
  relaxArms(root);
  const box = new THREE.Box3().setFromObject(root), h = box.max.y - box.min.y;
  root.scale.setScalar(PERSON / h); root.position.y = -box.min.y * PERSON / h;
  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
  personSrc = new THREE.Group(); personSrc.add(root);
}).catch(e => console.warn('treekit: person model', e.message));
/** The body comes in a T-pose: swing each upper arm down to hang at the side (a person standing, not a scarecrow). */
function relaxArms(root) {
  for (const side of ['l', 'r']) {
    const up = root.getObjectByName('upperarm_' + side), lo = root.getObjectByName('lowerarm_' + side);
    if (!up || !lo || !up.parent) continue;
    root.updateMatrixWorld(true);
    const a = up.getWorldPosition(new THREE.Vector3()), b = lo.getWorldPosition(new THREE.Vector3());
    const from = b.sub(a).normalize(), to = new THREE.Vector3(0, -1, 0.08).normalize();
    const delta = new THREE.Quaternion().setFromUnitVectors(from, to);
    const wq = up.getWorldQuaternion(new THREE.Quaternion()), pq = up.parent.getWorldQuaternion(new THREE.Quaternion());
    up.quaternion.copy(pq.invert().multiply(delta.multiply(wq)));
  }
  root.updateMatrixWorld(true);
}
function person(x, z, rot = 0.4) {
  if (!personSrc) return null;
  const p = SkeletonUtils.clone(personSrc); p.position.set(x, 0, z); p.rotation.y = rot; return p;
}

// ---------------------------------------------------------------- grass that leans in the same wind (forest view)
let grassMat = null;
function grassMaterial() {
  if (grassMat) return grassMat;
  grassMat = new THREE.MeshLambertMaterial({ vertexColors: true, color: '#8fb35a', side: THREE.DoubleSide });
  grassMat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, wind.uniforms);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + WIND_GLSL)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          float k = position.y * position.y;
          vec2 lean = owGrassLean(instanceMatrix[3].xz, k);
          transformed += (transpose(mat3(instanceMatrix)) * vec3(lean.x, 0.0, lean.y)) / max(1e-3, dot(instanceMatrix[0].xyz, instanceMatrix[0].xyz));
        }`);
  };
  grassMat.customProgramCacheKey = () => 'tk-grass';
  return grassMat;
}
function grassPatch(R, n, rng) {
  const geo = sheafGeometry(THREE, 9);
  const m = new THREE.InstancedMesh(geo, grassMaterial(), n);
  const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * R;
    p.set(Math.cos(a) * d, 0, Math.sin(a) * d); qq.setFromAxisAngle(up, rng() * 6.28); const k = 0.6 + rng() * 0.6; s.set(0.7 * k, 0.55 * k, 0.7 * k);
    m4.compose(p, qq, s); m.setMatrixAt(i, m4);
  }
  m.receiveShadow = true; m.name = 'grass';
  return m;
}

// ---------------------------------------------------------------- rain (leans with the wind's rainVelocity)
const RAIN_N = 2200, RAIN_BOX = 90;
const rainGeo = new THREE.BufferGeometry();
rainGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(RAIN_N * 6), 3));
const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: '#c9d6e4', transparent: true, opacity: 0.45, fog: true }));
rain.frustumCulled = false; rain.visible = false; scene.add(rain);
const drops = Array.from({ length: RAIN_N }, () => [Math.random(), Math.random(), Math.random()]);
function stepRain(dt) {
  if (!rain.visible) return;
  const v = wind.rainVelocity(28), c = controls.target, arr = rainGeo.attributes.position.array, len = 0.045;
  for (let i = 0; i < RAIN_N; i++) {
    const d = drops[i];
    d[1] -= (28 / 60) * dt; d[0] += (v.x / RAIN_BOX) * dt * 0.5; d[2] += (v.z / RAIN_BOX) * dt * 0.5;
    if (d[1] < 0) { d[1] += 1; d[0] = Math.random(); d[2] = Math.random(); }
    d[0] -= Math.floor(d[0]); d[2] -= Math.floor(d[2]);
    const x = c.x + (d[0] - 0.5) * RAIN_BOX, y = d[1] * 60, z = c.z + (d[2] - 0.5) * RAIN_BOX;
    arr.set([x, y, z, x - v.x * len, y - v.y * len, z - v.z * len], i * 6);
  }
  rainGeo.attributes.position.needsUpdate = true;
}
let flash = 0, nextFlash = 4;
function stepLightning(dt) {
  if (state.mode !== 'forest' || state.weather !== 'storm') { hemi.intensity = baseHemi; return; }
  nextFlash -= dt;
  if (nextFlash < 0) { flash = 0.28; nextFlash = 5 + Math.random() * 9; }
  if (flash > 0) { flash -= dt; hemi.intensity = baseHemi + (Math.sin(flash * 60) > 0 ? 2.6 : 0.6); } else hemi.intensity = baseHemi;
}

// ---------------------------------------------------------------- the three views
let view = null;      // { group, stats, pick?: meshes, labels: [{ el, at: Vector3 }] }
const labelsEl = $('labels');
function clearView() {
  if (!view) return;
  view.dispose?.(); view.group.removeFromParent();
  labelsEl.textContent = '';
  view = null;
}
function label(text, small, at, cls = 'tk-label') {
  const el = document.createElement('div'); el.className = cls;
  el.textContent = text;
  if (small) { const s = document.createElement('small'); s.textContent = small; el.appendChild(s); }
  labelsEl.appendChild(el);
  return { el, at };
}

/** One species, drawn as a plain (not instanced) tree at the picked game size. */
async function buildOne() {
  const sp = SPECIES[state.id];
  const kind = state.kind && (GAME().trees[state.kind] || GAME().understory[state.kind]);
  const lod = state.lod, cheap = lod === 2;
  const mats = await treeMaterials({ cheap, wind });
  const t = buildStoryTree(state.id, { seed: state.seed, lod, tufts: tuftAtlas(), species: sp });
  const h = kind ? kind.height : t.height, k = h / t.height;
  const group = new THREE.Group(); group.name = 'one tree';
  const meshes = [];
  for (const [geo, mat, depth] of [[t.bark, mats.bark, mats.barkDepth], [t.foliage, mats.leaf, mats.leafDepth], [t.tufts, mats.tuft.color, mats.tuft.depth]]) {
    if (!geo) continue;
    const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; if (depth) m.customDepthMaterial = depth;
    m.scale.setScalar(k); group.add(m); meshes.push(m);
  }
  const reach = Math.max(2, t.radius * k);
  const trunkR = (kindsOf(state.id).find(([kk]) => kk === state.kind)?.[1].trunk) || sp.trunk.radius * k;
  const pz = person(trunkR + 1.4, 1.2, -0.9); if (pz) group.add(pz);   // right beside the trunk: the scale reads at a glance
  const tris = Object.values(t.tris).reduce((a, b) => a + b, 0);
  view = { group, meshes, t, k, h, tris, dispose() { for (const g of [t.bark, t.foliage, t.tufts]) g?.dispose(); }, labels: [] };
  scene.add(group);
  const dist = Math.max(h * 1.55, reach * 2.6, 9);
  if (!buildOne.framed || buildOne.framed !== state.id + state.kind) {
    camera.position.set(dist * 0.62, h * 0.45 + 1.5, dist * 0.78); controls.target.set(0, h * 0.45, 0); controls.update();
    buildOne.framed = state.id + state.kind;
  }
  frameSun(Math.max(reach, h * 0.6) + 6);
  pins();
  facts();
}

const GAME_ROW = () => Object.entries(GAME().trees).map(([kind, r]) => ({ kind, id: r.tree, h: r.height, crown: r.crown || 4 }))
  .concat(Object.entries(GAME().understory).map(([kind, r]) => ({ kind, id: r.tree, h: r.height, crown: Math.max(1.4, r.height * 0.4) })));
async function buildGallery() {
  const rows = state.gSet === 'game' ? GAME_ROW() : Object.keys(SPECIES).map(id => {
    const k = kindsOf(id)[0]?.[1]; const h = k ? k.height : SPECIES[id].size.height * 1.6;
    return { kind: null, id, h, crown: (SPECIES[id].crown?.radius || 1.5) * h / SPECIES[id].size.height };
  });
  let x = 0; const list = [];
  for (const r of rows) { x += Math.max(3, r.crown) + 3; list.push({ ...r, x, z: 0, rot: list.length * 0.7 }); x += Math.max(3, r.crown) + 3; }
  const mid = x / 2; for (const r of list) r.x -= mid;
  const f = await plantTrees(list, { lod: state.gLod, cheap: state.gLod === 2, wind, looks: 1 });
  const group = f.group;
  const labels = [];
  for (const r of list) {
    const tr = (r.kind && GAME().trees[r.kind]?.trunk) || 0.3;
    const pz = person(r.x + tr + 1.3, 1.5, -0.3); if (pz) group.add(pz);
    // labels in two staggered rows so neighbours never sit on each other
    labels.push(label(SPECIES[r.id].label, `${r.kind ? r.kind + ' · ' : ''}${m1(r.h)} m · ${fmt(r.h / PERSON, { decimals: 0 })}× a person`, new THREE.Vector3(r.x, -0.2, (list.indexOf(r) % 2 ? 22 : 8))));
  }
  view = { group, stats: f.stats, dispose: f.dispose, labels, list };
  scene.add(group);
  camera.position.set(0, 26, Math.max(110, mid * 0.75)); controls.target.set(0, 14, 0); controls.update();
  frameSun(mid + 30);
}

const PATCHES = {
  mixed: { label: 'Mixed wood', mix: [['oak-a', 3], ['oak-b', 2], ['birch', 3], ['pine-a', 2], ['pine-b', 2], ['marsh-tree', 1], ['ancient-oak', 0.25]] },
  oak: { label: 'Oak wood', mix: [['oak-a', 4], ['oak-b', 3], ['ancient-oak', 0.4]] },
  pine: { label: 'Pine wood', mix: [['pine-a', 3], ['pine-b', 4], ['giant-spruce', 0.3], ['dead-tree', 0.3]] },
  birch: { label: 'Birch grove', mix: [['birch', 5], ['marsh-tree', 1], ['willow', 0.6]] },
};
function rngOf(seed) { let s = seed >>> 0 || 1; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
async function buildForest() {
  const rng = rngOf(41), mix = PATCHES[state.patch].mix, total = mix.reduce((s, [, w]) => s + w, 0);
  const pick = () => { let r = rng() * total; for (const [k, w] of mix) { r -= w; if (r <= 0) return k; } return mix[0][0]; };
  const list = [], R = 85, step = 11;
  for (let gx = -R; gx <= R; gx += step) for (let gz = -R; gz <= R; gz += step) {
    const x = gx + (rng() - 0.5) * step * 0.9, z = gz + (rng() - 0.5) * step * 0.9;
    if (Math.hypot(x, z) > R || z > 18 + 10 * Math.sin(x * 0.05) || rng() < 0.18) continue;   // a wood with a meadow in front of it
    const kind = pick(), r = GAME().trees[kind];
    if (r.giant && list.some(t => Math.hypot(t.x - x, t.z - z) < r.crown * 0.7)) continue;
    list.push({ id: r.tree, x, z, rot: rng() * 6.28, h: r.height * (0.85 + rng() * 0.3) });
  }
  const f = await plantTrees(list, { lod: state.fLod, cheap: state.fLod === 2, wind, looks: state.fLod === 2 ? 1 : 2 });
  const group = f.group;
  const grass = grassPatch(R + 20, [12000, 8000, 4000][state.fLod], rngOf(9)); group.add(grass);
  for (const [x, z] of [[-6, 40], [-2, 44], [3, 38]]) { const pz = person(x, z, Math.PI + rng() - 0.5); if (pz) group.add(pz); }
  view = { group, stats: { ...f.stats, triangles: f.stats.triangles + grass.count * grass.geometry.index.count / 3 }, dispose() { f.dispose(); grass.geometry.dispose(); }, labels: [] };
  scene.add(group);
  camera.position.set(-4, 7, 86); controls.target.set(0, 12, 6); controls.update();
  frameSun(R + 30);
}
function frameSun(r) {
  Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 400 }); sun.shadow.camera.updateProjectionMatrix();
  sun.position.set(controls.target.x + 70, 110, controls.target.z + 45); sun.target.position.copy(controls.target);
}

let building = null, again = false, rebuilt = 0;
async function rebuild() {
  if (building) { again = true; return building; }
  building = (async () => {
    do {
      again = false;
      await personReady;
      clearView();
      if (state.mode === 'one') await buildOne(); else if (state.mode === 'gallery') await buildGallery(); else await buildForest();
      rain.visible = state.mode === 'forest' && (state.weather === 'rain' || state.weather === 'storm');
      rebuilt++;
    } while (again);
    building = null;
    $('loading').classList.add('gone');
    window.__tk.ready = true;
  })();
  return building;
}
let soon = 0;
const rebuildSoon = () => { clearTimeout(soon); soon = setTimeout(rebuild, 60); };

// ---------------------------------------------------------------- the side panel
function chip(parent, text, sel, on, small) {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'tk-chip'; b.setAttribute('role', 'radio');
  b.textContent = text; if (small) { const s = document.createElement('small'); s.textContent = small; b.appendChild(s); }
  b.setAttribute('aria-checked', String(!!sel)); b.onclick = on; parent.appendChild(b); return b;
}
function seg(el, value, on) {
  for (const b of el.querySelectorAll('button')) { b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(b.dataset.v === String(value))); b.onclick = () => on(b.dataset.v); }
}
function setMode(m) {
  state.mode = m;
  for (const b of $('modes').querySelectorAll('button')) b.setAttribute('aria-selected', String(b.dataset.mode === m));
  for (const c of document.querySelectorAll('[data-for]')) c.hidden = c.dataset.for !== m;
  const u = new URL(location.href); u.searchParams.set('mode', m); if (m === 'one') u.searchParams.set('tree', state.id); history.replaceState(null, '', u);
  if (m !== 'forest') { paintSky('clear'); } else paintSky(state.weather);
  $('side').scrollTop = 0;
  rebuild();
}
for (const b of $('modes').querySelectorAll('button')) b.onclick = () => setMode(b.dataset.mode);

function speciesChips() {
  const el = $('species'); el.textContent = '';
  for (const id of Object.keys(SPECIES)) chip(el, SPECIES[id].label, id === state.id, () => { state.id = id; state.kind = kindsOf(id)[0]?.[0] || null; panelOne(); rebuild(); });
  const kEl = $('kind'); kEl.textContent = '';
  for (const [k, r] of kindsOf(state.id)) chip(kEl, k, k === state.kind, () => { state.kind = k; panelOne(); rebuild(); }, `${m1(r.height)} m`);
  chip(kEl, 'Own size', !state.kind, () => { state.kind = null; panelOne(); rebuild(); }, `${m1(SPECIES[state.id].size.height)} units`);
}
const claudeMarks = new Map();          // knob path → { by, at } (the last time someone other than this page changed it)
function knobsPanel() {
  const sp = SPECIES[state.id], el = $('knobs');
  const open = new Set([...el.querySelectorAll('details[open]')].map(d => d.dataset.part));
  if (!el.children.length) open.add('Trunk');
  el.textContent = '';
  const byPart = new Map();
  for (const k of knobsFor(sp)) { if (!byPart.has(k.part)) byPart.set(k.part, []); byPart.get(k.part).push(k); }
  for (const part of PART_ORDER) {
    const ks = byPart.get(part); if (!ks) continue;
    const d = document.createElement('details'); d.className = 'tk-part'; d.dataset.part = part; d.open = open.has(part);
    const s = document.createElement('summary'); s.textContent = part; d.appendChild(s);
    const body = document.createElement('div'); body.className = 'tk-body'; d.appendChild(body);
    for (const k of ks) body.appendChild(knobRow(sp, k));
    el.appendChild(d);
  }
}
function knobRow(sp, k) {
  const row = document.createElement('div'); row.className = 'tk-knob'; row.dataset.path = k.path;
  const id = 'k-' + k.path.replace('.', '-');
  const lab = document.createElement('label'); lab.textContent = k.label; lab.htmlFor = id;
  const val = document.createElement('b');
  const cur = getKnob(sp, k.path);
  const send = v => { setKnob(sp, k.path, v); forget(sp); live.set(state.id, k.path, getKnob(sp, k.path)); markDirty(); rebuildSoon(); };
  row.append(lab, val);
  if (k.kind === 'n' || k.kind === 'i') {
    const r = document.createElement('input'); r.type = 'range'; r.id = id; r.min = k.min; r.max = k.max; r.step = k.step; r.value = cur ?? k.min;
    const show = () => { val.textContent = k.kind === 'i' ? fmt(+r.value, { decimals: 0 }) : fmt(+r.value, { decimals: k.step < 0.01 ? 3 : 2 }); };
    r.oninput = () => { show(); send(+r.value); }; show(); row.appendChild(r);
  } else if (k.kind === 'b' || k.kind === 's') {
    const opts = k.kind === 'b' ? [['on', true], ['off', false]] : k.of.map(o => [o, o]);
    const t = document.createElement('div'); t.className = 'tk-toggle'; t.setAttribute('role', 'radiogroup'); t.setAttribute('aria-label', k.label); t.id = id;
    for (const [txt, v] of opts) { const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'radio'); b.textContent = txt; b.setAttribute('aria-checked', String((cur ?? false) === v)); b.onclick = () => { for (const x of t.children) x.setAttribute('aria-checked', String(x === b)); send(v); }; t.appendChild(b); }
    val.textContent = ''; row.appendChild(t);
  } else if (k.kind === 'c') {
    const c = (cur || [1, 1, 1]).slice(), box = document.createElement('div'); box.className = 'tk-rgb';
    const sw = document.createElement('i'); sw.className = 'tk-sw';
    const paint = () => { const base = k.path.startsWith('bark') ? [0.24, 0.17, 0.12] : [0.36, 0.55, 0.28]; sw.style.background = `rgb(${c.map((x, i) => Math.round(Math.min(255, base[i] * x * 255))).join(',')})`; val.textContent = c.map(x => fmt(x, { decimals: 2 })).join(' · '); };
    ['R', 'G', 'B'].forEach((n, i) => {
      const s = document.createElement('span'); s.textContent = n;
      const r = document.createElement('input'); r.type = 'range'; r.min = k.min; r.max = k.max; r.step = k.step; r.value = c[i]; if (!i) r.id = id; r.setAttribute('aria-label', `${k.label} ${n}`);
      r.oninput = () => { c[i] = +r.value; paint(); send(c.slice()); };
      box.append(s, r);
    });
    paint(); row.append(box); row.appendChild(sw);
  }
  const mark = claudeMarks.get(state.id + ':' + k.path);
  if (mark) { row.classList.add('claude'); const w = document.createElement('span'); w.className = 'tk-who'; w.textContent = `changed by ${mark.by === 'claude' ? 'Claude' : mark.by} · ${ago(mark.at)}`; row.appendChild(w); }
  return row;
}
function panelOne() {
  speciesChips();
  seg($('lod'), state.lod, v => { state.lod = +v; panelOne(); rebuild(); });
  $('seed-v').textContent = state.seed;
  knobsPanel(); notesPanel(); markDirty();
}
$('seed-dn').onclick = () => { state.seed = Math.max(1, state.seed - 1); $('seed-v').textContent = state.seed; rebuild(); };
$('seed-up').onclick = () => { state.seed++; $('seed-v').textContent = state.seed; rebuild(); };
$('seed-rand').onclick = () => { state.seed = 1 + Math.floor(Math.random() * 9999); $('seed-v').textContent = state.seed; rebuild(); };

function facts() {
  if (state.mode !== 'one' || !view?.t) return;
  const t = view.t, sp = SPECIES[state.id], k = view.k;
  const rows = [['Drawn height', `${m1(view.h)} m · ${fmt(view.h / PERSON, { decimals: 1 })}× a person`], ['Crown reach', `${m1(t.radius * k)} m`], ['Triangles', fmt(view.tris, { decimals: 0 })]];
  for (const [kind, r] of kindsOf(state.id)) if (r.trunk != null) rows.push([`${kind} collider`, `trunk ${m2(r.trunk)} m · crown ${m1(r.crown)} m`]);
  if (!kindsOf(state.id).length) rows.push(['In the game', 'not used yet']);
  rows.push(['Gale bend', `${fmt(100 * (0.12 - 0.105 * Math.min(1, Math.max(0, sp.wind?.stiffness ?? 0.5))), { decimals: 1 })}% of the height`]);
  const dl = $('facts'); dl.textContent = '';
  for (const [a, b] of rows) { const dt = document.createElement('dt'); dt.textContent = a; const dd = document.createElement('dd'); dd.textContent = b; dl.append(dt, dd); }
}

function panelGallery() {
  seg($('lod-g'), state.gLod, v => { state.gLod = +v; panelGallery(); rebuild(); });
  seg($('set-g'), state.gSet, v => { state.gSet = v; panelGallery(); rebuild(); });
  const ul = $('gallery-list'); ul.textContent = '';
  const rows = state.gSet === 'game' ? GAME_ROW() : Object.keys(SPECIES).map(id => ({ kind: null, id, h: kindsOf(id)[0]?.[1].height }));
  for (const r of rows) {
    const li = document.createElement('li'), b = document.createElement('button'); b.type = 'button';
    const a = document.createElement('span'); a.textContent = SPECIES[r.id].label + (r.kind ? ` (${r.kind})` : '');
    const s = document.createElement('small'); s.textContent = r.h ? `${m1(r.h)} m` : 'not in the game';
    b.append(a, s); b.onclick = () => { state.id = r.id; state.kind = r.kind || kindsOf(r.id)[0]?.[0] || null; panelOne(); setMode('one'); };
    li.appendChild(b); ul.appendChild(li);
  }
}

const WIND_KNOBS = [
  { key: 'strength', label: 'Strength (0 calm · 1 gale · 1.5 storm)', min: 0, max: 1.6, step: 0.01, show: v => m2(v) },
  { key: 'angle', label: 'Blows toward', min: 0, max: 360, step: 1, show: v => `${fmt(v, { decimals: 0 })}° ${compass(v)}`, from: a => ((a * 180 / Math.PI) % 360 + 360) % 360, to: v => v * Math.PI / 180 },
  { key: 'gust', label: 'Gusts (steady … gusty)', min: 0, max: 1, step: 0.01, show: v => m2(v) },
  { key: 'waveLength', label: 'Gust wave spacing', min: 20, max: 200, step: 1, show: v => `${fmt(v, { decimals: 0 })} m` },
  { key: 'waveSpeed', label: 'Gust wave speed', min: 0, max: 30, step: 0.5, show: v => `${fmt(v, { decimals: 1 })} m/s` },
];
const compass = deg => ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'][Math.round(((deg % 360) + 360) % 360 / 45) % 8];
function panelForest() {
  const wEl = $('weather'); wEl.textContent = '';
  for (const w of ['clear', 'cloudy', 'rain', 'storm', 'fog', 'snow']) chip(wEl, w[0].toUpperCase() + w.slice(1), state.weather === w, () => {
    state.weather = w; state.preset = null; wind.setFromWeather({ kind: w }); paintSky(w); $('storm').setAttribute('aria-pressed', String(w === 'storm'));
    rain.visible = w === 'rain' || w === 'storm'; panelForest();
  });
  const pEl = $('presets'); pEl.textContent = '';
  for (const p of Object.keys(WIND_PRESETS)) chip(pEl, p[0].toUpperCase() + p.slice(1), state.preset === p, () => { state.preset = p; wind.set(WIND_PRESETS[p]); panelForest(); });
  const box = $('wind-knobs'); box.textContent = '';
  for (const k of WIND_KNOBS) {
    const row = document.createElement('div'); row.className = 'tk-wind';
    const lab = document.createElement('label'); lab.textContent = k.label; lab.htmlFor = 'w-' + k.key;
    const b = document.createElement('b'); const r = document.createElement('input'); r.type = 'range'; r.id = 'w-' + k.key; r.min = k.min; r.max = k.max; r.step = k.step;
    const v0 = k.from ? k.from(wind.target[k.key]) : wind.target[k.key]; r.value = v0; b.textContent = k.show(v0);
    r.oninput = () => { b.textContent = k.show(+r.value); state.preset = null; for (const c of pEl.children) c.setAttribute('aria-checked', 'false'); wind.set({ [k.key]: k.to ? k.to(+r.value) : +r.value }); };
    row.append(lab, b, r); box.appendChild(row);
  }
  const pa = $('patch'); pa.textContent = '';
  for (const [k, p] of Object.entries(PATCHES)) chip(pa, p.label, state.patch === k, () => { state.patch = k; panelForest(); rebuild(); });
  seg($('lod-f'), state.fLod, v => { state.fLod = +v; panelForest(); rebuild(); });
}
$('storm').onclick = () => {
  const on = $('storm').getAttribute('aria-pressed') !== 'true';
  state.weather = on ? 'storm' : 'clear'; state.preset = null;
  wind.setFromWeather({ kind: state.weather }); paintSky(state.weather); rain.visible = on;
  $('storm').setAttribute('aria-pressed', String(on)); panelForest();
};

// ---------------------------------------------------------------- live channel, saving, notes
const ago = t => { const s = Math.max(0, Math.round((Date.now() - t) / 1000)); return s < 10 ? 'just now' : s < 90 ? `${s} s ago` : s < 5400 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`; };
let notes = [], dirty = new Set(), lastChange = null;
const live = connectLive({
  enabled: q.get('live') !== '0',
  onStatus(s) {
    const el = $('live'); el.classList.toggle('on', s.on); el.classList.toggle('off', !s.on);
    el.querySelector('span').textContent = s.on ? 'Live with Claude' : s.reason;
    $('save').disabled = !s.on; $('revert').disabled = !s.on; $('pin').disabled = !s.on; $('pin-plain').disabled = !s.on;
    $('save-msg').textContent = s.on ? '' : `Saving and notes need the live channel: ${s.reason.toLowerCase()}.`;
  },
  onHello(st) {
    for (const [id, sp] of Object.entries(st.species)) if (SPECIES[id] && JSON.stringify(SPECIES[id]) !== JSON.stringify(sp)) { SPECIES[id] = sp; forget(sp); }
    if (st.game) DATA.oathwild = st.game;
    notes = st.notes || []; dirty = new Set(st.dirty || []); lastChange = st.last;
    showChange(); panelOne(); if (state.mode !== 'forest') rebuild(); else rebuildSoon();
  },
  onSpecies(ev) {
    dirty = new Set(ev.dirty || []); lastChange = ev.last;
    const same = JSON.stringify(SPECIES[ev.id]) === JSON.stringify(ev.species);
    if (!same) {
      SPECIES[ev.id] = ev.species; forget(ev.species);
      if (ev.last?.by !== 'owner' && ev.last?.path) claudeMarks.set(ev.id + ':' + ev.last.path, { by: ev.last.by, at: ev.last.at });
      if (ev.id === state.id) knobsPanel();
      if (state.mode === 'one' ? ev.id === state.id : true) rebuildSoon();
    }
    markDirty(); showChange();
  },
  onSaved(ev) { dirty = new Set(); lastChange = ev.last; if (ev.game) DATA.oathwild = ev.game; markDirty(); showChange(); facts(); $('save-msg').textContent = `Saved — the game reads it on its next load${ev.measured?.length ? `; ${ev.measured.length} game sizes re-measured` : ''}.`; },
  onReverted(ev) { for (const [id, sp] of Object.entries(ev.species)) { SPECIES[id] = sp; forget(sp); } dirty = new Set(ev.dirty || []); lastChange = ev.last; panelOne(); showChange(); rebuildSoon(); },
  onNotes(ev) { notes = ev.notes; notesPanel(); pins(); },
});
function markDirty() {
  const d = dirty.has(state.id);
  $('dirty').hidden = !d; $('dirty').textContent = dirty.size > 1 ? `Unsaved · ${dirty.size} trees` : 'Unsaved';
}
function showChange() {
  const el = $('changed'), L = lastChange;
  if (!L || L.by === 'owner' || Date.now() - L.at > 30 * 60e3) { el.hidden = true; return; }
  el.hidden = false; el.textContent = '';
  const b = document.createElement('b'); b.textContent = L.by === 'claude' ? 'Claude' : L.by;
  const what = L.path === 'save' ? 'saved the trees for the game' : L.path === 'revert' ? `put ${L.id === '*' ? 'every tree' : SPECIES[L.id]?.label || L.id} back to saved` : L.path === '*' ? `replaced ${SPECIES[L.id]?.label || L.id}` : `changed ${SPECIES[L.id]?.label || L.id} · ${L.path}${L.value !== undefined ? ` → ${Array.isArray(L.value) ? L.value.map(m2).join(' ') : typeof L.value === 'number' ? m2(L.value) : L.value}` : ''}`;
  el.append(b, document.createTextNode(` ${what} · ${ago(L.at)}`));
  el.classList.toggle('fade', Date.now() - L.at > 60e3);
}
$('save').onclick = async () => { $('save').disabled = true; $('save-msg').textContent = 'Saving…'; try { await live.save(); } catch (e) { $('save-msg').textContent = `Not saved: ${e.message}`; } $('save').disabled = !live.on; };
$('revert').onclick = () => live.revert(state.id).catch(e => { $('save-msg').textContent = e.message; });

function notesPanel() {
  const ul = $('notes'); ul.textContent = '';
  const mine = notes.filter(n => n.species === state.id).sort((a, b) => (a.status === 'done') - (b.status === 'done') || b.id - a.id);
  const open = notes.filter(n => n.status !== 'done').length;
  $('note-count').textContent = notes.length ? `${open} open · ${notes.length - open} done` : '';
  if (!mine.length) { const li = document.createElement('li'); li.className = 'tk-empty'; li.style.border = '0'; li.style.background = 'none'; li.textContent = `No notes on ${SPECIES[state.id].label} yet.`; ul.appendChild(li); }
  for (const n of mine) {
    const li = document.createElement('li'); if (n.status === 'done') li.classList.add('done');
    const h = document.createElement('div'); h.className = 'tk-nhead';
    const st = document.createElement('span'); st.className = 'tk-nstate'; st.textContent = n.status === 'done' ? `Done${n.doneBy === 'claude' ? ' by Claude' : ''}` : 'Open';
    const meta = document.createElement('span'); meta.textContent = `#${n.id} · ${n.by === 'claude' ? 'Claude' : 'you'}${n.at ? ' · pinned' : ''}`;
    h.append(st, meta);
    const p = document.createElement('p'); p.textContent = n.text;
    li.append(h, p);
    if (n.reply) { const r = document.createElement('div'); r.className = 'tk-reply'; r.textContent = n.reply; li.appendChild(r); }
    const act = document.createElement('div'); act.className = 'tk-nact';
    const tog = document.createElement('button'); tog.type = 'button'; tog.textContent = n.status === 'done' ? 'Open again' : 'Mark done';
    tog.onclick = () => live.note({ id: n.id, status: n.status === 'done' ? 'open' : 'done' });
    const del = document.createElement('button'); del.type = 'button'; del.textContent = 'Remove';
    del.onclick = () => live.note({ id: n.id, remove: true });
    act.append(tog, del); li.appendChild(act);
    ul.appendChild(li);
  }
}
let pinning = false;
function startPin() {
  if (!$('note-text').value.trim()) { $('note-text').focus(); $('note-text').placeholder = 'Write the note first, then pin it'; return; }
  pinning = true; stage.classList.add('pinning'); $('pinbar').hidden = false; $('hint').hidden = true;
}
function endPin() { pinning = false; stage.classList.remove('pinning'); $('pinbar').hidden = true; $('hint').hidden = false; }
$('pin').onclick = startPin;
$('pin-cancel').onclick = endPin;
$('pin-plain').onclick = async () => { const text = $('note-text').value.trim(); if (!text) { $('note-text').focus(); return; } await live.addNote({ species: state.id, text }); $('note-text').value = ''; };
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let downAt = null;
renderer.domElement.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', async e => {
  if (!pinning || !downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6 || !view?.meshes) return;
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects([...view.meshes, ground], false)[0];
  if (!hit) return;
  const text = $('note-text').value.trim();
  endPin();
  await live.addNote({ species: state.id, text, at: [hit.point.x, hit.point.y, hit.point.z] });
  $('note-text').value = '';
});
function pins() {
  if (state.mode !== 'one' || !view) return;
  for (const l of view.labels) l.el.remove();
  view.labels = notes.filter(n => n.species === state.id && n.at).map(n => {
    const l = label(`#${n.id} ${n.text.length > 60 ? n.text.slice(0, 58) + '…' : n.text}`, null, new THREE.Vector3(...n.at), 'tk-pin' + (n.status === 'done' ? ' done' : ''));
    return l;
  });
}

// ---------------------------------------------------------------- frame loop
const hud = $('hud');
const v3 = new THREE.Vector3();
let lastT = performance.now(), hudT = 0, fps = 60;
function resize() { const w = stage.clientWidth, h = stage.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix(); }
new ResizeObserver(resize).observe(stage); resize();
renderer.setAnimationLoop(now => {
  const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
  fps += ((1 / Math.max(1e-3, dt)) - fps) * 0.05;
  wind.update(dt); controls.update(); stepRain(dt); stepLightning(dt);
  renderer.info.reset(); renderer.render(scene, camera);
  if (view?.labels?.length) {
    const w = stage.clientWidth, h = stage.clientHeight;
    for (const l of view.labels) {
      v3.copy(l.at).project(camera);
      const vis = v3.z < 1 && Math.abs(v3.x) < 1.1 && Math.abs(v3.y) < 1.1;
      l.el.style.display = vis ? '' : 'none';
      if (vis) l.el.style.left = `${(v3.x * 0.5 + 0.5) * w}px`, l.el.style.top = `${(-v3.y * 0.5 + 0.5) * h}px`;
    }
  }
  if ((hudT -= dt) < 0) { hudT = 0.5; drawHud(); showChange(); }
});
function drawHud() {
  const I = renderer.info.render, ws = wind.state;
  const rows = [['Triangles', fmt(I.triangles, { decimals: 0 })], ['Draw calls', fmt(I.calls, { decimals: 0 })], ['Frame rate', `${fmt(fps, { decimals: 0 })}/s`]];
  if (state.mode === 'forest') rows.push(['Trees', fmt(view?.stats?.trees || 0, { decimals: 0 })], ['Wind', `${m2(ws.strength)} · ${compass(ws.angle * 180 / Math.PI)}`], ['Push here', m2(wind.pushAt(controls.target.x, controls.target.z))]);
  hud.textContent = '';
  for (const [a, b] of rows) { const dt = document.createElement('dt'); dt.textContent = a; const dd = document.createElement('dd'); dd.textContent = b; hud.append(dt, dd); }
}

// ---------------------------------------------------------------- start
window.__tk = {
  ready: false, state, wind, get rebuilt() { return rebuilt; }, get live() { return live; }, get notes() { return notes; },
  stats: () => ({ ...renderer.info.render, view: view?.stats || (view?.tris != null ? { triangles: view.tris } : null), height: view?.h, crown: view?.t ? view.t.radius * view.k : null }),
  set: (path, v) => { setKnob(SPECIES[state.id], path, v); forget(SPECIES[state.id]); knobsPanel(); return rebuild(); },
  mode: m => { setMode(m); return building || Promise.resolve(); },
  rebuild: () => rebuild(),
  get view() { return view; },
};
panelOne(); panelGallery(); panelForest();
setMode(state.mode);
