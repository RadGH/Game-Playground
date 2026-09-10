// Quaternius CC0 modular character: Universal Base body + hairstyles + Modular Outfits (Fantasy) + Universal Animation
// Library, all sharing one UE-style skeleton (root, pelvis, spine_01..03, neck_01, Head, clavicle/upperarm/lowerarm/hand_l/r,
// thigh/calf/foot/ball_l/r …). Each glTF part has its own skeleton, so each gets its own AnimationMixer playing the same
// clip in lock-step. Height/width = bone scaling (thighs/calves for height, spine for width, head compensated).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { normalizeAvatar } from '../../avatar-2d/js/render.js';

THREE.Cache.enabled = true;
const BASE = new URL('../assets/quaternius/', import.meta.url).href;
const loader = new GLTFLoader();
const gltfCache = new Map();
function loadGLTF(path) { if (!gltfCache.has(path)) gltfCache.set(path, loader.loadAsync(BASE + path)); return gltfCache.get(path); }

/** Mapping from the shared avatar JSON ids to Quaternius files (free tier). */
export const MAP = {
  frame: { m: 'Superhero_Male', f: 'Superhero_Female' },
  hair: { bald: null, buzz: 'Hair_Buzzed', short: 'Hair_SimpleParted', side_part: 'Hair_SimpleParted', bangs: 'Hair_Long', bob: 'Hair_Long', long: 'Hair_Long', wavy: 'Hair_Long', ponytail: 'Hair_Buns', bun: 'Hair_Buns', buns: 'Hair_Buns', mohawk: 'Hair_Buzzed', spiky: 'Hair_SimpleParted', curly: 'Hair_Buns', afro: 'Hair_Buns', braids: 'Hair_Long', pixie: 'Hair_BuzzedFemale', slicked: 'Hair_SimpleParted', hood_hair: 'Hair_Long', tonsure: 'Hair_Buzzed', horns_hair: 'Hair_Buzzed' },
  // outfit set by top id; each set has Arms/Body/Legs/Feet (+ extras)
  set: { tshirt: 'Peasant', tunic: 'Peasant', hoodie: 'Peasant', vest: 'Peasant', tank: 'Peasant', rags: 'Peasant', apron: 'Peasant', dress: 'Peasant', robe: 'Peasant', plate: 'Ranger', leather: 'Ranger', chainmail: 'Ranger', coat: 'Ranger' },
  feet: { Ranger: { m: 'Male_Ranger_Feet_Boots', f: 'Female_Ranger_Feet' }, Peasant: { m: 'Male_Peasant_Feet', f: 'Female_Peasant_Feet' } },
  hatToHood: ['hood', 'wizard'], pauldronTops: ['plate', 'chainmail'],
};
export const CLIPS = ['Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Idle_Talking_Loop', 'Dance_Loop', 'Sword_Idle', 'Sword_Attack', 'Spell_Simple_Shoot', 'Sitting_Idle_Loop', 'Hit_Chest', 'Death01', 'Crouch_Idle_Loop', 'Interact', 'PickUp_Table', 'Punch_Jab', 'Roll', 'Jump_Loop'];

const texCache = new Map();
function loadTex(file) { if (!texCache.has(file)) { const t = new THREE.TextureLoader().load(BASE + file); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; texCache.set(file, t); } return texCache.get(file); }

/** Returns { group, setAvatar(av), play(clipName), clips, update(dt), setAnim(name), dispose } */
export async function createQuaterniusCharacter(avatar) {
  const group = new THREE.Group(); group.userData.character = true;
  const anim = await loadGLTF('anim/UAL1_Standard.glb');
  // drop the scale tracks so our body-proportion bone scaling survives the animation
  const clipByName = Object.fromEntries(anim.animations.map(c => [c.name, new THREE.AnimationClip(c.name, c.duration, c.tracks.filter(t => !t.name.endsWith('.scale')))]));
  const state = { mixers: [], skeletons: [], current: 'Idle_Loop', parts: [], avatar: null, headBone: null };
  const rig = { m: null };

  async function build(av) {
    const a = normalizeAvatar(av); state.avatar = a;
    for (const p of state.parts) { group.remove(p); p.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    state.parts = []; state.mixers = []; state.skeletons = [];
    const frame = a.body.frame === 'f' ? 'f' : 'm';
    const light = isLight(a.body.skin);
    // body
    const bodyG = await loadGLTF(`base/${MAP.frame[frame]}_FullBody.gltf`);
    const body = cloneScene(bodyG.scene); addPart(body, 'body');
    body.traverse(o => {
      if (!o.isMesh) return; o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
      const n = o.material?.name || '';
      if (/Superhero|Regular/.test(n)) { o.material = o.material.clone(); if (light) o.material.map = loadTex(frame === 'm' ? 'base/T_Superhero_Male_Light.png' : 'base/T_Superhero_Female_Light_BaseColor.png'); o.material.color.set(tintFor(a.body.skin, light)); }
      else if (/Hair/.test(n)) { o.material = o.material.clone(); o.material.color.set(a.hair.color); if (o.name === 'Eyebrows' || /brow/i.test(o.name)) o.material.color.set(a.hair.color); }
      else if (/Eyes/.test(n)) { o.material = o.material.clone(); o.material.color.set(a.eyes.color).multiplyScalar(1.4); }
      if (o.isSkinnedMesh) state.skeletons.push(o.skeleton);
    });
    // the base body ships with its own hair mesh; hide it (we attach a hairstyle) — the eyebrows stay
    body.traverse(o => { if (o.isMesh && /Hair/.test(o.material?.name || '') && !/brow/i.test(o.name) && o.name !== 'Eyebrows') o.visible = a.hair.id === 'bald' ? false : false; });
    state.headBone = body.getObjectByName('Head');
    // hairstyle (unrigged, origin at 0) → attach to head bone
    const hairFile = MAP.hair[a.hair.id];
    if (hairFile && a.hat.id !== 'hood' && a.hat.id !== 'helmet' && a.hat.id !== 'horned_helm') {
      const hg = await loadGLTF(`hair/${hairFile}.gltf`); const hair = cloneScene(hg.scene);
      hair.traverse(o => { if (o.isMesh) { o.castShadow = true; o.material = o.material.clone(); o.material.color.set(a.hair.color); } });
      group.add(hair); body.updateMatrixWorld(true); state.headBone.attach(hair); state.parts.push(hair); hair.userData.attachedToHead = true;
    }
    // facial hair (beard mesh exists only as a hair file)
    if (a.facialHair.id !== 'none') { const bg = await loadGLTF('hair/Hair_Beard.gltf'); const beard = cloneScene(bg.scene); beard.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.set(a.hair.color); } }); group.add(beard); body.updateMatrixWorld(true); state.headBone.attach(beard); state.parts.push(beard); }
    // outfit
    const set = MAP.set[a.top.id] || 'Peasant'; const g = frame === 'm' ? 'Male' : 'Female';
    const pieces = [`${g}_${set}_Body`, `${g}_${set}_Arms`, `${g}_${set}_Legs`, MAP.feet[set][frame]];
    if (set === 'Ranger' && MAP.pauldronTops.includes(a.top.id)) pieces.push(frame === 'm' ? 'Male_Ranger_Acc_Pauldron' : 'Female_Ranger_Acc_Pauldrons');
    if (set === 'Ranger' && a.hat.id === 'hood') pieces.push(`${g}_Ranger_Head_Hood`);
    const tint = { Body: a.top.color, Arms: a.top.color, Legs: a.bottom.color, Feet: a.shoes.color, Pauldron: a.top.color2, Hood: a.hat.color };
    for (const name of pieces) {
      try {
        const pg = await loadGLTF(`outfits/${name}.gltf`); const part = cloneScene(pg.scene);
        const key = Object.keys(tint).find(k => name.includes(k)); const col = tint[key];
        part.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; o.material = o.material.clone(); if (col && a.body.tintOutfit !== false) o.material.color.set(col).multiplyScalar(1.6); if (o.isSkinnedMesh) state.skeletons.push(o.skeleton); } });
        addPart(part, name);
      } catch (e) { console.warn('outfit part failed', name, e); }
    }
    applyBodyScale(a.body);
    play(state.current);
  }
  function addPart(obj, name) { obj.name = name; group.add(obj); state.parts.push(obj); const mixer = new THREE.AnimationMixer(obj); state.mixers.push(mixer); }
  function applyBodyScale(body) {
    const h = body.height ?? 0.5, w = body.width ?? 0.5, hs = body.headSize ?? 0.5;
    const legS = 0.8 + h * 0.45, widthS = 0.8 + w * 0.45, headS = 0.85 + hs * 0.35;
    for (const part of state.parts) {
      const set = (n, x, y, z) => { const b = part.getObjectByName(n); if (b) b.scale.set(x, y, z); };
      set('thigh_l', 1, legS, 1); set('thigh_r', 1, legS, 1);      // legs longer (bone Y = along the bone)
      set('spine_01', widthS, 1, widthS);                          // wider chest; children inherit…
      set('neck_01', 1 / widthS, 1, 1 / widthS);                   // …so undo it at the neck
      set('Head', headS, headS, headS);
    }
    // lift the root so the feet stay on the ground when legs are longer
    group.position.y = 0; group.updateMatrixWorld(true);
    const foot = state.parts[0]?.getObjectByName('foot_l'); if (foot) { const p = new THREE.Vector3(); foot.getWorldPosition(p); group.position.y = Math.max(0, -(p.y - 0.09)); }
  }
  function play(name) {
    const clip = clipByName[name] || clipByName.Idle_Loop; state.current = clip.name;
    for (const m of state.mixers) { m.stopAllAction(); const act = m.clipAction(clip); act.reset(); act.setLoop(name === 'Death01' ? THREE.LoopOnce : THREE.LoopRepeat); act.clampWhenFinished = true; act.play(); }
  }
  await build(avatar);
  return {
    group, clips: Object.keys(clipByName), play, mixers: state.mixers,
    async setAvatar(av) { await build(av); },
    setAnim(name) { play({ idle: 'Idle_Loop', walk: 'Walk_Loop', run: 'Sprint_Loop', talk: 'Idle_Talking_Loop', wave: 'Interact', dead: 'Death01' }[name] || name); },
    get anim() { return state.current; },
    update(dt) { for (const m of state.mixers) m.update(dt); },
    dispose() { for (const p of state.parts) p.traverse(o => { if (o.geometry) o.geometry.dispose(); }); },
  };
}
function cloneScene(scene) { return SkeletonUtilsClone(scene); }
// minimal SkeletonUtils.clone (avoids importing the whole addon): clones the hierarchy and rebinds skinned meshes
function SkeletonUtilsClone(source) {
  const sourceLookup = new Map(), cloneLookup = new Map(); const clone = source.clone();
  parallelTraverse(source, clone, (s, c) => { sourceLookup.set(c, s); cloneLookup.set(s, c); });
  clone.traverse(node => { if (!node.isSkinnedMesh) return; const sourceMesh = sourceLookup.get(node), sourceBones = sourceMesh.skeleton.bones; node.skeleton = sourceMesh.skeleton.clone(); node.bindMatrix.copy(sourceMesh.bindMatrix); node.skeleton.bones = sourceBones.map(b => cloneLookup.get(b)); node.bind(node.skeleton, node.bindMatrix); });
  return clone;
}
function parallelTraverse(a, b, cb) { cb(a, b); for (let i = 0; i < a.children.length; i++) parallelTraverse(a.children[i], b.children[i], cb); }
function isLight(hex) { const n = parseInt(hex.slice(1), 16); const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255; return (r + g + b) / 3 > 150; }
/** Tint so the texture's average tone (light ≈ #a67858, dark ≈ #9c6e4e) becomes the requested skin colour. */
function tintFor(hex, light) { const base = light ? [166, 120, 88] : [156, 110, 78]; const n = parseInt(hex.slice(1), 16); const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; return new THREE.Color(...c.map((v, i) => Math.min(2.2, v / base[i]))); }
