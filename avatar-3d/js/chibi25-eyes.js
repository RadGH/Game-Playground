// Chibi 2.5 eyes at runtime (part A): blinking, idle glances and looking at a point. Only bone transforms change —
// the eye bones' y scale (a blink squashes the eye, round 2), the eyelid bones' scale, the pupil bones' x/y and (optionally) a small head turn — so it costs a few multiplies a
// frame per character: no geometry rebuild, no material or light change, no shader recompile.
//
// Used by chibi2.js's controller for a 2.5 look; the controller exposes it as:
//   actor.lookAt(worldPoint | null, { head = 0.35 })  look at a THREE.Vector3 in world space (the player, an enemy);
//                                                     `head` 0..1 is how much of the turn the head takes (0 = eyes only).
//                                                     null releases it (back to idle glances).
//   actor.setGaze(x, y) / setGaze(null)               pupils pushed to -1..1 of their room (x = the character's +x side)
//   actor.blink()                                     blink now
//   actor.setBlink(k) / setBlink(null)                hold the lids at k (0 open .. 1 shut); null = blink on its own
//   actor.eyes                                        { blink: 0..1, gaze: [x, y], looking: bool }
//
// Natural blinking: a blink every 2–5.5 s (about three in ten seconds), one in six doubled, 0.17 s long (fast close,
// slower open). Lids drop a little when the eyes look down. `dead` and `sleep` close the eyes.
import * as THREE from 'three';

const DUR = 0.17;
const closure = t => t < 0.055 ? t / 0.055 : t < 0.085 ? 1 : Math.max(0, 1 - (t - 0.085) / 0.085);
const clamp = THREE.MathUtils.clamp;

export class EyeDriver25 {
  constructor(rng = Math.random) {
    this.rng = rng; this.t = 0;
    this.nextBlink = 0.6 + rng() * 2.5; this.blinkT = -1; this.again = false;
    this.hold = null; this.manual = null; this.target = null; this.headK = 0.35;
    this.g = [0, 0]; this.idle = [0, 0]; this.nextGlance = 0.8 + rng() * 1.5;
    this.turn = [0, 0]; this.headOn = false; this.q = new THREE.Quaternion(); this.inv = new THREE.Quaternion();
    this.e = new THREE.Euler(0, 0, 0, 'YXZ'); this.v = new THREE.Vector3(); this.k = 0; this.looking = false;
  }
  blink() { this.blinkT = 0; }
  /** Before the mixer runs: take the head turn off, so a clip that does not key the head is not turned twice. */
  pre(rig) { if (this.headOn) rig.byName.head.quaternion.multiply(this.inv); this.headOn = false; }
  update(rig, d, anim) {
    const spec = rig.eyes25, B = rig.byName, rng = this.rng;
    if (!spec) return;
    this.t += d;
    // ---- where to look
    let gx = 0, gy = 0, yaw = 0, pitch = 0;
    this.looking = false;
    if (this.target) {
      const head = B.head; head.updateWorldMatrix(true, false);
      const p = head.worldToLocal(this.v.copy(this.target)); p.y -= B.eyeR.position.y; p.z -= B.eyeR.position.z;   // from between the eyes
      yaw = Math.atan2(p.x, Math.max(1e-4, p.z)); if (p.z < 0) yaw = Math.sign(p.x || 1) * Math.PI / 2;
      pitch = Math.atan2(p.y, Math.hypot(p.x, p.z));
      this.looking = true;
    }
    // the head takes part of the turn (smoothed), the eyes the rest
    const want = this.looking ? [clamp(yaw * this.headK, -0.7, 0.7), clamp(pitch * this.headK, -0.4, 0.4)] : [0, 0];
    const kh = 1 - Math.exp(-d * 6);
    this.turn[0] += (want[0] - this.turn[0]) * kh; this.turn[1] += (want[1] - this.turn[1]) * kh;
    if (Math.abs(this.turn[0]) > 1e-4 || Math.abs(this.turn[1]) > 1e-4) {
      this.q.setFromEuler(this.e.set(-this.turn[1], this.turn[0], 0)); this.inv.copy(this.q).invert();
      B.head.quaternion.multiply(this.q); this.headOn = true;
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
    if (spec.lidded) gy = Math.min(gy, 0.1);                 // never up under a resting lid
    const k = 1 - Math.exp(-d * 16);
    this.g[0] += (gx - this.g[0]) * k; this.g[1] += (gy - this.g[1]) * k;
    const dead = anim === 'dead';
    for (const s of ['L', 'R']) B['pupil' + s].position.set(dead ? 0 : this.g[0] * spec.limX, dead ? 0 : this.g[1] * spec.limY, 0);
    // ---- blinking
    if (this.blinkT < 0 && this.t >= this.nextBlink) { this.blinkT = 0; }
    let lid = 0;
    if (this.blinkT >= 0) {
      lid = closure(this.blinkT); this.blinkT += d;
      if (this.blinkT > DUR) {
        this.blinkT = -1;
        if (!this.again && rng() < 0.17) { this.again = true; this.nextBlink = this.t + 0.12; }
        else { this.again = false; this.nextBlink = this.t + 2 + rng() * 3.5; }
      }
    }
    lid = Math.max(lid, Math.max(0, -this.g[1]) * 0.22);     // the lid follows a downward look
    if (this.hold != null) lid = clamp(this.hold, 0, 1);
    if (dead || anim === 'sleep') lid = 1;
    if (!spec.blinks) lid = 0;
    this.k = lid;
    // ROUND 2 (2026-10-21): the EYE closes — its bone is squashed toward a line a third of the way down the eye (scaled,
    // then moved so that line stays put), so a blink never shows anything outside the eye's outline and an open eye has
    // no lid sheet over it. The eyelid bone (a child of the head) brings in the shut eye's lash line near the end.
    const sy = 1 - 0.975 * lid, line = this.lidLine ??= (spec.sides[0].dy + spec.squashY);
    const lash = lid < 0.5 ? 0 : clamp((lid - 0.5) / 0.4, 0, 1);
    for (const s of ['L', 'R']) {
      const e = B['eye' + s], rest = e.userData.rest;
      if (rest) { e.scale.y = sy; e.position.y = rest.y + line * (1 - sy); }
      const b = B['eyelid' + s]; if (!b) continue;
      if (lash <= 0) b.scale.setScalar(1e-4); else b.scale.setScalar(lash * lash * (3 - 2 * lash));
    }
  }
}
