// Kestrel (opus) — the head: skull + face as one sculpted surface, and the face pieces on top of it (eyes, lashes,
// brows, the mouth opening, teeth, ears). Numbers are in head space: metres for a 0.24 m head (chin to crown), y up
// from the chin, z forward; P.HS scales them to this body's head.
//
// What moves the face (all bones, so an expression is a few bone offsets a frame, never a geometry or material change):
//   jaw (opens; lower lip + chin skin ride it), lipU / lipD (lip centres), mouthCL / mouthCR (corners: smile, frown),
//   browIn* / browOut* (each brow bends between its two bones), eye* (squash = blink / squint / wide),
//   pupil* (gaze), lid* (the closed-lid line, scaled in at the end of a blink), cheek* (cheeks lift in a smile).
import { clamp, lerp, smooth, gauss, adiff, superR, table, add, sub, mul, norm, cross, dot, hexLin, cmix, cmul } from './kmath.js';

const PI = Math.PI;

/** Head shape settings per form. */
function headSpec(P) {
  const fem = P.fem;
  // face rows [y, halfWidth, frontDepth, backDepth, frontPower, backPower]
  const rows = fem ? [
    [0, 0.018, 0.064, 0, 2.0, 2], [0.01, 0.031, 0.074, 0.012, 2.0, 2], [0.025, 0.044, 0.081, 0.032, 2.05, 2.1], [0.045, 0.054, 0.085, 0.052, 2.1, 2.2],
    [0.065, 0.0635, 0.087, 0.072, 2.2, 2.2], [0.085, 0.0712, 0.087, 0.086, 2.3, 2.2], [0.105, 0.0755, 0.086, 0.097, 2.4, 2.2], [0.12, 0.0805, 0.085, 0.103, 2.5, 2.2],
    [0.14, 0.0839, 0.088, 0.107, 2.5, 2.2], [0.16, 0.0863, 0.091, 0.109, 2.4, 2.2], [0.18, 0.0863, 0.0877, 0.108, 2.3, 2.2], [0.2, 0.0827, 0.079, 0.101, 2.2, 2.2],
    [0.215, 0.0747, 0.0696, 0.089, 2.2, 2.2], [0.228, 0.0571, 0.0536, 0.069, 2.1, 2.1], [0.237, 0.0361, 0.0329, 0.042, 2, 2], [0.2415, 0.0084, 0.0075, 0.008, 2, 2],
  ] : [
    [0, 0.03, 0.06, 0, 2.2, 2], [0.01, 0.048, 0.071, 0.012, 2.3, 2], [0.025, 0.062, 0.08, 0.032, 2.35, 2.1], [0.045, 0.07, 0.085, 0.052, 2.4, 2.2],
    [0.065, 0.076, 0.088, 0.072, 2.45, 2.2], [0.085, 0.0797, 0.088, 0.086, 2.5, 2.2], [0.105, 0.0827, 0.087, 0.097, 2.6, 2.2], [0.12, 0.0871, 0.086, 0.103, 2.6, 2.2],
    [0.14, 0.0895, 0.089, 0.107, 2.6, 2.2], [0.16, 0.092, 0.093, 0.109, 2.5, 2.2], [0.18, 0.092, 0.0887, 0.108, 2.4, 2.2], [0.2, 0.0871, 0.079, 0.101, 2.3, 2.2],
    [0.215, 0.0786, 0.0696, 0.089, 2.2, 2.2], [0.228, 0.0601, 0.0536, 0.069, 2.1, 2.1], [0.237, 0.038, 0.0329, 0.042, 2, 2], [0.2415, 0.0088, 0.0075, 0.008, 2, 2],
  ];
  return {
    fem, rows: table(fem ? rows.map(r => [r[0], r[1] * (1 + 0.08 * Math.sin(Math.PI * Math.min(1, r[0] / 0.22))), ...r.slice(2)]) : rows),
    neck: fem ? { hw: 0.038, zf: 0.03, zb: 0.04, cz: -0.012 } : { hw: 0.045, zf: 0.034, zb: 0.046, cz: -0.014 },
    eyeX: fem ? 0.04 : 0.0405, eyeY: fem ? 0.123 : 0.124,
    eye: fem ? { hw: 0.0232, top: 0.0172, bot: 0.0122, tilt: 0.003, iris: 0.0148 } : { hw: 0.0215, top: 0.0128, bot: 0.0094, tilt: 0.0015, iris: 0.0134 },
    mouthY: fem ? 0.047 : 0.05, mouthW: fem ? 0.022 : 0.026,
    nose: fem ? { tip: 0.015, w: 0.0056, wing: 0.0064, bridge: 0.0018, y0: 0.083 } : { tip: 0.028, w: 0.0076, wing: 0.0086, bridge: 0.0042, y0: 0.077 },
    lips: fem ? { up: 0.0062, lo: 0.0085, h: 0.0078, hl: 0.0094 } : { up: 0.006, lo: 0.0082, h: 0.0075, hl: 0.0095 },
    brow: fem ? 0.0018 : 0.0042,
  };
}

/** Smooth maximum (soft union of two radii). */
const smax = (a, b, k) => { const h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1); return lerp(a, b, h) + k * h * (1 - h); };

/**
 * The head surface in head space: θ = 0 straight ahead, +π/2 toward +x. Returns [x, y, z].
 * `opt.noFeatures` gives the smooth skull (the hair cap is fitted to it).
 */
export function makeHeadSurface(P) {
  const S = headSpec(P), fem = S.fem;
  function base(y, th) {
    const sn = Math.sin(th), cs = Math.cos(th);
    const [hw, zf, zb, pf, pb] = S.rows(y);
    const rf = superR(sn, cs, hw, cs >= 0 ? zf : Math.max(zb, 0.001), cs >= 0 ? pf : pb);
    const N = S.neck;
    // neck in the same polar frame (its centre is behind the face)
    const nx = sn, nz = cs;
    const rn = superR(nx, nz, N.hw, nz >= 0 ? N.zf : N.zb, 2.1) + N.cz * cs;
    const fade = 1 - smooth(0.05, 0.12, y);       // the neck stops mattering above the jaw
    const r = fade > 0 ? lerp(rf, smax(rf, rn, 0.012), fade) : rf;
    return r;
  }
  function features(x, y, th, r) {
    // displacement along the radial direction; mostly front-facing details
    const cs = Math.cos(th), front = smooth(0.15, 0.6, cs);
    let d = 0;
    const ax = Math.abs(x);
    // --- nose
    const N = S.nose;
    const ny = clamp((y - N.y0) / (0.145 - N.y0), 0, 1);           // 0 at the tip line, 1 at the bridge top
    const ridge = lerp(N.tip, N.bridge, Math.pow(ny, 0.8)) * (1 - smooth(0.92, 1.0, ny));
    const under = smooth(N.y0 - 0.0075, N.y0 + 0.0015, y);          // the underside closes fast
    const tipBall = gauss(y - (N.y0 + 0.006), 0.007) * 0.004;
    const nw = lerp(N.w, N.w * 0.55, ny) + 0.002 * gauss(y - N.y0 - 0.005, 0.008);
    d += (ridge + tipBall) * under * gauss(x, nw) * front;
    // wings of the nose
    d += 0.0085 * gauss(ax - N.wing * 1.45, 0.0065) * gauss(y - (N.y0 + 0.004), 0.0065) * front * (fem ? 0.8 : 1);
    // --- eye sockets, brow ridge, cheekbones, temples
    d -= 0.0055 * gauss(ax - S.eyeX, 0.017) * gauss(y - S.eyeY, 0.012) * front;
    d += S.brow * gauss(ax - 0.03, 0.026) * gauss(y - 0.16, 0.008) * front;
    d += 0.0045 * gauss(ax - 0.05, 0.016) * gauss(y - 0.108, 0.012);
    d -= 0.003 * gauss(ax - 0.066, 0.012) * gauss(y - 0.162, 0.018);
    // --- mouth: lips, the line between them, philtrum, the groove under the lower lip
    const L = S.lips, my = S.mouthY, mw = S.mouthW;
    const lx = clamp(ax / (mw * 1.15), 0, 1);
    const lipFall = Math.sqrt(Math.max(0, 1 - lx * lx));
    d += L.up * lipFall * smooth(my - 0.001, my + 0.002, y) * (1 - smooth(my + L.h * 0.6, my + L.h * 1.15, y)) * front;
    d += L.lo * lipFall * (1 - smooth(my - 0.001, my + 0.001, y)) * smooth(my - L.hl * 1.25, my - L.hl * 0.5, y) * front;
    d -= 0.0018 * gauss(y - my, 0.0012) * gauss(ax, mw * 0.85) * front;
    d -= 0.0012 * gauss(x, 0.0028) * smooth(my + L.h * 0.9, my + L.h * 1.2, y) * (1 - smooth(N.y0 - 0.004, N.y0, y)) * front;
    d -= 0.003 * gauss(y - (my - L.hl * 1.55), 0.004) * gauss(ax, 0.016) * front;
    // --- chin
    d += (fem ? 0.004 : 0.0075) * gauss(x, fem ? 0.012 : 0.017) * gauss(y - 0.017, 0.012) * front;
    // --- jaw line: a crisp-ish edge under the jaw on the male
    if (!fem) d += 0.0015 * gauss(y - 0.03, 0.012) * gauss(adiff(Math.abs(th), 1.35), 0.4);
    return d;
  }
  function at(y, th, opt = {}) {
    const r0 = base(y, th);
    const sn = Math.sin(th), cs = Math.cos(th);
    const x0 = sn * r0;
    const d = opt.noFeatures ? 0 : features(x0, y, th, r0);
    const r = r0 + d;
    return [sn * r, y, cs * r];
  }
  /** Point on the face at a lateral offset x (θ solved by bisection on the front half) and height y. */
  function atXY(x, y, opt) {
    let lo = -PI * 0.55, hi = PI * 0.55;
    for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (at(y, m, opt)[0] < x) lo = m; else hi = m; }
    const th = (lo + hi) / 2; return { p: at(y, th, opt), th };
  }
  /** Outward normal by finite differences. */
  function normalAt(y, th, opt) {
    const e = 0.0015, a = at(y + e, th, opt), b = at(y - e, th, opt), c = at(y, th + 0.02, opt), d = at(y, th - 0.02, opt);
    let n = cross(sub(c, d), sub(a, b));
    const p = at(y, th, opt);
    if (dot(n, [p[0], 0, p[2]]) < 0) n = mul(n, -1);
    return norm(n);
  }
  return { at, atXY, normalAt, S };
}

/** Rest positions (bind space) of the face bones, plus the ponytail bones. */
export function faceLandmarks(P) {
  const HS = P.HS, O = [0, P.chinY, P.headZ];
  const H = makeHeadSurface(P), S = H.S;
  const W = p => headToWorld(P, p);
  const out = {};
  const mouthFront = H.atXY(0, S.mouthY).p;
  out.jaw = W([0, 0.098, 0.0]);
  out.lipU = W([0, S.mouthY + 0.004, mouthFront[2]]);
  out.lipD = W([0, S.mouthY - 0.006, mouthFront[2]]);
  for (const [s, sg] of [['L', -1], ['R', 1]]) {
    const c = H.atXY(sg * S.mouthW, S.mouthY).p; out['mouthC' + s] = W(c);
    const e = H.atXY(sg * S.eyeX, S.eyeY).p; out['eye' + s] = W(e);
    out['browIn' + s] = W(H.atXY(sg * 0.013, P.fem ? 0.152 : 0.148).p);
    out['browOut' + s] = W(H.atXY(sg * 0.052, P.fem ? 0.154 : 0.15).p);
    out['cheek' + s] = W(H.atXY(sg * 0.042, 0.092).p);
  }
  out.hairA = W([0, 0.215, -0.082]);
  out.hairB = W([0, 0.17, -0.15]);
  out.hairC = W([0, 0.09, -0.165]);
  out.O = O; out.HS = HS; out.surface = H;
  return out;
}

/** Head-space → bind space. */
// A smooth vertical warp: the lower face a little longer, the cranium a little shorter (eyes higher on the head, as in
// the reference), with no crease anywhere because the derivative is a cosine.
export const headWarp = (y, fem) => {
  const c = clamp(y, 0, 0.2415) / 0.2415;
  // v2 (after the owner's review): the male face measured off ref/male-head.png — eye line 1.63 face half-widths above the
  // chin, mouth 0.43 and nose 0.62 of the way up to the eyes, brows 1.17 — so the lower face is stretched (+12 mm at the
  // eyes) and the cranium grows 20 mm to keep the eye line near the middle of the skull.
  return fem ? y - 0.004 * Math.sin(Math.PI * c) : y + 0.012 * Math.sin(Math.PI * c) + 0.02 * c * c;
};
export const headToWorld = (P, p) => [p[0] * P.HS, P.chinY + headWarp(p[1], P.fem) * P.HS, P.headZ + p[2] * P.HS];

// ------------------------------------------------------------------------------------------------- the head mesh
export function headPart(P, look, colors) {
  const H = makeHeadSurface(P), S = H.S, fem = S.fem;
  const skin = colors.skin, lip = colors.lip;
  // row heights: dense through the features
  const my0 = S.mouthY, ny = S.nose.y0, ey = S.eyeY;
  const ys = [-0.006, 0.0, 0.006, 0.013, 0.021, 0.03, my0 - 0.013, my0 - 0.007, my0 - 0.003, my0, my0 + 0.004, my0 + 0.009, ny - 0.011, ny - 0.006, ny - 0.002,
    ny + 0.003, ny + 0.009, ny + 0.017, ny + 0.026, ey - 0.012, ey - 0.007, ey - 0.003, ey + 0.002, ey + 0.007, ey + 0.013, ey + 0.021, ey + 0.03, ey + 0.04,
    0.18, 0.195, 0.21, 0.223, 0.233, 0.2385, 0.2415];
  ys.sort((a, b) => a - b);
  for (let i = ys.length - 1; i > 0; i--) if (ys[i] - ys[i - 1] < 0.0025) ys.splice(i === ys.length - 1 ? i - 1 : i, 1);
  const segs = 32, aW = 0.36;   // v2: 32 columns (v1 36); the triangles went to the arms
  const theta = (j, n) => { const u = j / n * 2 - 1; return PI * (aW * u + (1 - aW) * u * u * u); };
  const my = S.mouthY;
  return {
    name: 'head', us: ys, segs, theta, capStart: true, capEnd: true,
    at(y, th, opt = {}) {
      const p = H.at(y, th, opt);
      return { p: headToWorld(P, p), w: headWeights(p, S), hp: p };
    },
    color(y, th, pw, s) {
      const p = s.hp, ax = Math.abs(p[0]);
      let c = skin.slice();
      const front = smooth(0.2, 0.7, Math.cos(th));
      // warmth: cheeks, nose tip, ears region, chin
      const blush = (fem ? 0.4 : 0.12) * gauss(ax - 0.045, 0.02) * gauss(y - 0.1, 0.014) * front
        + 0.35 * gauss(p[0], 0.01) * gauss(y - S.nose.y0 - 0.006, 0.01) * front;
      c = cmix(c, colors.blush, clamp(blush, 0, 1));
      // lips (the vermilion): upper lip with a bow, fuller lower lip
      const L = S.lips, mw = S.mouthW;
      const lx = ax / (mw * 1.05);
      if (lx < 1.15 && front > 0.5) {
        const bow = 0.0012 * gauss(p[0], 0.004);
        const upTop = my + L.h * Math.max(0, 1 - lx * lx) ** 0.6 - bow, loBot = my - L.hl * Math.max(0, 1 - lx * lx) ** 0.5;
        const inU = smooth(upTop + 0.0012, upTop - 0.0004, y) * smooth(my - 0.002, my, y);
        const inL = smooth(loBot - 0.0012, loBot + 0.0004, y) * (1 - smooth(my, my + 0.002, y));
        const k = clamp(Math.max(inU, inL * 1.0), 0, 1) * (1 - smooth(0.9, 1.15, lx));
        c = cmix(c, inL > inU ? cmul(lip, 1.08) : cmul(lip, 0.92), k * (fem ? 0.95 : 0.6));
        c = cmul(c, 1 - 0.38 * gauss(y - my, 0.0011) * (1 - smooth(0.85, 1.1, lx)));   // v2: the dark line between the lips
      }
      // nostrils
      const nost = gauss(ax - 0.0068, 0.0028) * gauss(y - (S.nose.y0 - 0.0015), 0.0022) * front;
      c = cmul(c, 1 - 0.25 * clamp(nost * 1.2, 0, 1));
      // upper eyelid crease + a little shadow in the eye corners
      const ex = ax - S.eyeX;
      const crease = gauss(y - (S.eyeY + S.eye.top + 0.0042 - 0.06 * ex * ex / 0.0002 * 0.0002), 0.0012) * gauss(ex, S.eye.hw * 1.1) * front;
      c = cmul(c, 1 - 0.22 * clamp(crease, 0, 1));
      const socket = gauss(ex, 0.018) * gauss(y - S.eyeY, 0.012) * front;
      c = cmix(c, cmul(colors.blush, 0.8), 0.12 * socket);
      c = cmul(c, 1 - 0.18 * gauss(y - (my - L.hl * 1.5), 0.004) * gauss(ax, mw * 0.8) * front);
      // under the jaw is a little darker
      c = cmul(c, 1 - 0.12 * (1 - smooth(0.0, 0.03, y)));
      return c;
    },
    ao: 0.45, rough: 0.62,
  };
}

/** Skin weights on the head (head space point). */
function headWeights(p, S) {
  const [x, y, z] = p, ax = Math.abs(x), side = x >= 0 ? 'R' : 'L';
  const my = S.mouthY;
  let wJaw = 0;
  // the jaw takes the chin and lower face below a line from the mouth back to the ear lobe
  const yb = my - 0.003 + clamp((0.085 - z) / 0.1, 0, 1) * -0.0 + clamp((0.06 - z) / 0.08, 0, 1) * 0.0 + (1 - clamp(z / 0.08, 0, 1)) * 0.03;
  wJaw = (1 - smooth(yb - 0.012, yb + 0.002, y)) * smooth(-0.04, 0.0, z) * smooth(-0.02, 0.006, y);
  const front = smooth(0.06, 0.08, z);
  // lips: split at the mouth line so the upper lip never stretches down past the opening
  const lipX = gauss(ax, S.mouthW * 0.8);
  let wU = 0, wD = 0;
  if (y > my + 1e-5) wU = lipX * gauss(y - my - 0.002, 0.007) * front;
  else if (y < my - 1e-5) wD = lipX * gauss(y - my + 0.002, 0.008) * front;
  else { wU = 0.5 * lipX * front; wD = 0.5 * lipX * front; }
  const wC = gauss(ax - S.mouthW, 0.0085) * gauss(y - my, 0.008) * front;
  const wCheek = gauss(ax - 0.042, 0.014) * gauss(y - 0.092, 0.012) * smooth(0.04, 0.07, z) * 0.7;
  const w = [];
  let rest = 1;
  const take = (b, v) => { v = Math.min(v, rest); if (v > 1e-4) { w.push([b, v]); rest -= v; } };
  take('mouthC' + side, wC * 0.9);
  take('lipU', wU * 0.95);
  take('lipD', wD * 0.95);
  take('cheek' + side, wCheek);
  take('jaw', wJaw);
  // below the head the neck takes over
  const nk = 1 - smooth(-0.012, 0.03, y) * 1;
  if (nk > 0 && z < 0.06) take('neck', nk * 0.8 * rest);
  w.push(['head', rest]);
  return w;
}

// ------------------------------------------------------------------------------------------------- face pieces
/**
 * Eyes, lashes, brows, mouth opening, teeth and ears. Each is a small surface placed on the head surface (so it sits on
 * the face exactly) and skinned to its bone.
 */
export function faceParts(P, look, colors, F) {
  const H = makeHeadSurface(P), S = H.S, fem = S.fem, HS = P.HS;
  const W = p => headToWorld(P, p);
  const parts = [];
  // place a point at lateral x, height y on the face, pushed out by `off` (head space)
  const onFace = (x, y, off) => { const { p, th } = H.atXY(x, y); const n = H.normalAt(y, th); return add(p, mul(n, off)); };

  for (const [s, sg] of [['L', -1], ['R', 1]]) {
    const E = S.eye, ex0 = sg * S.eyeX, ey0 = S.eyeY;
    // almond outline: t 0 = inner corner (toward the nose) … 1 = outer
    const corner = t => lerp(-0.0012, E.tilt, t);
    const yT = t => ey0 + corner(t) + E.top * Math.pow(Math.sin(PI * clamp(t, 0, 1)), 0.75) * (1 + 0.18 * (0.5 - t));
    const yB = t => ey0 + corner(t) - E.bot * Math.pow(Math.sin(PI * clamp(t, 0, 1)), 0.95) * (1 - 0.12 * (0.5 - t));
    const xAt = t => ex0 + sg * lerp(-E.hw, E.hw, t);
    const bulge = (t, v) => 0.0016 * Math.sin(PI * t) * Math.sin(PI * v);
    // ---- the eye white
    const white = colors.white;
    parts.push({
      name: 'eyeWhite' + s, us: [0, 0.07, 0.18, 0.34, 0.5, 0.66, 0.82, 0.93, 1], segs: 5, wrap: false, t0: 0, t1: 1,
      at(t, v) { const y = lerp(yB(t), yT(t), v); return { p: W(onFace(xAt(t), y, 0.0007 + bulge(t, v))), w: [['eye' + s, 1]] }; },
      out: () => [sg * 0.3, 0, 1],
      color(t, v) {
        let c = white.slice();
        c = cmul(c, 1 - 0.28 * smooth(0.55, 1, v) - 0.18 * (1 - smooth(0, 0.22, Math.min(t, 1 - t))));
        if (t < 0.1) c = cmix(c, colors.blush, 0.5 * (1 - t / 0.1));
        return c;
      },
      glow: 0.18, rough: 0.25,
    });
    // ---- iris + pupil: a disc clipped to the almond at rest, on the pupil bone (gaze moves the bone)
    const R = E.iris, iy = ey0 + 0.0004 + (fem ? 0.0002 : 0);
    const ring = [0, 0.36, 0.55, 0.8, 0.93, 1];
    const iris = colors.iris;
    parts.push({
      name: 'iris' + s, us: ring, segs: 12, capStart: true,
      at(r, a) {
        let x = ex0 + Math.cos(a) * R * r, y = iy + Math.sin(a) * R * r;
        const t = clamp((sg * (x - ex0) + E.hw) / (2 * E.hw), 0.02, 0.98);
        const top = yT(t) - 0.0003, bot = yB(t) + 0.00035;
        y = clamp(y, bot, top);
        const tt = clamp((sg * (x - ex0) + E.hw) / (2 * E.hw), 0, 1), vv = clamp((y - yB(tt)) / Math.max(1e-5, yT(tt) - yB(tt)), 0, 1);
        return { p: W(onFace(x, y, 0.0026 + bulge(tt, vv) * 0.6)), w: [['pupil' + s, 1]], r, a };
      },
      out: () => [sg * 0.3, 0, 1],
      color(r, a) {
        if (r < 0.36) return [0.012, 0.01, 0.01];
        let c = cmix(cmul(iris, 1.9), iris, smooth(0.4, 0.75, r));
        c = cmix(c, cmul(iris, 0.35), smooth(0.82, 1.0, r));         // dark limbal ring
        c = cmul(c, 1 - 0.35 * smooth(0.0, 0.9, Math.sin(a)));        // the lid shades the top
        c = cmix(c, cmul(iris, 2.6), 0.35 * smooth(0.2, 0.9, -Math.sin(a)) * smooth(0.45, 0.7, r) * (1 - smooth(0.75, 0.9, r)));
        return c;
      },
      glow: 0.22, rough: 0.15,
    });
    // catchlight
    const hx = ex0 + sg * -R * 0.05 + R * 0.28, hy = iy + R * 0.36;
    parts.push({
      name: 'catch' + s, us: [0, 1], segs: 8, capStart: true,
      at(r, a) { return { p: W(onFace(hx + Math.cos(a) * 0.0013 * r, hy + Math.sin(a) * 0.0013 * r, 0.0034)), w: [['pupil' + s, 1]] }; },
      out: () => [0, 0, 1], color: () => [1, 1, 1], glow: 1.2, rough: 0.1,
    });
    // ---- upper lash line: thick, a dark wedge that runs a little past the outer corner (flicked on the female)
    const lashTh = t => lerp(fem ? 0.001 : 0.0008, fem ? 0.0025 : 0.0019, smooth(0.0, 0.85, t)) * (1 - smooth(1.0, 1.12, t) * 0.7);
    parts.push({
      name: 'lash' + s, us: [0, 0.08, 0.2, 0.35, 0.5, 0.65, 0.8, 0.9, 1.0, 1.06, 1.12], segs: 2, wrap: false, t0: 0, t1: 1,
      at(t, v) {
        const tc = Math.min(t, 1);
        let x = xAt(t), y = yT(tc) - 0.00035;
        if (t > 1) { y += (t - 1) * (fem ? 0.055 : 0.02); x += sg * (t - 1) * 0.004; }
        y += v * lashTh(t);
        return { p: W(onFace(x, y, 0.0036 + 0.0004 * v)), w: [['eye' + s, 1]] };
      },
      out: () => [0, 0, 1], color: () => colors.lash, rough: 0.5,
    });
    // lower lid line: a soft dark line (female: lashes at the outer half)
    parts.push({
      name: 'lowLash' + s, us: [0.08, 0.3, 0.5, 0.7, 0.88, 1.0], segs: 1, wrap: false, t0: 0, t1: 1,
      at(t, v) { const y = yB(t) + 0.0002 - v * lerp(0.0003, fem ? 0.0009 : 0.0005, t); return { p: W(onFace(xAt(t), y, 0.0031)), w: [['eye' + s, 1]] }; },
      out: () => [0, 0, 1], color: (t) => fem ? cmix(colors.skinDark, colors.lash, smooth(0.4, 0.9, t)) : colors.skinDark, rough: 0.6,
    });
    // closed-lid line on the lid bone: scaled to nothing while the eye is open (see expressions.js)
    parts.push({
      name: 'lidLine' + s, us: [0, 0.2, 0.4, 0.6, 0.8, 1, 1.08], segs: 1, wrap: false, t0: 0, t1: 1,
      at(t, v) {
        const tc = Math.min(t, 1);
        const lineY = lerp(yT(tc), yB(tc), 0.62) + (t > 1 ? (t - 1) * 0.02 : 0);
        const y = lineY + (v - 0.5) * (fem ? 0.0016 : 0.0012) * Math.sin(PI * clamp(t * 0.95 + 0.03, 0, 1)) + 0.0002;
        return { p: W(onFace(xAt(t), y, 0.0042)), w: [['lid' + s, 1]] };
      },
      out: () => [0, 0, 1], color: () => colors.lash, rough: 0.6,
    });
    // ---- brow: a tapered strip, bending between its inner and outer bones
    const bx0 = sg * 0.013, bx1 = sg * (fem ? 0.06 : 0.062);
    const browY = fem ? (t => 0.1505 + 0.0048 * Math.sin(PI * Math.pow(t, 0.8)) - 0.001 * t) : (t => 0.1465 + 0.0032 * Math.sin(PI * Math.pow(t, 0.7)) + 0.0045 * t - 0.005 * t * t);
    const browT = fem ? (t => lerp(0.0054, 0.002, smooth(0.25, 1, t)) * (0.8 + 0.2 * smooth(0, 0.15, t))) : (t => lerp(0.0094, 0.0042, smooth(0.35, 1, t)) * (0.85 + 0.15 * smooth(0, 0.12, t)));
    parts.push({
      name: 'brow' + s, us: [0, 0.08, 0.2, 0.35, 0.5, 0.65, 0.8, 0.92, 1], segs: 3, wrap: false, t0: 0, t1: 1,
      at(t, v) {
        const x = lerp(bx0, bx1, t), th = browT(t);
        const y = browY(t) - th * 0.4 + v * th;
        const wo = smooth(0.15, 0.85, t);
        return { p: W(onFace(x, y, 0.0011 + 0.0006 * Math.sin(PI * v))), w: [['browIn' + s, 1 - wo], ['browOut' + s, wo]] };
      },
      out: () => [0, 0, 1], color: (t, v) => cmul(colors.brow, 0.9 + 0.2 * v), rough: 0.7,
    });
  }
  // ---- the mouth opening (a dark lens over the lip line; its edges ride the lips) and the teeth
  {
    const my = S.mouthY, mw = S.mouthW;
    const cornerW = (side) => [['mouthC' + side, 0.9], ['head', 0.1]];
    const edge = (u, top) => {
      const side = u >= 0 ? 'R' : 'L', a = Math.abs(u);
      const c = smooth(0.55, 1, a);
      const lip = top ? [['lipU', 1]] : [['lipD', 0.85], ['jaw', 0.15]];
      return [...lip.map(([b, v]) => [b, v * (1 - c)]), ...cornerW(side).map(([b, v]) => [b, v * c])];
    };
    const open = 0.0004;
    parts.push({
      name: 'mouth', us: [-1, -0.85, -0.6, -0.3, 0, 0.3, 0.6, 0.85, 1], segs: 2, wrap: false, t0: 0, t1: 1,
      at(u, v) {
        const x = u * mw * 0.98, h = open * Math.sqrt(Math.max(0, 1 - u * u));
        const y = my + (v - 0.5) * 2 * h;
        const w = Math.abs(u) > 0.999 ? cornerW(u > 0 ? 'R' : 'L') : (v > 0.75 ? edge(u, true) : v < 0.25 ? edge(u, false) : [...edge(u, true).map(([b, k]) => [b, k * 0.5]), ...edge(u, false).map(([b, k]) => [b, k * 0.5])]);
        return { p: W(onFace(x, y, 0.0009)), w };
      },
      out: () => [0, 0, 1], color: (u, v) => cmix(colors.mouth, cmul(colors.mouth, 0.45), v), rough: 0.8,
    });
    // teeth: hang from the upper lip, only show when the lips part
    parts.push({
      name: 'teeth', us: [-0.78, -0.5, -0.2, 0, 0.2, 0.5, 0.78], segs: 1, wrap: false, t0: 0, t1: 1,
      at(u, v) {
        const x = u * mw * 0.82, y = my + 0.0003 - v * 0.0002;
        const side = u >= 0 ? 'R' : 'L', c = smooth(0.5, 0.95, Math.abs(u)) * 0.6;
        const w = v < 0.5 ? [['lipU', 1 - c], ['mouthC' + side, c]] : [['lipU', (1 - c) * 0.62], ['lipD', (1 - c) * 0.38], ['mouthC' + side, c]];
        return { p: W(onFace(x, y, 0.0012)), w };
      },
      out: () => [0, 0, 1], color: (u) => cmul(colors.teeth, 1 - 0.3 * Math.abs(u)), rough: 0.3, glow: 0.05,
    });
  }
  // ---- ears: a sheet with a rolled rim and a hollow
  for (const [s, sg] of [['L', -1], ['R', 1]]) {
    const cy = 0.127, cz = -0.009, eh = fem ? 0.03 : 0.033, ez = fem ? 0.023 : 0.026;
    const outline = t => {        // t: 0..1 round from the front-top, over the top, down the back, the lobe, up the front
      const a = t * PI * 2;
      const top = Math.sin(a) > 0 ? 1 : 0.0;
      let y = Math.cos(a) * eh * (Math.cos(a) > 0 ? 1.0 : 1.08), z = -Math.sin(a) * ez * (Math.cos(a) > 0 ? 0.95 + 0.2 * Math.cos(a) : 0.62 - 0.12 * Math.cos(a));
      if (Math.cos(a) > 0) y *= 0.92 + 0.08 * Math.abs(Math.sin(a));       // a rounder top
      if (Math.sin(a) < 0) z *= 0.6;          // the front edge stays close to the face
      return [y, z + (top ? -0.002 : 0)];
    };
    const base = H.at(cy, sg * 1.62, { noFeatures: true });
    const bx = Math.abs(base[0]) - 0.002;
    parts.push({
      name: 'ear' + s, us: [0, 0.4, 0.72, 0.9, 1], segs: 14,
      at(v, a) {
        const t = a / (PI * 2);
        const [oy, oz] = outline(t);
        const back = clamp(-oz / ez, 0, 1);      // how far toward the back edge
        let x = bx + 0.003 + 0.016 * v * (0.55 + 0.45 * back);
        x += 0.0032 * gauss(v - 0.93, 0.07) - 0.0035 * gauss(v - 0.25, 0.3) * (1 - smooth(0.8, 1, Math.abs(oy) / eh) * 0.3);
        if (oy < -eh * 0.55) x += 0.002 * v;     // lobe
        const p = [sg * x, cy + oy * v, cz + oz * v];
        return { p: W(p), w: [['head', 1]], v };
      },
      capStart: true,
      out: () => [sg, 0, 0],
      color(v) { return cmix(cmix(colors.skin, colors.blush, 0.3), cmul(colors.skinDark, 0.9), 0.5 * (1 - smooth(0.2, 0.6, v))); },
      ao: 0.8, rough: 0.6,
    });
  }
  return parts;
}

/** The eye opening at its middle column, relative to the eye bone, in bind-space metres (for blinks and squints). */
export function eyeMetrics(P) {
  const S = makeHeadSurface(P).S, E = S.eye, HS = P.HS;
  const c = (-0.0012 + E.tilt) / 2;
  const top = (c + E.top) * HS, bot = (c - E.bot) * HS;
  return { top, bot, line: top + (bot - top) * 0.62, limX: (E.hw - E.iris) * 0.65 * HS, limY: 0.0016 * HS };
}
