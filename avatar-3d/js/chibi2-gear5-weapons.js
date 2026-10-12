// Chibi 2 — the round-5 weapons (Thousandvale play-test 5: T23, and the model half of T15).
//
// ONE NEW MODEL PER WEAPON TYPE in the item data (dagger, sword, two-handed sword, axe, two-handed axe, mace,
// hammer, two-handed hammer, spear, polearm, javelin, bow, crossbow, quarterstaff, sceptre, orb, tome), and
// SIX WANDS and SIX STAVES — one silhouette per magic attack form, so a player can tell what a caster's
// basic attack will do from the thing in their hand:
//
//   projectile  a dart / a spire      one point, aimed
//   cone        a bell mouth / a horn something that opens outward
//   area        a hoop / a halo       a ring round a centre
//   beam        lenses on prongs      glass in a straight line
//   fork        tines / branches      one stem that splits
//   shield      a small escutcheon    a plate that stands in the way
//
// The ids, names and hold kinds are in chibi2-gear5-ids.js (no Three.js, so tools and node tests read them);
// this file must build exactly those (avatar-3d/tests/gear-catalog.test.js). New `g5_` ids only — nothing
// that already exists is touched, and the parts vocabulary is the Farhold kit's own (`KIT`), so a grip is
// wrapped and a haft is ferruled the same way on every weapon in the game.
//
// THE GRIP RULE (the bug round 14 fixed, and the one T22 audits): in hand space -y is out past the fingertips
// and +y runs up the forearm. The handle goes THROUGH the fist (y about -0.10 .. +0.08, at z = Z), the head
// or blade is at negative y, the butt at positive y. Staves are the one family carried the other way up —
// the hand holds the middle and the topper is at +y, like every `staff_*` before them (hold kind 'staff').
// Everything is authored on 'handR'; chibi2-gear5.js swaps the bone for a second weapon in the left hand,
// so nothing here may assume which hand it is in (keep models symmetric in x, or with the edge on -z / +x
// as the hold table says).
import * as THREE from 'three';
import { profile, taperedCurve } from './chibi2-geometry.js';
import { KIT } from './chibi2-weapons.js';

const { Z, WOOD, IRON, DARK, GOLD, tone, lift, low, extrude, grip, pommel, guard, blade, haft, langets, collar, gem } = KIT;
const R = 'handR', PI = Math.PI;
const BONE = '#e8e0c8', CORD = '#b09a72', RED = '#a83a2a', GLASS = '#cfeeff';

/** Straight tube segments through the points (corners stay sharp). */
function poly(c, bone, pts, r, colour, o = {}) {
  for (let i = 0; i < pts.length - 1; i++) c.add(taperedCurve([pts[i], pts[i + 1]], [r, r], 4, 1), bone, colour, o);
}
/** Reversed-winding copy, for the inside of an open shell. Take it BEFORE the original is placed. */
function inside(g) {
  const b = g.clone();
  if (!b.index) b.setIndex(Array.from({ length: b.attributes.position.count }, (_, i) => i));
  const idx = b.index.array;
  for (let i = 0; i < idx.length; i += 3) [idx[i], idx[i + 1]] = [idx[i + 1], idx[i]];
  b.computeVertexNormals(); return b;
}
/** Euler that turns the +y axis onto `dir` (for spikes and prongs pointing any way). */
function aim(dir) {
  const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...dir).normalize()));
  return [e.x, e.y, e.z];
}
/** A shape scaled about a point — the darker inset cheek that stops a flat head reading as a paddle. */
const inset = (pts, k, cx, cy) => pts.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]);
/** Mirror a half outline (x >= 0, listed from the far tip toward the hand) into a closed symmetric one. */
const mirror = half => [...half, ...half.slice().reverse().filter(([x]) => x !== 0).map(([x, y]) => [-x, y])];

// ---------------------------------------------------------------- wands: a shared stick, tilted to point where you aim
const TILT = [-0.35, 0, 0];
/** Wands are drawn a third larger than life: at fighting distance the head is the only part that says what it does. */
const WS = 1.32;
const tiltM = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...TILT));
/** Where a point on the wand's own axis (and off it) ends up in hand space. */
const wat = (y, x = 0, z = 0) => { const v = new THREE.Vector3(x * WS, y * WS, z * WS).applyMatrix4(tiltM); return [v.x, v.y, v.z + Z]; };
/** Add a piece built in the wand's own frame (origin at the fist, -y toward the tip). */
function wadd(c, g, colour, { y = 0, x = 0, z = 0, scale = [1, 1, 1], metal = false, bone = R } = {}) {
  c.add(g, bone, colour, { position: wat(y, x, z), rotation: TILT, scale: scale.map(v => v * WS), metal });
}
/** The stick itself: tapered wood from the butt cap to `tip`, two grip bands and a pommel bead. */
function wandStick(c, tip, wood = '#3a2f28', band = GOLD) {
  c.add(profile([[tip, 0.008, 0.008], [-0.10, 0.012, 0.012], [0.03, 0.016, 0.016]], 6), R, wood, { position: [0, 0, Z], rotation: TILT, scale: [WS, WS, WS] });
  for (const y of [-0.085, 0.02]) wadd(c, profile([[-0.007, 0.0165, 0.0165], [0.007, 0.0165, 0.0165]], 6), band, { y, metal: true });
  wadd(c, low(), band, { y: 0.04, scale: [0.014, 0.012, 0.014], metal: true });
}

// ---------------------------------------------------------------- staves: a shared pole, topper at +y
const STAFF_TOP = 0.56, STAFF_FOOT = -0.54;
function staffPole(c, wood = '#4a3422', band = GOLD) {
  c.add(profile([[STAFF_FOOT, 0.017, 0.017], [-0.10, 0.021, 0.021], [0.30, 0.021, 0.021], [STAFF_TOP, 0.024, 0.024]], 8), R, wood, { position: [0, 0, Z] });
  // an iron shoe on the foot, a wrap where the hand goes, and a collar the topper stands on
  c.add(profile([[STAFF_FOOT - 0.05, 0.004, 0.004], [STAFF_FOOT - 0.01, 0.02, 0.02], [STAFF_FOOT + 0.05, 0.021, 0.021]], 8), R, IRON, { position: [0, 0, Z], metal: true });
  c.add(profile([[-0.07, 0.025, 0.025], [0.08, 0.025, 0.025]], 8), R, '#3a2a1c', { position: [0, 0, Z] });
  for (const y of [-0.075, 0.085]) c.add(profile([[y - 0.008, 0.028, 0.028], [y + 0.008, 0.028, 0.028]], 8), R, tone('#3a2a1c', 0.7), { position: [0, 0, Z] });
  c.add(profile([[STAFF_TOP - 0.03, 0.028, 0.028], [STAFF_TOP, 0.034, 0.034], [STAFF_TOP + 0.02, 0.026, 0.026]], 8), R, band, { position: [0, 0, Z], metal: true });
}

export const G5_WEAPON_BUILDERS = {
  // ================================================================ blades
  /** A kris: a wavy leaf of a blade on a flared base, with a pistol-curved grip. */
  g5_kris(c, hc, q) {
    c.add(taperedCurve([[0, -0.10, Z], [0, -0.02, Z], [0.004, 0.04, Z], [0.026, 0.07, Z]], [0.015, 0.017, 0.018, 0.021], 6, 8), R, '#3a2416');
    for (const y of [-0.07, -0.03, 0.01]) c.add(profile([[y - 0.006, 0.019, 0.019], [y + 0.006, 0.019, 0.019]], 6), R, tone('#3a2416', 0.65), { position: [0, 0, Z] });
    collar(c, R, -0.10, 0.02, c.trim);
    // the flared base (it does the work of a guard) — wider on one side, as a kris is
    c.add(extrude([[-0.05, -0.105], [0.036, -0.105], [0.02, -0.135], [-0.026, -0.14]], 0.016), R, tone(hc, 0.8), { position: [0, 0, Z], metal: true });
    const n = 14, L = [], Rt = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, y = -0.13 - t * 0.25, cx = Math.sin(t * PI * 3.2) * 0.013 * (1 - t * 0.7), w = 0.004 + 0.021 * Math.pow(1 - t, 0.75);
      L.push([cx - w, y]); Rt.push([cx + w, y]);
    }
    const outline = [...L, ...Rt.reverse()];
    c.add(extrude(outline, 0.010), R, hc, { position: [0, 0, Z], metal: true });
    c.add(extrude(L.map(([x, y], i) => [(x + Rt[n - i][0]) / 2 - 0.004 * (1 - i / n), y]).concat(L.map(([x, y], i) => [(x + Rt[n - i][0]) / 2 + 0.004 * (1 - i / n), y]).reverse()), 0.014), R, tone(hc, 0.66), { position: [0, 0, Z], metal: true });
    if (q >= 2) gem(c, R, -0.12, 0.012, hc);
  },
  /** A leaf blade: waisted above the guard, swelling toward the point; a crescent guard and a ring pommel. */
  g5_leafblade(c, hc, q) {
    grip(c, R, -0.12, 0.06, 0.018, '#4a2c1a');
    c.add(new THREE.TorusGeometry(0.026, 0.009, 5, 12), R, c.trim, { position: [0, 0.09, Z], metal: true });
    // the guard's horns sweep TOWARD the blade
    c.add(taperedCurve([[-0.075, -0.185, Z], [-0.045, -0.14, Z], [0, -0.128, Z], [0.045, -0.14, Z], [0.075, -0.185, Z]], [0.006, 0.013, 0.017, 0.013, 0.006], 5, 10), R, c.trim, { metal: true });
    c.add(profile([[-0.66, 0.003, 0.002], [-0.58, 0.036, 0.008], [-0.46, 0.054, 0.012], [-0.32, 0.040, 0.013], [-0.22, 0.027, 0.013], [-0.13, 0.031, 0.013]], 4), R, hc, { position: [0, 0, Z], metal: true });
    c.add(profile([[-0.60, 0.004, 0.005], [-0.46, 0.012, 0.017], [-0.14, 0.009, 0.017]], 4), R, tone(hc, 0.66), { position: [0, 0, Z], metal: true });
    if (q >= 2) gem(c, R, 0.09, 0.013, hc);
  },
  /** A flamberge: a great blade whose edges ripple, parrying lugs, a wrapped ricasso and a long straight guard. */
  g5_flamberge(c, hc, q) {
    grip(c, R, -0.20, 0.15, 0.021, '#2a1c14');
    pommel(c, R, 0.19, 'scent', 0.036, c.trim);
    // a straight guard with a ring at each end
    c.add(profile([[-0.17, 0.014, 0.014], [0.17, 0.014, 0.014]], 6), R, c.trim, { position: [0, -0.215, Z], rotation: [0, 0, PI / 2], metal: true });
    for (const s of [-1, 1]) c.add(new THREE.TorusGeometry(0.024, 0.008, 4, 10), R, c.trim, { position: [s * 0.185, -0.215, Z], metal: true });
    // the ricasso, wrapped for the second hand, and the two lugs above it
    c.add(profile([[-0.36, 0.028, 0.014], [-0.23, 0.032, 0.015]], 6), R, '#3a2a1c', { position: [0, 0, Z] });
    for (const s of [-1, 1]) c.add(new THREE.ConeGeometry(0.016, 0.07, 5), R, c.trim, { position: [s * 0.062, -0.375, Z], rotation: [0, 0, -s * 1.15], metal: true });
    const n = 26, L = [], Rt = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, y = -0.36 - t * 0.78, w = (t > 0.86 ? 0.058 * (1 - t) / 0.14 : 0.05 + 0.008 * Math.sin(t * PI)) + 0.002, wave = 0.011 * Math.sin(t * PI * 9) * Math.min(1, (1 - t) * 6);
      L.push([-(w + wave), y]); Rt.push([w + wave, y]);
    }
    c.add(extrude([...L, ...Rt.reverse()], 0.014), R, hc, { position: [0, 0, Z], metal: true });
    c.add(profile([[-1.06, 0.004, 0.006], [-0.80, 0.016, 0.019], [-0.38, 0.018, 0.019]], 4), R, tone(hc, 0.66), { position: [0, 0, Z], metal: true });
    if (q >= 2) gem(c, R, 0.19, 0.02, hc);
  },

  // ================================================================ hafted: axes, maces, hammers
  /** A halfmoon axe: a crescent carried on two arms, its horns curling back toward the haft. Edge on -z. */
  g5_moonaxe(c, hc, q) {
    haft(c, R, -0.60, 0.10, 0.019);
    collar(c, R, -0.36, 0.028);
    const moon = [[0.03, 0.165], [0.08, 0.15], [0.122, 0.108], [0.146, 0.05], [0.154, 0], [0.146, -0.05], [0.122, -0.108], [0.08, -0.15], [0.03, -0.165],
      [0.056, -0.115], [0.084, -0.066], [0.094, 0], [0.084, 0.066], [0.056, 0.115]];
    c.add(extrude(moon, 0.022), R, hc, { position: [0, -0.45, Z], rotation: [0, PI / 2, 0], metal: true });
    c.add(extrude(inset(moon, 0.7, 0.105, 0), 0.028), R, tone(hc, 0.7), { position: [0, -0.45, Z], rotation: [0, PI / 2, 0], metal: true });
    // the two arms that carry it, and a spike on top
    for (const dy of [-0.055, 0.055]) c.add(new THREE.BoxGeometry(0.016, 0.024, 0.10), R, tone(hc, 0.8), { position: [0, -0.45 + dy, Z - 0.055], metal: true });
    c.add(new THREE.ConeGeometry(0.018, 0.08, 5), R, tone(hc, 0.85), { position: [0, -0.635, Z], rotation: [PI, 0, 0], metal: true });
    langets(c, R, -0.56, -0.38, 0.021);
    if (q >= 2) gem(c, R, -0.45, 0.016, hc);
  },
  /** A headsman's axe: ONE long-bearded blade on a long haft, a square poll behind it. Edge on -z. */
  g5_headsman(c, hc, q) {
    haft(c, R, -1.00, 0.22, 0.022);
    langets(c, R, -0.96, -0.60, 0.024);
    collar(c, R, -0.60, 0.034);
    const head = [[0.02, -0.12], [0.10, -0.17], [0.20, -0.15], [0.238, -0.03], [0.225, 0.11], [0.175, 0.235], [0.13, 0.262], [0.118, 0.16], [0.086, 0.065], [0.036, 0.05], [0.02, 0.06]];
    c.add(extrude(head, 0.026), R, hc, { position: [0, -0.82, Z], rotation: [0, PI / 2, 0], metal: true });
    c.add(extrude(inset(head, 0.6, 0.125, 0.03), 0.034), R, tone(hc, 0.7), { position: [0, -0.82, Z], rotation: [0, PI / 2, 0], metal: true });
    // the bright edge, the poll behind the eye, and a flat cap on top
    c.add(taperedCurve([[0, -0.97, Z - 0.2], [0, -0.85, Z - 0.238], [0, -0.71, Z - 0.225], [0, -0.585, Z - 0.175]], [0.008, 0.011, 0.011, 0.008], 4, 8), R, lift(hc, 0.4), { metal: true });
    c.add(new THREE.BoxGeometry(0.05, 0.11, 0.055), R, tone(hc, 0.8), { position: [0, -0.85, Z + 0.045], metal: true });
    c.add(profile([[-1.02, 0.02, 0.02], [-0.99, 0.03, 0.03]], 8), R, IRON, { position: [0, 0, Z], metal: true });
    c.add(profile([[0.20, 0.03, 0.03], [0.245, 0.022, 0.022]], 8), R, IRON, { position: [0, 0, Z], metal: true });
    if (q >= 2) gem(c, R, -0.56, 0.02, hc);
  },
  /** A morningstar: a ball of iron thorns on a banded haft. */
  g5_morningstar(c, hc, q) {
    haft(c, R, -0.40, 0.08, 0.019, DARK);
    collar(c, R, -0.385, 0.03);
    const C = [0, -0.47, Z], r = 0.074;
    c.add(new THREE.IcosahedronGeometry(r, 1), R, tone(hc, 0.85), { position: C, metal: true });
    const f = (1 + Math.sqrt(5)) / 2;
    for (const d of [[0, 1, f], [0, -1, f], [0, 1, -f], [0, -1, -f], [1, f, 0], [-1, f, 0], [1, -f, 0], [-1, -f, 0], [f, 0, 1], [f, 0, -1], [-f, 0, 1], [-f, 0, -1]]) {
      const v = new THREE.Vector3(...d).normalize();
      if (v.y > 0.8) continue;                           // nothing where the haft comes in
      c.add(new THREE.ConeGeometry(0.017, 0.075, 5), R, hc, { position: [C[0] + v.x * (r + 0.028), C[1] + v.y * (r + 0.028), C[2] + v.z * (r + 0.028)], rotation: aim([v.x, v.y, v.z]), metal: true });
    }
    c.add(new THREE.TorusGeometry(r * 0.99, 0.007, 4, 14), R, IRON, { position: C, rotation: [PI / 2, 0, 0], metal: true });
    if (q >= 2) gem(c, R, 0.08, 0.016, hc);
  },
  /** A cooper's mallet: a barrel of a head lying across the haft, bound with two iron hoops. Faces on ±x. */
  g5_mallet(c, hc, q) {
    haft(c, R, -0.60, 0.10, 0.02);
    const y = -0.51, wood = '#7a5632';
    c.add(profile([[-0.13, 0.066, 0.066], [-0.06, 0.08, 0.08], [0.06, 0.08, 0.08], [0.13, 0.066, 0.066]], 10), R, wood, { position: [0, y, Z], rotation: [0, 0, PI / 2] });
    for (const s of [-1, 1]) {
      c.add(profile([[-0.014, 0.078, 0.078], [0.014, 0.074, 0.074]], 10), R, hc, { position: [s * 0.088, y, Z], rotation: [0, 0, s * PI / 2], metal: true });
      // the struck face: a lighter disc, and its rim
      c.add(new THREE.CylinderGeometry(0.064, 0.064, 0.012, 10), R, lift(wood, 0.25), { position: [s * 0.134, y, Z], rotation: [0, 0, PI / 2] });
    }
    c.add(new THREE.BoxGeometry(0.03, 0.03, 0.012), R, IRON, { position: [0, -0.598, Z], metal: true });   // the wedge that holds the head on
    collar(c, R, -0.42, 0.028);
    if (q >= 2) gem(c, R, -0.38, 0.016, hc);
  },
  /** A quarry maul: a block of stone lashed to a long haft with iron straps. Faces on ±x. */
  g5_stonemaul(c, hc, q) {
    haft(c, R, -0.98, 0.20, 0.023);
    const y = -0.84, stone = '#8f8d86';
    c.add(new THREE.BoxGeometry(0.30, 0.19, 0.18), R, stone, { position: [0, y, Z] });
    c.add(new THREE.DodecahedronGeometry(1, 0), R, tone(stone, 0.9), { position: [-0.02, y + 0.01, Z], scale: [0.16, 0.105, 0.1], rotation: [0.3, 0.4, 0.2] });
    c.add(new THREE.BoxGeometry(0.02, 0.17, 0.16), R, lift(stone, 0.18), { position: [-0.155, y, Z] });       // the working face
    c.add(new THREE.BoxGeometry(0.02, 0.15, 0.14), R, tone(stone, 0.8), { position: [0.155, y, Z] });
    for (const s of [-1, 1]) {
      c.add(new THREE.BoxGeometry(0.045, 0.2, 0.19), R, hc, { position: [s * 0.075, y, Z], metal: true });
      for (const sy of [-1, 1]) c.add(low(), R, lift(hc, 0.3), { position: [s * 0.075, y + sy * 0.06, Z + 0.097], scale: [0.012, 0.012, 0.008], metal: true });
    }
    // rope lashing under the head, and a butt cap
    for (let i = 0; i < 3; i++) c.add(profile([[-0.012, 0.03, 0.03], [0.012, 0.03, 0.03]], 8), R, i % 2 ? tone(CORD, 0.8) : CORD, { position: [0, y + 0.115 + i * 0.026, Z] });
    c.add(profile([[0.18, 0.032, 0.032], [0.225, 0.024, 0.024]], 8), R, IRON, { position: [0, 0, Z], metal: true });
    if (q >= 2) gem(c, R, y, 0.022, hc, 0);
  },

  // ================================================================ poles
  /** A partisan: a broad spear blade with two wings at its base, a tassel under the socket. */
  g5_partisan(c, hc, q) {
    haft(c, R, -0.96, 0.54, 0.018);
    langets(c, R, -0.94, -0.80, 0.02);
    const head = mirror([[0, -1.24], [0.046, -1.07], [0.03, -1.0], [0.085, -0.985], [0.105, -0.945], [0.022, -0.945], [0.014, -0.92]]);
    c.add(extrude(head, 0.014), R, hc, { position: [0, 0, Z], metal: true });
    c.add(profile([[-1.2, 0.003, 0.004], [-1.06, 0.012, 0.016], [-0.93, 0.012, 0.016]], 4), R, tone(hc, 0.66), { position: [0, 0, Z], metal: true });
    c.add(profile([[-0.95, 0.016, 0.016], [-0.88, 0.024, 0.024]], 8), R, IRON, { position: [0, 0, Z], metal: true });
    c.add(new THREE.ConeGeometry(0.034, 0.1, 6), R, RED, { position: [0, -0.83, Z] });
    c.add(new THREE.ConeGeometry(0.018, 0.08, 5), R, IRON, { position: [0, 0.58, Z], metal: true });
    if (q >= 2) gem(c, R, -0.91, 0.014, hc);
  },
  /** A bardiche: a long crescent cleaver standing past the end of its haft, socketed at two points. Edge on -z. */
  g5_bardiche(c, hc, q) {
    haft(c, R, -1.02, 0.60, 0.02);
    const y0 = -0.99;
    const bl = [[0.0, -0.29], [0.062, -0.25], [0.122, -0.15], [0.152, -0.01], [0.142, 0.12], [0.1, 0.22], [0.022, 0.275], [0.022, 0.215], [0.068, 0.14], [0.088, 0.02], [0.074, -0.08], [0.022, -0.13], [0.022, -0.2], [0.0, -0.22]];
    c.add(extrude(bl, 0.02), R, hc, { position: [0, y0, Z], rotation: [0, PI / 2, 0], metal: true });
    c.add(extrude([[0.06, -0.2], [0.105, -0.13], [0.128, -0.01], [0.12, 0.1], [0.09, 0.18], [0.085, 0.14], [0.102, 0.02], [0.09, -0.09]], 0.026), R, tone(hc, 0.7), { position: [0, y0, Z], rotation: [0, PI / 2, 0], metal: true });
    // the two sockets, a butt spike and a hand wrap further up for the leading hand
    for (const y of [y0 - 0.02, y0 + 0.245]) c.add(profile([[y - 0.03, 0.027, 0.027], [y + 0.03, 0.027, 0.027]], 8), R, IRON, { position: [0, 0, Z], metal: true });
    c.add(profile([[-0.5, 0.023, 0.023], [-0.36, 0.023, 0.023]], 8), R, '#3a2a1c', { position: [0, 0, Z] });
    c.add(new THREE.ConeGeometry(0.018, 0.08, 5), R, IRON, { position: [0, 0.64, Z], metal: true });
    if (q >= 2) gem(c, R, y0 + 0.245, 0.016, hc);
  },
  /** A harpoon: a barbed head on an iron shank, a line ring, and the line coiled down the haft. */
  g5_harpoon(c, hc, q) {
    haft(c, R, -0.60, 0.40, 0.015);
    c.add(profile([[-0.70, 0.008, 0.008], [-0.58, 0.014, 0.014]], 6), R, IRON, { position: [0, 0, Z], metal: true });
    const head = mirror([[0, -0.86], [0.024, -0.775], [0.056, -0.705], [0.02, -0.735], [0.012, -0.69]]);
    c.add(extrude(head, 0.012), R, hc, { position: [0, 0, Z], metal: true });
    c.add(extrude(head, 0.012), R, hc, { position: [0, 0, Z], rotation: [0, PI / 2, 0], scale: [0.6, 1, 1], metal: true });   // a second pair of barbs, crosswise
    c.add(new THREE.TorusGeometry(0.02, 0.005, 4, 10), R, IRON, { position: [0.022, -0.6, Z], rotation: [PI / 2, 0, 0], metal: true });
    // the line: from the ring down the haft, wound at the grip, a short tail at the butt
    c.add(taperedCurve([[0.03, -0.6, Z], [0.034, -0.4, Z + 0.012], [0.022, -0.2, Z - 0.012], [0.02, -0.07, Z]], [0.005, 0.005], 4, 10), R, CORD);
    for (let i = 0; i < 5; i++) c.add(profile([[-0.008, 0.02, 0.02], [0.008, 0.02, 0.02]], 6), R, i % 2 ? tone(CORD, 0.8) : CORD, { position: [0, -0.06 + i * 0.03, Z] });
    c.add(taperedCurve([[0.018, 0.07, Z], [0.03, 0.2, Z + 0.01], [0.02, 0.33, Z]], [0.005, 0.004], 4, 5), R, CORD);
    if (q >= 2) gem(c, R, -0.58, 0.011, hc);
  },
  /** An ironshod bo: a long staff flared at both ends, shod in studded iron, with loose rings that rattle. */
  g5_bostaff(c, hc, q) {
    const wood = '#6a3f24';
    c.add(profile([[-0.80, 0.026, 0.026], [-0.5, 0.02, 0.02], [0, 0.021, 0.021], [0.5, 0.02, 0.02], [0.80, 0.026, 0.026]], 8), R, wood, { position: [0, 0, Z] });
    for (const s of [-1, 1]) {
      c.add(profile(s < 0 ? [[-0.82, 0.02, 0.02], [-0.80, 0.031, 0.031], [-0.66, 0.027, 0.027]] : [[0.66, 0.027, 0.027], [0.80, 0.031, 0.031], [0.82, 0.02, 0.02]], 8), R, hc, { position: [0, 0, Z], metal: true });
      for (let k = 0; k < 4; k++) { const t = k / 4 * PI * 2; c.add(new THREE.OctahedronGeometry(1), R, lift(hc, 0.35), { position: [Math.sin(t) * 0.03, s * 0.73, Z + Math.cos(t) * 0.03], scale: [0.009, 0.009, 0.009], metal: true }); }
      for (let k = 0; k < 3; k++) c.add(new THREE.TorusGeometry(0.03, 0.006, 3, 8), R, GOLD, { position: [0, s * (0.6 - k * 0.035), Z], rotation: [PI / 2 + (k - 1) * 0.25, 0, (k - 1) * 0.2], metal: true });
    }
    for (const y of [-0.16, 0.16]) c.add(profile([[y - 0.07, 0.025, 0.025], [y + 0.07, 0.025, 0.025]], 8), R, RED, { position: [0, 0, Z] });
    if (q >= 2) for (const y of [-0.64, 0.64]) gem(c, R, y, 0.014, hc);
  },

  // ================================================================ shooters
  /**
   * A horn recurve. IN THE LEFT HAND, like `bow` (the right draws the string): built for the shot, so the
   * limbs run along the hand's z and the back of the bow faces -y. Unlike the plain bow its limbs sweep
   * back and then curl FORWARD again at the tips (the recurve), with pale horn ears and gold bindings.
   */
  g5_recurve(c, hc, q) {
    const L = 'handL', G = [0, -0.035, 0.055];
    const at = ([x, y, z]) => [x + G[0], y + G[1], z + G[2]];
    c.add(profile([[-0.07, 0.024, 0.021], [0, 0.02, 0.019], [0.07, 0.024, 0.021]], 8), L, '#3a2a1c', { position: G, rotation: [PI / 2, 0, 0] });
    for (const k of [-1, 1]) {
      c.add(taperedCurve([at([0, -0.012, k * 0.06]), at([0, 0.03, k * 0.2]), at([0, 0.092, k * 0.33]), at([0, 0.085, k * 0.41])], [0.025, 0.021, 0.015, 0.012], 5, 9), L, hc, { metal: true });
      // the ear: a stiff horn tip curling back toward the target
      c.add(taperedCurve([at([0, 0.085, k * 0.41]), at([0, 0.06, k * 0.465]), at([0, 0.012, k * 0.5])], [0.012, 0.01, 0.005], 5, 6), L, BONE);
      for (const z of [0.13, 0.4]) c.add(new THREE.TorusGeometry(0.02, 0.006, 4, 8), L, GOLD, { position: at([0, z < 0.2 ? 0.006 : 0.087, k * z]), metal: true });
    }
    poly(c, L, [at([0, 0.07, -0.452]), at([0, 0.07, 0.452])], 0.004, '#e8e0c0');
    if (q >= 2) c.add(new THREE.IcosahedronGeometry(1, 0), L, lift(hc, 0.4), { position: at([0, -0.03, 0]), scale: [0.012, 0.012, 0.016], metal: true });
  },
  /**
   * An arbalest: the heavy crossbow. Same carriage as `crossbow` (stock along +z, hold kind 'crossbow'), but
   * with a wide steel prod, a foot stirrup at the muzzle and a windlass crank at the butt.
   */
  g5_arbalest(c, hc, q) {
    const y = -0.07;
    c.add(new THREE.BoxGeometry(0.055, 0.062, 0.44), R, WOOD, { position: [0, y, 0.2] });
    c.add(new THREE.BoxGeometry(0.06, 0.09, 0.07), R, tone(WOOD, 0.8), { position: [0, y + 0.012, -0.03] });               // the butt
    c.add(new THREE.BoxGeometry(0.03, 0.012, 0.3), R, lift(WOOD, 0.2), { position: [0, y + 0.036, 0.25] });                 // the bolt groove
    c.add(taperedCurve([[-0.27, y + 0.005, 0.31], [-0.15, y + 0.015, 0.39], [0, y + 0.02, 0.415], [0.15, y + 0.015, 0.39], [0.27, y + 0.005, 0.31]], [0.009, 0.017, 0.022, 0.017, 0.009], 5, 10), R, hc, { metal: true });
    for (const s of [-1, 1]) c.add(new THREE.TorusGeometry(0.02, 0.006, 4, 8), R, CORD, { position: [s * 0.045, y + 0.02, 0.41], rotation: [0, PI / 2, 0] });   // the lashing that binds the prod
    poly(c, R, [[-0.27, y + 0.01, 0.31], [0, y + 0.04, 0.17], [0.27, y + 0.01, 0.31]], 0.004, '#e8e0c0');
    poly(c, R, [[0, y + 0.044, 0.18], [0, y + 0.044, 0.42]], 0.007, IRON, { metal: true });
    c.add(new THREE.ConeGeometry(0.014, 0.045, 5), R, IRON, { position: [0, y + 0.044, 0.44], rotation: [PI / 2, 0, 0], metal: true });
    // the stirrup (a loop out past the prod, for a foot) and the windlass
    c.add(new THREE.TorusGeometry(0.04, 0.007, 4, 12), R, IRON, { position: [0, y, 0.465], rotation: [PI / 2, 0, 0], metal: true });
    c.add(profile([[-0.07, 0.012, 0.012], [0.07, 0.012, 0.012]], 6), R, IRON, { position: [0, y + 0.01, -0.035], rotation: [0, 0, PI / 2], metal: true });
    for (const s of [-1, 1]) c.add(new THREE.BoxGeometry(0.012, 0.07, 0.014), R, IRON, { position: [s * 0.075, y + 0.01 + s * 0.03, -0.035], metal: true });
    c.add(new THREE.BoxGeometry(0.02, 0.05, 0.02), R, IRON, { position: [0, y - 0.05, 0.12], metal: true });                // the trigger bar
    if (q >= 2) c.add(new THREE.IcosahedronGeometry(1, 0), R, lift(hc, 0.4), { position: [0, y + 0.045, 0.02], scale: [0.014, 0.012, 0.018], metal: true });
  },

  // ================================================================ sceptre, orb, tome
  /** A crownhead sceptre: four claws closing over a cut stone, on a gilded rod. A sceptre is swung, so it is short and solid. */
  g5_crownsceptre(c, hc, q) {
    grip(c, R, -0.12, 0.07, 0.018, '#2a2018');
    pommel(c, R, 0.09, 'wheel', 0.024, GOLD);
    c.add(profile([[-0.32, 0.013, 0.013], [-0.12, 0.016, 0.016]], 8), R, GOLD, { position: [0, 0, Z], metal: true });
    for (const y of [-0.13, -0.22, -0.31]) collar(c, R, y, 0.02, tone(GOLD, 0.8));
    const y0 = -0.39;
    c.add(new THREE.OctahedronGeometry(1), R, lift(hc, 0.3), { position: [0, y0, Z], scale: [0.04, 0.06, 0.04] });
    for (let i = 0; i < 4; i++) {
      const t = i / 4 * PI * 2 + PI / 4, sx = Math.sin(t), cz = Math.cos(t);
      c.add(taperedCurve([[sx * 0.016, -0.31, Z + cz * 0.016], [sx * 0.058, -0.36, Z + cz * 0.058], [sx * 0.05, -0.43, Z + cz * 0.05], [sx * 0.014, -0.47, Z + cz * 0.014]], [0.012, 0.011, 0.008, 0.004], 4, 8), R, GOLD, { metal: true });
    }
    c.add(new THREE.TorusGeometry(0.052, 0.007, 4, 12), R, GOLD, { position: [0, y0 + 0.015, Z], rotation: [PI / 2, 0, 0], metal: true });
    if (q >= 2) gem(c, R, -0.22, 0.012, hc);
  },
  /** An armillary orb: a small bright globe inside three turning rings, on a claw that sits in the palm. */
  g5_armillary(c, hc, q) {
    const P = [0, 0.03, 0.18];
    c.add(new THREE.CylinderGeometry(0.012, 0.02, 0.07, 6), R, GOLD, { position: [0, -0.02, 0.1], rotation: [0.9, 0, 0], metal: true });
    c.add(new THREE.SphereGeometry(0.052, 12, 8), R, lift(hc, 0.2), { position: P });
    c.add(new THREE.SphereGeometry(0.024, 8, 6), R, lift(hc, 0.75), { position: P });
    for (const [r, rot] of [[0.1, [PI / 2, 0, 0]], [0.092, [0.5, 0.3, 0.4]], [0.084, [0, 1.1, 0.9]]]) c.add(new THREE.TorusGeometry(r, 0.006, 4, 22), R, GOLD, { position: P, rotation: rot, metal: true });
    c.add(low(), R, '#f4f0e0', { position: [P[0] + 0.1, P[1], P[2]], scale: [0.012, 0.012, 0.012] });                     // a moon on the outer ring
    poly(c, R, [[P[0], P[1] - 0.11, P[2]], [P[0], P[1] + 0.11, P[2]]], 0.004, tone(GOLD, 0.8), { metal: true });          // the axis pin
    if (q >= 2) for (const s of [-1, 1]) c.add(new THREE.OctahedronGeometry(1), R, lift(hc, 0.6), { position: [P[0], P[1] + s * 0.118, P[2]], scale: [0.01, 0.016, 0.01] });
  },
  /** An open codex: held open in the palm, both pages showing, a ribbon and a hanging bookmark charm. */
  g5_codex(c, hc, q) {
    const B = [0, -0.07, 0.13], cover = hc && hc !== '#9a9aa8' && hc !== '#c8ccd6' ? hc : '#5a2a3a', page = '#efe6cc';
    for (const s of [-1, 1]) {
      const rot = [0, -s * 0.42, 0];
      c.add(new THREE.BoxGeometry(0.15, 0.21, 0.012), R, cover, { position: [B[0] + s * 0.07, B[1], B[2] + 0.028], rotation: rot });
      c.add(new THREE.BoxGeometry(0.135, 0.19, 0.022), R, page, { position: [B[0] + s * 0.066, B[1], B[2] + 0.044], rotation: rot });
      for (let k = 0; k < 4; k++) c.add(new THREE.BoxGeometry(0.09, 0.006, 0.004), R, '#6a5a4a', { position: [B[0] + s * 0.068, B[1] + 0.06 - k * 0.035, B[2] + 0.058 + 0.0], rotation: rot });
      for (const sy of [-1, 1]) c.add(new THREE.BoxGeometry(0.03, 0.03, 0.016), R, GOLD, { position: [B[0] + s * 0.128, B[1] + sy * 0.092, B[2] + 0.055], rotation: rot, metal: true });
    }
    c.add(new THREE.CylinderGeometry(0.016, 0.016, 0.215, 6), R, tone(cover, 0.75), { position: [B[0], B[1], B[2]] });        // the spine
    c.add(new THREE.BoxGeometry(0.012, 0.25, 0.004), R, RED, { position: [B[0] + 0.006, B[1] - 0.03, B[2] + 0.03] });
    if (q >= 2) c.add(new THREE.OctahedronGeometry(1), R, lift(GOLD, 0.3), { position: [B[0] + 0.006, B[1] - 0.17, B[2] + 0.03], scale: [0.012, 0.02, 0.008], metal: true });
  },

  // ================================================================ wands, one per attack form
  /** PROJECTILE — a dart: a long crystal point, three swept fins behind it. */
  g5_wand_dart(c, hc, q) {
    wandStick(c, -0.27);
    wadd(c, new THREE.OctahedronGeometry(1), lift(hc, 0.35), { y: -0.315, scale: [0.02, 0.06, 0.02] });
    wadd(c, profile([[-0.012, 0.015, 0.015], [0.012, 0.011, 0.011]], 6), GOLD, { y: -0.262, metal: true });
    for (let k = 0; k < 3; k++) {
      const t = k / 3 * PI * 2, g = extrude([[0, -0.03], [0.03, 0.03], [0.03, 0.045], [0, 0.02]], 0.005);
      g.rotateY(t); wadd(c, g, tone(hc, 0.8), { y: -0.2, metal: true });
    }
    if (q >= 3) wadd(c, new THREE.TorusGeometry(0.026, 0.004, 3, 10), lift(hc, 0.5), { y: -0.31 });
  },
  /** CONE — a bell mouth: the stick opens into a flared trumpet with a bright throat. */
  g5_wand_bell(c, hc, q) {
    wandStick(c, -0.24);
    const bell = profile([[-0.11, 0.058, 0.058], [-0.08, 0.04, 0.04], [-0.04, 0.022, 0.022], [0, 0.012, 0.012]], 10), lining = inside(bell);
    wadd(c, bell, GOLD, { y: -0.23, metal: true });
    wadd(c, lining, lift(hc, 0.25), { y: -0.23 });
    const rim = new THREE.TorusGeometry(0.058, 0.006, 4, 14); rim.rotateX(PI / 2);
    wadd(c, rim, tone(GOLD, 0.8), { y: -0.34, metal: true });
    wadd(c, low(), lift(hc, 0.55), { y: -0.285, scale: [0.016, 0.016, 0.016] });
    if (q >= 2) for (let k = 0; k < 5; k++) { const t = k / 5 * PI * 2; wadd(c, low(), lift(hc, 0.4), { y: -0.34, x: Math.sin(t) * 0.058, z: Math.cos(t) * 0.058, scale: [0.008, 0.008, 0.008] }); }
  },
  /** AREA — a hoop: a ring on the end of the stick with a stone hanging in the middle of it. */
  g5_wand_hoop(c, hc, q) {
    wandStick(c, -0.25);
    wadd(c, new THREE.TorusGeometry(0.056, 0.008, 5, 18), GOLD, { y: -0.31, metal: true });
    wadd(c, new THREE.IcosahedronGeometry(1, 0), lift(hc, 0.35), { y: -0.31, scale: [0.022, 0.026, 0.022] });
    for (let k = 0; k < 4; k++) { const t = k / 4 * PI * 2 + PI / 4; wadd(c, low(), lift(hc, 0.5), { y: -0.31 + Math.cos(t) * 0.056, x: Math.sin(t) * 0.056, scale: [0.012, 0.012, 0.012] }); }
    if (q >= 2) wadd(c, new THREE.TorusGeometry(0.036, 0.003, 3, 14), lift(hc, 0.6), { y: -0.31 });
  },
  /** BEAM — a sunglass: two straight prongs carrying a pair of lenses in line. */
  g5_wand_lens(c, hc, q) {
    wandStick(c, -0.23, '#2e2a30');
    wadd(c, profile([[-0.01, 0.034, 0.012], [0.012, 0.014, 0.012]], 6), GOLD, { y: -0.225, metal: true });
    for (const s of [-1, 1]) wadd(c, profile([[-0.17, 0.004, 0.004], [0, 0.006, 0.006]], 5), GOLD, { y: -0.235, x: s * 0.03, metal: true });
    for (const [y, r] of [[-0.3, 0.03], [-0.37, 0.022]]) {
      wadd(c, new THREE.CylinderGeometry(r, r, 0.008, 12), y < -0.33 ? lift(hc, 0.55) : GLASS, { y });
      const rim = new THREE.TorusGeometry(r, 0.004, 3, 12); rim.rotateX(PI / 2);
      wadd(c, rim, GOLD, { y, metal: true });
    }
    if (q >= 2) wadd(c, new THREE.OctahedronGeometry(1), lift(hc, 0.6), { y: -0.41, scale: [0.008, 0.016, 0.008] });
  },
  /** FORK — a forked twig: one stem, three tines, a bead of light on each. */
  g5_wand_fork(c, hc, q) {
    const wood = '#5a4028';
    wandStick(c, -0.19, wood, '#3aa35a');
    const tine = (pts, r) => { const g = taperedCurve(pts, r, 5, 7); c.add(g, R, wood, { position: [0, 0, Z], rotation: TILT, scale: [WS, WS, WS] }); };
    tine([[0, -0.17, 0], [0.012, -0.24, 0], [0, -0.33, 0]], [0.009, 0.007, 0.004]);
    for (const s of [-1, 1]) tine([[0, -0.17, 0], [s * 0.04, -0.21, 0], [s * 0.066, -0.27, 0], [s * 0.07, -0.325, 0]], [0.009, 0.007, 0.006, 0.004]);
    for (const [x, y] of [[0, -0.345], [-0.07, -0.34], [0.07, -0.34]]) wadd(c, new THREE.IcosahedronGeometry(1, 0), lift(hc, 0.4), { y, x, scale: [0.014, 0.018, 0.014] });
    wadd(c, low(), '#3aa35a', { y: -0.215, x: 0.03, z: 0.012, scale: [0.02, 0.008, 0.012] });
    if (q >= 2) wadd(c, new THREE.TorusGeometry(0.014, 0.003, 3, 8), lift(hc, 0.6), { y: -0.345 });
  },
  /** SHIELD — a warding wand: a small escutcheon on the tip, boss and rim, facing forward. */
  g5_wand_ward(c, hc, q) {
    wandStick(c, -0.25, '#3a2f28', '#c8c8d8');
    const esc = [[-0.05, 0.05], [0.05, 0.05], [0.05, -0.005], [0.03, -0.045], [0, -0.07], [-0.03, -0.045], [-0.05, -0.005]];
    wadd(c, extrude(esc, 0.012), lift(hc, 0.15), { y: -0.3, metal: true });
    wadd(c, extrude(esc.map(([x, y]) => [x * 1.14, y * 1.12 - 0.002]), 0.007), '#c8c8d8', { y: -0.3, metal: true });
    for (const z of [0.009, -0.009]) wadd(c, low(), lift(hc, 0.55), { y: -0.3, z, scale: [0.016, 0.016, 0.008] });
    for (const z of [0.0075, -0.0075]) wadd(c, new THREE.BoxGeometry(0.008, 0.1, 0.003), '#c8c8d8', { y: -0.305, z, metal: true });
    if (q >= 2) for (const s of [-1, 1]) wadd(c, new THREE.OctahedronGeometry(1), lift(hc, 0.6), { y: -0.262, x: s * 0.05, scale: [0.007, 0.011, 0.007] });
  },

  // ================================================================ staves, one per attack form (topper at +y)
  /** PROJECTILE — a spire: one tall crystal point in a three-claw cradle, two shards at its foot. */
  g5_staff_spire(c, hc, q) {
    staffPole(c);
    const y0 = STAFF_TOP;
    c.add(new THREE.OctahedronGeometry(1), R, lift(hc, 0.35), { position: [0, y0 + 0.16, Z], scale: [0.038, 0.14, 0.038] });
    for (let k = 0; k < 3; k++) {
      const t = k / 3 * PI * 2, sx = Math.sin(t), cz = Math.cos(t);
      c.add(taperedCurve([[sx * 0.02, y0 + 0.01, Z + cz * 0.02], [sx * 0.058, y0 + 0.07, Z + cz * 0.058], [sx * 0.034, y0 + 0.14, Z + cz * 0.034]], [0.011, 0.009, 0.004], 4, 6), R, GOLD, { metal: true });
      c.add(new THREE.OctahedronGeometry(1), R, lift(hc, 0.5), { position: [sx * 0.045 + cz * 0.02, y0 + 0.045, Z + cz * 0.045 - sx * 0.02], scale: [0.012, 0.035, 0.012], rotation: [cz * 0.5, 0, -sx * 0.5] });
    }
    if (q >= 2) c.add(new THREE.TorusGeometry(0.05, 0.004, 3, 14), R, lift(hc, 0.6), { position: [0, y0 + 0.2, Z], rotation: [PI / 2, 0, 0] });
  },
  /** CONE — a horncall staff: the pole bends over into a banded horn whose mouth opens forward. */
  g5_staff_horn(c, hc, q) {
    staffPole(c, '#4a3422', '#c8c8d8');
    const y0 = STAFF_TOP;
    c.add(taperedCurve([[0, y0, Z], [0, y0 + 0.09, Z - 0.012], [0, y0 + 0.16, Z + 0.035], [0, y0 + 0.175, Z + 0.1]], [0.024, 0.024, 0.026, 0.028], 7, 9), R, '#4a3422');
    // the horn: a flaring open shell along +z, pale inside, with a bright rim
    const horn = profile([[0, 0.026, 0.026], [0.07, 0.04, 0.04], [0.13, 0.066, 0.066], [0.16, 0.092, 0.092]], 12); horn.rotateX(PI / 2);
    const lining = inside(horn);
    c.add(horn, R, BONE, { position: [0, y0 + 0.175, Z + 0.09] });
    c.add(lining, R, lift(hc, 0.3), { position: [0, y0 + 0.175, Z + 0.09] });
    c.add(new THREE.TorusGeometry(0.092, 0.008, 4, 16), R, '#c8c8d8', { position: [0, y0 + 0.175, Z + 0.25], metal: true });
    for (const z of [0.1, 0.165]) c.add(new THREE.TorusGeometry(z < 0.12 ? 0.03 : 0.044, 0.006, 4, 12), R, '#c8c8d8', { position: [0, y0 + 0.175, Z + z], metal: true });
    c.add(low(), R, lift(hc, 0.55), { position: [0, y0 + 0.175, Z + 0.16], scale: [0.022, 0.022, 0.022] });
    // two cords with feathers hanging from the bend
    for (const s of [-1, 1]) { c.add(taperedCurve([[s * 0.024, y0 + 0.1, Z], [s * 0.04, y0 + 0.02, Z + 0.01], [s * 0.036, y0 - 0.07, Z]], [0.004, 0.004], 3, 5), R, RED); c.add(new THREE.ConeGeometry(0.014, 0.07, 4), R, s < 0 ? BONE : tone(hc, 0.9), { position: [s * 0.036, y0 - 0.1, Z], rotation: [PI, 0, 0] }); }
    if (q >= 2) gem(c, R, y0 + 0.01, 0.014, hc);
  },
  /** AREA — a halo: a wide ring on a yoke with a globe hanging in the middle. */
  g5_staff_halo(c, hc, q) {
    staffPole(c);
    const y0 = STAFF_TOP, cy = y0 + 0.17, r = 0.105;
    c.add(new THREE.TorusGeometry(r, 0.012, 5, 22), R, GOLD, { position: [0, cy, Z], metal: true });
    for (const s of [-1, 1]) c.add(taperedCurve([[0, y0 + 0.01, Z], [s * 0.05, y0 + 0.035, Z], [s * 0.075, y0 + 0.095, Z]], [0.014, 0.012, 0.009], 5, 6), R, GOLD, { metal: true });
    c.add(new THREE.SphereGeometry(0.045, 12, 8), R, lift(hc, 0.3), { position: [0, cy, Z] });
    c.add(new THREE.SphereGeometry(0.02, 8, 6), R, lift(hc, 0.8), { position: [0, cy, Z] });
    for (let k = 0; k < 8; k++) { const t = k / 8 * PI * 2; c.add(new THREE.OctahedronGeometry(1), R, k % 2 ? lift(hc, 0.5) : GOLD, { position: [Math.sin(t) * (r + 0.02), cy + Math.cos(t) * (r + 0.02), Z], scale: [0.012, 0.02, 0.01], rotation: [0, 0, -t], metal: k % 2 === 0 }); }
    if (q >= 2) c.add(new THREE.TorusGeometry(0.068, 0.004, 3, 18), R, lift(hc, 0.6), { position: [0, cy, Z], rotation: [0.5, 0.4, 0] });
  },
  /** BEAM — a sunglass staff: a tall yoke carrying a big lens, a smaller one on an arm in front of it. */
  g5_staff_lens(c, hc, q) {
    staffPole(c, '#2e2a30');
    const y0 = STAFF_TOP, cy = y0 + 0.16;
    for (const s of [-1, 1]) c.add(taperedCurve([[0, y0 + 0.01, Z], [s * 0.074, y0 + 0.05, Z], [s * 0.078, cy, Z], [s * 0.06, y0 + 0.27, Z]], [0.014, 0.011, 0.009, 0.005], 5, 9), R, GOLD, { metal: true });
    const disc = (r, z, colour) => {
      c.add(new THREE.CylinderGeometry(r, r, 0.012, 16), R, colour, { position: [0, cy, Z + z], rotation: [PI / 2, 0, 0] });
      c.add(new THREE.TorusGeometry(r, 0.007, 4, 16), R, GOLD, { position: [0, cy, Z + z], metal: true });
    };
    disc(0.07, 0, GLASS);
    disc(0.036, 0.1, lift(hc, 0.5));
    poly(c, R, [[0, cy - 0.07, Z], [0, cy - 0.05, Z + 0.1], [0, cy - 0.036, Z + 0.1]], 0.005, GOLD, { metal: true });
    for (const s of [-1, 1]) c.add(low(), R, GOLD, { position: [s * 0.076, cy, Z], scale: [0.014, 0.014, 0.014], metal: true });
    if (q >= 2) c.add(new THREE.OctahedronGeometry(1), R, lift(hc, 0.6), { position: [0, y0 + 0.3, Z], scale: [0.012, 0.03, 0.012] });
  },
  /** FORK — a stormbranch: the pole splits into three crooked boughs, a spark of stone on each tip. */
  g5_staff_branch(c, hc, q) {
    const wood = '#5a4028';
    staffPole(c, wood, '#6a7a8a');
    const y0 = STAFF_TOP;
    const bough = (pts, r) => c.add(taperedCurve(pts.map(([x, y, z = 0]) => [x, y0 + y, Z + z]), r, 5, 9), R, wood);
    bough([[0, 0, 0], [0.02, 0.1, 0.01], [-0.012, 0.2, 0], [0.006, 0.31, 0]], [0.022, 0.016, 0.012, 0.005]);
    bough([[0, 0.04, 0], [-0.06, 0.1, -0.01], [-0.09, 0.18, 0.01], [-0.13, 0.25, 0]], [0.017, 0.013, 0.01, 0.005]);
    bough([[0, 0.06, 0], [0.07, 0.12, 0.012], [0.085, 0.2, -0.01], [0.125, 0.27, 0]], [0.016, 0.012, 0.009, 0.005]);
    bough([[-0.075, 0.14, 0], [-0.055, 0.2, 0.02], [-0.06, 0.24, 0.03]], [0.008, 0.006, 0.003]);
    for (const [x, y] of [[0.006, 0.33], [-0.135, 0.27], [0.13, 0.29]]) c.add(new THREE.OctahedronGeometry(1), R, lift(hc, 0.4), { position: [x, y0 + y, Z], scale: [0.018, 0.03, 0.018] });
    poly(c, R, [[-0.13, y0 + 0.27, Z], [-0.06, y0 + 0.3, Z + 0.01], [0.0, y0 + 0.33, Z]], 0.003, lift(hc, 0.6));
    if (q >= 2) poly(c, R, [[0.006, y0 + 0.33, Z], [0.07, y0 + 0.305, Z - 0.01], [0.13, y0 + 0.29, Z]], 0.003, lift(hc, 0.6));
  },
  /** SHIELD — a bulwark staff: a small kite shield stands on the pole, face forward, boss and bars. */
  g5_staff_aegis(c, hc, q) {
    staffPole(c, '#4a3422', '#c8c8d8');
    const y0 = STAFF_TOP, cy = y0 + 0.16;
    const sh = [[-0.095, 0.12], [0.095, 0.12], [0.095, 0.02], [0.06, -0.07], [0, -0.13], [-0.06, -0.07], [-0.095, 0.02]];
    c.add(extrude(sh, 0.022), R, lift(hc, 0.1), { position: [0, cy, Z], metal: true });
    c.add(extrude(sh.map(([x, y]) => [x * 1.1, y * 1.08 - 0.002]), 0.012), R, '#c8c8d8', { position: [0, cy, Z], metal: true });
    for (const s of [1, -1]) {
      c.add(low(), R, lift(hc, 0.5), { position: [0, cy + 0.01, Z + s * 0.014], scale: [0.03, 0.03, 0.014], metal: true });
      c.add(new THREE.BoxGeometry(0.012, 0.23, 0.004), R, '#c8c8d8', { position: [0, cy - 0.005, Z + s * 0.012], metal: true });
      c.add(new THREE.BoxGeometry(0.18, 0.012, 0.004), R, '#c8c8d8', { position: [0, cy + 0.07, Z + s * 0.012], metal: true });
    }
    c.add(new THREE.ConeGeometry(0.016, 0.06, 5), R, '#c8c8d8', { position: [0, cy + 0.16, Z], metal: true });
    if (q >= 2) for (const s of [-1, 1]) c.add(new THREE.OctahedronGeometry(1), R, lift(hc, 0.6), { position: [s * 0.07, cy + 0.07, Z + 0.016], scale: [0.01, 0.014, 0.006] });
  },
};
