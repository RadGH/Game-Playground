// Every Oathwild tree species side by side at its game height (js/world/scatter.js TREE_SPECIES), drawn the way the
// game draws it (trees.js materials: storybook trunks + fluffy leaf tufts), with a 1.8 m person for scale.
// Drag to turn, wheel to zoom. ?lod=0|1|2 picks the detail level (High / Medium / Low graphics). Tests read
// window.treeGallery.ready.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createTrees } from '../js/client/render/trees.js';
import { TREE_SPECIES } from '../js/world/scatter.js';

const lodSel = document.getElementById('lod');
const q = new URLSearchParams(location.search);
if (q.has('lod')) lodSel.value = q.get('lod');
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#9cc4e8'); scene.fog = new THREE.Fog('#b8d4ea', 160, 420);
const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 900);
const controls = new OrbitControls(camera, canvas);
scene.add(new THREE.HemisphereLight('#dfeeff', '#4a5a30', 1.4));
const sun = new THREE.DirectionalLight('#fff0d0', 2.6); sun.position.set(60, 90, 40); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -140, right: 140, top: 80, bottom: -20, far: 300 }); scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#6a8a3c' }));
ground.receiveShadow = true; scene.add(ground);
const ids = Object.keys(TREE_SPECIES);
const gap = 34, x0 = -((ids.length - 1) * gap) / 2;
for (let i = 0; i < ids.length; i++) {
  const person = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.2, 4, 8), new THREE.MeshLambertMaterial({ color: '#c0392b' }));
  person.position.set(x0 + i * gap + 6, 0.9, 6); person.castShadow = true; scene.add(person);
}
let group = null;
async function build() {
  if (group) scene.remove(group);
  group = new THREE.Group(); scene.add(group);
  const quality = ['high', 'medium', 'low'][Number(lodSel.value)];
  const trees = ids.map((art, i) => ({ art, x: x0 + i * gap, y: 0, z: 0, rot: i * 0.7, h: TREE_SPECIES[art].h }));
  const T = await createTrees({ trees, tileGroup: () => group, cell: 4096, quality });
  document.getElementById('info').textContent = `${ids.length} species · ${T.stats.triangles.toLocaleString()} triangles`;
  window.treeGallery = { ready: true, stats: T.stats };
  return T;
}
let T = await build();
lodSel.onchange = async () => { window.treeGallery.ready = false; T = await build(); };
camera.position.set(0, 22, 125); controls.target.set(0, 16, 0); controls.update();
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
renderer.setAnimationLoop(t => { T?.update(t / 1000); renderer.render(scene, camera); });
