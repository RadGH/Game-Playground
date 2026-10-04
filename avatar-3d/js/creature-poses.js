// Creature STATIC POSES for crowds drawn as InstancedMesh (2026-10-03, Bannerline Hunters vs Farmers).
//
// A game with hundreds of animals cannot afford a skeleton each. It draws one InstancedMesh per
// species and pose instead, and moves the instances. This bakes a creature built by
// `createCreature` into plain geometry at a chosen clip and moment: one BufferGeometry with
// position, normal and colour (each piece's material colour moved onto its vertices; glowing
// pieces keep their glow by being brightened), in the creature's own space (+z forward, feet at y 0).
//
//   import { creaturePoses, bakeCreaturePose, POSE_SET } from '../../avatar-3d/js/creature-poses.js';
//   const poses = await creaturePoses({ type: 'sheep' });       // { idle, walkA, walkB, graze, run, bleat, dead } -> BufferGeometry
//   const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
//   const flock = new THREE.InstancedMesh(poses.graze, mat, 200);
//
// Swapping an instance between the walkA / walkB meshes a few times a second reads as walking at RTS
// zoom; a vertex-shader bob on top is enough for the rest. Cost: one draw call per (species, pose).

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createCreature } from './creatures.js';

/** The default poses: [clip, seconds into the clip]. */
export const POSE_SET = {
  idle: ['idle', 0.4],
  walkA: ['walk', 0.0], walkB: ['walk', Math.PI / 6.5],          // half a stride apart
  run: ['run', 0.12],
  graze: ['graze', 2.0],
  bleat: ['bleat', 0.45],
  attack: ['attack', 0.3],
  dead: ['dead', 0],
};

/** Bake whatever pose `actor` (a createCreature result) is in now. Returns a BufferGeometry. */
export function bakeCreaturePose(actor) {
  const root = actor.group; root.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const parts = [], m = new THREE.Matrix4();
  root.traverse(o => {
    if (!o.isMesh || !o.visible || o.isSkinnedMesh) return;
    let hidden = false; for (let p = o.parent; p && p !== root; p = p.parent) if (!p.visible) hidden = true;
    if (hidden) return;
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    if (mat?.transparent && mat.opacity < 0.5) return;
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    m.multiplyMatrices(toRoot, o.matrixWorld); g.applyMatrix4(m);
    if (m.determinant() < 0) { const p = g.attributes.position.array; for (let i = 0; i < p.length; i += 9) for (let k = 0; k < 3; k++) { const t = p[i + 3 + k]; p[i + 3 + k] = p[i + 6 + k]; p[i + 6 + k] = t; } g.computeVertexNormals(); }
    const c = (mat?.color || new THREE.Color(1, 1, 1)).clone();
    if (mat?.emissive && mat.emissiveIntensity > 0.3) c.lerp(new THREE.Color(1, 1, 1), 0.25).multiplyScalar(1.15);
    const n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (!g.attributes.normal) g.computeVertexNormals();
    parts.push(g);
  });
  const out = mergeGeometries(parts); for (const p of parts) p.dispose();
  out.computeBoundingBox(); out.computeBoundingSphere();
  return out;
}

/**
 * Build `spec` once and bake every pose in `poses` (default POSE_SET; clips a plan lacks fall back
 * to its idle). `size` in the spec is applied. `detail` (default 0.35) is the creature builder's
 * segment scale: a sheep is ~1.7k triangles at 0.35 against ~8k at 1. Returns { [name]: BufferGeometry, height }.
 */
export async function creaturePoses(spec, { poses = POSE_SET, detail = 0.35 } = {}) {
  const c = await createCreature(spec, { detail }), out = {};
  for (const [name, [clip, at]] of Object.entries(poses)) {
    c.setAnim('idle'); c.update(0.001, 0.001);
    c.setAnim(clip); c.update(Math.max(0.001, at), at);
    out[name] = bakeCreaturePose(c);
  }
  out.height = out.idle ? out.idle.boundingBox.max.y : 1;
  c.dispose();
  return out;
}
