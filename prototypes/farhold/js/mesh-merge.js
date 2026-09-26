// R27 M8 — one draw call per moving part of a beast, not one per bead.
//
// WHY THIS EXISTS. avatar-3d/js/creatures.js builds a beast out of primitives — a capsule for the
// torso, one for the belly, a sphere per eye, one per pupil, a cone per ear, a cone per inner ear,
// three per toe — and every one of them is its own Mesh with its own material. That is the right
// way to WRITE a creature, and it is shared with Emberveil (read-only for Farhold). It is also one
// draw call per bead: the horse main.js builds at boot parks beside the player and was 34 of the
// 104 draw calls in the whole landing scene on seed 7 (tests/phase2.spec.js budget: under 95).
//
// A creature animates by turning GROUPS (a hip, a knee, a neck, a jaw, a tail segment). The meshes
// hanging off a group move with it and never on their own — with a few exceptions (a floating
// elemental's orbiting shards, a pulsing heart whose glow is animated, a snake's tongue that is
// shown and hidden). Which ones those are is closure-private to creatures.js, so rather than guess
// from names this PROBES: it plays every clip for a while, and any leaf mesh whose own transform,
// visibility or material changed is left exactly as it was. Every other leaf of the same material
// kind goes into ONE skinned mesh whose bones are the groups themselves (see the fold below), the
// colour of each piece moved onto its vertices. The picture is the same; a beast is one or two
// draw calls instead of thirty-odd.
//
// Pure three.js arithmetic, so tests/round27-roadside.test.js builds a real creature in node and
// compares the merged vertices against the originals.

import * as THREE from 'three';

/** Every clip a beast has, in any plan. An unknown name is simply held as the pose it was in. */
const PROBE_CLIPS = ['idle', 'walk', 'run', 'attack', 'talk', 'fly', 'dead', 'idle'];

/** Material fields that have to match for two pieces to share one material. Colour is NOT one. */
function signature(m, mesh) {
  const e = m.emissive ? m.emissive.getHexString() : '-';
  return [m.type, m.roughness, m.metalness, e, m.emissiveIntensity, m.side, m.transparent, m.opacity,
    m.flatShading, m.depthWrite, !!mesh.castShadow, !!mesh.receiveShadow, mesh.renderOrder].join('|');
}

/** A leaf we are allowed to fold: a plain mesh, one standard material, no children, no map. */
function foldable(o) {
  if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || o.children.length) return false;
  const m = o.material;
  if (!m || Array.isArray(m) || !(m.isMeshStandardMaterial || m.isMeshLambertMaterial)) return false;
  if (m.map || m.vertexColors || m.alphaMap || m.normalMap) return false;
  const g = o.geometry;
  return !!(g && g.attributes.position && g.attributes.normal && !g.morphAttributes?.position);
}

/** What the probe compares: everything an animation could change about a leaf on its own. */
function snap(o) {
  const m = o.material;
  return [...o.position.toArray(), ...o.quaternion.toArray(), ...o.scale.toArray(), o.visible,
    m.opacity, m.emissiveIntensity, m.color?.getHex(), m.emissive?.getHex()].join(',');
}

/**
 * Fold a beast built by `createCreature` in place. Returns `{ before, after, live }` — the leaf
 * mesh count before, the mesh count after, and how many leaves the probe found moving on their own.
 * Safe to call on anything: a humanoid (skinned) has nothing foldable and is left alone.
 */
export function compactCreature(actor) {
  const root = actor?.group;
  if (!root) return { before: 0, after: 0, live: 0 };
  const leaves = [];
  root.traverse(o => { if (foldable(o)) leaves.push(o); });
  if (leaves.length < 2) return { before: leaves.length, after: leaves.length, live: 0 };

  // the probe: play every clip, and remember any leaf that moved, blinked or glowed on its own
  const first = new Map(leaves.map(o => [o, snap(o)]));
  const live = new Set();
  if (typeof actor.update === 'function' && typeof actor.setAnim === 'function') {
    // everything the clips can touch, so the probe leaves the body exactly as it found it
    const kept = [];
    root.traverse(o => {
      const m = o.isMesh && !Array.isArray(o.material) ? o.material : null;
      kept.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone(), o.visible,
        m && [m.opacity, m.emissiveIntensity, m.color?.clone(), m.emissive?.clone()]]);
    });
    const anim0 = actor.anim;
    const groups0 = [];
    root.traverse(o => { if (!o.isMesh && o !== root) groups0.push([o, o.visible]); });
    let t = 0;
    for (const clip of PROBE_CLIPS) {
      try { actor.setAnim(clip); } catch { continue; }
      for (let i = 0; i < 14; i++) {
        const dt = 0.037 + (i % 5) * 0.029;
        t += dt;
        actor.update(dt, t);
        for (const o of leaves) if (!live.has(o) && snap(o) !== first.get(o)) live.add(o);
        // a GROUP that is shown and hidden cannot become a bone: a bone does not hide its vertices
        for (const [g, vis] of groups0) if (g.visible !== vis) g.traverse(c => { if (c.isMesh) live.add(c); });
      }
    }
    for (const [o, p, q, sc, vis, m] of kept) {
      o.position.copy(p); o.quaternion.copy(q); o.scale.copy(sc); o.visible = vis;
      if (m) {
        o.material.opacity = m[0]; o.material.emissiveIntensity = m[1];
        if (m[2]) o.material.color.copy(m[2]);
        if (m[3]) o.material.emissive.copy(m[3]);
      }
    }
    if (anim0) actor.setAnim(anim0);
  }

  /**
   * THE FOLD: ONE SKINNED MESH PER MATERIAL KIND. Every leaf that stayed still relative to its
   * parent is baked, at the pose it was built in, into one geometry, and each of its vertices is
   * tied (weight 1) to the group it hung from — which becomes that vertex's BONE. Nothing about the
   * animation changes: creatures.js keeps turning the same groups, and the skeleton reads their
   * world matrices every frame, so a knee still bends the shin below it. A beast is one or two draw
   * calls (a glowing eye is a different material) instead of one per moving part.
   */
  const kinds = new Map();
  for (const o of leaves) {
    if (live.has(o) || !o.visible) continue;
    const key = signature(o.material, o);
    if (!kinds.has(key)) kinds.set(key, []);
    kinds.get(key).push(o);
  }
  root.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  let removed = 0, added = 0;
  for (const list of kinds.values()) {
    if (list.length < 2) continue;
    const bones = [...new Set(list.map(o => o.parent))];
    const pos = [], nor = [], col = [], skinIndex = [], skinWeight = [];
    const p = new THREE.Vector3(), n = new THREE.Vector3(), m = new THREE.Matrix4(), nm = new THREE.Matrix3();
    for (const o of list) {
      m.multiplyMatrices(toRoot, o.matrixWorld);        // leaf -> the actor's own space, at bind
      nm.getNormalMatrix(m);
      const flip = m.determinant() < 0;
      const g = o.geometry, P = g.attributes.position, N = g.attributes.normal;
      const c = o.material.color || new THREE.Color(1, 1, 1);
      const bone = bones.indexOf(o.parent);
      const idx = g.index ? g.index.array : null;
      const tris = idx ? idx.length : P.count;
      for (let t = 0; t + 2 < tris; t += 3) {
        for (const k of flip ? [0, 2, 1] : [0, 1, 2]) {
          const v = idx ? idx[t + k] : t + k;
          p.fromBufferAttribute(P, v).applyMatrix4(m);
          n.fromBufferAttribute(N, v).applyMatrix3(nm).normalize();
          pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z); col.push(c.r, c.g, c.b);
          skinIndex.push(bone, 0, 0, 0); skinWeight.push(1, 0, 0, 0);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
    geo.computeBoundingSphere();
    const mat = list[0].material.clone();
    mat.color = new THREE.Color(1, 1, 1);
    mat.vertexColors = true;
    const skinned = new THREE.SkinnedMesh(geo, mat);
    skinned.name = 'merged-leaves';
    skinned.castShadow = list[0].castShadow;
    skinned.receiveShadow = list[0].receiveShadow;
    skinned.renderOrder = list[0].renderOrder;
    // the bind pose moves with the beast; its bounds are not worth recomputing every frame
    skinned.frustumCulled = false;
    root.add(skinned);
    skinned.updateMatrixWorld(true);
    skinned.bind(new THREE.Skeleton(bones), skinned.matrixWorld);
    for (const o of list) {
      o.parent.remove(o);
      o.geometry.dispose();
      o.material.dispose();
    }
    removed += list.length; added++;
  }
  return { before: leaves.length, after: leaves.length - removed + added, live: live.size };
}
