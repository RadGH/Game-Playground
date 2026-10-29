// Kestrel (opus) — the body: torso, neck, arms, legs, hands and feet as parametric surfaces.
//
// Each part is `{ at(u, θ, opt) → { p, w }, us, segs, ... }`. `opt.bump` (0..1) scales the muscle relief, so a
// garment can sample the same part smoothed (cloth bridges the grooves) and pushed out — see garments.js.
// Shapes are written for the R side (+x); an L part is the mirror image (θ → -θ, x → -x).
import { clamp, lerp, smooth, gauss, adiff, superR, table, add, sub, mul, norm, cross, dot, len, mix3, rot } from './kmath.js';
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const PI = Math.PI;
/** Angle into -π..π (surfaces sample 0..2π; the shapes below are written for -π..π). */
const wrapPi = a => Math.atan2(Math.sin(a), Math.cos(a));

// ----------------------------------------------------------------------------------------------------------- torso
/** Where the underwear's waistband tops out (base-scale metres): garments.js reads this too. */
export const BRIEF_TOP = { masc: 1.0, fem: 0.965 };
/**
 * Torso rows [y, halfWidth, frontDepth, backDepth, centreZ, frontPower, backPower] at base scale (P.k scales y).
 * v2: y is the REAL height (refitted to Codex + Meshy: narrower waist and hips, the chest and shoulders lower, the
 * trapezius sloping from the shoulder to the neck); torsoPart turns it into v1's parameter height with P.yInv.
 */
const TORSO_M = [
  [0.822, 0.045, 0.042, 0.042, 0.004, 2, 2],
  [0.838, 0.105, 0.068, 0.078, 0.000, 2.2, 2.2],
  [0.870, 0.150, 0.086, 0.100, -0.004, 2.3, 2.3],
  [0.915, 0.160, 0.092, 0.112, -0.005, 2.4, 2.4],
  [0.960, 0.150, 0.094, 0.106, -0.004, 2.4, 2.4],
  [1.000, 0.140, 0.095, 0.094, -0.002, 2.4, 2.4],
  [1.045, 0.131, 0.096, 0.085, 0.000, 2.3, 2.5],
  [1.085, 0.129, 0.099, 0.084, -0.002, 2.3, 2.5],
  [1.125, 0.137, 0.104, 0.090, -0.004, 2.3, 2.6],
  [1.170, 0.155, 0.112, 0.099, -0.012, 2.3, 2.7],
  [1.215, 0.178, 0.118, 0.108, -0.018, 2.4, 2.8],
  [1.260, 0.188, 0.120, 0.113, -0.022, 2.5, 2.8],
  [1.300, 0.184, 0.118, 0.115, -0.025, 2.6, 2.8],
  [1.330, 0.176, 0.110, 0.112, -0.026, 2.6, 2.7],
  [1.355, 0.164, 0.098, 0.106, -0.027, 2.5, 2.6],
  [1.378, 0.148, 0.084, 0.097, -0.027, 2.4, 2.5],
  [1.398, 0.14, 0.074, 0.088, -0.028, 2.3, 2.4],
  [1.415, 0.124, 0.066, 0.08, -0.028, 2.3, 2.3],
  [1.430, 0.100, 0.058, 0.07, -0.028, 2.2, 2.2],
  [1.445, 0.074, 0.05, 0.058, -0.026, 2.1, 2.1],
  [1.455, 0.05, 0.04, 0.046, -0.025, 2.0, 2.0],
];
const TORSO_F = [
  [0.785, 0.040, 0.036, 0.038, 0.004, 2, 2],
  [0.800, 0.100, 0.064, 0.078, 0.000, 2.2, 2.2],
  [0.830, 0.140, 0.082, 0.104, -0.006, 2.3, 2.3],
  [0.875, 0.136, 0.088, 0.100, -0.006, 2.4, 2.4],
  [0.915, 0.128, 0.088, 0.098, -0.005, 2.4, 2.4],
  [0.955, 0.120, 0.086, 0.092, -0.004, 2.4, 2.4],
  [0.995, 0.102, 0.083, 0.076, 0.000, 2.3, 2.4],
  [1.030, 0.098, 0.082, 0.071, 0.002, 2.3, 2.4],
  [1.065, 0.104, 0.084, 0.072, 0.002, 2.3, 2.4],
  [1.100, 0.113, 0.088, 0.078, 0.000, 2.3, 2.5],
  [1.135, 0.124, 0.093, 0.084, -0.002, 2.3, 2.6],
  [1.175, 0.128, 0.097, 0.088, -0.004, 2.4, 2.6],
  [1.205, 0.133, 0.097, 0.090, -0.006, 2.5, 2.6],
  [1.232, 0.131, 0.092, 0.088, -0.008, 2.5, 2.6],
  [1.252, 0.122, 0.082, 0.083, -0.010, 2.5, 2.5],
  [1.270, 0.11, 0.072, 0.076, -0.012, 2.4, 2.4],
  [1.283, 0.106, 0.062, 0.068, -0.013, 2.4, 2.4],
  [1.295, 0.088, 0.054, 0.06, -0.014, 2.3, 2.3],
  [1.307, 0.066, 0.046, 0.05, -0.015, 2.2, 2.2],
  [1.318, 0.044, 0.038, 0.042, -0.016, 2.0, 2.0],
];

export function torsoPart(P) {
  const k = P.k, W = P.W, fem = P.fem;
  const rows = (fem ? TORSO_F : TORSO_M).map(r => [P.yInv(r[0] * k), r[1] * W, r[2] * W, r[3] * W, r[4], r[5], r[6]]);
  const T = table(rows);
  const y0 = rows[0][0], y1 = rows[rows.length - 1][0];
  const Y = v => v * k;     // base-scale heights → this body
  // muscle relief, R side (θ > 0 toward +x); torso is symmetric so |θ| is used
  function relief(y, th) {
    const a = Math.abs(th);
    let d = 0;
    if (!fem) {
      // pectorals: a broad plate with a crisp lower edge
      d += 0.02 * smooth(Y(1.205), Y(1.25), y) * (1 - smooth(Y(1.33), Y(1.41), y)) * gauss(adiff(a, 0.5), 0.45);
      d -= 0.005 * gauss(a, 0.09) * smooth(Y(1.18), Y(1.24), y) * (1 - smooth(Y(1.36), Y(1.42), y));   // sternum groove
      // abdominals: rectus plate, the line down the middle, three cross grooves
      const absZone = smooth(Y(0.96), Y(1.01), y) * (1 - smooth(Y(1.18), Y(1.22), y));
      d += 0.009 * absZone * gauss(a, 0.42);
      d -= 0.0045 * absZone * gauss(a, 0.055);
      for (const gy of [1.065, 1.115, 1.165]) d -= 0.004 * gauss(y - Y(gy), 0.008) * gauss(a, 0.34) * absZone;
      // obliques bulge over the hip, then the lower "V" groove toward the groin
      d += 0.007 * gauss(y - Y(1.02), 0.04) * gauss(adiff(a, 1.15), 0.3);
      const vline = Y(0.92) + (a - 0.18) * 0.16 * k;      // groove rises toward the side
      d -= 0.005 * gauss(y - vline, 0.012) * smooth(0.15, 0.3, a) * (1 - smooth(0.9, 1.1, a)) * (1 - smooth(Y(1.04), Y(1.07), y));
      // serratus fingers on the side of the ribs
      d += 0.004 * gauss(adiff(a, 1.05), 0.12) * gauss(y - Y(1.2), 0.05) * (0.5 + 0.5 * Math.sin(y / k * 160));
      // back: lats, shoulder blades, spine groove, lower back erectors
      d += 0.012 * gauss(adiff(a, 2.0), 0.35) * smooth(Y(1.12), Y(1.2), y) * (1 - smooth(Y(1.32), Y(1.38), y));
      d += 0.009 * gauss(adiff(a, 2.55), 0.3) * gauss(y - Y(1.31), 0.045);
      d -= 0.008 * gauss(adiff(a, PI), 0.1) * smooth(Y(0.98), Y(1.04), y) * (1 - smooth(Y(1.4), Y(1.44), y));
      d += 0.007 * gauss(adiff(a, 2.85), 0.15) * gauss(y - Y(1.07), 0.05);
      // glutes + cleft (under the briefs, but they shape the briefs)
      d += 0.014 * gauss(adiff(a, 2.55), 0.4) * gauss(y - Y(0.9), 0.045);
      d -= 0.01 * gauss(adiff(a, PI), 0.07) * (1 - smooth(Y(0.88), Y(0.96), y));
      // trapezius: thick from the neck out to the shoulder
      d += 0.016 * gauss(adiff(a, 2.0), 0.8) * gauss(y - Y(1.45), 0.03);
      // collarbones
      d += 0.004 * gauss(y - (Y(1.405) + (a - 0.3) * 0.02 * k), 0.006) * gauss(adiff(a, 0.75), 0.35);
    } else {
      // bust: two rounded forms, a crease below them
      const by = Y(1.225), bt = 0.5;
      d += 0.032 * gauss(y - by, 0.045 * k) * gauss(adiff(a, bt), 0.36) * (1 - 0.35 * smooth(by, by + 0.06 * k, y));
      d += 0.008 * gauss(y - by - 0.03 * k, 0.04) * gauss(adiff(a, 0.75), 0.45);   // upper chest fill
      d -= 0.004 * gauss(a, 0.07) * gauss(y - by, 0.03);                            // cleavage
      // toned abdomen: a soft centre line, two faint cross grooves
      const absZone = smooth(Y(0.94), Y(0.99), y) * (1 - smooth(Y(1.13), Y(1.17), y));
      d += 0.004 * absZone * gauss(a, 0.4);
      d -= 0.0022 * absZone * gauss(a, 0.05);
      for (const gy of [1.04, 1.095]) d -= 0.0014 * gauss(y - Y(gy), 0.008) * gauss(a, 0.3) * absZone;
      d += 0.003 * gauss(y - Y(0.99), 0.035) * gauss(adiff(a, 1.15), 0.3);
      // back: shoulder blades, spine, small of the back, glutes
      d += 0.005 * gauss(adiff(a, 2.5), 0.32) * gauss(y - Y(1.25), 0.045);
      d -= 0.005 * gauss(adiff(a, PI), 0.1) * smooth(Y(0.95), Y(1.0), y) * (1 - smooth(Y(1.33), Y(1.37), y));
      d += 0.010 * gauss(adiff(a, 2.5), 0.42) * gauss(y - Y(0.872), 0.048);
      d -= 0.01 * gauss(adiff(a, PI), 0.07) * (1 - smooth(Y(0.86), Y(0.93), y));
      d += 0.005 * gauss(adiff(a, 2.0), 0.6) * gauss(y - Y(1.355), 0.02);
      d += 0.0025 * gauss(y - (Y(1.345) + (a - 0.3) * 0.016 * k), 0.005) * gauss(adiff(a, 0.75), 0.35);
    }
    return d;
  }
  // flattening between the legs: the bottom rows are pinched front-to-back at the sides so thighs can leave
  function at(y, th, opt = {}) {
    th = wrapPi(th);
    const [hw, zf, zb, cz, pf, pb] = T(y);
    const s = Math.sin(th), c = Math.cos(th);
    let r = superR(s, c, hw, c >= 0 ? zf : zb, c >= 0 ? pf : pb);
    r += relief(y, th) * (opt.bump ?? 1) * (fem ? 2.0 : 2.3);   // v2: stronger relief (v1 1.8)
    if (opt.pad) r += opt.pad(y, th);
    const yy = P.yMap(y);
    return { p: [s * r, yy, cz + c * r], w: weights(yy, s * r, cz + c * r) };
  }
  function weights(y, x, z) {
    const ax = Math.abs(x), side = x >= 0 ? 'R' : 'L';
    const spineW = smooth(P.hipsY + 0.02, P.spineY + 0.03, y), chestW = smooth(P.spineY + 0.06, P.chestY + 0.02, y), neckW = smooth(P.neckY - 0.02, P.neckY + 0.015, y);
    let w = [['hips', 1 - spineW], ['spine', spineW * (1 - chestW)], ['chest', chestW * (1 - neckW)], ['neck', neckW]];
    // shoulders follow the arm a little, the clavicle more
    const sh = smooth(0.1 * P.W, 0.19 * P.W, ax) * smooth(P.shoulderY - 0.1 * k, P.shoulderY - 0.01, y);
    if (sh > 0) { w = w.map(([b, v]) => [b, v * (1 - sh)]); w.push(['clav' + side, sh * 0.6], ['arm' + side, sh * 0.4]); }
    // hip and buttock follow the thigh
    const lg = smooth(P.hipY + 0.06 * k, P.crotchY, y) * smooth(0.02, 0.1, ax) * 0.6;
    if (lg > 0) { w = w.map(([b, v]) => [b, v * (1 - lg)]); w.push(['leg' + side, lg]); }
    return w;
  }
  // rows: denser at the chest and hips
  // rows: few under the briefs (always hidden), dense where the muscles are (a groove needs rows closer than it is wide)
  const bt = (fem ? BRIEF_TOP.fem : BRIEF_TOP.masc) * k;
  const us = [y0, y0 + 0.012 * k, y0 + 0.04 * k, lerp(y0, bt, 0.6), bt - 0.03 * k];
  let y = bt - 0.018 * k;
  while (y < y1 - 0.004) { us.push(y); const dense = y > 1.0 * k && y < (fem ? 1.27 : 1.42) * k; y += (dense ? 0.0122 : 0.016) * k; }
  us.push(y1);
  /** v2: the torso's radius about its own centre at a REAL height and azimuth (for the shoulder fillet), and its skin weights. */
  function radiusAt(yReal, th) {
    const yp = P.yInv(yReal);
    if (yp < y0 || yp > y1) return null;
    const cz = T(yp)[3], q = at(yp, th).p;
    return { r: Math.hypot(q[0], q[2] - cz), cz };
  }
  /** v2: the point on the torso skin at p's height in p's direction from the torso's centre line (clamped to the torso's
   *  height range), and its skin weights. The shoulder patch (armPart) is laid on the torso with it. */
  const yTop = P.yMap(y1) - 0.004, yBot = P.yMap(y0) + 0.004;
  function project(p, offset = 0) {
    const y = clamp(p[1], yBot, yTop), cz0 = T(P.yInv(y))[3];
    const th = Math.atan2(p[0], p[2] - cz0), R = radiusAt(y, th);
    const r = R.r + offset;
    return [Math.sin(th) * r, y, R.cz + Math.cos(th) * r];
  }
  const centreZ = yReal => T(P.yInv(clamp(yReal, yBot, yTop)))[3];
  return { name: 'torso', at, us, segs: 30, y0, y1, relief, capStart: true, capEnd: true, radiusAt, weightsAt: weights, project, centreZ, yTop, yBot };
}

// ------------------------------------------------------------------------------------------------------------ neck
export function neckPart(P, torso = null) {
  const k = P.k, fem = P.fem, W = Math.sqrt(P.W);
  const y0 = P.neckY - 0.05 * k, y1 = P.headY + 0.04 * k;
  const rw = (fem ? 0.045 : 0.063) * W, rf = (fem ? 0.042 : 0.056) * W, rb = (fem ? 0.046 : 0.062) * W;   // v2: slimmer (Codex/Meshy)
  function at(y, th, opt = {}) {
    th = wrapPi(th);
    const t = (y - y0) / (y1 - y0), s = Math.sin(th), c = Math.cos(th), a = Math.abs(th);
    const flare = 1 + 0.32 * (1 - smooth(0, 0.35, t)) * (c > 0 ? 1 - 0.75 * c : 1);   // widens into the shoulders (v2: not at the front, where it poked out of the chest)
    let r = superR(s, c, rw * flare, (c >= 0 ? rf : rb) * (1 + 0.1 * (1 - smooth(0, 0.3, t))), 2.2);
    // the two neck muscles running from behind the ear down to the collarbone notch
    const line = lerp(0.35, 1.25, t);
    r += (fem ? 0.003 : 0.006) * gauss(adiff(a, line), 0.22) * smooth(0.05, 0.3, t) * (1 - smooth(0.75, 1, t)) * (opt.bump ?? 1);
    if (!fem) r += 0.005 * gauss(a, 0.18) * gauss(t - 0.55, 0.1) * (opt.bump ?? 1);        // throat
    r -= 0.004 * gauss(a, 0.25) * gauss(t - 0.05, 0.08);                                      // collarbone notch
    // the trapezius rising up the sides of the neck into the shoulders
    r += (fem ? 0.018 : 0.04) * (1 - smooth(0.12, 0.55, t)) * Math.pow(Math.abs(s), 2.5) * (c < 0.3 ? 1 : 0.6);
    const cz = lerp(fem ? -0.026 : -0.042, P.headZ - 0.006, smooth(0.1, 1, t)) + (fem ? 0.004 : 0);
    const hw = smooth(P.headY - 0.025 * k, P.headY + 0.02 * k, y), cw = 1 - smooth(y0, P.neckY - 0.005, y);
    let p = [s * r, y, cz + c * r];
    // v2: the base of the neck is blended into the trapezius (smooth union with the torso), so no jagged ring
    const near = torso ? 1 - smooth(0.25, 0.6, t) : 0;
    if (near > 0) {
      const T = torso.radiusAt(y, Math.atan2(p[0], p[2] - cz));
      if (T) {
        // points deep inside the torso stay there (a layer laid on the torso showed its edge); only a band near the
        // crossing is lifted into the fillet
        const dx = p[0], dz = p[2] - T.cz, rp = Math.hypot(dx, dz), K = 0.02 * near, band = smooth(T.r - 0.03, T.r - 0.012, rp);
        const h = clamp(0.5 + 0.5 * (T.r - rp) / K, 0, 1), rn = lerp(rp, lerp(rp, T.r, h) + K * h * (1 - h) + 0.0008 * near, band);
        if (rn > rp && rp > 1e-5) p = [dx * rn / rp, y, T.cz + dz * rn / rp];
      }
    }
    return { p, w: [['chest', cw], ['neck', (1 - cw) * (1 - hw)], ['head', hw]] };
  }
  const us = []; for (let i = 0; i <= 7; i++) us.push(y0 + (y1 - y0) * i / 7);
  return { name: 'neck', at, us, segs: 18 };
}

// ------------------------------------------------------------------------------------------------------- limb base
/**
 * A limb along a polyline of joints. rows: [s, rx, rz] (s = distance from the top end). The frame: `a` points back up
 * the limb, `f` = forward (+z made perpendicular), `x` = a × f (≈ +x). θ = 0 is the front, θ = +π/2 the +x side.
 * For a mirrored (L) limb pass sg = -1: the path is mirrored and θ is flipped, so the R-side shape holds.
 */
function limbFrame(path) {
  // path: [[s, x, y, z], ...] (sorted by s); a Catmull-Rom centre line
  const C = table(path);
  const s0 = path[0][0], s1 = path[path.length - 1][0];
  return function frame(s) {
    const c = C(s).slice();
    const e = 0.004, a0 = C(Math.max(s0, s - e)).slice(), a1 = C(Math.min(s1, s + e)).slice();
    const up = norm(sub(a0, a1));
    let f = [0, 0, 1]; f = norm(sub(f, mul(up, dot(f, up))));
    const x = cross(up, f);
    return { c, up, f, x };
  };
}

function chainWeights(s, chain, blend) {
  // chain: [[bone, sStart], ...]; between consecutive bones a smooth blend of ±blend around the joint
  let w = [[chain[0][0], 1]];
  for (let i = 1; i < chain.length; i++) {
    const [b, at] = chain[i], bw = Array.isArray(blend) ? blend[i - 1] : blend;
    const m = smooth(at - bw, at + bw, s);
    if (m <= 0) break;
    w = w.map(([n, v]) => [n, v * (1 - m)]); w.push([b, m]);
  }
  return w;
}

// ------------------------------------------------------------------------------------------------------------- arm
const ARM_M = [
  [0.000, 0.006, 0.006], [0.012, 0.03, 0.034], [0.030, 0.05, 0.054], [0.050, 0.062, 0.062], [0.080, 0.064, 0.063],
  [0.110, 0.061, 0.061], [0.150, 0.060, 0.064], [0.200, 0.058, 0.063], [0.250, 0.051, 0.055], [0.290, 0.044, 0.046],
  [0.320, 0.042, 0.045], [0.350, 0.050, 0.050], [0.390, 0.054, 0.051], [0.440, 0.047, 0.046], [0.490, 0.038, 0.040],
  [0.540, 0.029, 0.034], [0.575, 0.021, 0.026], [0.600, 0.014, 0.018],
];
const ARM_F = [
  [0.000, 0.005, 0.005], [0.012, 0.025, 0.027], [0.030, 0.041, 0.043], [0.050, 0.050, 0.050], [0.080, 0.051, 0.050],
  [0.110, 0.048, 0.048], [0.150, 0.047, 0.050], [0.200, 0.045, 0.048], [0.250, 0.041, 0.043], [0.280, 0.038, 0.039],
  [0.306, 0.036, 0.037], [0.335, 0.041, 0.039], [0.370, 0.042, 0.039], [0.415, 0.037, 0.035], [0.460, 0.03, 0.031],
  [0.500, 0.023, 0.026], [0.541, 0.017, 0.021], [0.560, 0.012, 0.015],
];
export function armPart(P, sg, torso = null) {
  const fem = P.fem, k = P.k, W = Math.sqrt(P.W), side = sg < 0 ? 'L' : 'R';
  const A = P.arm, X = p => [p[0] * sg, p[1], p[2]];
  const sh = X(A.sh), el = X(A.el), wr = X(A.wr);
  const upA = norm(sub(sh, el));
  // v2: the arm starts on top of the shoulder, inboard along the trapezius, so its first rings rise out of the slope of
  // the shoulder and the deltoid caps the joint (v1 started it 3 cm up the arm's axis: a pad sitting on a flat shelf)
  const capTop = add(sh, [-(fem ? 0.04 : 0.048) * sg, (fem ? 0.012 : 0.016) * k, 0.0]);
  const sJ = len(sub(sh, capTop)), sE = sJ + P.upperArm, sW = sE + P.foreArm;
  const raw = fem ? ARM_F : ARM_M;
  // rows are written for the male lengths; stretch them onto this arm's joints
  const mS = fem ? [0.036, 0.306, 0.541] : [0.036, 0.326, 0.586];
  const mapS = s => s <= mS[0] ? s / mS[0] * sJ : s <= mS[1] ? sJ + (s - mS[0]) / (mS[1] - mS[0]) * (sE - sJ) : sE + (s - mS[1]) / (mS[2] - mS[1]) * (sW - sE);
  const rows = raw.map(r => [mapS(r[0]), r[1] * W * 1.12, r[2] * W * 1.1]);
  const R = table(rows);
  const end = rows[rows.length - 1][0];
  const frame = limbFrame([[0, ...capTop], [sJ, ...sh], [sE, ...el], [sW, ...wr], [sW + 0.05, ...add(wr, mul(norm(sub(wr, el)), 0.05))]]);
  function relief(s, th) {
    let d = 0; const a = th;                    // R-side angle: +π/2 = outside of the arm
    const up = (s - sJ) / (sE - sJ), fo = (s - sE) / (sW - sE);
    const m = fem ? 0.8 : 1;
    // deltoid: three heads over the cap, a groove where it inserts
    d += 0.004 * m * gauss(adiff(a, 0.6), 0.5) * gauss(s - sJ * 1.2, 0.04);
    d -= 0.004 * m * gauss(up - 0.35, 0.04) * gauss(adiff(a, 1.3), 0.5);
    // biceps front, triceps back (horseshoe)
    d += 0.007 * m * gauss(adiff(a, 0.1), 0.6) * gauss(up - 0.62, 0.2);
    d += 0.006 * m * gauss(adiff(a, PI - 0.3), 0.55) * gauss(up - 0.42, 0.18);
    d -= 0.002 * m * gauss(adiff(a, 1.5), 0.15) * smooth(0.4, 0.6, up) * (1 - smooth(0.85, 0.95, up));
    // elbow point and forearm mass (brachioradialis on the outside, flexors inside)
    d += 0.004 * gauss(adiff(a, PI), 0.35) * gauss(s - sE, 0.012);
    d += 0.005 * m * gauss(adiff(a, 0.9), 0.5) * gauss(fo - 0.2, 0.14);
    d += 0.003 * m * gauss(adiff(a, -0.9), 0.5) * gauss(fo - 0.25, 0.14);
    // wrist bone on the outside
    d += 0.0025 * gauss(adiff(a, 1.9), 0.3) * gauss(s - sW + 0.008, 0.01);
    return d;
  }
  /** The arm's own tube (v1's surface): frame + superellipse section + muscle relief. */
  function section(s, th, opt = {}) {
    const F = frame(s), [rx, rz] = R(s);
    const t = wrapPi(sg < 0 ? -th : th);                 // mirror the shape for the L arm
    const sn = Math.sin(t), cs = Math.cos(t);
    let r = superR(sn, cs, rx, rz, 2.15) + relief(s, t) * (opt.bump ?? 1) * (fem ? 2.2 : 2.6);
    if (opt.pad) r += opt.pad(s, t);
    return add(F.c, add(mul(F.x, Math.sin(th) * r), mul(F.f, cs * r)));
  }
  // ---- v2: THE SHOULDER PATCH. The top of the arm (s < sR) is not a tube stuck into the torso: it is a patch whose
  // first row is a ring lying ON the torso skin around the shoulder (the arm's section at sR, enlarged and projected
  // onto the torso), and whose rows sweep out of the torso along a Bezier into the arm's tube at sR, with the deltoid
  // swelling over the top. The ring vertices carry the torso's own skin weights, blending to the arm's by sR, so the
  // join stretches like skin in every clip instead of opening a step; the torso skin (and shirt) inside the ring is not
  // drawn (COVER.PATCH, see patchHit). Without a torso (tools that build an arm alone) the plain tube is used.
  const sR = sJ + (fem ? 0.045 : 0.055) * k;
  const FR = torso ? frame(sR) : null;
  // the ring: an ellipse drawn on the torso's skin around the shoulder joint, in the torso's own (azimuth, height)
  // chart — up onto the trapezius over the top, down to the armpit underneath, a hand's width front to back. Ring
  // angle t (the arm's own section angle, mirrored for L) maps +π/2 (outside of the arm) to the top of the ring.
  const shP = sh, czS = torso ? torso.centreZ(shP[1]) : 0;
  const phiC = Math.atan2(Math.abs(shP[0]), shP[2] - czS), yC = shP[1] + (fem ? 0.004 : 0.006) * k;
  const rUp = (fem ? 0.058 : 0.074) * k, rDn = (fem ? 0.064 : 0.088) * k, rSide = (fem ? 0.062 : 0.078) * Math.sqrt(P.W);
  function ringAt(th, opt) {
    const pR = section(sR, th, opt), t = wrapPi(sg < 0 ? -th : th);
    const y = yC + Math.sin(t) * (Math.sin(t) > 0 ? rUp : rDn);
    const rT = torso.radiusAt(clamp(y, torso.yBot, torso.yTop), phiC)?.r ?? 0.18;
    const phi = phiC - Math.cos(t) * rSide / rT;                     // front (cos t > 0) is toward smaller azimuth
    const R0 = torso.radiusAt(clamp(y, torso.yBot, torso.yTop), phi);
    const q = [sg * Math.sin(phi) * R0.r, clamp(y, torso.yBot, torso.yTop), R0.cz + Math.cos(phi) * R0.r];
    return { pR, q, t };
  }
  function at(s, th, opt = {}) {
    if (!torso || s >= sR) return { p: section(s, th, opt), w: weights(s) };
    const { pR, q, t } = ringAt(th, opt);
    const u = clamp(s / sR, 0, 1);
    const L = len(sub(pR, q));
    const P1 = torso.project(lerp3(q, pR, 0.38), 0.002);                // leaves the torso along its skin
    const P2 = add(pR, mul(FR.up, 0.38 * L));                            // enters the arm along its axis
    const v = 1 - u, b0 = v * v * v, b1 = 3 * v * v * u, b2 = 3 * v * u * u, b3 = u * u * u;
    let p = [0, 1, 2].map(i => b0 * q[i] + b1 * P1[i] + b2 * P2[i] + b3 * pR[i]);
    // the deltoid's dome over the top and front of the patch
    const radial = norm(sub(pR, FR.c)), dome = (fem ? 0.006 : 0.011) * Math.sin(PI * Math.pow(u, 0.8)) * (0.35 + 0.65 * smooth(-0.6, 0.9, Math.sin(t) + 0.4 * Math.cos(t))) * (opt.bump ?? 1);
    p = add(p, mul(radial, dome + 0.0008 * (1 - u)));
    // skin weights: the torso's at the ring, the arm's at sR
    const m = smooth(Math.sin(t) < 0 ? 0.3 : 0.12, 1.0, u), tw = torso.weightsAt(p[1], p[0], p[2]), aw = weights(sR), map = new Map();
    for (const [bn, val] of tw) map.set(bn, (map.get(bn) || 0) + val * (1 - m));
    for (const [bn, val] of aw) map.set(bn, (map.get(bn) || 0) + val * m);
    return { p, w: [...map.entries()] };
  }
  // the ring in an unrolled chart of the torso (azimuth × height), for the "is this torso point under the patch" test
  let chart = null;
  const toChart = p => [Math.atan2(Math.abs(p[0]), p[2] - torso.centreZ(p[1])) * 0.17, p[1]];
  function patchHit(p) {
    if (!torso || p[0] * sg < 0.04) return false;
    if (!chart) {
      const pts = []; for (let i = 0; i < 48; i++) pts.push(toChart(ringAt(i / 48 * PI * 2, {}).q));
      const c = pts.reduce((a, q) => [a[0] + q[0] / pts.length, a[1] + q[1] / pts.length], [0, 0]);
      chart = pts.map(q => { const d = [q[0] - c[0], q[1] - c[1]], l = Math.hypot(d[0], d[1]) || 1; return [q[0] - d[0] / l * 0.0015, q[1] - d[1] / l * 0.0015]; });   // 1.5 mm inside the ring
    }
    const [x, y] = toChart(p); let inside = false;
    for (let i = 0, j = chart.length - 1; i < chart.length; j = i++) {
      const [xi, yi] = chart[i], [xj, yj] = chart[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function weights(s) {
    let w = chainWeights(s, [['clav' + side, 0], ['arm' + side, 0.012 * k], ['elbow' + side, sE], ['hand' + side, sW - 0.004]], [0.03 * k, 0.03 * k, 0.012 * k]);
    return w;
  }
  let us = [];
  for (const r of rows) us.push(r[0]);
  // add rows in the long spans so the silhouette stays round when bent
  const extra = [sJ + 0.5 * (sE - sJ), sE - 0.018, sE + 0.018, sE + 0.55 * (sW - sE)];
  for (const e of extra) us.push(e);
  if (torso) us = [...[0, 0.14, 0.3, 0.48, 0.66, 0.84].map(f => f * sR), ...us.filter(u => u >= sR)];
  // the patch's winding and normals: "outside" is away from the torso there; at the ring the normal is the torso's
  // own, so the light does not change across the join
  const tNormal = p => {
    const e = 0.006, a = torso.project([p[0], p[1] + e, p[2]]), b2 = torso.project([p[0], p[1] - e, p[2]]);
    const ang = Math.atan2(p[0], p[2] - torso.centreZ(p[1])), r = Math.hypot(p[0], p[2] - torso.centreZ(p[1]));
    const c = torso.project([Math.sin(ang + 0.03) * r, p[1], torso.centreZ(p[1]) + Math.cos(ang + 0.03) * r]), d = torso.project([Math.sin(ang - 0.03) * r, p[1], torso.centreZ(p[1]) + Math.cos(ang - 0.03) * r]);
    let n = norm(cross(sub(c, d), sub(a, b2)));
    if (n[0] * p[0] + n[2] * (p[2] - torso.centreZ(p[1])) < 0) n = mul(n, -1);
    return n;
  };
  const out = torso ? (p, u) => u < sR ? add(norm([p[0], 0, p[2] - torso.centreZ(p[1])]), norm(sub(p, FR.c))) : sub(p, frame(u).c) : undefined;
  const normal = torso ? (u, th, p, n) => { const m = 1 - smooth(0.0, 0.45, u / sR); return m > 0 ? norm(mix3(n, tNormal(p), m)) : n; } : undefined;
  us.sort((a, b) => a - b);
  return { name: 'arm' + side, at, us: dedupe(us.filter(u => u <= end)), segs: 14, capStart: !torso, sJ, sE, sW, sR: torso ? sR : 0, end, frame, side, sg, patchHit, out, normal };
}

function dedupe(a) { const out = []; for (const v of a) if (!out.length || Math.abs(v - out[out.length - 1]) > 0.003) out.push(v); return out; }

// ------------------------------------------------------------------------------------------------------------- leg
const LEG_M = [
  [-0.020, 0.056, 0.075], [0.020, 0.070, 0.090], [0.060, 0.080, 0.096], [0.120, 0.090, 0.097], [0.200, 0.090, 0.095],
  [0.280, 0.084, 0.092], [0.350, 0.071, 0.082], [0.410, 0.059, 0.068], [0.445, 0.056, 0.062], [0.475, 0.055, 0.059],
  [0.510, 0.056, 0.058], [0.540, 0.060, 0.064], [0.575, 0.066, 0.070], [0.610, 0.066, 0.069], [0.650, 0.058, 0.062],
  [0.700, 0.048, 0.053], [0.750, 0.040, 0.045], [0.800, 0.035, 0.038], [0.865, 0.030, 0.032], [0.890, 0.030, 0.033],
  [0.920, 0.031, 0.036],
];
const LEG_F = [
  [-0.020, 0.048, 0.068], [0.020, 0.058, 0.082], [0.060, 0.068, 0.088], [0.120, 0.081, 0.090], [0.200, 0.084, 0.087],
  [0.280, 0.076, 0.080], [0.340, 0.061, 0.068], [0.390, 0.056, 0.058], [0.420, 0.052, 0.054], [0.450, 0.050, 0.052],
  [0.485, 0.050, 0.054], [0.520, 0.055, 0.060], [0.555, 0.060, 0.063], [0.590, 0.061, 0.062], [0.630, 0.054, 0.057],
  [0.680, 0.043, 0.047], [0.730, 0.035, 0.037], [0.780, 0.029, 0.030], [0.830, 0.026, 0.028], [0.855, 0.027, 0.029],
  [0.880, 0.028, 0.032],
];
export function legPart(P, sg, foot = null, torso = null) {
  const fem = P.fem, k = P.k, W = P.W, side = sg < 0 ? 'L' : 'R';
  const L = P.leg, X = p => [p[0] * sg, p[1], p[2]];
  const hip = X(L.hip), knee = X(L.knee), ankle = X(L.ankle);
  const top = add(hip, [-0.012 * sg, 0.06 * k, 0]);
  const sH = 0.06 * k, sK = sH + len(sub(hip, knee)), sA = sK + len(sub(knee, ankle));
  const mS = fem ? [0.06, 0.445, 0.855] : [0.06, 0.465, 0.89];
  const mapS = s => s <= mS[0] ? s / mS[0] * sH : s <= mS[1] ? sH + (s - mS[0]) / (mS[1] - mS[0]) * (sK - sH) : sK + (s - mS[1]) / (mS[2] - mS[1]) * (sA - sK);
  const rows = (fem ? LEG_F : LEG_M).map(r => [mapS(r[0]), r[1] * W, r[2] * W]);
  const R = table(rows);
  const frame = limbFrame([[rows[0][0] - 0.01, ...add(top, [0, 0.02, 0])], [0, ...top], [sH, ...hip], [sK, ...knee], [sA, ...ankle], [sA + 0.05, ...add(ankle, [0, -0.05, 0])]]);
  function relief(s, a) {
    let d = 0; const th = (s - sH) / (sK - sH), sh = (s - sK) / (sA - sK), m = fem ? 0.85 : 1;
    d += 0.007 * m * gauss(adiff(a, 0.1), 0.6) * gauss(th - 0.45, 0.25);                 // quads, front
    d += 0.006 * m * gauss(adiff(a, 1.25), 0.45) * gauss(th - 0.5, 0.22);                // outer quad sweep
    d += 0.012 * m * gauss(adiff(a, -0.95), 0.38) * gauss(th - 0.88, 0.075);              // teardrop above the knee, inside
    d += 0.004 * m * gauss(adiff(a, -1.9), 0.5) * gauss(th - 0.3, 0.2);                 // inner thigh
    d -= 0.003 * m * gauss(adiff(a, 1.45), 0.12) * gauss(th - 0.6, 0.25);                // iliotibial groove
    d += 0.004 * m * gauss(adiff(a, PI - 0.2), 0.7) * gauss(th - 0.35, 0.25);            // hamstrings
    if (fem) d += 0.01 * gauss(adiff(a, PI - 0.25), 0.75) * gauss(th - 0.12, 0.13);   // the lower buttock over the thigh
    d += 0.007 * gauss(a, 0.33) * gauss(s - sK + 0.006, 0.013);                          // knee cap
    d -= 0.0025 * gauss(a, 0.5) * gauss(s - sK + 0.026, 0.008);                          // v2: the dip above the knee cap
    d += 0.0035 * gauss(adiff(a, PI - 0.75), 0.25) * gauss(s - sK, 0.03);               // v2: hamstring tendons either side of the knee
    d += 0.0035 * gauss(adiff(a, -PI + 0.75), 0.25) * gauss(s - sK, 0.03);
    d -= 0.002 * m * gauss(adiff(a, 0.7), 0.12) * gauss(th - 0.55, 0.22);                // v2: groove between the front and outer quad
    // v2: the calf is a diamond — the outer head higher, the inner one lower and bigger, both easing into the Achilles
    d += 0.011 * m * gauss(adiff(a, PI - 0.55), 0.48) * gauss(sh - (fem ? 0.3 : 0.25), 0.16);          // calf, outer head
    d += 0.013 * m * gauss(adiff(a, -PI + 0.6), 0.5) * gauss(sh - (fem ? 0.35 : 0.3), 0.17);          // calf, inner head (lower)
    d -= 0.002 * gauss(adiff(a, PI), 0.35) * smooth(0.45, 0.8, sh) * (1 - smooth(0.85, 0.97, sh));   // v2: either side of the Achilles
    d -= 0.0025 * gauss(adiff(a, PI), 0.12) * gauss(sh - 0.28, 0.14);                   // between the heads
    d += 0.002 * gauss(a, 0.22) * smooth(0.1, 0.3, sh) * (1 - smooth(0.7, 0.9, sh));    // shin bone
    d += 0.006 * gauss(adiff(a, -1.45), 0.3) * gauss(s - sA + 0.004, 0.012);            // ankle bone inside
    d += 0.005 * gauss(adiff(a, 1.5), 0.3) * gauss(s - sA + 0.012, 0.012);              // ankle bone outside
    return d;
  }
  function at(s, th, opt = {}) {
    const F = frame(s), [rx, rz] = R(s);
    const t = wrapPi(sg < 0 ? -th : th);
    const sn = Math.sin(t), cs = Math.cos(t);
    let r = superR(sn, cs, rx, rz, 2.1) + relief(s, t) * (opt.bump ?? 1) * (fem ? 2.2 : 2.5);
    if (opt.pad) r += opt.pad(s, t);
    let p = add(F.c, add(mul(F.x, Math.sin(th) * r), mul(F.f, cs * r + fwd(s))));
    // v2 hip fillet: the top of the thigh is blended into the torso (no seam where the two cross under the underwear)
    const nearT = torso ? 1 - smooth(sH + 0.02 * k, sH + 0.12 * k, s) : 0;
    if (nearT > 0) {
      const T = torso.radiusAt(p[1], Math.atan2(p[0], p[2]));
      if (T) {
        const dx = p[0], dz = p[2] - T.cz, rp = Math.hypot(dx, dz), K = 0.025 * nearT;
        const h = clamp(0.5 + 0.5 * (T.r - rp) / K, 0, 1), rn = lerp(rp, T.r, h) + K * h * (1 - h) + 0.001 * nearT;
        if (rn > rp && rp > 1e-5) p = [dx * rn / rp, p[1], T.cz + dz * rn / rp];
      }
    }
    // v2 ankle fillet: like the shoulder, the bottom of the leg is blended into the top of the foot (no ragged ring)
    const near = foot ? smooth(sA - 0.075 * k, sA - 0.015 * k, s) : 0;
    if (near > 0) {
      const R0 = foot.radiusAt(p);
      if (R0) {
        const K = 0.03 * near, dx = p[0] - R0.c[0], dy = p[1] - R0.c[1], rp = Math.hypot(dx, dy);
        const h = clamp(0.5 + 0.5 * (R0.r - rp) / K, 0, 1), rn = lerp(rp, R0.r, h) + K * h * (1 - h) + 0.001 * near;
        if (rn > rp && rp > 1e-5) p = [R0.c[0] + dx * rn / rp, R0.c[1] + dy * rn / rp, p[2]];
      }
    }
    return { p, w: weights(s) };
  }
  // v2: the thigh's section sits forward of the bone (quads in front, flat hamstrings), the calf's behind it
  const fwd = s => { const th = (s - sH) / (sK - sH), sh = (s - sK) / (sA - sK); return 0.014 * smooth(fem ? 0.1 : -0.1, fem ? 0.45 : 0.25, th) * (1 - smooth(0.75, 1.05, th)) - 0.006 * gauss(sh - 0.3, 0.2); };
  function weights(s) {
    return chainWeights(s, [['hips', -1], ['leg' + side, 0.03 * k], ['knee' + side, sK], ['foot' + side, sA - 0.01]], [0.05 * k, 0.035 * k, 0.018 * k]);
  }
  const us = rows.map(r => r[0]);
  for (const e of [sH + 0.25 * (sK - sH), sK + 0.38 * (sA - sK), sK - 0.02, sK + 0.02]) us.push(e);
  us.sort((a, b) => a - b);
  return { name: 'leg' + side, at, us: dedupe(us), segs: 14, sH, sK, sA, side, sg, frame };
}

// ------------------------------------------------------------------------------------------------------------ hand
/**
 * Hand layout in bind space for side s ('L' | 'R'): a frame at the wrist (d = along the fingers, t = toward the thumb,
 * n = out of the palm) and the finger joints. Also used by the rig for the finger bones and the grip.
 */
export function handLayout(P, s) {
  const sg = s === 'L' ? -1 : 1, fem = P.fem, k = P.k;
  const A = P.arm, X = p => [p[0] * sg, p[1], p[2]];
  const el = X(A.el), wr = X(A.wr);
  const d = norm(sub(wr, el));
  // palm faces the thigh, turned a little backward (a relaxed hang)
  let n = rot([-sg, 0, 0], d, sg * 0.32);
  n = norm(sub(n, mul(d, dot(n, d))));
  let t = norm(sub(sub([0, 0, 1], mul(d, d[2])), mul(n, dot([0, 0, 1], n))));
  const H = fem ? 1.08 : 1.22;
  const palm = P.palm;
  const L = (a, b, c) => add(wr, add(mul(d, a), add(mul(t, b), mul(n, -c))));   // c > 0 = back of the hand
  const fingers = {
    index: { b: 0.026 * H, len: 0.074 * H, r: 0.0094 * H, splay: 0.06, a: palm * 0.97 },
    middle: { b: 0.008 * H, len: 0.082 * H, r: 0.0098 * H, splay: 0.0, a: palm },
    ring: { b: -0.010 * H, len: 0.077 * H, r: 0.0091 * H, splay: -0.06, a: palm * 0.97 },
    pinky: { b: -0.027 * H, len: 0.06 * H, r: 0.0080 * H, splay: -0.15, a: palm * 0.91 },
  };
  const out = { d, t, n, sg, L, palm, fingers, H };
  for (const [name, F] of Object.entries(fingers)) {
    const base = L(F.a, F.b, 0.0);
    const dir = norm(rot(d, n, -F.splay * 0));     // splay applied in mesh only via base offsets
    const sp = norm(add(dir, mul(t, F.splay)));
    F.base = base; F.dir = sp;
    out[name] = [base, add(base, mul(sp, F.len * 0.46))];
  }
  // thumb: from the heel of the palm, angled toward the front and across the palm
  const tb = L(0.012 * H, 0.022 * H, -0.006 * H);
  const tdir = norm(add(add(mul(d, 0.62), mul(t, 0.62)), mul(n, 0.42)));
  out.thumbInfo = { base: tb, dir: tdir, len: 0.068 * H, r: 0.0115 * H };
  out.thumb = [tb, add(tb, mul(tdir, 0.068 * H * 0.5))];
  out.grip = L(palm * 0.62, 0.004, -0.028 * H);
  return out;
}

export function handParts(P, s, lay) {
  const sg = lay.sg, k = P.k, H = lay.H, palm = lay.palm;
  const parts = [];
  const { d, t, n } = lay;
  // ---- palm: rows along d, cross-section a rounded box in (t, back)
  const rows = table([
    [-0.016, 0.026, 0.019, 0.0], [0.0, 0.029, 0.02, 0.0], [0.022, 0.035, 0.021, 0.001], [0.05, 0.04, 0.019, 0.001],
    [0.075, 0.043, 0.0165, 0.0], [0.088, 0.043, 0.0145, 0.0], [0.097, 0.039, 0.012, 0.0],
  ].map(r => [r[0] * H * (palm / 0.092 / H), r[1] * H, r[2] * H, r[3] * H]));
  const end = 0.097 * palm / 0.092;
  const palmUs = [-0.016, 0, 0.022, 0.04, 0.06, 0.075, 0.088, 0.097].map(v => v * palm / 0.092);
  parts.push({
    name: 'palm' + s, us: palmUs, segs: 12, capEnd: true,
    at(a, th, opt = {}) {
      const [hb, hc, oc] = rows(a);
      const sn = Math.sin(th), cs = Math.cos(th);    // θ=0 → +t (thumb side), θ=π/2 → back of the hand
      const r = superR(sn, cs, hc, hb, 2.2);
      let bb = cs * r, cc = sn * r + oc;
      // thenar (thumb ball) on the palm side near the thumb, the heel of the hand under the pinky
      const palmSide = Math.max(0, -sn);
      cc -= 0.007 * H * palmSide * gauss(bb / H - 0.018, 0.016) * gauss(a / palm - 0.22, 0.2) * (opt.bump ?? 1);
      cc -= 0.004 * H * palmSide * gauss(bb / H + 0.02, 0.016) * gauss(a / palm - 0.3, 0.25) * (opt.bump ?? 1);
      // knuckles on the back
      if (sn > 0) for (const f of Object.values(lay.fingers)) cc += 0.0028 * H * sn * gauss(bb - f.b, 0.006) * gauss(a - f.a + 0.004, 0.008) * (opt.bump ?? 1);
      // tendons on the back of the hand
      if (sn > 0) for (const f of Object.values(lay.fingers)) cc += 0.0009 * H * sn * gauss(bb - f.b * 0.8, 0.003) * smooth(0.25, 0.5, a / palm) * (1 - smooth(0.8, 0.95, a / palm));
      const p = lay.L(a, bb, cc);
      return { p, w: handW(a, bb) };
    },
  });
  function handW(a, bb) {
    let w = [['elbow' + s, 1 - smooth(-0.012, 0.006, a)], ['hand' + s, smooth(-0.012, 0.006, a)]];
    // the knuckle end follows the nearest finger a little
    const m = smooth(palm * 0.78, palm * 1.02, a) * 0.55;
    if (m > 0) {
      let best = null, bd = 1;
      for (const [nm, f] of Object.entries(lay.fingers)) { const dd = Math.abs(bb - f.b); if (dd < bd) { bd = dd; best = nm; } }
      w = w.map(([b, v]) => [b, v * (1 - m)]); w.push([best + '1' + s, m]);
    }
    // thumb ball follows the thumb
    const tm = gauss(bb / H - 0.02, 0.014) * gauss(a / palm - 0.2, 0.18) * 0.5;
    if (tm > 0.01) { w = w.map(([b, v]) => [b, v * (1 - tm)]); w.push(['thumb1' + s, tm]); }
    return w;
  }
  // ---- fingers and thumb: tapered tubes with a rounded tip
  const finger = (nm, base, dir, L, r0, flat, isThumb) => {
    // a local frame around the finger: across = t (made perpendicular), back = finger × across
    let across = norm(sub(t, mul(dir, dot(t, dir))));
    if (isThumb) across = norm(sub(mul(n, -1), mul(dir, dot(mul(n, -1), dir))));
    const back = norm(cross(dir, across));
    const bk = dot(back, mul(n, -1)) < 0 && !isThumb ? -1 : 1;
    const us = isThumb
      ? [-0.012, 0, 0.42, 0.5, 0.58, 0.8, 0.93, 1].map(v => v * L)
      : [-0.008, 0, 0.4, 0.46, 0.52, 0.74, 0.88, 0.96, 1].map(v => v * L);
    const j1 = isThumb ? 0.5 : 0.46;
    parts.push({
      name: nm + s, us, segs: 6, capEnd: true,
      at(u, th, opt = {}) {
        const f = clamp(u / L, 0, 1);
        let r = r0 * (1 - 0.16 * f);
        if (f > 0.82) r *= Math.sqrt(Math.max(0, 1 - ((f - 0.82) / 0.18) ** 2)) * 0.9 + 0.1;
        // joints a touch wider, pads under each segment
        r *= 1 + 0.06 * gauss(f - j1, 0.05) + 0.05 * gauss(f - 0.76, 0.04);
        const sn = Math.sin(th), cs = Math.cos(th);
        const cc = sn * r * (sn > 0 ? flat : 1) * bk, bb = cs * r;
        const p = add(add(base, mul(dir, u)), add(mul(across, bb), mul(back, cc)));
        const m = smooth(j1 * L - 0.006, j1 * L + 0.006, u);
        const h = 1 - smooth(-0.008, 0.004, u);
        return { p, w: [['hand' + s, h], [nm + '1' + s, (1 - h) * (1 - m)], [nm + '2' + s, (1 - h) * m]] };
      },
      nail(u, th) { const f = u / L; return f > 0.74 && Math.sin(th) * bk > 0.35 && Math.abs(Math.cos(th)) < 0.75; },
    });
  };
  for (const [nm, f] of Object.entries(lay.fingers)) finger(nm, f.base, f.dir, f.len, f.r * 1.08, 0.9, false);
  finger('thumb', lay.thumbInfo.base, lay.thumbInfo.dir, lay.thumbInfo.len, lay.thumbInfo.r, 0.85, true);
  return parts;
}

// ------------------------------------------------------------------------------------------------------------ foot
export function footParts(P, sg) {
  const fem = P.fem, k = P.k, side = sg < 0 ? 'L' : 'R', F = P.footLen, wF = fem ? 0.9 : 1;
  const ank = [P.leg.ankle[0] * sg, P.leg.ankle[1], P.leg.ankle[2]];
  const heelZ = ank[2] - 0.058 * F / 0.258;
  // rows along the foot (z from the heel): [z, halfWidth, top, inwardShift]
  const R = table([
    [0.0, 0.012, 0.03, 0], [0.008, 0.025, 0.05, 0], [0.025, 0.031, 0.068, 0], [0.055, 0.033, 0.083, 0], [0.085, 0.035, 0.078, 0.002],
    [0.12, 0.04, 0.062, 0.004], [0.155, 0.045, 0.048, 0.006], [0.185, 0.048, 0.037, 0.007], [0.2, 0.048, 0.032, 0.007], [0.212, 0.045, 0.024, 0.007],
  ].map(r => [r[0] * F / 0.258, r[1] * wF * P.W ** 0.5, r[2] * k, r[3]]));
  const zEnd = 0.212 * F / 0.258, zBall = 0.172 * F / 0.258;
  const parts = [];
  const us = [0, 0.008, 0.025, 0.045, 0.07, 0.1, 0.13, 0.155, 0.175, 0.195, 0.212].map(v => v * F / 0.258);
  /** v2: the foot's cross-section about its own centre line, for the ankle fillet: radius toward p (x, y) at p's z. */
  const radiusAt = (p) => {
    const z = p[2] - heelZ; if (z < 0.02 || z > zEnd * 0.7) return null;
    const [hw, top, shift] = R(z), c = [ank[0] + sg * -shift, top * 0.5];
    const dx = p[0] - c[0], dy = p[1] - c[1], l = Math.hypot(dx, dy) || 1;
    return { r: superR(dx / l, dy / l, hw, top * 0.5, 2.3), c };
  };
  parts.radiusAt = radiusAt;
  parts.push({
    name: 'foot' + side, us, segs: 12, capStart: true, capEnd: true,
    at(z, th, opt = {}) {
      const [hw, top, shift] = R(z);
      const sn = Math.sin(th), cs = Math.cos(th);   // θ=0 top, π/2 → +x side
      const r = superR(sn, cs, hw, top * 0.5, 2.3);
      let x = sn * r, y = top * 0.5 + cs * r;
      // flat sole with a raised arch on the inside
      const inner = -sg * x > 0 ? 1 : 0;
      const arch = inner * 0.012 * k * gauss(z / F - 0.5, 0.17) * smooth(0.2, 0.9, -sg * x / hw);
      y = Math.max(y, 0.0015 + arch * (1 - Math.max(0, cs)));
      if (cs < -0.2) y = Math.max(0.0015 + arch, y * 0.4);
      x += sg * -shift;     // the ball of the foot sits a little inward
      // tendons over the top toward the toes
      if (cs > 0.4) y += 0.0015 * (opt.bump ?? 1) * Math.max(0, Math.sin(sn * 9)) * smooth(0.45, 0.7, z / F);
      const p = [ank[0] + x, y, heelZ + z];
      const tw = smooth(zBall - 0.01, zBall + 0.02, z);
      return { p, w: [['foot' + side, 1 - tw], ['toe' + side, tw]] };
    },
  });
  // toes: five small rounded tubes
  const toes = [
    { x: -0.024, len: 0.04, r: 0.0138, dz: 0.0 }, { x: -0.005, len: 0.035, r: 0.0098, dz: -0.002 }, { x: 0.01, len: 0.031, r: 0.0091, dz: -0.006 },
    { x: 0.023, len: 0.027, r: 0.0085, dz: -0.011 }, { x: 0.034, len: 0.022, r: 0.0078, dz: -0.017 },
  ];
  for (let i = 0; i < toes.length; i++) {
    const T = toes[i], s0 = F / 0.258;
    const bx = ank[0] + sg * T.x * wF * s0 + sg * -0.004, bz = heelZ + (0.2 + T.dz) * s0, by = T.r * 0.95 + 0.001;
    const L = T.len * s0 * wF;
    const dir = norm([sg * 0.06 * (i - 1) * 0.5, -0.12, 1]);
    parts.push({
      name: 'toe' + i + side, us: [-0.01, 0.35, 0.75, 1].map(v => v * L), segs: 5, capEnd: true,
      at(u, th) {
        const f = clamp(u / L, 0, 1);
        let r = T.r * s0 * wF * (1 - 0.15 * f);
        if (f > 0.7) r *= Math.sqrt(Math.max(0, 1 - ((f - 0.7) / 0.3) ** 2)) * 0.9 + 0.1;
        const sn = Math.sin(th), cs = Math.cos(th);
        let y = by + dir[1] * u + cs * r * 0.8; y = Math.max(0.0015, y);
        const p = [bx + dir[0] * u + sn * r, y, bz + dir[2] * u];
        return { p, w: [['toe' + side, 1]] };
      },
      nail(u, th) { return u / L > 0.55 && Math.cos(th) > 0.55; },
    });
  }
  return parts;
}
