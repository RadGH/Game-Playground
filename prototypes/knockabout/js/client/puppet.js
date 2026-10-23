// A fighter on screen: a Chibi 2.5 body (the same avatars as Tumblefair) worn over the sim's physics puppet.
//
// The sim only sends a handful of points per fighter (torso position + rotation, head, two hands, two feet). The body is
// fitted to them every frame:
//   * the whole body is placed and turned by the TORSO transform (so a knocked-down fighter lies the way the sim's
//     torso lies — no separate "fall" animation is needed),
//   * each ARM is a two-bone chain (upper arm, forearm) solved toward the sim's hand: law of cosines for the elbow
//     bend, the elbow pointed back and down (a pole), and the two bones' world rotations turned back into local ones,
//   * each LEG the same toward the sim's foot (knee pointed forward) whenever the fighter is down or in the air; on
//     the ground and upright the walk / run clip moves the legs (it reads better than feet sliding about),
//   * the HEAD bone leans toward the sim's head point (a floppy neck),
//   * dazed: little stars circle the head; down: the stars stay and the body goes limp (no clip, all chains solved).
// The body is scaled once so its chest height matches the sim's standing torso height (measured from the first
// upright snapshots), so it works whatever size the sim's puppet is.
import * as THREE from 'three';
import { createTvBody } from '../../../thousandvale/js/client/chibi-version.js';
import { CHIBI2_ANIMS } from '../../../../avatar-3d/js/chibi2.js';
import { avatarOf } from './look.js';

/** ONE clip list for the whole game (Chibi 2 caches a body by look + list LENGTH). */
export const ANIMS = [...CHIBI2_ANIMS, 'cheer'];
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), v4 = new THREE.Vector3(), q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion(), m4 = new THREE.Matrix4();
const X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3();

/** World rotation that points a bone's local -Y along `dir`, with its local +Z as close to `front` as it can be. */
function aimQuat(dir, front, out) {
  Y.copy(dir).multiplyScalar(-1).normalize();
  Z.copy(front).addScaledVector(Y, -front.dot(Y));
  if (Z.lengthSq() < 1e-6) Z.set(0, 0, 1).addScaledVector(Y, -Y.z);
  Z.normalize(); X.crossVectors(Y, Z).normalize();
  m4.makeBasis(X, Y, Z);
  return out.setFromRotationMatrix(m4);
}
/** Set a bone's local rotation from a wanted world rotation. */
function setWorld(bone, worldQ) {
  bone.parent.getWorldQuaternion(q2);
  bone.quaternion.copy(q2.invert().multiply(worldQ));
  bone.updateMatrixWorld(true);
}
/**
 * Two-bone solve: `a` (shoulder/hip), `b` (elbow/knee), `c` (hand/foot) bones; `target` world point; `pole` world
 * direction the middle joint should bend toward; `front` world direction the limb's front faces.
 */
function solveChain(a, b, c, target, pole, front, k = 1, stretch = 1) {
  if (a.scale.y !== 1) { a.scale.y = 1; c.scale.y = 1; a.updateMatrixWorld(true); }
  const pa = a.getWorldPosition(v1), pb = b.getWorldPosition(v2), pc = c.getWorldPosition(v3);
  let L1 = pa.distanceTo(pb), L2 = pb.distanceTo(pc);
  if (L1 < 1e-4 || L2 < 1e-4) return;
  const to = v4.copy(target).sub(pa);
  let d = to.length();
  if (d < 1e-4) return;
  // rubber arms: a Chibi arm is shorter than the sim's, so when the hand is out of reach the whole chain stretches
  // (up to `stretch` times) instead of stopping short — a reach, a punch or arms over the head read from across the room.
  // The arm is nearly straight whenever it stretches, so scaling the upper bone along its length (which the forearm
  // inherits) does not shear; the fist is scaled back so it stays round.
  if (stretch > 1) {
    const s = THREE.MathUtils.clamp(d / ((L1 + L2) * 0.97), 1, stretch);
    if (s > 1.001) { a.scale.y = s; c.scale.y = 1 / s; L1 *= s; L2 *= s; }
  }
  const dir = to.divideScalar(d).clone();
  d = Math.min(d, (L1 + L2) * 0.999);
  if (k < 1) {                                          // blend: aim part of the way from the current hand position
    const cur = pc.clone().sub(pa).normalize();
    dir.lerp(cur, 1 - k).normalize();
  }
  const cosA = THREE.MathUtils.clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1), A = Math.acos(cosA);
  const p = pole.clone().addScaledVector(dir, -pole.dot(dir));
  if (p.lengthSq() < 1e-6) p.copy(front).addScaledVector(dir, -front.dot(dir));
  p.normalize();
  const upper = dir.clone().multiplyScalar(Math.cos(A)).addScaledVector(p, Math.sin(A)).normalize();
  const elbow = pa.clone().addScaledVector(upper, L1);
  const lower = pa.clone().addScaledVector(dir, d).sub(elbow).normalize();
  const fr = p.clone().negate();                         // the limb's front faces away from the bend
  setWorld(a, aimQuat(upper, fr, q1.clone()));
  setWorld(b, aimQuat(lower, fr, q1.clone()));
}

const STAR_GEO = (() => {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.045 : 0.11, a = i / 10 * Math.PI * 2 - Math.PI / 2; i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  return new THREE.ShapeGeometry(s);
})();
const STAR_MAT = new THREE.MeshBasicMaterial({ color: '#ffe14a', side: THREE.DoubleSide, depthTest: false, transparent: true });
const ringGeo = new THREE.RingGeometry(0.34, 0.46, 28).rotateX(-Math.PI / 2);

export async function createPuppet(fighter, { look, color = '#ffffff' } = {}) {
  const group = new THREE.Group(); group.name = 'fighter-' + fighter.pid;
  const holder = new THREE.Group(); group.add(holder);
  const body = await createTvBody(avatarOf(look), { anims: ANIMS });
  holder.add(body.group);
  const bones = body.parts;
  const tall = body.metrics().totalHeight || 1.2;                              // the body's height at scale 1
  let standH = 1.0, headTop = 0.26;                                             // sim: torso point over the feet; head radius
  // a coloured ring on the ground under each fighter, so who-is-who reads from above
  const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }));
  ring.renderOrder = 2;
  const stars = new THREE.Group(); for (let i = 0; i < 4; i++) { const st = new THREE.Mesh(STAR_GEO, STAR_MAT); st.renderOrder = 9; stars.add(st); } stars.visible = false;
  const shadowCast = q => { q.traverse(o => { if (o.isMesh || o.isSkinnedMesh) { o.castShadow = true; o.frustumCulled = false; } }); };
  shadowCast(body.group);
  const P = { group, ring, stars, body, pid: fighter.pid, scale: 1, scaled: false, samples: [], anim: 'idle', t: Math.random() * 10, lastPos: null, speed: 0, alive: true, color };
  let scale = 1.5;
  const torsoQ = new THREE.Quaternion(), torsoP = new THREE.Vector3(), tmp = new THREE.Vector3();
  const setAnim = name => { if (P.anim !== name) { body.setAnim(name, 0.15); P.anim = name; } };

  /** Pose from a (blended) fighter snapshot. */
  P.update = (f, dt) => {
    P.t += dt;
    if (!f) return;
    torsoP.set(f.torso[0], f.torso[1], f.torso[2]);
    torsoQ.set(f.torso[3], f.torso[4], f.torso[5], f.torso[6]).normalize();
    const feetY = Math.min(f.feet?.[0]?.[1] ?? f.torso[1] - 1, f.feet?.[1]?.[1] ?? f.torso[1] - 1);
    // measure the sim's standing puppet once, from upright snapshots: how high the torso point rides over the feet
    // (the body's feet go that far below it) and how tall it is to the top of the head (the body is scaled to that)
    if (!P.scaled && !f.down && f.alive && f.head) {
      const up = tmp.set(0, 1, 0).applyQuaternion(torsoQ).y;
      if (up > 0.95) P.samples.push([f.torso[1] - feetY, f.head[1] + headTop - feetY]);
      if (P.samples.length >= 12) {
        const mid = k => P.samples.map(x => x[k]).sort((a, b) => a - b)[6];
        standH = THREE.MathUtils.clamp(mid(0), 0.4, 2); scale = THREE.MathUtils.clamp(mid(1) / tall, 0.6, 2.4); P.scaled = true;
      }
    }
    holder.scale.setScalar(scale);
    // speed over the ground (for walk/run)
    if (P.lastPos) { const sp = Math.hypot(torsoP.x - P.lastPos.x, torsoP.z - P.lastPos.z) / Math.max(1e-3, dt); P.speed += (sp - P.speed) * Math.min(1, dt * 8); }
    P.lastPos = torsoP.clone();
    const down = f.down > 0, air = !down && torsoP.y - feetY > standH * 1.3 && feetY > -50;
    setAnim(down ? 'idle' : air ? 'jump' : P.speed > 3.2 ? 'run' : P.speed > 0.6 ? 'walk' : 'idle');
    if (P.anim === 'run' || P.anim === 'walk') body.setRate(THREE.MathUtils.clamp(P.speed / (P.anim === 'run' ? 5.4 : 2.4), 0.5, 1.8));
    body.update(dt);
    // place: the chest bone sits on the sim's torso point, the body turned by the torso rotation
    holder.position.set(0, 0, 0); holder.quaternion.identity();
    group.position.copy(torsoP).sub(tmp.set(0, standH, 0).applyQuaternion(torsoQ));
    group.quaternion.copy(torsoQ);
    group.updateMatrixWorld(true);
    // arms toward the hands; the elbow bends back and down from the chest's point of view
    const back = tmp.set(0, -0.4, -1).applyQuaternion(torsoQ).normalize().clone(), fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(torsoQ);
    const out = s => new THREE.Vector3(s, 0, 0).applyQuaternion(torsoQ);
    // the sim's hand 0 (LEFT, L1) sits on the torso's +x side; Chibi's bones named 'R' are the +x ones
    if (f.hands?.[0]) solveChain(bones.armR, bones.elbowR, bones.handR, v4.set(...f.hands[0]).clone(), back.clone().addScaledVector(out(1), 0.6), fwd, 1, 1.5);
    if (f.hands?.[1]) solveChain(bones.armL, bones.elbowL, bones.handL, v4.set(...f.hands[1]).clone(), back.clone().addScaledVector(out(-1), 0.6), fwd, 1, 1.5);
    // legs follow the feet when the body is not standing on them (knees bend forward)
    if ((down || air) && f.feet?.[0] && f.feet?.[1]) {
      const kneeFwd = fwd.clone().addScaledVector(new THREE.Vector3(0, 1, 0).applyQuaternion(torsoQ), 0.2);
      solveChain(bones.legR, bones.kneeR, bones.footR, new THREE.Vector3(...f.feet[0]), kneeFwd, fwd.clone().negate());
      solveChain(bones.legL, bones.kneeL, bones.footL, new THREE.Vector3(...f.feet[1]), kneeFwd, fwd.clone().negate());
    }
    // the head leans toward the sim's head point
    if (f.head) {
      const hp = bones.head.getWorldPosition(new THREE.Vector3()), want = new THREE.Vector3(...f.head).sub(hp);
      if (want.lengthSq() > 1e-6) {
        bones.head.parent.getWorldQuaternion(q1);
        const upW = new THREE.Vector3(0, 1, 0).applyQuaternion(q1), dirW = want.normalize();
        const turn = new THREE.Quaternion().setFromUnitVectors(upW, dirW.lerp(upW, 0.45).normalize());
        const lim = 0.6, ang = 2 * Math.acos(Math.min(1, Math.abs(turn.w)));
        if (ang > lim) turn.slerp(new THREE.Quaternion(), 1 - lim / ang);
        bones.head.getWorldQuaternion(q2); setWorld(bones.head, turn.multiply(q2));
      }
    }
    // ring under the feet, dazed stars over the head
    ring.position.set(torsoP.x, Math.max(feetY, -50) + 0.03, torsoP.z);
    const dazed = f.alive && (down || (f.daze || 0) >= 0.66);
    stars.visible = dazed;
    if (dazed) {
      const hp = bones.head.getWorldPosition(new THREE.Vector3());
      stars.position.copy(hp).add(tmp.set(0, 0.32 * scale, 0));
      stars.children.forEach((s, i) => { const a = P.t * 4 + i / stars.children.length * Math.PI * 2; s.position.set(Math.cos(a) * 0.32 * scale, Math.sin(P.t * 6 + i) * 0.04, Math.sin(a) * 0.32 * scale); s.scale.setScalar(scale * 0.9); s.rotation.set(0, 0, P.t * 5 + i); });
    }
  };
  P.setVisible = v => { group.visible = v; ring.visible = v; if (!v) stars.visible = false; };
  P.headPos = () => bones.head.getWorldPosition(new THREE.Vector3());
  P.dispose = () => { group.removeFromParent(); ring.removeFromParent(); stars.removeFromParent(); ring.material.dispose(); body.dispose(); };
  return P;
}

/** A standing body for the builder and lobby (no sim, just a clip). */
export async function createModel(look) {
  const body = await createTvBody(avatarOf(look), { anims: ANIMS });
  body.group.traverse(o => { if (o.isMesh || o.isSkinnedMesh) { o.castShadow = true; o.frustumCulled = false; } });
  return body;
}
