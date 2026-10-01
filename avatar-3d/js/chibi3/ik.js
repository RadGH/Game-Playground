// Chibi 3 inverse kinematics: two-bone limbs (legs to the ground, the off hand onto a haft) and
// world-space rotation helpers. Allocation-free after module load.

import * as THREE from 'three';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _t = new THREE.Vector3();
const _u = new THREE.Vector3(), _v = new THREE.Vector3(), _axis = new THREE.Vector3();
const _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _pqi = new THREE.Quaternion();
const _sp = new THREE.Vector3(), _ss = new THREE.Vector3();
/**
 * World position / rotation read straight from matrixWorld. three's own world getters first re-walk
 * every parent, which made a spring chain O(depth^2) per frame; the callers here keep the matrices
 * current themselves.
 */
export const wpos = (o, v) => v.setFromMatrixPosition(o.matrixWorld);
export const wquat = (o, q) => { o.matrixWorld.decompose(_sp, q, _ss); return q; };

/** Rotate `bone` by the WORLD-space rotation `qWorld` (pivot = the bone's own joint). */
export function rotateWorld(bone, qWorld) {
  wquat(bone.parent, _pq);
  _pqi.copy(_pq).invert();
  // local' = P^-1 * qW * P * local
  bone.quaternion.premultiply(_pq).premultiply(qWorld).premultiply(_pqi);
}

/** Turn `bone` so the direction from its joint to `from` (world) points at `to` (world), scaled by w. */
export function aimWorld(bone, from, to, w = 1) {
  wpos(bone, _a);
  _u.subVectors(from, _a); _v.subVectors(to, _a);
  if (_u.lengthSq() < 1e-10 || _v.lengthSq() < 1e-10) return;
  _q.setFromUnitVectors(_u.normalize(), _v.normalize());
  if (w < 1) _q.slerp(QI, 1 - w);
  rotateWorld(bone, _q);
}
const QI = new THREE.Quaternion();

/**
 * Two-bone IK: rotate `upper` and `mid` so the joint of `end` lands on `target` (world).
 * `pole` (world point) is the side the middle joint should bend toward; `w` blends the result.
 * Updates the matrices of the chain afterwards.
 */
export function twoBone(upper, mid, end, target, pole, w = 1) {
  if (w <= 0.001) return;
  wpos(upper, _a); wpos(mid, _b); wpos(end, _c);
  const la = _a.distanceTo(_b), lb = _b.distanceTo(_c);
  _t.copy(target);
  if (w < 1) _t.lerpVectors(_c, target, w);
  const dist = Math.min(la + lb - 1e-4, Math.max(Math.abs(la - lb) + 1e-4, _a.distanceTo(_t)));
  // 1) bend the middle joint to make the chain the right length
  const cur = Math.acos(THREE.MathUtils.clamp(_u.subVectors(_a, _b).normalize().dot(_v.subVectors(_c, _b).normalize()), -1, 1));
  const want = Math.acos(THREE.MathUtils.clamp((la * la + lb * lb - dist * dist) / (2 * la * lb), -1, 1));
  _axis.crossVectors(_u, _v);
  if (_axis.lengthSq() < 1e-10) {
    // straight limb: bend toward the pole
    _axis.subVectors(pole, _b).cross(_u);
    if (_axis.lengthSq() < 1e-10) _axis.set(1, 0, 0);
  }
  _axis.normalize();
  _q.setFromAxisAngle(_axis, cur - want);
  rotateWorld(mid, _q);
  mid.updateMatrixWorld(true);
  // 2) swing the upper bone so the end lands on the target
  wpos(end, _c);
  aimWorld(upper, _c, _t, 1);
  upper.updateMatrixWorld(true);
  // 3) twist about the root->target axis so the middle joint faces the pole
  if (pole) {
    wpos(mid, _b); wpos(upper, _a);
    _axis.subVectors(_t, _a).normalize();
    _u.subVectors(_b, _a); _u.addScaledVector(_axis, -_u.dot(_axis));
    _v.subVectors(pole, _a); _v.addScaledVector(_axis, -_v.dot(_axis));
    if (_u.lengthSq() > 1e-8 && _v.lengthSq() > 1e-8) {
      _q.setFromUnitVectors(_u.normalize(), _v.normalize());
      rotateWorld(upper, _q);
      upper.updateMatrixWorld(true);
    }
  }
}
