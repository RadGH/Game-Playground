// Chibi 4 step 10a — weapons, off-hands and seats on the Chibi 4 kit body.
//
//   import { createHoldRig, buildHeldItem, seatHeight } from './chibi4-held.js';
//   const rig = createHoldRig(actor, kit);            // chibi4-kit.js does this for you: actor.equip({ held, offhand })
//   await rig.equip({ held: { id: 'fh_longsword' }, offhand: { id: 'fh_kite_shield', color: '#7a1020' } });
//   rig.update(clipName, action)                      // after the mixer, every frame the body animates
//
// THE MODELS ARE CHIBI 2'S. Every one of the 106 held / off-hand catalog rows is built by the Chibi 2 procedural
// builders (chibi2-gear.js, chibi2-weapons*.js, chibi2-gear5*.js) on a throwaway Chibi 2 body; the triangles the
// item ADDED are lifted out (by comparing against the bare body, the Armory's trick), each in the space of the Chibi 2
// bone that carries it, turned into the canonical item frame (chibi4-grip.js: +Y the business end, +X the striking
// side, origin in the fist), scaled to a real-world length and hung on a Chibi 4 bone through an "anchor". Nothing is
// remodelled; a new Chibi 2 weapon is a new Chibi 4 weapon the moment it is in the catalog.
//
// THE HAND. The kit's rig (MakeHuman game_engine) has five fingers and a real wrist. Each hand's anatomical frame is
// measured from its own finger bones (D along the hand to the knuckles, R toward the thumb side, P out of the palm),
// so the same numbers fit the male and the female body. A closed fist's tunnel is FIST_AT; the handle crosses it
// tilted GRIP_TILT toward the fingertips on the thumb side, the way a real fist holds a hilt.
//
// THE HOLD POSE (runs after the mixer, so it sits on top of every retargeted clip):
//   * fingers curl round the handle (FIST), or loosely for a strapped shield (LOOSE); flex axes found per bone
//   * 'fist' families (sword, dagger, axe, mace, wand): the arm is the clip's; the wrist keeps ONE turn for the whole
//     clip — solved once from the clip's first frame so the item points the family's `aim` there — so a carried
//     weapon rides the fist through walk and run (the Z63 rule) and swings with the arm in an attack
//   * 'steady' families (staff, spear, polearm, two-hander at rest, bow, crossbow, torch, foci): the hand is placed
//     in the chest's frame by a two-bone arm IK and the item aimed; `second` puts the other hand on the handle
//   * the bow draws: the right hand pulls the string from the bow to the cheek, and the string is a live line
//   * hands-free clips (emotes, swimming, punches…) put the items away, like Chibi 2's HANDS_FREE
//   * a pose change blends over 0.2 s
//
// Draw calls: one per item piece (a sword is one, a pair of daggers two), never merged into the body — clothes are
// merged per outfit and shared between characters, weapons change far too often for that.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { createChibi2Character } from '../../js/chibi2.js';
import { vertexKeys } from '../../js/preview-kit.js';
import { heldSpec, holdState, poseFor, FIST, LOOSE, GRIP_TILT, FIST_AT, SEAT_CLEARANCE } from './chibi4-grip.js';
import { clipFor } from './chibi4-outfit.js';

const V = () => new THREE.Vector3();
const _v = V(), _w = V(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4();
const AX = { '+x': [1, 0, 0], '-x': [-1, 0, 0], '+y': [0, 1, 0], '-y': [0, -1, 0], '+z': [0, 0, 1], '-z': [0, 0, -1] };

// ---------------------------------------------------------------- 1. lifting an item out of a Chibi 2 body
let bareKeys = null;
const items = new Map();                 // `${slot}:${id}:${colours}` -> Promise<item>
const C2_BASE = { body: { gender: 'male' }, held: { id: 'none' }, offhand: { id: 'none' }, cape: { id: 'none' }, decor: { id: 'none' }, accessory: { id: 'none' } };

async function bare() {
  if (!bareKeys) bareKeys = (async () => { const c = await createChibi2Character(C2_BASE, { anims: ['idle'] }); const k = vertexKeys(c); c.dispose(); return k; })();
  return bareKeys;
}
const keyOf = (p, c, i) => `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}|${c ? c.getX(i).toFixed(3) + c.getY(i).toFixed(3) : ''}`;

/** The item's triangles per carrying Chibi 2 bone, in that bone's (bind) space. */
async function liftChibi2(id, slot, colors = {}) {
  const base = await bare();
  const part = { id, ...(colors.color ? { color: colors.color } : {}), ...(colors.color2 ? { color2: colors.color2 } : {}) };
  const c2 = await createChibi2Character({ ...C2_BASE, [slot]: part }, { anims: ['idle'] });
  const bones = c2.skeleton.bones, inv = c2.skeleton.boneInverses;
  const per = new Map();                 // bone name -> { pos, nrm, col, metal, index, map }
  const nm = new THREE.Matrix3();
  c2.group.traverse(mesh => {
    if (!mesh.isSkinnedMesh) return;
    const g = mesh.geometry, p = g.attributes.position, n = g.attributes.normal, c = g.attributes.color, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    const metal = /metal/.test(mesh.name) ? 1 : 0;
    const idx = g.index ? g.index.array : null, count = idx ? idx.length : p.count;
    const fresh = new Uint8Array(p.count);
    for (let i = 0; i < p.count; i++) fresh[i] = base.has(keyOf(p, c, i)) ? 0 : 1;
    const boneOf = i => (sw.getY(i) > sw.getX(i) ? si.getY(i) : si.getX(i));
    for (let t = 0; t < count; t += 3) {
      const a = idx ? idx[t] : t, b = idx ? idx[t + 1] : t + 1, d = idx ? idx[t + 2] : t + 2;
      if (!(fresh[a] && fresh[b] && fresh[d])) continue;
      const bi = boneOf(a), name = bones[bi]?.name || 'root';
      let e = per.get(name);
      if (!e) { e = { pos: [], nrm: [], col: [], metal: [], index: [], map: new Map(), bi }; per.set(name, e); }
      for (const v of [a, b, d]) {
        const k = mesh.id * 1e7 + v;
        let o = e.map.get(k);
        if (o === undefined) {
          o = e.pos.length / 3; e.map.set(k, o);
          _v.fromBufferAttribute(p, v).applyMatrix4(inv[e.bi]); e.pos.push(_v.x, _v.y, _v.z);
          nm.getNormalMatrix(inv[e.bi]); _w.fromBufferAttribute(n, v).applyMatrix3(nm).normalize(); e.nrm.push(_w.x, _w.y, _w.z);
          if (c) e.col.push(c.getX(v), c.getY(v), c.getZ(v)); else e.col.push(0.6, 0.6, 0.6);
          e.metal.push(metal);
        }
        e.index.push(o);
      }
    }
  });
  c2.dispose();
  return [...per.entries()].map(([bone, e]) => ({ bone, ...e }));
}

/** Chibi 2 axis name -> the rotation taking the item's frame axes (y, x) onto canonical +Y, +X. */
function canonicalBasis(yAxis, xAxis) {
  const y = new THREE.Vector3(...AX[yAxis]), x = new THREE.Vector3(...AX[xAxis]);
  if (Math.abs(x.dot(y)) > 0.5) x.set(...AX[yAxis === '+z' || yAxis === '-z' ? '+x' : '+z']);
  const z = new THREE.Vector3().crossVectors(x, y);
  // rows: canonical = M * chibi2 (M's rows are the chibi2 directions of canonical X, Y, Z)
  return new THREE.Matrix4().set(x.x, x.y, x.z, 0, y.x, y.y, y.z, 0, z.x, z.y, z.z, 0, 0, 0, 0, 1);
}

const STRING_COL = new THREE.Color('#e8e0c0');          // THREE.Color reads hex as sRGB and stores linear, like Chibi 2's vertex colours
const nearCol = (col, i, c) => Math.abs(col[i] - c.r) + Math.abs(col[i + 1] - c.g) + Math.abs(col[i + 2] - c.b) < 0.06;

/**
 * One item, ready to hang on a Chibi 4 body: `{ spec, pieces: [{ hand: 'R'|'L'|null, chibi2Bone, geometry, size, tips }] }`.
 * Geometry is in the CANONICAL frame, real-world size. Cached per id + slot + colours; every character shares it.
 */
export function buildHeldItem(id, slot = 'held', { type = null, color, color2 } = {}) {
  const key = `${slot}:${id}:${color || ''}:${color2 || ''}`;
  if (!items.has(key)) items.set(key, (async () => {
    const spec = heldSpec(id, slot, type);
    const raw = await liftChibi2(id, slot, { color, color2 });
    const M = canonicalBasis(spec.frame.y, spec.frame.x);
    const pieces = [];
    for (const r of raw) {
      if (!r.index.length) continue;
      const handOf = /R$/.test(r.bone) ? 'R' : /L$/.test(r.bone) ? 'L' : null;
      // the bow's own string is drawn live (it bends when drawn); a quiver's chest strap was fitted to a doll's chest
      let index = r.index;
      if (spec.kind === 'bow') index = dropTris(r, i => nearCol(r.col, i * 3, STRING_COL));
      if (spec.kind === 'quiver') index = dropStrap(r);
      const pos = new Float32Array(r.pos.length), nrm = new Float32Array(r.nrm.length);
      const gripPt = Array.isArray(spec.frame.at) ? new THREE.Vector3(...spec.frame.at) : null;
      for (let i = 0; i < r.pos.length; i += 3) {
        _v.set(r.pos[i], r.pos[i + 1], r.pos[i + 2]); if (gripPt) _v.sub(gripPt); _v.applyMatrix4(M);
        pos[i] = _v.x; pos[i + 1] = _v.y; pos[i + 2] = _v.z;
        _w.set(r.nrm[i], r.nrm[i + 1], r.nrm[i + 2]).transformDirection(M);
        nrm[i] = _w.x; nrm[i + 1] = _w.y; nrm[i + 2] = _w.z;
      }
      // origin: the fist (already), the item's centre, or the middle of its base (a focus stands on the fist)
      const box = boxOf(pos, index);
      if (!gripPt) {
        const o = box.getCenter(V()); if (spec.frame.at === 'base') o.y = box.min.y;
        for (let i = 0; i < pos.length; i += 3) { pos[i] -= o.x; pos[i + 1] -= o.y; pos[i + 2] -= o.z; }
        box.translate(o.negate());
      }
      // size: the business axis to a real length; the cross-section a little thinner (a doll's grip is fat)
      const size = box.getSize(V());
      const along = ['shield', 'book', 'orb', 'caster', 'instrument', 'quiver', 'hipquiver'].includes(spec.kind) ? Math.max(size.x, size.y, size.z) : size.y;
      const s = spec.length / Math.max(0.02, along), sc = s * spec.cross;
      for (let i = 0; i < pos.length; i += 3) { pos[i] *= sc; pos[i + 1] *= s; pos[i + 2] *= sc; }
      // the normals of a non-uniform scale: divide by the scale and renormalise
      if (sc !== s) for (let i = 0; i < nrm.length; i += 3) { _w.set(nrm[i] / sc, nrm[i + 1] / s, nrm[i + 2] / sc).normalize(); nrm[i] = _w.x; nrm[i + 1] = _w.y; nrm[i + 2] = _w.z; }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(r.col), 3));
      g.setAttribute('c4metal', new THREE.BufferAttribute(new Float32Array(r.metal), 1));
      g.setIndex(index);
      g.computeBoundingBox(); g.computeBoundingSphere();
      const bb = g.boundingBox;
      pieces.push({ hand: handOf, chibi2Bone: r.bone, geometry: g, scale: s, size: bb.getSize(V()), box: bb.clone(),
        tips: spec.kind === 'bow' ? bowTips(pos, index, bb) : null });
    }
    if (!pieces.length) throw new Error(`chibi4-held: "${id}" (${slot}) built no triangles on the Chibi 2 body`);
    return { spec, pieces, triangles: pieces.reduce((n, p) => n + p.geometry.index.count / 3, 0) };
  })());
  return items.get(key);
}
function dropTris(r, isOut) {
  const out = [];
  for (let t = 0; t < r.index.length; t += 3) { const a = r.index[t], b = r.index[t + 1], c = r.index[t + 2]; if (isOut(a) && isOut(b) && isOut(c)) continue; out.push(a, b, c); }
  return out;
}
function dropStrap(r) {
  // the strap runs across the chest's FRONT (Chibi 2 chest z > 0.05); the quiver itself is on the back
  return dropTris(r, i => r.pos[i * 3 + 2] > 0.04);
}
function boxOf(pos, index) {
  const b = new THREE.Box3();
  for (const i of index) b.expandByPoint(_v.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]));
  return b;
}
/** A bow's two limb tips, on the string side (canonical: +Y up the upper limb, the string toward -X). */
function bowTips(pos, index, bb) {
  let top = null, bot = null;
  for (const i of index) {
    const y = pos[i * 3 + 1], x = pos[i * 3];
    if (y > bb.max.y - 0.04 && (!top || x < top.x)) top = new THREE.Vector3(x, y, pos[i * 3 + 2]);
    if (y < bb.min.y + 0.04 && (!bot || x < bot.x)) bot = new THREE.Vector3(x, y, pos[i * 3 + 2]);
  }
  return { top: top || new THREE.Vector3(0, bb.max.y, 0), bottom: bot || new THREE.Vector3(0, bb.min.y, 0) };
}
export function heldItemCacheSize() { return items.size; }

// one material for every held item: vertex colours, metal per vertex (Chibi 2's two buckets in one draw)
let sharedMat = null;
export function heldMaterial() {
  if (sharedMat) return sharedMat;
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
  m.onBeforeCompile = sh => {
    sh.vertexShader = 'attribute float c4metal;\nvarying float vC4metal;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvC4metal = c4metal;');
    sh.fragmentShader = 'varying float vC4metal;\n' + sh.fragmentShader
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n\tmetalnessFactor = mix( 0.0, 0.7, vC4metal );')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n\troughnessFactor = mix( 0.82, 0.36, vC4metal );');
  };
  m.customProgramCacheKey = () => 'chibi4-held';
  return (sharedMat = m);
}

// ---------------------------------------------------------------- 2. the Chibi 4 skeleton: frames measured once per body
const frames = new WeakMap();            // kit -> measured frames
/**
 * Per kit body: each hand's anatomical frame (in the hand bone's own space), finger flex axes, the chest's bind
 * frame, the forearm frame, and the rest rotations. Measured on the kit's untouched bind skeleton.
 */
export function kitFrames(kit) {
  if (frames.has(kit)) return frames.get(kit);
  const scene = kit.bodyGltf.scene; scene.updateMatrixWorld(true);
  const B = {}; scene.traverse(o => { if (o.isBone) B[o.name] = o; });
  const sceneInv = new THREE.Matrix4().copy(scene.matrixWorld).invert();
  const worldQ = b => b.getWorldQuaternion(new THREE.Quaternion());
  const out = { bones: Object.fromEntries(Object.entries(B).map(([n, b]) => [n, { q: b.quaternion.clone(), p: b.position.clone() }])), hands: {} };
  for (const s of ['r', 'l']) {
    const hand = B['hand_' + s], inv = new THREE.Matrix4().copy(hand.matrixWorld).invert();
    const loc = n => B[n].getWorldPosition(V()).applyMatrix4(inv);
    const mid = loc('middle_01_' + s), idx = loc('index_01_' + s), pky = loc('pinky_01_' + s);
    const D = mid.clone().normalize();
    const R = idx.clone().sub(pky); R.addScaledVector(D, -R.dot(D)).normalize();
    // right hand: D x R is the BACK of the hand; left hand (a mirror image): D x R is the palm
    const P = new THREE.Vector3().crossVectors(D, R); if (s === 'r') P.negate();
    const knuckle = mid.length();
    const fist = D.clone().multiplyScalar(FIST_AT.along * knuckle / 0.12).addScaledVector(P, FIST_AT.palm);
    // the handle: out of the thumb side, tilted toward the fingertips; the striking side faces where the knuckles punch
    const H = R.clone().multiplyScalar(Math.cos(GRIP_TILT)).addScaledVector(D, Math.sin(GRIP_TILT)).normalize();
    const E = D.clone().multiplyScalar(Math.cos(GRIP_TILT)).addScaledVector(R, -Math.sin(GRIP_TILT)).normalize();
    // the forearm: elbow -> wrist, and its outside (the back of the hand's side), in lowerarm space
    const lower = B['lowerarm_' + s], linv = new THREE.Matrix4().copy(lower.matrixWorld).invert();
    const wrist = hand.getWorldPosition(V()).applyMatrix4(linv);
    const handQinLower = worldQ(lower).invert().multiply(worldQ(hand));
    const F = wrist.clone().normalize();
    const dorsalF = P.clone().negate().applyQuaternion(handQinLower); dorsalF.addScaledVector(F, -dorsalF.dot(F)).normalize();
    // finger flex axes: for each joint, the bone-space axis that moves the next joint toward the palm
    const fingers = [];
    for (const f of ['index', 'middle', 'ring', 'pinky', 'thumb']) {
      const chain = [1, 2, 3].map(k => B[`${f}_0${k}_${s}`]).filter(Boolean);
      chain.forEach((b, k) => {
        const tipLocal = chain[k + 1] ? chain[k + 1].position.clone() : chain[k].position.clone().normalize().multiplyScalar(0.025);
        const want = f === 'thumb' ? P.clone().addScaledVector(R, -0.8).normalize() : P;
        let best = null, bestScore = -Infinity;
        for (const a of ['+x', '-x', '+z', '-z']) {
          const axis = new THREE.Vector3(...AX[a]);
          const moved = tipLocal.clone().applyAxisAngle(axis, 0.5).sub(tipLocal);
          // bone space -> hand space
          const toHand = new THREE.Matrix4().copy(hand.matrixWorld).invert().multiply(b.matrixWorld);
          moved.transformDirection(toHand);
          const score = moved.dot(want);
          if (score > bestScore) { bestScore = score; best = axis; }
        }
        fingers.push({ name: b.name, joint: k, thumb: f === 'thumb', axis: best, rest: b.quaternion.clone() });
      });
    }
    out.hands[s] = { D, R, P, H, E, fist, F, dorsalF, forearmLen: wrist.length(), fingers };
  }
  // the chest's bind rotation in character space (the body's root may carry Blender's axis turn)
  const sceneQ = worldQ(scene).invert();
  out.chestBindQ = sceneQ.clone().multiply(worldQ(B.spine_03));
  out.chestBindP = B.spine_03.getWorldPosition(V()).applyMatrix4(sceneInv);
  out.pelvisBindP = B.pelvis.getWorldPosition(V()).applyMatrix4(sceneInv);
  out.bindQ = name => sceneQ.clone().multiply(worldQ(B[name]));
  out.bindP = name => B[name].getWorldPosition(V()).applyMatrix4(sceneInv);
  frames.set(kit, out);
  return out;
}

/** The anchor that hangs an item's canonical frame on a Chibi 4 bone: { bone, position, quaternion } in bone space. */
export function anchorFor(fr, spec, hand) {
  const s = hand === 'L' ? 'l' : 'r', h = fr.hands[s];
  const basis = (X, Y) => { const x = X.clone().normalize(), y = Y.clone().addScaledVector(x, -Y.dot(x)).normalize(), z = new THREE.Vector3().crossVectors(x, y); return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)); };
  // body anchors: express character-space directions in the bone's bind space
  const inBone = (name, v) => v.clone().applyQuaternion(fr.bindQ(name).invert());
  switch (spec.mount) {
    case 'forearm': {
      const p = h.F.clone().multiplyScalar(h.forearmLen * 0.55).addScaledVector(h.dorsalF, 0.062);
      return { bone: 'lowerarm_' + s, position: p, quaternion: basis(h.dorsalF, h.F) };
    }
    case 'palm': {
      // a focus stands on the fist, up the thumb side; a spell or a map floats just off the palm
      const up = spec.kind === 'orb' ? 0.035 : 0.03;
      const p = h.fist.clone().addScaledVector(spec.kind === 'orb' ? h.R : h.P, spec.kind === 'orb' ? up : 0.06);
      if (spec.kind === 'book') p.copy(h.fist).addScaledVector(h.P, 0.02).addScaledVector(h.D, 0.02);
      return { bone: 'hand_' + s, position: p, quaternion: spec.kind === 'orb' ? basis(h.P, h.R) : basis(h.P, h.R) };
    }
    case 'stock':                   // a crossbow: pistol grip, muzzle along the forearm, the top up the thumb side
      return { bone: 'hand_' + s, position: h.fist.clone(), quaternion: basis(h.R, h.D) };
    case 'back': {
      const p = inBone('spine_03', new THREE.Vector3(-0.06, -0.06, -0.17));
      return { bone: 'spine_03', position: p, quaternion: basis(inBone('spine_03', new THREE.Vector3(0, 0, -1)), inBone('spine_03', new THREE.Vector3(-0.42, 1, -0.12))) };
    }
    case 'hip': {
      const p = inBone('pelvis', new THREE.Vector3(-0.2, -0.12, -0.02));
      return { bone: 'pelvis', position: p, quaternion: basis(inBone('pelvis', new THREE.Vector3(-1, 0, 0)), inBone('pelvis', new THREE.Vector3(0, 1, 0.18))) };
    }
    case 'chest': {
      const p = inBone('spine_03', new THREE.Vector3(0.0, -0.2, 0.2));
      return { bone: 'spine_03', position: p, quaternion: basis(inBone('spine_03', new THREE.Vector3(0, 0, 1)), inBone('spine_03', new THREE.Vector3(0.7, 0.75, 0))) };
    }
    default:                        // 'grip': the fist
      return { bone: 'hand_' + s, position: h.fist.clone(), quaternion: basis(h.E, h.H) };
  }
}

// ---------------------------------------------------------------- 3. the per-character rig
const STATES_BLEND = 0.2;
const ARM = s => ['upperarm_' + s, 'lowerarm_' + s, 'hand_' + s];

/** Two-bone IK: move `upper`/`lower` so the wrist (the `hand` bone's origin) reaches `target` (world). */
function ik2(upper, lower, hand, target, pole) {
  const a = upper.getWorldPosition(V()), b = lower.getWorldPosition(V()), c = hand.getWorldPosition(V());
  const l1 = a.distanceTo(b), l2 = b.distanceTo(c);
  const toT = target.clone().sub(a); let d = toT.length();
  d = Math.min(Math.max(d, Math.abs(l1 - l2) + 1e-3), (l1 + l2) * 0.999);
  const dir = toT.normalize();
  const cosA = THREE.MathUtils.clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
  const po = pole.clone().addScaledVector(dir, -pole.dot(dir)); if (po.lengthSq() < 1e-8) po.set(0, -1, 0); po.normalize();
  const e = a.clone().addScaledVector(dir, l1 * cosA).addScaledVector(po, l1 * sinA);
  rotateBoneWorld(upper, b.clone().sub(a).normalize(), e.clone().sub(a).normalize());
  const c2 = hand.getWorldPosition(V()), b2 = lower.getWorldPosition(V());
  const tgt = a.clone().addScaledVector(dir, d);
  rotateBoneWorld(lower, c2.sub(b2).normalize(), tgt.sub(b2).normalize());
}
function rotateBoneWorld(bone, from, to) {
  const qd = new THREE.Quaternion().setFromUnitVectors(from, to);
  const wq = bone.getWorldQuaternion(new THREE.Quaternion());
  const pq = bone.parent.getWorldQuaternion(new THREE.Quaternion());
  bone.quaternion.copy(pq.invert().multiply(qd.multiply(wq)));
  bone.updateMatrixWorld(true);
}
function setBoneWorldQ(bone, wq) {
  const pq = bone.parent.getWorldQuaternion(new THREE.Quaternion());
  bone.quaternion.copy(pq.invert().multiply(wq));
  bone.updateMatrixWorld(true);
}
/** The world rotation that puts canonical +Y on `aim` and +X as near `face` as it can. */
function itemWorldQ(aim, face) {
  const y = aim.clone().normalize();
  const x = face.clone().addScaledVector(y, -face.dot(y));
  if (x.lengthSq() < 1e-6) x.set(1, 0, 0).addScaledVector(y, -y.x);
  x.normalize();
  const z = new THREE.Vector3().crossVectors(x, y);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

/**
 * The hold rig of one Chibi 4 character. `actor` is chibi4-kit.js's api (bones, group, mixer); `kit` its loaded kit.
 */
export function createHoldRig(actor, kit) {
  const fr = kitFrames(kit);
  const bones = actor.parts.bones;
  const held = { R: null, L: null };            // hand -> { item, spec, meshes: [{ mesh, anchor, piece }] }
  const extra = [];                             // body-anchored items (quiver, lute)
  let worn = [];                                // every mesh we own, for dispose
  let state = 'idle', clipKey = '', blendT = 1, from = null, handsHidden = 1, stringLine = null, stringSpec = null;
  const locks = new Map();                      // `${hand}:${clip}` -> hand local quaternion
  let equipSeq = 0;

  function clear() {
    for (const m of worn) { m.anchor.removeFromParent(); }
    worn = []; held.R = held.L = null; extra.length = 0; locks.clear();
    if (stringLine) { stringLine.removeFromParent(); stringLine.geometry.dispose(); stringLine = null; }
    restoreFingers();
  }
  function hang(item, piece, hand) {
    const spec = item.spec;
    const a = anchorFor(fr, spec, hand);
    const anchor = new THREE.Object3D(); anchor.name = `c4held:${spec.id}:${hand || spec.mount}`;
    anchor.position.copy(a.position); anchor.quaternion.copy(a.quaternion);
    const mesh = new THREE.Mesh(piece.geometry, heldMaterial());
    mesh.name = 'chibi4-held-' + spec.id; mesh.castShadow = true; mesh.frustumCulled = false;
    anchor.add(mesh);
    bones[a.bone].add(anchor);
    const rec = { anchor, mesh, piece, spec, hand, bone: a.bone };
    worn.push(rec);
    return rec;
  }

  /** Put things in the hands: { held: { id, color, color2, type }, offhand: {…} } (ids from the gear catalog). */
  async function equip({ held: h, offhand: o } = {}) {
    const seq = ++equipSeq;
    const want = [];
    if (h?.id && h.id !== 'none') want.push(buildHeldItem(h.id, 'held', h));
    if (o?.id && o.id !== 'none') want.push(buildHeldItem(o.id, 'offhand', o));
    const got = await Promise.all(want);
    if (seq !== equipSeq) return false;           // a newer equip landed first
    clear();
    for (const item of got) {
      const spec = item.spec;
      if (['back', 'hip', 'chest'].includes(spec.mount)) { const r = hang(item, item.pieces[0], null); extra.push({ item, rec: r }); for (const p of item.pieces.slice(1)) hang(item, p, null); continue; }
      const recs = [];
      for (const p of item.pieces) {
        // a piece built on Chibi 2's other hand goes in Chibi 4's other hand (a pair of daggers, lightning in both)
        const hand = p.hand ? (p.hand === 'R' ? 'R' : 'L') : spec.hand;
        recs.push(hang(item, p, hand));
      }
      const hands = [...new Set(recs.map(r => r.hand))];
      for (const hd of hands) if (!held[hd] || item.spec.slot === 'offhand' || spec.kind === 'bow') held[hd] = { item, spec, recs: recs.filter(r => r.hand === hd) };
      if (spec.kind === 'bow') {
        stringSpec = { tips: item.pieces[0].tips, rec: recs[0] };
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
        stringLine = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xe8e0c0 }));
        stringLine.frustumCulled = false; stringLine.name = 'chibi4-bowstring';
        actor.group.add(stringLine);
      }
    }
    clipKey = ''; blendT = 1;
    return true;
  }

  // ---- fingers
  function curlHand(s, amount) {
    const F = fr.hands[s].fingers;
    for (const f of F) {
      const b = bones[f.name]; if (!b) continue;
      const ang = (f.thumb ? amount.thumb : amount.fingers)[f.joint] || 0;
      b.quaternion.copy(f.rest).multiply(_q.setFromAxisAngle(f.axis, ang));
    }
  }
  let fingersTouched = false;
  function restoreFingers() {
    if (!fingersTouched) return;
    for (const s of ['r', 'l']) for (const f of fr.hands[s].fingers) bones[f.name]?.quaternion.copy(f.rest);
    fingersTouched = false;
  }

  // ---- frames at runtime
  function chestFrame() {
    const sp = bones.spine_03;
    const q = sp.getWorldQuaternion(new THREE.Quaternion()).multiply(fr.chestBindQ.clone().invert());
    return { q, p: sp.getWorldPosition(V()) };
  }
  const toWorld = (cf, v) => new THREE.Vector3(...v).normalize().applyQuaternion(cf.q);
  const atWorld = (cf, v) => new THREE.Vector3(...v).applyQuaternion(cf.q).add(cf.p);

  /** The hand-local rotation that, from this clip's current arm, points the item's +Y at `aim` (chest frame). */
  function lockFor(hd, clip, pose, cf) {
    const k = `${hd}:${clip}:${pose.aim}`;
    if (locks.has(k)) return locks.get(k);
    const s = hd === 'L' ? 'l' : 'r', hand = bones['hand_' + s];
    const rec = held[hd].recs[0];
    const anchorQ = rec.anchor.quaternion;
    const cur = rec.anchor.getWorldQuaternion(new THREE.Quaternion());
    const curX = new THREE.Vector3(1, 0, 0).applyQuaternion(cur);
    const want = itemWorldQ(toWorld(cf, pose.aim), curX);
    const handW = want.multiply(anchorQ.clone().invert());
    const pq = hand.parent.getWorldQuaternion(new THREE.Quaternion());
    const local = pq.invert().multiply(handW);
    locks.set(k, local);
    return local;
  }

  function snapshot() {
    const o = {};
    for (const s of ['r', 'l']) for (const n of ARM(s)) o[n] = bones[n].quaternion.clone();
    return o;
  }

  /**
   * After the mixer: the hold pose for the clip now playing. `clip` is the Chibi 2 name the game asked for; `action`
   * the mixer action (its time drives a thrust or a draw).
   */
  function update(clip = 'idle', action = null, dt = 1 / 60) {
    if (!held.R && !held.L && !extra.length) { restoreFingers(); return; }
    const st = holdState(clip);
    const key = st + ':' + clip;
    if (key !== clipKey) { from = clipKey ? snapshot() : null; blendT = 0; clipKey = key; state = st; }
    blendT = Math.min(1, blendT + dt / STATES_BLEND);
    // hands-free clips put things away (and bring them back as the clip ends)
    const hide = st === 'free';
    handsHidden += ((hide ? 0 : 1) - handsHidden) * Math.min(1, dt * 14);
    const sc = Math.max(0.001, handsHidden);
    for (const r of worn) if (!['back', 'hip', 'chest'].includes(r.spec.mount)) r.anchor.scale.setScalar(sc);
    if (stringLine) stringLine.visible = handsHidden > 0.5;
    if (hide) { restoreFingers(); return; }
    actor.group.updateMatrixWorld(true);
    const cf = chestFrame();
    const u = action ? THREE.MathUtils.clamp(action.time / Math.max(0.01, action.getClip().duration), 0, 1) : 0;
    let drawAmt = 0, bowRec = null;
    for (const hd of ['R', 'L']) {
      const h = held[hd]; if (!h) continue;
      const s = hd === 'L' ? 'l' : 'r';
      const pose = poseFor(h.spec.family, st) || { mode: 'clip' };
      fingersTouched = true;
      curlHand(s, h.spec.kind === 'shield' ? LOOSE : FIST);
      if (h.spec.kind === 'bow') { bowRec = h.recs[0]; drawAmt = pose.draw ? pose.draw * (st === 'strike' || st === 'shoot' ? Math.min(1, u * 2.2) * (u > 0.85 ? 0 : 1) : 1) : 0; }
      if (pose.mode === 'fist') {
        const lq = lockFor(hd, clip, pose, cf);
        bones['hand_' + s].quaternion.copy(lq); bones['hand_' + s].updateMatrixWorld(true);
      } else if (pose.mode === 'steady') {
        place(hd, h, pose, cf, u);
      }
      if (pose.second && held[hd].spec.slot === 'held' && !held[hd === 'R' ? 'L' : 'R']) secondHand(hd, h, pose, cf);
    }
    // the draw hand and the string
    if (bowRec && !held.R) drawString(bowRec, drawAmt, cf);
    else if (bowRec) drawString(bowRec, 0, cf);
    // the blend: from the previous pose's arms to this one
    if (from && blendT < 1) {
      const k = blendT * blendT * (3 - 2 * blendT);
      for (const n in from) bones[n].quaternion.slerpQuaternions(from[n], bones[n].quaternion.clone(), k);
      actor.group.updateMatrixWorld(true);
      if (stringLine && bowRec) drawString(bowRec, drawAmt, cf, true);
    }
  }

  function place(hd, h, pose, cf, u) {
    const s = hd === 'L' ? 'l' : 'r';
    const rec = h.recs[0];
    let at = pose.at;
    if (pose.thrust) { const k = Math.sin(Math.PI * Math.min(1, u * 1.6)); at = [at[0], at[1], at[2] - pose.thrust * 0.6 + pose.thrust * k]; }
    const target = atWorld(cf, at);
    const aim = toWorld(cf, pose.aim);
    const face = pose.face ? toWorld(cf, pose.face) : toWorld(cf, [0, 0, 1]).addScaledVector(V().set(0, 1, 0), 0);
    const itemQ = itemWorldQ(aim, face);
    if (pose.forearm) {
      // a shield: the FOREARM is the thing aimed (the guard brings it across the chest face-front)
      const lower = bones['lowerarm_' + s];
      ik2(bones['upperarm_' + s], lower, bones['hand_' + s], target, poleFor(s, cf));
      const lowerQ = itemQ.clone().multiply(rec.anchor.quaternion.clone().invert());
      setBoneWorldQ(lower, lowerQ);
      return;
    }
    const handQ = itemQ.clone().multiply(rec.anchor.quaternion.clone().invert());
    // the wrist target: the fist point minus the anchor's offset, rotated by where the hand will be
    const wrist = target.clone().sub(rec.anchor.position.clone().applyQuaternion(handQ));
    ik2(bones['upperarm_' + s], bones['lowerarm_' + s], bones['hand_' + s], wrist, poleFor(s, cf));
    setBoneWorldQ(bones['hand_' + s], handQ);
  }
  function poleFor(s, cf) { return toWorld(cf, [s === 'r' ? -0.55 : 0.55, -0.55, -0.6]); }

  /** The other hand on the handle, `secondAt` metres down it from the main fist (negative = toward the butt). */
  function secondHand(hd, h, pose, cf) {
    const o = hd === 'R' ? 'L' : 'R', so = o === 'L' ? 'l' : 'r';
    const rec = h.recs[0];
    rec.anchor.updateMatrixWorld(true);
    const itemQ = rec.anchor.getWorldQuaternion(new THREE.Quaternion());
    const point = new THREE.Vector3(0, pose.secondAt ?? -0.14, 0).applyMatrix4(rec.anchor.matrixWorld);
    // the other fist holds the same handle the same way up
    const a = anchorFor(fr, { ...h.spec, mount: 'grip' }, o);
    const handQ = itemQ.clone().multiply(a.quaternion.clone().invert());
    const wrist = point.clone().sub(a.position.clone().applyQuaternion(handQ));
    ik2(bones['upperarm_' + so], bones['lowerarm_' + so], bones['hand_' + so], wrist, poleFor(so, cf));
    setBoneWorldQ(bones['hand_' + so], handQ);
    curlHand(so, FIST);
  }

  /** The bow's string: tip -> the draw point -> tip; the right hand pinches the draw point when drawn. */
  function drawString(rec, amt, cf, noIk = false) {
    rec.anchor.updateMatrixWorld(true);
    const tips = stringSpec.tips, M = rec.mesh.matrixWorld;
    const top = tips.top.clone().applyMatrix4(M), bot = tips.bottom.clone().applyMatrix4(M);
    const rest = top.clone().add(bot).multiplyScalar(0.5);
    let point = rest;
    if (amt > 0.01) {
      // the anchor point: the right cheek (in front of the chin, at the jaw), behind the bow along the arrow line
      const head = bones.head.getWorldPosition(V());
      const cheek = head.clone().add(toWorld(cf, [-0.06, -0.06, 0.12]).multiplyScalar(1));
      point = rest.clone().lerp(cheek, amt);
      if (!noIk) {
        const handR = bones.hand_r, fistOff = fr.hands.r.fist.clone();
        // the right hand comes in palm-in, fingers on the string
        const aimBack = rest.clone().sub(cheek).normalize();
        const q = itemWorldQ(V().set(0, 1, 0).applyQuaternion(cf.q), aimBack);
        const a = anchorFor(fr, { mount: 'grip', kind: 'blade' }, 'R');
        const handQ = q.multiply(a.quaternion.clone().invert());
        const wrist = point.clone().sub(fistOff.applyQuaternion(handQ));
        ik2(bones.upperarm_r, bones.lowerarm_r, handR, wrist, toWorld(cf, [-0.6, -0.2, -0.8]));
        setBoneWorldQ(handR, handQ);
        curlHand('r', LOOSE);
      }
    }
    const inv = new THREE.Matrix4().copy(actor.group.matrixWorld).invert();
    const pa = stringLine.geometry.attributes.position;
    [top, point, bot].forEach((p, i) => { _v.copy(p).applyMatrix4(inv); pa.setXYZ(i, _v.x, _v.y, _v.z); });
    pa.needsUpdate = true;
  }

  return {
    equip, update, clear,
    get held() { return { R: held.R?.spec.id || null, L: held.L?.spec.id || null, body: extra.map(e => e.item.spec.id) }; },
    get meshes() { return worn.map(r => r.mesh); },
    get records() { return worn; },
    stats() { return { items: worn.length, drawCalls: worn.length + (stringLine ? 1 : 0), triangles: worn.reduce((n, r) => n + r.piece.geometry.index.count / 3, 0) }; },
    dispose() { clear(); },
  };
}

// ---------------------------------------------------------------- 4. seats
const seatCache = new Map();             // `${body}:${clip}` -> pelvis height in that clip (character space)
/**
 * Height of the pelvis above the feet in a seated clip (the kit's own metres), measured by playing the clip on a
 * spare copy of the skeleton — the ride clip's pelvis is not where it is standing. Plus the clearance for the seat.
 */
export function seatHeight(kit, clip = 'ride') {
  const key = kit.body + ':' + clip;
  if (!seatCache.has(key)) {
    const pick = clipFor(clip, kit.clips, false);
    const root = SkeletonUtils.clone(kit.bodyGltf.scene);
    const mixer = new THREE.AnimationMixer(root);
    let y = kitFrames(kit).pelvisBindP.y;
    const c = kit.clips[pick.clip];
    if (c) {
      mixer.clipAction(c).play(); mixer.setTime(0.01); root.updateMatrixWorld(true);
      let pel = null; root.traverse(o => { if (o.isBone && o.name === 'pelvis') pel = o; });
      const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
      y = pel.getWorldPosition(V()).applyMatrix4(inv).y;
      mixer.stopAllAction(); mixer.uncacheRoot(root);
    }
    seatCache.set(key, y);
  }
  return seatCache.get(key) + (SEAT_CLEARANCE[clip] ?? 0.05) - 0.05;   // mounts.js seatRider adds its own 0.05
}

/**
 * Sit a Chibi 4 body on any seat point (a bench, a boat's thwart, a cart): the pelvis lands on `seat` (an Object3D)
 * and `clip` plays. `{ feet: true }` puts the FEET on the seat instead (a boat's deck, a raft — the 'boat' crouch).
 * Returns unseat().
 */
export function seatChibi4(body, seat, { clip = 'sit', feet = false } = {}) {
  const g = body.group;
  const prev = { parent: g.parent, position: g.position.clone(), quaternion: g.quaternion.clone(), scale: g.scale.clone() };
  g.removeFromParent();
  const h = feet ? 0 : body.seatHeight(clip) + 0.05;
  g.position.set(0, -h, 0); g.quaternion.identity(); g.scale.setScalar(1);
  seat.add(g);
  body.setAnim(clip, 0);
  return () => { g.removeFromParent(); g.position.copy(prev.position); g.quaternion.copy(prev.quaternion); g.scale.copy(prev.scale); prev.parent?.add(g); body.setAnim('idle', 0.2); };
}
