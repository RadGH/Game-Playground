// Thousandvale props gallery — the page: a thumbnail per catalogue row (one small shared renderer, built one at a time
// so the page stays responsive), and a big orbit view of the picked row. A row that throws shows its error on its tile
// and the page carries on. Deep link: tvprops.html#id=<key> (key = "<group>:<id>"), ?group=<group>.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ITEMS, GROUPS, GROUP_INFO } from './tvprops-catalog.js';
import { LIGHTS } from '../../prototypes/thousandvale/js/client/lightpool.js';
import { STATS as SURF_STATS } from '../../prototypes/thousandvale/js/client/surface-mat.js';

const $ = id => document.getElementById(id);
const DAY_BG = '#9cc0e0', NIGHT_BG = '#0d1424';

// ---- data the rows read (real baked records; the files stay where the game keeps them) ------------------------------
const tvData = path => fetch(new URL('../../prototypes/thousandvale/data/' + path, import.meta.url)).then(r => (r.ok ? r.json() : null)).catch(() => null);
const data = Object.fromEntries(await Promise.all([
  ['vharlProps', 'vignettes/vharlen-props.json'], ['gullwick', 'zones/z14_02/placements.json'],
  ['portVharl', 'zones/z13_10/placements.json'], ['gorsehold', 'zones/z13_04/placements.json'],
].map(async ([k, p]) => [k, await tvData(p)])));

// a camera stand-in the rows may hold on to (quest marks size themselves by the distance to it)
const camProxy = { position: new THREE.Vector3(6, 4, 6) };
const ctx = { data, camera: camProxy };

// ---- lighting rig, used by both the thumbnail scene and the viewer ---------------------------------------------------
function rig(scene, shadows) {
  const hemi = new THREE.HemisphereLight('#cfe2ff', '#4a4030', 1.1); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff2dc', 2.2); sun.position.set(30, 60, 24); scene.add(sun); scene.add(sun.target);
  if (shadows) { sun.castShadow = true; sun.shadow.mapSize.setScalar(2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02; }
  return { hemi, sun };
}
function groundFor(r) {
  const g = new THREE.Mesh(new THREE.CircleGeometry(r, 48), new THREE.MeshStandardMaterial({ color: '#5d7440', roughness: 1 }));
  g.rotation.x = -Math.PI / 2; g.position.y = -0.005; g.receiveShadow = true; return g;
}
/** The box that matters for framing: visible meshes, skipping anything marked noFrame (backdrops, flames). */
function frameBox(obj) {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3(), tmp = new THREE.Box3();
  obj.traverse(o => {
    if (o.userData?.noFrame) return;
    for (let p = o; p; p = p.parent) if (!p.visible || p.userData?.noFrame) return;
    if (o.isSprite) { tmp.setFromCenterAndSize(new THREE.Vector3().setFromMatrixPosition(o.matrixWorld), new THREE.Vector3(o.scale.x, o.scale.y, o.scale.x)); box.union(tmp); return; }
    if (!(o.isMesh || o.isLine || o.isPoints) || !o.geometry) return;
    if (o.isInstancedMesh) { o.computeBoundingBox(); if (!o.boundingBox) return; tmp.copy(o.boundingBox).applyMatrix4(o.matrixWorld); }
    else { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); tmp.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld); }
    if (!tmp.isEmpty() && [tmp.min.x, tmp.max.x, tmp.min.y, tmp.max.y].every(Number.isFinite)) box.union(tmp);
  });
  return box.isEmpty() ? new THREE.Box3(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 1, 1)) : box;
}
const DIR = new THREE.Vector3(1, 0.62, 1.35).normalize();
function frameCamera(cam, box, k = 1.15, dir = DIR) {
  // fit the eight corners of the box exactly (a bounding sphere leaves flat, wide things tiny in the middle)
  const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
  const r = Math.max(0.15, s.length() / 2);
  const tv = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)), th = tv * cam.aspect;
  const back = dir.clone().normalize(), right = new THREE.Vector3(0, 1, 0).cross(back).normalize(), up = back.clone().cross(right);
  let d = 0.3;
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    const p = new THREE.Vector3(x, y, z).sub(c);
    const along = p.dot(back);
    d = Math.max(d, along + Math.abs(p.dot(right)) * k / th, along + Math.abs(p.dot(up)) * k / tv);
  }
  cam.position.copy(c).addScaledVector(back, d);
  cam.near = Math.max(0.01, d / 200); cam.far = d * 20 + r * 4; cam.updateProjectionMatrix();
  cam.lookAt(c);
  return { c, s, r, d };
}
const fmt = v => (v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toFixed(2));
const sizeText = s => `${fmt(s.x)} x ${fmt(s.y)} x ${fmt(s.z)} m (w x h x d)`;

function build(item) {
  const t0 = performance.now();
  const r = item.build(ctx);
  if (!r || !r.object) throw new Error('builder gave no object');
  r.ms = performance.now() - t0;
  return r;
}
function dispose(r) { try { r?.dispose?.(); } catch {} }

// ---- the grid ---------------------------------------------------------------------------------------------------------
const grid = $('grid'), sel = $('group'), find = $('find');
for (const g of GROUPS) { const o = document.createElement('option'); o.value = g; o.textContent = `${g} (${ITEMS.filter(i => i.group === g).length})`; sel.appendChild(o); }
const tiles = new Map();          // key -> { el, canvas, item, size, error }
for (const g of GROUPS) {
  const h = document.createElement('h2'); h.className = 'tv-group-head'; h.dataset.group = g;
  h.textContent = g; const sp = document.createElement('span'); sp.textContent = GROUP_INFO[g] || ''; h.appendChild(sp); grid.appendChild(h);
  for (const item of ITEMS.filter(i => i.group === g)) {
    const el = document.createElement('div'); el.className = 'tv-tile'; el.dataset.key = item.key; el.dataset.group = g;
    const cv = document.createElement('canvas'); cv.width = cv.height = 200;
    const info = item.info?.(ctx) || {};
    const name = info.name || item.name;
    el.innerHTML = `<div class="id"></div><div class="sz"></div><div class="src"></div><div class="err"></div>`;
    el.prepend(cv);
    el.querySelector('.id').textContent = item.id + (name ? ` — ${name}` : '');
    el.querySelector('.src').textContent = item.source.replace('prototypes/thousandvale/', 'tv/');
    el.title = `${item.key}\n${item.source}\n${item.call || ''}`;
    el.onclick = () => pick(item.key);
    grid.appendChild(el);
    tiles.set(item.key, { el, canvas: cv, item, info });
  }
}
function filter() {
  const g = sel.value, q = find.value.trim().toLowerCase();
  for (const t of tiles.values()) {
    const show = (g === 'all' || t.item.group === g) && (!q || (t.item.key + ' ' + t.item.source + ' ' + (t.info.name || '')).toLowerCase().includes(q));
    t.el.style.display = show ? '' : 'none';
  }
  for (const h of grid.querySelectorAll('.tv-group-head')) h.style.display = (g === 'all' || h.dataset.group === g) && [...tiles.values()].some(t => t.item.group === h.dataset.group && t.el.style.display !== 'none') ? '' : 'none';
}
sel.onchange = () => { filter(); const first = [...tiles.values()].find(t => t.el.style.display !== 'none'); if (first && sel.value !== 'all') { first.el.scrollIntoView({ block: 'nearest' }); } };
find.oninput = filter;

// ---- thumbnails: one small renderer, one row at a time -------------------------------------------------------------
const thumbR = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
thumbR.setSize(200, 200, false); thumbR.setPixelRatio(1);
const thumbScene = new THREE.Scene(); rig(thumbScene, false);
const thumbCam = new THREE.PerspectiveCamera(35, 1, 0.1, 1000);
const errors = [];
let thumbsDone = 0;
async function makeThumb(t) {
  let r = null;
  try {
    r = build(t.item);
    if (r.ready) await r.ready;
    const box = frameBox(r.object);
    t.size = box.getSize(new THREE.Vector3());
    t.minY = box.min.y;
    const holder = new THREE.Group(); holder.add(r.object);
    const fr = Math.max(t.size.x, t.size.z) * 0.9 + 0.5;
    if (!r.noGround) { const gd = groundFor(fr); gd.position.x = (box.min.x + box.max.x) / 2; gd.position.z = (box.min.z + box.max.z) / 2; holder.add(gd); }
    thumbScene.background = new THREE.Color(r.dark ? '#1a1820' : DAY_BG);
    thumbScene.add(holder);
    const f = frameCamera(thumbCam, box, r.zoom || 1.15, r.dir ? new THREE.Vector3(...r.dir).normalize() : DIR);
    camProxy.position.copy(thumbCam.position);
    r.update?.(0.016, 0.5);
    thumbR.render(thumbScene, thumbCam);
    t.canvas.getContext('2d').drawImage(thumbR.domElement, 0, 0, 200, 200);
    thumbScene.remove(holder);
    t.el.querySelector('.sz').textContent = sizeText(t.size) + (r.ms > 40 ? ` · ${r.ms.toFixed(0)} ms` : '');
    const exp = t.info.expect;
    if (exp && (Math.abs(Math.max(t.size.x, t.size.z) - exp.size) > exp.size * 0.6 + 0.3 || Math.abs(t.size.y - exp.h) > exp.h * 0.6 + 0.3)) t.el.querySelector('.sz').textContent += ` · data says ${exp.size} x ${exp.h} m`;
    if (t.minY < -0.75 && !r.noGround) t.el.querySelector('.sz').textContent += ` · goes ${fmt(-t.minY)} m under the ground`;
  } catch (e) {
    t.error = String(e?.stack || e);
    t.el.classList.add('bad'); t.el.querySelector('.err').textContent = 'Error: ' + (e?.message || e);
    errors.push({ key: t.item.key, error: t.error });
    const g = t.canvas.getContext('2d'); g.fillStyle = '#331a1a'; g.fillRect(0, 0, 200, 200); g.fillStyle = '#ff8a80'; g.font = '13px system-ui'; g.fillText('builder failed', 50, 104);
  }
  dispose(r);
  thumbsDone++;
  $('stats').textContent = `${ITEMS.length} models in ${GROUPS.length} groups · thumbnails ${thumbsDone}/${ITEMS.length}${errors.length ? ` · ${errors.length} failed` : ''}`;
}
async function thumbs() {
  // the surface layers paint in idle moments: wait (up to 4 s) so the thumbnails show them
  for (let i = 0; i < 80 && SURF_STATS.painted === 'painting'; i++) await new Promise(r => setTimeout(r, 50));
  for (const t of tiles.values()) { await makeThumb(t); await new Promise(r => setTimeout(r, 0)); }
}

// ---- the viewer ---------------------------------------------------------------------------------------------------------
const view = $('view');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
view.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(DAY_BG);
const L = rig(scene, true);
LIGHTS.attach(scene, { count: 6 });                // the game's light pool: lamps, torches and fires borrow from it
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 2000);
const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true;
let cur = null, curKey = null, holder = null, night = false, clockT = 0;

function setNight(n) {
  night = n;
  L.hemi.intensity = n ? 0.22 : 1.1; L.sun.intensity = n ? 0.12 : 2.2;
  scene.background = new THREE.Color(cur?.dark && n ? cur.dark : n ? NIGHT_BG : DAY_BG);
  cur?.setNight?.(n ? 1 : 0);
}
$('night').onchange = e => setNight(e.target.checked);

function pick(key) {
  const t = tiles.get(key); if (!t) return;
  for (const x of tiles.values()) x.el.classList.toggle('on', x === t);
  if (holder) { scene.remove(holder); dispose(cur); holder = null; cur = null; }
  curKey = key;
  history.replaceState(null, '', '#id=' + encodeURIComponent(key));
  const info = $('info');
  const lines = [`<b></b>`, `<div>Source: <code class="s"></code></div>`, `<div>Call: <code class="c"></code></div>`, `<div class="n"></div>`, `<div class="z"></div>`, `<div class="err"></div>`];
  info.innerHTML = lines.join('');
  info.querySelector('b').textContent = t.item.id + (t.info.name ? ` — ${t.info.name}` : '');
  info.querySelector('.s').textContent = t.item.source;
  info.querySelector('.c').textContent = t.item.call || '';
  info.querySelector('.n').textContent = t.info.note || t.item.note || '';
  try {
    cur = build(t.item);
    holder = new THREE.Group(); holder.add(cur.object);
    const box = frameBox(cur.object), s = box.getSize(new THREE.Vector3());
    const span = Math.max(s.x, s.z);
    if (!cur.noGround) {
      const gd = groundFor(Math.max(4, span * 1.4)); gd.position.x = (box.min.x + box.max.x) / 2; gd.position.z = (box.min.z + box.max.z) / 2; holder.add(gd);
      // a one-metre grid on the ground, so size reads at a glance
      const n = Math.max(4, Math.ceil(span * 1.6 / 2) * 2), grid1 = new THREE.GridHelper(n, n, '#38482a', '#4a5d36'); grid1.position.set(Math.round(gd.position.x), 0.002, Math.round(gd.position.z)); grid1.material.transparent = true; grid1.material.opacity = 0.5; grid1.userData.noFrame = true; holder.add(grid1);
    }
    scene.add(holder);
    const f = frameCamera(camera, box, (cur.zoom || 1.15) * 0.92, cur.dir ? new THREE.Vector3(...cur.dir).normalize() : DIR);
    controls.target.copy(f.c); controls.update();
    const sh = L.sun.shadow.camera, R = Math.max(2, f.r * 1.6);
    Object.assign(sh, { left: -R, right: R, top: R, bottom: -R, near: 0.5, far: 400 }); sh.updateProjectionMatrix();
    L.sun.position.copy(f.c).add(new THREE.Vector3(0.5, 1, 0.4).normalize().multiplyScalar(Math.max(30, f.r * 3))); L.sun.target.position.copy(f.c);
    info.querySelector('.z').textContent = `Measured: ${sizeText(s)} · built in ${cur.ms.toFixed(0)} ms` + (t.info.expect ? ` · the data file says about ${t.info.expect.size} m across, ${t.info.expect.h} m high` : '');
    setNight(night);
  } catch (e) {
    info.querySelector('.err').textContent = 'Error: ' + (e?.stack || e);
    cur = null;
  }
}

function resize() { const w = view.clientWidth, h = view.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); new ResizeObserver(resize).observe(view);
resize();
let last = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now; clockT += dt;
  controls.update();
  camProxy.position.copy(camera.position);
  try { cur?.update?.(dt, clockT); } catch {}
  LIGHTS.update(dt, camera.position);
  renderer.render(scene, camera);
});

// ---- start --------------------------------------------------------------------------------------------------------------
const q = new URLSearchParams(location.search);
if (q.get('group') && GROUPS.includes(q.get('group'))) sel.value = q.get('group');
filter();
const hashKey = decodeURIComponent((location.hash.match(/id=([^&]+)/) || [])[1] || '');
pick(tiles.has(hashKey) ? hashKey : (sel.value !== 'all' ? ITEMS.find(i => i.group === sel.value) : ITEMS[0]).key);
const ready = thumbs();
$('stats').textContent = `${ITEMS.length} models in ${GROUPS.length} groups`;

window.tvprops = {
  pick, ready, errors, items: ITEMS, groups: GROUPS, camera, controls,
  current: () => curKey,
  tile: key => { const t = tiles.get(key); return t && { size: t.size && t.size.toArray(), minY: t.minY, error: t.error || null }; },
  setGroup: g => { sel.value = g; filter(); },
  setNight,
};
