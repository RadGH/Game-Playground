// Chibi 2 — backpacks (Thousandvale owner feedback 8, W19: "for the back slot add backpacks").
//
// Four packs worn on the BACK in place of a cloak, every one a new `g5_` id listed in chibi2-gear5-ids.js
// (`G5_CAPES`, type 'pack') and reached only through chibi2-gear5.js — nothing that existed changes:
//
//   g5_pack_satchel    a small sling bag: one strap across the chest, the bag low on the back by the left hip
//   g5_pack_rucksack   a soft sack with a buckled flap, two shoulder straps and a side pocket
//   g5_pack_frame      a tall pack on a wooden frame: bedroll across the top, a cook pot hung behind
//   g5_pack_explorer   the rare one: tooled flap, two side pockets, a coil of rope, bedroll slung underneath
//
// A pack goes in `avatar.cape = { id, color, color2 }` (the back slot draws ONE thing: a cloak or a pack).
// `color` is the canvas / leather of the bag, `color2` the trim (buckles, piping).
//
// BONE SPACE: everything hangs off `chest`. +y is up (shoulders at ~0.3T), the back is -z and the
// character's right is +x. The surface of the back / chest under whatever is worn is asked of
// `c.chestZ(x, y, side, lift)` (side -1 = back), so a pack sits ON a plate cuirass rather than inside it
// and its straps lie over the shoulders of any body, any race.
import * as THREE from 'three';
import { profile, taperedCurve } from './chibi2-geometry.js';
import { KIT } from './chibi2-weapons.js';

const { tone, lift } = KIT;
const BRASS = '#c8a040', IRON = '#5a5f68', WOOD = '#6a4a2a', LEATHER = '#4a3624', WOOL = '#8a6a4a', ROPE = '#c8b488';
const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const cyl = (r0, r1, h, n = 10) => new THREE.CylinderGeometry(r0, r1, h, n);
const tor = (r, t, n = 12, arc = Math.PI * 2) => new THREE.TorusGeometry(r, t, 5, n, arc);
const sph = (ws = 10, hs = 6) => new THREE.SphereGeometry(1, ws, hs);

/** What every pack shares: where the back is, and straps that follow the body. */
function rig(c) {
  const { add, W = 1, T = 1 } = c;
  const plate = c.topStyle?.armor ? 0.03 : 0.01;
  /** The back surface (negative z) at (x, y), pushed out by `l`. */
  const back = (x, y, l = 0) => (c.chestZ ? c.chestZ(x, y, -1, plate + l) : -(0.15 * W + plate + l));
  /** The front surface at (x, y). */
  const front = (x, y, l = 0) => (c.chestZ ? c.chestZ(x, y, 1, plate + l) : 0.14 * W + plate + l);
  /** A shoulder strap on side `s` (+1 = right): from the pack's top, over the shoulder, down the chest, back under the arm. */
  const shoulderStrap = (s, { topY = 0.22, lowY = -0.06, colour = LEATHER, r = 0.014, packZ = null } = {}) => {
    const x0 = s * 0.085 * W, x1 = s * 0.125 * W, x2 = s * 0.145 * W;
    const zTop = packZ ?? back(x0, topY * T, 0.02);
    const pts = [
      [x0, (topY + 0.02) * T, zTop],
      [x0 + s * 0.012, 0.305 * T, back(x1, 0.3 * T, 0.012) * 0.55],
      [x1, 0.325 * T, 0.0],
      [x1 + s * 0.008, 0.285 * T, front(x1, 0.285 * T, 0.012)],
      [x2, 0.16 * T, front(x2, 0.16 * T, 0.012)],
      [x2 + s * 0.012, 0.04 * T, front(x2, 0.04 * T, 0.012) * 0.82],
      [s * 0.19 * W, lowY * T, 0.0],
      [s * 0.14 * W, (lowY - 0.03) * T, back(s * 0.14 * W, lowY * T, 0.02)],
    ];
    add(taperedCurve(pts, pts.map(() => r), 4, 18), 'chest', colour);
    // the slide buckle on the chest
    add(box(0.034, 0.026, 0.012), 'chest', BRASS, { position: [x2, 0.115 * T, front(x2, 0.115 * T, 0.02)], metal: true });
  };
  return { add, W, T, back, front, shoulderStrap };
}

/** A soft bag body: a squashed, rounded sack built from rings (y, half-width x, half-depth z), its back flat to the body. */
function sack(add, { x = 0, y = 0, z = 0, w, h, d, colour, belly = 1, tilt = 0, sag = 0.06 }) {
  // rings from the bottom up: tucked base, full belly a third of the way up, drawn in a little under the flap
  const rings = [
    [-h * 0.5, w * 0.34, d * 0.3],
    [-h * 0.44, w * 0.46, d * 0.44],
    [-h * 0.2, w * 0.5 * belly, d * 0.52 * belly],
    [h * 0.12, w * 0.49, d * 0.5],
    [h * 0.38, w * 0.45, d * 0.42],
    [h * 0.5, w * 0.36, d * 0.3],
  ];
  add(profile(rings, 12), 'chest', colour, { position: [x, y - sag * h * 0.2, z], rotation: [tilt, 0, 0] });
}

/** A flap over the top of a sack: a curved lid coming down the outer face, with piping along its edge. */
function flap(add, { x = 0, y, z, w, drop, d, colour, trim, buckle = true }) {
  const lid = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.55);
  add(lid, 'chest', colour, { position: [x, y, z], scale: [w * 0.5, d * 0.62, d * 0.56] });
  // the tongue down the outer (far) face
  const tongue = new THREE.CylinderGeometry(w * 0.4, w * 0.3, drop, 10, 1, true, Math.PI * 0.62, Math.PI * 0.76);
  add(tongue, 'chest', tone(colour, 0.9), { position: [x, y - drop * 0.5 + 0.01, z + d * 0.02], scale: [1, 1, (d * 0.56) / (w * 0.4)] });
  // piping round the lid's rim
  const rim = [];
  for (let k = 0; k <= 12; k++) { const t = Math.PI * (0.62 + 0.76 * k / 12); rim.push([x + Math.sin(t) * w * 0.3, y - drop + 0.012, z + d * 0.02 + Math.cos(t) * d * 0.44]); }
  add(taperedCurve(rim, [0.006, 0.008, 0.006], 4, 14), 'chest', trim);
  if (buckle) {
    add(box(0.022, drop * 0.75, 0.01), 'chest', LEATHER, { position: [x, y - drop * 0.55, z - d * 0.55] });
    add(box(0.038, 0.032, 0.014), 'chest', BRASS, { position: [x, y - drop * 0.9, z - d * 0.56], metal: true });
  }
}

/** A rolled blanket lying across (along x), with two straps round it. */
function bedroll(add, { x = 0, y, z, len, r = 0.055, colour = WOOL }) {
  add(cyl(r, r, len, 12), 'chest', colour, { position: [x, y, z], rotation: [0, 0, Math.PI / 2] });
  for (const s of [-1, 1]) {
    add(cyl(r * 0.72, r * 0.72, 0.012, 10), 'chest', tone(colour, 0.7), { position: [x + s * len * 0.5, y, z], rotation: [0, 0, Math.PI / 2] });   // the spiral end
    add(tor(r + 0.004, 0.008, 12), 'chest', LEATHER, { position: [x + s * len * 0.28, y, z], rotation: [0, Math.PI / 2, 0] });
  }
}

export const G5_PACK_BUILDERS = {
  /** A sling satchel: one wide strap from the right shoulder to the left hip, a flat flapped bag riding low behind that hip. */
  g5_pack_satchel(a, c, part) {
    const R = rig(c), { add, W, T, back, front } = R;
    const cc = part?.color || '#7a5a3a', trim = part?.color2 || BRASS;
    const bx = -0.13 * W, by = -0.1 * T, bz = back(bx, by, 0.07);
    // the bag: wider than deep, tipped to follow the hip
    sack(add, { x: bx, y: by, z: bz, w: 0.24 * W, h: 0.2, d: 0.13, colour: cc, belly: 1.05 });
    flap(add, { x: bx, y: by + 0.085, z: bz, w: 0.25 * W, drop: 0.13, d: 0.13, colour: tone(cc, 0.82), trim });
    // the strap: up the back to the right shoulder, over, and down across the chest to the bag's front corner
    const s = [
      [bx + 0.05 * W, by + 0.09, bz + 0.05],
      [0.02 * W, 0.12 * T, back(0.02 * W, 0.12 * T, 0.014)],
      [0.1 * W, 0.27 * T, back(0.1 * W, 0.27 * T, 0.014)],
      [0.125 * W, 0.325 * T, 0.0],
      [0.1 * W, 0.27 * T, front(0.1 * W, 0.27 * T, 0.014)],
      [0.0, 0.13 * T, front(0, 0.13 * T, 0.016)],
      [-0.12 * W, -0.01 * T, front(-0.12 * W, -0.01 * T, 0.014)],
      [-0.2 * W, -0.07 * T, 0.02],
      [bx - 0.07 * W, by + 0.08, bz + 0.05],
    ];
    add(taperedCurve(s, s.map(() => 0.016), 4, 22), 'chest', LEATHER);
    add(box(0.04, 0.03, 0.014), 'chest', trim, { position: [0.03 * W, 0.16 * T, front(0.03 * W, 0.16 * T, 0.026)], rotation: [0, 0, -0.7], metal: true });
  },

  /** A trail rucksack: a soft round sack high on the back, flap buckled down, a pocket on one side, two shoulder straps. */
  g5_pack_rucksack(a, c, part) {
    const R = rig(c), { add, W, T, back } = R;
    const cc = part?.color || '#6a6a44', trim = part?.color2 || BRASS;
    const y = 0.07 * T, d = 0.19, z = back(0, y, d * 0.5);
    sack(add, { y, z, w: 0.36 * W, h: 0.38, d, colour: cc, belly: 1.08 });
    flap(add, { y: y + 0.16, z, w: 0.36 * W, drop: 0.16, d, colour: tone(cc, 0.8), trim });
    // a bellows pocket on the left side, its own little flap
    add(sph(8, 5), 'chest', tone(cc, 0.9), { position: [-0.19 * W, y - 0.07, z + 0.01], scale: [0.05, 0.085, 0.07] });
    add(box(0.02, 0.05, 0.09), 'chest', tone(cc, 0.72), { position: [-0.225 * W, y - 0.02, z + 0.01] });
    // the drawstring loop at the crown, and a haul loop
    add(tor(0.03, 0.006, 10, Math.PI), 'chest', LEATHER, { position: [0, y + 0.21, z + 0.05], rotation: [0, Math.PI / 2, 0] });
    for (const s of [-1, 1]) R.shoulderStrap(s, { topY: 0.22, lowY: -0.1, packZ: z + d * 0.42 });
  },

  /** An expedition pack: a wooden pack frame taller than the shoulders, a big lashed sack, bedroll on top, a cook pot behind. */
  g5_pack_frame(a, c, part) {
    const R = rig(c), { add, W, T, back } = R;
    const cc = part?.color || '#5f6a4a', trim = part?.color2 || BRASS;
    const y = 0.06 * T, d = 0.21, zf = back(0, 0.1 * T, 0.03), z = zf - d * 0.5;
    // the frame: two uprights and three rungs, standing a hand above the shoulders
    for (const s of [-1, 1]) add(taperedCurve([[s * 0.15 * W, -0.19 * T, zf - 0.01], [s * 0.155 * W, 0.1 * T, zf], [s * 0.15 * W, 0.4 * T, zf - 0.02]], [0.018, 0.017, 0.015], 5, 8), 'chest', WOOD);
    for (const yy of [-0.16, 0.12, 0.37]) add(cyl(0.012, 0.012, 0.31 * W, 6), 'chest', tone(WOOD, 0.85), { position: [0, yy * T, zf - 0.006], rotation: [0, 0, Math.PI / 2] });
    // the sack, lashed on with two cross ropes
    sack(add, { y, z: z - 0.01, w: 0.4 * W, h: 0.46, d, colour: cc, belly: 1.1 });
    flap(add, { y: y + 0.2, z: z - 0.01, w: 0.4 * W, drop: 0.14, d, colour: tone(cc, 0.8), trim });
    for (const yy of [-0.06, 0.1]) {
      const ring = [];
      for (let k = 0; k <= 10; k++) { const t = Math.PI * (0.5 + k / 10); ring.push([Math.sin(t) * 0.215 * W, y + yy, z - 0.01 + Math.cos(t) * (d * 0.56)]); }
      add(taperedCurve(ring, ring.map(() => 0.006), 4, 12), 'chest', ROPE);
    }
    // bedroll across the top rung, cook pot hung from the lowest
    bedroll(add, { y: y + 0.285, z: z - 0.015, len: 0.44 * W, r: 0.056, colour: WOOL });
    add(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, Math.PI * 0.42, Math.PI * 0.58), 'chest', IRON, { position: [0.11 * W, -0.17 * T, z - d * 0.5 - 0.02], scale: [0.06, 0.07, 0.06], metal: true });
    add(tor(0.05, 0.005, 10, Math.PI), 'chest', IRON, { position: [0.11 * W, -0.165 * T, z - d * 0.5 - 0.02], metal: true });
    for (const s of [-1, 1]) R.shoulderStrap(s, { topY: 0.24, lowY: -0.12, packZ: zf + 0.005, r: 0.016 });
    // a hip belt holds the frame's foot in
    const belt = [];
    for (let k = 0; k <= 12; k++) { const t = Math.PI * (-0.5 + k / 12); belt.push([Math.sin(t) * 0.2 * W, -0.15 * T, Math.cos(t) * 0.17 * W]); }
    add(taperedCurve(belt, belt.map(() => 0.014), 4, 14), 'chest', LEATHER);
    add(box(0.045, 0.036, 0.014), 'chest', trim, { position: [0, -0.15 * T, 0.175 * W], metal: true });
  },

  /** The explorer's pack (rare and better): a tooled flap with a brass plate, a pocket each side, rope coiled on one, the bedroll slung beneath. */
  g5_pack_explorer(a, c, part) {
    const R = rig(c), { add, W, T, back } = R;
    const cc = part?.color || '#7a4a2a', trim = part?.color2 || BRASS;
    const y = 0.09 * T, d = 0.2, z = back(0, y, d * 0.5);
    sack(add, { y, z, w: 0.38 * W, h: 0.4, d, colour: cc, belly: 1.06 });
    flap(add, { y: y + 0.17, z, w: 0.39 * W, drop: 0.19, d, colour: tone(cc, 0.78), trim, buckle: false });
    // two buckled straps down the flap and a brass plate between them
    for (const s of [-1, 1]) {
      add(box(0.024, 0.2, 0.01), 'chest', LEATHER, { position: [s * 0.075 * W, y + 0.05, z - d * 0.56] });
      add(box(0.036, 0.03, 0.014), 'chest', trim, { position: [s * 0.075 * W, y - 0.04, z - d * 0.575], metal: true });
    }
    add(cyl(0.03, 0.03, 0.01, 8), 'chest', lift(trim, 0.15), { position: [0, y + 0.07, z - d * 0.57], rotation: [Math.PI / 2, 0, 0], metal: true });
    // side pockets
    for (const s of [-1, 1]) {
      add(sph(8, 5), 'chest', tone(cc, 0.88), { position: [s * 0.2 * W, y - 0.08, z + 0.005], scale: [0.05, 0.09, 0.075] });
      add(box(0.02, 0.045, 0.095), 'chest', tone(cc, 0.7), { position: [s * 0.235 * W, y - 0.02, z + 0.005] });
      add(cyl(0.008, 0.008, 0.012, 6), 'chest', trim, { position: [s * 0.25 * W, y - 0.045, z + 0.005], rotation: [0, 0, Math.PI / 2], metal: true });
    }
    // a coil of rope hung on the right pocket, a rolled map case on the left
    for (let k = 0; k < 3; k++) add(tor(0.05 - k * 0.004, 0.008, 12), 'chest', ROPE, { position: [0.262 * W + k * 0.008, y - 0.1, z + 0.005], rotation: [0, Math.PI / 2, 0] });
    add(cyl(0.02, 0.02, 0.26, 8), 'chest', '#3a4a5a', { position: [-0.255 * W, y + 0.03, z + 0.01], rotation: [0.12, 0, 0] });
    add(cyl(0.023, 0.023, 0.03, 8), 'chest', trim, { position: [-0.255 * W, y + 0.16, z + 0.026], rotation: [0.12, 0, 0], metal: true });
    // the bedroll slung under the sack
    bedroll(add, { y: y - 0.25, z: z + 0.02, len: 0.4 * W, r: 0.052, colour: '#7a3a34' });
    for (const s of [-1, 1]) R.shoulderStrap(s, { topY: 0.24, lowY: -0.1, packZ: z + d * 0.42, r: 0.016 });
  },
};
