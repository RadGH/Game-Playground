// Chibi 2 gear: held items, off-hand items, accessories, face marks, capes, greaves and decorations.
// Every builder adds skinned pieces through the shared SkinBuilder buckets (cloth / metal), so gear never adds a draw call.
//
// Bone spaces (before the body scale factors W = width, T = torso height):
//   chest  front surface z ~0.14W, back ~-0.14W, shoulders x ±0.22W at y 0.27T, neck top y 0.30T.
//   hips   belt at y ~0.03, front surface z ~0.13W; robes flare to x 0.27W / z 0.19W by y -0.2.
//          The hands hang at x ±0.255W, y ~-0.06, so belt items sit front-left (x -0.16W, z 0.21W).
//   hand*  +y runs toward the elbow, +z is forward, palm centre at y -0.035; grips sit at z 0.055.
//   elbow* forearm runs from y 0 to -0.205T, sleeve radius ~0.075.
//   arm*   shoulder ball top at y 0.045; the sleeve cap is radius ~0.09 around the pivot.
//   leg*   thigh from y 0 to the knee at -0.27, radius ~0.1.   knee* shin to the ankle, boot top at -0.035.
//   head   +z forward, head spans y 0..0.60 (see CHIBI2.md, Head space and hoods); positions scale by H.
import * as THREE from 'three';
import { profile, taperedCurve } from './chibi2-geometry.js';
/**
 * The Farhold weapon kit, 2026-09-20. ADDITIVE AND OPT-IN: every builder in it answers to an `fh_`
 * id that nothing in this file has ever used, so a look that does not name one reaches exactly the
 * code it always did. See `avatar-3d/js/chibi2-weapons.js` for why it is a separate file.
 */
import { buildFarholdHeld, buildFarholdOffhand, strapShield, endCaps, bowStringPath, rag } from './chibi2-weapons.js';
import { HELD_WEAPON_IDS, offhandAllowed } from './chibi2-weapon-ids.js';
// PLAY-TEST 5 (T23): the g5_ models are built by chibi2-gear5.js (called by chibi2.js after this file);
// the three builders below that have a catch-all default step aside for a g5_ id, and nothing else changes.
import { isG5 } from './chibi2-gear5-ids.js';
import { skirtWeigh, registerSkirtSurface } from './chibi25-body.js';   // Chibi 2.5 part B: capes on skirt bones

const low = () => new THREE.SphereGeometry(1, 8, 5);
const gem = () => new THREE.IcosahedronGeometry(1, 0);
const tone = (c, k) => '#' + new THREE.Color(c).multiplyScalar(k).getHexString();
const lift = (c, k) => '#' + new THREE.Color(c).lerp(new THREE.Color('#ffffff'), k).getHexString();
const gold = '#d8b040', bone = '#e8e0c8', silver = '#c8c8d8', parchment = '#efe6cc', wood = '#5a3a1a', glowWarm = '#ffd27a';
const CAPELETS = ['shoulder_cape', 'fur_mantle', 'feather_mantle'];
/**
 * The lute's own frame in RIGHT-HAND space (W3, 2026-10-21): measured on the default body in the `lute` carry pose
 * (chibi2-motion.js LUTE_POSE) — bowl centre in front of the belly by the right hand, neck pointing at the left palm.
 */
const LUTE_FRAME = new THREE.Matrix4().compose(new THREE.Vector3(-0.021, 0.047, -0.038), new THREE.Quaternion().setFromEuler(new THREE.Euler(1.9305, 1.0455, 0.4534)), new THREE.Vector3(1, 1, 1));
export { CAPELETS };

/** Reversed-winding copy, so a thin sheet is visible from both sides with the single-sided materials. */
function backface(g) {
  const b = g.clone(), idx = b.index.array;
  for (let i = 0; i < idx.length; i += 3) [idx[i], idx[i + 1]] = [idx[i + 1], idx[i]];
  b.computeVertexNormals(); return b;
}
/** Flat outline extruded along z and centred on z = 0. Points are [x, y] in counter-clockwise order. */
function extrude(points, depth) {
  const s = new THREE.Shape(); s.moveTo(...points[0]); for (const p of points.slice(1)) s.lineTo(...p); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 3 }); g.translate(0, 0, -depth / 2); return g;
}
/** Straight tube segments through the points: zig-zags keep their corners, unlike a smoothed curve. */
function polyline(c, bone, pts, r, color, opts = {}) {
  for (let i = 0; i < pts.length - 1; i++) c.add(taperedCurve([pts[i], pts[i + 1]], [r, r], 4, 1), bone, color, opts);
}
/** A hanging sheet on the chest bone: width and z blend from top to bottom, both sides visible. */
const CAPE_FROM = 0.0, CAPE_TO = 0.22;     // depth below the hip pivot over which a cape hands over to the skirt bones
function drape(c, color, { x = 0, top, length, width, bottom, zTop, zBottom, sx = 5, sy = 7, ripple = 0.012, tatter = 0, main = false, yoke = false }) {
  if (yoke && c.wrap) { sx = Math.max(sx, 8); sy += 1; }      // the yoke wants more columns to follow the shoulders' curve
  const g = new THREE.PlaneGeometry(1, 1, sx, sy), p = g.attributes.position;
  /**
   * B8 (2026-10-21 owner review, "capes look very flat, especially around the shoulders where fabric should curve over
   * them"). With `yoke` the top rows of the sheet are laid ON the body (c.wrap, chibi2-straps.js): the top edge runs
   * over the tops of the shoulders (and the shoulder balls) and round behind the neck, the next rows come down the
   * shoulder blades, and only below that does the cloth leave the back and hang to the hem as before.
   */
  const W = c.W || 1, KY = 3, wrap = yoke && c.wrap;
  const lift0 = (c.topStyle?.armor === 'plate' || c.topStyle?.armor === 'scale' ? 0.034 : c.topStyle?.armor === 'mail' ? 0.012 : 0) + 0.02;
  // the yoke is wider than the sheet's top: its outer columns go over the shoulder balls and a little way down the front
  const yokeW = width + (x ? 0.04 : 0.14) * W;      // (a half cape already sits out on its shoulder)
  const phiEnd = Math.PI - 0.32;
  const yokeAt = (u, k) => {
    const f = k / KY, xx = x + u * (yokeW + (width - yokeW) * f), ax = Math.abs(xx);
    const phiTop = Math.PI / 2 + 0.55 * (1 - THREE.MathUtils.smoothstep(ax, 0.06 * W, 0.16 * W)) - 0.22 * THREE.MathUtils.smoothstep(ax, 0.17 * W, 0.27 * W);
    return wrap.surface(xx, phiTop + (phiEnd - phiTop) * f, lift0 + f * 0.006);
  };
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i), v = 0.5 - p.getY(i);
    // a tattered hem: every other column of the bottom row is pulled up into a notch
    const notch = tatter && v > 0.99 ? (Math.round((u + 0.5) * sx) % 2 ? tatter : 0) : 0;
    const row = Math.round(v * sy);
    if (wrap && row <= KY) { const q = yokeAt(u, row); p.setXYZ(i, q[0], q[1], q[2]); continue; }
    if (wrap) {
      // from the bottom of the yoke straight down to the same hem as before
      const t = (row - KY) / (sy - KY), q = yokeAt(u, KY), hx = x + u * bottom, hy = top - length + notch, hz = zBottom + Math.cos(u * 18) * ripple;
      p.setXYZ(i, q[0] + (hx - q[0]) * t, q[1] + (hy - q[1]) * t, q[2] + (hz - q[2]) * t + Math.sin(t * Math.PI) * (zBottom - zTop) * 0.12);
      continue;
    }
    p.setXYZ(i, x + u * THREE.MathUtils.lerp(width, bottom, v), top - v * length + notch, THREE.MathUtils.lerp(zTop, zBottom, v) + Math.cos(u * 18) * ripple * v);
  }
  g.computeVertexNormals();
  // Chibi 2.5: a cape on a skirt-boned body hands its lower half to the back skirt bones, so a heel kicked back lifts
  // the hem instead of going through it (chibi25-body.js). `main` tags the cape's own sheet for the robe test.
  const skirtW = c.rig?.skirt ? skirtWeigh(c.rig, 'chest', { from: CAPE_FROM, to: CAPE_TO, back: true }) : null;
  // ...and (B8) the cloth over each shoulder rides that arm a little, so a raised arm lifts it instead of coming through
  const T = c.T || 1;
  const weigh = wrap ? (vx, vy, vz) => {
    const k = THREE.MathUtils.smoothstep(Math.abs(vx), 0.12 * W, 0.24 * W) * THREE.MathUtils.smoothstep(vy, 0.16 * T, 0.26 * T) * 0.92;
    if (k > 0) return [['chest', 1 - k], [vx < 0 ? 'armL' : 'armR', k]];
    return skirtW ? skirtW(vx, vy, vz) : [['chest', 1]];
  } : skirtW;
  const o = weigh ? { weigh } : {};
  // (2026-10-21: the reversed copy that made the back of the sheet visible is gone — the material is double-sided
  // now, and two copies on one surface flicker)
  c.add(g, 'chest', color, main ? { ...o, tag: 'garment:' + (sx + 1) } : o);
  if (main && c.rig?.skirt) {
    const dy = c.rig.byName.chest.position.y, rings = [];
    for (let r = 0; r <= sy; r++) { const v = r / sy; rings.push([top - v * length + dy, Math.abs(x) + THREE.MathUtils.lerp(width, bottom, v) / 2, -THREE.MathUtils.lerp(zTop, zBottom, v), 0]); }
    registerSkirtSurface(c.rig, rings, { arc: [Math.PI / 2 + 0.25, Math.PI * 1.5 - 0.25], hem: top - length + dy, from: CAPE_FROM, to: CAPE_TO });
  }
}

// ---------------------------------------------------------------- straps (B10, 2026-10-21 owner review)
/**
 * "The quiver strap does not go over the shoulder and looks like a separate thing" — and the same for the cog pack, the
 * herb satchel and every other strapped thing here: each strap was one curve down the FRONT that started in the air above
 * the shoulder. Now every strap is laid on the body by c.wrap (chibi2-straps.js) and is one continuous piece:
 *   crossStrap  a bandolier-style CLOSED loop over shoulder `s` (+1 = right) to the opposite hip, front and back
 *   packStrap   a rucksack strap: from the pack's top, over the shoulder, down the chest, under the arm, back to the pack
 * Both stand off a breastplate / mail by the same amount the capes do.
 */
const strapLift = c => (c.topStyle?.armor === 'plate' || c.topStyle?.armor === 'scale' ? 0.036 : c.topStyle?.armor === 'mail' ? 0.012 : 0.004);
function crossStrap(c, s, r, colour, { metal = false } = {}) {
  const W = c.W || 1, P = Math.PI;
  if (!c.wrap) return null;
  return c.wrap.loop(c.add, [[-s * 0.17 * W, P + 1.0], [s * 0.105 * W, P / 2], [-s * 0.17 * W, -1.0]], r, colour, { lift: strapLift(c), n: 18, closeSide: -s, metal });
}
function packStrap(c, s, { topY, topZ, botY, botZ, r = 0.016, colour }) {
  const W = c.W || 1, T = c.T || 1, P = Math.PI, l = strapLift(c);
  if (!c.wrap) return;
  const low = c.wrap.surface(s * 0.14 * W, -0.55, l + r);
  c.wrap.strap(c.add, [[s * 0.1 * W, P - 0.45], [s * 0.1 * W, P / 2], [s * 0.12 * W, 0.4], [s * 0.13 * W, -0.55]], r, colour, {
    lift: l, n: 14, weigh: c.wrap.armWeigh(W, 0.5),
    extraStart: [[s * 0.095 * W, topY, topZ]],
    // under the arm LOW, at the bottom of the ribs, where the hanging arm is clear of the body
    extraEnd: [c.wrap.side(Math.min(low[1], botY - 0.03), s, l + r * 0.5).map((v, i) => i === 0 ? v * 0.95 : i === 2 ? v - 0.04 * W : v), [s * 0.13 * W, botY, botZ]],
  });
  void T;
}

// ---------------------------------------------------------------- held (right hand)
export function buildHeld(a, c) {
  const id = a.held.id, hc = a.held.color, { add, trim, leather, steel } = c;
  if (id === 'none' || isG5(id)) return;
  if (buildFarholdHeld(a, c)) return;            // an `fh_` weapon; everything below is unchanged
  const R = 'handR', z = 0.055;
  const shaft = (bone, from, to, r, color) => add(profile([[from, r, r], [to, r, r]], 8), bone, color, { position: [0, 0, z] });
  // OWNER REVIEW 2026-10-21 (W1, W8): the blade began at y -0.165 and the guard's underside is at -0.136, so every
  // sword, greatsword and pair of daggers in this vocabulary had 3 cm of air between blade and hilt; the blade now
  // starts inside the guard (-0.105). The guard is an open tube — its ends were holes you could see through — and is
  // closed with a ball on each end (`endCaps`).
  const sword = (bone, len) => {
    shaft(bone, -0.135, 0.085, 0.019, leather);
    add(profile([[-len, 0.002, 0.002], [-len * 0.78, 0.055, 0.018], [-0.08, 0.043, 0.017]], 4), bone, steel, { position: [0, -0.025, z], metal: true });
    const gp = [[-0.10, -0.115, z], [0, -0.095, z], [0.10, -0.115, z]];
    add(taperedCurve(gp, [0.021, 0.021, 0.021], 4, 4), bone, trim, { metal: true });
    endCaps(c, bone, gp, 0.021, trim);
    add(low(), bone, trim, { position: [0, 0.055, z], scale: [0.032, 0.035, 0.029], metal: true });
  };
  if (/staff/.test(id)) {
    shaft(R, -0.52, 0.54, 0.021, hc);
    if (id === 'quarterstaff') for (const y of [-0.52, 0.54]) add(profile([[y - 0.04, 0.026, 0.026], [y + 0.04, 0.026, 0.026]], 8), R, steel, { position: [0, 0, z], metal: true });
    if (id === 'staff_orb') {
      add(low(), R, '#8fd0ff', { position: [0, 0.64, z], scale: [0.075, 0.075, 0.075] });
      for (let k = 0; k < 3; k++) { const t = k / 3 * Math.PI * 2, sx = Math.sin(t), sz = Math.cos(t); add(taperedCurve([[sx * 0.02, 0.52, z + sz * 0.02], [sx * 0.08, 0.62, z + sz * 0.08], [sx * 0.045, 0.72, z + sz * 0.045]], [0.014, 0.012, 0.005], 4, 5), R, hc); }
    } else if (id === 'staff_skull') {
      add(low(), R, bone, { position: [0, 0.645, z], scale: [0.078, 0.072, 0.082] });
      add(new THREE.BoxGeometry(0.075, 0.035, 0.06), R, bone, { position: [0, 0.575, z + 0.02] });
      for (const s of [-1, 1]) add(low(), R, '#1c1c1c', { position: [s * 0.03, 0.645, z + 0.07], scale: [0.02, 0.022, 0.012] });
      add(new THREE.TorusGeometry(0.03, 0.009, 4, 10), R, trim, { position: [0, 0.53, z], rotation: [Math.PI / 2, 0, 0], metal: true });
    } else if (id === 'staff_crook') {
      add(taperedCurve([[0, 0.50, z], [0, 0.64, z], [0.05, 0.73, z], [0.13, 0.71, z], [0.15, 0.62, z]], [0.022, 0.022, 0.02, 0.018, 0.012], 6, 10), R, hc);
      add(taperedCurve([[0.02, 0.10, z + 0.02], [-0.02, 0.22, z - 0.012], [0.025, 0.34, z + 0.02], [-0.02, 0.46, z]], [0.008, 0.008, 0.008, 0.006], 4, 10), R, '#3aa35a');
      for (const [x, y] of [[0.035, 0.22], [-0.035, 0.40]]) add(low(), R, '#3aa35a', { position: [x, y, z + 0.015], scale: [0.032, 0.012, 0.022] });
    } else if (id === 'staff_crystal') {
      add(new THREE.OctahedronGeometry(1), R, lift(hc, 0.35), { position: [0, 0.66, z], scale: [0.05, 0.12, 0.05] });
      add(new THREE.TorusGeometry(0.05, 0.01, 4, 10), R, trim, { position: [0, 0.55, z], rotation: [Math.PI / 2, 0, 0], metal: true });
    } else if (id === 'staff_totem') {
      add(low(), R, '#40c8ff', { position: [0, 0.63, z], scale: [0.05, 0.05, 0.05] });
      add(new THREE.TorusGeometry(0.03, 0.01, 4, 10), R, leather, { position: [0, 0.57, z], rotation: [Math.PI / 2, 0, 0] });
      for (const s of [-1, 1]) add(taperedCurve([[s * 0.03, 0.56, z], [s * 0.07, 0.46, z + 0.01], [s * 0.06, 0.37, z]], [0.014, 0.012, 0.01], 4, 4), R, bone);
      add(taperedCurve([[0, 0.56, z - 0.02], [-0.06, 0.50, z - 0.05], [-0.10, 0.40, z - 0.06]], [0.02, 0.026, 0.003], 4, 5), R, '#c83a2a');
    }
    return;
  }
  if (id === 'bow') {
    // THE BOW IS IN THE LEFT HAND (the right draws the string). Built for the shot: with the arm
    // held out, the hand's +z is up and -y is toward the target, so the limbs run along z and the
    // belly faces -y. The grip bone stands it upright at rest (see REST_PITCH.bow).
    const L = 'handL', G = [0, -0.035, 0.055];
    const at = ([x, y, z]) => [x + G[0], y + G[1], z + G[2]];
    add(profile([[-0.06, 0.022, 0.022], [0.06, 0.022, 0.022]], 8), L, leather, { position: G, rotation: [Math.PI / 2, 0, 0] });
    // OWNER REVIEW 2026-10-21 (W7): the string ran at y 0.095 straight between the tips, through the last 6 cm of each
    // limb (they bend back to y 0.10). It is now strung along the limbs' BACK edge (`bowStringPath`), tip to tip.
    const limbs = [-1, 1].map(k => ({ pts: [[k * 0.05, -0.01], [k * 0.24, 0.02], [k * 0.4, 0.1], [k * 0.46, 0.09]], radii: [0.024, 0.02, 0.014, 0.008] }));
    for (const { pts, radii } of limbs) add(taperedCurve(pts.map(([zz, yy]) => at([0, yy, zz])), radii, 5, 8), L, hc, { metal: true });
    polyline(c, L, bowStringPath(limbs).map(([zz, yy]) => at([0, yy, zz])), 0.004, '#e8e0c0');
    return;
  }
  if (id === 'crossbow') {
    add(new THREE.BoxGeometry(0.05, 0.055, 0.36), R, wood, { position: [0, -0.07, 0.19] });
    add(taperedCurve([[-0.19, -0.05, 0.30], [0, -0.04, 0.36], [0.19, -0.05, 0.30]], [0.012, 0.02, 0.012], 5, 6), R, hc, { metal: true });
    polyline(c, R, [[-0.19, -0.05, 0.30], [0, -0.04, 0.22], [0.19, -0.05, 0.30]], 0.004, '#e8e0c0');
    polyline(c, R, [[0, -0.035, 0.20], [0, -0.035, 0.40]], 0.007, steel, { metal: true });
    add(new THREE.ConeGeometry(0.014, 0.04, 5), R, steel, { position: [0, -0.035, 0.42], rotation: [Math.PI / 2, 0, 0], metal: true }); return;
  }
  // The four hafted weapons of the original kit were built with the head at +y — BEHIND the fist,
  // up the forearm — so a chop swung the butt at the target. They are turned half a turn about the
  // grip (a rotation, so no face is turned inside out) and now point the way every clip aims them.
  if (['greataxe', 'hammer', 'warhammer', 'mace'].includes(id)) {
    const flip = new THREE.Matrix4().makeRotationZ(Math.PI), m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    const addFlipped = (g, bone, color, o = {}) => {
      g.applyMatrix4(m.compose(new THREE.Vector3(...(o.position || [0, 0, 0])), q.setFromEuler(e.set(...(o.rotation || [0, 0, 0]))), new THREE.Vector3(...(o.scale || [1, 1, 1]))));
      g.applyMatrix4(flip);
      add(g, bone, color, { metal: o.metal, skinTo: o.skinTo });
    };
    return buildHeld({ ...a, held: { ...a.held, id: id + '__raw' } }, { ...c, add: addFlipped });
  }
  const rawId = id.replace(/__raw$/, '');
  if (rawId === 'greataxe') {
    shaft(R, -0.55, 0.55, 0.02, wood);
    const right = [[0.02, 0.08], [0.12, 0.10], [0.25, 0.18], [0.21, 0.06], [0.21, -0.06], [0.25, -0.18], [0.12, -0.10], [0.02, -0.08]];
    add(extrude(right, 0.02), R, hc, { position: [0, 0.44, z], metal: true });
    add(extrude(right.map(([x, y]) => [-x, y]).reverse(), 0.02), R, hc, { position: [0, 0.44, z], metal: true });
    add(new THREE.ConeGeometry(0.025, 0.09, 5), R, hc, { position: [0, 0.58, z], metal: true }); return;
  }
  if (/hammer/.test(rawId)) {
    const big = rawId === 'warhammer';
    shaft(R, big ? -0.55 : -0.14, big ? 0.55 : 0.36, 0.02, wood);
    add(new THREE.BoxGeometry(big ? 0.30 : 0.24, 0.14, 0.14), R, hc, { position: [0, big ? 0.46 : 0.40, z], metal: true });
    if (big) add(new THREE.ConeGeometry(0.035, 0.12, 5), R, hc, { position: [0.20, 0.46, z], rotation: [0, 0, -Math.PI / 2], metal: true });
    return;
  }
  if (rawId === 'mace') {
    shaft(R, -0.14, 0.34, 0.02, wood);
    add(new THREE.DodecahedronGeometry(0.11, 0), R, hc, { position: [0, 0.42, z], metal: true });
    for (const [x, y, zz, rx, rz] of [[0.11, 0.42, 0, 0, -1.57], [-0.11, 0.42, 0, 0, 1.57], [0, 0.53, 0, 0, 0], [0, 0.42, 0.11, 1.57, 0], [0, 0.42, -0.11, -1.57, 0]]) add(new THREE.ConeGeometry(0.025, 0.07, 4), R, hc, { position: [x, y, z + zz], rotation: [rx, 0, rz], metal: true });
    return;
  }
  if (id === 'daggers') { sword(R, 0.34); if (a.offhand.id === 'none') sword('handL', 0.34); return; }
  if (id === 'rapier') {
    shaft(R, -0.12, 0.08, 0.017, '#333333');
    add(profile([[-0.68, 0.003, 0.003], [-0.14, 0.012, 0.012]], 5), R, steel, { position: [0, -0.025, z], metal: true });
    add(new THREE.SphereGeometry(0.065, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2), R, silver, { position: [0, -0.13, z], rotation: [Math.PI, 0, 0], metal: true });
    add(taperedCurve([[0, -0.13, z + 0.065], [0, -0.02, z + 0.09], [0, 0.07, z + 0.03]], [0.008, 0.008, 0.008], 4, 5), R, silver, { metal: true }); return;
  }
  if (id === 'saber') {
    shaft(R, -0.12, 0.08, 0.018, '#222222');
    // OWNER REVIEW 2026-10-21 (W2): "curves the wrong way". The blade was turned a quarter turn about y, so its flat
    // led every cut (a sword's edges are its x sides, and the clips swing a blade +x first — see EDGE_AXIS in
    // chibi2-weapon-ids.js). Unturned, the convex outer curve is the +x side and leads the cut; the guard crosses
    // the blade along x like every other sword's.
    add(extrude([[0.02, -0.12], [0.012, -0.36], [-0.035, -0.53], [-0.11, -0.64], [-0.065, -0.50], [-0.028, -0.34], [-0.026, -0.12]], 0.012), R, hc, { position: [0, -0.02, z], metal: true });
    const gp = [[-0.07, -0.125, z], [0, -0.14, z], [0.07, -0.125, z]];
    add(taperedCurve(gp, [0.016, 0.02, 0.016], 4, 4), R, silver, { metal: true });
    endCaps(c, R, gp, 0.016, silver); return;
  }
  if (id === 'cleaver') {
    shaft(R, -0.14, 0.07, 0.022, '#8a6a3a');
    add(new THREE.BoxGeometry(0.018, 0.27, 0.14), R, hc, { position: [0, -0.28, z + 0.05], metal: true });
    add(new THREE.BoxGeometry(0.022, 0.05, 0.03), R, tone(hc, 0.6), { position: [0, -0.22, z + 0.12], metal: true });
    add(new THREE.TorusGeometry(0.025, 0.007, 4, 8), R, steel, { position: [0, 0.09, z], metal: true }); return;
  }
  if (id === 'lute') {
    /**
     * OWNER REVIEW 2026-10-21 (W3): "the lute just floats in front". It hung 19 cm in front of the palm on nothing,
     * held by no hand. It is now built IN PLAYING POSITION: the bowl against the belly, the neck rising across the
     * chest to the other shoulder, the right hand over the strings by the rose. The lute is authored in its own frame
     * (neck up its +y, face out its +z, bowl centred on the origin) and `LUTE_FRAME` puts that frame in hand space,
     * worked out against the `lute` carry pose in chibi2-motion.js (`LUTE_POSE`): with the grip unturned, the right
     * forearm lies across the bowl and the left hand closes on the neck just under the pegbox. A lute's hold kind is
     * 'lute' (chibi2-weapon-ids.js) and it is two-handed: nothing is drawn in the off hand with it.
     */
    const F = LUTE_FRAME, m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    const put = (g, color, o = {}) => {
      g.applyMatrix4(m.compose(new THREE.Vector3(...(o.position || [0, 0, 0])), q.setFromEuler(e.set(...(o.rotation || [0, 0, 0]))), new THREE.Vector3(...(o.scale || [1, 1, 1]))));
      add(g.applyMatrix4(F), R, color, { metal: o.metal });
    };
    const body = hc, dark = '#2a1a10', face = '#d8b884', gut = '#efe6cc';
    put(new THREE.SphereGeometry(1, 10, 6), body, { position: [0, -0.01, -0.012], scale: [0.105, 0.14, 0.052] });          // the bowl
    put(new THREE.CylinderGeometry(1, 1, 1, 14), face, { position: [0, -0.01, 0.036], rotation: [Math.PI / 2, 0, 0], scale: [0.1, 0.008, 0.132] });   // the soundboard
    put(new THREE.CylinderGeometry(1, 1, 1, 10), dark, { position: [0, 0.035, 0.041], rotation: [Math.PI / 2, 0, 0], scale: [0.026, 0.004, 0.026] });  // the rose
    put(new THREE.BoxGeometry(0.07, 0.012, 0.01), dark, { position: [0, -0.085, 0.044] });                                   // the bridge
    put(new THREE.BoxGeometry(0.042, 0.33, 0.026), tone(body, 0.75), { position: [0, 0.27, 0.022] });                         // the neck
    put(new THREE.BoxGeometry(0.036, 0.31, 0.006), dark, { position: [0, 0.28, 0.037] });                                    // the fingerboard
    put(new THREE.BoxGeometry(0.044, 0.1, 0.026), tone(body, 0.6), { position: [0, 0.475, -0.012], rotation: [-0.6, 0, 0] });   // the pegbox, bent back
    for (const y of [0.455, 0.49]) put(new THREE.BoxGeometry(0.08, 0.009, 0.009), dark, { position: [0, y, -0.012 - (y - 0.44) * 0.68] });   // pegs
    for (const x of [-0.011, 0, 0.011]) {
      const a = new THREE.Vector3(x, -0.085, 0.05).applyMatrix4(F), b = new THREE.Vector3(x, 0.43, 0.043).applyMatrix4(F);
      polyline(c, R, [a.toArray(), b.toArray()], 0.0022, gut);
    }
    return;
  }
  if (id === 'book') {
    add(new THREE.BoxGeometry(0.17, 0.21, 0.05), R, hc, { position: [0, -0.10, 0.11] });
    add(new THREE.BoxGeometry(0.16, 0.19, 0.036), R, parchment, { position: [0.01, -0.10, 0.11] });
    add(new THREE.BoxGeometry(0.03, 0.05, 0.056), R, gold, { position: [-0.075, -0.10, 0.11], metal: true });
    add(low(), R, gold, { position: [0, -0.10, 0.137], scale: [0.03, 0.03, 0.006], metal: true }); return;
  }
  if (id === 'hourglass') {
    const y0 = -0.06, z0 = 0.15;
    for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 10), R, gold, { position: [0, y0 + s * 0.11, z0], metal: true });
    add(new THREE.ConeGeometry(0.055, 0.10, 8), R, '#f4f0e0', { position: [0, y0 + 0.05, z0], rotation: [Math.PI, 0, 0] });
    add(new THREE.ConeGeometry(0.055, 0.10, 8), R, '#f4f0e0', { position: [0, y0 - 0.05, z0] });
    add(new THREE.ConeGeometry(0.036, 0.045, 6), R, lift(hc, 0.1), { position: [0, y0 - 0.078, z0] });
    for (let k = 0; k < 3; k++) { const t = k / 3 * Math.PI * 2; add(profile([[-0.10, 0.008, 0.008], [0.10, 0.008, 0.008]], 5), R, gold, { position: [Math.sin(t) * 0.06, y0, z0 + Math.cos(t) * 0.06], metal: true }); }
    return;
  }
  if (id === 'orb') {
    add(low(), R, lift(hc, 0.15), { position: [0, 0.03, 0.16], scale: [0.085, 0.085, 0.085] });
    add(new THREE.TorusGeometry(0.115, 0.008, 4, 16), R, lift(hc, 0.45), { position: [0, 0.03, 0.16], rotation: [0.6, 0, 0.3] }); return;
  }
  if (id === 'flame') {
    add(low(), R, hc, { position: [0, -0.03, 0.15], scale: [0.065, 0.04, 0.065] });
    add(new THREE.ConeGeometry(0.065, 0.22, 7), R, hc, { position: [0, 0.07, 0.15] });
    add(new THREE.ConeGeometry(0.04, 0.15, 6), R, '#ffd76a', { position: [0, 0.05, 0.175] });
    for (const s of [-1, 1]) add(new THREE.ConeGeometry(0.025, 0.09, 5), R, hc, { position: [s * 0.05, 0.03, 0.14], rotation: [0, 0, -s * 0.45] });
    return;
  }
  if (id === 'lightning') {
    const bolt = lift(hc, 0.3);
    for (const bone of [R, 'handL']) {
      polyline(c, bone, [[0, -0.02, 0.10], [0.04, 0.06, 0.12], [-0.02, 0.12, 0.13], [0.03, 0.22, 0.12]], 0.012, bolt);
      polyline(c, bone, [[0.05, -0.05, 0.08], [0.10, 0.02, 0.06], [0.07, 0.08, 0.09], [0.13, 0.15, 0.07]], 0.01, bolt);
      polyline(c, bone, [[-0.05, -0.06, 0.09], [-0.10, 0.0, 0.11], [-0.07, 0.07, 0.08]], 0.01, bolt);
    }
    return;
  }
  if (id === 'ring_rune') {
    add(new THREE.TorusGeometry(0.12, 0.012, 4, 20), R, hc, { position: [0, 0.0, 0.20] });
    add(new THREE.TorusGeometry(0.075, 0.009, 4, 16), R, lift(hc, 0.4), { position: [0, 0.0, 0.20], rotation: [0, 0, Math.PI / 4] });
    for (const [x, y] of [[0, 0.12], [0, -0.12], [0.12, 0], [-0.12, 0]]) add(new THREE.OctahedronGeometry(1), R, lift(hc, 0.55), { position: [x, y, 0.20], scale: [0.02, 0.028, 0.012] });
    add(low(), R, lift(hc, 0.6), { position: [0, 0, 0.20], scale: [0.025, 0.025, 0.025] }); return;
  }
  // Sword family: sword, greatsword and any unmodelled blade.
  sword(R, /greatsword/.test(id) ? 0.72 : /dagger/.test(id) ? 0.34 : 0.52);
}

// ---------------------------------------------------------------- off-hand (left hand)
export function buildOffhand(a, c) {
  const id = a.offhand.id, oc = a.offhand.color, { add, trim, leather, steel, W, T } = c, L = 'handL';
  if (id === 'none' || isG5(id)) return;
  if (buildFarholdOffhand(a, c)) return;         // an `fh_` shield, strapped to the forearm
  if (id === 'dagger') {
    // OWNER REVIEW 2026-10-21 (W4): "just a cylinder" — it was one 5-sided rod. A real parrying dagger now: a wrapped
    // grip through the fist on the grip line, a cross guard with closed ends, a ring pommel and a leaf blade with a
    // fuller, pointing out past the fingers like every other blade (the 'dagger' carry rides the fist, fistGrip).
    const z = 0.055, guardPts = [[-0.055, -0.085, z], [0, -0.075, z + 0.004], [0.055, -0.085, z]];
    add(profile([[-0.08, 0.016, 0.016], [0.05, 0.018, 0.018]], 7), L, leather, { position: [0, 0, z] });
    for (const y of [-0.05, -0.015, 0.02]) add(profile([[y - 0.006, 0.02, 0.02], [y + 0.006, 0.02, 0.02]], 7), L, tone(leather, 0.7), { position: [0, 0, z] });
    add(taperedCurve(guardPts, [0.011, 0.014, 0.011], 5, 4), L, trim, { metal: true });
    endCaps(c, L, guardPts, 0.011, trim);
    add(new THREE.TorusGeometry(0.022, 0.007, 4, 10), L, trim, { position: [0, 0.074, z], metal: true });
    add(profile([[-0.36, 0.002, 0.002], [-0.29, 0.022, 0.008], [-0.15, 0.026, 0.009], [-0.075, 0.022, 0.009]], 4), L, steel, { position: [0, 0, z], metal: true });
    add(profile([[-0.27, 0.007, 0.005], [-0.1, 0.009, 0.0055]], 4), L, tone(steel, 0.66), { position: [0, 0, z], metal: true });
    return;
  }
  if (id === 'book') {
    // A TOME, carried by its spine in the left hand: a thick board cover, a page block set back inside
    // it, corner caps, a clasp across the fore-edge and a ribbon marker hanging out of the bottom.
    const B = [0, -0.1, 0.1], cover = oc || '#5a2a2a', brass = '#c8a040';
    add(new THREE.BoxGeometry(0.05, 0.24, 0.18), L, cover, { position: B });
    add(new THREE.BoxGeometry(0.036, 0.226, 0.17), L, parchment, { position: [B[0], B[1], B[2] + 0.006] });
    add(new THREE.CylinderGeometry(0.027, 0.027, 0.24, 8, 1, false, Math.PI, Math.PI), L, tone(cover, 0.8), { position: [B[0], B[1], B[2] - 0.09], rotation: [0, 0, 0] });
    for (const y of [-1, 1]) for (const z of [1]) add(new THREE.BoxGeometry(0.056, 0.03, 0.03), L, brass, { position: [B[0], B[1] + y * 0.108, B[2] + z * 0.078], metal: true });
    add(new THREE.BoxGeometry(0.058, 0.03, 0.05), L, brass, { position: [B[0], B[1], B[2] + 0.085], metal: true });
    for (const x of [-1, 1]) add(low(), L, lift(cover, 0.35), { position: [B[0] + x * 0.027, B[1], B[2]], scale: [0.006, 0.035, 0.035], metal: true });
    add(new THREE.BoxGeometry(0.004, 0.09, 0.012), L, '#b03030', { position: [B[0], B[1] - 0.15, B[2] + 0.02] });
    return;
  }
  if (id === 'orb') {
    // A SEER'S ORB on a claw cradle: a glassy sphere, a brighter core showing through it, a thin ring
    // around its waist and three brass claws holding it up out of the fist.
    // OWNER REVIEW 2026-10-21 (W4): "the orb needs a handle". The cradle stood 4.5 cm in front of the palm with
    // nothing in the fist. It now stands on a wrapped HANDLE on the grip line (z 0.055) that runs through the fist
    // (y -0.10..0.05) with a knob under it; the cradle sits on top of the fist and the claws close round the glass.
    const zf = 0.055, P = [0, 0.2, zf], glass = oc || '#8fd0ff', brass = '#c8a040';
    add(profile([[-0.1, 0.017, 0.017], [0.06, 0.019, 0.019]], 8), L, '#3a2a1c', { position: [0, 0, zf] });
    add(new THREE.SphereGeometry(0.026, 8, 5), L, brass, { position: [0, -0.11, zf], metal: true });
    add(new THREE.SphereGeometry(0.1, 14, 10), L, glass, { position: P, metal: true });
    add(new THREE.SphereGeometry(0.045, 10, 8), L, lift(glass, 0.6), { position: P });
    add(new THREE.TorusGeometry(0.118, 0.007, 4, 20), L, lift(glass, 0.4), { position: P, rotation: [1.2, 0, 0.35] });
    add(profile([[0.05, 0.022, 0.022], [0.075, 0.036, 0.036], [0.11, 0.05, 0.05]], 10), L, brass, { position: [0, 0, zf], metal: true });
    for (let k = 0; k < 3; k++) {
      const t = k / 3 * Math.PI * 2, sx = Math.sin(t), sz = Math.cos(t);
      add(taperedCurve([[sx * 0.045, 0.105, zf + sz * 0.045], [sx * 0.085, 0.16, zf + sz * 0.085], [sx * 0.07, 0.23, zf + sz * 0.07]], [0.011, 0.01, 0.004], 4, 5), L, brass, { metal: true });
    }
    return;
  }
  if (id === 'relic') {
    // A RELIQUARY: a little gilded house-shrine on a short handle, a window of pale light in its face
    // (a bone behind glass) and a cross-finial on the roof.
    const gold = oc || '#c8a040', glow = '#fff0b8';
    // W4 (2026-10-21): on the grip line with its handle through the fist, like the orb (it stood 4.5 cm off the palm)
    const zf = 0.055;
    add(new THREE.CylinderGeometry(0.018, 0.018, 0.2, 6), L, tone(gold, 0.6), { position: [0, -0.02, zf], metal: true });
    add(new THREE.SphereGeometry(0.024, 6, 4), L, gold, { position: [0, -0.125, zf], metal: true });
    add(new THREE.BoxGeometry(0.12, 0.13, 0.09), L, gold, { position: [0, 0.14, zf], metal: true });
    add(new THREE.ConeGeometry(0.095, 0.08, 4), L, tone(gold, 0.85), { position: [0, 0.245, zf], rotation: [0, Math.PI / 4, 0], metal: true });
    add(new THREE.BoxGeometry(0.07, 0.08, 0.01), L, glow, { position: [0, 0.14, zf + 0.047] });
    add(new THREE.BoxGeometry(0.012, 0.06, 0.012), L, gold, { position: [0, 0.31, zf], metal: true });
    add(new THREE.BoxGeometry(0.04, 0.012, 0.012), L, gold, { position: [0, 0.32, zf], metal: true });
    for (const x of [-1, 1]) add(new THREE.SphereGeometry(0.014, 6, 4), L, '#d04040', { position: [x * 0.06, 0.2, zf + 0.047], metal: true });
    return;
  }
  if (id === 'idol') {
    // An EFFIGY: a bound straw figure held by its legs, arms out, a clay head with two dark eyes and
    // red cord wound round it. The one caster focus that looks like it could bite.
    // OWNER REVIEW 2026-10-21 (W4): "the effigy floats over the hand". It stood 4.5 cm in front of the palm with its
    // feet above the fist. Now its LEGS are the handle: a bound bundle of straw on the grip line (z 0.055) that runs
    // through the fist, cord-wrapped where the fingers close, and the body rises out of the top of the fist.
    const straw = oc || '#b89a58', cord = '#8a1c1c', zf = 0.055;
    add(profile([[-0.12, 0.012, 0.012], [-0.1, 0.02, 0.02], [0.05, 0.022, 0.022], [0.07, 0.03, 0.03]], 7), L, tone(straw, 0.85), { position: [0, 0, zf] });   // the legs, bound
    for (const y of [-0.08, -0.035, 0.01]) add(new THREE.TorusGeometry(0.022, 0.005, 3, 8), L, cord, { position: [0, y, zf], rotation: [Math.PI / 2, 0, 0] });
    add(new THREE.CylinderGeometry(0.035, 0.05, 0.18, 7), L, straw, { position: [0, 0.15, zf] });
    add(new THREE.CylinderGeometry(0.018, 0.018, 0.2, 5), L, straw, { position: [0, 0.19, zf], rotation: [0, 0, Math.PI / 2] });
    add(new THREE.SphereGeometry(0.045, 10, 8), L, '#8a6a4a', { position: [0, 0.285, zf] });
    for (const x of [-1, 1]) add(new THREE.SphereGeometry(0.009, 5, 4), L, '#140808', { position: [x * 0.017, 0.29, zf + 0.04] });
    for (const y of [0.1, 0.17, 0.22]) add(new THREE.TorusGeometry(0.045, 0.006, 4, 12), L, cord, { position: [0, y, zf], rotation: [Math.PI / 2, 0, 0] });
    for (const x of [-1, 1]) add(new THREE.ConeGeometry(0.015, 0.05, 4), L, tone(straw, 0.8), { position: [x * 0.115, 0.19, zf], rotation: [0, 0, x * Math.PI / 2] });
    return;
  }
  if (id === 'tv_ward') {
    // PLAY-TEST 4 (S17): a WARDED FOCUS — a rune ring standing on a short handle, a hovering crystal
    // in its middle and four tabs round the rim. Built up +y like the orb; held upright the same way.
    const ZF = 0.055, P = [0, 0.19, ZF], glow = oc && oc !== '#9aa3ad' ? oc : '#9fe0ff', brass = '#c8a040';
    add(new THREE.CylinderGeometry(0.02, 0.016, 0.22, 6), L, tone(brass, 0.7), { position: [0, -0.01, ZF], metal: true });   // W4 (2026-10-21): on the grip line, the handle through the fist
    add(new THREE.TorusGeometry(0.095, 0.012, 5, 18), L, brass, { position: P, metal: true });
    for (let k = 0; k < 4; k++) { const t = k / 4 * Math.PI * 2 + Math.PI / 4; add(new THREE.BoxGeometry(0.03, 0.03, 0.02), L, lift(brass, 0.2), { position: [P[0] + Math.cos(t) * 0.1, P[1] + Math.sin(t) * 0.1, P[2]], rotation: [0, 0, t], metal: true }); }
    add(new THREE.OctahedronGeometry(1), L, glow, { position: P, scale: [0.035, 0.055, 0.035] });
    add(new THREE.TorusGeometry(0.06, 0.004, 4, 16), L, lift(glow, 0.5), { position: P, rotation: [0, 0, 0.6] });
    return;
  }
  if (id === 'tv_totem') {
    // PLAY-TEST 4 (S17): a TOTEM — a carved stack of three faces on a haft, a beak on top, two feathers.
    const wood2 = oc && oc !== '#9aa3ad' ? oc : '#8a6a42', paint = '#b03a2a', teal = '#2a8a8a', ZF = 0.055;
    add(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 6), L, wood, { position: [0, -0.02, ZF] });   // W4 (2026-10-21): the haft through the fist
    for (let k = 0; k < 3; k++) {
      const y = 0.11 + k * 0.065;
      add(new THREE.CylinderGeometry(0.042 - k * 0.004, 0.046 - k * 0.004, 0.06, 8), L, k % 2 ? tone(wood2, 0.85) : wood2, { position: [0, y, ZF] });
      for (const x of [-1, 1]) add(new THREE.BoxGeometry(0.012, 0.01, 0.01), L, k % 2 ? teal : paint, { position: [x * 0.016, y + 0.01, ZF + 0.043 - k * 0.004] });
      add(new THREE.BoxGeometry(0.03, 0.006, 0.01), L, '#1a1008', { position: [0, y - 0.015, ZF + 0.043 - k * 0.004] });
    }
    add(new THREE.ConeGeometry(0.02, 0.06, 4), L, paint, { position: [0, 0.31, ZF + 0.03], rotation: [Math.PI / 2, 0, 0] });
    for (const x of [-1, 1]) add(new THREE.BoxGeometry(0.012, 0.09, 0.004), L, x < 0 ? '#e8e0c8' : teal, { position: [x * 0.05, 0.3, ZF], rotation: [0, 0, -x * 0.5] });
    return;
  }
  /**
   * THE TORCH POINTS OUT PAST THE FINGERS (2026-09-25). It was built up the hand's +y — toward the
   * elbow — so with the forearm raised the flame sat on the shoulder and the stick ran back into it
   * ("an arrow in his off hand, pointing into his shoulder"). Like a blade, it now runs down -y from
   * the fist, and the grip bone tips it forward and up (REST_PITCH.torch in chibi2-motion.js).
   * A wrapped head, then a flame of two cones — a torch, not a spear point.
   */
  if (id === 'torch') {
    // OWNER REVIEW 2026-10-21 (W10): "a rounded tip — a wrapped, rag-bound round head like a film torch — instead of a
    // pointy cone". The two flame cones are gone; the head is a ball of pitch-soaked rag bound with three turns of
    // cord, charred dark at the business end. The FIRE is the game's: `createHeldFlame` / `attachHeldFlame` in
    // avatar-3d/js/held-flame.js put a flickering flame on `TORCH_FLAME_AT.torch`.
    add(profile([[-0.4, 0.02, 0.02], [0.07, 0.016, 0.016]], 6), L, wood, { position: [0, 0, 0.055] });
    rag(c, L, 0.055, -0.38, 1);
    return;
  }
  if (id === 'quiver') {
    // Worn on the back, top over the right shoulder, with a strap across the chest.
    const rot = new THREE.Euler(0.15, 0, -0.45), dir = new THREE.Vector3(0, 1, 0).applyEuler(rot), base = new THREE.Vector3(0.07 * W, 0.08 * T, -0.20 * W);
    add(new THREE.CylinderGeometry(0.06, 0.05, 0.38, 8), 'chest', oc, { position: base.toArray(), rotation: [rot.x, rot.y, rot.z] });
    const top = base.clone().addScaledVector(dir, 0.19);
    add(new THREE.TorusGeometry(0.058, 0.01, 4, 10), 'chest', trim, { position: top.toArray(), rotation: [rot.x + Math.PI / 2, rot.y, rot.z], metal: true });
    for (const [dx, dz] of [[-0.02, 0.01], [0.02, -0.01], [0, 0.025]]) {
      const from = top.clone().add(new THREE.Vector3(dx, 0, dz)).addScaledVector(dir, -0.05), to = from.clone().addScaledVector(dir, 0.17);
      polyline(c, 'chest', [from.toArray(), to.toArray()], 0.006, '#e8e0c0');
      add(new THREE.BoxGeometry(0.006, 0.05, 0.03), 'chest', '#c83a2a', { position: to.clone().addScaledVector(dir, -0.02).toArray(), rotation: [rot.x, rot.y, rot.z] });
    }
    // B10: the strap is one loop over the right shoulder, across the chest and back, through the quiver's middle
    if (!crossStrap(c, 1, 0.02, tone(oc, 0.8))) add(taperedCurve([[0.17 * W, 0.25 * T, 0.10 * W], [0.02, 0.10, 0.155 * W], [-0.16 * W, -0.07, 0.14 * W]], [0.02, 0.02, 0.02], 4, 6), 'chest', tone(oc, 0.8));
    else for (const f of [-0.08, 0.08]) add(new THREE.TorusGeometry(0.064, 0.009, 4, 10), 'chest', tone(oc, 0.6), { position: base.clone().addScaledVector(dir, f).toArray(), rotation: [rot.x + Math.PI / 2, rot.y, rot.z] });
    return;
  }
  if (id === 'map') {
    for (const s of [-1, 1]) {
      add(new THREE.BoxGeometry(0.10, 0.14, 0.006), L, oc, { position: [s * 0.045, -0.05, 0.12 - Math.abs(s) * 0.0], rotation: [0, -s * 0.35, 0] });
    }
    polyline(c, L, [[-0.08, -0.09, 0.143], [-0.04, -0.04, 0.132], [0.0, -0.06, 0.125], [0.05, -0.02, 0.132]], 0.004, '#a03030');
    return;
  }
  // every shield is strapped to the forearm, face out — see strapShield in chibi2-weapons.js
  const kind = { kite_shield: 'kite', round_shield: 'round', tower_shield: 'tower', buckler: 'buckler' }[id] || 'heater';
  strapShield(c, oc, kind, a.offhand.quality ?? 0, id === 'kite_shield' ? 'cross' : null);
}

// ---------------------------------------------------------------- scarves (accessory slot OR cape slot)
/**
 * B9 (2026-10-21 owner review). "One part near the front around the neck is see-through": every scarf's neck loop was
 * an OPEN tube whose two ends met at the front — a ring of nothing you could see into — and every tail ended in an
 * open tube mouth. The loop is a closed tube now and every tail tapers shut. Ids (all original names):
 *   scarf            the old ones — 'classic' in the accessory slot (loop + one tail), 'knit' in the cape slot (two tails)
 *   scarf_trailing   a long scarf whose two tails are thrown back over the shoulders and hang down the back
 *   scarf_cowl       a thick snood standing up round the neck, no tails
 *   scarf_striped    a knitted scarf in two colours, striped tails down the front
 *   neckerchief      a thin knotted band with a triangle of cloth hanging on the chest
 * They work in BOTH slots: `accessory.id` or `cape.id` (color = the cloth, color2 = the stripe / knot).
 */
export const SCARVES = { scarf: 1, scarf_trailing: 1, scarf_cowl: 1, scarf_striped: 1, neckerchief: 1 };
/** Lathe ring [y, rx, rz, z] at y (the body's own rings, chibi2-body.js). */
function ringAt2(rings, y) {
  if (y <= rings[0][0]) return rings[0];
  for (let i = 1; i < rings.length; i++) if (y <= rings[i][0]) { const a = rings[i - 1], b = rings[i], t = (y - a[0]) / (b[0] - a[0] || 1); return a.map((v, k) => (v || 0) + ((b[k] || 0) - (v || 0)) * t); }
  return rings[rings.length - 1];
}
/** A closed tube through `pts` (no seam, no open ends). */
function loopTube(pts, r, sides = 6, steps = 18) {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)), true), steps, r, sides, true);
}
function buildScarf(kind, col, col2, c) {
  const { add, W, T } = c, alt = col2 || lift(col, 0.45);
  const neckRing = (y, rx, rz, z0 = -0.005, n = 12, dip = 0.01) => Array.from({ length: n }, (_, k) => { const t = k / n * Math.PI * 2; return [Math.sin(t) * rx, y - Math.max(0, Math.cos(t)) * dip, Math.cos(t) * rz + z0]; });
  const front = (x, y, l) => c.chestZ ? c.chestZ(x, y, 1, l) : 0.15 * W + l;
  const back = (x, y, l) => c.chestZ ? c.chestZ(x, y, -1, l) : -(0.15 * W + l);
  /** a tail along pts, tapering shut at the end; `bands` > 0 alternates two colours along it */
  const tail = (pts, r0, r1, colour, bands = 0) => {
    if (!bands) { add(taperedCurve(pts, [r0, (r0 + r1) / 2, r1, 0.004], 5, 10), 'chest', colour); return; }
    const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)));
    for (let b = 0; b < bands; b++) {
      const t0 = b / bands, t1 = (b + 1) / bands, last = b === bands - 1;
      const seg = [0, 0.5, 1].map(f => curve.getPointAt(t0 + (t1 - t0) * f).toArray());
      const ra = r0 + (r1 - r0) * t0, rb = last ? 0.004 : r0 + (r1 - r0) * t1;
      add(taperedCurve(seg, [ra, (ra + rb) / 2, rb], 5, 3), 'chest', b % 2 ? alt : colour);
    }
  };
  if (kind === 'classic') {
    add(loopTube(neckRing(0.30 * T, 0.13 * W, 0.115 * W, 0, 12, 0.02), 0.04), 'chest', col);
    tail([[0.06 * W, 0.27 * T, 0.12 * W], [0.10 * W, 0.12 * T, front(0.1 * W, 0.12 * T, 0.03)], [0.09 * W, -0.02, front(0.09 * W, -0.02, 0.03)], [0.088 * W, -0.06, front(0.09 * W, -0.06, 0.03)]], 0.032, 0.02, col);
  } else if (kind === 'knit' || kind === 'scarf_striped') {
    const striped = kind === 'scarf_striped';
    add(loopTube(neckRing(0.3 * T, 0.12 * W, 0.1 * W), 0.044), 'chest', col);
    if (striped) for (const dy of [-0.018, 0.018]) add(loopTube(neckRing(0.3 * T + dy, 0.125 * W, 0.106 * W), 0.012, 4, 14), 'chest', alt);
    for (const [s, len] of [[-1, striped ? 0.26 : 0.2], [1, striped ? 0.18 : 0.13]]) {
      const y0 = 0.29 * T;
      tail([[s * 0.05 * W, y0, 0.12 * W], [s * 0.06 * W, y0 - len * 0.5, front(s * 0.06 * W, y0 - len * 0.5, 0.032)], [s * 0.055 * W, y0 - len, front(s * 0.055 * W, y0 - len, 0.034)], [s * 0.054 * W, y0 - len - 0.02, front(s * 0.054 * W, y0 - len - 0.02, 0.034)]], 0.035, 0.03, s < 0 ? col : tone(col, 0.88), striped ? 6 : 0);
    }
  } else if (kind === 'scarf_trailing') {
    // wound twice round the neck, then both tails thrown back over the shoulders to hang down the back, flaring out
    add(loopTube(neckRing(0.295 * T, 0.12 * W, 0.1 * W), 0.042), 'chest', col);
    add(loopTube(neckRing(0.325 * T, 0.105 * W, 0.09 * W, -0.008, 12, 0.006), 0.034), 'chest', tone(col, 0.9));
    for (const s of [-1, 1]) {
      const pts = [[s * 0.08 * W, 0.31 * T, -0.06 * W], [s * 0.1 * W, 0.22 * T, back(s * 0.1 * W, 0.22 * T, 0.03)], [s * 0.12 * W, 0.05 * T, back(s * 0.12 * W, 0.05 * T, 0.05)], [s * 0.15 * W, -0.12 * T, back(s * 0.13 * W, -0.1 * T, 0.09)]];
      tail(pts, 0.036, 0.03, s < 0 ? col : tone(col, 0.9));
      // a fringe at the end of each tail
      const end = pts[pts.length - 1];
      for (const dx of [-0.02, 0, 0.02]) add(new THREE.ConeGeometry(0.007, 0.05, 3), 'chest', alt, { position: [end[0] + dx, end[1] - 0.04, end[2]], rotation: [Math.PI, 0, 0] });
    }
  } else if (kind === 'scarf_cowl') {
    // a thick knitted snood standing up round the neck: three stacked rolls, the top one turned down a little
    add(loopTube(neckRing(0.285 * T, 0.135 * W, 0.115 * W, -0.005, 12, 0.012), 0.046, 6, 16), 'chest', col);
    add(loopTube(neckRing(0.315 * T, 0.12 * W, 0.103 * W, -0.006, 12, 0.008), 0.044, 6, 16), 'chest', tone(col, 0.92));
    add(loopTube(neckRing(0.342 * T, 0.11 * W, 0.095 * W, -0.008, 12, 0.004), 0.04, 6, 16), 'chest', col2 || col);
  } else if (kind === 'neckerchief') {
    // a thin band round the neck, knotted at the front, with a triangle of cloth hanging point-down on the chest
    add(loopTube(neckRing(0.298 * T, 0.128 * W, 0.11 * W, -0.004, 12, 0.03), 0.022, 5, 16), 'chest', col);
    const g = new THREE.PlaneGeometry(1, 1, 4, 4), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i), v = 0.5 - p.getY(i), y = 0.27 * T - v * 0.17, x = u * 2 * (1 - v) * 0.1 * W;
      p.setXYZ(i, x, y, front(x, y, 0.014 + (1 - v) * 0.006));
    }
    g.computeVertexNormals(); add(g, 'chest', col);
    add(low(), 'chest', col2 || tone(col, 0.8), { position: [0, 0.27 * T, front(0, 0.27 * T, 0.03)], scale: [0.034, 0.028, 0.022] });
    for (const s of [-1, 1]) add(new THREE.ConeGeometry(0.012, 0.06, 4), 'chest', col, { position: [s * 0.03, 0.25 * T, front(s * 0.03, 0.25 * T, 0.03)], rotation: [0, 0, Math.PI - s * 0.5] });
  }
}

// ---------------------------------------------------------------- accessories (neck, chest, wrist)
export function buildAccessory(a, c) {
  const id = a.accessory.id, ac = a.accessory.color, { add, W, T, leather } = c;
  // Over a capelet the chain rides on the capelet and the charm hangs just below its hem.
  const over = CAPELETS.includes(a.cape.id), cz = over ? 0.07 * W : 0, cy = over ? -0.03 : 0;
  const chain = color => add(taperedCurve([[-0.09 * W, 0.29 * T, 0.07 * W + cz * 0.6], [-0.08 * W, 0.19 * T, 0.14 * W + cz], [0, 0.08 * T + cy, 0.175 * W + cz], [0.08 * W, 0.19 * T, 0.14 * W + cz], [0.09 * W, 0.29 * T, 0.07 * W + cz * 0.6]], [0.006, 0.006, 0.006], 4, 12), 'chest', color, { metal: true });
  if (id === 'pendant') {
    chain(gold);
    add(new THREE.BoxGeometry(0.024, 0.08, 0.012), 'chest', ac, { position: [0, 0.035 * T + cy, 0.182 * W + cz], metal: true });
    add(new THREE.BoxGeometry(0.06, 0.022, 0.012), 'chest', ac, { position: [0, 0.052 * T + cy, 0.182 * W + cz], metal: true });
  } else if (id === 'crescent') {
    chain(silver);
    add(new THREE.TorusGeometry(0.042, 0.013, 4, 10, Math.PI * 1.35), 'chest', ac, { position: [0, 0.04 * T + cy, 0.182 * W + cz], rotation: [0, 0, 2.3], metal: true });
  } else if (SCARVES[id]) {
    // B9 (2026-10-21): every scarf is drawn by buildScarf, in either slot (accessory or cape)
    buildScarf(id === 'scarf' ? 'classic' : id, ac, a.accessory.color2, c);
  } else if (id === 'prayer_beads') {
    for (let k = 0; k < 8; k++) { const t = k / 8 * Math.PI * 2; add(gem(), 'handR', ac, { position: [Math.sin(t) * 0.074, 0.03, Math.cos(t) * 0.074], scale: [0.019, 0.019, 0.019] }); }
    add(new THREE.ConeGeometry(0.014, 0.05, 5), 'handR', '#c83a2a', { position: [0, -0.01, 0.085], rotation: [Math.PI, 0, 0] });
  } else if (id === 'bandolier') {
    // a strap from the right shoulder to the left hip with a row of bolts in loops
    // B10: one loop over the right shoulder to the left hip, front and back; the bolts sit in loops along the front run
    const pts = crossStrap(c, 1, 0.022, ac || leather);
    if (pts) {
      const fr = pts.filter(p => p[2] > 0.05 && p[1] < 0.24 * T && p[1] > -0.02);
      for (let k = 0; k < 5 && fr.length > 1; k++) { const q = fr[Math.round((k + 0.5) / 5 * (fr.length - 1))]; add(new THREE.CylinderGeometry(0.006, 0.006, 0.07, 4), 'chest', '#e8e0c0', { position: [q[0], q[1] + 0.012, q[2] + 0.02], rotation: [0, 0, 0.8] }); }
    } else {
      add(taperedCurve([[0.17 * W, 0.26 * T, 0.09 * W], [0.02, 0.1, 0.16 * W], [-0.17 * W, -0.08, 0.14 * W]], [0.022, 0.022, 0.022], 4, 8), 'chest', ac || leather);
      for (let k = 0; k < 5; k++) { const t = 0.2 + k * 0.14, x = (0.15 - t * 0.3) * W, y = 0.24 * T - t * 0.3, zz = 0.155 * W; add(new THREE.CylinderGeometry(0.006, 0.006, 0.07, 4), 'chest', '#e8e0c0', { position: [x, y + 0.02, zz + 0.02], rotation: [0, 0, 0.8] }); }
    }
  } else if (id === 'pocketwatch') {
    const at = [0.09 * W, 0.0, 0.155 * W];
    add(new THREE.CylinderGeometry(0.04, 0.04, 0.014, 10), 'chest', ac, { position: at, rotation: [Math.PI / 2, 0, 0], metal: true });
    add(new THREE.CylinderGeometry(0.03, 0.03, 0.004, 10), 'chest', '#f4f0e0', { position: [at[0], at[1], at[2] + 0.009], rotation: [Math.PI / 2, 0, 0] });
    polyline(c, 'chest', [[at[0], 0.008, at[2] + 0.013], [at[0], 0.028, at[2] + 0.013]], 0.003, '#333333');
    add(taperedCurve([[0.0, 0.09 * T, 0.16 * W], [0.05 * W, 0.0, 0.17 * W], [at[0], 0.04, at[2]]], [0.005, 0.005, 0.005], 4, 8), 'chest', gold, { metal: true });
  }
}

// ---------------------------------------------------------------- face and body marks
export function buildMarks(a, c) {
  const id = a.extras.id, xc = a.extras.color, { add, head, H, W, T, faceWidth, faceDepth } = c;
  if (id === 'soot') {
    for (const [x, y, z, sx, sy] of [[-0.19, 0.12, 0.262, 0.08, 0.035], [0.20, 0.14, 0.26, 0.06, 0.03], [0.08, 0.43, 0.245, 0.06, 0.025]]) head(new THREE.SphereGeometry(1, 10, 6), xc, { position: [x * faceWidth, y, z * faceDepth], scale: [sx, sy, 0.008] });
  } else if (id === 'war_stripe') {
    head(profile([[0.215, 0.342, 0.279], [0.29, 0.340, 0.277]], 20), xc, { scale: [faceWidth, 1, faceDepth] });
  } else if (id === 'lightning_arcs') {
    const s = lift(xc, 0.25);
    for (const side of [-1, 1]) polyline(c, 'head', [[side * 0.37, 0.55, 0.0], [side * 0.42, 0.44, 0.06], [side * 0.36, 0.37, 0.02], [side * 0.43, 0.24, 0.07]].map(p => p.map(v => v * H)), 0.012 * H, s);
    polyline(c, 'head', [[0.25, 0.58, -0.25], [0.32, 0.50, -0.30], [0.26, 0.42, -0.28], [0.34, 0.32, -0.30]].map(p => p.map(v => v * H)), 0.01 * H, s);
  } else if (id === 'chest_glow') {
    add(low(), 'chest', lift(xc, 0.3), { position: [0.06 * W, 0.17 * T, 0.15 * W], scale: [0.045, 0.045, 0.02] });
    add(new THREE.TorusGeometry(0.058, 0.012, 4, 12), 'chest', c.trim, { position: [0.06 * W, 0.17 * T, 0.152 * W], metal: true });
  }
}

// ---------------------------------------------------------------- capes
export function buildCape(a, c) {
  const id = a.cape.id, cc = a.cape.color, { add, trim, W, T } = c;
  if (id === 'none' || isG5(id)) return;
  // CHIBI 2.5: the capelet stood exactly where the shoulder is, so the top of each upper arm came through it (3-6 cm,
  // more when the arms pump). On a 2.5 body it is cut a little wider over the shoulders and the cloth over each one
  // rides that arm part of the way, so it lifts with the shoulder instead of the shoulder coming through it.
  const v25 = !!c.rig?.v25, cw = v25 ? 1.12 : 1;
  const onShoulders = v25 ? { weigh: (x, y) => { const k = THREE.MathUtils.smoothstep(Math.abs(x), 0.1 * W, 0.26 * W) * (1 - THREE.MathUtils.smoothstep(y, 0.26 * T, 0.34 * T)) * 0.95; return [['chest', 1 - k], [x < 0 ? 'armL' : 'armR', k]]; } } : {};
  const capelet = (low) => {
    add(profile([[low * T, 0.30 * W * cw, 0.215 * W * (v25 ? 1.06 : 1), -0.01], [0.22 * T, 0.29 * W * cw, 0.205 * W * (v25 ? 1.06 : 1), -0.01], [0.30 * T, 0.26 * W * (v25 ? 1.08 : 1), 0.18 * W, -0.012], [0.335 * T, 0.15, 0.12, -0.02], [0.37 * T, 0.09, 0.08, -0.02]], 16), 'chest', cc, onShoulders);
    add(profile([[low * T - 0.012, 0.305 * W * cw, 0.22 * W * (v25 ? 1.06 : 1), -0.01], [low * T + 0.01, 0.305 * W * cw, 0.22 * W * (v25 ? 1.06 : 1), -0.01]], 16), 'chest', tone(cc, 0.75), onShoulders);
  };
  if (id === 'shoulder_cape' || id === 'fur_mantle') {
    capelet(id === 'fur_mantle' ? 0.17 : 0.12);
    if (id === 'fur_mantle') for (let k = 0; k < 14; k++) { const t = k / 14 * Math.PI * 2; add(new THREE.ConeGeometry(0.03, 0.08, 4), 'chest', tone(cc, 0.8), { position: [Math.sin(t) * 0.30 * W * cw, 0.15 * T, Math.cos(t) * 0.215 * W * (v25 ? 1.06 : 1) - 0.01], rotation: [Math.PI, 0, 0], ...onShoulders }); }
    return;
  }
  if (id === 'feather_mantle') {
    capelet(0.18);
    for (let k = 0; k < 10; k++) {
      const t = k / 10 * Math.PI * 2, sx = Math.sin(t), cz = Math.cos(t);
      add(taperedCurve([[sx * 0.29 * W * cw, 0.20 * T, cz * 0.21 * W - 0.01], [sx * 0.32 * W * cw, 0.11 * T, cz * 0.235 * W - 0.01], [sx * 0.335 * W * cw, 0.03 * T, cz * 0.245 * W - 0.01]], [0.022, 0.03, 0.004], 3, 4), 'chest', k % 2 ? bone : lift(cc, 0.35), onShoulders);
    }
    return;
  }
  if (id === 'shawl') {
    // Sheer shawl: a soft roll over both shoulders with long tails down the front.
    add(taperedCurve([[-0.20 * W, 0.18 * T, 0.13 * W], [-0.22 * W, 0.29 * T, -0.02], [0, 0.31 * T, -0.15 * W], [0.22 * W, 0.29 * T, -0.02], [0.20 * W, 0.18 * T, 0.13 * W]], [0.03, 0.035, 0.04, 0.035, 0.03], 5, 14), 'chest', cc);
    for (const s of [-1, 1]) add(taperedCurve([[s * 0.20 * W, 0.18 * T, 0.13 * W], [s * 0.19 * W, 0.0, 0.16 * W], [s * 0.17 * W, -0.16, 0.15 * W]], [0.03, 0.028, 0.012], 4, 6), 'chest', lift(cc, 0.12));
    return;
  }
  if (id === 'half_cape') {
    drape(c, cc, { x: 0.12 * W, top: 0.30 * T, length: 0.62, width: 0.26 * W, bottom: 0.34 * W, zTop: -0.15 * W, zBottom: -0.28, sx: 4, sy: 6, main: true });   // (no yoke: its shoulder lump below rides the arm already)
    // the shoulder lump: on a 2.5 body it rides the right arm (like a pauldron) — on the chest the top of the arm came through it in every clip
    if (c.rig?.v25) { const sh = c.rig.byName.armR.position; add(low(), 'armR', cc, { position: [0.19 * W - sh.x, 0.27 * T - sh.y + 0.012, 0.0], scale: [0.13, 0.055, 0.175] }); }
    else add(low(), 'chest', cc, { position: [0.19 * W, 0.27 * T, 0.0], scale: [0.12, 0.05, 0.17] });
    add(low(), 'chest', trim, { position: [0.12 * W, 0.26 * T, 0.13 * W], scale: [0.025, 0.025, 0.012], metal: true });
    return;
  }
  if (id === 'travel_cloak') {
    // A TRAVEL CLOAK: long, heavy, a hood lying rolled round the neck and a brooch pinning it at the
    // left shoulder. The road-worn thing every Farhold traveller wears.
    drape(c, cc, { top: 0.31 * T, length: 0.86, width: 0.44 * W, bottom: 0.66 * W, zTop: -0.155 * W, zBottom: -0.36, sx: 6, sy: 8, ripple: 0.02, main: true, yoke: true });
    for (const sgn of [-1, 1]) drape(c, tone(cc, 0.92), { x: sgn * 0.215 * W, top: 0.3 * T, length: 0.62, width: 0.06 * W, bottom: 0.1 * W, zTop: 0.02, zBottom: -0.1, sx: 2, sy: 5 });
    const roll = [];
    for (let k = 0; k <= 10; k++) { const t = -2.3 + k / 10 * 4.6, back = Math.max(0, -Math.cos(t)); roll.push([Math.sin(t) * (0.16 + back * 0.05) * W, (0.29 + back * 0.04) * T, Math.cos(t) * (0.11 + back * 0.06) * W - 0.01]); }
    add(taperedCurve(roll, [0.035, 0.055, 0.065, 0.055, 0.035], 7, 18), 'chest', tone(cc, 0.85));
    add(new THREE.TorusGeometry(0.026, 0.009, 4, 10), 'chest', '#c8a040', { position: [-0.13 * W, 0.24 * T, 0.13 * W], metal: true });
    add(low(), 'chest', '#7a2a2a', { position: [-0.13 * W, 0.24 * T, 0.135 * W], scale: [0.016, 0.016, 0.01] });
    return;
  }
  // CHIBI 2.5 (part B): two new ids (chibi25-outfits.js CAPE25) — no existing look names them.
  if (id === 'long_cloak') {
    // a cloak to the ankle, flared well back so a stride has room; on a 2.5 body its lower half rides the skirt bones
    const len = 0.31 * T + 0.07 + (c.L || 0.53) * 0.88;
    drape(c, cc, { top: 0.31 * T, length: len, width: 0.44 * W, bottom: 0.74 * W, zTop: -0.155 * W, zBottom: -0.44, sx: 6, sy: 10, ripple: 0.022, main: true, yoke: true });
    const roll = [];
    for (let k = 0; k <= 10; k++) { const t = -2.3 + k / 10 * 4.6, back = Math.max(0, -Math.cos(t)); roll.push([Math.sin(t) * (0.16 + back * 0.05) * W, (0.29 + back * 0.04) * T, Math.cos(t) * (0.11 + back * 0.06) * W - 0.01]); }
    add(taperedCurve(roll, [0.03, 0.05, 0.06, 0.05, 0.03], 6, 16), 'chest', tone(cc, 0.82));
    for (const s of [-1, 1]) add(low(), 'chest', trim, { position: [s * 0.13 * W, 0.25 * T, 0.12 * W], scale: [0.024, 0.024, 0.012], metal: true });
    return;
  }
  if (SCARVES[id]) {
    // B9 (2026-10-21): scarves in the back slot (the cape slot) — the same builder as the accessory slot
    buildScarf(id === 'scarf' ? 'knit' : id, cc, a.cape.color2, c);
    return;
  }
  if (id === 'tattered_cape') {
    // a ragged cape: the hem torn into points, and a couple of holes' worth of darker patches
    drape(c, cc, { top: 0.30 * T, length: 0.72, width: 0.4 * W, bottom: 0.58 * W, zTop: -0.15 * W, zBottom: -0.3, sx: 8, sy: 7, ripple: 0.018, tatter: 0.09, main: true, yoke: true });
    add(taperedCurve([[-0.17 * W, 0.29 * T, -0.02], [0, 0.31 * T, -0.145 * W], [0.17 * W, 0.29 * T, -0.02]], [0.025, 0.028, 0.025], 5, 8), 'chest', tone(cc, 0.8));
    return;
  }
  // Full cape: shoulders to above the knees, flaring back so the legs clear it when walking.
  drape(c, cc, { top: 0.30 * T, length: 0.70, width: 0.40 * W, bottom: 0.60 * W, zTop: -0.15 * W, zBottom: -0.32, main: true, yoke: true });
  add(taperedCurve([[-0.17 * W, 0.29 * T, -0.02], [0, 0.31 * T, -0.145 * W], [0.17 * W, 0.29 * T, -0.02]], [0.03, 0.032, 0.03], 5, 8), 'chest', cc);
  for (const s of [-1, 1]) add(low(), 'chest', trim, { position: [s * 0.14 * W, 0.27 * T, 0.10 * W], scale: [0.026, 0.026, 0.014], metal: true });
}

// ---------------------------------------------------------------- legs: greaves and boot cuffs
export function buildLegGear(a, c) {
  // (Boot shafts and cuffs are part of the leg now — chibi2-body.js — so only armour is added here.)
  const { add, L } = c, k = c.LW || 1;
  for (const side of ['L', 'R']) {
    const knee = 'knee' + side;
    if (a.bottom.id === 'greaves') {
      add(profile([[-L * 0.40, 0.098 * k, 0.10 * k, 0.012], [-L * 0.22, 0.108 * k, 0.112 * k, 0.016], [-0.06, 0.112 * k, 0.114 * k, 0.014], [-0.02, 0.10 * k, 0.10 * k, 0.01]], 10), knee, a.bottom.color, { metal: true });
      add(low(), knee, a.bottom.color, { position: [0, 0.0, 0.085 * k], scale: [0.07, 0.06, 0.035], metal: true });
    }
  }
}

// ---------------------------------------------------------------- decorations (slot `decor`)
export function buildDecor(a, c) {
  const id = a.decor?.id || 'none', dc = a.decor?.color || '#6a4a2a', { add, head, trim, leather, steel, W, T, H } = c;
  if (id === 'none') return;
  const beltItem = [-0.16 * W, -0.07, 0.215 * W];
  const hanger = (to) => polyline(c, 'hips', [[-0.13 * W, 0.03, 0.155 * W], [to[0], to[1] + 0.07, to[2] - 0.01]], 0.005, '#8a8a90', { metal: true });
  switch (id) {
    case 'pauldrons':
      for (const [side, s] of [['L', -1], ['R', 1]]) {
        const arm = 'arm' + side;
        add(profile([[-0.10, 0.152, 0.142], [-0.045, 0.158, 0.148], [0.03, 0.135, 0.128], [0.085, 0.075, 0.072], [0.105, 0.004, 0.004]], 12), arm, dc, { position: [s * 0.03, 0, 0], metal: true });
        add(profile([[-0.15, 0.13, 0.125], [-0.09, 0.145, 0.138]], 12), arm, tone(dc, 0.8), { position: [s * 0.02, 0, 0], metal: true });
        add(profile([[-0.108, 0.16, 0.15], [-0.092, 0.16, 0.15]], 12), arm, trim, { position: [s * 0.03, 0, 0], metal: true });
        add(new THREE.ConeGeometry(0.03, 0.11, 6), arm, tone(dc, 0.7), { position: [s * 0.075, 0.12, 0], rotation: [0, 0, -s * 0.55], metal: true });
        for (const zz of [-0.07, 0.07]) add(gem(), arm, '#d8d8d8', { position: [s * 0.03, -0.04, zz * 1.9], scale: [0.013, 0.013, 0.013], metal: true });
      }
      break;
    case 'tabard': {
      for (const [zs, ry] of [[1, 0], [-1, Math.PI]]) {
        const front = new THREE.PlaneGeometry(0.19 * W, 0.44, 1, 3);
        // (2026-10-21: the reversed copies sat on the same surface and flickered now the material is double-sided — gone)
        add(front, 'chest', dc, { position: [0, 0.06 * T, zs * 0.18 * W], rotation: [0, ry, 0] });
        const skirt = new THREE.PlaneGeometry(0.19 * W, 0.24, 1, 2);
        add(skirt, 'hips', dc, { position: [0, -0.12, zs * 0.205 * W], rotation: [zs * -0.08, ry, 0] });
        add(new THREE.BoxGeometry(0.19 * W, 0.018, 0.008), 'hips', trim, { position: [0, -0.235, zs * 0.215 * W], metal: true });
      }
      add(new THREE.OctahedronGeometry(1), 'chest', trim, { position: [0, 0.10 * T, 0.188 * W], scale: [0.05, 0.07, 0.01], metal: true });
      add(new THREE.OctahedronGeometry(1), 'chest', tone(dc, 0.6), { position: [0, 0.10 * T, 0.194 * W], scale: [0.026, 0.038, 0.006] });
      break;
    }
    case 'knife_rig':
      add(profile([[-0.135, 0.109, 0.108], [-0.105, 0.109, 0.108]], 10), 'legR', tone(dc, 0.9));
      for (const [zz, dy] of [[0.035, 0], [-0.03, 0.02]]) {
        add(new THREE.BoxGeometry(0.028, 0.14, 0.036), 'legR', '#2a2a2a', { position: [0.118, -0.18 + dy, zz], rotation: [0, 0, 0.08] });
        add(new THREE.BoxGeometry(0.022, 0.055, 0.026), 'legR', dc, { position: [0.113, -0.085 + dy, zz] });
        add(gem(), 'legR', steel, { position: [0.112, -0.052 + dy, zz], scale: [0.014, 0.014, 0.014], metal: true });
      }
      break;
    case 'scroll_case': {
      const rot = [0, 0, 0.5], pos = [0.02, 0.02 * T, -0.19 * W];
      add(new THREE.CylinderGeometry(0.045, 0.045, 0.38, 8), 'chest', dc, { position: pos, rotation: rot });
      const dir = new THREE.Vector3(0, 1, 0).applyEuler(new THREE.Euler(...rot));
      for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.05, 0.05, 0.035, 8), 'chest', gold, { position: new THREE.Vector3(...pos).addScaledVector(dir, s * 0.19).toArray(), rotation: rot, metal: true });
      if (!crossStrap(c, 1, 0.018, tone(dc, 0.7))) add(taperedCurve([[0.17 * W, 0.25 * T, 0.10 * W], [0.02, 0.10, 0.155 * W], [-0.16 * W, -0.07, 0.14 * W]], [0.018, 0.018, 0.018], 4, 6), 'chest', tone(dc, 0.7));
      break;
    }
    case 'belt_lantern': {
      const [x, y, zz] = beltItem;
      hanger(beltItem);
      add(new THREE.CylinderGeometry(0.036, 0.036, 0.075, 8), 'hips', glowWarm, { position: [x, y, zz] });
      for (let k = 0; k < 4; k++) { const t = k / 4 * Math.PI * 2 + 0.4; polyline(c, 'hips', [[x + Math.sin(t) * 0.04, y - 0.04, zz + Math.cos(t) * 0.04], [x + Math.sin(t) * 0.04, y + 0.04, zz + Math.cos(t) * 0.04]], 0.006, dc, { metal: true }); }
      add(new THREE.ConeGeometry(0.052, 0.045, 8), 'hips', dc, { position: [x, y + 0.062, zz], metal: true });
      add(new THREE.CylinderGeometry(0.05, 0.05, 0.014, 8), 'hips', dc, { position: [x, y - 0.045, zz], metal: true });
      break;
    }
    /**
     * A torch hung on the belt, for when the off hand is already holding a shield. The torch itself
     * is drawn in `buildOffhand`; this is the same stick and flame on a hip bracket, so a player
     * carrying a light and a shield can still see that they are carrying a light.
     *
     * (Both this and `wisp_lamp` below are chibi2-only parts — see CHIBI2_ONLY_PARTS in chibi2.js,
     * without which the 2D catalogue's normaliser throws an id it does not know back to 'none'.)
     */
    case 'belt_torch': {
      const [x, y, zz] = beltItem;
      hanger(beltItem);
      add(new THREE.CylinderGeometry(0.014, 0.017, 0.2, 6), 'hips', leather, { position: [x, y - 0.02, zz], rotation: [0.25, 0, 0.18] });
      add(new THREE.CylinderGeometry(0.03, 0.024, 0.05, 8), 'hips', steel, { position: [x + 0.012, y + 0.072, zz - 0.02], metal: true });
      add(new THREE.ConeGeometry(0.035, 0.09, 6), 'hips', '#ff8c2a', { position: [x + 0.014, y + 0.13, zz - 0.024], metal: true });
      break;
    }
    /**
     * A WISP LAMP on the belt: a glass jar with a small cold thing in it, hung off a bracket. The
     * lantern above it is warm and square; this is round and cold, so a player can tell at a glance
     * which light they are carrying.
     */
    case 'wisp_lamp': {
      const [x, y, zz] = beltItem;
      hanger(beltItem);
      const cold = a.decor?.color || '#7fd4ff';
      // the jar
      add(new THREE.SphereGeometry(0.052, 10, 7), 'hips', cold, { position: [x, y, zz] });
      // the thing inside it
      add(gem(), 'hips', '#ffffff', { position: [x, y, zz], scale: [0.018, 0.024, 0.018] });
      // brass cap, base and the three bands down the glass
      add(new THREE.CylinderGeometry(0.03, 0.038, 0.028, 8), 'hips', steel, { position: [x, y + 0.058, zz], metal: true });
      add(new THREE.CylinderGeometry(0.042, 0.042, 0.016, 8), 'hips', steel, { position: [x, y - 0.052, zz], metal: true });
      for (let k = 0; k < 3; k++) {
        const t = k / 3 * Math.PI * 2 + 0.5;
        polyline(c, 'hips', [
          [x + Math.sin(t) * 0.05, y - 0.05, zz + Math.cos(t) * 0.05],
          [x + Math.sin(t) * 0.05, y + 0.05, zz + Math.cos(t) * 0.05],
        ], 0.005, steel, { metal: true });
      }
      break;
    }
    case 'belt_pouches':
      // two leather pouches on the belt, one each side of the buckle, with flaps and a toggle
      for (const sx of [-1, 1]) {
        const x = sx * 0.12 * W, y = -0.06, zz = (c.hipsZ ? c.hipsZ(x, y, 1, 0.04) : 0.19 * W);
        add(new THREE.BoxGeometry(0.085, 0.09, 0.05), 'hips', dc, { position: [x, y, zz], rotation: [0, sx * 0.35, 0] });
        add(new THREE.BoxGeometry(0.09, 0.04, 0.056), 'hips', tone(dc, 0.75), { position: [x, y + 0.03, zz + 0.002], rotation: [0.12, sx * 0.35, 0] });
        add(gem(), 'hips', bone, { position: [x + sx * 0.004, y + 0.01, zz + 0.03], scale: [0.008, 0.014, 0.008] });
      }
      break;
    case 'bedroll_pack': {
      // a canvas pack on the back with a rolled blanket strapped across the top, and two shoulder straps
      const zz = -0.2 * W;
      add(new THREE.BoxGeometry(0.28 * W, 0.26, 0.12), 'chest', dc, { position: [0, 0.07 * T, zz] });
      add(new THREE.BoxGeometry(0.29 * W, 0.09, 0.125), 'chest', tone(dc, 0.8), { position: [0, 0.16 * T, zz - 0.002] });
      add(new THREE.CylinderGeometry(0.06, 0.06, 0.4 * W, 10), 'chest', '#8a6a4a', { position: [0, 0.27 * T, zz + 0.01], rotation: [0, 0, Math.PI / 2] });
      for (const x of [-0.12, 0.12]) add(new THREE.TorusGeometry(0.062, 0.008, 4, 10), 'chest', leather, { position: [x * W, 0.27 * T, zz + 0.01], rotation: [0, Math.PI / 2, 0] });
      // B10: each strap from the pack's top, over the shoulder, down the chest, under the arm and back to the pack's foot
      for (const sx of [-1, 1]) packStrap(c, sx, { topY: 0.16 * T, topZ: zz + 0.06, botY: 0.07 * T - 0.12, botZ: zz + 0.06, colour: leather });
      break;
    }
    case 'waterskin': {
      // a leather water bag hanging at the right hip on a strap from the left shoulder
      const x = 0.19 * W, y = -0.08, zz = 0.1 * W;
      add(low(), 'hips', dc, { position: [x, y, zz], scale: [0.06, 0.09, 0.045] });
      add(new THREE.CylinderGeometry(0.014, 0.018, 0.04, 6), 'hips', '#2a2a2a', { position: [x, y + 0.1, zz] });
      // B10: the strap is one loop over the LEFT shoulder to the bag at the right hip
      if (!crossStrap(c, -1, 0.013, tone(dc, 0.7))) add(taperedCurve([[-0.15 * W, 0.27 * T, 0.1 * W], [0.02, 0.1, 0.16 * W], [0.17 * W, -0.06, 0.13 * W]], [0.013, 0.013, 0.013], 4, 6), 'chest', tone(dc, 0.7));
      else polyline(c, 'hips', [[0.2 * W, 0.06, 0.06 * W], [x, y + 0.11, zz]], 0.008, tone(dc, 0.7));
      break;
    }
    case 'trophy_belt':
      // a war belt hung with what it has taken: teeth, a small skull and fur tails
      add(taperedCurve([[-0.21 * W, 0.02, 0.1 * W], [0, -0.01, 0.18 * W], [0.21 * W, 0.02, 0.1 * W]], [0.018, 0.018, 0.018], 4, 10), 'hips', leather);
      for (let k = 0; k < 7; k++) { const x = (-0.15 + k * 0.05) * W, zz = 0.175 * W - Math.abs(x) * 0.25; add(new THREE.ConeGeometry(0.012, 0.05, 4), 'hips', bone, { position: [x, -0.04, zz], rotation: [Math.PI, 0, 0] }); }
      add(low(), 'hips', bone, { position: [0.12 * W, -0.06, 0.17 * W], scale: [0.032, 0.036, 0.03] });
      for (const sx of [-1, 1]) add(gem(), 'hips', '#1c1c1c', { position: [0.12 * W + sx * 0.012, -0.055, 0.197 * W], scale: [0.008, 0.009, 0.004] });
      for (const x of [-0.16, 0.2]) add(taperedCurve([[x * W, -0.01, 0.12 * W], [x * W * 1.05, -0.12, 0.13 * W], [x * W * 1.02, -0.22, 0.12 * W]], [0.022, 0.018, 0.004], 5, 5), 'hips', dc);
      break;
    case 'bone_charms':
      add(taperedCurve([[-0.20 * W, 0.03, 0.12 * W], [0, -0.01, 0.17 * W], [0.20 * W, 0.03, 0.12 * W]], [0.008, 0.008, 0.008], 4, 10), 'hips', dc);
      for (const x of [-0.10, -0.05, 0.05, 0.10]) {
        const zz = 0.165 * W - Math.abs(x) * 0.1;
        add(new THREE.BoxGeometry(0.014, 0.07, 0.012), 'hips', bone, { position: [x * W, -0.04, zz] });
        for (const s of [-1, 1]) add(gem(), 'hips', bone, { position: [x * W + s * 0.009, -0.078, zz], scale: [0.011, 0.011, 0.011] });
      }
      add(low(), 'hips', bone, { position: [0, -0.045, 0.178 * W], scale: [0.03, 0.032, 0.028] });
      for (const s of [-1, 1]) add(gem(), 'hips', '#1c1c1c', { position: [s * 0.011, -0.04, 0.178 * W + 0.026], scale: [0.008, 0.009, 0.004] });
      break;
    case 'rune_bracers':
      for (const side of ['L', 'R']) {
        const elbow = 'elbow' + side;
        add(profile([[-0.16 * T, 0.086, 0.09], [-0.12 * T, 0.093, 0.097], [-0.07 * T, 0.088, 0.092]], 10), elbow, dc, { metal: true });
        for (const y of [-0.09, -0.115, -0.14]) add(new THREE.BoxGeometry(0.03, 0.01, 0.008), elbow, '#7fe8ff', { position: [0, y * T, 0.097], rotation: [0, 0, y * 20] });
      }
      break;
    case 'chained_tome': {
      const [x, y, zz] = beltItem;
      hanger(beltItem);
      add(new THREE.BoxGeometry(0.11, 0.14, 0.04), 'hips', dc, { position: [x, y - 0.01, zz], rotation: [0, 0.2, -0.12] });
      add(new THREE.BoxGeometry(0.10, 0.125, 0.03), 'hips', parchment, { position: [x + 0.008, y - 0.01, zz], rotation: [0, 0.2, -0.12] });
      add(low(), 'hips', gold, { position: [x, y - 0.01, zz + 0.022], scale: [0.02, 0.02, 0.006], metal: true });
      break;
    }
    case 'herb_satchel': {
      const [x, y, zz] = beltItem;
      // B10: one loop over the right shoulder to the left hip, and a short drop from it to the bag on the belt
      if (!crossStrap(c, 1, 0.018, leather)) add(taperedCurve([[0.17 * W, 0.25 * T, 0.10 * W], [0.03, 0.12, 0.155 * W], [-0.15 * W, -0.06, 0.14 * W]], [0.018, 0.018, 0.018], 4, 6), 'chest', leather);
      else polyline(c, 'hips', [[-0.19 * W, 0.07, 0.1 * W], [x - 0.02, y + 0.05, zz - 0.01]], 0.012, leather);
      add(new THREE.BoxGeometry(0.12, 0.10, 0.06), 'hips', dc, { position: [x, y - 0.01, zz - 0.01], rotation: [0, 0.2, 0] });
      add(new THREE.BoxGeometry(0.125, 0.045, 0.066), 'hips', tone(dc, 0.75), { position: [x, y + 0.03, zz - 0.008], rotation: [0.15, 0.2, 0] });
      for (const [dx, h] of [[-0.03, 0.09], [0.01, 0.12], [0.04, 0.08]]) {
        polyline(c, 'hips', [[x + dx, y + 0.04, zz - 0.02], [x + dx * 1.6, y + 0.04 + h, zz - 0.02]], 0.006, '#3aa35a');
        add(low(), 'hips', '#3aa35a', { position: [x + dx * 1.6, y + 0.04 + h, zz - 0.02], scale: [0.02, 0.012, 0.014] });
      }
      break;
    }
    case 'rune_halo':
      // Matches the 2D halo: a ring about 1.3 head-radii across, centred just above the head centre and set behind
      // the head (and behind a raised hood, whose back reaches z -0.40) so it frames the head from the front.
      head(new THREE.TorusGeometry(0.50, 0.016, 4, 28), dc, { position: [0, 0.33, -0.44], metal: true });
      for (let k = 0; k < 8; k++) { const t = k / 8 * Math.PI * 2; head(new THREE.OctahedronGeometry(1), k % 2 ? dc : lift(dc, 0.35), { position: [Math.sin(t) * 0.50, 0.33 + Math.cos(t) * 0.50, -0.44], scale: [0.034, 0.046, 0.014], rotation: [0, 0, -t], metal: true }); }
      head(new THREE.TorusGeometry(0.44, 0.006, 3, 24), lift(dc, 0.3), { position: [0, 0.33, -0.45], metal: true });
      break;
    case 'prayer_ribbons':
      for (const [x, tilt, len] of [[-0.13, 0.08, 0.26], [-0.06, -0.05, 0.22], [0.06, 0.05, 0.22], [0.13, -0.08, 0.26]]) {
        add(new THREE.BoxGeometry(0.035, len, 0.006), 'chest', dc, { position: [x * W, (0.10 - len / 2) * T, 0.168 * W], rotation: [-0.1, 0, tilt] });
      }
      for (const x of [-0.13, 0.13]) add(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 8), 'chest', '#b03030', { position: [x * W, 0.105 * T, 0.175 * W], rotation: [Math.PI / 2, 0, 0] });
      break;
    case 'ember_censer': {
      const [x, y, zz] = beltItem;
      hanger(beltItem);
      add(low(), 'hips', dc, { position: [x, y, zz], scale: [0.05, 0.048, 0.05], metal: true });
      add(new THREE.TorusGeometry(0.052, 0.008, 4, 10), 'hips', trim, { position: [x, y, zz], rotation: [Math.PI / 2, 0, 0], metal: true });
      for (const [dx, dy] of [[-0.02, 0.01], [0.02, 0.01], [0, -0.022]]) add(gem(), 'hips', '#ff8c2a', { position: [x + dx, y + dy, zz + 0.045], scale: [0.012, 0.012, 0.008] });
      add(new THREE.ConeGeometry(0.03, 0.04, 6), 'hips', tone(dc, 0.7), { position: [x, y + 0.062, zz], metal: true });
      break;
    }
    case 'storm_rods':
      for (const s of [-1, 1]) {
        const base = [s * 0.14 * W, -0.04 * T, -0.225 * W], rot = [0, 0, -s * 0.2], dir = new THREE.Vector3(0, 1, 0).applyEuler(new THREE.Euler(...rot));
        add(profile([[0, 0.016, 0.016], [0.62, 0.012, 0.012]], 6), 'chest', dc, { position: base, rotation: rot, metal: true });
        const tip = new THREE.Vector3(...base).addScaledVector(dir, 0.66);
        add(low(), 'chest', '#4ad0ff', { position: tip.toArray(), scale: [0.035, 0.035, 0.035] });
        for (const t of [0.2, 0.5]) add(new THREE.TorusGeometry(0.022, 0.006, 3, 8), 'chest', trim, { position: new THREE.Vector3(...base).addScaledVector(dir, t).toArray(), rotation: [Math.PI / 2 + rot[0], 0, rot[2]], metal: true });
        polyline(c, 'chest', [tip.toArray(), tip.clone().add(new THREE.Vector3(s * 0.04, 0.05, 0.01)).toArray(), tip.clone().add(new THREE.Vector3(-s * 0.01, 0.09, 0)).toArray(), tip.clone().add(new THREE.Vector3(s * 0.03, 0.14, 0.01)).toArray()], 0.007, lift('#4ad0ff', 0.3));
      }
      // B10: the rods hang from a pair of shoulder straps (it was a front arc that stopped in the air under each arm; a band
      // right round the chest would run through the arms, which hang exactly there)
      if (c.wrap) for (const s of [-1, 1]) packStrap(c, s, { topY: 0.2 * T, topZ: -0.215 * W, botY: -0.06 * T, botZ: -0.21 * W, r: 0.014, colour: leather });
      else add(taperedCurve([[-0.20 * W, 0.22 * T, 0.08 * W], [0, 0.20 * T, 0.155 * W], [0.20 * W, 0.22 * T, 0.08 * W]], [0.016, 0.016, 0.016], 4, 6), 'chest', leather);
      break;
    case 'gear_pack': {
      add(new THREE.BoxGeometry(0.30 * W, 0.28, 0.11), 'chest', dc, { position: [0, 0.10 * T, -0.215 * W] });
      add(new THREE.BoxGeometry(0.31 * W, 0.03, 0.115), 'chest', tone(dc, 0.7), { position: [0, 0.14 * T, -0.215 * W] });
      for (const [x, y, r] of [[-0.17 * W, 0.18 * T, 0.07], [0.16 * W, 0.02 * T, 0.055]]) {
        const zz = -0.215 * W;
        add(new THREE.CylinderGeometry(r, r, 0.03, 10), 'chest', '#b8a060', { position: [x, y, zz], rotation: [0, 0, Math.PI / 2], metal: true });
        for (let k = 0; k < 6; k++) { const t = k / 6 * Math.PI * 2; add(new THREE.BoxGeometry(0.028, 0.03, 0.03), 'chest', '#b8a060', { position: [x, y + Math.cos(t) * (r + 0.012), zz + Math.sin(t) * (r + 0.012)], rotation: [t, 0, 0], metal: true }); }
      }
      add(taperedCurve([[0.10 * W, 0.24 * T, -0.24 * W], [0.14 * W, 0.40 * T, -0.20 * W], [0.19 * W, 0.44 * T, -0.08]], [0.022, 0.02, 0.018], 5, 5), 'chest', '#8a8a8a', { metal: true });
      add(low(), 'chest', glowWarm, { position: [0.19 * W, 0.44 * T, -0.07], scale: [0.03, 0.03, 0.03] });
      // B10: real shoulder straps — pack top, over the shoulder, down the chest, under the arm, back to the pack
      for (const s of [-1, 1]) packStrap(c, s, { topY: 0.10 * T + 0.1, topZ: -0.215 * W + 0.06, botY: 0.10 * T - 0.13, botZ: -0.215 * W + 0.06, colour: leather });
      break;
    }
    case 'bead_necklace': {
      const over = CAPELETS.includes(a.cape.id), oz = over ? 0.075 * W : 0, oy = over ? -0.05 : 0;
      for (let k = 0; k <= 12; k++) {
        const t = k / 12, ang = (t - 0.5) * Math.PI * 1.25, drop = Math.cos((t - 0.5) * Math.PI);
        add(gem(), 'chest', k % 3 ? dc : tone(dc, 0.7), { position: [Math.sin(ang) * (0.13 * W + oz * 0.8), (0.29 - drop * 0.16) * T + oy * drop, Math.cos(ang) * 0.10 + drop * (0.07 * W + oz)], scale: [0.026, 0.026, 0.026] });
      }
      add(gem(), 'chest', dc, { position: [0, 0.10 * T + oy, 0.18 * W + oz], scale: [0.04, 0.04, 0.035] });
      add(new THREE.ConeGeometry(0.022, 0.08, 6), 'chest', '#c83a2a', { position: [0, 0.03 * T + oy, 0.18 * W + oz], rotation: [Math.PI, 0, 0] });
      break;
    }
  }
}

/**
 * Everything in a hand is skinned to that hand's GRIP bone (see createRig), which is how a clip can
 * point a blade forward, roll the wrist through a cut, or put the weapon away for a wave.
 */
function gripped(c) {
  return { ...c, add: (g, bone, color, o = {}) => c.add(g, bone, color, { ...o, skinTo: o.skinTo || (bone === 'handR' ? 'gripR' : bone === 'handL' || bone === 'elbowL' ? 'gripL' : undefined) }) };
}

/**
 * A second weapon in the off hand: the same builder as the main hand, moved onto the left hand.
 * `swap` exchanges the two hands' bones, so a builder written for the right hand lands in the left.
 */
function buildOffhandWeapon(a, c) {
  const swap = b => b === 'handR' ? 'handL' : b === 'handL' ? 'handR' : b === 'elbowR' ? 'elbowL' : b;
  const cc = { ...c, add: (g, bone, color, o = {}) => c.add(g, swap(bone), color, o) };
  buildHeld({ ...a, held: { ...a.offhand } }, cc);
}

/** All gear in build order. `c` carries add/head helpers, body scale factors and shared colours. */
export function buildGear(a, c) {
  buildLegGear(a, c);
  buildMarks(a, c);
  buildAccessory(a, c);
  buildCape(a, c);
  buildDecor(a, c);
  const g = gripped(c);
  // W11 (owner review 2026-10-21): nothing is held in the off hand with a two-hander (a worn quiver is not held)
  if (!offhandAllowed(a.held?.id, a.offhand?.id)) a = { ...a, offhand: { ...a.offhand, id: 'none' } };
  buildHeld(a, g);
  if (HELD_WEAPON_IDS.includes(a.offhand.id) && a.offhand.id !== 'dagger') buildOffhandWeapon(a, g);
  else buildOffhand(a, g);
}
