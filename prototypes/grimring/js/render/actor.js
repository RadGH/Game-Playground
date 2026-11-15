// One Model Library fighter on screen: the GLB (loaded once per model, cloned per fighter), its clips made "in place"
// (the sim owns movement — the same fix as avatar-3d/kestrel/js/glb-attempt.js), weapons in the palms, and a small
// state machine that picks the clip from what the sim says the fighter is doing.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { makeWeapon, HOLD } from './weapons.js';

const LIB = new URL('../../../../model-library/', import.meta.url);
const loader = new GLTFLoader();
const cache = new Map();
export const modelUrl = id => new URL(`models/${id}.glb`, LIB).href;
export const cardUrl = id => new URL(`models/${id}.webp`, LIB).href;

export async function loadCatalog() {
  const r = await fetch(new URL('data/models.json', LIB));
  return (await r.json()).models;
}

function prepare(gltf) {
  const clips = {};
  for (const clip of gltf.animations) {
    for (const t of clip.tracks) {
      if (t.name !== 'Hips.position') continue;
      const v = t.values, x0 = v[0], z0 = v[2];
      for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; }     // keep the bounce, drop the travel
    }
    clips[clip.name] = clip;
  }
  gltf.scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(gltf.scene, true);
  return { gltf, clips, box };
}
export function loadModel(id) {
  let c = cache.get(id);
  if (!c) { c = loader.loadAsync(modelUrl(id)).then(prepare); cache.set(id, c); c.catch(() => cache.delete(id)); }
  return c;
}

const LOOPS = new Set(['idle', 'ready', 'walk', 'run', 'shamble', 'block']);

/** A fighter's body. `opts.height` (metres, from the catalog), `opts.weapon` ({ right, left } kinds). */
export async function createActor(id, opts = {}) {
  const asset = await loadModel(id);
  const group = new THREE.Group(); group.name = 'actor:' + id;
  const root = cloneSkinned(asset.gltf.scene);
  root.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false;
    // a shared material per model is fine, but the hit flash needs its own copy so one fighter flashes, not all
    o.material = o.material.clone(); o.material.emissive = new THREE.Color(0x000000);
  });
  const height = opts.height || 1.75;
  const k = height / Math.max(0.01, asset.box.max.y - asset.box.min.y);
  root.scale.setScalar(k); root.position.y = -asset.box.min.y * k;
  group.add(root);
  group.updateMatrixWorld(true);
  const byName = {}; root.traverse(o => { if (o.name) byName[o.name] = o; });
  const mats = []; root.traverse(o => { if (o.isMesh) mats.push(o.material); });

  // weapons
  const held = {};
  const sizeK = Math.max(0.7, Math.min(1.6, height / 1.75));
  for (const side of ['right', 'left']) {
    const kind = opts.weapon?.[side]; if (!kind) continue;
    const hand = byName[side === 'right' ? 'RightHand' : 'LeftHand']; if (!hand) continue;
    const w = makeWeapon(kind); if (!w) continue;
    const hold = HOLD[kind] || HOLD[side];
    const holder = new THREE.Group(); holder.name = 'grip:' + side;
    const s = hand.getWorldScale(new THREE.Vector3()).x;
    holder.scale.setScalar(sizeK / s);
    holder.position.set(hold.pos[0] / s, hold.pos[1] / s * sizeK, hold.pos[2] / s);
    holder.rotation.set(...hold.rot);
    holder.add(w); hand.add(holder); held[side] = w;
  }

  const mixer = new THREE.AnimationMixer(root);
  const actions = {};
  for (const [name, clip] of Object.entries(asset.clips)) actions[name] = mixer.clipAction(clip);
  let cur = null, curName = '', flash = 0, deadAt = -1;

  function play(name, { dur = 0, rate = 1, fade = 0.15, restart = false } = {}) {
    if (!actions[name]) name = name === 'ready' || name === 'block' ? 'idle' : name === 'shamble' ? 'walk' : name === 'attack2' || name === 'cast2' ? 'attack' : name === 'scream' || name === 'roar' ? 'attack' : 'idle';
    const a = actions[name]; if (!a) return;
    const loop = LOOPS.has(name);
    const scale = dur > 0 ? a.getClip().duration / dur : rate;
    if (a === cur && !restart) { a.setEffectiveTimeScale(scale); return; }
    a.reset(); a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); a.clampWhenFinished = !loop;
    a.setEffectiveTimeScale(scale); a.setEffectiveWeight(1); a.play();
    if (cur && cur !== a) { cur.fadeOut(fade); a.fadeIn(fade); }
    cur = a; curName = name;
  }
  play('idle');

  return {
    id, group, height, held, actions,
    get clip() { return curName; },
    clips: Object.keys(actions),
    play,
    /** Follow the sim: `f` is the fighter, `ev` the swing event when one just started. */
    follow(f, t) {
      if (f.state === 'dead') { if (deadAt < 0) { deadAt = t; play('death', { fade: 0.1 }); } return; }
      deadAt = -1;
      if (f.state === 'attack' || f.state === 'special') return;             // started by swing() with its own timing
      if (f.state === 'hit') { if (curName !== 'hit') play('hit', { dur: Math.max(0.45, f.dur), fade: 0.06 }); return; }
      if (f.state === 'dodge') { play('run', { rate: 2.2, fade: 0.05 }); return; }
      if (f.state === 'move') {
        const sp = f.def.speed * f.mods.speedMul * (f.slowT > 0 ? 1 - f.slowK : 1);
        const rel = sp / (height * 1.9);                    // ~1 at a natural pace for this body size
        if (f.model === 'zombie' && actions.shamble) play('shamble', { rate: Math.max(0.6, rel * 1.4) });
        else if (rel < 0.9 || f.slowT > 0) play('walk', { rate: Math.max(0.7, sp / (height * 0.85)) });
        else play('run', { rate: Math.max(0.7, Math.min(1.5, rel)) });
        return;
      }
      play(actions.ready && f.foeNear ? 'ready' : 'idle');
    },
    swing(clip, dur) { play(clip, { dur, fade: 0.08, restart: true }); },
    hitFlash(color = 0xff3020) { flash = 1; for (const m of mats) m.emissive.setHex(color); },
    update(dt) {
      mixer.update(dt);
      if (flash > 0) { flash = Math.max(0, flash - dt * 6); for (const m of mats) m.emissiveIntensity = flash * 0.9; }
    },
    dispose() { mixer.stopAllAction(); group.removeFromParent(); },
  };
}
