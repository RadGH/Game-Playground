import * as THREE from 'three';
import { normalizeAvatar, shade } from '../../avatar-2d/js/render.js';
import { profile, taperedCurve, createRig, SkinBuilder } from './chibi2-geometry.js';
import { createClips, CHIBI2_ANIMS, CHIBI2_ALL_ANIMS, CHIBI2_SWIM_ANIMS, ONE_SHOTS } from './chibi2-motion.js';
import { buildGear, CAPELETS } from './chibi2-gear.js';

export { CHIBI2_ANIMS, CHIBI2_SWIM_ANIMS, CHIBI2_ALL_ANIMS };
const templates = new Map();
const sphere = () => new THREE.SphereGeometry(1, 10, 6);
const ring = (r, tube) => new THREE.TorusGeometry(r, tube, 4, 12);

function buildTemplate(a, rig) {
  const b = new SkinBuilder(rig), H = rig.headScale, W = rig.wide, T = rig.torso;
  rig.byName.eyeL.rotation.z = -(a.eyes.rot || 0) * Math.PI / 180;
  rig.byName.eyeR.rotation.z = (a.eyes.rot || 0) * Math.PI / 180;
  rig.root.updateMatrixWorld(true);
  const skin = a.body.skin, hair = a.hair.color, cloth = a.top.color, lining = shade(cloth, -0.28);
  const trim = '#d9b477', leather = '#493c36', steel = '#c4d4d6', darkSteel = '#536a73';
  const armor = /plate|mail|armor|cuirass|knight|paladin/.test(a.top.id);
  const longTop = /robe|dress|coat/.test(a.top.id);
  const add = (...args) => b.add(...args);
  const ellipsoid = (bone, color, position, scale, options = {}) => add(sphere(), bone, color, { position, scale, ...options });
  const strip = (bone, points, radius, color, options = {}) => add(taperedCurve(points, [radius, radius, radius], 4, 4), bone, color, options);
  const head = (g, color, options = {}) => add(g, 'head', color, { ...options, position: (options.position || [0, 0, 0]).map(v => v * H), scale: (options.scale || [1, 1, 1]).map(v => v * H) });

  add(profile([[-0.11, 0.13, 0.11], [-0.1, 0.20, 0.13], [0.02, 0.19, 0.13], [0.06, 0.12, 0.10]], 12), 'hips', a.bottom.color, { scale: [W, 1, W] });
  add(profile([[-0.14, 0.18, 0.115], [-0.11, 0.215, 0.14], [0.04, 0.20, 0.13], [0.18, 0.245, 0.14], [0.27, 0.22, 0.115], [0.30, 0.10, 0.07]], 16), 'chest', cloth, { scale: [W, T, W] });
  add(profile([[0.27, 0.07, 0.06], [0.4, 0.063, 0.057]], 10), 'chest', skin, { scale: [1, T, 1] });
  add(profile([[-0.115, 0.217, 0.145], [-0.07, 0.217, 0.145]], 12), 'chest', leather, { scale: [W, T, W] });
  ellipsoid('chest', trim, [0, -0.09 * T, 0.15 * W], [0.047, 0.035, 0.013], { metal: true });
  ellipsoid('chest', leather, [0, -0.09 * T, 0.163 * W], [0.027, 0.018, 0.008]);
  // Jacket opening and raised collar, with stitched hems.
  for (const s of [-1, 1]) {
    strip('chest', [[s * 0.08 * W, 0.295 * T, 0.073 * W], [s * 0.12 * W, 0.20 * T, 0.132 * W], [s * 0.03 * W, 0.07 * T, 0.139 * W]], 0.016, lining);
    strip('chest', [[s * 0.205 * W, -0.12 * T, 0.05], [s * 0.13 * W, -0.135 * T, 0.126 * W], [s * 0.018, -0.135 * T, 0.15 * W]], 0.01, trim);
    for (let i = 0; i < 3; i++) ellipsoid('chest', trim, [s * 0.065, 0.10 - i * 0.05, 0.145 * W], [0.012, 0.012, 0.008], { metal: true });
  }
  // Cross-body strap and pouch remain part of the two shared material buckets.
  strip('chest', [[-0.16 * W, 0.25 * T, 0.12 * W], [0, 0.10, 0.15 * W], [0.16 * W, -0.06, 0.14 * W]], 0.024, leather);
  ellipsoid('chest', trim, [-0.04, 0.13, 0.171 * W], [0.027, 0.031, 0.014], { metal: true });
  ellipsoid('hips', leather, [0.20 * W, -0.07, 0.10], [0.075, 0.095, 0.045]);
  ellipsoid('hips', trim, [0.20 * W, -0.06, 0.147], [0.015, 0.012, 0.006], { metal: true });
  if (armor) {
    add(profile([[-0.025, 0.16, 0.07, 0.08], [0.02, 0.2, 0.065, 0.092], [0.17, 0.22, 0.066, 0.087], [0.235, 0.12, 0.04, 0.08]], 12), 'chest', steel, { scale: [W, T, W], metal: true });
    strip('chest', [[0, 0.19, 0.166 * W], [0, 0.08, 0.169 * W], [0, 0, 0.16 * W]], 0.009, trim, { metal: true });
  }
  if (longTop) add(profile([[-0.27, 0.27, 0.18], [-0.23, 0.265, 0.18], [-0.02, 0.20, 0.14], [0.07, 0.18, 0.13]], 14), 'hips', cloth, { scale: [W, 1, W] });
  const topId = a.top.id;
  if (topId === 'hoodie' || topId === 'high_collar_robe') {
    add(profile([[0.23, 0.19, 0.15], [0.31, 0.22, 0.16], [0.38, 0.13, 0.11]], 12), 'chest', lining, { scale: [W, T, W] });
  }
  if (topId === 'tunic') {
    // Tunic: a short flared hem over the hips and a laced neckline.
    add(profile([[-0.19, 0.228, 0.162], [-0.12, 0.218, 0.152], [-0.02, 0.203, 0.14]], 14), 'hips', cloth, { scale: [W, 1, W] });
    add(profile([[-0.195, 0.23, 0.164], [-0.182, 0.23, 0.164]], 14), 'hips', lining, { scale: [W, 1, W] });
    for (let i = 0; i < 3; i++) strip('chest', [[-0.025, (0.26 - i * 0.04) * T, 0.12 * W], [0.025, (0.24 - i * 0.04) * T, 0.13 * W]], 0.005, lining);
  }
  if (topId === 'vest' || topId === 'leather' || topId === 'strapped_leather') {
    strip('chest', [[-0.19 * W, 0.27 * T, 0.13], [-0.12 * W, -0.08, 0.16], [-0.08 * W, -0.14, 0.14]], 0.018, trim);
    strip('chest', [[0.19 * W, 0.27 * T, 0.13], [0.12 * W, -0.08, 0.16], [0.08 * W, -0.14, 0.14]], 0.018, trim);
  }
  if (topId === 'chainmail') for (let i = 0; i < 5; i++) strip('chest', [[-0.18, 0.19 - i * 0.06, 0.14], [0.18, 0.19 - i * 0.06, 0.14]], 0.006, darkSteel, { metal: true });
  if (topId === 'dress' || topId === 'coat' || topId === 'sash_robe' || topId === 'trim_robe') add(profile([[-0.27, 0.24, 0.17], [-0.18, 0.29, 0.19], [0.08, 0.23, 0.15]], 14), 'hips', cloth, { scale: [W, 1, W] });
  if (topId === 'apron' || topId === 'smith_apron') add(profile([[-0.21, 0.16, 0.19], [-0.04, 0.18, 0.18], [0.12, 0.13, 0.14]], 10), 'hips', a.top.color2 || trim, { scale: [W, 1, W] });
  if (topId === 'doublet') for (const s of [-1, 1]) strip('chest', [[s * 0.19 * W, 0.28 * T, 0.15], [s * 0.19 * W, -0.08, 0.16]], 0.018, a.top.color2 || trim);
  if (topId === 'fur_tunic') for (const s of [-1, 1]) strip('chest', [[s * 0.20 * W, 0.29 * T, 0.11], [s * 0.27 * W, 0.15 * T, 0.08]], 0.035, a.top.color2 || lining);
  if (topId === 'open_coat' || topId === 'coat' || topId === 'trench') for (const s of [-1, 1]) add(profile([[s * 0.05, -0.02, 0.13], [s * 0.16, -0.18, 0.13], [s * 0.25, -0.30, 0.10]], 8), 'hips', cloth, { scale: [W, 1, W] });
  if (topId === 'silks') {
    // Fitted silks: one sash across the chest and a knotted waist sash with a hanging tail.
    strip('chest', [[-0.20 * W, 0.24 * T, 0.12 * W], [0, 0.10, 0.155 * W], [0.20 * W, -0.04, 0.14 * W]], 0.028, a.top.color2 || lining);
    add(profile([[-0.13, 0.215, 0.145], [-0.08, 0.215, 0.145]], 14), 'chest', a.top.color2 || lining, { scale: [W, T, W] });
    strip('hips', [[-0.14 * W, 0.0, 0.14 * W], [-0.17 * W, -0.10, 0.155 * W], [-0.15 * W, -0.20, 0.16 * W]], 0.022, a.top.color2 || lining);
  }
  if (topId === 'sash_robe') {
    // Layered robe: crossed collar and a wide sash with a tail at the side.
    for (const s of [-1, 1]) strip('chest', [[s * 0.10 * W, 0.29 * T, 0.09 * W], [-s * 0.04 * W, 0.10, 0.155 * W]], 0.022, a.top.color2 || lining);
    add(profile([[-0.10, 0.225, 0.155], [-0.03, 0.225, 0.155]], 14), 'chest', a.top.color2 || lining, { scale: [W, T, W] });
    strip('hips', [[0.17 * W, 0.0, 0.12 * W], [0.21 * W, -0.14, 0.13 * W], [0.19 * W, -0.26, 0.15 * W]], 0.03, a.top.color2 || lining);
  }
  if (topId === 'trim_robe') {
    // Trimmed robe: a contrasting band down the front opening and around the collar.
    strip('chest', [[0, 0.30 * T, 0.10 * W], [0, 0.12, 0.155 * W], [0, -0.10, 0.145 * W]], 0.02, a.top.color2 || trim);
    strip('hips', [[0, 0.02, 0.15 * W], [0, -0.14, 0.195 * W], [0, -0.26, 0.20 * W]], 0.02, a.top.color2 || trim);
    add(profile([[0.285 * T, 0.13, 0.10], [0.30 * T, 0.13, 0.10]], 12), 'chest', a.top.color2 || trim);
  }
  if (topId === 'wraps') for (let i = 0; i < 4; i++) strip('chest', [[-0.20, 0.16 - i * 0.06, 0.14], [0.20, 0.16 - i * 0.06, 0.14]], 0.009, i % 2 ? lining : cloth);
  if (topId === 'surcoat' || topId === 'scale_plate') add(profile([[-0.19, 0.20, 0.17], [-0.05, 0.23, 0.19], [0.16, 0.15, 0.15]], 10), 'hips', a.top.color2 || trim, { scale: [W, 1, W] });
  const bottomId = a.bottom.id;
  if (bottomId === 'skirt') add(profile([[-0.29, 0.19, 0.13], [-0.25, -0.08, 0.17], [0.24, -0.08, 0.17], [0.29, 0.19, 0.13]], 12), 'hips', a.bottom.color, { scale: [W, 1, W] });
  if (bottomId === 'baggy') add(profile([[-0.25, 0.14, 0.12], [-0.31, -0.18, 0.13], [0.28, -0.18, 0.13], [0.25, 0.14, 0.12]], 10), 'hips', a.bottom.color, { scale: [W, 1, W] });
  if (bottomId === 'ragged') for (const s of [-1, 1]) strip('hips', [[s * 0.08, 0.12, 0.14], [s * 0.18, -0.12, 0.145]], 0.012, lining);

  for (const [side, s] of [['L', -1], ['R', 1]]) {
    const arm = 'arm' + side, elbow = 'elbow' + side, hand = 'hand' + side;
    // One continuous sleeve with blended skin weights at the elbow.
    add(profile([[-0.405, 0.057, 0.063], [-0.37, 0.074, 0.072], [-0.26, 0.072, 0.071], [-0.21, 0.07, 0.068], [-0.17, 0.076, 0.074], [-0.065, 0.093, 0.087], [0.025, 0.07, 0.07], [0.045, 0.01, 0.01]], 10), arm, cloth, { scale: [1, T, 1], bend: { bone: elbow, at: 0.21 * T, width: 0.075 * T } });
    add(profile([[-0.2 * T, 0.064, 0.068], [-0.16 * T, 0.077, 0.078], [-0.06 * T, 0.074, 0.075]], 10), elbow, armor ? darkSteel : leather, { metal: armor });
    add(ring(0.074, 0.009), elbow, trim, { position: [0, -0.17 * T, 0], rotation: [Math.PI / 2, 0, 0], metal: true });
    ellipsoid(hand, skin, [0, -0.035, 0.003], [0.065, 0.082, 0.061]);
    ellipsoid(hand, shade(skin, -0.05), [-s * 0.046, -0.013, 0.025], [0.03, 0.043, 0.034]);
    for (let i = 0; i < 2; i++) strip(hand, [[-0.033, -0.043 - i * 0.018, 0.054], [0, -0.048 - i * 0.018, 0.061], [0.027, -0.043 - i * 0.018, 0.054]], 0.0026, shade(skin, -0.26));
    if (armor && a.decor?.id !== 'pauldrons') { // decor pauldrons replace the plate top's own shoulder caps
      ellipsoid(arm, darkSteel, [s * 0.015, 0.008, 0], [0.132, 0.074, 0.117], { metal: true });
      ellipsoid(arm, steel, [s * 0.025, 0.038, 0], [0.126, 0.066, 0.112], { metal: true });
      ellipsoid(arm, trim, [s * 0.023, 0.053, 0.102], [0.015, 0.016, 0.008], { metal: true });
    }
    const leg = 'leg' + side, knee = 'knee' + side, foot = 'foot' + side, L = rig.leg;
    add(profile([[-L + 0.08, 0.075, 0.078], [-L * 0.63, 0.080, 0.085], [-L * 0.51, 0.084, 0.088], [-L * 0.39, 0.095, 0.094], [-0.10, 0.105, 0.104], [-0.03, 0.097, 0.085], [0.025, 0.01, 0.01]], 10), leg, a.bottom.color, { bend: { bone: knee, at: L * 0.51, width: 0.07 } });
    add(profile([[-L * 0.49 + 0.02, 0.077, 0.079], [-L * 0.49 + 0.08, 0.081, 0.087], [-0.07, 0.098, 0.10], [-0.035, 0.105, 0.104]], 10), knee, a.shoes.color);
    add(ring(0.103, 0.012), knee, lining, { position: [0, -0.04, 0], rotation: [Math.PI / 2, 0, 0] });
    const shoeId = a.shoes.id, barefoot = shoeId === 'barefoot', footColor = barefoot ? skin : a.shoes.color;
    ellipsoid(foot, footColor, [0, -0.005, 0.047], barefoot ? [0.10, 0.055, 0.145] : shoeId === 'heavy' ? [0.12, 0.075, 0.17] : shoeId === 'slippers' ? [0.115, 0.055, 0.145] : [0.103, 0.062, 0.159]);
    if (shoeId === 'sandals') for (const z of [0.02, 0.075]) strip(foot, [[-0.07, 0.02, z], [0, 0.055, z + 0.01], [0.07, 0.02, z]], 0.009, leather);
    if (shoeId === 'heavy') add(ring(0.11, 0.018), foot, darkSteel, { position: [0, -0.025, 0.02], rotation: [Math.PI / 2, 0, 0], metal: true });
    add(profile([[-0.066, 0.075, 0.12, 0.048], [-0.05, 0.105, 0.154, 0.048], [-0.035, 0.104, 0.15, 0.048]], 12), foot, '#2c3032');
    strip(foot, [[-0.075, 0.025, 0.12], [0, 0.052, 0.14], [0.075, 0.025, 0.12]], 0.008, trim);
    for (const z of [0.02, 0.065]) strip(foot, [[-0.035, 0.049, z], [0, 0.056, z + 0.008], [0.035, 0.049, z]], 0.006, lining);
  }

  const faceWidth = ['wide', 'square'].includes(a.headShape) ? 1.07 : a.headShape === 'long' ? 0.92 : a.headShape === 'oval' ? 0.95 : 1;
  const faceDepth = ['square', 'chiseled'].includes(a.headShape) ? 1.04 : a.headShape === 'wide' ? 0.94 : 1;
  const jaw = a.headShape === 'heart' ? 0.86 : a.headShape === 'chiseled' ? 1.06 : a.headShape === 'oval' ? 0.93 : 1;
  head(profile([[-0.035, 0.10, 0.09], [0.005, 0.22, 0.195], [0.105, 0.30, 0.249], [0.25, 0.335, 0.271], [0.39, 0.325 * jaw, 0.267], [0.50, 0.265 * jaw, 0.227], [0.57, 0.15 * jaw, 0.143], [0.60, 0.005, 0.006]], 20), skin, { scale: [faceWidth, 1, faceDepth] });
  for (const [side, s] of [['L', -1], ['R', 1]]) {
    if (a.ears.id !== 'none' && !['hood', 'dragon_helm', 'goggles_up'].includes(a.hat.id)) { // Hoods, the dragon helm and the aviator cap's flaps cover the ears.
      head(sphere(), skin, { position: [s * 0.325 * faceWidth, 0.225, 0.0], scale: a.ears.id === 'pointed' ? [0.105, 0.10, 0.044] : [0.058, 0.091, 0.043], rotation: [0, 0, -s * 0.22] });
      head(sphere(), shade(skin, -0.18), { position: [s * 0.339 * faceWidth, 0.227, 0.036], scale: [0.022, 0.049, 0.009] });
    }
    const eye = 'eye' + side, eyeId = a.eyes.id, eyeSize = THREE.MathUtils.clamp(a.eyes.scale || 1, 0.5, 1.6);
    const dx = s * (a.eyes.x || 0) * 0.035 * H, dy = (a.eyes.y || 0) * -0.045 * H;
    const closed = eyeId === 'happy' || (eyeId === 'wink' && side === 'R');
    const narrow = eyeId === 'narrow' || eyeId === 'sleepy' || eyeId === 'tired' || eyeId === 'angry';
    const dot = eyeId === 'dot', hollow = eyeId === 'hollow';
    const almond = eyeId === 'almond';
    const ex = (dot ? 0.052 : narrow ? 0.078 : almond ? 0.09 : 0.082) * H * eyeSize, ey = (dot ? 0.052 : narrow ? 0.062 : almond ? 0.08 : 0.10) * H * eyeSize;
    if (closed) {
      add(taperedCurve([[dx - s * ex, dy + 0.01 * H, 0.034 * H], [dx, dy - 0.03 * H, 0.038 * H], [dx + s * ex, dy + 0.01 * H, 0.034 * H]], [0.009, 0.013, 0.009], 5, 6), eye, '#443333');
    } else if (eyeId === 'glow' || eyeId === 'glow_tear') {
      // Glowing eyes: no iris or pupil, a lit fill in the eye colour and a small highlight; glow_tear adds a light trail.
      const glow = '#' + new THREE.Color(a.eyes.color).lerp(new THREE.Color('#ffffff'), 0.3).getHexString();
      ellipsoid(eye, '#' + new THREE.Color(a.eyes.color).multiplyScalar(0.35).getHexString(), [dx, dy, 0], [ex * 1.1, ey * 1.1, 0.016 * H]);
      ellipsoid(eye, glow, [dx, dy - 0.004 * H, 0.014 * H], [ex * 0.92, ey * 0.92, 0.018 * H]);
      ellipsoid(eye, '#ffffff', [dx - s * 0.02 * H, dy + 0.025 * H, 0.03 * H], [0.02 * H, 0.016 * H, 0.006 * H]);
      if (eyeId === 'glow_tear') { const bx = s * 0.12 * H + dx + s * 0.02 * H, by = 0.25 * H + dy; add(taperedCurve([[bx, by - ey * 0.8, 0.268 * H], [bx + s * 0.01 * H, by - ey * 1.6, 0.27 * H], [bx, by - ey * 2.3, 0.262 * H]], [0.012, 0.01, 0.004], 4, 5), 'head', glow); }
    } else if (dot) {
      ellipsoid(eye, '#17272c', [dx, dy, 0.028 * H], [ex, ey, 0.013 * H]);
      ellipsoid(eye, '#ffffff', [dx - s * 0.012 * H, dy + 0.014 * H, 0.043 * H], [0.012 * H, 0.014 * H, 0.004 * H]);
    } else {
      ellipsoid(eye, hollow ? '#1c2325' : '#443333', [dx, dy, 0], [ex * 1.08, ey * 1.08, 0.016 * H]);
      ellipsoid(eye, hollow ? '#7bd6c8' : '#fff8e8', [dx, dy - 0.007 * H, 0.012 * H], [ex * 0.88, ey * 0.88, 0.017 * H]);
      if (!hollow) {
        const irisY = eyeId === 'wide' || eyeId === 'anime' ? -0.008 : -0.012;
        ellipsoid(eye, a.eyes.color, [dx + s * 0.006 * H, dy + irisY * H, 0.029 * H], [ex * 0.65, ey * 0.72, 0.012 * H]);
        ellipsoid(eye, '#17272c', [dx + s * 0.006 * H, dy + (irisY + 0.003) * H, 0.038 * H], [ex * 0.36, ey * 0.48, 0.008 * H]);
        ellipsoid(eye, '#ffffff', [dx - s * 0.013 * H, dy + 0.02 * H, 0.047 * H], [0.014 * H, 0.017 * H, 0.005 * H]);
      }
    }
    if (eyeId === 'slit') add(taperedCurve([[dx, dy - ey * 0.55, 0.045 * H], [dx, dy, 0.047 * H], [dx, dy + ey * 0.55, 0.045 * H]], [0.008, 0.012, 0.008], 4, 4), eye, '#17272c');
    if (narrow) add(taperedCurve([[dx - s * ex, dy - ey * 0.55, 0.045 * H], [dx, dy - ey * 0.78, 0.048 * H], [dx + s * ex, dy - ey * 0.55, 0.045 * H]], [0.006, 0.009, 0.006], 4, 4), eye, '#443333');
    // Per-style lids: angry slants down toward the nose, sleepy has a heavy skin lid, tired adds bags, almond a lash flick.
    if (eyeId === 'angry') add(taperedCurve([[dx - s * ex * 1.05, dy + ey * 0.35, 0.05 * H], [dx, dy + ey * 0.8, 0.052 * H], [dx + s * ex * 1.1, dy + ey * 1.05, 0.05 * H]], [0.012, 0.01, 0.006], 4, 4), eye, '#443333');
    if (eyeId === 'sleepy') ellipsoid(eye, shade(skin, -0.04), [dx, dy + ey * 0.55, 0.036 * H], [ex * 1.12, ey * 0.7, 0.022 * H]);
    if (eyeId === 'tired') for (const k of [1.25, 1.5]) add(taperedCurve([[dx - s * ex * 0.8, dy - ey * k, 0.04 * H], [dx, dy - ey * (k + 0.2), 0.042 * H], [dx + s * ex * 0.8, dy - ey * k, 0.04 * H]], [0.003, 0.005, 0.003], 4, 4), eye, shade(skin, -0.25));
    if (almond) add(taperedCurve([[dx + s * ex * 0.55, dy + ey * 0.75, 0.05 * H], [dx + s * ex * 1.05, dy + ey * 0.55, 0.05 * H], [dx + s * ex * 1.3, dy + ey * 0.8, 0.046 * H]], [0.009, 0.008, 0.003], 4, 4), eye, '#443333');
    // Brows are separate modeled locks, so the expression survives when the eye style changes.
    const brow = a.brows.id, browY = (a.brows.y || 0) * -0.035 * H, browX = (a.brows.x || 0) * 0.02 * H;
    if (brow !== 'none') {
      const tilt = brow === 'angry' ? -s * 0.20 : brow === 'worried' ? s * 0.16 : brow === 'raised' ? -s * 0.12 : 0;
      const thick = brow === 'thick' || brow === 'angry' ? 0.018 : brow === 'thin' ? 0.008 : 0.012;
      add(taperedCurve([[dx - s * 0.082 * H + browX, dy + 0.115 * H + browY, 0.044 * H], [dx + tilt * H, dy + (0.135 + Math.abs(tilt) * 0.15) * H + browY, 0.048 * H], [dx + s * 0.082 * H + browX, dy + 0.115 * H + browY, 0.044 * H]], [thick, thick * 1.2, thick], 5, 5), 'head', hair);
    }
    head(taperedCurve([[s * 0.052, 0.361, 0.272], [s * 0.115, 0.378, 0.267], [s * 0.184, 0.355, 0.24]], [0.014, 0.019, 0.008], 5, 5), hair);
    head(sphere(), shade(skin, -0.055), { position: [s * 0.215, 0.13, 0.216], scale: [0.044, 0.024, 0.011] });
  }
  head(sphere(), shade(skin, 0.035), { position: [0, 0.177, 0.278], scale: [0.041, 0.042, 0.047] });
  const mouthScale = THREE.MathUtils.clamp(a.mouth.scale || 1, 0.5, 1.8), mouthY = -(a.mouth.y || 0) * 0.025, mouth = a.mouth.id;
  const mouthColor = shade(a.mouth.color, -0.30), mouthPts = mouth === 'frown' ? [[-0.066, 0.071], [0, 0.095], [0.066, 0.071]] : mouth === 'smirk' ? [[-0.066, 0.088], [0.01, 0.081], [0.066, 0.058]] : [[-0.066, 0.095], [0, 0.071], [0.066, 0.095]];
  if (mouth === 'open' || mouth === 'o' || mouth === 'sad_open') ellipsoid('head', '#3a1518', [0, mouthY + (mouth === 'o' ? 0.075 : 0.082), 0.257], [mouth === 'o' ? 0.033 : 0.055, mouth === 'o' ? 0.033 : 0.043, 0.012]);
  else add(taperedCurve(mouthPts.map(([x, y]) => [x * mouthScale, y + mouthY, 0.257]), [0.004, mouth === 'neutral' ? 0.005 : 0.008, 0.004], 5, 8), 'head', mouthColor, { bone: 'head' });
  if (mouth === 'grin') strip('head', [[-0.07, 0.084 + mouthY, 0.26], [0, 0.066 + mouthY, 0.261], [0.07, 0.084 + mouthY, 0.26]], 0.018, '#fff8e8');
  if (mouth === 'fangs' || mouth === 'tusks') for (const s of [-1, 1]) head(new THREE.ConeGeometry(0.018, mouth === 'tusks' ? 0.09 : 0.055, 5), '#f2f0dc', { position: [s * 0.045, 0.068 + mouthY, 0.268], rotation: [Math.PI, 0, 0] });
  head(taperedCurve([[-0.032, 0.054, 0.239], [0, 0.050, 0.244], [0.028, 0.056, 0.24]], [0.002, 0.003, 0.001], 4, 4), shade(skin, -0.16));

  const nose = a.nose.id, noseScale = THREE.MathUtils.clamp(a.nose.scale || 1, 0.5, 1.7), noseY = 0.177 + (a.nose.y || 0) * -0.035;
  if (nose !== 'none') {
    const ns = nose === 'wide' || nose === 'snout' ? [0.075, 0.042, 0.052] : nose === 'long' || nose === 'hook' ? [0.035, 0.075, 0.065] : nose === 'button' ? [0.055, 0.05, 0.052] : nose === 'dot' ? [0.026, 0.026, 0.028] : [0.041, 0.052, 0.045];
    ellipsoid('head', shade(skin, -0.055), [0, noseY, 0.282], ns.map(v => v * noseScale));
    if (nose === 'snout') { ellipsoid('head', '#2a2222', [-0.025, noseY, 0.326], [0.014, 0.009, 0.008]); ellipsoid('head', '#2a2222', [0.025, noseY, 0.326], [0.014, 0.009, 0.008]); }
  }

  if (a.hair.id !== 'bald') {
    const hairId = a.hair.id;
    const headwearCoversCrown = ['feather_cap', 'bard_red_feather', 'horned_helm', 'dragon_helm', 'hood', 'wide_brim', 'goggles_up'].includes(a.hat.id);
    // A raised hood tucks away everything outside the face opening; only a fringe shows under its brow.
    const hoodUp = a.hat.id === 'hood', fringeUnder = hoodUp || a.hat.id === 'goggles_up';
    const cap = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const p = cap.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      p.setXYZ(i, x * 0.348, 0.32 + y * 0.31 + Math.max(0, z) * 0.055, z * 0.28 - 0.012);
    }
    cap.computeVertexNormals();
    if (!headwearCoversCrown && !['afro', 'mohawk'].includes(hairId)) head(cap, hairId === 'buzz' ? shade(hair, -0.12) : hair, { scale: hairId === 'buzz' ? [0.995, 0.97, 0.995] : [1, 1, 1] }); // buzz stays outside the skull top (0.60)
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
      for (let i = 0; i < 5; i++) head(taperedCurve([[0, 0.34 + i * 0.03, 0.18], [0, 0.54 + i * 0.02, 0.14], [0, 0.83 - i * 0.035, 0.03]], [0.08, 0.07, 0.008], 5, 5), i % 2 ? shade(hair, 0.10) : hair);
    }
    if (hairId === 'pixie' && !hoodUp) for (const s of [-1, 1]) head(taperedCurve([[s * 0.06, 0.48, 0.12], [s * 0.18, 0.39, 0.25], [s * 0.30, 0.25, 0.12]], [0.07, 0.06, 0.008], 6, 6), hair);
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
  if (a.facialHair.id === 'stubble') head(profile([[0.12, 0.20, 0.13], [0.23, 0.25, 0.17], [0.38, 0.22, 0.15]], 12), shade(hair, -0.12), { scale: [1, 0.7, 0.35] });
  if (a.facialHair.id === 'mustache') head(taperedCurve([[-0.11, 0.17, 0.272], [0, 0.19, 0.286], [0.11, 0.17, 0.272]], [0.025, 0.032, 0.025], 6, 6), hair);
  if (a.facialHair.id === 'goatee') head(taperedCurve([[0, 0.12, 0.27], [0, 0.055, 0.275], [0, -0.005, 0.235]], [0.035, 0.045, 0.012], 6, 5), hair);
  if (a.facialHair.id === 'soul_patch') head(sphere(), hair, { position: [0, 0.05, 0.262], scale: [0.03, 0.028, 0.012] });
  if (a.facialHair.id === 'full' || a.facialHair.id === 'long') head(profile([[-0.11, 0.025, 0.015, 0.13], [-0.015, 0.17, 0.067, 0.18], [0.08, 0.20, 0.075, 0.16]], 12), hair);
  if (a.facialHair.id === 'long') head(taperedCurve([[0, -0.05, 0.19], [0, -0.20, 0.21], [0.01, -0.33, 0.17]], [0.11, 0.07, 0.01], 7, 6), hair);
  if (a.facialHair.id === 'chinstrap') head(taperedCurve([[-0.31, 0.24, 0.07], [-0.25, 0.06, 0.18], [0, -0.01, 0.235], [0.25, 0.06, 0.18], [0.31, 0.24, 0.07]], [0.02, 0.026, 0.03, 0.026, 0.02], 5, 14), hair);
  if (a.extras.id === 'freckles') for (const s of [-1, 1]) for (let i = 0; i < 3; i++) ellipsoid('head', shade(skin, -0.16), [s * (0.12 + i * 0.045), 0.13 - (i % 2) * 0.03, 0.273], [0.009, 0.009, 0.004]);
  if (a.extras.id === 'blush') for (const s of [-1, 1]) ellipsoid('head', a.extras.color, [s * 0.20, 0.125, 0.267], [0.09, 0.035, 0.008]);
  if (a.extras.id === 'third_eye') { ellipsoid('head', '#fff8e8', [0, 0.36, 0.255], [0.065, 0.042, 0.012]); ellipsoid('head', a.eyes.color, [0, 0.36, 0.27], [0.028, 0.028, 0.008]); }
  if (a.extras.id === 'scar' || a.extras.id === 'scar_cheek') strip('head', [[a.extras.id === 'scar' ? -0.18 : 0.17, 0.27, 0.27], [a.extras.id === 'scar' ? -0.10 : 0.23, 0.15, 0.274], [a.extras.id === 'scar' ? -0.04 : 0.29, 0.05, 0.27]], 0.009, a.extras.color);
  if (a.accessory.id === 'glasses' || a.accessory.id === 'round_glasses') for (const s of [-1, 1]) { const round = a.accessory.id === 'round_glasses'; add(round ? ring(0.105, 0.012) : new THREE.RingGeometry(0.075, 0.09, 12), 'head', a.accessory.color, { position: [s * 0.125, 0.27, 0.285], rotation: [Math.PI / 2, 0, 0], scale: [1, 0.78, 1], bone: 'head' }); }
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
  }
  // Held and off-hand items, accessories, marks, capes, greaves and decorations live in chibi2-gear.js.
  buildGear(a, { add, head, ellipsoid, strip, H, W, T, L: rig.leg, trim, leather, steel, darkSteel, skin, faceWidth, faceDepth });
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

function acquire(avatar, anims = CHIBI2_ANIMS) {
  const a = normalizeAvatar(avatar), rig = createRig(a.body);
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
  let asset, action, anim = 'idle', elapsed = 0, disposed = false;
  function install(a) {
    const next = acquire(a, anims);
    if (asset) { group.remove(asset.root); asset.release(); }
    asset = next; group.add(asset.root); action = null; elapsed = 0;
    asset.mixer.addEventListener('finished', e => { if (e.action === action && anim !== 'dead') play('idle'); });
    play('idle', 0); group.userData.fxHeight = asset.rig.height;
  }
  function play(name, fade = 0.12) {
    if (disposed) return;
    if (!anims.includes(name)) name = 'idle';
    const next = asset.actions[name];
    if (next === action && !ONE_SHOTS.has(name)) return;
    const previous = action;
    next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1);
    next.setLoop(ONE_SHOTS.has(name) ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = ONE_SHOTS.has(name); next.play();
    if (previous && previous !== next) { previous.fadeOut(fade); next.fadeIn(fade); }
    anim = name; action = next;
  }
  install(avatar);
  return {
    group,
    get anim() { return anim; }, get parts() { return asset.rig.byName; },
    get skeleton() { return asset.skeleton; },
    metrics() { return { totalHeight: asset.rig.height, height: asset.rig.height }; },
    stats() { return { meshes: asset.template.parts.length, bones: asset.rig.bones.length, triangles: asset.template.parts.reduce((n, p) => n + p.geometry.index.count / 3, 0) }; },
    setAnim: play,
    async setAvatar(a) { if (!disposed) install(a); },
    update(dt) {
      if (disposed) return;
      const d = Math.min(0.1, Math.max(0, dt)); elapsed += d; asset.mixer.update(d);
      const blinkTime = elapsed % 3.7, blink = anim === 'dead' ? 0.05 : 1 - 0.95 * Math.max(0, 1 - Math.abs(blinkTime - 3.5) / 0.075);
      asset.rig.byName.eyeL.scale.y = asset.rig.byName.eyeR.scale.y = blink;
    },
    dispose() { if (disposed) return; disposed = true; group.remove(asset.root); asset.release(); },
  };
}

export function chibi2CacheStats() { return { templates: templates.size, references: [...templates.values()].reduce((n, t) => n + t.refs, 0) }; }
