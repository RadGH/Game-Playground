// Kestrel (opus) — the face at runtime: the six expressions, blinking, gaze / lookAt, talking, and the ponytail sway.
// Only bone transforms change (a few dozen multiplies a frame): no geometry, material or light changes.
//
// An expression is a set of bone OFFSETS from rest (head-space metres for a 0.24 m head, scaled by P.HS) plus eye-lid
// amounts. Several can be blended; `setExpression(name, weight, fade)` fades the named one to `weight` and every other
// one to zero over `fade` seconds.
import * as THREE from 'three';
import { clamp, lerp, smooth } from './kmath.js';

export const EXPRESSIONS = ['neutral', 'happy', 'sad', 'angry', 'surprised', 'confused'];

// Per expression. Brow/corner/cheek offsets are [out, up, forward] for the R-side bone; the L side mirrors `out`.
// `side: { L: …, R: … }` overrides one side (asymmetric faces). lidTop = how far the upper lid comes down (head m),
// lidBot = how far the lower lid comes up; jaw = radians open; head = [pitch, yaw, roll] added after the clip.
const TABLE = {
  neutral: { browIn: [0, -0.0004, 0], browOut: [0, 0, 0] },
  happy: {
    browIn: [0, 0.0016, 0], browOut: [0, 0.0012, 0], mouthC: [0.003, 0.0052, -0.002], lipU: [0, 0.0016, 0.0004], lipD: [0, -0.0016, 0.0004],
    cheek: [0.0004, 0.003, 0.001], lidBot: 0.0024, lidTop: 0.0006, jaw: 0.09, head: [-0.03, 0, 0.02],
  },
  sad: {
    browIn: [-0.0008, 0.0048, 0], browOut: [0.0002, -0.002, 0], mouthC: [-0.0008, -0.0038, 0], lipD: [0, 0.0008, 0.0006], lipU: [0, -0.0002, 0],
    lidTop: 0.0016, lidBot: 0.0003, jaw: 0.0, head: [0.1, 0, -0.03], gaze: [0, -0.45],
  },
  angry: {
    browIn: [-0.003, -0.0055, 0.001], browOut: [0, 0.0018, 0], mouthC: [-0.0014, -0.0022, 0], lipU: [0, 0.0006, 0], lipD: [0, -0.0004, 0],
    lidTop: 0.0026, lidBot: 0.0012, jaw: 0.02, head: [0.06, 0, 0],
  },
  surprised: {
    browIn: [0, 0.006, 0], browOut: [0, 0.005, 0], mouthC: [-0.0045, 0.0003, 0], lipU: [0, 0.0012, 0.0006], lipD: [0, -0.002, 0.0006],
    lidTop: -0.0022, lidBot: -0.0008, jaw: 0.26, head: [-0.06, 0, 0],
  },
  confused: {
    side: { L: { browIn: [0, 0.0042, 0], browOut: [0, 0.0034, 0], mouthC: [-0.0006, -0.0018, 0] }, R: { browIn: [-0.0018, -0.0026, 0], browOut: [0, -0.0008, 0], mouthC: [0.0006, 0.0018, 0] } },
    lipU: [0.0008, 0, 0], lipD: [0.0012, 0.0004, 0], lidTop: 0.0008, jaw: 0.02, head: [0, 0.05, 0.1], gaze: [0.4, 0.3],
  },
};

const DUR = 0.17;
const closure = t => t < 0.055 ? t / 0.055 : t < 0.085 ? 1 : Math.max(0, 1 - (t - 0.085) / 0.085);

export class FaceDriver {
  constructor(rig, eye, rngFn = Math.random) {
    this.rig = rig; this.B = rig.byName; this.HS = rig.P.HS; this.eye = eye; this.rng = rngFn;
    this.w = Object.fromEntries(EXPRESSIONS.map(e => [e, e === 'neutral' ? 1 : 0]));
    this.target = { ...this.w }; this.fade = 0.2; this.name = 'neutral';
    this.t = 0; this.nextBlink = 0.8 + rngFn() * 2.5; this.blinkT = -1; this.again = false; this.hold = null; this.k = 0;
    this.manual = null; this.look = null; this.headK = 0.35; this.g = [0, 0]; this.idle = [0, 0]; this.nextGlance = 1 + rngFn() * 1.5;
    this.turn = [0, 0]; this.v = new THREE.Vector3(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(0, 0, 0, 'YXZ'); this.looking = false;
    this.talk = 0;
    // ponytail spring state
    this.hairPrev = null; this.hairV = [0, 0]; this.hairA = [0, 0];
  }
  setExpression(name, weight = 1, fade = 0.2) {
    if (!TABLE[name]) name = 'neutral';
    this.name = name; this.fade = Math.max(0.001, fade);
    for (const e of EXPRESSIONS) this.target[e] = e === name ? clamp(weight, 0, 1) : 0;
    if (name !== 'neutral') this.target.neutral = 1 - clamp(weight, 0, 1);
  }
  blink() { this.blinkT = 0; }
  update(d, anim, actorTime) {
    const B = this.B, HS = this.HS, rng = this.rng;
    this.t += d;
    // ---- expression weights
    const kf = 1 - Math.exp(-d * 4.6 / this.fade);
    for (const e of EXPRESSIONS) this.w[e] += (this.target[e] - this.w[e]) * kf;
    // ---- sum the offsets
    const off = {}; let lidTop = 0, lidBot = 0, jaw = 0; const head = [0, 0, 0]; let gz = [0, 0], gw = 0;
    const AMP = 1.35;   // the table is written conservative; faces read better pushed
    const addV = (key, v, k) => { const o = off[key] ||= [0, 0, 0]; o[0] += v[0] * k * AMP; o[1] += v[1] * k * AMP; o[2] += v[2] * k * AMP; };
    for (const e of EXPRESSIONS) {
      const k = this.w[e]; if (k < 1e-3) continue;
      const T = TABLE[e];
      for (const s of ['L', 'R']) {
        const src = { ...T, ...(T.side?.[s] || {}) };
        for (const key of ['browIn', 'browOut', 'mouthC', 'cheek']) if (src[key]) addV(key + s, [src[key][0] * (s === 'L' ? -1 : 1), src[key][1], src[key][2]], k);
      }
      if (T.lipU) addV('lipU', T.lipU, k);
      if (T.lipD) addV('lipD', T.lipD, k);
      lidTop += (T.lidTop || 0) * k; lidBot += (T.lidBot || 0) * k; jaw += (T.jaw || 0) * k;
      if (T.head) for (let i = 0; i < 3; i++) head[i] += T.head[i] * k;
      if (T.gaze) { gz[0] += T.gaze[0] * k; gz[1] += T.gaze[1] * k; gw += k; }
    }
    // talking: the jaw and lips move in syllables
    const talking = anim === 'talk';
    this.talk += ((talking ? 1 : 0) - this.talk) * (1 - Math.exp(-d * 8));
    if (this.talk > 0.01) {
      const s = this.t * 11, syl = Math.max(0, Math.sin(s) * 0.6 + Math.sin(s * 1.7 + 1) * 0.4);
      jaw += this.talk * 0.13 * syl;
      addV('mouthCL', [0.0012 * Math.sin(s * 0.7), 0, 0], -this.talk); addV('mouthCR', [0.0012 * Math.sin(s * 0.7), 0, 0], this.talk);
      addV('lipU', [0, 0.0008 * syl, 0], this.talk);
    }
    const dead = anim === 'dead';
    if (dead) jaw += 0.12;
    // batch 2: the mouth's resting shape (face-catalog.js MOUTH_SHAPES rest) sits under every expression
    const MR = this.eye.mouthRest;
    if (MR) {
      for (const s of ['L', 'R']) {
        const src = { ...MR, ...(MR.side?.[s] || {}) };
        for (const key of ['mouthC', 'cheek']) if (src[key]) addV(key + s, [src[key][0] * (s === 'L' ? -1 : 1), src[key][1], src[key][2]], 1 / AMP);
      }
      if (MR.lipU) addV('lipU', MR.lipU, 1 / AMP);
      if (MR.lipD) addV('lipD', MR.lipD, 1 / AMP);
      jaw += MR.jaw || 0;
    }
    for (const name of ['browInL', 'browInR', 'browOutL', 'browOutR', 'mouthCL', 'mouthCR', 'cheekL', 'cheekR', 'lipU', 'lipD']) {
      const b = B[name], o = off[name] || [0, 0, 0], r = b.userData.rest;
      b.position.set(r.x + o[0] * HS, r.y + o[1] * HS, r.z + o[2] * HS);
    }
    B.jaw.rotation.set(clamp(jaw, -0.05, 0.45), 0, 0);
    // expression head offset, on top of the clip (the mixer rewrites the head every frame, so this never accumulates)
    if (head[0] || head[1] || head[2]) { this.q.setFromEuler(this.e.set(head[0], head[1], head[2])); B.head.quaternion.multiply(this.q); }
    // ---- gaze
    let gx = 0, gy = 0, yaw = 0, pitch = 0; this.looking = false;
    if (this.look) {
      const hb = B.head; hb.updateWorldMatrix(true, false);
      const p = hb.worldToLocal(this.v.copy(this.look)); p.y -= B.eyeR.position.y; p.z -= B.eyeR.position.z;
      yaw = Math.atan2(p.x, Math.max(1e-4, p.z)); if (p.z < 0) yaw = Math.sign(p.x || 1) * Math.PI / 2;
      pitch = Math.atan2(p.y, Math.hypot(p.x, p.z)); this.looking = true;
    }
    const want = this.looking ? [clamp(yaw * this.headK, -0.7, 0.7), clamp(pitch * this.headK, -0.4, 0.4)] : [0, 0];
    const kh = 1 - Math.exp(-d * 6);
    this.turn[0] += (want[0] - this.turn[0]) * kh; this.turn[1] += (want[1] - this.turn[1]) * kh;
    if (Math.abs(this.turn[0]) > 1e-4 || Math.abs(this.turn[1]) > 1e-4) { this.q.setFromEuler(this.e.set(-this.turn[1], this.turn[0], 0)); B.head.quaternion.multiply(this.q); }
    if (this.looking) { gx = (yaw - this.turn[0]) / 0.55; gy = (pitch - this.turn[1]) / 0.45; }
    else if (this.manual) [gx, gy] = this.manual;
    else {
      if (this.t >= this.nextGlance) {
        this.nextGlance = this.t + 1.2 + rng() * 2.8;
        const wide = rng() < 0.3, r = wide ? 0.8 : 0.35;
        this.idle = rng() < 0.35 ? [0, 0] : [(rng() * 2 - 1) * r, (rng() * 2 - 1) * r * 0.5];
      }
      [gx, gy] = this.idle;
      if (gw > 0) { gx = lerp(gx, gz[0] / gw, Math.min(1, gw)); gy = lerp(gy, gz[1] / gw, Math.min(1, gw)); }
    }
    const n = Math.hypot(gx, gy); if (n > 1) { gx /= n; gy /= n; }
    const kg = 1 - Math.exp(-d * 16);
    this.g[0] += (gx - this.g[0]) * kg; this.g[1] += (gy - this.g[1]) * kg;
    // ---- blink
    if (this.blinkT < 0 && this.t >= this.nextBlink && this.eye.blinks !== false) this.blinkT = 0;
    let lid = 0;
    if (this.blinkT >= 0) {
      lid = closure(this.blinkT); this.blinkT += d;
      if (this.blinkT > DUR) {
        this.blinkT = -1;
        if (!this.again && rng() < 0.17) { this.again = true; this.nextBlink = this.t + 0.12; }
        else { this.again = false; this.nextBlink = this.t + 2 + rng() * 3.5; }
      }
    }
    lid = Math.max(lid, Math.max(0, -this.g[1]) * 0.18);
    if (this.hold != null) lid = clamp(this.hold, 0, 1);
    if (dead) lid = 1;
    this.k = lid;
    // ---- the eyes: squash between the lid lines
    const E = this.eye;
    const top0 = E.top - lidTop * HS, bot0 = E.bot + lidBot * HS;
    for (const s of ['L', 'R']) {
      // batch 2: a wink keeps one eye shut whatever else the face does
      const lidS = E.closed?.[s] ? 1 : lid;
      let top = lerp(top0, E.line, lidS), bot = lerp(bot0, E.line, lidS);
      if (bot > top - 0.00005) { const m = (top + bot) / 2; top = m + 0.00003; bot = m - 0.00003; }
      const sy = Math.max(0.006, (top - bot) / (E.top - E.bot));
      const cy = bot - E.bot * sy;          // where the bone must sit so the rest bottom lands on `bot`
      const lash = smooth(0.55, 0.92, 1 - (top - bot) / (E.top - E.bot));
      const e = B['eye' + s], r = e.userData.rest;
      e.scale.set(1, sy, 1); e.position.set(r.x, r.y + cy, r.z);
      const p = B['pupil' + s];
      const gxs = this.g[0] * E.limX, gys = clamp(this.g[1] * E.limY, -E.limY, E.limY * 0.7);
      p.position.set(dead ? 0 : gxs, dead ? 0 : gys / Math.max(sy, 0.3), 0);
      const L = B['lid' + s], lr = L.userData.rest;
      const sc = lash < 0.01 ? 1e-4 : lash;
      L.scale.setScalar(sc); L.position.copy(lr);
    }
  }
  /** Secondary motion for the ponytail: lags behind the head, swings back. */
  hair(d) {
    const B = this.B, h = B.head;
    if (!B.hairA) return;
    h.updateWorldMatrix(true, false);
    const p = new THREE.Vector3().setFromMatrixPosition(h.matrixWorld);
    if (!this.hairPrev) { this.hairPrev = p.clone(); this.hairVel = new THREE.Vector3(); }
    const vel = p.clone().sub(this.hairPrev).divideScalar(Math.max(d, 1e-3));
    const acc = vel.clone().sub(this.hairVel).divideScalar(Math.max(d, 1e-3));
    this.hairPrev.copy(p); this.hairVel.copy(vel);
    // the head's tilt in the world: the tail should keep hanging down
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(h.getWorldQuaternion(new THREE.Quaternion()));
    const inv = h.getWorldQuaternion(new THREE.Quaternion()).invert();
    const accL = acc.applyQuaternion(inv);
    const tx = clamp(-Math.asin(clamp(up.z, -1, 1)) * 0.7 + accL.z * 0.012, -0.9, 0.9), tz = clamp(Math.asin(clamp(up.x, -1, 1)) * 0.7 - accL.x * 0.012, -0.7, 0.7);
    const st = 60, dm = 9, D = Math.min(d, 0.05);
    this.hairV[0] += ((tx - this.hairA[0]) * st - this.hairV[0] * dm) * D; this.hairA[0] += this.hairV[0] * D;
    this.hairV[1] += ((tz - this.hairA[1]) * st - this.hairV[1] * dm) * D; this.hairA[1] += this.hairV[1] * D;
    // batch 2: loose hair down the back (long, wavy, locs…) may swing back and sideways, never forward into the back
    if (this.eye.swing === 'loose') { this.hairA[0] = Math.max(this.hairA[0], -0.02); if (this.hairV[0] < 0 && this.hairA[0] <= -0.02) this.hairV[0] = 0; }
    B.hairA.rotation.set(this.hairA[0] * 0.35, 0, this.hairA[1] * 0.35);
    B.hairB.rotation.set(this.hairA[0] * 0.4, 0, this.hairA[1] * 0.4);
    B.hairC.rotation.set(this.hairA[0] * 0.3, 0, this.hairA[1] * 0.3);
  }
}
