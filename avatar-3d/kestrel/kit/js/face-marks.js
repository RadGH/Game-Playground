// Kestrel kit — face marks (the `extras` slot: 31 ids). Head space (face.js).
//
// Two kinds, both with no texture and inside the one draw call:
//   * PAINT — soft areas (blush, dirt, mud, a burn, black round the eyes, a war band, rot) mix the head's own vertex
//     colours (headPart's `paint` hook), so they lie UNDER the eyes, brows and mouth and can never clip them.
//   * DECALS — crisp marks (scars, stripes, glyphs, dots, freckles, stars, a brand, stitches) are thin strips / discs laid
//     ON the face (face.js onFace, 0.6–0.9 mm off the skin) carrying the face's own skin weights (headWeights), so they
//     move with the jaw, lips and cheeks in every expression.
// The skin itself changes for undead_skin and pale (markSkin, applied before the body is built).
// A mark has a default colour; `extras.color` overrides it.
import { clamp, lerp, smooth, gauss, add, mul, cmul, cmix, hexLin } from './kmath.js';
import { makeHeadSurface, headToWorld, headWeights } from './face.js';

const PI = Math.PI;
const DEFAULT_INK = { warpaint: '#8a2e2e', war_stripe: '#8a2e2e', war_mask: '#22252c', cheek_stripes: '#2c5a8a', face_glyphs: '#2f6f9a', paint_dots: '#e8e0d0', tear_mark: '#2a3e7a', star_mark: '#2a3e7a', moon_mark: '#c9a227', chin_lines: '#2a3e5a', brand: '#6a1e1e', blood: '#7a1414' };

/** The skin colour a mark changes (undead / pale), as a hex in → hex out; null = unchanged. */
export function markSkin(id, skinHex) {
  if (id !== 'undead_skin' && id !== 'pale') return null;
  const c = hexLin(skinHex);
  const L = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const out = id === 'pale' ? [lerp(L, c[0], 0.35) * 1.45, lerp(L, c[1], 0.35) * 1.48, lerp(L, c[2], 0.35) * 1.55] : [L * 0.85 + 0.03, L * 1.05 + 0.05, L * 0.8 + 0.02];
  const toS = v => { v = clamp(v, 0, 1); return Math.round((v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055) * 255); };
  return '#' + out.map(v => toS(v).toString(16).padStart(2, '0')).join('');
}

/**
 * The marks for one look: { parts (decals), paint (head colour layers) }.
 */
export function markParts(P, colors, marks, { lod = 0 } = {}) {
  const id = marks?.id || 'none';
  if (id === 'none' || id === 'pale') return { parts: [], paint: [] };
  const H = makeHeadSurface(P), S = H.S;
  const W = p => headToWorld(P, p);
  const ink = marks.color ? hexLin(marks.color) : hexLin(DEFAULT_INK[id] || '#7a2a2a');
  const skin = colors.skin;
  const parts = [], paint = [];
  const ey = S.eyeY, ex = S.eyeX, my = S.mouthY, E = S.eye;
  const cheekY = ey - 0.03, forehead = 0.172;
  const mixSkin = (c, k) => cmix(skin, c, k);

  // ---- decal builders
  /** A strip through face points [[x, y], …] with width w (or w(t)), colour col. */
  const strip = (pts, w, col, { off = 0.0008, name = 'mark', rows = null } = {}) => {
    const n = pts.length - 1;
    const us = rows || Array.from({ length: Math.max(2, n * 2) + 1 }, (_, i) => i / Math.max(2, n * 2));
    const at = t => { const f = t * n, i = Math.min(n - 1, Math.floor(f)), u = f - i; return [lerp(pts[i][0], pts[i + 1][0], u), lerp(pts[i][1], pts[i + 1][1], u)]; };
    parts.push({
      name, us, segs: 1, wrap: false, t0: 0, t1: 1,
      at(t, v) {
        const a = at(t), b = at(Math.min(1, t + 0.02)), c = at(Math.max(0, t - 0.02));
        let dx = b[0] - c[0], dy = b[1] - c[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
        const ww = typeof w === 'function' ? w(t) : w;
        const x = a[0] - dy * (v - 0.5) * ww, y = a[1] + dx * (v - 0.5) * ww;
        const p = H.onFace(x, y, off);
        return { p: W(p), w: headWeights(p, S) };
      },
      out: () => [0, 0, 1], color: () => col, rough: 0.6,
    });
  };
  /** A disc (or a shape: r(a) in units of r) at face point (x, y). */
  const dot = (x, y, r, col, { shape = null, segs = 6, off = 0.0008, name = 'dot' } = {}) => {
    parts.push({
      name, us: [0, 1], segs, capStart: true,
      at(k, a) { const rr = r * k * (shape ? shape(a) : 1); const p = H.onFace(x + Math.cos(a) * rr, y + Math.sin(a) * rr, off); return { p: W(p), w: headWeights(p, S) }; },
      out: () => [0, 0, 1], color: () => col, rough: 0.6,
    });
  };
  /** A paint layer: k(p) → 0..1 share of `col`. */
  const layer = (k, col) => paint.push((p, c) => { const v = clamp(k(p), 0, 1); return v > 0.002 ? cmix(c, col, v) : c; });
  const front = p => smooth(0.02, 0.06, p[2]);
  const rnd = (i) => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

  switch (id) {
    case 'freckles': case 'freckles_heavy': case 'freckles_nose': {
      const col = cmix(skin, [0.32, 0.15, 0.07], 0.42);
      const n = id === 'freckles_heavy' ? (lod ? 16 : 30) : (lod ? 8 : 14);
      for (let i = 0; i < n; i++) {
        let x, y;
        if (id === 'freckles_nose') { x = (rnd(i) * 2 - 1) * 0.028; y = S.nose.y0 + 0.012 + (rnd(i + 50) - 0.5) * 0.02 - Math.abs(x) * 0.25; }
        else { const sg = i % 2 ? 1 : -1; x = sg * (0.018 + rnd(i) * 0.045); y = cheekY + 0.006 - rnd(i + 9) * 0.03 + (Math.abs(x) < 0.025 ? 0.012 : 0); }
        dot(x, y, 0.0011 + rnd(i + 3) * 0.0008, col, { segs: 5 });
      }
      break;
    }
    case 'blush': case 'blush_soft':
      layer(p => (id === 'blush' ? 0.42 : 0.26) * gauss(Math.abs(p[0]) - 0.05, id === 'blush' ? 0.016 : 0.022) * gauss(p[1] - (ey - 0.03), 0.012) * front(p), marks.color ? ink : [0.85, 0.3, 0.32]);
      break;
    case 'scar': case 'scar_brow': {
      // through the brow, over the lid's closed line (the eye itself is skipped), down the cheek
      const col = mixSkin([0.85, 0.55, 0.55], 0.55), x = -ex + 0.006;
      strip([[x - 0.012, 0.17], [x - 0.004, 0.148]], t => lerp(0.0028, 0.0018, t), col, { name: 'scar' });
      if (id === 'scar') strip([[x + 0.002, ey - E.bot - 0.004], [x + 0.006, ey - 0.03], [x + 0.009, ey - 0.052]], t => lerp(0.0028, 0.0008, t), col, { name: 'scar' });
      if (!lod) for (const t of [0.3, 0.7]) { const yy = lerp(0.17, 0.148, t), xx = lerp(x - 0.012, x - 0.004, t); strip([[xx - 0.004, yy - 0.0015], [xx + 0.004, yy + 0.0015]], 0.0011, cmul(col, 0.92), { name: 'scar' }); }
      break;
    }
    case 'scar_cheek': strip([[0.032, cheekY + 0.006], [0.048, cheekY - 0.012], [0.058, cheekY - 0.03]], t => 0.0032 * Math.sin(PI * clamp(t * 0.9 + 0.08, 0, 1)) + 0.0006, mixSkin([0.85, 0.55, 0.55], 0.55), { name: 'scar' }); break;
    case 'scar_lip': strip([[0.008, my + 0.014], [0.009, my], [0.011, my - 0.012]], t => 0.0022 * Math.sin(PI * clamp(t * 0.9 + 0.05, 0, 1)) + 0.0005, mixSkin([0.9, 0.6, 0.6], 0.5), { name: 'scar', off: 0.0012 }); break;
    case 'burn_scar':
      layer(p => { const d = Math.hypot(p[0] - 0.05, p[1] - (cheekY - 0.008)) - 0.02 - 0.0035 * Math.sin(Math.atan2(p[1] - cheekY, p[0] - 0.05) * 5 + 1); return smooth(0.004, -0.002, d) * (0.55 + 0.25 * Math.sin(p[0] * 900) * Math.sin(p[1] * 700)) * front(p); }, [0.48, 0.17, 0.15]);
      break;
    case 'warpaint': case 'war_mask': {
      const top = ey + E.top + 0.009, bot = ey - E.bot - 0.012;
      layer(p => {
        const ax = Math.abs(p[0]);
        let v = smooth(bot - 0.002, bot + 0.002, p[1]) * smooth(top + 0.002, top - 0.002, p[1]) * smooth(0.088, 0.078, ax) * front(p);
        if (id === 'warpaint') v *= smooth(0.006, 0.012, ax);       // a clear bridge over the nose
        return v * 0.92;
      }, ink);
      if (id === 'warpaint') strip([[0, 0.19], [0, 0.163]], t => lerp(0.0055, 0.0035, t), ink, { name: 'paint' });
      break;
    }
    case 'war_stripe': {
      const pts = []; for (let i = 0; i <= 12; i++) { const a = lerp(-1.25, 1.25, i / 12); const p = H.at(0.176, a); pts.push([p[0], 0.176]); }
      // a band round the forehead from temple to temple: its points are found by x on the face, so it follows the brow ridge
      strip(pts, 0.01, ink, { name: 'stripe' });
      break;
    }
    case 'cheek_stripes':
      for (const sg of [-1, 1]) for (let k = 0; k < 3; k++) strip([[sg * 0.03, cheekY - k * 0.008], [sg * 0.062, cheekY - 0.003 - k * 0.008]], t => 0.0028 * Math.sin(PI * clamp(t * 0.85 + 0.08, 0, 1)) + 0.0006, ink, { name: 'stripe' });
      break;
    case 'eye_black': {
      layer(p => {
        const ax = Math.abs(p[0]), dx = (ax - ex) / (E.hw * 1.55), dy = (p[1] - (ey - 0.002)) / ((E.top + E.bot) * 0.95);
        return smooth(1.15, 0.8, Math.hypot(dx, dy)) * 0.88 * front(p);
      }, [0.06, 0.05, 0.06]);
      break;
    }
    case 'face_glyphs':
      strip([[0, 0.186], [0, 0.166]], 0.0026, ink, { name: 'glyph' });
      strip([[-0.008, 0.177], [0.008, 0.177]], 0.0024, ink, { name: 'glyph' });
      for (const sg of [-1, 1]) strip([[sg * 0.058, cheekY + 0.004], [sg * 0.05, cheekY - 0.006], [sg * 0.058, cheekY - 0.016], [sg * 0.05, cheekY - 0.026]], 0.0022, ink, { name: 'glyph' });
      break;
    case 'paint_dots':
      for (const sg of [-1, 1]) for (let k = 0; k < 3; k++) {
        dot(sg * (0.03 + k * 0.011), cheekY - 0.006, 0.0032, ink, { segs: 7 });
        if (!lod) dot(sg * (0.022 + k * 0.012), 0.163 - k * 0.002, 0.0024, ink, { segs: 6 });
      }
      break;
    case 'third_eye': {
      // a small upright eye in the middle of the forehead: white, iris and pupil, on the head bone (it does not blink)
      const cy = 0.176, hh = 0.0135, hw = 0.0078;
      parts.push({ name: 'thirdEye', us: [0, 0.2, 0.5, 0.8, 1], segs: 4, wrap: false, t0: 0, t1: 1,
        at(t, v) { const y = cy + lerp(-hh, hh, t), w = hw * Math.pow(Math.sin(PI * t), 0.8); const p = H.onFace(lerp(-w, w, v), y, 0.0008 + 0.0014 * Math.sin(PI * t) * Math.sin(PI * v)); return { p: W(p), w: [['head', 1]] }; },
        out: () => [0, 0, 1], color: () => colors.white, rough: 0.25, glow: 0.15 });
      dot(0, cy, 0.0058, colors.iris, { segs: 10, off: 0.0026, name: 'thirdIris', shape: a => 1 / Math.sqrt((Math.cos(a) / 0.95) ** 2 + (Math.sin(a) / 1.1) ** 2) });
      dot(0, cy, 0.0056, [0.02, 0.015, 0.015], { segs: 8, off: 0.003, name: 'thirdPupil', shape: a => 1 / Math.sqrt((Math.cos(a) / 0.18) ** 2 + (Math.sin(a) / 0.85) ** 2) });
      break;
    }
    case 'wrinkles': {
      const col = cmul(skin, 0.78);
      for (let k = 0; k < 3; k++) strip([[-0.04, 0.168 + k * 0.007], [0, 0.17 + k * 0.007], [0.04, 0.168 + k * 0.007]], t => 0.0011 * Math.sin(PI * t) + 0.0002, col, { name: 'wrinkle', off: 0.0005 });
      for (const sg of [-1, 1]) for (const d of [-0.004, 0.001, 0.006]) strip([[sg * (ex + E.hw + 0.002), ey + d * 0.5], [sg * (ex + E.hw + 0.011), ey + d * 1.4]], t => 0.0009 * (1 - t) + 0.0002, col, { name: 'wrinkle', off: 0.0005 });
      for (const sg of [-1, 1]) strip([[sg * 0.012, S.nose.y0 + 0.002], [sg * (S.mouthW + 0.004), my - 0.004]], t => 0.0012 * Math.sin(PI * t) + 0.0002, col, { name: 'wrinkle', off: 0.0005 });
      break;
    }
    case 'dirt': case 'mud': {
      const col = id === 'mud' ? [0.13, 0.08, 0.04] : [0.2, 0.13, 0.08];
      const spots = [[-0.05, cheekY - 0.01, 0.012], [-0.04, cheekY - 0.022, 0.008], [0.052, cheekY - 0.004, 0.011], [0.06, cheekY - 0.016, 0.007], [0.025, 0.178, 0.009], [0.035, 0.17, 0.006], [-0.012, my - 0.02, 0.006]];
      layer(p => { let v = 0; for (const [x, y, r] of spots) v = Math.max(v, smooth(r * 1.1, r * 0.4, Math.hypot((p[0] - x) * 0.8, (p[1] - y) * 1.25))); return v * (0.5 + 0.3 * Math.sin(p[0] * 1100 + p[1] * 700)) * front(p) * (id === 'mud' ? 1 : 0.8); }, col);
      break;
    }
    case 'blood': {
      strip([[0.06, 0.168], [0.062, cheekY + 0.01], [0.06, cheekY - 0.012]], t => lerp(0.0038, 0.0008, t), ink, { name: 'blood' });
      for (const [x, y, r] of [[0.048, cheekY + 0.004, 0.0026], [0.052, cheekY - 0.018, 0.0018], [-0.046, cheekY - 0.02, 0.0024]]) dot(x, y, r, ink, { segs: 6 });
      break;
    }
    case 'brand': {
      const y = 0.176;
      layer(p => smooth(0.011, 0.008, Math.hypot(p[0], p[1] - y)) * 0.55 * front(p), [0.5, 0.16, 0.14]);
      strip([[-0.0075, y], [0.0075, y]], 0.0016, ink, { name: 'brand' });
      strip([[0, y + 0.0075], [0, y - 0.0075]], 0.0016, ink, { name: 'brand' });
      break;
    }
    case 'undead_skin': {
      layer(p => 0.5 * (gauss(p[0] + 0.05, 0.012) * gauss(p[1] - 0.16, 0.01) + gauss(p[0] - 0.054, 0.013) * gauss(p[1] - (cheekY - 0.012), 0.011)) * front(p), [0.2, 0.3, 0.12]);
      layer(p => 0.35 * gauss(Math.abs(p[0]) - ex, E.hw * 1.2) * gauss(p[1] - (ey - E.bot - 0.004), 0.006) * front(p), [0.12, 0.08, 0.12]);
      for (let k = 0; k < 3; k++) strip([[-0.01 + k * 0.01, my - 0.008], [-0.01 + k * 0.01, my - 0.02]], 0.0013, [0.12, 0.08, 0.08], { name: 'stitch' });
      if (!lod) strip([[-0.014, my - 0.014], [0.014, my - 0.014]], 0.0011, [0.12, 0.08, 0.08], { name: 'stitch' });
      break;
    }
    case 'beauty_mark': dot(0.022, my + 0.011, 0.0016, [0.12, 0.06, 0.05], { segs: 7 }); break;
    case 'chin_lines': for (let k = -2; k <= 2; k++) strip([[k * 0.0065, my - 0.012], [k * 0.0078, 0.006]], 0.0018, ink, { name: 'line' }); break;
    case 'tear_mark': { const x = ex, y = ey - E.bot - 0.01; dot(x, y, 0.0035, ink, { segs: 10, shape: a => { const s = Math.sin(a); return s > 0 ? 1 - 0.55 * s : 1 + 0.35 * -s; } }); break; }
    case 'star_mark': dot(0.05, cheekY - 0.006, 0.0062, ink, { segs: 10, shape: a => (Math.round((a / (PI * 2)) * 10) % 2 ? 0.42 : 1) }); break;
    case 'moon_mark': {
      const cx = 0.05, cy = cheekY - 0.006, r = 0.0058, pts = [];
      for (let i = 0; i <= 8; i++) { const a = lerp(-2.3, 2.3, i / 8); pts.push([cx - Math.cos(a) * r, cy + Math.sin(a) * r]); }
      strip(pts, t => 0.0036 * Math.sin(PI * t) + 0.0003, ink, { name: 'moon' });
      break;
    }
    default: break;
  }
  return { parts, paint };
}
