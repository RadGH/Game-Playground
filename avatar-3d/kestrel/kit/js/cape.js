// Kestrel kit — capes (and long hems) that never go into the ground or through the seat (Thousandvale batch 5,
// 2026-10-28).
//
// THE PROBLEM. A Chibi cape (gear-bridge.js) hangs from the shoulders and rides the torso bones (over a robe: the skirt
// bones), with a little of its tail on the thighs so a stride does not drive the legs through it. Sit down and the torso
// drops ~0.75 m while the cape keeps hanging from the shoulders: its tail went through the seat, the saddle or the ground
// (a travel cloak 26 cm into the ground on `sitGround`, 45 cm under the seat on `sit`).
//
// THE FIX (no extra draw call):
//   * Over no skirt: two CAPE BONES, `capeA` (child of hips, at the small of the back) and `capeB` (child of capeA, at the
//     seat) — rig.js adds them for a look with a long cape (kestrel.js longCape) and no skirt bones (64 + 2 = 66). They
//     rest unrotated, so the bind pose and every clip that does not drive them are unchanged. `capeWeights`: below the
//     small of the back the cape's TORSO share hands over to capeA, below the seat to capeB, on the back panel only (the
//     sides and the front strips keep the torso). The thigh share (gear-bridge.js) is left alone.
//   * Over a skirt (a robe, a tunic to the seat, a coat): the cape already rides the SKIRT bones (as the robe under it
//     does), and the 70-bone ceiling leaves no room for more — so the skirt bones are what is lifted.
//   * `driveSeatClip(clip, rig, sample)` runs once per baked SEATED clip (sit, sitGround, sitHold, ride, rideGallop, boat;
//     kestrel.js clipFor), after the skirt drive: for every frame it poses a private copy of the rig from the clip's own
//     tracks, skins a sample of the vertices that hang on those bones (the cape's, the skirt's) on the CPU with their real
//     weights, and turns the bones out by the smallest angle for which every sample is above the ground and every sample
//     BEHIND the body is above the seat (the seat = the bottom of the buttocks: the hips bone less hips-to-crotch, plus a
//     little): capeB by θ and capeA by 0.3 θ (the cape folds at the seat and its tail lies back over the bench, the saddle
//     or the grass), or each skirt bone a little further out than the legs already asked for (`tiltQuat`, so the leg rule
//     still holds: more tilt only takes the cloth further from the legs).
import * as THREE from 'three';
import { createRig } from './rig.js';
import { SKIRT_N, tiltQuat } from './skirt.js';

export const CAPE_BONES = ['capeA', 'capeB'];
/** Clips in which the seat rule is driven (everything else keeps the bones as the clip / the skirt drive left them). */
export const CAPE_DRIVEN = new Set(['sit', 'sitGround', 'sitHold', 'ride', 'rideGallop', 'boat']);
const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const TORSO = new Set(['hips', 'spine', 'chest', 'root']);
const TOL = 0.002;

/** Heights (bind, m) where the cape hands over: capeA's and capeB's pivots. */
export const capePivots = P => ({ a: P.hipsY, b: P.crotchY - 0.03 * P.k });
/** How far below the hips bone the seat is (the bottom of the buttocks), m. */
export const seatDrop = P => (P.hipsY - P.crotchY) + 0.035 * P.k;

/**
 * Weights of a cape vertex at bind height `y`, angle `th` round the torso (0 = front): its torso share moves onto the cape
 * bones below the small of the back, on the back panel. `w` = [[bone, weight], …] as gear-bridge.js built it.
 */
export function capeWeights(w, y, th, P) {
  const piv = capePivots(P), k = P.k;
  const back = sm(-0.05, -0.45, Math.cos(th));
  const wA = back * sm(piv.a + 0.04 * k, piv.a - 0.08 * k, y), wB = back * sm(piv.b + 0.03 * k, piv.b - 0.08 * k, y);
  if (wA <= 1e-4) return w;
  let T = 0; const out = [];
  for (const [b, x] of w) { if (TORSO.has(b)) { T += x; out.push([b, x * (1 - wA)]); } else out.push([b, x]); }
  if (T <= 1e-6) return w;
  if (wA - wB > 1e-5) out.push(['capeA', T * (wA - wB)]);
  if (wB > 1e-5) out.push(['capeB', T * wB]);
  return out;
}

/** The bones the seat rule turns for this rig: the cape bones, else the skirt bones, else none. */
const driven = rig => rig.byName.capeA ? CAPE_BONES : rig.byName.skirt0 ? Array.from({ length: SKIRT_N }, (_, k) => 'skirt' + k) : null;

/**
 * A sample for the drive: up to `max` vertices that hang on the driven bones (> 12 %), lowest first, each with its bind
 * position, its four bone indices and weights and which driven bone it hangs on most (`dom`). `geometry` = a template's
 * LOD 0 geometry, `rig` its rig. Null when there is nothing to drive.
 */
export function seatSampleOf(geometry, rig, max = 240) {
  const names = driven(rig);
  if (!names || !geometry) return null;
  const ids = names.map(n => rig.index[n]);
  const A = geometry.attributes, p = A.position.array, si = A.skinIndex.array, sw = A.skinWeight.array, nv = p.length / 3;
  const hung = [], domOf = new Map();
  for (let v = 0; v < nv; v++) {
    let c = 0, best = -1, bw = 0;
    for (let k = 0; k < 4; k++) { const j = ids.indexOf(si[v * 4 + k]); if (j < 0) continue; const w = sw[v * 4 + k]; c += w; if (w > bw) { bw = w; best = j; } }
    if (c > 0.12) { hung.push(v); domOf.set(v, best); }
  }
  if (!hung.length) return null;
  hung.sort((a, b) => p[a * 3 + 1] - p[b * 3 + 1]);
  const half = max >> 1;
  const pick = hung.length <= max ? hung : [...hung.slice(0, half), ...Array.from({ length: half }, (_, i) => hung[half + Math.floor(i * (hung.length - half) / half)])];
  const n = pick.length, pos = new Float32Array(n * 3), idx = new Uint16Array(n * 4), wt = new Float32Array(n * 4), dom = new Int8Array(n);
  pick.forEach((v, i) => { pos.set(p.subarray(v * 3, v * 3 + 3), i * 3); idx.set(si.subarray(v * 4, v * 4 + 4), i * 4); wt.set(sw.subarray(v * 4, v * 4 + 4), i * 4); dom[i] = domOf.get(v); });
  return { n, pos, idx, wt, dom, bones: names };
}

const copies = new WeakMap();
const twin = rig => { let r = copies.get(rig); if (!r) { r = createRig(rig.P, rig.face, rig.hands); copies.set(rig, r); } return r; };
const AX = new THREE.Vector3(1, 0, 0);

/** Skinning matrix (world × inverse bind; bind = a translation to the rest world position) into `M` at bone slot `j`. */
function put(M, j, e, w) {
  const o = j * 16;
  for (let k = 0; k < 16; k++) M[o + k] = e[k];
  M[o + 12] = e[12] - (e[0] * w[0] + e[4] * w[1] + e[8] * w[2]);
  M[o + 13] = e[13] - (e[1] * w[0] + e[5] * w[1] + e[9] * w[2]);
  M[o + 14] = e[14] - (e[2] * w[0] + e[6] * w[1] + e[10] * w[2]);
}
/** Pose `r` from the clip's interpolants at time t (other bones at rest); skinning matrices into `M`. */
function poseAt(r, ips, t, M) {
  for (const b of r.bones) { b.position.copy(b.userData.rest); b.quaternion.identity(); b.scale.set(1, 1, 1); }
  for (const { bone, prop, ip } of ips) {
    const v = ip.evaluate(t);
    if (prop === 'quaternion') bone.quaternion.set(v[0], v[1], v[2], v[3]).normalize();
    else if (prop === 'position') bone.position.set(v[0], v[1], v[2]);
    else if (prop === 'scale') bone.scale.set(v[0], v[1], v[2]);
  }
  r.root.updateMatrixWorld(true);
  r.bones.forEach((b, i) => put(M, i, b.matrixWorld.elements, b.userData.world));
}

/** Per sample vertex: how far it is below where it may be (m; > 0 = through the ground or the seat). */
function depths(S, M, lim, out) {
  for (let i = 0; i < S.n; i++) {
    const x = S.pos[i * 3], y = S.pos[i * 3 + 1], z = S.pos[i * 3 + 2];
    let ox = 0, oy = 0, oz = 0;
    for (let k = 0; k < 4; k++) {
      const w = S.wt[i * 4 + k]; if (!w) continue;
      const b = S.idx[i * 4 + k] * 16;
      ox += w * (M[b] * x + M[b + 4] * y + M[b + 8] * z + M[b + 12]);
      oy += w * (M[b + 1] * x + M[b + 5] * y + M[b + 9] * z + M[b + 13]);
      oz += w * (M[b + 2] * x + M[b + 6] * y + M[b + 10] * z + M[b + 14]);
    }
    let v = lim.ground - oy;
    if ((ox - lim.hips.x) * lim.fwd.x + (oz - lim.hips.z) * lim.fwd.z < -0.03) v = Math.max(v, lim.seat - oy);
    out[i] = v;
  }
  return out;
}
/**
 * How seated a pose is, 0..1: in the saddle (`ride`, `rideGallop`, `boat`) always; on the ground or a bench by how far the
 * hip joints have come down (from 75 % of their standing height to 45 %) — standing up at the start of `sitGround` the
 * cape hangs below the seat as a cape does. Exported: the tests use the same rule.
 */
export const SADDLE = new Set(['ride', 'rideGallop', 'boat']);
export function seatedness(clipName, hipY, standHipY) { return SADDLE.has(clipName) ? 1 : sm(0.75 * standHipY, 0.45 * standHipY, hipY); }
/** The ground, the seat plane and the hips' heading for the pose in `r` (after poseAt). */
export function seatLimits(r, clipName = '') {
  const h = r.byName.hips, hp = new THREE.Vector3().setFromMatrixPosition(h.matrixWorld);
  const f = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion().setFromRotationMatrix(h.matrixWorld)); f.y = 0;
  if (f.lengthSq() < 1e-6) f.set(0, 0, 1); f.normalize();
  const hipY = (new THREE.Vector3().setFromMatrixPosition(r.byName.legL.matrixWorld).y + new THREE.Vector3().setFromMatrixPosition(r.byName.legR.matrixWorld).y) / 2;
  const sat = seatedness(clipName, hipY, r.byName.legL.userData.world[1]);
  // not seated, no seat: the plane sinks a metre out of the way as the body stands
  return { ground: 0.012 * r.P.k, seat: hp.y - seatDrop(r.P) + 0.01 * r.P.k - (1 - sat), hips: hp, fwd: f, sat };
}

/**
 * A baked clip with the seat rule solved for its cape / skirt bones (replaces their tracks; keeps the skirt's spread).
 * `rig` = the Kestrel rig, `S` = seatSampleOf(...). Returns a new AnimationClip (the same one when there is nothing to do).
 */
export function driveSeatClip(clip, rig, S) {
  if (!S || !CAPE_DRIVEN.has(clip.name)) return clip;
  const r = twin(rig), names = S.bones, cape = names[0] === 'capeA';
  const ips = [];
  for (const t of clip.tracks) {
    const [bn, prop] = t.name.split('.');
    if (!r.byName[bn]) continue;
    ips.push({ bone: r.byName[bn], prop, ip: t.createInterpolant() });
  }
  const times = (clip.tracks.find(t => t.name === 'hips.quaternion') || clip.tracks[0]).times, n = times.length;
  const M = new Float32Array(r.bones.length * 16), D = new Float32Array(S.n);
  const bones = names.map(nm => r.byName[nm]), slot = names.map(nm => r.index[nm]);
  const qv = names.map(() => new Float32Array(n * 4));
  const m1 = new THREE.Matrix4(), m2 = new THREE.Matrix4(), tq = new THREE.Quaternion(), tq2 = new THREE.Quaternion();
  const SIG = ['root', 'hips', 'spine', 'chest', 'legL', 'kneeL', 'legR', 'kneeR'].map(b => r.index[b]);
  let lastSig = null, lastAns = null;
  for (let i = 0; i < n; i++) {
    poseAt(r, ips, times[i], M);
    const hipsW = r.byName.hips.matrixWorld;
    let sig = ''; for (const j of SIG) for (let k = 0; k < 16; k++) sig += Math.round(M[j * 16 + k] * 2000) + ',';
    let ans;
    if (sig === lastSig) ans = lastAns;
    else {
      const lim = seatLimits(r, clip.name);
      if (cape) {
        // capeB by θ, capeA by 0.3 θ: the smallest θ that clears every sample
        const A = bones[0], B = bones[1];
        const set = th => {
          m1.compose(A.userData.rest, tq.setFromAxisAngle(AX, Math.min(0.5, 0.3 * th)), A.scale).premultiply(hipsW); put(M, slot[0], m1.elements, A.userData.world);
          m2.compose(B.userData.rest, tq2.setFromAxisAngle(AX, th), B.scale).premultiply(m1); put(M, slot[1], m2.elements, B.userData.world);
        };
        const worst = th => { set(th); depths(S, M, lim, D); let w = -Infinity; for (let k = 0; k < S.n; k++) if (D[k] > w) w = D[k]; return w; };
        let th = 0;
        if (worst(0) > TOL) {
          let lo = 0, hi = -1;
          for (let t = 0.1; t <= 1.8 + 1e-9; t += 0.1) { if (worst(t) <= TOL) { hi = t; break; } lo = t; }
          if (hi < 0) { let bv = Infinity; for (let t = 0; t <= 1.8 + 1e-9; t += 0.1) { const v = worst(t); if (v < bv) { bv = v; th = t; } } }
          else { for (let it = 0; it < 4; it++) { const mid = (lo + hi) / 2; if (worst(mid) <= TOL) hi = mid; else lo = mid; } th = hi; }
        }
        ans = [tq.setFromAxisAngle(AX, Math.min(0.5, 0.3 * th)).clone(), tq2.setFromAxisAngle(AX, th).clone()];
      } else {
        // each skirt bone a little further out than the legs asked for (tilt angles add: same axis), two passes because
        // a vertex between two bones hangs on both
        const base = bones.map(b => b.quaternion.clone()), extra = new Array(names.length).fill(0);
        const set = (j, d) => { m1.compose(bones[j].userData.rest, tiltQuat(j, d, tq).multiply(base[j]), bones[j].scale).premultiply(hipsW); put(M, slot[j], m1.elements, bones[j].userData.world); };
        const worstOf = j => { depths(S, M, lim, D); let w = -Infinity; for (let k = 0; k < S.n; k++) if (S.dom[k] === j && D[k] > w) w = D[k]; return w; };
        for (let pass = 0; pass < 2; pass++) for (let j = 0; j < names.length; j++) {
          if (worstOf(j) <= TOL) continue;
          let lo = extra[j], hi = -1;
          for (let d = extra[j] + 0.1; d <= 1.4 + 1e-9; d += 0.1) { set(j, d); if (worstOf(j) <= TOL) { hi = d; break; } lo = d; }
          if (hi < 0) hi = 1.4; else for (let it = 0; it < 4; it++) { const mid = (lo + hi) / 2; set(j, mid); if (worstOf(j) <= TOL) hi = mid; else lo = mid; }
          extra[j] = hi; set(j, hi);
        }
        ans = bones.map((b, j) => tiltQuat(j, extra[j], new THREE.Quaternion()).multiply(base[j]));
      }
      lastSig = sig; lastAns = ans;
    }
    ans.forEach((q, j) => qv[j].set([q.x, q.y, q.z, q.w], i * 4));
  }
  const re = new RegExp('^(' + names.join('|') + ')\\.quaternion$');
  const keep = clip.tracks.filter(t => !re.test(t.name));
  names.forEach((nm, j) => keep.push(new THREE.QuaternionKeyframeTrack(nm + '.quaternion', times, qv[j])));
  return new THREE.AnimationClip(clip.name, clip.duration, keep);
}
