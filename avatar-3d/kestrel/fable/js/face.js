// Kestrel (fable) — the face at runtime: blinking, idle glances, lookAt, and the six expressions blended on top of
// any clip. Only bone transforms change (eye / pupil / lid / brow / mouth-corner / jaw, and a small head tilt), so
// it is a few multiplies a frame: no geometry, material or light changes.
import * as THREE from 'three';
import { EXPRESSIONS } from './head.js';

const clamp = THREE.MathUtils.clamp;
const DUR = 0.17;
const closure = t => t < 0.055 ? t / 0.055 : t < 0.085 ? 1 : Math.max(0, 1 - (t - 0.085) / 0.085);
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');

export class FaceDriver {
  constructor(rng = Math.random) {
    this.rng = rng; this.t = 0;
    this.nextBlink = 0.6 + rng() * 2.5; this.blinkT = -1; this.again = false; this.hold = null;
    this.manual = null; this.target = null; this.headK = 0.35;
    this.g = [0, 0]; this.idle = [0, 0]; this.nextGlance = 0.8 + rng() * 1.5; this.looking = false; this.k = 0;
    this.turn = [0, 0]; this.headQ = new THREE.Quaternion(); this.headInv = new THREE.Quaternion(); this.headOn = false;
    this.weights = { neutral: 1 }; this.targetW = { neutral: 1 }; this.fade = 0.2; this.current = 'neutral';
  }
  blink() { this.blinkT = 0; }
  setExpression(name, weight = 1, fade = 0.2) {
    if (!EXPRESSIONS[name]) name = 'neutral';
    this.current = name; this.fade = Math.max(0.001, fade);
    this.targetW = {}; for (const k of Object.keys(EXPRESSIONS)) this.targetW[k] = k === name ? clamp(weight, 0, 1) : 0;
    if (name !== 'neutral') this.targetW.neutral = 1 - clamp(weight, 0, 1);
  }
  /** Before the mixer: take the head tilt off so a clip that does not key the head is not tilted twice. */
  pre(rig) { if (this.headOn) rig.byName.head.quaternion.multiply(this.headInv); this.headOn = false; }
  update(rig, d, anim) {
    const spec = rig.face, B = rig.byName, rng = this.rng; if (!spec) return;
    this.t += d;
    // ---- expression weights move toward their targets
    const kf = 1 - Math.exp(-d / this.fade);
    for (const k of Object.keys(EXPRESSIONS)) { const w = this.weights[k] || 0, tw = this.targetW[k] || 0; this.weights[k] = Math.abs(tw - w) < 0.002 ? tw : w + (tw - w) * kf; }
    const sum = (field, def = 0) => { let v = def * 0; for (const [k, w] of Object.entries(this.weights)) { const e = EXPRESSIONS[k][field]; if (w > 0.001 && e != null) v += e * w; } return v; };
    const lidX = sum('lid'), jawX = sum('jaw'), eyeScale = 1 + Object.entries(this.weights).reduce((n, [k, w]) => n + ((EXPRESSIONS[k].eyeScale || 1) - 1) * w, 0);
    const headTilt = [0, 1, 2].map(i => Object.entries(this.weights).reduce((n, [k, w]) => n + ((EXPRESSIONS[k].head || [0, 0, 0])[i]) * w, 0));
    for (const name of ['browL', 'browR', 'mouthL', 'mouthR']) {
      const b = B[name], rest = b.userData.rest; if (!rest) continue;
      _p.set(0, 0, 0); let rx = 0, ry = 0, rz = 0;
      for (const [k, w] of Object.entries(this.weights)) {
        const e = EXPRESSIONS[k][name]; if (!e || w < 0.001) continue;
        if (e.p) { _p.x += e.p[0] * w; _p.y += e.p[1] * w; _p.z += e.p[2] * w; }
        if (e.r) { rx += e.r[0] * w; ry += e.r[1] * w; rz += e.r[2] * w; }
      }
      b.position.copy(rest.p).add(_p);
      b.quaternion.copy(rest.q).multiply(_q.setFromEuler(_e.set(rx, ry, rz)));
    }
    // ---- where to look
    let gx = 0, gy = 0, yaw = 0, pitch = 0; this.looking = false;
    if (this.target) {
      const head = B.head; head.updateWorldMatrix(true, false);
      const p = head.worldToLocal(_p.copy(this.target)); p.y -= B.eyeR.position.y; p.z -= B.eyeR.position.z;
      yaw = Math.atan2(p.x, Math.max(1e-4, p.z)); if (p.z < 0) yaw = Math.sign(p.x || 1) * Math.PI / 2;
      pitch = Math.atan2(p.y, Math.hypot(p.x, p.z)); this.looking = true;
    }
    const want = this.looking ? [clamp(yaw * this.headK, -0.7, 0.7), clamp(pitch * this.headK, -0.4, 0.4)] : [0, 0];
    const kh = 1 - Math.exp(-d * 6);
    this.turn[0] += (want[0] - this.turn[0]) * kh; this.turn[1] += (want[1] - this.turn[1]) * kh;
    const tilt = [-this.turn[1] + headTilt[0], this.turn[0] + headTilt[1], headTilt[2]];
    if (Math.abs(tilt[0]) > 1e-4 || Math.abs(tilt[1]) > 1e-4 || Math.abs(tilt[2]) > 1e-4) {
      this.headQ.setFromEuler(_e.set(tilt[0], tilt[1], tilt[2])); this.headInv.copy(this.headQ).invert();
      B.head.quaternion.multiply(this.headQ); this.headOn = true;
    }
    if (this.looking) { gx = (yaw - this.turn[0]) / 0.55; gy = (pitch - this.turn[1]) / 0.45; }
    else if (this.manual) [gx, gy] = this.manual;
    else {
      if (this.t >= this.nextGlance) {
        this.nextGlance = this.t + 1.2 + rng() * 2.8;
        const wide = rng() < 0.3, r = wide ? 0.85 : 0.4;
        this.idle = rng() < 0.3 ? [0, 0] : [(rng() * 2 - 1) * r, (rng() * 2 - 1) * r * 0.6];
      }
      [gx, gy] = this.idle;
    }
    const n = Math.hypot(gx, gy); if (n > 1) { gx /= n; gy /= n; }
    const kg = 1 - Math.exp(-d * 16);
    this.g[0] += (gx - this.g[0]) * kg; this.g[1] += (gy - this.g[1]) * kg;
    const dead = anim === 'dead';
    for (const s of ['L', 'R']) B['pupil' + s].position.set(dead ? 0 : this.g[0] * spec.limX, dead ? -spec.limY * 0.3 : this.g[1] * spec.limY, 0);
    // ---- blinking (the lid bone's y scale: 0 open .. 1 shut), a squint from the expression, a drop when looking down
    if (this.blinkT < 0 && this.t >= this.nextBlink) this.blinkT = 0;
    let lid = 0;
    if (this.blinkT >= 0) {
      lid = closure(this.blinkT); this.blinkT += d;
      if (this.blinkT > DUR) { this.blinkT = -1; if (!this.again && rng() < 0.17) { this.again = true; this.nextBlink = this.t + 0.12; } else { this.again = false; this.nextBlink = this.t + 2 + rng() * 3.5; } }
    }
    lid = Math.max(lid, Math.max(0, -this.g[1]) * 0.2, lidX);
    if (this.hold != null) lid = clamp(this.hold, 0, 1);
    if (dead) lid = 1;
    this.k = lid;
    for (const s of ['L', 'R']) {
      B['lid' + s].scale.set(1, Math.max(0.002, lid), 1);
      B['eye' + s].scale.set(1, eyeScale, 1);
    }
    // ---- the jaw: the expression's opening, plus talking
    let jaw = jawX;
    if (anim === 'talk') jaw = Math.max(jaw, 0.18 + 0.16 * (0.5 + 0.5 * Math.sin(this.t * 13)) * (0.6 + 0.4 * Math.sin(this.t * 3.1)));
    if (dead) jaw = Math.max(jaw, 0.15);
    const J = B.jaw, jr = J.userData.rest || (J.userData.rest = { p: J.position.clone(), q: J.quaternion.clone() });
    J.quaternion.copy(jr.q).multiply(_q.setFromEuler(_e.set(jaw * 0.32, 0, 0)));     // +x drops the chin (it is below and in front of the pivot)
    J.position.copy(jr.p).setY(jr.p.y - jaw * 0.004);
  }
}
