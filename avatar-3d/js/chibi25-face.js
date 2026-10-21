// Chibi 2.5 face (part A, 2026-10-16): the head shell, ears, eyes (outline shapes, separate iris + pupil, BLINKING
// lids and pupils that LOOK AROUND), brows, nose, mouth, facial hair, face marks and things worn on the face.
//
// The v2 face (chibi2-face.js) is frozen — every game still builds it for a look without `body.v = 2.5`. This file is
// its 2.5 successor: the same head space, the same `faceZ(x, y)` surface and the same top-down placement (eye, brow
// ABOVE the eye top, nose, moustache UNDER the nose, mouth UNDER the moustache, beard under the mouth), plus:
//
//   * EYES are outlines, not ellipsoids. A shape is a top curve and a bottom curve over u = -1..1 (`EYE25`), with an
//     outer-corner tilt, so almond, cat, droopy and sharp eyes have real corners. The white is that outline laid on a
//     low dome; the IRIS and the PUPIL are separate flat shapes (eyes.iris / eyes.pupil fields) riding the pupil bone,
//     sized to fit inside the white so a glance never leaves it.
//   * BLINKING. Each eye has an EYELID bone (`eyelidL/R`, appended to the rig — see `addEyelids`) at the top of the
//     outline. The lid is a skin-coloured sheet the shape of the eye's own outline with a lash line on its lower edge,
//     authored CLOSED; the controller scales the bone's y from ~0 (open, tucked under the top lash line) to 1 (shut).
//     Bone scale only — no geometry rebuild, no material change, no shader recompile, same two draw calls.
//   * LOOKING. `eyeSpec25()` (pure numbers) gives the controller each eye's gaze limits, so `lookAt()` and the idle
//     glances clamp the iris inside the white.
//
// Head space: +z forward, head spans y 0..0.60, half-width 0.335, half-depth 0.271. Eye space (the eye bones): the
// eye bone sits on the face at (±0.12, 0.25, 0.255) head units; eye-space values below are already multiplied by H.
import * as THREE from 'three';
import { shade } from '../../avatar-2d/js/render.js';
import { profile, taperedCurve } from './chibi2-geometry.js';
import { headRings, HEAD_SHAPES } from './chibi2-face.js';

export { HEAD_SHAPES };
const sphere = () => new THREE.SphereGeometry(1, 10, 6);
const mix = (c1, c2, t) => '#' + new THREE.Color(c1).lerp(new THREE.Color(c2), t).getHexString();
const clamp = THREE.MathUtils.clamp;

function ringAt(rings, y) {
  if (y <= rings[0][0]) return rings[0];
  for (let i = 1; i < rings.length; i++) if (y <= rings[i][0]) {
    const p = rings[i - 1], q = rings[i], t = (y - p[0]) / (q[0] - p[0]);
    return [y, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
  }
  return rings[rings.length - 1];
}

// ------------------------------------------------------------------ eye shapes
const ell = u => Math.sqrt(Math.max(0, 1 - u * u));
const lens = (k, p = 1) => u => k * Math.pow(Math.max(0, 1 - u * u), p);
/**
 * Every 2.5 eye: half-width `rx` and half-height `ry` (head units, before eye size), `top(u)` / `bot(u)` in units of
 * ry, `tilt` (outer corner up, units of ry at the corner), the default iris and pupil, the lash style and extras.
 * `closed` eyes (happy, wink's winking side) are an arc, no white, and do not blink.
 */
export const EYE25 = {
  round: { rx: 0.082, ry: 0.1, top: ell, bot: u => -ell(u) },
  wide: { rx: 0.088, ry: 0.112, top: ell, bot: u => -ell(u), iris: 'large' },
  anime: { rx: 0.086, ry: 0.114, top: ell, bot: u => -ell(u) * 0.95, iris: 'large', highlight: 2 },
  almond: { rx: 0.096, ry: 0.082, top: lens(1, 0.65), bot: lens(-0.85, 0.75), tilt: 0.1 },
  narrow: { rx: 0.092, ry: 0.056, top: lens(1, 0.6), bot: lens(-0.9, 0.7), lash: 'heavy' },
  sleepy: { rx: 0.084, ry: 0.092, top: ell, bot: u => -ell(u), restLid: u => 0.0 + 0.12 * (1 - u * u) },
  tired: { rx: 0.084, ry: 0.088, top: ell, bot: u => -ell(u), restLid: u => 0.45 + 0.1 * (1 - u * u), bags: true },
  angry: { rx: 0.086, ry: 0.09, top: ell, bot: u => -ell(u), restLid: (u, s) => 0.28 + 0.1 * (1 - u * u) + 0.32 * u * s },
  dot: { rx: 0.05, ry: 0.054, kind: 'dot' },
  happy: { rx: 0.085, ry: 0.07, kind: 'closed' },
  wink: { rx: 0.082, ry: 0.1, top: ell, bot: u => -ell(u), winkR: true },
  hollow: { rx: 0.086, ry: 0.1, top: ell, bot: u => -ell(u), kind: 'hollow' },
  slit: { rx: 0.084, ry: 0.1, top: ell, bot: u => -ell(u), pupil: 'slit', iris: 'large' },
  glow: { rx: 0.086, ry: 0.09, kind: 'glow' },
  // ---- new in 2.5
  // owner review 2026-10-21: cat, droopy and sparkle pushed further from almond / round so each reads at a glance
  cat: { rx: 0.096, ry: 0.078, top: lens(1, 0.42), bot: lens(-0.72, 0.95), tilt: 0.52, lash: 'flick', pupil: 'slit', iris: 'large' },
  doe: { rx: 0.09, ry: 0.12, top: ell, bot: u => -ell(u) * 0.92, iris: 'large', lower: 3, highlight: 2 },
  droopy: { rx: 0.09, ry: 0.094, top: ell, bot: u => -ell(u) * 0.85, tilt: -0.3, restLid: (u, s) => 0.46 - 0.4 * u * s, iris: 'large' },
  sharp: { rx: 0.102, ry: 0.052, top: lens(1, 0.5), bot: lens(-0.75, 0.9), tilt: 0.55, lash: 'heavy', iris: 'small' },
  button: { rx: 0.062, ry: 0.07, top: ell, bot: u => -ell(u), white: '#1a1c22', iris: 'none', pupil: 'none', highlight: 1, lash: 'none' },
  sparkle: { rx: 0.088, ry: 0.112, top: ell, bot: u => -ell(u) * 0.95, iris: 'large', highlight: 'star', irisRim: true },
  hooded: { rx: 0.088, ry: 0.088, top: ell, bot: u => -ell(u), restLid: u => 0.32 + 0.04 * (1 - u * u), crease: true },
  lashes: { rx: 0.084, ry: 0.102, top: ell, bot: u => -ell(u), lash: 'long' },
  heart: { rx: 0.086, ry: 0.104, top: ell, bot: u => -ell(u), pupil: 'heart', iris: 'large' },
  // owner review 2026-10-21 (F10, the reference picture): an iris that fills most of the eye with a darker rim, a
  // thick ink upper lash line with a short wing, a big and a small highlight
  storybook: { rx: 0.09, ry: 0.108, top: ell, bot: u => -ell(u) * 0.94, iris: 'story', lash: 'bold', highlight: 2, irisRim: true },
};
const IRIS_K = { normal: [0.6, 0.66], large: [0.74, 0.78], small: [0.46, 0.5], ring: [0.62, 0.68], none: [0, 0], story: [0.84, 0.86] };
/**
 * `eyes.height` (owner review 2026-10-21): a slider, 0.7 (flat) .. 1 (the shape as drawn) .. 1.35 (tall), that scales
 * every eye's height and nothing else — almond is a wide lens and the rest tall ovals, and the owner likes both, so
 * any shape can be made rounder or taller. The iris, the gaze limits, the lid and the brows all follow it.
 */
export const EYE_HEIGHT = { min: 0.7, max: 1.35, default: 1 };

/**
 * The numbers the builder AND the controller need for an avatar's eyes (eye-bone space, already times H): outline
 * size, per-side offset, iris size, gaze limits, the eyelid pivot. Pure: the controller calls it for a cached template.
 */
export function eyeSpec25(a, H) {
  const want = a.eyes?.id === 'glow_tear' ? 'glow' : a.eyes?.id;   // glow_tear was removed 2026-10-21 (owner); an old look keeps glowing eyes
  const id = EYE25[want] ? want : 'round', e = EYE25[id];
  const size = clamp(a.eyes?.scale || 1, 0.5, 1.6);
  const hk = clamp(Number(a.eyes?.height) || 1, EYE_HEIGHT.min, EYE_HEIGHT.max);
  const rx = e.rx * H * size, ry = e.ry * H * size * hk, tilt = e.tilt || 0;
  const irisId = a.eyes?.iris && IRIS_K[a.eyes.iris] ? a.eyes.iris : (e.iris || 'normal');
  let [kx, ky] = IRIS_K[irisId];
  // the iris must fit the white's height (narrow / sharp eyes get a smaller iris rather than one poking out of them)
  const top0 = e.top ? e.top(0) : 1, bot0 = e.bot ? -e.bot(0) : 1, open = (top0 + bot0) / 2;
  ky = Math.min(ky, open * 0.86); kx = Math.min(kx, Math.max(ky, open * 0.86));
  const irx = rx * kx, iry = ry * ky, icy = ry * (top0 - bot0) / 2 - ry * 0.04;
  const sides = [-1, 1].map(s => ({ s, dx: s * (a.eyes?.x || 0) * 0.035 * H, dy: (a.eyes?.y || 0) * -0.045 * H }));
  const kind = e.kind || 'open';
  // gaze room: what is left of the white around the iris (a fraction is kept back so the rim always shows)
  const limX = kind === 'open' ? Math.max(0, rx * 0.88 - irx) : kind === 'dot' ? 0.012 * H : 0;
  const limY = kind === 'open' ? Math.max(0, ry * open * 0.82 - iry) : kind === 'dot' ? 0.008 * H : 0;
  // the top of the outline (with tilt) — where the lid hangs from
  let maxTop = 0;
  if (e.top) for (let i = 0; i <= 16; i++) { const u = -1 + i / 8; maxTop = Math.max(maxTop, e.top(u) + Math.abs(tilt * u)); }
  else maxTop = 1;
  const blinks = a.eyes?.blink !== false && kind !== 'closed';
  return { id, e, kind, rx, ry, tilt, irx, iry, icy, irisId, sides, limX, limY, pivotY: maxTop * ry * 1.14, blinks, winkR: !!e.winkR, lidded: !!e.restLid || id === 'narrow' || id === 'sharp' };
}

/** Which eye an eyepatch covers: -1 = the character's LEFT (screen right in a front view), as the 2D picture draws it. */
const PATCH_SIDE = -1;

/**
 * Add the two eyelid bones to a 2.5 rig (children of the eye bones, at the top of each eye's outline), AFTER the 22
 * v2 bones. Called by chibi2.js `acquire()` for every actor, so a cached template's rig gets the same pivots.
 */
export function addEyelids(rig, a) {
  const H = rig.headScale, spec = eyeSpec25(a, H);
  rig.byName.eyeL.rotation.z = -(a.eyes?.rot || 0) * Math.PI / 180;
  rig.byName.eyeR.rotation.z = (a.eyes?.rot || 0) * Math.PI / 180;
  /**
   * EYES TURNED TO THE FACE (owner review 2026-10-21, "almond has a floating bit to the sides"). The eye bones faced
   * straight ahead, so a flat eye laid on them stood off the round face at its outer corner (~0.04 head units on a
   * wide eye) and a lash wing out there floated in the air. Each eye bone is now turned (y) to the face's own slope
   * at the eye, so the eye is a tangent plane; `buildFace25` bends the rim of every eye piece back onto the skin.
   * The pupil bones are children, so a glance now slides along the face, not straight sideways.
   */
  const rings = headRings(a, rig), ex = rig.byName.eyeR.position.x / H, ey = rig.byName.eyeR.position.y / H;
  const [, frx, frz] = ringAt(rings, ey), fz = x => frz * Math.sqrt(Math.max(0, 1 - (x / frx) ** 2));
  const yaw = Math.atan(-(fz(ex + 0.01) - fz(ex - 0.01)) / 0.02);
  rig.byName.eyeR.rotation.y = yaw; rig.byName.eyeL.rotation.y = -yaw; rig.eyeYaw = yaw;
  for (const [side, i] of [['L', 0], ['R', 1]]) {
    const b = new THREE.Bone(); b.name = 'eyelid' + side;
    const { dx, dy } = spec.sides[i];
    b.position.set(dx, dy + spec.pivotY, 0);
    b.userData.index = rig.bones.length; rig.bones.push(b); rig.byName[b.name] = b;
    rig.byName['eye' + side].add(b);
    b.scale.set(1, 1, 1);
  }
  rig.eyes25 = spec;
  rig.root.updateMatrixWorld(true);
  return spec;
}

// ------------------------------------------------------------------ 2D shapes for pupils and highlights
function shape2d(id, rx, ry) {
  const V = (x, y) => new THREE.Vector2(x * rx, y * ry);
  const circle = (n = 14, k = 1) => Array.from({ length: n }, (_, i) => { const t = i / n * Math.PI * 2; return V(Math.cos(t) * k, Math.sin(t) * k); });
  if (id === 'slit') return new THREE.Shape(Array.from({ length: 12 }, (_, i) => { const t = i / 12 * Math.PI * 2; return V(Math.cos(t) * 0.3, Math.sin(t)); }));
  if (id === 'star') return new THREE.Shape(Array.from({ length: 10 }, (_, i) => { const t = Math.PI / 2 + i / 10 * Math.PI * 2, r = i % 2 ? 0.45 : 1; return V(Math.cos(t) * r, Math.sin(t) * r); }));
  if (id === 'heart') return new THREE.Shape(Array.from({ length: 20 }, (_, i) => { const t = i / 20 * Math.PI * 2, x = 16 * Math.sin(t) ** 3, y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t); return V(x / 17, y / 17 + 0.1); }));
  if (id === 'cross') { const w = 0.32; return new THREE.Shape([V(-w, 1), V(w, 1), V(w, w), V(1, w), V(1, -w), V(w, -w), V(w, -1), V(-w, -1), V(-w, -w), V(-1, -w), V(-1, w), V(-w, w)]); }
  if (id === 'ring') { const s = new THREE.Shape(circle(14)); s.holes.push(new THREE.Path(circle(14, 0.55).reverse())); return s; }
  return new THREE.Shape(circle(id === 'dot' ? 10 : 14));
}
/**
 * A sheet over an outline with RINGS inside it, so a dome can bend it (ShapeGeometry has vertices on the outline only,
 * so its middle is always flat at the rim's depth). `pts` [x, y] round a centre `c`; z(x, y) the depth.
 */
function domedSheet(pts, c, z, rings = [0.55, 0.85, 1]) {
  const pos = [c[0], c[1], z(c[0], c[1])], idx = [], n = pts.length;
  for (const t of rings) for (const [x, y] of pts) { const px = c[0] + (x - c[0]) * t, py = c[1] + (y - c[1]) * t; pos.push(px, py, z(px, py)); }
  // face +z whichever way the outline runs
  let area = 0; for (let i = 0; i < n; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % n]; area += x0 * y1 - x1 * y0; }
  const tri = (p, q, r) => area > 0 ? idx.push(p, q, r) : idx.push(p, r, q);
  for (let i = 0; i < n; i++) tri(0, 1 + i, 1 + (i + 1) % n);
  for (let r = 0; r < rings.length - 1; r++) for (let i = 0; i < n; i++) {
    const a0 = 1 + r * n + i, a1 = 1 + r * n + (i + 1) % n, b0 = a0 + n, b1 = a1 + n;
    tri(a0, b0, b1); tri(a0, b1, a1);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
const flat = (shape, z, dome = () => 0) => { const g = new THREE.ShapeGeometry(shape, 2), p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, z + dome(p.getX(i), p.getY(i))); g.computeVertexNormals(); return g; };

/**
 * Build the 2.5 face. `c` carries head() (head units, scaled by H), add(), ellipsoid(), strip(), tag() and, for the
 * beards, `chestZ` + `neckLift` (the body's surface, so a long beard lies ON the chest instead of sinking into it).
 * Returns `faceZ` and the heights the hair needs (`browTop`: the fringe ends above it).
 */
export function buildFace25(a, rig, c) {
  const { add, head, ellipsoid } = c, H = rig.headScale, tag = c.tag || (() => {});
  const skin = a.extras?.id === 'pale' ? mix(a.body.skin, '#efe8e0', 0.4) : a.body.skin, hair = a.hair.color, face = rig.face || {};
  const rings = headRings(a, rig);
  const muzzle = face.muzzle || (a.nose.id === 'snout' ? 0.35 : 0);
  const MZ = { y: 0.125, rx: 0.16 + muzzle * 0.02, ry: 0.11 + muzzle * 0.01, rz: 0.075 * muzzle + 0.035, z: 0.235 + muzzle * 0.02 };
  const faceZ = (x, y, lift = 0) => {
    const [, rx, rz] = ringAt(rings, y), k = Math.max(0, 1 - (x / rx) ** 2);
    let z = rz * Math.sqrt(k);
    if (muzzle > 0) { const m = 1 - (x / MZ.rx) ** 2 - ((y - MZ.y) / MZ.ry) ** 2; if (m > 0) z = Math.max(z, MZ.z + MZ.rz * Math.sqrt(m)); }
    return z + lift;
  };
  const onHead = (x, y) => Math.sign(x) * Math.min(Math.abs(x), ringAt(rings, y)[1] * 0.96);
  const onFace = (pts, radii, colour, { lift = 0.004, sides = 4, steps = 8, metal = false } = {}) =>
    head(taperedCurve(pts.map(([x, y]) => [x, y, faceZ(x, y, lift + (Array.isArray(radii) ? Math.max(...radii) : radii) * 0.5)]), Array.isArray(radii) ? radii : [radii, radii, radii], sides, steps), colour, { metal });
  const dotFace = (x, y, s, colour, lift = 0.003, depth = 0.4) => head(sphere(), colour, { position: [x, y, faceZ(x, y, lift)], scale: [s, s, s * depth] });
  const facePatch = (x0, x1, y0, y1, colour, lift, keep = () => true, cols = 10, rows = 6, bulge = () => 0) => {
    const pos = [], idx = [];
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) { const x = x0 + (x1 - x0) * i / cols, y = y0 + (y1 - y0) * j / rows; pos.push(x, y, faceZ(x, y, lift + bulge(x, y))); }
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
  tag('face:head');
  // stubble and a chinstrap are PAINTED into this shell (2026-10-21, see the facial hair section); the shell is then
  // built there, once the mouth's height is known
  const paintedBeard = a.facialHair?.id === 'stubble' || a.facialHair?.id === 'chinstrap';
  if (!paintedBeard) head(profile(rings, 20), skin);
  if (muzzle > 0) head(sphere(), shade(skin, 0.03), { position: [0, MZ.y, MZ.z], scale: [MZ.rx, MZ.ry, MZ.rz] });
  if (face.hollow > 0.5) for (const s of [-1, 1]) dotFace(s * 0.19, 0.17, 0.07, shade(skin, -0.12), -0.004, 0.2);

  // ---------------------------------------------------------------- ears
  tag('face:ears');
  const hat = a.hat.id, earsHidden = c.earsHidden ?? ['hood', 'dragon_helm', 'goggles_up', 'chain_coif', 'plate_helm', 'great_helm', 'helmet', 'war_helm', 'wolf_helm'].includes(hat);
  const earK = (face.ear || 1) * clamp(a.ears.scale || 1, 0.6, 1.6), earId = a.ears.id;
  const topEars = earId === 'cat_ears' || earId === 'wolf_ears';
  // ears that the hair covers (long hair over normal ears); pointed ears poke out through it, as an elf's do
  const coveredByHair = c.hairCoversEars && !['pointed', 'long_pointed', 'swept', 'fins', 'cat_ears', 'wolf_ears'].includes(earId);
  if (earId !== 'none' && !(earsHidden && !topEars) && !coveredByHair && !(topEars && c.crownCovered)) for (const s of [-1, 1]) {
    const x = s * ringAt(rings, 0.225)[1] * 0.97, inner = shade(skin, -0.16);
    if (earId === 'pointed' || earId === 'long_pointed' || earId === 'swept') {
      const L = earId === 'long_pointed' ? 1.6 : 1, up = earId === 'swept' ? 0.25 : 1, back = earId === 'swept' ? 0.11 : 0.05;
      const tip = [x + s * 0.13 * earK * L, 0.37 + (earK - 1) * 0.06 + (up - 1) * 0.09 + (L - 1) * 0.06, -back - (L - 1) * 0.04];
      head(taperedCurve([[x, 0.19, 0.0], [x + s * 0.065 * earK * L, 0.27 + (up - 1) * 0.03, -0.02 - back * 0.3], tip], [0.052, 0.04, 0.004], 6, 6), skin);
      head(taperedCurve([[x + s * 0.012, 0.21, 0.026], [x + s * 0.07 * earK * L, 0.285 + (up - 1) * 0.03, 0.004 - back * 0.3], [tip[0] - s * 0.025, tip[1] - 0.02, tip[2] + 0.025]], [0.018, 0.015, 0.002], 4, 5), inner);
    } else if (earId === 'notched') {
      head(taperedCurve([[x, 0.19, 0.0], [x + s * 0.07 * earK, 0.27, -0.02], [x + s * 0.12 * earK, 0.35, -0.04]], [0.055, 0.045, 0.006], 6, 6), skin);
      head(new THREE.BoxGeometry(0.03, 0.03, 0.06), shade(skin, -0.28), { position: [x + s * 0.085 * earK, 0.31, -0.03], rotation: [0, 0, s * 0.6] });   // the torn notch
      head(taperedCurve([[x + s * 0.012, 0.21, 0.026], [x + s * 0.06 * earK, 0.28, 0.006]], [0.016, 0.01], 4, 3), inner);
    } else if (earId === 'fins') {
      // a fan of three spines with webbing, as in the 2D picture (v2 drew one cone, the same as a pointed ear)
      for (let k = 0; k < 3; k++) head(taperedCurve([[x, 0.2 + k * 0.03, 0.0], [x + s * 0.09, 0.2 + k * 0.05, -0.03], [x + s * 0.15, 0.17 + k * 0.08, -0.06]], [0.02, 0.012, 0.003], 4, 4), shade(skin, 0.05 - k * 0.04));
      head(new THREE.SphereGeometry(1, 8, 5), mix(skin, '#7fc8c0', 0.25), { position: [x + s * 0.08, 0.25, -0.03], scale: [0.08, 0.09, 0.012], rotation: [0, s * 0.5, s * -0.3] });
    } else if (topEars) {
      // animal ears ON TOP of the head (beastkin): a furred outer cone and a pink inner, standing out of the hair
      const cat = earId === 'cat_ears', ex0 = s * 0.2, ey0 = 0.53, fur = hair;
      head(new THREE.ConeGeometry(cat ? 0.11 : 0.1, cat ? 0.22 : 0.3, 4), fur, { position: [ex0 * 1.1, ey0 + (cat ? 0.1 : 0.13), -0.02], rotation: [-0.12, s * 0.3, s * -0.32], scale: [1, 1, 0.45] });
      head(new THREE.ConeGeometry(cat ? 0.065 : 0.06, cat ? 0.15 : 0.21, 4), mix(skin, '#e08a9a', 0.4), { position: [ex0 * 1.1, ey0 + (cat ? 0.085 : 0.11), 0.012], rotation: [-0.12, s * 0.3, s * -0.32], scale: [1, 1, 0.3] });
    } else {
      const big = earId === 'big' ? 1.45 : earId === 'small' ? 0.72 : 1;
      head(sphere(), skin, { position: [x, 0.225, 0.0], scale: [0.058 * big * earK, 0.091 * big * earK, 0.043], rotation: [0, 0, -s * 0.22] });
      head(sphere(), inner, { position: [x + s * 0.014, 0.227, 0.036], scale: [0.022 * big, 0.049 * big, 0.009] });
    }
    if (a.accessory.id === 'earrings' && !topEars) head(new THREE.TorusGeometry(0.022, 0.006, 4, 10), '#d8b040', { position: [x + s * 0.01, 0.14, 0.02], rotation: [0, s * 0.3, 0], metal: true });
  }

  // ---------------------------------------------------------------- eyes
  tag('face:eyes');
  const spec = eyeSpec25(a, H), E = spec.e, { rx, ry, tilt } = spec;
  const eyeBone = rig.byName.eyeR.position;
  const lidColour = shade(skin, -0.02), lash = '#221a1a', white = a.eyes.white || E.white || '#fff8e8';
  const pupilId = a.eyes.pupil || E.pupil || 'round';
  const Z = { rim: 0.008 * H, white: 0.012 * H, dome: 0.016 * H, iris: 0.031 * H, pupil: 0.0345 * H, shine: 0.038 * H, lid: 0.043 * H };
  /**
   * A lid is a flat sheet, so it lit as a flat disc in front of a round face (a "closed eye in a circle"). Its normals
   * are set to the head's own: out from the middle of the head, through the point.
   */
  const yaw0 = rig.eyeYaw || 0;
  const skinNormals = (g, s, ox, oy) => {
    const p = g.attributes.position, n = new Float32Array(p.count * 3), v = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
    // worked out in head space, then turned back into the (turned) eye bone's space, since the bone's turn is applied after
    for (let i = 0; i < p.count; i++) { v.set(eyeBone.x * s + ox + p.getX(i), eyeBone.y + oy + p.getY(i) - 0.3 * H, eyeBone.z + p.getZ(i) + 0.05 * H).normalize().applyAxisAngle(Y, -s * yaw0); n.set([v.x, v.y, v.z], i * 3); }
    g.setAttribute('normal', new THREE.BufferAttribute(n, 3)); return g;
  };
  /**
   * The skin's depth under an eye-space point (x, y) of side s: the eye bone is turned to the face (see addEyelids), so
   * this is how far BEHIND the eye's tangent plane the face has curved away. 0 at the eye's centre, negative outward.
   */
  const skinUnder = (s, x, y) => {
    const a0 = s * yaw0, hx = eyeBone.x * s + Math.cos(a0) * x, hy = eyeBone.y + y;
    return (faceZ(hx / H, hy / H) * H - eyeBone.z + Math.sin(a0) * x) / Math.cos(a0);
  };
  /**
   * HUG: bend an eye piece's outer part back onto the skin. (ox, oy) is where the geometry's origin sits in eye space,
   * (cx, cy) the eye's centre. Inside `from` (55%) of the outline nothing moves (lids: only OUTSIDE the eye's outline, so a lid always stays in front of the iris, wherever it is looking) (the iris, which slides with the gaze, stays in
   * front of the white); from there to the rim the piece follows the face down, so no corner stands off it.
   */
  const hug = (g, s, ox, oy, cx, cy, k = 1, from = 0.55) => {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + ox, y = p.getY(i) + oy, r = Math.hypot((x - cx) / (rx * k), (y - cy) / (ry * k));
      const w = THREE.MathUtils.smoothstep(r, from, 1.05);
      if (w > 0) p.setZ(i, p.getZ(i) + w * Math.min(0, skinUnder(s, x, y)));
    }
    p.needsUpdate = true;
    if (!g.userData.keepNormals) g.computeVertexNormals();
    return g;
  };
  const eyeInfo = [];
  for (const { s, dx, dy } of spec.sides) {
    const side = s < 0 ? 'L' : 'R', eye = 'eye' + side, pupil = 'pupil' + side, lidBone = 'eyelid' + side;
    const irisColour = (s > 0 && a.eyes.colorR) || a.eyes.color;
    eyeInfo.push({ s, dx, dy });
    // owner 2026-10-21: "the eye patch still clips the eye — stop rendering that eye instead (including the blink)": the
    // eye under a patch is not built at all (white, iris, pupil, lashes, lid). Its brow still is (eyeInfo above).
    if (a.accessory?.id === 'eyepatch' && s === PATCH_SIDE) continue;
    const closed = spec.kind === 'closed' || (spec.winkR && s > 0);
    /** outline points for this eye (eye-bone space): top from inner to outer… then bottom back */
    const outline = (k = 1) => {
      const pts = [], N = 12;   // 12 (was 14): the white and rim gained inner rings for hug(); this keeps the eye's triangle count level
      for (let i = 0; i <= N; i++) { const u = -1 + 2 * i / N; pts.push([u * rx * k, (E.top(u) + tilt * u * s) * ry * k]); }
      for (let i = N - 1; i >= 1; i--) { const u = -1 + 2 * i / N; pts.push([u * rx * k, (E.bot(u) + tilt * u * s) * ry * k]); }
      return pts;
    };
    const dome = k => (x, y) => Z.dome * k * Math.sqrt(Math.max(0, 1 - (x / rx) ** 2 - (y / (ry * 1.2)) ** 2));
    const shapeOf = pts => new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const ringSheet = (pts, z, rings = [0.6, 1]) => { let cx = 0, cy = 0; for (const [x, y] of pts) { cx += x / pts.length; cy += y / pts.length; } return domedSheet(pts, [cx, cy], z, rings); };
    if (closed) {
      // a smiling closed eye: one dark arc that rises in the middle (^), as the 2D picture draws it, and a soft cheek
      const pts = Array.from({ length: 9 }, (_, i) => { const u = -1 + i / 4; return [dx + u * rx * 1.05, dy - ry * 0.25 + (1 - u * u) * ry * 0.75 + tilt * u * s * ry, Z.white + Z.dome * 0.6 * ell(u)]; });
      add(hug(taperedCurve(pts, [0.006 * H, 0.012 * H, 0.014 * H, 0.012 * H, 0.006 * H], 4, 12), s, 0, 0, dx, dy), eye, '#2a2222');
      continue;
    }
    if (spec.kind === 'dot') {
      ellipsoid(pupil, '#17272c', [dx, dy, 0.02 * H], [rx, ry, 0.013 * H]);
      ellipsoid(pupil, '#ffffff', [dx - s * 0.012 * H, dy + 0.014 * H, 0.035 * H], [0.012 * H, 0.014 * H, 0.004 * H]);
    } else if (spec.kind === 'glow') {
      const glow = mix(irisColour, '#ffffff', 0.3);
      ellipsoid(eye, mix(irisColour, '#000000', 0.65), [dx, dy, 0], [rx * 1.1, ry * 1.1, 0.016 * H]);
      ellipsoid(eye, glow, [dx, dy - 0.004 * H, 0.014 * H], [rx * 0.92, ry * 0.92, 0.018 * H]);
      ellipsoid(pupil, '#ffffff', [dx - s * 0.02 * H, dy + 0.025 * H, 0.03 * H], [0.02 * H, 0.016 * H, 0.006 * H]);
    } else {
      // the rim (a darker outline), then the white, both the outline's own shape on a low dome
      // a sheet WITH inner rings (domedSheet), not a ShapeGeometry: hug() bends the rim back onto the skin per vertex, and a
      // ShapeGeometry has vertices on its outline only, so its whole middle would have tilted down with the corners
      add(hug(ringSheet(outline(1.1), (x, y) => Z.rim + dome(0.35)(x, y), [1]), s, dx, dy, dx, dy), eye, spec.kind === 'hollow' ? '#101416' : shade(skin, -0.24), { position: [dx, dy, 0] });   // round 2: a softer rim (the redesign has no dark ring round the eye; the lash is the line)
      add(hug(ringSheet(outline(1), (x, y) => Z.white + dome(0.4)(x, y)), s, dx, dy, dx, dy), eye, spec.kind === 'hollow' ? '#14191b' : white, { position: [dx, dy, 0] });
      if (spec.kind === 'hollow') {
        // an undead socket: dark, with a small glowing point that still glances about (the 2D picture's look)
        add(flat(shape2d('round', rx * 0.32, ry * 0.32), Z.shine), pupil, mix(irisColour, '#ffffff', 0.55), { position: [dx, dy - ry * 0.05, 0] });
        add(flat(shape2d('round', rx * 0.55, ry * 0.55), Z.iris), pupil, mix(irisColour, '#000000', 0.35), { position: [dx, dy - ry * 0.05, 0] });
      } else {
        const iy = dy + spec.icy;
        if (spec.irisId !== 'none') {
          if (E.irisRim) {
            // a darker rim round the iris (the reference picture's iris): the dark disc, then the iris 12% smaller over it
            add(flat(shape2d('round', spec.irx, spec.iry), Z.iris - 0.0006 * H), pupil, mix(irisColour, '#0c1418', 0.55), { position: [dx, iy, 0] });
            add(flat(shape2d('round', spec.irx * 0.86, spec.iry * 0.86), Z.iris), pupil, irisColour, { position: [dx, iy, 0] });
          } else add(flat(shape2d('round', spec.irx, spec.iry), Z.iris), pupil, irisColour, { position: [dx, iy, 0] });
          if (spec.irisId === 'ring') add(flat(shape2d('ring', spec.irx * 1.0, spec.iry * 1.0), Z.iris + 0.0012 * H), pupil, shade(irisColour, -0.35), { position: [dx, iy, 0] });
          else add(flat(shape2d('round', spec.irx * 0.7, spec.iry * 0.45), Z.iris + 0.0008 * H), pupil, mix(irisColour, '#ffffff', 0.25), { position: [dx, iy - spec.iry * 0.4, 0] });   // the lit lower half, a cartoon iris
        }
        const pk = spec.irisId === 'none' ? [0.9, 0.9] : [0.52, 0.6];
        if (pupilId !== 'none') {
          const pr = pupilId === 'dot' ? 0.5 : pupilId === 'slit' ? 1.0 : 1;
          add(flat(shape2d(pupilId, Math.max(spec.irx, rx * 0.45) * pk[0] * pr * (pupilId === 'dot' ? 0.6 : 1), Math.max(spec.iry, ry * 0.45) * pk[1] * pr * (pupilId === 'dot' ? 0.6 : 1) * (pupilId === 'slit' ? 1.15 : 1)), Z.pupil), pupil, pupilId === 'heart' ? '#c8304a' : '#17272c', { position: [dx, iy + 0.003 * H, 0] });
        }
        // highlights: under a resting lid they sit lower so they never show above the lid's edge
        const hy = E.restLid ? -0.15 : 0.32, shine = '#ffffff';
        if (E.highlight === 'star') {
          add(flat(shape2d('star', 0.03 * H, 0.03 * H), Z.shine), pupil, shine, { position: [dx - s * spec.irx * 0.3, iy + spec.iry * hy, 0] });
          add(flat(shape2d('star', 0.014 * H, 0.014 * H), Z.shine), pupil, shine, { position: [dx + s * spec.irx * 0.42, iy + spec.iry * 0.5, 0] });   // a second, smaller twinkle
        } else if (spec.irisId === 'story') add(flat(shape2d('round', 0.024 * H, 0.03 * H), Z.shine), pupil, shine, { position: [dx - s * spec.irx * 0.3, iy + spec.iry * 0.36, 0] });
        else add(flat(shape2d('round', 0.014 * H, 0.017 * H), Z.shine), pupil, shine, { position: [dx - s * spec.irx * 0.32, iy + spec.iry * hy, 0] });
        if (E.highlight === 2 || E.highlight === 'star') add(flat(shape2d('round', 0.007 * H, 0.008 * H), Z.shine), pupil, shine, { position: [dx + s * spec.irx * 0.35, iy - spec.iry * 0.35, 0] });
        if (spec.id === 'button') add(flat(shape2d('round', 0.008 * H, 0.008 * H), Z.shine), pupil, shine, { position: [dx + s * rx * 0.3, dy - ry * 0.35, 0] });
      }
    }
    // ---- lashes: on the outline's top edge, lifted to the lid level so the iris never covers them
    const topLine = (k = 1.04, from = -1, to = 1, n = 9) => Array.from({ length: n }, (_, i) => { const u = from + (to - from) * i / (n - 1); return [dx + u * rx * k, dy + (E.top ? (E.top(u) + tilt * u * s) * ry * k : ry * ell(u)), Z.lid - 0.006 * H + Z.dome * 0.35 * ell(u)]; });
    const lashStyle = E.lash || 'line';
    if (spec.kind === 'open' && lashStyle !== 'none' && !E.restLid) {
      const pts = s > 0 ? topLine(1.04, -0.9, 1) : topLine(1.04, 0.9, -1);
      // round 2: the plain line is a bold ink stroke, thickest over the outer half, as the redesign draws it
      const r = lashStyle === 'bold' ? [0.011, 0.02, 0.022] : lashStyle === 'heavy' ? [0.009, 0.015, 0.016] : lashStyle === 'line' ? [0.006, 0.012, 0.013] : [0.006, 0.01, 0.008];
      const H_ = g => hug(g, s, 0, 0, dx, dy, 1.04);
      add(H_(taperedCurve(pts, r.map(v => v * H), 4, 10)), eye, lash);
      /**
       * WINGS lie ON the skin (owner review 2026-10-21: almond's "floating bit to the sides of each eye"): the end of a
       * wing was at the lid's depth, ~0.04 head units in front of a face that had already curved away out there. Each
       * wing point now sits a lash-radius above the skin under it, and starts inside the lash line so the two join.
       */
      const wing = (o0, d) => {
        const r0 = Math.hypot((o0[0] - dx) / (rx * 1.04), (o0[1] - dy) / (ry * 1.04)), o = [o0[0], o0[1], o0[2] + THREE.MathUtils.smoothstep(r0, 0.55, 1.05) * Math.min(0, skinUnder(s, o0[0], o0[1]))];   // the lash's end, where hug() put it
        const q = d.map(([ax, ay]) => { const x = o[0] + s * ax * H, y = o[1] + ay * H; return [x, y, Math.max(skinUnder(s, x, y) + 0.012 * H, Math.min(o[2], skinUnder(s, x, y) + 0.02 * H))]; });
        return [[o[0] - s * 0.008 * H, o[1] - 0.002 * H, o[2]], ...q];
      };
      if (lashStyle === 'line') { const o = pts[pts.length - 1]; add(taperedCurve(wing(o, [[0.012, 0.006], [0.022, 0.012]]), [0.012 * H, 0.009 * H, 0.002 * H], 4, 4), eye, lash); }
      if (lashStyle === 'bold') { const o = pts[pts.length - 1]; add(taperedCurve(wing(o, [[0.014, 0.008], [0.028, 0.016]]), [0.02 * H, 0.014 * H, 0.003 * H], 4, 4), eye, lash); }
      if (lashStyle === 'flick' || lashStyle === 'heavy') { const o = pts[pts.length - 1]; add(taperedCurve(wing(o, [[0.03, 0.022], [0.045, 0.04]]), [0.009 * H, 0.008 * H, 0.001 * H], 4, 5), eye, lash); }
      if (lashStyle === 'long') for (const u of [0.35, 0.65, 0.92]) {
        const x = dx + s * u * rx * 1.04, y = dy + ell(u) * ry * 1.04, z = Z.lid + Math.min(0, skinUnder(s, x, y)) * THREE.MathUtils.smoothstep(u, 0.55, 1.05);
        add(taperedCurve([[x, y - 0.004 * H, z], [x + s * 0.02 * H, y + 0.025 * H, z], [x + s * 0.04 * H, y + 0.035 * H, z - 0.003 * H]], [0.006 * H, 0.004 * H, 0.001 * H], 4, 4), eye, lash);
      }
    }
    if (E.lower) for (let k = 0; k < E.lower; k++) {      // doe: three small lashes under the eye's outer half
      const u = s * (0.35 + k * 0.25), x = dx + u * rx * 1.08, y = dy + E.bot(u) * ry * 1.08;
      add(hug(taperedCurve([[x, y, Z.white + 0.004 * H], [x + s * 0.008 * H, y - 0.018 * H, Z.white + 0.004 * H]], [0.004 * H, 0.001 * H], 3, 2), s, 0, 0, dx, dy), eye, lash);
    }
    // ---- the resting lids of the lidded shapes (sleepy, tired, angry, hooded): a sheet over the eye's dome above a curve
    if (E.restLid) {
      const lrx = rx * 1.12, lry = ry * 1.12, N = 14, pts = [], edgePts = [];
      const edge = u => { const lim = ell(u); return Math.max(-lim, Math.min(lim, E.restLid(u, s))); };
      for (let i = 0; i <= N; i++) { const t = i / N * Math.PI, u = Math.cos(t), v = Math.sin(t); if (v >= edge(u)) pts.push([u, v]); }
      for (let i = 0; i <= N; i++) { const u = -1 + 2 * i / N; edgePts.push([u, edge(u)]); }
      const poly = [];
      for (const q of [...pts, ...edgePts]) { const last = poly[poly.length - 1]; if (!last || Math.hypot(q[0] - last[0], q[1] - last[1]) > 1e-3) poly.push(q); }
      if (poly.length > 2 && Math.hypot(poly[0][0] - poly[poly.length - 1][0], poly[0][1] - poly[poly.length - 1][1]) < 1e-3) poly.pop();
      const lidZ = (x, y) => Z.lid - 0.004 * H + 0.006 * H * Math.sqrt(Math.max(0, 1 - (x / lrx) ** 2 - (y / lry) ** 2));
      add(hug(ringSheet(poly.map(([u, v]) => [u * lrx, v * lry]), lidZ), s, dx, dy, dx, dy, 1, 1), eye, lidColour, { position: [dx, dy, 0] });
      const line = edgePts.filter(([u, v]) => Math.abs(v) < ell(u) - 0.01 || Math.abs(u) < 0.95);
      if (line.length > 2) add(hug(taperedCurve(line.map(([u, v]) => [dx + u * lrx, dy + v * lry, lidZ(u * lrx, v * lry) + 0.003 * H]), [0.004 * H, 0.008 * H, 0.004 * H], 4, 12), s, 0, 0, dx, dy, 1, 1), eye, lash);
      if (E.crease) add(hug(taperedCurve([-0.9, -0.3, 0.3, 0.9].map(u => [dx + u * lrx, dy + lry * 1.06 + (1 - u * u) * 0.01 * H, Z.lid]), [0.002 * H, 0.004 * H, 0.004 * H, 0.002 * H], 3, 8), s, 0, 0, dx, dy, 1, 1), eye, shade(skin, -0.16));
    }
    if (E.bags) {
      const hx = eyeBone.x * s + dx, hy = eyeBone.y + dy - ry * 1.35;
      onFace([[hx - s * rx * 0.7, hy + ry * 0.1], [hx, hy - ry * 0.08], [hx + s * rx * 0.6, hy + ry * 0.12]].map(([x, y]) => [x / H, y / H]), [0.002, 0.004, 0.002], shade(skin, -0.14));
    }
    // ---- THE BLINK LID: the eye's own outline, closed, hung from the eyelid bone at the top of the eye.
    if (spec.blinks && E.top) {
      // a touch bigger than the rim (1.1) and in front of the top lash, so a shut eye shows only skin and its lash line
      const k = 1.2, pts = outline(k).map(([x, y]) => [x, y - spec.pivotY]);
      // domed like an eyelid: well in front of the iris in the middle, back down to the face at the rim (a flat sheet at
      // one depth stood out from the face like a goggle lens in three-quarter view)
      const lz = (x, y) => { const r2 = (x / (rx * k)) ** 2 + ((y + spec.pivotY) / (ry * k)) ** 2; return 0.014 * H + 0.036 * H * Math.sqrt(Math.max(0, 1 - r2 * r2)); };
      const lidSheet = domedSheet(pts, [0, -spec.pivotY], lz); lidSheet.userData.keepNormals = true;
      add(skinNormals(hug(lidSheet, s, dx, dy + spec.pivotY, dx, dy, 1, 1), s, dx, dy + spec.pivotY), lidBone, lidColour, { position: [0, 0, 0] });
      const N = 14, bottom = Array.from({ length: N + 1 }, (_, i) => { const u = -1 + 2 * i / N; const x = u * rx * k * 0.96, y = (E.bot(u) + tilt * u * s) * ry * k * 0.96 - spec.pivotY; return [x, y, lz(x, y) + 0.002 * H]; });
      add(hug(taperedCurve(bottom.filter((_, i) => i > 0 && i < N), [0.004 * H, 0.009 * H, 0.009 * H, 0.004 * H], 4, 12), s, dx, dy + spec.pivotY, dx, dy, 1, 1), lidBone, lash);
    } else if (spec.blinks && spec.kind !== 'closed') {
      // dot and glow eyes: an elliptic lid
      const k = 1.15, eRy = ry * k, pts = Array.from({ length: 16 }, (_, i) => { const t = i / 16 * Math.PI * 2; return [Math.cos(t) * rx * k, Math.sin(t) * eRy - spec.pivotY]; });
      add(skinNormals(flat(shapeOf(pts), Z.lid + 0.006 * H), s, dx, dy + spec.pivotY), lidBone, lidColour);
    }
  }

  // ---------------------------------------------------------------- brows: above the eye's TOP, always
  tag('face:brows');
  // brows are the DARK hair shade, as the 2D picture draws them (--hair-dark): in the hair colour they vanished into the fringe
  const brow = a.brows.id, browColour = a.brows.color || shade(hair, -0.28), thickK = clamp(a.brows.thick || 1, 0.5, 1.8);
  let browTop = (eyeBone.y + ry * 1.1) / H + 0.06;
  if (brow !== 'none') for (const { s, dx, dy } of eyeInfo) {
    const cx = (eyeBone.x * s + dx) / H, eyeTop = (eyeBone.y + dy + spec.pivotY * 0.97) / H;
    const lift = clamp((a.brows.y || 0) * -0.035, -0.02, 0.05);
    // owner review 2026-10-21: `bold` (the reference picture's thick, expressive brow) is new; `curved` is a thin high
    // crescent now (it read as `arched`)
    const thick = thickK * (brow === 'bold' ? 0.027 : brow === 'thick' || brow === 'angry' || brow === 'bushy' ? 0.02 : brow === 'thin' || brow === 'curved' ? 0.009 : brow === 'unibrow' ? 0.019 : 0.014);
    const inner = { angry: -0.035, worried: 0.03, raised: s > 0 ? 0.03 : 0, slanted: -0.045, curved: -0.02, bold: -0.012 }[brow] ?? 0;
    const outer = { angry: 0.012, worried: -0.022, raised: s > 0 ? 0.03 : -0.012, slanted: 0.035, curved: -0.035, bold: 0.0 }[brow] ?? -0.012;
    /**
     * ROUND 2 (owner's Starcaller redesign, 2026-10-17): a strip of forehead skin between the brow and the lash line.
     * The brow used to start 0.03 above the eye's top, so an angry or slanted brow (inner end -0.035/-0.045) and any
     * thick brow pressed straight onto the lash: "fixed some clipping around the top eyebrows". The LOWEST edge of the
     * brow (its lowest end, minus half its thickness) now stays at least `GAP` above the eye's top. The ends only
     * count 0.6 of their dip: they sit over the eye's corners, where its top has already curved down. Kept small on
     * purpose — the fringe ends at `browTop`, and a bigger lift pushed a bowl cut out through a circlet's band.
     */
    const GAP = 0.022, lowest = Math.min(inner, outer, 0) * 0.6 - thick * 0.6;
    const y0 = eyeTop + Math.max(0.035, GAP - lowest) + lift, shiftX = (a.brows.x || 0) * 0.02 * s;
    const mid = { arched: 0.03, raised: s > 0 ? 0.045 : 0.016, curved: 0.07, soft: 0.006, bold: 0.018 }[brow] ?? 0.016;
    const w = brow === 'soft' ? 0.055 : 0.095;
    browTop = Math.max(browTop, y0 + Math.max(inner, mid, outer) + thick);
    if (brow === 'dots') { dotFace(cx + shiftX * 0.5, y0 + 0.02, 0.026 * thickK, browColour, 0.004, 0.45); continue; }
    if (brow === 'soft') { head(sphere(), browColour, { position: [cx + shiftX, y0 + 0.008, faceZ(cx, y0, 0.006)], scale: [0.05, 0.017 * thickK, 0.012], rotation: [0, s * 0.3, s * -0.1] }); continue; }
    const pts = [[cx - s * w * 0.95 + shiftX, y0 + inner], [cx + shiftX, y0 + mid + (inner + outer) * 0.3], [cx + s * w + shiftX, y0 + outer]];
    if (brow === 'split' && s > 0) {
      onFace([pts[0], [cx - s * 0.012 + shiftX, y0 + mid * 0.6]], [thick * 0.8, thick], browColour, { lift: 0.004, steps: 4 });
      onFace([[cx + s * 0.03 + shiftX, y0 + mid * 0.8], pts[2]], [thick, thick * 0.55], browColour, { lift: 0.004, steps: 4 });
      continue;
    }
    if (brow === 'bold') { onFace(pts, [thick * 1.1, thick * 1.0, thick * 0.4], browColour, { lift: 0.004, steps: 8 }); continue; }   // thickest at the inner end, tapering out
    onFace(pts, brow === 'curved' ? [thick * 0.6, thick * 1.2, thick * 0.5] : [thick * 0.8, thick * 1.15, thick * 0.55], browColour, { lift: 0.004, steps: 8 });
    if (brow === 'bushy') for (const t of [-0.6, 0, 0.6]) onFace([[cx + s * w * t + shiftX, y0 + mid * (1 - t * t) + 0.004], [cx + s * w * (t + 0.18) + shiftX, y0 + mid * (1 - t * t) + 0.024]], [thick * 0.6, thick * 0.2], browColour, { lift: 0.006, steps: 2 });
    if (brow === 'unibrow' && s > 0) onFace([[-(cx - w * 0.75), y0 + inner * 0.8 + 0.002], [0, y0 - 0.002], [cx - w * 0.75, y0 + inner * 0.8 + 0.002]], [thick * 0.95, thick * 0.85, thick * 0.95], browColour, { lift: 0.004, steps: 6 });   // a solid bridge, as thick as the brows
  }

  // ---------------------------------------------------------------- nose
  tag('face:nose');
  const nose = a.nose.id, noseScale = clamp(a.nose.scale || 1, 0.5, 1.7);
  const noseY = 0.18 + (a.nose.y || 0) * -0.03;
  const NS = { wide: [0.075, 0.042, 0.052], snout: [0.075, 0.042, 0.052], long: [0.032, 0.08, 0.07], hook: [0.035, 0.075, 0.065], button: [0.055, 0.05, 0.052], dot: [0.026, 0.026, 0.028], upturned: [0.042, 0.044, 0.05], pointed: [0.03, 0.06, 0.085], round: [0.062, 0.058, 0.06], flat: [0.085, 0.034, 0.03] };
  const nsk = (NS[nose] || [0.041, 0.052, 0.045]).map(v => v * noseScale);
  let noseBottom = noseY - 0.03;
  if (nose !== 'none') {
    const nz = faceZ(0, noseY) + nsk[2] * 0.25;
    const rotX = { upturned: -0.45, hook: 0.3, pointed: -0.2, long: 0.12 }[nose] || 0;
    if (nose === 'pointed') head(new THREE.ConeGeometry(1, 1, 6), shade(skin, -0.05), { position: [0, noseY, nz], scale: [nsk[0], nsk[2] * 1.4, nsk[1]], rotation: [Math.PI / 2 + rotX, 0, 0] });
    else if (nose === 'hook') {
      // ONE curved piece from the bridge, out over a rounded ridge and down to a tip that hooks under (owner review
      // 2026-10-21: the hump used to be a second ball stuck on top — "the nose has a lump on top")
      const k = noseScale, z0 = faceZ(0, noseY);
      head(taperedCurve([[0, noseY + 0.06 * k, faceZ(0, noseY + 0.06 * k) - 0.006], [0, noseY + 0.025 * k, z0 + 0.03 * k], [0, noseY - 0.012 * k, z0 + 0.05 * k], [0, noseY - 0.04 * k, z0 + 0.04 * k], [0, noseY - 0.05 * k, z0 + 0.018 * k]], [0.018 * k, 0.026 * k, 0.03 * k, 0.022 * k, 0.012 * k], 6, 10), shade(skin, -0.05));
    } else head(sphere(), shade(skin, -0.05), { position: [0, noseY, nz], scale: nsk, rotation: [rotX, 0, 0] });
    if (nose === 'long') head(sphere(), shade(skin, -0.03), { position: [0, noseY - nsk[1] * 0.55, nz + nsk[2] * 0.35], scale: [nsk[0] * 1.15, nsk[1] * 0.35, nsk[2] * 0.6] });   // a long nose has a tip, so it is not the hook any more
    if (nose === 'upturned') head(sphere(), shade(skin, -0.03), { position: [0, noseY - nsk[1] * 0.3, nz + nsk[2] * 0.55], scale: [nsk[0] * 0.75, nsk[1] * 0.5, nsk[2] * 0.5], rotation: [-0.6, 0, 0] });
    if (nose === 'snout' || muzzle > 0) for (const s of [-1, 1]) head(sphere(), '#2a2222', { position: [s * nsk[0] * 0.38, noseY - nsk[1] * 0.2, nz + nsk[2] * 0.85], scale: [0.014, 0.009, 0.008] });
    else if (nose === 'hook') for (const s of [-1, 1]) head(sphere(), shade(skin, -0.2), { position: [s * 0.016 * noseScale, noseY - 0.04 * noseScale, faceZ(0, noseY) + 0.022 * noseScale], scale: [0.009, 0.006, 0.006] });
    else if (nose !== 'dot') for (const s of [-1, 1]) head(sphere(), shade(skin, -0.2), { position: [s * nsk[0] * 0.42, noseY - nsk[1] * 0.45, nz + nsk[2] * (nose === 'upturned' ? 0.75 : 0.55)], scale: [0.009, 0.006, 0.005] });
    noseBottom = noseY - nsk[1] * 0.85;
  }

  // ---------------------------------------------------------------- facial hair
  tag('face:beard');
  const fh = a.facialHair.id;
  // a goatee is chin-only, as the 2D picture draws it (v2 added a moustache); the van dyke is the goatee + moustache
  const hasMoustache = ['mustache', 'full', 'long', 'braided_beard', 'van_dyke', 'handlebar', 'short_beard', 'forked_beard'].includes(fh);
  const mouthY = Math.min(noseBottom - (hasMoustache ? 0.06 : 0.035), 0.1) - clamp((a.mouth.y || 0) * 0.025, -0.02, 0.03);
  const mouthW = 0.062 * clamp(a.mouth.scale || 1, 0.5, 1.8);
  const beardColour = (a.facialHair && a.facialHair.color) || hair, stubble = mix(skin, beardColour, 0.22);
  const smooth = t => t * t * (3 - 2 * t);
  const jawTop = (x, cheek, side) => {
    const ax = Math.abs(x), mid = mouthY - 0.03;
    if (ax < mouthW + 0.01) return mid;
    if (ax < 0.26) return mid + (cheek - mid) * smooth((ax - mouthW - 0.01) / (0.26 - mouthW - 0.01));
    return cheek + (side - cheek) * smooth(Math.min(1, (ax - 0.26) / 0.07));
  };
  /**
   * BEARDS ON THE CHEST. A beard that hangs below the chin is in head space but lies over the chest; v2 put it at the
   * chin's depth, so a long or braided beard went straight down into the collar. `overChest(x, y, z)` pushes a point
   * forward to clear the body's surface (chest space via the neck offset) — opt-in data from chibi2.js.
   */
  const overChest = (x, y, z, gap = 0.03) => {
    if (!c.chestZ || y > -0.02) return z;
    const cy = y * H + c.neckLift, cz = c.chestZ(x * H, cy, 1, 0) / H;
    return Math.max(z, cz + gap);
  };
  const hang = (pts, radii, colour, sides = 7, steps = 6) => head(taperedCurve(pts.map(([x, y, z]) => [x, y, overChest(x, y, z, Math.max(...radii) * 0.9)]), radii, sides, steps), colour);
  /**
   * STUBBLE AND CHINSTRAP ARE PAINT, NOT SHEETS (owner review 2026-10-21, "overlapping shapes on the chin"). They were
   * sheets lifted 3-5 mm off the face along +z only; under the jaw the skin faces DOWN, so a +z lift is no gap at
   * all there and the sheet z-fought the skin in flecks. A texture would need a UV set and a texture in a pipeline
   * that has neither (every Chibi colour is a vertex colour), so the beard is painted into the head shell's own
   * vertex colours instead: the shell is built finer (rings every 0.028 below the cheekbone, 28 sides) and each vertex
   * takes skin, beard or a blend — one surface, nothing to fight, and the soft edge reads as stubble. Thick beards
   * (full, short, long…) stay geometry: they have real depth.
   */
  if (paintedBeard) {
    const strap = x => Math.min(jawTop(x, 0.04, 0.27), Math.abs(x) * 0.15 + (Math.abs(x) > 0.26 ? (Math.abs(x) - 0.26) * 3 : 0));
    const lipTop = x => mouthY + 0.05 - (x / (mouthW + 0.02)) ** 2 * 0.02;
    const soft = 0.018, ink = fh === 'stubble' ? mix(skin, beardColour, 0.42) : beardColour;
    const paint = (X, Y) => {
      const x = X / H, y = Y / H;
      let t = THREE.MathUtils.clamp(((fh === 'stubble' ? jawTop(x, 0.1, 0.27) : strap(x)) - y) / soft + 0.5, 0, 1);
      if (fh === 'stubble' && Math.abs(x) < mouthW + 0.03 && y > mouthY + 0.008) t = Math.max(t, THREE.MathUtils.clamp((lipTop(x) - y) / 0.012 + 0.5, 0, 1) * THREE.MathUtils.clamp((y - mouthY - 0.012) / 0.008 + 0.5, 0, 1) * THREE.MathUtils.clamp((mouthW + 0.03 - Math.abs(x)) / 0.012, 0, 1));
      return t <= 0 ? null : mix(skin, ink, t);
    };
    const fine = [];
    for (let i = 0; i < rings.length; i++) {
      fine.push(rings[i]);
      const q = rings[i + 1];
      if (q && q[0] <= 0.26) for (let y = rings[i][0] + 0.028; y < q[0] - 0.01; y += 0.028) fine.push(ringAt(rings, y));
    }
    tag('face:head');
    head(profile(fine, 28), skin, { colorAt: paint });
    tag('face:beard');
  }
  if (fh === 'sideburns' || fh === 'mutton_chops') for (const s of [-1, 1]) {
    const x0 = s * 0.33, x1 = s * (fh === 'mutton_chops' ? 0.15 : 0.27);
    faceSheet(Math.min(x0, x1), Math.max(x0, x1), fh === 'mutton_chops' ? 0.0 : 0.12, x => fh === 'mutton_chops' ? 0.28 - (0.33 - Math.abs(x)) * 0.95 : 0.3, beardColour, 0.006, (x, y) => fh === 'mutton_chops' ? Math.max(0, 0.12 - y) * 0.15 : 0, 6, 6);
  }
  if (fh === 'full' || fh === 'long' || fh === 'braided_beard' || fh === 'short_beard' || fh === 'forked_beard') {
    const bulge = fh === 'short_beard' ? (x, y) => 0.006 + Math.max(0, 0.06 - y) * 0.12 : (x, y) => 0.01 + Math.max(0, 0.06 - y) * 0.3 * (1 - (Math.abs(x) / 0.33) ** 2);
    faceSheet(-0.335, 0.335, fh === 'short_beard' ? -0.06 : -0.09, x => jawTop(x, 0.13, 0.3), beardColour, 0.004, bulge, 24, 10);
    if (fh !== 'short_beard') head(sphere(), beardColour, { position: [0, -0.05, overChest(0, -0.05, faceZ(0, 0.02) - 0.035, 0.06)], scale: [0.14, 0.075, 0.075] });
  }
  if (fh === 'long') hang([[0, -0.07, faceZ(0, 0) - 0.02], [0, -0.2, faceZ(0, 0)], [0.01, -0.36, faceZ(0, 0) - 0.04]], [0.12, 0.085, 0.012], beardColour);
  if (fh === 'forked_beard') for (const s of [-1, 1]) hang([[s * 0.03, -0.07, faceZ(0, 0) - 0.02], [s * 0.06, -0.2, faceZ(0, 0)], [s * 0.08, -0.33, faceZ(0, 0) - 0.03]], [0.07, 0.05, 0.008], beardColour, 6, 6);
  if (fh === 'braided_beard') for (let k = 0; k < 4; k++) { const y = -0.1 - k * 0.075; head(new THREE.IcosahedronGeometry(1, 0), k % 2 ? shade(beardColour, 0.12) : beardColour, { position: [0, y, overChest(0, y, faceZ(0, 0) - 0.02 - k * 0.01, 0.05)], scale: [0.05 - k * 0.006, 0.045, 0.045] }); }
  if (fh === 'goatee' || fh === 'van_dyke') faceSheet(-0.06, 0.06, -0.07, x => mouthY - 0.028 - (x / 0.06) ** 2 * 0.04, beardColour, 0.006, (x, y) => Math.max(0, 0.02 - y) * 0.5 * (1 - (x / 0.07) ** 2), 8, 5);
  if (fh === 'soul_patch') dotFace(0, mouthY - 0.045, 0.028, beardColour, 0.004);
  if (hasMoustache) {
    const my = (noseBottom + mouthY) / 2 + 0.004, droop = fh === 'mustache' ? 0.03 : fh === 'handlebar' ? -0.01 : 0.018;
    for (const s of [-1, 1]) {
      onFace([[s * 0.008, my + 0.006], [s * 0.05, my], [s * (mouthW + 0.03), my - droop]], [0.02, 0.018, 0.006], beardColour, { lift: 0.006, steps: 6 });
      // the handlebar's waxed ends curl up past the cheeks
      if (fh === 'handlebar') onFace([[s * (mouthW + 0.025), my - 0.005], [s * (mouthW + 0.06), my + 0.01], [s * (mouthW + 0.07), my + 0.045], [s * (mouthW + 0.05), my + 0.055]], [0.01, 0.008, 0.005, 0.002], beardColour, { lift: 0.008, steps: 8 });
    }
  }

  // ---------------------------------------------------------------- mouth
  tag('face:mouth');
  const mouth = a.mouth.id, lip = mix(shade(a.mouth.color || '#b5484d', -0.3), '#4a2420', 0.6), teeth = '#fff8e8', dark = '#3a1518';
  const curve = { smile: 0.02, grin: 0.026, neutral: 0.004, frown: -0.018, smirk: 0.012, stitched: 0, tongue: 0.012, fangs: 0.012, tusks: 0.004, buck: 0.02, fang: 0.02, gritted: 0.004 }[mouth] ?? 0.008;
  // a smirk is clearly one-sided (the 2D picture rises to one corner); v2's was nearly level
  const corner = s => mouth === 'smirk' ? (s > 0 ? 0.03 : -0.004) : 0;
  const lipPts = [-1, -0.5, 0, 0.5, 1].map(k => [k * mouthW, mouthY + (k * k) * curve - curve * 0.35 + corner(Math.sign(k)) * Math.abs(k) ** 1.5]);
  const mz = (x, y, l) => faceZ(x, y, l);
  /** a filled shape on the face: `pts` [x, y] head units around the edge */
  const faceFill = (pts, colour, lift) => {
    const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))), g = new THREE.ShapeGeometry(sh, 2), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, mz(p.getX(i), p.getY(i), lift));
    g.computeVertexNormals(); head(g, colour);
  };
  const arcPts = (w, top, bottom, n = 10) => [...Array.from({ length: n + 1 }, (_, i) => { const u = -1 + 2 * i / n; return [u * w, mouthY + top(u)]; }), ...Array.from({ length: n - 1 }, (_, i) => { const u = 1 - 2 * (i + 1) / n; return [u * w, mouthY + bottom(u)]; })];
  if (mouth === 'o') {
    head(sphere(), dark, { position: [0, mouthY, faceZ(0, mouthY, -0.004)], scale: [0.032, 0.032, 0.016] });
    head(new THREE.TorusGeometry(1, 0.18, 4, 14), lip, { position: [0, mouthY, faceZ(0, mouthY, 0.004)], scale: [0.033, 0.033, 0.02] });
  } else if (mouth === 'open' || mouth === 'laugh') {
    // open: a D with the upper teeth showing and a tongue; laugh: wider, deeper, rising at the corners
    const w = mouth === 'laugh' ? mouthW * 1.15 : mouthW * 0.85, h = mouth === 'laugh' ? 0.07 : 0.05;
    const top = u => 0.012 + (mouth === 'laugh' ? u * u * 0.012 : 0), bot = u => 0.012 - h * ell(u);
    faceFill(arcPts(w, top, bot), dark, 0.003);
    faceFill(arcPts(w * 0.85, u => top(u) - 0.002, u => top(u) - 0.016 - 0.004 * ell(u)), teeth, 0.005);
    faceFill(arcPts(w * 0.55, u => 0.012 - h * 0.62, u => 0.012 - h * 0.95 * ell(u)), '#c85868', 0.005);
    onFace(arcPts(w * 1.02, top, bot, 8).concat([[-w * 1.02, mouthY + top(-1)]]), 0.004, lip, { lift: 0.006, steps: 30 });
  } else if (mouth === 'sad_open') {
    // the wail: an arch with a flat bottom (the 2D picture), not a round O
    const w = mouthW * 0.9;
    faceFill(arcPts(w, u => 0.008 + 0.03 * ell(u) - 0.02, u => -0.02 + 0.004 * u * u), dark, 0.003);
    onFace(Array.from({ length: 9 }, (_, i) => { const u = -1 + i / 4; return [u * w, mouthY - 0.012 + 0.03 * ell(u)]; }), 0.005, lip, { lift: 0.006, steps: 12 });
  } else if (mouth === 'gritted' || mouth === 'shark') {
    const w = mouthW * 1.1, h = mouth === 'shark' ? 0.042 : 0.03;
    faceFill(arcPts(w, u => 0.014 + 0.004 * u * u, u => -h + 0.01 * u * u + (mouth === 'shark' ? 0.0 : 0)), mouth === 'shark' ? dark : teeth, 0.003);
    if (mouth === 'gritted') { onFace([[-w, mouthY - 0.006], [w, mouthY - 0.006]], 0.0025, '#a09080', { lift: 0.006, steps: 2 }); for (let k = -3; k <= 3; k++) onFace([[k * w / 4, mouthY + 0.012], [k * w / 4, mouthY - 0.024]], 0.002, '#a09080', { lift: 0.006, steps: 2 }); }
    else for (const row of [1, -1]) for (let k = 0; k < 6; k++) { const x0 = -w * 0.9 + k * w * 0.36; faceFill([[x0, mouthY + (row > 0 ? 0.012 : -h + 0.01)], [x0 + w * 0.36, mouthY + (row > 0 ? 0.012 : -h + 0.01)], [x0 + w * 0.18, mouthY + (row > 0 ? -0.012 : -h + 0.03)]], teeth, 0.006); }
    onFace(arcPts(w * 1.02, u => 0.014 + 0.004 * u * u, u => -h + 0.01 * u * u, 8).concat([[-w * 1.02, mouthY + 0.018]]), 0.0035, lip, { lift: 0.006, steps: 30 });
  } else if (mouth === 'cat') {
    // :3 — two little bumps meeting under the nose
    for (const s of [-1, 1]) onFace([[0, mouthY + 0.008], [s * 0.018, mouthY - 0.012], [s * 0.04, mouthY + 0.004], [s * 0.055, mouthY + 0.014]], [0.004, 0.006, 0.006, 0.003], lip, { lift: 0.004, steps: 8 });
  } else if (mouth === 'pout') {
    head(sphere(), shade(a.mouth.color || '#b5484d', -0.05), { position: [0, mouthY + 0.004, faceZ(0, mouthY, 0.012)], scale: [0.032, 0.012, 0.014] });
    head(sphere(), shade(a.mouth.color || '#b5484d', -0.15), { position: [0, mouthY - 0.014, faceZ(0, mouthY, 0.014)], scale: [0.03, 0.013, 0.016] });
  } else if (mouth === 'wavy') {
    onFace(Array.from({ length: 9 }, (_, i) => [(-1 + i / 4) * mouthW, mouthY + (i % 2 ? 0.009 : -0.006)]), 0.0045, lip, { lift: 0.004, steps: 18 });
  } else {
    onFace(lipPts, [0.004, 0.007, 0.008, 0.007, 0.004], lip, { lift: 0.003, steps: 10 });
    if (mouth === 'grin') onFace(lipPts.map(([x, y]) => [x * 0.86, y - 0.01 + (Math.abs(x) < 0.001 ? -0.004 : 0)]), [0.004, 0.014, 0.016, 0.014, 0.004], teeth, { lift: 0.002, steps: 8 });
    if (mouth === 'tongue') dotFace(0.015, mouthY - 0.02, 0.022, '#d05060', 0.004);
    if (mouth === 'stitched') for (let k = -2; k <= 2; k++) onFace([[k * 0.025, mouthY + 0.014], [k * 0.025, mouthY - 0.014]], 0.004, '#2a2020', { lift: 0.005, steps: 2 });
    if (mouth === 'buck') for (const s of [-1, 1]) head(new THREE.BoxGeometry(0.018, 0.024, 0.006), teeth, { position: [s * 0.0105, mouthY - 0.016, faceZ(0, mouthY, 0.006)] });
  }
  if (mouth === 'fangs') for (const s of [-1, 1]) head(new THREE.ConeGeometry(0.014, 0.04, 5), '#f2f0dc', { position: [s * mouthW * 0.55, mouthY - 0.016, faceZ(s * mouthW * 0.55, mouthY, 0.004)], rotation: [Math.PI, 0, 0] });
  if (mouth === 'fang') head(new THREE.ConeGeometry(0.013, 0.036, 5), '#f2f0dc', { position: [mouthW * 0.5, mouthY - 0.006, faceZ(mouthW * 0.5, mouthY, 0.005)], rotation: [Math.PI, 0, 0] });
  // tusks rise FROM BELOW the lower lip past the upper one (v2's sat on the lip line and read as fangs)
  // owner review 2026-10-21: the BASE sat out on the chin and stuck out past the mouth. Each tusk is now a cone from a
  // base sunk inside the lower lip to a tip in front of the upper lip, leaning forward and a little out: only the
  // upper half shows, rising out of the mouth line.
  if (mouth === 'tusks') for (const s of [-1, 1]) {
    const x = s * mouthW * 0.78, B = new THREE.Vector3(x, mouthY - 0.03, faceZ(x, mouthY - 0.03) - 0.014), T = new THREE.Vector3(x + s * 0.012, mouthY + 0.05, faceZ(x, mouthY + 0.02) + 0.028);
    const d = T.clone().sub(B), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()), e = new THREE.Euler().setFromQuaternion(q);
    head(new THREE.ConeGeometry(0.019, d.length(), 6), '#f2f0dc', { position: B.clone().add(T).multiplyScalar(0.5).toArray(), rotation: [e.x, e.y, e.z] });
  }

  // ---------------------------------------------------------------- cheeks
  tag('face:marks');
  if (a.body.cheeks) for (const s of [-1, 1]) dotFace(s * 0.2, 0.14, 0.045, mix(skin, '#e06a6a', 0.25), 0.001, 0.25);

  // ---------------------------------------------------------------- marks
  const xid = a.extras.id, xc = a.extras.color || '#8a2e2e';
  const eyeLow = (eyeBone.y - ry * 1.15) / H, cheekY = Math.min(0.17, eyeLow - 0.03);
  const eyeX = s => (eyeBone.x * s + eyeInfo[s > 0 ? 1 : 0].dx) / H;
  const browY = (eyeBone.y + spec.pivotY) / H + 0.04;
  // things on the FOREHEAD sit in front of a fringe (the hair is built after the face and pressed behind `browTop`)
  const forehead = Math.max(browTop + 0.012, 0.42);
  if (xid === 'freckles' || xid === 'freckles_heavy') for (const s of [-1, 1]) for (let i = 0; i < (xid === 'freckles' ? 4 : 8); i++) dotFace(s * (0.1 + (i % 4) * 0.04), cheekY - 0.01 - Math.floor(i / 4) * 0.035 - (i % 2) * 0.018, 0.009, shade(skin, -0.2));
  if (xid === 'freckles_nose') for (let i = 0; i < 9; i++) { const x = (i - 4) * 0.032, y = noseY + 0.02 - Math.abs(i - 4) * 0.006 + (i % 2) * 0.012; dotFace(x, y, 0.008, shade(skin, -0.2), Math.abs(x) < 0.04 ? 0.03 : 0.004); }
  if (xid === 'blush' || xid === 'blush_soft') for (const s of [-1, 1]) dotFace(s * 0.2, cheekY - 0.02, xid === 'blush' ? 0.06 : 0.07, mix(skin, xid === 'blush' ? xc : '#e87a8a', xid === 'blush' ? 0.5 : 0.28), 0.001, 0.2);
  if (xid === 'third_eye') { const y = forehead + 0.02; dotFace(0, y, 0.045, '#fff8e8', 0.02, 0.25); dotFace(0, y, 0.02, a.eyes.color, 0.026, 0.4); }
  if (xid === 'scar' || xid === 'scar_brow') {
    // "Scar (eye)": from above the brow, over the closed line of the lid, down the cheek — the eye itself is skipped
    const x = eyeX(-1) + 0.02;
    onFace([[x - 0.03, browY + 0.05], [x - 0.015, browY - 0.01]], [0.006, 0.008], mix(skin, xc, 0.7), { lift: 0.008, steps: 4 });
    if (xid === 'scar') onFace([[x + 0.0, eyeLow - 0.005], [x + 0.012, eyeLow - 0.07], [x + 0.02, eyeLow - 0.12]], [0.008, 0.007, 0.003], mix(skin, xc, 0.7));
    for (const t of [0.25, 0.7]) { const yy = browY + 0.05 - 0.06 * t; onFace([[x - 0.045, yy - 0.004], [x - 0.005, yy + 0.008]], 0.003, mix(skin, xc, 0.5), { lift: 0.01, steps: 2 }); }
  }
  if (xid === 'scar_lip') onFace([[0.025, mouthY + 0.05], [0.03, mouthY], [0.035, mouthY - 0.04]], [0.004, 0.006, 0.003], mix(skin, xc, 0.6), { lift: 0.007 });
  if (xid === 'scar_cheek') onFace([[0.15, cheekY], [0.2, cheekY - 0.05], [0.24, cheekY - 0.1]], [0.006, 0.009, 0.004], mix(skin, xc, 0.7));
  if (xid === 'nose_scar') { onFace([[-0.07, noseY + 0.035], [0, noseY + 0.005], [0.07, noseY - 0.025]], [0.006, 0.008, 0.006], mix(skin, xc, 0.75), { lift: 0.04, steps: 8 }); }
  if (xid === 'burn_scar') dotFace(0.18, cheekY - 0.04, 0.07, mix(skin, '#8a3a3a', 0.35), 0.001, 0.2);
  if (xid === 'warpaint' || xid === 'war_mask') {
    // the 2D war paint: a band across the eyes and a line down the forehead (v2 drew cheek stripes, the same as cheek_stripes)
    facePatch(-0.31, 0.31, eyeLow + 0.005, (eyeBone.y + spec.pivotY) / H + 0.005, xc, 0.002, (x, y) => xid === 'war_mask' || Math.abs(x) > 0.06 || y < eyeLow + 0.03, 22, 6);
    if (xid === 'warpaint') onFace([[0, forehead + 0.07], [0, forehead - 0.01]], [0.012, 0.009], xc, { lift: 0.018 });
  }
  if (xid === 'cheek_stripes') for (const s of [-1, 1]) for (let k = 0; k < 3; k++) onFace([[s * 0.1, cheekY - k * 0.035], [s * 0.24, cheekY - 0.01 - k * 0.035]], 0.009, xc, { lift: 0.002 });
  if (xid === 'eye_black') for (const { s, dx } of eyeInfo) { const cx = (eyeBone.x * s + dx) / H, cy = eyeBone.y / H; dotFace(cx, cy - 0.01, 0.12, mix(skin, '#1a1418', 0.7), -0.004, 0.1); }
  if (xid === 'tattoo') onFace([[0.27, forehead + 0.04], [0.3, cheekY + 0.06], [0.28, cheekY - 0.02], [0.24, cheekY - 0.06]], [0.005, 0.006, 0.005, 0.003], xc, { lift: 0.004, steps: 14 });
  if (xid === 'face_glyphs') {
    onFace([[0, forehead + 0.05], [0, forehead - 0.01]], 0.007, xc, { lift: 0.018 }); onFace([[-0.03, forehead + 0.02], [0.03, forehead + 0.02]], 0.007, xc, { lift: 0.018 });
    for (const s of [-1, 1]) onFace([[s * 0.22, cheekY + 0.01], [s * 0.18, cheekY - 0.03], [s * 0.22, cheekY - 0.07]], 0.006, xc, { lift: 0.003 });
  }
  if (xid === 'chin_lines') for (let k = -2; k <= 2; k++) onFace([[k * 0.025, mouthY - 0.035], [k * 0.03, -0.03]], 0.005, xc, { lift: 0.004, steps: 3 });
  if (xid === 'paint_dots') { for (const s of [-1, 1]) for (let k = 0; k < 3; k++) { dotFace(s * (0.12 + k * 0.04), cheekY - 0.02, 0.014, xc); dotFace(s * (0.07 + k * 0.045), browY + 0.03 - k * 0.006, 0.011, xc, 0.008); } }
  if (xid === 'dirt' || xid === 'mud') for   // soot is drawn by chibi2-gear.js buildMarks, as in v2
  (const [x, y, r] of [[-0.19, cheekY - 0.04, 0.03], [-0.16, cheekY - 0.07, 0.02], [0.2, cheekY - 0.02, 0.028], [0.23, cheekY - 0.05, 0.018], [0.1, Math.min(0.45, forehead), 0.022], [0.13, Math.min(0.43, forehead - 0.02), 0.015]]) dotFace(x, y, r, mix(skin, xid === 'soot' ? '#222222' : '#5a4030', 0.35), y > 0.38 ? 0.012 : -0.001, 0.05);
  if (xid === 'blood') { onFace([[0.24, cheekY + 0.08], [0.25, cheekY + 0.02], [0.24, cheekY - 0.03]], [0.012, 0.008, 0.003], '#8a1a1a', { lift: 0.002 }); for (const [x, y] of [[0.19, cheekY + 0.03], [0.2, cheekY - 0.05], [-0.18, cheekY - 0.06]]) dotFace(x, y, 0.011, '#8a1a1a'); }
  if (xid === 'brand') { const y = forehead + 0.035; dotFace(0, y, 0.035, mix(skin, '#7a2a2a', 0.5), 0.016, 0.2); onFace([[-0.025, y], [0.025, y]], 0.004, '#5a1a1a', { lift: 0.02 }); onFace([[0, y + 0.025], [0, y - 0.025]], 0.004, '#5a1a1a', { lift: 0.02 }); }
  if (xid === 'wrinkles') {
    for (let k = 0; k < 2; k++) onFace([[-0.13, forehead + 0.03 + k * 0.035], [0, forehead + 0.035 + k * 0.035], [0.13, forehead + 0.03 + k * 0.035]], 0.003, shade(skin, -0.12), { lift: 0.012 });
    for (const { s, dx } of eyeInfo) { const x = (eyeBone.x * s + dx) / H + s * (rx / H) * 1.25, y = eyeBone.y / H; for (const d of [-0.02, 0.0, 0.02]) onFace([[x, y + d * 0.5], [x + s * 0.035, y + d * 1.5]], 0.0025, shade(skin, -0.12), { lift: 0.001, steps: 2 }); }
  }
  if (xid === 'undead_skin') {
    for (const [x, y, r] of [[-0.2, browY + 0.02, 0.05], [0.21, cheekY - 0.05, 0.055]]) dotFace(x, y, r, mix(skin, '#6a8a4a', 0.5), 0.002, 0.15);
    for (let k = 0; k < 3; k++) onFace([[-0.04 + k * 0.03, mouthY - 0.03], [-0.04 + k * 0.03, mouthY - 0.065]], 0.004, '#3a3030', { lift: 0.004, steps: 2 });
  }
  if (xid === 'beauty_mark') dotFace(0.1, mouthY + 0.035, 0.011, '#3a2420', 0.004, 0.5);
  if (xid === 'tear_mark') { const x = eyeX(1), y = eyeLow - 0.035; faceFill([[x, y + 0.012], [x + 0.012, y - 0.008], [x, y - 0.022], [x - 0.012, y - 0.008]], xc, 0.004); }
  if (xid === 'star_mark' || xid === 'moon_mark') {
    const x = 0.2, y = cheekY - 0.02, sh = xid === 'star_mark' ? shape2d('star', 0.035, 0.035) : null;
    if (sh) { const g = new THREE.ShapeGeometry(sh, 1), p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setXYZ(i, x + p.getX(i), y + p.getY(i), faceZ(x + p.getX(i), y + p.getY(i), 0.004)); g.computeVertexNormals(); head(g, xc); }
    else { const pts = []; for (let i = 0; i <= 10; i++) { const t = -1.9 + i / 10 * 3.8; pts.push([x + Math.cos(t) * 0.032, y + Math.sin(t) * 0.032]); } for (let i = 10; i >= 0; i--) { const t = -1.6 + i / 10 * 3.2; pts.push([x + 0.012 + Math.cos(t) * 0.024, y + Math.sin(t) * 0.026]); } faceFill(pts, xc, 0.004); }
  }

  // ---------------------------------------------------------------- things worn on the face
  tag('face:worn');
  const acc = a.accessory.id, ac = a.accessory.color || '#d8b040';
  const lensAt = s => { const x = eyeBone.x * s / H + eyeInfo[s > 0 ? 1 : 0].dx / H, y = eyeBone.y / H + eyeInfo[0].dy / H; return [x, y, faceZ(x, y) + 0.065]; };
  /**
   * OWNER REVIEW 2026-10-21 (H9-H11). Everything worn over the eyes is sized from THIS look's eyes (2.5 eyes are tall
   * ovals, and `eyes.height` makes them taller still): `EW`/`EH` are the eye's half-width / half-height in head units,
   * `eyeTop` its lid line. A frame is built in the eye's own turned plane (the eye bones are turned to the face, see
   * addEyelids), `inEye(s, u, v, w)` = the head-space point u across, v up and w out from eye s's centre.
   */
  const EW = rx / H, EH = Math.max(ry, spec.pivotY / 1.14) / H, Y0 = (eyeBone.y + eyeInfo[0].dy) / H;
  const inEye = (s, u, v, w) => { const ang = s * yaw0, [cx, cy] = lensAt(s), cz = faceZ(cx, cy); return [cx + Math.cos(ang) * u * s + Math.sin(ang) * w, cy + v, cz - Math.sin(ang) * u * s + Math.cos(ang) * w]; };
  /** a point on a band round the head at height y, bearing phi (0 = the front, + to the character's left/right as x), `out` past the skin */
  const round = (phi, y, out) => { const [, ex, ez] = ringAt(rings, y); return [Math.sin(phi) * (ex + out), y, Math.cos(phi) * (ez + out)]; };
  const OUT = 0.075;                                  // how far in front of the face a lens or patch sits (clears lids, lashes, wings)
  if (acc === 'glasses' || acc === 'round_glasses' || acc === 'sunglasses' || acc === 'monocle') {
    // H10: `glasses` are RECTANGULAR frames now (they were a torus of four segments turned 45 degrees and squashed — a
    // diamond whose corners met the arms at a slant). Every frame's arm leaves from the frame's own outer edge, runs back
    // level along the side of the head to the top of the ear and hooks down behind it.
    const rect = acc === 'glasses', fw = EW * (rect ? 1.32 : 1.22), fh = rect ? EH * 1.05 : Math.max(EW, EH) * 1.12, rr = 0.0075;
    for (const s of acc === 'monocle' ? [1] : [-1, 1]) {
      const c = 0.35;  // corner rounding (fraction of the shorter side)
      const loop = rect
        ? [[-1 + c * fh / fw, 1], [1 - c * fh / fw, 1], [1, 1 - c], [1, -1 + c], [1 - c * fh / fw, -1], [-1 + c * fh / fw, -1], [-1, -1 + c], [-1, 1 - c]].map(([u, v]) => [u * fw, v * fh])
        : Array.from({ length: 14 }, (_, i) => { const t = i / 14 * Math.PI * 2; return [Math.cos(t) * fw, Math.sin(t) * fh]; });
      const pts = [...loop, loop[0], loop[1]].map(([u, v]) => inEye(s, u, v, OUT));
      head(taperedCurve(pts, [rr, rr], 4, pts.length * 3), ac, { metal: true });
      if (acc === 'sunglasses') {   // a dark lens filling the frame, on the same plane
        const g = new THREE.BufferGeometry(), P = [], I = [], C = inEye(s, 0, 0, OUT - 0.002);
        P.push(...C); for (const [u, v] of loop) P.push(...inEye(s, u * 0.97, v * 0.97, OUT - 0.002));
        for (let i = 0; i < loop.length; i++) I.push(0, 1 + i, 1 + (i + 1) % loop.length);
        g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); g.computeVertexNormals();
        head(g, '#141418', { metal: true });
      }
      if (acc === 'monocle') { const [x, y, z] = inEye(s, 0, -fh, OUT); head(taperedCurve([[x, y, z], [x + 0.05, y - 0.15, z - 0.02], [0.12, -0.05, faceZ(0.12, 0.0) - 0.02]], [0.003, 0.003, 0.003], 3, 8), '#d8b040', { metal: true }); continue; }
      // the arm: hinge at the frame's outer edge, level back past the temple, over the top of the ear, down behind it
      const hinge = inEye(s, fw, fh * 0.35, OUT), yArm = Math.max(hinge[1], 0.33), ex = ringAt(rings, yArm)[1];
      head(taperedCurve([inEye(s, fw - 0.01, fh * 0.35, OUT), hinge, [s * (ex + 0.03), (hinge[1] + yArm) / 2, hinge[2] - 0.07], [s * (ex + 0.025), yArm, 0.0], [s * (ex + 0.015), yArm - 0.02, -0.07], [s * (ex + 0.0), yArm - 0.08, -0.1]], [rr, rr, rr, rr, rr * 0.9, rr * 0.8], 4, 16), ac, { metal: true });
    }
    if (acc !== 'monocle') { const l = inEye(-1, fw, fh * 0.45, OUT), r = inEye(1, fw, fh * 0.45, OUT); head(taperedCurve([l, [0, (l[1] + r[1]) / 2 + 0.012, faceZ(0, l[1]) + 0.03], r], [rr, rr, rr], 4, 8), ac, { metal: true }); }
  }
  if (acc === 'goggles') {
    // H11: the cups are sized to the eyes and reach back to the skin (they floated 3 cm off it), and a broad strap runs
    // from each cup's outer side round the back of the head, above the ears
    const cr = Math.max(EW, EH) * 1.18, glass = '#a9d3dc', leatherC = '#4a3a2a';
    for (const s of [-1, 1]) {
      const C = inEye(s, 0, 0, OUT), B = inEye(s, 0, 0, -0.01), d = new THREE.Vector3(C[0] - B[0], C[1] - B[1], C[2] - B[2]), L = d.length();
      const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
      head(new THREE.CylinderGeometry(cr, cr * 1.08, L, 12), '#6a5a3a', { position: [(C[0] + B[0]) / 2, (C[1] + B[1]) / 2, (C[2] + B[2]) / 2], rotation: [e.x, e.y, e.z], metal: true });
      head(new THREE.TorusGeometry(cr, 0.012, 4, 14), '#8a7a4a', { position: C, rotation: [e.x + Math.PI / 2, e.y, e.z], metal: true });
      const lens = new THREE.CircleGeometry(cr * 0.86, 12); lens.rotateX(-Math.PI / 2);
      head(lens, glass, { position: inEye(s, 0, 0, OUT + 0.003), rotation: [e.x, e.y, e.z], metal: true });
    }
    const yS = Y0 + 0.02, yB = Math.max(yS, 0.34), side = phi => Math.abs(Math.sin(phi));
    const strap = [inEye(1, Math.max(EW, EH) * 1.1, 0, 0.03)];
    for (let k = 0; k <= 16; k++) { const phi = 0.95 + k / 16 * (2 * Math.PI - 1.9); strap.push(round(phi, yS + (yB - yS) * Math.min(1, side(phi) * 1.6 + (1 - Math.abs(Math.cos(phi / 2))) * 0.5), 0.03)); }
    strap.push(inEye(-1, Math.max(EW, EH) * 1.1, 0, 0.03));
    head(taperedCurve(strap, [0.02, 0.02], 4, 40), leatherC, { scale: [1, 1, 1] });
  }
  if (acc === 'eyepatch') {
    // H9: a domed patch sized to THIS eye (it was a fixed 0.095 x 0.085 lens; 2.5 eyes are taller ovals and showed above
    // and below it), sitting off the face far enough to clear the lid and lashes, edge down on the skin; and a strap:
    // from the patch out over the ear, round the back, and across the forehead back to the patch
    // built over eye +1, then MIRRORED onto PATCH_SIDE (-1, the character's left — the eye the 2D picture patches)
    const s = 1, pw = EW * 1.38, ph = EH * 1.3, N = 16, P = [], I = [];
    const at = (u, v, lift) => { const p = inEye(s, u, v, 0), x = p[0], y = p[1]; return [x, y, faceZ(x, y) + lift]; };
    P.push(...at(0, 0, OUT + 0.01));
    for (const k of [0.6, 1]) for (let i = 0; i < N; i++) { const t = i / N * Math.PI * 2, u = Math.cos(t) * pw * k, v = Math.sin(t) * ph * k; P.push(...at(u, v, k === 1 ? 0.006 : OUT)); }
    for (let i = 0; i < N; i++) { const j = (i + 1) % N; I.push(0, 1 + i, 1 + j, 1 + i, 1 + N + i, 1 + N + j, 1 + i, 1 + N + j, 1 + j); }
    const mx = PATCH_SIDE < 0 ? -1 : 1;
    for (let i = 0; i < P.length; i += 3) P[i] *= mx;
    if (mx < 0) for (let i = 0; i < I.length; i += 3) [I[i + 1], I[i + 2]] = [I[i + 2], I[i + 1]];
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); g.computeVertexNormals();
    head(g, '#1a1a1a');
    const yHi = Math.max(browTop + 0.03, Y0 + EH + 0.06), yEar = 0.34, strap = [at(pw * 0.9, ph * 0.3, 0.012)];
    const p0 = Math.atan2(strap[0][0], strap[0][2]);
    for (let k = 1; k <= 22; k++) {          // round the patch's side, over the ear, the back, the far side, across the forehead
      const t = k / 22, phi = p0 + t * (2 * Math.PI - 0.12 - p0);
      strap.push(round(phi, t < 0.18 ? strap[0][1] + (yEar - strap[0][1]) * (t / 0.18) : t < 0.6 ? yEar : t < 0.78 ? yEar + (yHi - yEar) * ((t - 0.6) / 0.18) : yHi, 0.02));
    }
    strap.push(at(-pw * 0.5, ph * 0.95, 0.014));
    head(taperedCurve(strap.map(([x, y, z]) => [x * mx, y, z]), [0.011, 0.011], 4, 44), '#1a1a1a');
  }
  if (acc === 'blindfold') {
    // H9: the band covers both eyes whatever their height (tall ovals showed above and below the old fixed band), stands
    // off the face over the eyes and comes back to the skin at the temples, then a band round the back with a knot
    const yLo = Y0 - EH * 1.25 - 0.012, yHi = Y0 + EH * 1.2 + 0.015, ex = Math.abs(lensAt(1)[0]);
    const xe = 0.3;      // the cloth wraps to the temples; past them it is a tie, so it never meets the ears
    facePatch(-xe, xe, yLo, yHi, ac, 0.022, () => true, 26, 4, x => (OUT - 0.022) * Math.max(0, 1 - Math.max(0, Math.abs(x) - ex - EW - 0.04) / 0.05));   // full height over the eye AND its lash wing
    const yc = (yLo + yHi) / 2, yTie = Math.max(0.36, yc), [, , bz] = ringAt(rings, yTie);
    const tie = [];
    for (let k = 0; k <= 20; k++) {           // from one temple, up over the ear, round the back, down to the other temple
      const phi = 1.12 + k / 20 * (2 * Math.PI - 2.24), up = Math.min(1, Math.abs(Math.sin(phi)) * 1.4 + (k > 3 && k < 17 ? 1 : 0));
      tie.push(round(phi, yc + (yTie - yc) * up, 0.018));
    }
    head(taperedCurve(tie, [Math.min(0.03, (yHi - yLo) * 0.3), 0.022, 0.022, Math.min(0.03, (yHi - yLo) * 0.3)], 4, 40), ac);
    head(sphere(), shade(ac, -0.1), { position: [0, yTie, -(bz + 0.035)], scale: [0.04, 0.035, 0.03] });
    for (const s of [-1, 1]) head(taperedCurve([[s * 0.01, yTie, -(bz + 0.035)], [s * 0.05, yTie - 0.08, -(bz + 0.045)], [s * 0.06, yTie - 0.16, -(bz + 0.02)]], [0.025, 0.02, 0.004], 3, 5), ac);
  }
  if (acc === 'mask' || acc === 'scarf_mask') facePatch(-0.3, 0.3, -0.02, noseY + 0.02, ac, 0.018, () => true, 12, 5, (x, y) => (noseY - y) * 0.05 + Math.max(0, nsk[2] * 0.9 - Math.abs(x) * 0.5));
  if (acc === 'nose_ring') head(new THREE.TorusGeometry(0.02, 0.005, 4, 10), '#d8b040', { position: [nsk[0] * 0.3, noseBottom + 0.005, faceZ(0, noseY) + nsk[2] * 0.8], metal: true });

  return { faceZ, rings, mouthY, noseY, browTop, eyes: spec };
}
