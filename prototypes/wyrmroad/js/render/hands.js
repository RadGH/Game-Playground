// What the hands hold, drawn right — Wyrmroad's own layer on top of the Chibi 2.6 rig (avatar-3d is not changed):
//
// 1. TWO HANDS ON A TWO-HANDER (owner 2026-11-21: "The vanguard using a two hander in one hand is weird"). Every
//    greatsword, greataxe, maul, polearm and staff is held in BOTH hands in every clip that does not need the left hand
//    for something else: after the clip has posed the body, the left arm reaches the weapon's handle with a two-bone
//    reach (shoulder → elbow → hand) and the left fist turns to wrap the same handle the right fist holds. The point on
//    the handle is measured from the drawn weapon (its pommel / butt end), so a long-hafted axe is held further apart
//    than a sword, and a staff with the hands stacked at rest and spread in a fight. The reach eases in and out over a
//    tenth of a second, so a cast (left hand free) and back never snaps.
// 2. WEAPON LENGTHS BY KIND (owner #105: "The flamberge I have should be taller"). Each weapon kind has a least drawn
//    length (pommel to tip, on a 1.75 m hero); a weapon drawn shorter is stretched along its own length only (the grip
//    bone is scaled along the blade axis), so the hilt stays in the fist. Item icons use the same table (item-icons.js).
// 3. TWO-HANDED STRIKES. A clip written for one hand swings the right arm wide; a two-hander keeps both fists on the
//    handle in front of the body, so its strikes use `w2_<clip>`: the same timing and blade path with the right arm
//    brought in to the body's middle (the body turns more instead). `clipFor(name, hold)` picks it.
//
//   const hands = handsFor(chibi, look);   // null when nothing needs doing
//   hands.pre(); chibi.update(dt); hands.update(dt, animName)   // every frame: around the character's own update
import * as THREE from 'three';
import { registerClips, MOTION_KIT, CHIBI2_CLIP_SECONDS } from '../../../../avatar-3d/js/chibi2-motion.js';
import { G5_HELD } from '../../../../avatar-3d/js/chibi2-gear5-ids.js';

// ------------------------------------------------------------------------------------------------ weapon lengths
/** The least drawn length of each weapon kind, pommel/butt to tip, in metres on a 1.75 m hero. */
export const WEAPON_LENGTH = {
  greatsword: 1.52,     // a two-handed sword reaches past the hero's chest when its point is on the ground
  flamberge: 1.7,       // the wavy greatblade is the tallest sword in the game: about the hero's own height
  greataxe: 1.42,
  maul: 1.38,
  polearm: 1.9,
  staff: 1.62,          // a staff stands at least to the hero's eyes
  longsword: 1.05,
  sword: 0.86,
};
/** Which kind each held id is (ids not listed keep the length they are built at). */
const KIND_OF = {
  fh_greatsword: 'greatsword', greatsword: 'greatsword', g5_flamberge: 'flamberge',
  fh_greataxe: 'greataxe', greataxe: 'greataxe', g5_headsman: 'greataxe',
  fh_maul: 'maul', warhammer: 'maul', g5_stonemaul: 'maul',
  fh_halberd: 'polearm', g5_bardiche: 'polearm',
  fh_longsword: 'longsword', fh_sabre: 'sword', saber: 'sword', g5_leafblade: 'sword', fh_rapier: 'longsword',
};
export function weaponKind(id) {
  if (!id || id === 'none') return null;
  if (KIND_OF[id]) return KIND_OF[id];
  if (/staff/.test(id) || G5_HELD[id]?.hold === 'staff') return 'staff';
  return null;
}
/** How much longer to draw a weapon that measures `total` metres (1 = as built; never shorter). */
export function lengthScale(id, total) {
  const k = weaponKind(id), want = k ? WEAPON_LENGTH[k] : 0;
  return want && total > 0.05 ? Math.max(1, want / total) : 1;
}

/**
 * The drawn extent of what the right (or left) grip carries, along the grip's own axis (+y = back up the handle to the
 * pommel / a staff's head; −y = toward a blade's tip), in the rig's metres: `{ lo, hi }`, or null when the hand is empty.
 * Measured once per body from the bind pose (vertices skinned to the grip bone).
 */
const _v = new THREE.Vector3(), _m = new THREE.Matrix4();
export function measureGrip(chibi, side = 'R') {
  const skel = chibi.skeleton, gi = skel.bones.indexOf(chibi.parts['grip' + side]);
  if (gi < 0) return null;
  let lo = Infinity, hi = -Infinity;
  chibi.group.traverse(m => {
    if (!m.isSkinnedMesh || m.userData.outline) return;
    const p = m.geometry.attributes.position, si = m.geometry.attributes.skinIndex, sw = m.geometry.attributes.skinWeight;
    _m.multiplyMatrices(skel.boneInverses[gi], m.bindMatrix);
    for (let i = 0; i < p.count; i++) {
      if (si.getX(i) !== gi || sw.getX(i) < 0.5) continue;
      _v.fromBufferAttribute(p, i).applyMatrix4(_m);
      if (_v.y < lo) lo = _v.y; if (_v.y > hi) hi = _v.y;
    }
  });
  return Number.isFinite(lo) ? { lo, hi } : null;
}

// ------------------------------------------------------------------------------------------------ two-handed strikes
/**
 * A two-hander's strike: the base clip's pose and blade aim, with the right arm brought in toward the body's middle
 * (less out to the side, a little more forward) so both fists can stay on one handle; the hips and chest turn a little
 * more to carry the swing the arm no longer makes. The blade still ends where the base clip aims it (the wrist is
 * solved after the pose).
 */
const TWO_HAND_STRIKES = ['slash', 'slashBack', 'overhead', 'sweep', 'slam', 'lunge', 'jump', 'hit', 'attack', 'arcCut', 'chop', 'hack', 'smash', 'uppercut', 'thrust', 'jab', 'bash', 'spinSweep', 'whirl', 'thrust2h', 'guard', 'block'];
const W2 = n => 'w2_' + n;
let registered = false;
function registerTwoHandClips() {
  if (registered) return; registered = true;
  const defs = {};
  for (const name of TWO_HAND_STRIKES) {
    const base = MOTION_KIT.clip(name);
    if (!base) continue;
    defs[W2(name)] = {
      seconds: CHIBI2_CLIP_SECONDS[name] || 0.6,
      oneShot: !['guard', 'block', 'whirl'].includes(name),
      pose(p, u, cy, ctx, o) {
        const aims = base(p, u, cy, ctx, o);
        const out = Math.max(0, p.armR[2] - 0.05);           // how far the right arm is out to the side
        p.armR[2] -= out * 0.75 + 0.18;                      // in toward the middle
        p.armR[1] *= 0.6;                                    // less of a wide sweep from the shoulder
        p.chest[1] += -out * 0.35; p.hips[1] += -out * 0.15; // the body turns instead
        return aims;
      },
    };
  }
  // AT REST, a two-hander is held low in both hands, its point toward the ground ahead (a resting low guard): the fists
  // at the belt, so the chest and the face stay clear (the creator shows the body). Walking and running keep Chibi's
  // own carry over the shoulder, with the second hand on the handle.
  const idle = MOTION_KIT.clip('idle');
  defs[W2('idle')] = {
    seconds: CHIBI2_CLIP_SECONDS.idle || 3.2,
    pose(p, u, cy, ctx, o) {
      idle(p, u, cy, ctx, o);
      if (ctx.hold.right !== 'heavy') return MOTION_KIT.carry(p, ctx, 'idle');
      const breath = Math.sin(cy * 2);
      p.armR = [-0.32 + breath * 0.02, 0, -0.2]; p.elbowR = [-0.62, 0, 0];
      return { R: [-0.72 + breath * 0.02, 0, 0.12] };
    },
  };
  registerClips(defs);
}
/**
 * A STAFF IN BOTH HANDS. Chibi's own staff clips plant it at the side in one fist (a walking stick), where the other hand
 * cannot reach it. A two-handed staff is carried in front of the body instead: upright before the chest with the hands
 * stacked on it at rest; slanted across the body (butt low on the staff hand's side, head up past the other shoulder) on
 * the move and at the ready; raised and more level to block. Legs, hips and the body's sway come from the base clip;
 * the arm carrying the staff and the staff's angle come from this table, and the other hand reaches the shaft.
 * Pitch/roll/yaw as in chibi2-motion `aim` (a staff's pitch is its butt: 0 = straight down; yaw > 0 swings the butt
 * toward the staff hand's side).
 */
const STAFF_CARRY = {
  idle: { armR: [-0.58, 0, -0.4], elbowR: -1.3, aim: [0.02, 0, -0.05] },
  // (slanted ~33 degrees: the staff's head passes beside the far shoulder, not across the face)
  walk: { armR: [-0.4, 0, 0.06], elbowR: -1.05, aim: [0.1, 0, 0.56], swing: 0.12 },
  run: { armR: [-0.5, 0, 0.06], elbowR: -1.2, aim: [-0.1, 0, 0.62], swing: 0.2 },
  ready: { armR: [-0.5, 0, 0.1], elbowR: -1.05, aim: [-0.25, 0, 0.6] },
  jump: { armR: [-0.6, 0, 0.06], elbowR: -1.0, aim: [-0.2, 0, 0.66] },
  guard: { armR: [-0.95, 0, -0.15], elbowR: -1.0, aim: [-0.2, 0, 1.3] },
  block: { armR: [-0.95, 0, -0.15], elbowR: -1.0, aim: [-0.2, 0, 1.3] },
};
const WS = n => 'w2s_' + n;
let registeredStaff = false;
function registerStaffClips() {
  if (registeredStaff) return; registeredStaff = true;
  const defs = {};
  for (const [name, c] of Object.entries(STAFF_CARRY)) {
    const base = MOTION_KIT.clip(name);
    if (!base) continue;
    defs[WS(name)] = {
      seconds: CHIBI2_CLIP_SECONDS[name] || 1,
      oneShot: name === 'jump',
      pose(p, u, cy, ctx, o) {
        base(p, u, cy, ctx, o);
        p.armR = [c.armR[0] + (c.swing ? Math.sin(cy) * c.swing : 0), c.armR[1], c.armR[2]]; p.elbowR = [c.elbowR, 0, 0];
        return { R: c.aim };
      },
    };
  }
  registerClips(defs);
}
/** The clip a body plays for `name` (a two-hander's strike, a staff's carry — or the name itself). */
export function clipFor(name, kind) {
  if (kind === 'staff') return STAFF_CARRY[name] ? WS(name) : name;
  return kind && (TWO_HAND_STRIKES.includes(name) || name === 'idle') ? W2(name) : name;
}
/** Every extra clip a body holding this kind needs ('staff', or any other truthy kind for a two-hander). */
export function twoHandClips(kind) {
  if (kind === 'staff') { registerStaffClips(); return Object.keys(STAFF_CARRY).map(WS); }
  registerTwoHandClips(); return [...TWO_HAND_STRIKES, 'idle'].map(W2);
}

// ------------------------------------------------------------------------------------------------ the left hand's reach
/** Clips in which the left hand lets go (it casts, points, throws, or the body falls). */
const LEFT_FREE = new Set(['cast', 'castPoint', 'throw', 'dead', 'wave', 'talk', 'point', 'cheer', 'pray', 'salute', 'bowGreet', 'clap', 'shrug', 'laugh', 'crossArms', 'stretch', 'drink', 'sleep', 'kneel', 'sitGround', 'dance', 'lookAround', 'punch', 'kick']);
/** Staves: the hands stacked at rest, a forearm apart in a fight (metres along the shaft toward the staff's head). */
const STAFF_REST = new Set(['idle', 'walk', 'run', 'jump']);

const _T = new THREE.Vector3(), _P = new THREE.Vector3(), _Y = new THREE.Vector3(), _yL = new THREE.Vector3(), _dir = new THREE.Vector3();
const _pole = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _Ep = new THREE.Vector3(), _sc = new THREE.Vector3();
const _q = new THREE.Quaternion(), _qw = new THREE.Quaternion(), _qp = new THREE.Quaternion();
const _cx = new THREE.Vector3(), _cy = new THREE.Vector3(), _cz = new THREE.Vector3(), _C = new THREE.Vector3();
const _R = new THREE.Vector3(), _R2 = new THREE.Vector3(), _Q = new THREE.Vector3(), _M = new THREE.Vector3(), _oR = new THREE.Vector3(), _oL = new THREE.Vector3();
const _SL = new THREE.Vector3(), _SR = new THREE.Vector3(), _ThL = new THREE.Vector3(), _ThR = new THREE.Vector3(), _DL = new THREE.Quaternion(), _DR = new THREE.Quaternion();

/** Turn `bone` (in world space) so the direction from it to `from` points at `to`, blended by w. */
function swing(bone, from, to, w) {
  bone.getWorldPosition(_P);
  _a.subVectors(from, _P).normalize(); _b.subVectors(to, _P).normalize();
  if (_a.lengthSq() < 1e-8 || _b.lengthSq() < 1e-8) return;
  _q.setFromUnitVectors(_a, _b);
  bone.getWorldQuaternion(_qw); _qw.premultiply(_q);
  bone.parent.getWorldQuaternion(_qp).invert();
  _qw.premultiply(_qp);
  bone.quaternion.slerp(_qw, w);
  bone.updateWorldMatrix(false, true);
}
/** Set `bone`'s world rotation to `D` (blended by w). */
function setWorldQuat(bone, D, w) {
  bone.parent.getWorldQuaternion(_qp).invert();
  _qw.copy(D).premultiply(_qp);
  bone.quaternion.slerp(_qw, w);
  bone.updateWorldMatrix(false, true);
}
/** Shoulder → elbow → hand reach: the hand's pivot to `Th`, the elbow bending down, out to its own side and back. */
function reach(arm, elbow, hand, Th, w, chest) {
  const S = arm.getWorldPosition(new THREE.Vector3()), E = elbow.getWorldPosition(new THREE.Vector3()), H = hand.getWorldPosition(new THREE.Vector3());
  const a = S.distanceTo(E), b = E.distanceTo(H);
  _dir.subVectors(Th, S); let d = _dir.length(); _dir.divideScalar(d || 1);
  d = Math.max(Math.abs(a - b) + 1e-4, Math.min(a + b - 1e-4, d));
  const cosA = (a * a + d * d - b * b) / (2 * a * d), sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const c = chest.matrixWorld.elements;
  _cx.set(c[0], c[1], c[2]).normalize(); _cy.set(c[4], c[5], c[6]).normalize(); _cz.set(c[8], c[9], c[10]).normalize();
  chest.getWorldPosition(_C);
  const side = Math.sign(_a.subVectors(S, _C).dot(_cx)) || 1;
  _pole.copy(_cx).multiplyScalar(side * 0.55).addScaledVector(_cy, -1).addScaledVector(_cz, -0.35);
  _pole.addScaledVector(_dir, -_pole.dot(_dir)).normalize();
  _Ep.copy(S).addScaledVector(_dir, a * cosA).addScaledVector(_pole, a * sinA);
  swing(arm, E, _Ep, w);
  hand.getWorldPosition(H);
  swing(elbow, H, Th, w);
}
const armLength = (arm, elbow, hand) => arm.getWorldPosition(_a).distanceTo(elbow.getWorldPosition(_b)) + _b.distanceTo(hand.getWorldPosition(_P));

/**
 * The hands layer for one Chibi body, or null when it holds nothing that needs it.
 * `look` is the dressed look the body was built from (its held id names the weapon kind).
 *
 * The two-handed hold, each frame after the clip: the weapon keeps the angle the clip gave it. The second fist goes
 * on the handle at its usual spot (or slides along the handle toward the first fist if the arm is short of it); when the
 * clip swings the weapon out where both arms cannot hold it (a one-handed cut swung wide), the weapon is drawn in toward
 * the front of the chest — the least distance that lets both hands hold it — and BOTH arms reach it, so the strike
 * keeps its line through the air with two fists on the hilt. Only if even that is impossible does the left hand let go.
 */
export function handsFor(chibi, look) {
  const B = chibi.parts, hold = chibi.hold || {};
  const id = look?.held?.id || 'none', left = hold.left || 'none';
  const ext = measureGrip(chibi, 'R');
  if (!ext) return null;
  const scale = lengthScale(id, ext.hi - ext.lo);
  const staff = hold.right === 'staff', twoHand = !!hold.twoHand || (staff && left === 'none');
  if (scale === 1 && !twoHand) return null;
  // where the left fist goes on the handle, along the grip axis: a sword's second hand just above the pommel, a hafted
  // weapon's further down the haft, a polearm's front hand well up the shaft toward the head, a staff's above the right
  const butt = ext.hi * scale, polearm = hold.right === 'polearm';
  const swordish = weaponKind(id) === 'greatsword' || weaponKind(id) === 'flamberge';
  const offFight = staff ? 0.36 : polearm ? -0.5 : Math.max(0.1, Math.min(swordish ? 0.15 : 0.26, butt - 0.07));
  const offRest = staff ? 0.17 : offFight, offMin = Math.sign(offFight) * 0.085;
  let w = 1;                                  // how far the hold has taken over from the clip (eases between clips)
  const R = { arm: B.armR, elbow: B.elbowR, hand: B.handR }, L = { arm: B.armL, elbow: B.elbowL, hand: B.handL }, chest = B.chest;
  // three.js's mixer only writes a bone when its own value CHANGES, so what we change after it would stick (and the
  // grip scale would grow every frame): the clip's own values are kept here and put back before the mixer runs
  const bones = [B.armL, B.elbowL, B.handL, B.armR, B.elbowR, B.handR], fk = bones.map(() => new THREE.Quaternion());
  let gy = 1, saved = false;
  return {
    twoHand, scale, kind: twoHand ? (staff ? 'staff' : 'two') : null,
    /** Right BEFORE the mixer: the bones get the clip's own values back. */
    pre() {
      if (!saved) return;
      B.gripR.scale.y = gy;
      if (twoHand) bones.forEach((b, i) => b.quaternion.copy(fk[i]));
    },
    /** Right after the mixer. `anim` = the clip playing; `dt` for the blend. */
    update(dt, anim = 'idle') {
      gy = B.gripR.scale.y; bones.forEach((b, i) => fk[i].copy(b.quaternion)); saved = true;
      if (scale !== 1) B.gripR.scale.y *= scale;
      if (!twoHand) return;
      const base = anim.replace(/^w2s?_/, '');
      const held = B.gripR.scale.x > 0.5;                        // a hands-free clip shrinks the grip: the weapon is put away
      let want = held && !LEFT_FREE.has(base) ? 1 : 0;
      if (want === 0 && w < 0.01) { w = 0; return; }
      B.gripR.updateWorldMatrix(true, false);
      B.armL.updateWorldMatrix(false, true);
      chest.matrixWorld.decompose(_C, _qp, _sc);
      const s = _sc.x;
      // the weapon as the clip holds it: grip point R, axis Y (+ toward the pommel / a staff's head)
      const m = B.gripR.matrixWorld.elements;
      _Y.set(m[4], m[5], m[6]).normalize();
      B.gripR.getWorldPosition(_R);
      // each fist's pivot sits a palm's breadth from its grip: the right hand keeps its turn; the left turns onto the axis
      B.handR.getWorldQuaternion(_DR);
      _oR.copy(B.gripR.position).multiplyScalar(s).applyQuaternion(_DR);
      const g = B.gripL.matrixWorld.elements;
      _yL.set(g[4], g[5], g[6]).normalize();
      _q.setFromUnitVectors(_yL, _Y);
      B.handL.getWorldQuaternion(_DL); _DL.premultiply(_q);
      _oL.copy(B.gripL.position).multiplyScalar(s).applyQuaternion(_DL);
      L.arm.getWorldPosition(_SL); R.arm.getWorldPosition(_SR);
      const reachL = armLength(L.arm, L.elbow, L.hand) * 0.985, reachR = armLength(R.arm, R.elbow, R.hand) * 0.995;
      const okL = (grip, off) => _ThL.copy(grip).addScaledVector(_Y, off * s).sub(_oL).distanceTo(_SL) <= reachL;
      const okR = grip => _ThR.copy(grip).sub(_oR).distanceTo(_SR) <= reachR;
      // 1. the usual spot, or slide along the handle toward the first fist
      let off = staff && STAFF_REST.has(base) ? offRest : offFight, moved = false;
      _R2.copy(_R);
      if (!okL(_R2, off)) {
        let lo = offMin, hi = off;
        if (okL(_R2, lo)) { for (let k = 0; k < 8; k++) { const mid = (lo + hi) / 2; if (okL(_R2, mid)) lo = mid; else hi = mid; } off = lo; }
        else {
          // 2. draw the weapon in toward the front of the chest, as little as both hands need
          const c = chest.matrixWorld.elements;
          _cz.set(c[8], c[9], c[10]).normalize();
          _M.addVectors(_SL, _SR).multiplyScalar(0.5);
          _Q.copy(_M).addScaledVector(_cz, 0.26 * s); _Q.y = THREE.MathUtils.clamp(_R.y, _M.y - 0.35 * s, _M.y + 0.4 * s);
          const at = k => _R2.lerpVectors(_R, _Q, k);
          off = offMin + (off - offMin) * 0.5;
          if (!(okL(at(1), off) && okR(at(1)))) _Q.y = _M.y - 0.15 * s;           // still short: in front of the chest itself
          if (okL(at(1), off) && okR(at(1))) {
            let lo2 = 0, hi2 = 1;
            for (let k = 0; k < 10; k++) { const mid = (lo2 + hi2) / 2; if (okL(at(mid), off) && okR(at(mid))) hi2 = mid; else lo2 = mid; }
            at(hi2); moved = true;
          } else want = 0;                                       // 3. nothing works: the left hand lets go
        }
      }
      w += (want - w) * Math.min(1, dt * 14);
      if (w < 0.01) { w = 0; return; }
      if (moved) {
        // the right fist carries the weapon in; its hand keeps the turn it had, so the blade keeps its angle
        reach(R.arm, R.elbow, R.hand, _ThR.copy(_R2).sub(_oR), w, chest);
        setWorldQuat(R.hand, _DR, w);
        B.gripR.updateWorldMatrix(true, false); B.gripR.getWorldPosition(_R2);
      }
      _T.copy(_R2).addScaledVector(_Y, off * s).sub(_oL);
      reach(L.arm, L.elbow, L.hand, _T, w, chest);
      setWorldQuat(L.hand, _DL, w);                              // the fist turned onto the handle
    },
  };
}
