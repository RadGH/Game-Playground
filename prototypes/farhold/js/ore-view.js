// Farhold — the seams, drawn.
//
// js/resources.js decides what is in the ground and js/mining.js decides how fast it comes out;
// neither of them can be seen. A seam you cannot see is a seam nobody mines, so this is the part
// that puts a rock on the grass.
//
// One InstancedMesh per node kind, the same discipline js/props.js and js/features.js keep: a
// hundred outcrops is one draw call, not a hundred. The instances are refilled when the player has
// moved far enough to change what is in range, rather than every frame — the node field only
// changes when a tile is crossed or a seam is worked out.
//
//   import { createOreView } from './ore-view.js';
//   const view = createOreView(scene, { data });
//   view.update(ore.around(x, z), x, z);
//   view.dispose();

import * as THREE from 'three';

/**
 * A shape per kind, because "ore" is nine different things.
 *
 * Deliberately low-poly and slightly wrong-looking: a seam has to read as INTERACTIVE from thirty
 * metres, which means it must not look like the scattered boulders js/props.js already puts down in
 * their thousands. A faint emissive tint does most of that work.
 */
const SHAPES = {
  ore_outcrop: () => new THREE.DodecahedronGeometry(1.1, 0),
  deep_vein: () => new THREE.DodecahedronGeometry(1.35, 0),
  boulder: () => new THREE.DodecahedronGeometry(0.9, 0),
  quarry_face: () => new THREE.BoxGeometry(3.4, 2.2, 2.6),
  clay_bank: () => new THREE.CylinderGeometry(1.9, 2.4, 1.1, 7),
  sand_bar: () => new THREE.CylinderGeometry(2.4, 2.8, 0.5, 8),
  tree: () => new THREE.ConeGeometry(1.5, 4.5, 6),
  fibre_patch: () => new THREE.ConeGeometry(1.0, 1.2, 5),
  crystal_spire: () => new THREE.ConeGeometry(0.8, 3.2, 5),
  obsidian_flow: () => new THREE.DodecahedronGeometry(1.6, 0),
  ice_field: () => new THREE.BoxGeometry(3.0, 0.9, 3.0),
  water_source: () => new THREE.CylinderGeometry(2.6, 2.6, 0.2, 10),
  gas_vent: () => new THREE.CylinderGeometry(0.7, 1.4, 1.6, 7),
  rare_seam: () => new THREE.OctahedronGeometry(1.4, 0),
};

/** What each kind looks like when it is the thing you walked over to dig. */
const LOOKS = {
  ore_outcrop: { color: '#7d6a55', glow: '#c08a3e', rough: 0.9 },
  deep_vein: { color: '#5d5348', glow: '#c08a3e', rough: 0.9 },
  boulder: { color: '#6e6a66', glow: '#000000', rough: 0.95 },
  quarry_face: { color: '#8a857c', glow: '#000000', rough: 0.95 },
  clay_bank: { color: '#8d6a4c', glow: '#000000', rough: 0.98 },
  sand_bar: { color: '#c8b48a', glow: '#000000', rough: 1 },
  tree: { color: '#3f5c33', glow: '#000000', rough: 0.95 },
  fibre_patch: { color: '#7d8f4a', glow: '#000000', rough: 1 },
  crystal_spire: { color: '#7fc7e8', glow: '#2f7fa8', rough: 0.3 },
  obsidian_flow: { color: '#26242c', glow: '#5a2a6a', rough: 0.35 },
  ice_field: { color: '#b8dcea', glow: '#3f7f9a', rough: 0.25 },
  water_source: { color: '#3f7fa8', glow: '#1a4f68', rough: 0.2 },
  gas_vent: { color: '#6a6f5a', glow: '#8ab04a', rough: 0.8 },
  rare_seam: { color: '#b79cf5', glow: '#7a4fd0', rough: 0.4 },
};
const FALLBACK = { color: '#7d6a55', glow: '#c08a3e', rough: 0.9 };

const CAP = 220;         // per kind, in view. More than that and you cannot see the ground anyway.

export function createOreView(scene, { data = {} } = {}) {
  const root = new THREE.Group();
  root.name = 'farhold-ore';
  scene.add(root);

  /** kind -> InstancedMesh, built the first time that kind is actually seen. */
  const meshes = new Map();
  const dummy = new THREE.Object3D();
  let lastAt = null;

  function meshFor(kind) {
    let m = meshes.get(kind);
    if (m) return m;
    const geo = (SHAPES[kind] || SHAPES.ore_outcrop)();
    const look = LOOKS[kind] || FALLBACK;
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(look.color),
      // the faint glow is what separates a SEAM from the scenery boulders props.js already scatters
      emissive: new THREE.Color(look.glow),
      emissiveIntensity: 0.35,
      roughness: look.rough,
      metalness: 0.05,
    });
    m = new THREE.InstancedMesh(geo, mat, CAP);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.castShadow = true;
    m.receiveShadow = true;
    m.count = 0;
    m.frustumCulled = false;
    meshes.set(kind, m);
    root.add(m);
    return m;
  }

  return {
    root,
    /**
     * Put the seams in range on the ground.
     *
     * `heightAt` comes in rather than the terrain, so a seam sits on the EDITED ground: level a
     * patch under an outcrop and the outcrop comes down with it instead of floating.
     */
    update(nodes, x, z, { heightAt = null, radius = 260 } = {}) {
      // only redo the work when the player has actually gone somewhere
      if (lastAt && Math.hypot(lastAt.x - x, lastAt.z - z) < 12 && lastAt.n === nodes.length) return;
      lastAt = { x, z, n: nodes.length };

      const counts = new Map();
      for (const m of meshes.values()) m.count = 0;

      for (const n of nodes) {
        if (n.gone) continue;
        const away = Math.hypot(n.x - x, n.z - z);
        if (away > radius) continue;
        const kind = n.rare ? 'rare_seam' : n.kind;
        const m = meshFor(kind);
        const i = counts.get(kind) || 0;
        if (i >= CAP) continue;

        const y = heightAt ? heightAt(n.x, n.z) : 0;
        dummy.position.set(n.x, y, n.z);
        // a worked-out seam shrinks rather than vanishing, so you can see you have been here
        const wear = n.depleted ? 0.45 : 1;
        const s = (n.radius || 2) / 2;
        dummy.scale.set(s * wear, s * wear * (n.depleted ? 0.5 : 1), s * wear);
        // one stable rotation per seam, from its own coordinates, so it does not spin as you walk
        dummy.rotation.set(0, (n.x * 0.7 + n.z * 1.3) % (Math.PI * 2), 0);
        dummy.updateMatrix();
        m.setMatrixAt(i, dummy.matrix);
        counts.set(kind, i + 1);
      }

      for (const [kind, n] of counts) {
        const m = meshes.get(kind);
        m.count = n;
        m.instanceMatrix.needsUpdate = true;
      }
    },
    /** Force the next update to do the work — after a terrain edit, or a save load. */
    invalidate() { lastAt = null; },
    setVisible(on) { root.visible = !!on; },
    stats() { return { kinds: meshes.size, drawn: [...meshes.values()].reduce((a, m) => a + m.count, 0) }; },
    dispose() {
      for (const m of meshes.values()) { m.geometry.dispose(); m.material.dispose(); }
      meshes.clear();
      root.removeFromParent();
    },
  };
}
