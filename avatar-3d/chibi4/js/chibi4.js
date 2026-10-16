// Chibi 4 runtime entry point. Two kinds of character:
//
//   createChibi4Character(avatar)                 -> the step 9 KIT (default): assembled at runtime from separate
//                                                    pieces on one skeleton — see chibi4-kit.js
//   createChibi4Character(avatar, { model: 'mage'|'elf' }) or { baked: true }
//                                                 -> step 7's two BAKED characters (one GLB each, nothing swaps)
//
// Both answer Chibi 2's calls: { group, setAnim(name, fade, restart), play, update(dt), setRate, setTwist, stats(),
// metrics(), setAvatar(a), dispose(), parts, skeleton, lod }; the kit also has dress(), setColors(), attach().
// The baked GLBs are meshopt-compressed (gltfpack): mesh names are gone, so the distance versions are told apart by
// size (most vertices = LOD0), and GLTFLoader needs the meshopt decoder (vendor/meshopt/).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { MeshoptDecoder } from '../../../vendor/meshopt/meshopt_decoder.mjs';
import { createChibi4Kit, preloadChibi4, loadKit } from './chibi4-kit.js';
export { createChibi4Kit, preloadChibi4, loadKit };

const BASE = new URL('../models/', import.meta.url);
const cache = new Map();               // model id -> Promise<{ gltf, bytes, info }>
const LOD_DIST = [0, 9, 22];            // metres: full detail near, 40% by 9 m, 15% by 22 m

// Chibi 2 animation names -> our clips (Quaternius has no wave/guard/jump in this set: closest stand-ins)
const ANIM_MAP = { idle: 'idle', ready: 'idle', walk: 'walk', run: 'run', attack: 'attack', cast: 'cast', hit: 'hit',
  guard: 'idle', wave: 'talk', talk: 'talk', jump: 'idle', dead: 'death', death: 'death' };
const ONE_SHOT = new Set(['attack', 'cast', 'hit']);
export const CHIBI4_ANIMS = Object.keys(ANIM_MAP);
export const CHIBI4_MODELS = ['mage', 'elf'];

export function modelFor(avatar = {}) {
  const b = avatar.body || {};
  if (avatar.chibi4?.model && CHIBI4_MODELS.includes(avatar.chibi4.model)) return avatar.chibi4.model;
  if (b.race === 'elf' || b.gender === 'female') return 'elf';
  return 'mage';
}

async function fetchModel(id) {
  if (!cache.has(id)) {
    cache.set(id, (async () => {
      const url = new URL(`${id}.glb`, BASE);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Chibi 4: ${url} is missing (${res.status}). Build it: avatar-3d/chibi4/README.md "Rebuild".`);
      const buf = await res.arrayBuffer();
      await MeshoptDecoder.ready;
      const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(buf, url.href.replace(/[^/]*$/, ''));
      let info = null;
      try { info = await (await fetch(new URL(`${id}.json`, BASE))).json(); } catch { /* optional */ }
      // one material: the atlas, cut-out alpha for hair/brows/lashes, both sides (hair cards, open sleeves)
      gltf.scene.traverse(o => {
        if (!o.isMesh) return;
        const m = o.material;
        m.alphaTest = 0.5; m.transparent = false; m.side = THREE.DoubleSide;
        if (m.map) { m.map.anisotropy = 4; m.map.colorSpace = THREE.SRGBColorSpace; }
        m.roughness = 0.8; m.metalness = 0;
      });
      return { gltf, bytes: buf.byteLength, info };
    })());
  }
  return cache.get(id);
}

export async function createChibi4Character(avatar = {}, opts = {}) {
  // step 9: the modular kit is the default; opts.baked (or opts.model 'mage'/'elf') gives step 7's baked characters
  if (!opts.baked && !opts.model) return createChibi4Kit(avatar, opts);
  const id = opts.model || modelFor(avatar);
  const { gltf, bytes, info } = await fetchModel(id);
  const root = SkeletonUtils.clone(gltf.scene);
  const group = new THREE.Group();
  group.name = `chibi4:${id}`;
  // the three distance versions become one THREE.LOD (they share the cloned skeleton)
  const meshes = [];
  root.traverse(o => { if (o.isSkinnedMesh) meshes.push(o); });
  // gltfpack drops mesh names: the distance versions are told apart by size (LOD0 has the most vertices)
  meshes.sort((a, b) => b.geometry.attributes.position.count - a.geometry.attributes.position.count);
  const lod = new THREE.LOD();
  const lodLevels = opts.lod === false ? [meshes[0]] : meshes;
  lodLevels.forEach((m, i) => {
    m.frustumCulled = false;                                     // skinned bounds are bind-pose; the group is small anyway
    m.removeFromParent(); lod.addLevel(m, LOD_DIST[i] ?? 40 * i);
  });
  for (const m of meshes) if (!lodLevels.includes(m)) m.removeFromParent();
  // keep the armature (bones) in the tree; the meshes now live in the LOD, still bound to the same skeleton
  root.add(lod);
  // the GLB faces +z like Chibi 2 (Blender's -y front becomes glTF's +z), so no turn is needed
  group.add(root);
  if (opts.scale) group.scale.setScalar(opts.scale);

  const mixer = new THREE.AnimationMixer(root);
  const actions = {};
  for (const clip of gltf.animations) actions[clip.name] = mixer.clipAction(clip);
  let current = null, currentName = 'idle', rate = 1;

  function setAnim(name = 'idle', fade = 0.12) {
    const clipName = ANIM_MAP[name] || 'idle';
    const next = actions[clipName] || actions.idle;
    if (!next) return;
    if (next === current && !ONE_SHOT.has(clipName)) return;
    next.reset(); next.enabled = true; next.setEffectiveTimeScale(rate); next.setEffectiveWeight(1);
    if (ONE_SHOT.has(clipName) || clipName === 'death') { next.setLoop(THREE.LoopOnce, 1); next.clampWhenFinished = true; }
    else next.setLoop(THREE.LoopRepeat, Infinity);
    if (current && current !== next) current.crossFadeTo(next, fade, false);
    next.play();
    current = next; currentName = name;
  }
  mixer.addEventListener('finished', e => {
    if (e.action === current && ONE_SHOT.has(e.action.getClip().name)) setAnim('idle', 0.2);
  });
  setAnim('idle', 0);

  const bones = {};
  root.traverse(o => { if (o.isBone) bones[o.name] = o; });
  let height = info?.height || 1.8;
  group.userData.character = avatar;
  group.userData.fxHeight = height;

  function triangles(mesh) { const g = mesh.geometry; return (g.index ? g.index.count : g.attributes.position.count) / 3; }

  return {
    group,
    model: id,
    parts: { head: bones.head, handL: bones.hand_l, handR: bones.hand_r, spine: bones.spine_03, pelvis: bones.pelvis, bones },
    skeleton: meshes[0]?.skeleton,
    lod,
    setAnim,
    play: setAnim,                                               // the name the experiment's brief used
    get anim() { return currentName; },
    update(dt) { mixer.update(dt); },
    setRate(r = 1) { rate = r; if (current) current.setEffectiveTimeScale(r); },
    setTwist() {}, hold() {}, hit() { setAnim('hit'); },          // Thousandvale calls these when present
    async setAvatar(a) { group.userData.character = a; },          // the look is baked: a new model needs a new character
    equip() { return false; }, dress() { return false; },          // not modular yet — see README "What is not done"
    stats() {
      return { meshes: 1, drawCalls: 1, bones: Object.keys(bones).length, triangles: triangles(meshes[0]),
        lodTriangles: meshes.map(triangles), bytes, textures: 1 };
    },
    metrics() { return { height, totalHeight: height }; },
    dispose() {
      mixer.stopAllAction(); mixer.uncacheRoot(root);
      group.removeFromParent();
      // geometry and the atlas are shared with every other instance of this model; they stay cached
    },
  };
}
