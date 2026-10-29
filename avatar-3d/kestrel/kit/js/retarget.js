// Kestrel kit — Chibi 2's clips played on the Kestrel rig (Thousandvale batch 1, 2026-10-27).
//
// A game written for Chibi 2 plays ~45 clip names, many of them HOLD-AWARE (the same `attack` is an overhead chop with a
// sword, a thrust with a spear, a shot with a bow; chibi2-motion.js reads `rig.hold`). Writing them again for Kestrel
// would be months; instead every Chibi clip is baked for a Chibi rig with the same look and hold, then converted pose by
// pose onto the Kestrel bones:
//
//   * Both rigs rest with every bone UNROTATED (world-aligned), so a bone's world turn is what a clip says. A Kestrel bone
//     whose rest points somewhere else than Chibi's gets a fixed correction `off`: W_kestrel(b) = W_chibi(b) · off(b), so
//     its local turn is off(parent)⁻¹ · q_chibi(b) · off(b). Arms rest in an A-pose on Kestrel and hang straight on
//     Chibi: off(arm/elbow) turns the Kestrel segment onto "straight down, ABDUCT out" (Kestrel's torso is narrower than
//     its arms are long, so the hands hang a little wider than Chibi's to clear the hips). The hand's `off` maps Chibi's
//     hand axes (+y up the forearm, +z the thumb side) onto the real hand (handLayout d/t/n), so a weapon a clip AIMS
//     with the grip bone points exactly where Chibi points it, with the hilt through the real fist.
//   * Chibi has one spine bone and one neck: its chest turn is shared half and half by Kestrel's spine and chest, its
//     head turn by neck and head. Hips and root move by the leg-length ratio. Legs and feet map one to one.
//   * Two hands on one haft (a polearm, a staff, a two-hander, the lute's neck): Chibi's proportions are not Kestrel's,
//     so the left hand would miss. Wherever Chibi's left grip sits on the right item's axis, the left arm is solved
//     (two-bone IK) to put the Kestrel left grip at the same place on the RESIZED item (hold-scale.js), turned the same.
//   * Fingers: a grip preset round anything held, relaxed otherwise (Chibi has no fingers).
//   * idle / walk / run are hybrids: the kit's own legs, hips and spine (feet planted by IK, a real stride — see
//     `walkTV`/`runTV` in clips.js) with Chibi's arms, so a weapon is carried the way Chibi carries it.
//
//   const clip = retargetClip(krig, chibiRigFor(look), 'attack');
import * as THREE from 'three';
import { createRig as createChibiRig } from '../../../js/chibi2-geometry.js';
import { createClips as createChibiClips, ONE_SHOTS as CHIBI_ONE_SHOTS, HANDS_FREE as CHIBI_HANDS_FREE, CHIBI2_CLIP_SECONDS } from '../../../js/chibi2-motion.js';
import '../../../js/chibi2-motion-dual.js';      // registers dual / angling / standUp
import '../../../js/chibi2-motion-prof.js';      // registers the work loops
import '../../../js/chibi2-motion-rest.js';      // registers swimCrawl / swimTread / sitHold
import { createClips as createKitClips, Pose, helpers } from './clips.js';
import { itemRule, stretchPoint, TOOL_SCALE } from './hold-scale.js';

export const ABDUCT = 0.12;                 // extra arm spread (rad) over Chibi's at rest
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const Qt = () => new THREE.Quaternion();
const I = new THREE.Quaternion();
const SIDES = [['L', -1], ['R', 1]];
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Clip names that are a one-shot / want empty hands, on either system (a Chibi name keeps Chibi's meaning). */
export const isOneShot = name => CHIBI_ONE_SHOTS.has(name);
export const isHandsFree = name => CHIBI_HANDS_FREE.has(name);
/** Every clip a Chibi 2 rig can bake (the built-in ones and everything registered by the opt-in files above). */
export const chibiClipNames = () => Object.keys(CHIBI2_CLIP_SECONDS);
export const chibiClipSeconds = name => CHIBI2_CLIP_SECONDS[name];

/** A Chibi 2 rig for a look (only for baking its clips: proportions, race posture, roundness, hold). */
export function chibiRigFor({ body = {}, race = null, hold = null, heldId = null, stride = null } = {}) {
  const rig = createChibiRig(body, race);
  if (stride) rig.stride = { swing: stride.swing, kick: stride.kick, lift: stride.lift };   // batch 4: Chibi's gaits read it (a robe's shorter step)
  rig.hold = hold || { right: 'none', left: 'none', twoHand: false, dualTwo: false, dual: false };
  rig.heldId = heldId;       // which two-hander it is (a sword's hands meet at the hilt, an axe's spread up the haft)
  rig.v25 = true;            // the 2.5 arm placements (held a little off the chest: Kestrel's ribs are deeper than Chibi 2's)
  return rig;
}

// --------------------------------------------------------------------------------------------- the per-rig mapping
const maps = new WeakMap();
/** The fixed corrections for one Kestrel rig (cached on the rig). */
export function retargetMap(krig) {
  let m = maps.get(krig);
  if (m) return m;
  const W = n => V(...krig.byName[n].userData.world);
  m = { offArm: {}, offElbow: {}, offHand: {}, qB: {}, armDown: {}, legK: 0 };
  for (const [s, sg] of SIDES) {
    const target = V(sg * Math.sin(ABDUCT), -Math.cos(ABDUCT), 0);
    m.offArm[s] = Qt().setFromUnitVectors(W('elbow' + s).sub(W('arm' + s)).normalize(), target);
    m.offElbow[s] = Qt().setFromUnitVectors(W('hand' + s).sub(W('elbow' + s)).normalize(), target);
    m.armDown[s] = target;
    // Chibi hand axes in Kestrel bind space: +y back up the forearm (-d), +z the thumb side (t), +x = y × z
    const H = krig.hands[s], y = V(...H.d).negate().normalize();
    const z = V(...H.t); z.addScaledVector(y, -z.dot(y)).normalize();
    const x = V().crossVectors(y, z);
    m.qB[s] = Qt().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    m.offHand[s] = m.qB[s].clone().invert();
  }
  m.legK = W('legR').y - W('footR').y;
  maps.set(krig, m);
  return m;
}

// --------------------------------------------------------------------------------------------- reading a Chibi clip
function readClip(clip) {
  const q = {}, v = {};
  let times = null;
  for (const t of clip.tracks) {
    const [bone, prop] = t.name.split('.');
    times ||= t.times;
    if (prop === 'quaternion') q[bone] = t.values; else (v[bone] ||= {})[prop] = t.values;
  }
  return { q, v, times };
}
const quatAt = (arr, i, out) => arr ? out.set(arr[i * 4], arr[i * 4 + 1], arr[i * 4 + 2], arr[i * 4 + 3]) : out.identity();

/** Chibi world matrices for the bones on the way to both grips (frame i). */
function chibiWorld(crig, R, i) {
  const out = {}, m = new THREE.Matrix4(), q = Qt(), p = V(), one = V(1, 1, 1);
  for (const b of crig.bones) {
    if (!/^(root|hips|chest|head|arm|elbow|hand|grip)/.test(b.name)) continue;
    quatAt(R.q[b.name], i, q);
    p.copy(b.position);
    const pv = R.v[b.name]?.position;
    if (pv) p.set(pv[i * 3], pv[i * 3 + 1], pv[i * 3 + 2]);
    m.compose(p, q, one);
    out[b.name] = b.parent && b.parent.isBone ? out[b.parent.name].clone().multiply(m) : m.clone();
  }
  return out;
}

// --------------------------------------------------------------------------------------------- fingers
const TOOL_R = /^(prof|fish)/;
function fingerPlan(name, hold, gripScale) {
  const plan = {};
  for (const [s] of SIDES) {
    const kind = s === 'R' ? hold.right : hold.left;
    let f = 'relaxed';
    if (kind && kind !== 'none' && gripScale[s] > 0.5) f = kind === 'bow' ? 'bow' : 'grip';
    if (s === 'R' && TOOL_R.test(name) && name !== 'profGather') f = 'grip';      // the game's own tool / rod is in this hand
    if (s === 'L' && name === 'fishShow') f = 'grip';
    if (name === 'wave' && s === 'R') f = 'open';
    if (name === 'point' && s === 'R') f = 'point';
    if (name === 'cheer' || name === 'dance') f = 'open';
    plan[s] = f;
  }
  return plan;
}

// --------------------------------------------------------------------------------------------- the conversion
/** How both hands share the right-hand item: 'haft' (a two-hander: the left fist goes ON the haft), 'rel' (the lute:
 *  the left hand keeps Chibi's place on the neck), or null. */
const twoHandMode = h => !h || h.dualTwo ? null : h.twoHand ? 'haft' : h.right === 'lute' && (h.left || 'none') === 'none' ? 'rel' : null;
const SWIM = new Set(['swim', 'swimBack', 'swimSide', 'swimCrawl', 'swimTread']);
const NO_FLOOR = new Set([...SWIM, 'ride', 'rideGallop', 'boat', 'sit']);

/**
 * One Chibi clip as a Kestrel clip. `krig` = the Kestrel rig (kit rig.js createRig); `crig` = chibiRigFor(...).
 * `bones` limits which Kestrel bones get tracks (null = every body bone).
 */
export function retargetClip(krig, crig, name, { bones = null } = {}) {
  const chibiClip = createChibiClips(crig, [name])[0];
  const R = readClip(chibiClip), n = R.times.length;
  const M = retargetMap(krig), B = krig.byName, hold = crig.hold;
  const ratio = M.legK / crig.leg;
  const restC = crig.byName.hips.position.y, hipsRest = B.hips.userData.rest;
  const keyed = krig.bones.filter(b => !/^(jaw|lip|mouth|eye|pupil|lid|brow|cheek|hair)/.test(b.name) && (!bones || bones.has(b.name)));
  const Q = new Pose(krig), H = helpers(krig);
  const qv = keyed.map(() => new Float32Array(n * 4)), hv = new Float32Array(n * 3), rv = new Float32Array(n * 3);
  const sv = { L: new Float32Array(n * 3), R: new Float32Array(n * 3) };
  const qc = {}, tmp = Qt(), tmp2 = Qt();
  const both = isHandsFree(name) ? null : twoHandMode(hold), rule = itemRule(hold.right);
  const floor = P_floor(krig), swim = SWIM.has(name), noFloor = NO_FLOOR.has(name);
  const get = bn => quatAt(R.q[bn], 0, qc[bn] ||= Qt());
  // batch 5: a sit fits its ankle targets to this body once, on the clip's last (fully seated) frame
  if (CROSS_SIT[name] && !CROSS_FIT.has(krig)) {
    const j = n - 1, c = bn => quatAt(R.q[bn], j, qc[bn] ||= Qt()), hp = R.v.hips?.position;
    Q.reset(); Q.set('root', c('root')); Q.set('hips', c('hips'));
    if (hp) Q.hips(hp[j * 3] * ratio, (hp[j * 3 + 1] - restC) * ratio, hp[j * 3 + 2] * ratio);
    CROSS_FIT.set(krig, fitCross(Q, krig));
  }
  for (let i = 0; i < n; i++) {
    Q.reset();
    const c = bn => quatAt(R.q[bn], i, qc[bn] ||= Qt());
    Q.set('root', c('root'));
    Q.set('hips', c('hips'));
    const ch = Qt().slerpQuaternions(I, c('chest'), 0.5), hd = Qt().slerpQuaternions(I, c('head'), 0.5);
    Q.set('spine', ch).set('chest', ch).set('neck', hd).set('head', hd);
    const gripScale = {};
    for (const [s, sg] of SIDES) {
      // the upper arm, with the clavicle riding up as the arm rises above the shoulder
      const armW = c('arm' + s).clone().multiply(M.offArm[s]);
      const up = M.armDown[s].clone().applyQuaternion(c('arm' + s)).y;
      const clav = Qt().setFromAxisAngle(V(0, 0, 1), sg * 0.24 * smooth(-0.35, 0.95, up));
      Q.set('clav' + s, clav);
      Q.set('arm' + s, clav.clone().invert().multiply(armW));
      Q.set('elbow' + s, M.offArm[s].clone().invert().multiply(c('elbow' + s)).multiply(M.offElbow[s]));
      Q.set('hand' + s, M.offElbow[s].clone().invert().multiply(c('hand' + s)).multiply(M.offHand[s]));
      Q.set('grip' + s, M.qB[s].clone().multiply(c('grip' + s)).multiply(M.offHand[s]));
      for (const lb of ['leg', 'knee', 'foot']) Q.set(lb + s, c(lb + s));
      const g = R.v['grip' + s]?.scale;
      gripScale[s] = g ? g[i * 3] : 1;
      sv[s].set([gripScale[s], gripScale[s], gripScale[s]], i * 3);
    }
    const hp = R.v.hips?.position, rp = R.v.root?.position;
    if (hp) Q.hips((hp[i * 3]) * ratio, (hp[i * 3 + 1] - restC) * ratio, (hp[i * 3 + 2]) * ratio);
    const root = rp ? V(rp[i * 3] * ratio, rp[i * 3 + 1] * ratio, rp[i * 3 + 2] * ratio) : V();
    // swimming: the game puts the feet a fixed depth under the surface for Chibi's body, so the Kestrel body is lifted to
    // where Chibi's is (its neck at Chibi's head bone), not by the leg ratio, or it would swim half out of the water
    if (swim) {
      const Wc = chibiWorld(crig, R, i), hy = V().setFromMatrixPosition(Wc.head).y;
      root.y += hy - (V().setFromMatrixPosition(Q.world('neck')).y + root.y);
    }
    // two hands on one haft
    if (both && gripScale.R > 0.5) twoHandFix(Q, krig, crig, R, i, M, rule, both);
    // batch 5: sitting on the ground cross-legged (Chibi's thighs swing inward, which on Kestrel's narrow hips and long
    // thighs crossed them — the left knee ended up right of centre): the legs are solved again, knees out, ankles crossed
    if (CROSS_SIT[name]) crossLegs(Q, krig, CROSS_SIT[name](R.times[i] / chibiClip.duration));
    // batch 5: a pick or an axe swung with BOTH hands (Chibi's work loops hold it in the right and lift the left)
    if (TOOL_SWING[name]) toolSwing(Q, krig, name, R.times[i] / chibiClip.duration);
    // feet never under the ground (Chibi's short shins hid it; sitting and kneeling put Kestrel's through the floor)
    if (!noFloor) for (const [s] of SIDES) {
      const fw = Q.world('foot' + s), fy = V().setFromMatrixPosition(fw).y + root.y;
      if (fy >= floor) continue;
      const ft = V().setFromMatrixPosition(fw); ft.y += floor - fy;
      const fq = Qt(); fw.decompose(V(), fq, V());
      const kn = V().setFromMatrixPosition(Q.world('knee' + s)), lg = V().setFromMatrixPosition(Q.world('leg' + s));
      const pole = kn.sub(lg), along = ft.clone().sub(lg).normalize(); pole.addScaledVector(along, -pole.dot(along));
      Q.ik('leg' + s, 'knee' + s, 'foot' + s, ft, pole.lengthSq() > 1e-6 ? pole.normalize() : V(0, 0, 1));
      Q.worldRot('foot' + s, fq);
    }
    // fingers last (children of the hands: independent of the IK)
    const fp = fingerPlan(name, hold, gripScale);
    if (TOOL_SWING[name]) fp.L = 'grip';      // batch 5: the off hand is on the haft too
    for (const [s] of SIDES) H.fingers(Q, s, fp[s]);
    keyed.forEach((b, j) => { const q = Q.q.get(b.name) || I; tmp.copy(q).normalize(); qv[j].set([tmp.x, tmp.y, tmp.z, tmp.w], i * 4); });
    hv.set([hipsRest.x + Q.hipOff.x, hipsRest.y + Q.hipOff.y, hipsRest.z + Q.hipOff.z], i * 3);
    rv.set([root.x, root.y, root.z], i * 3);
  }
  void get; void tmp2;
  for (const arr of qv) for (let i = 4; i < arr.length; i += 4) {
    if (arr[i] * arr[i - 4] + arr[i + 1] * arr[i - 3] + arr[i + 2] * arr[i - 2] + arr[i + 3] * arr[i - 1] < 0) for (let k = 0; k < 4; k++) arr[i + k] = -arr[i + k];
  }
  const tracks = keyed.map((b, j) => new THREE.QuaternionKeyframeTrack(b.name + '.quaternion', R.times, qv[j]));
  if (!bones || bones.has('hips')) tracks.push(new THREE.VectorKeyframeTrack('hips.position', R.times, hv));
  if (!bones || bones.has('root')) tracks.push(new THREE.VectorKeyframeTrack('root.position', R.times, rv));
  for (const [s] of SIDES) if (!bones || bones.has('grip' + s)) tracks.push(new THREE.VectorKeyframeTrack('grip' + s + '.scale', R.times, sv[s]));
  return new THREE.AnimationClip(name, chibiClip.duration, tracks);
}

/** The ankle may not go below this (bind ankle height, a little under for a rolled foot). */
const P_floor = krig => krig.byName.footR.userData.world[1] * 0.8;
/**
 * The Kestrel left grip onto the right-hand item. 'haft': Chibi's left fist is only NEAR a two-hander's haft (its fists
 * are balls; in `ready` it sits 27 cm off it), so while it is within reach it is put ON the haft — a sword's at the
 * pommel end of the hilt, an axe's or a halberd's further up — turned like the right fist. 'rel': exactly where Chibi
 * has it (the lute's neck), resized.
 */
function twoHandFix(Q, krig, crig, R, i, M, rule, mode) {
  const Wc = chibiWorld(crig, R, i);
  const rel = Wc.gripR.clone().invert().multiply(Wc.gripL);
  const rp = V().setFromMatrixPosition(rel), rq = Qt().setFromRotationMatrix(rel);
  const off = Math.hypot(rp.x, rp.z);
  let w = 1;
  if (mode === 'haft') {
    w = 1 - smooth(0.45, 0.75, off);
    if (w <= 0.001 || Math.abs(rp.y) > 1.2) return;
    const sword = /sword|blade|katana|claymore/.test(String(crig.heldId || ''));
    const [lo, hi] = sword ? [0.09, 0.1] : crig.hold.right === 'heavy' ? [0.2, 0.34] : [0.24, 0.5];
    const sy = sword ? 1 : (rp.y < 0 ? -1 : 1);
    rp.set(0, sy * Math.max(lo, Math.min(hi, Math.abs(rp.y))), 0);
    rq.identity();
  }
  const before = ['armL', 'elbowL', 'handL'].map(b => (Q.q.get(b) || I).clone());
  // the Chibi grip frame in Kestrel world = gripR bone world · B_R
  const WgR = Q.world('gripR'), frameR = WgR.clone().multiply(new THREE.Matrix4().makeRotationFromQuaternion(M.qB.R));
  const p = stretchPoint(rule, rp.x, rp.y, rp.z);
  const target = V(...p).applyMatrix4(frameR);
  const qFrameR = Qt().setFromRotationMatrix(frameR);
  const gripLWorld = qFrameR.clone().multiply(rq).multiply(M.offHand.L);          // bone gripL world rotation
  const handLWorld = gripLWorld.clone().multiply((Q.q.get('gripL') || I).clone().invert());
  const gOff = krig.byName.gripL.userData.rest.clone().applyQuaternion(handLWorld);
  let wrist = target.clone().sub(gOff);
  const sh = V().setFromMatrixPosition(Q.world('armL')), el = V().setFromMatrixPosition(Q.world('elbowL'));
  // out of the left arm's reach (Kestrel's arms are shorter for its shoulders than Chibi's): bring the item — the right
  // hand with it — that much nearer the left shoulder, turned as it was
  const reach = (krig.byName.elbowL.userData.rest.length() + krig.byName.handL.userData.rest.length()) * 0.96;
  const short = wrist.distanceTo(sh) - reach;
  if (short > 0) {
    const shift = sh.clone().sub(wrist).normalize().multiplyScalar(short);
    const hR = Q.world('handR'), hRq = Qt(); hR.decompose(V(), hRq, V());
    const hRp = V().setFromMatrixPosition(hR).add(shift);
    const shR = V().setFromMatrixPosition(Q.world('armR')), elR = V().setFromMatrixPosition(Q.world('elbowR'));
    const poleR = elR.sub(shR), alR = hRp.clone().sub(shR).normalize(); poleR.addScaledVector(alR, -poleR.dot(alR));
    Q.ik('armR', 'elbowR', 'handR', hRp, poleR.lengthSq() > 1e-6 ? poleR.normalize() : V(1, -0.4, -0.3));
    Q.worldRot('handR', hRq);
    wrist = wrist.add(shift);
  }
  const pole = el.clone().sub(sh);
  const along = wrist.clone().sub(sh).normalize();
  pole.addScaledVector(along, -pole.dot(along));
  if (pole.lengthSq() < 1e-6) pole.set(-1, -0.4, -0.3);
  Q.ik('armL', 'elbowL', 'handL', wrist, pole.normalize());
  Q.worldRot('handL', handLWorld);
  if (w < 0.999) ['armL', 'elbowL', 'handL'].forEach((b, k) => Q.get(b).slerpQuaternions(before[k], Q.get(b).clone(), w));
  return w;
}

// --------------------------------------------------------------------------------------------- batch 5: sitting cross-legged
/** Clips that sit on the ground, and how far into the sit each moment is (Chibi's ease: sitGround gets down over 35 %). */
export const CROSS_SIT = { sitGround: u => smooth(0, 0.35, u), sitHold: () => 1 };
/**
 * A tailor's sit: knees out to the sides, the shins crossed in front with the RIGHT ankle in front of the left shin (so the
 * two never meet), each foot on its outer edge under the other knee. Ankle targets are in the hips' heading, relative to
 * the middle of the hip joints, at the floor; the knees are left to the IK, bent outward and up. `k` moves the ankles from
 * where the retargeted Chibi clip has them (standing, at the start of the sit) to the sit.
 */
export const CROSS_LEGS = { ankleX: 0.04, ankleZ: { L: 0.22, R: 0.42 }, ankleY: { L: 0, R: 0.05 }, pole: [1, 0.4, 0.3], yaw: 1.15, roll: 0.95 };
/** The limbs' radii for the clearance rule (bind, m): thigh / shin / foot at this body's girth (clothes included). */
const limbR = P => ({ thigh: 0.1 * P.W * P.k, shin: 0.08 * P.W * P.k, foot: 0.054 * Math.sqrt(P.W) * P.k });
const CROSS_FIT = new WeakMap();      // Kestrel rig → the ankle targets that keep this body's legs apart
/**
 * The sit's ankle targets for one body: the nominal CROSS_LEGS place, then a small search (how far across, how far
 * forward each ankle, how high the front one rests on the other, how high the knees ride) for the one whose legs are
 * furthest apart — every pair of segments (thigh, shin, foot of one leg against the other's) at least the two limbs'
 * radii apart (`limbR`: a dwarf's thicker legs need more room). Pose-independent apart from the hips: run once per rig on
 * the clip's full-sit frame (retargetClip does), cached.
 */
function fitCross(Q, krig) {
  const P = krig.P, kk = P.k, R = limbR(P), base = CROSS_LEGS;
  let best = null;
  for (const ax of [0, 0.04, 0.08]) for (const zl of [0.1, 0.16, 0.22, 0.28]) for (const zr of [0.36, 0.42, 0.48, 0.54]) for (const hr of [0, 0.05, 0.1]) for (const up of [0.4, 0.8]) {
    const C = { ...base, ankleX: ax, ankleZ: { L: zl, R: zr }, ankleY: { L: 0, R: hr }, pole: [1, up, 0.3] };
    crossLegsWith(Q, krig, 1, C);
    const seg = (s, a, b) => [V().setFromMatrixPosition(Q.world(a + s)), V().setFromMatrixPosition(Q.world(b + s))];
    const L = { thigh: seg('L', 'leg', 'knee'), shin: seg('L', 'knee', 'foot'), foot: seg('L', 'foot', 'toe') };
    const Rr = { thigh: seg('R', 'leg', 'knee'), shin: seg('R', 'knee', 'foot'), foot: seg('R', 'foot', 'toe') };
    let margin = Infinity;
    for (const a of ['thigh', 'shin', 'foot']) for (const b of ['thigh', 'shin', 'foot']) if (a !== 'thigh' || b !== 'thigh') margin = Math.min(margin, segGap(L[a], Rr[b]) - (R[a] + R[b]));
    // the knees must stay on their own sides, well out (that was the bug); a little preference for the nominal place
    const kneeOut = Math.min(-L.shin[0].x, Rr.shin[0].x);
    // the nearest to the nominal sit that clears by a centimetre (knees out); failing that, the one that clears most
    const ok = margin >= 0.01 * kk && kneeOut >= 0.15 * kk;
    const dist = Math.abs(ax - base.ankleX) + Math.abs(zl - base.ankleZ.L) + Math.abs(zr - base.ankleZ.R) + Math.abs(hr - (base.ankleY?.R || 0)) + Math.abs(up - base.pole[1]) * 0.25;
    const score = ok ? 10 - dist : margin + Math.min(0, kneeOut - 0.15 * kk);
    if (!best || score > best.score) best = { score, margin, C };
  }
  return best;
}
function crossLegs(Q, krig, k) {
  if (!(k > 0.001)) return;
  const fit = CROSS_FIT.get(krig);
  crossLegsWith(Q, krig, k, fit?.C || CROSS_LEGS);
}
/** Exported for the tests: the fitted sit for a rig (null before a sit clip has been baked for it). */
export const crossFitOf = krig => CROSS_FIT.get(krig) || null;
function crossLegsWith(Q, krig, k, C) {
  const P = krig.P, kk = P.k;
  // heading only (the pelvis may tip in the clip; the feet stay flat on the floor)
  const hq = Q.worldQuat('hips'), fwd = V(0, 0, 1).applyQuaternion(hq); fwd.y = 0;
  const yaw = fwd.lengthSq() > 1e-6 ? Math.atan2(fwd.x, fwd.z) : 0, qy = Qt().setFromAxisAngle(V(0, 1, 0), yaw);
  const hL = V().setFromMatrixPosition(Q.world('legL')), hR = V().setFromMatrixPosition(Q.world('legR'));
  const mid = hL.clone().add(hR).multiplyScalar(0.5);
  const floor = P_floor(krig) + 0.008 * kk;
  const side = {};
  for (const [s, sg] of SIDES) {
    // where the retargeted clip has the ankle and the foot (the start of the sit), and where the sit wants them
    const fw = Q.world('foot' + s), from = V().setFromMatrixPosition(fw), fromQ = Qt(); fw.decompose(V(), fromQ, V());
    const kneeFrom = V().setFromMatrixPosition(Q.world('knee' + s)).sub(V().setFromMatrixPosition(Q.world('leg' + s)));
    // the left ankle goes over to the right (+x) and the right one to the left: crossed, the right in front
    const off = V(-sg * C.ankleX * kk, 0, C.ankleZ[s] * kk).applyQuaternion(qy);
    // forward first, across later: the ankles are already one behind the other when they pass (they never meet)
    const kz = smooth(0, 0.6, k), kx = smooth(0.3, 1, k);
    const lift = (C.ankleY?.[s] || 0) * kk;
    const target = V(from.x + (mid.x + off.x - from.x) * kx, from.y + (floor + lift - from.y) * k, from.z + (mid.z + off.z - from.z) * kz);
    target.y = Math.max(target.y, floor);
    const pole = V(sg * C.pole[0], C.pole[1], C.pole[2]).normalize().applyQuaternion(qy).lerp(kneeFrom.normalize(), (1 - k) * 0.6).normalize();
    // the foot points across (toward the other side) and lies on its outer edge
    const fq = qy.clone().multiply(Qt().setFromAxisAngle(V(0, 1, 0), -sg * C.yaw)).multiply(Qt().setFromAxisAngle(V(0, 0, 1), -sg * C.roll));
    const footQ = fromQ.slerp(fq, kx);
    for (let pass = 0; pass < 2; pass++) {
      Q.ik('leg' + s, 'knee' + s, 'foot' + s, target, pole);
      Q.worldRot('foot' + s, footQ);
      // a toe turned down on the way into the sit lifts the ankle with it (never under the floor)
      const toeY = V().setFromMatrixPosition(Q.world('toe' + s)).y;
      if (toeY >= 0.006 * kk) break;
      target.y += 0.006 * kk - toeY;
    }
  }
}
/** Closest distance between two segments [[p, q], [p, q]]. */
function segGap([p1, q1], [p2, q2]) {
  const d1 = q1.clone().sub(p1), d2 = q2.clone().sub(p2), r = p1.clone().sub(p2);
  const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r), c = d1.dot(r), b = d1.dot(d2), den = a * e - b * b;
  let s = den > 1e-9 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0, t = e > 1e-12 ? (b * s + f) / e : 0;
  if (t < 0) { t = 0; s = a > 1e-12 ? Math.min(1, Math.max(0, -c / a)) : 0; } else if (t > 1) { t = 1; s = a > 1e-12 ? Math.min(1, Math.max(0, (b - c) / a)) : 0; }
  return p1.clone().addScaledVector(d1, s).distanceTo(p2.clone().addScaledVector(d2, t));
}

// --------------------------------------------------------------------------------------------- batch 5: two-handed tools
// The game hangs its pick / hatchet on the RIGHT hand frame (prof-view.js, chibi2-motion-prof.js PROF_TOOL_MOUNT): grip at
// the tool's origin, haft out of the thumb side. Chibi swings it one-handed with the left fist up near it. Here the right
// fist carries the tool along a swing path (keys in the chest's frame for the overhead pick, so the trunk folding into the
// blow carries it; in the body's heading — the root's, not the hips', which the clip twists — for the flat axe swing), and the LEFT fist goes ON the haft: high up the handle at
// the top of the swing, sliding down to the right fist as the blow lands — as a real two-handed swing does. Wherever the
// left arm cannot reach that far up the haft it takes the furthest point it can reach (never past the right fist), and
// if it cannot reach the haft at all the whole tool comes that much nearer the left shoulder.
//
// key: rho 0 = the blow lands, 0.25 = held low in front, 1 = the top of the back-swing. g = the right fist (m from the
// middle of the shoulders, at base scale), a = the haft (toward the head), s = the left fist's place along the haft
// (tool units, the game's tool is modelled that long: the pick's haft runs to 0.62, the hatchet's to 0.42).
const ssu = (a, b, u) => smooth(a, b, u);
export const TOOL_SWING = {
  profMine: {
    frame: 'chest', sMin: 0.1, head: 0.55,
    // Chibi's timing (chibi2-motion-prof.js): up over 0..0.4, a breath, down 0.46..0.56, the jar, back to ready by 0.86
    rho: u => u < 0.46 ? 0.25 + 0.75 * ssu(0, 0.4, u) : u < 0.56 ? 1 - ssu(0.46, 0.56, u) : u < 0.62 ? 0 : 0.25 * ssu(0.62, 0.86, u),
    keys: [
      { r: 0, g: [0.05, -0.36, 0.40], a: [0, -0.5, 0.86], s: 0.1 },
      { r: 0.25, g: [0.08, -0.3, 0.34], a: [0, 0.12, 1], s: 0.13 },
      { r: 0.6, g: [0.13, 0.16, 0.34], a: [0.02, 1, 0.15], s: 0.22 },
      { r: 1, g: [0.17, 0.2, 0.2], a: [0.06, 0.32, -1], s: 0.3 },
    ],
  },
  profChop: {
    frame: 'heading', sMin: 0.1, head: 0.36,
    rho: u => u < 0.4 ? 0.25 + 0.75 * ssu(0, 0.36, u) : u < 0.52 ? 1 - ssu(0.4, 0.52, u) : u < 0.6 ? 0 : 0.25 * ssu(0.6, 0.88, u),
    keys: [
      { r: 0, g: [0.04, -0.2, 0.42], a: [-0.62, 0.06, 0.78], s: 0.1 },
      { r: 0.25, g: [0.1, -0.22, 0.36], a: [-0.25, 0.3, 0.92], s: 0.12 },
      { r: 0.6, g: [0.26, -0.1, 0.3], a: [0.85, 0.35, 0.4], s: 0.18 },
      { r: 1, g: [0.16, 0.02, 0.2], a: [0.2, 0.9, -0.38], s: 0.24 },
    ],
  },
};
/** The tool's grip point (its origin) in the hand BONE's own frame, and the Chibi grip-frame centre (kestrel.js). */
export const CHIBI_GRIP_C = [0, -0.035, 0.055];
const TOOL_MOUNT = [0, -0.05, 0.02];     // chibi2-motion-prof.js PROF_TOOL_MOUNT.pick / .hatchet position (hand frame)
function toolOrigin(krig, s) {
  const M = retargetMap(krig);
  const d = V(TOOL_MOUNT[0] - CHIBI_GRIP_C[0], TOOL_MOUNT[1] - CHIBI_GRIP_C[1], TOOL_MOUNT[2] - CHIBI_GRIP_C[2]).multiplyScalar(TOOL_SCALE).applyQuaternion(M.qB[s]);
  return krig.byName['grip' + s].userData.rest.clone().add(d);
}
/** Catmull-Rom through the keys at `rho` (positions; directions are interpolated the same way and normalised). */
function swingKey(keys, rho) {
  let i = 1; while (i < keys.length - 1 && rho > keys[i].r) i++;
  const k1 = keys[i - 1], k2 = keys[i], k0 = keys[Math.max(0, i - 2)], k3 = keys[Math.min(keys.length - 1, i + 1)];
  const t = Math.max(0, Math.min(1, (rho - k1.r) / (k2.r - k1.r || 1)));
  const cr = (p0, p1, p2, p3) => { const t2 = t * t, t3 = t2 * t; return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3); };
  const vec = f => V(...[0, 1, 2].map(j => cr(k0[f][j], k1[f][j], k2[f][j], k3[f][j])));
  return { g: vec('g'), a: vec('a').normalize(), s: k1.s + (k2.s - k1.s) * t };
}
/**
 * The hand bone's world turn that holds a haft along `a` with the forearm toward `toward` (world points / dirs) — or,
 * given `edge`, rolled about the haft so the tool's +x (the hatchet's edge, the pick's point) faces `edge`.
 */
function haftHand(krig, s, a, toward, edge = null) {
  const M = retargetMap(krig);
  let x = null;
  if (edge) { x = edge.clone().addScaledVector(a, -edge.dot(a)); if (x.lengthSq() < 1e-6) x = null; else x.normalize(); }
  let y;
  if (x) y = V().crossVectors(a, x);
  else {
    y = toward.clone().addScaledVector(a, -toward.dot(a));
    if (y.lengthSq() < 1e-8) y.set(0, 1, 0).addScaledVector(a, -a.y);
    y.normalize();
    x = V().crossVectors(y, a);
  }
  const frame = Qt().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, a));
  return frame.multiply(M.offHand[s]);       // frame = hand · qB  →  hand = frame · qB⁻¹
}
/** Where the wrist must be for the tool origin in hand `s` (turned `hq`) to be at `G`. */
const wristFor = (krig, s, G, hq) => G.clone().sub(toolOrigin(krig, s).applyQuaternion(hq));
const armReach = (krig, s) => (krig.byName['elbow' + s].userData.rest.length() + krig.byName['hand' + s].userData.rest.length()) * 0.97;
function placeArm(Q, krig, s, wrist, hq, pole) {
  Q.ik('arm' + s, 'elbow' + s, 'hand' + s, wrist, pole);
  Q.worldRot('hand' + s, hq);
}
/** Exported for the tests: the swing pose for `name` at loop fraction `u`, in the frame the clip is posed in. */
export function toolSwingKey(name, u) { const S = TOOL_SWING[name]; return S ? swingKey(S.keys, S.rho(((u % 1) + 1) % 1)) : null; }
const keyAtRho = (name, rho) => swingKey(TOOL_SWING[name].keys, rho);
function toolSwing(Q, krig, name, u) {
  const S = TOOL_SWING[name], P = krig.P, kk = P.k;
  const key = toolSwingKey(name, u);
  const chestW = Q.world('chest');
  const origin = V(0, P.shoulderY - P.chestY, 0).applyMatrix4(chestW);
  let rot;
  if (S.frame === 'chest') { rot = Qt(); chestW.decompose(V(), rot, V()); }
  else { const f = V(0, 0, 1).applyQuaternion(Q.worldQuat('root')); f.y = 0; rot = Qt().setFromAxisAngle(V(0, 1, 0), f.lengthSq() > 1e-6 ? Math.atan2(f.x, f.z) : 0); }
  let G = key.g.clone().multiplyScalar(kk).applyQuaternion(rot).add(origin);
  const a = key.a.clone().applyQuaternion(rot).normalize();
  const shL = () => V().setFromMatrixPosition(Q.world('armL')), shR = () => V().setFromMatrixPosition(Q.world('armR'));
  // the left fist's place on the haft: as far up as wanted, down to just above the right fist if the arm is short
  const reachL = armReach(krig, 'L'), reachR = armReach(krig, 'R');
  const leftAt = (G, sv) => G.clone().addScaledVector(a, sv * TOOL_SCALE);
  const leftWrist = (G, sv) => { const p = leftAt(G, sv), hq = haftHand(krig, 'L', a, shL().sub(p)); return { p, hq, w: wristFor(krig, 'L', p, hq) }; };
  const head = r => { const k2 = keyAtRho(name, r); return k2.g.clone().addScaledVector(k2.a, S.head || 0.36); };
  const r0 = S.rho(((u % 1) + 1) % 1), edge = head(Math.max(0, r0 - 0.04)).sub(head(Math.min(1, r0 + 0.04))).applyQuaternion(rot);
  let sv = key.s, L, hqR, wR;
  // both fists must reach: slide the left one down the haft first, then bring the whole tool nearer whichever shoulder
  // is short (a few rounds: moving it for one arm can take it from the other)
  for (let round = 0; round < 4; round++) {
    L = leftWrist(G, sv);
    while (sv > S.sMin + 1e-6 && L.w.distanceTo(shL()) > reachL) { sv = Math.max(S.sMin, sv - 0.01); L = leftWrist(G, sv); }
    const shortL = L.w.distanceTo(shL()) - reachL;
    if (shortL > 0) { G = G.addScaledVector(shL().sub(L.w).normalize(), shortL + 0.002); L = leftWrist(G, sv); }
    // the right fist: the tool's own grip, rolled so the edge leads the blow (the way the head moves on the down-swing)
    hqR = haftHand(krig, 'R', a, shR().sub(G), edge.lengthSq() > 1e-8 ? edge : null);
    wR = wristFor(krig, 'R', G, hqR);
    const shortR = wR.distanceTo(shR()) - reachR;
    if (shortR <= 0) break;
    G = G.addScaledVector(shR().sub(wR).normalize(), shortR + 0.002);
  }
  L = leftWrist(G, sv); wR = wristFor(krig, 'R', G, hqR);
  const poleOut = sg => V(sg * 1, -0.55, -0.25).normalize().applyQuaternion(rot);
  placeArm(Q, krig, 'R', wR, hqR, poleOut(1));
  placeArm(Q, krig, 'L', L.w, L.hq, poleOut(-1));
}

// --------------------------------------------------------------------------------------------- hybrids
const ARM_BONES = /^(clav|arm|elbow|hand|grip|thumb|index|middle|ring|pinky)/;
const HYBRID = { idle: 'idle', walk: 'walkTV', run: 'runTV' };
/** How far one cycle of the hybrid gait carries the body (m), for a game that sets the rate from its speed. */
export function gaitDistance(krig, name) {
  const k = krig.P.k, sw = krig.stride?.swing || 1;     // batch 4: a robe's shorter step covers less ground per cycle
  return name === 'walk' ? 0.84 * k * sw / 0.6 : name === 'run' ? 1.3 * k * sw / 0.36 : 0;
}
/** The angle a leg points forward at, per frame, for phase matching. */
function legForward(clip, legName, rest) {
  const t = clip.tracks.find(tr => tr.name === legName + '.quaternion');
  const q = Qt(), out = [];
  for (let i = 0; i < t.times.length; i++) out.push(rest.clone().applyQuaternion(quatAt(t.values, i, q)).z);
  return { times: t.times, z: out };
}
const argmax = a => a.reduce((b, v, i) => (v > a[b] ? i : b), 0);

/**
 * A Kestrel clip for a game clip name: the hybrid for idle / walk / run, the plain conversion otherwise.
 * Never throws for a name Chibi does not know (it bakes Chibi's fallback, idle).
 */
export function gameClip(krig, crig, name) {
  const kitName = HYBRID[name];
  if (!kitName) return retargetClip(krig, crig, name);
  const kit = createKitClips(krig, [kitName])[0];
  const arms = new Set(krig.bones.map(b => b.name).filter(b => ARM_BONES.test(b)));
  const conv = retargetClip(krig, crig, name, { bones: arms });
  // phase: the left leg furthest forward in both
  let shift = 0;
  if (name !== 'idle') {
    const chibiClip = createChibiClips(crig, [name])[0];
    const c = legForward(chibiClip, 'legL', V(0, -1, 0));
    const kRest = V(...krig.byName.kneeL.userData.world).sub(V(...krig.byName.legL.userData.world)).normalize();
    const k = legForward(kit, 'legL', kRest);
    shift = c.times[argmax(c.z)] / chibiClip.duration - k.times[argmax(k.z)] / kit.duration;
  }
  const D = kit.duration, Dc = conv.duration, tracks = kit.tracks.filter(t => !arms.has(t.name.split('.')[0]));
  const steps = Math.max(8, Math.round(D * 30)), times = new Float32Array(steps + 1);
  for (let i = 0; i <= steps; i++) times[i] = i / steps * D;
  for (const t of conv.tracks) {
    const size = t.getValueSize(), out = new Float32Array((steps + 1) * size), it = t.createInterpolant();
    for (let i = 0; i <= steps; i++) {
      const u = (((i / steps) + shift) % 1 + 1) % 1;
      out.set(it.evaluate(u * Dc), i * size);
    }
    tracks.push(t.name.endsWith('.quaternion') ? new THREE.QuaternionKeyframeTrack(t.name, times, out) : new THREE.VectorKeyframeTrack(t.name, times, out));
  }
  return new THREE.AnimationClip(name, D, tracks);
}
