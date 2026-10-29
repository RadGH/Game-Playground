// Kestrel kit — the head: skull + face as one sculpted surface, and the face pieces on top of it (eyes, pupils, lashes,
// brows, the mouth opening, teeth / fangs / tusks / tongue, ears). Numbers are in head space: metres for a 0.24 m head
// (chin to crown), y up from the chin, z forward; P.HS scales them to this body's head.
//
// BATCH 2 (2026-10-27): every face part a Thousandvale / Chibi 2.5 look can name is read from `P.face` (face-catalog.js
// faceLook — set by kestrel.js layout()). Head shapes reshape the row table, noses and mouths reshape the features,
// eye shapes reshape the almond (and pick pupils, iris, lashes, catchlights), brows / ears are their own builders. A
// look with nothing set is the opus2 face exactly (the two test characters).
//
// What moves the face (all bones, so an expression is a few bone offsets a frame, never a geometry or material change):
//   jaw (opens; lower lip + chin skin ride it), lipU / lipD (lip centres), mouthCL / mouthCR (corners: smile, frown),
//   browIn* / browOut* (each brow bends between its two bones), eye* (squash = blink / squint / wide),
//   pupil* (gaze), lid* (the closed-lid line, scaled in at the end of a blink), cheek* (cheeks lift in a smile).
import { clamp, lerp, smooth, gauss, adiff, superR, table, add, sub, mul, norm, cross, dot, cmix, cmul } from './kmath.js';
import { faceLook, HEAD_SHAPES, EYE_SHAPES, BROW_SHAPES, NOSE_SHAPES, MOUTH_SHAPES, EAR_SHAPES } from './face-catalog.js';
import { hairChain, hairSwing } from './hair.js';

const PI = Math.PI;
/** Cover bits owned by the face. */
export const FACE_COVER = { EARS: 1 << 24, JAW: 1 << 25, LOWFACE: 1 << 26, UNUSED: 1 << 27 };   // UNUSED: a shell's triangles that grew nothing (always dropped)   // high bits: geo.js COVER (garments) grows from 1 up

/** The look's face settings (P.face), or the form's default face. */
export const faceOf = P => P.face || (P.__face ||= faceLook({ body: { form: P.fem ? 'fem' : 'masc' } }));

/** Head shape settings per form, with the look's head shape, eyes, nose and mouth applied. */
function headSpec(P) {
  const fem = P.fem, F = faceOf(P);
  const HSH = HEAD_SHAPES[F.head] || {};
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
  // head shape: width by height (chin / jaw / cheekbones), squarer lower face
  const wAt = y => (HSH.w ?? 1) * (1 + ((HSH.chin ?? 1) - 1) * gauss(y - 0.006, 0.02) + ((HSH.jaw ?? 1) - 1) * gauss(y - 0.045, 0.028) + ((HSH.cheek ?? 1) - 1) * gauss(y - 0.112, 0.03));
  const shaped = rows.map(r => {
    const fw = fem ? 1 + 0.08 * Math.sin(Math.PI * Math.min(1, r[0] / 0.22)) : 1;
    const sq = (HSH.sq ?? 0) * (1 - smooth(0.08, 0.15, r[0]));
    return [r[0], r[1] * fw * wAt(r[0]), r[2], r[3], r[4] + sq, r[5] + sq * 0.4];
  });
  // eyes: the look's shape on the form's almond
  const ES = EYE_SHAPES[F.eyes.id] || {}, eh = F.eyes.height ?? 1;
  const E0 = fem ? { hw: 0.0232, top: 0.0172, bot: 0.0122, tilt: 0.003, iris: 0.0148 } : { hw: 0.0215, top: 0.0128, bot: 0.0094, tilt: 0.0015, iris: 0.0134 };
  const irisK = { normal: 1, large: 1.22, small: 0.76, ring: 1.05, none: 1 }[F.eyes.iris] ?? 1;
  const eye = {
    hw: E0.hw * (ES.w ?? 1), top: E0.top * (ES.t ?? 1) * eh, bot: E0.bot * (ES.b ?? 1) * eh, tilt: E0.tilt + (ES.tilt ?? 0),
    iris: E0.iris * (ES.iris ?? 1) * irisK, arch: ES.arch ?? 0, inner: ES.inner ?? 0, shape: ES,
  };
  if (ES.irisFill) eye.iris = Math.max(eye.hw, eye.top) * 1.05;
  eye.iris = Math.min(eye.iris, eye.hw * 0.98);
  // nose
  const NS = NOSE_SHAPES[F.nose] || {};
  const N0 = fem ? { tip: 0.015, w: 0.0056, wing: 0.0064, bridge: 0.0018, y0: 0.083 } : { tip: 0.028, w: 0.0076, wing: 0.0086, bridge: 0.0042, y0: 0.077 };
  const nose = NS.none ? { ...N0, tip: 0, w: N0.w, wing: 0, bridge: 0, ball: 0, hook: 0, up: 0, snout: false, none: true }
    : { tip: N0.tip * (NS.tip ?? 1), w: N0.w * (NS.w ?? 1), wing: N0.wing * (NS.wing ?? 1), bridge: N0.bridge * (NS.bridge ?? 1), y0: N0.y0 + (NS.y ?? 0), ball: NS.ball ?? 1, hook: NS.hook ?? 0, up: NS.up ?? 0, snout: !!NS.snout };
  // mouth
  const MS = MOUTH_SHAPES[F.mouth] || {};
  const lips = fem ? { up: 0.0062, lo: 0.0085, h: 0.0078, hl: 0.0094 } : { up: 0.006, lo: 0.0082, h: 0.0075, hl: 0.0095 };
  const full = MS.full ?? 1;
  const mouthW = (fem ? 0.022 : 0.026) * (MS.w ?? 1), mouthY = fem ? 0.047 : 0.05;
  const lineY = MS.cat ? (x => mouthY + 0.0014 * gauss(x, mouthW * 0.22) - 0.0003 * gauss(x, mouthW * 0.6))
    : MS.wavy ? (x => mouthY + 0.0011 * Math.sin(x / mouthW * 2.6 * PI))
      : () => mouthY;
  return {
    fem, F, rows: table(shaped),
    neck: fem ? { hw: 0.038, zf: 0.03, zb: 0.04, cz: -0.012 } : { hw: 0.045, zf: 0.034, zb: 0.046, cz: -0.014 },
    eyeX: fem ? 0.04 : 0.0405, eyeY: fem ? 0.123 : 0.124, eye,
    mouthY, mouthW, mouth: MS, lineY,
    nose,
    lips: { up: lips.up * full, lo: lips.lo * full, h: lips.h * Math.sqrt(full), hl: lips.hl * Math.sqrt(full) },
    brow: fem ? 0.0018 : 0.0042,
    bone: HSH.bone ?? 1, jawEdge: HSH.jawEdge ?? 1, len: HSH.len ?? 1,
  };
}

/** Smooth maximum (soft union of two radii). */
const smax = (a, b, k) => { const h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1); return lerp(a, b, h) + k * h * (1 - h); };

const surfCache = new WeakMap();
/**
 * The head surface in head space: θ = 0 straight ahead, +π/2 toward +x. Returns [x, y, z].
 * `opt.noFeatures` gives the smooth skull (the hair cap is fitted to it). Cached per proportions object.
 */
export function makeHeadSurface(P) {
  const hit = surfCache.get(P);
  if (hit && hit.F === faceOf(P)) return hit;
  const S = headSpec(P), fem = S.fem;
  function base(y, th) {
    const sn = Math.sin(th), cs = Math.cos(th);
    const [hw, zf, zb, pf, pb] = S.rows(y);
    const rf = superR(sn, cs, hw, cs >= 0 ? zf : Math.max(zb, 0.001), cs >= 0 ? pf : pb);
    const N = S.neck;
    // neck in the same polar frame (its centre is behind the face)
    const rn = superR(sn, cs, N.hw, cs >= 0 ? N.zf : N.zb, 2.1) + N.cz * cs;
    const fade = 1 - smooth(0.05, 0.12, y);       // the neck stops mattering above the jaw
    return fade > 0 ? lerp(rf, smax(rf, rn, 0.012), fade) : rf;
  }
  function features(x, y, th) {
    // displacement along the radial direction; mostly front-facing details
    const cs = Math.cos(th), front = smooth(0.15, 0.6, cs);
    let d = 0;
    const ax = Math.abs(x);
    // --- nose
    const N = S.nose;
    if (!N.none) {
      const ny = clamp((y - N.y0) / (0.145 - N.y0), 0, 1);           // 0 at the tip line, 1 at the bridge top
      let ridge = lerp(N.tip, N.bridge, Math.pow(ny, 0.8)) * (1 - smooth(0.92, 1.0, ny));
      ridge += 0.0034 * N.hook * gauss(ny - 0.5, 0.17) - 0.0016 * N.up * gauss(ny - 0.28, 0.14);
      const under = smooth(N.y0 - 0.0075 + N.up * 0.003, N.y0 + 0.0015 + N.up * 0.002, y);          // the underside closes fast
      const tipBall = gauss(y - (N.y0 + 0.006 + N.up * 0.0028 - N.hook * 0.002), 0.007) * 0.004 * N.ball;
      const nw = lerp(N.w, N.w * 0.55, ny) + 0.002 * gauss(y - N.y0 - 0.005, 0.008);
      if (N.snout) {
        // a flat forward pad: nearly the same height over its whole width, a round edge
        const pad = smooth(N.w * 1.05, N.w * 0.55, ax) * smooth(N.y0 - 0.008, N.y0 - 0.002, y) * (1 - smooth(N.y0 + 0.014, N.y0 + 0.024, y));
        d += (N.tip * 0.72 * pad + lerp(0, N.bridge, ny) * gauss(x, nw * 0.8) * (1 - pad)) * front;
      } else d += (ridge + tipBall) * under * gauss(x, nw) * front;
      // wings of the nose
      d += 0.0085 * gauss(ax - N.wing * 1.45, 0.0065) * gauss(y - (N.y0 + 0.004), 0.0065) * front * (fem ? 0.8 : 1) * (N.snout ? 0.5 : 1);
    }
    // --- eye sockets, brow ridge, cheekbones, temples
    d -= 0.0055 * gauss(ax - S.eyeX, 0.017) * gauss(y - S.eyeY, 0.012) * front;
    d += S.brow * gauss(ax - 0.03, 0.026) * gauss(y - 0.16, 0.008) * front;
    d += 0.0045 * S.bone * gauss(ax - 0.05, 0.016) * gauss(y - 0.108, 0.012);
    d -= 0.003 * gauss(ax - 0.066, 0.012) * gauss(y - 0.162, 0.018);
    // --- mouth: lips, the line between them, philtrum, the groove under the lower lip
    const L = S.lips, my = S.mouthY, mw = S.mouthW;
    const lx = clamp(ax / (mw * 1.15), 0, 1);
    const lipFall = Math.sqrt(Math.max(0, 1 - lx * lx));
    const ly = S.lineY(x);
    d += L.up * lipFall * smooth(ly - 0.001, ly + 0.002, y) * (1 - smooth(my + L.h * 0.6, my + L.h * 1.15, y)) * front;
    d += L.lo * lipFall * (1 - smooth(ly - 0.001, ly + 0.001, y)) * smooth(my - L.hl * 1.25, my - L.hl * 0.5, y) * front;
    d -= 0.0018 * gauss(y - ly, 0.0012) * gauss(ax, mw * 0.85) * front;
    d -= 0.0012 * gauss(x, 0.0028) * smooth(my + L.h * 0.9, my + L.h * 1.2, y) * (1 - smooth(N.y0 - 0.004, N.y0, y)) * front;
    d -= 0.003 * gauss(y - (my - L.hl * 1.55), 0.004) * gauss(ax, 0.016) * front;
    // --- chin
    d += (fem ? 0.004 : 0.0075) * gauss(x, fem ? 0.012 : 0.017) * gauss(y - 0.017, 0.012) * front;
    // --- jaw line: a crisp-ish edge under the jaw on the male
    if (!fem) d += 0.0015 * S.jawEdge * gauss(y - 0.03, 0.012) * gauss(adiff(Math.abs(th), 1.35), 0.4);
    else if (S.jawEdge > 1) d += 0.0008 * S.jawEdge * gauss(y - 0.03, 0.012) * gauss(adiff(Math.abs(th), 1.35), 0.4);
    return d;
  }
  function at(y, th, opt = {}) {
    const r0 = base(y, th);
    const sn = Math.sin(th), cs = Math.cos(th);
    const d = opt.noFeatures ? 0 : features(sn * r0, y, th);
    const r = r0 + d;
    return [sn * r, y, cs * r];
  }
  /** Point on the face at a lateral offset x (θ solved by bisection on the front half) and height y. */
  function atXY(x, y, opt) {
    let lo = -PI * 0.55, hi = PI * 0.55;
    for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; if (at(y, m, opt)[0] < x) lo = m; else hi = m; }
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
  /** On the face at (x, y), pushed out along the normal by `off` (head space). */
  function onFace(x, y, off, opt) { const { p, th } = atXY(x, y, opt); return add(p, mul(normalAt(y, th, opt), off)); }
  const out = { at, atXY, normalAt, onFace, S, F: faceOf(P) };
  surfCache.set(P, out);
  return out;
}

/** Rest positions (bind space) of the face bones, plus the hair spring bones (placed for the style, hair.js hairChain). */
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
  const chain = hairChain(P);
  out.hairA = W(chain[0]); out.hairB = W(chain[1]); out.hairC = W(chain[2]);
  out.O = O; out.HS = HS; out.surface = H;
  return out;
}

/** Head-space → bind space. */
// A smooth vertical warp: the lower face a little longer, the cranium a little shorter (eyes higher on the head, as in
// the reference), with no crease anywhere because the derivative is a cosine. A long / round head shape stretches or
// shortens the face a little more the same way.
export const headWarp = (y, fem, len = 1) => {
  const c = clamp(y, 0, 0.2415) / 0.2415, e = (len - 1) * 0.2 * Math.sin(Math.PI * c);
  // v2 (after the owner's review): the male face measured off ref/male-head.png — eye line 1.63 face half-widths above the
  // chin, mouth 0.43 and nose 0.62 of the way up to the eyes, brows 1.17 — so the lower face is stretched (+12 mm at the
  // eyes) and the cranium grows 20 mm to keep the eye line near the middle of the skull.
  return (fem ? y - 0.004 * Math.sin(Math.PI * c) : y + 0.012 * Math.sin(Math.PI * c) + 0.02 * c * c) + e;
};
export const headToWorld = (P, p) => [p[0] * P.HS, P.chinY + headWarp(p[1], P.fem, HEAD_SHAPES[faceOf(P).head]?.len ?? 1) * P.HS, P.headZ + p[2] * P.HS];

// ------------------------------------------------------------------------------------------------- the head mesh
/**
 * The head skin. `paint` = extra colour layers (face-marks.js, stubble) as functions (headPoint, colour, y, θ) → colour;
 * `mask` = cover bits (y, θ, headPoint) → bits (scalp under hair, skin under a beard / mask).
 */
export function headPart(P, look, colors, { paint = [], mask = null } = {}) {
  const H = makeHeadSurface(P), S = H.S, fem = S.fem;
  const skin = colors.skin, lip = colors.lip;
  // row heights: dense through the features
  const my0 = S.mouthY, ny = S.nose.y0, ey = S.eyeY;
  const ys = [-0.006, 0.0, 0.006, 0.013, 0.021, 0.03, my0 - 0.013, my0 - 0.007, my0 - 0.003, my0, my0 + 0.004, my0 + 0.009, ny - 0.011, ny - 0.006, ny - 0.002,
    ny + 0.003, ny + 0.009, ny + 0.017, ny + 0.026, ey - 0.012, ey - 0.007, ey - 0.003, ey + 0.002, ey + 0.007, ey + 0.013, ey + 0.021, ey + 0.03, ey + 0.04,
    0.18, 0.195, 0.21, 0.223, 0.233, 0.2385, 0.2415];
  ys.sort((a, b) => a - b);
  for (let i = ys.length - 1; i > 0; i--) if (ys[i] - ys[i - 1] < 0.0025) ys.splice(i === ys.length - 1 ? i - 1 : i, 1);
  const segs = 30, aW = 0.27;   // batch 2: 30 columns (v2 32), packed tighter at the nose; the triangles went to the hair, beards and accessories
  const theta = (j, n) => { const u = j / n * 2 - 1; return PI * (aW * u + (1 - aW) * u * u * u); };
  const my = S.mouthY, E = S.eye, ES = E.shape;
  return {
    name: 'head', us: ys, segs, theta, capStart: true, capEnd: true,
    at(y, th, opt = {}) {
      const p = H.at(y, th, opt);
      return { p: headToWorld(P, p), w: headWeights(p, S), hp: p };
    },
    mask: mask ? (y, th, pw) => mask(y, th, H.at(y, th)) : 0,
    color(y, th, pw, s) {
      const p = s.hp, ax = Math.abs(p[0]);
      let c = skin.slice();
      const front = smooth(0.2, 0.7, Math.cos(th));
      // warmth: cheeks, nose tip, ears region, chin
      const blush = (fem ? 0.4 : 0.12) * gauss(ax - 0.045, 0.02) * gauss(y - 0.1, 0.014) * front
        + 0.35 * gauss(p[0], 0.01) * gauss(y - S.nose.y0 - 0.006, 0.01) * front;
      c = cmix(c, colors.blush, clamp(blush, 0, 1));
      // lips (the vermilion): upper lip with a bow, fuller lower lip
      const L = S.lips, mw = S.mouthW, ly = S.lineY(p[0]);
      const lx = ax / (mw * 1.05);
      if (lx < 1.15 && front > 0.5) {
        const bow = 0.0012 * gauss(p[0], 0.004);
        const upTop = my + L.h * Math.max(0, 1 - lx * lx) ** 0.6 - bow, loBot = my - L.hl * Math.max(0, 1 - lx * lx) ** 0.5;
        const inU = smooth(upTop + 0.0012, upTop - 0.0004, y) * smooth(ly - 0.002, ly, y);
        const inL = smooth(loBot - 0.0012, loBot + 0.0004, y) * (1 - smooth(ly, ly + 0.002, y));
        const k = clamp(Math.max(inU, inL * 1.0), 0, 1) * (1 - smooth(0.9, 1.15, lx));
        c = cmix(c, inL > inU ? cmul(lip, 1.08) : cmul(lip, 0.92), k * (fem ? 0.95 : 0.6) * (S.mouth.stitched ? 0.5 : 1));
        c = cmul(c, 1 - 0.38 * gauss(y - ly, 0.0011) * (1 - smooth(0.85, 1.1, lx)));   // v2: the dark line between the lips
      }
      // nostrils (a snout's are big and face forward)
      const N = S.nose;
      if (N.snout) {
        const nost = gauss(ax - N.w * 0.42, N.w * 0.18) * gauss(y - (N.y0 + 0.003), 0.0028) * front;
        c = cmul(c, 1 - 0.65 * clamp(nost * 1.3, 0, 1));
      } else {
        const nost = gauss(ax - lerp(0.0068, N.wing * 0.95, 0.5), 0.0028) * gauss(y - (N.y0 - 0.0015 + N.up * 0.0025), 0.0022) * front;
        c = cmul(c, 1 - (0.25 + 0.15 * N.up) * clamp(nost * 1.2, 0, 1));
      }
      // upper eyelid crease + a little shadow in the eye corners (a hooded lid: a heavy fold low over the eye)
      const ex = ax - S.eyeX;
      const cr = ES.crease ?? 0;
      const creaseY = S.eyeY + E.top + (cr < 0 ? 0.0018 : 0.0042 - cr * 0.0012);
      const crease = gauss(y - (creaseY - 0.06 * ex * ex / 0.0002 * 0.0002), cr < 0 ? 0.0022 : 0.0012) * gauss(ex, E.hw * 1.1) * front;
      c = cmul(c, 1 - (cr < 0 ? 0.32 : 0.22) * clamp(crease, 0, 1));
      const socket = gauss(ex, 0.018) * gauss(y - S.eyeY, 0.012) * front;
      c = cmix(c, cmul(colors.blush, 0.8), 0.12 * socket);
      if (ES.bags) c = cmix(c, [c[0] * 0.62, c[1] * 0.5, c[2] * 0.62], 0.55 * gauss(ex, E.hw * 0.8) * gauss(y - (S.eyeY - E.bot - 0.004), 0.003) * front);
      if (ES.hollow) c = cmix(c, [0.05, 0.03, 0.03], 0.7 * gauss(ex, E.hw * 1.05) * gauss(y - S.eyeY, E.top * 1.2) * front);
      c = cmul(c, 1 - 0.18 * gauss(y - (my - L.hl * 1.5), 0.004) * gauss(ax, mw * 0.8) * front);
      // under the jaw is a little darker
      c = cmul(c, 1 - 0.12 * (1 - smooth(0.0, 0.03, y)));
      for (const f of paint) c = f(p, c, y, th);
      return c;
    },
    ao: 0.45, rough: 0.62,
  };
}

/** Skin weights on the head (head space point). Exported: beards, masks and marks laid on the face reuse them. */
export function headWeights(p, S) {
  const [x, y, z] = p, ax = Math.abs(x), side = x >= 0 ? 'R' : 'L';
  const my = S.mouthY;
  // the jaw takes the chin and lower face below a line from the mouth back to the ear lobe
  const yb = my - 0.003 + (1 - clamp(z / 0.08, 0, 1)) * 0.03;
  const wJaw = (1 - smooth(yb - 0.012, yb + 0.002, y)) * smooth(-0.04, 0.0, z) * smooth(-0.02, 0.006, y);
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

// ------------------------------------------------------------------------------------------------- the eye outline
/** The almond of one eye in head space: yT / yB (upper / lower lid line) and xAt by t (0 = inner corner … 1 = outer). */
export function eyeOutline(S, sg) {
  const E = S.eye, ex0 = sg * S.eyeX, ey0 = S.eyeY;
  const corner = t => lerp(-0.0012, E.tilt, t);
  const yT = t => { const c = clamp(t, 0, 1); return ey0 + corner(t) + E.top * Math.pow(Math.sin(PI * c), 0.75) * (1 + 0.18 * (0.5 - t)) - E.inner * Math.pow(1 - c, 2) * Math.pow(Math.sin(PI * c), 0.5); };
  const yB = t => { const c = clamp(t, 0, 1); return ey0 + corner(t) - E.bot * Math.pow(Math.sin(PI * c), 0.95) * (1 - 0.12 * (0.5 - t)) + E.arch * E.top * 0.62 * Math.pow(Math.sin(PI * c), 1.4); };
  const xAt = t => ex0 + sg * lerp(-E.hw, E.hw, t);
  return { yT, yB, xAt, ex0, ey0 };
}

// ------------------------------------------------------------------------------------------------- face pieces
/**
 * Eyes, pupils, lashes, brows, mouth opening, teeth (+ fangs, tusks, tongue, stitches) and ears. Each is a small surface
 * placed on the head surface (so it sits on the face exactly) and skinned to its bone. `lod` 1 drops the smallest.
 */
export function faceParts(P, look, colors, F, { lod = 0 } = {}) {
  const H = makeHeadSurface(P), S = H.S, fem = S.fem, FL = H.F;
  const W = p => headToWorld(P, p);
  const parts = [];
  const onFace = (x, y, off) => H.onFace(x, y, off);
  const E = S.eye, ES = E.shape;
  // polish: a dark iris is lifted to a readable mid tone (luminance at least ~0.045 linear), hue kept
  const lift = c => { const L = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; const k = Math.min(2.6, Math.max(1, Math.sqrt(0.045 / Math.max(L, 1e-4)))); return cmul(c, k); };
  const eyeCol = (s) => lift(s === 'R' && colors.irisR ? colors.irisR : colors.iris);

  for (const [s, sg] of [['L', -1], ['R', 1]]) {
    const { yT, yB, xAt, ex0, ey0 } = eyeOutline(S, sg);
    const bulge = (t, v) => 0.0016 * Math.sin(PI * t) * Math.sin(PI * v);
    const iris = eyeCol(s);
    // ---- the eye white (glowing eyes: the whole eye is the eye colour, lit; hollow: a dark socket; dot / button: no white)
    // the eye colour at full brightness and pushed away from grey (a brown eye glows amber, not peach)
    const lit = (() => { const m = cmul(iris, 1 / Math.max(0.05, iris[0], iris[1], iris[2])), L = (m[0] + m[1] + m[2]) / 3; return m.map(v => clamp(L + (v - L) * 1.9, 0, 1)); })();
    const white = ES.glow ? lit : ES.hollow ? [0.03, 0.018, 0.018] : ES.white === false ? cmul(iris, 0.3) : colors.white;
    parts.push({
      name: 'eyeWhite' + s, us: [0, 0.07, 0.18, 0.34, 0.5, 0.66, 0.82, 0.93, 1], segs: 5, wrap: false, t0: 0, t1: 1,
      at(t, v) { const y = lerp(yB(t), yT(t), v); return { p: W(onFace(xAt(t), y, 0.0007 + bulge(t, v))), w: [['eye' + s, 1]] }; },
      out: () => [sg * 0.3, 0, 1],
      color(t, v) {
        let c = white.slice();
        if (ES.glow) { const core = 1 - smooth(0.0, 0.75, Math.hypot((t - 0.5) * 2, (v - 0.5) * 1.6)); return cmix(cmul(lit, 0.75), cmix(lit, [1, 1, 0.92], 0.45), core); }
        c = cmul(c, 1 - 0.28 * smooth(0.55, 1, v) - 0.18 * (1 - smooth(0, 0.22, Math.min(t, 1 - t))));
        if (t < 0.1 && !ES.hollow) c = cmix(c, colors.blush, 0.5 * (1 - t / 0.1));
        return c;
      },
      glow: ES.glow ? 1.4 : ES.hollow ? 0 : 0.18, rough: 0.25,
    });
    // ---- iris: a disc clipped to the almond at rest, on the pupil bone (gaze moves the bone)
    const R = E.iris, iy = ey0 + 0.0004 + (fem ? 0.0002 : 0);
    const clipXY = (x, y) => {
      const t = clamp((sg * (x - ex0) + E.hw) / (2 * E.hw), 0.02, 0.98);
      return clamp(y, yB(t) + 0.00035, yT(t) - 0.0003);
    };
    const onEye = (x, y, off) => {
      y = clipXY(x, y);
      const tt = clamp((sg * (x - ex0) + E.hw) / (2 * E.hw), 0, 1), vv = clamp((y - yB(tt)) / Math.max(1e-5, yT(tt) - yB(tt)), 0, 1);
      return W(onFace(x, y, off + bulge(tt, vv) * 0.6));
    };
    const irisMode = ES.irisNone || FL.eyes.iris === 'none' ? 'none' : FL.eyes.iris;
    const pupilCol = [0.012, 0.01, 0.01];
    if (!ES.glow && !ES.hollow) {
      parts.push({
        name: 'iris' + s, us: [0, 0.42, 0.78, 0.93, 1], segs: 12, capStart: true,
        at(r, a) { return { p: onEye(ex0 + Math.cos(a) * R * r, iy + Math.sin(a) * R * r, 0.0026), w: [['pupil' + s, 1]], r, a }; },
        out: () => [sg * 0.3, 0, 1],
        color(r, a) {
          if (irisMode === 'none') return cmix(pupilCol, cmul(iris, 0.5), 0.25 * smooth(0.6, 1, r));
          let c = cmix(cmul(iris, 1.9), iris, smooth(0.4, 0.75, r));
          if (irisMode === 'ring') c = cmix(cmul(iris, 2.4), cmul(iris, 0.5), smooth(0.5, 0.85, r));
          c = cmix(c, cmul(iris, 0.35), smooth(0.82, 1.0, r) * (irisMode === 'ring' ? 1.0 : 1));       // dark limbal ring
          c = cmul(c, 1 - 0.35 * smooth(0.0, 0.9, Math.sin(a)));        // the lid shades the top
          c = cmix(c, cmul(iris, 2.6), 0.35 * smooth(0.2, 0.9, -Math.sin(a)) * smooth(0.45, 0.7, r) * (1 - smooth(0.75, 0.9, r)));
          return c;
        },
        glow: 0.22, rough: 0.15,
      });
    }
    // ---- the pupil: its own little outline on top of the iris (round, slit, star, heart, cross, ring, dot); hollow eyes
    // keep a faint lit point
    const pid = ES.hollow ? 'dot' : ES.glow || irisMode === 'none' ? null : FL.eyes.pupil;
    if (pid && pid !== 'none') {
      const pr = pupilShape(pid);
      const ring = pid === 'ring';
      parts.push({
        name: 'pupil' + s, us: ring ? [0.62, 1] : [0, 1], segs: pid === 'round' || pid === 'dot' ? 10 : pid === 'slit' || pid === 'ring' ? 16 : 32, capStart: !ring,
        at(r, a) { const q = pr(a); return { p: onEye(ex0 + q[0] * r * R, iy + q[1] * r * R, 0.0031), w: [['pupil' + s, 1]] }; },
        out: () => [sg * 0.3, 0, 1], color: () => ES.hollow ? cmul(lit, 0.7) : pupilCol,
        glow: ES.hollow ? 1.2 : 0, rough: 0.15,
      });
    }
    // catchlights
    if (!ES.hollow && (!lod || ES.catch)) {
      const spots = ES.glow ? [] : [[0.28, 0.36, 0.0013], [-0.3, -0.32, 0.0008], [0.05, 0.5, 0.0006]].slice(0, ES.catch || 1);
      for (const [k, [ox, oy, rr]] of spots.entries()) {
        const hx = ex0 + sg * -R * 0.05 + R * ox, hy = iy + R * oy;
        parts.push({
          name: 'catch' + s + k, us: [0, 1], segs: 8, capStart: true,
          at(r, a) { return { p: W(onFace(hx + Math.cos(a) * rr * r, hy + Math.sin(a) * rr * r, 0.0036)), w: [['pupil' + s, 1]] }; },
          out: () => [0, 0, 1], color: () => [1, 1, 1], glow: 1.2, rough: 0.1,
        });
      }
    }
    // ---- upper lash line: a dark wedge that runs a little past the outer corner (flicked on the female, the cat eye…)
    const lashK = ES.lashK ?? 1, wing = ES.wing ?? 1;
    const lashTh = t => lerp(fem ? 0.001 : 0.0008, fem ? 0.0025 : 0.0019, smooth(0.0, 0.85, t)) * lashK * (1 - smooth(1.0, 1.12, t) * 0.7);
    parts.push({
      name: 'lash' + s, us: [0, 0.08, 0.2, 0.35, 0.5, 0.65, 0.8, 0.9, 1.0, 1.06, 1.12], segs: 2, wrap: false, t0: 0, t1: 1,
      at(t, v) {
        const tc = Math.min(t, 1);
        let x = xAt(t), y = yT(tc) - 0.00035;
        if (t > 1) { y += (t - 1) * (fem ? 0.055 : 0.02) * wing; x += sg * (t - 1) * 0.004 * wing; }
        y += v * lashTh(t);
        return { p: W(onFace(x, y, 0.0036 + 0.0004 * v)), w: [['eye' + s, 1]] };
      },
      out: () => [0, 0, 1], color: () => colors.lash, rough: 0.5,
    });
    // lower lid line: a soft dark line (female and the doe / lashes eyes: lashes at the outer half)
    const low = fem || ES.low;
    if (!lod) parts.push({
      name: 'lowLash' + s, us: [0.08, 0.3, 0.5, 0.7, 0.88, 1.0], segs: 1, wrap: false, t0: 0, t1: 1,
      at(t, v) { const y = yB(t) + 0.0002 - v * lerp(0.0003, low ? 0.0009 * (ES.low ? 1.4 : 1) : 0.0005, t); return { p: W(onFace(xAt(t), y, 0.0031)), w: [['eye' + s, 1]] }; },
      out: () => [0, 0, 1], color: (t) => low ? cmix(colors.skinDark, colors.lash, smooth(0.4, 0.9, t)) : colors.skinDark, rough: 0.6,
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
    // ---- brow
    parts.push(...browParts(P, H, colors, s, sg, W, lod));
  }
  // a unibrow's bridge over the nose
  const BS = BROW_SHAPES[FL.brows.id] || {};
  if (BS.bridge) {
    const b = browCurve(P, H, 1);
    const y0 = b.y(0) - 0.0004, th = b.th(0) * 0.78;
    parts.push({
      name: 'browBridge', us: [-1, -0.5, 0, 0.5, 1], segs: 2, wrap: false, t0: 0, t1: 1,
      at(u, v) { const x = u * b.x0, y = y0 - 0.0012 * (1 - u * u) - th * 0.4 + v * th * (0.75 + 0.25 * u * u); const k = (u + 1) / 2; return { p: W(onFace(x, y, 0.0011 + 0.0005 * Math.sin(PI * v))), w: [['browInL', 1 - k], ['browInR', k]] }; },
      out: () => [0, 0, 1], color: (u, v) => cmul(colors.brow, 0.9 + 0.2 * v), rough: 0.7,
    });
  }
  parts.push(...mouthParts(P, H, colors, W, lod));
  parts.push(...earParts(P, H, colors, W, lod));
  return parts;
}

/** A pupil outline: the point at parameter a (0..2π) in iris radii, round the pupil's centre. */
function pupilShape(id) {
  const polar = f => a => { const r = f(a); return [Math.cos(a) * r, Math.sin(a) * r]; };
  switch (id) {
    case 'slit': return polar(a => { const c = Math.cos(a), s = Math.sin(a); return 1 / Math.sqrt((c / 0.11) ** 2 + (s / 0.82) ** 2); });
    case 'dot': return polar(() => 0.2);
    case 'star': return polar(a => 0.2 + 0.3 * Math.pow(Math.cos(5 * (a - PI / 2) / 2) ** 2, 4));
    case 'heart': return a => {   // the classic heart curve, point down, ~0.5 of the iris across
      const t = a - PI / 2, k = 0.5 / 17;
      return [-16 * Math.sin(t) ** 3 * k, (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * k + 0.06];
    };
    case 'cross': return polar(a => { const c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a)); return Math.min(0.58, 0.1 / Math.max(1e-3, Math.min(c, s))); });
    case 'ring': return polar(() => 0.44);
    default: return polar(() => 0.36);
  }
}

/** The brow curve of one side: x0, x1, y(t), th(t) in head space (shared by the brow and the unibrow bridge). */
function browCurve(P, H, sg) {
  const fem = P.fem, FL = H.F, B = BROW_SHAPES[FL.brows.id] || {};
  const len = B.len ?? 1, start = B.start ?? 0;
  const bx0 = sg * (0.013 + start), bx1 = sg * (0.013 + start + ((fem ? 0.06 : 0.062) - 0.013) * len);
  const arch = B.arch ?? (fem ? 1.45 : 0.4);
  const archA = fem ? 0.0048 + (arch - 1.45) * 0.0033 : 0.0032 + (arch - 0.4) * 0.0033;
  const lift = B.lift ?? 0, slant = B.slant ?? 0, outer = B.outer ?? 0;
  const y = fem ? (t => 0.1505 + archA * Math.sin(PI * Math.pow(t, 0.8)) - 0.001 * t + lift + slant * (1 - t) + outer * t)
    : (t => 0.1465 + archA * Math.sin(PI * Math.pow(t, 0.7)) + 0.0045 * t - 0.005 * t * t + lift + slant * (1 - t) + outer * t);
  const k = (B.thick ?? 1) * (FL.brows.thick ?? 1);
  const taper = B.taper;
  const th = fem ? (t => lerp(0.0054, taper ? 0.0054 * taper : 0.002, smooth(0.25, 1, t)) * (0.8 + 0.2 * smooth(0, 0.15, t)) * k)
    : (t => lerp(0.0094, taper ? 0.0094 * taper : 0.0042, smooth(0.35, 1, t)) * (0.85 + 0.15 * smooth(0, 0.12, t)) * k);
  return { x0: bx0, x1: bx1, y, th, B };
}

/** One brow (a tapered strip bending between its two bones) — or two strips (split), or a dot. */
function browParts(P, H, colors, s, sg, W, lod) {
  const b = browCurve(P, H, sg), B = b.B;
  if (B.none) return [];
  const col = colors.brow;
  const mk = (name, t0, t1, shapeFn) => ({
    name, us: (B.rough && !lod ? [0, 0.06, 0.13, 0.2, 0.27, 0.34, 0.42, 0.5, 0.58, 0.66, 0.74, 0.82, 0.9, 1] : [0, 0.08, 0.2, 0.35, 0.5, 0.65, 0.8, 0.92, 1]).map(u => lerp(t0, t1, u)),
    segs: 3, wrap: false, t0: 0, t1: 1,
    at(t, v) {
      const x = lerp(b.x0, b.x1, t);
      let th = b.th(t) * (shapeFn ? shapeFn((t - t0) / (t1 - t0)) : 1);
      let top = 1;
      if (B.rough) top = 1 + 0.38 * Math.abs(Math.sin(t * 31 + sg)) - 0.1;     // bushy: a ragged upper edge of hairs
      const y = b.y(t) - th * 0.4 + v * th * (v > 0.5 ? top : 1);
      const wo = smooth(0.15, 0.85, t);
      return { p: W(H.onFace(x, y, 0.0011 + 0.0006 * Math.sin(PI * v) * (B.rough ? 1.6 : 1))), w: [['browIn' + s, 1 - wo], ['browOut' + s, wo]] };
    },
    out: () => [0, 0, 1], color: (t, v) => cmul(col, 0.9 + 0.2 * v), rough: 0.7,
  });
  if (B.dots) return [mk('brow' + s, 0.02, 0.3, u => 1.25 * Math.sqrt(Math.max(0.02, Math.sin(PI * u))))];
  if (B.gap) return [mk('brow' + s, 0, B.gap[0]), mk('browB' + s, B.gap[1], 1)];
  return [mk('brow' + s, 0, 1)];
}

// ------------------------------------------------------------------------------------------------- the mouth
function mouthParts(P, H, colors, W, lod) {
  const S = H.S, M = S.mouth, my = S.mouthY, mw = S.mouthW;
  const parts = [];
  const cornerW = (side) => [['mouthC' + side, 0.9], ['head', 0.1]];
  const edge = (u, top) => {
    const side = u >= 0 ? 'R' : 'L', a = Math.abs(u);
    const c = smooth(0.55, 1, a);
    const lip = top ? [['lipU', 1]] : [['lipD', 0.85], ['jaw', 0.15]];
    return [...lip.map(([b, v]) => [b, v * (1 - c)]), ...cornerW(side).map(([b, v]) => [b, v * c])];
  };
  const open = 0.0004;
  // the mouth opening: a dark lens over the lip line whose edges ride the lips (a tongue colours its bottom)
  const tongueCol = [0.55, 0.12, 0.13];
  parts.push({
    name: 'mouth', us: [-1, -0.85, -0.6, -0.3, 0, 0.3, 0.6, 0.85, 1], segs: 2, wrap: false, t0: 0, t1: 1,
    at(u, v) {
      const x = u * mw * 0.98, h = open * Math.sqrt(Math.max(0, 1 - u * u));
      const y = S.lineY(x) + (v - 0.5) * 2 * h;
      const w = Math.abs(u) > 0.999 ? cornerW(u > 0 ? 'R' : 'L') : (v > 0.75 ? edge(u, true) : v < 0.25 ? edge(u, false) : [...edge(u, true).map(([b, k]) => [b, k * 0.5]), ...edge(u, false).map(([b, k]) => [b, k * 0.5])]);
      return { p: W(H.onFace(x, y, 0.0009)), w };
    },
    out: () => [0, 0, 1],
    color: (u, v) => M.tongue === 'low' && v < 0.3 && Math.abs(u) < 0.6 ? tongueCol : cmix(cmul(colors.mouth, 0.55), cmul(colors.mouth, 0.16), v), rough: 0.85,
  });
  // teeth: a plane at the depth of the lip line (behind the lips, in front of the opening), so they only show when the
  // lips part. Upper teeth on the upper lip, lower teeth on the lower lip + jaw.
  const groove = x => H.onFace(x, S.lineY(x), 0.0017);
  const tW = Math.min(0.95, 0.82 * (M.teeth || 1));
  const teethRow = (name, top) => {
    const nT = M.teeth ? 21 : 7;     // shown teeth get a column at every gap between two teeth
    const us = M.shark ? Array.from({ length: 17 }, (_, i) => -tW + 2 * tW * i / 16) : Array.from({ length: nT }, (_, i) => -tW + 2 * tW * i / (nT - 1));
    const hgt = M.teeth ? 0.0028 : 0.0004;
    return {
      name, us, segs: 1, wrap: false, t0: 0, t1: 1,
      at(u, v) {
        const x = u * mw, g = groove(x);
        let dy = top ? 0.0004 - v * hgt : -0.0006 - (1 - v) * hgt * 0.55;
        if (M.shark) { const k = Math.abs(((u / (2 * tW) + 0.5) * 8) % 1 - 0.5) * 2; if (top && v > 0.5) dy += hgt * 0.65 * k; if (!top && v < 0.5) dy -= hgt * 0.55 * k; }
        if (M.clench) dy += top ? 0.0002 : -0.0002;
        const side = u >= 0 ? 'R' : 'L', c = smooth(0.5, 0.95, Math.abs(u)) * 0.6;
        const w = top ? (v < 0.5 ? [['lipU', 1 - c], ['mouthC' + side, c]] : [['lipU', (1 - c) * 0.62], ['lipD', (1 - c) * 0.38], ['mouthC' + side, c]])
          : [['lipD', (1 - c) * 0.7], ['jaw', (1 - c) * 0.3], ['mouthC' + side, c]];
        return { p: W([g[0], g[1] + dy, g[2] - 0.0004 * Math.abs(u) ** 2]), w };
      },
      out: () => [0, 0, 1],
      color: (u, v) => {
        // teeth: front ones widest; a dark gap between each two (every other column), the gum edge in shadow, darker at the sides
        const k = (u / tW * 0.5 + 0.5) * (nT - 1), gap = M.teeth && !M.shark && Math.round(k) % 2 === 1 ? 0.45 : 1;
        const edge = top ? 1 - 0.4 * smooth(0.6, 0.0, v) : 1 - 0.4 * smooth(0.4, 1.0, v);
        return cmul(colors.teeth, (1 - 0.45 * Math.abs(u) ** 1.5) * (top ? 1 : 0.86) * gap * edge);
      }, rough: 0.3, glow: 0.02,
    };
  };
  parts.push(teethRow('teeth', true));
  if ((M.lower || M.shark) && !lod) parts.push(teethRow('teethLow', false));
  // a cone from a to b (head space) with base radius r, `n` sides: fangs, tusks, buck teeth
  const cone = (name, a, b, r, w, col, n = 4, flat = 1) => {
    const d = norm(sub(b, a)); let u = norm(cross(d, [0, 0, 1])); if (!Number.isFinite(u[0])) u = [1, 0, 0];
    const v2 = cross(u, d);
    return {
      name, us: [0, 0.5, 1], segs: n, capEnd: true, capStart: true,
      at(t, ang) { const rr = r * (1 - t) ** 0.9; const c = add(a, mul(sub(b, a), t)); return { p: W(add(c, add(mul(u, Math.cos(ang) * rr), mul(v2, Math.sin(ang) * rr * flat)))), w }; },
      color: (t) => cmul(col, 0.92 + 0.08 * t), rough: 0.3, glow: 0.05,
    };
  };
  if (M.fangs) {
    for (const sg of M.fangs === 2 ? [-1, 1] : [1]) {
      const x = sg * mw * 0.5, g = groove(x), lowF = H.onFace(x, my - 0.0085, 0.0014);
      parts.push(cone('fang', [g[0], g[1] + 0.0008, g[2] - 0.0004], [lowF[0], lowF[1], Math.max(lowF[2], g[2] + 0.0008)], 0.0024, [['lipU', 0.8], ['mouthC' + (sg > 0 ? 'R' : 'L'), 0.2]], colors.teeth, 5));
    }
  }
  if (M.buck) for (const sg of [-1, 1]) {
    const x = sg * 0.0026, g = groove(x), lowF = H.onFace(x, my - 0.0052, 0.0012);
    parts.push(cone('buck', [g[0], g[1] + 0.0006, g[2]], [lowF[0], lowF[1], Math.max(lowF[2], g[2] + 0.0006)], 0.0026, [['lipU', 1]], colors.teeth, 4, 0.45));
  }
  if (M.tusks) for (const sg of [-1, 1]) {
    const x = sg * mw * 0.85, base = H.onFace(x, my - 0.011, -0.004), tip = H.onFace(x * 1.14, my + 0.017, 0.008);
    parts.push(cone('tusk', base, tip, 0.0048, [['lipD', 0.45], ['jaw', 0.55]], cmix(colors.teeth, [0.8, 0.72, 0.52], 0.35), 5));
  }
  if (M.tongue === true) {
    // a tongue tip out over the lower lip
    const c = H.onFace(0, my - 0.0042, 0.0028);
    parts.push({
      name: 'tongue', us: [0, 0.45, 0.8, 1], segs: 8, capEnd: true,
      at(r, a) { const x = Math.cos(a) * 0.0068 * Math.sin(PI / 2 * (1 - r * 0.6)), y = Math.sin(a) * 0.0045, z = 0.0032 * Math.sqrt(Math.max(0, 1 - r * r)); return { p: W([c[0] + x * (1 - r * 0.6), c[1] + y * (1 - r * 0.6) - 0.001, c[2] + z]), w: [['lipD', 0.6], ['jaw', 0.4]] }; },
      out: () => [0, 0, 1], color: (r) => cmix(tongueCol, [0.8, 0.3, 0.32], r * 0.5), rough: 0.35, glow: 0.04,
    });
  }
  if (M.stitched) {
    // short dark stitches across the lip line; each stretches with the lips because it carries their weights
    const n = 5;
    for (let i = 0; i < n; i++) {
      const x = lerp(-0.8, 0.8, i / (n - 1)) * mw;
      parts.push({
        name: 'stitch', us: [0, 0.5, 1], segs: 1, wrap: false, t0: 0, t1: 1,
        at(t, v) { const y = my + lerp(0.0042, -0.0048, t), xx = x + (v - 0.5) * 0.0011 + 0.0006 * (t - 0.5); const p = H.onFace(xx, y, 0.0009); return { p: W(p), w: headWeights(p, S) }; },
        out: () => [0, 0, 1], color: () => [0.06, 0.04, 0.04], rough: 0.8,
      });
    }
  }
  return parts;
}

// ------------------------------------------------------------------------------------------------- ears
function earParts(P, H, colors, W, lod) {
  const FL = H.F, ES = EAR_SHAPES[FL.ears.id] || {}, fem = P.fem;
  if (ES.none || ES.animal) return ES.animal ? animalEars(P, H, colors, W, ES.animal, lod) : [];
  const k = FL.ears.scale ?? 1;
  const parts = [];
  const tint = ES.fin ? cmix(colors.skin, [0.25, 0.55, 0.55], 0.4) : null;
  for (const [s, sg] of [['L', -1], ['R', 1]]) {
    const cy = 0.127, cz = -0.009;
    const eh = (fem ? 0.03 : 0.033) * (ES.h ?? 1) * k * (ES.fin ? 1.3 : 1), ez = (fem ? 0.023 : 0.026) * (ES.d ?? 1) * k * (ES.fin ? 1.55 : 1);
    const tip = ES.tip ? [ES.tip[0] * k, ES.tip[1]] : null;
    const outline = t => {        // t: 0..1 round from the front-top, over the top, down the back, the lobe, up the front
      const a = t * PI * 2;
      const top = Math.sin(a) > 0 ? 1 : 0.0;
      let y = Math.cos(a) * eh * (Math.cos(a) > 0 ? 1.0 : 1.08), z = -Math.sin(a) * ez * (Math.cos(a) > 0 ? 0.95 + 0.2 * Math.cos(a) : 0.62 - 0.12 * Math.cos(a));
      if (Math.cos(a) > 0) y *= 0.92 + 0.08 * Math.abs(Math.sin(a));       // a rounder top
      if (Math.sin(a) < 0) z *= 0.6;          // the front edge stays close to the face
      if (ES.fin) { const fan = 1 + 0.12 * Math.abs(Math.sin(a * 4)); y *= fan; z *= fan; }
      if (tip) {
        // a point at the top-back of the rim, sharpened by a raised gaussian
        const a0 = 0.45 + tip[1] * 0.75, g = Math.pow(gauss(adiff(a, a0), 0.55), 2.2);
        y += tip[0] * Math.cos(tip[1] * PI / 2) * g; z -= tip[0] * Math.sin(tip[1] * PI / 2) * g;
      }
      if (ES.notch) { const n = gauss(adiff(a, 1.3), 0.09) + gauss(adiff(a, 2.05), 0.08); y *= 1 - 0.22 * n; z *= 1 - 0.22 * n; }
      return [y, z + (top ? -0.002 : 0)];
    };
    const base = H.at(cy, sg * 1.62, { noFeatures: true });
    const bx = Math.abs(base[0]) - 0.002;
    const out = ES.out ?? 1;
    parts.push({
      name: 'ear' + s, us: [0, 0.4, 0.72, 0.9, 1], segs: tip || ES.notch || ES.fin ? (lod ? 12 : 18) : 12,
      at(v, a) {
        const t = a / (PI * 2);
        const [oy, oz] = outline(t);
        const back = clamp(-oz / ez, 0, 1);      // how far toward the back edge
        let x = bx + 0.003 + 0.016 * out * v * (0.55 + 0.45 * back) * (ES.fin ? 0.5 : 1);
        x += 0.0032 * gauss(v - 0.93, 0.07) - 0.0035 * gauss(v - 0.25, 0.3) * (1 - smooth(0.8, 1, Math.abs(oy) / eh) * 0.3);
        if (ES.fin) x += 0.0016 * Math.sin(a * 9) * v;     // the fin's ribs
        if (oy < -eh * 0.55 && !ES.fin) x += 0.002 * v;     // lobe
        const p = [sg * x, cy + oy * v, cz + oz * v];
        return { p: W(p), w: [['head', 1]], v };
      },
      capStart: true,
      out: () => [sg, 0, 0],
      mask: FACE_COVER.EARS,
      color(v, a) {
        const sk = tint || colors.skin;
        let c = cmix(cmix(sk, colors.blush, ES.fin ? 0.1 : 0.3), cmul(colors.skinDark, 0.9), 0.5 * (1 - smooth(0.2, 0.6, v)));
        if (ES.fin) c = cmul(c, 0.85 + 0.25 * Math.abs(Math.sin(a * 4.5)));
        if (ES.notch) { const t = a / (PI * 2) * PI * 2; c = cmul(c, 1 - 0.3 * (gauss(adiff(t, 1.3), 0.12) + gauss(adiff(t, 2.05), 0.1)) * smooth(0.7, 1, v)); }
        return c;
      },
      ao: 0.8, rough: 0.6,
    });
  }
  return parts;
}

/** Cat / wolf ears on top of the head (over the hair; the side ears are not built). */
function animalEars(P, H, colors, W, kind, lod) {
  const parts = [], wolf = kind === 'wolf';
  const fur = colors.hair, inner = cmix(colors.skin, [0.85, 0.45, 0.45], 0.4);
  for (const sg of [-1, 1]) {
    const th = sg * (wolf ? 0.72 : 0.78), y0 = wolf ? 0.205 : 0.21;
    const root = H.at(y0, th, { noFeatures: true }), n = H.normalAt(y0, th, { noFeatures: true });
    const up = norm(add(mul(n, 0.55), [sg * 0.1, 1, -0.1]));
    const fwd = norm(sub([Math.sin(th), 0, Math.cos(th)], mul(up, dot(up, [Math.sin(th), 0, Math.cos(th)]))));
    const side = cross(up, fwd);
    const hgt = wolf ? 0.085 : 0.062, wid = wolf ? 0.038 : 0.042, dep = 0.013;
    const c0 = add(root, mul(n, 0.004));
    parts.push({
      name: 'animalEar', us: [0, 0.3, 0.6, 0.85, 1], segs: 6, capEnd: true, capStart: true,
      at(t, a) {
        const w = wid * (1 - t) ** (wolf ? 1.1 : 0.85), d = dep * (1 - t) ** 0.7;
        const ca = Math.cos(a), sa = Math.sin(a);
        const bend = mul(fwd, -0.012 * t * t);
        const q = add(add(c0, mul(up, hgt * t)), add(bend, add(mul(side, ca * w), mul(fwd, sa * d * (sa > 0 ? 0.35 : 1)))));
        return { p: W(q), w: [['head', 1]], a };
      },
      color: (t, a, p, s) => (Math.sin(s.a) > 0.55 && t > 0.12 && t < 0.8 ? inner : cmul(fur, 0.9 + 0.2 * t)), rough: 0.6,
    });
  }
  return parts;
}

/** The eye opening at its middle column, relative to the eye bone, in bind-space metres (for blinks and squints), and
 *  what the face driver needs to know about this face (a wink, a never-blinking eye, the mouth's resting pose). */
export function eyeMetrics(P) {
  const H = makeHeadSurface(P), S = H.S, E = S.eye, HS = P.HS, F = H.F;
  const { yT, yB, ey0 } = eyeOutline(S, 1);
  const top = (yT(0.5) - ey0) * HS, bot = (yB(0.5) - ey0) * HS;
  const ES = E.shape;
  return {
    top, bot, line: top + (bot - top) * 0.62, limX: Math.max(0.0004, (E.hw - E.iris) * 0.65) * HS, limY: 0.0016 * HS * Math.min(1, (yT(0.5) - yB(0.5)) / 0.022),
    closed: { L: !!ES.closedL, R: false }, blinks: F.eyes.blink !== false, glow: !!ES.glow,
    mouthRest: (MOUTH_SHAPES[F.mouth] || {}).rest || null, swing: hairSwing(F.hair?.id),
  };
}
