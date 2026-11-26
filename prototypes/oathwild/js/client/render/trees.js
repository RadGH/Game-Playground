// Oathwild's trees: BIG storybook trees (owner 2026-11-24: "Think Skyrim or WoW, trees 10-15 times taller than you …
// Big trees better" and "no small leaves — see Thousandvale"). Sizes are data in js/world/scatter.js TREE_SPECIES, so
// the trunk a player walks round on the server is the trunk drawn here. The tree itself is Thousandvale's storybook
// builder (story-trees.js: a few big leaf clumps, the same tree at every distance), drawn instanced: per tile, per
// species and look, one bark mesh + one leaf mesh sharing the same instance matrices.
//
//   const trees = await createTrees({ trees: scattered.trees, tileGroup(x, z) → the world tile group there, cell, quality })
//   trees.update(t)    advance the wind (seconds)      trees.stats → { trees, meshes, triangles }
import * as THREE from 'three';
import { buildStoryTree } from './story-trees.js';
import { tuftAtlas, tuftMaterials } from './tufts.js';
import { STORY_TREES } from './story-trees-data.js';
import { TREE_SPECIES, UNDERSTORY_SPECIES } from '../../world/scatter.js';
// trees, saplings and shrubs share one renderer (one leaf look for the whole world); understory has no collider
const SPECIES = { ...TREE_SPECIES, ...UNDERSTORY_SPECIES };
import { loadFoliageAtlas, makeSurface } from '../../../../../highdef-3d/js/kit/textures.js';

const wind = { value: 0 };
// leaves (and, a little, trunks) sway with one shared clock; each tree gets its own phase (copied from Thousandvale decor.js)
function addWind(material, amount) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, r) => {
    if (prev) prev(shader, r);
    shader.uniforms.uWindT = wind;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aWind; uniform float uWindT;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          float ph = aWind.y * 6.2831;
          #ifdef USE_INSTANCING
            ph += instanceMatrix[3].x * 0.13 + instanceMatrix[3].z * 0.11;
          #endif
          float s = sin(uWindT * 1.7 + ph) * 0.6 + sin(uWindT * 3.1 + ph * 1.7) * 0.25;
          transformed.x += s * aWind.x * ${amount.toFixed(3)};
          transformed.z += s * aWind.x * ${(amount * 0.6).toFixed(3)};
        }`);
  };
  return material;
}
// a leaf card keeps the normal it was given on both faces (a clump lights like one soft ball — Thousandvale 2026-10-20)
function twoSidedLeaf(material) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, r) => {
    if (prev) prev(shader, r);
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>',
      '#include <normal_fragment_begin>\n#ifdef DOUBLE_SIDED\n  normal *= faceDirection; nonPerturbedNormal = normal;\n#endif');
  };
  material.customProgramCacheKey = () => 'ow-leaf-2side';
  return material;
}
async function materials(cheap) {
  const atlas = await loadFoliageAtlas();
  // the fluffy leaf tufts (tufts.js): every broadleaf / pine crown; the old cards stay for skirts, strands and fronds
  const tuft = tuftMaterials(tuftAtlas(), { cheap, wind: (m, a) => (cheap ? m : addWind(m, a)) });
  const bark = makeSurface('bark_pine', { size: 256, seed: 3 });
  bark.map.wrapS = bark.map.wrapT = THREE.RepeatWrapping;
  return cheap ? {
    tuft, bark: new THREE.MeshLambertMaterial({ map: bark.map, vertexColors: true }),
    leaf: twoSidedLeaf(new THREE.MeshLambertMaterial({ map: atlas.texture, alphaTest: 0.35, side: THREE.DoubleSide, vertexColors: true, emissive: '#1c2a12', emissiveMap: atlas.texture, emissiveIntensity: 0.5 })),
  } : {
    tuft, bark: addWind(new THREE.MeshStandardMaterial({ map: bark.map, vertexColors: true, roughness: 0.95 }), 0.25),
    leaf: twoSidedLeaf(addWind(new THREE.MeshStandardMaterial({ map: atlas.texture, alphaTest: 0.3, side: THREE.DoubleSide, vertexColors: true, roughness: 0.85, emissive: '#1c2a12', emissiveMap: atlas.texture, emissiveIntensity: 0.55 }), 0.5)),
  };
}

// each species is built from two seeds, picked by spot, so a wood is not one tree; Low draws one (half the draw calls)
const LOOKS_BY_Q = { low: 1, medium: 2, high: 2 };
// shrub kinds differ only in size and tint: below High they share one group (draw calls on phones; environment round)
const SHRUB_AS = { shrub_tall: 'shrub', shrub_dry: 'shrub', shrub_berry: 'shrub' };
// trees are grouped in `cell`-metre blocks (bigger than the world's tiles: fewer, larger draws — a phone pays per draw)
export async function createTrees({ trees = [], tileGroup, cell = 128, quality = 'medium' }) {
  const cheap = quality === 'low', LOOKS = LOOKS_BY_Q[quality] ?? 2;
  const lod = quality === 'high' ? 0 : quality === 'medium' ? 1 : 2;   // story-trees: 0 near-detail, 2 two cards a clump
  const mats = await materials(cheap);
  const built = new Map();             // `${species}#${look}` → { bark, foliage, height }
  const geoFor = (species, look) => {
    const k = `${species}#${look}`;
    if (!built.has(k)) built.set(k, buildStoryTree(species, { seed: 11 + look * 37, lod, tufts: tuftAtlas() }));
    return built.get(k);
  };
  const groups = new Map();
  for (const t of trees) {
    const sp = SPECIES[t.art];
    if (!sp || !STORY_TREES[sp.story]) continue;
    const story = quality !== 'high' && SHRUB_AS[sp.story] ? SHRUB_AS[sp.story] : sp.story;
    const look = Math.floor(Math.abs(Math.sin(t.x * 12.9898 + t.z * 78.233) * 43758.5453) % 1 * LOOKS);
    const k = `${Math.floor(t.x / cell)},${Math.floor(t.z / cell)}|${story}|${look}|${sp.shadow === false ? 0 : 1}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(t);
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  let meshes = 0, triangles = 0, count = 0;
  for (const [k, items] of groups) {
    const [tile, species, look, shadow] = k.split('|');
    const shrub = species.startsWith('shrub');
    const g = geoFor(species, Number(look));
    const native = g.height || STORY_TREES[species].h;
    const bark = shrub ? null : new THREE.InstancedMesh(g.bark, mats.bark, items.length);   // a shrub's stub never shows
    const leaf = g.foliage ? new THREE.InstancedMesh(g.foliage, mats.leaf, items.length) : null;
    const tuft = g.tufts ? new THREE.InstancedMesh(g.tufts, mats.tuft.color, items.length) : null;
    if (tuft) tuft.customDepthMaterial = mats.tuft.depth;
    items.forEach((t, i) => {
      const k2 = (t.h || SPECIES[t.art].h) / native;          // drawn exactly as tall as scatter.js says
      q.setFromAxisAngle(up, t.rot || 0); s.setScalar(k2); p.set(t.x, t.y - 0.15, t.z); m4.compose(p, q, s);
      bark?.setMatrixAt(i, m4); leaf?.setMatrixAt(i, m4); tuft?.setMatrixAt(i, m4);
    });
    for (const m of [bark, leaf, tuft]) {
      if (!m) continue;
      m.castShadow = shadow === '1'; m.receiveShadow = true;   // small clutter casts no shadow (cheaper, and no speckle)
      m.computeBoundingSphere(); m.name = `tree ${species}`;
      const [i, j] = tile.split(',').map(Number);
      tileGroup((i + 0.5) * cell, (j + 0.5) * cell).add(m); meshes++;
      triangles += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3 * items.length;
    }
    count += items.length;
  }
  return {
    update(t) { wind.value = t; },
    stats: { trees: count, meshes, triangles: Math.round(triangles) },
  };
}
