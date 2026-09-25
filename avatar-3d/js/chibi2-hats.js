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

/** Reversed-winding copy of a geometry, for the inside of a shell. */
function backfaced(g) {
  if (!g.index) g.setIndex(Array.from({ length: g.attributes.position.count }, (_, i) => i));
  const idx = g.index.array;
  for (let i = 0; i < idx.length; i += 3) [idx[i], idx[i + 1]] = [idx[i + 1], idx[i]];
  g.computeVertexNormals(); return g;
}
const tone = (c, k) => '#' + new THREE.Color(c).multiplyScalar(k).getHexString();
const lift = (c, k) => '#' + new THREE.Color(c).lerp(new THREE.Color('#ffffff'), k).getHexString();

/** Hats that sit over the crown and hide the hair under them (a fringe may still show). */
export const HATS_COVER_CROWN = ['cap', 'leather_cap', 'bandana', 'straw', 'top_hat', 'chain_coif',
  'war_helm', 'great_helm', 'plate_helm', 'wolf_helm', 'rune_helm', 'tricorn'];
/**
 * 2026-09-25 class helms. Built HERE, not by chibi2.js's generic `/helm/` dome (which every id with
 * "helm" in it used to fall into, so a paladin's great helm and a knight's plate helm were the same
 * grey bowl as everyone else's). chibi2.js checks this list before its generic branch.
 */
export const CLASS_HATS = ['war_helm', 'great_helm', 'plate_helm', 'wolf_helm', 'bone_headdress', 'rune_helm', 'tricorn'];
/**
 * Headwear whose rim stops above the ears: the hair cap is cut flat just under the rim instead of
 * dropped, so no band of bare scalp shows between the hair at the back and the helm ("his hair has a
 * gap before the helmet"). Head units; see HAT_BRIM in chibi2.js.
 */
export const HELM_BRIM = { horned_helm: 0.43, helmet: 0.43, war_helm: 0.42, plate_helm: 0.42, rune_helm: 0.42, wolf_helm: 0.44, tricorn: 0.46 };

/** A dome over the skull, from `brim` up; stays outside the skull and the hair cap. */
function dome(head, colour, { brim = 0.4, r = [0.37, 0.28, 0.33], cy = 0.36, tilt = -0.12, open = 0.5, metal = false } = {}) {
  const g = new THREE.SphereGeometry(1, 14, 7, 0, Math.PI * 2, 0, Math.PI * open);
  head(g, colour, { position: [0, cy, -0.01], scale: r, rotation: [tilt, 0, 0], metal });
}

export function buildExtraHat(a, c) {
  const id = a.hat.id, hc = a.hat.color || '#6a4a2a', { head, add, trim, leather, darkSteel, W, T } = c;
  switch (id) {
    case 'war_helm': {
      // the warrior's helm: a round steel cap with a nasal bar, riveted cheek guards and a mail
      // curtain at the back of the neck
      const st = a.hat.color || '#8a9098', dk = tone(st, 0.62);
      head(profile([[0.40, 0.356, 0.305], [0.47, 0.345, 0.296], [0.56, 0.27, 0.235], [0.63, 0.14, 0.12], [0.665, 0.02, 0.02]], 16), st, { metal: true });
      head(profile([[0.395, 0.362, 0.311], [0.44, 0.362, 0.311]], 16), dk, { metal: true });
      head(profile([[0.60, 0.035, 0.12], [0.672, 0.02, 0.07]], 8), dk, { position: [0, 0, -0.02], metal: true });   // a crest ridge front to back
      head(new THREE.BoxGeometry(0.05, 0.2, 0.03), st, { position: [0, 0.32, 0.325], rotation: [-0.12, 0, 0], metal: true });   // nasal
      for (const s of [-1, 1]) {
        head(new THREE.BoxGeometry(0.03, 0.2, 0.14), st, { position: [s * 0.34, 0.2, 0.03], rotation: [0.1, 0, s * 0.1], metal: true });
        head(new THREE.SphereGeometry(0.018, 5, 4), trim, { position: [s * 0.36, 0.27, 0.06], metal: true });
      }
      const g = new THREE.CylinderGeometry(0.36, 0.39, 0.22, 12, 1, true, Math.PI / 2 + 0.7, Math.PI - 1.4);
      head(g, darkSteel, { position: [0, 0.29, -0.02], scale: [1, 1, 0.9], metal: true });
      head(backfaced(g.clone()), tone(darkSteel, 0.6), { position: [0, 0.29, -0.02], scale: [0.99, 1, 0.89], metal: true });
      return;
    }
    case 'great_helm': {
      // the paladin's great helm: a closed barrel over the whole head, an eye slit, breathing holes
      // and a gold cross down the face
      const st = a.hat.color || '#d8dce4', gold = a.hat.color2 || '#d8b040';
      head(profile([[-0.06, 0.34, 0.33], [0.05, 0.375, 0.365], [0.22, 0.39, 0.375], [0.40, 0.385, 0.36], [0.55, 0.35, 0.325], [0.64, 0.25, 0.235], [0.68, 0.12, 0.11], [0.69, 0.003, 0.003]], 16), st, { metal: true });
      const band = (y, h, grow, colour) => head(new THREE.CylinderGeometry(1, 1, h, 12, 1, true, -1.0, 2.0), colour, { position: [0, y, 0], scale: [0.392 + grow, 1, 0.378 + grow], metal: true });
      band(0.27, 0.05, 0.004, '#101014');
      band(0.315, 0.025, 0.012, gold);
      band(0.225, 0.02, 0.012, gold);
      head(new THREE.BoxGeometry(0.045, 0.2, 0.02), gold, { position: [0, 0.09, 0.372], rotation: [-0.08, 0, 0], metal: true });
      head(new THREE.BoxGeometry(0.16, 0.04, 0.02), gold, { position: [0, 0.14, 0.372], rotation: [-0.08, 0, 0], metal: true });
      for (const s of [-1, 1]) for (let k = 0; k < 3; k++) head(new THREE.SphereGeometry(0.012, 4, 3), '#101014', { position: [s * (0.12 + k * 0.035), 0.1 + k * 0.02, 0.35 - k * 0.02] });
      head(profile([[-0.07, 0.345, 0.335], [-0.04, 0.35, 0.34]], 16), gold, { metal: true });
      return;
    }
    case 'plate_helm': {
      // the knight's helm: a rounded bascinet with a raised visor over the brow, a sallet's flared
      // tail over the nape and a tall plume
      const st = a.hat.color || '#b8c0cc', plume = a.hat.color2 || '#c8323a', dk = tone(st, 0.6);
      head(profile([[0.39, 0.358, 0.31], [0.46, 0.35, 0.302], [0.56, 0.28, 0.245], [0.64, 0.16, 0.14], [0.69, 0.02, 0.02]], 16), st, { metal: true });
      const tail = new THREE.CylinderGeometry(0.36, 0.43, 0.14, 14, 1, true, Math.PI / 2 + 0.55, Math.PI - 1.1);
      head(tail, st, { position: [0, 0.34, -0.02], scale: [1, 1, 0.92], metal: true });
      head(backfaced(tail.clone()), dk, { position: [0, 0.34, -0.02], scale: [0.99, 1, 0.91], metal: true });
      // the visor, pushed up: a curved plate standing proud of the brow, pierced with a dark slit
      const visor = new THREE.CylinderGeometry(1, 1, 0.12, 12, 1, true, -0.95, 1.9);
      head(visor, st, { position: [0, 0.48, 0.02], scale: [0.38, 1, 0.37], rotation: [-0.35, 0, 0], metal: true });
      head(backfaced(visor.clone()), dk, { position: [0, 0.48, 0.02], scale: [0.375, 1, 0.365], rotation: [-0.35, 0, 0], metal: true });
      head(new THREE.CylinderGeometry(1, 1, 0.018, 12, 1, true, -0.7, 1.4), '#101014', { position: [0, 0.475, 0.025], scale: [0.385, 1, 0.375], rotation: [-0.35, 0, 0], metal: true });
      for (const s of [-1, 1]) head(new THREE.SphereGeometry(0.025, 6, 4), trim, { position: [s * 0.37, 0.42, 0.02], metal: true });
      head(profile([[0.66, 0.04, 0.04], [0.73, 0.03, 0.03]], 8), trim, { metal: true });
      for (let k = 0; k < 4; k++) head(taperedCurve([[0, 0.72, 0.0], [(k - 1.5) * 0.02, 0.86 + k * 0.01, -0.12], [(k - 1.5) * 0.03, 0.8, -0.34], [(k - 1.5) * 0.02, 0.62, -0.42]], [0.03, 0.05, 0.035, 0.006], 5, 9), k % 2 ? plume : lift(plume, 0.15));
      return;
    }
    case 'wolf_helm': {
      // the druid's wolf helm: a grey wolf's head worn as a hood — the skull over the crown with its
      // muzzle over the brow, two upright ears, amber eyes, and the pelt down the back of the neck
      const fur = a.hat.color || '#7a7068', belly = lift(fur, 0.35), dk = tone(fur, 0.6);
      dome(head, fur, { cy: 0.35, r: [0.385, 0.32, 0.345], tilt: -0.1, open: 0.56 });
      head(new THREE.SphereGeometry(1, 10, 6), fur, { position: [0, 0.58, 0.2], scale: [0.16, 0.1, 0.2], rotation: [0.25, 0, 0] });
      head(new THREE.SphereGeometry(1, 10, 6), belly, { position: [0, 0.52, 0.32], scale: [0.1, 0.06, 0.14], rotation: [0.35, 0, 0] });
      head(new THREE.SphereGeometry(1, 6, 4), '#1a1614', { position: [0, 0.55, 0.45], scale: [0.04, 0.03, 0.03] });
      for (const s of [-1, 1]) {
        head(new THREE.ConeGeometry(0.07, 0.17, 4), fur, { position: [s * 0.2, 0.7, 0.02], rotation: [-0.15, 0, s * -0.3] });
        head(new THREE.ConeGeometry(0.04, 0.11, 4), tone(fur, 0.5), { position: [s * 0.2, 0.69, 0.045], rotation: [-0.15, 0, s * -0.3] });
        head(new THREE.SphereGeometry(1, 6, 4), '#e8a830', { position: [s * 0.09, 0.625, 0.3], scale: [0.03, 0.02, 0.015] });
        // the pelt's forelegs, knotted over the shoulders
        head(taperedCurve([[s * 0.3, 0.3, 0.0], [s * 0.34, 0.08, 0.06], [s * 0.26, -0.12, 0.16]], [0.07, 0.055, 0.03], 5, 6), fur, { });
      }
      head(taperedCurve([[0, 0.45, -0.3], [0, 0.2, -0.38], [0, -0.1, -0.33], [0, -0.35, -0.3]], [0.26, 0.22, 0.17, 0.04], 7, 8), fur, { scale: [1, 1, 0.55] });
      head(taperedCurve([[0, 0.4, -0.33], [0, 0.1, -0.4]], [0.05, 0.03], 4, 3), dk);
      return;
    }
    case 'bone_headdress': {
      // the shaman's headdress: a beaded hide band, a fan of feathers standing up behind the head,
      // and two small horns at the temples. The hair stays out — it is a band, not a hat.
      const band = a.hat.color || '#8a5a3a', feather = a.hat.color2 || '#c8402a';
      head(new THREE.TorusGeometry(0.335, 0.03, 5, 24), band, { position: [0, 0.46, 0.0], rotation: [Math.PI / 2 + 0.1, 0, 0], scale: [1, 0.86, 1] });
      for (let k = 0; k < 7; k++) { const t = -0.9 + k * 0.3; head(new THREE.SphereGeometry(0.02, 5, 4), k % 2 ? '#e8e0c8' : '#3aa0a8', { position: [Math.sin(t) * 0.345, 0.46, Math.cos(t) * 0.3] }); }
      for (let k = 0; k < 7; k++) {
        const t = (k - 3) * 0.32, x = Math.sin(t) * 0.26, zb = -0.2 - Math.cos(t) * 0.06;
        const colour = k % 2 ? feather : k === 3 ? '#f0ece0' : '#2a2420';
        head(taperedCurve([[x * 0.9, 0.5, zb], [x * 1.2, 0.74, zb - 0.06], [x * 1.45, 0.98 - Math.abs(k - 3) * 0.05, zb - 0.1]], [0.03, 0.045, 0.004], 4, 6), colour);
      }
      for (const s of [-1, 1]) head(taperedCurve([[s * 0.24, 0.52, 0.14], [s * 0.36, 0.62, 0.12], [s * 0.38, 0.74, 0.04]], [0.035, 0.022, 0.004], 5, 6), '#e8e0c8');
      return;
    }
    case 'rune_helm': {
      // the runesmith's helm: low and heavy, a thick rolled brim, a band of glowing runes and a
      // riveted ridge — a smith's helm, made to be hit
      const st = a.hat.color || '#6a6258', glow = a.hat.color2 || '#58d8f0';
      head(profile([[0.40, 0.37, 0.318], [0.47, 0.358, 0.306], [0.55, 0.29, 0.25], [0.61, 0.17, 0.15], [0.635, 0.02, 0.02]], 16), st, { metal: true });
      head(new THREE.TorusGeometry(0.372, 0.03, 6, 22), tone(st, 0.75), { position: [0, 0.405, -0.005], rotation: [Math.PI / 2, 0, 0], scale: [1, 0.86, 1], metal: true });
      head(profile([[0.455, 0.366, 0.314], [0.495, 0.35, 0.3]], 16), tone(st, 0.5), { metal: true });
      for (let k = 0; k < 9; k++) {
        const t = -1.9 + k * 0.475, x = Math.sin(t) * 0.366, z = Math.cos(t) * 0.315;
        head(new THREE.BoxGeometry(0.012, 0.03, 0.005), glow, { position: [x, 0.475, z], rotation: [0, t, (k % 3 - 1) * 0.5] });
        head(new THREE.BoxGeometry(0.02, 0.006, 0.005), glow, { position: [x, 0.468, z], rotation: [0, t, 0] });
      }
      head(profile([[0.55, 0.03, 0.2], [0.64, 0.028, 0.1]], 8), tone(st, 0.6), { position: [0, 0, -0.02], metal: true });
      for (const s of [-1, 1]) head(new THREE.SphereGeometry(0.022, 5, 4), trim, { position: [s * 0.37, 0.41, 0.07], metal: true });
      return;
    }
    case 'tricorn': {
      // the tactician's hat: a round crown in a brim turned up into three corners, point to the front,
      // gold-edged, with a cockade
      const hat = a.hat.color || '#1e2436', edge = a.hat.color2 || '#d8b040';
      head(new THREE.CylinderGeometry(0.27, 0.32, 0.2, 14), hat, { position: [0, 0.56, -0.01], scale: [1, 1, 0.88] });
      head(new THREE.SphereGeometry(1, 12, 4, 0, Math.PI * 2, 0, Math.PI / 2), hat, { position: [0, 0.65, -0.01], scale: [0.27, 0.06, 0.24] });
      for (let k = 0; k < 3; k++) {
        const t = k * Math.PI * 2 / 3;          // corners at the front and two at the back sides
        const a0 = t + Math.PI / 3, a1 = t + Math.PI;  // each wall spans between two corners
        const pts = [];
        for (let i = 0; i <= 6; i++) { const u = a0 + (i / 6) * (Math.PI * 2 / 3), r = 0.5 - 0.1 * Math.sin((i / 6) * Math.PI); pts.push([Math.sin(u) * r, 0.47 + 0.09 * Math.sin((i / 6) * Math.PI), Math.cos(u) * r * 0.9]); }
        head(taperedCurve(pts, [0.02, 0.05, 0.06, 0.05, 0.02], 4, 12), hat, { scale: [1, 1, 1] });
        head(taperedCurve(pts.map(([x, y, z]) => [x * 1.02, y + 0.06, z * 1.02]), [0.008, 0.012, 0.012, 0.012, 0.008], 4, 12), edge, { metal: true });
        void a1;
      }
      head(new THREE.CylinderGeometry(0.06, 0.06, 0.015, 10), '#f0ece0', { position: [0.2, 0.55, 0.22], rotation: [Math.PI / 2, 0, -0.6] });
      head(new THREE.CylinderGeometry(0.025, 0.025, 0.02, 8), '#b02030', { position: [0.205, 0.555, 0.228], rotation: [Math.PI / 2, 0, -0.6] });
      return;
    }
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
