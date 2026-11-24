// The scenery kit gallery: every kit-props.js model in rows, drawn by kit-draw.js exactly as the game draws it.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { kitModel, KIT_IDS } from '../js/client/render/kit-props.js';
import { createKitDraw } from '../js/client/render/kit-draw.js';

const q = new URLSearchParams(location.search);
const art = await fetch('../data/art.json').then(r => r.json());
const rows = art.scenery.filter(a => a.status === 'kit' && KIT_IDS.includes(a.id))
  .filter(a => !q.get('group') || a.kind === q.get('group'))
  .filter(a => !q.get('ids') || q.get('ids').split(',').includes(a.id));
const seed = Number(q.get('seed') || 1);

const canvas = document.getElementById('kg-view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.shadowMap.enabled = true;
const scene = new THREE.Scene(); scene.background = new THREE.Color('#bcd0e0');
scene.add(new THREE.HemisphereLight('#dfe9f2', '#6a6250', 1.4));
const sun = new THREE.DirectionalLight('#fff4e0', 2.2); sun.position.set(-30, 50, -40); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -80, right: 80, top: 80, bottom: -80, far: 200 }); scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: '#7f9e5a' })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

const root = new THREE.Group(); scene.add(root);
const kit = createKitDraw({ root, tileGroup: () => root, tileKey: () => '0,0' });
// rows of up to 8, spaced by the widest piece in the row; fronts face -Z (toward the camera)
const perRow = Number(q.get('per') || 8), labels = [];
let z = 0;
for (let r = 0; r < rows.length; r += perRow) {
  const row = rows.slice(r, r + perRow).map(a => ({ a, m: kitModel(a.id, { seed, size: a.size }) }));
  const gap = Math.max(3, ...row.map(x => x.m.bounds[3] - x.m.bounds[0])) + 1.5;
  const depth = Math.max(3, ...row.map(x => x.m.bounds[5] - x.m.bounds[2])) + 3;
  row.forEach((x, i) => { const px = (i - (row.length - 1) / 2) * gap; kit.place(x.m, px, 0, z, 0); labels.push({ id: x.a.id, at: new THREE.Vector3(px, -0.1, z + x.m.bounds[2] - 0.4) }); });
  z += depth;
}
kit.build();
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 600);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 1.5, Math.min(z / 2, 10)); camera.position.set(0, 9, -16); controls.update();
const box = document.getElementById('kg-labels');
const els = labels.map(l => { const d = document.createElement('div'); d.className = 'kg-label'; d.textContent = l.id; box.appendChild(d); return d; });
document.getElementById('kg-info').dataset.count = String(rows.length);
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
let t = 0, last = performance.now();
renderer.setAnimationLoop(now => {
  const dt = Math.min(0.1, (now - last) / 1000); last = now; t += dt;
  kit.update(dt, t); controls.update(); renderer.render(scene, camera);
  labels.forEach((l, i) => { const p = l.at.clone().project(camera); const on = p.z < 1 && Math.abs(p.x) < 1.1 && Math.abs(p.y) < 1.1; els[i].style.display = on ? '' : 'none'; if (on) { els[i].style.left = `${(p.x + 1) / 2 * innerWidth}px`; els[i].style.top = `${(1 - p.y) / 2 * innerHeight}px`; } });
});
let widest = 0; { const xs = labels.map(l => Math.abs(l.at.x)); widest = Math.max(4, ...xs) * 2 + 6; }
/** Back off far enough to see every piece in the group. */
function frame() { const d = Math.max(widest * 0.62, z * 0.9, 12); camera.position.set(0, d * 0.42, -d * 0.62); controls.target.set(0, 1.2, z * 0.38); controls.update(); }
frame();
window.gallery = { camera, controls, frame, rows: rows.map(r => r.id), ready: true };
