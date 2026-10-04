// Hunters vs Farmers nature kit (stream C, docs/hvf-PLAN.md §3, §13): the pieces a generated forest
// is built from, made cheap enough to draw ten thousand of. Every piece is ONE vertex-coloured
// BufferGeometry, so a map draws each (piece, detail) with one InstancedMesh and one shared material
// (H's `vegMat`, or `natureMaterial()` here).
//
//   import { natureGeometries, createNatureLayer, natureMaterial } from './hvf-nature.js';
//   const N = natureGeometries();
//   N.tree[look].near / .far / .chopping / .stump / .log    look 0 oak, 1 pine, 2 birch (map.look)
//   N.rock[0..2], N.briar, N.tuft, N.reeds, N.lily, N.fordStone, N.cliffBoulder, N.rampEdge
//
//   // or the whole layer, chunked with near/far detail (H can use this instead of its own buckets):
//   const layer = createNatureLayer(scene, map, { KIND, groundY, material: world.fogify(natureMaterial()) });
//   layer.update(camera)            // per frame: picks near/far per 64 m chunk, culls by frustum
//   layer.chop(cell, k)             // k 0..1 while being cut (the tree shakes and leans), 1 = cut: stump + log
//   layer.syncChopped(cells)        // the sim's state.hvf.chopped list: everything in it becomes a stump
//   layer.stats() -> { trees, drawCalls, triangles }; layer.dispose()
//
// Triangle budget: an oak is ~120 triangles near and 20 far; pine 90 / 16; birch 110 / 20. A 160 x 160
// cell map with 45% forest (~11.5k trees) draws about 450k triangles if every chunk were near, and
// ~150k at the default 70 m near distance.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function rng(seed) { let a = seed >>> 0; return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function hash(x, z, s = 1) { let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ Math.imul(s, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

// a tiny builder: shapes -> one coloured, non-indexed geometry
function Build() {
  const parts = [];
  const add = (geo, color, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1] } = {}) => {
    const g = geo.index ? geo.toNonIndexed() : geo; geo !== g && geo.dispose();
    for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(...(typeof s === 'number' ? [s, s, s] : s))));
    const c = new THREE.Color(color), n = g.attributes.position.count, col = new Float32Array(n * 3);
    // a little vertical shading baked in: darker at the bottom of each piece
    const pos = g.attributes.position; let y0 = Infinity, y1 = -Infinity; for (let i = 0; i < n; i++) { y0 = Math.min(y0, pos.getY(i)); y1 = Math.max(y1, pos.getY(i)); }
    for (let i = 0; i < n; i++) { const k = 0.82 + 0.18 * ((pos.getY(i) - y0) / Math.max(1e-6, y1 - y0)); col[i * 3] = c.r * k; col[i * 3 + 1] = c.g * k; col[i * 3 + 2] = c.b * k; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); parts.push(g);
  };
  return {
    cyl: (rt, rb, h, c, o, seg = 6) => add(new THREE.CylinderGeometry(rt, rb, h, seg, 1), c, o),
    cone: (r, h, c, o, seg = 7) => add(new THREE.ConeGeometry(r, h, seg, 1), c, o),
    ico: (r, c, o, det = 0) => add(new THREE.IcosahedronGeometry(r, det), c, o),
    dodec: (r, c, o) => add(new THREE.DodecahedronGeometry(r, 0), c, o),
    box: (w, h, d, c, o) => add(new THREE.BoxGeometry(w, h, d), c, o),
    plane: (w, h, c, o) => add(new THREE.PlaneGeometry(w, h), c, o),
    done() { const g = mergeGeometries(parts); g.computeVertexNormals(); g.computeBoundingSphere(); for (const p of parts) p.dispose(); return g; },
  };
}

// ----------------------------------------------------------------- trees (3 looks x states)
const TREE = {
  oak: { trunk: '#5a4030', leaf: ['#3e6a2e', '#4a7a34', '#355e28'] },
  pine: { trunk: '#4a3424', leaf: ['#24482a', '#2e5630', '#1e3e24'] },
  birch: { trunk: '#e8e4d8', leaf: ['#7aa04a', '#8ab056', '#6a903e'] },
};
function treeNear(look) {
  const b = Build(), T = TREE[look];
  if (look === 'oak') { b.cyl(0.22, 0.34, 2.0, T.trunk, { p: [0, 1.0, 0] }); b.cyl(0.08, 0.12, 1.0, T.trunk, { p: [0.35, 2.0, 0], r: [0, 0, -0.7] }, 5); b.ico(1.45, T.leaf[0], { p: [0, 3.1, 0], s: [1, 0.85, 1] }, 1); b.ico(0.95, T.leaf[1], { p: [0.75, 3.6, 0.3] }); b.ico(0.9, T.leaf[2], { p: [-0.7, 3.4, -0.35] }); }
  else if (look === 'pine') { b.cyl(0.14, 0.24, 1.2, T.trunk, { p: [0, 0.6, 0] }); b.cone(1.35, 2.0, T.leaf[0], { p: [0, 1.9, 0] }); b.cone(1.05, 1.8, T.leaf[1], { p: [0, 2.9, 0] }); b.cone(0.7, 1.5, T.leaf[2], { p: [0, 3.9, 0] }); }
  else { b.cyl(0.11, 0.16, 3.4, T.trunk, { p: [0, 1.7, 0] }); for (let i = 0; i < 4; i++) b.box(0.24, 0.05, 0.02, '#2a2a28', { p: [0, 0.6 + i * 0.7, 0.13], r: [0, i, 0] }); b.ico(0.95, T.leaf[0], { p: [0, 3.5, 0], s: [0.85, 1.25, 0.85] }); b.ico(0.65, T.leaf[1], { p: [0.4, 2.9, 0.2] }); b.ico(0.6, T.leaf[2], { p: [-0.35, 3.1, -0.25] }); }
  return b.done();
}
function treeFar(look) {
  const b = Build(), T = TREE[look];
  if (look === 'pine') { b.cyl(0.18, 0.2, 1.0, T.trunk, { p: [0, 0.5, 0] }, 3); b.cone(1.35, 3.8, T.leaf[1], { p: [0, 2.7, 0] }, 5); }
  else { b.cyl(0.2, 0.25, 2.0, T.trunk, { p: [0, 1.0, 0] }, 3); b.ico(look === 'oak' ? 1.6 : 1.05, T.leaf[0], { p: [0, look === 'oak' ? 3.2 : 3.2, 0], s: look === 'birch' ? [0.9, 1.4, 0.9] : [1, 0.9, 1] }); }
  return b.done();
}
function stump(look) {
  const b = Build(), T = TREE[look];
  b.cyl(0.26, 0.34, 0.45, T.trunk, { p: [0, 0.22, 0] }, 7);
  b.cyl(0.24, 0.24, 0.03, '#d8b880', { p: [0, 0.46, 0] }, 7);           // the cut face
  b.cyl(0.12, 0.12, 0.031, '#b8945c', { p: [0, 0.465, 0] }, 7);
  for (let i = 0; i < 4; i++) b.box(0.06, 0.03, 0.12, '#d8b880', { p: [Math.cos(i * 1.7) * 0.55, 0.02, Math.sin(i * 1.7) * 0.55], r: [0, i, 0] });   // chips
  return b.done();
}
function log(look) {
  const b = Build(), T = TREE[look];
  b.cyl(0.2, 0.24, 2.6, T.trunk, { p: [0.9, 0.2, 0.3], r: [0, 0.4, Math.PI / 2] }, 6);
  b.cyl(0.2, 0.2, 0.02, '#d8b880', { p: [-0.29, 0.2, -0.17], r: [0, 0.4, Math.PI / 2] }, 6);
  return b.done();
}

// ----------------------------------------------------------------- ground pieces
function rockGeo(i) {
  const b = Build(), r = rng(31 + i), c = ['#8a867c', '#7a7870', '#9a958a'][i];
  b.dodec(0.75 + i * 0.12, c, { p: [0, 0.3, 0], s: [1.1, 0.7, 1] }); b.dodec(0.45, c, { p: [0.6, 0.18, 0.3], r: [r(), r(), r()] });
  if (i === 2) b.dodec(0.35, '#6e6a62', { p: [-0.5, 0.15, -0.4] });
  b.ico(0.2, '#5a7a3a', { p: [-0.2, 0.62, 0.1], s: [1.5, 0.3, 1.2] });      // moss
  return b.done();
}
function briarGeo() {
  const b = Build(), r = rng(5);
  for (let i = 0; i < 4; i++) b.ico(0.45 + r() * 0.2, i % 2 ? '#3e4a2a' : '#4a3a2c', { p: [(r() - 0.5) * 1.1, 0.42 + r() * 0.3, (r() - 0.5) * 1.1], s: [1, 0.75, 1] });
  for (let i = 0; i < 10; i++) b.cone(0.025, 0.22, '#d6cca6', { p: [(r() - 0.5) * 1.5, 0.3 + r() * 0.6, (r() - 0.5) * 1.5], r: [r() * 3, 0, r() * 3] }, 3);
  for (let i = 0; i < 6; i++) b.ico(0.06, '#8a1a3a', { p: [(r() - 0.5) * 1.3, 0.5 + r() * 0.4, (r() - 0.5) * 1.3] });
  return b.done();
}
function tuftGeo() {
  const b = Build(), r = rng(9);
  for (let i = 0; i < 9; i++) b.cone(0.07, 0.9 + r() * 0.6, i % 3 ? '#8a9a3a' : '#a8a84a', { p: [(r() - 0.5) * 1.4, 0.45, (r() - 0.5) * 1.4], r: [(r() - 0.5) * 0.5, 0, (r() - 0.5) * 0.5] }, 3);
  return b.done();
}
function reedsGeo() {
  const b = Build(), r = rng(12);
  for (let i = 0; i < 7; i++) { const x = (r() - 0.5) * 1.2, z = (r() - 0.5) * 1.2, h = 1.1 + r() * 0.6; b.cyl(0.015, 0.02, h, '#6a8a3a', { p: [x, h / 2, z], r: [(r() - 0.5) * 0.3, 0, (r() - 0.5) * 0.3] }, 3); if (r() < 0.6) b.cyl(0.05, 0.05, 0.25, '#5a3a20', { p: [x, h - 0.05, z] }, 5); }
  return b.done();
}
function lilyGeo() { const b = Build(), r = rng(3); for (let i = 0; i < 3; i++) b.cyl(0.28, 0.28, 0.02, '#4a7a3a', { p: [(r() - 0.5) * 1.2, 0.01, (r() - 0.5) * 1.2] }, 8); b.ico(0.07, '#f0d8e8', { p: [0.1, 0.06, 0] }); return b.done(); }
function fordStoneGeo() { const b = Build(); b.cyl(0.5, 0.58, 0.3, '#8a867c', { p: [0, 0.12, 0] }, 7); b.cyl(0.3, 0.36, 0.25, '#7a766c', { p: [0.7, 0.1, 0.4] }, 6); return b.done(); }
function cliffBoulderGeo() { const b = Build(), r = rng(21); for (let i = 0; i < 4; i++) b.dodec(0.6 + r() * 0.5, i % 2 ? '#7a6a52' : '#8a7a60', { p: [(r() - 0.5) * 1.6, 0.6 + r() * 1.8, (r() - 0.5) * 0.6], s: [1, 1.4, 0.8], r: [r(), r(), r()] }); return b.done(); }
function rampEdgeGeo() { const b = Build(); for (let i = 0; i < 4; i++) b.box(1.9, 0.12, 0.35, '#7a5a3a', { p: [0, 0.2 + i * 0.75, -0.75 + i * 0.5] }); b.cyl(0.08, 0.08, 1.2, '#5a3e26', { p: [-0.95, 0.6, -0.5] }, 5); b.cyl(0.08, 0.08, 1.2, '#5a3e26', { p: [0.95, 0.6, -0.5] }, 5); return b.done(); }

let CACHE = null;
/** Every nature piece, built once and shared. */
export function natureGeometries() {
  if (CACHE) return CACHE;
  const looks = ['oak', 'pine', 'birch'];
  CACHE = {
    looks,
    tree: looks.map(l => ({ look: l, near: treeNear(l), far: treeFar(l), stump: stump(l), log: log(l) })),
    rock: [0, 1, 2].map(rockGeo), briar: briarGeo(), tuft: tuftGeo(), reeds: reedsGeo(), lily: lilyGeo(),
    fordStone: fordStoneGeo(), cliffBoulder: cliffBoulderGeo(), rampEdge: rampEdgeGeo(),
  };
  for (const t of CACHE.tree) t.chopping = t.near;   // the chopping state is the near tree, leant + shaken per instance (chop())
  return CACHE;
}
let MAT = null;
export function natureMaterial() { return MAT || (MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, flatShading: true })); }

/**
 * The whole forest layer for a generated map: one InstancedMesh per (chunk, piece, detail).
 * `KIND` and `groundY(map, x, z)` come from H's mapgen.js / world.js. Cells are `map.cell` metres.
 */
export function createNatureLayer(scene, map, { KIND, groundY = () => 0, material = natureMaterial(), chunkCells = 32, nearDistance = 70, seed = 7 } = {}) {
  const N = natureGeometries(), root = new THREE.Group(); root.name = 'hvf-nature'; scene.add(root);
  const { cols, rows, cell } = map, chunks = [], treeOf = new Map(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3(), e = new THREE.Euler();
  const isK = (x, z, k) => x >= 0 && z >= 0 && x < cols && z < rows && map.cells[z * cols + x] === k;
  for (let cz0 = 0; cz0 < rows; cz0 += chunkCells) for (let cx0 = 0; cx0 < cols; cx0 += chunkCells) {
    const lists = new Map(); const push = (name, geoNear, geoFar, mtx, cellIndex) => { if (!lists.has(name)) lists.set(name, { near: geoNear, far: geoFar, m: [], cells: [] }); const L = lists.get(name); L.m.push(mtx.clone()); L.cells.push(cellIndex); };
    for (let cz = cz0; cz < Math.min(rows, cz0 + chunkCells); cz++) for (let cx = cx0; cx < Math.min(cols, cx0 + chunkCells); cx++) {
      const i = cz * cols + cx, k = map.cells[i], h = hash(cx, cz, seed);
      const x = (cx + 0.5) * cell + (hash(cx, cz, seed + 1) - 0.5) * cell * 0.5, z = (cz + 0.5) * cell + (hash(cx, cz, seed + 2) - 0.5) * cell * 0.5, y = groundY(map, x, z);
      const place = (scale, yaw = h * 6.28) => { e.set(0, yaw, 0); q.setFromEuler(e); s3.setScalar(scale); p3.set(x, y, z); return m4.compose(p3, q, s3); };
      if (k === KIND.tree) { const look = map.look ? map.look[i] % 3 : Math.floor(h * 3); push('tree' + look, N.tree[look].near, N.tree[look].far, place(0.8 + hash(cx, cz, seed + 3) * 0.45), i); }
      else if (k === KIND.rock) push('rock' + Math.floor(h * 3), N.rock[Math.floor(h * 3)], N.rock[Math.floor(h * 3)], place(0.9 + h * 0.5), i);
      else if (k === KIND.briar) push('briar', N.briar, N.briar, place(1.0 + h * 0.3), i);
      else if (k === KIND.tallgrass) push('tuft', N.tuft, null, place(0.9 + h * 0.4), i);
      else if (k === KIND.ford) { if (h < 0.5) push('ford', N.fordStone, null, place(0.8 + h), i); }
      else if (k === KIND.water) { const shore = isK(cx + 1, cz, KIND.grass) || isK(cx - 1, cz, KIND.grass) || isK(cx, cz + 1, KIND.grass) || isK(cx, cz - 1, KIND.grass); if (shore && h < 0.6) push('reeds', N.reeds, null, place(1, h * 6), i); else if (h < 0.08) push('lily', N.lily, null, place(1), i); }
      else if (k === KIND.cliff) { if (h < 0.55) push('cliff', N.cliffBoulder, N.cliffBoulder, place(0.9 + h * 0.6), i); }
    }
    const meshes = [];
    for (const [name, L] of lists) for (const lod of ['near', 'far']) {
      const geo = L[lod]; if (!geo) continue;
      // rocks, briar and cliffs read the same at any distance: one mesh, drawn near AND far
      if (lod === 'far' && L.far === L.near) continue;
      const always = L.far === L.near;
      const im = new THREE.InstancedMesh(geo, material, L.m.length); im.name = name + ':' + lod;
      L.m.forEach((mx, j) => { im.setMatrixAt(j, mx); if (name.startsWith('tree') && lod === 'near') treeOf.set(L.cells[j], { name, j, base: mx.clone() }); });
      im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); im.userData = { lod: always ? 'always' : lod, name, cells: L.cells };
      root.add(im); meshes.push(im);
    }
    const c = new THREE.Vector3((cx0 + chunkCells / 2) * cell, 0, (cz0 + chunkCells / 2) * cell);
    chunks.push({ centre: c, meshes, box: new THREE.Box3(new THREE.Vector3(cx0 * cell, -2, cz0 * cell), new THREE.Vector3((cx0 + chunkCells) * cell, 12, (cz0 + chunkCells) * cell)) });
  }
  // stumps + logs for cut trees, and the per-chunk lookup of a tree's instance in both detail meshes
  const stumpMeshes = N.tree.map((t, l) => { const a = new THREE.InstancedMesh(t.stump, material, 2048), b = new THREE.InstancedMesh(t.log, material, 2048); a.count = b.count = 0; a.frustumCulled = b.frustumCulled = false; root.add(a, b); return { stump: a, log: b }; });
  const cut = new Set(), chopping = new Map();
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  function instancesOf(cellIndex) { const out = []; for (const ch of chunks) for (const im of ch.meshes) { const j = im.userData.cells.indexOf(cellIndex); if (j >= 0 && im.userData.name.startsWith('tree')) out.push([im, j]); } return out; }
  function hideTree(cellIndex) {
    const info = treeOf.get(cellIndex); if (!info || cut.has(cellIndex)) return;
    cut.add(cellIndex);
    for (const [im, j] of instancesOf(cellIndex)) { im.setMatrixAt(j, ZERO); im.instanceMatrix.needsUpdate = true; }
    const look = +info.name.slice(4), S = stumpMeshes[look];
    S.stump.setMatrixAt(S.stump.count++, info.base); S.log.setMatrixAt(S.log.count++, info.base); S.stump.instanceMatrix.needsUpdate = S.log.instanceMatrix.needsUpdate = true;
  }
  const v = new THREE.Vector3(), frustum = new THREE.Frustum(), pm = new THREE.Matrix4();
  return {
    root,
    update(camera, dt = 0.016) {
      camera.updateMatrixWorld(); pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(pm);
      camera.getWorldPosition(v);
      for (const ch of chunks) {
        const vis = frustum.intersectsBox(ch.box), near = ch.centre.distanceTo(new THREE.Vector3(v.x, 0, v.z)) < nearDistance + 32;
        // a piece with a far version swaps at the near distance; a near-only piece (grass, reeds) just stops drawing
        for (const im of ch.meshes) im.visible = vis && (im.userData.lod === 'always' || (im.userData.lod === 'near' ? near : !near));
      }
      // trees being cut shake and lean
      for (const [cellIndex, st] of chopping) {
        st.t += dt; const info = treeOf.get(cellIndex); if (!info) continue;
        const lean = st.k * 0.25 + Math.sin(st.t * 30) * 0.03 * (1 - st.k * 0.5);
        const mx = info.base.clone().multiply(new THREE.Matrix4().makeRotationZ(lean));
        for (const [im, j] of instancesOf(cellIndex)) { im.setMatrixAt(j, mx); im.instanceMatrix.needsUpdate = true; }
      }
    },
    chop(cellIndex, k = 1) { if (k >= 1) { chopping.delete(cellIndex); hideTree(cellIndex); } else if (!cut.has(cellIndex)) chopping.set(cellIndex, { k, t: chopping.get(cellIndex)?.t || 0 }); },
    syncChopped(cells) { for (const c of cells || []) if (!cut.has(c)) { chopping.delete(c); hideTree(c); } },
    stats() { let tris = 0, calls = 0, trees = treeOf.size; root.traverse(o => { if (o.isInstancedMesh && o.visible && o.count) { calls++; tris += o.count * o.geometry.attributes.position.count / 3; } }); return { trees, drawCalls: calls, triangles: tris, chunks: chunks.length }; },
    dispose() { scene.remove(root); root.traverse(o => { if (o.isInstancedMesh) o.dispose(); }); },
  };
}
