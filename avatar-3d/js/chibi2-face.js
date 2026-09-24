// Chibi 2 face: the head shell, ears, eyes and lids, brows, nose, mouth, beards, face marks and the
// things worn ON the face (glasses, monocle, eyepatch, masks, earrings).
//
// WHY THIS IS ITS OWN FILE (2026-09-24). The first pass placed every feature at a fixed depth — the
// mouth at z 0.257, the moustache at 0.272, a scar at 0.27 — on a head that is a curved shell. So a
// mouth's corners sank into the cheeks while its middle floated, a moustache sat INSIDE the nose, a
// scar ran through the eyeball, and the brows were put in head space at the height the eye sits in
// EYE space (y 0.12 instead of 0.37), which is why a dwarf had eyebrows under his eyes.
//
// Now there is one surface, `faceZ(x, y)`, read off the same rings the head shell is built from, and
// every feature asks it where the skin is. Features are placed relative to one another from the top
// down — eye, then brow ABOVE the eye top, nose, moustache UNDER the nose, mouth UNDER the moustache,
// beard UNDER the mouth — so no slider combination can stack two of them on the same spot.
//
// Head space (see CHIBI2.md "Head space and hoods"): +z forward, the head spans y 0..0.60, half-width
// 0.335, half-depth 0.271; positions are multiplied by H (the head scale) through `head()`.
import * as THREE from 'three';
import { shade } from '../../avatar-2d/js/render.js';
import { profile, taperedCurve } from './chibi2-geometry.js';

const sphere = () => new THREE.SphereGeometry(1, 10, 6);
const low = () => new THREE.SphereGeometry(1, 8, 5);
const mix = (c1, c2, t) => '#' + new THREE.Color(c1).lerp(new THREE.Color(c2), t).getHexString();

/** Head silhouettes: width, depth, jaw (lower face), crown (upper head) and chin drop. */
export const HEAD_SHAPES = {
  round: { w: 1, d: 1, jaw: 1, crown: 1 },
  oval: { w: 0.95, d: 1, jaw: 0.9, crown: 0.98 },
  square: { w: 1.07, d: 1.04, jaw: 1.08, crown: 1 },
  heart: { w: 1, d: 1, jaw: 0.82, crown: 1.04 },
  long: { w: 0.92, d: 1, jaw: 0.95, crown: 0.96 },
  wide: { w: 1.07, d: 0.94, jaw: 1.04, crown: 1 },
  chiseled: { w: 1, d: 1.04, jaw: 1.1, crown: 0.98 },
};

/** The head rings [y, rx, rz] in head units (before H), for a head shape, race and roundness. */
export function headRings(a, rig) {
  const hs = HEAD_SHAPES[a.headShape] || HEAD_SHAPES.round, face = rig.face || {}, R = rig.round || 0;
  const jaw = hs.jaw * (face.jaw || 1), crown = hs.crown, hollow = face.hollow || 0;
  const lower = t => 1 + (jaw - 1) * t;           // how much of the jaw factor a ring takes
  return [
    [-0.035, 0.10 * lower(1), 0.09],
    [0.005, (0.22 + R * 0.03) * lower(1), 0.195 + R * 0.015],
    [0.105, (0.30 + R * 0.035 - hollow * 0.022) * lower(0.7), 0.249 + R * 0.012],
    [0.25, 0.335 + R * 0.01, 0.271],
    [0.39, 0.325 * crown, 0.267],
    [0.50, 0.265 * crown, 0.227],
    [0.57, 0.15 * crown, 0.143],
    [0.60, 0.005, 0.006],
  ].map(([y, rx, rz]) => [y, rx * hs.w, rz * hs.d]);
}

function ringAt(rings, y) {
  if (y <= rings[0][0]) return rings[0];
  for (let i = 1; i < rings.length; i++) if (y <= rings[i][0]) {
    const p = rings[i - 1], q = rings[i], t = (y - p[0]) / (q[0] - p[0]);
    return [y, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
  }
  return rings[rings.length - 1];
}

/**
 * Build the face. `c` carries head() (head space, scaled by H), add(), ellipsoid(), strip() and the
 * shared colours. Returns `faceZ`, the face surface, for the hats and the gear.
 */
export function buildFace(a, rig, c) {
  const { add, head, ellipsoid } = c, H = rig.headScale;
  const skin = a.body.skin, hair = a.hair.color, face = rig.face || {};
  const rings = headRings(a, rig);
  const muzzle = face.muzzle || (a.nose.id === 'snout' ? 0.35 : 0);
  // the muzzle is one ellipsoid; faceZ reads the SAME numbers, so a mouth on it sits on it
  const MZ = { y: 0.125, rx: 0.16 + muzzle * 0.02, ry: 0.11 + muzzle * 0.01, rz: 0.075 * muzzle + 0.035, z: 0.235 + muzzle * 0.02 };
  /** Front of the head at (x, y), in head units, plus the muzzle where there is one. */
  const faceZ = (x, y, lift = 0) => {
    const [, rx, rz] = ringAt(rings, y), k = Math.max(0, 1 - (x / rx) ** 2);
    let z = rz * Math.sqrt(k);
    if (muzzle > 0) {
      const m = 1 - (x / MZ.rx) ** 2 - ((y - MZ.y) / MZ.ry) ** 2;
      if (m > 0) z = Math.max(z, MZ.z + MZ.rz * Math.sqrt(m));
    }
    return z + lift;
  };
  /** Keep x on the face at height y (a sheet wider than the jaw would fold flat behind it). */
  const onHead = (x, y) => Math.sign(x) * Math.min(Math.abs(x), ringAt(rings, y)[1] * 0.96);
  /** A curve laid on the face; pts are [x, y] in head units. */
  const onFace = (pts, radii, colour, { lift = 0.004, sides = 4, steps = 8, metal = false } = {}) =>
    head(taperedCurve(pts.map(([x, y]) => [x, y, faceZ(x, y, lift + (Array.isArray(radii) ? Math.max(...radii) : radii) * 0.5)]), Array.isArray(radii) ? radii : [radii, radii, radii], sides, steps), colour, { metal });
  const dotFace = (x, y, s, colour, lift = 0.003, depth = 0.4) => head(sphere(), colour, { position: [x, y, faceZ(x, y, lift)], scale: [s, s, s * depth] });
  /** A sheet laid on the face over a grid of (x, y); `keep(x, y)` cuts holes (the mouth, the eyes). */
  const facePatch = (x0, x1, y0, y1, colour, lift, keep = () => true, cols = 10, rows = 6, bulge = () => 0) => {
    const pos = [], idx = [], id = [];
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
      const x = x0 + (x1 - x0) * i / cols, y = y0 + (y1 - y0) * j / rows;
      id.push(pos.length / 3); pos.push(x, y, faceZ(x, y, lift + bulge(x, y)));
    }
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const cx = x0 + (x1 - x0) * (i + 0.5) / cols, cy = y0 + (y1 - y0) * (j + 0.5) / rows;
      if (!keep(cx, cy)) continue;
      const q = [j * (cols + 1) + i, j * (cols + 1) + i + 1, (j + 1) * (cols + 1) + i + 1, (j + 1) * (cols + 1) + i];
      idx.push(q[0], q[1], q[2], q[0], q[2], q[3]);
    }
    if (!idx.length) return;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    head(g, colour);
  };

  /**
   * A sheet on the face whose TOP EDGE follows `top(x)` and whose bottom is `y0`: the rows are spread
   * between the two in every column, so the edge is a smooth curve rather than a staircase of grid
   * cells (which is what cutting cells out of a rectangle gave a stubbled jaw).
   */
  const faceSheet = (x0, x1, y0, top, colour, lift, bulge = () => 0, cols = 20, rows = 8) => {
    const pos = [], idx = [];
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
      const x0i = x0 + (x1 - x0) * i / cols, t = top(x0i), y = y0 + (Math.max(y0, t) - y0) * j / rows, x = onHead(x0i, y);
      pos.push(x, y, faceZ(x, y, lift + bulge(x, y)));
    }
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const q = [j * (cols + 1) + i, j * (cols + 1) + i + 1, (j + 1) * (cols + 1) + i + 1, (j + 1) * (cols + 1) + i];
      idx.push(q[0], q[1], q[2], q[0], q[2], q[3]);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    head(g, colour);
  };

  // ---------------------------------------------------------------- the head shell
  head(profile(rings, 20), skin);
  if (muzzle > 0) head(sphere(), shade(skin, 0.03), { position: [0, MZ.y, MZ.z], scale: [MZ.rx, MZ.ry, MZ.rz] });
  if (face.hollow > 0.5) for (const s of [-1, 1]) dotFace(s * 0.19, 0.17, 0.07, shade(skin, -0.12), -0.004, 0.2);

  // ---------------------------------------------------------------- ears
  const hat = a.hat.id, earsHidden = ['hood', 'dragon_helm', 'goggles_up', 'chain_coif', 'plate_helm', 'great_helm', 'helmet'].includes(hat);
  const earK = face.ear || 1;
  if (a.ears.id !== 'none' && !earsHidden) for (const s of [-1, 1]) {
    const x = s * ringAt(rings, 0.225)[1] * 0.97, id = a.ears.id;
    if (id === 'pointed') {
      head(taperedCurve([[x, 0.19, 0.0], [x + s * 0.06 * earK, 0.27, -0.02], [x + s * 0.13 * earK, 0.37 + (earK - 1) * 0.06, -0.05]], [0.05, 0.04, 0.004], 6, 6), skin);
      head(taperedCurve([[x + s * 0.01, 0.21, 0.025], [x + s * 0.07 * earK, 0.29, 0.005], [x + s * 0.11 * earK, 0.35, -0.03]], [0.018, 0.015, 0.002], 4, 5), shade(skin, -0.16));
    } else if (id === 'fins') {
      head(new THREE.ConeGeometry(0.07, 0.2, 4), shade(skin, 0.1), { position: [x + s * 0.06, 0.25, -0.02], rotation: [0, 0, -s * 1.1], scale: [1, 1, 0.25] });
    } else {
      const big = id === 'big' ? 1.45 : 1;
      head(sphere(), skin, { position: [x, 0.225, 0.0], scale: [0.058 * big * earK, 0.091 * big * earK, 0.043], rotation: [0, 0, -s * 0.22] });
      head(sphere(), shade(skin, -0.18), { position: [x + s * 0.014, 0.227, 0.036], scale: [0.022 * big, 0.049 * big, 0.009] });
    }
    if (a.accessory.id === 'earrings') head(new THREE.TorusGeometry(0.022, 0.006, 4, 10), '#d8b040', { position: [x + s * 0.01, 0.14, 0.02], rotation: [0, s * 0.3, 0], metal: true });
  }

  // ---------------------------------------------------------------- eyes (eye bones; brows and lids placed from them)
  const eyeId = a.eyes.id, eyeSize = THREE.MathUtils.clamp(a.eyes.scale || 1, 0.5, 1.6);
  const ex0 = eyeId === 'dot' ? 0.052 : ['narrow', 'sleepy', 'tired', 'angry'].includes(eyeId) ? 0.082 : eyeId === 'almond' ? 0.09 : 0.082;
  const ey0 = eyeId === 'dot' ? 0.052 : eyeId === 'almond' ? 0.082 : eyeId === 'wide' || eyeId === 'anime' ? 0.108 : 0.1;
  const ex = ex0 * H * eyeSize, ey = ey0 * H * eyeSize;
  const eyeBone = rig.byName.eyeR.position;                 // head-local, already scaled by H
  const eyeInfo = [];
  for (const [side, s] of [['L', -1], ['R', 1]]) {
    const eye = 'eye' + side, pupil = 'pupil' + side;
    const dx = s * (a.eyes.x || 0) * 0.035 * H, dy = (a.eyes.y || 0) * -0.045 * H;
    // Round eyes on a slight bulge: z of the eye's own front at (x, y) in eye-bone space.
    const eyeFront = (x, y, lift = 0) => 0.012 * H + 0.016 * H * Math.sqrt(Math.max(0, 1 - ((x - dx) / (ex * 1.08)) ** 2 - ((y - dy) / (ey * 1.08)) ** 2)) + lift;
    eyeInfo.push({ s, dx, dy });
    if (eyeId === 'glow' || eyeId === 'glow_tear') {
      const glow = mix(a.eyes.color, '#ffffff', 0.3);
      ellipsoid(eye, mix(a.eyes.color, '#000000', 0.65), [dx, dy, 0], [ex * 1.1, ey * 1.1, 0.016 * H]);
      ellipsoid(eye, glow, [dx, dy - 0.004 * H, 0.014 * H], [ex * 0.92, ey * 0.92, 0.018 * H]);
      ellipsoid(pupil, '#ffffff', [dx - s * 0.02 * H, dy + 0.025 * H, 0.03 * H], [0.02 * H, 0.016 * H, 0.006 * H]);
      if (eyeId === 'glow_tear') { const bx = eyeBone.x * s + dx + s * 0.02 * H, by = eyeBone.y + dy; add(taperedCurve([[bx, by - ey * 0.8, 0.268 * H], [bx + s * 0.01 * H, by - ey * 1.6, 0.27 * H], [bx, by - ey * 2.3, 0.262 * H]], [0.012, 0.01, 0.004], 4, 5), 'head', glow); }
    } else if (eyeId === 'dot') {
      ellipsoid(pupil, '#17272c', [dx, dy, 0.02 * H], [ex, ey, 0.013 * H]);
      ellipsoid(pupil, '#ffffff', [dx - s * 0.012 * H, dy + 0.014 * H, 0.035 * H], [0.012 * H, 0.014 * H, 0.004 * H]);
    } else {
      const hollow = eyeId === 'hollow';
      ellipsoid(eye, hollow ? '#1c2325' : shade(skin, -0.35), [dx, dy, 0], [ex * 1.08, ey * 1.08, 0.016 * H]);
      ellipsoid(eye, hollow ? '#7bd6c8' : '#fff8e8', [dx, dy - 0.004 * H, 0.012 * H], [ex * 0.92, ey * 0.92, 0.017 * H]);
      if (!hollow) {
        // iris, pupil and highlight ride the PUPIL bone, which the controller moves for a glance
        const iy = dy - 0.01 * H, slit = eyeId === 'slit';
        ellipsoid(pupil, a.eyes.color, [dx, iy, 0.024 * H], [ex * 0.62, ey * 0.68, 0.012 * H]);
        ellipsoid(pupil, '#17272c', [dx, iy + 0.003 * H, 0.031 * H], slit ? [ex * 0.12, ey * 0.55, 0.008 * H] : [ex * 0.34, ey * 0.44, 0.008 * H]);
        ellipsoid(pupil, '#ffffff', [dx - s * 0.018 * H, dy + 0.018 * H, 0.039 * H], [0.014 * H, 0.017 * H, 0.005 * H]);
      }
    }
    // ---- lids. Every lid is drawn ON the eye's front (eyeFront), never across it at a fixed depth.
    const lidColour = shade(skin, -0.02), lash = '#3a2a2a';
    const arc = (from, to, k = 1.02, dyk = 0, n = 7) => Array.from({ length: n }, (_, i) => {
      const t = from + (to - from) * i / (n - 1), x = dx + Math.cos(t) * ex * k, y = dy + Math.sin(t) * ey * k + dyk;
      return [x, y, eyeFront(x, y, 0.004 * H)];
    });
    // upper lash line on every open eye, thicker at the outer corner
    if (!['dot', 'glow', 'glow_tear', 'hollow', 'narrow', 'sleepy', 'tired', 'angry'].includes(eyeId)) {
      const pts = arc(s > 0 ? 0.25 : Math.PI - 0.25, s > 0 ? Math.PI - 0.2 : 0.2, 1.0);
      add(taperedCurve(pts, s > 0 ? [0.008, 0.01, 0.006] : [0.006, 0.01, 0.008], 4, 8), eye, lash);
    }
    /**
     * A LID: the part of the eye above (upper) or below (lower) a curved edge, as a thin sheet lying
     * on the eye's dome just in front of the iris. `edge(u)` gives the edge height in units of the eye
     * height for u from -1 (left) to 1 (right). A sphere cap cannot do this — its edge is a straight
     * line when seen from the front, which is what made every lidded eye look like a bar.
     */
    const lid = (upper, edge, colour = lidColour, lashColour = lash, lashR = [0.004, 0.007, 0.004]) => {
      const rx = ex * 1.12, ry = ey * 1.12, pts = [], N = 14;
      const clampE = u => { const lim = Math.sqrt(Math.max(0, 1 - u * u)); return Math.max(-lim, Math.min(lim, edge(u))); };
      for (let i = 0; i <= N; i++) {
        const t = upper ? i / N * Math.PI : Math.PI + i / N * Math.PI, u = Math.cos(t), v = Math.sin(t);
        if (upper ? v >= clampE(u) : v <= clampE(u)) pts.push([u, v]);
      }
      const edgePts = [];
      for (let i = 0; i <= N; i++) { const u = upper ? -1 + 2 * i / N : 1 - 2 * i / N; edgePts.push([u, clampE(u)]); }
      const poly = [];
      for (const q of [...pts, ...edgePts]) { const last = poly[poly.length - 1]; if (!last || Math.hypot(q[0] - last[0], q[1] - last[1]) > 1e-3) poly.push(q); }
      if (poly.length > 2 && Math.hypot(poly[0][0] - poly[poly.length - 1][0], poly[0][1] - poly[poly.length - 1][1]) < 1e-3) poly.pop();
      const shape = new THREE.Shape(poly.map(([u, v]) => new THREE.Vector2(u * rx, v * ry)));
      const g = new THREE.ShapeGeometry(shape, 1), p = g.attributes.position;
      const domeZ = (x, y) => 0.03 * H + 0.018 * H * Math.sqrt(Math.max(0, 1 - (x / rx) ** 2 - (y / ry) ** 2));
      for (let i = 0; i < p.count; i++) p.setZ(i, domeZ(p.getX(i), p.getY(i)));
      g.computeVertexNormals();
      add(g, eye, colour, { position: [dx, dy, 0] });
      const line = edgePts.filter(([u, v]) => Math.abs(v) < Math.sqrt(Math.max(0, 1 - u * u)) - 0.01 || Math.abs(u) < 0.95);
      if (line.length > 2 && lashColour) add(taperedCurve(line.map(([u, v]) => [dx + u * rx, dy + v * ry, domeZ(u * rx, v * ry) + 0.003 * H]), lashR, 4, 12), eye, lashColour);
    };
    if (eyeId === 'narrow') lid(true, u => 0.28 + 0.14 * (1 - u * u));
    if (eyeId === 'sleepy') lid(true, u => 0.0 + 0.12 * (1 - u * u));
    if (eyeId === 'tired') lid(true, u => 0.42 + 0.1 * (1 - u * u));
    if (eyeId === 'angry') lid(true, u => 0.3 + 0.1 * (1 - u * u) + 0.3 * u * s);
    // A SMILING EYE stays open (closed eyes read as asleep, or as a missing texture): the cheek
    // pushes up under it in a curve that rises at the middle. `wink` is one smiling eye.
    if (eyeId === 'happy' || (eyeId === 'wink' && s > 0)) lid(false, u => -0.55 + 0.4 * (1 - u * u), lidColour, shade(skin, -0.22), [0.003, 0.005, 0.003]);
    if (eyeId === 'almond') add(taperedCurve(arc(s > 0 ? 0.1 : Math.PI - 0.1, s > 0 ? -0.25 : Math.PI + 0.25, 1.05, 0, 3).map(([x, y]) => [x + s * ex * 0.12, y + ey * 0.1, eyeFront(x, y, 0.006 * H)]), [0.008, 0.006, 0.002], 4, 4), eye, lash);
    // tired: ONE soft crease on the skin under the eye, clear of the eye itself
    if (eyeId === 'tired') {
      const hx = eyeBone.x * s + dx, hy = eyeBone.y + dy - ey * 1.35;
      onFace([[hx - s * ex * 0.7, hy + ey * 0.1], [hx, hy - ey * 0.08], [hx + s * ex * 0.6, hy + ey * 0.12]].map(([x, y]) => [x / H, y / H]), [0.002, 0.004, 0.002], shade(skin, -0.14));
    }
  }

  // ---------------------------------------------------------------- brows: above the eye's TOP, always
  const brow = a.brows.id;
  if (brow !== 'none') for (const { s, dx, dy } of eyeInfo) {
    const cx = (eyeBone.x * s + dx) / H, eyeTop = (eyeBone.y + dy + ey * 1.1) / H;
    const lift = THREE.MathUtils.clamp((a.brows.y || 0) * -0.035, -0.02, 0.05);
    const y0 = eyeTop + 0.035 + lift, shiftX = (a.brows.x || 0) * 0.02 * s;
    const thick = brow === 'thick' || brow === 'angry' ? 0.02 : brow === 'thin' ? 0.009 : 0.014;
    // inner end (toward the nose) and outer end heights, by style
    const inner = brow === 'angry' ? -0.035 : brow === 'worried' ? 0.03 : brow === 'raised' ? 0.03 : 0;
    const outer = brow === 'angry' ? 0.012 : brow === 'worried' ? -0.022 : brow === 'raised' ? 0.02 : -0.012;
    const mid = brow === 'arched' || brow === 'raised' ? 0.03 : 0.016;
    const w = 0.095;
    const pts = [[cx - s * w * 0.95 + shiftX, y0 + inner], [cx + shiftX, y0 + mid + (inner + outer) * 0.3], [cx + s * w + shiftX, y0 + outer]];
    onFace(pts, [thick * 0.8, thick * 1.15, thick * 0.55], hair, { lift: 0.004, steps: 8 });
  }

  // ---------------------------------------------------------------- nose
  const nose = a.nose.id, noseScale = THREE.MathUtils.clamp(a.nose.scale || 1, 0.5, 1.7);
  const noseY = 0.18 + (a.nose.y || 0) * -0.03;
  const ns = nose === 'wide' || nose === 'snout' ? [0.075, 0.042, 0.052] : nose === 'long' || nose === 'hook' ? [0.035, 0.075, 0.065] : nose === 'button' ? [0.055, 0.05, 0.052] : nose === 'dot' ? [0.026, 0.026, 0.028] : nose === 'upturned' ? [0.04, 0.045, 0.05] : [0.041, 0.052, 0.045];
  const nsk = ns.map(v => v * noseScale);
  let noseBottom = noseY - 0.03;
  if (nose !== 'none') {
    const nz = faceZ(0, noseY) + nsk[2] * 0.25;
    head(sphere(), shade(skin, -0.05), { position: [0, noseY, nz], scale: nsk, rotation: [nose === 'upturned' ? -0.35 : nose === 'hook' ? 0.3 : 0, 0, 0] });
    if (nose === 'hook') head(sphere(), shade(skin, -0.07), { position: [0, noseY + nsk[1] * 0.45, nz + nsk[2] * 0.4], scale: [nsk[0] * 0.7, nsk[1] * 0.45, nsk[2] * 0.5] });
    if (nose === 'snout' || muzzle > 0) for (const s of [-1, 1]) head(sphere(), '#2a2222', { position: [s * nsk[0] * 0.38, noseY - nsk[1] * 0.2, nz + nsk[2] * 0.85], scale: [0.014, 0.009, 0.008] });
    else if (nose !== 'dot') for (const s of [-1, 1]) head(sphere(), shade(skin, -0.2), { position: [s * nsk[0] * 0.42, noseY - nsk[1] * 0.45, nz + nsk[2] * 0.55], scale: [0.009, 0.006, 0.005] });
    noseBottom = noseY - nsk[1] * 0.85;
  }

  // ---------------------------------------------------------------- facial hair (above/around the mouth; the mouth is placed after)
  const fh = a.facialHair.id;
  const hasMoustache = ['mustache', 'full', 'long', 'goatee', 'braided_beard'].includes(fh);
  // The mouth sits under the nose, and under the moustache when there is one — never behind it.
  const mouthY = Math.min(noseBottom - (hasMoustache ? 0.06 : 0.035), 0.1) - THREE.MathUtils.clamp((a.mouth.y || 0) * 0.025, -0.02, 0.03);
  const mouthW = 0.062 * THREE.MathUtils.clamp(a.mouth.scale || 1, 0.5, 1.8);
  const beardColour = hair, stubble = mix(skin, hair, 0.22);
  const aroundMouth = (x, y) => !(Math.abs(x) < mouthW + 0.02 && y > mouthY - 0.035 && y < mouthY + 0.03);
  // Everything below the mouth follows one jaw line: up the sideburn at the edge of the face, down
  // round the cheek, and under the lower lip in the middle.
  const smooth = t => t * t * (3 - 2 * t);
  const jawTop = (x, cheek, side) => {
    const ax = Math.abs(x), mid = mouthY - 0.03;
    if (ax < mouthW + 0.01) return mid;
    if (ax < 0.26) return mid + (cheek - mid) * smooth((ax - mouthW - 0.01) / (0.26 - mouthW - 0.01));
    return cheek + (side - cheek) * smooth(Math.min(1, (ax - 0.26) / 0.07));
  };
  if (fh === 'stubble') {
    faceSheet(-0.33, 0.33, -0.035, x => jawTop(x, 0.1, 0.27), stubble, 0.003);
    faceSheet(-mouthW - 0.02, mouthW + 0.02, mouthY + 0.018, x => mouthY + 0.05 - (x / (mouthW + 0.02)) ** 2 * 0.02, stubble, 0.003, () => 0, 8, 2);
  }
  if (fh === 'chinstrap') faceSheet(-0.33, 0.33, -0.035, x => Math.min(jawTop(x, 0.04, 0.27), -0.035 + 0.035 + Math.abs(x) * 0.15 + (Math.abs(x) > 0.26 ? (Math.abs(x) - 0.26) * 3 : 0)), beardColour, 0.005);
  if (fh === 'full' || fh === 'long' || fh === 'braided_beard') {
    // a thick sheet from the sideburns round the jaw to under the lower lip, bulging at the chin
    const bulge = (x, y) => 0.01 + Math.max(0, 0.06 - y) * 0.3 * (1 - (Math.abs(x) / 0.33) ** 2);
    faceSheet(-0.335, 0.335, -0.09, x => jawTop(x, 0.13, 0.3), beardColour, 0.004, bulge, 24, 10);
    head(sphere(), beardColour, { position: [0, -0.045, faceZ(0, 0.02) - 0.035], scale: [0.14, 0.075, 0.075] });
  }
  if (fh === 'long') head(taperedCurve([[0, -0.07, faceZ(0, 0) - 0.02], [0, -0.2, faceZ(0, 0) + 0.0], [0.01, -0.34, faceZ(0, 0) - 0.04]], [0.12, 0.08, 0.01], 7, 6), beardColour);
  if (fh === 'braided_beard') for (let k = 0; k < 4; k++) head(new THREE.IcosahedronGeometry(1, 0), k % 2 ? shade(beardColour, 0.12) : beardColour, { position: [0, -0.1 - k * 0.07, faceZ(0, 0) - 0.02 - k * 0.01], scale: [0.05 - k * 0.006, 0.045, 0.045] });
  if (fh === 'goatee') faceSheet(-0.06, 0.06, -0.06, x => mouthY - 0.028 - (x / 0.06) ** 2 * 0.04, beardColour, 0.006, (x, y) => Math.max(0, 0.02 - y) * 0.45 * (1 - (x / 0.07) ** 2), 8, 5);
  if (fh === 'soul_patch') dotFace(0, mouthY - 0.045, 0.028, beardColour, 0.004);
  if (hasMoustache) {
    // under the nose, over the lip, with the ends drooping past the mouth corners
    const my = (noseBottom + mouthY) / 2 + 0.004, droop = fh === 'mustache' ? 0.03 : 0.018;
    for (const s of [-1, 1]) onFace([[s * 0.008, my + 0.006], [s * 0.05, my], [s * (mouthW + 0.03), my - droop]], [0.02, 0.018, 0.006], beardColour, { lift: 0.006, steps: 6 });
  }

  // ---------------------------------------------------------------- mouth
  const mouth = a.mouth.id, lip = shade(a.mouth.color || '#b5484d', -0.3);
  const curve = { smile: 0.02, grin: 0.026, neutral: 0.004, frown: -0.018, smirk: 0.012, stitched: 0, tongue: 0.012, fangs: 0.012, tusks: 0.004 }[mouth] ?? 0.008;
  // a smirk is a small smile with one corner up a touch — not a line that falls off one side
  const corner = s => mouth === 'smirk' ? (s > 0 ? 0.01 : 0.002) : 0;
  const lipPts = [-1, -0.5, 0, 0.5, 1].map(k => [k * mouthW, mouthY + (k * k) * curve - curve * 0.35 + corner(Math.sign(k)) * Math.abs(k)]);
  if (['open', 'o', 'sad_open'].includes(mouth)) {
    const w = mouth === 'o' ? 0.032 : mouthW * 0.85, h = mouth === 'o' ? 0.032 : 0.04;
    head(sphere(), '#3a1518', { position: [0, mouthY, faceZ(0, mouthY, -0.004)], scale: [w, h, 0.016] });
    head(new THREE.TorusGeometry(1, 0.18, 4, 14), lip, { position: [0, mouthY, faceZ(0, mouthY, 0.004)], scale: [w * 1.02, h * 1.02, 0.02] });
  } else {
    onFace(lipPts, [0.004, 0.007, 0.008, 0.007, 0.004], lip, { lift: 0.003, steps: 10 });
    if (mouth === 'grin') onFace(lipPts.map(([x, y]) => [x * 0.86, y - 0.01 + (Math.abs(x) < 0.001 ? -0.004 : 0)]), [0.004, 0.014, 0.016, 0.014, 0.004], '#fff8e8', { lift: 0.002, steps: 8 });
    if (mouth === 'tongue') dotFace(0.015, mouthY - 0.02, 0.022, '#d05060', 0.004);
    if (mouth === 'stitched') for (let k = -2; k <= 2; k++) onFace([[k * 0.025, mouthY + 0.014], [k * 0.025, mouthY - 0.014]], 0.004, '#2a2020', { lift: 0.005, steps: 2 });
  }
  if (mouth === 'fangs') for (const s of [-1, 1]) head(new THREE.ConeGeometry(0.014, 0.04, 5), '#f2f0dc', { position: [s * mouthW * 0.55, mouthY - 0.016, faceZ(s * mouthW * 0.55, mouthY, 0.004)], rotation: [Math.PI, 0, 0] });
  if (mouth === 'tusks') for (const s of [-1, 1]) head(new THREE.ConeGeometry(0.02, 0.085, 5), '#f2f0dc', { position: [s * mouthW * 0.75, mouthY + 0.028, faceZ(s * mouthW * 0.75, mouthY, 0.012)], rotation: [-0.2, 0, -s * 0.15] });

  // ---------------------------------------------------------------- cheeks: an option now, not every face
  if (a.body.cheeks) for (const s of [-1, 1]) dotFace(s * 0.2, 0.14, 0.045, mix(skin, '#e06a6a', 0.25), 0.001, 0.25);

  // ---------------------------------------------------------------- marks
  const xid = a.extras.id, xc = a.extras.color || '#8a2e2e';
  const cheekY = Math.min(0.17, (eyeBone.y - ey * 1.3) / H);        // always below the eye
  if (xid === 'freckles' || xid === 'freckles_heavy') for (const s of [-1, 1]) for (let i = 0; i < (xid === 'freckles' ? 4 : 8); i++) dotFace(s * (0.1 + (i % 4) * 0.04), cheekY - 0.01 - Math.floor(i / 4) * 0.035 - (i % 2) * 0.018, 0.009, shade(skin, -0.2));
  if (xid === 'blush') for (const s of [-1, 1]) dotFace(s * 0.2, cheekY - 0.02, 0.06, mix(skin, xc, 0.5), 0.001, 0.2);
  if (xid === 'third_eye') { const y = Math.max(0.42, (eyeBone.y + ey * 1.1) / H + 0.1); dotFace(0, y, 0.045, '#fff8e8', 0.002, 0.25); dotFace(0, y, 0.02, a.eyes.color, 0.006, 0.4); }
  if (xid === 'scar') {
    // across the cheek under the right eye and down to the jaw: it never crosses the eye or the brow
    onFace([[-0.08, cheekY + 0.01], [-0.14, cheekY - 0.06], [-0.19, cheekY - 0.13]], [0.006, 0.009, 0.004], mix(skin, xc, 0.7));
    for (const t of [0.3, 0.6]) { const x = -0.08 - 0.11 * t, y = cheekY + 0.01 - 0.14 * t; onFace([[x - 0.018, y - 0.01], [x + 0.018, y + 0.01]], 0.003, mix(skin, xc, 0.5), { lift: 0.006, steps: 2 }); }
  }
  if (xid === 'scar_cheek') onFace([[0.15, cheekY], [0.2, cheekY - 0.05], [0.24, cheekY - 0.1]], [0.006, 0.009, 0.004], mix(skin, xc, 0.7));
  if (xid === 'nose_scar') onFace([[-0.04, noseY + 0.03], [0.04, noseY - 0.02]], 0.005, mix(skin, xc, 0.7), { lift: 0.03 });
  if (xid === 'burn_scar') dotFace(0.18, cheekY - 0.04, 0.07, mix(skin, '#8a3a3a', 0.35), 0.001, 0.2);
  if (xid === 'warpaint' || xid === 'cheek_stripes') for (const s of [-1, 1]) for (let k = 0; k < (xid === 'warpaint' ? 2 : 3); k++) onFace([[s * 0.1, cheekY - k * 0.035], [s * 0.24, cheekY - 0.01 - k * 0.035]], 0.009, xc, { lift: 0.002 });
  if (xid === 'eye_black') for (const s of [-1, 1]) onFace([[s * 0.07, cheekY + 0.005], [s * 0.2, cheekY + 0.01]], 0.013, '#1a1a1a', { lift: 0.002 });
  if (xid === 'tattoo' || xid === 'face_glyphs') for (const s of xid === 'tattoo' ? [1] : [-1, 1]) {
    const pts = []; for (let k = 0; k <= 8; k++) { const t = k / 8 * Math.PI * 1.6; pts.push([s * (0.2 + Math.cos(t) * 0.035 * (1 - k / 12)), cheekY - 0.04 + Math.sin(t) * 0.035 * (1 - k / 12)]); }
    onFace(pts, 0.005, xc, { lift: 0.002, steps: 16 });
  }
  if (xid === 'paint_dots') for (const s of [-1, 1]) for (let k = 0; k < 3; k++) dotFace(s * (0.12 + k * 0.04), cheekY - 0.02, 0.014, xc);
  if (xid === 'dirt' || xid === 'mud' || xid === 'soot') for (const [x, y, r] of [[-0.19, cheekY - 0.04, 0.03], [-0.16, cheekY - 0.07, 0.02], [0.2, cheekY - 0.02, 0.028], [0.23, cheekY - 0.05, 0.018], [0.1, 0.45, 0.022], [0.13, 0.43, 0.015]]) dotFace(x, y, r, mix(skin, xid === 'soot' ? '#222222' : '#5a4030', 0.35), -0.001, 0.05);
  if (xid === 'blood') onFace([[0.08, 0.44], [0.1, 0.36], [0.09, 0.3]], [0.012, 0.008, 0.003], '#8a1a1a', { lift: 0.002 });
  if (xid === 'brand') { dotFace(-0.2, cheekY - 0.04, 0.035, mix(skin, '#7a2a2a', 0.5), 0.001, 0.2); onFace([[-0.215, cheekY - 0.02], [-0.185, cheekY - 0.06]], 0.004, '#5a1a1a'); }
  if (xid === 'wrinkles') {
    // forehead lines and crow's feet at the OUTER corners — never under the eye
    for (let k = 0; k < 2; k++) onFace([[-0.13, 0.46 + k * 0.035], [0, 0.465 + k * 0.035], [0.13, 0.46 + k * 0.035]], 0.003, shade(skin, -0.12), { lift: 0.001 });
    for (const { s, dx } of eyeInfo) { const x = (eyeBone.x * s + dx) / H + s * (ex / H) * 1.25, y = eyeBone.y / H; for (const d of [-0.02, 0.0, 0.02]) onFace([[x, y + d * 0.5], [x + s * 0.035, y + d * 1.5]], 0.0025, shade(skin, -0.12), { lift: 0.001, steps: 2 }); }
  }
  if (xid === 'undead_skin') { for (const s of [-1, 1]) dotFace(s * 0.12, 0.25, 0.1, shade(skin, -0.25), -0.012, 0.15); onFace([[-0.2, 0.12], [-0.12, 0.07]], 0.004, '#3a3030'); }

  // ---------------------------------------------------------------- things worn on the face
  const acc = a.accessory.id, ac = a.accessory.color || '#d8b040';
  const lensAt = s => { const x = eyeBone.x * s / H + eyeInfo[s > 0 ? 1 : 0].dx / H, y = eyeBone.y / H + eyeInfo[0].dy / H; return [x, y, faceZ(x, y) + 0.065]; };
  if (acc === 'glasses' || acc === 'round_glasses' || acc === 'sunglasses' || acc === 'monocle') {
    // Frames stand OFF the face in front of the eyes, facing forward. (They used to be rotated a
    // quarter turn, which laid them flat on top of the eyes as two gold bars.)
    const round = acc !== 'glasses', r = Math.max(ex, ey) / H * 1.02;
    for (const s of acc === 'monocle' ? [1] : [-1, 1]) {
      const [x, y, z] = lensAt(s);
      head(round ? new THREE.TorusGeometry(r, 0.007, 4, 16) : new THREE.TorusGeometry(r, 0.008, 4, 4), ac, { position: [x, y, z], rotation: [0, 0, round ? 0 : Math.PI / 4], scale: round ? [1, 0.9, 1] : [1.1, 0.8, 1], metal: true });
      if (acc === 'sunglasses') head(new THREE.CircleGeometry(r * 0.96, 12), '#141418', { position: [x, y, z + 0.002], scale: [1, 0.9, 1], metal: true });
      // the arm back to the ear
      head(taperedCurve([[x + s * r, y, z - 0.01], [s * 0.3, y + 0.01, 0.12], [s * 0.33, y - 0.02, 0.0]], [0.006, 0.006, 0.006], 3, 5), ac, { metal: true });
    }
    if (acc !== 'monocle') { const [xl, y, z] = lensAt(-1), [xr] = lensAt(1); head(taperedCurve([[xl + r * 0.95, y + 0.01, z], [0, y + 0.02, z + 0.008], [xr - r * 0.95, y + 0.01, z]], [0.007, 0.007, 0.007], 3, 5), ac, { metal: true }); }
    else { const [x, y, z] = lensAt(1); head(taperedCurve([[x, y - r, z], [x + 0.05, y - 0.2, z - 0.02], [0.12, -0.05, faceZ(0.12, 0.0) - 0.02]], [0.003, 0.003, 0.003], 3, 8), '#d8b040', { metal: true }); }
  }
  if (acc === 'goggles') for (const s of [-1, 1]) { const [x, y, z] = lensAt(s); head(new THREE.CylinderGeometry(0.085, 0.09, 0.05, 10), '#6a5a3a', { position: [x, y, z - 0.01], rotation: [Math.PI / 2, 0, 0], metal: true }); head(new THREE.CircleGeometry(0.07, 10), '#a9d3dc', { position: [x, y, z + 0.016], metal: true }); }
  if (acc === 'goggles' || acc === 'eyepatch' || acc === 'blindfold') {
    // the strap round the head, just above the ears
    const y = eyeBone.y / H + 0.02, pts = [];
    for (let k = 0; k <= 12; k++) { const t = -Math.PI * 0.62 + k / 12 * Math.PI * 1.24; pts.push([Math.sin(t) * 0.35, y + (acc === 'eyepatch' ? Math.sin(t) * 0.04 : 0), -Math.cos(t) * 0.29]); }
    head(taperedCurve(pts, [0.012, 0.012, 0.012], 3, 14), acc === 'goggles' ? '#4a3a2a' : acc === 'blindfold' ? ac : '#1a1a1a');
  }
  if (acc === 'eyepatch') { const [x, y] = lensAt(1); head(sphere(), '#1a1a1a', { position: [x, y, faceZ(x, y, 0.03)], scale: [0.09, 0.08, 0.02] }); }
  if (acc === 'blindfold') facePatch(-0.32, 0.32, eyeBone.y / H - 0.07, eyeBone.y / H + 0.08, ac, 0.04, () => true, 10, 2);
  if (acc === 'mask' || acc === 'scarf_mask') facePatch(-0.3, 0.3, -0.02, noseY + 0.02, ac, 0.018, () => true, 12, 5, (x, y) => (noseY - y) * 0.05);
  if (acc === 'nose_ring') head(new THREE.TorusGeometry(0.02, 0.005, 4, 10), '#d8b040', { position: [nsk[0] * 0.3, noseBottom + 0.005, faceZ(0, noseY) + nsk[2] * 0.8], metal: true });

  return { faceZ, rings, mouthY, noseY };
}
