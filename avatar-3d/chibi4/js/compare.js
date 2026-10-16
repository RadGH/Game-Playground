// Chibi 4 comparison page: Chibi 2 vs Chibi 4 (step 7, baked) vs Chibi 4 KIT (step 9, assembled at runtime), the same
// clip, measured cost, a dress-up panel on the kit characters, and a 20/50/100 crowd test.
//   ?anim=run   ?crowd=20|50|100&sys=chibi2|chibi4|kit (runs the crowd test on load; results in window.__c4perf)
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createChibi2Character } from '../../js/chibi2.js';
import { normalizeAvatar } from '../../../avatar-2d/js/render.js';
import { createChibi4Character } from './chibi4.js';
import { createChibi4Kit, loadKit, chibi4KitStats } from './chibi4-kit.js';
import { CLIP_MAP, KIT_HAIRS, SLOTS, randomLook } from './chibi4-outfit.js';

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
// the same two characters as kit outfits (painted colours kept: no colour given)
const KIT_LOOKS = {
  mage: { body: { skin: '#e8b890' }, chibi4: { body: 'male', race: 'human', hair: { id: 'short' },
    garments: ['trousers', 'robe', 'mantle', 'sleeves', 'boots_low'] } },
  elf: { body: { skin: '#f0c8a0' }, chibi4: { body: 'female', race: 'elf', hair: { id: 'braid' },
    garments: ['trousers', 'undershirt', 'jerkin', 'boots_tall', 'bracers', 'pauldrons', 'tabard', 'scabbard'] } },
};
const SYS = { chibi2: 'Chibi 2', chibi4: 'Chibi 4 baked (step 7)', kit: 'Chibi 4 kit (step 9)' };

const host = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
host.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x9a9da2);
scene.add(new THREE.HemisphereLight(0xffffff, 0x556070, 1.3));
const key = new THREE.DirectionalLight(0xfff2e0, 2.4); key.position.set(-2, 4, 3); scene.add(key);
const rim = new THREE.DirectionalLight(0xcfe0ff, 1.1); rim.position.set(2, 3, -3); scene.add(rim);
const ground = new THREE.Mesh(new THREE.CircleGeometry(40, 48), new THREE.MeshStandardMaterial({ color: 0x80848a, roughness: 1 }));
ground.rotation.x = -Math.PI / 2; scene.add(ground);
const cam = new THREE.PerspectiveCamera(32, 1, 0.05, 300);
const HOME = { pos: new THREE.Vector3(-0.4, 1.5, 8.6), target: new THREE.Vector3(-0.4, 0.95, 0) };
cam.position.copy(HOME.pos);
const controls = new OrbitControls(cam, renderer.domElement); controls.target.copy(HOME.target); controls.update();
function resize() { const w = host.clientWidth, h = host.clientHeight; renderer.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
window.__c4 = { scene, cam, controls, renderer };

const show = { chibi2: [], chibi4: [], kit: [] };
const stat = { chibi2: {}, chibi4: {}, kit: {} };
const X = { chibi2: -3.6, chibi4: -1.3, kit: 1.0 };
for (const [i, who] of ['mage', 'elf'].entries()) {
  let t = performance.now();
  const a2 = await createChibi2Character(normalizeAvatar(LOOKS[who]));
  stat.chibi2.buildMs = (stat.chibi2.buildMs || 0) + (performance.now() - t);
  t = performance.now();
  const a4 = await createChibi4Character(LOOKS[who], { model: who });
  stat.chibi4.buildMs = (stat.chibi4.buildMs || 0) + (performance.now() - t);
  t = performance.now();
  const ak = await createChibi4Kit(KIT_LOOKS[who]);
  stat.kit.buildMs = (stat.kit.buildMs || 0) + (performance.now() - t);
  for (const [s, a] of [['chibi2', a2], ['chibi4', a4], ['kit', ak]]) { a.group.position.set(X[s] + i * 0.95, 0, 0); scene.add(a.group); show[s].push(a); }
}
const labels = document.createElement('div'); labels.className = 'c4labels';
labels.innerHTML = Object.values(SYS).map(s => `<span>${s}</span>`).join(''); document.body.append(labels);

// ---- measured cost: draw one system at a time and read the renderer's counters
function measure(sys) {
  for (const s in show) for (const a of show[s]) a.group.visible = s === sys;
  ground.visible = false;
  renderer.info.autoReset = false; renderer.info.reset();
  renderer.render(scene, cam);
  const r = { calls: renderer.info.render.calls / 2, triangles: Math.round(renderer.info.render.triangles / 2) };
  renderer.info.autoReset = true;
  for (const s in show) for (const a of show[s]) a.group.visible = true;
  ground.visible = true;
  return r;
}
const m = { chibi2: measure('chibi2'), chibi4: measure('chibi4'), kit: measure('kit') };
const st = { chibi2: show.chibi2.map(a => a.stats?.() || {}), chibi4: show.chibi4.map(a => a.stats()), kit: show.kit.map(a => a.stats()) };
const kitBytes = chibi4KitStats().bytes, bakedBytes = st.chibi4.reduce((n, s) => n + s.bytes, 0);
const rows = [
  ['', 'Chibi 2', 'Chibi 4 baked', 'Chibi 4 kit'],
  ['draw calls / character (as drawn here)', m.chibi2.calls, m.chibi4.calls, m.kit.calls],
  ['triangles / character (as drawn here)', ...['chibi2', 'chibi4', 'kit'].map(s => m[s].triangles.toLocaleString())],
  ['distance versions (mage)', '—', st.chibi4[0].lodTriangles.map(n => n.toLocaleString()).join(' / '), st.kit[0].lodTriangles.map(n => n.toLocaleString()).join(' / ')],
  ['bones', st.chibi2[0].bones ?? '—', st.chibi4[0].bones, st.kit[0].bones],
  ['download', 'none (built in code)', `${(bakedBytes / 1048576).toFixed(2)} MB for both`, `${(kitBytes / 1048576).toFixed(2)} MB for both bodies' pieces in use`],
  ['first build (both characters)', ...['chibi2', 'chibi4', 'kit'].map(s => `${Math.round(stat[s].buildMs)} ms`)],
];
const tbl = document.getElementById('stats');
for (const r of rows) { const tr = document.createElement('tr'); for (const c of r) { const td = document.createElement('td'); td.textContent = c; tr.append(td); } tbl.append(tr); }
window.__c4stats = { chibi2: m.chibi2, chibi4: m.chibi4, kit: m.kit, lodTriangles: st.chibi4.map(s => s.lodTriangles), kitLod: st.kit.map(s => s.lodTriangles),
  bytes: bakedBytes, kitBytes, build: stat };

// ---- animation buttons: every Chibi 2 name the kit maps
let anim = q.get('anim') || 'walk';
function setAll(name) {
  anim = name;
  for (const s in show) for (const a of show[s]) a.setAnim(name, 0.12, true);
  for (const b of document.querySelectorAll('#anims button')) b.classList.toggle('primary', b.dataset.anim === name);
  const k = show.kit[0]; document.getElementById('clipinfo').textContent = k ? `kit plays "${k.clip}" (${CLIP_MAP[name]?.[1] === 'good' ? 'the action itself' : 'nearest clip'})` : '';
}
const animBox = document.getElementById('anims');
for (const n of ['idle', 'walk', 'run', 'cast', 'attack', 'hit', 'jump', 'wave', 'dead']) {
  const b = document.createElement('button'); b.textContent = n; b.dataset.anim = n; b.onclick = () => setAll(n); animBox.append(b);
}
const more = document.getElementById('moreanims');
for (const n of Object.keys(CLIP_MAP)) { const o = document.createElement('option'); o.value = n; o.textContent = n + (CLIP_MAP[n][1] === 'good' ? '' : ' ~'); more.append(o); }
more.onchange = () => setAll(more.value);
setAll(anim);
document.getElementById('lod').onchange = e => {
  for (const a of [...show.chibi4, ...show.kit]) { a.lod.autoUpdate = e.target.checked; if (!e.target.checked) a.lod.levels.forEach((l, i) => l.object.visible = i === 0); }
};

// ---- dress-up panel on the kit characters
const dress = document.getElementById('dress');
const dressState = { who: 0 };
const kitMeta = { male: (await loadKit('male')).meta, female: (await loadKit('female')).meta };
function el(tag, attrs = {}, kids = []) { const n = document.createElement(tag); Object.assign(n, attrs); for (const k of kids) n.append(k); return n; }
function currentLook() { return JSON.parse(JSON.stringify(dressState.look)); }
function readLook() {
  const f = dress.elements;
  const garments = [];
  for (const id of Object.keys(SLOTS)) if (f['g_' + id]?.checked) {
    const g = { id };
    if (f['c_' + id].dataset.set) g.color = f['c_' + id].value;
    if (f['c2_' + id].dataset.set) g.color2 = f['c2_' + id].value;
    garments.push(g);
  }
  return { body: { skin: f.skin.value }, chibi4: { body: f.body.value, race: f.race.value,
    hair: f.hair.value === 'none' ? null : { id: f.hair.value, color: f.hairc.dataset.set ? f.hairc.value : undefined }, garments } };
}
function fillForm(look) {
  dress.innerHTML = '';
  const c4 = look.chibi4;
  const sel = (name, opts, val) => el('select', { name }, opts.map(o => el('option', { value: o, textContent: o, selected: o === val })));
  const col = (name, val) => { const i = el('input', { type: 'color', name, value: val || '#808080' }); if (val) i.dataset.set = '1'; i.oninput = () => { i.dataset.set = '1'; apply(true); }; return i; };
  dress.append(el('div', { className: 'row' }, [el('label', { textContent: 'character ' }), sel('who', ['left (mage)', 'right (elf)'], ['left (mage)', 'right (elf)'][dressState.who])]));
  dress.append(el('div', { className: 'row' }, [el('span', { textContent: 'body ' }), sel('body', ['male', 'female'], c4.body), sel('race', ['human', 'elf'], c4.race),
    el('span', { textContent: ' skin ' }), col('skin', look.body.skin)]));
  dress.append(el('div', { className: 'row' }, [el('span', { textContent: 'hair ' }), sel('hair', [...KIT_HAIRS, 'none'], c4.hair?.id || 'none'), col('hairc', c4.hair?.color)]));
  const meta = kitMeta[c4.body];
  const t = el('table', { className: 'score dresslist' });
  for (const id of Object.keys(SLOTS)) {
    const g = c4.garments.find(x => (x.id || x) === id);
    const gm = meta.garments[id] || {};
    const cb = el('input', { type: 'checkbox', name: 'g_' + id, checked: !!g });
    t.append(el('tr', {}, [el('td', {}, [el('label', {}, [cb, ' ' + id])]), el('td', { className: 'dim small', textContent: SLOTS[id].join(', ') }),
      el('td', {}, [col('c_' + id, g?.color || (g ? undefined : undefined)), col('c2_' + id, g?.color2)])]));
    const c1 = t.lastChild.querySelector(`[name="c_${id}"]`); if (!g?.color) { c1.value = gm.refA || '#808080'; delete c1.dataset.set; }
    const c2 = t.lastChild.querySelector(`[name="c2_${id}"]`); if (!g?.color2) { c2.value = gm.refB || '#808080'; delete c2.dataset.set; }
  }
  dress.append(t);
  dress.append(el('div', { className: 'row' }, [el('button', { type: 'button', textContent: 'random outfit', onclick: () => { dressState.look = randomLook(); fillForm(dressState.look); apply(); } }),
    el('button', { type: 'button', textContent: 'reset', onclick: () => { dressState.look = JSON.parse(JSON.stringify(Object.values(KIT_LOOKS)[dressState.who])); fillForm(dressState.look); apply(); } })]));
  dress.elements.who.onchange = () => { dressState.who = dress.elements.who.selectedIndex; dressState.look = show.kit[dressState.who].group.userData.look || JSON.parse(JSON.stringify(Object.values(KIT_LOOKS)[dressState.who])); fillForm(dressState.look); };
  for (const n of ['body', 'race', 'hair']) dress.elements[n].onchange = () => apply();
  for (const id of Object.keys(SLOTS)) dress.elements['g_' + id].onchange = () => apply();
}
let busy = Promise.resolve();
function apply(colourOnly = false) {
  const look = readLook(); dressState.look = look;
  const a = show.kit[dressState.who];
  busy = busy.then(async () => {
    const t = performance.now();
    if (colourOnly && a.outfit.body === look.chibi4.body) {
      const garments = {}; for (const g of look.chibi4.garments) garments[g.id] = { color: g.color, color2: g.color2 };
      a.setColors({ skin: look.body.skin, hair: look.chibi4.hair?.color ? { color: look.chibi4.hair.color } : null, garments });
    } else await a.setAvatar(look);
    a.group.userData.look = look;
    a.setAnim(anim, 0, true);
    document.getElementById('dressinfo').textContent = `rebuilt in ${Math.round(performance.now() - t)} ms — ${a.stats().pieces} pieces, ${a.stats().triangles.toLocaleString()} triangles, 1 draw call`;
    // garments the slot rules took off are unticked
    const worn = new Set(a.outfit.garments.map(g => g.id));
    for (const id of Object.keys(SLOTS)) dress.elements['g_' + id].checked = worn.has(id);
  });
  return busy;
}
dressState.look = JSON.parse(JSON.stringify(KIT_LOOKS.mage));
fillForm(dressState.look);
window.__c4dress = { apply: async look => { dressState.look = look; fillForm(look); await apply(); return show.kit[dressState.who].stats(); }, who: i => { dressState.who = i; }, randomLook, show };

// ---- crowd test
const crowdRows = document.getElementById('crowd');
window.__c4perf = [];
let crowd = [];
async function runCrowd(n, sys) {
  for (const a of crowd) a.dispose();
  crowd = [];
  for (const s in show) for (const a of show[s]) a.group.visible = false;
  const cols = Math.ceil(Math.sqrt(n));
  const t = performance.now();
  for (let i = 0; i < n; i++) {
    const who = i % 2 ? 'elf' : 'mage';
    // ?nothrottle=1: animate every character every frame; ?nolod=1: full detail at every distance (the A/B numbers)
    const kitOpts = { throttle: !q.get('nothrottle'), lod: !q.get('nolod') };
    const a = sys === 'kit' ? await createChibi4Kit(i < 2 ? KIT_LOOKS[who] : randomLook(i * 7919), kitOpts)
      : sys === 'chibi4' ? await createChibi4Character(LOOKS[who], { model: who }) : await createChibi2Character(normalizeAvatar(LOOKS[who]));
    a.group.position.set((i % cols - cols / 2) * 1.6, 0, -Math.floor(i / cols) * 1.6);
    a.setAnim('walk'); a.update?.(Math.random());
    scene.add(a.group); crowd.push(a);
  }
  const build = performance.now() - t;
  // Thousandvale-ish camera: up and back
  cam.position.set(0, 9, 14 + cols); controls.target.set(0, 0.8, -cols * 0.8); controls.update();
  await new Promise(r => setTimeout(r, 400));
  let frames = 0, cpu = 0; const start = performance.now();
  await new Promise(res => { const tick = () => { frames++; if (performance.now() - start < 3000) requestAnimationFrame(tick); else res(); }; requestAnimationFrame(tick); });
  const fps = frames / ((performance.now() - start) / 1000);
  // CPU side alone: animation + skinning upload + draw submission, 30 frames timed with the GPU flushed
  const gl = renderer.getContext(); const px = new Uint8Array(4);
  const c0 = performance.now();
  for (let k = 0; k < 10; k++) { for (const a of crowd) a.update(1 / 60); renderer.render(scene, cam); }
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  cpu = (performance.now() - c0) / 10;
  renderer.info.autoReset = false; renderer.info.reset(); renderer.render(scene, cam); renderer.info.autoReset = true;
  if (window.__c4grab) window.__c4grabbed = renderer.domElement.toDataURL('image/png');
  const res = { sys, n, fps: Math.round(fps * 10) / 10, frameMs: Math.round(cpu * 10) / 10, buildMs: Math.round(build), calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
    outfits: sys === 'kit' ? chibi4KitStats().mergedOutfits : null };
  window.__c4perf.push(res);
  const tr = document.createElement('tr');
  tr.innerHTML = `<td>${n} × ${SYS[sys]}</td><td>${res.fps} fps</td><td>${res.frameMs} ms/frame</td><td>${res.calls} calls</td><td>${res.triangles.toLocaleString()} tris</td><td>built ${res.buildMs} ms</td>`;
  crowdRows.append(tr);
  for (const a of crowd) a.dispose();
  crowd = [];
  for (const s in show) for (const a of show[s]) a.group.visible = true;
  cam.position.copy(HOME.pos); controls.target.copy(HOME.target); controls.update();
  return res;
}
for (const b of document.querySelectorAll('[data-crowd]')) b.onclick = () => runCrowd(+b.dataset.crowd, b.dataset.sys);
window.__c4crowd = runCrowd;

const clock = new THREE.Clock();
let frame = 0;
renderer.setAnimationLoop(() => {
  const dt = Math.min(0.05, clock.getDelta());
  for (const s in show) for (const a of show[s]) a.update(dt);
  for (const a of crowd) a.update(dt);
  renderer.render(scene, cam);
  if (++frame === 20) document.body.dataset.ready = '1';
});
if (q.get('crowd')) {
  const n = +q.get('crowd');
  for (const sys of (q.get('sys') ? [q.get('sys')] : ['chibi2', 'chibi4', 'kit'])) await runCrowd(n, sys);
  document.body.dataset.crowdDone = '1';
}
