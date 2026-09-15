import * as THREE from 'three';
import { normalizeAvatar, shade } from '../../avatar-2d/js/render.js';
import { profile, taperedCurve, createRig, SkinBuilder } from './chibi2-geometry.js';
import { createClips, CHIBI2_ANIMS, ONE_SHOTS } from './chibi2-motion.js';

export { CHIBI2_ANIMS };
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
  if (topId === 'wraps' || topId === 'silks') for (let i = 0; i < 4; i++) strip('chest', [[-0.20, 0.16 - i * 0.06, 0.14], [0.20, 0.16 - i * 0.06, 0.14]], 0.009, i % 2 ? lining : cloth);
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
    if (armor) {
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

  const faceWidth = ['wide', 'square'].includes(a.headShape) ? 1.07 : a.headShape === 'long' ? 0.92 : 1;
  const faceDepth = ['square', 'chiseled'].includes(a.headShape) ? 1.04 : a.headShape === 'wide' ? 0.94 : 1;
  const jaw = a.headShape === 'heart' ? 0.86 : a.headShape === 'chiseled' ? 1.06 : 1;
  head(profile([[-0.035, 0.10, 0.09], [0.005, 0.22, 0.195], [0.105, 0.30, 0.249], [0.25, 0.335, 0.271], [0.39, 0.325 * jaw, 0.267], [0.50, 0.265 * jaw, 0.227], [0.57, 0.15 * jaw, 0.143], [0.60, 0.005, 0.006]], 20), skin, { scale: [faceWidth, 1, faceDepth] });
  for (const [side, s] of [['L', -1], ['R', 1]]) {
    if (a.ears.id !== 'none') {
      head(sphere(), skin, { position: [s * 0.325 * faceWidth, 0.225, 0.0], scale: a.ears.id === 'pointed' ? [0.105, 0.10, 0.044] : [0.058, 0.091, 0.043], rotation: [0, 0, -s * 0.22] });
      head(sphere(), shade(skin, -0.18), { position: [s * 0.339 * faceWidth, 0.227, 0.036], scale: [0.022, 0.049, 0.009] });
    }
    const eye = 'eye' + side, eyeId = a.eyes.id, eyeSize = THREE.MathUtils.clamp(a.eyes.scale || 1, 0.5, 1.6);
    const dx = s * (a.eyes.x || 0) * 0.035 * H, dy = (a.eyes.y || 0) * -0.045 * H;
    const closed = eyeId === 'happy' || (eyeId === 'wink' && side === 'R');
    const narrow = eyeId === 'narrow' || eyeId === 'sleepy' || eyeId === 'tired' || eyeId === 'angry';
    const dot = eyeId === 'dot', hollow = eyeId === 'hollow';
    const ex = (dot ? 0.052 : narrow ? 0.078 : 0.082) * H * eyeSize, ey = (dot ? 0.052 : narrow ? 0.062 : 0.10) * H * eyeSize;
    if (closed) {
      add(taperedCurve([[dx - s * ex, dy + 0.01 * H, 0.034 * H], [dx, dy - 0.03 * H, 0.038 * H], [dx + s * ex, dy + 0.01 * H, 0.034 * H]], [0.009, 0.013, 0.009], 5, 6), eye, '#443333');
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
    if (narrow || eyeId === 'angry') add(taperedCurve([[dx - s * ex, dy - ey * 0.55, 0.045 * H], [dx, dy - ey * 0.78, 0.048 * H], [dx + s * ex, dy - ey * 0.55, 0.045 * H]], [0.006, 0.009, 0.006], 4, 4), eye, '#443333');
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
    const headwearCoversCrown = ['feather_cap', 'bard_red_feather', 'horned_helm', 'dragon_helm', 'hood', 'hood_down', 'wide_brim', 'goggles_up'].includes(a.hat.id);
    const cap = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const p = cap.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      p.setXYZ(i, x * 0.348, 0.32 + y * 0.31 + Math.max(0, z) * 0.055, z * 0.28 - 0.012);
    }
    cap.computeVertexNormals();
    if (!headwearCoversCrown && !['afro', 'curly', 'mohawk'].includes(hairId)) head(cap, hair, { scale: hairId === 'buzz' ? [0.97, 0.82, 0.98] : [1, 1, 1] });
    const fringe = hairId === 'short' || hairId === 'long' || hairId === 'wavy';
    if (fringe && !headwearCoversCrown) for (let i = 0; i < 7; i++) {
      const x = (i - 3) * 0.087, arc = 1 - (x / 0.31) ** 2;
      head(taperedCurve([[x - 0.035, 0.53 + arc * 0.06, 0.08], [x + 0.026, 0.49 + arc * 0.01, 0.225], [x + 0.055, 0.365 + (i % 3) * 0.027, 0.262]], [0.048, 0.068, 0.002], 6, 6), i % 3 === 1 ? shade(hair, 0.12) : hair);
    }
    if (hairId === 'side_part' || hairId === 'slicked') {
      for (let i = 0; i < 4; i++) head(taperedCurve([[0.02 + i * 0.055, 0.50, 0.09], [0.08 + i * 0.06, 0.46, 0.235], [0.17 + i * 0.045, 0.39, 0.264]], [0.055, 0.07, 0.006], 6, 6), i % 2 ? shade(hair, 0.12) : hair);
      head(taperedCurve([[-0.26, 0.48, 0.06], [-0.31, 0.30, 0.04], [-0.28, 0.10, 0.03]], [0.075, 0.06, 0.015], 6, 6), shade(hair, -0.08));
    }
    if (hairId === 'bangs') {
      for (let i = 0; i < 7; i++) { const x = (i - 3) * 0.075; head(taperedCurve([[x, 0.49, 0.16], [x + (i - 3) * 0.008, 0.43, 0.245], [x + (i - 3) * 0.012, 0.31, 0.26]], [0.065, 0.075, 0.006], 6, 6), i % 2 ? shade(hair, 0.08) : hair); }
    }
    if (hairId === 'spiky') {
      for (let i = 0; i < 7; i++) { const x = (i - 3) * 0.09; head(taperedCurve([[x, 0.36, 0.20], [x * 1.1, 0.50 + (i % 2) * 0.05, 0.17], [x * 1.2, 0.68 + (i % 3) * 0.06, 0.04]], [0.07, 0.05, 0.004], 5, 5), hair); }
    }
    if (hairId === 'mohawk') {
      for (let i = 0; i < 5; i++) head(taperedCurve([[0, 0.34 + i * 0.03, 0.18], [0, 0.54 + i * 0.02, 0.14], [0, 0.83 - i * 0.035, 0.03]], [0.08, 0.07, 0.008], 5, 5), i % 2 ? shade(hair, 0.10) : hair);
    }
    if (hairId === 'pixie') for (const s of [-1, 1]) head(taperedCurve([[s * 0.06, 0.48, 0.12], [s * 0.18, 0.39, 0.25], [s * 0.30, 0.25, 0.12]], [0.07, 0.06, 0.008], 6, 6), hair);
    if (hairId === 'tonsure') { head(new THREE.TorusGeometry(0.20, 0.055, 6, 14), hair, { position: [0, 0.51, 0.01], rotation: [Math.PI / 2, 0, 0], scale: [1.2, 0.8, 1] }); }
    if (hairId === 'hood_hair') for (const s of [-1, 1]) head(taperedCurve([[s * 0.18, 0.48, 0.05], [s * 0.30, 0.28, 0.10], [s * 0.26, -0.02, 0.03]], [0.11, 0.08, 0.018], 6, 7), hair);
    if ((hairId === 'curly' || hairId === 'afro') && !headwearCoversCrown) for (const [x, y, r] of [[-0.28, 0.40, 0.11], [-0.18, 0.50, 0.10], [0, 0.56, 0.12], [0.18, 0.50, 0.10], [0.28, 0.40, 0.11]]) head(sphere(), hair, { position: [x, y, 0.01], scale: [r, r, r * 0.85] });
    if (hairId === 'mohawk') head(profile([[0.32, 0.09, 0.08], [0.48, 0.11, 0.09], [0.60, 0.035, 0.035]], 8), hair);
    if (!headwearCoversCrown) for (const s of [-1, 1]) head(taperedCurve([[s * 0.28, 0.45, -0.02], [s * 0.335, 0.31, 0.008], [s * 0.30, 0.15, 0.052]], [0.06, 0.043, 0.002], 6, 6), shade(hair, -0.07));
    if (/long|braids|pony|bob/.test(hairId)) for (const s of [-1, 1]) head(taperedCurve([[s * 0.23, 0.42, -0.16], [s * 0.30, 0.13, -0.12], [s * 0.27, -0.16, -0.08]], [0.10, 0.085, 0.015], 6, 7), hair);
    if (hairId === 'ponytail') head(taperedCurve([[0.27, 0.38, -0.10], [0.38, 0.10, -0.13], [0.31, -0.20, -0.08]], [0.11, 0.09, 0.02], 7, 8), hair);
    if (hairId === 'bun' || hairId === 'buns') for (const s of hairId === 'bun' ? [1] : [-1, 1]) head(sphere(), hair, { position: [s * (hairId === 'bun' ? 0 : 0.22), 0.47, -0.04], scale: [0.13, 0.13, 0.11] });
  }
  if (a.facialHair.id === 'stubble') head(profile([[0.12, 0.20, 0.13], [0.23, 0.25, 0.17], [0.38, 0.22, 0.15]], 12), shade(hair, -0.12), { scale: [1, 0.7, 0.35] });
  if (a.facialHair.id === 'mustache') head(taperedCurve([[-0.11, 0.17, 0.272], [0, 0.19, 0.286], [0.11, 0.17, 0.272]], [0.025, 0.032, 0.025], 6, 6), hair);
  if (a.facialHair.id === 'goatee' || a.facialHair.id === 'soul_patch') head(taperedCurve([[0, 0.12, 0.27], [0, 0.055, 0.275], [0, -0.005, 0.235]], [0.035, 0.045, 0.012], 6, 5), hair);
  if (/full|long|chinstrap/.test(a.facialHair.id)) head(profile([[-0.11, 0.025, 0.015, 0.13], [-0.015, 0.17, 0.067, 0.18], [0.08, 0.20, 0.075, 0.16]], 12), hair);
  if (a.extras.id === 'freckles') for (const s of [-1, 1]) for (let i = 0; i < 3; i++) ellipsoid('head', shade(skin, -0.16), [s * (0.12 + i * 0.045), 0.13 - (i % 2) * 0.03, 0.273], [0.009, 0.009, 0.004]);
  if (a.extras.id === 'blush') for (const s of [-1, 1]) ellipsoid('head', a.extras.color, [s * 0.20, 0.125, 0.267], [0.09, 0.035, 0.008]);
  if (a.extras.id === 'third_eye') { ellipsoid('head', '#fff8e8', [0, 0.36, 0.255], [0.065, 0.042, 0.012]); ellipsoid('head', a.eyes.color, [0, 0.36, 0.27], [0.028, 0.028, 0.008]); }
  if (a.extras.id === 'scar' || a.extras.id === 'scar_cheek') strip('head', [[a.extras.id === 'scar' ? -0.18 : 0.17, 0.27, 0.27], [a.extras.id === 'scar' ? -0.10 : 0.23, 0.15, 0.274], [a.extras.id === 'scar' ? -0.04 : 0.29, 0.05, 0.27]], 0.009, a.extras.color);
  if (a.accessory.id === 'glasses' || a.accessory.id === 'round_glasses') for (const s of [-1, 1]) { const round = a.accessory.id === 'round_glasses'; add(round ? ring(0.105, 0.012) : new THREE.RingGeometry(0.075, 0.09, 12), 'head', a.accessory.color, { position: [s * 0.125, 0.27, 0.285], rotation: [Math.PI / 2, 0, 0], scale: [1, 0.78, 1], bone: 'head' }); }
  if (/helmet|helm/.test(a.hat.id)) {
    head(profile([[0.41, 0.353, 0.30], [0.48, 0.335, 0.286], [0.60, 0.20, 0.18], [0.66, 0.02, 0.02]], 16), a.hat.color, { metal: true });
    head(profile([[0.405, 0.357, 0.302], [0.435, 0.357, 0.302]], 16), trim, { metal: true });
  } else if (a.hat.id === 'wizard') {
    head(profile([[0.51, 0.47, 0.36], [0.54, 0.46, 0.355], [0.555, 0.32, 0.25]], 16), a.hat.color);
    head(profile([[0.53, 0.30, 0.23], [0.8, 0.17, 0.145, -0.035], [1.02, 0.09, 0.06, -0.10], [1.08, 0.003, 0.004, -0.18]], 12), a.hat.color);
  } else if (a.hat.id === 'feather_cap' || a.hat.id === 'bard_red_feather') {
    // Bespoke Bard cap: low-poly felt silhouette, stitched brim, band and a head-weighted feather.
    const hat = a.hat.color || '#b02020', feather = a.hat.color2 || '#3aa65a';
    head(new THREE.CylinderGeometry(0.36, 0.47, 0.055, 16), hat, { position: [0, 0.405, 0.025], scale: [1.15, 1, 0.88] });
    head(new THREE.ConeGeometry(0.32, 0.24, 14), hat, { position: [0, 0.55, -0.005], scale: [1, 1, 0.86], rotation: [0.06, 0, -0.08] });
    head(new THREE.TorusGeometry(0.335, 0.018, 5, 16), trim, { position: [0, 0.47, 0], rotation: [Math.PI / 2, 0, 0], scale: [1, 1, 0.86], metal: true });
    head(taperedCurve([[0.05, 0.53, 0.02], [0.14, 0.68, 0.00], [0.19, 0.83, -0.015]], [0.055, 0.045, 0.008], 6, 7), feather);
    head(taperedCurve([[0.06, 0.54, 0.025], [0.16, 0.68, 0.02], [0.22, 0.75, 0.01]], [0.018, 0.013, 0.002], 4, 5), shade(feather, 0.18));
  } else if (a.hat.id === 'hood' || a.hat.id === 'hood_down') {
    const hood = a.hat.color || '#4b536c';
    head(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0.05, Math.PI * 0.58), hood, { position: [0, 0.28, -0.18], scale: [0.43, 0.50, 0.20] });
    head(new THREE.TorusGeometry(0.285, 0.028, 5, 16), trim, { position: [0, 0.19, 0.22], scale: [1, 0.75, 1], metal: true });
    if (a.hat.id === 'hood_down') head(new THREE.TorusGeometry(0.25, 0.045, 5, 14), hood, { position: [0, 0.23, -0.13], rotation: [Math.PI / 2, 0, 0], scale: [1.25, 0.65, 1] });
  } else if (a.hat.id === 'wide_brim') {
    const hat = a.hat.color || '#40352f';
    head(new THREE.CylinderGeometry(0.30, 0.38, 0.18, 14), hat, { position: [0, 0.48, 0], scale: [1, 1, 0.86] });
    head(new THREE.CylinderGeometry(0.54, 0.54, 0.035, 16), hat, { position: [0, 0.40, 0.015], scale: [1, 1, 0.76] });
    head(new THREE.TorusGeometry(0.30, 0.018, 5, 16), trim, { position: [0, 0.47, 0], rotation: [Math.PI / 2, 0, 0], scale: [1, 1, 0.86], metal: true });
  } else if (a.hat.id === 'goggles_up') {
    for (const s of [-1, 1]) head(ring(0.095, 0.018), steel, { position: [s * 0.16, 0.43, 0.16], rotation: [Math.PI / 2, 0, 0], metal: true });
    head(taperedCurve([[-0.16, 0.43, 0.16], [0, 0.48, 0.13], [0.16, 0.43, 0.16]], [0.014, 0.018, 0.014], 5, 5), leather);
  }
  if (a.cape.id !== 'none') {
    const cape = new THREE.PlaneGeometry(0.45, 0.52, 6, 6), p = cape.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i), f = (0.26 - y) / 0.52;
      p.setXYZ(i, p.getX(i) * (0.65 + f * 0.55), y, -0.16 - f * 0.12 + Math.cos(p.getX(i) * 48) * 0.014);
    }
    cape.computeVertexNormals();
    const back = cape.clone(), indices = back.index.array;
    for (let i = 0; i < indices.length; i += 3) [indices[i], indices[i + 1]] = [indices[i + 1], indices[i]];
    back.computeVertexNormals();
    // Both surfaces use the opaque cloth bucket, without changing its culling behavior.
    add(cape, 'chest', a.cape.color, { position: [0, 0.005, 0] });
    add(back, 'chest', a.cape.color, { position: [0, 0.005, 0] });
  }
  buildWeapon(a, b, ellipsoid, strip, trim, leather, steel);
  return b.finish();
}

function buildWeapon(a, b, ellipsoid, strip, trim, leather, steel) {
  const id = a.held.id;
  if (id !== 'none') {
    const staff = /staff|wand|scepter/.test(id);
    const bow = /bow|crossbow/.test(id), twoHanded = /greatsword|greataxe|warhammer|quarterstaff/.test(id);
    const shaft = staff || bow || twoHanded ? 0.55 : 0.11;
    b.add(profile([[-shaft, 0.019, 0.019], [shaft, 0.019, 0.019]], 8), 'handR', leather, { position: [0, -0.025, 0.055] });
    if (staff) {
      const headColor = /skull/.test(id) ? '#e8e0c8' : a.held.color;
      b.add(/skull/.test(id) ? new THREE.SphereGeometry(0.09, 8, 6) : new THREE.OctahedronGeometry(0.072), 'handR', headColor, { position: [0, 0.52, 0.055], scale: [0.7, 1.3, 0.7], metal: true });
      b.add(ring(0.078, 0.012), 'handR', trim, { position: [0, 0.52, 0.055], metal: true });
    } else if (bow) {
      b.add(taperedCurve([[0, -0.42, 0.055], [id === 'crossbow' ? 0 : 0.18, 0, 0.055], [0, 0.42, 0.055]], [0.018, 0.028, 0.018], 5, 6), 'handR', a.held.color, { metal: true });
      strip('handR', [[0, -0.42, 0.055], [0, 0.42, 0.055]], 0.004, '#e8e0c0');
    } else if (/greataxe/.test(id)) {
      b.add(new THREE.ConeGeometry(0.15, 0.34, 5), 'handR', a.held.color, { position: [0, 0.44, 0.055], rotation: [0, 0, Math.PI / 2], metal: true });
    } else if (/hammer|mace/.test(id)) {
      b.add(/mace/.test(id) ? new THREE.DodecahedronGeometry(0.14, 0) : new THREE.BoxGeometry(0.28, 0.14, 0.14), 'handR', a.held.color, { position: [0, 0.44, 0.055], metal: true });
    } else {
      const blade = /dagger|rapier/.test(id) ? 0.34 : /greatsword/.test(id) ? 0.72 : 0.52;
      b.add(profile([[-blade, 0.002, 0.002], [-blade * 0.78, 0.055, 0.018], [-0.14, 0.043, 0.017]], 4), 'handR', steel, { position: [0, -0.025, 0.055], metal: true });
      strip('handR', [[-0.10, -0.115, 0.055], [0, -0.095, 0.055], [0.10, -0.115, 0.055]], 0.021, trim, { metal: true });
      ellipsoid('handR', trim, [0, 0.055, 0.055], [0.032, 0.035, 0.029], { metal: true });
    }
  }
  if (a.offhand.id !== 'none') {
    if (a.offhand.id === 'dagger') { b.add(profile([[-0.22, 0.015, 0.015], [0.15, 0.015, 0.015]], 5), 'handL', steel, { position: [0, 0.01, 0.08], metal: true }); return; }
    if (a.offhand.id === 'book') { b.add(new THREE.BoxGeometry(0.16, 0.20, 0.035), 'handL', a.offhand.color, { position: [0, 0.02, 0.10] }); return; }
    if (a.offhand.id === 'orb') { b.add(new THREE.SphereGeometry(0.11, 10, 6), 'handL', a.offhand.color, { position: [0, 0.16, 0.12], metal: true }); return; }
    if (a.offhand.id === 'torch') { b.add(profile([[-0.28, 0.018, 0.018], [0.18, 0.018, 0.018]], 6), 'handL', leather, { position: [0, 0.02, 0.08] }); b.add(new THREE.ConeGeometry(0.11, 0.22, 6), 'handL', '#ff8c2a', { position: [0, 0.29, 0.08], metal: true }); return; }
    const shape = new THREE.Shape(); shape.moveTo(0, -0.27); shape.lineTo(-0.18, -0.05); shape.lineTo(-0.18, 0.17); shape.quadraticCurveTo(0, 0.24, 0.18, 0.17); shape.lineTo(0.18, -0.05); shape.closePath();
    if (a.offhand.id === 'round_shield') { b.add(new THREE.CylinderGeometry(0.22, 0.22, 0.045, 12), 'handL', a.offhand.color, { position: [0, 0.02, 0.10], rotation: [Math.PI / 2, 0, 0], metal: true }); return; }
    if (a.offhand.id === 'tower_shield') { b.add(new THREE.BoxGeometry(0.30, 0.50, 0.06), 'handL', a.offhand.color, { position: [0, -0.02, 0.10], metal: true }); return; }
    const options = { depth: a.offhand.id === 'buckler' ? 0.025 : 0.035, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.014, bevelSegments: 1, steps: 1, curveSegments: 5 };
    b.add(new THREE.ExtrudeGeometry(shape, options), 'handL', trim, { position: [0, 0.02, 0.083], metal: true });
    b.add(new THREE.ExtrudeGeometry(shape, options), 'handL', a.offhand.color, { position: [0, 0.02, 0.13], scale: [0.84, 0.84, 0.3] });
    b.add(new THREE.OctahedronGeometry(0.065), 'handL', steel, { position: [0, 0.025, 0.153], scale: [0.7, 1.1, 0.25], metal: true });
  }
}

function acquire(avatar) {
  const a = normalizeAvatar(avatar), key = JSON.stringify(a), rig = createRig(a.body);
  let template = templates.get(key);
  if (!template) {
    template = { parts: buildTemplate(a, rig), clips: createClips(rig), refs: 0 };
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

/** Chibi 2 milestone: shared avatar JSON, two skinned meshes, 18 bones and twelve animation states. */
export async function createChibi2Character(avatar) {
  const group = new THREE.Group(); group.userData.character = true;
  let asset, action, anim = 'idle', elapsed = 0, disposed = false;
  function install(a) {
    const next = acquire(a);
    if (asset) { group.remove(asset.root); asset.release(); }
    asset = next; group.add(asset.root); action = null; elapsed = 0;
    asset.mixer.addEventListener('finished', e => { if (e.action === action && anim !== 'dead') play('idle'); });
    play('idle', 0); group.userData.fxHeight = asset.rig.height;
  }
  function play(name, fade = 0.12) {
    if (disposed) return;
    if (!CHIBI2_ANIMS.includes(name)) name = 'idle';
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
