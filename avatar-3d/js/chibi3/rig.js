// Chibi 3 skeleton: 66 bones laid out from the race and the body dials. No Three.js here — index.js
// turns this description into THREE.Bone objects, and node tests read it directly.
//
// Every bone's BIND rotation is identity (its local axes are the world axes in the bind pose), so a
// clip that says "elbow x = -40 degrees" means the same thing on every body. The one exception is the
// grip, which is a leaf: it is turned so its +y runs where a held blade points.
//
// Chains:
//   spine     root > pelvis > spine > chest > neck > head (> jaw, eyes, upper lids)
//   arms      chest > clavicle > upperArm > foreArm > hand > grip, thumb/index/middle/ring (2 each)
//   legs      pelvis > thigh > shin > foot > toe
//   springs   hair (3), hat tip (2), beard (2), cape left/right (3 each), skirt front/back/left/right (2 each)
// Spring bones are driven by springs.js at runtime, not by clips.

import { CHIBI3_RACES, dial } from './races.js';

const v = (x, y, z) => [x, y, z];
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const clamp01 = x => Math.max(0, Math.min(1, x));
const slider = (body, key, fallback = 0.5) => Number.isFinite(body?.[key]) ? clamp01(body[key]) : fallback;

/** Everything the meshes and clips need to know about this body's proportions. */
export function proportions(avatar) {
  const race = CHIBI3_RACES[avatar?.body?.race] || CHIBI3_RACES.human, rb = race.body, body = avatar?.body || {};
  const S = race.stature / 1.8 * (0.94 + slider(body, 'height') * 0.12);
  const width = rb.width * (0.88 + slider(body, 'width') * 0.24);
  const head = rb.head * (0.92 + slider(body, 'headSize') * 0.16);
  const round = Number.isFinite(body.round) ? clamp01(body.round) : null;
  const fat = Math.max(0, Math.min(1, dial(avatar, 'fat', round != null ? round * 0.9 : rb.fat, 0.45)));
  const muscle = Math.max(0, Math.min(1, dial(avatar, 'muscle', rb.muscle, 0.5)));
  return {
    race, S, width, head, fat, muscle,
    leg: rb.leg * dial(avatar, 'legs', 1, 0.12),
    torso: rb.torso,
    shoulders: rb.shoulders * dial(avatar, 'shoulders', 1, 0.14) * (1 + muscle * 0.06),
    arm: rb.arm * dial(avatar, 'arms', 1, 0.1),
    hand: rb.hand,
    neck: rb.neck * dial(avatar, 'neck', 1, 0.25),
    posture: race.posture,
  };
}

/**
 * Lay out the joints. Returns { bones: [{ name, parent, pos (world), rot? }], byName, P, height, ... }.
 */
export function layoutRig(avatar) {
  const P = proportions(avatar), { S, width: W, leg: Lg, torso: T, shoulders: Sh, arm: Ar, hand: Hd, neck: Nk, head: Hs } = P;
  const bones = [], byName = {};
  const bone = (name, parent, pos, extra = {}) => { const b = { name, parent, pos, ...extra }; byName[name] = b; bones.push(b); return b; };
  // ---- vertical layout (metres)
  const ankleY = 0.085 * S, shin = 0.43 * S * Lg, thigh = 0.44 * S * Lg;
  const kneeY = ankleY + shin, hipY = kneeY + thigh;
  const pelvisY = hipY + 0.065 * S;
  const spineY = pelvisY + 0.11 * S * T, chestY = spineY + 0.17 * S * T, neckY = chestY + 0.205 * S * T;
  const headY = neckY + 0.085 * S * Nk;
  const hs = 0.25 * S * Hs;               // one "head unit": chin to crown
  bone('root', null, v(0, 0, 0));
  bone('pelvis', 'root', v(0, pelvisY, 0));
  bone('spine', 'pelvis', v(0, spineY, -0.012 * S));
  bone('chest', 'spine', v(0, chestY, -0.01 * S));
  bone('neck', 'chest', v(0, neckY, -0.02 * S));
  bone('head', 'neck', v(0, headY, -0.005 * S));
  // face bones, in head units from the head joint (which sits at the top of the neck, behind the jaw)
  bone('jaw', 'head', v(0, headY + 0.06 * hs, 0.02 * hs));
  const eyeX = 0.13 * hs * dial(avatar, 'eyeSpacing', 1, 0.12), eyeY = headY + 0.335 * hs, eyeZ = 0.262 * hs;
  for (const [s, side] of [[1, 'L'], [-1, 'R']]) {
    bone('eye' + side, 'head', v(s * eyeX, eyeY, eyeZ));
    bone('lid' + side, 'head', v(s * eyeX, eyeY, eyeZ));
  }
  // ---- arms. A relaxed A-pose: straight arms, angled out a little, palms facing the thighs.
  const shoulderX = 0.19 * S * W * Sh, shoulderY = chestY + 0.16 * S * T;
  const upper = 0.295 * S * Ar, fore = 0.26 * S * Ar, palm = 0.095 * S * Hd;
  const spread = 0.2;
  for (const [s, side] of [[1, 'L'], [-1, 'R']]) {
    const dir = [Math.sin(spread) * s, -Math.cos(spread), 0];
    bone('clav' + side, 'chest', v(s * 0.025 * S, shoulderY + 0.012 * S, 0.035 * S));
    const sh = v(s * shoulderX, shoulderY, -0.012 * S);
    bone('upperArm' + side, 'clav' + side, sh);
    const el = add(sh, dir, upper); el[2] -= 0.012 * S;
    bone('foreArm' + side, 'upperArm' + side, el);
    const wr = add(el, dir, fore); wr[2] += 0.02 * S;
    bone('hand' + side, 'foreArm' + side, wr);
    // grip: in the palm, turned so +y points forward (where a held blade runs)
    bone('grip' + side, 'hand' + side, add(add(wr, dir, palm * 0.62), [-s * 0.012 * S * Hd, 0, 0.008 * S]), { rot: [Math.PI / 2, 0, 0] });
    // fingers: four bases across the knuckles (z), the ring bone carries the little finger too
    const knuckle = add(wr, dir, palm);
    [['index', 0.026], ['middle', 0.007], ['ring', -0.016]].forEach(([f, z]) => {
      const base = add(knuckle, [0, 0, z * S * Hd], 1);
      const len = (f === 'middle' ? 0.048 : f === 'index' ? 0.044 : 0.042) * S * Hd;
      bone(f + '1' + side, 'hand' + side, base);
      bone(f + '2' + side, f + '1' + side, add(base, dir, len));
    });
    const tb = add(add(wr, dir, palm * 0.28), [-s * 0.012 * S * Hd, 0, 0.026 * S * Hd]);
    bone('thumb1' + side, 'hand' + side, tb);
    bone('thumb2' + side, 'thumb1' + side, add(tb, [s * 0.006 * S, -0.03 * S * Hd, 0.022 * S * Hd]));
  }
  // ---- legs
  const hipX = 0.092 * S * W;
  for (const [s, side] of [[1, 'L'], [-1, 'R']]) {
    bone('thigh' + side, 'pelvis', v(s * hipX, hipY, 0.005 * S));
    bone('shin' + side, 'thigh' + side, v(s * hipX * 0.96, kneeY, 0.012 * S));
    bone('foot' + side, 'shin' + side, v(s * hipX * 0.94, ankleY, -0.018 * S));
    bone('toe' + side, 'foot' + side, v(s * hipX * 0.96, 0.025 * S, 0.125 * S));
  }
  // ---- spring chains (driven at runtime)
  const chain = (name, parent, start, step, n) => { let p = parent, at = start; for (let i = 1; i <= n; i++) { bone(name + i, p, at); p = name + i; at = add(at, step); } };
  chain('hair', 'head', v(0, headY + 0.42 * hs, -0.42 * hs), v(0, -0.16 * hs * 1.4, -0.03 * hs), 3);
  chain('hat', 'head', v(0, headY + 1.05 * hs, -0.05 * hs), v(0, 0.28 * hs, -0.06 * hs), 2);
  chain('beard', 'jaw', v(0, headY - 0.2 * hs, 0.3 * hs), v(0, -0.2 * hs, 0.02 * hs), 2);
  const backZ = -0.13 * S * W;
  chain('capeL', 'chest', v(0.11 * S * W, shoulderY - 0.02 * S, backZ - 0.02 * S), v(0.015 * S, -0.36 * S, -0.02 * S), 3);
  chain('capeR', 'chest', v(-0.11 * S * W, shoulderY - 0.02 * S, backZ - 0.02 * S), v(-0.015 * S, -0.36 * S, -0.02 * S), 3);
  const skirtY = pelvisY - 0.04 * S, skirtLen = (hipY - ankleY) * 0.42;
  chain('skirtF', 'pelvis', v(0, skirtY, 0.115 * S * W), v(0, -skirtLen, 0.02 * S), 2);
  chain('skirtB', 'pelvis', v(0, skirtY, -0.12 * S * W), v(0, -skirtLen, -0.02 * S), 2);
  chain('skirtL', 'pelvis', v(0.16 * S * W, skirtY, 0), v(0.02 * S, -skirtLen, 0), 2);
  chain('skirtR', 'pelvis', v(-0.16 * S * W, skirtY, 0), v(-0.02 * S, -skirtLen, 0), 2);
  bones.forEach((b, i) => { b.index = i; });
  return { bones, byName, P, hs, headY, eyeY, height: headY + 0.82 * hs, ankleY, kneeY, hipY, pelvisY, spineY, chestY, neckY, shoulderY, shoulderX, hipX };
}

/** Which bones are part of each body region, for masked animation layers. */
export const MASKS = {
  full: null,
  upper: ['spine', 'chest', 'neck', 'head', 'jaw', 'clavL', 'upperArmL', 'foreArmL', 'handL', 'clavR', 'upperArmR', 'foreArmR', 'handR',
    ...['L', 'R'].flatMap(s => ['thumb1', 'thumb2', 'index1', 'index2', 'middle1', 'middle2', 'ring1', 'ring2'].map(f => f + s))],
  arms: ['clavL', 'upperArmL', 'foreArmL', 'handL', 'clavR', 'upperArmR', 'foreArmR', 'handR',
    ...['L', 'R'].flatMap(s => ['thumb1', 'thumb2', 'index1', 'index2', 'middle1', 'middle2', 'ring1', 'ring2'].map(f => f + s))],
  head: ['neck', 'head', 'jaw'],
};
/** Bones the clips animate (springs, eyes and lids are procedural). */
export const ANIMATED = ['pelvis', 'spine', 'chest', 'neck', 'head', 'jaw',
  ...['L', 'R'].flatMap(s => ['clav', 'upperArm', 'foreArm', 'hand', 'thumb1', 'thumb2', 'index1', 'index2', 'middle1', 'middle2', 'ring1', 'ring2', 'thigh', 'shin', 'foot', 'toe'].map(b => b + s))];
