// Chibi 2 — round-5 ARMOUR (Thousandvale play-test 5, T23): one new model for every armour slot x archetype.
//
//   head  -> avatar.hat.id        chest -> avatar.top.id        legs -> avatar.bottom.id
//   feet  -> avatar.shoes.id      hands -> avatar.top.gloves = { id, color, color2 }
//
// Twenty models: cloth / leather / mail / plate for each of the five slots. The ids, names and the plain
// garment drawn UNDER each piece (its `style`) are in chibi2-gear5-ids.js; chibi2-gear5.js dispatches here.
// Everything goes through the shared cloth/metal buckets (`c.add`), so no model adds a draw call.
//
// HOW A PIECE IS BUILT. chibi2-body.js has already drawn the body in the piece's plain garment (a robe, a
// vest, trousers, a boot). The builder lays the piece's own shapes over that: shells grown off the body's
// own lathe rings (so a round dwarf's belly pushes a breastplate out instead of poking through it), rigid
// plates on the bone they ride, and sheets drawn double-sided. Limb radii are the SAME numbers the body
// uses (`limbs()` below), scaled by the body's W / T / L / A / LW, so nothing detaches on a wide or short body.
//
// Bone spaces are documented at the top of chibi2-gear.js. Head space: +z forward, the head spans y 0..0.60,
// positions and sizes scale by H through `c.head()`.
import * as THREE from 'three';
import { profile, taperedCurve } from './chibi2-geometry.js';
import { G5_HATS, G5_TOPS, G5_BOTTOMS, G5_SHOES, G5_GLOVES } from './chibi2-gear5-ids.js';

const tone = (c, k) => '#' + new THREE.Color(c).multiplyScalar(k).getHexString();
const lift = (c, k) => '#' + new THREE.Color(c).lerp(new THREE.Color('#ffffff'), k).getHexString();
const low = () => new THREE.SphereGeometry(1, 8, 5);
const octa = () => new THREE.OctahedronGeometry(1);
const PI = Math.PI;

/** The part's own tint, falling back to the row's defaults. */
const tint = (part, row) => [part?.color || row?.color || '#888888', part?.color2 || row?.color2 || '#d8b040'];

/** Reversed-winding copy, for the inside of a sheet or shell. Take it BEFORE the original is placed. */
function backfaced(g) {
  const b = g.clone();
  if (!b.index) b.setIndex(Array.from({ length: b.attributes.position.count }, (_, i) => i));
  const idx = b.index.array;
  for (let i = 0; i < idx.length; i += 3) [idx[i], idx[i + 1]] = [idx[i + 1], idx[i]];
  b.computeVertexNormals(); return b;
}
/** Linear interpolation of lathe rings [y, rx, rz, zoff] at height y (rings in either order). */
function ringAt(rings, y) {
  const rs = rings[0][0] <= rings[rings.length - 1][0] ? rings : [...rings].reverse();
  if (y <= rs[0][0]) return rs[0];
  for (let i = 1; i < rs.length; i++) {
    if (y <= rs[i][0]) {
      const a = rs[i - 1], b = rs[i], t = (y - a[0]) / (b[0] - a[0] || 1);
      return [y, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, (a[3] || 0) + ((b[3] || 0) - (a[3] || 0)) * t];
    }
  }
  return rs[rs.length - 1];
}
/** Rings between y0 and y1 (ends interpolated), grown by d (and dz front-to-back). */
function span(rings, y0, y1, d = 0, dz = d) {
  const lo = Math.min(y0, y1), hi = Math.max(y0, y1);
  const mid = rings.filter(r => r[0] > lo + 1e-4 && r[0] < hi - 1e-4).sort((a, b) => a[0] - b[0]);
  const out = [ringAt(rings, lo), ...mid, ringAt(rings, hi)].map(([y, rx, rz, z = 0]) => [y, rx + d, rz + dz, z]);
  return y1 < y0 ? out.reverse() : out;
}
/**
 * A lathe over part of the circle only: angle 0 is +z (front), PI/2 is +x. `centre` +/- `half` radians.
 * Faces outward whichever way the rings run (the same rule as `profile`).
 */
function arcProfile(rings, centre, half, seg = 8) {
  const pos = [], idx = [];
  for (const [y, rx, rz, z = 0] of rings) for (let j = 0; j <= seg; j++) { const a = centre - half + j / seg * half * 2; pos.push(Math.sin(a) * rx, y, Math.cos(a) * rz + z); }
  const down = rings[rings.length - 1][0] < rings[0][0];
  for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < seg; j++) {
    const a = i * (seg + 1) + j, b = a + seg + 1;
    if (down) idx.push(a, b, a + 1, a + 1, b, b + 1); else idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
/** A sheet from fn(u, v) -> [x, y, z] (u, v in 0..1), drawn on both sides. */
function sheet(c, bone, fn, colour, { nu = 3, nv = 4, metal = false, inner = null, bend = null } = {}) {
  const g = new THREE.PlaneGeometry(1, 1, nu, nv), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const q = fn(p.getX(i) + 0.5, 0.5 - p.getY(i)); p.setXYZ(i, q[0], q[1], q[2]); }
  g.computeVertexNormals();
  const b = backfaced(g);
  c.add(g, bone, colour, { metal, bend }); c.add(b, bone, inner || tone(colour, 0.7), { metal, bend });
}
/** Flat outline extruded along z, centred on z = 0. */
function extrude(points, depth) {
  const s = new THREE.Shape(); s.moveTo(...points[0]); for (const p of points.slice(1)) s.lineTo(...p); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 3 }); g.translate(0, 0, -depth / 2); return g;
}

/** The body's own limb rings (chibi2-body.js), so a piece hugs the limb it is on at any body size. */
function limbs(c, { loose = 0 } = {}) {
  const { W, T, L, A } = c, rig = c.rig || {}, R = rig.round || 0, LW = c.LW || c.body?.LW || 1, HK = rig.hand || 1;
  const Ua = 0.21 * T * A, Fa = 0.205 * T * A, armT = R * 0.016, legT = R * 0.03, calfT = R * 0.012;
  const lw = rr => rr.map(([y, x, z]) => [y, x * LW, z * LW, 0]);
  return {
    W, T, L, A, R, LW, HK, Ua, Fa,
    /** upper arm, arm-bone space (y 0 at the shoulder, -Ua at the elbow) */
    upper: lw([[0.035, 0.07 + armT, 0.068 + armT], [-0.02, 0.09 + armT, 0.086 + armT], [-0.09, 0.083 + armT, 0.08 + armT], [-Ua * 0.75, 0.074 + armT * 0.8, 0.072 + armT * 0.8], [-Ua - 0.012, 0.067 + armT * 0.6, 0.066 + armT * 0.6]]),
    /** forearm, ELBOW-bone space (y 0 at the elbow, -Fa at the wrist) */
    fore: lw([[0.02, 0.066 + armT * 0.6, 0.065 + armT * 0.6], [-0.045, 0.071 + armT * 0.5, 0.07 + armT * 0.5], [-Fa * 0.55, 0.063 + armT * 0.3, 0.061 + armT * 0.3], [-Fa + 0.012, 0.05, 0.052], [-Fa - 0.005, 0.045, 0.047]]),
    /** thigh, leg-bone space (knee at -L * 0.51) */
    thigh: lw([[0.0, 0.097 + legT + loose, 0.088 + legT + loose], [-0.08, 0.105 + legT + loose, 0.104 + legT + loose], [-L * 0.3, 0.094 + legT * 0.8 + loose, 0.093 + legT * 0.8 + loose], [-L * 0.46, 0.082 + legT * 0.5 + loose, 0.083 + legT * 0.5 + loose], [-L * 0.55, 0.078 + loose, 0.08 + loose]]),
    /** shin, knee-bone space (ankle at -L * 0.49) */
    shin: lw([[0.012, 0.079 + calfT + loose * 0.8, 0.081 + calfT + loose * 0.8], [-L * 0.12, 0.081 + calfT + loose * 0.8, 0.087 + calfT + loose * 0.8], [-L * 0.3, 0.068 + calfT * 0.6 + loose * 0.7, 0.072 + calfT * 0.6 + loose * 0.7], [-L * 0.46, 0.058 + loose * 0.5, 0.062 + loose * 0.5], [-L * 0.5, 0.056, 0.06]]),
    armBend: s => ({ bone: 'elbow' + s, at: Ua, width: 0.075 * T }),
    kneeBend: s => ({ bone: 'knee' + s, at: L * 0.51, width: 0.07 }),
    footK: 0.85 + LW * 0.15,
  };
}
const SIDES = [['L', -1], ['R', 1]];
/** A band right round a limb at height y, h tall, standing `d` proud of it. */
const band = (c, bone, rings, y, h, d, colour, o = {}) => {
  const r0 = ringAt(rings, y - h / 2), r1 = ringAt(rings, y + h / 2);
  c.add(profile([[y - h / 2, r0[1] + d, r0[2] + d, r0[3]], [y + h / 2, r1[1] + d, r1[2] + d, r1[3]]], o.seg || 10), bone, colour, { metal: !!o.metal, bend: o.bend || null });
};
/** A curve laid on the chest surface; pts are [x, y]. */
const onChest = (c, pts, r, colour, { lift: up = 0.006, side = 1, metal = false, sides = 4 } = {}) =>
  c.add(taperedCurve(pts.map(([x, y]) => [x, y, c.chestZ(x, y, side, up + r * 0.6)]), [r, r, r], sides, Math.max(4, pts.length * 2)), 'chest', colour, { metal });
/** A hand-shaped cover over the fist (hand-bone space), a little larger than the hand itself. */
function mitt(c, side, s, HK, colour, { grow = 1.14, metal = false, thumb = true } = {}) {
  const hand = 'hand' + side;
  c.add(low(), hand, colour, { position: [0, -0.035 * HK, 0.003], scale: [0.065 * HK * grow, 0.082 * HK * grow, 0.061 * HK * grow], metal });
  if (thumb) c.add(low(), hand, tone(colour, 0.9), { position: [-s * 0.046 * HK, -0.013 * HK, 0.025 * HK], scale: [0.03 * HK * grow * 1.05, 0.043 * HK * grow, 0.034 * HK * grow * 1.05], metal });
}

// ================================================================ HEAD
export const G5_HAT_BUILDERS = {
  /** Cloth: a wound headwrap — a tall dome, three crossing turns of cloth, a brow jewel and a tail down the back. */
  g5_cloth_wrap(a, c, hat) {
    const [col, col2] = tint(hat, G5_HATS.g5_cloth_wrap), { head } = c;
    head(profile([[0.40, 0.352, 0.302], [0.47, 0.388, 0.335], [0.56, 0.372, 0.322], [0.65, 0.29, 0.25], [0.71, 0.15, 0.13], [0.73, 0.01, 0.01]], 14), col);
    // the turns: fat bands crossing at the brow, each tipped a different way
    const turns = [[0.455, 0.365, 0.05, 0.16, 0.0], [0.525, 0.35, 0.048, -0.2, 0.12], [0.6, 0.29, 0.045, 0.14, -0.16]];
    turns.forEach(([y, r, tube, tx, tz], i) => head(new THREE.TorusGeometry(r, tube, 5, 16), i % 2 ? lift(col, 0.16) : tone(col, 0.86), { position: [0, y, -0.005], rotation: [PI / 2 + tx, 0, tz], scale: [1, 0.87, 1] }));
    // the jewel pinned where the turns cross, on a small gold plate
    head(new THREE.CylinderGeometry(0.05, 0.05, 0.016, 8), col2, { position: [0, 0.515, 0.36], rotation: [PI / 2 - 0.15, 0, 0], metal: true });
    head(octa(), '#c8323a', { position: [0, 0.515, 0.375], scale: [0.03, 0.04, 0.02], metal: true });
    head(taperedCurve([[0, 0.55, 0.36], [0.02, 0.66, 0.33], [0.05, 0.76, 0.27]], [0.02, 0.026, 0.003], 4, 4), lift(col2, 0.3));
    // the loose end, hanging behind the left shoulder
    head(taperedCurve([[-0.2, 0.46, -0.27], [-0.27, 0.26, -0.33], [-0.25, 0.04, -0.3], [-0.27, -0.14, -0.27]], [0.07, 0.06, 0.05, 0.02], 5, 7), tone(col, 0.9), { scale: [1, 1, 0.6], position: [0, 0, -0.12] });
    head(profile([[-0.15, 0.03, 0.02], [-0.13, 0.03, 0.02]], 5), col2, { position: [-0.268, 0, -0.283] });
  },

  /** Leather: a slouch hat — soft dented crown, a wide brim pinned up on one side, a band of teeth and a feather. */
  g5_leather_slouch(a, c, hat) {
    const [col, col2] = tint(hat, G5_HATS.g5_leather_slouch), { head } = c;
    head(profile([[0.43, 0.335, 0.29], [0.52, 0.318, 0.275], [0.62, 0.285, 0.245], [0.675, 0.2, 0.17], [0.66, 0.01, 0.01]], 14), col, { position: [0, 0, -0.005] });
    // the brim: one ring of cloth, drooping front and back, and folded up flat against the crown on the +x side
    const n = 18, pos = [], idx = [];
    for (let j = 0; j <= n; j++) {
      const t = j / n * PI * 2, sx = Math.sin(t), cz = Math.cos(t), pin = Math.max(0, sx) ** 2;
      const outer = 0.59 - pin * 0.2;
      for (const [r, k] of [[0.33, 0], [(0.33 + outer) / 2, 0.5], [outer, 1]]) {
        const y = 0.445 + pin * k * 0.25 - (1 - pin) * k * k * 0.035 * (0.4 + Math.abs(cz));
        pos.push(sx * r, y, cz * r * 0.86 - 0.005);
      }
    }
    for (let j = 0; j < n; j++) for (let k = 0; k < 2; k++) { const p = j * 3 + k, q = p + 3; idx.push(p, p + 1, q, p + 1, q + 1, q); }
    const brim = new THREE.BufferGeometry(); brim.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); brim.setIndex(idx); brim.computeVertexNormals();
    const under = backfaced(brim);
    head(brim, col); head(under, tone(col, 0.68));
    // the band, with a row of teeth across the front
    head(new THREE.TorusGeometry(0.332, 0.024, 4, 18), tone(col, 0.55), { position: [0, 0.475, -0.005], rotation: [PI / 2, 0, 0], scale: [1, 0.865, 1] });
    for (let k = 0; k < 5; k++) { const t = -0.75 + k * 0.3; head(new THREE.ConeGeometry(0.02, 0.07, 4), col2, { position: [Math.sin(t) * 0.345, 0.5, Math.cos(t) * 0.3 - 0.005], rotation: [0.25 * Math.cos(t), 0, -0.25 * Math.sin(t)] }); }
    // the pin holding the brim up, and a long feather behind it
    head(octa(), '#d8b040', { position: [0.4, 0.6, 0.02], scale: [0.03, 0.03, 0.014], rotation: [0, PI / 2, 0], metal: true });
    head(taperedCurve([[0.38, 0.56, -0.02], [0.44, 0.76, -0.14], [0.4, 0.93, -0.32]], [0.03, 0.06, 0.006], 4, 6), '#a03a2a', { scale: [0.5, 1, 1], position: [0.2, 0, 0] });
  },

  /** Mail: a segmented conical cap — four ribs to a finial, a riveted brow band — over a mail aventail. */
  g5_mail_cap(a, c, hat) {
    const [col, col2] = tint(hat, G5_HATS.g5_mail_cap), { head } = c;
    const cone = [[0.41, 0.362, 0.312], [0.47, 0.352, 0.302], [0.57, 0.285, 0.245], [0.67, 0.165, 0.142], [0.75, 0.045, 0.04], [0.775, 0.004, 0.004]];
    head(profile(cone, 14), col, { metal: true });
    head(profile([[0.4, 0.37, 0.32], [0.45, 0.368, 0.317]], 14), tone(col, 0.62), { metal: true });
    for (let k = 0; k < 8; k++) { const t = k / 8 * PI * 2 + 0.39; head(octa(), lift(col, 0.4), { position: [Math.sin(t) * 0.372, 0.425, Math.cos(t) * 0.321], scale: [0.016, 0.016, 0.016], metal: true }); }
    // the ribs the plates are riveted to
    for (let k = 0; k < 4; k++) {
      const t = k / 4 * PI * 2, sx = Math.sin(t), cz = Math.cos(t);
      head(taperedCurve(cone.slice(1, 5).map(([y, rx, rz]) => [sx * (rx + 0.006), y, cz * (rz + 0.006)]), [0.02, 0.018, 0.012], 4, 6), tone(col, 0.7), { metal: true });
    }
    head(new THREE.SphereGeometry(0.035, 6, 4), lift(col, 0.3), { position: [0, 0.79, 0], metal: true });
    // the aventail: mail hanging from the brow band round the sides and back, open over the face
    const open = 0.98, g = new THREE.CylinderGeometry(0.365, 0.44, 0.42, 14, 2, true, open, PI * 2 - open * 2);
    const lining = backfaced(g);
    head(g, col2, { position: [0, 0.2, -0.015], scale: [1, 1, 0.87], metal: true });
    head(lining, tone(col2, 0.55), { position: [0, 0.2, -0.015], scale: [0.985, 1, 0.855], metal: true });
    // (the arc is turned to the back in its own plane FIRST: a z rotation in the options would turn the 0.87 squash with it)
    for (let k = 0; k < 3; k++) head(new THREE.TorusGeometry(0.383 + k * 0.021, 0.007, 3, 16, PI * 2 - open * 2 - 0.2).rotateZ(PI / 2 + open + 0.1), tone(col2, 0.7), { position: [0, 0.31 - k * 0.12, -0.015], rotation: [PI / 2, 0, 0], scale: [1, 0.87, 1], metal: true });
  },

  /** Plate: a closed armet — a pointed "houndsnout" visor with breaths, an eye slit, a crest ridge and a plume. */
  g5_plate_armet(a, c, hat) {
    const [col, col2] = tint(hat, G5_HATS.g5_plate_armet), { head } = c, dk = tone(col, 0.6);
    head(profile([[-0.05, 0.3, 0.3], [0.06, 0.366, 0.352], [0.22, 0.392, 0.37], [0.4, 0.386, 0.352, -0.005], [0.54, 0.342, 0.3, -0.015], [0.64, 0.25, 0.215, -0.025], [0.7, 0.12, 0.105, -0.03], [0.718, 0.003, 0.003, -0.03]], 16), col, { metal: true });
    head(profile([[-0.065, 0.31, 0.31], [-0.035, 0.315, 0.315]], 16), col2, { metal: true });
    // the snout: a cone drawn out from the face, wider than it is tall
    head(new THREE.ConeGeometry(0.2, 0.34, 8), col, { position: [0, 0.17, 0.44], rotation: [PI / 2 + 0.12, 0, 0], scale: [1.3, 1, 0.9], metal: true });
    head(new THREE.TorusGeometry(0.2, 0.014, 4, 12), dk, { position: [0, 0.19, 0.29], rotation: [0.12, 0, 0], scale: [1.3, 0.9, 1], metal: true });
    for (let k = 0; k < 3; k++) for (const s of [-1, 1]) head(low(), '#101014', { position: [s * (0.17 - k * 0.045), 0.15 + k * 0.004, 0.37 + k * 0.065], scale: [0.012, 0.022, 0.012] });
    // the eye slit and the brow over it
    const arc = (y, h, grow, colour) => head(new THREE.CylinderGeometry(1, 1, h, 12, 1, true, -1.0, 2.0), colour, { position: [0, y, 0], scale: [0.394 + grow, 1, 0.372 + grow], metal: true });
    arc(0.325, 0.034, 0.004, '#101014'); arc(0.362, 0.03, 0.014, dk);
    for (const s of [-1, 1]) head(new THREE.CylinderGeometry(0.04, 0.04, 0.02, 8), col2, { position: [s * 0.392, 0.3, 0.03], rotation: [0, 0, PI / 2], metal: true });   // visor pivots
    // crest ridge from the brow over the crown
    head(taperedCurve([[0, 0.42, 0.355], [0, 0.6, 0.25], [0, 0.72, 0.0], [0, 0.62, -0.25], [0, 0.42, -0.36]], [0.012, 0.022, 0.026, 0.02, 0.01], 4, 10), col2, { scale: [0.7, 1, 1], metal: true });
    // a small plume, swept back
    for (let k = 0; k < 3; k++) head(taperedCurve([[0, 0.72, -0.04], [(k - 1) * 0.03, 0.9 + k * 0.012, -0.14], [(k - 1) * 0.045, 0.86, -0.34], [(k - 1) * 0.03, 0.7, -0.44]], [0.03, 0.05, 0.036, 0.006], 5, 7), k === 1 ? lift(col2, 0.15) : col2);
  },
};

// ================================================================ CHEST
export const G5_TOP_BUILDERS = {
  /** Cloth: a layered vestment — a pointed mantle over the shoulders, a wide knotted sash, and long panels front and back. */
  g5_cloth_vestment(a, c, top) {
    const [col, col2] = tint(top, G5_TOPS.g5_cloth_vestment), { add, W, T, L } = c, B = c.body;
    // the mantle: a capelet whose hem drops to a point at the front and at the back
    const m = profile([[0.37 * T, 0.09, 0.08, -0.02], [0.335 * T, 0.15, 0.12, -0.02], [0.3 * T, 0.262 * W, 0.182 * W, -0.012], [0.22 * T, 0.292 * W, 0.208 * W, -0.01], [0.15 * T, 0.3 * W, 0.218 * W, -0.01]], 16), mp = m.attributes.position;
    for (let i = 0; i < mp.count; i++) {
      const y = mp.getY(i); if (y > 0.23 * T) continue;
      const x = mp.getX(i), z = mp.getZ(i), k = Math.max(0, 1 - Math.abs(x) / (0.19 * W)) ** 1.5, edge = y < 0.16 * T ? 1 : 0.35;
      mp.setY(i, y - k * edge * 0.13 * T); mp.setZ(i, z + Math.sign(z) * k * edge * 0.012);
    }
    m.computeVertexNormals();
    const mIn = backfaced(m);
    add(m, 'chest', col2); add(mIn, 'chest', tone(col2, 0.6));
    for (const zs of [1, -1]) add(octa(), 'chest', '#d8b040', { position: [0, 0.03 * T, zs * 0.232 * W - 0.01], scale: [0.02, 0.03, 0.012], metal: true });
    // a second, shorter collar layer in the robe's own colour
    add(profile([[0.36 * T, 0.1, 0.09, -0.02], [0.32 * T, 0.2 * W, 0.15 * W, -0.014], [0.27 * T, 0.272 * W, 0.192 * W, -0.011]], 16), 'chest', tone(col, 0.85));
    // the sash: wide, wound twice, knotted at the left hip with two tails
    const y = -0.1 * T, r0 = ringAt(B.chestRings, y - 0.05), r1 = ringAt(B.chestRings, y + 0.05);
    add(profile([[y - 0.05, r0[1] + 0.022, r0[2] + 0.024, r0[3]], [y, (r0[1] + r1[1]) / 2 + 0.03, (r0[2] + r1[2]) / 2 + 0.032, r0[3]], [y + 0.05, r1[1] + 0.022, r1[2] + 0.024, r1[3]]], 16), 'chest', tone(col2, 0.8));
    add(profile([[y - 0.006, (r0[1] + r1[1]) / 2 + 0.034, (r0[2] + r1[2]) / 2 + 0.036, r0[3]], [y + 0.006, (r0[1] + r1[1]) / 2 + 0.034, (r0[2] + r1[2]) / 2 + 0.036, r0[3]]], 16), 'chest', tone(col2, 0.55));
    const kx = -0.11 * W, kz = c.chestZ(kx, y, 1, 0.045);
    add(low(), 'chest', col2, { position: [kx, y, kz], scale: [0.045, 0.04, 0.03] });
    for (const d of [-1, 1]) add(taperedCurve([[kx, y, kz], [kx + d * 0.03, y - 0.1, kz + 0.02], [kx + d * 0.045, y - 0.22, kz + 0.015]], [0.02, 0.024, 0.01], 4, 5), 'chest', tone(col2, 0.9), { scale: [1, 1, 0.5], position: [0, 0, kz * 0.5] });
    // the panels: a long tabard front and back over the robe's skirt, edged, with a diamond at the hem
    const hr = ringAt(B.hipsRings, -0.08), len = L * 0.62;
    for (const zs of [1, -1]) {
      const z0 = c.hipsZ(0, 0, zs, 0.03);
      sheet(c, 'hips', (u, v) => { const hw = (0.085 + v * 0.03) * W; return [(u - 0.5) * 2 * hw, 0.03 - v * len - (v > 0.99 ? (0.5 - Math.abs(u - 0.5)) * 0.1 : 0), z0 + zs * (0.012 + v * (hr[2] * 0.75 + 0.03))]; }, col2, { nu: 2, nv: 4 });
      add(octa(), 'hips', col, { position: [0, 0.03 - len * 0.8, z0 + zs * (0.02 + 0.8 * (hr[2] * 0.75 + 0.03))], scale: [0.035, 0.05, 0.008] });
    }
  },

  /** Leather: a studded brigandine — riveted panels, one big shoulder guard, crossed belts, a skirt of tabs. */
  g5_leather_brigandine(a, c, top) {
    const [col, col2] = tint(top, G5_TOPS.g5_leather_brigandine), { add, W, T } = c, B = c.body, dk = tone(col, 0.72);
    // the vest itself, standing proud of the shirt, cut off square at the shoulders
    add(profile(span(B.chestRings, -0.13 * T, 0.262 * T, 0.014, 0.016), 16), 'chest', col);
    add(profile(span(B.chestRings, -0.145 * T, -0.115 * T, 0.02, 0.022), 16), 'chest', dk);
    // panel seams and the rivets between them, front and back
    for (const side of [1, -1]) {
      for (const x of [-0.11, 0, 0.11]) onChest(c, [[x * W, 0.24 * T], [x * W, 0.05 * T], [x * W, -0.12 * T]], 0.005, dk, { lift: 0.016, side, sides: 3 });
      for (let row = 0; row < 3; row++) for (const x of [-0.165, -0.055, 0.055, 0.165]) {
        const yy = (0.19 - row * 0.115) * T, xx = x * W;
        if (Math.abs(xx) > B.chestRX(yy) * 0.8) continue;
        add(octa(), 'chest', col2, { position: [xx, yy, c.chestZ(xx, yy, side, 0.02)], scale: [0.013, 0.013, 0.009], metal: true });
      }
    }
    // crossed belts over the chest, buckled where they meet; one strap across the back
    for (const s of [-1, 1]) onChest(c, [[s * 0.17 * W, 0.25 * T], [0, 0.07 * T], [-s * 0.17 * W, -0.1 * T]], 0.016, tone(col, 0.5), { lift: 0.02 });
    add(new THREE.BoxGeometry(0.05, 0.05, 0.014), 'chest', col2, { position: [0, 0.07 * T, c.chestZ(0, 0.07 * T, 1, 0.045)], rotation: [0, 0, PI / 4], metal: true });
    onChest(c, [[-0.17 * W, 0.25 * T], [0, 0.07 * T], [0.17 * W, -0.1 * T]], 0.016, tone(col, 0.5), { lift: 0.02, side: -1 });
    // ONE shoulder guard, on the left: two overlapping leather plates, edged, with a row of studs
    add(profile([[-0.12, 0.178, 0.166], [-0.05, 0.186, 0.172], [0.035, 0.16, 0.15], [0.092, 0.085, 0.08], [0.115, 0.004, 0.004]], 12), 'armL', col, { position: [-0.03, 0, 0] });
    add(profile([[-0.185, 0.158, 0.148], [-0.115, 0.172, 0.16]], 12), 'armL', dk, { position: [-0.03, 0, 0] });
    add(profile([[-0.127, 0.184, 0.171], [-0.111, 0.184, 0.171]], 12), 'armL', col2, { position: [-0.03, 0, 0] });
    for (let k = 0; k < 4; k++) { const t = -0.9 + k * 0.6; add(octa(), 'armL', col2, { position: [-0.03 - Math.cos(t) * 0.175, -0.07, Math.sin(t) * 0.163], scale: [0.013, 0.013, 0.013], metal: true }); }
    // the belt and the tabs hanging from it
    const hb = ringAt(B.hipsRings, 0.03);
    add(profile([[0.005, hb[1] + 0.016, hb[2] + 0.018, hb[3]], [0.05, hb[1] + 0.016, hb[2] + 0.018, hb[3]]], 16), 'hips', tone(col, 0.5));
    add(new THREE.BoxGeometry(0.06, 0.055, 0.014), 'hips', col2, { position: [0, 0.027, c.hipsZ(0, 0.027, 1, 0.024)], metal: true });
    for (let k = 0; k < 8; k++) {
      const t = (k + 0.5) / 8 * PI * 2, rr = ringAt(B.hipsRings, -0.05), sx = Math.sin(t), cz = Math.cos(t);
      add(extrude([[-0.05, 0.07], [0.05, 0.07], [0.045, -0.06], [0, -0.09], [-0.045, -0.06]], 0.012), 'hips', k % 2 ? col : dk, { position: [sx * (rr[1] + 0.03), -0.06, cz * (rr[2] + 0.032) + rr[3]], rotation: [0, Math.atan2(sx * rr[2], cz * rr[1]), 0] });
    }
  },

  /** Mail: a hauberk under a leather yoke — mail to the elbow, ring rows, a belt, and a skirt split front and back. */
  g5_mail_hauberk(a, c, top) {
    const [col, col2] = tint(top, G5_TOPS.g5_mail_hauberk), { add, W, T, L } = c, B = c.body, M = limbs(c), dk = tone(col, 0.68);
    add(profile(span(B.chestRings, -0.14 * T, 0.27 * T, 0.008, 0.009), 16), 'chest', col, { metal: true });
    for (let i = 0; i < 5; i++) { const y = (0.17 - i * 0.065) * T, r = ringAt(B.chestRings, y); add(profile([[y - 0.005, r[1] + 0.012, r[2] + 0.013, r[3]], [y + 0.005, r[1] + 0.012, r[2] + 0.013, r[3]]], 16), 'chest', dk, { metal: true }); }
    // mail sleeves to just past the elbow, with a dagged edge of rings
    for (const [side] of SIDES) {
      const arm = 'arm' + side, bend = M.armBend(side), end = -M.Ua - 0.05;
      const e = ringAt(M.upper, -M.Ua);
      add(profile([...span(M.upper, 0.03, -M.Ua, 0.012), [end, e[1] + 0.022, e[2] + 0.022, 0]], 10), arm, col, { metal: true, bend });
      add(profile([[end - 0.012, e[1] + 0.026, e[2] + 0.026, 0], [end + 0.01, e[1] + 0.026, e[2] + 0.026, 0]], 10), arm, dk, { metal: true, bend });
      band(c, arm, M.upper, -M.Ua * 0.55, 0.01, 0.016, dk, { metal: true, bend });
    }
    // the yoke: a leather collar over the shoulders, scalloped, studded, strapped at the throat
    const yk = profile([[0.37 * T, 0.095, 0.085, -0.02], [0.335 * T, 0.155, 0.125, -0.02], [0.3 * T, 0.268 * W, 0.186 * W, -0.012], [0.235 * T, 0.296 * W, 0.21 * W, -0.01], [0.19 * T, 0.3 * W, 0.214 * W, -0.01]], 16), yp = yk.attributes.position;
    for (let i = 0; i < yp.count; i++) if (yp.getY(i) < 0.2 * T) { const t = Math.atan2(yp.getX(i), yp.getZ(i)); yp.setY(i, yp.getY(i) - Math.abs(Math.sin(t * 4)) * 0.035 * T); }
    yk.computeVertexNormals();
    const ykIn = backfaced(yk);
    add(yk, 'chest', col2); add(ykIn, 'chest', tone(col2, 0.6));
    for (let k = 0; k < 8; k++) { const t = (k + 0.5) / 8 * PI * 2; add(octa(), 'chest', '#c8ccd6', { position: [Math.sin(t) * 0.29 * W, 0.24 * T, Math.cos(t) * 0.206 * W - 0.01], scale: [0.014, 0.014, 0.014], metal: true }); }
    add(new THREE.BoxGeometry(0.07, 0.03, 0.014), 'chest', tone(col2, 0.6), { position: [0, 0.285 * T, 0.2 * W - 0.012], rotation: [-0.5, 0, 0] });
    add(octa(), 'chest', '#c8ccd6', { position: [0, 0.283 * T, 0.2 * W + 0.0], scale: [0.016, 0.016, 0.01], rotation: [-0.5, 0, 0], metal: true });
    // belt, low on the hips, with a long tongue
    const hb = ringAt(B.hipsRings, 0.03);
    add(profile([[0.008, hb[1] + 0.03, hb[2] + 0.032, hb[3]], [0.05, hb[1] + 0.03, hb[2] + 0.032, hb[3]]], 16), 'hips', col2);
    add(new THREE.TorusGeometry(0.026, 0.008, 4, 8), 'hips', '#c8ccd6', { position: [0, 0.029, c.hipsZ(0, 0.029, 1, 0.042)], metal: true });
    add(taperedCurve([[0.02, 0.025, c.hipsZ(0.02, 0.02, 1, 0.045)], [0.035, -0.07, c.hipsZ(0.02, 0, 1, 0.06)], [0.03, -0.16, c.hipsZ(0.02, 0, 1, 0.065)]], [0.016, 0.016, 0.012], 4, 4), 'hips', col2);
    // the skirt: two halves to the mid thigh, split at the front and the back so the legs can stride
    const hr = ringAt(B.hipsRings, -0.08), y1 = -L * 0.44;
    for (const s of [-1, 1]) {
      const rings = [[0.02, hb[1] + 0.02, hb[2] + 0.022, hb[3]], [-0.09, hr[1] + 0.04, hr[2] + 0.045, 0], [y1, hr[1] + 0.075, hr[2] + 0.075, 0]];
      const g = arcProfile(rings, s * PI / 2, PI / 2 - 0.16, 7), gi = backfaced(g);
      add(g, 'hips', col, { metal: true }); add(gi, 'hips', tone(col, 0.5), { metal: true });
      add(arcProfile([[y1 - 0.012, hr[1] + 0.079, hr[2] + 0.079, 0], [y1 + 0.012, hr[1] + 0.077, hr[2] + 0.077, 0]], s * PI / 2, PI / 2 - 0.16, 7), 'hips', dk, { metal: true });
      add(arcProfile([[(y1 - 0.09) / 2 - 0.006, hr[1] + 0.061, hr[2] + 0.063, 0], [(y1 - 0.09) / 2 + 0.006, hr[1] + 0.06, hr[2] + 0.062, 0]], s * PI / 2, PI / 2 - 0.16, 7), 'hips', dk, { metal: true });
    }
  },

  /** Plate: a globose fluted cuirass — gorget, besagews at the armpits, layered spaulders, a fauld and two tassets. */
  g5_plate_cuirass(a, c, top) {
    const [col, col2] = tint(top, G5_TOPS.g5_plate_cuirass), { add, W, T } = c, B = c.body, M = limbs(c), dk = tone(col, 0.7), hi = lift(col, 0.3);
    // breast and back: the body's own rings pushed out into a rounded belly
    const bulge = y => 0.034 * Math.exp(-(((y / T - 0.07) / 0.14) ** 2));
    const shell = span(B.chestRings, -0.135 * T, 0.272 * T).map(([y, rx, rz, z]) => [y, rx * 1.04 + 0.012, rz + 0.026 + bulge(y), z + 0.004 + bulge(y) * 0.35]);
    const zAt = (x, y, side, up = 0) => { const r = ringAt(shell, y), k = Math.max(0, 1 - (x / (r[1] + up)) ** 2); return r[3] + side * (r[2] + up) * Math.sqrt(k); };
    add(profile(shell, 16), 'chest', col, { metal: true });
    // the flutes: ridges fanning up from the waist
    for (const k of [-2, -1, 0, 1, 2]) {
      const pts = [0, 0.5, 1].map(t => { const y = (-0.1 + t * (0.3 - Math.abs(k) * 0.035)) * T, x = k * (0.022 + t * 0.05) * W; return [x, y, zAt(x, y, 1, 0.004)]; });
      add(taperedCurve(pts, [0.006, 0.009, 0.004], 3, 6), 'chest', hi, { metal: true });
    }
    for (const k of [-1, 0, 1]) { const pts = [0, 0.5, 1].map(t => { const y = (-0.1 + t * 0.3) * T, x = k * (0.03 + t * 0.06) * W; return [x, y, zAt(x, y, -1, 0.004)]; }); add(taperedCurve(pts, [0.006, 0.009, 0.004], 3, 6), 'chest', hi, { metal: true }); }
    // waist rim, and the gorget standing round the neck
    const w = ringAt(shell, -0.125 * T);
    add(profile([[-0.15 * T, w[1] + 0.02, w[2] + 0.024, w[3]], [-0.118 * T, w[1] + 0.022, w[2] + 0.026, w[3]]], 16), 'chest', col2, { metal: true });
    const nr = B.neckR || 0.07;
    add(profile([[0.245 * T, 0.2 * W, 0.135 * W, -0.006], [0.3 * T, nr + 0.06, nr + 0.05, -0.008], [0.355 * T, nr + 0.03, nr + 0.026, -0.012]], 14), 'chest', dk, { metal: true });
    add(profile([[0.348 * T, nr + 0.035, nr + 0.03, -0.012], [0.362 * T, nr + 0.035, nr + 0.03, -0.012]], 14), 'chest', col2, { metal: true });
    // besagews: a disc and a spike guarding each armpit
    for (const s of [-1, 1]) {
      const x = s * 0.185 * W, y = 0.17 * T, z = zAt(x, y, 1, 0.012);
      add(new THREE.CylinderGeometry(0.052, 0.052, 0.012, 10), 'chest', hi, { position: [x, y, z], rotation: [PI / 2, 0, 0], metal: true });
      add(new THREE.ConeGeometry(0.016, 0.04, 5), 'chest', col2, { position: [x, y, z + 0.022], rotation: [PI / 2, 0, 0], metal: true });
    }
    // spaulders: a cap and two lames down each upper arm, edged in trim
    for (const [side, s] of SIDES) {
      const arm = 'arm' + side, P = [s * 0.03, 0, 0];
      add(profile([[-0.085, 0.162, 0.152], [-0.03, 0.168, 0.158], [0.04, 0.14, 0.132], [0.09, 0.07, 0.066], [0.108, 0.004, 0.004]], 12), arm, col, { position: P, metal: true });
      add(profile([[-0.094, 0.169, 0.159], [-0.08, 0.169, 0.159]], 12), arm, col2, { position: P, metal: true });
      for (let i = 0; i < 2; i++) {
        const y0 = -0.095 - i * 0.045, r = 0.15 - i * 0.016;
        add(profile([[y0 - 0.045, r - 0.01, r - 0.016], [y0, r, r - 0.008]], 12), arm, i ? col : dk, { position: P, metal: true });
      }
      add(octa(), arm, col2, { position: [s * 0.03, 0.02, 0.15], scale: [0.016, 0.016, 0.01], metal: true });
    }
    // the fauld: two lames over the hips …
    const h0 = ringAt(B.hipsRings, 0.04), h1 = ringAt(B.hipsRings, -0.06);
    add(profile([[0.06, h0[1] + 0.03, h0[2] + 0.04, h0[3]], [-0.03, h1[1] + 0.045, h1[2] + 0.05, h1[3]]], 14), 'hips', col, { metal: true });
    add(profile([[-0.015, h1[1] + 0.04, h1[2] + 0.046, h1[3]], [-0.1, h1[1] + 0.058, h1[2] + 0.06, 0]], 14), 'hips', dk, { metal: true });
    add(profile([[-0.108, h1[1] + 0.061, h1[2] + 0.063, 0], [-0.094, h1[1] + 0.06, h1[2] + 0.062, 0]], 14), 'hips', col2, { metal: true });
    // … and a pointed tasset on the front of each thigh, riding the leg
    for (const [side, s] of SIDES) {
      const leg = 'leg' + side, r = ringAt(M.thigh, -0.1);
      const tg = arcProfile([[-0.03, r[1] + 0.03, r[2] + 0.034, 0], [-0.13, r[1] + 0.03, r[2] + 0.034, 0], [-0.2, r[1] + 0.024, r[2] + 0.028, 0]], s * 0.25, 0.95, 6), tp = tg.attributes.position;
      // the bottom edge is drawn down to a blunt point in the middle of the plate
      for (let i = 0; i < tp.count; i++) if (tp.getY(i) < -0.19) { const u = Math.abs((i % 7) / 6 - 0.5) * 2; tp.setY(i, -0.2 - (1 - u) * 0.055); }
      tg.computeVertexNormals();
      add(tg, leg, col, { metal: true });
      add(taperedCurve([[s * 0.022, -0.04, r[2] + 0.04], [s * 0.022, -0.15, r[2] + 0.04], [s * 0.022, -0.25, r[2] + 0.032]], [0.007, 0.008, 0.004], 3, 4), leg, hi, { metal: true });
    }
  },
};

// ================================================================ LEGS
export const G5_BOTTOM_BUILDERS = {
  /** Cloth: pleated wide legs — the cloth flares from the knee to a broad banded hem, tied at the waist with a bow. */
  g5_cloth_pleats(a, c, bottom) {
    const [col, col2] = tint(bottom, G5_BOTTOMS.g5_cloth_pleats), { add, W, L } = c, B = c.body, M = limbs(c, { loose: 0.022 }), dk = tone(col, 0.72);
    for (const [side] of SIDES) {
      const leg = 'leg' + side, knee = 'knee' + side, bend = M.kneeBend(side);
      // thigh: fuller than the plain trousers under it
      add(profile(span(M.thigh, -0.005, -L * 0.5, 0.02), 10), leg, col, { bend });
      // shin: the bell
      const k0 = ringAt(M.shin, 0.0), flare = [[0.0, k0[1] + 0.02, k0[2] + 0.02, 0], [-L * 0.2, k0[1] + 0.045, k0[2] + 0.05, 0], [-L * 0.4, k0[1] + 0.07, k0[2] + 0.08, 0.01]];
      const g = profile(flare, 10), gi = backfaced(g);
      add(g, knee, col); add(gi, knee, tone(col, 0.5));
      add(profile([[-L * 0.4 - 0.014, k0[1] + 0.074, k0[2] + 0.084, 0.01], [-L * 0.4 + 0.012, k0[1] + 0.072, k0[2] + 0.082, 0.01]], 10), knee, col2);
      // the pleats: sharp creases down the bell
      for (let k = 0; k < 8; k++) {
        const t = (k + 0.5) / 8 * PI * 2, sx = Math.sin(t), cz = Math.cos(t);
        add(taperedCurve([[sx * (k0[1] + 0.024), -0.01, cz * (k0[2] + 0.024)], [sx * (k0[1] + 0.073), -L * 0.39, cz * (k0[2] + 0.083) + 0.01]], [0.004, 0.007], 3, 1), knee, dk);
      }
    }
    // the waist tie: a broad band with a bow at the front and two long ends
    const hb = ringAt(B.hipsRings, 0.03);
    add(profile([[0.0, hb[1] + 0.014, hb[2] + 0.016, hb[3]], [0.06, hb[1] + 0.014, hb[2] + 0.016, hb[3]]], 16), 'hips', col2);
    const z = c.hipsZ(0, 0.03, 1, 0.03);
    for (const s of [-1, 1]) {
      add(low(), 'hips', lift(col2, 0.1), { position: [s * 0.045, 0.035, z], scale: [0.045, 0.028, 0.016], rotation: [0, 0, s * 0.3] });
      add(taperedCurve([[s * 0.01, 0.03, z], [s * 0.03, -0.08, z + 0.015], [s * 0.04, -0.2, z + 0.012]], [0.016, 0.02, 0.008], 4, 4), 'hips', tone(col2, 0.88), { scale: [1, 1, 0.5], position: [0, 0, z * 0.5] });
    }
    add(low(), 'hips', tone(col2, 0.8), { position: [0, 0.033, z + 0.006], scale: [0.02, 0.022, 0.014] });
  },

  /** Leather: chaps — an outer shell down each leg, open at the inside, fringed, strapped at the thigh, padded at the knee. */
  g5_leather_chaps(a, c, bottom) {
    const [col, col2] = tint(bottom, G5_BOTTOMS.g5_leather_chaps), { add, L } = c, B = c.body, M = limbs(c), hide = tone(col, 0.72), dk = tone(col, 0.5);
    for (const [side, s] of SIDES) {
      const leg = 'leg' + side, knee = 'knee' + side, bend = M.kneeBend(side), out = s * PI / 2;
      add(arcProfile(span(M.thigh, -0.05, -L * 0.52, 0.016), out, 2.25, 9), leg, hide, { bend });
      const k1 = ringAt(M.shin, -L * 0.42);
      add(arcProfile([...span(M.shin, 0.0, -L * 0.3, 0.018), [-L * 0.42, k1[1] + 0.034, k1[2] + 0.036, 0]], out, 2.25, 9), knee, hide);
      // fringe down the outer seam
      for (let k = 0; k < 7; k++) {
        const onShin = k >= 4, y = onShin ? -L * (0.04 + (k - 4) * 0.12) : -0.09 - k * (L * 0.1), r = ringAt(onShin ? M.shin : M.thigh, y);
        add(new THREE.ConeGeometry(0.016, 0.07, 3), onShin ? knee : leg, col2, { position: [s * (r[1] + 0.03), y - 0.03, -0.01], rotation: [0, 0, PI + s * 0.5] });
      }
      // thigh strap with a buckle on the outside
      band(c, leg, M.thigh, -0.115, 0.03, 0.022, dk, { bend });
      const tr = ringAt(M.thigh, -0.115);
      add(new THREE.BoxGeometry(0.014, 0.04, 0.045), leg, '#c8ccd6', { position: [s * (tr[1] + 0.026), -0.115, 0.01], metal: true });
      // knee pad: a stitched oval with a stud
      const kr = ringAt(M.shin, -0.01);
      add(low(), knee, col, { position: [0, -0.01, kr[2] + 0.008], scale: [0.075 * M.LW, 0.085, 0.035] });
      add(new THREE.TorusGeometry(0.058 * M.LW, 0.007, 3, 10), knee, dk, { position: [0, -0.01, kr[2] + 0.03], scale: [1, 1.15, 1] });
      add(octa(), knee, col2, { position: [0, -0.01, kr[2] + 0.046], scale: [0.016, 0.016, 0.01], metal: true });
    }
    // a broad belt with a round plate buckle; the chaps hang from it
    const hb = ringAt(B.hipsRings, 0.03);
    add(profile([[-0.005, hb[1] + 0.02, hb[2] + 0.022, hb[3]], [0.055, hb[1] + 0.02, hb[2] + 0.022, hb[3]]], 16), 'hips', dk);
    const z = c.hipsZ(0, 0.025, 1, 0.03);
    add(new THREE.CylinderGeometry(0.045, 0.045, 0.014, 10), 'hips', '#c8a040', { position: [0, 0.025, z], rotation: [PI / 2, 0, 0], metal: true });
    add(octa(), 'hips', col2, { position: [0, 0.025, z + 0.012], scale: [0.018, 0.018, 0.008], metal: true });
  },

  /** Mail: chausses — mail over the whole leg in ring rows, a round cop on each knee, garter straps above and below. */
  g5_mail_chausses(a, c, bottom) {
    const [col, col2] = tint(bottom, G5_BOTTOMS.g5_mail_chausses), { add, L } = c, B = c.body, M = limbs(c, { loose: -0.006 }), dk = tone(col, 0.66), hi = lift(col, 0.3);
    for (const [side, s] of SIDES) {
      const leg = 'leg' + side, knee = 'knee' + side, bend = M.kneeBend(side);
      add(profile(span(M.thigh, -0.03, -L * 0.54, 0.01), 10), leg, col, { metal: true, bend });
      add(profile(span(M.shin, 0.01, -L * 0.47, 0.01), 10), knee, col, { metal: true });
      for (let k = 0; k < 3; k++) band(c, leg, M.thigh, -0.09 - k * L * 0.115, 0.01, 0.014, dk, { metal: true, bend });
      for (let k = 0; k < 3; k++) band(c, knee, M.shin, -L * (0.2 + k * 0.1), 0.01, 0.014, dk, { metal: true });
      // the knee cop: a round dished plate with a rim and a boss
      const kr = ringAt(M.shin, 0.0);
      add(low(), knee, hi, { position: [0, 0.0, kr[2] + 0.004], scale: [0.078 * M.LW, 0.078, 0.045], metal: true });
      add(new THREE.TorusGeometry(0.07 * M.LW, 0.008, 3, 10), knee, dk, { position: [0, 0.0, kr[2] + 0.022], metal: true });
      add(new THREE.ConeGeometry(0.018, 0.035, 5), knee, hi, { position: [0, 0.0, kr[2] + 0.058], rotation: [PI / 2, 0, 0], metal: true });
      // garters: a leather strap above the knee and one below, buckled on the outside
      for (const [bone, rings, y] of [[leg, M.thigh, -L * 0.4], [knee, M.shin, -L * 0.12]]) {
        band(c, bone, rings, y, 0.026, 0.018, col2, bone === leg ? { bend } : {});
        const r = ringAt(rings, y);
        add(new THREE.BoxGeometry(0.012, 0.034, 0.036), bone, '#c8ccd6', { position: [s * (r[1] + 0.022), y, 0.0], metal: true });
      }
    }
    const hb = ringAt(B.hipsRings, 0.03);
    add(profile([[0.0, hb[1] + 0.012, hb[2] + 0.014, hb[3]], [-0.07, ringAt(B.hipsRings, -0.07)[1] + 0.012, ringAt(B.hipsRings, -0.07)[2] + 0.014, 0]], 14), 'hips', col, { metal: true });
  },

  /** Plate: cuisses — a ridged plate over each thigh, a knee cop with a fan wing, and a full greave on the shin. */
  g5_plate_cuisses(a, c, bottom) {
    const [col, col2] = tint(bottom, G5_BOTTOMS.g5_plate_cuisses), { add, L } = c, M = limbs(c), dk = tone(col, 0.7), hi = lift(col, 0.3);
    for (const [side, s] of SIDES) {
      const leg = 'leg' + side, knee = 'knee' + side;
      // the cuisse: front and outside of the thigh, strapped behind
      const cu = span(M.thigh, -0.07, -L * 0.4, 0.022);
      add(arcProfile(cu, s * 0.45, 1.75, 8), leg, col, { metal: true });
      const top = cu[0], bot = cu[cu.length - 1];
      add(arcProfile([[top[0] - 0.012, top[1] + 0.006, top[2] + 0.006, 0], [top[0] + 0.012, top[1] + 0.006, top[2] + 0.006, 0]], s * 0.45, 1.75, 8), leg, col2, { metal: true });
      add(taperedCurve([[s * 0.02, top[0], top[2] + 0.004], [s * 0.02, (top[0] + bot[0]) / 2, ringAt(cu, (top[0] + bot[0]) / 2)[2] + 0.006], [s * 0.02, bot[0], bot[2] + 0.004]], [0.008, 0.01, 0.008], 3, 4), leg, hi, { metal: true });
      band(c, leg, M.thigh, -L * 0.24, 0.022, 0.012, '#3a2a1c');
      // the knee: a lame above, the cop, a lame below, and the fan wing on the outside
      const kr = ringAt(M.shin, 0.0);
      add(arcProfile([[0.075, kr[1] + 0.022, kr[2] + 0.024, 0], [0.03, kr[1] + 0.03, kr[2] + 0.034, 0]], s * 0.3, 1.5, 6), knee, dk, { metal: true });
      add(low(), knee, col, { position: [s * 0.006, 0.0, kr[2] - 0.012], scale: [0.092 * M.LW, 0.07, 0.068], metal: true });
      add(arcProfile([[-0.035, kr[1] + 0.03, kr[2] + 0.034, 0], [-0.08, kr[1] + 0.02, kr[2] + 0.024, 0]], s * 0.3, 1.5, 6), knee, dk, { metal: true });
      const fan = [[0, 0]]; for (let k = 0; k <= 6; k++) { const t = -1.15 + k * 2.3 / 6, r = k % 2 ? 0.082 : 0.098; fan.push([-Math.cos(t) * r, Math.sin(t) * r]); }
      add(extrude(fan.reverse(), 0.012), knee, col, { position: [s * (kr[1] + 0.022), 0, 0.01], rotation: [0, s * PI / 2, 0], scale: [1, 1, 1], metal: true });
      add(octa(), knee, col2, { position: [s * (kr[1] + 0.032), 0, 0.01], scale: [0.012, 0.018, 0.018], metal: true });
      // the greave: a full shell round the shin with a keel down the front
      const gr = span(M.shin, -0.09, -L * 0.43, 0.016);
      add(profile(gr, 10), knee, col, { metal: true });
      add(taperedCurve(gr.map(([y, , rz]) => [0, y, rz + 0.002]), [0.008, 0.011, 0.008], 3, 5), knee, hi, { metal: true });
      band(c, knee, M.shin, -L * 0.43, 0.02, 0.022, col2, { metal: true });
    }
  },
};

// ================================================================ FEET
export const G5_SHOE_BUILDERS = {
  /** Cloth: curl-toe slippers — the toe drawn out and rolled back on itself, a bead on its tip, ribbons crossed up the ankle. */
  g5_cloth_curltoes(a, c, shoes) {
    const [col, col2] = tint(shoes, G5_SHOES.g5_cloth_curltoes), { add, L } = c, M = limbs(c), k = M.footK;
    for (const [side] of SIDES) {
      const foot = 'foot' + side, knee = 'knee' + side;
      add(taperedCurve([[0, -0.005, 0.15 * k], [0, 0.005, 0.24 * k], [0, 0.07, 0.3 * k], [0, 0.15, 0.275 * k], [0, 0.16, 0.21 * k], [0, 0.115, 0.185 * k]], [0.052, 0.04, 0.028, 0.02, 0.014, 0.007], 6, 10), foot, col);
      add(new THREE.SphereGeometry(0.022, 6, 4), foot, col2, { position: [0, 0.108, 0.183 * k], metal: true });
      // an embroidered edge round the opening, and a tongue
      add(new THREE.TorusGeometry(0.07, 0.01, 4, 12), foot, col2, { position: [0, 0.035, 0.02], rotation: [PI / 2 + 0.25, 0, 0], scale: [1.05 * k, 1.25 * k, 1] });
      add(octa(), foot, col2, { position: [0, 0.03, 0.125 * k], scale: [0.026, 0.012, 0.03], rotation: [0.3, 0, 0], metal: true });
      // ribbons crossed twice up the ankle, tied in a bow at the front
      const y0 = -L * 0.47, y1 = -L * 0.33;
      for (const d of [-1, 1]) {
        const pts = []; for (let i = 0; i <= 8; i++) { const t = i / 8, ang = d * t * PI * 2, y = y0 + (y1 - y0) * t, r = ringAt(M.shin, y); pts.push([Math.sin(ang) * (r[1] + 0.007), y, Math.cos(ang) * (r[2] + 0.007)]); }
        add(taperedCurve(pts, [0.007, 0.007], 3, 14), knee, col2);
      }
      const br = ringAt(M.shin, y1);
      for (const d of [-1, 1]) add(low(), knee, col2, { position: [d * 0.026, y1, br[2] + 0.012], scale: [0.026, 0.014, 0.01], rotation: [0, 0, d * 0.4] });
    }
  },

  /** Leather: riding boots — a deep folded cuff, two buckled straps, a block heel and a spur. */
  g5_leather_cuffboots(a, c, shoes) {
    const [col, col2] = tint(shoes, G5_SHOES.g5_leather_cuffboots), { add, L } = c, M = limbs(c), k = M.footK, dk = tone(col, 0.62);
    const shaft = c.body?.shoe?.shaft ?? 0.62, topY = -L * 0.49 * (1 - shaft);
    for (const [side, s] of SIDES) {
      const foot = 'foot' + side, knee = 'knee' + side, r = ringAt(M.shin, topY);
      // the cuff: the boot top turned out and folded down over itself
      add(profile([[topY - 0.01, r[1] + 0.014, r[2] + 0.014, 0], [topY + 0.03, r[1] + 0.05, r[2] + 0.052, 0]], 10), knee, tone(col, 0.8));
      add(profile([[topY + 0.03, r[1] + 0.05, r[2] + 0.052, 0], [topY - 0.065, r[1] + 0.046, r[2] + 0.048, 0], [topY - 0.075, r[1] + 0.03, r[2] + 0.032, 0]], 10), knee, tone(col2, 0.78));
      add(profile([[topY + 0.024, r[1] + 0.054, r[2] + 0.056, 0], [topY + 0.036, r[1] + 0.054, r[2] + 0.056, 0]], 10), knee, col2);
      // two straps: one at the ankle, one under the cuff, each with a buckle on the outside
      for (const y of [-L * 0.44, topY - 0.12]) {
        if (y < -L * 0.47) continue;
        band(c, knee, M.shin, y, 0.024, 0.02, dk);
        const rr = ringAt(M.shin, y);
        add(new THREE.BoxGeometry(0.012, 0.036, 0.04), knee, '#c8a040', { position: [s * (rr[1] + 0.026), y, 0.005], metal: true });
      }
      // heel block, and the spur: a yoke round the heel and a rowel behind it
      add(new THREE.BoxGeometry(0.11 * k, 0.03, 0.07), foot, '#241a12', { position: [0, -0.062, -0.035] });
      add(new THREE.TorusGeometry(0.075 * k, 0.008, 3, 10, PI), foot, '#c8ccd6', { position: [0, -0.005, -0.0], rotation: [PI / 2, 0, PI], scale: [1, 1.1, 1], metal: true });
      add(new THREE.CylinderGeometry(0.006, 0.006, 0.05, 4), foot, '#c8ccd6', { position: [0, -0.005, -0.105], rotation: [PI / 2, 0, 0], metal: true });
      add(new THREE.CylinderGeometry(0.026, 0.026, 0.006, 6), foot, col2, { position: [0, -0.005, -0.135], rotation: [0, 0, PI / 2], metal: true });
      // a toe cap
      add(new THREE.SphereGeometry(1, 8, 4, 0, PI * 2, 0, PI / 2), foot, dk, { position: [0, -0.012, 0.115 * k], scale: [0.09 * k, 0.062 * k, 0.09 * k], rotation: [0.25, 0, 0] });
    }
  },

  /** Mail: splinted boots — iron splints riveted down the shin and round the calf, two straps, an iron toe. */
  g5_mail_splints(a, c, shoes) {
    const [col, col2] = tint(shoes, G5_SHOES.g5_mail_splints), { add, L } = c, M = limbs(c), k = M.footK, dk = tone(col, 0.6);
    const shaft = c.body?.shoe?.shaft ?? 0.5, topY = -L * 0.49 * (1 - shaft) + 0.02, botY = -L * 0.45;
    for (const [side] of SIDES) {
      const foot = 'foot' + side, knee = 'knee' + side;
      for (let i = 0; i < 7; i++) {
        const t = i / 7 * PI * 2, sx = Math.sin(t), cz = Math.cos(t);
        const pts = [topY, (topY + botY) / 2, botY].map(y => { const r = ringAt(M.shin, y); return [sx * (r[1] + 0.02), y, cz * (r[2] + 0.02)]; });
        add(taperedCurve(pts, [0.014, 0.014, 0.012], 4, 3), knee, col2, { metal: true });
        add(octa(), knee, lift(col2, 0.4), { position: [pts[0][0] * 1.06, topY - 0.02, pts[0][2] * 1.06], scale: [0.008, 0.008, 0.008], metal: true });
      }
      for (const y of [topY - 0.04, botY + 0.03]) band(c, knee, M.shin, y, 0.022, 0.03, dk);
      band(c, knee, M.shin, topY + 0.012, 0.016, 0.026, col2, { metal: true });
      // iron toe cap and a heel plate
      add(new THREE.SphereGeometry(1, 8, 4, 0, PI * 2, 0, PI / 2), foot, col2, { position: [0, -0.014, 0.105 * k], scale: [0.098 * k, 0.07 * k, 0.105 * k], rotation: [0.25, 0, 0], metal: true });
      add(new THREE.TorusGeometry(0.085 * k, 0.012, 3, 8, PI), foot, col2, { position: [0, -0.025, 0.0], rotation: [PI / 2, 0, PI], scale: [1, 1.05, 1], metal: true });
    }
  },

  /** Plate: sabatons — overlapping lames down the foot to a long point, an ankle ring and a keeled shin plate. */
  g5_plate_sabatons(a, c, shoes) {
    const [col, col2] = tint(shoes, G5_SHOES.g5_plate_sabatons), { add, L } = c, M = limbs(c), k = M.footK, dk = tone(col, 0.72), hi = lift(col, 0.3);
    const shaft = c.body?.shoe?.shaft ?? 0.7, topY = -L * 0.49 * (1 - shaft);
    for (const [side] of SIDES) {
      const foot = 'foot' + side, knee = 'knee' + side;
      // the lames: each a dished half-shell, the one behind overlapping the one in front
      for (let i = 0; i < 4; i++) {
        const z = (0.0 + i * 0.052) * k, w = (0.118 - i * 0.012) * k, h = (0.092 - i * 0.012) * k;
        add(new THREE.SphereGeometry(1, 8, 4, 0, PI * 2, 0, PI / 2), foot, i % 2 ? dk : col, { position: [0, -0.03, z + 0.03], scale: [w, h, 0.07 * k], rotation: [0.2 + i * 0.08, 0, 0], metal: true });
      }
      // the point
      add(new THREE.ConeGeometry(0.075 * k, 0.12 * k, 6), foot, col, { position: [0, -0.03, 0.235 * k], rotation: [PI / 2, 0, 0], scale: [1, 1, 0.55], metal: true });
      add(taperedCurve([[0, 0.05, 0.03], [0, 0.012, 0.19 * k], [0, -0.028, 0.29 * k]], [0.008, 0.008, 0.003], 3, 5), foot, hi, { metal: true });
      // heel cup and ankle ring
      add(new THREE.SphereGeometry(1, 8, 4), foot, dk, { position: [0, -0.01, -0.025], scale: [0.1 * k, 0.07, 0.085], metal: true });
      band(c, knee, M.shin, -L * 0.455, 0.03, 0.03, col2, { metal: true });
      // the shin plate: front of the boot shaft, keeled, with a rim at the top
      const sp = span(M.shin, topY, -L * 0.44, 0.03);
      add(arcProfile(sp, 0, 1.9, 8), knee, col, { metal: true });
      add(taperedCurve(sp.map(([y, , rz]) => [0, y, rz + 0.003]), [0.008, 0.011, 0.008], 3, 5), knee, hi, { metal: true });
      add(arcProfile([[topY - 0.012, sp[0][1] + 0.006, sp[0][2] + 0.006, 0], [topY + 0.014, sp[0][1] + 0.008, sp[0][2] + 0.008, 0]], 0, 1.9, 8), knee, col2, { metal: true });
    }
  },
};

// ================================================================ HANDS  (avatar.top.gloves)
export const G5_GLOVE_BUILDERS = {
  /** Cloth: handwraps — cloth wound round the palm and up the forearm, fingers bare, two ribbon ends at the wrist. */
  g5_cloth_handwraps(a, c, gloves) {
    const [col, col2] = tint(gloves, G5_GLOVES.g5_cloth_handwraps), { add } = c, M = limbs(c), { HK, Fa, LW } = M;
    for (const [side, s] of SIDES) {
      const hand = 'hand' + side, elbow = 'elbow' + side;
      for (let i = 0; i < 3; i++) add(new THREE.TorusGeometry(0.058 * HK, 0.014 * HK, 3, 8), hand, i % 2 ? tone(col, 0.86) : col, { position: [0, (-0.012 - i * 0.026) * HK, 0.003], rotation: [PI / 2 + 0.18 * (i % 2 ? 1 : -1), 0, 0.12], scale: [1.06, 1.0, 1] });
      // the forearm: overlapping turns of cloth, each a little askew, from the wrist to below the elbow
      // (under a bell sleeve only the turns at the wrist are drawn: the rest would poke through the cloth)
      for (let i = c.body?.top?.sleeve === 'bell' ? 5 : 0; i < 6; i++) {
        const y = -Fa * (0.3 + i * 0.115), h = Fa * 0.075, r0 = ringAt(M.fore, y - h), r1 = ringAt(M.fore, y + h), d = 0.007 + (i % 2) * 0.004;
        add(profile([[y - h, r0[1] + d, r0[2] + d, 0], [y + h, r1[1] + d + 0.004, r1[2] + d + 0.004, 0]], 8), elbow, i % 2 ? col : tone(col, 0.84), { rotation: [0.1 * (i % 2 ? 1 : -1), 0, 0.06 * (i % 3 - 1)] });
      }
      const wr = ringAt(M.fore, -Fa * 0.94);
      add(profile([[-Fa * 0.98, wr[1] + 0.012, wr[2] + 0.012, 0], [-Fa * 0.9, wr[1] + 0.014, wr[2] + 0.014, 0]], 8), elbow, col2);
      for (const d of [-1, 1]) add(taperedCurve([[s * (wr[1] + 0.01), -Fa * 0.94, d * 0.015], [s * (wr[1] + 0.04), -Fa * 0.94 - 0.06, d * 0.03], [s * (wr[1] + 0.035), -Fa * 0.94 - 0.14, d * 0.045]], [0.012, 0.014, 0.005], 3, 4), elbow, col2);
      void LW;
    }
  },

  /** Leather: long gloves — the whole hand gloved, a flared cuff to mid forearm laced down the outside, studs on the knuckles. */
  g5_leather_gloves(a, c, gloves) {
    const [col, col2] = tint(gloves, G5_GLOVES.g5_leather_gloves), { add } = c, M = limbs(c), { HK, Fa } = M, dk = tone(col, 0.62);
    for (const [side, s] of SIDES) {
      const hand = 'hand' + side, elbow = 'elbow' + side;
      mitt(c, side, s, HK, col);
      for (let k = 0; k < 3; k++) add(octa(), hand, col2, { position: [(-0.03 + k * 0.03) * HK, -0.105 * HK, 0.035 * HK], scale: [0.012, 0.012, 0.012], metal: true });
      const w = ringAt(M.fore, -Fa), m = ringAt(M.fore, -Fa * 0.62), t = ringAt(M.fore, -Fa * 0.3);
      add(profile([[-Fa - 0.012, w[1] + 0.012, w[2] + 0.012, 0], [-Fa * 0.62, m[1] + 0.014, m[2] + 0.014, 0], [-Fa * 0.3, t[1] + 0.032, t[2] + 0.032, 0]], 10), elbow, col);
      add(profile([[-Fa * 0.3 - 0.01, t[1] + 0.035, t[2] + 0.035, 0], [-Fa * 0.3 + 0.012, t[1] + 0.037, t[2] + 0.037, 0]], 10), elbow, dk);
      band(c, elbow, M.fore, -Fa * 0.93, 0.02, 0.018, dk);
      // the lacing: crosses down the outside of the cuff
      for (let k = 0; k < 3; k++) {
        const y = -Fa * (0.42 + k * 0.16), r = ringAt(M.fore, y), x = s * (r[1] + 0.024 - k * 0.006);
        for (const d of [-1, 1]) add(taperedCurve([[x, y + 0.016, -0.022 * d], [x, y - 0.016, 0.022 * d]], [0.004, 0.004], 3, 1), elbow, col2);
      }
    }
  },

  /** Mail: mittens — mail over the whole fist in ring rows, a mail sleeve end, and a stitched leather cuff. */
  g5_mail_mitts(a, c, gloves) {
    const [col, col2] = tint(gloves, G5_GLOVES.g5_mail_mitts), { add } = c, M = limbs(c), { HK, Fa } = M, dk = tone(col, 0.65);
    for (const [side, s] of SIDES) {
      const hand = 'hand' + side, elbow = 'elbow' + side;
      mitt(c, side, s, HK, col, { grow: 1.16, metal: true });
      for (let i = 0; i < 3; i++) { const y = (-0.01 - i * 0.03) * HK, r = Math.sqrt(Math.max(0.05, 1 - ((y + 0.035 * HK) / (0.095 * HK)) ** 2)); add(new THREE.TorusGeometry(0.076 * HK * r, 0.006, 3, 10), hand, dk, { position: [0, y, 0.003], rotation: [PI / 2, 0, 0], scale: [1, 0.94, 1], metal: true }); }
      const w = ringAt(M.fore, -Fa), m = ringAt(M.fore, -Fa * 0.7), t = ringAt(M.fore, -Fa * 0.42);
      add(profile([[-Fa - 0.012, w[1] + 0.014, w[2] + 0.014, 0], [-Fa * 0.7, m[1] + 0.012, m[2] + 0.012, 0]], 10), elbow, col, { metal: true });
      // the cuff: a stiff leather band, wider at the top, with a line of stitching and a strap
      add(profile([[-Fa * 0.78, m[1] + 0.018, m[2] + 0.018, 0], [-Fa * 0.42, t[1] + 0.034, t[2] + 0.034, 0]], 10), elbow, col2);
      add(profile([[-Fa * 0.42 - 0.01, t[1] + 0.036, t[2] + 0.036, 0], [-Fa * 0.42 + 0.01, t[1] + 0.038, t[2] + 0.038, 0]], 10), elbow, tone(col2, 0.6));
      band(c, elbow, M.fore, -Fa * 0.72, 0.014, 0.024, tone(col2, 0.6));
      add(new THREE.BoxGeometry(0.012, 0.028, 0.03), elbow, '#c8ccd6', { position: [s * (m[1] + 0.03), -Fa * 0.72, 0], metal: true });
    }
  },

  /** Plate: hourglass gauntlets — a wasp-waisted cuff flaring wide at the forearm, a plated hand, spiked gadlings on the knuckles. */
  g5_plate_gauntlets(a, c, gloves) {
    const [col, col2] = tint(gloves, G5_GLOVES.g5_plate_gauntlets), { add } = c, M = limbs(c), { HK, Fa } = M, dk = tone(col, 0.7), hi = lift(col, 0.3);
    for (const [side, s] of SIDES) {
      const hand = 'hand' + side, elbow = 'elbow' + side;
      mitt(c, side, s, HK, dk, { grow: 1.12, metal: true });
      // the back-of-hand plate and two finger lames, on the outside of the fist
      add(low(), hand, col, { position: [s * 0.012 * HK, -0.02 * HK, -0.004], scale: [0.075 * HK, 0.06 * HK, 0.068 * HK], metal: true });
      add(low(), hand, hi, { position: [s * 0.006 * HK, -0.068 * HK, 0.012 * HK], scale: [0.07 * HK, 0.045 * HK, 0.064 * HK], metal: true });
      for (let k = 0; k < 3; k++) add(new THREE.ConeGeometry(0.012, 0.035, 4), hand, col2, { position: [(-0.03 + k * 0.03) * HK, -0.118 * HK, 0.03 * HK], rotation: [PI - 0.5, 0, 0], metal: true });
      // the cuff: narrow at the wrist, then flaring — the hourglass
      const w = ringAt(M.fore, -Fa), n = ringAt(M.fore, -Fa * 0.8), t = ringAt(M.fore, -Fa * 0.3);
      add(profile([[-Fa - 0.014, w[1] + 0.03, w[2] + 0.03, 0], [-Fa * 0.82, n[1] + 0.012, n[2] + 0.012, 0], [-Fa * 0.55, n[1] + 0.03, n[2] + 0.03, 0], [-Fa * 0.3, t[1] + 0.055, t[2] + 0.055, 0]], 10), elbow, col, { metal: true });
      add(profile([[-Fa * 0.3 - 0.01, t[1] + 0.057, t[2] + 0.057, 0], [-Fa * 0.3 + 0.012, t[1] + 0.06, t[2] + 0.06, 0]], 10), elbow, col2, { metal: true });
      band(c, elbow, M.fore, -Fa * 0.82, 0.014, 0.018, col2, { metal: true });
      add(taperedCurve([[s * (n[1] + 0.016), -Fa * 0.82, 0], [s * (n[1] + 0.036), -Fa * 0.55, 0], [s * (t[1] + 0.06), -Fa * 0.3, 0]], [0.007, 0.009, 0.007], 3, 4), elbow, hi, { metal: true });
    }
  },
};
