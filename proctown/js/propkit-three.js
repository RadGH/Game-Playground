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
