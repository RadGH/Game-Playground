// Tree Kit — plant many trees cheaply: one bark + one leaf-card + one tuft draw per (tree, look), instanced, the way
// Oathwild's js/client/render/trees.js draws a world. For pages and small games; Oathwild keeps its own (tiles, blocks).
//
//   const forest = await plantTrees(list, { lod, cheap, wind, looks, species })
//     list    [{ id, x, z, y?, rot?, h }]   id = a species id, h = metres tall as drawn
//     looks   how many seeds per species (2 = the game's Medium/High)
//     species { id: parts } to draw instead of data/species.json (the page's unsaved edits)
//   forest.group (add it to a scene)   forest.stats → { trees, meshes, triangles }   forest.dispose()
import * as THREE from 'three';
import { buildStoryTree } from './build.js';
import { tuftAtlas } from './tufts.js';
import { treeMaterials } from './materials.js';

const LOOK_SEED = look => 11 + look * 37;      // the game's seeds (Oathwild trees.js)
const lookOf = (x, z, n) => Math.floor(Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1 * n);

export async function plantTrees(list, { lod = 1, cheap = false, wind = null, looks = 2, species = null, shadows = true } = {}) {
  const mats = await treeMaterials({ cheap, wind });
  const group = new THREE.Group(); group.name = 'treekit forest';
  const built = new Map(), geos = [];
  const geoFor = (id, look) => {
    const k = id + '#' + look;
    if (!built.has(k)) {
      const t = buildStoryTree(id, { seed: LOOK_SEED(look), lod, tufts: tuftAtlas(), species: species?.[id] || null });
      for (const g of [t.bark, t.foliage, t.tufts]) if (g) geos.push(g);
      built.set(k, t);
    }
    return built.get(k);
  };
  const groups = new Map();
  for (const t of list) {
    const k = t.id + '|' + lookOf(t.x, t.z, looks);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(t);
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  let meshes = 0, triangles = 0;
  for (const [k, items] of groups) {
    const [id, look] = k.split('|');
    const g = geoFor(id, +look);
    const parts = [[g.bark, mats.bark, mats.barkDepth], [g.foliage, mats.leaf, mats.leafDepth], [g.tufts, mats.tuft.color, mats.tuft.depth]];
    for (const [geo, mat, depth] of parts) {
      if (!geo) continue;
      const m = new THREE.InstancedMesh(geo, mat, items.length);
      if (depth) m.customDepthMaterial = depth;
      items.forEach((t, i) => { q.setFromAxisAngle(up, t.rot || 0); s.setScalar(t.h / g.height); p.set(t.x, (t.y || 0) - 0.15, t.z); m4.compose(p, q, s); m.setMatrixAt(i, m4); });
      m.castShadow = shadows; m.receiveShadow = true; m.computeBoundingSphere(); m.name = 'tree ' + id;
      group.add(m); meshes++;
      triangles += (geo.index ? geo.index.count : geo.attributes.position.count) / 3 * items.length;
    }
  }
  return {
    group, built,
    stats: { trees: list.length, meshes, triangles: Math.round(triangles) },
    dispose() { group.removeFromParent(); for (const g of geos) g.dispose(); for (const m of group.children) m.dispose?.(); },
  };
}
