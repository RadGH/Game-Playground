// The mountain woods up close (play-test 11, Z25 — live #26: "We added trees to distant mountains. They are very low
// res. That's OK at a distance, but they should get a higher LOD version when you get closer").
//
// The canopy over loaded zones (horizon-grid.js buildCanopy) is thousands of cheap two-tier spires on slopes the zone
// bake left bare. Within `R` metres of the camera each spire is swapped for a REAL kit conifer (highdef-3d's pine / fir
// / spruce at their middle detail, instanced, the scatter's own foliage materials so no new shader is compiled), set on
// the real ground and sized to the spire it replaces; the spire itself is folded away in the canopy's vertex shader
// (`aRoot` + `uNear`), so a slope never shows both. Re-filled when the camera has moved 20 m.
// 2026-10-20: the near trees are the storybook conifers (js/client/tree-style.js); `kitH` is their built height (a test checks it).
//
//   const near = createNearTrees(scene, { quality, groundAt })
//   near.canopyMaterial(baseMat) -> the canopy's material (the fold-away added; compiled once)
//   near.addRoots(key, roots) / near.removeRoots(key)   roots = Float32Array [x, y, z, height, turn] x N
//   near.update(cam)            every frame (cheap unless the camera moved)
//   near.stats -> { trees, roots, refills }

import * as THREE from 'three';
import { buildSceneryTree } from './tree-style.js';
import { foliageMaterials } from './decor.js';

export const NEAR_TREES = Object.freeze({ R: { high: 300, medium: 220, low: 0 }, cap: { high: 900, medium: 500, low: 0 }, species: ['pine', 'fir', 'spruce'], kitH: { pine: 18.9, fir: 15.6, spruce: 21.4 }, grow: 1.35 });

export function createNearTrees(scene, { quality = 'high', groundAt = null } = {}) {
  const R = NEAR_TREES.R[quality] ?? 0, cap = NEAR_TREES.cap[quality] ?? 0;
  const roots = new Map();                 // key -> Float32Array
  const uNear = { value: new THREE.Vector3(1e9, 1e9, R) };
  const stats = { trees: 0, roots: 0, refills: 0, R };
  const group = new THREE.Group(); group.name = 'near-trees'; scene.add(group);
  const meshes = [];                       // per species: [bark InstancedMesh, leaf InstancedMesh]
  let ready = false;
  if (R > 0) foliageMaterials(quality === 'low').then(mats => {
    for (const sp of NEAR_TREES.species) {
      const b = buildSceneryTree(sp, { seed: 1000 + sp.length * 13, lod: 1 });       // the scatter's own seed for the species: the same tree
      const parts = [];
      for (const [geo, mat] of [[b.bark, mats.bark], [b.foliage, mats.leaf]]) {
        if (!geo) continue;
        const m = new THREE.InstancedMesh(geo, mat, cap); m.count = 0; m.frustumCulled = false;
        m.castShadow = quality === 'high'; m.receiveShadow = true; m.name = 'near-tree-' + sp;
        group.add(m); parts.push(m);
      }
      meshes.push(parts);
    }
    ready = true; last.x = NaN;
  });

  const last = { x: NaN, z: NaN };
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
  function refill(cam) {
    stats.refills++;
    const fill = meshes.map(() => 0);
    let n = 0;
    for (const arr of roots.values()) {
      for (let o = 0; o < arr.length; o += 5) {
        const x = arr[o], z = arr[o + 2], dx = x - cam.x, dz = z - cam.z;
        if (dx * dx + dz * dz > R * R) continue;
        const h = arr[o + 3], turn = arr[o + 4];
        const sp = Math.floor(((turn * 7.31) % 1 + 1) % 1 * meshes.length) % meshes.length;     // a stable species per spire
        const k = fill[sp]; if (k >= cap) continue;
        const y = groundAt ? groundAt(x, z) : arr[o + 1];
        const s = (h * NEAR_TREES.grow) / NEAR_TREES.kitH[NEAR_TREES.species[sp]];
        _q.setFromAxisAngle(_up, turn * 4); _s.set(s, s, s); _p.set(x, (Number.isFinite(y) ? y : arr[o + 1]) - 0.3, z);
        _m.compose(_p, _q, _s);
        for (const m of meshes[sp]) m.setMatrixAt(k, _m);
        fill[sp] = k + 1; n++;
      }
    }
    meshes.forEach((parts, i) => { for (const m of parts) { m.count = fill[i]; m.instanceMatrix.needsUpdate = true; } });
    stats.trees = n;
  }

  return {
    group, stats, uNear,
    /** The canopy's material: the base one, plus a fold that hides every spire whose root is within R of the camera. */
    canopyMaterial(base) {
      const m = base.clone();
      m.onBeforeCompile = sh => {
        sh.uniforms.uNear = uNear;
        sh.vertexShader = 'attribute vec2 aRoot;\nuniform vec3 uNear;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  if (distance(aRoot, uNear.xy) < uNear.z) transformed = vec3(aRoot.x, -9000.0, aRoot.y);');
      };
      m.customProgramCacheKey = () => 'tv-canopy-near';
      return m;
    },
    /** A canopy chunk's spire roots (Float32Array [x, y, z, h, turn] x N). */
    addRoots(key, arr) { if (arr && arr.length) roots.set(key, arr); else roots.delete(key); stats.roots = [...roots.values()].reduce((a, r) => a + r.length / 5, 0); last.x = NaN; },
    removeRoots(key) { if (roots.delete(key)) { stats.roots = [...roots.values()].reduce((a, r) => a + r.length / 5, 0); last.x = NaN; } },
    setGround(fn) { groundAt = fn; },
    /** Tests: the canopy root nearest (x, z) -> { x, y, z, h, d } or null. */
    nearestRoot(x, z) { let best = null; for (const arr of roots.values()) for (let o = 0; o < arr.length; o += 5) { const d = Math.hypot(arr[o] - x, arr[o + 2] - z); if (!best || d < best.d) best = { x: arr[o], y: arr[o + 1], z: arr[o + 2], h: arr[o + 3], d }; } return best; },
    update(cam) {
      if (!R || !cam) return;
      // the fold follows the camera every frame (cheap); the real trees only when it has moved a little
      if (!ready) { uNear.value.set(1e9, 1e9, R); return; }
      uNear.value.set(cam.x, cam.z, R * 0.94);
      if (Number.isFinite(last.x) && Math.hypot(cam.x - last.x, cam.z - last.z) < 20) return;
      last.x = cam.x; last.z = cam.z;
      refill(cam);
    },
    /** A canopy mesh's aRoot attribute from its roots and vertices-per-spire. */
    rootAttribute(arr, sv) {
      const N = arr.length / 5, a = new Float32Array(N * sv * 2);
      for (let s = 0; s < N; s++) for (let v = 0; v < sv; v++) { a[(s * sv + v) * 2] = arr[s * 5]; a[(s * sv + v) * 2 + 1] = arr[s * 5 + 2]; }
      return new THREE.BufferAttribute(a, 2);
    },
    sample() { const g = new THREE.Group(); for (const parts of meshes) for (const m of parts) { const c = new THREE.InstancedMesh(m.geometry, m.material, 1); g.add(c); } return g; },
    dispose() { scene.remove(group); for (const parts of meshes) for (const m of parts) m.dispose(); },
  };
}
