// Oathwild's trees: BIG storybook trees (owner 2026-11-24: "Think Skyrim or WoW, trees 10-15 times taller than you …
// Big trees better" and "no small leaves — see Thousandvale"). Sizes are data in treekit/data/species.json (read by
// js/world/scatter.js TREE_SPECIES; trunk + crown MEASURED from the drawn tree), so the trunk a player walks round on the
// server is the trunk drawn here. The tree itself is the Tree Kit's storybook builder (treekit/js/build.js: a few big
// leaf clumps, the same tree at every distance), drawn instanced: per tile, per species and look, one bark mesh + one
// leaf mesh + one tuft mesh sharing the same instance matrices.
//
//   const trees = await createTrees({ trees: scattered.trees, tileGroup(x, z) → the world tile group there, cell, quality })
//   trees.stats → { trees, meshes, triangles }
// The builder, the tufts and the materials are the Tree Kit's (treekit/, one copy; numbers in treekit/data/species.json);
// every tree bends in the ONE wind (./wind.js) on the graphics card — trunks from the base, branches, leaf flutter.
import * as THREE from 'three';
import { buildStoryTree } from '../../../../../treekit/js/build.js';
import { tuftAtlas } from '../../../../../treekit/js/tufts.js';
import { treeMaterials } from '../../../../../treekit/js/materials.js';
import { STORY_TREES } from './story-trees-data.js';
import { TREE_SPECIES, UNDERSTORY_SPECIES } from '../../world/scatter.js';
import { wind } from './wind.js';
// trees, saplings and shrubs share one renderer (one leaf look for the whole world); understory has no collider
const SPECIES = { ...TREE_SPECIES, ...UNDERSTORY_SPECIES };

// each species is built from two seeds, picked by spot, so a wood is not one tree; Low draws one (half the draw calls)
const LOOKS_BY_Q = { low: 1, medium: 2, high: 2 };
// shrub kinds differ only in size and tint: below High they share one group (draw calls on phones; environment round)
const SHRUB_AS = { shrub_tall: 'shrub', shrub_dry: 'shrub', shrub_berry: 'shrub' };
// trees are grouped in `cell`-metre blocks (bigger than the world's tiles: fewer, larger draws — a phone pays per draw)
export async function createTrees({ trees = [], tileGroup, cell = 128, quality = 'medium' }) {
  const cheap = quality === 'low', LOOKS = LOOKS_BY_Q[quality] ?? 2;
  const lod = quality === 'high' ? 0 : quality === 'medium' ? 1 : 2;   // story-trees: 0 near-detail, 2 two cards a clump
  const mats = await treeMaterials({ cheap, wind });
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
    if (bark && mats.barkDepth) bark.customDepthMaterial = mats.barkDepth;
    if (leaf) leaf.customDepthMaterial = mats.leafDepth;
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
    update() {},   // the wind runs on the graphics card from ./wind.js (render/world.js calls wind.update)
    stats: { trees: count, meshes, triangles: Math.round(triangles) },
  };
}
