// Stream W dev page (tools/vharl-props.html): the island's props in rows, as js/client/decor.js draws them (one
// InstancedMesh per id, the shared vertex-coloured prop material).
import * as THREE from 'three';
import { VHARL_PROP_IDS, buildVharlProp, VHARL_FIRE } from '../js/client/vharl-props.js';

const q = new URLSearchParams(location.search);
const ids = q.get('only') ? q.get('only').split(',') : VHARL_PROP_IDS;
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight); renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene(); scene.background = new THREE.Color('#b9a68c'); scene.fog = new THREE.Fog('#b9a68c', 60, 160);
scene.add(new THREE.HemisphereLight('#e8dcc8', '#4a4038', 1.4));
const sun = new THREE.DirectionalLight('#ffe2b8', 2.4); sun.position.set(-30, 50, 40); scene.add(sun);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: '#2a2627', roughness: 1 })); floor.rotation.x = -Math.PI / 2; scene.add(floor);
const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
const cols = q.get('only') ? ids.length : Math.ceil(Math.sqrt(ids.length * 1.6)), gap = +(q.get('gap') || 8.5);
const where = [];
ids.forEach((id, i) => {
  const g = buildVharlProp(id); if (!g) return;
  const x = (i % cols - (cols - 1) / 2) * gap, z = Math.floor(i / cols) * gap;
  const m = new THREE.InstancedMesh(g, mat, 1); m.setMatrixAt(0, new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.5), new THREE.Vector3(1, 1, 1))); scene.add(m);
  if (VHARL_FIRE.has(id)) { const l = new THREE.PointLight('#ffae5c', 15, 8); l.position.set(x, 1, z + 1); scene.add(l); }
  where.push({ id, p: new THREE.Vector3(x, -0.2, z + 2.6) });
});
const rows = Math.ceil(ids.length / cols);
const num = (k, d) => (q.get(k) || d).split(',').map(Number);
const span = cols * gap;
const [cx, cy, cz] = num('cam', q.get('only') ? `0,${span * 0.16},${span * 0.4}` : `0,${rows * 4 + 6},${rows * gap + 14}`), [ax, ay, az] = num('at', q.get('only') ? '0,0.8,0' : `0,0,${rows * gap * 0.42}`);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.3, 500); camera.position.set(cx, cy, cz); camera.lookAt(ax, ay, az);
renderer.render(scene, camera);
for (const w of where) { const v = w.p.clone().project(camera); if (v.z > 1) continue; const d = document.createElement('div'); d.className = 'lbl'; d.textContent = w.id.slice(3); d.style.left = ((v.x + 1) / 2 * innerWidth) + 'px'; d.style.top = ((1 - v.y) / 2 * innerHeight) + 'px'; document.body.appendChild(d); }
window.ready = true;
