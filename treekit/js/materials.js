// Tree Kit — the materials every tree is drawn with (moved from Oathwild's js/client/render/trees.js 2026-11-26, so the
// Tree Kit page and the game draw a tree the same way): the bark picture, the kit's leaf atlas for cards (willow
// strands, palm and fern fronds), the painted fluffy tufts (js/tufts.js), and their shadow materials. With `wind` every
// one of them bends in that wind (js/wind.js — uniforms only, no shader rebuild when the wind changes).
//
//   const mats = await treeMaterials({ cheap, wind })   → { bark, leaf, tuft: { color, depth }, barkDepth, leafDepth }
//   cheap = Lambert lighting (Low graphics); wind = a createWind() object, or null for still trees
import * as THREE from 'three';
import { loadFoliageAtlas, makeSurface } from '../../highdef-3d/js/kit/textures.js';
import { tuftAtlas, tuftMaterials } from './tufts.js';
import { applyTreeWind } from './wind.js';

/** A leaf card keeps the normal it was given on both faces (a clump lights like one soft ball — Thousandvale 2026-10-20). */
function twoSidedLeaf(material) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, r) => {
    if (prev) prev(shader, r);
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>',
      '#include <normal_fragment_begin>\n#ifdef DOUBLE_SIDED\n  normal *= faceDirection; nonPerturbedNormal = normal;\n#endif');
  };
  material.customProgramCacheKey = () => 'tk-leaf-2side';
  return material;
}

const cache = new Map();
export function treeMaterials({ cheap = false, wind = null } = {}) {
  const key = (cheap ? 'c' : 's') + (wind ? '|w' : '');
  if (cache.has(key) && cache.get(key).wind === wind) return cache.get(key).mats;
  const mats = make(cheap, wind);
  cache.set(key, { wind, mats });
  return mats;
}

async function make(cheap, wind) {
  const atlas = await loadFoliageAtlas();
  const W = m => (wind ? applyTreeWind(m, wind) : m);
  const tuft = tuftMaterials(tuftAtlas(), { cheap, wind: m => W(m) });
  const bark = makeSurface('bark_pine', { size: 256, seed: 3 });
  bark.map.wrapS = bark.map.wrapT = THREE.RepeatWrapping;
  const barkMat = W(cheap
    ? new THREE.MeshLambertMaterial({ map: bark.map, vertexColors: true })
    : new THREE.MeshStandardMaterial({ map: bark.map, vertexColors: true, roughness: 0.95 }));
  const leafMat = W(twoSidedLeaf(cheap
    ? new THREE.MeshLambertMaterial({ map: atlas.texture, alphaTest: 0.35, side: THREE.DoubleSide, vertexColors: true, emissive: '#1c2a12', emissiveMap: atlas.texture, emissiveIntensity: 0.5 })
    : new THREE.MeshStandardMaterial({ map: atlas.texture, alphaTest: 0.3, side: THREE.DoubleSide, vertexColors: true, roughness: 0.85, emissive: '#1c2a12', emissiveMap: atlas.texture, emissiveIntensity: 0.55 })));
  // shadows bend with the tree (a bent trunk with a straight shadow looks wrong in a storm); the leaf cards' shadows
  // are leaf-shaped (the picture's alpha), not whole cards
  const barkDepth = wind ? W(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking })) : null;
  const leafDepth = W(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: atlas.texture, alphaTest: 0.35, side: THREE.DoubleSide }));
  return { bark: barkMat, leaf: leafMat, tuft, barkDepth, leafDepth };
}
