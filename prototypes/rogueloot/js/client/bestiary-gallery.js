// Bestiary gallery: every monster, rare and boss built by bestiary-kit.js, as a grid of thumbnails rendered once by ONE
// shared WebGL renderer (not 77 live canvases), with a big orbit preview and animation buttons for the art review.
import * as THREE from 'three';
import { buildMonster, animateMonster, triangleCount, materialCount, meshCount, rowKind, rareScale, BUDGET } from './bestiary-kit.js';

const $ = id => document.getElementById(id);
const data = await (await fetch('data/monsters.json')).json();
const rows = [];
for (const [id, r] of Object.entries(data.monsters)) rows.push({ ...r, id, kind: 'monster' });
for (const [id, r] of Object.entries(data.rares.list)) { const base = data.monsters[r.base]; rows.push({ ...r, id, kind: 'rare', family: base.family, role: base.role, levelRange: [r.level, r.level], size: base.size * rareScale(r), baseLook: base.look }); }
for (const [id, r] of Object.entries(data.bosses)) if (id !== '_doc') rows.push({ ...r, id, kind: 'boss', role: 'boss', levelRange: [r.level, r.level] });
const FAMILY = Object.fromEntries(Object.entries(data.families || {}).map(([k, v]) => [k, v.name || k]));
const nice = s => String(s || '').replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());

// ---------------------------------------------------------------- one shared thumbnail renderer
const CAMS = { game: { pitch: 0.84, yaw: 0.35 }, front: { pitch: 0.2, yaw: 0.25 }, top: { pitch: 1.35, yaw: 0.2 } };
function makeScene() {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#fff6dc', '#4b6a3a', 1.25));
  const sun = new THREE.DirectionalLight('#ffe2b0', 2.1); sun.position.set(-6, 12, 5); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); const sc = sun.shadow.camera; sc.left = -6; sc.right = 6; sc.top = 6; sc.bottom = -6; sc.far = 40; sun.shadow.bias = -0.0008;
  scene.add(sun);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(4, 32).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#6f8d4a' })); ground.receiveShadow = true; scene.add(ground);
  return { scene, ground };
}
function frame(camera, group, cam, aspect = 1, pad = 1.25) {
  const box = new THREE.Box3().setFromObject(group), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const r = Math.max(size.x, size.y, size.z) * 0.5 * pad;
  const dist = r / Math.sin(THREE.MathUtils.degToRad(camera.fov) / 2) / Math.min(1, aspect);
  camera.aspect = aspect; camera.position.set(c.x + Math.sin(cam.yaw) * Math.cos(cam.pitch) * dist, c.y + Math.sin(cam.pitch) * dist, c.z + Math.cos(cam.yaw) * Math.cos(cam.pitch) * dist);
  camera.lookAt(c); camera.updateProjectionMatrix();
  return { center: c, dist, r };
}
const thumbs = (() => {
  const size = 224, canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(size, size, false); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  const { scene, ground } = makeScene(); const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  const cache = new Map(), queue = []; let busy = false;
  function render(row, camKey) {
    const group = buildMonster(row, { content: data, rank: row.kind === 'rare' ? 'rare' : null });
    animateMonster(group, 'idle', 0.4, 0.016, {});
    scene.add(group); const fr = frame(camera, group, CAMS[camKey], 1, 1.2); ground.position.set(fr.center.x, 0, fr.center.z); ground.scale.setScalar(Math.max(0.6, fr.r * 1.6));
    renderer.render(scene, camera); scene.remove(group);
    return canvas.toDataURL('image/png');
  }
  function pump() {
    if (busy || !queue.length) return; busy = true;
    requestAnimationFrame(() => {
      const job = queue.shift();
      try { const url = cache.get(job.key) || render(job.row, job.cam); cache.set(job.key, url); job.img.src = url; } catch (e) { console.error('thumbnail', job.row.id, e); job.img.alt = 'failed'; }
      busy = false; pump();
    });
  }
  return { get(row, cam, img) { const key = cam + '|' + row.id; if (cache.has(key)) { img.src = cache.get(key); return; } queue.push({ row, cam, img, key }); pump(); } };
})();

// ---------------------------------------------------------------- the grid
const measured = new Map();
function stats(row) {
  if (!measured.has(row.id)) { const g = buildMonster(row, { content: data }); measured.set(row.id, { tri: triangleCount(g), mats: materialCount(g), meshes: meshCount(g), height: g.userData.height, radius: g.userData.radius, hover: g.userData.hover }); }
  return measured.get(row.id);
}
const state = { family: '', role: '', kind: '', cam: 'game', q: '' };
function fillFilters() {
  const fams = [...new Set(rows.map(r => r.family))].sort(), roles = [...new Set(rows.map(r => r.role))].sort();
  for (const f of fams) $('f-family').append(new Option(FAMILY[f] || nice(f), f));
  for (const r of roles) $('f-role').append(new Option(nice(r), r));
}
function visible() {
  const q = state.q.toLowerCase();
  return rows.filter(r => (!state.family || r.family === state.family) && (!state.role || r.role === state.role) && (!state.kind || r.kind === state.kind) && (!q || (r.name + ' ' + r.id + ' ' + r.family + ' ' + r.role).toLowerCase().includes(q)));
}
function draw() {
  const list = visible(), grid = $('grid'); grid.replaceChildren();
  $('count').textContent = `${list.length} of ${rows.length}`;
  for (const r of list) {
    const st = stats(r), card = document.createElement('button'); card.className = 'card ' + r.kind; card.dataset.id = r.id;
    const img = new Image(224, 224); img.alt = r.name; img.loading = 'lazy'; card.append(img);
    const over = st.tri > BUDGET[r.kind] || st.mats > BUDGET.materials;
    card.insertAdjacentHTML('beforeend', `<b>${r.name}</b><span class="meta"><i>${FAMILY[r.family] || nice(r.family)}</i> · ${nice(r.role)} · lv ${r.levelRange[0]}${r.levelRange[1] !== r.levelRange[0] ? '–' + r.levelRange[1] : ''}</span><span class="tri${over ? ' over' : ''}">${st.tri} tris · ${st.mats} mats · ${r.size.toFixed(1)} m</span>`);
    card.addEventListener('click', () => openBig(r));
    grid.append(card); thumbs.get(r, state.cam, img);
  }
}
fillFilters();
$('f-family').onchange = e => { state.family = e.target.value; draw(); };
$('f-role').onchange = e => { state.role = e.target.value; draw(); };
$('f-kind').onchange = e => { state.kind = e.target.value; draw(); };
$('f-cam').onchange = e => { state.cam = e.target.value; draw(); };
$('f-search').oninput = e => { state.q = e.target.value; draw(); };
draw();

// ---------------------------------------------------------------- the big orbit preview
const big = (() => {
  const canvas = $('big-view'); let renderer = null, scene, ground, camera, group = null, row = null, raf = 0;
  const view = { yaw: 0.5, pitch: 0.55, dist: 4, center: new THREE.Vector3() };
  let anim = 'idle', animAt = 0, phase = 1, rank = '', landed = false, t0 = performance.now();
  function ensure() {
    if (renderer) return;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
    ({ scene, ground } = makeScene()); camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    let drag = null;
    canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => { if (!drag) return; view.yaw -= (e.clientX - drag.x) * 0.01; view.pitch = Math.max(-0.2, Math.min(1.5, view.pitch + (e.clientY - drag.y) * 0.01)); drag = { x: e.clientX, y: e.clientY }; });
    canvas.addEventListener('pointerup', () => { drag = null; }); canvas.addEventListener('pointercancel', () => { drag = null; });
    canvas.addEventListener('wheel', e => { e.preventDefault(); view.dist = Math.max(0.8, Math.min(40, view.dist * (e.deltaY > 0 ? 1.12 : 0.9))); }, { passive: false });
  }
  function rebuild() {
    if (group) scene.remove(group);
    group = buildMonster(row, { content: data, phase, rank: rank || null }); scene.add(group);
    const st = { tri: triangleCount(group), mats: materialCount(group), meshes: meshCount(group) }, u = group.userData;
    const bb = new THREE.Box3().setFromObject(group); view.center.copy(bb.getCenter(new THREE.Vector3())); view.center.y = Math.max(view.center.y, u.height * 0.45); view.dist = Math.max(u.height, u.radius * 2, 0.8) * 2.4;
    ground.position.set(0, 0, 0); ground.scale.setScalar(Math.max(0.6, u.radius * 1.6));
    const over = st.tri > BUDGET[row.kind] || st.mats > BUDGET.materials;
    $('big-stats').innerHTML = [['Triangles', `${st.tri} / ${BUDGET[row.kind]}${st.tri > BUDGET[row.kind] ? ' — OVER' : ''}`], ['Materials', `${st.mats} / ${BUDGET.materials}${st.mats > BUDGET.materials ? ' — OVER' : ''}`], ['Meshes', st.meshes], ['Height', `${u.height.toFixed(2)} m${u.hover ? ` (hovers ${(u.hover * u.scale).toFixed(1)} m)` : ''}`], ['Footprint', `${(u.radius * 2).toFixed(2)} m`], ['Body plan', u.plan], ['Death', u.death || 'forward']].map(([k, v]) => `<dt>${k}</dt><dd${over && /OVER/.test(v) ? ' style="color:#ff6a5a"' : ''}>${v}</dd>`).join('');
  }
  function loop() {
    raf = requestAnimationFrame(loop);
    const w = canvas.clientWidth, h = canvas.clientHeight; if (canvas.width !== Math.round(w * renderer.getPixelRatio())) renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    camera.position.set(view.center.x + Math.sin(view.yaw) * Math.cos(view.pitch) * view.dist, view.center.y + Math.sin(view.pitch) * view.dist, view.center.z + Math.cos(view.yaw) * Math.cos(view.pitch) * view.dist); camera.lookAt(view.center);
    const now = performance.now(), t = (now - t0) / 1000, since = (now - animAt) / 1000;
    const o = { landed };
    let st = 'idle';
    if (anim === 'walk') st = 'walk';
    else if (anim === 'attack') { const cyc = since % 1.2; o.swing = cyc < 0.35 ? 1 - cyc / 0.35 : 0; st = 'attack'; }
    else if (anim === 'cast') { o.cast = true; st = 'cast'; }
    else if (anim === 'hit') { const cyc = since % 0.9; o.hit = cyc < 0.18 ? 1 - cyc / 0.18 : 0; }
    else if (anim === 'dead') { o.dead = true; o.deadT = Math.min(1, since / 0.6); st = 'dead'; }
    if (group) animateMonster(group, st, t, 0.016, o);
    renderer.render(scene, camera);
  }
  function open(r) {
    ensure(); row = r; phase = 1; rank = r.kind === 'rare' ? 'rare' : ''; landed = false; anim = 'idle'; animAt = performance.now();
    $('big-phase').value = '1'; $('big-rank').value = rank; $('big-landed').checked = false;
    document.querySelector('.big-anims .phase').hidden = r.kind !== 'boss'; document.querySelector('.big-anims .landed').hidden = !(r.look?.bodyPlan === 'flyer' || r.baseLook?.bodyPlan === 'flyer');
    for (const b of document.querySelectorAll('.big-anims button')) b.classList.toggle('on', b.dataset.anim === 'idle');
    const look = r.look && typeof r.look === 'object' ? r.look : r.baseLook || {};
    $('big-name').textContent = r.name + (r.title ? ', ' + r.title : '');
    $('big-meta').textContent = `${nice(r.kind)} · ${FAMILY[r.family] || nice(r.family)} · ${nice(r.role)} · level ${r.levelRange[0]}${r.levelRange[1] !== r.levelRange[0] ? '–' + r.levelRange[1] : ''} · ${r.size.toFixed(1)} m`;
    $('big-sil').textContent = (typeof r.look === 'string' ? r.look + ' — ' : '') + (look.silhouette || '');
    $('big-parts').innerHTML = (look.parts || []).map(p => `<li>${p}</li>`).join('');
    $('big-anim').innerHTML = Object.entries(look.anim || {}).map(([k, v]) => `<dt>${nice(k)}</dt><dd>${v}</dd>`).join('');
    rebuild(); $('big').hidden = false; cancelAnimationFrame(raf); loop();
  }
  function close() { $('big').hidden = true; cancelAnimationFrame(raf); if (group) { scene.remove(group); group = null; } }
  for (const b of document.querySelectorAll('.big-anims button')) b.addEventListener('click', () => { anim = b.dataset.anim; animAt = performance.now(); for (const x of document.querySelectorAll('.big-anims button')) x.classList.toggle('on', x === b); });
  $('big-phase').onchange = e => { phase = +e.target.value; rebuild(); };
  $('big-rank').onchange = e => { rank = e.target.value; rebuild(); };
  $('big-landed').onchange = e => { landed = e.target.checked; };
  $('big-close').onclick = close; $('big').addEventListener('click', e => { if (e.target === $('big')) close(); });
  addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  return { open, close };
})();
function openBig(r) { big.open(r); location.hash = r.id; }
if (location.hash.length > 1) { const r = rows.find(x => x.id === location.hash.slice(1)); if (r) big.open(r); }
window.bestiary = { rows, stats, open: id => { const r = rows.find(x => x.id === id); if (r) big.open(r); }, close: big.close };
