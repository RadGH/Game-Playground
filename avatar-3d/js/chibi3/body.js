// Chibi 3 anatomy: the bare body as one distance field. No Three.js.
//
// Built from about ninety primitives blended with smooth minimums: a ribcage, pelvis and belly; the
// muscles that give a heroic silhouette its read (pecs, deltoids, traps, lats, biceps, triceps,
// forearm, quads, hamstrings, calves); a head with a real skull, brow ridge, cheekbones, jaw, nose,
// lips, ears and eye sockets; and hands with four fingers and a thumb.
//
// Every primitive carries a PAINT naming its bone, which is how the skin weights find their owner.
// The muscle and fat dials change the sizes here; the race changes both and the face shaping.

import { Shape, sphere, ellipsoid, cone, roundBox, torus, almond, custom, smoothstep } from './sdf.js';
import { dial } from './races.js';
import { TILE } from './paint.js';

/** Face and body numbers after race + dials. */
export function faceParams(avatar, P) {
  const f = P.race.face, D = (k, base, spread) => dial(avatar, k, base, spread);
  return {
    jaw: D('jaw', f.jaw, 0.22), chin: D('chin', f.chin, 0.3), brow: Math.max(0, D('brow', f.brow, 0.5)),
    cheek: D('cheek', f.cheek, 0.4), nose: D('nose', f.nose, 0.3), noseWidth: D('noseWidth', f.noseWidth, 0.3),
    bridge: D('noseBridge', 1, 0.4), lips: D('lips', f.lips, 0.4), mouthWidth: D('mouthWidth', 1, 0.15),
    eye: D('eyeSize', f.eye, 0.18), tilt: D('eyeTilt', 0, 0.25), ear: D('ear', f.ear, 0.3), earPoint: Math.max(0, D('earPoint', f.earPoint, 0.8)),
    tusks: f.tusks, hollow: f.hollow, muzzle: f.muzzle, age: Math.max(0, D('age', 0, 1)),
  };
}

/**
 * Build the body shape. `R` is layoutRig()'s result, `colors` { skin, lips, nails, mouth, brow }.
 * Returns { shape, F (face params), eyes: [{ side, center, radius }], mouthY, hs }.
 */
export function buildBody(avatar, R, colors) {
  const P = R.P, S = P.S, W = P.width, m = P.muscle, f = P.fat, Hd = P.hand;
  const J = n => R.byName[n].pos;
  const F = faceParams(avatar, P);
  const shape = new Shape([], { name: 'body' });
  const skinPaint = bone => ({ ...colors.skinPaint, bone });
  const add = (prim, bone, k) => shape.add(Object.assign(prim, { k: prim.k ?? k, paint: prim.paint || skinPaint(bone) }));
  const sub = (prim, k, paint = null) => shape.add(Object.assign(prim, { op: 'sub', k, paint }));
  const paintOnly = (prim, paint, band = 0.003) => shape.add(Object.assign(prim, { op: 'paint', paint, band }));
  const mus = (lo, hi) => lo + (hi - lo) * m;
  const pelvisY = R.pelvisY, spineY = R.spineY, chestY = R.chestY, neckY = R.neckY, headY = R.headY, shY = R.shoulderY;
  const shX = R.shoulderX;

  // ------------------------------------------------------------------ torso
  add(ellipsoid([0, pelvisY - 0.015 * S, -0.012 * S], [0.152 * W * S * (1 + 0.22 * f), 0.1 * S, 0.105 * S * (1 + 0.18 * f)]), 'pelvis', 0.04 * S);
  for (const s of [1, -1]) add(ellipsoid([s * 0.068 * W * S, pelvisY - 0.05 * S, -0.068 * S], [0.078 * S * (1 + 0.3 * f), 0.092 * S, 0.072 * S * (1 + 0.3 * f)]), 'pelvis', 0.03 * S);
  add(ellipsoid([0, spineY - 0.01 * S, 0.012 * S + f * 0.035 * S], [0.128 * W * S * (1 + 0.3 * f), 0.13 * S, (0.092 + 0.075 * f) * S]), 'spine', 0.05 * S);
  add(ellipsoid([0, chestY + 0.06 * S, 0.004 * S], [0.148 * W * S * mus(0.98, 1.08), 0.175 * S, 0.112 * S]), 'chest', 0.05 * S);
  add(ellipsoid([0, chestY + 0.05 * S, -0.045 * S], [0.172 * W * S * mus(0.9, 1.1), 0.15 * S, 0.08 * S]), 'chest', 0.04 * S);
  // pectorals: flatter and higher on a lean body, full slabs on a muscular one
  // (wide and flat, high on the ribcage: rounder and lower reads as a bust, not a chest)
  for (const s of [1, -1]) add(ellipsoid([s * 0.074 * W * S, chestY + 0.118 * S, 0.064 * S + m * 0.01 * S], [0.088 * S * mus(0.88, 1.08), 0.052 * S * mus(0.85, 1.05), 0.034 * S * mus(0.6, 1.0)], { rot: [0.3, 0, s * 0.18] }), 'chest', 0.026 * S);
  // abdominal wall with a soft six-pack on muscular bodies (a paint-free displacement below)
  for (const s of [1, -1]) {
    add(cone([s * 0.04 * S, neckY + 0.015 * S, -0.04 * S], [s * shX * 0.85, shY + 0.008 * S, -0.035 * S], 0.034 * S * mus(0.7, 1.25), 0.028 * S), 'chest', 0.035 * S);   // trapezius
    add(cone([s * 0.018 * S, shY - 0.004 * S, 0.062 * S], [s * shX * 0.86, shY + 0.012 * S, 0.012 * S], 0.015 * S, 0.016 * S), 'clav' + (s > 0 ? 'L' : 'R'), 0.02 * S);  // collarbone
    // serratus/obliques: the taper from chest to waist
    add(ellipsoid([s * 0.12 * W * S, spineY + 0.08 * S, 0.0], [0.05 * S, 0.12 * S, 0.075 * S], { rot: [0, 0, s * 0.15] }), 'spine', 0.05 * S);
  }
  // neck, with the two straps that run from behind the ears to the collarbones
  const neckThick = (0.8 + 0.4 * m) * (1 + (P.race.body.neck - 1) * 0.6);
  add(cone([0, neckY - 0.04 * S, -0.012 * S], [0, headY + 0.03 * S, -0.03 * S], 0.058 * S * neckThick, 0.047 * S * neckThick), 'neck', 0.025 * S);
  for (const s of [1, -1]) add(cone([s * 0.045 * S, headY + 0.015 * S, -0.012 * S], [s * 0.016 * S, neckY - 0.008 * S, 0.05 * S], 0.015 * S * mus(0.8, 1.2), 0.013 * S), 'neck', 0.018 * S);

  // ------------------------------------------------------------------ arms
  for (const [s, side] of [[1, 'L'], [-1, 'R']]) {
    const sh = J('upperArm' + side), el = J('foreArm' + side), wr = J('hand' + side);
    const dir = norm(sub3(el, sh)), fdir = norm(sub3(wr, el));
    const along = (p, d, t) => [p[0] + d[0] * t, p[1] + d[1] * t, p[2] + d[2] * t];
    const tilt = Math.atan2(dir[0], -dir[1]);   // rotation about z that lays a box along the arm
    // deltoid: caps the shoulder; a big one is what makes the silhouette heroic
    add(ellipsoid(add3(along(sh, dir, 0.045 * S), [s * 0.016 * S, 0.012 * S, 0]), [0.058 * S * mus(0.8, 1.2), 0.088 * S * mus(0.85, 1.1), 0.064 * S * mus(0.8, 1.2)], { rot: [0, 0, tilt] }), 'upperArm' + side, 0.035 * S);
    add(cone(along(sh, dir, 0.02 * S), el, 0.047 * S * mus(0.85, 1.12) * (1 + 0.15 * f), 0.037 * S), 'upperArm' + side, 0.03 * S);
    add(ellipsoid(add3(along(sh, dir, 0.165 * S), [0, 0, 0.022 * S]), [0.031 * S * mus(0.7, 1.25), 0.072 * S, 0.033 * S * mus(0.7, 1.3)], { rot: [0, 0, tilt] }), 'upperArm' + side, 0.022 * S);   // biceps
    add(ellipsoid(add3(along(sh, dir, 0.135 * S), [s * 0.004 * S, 0, -0.026 * S]), [0.035 * S * mus(0.75, 1.2), 0.085 * S, 0.031 * S * mus(0.75, 1.2)], { rot: [0, 0, tilt] }), 'upperArm' + side, 0.022 * S);  // triceps
    add(sphere(add3(el, [0, 0, -0.008 * S]), 0.031 * S), 'foreArm' + side, 0.025 * S);
    add(cone(along(el, fdir, 0.015 * S), wr, 0.04 * S * mus(0.88, 1.15), 0.025 * S * Hd, { squash: [0.82, 1.12] }), 'foreArm' + side, 0.025 * S);
    add(ellipsoid(add3(along(el, fdir, 0.06 * S), [s * 0.008 * S, 0, 0.008 * S]), [0.034 * S * mus(0.8, 1.2), 0.07 * S, 0.038 * S * mus(0.8, 1.2)], { rot: [0, 0, tilt] }), 'foreArm' + side, 0.022 * S);
    buildHand(add, paintOnly, R, side, s, S * Hd, colors);
  }

  // ------------------------------------------------------------------ legs
  for (const [s, side] of [[1, 'L'], [-1, 'R']]) {
    const hp = J('thigh' + side), kn = J('shin' + side), an = J('foot' + side), toe = J('toe' + side);
    const tdir = norm(sub3(kn, hp)), along = (p, d, t) => [p[0] + d[0] * t, p[1] + d[1] * t, p[2] + d[2] * t];
    add(cone(add3(hp, [s * 0.01 * S, 0.02 * S, 0]), kn, 0.083 * S * mus(0.88, 1.1) * (1 + 0.3 * f), 0.05 * S), 'thigh' + side, 0.045 * S);
    add(ellipsoid(add3(along(hp, tdir, 0.22 * S), [s * 0.005 * S, 0, 0.034 * S]), [0.052 * S * mus(0.8, 1.15), 0.15 * S, 0.048 * S * mus(0.8, 1.2)]), 'thigh' + side, 0.035 * S);   // quadriceps
    add(ellipsoid(add3(along(hp, tdir, 0.12 * S), [-s * 0.035 * S, 0, 0.005 * S]), [0.05 * S, 0.11 * S, 0.058 * S]), 'thigh' + side, 0.04 * S);   // inner thigh
    add(ellipsoid(add3(along(hp, tdir, 0.2 * S), [0, 0, -0.035 * S]), [0.055 * S, 0.14 * S, 0.045 * S * mus(0.85, 1.1)]), 'thigh' + side, 0.035 * S);   // hamstrings
    add(sphere(add3(kn, [0, 0.005 * S, 0]), 0.045 * S), 'shin' + side, 0.03 * S);
    add(ellipsoid(add3(kn, [0, 0.012 * S, 0.042 * S]), [0.024 * S, 0.028 * S, 0.014 * S]), 'shin' + side, 0.015 * S);    // kneecap
    add(cone(kn, an, 0.048 * S, 0.031 * S), 'shin' + side, 0.03 * S);
    add(ellipsoid(add3(kn, [0, -0.11 * S, -0.032 * S]), [0.044 * S * mus(0.85, 1.15), 0.1 * S, 0.042 * S * mus(0.8, 1.2)]), 'shin' + side, 0.03 * S);   // calf
    for (const t of [1, -1]) add(sphere(add3(an, [t * 0.022 * S, 0.002 * S, -0.002 * S]), 0.016 * S), 'foot' + side, 0.012 * S);  // ankle bones
    // foot: heel, arch and the ball; toes on their own bone
    add(sphere([an[0], 0.032 * S, an[2] - 0.035 * S], 0.033 * S), 'foot' + side, 0.03 * S);
    add(roundBox([an[0] + s * 0.003 * S, 0.034 * S, (an[2] + toe[2]) / 2 - 0.005 * S], [0.034 * S, 0.026 * S, 0.075 * S], 0.022 * S, { rot: [0.12, 0, 0] }), 'foot' + side, 0.03 * S);
    add(roundBox([toe[0] + s * 0.004 * S, 0.018 * S, toe[2] + 0.028 * S], [0.038 * S, 0.014 * S, 0.034 * S], 0.013 * S), 'toe' + side, 0.018 * S);
  }

  // ------------------------------------------------------------------ head
  // Head units: chin (-0.18) to crown (0.82) is 1. The head joint sits at the top of the neck, at
  // mouth height, so a nod turns about the right place. +z is the way the face looks.
  //   brow line 0.43, eye line 0.335, nose base 0.135, mouth 0.055, chin -0.18
  const hs = R.hs, hz = J('head')[2];
  const H = (x, y, z) => [x * hs, headY + y * hs, hz + z * hs];
  const head = (prim, k, bone = 'head') => add(prim, bone, k * hs);
  const carve = (prim, k, p = null) => sub(prim, k * hs, p);
  const mz = F.muzzle;
  head(ellipsoid(H(0, 0.47, -0.1), [0.315 * hs, 0.36 * hs, 0.405 * hs]), 0.05);                         // cranium
  head(ellipsoid(H(0, 0.53, 0.055), [0.27 * hs, 0.235 * hs, 0.265 * hs]), 0.07);                       // forehead
  head(ellipsoid(H(0, 0.33, 0.12), [0.27 * hs, 0.15 * hs, 0.19 * hs]), 0.06);                            // the face at eye level
  for (const s of [1, -1]) carve(ellipsoid(H(s * 0.335, 0.42, 0.13), [0.045 * hs, 0.085 * hs, 0.09 * hs]), 0.06);   // temples
  // brow ridge: a bar over each eye meeting at the glabella; heavier on orcs and dwarves
  const browK = 0.55 + F.brow * 0.7;
  head(sphere(H(0, 0.425, 0.3), 0.034 * hs * browK ** 0.5), 0.04);
  for (const s of [1, -1]) head(cone(H(s * 0.03, 0.43, 0.305), H(s * 0.205, 0.44, 0.245), 0.029 * hs * browK ** 0.7, 0.02 * hs), 0.035);
  // cheekbones, then ONE smooth lower-face volume from the cheekbones round to the jaw. (Separate
  // cheek, jaw and muzzle lumps each read as a lump; one volume reads as a face.)
  const jw = F.jaw;
  for (const s of [1, -1]) head(ellipsoid(H(s * 0.2, 0.275, 0.15), [0.06 * hs * F.cheek ** 0.6, 0.038 * hs, 0.07 * hs], { rot: [0, s * 0.55, 0] }), 0.06);
  head(ellipsoid(H(0, 0.12, 0.1 + mz * 0.05), [0.235 * hs * jw ** 0.5 * (1 - F.hollow * 0.12 + f * 0.1), 0.2 * hs, 0.205 * hs * (1 + mz * 0.3)]), 0.075);
  head(ellipsoid(H(0, 0.16, 0.19 + mz * 0.08), [0.13 * hs, 0.1 * hs, 0.12 * hs * (1 + mz * 0.5)]), 0.06);   // midface under the nose
  head(ellipsoid(H(0, 0.095, 0.245 + mz * 0.07), [0.09 * hs * F.mouthWidth, 0.055 * hs, 0.06 * hs * (1 + mz * 0.3)]), 0.05);   // the upper lip's mound
  if (F.hollow > 0.3) for (const s of [1, -1]) carve(ellipsoid(H(s * 0.19, 0.12, 0.17), [0.05 * hs, 0.06 * hs, 0.04 * hs]), 0.05);
  // lower jaw (on the jaw bone): the angle below each ear, the body to the chin, the chin
  for (const s of [1, -1]) {
    head(cone(H(s * 0.225 * jw ** 0.5, 0.17, -0.07), H(s * 0.215 * jw, 0.0, -0.04), 0.03 * hs, 0.034 * hs * jw ** 0.5), 0.05, 'jaw');
    head(cone(H(s * 0.215 * jw, 0.0, -0.04), H(s * 0.07 * jw ** 0.4, -0.13, 0.2), 0.034 * hs * jw ** 0.5, 0.036 * hs), 0.06, 'jaw');
  }
  head(ellipsoid(H(0, -0.115, 0.225 * F.chin ** 0.35), [0.072 * hs * jw ** 0.4, 0.065 * hs * F.chin ** 0.5, 0.058 * hs]), 0.045, 'jaw');
  // nose: bridge, tip, wings, nostrils carved underneath
  const nl = F.nose, nw = F.noseWidth, nzo = mz * 0.07;
  const tip = H(0, 0.205 - (nl - 1) * 0.03, 0.385 + 0.04 * (nl - 1) + nzo);
  head(cone(H(0, 0.43, 0.3), tip, 0.022 * hs * F.bridge, 0.03 * hs * nw ** 0.5), 0.02);
  head(ellipsoid(tip, [0.034 * hs * nw ** 0.6, 0.03 * hs, 0.03 * hs]), 0.022);
  head(cone(tip, H(0, 0.145, 0.345 + nzo), 0.024 * hs, 0.016 * hs), 0.012);                           // columella
  for (const s of [1, -1]) head(ellipsoid(H(s * 0.038 * nw, 0.168, 0.322 + nzo), [0.028 * hs * nw ** 0.5, 0.024 * hs, 0.03 * hs], { rot: [0, s * 0.5, 0] }), 0.026);
  for (const s of [1, -1]) carve(ellipsoid(H(s * 0.025 * nw, 0.148, 0.345 + nzo), [0.014 * hs * nw ** 0.5, 0.0085 * hs, 0.019 * hs], { rot: [0.55, 0, 0] }), 0.005, colors.mouthPaint);
  for (const s of [1, -1]) carve(ellipsoid(H(s * 0.075 * nw, 0.18, 0.3 + nzo), [0.02 * hs, 0.04 * hs, 0.02 * hs], { rot: [0, 0, s * 0.4] }), 0.02);   // crease beside each wing
  // mouth: a cupid's-bow upper lip, a fuller lower lip, the slit between and the corners
  const mw = F.mouthWidth, lips = F.lips;
  const mouthY = 0.074, mouthZ = 0.3 + mz * 0.07;
  for (const s of [1, -1]) head(ellipsoid(H(s * 0.032 * mw, mouthY + 0.019, mouthZ + 0.004), [0.05 * hs * mw, 0.02 * hs * lips, 0.028 * hs], { rot: [0, s * 0.35, s * -0.12] }), 0.012);
  head(ellipsoid(H(0, mouthY - 0.022, mouthZ - 0.002), [0.068 * hs * mw, 0.027 * hs * lips, 0.032 * hs]), 0.006, 'jaw');
  paintOnly(ellipsoid(H(0, mouthY + 0.018, mouthZ + 0.02), [0.082 * hs * mw, 0.02 * hs * lips, 0.04 * hs]), colors.lipsPaint, 0.0012);
  paintOnly(ellipsoid(H(0, mouthY - 0.022, mouthZ + 0.016), [0.072 * hs * mw, 0.025 * hs * lips, 0.04 * hs]), colors.lipsPaint, 0.0012);
  // the line between the lips is PAINT, not a carved slit: a slit thinner than the grid comes out
  // ragged. When the jaw opens, the skin across this line stretches, and the dark paint stretches
  // with it into the inside of the mouth.
  paintOnly(roundBox(H(0, mouthY, mouthZ + 0.03), [0.08 * hs * mw, 0.0022 * hs, 0.06 * hs], 0.002 * hs), colors.mouthPaint, 0.0006);
  for (const s of [1, -1]) carve(sphere(H(s * 0.086 * mw, mouthY + 0.002, mouthZ - 0.004), 0.011 * hs), 0.012);
  carve(cone(H(0, 0.135, mouthZ + 0.042), H(0, 0.085, mouthZ + 0.03), 0.007 * hs, 0.01 * hs), 0.009);   // philtrum
  carve(ellipsoid(H(0, -0.055, mouthZ + 0.0), [0.06 * hs, 0.018 * hs, 0.03 * hs]), 0.025, null);        // the dip under the lower lip
  // eyes: the orbit, a lid mass around the eyeball, the almond opening, and the eyeball's own room
  const eyes = [];
  const re = 0.052 * hs * F.eye;
  for (const [s, side] of [[1, 'L'], [-1, 'R']]) {
    const E = J('eye' + side), tilt = s * (F.tilt + 0.06);
    head(ellipsoid(add3(E, [0, 0.004 * hs, -0.1 * re]), [re * 1.32, re * 1.2, re * 1.24]), 0.04);        // lids, swelling gently over the eyeball
    sub(almond(add3(E, [0, 0.12 * re, re]), re * 1.06 + 0.0008, re * 0.45 + 0.0008, re * 0.9, { rot: [-0.12, 0, tilt], innerSide: -s }), 0.0018 * hs, colors.lidPaint);
    sub(sphere(E, re + 0.0005), 0, colors.lidPaint);
    eyes.push({ side, center: E, radius: re });
  }
  // ears: the shell, its bowl, the rim, the lobe and an optional point
  for (const s of [1, -1]) {
    const es = F.ear;
    head(ellipsoid(H(s * 0.325, 0.29, -0.04), [0.03 * hs, 0.1 * hs * es, 0.066 * hs * es], { rot: [0, s * 0.42, s * 0.1] }), 0.012);
    head(sphere(H(s * 0.33, 0.2 - 0.06 * (es - 1), -0.03), 0.022 * hs * es), 0.01);                       // lobe
    carve(ellipsoid(H(s * 0.352, 0.28, -0.025), [0.02 * hs, 0.055 * hs * es, 0.036 * hs * es], { rot: [0, s * 0.42, 0] }), 0.008);
    head(torus(H(s * 0.34, 0.3, -0.05), 0.06 * hs * es, 0.009 * hs, { rot: [0, 0, Math.PI / 2], stretch: [1.55, 0.95] }), 0.006);
    if (F.earPoint > 0.05) head(cone(H(s * 0.34, 0.35, -0.08), H(s * (0.37 + 0.07 * F.earPoint), 0.36 + 0.26 * F.earPoint * es, -0.09 - 0.13 * F.earPoint), 0.032 * hs * es, 0.004 * hs), 0.022);
  }
  // age: forehead lines and the fold from nose to mouth corner, as shallow grooves
  if (F.age > 0.05) {
    for (const y of [0.58, 0.625, 0.67]) carve(cone(H(-0.15, y, 0.29), H(0.15, y, 0.29), 0.004 * hs * F.age, 0.004 * hs * F.age), 0.008);
    for (const s of [1, -1]) carve(cone(H(s * 0.072, 0.17, 0.33), H(s * 0.105, 0.05, 0.31), 0.006 * hs * F.age, 0.004 * hs * F.age), 0.01);
  }
  // a little warmth on the cheeks, nose tip and ears (skin is not one flat colour)
  for (const s of [1, -1]) paintOnly(ellipsoid(H(s * 0.17, 0.2, 0.25), [0.08 * hs, 0.06 * hs, 0.08 * hs]), colors.blushPaint, 0.02 * hs);
  paintOnly(sphere(tip, 0.04 * hs), colors.blushPaint, 0.015 * hs);

  // muscle definition on the stomach: shallow grooves that only show on a lean, muscular body
  const abs = Math.max(0, m - 0.45) * (1 - f) * 2;
  if (abs > 0.05) {
    const zFront = 0.1 * S;
    shape.displace = (x, y, z) => {
      if (z < zFront * 0.5 || y < pelvisY || y > chestY + 0.02 * S || Math.abs(x) > 0.1 * S) return 0;
      const line = Math.exp(-((x / (0.008 * S)) ** 2));
      const rows = [spineY - 0.04 * S, spineY + 0.035 * S, chestY - 0.03 * S].reduce((a, ry) => a + Math.exp(-(((y - ry) / (0.007 * S)) ** 2)) * smoothstep(0.1 * S, 0.02 * S, Math.abs(x)), 0);
      return -(line + rows * 0.7) * 0.0024 * S * abs;
    };
  }
  void custom;
  return { shape, F, eyes, mouth: { y: headY + mouthY * hs, z: hz + mouthZ * hs, halfWidth: 0.085 * hs * mw }, hs, re,
    regions: detailRegions(R, eyes, headY, hz, hs, mouthY, mouthZ, F) };
}

/**
 * Hands: palm, knuckles, four fingers (the little finger rides the ring bones), thumb and its pad,
 * fingernails. Built in the arm's line in the bind pose, palm facing the thigh.
 */
function buildHand(add, paintOnly, R, side, s, k, colors) {
  const J = n => R.byName[n].pos, wr = J('hand' + side);
  const knuckleBase = J('middle1' + side), dir = norm(sub3(knuckleBase, wr));
  const tilt = Math.atan2(dir[0], -dir[1]);
  const out = [s * Math.cos(tilt), s * Math.sin(tilt) * 0 + 0, 0];   // back of the hand faces away from the body
  void out;
  add(roundBox(add3(wr, scale3(dir, 0.05 * k)), [0.0135 * k, 0.046 * k, 0.039 * k], 0.012 * k, { rot: [0, 0, tilt] }), 'hand' + side, 0.012 * k);
  add(ellipsoid(add3(add3(wr, scale3(dir, 0.035 * k)), [-s * 0.008 * k, 0, 0.022 * k]), [0.016 * k, 0.03 * k, 0.018 * k]), 'thumb1' + side, 0.012 * k);  // thumb pad
  const fingers = [['index', 'index', 1.0, 0], ['middle', 'middle', 1.08, 0], ['ring', 'ring', 1.0, 0], ['ring', 'pinky', 0.8, -0.02]];
  for (const [b, name, len, dz] of fingers) {
    const k1 = J(b + '1' + side), k2 = J(b + '2' + side);
    const base = name === 'pinky' ? add3(k1, [0, 0.008 * k, dz * k]) : k1;
    const seg1 = 0.042 * k * len, seg2 = 0.046 * k * len;
    const mid = name === 'pinky' ? add3(base, scale3(dir, seg1)) : k2;
    const tip = add3(mid, scale3(dir, seg2));
    const r = (name === 'pinky' ? 0.0078 : name === 'middle' ? 0.0095 : 0.009) * k;
    add(sphere(base, r * 1.12), b + '1' + side, 0.006 * k);
    add(cone(base, mid, r, r * 0.9), b + '1' + side, 0.005 * k);
    add(cone(mid, tip, r * 0.9, r * 0.74), b + '2' + side, 0.005 * k);
    paintOnly(ellipsoid(add3(add3(tip, scale3(dir, -0.008 * k)), [s * r * 0.75, 0, 0]), [r * 0.6, r * 1.1, r * 0.75], { rot: [0, 0, tilt] }), colors.nailPaint, 0.0015);
  }
  const t1 = J('thumb1' + side), t2 = J('thumb2' + side), tdir = norm(sub3(t2, t1));
  const ttip = add3(t2, scale3(tdir, 0.032 * k));
  add(cone(t1, t2, 0.0125 * k, 0.0105 * k), 'thumb1' + side, 0.007 * k);
  add(cone(t2, ttip, 0.0105 * k, 0.0085 * k), 'thumb2' + side, 0.005 * k);
}

// ------------------------------------------------------------------ tiny vector helpers
export const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const norm = a => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export { TILE };

/**
 * Small boxes around the parts of the face that need a much finer grid than the head: the eyes (an
 * eye opening is only about 1.2 cm tall), the mouth and the ears. Each is meshed at its own step and
 * drawn a hair outside the coarser surface, which is cut away underneath it.
 */
function detailRegions(R, eyes, headY, hz, hs, mouthY, mouthZ, F) {
  const box = (c, h) => [c[0] - h[0], c[1] - h[1], c[2] - h[2], c[0] + h[0], c[1] + h[1], c[2] + h[2]];
  const eyeMid = [0, eyes[0].center[1], eyes[0].center[2]];
  const out = [
    { name: 'eyes', step: 0.0019, inflate: 0.0011, box: box([0, eyeMid[1] + 0.02 * hs, eyeMid[2] + 0.04 * hs], [Math.abs(eyes[0].center[0]) + 0.095 * hs, 0.085 * hs, 0.085 * hs]) },
    { name: 'mouth', step: 0.0015, inflate: 0.0010, box: box([0, headY + (mouthY + 0.0) * hs, hz + (mouthZ + 0.0) * hs], [0.13 * hs * F.mouthWidth, 0.075 * hs, 0.07 * hs]) },
    { name: 'nose', step: 0.0024, inflate: 0.0009, box: box([0, headY + 0.24 * hs, hz + 0.34 * hs], [0.085 * hs * F.noseWidth, 0.13 * hs, 0.09 * hs]) },
  ];
  for (const s of [1, -1]) out.push({ name: 'ear', step: 0.0024, inflate: 0.0009, box: box([s * 0.35 * hs, headY + (0.3 + 0.12 * F.earPoint) * hs, hz - (0.05 + 0.05 * F.earPoint) * hs], [0.07 * hs, (0.15 + 0.16 * F.earPoint) * hs, (0.1 + 0.07 * F.earPoint) * hs]) });
  return out;
}
