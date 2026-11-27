// World Build fly view — trees for a streamed tile: Oathwild's BIG storybook trees (story-trees.js + tufts.js, sizes
// from scatter.js TREE_SPECIES; lessons rules 74 and 77), instanced per tile and species. Two detail levels of the
// SAME textured tree: near tiles use the near build, far tiles the far build and only the grown trees (a cheaper view
// draws fewer or simpler copies, never a stand-in). Geometry per species and level is built once and shared.
//
//   const TR = await treeKit({ quality })
//   const g = TR.tileGroup(packed, species, { far })   packed = Float32 [x, y, z, rot, h, speciesIndex]…  → THREE.Group
//   g.userData.stats = { trees, meshes, triangles, bytes }

import * as THREE from 'three';
import { buildStoryTree } from '../../../prototypes/oathwild/js/client/render/story-trees.js';
import { tuftAtlas, tuftMaterials } from '../../../prototypes/oathwild/js/client/render/tufts.js';
import { STORY_TREES } from '../../../prototypes/oathwild/js/client/render/story-trees-data.js';
import { TREE_SPECIES } from '../../../prototypes/oathwild/js/world/scatter.js';
import { loadFoliageAtlas, makeSurface } from '../../../highdef-3d/js/kit/textures.js';

export async function treeKit({ quality = 'medium' } = {}) {
  const atlas = await loadFoliageAtlas();
  const tuft = tuftMaterials(tuftAtlas(), { cheap: quality === 'low' });
  const bark = makeSurface('bark_pine', { size: 256, seed: 3 });
  bark.map.wrapS = bark.map.wrapT = THREE.RepeatWrapping;
  const mats = {
    tuft,
    bark: new THREE.MeshLambertMaterial({ map: bark.map, vertexColors: true }),
    leaf: new THREE.MeshLambertMaterial({ map: atlas.texture, alphaTest: 0.35, side: THREE.DoubleSide, vertexColors: true, emissive: '#1c2a12', emissiveMap: atlas.texture, emissiveIntensity: 0.5 }),
  };
  const nearLod = quality === 'high' ? 0 : 1;
  const built = new Map();
  const geo = (story, far) => {
    const k = story + (far ? '|far' : '|near');
    if (!built.has(k)) built.set(k, buildStoryTree(story, { seed: 11, lod: far ? 2 : nearLod, tufts: tuftAtlas() }));
    return built.get(k);
  };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  function tileGroup(packed, species, { far = false, minH = 0 } = {}) {
    const groups = new Map();
    for (let i = 0; i < packed.length; i += 6) {
      const art = species[packed[i + 5]], sp = TREE_SPECIES[art];
      if (!sp || !STORY_TREES[sp.story] || packed[i + 4] < minH) continue;
      if (!groups.has(sp.story)) groups.set(sp.story, []);
      groups.get(sp.story).push(i);
    }
    const g = new THREE.Group();
    let meshes = 0, triangles = 0, count = 0, bytes = 0;
    for (const [story, idx] of groups) {
      const G = geo(story, far), native = G.height || STORY_TREES[story].h;
      const parts = [[G.bark, mats.bark], [G.foliage, mats.leaf], [G.tufts, mats.tuft.color]];
      for (const [geom, mat] of parts) {
        if (!geom) continue;
        const im = new THREE.InstancedMesh(geom, mat, idx.length);
        idx.forEach((i, n) => {
          q.setFromAxisAngle(up, packed[i + 3]); s.setScalar(packed[i + 4] / native); p.set(packed[i], packed[i + 1] - 0.15, packed[i + 2]);
          im.setMatrixAt(n, m4.compose(p, q, s));
        });
        if (mat === mats.tuft.color) im.customDepthMaterial = mats.tuft.depth;
        im.computeBoundingSphere();
        im.castShadow = false; im.receiveShadow = false;
        im.name = `trees ${story}${far ? ' far' : ''}`;
        g.add(im);
        meshes++; bytes += idx.length * 64;
        triangles += (geom.index ? geom.index.count : geom.attributes.position.count) / 3 * idx.length;
      }
      count += idx.length;
    }
    g.userData.stats = { trees: count, meshes, triangles: Math.round(triangles), bytes };
    return g;
  }
  return { tileGroup, dispose() { for (const G of built.values()) for (const x of [G.bark, G.foliage, G.tufts]) x?.dispose?.(); } };
}
