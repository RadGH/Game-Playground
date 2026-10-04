// hvf-art.html: the Hunters vs Farmers art on a real generated world (stream C).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { KIND, worldForFormat } from '../sim/modes/hvf/mapgen.js';
import { natureGeometries, createNatureLayer, natureMaterial } from '../view/hvf-nature.js';
import { makeHvfBuilding, HVF_KINDS } from '../view/hvf-structures.js';
import { creaturePoses } from '../../../../avatar-3d/js/creature-poses.js';
import { loadLooks, applyGhost } from '../view/unit-looks.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const canvas = $('view3d');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x8ab0c8); scene.fog = new THREE.Fog(0x8ab0c8, 120, 300);
scene.add(new THREE.HemisphereLight(0xdfeeff, 0x4a3f2c, 1.25));
const sun = new THREE.DirectionalLight(0xfff0d6, 2.2); sun.position.set(-60, 110, 70); scene.add(sun);
const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 900);
const controls = new OrbitControls(camera, canvas); controls.enableDamping = true;
function resize() { const r = canvas.getBoundingClientRect(); renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

const hvfData = {};
for (const f of ['rules', 'mapgen', 'buildings', 'animals', 'units']) hvfData[f] = await (await fetch(new URL(`../../data/hvf/${f}.json`, import.meta.url))).json();
const looks = await loadLooks();
const PLATEAU = 3.2;
const groundY = (map, x, z) => { const cx = Math.max(0, Math.min(map.cols - 1, Math.floor(x / map.cell))), cz = Math.max(0, Math.min(map.rows - 1, Math.floor(z / map.cell))); const i = cz * map.cols + map.cols * 0 + cx; return map.cells[i] === KIND.ramp ? PLATEAU / 2 : map.level[i] ? PLATEAU : 0; };

let built = [], layer = null, animals = [], actors = [], buildings = [], t = 0, map = null;
function clear() { for (const o of built) scene.remove(o); built = []; layer?.dispose(); layer = null; animals = []; for (const a of actors) a.dispose?.(); actors = []; buildings = []; }
const add = o => { scene.add(o); built.push(o); return o; };

/** A plain ground for the preview: one quad per cell coloured by kind, lifted on plateaus. */
function ground(map) {
  const COL = { [KIND.grass]: '#4f7a2e', [KIND.trail]: '#a8865a', [KIND.tree]: '#2e4a22', [KIND.briar]: '#4a3a2a', [KIND.tallgrass]: '#7a8a34', [KIND.rock]: '#6e6a62', [KIND.water]: '#3a6a82', [KIND.ford]: '#5a8a96', [KIND.cliff]: '#6a5a42', [KIND.ramp]: '#9a7a52' };
  const pos = [], col = [], c = new THREE.Color(), s = map.cell;
  for (let z = 0; z < map.rows; z++) for (let x = 0; x < map.cols; x++) {
    const i = z * map.cols + x, k = map.cells[i], y = k === KIND.water ? -0.4 : k === KIND.ford ? -0.15 : map.level[i] ? PLATEAU : 0;
    c.set(COL[k] || '#4f7a2e').offsetHSL(0, 0, ((x * 7 + z * 13) % 5 - 2) * 0.008);
    const x0 = x * s, z0 = z * s, x1 = x0 + s, z1 = z0 + s;
    pos.push(x0, y, z0, x0, y, z1, x1, y, z1, x0, y, z0, x1, y, z1, x1, y, z0); for (let v = 0; v < 6; v++) col.push(c.r, c.g, c.b);
    // plateau sides
    for (const [dx, dz] of [[1, 0], [0, 1]]) { const j = (z + dz) * map.cols + x + dx; if (x + dx >= map.cols || z + dz >= map.rows) continue; const y2 = map.cells[j] === KIND.water ? -0.4 : map.level[j] ? PLATEAU : 0; if (Math.abs(y2 - y) < 1) continue; const lo = Math.min(y, y2), hi = Math.max(y, y2); c.set('#6a5a42'); if (dx) pos.push(x1, lo, z0, x1, hi, z0, x1, hi, z1, x1, lo, z0, x1, hi, z1, x1, lo, z1); else pos.push(x0, lo, z1, x1, lo, z1, x1, hi, z1, x0, lo, z1, x1, hi, z1, x0, hi, z1); for (let v = 0; v < 6; v++) col.push(c.r, c.g, c.b); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
  return add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide })));
}

const POSE_CACHE = {};
async function flock(type, n, at, radius, poseMix = ['graze', 'idle', 'walkA', 'walkB']) {
  const P = POSE_CACHE[type] ||= await creaturePoses(looks.forHvf('animals', type).spec);
  const mat = natureMaterial();
  const meshes = poseMix.map(name => { const m = new THREE.InstancedMesh(P[name], mat, n); m.count = 0; add(m); return m; });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), r = (i, k) => (Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1;
  for (let i = 0; i < n; i++) {
    const a = Math.abs(r(i, 1)) * Math.PI * 2, d = Math.sqrt(Math.abs(r(i, 2))) * radius, x = at.x + Math.cos(a) * d, z = at.z + Math.sin(a) * d;
    const m = meshes[i % meshes.length]; q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.abs(r(i, 3)) * 6.28);
    m4.compose(new THREE.Vector3(x, groundY(map, x, z), z), q, new THREE.Vector3(1, 1, 1)); m.setMatrixAt(m.count++, m4);
  }
  for (const m of meshes) m.instanceMatrix.needsUpdate = true;
  animals.push(...meshes);
}
async function person(look, x, z, yaw = 0, anim = 'idle', scale = 1.35) {
  const a = await looks.build(look); a.group.position.set(x, map ? groundY(map, x, z) : 0, z); a.group.rotation.y = yaw; a.group.scale.setScalar(scale); a.setAnim(anim); add(a.group); actors.push(a); return a;
}
function building(kind, x, z, opts = {}) {
  const sz = hvfData.buildings.kinds[kind]?.size || [1, 1];
  const b = makeHvfBuilding(kind, { w: sz[0] * 2, d: sz[1] * 2, ...opts }); b.group.position.set(x, map ? groundY(map, x, z) : 0, z); b.group.rotation.y = opts.yaw || 0; add(b.group); buildings.push(b); return b;
}

async function buildWorld(seed) {
  map = worldForFormat({ ...hvfData, rules: hvfData.rules, mapgen: hvfData.mapgen }, seed, '5v2');
  ground(map);
  layer = createNatureLayer(scene, map, { KIND, groundY });
  // a farm in the first hollow
  const h = map.hollows[0], cx = h.x, cz = h.z, col = '#4fa3e8';
  building('farmhouse', cx - 4, cz - 4, { color: col }); building('pen', cx + 3, cz - 3, { color: col }); building('coop', cx - 4, cz + 3, { color: col });
  building('hive', cx + 1, cz + 4, { color: col }); building('tower', cx + 5, cz + 4, { color: col });
  for (let i = 0; i < 5; i++) building('fence', cx - 6 + i * 2, cz + 7, { mask: (i > 0 ? 8 : 0) | (i < 4 ? 2 : 0) });
  await flock('sheep', 8, { x: cx + 3, z: cz - 3 }, 4); await flock('hen', 6, { x: cx - 4, z: cz + 3 }, 2.5);
  await flock('sheep', 2, { x: cx + 12, z: cz + 2 }, 2, ['walkA', 'walkB']);      // strays on the trail
  await person(looks.forRole('farmer', { color: col }), cx, cz + 1, 0.4);
  const ghost = await person(looks.forRole('farmer', { color: '#e8664f' }), cx - 1.5, cz - 1, 0.2); applyGhost(ghost.group, looks.ghostStyle());
  building('grave', cx - 1.5, cz - 2.2, { color: '#e8664f' });
  // the hunter on the trail with his hound and a watchstone
  const k = map.kennels[0];
  await person(looks.forRole('hunter', { color: '#b23a2a' }), cx + 14, cz + 3, -1.6, 'walk', 1.6);
  building('watchstone', cx + 12, cz + 6); building('snare', cx + 9, cz + 1);
  building('kennel', k.x, k.z, { color: '#b23a2a' });
  camera.position.set(cx + 20, 34, cz + 30); controls.target.set(cx + 3, 0, cz); controls.update();
  $('state').textContent = `seed ${seed}: ${map.cols}x${map.rows} cells, ${layer.stats().trees} trees, ${map.hollows.length} hollows`;
}
async function buildLineup() {
  map = null;
  add(new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x4f7a2e, roughness: 1 }))).rotation.x = -Math.PI / 2;
  HVF_KINDS.forEach((kind, i) => { const b = building(kind, (i % 6 - 2.5) * 10, Math.floor(i / 6) * 11 - 16, { color: '#4fa3e8', mask: 10 }); b.setReady(true); });
  const N = natureGeometries();
  N.tree.forEach((tr, i) => { for (const [j, g] of [[0, tr.near], [1, tr.far], [2, tr.stump], [3, tr.log]]) { const m = add(new THREE.Mesh(g, natureMaterial())); m.position.set(38 + j * 4, 0, -16 + i * 6); } });
  [...N.rock, N.briar, N.tuft, N.reeds, N.lily, N.fordStone, N.cliffBoulder, N.rampEdge].forEach((g, i) => { const m = add(new THREE.Mesh(g, natureMaterial())); m.position.set(38 + (i % 4) * 4, 0, 4 + Math.floor(i / 4) * 5); });
  camera.position.set(10, 60, 62); controls.target.set(8, 0, 0); controls.update();
  $('state').textContent = `${HVF_KINDS.length} buildings + the nature kit`;
}
async function buildCast() {
  map = null;
  add(new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0x4f7a2e, roughness: 1 }))).rotation.x = -Math.PI / 2;
  const row = async (kind, list, z, anims) => { let x = -9; for (const id of list) for (const an of anims) { const L = looks.forHvf(kind, id); await person(L, x, z, 0.5, an, 1); x += 2.4; } };
  await row('animals', ['sheep', 'hen', 'pig', 'cow'], 0, ['graze', 'walk', 'panic']);
  await row('army', ['scarecrow', 'crow'], 5, ['walk', 'attack']); await row('pets', ['hound', 'hawk'], 10, ['run']);
  await person(looks.forRole('farmer', { color: '#4fa3e8' }), -6, -5, 0.4, 'idle'); await person(looks.forRole('farmer', { color: '#7fd06a' }), -3, -5, 0.4, 'walk');
  const g = await person(looks.forRole('farmer', { color: '#e8664f' }), 0, -5, 0.4, 'idle'); applyGhost(g.group, looks.ghostStyle());
  await person(looks.forRole('hunter', { color: '#b23a2a' }), 4, -5, 0.4, 'attack', 1.6);
  camera.position.set(2, 14, 22); controls.target.set(2, 0.6, 0); controls.update();
  $('state').textContent = 'animals (graze / walk / panic), army, pets, farmers, a ghost, the hunter';
}
async function build() { clear(); const v = $('view').value; if (v === 'world') await buildWorld(+$('seed').value); else if (v === 'lineup') await buildLineup(); else await buildCast(); }
$('view').value = params.get('view') || 'world'; $('seed').value = params.get('seed') || '3';
$('view').onchange = build; $('seed').onchange = build;
$('chop').onclick = () => { if (!layer || !map) return; const trees = []; for (let i = 0; i < map.cells.length; i++) if (map.cells[i] === KIND.tree) trees.push(i); const near = trees.sort((a, b) => Math.abs(a % map.cols * 2 - controls.target.x) + Math.abs(Math.floor(a / map.cols) * 2 - controls.target.z) - (Math.abs(b % map.cols * 2 - controls.target.x) + Math.abs(Math.floor(b / map.cols) * 2 - controls.target.z))).slice(0, 6); near.forEach((c, i) => i < 3 ? layer.chop(c, 1) : layer.chop(c, 0.6)); };
let dmg = 0; $('damage').onclick = () => { dmg = (dmg + 1) % 3; for (const b of buildings) { b.setProgress(dmg === 1 ? 0.5 : 1); b.setDamage(dmg === 2 ? 0.9 : 0); } };
await build();
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(0.05, clock.getDelta()); t += dt;
  for (const a of actors) a.update(dt, t); for (const b of buildings) b.update(dt);
  layer?.update(camera, dt); controls.update(); renderer.render(scene, camera);
  if (Math.floor(t * 2) !== Math.floor((t - dt) * 2)) { const i = renderer.info.render; $('live').textContent = `${i.calls} draws  ${(i.triangles / 1000).toFixed(0)}k tris` + (layer ? `\nnature ${layer.stats().drawCalls} draws` : ''); }
});
window.hvfArt = { ready: true, build, look(px, py, pz, tx, ty, tz) { camera.position.set(px, py, pz); controls.target.set(tx, ty, tz); controls.update(); }, get map() { return map; }, get layer() { return layer; }, info: () => renderer.info.render, setView: async (v, seed) => { $('view').value = v; if (seed) $('seed').value = seed; await build(); } };
