// Kestrel (fable) — the head: a sculpted skull, eyes (white / iris / pupil / highlight / lash line / lids), brows,
// nose, lips with a dark interior and teeth behind them, ears. Authored in HEAD bone space (origin at the skull
// base, just above the chin; +z is the face). The eye / brow / mouth-corner bones are placed here on the skull
// surface, and `EXPRESSIONS` says how each of the mockup's six faces moves them.
import * as THREE from 'three';
import { loft, ringX, ringY, blob, disc, band, sheet, mirrorX, lerp, clamp, sstep, gauss, adist, shade, mix, TAU } from './geometry.js';

const PI = Math.PI, HALF = PI / 2, FRONT = HALF, BACK = 3 * HALF;

/** The skull: centre, radii and the sculpt, as functions so the face features can ask where the surface is. */
export function skullSpec(d) {
  const f = d.fem, hk = lerp(1, d.hk, 0.5);
  const top = d.headTop - (d.chin + 0.03 * d.hk);           // head-local y of the skull top
  const cy = top - 0.125 * hk, cz = 0.004;
  const rx = d.headRX * 1.07, ry = 0.109 * hk, rz = d.headRZ;
  // radial multipliers by direction (th: 0 = +x, PI/2 = +z face; phi: 0 top .. PI bottom)
  function radial(th, phi) {
    const front = gauss(adist(th, FRONT), 0.75), back = gauss(adist(th, BACK), 0.8);
    const sideL = gauss(adist(th, 0), 0.5), sideR = gauss(adist(th, PI), 0.5);
    let kx = 1, ky = 1, kz = 1, k = 1;
    const low = sstep(phi, 0.5 * PI, 0.98 * PI);
    kx *= 1 - (f ? 0.3 : 0.18) * low * low;                                         // the jaw narrows toward the chin
    kx *= 1 - 0.06 * gauss(phi - 0.38 * PI, 0.12) * (sideL + sideR);                 // temples
    kz *= 1 - 0.32 * sstep(phi, 0.55 * PI, 0.95 * PI) * back;                        // the nape tucks under
    kz *= 1 - 0.06 * front * gauss(phi - 0.5 * PI, 0.3);                              // the face is flatter than a ball
    kz += (f ? 0.07 : 0.09) * gauss(adist(th, FRONT), 1.0) * gauss(phi - 0.84 * PI, 0.13);   // chin (broad)
    kz += (f ? 0.015 : 0.03) * front * gauss(phi - 0.40 * PI, 0.07);                 // brow ridge
    kz -= 0.025 * (gauss(adist(th, FRONT - 0.36), 0.2) + gauss(adist(th, FRONT + 0.36), 0.2)) * gauss(phi - 0.46 * PI, 0.08);   // eye sockets
    k += (f ? 0.03 : 0.035) * (gauss(adist(th, FRONT - 0.66), 0.28) + gauss(adist(th, FRONT + 0.66), 0.28)) * gauss(phi - 0.56 * PI, 0.1);  // cheekbones
    k -= 0.02 * (gauss(adist(th, FRONT - 0.75), 0.3) + gauss(adist(th, FRONT + 0.75), 0.3)) * gauss(phi - 0.7 * PI, 0.09) * (f ? 0.6 : 1);   // under the cheekbone
    kz += 0.05 * back * gauss(phi - 0.42 * PI, 0.22);                                 // occiput
    ky *= 1 - 0.03 * gauss(phi, 0.3);                                                  // slightly flat crown
    ky *= 1 - (f ? 0.1 : 0.11) * sstep(phi, 0.8 * PI, PI) * (0.4 + 0.6 * front);        // a flat chin, not a point
    k += (f ? 0.03 : 0.07) * (gauss(adist(th, FRONT - 0.7), 0.35) + gauss(adist(th, FRONT + 0.7), 0.35)) * gauss(phi - 0.78 * PI, 0.11);   // jaw corners
    return [rx * kx * k, ry * ky * k, rz * kz * k];
  }
  /** Surface point (head-local) in direction (x, y, z) from the skull centre. */
  function surf(dx, dy, dz) {
    const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
    const phi = Math.acos(clamp(dy, -1, 1)), th = Math.atan2(dz, dx);
    const r = radial(th < 0 ? th + TAU : th, phi);
    return [cx(dx * r[0]), cy + dy * r[1], cz + dz * r[2]];
  }
  const cx = v => v;
  /** Surface point under a head-local (x, y) on the face, looking from the front. */
  function faceAt(x, y) {
    // solve for the direction whose surface point has this x, y (two passes are plenty)
    let dx = x, dy = y - cy, dz = rz;
    for (let i = 0; i < 3; i++) { const p = surf(dx, dy, dz); dx += (x - p[0]) * 0.9; dy += (y - p[1]) * 0.9; }
    return surf(dx, dy, dz);
  }
  function normalAt(x, y) { const p = faceAt(x, y); const n = [p[0], p[1] - cy, p[2] - cz]; const l = Math.hypot(...n) || 1; return n.map(v => v / l); }
  return { cy, cz, rx, ry, rz, top, radial, surf, faceAt, normalAt };
}

/** Where the features sit (head-local), per form. */
export function faceSpec(d) {
  const f = d.fem, hk = lerp(1, d.hk, 0.5);
  return {
    eyeX: (f ? 0.033 : 0.034) * hk, eyeY: (f ? 0.095 : 0.093) * hk, eyeW: (f ? 0.025 : 0.0215) * hk, eyeH: f ? 0.72 : 0.62, eyeTilt: f ? 0.1 : 0.07,
    irisR: (f ? 0.74 : 0.7), pupilR: 0.42, browY: (f ? 0.117 : 0.11) * hk, browX: 0.034 * hk,
    noseTop: 0.074 * hk, noseTip: (f ? 0.052 : 0.049) * hk, noseBase: (f ? 0.044 : 0.041) * hk, noseW: (f ? 0.0082 : 0.011) * hk,
    mouthY: (f ? 0.014 : 0.012) * hk, mouthW: (f ? 0.019 : 0.022) * hk, lipFull: f ? 1.1 : 0.9,
    earY: 0.082 * hk, earZ: -0.012,
  };
}

/** Build the whole head. Returns pieces (in head space) and places the face bones on the rig. */
export function buildHead(rig, look, detail) {
  const d = rig.d, S = skullSpec(d), F = faceSpec(d), pieces = [];
  const skin = d.skin, f = d.fem;
  const lipC = look.mouth?.color || (f ? '#c0716a' : '#b06a5e');
  const browC = look.brows?.color || shade(look.hair?.color || '#3a2417', 0.8);
  const irisC = look.eyes?.color || '#4a2a16';
  const headW = () => [['head', 1]];
  // ---- skull. Lower-front vertices follow the jaw bone a little so an open mouth drops the chin.
  const jawW = (x, y, z) => {
    const k = sstep(0.045 - y, 0, 0.05) * sstep(z, -0.03, 0.03) * 0.9;
    return k > 0.01 ? [['head', 1 - k], ['jaw', k]] : [['head', 1]];
  };
  const skinAO = (x, y, z) => {
    // soft shading painted into the skin: under the chin / jaw, the eye sockets, a touch of blush on the cheeks
    let k = 1;
    k -= 0.10 * sstep(-y, 0.0, 0.04) * sstep(z, -0.02, 0.05);                       // under the jaw
    k -= 0.05 * gauss(Math.hypot(Math.abs(x) - F.eyeX, y - F.eyeY - 0.004), 0.016);  // socket shadow
    let c = shade(skin, k);
    const blush = (f ? 0.22 : 0.08) * gauss(Math.hypot(Math.abs(x) - F.eyeX - 0.008, y - F.eyeY + 0.036), 0.022);
    if (blush > 0.01) c = mix(c, '#e07a6a', blush);
    return c;
  };
  pieces.push(shiftBlob(blob(detail ? 20 : 12, detail ? 28 : 16, (th, phi) => S.radial(th, phi), headW(), { tag: 'skull', skinAt: (x, y, z) => jawW(x, y + S.cy, z + S.cz), colorAt: (x, y, z) => skinAO(x, y + S.cy, z + S.cz), color: skin }), S.cy, S.cz));
  // ---- eyes
  for (const [s, sg] of [['L', -1], ['R', 1]]) {
    const ex = sg * F.eyeX, ey = F.eyeY;
    const p = S.faceAt(ex, ey), n = S.normalAt(ex, ey);
    // the eye faces mostly forward: blend the surface normal toward +z
    const dir = new THREE.Vector3(n[0] * 0.5, n[1] * 0.6, n[2]).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    rig.placeHeadBone('eye' + s, [p[0], p[1] + 0.0, p[2] - 0.003], q);
    const eyeW = () => [['eye' + s, 1]];
    const w = F.eyeW, h = F.eyeH;
    const tilt = sg * F.eyeTilt;                                     // outer corner a touch higher
    const outline = (a) => {
      const aa = a - tilt;
      const c = Math.cos(aa), sn = Math.sin(aa);
      const r = 1 / Math.sqrt(c * c + (sn / h) * (sn / h));
      // fuller upper lid, the inner corner (toward the nose: -sg x) drawn in and a little down
      const inner = sg > 0 ? gauss(adist(aa, PI), 0.5) : gauss(adist(aa, 0), 0.5);
      return r * (1 + 0.16 * Math.max(0, sn) - 0.12 * inner * Math.max(0, -sn) ) * (1 - 0.1 * inner);
    };
    const segs = detail ? 24 : 12;
    const white = (a, t) => shade('#f3eee8', 1 - 0.18 * t * t * Math.max(0, Math.sin(a - tilt)) - 0.06 * t);   // the upper lid's shadow on the white
    pieces.push(placeEye(disc(w, segs, eyeW(), { outline, colorAt: white, dome: 0.0035, rings: 2 }), rig, 'eye' + s, 0));
    const ir = w * h * F.irisR;
    const irisAt = (a, t) => t < 0.15 ? shade(irisC, 0.55) : mix(shade(irisC, 1.25), shade(irisC, 0.5), sstep(t, 0.35, 1));
    pieces.push(placeEye(disc(ir, detail ? 20 : 10, [['pupil' + s, 1]], { colorAt: irisAt, rings: 2, z: 0.0036, dome: 0.0008 }), rig, 'eye' + s, 0, [0, ir * 0.08, 0]));
    pieces.push(placeEye(disc(ir * F.pupilR, detail ? 14 : 8, [['pupil' + s, 1]], { color: '#120c0a', z: 0.0048 }), rig, 'eye' + s, 0, [0, ir * 0.08, 0]));
    pieces.push(placeEye(disc(ir * 0.3, 8, [['pupil' + s, 1]], { color: '#ffffff', z: 0.0056 }), rig, 'eye' + s, 0, [ir * 0.42, ir * 0.48, 0]));
    pieces.push(placeEye(disc(ir * 0.14, 6, [['pupil' + s, 1]], { color: '#ffffff', z: 0.0056 }), rig, 'eye' + s, 0, [-ir * 0.36, -ir * 0.4, 0]));
    // lash line along the upper lid, thick at the outer end; a fine lower line
    const lashC = shade(browC, 0.55);
    const outerEnd = sg > 0 ? 0 : PI;
    pieces.push(placeEye(band(w * 1.03, segs, eyeW(), { outline, inner: 0.78, a0: 0.02 * PI, a1: 0.98 * PI, color: lashC, z: 0.004, thick: (t) => 0.5 + 0.9 * gauss((sg > 0 ? t : 1 - t) - 0.08, 0.2) }), rig, 'eye' + s, 0));
    if (detail) pieces.push(placeEye(band(w * 1.02, segs, eyeW(), { outline, inner: 0.93, a0: 1.08 * PI, a1: 1.92 * PI, color: shade(skin, 0.72), z: 0.0035 }), rig, 'eye' + s, 0));
    // the upper lid: skin-coloured, pivoting at the top edge of the eye (the `lid` bone), scale.y 0 = open .. 1 = shut
    const lidTop = w * outline(HALF + tilt) * Math.sin(HALF) ;
    rig.placeHeadBone('lid' + s, [0, lidTop + 0.001, 0.0062]);
    const lid = disc(w * 1.08, segs, [['lid' + s, 1]], { outline, color: shade(skin, 0.94), dome: 0.002, rings: 1 });
    for (let i = 0; i < lid.count; i++) lid.pos[i * 3 + 1] -= lidTop + 0.001;        // hang it from the pivot
    pieces.push(placeEye(lid, rig, 'eye' + s, 0, [0, lidTop + 0.001, 0]));
    if (detail) pieces.push(placeEye(band(w * 1.08, segs, [['lid' + s, 1]], { outline, inner: 0.8, a0: 1.05 * PI, a1: 1.95 * PI, color: lashC, z: 0.0066 }), rig, 'eye' + s, 0, [0, 0, 0], (pp) => { for (let i = 0; i < pp.count; i++) pp.pos[i * 3 + 1] -= lidTop + 0.001; return pp; }, [0, lidTop + 0.001, 0]));
    // ---- brow (right-handed; the left is the mirror of the same curve)
    const bx = sg * F.browX, by = F.browY;
    const bp = S.faceAt(bx, by);
    rig.placeHeadBone('brow' + s, [bp[0], bp[1], bp[2]]);
    const browRings = [];
    const nb = detail ? 9 : 5;
    for (let i = 0; i < nb; i++) {
      const t = i / (nb - 1);                                   // 0 inner .. 1 outer
      const x = bx + sg * lerp(-0.021, 0.026, t) * lerp(1, d.hk, 0.5);
      const arch = f ? 0.0085 * Math.sin(t * PI) * (1 - 0.3 * t) : 0.0035 * Math.sin(t * PI);
      const y = by + arch + (f ? 0.0 : -0.003) * (1 - t) + (f ? -0.002 : -0.004) * t;
      const sp = S.faceAt(x, y);
      const ry = lerp(f ? 0.004 : 0.0046, f ? 0.002 : 0.0026, t), rz = lerp(0.0028, 0.0018, t);
      browRings.push(ringX(x - bp[0], ry, rz, [['brow' + s, 1]], { y: y - bp[1], z: sp[2] - bp[2] + 0.002, n: 2.2 }));
    }
    pieces.push(placeIn(loft(browRings, detail ? 8 : 6, { capStart: true, capEnd: true, color: browC, tag: 'brow' }), rig, 'brow' + s));
  }
  // ---- nose: a loft down the bridge to the tip, flaring at the alae, tucked back into the face at the base
  {
    const nw = F.noseW, zAt = y => S.faceAt(0, y)[2];
    const keys = [
      [F.noseTop + 0.008, nw * 0.7, nw * 0.6, zAt(F.noseTop + 0.008) - 0.008, 2.0],
      [F.noseTop, nw * 0.7, nw * 0.7, zAt(F.noseTop) - 0.003, 2.0],
      [lerp(F.noseTop, F.noseTip, 0.5), nw * 0.78, nw * 0.85, zAt(lerp(F.noseTop, F.noseTip, 0.5)) + 0.003, 2.0],
      [F.noseTip + 0.005, nw * 1.05, nw * 1.1, zAt(F.noseTip) + 0.01, 2.1],
      [F.noseTip, nw * 1.25, nw * 1.15, zAt(F.noseTip) + 0.011, 2.2],
      [F.noseBase + 0.002, nw * 1.5, nw * 0.95, zAt(F.noseBase) + 0.007, 2.3],
      [F.noseBase - 0.003, nw * 1.0, nw * 0.6, zAt(F.noseBase) + 0.0, 2.2],
    ];
    const rings = keys.map(([y, rx, rz, z, n]) => ringY(y, rx, rz, headW(), { z: z - rz * 0.5, n }));
    const noseC = (x, y, z) => mix(skin, '#8a4a3a', 0.35 * sstep(F.noseBase + 0.004 - y, 0, 0.006));   // nostril shadow
    pieces.push(withColorAt(loft(rings, detail ? 12 : 8, { capStart: true, capEnd: true, tag: 'nose', color: skin }), noseC));
  }
  // ---- mouth
  {
    const mw = F.mouthW, my = F.mouthY, zAt = y => S.faceAt(0, y)[2];
    for (const [s, sg] of [['L', -1], ['R', 1]]) rig.placeHeadBone('mouth' + s, [sg * mw, my, zAt(my) + 0.001]);
    const cornerW = (x, lower) => {
      const t = sstep(Math.abs(x), mw * 0.45, mw * 0.98) * 0.9, c = x < 0 ? 'mouthL' : 'mouthR', base = lower ? 'jaw' : 'head';
      return t > 0.01 ? [[base, 1 - t], [c, t]] : [[base, 1]];
    };
    const lip = (lower) => {
      const rings = [], n = detail ? 11 : 7, full = F.lipFull;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1), x = lerp(-mw, mw, t), e = Math.sin(t * PI);
        const ry = (lower ? 0.0036 * full : 0.0032) * lerp(0.3, 1, e), rz = (lower ? 0.0046 : 0.0042) * lerp(0.3, 1, e);
        const bow = lower ? 0 : -0.0008 * gauss(t - 0.5, 0.1);
        const y = my + (lower ? -ry * 0.95 : ry * 0.95) + bow + (lower ? 0.0 : 0.0);
        const z = S.faceAt(x, y)[2] - rz * 0.35;
        rings.push(ringX(x, ry, rz, cornerW(x, lower), { y, z, n: 2.1 }));
      }
      const c = (x, y, z) => lower ? mix(lipC, skin, 0.45) : mix(shade(lipC, 0.85), skin, 0.3);
      return withColorAt(loft(rings, detail ? 8 : 6, { capStart: true, capEnd: true, color: lipC, tag: 'lip' }), c);
    };
    pieces.push(lip(false), lip(true));
    // the inside of the mouth (dark) and a strip of teeth behind the upper lip; the lower edge follows the jaw
    const zin = zAt(my) - 0.004;
    pieces.push(sheet(6, 2, (u, v) => {
      const x = lerp(-mw * 0.92, mw * 0.92, u), e = Math.sin(u * PI);
      const y = my + lerp(-0.006, 0.006, v) * lerp(0.2, 1, e);
      return { p: [x, y, zin - 0.002 * (1 - e)], w: v > 0.5 ? cornerW(x, false) : (v < 0.5 ? cornerW(x, true) : [['head', 0.5], ['jaw', 0.5]]), c: '#2a0f0d' };
    }, { color: '#2a0f0d' }));
    pieces.push(sheet(6, 1, (u, v) => {
      const x = lerp(-mw * 0.8, mw * 0.8, u), e = Math.sin(u * PI);
      return { p: [x, my + lerp(-0.0015, 0.0035, v) * lerp(0.3, 1, e), zin + 0.0012 - 0.002 * (1 - e)], w: [['head', 1]], c: '#f1ebe0' };
    }, { color: '#f1ebe0' }));
  }
  // ---- ears
  for (const [s, sg] of [['L', -1], ['R', 1]]) {
    const ex = S.rx * 0.9, ey = F.earY, ez = F.earZ;
    const rings = [];
    const k = detail ? 1 : 1;
    const shape = (ry, rz, x, dz = 0, notch = 0) => ringX(sg * x, ry, rz, headW(), { y: ey, z: ez + dz, n: 2.1, f: notch ? (a) => 1 - notch * gauss(adist(a, HALF - 0.4), 0.55) : null });
    rings.push(shape(0.022, 0.014, ex - 0.012, 0.003));
    rings.push(shape(0.027, 0.017, ex + 0.004, 0.0, 0.0));
    rings.push(shape(0.028, 0.0175, ex + 0.012, -0.002, 0.3));
    rings.push(shape(0.022, 0.014, ex + 0.017, -0.004, 0.45));
    rings.push(shape(0.014, 0.009, ex + 0.019, -0.005, 0.5));
    const ear = loft(rings, detail ? 10 : 6, { capStart: true, capEnd: true, tag: 'ear', color: skin });
    pieces.push(withColorAt(ear, (x, y, z) => shade(skin, 0.9 + 0.15 * sstep(Math.abs(x), ex + 0.004, ex + 0.016))));
  }
  return pieces;
}

function shiftBlob(p, cy, cz) { for (let i = 0; i < p.count; i++) { p.pos[i * 3 + 1] += cy; p.pos[i * 3 + 2] += cz; } return p; }
function withColorAt(p, fn) { p.colorAt = fn; return p; }

/** Move an eye-space piece into head space through the eye bone's rest transform (position + rotation + offset). */
function placeEye(p, rig, boneName, _unused, offset = [0, 0, 0], pre = null, post = [0, 0, 0]) {
  if (pre) p = pre(p);
  const b = rig.byName[boneName];
  const m = new THREE.Matrix4().compose(b.position.clone(), b.quaternion.clone(), new THREE.Vector3(1, 1, 1));
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.pos[i * 3] + offset[0] + post[0], p.pos[i * 3 + 1] + offset[1] + post[1], p.pos[i * 3 + 2] + offset[2] + post[2]).applyMatrix4(m);
    p.pos[i * 3] = v.x; p.pos[i * 3 + 1] = v.y; p.pos[i * 3 + 2] = v.z;
  }
  return p;
}
/** Move a bone-space piece into head space by the bone's rest position (no rotation: brows, mouth corners). */
function placeIn(p, rig, boneName) {
  const b = rig.byName[boneName];
  for (let i = 0; i < p.count; i++) { p.pos[i * 3] += b.position.x; p.pos[i * 3 + 1] += b.position.y; p.pos[i * 3 + 2] += b.position.z; }
  return p;
}

/**
 * The six expressions as offsets on the face bones: position in metres (head-local axes), rotation in radians,
 * `lid` 0..1 (squint), `eyeScale` (wide eyes), `jaw` 0..1 (open), `head` [x, y, z] tilt.  Blended by weight.
 */
export const EXPRESSIONS = {
  neutral: {},
  happy: { mouthL: { p: [-0.006, 0.009, 0.002] }, mouthR: { p: [0.006, 0.009, 0.002] }, browL: { p: [0, 0.003, 0] }, browR: { p: [0, 0.003, 0] }, lid: 0.38, jaw: 0.3 },
  sad: { browL: { p: [0.002, 0.004, 0], r: [0, 0, -0.32] }, browR: { p: [-0.002, 0.004, 0], r: [0, 0, 0.32] }, mouthL: { p: [0.001, -0.005, 0] }, mouthR: { p: [-0.001, -0.005, 0] }, lid: 0.32, jaw: 0.0, head: [0.05, 0, 0] },
  angry: { browL: { p: [0.004, -0.007, 0], r: [0, 0, 0.5] }, browR: { p: [-0.004, -0.007, 0], r: [0, 0, -0.5] }, mouthL: { p: [0.002, -0.005, 0] }, mouthR: { p: [-0.002, -0.005, 0] }, lid: 0.36, jaw: 0.12, head: [0.06, 0, 0] },
  surprised: { browL: { p: [0, 0.011, 0] }, browR: { p: [0, 0.011, 0] }, mouthL: { p: [0.004, -0.003, 0] }, mouthR: { p: [-0.004, -0.003, 0] }, eyeScale: 1.22, jaw: 0.62 },
  confused: { browL: { p: [0, -0.002, 0], r: [0, 0, 0.18] }, browR: { p: [0, 0.0085, 0], r: [0, 0, -0.1] }, mouthL: { p: [0.001, -0.004, 0] }, mouthR: { p: [0.001, 0.0025, 0] }, lid: 0.12, jaw: 0.06, head: [0.02, 0, 0.1] },
};
export const EXPRESSION_NAMES = Object.keys(EXPRESSIONS);
