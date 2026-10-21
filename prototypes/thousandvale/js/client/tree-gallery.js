// Tree gallery (tree-gallery.html): every tree Thousandvale draws, storybook style (js/client/tree-style.js) beside the
// old kit tree (highdef-3d/js/kit/trees.js), with the game's own foliage materials and wind (js/client/decor.js).
//   ?view=lods     each tree at detail levels 0 / 1 / 2 side by side (storybook in front, old kit behind)
//   ?view=forest   a wood of one species laid out to 600 m; every tree takes the level the game would give it at its
//                  distance (scatter-view.js RANGES), so a swap you can see here is one you would see in the world
//   ?view=atlas    the leaf picture sheet every leaf card samples
//   &species=oak&style=both|story|kit&quality=medium&giant=1&cam=x,y,z&look=x,y,z
// window.treeGallery = { ready, stats } for tests (tests/D/trees.spec.js).

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildTree } from '../../../../highdef-3d/js/kit/trees.js';
import { loadFoliageAtlas } from '../../../../highdef-3d/js/kit/textures.js';
import { foliageMaterials, setWindTime } from './decor.js';
import { buildStoryTree, hasStoryTree } from './tree-style.js';
import { KIND_ART, RANGES } from './scatter-view.js';

const Q = new URLSearchParams(location.search);
/** Every tree name the scatter draws, with the scatter kind it comes from (first kind wins). */
const NAMES = [];
for (const a of KIND_ART) for (const n of a.tree || []) if (!NAMES.some(x => x.name === n)) NAMES.push({ name: n, kind: a.key, scale: a.scale, squash: a.squash, tint: a.tint });
for (const n of ['story_fern_a', 'story_fern_b', 'story_fern_c']) if (hasStoryTree(n) && !NAMES.some(x => x.name === n)) NAMES.push({ name: n, kind: 'tree_fern', scale: 1 });

const el = id => document.getElementById(id);
const sel = { view: el('tg-view'), style: el('tg-style'), species: el('tg-species'), quality: el('tg-quality'), giant: el('tg-giant') };
sel.species.innerHTML = '<option value="all">Every tree</option>' + NAMES.map(n => `<option value="${n.name}">${n.name} (${n.kind})</option>`).join('');
sel.view.value = Q.get('view') || 'lods'; sel.style.value = Q.get('style') || 'both'; sel.species.value = Q.get('species') || 'all';
sel.quality.value = Q.get('quality') || 'medium'; sel.giant.checked = Q.get('giant') === '1';

const canvas = el('tg-view3d');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#9fc3e6'); scene.fog = new THREE.Fog('#b8cfe0', 300, 1100);
scene.add(new THREE.HemisphereLight('#d6e6ff', '#6b5f48', 1.15));
const sun = new THREE.DirectionalLight('#fff1d8', 2.6); sun.position.set(60, 90, 40); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -80, right: 80, top: 80, bottom: -80, far: 400 });
scene.add(sun, sun.target);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshStandardMaterial({ color: '#6f8a4a', roughness: 1 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const camera = new THREE.PerspectiveCamera(55, 1, 0.3, 3000);
const controls = new OrbitControls(camera, canvas); controls.enableDamping = true;
const world = new THREE.Group(); scene.add(world);

const GEO = new Map();
function geo(style, name, lod) {
  const k = style + name + lod;
  if (!GEO.has(k)) {
    const seed = 1000 + name.length * 13;               // the scatter's seed for the piece (scatter-view.js geoFor)
    let b = null;
    try { b = style === 'story' ? buildStoryTree(name, { seed, lod }) : buildTree(name, { seed, lod }); } catch { b = null; }
    GEO.set(k, b ? { bark: b.bark, leaf: b.foliage, tris: (b.bark ? b.bark.index.count / 3 : 0) + (b.foliage ? b.foliage.index.count / 3 : 0) } : null);
  }
  return GEO.get(k);
}
const stats = { ready: false, view: '', trees: [], drawCalls: 0, triangles: 0 };
window.treeGallery = { get ready() { return stats.ready; }, stats: () => JSON.parse(JSON.stringify(stats)) };

function place(mats, style, n, lod, x, z, s, yaw = 0) {
  const g = geo(style, n.name, lod); if (!g) return 0;
  const sq = n.squash || [1, 1, 1];
  for (const [gg, mat] of [[g.bark, mats.bark], [g.leaf, mats.leaf]]) {
    if (!gg) continue;
    const m = new THREE.Mesh(gg, mat); m.position.set(x, -0.12, z); m.rotation.y = yaw; m.scale.set(s * sq[0], s * sq[1], s * sq[2]);
    m.castShadow = lod < 2; m.receiveShadow = true; world.add(m);
  }
  return g.tris;
}

async function build() {
  stats.ready = false;
  world.clear();
  const view = sel.view.value, style = sel.style.value, giant = sel.giant.checked ? 4 : 1;
  const mats = await foliageMaterials(sel.quality.value === 'low');
  const list = sel.species.value === 'all' ? NAMES : NAMES.filter(n => n.name === sel.species.value);
  stats.view = view; stats.trees = [];
  if (view === 'atlas') {
    const atlas = await loadFoliageAtlas();
    const m = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshBasicMaterial({ map: atlas.texture, transparent: true }));
    m.position.set(0, 11, 0); world.add(m);
    camera.position.set(0, 11, 26); controls.target.set(0, 11, 0);
  } else if (view === 'lods') {
    // groups of three (level 0, 1, 2), four groups to a row, rows going back; storybook in front, the old kit just behind
    const styles = style === 'both' ? ['story', 'kit'] : [style];
    const per = list.length > 1 ? 4 : 1;
    let maxH = 0, maxW = 0;
    const cell = list.map(n => { const s = n.scale * giant; return { n, s, w: Math.max(8, (n.name === 'ancient_oak' ? 12 : 5.5) * s * 2.2) }; });
    const colW = Math.max(...cell.map(c => c.w)) * 3 + 6;
    const rowD = Math.max(...cell.map(c => c.w)) * (styles.length + 0.6);
    cell.forEach(({ n, s, w }, i) => {
      const gx = (i % per) * colW - ((Math.min(per, list.length) - 1) * colW) / 2 - w, gz = -Math.floor(i / per) * rowD;
      for (const [si, st] of styles.entries()) for (let lod = 0; lod < 3; lod++) {
        const t = place(mats, st, n, lod, gx + lod * w, gz - si * w * 1.1, s);
        stats.trees.push({ name: n.name, style: st, lod, tris: t });
      }
      maxH = Math.max(maxH, (n.name === 'ancient_oak' ? 24 : 16) * s); maxW = Math.max(maxW, w);
    });
    world.position.x = 0;
    const rows = Math.ceil(list.length / per), span = Math.min(per, list.length) * colW;
    camera.position.set(0, maxH * 0.6 + rows * rowD * 0.35, span * 0.55 + maxH * 0.6 + 6); controls.target.set(0, maxH * 0.35, -rows * rowD * 0.4);
  } else {
    // a wood: trees every ~9 m out to 600 m in a 70 degree wedge in front of the camera, each at the level its distance
    // would get in the game (RANGES[quality].tree: full detail inside [0], simplified inside [1], cards out to [2])
    const R = RANGES[sel.quality.value] || RANGES.medium, st = style === 'both' ? 'story' : style;
    let k = 0, rng = 7;
    const rnd = () => ((rng = (rng * 16807) % 2147483647) / 2147483647);
    for (let d = 8; d < R.tree[2]; d += 9 * (1 + d / 260)) {
      const span = d * 1.2, nAcross = Math.max(2, Math.floor(span / (9 * (1 + d / 260))));
      for (let j = 0; j < nAcross; j++) {
        const n = list[k++ % list.length], x = (j / (nAcross - 1) - 0.5) * span + (rnd() - 0.5) * 4, z = -d + (rnd() - 0.5) * 4;
        const di = Math.hypot(x, z), lod = di < R.tree[0] ? 0 : di < R.tree[1] ? 1 : 2;
        place(mats, st, n, lod, x, z, n.scale * giant * (0.85 + rnd() * 0.3), rnd() * 6.28);
      }
    }
    for (const r of R.tree.slice(0, 2)) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.4, r + 0.4, 96), new THREE.MeshBasicMaterial({ color: '#c0392b' }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; world.add(ring);
    }
    world.position.x = 0;
    camera.position.set(0, 2.2, 4); controls.target.set(0, 4, -40);
  }
  const cam = Q.get('cam'), look = Q.get('look');
  if (cam) camera.position.fromArray(cam.split(',').map(Number));
  if (look) controls.target.fromArray(look.split(',').map(Number));
  controls.update();
  // two frames so the shaders are compiled and the stats are of a real frame
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  stats.drawCalls = renderer.info.render.calls; stats.triangles = renderer.info.render.triangles;
  el('tg-stats').textContent = `${renderer.info.render.calls} draw calls · ${renderer.info.render.triangles.toLocaleString()} triangles`;
  stats.ready = true;
}

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();
for (const s of Object.values(sel)) s.addEventListener('change', () => {
  const q = new URLSearchParams({ view: sel.view.value, style: sel.style.value, species: sel.species.value, quality: sel.quality.value, giant: sel.giant.checked ? '1' : '0' });
  history.replaceState(null, '', '?' + q); GEO.clear(); build();
});
let t0 = performance.now();
renderer.setAnimationLoop(() => {
  const t = (performance.now() - t0) / 1000;
  setWindTime(Q.get('still') === '1' ? 0 : t);
  controls.update(); renderer.render(scene, camera);
});
build();
