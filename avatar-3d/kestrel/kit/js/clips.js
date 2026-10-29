// Kestrel (opus) — animation clips, sampled in code.
//
// A clip is a function f(t, Q) that poses the skeleton at time t through a small pose builder Q (rotations relative to
// the A-pose bind, hips offset, two-bone IK for feet and hands, finger presets). Each clip is sampled at 30 fps into
// quaternion tracks for every body bone (so cross-fading never leaves a bone where another clip put it) plus the hips
// position. Face and hair bones are NOT keyed: expressions, blinks, gaze and the ponytail are driven on top.
import * as THREE from 'three';
import { clamp, lerp, smooth } from './kmath.js';

export const KESTREL_ANIMS = ['idle', 'ready', 'walk', 'run', 'sprint', 'attack', 'cast', 'hit', 'guard', 'wave', 'talk', 'jump', 'dead', 'crouch', 'aim', 'interact'];
export const ONE_SHOTS = new Set(['attack', 'cast', 'hit', 'jump', 'wave', 'interact', 'dead']);
const LENGTHS = { walkTV: 1.05, runTV: 0.62, idle: 3.2, ready: 1.6, walk: 1.05, run: 0.66, sprint: 0.52, attack: 0.85, cast: 1.25, hit: 0.5, guard: 2.0, wave: 2.0, talk: 2.5, jump: 1.0, dead: 1.2, crouch: 2.4, aim: 1.8, interact: 1.3 };

const PI = Math.PI, TAU = PI * 2;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const ss = (a, b, t) => smooth(a, b, t);
const bump = (t, a, b, c, d) => ss(a, b, t) * (1 - ss(c, d, t));     // rises a→b, falls c→d
const wave = (t, len, k = 1, ph = 0) => Math.sin((t / len) * TAU * k + ph);

/** Which bones every clip keys. */
function keyedBones(rig) {
  const skip = /^(jaw|lip|mouth|eye|pupil|lid|brow|cheek|hair)/;
  return rig.bones.filter(b => !skip.test(b.name) && b.name !== 'root');
}

// --------------------------------------------------------------------------------------------- pose builder
export class Pose {
  constructor(rig) {
    this.rig = rig; this.B = rig.byName; this.q = new Map(); this.hipOff = V();
    this.e = new THREE.Euler(); this.tq = new THREE.Quaternion();
  }
  reset() { this.q.clear(); this.hipOff.set(0, 0, 0); }
  get(name) { let q = this.q.get(name); if (!q) { q = new THREE.Quaternion(); this.q.set(name, q); } return q; }
  /** Add an euler rotation (radians, XYZ order) to a bone, applied after what is already there (local axes). */
  r(name, x = 0, y = 0, z = 0, order = 'XYZ') { this.e.set(x, y, z, order); this.tq.setFromEuler(this.e); this.get(name).multiply(this.tq); return this; }
  /** Rotation about an axis given in the bone's own rest (world-aligned) frame. */
  ax(name, axis, a) { this.tq.setFromAxisAngle(axis, a); this.get(name).multiply(this.tq); return this; }
  set(name, q) { this.get(name).copy(q); return this; }
  hips(dx = 0, dy = 0, dz = 0) { this.hipOff.set(dx, dy, dz); return this; }
  /** World transform of a bone given the pose so far (parents must already be posed). */
  world(name, out = new THREE.Matrix4()) {
    const chain = []; let b = this.B[name]; while (b) { chain.unshift(b); b = b.parent && b.parent.isBone ? b.parent : null; }
    out.identity(); const m = new THREE.Matrix4();
    for (const bone of chain) {
      const pos = bone.userData.rest.clone(); if (bone.name === 'hips') pos.add(this.hipOff);
      m.compose(pos, this.q.get(bone.name) || new THREE.Quaternion(), V(1, 1, 1)); out.multiply(m);
    }
    return out;
  }
  worldQuat(name) { const q = new THREE.Quaternion(); this.world(name).decompose(V(), q, V()); return q; }
  /**
   * Two-bone IK: put the end of `a → b → end` at world `target`, bending toward world `pole`. Sets a and b (replacing
   * their rotation). `endName` is the bone at the tip (its rest position gives the second length).
   */
  ik(aName, bName, endName, target, pole) {
    const A = this.B[aName], Bb = this.B[bName], E = this.B[endName];
    const parentM = this.world(A.parent.name);
    const pq = new THREE.Quaternion(); parentM.decompose(V(), pq, V());
    const inv = parentM.clone().invert();
    const tl = target.clone().applyMatrix4(inv);                       // target in the parent's frame
    const pl = pole.clone().applyQuaternion(pq.clone().invert());       // pole direction in the parent's frame
    const a0 = A.userData.rest.clone();
    const r1 = Bb.userData.rest.clone(), r2 = E.userData.rest.clone();  // rest segments (frames are world-aligned at rest)
    const L1 = r1.length(), L2 = r2.length();
    const d = tl.clone().sub(a0); let D = d.length();
    D = clamp(D, Math.abs(L1 - L2) + 1e-3, L1 + L2 - 1e-4);
    const dn = d.clone().normalize();
    const alpha = Math.acos(clamp((L1 * L1 + D * D - L2 * L2) / (2 * L1 * D), -1, 1));
    let n = dn.clone().cross(pl); if (n.lengthSq() < 1e-8) n = V(1, 0, 0); n.normalize();
    const thigh = dn.clone().applyAxisAngle(n, alpha);
    const qa = new THREE.Quaternion().setFromUnitVectors(r1.clone().normalize(), thigh);
    const knee = a0.clone().add(thigh.clone().multiplyScalar(L1));
    const shin = a0.clone().add(dn.clone().multiplyScalar(D)).sub(knee).normalize();
    const shinLocal = shin.clone().applyQuaternion(qa.clone().invert());
    const qb = new THREE.Quaternion().setFromUnitVectors(r2.clone().normalize(), shinLocal);
    this.get(aName).copy(qa); this.get(bName).copy(qb);
    return this;
  }
  /** Set a bone's WORLD orientation (e.g. a foot flat on the ground), given the pose of its parents. */
  worldRot(name, qWorld) {
    const pq = this.worldQuat(this.B[name].parent.name);
    this.get(name).copy(pq.invert().multiply(qWorld));
    return this;
  }
}

// --------------------------------------------------------------------------------------------- helpers per rig
export function helpers(rig) {
  const B = rig.byName, P = rig.P, H = rig.hands;
  const W = n => V(...B[n].userData.world);
  const fq = (x = 0, y = 0, z = 0) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'YXZ'));
  const ankle = { L: W('footL'), R: W('footR') };
  const sgn = { L: -1, R: 1 };
  /** Plant a foot: ankle at world p, foot turned yaw and pitched (toe down +). Knee bends toward `knee` (world dir). */
  function foot(Q, s, p, { pitch = 0, yaw = 0, roll = 0, knee = V(0, 0, 1) } = {}) {
    Q.ik('leg' + s, 'knee' + s, 'foot' + s, p, knee);
    Q.worldRot('foot' + s, fq(pitch, yaw, roll));
    return Q;
  }
  /** Hand IK: wrist at world p, elbow toward `elbow` (world dir). */
  function hand(Q, s, p, elbow) { Q.ik('arm' + s, 'elbow' + s, 'hand' + s, p, elbow); return Q; }
  const fingerAxis = {}, thumbAxis = {};
  for (const s of ['L', 'R']) {
    const L = H[s];
    const t = V(...L.t), d = V(...L.d), n = V(...L.n);
    const c = t.clone().cross(d);
    fingerAxis[s] = t.clone().multiplyScalar(c.dot(n) > 0 ? 1 : -1);        // + angle curls toward the palm
    const td = V(...L.thumbInfo.dir);
    let ax = n.clone().cross(td).normalize();
    const probe = td.clone().applyAxisAngle(ax, 0.3);
    const want = t.clone().multiplyScalar(-1).add(n);
    if (probe.sub(td).dot(want) < 0) ax.multiplyScalar(-1);
    thumbAxis[s] = ax;
  }
  const PRESET = {
    relaxed: { f: [0.42, 0.62], spread: [0.0, 0.05, 0.12, 0.24], thumb: [0.3, 0.28] },   // v2: curled more (the Codex hands hang half-closed)
    open: { f: [0.04, 0.06], spread: [0, 0.03, 0.08, 0.15], thumb: [-0.1, 0.05] },
    fist: { f: [1.45, 1.65], spread: [0.0, 0.0, 0.03, 0.08], thumb: [0.75, 0.55] },
    grip: { f: [1.2, 1.35], spread: [0, 0, 0.03, 0.06], thumb: [0.65, 0.4] },
    point: { f: [1.45, 1.65], spread: [0, 0, 0.03, 0.08], thumb: [0.7, 0.5], index: [0.0, 0.05] },
    bow: { f: [1.3, 1.5], spread: [0, 0, 0.03, 0.06], thumb: [0.6, 0.45] },
    draw: { f: [0.8, 1.0], spread: [0, 0, 0.02, 0.05], thumb: [0.5, 0.6], index: [0.75, 0.9] },
    flat: { f: [0.0, 0.0], spread: [0, 0.0, 0.0, 0.0], thumb: [0.0, 0.0] },
  };
  /** Finger preset (blend of two presets with weight k). */
  function fingers(Q, s, name, k = 1, other = 'relaxed') {
    const A = PRESET[name] || PRESET.relaxed, Bp = PRESET[other] || PRESET.relaxed;
    const ax = fingerAxis[s];
    ['index', 'middle', 'ring', 'pinky'].forEach((f, i) => {
      const a = (f === 'index' && A.index) ? A.index : A.f, b = (f === 'index' && Bp.index) ? Bp.index : Bp.f;
      const c1 = lerp(b[0], a[0], k) * (1 + i * 0.1), c2 = lerp(b[1], a[1], k) * (1 + i * 0.07);
      Q.ax(f + '1' + s, ax, c1).ax(f + '2' + s, ax, c2);
    });
    const th = [lerp(Bp.thumb[0], A.thumb[0], k), lerp(Bp.thumb[1], A.thumb[1], k)];
    Q.ax('thumb1' + s, thumbAxis[s], th[0]).ax('thumb2' + s, thumbAxis[s], th[1]);
    return Q;
  }
  return { B, P, W, fq, ankle, sgn, foot, hand, fingers, fingerAxis, thumbAxis };
}

// --------------------------------------------------------------------------------------------- the clips
function clipFns(rig) {
  const h = helpers(rig), P = rig.P, k = P.k, { ankle, foot, hand, fingers, W } = h;
  const hipY = W('hips').y, shY = W('armR').y;
  const stand = (Q, s, dx = 0, dy = 0, dz = 0, opt) => foot(Q, s, ankle[s].clone().add(V(dx, dy, dz)), opt);
  const armsRelax = (Q, amt = 1) => {
    for (const s of ['L', 'R']) { const g = h.sgn[s]; Q.r('arm' + s, 0.04 * amt, 0, -g * 0.08 * amt).r('elbow' + s, -0.22 * amt, 0, 0).r('hand' + s, 0, 0, g * 0.06 * amt); fingers(Q, s, 'relaxed'); }
  };
  // a walking / running gait. o: { len, stance, stride, lift, bob, lean, arm, elbow, drop }
  // batch 4: a look in a long skirt takes a shorter step (rig.stride, clothes-catalog.js strideOf)
  const RS = rig.stride || null;
  const gait = (o0) => (t, Q) => {
    const o = RS ? { ...o0, stride: o0.stride * RS.swing, lift: o0.lift * RS.lift, kick: o0.kick * RS.kick } : o0;
    const ph = t / o.len;
    const lean = o.lean;
    Q.hips(0, -o.drop - o.bob * Math.cos(ph * TAU * 2) * 0.5 - o.bob * 0.5, 0);
    Q.r('hips', lean * 0.45, 0.09 * Math.sin(ph * TAU) * o.twist, 0.035 * Math.sin(ph * TAU + PI / 2) * o.twist);
    Q.r('spine', lean * 0.35, -0.09 * Math.sin(ph * TAU) * o.twist, 0);
    Q.r('chest', lean * 0.25 - 0.02 * Math.cos(ph * TAU * 2), -0.08 * Math.sin(ph * TAU) * o.twist, 0);
    Q.r('neck', -lean * 0.5, 0.05 * Math.sin(ph * TAU) * o.twist, 0).r('head', -lean * 0.25 + 0.02 * Math.cos(ph * TAU * 2), 0.04 * Math.sin(ph * TAU) * o.twist, 0);
    for (const s of ['L', 'R']) {
      const g = h.sgn[s];
      const p = ((ph + (s === 'R' ? 0.5 : 0)) % 1 + 1) % 1;
      let z, y = 0, pitch = 0;
      if (p < o.stance) {                  // on the ground, sliding back under the body
        const u = p / o.stance;
        z = lerp(o.stride / 2, -o.stride / 2, u);
        pitch = lerp(-0.18 * o.heel, 0, ss(0, 0.25, u)) + 0.55 * o.toe * ss(0.6, 1, u);
        y = 0.07 * k * o.toe * ss(0.6, 1, u);
      } else {                             // swing: lift and bring through
        const u = (p - o.stance) / (1 - o.stance);
        z = lerp(-o.stride / 2, o.stride / 2, ss(0, 1, u) * 0.85 + u * 0.15);
        y = o.lift * Math.pow(Math.sin(PI * Math.min(1, u * 1.08)), 0.8) * (1 + o.kick * (1 - u));
        z -= o.kick * 0.12 * Math.sin(PI * u) * (1 - u);
        pitch = lerp(0.55 * o.toe, -0.25 * o.heel, ss(0.2, 0.9, u));
      }
      stand(Q, s, -g * 0.012, y, z, { pitch, knee: V(g * 0.08, 0, 1) });
      // arms swing against the legs
      const sw = Math.sin((p + 0.0) * TAU) * 1;
      Q.r('arm' + s, -o.arm * sw * -1 + 0.04, 0, -g * (0.1 + o.armIn)).r('elbow' + s, -o.elbow - o.elbowSw * (0.5 + 0.5 * sw), 0, 0);
      Q.r('hand' + s, 0, 0, g * 0.06);
      fingers(Q, s, o.fist ? 'fist' : 'relaxed', o.fist || 1, 'relaxed');
    }
  };
  return {
    idle(t, Q) {
      const L = LENGTHS.idle, b = wave(t, L), b2 = wave(t, L, 2);
      Q.hips(0.006 * b, -0.004 - 0.003 * b2, 0).r('hips', 0, 0.015 * b, -0.012 * b);
      Q.r('spine', 0.01 * b2, -0.01 * b, 0.008 * b).r('chest', -0.015 * b2, 0, 0.006 * b).r('neck', 0.01, 0.02 * wave(t, L, 1, 1), 0).r('head', 0.015 * b2, 0.03 * wave(t, L, 1, 2), -0.01 * b);
      stand(Q, 'L'); stand(Q, 'R');
      for (const s of ['L', 'R']) { const g = h.sgn[s]; Q.r('clav' + s, 0, 0, g * 0.01 * b2).r('arm' + s, 0.03 + 0.015 * b, 0, -g * (0.06 + 0.01 * b2)).r('elbow' + s, -0.2 - 0.03 * b, 0, 0).r('hand' + s, 0.05, 0, g * 0.05); fingers(Q, s, 'relaxed'); }
    },
    ready(t, Q) {
      const L = LENGTHS.ready, b = wave(t, L, 2);
      Q.hips(0, -0.085 * k + 0.012 * b, 0).r('hips', 0.08, 0.32, 0);
      Q.r('spine', 0.1, -0.12, 0).r('chest', 0.06 + 0.02 * b, -0.12, 0).r('neck', -0.08, -0.04, 0).r('head', -0.06, -0.02, 0);
      stand(Q, 'L', -0.07, 0, 0.17, { yaw: 0.3, knee: V(-0.3, 0, 1) }); stand(Q, 'R', 0.07, 0, -0.15, { yaw: 0.45, pitch: 0.0, knee: V(0.4, 0, 1) });
      const c = W('chest');
      hand(Q, 'L', V(-0.11, shY - 0.08 + 0.01 * b, 0.25), V(-1, -0.8, 0)); hand(Q, 'R', V(0.03, shY - 0.13 + 0.01 * b, 0.18), V(1, -0.8, -0.2));
      Q.r('handL', -0.3, 0, -0.4).r('handR', -0.3, 0, 0.4);
      fingers(Q, 'L', 'fist'); fingers(Q, 'R', 'fist');
    },
    walk: gait({ len: LENGTHS.walk, stance: 0.6, stride: 0.66 * k, lift: 0.085 * k, bob: 0.018, lean: 0.04, arm: 0.5, elbow: 0.25, elbowSw: 0.15, armIn: 0.0, drop: 0.012, twist: 1, heel: 1, toe: 1, kick: 0, fist: 0 }),
    run: gait({ len: LENGTHS.run, stance: 0.36, stride: 1.08 * k, lift: 0.24 * k, bob: 0.035, lean: 0.26, arm: 0.8, elbow: 1.3, elbowSw: 0.2, armIn: -0.14, drop: 0.05, twist: 1.3, heel: 0.5, toe: 1, kick: 0.6, fist: 0.8 }),
    // Thousandvale (batch 1): the same gait with a longer step, so a body moving 1.5 / 5 m/s keeps a believable cadence.
    // Distance per cycle = stride / stance (walk 1.4 m, run 3.6 m); the game sets the rate from its speed (tv-rate in retarget.js).
    walkTV: gait({ len: LENGTHS.walkTV, stance: 0.6, stride: 0.84 * k, lift: 0.09 * k, bob: 0.02, lean: 0.05, arm: 0.5, elbow: 0.25, elbowSw: 0.15, armIn: 0.0, drop: 0.014, twist: 1, heel: 1, toe: 1, kick: 0, fist: 0 }),
    runTV: gait({ len: LENGTHS.runTV, stance: 0.36, stride: 1.3 * k, lift: 0.26 * k, bob: 0.035, lean: 0.3, arm: 0.85, elbow: 1.3, elbowSw: 0.2, armIn: -0.14, drop: 0.055, twist: 1.3, heel: 0.45, toe: 1.05, kick: 0.7, fist: 0.8 }),
    sprint: gait({ len: LENGTHS.sprint, stance: 0.32, stride: 1.38 * k, lift: 0.3 * k, bob: 0.04, lean: 0.48, arm: 1.15, elbow: 1.35, elbowSw: 0.25, armIn: -0.16, drop: 0.07, twist: 1.5, heel: 0.2, toe: 1.2, kick: 0.9, fist: 1 }),
    attack(t, Q) {
      // a one-handed swing with the right hand: wind up high and back, cut down across, lunge, recover
      const wind = bump(t, 0.0, 0.28, 0.34, 0.5), cut = bump(t, 0.3, 0.42, 0.55, 0.85), lunge = bump(t, 0.25, 0.42, 0.6, 0.85);
      Q.hips(0, -0.08 * k * lunge - 0.02 * wind, 0.06 * lunge).r('hips', 0.06 * lunge, 0.25 * wind - 0.3 * cut, 0);
      Q.r('spine', 0.05 + 0.18 * cut - 0.08 * wind, 0.25 * wind - 0.35 * cut, 0.05 * cut).r('chest', 0.06 * cut, 0.2 * wind - 0.3 * cut, 0);
      Q.r('neck', -0.1 * cut, -0.15 * wind + 0.2 * cut, 0).r('head', -0.05 * cut, -0.1 * wind + 0.2 * cut, 0);
      stand(Q, 'L', -0.08 * lunge, 0.05 * bump(t, 0.2, 0.3, 0.32, 0.42), 0.38 * lunge, { knee: V(-0.2, 0, 1), yaw: -0.1 });
      stand(Q, 'R', 0.08 * lunge, 0, -0.2 * lunge, { yaw: 0.45, knee: V(0.3, 0, 1) });
      // sword arm
      Q.r('clavR', 0, 0, 0.12 * wind);
      Q.r('armR', lerp(0, -2.5, wind) + lerp(0, -1.1, cut) * (1 - wind), 0, lerp(0, 0.5, wind) + lerp(0, -0.5, cut));
      Q.r('elbowR', -0.9 * wind - 0.15 * cut - 0.2, 0, 0).r('handR', -0.3 * wind + 0.5 * cut, 0, 0.3);
      // the free arm balances
      Q.r('armL', -0.3 * wind + 0.5 * cut, 0, -(-0.3 * cut - 0.15)).r('elbowL', -0.6 - 0.3 * cut, 0, 0);
      fingers(Q, 'R', 'grip'); fingers(Q, 'L', 'open', 0.6);
    },
    cast(t, Q) {
      const gather = bump(t, 0, 0.35, 0.4, 0.55), push = bump(t, 0.4, 0.58, 0.95, 1.2);
      Q.hips(0, -0.03 * push, -0.02 * gather + 0.04 * push).r('hips', 0.04 * push, 0, 0);
      Q.r('spine', -0.08 * gather + 0.12 * push, 0, 0).r('chest', -0.06 * gather + 0.08 * push, 0, 0).r('head', 0.05 * gather - 0.08 * push, 0, 0);
      stand(Q, 'L', -0.02, 0, 0.12 * push, { knee: V(-0.1, 0, 1) }); stand(Q, 'R', 0.02, 0, -0.06 * push, { yaw: 0.2 });
      for (const s of ['L', 'R']) {
        const g = h.sgn[s];
        const pGather = V(g * 0.07, shY - 0.2, 0.18), pPush = V(g * 0.1, shY - 0.03, 0.56 * k);
        const rest = W('hand' + s);
        let p = rest.clone().lerp(pGather, gather); p = p.lerp(pPush, push);
        if (gather + push > 0.01) hand(Q, s, p, V(g, -0.6, -0.3)); else Q.r('arm' + s, 0.03, 0, -g * 0.06).r('elbow' + s, -0.2, 0, 0);
        Q.r('hand' + s, -0.9 * push, 0, g * 0.4 * push);
        fingers(Q, s, 'open', push + gather * 0.5, 'relaxed');
      }
    },
    hit(t, Q) {
      const k1 = bump(t, 0, 0.07, 0.15, 0.48);
      Q.hips(0, -0.03 * k1, -0.06 * k1).r('hips', -0.08 * k1, 0.1 * k1, 0);
      Q.r('spine', -0.22 * k1, 0.12 * k1, 0.05 * k1).r('chest', -0.15 * k1, 0, 0).r('neck', -0.2 * k1, 0, 0).r('head', -0.25 * k1, 0.15 * k1, 0.1 * k1);
      stand(Q, 'L', 0, 0, -0.02 * k1); stand(Q, 'R', 0, 0.04 * bump(t, 0.03, 0.1, 0.15, 0.3), -0.12 * k1, { knee: V(0, 0, 1) });
      for (const s of ['L', 'R']) { const g = h.sgn[s]; Q.r('arm' + s, -0.35 * k1, 0, g * 0.45 * k1 - g * 0.06).r('elbow' + s, -0.5 * k1 - 0.2, 0, 0); fingers(Q, s, 'open', k1); }
    },
    guard(t, Q) {
      const b = wave(t, LENGTHS.guard, 2);
      Q.hips(0, -0.07 * k + 0.008 * b, -0.02).r('hips', 0.12, 0.1, 0);
      Q.r('spine', 0.12, -0.05, 0).r('chest', 0.1, -0.05, 0).r('neck', -0.05, 0, 0).r('head', 0.1, 0, 0);
      stand(Q, 'L', -0.05, 0, 0.1, { knee: V(-0.2, 0, 1) }); stand(Q, 'R', 0.06, 0, -0.1, { yaw: 0.3, knee: V(0.3, 0, 1) });
      hand(Q, 'L', V(-0.06, shY + 0.03 + 0.005 * b, 0.2), V(-1, -1, 0)); hand(Q, 'R', V(0.07, shY + 0.0 + 0.005 * b, 0.2), V(1, -1, 0));
      Q.r('handL', 0.2, 0, -0.6).r('handR', 0.2, 0, 0.6);
      fingers(Q, 'L', 'fist'); fingers(Q, 'R', 'fist');
    },
    wave(t, Q) {
      const up = bump(t, 0, 0.3, 1.65, 1.98), w = Math.sin((t - 0.3) * TAU * 1.6) * up;
      Q.hips(0, -0.004, 0).r('hips', 0, 0, -0.02 * up);
      Q.r('spine', 0, 0.04 * up, 0.03 * up).r('chest', 0, 0.04 * up, 0.02 * up).r('head', 0.02 * up, 0.08 * up, -0.08 * up);
      stand(Q, 'L'); stand(Q, 'R');
      Q.r('clavR', 0, 0, 0.18 * up).r('armR', -0.15 * up, 0, lerp(0, 2.15, up)).r('elbowR', -1.15 * up - 0.15, 0.0, 0).r('elbowR', 0, 0, 0.0).r('handR', 0, 0, 0);
      // forearm waving: rotate the elbow about the upper arm's own axis-ish (local z after the raise)
      Q.r('elbowR', 0, 0.35 * w, 0);
      Q.r('handR', 0.0, 0.25 * up, 0.15 * w);
      fingers(Q, 'R', 'open', up);
      Q.r('armL', 0.03, 0, 0.06).r('elbowL', -0.2, 0, 0); fingers(Q, 'L', 'relaxed');
    },
    talk(t, Q) {
      const L = LENGTHS.talk, a = wave(t, L), b = wave(t, L, 2, 0.6), c = bump(t, 0.2, 0.7, 1.4, 2.0);
      Q.hips(0, -0.004, 0).r('hips', 0, 0.03 * a, 0);
      Q.r('spine', 0.02, 0.04 * a, 0).r('chest', 0.02 * b, 0.03 * a, 0).r('neck', 0.04 * b, 0.05 * a, 0).r('head', 0.05 * b, 0.06 * a, 0.04 * a);
      stand(Q, 'L'); stand(Q, 'R');
      Q.r('armR', -0.3 - 0.25 * c, 0, -0.12).r('elbowR', -1.1 - 0.3 * b * c, 0.0, 0).r('handR', -0.2, 0.3 * c, 0.2 + 0.1 * b);
      Q.r('armL', -0.12 - 0.15 * (1 - c), 0, 0.1).r('elbowL', -0.6 - 0.3 * a * (1 - c), 0, 0).r('handL', -0.1, -0.3 * (1 - c), -0.2);
      fingers(Q, 'R', 'open', 0.5 + 0.5 * c); fingers(Q, 'L', 'open', 0.4);
    },
    jump(t, Q) {
      const crouch = bump(t, 0, 0.18, 0.2, 0.3), air = bump(t, 0.26, 0.4, 0.7, 0.82), land = bump(t, 0.78, 0.86, 0.9, 1.0);
      const lift = 0.32 * k * Math.sin(PI * clamp((t - 0.25) / 0.55, 0, 1));
      Q.hips(0, -0.13 * k * crouch - 0.1 * k * land + lift, 0).r('hips', 0.25 * crouch + 0.15 * land - 0.05 * air, 0, 0);
      Q.r('spine', 0.15 * crouch + 0.1 * land - 0.05 * air, 0, 0).r('chest', 0.05 * crouch - 0.05 * air, 0, 0).r('neck', -0.15 * crouch, 0, 0).r('head', -0.1 * crouch - 0.1 * air, 0, 0);
      const hp = W('hips').y - 0.13 * k * crouch - 0.1 * k * land + lift;
      if (air < 0.02) { stand(Q, 'L'); stand(Q, 'R'); }
      else {
        // in the air: right knee tucked up high, left leg trailing a little behind
        const g = ankle.L, gR = ankle.R;
        const grounded = 1 - air;
        const pL = V(g.x, lerp(g.y, g.y + lift - 0.05, air), lerp(g.z, -0.15, air));
        const pR = V(gR.x, lerp(gR.y, hp - 0.5 * k, air), lerp(gR.z, 0.12, air));
        foot(Q, 'L', pL, { pitch: 0.6 * air }); foot(Q, 'R', pR, { pitch: 0.5 * air });
      }
      for (const s of ['L', 'R']) {
        const g = h.sgn[s];
        Q.r('arm' + s, 0.5 * crouch - (s === 'L' ? 0.55 : 0.3) * air + 0.4 * land, 0, -g * 0.12 + g * 0.55 * air).r('elbow' + s, -0.4 - (s === 'L' ? 1.1 : 1.35) * air, 0, 0);
        fingers(Q, s, 'fist', air * 0.8);
      }
    },
    dead(t, Q) {
      const buckle = ss(0, 0.3, t), fall = ss(0.2, 0.85, t), settle = ss(0.8, 1.1, t);
      const pitch = -PI / 2 * fall;
      Q.hips(0, -0.18 * buckle * (1 - fall) - (hipY - 0.115) * fall, -0.25 * fall).r('hips', pitch, 0.1 * fall, 0.05 * fall);
      Q.r('spine', 0.15 * buckle * (1 - fall) - 0.05 * fall, 0, 0).r('chest', 0.1 * buckle * (1 - fall) - 0.04 * fall, 0, 0.03 * fall);
      Q.r('neck', -0.2 * fall, 0, 0).r('head', 0.2 * buckle * (1 - fall) - 0.15 * fall, 0.45 * settle, 0.1 * settle);
      if (fall < 0.05) { stand(Q, 'L', 0, 0, 0, { knee: V(-0.2, 0, 1) }); stand(Q, 'R', 0, 0, 0, { knee: V(0.2, 0, 1) }); }
      else {
        for (const s of ['L', 'R']) {
          const g = h.sgn[s];
          Q.r('leg' + s, -0.15 * (1 - fall) - 0.12 * fall * (s === 'L' ? 1 : 0.2), 0, g * 0.1 * fall).r('knee' + s, 0.5 * (1 - fall) + 0.2 * fall * (s === 'L' ? 1 : 0.1), 0, 0).r('foot' + s, 0.4 * fall, 0, 0);
        }
      }
      for (const s of ['L', 'R']) { const g = h.sgn[s]; Q.r('arm' + s, -0.3 * buckle - 0.6 * fall, 0, g * (0.2 + 1.1 * fall)).r('elbow' + s, -0.4 * fall - 0.3, 0, 0); fingers(Q, s, 'open', 0.4 * fall); }
    },
    crouch(t, Q) {
      const b = wave(t, LENGTHS.crouch);
      const drop = 0.46 * k;
      Q.hips(0, -drop + 0.006 * b, -0.1 * k).r('hips', 0.55, 0, 0);
      Q.r('spine', 0.22 + 0.02 * b, 0, 0).r('chest', 0.12, 0, 0).r('neck', -0.45, 0, 0).r('head', -0.25, 0.03 * b, 0);
      stand(Q, 'L', -0.08, 0, 0.02, { yaw: -0.4, knee: V(-0.8, 0, 1) }); stand(Q, 'R', 0.08, 0, 0.02, { yaw: 0.4, knee: V(0.8, 0, 1) });
      const hp = hipY - drop;
      hand(Q, 'L', V(-0.13, hp - 0.03, 0.38 * k), V(-1, -0.4, -0.5)); hand(Q, 'R', V(0.13, hp - 0.02, 0.36 * k), V(1, -0.4, -0.5));
      Q.r('handL', 0.3, 0, -0.2).r('handR', 0.3, 0, 0.2);
      fingers(Q, 'L', 'fist', 0.7); fingers(Q, 'R', 'fist', 0.7);
    },
    aim(t, Q) {
      // kneeling bow draw (the mockup): right knee down, left foot forward, bow arm (left) out in front, right hand at the cheek
      const b = wave(t, LENGTHS.aim);
      const drop = 0.4 * k;
      Q.hips(0.02, -drop + 0.004 * b, -0.08 * k).r('hips', 0.05, 0.9, 0);
      Q.r('spine', 0.02, 0.25, 0).r('chest', 0.0 + 0.01 * b, 0.25, 0).r('neck', 0, -0.6, 0).r('head', -0.02, -0.65, 0.06);
      foot(Q, 'L', V(-0.04, ankle.L.y, 0.36 * k), { knee: V(0.2, 0.4, 1), yaw: 0.6 });
      foot(Q, 'R', V(0.17 * k, 0.09 * k, -0.34 * k), { pitch: 1.25, knee: V(0, -1, 0.2), yaw: 0.9 });
      // targets from where the shoulders and head actually are in this pose: the bow arm straight ahead at shoulder
      // height, the drawing hand at the cheek
      const shL = V().setFromMatrixPosition(Q.world('armL')), hdP = V().setFromMatrixPosition(Q.world('head'));
      hand(Q, 'L', V(shL.x - 0.02, shL.y + 0.02, shL.z + 0.6 * k), V(-0.4, -1, 0));
      hand(Q, 'R', V(hdP.x + 0.05, hdP.y + 0.0, hdP.z + 0.04), V(1, 0.1, -1));
      Q.r('handL', 0, 0, -1.4).r('handR', 0, 0, 0.3);
      fingers(Q, 'L', 'bow'); fingers(Q, 'R', 'draw');
    },
    interact(t, Q) {
      const up = bump(t, 0, 0.28, 0.95, 1.28);
      Q.hips(0, -0.004, 0).r('hips', 0, -0.1 * up, 0);
      Q.r('spine', 0, -0.08 * up, 0).r('chest', 0.0, -0.1 * up, 0).r('neck', 0, 0.12 * up, 0).r('head', 0.02 * up, 0.15 * up, 0);
      stand(Q, 'L', 0, 0, 0.04 * up); stand(Q, 'R', 0.02 * up, 0, -0.03 * up, { yaw: 0.15 * up });
      const rest = W('handR');
      if (up > 0.01) hand(Q, 'R', rest.clone().lerp(V(0.44, shY - 0.01, 0.545 * k), up), V(0.3, -1, -0.3));
      else Q.r('armR', 0.03, 0, -0.06).r('elbowR', -0.2, 0, 0);
      Q.r('handR', 0, -0.3 * up, 0.2 * up);
      fingers(Q, 'R', 'point', up);
      Q.r('armL', 0.03, 0, 0.06).r('elbowL', -0.22, 0, 0); fingers(Q, 'L', 'relaxed');
    },
  };
}

/** Sample every requested clip for this rig. */
export function createClips(rig, names = KESTREL_ANIMS) {
  const fns = clipFns(rig), keyed = keyedBones(rig), Q = new Pose(rig);
  const clips = [];
  for (const name of names) {
    const fn = fns[name]; if (!fn) continue;
    const L = LENGTHS[name], loop = !ONE_SHOTS.has(name);
    const n = Math.max(2, Math.round(L * 30));
    const times = new Float32Array(n + 1);
    const qv = keyed.map(() => new Float32Array((n + 1) * 4));
    const hv = new Float32Array((n + 1) * 3);
    for (let i = 0; i <= n; i++) {
      // a loop's last frame IS its first, so the cycle closes exactly
      const t = loop && i === n ? 0 : i / n * L;
      times[i] = i / n * L;
      Q.reset(); fn(t, Q);
      keyed.forEach((b, j) => { const q = Q.q.get(b.name) || new THREE.Quaternion(); q.normalize(); qv[j].set([q.x, q.y, q.z, q.w], i * 4); });
      const r = rig.byName.hips.userData.rest; hv.set([r.x + Q.hipOff.x, r.y + Q.hipOff.y, r.z + Q.hipOff.z], i * 3);
    }
    // keep quaternions in one hemisphere so interpolation takes the short way
    for (const arr of qv) for (let i = 4; i < arr.length; i += 4) { if (arr[i] * arr[i - 4] + arr[i + 1] * arr[i - 3] + arr[i + 2] * arr[i - 2] + arr[i + 3] * arr[i - 1] < 0) for (let c = 0; c < 4; c++) arr[i + c] = -arr[i + c]; }
    const tracks = keyed.map((b, j) => new THREE.QuaternionKeyframeTrack(b.name + '.quaternion', times, qv[j]));
    tracks.push(new THREE.VectorKeyframeTrack('hips.position', times, hv));
    // the root rests at the origin in every kit clip (Chibi 2's clips move it: a jump, lying dead), keyed so a cross-fade
    // from a retargeted clip brings it home (retarget.js)
    tracks.push(new THREE.QuaternionKeyframeTrack('root.quaternion', [0, L], [0, 0, 0, 1, 0, 0, 0, 1]));
    tracks.push(new THREE.VectorKeyframeTrack('root.position', [0, L], [0, 0, 0, 0, 0, 0]));
    for (const s of ['L', 'R']) tracks.push(new THREE.VectorKeyframeTrack('grip' + s + '.scale', [0, L], [1, 1, 1, 1, 1, 1]));
    clips.push(new THREE.AnimationClip(name, L, tracks));
  }
  return clips;
}
export { LENGTHS };
