// Chibi 2 hats that the first milestone left unmodelled: crown, circlet, headband, feather band,
// flower, cap, leather cap, bandana, straw hat, top hat and mail coif. They share the 2D catalogue's
// ids, so a look written for the paper doll gets its hat in 3D too (before this, all eleven built
// nothing at all and the character came out bare-headed).
//
// Head space, scaled by H through `head()`: +z forward, the skull is half-width 0.30 at y 0.44,
// 0.265 at 0.50, 0.15 at 0.57 and closes at 0.60; the hair cap reaches y 0.63. Anything that covers
// the crown is listed in HATS_COVER_CROWN so chibi2.js leaves the hair under it out.
import * as THREE from 'three';
import { profile, taperedCurve } from './chibi2-geometry.js';

const tone = (c, k) => '#' + new THREE.Color(c).multiplyScalar(k).getHexString();
const lift = (c, k) => '#' + new THREE.Color(c).lerp(new THREE.Color('#ffffff'), k).getHexString();

/** Hats that sit over the crown and hide the hair under them (a fringe may still show). */
export const HATS_COVER_CROWN = ['cap', 'leather_cap', 'bandana', 'straw', 'top_hat', 'chain_coif'];

/** A dome over the skull, from `brim` up; stays outside the skull and the hair cap. */
function dome(head, colour, { brim = 0.4, r = [0.37, 0.28, 0.33], cy = 0.36, tilt = -0.12, open = 0.5, metal = false } = {}) {
  const g = new THREE.SphereGeometry(1, 14, 7, 0, Math.PI * 2, 0, Math.PI * open);
  head(g, colour, { position: [0, cy, -0.01], scale: r, rotation: [tilt, 0, 0], metal });
}

export function buildExtraHat(a, c) {
  const id = a.hat.id, hc = a.hat.color || '#6a4a2a', { head, add, trim, leather, darkSteel, W, T } = c;
  switch (id) {
    case 'crown': {
      const gold = a.hat.color || '#d8b040';
      head(new THREE.CylinderGeometry(0.27, 0.28, 0.1, 16, 1, true), gold, { position: [0, 0.57, -0.01], scale: [1, 1, 0.84], metal: true });
      head(new THREE.CylinderGeometry(0.265, 0.265, 0.1, 16, 1, true), tone(gold, 0.6), { position: [0, 0.57, -0.01], scale: [1, 1, 0.84], metal: true });
      for (let k = 0; k < 8; k++) { const t = k / 8 * Math.PI * 2; head(new THREE.ConeGeometry(0.03, 0.09, 4), gold, { position: [Math.sin(t) * 0.275, 0.66, Math.cos(t) * 0.23 - 0.01], metal: true }); }
      for (const t of [0, Math.PI / 2, -Math.PI / 2]) head(new THREE.OctahedronGeometry(0.025), '#c83a3a', { position: [Math.sin(t) * 0.285, 0.57, Math.cos(t) * 0.24 - 0.01], metal: true });
      return;
    }
    case 'circlet':
      head(new THREE.TorusGeometry(0.325, 0.012, 4, 24), a.hat.color || '#c8c8d8', { position: [0, 0.45, 0.0], rotation: [Math.PI / 2 + 0.12, 0, 0], scale: [1, 0.86, 1], metal: true });
      head(new THREE.OctahedronGeometry(0.03), '#7fd4ff', { position: [0, 0.44, 0.285], scale: [1, 1.3, 0.6], metal: true });
      return;
    case 'headband':
    case 'feather_band':
      head(new THREE.TorusGeometry(0.33, 0.022, 4, 24), hc, { position: [0, 0.46, 0.0], rotation: [Math.PI / 2 + 0.1, 0, 0], scale: [1, 0.86, 1] });
      if (id === 'headband') for (const s of [-1, 1]) head(taperedCurve([[s * 0.03, 0.47, -0.29], [s * 0.08, 0.38, -0.34], [s * 0.1, 0.28, -0.33]], [0.02, 0.018, 0.006], 3, 5), hc);
      else for (const [x, r] of [[0.25, 0.3], [0.29, 0.45]]) head(taperedCurve([[x, 0.47, 0.12], [x + 0.06, 0.62, 0.06], [x + 0.04, 0.78, -0.04]], [0.03, 0.028, 0.004], 4, 6), r > 0.4 ? lift(hc, 0.5) : '#e8e0d0');
      return;
    case 'flower':
      for (let k = 0; k < 5; k++) { const t = k / 5 * Math.PI * 2; head(new THREE.SphereGeometry(1, 6, 4), '#f0a0c0', { position: [0.27 + Math.cos(t) * 0.04, 0.47 + Math.sin(t) * 0.04, 0.15], scale: [0.035, 0.035, 0.015] }); }
      head(new THREE.SphereGeometry(1, 6, 4), '#f2d040', { position: [0.27, 0.47, 0.16], scale: [0.022, 0.022, 0.015] });
      return;
    case 'cap':
      // a soft cloth cap with a short peak at the front
      dome(head, hc, { cy: 0.38, r: [0.365, 0.3, 0.325], tilt: -0.1, open: 0.52 });
      head(new THREE.CylinderGeometry(0.2, 0.2, 0.012, 12, 1, false, -Math.PI / 2, Math.PI), tone(hc, 0.8), { position: [0, 0.42, 0.27], scale: [1, 1, 0.55] });
      head(new THREE.SphereGeometry(0.03, 6, 4), tone(hc, 0.8), { position: [0, 0.69, -0.04] });
      return;
    case 'leather_cap':
      dome(head, hc, { cy: 0.37, r: [0.37, 0.3, 0.335], tilt: -0.08, open: 0.55 });
      for (const t of [0, Math.PI / 2]) head(new THREE.TorusGeometry(0.34, 0.008, 3, 20, Math.PI), tone(hc, 0.7), { position: [0, 0.37, -0.01], rotation: [0, t, 0], scale: [1.07, 0.88, 0.97] });
      for (const s of [-1, 1]) head(new THREE.SphereGeometry(1, 8, 5), hc, { position: [s * 0.34, 0.3, -0.01], scale: [0.05, 0.12, 0.1] });
      return;
    case 'bandana': {
      dome(head, hc, { cy: 0.36, r: [0.36, 0.29, 0.325], tilt: -0.2, open: 0.54 });
      head(new THREE.SphereGeometry(1, 6, 4), tone(hc, 0.85), { position: [0.0, 0.38, -0.33], scale: [0.06, 0.05, 0.04] });
      for (const s of [-1, 1]) head(taperedCurve([[s * 0.02, 0.37, -0.34], [s * 0.07, 0.26, -0.37], [s * 0.06, 0.16, -0.35]], [0.03, 0.025, 0.006], 3, 5), hc);
      for (let k = 0; k < 6; k++) { const t = -0.8 + k * 0.32; head(new THREE.SphereGeometry(0.014, 4, 3), lift(hc, 0.6), { position: [Math.sin(t) * 0.33, 0.52, Math.cos(t) * 0.27] }); }
      return;
    }
    case 'straw': {
      const straw = a.hat.color || '#d8c078';
      head(new THREE.CylinderGeometry(0.27, 0.33, 0.2, 14), straw, { position: [0, 0.54, -0.01], scale: [1, 1, 0.86] });
      head(new THREE.SphereGeometry(1, 12, 4, 0, Math.PI * 2, 0, Math.PI / 2), straw, { position: [0, 0.64, -0.01], scale: [0.27, 0.07, 0.23] });
      head(new THREE.CylinderGeometry(0.6, 0.62, 0.025, 18), straw, { position: [0, 0.44, 0.0], scale: [1, 1, 0.8] });
      head(new THREE.CylinderGeometry(0.335, 0.335, 0.04, 14, 1, true), '#8a3a2a', { position: [0, 0.48, -0.01], scale: [1, 1, 0.86] });
      return;
    }
    case 'top_hat': {
      const hat = a.hat.color || '#1e1e24';
      head(new THREE.CylinderGeometry(0.29, 0.3, 0.4, 16), hat, { position: [0, 0.72, -0.03], scale: [1, 1, 0.84] });
      head(new THREE.CylinderGeometry(0.46, 0.46, 0.025, 18), hat, { position: [0, 0.525, -0.02], scale: [1, 1, 0.8] });
      head(new THREE.CylinderGeometry(0.302, 0.302, 0.07, 16, 1, true), '#6a2a3a', { position: [0, 0.575, -0.03], scale: [1, 1, 0.84] });
      return;
    }
    case 'chain_coif': {
      // a mail hood: round the whole head and neck with the face left open, and a mantle on the shoulders
      const g = new THREE.SphereGeometry(1, 16, 10, Math.PI / 2 + 0.95, Math.PI * 2 - 1.9, 0, 2.3);
      head(g, darkSteel, { position: [0, 0.3, -0.02], scale: [0.39, 0.38, 0.34], metal: true });
      for (let k = 0; k < 4; k++) head(new THREE.TorusGeometry(0.37 - k * 0.03, 0.006, 3, 20, Math.PI * 2 - 1.9), tone(darkSteel, 0.7), { position: [0, 0.48 - k * 0.1, -0.02], rotation: [Math.PI / 2, 0, Math.PI / 2 + 0.95], scale: [1, 0.9, 1], metal: true });
      add(profile([[0.27 * T, 0.24 * W, 0.17 * W, -0.01], [0.33 * T, 0.16 * W, 0.13 * W, -0.012], [0.4 * T, 0.1, 0.09, -0.015]], 14), 'chest', darkSteel, { metal: true });
      return;
    }
  }
}
