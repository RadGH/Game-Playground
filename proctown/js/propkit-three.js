// Set-piece kit -> Three.js: the eight unit shapes and an instancer. The kit itself (propkit.js) has no
// Three.js in it; this is the small adapter a game (or the gallery page) uses to draw its part lists.
//
//   import * as THREE from 'three';
//   import { propModel } from './propkit.js';
//   import { unitGeometry, partMatrix, instanceParts } from './propkit-three.js';
//   const m = propModel('windmill', { seed: 3 });
//   const meshes = instanceParts(THREE, placedParts, material);   // one InstancedMesh per mesh kind
//
// A part's matrix is T(x, y, z) * R(Euler(rx, yaw, rz, 'YXZ')) * S(w, h, d), unit shapes have their origin at
// the centre of the base (propkit.js header). `placeModel()` puts a whole model at (x, y, z) turned by yaw.

const UNIT = new Map();

function prism(THREE, section) {
  const pos = [];
  const tri = (a, b, c) => pos.push(...a, ...b, ...c);
  const n = section.length;
  for (let i = 1; i < n - 1; i++) {
    tri([section[0][0], section[0][1], 0.5], [section[i][0], section[i][1], 0.5], [section[i + 1][0], section[i + 1][1], 0.5]);
    tri([section[0][0], section[0][1], -0.5], [section[i + 1][0], section[i + 1][1], -0.5], [section[i][0], section[i][1], -0.5]);
  }
  for (let i = 0; i < n; i++) {
    const a = section[i], b = section[(i + 1) % n];
    tri([a[0], a[1], -0.5], [b[0], b[1], -0.5], [b[0], b[1], 0.5]);
    tri([a[0], a[1], -0.5], [b[0], b[1], 0.5], [a[0], a[1], 0.5]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.computeVertexNormals();
  return g;
}

/**
 * The `sheaf` unit shape (2026-10-07): a 1 x 1 x 1 patch of thin standing stalks — 34 tapering blades at seeded spots,
 * leaning a little, heights 0.62-1.0 so the top line is uneven. Vertex colours run from a darker, greener foot to full
 * tint at the ear (they multiply the instance colour); normals point up-and-out so a field shades as one soft mass.
 * `position.y` is 0 at the root and up to 1 at the tip — a wind shader sways by it (see sheafWind).
 */
export function sheafGeometry(THREE, blades = 34) {
  let seed = 1234567;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const pos = [], nor = [], col = [], idx = [];
  for (let b = 0; b < blades; b++) {
    // thin (a patch is stretched to fit its row, so a blade is drawn narrow here), and turned mostly ACROSS the
    // stretch so it never becomes a wide shard
    const x = rnd() - 0.5, z = rnd() - 0.5, h = 0.6 + rnd() * 0.4, yaw = (rnd() - 0.5) * 0.9, w = 0.022 + rnd() * 0.02, lean = (rnd() - 0.5) * 0.2, lz = (rnd() - 0.5) * 0.12;
    const cx = Math.cos(yaw), sz = Math.sin(yaw) * 0.35, o = pos.length / 3;
    // every normal points straight up, and each blade is drawn with both windings: a field is lit like the ground it
    // stands on from either side (a double-sided material would turn the far face black)
    const v = (side, y, k) => { pos.push(x + cx * w * side * k + lean * y * y, y, z + sz * w * side * k + lz * y * y); nor.push(0, 1, 0); const c = y <= 0 ? 0.6 : 1; col.push(c * (y <= 0 ? 0.9 : 1), c, c * (y <= 0 ? 0.78 : 1)); };
    v(-1, 0, 1); v(1, 0, 1); v(-1, h * 0.72, 0.7); v(1, h * 0.72, 0.7); v(-1, h, 1.9); v(1, h, 1.9);        // a stalk that swells into an ear
    for (const [i, j, k] of [[0, 1, 2], [1, 3, 2], [2, 3, 4], [3, 5, 4]]) idx.push(o + i, o + j, o + k, o + i, o + k, o + j);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
  g.setIndex(idx);
  return g;
}
/**
 * Make an instanced sheaf material sway: `uniform` is a `{ value: seconds }` wind clock (share the game's own). The
 * sway grows with height squared and its phase comes from where the instance stands, so a gust runs across a field.
 */
export function sheafWind(material, uniform) {
  material.onBeforeCompile = shader => {
    shader.uniforms.uSheafT = uniform;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uSheafT;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float shPh = instanceMatrix[3].x * 0.31 + instanceMatrix[3].z * 0.23;
          float shK = position.y * position.y;
          transformed.x += (sin(uSheafT * 1.6 + shPh) * 0.6 + sin(uSheafT * 2.9 + shPh * 1.7) * 0.3) * 0.11 * shK;
          transformed.z += cos(uSheafT * 1.3 + shPh * 0.8) * 0.06 * shK;
        #endif`);
  };
  material.customProgramCacheKey = () => 'sheaf-wind';
  return material;
}

/** The unit shape for a mesh kind (cached per THREE module). */
export function unitGeometry(THREE, kind) {
  if (UNIT.has(kind)) return UNIT.get(kind);
  let g;
  switch (kind) {
    case 'cyl': g = new THREE.CylinderGeometry(0.5, 0.5, 1, 12); g.translate(0, 0.5, 0); break;
    case 'gable': g = prism(THREE, [[-0.5, 0], [0.5, 0], [0, 1]]); break;
    case 'shed': g = prism(THREE, [[-0.5, 0], [0.5, 0], [-0.5, 1]]); break;
    case 'hip': g = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4); g.rotateY(Math.PI / 4); g.translate(0, 0.5, 0); break;
    case 'frustum': g = new THREE.CylinderGeometry(0.225 * Math.SQRT2, 0.5 * Math.SQRT2, 1, 4); g.rotateY(Math.PI / 4); g.translate(0, 0.5, 0); break;
    case 'cone': g = new THREE.ConeGeometry(0.5, 1, 12); g.translate(0, 0.5, 0); break;
    case 'dome': g = new THREE.SphereGeometry(0.5, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2); g.scale(1, 2, 1); break;
    case 'sheaf': g = sheafGeometry(THREE); break;
    default: g = new THREE.BoxGeometry(1, 1, 1); g.translate(0, 0.5, 0); break;
  }
  UNIT.set(kind, g);
  return g;
}

/** A part's local matrix (into `out`). */
export function partMatrix(THREE, p, out = new THREE.Matrix4()) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(p.rx || 0, p.yaw || 0, p.rz || 0, 'YXZ'));
  return out.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(p.w, p.h, p.d));
}

/** Parts -> placed parts: the model at (x, y, z) turned by yaw (each part carries a full `matrix`). */
export function placeModel(THREE, parts, x = 0, y = 0, z = 0, yaw = 0) {
  const M = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1));
  return parts.map(p => ({ mesh: p.mesh, colour: p.colour, tag: p.tag, matrix: new THREE.Matrix4().multiplyMatrices(M, partMatrix(THREE, p)) }));
}

/** Placed parts ({mesh, colour, matrix} or raw parts) -> one InstancedMesh per mesh kind. */
export function instanceParts(THREE, parts, material) {
  const by = new Map();
  for (const p of parts) { if (!by.has(p.mesh)) by.set(p.mesh, []); by.get(p.mesh).push(p); }
  const out = [], col = new THREE.Color(), m4 = new THREE.Matrix4();
  for (const [kind, list] of by) {
    const im = new THREE.InstancedMesh(unitGeometry(THREE, kind), material, list.length);
    list.forEach((p, i) => { im.setMatrixAt(i, p.matrix || partMatrix(THREE, p, m4)); im.setColorAt(i, col.set(p.colour)); });
    im.name = 'propkit-' + kind; im.castShadow = im.receiveShadow = true;
    im.computeBoundingSphere();
    out.push(im);
  }
  return out;
}
