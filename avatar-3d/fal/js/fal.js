// fal test runtime — bodies, armour and weapons made with fal.ai, on the free Universal Animation Library skeleton.
//
//   const c = await createFalCharacter('male');   scene.add(c.group);   c.play('walk');   c.update(dt) each frame
//   await c.equip('chest', 'plate-chest');  await c.equip('weapon', 'sword');  await c.equip('chest', null)
//
// Bodies (models/final/<body>.glb): one textured mesh split into regions (Body_head, Body_torso, Body_upperarms …),
//   skinned to the 65-bone UAL skeleton (tools/blender/to_ual.py).
// Armour (models/final/gear/<item>-<body>.glb): a skinned mesh fitted over that body in Blender, weights copied from
//   the body under it, with its OWN bind pose. Here its bones are swapped for the body's bones (same names), so the
//   body's animation drives it. Each piece lists the body regions it covers (`hides`); those are hidden while worn.
// Weapons (models/final/props/<item>.glb): rigid, origin at the grip, long axis +Z (Blender), held on a hand bone by a
//   socket matrix in that bone's own frame (data/catalog.json sockets, tools/blender/sockets.py).
// Clips: models/final/anims.glb — rotations only, plus the pelvis position re-based to each body's pelvis height.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { blendTo } from '../../js/anim-blend.js';
import { createBeastMotion } from './beast.js';

const ROOT = new URL('../', import.meta.url);
const at = p => new URL(p, ROOT).href;
const loader = new GLTFLoader();
const glbs = new Map();
let CATALOG = null, ANIMS = null;

export function glb(path) {
  if (!glbs.has(path)) glbs.set(path, loader.loadAsync(at(path)));
  return glbs.get(path);
}

export async function loadCatalog() {
  if (!CATALOG) CATALOG = fetch(at('data/catalog.json')).then(r => { if (!r.ok) throw new Error('catalog ' + r.status); return r.json(); });
  return CATALOG;
}

export const CLIPS = [
  ['idle', 'Idle_Loop', 'Idle'], ['walk', 'Walk_Loop', 'Walk'], ['run', 'Jog_Fwd_Loop', 'Run'],
  ['ready', 'Sword_Idle', 'Weapon ready'], ['attack', 'Sword_Attack', 'Swing'], ['cast', 'Spell_Simple_Shoot', 'Cast'],
  ['punch', 'Punch_Jab', 'Punch'], ['dance', 'Dance_Loop', 'Dance'], ['hit', 'Hit_Chest', 'Get hit'], ['death', 'Death01', 'Fall down'],
];

// Hands (Test 3b, owner 2026-11-23: "none of them are grasping the weapon"). to_ual.py fits the library's finger bones
// to each hand and weights the fingers to them. The clips curl fingers on their own; here:
//   holding something in that hand (palm_r → right, palm_l / forearm_l → left): each finger is at least closed into a
//     fist round the handle (a clip that already curls further keeps its own motion)
//   empty hand: the clip's curl is mostly relaxed back toward the open, modelled hand (the library's idle is a loose fist)
// The curl turns each finger joint toward the palm (palms face down in the rest T-pose), about its own axis.
const GRIP = { thumb: [0.35, 0.55, 0.45], index: [1.25, 1.45, 0.95], middle: [1.3, 1.5, 1.0], ring: [1.3, 1.5, 1.0], pinky: [1.25, 1.45, 0.95] };
const OPEN = 0.7;   // how far an empty hand relaxes back toward the open pose
function handRig(root, bones) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Quaternion(); root.getWorldQuaternion(inv); inv.invert();
  const down = new THREE.Vector3(0, -1, 0), wp = new THREE.Vector3(), cp = new THREE.Vector3(), wq = new THREE.Quaternion();
  const side = { l: [], r: [] };
  for (const [name, b] of Object.entries(bones)) {
    const m = name.match(/^(thumb|index|middle|ring|pinky)_0([123])_([lr])$/); if (!m) continue;
    const child = b.children.find(c => c.isBone); if (!child) continue;
    b.getWorldPosition(wp); child.getWorldPosition(cp);
    const dir = cp.sub(wp).normalize();
    const axis = new THREE.Vector3().crossVectors(dir, down);
    if (axis.lengthSq() < 1e-6) continue;
    axis.normalize();
    b.getWorldQuaternion(wq); wq.premultiply(inv);
    const local = axis.applyQuaternion(wq.clone().invert());
    const angle = GRIP[m[1]][+m[2] - 1];
    const rest = b.quaternion.clone();
    side[m[3]].push({ b, rest, fist: rest.clone().multiply(new THREE.Quaternion().setFromAxisAngle(local, angle)), angle });
  }
  const held = { l: new Set(), r: new Set() };
  const q = new THREE.Quaternion();
  return {
    has: side.r.length + side.l.length > 0,
    hold(slot, grip) {
      for (const s of ['l', 'r']) held[s].delete(slot);
      if (grip === 'palm_r') held.r.add(slot); else if (grip === 'palm_l' || grip === 'forearm_l') held.l.add(slot);
    },
    update() {
      for (const s of ['l', 'r']) {
        const grip = held[s].size > 0;
        for (const f of side[s]) {
          if (grip) { if (f.b.quaternion.angleTo(f.rest) < f.angle * 0.85) f.b.quaternion.copy(f.fist); }
          else f.b.quaternion.slerp(f.rest, OPEN);
        }
      }
    },
  };
}

async function anims() {
  if (!ANIMS) ANIMS = glb('models/final/anims.glb').then(g => {
    let pelvisRest = null;
    g.scene.traverse(o => { if (o.isBone && o.name === 'pelvis') pelvisRest = o.position.clone(); });
    const clips = {};
    for (const c of g.animations) {
      const tracks = c.tracks.filter(t => t.name.endsWith('.quaternion') || t.name === 'pelvis.position');
      clips[c.name] = new THREE.AnimationClip(c.name, c.duration, tracks);
    }
    return { clips, pelvisRest };
  });
  return ANIMS;
}

function paintedMaterial(src) {
  // the textures already hold painted light and shade: a soft Lambert keeps them reading as painted
  // (Rodin's "shaded" output keeps its painting in the emissive slot with a black base colour).
  // Two-sided: generated clothes are single shells (a hood, a cape, a coat hem) that showed see-through from inside.
  const map = src.map || src.emissiveMap || null;
  if (map) map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshLambertMaterial({ map, color: map ? 0xffffff : src.color, side: THREE.DoubleSide });
}

export async function createFalCharacter(bodyId) {
  const cat = await loadCatalog();
  const def = cat.bodies.find(b => b.id === bodyId);
  if (!def) throw new Error('no body ' + bodyId);
  if (def.skeleton === 'quadruped') return createFalBeast(def);
  const [src, A] = await Promise.all([glb(def.file), anims()]);
  const root = SkeletonUtils.clone(src.scene);
  const group = new THREE.Group(); group.add(root); group.userData.character = true;
  const bones = {}, regions = {};
  let skinParent = null;
  root.traverse(o => {
    if (o.isBone) bones[o.name] = o;
    if (o.isSkinnedMesh) {
      o.frustumCulled = false; o.castShadow = true;
      o.material = paintedMaterial(o.material);
      regions[o.name.replace(/^Body_/, '')] = o;
      skinParent = o.parent;
    }
  });
  // pelvis height: the library's clips were made for its own mannequin; scale their pelvis track to this body
  const pelvisRest = bones.pelvis.position.clone();
  const k = pelvisRest.length() / A.pelvisRest.length();
  const clips = {};
  for (const [key, name] of CLIPS) {
    const c = A.clips[name]; if (!c) continue;
    const tracks = c.tracks.map(t => {
      if (t.name !== 'pelvis.position') return t;
      const v = t.values.slice(); for (let i = 0; i < v.length; i++) v[i] *= k;
      return new THREE.VectorKeyframeTrack(t.name, t.times, v);
    });
    clips[key] = new THREE.AnimationClip(name, c.duration, tracks);
  }
  const mixer = new THREE.AnimationMixer(root);
  const hands = handRig(root, bones);
  let action = null, clipKey = null;
  function play(key, fade = 0.25) {
    const c = clips[key]; if (!c) return;
    const next = mixer.clipAction(c);
    const once = key === 'death' || key === 'attack' || key === 'cast' || key === 'punch' || key === 'hit';
    blendTo(mixer, next, fade, once);              // weights always sum to 1: no T-pose flashes between clips
    action = next; clipKey = key;
  }

  const worn = {}, pieces = {};
  function refreshRegions() {
    const hidden = new Set();
    for (const s of Object.keys(worn)) { const it = cat.items.find(i => i.id === worn[s]); const h = it?.hides; for (const r of (Array.isArray(h) ? h : h?.[bodyId]) || []) hidden.add(r); }
    for (const [r, m] of Object.entries(regions)) m.visible = !hidden.has(r);
  }

  async function equip(slot, itemId) {
    for (const o of pieces[slot] || []) o.parent?.remove(o);
    delete pieces[slot];
    if (!itemId) { delete worn[slot]; refreshRegions(); hands.hold(slot, null); return; }
    const it = cat.items.find(i => i.id === itemId);
    if (!it || it.slot !== slot) throw new Error(itemId + ' is not a ' + slot + ' item');
    worn[slot] = itemId;
    const list = [];
    if (it.kind === 'wear') {
      const file = it.files?.[bodyId];
      if (!file) { refreshRegions(); return; }
      const g = await glb(file);
      if (worn[slot] !== itemId) return;               // changed again while loading
      const copy = SkeletonUtils.clone(g.scene);
      copy.updateMatrixWorld(true);
      copy.traverse(o => {
        if (!o.isSkinnedMesh) return;
        // same bone names, the piece's own bind pose: swap its bones for the body's
        const sk = o.skeleton;
        const mapped = sk.bones.map(b => bones[b.name] || b);
        const mesh = new THREE.SkinnedMesh(o.geometry, paintedMaterial(o.material));
        mesh.name = it.id; mesh.frustumCulled = false; mesh.castShadow = true;
        skinParent.add(mesh);
        mesh.bind(new THREE.Skeleton(mapped, sk.boneInverses.map(m => m.clone())), o.bindMatrix.clone());
        list.push(mesh);
      });
    } else {
      const g = await glb(it.file);
      if (worn[slot] !== itemId) return;
      for (const s of cat.sockets[bodyId]?.[it.grip] || []) {
        const bone = bones[s.bone]; if (!bone) continue;
        const holder = new THREE.Group(); holder.matrixAutoUpdate = false; holder.matrix.fromArray(s.matrix);
        const inner = g.scene.clone(true); inner.rotation.x = Math.PI / 2;   // the file is Y-up; the socket is Blender Z-up
        inner.traverse(m => { if (m.isMesh) { m.material = paintedMaterial(m.material); m.castShadow = true; m.frustumCulled = false; } });
        holder.add(inner); bone.add(holder); list.push(holder);
      }
    }
    pieces[slot] = list;
    refreshRegions();
    hands.hold(slot, it.kind === 'held' ? it.grip : null);
  }

  function stats() {
    let triangles = 0, draws = 0;
    group.traverse(o => {
      if (!o.isMesh || !o.visible) return;
      let p = o.parent, vis = true; while (p) { if (!p.visible) vis = false; p = p.parent; }
      if (!vis) return;
      const g = o.geometry; triangles += (g.index ? g.index.count : g.attributes.position.count) / 3; draws++;
    });
    return { triangles: Math.round(triangles), draws, bones: Object.keys(bones).length };
  }

  play('idle', 0);
  mixer.update(0);                                  // posed now: never drawn in the bind (T) pose for a frame
  return {
    group, bones, regions, def, worn, play, equip, stats,
    get clip() { return clipKey; },
    update(dt) { mixer.update(dt); hands.update(); },
  };
}

// Four-legged bodies (catalog skeleton 'quadruped', rigged by tools/blender/quad_rig.py): the same object as a biped,
// moved by js/beast.js instead of library clips. They hold nothing: equip() only accepts null.
async function createFalBeast(def) {
  const src = await glb(def.file);
  const root = SkeletonUtils.clone(src.scene);
  const group = new THREE.Group(); group.add(root); group.userData.character = true;
  const bones = {}, regions = {};
  root.traverse(o => {
    if (o.isBone) bones[o.name] = o;
    if (o.isSkinnedMesh) { o.frustumCulled = false; o.castShadow = true; o.material = paintedMaterial(o.material); regions[o.name.replace(/^Body_/, '')] = o; }
  });
  const motion = createBeastMotion(root, bones);
  function stats() {
    let triangles = 0, draws = 0;
    group.traverse(o => { if (o.isMesh && o.visible) { const g = o.geometry; triangles += (g.index ? g.index.count : g.attributes.position.count) / 3; draws++; } });
    return { triangles: Math.round(triangles), draws, bones: Object.keys(bones).length };
  }
  motion.play('idle', 0);
  return {
    group, bones, regions, def, worn: {}, stats,
    play: (key, fade) => motion.play(key, fade),
    async equip(slot, itemId) { if (itemId) throw new Error(def.id + ' cannot hold ' + itemId); },
    get clip() { return motion.clip; },
    update(dt) { motion.update(dt); },
  };
}
