// Chibi 3 prototype page: builder, animation, Chibi 2 vs 3 comparison, crowd benchmark, scorecard.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createChibi3Character, normalizeForChibi3, registerBaked, chibi3CacheStats } from './chibi3/index.js';
import { createStage } from './chibi3/stage.js';
import { CHIBI3_CLIP_GROUPS, EXPRESSIONS } from './chibi3/animator.js';
import { CHIBI3_RACES, C3_DIALS } from './chibi3/races.js';
import { CHIBI3_PARTS } from './chibi3/outfit.js';
import { createChibi2Character, CHIBI2_ANIMS } from './chibi2.js';
import { loadClassOutfits, dressAs } from './class-outfits.js';
import { installTooltips } from '../../shared/tooltip.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const data = await (await fetch('./data/chibi3-presets.json')).json();
const outfits = await loadClassOutfits();
const VIEWS = ['character', 'compare', 'trio', 'crowd'];
const state = {
  view: VIEWS.includes(params.get('view')) ? params.get('view') : 'character',
  preset: Math.max(0, data.presets.findIndex(p => p.id === params.get('preset'))),
  light: params.get('light') || 'studio', lod: params.get('lod') || 'auto', crowd: +(params.get('count') || 30), crowdEngine: params.get('engine') === 'chibi2' ? 'chibi2' : 'chibi3',
  paused: false, turntable: false, lookCamera: true, speed: 0, clip: 'idle', expression: 'neutral', exprWeight: 1, handsFree: false,
};
let avatar = structuredClone(data.presets[state.preset].avatar);
let actors = [], generation = 0, building = false, benchmarkActive = false, results = [];
const frameTimes = [], cpuTimes = [];
let lastBuild = { ms: null, source: '' };

// ------------------------------------------------------------------ scene
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
$('stage').append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 80);
const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.maxDistance = 40; controls.minDistance = 0.35;
const stage = createStage(renderer, scene, { preset: state.light, floorRadius: 14, shadowSize: 4 });
function resize() { const w = $('stage').clientWidth, h = $('stage').clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
new ResizeObserver(resize).observe($('stage')); resize();

// The three presets are baked (tools/bake-chibi3.mjs) so the page opens without building them live.
const bakedReady = Promise.all(data.presets.map(p => registerBaked(p.avatar, [0, 1, 2].map(l => `./data/chibi3-baked/${p.id}.lod${l}.c3b.gz`)).catch(() => null)));

// ------------------------------------------------------------------ actors
function lodOption() { return state.lod === 'auto' ? 'auto' : +state.lod; }
async function makeActor(engine, look, opts = {}) {
  const t0 = performance.now();
  const ctrl = engine === 'chibi2' ? await createChibi2Character(look) : await createChibi3Character(look, { lod: opts.lod ?? lodOption() });
  return { ctrl, engine, ms: performance.now() - t0 };
}
function clearActors() { for (const a of actors) { scene.remove(a.ctrl.group); a.ctrl.dispose(); } actors = []; }
function showBuilding(text) { $('building').hidden = !text; $('building-text').textContent = text || ''; }
const nextFrame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

async function rebuild() {
  const token = ++generation; building = true; syncUi();
  await bakedReady;
  const look = normalizeForChibi3(avatar);
  const cached = isKnownLook(look);
  showBuilding(cached ? '' : 'Building this look from its distance fields (a few seconds the first time; it is cached after)');
  $('state').textContent = 'Preparing';
  await nextFrame();
  clearActors(); frameTimes.length = 0; cpuTimes.length = 0;
  try {
    if (state.view === 'character') {
      const a = await makeActor('chibi3', look); if (token !== generation) return a.ctrl.dispose();
      place(a, 0, 0, 0); lastBuild = { ms: a.ms, source: a.ctrl.stats().baked ? 'baked' : a.ctrl.stats().cached ? 'cached' : 'built live' };
    } else if (state.view === 'compare') {
      const b = await makeActor('chibi2', look), c = await makeActor('chibi3', look);
      if (token !== generation) { b.ctrl.dispose(); c.ctrl.dispose(); return; }
      place(b, -0.75, 0, 0); place(c, 0.75, 0, 0); lastBuild = { ms: c.ms, source: c.ctrl.stats().baked ? 'baked' : c.ctrl.stats().cached ? 'cached' : 'built live' };
    } else if (state.view === 'trio') {
      for (const [i, p] of data.presets.entries()) {
        const a = await makeActor('chibi3', p.avatar); if (token !== generation) return a.ctrl.dispose();
        place(a, (i - 1) * 1.15, 0, i === 1 ? -0.25 : 0, (i - 1) * -0.25);
        a.ctrl.setAnim(['ready', 'channel', 'roar'][i] || 'idle');
      }
      lastBuild = { ms: actors.reduce((s, a) => s + a.ms, 0), source: 'three looks' };
    } else {
      await buildCrowd(state.crowd, state.crowdEngine, token);
    }
  } catch (e) { console.error(e); $('state').textContent = 'Error: ' + e.message; }
  finally { if (token === generation) { building = false; showBuilding(''); resetCamera(); applyAnimState(); syncUi(); $('state').textContent = 'Ready'; } }
}
const knownLooks = new Set();
function isKnownLook(look) { const k = JSON.stringify(look); const had = knownLooks.has(k) || data.presets.some(p => JSON.stringify(normalizeForChibi3(p.avatar)) === k); knownLooks.add(k); return had; }
function place(a, x, y, z, rotY = 0) { a.ctrl.group.position.set(x, y, z); a.ctrl.group.rotation.y = rotY; a.home = new THREE.Vector3(x, y, z); scene.add(a.ctrl.group); actors.push(a); }

async function buildCrowd(n, engine, token) {
  const cols = Math.ceil(Math.sqrt(n * 1.6)), gap = 1.25;
  const clips = engine === 'chibi2' ? ['idle', 'walk', 'attack', 'cast', 'run', 'wave'] : ['idle', 'walk', 'attack', 'cast', 'run', 'cheer'];
  for (let i = 0; i < n; i++) {
    const p = data.presets[i % data.presets.length];
    const a = await makeActor(engine, p.avatar);
    if (token !== generation) { a.ctrl.dispose(); return; }
    const r = Math.floor(i / cols), c = i % cols;
    place(a, (c - (cols - 1) / 2) * gap, 0, -r * gap * 1.1 + 1.5, 0);
    a.ctrl.setAnim(clips[i % clips.length]);
    a.ctrl.update(Math.random() * 2);   // spread the phases
  }
  lastBuild = { ms: actors.reduce((s, a) => s + a.ms, 0), source: n + ' characters' };
}

// ------------------------------------------------------------------ camera
function resetCamera() {
  const v = state.view;
  if (v === 'character') { camera.position.set(0.9, 1.45, 3.6); controls.target.set(0, 1.0, 0); }
  else if (v === 'compare') { camera.position.set(0.0, 1.35, 4.4); controls.target.set(0, 0.95, 0); }
  else if (v === 'trio') { camera.position.set(0.2, 1.5, 5.4); controls.target.set(0, 0.95, 0); }
  else { const rows = Math.ceil(state.crowd / Math.ceil(Math.sqrt(state.crowd * 1.6))); camera.position.set(0, 4.5 + rows * 0.4, 9 + rows * 0.6); controls.target.set(0, 0.6, -rows * 0.5); }
  controls.update();
}

// ------------------------------------------------------------------ loop
let last = performance.now(), readoutAt = 0;
const lookTarget = new THREE.Vector3();
renderer.setAnimationLoop(() => {
  const now = performance.now(), raw = now - last, dt = Math.min(0.05, raw / 1000); last = now;
  // the measured frame is the raw one: the clamped dt only keeps the animation stable
  if (!building) frameTimes.push(raw); if (frameTimes.length > 240) frameTimes.shift();
  if (!state.paused) {
    const c0 = performance.now();
    lookTarget.copy(camera.position);
    for (const a of actors) {
      if (a.engine === 'chibi3' && state.view !== 'crowd') a.ctrl.lookAt(state.lookCamera ? lookTarget : null);
      a.ctrl.update(benchmarkActive ? 1 / 60 : dt);
      if (state.turntable && state.view !== 'crowd') a.ctrl.group.rotation.y += dt * 0.5;
    }
    if (actors.length) { cpuTimes.push((performance.now() - c0) / actors.length); if (cpuTimes.length > 240) cpuTimes.shift(); }
  }
  controls.update();
  renderer.render(scene, camera);
  for (const s of sampleListeners) s(raw, renderer.info.render);
  if (now - readoutAt > 400 && frameTimes.length > 10) { readoutAt = now; readouts(); }
});
function stats() {
  const t = [...frameTimes].sort((a, b) => a - b), avg = t.reduce((a, b) => a + b, 0) / Math.max(1, t.length);
  const cpu = cpuTimes.reduce((a, b) => a + b, 0) / Math.max(1, cpuTimes.length);
  return { fps: avg ? 1000 / avg : 0, avg, p95: t[Math.floor(t.length * 0.95)] || 0, cpu, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
}
function readouts() {
  const s = stats();
  $('fps').textContent = s.fps.toFixed(0); $('p95').textContent = s.p95.toFixed(1); $('cpu').textContent = s.cpu.toFixed(3);
  $('calls').textContent = s.calls; $('triangles').textContent = s.triangles >= 1000 ? (s.triangles / 1000).toFixed(1) + 'k' : s.triangles;
  $('build').textContent = lastBuild.ms == null ? '--' : lastBuild.ms >= 1000 ? (lastBuild.ms / 1000).toFixed(1) + ' s' : Math.round(lastBuild.ms) + ' ms';
  $('build-src').textContent = lastBuild.source;
}

// ------------------------------------------------------------------ builder controls
const debounce = (f, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; };
const rebuildSoon = debounce(() => rebuild(), 500);
function el(tag, attrs = {}, ...kids) { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'text') e.textContent = v; else if (k in e && typeof v !== 'string') e[k] = v; else e.setAttribute(k, v); } e.append(...kids); return e; }
const title = s => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

function buildControls() {
  for (const [i, p] of data.presets.entries()) $('preset').add(new Option(p.name, i));
  for (const id of Object.keys(outfits).sort()) $('outfit').add(new Option(title(id), id));
  for (const name of stage.presets) $('light').add(new Option(title(name), name));
  // body: race + the shared sliders + Chibi 3 body dials
  const body = $('body-controls');
  const race = el('select', { id: 'race' }); for (const [id, r] of Object.entries(CHIBI3_RACES)) race.add(new Option(r.name, id));
  body.append(el('label', { class: 'field' }, 'Race', race));
  race.addEventListener('change', () => { avatar.body.race = race.value; const r = CHIBI3_RACES[race.value]; avatar.body.skin = r.skin[0]; rebuildSoon(); syncUi(); });
  const slider = (parent, label, get, set) => {
    const input = el('input', { type: 'range', min: 0, max: 1, step: 0.01 }), out = el('output');
    const refresh = () => { const v = get(); input.value = v; out.textContent = (+v).toFixed(2); };
    input.addEventListener('input', () => { set(+input.value); out.textContent = (+input.value).toFixed(2); rebuildSoon(); });
    parent.append(el('label', { class: 'dial' }, label, input, out)); refreshers.push(refresh);
  };
  for (const [k, label] of [['height', 'Height'], ['width', 'Build'], ['headSize', 'Head size']]) slider(body, label, () => avatar.body[k] ?? 0.5, v => { avatar.body[k] = v; });
  const c3 = () => (avatar.body.c3 ||= {});
  for (const [k, d] of Object.entries(C3_DIALS)) slider(d.group === 'Body' ? body : $('face-controls'), d.label, () => c3()[k] ?? 0.5, v => { c3()[k] = v; });
  // colours
  const colors = el('div', { class: 'colors' });
  for (const [slot, key, label] of [['body', 'skin', 'Skin'], ['hair', 'color', 'Hair'], ['eyes', 'color', 'Eyes'], ['top', 'color', 'Top'], ['top', 'color2', 'Trim'], ['bottom', 'color', 'Legs'], ['hat', 'color', 'Hat'], ['cape', 'color', 'Cape'], ['held', 'color', 'Weapon']]) {
    const input = el('input', { type: 'color' });
    input.addEventListener('input', () => { (avatar[slot] ||= {})[key] = input.value; rebuildSoon(); });
    colors.append(el('label', {}, label, input)); refreshers.push(() => { input.value = toHex(avatar[slot]?.[key] || '#888888'); });
  }
  $('color-controls').append(colors);
  // parts
  const parts = el('div', { class: 'parts' });
  const lists = {
    hair: CHIBI3_PARTS.hair.styles, facialHair: CHIBI3_PARTS.facialHair.styles, brows: ['straight', 'arched', 'angry', 'worried', 'thick', 'bushy', 'thin', 'none'],
    top: Object.values(CHIBI3_PARTS.top).map(v => v[0]), bottom: Object.values(CHIBI3_PARTS.bottom).flat(), shoes: Object.values(CHIBI3_PARTS.shoes).map(v => v[0]),
    hat: Object.values(CHIBI3_PARTS.hat).map(v => v[0]), cape: Object.values(CHIBI3_PARTS.cape).map(v => v[0]), decor: Object.values(CHIBI3_PARTS.decor).map(v => v[0]),
    held: ['none', 'longsword', 'greatsword', 'axe', 'greataxe', 'mace', 'warhammer', 'dagger', 'spear', 'halberd', 'staff_crystal', 'staff_orb', 'quarterstaff', 'wand'],
    offhand: ['none', 'heater_shield', 'kite_shield', 'round_shield', 'tower_shield', 'buckler', 'axe', 'dagger', 'orb', 'book', 'torch'],
    extras: ['none', 'war_paint'],
  };
  for (const [slot, ids] of Object.entries(lists)) {
    const sel = el('select'); for (const id of ids) sel.add(new Option(title(id), id));
    sel.addEventListener('change', () => { (avatar[slot] ||= {}).id = sel.value; rebuildSoon(); });
    parts.append(el('label', {}, title(slot === 'facialHair' ? 'beard' : slot), sel));
    refreshers.push(() => { const id = avatar[slot]?.id || 'none'; if (![...sel.options].some(o => o.value === id)) sel.add(new Option(title(id) + ' (data)', id)); sel.value = id; });
  }
  $('part-controls').append(parts);
  // animation
  const clipBox = $('clip-controls');
  for (const [group, clips] of Object.entries(CHIBI3_CLIP_GROUPS)) {
    const row = el('div', { class: 'row' });
    for (const c of clips) { const b = el('button', { text: title(c), 'data-clip': c, 'aria-pressed': 'false' }); b.addEventListener('click', () => { state.clip = c; applyAnimState(true); syncUi(); }); row.append(b); }
    clipBox.append(el('div', { class: 'clip-group' }, el('h3', { text: group }), row));
  }
  for (const name of Object.keys(EXPRESSIONS)) $('expression').add(new Option(title(name), name));
}
const refreshers = [];
function toHex(c) { return '#' + new THREE.Color(c).getHexString(); }
function applyAnimState(restart = false) {
  for (const a of actors) {
    if (state.view === 'crowd' || state.view === 'trio') continue;
    if (a.engine === 'chibi2') { const map = { slash1: 'attack', slash2: 'attack', heavyCleave: 'attack', frenzy: 'attack', thrust: 'attack', castBolt: 'cast', channel: 'cast', castAoe: 'cast', staffStrike: 'attack', block: 'guard', stagger: 'hit', cheer: 'wave', talk: 'talk', roar: 'wave' }; const n = CHIBI2_ANIMS.includes(state.clip) ? state.clip : (map[state.clip] || 'idle'); a.ctrl.setAnim(n, 0.15, restart); continue; }
    if (state.speed > 0.05) { a.ctrl.setSpeed(state.speed); } else { a.ctrl.setSpeed(0); }
    a.ctrl.play(state.clip, { restart });
    a.ctrl.setExpression(state.expression, state.exprWeight);
    a.ctrl.setHandsFree(state.handsFree);
  }
}

function syncUi() {
  for (const b of document.querySelectorAll('[data-view]')) b.setAttribute('aria-pressed', b.dataset.view === state.view);
  for (const b of document.querySelectorAll('[data-clip]')) b.setAttribute('aria-pressed', b.dataset.clip === state.clip);
  $('pair-labels').hidden = state.view !== 'compare';
  $('crowd-size-wrap').hidden = $('crowd-engine-wrap').hidden = state.view !== 'crowd';
  $('scene-label').textContent = { character: 'CHARACTER', compare: 'SAME AVATAR JSON, SAME LIGHT', trio: 'THE THREE PROTOTYPE CLASSES', crowd: 'CROWD' }[state.view];
  $('actor-label').textContent = state.view === 'crowd' ? `${state.crowd} × ${state.crowdEngine === 'chibi2' ? 'Chibi 2' : 'Chibi 3'}` : state.view === 'trio' ? 'Knight · Wizard · Orc Berserker' : data.presets[state.preset]?.name || 'Custom look';
  $('preset').value = state.preset; $('light').value = state.light; $('lod').value = state.lod;
  $('crowd-size').value = String(state.crowd); $('crowd-engine').value = state.crowdEngine;
  $('race').value = avatar.body?.race || 'human';
  for (const r of refreshers) r();
  for (const c of document.querySelectorAll('button, select, input')) if (!c.closest('.stage-actions') && !c.closest('.tabs')) c.disabled = benchmarkActive;
  $('speed-value').textContent = state.speed.toFixed(1) + ' m/s';
  $('expr-value').textContent = state.exprWeight.toFixed(2);
}

// ------------------------------------------------------------------ benchmark
const sampleListeners = new Set();
function sampleFrames(count) {
  return new Promise((resolve, reject) => {
    const values = [], timeout = setTimeout(() => { sampleListeners.delete(sample); reject(new Error('Benchmark timed out; keep this tab visible.')); }, Math.max(90000, count * 4000));
    function sample(ms, info) { values.push({ ms, calls: info.calls, triangles: info.triangles, cpu: cpuTimes[cpuTimes.length - 1] || 0 }); if (values.length >= count) { clearTimeout(timeout); sampleListeners.delete(sample); resolve(values); } }
    sampleListeners.add(sample);
  });
}
async function benchmark({ frames = 120, warmup = 45, counts = [1, 10, 30] } = {}) {
  if (benchmarkActive) return results;
  const before = { view: state.view, crowd: state.crowd, crowdEngine: state.crowdEngine };
  benchmarkActive = true; results = []; renderResults(); syncUi();
  try {
    for (const n of counts) for (const engine of ['chibi2', 'chibi3']) {
      Object.assign(state, { view: 'crowd', crowd: n, crowdEngine: engine });
      $('bench-state').textContent = `Measuring ${n} × ${engine === 'chibi2' ? 'Chibi 2' : 'Chibi 3'}`;
      await rebuild(); await sampleFrames(warmup);
      const s = await sampleFrames(frames), t = s.map(v => v.ms).sort((a, b) => a - b), avg = k => s.reduce((a, v) => a + v[k], 0) / s.length;
      results.push({ engine, count: n, frameAvg: avg('ms'), frameP95: t[Math.floor(t.length * 0.95)], cpu: avg('cpu'), calls: avg('calls'), triangles: avg('triangles') });
      renderResults();
    }
    $('bench-state').textContent = `${frames} frames per case at ${renderer.domElement.width}×${renderer.domElement.height}, Detail: ${state.lod}`;
    $('download-results').hidden = false;
    renderScorecard();
    return results;
  } finally { Object.assign(state, before); benchmarkActive = false; await rebuild(); }
}
function renderResults() {
  if (!results.length) { $('results').innerHTML = '<tr><td colspan="6" class="empty">Measuring…</td></tr>'; return; }
  $('results').replaceChildren(...results.map(r => el('tr', {}, ...[`${r.count} × ${r.engine === 'chibi2' ? 'Chibi 2' : 'Chibi 3'}`, r.frameAvg.toFixed(1) + ' ms', r.frameP95.toFixed(1) + ' ms', r.cpu.toFixed(3) + ' ms', Math.round(r.calls), Math.round(r.triangles).toLocaleString()].map(v => el('td', { text: String(v) })))));
}

// ------------------------------------------------------------------ scorecard
async function renderScorecard() {
  // per-character facts, measured from one of each
  const look = normalizeForChibi3(data.presets[0].avatar);
  const c2 = await createChibi2Character(look), c3 = await createChibi3Character(look, { lod: 'auto' });
  const s2 = c2.stats(), s3 = c3.stats();
  c2.dispose(); c3.dispose();
  const r = (n, engine) => results.find(x => x.count === n && x.engine === engine);
  const rows = [
    ['Proportions', 'Chibi (big head, ~3 heads tall)', 'Heroic (~6 heads tall), real anatomy'],
    ['How the mesh is made', 'Joined primitive pieces, rigid per bone', 'One welded skin from blended distance fields; clothes and armour fitted by offset'],
    ['Triangles, knight (hero / mid / far)', s2.triangles.toLocaleString(), s3.lodTriangles.map(t => Math.round(t).toLocaleString()).join(' / ')],
    ['Draw calls per character', s2.meshes, s3.meshes + ' (one body + eyes)'],
    ['Bones', s2.bones, s3.bones + ' (fingers, jaw, lids, spring chains)'],
    ['Skinning', 'One bone per piece', 'Up to 4 bones per vertex, blended at every joint'],
    ['Materials', 'Flat vertex colour, 2 materials', 'Physically based: skin, cloth, leather, steel, mail, hair, wood, fur detail maps; worn edges; baked occlusion'],
    ['Face', 'Eye glance', `${s3.morphs} blend shapes, blinking, lip shapes from text, ${Object.keys(EXPRESSIONS).length} expressions, eye contact`],
    ['Animation', '12 clips + extensions, played one at a time', '32 clips, speed-blended walk/run, attacks layered over legs, foot planting, two-hand grips'],
    ['Cloth and hair', 'Rigid', 'Spring chains: cape, hem, hair, beard, hat tip, plume'],
    ['Levels of detail', 'None', 'Three, switched by distance'],
    ['Time to make a new look', 'A few milliseconds', 'About 10 s live (once; then cached), instant when baked'],
    ['Avatar data', 'Shared avatar JSON', 'The same JSON; Chibi 3 dials live in avatar.body.c3'],
  ];
  for (const n of [1, 10, 30]) { const a = r(n, 'chibi2'), b = r(n, 'chibi3'); if (a && b) rows.push([`Frame time, ${n} on screen`, a.frameAvg.toFixed(1) + ' ms', b.frameAvg.toFixed(1) + ' ms']); }
  $('scorecard').replaceChildren(...rows.map(row => el('tr', {}, ...row.map(v => el('td', { text: String(v) })))));
}

// ------------------------------------------------------------------ events
for (const b of document.querySelectorAll('[data-view]')) b.addEventListener('click', () => { state.view = b.dataset.view; syncUi(); rebuild(); });
for (const b of document.querySelectorAll('[data-tab]')) b.addEventListener('click', () => { for (const t of document.querySelectorAll('[data-tab]')) t.setAttribute('aria-selected', t === b); $('tab-look').hidden = b.dataset.tab !== 'look'; $('tab-animate').hidden = b.dataset.tab !== 'animate'; });
$('preset').addEventListener('change', () => { state.preset = +$('preset').value; avatar = structuredClone(data.presets[state.preset].avatar); $('outfit').value = ''; syncUi(); rebuild(); });
$('outfit').addEventListener('change', () => { const o = outfits[$('outfit').value]; avatar = o ? dressAs(structuredClone(data.presets[state.preset].avatar), o) : structuredClone(data.presets[state.preset].avatar); state.preset = -1; syncUi(); rebuildSoon(); });
$('light').addEventListener('change', () => { state.light = $('light').value; stage.set(state.light); });
$('lod').addEventListener('change', () => { state.lod = $('lod').value; rebuild(); });
$('crowd-size').addEventListener('change', () => { state.crowd = +$('crowd-size').value; rebuild(); });
$('crowd-engine').addEventListener('change', () => { state.crowdEngine = $('crowd-engine').value; rebuild(); });
$('speed').addEventListener('input', () => { state.speed = +$('speed').value; for (const a of actors) if (a.engine === 'chibi3') a.ctrl.setSpeed(state.speed); syncUi(); });
$('expression').addEventListener('change', () => { state.expression = $('expression').value; applyAnimState(); });
$('expr-weight').addEventListener('input', () => { state.exprWeight = +$('expr-weight').value; applyAnimState(); syncUi(); });
$('say').addEventListener('click', () => { for (const a of actors) if (a.engine === 'chibi3') a.ctrl.say($('say-text').value); });
$('look-camera').addEventListener('change', () => { state.lookCamera = $('look-camera').checked; });
$('turntable').addEventListener('change', () => { state.turntable = $('turntable').checked; });
$('hands-free').addEventListener('change', () => { state.handsFree = $('hands-free').checked; applyAnimState(); });
$('pause').addEventListener('click', () => { state.paused = !state.paused; $('pause').textContent = state.paused ? '▶' : 'II'; });
$('reset-camera').addEventListener('click', resetCamera);
$('capture').addEventListener('click', () => { const a = document.createElement('a'); a.href = renderer.domElement.toDataURL('image/png'); a.download = 'chibi3-' + state.view + '.png'; a.click(); });
$('benchmark').addEventListener('click', () => benchmark().catch(e => { $('bench-state').textContent = e.message; }));
$('download-results').addEventListener('click', () => { const url = URL.createObjectURL(new Blob([JSON.stringify({ date: new Date().toISOString(), userAgent: navigator.userAgent, lod: state.lod, results }, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'chibi3-benchmark.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); });
$('random').addEventListener('click', () => {
  const r = CHIBI3_RACES[avatar.body?.race] || CHIBI3_RACES.human, pick = a => a[Math.floor(Math.random() * a.length)];
  avatar.body.skin = pick(r.skin); avatar.hair = { ...avatar.hair, id: pick(CHIBI3_PARTS.hair.styles), color: pick(r.hair) };
  avatar.body.c3 = Object.fromEntries(Object.keys(C3_DIALS).map(k => [k, +(0.25 + Math.random() * 0.5).toFixed(2)]));
  state.preset = -1; syncUi(); rebuildSoon();
});
$('export').addEventListener('click', async () => { const txt = JSON.stringify(normalizeForChibi3(avatar), null, 2); try { await navigator.clipboard.writeText(txt); $('state').textContent = 'Avatar JSON copied'; } catch { prompt('Avatar JSON', txt); } });
$('import').addEventListener('click', () => { const txt = prompt('Paste an avatar JSON (Chibi 2 looks work too)'); if (!txt) return; try { avatar = JSON.parse(txt); avatar.body ||= {}; state.preset = -1; syncUi(); rebuild(); } catch (e) { $('state').textContent = 'Not JSON: ' + e.message; } });

buildControls();
installTooltips();
syncUi();
await rebuild();
renderScorecard();
$('verdict').innerHTML = (await (await fetch('./data/chibi3-verdict.html')).text().catch(() => ''));

window.chibi3page = { state, get actors() { return actors; }, get building() { return building; }, get results() { return results; }, stats, rebuild, benchmark, cache: chibi3CacheStats, renderer,
  async configure(o) { Object.assign(state, o); if (o.preset != null) avatar = structuredClone(data.presets[o.preset].avatar); syncUi(); await rebuild(); } };
