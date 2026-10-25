// People: a Chibi 2.5 body (built exactly like Thousandvale's, createTvBody) that walks, rides in a seat with its
// hands on the controls, or tumbles when thrown out.
//
//   const r = await createRider(look);           scene.add(r.group)
//   r.onFoot(feet [x,y,z], yaw, anim, ragQuat?)   // every frame while walking
//   r.seated(vehicleGroup, seat, hands?)          // every frame while in a seat; hands = [worldL, worldR] THREE.Vector3s
//   r.update(dt)                                  // after either of the above (runs the clip, then the hand solve)
//
// Chibi faces +z, its root is between the feet. Seat p = the hips (sit / ride) or the feet (stand) — the hip heights
// of each pose were measured off the real body: sit 0.41, ride 0.60 (data/vehicles.json `_doc`).
// The arm solve (aimQuat / setWorld / solveChain) is Knockabout's (prototypes/knockabout/js/client/puppet.js).

import * as THREE from 'three';
import { createTvBody } from '../../../thousandvale/js/client/chibi-version.js';
import { CHIBI2_ANIMS, CHIBI2_RIDE_ANIMS, CHIBI2_MOUNT_ANIMS } from '../../../../avatar-3d/js/chibi2-motion.js';

export const ANIMS = [...new Set([...CHIBI2_ANIMS, ...CHIBI2_RIDE_ANIMS, ...CHIBI2_MOUNT_ANIMS])];
export const HIPS = { sit: 0.41, ride: 0.6, boat: 0.59, idle: 0 };

const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), v4 = new THREE.Vector3(), q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion(), m4 = new THREE.Matrix4();
const X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3();
function aimQuat(dir, front, out) {
  Y.copy(dir).multiplyScalar(-1).normalize();
  Z.copy(front).addScaledVector(Y, -front.dot(Y));
  if (Z.lengthSq() < 1e-6) Z.set(0, 0, 1).addScaledVector(Y, -Y.z);
  Z.normalize(); X.crossVectors(Y, Z).normalize();
  m4.makeBasis(X, Y, Z);
  return out.setFromRotationMatrix(m4);
}
function setWorld(bone, worldQ) {
  bone.parent.getWorldQuaternion(q2);
  bone.quaternion.copy(q2.invert().multiply(worldQ));
  bone.updateMatrixWorld(true);
}
function solveChain(a, b, c, target, pole, front, stretch = 1.25) {
  if (a.scale.y !== 1) { a.scale.y = 1; c.scale.y = 1; a.updateMatrixWorld(true); }
  const pa = a.getWorldPosition(v1), pb = b.getWorldPosition(v2), pc = c.getWorldPosition(v3);
  let L1 = pa.distanceTo(pb), L2 = pb.distanceTo(pc);
  if (L1 < 1e-4 || L2 < 1e-4) return;
  const to = v4.copy(target).sub(pa);
  let d = to.length();
  if (d < 1e-4) return;
  const s = THREE.MathUtils.clamp(d / ((L1 + L2) * 0.97), 1, stretch);
  if (s > 1.001) { a.scale.y = s; c.scale.y = 1 / s; L1 *= s; L2 *= s; }
  const dir = to.divideScalar(d).clone();
  d = Math.min(d, (L1 + L2) * 0.999);
  const cosA = THREE.MathUtils.clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1), A = Math.acos(cosA);
  const p = pole.clone().addScaledVector(dir, -pole.dot(dir));
  if (p.lengthSq() < 1e-6) p.copy(front).addScaledVector(dir, -front.dot(dir));
  p.normalize();
  const upper = dir.clone().multiplyScalar(Math.cos(A)).addScaledVector(p, Math.sin(A)).normalize();
  const elbow = pa.clone().addScaledVector(upper, L1);
  const lower = pa.clone().addScaledVector(dir, d).sub(elbow).normalize();
  const fr = p.clone().negate();
  setWorld(a, aimQuat(upper, fr, q1.clone()));
  setWorld(b, aimQuat(lower, fr, q1.clone()));
}

const CLIP = { idle: 'idle', walk: 'walk', run: 'run', jump: 'jump', fall: 'jump', swim: 'walk', rag: 'dead', sit: 'sit', ride: 'ride', stand: 'idle' };

export async function createRider(avatar, { tag = null } = {}) {
  const group = new THREE.Group();
  const holder = new THREE.Group(); group.add(holder);
  const body = await createTvBody(avatar, { anims: ANIMS });
  holder.add(body.group);
  body.group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const bones = body.parts;
  let anim = null, hands = null;
  const setAnim = a => { const c = CLIP[a] || 'idle'; if (c !== anim) { anim = c; body.setAnim(c, 0.15); } };
  const self = {
    group, body,
    onFoot(feet, yaw, a = 'idle', ragQ = null) {
      if (group.parent && group.parent.isScene !== true && group.userData.seatParent) { group.userData.seatParent = null; }
      group.position.set(feet[0], feet[1], feet[2]);
      if (ragQ) { group.quaternion.set(ragQ[0], ragQ[1], ragQ[2], ragQ[3]); holder.position.set(0, -0.1, 0.55); }
      else { group.quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw); holder.position.set(0, 0, 0); }
      setAnim(a);
      hands = null;
      body.setRate?.(a === 'swim' ? 0.6 : 1);
    },
    /** Put the body in a seat of `vgroup` (a vehicle model's group, already placed this frame). */
    seated(vgroup, seat, handTargets = null) {
      const pose = seat.stand ? 'stand' : seat.pose || 'sit';
      const lift = seat.stand ? 0 : HIPS[seat.pose] ?? 0.41;
      v1.set(seat.p[0], seat.p[1] - lift, seat.p[2]).applyMatrix4(vgroup.matrixWorld);
      group.position.copy(v1);
      vgroup.getWorldQuaternion(group.quaternion);
      if (seat.yaw) group.quaternion.multiply(q1.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, seat.yaw));
      holder.position.set(0, 0, 0);
      setAnim(pose);
      hands = handTargets;
    },
    update(dt) {
      body.update(dt);
      if (hands && bones?.armL) {
        group.updateMatrixWorld(true);
        const fwd = v2.set(0, 0, 1).applyQuaternion(group.quaternion).clone();
        const down = new THREE.Vector3(0, -1, 0);
        // the elbow bends down and out: Chibi's armR is on its +x side (the body's left as we see it from behind)
        if (hands[0]) solveChain(bones.armR, bones.elbowR, bones.handR, hands[0], down.clone().add(v3.set(0.6, 0, 0).applyQuaternion(group.quaternion)), fwd);
        if (hands[1]) solveChain(bones.armL, bones.elbowL, bones.handL, hands[1], down.clone().add(v3.set(-0.6, 0, 0).applyQuaternion(group.quaternion)), fwd);
      }
    },
    dispose() { body.dispose?.(); group.removeFromParent(); },
  };
  if (tag) group.add(tag);
  return self;
}
