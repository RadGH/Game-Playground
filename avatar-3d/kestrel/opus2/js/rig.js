// Kestrel (opus) — body proportions and the skeleton.
//
// Every bone rests with NO rotation (world-aligned), placed at its joint in a relaxed A-pose. Clips therefore author
// plain rotations relative to that pose, and the mesh is built directly in world bind space. Sides follow Chibi 2:
// "L" bones are at -x and "R" bones at +x (s = -1 / +1), so a game that parents to gripR keeps doing so.
import * as THREE from 'three';
import { clamp, table } from './kmath.js';

/**
 * Landmarks in metres for a body at real scale (feet at y = 0, facing +z). `form` 'masc' | 'fem'. body.height and
 * body.width (0..1) nudge the build; the whole thing is uniform-scaled to a target height afterwards (opts.height).
 */
export function proportions(body = {}) {
  const fem = body.form === 'fem';
  const h = Number.isFinite(body.height) ? clamp(body.height, 0, 1) : 0.5;
  const w = Number.isFinite(body.width) ? clamp(body.width, 0, 1) : 0.5;
  const base = fem ? 1.68 : 1.78;
  const T = base * (0.955 + 0.09 * h);     // 0..1 height → ±4.5 %
  const k = T / base;                      // vertical scale
  const W = 0.9 + 0.2 * w;                 // girth
  // v2: landmarks refitted to the Codex pictures (pixel-measured, ref/*-front.png at the stated heights) and the Meshy
  // model's numbers (opus2-kit/meshy-*.json, tools/fit.py). Shoulders, chest and head sit lower than v1; arms shorter;
  // ankles behind the hips (a standing plumb line), knees just behind them.
  const P = fem ? {
    fem: true, T, k, W,
    ankleY: 0.08, ankleZ: -0.08, kneeY: 0.49, kneeZ: -0.028, hipY: 0.875, hipX: 0.09, crotchY: 0.79,
    hipsY: 0.915, spineY: 1.0, chestY: 1.135, neckY: 1.297, headY: 1.40, chinY: 1.355, headH: 0.24,
    shoulderX: 0.156, shoulderY: 1.222, clavY: 1.255,
    upperArm: 0.23, foreArm: 0.21, palm: 0.086, armA: 0.41, foreA: 0.34,
    footLen: 0.235, footW: 0.04, headZ: 0.012, ankleOut: 0.03,
  } : {
    fem: false, T, k, W,
    ankleY: 0.085, ankleZ: -0.085, kneeY: 0.51, kneeZ: -0.03, hipY: 0.905, hipX: 0.095, crotchY: 0.82,
    hipsY: 0.95, spineY: 1.072, chestY: 1.232, neckY: 1.40, headY: 1.515, chinY: 1.468, headH: 0.24,
    shoulderX: 0.2, shoulderY: 1.33, clavY: 1.37,
    upperArm: 0.262, foreArm: 0.232, palm: 0.098, armA: 0.42, foreA: 0.35,
    footLen: 0.272, footW: 0.046, headZ: 0.012, ankleOut: 0.034,
  };
  // The torso is still parameterised by v1's heights (its muscle relief, the underwear and outfit edges are all
  // written in them); yMap sends a v1 height to where it sits now, yInv back. Both at base scale × k.
  const KN = fem
    ? [[0.5, 0.5], [0.785, 0.79], [0.965, 0.95], [1.05, 1.01], [1.135, 1.077], [1.225, 1.155], [1.308, 1.235], [1.385, 1.312], [1.6, 1.527]]
    : [[0.5, 0.5], [0.822, 0.82], [1.0, 0.995], [1.1, 1.07], [1.2, 1.16], [1.3, 1.25], [1.4, 1.35], [1.478, 1.428], [1.7, 1.65]];
  const mapT = table(KN), invT = table(KN.map(([a, b]) => [b, a]));
  P.yMap = y => mapT(y / k)[0] * k;
  P.yInv = y => invT(y / k)[0] * k;
  for (const key of ['ankleY', 'kneeY', 'hipY', 'crotchY', 'hipsY', 'spineY', 'chestY', 'neckY', 'headY', 'chinY', 'shoulderY', 'clavY', 'headH', 'upperArm', 'foreArm', 'palm', 'footLen'])
    P[key] *= k;
  P.shoulderX *= Math.sqrt(W) * (fem ? 1 : 1); P.hipX *= W;
  P.HS = P.headH / 0.24;   // head-space scale: face numbers are written for a 0.24 m head
  // the arm chain in bind space (an A-pose, the forearm a little forward of the upper arm: a relaxed elbow)
  const sh = [P.shoulderX, P.shoulderY, fem ? -0.006 : -0.016];
  const el = [sh[0] + Math.sin(P.armA) * P.upperArm, sh[1] - Math.cos(P.armA) * P.upperArm, sh[2] - 0.008];
  const wr = [el[0] + Math.sin(P.foreA) * P.foreArm, el[1] - Math.cos(P.foreA) * P.foreArm * 0.995, el[2] + 0.06 * P.k];
  P.arm = { sh, el, wr };
  P.leg = {
    hip: [P.hipX, P.hipY, 0.0],
    knee: [P.hipX + P.ankleOut * 0.45 * W, P.kneeY, P.kneeZ],
    ankle: [P.hipX + P.ankleOut * W, P.ankleY, P.ankleZ],
  };
  return P;
}

const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'];
export const FACE_BONES = ['jaw', 'lipD', 'lipU', 'mouthCL', 'mouthCR', 'eyeL', 'eyeR', 'pupilL', 'pupilR', 'lidL', 'lidR', 'browInL', 'browOutL', 'browInR', 'browOutR', 'cheekL', 'cheekR'];

/**
 * The skeleton. `face` gives the rest positions of the face bones (from face.js `faceLandmarks`), `hand` the finger
 * joints (from body.js `handLayout`). 64 bones.
 */
export function createRig(P, face, hands) {
  const bones = [], byName = {};
  const bone = (name, parent, pos) => {
    const b = new THREE.Bone(); b.name = name;
    const pw = parent ? byName[parent].userData.world : [0, 0, 0];
    b.position.set(pos[0] - pw[0], pos[1] - pw[1], pos[2] - pw[2]);
    b.userData.world = pos.slice(); b.userData.index = bones.length; b.userData.rest = b.position.clone();
    bones.push(b); byName[name] = b; if (parent) byName[parent].add(b);
    return b;
  };
  bone('root', null, [0, 0, 0]);
  bone('hips', 'root', [0, P.hipsY, 0]);
  bone('spine', 'hips', [0, P.spineY, -0.01]);
  bone('chest', 'spine', [0, P.chestY, -0.015]);
  bone('neck', 'chest', [0, P.neckY, -0.02]);
  bone('head', 'neck', [0, P.headY, P.headZ - 0.01]);
  // face
  bone('jaw', 'head', face.jaw);
  bone('lipD', 'jaw', face.lipD);
  bone('lipU', 'head', face.lipU);
  bone('mouthCL', 'head', face.mouthCL);
  bone('mouthCR', 'head', face.mouthCR);
  for (const s of ['L', 'R']) {
    bone('eye' + s, 'head', face['eye' + s]);
    bone('pupil' + s, 'eye' + s, face['eye' + s]);
    bone('lid' + s, 'head', face['eye' + s]);
  }
  for (const s of ['L', 'R']) { bone('browIn' + s, 'head', face['browIn' + s]); bone('browOut' + s, 'head', face['browOut' + s]); bone('cheek' + s, 'head', face['cheek' + s]); }
  // arms
  for (const [s, sg] of [['L', -1], ['R', 1]]) {
    const A = P.arm, X = p => [p[0] * sg, p[1], p[2]];
    bone('clav' + s, 'chest', [0.03 * sg, P.clavY, P.fem ? 0.006 : -0.002]);
    bone('arm' + s, 'clav' + s, X(A.sh));
    bone('elbow' + s, 'arm' + s, X(A.el));
    bone('hand' + s, 'elbow' + s, X(A.wr));
    const H = hands[s];
    bone('grip' + s, 'hand' + s, H.grip);
    for (const f of FINGERS) { bone(f + '1' + s, 'hand' + s, H[f][0]); bone(f + '2' + s, f + '1' + s, H[f][1]); }
  }
  for (const [s, sg] of [['L', -1], ['R', 1]]) {
    const L = P.leg, X = p => [p[0] * sg, p[1], p[2]];
    bone('leg' + s, 'hips', X(L.hip));
    bone('knee' + s, 'leg' + s, X(L.knee));
    bone('foot' + s, 'knee' + s, X(L.ankle));
    bone('toe' + s, 'foot' + s, [L.ankle[0] * sg + 0.004 * sg, 0.022 * P.k, L.ankle[2] + P.footLen * 0.66]);
  }
  bone('hairA', 'head', face.hairA);
  bone('hairB', 'hairA', face.hairB);
  bone('hairC', 'hairB', face.hairC);
  const root = byName.root;
  root.updateMatrixWorld(true);
  const index = Object.fromEntries(bones.map((b, i) => [b.name, i]));
  return { root, bones, byName, index, P, hands, face, height: P.T };
}
