// Kestrel (fable) — the body: torso, neck, arms, hands, legs, feet.
//
// Each part is a list of KEY PROFILES (height → half-width, half-depth, squareness, offsets) interpolated into rings,
// plus a SCULPT list (pecs, abs, lats, blades, glutes, biceps, forearm, quads, calves) as radial bumps. Garments call
// the same profile functions with an inflation, so a shirt follows the chest it covers exactly.
//
// Spaces: the torso and neck are authored in world (bind) space. Arms are authored in the ARM bone's space (origin at
// the shoulder joint, the limb running down -y, elbow at -upperArm), legs in the LEG bone's space, hands in the HAND
// bone's space (palm faces -x on the right hand) and feet in the FOOT bone's space (origin at the ankle). Everything
// is authored for the RIGHT side and mirrored for the left.
import { loft, ringY, ringZ, mirrorX, lerp, sstep } from './geometry.js';
import { blend, fingerSpec, FINGERS } from './rig.js';

const PI = Math.PI, HALF = PI / 2, FRONT = HALF, BACK = 3 * HALF, LEFT = 0, RIGHT = PI;

/** Catmull-Rom interpolation of every numeric property across keys sorted by `t` (ascending). */
export function interpKeys(keys, t) {
  const n = keys.length;
  if (t <= keys[0].t) return { ...keys[0] };
  if (t >= keys[n - 1].t) return { ...keys[n - 1] };
  let i = 0; while (i < n - 2 && t > keys[i + 1].t) i++;
  const k0 = keys[Math.max(0, i - 1)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(n - 1, i + 2)];
  const u = (t - k1.t) / (k2.t - k1.t), out = { t };
  for (const key of Object.keys(k1)) {
    if (key === 't' || typeof k1[key] !== 'number') { if (key !== 't') out[key] = k1[key]; continue; }
    const p0 = k0[key] ?? k1[key], p1 = k1[key], p2 = k2[key] ?? k1[key], p3 = k3[key] ?? p2;
    // Catmull-Rom with tangents scaled by the key spacing (non-uniform keys)
    const m1 = (p2 - p0) / Math.max(1e-6, (k2.t - k0.t)) * (k2.t - k1.t), m2 = (p3 - p1) / Math.max(1e-6, (k3.t - k1.t)) * (k2.t - k1.t);
    const u2 = u * u, u3 = u2 * u;
    out[key] = (2 * u3 - 3 * u2 + 1) * p1 + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * p2 + (u3 - u2) * m2;
  }
  return out;
}

/** Rings from keys over t in [t0, t1] (count rings), weights from `wAt(t)`, inflated by `grow` metres. */
export function ringsFrom(keys, count, wAt, { t0 = null, t1 = null, grow = 0, hide = null, axis = 'y', extra = null } = {}) {
  const a = t0 ?? keys[0].t, b = t1 ?? keys[keys.length - 1].t, rings = [];
  for (let i = 0; i < count; i++) {
    const t = lerp(a, b, i / (count - 1)), k = interpKeys(keys, t);
    const g = grow * (k.growK ?? 1);
    const opts = { x: k.x || 0, z: k.z || 0, n: k.n || 2, tilt: k.tilt || 0, hidden: hide ? hide(t) : false, f: k.f || null };
    if (extra) extra(k, opts, t);
    rings.push(axis === 'y' ? ringY(t, k.rx + g, k.rz + g, wAt(t), opts) : ringZ(t, k.rx + g, k.ry + g, wAt(t), { x: k.x || 0, y: k.y || 0, n: k.n || 2, hidden: opts.hidden, tilt: k.tilt || 0 }));
  }
  return rings;
}

// ---------------------------------------------------------------------------- torso

export function torsoKeys(d) {
  const f = d.fem, hk = d.hk;
  const shoulderTop = d.neckBase + 0.012;
  // t = world y, top to bottom (keys ascending in t, so listed bottom first)
  return [
    { t: d.crotch - 0.01, rx: d.hipRX * 0.62, rz: d.hipRZ * 0.72, n: 2.1, z: 0.0 },
    { t: d.crotch + 0.03, rx: d.hipRX * 0.86, rz: d.hipRZ * 0.95, n: 2.2, z: 0.0 },
    { t: d.hipY, rx: d.hipRX, rz: d.hipRZ, n: f ? 2.2 : 2.3, z: 0.0 },
    { t: lerp(d.hipY, d.waistY, 0.55), rx: lerp(d.hipRX, d.waistRX, 0.6), rz: lerp(d.hipRZ, d.waistRZ, 0.5), n: 2.2, z: 0.004 },
    { t: d.waistY, rx: d.waistRX, rz: d.waistRZ, n: f ? 2.1 : 2.2, z: 0.006 },
    { t: d.underBust, rx: lerp(d.waistRX, d.chestRX, 0.62), rz: lerp(d.waistRZ, d.chestRZ, 0.7), n: 2.2, z: 0.004 },
    { t: d.chestY, rx: d.chestRX, rz: d.chestRZ, n: 2.25, z: 0.0 },
    { t: lerp(d.chestY, d.shoulderY, 0.5), rx: d.chestRX * 1.03, rz: d.chestRZ * 0.95, n: 2.3, z: -0.004 },
    { t: d.shoulderY - 0.02, rx: d.shoulderX * 1.06, rz: d.chestRZ * 0.78, n: 2.4, z: -0.008 },         // the shelf over the shoulder joints
    { t: d.shoulderY + 0.006, rx: d.shoulderX * 0.86, rz: d.chestRZ * 0.72, n: 2.2, z: -0.008 },         // the trapezius slope ...
    { t: d.shoulderY + 0.03, rx: d.shoulderX * 0.5, rz: d.chestRZ * 0.6, n: 2.1, z: -0.006 },
    { t: shoulderTop + 0.028, rx: d.neckR * 1.4, rz: d.neckR * 1.3, n: 2.0, z: -0.004 },                 // ... up to the neck
    { t: shoulderTop + 0.045, rx: d.neckR * 1.05, rz: d.neckR * 1.05, n: 2, z: 0.0 },
  ];
}

/** Sculpt bumps for the torso, in (ring angle, world y). */
export function torsoSculpt(d) {
  const f = d.fem, hk = d.hk;
  const s = [];
  const pecY = d.chestY + (f ? -0.01 : 0.005) * hk;
  if (f) {
    // bust: two soft mounds low on the chest, a gentle groove between
    s.push({ a: FRONT - 0.4, y: pecY - 0.012, wa: 0.4, wy: 0.05, k: 0.42 + d.bust * 2 });
    s.push({ a: FRONT + 0.4, y: pecY - 0.012, wa: 0.4, wy: 0.05, k: 0.42 + d.bust * 2 });
    s.push({ a: FRONT, y: pecY - 0.02, wa: 0.12, wy: 0.05, k: -0.05 });
  } else {
    s.push({ a: FRONT - 0.5, y: pecY, wa: 0.48, wy: 0.05, k: 0.2 });
    s.push({ a: FRONT + 0.5, y: pecY, wa: 0.48, wy: 0.05, k: 0.2 });
    s.push({ a: FRONT, y: pecY, wa: 0.13, wy: 0.06, k: -0.045 });         // sternum groove
  }
  // abs: three rows either side of the linea alba
  const abTop = d.underBust - 0.015 * hk, abGap = (d.underBust - d.waistY) * 0.75;
  for (let r = 0; r < 3; r++) {
    const y = abTop - r * abGap, k = f ? 0.05 : 0.085;
    s.push({ a: FRONT - 0.24, y, wa: 0.22, wy: abGap * 0.33, k });
    s.push({ a: FRONT + 0.24, y, wa: 0.22, wy: abGap * 0.33, k });
  }
  s.push({ a: FRONT, y: d.waistY + 0.03, wa: 0.08, wy: 0.12, k: -0.03 });       // linea alba
  // obliques / lats
  s.push({ a: LEFT, y: d.chestY - 0.03, wa: 0.45, wy: 0.06, k: f ? 0.04 : 0.09 });
  s.push({ a: RIGHT, y: d.chestY - 0.03, wa: 0.45, wy: 0.06, k: f ? 0.04 : 0.09 });
  // back: shoulder blades, spine groove, lower-back dimples, glutes
  s.push({ a: BACK - 0.5, y: d.chestY + 0.03, wa: 0.4, wy: 0.05, k: f ? 0.04 : 0.07 });
  s.push({ a: BACK + 0.5, y: d.chestY + 0.03, wa: 0.4, wy: 0.05, k: f ? 0.04 : 0.07 });
  s.push({ a: BACK, y: d.chestY - 0.05, wa: 0.1, wy: 0.16, k: -0.05 });
  s.push({ a: BACK - 0.45, y: d.hipY - 0.02, wa: 0.42, wy: 0.06, k: f ? 0.18 : 0.14 });
  s.push({ a: BACK + 0.45, y: d.hipY - 0.02, wa: 0.42, wy: 0.06, k: f ? 0.18 : 0.14 });
  s.push({ a: BACK, y: d.hipY - 0.03, wa: 0.14, wy: 0.05, k: -0.07 });
  // collar bones (a ridge just under the neck base) and the trapezius slope
  s.push({ a: FRONT - 0.7, y: d.neckBase - 0.02, wa: 0.35, wy: 0.012, k: 0.04 });
  s.push({ a: FRONT + 0.7, y: d.neckBase - 0.02, wa: 0.35, wy: 0.012, k: 0.04 });
  s.push({ a: FRONT, y: d.neckBase - 0.025, wa: 0.2, wy: 0.012, k: -0.05 });    // suprasternal notch
  return s;
}

/** A point on the torso's surface (world) at height y and ring angle a (0 = +x side, PI/2 = front), grown by `grow`. */
export function torsoPoint(d, y, a, grow = 0, sculpt = null) {
  const k = interpKeys(torsoKeys(d), y);
  const bumps = sculpt || torsoSculpt(d);
  let m = 1;
  for (const b of bumps) { const da = (((a - b.a) % (2 * PI)) + 3 * PI) % (2 * PI) - PI; const di = (y - b.y) / b.wy; m += b.k * Math.exp(-((da / b.wa) ** 2 + di * di) / 2); }
  const c = Math.cos(a), sn = Math.sin(a), n = k.n || 2, kk = 2 / n;
  const su = Math.sign(c) * Math.abs(c) ** kk, sv = Math.sign(sn) * Math.abs(sn) ** kk;
  return [(k.x || 0) + su * (k.rx + grow) * m, y, (k.z || 0) + sv * (k.rz + grow) * m];
}

export function torsoWeights(rig) {
  const d = rig.d;
  return (y) => {
    if (y > d.neckBase - 0.01) return blend('chest', 'neck', y, d.neckBase + 0.01, 0.02);
    if (y > rig.chestY - 0.02) return blend('spine', 'chest', y, rig.chestY + 0.02, 0.05);
    return blend('hips', 'spine', y, rig.spineY, 0.05);
  };
}

export function buildTorso(rig, detail, hide) {
  const d = rig.d, keys = torsoKeys(d);
  const S = detail ? 28 : 14, count = detail ? 20 : 11;
  const rings = ringsFrom(keys, count, torsoWeights(rig), { hide });
  return loft(rings, S, { capStart: true, capEnd: true, sculpt: torsoSculpt(d), tag: 'torso' });
}

// ---------------------------------------------------------------------------- neck

export function buildNeck(rig, detail) {
  const d = rig.d, r = d.neckR;
  const w = (y) => blend('neck', 'head', y, d.chin - 0.01, 0.025);
  const keys = [
    { t: d.neckBase - 0.025, rx: r * 1.18, rz: r * 1.1, n: 2.2, z: -0.002 },
    { t: d.neckBase + 0.02, rx: r, rz: r * 0.98, n: 2.1, z: 0.004 },
    { t: d.chin - 0.025, rx: r * 0.95, rz: r * 0.95, n: 2.1, z: 0.006 },
    { t: d.chin + 0.03, rx: r * 1.0, rz: r * 1.05, n: 2.1, z: 0.0 },
  ];
  const rings = ringsFrom(keys, detail ? 6 : 4, w);
  const sculpt = [
    { a: FRONT - 0.5, y: d.neckBase + 0.03, wa: 0.3, wy: 0.04, k: 0.05 }, { a: FRONT + 0.5, y: d.neckBase + 0.03, wa: 0.3, wy: 0.04, k: 0.05 },   // sternomastoid
    { a: FRONT, y: d.chin - 0.045, wa: 0.25, wy: 0.012, k: d.fem ? 0.02 : 0.06 },     // adam's apple
  ];
  return loft(rings, detail ? 16 : 10, { sculpt, tag: 'neck' });
}

// ---------------------------------------------------------------------------- arms (right, hand space -x palm)

export function armKeys(d) {
  const U = d.upperArm, F = d.foreArm, r = d.armR, fr = d.foreR, wr = d.wristR;
  // t = arm-local y (0 shoulder joint, negative down); keys ascending
  return [
    { t: -(U + F) + 0.0, rx: wr * 0.86, rz: wr * 1.12, n: 2.3, x: 0, z: 0 },
    { t: -(U + F) + 0.03, rx: wr * 0.92, rz: wr * 1.2, n: 2.3, x: 0, z: 0 },
    { t: -U - F * 0.7, rx: fr * 0.78, rz: fr * 0.9, n: 2.2, x: 0, z: 0.002 },
    { t: -U - F * 0.42, rx: fr * 0.94, rz: fr * 1.02, n: 2.2, x: 0, z: 0.004 },
    { t: -U - F * 0.2, rx: fr * 1.0, rz: fr * 1.06, n: 2.2, x: 0, z: 0.004 },
    { t: -U, rx: fr * 0.98, rz: fr * 1.02, n: 2.4, x: 0, z: -0.002 },               // elbow
    { t: -U + 0.05, rx: r * 0.86, rz: r * 0.92, n: 2.2, x: 0, z: 0.002 },
    { t: -U * 0.55, rx: r * 0.97, rz: r * 1.06, n: 2.2, x: 0, z: 0.004 },            // biceps belly
    { t: -U * 0.28, rx: r * 1.02, rz: r * 1.04, n: 2.1, x: 0.004, z: 0.0 },
    { t: -0.045, rx: r * 1.14, rz: r * 1.08, n: 2.1, x: 0.008, z: 0.0 },              // deltoid
    { t: -0.012, rx: r * 1.0, rz: r * 0.96, n: 2.1, x: 0.004, z: -0.002 },
    { t: 0.012, rx: r * 0.6, rz: r * 0.66, n: 2.0, x: -0.006, z: -0.004 },            // deltoid top, tucked into the shoulder
  ];
}
export function armSculpt(d) {
  const U = d.upperArm, F = d.foreArm, f = d.fem;
  // right arm in arm space: palm faces -x, so the FRONT of the arm (biceps) is +z, the back (triceps) -z,
  // the outside (deltoid / lateral) is +x
  return [
    { a: FRONT, y: -U * 0.5, wa: 0.6, wy: U * 0.2, k: f ? 0.08 : 0.16 },          // biceps
    { a: BACK, y: -U * 0.45, wa: 0.6, wy: U * 0.22, k: f ? 0.05 : 0.11 },         // triceps
    { a: LEFT, y: -0.045, wa: 0.7, wy: 0.045, k: f ? 0.08 : 0.14 },                // deltoid
    { a: LEFT, y: -U - F * 0.25, wa: 0.75, wy: F * 0.16, k: f ? 0.06 : 0.12 },    // forearm extensors
    { a: FRONT + 0.3, y: -U - F * 0.3, wa: 0.6, wy: F * 0.2, k: 0.04 },
  ];
}
export function armWeights(rig) {
  const d = rig.d, U = d.upperArm, F = d.foreArm;
  return (y) => {
    if (y < -U - 0.05) return blend('hand' + '%s', 'elbow' + '%s', y, -(U + F) + 0.015, 0.02);
    if (y > -0.05) { const k = 0.55 * sstep(y, -0.05, 0.012); return k > 0.01 ? [['arm%s', 1 - k], ['chest', k]] : [['arm%s', 1]]; }   // the deltoid top stays with the shoulder
    return blend('elbow%s', 'arm%s', y, -U, 0.045);
  };
}
const sided = (w, s) => w.map(([b, k]) => [b.replace('%s', s), k]);

export function buildArm(rig, detail, hide) {
  const d = rig.d, keys = armKeys(d), S = detail ? 18 : 10, count = detail ? 17 : 9;
  const wAt = armWeights(rig);
  const rings = ringsFrom(keys, count, y => sided(wAt(y), 'R'), { hide });
  return loft(rings, S, { capStart: true, capEnd: false, sculpt: armSculpt(d), tag: 'armR' });
}

// ---------------------------------------------------------------------------- hands (right: palm faces -x, thumb +z)

export function buildHand(rig, detail) {
  const d = rig.d, fs = fingerSpec(rig.d), pieces = [];
  const kY = fs.knuckleY, pw = fs.palmW, pt = fs.palmT;
  const w = (y) => blend('handR', 'handR', y, 0, 1);
  // palm: a flat box-ish loft from the wrist to the knuckles; rings in the x/z plane (x = thickness, z = width)
  const keys = [
    { t: kY - 0.006, rx: pt * 0.5, rz: pw * 0.47, n: 3.4, x: 0, z: 0.0 },
    { t: kY, rx: pt * 0.56, rz: pw * 0.5, n: 3.4, x: 0, z: 0.0 },
    { t: kY * 0.6, rx: pt * 0.58, rz: pw * 0.47, n: 3.0, x: -0.002, z: 0.0 },
    { t: kY * 0.3, rx: pt * 0.56, rz: pw * 0.38, n: 2.6, x: -0.003, z: 0.002 },
    { t: 0.0, rx: d.wristR * 0.92, rz: d.wristR * 1.18, n: 2.3, x: 0, z: 0 },
    { t: 0.022, rx: d.wristR * 0.98, rz: d.wristR * 1.26, n: 2.3, x: 0, z: 0 },
  ];
  const sculpt = [
    { a: RIGHT, y: kY * 0.45, wa: 0.5, wy: 0.03, k: 0.08 },                       // palm heel / thenar (palm side -x)
    { a: LEFT, y: kY * 0.7, wa: 0.6, wy: 0.02, k: 0.04 },                          // back of the hand, knuckles
  ];
  pieces.push(loft(ringsFrom(keys, detail ? 7 : 5, w), detail ? 12 : 8, { capStart: true, capEnd: true, sculpt, tag: 'palmR' }));
  if (!detail) {
    // LOD 1: a mitten — one loft for the four fingers plus a thumb stub
    const m = [{ t: kY - 0.075 * d.hand / 0.19, rx: pt * 0.3, rz: pw * 0.3, n: 2.4 }, { t: kY - 0.02, rx: pt * 0.5, rz: pw * 0.47, n: 3 }, { t: kY, rx: pt * 0.5, rz: pw * 0.47, n: 3 }];
    pieces.push(loft(ringsFrom(m, 3, () => [['handR', 1]]), 8, { capStart: true, tag: 'mittR' }));
  } else {
    for (const f of FINGERS) {
      const g = fs.fingers[f];
      pieces.push(finger(g.len, g.r, f, 'R', 8));
    }
  }
  // thumb (authored along -y in the thumb bone's frame; placed by the caller with the bone's matrix)
  const t = fs.thumb;
  pieces.push(finger(t.len, t.r, 'thm', 'R', detail ? 10 : 6, true));
  return pieces;
}

/** One finger along -y from the knuckle; two bones f1 (0 .. -len*0.48) and f2 (the rest). */
function finger(len, r, name, s, S, thumb = false) {
  const b1 = name + '1' + s, b2 = name + '2' + s, mid = -len * 0.48;
  const w = (y) => blend(b2, b1, y, mid, 0.012);
  const keys = [
    { t: -len, rx: r * 0.55, rz: r * 0.62, n: 2.2, z: 0.001 },
    { t: -len + r * 1.2, rx: r * 0.86, rz: r * 0.92, n: 2.3, z: 0.001 },
    { t: mid - 0.006, rx: r * 0.9, rz: r * 0.95, n: 2.3 },
    { t: mid, rx: r * 1.0, rz: r * 1.02, n: 2.4 },
    { t: mid + 0.006, rx: r * 0.92, rz: r * 0.96, n: 2.3 },
    { t: -r * 0.6, rx: r, rz: r * 1.02, n: 2.4 },
    { t: thumb ? 0.004 : 0.006, rx: r * (thumb ? 1.15 : 1.05), rz: r * (thumb ? 1.2 : 1.1), n: 2.4 },
  ];
  // the finger bone frame: b1 at the knuckle, so y is relative to it; weights by y
  const rings = ringsFrom(keys, 7, w);
  const sculpt = [{ a: RIGHT, y: -len * 0.9, wa: 0.9, wy: r * 0.8, k: 0.12 }];       // finger pad toward the palm (-x)
  const p = loft(rings, S, { capStart: true, capEnd: true, sculpt, tag: name + s });
  // skin the ring at the knuckle to the hand slightly so the finger root stays attached
  return p;
}

// ---------------------------------------------------------------------------- legs (right, leg space)

export function legKeys(d) {
  const T = d.hipJointY - d.kneeY, C = d.kneeY - d.ankleY, L = T + C, tr = d.thighR, cr = d.calfR, f = d.fem;
  return [
    { t: -L, rx: cr * 0.5, rz: cr * 0.6, n: 2.4, z: -0.004 },                     // ankle
    { t: -L + 0.04, rx: cr * 0.55, rz: cr * 0.64, n: 2.4, z: -0.004 },
    { t: -T - C * 0.72, rx: cr * 0.7, rz: cr * 0.82, n: 2.2, z: -0.004 },
    { t: -T - C * 0.42, rx: cr * 0.92, rz: cr * 1.05, n: 2.2, z: -0.006 },        // calf belly
    { t: -T - C * 0.2, rx: cr * 0.9, rz: cr * 0.96, n: 2.3, z: -0.004 },
    { t: -T, rx: cr * 0.9, rz: cr * 0.95, n: 2.5, z: 0.0 },                       // knee
    { t: -T + 0.05, rx: tr * 0.8, rz: tr * 0.82, n: 2.3, z: 0.002 },
    { t: -T * 0.55, rx: tr * 0.94, rz: tr * 1.0, n: 2.2, z: 0.004 },
    { t: -T * 0.25, rx: tr * 1.0, rz: tr * 1.06, n: 2.2, z: 0.0, x: -0.004 },
    { t: 0.0, rx: tr * (f ? 1.04 : 1.0), rz: tr * 1.08, n: 2.2, z: -0.006, x: -0.006 },
    { t: 0.045, rx: tr * 0.9, rz: tr * 0.98, n: 2.2, z: -0.008, x: -0.01 },       // tucked into the pelvis
  ];
}
export function legSculpt(d) {
  const T = d.hipJointY - d.kneeY, C = d.kneeY - d.ankleY, f = d.fem;
  // right leg in leg space: front +z, back -z, outside +x, inside -x
  return [
    { a: FRONT - 0.3, y: -T * 0.45, wa: 0.55, wy: T * 0.2, k: f ? 0.07 : 0.12 },   // quads
    { a: FRONT + 0.4, y: -T * 0.5, wa: 0.5, wy: T * 0.2, k: f ? 0.06 : 0.1 },
    { a: FRONT, y: -T + 0.01, wa: 0.35, wy: 0.025, k: 0.05 },                       // kneecap
    { a: BACK, y: -T - C * 0.36, wa: 0.75, wy: C * 0.14, k: f ? 0.18 : 0.24 },      // calf
    { a: BACK + 0.6, y: -T - C * 0.3, wa: 0.4, wy: C * 0.12, k: 0.04 },
    { a: BACK, y: -T * 0.35, wa: 0.6, wy: T * 0.2, k: f ? 0.06 : 0.07 },           // hamstrings
    { a: LEFT, y: -T - 0.04, wa: 0.5, wy: 0.03, k: -0.03 },                         // knee sides a little flat
    { a: RIGHT, y: -T - 0.04, wa: 0.5, wy: 0.03, k: -0.03 },
  ];
}
export function legWeights(rig) {
  const d = rig.d, T = d.hipJointY - d.kneeY, C = d.kneeY - d.ankleY;
  return (y) => {
    if (y < -T - 0.05) return blend('foot%s', 'knee%s', y, -T - C + 0.02, 0.02);
    return blend('knee%s', 'leg%s', y, -T, 0.05);
  };
}
export function buildLeg(rig, detail, hide) {
  const d = rig.d, keys = legKeys(d), S = detail ? 20 : 10, count = detail ? 18 : 9;
  const wAt = legWeights(rig);
  const rings = ringsFrom(keys, count, y => sided(wAt(y), 'R'), { hide });
  return loft(rings, S, { capStart: true, capEnd: false, sculpt: legSculpt(d), tag: 'legR' });
}

// ---------------------------------------------------------------------------- feet (right, foot space: origin ankle)

export function footKeys(d) {
  const a = d.ankleY, L = d.footLen, W = d.footW;
  // rings along z (heel at -0.25 L .. ball at +0.5 L); centre y so the sole is at -a
  const k = (z, rx, ry, n, dy = 0) => ({ t: z, rx, ry, n, y: -a + ry + dy });
  return [
    k(-L * 0.25, W * 0.6, a * 0.48, 2.4, 0.005),
    k(-L * 0.17, W * 0.76, a * 0.62, 2.5, 0.003),
    k(-L * 0.04, W * 0.84, a * 0.78, 2.5, 0.002),                                 // up to the ankle
    k(L * 0.1, W * 0.9, a * 0.6, 2.6),
    k(L * 0.26, W * 1.0, a * 0.42, 2.9),
    k(L * 0.4, W * 1.02, a * 0.3, 3.0),
    k(L * 0.5, W * 0.98, a * 0.24, 3.0),
    k(L * 0.54, W * 0.9, a * 0.21, 2.8),
  ];
}
export function buildFoot(rig, detail, hide) {
  const d = rig.d, L = d.footLen, a = d.ankleY, W = d.footW;
  const w = (z) => blend('footR', 'toesR', z, L * 0.42, 0.03);
  const rings = ringsFrom(footKeys(d), detail ? 9 : 6, w, { axis: 'z', hide });
  // the ankle: a vertical collar joining the shin (hidden by boots too)
  const pieces = [loft(rings, detail ? 14 : 8, { capStart: true, capEnd: true, tag: 'footR', sculpt: [
    { a: HALF, wa: 0.8, wi: 1.5, k: 0.08, i: 2 },                                   // instep / ankle bulk
  ] })];
  if (detail && !(hide && hide(L * 0.5))) {
    // toes: five along the front, the big toe on the inside (-x for the right foot)
    const toes = [[-0.62, 0.26, 0.0125], [-0.27, 0.235, 0.0092], [0.03, 0.215, 0.0085], [0.31, 0.195, 0.0078], [0.57, 0.17, 0.007]];
    for (const [xk, lk, r] of toes) {
      const z0 = L * 0.46, len = L * lk, x = xk * W * 0.95, y = -a + r * 1.05;
      const keys = [
        { t: z0 - 0.012, rx: r * 1.05, ry: r * 1.0, n: 2.4, y: y + 0.002, x },
        { t: z0 + len * 0.45, rx: r * 1.0, ry: r * 0.98, n: 2.4, y, x },
        { t: z0 + len * 0.8, rx: r * 0.9, ry: r * 0.86, n: 2.3, y: y - r * 0.08, x },
        { t: z0 + len, rx: r * 0.6, ry: r * 0.55, n: 2.2, y: y - r * 0.3, x },
      ];
      pieces.push(loft(ringsFrom(keys, 4, () => [['toesR', 1]], { axis: 'z' }), 6, { capEnd: true, tag: 'toeR' }));
    }
  }
  return pieces;
}

export { mirrorX };
