// Kestrel (fable) — proportions and the skeleton.
//
// `dims(look)` turns the look's body fields into landmarks in metres (every builder reads these, so the body, the
// garments and the clips agree on where a knee is). `createRig(d)` builds the bones: Chibi 2's eighteen names, plus
// spine / neck / jaw / toes, two bones per finger, eye + pupil + lid bones, brow and mouth-corner bones for the
// expressions, and two ponytail bones. Arms are BOUND slightly out from the body (an A-pose) so the shoulder skin
// is sculpted where it will mostly be seen; a clip's [0,0,0] on an arm bone is still "straight down".
import * as THREE from 'three';
import { clamp, lerp } from './geometry.js';

export const A_OUT = 0.35;                       // bind-pose arm angle out from vertical (radians)

/** Landmarks in metres for a look. `body.height` / `body.width` 0..1 nudge; `form` picks the base table. */
export function dims(look = {}) {
  const b = look.body || {};
  const fem = b.form === 'fem';
  const hk = 0.9 + clamp(Number.isFinite(b.height) ? b.height : 0.5, 0, 1) * 0.2;   // 0.9 .. 1.1 of the base height
  const wk = 0.88 + clamp(Number.isFinite(b.width) ? b.width : 0.5, 0, 1) * 0.24;   // 0.88 .. 1.12 of the base width
  const base = fem ? {
    height: 1.68, chin: 1.435, headTop: 1.68, neckBase: 1.37, shoulderY: 1.36, shoulderX: 0.148,
    chestY: 1.245, chestRX: 0.148, chestRZ: 0.105, underBust: 1.17,
    waistY: 1.06, waistRX: 0.104, waistRZ: 0.088,
    hipY: 0.925, hipRX: 0.172, hipRZ: 0.125, crotch: 0.80, hipJointY: 0.87, hipJointX: 0.088,
    kneeY: 0.455, ankleY: 0.07, upperArm: 0.275, foreArm: 0.24, hand: 0.17,
    neckR: 0.041, headRX: 0.080, headRY: 0.112, headRZ: 0.092,
    thighR: 0.086, calfR: 0.056, armR: 0.044, foreR: 0.037, wristR: 0.023,
    footLen: 0.235, footW: 0.042, bust: 0.028,
  } : {
    height: 1.78, chin: 1.52, headTop: 1.78, neckBase: 1.455, shoulderY: 1.445, shoulderX: 0.172,
    chestY: 1.32, chestRX: 0.185, chestRZ: 0.128, underBust: 1.24,
    waistY: 1.10, waistRX: 0.128, waistRZ: 0.098,
    hipY: 0.96, hipRX: 0.168, hipRZ: 0.118, crotch: 0.84, hipJointY: 0.915, hipJointX: 0.095,
    kneeY: 0.485, ankleY: 0.075, upperArm: 0.31, foreArm: 0.27, hand: 0.19,
    neckR: 0.051, headRX: 0.084, headRY: 0.117, headRZ: 0.097,
    thighR: 0.098, calfR: 0.063, armR: 0.056, foreR: 0.046, wristR: 0.027,
    footLen: 0.26, footW: 0.047, bust: 0,
  };
  const d = { form: fem ? 'fem' : 'masc', fem, hk, wk };
  for (const [k, v] of Object.entries(base)) {
    if (typeof v !== 'number') { d[k] = v; continue; }
    const widthKeys = /RX|RZ|shoulderX|hipJointX|thighR|calfR|armR|foreR|wristR|neckR|footW|bust/;
    d[k] = widthKeys.test(k) ? v * wk * (k.startsWith('head') ? lerp(1, hk, 0.5) / wk : 1) : v * hk;
  }
  d.headRX = base.headRX * lerp(1, hk, 0.5); d.headRY = base.headRY * lerp(1, hk, 0.5); d.headRZ = base.headRZ * lerp(1, hk, 0.5);
  d.skin = b.skin || (fem ? '#dea67f' : '#dba27a');
  return d;
}

export const FINGERS = ['idx', 'mid', 'rng', 'pnk'];
export const CHIBI2_NAMES = ['root', 'hips', 'chest', 'head', 'armL', 'armR', 'elbowL', 'elbowR', 'handL', 'handR', 'gripL', 'gripR', 'legL', 'legR', 'kneeL', 'kneeR', 'footL', 'footR'];

/** Finger layout in hand space (origin = wrist, fingers run -y, palm faces -x on the RIGHT hand, thumb toward +z). */
export function fingerSpec(d) {
  const k = d.hand / 0.19;
  return {
    knuckleY: -0.098 * k,
    fingers: { idx: { z: 0.031 * k, len: 0.08 * k, r: 0.0092 * k }, mid: { z: 0.0105 * k, len: 0.088 * k, r: 0.0095 * k }, rng: { z: -0.0105 * k, len: 0.081 * k, r: 0.0088 * k }, pnk: { z: -0.031 * k, len: 0.063 * k, r: 0.0078 * k } },
    thumb: { base: [-0.006 * k, -0.032 * k, 0.04 * k], dir: [-0.2, -0.5, 0.84], len: 0.066 * k, r: 0.0112 * k },
    palmW: 0.088 * k, palmT: 0.03 * k,
  };
}

/**
 * The skeleton. Returns { root, bones, byName, index, d }. Every bone's world matrix is the bind pose.
 * Eye positions are set by the head builder (head.js) through `rig.placeEye(side, pos)` before binding.
 */
export function createRig(d) {
  const bones = [], byName = {}, index = {};
  function bone(name, parent, pos, rot = null) {
    const b = new THREE.Bone(); b.name = name; b.position.set(...pos);
    if (rot) b.quaternion.copy(rot);
    index[name] = bones.length; bones.push(b); byName[name] = b;
    if (parent) byName[parent].add(b);
    return b;
  }
  const hipsY = d.crotch + 0.10 * d.hk;
  const spineY = hipsY + 0.12 * d.hk, chestY = spineY + 0.14 * d.hk;
  bone('root', null, [0, 0, 0]);
  bone('hips', 'root', [0, hipsY, 0]);
  bone('spine', 'hips', [0, spineY - hipsY, 0]);
  bone('chest', 'spine', [0, chestY - spineY, 0]);
  bone('neck', 'chest', [0, d.neckBase - chestY, 0.005]);
  bone('head', 'neck', [0, d.chin + 0.03 * d.hk - d.neckBase, 0.008]);        // pivot a little above the chin (the skull base)
  bone('jaw', 'head', [0, 0.085 * d.hk, -0.025]);
  for (const s of ['L', 'R']) {
    bone('eye' + s, 'head', [0, 0, 0]); bone('pupil' + s, 'eye' + s, [0, 0, 0]); bone('lid' + s, 'eye' + s, [0, 0, 0]);
    bone('brow' + s, 'head', [0, 0, 0]); bone('mouth' + s, 'head', [0, 0, 0]);
  }
  bone('hairTail1', 'head', [0, 0.19 * d.hk, -0.06]); bone('hairTail2', 'hairTail1', [0, -0.12, -0.04]);
  const fs = fingerSpec(d);
  for (const [s, sg] of [['L', -1], ['R', 1]]) {
    const out = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), sg * A_OUT);
    bone('arm' + s, 'chest', [sg * d.shoulderX, d.shoulderY - chestY, 0], out);
    bone('elbow' + s, 'arm' + s, [0, -d.upperArm, 0]);
    bone('hand' + s, 'elbow' + s, [0, -d.foreArm, 0]);
    bone('grip' + s, 'hand' + s, [-sg * 0.012, -0.05 * d.hand / 0.19, 0.004]);
    // fingers: two bones each; authored for the right hand (palm -x), mirrored in x for the left
    for (const f of FINGERS) {
      const g = fs.fingers[f];
      bone(f + '1' + s, 'hand' + s, [0, fs.knuckleY, g.z]);
      bone(f + '2' + s, f + '1' + s, [0, -g.len * 0.48, 0]);
    }
    const tdir = new THREE.Vector3(fs.thumb.dir[0] * sg, fs.thumb.dir[1], fs.thumb.dir[2]).normalize();
    const tq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), tdir);
    bone('thm1' + s, 'hand' + s, [fs.thumb.base[0] * sg, fs.thumb.base[1], fs.thumb.base[2]], tq);
    bone('thm2' + s, 'thm1' + s, [0, -fs.thumb.len * 0.5, 0]);
    bone('leg' + s, 'hips', [sg * d.hipJointX, d.hipJointY - hipsY, 0]);
    bone('knee' + s, 'leg' + s, [0, -(d.hipJointY - d.kneeY), 0]);
    bone('foot' + s, 'knee' + s, [0, -(d.kneeY - d.ankleY), 0]);
    bone('toes' + s, 'foot' + s, [0, -d.ankleY + 0.02, d.footLen * 0.42]);
  }
  byName.root.updateMatrixWorld(true);
  const rig = { root: byName.root, bones, byName, index, d, hipsY, spineY, chestY, fs };
  /** Place a head-child bone (eye / brow / mouth corner) at a head-local position with a rotation, then refresh. */
  rig.placeHeadBone = (name, pos, quat = null) => { const b = byName[name]; b.position.set(...pos); if (quat) b.quaternion.copy(quat); b.userData.rest = { p: b.position.clone(), q: b.quaternion.clone() }; byName.root.updateMatrixWorld(true); };
  rig.height = d.height;
  return rig;
}

/** Bone-space weight helpers. */
export const W = (...pairs) => pairs;
/** Blend two bones by a smooth band around `at` (in whichever coordinate the caller measures) of half width `w`. */
export function blend(a, b, x, at, w) {
  const t = clamp((x - at) / (2 * w) + 0.5, 0, 1), k = t * t * (3 - 2 * t);
  if (k <= 0.001) return [[a, 1]];
  if (k >= 0.999) return [[b, 1]];
  return [[a, 1 - k], [b, k]];
}
