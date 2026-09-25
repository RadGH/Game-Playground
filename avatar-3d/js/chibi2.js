import * as THREE from 'three';
import { normalizeAvatar, shade } from '../../avatar-2d/js/render.js';
import { profile, taperedCurve, createRig, SkinBuilder } from './chibi2-geometry.js';
import { createClips, CHIBI2_ANIMS, CHIBI2_ALL_ANIMS, CHIBI2_SWIM_ANIMS, ONE_SHOTS } from './chibi2-motion.js';
import { buildGear, CAPELETS } from './chibi2-gear.js';
import { buildBody } from './chibi2-body.js';
import { buildFace, HEAD_SHAPES } from './chibi2-face.js';
import { buildExtraHat, HATS_COVER_CROWN } from './chibi2-hats.js';
import { raceOf } from './chibi2-races.js';
import { holdFor } from './chibi2-weapon-ids.js';

export { CHIBI2_ANIMS, CHIBI2_SWIM_ANIMS, CHIBI2_ALL_ANIMS };
const templates = new Map();
/** Hats with a brim the hair shows beneath, and the height (head units) the hair is cut off at. */
const HAT_BRIM = { wizard: 0.5, wide_brim: 0.41, straw: 0.43, top_hat: 0.51, feather_cap: 0.43, bard_red_feather: 0.43, cap: 0.44, bandana: 0.44, leather_cap: 0.4 };
const sphere = () => new THREE.SphereGeometry(1, 10, 6);
const ring = (r, tube) => new THREE.TorusGeometry(r, tube, 4, 12);

function buildTemplate(a, rig) {
  const b = new SkinBuilder(rig), H = rig.headScale, W = rig.wide, T = rig.torso;
  rig.byName.eyeL.rotation.z = -(a.eyes.rot || 0) * Math.PI / 180;
  rig.byName.eyeR.rotation.z = (a.eyes.rot || 0) * Math.PI / 180;
  rig.root.updateMatrixWorld(true);
  const hair = a.hair.color;
  const trim = '#d9b477', leather = '#493c36', steel = '#c4d4d6', darkSteel = '#536a73';
  const add = (...args) => b.add(...args);
  const ellipsoid = (bone, color, position, scale, options = {}) => add(sphere(), bone, color, { position, scale, ...options });
  const strip = (bone, points, radius, color, options = {}) => add(taperedCurve(points, [radius, radius, radius], 4, 4), bone, color, options);
  const head = (g, color, options = {}) => add(g, 'head', color, { ...options, position: (options.position || [0, 0, 0]).map(v => v * H), scale: (options.scale || [1, 1, 1]).map(v => v * H) });

  // Body and clothes (chibi2-body.js), then the face (chibi2-face.js). Both hand back the surfaces
  // the hair, hats and gear are laid on.
  const body = buildBody(a, rig, { add, ellipsoid, strip, trim, leather, steel, darkSteel });
  const face = buildFace(a, rig, { add, head, ellipsoid, strip });
  const hs = HEAD_SHAPES[a.headShape] || HEAD_SHAPES.round, faceWidth = hs.w, faceDepth = hs.d;

  if (a.hair.id !== 'bald') {
    const hairId = a.hair.id;
    const headwearCoversCrown = ['feather_cap', 'bard_red_feather', 'horned_helm', 'dragon_helm', 'hood', 'wide_brim', 'goggles_up', 'wizard', ...HATS_COVER_CROWN].includes(a.hat.id);
    // A raised hood tucks away everything outside the face opening; only a fringe shows under its brow.
    const hoodUp = a.hat.id === 'hood', fringeUnder = hoodUp || a.hat.id === 'goggles_up';   // a brimmed hat shows the flattened cap instead (HAT_BRIM)
    const cap = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const p = cap.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      p.setXYZ(i, x * 0.348 * faceWidth, 0.32 + y * 0.31 + Math.max(0, z) * 0.055, (z * 0.28 - 0.012) * faceDepth);
    }
    cap.computeVertexNormals();
    // Under a BRIMMED hat the hair still shows below the brim (the back of a wizard's head was bare
    // skin when the whole cap was dropped): the cap is flattened to sit just under the hat instead.
    const brim = HAT_BRIM[a.hat.id];
    if (headwearCoversCrown && brim && !['afro', 'mohawk', 'buzz'].includes(hairId)) {
      for (let i = 0; i < p.count; i++) p.setY(i, Math.min(p.getY(i), brim));
      cap.computeVertexNormals();
      head(cap, hair);
    }
    if (!headwearCoversCrown && !['afro', 'mohawk'].includes(hairId)) head(cap, hairId === 'buzz' ? shade(hair, -0.12) : hair, { scale: hairId === 'buzz' ? [0.995, 0.97, 0.995] : [1, 1, 1] }); // buzz stays outside the skull top (0.60)
    // THE BACK OF THE HEAD. The crown cap stops at the skull's equator (y 0.32), so every hairstyle
    // left the back of the head bare skin from there down to the neck — invisible from the front, and
    // the whole of what a third-person camera sees. A shell over the back of the skull reaches the
    // nape (lower for long hair); it is the same size as the cap, so hats and hoods fit over it.
    if (!hoodUp && !['buzz', 'mohawk', 'tonsure', 'afro'].includes(hairId)) {
      const long = /long|wavy|braids|pony|bob|hood_hair/.test(hairId);
      const back = new THREE.SphereGeometry(1, 14, 6, Math.PI - 0.5, Math.PI + 1.0, Math.PI / 2 - 0.08, long ? Math.PI * 0.42 : Math.PI * 0.3);
      const R = rig.round || 0;
      head(back, shade(hair, -0.05), { position: [0, 0.32, -0.02], scale: [(0.365 + R * 0.02) * faceWidth, 0.325, (0.3 + R * 0.01) * faceDepth] });
    }
    const fringe = hairId === 'short' || hairId === 'long' || hairId === 'wavy';
    if (fringe && (!headwearCoversCrown || fringeUnder)) for (let i = 0; i < 7; i++) {
      if (fringeUnder && (i === 0 || i === 6)) continue; // The outer locks would reach the hood's inner wall.
      const x = (i - 3) * 0.087, arc = 1 - (x / 0.31) ** 2;
      head(taperedCurve([[x - 0.035, 0.53 + arc * 0.06, 0.08], [x + 0.026, 0.49 + arc * 0.01, 0.225], [x + 0.055, 0.365 + (i % 3) * 0.027, 0.262]], [0.048, 0.068, 0.002], 6, 6), i % 3 === 1 ? shade(hair, 0.12) : hair);
    }
    if (hairId === 'slicked' && !headwearCoversCrown) for (let i = 0; i < 5; i++) {
      // Slicked back: combed strands from the hairline over the crown toward the nape, no fringe.
      const x = (i - 2) * 0.1;
      head(taperedCurve([[x * 0.9, 0.46, 0.225], [x * 1.05, 0.585, 0.02], [x, 0.47, -0.262]], [0.028, 0.032, 0.012], 5, 7), i % 2 ? shade(hair, 0.14) : hair);
    }
    if (hairId === 'side_part') {
      for (let i = 0; i < 4; i++) head(taperedCurve([[0.02 + i * 0.055, 0.50, 0.09], [0.08 + i * 0.06, 0.46, 0.235], [0.17 + i * 0.045, 0.39, 0.264]], [0.055, 0.07, 0.006], 6, 6), i % 2 ? shade(hair, 0.12) : hair);
      if (!hoodUp) head(taperedCurve([[-0.26, 0.48, 0.06], [-0.31, 0.30, 0.04], [-0.28, 0.10, 0.03]], [0.075, 0.06, 0.015], 6, 6), shade(hair, -0.08));
    }
    if (hairId === 'bangs') {
      for (let i = 0; i < 7; i++) { const x = (i - 3) * 0.075; head(taperedCurve([[x, 0.49, 0.16], [x + (i - 3) * 0.008, 0.43, 0.245], [x + (i - 3) * 0.012, 0.31, 0.26]], [0.065, 0.075, 0.006], 6, 6), i % 2 ? shade(hair, 0.08) : hair); }
    }
    if (hairId === 'spiky' && !hoodUp) {
      for (let i = 0; i < 7; i++) { const x = (i - 3) * 0.09; head(taperedCurve([[x, 0.36, 0.20], [x * 1.1, 0.50 + (i % 2) * 0.05, 0.17], [x * 1.2, 0.68 + (i % 3) * 0.06, 0.04]], [0.07, 0.05, 0.004], 5, 5), hair); }
    }
    if (hairId === 'mohawk' && !hoodUp) {
      for (let i = 0; i < 5; i++) head(taperedCurve([[0, 0.46 + i * 0.025, 0.1], [0, 0.6 + i * 0.015, 0.1], [0, 0.83 - i * 0.035, 0.0]], [0.075, 0.065, 0.008], 5, 5), i % 2 ? shade(hair, 0.10) : hair);
    }
    if (hairId === 'pixie' && !hoodUp) for (const s of [-1, 1]) head(taperedCurve([[s * 0.05, 0.52, 0.14], [s * 0.2, 0.47, 0.235], [s * 0.315, 0.36, 0.12]], [0.07, 0.055, 0.008], 6, 6), hair); // swept above the brow, never across it
    if (hairId === 'tonsure' && !hoodUp) { head(new THREE.TorusGeometry(0.20, 0.055, 6, 14), hair, { position: [0, 0.51, 0.01], rotation: [Math.PI / 2, 0, 0], scale: [1.2, 0.8, 1] }); }
    if (hairId === 'hood_hair' && !hoodUp) for (const s of [-1, 1]) head(taperedCurve([[s * 0.18, 0.48, 0.05], [s * 0.30, 0.28, 0.10], [s * 0.26, -0.02, 0.03]], [0.11, 0.08, 0.018], 6, 7), hair);
    // Curly: tight curls over a normal cap. Afro: one large rounded mass with curls on its rim.
    if (hairId === 'curly' && !headwearCoversCrown) for (const [x, y, z] of [[-0.25, 0.46, 0.10], [-0.10, 0.58, 0.12], [0.06, 0.60, 0.10], [0.21, 0.50, 0.12], [-0.30, 0.34, -0.06], [0.30, 0.36, -0.06], [0, 0.56, -0.18]]) head(sphere(), hair, { position: [x, y, z], scale: [0.075, 0.075, 0.065] });
    if (hairId === 'afro' && !headwearCoversCrown) {
      head(new THREE.SphereGeometry(1, 14, 9), hair, { position: [0, 0.47, -0.05], scale: [0.50, 0.42, 0.44] });
      for (const [x, y, r] of [[-0.40, 0.42, 0.11], [-0.26, 0.66, 0.10], [0, 0.72, 0.12], [0.26, 0.66, 0.10], [0.40, 0.42, 0.11]]) head(sphere(), hair, { position: [x, y, 0.08], scale: [r, r, r * 0.85] });
    }
    if (hairId === 'mohawk' && !hoodUp) head(profile([[0.32, 0.09, 0.08], [0.48, 0.11, 0.09], [0.60, 0.035, 0.035]], 8), hair);
    if (!headwearCoversCrown) for (const s of [-1, 1]) head(taperedCurve([[s * 0.28, 0.45, -0.02], [s * 0.335, 0.31, 0.008], [s * 0.30, 0.15, 0.052]], [0.06, 0.043, 0.002], 6, 6), shade(hair, -0.07));
    if (hairId === 'wavy' && !headwearCoversCrown) for (const s of [-1, 1]) head(taperedCurve([[s * 0.27, 0.46, -0.06], [s * 0.36, 0.33, 0.0], [s * 0.30, 0.20, 0.03], [s * 0.37, 0.05, -0.01], [s * 0.31, -0.08, -0.04], [s * 0.36, -0.20, -0.06]], [0.07, 0.065, 0.06, 0.055, 0.045, 0.01], 6, 14), shade(hair, 0.06));
    if (hairId === 'bob' && !headwearCoversCrown) {
      // Bob: a rounded shell over the back and sides, open over the face and cut level at the jaw.
      const open = 1.05, bob = new THREE.SphereGeometry(1, 14, 7, Math.PI / 2 + open, Math.PI * 2 - open * 2, 0.62, 1.72);
      head(bob, hair, { position: [0, 0.30, -0.03], scale: [0.385, 0.40, 0.335] });
      head(backface(bob.clone()), shade(hair, -0.2), { position: [0, 0.30, -0.03], scale: [0.375, 0.39, 0.325] });
    }
    if (hairId === 'braids' && !hoodUp) for (const s of [-1, 1]) {
      // Braids: two plaits of stacked links falling in front of the shoulders, tied off at the ends.
      for (let k = 0; k < 5; k++) head(new THREE.IcosahedronGeometry(1, 0), k % 2 ? shade(hair, 0.1) : hair, { position: [s * (0.31 + k * 0.005), 0.16 - k * 0.09, 0.10 + k * 0.014], scale: [0.052, 0.058, 0.046] });
      head(new THREE.ConeGeometry(0.035, 0.07, 5), '#c83a2a', { position: [s * 0.335, -0.32, 0.17] });
    }
    if (/long|braids|pony|wavy/.test(hairId) && !hoodUp) for (const s of [-1, 1]) head(taperedCurve([[s * 0.23, 0.42, -0.16], [s * 0.30, 0.13, -0.12], [s * 0.27, -0.16, -0.08]], [0.10, 0.085, 0.015], 6, 7), hair);
    if (hairId === 'ponytail' && !hoodUp) head(taperedCurve([[0.27, 0.38, -0.10], [0.38, 0.10, -0.13], [0.31, -0.20, -0.08]], [0.11, 0.09, 0.02], 7, 8), hair);
    if ((hairId === 'bun' || hairId === 'buns') && !hoodUp) for (const s of hairId === 'bun' ? [1] : [-1, 1]) head(sphere(), hair, { position: [s * (hairId === 'bun' ? 0 : 0.22), 0.47, -0.04], scale: [0.13, 0.13, 0.11] });
  }
  if (a.hat.id === 'dragon_helm') {
    buildDragonHelm(a, head);
  } else if (/helmet|helm/.test(a.hat.id)) {
    head(profile([[0.41, 0.353, 0.30], [0.48, 0.335, 0.286], [0.60, 0.20, 0.18], [0.66, 0.02, 0.02]], 16), a.hat.color, { metal: true });
    head(profile([[0.405, 0.357, 0.302], [0.435, 0.357, 0.302]], 16), trim, { metal: true });
    if (a.hat.id === 'horned_helm') for (const s of [-1, 1]) head(taperedCurve([[s * 0.30, 0.50, 0.02], [s * 0.50, 0.58, 0.03], [s * 0.56, 0.80, -0.02]], [0.065, 0.042, 0.006], 6, 7), '#d9cfa8');
  } else if (a.hat.id === 'wizard') {
    head(profile([[0.51, 0.47, 0.36], [0.54, 0.46, 0.355], [0.555, 0.32, 0.25]], 16), a.hat.color);
    head(profile([[0.53, 0.30, 0.23], [0.8, 0.17, 0.145, -0.035], [1.02, 0.09, 0.06, -0.10], [1.08, 0.003, 0.004, -0.18]], 12), a.hat.color);
  } else if (a.hat.id === 'feather_cap' || a.hat.id === 'bard_red_feather') {
    // Bespoke Bard cap: low-poly felt silhouette, stitched brim, band and a head-weighted feather.
    const hat = a.hat.color || '#b02020', feather = a.hat.color2 || '#3aa65a';
    // The skull is a dome (half-width 0.30 at y 0.44, 0.265 at 0.50, 0.15 at 0.57, top 0.60), so the
    // crown is a domed profile that stays outside it all the way up; a cone narrows faster than the skull.
    head(new THREE.CylinderGeometry(0.385, 0.425, 0.05, 16), hat, { position: [0, 0.438, 0.012], scale: [1.02, 1, 0.9] }); // narrow turned band, as in the 2D cap
    head(profile([[0.44, 0.375, 0.315, 0.012], [0.53, 0.36, 0.30, 0.0], [0.62, 0.30, 0.255, -0.015], [0.70, 0.19, 0.165, -0.035], [0.745, 0.06, 0.055, -0.055], [0.752, 0.003, 0.003, -0.06]], 14), hat);
    head(new THREE.TorusGeometry(0.368, 0.02, 5, 16), trim, { position: [0, 0.49, 0.005], rotation: [Math.PI / 2, 0, 0], scale: [1, 0.845, 1], metal: true });
    // The feather is tucked under the band on the right side and sweeps up and back.
    head(taperedCurve([[0.30, 0.47, 0.13], [0.39, 0.64, 0.04], [0.42, 0.84, -0.10]], [0.05, 0.045, 0.008], 6, 7), feather);
    head(taperedCurve([[0.31, 0.49, 0.14], [0.40, 0.64, 0.08], [0.44, 0.74, 0.03]], [0.018, 0.013, 0.002], 4, 5), shade(feather, 0.18));
  } else if (a.hat.id === 'hood') {
    buildHood(a, add, H, W, T);
  } else if (a.hat.id === 'hood_down') {
    buildHoodDown(a, add, W, T);
  } else if (a.hat.id === 'wide_brim') {
    const hat = a.hat.color || '#40352f';
    // Crown runs from just under the brim (y 0.40) to 0.65, above the skull top (0.60); the brim sits above the brows.
    head(new THREE.CylinderGeometry(0.31, 0.37, 0.25, 14), hat, { position: [0, 0.525, 0], scale: [1, 1, 0.86] });
    head(new THREE.CylinderGeometry(0.54, 0.54, 0.035, 16), hat, { position: [0, 0.43, 0.015], scale: [1, 1, 0.76] });
    // The torus lies flat after the x rotation, so its local y is the depth axis to squash.
    head(new THREE.TorusGeometry(0.362, 0.018, 5, 16), trim, { position: [0, 0.462, 0], rotation: [Math.PI / 2, 0, 0], scale: [1, 0.86, 1], metal: true });
  } else if (a.hat.id === 'goggles_up') {
    buildAviatorCap(a, head, leather);
  } else buildExtraHat(a, { add, head, H, W, T, trim, leather, steel, darkSteel });
  // Held and off-hand items, accessories, marks, capes, greaves and decorations live in chibi2-gear.js.
  buildGear(a, { add, head, ellipsoid, strip, H, W, T, L: rig.leg, A: rig.arm, trim, leather, steel, darkSteel, skin: a.body.skin, faceWidth, faceDepth, chestZ: body.chestZ, hipsZ: body.hipsZ, faceZ: face.faceZ, topStyle: body.top, LW: body.LW, rig });
  return b.finish();
}

// Hood colours: the cloth colour, a darker lining for the inside, and a lighter rolled edge.
// THREE.Color accepts the short '#111' form that shade() leaves untouched.
const tint = (c, k) => '#' + new THREE.Color(c).multiplyScalar(k).getHexString();
const tintUp = (c, k) => '#' + new THREE.Color(c).lerp(new THREE.Color('#ffffff'), k).getHexString();
/** Euler angles that turn local axis `from` onto direction `to` (for lenses and rings laid on a curved surface). */
const facing = (from, to) => new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(from, to.clone().normalize())).toArray().slice(0, 3);

/**
 * Dragon helm (dragon_knight): an enclosing helm matching the 2D part. The shell covers the crown, back and
 * sides down to the jaw and closes over the face; a dark curved visor slit crosses it at eye level with two
 * eye glints, cheek guards close toward the chin, an orange crest runs down the forehead and along the crown
 * ridge, and red horns sweep up from the temples. Head space, scaled by H through head().
 */
function buildDragonHelm(a, head) {
  const helm = a.hat.color || '#2a5a2a', dark = tint(helm, 0.55), crest = '#e8742a', horn = '#c8362a';
  // Shell: wider and deeper than the skull (0.335 / 0.271) and the nose tip (z 0.327) at every height.
  head(profile([[-0.05, 0.28, 0.29], [0.06, 0.36, 0.35], [0.22, 0.39, 0.362], [0.38, 0.382, 0.34, -0.005], [0.52, 0.338, 0.29, -0.015], [0.63, 0.24, 0.205, -0.025], [0.70, 0.11, 0.095, -0.035], [0.725, 0.003, 0.003, -0.035]], 16), helm, { metal: true });
  // Visor: a dark band that follows the shell's curve, with a brow ridge above it.
  const band = (y, h, grow, color) => head(new THREE.CylinderGeometry(1, 1, h, 12, 1, true, -1.05, 2.1), color, { position: [0, y, 0], scale: [0.392 + grow, 1, 0.364 + grow], metal: true });
  band(0.262, 0.062, 0.006, '#111111');
  band(0.312, 0.03, 0.014, dark);
  for (const s of [-1, 1]) head(new THREE.SphereGeometry(1, 6, 4), tintUp(a.eyes.color || '#e8c040', 0.35), { position: [s * 0.12, 0.262, 0.366], scale: [0.034, 0.016, 0.006] });
  // Cheek guards angled in toward the chin, meeting on a dark centre seam.
  for (const s of [-1, 1]) head(new THREE.BoxGeometry(1, 1, 1), helm, { position: [s * 0.16, 0.09, 0.325], scale: [0.2, 0.2, 0.035], rotation: [-0.22, s * 0.5, s * 0.1], metal: true });
  head(taperedCurve([[0, 0.20, 0.372], [0, 0.08, 0.37], [0, -0.03, 0.31]], [0.012, 0.012, 0.01], 4, 4), dark, { metal: true });
  // Crest: a blade down the forehead, then spikes along the crown ridge shrinking toward the back.
  head(new THREE.OctahedronGeometry(1), crest, { position: [0, 0.45, 0.335], scale: [0.034, 0.10, 0.03], rotation: [-0.55, 0, 0] });
  for (let i = 0; i < 5; i++) {
    const t = (62 + i * 24) * Math.PI / 180;
    head(new THREE.ConeGeometry(0.036, 0.11 - i * 0.014, 4), crest, { position: [0, 0.33 + 0.39 * Math.sin(t), -0.01 + 0.34 * Math.cos(t)], rotation: [Math.PI / 2 - t, 0, 0] });
  }
  for (const s of [-1, 1]) head(taperedCurve([[s * 0.28, 0.56, 0.08], [s * 0.45, 0.68, 0.02], [s * 0.47, 0.90, -0.06]], [0.06, 0.04, 0.004], 6, 7), horn);
}

/**
 * Aviator cap (goggles_up, tinker): a leather crown shell tilted so it sits high over the brow and low at the
 * nape, a rolled rim, a centre seam, ear flaps, and brass goggles resting on the front of the cap with their
 * strap running round the back. Cap uses hat.color; frames are a brass lift of it and the lenses the 2D glass.
 */
function buildAviatorCap(a, head, leather) {
  const cap = a.hat.color || '#6a4a2a', rim = tint(cap, 0.72), brass = tintUp(cap, 0.25), glass = '#a9d3dc';
  const C = new THREE.Vector3(0, 0.30, -0.01), R = [0.375, 0.40, 0.33], tilt = new THREE.Euler(-0.3, 0, 0), edge = Math.PI * 0.42;
  const at = (theta, phi, k = 1) => new THREE.Vector3(Math.sin(theta) * Math.sin(phi) * R[0] * k, Math.cos(theta) * R[1] * k, Math.sin(theta) * Math.cos(phi) * R[2] * k).applyEuler(tilt).add(C);
  // Front edge sits at y 0.49 above the brows, sides at 0.40, back edge at the nape line (0.30); clears the skull everywhere.
  head(new THREE.SphereGeometry(1, 12, 5, 0, Math.PI * 2, 0, edge), cap, { position: C.toArray(), scale: R, rotation: [tilt.x, 0, 0] });
  const loop = (theta, k, from = 0, to = Math.PI * 2, n = 16) => Array.from({ length: n + 1 }, (_, i) => at(theta, from + (to - from) * i / n, k).toArray());
  head(taperedCurve(loop(edge, 1.0), [0.02, 0.02, 0.02], 4, 16), rim);
  head(taperedCurve([...Array.from({ length: 5 }, (_, i) => at(edge * (1 - i / 5), 0, 1.012).toArray()), ...Array.from({ length: 6 }, (_, i) => at(edge * i / 5, Math.PI, 1.012).toArray())], [0.008, 0.008, 0.008], 3, 10), rim);
  for (const s of [-1, 1]) head(new THREE.SphereGeometry(1, 8, 5), cap, { position: [s * 0.35, 0.27, 0.01], scale: [0.055, 0.14, 0.11] });
  // Goggle strap round the back of the cap, then the goggles on its front.
  head(taperedCurve(loop(edge * 0.72, 1.035, 0.55, Math.PI * 2 - 0.55, 12), [0.016, 0.016, 0.016], 4, 12), leather);
  const lenses = [-1, 1].map(s => at(edge * 0.66, s * 0.42, 1.06)), out = s => at(edge * 0.66, s * 0.42, 1.3).sub(at(edge * 0.66, s * 0.42, 1.0));
  lenses.forEach((p, i) => {
    const n = out(i ? 1 : -1);
    head(new THREE.TorusGeometry(0.068, 0.018, 3, 10), brass, { position: p.toArray(), rotation: facing(new THREE.Vector3(0, 0, 1), n), metal: true });
    head(new THREE.CylinderGeometry(0.056, 0.056, 0.014, 8), glass, { position: p.toArray(), rotation: facing(new THREE.Vector3(0, 1, 0), n), metal: true });
  });
  head(taperedCurve([lenses[0].toArray(), lenses[1].toArray()], [0.013, 0.013], 4, 1), brass, { metal: true });
}

/** Reversed-winding copy of an indexed or non-indexed geometry, for the inside of a shell. */
function backface(g) {
  if (!g.index) g.setIndex(Array.from({ length: g.attributes.position.count }, (_, i) => i));
  const idx = g.index.array;
  for (let i = 0; i < idx.length; i += 3) [idx[i], idx[i + 1]] = [idx[i + 1], idx[i]];
  g.computeVertexNormals(); return g;
}

function hoodColors(a) {
  const base = new THREE.Color(a.hat.color || '#4b536c');
  // A flat 14% lift was enough on a blue or a brown hood and did nothing at all on a near-black one
  // — the seam, the rim and the folds all vanished and the whole cowl went back to being one blob.
  // So the darker the cloth, the further the piping is lifted off it.
  const lift = 0.14 + (1 - Math.max(base.r, base.g, base.b)) * 0.20;
  const lining = base.clone().multiplyScalar(0.55), edge = base.clone().lerp(new THREE.Color('#ffffff'), lift);
  return { cloth: '#' + base.getHexString(), lining: '#' + lining.getHexString(), edge: a.hat.color2 || '#' + edge.getHexString() };
}

/**
 * Raised hood: one cowl shell built as a grid in head space (+z forward, head spans y 0..0.60).
 * Columns run around the face opening (b: -1 at the left jaw, 0 over the brow, +1 at the right jaw);
 * rows run from the face rim (v = 0) back over the head to the nape (v = 1), where they meet.
 * The rim is pulled forward past the face, the crown gets a soft peak and the lower rows hang
 * past the head onto the neck, weighted to the chest so they follow the body, not the nod.
 * An outer shell, a darker inner shell and one piped edge along rim and hem close the cloth.
 * The radii were 0.44/0.42/0.40, which stood the cowl wider than the character's own shoulders and
 * was half of why a hooded mage read as a dome with a person somewhere under it; they are trimmed
 * to just over the head (half-width 0.335) so the cloth still wraps it without swallowing it.
 */
export const HOOD_SHAPE = { center: [0, 0.30, 0.0], radii: [0.42, 0.405, 0.385], thickness: 0.035, lip: 0.07, columns: 16, rows: 9 };
export function hoodGrid(shape = HOOD_SHAPE) {
  const [cx, cy, cz] = shape.center, [rx, ry, rz] = shape.radii, { columns, rows } = shape;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const nape = V(0, -0.62, -0.78).normalize(), peak = V(0, 0.72, -0.69).normalize();
  // The face opening, as angles from the forward axis: an oval centred a little below the axis,
  // wider than the cheeks, rounded over the brow and running under the jaw at the ends.
  const Ax = 0.93, Y0 = -0.22, AyTop = 0.92, AyBottom = 1.05, reach = 2.55;
  const rim = beta => {
    const sx = Math.sin(beta), cyb = Math.cos(beta);
    for (const Ay of [AyTop, AyBottom]) {
      const qa = (sx / Ax) ** 2 + (cyb / Ay) ** 2, qb = -2 * Y0 * cyb / Ay ** 2, qc = (Y0 / Ay) ** 2 - 1;
      const s = (-qb + Math.sqrt(qb * qb - 4 * qa * qc)) / (2 * qa);
      if ((s * cyb >= Y0) === (Ay === AyTop)) return V(Math.sin(s) * sx, Math.sin(s) * cyb, Math.cos(s));
    }
  };
  const outer = [], inner = [];
  for (let j = 0; j <= columns; j++) {
    const b = j / columns * 2 - 1, beta = b * reach;
    const R = rim(beta);
    // Mid control: straight out from the head in the column's direction, tipped back.
    const M = V(Math.sin(beta) * 1.05, Math.cos(beta), -0.45).normalize();
    const ctrl = M.clone().multiplyScalar(2).sub(R.clone().add(nape).multiplyScalar(0.5));
    for (let i = 0; i <= rows; i++) {
      const v = i / rows, d = R.clone().multiplyScalar((1 - v) ** 2).add(ctrl.clone().multiplyScalar(2 * (1 - v) * v)).add(nape.clone().multiplyScalar(v * v)).normalize();
      const bump = 0.07 * Math.max(0, d.dot(peak)) ** 8;
      const lip = shape.lip * Math.max(0, 1 - v * 3.2) ** 2;
      for (const [list, t] of [[outer, 0], [inner, shape.thickness]]) {
        const p = V(cx + d.x * (rx - t), cy + d.y * (ry - t) + bump * (1 - t * 10), cz + d.z * (rz - t) + lip);
        // Below the jaw the cloth hangs rather than curling under the head.
        if (p.y < 0.08) { const k = 0.08 - p.y; p.y = 0.08 - k * 1.9; p.x *= 1 + k * 0.5; p.z -= k * 0.45; }
        list.push(p);
      }
    }
  }
  return { outer, inner, columns, rows };
}

function buildHood(a, add, H, W, T) {
  const capelet = CAPELETS.includes(a.cape.id);
  const { cloth, lining, edge } = hoodColors(a), { outer, inner, columns, rows } = hoodGrid();
  const at = (j, i) => j * (rows + 1) + i;
  const shell = (points, color, flip, from = 0, to = rows) => {
    const g = new THREE.BufferGeometry(), idx = [];
    g.setAttribute('position', new THREE.Float32BufferAttribute(points.flatMap(p => [p.x, p.y, p.z]), 3));
    for (let j = 0; j < columns; j++) for (let i = from; i < to; i++) {
      const q = [at(j, i), at(j + 1, i), at(j + 1, i + 1), at(j, i + 1)];
      if (flip) idx.push(q[0], q[2], q[1], q[0], q[3], q[2]); else idx.push(q[0], q[1], q[2], q[0], q[2], q[3]);
    }
    g.setIndex(idx); g.computeVertexNormals();
    // Neck-weighted hem: the bottom of the cowl follows the chest instead of swinging with the head.
    add(g, 'head', color, { scale: [H, H, H], bend: { bone: 'chest', at: 0.02 * H, width: 0.09 * H } });
  };
  /**
   * The back of the cowl is the ONLY part of it a third-person camera ever sees, and every row used
   * to run into the nape as one unbroken sheet of one colour — so from behind the hooded mage read
   * as a solid dark dome with no features at all, and at night as a black blob with no head in it.
   * A real hood is two panels stitched up the middle and gathered at the neck, so the cloth is drawn
   * the same way now: the rows behind the ears are a shade darker, because that is cloth lying in
   * the hood's own shadow, and a piped seam runs the crown with two gathers fanning into the nape.
   * Three thin welts is all it takes — they give the back of the head edges to catch a light on.
   */
  const gatherAt = Math.max(1, rows - 3);
  shell(outer, cloth, false, 0, gatherAt);
  shell(outer, shade(cloth, -0.12), false, gatherAt, rows);
  shell(inner, lining, true);
  // Piped edge: up the left hem, around the face rim, down the right hem. It sits between the shells.
  const mid = (j, i) => outer[at(j, i)].clone().lerp(inner[at(j, i)], 0.5);
  const path = [];
  for (let i = rows; i > 0; i--) path.push(mid(0, i));
  for (let j = 0; j <= columns; j++) path.push(mid(j, 0));
  for (let i = 1; i <= rows; i++) path.push(mid(columns, i));
  // 30 steps rather than 36: the rim pipe is the single most expensive thing on a hooded character,
  // and the six steps it gives back pay for the crown seam below without moving the druid — the
  // heaviest class look — past the 8,500-triangle budget `tests/chibi2.spec.js` holds it to.
  add(taperedCurve(path.map(p => p.toArray()), [0.012, 0.022, 0.026, 0.026, 0.022, 0.012], 5, 30), 'head', edge, { scale: [H, H, H], bend: { bone: 'chest', at: 0.02 * H, width: 0.09 * H } });
  // The seam and the gathers sit ON the outer shell, not between the two, so they read as welts
  // standing proud of the cloth rather than as a line drawn on it.
  const centre = new THREE.Vector3(...HOOD_SHAPE.center);
  const proud = (j, i) => outer[at(j, i)].clone().sub(centre).multiplyScalar(1.004).add(centre).toArray();
  const seam = [];
  for (let i = 1; i <= rows; i++) seam.push(proud(columns / 2, i));
  add(taperedCurve(seam, [0.009, 0.016, 0.018, 0.012], 4, 9), 'head', edge, { scale: [H, H, H], bend: { bone: 'chest', at: 0.02 * H, width: 0.09 * H } });
  for (const j of [columns / 2 - 3, columns / 2 + 3]) {
    const fold = [];
    for (let i = gatherAt - 1; i <= rows; i++) fold.push(proud(j, i));
    add(taperedCurve(fold, [0.004, 0.013, 0.010], 3, 4), 'head', shade(cloth, -0.24), { scale: [H, H, H], bend: { bone: 'chest', at: 0.02 * H, width: 0.09 * H } });
  }
  // Short mantle on the chest bone: the cowl's cloth settling over the neck and top of the shoulders.
  // Its top tucks inside the hood's hem, so the join stays hidden when the head turns.
  if (!capelet) add(profile([[0.285 * T, 0.255 * W, 0.17 * W, -0.012], [0.315 * T, 0.215 * W, 0.15 * W, -0.014], [0.36 * T, 0.12, 0.10, -0.02], [0.40 * T, 0.09, 0.08, -0.02]], 14), 'chest', cloth);
  if (!capelet) add(profile([[0.282 * T, 0.258 * W, 0.173 * W, -0.012], [0.292 * T, 0.258 * W, 0.173 * W, -0.012]], 14), 'chest', edge);
}

/** Lowered hood: a rolled collar of cloth around the back of the neck and the hood's bag lying on the upper back. */
function buildHoodDown(a, add, W, T) {
  const { cloth, lining, edge } = hoodColors(a);
  // Chest-bone space: the neck rises from y 0.27T; the shoulders are about 0.22W wide there.
  const collar = [];
  for (let k = 0; k <= 8; k++) {
    const t = -2.2 + k / 8 * 4.4, back = Math.max(0, -Math.cos(t));
    collar.push([Math.sin(t) * (0.15 + back * 0.03) * W, (0.285 + back * 0.02) * T, Math.cos(t) * (0.10 + back * 0.04) * W - 0.01]);
  }
  add(taperedCurve(collar, [0.03, 0.05, 0.058, 0.05, 0.03], 7, 16), 'chest', cloth);
  add(taperedCurve(collar.map(([x, y, z]) => [x * 1.02, y + 0.012, z * 1.02]), [0.012, 0.02, 0.022, 0.02, 0.012], 5, 16), 'chest', edge);
  // The empty hood itself hangs flat against the upper back below the collar, following the back's curve.
  const bag = [[0.0, 0.04, 0.012, -0.150], [0.08, 0.15, 0.034, -0.168], [0.19, 0.19, 0.042, -0.172], [0.28, 0.17, 0.036, -0.145], [0.315, 0.12, 0.024, -0.12]];
  add(profile(bag.map(([y, rx, rz, z]) => [y * T, rx * W, rz, z * W]), 12), 'chest', cloth);
  // A darker fold line across the bag reads as the hood's seam at game distance.
  add(taperedCurve([[-0.12 * W, 0.215 * T, -0.212 * W], [0, 0.18 * T, -0.216 * W], [0.12 * W, 0.215 * T, -0.212 * W]], [0.006, 0.01, 0.006], 4, 6), 'chest', lining);
}

/**
 * Parts CHIBI 2 HAS AND THE PAPER DOLL DOES NOT.
 *
 * `normalizeAvatar` is the 2D catalogue's normaliser: any id it has never heard of is thrown back
 * to the slot's default. That is right for the 2D renderer, which genuinely has no drawing for
 * them — and wrong here, because chibi2-gear.js can build things avatar-2d cannot. Round 11 added
 * two belt lights (`belt_torch` and `wisp_lamp`, for Farhold's "torches need a model on the
 * player") and they silently came out as `none` for exactly this reason.
 *
 * So: normalise as usual, then put back any id that IS one of ours. Add a part to chibi2-gear.js
 * without a matching entry in avatar-2d/js/parts, and its id belongs in here.
 */
export const CHIBI2_ONLY_PARTS = { decor: ['belt_torch', 'wisp_lamp'] };

function normalizeForChibi2(avatar) {
  const a = normalizeAvatar(avatar);
  for (const [slot, ids] of Object.entries(CHIBI2_ONLY_PARTS)) {
    const want = avatar?.[slot]?.id;
    if (want && ids.includes(want)) a[slot] = { ...(a[slot] || {}), id: want };
  }
  return a;
}

function acquire(avatar, anims = CHIBI2_ANIMS) {
  const a = normalizeForChibi2(avatar), rig = createRig(a.body, raceOf(a));
  rig.hold = holdFor(a);            // what the hands carry decides how every clip carries it
  // the clip set is part of the cache key: two characters with different animation sets are not
  // the same template
  const key = JSON.stringify(a) + '|' + anims.length;
  let template = templates.get(key);
  if (!template) {
    template = { parts: buildTemplate(a, rig), clips: createClips(rig, anims), refs: 0, anims };
    templates.set(key, template);
  }
  template.refs++;
  const root = new THREE.Group(); root.name = 'chibi2-body'; root.add(rig.root);
  const skeleton = new THREE.Skeleton(rig.bones);
  for (const part of template.parts) {
    const mesh = new THREE.SkinnedMesh(part.geometry, part.material);
    mesh.name = 'chibi2-' + part.name; mesh.castShadow = true;
    // Conservative bounds include raised weapons and the death pose without scanning skinned vertices.
    mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, rig.height * 0.4, 0), rig.height * 1.5);
    root.add(mesh); mesh.bind(skeleton, new THREE.Matrix4());
  }
  const mixer = new THREE.AnimationMixer(root);
  const actions = Object.fromEntries(template.clips.map(clip => [clip.name, mixer.clipAction(clip)]));
  return { root, rig, mixer, actions, template, skeleton, release() {
    mixer.stopAllAction(); mixer.uncacheRoot(root); skeleton.dispose();
    if (--template.refs === 0) {
      for (const p of template.parts) { p.geometry.dispose(); p.material.dispose(); }
      templates.delete(key);
    }
  } };
}

/**
 * Chibi 2: shared avatar JSON, two skinned meshes, 18 bones and twelve animation states.
 * `opts.swim` adds the three swimming strokes — off by default, because every character pays the
 * build cost of every clip.
 */
export async function createChibi2Character(avatar, opts = {}) {
  const anims = opts.swim ? CHIBI2_ALL_ANIMS : (opts.anims || CHIBI2_ANIMS);
  const group = new THREE.Group(); group.userData.character = true;
  let asset, action, anim = 'idle', elapsed = 0, disposed = false, handsFree = false;
  const gaze = { x: 0, y: 0, tx: 0, ty: 0, next: 0.8 + Math.random() * 1.5 };
  function install(a) {
    const next = acquire(a, anims);
    if (asset) { group.remove(asset.root); asset.release(); }
    asset = next; group.add(asset.root); action = null; elapsed = 0;
    asset.lidded = ['narrow', 'sleepy', 'tired', 'angry'].includes(a?.eyes?.id);   // lidded eyes never glance up under the lid
    asset.mixer.addEventListener('finished', e => { if (e.action === action && anim !== 'dead') play('idle'); });
    play('idle', 0); group.userData.fxHeight = asset.rig.height;
  }
  /**
   * `restart` (2026-09-24): a one-shot that is ALREADY PLAYING is left alone unless the caller asks
   * for it again on purpose. Farhold asks for its attack clip every frame of a swing, and a one-shot
   * used to restart on every ask — so the strike never got past its first frames, which is a large
   * part of why attacks looked stiff. A game that wants back-to-back swings passes `restart: true`
   * when a NEW swing begins (Farhold counts swings on `feel.swing.seq`).
   */
  function play(name, fade = 0.12, restart = false) {
    if (disposed) return;
    if (!anims.includes(name)) name = 'idle';
    const next = asset.actions[name];
    if (next === action && !ONE_SHOTS.has(name)) return;
    if (next === action && ONE_SHOTS.has(name) && !restart && next.isRunning()) return;
    const previous = action;
    next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1);
    next.setLoop(ONE_SHOTS.has(name) ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = ONE_SHOTS.has(name); next.play();
    if (previous && previous !== next) { previous.fadeOut(fade); next.fadeIn(fade); }
    anim = name; action = next;
  }
  install(avatar);
  let rate = 1;                     // clip playback rate; see `setRate`

  return {
    group,
    get anim() { return anim; }, get parts() { return asset.rig.byName; },
    get skeleton() { return asset.skeleton; },
    metrics() { return { totalHeight: asset.rig.height, height: asset.rig.height }; },
    stats() { return { meshes: asset.template.parts.length, bones: asset.rig.bones.length, triangles: asset.template.parts.reduce((n, p) => n + p.geometry.index.count / 3, 0) }; },
    setAnim: play,
    async setAvatar(a) { if (!disposed) install(a); },
    /**
     * How fast the current clip plays, 1 being its own natural pace.
     *
     * A walk cycle is a fixed 1.05 seconds — about two steps a second — and the game moves a body
     * 5.4 metres in that second. That is a 2.7 metre stride on a character a metre and a bit tall,
     * so the legs swing while the feet skate over the ground, and what you see is a model gliding
     * with its knees moving: "he doesn't walk, but my minions do". The creatures did not have the
     * problem because their gait is driven from their own speed.
     *
     * The caller sets this from the speed it is actually moving the body at, so a step lands where
     * a step should land.
     */
    setRate(k) { rate = Math.max(0.15, Math.min(3.5, Number(k) || 1)); },
    get rate() { return rate; },
    update(dt) {
      if (disposed) return;
      const d = Math.min(0.1, Math.max(0, dt)); elapsed += d; asset.mixer.update(d * rate);
      // THE EYES GLANCE instead of blinking. A blink squashed the eye to a line, which on a face this
      // simple read as eyes clamped shut every few seconds; now the iris drifts to a new spot every
      // couple of seconds and settles there, which is what makes a face look alive.
      const bones = asset.rig.byName, H = asset.rig.headScale;
      if (elapsed >= gaze.next) {
        gaze.next = elapsed + 1.4 + Math.random() * 2.6;
        const wide = Math.random() < 0.3;
        gaze.tx = (Math.random() * 2 - 1) * (wide ? 0.02 : 0.009) * H; gaze.ty = (Math.random() * 2 - 1) * (wide ? 0.01 : 0.005) * H;
        if (Math.random() < 0.35) gaze.tx = gaze.ty = 0;
      }
      const k = 1 - Math.exp(-d * 14);
      gaze.x += (gaze.tx - gaze.x) * k; gaze.y += (gaze.ty - gaze.y) * k;
      const dead = anim === 'dead';
      for (const s of ['L', 'R']) {
        bones['pupil' + s].position.set(dead ? 0 : gaze.x, dead ? 0.006 * H : Math.min(gaze.y, asset.lidded ? 0 : gaze.y), 0);
        bones['eye' + s].scale.y = dead ? 0.55 : 1;
      }
      if (handsFree) for (const s of ['L', 'R']) bones['grip' + s].scale.setScalar(0.001);
    },
    /**
     * Put what is in the hands away (true) or bring it back (false). The emotes and `wave` do this on
     * their own; this is for a game that wants empty hands for its own reasons.
     */
    setHandsFree(v) { handsFree = !!v; if (!v) for (const s of ['L', 'R']) asset.rig.byName['grip' + s].scale.setScalar(1); },
    get handsFree() { return handsFree; },
    get hold() { return asset.rig.hold; },
    dispose() { if (disposed) return; disposed = true; group.remove(asset.root); asset.release(); },
  };
}

export function chibi2CacheStats() { return { templates: templates.size, references: [...templates.values()].reduce((n, t) => n + t.refs, 0) }; }
