// Kestrel (fable) — the clips. Every clip is a whole-body pose function of u (0..1) sampled into keyframes for
// the standard Three.js mixer, as Chibi 2 does; then a follow-through pass drags each child a little behind its
// parent so a pose does not arrive all at once. Face bones are never keyed (the face driver owns them); the
// fingers are keyed from a curl value per hand.
//
// Conventions (bone local, radians): an ARM at [0,0,0] hangs straight down; x negative swings it forward, z moves
// it out from the body (sign by side), y twists it. ELBOW x negative bends the forearm forward. A LEG x negative
// swings forward; KNEE x positive bends the shin back; FOOT x positive points the toes. Hips/spine/chest/head
// x positive leans forward, y turns, z tilts.
import * as THREE from 'three';
import { FINGERS } from './rig.js';

export const KESTREL_ANIMS = ['idle', 'ready', 'walk', 'run', 'sprint', 'crouch', 'attack', 'aim', 'interact', 'cast', 'hit', 'guard', 'wave', 'talk', 'jump', 'dead'];
export const ONE_SHOTS = new Set(['attack', 'cast', 'hit', 'jump', 'wave', 'interact', 'dead']);
export const LENGTHS = { idle: 3.6, ready: 1.8, walk: 1.0, run: 0.62, sprint: 0.52, crouch: 2.6, attack: 0.9, aim: 2.2, interact: 1.3, cast: 1.3, hit: 0.55, guard: 2.2, wave: 2.0, talk: 2.6, jump: 1.05, dead: 1.3 };

const { sin, cos, PI, max, min, abs } = Math;
const TAU = PI * 2;
const ss = (u, a, b) => THREE.MathUtils.smoothstep(u, a, b);
const env = (u, a, b, c, d) => ss(u, a, b) * (1 - ss(u, c, d));
const lerp = THREE.MathUtils.lerp;

const BODY = ['hips', 'spine', 'chest', 'neck', 'head', 'armL', 'armR', 'elbowL', 'elbowR', 'handL', 'handR', 'legL', 'legR', 'kneeL', 'kneeR', 'footL', 'footR', 'toesL', 'toesR'];

function blank() {
  const p = {};
  for (const n of BODY) p[n] = [0, 0, 0];
  p.bob = 0; p.sway = 0; p.surge = 0; p.rootY = 0; p.hipsX = 0;
  p.curlL = 0.25; p.curlR = 0.25; p.pointL = 0; p.pointR = 0; p.spreadL = 0; p.spreadR = 0; p.thumbL = 0.3; p.thumbR = 0.3;
  return p;
}
const sg = s => s === 'L' ? -1 : 1;
const arm = (p, s, fwd, out, twist = 0) => { p['arm' + s] = [-fwd, twist * sg(s), out * sg(s)]; };
const elbow = (p, s, bend, twist = 0) => { p['elbow' + s] = [-bend, twist * sg(s), 0]; };
const hand = (p, s, x = 0, y = 0, z = 0) => { p['hand' + s] = [x, y * sg(s), z * sg(s)]; };
const leg = (p, s, fwd, out = 0, twist = 0) => { p['leg' + s] = [-fwd, twist * sg(s), out * sg(s)]; };
const knee = (p, s, bend) => { p['knee' + s] = [bend, 0, 0]; };
const foot = (p, s, point, roll = 0) => { p['foot' + s] = [point, 0, roll * sg(s)]; };
const toes = (p, s, bend) => { p['toes' + s] = [bend, 0, 0]; };
const fist = (p, s, k = 1) => { p['curl' + s] = k; p['thumb' + s] = 0.6 * k + 0.3; };
const relaxed = (p, s) => { p['curl' + s] = 0.4; p['thumb' + s] = 0.35; };
const point = (p, s) => { p['curl' + s] = 0.95; p['point' + s] = 1; p['thumb' + s] = 0.5; };
const open = (p, s) => { p['curl' + s] = 0.05; p['spread' + s] = 1; p['thumb' + s] = 0.1; };
const noise = (t, a = 1, b = 1.7, c = 2.3) => (sin(t * a) + sin(t * b * 1.31 + 1.2) * 0.6 + sin(t * c * 0.77 + 2.1) * 0.4) / 2;

/** Relaxed standing: feet a little apart, arms out a touch from the body, weight on one leg. */
function stand(p, { out = 0.16, bend = 0.1, weight = 0 } = {}) {
  arm(p, 'L', 0.05, out); arm(p, 'R', 0.05, out);
  elbow(p, 'L', bend); elbow(p, 'R', bend);
  hand(p, 'L', 0, 0, 0.08); hand(p, 'R', 0, 0, 0.08);
  leg(p, 'L', 0, 0.05); leg(p, 'R', 0, 0.05);
  relaxed(p, 'L'); relaxed(p, 'R');
  p.hips[2] = weight * 0.03; p.chest[2] = -weight * 0.03;
}

function gait(p, u, { stride, kneeK, armK, elbowK, lean, bobK, lift = 0, surgeK = 0, hipTurn = 0.08, sway = 0.012 }) {
  const ph = u * TAU;
  for (const s of ['L', 'R']) {
    const f = ph + (s === 'L' ? 0 : PI);
    // thigh = cos(f): forward at f = 0 (heel strike), back at f = PI (toe off); the SWING is f in PI..2PI
    const thigh = stride * cos(f);
    const swing = max(0, -sin(f)), stance = 1 - swing;
    const push = max(0, sin(f - 0.55 * PI)) * stance;                 // the end of the stance, heel rising
    const strike = max(0, cos(f)) * stance * max(0, sin(f + 0.3));    // just after heel strike
    const kb = 0.08 + kneeK * (swing ** 1.3 * 1.1 + push * 0.45 + strike * 0.25);
    leg(p, s, thigh, 0.04); knee(p, s, kb);
    foot(p, s, 0.45 * push - 0.3 * max(0, cos(f)) * stance + 0.22 * swing - 0.15 * max(0, -cos(f)) * swing); toes(p, s, 0.6 * push);
  }
  // arms swing opposite the legs
  const aL = armK * cos(ph), aR = armK * cos(ph + PI);
  arm(p, 'L', -aL, 0.13 + lean * 0.25, 0.1); arm(p, 'R', -aR, 0.13 + lean * 0.25, 0.1);
  elbow(p, 'L', elbowK + max(0, aL) * 0.6); elbow(p, 'R', elbowK + max(0, aR) * 0.6);
  hand(p, 'L', 0.1, 0, 0.1); hand(p, 'R', 0.1, 0, 0.1);
  if (elbowK > 0.9) { fist(p, 'L', 0.85); fist(p, 'R', 0.85); } else { relaxed(p, 'L'); relaxed(p, 'R'); }
  // the body is lowest at mid-stance of either leg (ph = PI/2, 3PI/2) and highest as the legs pass
  p.bob = -bobK * (0.5 - 0.5 * cos(2 * ph + PI));
  p.rootY = lift * max(0, 0.5 + 0.5 * sin(2 * ph));
  p.sway = sway * sin(ph);
  p.surge = surgeK * sin(2 * ph);
  p.hips[1] = hipTurn * sin(ph); p.hips[2] = 0.05 * sin(ph);
  p.chest[1] = -hipTurn * 1.2 * sin(ph); p.chest[0] = lean * 0.6; p.spine[0] = lean * 0.4; p.hips[0] = lean * 0.1;
  p.head[0] = -lean * 0.5 + 0.02 * sin(2 * ph); p.neck[0] = -lean * 0.3;
}

/** The pose for clip `name` at u in 0..1. */
export function poseAt(name, u, ctx = {}) {
  const p = blank(), t = u * (LENGTHS[name] || 1);
  switch (name) {
    case 'idle': {
      stand(p, { weight: 0.5 + 0.5 * sin(u * TAU) });
      const br = 0.5 - 0.5 * cos(u * TAU * 2);                       // two breaths a loop
      p.chest[0] = 0.02 * br - 0.01; p.spine[0] = -0.01 * br; p.bob = -0.004 * br;
      p.head[0] = 0.015 * noise(t * 0.9); p.head[1] = 0.05 * noise(t * 0.6 + 3); p.head[2] = 0.01 * noise(t * 0.4 + 1);
      arm(p, 'L', 0.05 + 0.01 * br, 0.24 + 0.02 * br); arm(p, 'R', 0.05 + 0.01 * br, 0.24 + 0.02 * br);
      p.curlL = 0.4 + 0.06 * noise(t * 0.8 + 2); p.curlR = 0.4 + 0.06 * noise(t * 0.7);
      break;
    }
    case 'ready': {
      const br = sin(u * TAU);
      leg(p, 'L', 0.18, 0.2); leg(p, 'R', -0.12, 0.2); knee(p, 'L', 0.45); knee(p, 'R', 0.4); foot(p, 'L', 0.12); foot(p, 'R', 0.25);
      p.bob = -0.05; p.hips[0] = 0.12; p.chest[0] = 0.1 + 0.015 * br; p.chest[1] = 0.2; p.hips[1] = 0.12; p.head[1] = -0.2; p.head[0] = -0.08;
      arm(p, 'L', 0.9 + 0.03 * br, 0.35, 0.2); elbow(p, 'L', 1.5); hand(p, 'L', -0.2, 0, 0.1);
      arm(p, 'R', 0.6 + 0.03 * br, 0.45, 0.1); elbow(p, 'R', 1.7); hand(p, 'R', -0.3, 0, 0.1);
      fist(p, 'L'); fist(p, 'R');
      break;
    }
    case 'walk': gait(p, u, { stride: 0.48, kneeK: 0.8, armK: 0.5, elbowK: 0.3, lean: 0.03, bobK: 0.02, hipTurn: 0.1 }); break;
    case 'run': gait(p, u, { stride: 0.82, kneeK: 1.45, armK: 0.7, elbowK: 1.3, lean: 0.2, bobK: 0.03, lift: 0.045, surgeK: 0.01, hipTurn: 0.14, sway: 0.008 }); break;
    case 'sprint': gait(p, u, { stride: 1.05, kneeK: 1.85, armK: 0.95, elbowK: 1.55, lean: 0.38, bobK: 0.025, lift: 0.07, surgeK: 0.015, hipTurn: 0.18, sway: 0.006 }); break;
    case 'crouch': {
      const br = 0.5 - 0.5 * cos(u * TAU);
      leg(p, 'L', 1.35, 0.42); leg(p, 'R', 1.3, 0.42); knee(p, 'L', 2.15); knee(p, 'R', 2.1); foot(p, 'L', 0.55, 0.1); foot(p, 'R', 0.5, 0.1); toes(p, 'L', 0.4); toes(p, 'R', 0.4);
      p.bob = -0.5; p.surge = -0.06; p.hips[0] = 0.45; p.spine[0] = 0.08; p.chest[0] = -0.1 + 0.01 * br; p.neck[0] = -0.25; p.head[0] = -0.2;
      arm(p, 'L', 0.95, 0.35, 0.3); elbow(p, 'L', 1.1); hand(p, 'L', -0.4, 0, 0.3); relaxed(p, 'L');
      arm(p, 'R', 0.7, 0.4, 0.3); elbow(p, 'R', 1.0); hand(p, 'R', -0.5, 0, 0.2); fist(p, 'R', 0.6);
      break;
    }
    case 'attack': {
      // one-handed swing with the right: wind up over the shoulder, cut down and across, settle
      const wind = env(u, 0, 0.22, 0.3, 0.42), cut = ss(u, 0.3, 0.46), settle = ss(u, 0.62, 1);
      const swing = cut * (1 - settle);
      stand(p, { out: 0.2 });
      leg(p, 'L', 0.35 * (1 - settle * 0.5), 0.15); leg(p, 'R', -0.2 * (1 - settle), 0.15); knee(p, 'L', 0.5); knee(p, 'R', 0.3); foot(p, 'R', 0.25 * (1 - settle));
      p.bob = -0.04 - 0.05 * swing; p.hips[1] = -0.35 * wind + 0.45 * swing; p.chest[1] = -0.5 * wind + 0.55 * swing; p.chest[0] = -0.1 * wind + 0.3 * swing; p.spine[0] = 0.12 * swing;
      p.head[1] = 0.35 * wind - 0.3 * swing; p.head[0] = -0.1 * wind + 0.15 * swing;
      arm(p, 'R', 2.4 * wind + 0.3 * swing - 0.2 * swing * swing, 0.9 * wind + 0.4 * swing + 0.15, -0.3 * wind);
      elbow(p, 'R', 1.5 * wind + 0.3 * swing); hand(p, 'R', -0.3 * wind + 0.3 * swing, 0, 0);
      arm(p, 'L', 0.7 * wind + 0.5 * swing, 0.5, 0.2); elbow(p, 'L', 1.2); fist(p, 'R'); fist(p, 'L', 0.7);
      p.attackFwd = -2.4 * wind - 0.3 * swing;
      // the cut: the arm comes from over the shoulder (x = -2.4, i.e. far back/up) forward and down to -0.3
      p.armR = [lerp(0.4, -2.3, wind) * (1 - cut) + lerp(-2.3, 0.2, cut) * cut * (1 - settle) + -0.05 * settle, -0.3 * wind, 0.9 * wind + 0.45 * swing + 0.15 * settle];
      break;
    }
    case 'aim': {
      // bow draw, side-on: left arm straight out at the target, right hand drawn to the cheek, body turned
      const br = 0.5 - 0.5 * cos(u * TAU);
      leg(p, 'L', 0.2, 0.5); leg(p, 'R', -0.15, 0.5); knee(p, 'L', 0.35); knee(p, 'R', 0.25); foot(p, 'L', 0, 0.2);
      p.bob = -0.04; p.hips[1] = -0.55; p.chest[1] = -0.5; p.chest[0] = 0.05 + 0.01 * br; p.head[1] = 0.95; p.head[0] = -0.02; p.neck[1] = 0.2;
      arm(p, 'L', 1.55, 0.25, 0.2); elbow(p, 'L', 0.12); hand(p, 'L', 0, 0.2, -0.3); fist(p, 'L', 0.9);
      arm(p, 'R', 1.3 + 0.02 * br, 1.35, 0.4); elbow(p, 'R', 2.5); hand(p, 'R', 0.4, 0.3, 0); fist(p, 'R', 0.95);
      break;
    }
    case 'interact': {
      const reach = env(u, 0, 0.35, 0.7, 1);
      stand(p, { weight: 0.3 });
      leg(p, 'L', 0.15 * reach, 0.06); knee(p, 'L', 0.2 * reach); p.chest[0] = 0.12 * reach; p.spine[0] = 0.06 * reach; p.hips[1] = 0.1 * reach;
      p.head[0] = 0.1 * reach; p.head[1] = -0.1 * reach;
      arm(p, 'R', 1.45 * reach + 0.05, 0.1 + 0.1 * reach, 0.2 * reach); elbow(p, 'R', 0.25 + 0.05 * reach); hand(p, 'R', -0.15 * reach, 0, 0.05);
      p.curlR = 0.95 * reach + 0.28 * (1 - reach); p.pointR = reach; p.thumbR = 0.5;
      break;
    }
    case 'cast': {
      const gather = env(u, 0, 0.3, 0.45, 0.55), thrust = env(u, 0.45, 0.58, 0.8, 1);
      stand(p, { weight: 0.2 });
      leg(p, 'L', 0.3 * thrust, 0.2); leg(p, 'R', -0.2 * thrust, 0.2); knee(p, 'L', 0.5 * thrust); knee(p, 'R', 0.2 * thrust);
      p.bob = -0.03 * thrust; p.chest[0] = -0.12 * gather + 0.2 * thrust; p.spine[0] = 0.08 * thrust; p.head[0] = -0.08 * gather + 0.1 * thrust;
      for (const s of ['L', 'R']) {
        arm(p, s, 0.9 * gather + 1.5 * thrust, 0.45 * gather + 0.2, 0.2);
        elbow(p, s, 1.6 * gather + 0.15 * thrust); hand(p, s, -0.5 * gather + 0.2 * thrust, 0.3 * thrust, 0.0);
        p['curl' + s] = 0.5 * gather + 0.05 * thrust + 0.25 * (1 - gather - thrust); p['spread' + s] = thrust;
      }
      break;
    }
    case 'hit': {
      const k = env(u, 0, 0.12, 0.45, 1);
      stand(p, { out: 0.2 });
      p.chest[0] = -0.35 * k; p.spine[0] = -0.15 * k; p.head[0] = -0.3 * k; p.head[2] = 0.15 * k; p.surge = -0.06 * k; p.bob = -0.03 * k;
      leg(p, 'L', -0.25 * k, 0.12); leg(p, 'R', 0.15 * k, 0.12); knee(p, 'L', 0.3 * k); knee(p, 'R', 0.35 * k);
      arm(p, 'L', 0.6 * k, 0.5 * k + 0.15); arm(p, 'R', 0.5 * k, 0.6 * k + 0.15); elbow(p, 'L', 1.2 * k); elbow(p, 'R', 1.0 * k);
      break;
    }
    case 'guard': {
      const br = sin(u * TAU);
      leg(p, 'L', 0.3, 0.25); leg(p, 'R', -0.15, 0.25); knee(p, 'L', 0.55); knee(p, 'R', 0.45); foot(p, 'R', 0.15);
      p.bob = -0.08; p.hips[0] = 0.12; p.chest[0] = 0.15; p.chest[1] = 0.3; p.hips[1] = 0.15; p.head[1] = -0.3; p.head[0] = -0.05 + 0.01 * br;
      arm(p, 'L', 1.1, 0.35 + 0.02 * br, 0.4); elbow(p, 'L', 2.2); hand(p, 'L', -0.3, 0.2, 0.2); fist(p, 'L');
      arm(p, 'R', 0.9, 0.45, 0.2); elbow(p, 'R', 2.3); hand(p, 'R', -0.4, 0, 0); fist(p, 'R');
      break;
    }
    case 'wave': {
      const up = env(u, 0, 0.25, 0.75, 1), w = sin(u * TAU * 3) * up;
      stand(p, { weight: 0.4 });
      arm(p, 'R', 0.35 * up + 0.05, 2.55 * up + 0.16, 0.6 * up); elbow(p, 'R', 0.9 * up); hand(p, 'R', 0, 0.25 * w, -0.55 * w);
      p.spreadR = up; p.curlR = 0.28 - 0.22 * up; p.thumbR = 0.2;
      p.chest[2] = 0.08 * up; p.head[2] = -0.1 * up; p.head[1] = 0.1 * up;
      break;
    }
    case 'talk': {
      stand(p, { weight: 0.3 });
      const n1 = noise(t * 1.3), n2 = noise(t * 1.1 + 2.5), n3 = noise(t * 0.9 + 5);
      p.head[0] = 0.06 * n1; p.head[1] = 0.12 * n2; p.head[2] = 0.05 * n3;
      arm(p, 'R', 0.5 + 0.35 * n2, 0.35 + 0.1 * n1, 0.3); elbow(p, 'R', 1.4 + 0.4 * n1); hand(p, 'R', -0.3 * n3, 0.3 * n2, 0.2);
      arm(p, 'L', 0.3 + 0.2 * n3, 0.28, 0.2); elbow(p, 'L', 1.0 + 0.3 * n2); hand(p, 'L', 0.2 * n1, 0, 0.2);
      p.curlR = 0.2 + 0.2 * n1; p.spreadR = 0.5 + 0.5 * n2; p.curlL = 0.3; p.chest[1] = 0.05 * n2; p.chest[0] = 0.03 * n1;
      break;
    }
    case 'jump': {
      const crouch = env(u, 0, 0.18, 0.2, 0.32), air = env(u, 0.22, 0.4, 0.6, 0.82), land = env(u, 0.72, 0.82, 0.86, 1);
      const squat = max(crouch, land * 0.8);
      stand(p, { out: 0.25 });
      leg(p, 'L', 0.8 * squat + 0.9 * air, 0.12); leg(p, 'R', 0.8 * squat + 0.7 * air, 0.12);
      knee(p, 'L', 1.4 * squat + 1.5 * air); knee(p, 'R', 1.4 * squat + 1.3 * air); foot(p, 'L', 0.4 * air - 0.2 * squat); foot(p, 'R', 0.45 * air - 0.2 * squat);
      p.bob = -0.28 * squat; p.rootY = 0.55 * sin(PI * ss(u, 0.2, 0.84)) * (1 - land * 0.3);
      p.hips[0] = 0.25 * squat + 0.1 * air; p.chest[0] = 0.15 * squat - 0.15 * air; p.head[0] = -0.1 * squat - 0.05 * air;
      arm(p, 'L', -0.5 * squat + 1.4 * air, 0.3 + 0.6 * air); arm(p, 'R', -0.5 * squat + 1.4 * air, 0.3 + 0.6 * air); elbow(p, 'L', 0.3 + 0.4 * air); elbow(p, 'R', 0.3 + 0.4 * air);
      break;
    }
    case 'dead': {
      const k = ss(u, 0.05, 0.75), settle = ss(u, 0.7, 1);
      stand(p, { out: 0.3 });
      p.hipsX = -1.5 * k;                                           // the whole body tips onto its back
      p.bob = -(ctx.hipsRest || 0.94) * k + 0.12 * k; p.surge = -0.25 * k;
      p.rootY = 0;
      leg(p, 'L', -0.1 * k, 0.25 * k); leg(p, 'R', 0.15 * k, 0.15 * k); knee(p, 'L', 0.5 * k * (1 - settle * 0.6)); knee(p, 'R', 0.3 * k); foot(p, 'L', 0.4 * k); foot(p, 'R', 0.5 * k);
      arm(p, 'L', 0.25 * k, 0.9 * k + 0.2); arm(p, 'R', -0.3 * k, 0.6 * k + 0.2); elbow(p, 'L', 0.4 * k); elbow(p, 'R', 0.6 * k);
      p.head[0] = -0.3 * k; p.head[2] = 0.35 * k; p.chest[0] = 0.1 * k; p.spine[0] = 0.05 * k;
      p.curlL = 0.4; p.curlR = 0.45;
      break;
    }
    default: stand(p);
  }
  return p;
}

/** Follow-through: each child lags a little behind its parent's motion; loops stay continuous. */
const CHAINS = [
  ['hips', 'chest', 1, 0.3], ['chest', 'head', 0, 0.35], ['chest', 'head', 1, 0.4],
  ['armR', 'elbowR', 0, 0.3], ['elbowR', 'handR', 0, 0.4], ['armL', 'elbowL', 0, 0.3], ['elbowL', 'handL', 0, 0.4],
  ['armR', 'handR', 2, 0.25], ['armL', 'handL', 2, 0.25], ['legL', 'footL', 0, 0.25], ['legR', 'footR', 0, 0.25],
];
function followThrough(frames, loop, dt) {
  const n = frames.length, lag = Math.max(1, Math.round(0.07 / dt));
  const src = frames.map(f => JSON.parse(JSON.stringify(f.pose)));
  for (const [parent, child, axis, k] of CHAINS) {
    for (let i = 0; i < n; i++) {
      let j = i - lag; if (j < 0) j = loop ? (j + n - 1) % (n - 1) : 0;
      const dParent = src[i][parent][axis] - src[j][parent][axis];
      frames[i].pose[child][axis] = src[i][child][axis] - dParent * k;
    }
  }
}

/** Sample every clip into Three.js tracks for this rig. */
export function createClips(rig, anims = KESTREL_ANIMS) {
  const euler = new THREE.Euler(), quat = new THREE.Quaternion(), restHips = rig.byName.hips.position.y;
  const fingerBones = ['L', 'R'].flatMap(s => FINGERS.flatMap(f => [f + '1' + s, f + '2' + s]).concat(['thm1' + s, 'thm2' + s]));
  const thumbRest = {}; for (const s of ['L', 'R']) thumbRest[s] = rig.byName['thm1' + s].quaternion.clone();
  return anims.map(name => {
    const duration = LENGTHS[name] || 1, steps = Math.max(10, Math.ceil(duration * 30)), loop = !ONE_SHOTS.has(name);
    const frames = [];
    for (let i = 0; i <= steps; i++) frames.push({ pose: poseAt(name, i / steps, { hipsRest: restHips }) });
    followThrough(frames, loop, duration / steps);
    const times = frames.map((_, i) => i / steps * duration), tracks = [];
    for (const n of BODY) {
      const values = [];
      for (const f of frames) {
        const e = f.pose[n];
        if (n === 'hips') euler.set(e[0] + (f.pose.hipsX || 0), e[1], e[2]); else euler.set(e[0], e[1], e[2]);
        quat.setFromEuler(euler); values.push(quat.x, quat.y, quat.z, quat.w);
      }
      tracks.push(new THREE.QuaternionKeyframeTrack(n + '.quaternion', times, values));
    }
    tracks.push(new THREE.VectorKeyframeTrack('hips.position', times, frames.flatMap(f => [f.pose.sway || 0, restHips + (f.pose.bob || 0), f.pose.surge || 0])));
    tracks.push(new THREE.VectorKeyframeTrack('root.position', times, frames.flatMap(f => [0, f.pose.rootY || 0, 0])));
    // fingers from the curl / point / spread values
    for (const s of ['L', 'R']) {
      const sgn = s === 'L' ? 1 : -1;                                   // curling toward the palm is -z on the right hand
      for (const f of FINGERS) {
        const i = FINGERS.indexOf(f);
        for (const seg of [1, 2]) {
          const values = [];
          for (const fr of frames) {
            const P = fr.pose, isIndex = f === 'idx';
            let curl = P['curl' + s]; if (P['point' + s] && isIndex) curl = 0.05 * P['point' + s] + curl * (1 - P['point' + s]);
            const stagger = 1 + (i - 1.5) * 0.08 * (1 - curl);
            const angle = curl * (seg === 1 ? 1.25 : 1.35) * stagger;
            const spread = (P['spread' + s] || 0) * (i - 1.5) * 0.12 * (seg === 1 ? 1 : 0) - (seg === 1 ? (i - 1.5) * 0.04 : 0) * curl;
            euler.set(spread * sgn * -1, 0, angle * sgn); quat.setFromEuler(euler); values.push(quat.x, quat.y, quat.z, quat.w);
          }
          tracks.push(new THREE.QuaternionKeyframeTrack(f + seg + s + '.quaternion', times, values));
        }
      }
      for (const seg of [1, 2]) {
        const values = [];
        for (const fr of frames) {
          const k = fr.pose['thumb' + s] || 0.3;
          euler.set(seg === 1 ? -0.2 * k : -0.9 * k, 0, 0.5 * k * sgn * (seg === 1 ? 1 : 0)); quat.setFromEuler(euler);
          if (seg === 1) quat.premultiply(thumbRest[s]);
          values.push(quat.x, quat.y, quat.z, quat.w);
        }
        tracks.push(new THREE.QuaternionKeyframeTrack('thm' + seg + s + '.quaternion', times, values));
      }
    }
    return new THREE.AnimationClip(name, duration, tracks);
  });
}

/** For tests and sheets: the pose for a clip at u (mirrors the sampled frames). */
export { poseAt as samplePose };
