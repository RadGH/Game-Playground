// Chibi 2.6 face: retain the 2.5 option catalog/controllers and layer a small amount of shaped
// geometry over its smaller skull to make the brow, cheek and nose read at the new proportions.
import * as THREE from 'three';
import { taperedCurve } from './chibi2-geometry.js';
import { buildFace25 } from './chibi25-face.js';
import { headRings } from './chibi2-face.js';

function tone(hex, amount) {
  const c = new THREE.Color(hex);
  return '#' + c.lerp(new THREE.Color(amount > 0 ? '#ffffff' : '#000000'), Math.abs(amount)).getHexString();
}

export function buildFace26(look, rig, ctx) {
  const a = {
    ...look,
    eyes: { ...look.eyes, scale: Math.min(1.6, (Number(look.eyes?.scale) || 1) * 1.08) },
    nose: { ...look.nose, scale: Math.min(1.7, (Number(look.nose?.scale) || 1) * 1.12) },
    mouth: { ...look.mouth, scale: Math.min(1.8, (Number(look.mouth?.scale) || 1) * 1.04) },
  };
  const result = buildFace25(a, rig, ctx);
  const skin = a.body.skin, head = (geo, color, options = {}) => ctx.head(geo, color, options);
  ctx.tag?.('face:structure');
  const rings = headRings(a, rig);

  // Soft orbit ridges above both eyes, tucked under the brow shapes and hair fringe.
  for (const s of [-1, 1]) {
    head(taperedCurve([
      [s * 0.225, 0.357, 0.12], [s * 0.185, 0.382, 0.205], [s * 0.125, 0.389, 0.238],
      [s * 0.065, 0.378, 0.24], [s * 0.035, 0.357, 0.19],
    ], [0.007, 0.018, 0.021, 0.018, 0.007], 6, 12), tone(skin, -0.045));

  }
  return { ...result, faceHeight: rig.headScale * 0.6 };
}
