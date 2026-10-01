// Chibi 3 spring bones: hair, hat tip, beard, cape and skirt panels follow the body with lag, sway
// and gravity instead of being keyed. Each chain bone carries one simulated point (where its child
// joint should be); every frame the point is pulled toward where the animation put it, falls a
// little, keeps its distance from the joint, is pushed out of the body's capsules, and the bone is
// turned to point at it. Allocation-free per frame.

import * as THREE from 'three';
import { rotateWorld, wpos, wquat } from './ik.js';

/** Chains and how each behaves: stiffness (pull back to the animated pose), damping, gravity (m/s^2). */
export const SPRING_CHAINS = [
  { bones: ['hair1', 'hair2', 'hair3'], stiff: 60, damp: 7, gravity: 3, collide: 'head' },
  { bones: ['hat1', 'hat2'], stiff: 110, damp: 9, gravity: 1.5 },
  { bones: ['beard1', 'beard2'], stiff: 90, damp: 8, gravity: 2 },
  { bones: ['capeL1', 'capeL2', 'capeL3'], stiff: 26, damp: 4.5, gravity: 6, collide: 'back' },
  { bones: ['capeR1', 'capeR2', 'capeR3'], stiff: 26, damp: 4.5, gravity: 6, collide: 'back' },
  { bones: ['skirtF1', 'skirtF2'], stiff: 45, damp: 6, gravity: 4, collide: 'legs' },
  { bones: ['skirtB1', 'skirtB2'], stiff: 45, damp: 6, gravity: 4, collide: 'legs' },
  { bones: ['skirtL1', 'skirtL2'], stiff: 45, damp: 6, gravity: 4, collide: 'legs' },
  { bones: ['skirtR1', 'skirtR2'], stiff: 45, damp: 6, gravity: 4, collide: 'legs' },
];

const _p = new THREE.Vector3(), _t = new THREE.Vector3(), _j = new THREE.Vector3(), _d = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion(), _u = new THREE.Vector3(), _v = new THREE.Vector3();

export class Springs {
  constructor(R, byName) {
    this.byName = byName; this.S = R.P.S; this.ready = false;
    this.nodes = [];
    for (const c of SPRING_CHAINS) {
      c.bones.forEach((name, i) => {
        const bone = byName[name]; if (!bone) return;
        const next = c.bones[i + 1];
        // rest offset from this joint to the next (or a stub past the last), in the bone's own frame
        const rb = R.byName[name], rn = next ? R.byName[next] : null;
        const off = rn ? new THREE.Vector3(rn.pos[0] - rb.pos[0], rn.pos[1] - rb.pos[1], rn.pos[2] - rb.pos[2])
          : (() => { const pr = R.byName[rb.parent]; const v = new THREE.Vector3(rb.pos[0] - pr.pos[0], rb.pos[1] - pr.pos[1], rb.pos[2] - pr.pos[2]); return v.setLength(Math.min(v.length(), 0.18 * this.S)); })();
        this.nodes.push({ bone, chain: c, off, len: off.length(), pos: new THREE.Vector3(), vel: new THREE.Vector3() });
      });
    }
    // body capsules for collision (joint pairs + radii, per 1.8 m body)
    const s = this.S;
    this.capsules = {
      legs: [['thighL', 'shinL', 0.085 * s], ['thighR', 'shinR', 0.085 * s], ['shinL', 'footL', 0.06 * s], ['shinR', 'footR', 0.06 * s]],
      back: [['pelvis', 'chest', 0.15 * s * R.P.width], ['thighL', 'shinL', 0.085 * s], ['thighR', 'shinR', 0.085 * s]],
      head: [['neck', 'head', 0.07 * s], ['chest', 'neck', 0.13 * s * R.P.width]],
    };
  }
  reset() { this.ready = false; }
  /** Spring bones have no keyed pose: each frame starts from bind (call BEFORE the world update), so the aim never feeds back. */
  resetPose() { for (const n of this.nodes) n.bone.quaternion.identity(); }
  /** Run after the pose and the world matrices are final. */
  update(dt, root) {
    const h = Math.min(dt, 1 / 30);
    for (const n of this.nodes) {
      const { bone, chain } = n;
      if (chain.bones[0] !== bone.name) bone.updateMatrixWorld(false);   // its parent spring bone just turned
      wpos(bone, _j);
      // where the animation (bind direction under the current parents) puts the next joint
      _t.copy(n.off).applyQuaternion(wquat(bone, _q)).add(_j);
      if (!this.ready || n.pos.distanceToSquared(_t) > 1) { n.pos.copy(_t); n.vel.set(0, 0, 0); continue; }
      if (h <= 0) { this.aim(n, _j); continue; }
      // damped spring toward the animated point, plus gravity
      _d.subVectors(_t, n.pos).multiplyScalar(chain.stiff);
      _d.addScaledVector(n.vel, -chain.damp); _d.y -= chain.gravity;
      n.vel.addScaledVector(_d, h);
      n.pos.addScaledVector(n.vel, h);
      // keep the length
      _p.subVectors(n.pos, _j).setLength(n.len); n.pos.copy(_j).add(_p);
      if (chain.collide) this.collide(n.pos, this.capsules[chain.collide], 0.03 * this.S);
      _p.subVectors(n.pos, _j).setLength(n.len); n.pos.copy(_j).add(_p);
      this.aim(n, _j);
    }
    this.ready = true;
  }
  aim(n, joint) {
    // turn the bone so its rest offset points at the simulated point
    _u.copy(n.off).applyQuaternion(wquat(n.bone, _q)).normalize();
    _v.subVectors(n.pos, joint).normalize();
    _q.setFromUnitVectors(_u, _v);
    rotateWorld(n.bone, _q);
    n.bone.updateMatrixWorld(false);
  }
  collide(p, caps, pad) {
    for (const [a, b, r] of caps) {
      wpos(this.byName[a], _a); wpos(this.byName[b], _b);
      _d.subVectors(_b, _a); const l2 = _d.lengthSq();
      const t = l2 > 0 ? Math.max(0, Math.min(1, _p.subVectors(p, _a).dot(_d) / l2)) : 0;
      _p.copy(_a).addScaledVector(_d, t);
      _u.subVectors(p, _p); const dist = _u.length(), rr = r + pad;
      if (dist < rr && dist > 1e-6) p.copy(_p).addScaledVector(_u, rr / dist);
    }
  }
}
