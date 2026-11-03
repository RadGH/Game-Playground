// Small 2.6 jaw and mouth controller. The lower face is weighted to `jaw` in the normal merged
// face mesh; a tiny dark mouth insert grows only for open phonemes. No extra draw call is added.
import * as THREE from 'three';

export function addExpressionBones(rig) {
  const H = rig.headScale, head = rig.byName.head;
  const jaw = new THREE.Bone(); jaw.name = 'jaw'; jaw.position.set(0, 0.075 * H, 0);
  jaw.userData.index = rig.bones.length; head.add(jaw); rig.bones.push(jaw); rig.byName.jaw = jaw;
  const mouth = new THREE.Bone(); mouth.name = 'mouth'; mouth.userData.index = rig.bones.length;
  // Fixed bind-space anchor keeps this bone correct on template-cache hits too.
  mouth.position.set(0, 0.02 * H, 0.25 * H); jaw.add(mouth); rig.bones.push(mouth); rig.byName.mouth = mouth;
  rig.expressionRig = { jaw, mouth, H, jawBase: jaw.position.clone(), mouthBase: mouth.position.clone(), eyeBase: {} };
  for (const s of ['L', 'R']) rig.expressionRig.eyeBase[s] = { rotation: rig.byName['eye' + s].rotation.clone(), scaleY: rig.byName['eye' + s].scale.y };
  rig.root.updateMatrixWorld(true);
}

export function faceJawWeights(y, H) {
  const t = THREE.MathUtils.smoothstep(y / H, -0.08, 0.12);
  const jaw = 1 - t;
  return [['head', 1 - jaw], ['jaw', jaw]];
}

const MOOD = {
  neutral: { squint: 0, widen: 0, tilt: 0, open: 0 },
  happy: { squint: 0.28, widen: 0, tilt: 0, open: 0 },
  sad: { squint: 0.05, widen: 0, tilt: -0.04, open: 0.06 },
  angry: { squint: 0.26, widen: 0, tilt: 0.11, open: 0.02 },
  surprised: { squint: 0, widen: 0.22, tilt: 0, open: 0.34 },
  afraid: { squint: 0, widen: 0.14, tilt: 0, open: 0.25 },
  talking: { squint: 0, widen: 0, tilt: 0, open: 0.2 },
};
const MOUTH = {
  closed: { open: 0, width: 1 }, m: { open: 0, width: 0.72 }, b: { open: 0, width: 0.78 },
  f: { open: 0.12, width: 0.76 }, v: { open: 0.15, width: 0.78 }, ee: { open: 0.22, width: 1.22 },
  open: { open: 0.58, width: 1 }, ah: { open: 0.72, width: 1.12 }, o: { open: 0.64, width: 0.72 },
};

export function expressionState() { return { mood: 'neutral', intensity: 0, shape: 'closed', mouthIntensity: 0 }; }
export function setMood(state, mood, intensity = 1) {
  if (!Object.hasOwn(MOOD, mood)) return false;
  state.mood = mood; state.intensity = THREE.MathUtils.clamp(Number(intensity) || 0, 0, 1); return true;
}
export function setMouth(state, shape, intensity = 1) {
  if (!Object.hasOwn(MOUTH, shape)) return false;
  state.shape = shape; state.mouthIntensity = THREE.MathUtils.clamp(Number(intensity) || 0, 0, 1); return true;
}

export function applyExpression(rig, state, dead = false) {
  const x = rig.expressionRig;
  if (!x) return;
  const mood = MOOD[state.mood] || MOOD.neutral, mouth = MOUTH[state.shape] || MOUTH.closed;
  const open = Math.max(mood.open * state.intensity, mouth.open * state.mouthIntensity);
  x.jaw.position.copy(x.jawBase); x.jaw.position.y -= open * 0.004 * x.H;
  x.jaw.rotation.set(open * 0.42, 0, 0);
  x.mouth.position.copy(x.mouthBase);
  x.mouth.scale.set(mouth.width, 1 + open * 14, 1);
  for (const s of ['L', 'R']) {
    const eye = rig.byName['eye' + s], base = x.eyeBase[s];
    eye.rotation.copy(base.rotation); eye.rotation.z += (s === 'L' ? -1 : 1) * mood.tilt * state.intensity;
    eye.scale.y = (dead ? 0.55 : base.scaleY) * (1 - mood.squint * state.intensity + mood.widen * state.intensity);
  }
}
