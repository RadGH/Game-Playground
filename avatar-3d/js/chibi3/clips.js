// Chibi 3 clips: every animation as keyed poses or a function of time, sampled into quaternion arrays
// once per body + hold. No Three.js except the final Euler -> quaternion conversion.
//
// SIGNS (local Euler degrees; every bind rotation is identity, L is +x, the face looks +z):
//   spine/chest/neck/head  x+ lean forward / nod down    y+ turn toward L    z+ lean toward R
//   upperArm  x- raise forward, x+ swing back            (L) z+ out to the side, z- across the body
//   foreArm   x- bend the elbow
//   hand      (L) z- flex toward the palm                x- tip the held blade forward/down
//   thigh     x- swing forward                            (L) z+ out to the side
//   shin      x+ bend the knee
//   foot      x+ toes down, x- toes up
//   clav      (L) z+ shrug, y- shoulder forward
// Poses are authored for the LEFT side; `sym()` writes the right side mirrored (y and z negated), and
// `mirror()` swaps the sides of a whole pose.
//
// A clip: { name, dur (s), loop, mask ('full'|'upper'|'arms'), hands { L, R } ('grip'|'fist'|'open'|
// 'relax'|'point'), twoHand (left hand on the haft), base (pose), keys [[t 0..1, pose], ...] or
// fn(u, ctx) -> pose }. A pose may carry `pel: [x, y, z]` (metres for a 1.8 m body, scaled by S).

import * as THREE from 'three';
import { ANIMATED } from './rig.js';

const SIDES = ['L', 'R'];
/** The bones clips key (fingers are posed procedurally from `hands`). */
export const CLIP_BONES = ANIMATED.filter(n => !/^(thumb|index|middle|ring)/.test(n));
const SIDED = new Set(['clav', 'upperArm', 'foreArm', 'hand', 'thigh', 'shin', 'foot', 'toe']);

/** Expand a pose: unsided limb keys ('upperArm') write L as given and R mirrored. */
export function sym(p) {
  const out = {};
  for (const [k, v] of Object.entries(p)) {
    if (SIDED.has(k)) { out[k + 'L'] = v; out[k + 'R'] = [v[0], -v[1], -v[2]]; }
    else out[k] = v;
  }
  return out;
}
/** Swap left and right of a full pose. */
export function mirror(p) {
  const out = {};
  for (const [k, v] of Object.entries(p)) {
    if (k === 'pel') { out.pel = [-v[0], v[1], v[2]]; continue; }
    const m = k.match(/^(.*)([LR])$/);
    const key = m && SIDED.has(m[1]) ? m[1] + (m[2] === 'L' ? 'R' : 'L') : k;
    out[key] = [v[0], -v[1], -v[2]];
  }
  return out;
}
const merge = (...ps) => Object.assign({}, ...ps.map(p => (p ? sym(p) : {})));
const lerp = (a, b, t) => a + (b - a) * t;
const ss = t => t * t * (3 - 2 * t);

// ------------------------------------------------------------------ base poses

/** Relaxed standing: arms in from the A-pose, elbows soft. */
const RELAX = sym({ upperArm: [4, 0, -7], foreArm: [-14, 0, 0], hand: [0, 0, -4], clav: [0, 0, -2], thigh: [0, 0, -1], shin: [2, 0, 0], foot: [-2, 0, 0], spine: [1, 0, 0], chest: [-1, 0, 0], head: [2, 0, 0] });

/** The combat stance for each kind of hold. */
function readyPose(hold) {
  const legs = { thighL: [-14, 4, 7], shinL: [18, 0, 0], footL: [-4, 0, -3], thighR: [10, -10, -7], shinR: [16, 0, 0], footR: [6, 0, 3], pel: [0, -0.05, 0] };
  const R = hold.right, Lh = hold.left;
  if (hold.twoHanded || R === 'greataxe' || R === 'greatsword' || R === 'hammer' && hold.twoHanded) {
    // a heavy weapon held across the body, head high on the left
    return { ...legs, pelvis: [6, 12, 0], spine: [8, 6, 0], chest: [4, 10, -2], neck: [-4, -14, 0], head: [-4, -8, 0],
      upperArmR: [-26, 0, 16], foreArmR: [-72, 26, 0], handR: [10, 0, 34],
      upperArmL: [-30, 0, -10], foreArmL: [-50, -10, 0], handL: [0, 0, -10], clavL: [0, -8, 0], clavR: [0, 6, 0] };
  }
  if (R === 'staff' || R === 'wand') {
    return { ...legs, pelvis: [3, 6, 0], spine: [4, 4, 0], chest: [2, 6, 0], neck: [0, -6, 0], head: [-2, -4, 0],
      upperArmR: [-16, 0, -14], foreArmR: [-66, 10, 0], handR: [-6, 0, 6],
      upperArmL: [-26, 0, 6], foreArmL: [-72, -14, 0], handL: [0, 0, -10] };
  }
  if (R === 'none' && Lh === 'none') {
    // fists up
    return { ...legs, pelvis: [4, 14, 0], spine: [8, 8, 0], chest: [4, 6, 0], neck: [0, -10, 0], head: [6, -8, 0],
      ...sym({ upperArm: [-30, 0, -12], foreArm: [-110, 0, 0], hand: [0, 0, -10] }), upperArmR: [-20, 0, 18] };
  }
  // one-handed weapon (+ shield or second weapon): blade raised at the right, shield or off-hand in front
  const shield = Lh === 'shield';
  return { ...legs, pelvis: [5, 14, 0], spine: [8, 6, 0], chest: [4, 8, -2], neck: [-2, -10, 0], head: [2, -8, 0],
    upperArmR: [-12, 0, -22], foreArmR: [-78, 6, 0], handR: [10, 0, 6],
    upperArmL: shield ? [-46, 0, 18] : [-30, 0, 10], foreArmL: shield ? [-74, -30, 0] : [-70, -10, 0], handL: shield ? [0, 0, -6] : [10, 0, -6],
    clavL: [0, -6, 0] };
}

// ------------------------------------------------------------------ locomotion (functions of phase)

/** Phase 0 = left foot down. One cycle is two steps. `k` 0 walk .. 1 run. */
function gait(u, k, hold) {
  const TAU = Math.PI * 2;
  // Feet are authored by their pitch against the GROUND (heel strike, flat, heel rise, toe-off,
  // swing) and turned into a local foot angle afterwards; the animator then pins the lowest foot to
  // the ground, so no pelvis bob has to be hand-matched to the legs.
  const leg = (p) => {
    const stance = lerp(0.6, 0.4, k);
    const A = lerp(26, 38, k), B = lerp(14, 22, k);
    let thigh, shin, abs, toe = 0;
    if (p < stance) {
      const t = p / stance;
      thigh = lerp(-A, B, t);
      shin = lerp(5, 22, k) * Math.sin(Math.PI * Math.min(1, t * 1.5)) + lerp(4, 14, k) * ss(Math.max(0, (t - 0.72) / 0.28));
      abs = lerp(-12, -6, k) * (1 - ss(Math.min(1, t / 0.18))) + lerp(32, 40, k) * ss(Math.max(0, (t - 0.62) / 0.38));
      toe = -Math.max(0, abs) * 0.85;
    } else {
      const t = (p - stance) / (1 - stance);
      thigh = lerp(B, -A, ss(t)) - lerp(6, 22, k) * Math.sin(Math.PI * t);
      shin = lerp(58, 108, k) * Math.sin(Math.PI * Math.min(1, t * 1.12)) ** 0.9 + lerp(4, 6, k) * (1 - t);
      abs = lerp(lerp(32, 40, k), lerp(4, 10, k), ss(Math.min(1, t * 2))) * (t < 0.5 ? 1 : 0) + (t >= 0.5 ? lerp(lerp(4, 10, k), lerp(-12, -6, k), ss((t - 0.5) * 2)) : 0);
      toe = t < 0.3 ? -lerp(20, 0, t / 0.3) : 0;
    }
    return [thigh, shin, abs - thigh - shin, toe];
  };
  const [tL, sL, fL, oL] = leg(u), [tR, sR, fR, oR] = leg((u + 0.5) % 1);
  const c = Math.cos(TAU * u), c2 = Math.cos(TAU * u * 2);
  const armA = lerp(18, 34, k), elbow = lerp(16, 85, k);
  const twoH = hold && (hold.twoHanded || hold.right === 'greataxe');
  const lean = lerp(3, 13, k);
  const p = {
    pel: [0.012 * Math.sin(TAU * u) * (1 - k), 0, 0],
    pelvis: [lean * 0.4, lerp(6, 9, k) * c, lerp(3, 4, k) * Math.sin(TAU * u)],
    spine: [lean * 0.5, -lerp(3, 5, k) * c, -lerp(1.5, 2.5, k) * Math.sin(TAU * u)],
    chest: [lean * 0.35 - 1, -lerp(5, 9, k) * c, 0],
    neck: [-lean * 0.35, lerp(3, 4, k) * c, 0], head: [-lean * 0.25 + 2 + lerp(0.8, 2, k) * c2, lerp(2, 3, k) * c, 0],
    thighL: [tL, 0, -1], shinL: [sL, 0, 0], footL: [fL, 0, 0],
    thighR: [tR, 0, 1], shinR: [sR, 0, 0], footR: [fR, 0, 0],
    toeL: [oL, 0, 0], toeR: [oR, 0, 0],
    clavL: [0, 3 * c, -2], clavR: [0, 3 * c, 2],
    upperArmL: [armA * c + lerp(2, -8, k), 0, -7 + 2 * k], foreArmL: [-elbow - (k ? 10 * k * Math.max(0, -c) : 6 * Math.max(0, -c)), 0, 0], handL: [0, 0, -6 - 8 * k],
    upperArmR: [-armA * c + lerp(2, -8, k), 0, 7 - 2 * k], foreArmR: [-elbow - (k ? 10 * k * Math.max(0, c) : 6 * Math.max(0, c)), 0, 0], handR: [0, 0, 6 + 8 * k],
  };
  if (twoH) {
    // a heavy weapon is carried in both hands across the body; the arms barely swing
    Object.assign(p, { upperArmR: [-24, 0, -8], foreArmR: [-58, 18, 0], handR: [0, 0, 28], upperArmL: [-32, 0, -12], foreArmL: [-50, -8, 0], handL: [0, 0, -8],
      chest: [lean * 0.35, 6 - 3 * c, 0] });
  }
  if (hold && !twoH) {
    if (hold.right === 'staff' || hold.right === 'spear') Object.assign(p, { upperArmR: [-14 - armA * 0.2 * c, 0, -6], foreArmR: [-68, 8, 0], handR: [-4, 0, 6] });
    else if (hold.right !== 'none' && hold.right !== 'wand') p.handR = [62, 0, 6 + 8 * k];
    if (['axe', 'sword', 'dagger', 'mace'].includes(hold.left)) p.handL = [62, 0, -6 - 8 * k];
  }
  if (hold && hold.left === 'shield') {
    Object.assign(p, { upperArmL: [-14 + armA * 0.3 * c, 0, 6], foreArmL: [-58, -16, 0], handL: [0, 0, -4] });
  }
  return p;
}

// ------------------------------------------------------------------ the library

/** Every clip, given what is in the hands. Returns an array of specs (unsampled). */
export function clipSpecs(hold) {
  const ready = readyPose(hold);
  const shield = hold.left === 'shield';
  const L = [];
  const add = (c) => { L.push({ mask: 'full', loop: false, hands: null, twoHand: undefined, ...c }); };

  // ---- standing and moving
  add({ name: 'idle', dur: 4, loop: true, base: RELAX, keys: [
    [0, { pel: [0.006, 0, 0], pelvis: [0, 0, -1.5], spine: [0, 0, 1], head: [2, 2, 0], thighL: [0, 0, 1], thighR: [0, 0, 2] }],
    [0.5, { pel: [-0.006, -0.004, 0], pelvis: [0, 0, 1.5], spine: [0, 0, -1], head: [3, -3, 0], thighL: [0, 0, -2], thighR: [0, 0, -1] }],
  ] });
  add({ name: 'ready', dur: 1.8, loop: true, base: ready, keys: [[0, { pel: [0, -0.05, 0] }], [0.5, { pel: [0, -0.058, 0], spine: [(ready.spine?.[0] || 0) + 2, ready.spine?.[1] || 0, 0] }]] });
  add({ name: 'walk', dur: 1.05, loop: true, fn: u => gait(u, 0, hold) });
  add({ name: 'run', dur: 0.66, loop: true, fn: u => gait(u, 1, hold) });
  for (const [name, s] of [['turnL', 1], ['turnR', -1]]) add({ name, dur: 0.8, loop: true, base: RELAX, keys: [
    [0, { pelvis: [0, s * 6, 0], chest: [0, s * 8, 0], head: [0, s * 10, 0] }],
    [0.25, { pelvis: [0, s * 10, 0], [s > 0 ? 'thighL' : 'thighR']: [-22, 0, s > 0 ? 8 : -8], [s > 0 ? 'shinL' : 'shinR']: [36, 0, 0], chest: [0, s * 12, 0], head: [0, s * 14, 0], pel: [0, -0.01, 0] }],
    [0.5, { pelvis: [0, s * 6, 0], chest: [0, s * 8, 0], head: [0, s * 10, 0] }],
    [0.75, { pelvis: [0, s * 2, 0], [s > 0 ? 'thighR' : 'thighL']: [-18, 0, s > 0 ? -6 : 6], [s > 0 ? 'shinR' : 'shinL']: [30, 0, 0], pel: [0, -0.01, 0] }],
  ] });
  add({ name: 'jump', air: true, dur: 1.0, base: RELAX, keys: [
    [0, {}],
    [0.18, { pel: [0, -0.16, 0.01], pelvis: [14, 0, 0], spine: [12, 0, 0], ...sym({ thigh: [-48, 0, 2], shin: [80, 0, 0], foot: [-28, 0, 0], upperArm: [30, 0, -6], foreArm: [-20, 0, 0] }) }],
    [0.34, { pel: [0, 0.22, 0.02], pelvis: [-4, 0, 0], spine: [-4, 0, 0], head: [-6, 0, 0], ...sym({ thigh: [-6, 0, 0], shin: [6, 0, 0], foot: [30, 0, 0], upperArm: [-150, 0, 14], foreArm: [-20, 0, 0] }) }],
    [0.55, { pel: [0, 0.3, 0.02], pelvis: [6, 0, 0], ...sym({ thigh: [-44, 0, 4], shin: [70, 0, 0], foot: [10, 0, 0], upperArm: [-60, 0, 24], foreArm: [-40, 0, 0] }) }],
    [0.76, { pel: [0, -0.14, 0.02], pelvis: [16, 0, 0], spine: [10, 0, 0], head: [6, 0, 0], ...sym({ thigh: [-52, 0, 4], shin: [90, 0, 0], foot: [-32, 0, 0], upperArm: [-10, 0, 30], foreArm: [-40, 0, 0] }) }],
    [1, {}],
  ] });

  // ---- one-handed weapon (+ shield): the knight's set
  const R0 = ready;
  add({ name: 'slash1', dur: 0.85, base: R0, mask: 'full', hands: { R: 'grip' }, keys: [
    [0, {}],
    // wind-up: hips and chest turn right, blade cocked high behind the right shoulder
    [0.3, { pelvis: [2, -14, 0], spine: [2, -12, 4], chest: [-4, -22, 6], head: [0, 8, 0], upperArmR: [-150, 20, -30], foreArmR: [-70, 30, 0], handR: [-30, 0, 20], pel: [0, -0.04, -0.01] }],
    // strike: hips lead, then chest, then the arm; blade down across to the left knee
    [0.46, { pelvis: [8, 18, 0], spine: [14, 16, -4], chest: [14, 26, -6], head: [6, -10, 0], upperArmR: [-62, -10, 10], foreArmR: [-20, -10, 0], handR: [36, 0, -20], thighL: [-30, 4, 8], shinL: [34, 0, 0], thighR: [18, -10, -8], pel: [0, -0.1, 0.06] }],
    // follow-through
    [0.6, { pelvis: [10, 24, 0], spine: [16, 20, -4], chest: [16, 30, -8], head: [8, -14, 0], upperArmR: [-36, -20, 26], foreArmR: [-26, -16, 0], handR: [40, 0, -30], thighL: [-32, 4, 8], shinL: [38, 0, 0], thighR: [20, -10, -8], pel: [0, -0.11, 0.07] }],
    [1, {}],
  ] });
  add({ name: 'slash2', dur: 0.8, base: R0, hands: { R: 'grip' }, keys: [
    [0, {}],
    [0.28, { pelvis: [4, 22, 0], spine: [6, 18, 0], chest: [6, 30, -4], head: [0, -14, 0], upperArmR: [-70, -30, 40], foreArmR: [-110, -20, 0], handR: [10, 0, -40], pel: [0, -0.06, 0] }],
    [0.45, { pelvis: [6, -16, 0], spine: [8, -14, 2], chest: [6, -26, 6], head: [2, 10, 0], upperArmR: [-80, 30, -60], foreArmR: [-14, 20, 0], handR: [10, 0, 30], thighR: [-20, -6, -8], shinR: [24, 0, 0], pel: [0, -0.08, 0.04] }],
    [0.6, { pelvis: [6, -22, 0], spine: [8, -18, 2], chest: [6, -30, 8], head: [2, 14, 0], upperArmR: [-60, 36, -74], foreArmR: [-16, 20, 0], handR: [8, 0, 40], pel: [0, -0.08, 0.05] }],
    [1, {}],
  ] });
  add({ name: 'thrust', dur: 0.7, base: R0, hands: { R: 'grip' }, keys: [
    [0, {}],
    [0.3, { pelvis: [0, -16, 0], chest: [-4, -20, 0], upperArmR: [-20, 0, -20], foreArmR: [-120, 10, 0], handR: [60, 0, 0], pel: [0, -0.05, -0.04] }],
    [0.46, { pelvis: [10, 10, 0], spine: [10, 8, 0], chest: [8, 14, 0], head: [-4, -10, 0], upperArmR: [-84, -6, -4], foreArmR: [-6, 0, 0], handR: [80, 0, 0], thighL: [-40, 0, 6], shinL: [48, 0, 0], thighR: [24, -8, -6], footR: [20, 0, 0], pel: [0, -0.12, 0.14] }],
    [0.62, { pelvis: [10, 12, 0], spine: [10, 8, 0], chest: [8, 14, 0], upperArmR: [-82, -6, -4], foreArmR: [-10, 0, 0], handR: [78, 0, 0], thighL: [-40, 0, 6], shinL: [48, 0, 0], thighR: [24, -8, -6], pel: [0, -0.12, 0.13] }],
    [1, {}],
  ] });
  add({ name: 'shieldBash', dur: 0.75, base: R0, hands: { R: 'grip' }, keys: [
    [0, {}],
    [0.3, { pelvis: [0, 20, 0], chest: [0, 26, 0], upperArmL: [-30, 0, 30], foreArmL: [-100, -20, 0], pel: [0, -0.06, -0.04] }],
    [0.45, { pelvis: [8, -14, 0], spine: [10, -10, 0], chest: [8, -22, 0], head: [0, 12, 0], upperArmL: [-78, 0, 6], foreArmL: [-60, -40, 0], thighL: [-38, 4, 8], shinL: [40, 0, 0], thighR: [26, -6, -6], footR: [22, 0, 0], pel: [0, -0.1, 0.16] }],
    [0.6, { pelvis: [8, -16, 0], spine: [10, -10, 0], chest: [8, -24, 0], upperArmL: [-80, 0, 6], foreArmL: [-58, -40, 0], thighL: [-38, 4, 8], shinL: [40, 0, 0], thighR: [26, -6, -6], pel: [0, -0.1, 0.15] }],
    [1, {}],
  ] });
  add({ name: 'block', dur: 1.6, loop: true, base: { ...R0, pel: [0, -0.08, 0], ...(shield
    ? { upperArmL: [-70, 0, 4], foreArmL: [-78, -40, 0], handL: [0, 0, -6], chest: [8, 14, -2], spine: [10, 8, 0], head: [8, -14, 0] }
    : { upperArmR: [-54, -30, -30], foreArmR: [-80, -10, 0], handR: [0, 30, 60], upperArmL: [-40, 0, 0], foreArmL: [-80, 0, 0], chest: [8, 6, 0], spine: [10, 4, 0] }) },
    keys: [[0, {}], [0.5, { pel: [0, -0.09, 0] }]] });

  // ---- casting: the wizard's set (also what any character does for 'cast')
  add({ name: 'castBolt', dur: 0.9, base: ready, hands: { L: 'open' }, keys: [
    [0, {}],
    [0.32, { pelvis: [0, -16, 0], chest: [-6, -20, 0], head: [-4, 12, 0], upperArmL: [-40, 0, 40], foreArmL: [-120, 0, 0], handL: [0, 0, 30], upperArmR: [-30, 0, -24], foreArmR: [-80, 0, 0], pel: [0, -0.05, -0.03] }],
    [0.46, { pelvis: [8, 14, 0], spine: [8, 10, 0], chest: [6, 16, 0], head: [-6, -12, 0], upperArmL: [-90, 0, -6], foreArmL: [-6, 0, 0], handL: [-60, 0, 10], upperArmR: [-40, 0, -10], foreArmR: [-70, 0, 0], thighL: [-30, 0, 6], shinL: [30, 0, 0], pel: [0, -0.09, 0.08] }],
    [0.66, { pelvis: [8, 14, 0], spine: [8, 10, 0], chest: [6, 16, 0], head: [-6, -12, 0], upperArmL: [-86, 0, -6], foreArmL: [-10, 0, 0], handL: [-56, 0, 10], thighL: [-30, 0, 6], shinL: [30, 0, 0], pel: [0, -0.09, 0.07] }],
    [1, {}],
  ] });
  add({ name: 'channel', dur: 2.0, loop: true, hands: { L: 'open', R: hold.right === 'none' ? 'open' : 'grip' }, base: { ...ready, pel: [0, -0.05, 0], spine: [-4, 0, 0], chest: [-8, 0, 0], head: [-14, 0, 0],
    upperArmL: [-100, 0, 30], foreArmL: [-40, 0, 0], handL: [-20, 0, 20], upperArmR: hold.right === 'staff' ? [-50, 0, -10] : [-100, 0, -30], foreArmR: hold.right === 'staff' ? [-70, 0, 0] : [-40, 0, 0], handR: [-10, 0, -10] },
    keys: [[0, { pel: [0, -0.05, 0] }], [0.5, { pel: [0, -0.035, 0], chest: [-11, 0, 0], head: [-17, 0, 0], upperArmL: [-110, 0, 34] }]] });
  add({ name: 'castAoe', dur: 1.2, base: ready, hands: { L: 'open' }, keys: [
    [0, {}],
    [0.35, { pel: [0, 0.03, 0], pelvis: [-6, 0, 0], spine: [-10, 0, 0], chest: [-12, 0, 0], head: [-16, 0, 0], upperArmR: [-160, 0, -10], foreArmR: [-20, 0, 0], handR: [-10, 0, 0], upperArmL: [-140, 0, 30], foreArmL: [-30, 0, 0] }],
    [0.5, { pel: [0, -0.16, 0.04], pelvis: [14, 0, 0], spine: [16, 0, 0], chest: [12, 0, 0], head: [10, 0, 0], upperArmR: [-70, 0, -6], foreArmR: [-30, 0, 0], handR: [30, 0, 0], upperArmL: [-40, 0, 40], foreArmL: [-20, 0, 0], ...sym({ thigh: [-40, 0, 10], shin: [70, 0, 0], foot: [-28, 0, 0] }) }],
    [0.75, { pel: [0, -0.15, 0.04], pelvis: [14, 0, 0], spine: [14, 0, 0], chest: [10, 0, 0], head: [6, 0, 0], upperArmR: [-68, 0, -6], foreArmR: [-30, 0, 0], handR: [30, 0, 0], upperArmL: [-30, 0, 46], foreArmL: [-20, 0, 0], ...sym({ thigh: [-38, 0, 10], shin: [66, 0, 0], foot: [-26, 0, 0] }) }],
    [1, {}],
  ] });
  add({ name: 'staffStrike', dur: 0.8, base: ready, hands: { R: 'grip' }, keys: [
    [0, {}],
    [0.3, { pelvis: [0, -18, 0], chest: [-6, -24, 0], upperArmR: [-110, 0, -40], foreArmR: [-60, 0, 0], handR: [-30, 0, 0], pel: [0, -0.04, -0.02] }],
    [0.46, { pelvis: [8, 16, 0], spine: [10, 12, 0], chest: [8, 20, 0], upperArmR: [-70, -20, 10], foreArmR: [-30, 0, 0], handR: [40, 0, -10], thighL: [-30, 0, 6], shinL: [32, 0, 0], pel: [0, -0.09, 0.07] }],
    [0.62, { pelvis: [8, 18, 0], spine: [10, 12, 0], chest: [8, 22, 0], upperArmR: [-56, -24, 18], foreArmR: [-30, 0, 0], handR: [44, 0, -16], thighL: [-30, 0, 6], shinL: [32, 0, 0], pel: [0, -0.09, 0.07] }],
    [1, {}],
  ] });

  // ---- heavy two-handed weapon: the berserker's set
  add({ name: 'heavyCleave', dur: 1.25, base: ready, hands: { R: 'grip', L: 'grip' }, twoHand: true, keys: [
    [0, {}],
    // big wind-up: the whole body coils, the axe goes up and back over the head
    [0.36, { pel: [0, 0.01, -0.05], pelvis: [-8, -10, 0], spine: [-12, -8, 0], chest: [-14, -10, 0], head: [-10, 6, 0],
      upperArmR: [-170, 0, -16], foreArmR: [-80, 0, 0], handR: [-40, 0, 0], upperArmL: [-160, 0, 10], foreArmL: [-60, 0, 0], thighL: [-20, 0, 8], shinL: [20, 0, 0], thighR: [16, 0, -8] }],
    // hold at the top: anticipation
    [0.44, { pel: [0, 0.02, -0.05], pelvis: [-10, -10, 0], spine: [-14, -8, 0], chest: [-16, -10, 0], head: [-12, 6, 0],
      upperArmR: [-175, 0, -14], foreArmR: [-90, 0, 0], handR: [-50, 0, 0], upperArmL: [-165, 0, 10], foreArmL: [-66, 0, 0], thighL: [-20, 0, 8], shinL: [20, 0, 0], thighR: [16, 0, -8] }],
    // the chop: everything drops into it, deep lunge
    [0.56, { pel: [0, -0.22, 0.14], pelvis: [10, 4, 0], spine: [30, 2, 0], chest: [10, 0, 0], head: [2, 0, 0],
      upperArmR: [-102, 0, -4], foreArmR: [-8, 0, 0], handR: [46, 0, 0], upperArmL: [-94, 0, 4], foreArmL: [-8, 0, 0],
      thighL: [-54, 0, 10], shinL: [62, 0, 0], footL: [-6, 0, 0], thighR: [34, 0, -8], shinR: [14, 0, 0], footR: [26, 0, 0] }],
    [0.72, { pel: [0, -0.23, 0.14], pelvis: [11, 4, 0], spine: [32, 2, 0], chest: [12, 0, 0], head: [4, 0, 0],
      upperArmR: [-96, 0, -4], foreArmR: [-8, 0, 0], handR: [50, 0, 0], upperArmL: [-88, 0, 4], foreArmL: [-8, 0, 0],
      thighL: [-54, 0, 10], shinL: [62, 0, 0], thighR: [34, 0, -8], shinR: [14, 0, 0], footR: [26, 0, 0] }],
    [1, {}],
  ] });
  add({ name: 'sweep', dur: 1.0, base: ready, hands: { R: 'grip', L: 'grip' }, twoHand: true, keys: [
    [0, {}],
    [0.32, { pel: [0, -0.08, -0.02], pelvis: [4, -30, 0], spine: [6, -24, 0], chest: [4, -34, 0], head: [0, 26, 0], upperArmR: [-70, 0, -60], foreArmR: [-40, 0, 0], handR: [0, 0, 30], upperArmL: [-60, 0, -40], foreArmL: [-50, 0, 0] }],
    [0.5, { pel: [0, -0.12, 0.05], pelvis: [6, 26, 0], spine: [8, 24, 0], chest: [6, 36, 0], head: [0, -22, 0], upperArmR: [-80, 0, 30], foreArmR: [-10, 0, 0], handR: [0, 0, -20], upperArmL: [-80, 0, 50], foreArmL: [-20, 0, 0], thighL: [-30, 10, 10], shinL: [36, 0, 0] }],
    [0.66, { pel: [0, -0.12, 0.06], pelvis: [6, 36, 0], spine: [8, 28, 0], chest: [6, 44, 0], head: [0, -28, 0], upperArmR: [-74, 0, 50], foreArmR: [-14, 0, 0], handR: [0, 0, -30], upperArmL: [-70, 0, 64], foreArmL: [-20, 0, 0], thighL: [-30, 10, 10], shinL: [36, 0, 0] }],
    [1, {}],
  ] });
  add({ name: 'frenzy', dur: 1.6, base: ready, hands: { R: 'grip', L: hold.left === 'none' ? 'grip' : 'grip' }, twoHand: hold.twoHanded, keys: [
    [0, {}],
    [0.12, { pelvis: [2, -18, 0], chest: [-4, -24, 0], upperArmR: [-150, 10, -30], foreArmR: [-70, 0, 0], handR: [-30, 0, 10], pel: [0, -0.04, 0] }],
    [0.22, { pelvis: [10, 16, 0], spine: [12, 14, 0], chest: [12, 22, 0], upperArmR: [-60, -10, 10], foreArmR: [-20, 0, 0], handR: [36, 0, -20], thighL: [-30, 0, 8], shinL: [34, 0, 0], pel: [0, -0.1, 0.06] }],
    [0.38, { pelvis: [4, 22, 0], chest: [4, 30, 0], upperArmR: [-70, -30, 40], foreArmR: [-110, -20, 0], handR: [10, 0, -40], upperArmL: [-140, 0, 20], foreArmL: [-60, 0, 0], pel: [0, -0.06, 0.06] }],
    [0.5, { pelvis: [10, -18, 0], spine: [12, -14, 0], chest: [8, -26, 0], upperArmR: [-80, 30, -60], foreArmR: [-14, 20, 0], handR: [10, 0, 30], upperArmL: [-60, 0, 0], foreArmL: [-20, 0, 0], thighR: [-26, -6, -8], shinR: [30, 0, 0], pel: [0, -0.1, 0.12] }],
    [0.7, { pel: [0, 0.0, 0.08], pelvis: [-8, 0, 0], spine: [-10, 0, 0], chest: [-12, 0, 0], head: [-12, 0, 0], upperArmR: [-170, 0, -10], foreArmR: [-70, 0, 0], upperArmL: [-165, 0, 10], foreArmL: [-60, 0, 0] }],
    [0.8, { pel: [0, -0.22, 0.2], pelvis: [10, 0, 0], spine: [28, 0, 0], chest: [20, 0, 0], head: [10, 0, 0], upperArmR: [-90, 0, -4], foreArmR: [-10, 0, 0], handR: [62, 0, 0], upperArmL: [-82, 0, 4], foreArmL: [-8, 0, 0], thighL: [-54, 0, 10], shinL: [62, 0, 0], thighR: [34, 0, -8], shinR: [14, 0, 0], footR: [26, 0, 0] }],
    [0.9, { pel: [0, -0.22, 0.2], pelvis: [10, 0, 0], spine: [28, 0, 0], chest: [20, 0, 0], upperArmR: [-86, 0, -4], foreArmR: [-10, 0, 0], handR: [66, 0, 0], upperArmL: [-80, 0, 4], thighL: [-54, 0, 10], shinL: [62, 0, 0], thighR: [34, 0, -8], shinR: [14, 0, 0], footR: [26, 0, 0] }],
    [1, {}],
  ] });
  add({ name: 'twinChop', dur: 1.0, base: ready, hands: { R: 'grip', L: 'grip' }, twoHand: false, keys: [
    [0, {}],
    [0.34, { pel: [0, 0.01, -0.04], pelvis: [-8, 0, 0], spine: [-10, 0, 0], chest: [-12, 0, 0], head: [-8, 0, 0], ...sym({ upperArm: [-160, 0, 30], foreArm: [-80, 0, 0], hand: [-40, 0, 0], thigh: [-10, 0, 6] }) }],
    [0.5, { pel: [0, -0.18, 0.12], pelvis: [9, 0, 0], spine: [26, 0, 0], chest: [16, 0, 0], head: [6, 0, 0], ...sym({ upperArm: [-50, 0, 14], foreArm: [-10, 0, 0], hand: [40, 0, 0] }), thighL: [-48, 0, 10], shinL: [56, 0, 0], thighR: [32, 0, -8], shinR: [12, 0, 0], footR: [24, 0, 0] }],
    [0.68, { pel: [0, -0.18, 0.12], pelvis: [10, 0, 0], spine: [28, 0, 0], chest: [18, 0, 0], ...sym({ upperArm: [-40, 0, 16], foreArm: [-10, 0, 0], hand: [44, 0, 0] }), thighL: [-48, 0, 10], shinL: [56, 0, 0], thighR: [32, 0, -8], shinR: [12, 0, 0], footR: [24, 0, 0] }],
    [1, {}],
  ] });
  add({ name: 'roar', dur: 2.2, base: RELAX, hands: { L: 'fist', R: 'fist' }, handsFree: true, face: { expr: 'rage', from: 0.2, to: 0.85 }, keys: [
    [0, {}],
    [0.2, { pel: [0, -0.06, -0.02], pelvis: [10, 0, 0], spine: [16, 0, 0], chest: [14, 0, 0], head: [16, 0, 0], ...sym({ upperArm: [-20, 0, 6], foreArm: [-100, 0, 0], clav: [0, 8, -4], thigh: [-10, 0, 8], shin: [20, 0, 0] }) }],
    [0.4, { pel: [0, -0.08, 0.02], pelvis: [-4, 0, 0], spine: [-12, 0, 0], chest: [-18, 0, 0], neck: [-10, 0, 0], head: [-24, 0, 0], ...sym({ upperArm: [-20, 0, 60], foreArm: [-80, 0, 0], clav: [0, -6, 10], thigh: [-6, 0, 16], shin: [24, 0, 0] }) }],
    [0.8, { pel: [0, -0.08, 0.02], pelvis: [-4, 0, 0], spine: [-14, 0, 0], chest: [-20, 0, 0], neck: [-12, 0, 0], head: [-26, 0, 0], ...sym({ upperArm: [-26, 0, 64], foreArm: [-86, 0, 0], clav: [0, -6, 12], thigh: [-6, 0, 16], shin: [24, 0, 0] }) }],
    [1, {}],
  ] });

  // ---- unarmed
  add({ name: 'punch', dur: 0.6, base: ready, hands: { L: 'fist', R: 'fist' }, keys: [
    [0, {}],
    [0.25, { pelvis: [0, -14, 0], chest: [0, -18, 0], upperArmR: [-20, 0, 10], foreArmR: [-130, 0, 0] }],
    [0.42, { pelvis: [6, 16, 0], chest: [6, 22, 0], spine: [6, 8, 0], upperArmR: [-88, 0, -6], foreArmR: [-6, 0, 0], handR: [0, 0, 10], thighL: [-26, 0, 6], shinL: [26, 0, 0], pel: [0, -0.07, 0.06] }],
    [1, {}],
  ] });

  // ---- reactions
  add({ name: 'hit', dur: 0.5, additive: true, base: {}, keys: [
    [0, {}], [0.18, { spine: [-10, 0, 3], chest: [-12, 0, 4], neck: [-6, 0, 0], head: [-14, 6, 0], clavL: [0, 6, 6], clavR: [0, -6, -6], pelvis: [-4, 0, 0] }], [1, {}],
  ] });
  add({ name: 'stagger', dur: 1.1, base: RELAX, keys: [
    [0, {}],
    [0.15, { pel: [0, -0.05, -0.08], pelvis: [-12, 0, 4], spine: [-14, 0, 6], chest: [-16, 4, 0], head: [-18, 10, 0], ...sym({ upperArm: [-30, 0, 40], foreArm: [-40, 0, 0] }), thighR: [20, 0, -4], shinR: [20, 0, 0] }],
    [0.4, { pel: [0, -0.1, -0.16], pelvis: [6, 0, 0], spine: [8, 0, 0], chest: [6, 0, 0], head: [6, 0, 0], ...sym({ upperArm: [-20, 0, 30], foreArm: [-30, 0, 0] }), thighR: [12, 0, -4], shinR: [40, 0, 0], thighL: [-30, 0, 6], shinL: [40, 0, 0] }],
    [0.7, { pel: [0, -0.06, -0.12], pelvis: [4, 0, 0], spine: [4, 0, 0] }],
    [1, {}],
  ] });
  add({ name: 'dead', air: true, dur: 1.3, hold: true, base: RELAX, face: { lids: 0.85, jaw: 0.25, from: 0.4, to: 2 }, keys: [
    [0, {}],
    [0.18, { pel: [0, -0.08, -0.05], pelvis: [-10, 0, 4], spine: [-12, 6, 0], chest: [-14, 4, 0], head: [-20, 10, 0], ...sym({ upperArm: [-30, 0, 30], foreArm: [-30, 0, 0] }), shinL: [40, 0, 0], shinR: [30, 0, 0] }],
    [0.45, { pel: [0, -0.5, -0.2], pelvis: [-40, 0, 6], spine: [-10, 0, 0], chest: [-8, 0, 0], head: [-14, 20, 0], ...sym({ upperArm: [-60, 0, 50], foreArm: [-20, 0, 0], thigh: [-60, 0, 8], shin: [80, 0, 0], foot: [20, 0, 0] }) }],
    [0.7, { pel: [0, -0.86, -0.42], pelvis: [-88, 0, 6], spine: [-4, 0, 0], chest: [-2, 0, 0], neck: [6, 0, 0], head: [-10, 30, 0], ...sym({ upperArm: [-110, 0, 40], foreArm: [-12, 0, 0], thigh: [-30, 0, 10], shin: [40, 0, 0], foot: [30, 0, 0] }) }],
    [0.84, { pel: [0, -0.83, -0.45], pelvis: [-86, 0, 6], spine: [-6, 0, 0], neck: [4, 0, 0], head: [-14, 34, 0], ...sym({ upperArm: [-100, 0, 46], foreArm: [-16, 0, 0], thigh: [-20, 0, 12], shin: [28, 0, 0], foot: [36, 0, 0] }) }],
    [1, { pel: [0, -0.85, -0.45], pelvis: [-88, 0, 6], spine: [-6, 0, 0], neck: [4, 0, 0], head: [-14, 36, 0], ...sym({ upperArm: [-100, 0, 46], foreArm: [-16, 0, 0], thigh: [-18, 0, 12], shin: [24, 0, 0], foot: [36, 0, 0] }) }],
  ] });
  const dEnd = { pel: [0, -0.85, -0.45], pelvis: [-88, 0, 6], spine: [-6, 0, 0], neck: [4, 0, 0], head: [-14, 36, 0], ...sym({ upperArm: [-100, 0, 46], foreArm: [-16, 0, 0], thigh: [-18, 0, 12], shin: [24, 0, 0], foot: [36, 0, 0] }) };
  add({ name: 'getUp', air: true, dur: 1.8, base: RELAX, keys: [
    [0, dEnd],
    [0.2, { pel: [0, -0.8, -0.3], pelvis: [-60, 0, 4], spine: [20, 0, 0], chest: [20, 0, 0], head: [10, 0, 0], ...sym({ upperArm: [10, 0, 30], foreArm: [-10, 0, 0], thigh: [-80, 0, 12], shin: [120, 0, 0], foot: [20, 0, 0] }) }],
    [0.45, { pel: [0, -0.55, -0.05], pelvis: [10, 0, 0], spine: [30, 0, 0], chest: [10, 0, 0], ...sym({ upperArm: [-20, 0, 20], foreArm: [-10, 0, 0], thigh: [-90, 0, 14], shin: [130, 0, 0], foot: [-40, 0, 0] }) }],
    [0.7, { pel: [0, -0.25, 0.0], pelvis: [30, 0, 0], spine: [20, 0, 0], head: [-10, 0, 0], ...sym({ upperArm: [-10, 0, 10], foreArm: [-30, 0, 0], thigh: [-60, 0, 8], shin: [80, 0, 0], foot: [-20, 0, 0] }) }],
    [1, {}],
  ] });

  // ---- emotes and talking (empty hands)
  add({ name: 'wave', dur: 2.0, base: RELAX, handsFree: true, hands: { L: 'open', R: 'relax' }, face: { expr: 'happy', from: 0.05, to: 0.95 }, keys: [
    [0, {}],
    [0.15, { upperArmL: [-14, 0, 92], foreArmL: [0, 0, 62], handL: [0, 70, 0], chest: [0, 4, -4], head: [0, 6, 4] }],
    [0.3, { upperArmL: [-14, 0, 96], foreArmL: [0, 0, 44], handL: [0, 70, -8], chest: [0, 4, -4], head: [0, 6, 4] }],
    [0.45, { upperArmL: [-14, 0, 92], foreArmL: [0, 0, 82], handL: [0, 70, 8], chest: [0, 4, -4], head: [0, 6, 4] }],
    [0.6, { upperArmL: [-14, 0, 96], foreArmL: [0, 0, 44], handL: [0, 70, -8], chest: [0, 4, -4], head: [0, 6, 4] }],
    [0.75, { upperArmL: [-14, 0, 92], foreArmL: [0, 0, 80], handL: [0, 70, 8], chest: [0, 4, -4], head: [0, 6, 4] }],
    [1, {}],
  ] });
  add({ name: 'cheer', air: true, dur: 1.8, base: RELAX, handsFree: true, hands: { L: 'fist', R: 'fist' }, face: { expr: 'grin', from: 0.05, to: 0.9 }, keys: [
    [0, {}],
    [0.18, { pel: [0, -0.08, 0], ...sym({ thigh: [-20, 0, 4], shin: [36, 0, 0], foot: [-14, 0, 0], upperArm: [-10, 0, 30], foreArm: [-120, 0, 0] }), spine: [10, 0, 0] }],
    [0.34, { pel: [0, 0.12, 0], spine: [-8, 0, 0], chest: [-8, 0, 0], head: [-14, 0, 0], ...sym({ upperArm: [-20, 0, 160], foreArm: [-20, 0, 0], foot: [30, 0, 0] }) }],
    [0.5, { pel: [0, -0.04, 0], spine: [-4, 0, 0], head: [-10, 0, 0], ...sym({ upperArm: [-10, 0, 150], foreArm: [-40, 0, 0], thigh: [-12, 0, 0], shin: [20, 0, 0] }) }],
    [0.7, { pel: [0, 0.0, 0], head: [-8, 0, 0], ...sym({ upperArm: [-15, 0, 155], foreArm: [-30, 0, 0] }) }],
    [1, {}],
  ] });
  add({ name: 'bow', dur: 2.2, base: RELAX, handsFree: true, hands: { L: 'relax', R: 'open' }, face: { expr: 'smug', from: 0.1, to: 0.9 }, keys: [
    [0, {}],
    [0.3, { pelvis: [30, 0, 0], spine: [14, 0, 0], chest: [8, 0, 0], head: [16, 0, 0], upperArmR: [-40, 0, 10], foreArmR: [-90, -30, 0], upperArmL: [24, 0, -6], thighL: [-27, 0, 0], thighR: [-27, 0, 0], pel: [0, 0, -0.06] }],
    [0.6, { pelvis: [32, 0, 0], spine: [16, 0, 0], chest: [8, 0, 0], head: [18, 0, 0], upperArmR: [-40, 0, 10], foreArmR: [-92, -30, 0], upperArmL: [26, 0, -6], thighL: [-29, 0, 0], thighR: [-29, 0, 0], pel: [0, 0, -0.07] }],
    [1, {}],
  ] });
  add({ name: 'point', dur: 1.6, base: RELAX, handsFree: true, hands: { R: 'point' }, face: { expr: 'focused', from: 0.1, to: 0.9 }, keys: [
    [0, {}],
    [0.25, { upperArmR: [-88, 0, -10], foreArmR: [-6, 0, 0], handR: [0, 0, 4], chest: [0, -10, 0], head: [0, -6, 0], pelvis: [0, -6, 0] }],
    [0.75, { upperArmR: [-86, 0, -12], foreArmR: [-8, 0, 0], handR: [0, 0, 4], chest: [0, -10, 0], head: [0, -6, 0], pelvis: [0, -6, 0] }],
    [1, {}],
  ] });
  add({ name: 'laugh', dur: 2.0, base: RELAX, handsFree: true, hands: { L: 'relax', R: 'relax' }, face: { expr: 'grin', jawWobble: 0.35, from: 0.05, to: 0.95 }, keys: [
    [0, {}],
    [0.15, { spine: [-6, 0, 0], chest: [-10, 0, 0], head: [-16, 0, 0], upperArmL: [-10, 0, 4], foreArmL: [-70, 0, 0], pel: [0, -0.01, 0] }],
    [0.3, { spine: [-2, 0, 0], chest: [-6, 0, 0], head: [-12, 0, 0], upperArmL: [-14, 0, 4], foreArmL: [-76, 0, 0], pel: [0, -0.02, 0] }],
    [0.45, { spine: [-6, 0, 0], chest: [-11, 0, 0], head: [-17, 0, 0], upperArmL: [-10, 0, 4], foreArmL: [-70, 0, 0], pel: [0, -0.01, 0] }],
    [0.6, { spine: [8, 0, 0], chest: [6, 0, 0], head: [4, 0, 0], upperArmL: [-16, 0, 4], foreArmL: [-80, 0, 0], pel: [0, -0.03, 0] }],
    [0.75, { spine: [10, 0, 0], chest: [8, 0, 0], head: [6, 0, 0], upperArmL: [-14, 0, 4], foreArmL: [-78, 0, 0], pel: [0, -0.03, 0] }],
    [1, {}],
  ] });
  add({ name: 'talk', dur: 3.2, loop: true, base: RELAX, mask: 'upper', handsFree: true, hands: { L: 'open', R: 'open' }, face: { talk: true }, keys: [
    [0, {}],
    [0.2, { upperArmR: [-18, 0, -4], foreArmR: [-70, 30, 0], handR: [-10, 30, 10], chest: [0, -4, 0], head: [2, -6, 2] }],
    [0.4, { upperArmR: [-12, 0, -6], foreArmR: [-60, 20, 0], upperArmL: [-16, 0, 6], foreArmL: [-72, -30, 0], handL: [-10, -30, -10], head: [-2, 4, -2] }],
    [0.6, { upperArmL: [-22, 0, 10], foreArmL: [-80, -36, 0], handL: [-16, -40, -10], chest: [0, 6, 0], head: [0, 8, 0] }],
    [0.8, { upperArmR: [-20, 0, -8], foreArmR: [-76, 26, 0], upperArmL: [-10, 0, 4], foreArmL: [-40, 0, 0], head: [4, -2, 0] }],
    [1, {}],
  ] });
  return L;
}

// ------------------------------------------------------------------ sampling

const D = Math.PI / 180;
/** Catmull-Rom through four values (with a clamped or wrapped neighbour). */
const cr = (p0, p1, p2, p3, t) => 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);

function keyedPose(spec, u, basePose) {
  const keys = spec.keys, n = keys.length;
  let i = 0; while (i < n - 1 && keys[i + 1][0] <= u) i++;
  const k0 = keys[i], k1 = keys[Math.min(n - 1, i + 1)];
  const span = Math.max(1e-6, k1[0] - k0[0]), t = k1 === k0 ? 0 : Math.min(1, (u - k0[0]) / span);
  const prev = keys[i > 0 ? i - 1 : (spec.loop ? n - 2 : 0)], next = keys[i + 2 < n ? i + 2 : (spec.loop ? 1 : n - 1)];
  const full = k => ({ ...basePose, ...sym(k[1]) });
  const P0 = full(prev), P1 = full(k0), P2 = full(k1), P3 = full(next);
  const out = {};
  for (const name of new Set([...Object.keys(P1), ...Object.keys(P2), ...Object.keys(P0), ...Object.keys(P3)])) {
    const z = [0, 0, 0], a = P0[name] || P1[name] || z, b = P1[name] || z, c = P2[name] || z, d = P3[name] || P2[name] || z;
    out[name] = [0, 1, 2].map(j => cr(a[j], b[j], c[j], d[j], t));
  }
  return out;
}

const _e = new THREE.Euler(), _qq = new THREE.Quaternion();
/**
 * Sample a spec into arrays: quats Float32Array(frames * bones * 4) in CLIP_BONES order, pel
 * Float32Array(frames * 3) (metres, already scaled by S).
 */
export function sampleClip(spec, S, posture) {
  const fps = 30, frames = Math.max(2, Math.ceil(spec.dur * fps) + 1), NB = CLIP_BONES.length;
  const quats = new Float32Array(frames * NB * 4), pel = new Float32Array(frames * 3);
  const base = spec.additive ? {} : sym(spec.base || {});
  for (let f = 0; f < frames; f++) {
    const u = f / (frames - 1);
    const pose = spec.fn ? sym(spec.fn(spec.loop ? u % 1 : u)) : keyedPose(spec, u, base);
    for (let b = 0; b < NB; b++) {
      const v = pose[CLIP_BONES[b]];
      if (v) _e.set(v[0] * D, v[1] * D, v[2] * D, 'XYZ'); else _e.set(0, 0, 0);
      _qq.setFromEuler(_e);
      quats.set([_qq.x, _qq.y, _qq.z, _qq.w], (f * NB + b) * 4);
    }
    const p = pose.pel || [0, 0, 0];
    pel.set([p[0] * S, p[1] * S, p[2] * S], f * 3);
  }
  return { ...spec, frames, quats, pel, fps };
}

/** Menu groups for a page. */
export const CHIBI3_CLIP_GROUPS = {
  Move: ['idle', 'ready', 'walk', 'run', 'turnL', 'turnR', 'jump'],
  Knight: ['slash1', 'slash2', 'thrust', 'shieldBash', 'block'],
  Wizard: ['castBolt', 'channel', 'castAoe', 'staffStrike'],
  Berserker: ['heavyCleave', 'sweep', 'frenzy', 'twinChop', 'roar'],
  Reactions: ['hit', 'stagger', 'dead', 'getUp'],
  Emotes: ['wave', 'cheer', 'bow', 'point', 'laugh', 'talk', 'punch'],
};
export const CHIBI3_CLIPS = Object.values(CHIBI3_CLIP_GROUPS).flat();
