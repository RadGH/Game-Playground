// The rig: puts a build together and moves it.
//
//   legsRig(id)   → { group, type, pose(anim, phase) → { hip: [x, y, z] } }
//                   The legs stand on the ground origin and face +x. pose() redraws them for one moment of an
//                   animation and returns the HIP SOCKET (legs-local): where the upper body hangs this frame
//                   (height + sway). Each leg type moves its own way: bipeds stride, reverse joints hop, quads step
//                   in diagonal pairs, treads roll, hover skirts bob.
//   upperRig(build) → { group, torso, parts: { core, head, armL, armR, booster, wArmL, wArmR, wShL, wShR },
//                       pose(anim, phase), muzzle(key) → THREE.Vector3 (upper-local) }
//                   The group's origin IS the hip socket; the upper body turns to aim as one piece (group.rotation.y).
//                   Every part is its own child of `torso`, so the baker can bake each one alone in its assembled pose.
//   assemble(build) → { legs, upper }
//
// A build: { head, core, arms, legs, booster, generator, cooling, cpu, weapons: { armL, armR, shoulderL, shoulderR } }
// (part ids from data/parts.json; empty weapon slots are null).
import * as THREE from 'three';
import { VISUALS, ik, ease, lerp, clamp01, TAU } from './parts/kit.js';
import './parts/all.js';
import { PARTS_JSON } from './data.js';

export const PARTS = Object.fromEntries(PARTS_JSON.parts.map(p => [p.id, p]));

export const LEG_ANIMS = {
  idle:       { label: 'Idle',        frames: 4, fps: 4 },
  walk:       { label: 'Walk',        frames: 8, fps: 10 },
  boost:      { label: 'Boost',       frames: 4, fps: 10 },
  jump:       { label: 'Jump',        frames: 6, fps: 10, once: true },
  hover:      { label: 'Hover',       frames: 4, fps: 8 },
  land:       { label: 'Land',        frames: 4, fps: 10, once: true },
  quickboost: { label: 'Quick boost', frames: 4, fps: 12, once: true },
  down:       { label: 'Down',        frames: 6, fps: 8, once: true },
};
export const UPPER_ANIMS = {
  idle:            { label: 'Idle',          frames: 4, fps: 4 },
  'fire-L':        { label: 'Fire left',     frames: 3, fps: 14, once: true },
  'fire-R':        { label: 'Fire right',    frames: 3, fps: 14, once: true },
  'fire-shoulder': { label: 'Fire shoulder', frames: 3, fps: 12, once: true },
  down:            { label: 'Down',          frames: 6, fps: 8, once: true },
};
/** The height the game should lift a mech during an animation (units; the legs bake never leaves the ground). */
export function animAlt(anim, phase) {
  if (anim === 'jump') return phase < 0.3 ? 0 : 0.22 * Math.sin(Math.PI * Math.min(1, (phase - 0.3) / 0.7) * 0.5);
  if (anim === 'hover') return 0.22 + 0.01 * Math.sin(phase * TAU);
  if (anim === 'land') return phase < 0.2 ? 0.03 * (1 - phase / 0.2) : 0;
  return 0;
}

/** One foot's place in a walk cycle: u = −0.5..0.5 along the stride (+ = forward), lift 0..1. duty = share on the ground. */
function step(phase, duty = 0.55) {
  const t = ((phase % 1) + 1) % 1;
  if (t < duty) return { u: 0.5 - t / duty, lift: 0 };
  const s = (t - duty) / (1 - duty);
  return { u: -0.5 + ease(s), lift: Math.sin(Math.PI * s) };
}
const wave = (ph, k = 1) => Math.sin(ph * TAU * k);
const pick = (arr, ph) => arr[Math.min(arr.length - 1, Math.floor(ph * arr.length + 1e-6))];

// =====================================================================================================================
// Legs. Each type turns (anim, phase) into a skeleton the maker's drawer dresses: st.legs[i] = joint points, plus
// st.hip (the socket), st.jets (0..1 thruster glow) and type-specific values.

function bipedState(D, anim, ph, reverse = false) {
  let hipY = D.hip, sx = 0, sz = 0, lean = 0, jets = 0, roll = 0;
  const feet = [-1, 1].map(s => ({ s, x: 0, y: 0, z: s * D.stance, pitch: 0 }));
  if (anim === 'idle') { hipY -= 0.005 * (1 - Math.cos(ph * TAU)) / 2; }
  else if (anim === 'walk') {
    for (const f of feet) { const st = step(ph + (f.s < 0 ? 0 : 0.5)); f.x = st.u * D.stride; f.y = st.lift * D.lift; f.pitch = st.lift * 0.35 * (st.u < 0 ? -1 : 1); }
    hipY -= 0.016 * Math.abs(Math.cos(ph * TAU)); sz = 0.012 * Math.sin(ph * TAU); sx = 0.01; lean = 0.06;
  } else if (anim === 'boost') {
    // skating on foot thrusters: a low wide stance, one foot ahead, a gentle glide
    hipY -= 0.035 + 0.004 * wave(ph); sx = 0.03; lean = 0.2; jets = 0.8 + 0.2 * wave(ph, 2);
    feet[0].x = 0.05; feet[1].x = -0.06; feet[0].z *= 1.25; feet[1].z *= 1.25; feet[0].y = feet[1].y = 0.008; feet[1].pitch = -0.25;
  } else if (anim === 'jump') {
    const k = pick([0, 1, 2, 3, 4, 5], ph);
    const crouch = [0.09, 0.02, 0, 0, 0, 0][k], tuck = [0, 0, 0.05, 0.09, 0.1, 0.08][k];
    hipY -= crouch; jets = k >= 1 ? [0, 1, 0.9, 0.6, 0.4, 0.3][k] : 0;
    for (const f of feet) { f.y = tuck * (f.s < 0 ? 1 : 0.8); f.x = tuck * (f.s < 0 ? 0.3 : -0.4); f.pitch = k === 1 ? -0.4 : -tuck * 2; }
  } else if (anim === 'hover') {
    hipY += 0.003 * wave(ph); jets = 0.7 + 0.15 * wave(ph, 2);
    for (const f of feet) { f.y = 0.05 + 0.006 * wave(ph + (f.s > 0 ? 0.3 : 0)); f.x = -0.025; f.pitch = -0.45; f.z *= 0.9; }
  } else if (anim === 'land') {
    const k = pick([0, 1, 2, 3], ph); hipY -= [0.11, 0.08, 0.04, 0.01][k]; jets = [0.6, 0.2, 0, 0][k];
    feet[0].z *= 1.15; feet[1].z *= 1.15;
  } else if (anim === 'quickboost') {
    const k = pick([0, 1, 2, 3], ph); const a = [1, 0.9, 0.55, 0.2][k];
    hipY -= 0.045 * a; sx = 0.05 * a; lean = 0.38 * a; jets = a;
    feet[0].x = 0.07 * a; feet[1].x = -0.11 * a; feet[1].y = 0.03 * a; feet[1].pitch = -0.6 * a;
  } else if (anim === 'down') {
    const t = ease(ph * 1.2);
    hipY = lerp(D.hip, D.hip * 0.42, t); sx = 0.04 * t; roll = 0.12 * t; lean = 0.3 * t;
    feet[0].x = 0.02 * t; feet[1].x = -0.05 * t; feet[0].z *= 1 + 0.25 * t; feet[1].z *= 1 + 0.4 * t;
  }
  const hip = [sx, hipY, sz];
  // the legs' own joints hang from the pelvis below the socket
  const legs = feet.map(f => {
    const hipJ = [sx, hipY - D.drop, sz + f.s * D.hipW - roll * 0.05 * f.s];
    hipJ[1] -= roll * f.s * 0.02;
    if (!reverse) {
      const ankle = [f.x, f.y + D.ankle, f.z];
      const [knee, a] = ik(hipJ, ankle, D.thigh, D.shin, [1, 0, f.s * 0.12]);
      return { s: f.s, hip: hipJ, knee, ankle: a, foot: [f.x, f.y, f.z], pitch: f.pitch };
    }
    // bird legs: thigh forward to the knee, shin back down to a raised heel, then the long foot bone to the toes
    const toe = [f.x + D.toe * 0.5, f.y, f.z];
    const heel = [toe[0] - D.meta * 0.55, toe[1] + D.meta * 0.83, toe[2]];
    const [knee, h] = ik(hipJ, heel, D.thigh, D.shin, [1, 0.25, f.s * 0.1]);
    return { s: f.s, hip: hipJ, knee, ankle: h, foot: toe, pitch: f.pitch };
  });
  return { hip, lean, jets, roll, legs, pelvis: [sx, hipY - D.drop * 0.5, sz] };
}

function quadState(D, anim, ph) {
  let hipY = D.hip, pitch = 0, roll = 0, jets = 0, sx = 0;
  const corners = [[1, -1], [1, 1], [-1, -1], [-1, 1]];        // front-left, front-right, back-left, back-right
  const feet = corners.map(([fx, fz]) => ({ fx, fz, x: fx * D.reachX, y: 0, z: fz * D.reachZ }));
  if (anim === 'idle') hipY -= 0.004 * (1 - Math.cos(ph * TAU)) / 2;
  else if (anim === 'walk') {
    feet.forEach((f, i) => { const st = step(ph + ((i === 0 || i === 3) ? 0 : 0.5), 0.6); f.x += st.u * D.stride; f.y = st.lift * D.lift; });
    hipY -= 0.008 * Math.abs(Math.cos(ph * TAU)); roll = 0.025 * Math.sin(ph * TAU);
  } else if (anim === 'boost') { hipY -= 0.02; pitch = -0.08; jets = 0.85 + 0.15 * wave(ph, 2); feet.forEach(f => { f.y = 0.006; }); sx = 0.02; }
  else if (anim === 'jump') {
    const k = pick([0, 1, 2, 3, 4, 5], ph); hipY -= [0.07, 0.01, 0, 0, 0, 0][k]; jets = [0, 1, 0.9, 0.6, 0.4, 0.3][k];
    feet.forEach(f => { f.y = [0, 0, 0.04, 0.07, 0.08, 0.06][k]; f.x *= 0.88; f.z *= 0.9; });
  } else if (anim === 'hover') { jets = 0.75 + 0.15 * wave(ph, 2); hipY += 0.003 * wave(ph); feet.forEach(f => { f.y = 0.05; f.x *= 0.85; f.z *= 0.85; }); }
  else if (anim === 'land') { const k = pick([0, 1, 2, 3], ph); hipY -= [0.08, 0.06, 0.03, 0.01][k]; feet.forEach(f => { f.x *= 1.06; f.z *= 1.06; }); }
  else if (anim === 'quickboost') { const a = pick([1, 0.85, 0.5, 0.2], ph); hipY -= 0.03 * a; pitch = -0.16 * a; jets = a; sx = 0.04 * a; }
  else if (anim === 'down') { const t = ease(ph * 1.2); hipY = lerp(D.hip, D.hip * 0.45, t); roll = 0.14 * t; pitch = -0.1 * t; feet.forEach(f => { f.x *= 1 + 0.25 * t; f.z *= 1 + 0.3 * t; }); }
  const legs = feet.map(f => {
    const root = [sx + f.fx * D.bodyX, hipY - D.drop - pitch * f.fx * D.bodyX - roll * f.fz * D.bodyZ, f.fz * D.bodyZ];
    const foot = [f.x + sx * 0.3, f.y, f.z];
    const [knee, ft] = ik(root, foot, D.upper, D.lower, [f.fx * 0.15, 1, f.fz * 0.55]);
    return { fx: f.fx, fz: f.fz, root, knee, foot: ft };
  });
  return { hip: [sx, hipY, 0], pitch, roll, jets, legs, body: [sx, hipY - D.drop, 0] };
}

function treadState(D, anim, ph) {
  let hipY = D.hip, pitch = 0, roll = 0, jets = 0, roll2 = 0, sag = 0;
  let track = 0;
  if (anim === 'idle') hipY -= 0.002 * wave(ph);
  else if (anim === 'walk') { track = ph; hipY += 0.003 * Math.abs(wave(ph, 2)); pitch = 0.012 * wave(ph, 2); }
  else if (anim === 'boost') { track = ph * 2; pitch = -0.05; jets = 0.85 + 0.15 * wave(ph, 2); }
  else if (anim === 'jump') { const k = pick([0, 1, 2, 3, 4, 5], ph); sag = [0.03, 0, 0, 0, 0, 0][k]; jets = [0, 1, 1, 0.8, 0.6, 0.5][k]; pitch = [0.04, -0.06, -0.03, 0, 0.02, 0.02][k]; }
  else if (anim === 'hover') { jets = 0.8 + 0.15 * wave(ph, 2); pitch = 0.02 * wave(ph); }
  else if (anim === 'land') { const k = pick([0, 1, 2, 3], ph); sag = [0.035, 0.02, 0.008, 0][k]; pitch = [0.05, 0.02, 0, 0][k]; }
  else if (anim === 'quickboost') { const a = pick([1, 0.8, 0.5, 0.2], ph); pitch = -0.1 * a; jets = a; track = 0.5 * a; }
  else if (anim === 'down') { const t = ease(ph * 1.2); sag = 0.05 * t; roll2 = 0.1 * t; pitch = 0.08 * t; }
  hipY -= sag;
  return { hip: [0, hipY, 0], pitch, roll: roll2, jets, track, sag, body: [0, hipY - D.drop, 0], down: anim === 'down' ? ph : 0 };
}

function hoverState(D, anim, ph) {
  let y = D.float, pitch = 0, roll = 0, jets = 0.55, sx = 0;
  if (anim === 'idle') y += 0.006 * wave(ph);
  else if (anim === 'walk') { y += 0.004 * wave(ph, 2); pitch = -0.06; jets = 0.7; roll = 0.02 * wave(ph); }
  else if (anim === 'boost') { pitch = -0.16; jets = 0.95 + 0.05 * wave(ph, 2); y -= 0.006; sx = 0.02; }
  else if (anim === 'jump') { const k = pick([0, 1, 2, 3, 4, 5], ph); y += [-0.025, 0.01, 0.02, 0.02, 0.02, 0.015][k]; jets = [0.4, 1, 0.9, 0.8, 0.7, 0.7][k]; }
  else if (anim === 'hover') { y += 0.01 + 0.006 * wave(ph); jets = 0.85; }
  else if (anim === 'land') { const k = pick([0, 1, 2, 3], ph); y -= [0.03, 0.02, 0.008, 0][k]; jets = [1, 0.8, 0.6, 0.55][k]; }
  else if (anim === 'quickboost') { const a = pick([1, 0.8, 0.5, 0.2], ph); pitch = -0.28 * a; jets = 0.6 + 0.4 * a; sx = 0.04 * a; }
  else if (anim === 'down') { const t = ease(ph * 1.2); y = lerp(D.float, 0.012, t); roll = 0.12 * t; pitch = 0.06 * t; jets = 0.55 * (1 - t); }
  return { hip: [sx, y + D.top, 0], y, pitch, roll, jets, sx };
}

const STATE = { biped: bipedState, reverse: (D, a, p) => bipedState(D, a, p, true), quad: quadState, treads: treadState, hover: hoverState };

export function legsRig(id) {
  const vis = VISUALS[id], part = PARTS[id];
  if (!vis || !part) throw new Error(`no legs visual for ${id}`);
  const group = new THREE.Group(); group.name = id;
  const body = new THREE.Group(); group.add(body);
  const D = vis.dims;
  function pose(anim = 'idle', phase = 0) {
    const st = STATE[part.type](D, anim, ((phase % 1) + 1) % 1);
    st.anim = anim; st.phase = phase;
    body.clear(); vis.draw(body, st);
    return { hip: st.hip, state: st };
  }
  pose('idle', 0);
  return { group, type: part.type, dims: D, pose };
}

// =====================================================================================================================
// Upper body

export const UPPER_KEYS = ['core', 'head', 'booster', 'armL', 'armR', 'wArmL', 'wArmR', 'wShL', 'wShR'];
/** Which build slot drives a layer key (for maker colours and stats). */
export function idOfKey(build, key) {
  return { core: build.core, head: build.head, booster: build.booster, armL: build.arms, armR: build.arms,
    wArmL: build.weapons?.armL, wArmR: build.weapons?.armR, wShL: build.weapons?.shoulderL, wShR: build.weapons?.shoulderR }[key] || null;
}

export function upperRig(build) {
  const group = new THREE.Group();
  const torso = new THREE.Group(); group.add(torso);
  const core = VISUALS[build.core], arms = VISUALS[build.arms];
  if (!core || !arms) throw new Error('a build needs a core and arms');
  const S = core.sockets;
  const parts = {};
  const mk = (key, at) => { const g = new THREE.Group(); g.userData.partKey = key; g.position.set(...at); torso.add(g); parts[key] = g; return g; };
  core.build(mk('core', [0, 0, 0]), PARTS[build.core]);
  if (build.head && VISUALS[build.head]) VISUALS[build.head].build(mk('head', S.neck), PARTS[build.head]);
  if (build.booster && VISUALS[build.booster]) VISUALS[build.booster].build(mk('booster', S.back), PARTS[build.booster]);
  const W = build.weapons || {};
  const twoR = W.armR && PARTS[W.armR]?.hand === 'two', twoL = !twoR && W.armL && PARTS[W.armL]?.hand === 'two';
  const armG = { L: mk('armL', S.shoulderL), R: mk('armR', S.shoulderR) };
  const wpn = {};
  for (const [key, slot, side] of [['wArmL', 'armL', -1], ['wArmR', 'armR', 1]]) if (W[slot] && VISUALS[W[slot]] && !(side < 0 && twoR) && !(side > 0 && twoL)) {
    const g = mk(key, [0, 0, 0]); VISUALS[W[slot]].build(g, PARTS[W[slot]], side); wpn[key] = g;
  }
  for (const [key, slot, side, sock] of [['wShL', 'shoulderL', -1, S.mountL], ['wShR', 'shoulderR', 1, S.mountR]]) if (W[slot] && VISUALS[W[slot]]) {
    const g = mk(key, sock); VISUALS[W[slot]].build(g, PARTS[W[slot]], side); wpn[key] = g;
  }
  const A = arms.dims;
  const restHand = side => [A.reach, -A.drop, side * A.inset];
  const recoil = { L: 0, R: 0, sh: 0 };

  function pose(anim = 'idle', phase = 0) {
    const ph = ((phase % 1) + 1) % 1;
    let pitch = 0, dy = 0, droop = 0, headNod = 0, breathe = 0;
    recoil.L = recoil.R = recoil.sh = 0;
    if (anim === 'idle') breathe = 0.004 * Math.sin(ph * TAU);
    else if (anim === 'fire-L') recoil.L = pick([1, 0.45, 0.12], ph);
    else if (anim === 'fire-R') recoil.R = pick([1, 0.45, 0.12], ph);
    else if (anim === 'fire-shoulder') recoil.sh = pick([1, 0.45, 0.12], ph);
    else if (anim === 'down') { const t = ease(ph * 1.25); pitch = 0.42 * t; dy = -0.02 * t; droop = t; headNod = 0.35 * t; }
    torso.position.set(-0.012 * recoil.sh, dy + breathe, 0);
    torso.rotation.set(0, 0, -pitch - 0.05 * recoil.sh);
    if (parts.head) parts.head.rotation.z = -headNod;
    // arms: hand targets in shoulder space, the elbow from IK, then the arm drawer dresses the joints
    const hands = {};
    const holder = twoR ? 'R' : twoL ? 'L' : null;
    const shOf = side => (side === 'L' ? S.shoulderL : S.shoulderR);
    const targets = {};
    for (const side of ['L', 'R']) {
      const s = side === 'L' ? -1 : 1;
      targets[side] = side === holder ? [A.reach * 0.95, -A.drop * 0.95, s * A.inset - s * Math.abs(shOf(side)[2]) * 0.45] : restHand(s);
    }
    if (holder) {   // the other hand reaches for the two-hander's front grip
      const o = holder === 'R' ? 'L' : 'R', hs = shOf(holder), os = shOf(o), t = targets[holder];
      targets[o] = [hs[0] + t[0] + 0.075 - os[0], hs[1] + t[1] + 0.008 - os[1], hs[2] + t[2] - os[2] + (o === 'L' ? -0.02 : 0.02)];
    }
    for (const side of ['L', 'R']) {
      const s = side === 'L' ? -1 : 1;
      let h = targets[side];
      const r = holder ? Math.max(recoil.L, recoil.R) * (side === holder ? 1 : 0.8) : recoil[side];
      h = [h[0] - 0.035 * r, h[1] + 0.012 * r, h[2]];
      if (droop) h = [lerp(h[0], 0.03, droop), lerp(h[1], -(A.upper + A.fore) * 0.92, droop), lerp(h[2], s * 0.03, droop)];
      const [elbow, hand] = ik([0, 0, 0], h, A.upper, A.fore, [-1, -0.2, s * 0.6]);
      hands[side] = { elbow, hand, recoil: r };
      const g = armG[side]; g.clear(); arms.draw(g, PARTS[build.arms], s, { shoulder: [0, 0, 0], elbow, hand, droop });
    }
    // arm weapons ride the hands (a two-hander sits in the right hand, the left hand supports it)
    for (const [key, side] of [['wArmL', 'L'], ['wArmR', 'R']]) {
      const g = wpn[key]; if (!g) continue;
      const sh = side === 'L' ? S.shoulderL : S.shoulderR, h = hands[side];
      g.position.set(sh[0] + h.hand[0], sh[1] + h.hand[1], sh[2] + h.hand[2]);
      g.rotation.set(0, 0, 0.08 * h.recoil - droop * 1.1);
    }
    for (const [key, sock] of [['wShL', S.mountL], ['wShR', S.mountR]]) {
      const g = wpn[key]; if (!g) continue;
      g.position.set(sock[0] - 0.02 * recoil.sh, sock[1], sock[2]); g.rotation.set(0, 0, 0.06 * recoil.sh - droop * 0.2);
    }
    group.updateMatrixWorld(true);
  }
  /** A weapon's muzzle in the upper group's space (null when the slot is empty). */
  function muzzle(key) {
    const g = parts[key]; if (!g?.userData.muzzle) return null;
    group.updateMatrixWorld(true);
    const m = new THREE.Vector3(...g.userData.muzzle).applyMatrix4(g.matrixWorld);
    return m.applyMatrix4(new THREE.Matrix4().copy(group.matrixWorld).invert());
  }
  pose('idle', 0);
  return { group, torso, parts, pose, muzzle, sockets: S, twoHanded: twoR ? 'R' : twoL ? 'L' : null };
}

export function assemble(build) { return { legs: legsRig(build.legs), upper: upperRig(build) }; }
