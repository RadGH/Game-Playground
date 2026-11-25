// Animal bodies that are not fal.ai models (wildlife round 2026-11-25): Quaternius's CC0 animated animals
// (playground/assets/quaternius/animals, listed in data/critters.json). Same shape as a fal body, so actors.js uses it
// unchanged: { group, play(key, fade), update(dt), clip }. Keys: idle, walk, run, sprint, attack, hit, death (+ idle2,
// grazing, played now and then while idle).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const ROOT = new URL('../../../../../', import.meta.url);           // the playground folder
const loader = new GLTFLoader();
const cache = new Map();
const ONCE = new Set(['attack', 'hit', 'death']);

/** `def` = a data/critters.json row. */
export async function createCritter(def) {
  if (!cache.has(def.file)) cache.set(def.file, loader.loadAsync(new URL(def.file, ROOT).href));
  const src = await cache.get(def.file);
  const root = SkeletonUtils.clone(src.scene);
  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  const group = new THREE.Group(); group.add(root); group.userData.character = true;
  const byName = new Map(src.animations.map(a => [a.name.split('|').pop(), a]));
  const mixer = new THREE.AnimationMixer(root);
  let action = null, clip = null, idleT = 0;
  function play(key, fade = 0.25) {
    const c = byName.get(def.clips[key] || def.clips.idle);
    if (!c) return;
    const next = mixer.clipAction(c);
    if (ONCE.has(key)) { next.setLoop(THREE.LoopOnce, 1); next.clampWhenFinished = true; } else next.setLoop(THREE.LoopRepeat, Infinity);
    next.reset().play();
    if (action && action !== next) action.crossFadeTo(next, fade, false);
    action = next; clip = key;
  }
  play('idle', 0);
  return {
    group, critter: true,
    play,
    get clip() { return clip; },
    update(dt) {
      mixer.update(dt);
      // a standing animal grazes now and then
      if (def.clips.idle2 && (clip === 'idle' || clip === 'idle2')) {
        idleT += dt;
        if (idleT > (clip === 'idle' ? 7 : 4)) { idleT = 0; play(clip === 'idle' ? 'idle2' : 'idle', 0.4); }
      } else idleT = 0;
    },
    dispose() { mixer.stopAllAction(); },
  };
}
