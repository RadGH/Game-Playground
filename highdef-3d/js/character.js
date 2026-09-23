// The main character.
//
// The body, the clothes and the hair are separate glTF files that all share one skeleton layout
// (root, pelvis, spine_01..03, neck_01, Head, clavicle/upperarm/lowerarm/hand, thigh/calf/foot/ball
// left and right). They are CC0 models from Quaternius, already in the repository for the avatar
// experiments; the licence sits next to them. The animation library is a separate file again, with
// 43 clips on the same skeleton.
//
// Two things this module does that a straight loader would not:
//
//   1. It wires up the normal and roughness maps. The files ship with them and the other loader in
//      this repository ignores them, which is why characters there look like painted plastic. With
//      them, cloth creases catch the light and leather goes dull while skin stays slightly sheened.
//
//   2. It runs a proper blend tree rather than snapping from clip to clip. Walk, jog and sprint are
//      cross-faded by how fast you are actually moving, with their playback phases kept in step so
//      the feet do not stutter at the moment of the change — the single most obvious giveaway in
//      an otherwise good character.
//
// Each part carries its own copy of the skeleton, so each gets its own mixer and every mixer is
// driven with identical weights. Keeping them in lock-step is the whole trick.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { enhance } from './materials.js';

const ASSETS = new URL('../../avatar-3d/assets/quaternius/', import.meta.url).href;

const loader = new GLTFLoader();
const gltfCache = new Map();
function loadGLTF(path) {
  if (!gltfCache.has(path)) gltfCache.set(path, loader.loadAsync(ASSETS + path));
  return gltfCache.get(path);
}
const texCache = new Map();
function loadTex(file, srgb = false) {
  const key = file + (srgb ? '|s' : '');
  if (!texCache.has(key)) {
    const t = new THREE.TextureLoader().load(ASSETS + file);
    t.flipY = false;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 8;
    texCache.set(key, t);
  }
  return texCache.get(key);
}

/** Ready-made characters. Each is a body frame plus an outfit and some colours. */
export const PRESETS = {
  ranger:   { label: 'Ranger',    frame: 'm', outfit: 'Ranger',  skin: 'light', hair: 'Hair_SimpleParted', hairColor: 0x4a3526, beard: true,  hood: false, cloth: 0x4c5a45, legs: 0x3c3630, boots: 0x2e2822, trim: 0x6b5638 },
  hooded:   { label: 'Hooded',    frame: 'm', outfit: 'Ranger',  skin: 'light', hair: null,                hairColor: 0x3a2b20, beard: true,  hood: true,  cloth: 0x3e4438, legs: 0x342f2a, boots: 0x272320, trim: 0x59452c },
  scout:    { label: 'Scout',     frame: 'f', outfit: 'Ranger',  skin: 'light', hair: 'Hair_Buns',         hairColor: 0x2b2118, beard: false, hood: false, cloth: 0x4a4a52, legs: 0x36322e, boots: 0x2a2522, trim: 0x7a6440 },
  villager: { label: 'Villager',  frame: 'm', outfit: 'Peasant', skin: 'dark',  hair: 'Hair_Buzzed',       hairColor: 0x1d1611, beard: false, hood: false, cloth: 0x8a7a5e, legs: 0x5a5244, boots: 0x3a322a, trim: 0x6a5a44 },
  herbalist:{ label: 'Herbalist', frame: 'f', outfit: 'Peasant', skin: 'dark',  hair: 'Hair_Long',         hairColor: 0x2e2018, beard: false, hood: false, cloth: 0x7d6b7a, legs: 0x4a4048, boots: 0x332c2c, trim: 0x8a7a5a },
};

/**
 * Every animation state the controller can ask for, and which clip plays it.
 * `once` clips play through and hand control back.
 */
export const STATES = {
  idle:     { clip: 'Idle_Loop',          speed: 1.0 },
  walk:     { clip: 'Walk_Loop',          speed: 1.0, cycle: 1.55 },  // metres per second the clip was made for
  jog:      { clip: 'Jog_Fwd_Loop',       speed: 1.0, cycle: 3.40 },
  sprint:   { clip: 'Sprint_Loop',        speed: 1.0, cycle: 6.10 },
  crouch:   { clip: 'Crouch_Idle_Loop',   speed: 1.0 },
  crouchWalk:{ clip: 'Crouch_Fwd_Loop',   speed: 1.0, cycle: 1.20 },
  jumpUp:   { clip: 'Jump_Start',         speed: 1.0, once: true },
  fall:     { clip: 'Jump_Loop',          speed: 1.0 },
  land:     { clip: 'Jump_Land',          speed: 1.1, once: true },
  swimIdle: { clip: 'Swim_Idle_Loop',     speed: 1.0 },
  swim:     { clip: 'Swim_Fwd_Loop',      speed: 1.0, cycle: 1.6 },
  roll:     { clip: 'Roll',               speed: 1.0, once: true },
  wave:     { clip: 'Interact',           speed: 1.0, once: true },
  dance:    { clip: 'Dance_Loop',          speed: 1.0 },
  sit:      { clip: 'Sitting_Idle_Loop',  speed: 1.0 },
  talk:     { clip: 'Idle_Talking_Loop',  speed: 1.0 },
  swordIdle:{ clip: 'Sword_Idle',         speed: 1.0 },
  swordSwing:{ clip: 'Sword_Attack',      speed: 1.05, once: true },
  punch:    { clip: 'Punch_Jab',          speed: 1.1, once: true },
  hit:      { clip: 'Hit_Chest',          speed: 1.0, once: true },
  die:      { clip: 'Death01',            speed: 1.0, once: true },
  pickUp:   { clip: 'PickUp_Table',       speed: 1.0, once: true },
  torch:    { clip: 'Idle_Torch_Loop',    speed: 1.0 },
};

/** The order the locomotion clips blend through as speed climbs. */
const GAIT = ['idle', 'walk', 'jog', 'sprint'];

/**
 * Build a character.
 * @returns an object with `group`, `setState`, `setLocomotion`, `update(dt)` and `dispose`.
 */
export async function createCharacter(preset = 'ranger', { csm = null, shadows = true } = {}) {
  const p = typeof preset === 'string' ? (PRESETS[preset] || PRESETS.ranger) : preset;
  const group = new THREE.Group();
  group.name = 'character';

  // --- animation library -----------------------------------------------------------------------
  const animGltf = await loadGLTF('anim/UAL1_Standard.glb');
  // Strip the scale tracks. They are all 1,1,1 in these clips, but leaving them in means any bone
  // scaling we apply is overwritten on the first frame.
  const clips = new Map();
  for (const c of animGltf.animations) {
    clips.set(c.name, new THREE.AnimationClip(c.name, c.duration, c.tracks.filter(t => !t.name.endsWith('.scale'))));
  }

  // --- the parts -------------------------------------------------------------------------------
  const frame = p.frame === 'f' ? 'f' : 'm';
  const G = frame === 'm' ? 'Male' : 'Female';
  const set = p.outfit || 'Ranger';
  const parts = [];
  const mixers = [];
  let headBone = null;

  const bodyFile = frame === 'm' ? 'base/Superhero_Male_FullBody.gltf' : 'base/Superhero_Female_FullBody.gltf';
  const bodyGltf = await loadGLTF(bodyFile);
  const body = cloneSkinned(bodyGltf.scene);
  dressBody(body, frame, p);
  addPart(body, 'body');
  headBone = body.getObjectByName('Head');

  const pieces = [
    `${G}_${set}_Body`,
    `${G}_${set}_Arms`,
    `${G}_${set}_Legs`,
    set === 'Ranger' ? (frame === 'm' ? 'Male_Ranger_Feet_Boots' : 'Female_Ranger_Feet')
                     : (frame === 'm' ? 'Male_Peasant_Feet' : 'Female_Peasant_Feet'),
  ];
  if (set === 'Ranger') pieces.push(frame === 'm' ? 'Male_Ranger_Acc_Pauldron' : 'Female_Ranger_Acc_Pauldrons');
  if (p.hood && set === 'Ranger') pieces.push(`${G}_Ranger_Head_Hood`);

  for (const name of pieces) {
    try {
      const g = await loadGLTF(`outfits/${name}.gltf`);
      const part = cloneSkinned(g.scene);
      dressOutfit(part, name, p);
      addPart(part, name);
    } catch (e) {
      // A missing optional piece (a pauldron set that does not exist for this body) must not stop
      // the character loading — it just does not get that piece.
      console.warn('[character] optional piece missing:', name);
    }
  }

  // hair and beard hang off the head bone rather than being skinned
  if (p.hair && !p.hood) {
    try {
      const hg = await loadGLTF(`hair/${p.hair}.gltf`);
      const hair = hg.scene.clone(true);
      hair.traverse(o => {
        if (!o.isMesh) return;
        o.castShadow = shadows;
        o.material = hairMaterial(p.hairColor, csm, o.material);
        o.frustumCulled = false;
      });
      group.add(hair);
      body.updateMatrixWorld(true);
      headBone.attach(hair);
      parts.push(hair);
    } catch (e) { console.warn('[character] hair missing', p.hair); }
  }
  if (p.beard) {
    try {
      const bg = await loadGLTF('hair/Hair_Beard.gltf');
      const beard = bg.scene.clone(true);
      beard.traverse(o => {
        if (!o.isMesh) return;
        o.castShadow = shadows;
        o.material = hairMaterial(p.hairColor, csm, o.material);
        o.frustumCulled = false;
      });
      group.add(beard);
      body.updateMatrixWorld(true);
      headBone.attach(beard);
      parts.push(beard);
    } catch (e) { /* no beard, no problem */ }
  }

  function addPart(obj, name) {
    obj.name = name;
    group.add(obj);
    parts.push(obj);
    const mixer = new THREE.AnimationMixer(obj);
    mixer.userData = { actions: new Map() };
    mixers.push(mixer);
  }

  // --- the blend tree ---------------------------------------------------------------------------
  const active = new Map();      // state name -> target weight
  const current = new Map();     // state name -> current weight, eased toward the target
  let overlay = null;            // a one-shot playing on top
  let overlayTime = 0;
  let overlayDur = 0;

  /** Get (making it if needed) the action for a clip on one mixer. */
  function actionFor(mixer, clipName) {
    const map = mixer.userData.actions;
    if (!map.has(clipName)) {
      const clip = clips.get(clipName);
      if (!clip) return null;
      const a = mixer.clipAction(clip);
      a.enabled = true;
      a.setEffectiveWeight(0);
      a.play();
      map.set(clipName, a);
    }
    return map.get(clipName);
  }

  /** Push the weight map out to every mixer, and keep the gait clips phase-locked. */
  function applyWeights() {
    // the gait clip with the most weight drives the phase; the others follow it
    let leadName = null, leadW = -1;
    for (const g of GAIT) { const w = current.get(g) || 0; if (w > leadW) { leadW = w; leadName = g; } }
    const leadClip = STATES[leadName]?.clip;

    for (const mixer of mixers) {
      let leadPhase = 0;
      if (leadClip) {
        const la = actionFor(mixer, leadClip);
        if (la) leadPhase = (la.time / (la.getClip().duration || 1)) % 1;
      }
      for (const [state, w] of current) {
        const def = STATES[state];
        if (!def) continue;
        const a = actionFor(mixer, def.clip);
        if (!a) continue;
        a.setEffectiveWeight(w);
        a.setEffectiveTimeScale(def.speed * (playbackScale.get(state) || 1));
        // keep the walk/jog/sprint feet in step through the crossfade
        if (GAIT.includes(state) && state !== leadName && w > 0.001) {
          a.time = leadPhase * (a.getClip().duration || 1);
        }
      }
      // silence anything not in the map
      for (const [clipName, a] of mixer.userData.actions) {
        let wanted = false;
        for (const state of current.keys()) if (STATES[state]?.clip === clipName) { wanted = true; break; }
        if (overlay && STATES[overlay]?.clip === clipName) wanted = true;
        if (!wanted) a.setEffectiveWeight(0);
      }
    }
  }

  const playbackScale = new Map();

  /**
   * Set the walking blend from how fast the character is actually moving on the ground.
   * @param {number} speed metres per second
   * @param {object} flags { grounded, swimming, crouching }
   */
  function setLocomotion(speed, { grounded = true, swimming = false, crouching = false } = {}) {
    active.clear();
    playbackScale.clear();

    if (swimming) {
      const t = THREE.MathUtils.clamp(speed / 2.2, 0, 1);
      active.set('swimIdle', 1 - t);
      active.set('swim', t);
      if (t > 0.02) playbackScale.set('swim', THREE.MathUtils.clamp(speed / STATES.swim.cycle, 0.6, 1.6));
      return;
    }
    if (!grounded) {
      active.set('fall', 1);
      return;
    }
    if (crouching) {
      const t = THREE.MathUtils.clamp(speed / 1.6, 0, 1);
      active.set('crouch', 1 - t);
      active.set('crouchWalk', t);
      if (t > 0.02) playbackScale.set('crouchWalk', THREE.MathUtils.clamp(speed / STATES.crouchWalk.cycle, 0.6, 1.5));
      return;
    }

    // Find the two gaits the current speed sits between and split the weight across them. Each
    // clip also gets its playback rate nudged so its stride length matches the real speed —
    // without that, feet slide along the ground, which reads as "floaty" even if you cannot say why.
    const speeds = [0, STATES.walk.cycle, STATES.jog.cycle, STATES.sprint.cycle];
    if (speed <= 0.06) { active.set('idle', 1); return; }
    let i = 0;
    while (i < speeds.length - 2 && speed > speeds[i + 1]) i++;
    const a = GAIT[i], b = GAIT[i + 1];
    const t = THREE.MathUtils.clamp((speed - speeds[i]) / (speeds[i + 1] - speeds[i] || 1), 0, 1);
    active.set(a, 1 - t);
    active.set(b, t);
    for (const g of [a, b]) {
      const cyc = STATES[g].cycle;
      if (cyc) playbackScale.set(g, THREE.MathUtils.clamp(speed / cyc, 0.65, 1.45));
    }
  }

  /** Hold a single state at full weight (for dance, sit, sword idle and so on). */
  function setState(name) {
    active.clear();
    playbackScale.clear();
    active.set(name, 1);
  }

  /** Play a one-shot over the top of whatever is walking. */
  function playOnce(name, { fade = 0.12 } = {}) {
    const def = STATES[name];
    if (!def) return 0;
    overlay = name;
    overlayTime = 0;
    overlayDur = (clips.get(def.clip)?.duration || 0.8) / (def.speed || 1);
    for (const mixer of mixers) {
      const a = actionFor(mixer, def.clip);
      if (!a) continue;
      a.reset();
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true;
      a.setEffectiveTimeScale(def.speed);
      a.setEffectiveWeight(0);
      a.play();
    }
    void fade;
    return overlayDur;
  }

  const FADE = 9.0;    // how quickly weights chase their target — higher is snappier
  function update(dt) {
    // ease every weight toward its target
    const names = new Set([...active.keys(), ...current.keys()]);
    for (const n of names) {
      const target = active.get(n) || 0;
      const now = current.get(n) || 0;
      const next = now + (target - now) * Math.min(1, dt * FADE);
      if (next < 0.002 && target === 0) current.delete(n);
      else current.set(n, next);
    }

    // the one-shot fades in over its first fifth and out over its last fifth
    if (overlay) {
      overlayTime += dt;
      const k = overlayDur > 0 ? overlayTime / overlayDur : 1;
      const w = k >= 1 ? 0 : Math.min(1, k / 0.18) * Math.min(1, (1 - k) / 0.22);
      const def = STATES[overlay];
      for (const mixer of mixers) {
        const a = actionFor(mixer, def.clip);
        if (a) a.setEffectiveWeight(w);
      }
      // while the one-shot is loud, quieten the walk underneath it
      const duck = 1 - w * 0.85;
      for (const [n, v] of current) current.set(n, v * duck + v * (1 - duck) * 0);
      if (k >= 1) overlay = null;
    }

    applyWeights();
    for (const m of mixers) m.update(dt);
  }

  // start standing still
  setLocomotion(0);
  applyWeights();
  for (const m of mixers) m.update(0.001);

  // --- helpers used above ------------------------------------------------------------------------
  function cloneSkinned(scene) {
    const clone = scene.clone(true);
    // three's clone does not re-bind skinned meshes to the cloned bones; walk the clone and do it.
    const boneByName = new Map();
    clone.traverse(o => { if (o.isBone) boneByName.set(o.name, o); });
    clone.traverse(o => {
      if (!o.isSkinnedMesh) return;
      const src = findByName(scene, o.name);
      if (!src || !src.skeleton) return;
      const bones = src.skeleton.bones.map(b => boneByName.get(b.name) || b);
      o.bind(new THREE.Skeleton(bones, src.skeleton.boneInverses), o.bindMatrix.clone());
    });
    return clone;
  }
  function findByName(root, name) {
    let hit = null;
    root.traverse(o => { if (!hit && o.name === name) hit = o; });
    return hit;
  }

  /**
   * Upgrade the body's materials rather than replace them.
   *
   * The glTF files already point at their own colour, normal and packed
   * occlusion/roughness/metalness maps, and the loader has already wired them up. Throwing that
   * away and building a fresh material from guessed filenames is how the other loader in this
   * repository ended up with flat plastic skin. So: keep what came out of the file, swap the skin
   * tone if the preset asks for a different one, and run it through `enhance` so it joins the
   * cascaded shadows and the height fog like everything else.
   */
  function dressBody(root, frm, pre) {
    const light = pre.skin !== 'dark';
    const lightSkin = frm === 'm' ? 'base/T_Superhero_Male_Light.png' : 'base/T_Superhero_Female_Light_BaseColor.png';

    root.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = shadows; o.receiveShadow = shadows; o.frustumCulled = false;
      const name = o.material?.name || '';

      // the base body ships with its own hair mesh; we attach a hairstyle instead
      if (/Hair/i.test(name) && !/brow/i.test(o.name) && o.name !== 'Eyebrows') { o.visible = false; return; }

      const mat = o.material.clone();
      if (/Eyes/i.test(name)) {
        mat.roughness = 0.16; mat.metalness = 0;
      } else if (/brow/i.test(o.name) || o.name === 'Eyebrows') {
        mat.color = new THREE.Color(pre.hairColor);
        mat.roughness = 0.8;
      } else {
        // skin. The file ships the dark tone as its base colour; the light one is a second file.
        if (light) mat.map = loadTex(lightSkin, true);
        mat.roughness = 0.82;
        mat.metalness = 0;
        if (mat.normalScale) mat.normalScale.set(0.9, 0.9);
      }
      o.material = enhance(mat, { csm });
    });

    // The body is one mesh and the outfits are worn over it, so cut it back to the head and neck.
    // Keeping the whole body under the clothes both wastes triangles and lets elbows poke through.
    root.traverse(o => {
      if (o.isSkinnedMesh && /Superhero|Regular/i.test(o.material?.name || o.name || '')) {
        trimToBones(o, ['Head', 'neck_01'], 0.25);
      }
    });
  }

  /**
   * Same idea for the clothes: keep the maps, tint gently.
   *
   * The tint is pulled more than half of the way back toward white on purpose. A saturated
   * multiply flattens the texture's own shading into one block of colour, which is the fastest
   * way to make a good model look cheap; a light tint reads as dyed cloth instead.
   */
  function dressOutfit(root, name, pre) {
    let tint = pre.cloth;
    if (/Legs/.test(name)) tint = pre.legs;
    else if (/Feet/.test(name)) tint = pre.boots;
    else if (/Pauldron|Hood/.test(name)) tint = pre.trim;

    root.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = shadows; o.receiveShadow = shadows; o.frustumCulled = false;
      const mat = o.material.clone();
      mat.color = new THREE.Color(tint).lerp(new THREE.Color(0xffffff), 0.58).multiplyScalar(1.25);
      if (/Pauldron/.test(name)) { mat.metalness = Math.max(mat.metalness, 0.3); mat.roughness = 0.55; }
      else if (/Feet/.test(name)) { mat.roughness = 0.66; }
      if (mat.normalScale) mat.normalScale.set(1.15, 1.15);
      o.material = enhance(mat, { csm });
    });
  }

  function hairMaterial(colour, csmRef, from = null) {
    // The hair meshes carry their own colour and normal maps; use them when they are there and
    // fall back to a plain tinted material when they are not.
    const mat = from ? from.clone() : new THREE.MeshStandardMaterial();
    mat.color = new THREE.Color(colour);
    mat.roughness = 0.74;
    mat.metalness = 0;
    mat.side = THREE.DoubleSide;
    mat.alphaTest = mat.map ? 0.35 : 0;
    mat.transparent = false;
    return enhance(mat, { csm: csmRef });
  }

  return {
    group, parts, mixers, clips,
    preset: p,
    headBone,
    setLocomotion, setState, playOnce, update,
    get states() { return [...Object.keys(STATES)]; },
    get clipNames() { return [...clips.keys()].sort(); },
    /** Where the eyes are, for a first-person or over-the-shoulder camera. */
    eyeHeight: 1.62,
    height: 1.80,
    radius: 0.34,
    dispose() {
      for (const m of mixers) m.stopAllAction();
      group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    },
  };
}

/**
 * Throw away the triangles of a skinned mesh that are not weighted to the given bones. Used to cut
 * the body away under the clothes. Vertices stay put — only the index list shrinks — so nothing
 * needs re-binding.
 */
export function trimToBones(mesh, boneNames, minWeight = 0.35) {
  const geo = mesh.geometry, skel = mesh.skeleton;
  if (!geo.attributes.skinIndex || !skel) return;
  const keep = new Set();
  skel.bones.forEach((b, i) => { if (boneNames.includes(b.name)) keep.add(i); });
  if (!keep.size) return;
  const si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
  const vertKeep = new Uint8Array(si.count);
  for (let v = 0; v < si.count; v++) {
    let w = 0;
    for (let k = 0; k < 4; k++) {
      const bone = si.getComponent(v, k);
      if (keep.has(bone)) w += sw.getComponent(v, k);
    }
    vertKeep[v] = w >= minWeight ? 1 : 0;
  }
  const oldIndex = geo.index;
  const src = oldIndex ? oldIndex.array : null;
  const count = src ? src.length : si.count;
  const out = [];
  for (let i = 0; i < count; i += 3) {
    const a = src ? src[i] : i, b = src ? src[i + 1] : i + 1, c = src ? src[i + 2] : i + 2;
    if (vertKeep[a] && vertKeep[b] && vertKeep[c]) out.push(a, b, c);
  }
  if (!out.length) return;
  geo.setIndex(out);
  geo.computeBoundingSphere();
}
