// Bannerline crowd bench (stream C, docs/PLAN.md §15.2).
//
// What it measures: the cost of drawing the game's actual units — Chibi 2 humanoids (two skinned
// meshes each, templates shared per look) and creatures folded by avatar-3d/js/mesh-merge.js —
// walking down a field, stopping to attack and casting BatchedSpellFx projectiles at a hero, seen
// through the game's own renderer (js/view/renderer.js: one WebGLRenderer, scissored viewports,
// contact shadows only) and RTS camera (js/view/camera.js: pitch 56, FOV 38, the middle zoom).
//
// Cases: 20 / 40 / 60 / 80 units per viewport, in 1 and 2 viewports (2 viewports = two fields,
// so 2N bodies), plus the "stand-in" option at 80: the nearest 25 per viewport stay full actors and
// the rest become one instanced capsule-and-head per unit type (PLAN §15.2's cheap stand-in).
//
// Per frame it records the frame interval (rAF), draw calls and triangles summed over every
// viewport (renderer.info with autoReset off), and the CPU time of the animation update and of the
// render call. The decision rule (largest N where two viewports hold >= 55 fps) is computed live.
//
//   window.bench.run({ frames, warmup, cases }) -> results     (tools/bench-bannerline.mjs uses it)
//   ?case=40x2 shows one case; ?auto=1 runs everything on load.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createRenderer } from '../view/renderer.js';
import { createRtsCamera } from '../view/camera.js';
import { loadLooks } from '../view/unit-looks.js';
import { createPortrait } from '../view/portrait.js';
import { BatchedSpellFx } from '../../../../avatar-3d/js/spellfx-batched.js';
import { Assets } from '../../../../assets/js/assets.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const FIELD = { w: 48, len: 140, gap: 40 };
const FIELD_X = [-(FIELD.w + FIELD.gap) / 2, (FIELD.w + FIELD.gap) / 2];
const BAND = { x: 10.5, z0: 4, z1: 30 };        // where the crowd walks, inside the middle-zoom view
const POOL = 80;                                // bodies built per field (cases enable the first N)
const ELEMENTS = ['fire', 'nature', 'arcane', 'ice', 'lightning', 'holy'];
const TIER_WEIGHT = { 1: 4, 2: 3, 3: 2, 4: 1.5, 6: 0.5 };
const RACES = [['freeholds', 'ashtusk'], ['unburied', 'thornmane']];   // who walks down each field

function rng(seed) { let a = seed >>> 0; return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------------------------------------------------------------- renderer, cameras, ground
const canvas = $('view');
const pixelRatio = () => $('pr').value === 'device' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
let R = createRenderer(canvas, { pixelRatio: pixelRatio() });
R.renderer.info.autoReset = false;
const scene = R.scene;
scene.background = new THREE.Color(0x26303a);

const cams = [0, 1].map(i => {
  const c = createRtsCamera();
  c.setUp(0, -1);
  c.snapTo(FIELD_X[i], (BAND.z0 + BAND.z1) / 2 + 2);
  return c;
});
const viewports = [0, 1].map(i => ({
  id: 'vp' + i, camera: cams[i].camera, rect: { x: 0, y: 0, w: 1, h: 1 }, on: i === 0,
  layout(size) {
    const two = viewports[1].on;
    const w = two ? Math.floor(size.w / 2) : size.w;
    this.rect = { x: two && i === 1 ? size.w - w : 0, y: 0, w: two && i === 1 ? size.w - w : w, h: size.h };
  },
}));
function setViewports(v) {
  for (const vp of [...R.viewports]) R.removeViewport(vp);
  viewports[1].on = v > 1;
  R.addViewport(viewports[0]);
  if (v > 1) R.addViewport(viewports[1]);
  $('vp1').hidden = v < 2;
  R.resize();
}

function groundTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
  g.fillStyle = '#56653f'; g.fillRect(0, 0, 512, 512);
  const r = rng(9);
  for (let i = 0; i < 2600; i++) { const v = r(); g.fillStyle = v < 0.5 ? 'rgba(70,90,48,.5)' : v < 0.85 ? 'rgba(98,112,62,.45)' : 'rgba(120,108,72,.35)'; g.fillRect(r() * 512, r() * 512, 2 + r() * 6, 2 + r() * 6); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 16); t.anisotropy = 4;
  return t;
}
function buildGround() {
  const tex = groundTexture();
  const fieldMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 1 });
  const road = new THREE.MeshStandardMaterial({ color: '#8a7656', roughness: 1 });
  const wall = new THREE.MeshStandardMaterial({ color: '#7a7466', roughness: 0.95, flatShading: true });
  const under = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: '#3c4a30', roughness: 1 }));
  under.rotation.x = -Math.PI / 2; under.position.y = -0.05; scene.add(under);
  const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 2.4, 1), wall, 8); let k = 0;
  const m = new THREE.Matrix4();
  for (const fx of FIELD_X) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(FIELD.w, FIELD.len), fieldMat); f.rotation.x = -Math.PI / 2; f.position.set(fx, 0, 0); scene.add(f);
    const lane = new THREE.Mesh(new THREE.PlaneGeometry(9, FIELD.len), road); lane.rotation.x = -Math.PI / 2; lane.position.set(fx, 0.01, 0); scene.add(lane);
    for (const s of [-1, 1]) { m.compose(new THREE.Vector3(fx + s * (FIELD.w / 2 + 0.6), 1.2, 0), new THREE.Quaternion(), new THREE.Vector3(1.2, 1, FIELD.len)); walls.setMatrixAt(k++, m); }
    for (const z of [-FIELD.len / 2, FIELD.len / 2]) { m.compose(new THREE.Vector3(fx, 1.2, z), new THREE.Quaternion(), new THREE.Vector3(FIELD.w + 2.4, 1, 1.2)); walls.setMatrixAt(k++, m); }
  }
  walls.count = k; scene.add(walls);
}
buildGround();

// contact shadows: one instanced quad for every body
const shadow = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 3, 32, 32, 31); grad.addColorStop(0, 'rgba(10,14,8,.62)'); grad.addColorStop(0.6, 'rgba(10,14,8,.3)'); grad.addColorStop(1, 'rgba(10,14,8,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const mat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, toneMapped: false });
  const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.InstancedMesh(geo, mat, POOL * 2 + 8); mesh.count = 0; mesh.frustumCulled = false; mesh.renderOrder = -1; scene.add(mesh);
  return mesh;
})();

// ---------------------------------------------------------------- bodies
const looks = await loadLooks();
const assets = await Assets.open('../../assets/');
const textures = await assets.fxTextures(THREE, { size: 128 });
const fx = new BatchedSpellFx(scene, { camera: cams[0].camera, textures, scale: 1.6, maxParticles: 600, maxLive: 80 });

function pickPool(field) {
  const r = rng(101 + field * 7);
  const ids = looks.unitIds().filter(id => RACES[field].includes(looks.forUnit(id).race));
  const bag = []; for (const id of ids) { const w = TIER_WEIGHT[looks.forUnit(id).tier] || 1; for (let i = 0; i < w * 2; i++) bag.push(id); }
  const out = []; for (let i = 0; i < POOL; i++) out.push(bag[Math.floor(r() * bag.length)]);
  return out;
}

const fields = [];       // per field: { actors:[], hero, standin:Map }
let unitScale = +$('us').value;

async function buildField(field) {
  const ids = pickPool(field), r = rng(500 + field);
  const actors = [];
  for (let i = 0; i < ids.length; i++) {
    const look = looks.forUnit(ids[i]);
    const a = await looks.build(look);
    const lanes = 9, lane = i % lanes;
    a.home = { x: FIELD_X[field] + (lane / (lanes - 1) * 2 - 1) * BAND.x + (r() - 0.5) * 1.2, z: BAND.z0 + r() * (BAND.z1 - BAND.z0) };
    a.speed = 1.8 + r() * 1.4; a.nextAttack = 1 + r() * 4; a.attackUntil = 0; a.lookId = ids[i];
    a.baseScale = (look.scale || 1) * unitScale;
    a.group.scale.setScalar(a.baseScale);
    a.group.position.set(a.home.x, 0, a.home.z);
    a.group.rotation.y = 0;                        // faces +z: down the field, toward the Keep
    a.setAnim('walk'); a.update(r() * 2, r() * 2);
    a.group.visible = false; scene.add(a.group);
    actors.push(a);
    if (i % 8 === 7) $('state').textContent = `Building field ${field + 1}: ${i + 1} / ${ids.length}`;
  }
  const hero = await looks.build(looks.forHero(field ? 'pyromancer' : 'warrior'));
  hero.group.scale.setScalar(1.35 * unitScale); hero.group.position.set(FIELD_X[field], 0, BAND.z1 + 3); hero.group.rotation.y = Math.PI;
  hero.setAnim('ready'); scene.add(hero.group); hero.group.visible = false; hero.nextHit = 0;
  fields[field] = { actors, hero, standin: buildStandins(actors) };
}

/**
 * THE STAND-IN (PLAN §15.2): one InstancedMesh per unit type — a capsule body and a head ball in
 * the unit's main colour. In the game the unit's baked icon would ride on top as a billboard from
 * the same atlas; here the capsule alone is enough to price the idea.
 */
function buildStandins(actors) {
  const byType = new Map();
  const geo = (() => { const body = new THREE.CapsuleGeometry(0.28, 0.5, 3, 8); body.translate(0, 0.53, 0); const head = new THREE.SphereGeometry(0.24, 10, 8); head.translate(0, 1.15, 0); return mergeGeometries([body, head]); })();
  for (const a of actors) {
    if (byType.has(a.lookId)) continue;
    const L = a.look, colour = L.kind === 'chibi2' ? (L.avatar.top?.color || '#888') : L.spec.colors.body;
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: colour, roughness: 0.8 }), POOL);
    mesh.count = 0; mesh.frustumCulled = false; mesh.visible = false; scene.add(mesh);
    byType.set(a.lookId, mesh);
  }
  return byType;
}

// ---------------------------------------------------------------- case state + frame loop
const live = { n: 40, v: 2, standins: 0, time: 0, castAcc: [0, 0] };
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();
const sampleSinks = new Set();

function applyCase({ n, v, standins = 0 }) {
  live.n = n; live.v = v; live.standins = standins;
  setViewports(v);
  for (let f = 0; f < 2; f++) {
    const F = fields[f], on = f < v;
    F.actors.forEach((a, i) => { a.active = on && i < n; a.group.visible = a.active; a.full = a.active; });
    F.hero.group.visible = on;
    for (const m of F.standin.values()) { m.visible = on && standins > 0; m.count = 0; }
  }
  fx.clearPool?.();
  R.renderer.info.reset();
  $('live').textContent = `${n} per viewport x ${v}${standins ? ` / stand-ins past ${standins}` : ''}`;
}

/** Choose who is drawn in full: the nearest `standins` actors to that field's camera. */
function assignStandins() {
  if (!live.standins) return;
  for (let f = 0; f < live.v; f++) {
    const cam = cams[f].camera.position, act = fields[f].actors.filter(a => a.active);
    act.sort((a, b) => a.group.position.distanceToSquared(cam) - b.group.position.distanceToSquared(cam));
    act.forEach((a, i) => { a.full = i < live.standins; a.group.visible = a.full; });
  }
}

function step(dt) {
  live.time += dt;
  const t = live.time;
  let s = 0;
  if (live.standins && Math.floor(t * 4) !== Math.floor((t - dt) * 4)) assignStandins();
  for (let f = 0; f < live.v; f++) {
    const F = fields[f];
    for (const m of F.standin.values()) m.count = 0;
    for (const a of F.actors) {
      if (!a.active) continue;
      const p = a.group.position;
      if (a.attackUntil > t) { /* standing to swing */ }
      else {
        if (a.attackUntil) { a.attackUntil = 0; a.setAnim('walk'); }
        p.z += a.speed * dt;
        if (p.z > BAND.z1) p.z = BAND.z0;
        if (t > a.nextAttack) { a.attackUntil = t + 0.9; a.nextAttack = t + 3 + (a.speed * 7.3 % 4); a.setAnim('attack', 0.1, true); }
      }
      if (a.full) a.update(dt, t);
      else {
        const m = F.standin.get(a.lookId);
        tmpS.setScalar(a.baseScale * Math.max(0.6, a.height / 1.25)); tmpM.compose(p, tmpQ, tmpS); m.setMatrixAt(m.count++, tmpM);
      }
      const r = Math.max(0.5, a.height * 0.38) * a.baseScale;
      tmpS.set(r * 1.6, 1, r * 1.6); tmpP.set(p.x, 0.03, p.z); tmpM.compose(tmpP, tmpQ, tmpS); shadow.setMatrixAt(s++, tmpM);
    }
    for (const m of F.standin.values()) if (m.count) m.instanceMatrix.needsUpdate = true;
    const h = F.hero; h.update(dt, t);
    tmpS.set(1.3, 1, 1.3); tmpM.compose(h.group.position, tmpQ, tmpS); shadow.setMatrixAt(s++, tmpM);
    // casts: N/12 a second per field, from a random active body to the hero
    live.castAcc[f] += dt * live.n / 12;
    while (live.castAcc[f] >= 1) {
      live.castAcc[f] -= 1;
      const act = F.actors.filter(a => a.active); const a = act[Math.floor(Math.random() * act.length)];
      if (!a) break;
      const el = ELEMENTS[Math.floor(Math.random() * ELEMENTS.length)];
      const from = a.group.position.clone().setY(a.height * a.baseScale * 0.6), to = h.group.position.clone().setY(1.4 * unitScale);
      fx.projectile({ from, to, element: el, ms: 520 }).then(() => { fx.impact({ at: to, element: el, height: 1.6 * unitScale }); if (t > h.nextHit) { h.setAnim('hit', 0.08, true); h.nextHit = t + 1.2; } });
    }
    if (Math.floor(t / 1.6) !== Math.floor((t - dt) / 1.6)) h.setAnim(Math.random() < 0.5 ? 'attack' : 'cast', 0.1, true);
  }
  shadow.count = s; shadow.instanceMatrix.needsUpdate = true;
  fx.update(dt);
}

let last = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const raw = last ? now - last : 16.7; last = now;
  if (!ready) return;
  const dt = 1 / 60;                                   // fixed steps: every case does the same work
  const t0 = performance.now(); step(dt);
  const t1 = performance.now();
  R.renderer.info.reset(); R.render();
  const t2 = performance.now();
  const info = R.renderer.info.render;
  const sample = { ms: raw, calls: info.calls, triangles: info.triangles, anim: t1 - t0, render: t2 - t1 };
  for (const sink of sampleSinks) sink(sample);
  liveReadout(sample);
}
const recent = [];
function liveReadout(s) {
  recent.push(s); if (recent.length > 60) recent.shift();
  if (recent.length % 15) return;
  const avg = recent.reduce((a, b) => a + b.ms, 0) / recent.length;
  $('live').textContent = `${live.n} per viewport x ${live.v}${live.standins ? ` / stand-ins past ${live.standins}` : ''}\n${(1000 / avg).toFixed(0)} fps   ${s.calls} draws   ${(s.triangles / 1000).toFixed(0)}k tris`;
}

function collect(count) {
  return new Promise((resolve, reject) => {
    const out = [], timer = setTimeout(() => { sampleSinks.delete(sink); reject(new Error('Bench timed out: keep the tab visible.')); }, 240000);
    function sink(s) { out.push(s); if (out.length >= count) { clearTimeout(timer); sampleSinks.delete(sink); resolve(out); } }
    sampleSinks.add(sink);
  });
}
const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const mean = arr => arr.reduce((a, b) => a + b, 0) / Math.max(1, arr.length);

async function measure(c, { frames, warmup }) {
  applyCase(c);
  R.renderer.compile(scene, cams[0].camera);
  await collect(warmup);
  const s = await collect(frames);
  const frameMs = mean(s.map(x => x.ms));
  return { label: c.label || caseLabel(c), n: c.n, viewports: c.v, standins: c.standins || 0, bodies: c.n * c.v + c.v,
    fps: +(1000 / frameMs).toFixed(1), frameMs: +frameMs.toFixed(2), p95: +pct(s.map(x => x.ms), 0.95).toFixed(2),
    calls: Math.round(mean(s.map(x => x.calls))), triangles: Math.round(mean(s.map(x => x.triangles))),
    animMs: +mean(s.map(x => x.anim)).toFixed(2), renderMs: +mean(s.map(x => x.render)).toFixed(2), frames, warmup };
}
const caseLabel = c => `${c.n} x ${c.v} vp${c.standins ? ` · stand-ins past ${c.standins}` : ''}`;
const DEFAULT_CASES = [
  ...[20, 40, 60, 80].map(n => ({ n, v: 1 })),
  ...[20, 40, 60, 80].map(n => ({ n, v: 2 })),
  { n: 80, v: 2, standins: 25 },
];

// ---------------------------------------------------------------- results + decision
let results = [];
function verdict(rows = results) {
  const two = rows.filter(r => r.viewports === 2 && !r.standins).sort((a, b) => a.n - b.n);
  if (!two.length) return null;
  let N = 0; for (const r of two) if (r.fps >= 55) N = r.n;
  const rule = N >= 40 ? 'no impostors: every unit is a full actor' : N >= 25 ? `units past the nearest ${N} per viewport switch to stand-ins` : `stand-ins past the nearest ${N}, and the per-field cap drops to ${2 * N}`;
  const callsAt40 = two.find(r => r.n === 40)?.calls;
  return { N, rule, callsAt40x2: callsAt40 ?? null, note: N === 80 ? 'N is at least 80 (the largest case measured)' : '' };
}
function renderTable() {
  const tb = $('table').querySelector('tbody');
  tb.replaceChildren(...results.map(r => {
    const tr = document.createElement('tr');
    const fpsCls = r.fps >= 55 ? 'good' : r.fps >= 30 ? 'warn' : 'bad';
    const callCls = r.calls <= (r.viewports * 300) ? 'good' : 'bad';
    for (const [v, cls] of [[r.label], [r.bodies], [r.fps, fpsCls], [r.frameMs], [r.p95], [r.calls, callCls], [r.triangles.toLocaleString(), r.triangles <= r.viewports * 600000 ? 'good' : 'bad'], [r.animMs], [r.renderMs]]) {
      const td = document.createElement('td'); td.textContent = v; if (cls) td.className = cls; tr.append(td);
    }
    return tr;
  }));
  const v = verdict();
  $('verdict').textContent = v ? `Decision rule (PLAN §15.2): N = ${v.N} — ${v.rule}. ${v.note} Budget check: draw calls <= 300 per viewport, triangles <= 600k per viewport (green = inside).` : '';
}

async function run({ frames = +$('frames').value, warmup = 60, cases = DEFAULT_CASES } = {}) {
  if (running) return results;
  running = true; busy(true); results = []; renderTable();
  try {
    for (const c of cases) {
      $('state').textContent = `Measuring ${caseLabel(c)}`;
      results.push(await measure(c, { frames, warmup })); renderTable();
    }
    $('state').textContent = `Done: ${results.length} cases`;
  } finally { running = false; busy(false); }
  return results;
}

let ready = false, running = false;
function busy(on) { for (const id of ['run', 'apply', 'copy', 'us', 'pr']) $(id).disabled = on; }

async function rebuildAll() {
  ready = false; busy(true);
  for (const F of fields) if (F) { for (const a of [...F.actors, F.hero]) { scene.remove(a.group); a.dispose(); } for (const m of F.standin.values()) { scene.remove(m); m.material.dispose(); } }
  fields.length = 0;
  await buildField(0); await buildField(1);
  ready = true; busy(false);
}

$('run').onclick = () => run().catch(e => { $('state').textContent = e.message; });
$('apply').onclick = () => applyCase({ n: +$('n').value, v: +$('v').value, standins: +$('si').value });
$('copy').onclick = async () => { const text = JSON.stringify({ date: new Date().toISOString(), gpu: gpuName(), results, verdict: verdict() }, null, 2); try { await navigator.clipboard.writeText(text); $('state').textContent = 'Copied'; } catch { console.log(text); $('state').textContent = 'Copy blocked: results are in the console'; } };
$('us').onchange = async () => { unitScale = +$('us').value; await rebuildAll(); applyCase(live); };
$('pr').onchange = () => { R.renderer.setPixelRatio(pixelRatio()); R.resize(); };
function gpuName() { const gl = R.renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'); return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); }

await rebuildAll();
// the live portrait draws in the bench too (it is part of a real frame's cost): click it to cycle
const portrait = createPortrait({ gfx: R, slot: $('portrait'), looks });
const portraitRefs = [...looks.heroIds().map(id => 'hero:' + id), ...looks.unitIds().map(id => 'unit:' + id)];
let portraitAt = 0;
const showPortrait = async i => { portraitAt = (i + portraitRefs.length) % portraitRefs.length; const ref = portraitRefs[portraitAt]; await portrait.show(ref); $('portrait').dataset.name = looks.forRef(ref).name || ref.split(':')[1].replace(/^./, c => c.toUpperCase()); };
$('portrait').onclick = () => showPortrait(portraitAt + 1);
await showPortrait(0);
setInterval(() => portrait.react(Math.random() < 0.7 ? 'hit' : 'talk'), 2500);
const pre = (params.get('case') || '40x2').match(/^(\d+)x(\d)(?:s(\d+))?$/);
applyCase(pre ? { n: Math.min(POOL, +pre[1]), v: Math.min(2, +pre[2]), standins: +(pre[3] || 0) } : { n: 40, v: 2 });
$('state').textContent = `Ready · ${gpuName()}`;
requestAnimationFrame(frame);
window.bench = { cams, portrait, showPortrait, run, results: () => results, verdict, applyCase, get ready() { return ready; }, gpu: gpuName, cases: DEFAULT_CASES, scene, renderer: R };
if (params.get('auto') === '1') run();
