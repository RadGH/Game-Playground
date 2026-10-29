// A Kestrel attempt made from rigged GLB files (an AI service's output, packed by tools/pack-glb.py) instead of code.
// Same contract as the hand-coded attempts (CONTRACT.md): createKestrelCharacter(look, opts) → the Chibi 2 actor.
//
//   opts.files = { male: 'meshy/models/multi-male.glb', female: '…' }   paths relative to avatar-3d/kestrel/ (or absolute URLs)
//   opts.bones = the service's bone names for the contract's (default: Meshy/Mixamo-style names, below)
//
// What a statue from a service cannot do, it says so instead of pretending: no face rig (setExpression / blink / gaze
// are accepted and do nothing — `eyes.v25` is false), no garment slots (the outfit is in the texture), one far version.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

export const KESTREL_ANIMS = ['idle', 'ready', 'walk', 'run', 'sprint', 'attack', 'cast', 'hit', 'guard', 'wave', 'talk', 'jump', 'dead', 'crouch', 'aim', 'interact'];
export const KESTREL_INFO = { attempt: 'glb', by: 'rigged GLB', version: '0.1.0' };
const ONE_SHOTS = new Set(['attack', 'cast', 'hit', 'jump', 'wave', 'interact', 'dead']);
const BASE = new URL('../', import.meta.url);

/** Contract bone → the GLB's bone (Meshy's rig; Mixamo names without the prefix). Grip bones are added in the palms. */
export const MESHY_BONES = {
  hips: 'Hips', chest: 'Spine02', spine: 'Spine01', neck: 'neck', head: 'Head',
  armL: 'LeftArm', elbowL: 'LeftForeArm', handL: 'LeftHand', armR: 'RightArm', elbowR: 'RightForeArm', handR: 'RightHand',
  legL: 'LeftUpLeg', kneeL: 'LeftLeg', footL: 'LeftFoot', legR: 'RightUpLeg', kneeR: 'RightLeg', footR: 'RightFoot',
};

const loader = new GLTFLoader();
const cache = new Map();          // url → { promise, refs }
function load(url) {
  let c = cache.get(url);
  if (!c) { c = { promise: loader.loadAsync(url).then(g => prepare(g)), refs: 0 }; cache.set(url, c); }
  return c;
}

/** Once per file: clips made in place (a game owns movement), bind-pose height measured. */
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
  let triangles = 0, meshes = 0; const textures = new Set();
  gltf.scene.traverse(o => {
    if (!o.isMesh) return;
    meshes++; triangles += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
    for (const m of [].concat(o.material)) for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap']) if (m[k]) textures.add(m[k].uuid);
  });
  return { gltf, clips, box, stats: { triangles, meshes, textures: textures.size } };
}

const formOf = look => (/^f/i.test(String(look?.body?.form || '')) ? 'female' : 'male');
const urlOf = p => new URL(p, BASE).href;

export async function prepareKestrel(look, opts = {}) { await load(urlOf(opts.files[formOf(look)])).promise; }
export function kestrelCacheStats() { return { templates: cache.size, references: [...cache.values()].reduce((n, c) => n + c.refs, 0) }; }

export async function createKestrelCharacter(look = {}, opts = {}) {
  const files = opts.files, boneNames = opts.bones || MESHY_BONES;
  if (!files) throw new Error('glb attempt: opts.files is required');
  const group = new THREE.Group(); group.userData.character = true;
  let asset, entry, root, mixer, actions = {}, parts = {}, skeleton, anim = 'idle', action = null, rate = 1, disposed = false, handsFree = false, height = 1.75, buildMs = 0, cacheHit = false;
  const twist = { yaw: 0, side: 0, fwd: 0 }, tq = new THREE.Quaternion(), te = new THREE.Euler(0, 0, 0, 'YXZ');
  let gazeTarget = null, headK = 0.35, expression = 'neutral';

  async function install(a) {
    const t0 = performance.now();
    const url = urlOf(files[formOf(a)]);
    const next = load(url); cacheHit = cache.get(url).refs > 0 || next.ready; next.refs++;
    const prepared = await next.promise; next.ready = true;
    if (disposed) { next.refs--; return; }
    if (root) { group.remove(root); mixer.stopAllAction(); entry.refs--; }
    entry = next; asset = prepared;
    root = cloneSkinned(asset.gltf.scene);
    root.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = true; } });
    // scale to the look's height, feet on y = 0
    const want = opts.height || (formOf(a) === 'female' ? 1.68 : 1.78) * (0.94 + 0.12 * (Number.isFinite(a?.body?.height) ? a.body.height : 0.5));
    const k = want / Math.max(0.01, asset.box.max.y - asset.box.min.y);
    root.scale.setScalar(k); root.position.y = -asset.box.min.y * k; height = want;
    group.add(root);
    skeleton = null; root.traverse(o => { if (o.isSkinnedMesh && !skeleton) skeleton = o.skeleton; });
    const byName = {}; root.traverse(o => { if (o.name) byName[o.name] = o; });
    parts = { root };
    for (const [ours, theirs] of Object.entries(boneNames)) if (byName[theirs]) parts[ours] = byName[theirs];
    for (const s of ['L', 'R']) {                       // grip bones in the palm, as Chibi 2 has
      const hand = parts['hand' + s]; if (!hand) continue;
      const grip = new THREE.Object3D(); grip.name = 'grip' + s; hand.add(grip);
      const child = hand.children.find(c => c.isBone); if (child) grip.position.copy(child.position).multiplyScalar(0.5); else grip.position.set(0, 0.08 / k, 0);
      parts['grip' + s] = grip;
    }
    mixer = new THREE.AnimationMixer(root); actions = {};
    for (const n of KESTREL_ANIMS) if (asset.clips[n]) actions[n] = mixer.clipAction(asset.clips[n]);
    mixer.addEventListener('finished', e => { if (e.action === action && anim !== 'dead') play('idle'); });
    action = null; play('idle', 0);
    group.userData.fxHeight = height;
    buildMs = performance.now() - t0;
  }

  function play(name, fade = 0.12, restart = false) {
    if (disposed || !mixer) return;
    if (!KESTREL_ANIMS.includes(name)) name = 'idle';
    const want = name;
    const next = actions[name] || actions.idle;
    if (!next) { anim = 'idle'; return; }
    if (next === action && (!ONE_SHOTS.has(want) || (!restart && next.isRunning()))) { anim = want; return; }
    const prev = action;
    next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1);
    next.setLoop(ONE_SHOTS.has(want) ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = ONE_SHOTS.has(want); next.play();
    if (prev && prev !== next) { prev.fadeOut(fade); next.fadeIn(fade); }
    anim = actions[want] ? want : 'idle'; action = next;
  }

  await install(look);
  const tmp = new THREE.Vector3(), hq = new THREE.Quaternion(), m4 = new THREE.Matrix4();

  return {
    group,
    get anim() { return anim; }, get parts() { return parts; }, get skeleton() { return skeleton; },
    metrics() { return { totalHeight: height, height }; },
    stats() { return { ...asset.stats, drawCalls: asset.stats.meshes, bones: skeleton ? skeleton.bones.length : 0, buildMs, cacheHit, lod: 0 }; },
    setAnim: play,
    async setAvatar(a) { if (!disposed && formOf(a) !== formOf(look)) { look = a; await install(a); } else look = a; },
    setRate(v) { rate = Math.max(0.15, Math.min(3.5, Number(v) || 1)); }, get rate() { return rate; },
    setTwist(yaw = 0, side = 0, fwd = 0) { twist.yaw = +yaw || 0; twist.side = +side || 0; twist.fwd = +fwd || 0; },
    get twist() { return { ...twist }; },
    update(dt) {
      if (disposed || !mixer) return;
      mixer.update(Math.min(0.1, Math.max(0, dt)) * rate);
      if (parts.chest && (twist.yaw || twist.side || twist.fwd)) parts.chest.quaternion.multiply(tq.setFromEuler(te.set(twist.fwd, twist.yaw, twist.side)));
      if (gazeTarget && parts.head) {                    // turn the head part of the way toward a point
        parts.head.updateWorldMatrix(true, false);
        tmp.copy(gazeTarget); parts.head.parent.worldToLocal(tmp);
        m4.lookAt(tmp, new THREE.Vector3(), new THREE.Vector3(0, 1, 0)); hq.setFromRotationMatrix(m4);
        parts.head.quaternion.slerp(hq, headK * 0.5);
      }
    },
    setHandsFree(v) { handsFree = !!v; }, get handsFree() { return handsFree; },
    lookAt(point, { head = 0.35 } = {}) { gazeTarget = point ? new THREE.Vector3(point.x ?? point[0], point.y ?? point[1], point.z ?? point[2]) : null; headK = head; },
    setGaze() {}, blink() {}, setBlink() {},
    get eyes() { return { v25: false, blink: 0, gaze: [0, 0], looking: !!gazeTarget, limits: null }; },
    setExpression(name = 'neutral') { expression = name; },     // no face rig in a service's model
    get expression() { return expression; },
    setLod() {},
    get hold() { return null; },
    dispose() { if (disposed) return; disposed = true; if (root) group.remove(root); mixer?.stopAllAction(); if (entry) entry.refs--; },
  };
}
