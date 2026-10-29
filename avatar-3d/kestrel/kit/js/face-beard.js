// Kestrel kit — facial hair (the 15 ids). Head space (face.js).
//
// A beard is a SHELL laid on the face: the head surface sampled again over the lower face and pushed out along its
// normal by a thickness that follows a coverage map (where the beard grows), diving under the skin where the coverage
// ends — so there is no rim to look past, and every vertex carries the face's OWN skin weights at that point
// (headWeights): the beard opens with the jaw, stretches with the lips and lifts with the cheeks in every expression.
// The skin under a thick beard is not drawn (FACE_COVER.JAW). A moustache is its own strip over the upper lip on the
// lip / corner bones; long, forked and braided beards hang locks / a braid from the chin on the jaw bone. Stubble is
// paint only (no triangles).
import { clamp, lerp, smooth, gauss, add, sub, mul, norm, cmul, cmix } from './kmath.js';
import { makeHeadSurface, headToWorld, headWeights, FACE_COVER } from './face.js';
import { hairKit } from './hair-kit.js';

const PI = Math.PI;

/** What each id grows: zones (any of full, chin, goatee, chops, strap, patch, burns), thickness (m), a moustache
 *  (plain / handlebar), hanging pieces (long / fork / braid / point) and stubble paint. */
export const BEARDS = {
  none: {},
  stubble: { stubble: 1 },
  goatee: { zones: ['goatee'], thick: 0.006, stache: 'plain' },
  mustache: { stache: 'plain', stubble: 0.15 },
  full: { zones: ['full'], thick: 0.009, stache: 'plain' },
  long: { zones: ['full'], thick: 0.01, stache: 'plain', hang: 'long' },
  chinstrap: { zones: ['strap'], thick: 0.004 },
  soul_patch: { zones: ['patch'], thick: 0.004 },
  braided_beard: { zones: ['full'], thick: 0.008, stache: 'plain', hang: 'braid' },
  mutton_chops: { zones: ['chops'], thick: 0.008, stache: 'plain' },
  handlebar: { stache: 'handlebar', stubble: 0.2 },
  van_dyke: { zones: ['point'], thick: 0.006, stache: 'thin', hang: 'point' },
  short_beard: { zones: ['full'], thick: 0.0045, stache: 'plain' },
  forked_beard: { zones: ['full'], thick: 0.009, stache: 'plain', hang: 'fork' },
  sideburns: { zones: ['burns'], thick: 0.004 },
};

/** How much beard grows at a head-space point (0..1, soft edges). */
function coverage(zones, p, S) {
  const [x, y, z] = p, ax = Math.abs(x), th = Math.atan2(x, z), at = Math.abs(th);
  const my = S.mouthY, mw = S.mouthW;
  // the cheek line: from beside the nose wing down to the jaw corner and up to the sideburn
  const cheek0 = at < 0.45 ? my + 0.02 : at < 1.2 ? lerp(my + 0.02, 0.085, smooth(0.45, 1.2, at)) : lerp(0.085, 0.158, smooth(1.2, 1.52, at));
  const cheek = cheek0 + 0.0035 * Math.sin(th * 23) + 0.002 * Math.sin(th * 41 + 1);      // a ragged, hair-like edge, not a cut line
  const back = 1 - smooth(1.5, 1.68, at);                 // stops at the ear
  const mouth = 1 - clamp(1.15 - Math.hypot(x / (mw * 1.28), (y - my) / 0.0108), 0, 1) * 4;   // a hole round the lips
  const hole = clamp(mouth, 0, 1);
  const under = smooth(-0.016, -0.004, y);                // under the jaw, stops on the neck
  let c = 0;
  for (const zn of zones) {
    let v = 0;
    if (zn === 'full') v = smooth(cheek + 0.006, cheek - 0.014, y) * back * under;
    else if (zn === 'goatee') v = smooth(mw * 1.45, mw * 1.2, ax) * smooth(my + 0.014, my + 0.008, y) * under * smooth(-0.3, 0.2, z * 10);
    else if (zn === 'point') v = smooth(mw * 0.85, mw * 0.6, ax) * smooth(my - 0.008, my - 0.014, y) * under;
    else if (zn === 'chops') v = smooth(0.7, 0.95, at) * smooth(cheek + 0.006, cheek - 0.014, y) * back * smooth(0.0, 0.02, y);
    else if (zn === 'strap') { const line = lerp(0.006, 0.03, smooth(0.0, 1.2, at)) + lerp(0, 0.13, smooth(1.2, 1.5, at)); v = smooth(0.015, 0.009, Math.abs(y - line)) * back * under; }
    else if (zn === 'patch') v = smooth(0.0075, 0.005, ax) * smooth(my - 0.024, my - 0.02, y) * smooth(my - 0.008, my - 0.012, y);
    else if (zn === 'burns') v = smooth(1.3, 1.38, at) * back * smooth(0.085, 0.1, y) * smooth(0.168, 0.155, y);
    c = Math.max(c, v);
  }
  return c * hole;
}

/**
 * The facial hair for one look: { parts, paint (stubble), covers(headPoint) (skin hidden under it) }.
 */
export function beardParts(P, colors, beard, { lod = 0, body = null } = {}) {
  const B = BEARDS[beard?.id] || {};
  const H = makeHeadSurface(P), S = H.S;
  const W = p => headToWorld(P, p);
  const col = colors.beard || colors.hair;
  const parts = [], paint = [];
  const zones = B.zones || [];
  // stubble: a mottled darkening of the skin over the beard zone (and the moustache)
  if (B.stubble || zones.length) {
    const k = B.stubble || 0.5;
    const zs = ['full'];
    paint.push((p, c) => {
      const up = zones.length ? [p[0], p[1] - 0.012, p[2]] : p;          // beards: the stubble band runs ~1 cm above the beard's edge
      const v = Math.max(coverage(zs, up, S), coverage(zs, p, S)) + stacheZone(p, S) * 0.8;
      if (v < 0.01) return c;
      const n = 0.75 + 0.25 * Math.sin(p[0] * 2900 + p[1] * 1700) * Math.sin(p[1] * 2300 - p[0] * 900);
      return cmix(c, cmix(c, cmul(col, 0.7), 0.85), clamp(v, 0, 1) * k * n * 0.6);
    });
  }
  if (zones.length) {
    const thick = B.thick;
    // rows: dense round the mouth and the jaw line; columns: dense at the front
    const ys = [-0.014, -0.007, 0.0, 0.008, 0.018, 0.028, S.mouthY - 0.016, S.mouthY - 0.01, S.mouthY - 0.004, S.mouthY + 0.003, S.mouthY + 0.01, S.mouthY + 0.019, S.mouthY + 0.029, 0.088, 0.1, 0.113, 0.127, 0.142, 0.158];
    ys.sort((a, b) => a - b);
    for (let i = ys.length - 1; i > 0; i--) if (ys[i] - ys[i - 1] < 0.004) ys.splice(i, 1);
    const yMax = zones.includes('full') || zones.includes('chops') || zones.includes('burns') || zones.includes('strap') ? 0.17 : S.mouthY + 0.022;
    const us = ys.filter(y => y <= yMax);
    const segs = lod ? 12 : zones.includes('patch') || zones.includes('point') ? 14 : 18, aW = 0.42, span = 1.72;
    const theta = (j, n) => { const u = j / n * 2 - 1; return span * (aW * u + (1 - aW) * u * u * u); };
    const cov = p => coverage(zones, p, S);
    parts.push({
      name: 'beard', us, segs, wrap: false, theta,
      at(y, th) {
        const p = H.at(y, th), n = H.normalAt(y, th);
        const c = cov(p);
        const clump = Math.abs(Math.sin(th * 17 + Math.sin(y * 160) * 0.8));      // locks running down the jaw
        const tex = 0.62 + 0.38 * clump + 0.08 * Math.sin(th * 53 + y * 410);
        const off = c > 0.02 ? thick * Math.pow(smooth(0.02, 0.9, c), 0.8) * tex + 0.0006 : -0.0018;
        return { p: W(add(p, mul(n, off))), w: headWeights(p, S), hp: p, c };
      },
      out: (q, y, th) => [Math.sin(th), 0, Math.cos(th)],
      mask: (y, th) => (cov(H.at(y, th)) < 0.02 ? FACE_COVER.UNUSED : 0),     // the shell where nothing grows is not drawn
      color(y, th, pw, s) { const clump = Math.abs(Math.sin(th * 17 + Math.sin(y * 160) * 0.8)); const c = cmul(col, (0.8 + 0.28 * clump) * (0.85 + 0.15 * smooth(0.1, 0.8, s.c))); return cmix(cmix(colors.skin, col, 0.62), c, smooth(0.15, 0.7, s.c)); },     // the thin edge is stubble-toned, so it fades into the cheek
      rough: 0.7, ao: 0.3,
    });
  }
  // the moustache
  if (B.stache) {
    const my = S.mouthY, mw = S.mouthW, thin = B.stache === 'thin';
    const half = mw * (B.stache === 'handlebar' ? 1.05 : 1.2);
    parts.push({
      name: 'stache', us: [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1], segs: 2, wrap: false, t0: 0, t1: 1,
      at(u, v) {
        const x = u * half, au = Math.abs(u);
        const bot = my + 0.0034 + 0.0012 * au - (B.stache === 'handlebar' ? 0 : 0.0045 * au * au), top = my + (thin ? 0.0085 : 0.0118) - 0.003 * au;
        const y = lerp(bot, top, v);
        const p = H.at(y, H.atXY(x, y).th), nrm = H.normalAt(y, H.atXY(x, y).th);
        const off = (thin ? 0.0022 : 0.0042) * Math.sin(PI * clamp(v * 0.85 + 0.12, 0, 1)) * (1 - 0.4 * au) + 0.0009;
        return { p: W(add(p, mul(nrm, off))), w: headWeights([x, Math.max(y, my + 0.003), p[2]], S) };
      },
      out: () => [0, 0, 1], color: (u, v) => cmul(col, 0.85 + 0.2 * v), rough: 0.7,
    });
    if (B.stache === 'handlebar') for (const sg of [-1, 1]) {
      // the curled tips: out past the corners and up
      const a = [sg * half * 0.95, my + 0.006], pts = [[sg * half * 0.95, my + 0.006], [sg * half * 1.45, my + 0.002], [sg * half * 1.85, my + 0.008], [sg * half * 1.95, my + 0.016], [sg * half * 1.75, my + 0.019]];
      void a;
      const q = pts.map(([x, y]) => H.onFace(x, y, 0.004));
      const K = hairKit(P, { ...colors, hair: col }, { lod });
      K.tube({ path: t => catmull(q, t), r: t => 0.0032 * (1 - 0.75 * t), rows: 8, sides: 4, bones: () => [['mouthC' + (sg > 0 ? 'R' : 'L'), 0.6], ['head', 0.4]], name: 'stacheTip' });
      parts.push(...K.parts);
    }
  }
  // hanging pieces from the chin
  if (B.hang) {
    const K = hairKit(P, { ...colors, hair: col }, { lod, body, seed: 3 });
    const jawW = () => [['jaw', 1]];
    const chin = (x, y = 0.002) => { const { p, th } = H.atXY(x, y); return { p: add(p, mul(H.normalAt(y, th), 0.004)), n: H.normalAt(y, th) }; };
    if (B.hang === 'long' || B.hang === 'fork') {
      const xs = B.hang === 'long' ? [-0.03, -0.015, 0, 0.015, 0.03] : [-0.024, -0.01, 0.01, 0.024];
      for (const [i, x] of xs.entries()) {
        const { p, n } = chin(x, 0.004 + Math.abs(x) * 0.3);
        const out = B.hang === 'fork' ? Math.sign(x) * 0.35 : x * 4;
        K.lock({ root: p, n, dir: [out, -1, 0.35], length: B.hang === 'long' ? 0.13 - Math.abs(x) * 1.2 : 0.1, lift: 0.2, droop: 0.2, w: 0.026, th: 0.012, off: 0.008, steps: 5, bones: jawW, flat: 0.6, minor: i % 2 === 1 && B.hang === 'long', taper: B.hang === 'fork' ? 1.2 : 1.6 });
      }
    } else if (B.hang === 'point') {
      const { p, n } = chin(0, 0.0);
      K.lock({ root: p, n, dir: [0, -1, 0.5], length: 0.035, lift: 0.2, droop: 0.1, w: 0.02, th: 0.01, off: 0.006, steps: 3, bones: jawW, flat: 0.6, taper: 1.1 });
    } else if (B.hang === 'braid') {
      const { p } = chin(0, -0.004);
      const pts = [p, add(p, [0, -0.04, 0.02]), add(p, [0, -0.09, 0.022]), add(p, [0, -0.13, 0.018])];
      K.tube({ path: t => catmull(pts, t), r: t => 0.011 * (1 - 0.4 * t), rows: 7, sides: 4, braid: 34, bones: jawW, keep: true, off: 0.014, name: 'beardBraid' });
      if (!lod) { const e = catmull(pts, 0.86); K.blob({ c: e, r: [0.008, 0.007, 0.008], rows: 4, segs: 6, color: () => [0.72, 0.58, 0.3], bones: jawW, name: 'bead' }); }
    }
    parts.push(...K.parts);
  }
  return { parts, paint, covers: p => zones.length > 0 && B.thick >= 0.004 && coverage(zones, p, S) > 0.75 };
}

/** The moustache's zone (for stubble paint). */
function stacheZone(p, S) {
  const [x, y] = p, my = S.mouthY;
  return smooth(S.mouthW * 1.3, S.mouthW * 1.05, Math.abs(x)) * smooth(my + 0.002, my + 0.005, y) * smooth(my + 0.016, my + 0.011, y);
}

function catmull(pts, t) {
  const n = pts.length - 1, f = clamp(t, 0, 1) * n, i = Math.min(n - 1, Math.floor(f)), u = f - i;
  const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n, i + 2)];
  const u2 = u * u, u3 = u2 * u;
  return [0, 1, 2].map(k => 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * u + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u3));
}
export { coverage as beardCoverage, FACE_COVER };
