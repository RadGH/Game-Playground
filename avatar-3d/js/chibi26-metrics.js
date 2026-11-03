// World-space measurements for the Chibi 2.6 fit review. Values are metres.
// This module reads a built actor; it does not mutate the rig or its geometry.
import * as THREE from 'three';

const V = new THREE.Vector3();
function point(actor, bone, offset = [0, 0, 0]) {
  const b = actor.parts?.[bone];
  if (!b) return null;
  return V.set(...offset).applyMatrix4(b.matrixWorld).toArray();
}
function distance(a, b) { return a && b ? new THREE.Vector3(...a).distanceTo(new THREE.Vector3(...b)) : null; }
export function metrics(actor) {
  actor.group.updateMatrixWorld(true);
  const height = actor.metrics?.().totalHeight ?? actor.group.userData.fxHeight ?? null;
  const hip = point(actor, 'hips'), eye = point(actor, 'eyeL');
  const eyeR = point(actor, 'eyeR'), shoulderL = point(actor, 'armL'), shoulderR = point(actor, 'armR');
  const headHeight = actor.parts?.eyeL && actor.parts?.eyeR ? 0.60 * Math.abs(actor.parts.eyeR.position.x - actor.parts.eyeL.position.x) / 0.24 : null;
  const handL = point(actor, 'gripL'), handR = point(actor, 'gripR');
  const footL = point(actor, 'footL'), footR = point(actor, 'footR');
  const sole = p => p && [p[0], 0, p[2]];
  return {
    height,
    headHeight,
    hipHeight: hip?.[1] ?? null,
    seatedHipPoint: hip,
    eyeHeight: eye && eyeR ? (eye[1] + eyeR[1]) / 2 : null,
    shoulderWidth: distance(shoulderL, shoulderR),
    armReach: distance(shoulderL, handL),
    legLength: distance(hip, footL),
    handGripPoints: { left: handL, right: handR },
    footSoles: { left: sole(footL), right: sole(footR) },
  };
}
