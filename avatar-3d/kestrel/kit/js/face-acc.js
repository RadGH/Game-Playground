// Kestrel kit — things worn on the face and round the neck (the `accessory` slot: 20 ids). One draw call like the rest:
// thin tubes, discs and shells written as surfaces, coloured by vertex.
//
// Placement rules: frames sit 11 mm in front of the eye (the lashes, lids and brows move behind them in every
// expression and blink), temples run along the skull above the ears; cloth over the face (mask, scarf mask) is the face
// itself sampled again and pushed out, so it opens with the jaw; anything round the neck is laid on the neck / torso
// surfaces (body.js) with their own skin weights, and sits outside a shirt when one is worn.
import { clamp, lerp, smooth, gauss, add, sub, mul, norm, cross, dot, len, cmul, cmix, hexLin } from './kmath.js';
import { makeHeadSurface, headToWorld, headWeights, FACE_COVER } from './face.js';
import { EAR_SHAPES } from './face-catalog.js';

const PI = Math.PI;
const METAL = '#c9a43a', DARK = '#1c1a1e';
const DEFAULT = { glasses: '#2a2420', round_glasses: METAL, monocle: METAL, eyepatch: DARK, mask: '#565a66', scarf_mask: '#7a3a32', goggles: '#6a4a2a', earrings: METAL, nose_ring: METAL, blindfold: '#d8d2c4', sunglasses: '#1e1e22', g5_torc: METAL, scarf_trailing: '#3a5a7a', scarf_cowl: '#5a5248', scarf_striped: '#8a2e2e', neckerchief: '#a83a2a', scarf: '#2f4f7f', pendant: METAL, prayer_beads: '#6b4a2a' };

/** A closed tube in BIND space through path(t), radius r (number, fn, or [rx, ry] for a flat band). */
function wtube(parts, { name = 'acc', path, r, rows = 10, sides = 4, w, color, up = [0, 1, 0], capStart = true, capEnd = true, rough = 0.4, glow = 0, closed = false }) {
  const rf = typeof r === 'function' ? r : () => r;
  const us = Array.from({ length: rows + 1 }, (_, i) => i / rows);
  parts.push({
    name, us, segs: sides, capStart: closed ? false : capStart, capEnd: closed ? false : capEnd,
    at(t, a) {
      const c = path(t), T = norm(sub(path(Math.min(1, t + 0.01)), path(Math.max(0, t - 0.01))));
      let A = norm(cross(up, T)); if (!Number.isFinite(A[0]) || len(cross(up, T)) < 1e-3) A = norm(cross([0, 0, 1], T));
      const B = cross(T, A), rr = rf(t), rx = Array.isArray(rr) ? rr[0] : rr, ry = Array.isArray(rr) ? rr[1] : rr;
      return { p: add(c, add(mul(A, Math.cos(a) * rx), mul(B, Math.sin(a) * ry))), w: w(c, t), t, a };
    },
    color: (t, a, p, s) => (typeof color === 'function' ? color(s.t, s.a) : color), rough, glow,
  });
}

/**
 * The accessory for one look: { parts, covers(headPoint) (skin hidden under a mask) }.
 * body = { neck, torso } parts (body.js); worn = which garments are on (a necklace sits outside a shirt).
 */
export function accParts(P, colors, acc, { lod = 0, body = null, worn = {} } = {}) {
  const id = acc?.id || 'none';
  const parts = [];
  if (id === 'none') return { parts, covers: () => false };
  const H = makeHeadSurface(P), S = H.S, E = S.eye, F = H.F;
  const W = p => headToWorld(P, p);
  const col = hexLin(acc.color || DEFAULT[id] || METAL), col2 = hexLin(acc.color2 || '#e8e0d0');
  const headW = () => [['head', 1]];
  const HS = P.HS;
  const eyeC = sg => H.atXY(sg * S.eyeX, S.eyeY).p;
  let covers = () => false;

  // ---- frames over the eyes
  const lensFrame = (sg, { hw, hh, pw = 3, off = 0.011 }) => {
    const c0 = eyeC(sg), n = norm(add(H.normalAt(S.eyeY, H.atXY(sg * S.eyeX, S.eyeY).th), [0, 0, 0.6]));
    const c = add(c0, mul(n, off)), up0 = [0, 1, 0], A = norm(cross(up0, n)), U = cross(n, A);
    const at = (a, k = 1) => { const ca = Math.cos(a), sa = Math.sin(a), r = Math.pow(Math.pow(Math.abs(ca), pw) + Math.pow(Math.abs(sa), pw), -1 / pw); return add(c, add(mul(A, ca * r * hw * k), mul(U, sa * r * hh * k))); };
    return { c, n, A, U, at };
  };
  const frames = (shape) => {
    const lens = [];
    for (const sg of (id === 'monocle' ? [1] : [-1, 1])) {
      const L = lensFrame(sg, shape);
      wtube(parts, { name: 'rim', path: t => W(L.at(t * PI * 2)), r: shape.r || 0.0014 * HS, rows: lod ? 10 : 14, sides: 3, w: headW, color: col, closed: true, capStart: false, capEnd: false, rough: 0.3 });
      lens.push(L);
    }
    return lens;
  };
  const temples = (L, sg, { y = S.eyeY + 0.004, r = 0.001 } = {}) => {
    const start = L.at(sg > 0 ? 0 : PI), mid = add(H.at(y, sg * 1.12, { noFeatures: true }), mul(H.normalAt(y, sg * 1.12, { noFeatures: true }), 0.005)), end = add(H.at(0.142, sg * 1.5, { noFeatures: true }), mul(H.normalAt(0.142, sg * 1.5, { noFeatures: true }), 0.003));
    wtube(parts, { name: 'temple', path: t => W(t < 0.5 ? lerp3(start, mid, t * 2) : lerp3(mid, end, (t - 0.5) * 2)), r: r * HS, rows: 3, sides: 3, w: headW, color: col, rough: 0.35 });
  };
  const bridge = (Lr, Ll, r = 0.001) => {
    const a = Ll.at(0), b = Lr.at(PI), m = add(mul(add(a, b), 0.5), [0, 0.003, 0.004]);
    wtube(parts, { name: 'bridge', path: t => W(t < 0.5 ? lerp3(a, m, t * 2) : lerp3(m, b, (t - 0.5) * 2)), r: r * HS, rows: 3, sides: 3, w: headW, color: col, rough: 0.3 });
  };
  const lensDisc = (L, { tint, glow = 0, shape }) => {
    parts.push({ name: 'lens', us: [0, 1], segs: lod ? 10 : 14, capStart: true,
      at(k, a) { const p = add(L.at(a, k * 0.96), mul(L.n, 0.0015 * (1 - k * k))); return { p: W(p), w: headW() }; },
      out: () => L.n, color: (k) => cmix(tint, cmul(tint, 1.8), 0.35 * (1 - k)), rough: 0.08, glow });
    void shape;
  };
  const eyeHW = E.hw * 1.48, eyeHH = Math.max(0.0145, (E.top + E.bot) * 0.72);
  switch (id) {
    case 'glasses': case 'sunglasses': {
      const shape = { hw: eyeHW, hh: eyeHH * 0.92, pw: 3.2 };
      const [Ll, Lr] = frames(shape);
      bridge(Lr, Ll); temples(Ll, -1); temples(Lr, 1);
      if (id === 'sunglasses') { lensDisc(Ll, { tint: [0.03, 0.035, 0.05] }); lensDisc(Lr, { tint: [0.03, 0.035, 0.05] }); }
      break;
    }
    case 'round_glasses': {
      const shape = { hw: 0.0155, hh: 0.0155, pw: 2 };
      const [Ll, Lr] = frames(shape);
      bridge(Lr, Ll); temples(Ll, -1); temples(Lr, 1);
      break;
    }
    case 'monocle': {
      const [L] = frames({ hw: 0.0148, hh: 0.0148, pw: 2, off: 0.009, r: 0.0014 * HS });
      lensDisc(L, { tint: [0.6, 0.7, 0.75], glow: 0.15 });
      const a = L.at(-PI * 0.3), b = H.onFace(0.07, 0.04, 0.008), c = H.onFace(0.055, 0.005, 0.01);
      wtube(parts, { name: 'chain', path: t => W(t < 0.5 ? lerp3(a, add(b, [0, -0.012, 0]), t * 2) : lerp3(add(b, [0, -0.012, 0]), c, (t - 0.5) * 2)), r: 0.0006 * HS, rows: 6, sides: 3, w: q => headWeights([q[0], 0.05, 0.08], S), color: col });
      break;
    }
    case 'goggles': {
      const lens = [];
      for (const sg of [-1, 1]) {
        const L = lensFrame(sg, { hw: 0.019, hh: 0.017, pw: 2.2, off: 0.012 });
        wtube(parts, { name: 'goggle', path: t => W(L.at(t * PI * 2)), r: [0.0045 * HS, 0.0032 * HS], up: L.n, rows: lod ? 8 : 11, sides: 4, w: headW, color: col, closed: true, rough: 0.5 });
        lensDisc(L, { tint: [0.35, 0.55, 0.6], glow: 0.12 });
        lens.push(L);
      }
      // the strap round the head at eye level, outside the hair
      const yS = S.eyeY + 0.003;
      wtube(parts, { name: 'strap', path: t => { const a = lerp(-1.25, 1.25 - 2 * PI, t) ; const p = H.at(yS, a, { noFeatures: true }); return W(add(p, mul(H.normalAt(yS, a, { noFeatures: true }), Math.abs(Math.cos(a)) > 0.6 ? 0.006 : 0.013))); }, r: [0.0016 * HS, 0.0055 * HS], up: [0, 1, 0], rows: lod ? 8 : 10, sides: 4, w: headW, color: cmul(col, 0.55), rough: 0.6 });
      break;
    }
    case 'eyepatch': {
      const sg = -1, L = lensFrame(sg, { hw: E.hw * 1.35, hh: 0.016, pw: 2.4, off: 0.0045 });
      parts.push({ name: 'patch', us: [0, 0.5, 0.85, 1], segs: 12, capStart: true,
        at(k, a) { const p = add(L.at(a, k), mul(L.n, 0.004 * (1 - k * k) - 0.002 * k ** 4)); return { p: W(p), w: headW() }; },
        out: () => L.n, color: (k) => cmul(col, 0.9 + 0.2 * (1 - k)), rough: 0.55 });
      // the strap: from the patch up across the forehead, round the back above the ears, back under to the patch
      const pts = [L.at(PI * 0.82), [0.03, 0.2, 0.075], [0.085, 0.215, 0.0], [0.03, 0.2, -0.105], [-0.07, 0.15, -0.075], [-0.092, 0.122, 0.0], L.at(PI * 1.05)];
      const keep = q => { const th = Math.atan2(q[0], q[2]), y = clamp(q[1], 0.02, 0.236), s = H.at(y, th, { noFeatures: true }), r = Math.hypot(s[0], s[2]) + 0.0065, k = r / (Math.hypot(q[0], q[2]) || 1); return k > 1 ? [q[0] * k, q[1], q[2] * k] : q; };
      wtube(parts, { name: 'strap', path: t => W(keep(catmull(pts, t))), r: [0.0009 * HS, 0.0024 * HS], up: [0, 1, 0], rows: lod ? 10 : 18, sides: 4, w: headW, color: cmul(col, 0.8), rough: 0.6 });
      break;
    }
    case 'blindfold': {
      const yB = S.eyeY + 0.002;
      wtube(parts, { name: 'blind', path: t => { const a = lerp(-PI, PI, t); const p = H.at(yB, a, { noFeatures: true }); const f = Math.cos(a); return W(add(p, mul(H.normalAt(yB, a, { noFeatures: true }), f > 0.5 ? 0.012 + 0.006 * f : 0.012))); }, r: [0.0016 * HS, 0.014 * HS], up: [0, 1, 0], rows: lod ? 12 : 20, sides: 4, w: headW, color: col, closed: true, rough: 0.8 });
      const knot = H.at(yB, PI, { noFeatures: true });
      for (const sg of [-1, 1]) wtube(parts, { name: 'tails', path: t => W(add(knot, [sg * (0.006 + 0.02 * t), -0.06 * t, -0.016 - 0.01 * t])), r: [0.006 * HS, 0.0013 * HS], rows: 3, sides: 4, w: headW, color: cmul(col, 0.92), rough: 0.8 });
      break;
    }
    case 'mask': case 'scarf_mask': {
      // cloth over the nose and the lower face, falling straight from the nose; skin under it is not drawn
      const N = S.nose, tip = H.atXY(0, N.y0 + 0.006).p;
      const top = 0.104, bot = id === 'scarf_mask' ? -0.03 : -0.008, span = 1.48;
      const ys = [bot, bot + 0.012, 0.0, 0.016, 0.032, S.mouthY - 0.006, S.mouthY + 0.008, N.y0 - 0.004, N.y0 + 0.008, 0.096, top].filter((y, i, a) => i === 0 || y > a[i - 1] + 0.003);
      const aW = 0.4, theta = (j, n) => { const u = j / n * 2 - 1; return span * (aW * u + (1 - aW) * u * u * u); };
      const drape = (p, y) => {
        const ax = Math.abs(p[0]); if (y > N.y0 + 0.012) return p;
        const zMin = tip[2] + 0.004 - (N.y0 + 0.006 - y) * 0.62 - (ax / 0.034) ** 2 * 0.03;
        return [p[0], p[1], Math.max(p[2], zMin)];
      };
      parts.push({ name: 'mask', us: ys, segs: lod ? 12 : 18, wrap: false, theta,
        at(y, th) {
          const p = H.at(y, th), n = H.normalAt(y, th);
          const edge = smooth(span * 0.97, span * 0.88, Math.abs(th)) * smooth(top + 0.0005, top - 0.006, y);
          let q = add(p, mul(n, 0.0032 * edge + 0.0008));
          q = drape(q, y);
          return { p: W(q), w: headWeights(p, S), hp: p };
        },
        out: (q, y, th) => [Math.sin(th), 0, Math.cos(th)],
        color: (y, th) => cmul(col, 0.88 + 0.12 * Math.sin(y * 420) * Math.sin(th * 3 + 1) + (y > top - 0.005 ? -0.12 : 0)), rough: 0.85, ao: 0.3,
      });
      covers = p => p[1] < top - 0.01 && p[1] > bot + 0.006 && Math.abs(Math.atan2(p[0], p[2])) < span * 0.8;
      if (id === 'scarf_mask') {
        // the cloth goes round the head at the top edge and is knotted behind
        wtube(parts, { name: 'wrap', path: t => { const a = lerp(span * 0.9, 2 * PI - span * 0.9, t), yy = lerp(top - 0.004, 0.05, smooth(0.5, 2.6, Math.abs(Math.atan2(Math.sin(a), Math.cos(a))))); const p = H.at(yy, a, { noFeatures: true }); return W(add(p, mul(H.normalAt(yy, a, { noFeatures: true }), 0.012))); }, r: [0.0018 * HS, 0.006 * HS], up: [0, 1, 0], rows: lod ? 8 : 12, sides: 4, w: headW, color: cmul(col, 0.9), rough: 0.85 });
        const k = add(H.at(0.06, PI, { noFeatures: true }), [0, 0, -0.016]);
        parts.push({ name: 'knot', us: [0, 0.5, 1], segs: 6, capStart: true, capEnd: true, at(v, a) { const s = Math.sin(PI * v); return { p: W(add(k, [Math.cos(a) * 0.011 * s, Math.cos(PI * v) * 0.009, Math.sin(a) * 0.008 * s])), w: headW() }; }, color: () => cmul(col, 0.85), rough: 0.85 });
      }
      break;
    }
    case 'earrings': {
      const ES = EAR_SHAPES[F.ears.id] || {};
      if (ES.none || ES.animal) break;
      const k = F.ears.scale ?? 1, eh = (P.fem ? 0.03 : 0.033) * (ES.h ?? 1) * k;
      for (const sg of [-1, 1]) {
        const base = H.at(0.127, sg * 1.62, { noFeatures: true }), x = Math.abs(base[0]) + 0.012, c = [sg * x, 0.127 - eh * 1.02 - 0.0065, -0.011];
        wtube(parts, { name: 'earring', path: t => W(add(c, [0, Math.cos(t * PI * 2) * 0.0068, Math.sin(t * PI * 2) * 0.0068])), r: 0.0012 * HS, rows: 10, sides: 4, w: headW, color: col, closed: true, rough: 0.25, glow: 0.05 });
      }
      break;
    }
    case 'nose_ring': {
      const N = S.nose, c = H.onFace(-(N.wing * 1.35 + 0.002), N.y0 - 0.001, 0.0022);
      wtube(parts, { name: 'noseRing', path: t => W(add(c, [Math.sin(t * PI * 2) * 0.0014 - 0.0012, -Math.cos(t * PI * 2) * 0.0045 - 0.0016, Math.cos(t * PI * 2) * 0.0035 + 0.001])), r: 0.001 * HS, rows: 10, sides: 4, w: headW, color: col, closed: true, rough: 0.25, glow: 0.05 });
      break;
    }
    default: neckPiece(parts, P, id, col, col2, { lod, body, worn });
  }
  return { parts, covers };
}

/** Things round the neck: torc, scarves, neckerchief, pendant, prayer beads (bind space, on the neck / torso). */
function neckPiece(parts, P, id, col, col2, { lod, body, worn }) {
  if (!body?.neck || !body?.torso) return;
  const nk = body.neck, T = body.torso, k = P.k;
  const cz = y => (nk.at(y, 0).p[2] + nk.at(y, PI).p[2]) / 2;
  // polish: a ring at height y round the OUTSIDE of whatever is there (the neck, and the torso's trapezius where it rises
  // beside the neck), so a torc / scarf / cord is never buried in the shoulders and never floats out at the collarbones
  const ringAt = (y, off, a) => {
    const s = nk.at(y, a).p, c = cz(y); let r = Math.hypot(s[0], s[2] - c);
    if (T && y < T.yTop && y > T.yBot) { const R = T.radiusAt(y, a); if (R) { const q = [Math.sin(a) * R.r, y, R.cz + Math.cos(a) * R.r]; r = Math.max(r, Math.hypot(q[0], q[2] - c)); } }
    r += off; return [Math.sin(a) * r, y, c + Math.cos(a) * r];
  };
  const nW = (y, a) => nk.at(y, a).w;
  const shirt = worn.shirt ? 0.016 : 0;
  const onChest = (x, y, off) => T.project([x, y, 0.3], off + shirt);
  const chestW = (q) => T.weightsAt(q[1], q[0], q[2]);
  const baseY = P.neckY - 0.035 * k;
  switch (id) {
    case 'g5_torc': {
      const y = P.neckY + 0.012 * k;      // the middle of the bare neck
      wtube(parts, { name: 'torc', path: t => ringAt(y - 0.006 * Math.cos(lerp(0.32, 2 * PI - 0.32, t)), 0.012, lerp(0.32, 2 * PI - 0.32, t)), r: t => 0.0055 * (1 - 0.25 * Math.sin(PI * t) ** 4), rows: lod ? 10 : 18, sides: 5, w: (q, t) => nW(y, lerp(0.32, 2 * PI - 0.32, t)), color: (t, a) => cmul(col, 0.85 + 0.3 * Math.abs(Math.sin(t * 60))), rough: 0.25, glow: 0.04 });
      for (const a of [0.32, -0.32]) { const c = ringAt(y - 0.006 * Math.cos(a), 0.008, a); parts.push({ name: 'torcEnd', us: [0, 0.5, 1], segs: 6, capStart: true, capEnd: true, at(v, b) { const s = Math.sin(PI * v); return { p: add(c, [Math.cos(b) * 0.0085 * s, Math.cos(PI * v) * 0.0085, Math.sin(b) * 0.0085 * s]), w: nW(y, a) }; }, color: () => cmul(col, 1.15), rough: 0.25 }); }
      break;
    }
    case 'scarf': case 'scarf_striped': case 'scarf_trailing': case 'scarf_cowl': {
      const y = P.neckY - (id === 'scarf_cowl' ? 0.006 : 0.0) * k;      // round the neck's base, resting on the trapezius
      const stripes = id === 'scarf_striped' ? (t) => (Math.floor(t * 16) % 2 ? col : col2) : () => col;
      const thick = id === 'scarf_cowl' ? [0.03, 0.026] : [0.022, 0.016];
      wtube(parts, { name: 'scarf', path: t => ringAt(y, thick[0] * 0.75 + shirt * 0.5, t * PI * 2), r: thick, up: [0, 1, 0], rows: lod ? 10 : 16, sides: lod ? 5 : 6, w: (q, t) => nW(y, t * PI * 2), color: (t, a) => cmul(stripes(t), 0.86 + 0.18 * Math.abs(Math.sin(a * 2 + t * 30))), closed: true, rough: 0.9 });
      // the hanging end(s)
      const ends = id === 'scarf_trailing' ? [[0.035, 1], [-0.02, -1]] : id === 'scarf_cowl' ? [] : [[0.035, 1]];
      for (const [x, dir] of ends) {
        const start = ringAt(y - 0.01, thick[0] * 1.2, dir > 0 ? 0.3 : PI + 0.4);
        const pts = dir > 0 ? [start, onChest(x, y - 0.08 * k, 0.03), onChest(x + 0.005, y - 0.17 * k, 0.028), onChest(x + 0.01, y - 0.25 * k, 0.026)]
          : [start, add(T.project([0.05, y - 0.06 * k, -0.3], 0.03 + shirt), [0, 0, 0]), T.project([0.06, y - 0.18 * k, -0.3], 0.026 + shirt), T.project([0.07, y - 0.32 * k, -0.3], 0.024 + shirt)];
        wtube(parts, { name: 'scarfEnd', path: t => catmull(pts, t), r: [0.026, 0.005], up: dir > 0 ? [0, 0, 1] : [0, 0, -1], rows: lod ? 3 : 5, sides: 4, w: chestW, color: (t) => stripes(0.5 + t * 0.4), rough: 0.9 });
      }
      break;
    }
    case 'neckerchief': {
      const y = baseY + 0.006;
      wtube(parts, { name: 'kerchief', path: t => ringAt(y, 0.006, t * PI * 2), r: [0.0045, 0.004], rows: lod ? 10 : 16, sides: 4, w: (q, t) => nW(y, t * PI * 2), color: col, closed: true, rough: 0.85 });
      // the triangle on the chest
      parts.push({ name: 'flap', us: [0, 0.35, 0.7, 1], segs: 4, wrap: false, t0: 0, t1: 1,
        at(v, u) { const hw = 0.055 * (1 - v), x = lerp(-hw, hw, u), yy = y - 0.004 - v * 0.085 * k; const q = onChest(x, yy, 0.008 + 0.002 * (1 - v)); return { p: q, w: chestW(q) }; },
        out: (q) => [q[0], 0, q[2] - T.centreZ(q[1])], color: (v) => cmul(col, 0.9 + 0.12 * v), rough: 0.85 });
      break;
    }
    case 'pendant': case 'prayer_beads': {
      const beads = id === 'prayer_beads', low = baseY - (beads ? 0.16 : 0.13) * k;
      const path = t => {
        const a = t * PI * 2, f = (1 + Math.cos(a)) / 2;                   // 1 at the front
        const yy = lerp(baseY + 0.008, low, f ** 1.6);
        const q = [Math.sin(a) * 0.2, yy, Math.cos(a) * 0.2];
        if (yy > T.yTop) return ringAt(Math.min(yy, P.neckY), 0.004, a);
        return T.project(q, (beads ? 0.006 : 0.003) + shirt);
      };
      wtube(parts, { name: beads ? 'beads' : 'cord', path, r: beads ? t => 0.0035 + 0.0025 * Math.abs(Math.sin(t * PI * 17)) : 0.0012, rows: beads ? (lod ? 22 : 34) : (lod ? 12 : 20), sides: beads ? 4 : 3, w: chestW, color: beads ? (t) => cmul(col, 0.8 + 0.4 * Math.abs(Math.sin(t * PI * 17))) : cmul(col, 0.75), closed: true, rough: 0.4 });
      const c = onChest(0, low - 0.012, 0.007);
      if (beads) wtube(parts, { name: 'tassel', path: t => add(c, [0, -0.04 * t, 0.002]), r: t => 0.003 + 0.006 * t, rows: 3, sides: 5, w: chestW, color: [0.75, 0.2, 0.15], rough: 0.8 });
      else parts.push({ name: 'charm', us: [0, 0.5, 1], segs: 6, capStart: true, capEnd: true,
        at(v, a) { const s = Math.sin(PI * v); return { p: add(c, [Math.cos(a) * 0.012 * s, Math.cos(PI * v) * 0.017, 0.004 + Math.sin(a) * 0.004 * s]), w: chestW(c) }; },
        color: (v) => cmul(col, 0.9 + 0.3 * (1 - v)), rough: 0.25, glow: 0.05 });
      break;
    }
    default: break;
  }
}

const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
function catmull(pts, t) {
  const n = pts.length - 1, f = clamp(t, 0, 1) * n, i = Math.min(n - 1, Math.floor(f)), u = f - i;
  const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n, i + 2)];
  const u2 = u * u, u3 = u2 * u;
  return [0, 1, 2].map(k => 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * u + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u3));
}
export { FACE_COVER };
