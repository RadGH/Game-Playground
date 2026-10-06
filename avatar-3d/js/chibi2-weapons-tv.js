// Chibi 2 — play-test 4 (S17, Thousandvale: "only swords seen"). Four more weapon silhouettes so every
// base in Thousandvale's loot pool reads as itself: a scimitar, a war pick, a spiked club and a glaive.
//
// A SEPARATE FILE ON PURPOSE: chibi2-weapons.js is Farhold's kit (`fh_` ids only — Farhold's
// round17-combat test holds it to that), and nothing here changes a model anyone already draws.
// These are new `tv_` ids, catalogued in chibi2-weapon-ids.js (FARHOLD_WEAPON_INFO, so the grip rule
// test covers them), dispatched by buildFarholdHeld, and built from the same parts vocabulary, which
// chibi2-weapons.js lends in as `K` (no import back, so no cycle). Head at -y, butt at +y.
import * as THREE from 'three';
import { profile, taperedCurve } from './chibi2-geometry.js';

export const TV_BUILDERS = {
  /** A scimitar: a broad blade that widens toward a clipped point, a disc guard and a hooked pommel. */
  tv_scimitar(c, hc, q, K) {
    const { Z, IRON, tone, lift, extrude, grip, haft, langets, collar, gem } = K;
    const R = 'handR';
    grip(c, R, -0.12, 0.05, 0.018, '#2a1c12');
    c.add(taperedCurve([[0, 0.05, Z], [-0.03, 0.085, Z], [-0.055, 0.075, Z]], [0.014, 0.012, 0.006], 4, 6), R, c.trim, { metal: true });
    c.add(new THREE.CylinderGeometry(0.05, 0.05, 0.014, 12), R, c.trim, { position: [0, -0.125, Z], metal: true });
    // the blade in profile, extruded thin: straight spine, a belly that swells, then a clipped point
    const prof = [[-0.012, -0.13], [0.026, -0.13], [0.040, -0.36], [0.062, -0.58], [0.050, -0.66], [0.012, -0.70], [-0.022, -0.62], [-0.018, -0.36]];
    c.add(extrude(prof, 0.012), R, hc, { position: [0, 0, Z], metal: true });
    c.add(extrude(prof.map(([x, y]) => [x * 0.55 - 0.004, y]), 0.016), R, tone(hc, 0.7), { position: [0, 0, Z], metal: true });
    if (q >= 2) gem(c, R, -0.125, 0.016, hc);
  },
  /** A war pick: a long haft, a curved spike forward, a small hammer face behind and a top spike. */
  tv_warpick(c, hc, q, K) {
    const { Z, IRON, tone, lift, extrude, grip, haft, langets, collar, gem } = K;
    const R = 'handR';
    haft(c, R, -0.96, 0.22, 0.021);
    langets(c, R, -0.92, -0.66, 0.023);
    collar(c, R, -0.74, 0.032);
    c.add(new THREE.BoxGeometry(0.06, 0.12, 0.08), R, tone(hc, 0.8), { position: [0, -0.86, Z], metal: true });
    // the pick: a curved, tapering spike out along -z (its edge axis), drooping toward the tip
    c.add(taperedCurve([[0, -0.86, Z - 0.03], [0, -0.85, Z - 0.17], [0, -0.80, Z - 0.30], [0, -0.70, Z - 0.38]], [0.034, 0.026, 0.014, 0.003], 5, 8), R, hc, { metal: true });
    // the hammer face behind it, and a short spike on top
    c.add(new THREE.BoxGeometry(0.075, 0.075, 0.07), R, lift(hc, 0.2), { position: [0, -0.86, Z + 0.07], metal: true });
    c.add(new THREE.ConeGeometry(0.022, 0.09, 5), R, tone(hc, 0.85), { position: [0, -0.96, Z], rotation: [Math.PI, 0, 0], metal: true });
    if (q >= 2) gem(c, R, -0.74, 0.020, hc);
  },
  /** A spiked club: a thick knotted head that swells out of a plain grip, studded with iron. */
  tv_club(c, hc, q, K) {
    const { Z, IRON, tone, lift, extrude, grip, haft, langets, collar, gem } = K;
    const R = 'handR', wood = '#6a4a2a';
    c.add(profile([[-0.56, 0.030, 0.030], [-0.50, 0.058, 0.058], [-0.36, 0.050, 0.050], [-0.18, 0.026, 0.026], [0.06, 0.019, 0.019]], 9), R, wood, { position: [0, 0, Z] });
    c.add(profile([[-0.04, 0.022, 0.022], [0.07, 0.022, 0.022]], 8), R, '#3a2a1c', { position: [0, 0, Z] });
    c.add(new THREE.TorusGeometry(0.052, 0.009, 4, 12), R, IRON, { position: [0, -0.34, Z], rotation: [Math.PI / 2, 0, 0], metal: true });
    for (let i = 0; i < 9; i++) {
      const t = (i / 9) * Math.PI * 2 + (i % 2) * 0.35, y = -0.40 - (i % 3) * 0.05;
      c.add(new THREE.ConeGeometry(0.012, 0.05, 4), R, hc, { position: [Math.sin(t) * 0.058, y, Z + Math.cos(t) * 0.058], rotation: [Math.cos(t) * Math.PI / 2, 0, -Math.sin(t) * Math.PI / 2], metal: true });
    }
    if (q >= 2) gem(c, R, 0.06, 0.016, hc);
  },
  /** A glaive: a single-edged blade like a long knife on a light haft, with a back spur. */
  tv_glaive(c, hc, q, K) {
    const { Z, IRON, tone, lift, extrude, grip, haft, langets, collar, gem } = K;
    const R = 'handR';
    haft(c, R, -0.88, 0.48, 0.016);
    collar(c, R, -0.86, 0.024);
    const prof = [[-0.012, -0.86], [0.024, -0.88], [0.052, -0.98], [0.050, -1.08], [0.010, -1.14], [-0.016, -1.02], [-0.016, -0.90]];
    c.add(extrude(prof, 0.012), R, hc, { position: [0, 0, Z], rotation: [0, Math.PI / 2, 0], metal: true });
    c.add(extrude(prof.map(([x, y]) => [x * 0.5 - 0.004, y]), 0.016), R, tone(hc, 0.7), { position: [0, 0, Z], rotation: [0, Math.PI / 2, 0], metal: true });
    // the back spur, and a red tassel under the collar
    c.add(new THREE.ConeGeometry(0.014, 0.07, 4), R, tone(hc, 0.8), { position: [0, -0.90, Z + 0.035], rotation: [Math.PI / 2, 0, 0], metal: true });
    c.add(new THREE.ConeGeometry(0.03, 0.09, 6), R, '#a83a2a', { position: [0, -0.78, Z] });
    c.add(new THREE.ConeGeometry(0.014, 0.06, 5), R, IRON, { position: [0, 0.51, Z], metal: true });
    if (q >= 2) gem(c, R, -0.84, 0.014, hc);
  },
};
