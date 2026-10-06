// The Set-piece Kit gallery: every propkit model laid out by group, a row of every crop, a fence line of
// every kind, spinning wheels and sails, flickering fires. Same part lists a game instances.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { propModel, cropField, fenceLine, PROP_MODEL_IDS, PROP_MODEL_INFO, PROP_GROUPS, CROP_IDS, FENCE_LINE_KINDS } from './propkit.js';
import { placeModel, instanceParts, partMatrix } from './propkit-three.js';

const view = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.shadowMap.enabled = true;
view.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
const hemi = new THREE.HemisphereLight('#cfe2ff', '#4a4030', 1.1); scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff2dc', 2.2); sun.position.set(40, 80, 30); sun.castShadow = true;
sun.shadow.mapSize.setScalar(new URLSearchParams(location.search).get('lite') ? 512 : 2048); Object.assign(sun.shadow.camera, { left: -120, right: 120, top: 120, bottom: -120, far: 300 }); scene.add(sun); scene.add(sun.target);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), new THREE.MeshLambertMaterial({ color: '#5d7440' }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const mat = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 });

const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,0.5)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
function label(text, x, y, z, size = 1) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96; const g = c.getContext('2d');
  g.fillStyle = 'rgba(10,14,22,0.72)'; g.fillRect(0, 10, 512, 76); g.fillStyle = '#e8eef8'; g.font = '600 40px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 48);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
  s.position.set(x, y, z); s.scale.set(4.8 * size, 0.9 * size, 1); s.renderOrder = 5; return s;
}

let world = null, spinners = [], flames = [], areas = {};
function build(seed) {
  if (world) { scene.remove(world); world.traverse(o => { if (o.isInstancedMesh) o.dispose(); if (o.isSprite) { o.material.map?.dispose?.(); o.material.dispose(); } }); }
  world = new THREE.Group(); scene.add(world); spinners = []; flames = []; areas = {};
  const placed = [];
  let z = 0, total = 0;
  for (const group of PROP_GROUPS) {
    const ids = PROP_MODEL_IDS.filter(id => PROP_MODEL_INFO[id].group === group);
    const models = ids.map(id => propModel(id, { seed }));
    const rowR = Math.max(...models.map(m => m.radius));
    let x = 0;
    const z0 = z + rowR + 2; const items = [];
    world.add(label(group.toUpperCase(), -8, 2.5, z0, 1.4));
    for (const m of models) {
      const r = Math.max(2.2, m.radius);
      x += r; items.push({ id: m.id, x, r, top: maxTop(m) });
      placed.push(...placeModel(THREE, m.parts, x, 0, z0, 0));
      total += m.parts.length;
      for (const s of m.spin) {
        const pivot = new THREE.Group(); pivot.position.set(x + s.x, s.y, z0 + s.z); world.add(pivot);
        for (const im of instanceParts(THREE, s.parts, mat)) pivot.add(im);
        spinners.push({ pivot, axis: s.axis, speed: s.speed }); total += s.parts.length;
      }
      for (const f of m.fires) addFlame(x + f.x, f.y, z0 + f.z, f.s, '#ff9a3a');
      for (const g of m.glows) addFlame(x + g.x, g.y, z0 + g.z, 0.5, g.color, true);
      world.add(label(PROP_MODEL_INFO[m.id].label, x, Math.max(2.6, maxTop(m) + 0.8), z0, 0.6));
      x += r + 1.5;
    }
    areas[group] = { x: x / 2, z: z0, w: x, r: rowR, items };
    z = z0 + rowR + 4;
  }
  // every crop
  let x = 0; const zc = z + 8;
  world.add(label('CROPS', -8, 2.5, zc, 1.4));
  for (const crop of [...CROP_IDS, 'mystery']) {
    const parts = cropField({ w: 8, d: 12, crop, seed });
    placed.push(...placeModel(THREE, parts, x + 4, 0, zc, 0)); total += parts.length;
    world.add(label(crop, x + 4, crop === 'hops' ? 5.4 : 3.0, zc + 6.5, 0.6));
    x += 10;
  }
  areas.crops = { x: x / 2, z: zc, w: x, r: 8 };
  // every fence kind
  const zf = zc + 20; x = 0;
  world.add(label('FENCE LINES', -8, 2.5, zf, 1.4));
  for (const kind of FENCE_LINE_KINDS) {
    const parts = fenceLine([[0, 0], [10, 0], [12, 6], [4, 9]], { kind, seed });
    placed.push(...placeModel(THREE, parts, x, 0, zf - 4, 0)); total += parts.length;
    world.add(label(kind, x + 6, 2.6, zf - 5, 0.6));
    x += 18;
  }
  areas.fences = { x: x / 2, z: zf, w: x, r: 8 };
  const meshes = instanceParts(THREE, placed, mat);
  for (const m of meshes) world.add(m);
  document.getElementById('stats').textContent = `${PROP_MODEL_IDS.length} models · ${CROP_IDS.length} crops · ${total} parts · ${meshes.length + spinners.length} instanced draws for the props`;
}
function maxTop(m) { let t = 0; for (const p of m.parts) t = Math.max(t, p.y + p.h); return t; }
function addFlame(x, y, z, s, color, glow = false) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  sp.position.set(x, y + 0.3 * s, z); sp.scale.set(1.2 * s, (glow ? 1.2 : 1.8) * s, 1); sp.userData = { s, glow, phase: Math.random() * 9 }; world.add(sp); flames.push(sp);
}

const sel = document.getElementById('group');
for (const g of [...PROP_GROUPS, 'crops', 'fences']) { const o = document.createElement('option'); o.value = g; o.textContent = g; sel.appendChild(o); }
function focus(g) {
  if (g === 'all' || !areas[g]) { const zs = Object.values(areas).map(a => a.z); const mid = (Math.min(...zs) + Math.max(...zs)) / 2; camera.position.set(70, 120, mid + 120); controls.target.set(60, 0, mid); }
  else { const a = areas[g]; const span = Math.min(a.w, 90); camera.position.set(a.x, Math.max(14, span * 0.35), a.z + Math.max(18, span * 0.55)); controls.target.set(a.x, 1.5, a.z); }
  controls.update();
}
sel.onchange = () => focus(sel.value);
document.getElementById('seed').onchange = e => { build(+e.target.value || 1); focus(sel.value); };
const night = document.getElementById('night');
night.onchange = () => { const n = night.checked; hemi.intensity = n ? 0.25 : 1.1; sun.intensity = n ? 0.15 : 2.2; scene.background = new THREE.Color(n ? '#0d1424' : '#9cc0e0'); };
scene.background = new THREE.Color('#9cc0e0');

function resize() { const w = view.clientWidth, h = view.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize);
const q = new URLSearchParams(location.search);
build(+q.get('seed') || 1);
resize();
if (q.get('group')) sel.value = q.get('group');
if (q.get('night')) { night.checked = true; night.onchange(); }
focus(sel.value);
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(0.05, clock.getDelta()), t = clock.elapsedTime;
  for (const s of spinners) s.pivot.rotation[s.axis] += s.speed * dt;
  for (const f of flames) { const k = f.userData.glow ? 1 : 0.85 + Math.sin(t * 13 + f.userData.phase) * 0.1 + Math.sin(t * 29 + f.userData.phase) * 0.06; f.material.opacity = k; }
  controls.update();
  renderer.render(scene, camera);
});
/** Frame models i0..i0+n-1 of a group (closeups). */
function look(group, i0 = 0, n = 4) {
  const a = areas[group]; if (!a?.items) return;
  const it = a.items.slice(i0, i0 + n); if (!it.length) return;
  const x0 = it[0].x - it[0].r, x1 = it.at(-1).x + it.at(-1).r, cx = (x0 + x1) / 2, span = x1 - x0, top = Math.max(...it.map(i => i.top));
  controls.target.set(cx, top * 0.35, a.z); camera.position.set(cx, top * 0.6 + span * 0.35, a.z + span * 0.85 + 2); controls.update();
}
window.propkit = { look, focus, build, camera, controls, areas: () => areas };
