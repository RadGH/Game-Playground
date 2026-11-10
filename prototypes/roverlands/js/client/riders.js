// People: a Chibi 2.6 body (built exactly like Thousandvale's, createTvBody) that walks, rides in a seat with its
// hands on the controls and its feet on the floor / pegs, or tumbles when thrown out.
//
//   const r = await createRider(look);           scene.add(r.group)
//   r.onFoot(feet [x,y,z], yaw, anim, ragQuat?)   // every frame while walking
//   r.seated(vehicleGroup, seat, hands?)          // every frame while in a seat; hands = [worldL, worldR] THREE.Vector3s
//   r.update(dt)                                  // after either of the above (runs the clip, then the solves)
//   r.fitInfo()                                   // garage check: stretch, seat slide, hip error, head, soles
//
// Chibi faces +z, its root is between the feet. Seat p = the HIPS (drive / seated / ride) or the FEET (stand: true).
// Expansion 1 M1 (Chibi 2.6 fit) — every number below was measured off real 2.6 bodies with
// `node --import ./avatar-3d/tests/three-register.mjs prototypes/roverlands/tools/measure-rider.mjs` (README "Rider fit"):
//   drive   hips 0.447 above the floor under the feet, hands forward on a wheel (~0.17 above / 0.55 ahead of the hips)
//   seated  hips 0.450, hands in the lap (passengers, benches)
//   ride    hips 0.90 (the standing hip height — it does not move the root), knees spread, hands low (bikes, quad)
//   idle    standing (gunners, the truck-bed spot)
// Seats are exact for any race anyway: after the clip runs, the body is moved so its hip bone lands on seat p (a
// halfling and a dwarf have different hip heights in `ride`). Then two Knockabout two-bone solves (aimQuat / setWorld /
// solveChain, prototypes/knockabout/js/client/puppet.js) put the feet on seat.feet and the hands on the controls. A
// rider whose arms are too short for the wheel (halflings, dwarves: 0.42 m arms against a human's 0.63) slides the
// seat forward, like a real driver, instead of stretching — the stretch cap is a last resort and fitInfo reports it.
//
// seat.feet = [half, y, fwd]: the soles go at height y (vehicle frame: the floor, footwell or peg top), `fwd` metres
// ahead of the hip point along the way the seat faces, `half` metres either side of the seat's centre line.
//
// `?chibi=2.5` still works: the old clips (`sit`) and the old hip table, with the same pin and solves.

import * as THREE from 'three';
import { createTvBody, CHIBI_V } from '../../../thousandvale/js/client/chibi-version.js';
import { CHIBI2_ANIMS, CHIBI2_RIDE_ANIMS, CHIBI2_MOUNT_ANIMS } from '../../../../avatar-3d/js/chibi2-motion.js';
import '../../../../avatar-3d/js/chibi26-motion.js';     // registers the 2.6 `seated` and `drive` clips
import { SPACE_ANIMS } from './space-clips.js';          // M11: float (zero-g on Lantern Station)
import { SKY_ANIMS } from './sky-clips.js';              // M9: skydive / canopy / flare

export const V26 = CHIBI_V >= 2.6;
export const ANIMS = [...new Set([...CHIBI2_ANIMS, ...CHIBI2_RIDE_ANIMS, ...CHIBI2_MOUNT_ANIMS, 'seated', 'drive', ...SKY_ANIMS])];
ANIMS.push(...SPACE_ANIMS);
/** Hip height above the floor under the feet, per clip (default human; the pin makes every race exact). */
export const HIPS_26 = { drive: 0.447, seated: 0.45, ride: 0.90, sit: 0.45, idle: 0 };
export const HIPS_25 = { drive: 0.41, seated: 0.41, sit: 0.41, ride: 0.6, boat: 0.59, idle: 0 };
export const HIPS = V26 ? HIPS_26 : HIPS_25;
/** Limits of the seat slide (metres forward) and of the arm stretch (1 = none). */
export const SLIDE_MAX = 0.2, STRETCH_MAX = 1.08, REACH = 0.92;

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
/** Two-bone solve a -> b -> c onto `target`, bending toward `pole`. Returns the stretch used (1 = none). */
function solveChain(a, b, c, target, pole, front, stretch = STRETCH_MAX) {
  if (a.scale.y !== 1) { a.scale.y = 1; c.scale.y = 1; a.updateMatrixWorld(true); }
  const pa = a.getWorldPosition(v1), pb = b.getWorldPosition(v2), pc = c.getWorldPosition(v3);
  let L1 = pa.distanceTo(pb), L2 = pb.distanceTo(pc);
  if (L1 < 1e-4 || L2 < 1e-4) return 1;
  const to = v4.copy(target).sub(pa);
  let d = to.length();
  if (d < 1e-4) return 1;
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
  return s;
}

/**
 * World points for a seat's two hands this frame, or null (hands follow the clip). [0] = the +x hand (Chibi's armR).
 *   seat.grips = [[x,y,z], [x,y,z]] + seat.gripFrame 'body' | 'steer' | 'bars' | 'yaw' | 'pitch' — explicit points
 *   hands 'wheel' -> the rim of model.steer at +-0.14; 'bars' -> the bars group's grips at +-0.3; a gun seat -> the
 *   spade grips on the turret's pitch node.
 */
export function handTargets(model, seat) {
  if (!model) return null;
  const frameOf = f => f === 'steer' ? model.steer : f === 'bars' ? barsOf(model) : f === 'yaw' ? model.turret?.yaw : f === 'pitch' ? model.turret?.pitch : model.group;
  const at = (node, pts) => { if (!node) return null; node.updateMatrixWorld(true); return pts.map(p => new THREE.Vector3(...p).applyMatrix4(node.matrixWorld)); };
  if (seat.grips) return at(frameOf(seat.gripFrame || 'body'), seat.grips);
  if (seat.hands === 'wheel' && model.steer) return at(model.steer, [[0.14, 0, 0], [-0.14, 0, 0]]);
  if (seat.hands === 'bars' && model.steer) return at(barsOf(model), [[0.3, 0.035, -0.02], [-0.3, 0.035, -0.02]]);
  if (seat.gun && model.turret) return at(model.turret.pitch, [[0.2, -0.05, -0.25], [-0.2, -0.05, -0.25]]);
  return null;
}
const barsOf = m => m.steer && (m.steer.children.find(c => c.isGroup && c.position.y > 0.1) || m.steer);

const CLIP_26 = { idle: 'idle', walk: 'walk', run: 'run', jump: 'jump', fall: 'jump', swim: 'walk', rag: 'dead', sit: 'seated', seated: 'seated', drive: 'drive', ride: 'ride', boat: 'boat', stand: 'idle',
  down: 'dead', skydive: 'skydive', canopy: 'canopy', flare: 'flare' };     // M9: knocked down by a fall, skydiving
const CLIP_25 = { ...CLIP_26, sit: 'sit', seated: 'sit', drive: 'sit' };
CLIP_26.float = CLIP_25.float = 'float';                // M11
const CLIP = V26 ? CLIP_26 : CLIP_25;

export async function createRider(avatar, { tag = null } = {}) {
  const group = new THREE.Group();
  const holder = new THREE.Group(); group.add(holder);
  const body = await createTvBody(avatar, { anims: ANIMS });
  holder.add(body.group);
  body.group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const bones = body.parts;
  // this body's own lengths, read once standing (metres): arm, leg, ankle height, head-top over the head bone
  const size = measure(body, bones, group);
  let anim = null, hands = null, seat = null, vgroup = null, slide = 0, stretch = 1, hipErr = 0, onSeat = false;
  const setAnim = a => { const c = CLIP[a] || 'idle'; if (c !== anim) { anim = c; body.setAnim(c, 0.15); } };
  const seatQ = new THREE.Quaternion(), seatFwd = new THREE.Vector3(), seatUp = new THREE.Vector3(), hipAt = new THREE.Vector3();
  const self = {
    group, body, size,
    onFoot(feet, yaw, a = 'idle', ragQ = null) {
      onSeat = false; seat = null; hands = null; slide = 0; stretch = 1;
      group.position.set(feet[0], feet[1], feet[2]);
      // thrown: the `dead` clip lies the body along -z from its root (measured: 1.75 long, -0.15..0.46 thick), so it is
      // turned to lie ALONG the tumbling capsule (its axis is local y; centre 0.35 over `feet`, 1.36 long)
      if (ragQ) { group.quaternion.set(ragQ[0], ragQ[1], ragQ[2], ragQ[3]); holder.rotation.set(Math.PI / 2, 0, 0); holder.position.set(0, 0.35 - 0.875, -0.155); }
      // free fall (M9): `feet` is the middle of the body; it lies face down, head toward `yaw`, hips on that point
      else if (a === 'skydive') { group.quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw); holder.rotation.set(Math.PI / 2, 0, 0); holder.position.set(0, 0, -0.9); }
      // zero-g (M11): upright, `feet` is the middle of the body
      else if (a === 'float') { group.quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw); holder.rotation.set(0, 0, 0); holder.position.set(0, -0.9, 0); }
      else { group.quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw); holder.rotation.set(0, 0, 0); holder.position.set(0, 0, 0); }
      setAnim(a);
      body.setRate?.(a === 'swim' ? 0.6 : 1);
    },
    /** Put the body in a seat of `vg` (a vehicle model's group, already placed this frame). */
    seated(vg, s, handTargets = null) {
      if (seat !== s) slide = 0;
      onSeat = true; seat = s; vgroup = vg; hands = handTargets;
      const pose = s.stand ? 'stand' : s.pose || 'seated';
      vg.getWorldQuaternion(seatQ);
      if (s.yaw) seatQ.multiply(q1.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, s.yaw));
      seatFwd.set(0, 0, 1).applyQuaternion(seatQ); seatUp.set(0, 1, 0).applyQuaternion(seatQ);
      // the seat point (hips, or the feet when standing), slid forward for short arms
      hipAt.set(s.p[0], s.p[1], s.p[2]).applyMatrix4(vg.matrixWorld).addScaledVector(seatFwd, slide);
      group.quaternion.copy(seatQ); holder.rotation.set(0, 0, 0);
      group.position.copy(hipAt).addScaledVector(seatUp, -(s.stand ? 0 : HIPS[CLIP[pose]] ?? HIPS.seated));
      holder.position.set(0, 0, 0);
      setAnim(pose);
      body.setRate?.(1);
    },
    update(dt) {
      body.update(dt);
      if (!onSeat || !seat) return;
      group.updateMatrixWorld(true);
      // 1. pin the hips onto the seat point (any race, any clip frame)
      if (!seat.stand && bones?.hips) {
        const h = bones.hips.getWorldPosition(v1);
        const d = v2.copy(hipAt).sub(h).applyQuaternion(q1.copy(group.quaternion).invert());
        holder.position.add(d);
        group.updateMatrixWorld(true);
        hipErr = bones.hips.getWorldPosition(v1).distanceTo(hipAt);
      }
      // 2. feet on the floor / pegs
      if (seat.feet && bones?.legL) legs(seat.feet);      // [half, y, fwd], or 'pedals' (the model's group.userData.pedals)
      // 3. hands on the controls; short arms slide the seat forward for next frame instead of stretching
      stretch = 1;
      if (hands && bones?.armL) {
        const need = Math.max(hands[0] ? slideFor(bones.armR, hands[0]) : 0, hands[1] ? slideFor(bones.armL, hands[1]) : 0);
        slide = THREE.MathUtils.clamp(slide + need * Math.min(1, dt * 10 + 0.05), 0, SLIDE_MAX);
        const fwd = seatFwd, down = v3.copy(seatUp).multiplyScalar(-1).clone();
        const out = v4.set(1, 0, 0).applyQuaternion(seatQ).clone();
        // the elbow bends down and out: Chibi's armR is on its +x side (the body's left as we see it from behind)
        // three passes: aim the wrist, then move it by however far the fist (grip bone) still is from the target
        for (const [h, sd, o] of [[hands[0], 'R', 0.6], [hands[1], 'L', -0.6]]) {
          if (!h) continue;
          const pole = down.clone().addScaledVector(out, o);
          const w = wrist(bones['arm' + sd], h);
          let s = 1;
          for (let pass = 0; pass < 3; pass++) {
            s = solveChain(bones['arm' + sd], bones['elbow' + sd], bones['hand' + sd], w, pole, fwd);
            const g = bones['grip' + sd]?.getWorldPosition(new THREE.Vector3());
            if (!g || pass === 2) break;
            w.add(g.sub(h).negate());
          }
          stretch = Math.max(stretch, s);
        }
      }
    },
    /** Garage / test readout (world space). */
    fitInfo() {
      if (!onSeat) return null;
      group.updateMatrixWorld(true);
      const head = bones.head.getWorldPosition(new THREE.Vector3());
      const soles = ['L', 'R'].map(sd => bones['foot' + sd].getWorldPosition(new THREE.Vector3()).addScaledVector(seatUp, -size.ankle).toArray().map(n => +n.toFixed(3)));
      return { stretch: +stretch.toFixed(3), slide: +slide.toFixed(3), hipErr: +hipErr.toFixed(4), headCentre: head.toArray(), headR: size.headTop, hipY: bones.hips.getWorldPosition(new THREE.Vector3()).y, soles };
    },
    dispose() { body.dispose?.(); group.removeFromParent(); },
  };

  /** How much further forward the seat must go so this hand reaches `t` with the arm at most REACH straight. */
  function slideFor(arm, t) {
    const S = arm.getWorldPosition(v1), T = v2.copy(t).sub(S);
    const R = (size.upper + size.fore) * REACH;          // the fist sits off the forearm line, so the grip length is not counted
    const b = seatFwd.dot(T), c = T.lengthSq() - R * R;
    const disc = b * b - c;
    return disc >= 0 ? b - Math.sqrt(disc) : b;
  }
  /** The wrist point that puts the fist (grip bone) on `t`. */
  function wrist(arm, t) {
    const S = arm.getWorldPosition(v1);
    const dir = v2.copy(t).sub(S); const d = dir.length();
    if (d < 1e-4) return t.clone();
    return t.clone().addScaledVector(dir.divideScalar(d), -Math.min(size.grip, d * 0.5));
  }
  function legs(feet) {
    const pedals = feet === 'pedals' ? vgroup.userData.pedals : null;
    if (feet === 'pedals' && !pedals) return;
    const [half, y, fwd] = pedals ? [0, 0, 0] : feet;
    const ride = anim === 'ride';
    const right = v4.set(1, 0, 0).applyQuaternion(seatQ).clone();
    // the feet stay put in the vehicle when a short driver slides the seat forward
    const base = v3.set(seat.p[0], seat.p[1], seat.p[2]).applyMatrix4(vgroup.matrixWorld).clone();
    for (const sd of ['L', 'R']) {
      const thigh = bones['leg' + sd], knee = bones['knee' + sd], foot = bones['foot' + sd];
      if (!thigh || !knee || !foot) continue;
      const footQ = foot.getWorldQuaternion(new THREE.Quaternion());
      const side = Math.sign(thigh.getWorldPosition(v1).sub(hipAt).dot(right)) || (sd === 'L' ? -1 : 1);
      let t;
      if (pedals) {
        // the pedal on this foot's side of the bike
        const pd = pedals.find(p => Math.sign(vgroup.worldToLocal(p.getWorldPosition(v1)).x - seat.p[0]) === side) || pedals[0];
        t = pd.getWorldPosition(new THREE.Vector3()).addScaledVector(seatUp, size.ankle + 0.012);
      } else {
        t = base.clone().addScaledVector(seatFwd, fwd).addScaledVector(right, side * half);
        vgroup.worldToLocal(t); t.y = y + size.ankle; vgroup.localToWorld(t);     // y is a height in the vehicle frame
      }
      const pole = seatFwd.clone().addScaledVector(seatUp, ride ? 0.3 : 0.9).addScaledVector(right, side * (ride ? 0.35 : 0.08));
      solveChain(thigh, knee, foot, t, pole, seatFwd, 1);
      setWorld(foot, footQ);
    }
  }
  if (tag) group.add(tag);
  return self;
}

/** Arm / leg / ankle / head lengths of a built body, read standing at the origin (metres). */
function measure(body, B, group) {
  body.setAnim('idle', 0, true); body.update(0.016);
  group.updateMatrixWorld(true);
  const p = n => B[n] ? B[n].getWorldPosition(new THREE.Vector3()) : null;
  const len = (a, b) => (p(a) && p(b)) ? p(a).distanceTo(p(b)) : 0;
  let top = 0;
  const pt = new THREE.Vector3();
  body.group.traverse(m => {
    if (!m.isSkinnedMesh) return;
    m.skeleton.update();
    const n = m.geometry.attributes.position.count;
    for (let i = 0; i < n; i += 5) { m.getVertexPosition(i, pt); m.localToWorld(pt); if (pt.y > top) top = pt.y; }
  });
  const out = {
    upper: len('armL', 'elbowL'), fore: len('elbowL', 'handL'), grip: len('handL', 'gripL'),
    thigh: len('legL', 'kneeL'), shin: len('kneeL', 'footL'), ankle: Math.max(0.05, p('footL')?.y ?? 0.075),
    hip: p('hips')?.y ?? 0.9, headTop: top - (p('head')?.y ?? top - 0.2), height: top,
  };
  for (const k of Object.keys(out)) out[k] = +out[k].toFixed(3);
  return out;
}
