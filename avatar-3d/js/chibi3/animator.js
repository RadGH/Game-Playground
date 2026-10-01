// Chibi 3 animator: a small custom layered animation system (not THREE.AnimationMixer).
//
// Every frame:
//   1. BASE — locomotion blended by speed: idle (or the combat 'ready' stance) -> walk -> run. Walk
//      and run share one phase (0 = left foot down), so blending them never pops a foot, and the
//      phase advances by distance / stride, so the feet do not skate at any speed.
//   2. ACTION — one-shot or looping clips (attacks, casts, emotes, death) crossfaded over the base
//      through a per-bone MASK: 'full', 'upper' (legs keep walking) or 'arms'. A full-body attack
//      started while moving drops to 'upper' on its own.
//   3. ADDITIVE — hit flinches and breathing layered on top.
//   4. POSTURE — the race's lean (an orc hunches, an undead slumps), folded in.
//   5. PROCEDURAL — finger grips, look-at, the face (expressions, blinks, glances, lip shapes),
//      two-hand IK (the off hand rides the haft), foot IK onto uneven ground, spring bones.
//
// API (index.js passes it through): play(name, { fade, mask, loop, restart }), setSpeed(m/s),
// setExpression(name, weight), say(text), lookAt(Vector3|null), setGround(fn(x, z) -> y),
// handsFree, update(dt, group), current, clips (names), walkSpeed / runSpeed (natural speeds).

import * as THREE from 'three';
import { clipSpecs, sampleClip, CLIP_BONES, CHIBI3_CLIP_GROUPS, CHIBI3_CLIPS } from './clips.js';
import { MASKS } from './rig.js';
import { MORPHS, EXPRESSIONS, VISEMES, visemeTrack } from './face.js';
import { Springs } from './springs.js';
import { twoBone, wpos, wquat } from './ik.js';

export { CHIBI3_CLIP_GROUPS, CHIBI3_CLIPS, EXPRESSIONS };

const NB = CLIP_BONES.length, NM = MORPHS.length;
const clipCache = new Map();
/** Actions that keep the legs even while moving (everything else drops to the upper body). */
const FULL_ONLY = new Set(['dead', 'getUp', 'stagger', 'jump', 'turnL', 'turnR', 'bow', 'roar', 'cheer', 'castAoe']);
const LOCO = new Set(['idle', 'ready', 'walk', 'run']);
const D = Math.PI / 180;

function maskWeights(name) {
  const w = new Float32Array(NB);
  const list = MASKS[name];
  for (let b = 0; b < NB; b++) {
    const n = CLIP_BONES[b];
    w[b] = !list ? 1 : list.includes(n) ? (n === 'spine' ? 0.55 : 1) : 0;
  }
  return w;
}
const MASK_W = { full: maskWeights('full'), upper: maskWeights('upper'), arms: maskWeights('arms') };

// ---- quaternion buffer helpers (x, y, z, w at offset o)
function nlerpInto(out, o, a, ao, b, bo, t) {
  let bx = b[bo], by = b[bo + 1], bz = b[bo + 2], bw = b[bo + 3];
  if (a[ao] * bx + a[ao + 1] * by + a[ao + 2] * bz + a[ao + 3] * bw < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw; }
  const x = a[ao] + (bx - a[ao]) * t, y = a[ao + 1] + (by - a[ao + 1]) * t, z = a[ao + 2] + (bz - a[ao + 2]) * t, w = a[ao + 3] + (bw - a[ao + 3]) * t;
  const l = Math.hypot(x, y, z, w) || 1;
  out[o] = x / l; out[o + 1] = y / l; out[o + 2] = z / l; out[o + 3] = w / l;
}
/** Sample a clip at time t (seconds) into buffer `out` (quats) and `pelOut` (3). */
function sampleInto(clip, t, out, pelOut) {
  const u = clip.loop ? ((t / clip.dur) % 1 + 1) % 1 : Math.min(1, Math.max(0, t / clip.dur));
  const f = u * (clip.frames - 1), i0 = Math.floor(f), i1 = Math.min(clip.frames - 1, i0 + 1), k = f - i0;
  const q = clip.quats;
  for (let b = 0; b < NB; b++) nlerpInto(out, b * 4, q, (i0 * NB + b) * 4, q, (i1 * NB + b) * 4, k);
  const p = clip.pel;
  pelOut[0] = p[i0 * 3] + (p[i1 * 3] - p[i0 * 3]) * k; pelOut[1] = p[i0 * 3 + 1] + (p[i1 * 3 + 1] - p[i0 * 3 + 1]) * k; pelOut[2] = p[i0 * 3 + 2] + (p[i1 * 3 + 2] - p[i0 * 3 + 2]) * k;
}

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler();
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _t = new THREE.Vector3(), _pole = new THREE.Vector3(), _m = new THREE.Matrix4();
const smooth = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

/** Fingers per hand: [bone base name, curl scale on segment 1, segment 2]. */
const FINGERS = [['index', 1, 1], ['middle', 1, 1.05], ['ring', 1.05, 1.1]];
/**
 * Gain per morph on top of face.js's displacements: the landmark morphs are authored conservatively
 * (a few millimetres), and at game distance an expression has to read, so the animator pushes them.
 */
export const MORPH_GAIN = { smile: 1.9, frown: 1.8, browUp: 1.5, browDown: 1.7, browSad: 1.7, sneer: 1.6, pucker: 1.3, wide: 1.5, press: 1.3, squint: 1.6, puff: 1 };
const GAIN = MORPHS.map(m => MORPH_GAIN[m] ?? 1);
const HAND_CURL = { open: -0.08, relax: 0.28, grip: 1, fist: 1.1, point: 1 };

export class Animator {
  constructor(R, sk, { hold = null, morphMeshes = [], body = null } = {}) {
    this.R = R; this.sk = sk; this.bones = sk.byName; this.body = body;
    this.morphMeshes = morphMeshes;
    this.setHold(hold);
    const clips = this.clips;
    this.clipBones = CLIP_BONES.map(n => this.bones[n]);
    this.pelvisBind = this.bones.pelvis.position.clone();
    // stride: one walk cycle (two steps) covers this many metres, so speed / stride = cycles per second
    const leg = R.hipY - R.ankleY;
    this.walkCycle = 2 * leg * (Math.sin(26 * D) + Math.sin(14 * D)) * 1.04;
    this.runCycle = 2 * leg * (Math.sin(38 * D) + Math.sin(22 * D)) * 1.55;
    this.walkSpeed = this.walkCycle / clips.get('walk').dur;
    this.runSpeed = this.runCycle / clips.get('run').dur;
    // state
    this.speed = 0; this.speedTarget = 0; this.phase = 0; this.idleT = 0; this.stance = 'relaxed';
    this.actions = [];             // [{ clip, t, w, fade, mask, out (fading out), hold }]
    this.additive = null;          // { clip, t }
    this.current = 'idle'; this.attackCount = 0;
    this.handsFree = false; this.freeW = 0; this.twoHandW = this.hold.twoHanded ? 1 : 0;
    this.base = new Float32Array(NB * 4); this.tmp = new Float32Array(NB * 4); this.tmp2 = new Float32Array(NB * 4); this.out = new Float32Array(NB * 4);
    this.pelBase = new Float32Array(3); this.pelTmp = new Float32Array(3); this.pelOut = new Float32Array(3);
    this.curl = { L: HAND_CURL.relax, R: HAND_CURL.relax, pointL: 0, pointR: 0 };
    // face
    this.exprBase = new Float32Array(NM); this.exprBaseJaw = 0; this.exprBaseLids = 0;
    this.morph = new Float32Array(NM); this.morphTarget = new Float32Array(NM);
    this.jaw = 0; this.lids = 0; this.blink = 0; this.nextBlink = 1 + Math.random() * 3; this.blinkT = -1;
    this.sayTrack = null; this.sayT = 0; this.babbleT = 0; this.babble = 'rest';
    this.gaze = { x: 0, y: 0, tx: 0, ty: 0, next: 1 };
    this.look = null; this.lookYaw = 0; this.lookPitch = 0;
    this.ground = null;
    this.springs = new Springs(R, this.bones);
    this.time = 0;
  }

  get clipNames() { return [...this.clips.keys()]; }

  /** What the hands carry decides the stance and which clips 'attack' means; clips are rebuilt (cached). */
  setHold(hold) {
    this.hold = { right: 'none', left: 'none', twoHanded: false, ...(hold || {}) };
    const S = this.R.P.S, key = S.toFixed(4) + '|' + JSON.stringify([this.hold.right, this.hold.left, !!this.hold.twoHanded]);
    let clips = clipCache.get(key);
    if (!clips) { clips = new Map(clipSpecs(this.hold).map(spec => [spec.name, sampleClip(spec, S)])); clipCache.set(key, clips); }
    this.clips = clips;
    if (this.actions) this.actions.length = 0;
  }

  /** Start a clip (or a locomotion state). Chibi 2 names work: attack, cast, guard, hit, dead... */
  play(name, { fade = 0.18, mask = null, loop = null, restart = false } = {}) {
    name = this.resolve(name);
    this.current = name;
    if (LOCO.has(name)) {
      this.stance = name === 'ready' ? 'combat' : name === 'idle' ? 'relaxed' : this.stance;
      this.speedTarget = name === 'walk' ? this.walkSpeed : name === 'run' ? this.runSpeed : 0;
      this.stopActions(fade);
      return;
    }
    const clip = this.clips.get(name);
    if (!clip) return;
    if (clip.additive) { this.additive = { clip, t: 0 }; return; }
    const top = this.actions.find(a => !a.out);
    if (top && top.clip === clip && !restart && (clip.loop || top.t < clip.dur)) return;
    this.stopActions(fade);
    this.actions.push({ clip, t: 0, w: fade > 0 ? 0 : 1, fade: Math.max(0.001, fade), mask, loop: loop ?? clip.loop, out: false });
  }
  stopActions(fade = 0.2) { for (const a of this.actions) if (!a.out) { a.out = true; a.fade = Math.max(0.001, fade); } }
  /** Map generic names onto this character's own clips. */
  resolve(name) {
    const h = this.hold, R = h.right, Lh = h.left;
    if (name === 'attack') {
      const n = this.attackCount++;
      if (R === 'none' && Lh === 'none') return 'punch';
      if (h.twoHanded || R === 'greataxe' || R === 'greatsword') return n % 3 === 2 ? 'sweep' : 'heavyCleave';
      if (Lh === 'axe' || Lh === 'sword' || Lh === 'dagger') return n % 2 ? 'frenzy' : 'twinChop';
      if (R === 'staff' || R === 'wand') return 'staffStrike';
      if (R === 'spear' || R === 'dagger') return 'thrust';
      return ['slash1', 'slash2', 'slash1', 'thrust'][n % 4];
    }
    if (name === 'cast') return 'castBolt';
    if (name === 'guard') return 'block';
    if (!this.clips.has(name) && !LOCO.has(name)) return 'idle';
    return name;
  }
  setSpeed(v) { this.speedTarget = Math.max(0, Number(v) || 0); }
  setExpression(name, w = 1) {
    const e = EXPRESSIONS[name] || {};
    this.exprBase.fill(0);
    MORPHS.forEach((m, i) => { this.exprBase[i] = (e[m] || 0) * w; });
    this.exprBaseJaw = (e.jaw || 0) * w; this.exprBaseLids = (e.lids || 0) * w;
  }
  say(text) { this.sayTrack = visemeTrack(text); this.sayT = 0; }
  lookAt(target) { this.look = target ? (target.isVector3 ? target.clone() : new THREE.Vector3(target.x, target.y, target.z)) : null; }
  setGround(fn) { this.ground = typeof fn === 'function' ? fn : null; }

  update(dt, group) {
    this.time += dt;
    const B = this.bones, S = this.R.P.S;
    // ---------------------------------------------------------------- 1. base locomotion
    this.speed = damp(this.speed, this.speedTarget, 7, dt);
    const sp = this.speed, a = smooth(sp / (0.55 * this.walkSpeed)), k = smooth((sp - this.walkSpeed) / (this.runSpeed - this.walkSpeed));
    const cycle = this.walkCycle + (this.runCycle - this.walkCycle) * k;
    if (sp > 0.01) this.phase = (this.phase + dt * sp / cycle) % 1;
    this.idleT += dt;
    const idle = this.clips.get(this.stance === 'combat' ? 'ready' : 'idle');
    sampleInto(idle, this.idleT, this.base, this.pelBase);
    if (a > 0.001) {
      const walk = this.clips.get('walk'), run = this.clips.get('run');
      sampleInto(walk, this.phase * walk.dur, this.tmp, this.pelTmp);
      if (k > 0.001) {
        sampleInto(run, this.phase * run.dur, this.tmp2, this.pelOut);
        for (let b = 0; b < NB; b++) nlerpInto(this.tmp, b * 4, this.tmp, b * 4, this.tmp2, b * 4, k);
        for (let i = 0; i < 3; i++) this.pelTmp[i] += (this.pelOut[i] - this.pelTmp[i]) * k;
      }
      for (let b = 0; b < NB; b++) nlerpInto(this.base, b * 4, this.base, b * 4, this.tmp, b * 4, a);
      for (let i = 0; i < 3; i++) this.pelBase[i] += (this.pelTmp[i] - this.pelBase[i]) * a;
    }
    this.out.set(this.base); this.pelOut.set(this.pelBase);
    // ---------------------------------------------------------------- 2. actions
    let handsL = null, handsR = null, clipFree = 0, clipTwoHand = null, faceClip = null, faceW = 0;
    for (let i = 0; i < this.actions.length; i++) {
      const act = this.actions[i], c = act.clip;
      act.t += dt;
      if (act.out) act.w -= dt / act.fade; else act.w = Math.min(1, act.w + dt / act.fade);
      // a one-shot fades back to the base as it ends (a held clip like 'dead' stays)
      let w = act.w;
      if (!act.loop && !c.hold && !act.out) { const left = c.dur - act.t; if (left < 0.22) w *= Math.max(0, left / 0.22); if (act.t >= c.dur) { act.out = true; act.w = 0; } }
      if (act.w <= 0 && act.out) { this.actions.splice(i--, 1); continue; }
      w = smooth(w);
      const m = MASK_W[act.mask || (sp > 0.3 && !FULL_ONLY.has(c.name) ? 'upper' : c.mask || 'full')];
      sampleInto(c, c.hold ? Math.min(act.t, c.dur) : act.t, this.tmp, this.pelTmp);
      for (let b = 0; b < NB; b++) if (m[b] > 0) nlerpInto(this.out, b * 4, this.out, b * 4, this.tmp, b * 4, w * m[b]);
      const pw = w * m[0];   // pelvis is bone 0
      for (let j = 0; j < 3; j++) this.pelOut[j] += (this.pelTmp[j] - this.pelOut[j]) * pw;
      if (c.hands) { if (c.hands.L) handsL = c.hands.L; if (c.hands.R) handsR = c.hands.R; }
      if (c.handsFree) clipFree = Math.max(clipFree, w);
      if (c.twoHand !== undefined) clipTwoHand = c.twoHand ? 1 : 0;
      if (c.handsFree) clipTwoHand = 0;
      if (c.face) { faceClip = c.face; const u = act.t / c.dur; faceW = w * (u >= (c.face.from ?? 0) && u <= (c.face.to ?? 1) ? 1 : 0); faceClip._u = u; }
    }
    // ---------------------------------------------------------------- 3. additive
    if (this.additive) {
      const ad = this.additive; ad.t += dt;
      if (ad.t >= ad.clip.dur) this.additive = null;
      else {
        sampleInto(ad.clip, ad.t, this.tmp, this.pelTmp);
        for (let b = 0; b < NB; b++) { _q.fromArray(this.out, b * 4); _q2.fromArray(this.tmp, b * 4); _q.multiply(_q2); _q.toArray(this.out, b * 4); }
      }
    }
    // ---------------------------------------------------------------- 4. write the pose (+ breathing and posture)
    for (let b = 0; b < NB; b++) this.clipBones[b].quaternion.fromArray(this.out, b * 4);
    B.pelvis.position.set(this.pelvisBind.x + this.pelOut[0], this.pelvisBind.y + this.pelOut[1], this.pelvisBind.z + this.pelOut[2]);
    const breath = Math.sin(this.time * (sp > 2 ? 4.2 : 1.6)) * (sp > 2 ? 1.6 : 1);
    this.addEuler(B.chest, -breath * 0.9 * D, 0, 0);
    this.addEuler(B.clavL, 0, 0, breath * 0.6 * D); this.addEuler(B.clavR, 0, 0, -breath * 0.6 * D);
    const po = this.R.P.posture || {};
    if (po.spine || po.neck || po.knees || po.shoulders) {
      this.addEuler(B.spine, (po.spine || 0) * 0.6, 0, 0); this.addEuler(B.chest, (po.spine || 0) * 0.5, 0, 0);
      this.addEuler(B.neck, (po.neck || 0) * 0.6, 0, 0); this.addEuler(B.head, -((po.spine || 0) * 1.1 + (po.neck || 0) * 0.6), 0, 0);
      for (const s of ['L', 'R']) {
        this.addEuler(B['thigh' + s], -(po.knees || 0), 0, 0); this.addEuler(B['shin' + s], (po.knees || 0) * 2, 0, 0); this.addEuler(B['foot' + s], -(po.knees || 0), 0, 0);
        this.addEuler(B['clav' + s], 0, (s === 'L' ? -1 : 1) * (po.shoulders || 0), 0);
      }
    }
    // ---------------------------------------------------------------- 4b. pin the lowest foot to the ground
    let air = 0;
    for (const act of this.actions) if (act.clip.air) air = Math.max(air, smooth(Math.max(0, act.w)));
    if (air < 0.999) this.pinFeet(1 - air, a * k);
    // ---------------------------------------------------------------- 5a. hands: grips and free hands
    const h = this.hold;
    const restL = h.left !== 'none' ? 'grip' : 'relax', restR = h.right !== 'none' ? 'grip' : 'relax';
    const runFist = a * k;   // running hands close into loose fists
    const free = Math.max(this.handsFree ? 1 : 0, clipFree);
    this.freeW = damp(this.freeW, free, 12, dt);
    const wantL = handsL || (this.freeW > 0.5 ? 'relax' : (this.stance === 'combat' && restL === 'relax' && h.right === 'none' ? 'fist' : restL));
    const wantR = handsR || (this.freeW > 0.5 ? 'relax' : (this.stance === 'combat' && restR === 'relax' && h.left === 'none' ? 'fist' : restR));
    const cL = HAND_CURL[wantL] ?? 0.3, cR = HAND_CURL[wantR] ?? 0.3;
    this.curl.L = damp(this.curl.L, wantL === 'relax' ? cL + (0.8 - cL) * runFist : cL, 14, dt); this.curl.R = damp(this.curl.R, wantR === 'relax' ? cR + (0.8 - cR) * runFist : cR, 14, dt);
    this.curl.pointL = damp(this.curl.pointL, wantL === 'point' ? 1 : 0, 14, dt); this.curl.pointR = damp(this.curl.pointR, wantR === 'point' ? 1 : 0, 14, dt);
    this.poseFingers('L', 1); this.poseFingers('R', -1);
    const gs = Math.max(0.001, 1 - this.freeW);
    B.gripL.scale.setScalar(gs); B.gripR.scale.setScalar(gs);
    // ---------------------------------------------------------------- 5b. look-at (head, neck, chest share the turn)
    let yawT = 0, pitchT = 0;
    if (this.look && group) {
      group.updateWorldMatrix(true, false);
      _m.copy(group.matrixWorld).invert();
      _v.copy(this.look).applyMatrix4(_m);
      _v.y -= this.R.eyeY;
      yawT = Math.max(-1.2, Math.min(1.2, Math.atan2(_v.x, _v.z)));
      pitchT = Math.max(-0.6, Math.min(0.6, -Math.atan2(_v.y, Math.hypot(_v.x, _v.z))));
      if (Math.abs(Math.atan2(_v.x, _v.z)) > 2.2) yawT = pitchT = 0;   // behind: do not twist round
    }
    this.lookYaw = damp(this.lookYaw, yawT, 6, dt); this.lookPitch = damp(this.lookPitch, pitchT, 6, dt);
    if (Math.abs(this.lookYaw) + Math.abs(this.lookPitch) > 1e-4) {
      this.addEuler(B.chest, this.lookPitch * 0.1, this.lookYaw * 0.2, 0);
      this.addEuler(B.neck, this.lookPitch * 0.35, this.lookYaw * 0.3, 0);
      this.addEuler(B.head, this.lookPitch * 0.45, this.lookYaw * 0.4, 0);
    }
    // ---------------------------------------------------------------- 5c. face
    this.updateFace(dt, faceClip, faceW);
    // ---------------------------------------------------------------- 6. IK and springs (need world matrices)
    this.springs.resetPose();
    if (group) group.updateMatrixWorld(true); else this.sk.root.updateMatrixWorld(true);
    // two hands on one haft
    const wantTwo = h.twoHanded && h.right !== 'none' ? (clipTwoHand ?? 1) * (1 - this.freeW) : 0;
    this.twoHandW = damp(this.twoHandW, wantTwo, 10, dt);
    if (this.twoHandW > 0.01) this.solveTwoHand(group);
    if (this.ground && group) this.solveFeet(group);
    this.springs.update(dt, this.sk.root);
  }

  /**
   * Lower (or raise) the pelvis so the lowest point of either foot — heel or ball — touches the
   * ground. This is what keeps every grounded clip and every blend standing ON the floor; a run adds
   * its flight bob on top.
   */
  pinFeet(w, run) {
    const B = this.bones, S = this.R.P.S, root = this.sk.root;
    B.toeL.updateWorldMatrix(true, false); B.toeR.updateWorldMatrix(true, false);   // just the two leg chains
    wpos(root, _t);
    let low = Infinity;
    for (const s of ['L', 'R']) {
      _v.set(0, -this.R.ankleY + 0.004 * S, -0.04 * S).applyMatrix4(B['foot' + s].matrixWorld); low = Math.min(low, _v.y);
      _v.set(0, -0.025 * S + 0.004 * S, 0.02 * S).applyMatrix4(B['toe' + s].matrixWorld); low = Math.min(low, _v.y);
      _v.set(0, -0.025 * S + 0.004 * S, 0.075 * S).applyMatrix4(B['toe' + s].matrixWorld); low = Math.min(low, _v.y);
    }
    const drop = (low - _t.y) * w;   // root height is the ground
    const bob = run * 0.032 * S * (0.5 + 0.5 * Math.cos(4 * Math.PI * (this.phase - 0.45)));
    B.pelvis.position.y += -drop + bob;
  }

  addEuler(bone, x, y, z) { _e.set(x, y, z, 'XYZ'); _q.setFromEuler(_e); bone.quaternion.multiply(_q); }

  poseFingers(side, s) {
    const B = this.bones, c = this.curl[side], point = this.curl['point' + side];
    for (const [f, k1, k2] of FINGERS) {
      const cc = f === 'index' ? c * (1 - point) : c;
      B[f + '1' + side].quaternion.setFromEuler(_e.set(0, (f === 'index' ? 4 : f === 'ring' ? -4 : 0) * D * s * Math.max(0, -cc) * 6, -s * cc * 82 * k1 * D, 'XYZ'));
      B[f + '2' + side].quaternion.setFromEuler(_e.set(0, 0, -s * cc * 96 * k2 * D, 'XYZ'));
    }
    B['thumb1' + side].quaternion.setFromEuler(_e.set(-c * 18 * D, s * c * 20 * D, -s * c * 34 * D, 'XYZ'));
    B['thumb2' + side].quaternion.setFromEuler(_e.set(0, 0, -s * c * 48 * D, 'XYZ'));
  }

  updateFace(dt, faceClip, faceW) {
    const B = this.bones;
    // expression target: the standing expression, then the clip's, then the lip shape on top
    const t = this.morphTarget; t.set(this.exprBase);
    let jaw = this.exprBaseJaw, lids = this.exprBaseLids;
    if (faceClip && faceW > 0) {
      const e = faceClip.expr ? EXPRESSIONS[faceClip.expr] : null;
      if (e) { for (let i = 0; i < NM; i++) t[i] += ((e[MORPHS[i]] || 0) - t[i]) * faceW; jaw += ((e.jaw || 0) - jaw) * faceW; lids += ((e.lids || 0) - lids) * faceW; }
      if (faceClip.lids != null) lids += (faceClip.lids - lids) * faceW;
      if (faceClip.jaw != null) jaw += (faceClip.jaw - jaw) * faceW;
      if (faceClip.jawWobble) jaw += faceClip.jawWobble * faceW * (0.5 + 0.5 * Math.sin(this.time * 22));
    }
    let vis = null;
    if (this.sayTrack) {
      this.sayT += dt;
      const tr = this.sayTrack;
      let i = 0; while (i < tr.length - 1 && tr[i + 1].t <= this.sayT) i++;
      vis = VISEMES[tr[i].v];
      if (this.sayT > tr[tr.length - 1].t + 0.2) this.sayTrack = null;
    } else if (faceClip?.talk && faceW > 0.3) {
      this.babbleT -= dt;
      if (this.babbleT <= 0) { const keys = ['A', 'E', 'O', 'M', 'L', 'S', 'I', 'U', 'rest']; this.babble = keys[(Math.random() * keys.length) | 0]; this.babbleT = 0.07 + Math.random() * 0.08; }
      vis = VISEMES[this.babble];
    }
    if (vis) {
      for (let i = 0; i < NM; i++) { const v = vis[MORPHS[i]] || 0; if (v > t[i] || /pucker|press|wide/.test(MORPHS[i])) t[i] = Math.max(t[i] * 0.4, v); }
      jaw = Math.max(jaw * 0.5, vis.jaw || 0);
    }
    for (let i = 0; i < NM; i++) this.morph[i] = damp(this.morph[i], t[i], vis ? 22 : 9, dt);
    this.jaw = damp(this.jaw, jaw, vis ? 24 : 10, dt);
    this.lids = damp(this.lids, lids, 10, dt);
    for (const mesh of this.morphMeshes) { const inf = mesh.morphTargetInfluences; if (inf) for (let i = 0; i < NM && i < inf.length; i++) inf[i] = this.morph[i] * GAIN[i]; }
    B.jaw.quaternion.setFromEuler(_e.set(this.jaw * 0.36, 0, 0, 'XYZ'));
    // blinks: quick close, slower open; sometimes twice
    this.nextBlink -= dt;
    if (this.nextBlink <= 0 && this.blinkT < 0) { this.blinkT = 0; this.nextBlink = 2 + Math.random() * 4; if (Math.random() < 0.15) this.nextBlink = 0.25; }
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      const bt = this.blinkT;
      this.blink = bt < 0.06 ? bt / 0.06 : bt < 0.16 ? 1 - (bt - 0.06) / 0.1 : 0;
      if (bt >= 0.16) this.blinkT = -1;
    }
    const open = this.lids >= 0 ? this.lids * 0.62 : this.lids * 0.22;
    const lidA = open + (0.8 - open) * this.blink;
    B.lidL.quaternion.setFromEuler(_e.set(lidA, 0, 0, 'XYZ')); B.lidR.quaternion.setFromEuler(_e.set(lidA, 0, 0, 'XYZ'));
    // eyes: small glances, plus whatever the head could not turn toward a look target
    const g = this.gaze;
    g.next -= dt;
    if (g.next <= 0) { g.next = 0.8 + Math.random() * 2.4; const wide = Math.random() < 0.3; g.tx = (Math.random() * 2 - 1) * (wide ? 0.32 : 0.12); g.ty = (Math.random() * 2 - 1) * (wide ? 0.12 : 0.05); if (Math.random() < 0.35) g.tx = g.ty = 0; }
    g.x = damp(g.x, g.tx, 18, dt); g.y = damp(g.y, g.ty, 18, dt);
    const ey = g.x + this.lookYaw * 0.25, ep = g.y + this.lookPitch * 0.15;
    B.eyeL.quaternion.setFromEuler(_e.set(ep, ey, 0, 'XYZ')); B.eyeR.quaternion.setFromEuler(_e.set(ep, ey, 0, 'XYZ'));
  }

  solveTwoHand(group) {
    const B = this.bones, S = this.R.P.S;
    const along = this.hold.grips?.offhandAlong ?? (this.hold.right === 'staff' ? 0.32 : this.hold.right === 'spear' ? 0.4 : 0.3) * S;
    wpos(B.gripR, _t);
    _w.set(0, 1, 0).applyQuaternion(wquat(B.gripR, _q)).normalize();
    _t.addScaledVector(_w, along);
    // the wrist goes where the grip should be, less the grip's offset in the hand
    wpos(B.gripL, _v); wpos(B.handL, _w);
    _t.sub(_v.sub(_w));
    // the elbow bends out to the left and down
    wpos(B.foreArmL, _pole);
    _v.set(1, -0.6, -0.3).transformDirection(group ? group.matrixWorld : this.sk.root.matrixWorld);
    _pole.addScaledVector(_v, 0.4 * S);
    twoBone(B.upperArmL, B.foreArmL, B.handL, _t, _pole, this.twoHandW);
  }

  solveFeet(group) {
    const B = this.bones, S = this.R.P.S;
    wpos(group, _v);
    const g0 = this.ground(_v.x, _v.z);
    const lift = [0, 0], sides = ['L', 'R'];
    for (let i = 0; i < 2; i++) { wpos(B['foot' + sides[i]], _w); lift[i] = Math.max(-0.4 * S, Math.min(0.4 * S, this.ground(_w.x, _w.z) - g0)); }
    if (Math.abs(lift[0]) < 0.002 && Math.abs(lift[1]) < 0.002) return;
    const drop = Math.min(lift[0], lift[1], 0);
    B.pelvis.position.y += drop;
    group.updateMatrixWorld(true);
    for (let i = 0; i < 2; i++) {
      const s = sides[i];
      wpos(B['foot' + s], _t); _t.y += lift[i] - drop;
      wpos(B['shin' + s], _pole);
      _v.set(0, 0, 1).transformDirection(group.matrixWorld); _pole.addScaledVector(_v, 0.5 * S);
      twoBone(B['thigh' + s], B['shin' + s], B['foot' + s], _t, _pole, 1);
    }
  }
}
