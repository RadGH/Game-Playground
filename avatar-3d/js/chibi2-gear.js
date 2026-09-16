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

const low = () => new THREE.SphereGeometry(1, 8, 5);
const gem = () => new THREE.IcosahedronGeometry(1, 0);
const tone = (c, k) => '#' + new THREE.Color(c).multiplyScalar(k).getHexString();
const lift = (c, k) => '#' + new THREE.Color(c).lerp(new THREE.Color('#ffffff'), k).getHexString();
const gold = '#d8b040', bone = '#e8e0c8', silver = '#c8c8d8', parchment = '#efe6cc', wood = '#5a3a1a', glowWarm = '#ffd27a';
const CAPELETS = ['shoulder_cape', 'fur_mantle', 'feather_mantle'];
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
function drape(c, color, { x = 0, top, length, width, bottom, zTop, zBottom, sx = 5, sy = 7, ripple = 0.012 }) {
  const g = new THREE.PlaneGeometry(1, 1, sx, sy), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i), v = 0.5 - p.getY(i);
    p.setXYZ(i, x + u * THREE.MathUtils.lerp(width, bottom, v), top - v * length, THREE.MathUtils.lerp(zTop, zBottom, v) + Math.cos(u * 18) * ripple * v);
  }
  g.computeVertexNormals();
  const back = backface(g);
  c.add(g, 'chest', color); c.add(back, 'chest', color);
}

// ---------------------------------------------------------------- held (right hand)
export function buildHeld(a, c) {
  const id = a.held.id, hc = a.held.color, { add, trim, leather, steel } = c;
  if (id === 'none') return;
  const R = 'handR', z = 0.055;
  const shaft = (bone, from, to, r, color) => add(profile([[from, r, r], [to, r, r]], 8), bone, color, { position: [0, 0, z] });
  const sword = (bone, len) => {
    shaft(bone, -0.135, 0.085, 0.019, leather);
    add(profile([[-len, 0.002, 0.002], [-len * 0.78, 0.055, 0.018], [-0.14, 0.043, 0.017]], 4), bone, steel, { position: [0, -0.025, z], metal: true });
    add(taperedCurve([[-0.10, -0.115, z], [0, -0.095, z], [0.10, -0.115, z]], [0.021, 0.021, 0.021], 4, 4), bone, trim, { metal: true });
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
    shaft(R, -0.08, 0.08, 0.02, leather);
    add(taperedCurve([[0, -0.42, z], [0.18, 0, z], [0, 0.42, z]], [0.018, 0.028, 0.018], 5, 6), R, hc, { metal: true });
    polyline(c, R, [[0, -0.42, z], [0, 0.42, z]], 0.004, '#e8e0c0'); return;
  }
  if (id === 'crossbow') {
    add(new THREE.BoxGeometry(0.05, 0.055, 0.36), R, wood, { position: [0, -0.07, 0.19] });
    add(taperedCurve([[-0.19, -0.05, 0.30], [0, -0.04, 0.36], [0.19, -0.05, 0.30]], [0.012, 0.02, 0.012], 5, 6), R, hc, { metal: true });
    polyline(c, R, [[-0.19, -0.05, 0.30], [0, -0.04, 0.22], [0.19, -0.05, 0.30]], 0.004, '#e8e0c0');
    polyline(c, R, [[0, -0.035, 0.20], [0, -0.035, 0.40]], 0.007, steel, { metal: true });
    add(new THREE.ConeGeometry(0.014, 0.04, 5), R, steel, { position: [0, -0.035, 0.42], rotation: [Math.PI / 2, 0, 0], metal: true }); return;
  }
  if (id === 'greataxe') {
    shaft(R, -0.55, 0.55, 0.02, wood);
    const right = [[0.02, 0.08], [0.12, 0.10], [0.25, 0.18], [0.21, 0.06], [0.21, -0.06], [0.25, -0.18], [0.12, -0.10], [0.02, -0.08]];
    add(extrude(right, 0.02), R, hc, { position: [0, 0.44, z], metal: true });
    add(extrude(right.map(([x, y]) => [-x, y]).reverse(), 0.02), R, hc, { position: [0, 0.44, z], metal: true });
    add(new THREE.ConeGeometry(0.025, 0.09, 5), R, hc, { position: [0, 0.58, z], metal: true }); return;
  }
  if (/hammer/.test(id)) {
    const big = id === 'warhammer';
    shaft(R, big ? -0.55 : -0.14, big ? 0.55 : 0.36, 0.02, wood);
    add(new THREE.BoxGeometry(big ? 0.30 : 0.24, 0.14, 0.14), R, hc, { position: [0, big ? 0.46 : 0.40, z], metal: true });
    if (big) add(new THREE.ConeGeometry(0.035, 0.12, 5), R, hc, { position: [0.20, 0.46, z], rotation: [0, 0, -Math.PI / 2], metal: true });
    return;
  }
  if (id === 'mace') {
    shaft(R, -0.14, 0.34, 0.02, wood);
    add(new THREE.DodecahedronGeometry(0.11, 0), R, hc, { position: [0, 0.42, z], metal: true });
    for (const [x, y, zz, rx, rz] of [[0.11, 0.42, 0, 0, -1.57], [-0.11, 0.42, 0, 0, 1.57], [0, 0.53, 0, 0, 0], [0, 0.42, 0.11, 1.57, 0], [0, 0.42, -0.11, -1.57, 0]]) add(new THREE.ConeGeometry(0.025, 0.07, 4), R, hc, { position: [x, y, z + zz], rotation: [rx, 0, rz], metal: true });
    return;
  }
  if (id === 'daggers') { sword(R, 0.34); sword('handL', 0.34); return; }
  if (id === 'rapier') {
    shaft(R, -0.12, 0.08, 0.017, '#333333');
    add(profile([[-0.68, 0.003, 0.003], [-0.14, 0.012, 0.012]], 5), R, steel, { position: [0, -0.025, z], metal: true });
    add(new THREE.SphereGeometry(0.065, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2), R, silver, { position: [0, -0.13, z], rotation: [Math.PI, 0, 0], metal: true });
    add(taperedCurve([[0, -0.13, z + 0.065], [0, -0.02, z + 0.09], [0, 0.07, z + 0.03]], [0.008, 0.008, 0.008], 4, 5), R, silver, { metal: true }); return;
  }
  if (id === 'saber') {
    shaft(R, -0.12, 0.08, 0.018, '#222222');
    add(extrude([[0.02, -0.12], [0.012, -0.36], [-0.035, -0.53], [-0.11, -0.64], [-0.065, -0.50], [-0.028, -0.34], [-0.026, -0.12]], 0.012), R, hc, { position: [0, -0.02, z], rotation: [0, Math.PI / 2, 0], metal: true });
    add(taperedCurve([[0, -0.12, z - 0.07], [0, -0.14, z], [0, -0.12, z + 0.07]], [0.016, 0.02, 0.016], 4, 4), R, silver, { metal: true }); return;
  }
  if (id === 'cleaver') {
    shaft(R, -0.14, 0.07, 0.022, '#8a6a3a');
    add(new THREE.BoxGeometry(0.018, 0.27, 0.14), R, hc, { position: [0, -0.28, z + 0.05], metal: true });
    add(new THREE.BoxGeometry(0.022, 0.05, 0.03), R, tone(hc, 0.6), { position: [0, -0.22, z + 0.12], metal: true });
    add(new THREE.TorusGeometry(0.025, 0.007, 4, 8), R, steel, { position: [0, 0.09, z], metal: true }); return;
  }
  if (id === 'lute') {
    add(low(), R, hc, { position: [0, -0.28, 0.19], scale: [0.13, 0.17, 0.065] });
    add(low(), R, lift(hc, 0.4), { position: [0, -0.28, 0.25], scale: [0.115, 0.15, 0.012] });
    add(low(), R, '#241810', { position: [0, -0.25, 0.262], scale: [0.03, 0.03, 0.004] });
    add(new THREE.BoxGeometry(0.045, 0.32, 0.03), R, tone(hc, 0.7), { position: [0, -0.02, 0.21] });
    add(new THREE.BoxGeometry(0.05, 0.08, 0.035), R, tone(hc, 0.6), { position: [0, 0.17, 0.19], rotation: [-0.5, 0, 0] });
    polyline(c, R, [[-0.012, -0.36, 0.262], [-0.012, 0.13, 0.228]], 0.003, '#e8e0c0');
    polyline(c, R, [[0.012, -0.36, 0.262], [0.012, 0.13, 0.228]], 0.003, '#e8e0c0'); return;
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
  if (id === 'none') return;
  if (id === 'dagger') { add(profile([[-0.22, 0.015, 0.015], [0.15, 0.015, 0.015]], 5), L, steel, { position: [0, 0.01, 0.08], metal: true }); return; }
  if (id === 'book') { add(new THREE.BoxGeometry(0.16, 0.20, 0.035), L, oc, { position: [0, 0.02, 0.10] }); return; }
  if (id === 'orb') { add(new THREE.SphereGeometry(0.11, 10, 6), L, oc, { position: [0, 0.16, 0.12], metal: true }); return; }
  if (id === 'torch') { add(profile([[-0.28, 0.018, 0.018], [0.18, 0.018, 0.018]], 6), L, leather, { position: [0, 0.02, 0.08] }); add(new THREE.ConeGeometry(0.11, 0.22, 6), L, '#ff8c2a', { position: [0, 0.29, 0.08], metal: true }); return; }
  if (id === 'round_shield') { add(new THREE.CylinderGeometry(0.22, 0.22, 0.045, 12), L, oc, { position: [0, 0.02, 0.10], rotation: [Math.PI / 2, 0, 0], metal: true }); return; }
  if (id === 'tower_shield') { add(new THREE.BoxGeometry(0.30, 0.50, 0.06), L, oc, { position: [0, -0.02, 0.10], metal: true }); return; }
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
    add(taperedCurve([[0.17 * W, 0.25 * T, 0.10 * W], [0.02, 0.10, 0.155 * W], [-0.16 * W, -0.07, 0.14 * W]], [0.02, 0.02, 0.02], 4, 6), 'chest', tone(oc, 0.8));
    return;
  }
  if (id === 'map') {
    for (const s of [-1, 1]) {
      add(new THREE.BoxGeometry(0.10, 0.14, 0.006), L, oc, { position: [s * 0.045, -0.05, 0.12 - Math.abs(s) * 0.0], rotation: [0, -s * 0.35, 0] });
    }
    polyline(c, L, [[-0.08, -0.09, 0.143], [-0.04, -0.04, 0.132], [0.0, -0.06, 0.125], [0.05, -0.02, 0.132]], 0.004, '#a03030');
    return;
  }
  const shieldShape = id === 'kite_shield'
    ? [[0, -0.36], [-0.17, -0.02], [-0.16, 0.14], [-0.09, 0.22], [0, 0.24], [0.09, 0.22], [0.16, 0.14], [0.17, -0.02]]
    : null;
  const shape = new THREE.Shape();
  if (shieldShape) { shape.moveTo(...shieldShape[0]); for (const p of shieldShape.slice(1)) shape.lineTo(...p); shape.closePath(); }
  else { shape.moveTo(0, -0.27); shape.lineTo(-0.18, -0.05); shape.lineTo(-0.18, 0.17); shape.quadraticCurveTo(0, 0.24, 0.18, 0.17); shape.lineTo(0.18, -0.05); shape.closePath(); }
  const options = { depth: id === 'buckler' ? 0.025 : 0.035, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.014, bevelSegments: 1, steps: 1, curveSegments: 5 };
  add(new THREE.ExtrudeGeometry(shape, options), L, trim, { position: [0, 0.02, 0.083], metal: true });
  add(new THREE.ExtrudeGeometry(shape, options), L, oc, { position: [0, 0.02, 0.13], scale: [0.84, 0.84, 0.3] });
  if (id === 'kite_shield') {
    add(new THREE.BoxGeometry(0.04, 0.44, 0.012), L, '#f4f4f4', { position: [0, -0.05, 0.152] });
    add(new THREE.BoxGeometry(0.24, 0.04, 0.012), L, '#f4f4f4', { position: [0, 0.07, 0.153] });
  } else add(new THREE.OctahedronGeometry(0.065), L, steel, { position: [0, 0.025, 0.153], scale: [0.7, 1.1, 0.25], metal: true });
}

// ---------------------------------------------------------------- accessories (neck, chest, wrist)
export function buildAccessory(a, c) {
  const id = a.accessory.id, ac = a.accessory.color, { add, W, T } = c;
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
  } else if (id === 'scarf') {
    const loop = [];
    for (let k = 0; k <= 10; k++) { const t = k / 10 * Math.PI * 2; loop.push([Math.sin(t) * 0.13, (0.30 + Math.max(0, Math.cos(t)) * -0.02) * T, Math.cos(t) * 0.115]); }
    add(taperedCurve(loop, [0.04, 0.04, 0.04], 6, 16), 'chest', ac);
    add(taperedCurve([[0.06, 0.27 * T, 0.12 * W], [0.10 * W, 0.12 * T, 0.165 * W], [0.09 * W, -0.02, 0.17 * W]], [0.032, 0.026, 0.02], 5, 6), 'chest', ac);
  } else if (id === 'prayer_beads') {
    for (let k = 0; k < 8; k++) { const t = k / 8 * Math.PI * 2; add(gem(), 'handR', ac, { position: [Math.sin(t) * 0.074, 0.03, Math.cos(t) * 0.074], scale: [0.019, 0.019, 0.019] }); }
    add(new THREE.ConeGeometry(0.014, 0.05, 5), 'handR', '#c83a2a', { position: [0, -0.01, 0.085], rotation: [Math.PI, 0, 0] });
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
  if (id === 'none') return;
  const capelet = (low) => {
    add(profile([[low * T, 0.30 * W, 0.215 * W, -0.01], [0.22 * T, 0.29 * W, 0.205 * W, -0.01], [0.30 * T, 0.26 * W, 0.18 * W, -0.012], [0.335 * T, 0.15, 0.12, -0.02], [0.37 * T, 0.09, 0.08, -0.02]], 16), 'chest', cc);
    add(profile([[low * T - 0.012, 0.305 * W, 0.22 * W, -0.01], [low * T + 0.01, 0.305 * W, 0.22 * W, -0.01]], 16), 'chest', tone(cc, 0.75));
  };
  if (id === 'shoulder_cape' || id === 'fur_mantle') {
    capelet(id === 'fur_mantle' ? 0.17 : 0.12);
    if (id === 'fur_mantle') for (let k = 0; k < 14; k++) { const t = k / 14 * Math.PI * 2; add(new THREE.ConeGeometry(0.03, 0.08, 4), 'chest', tone(cc, 0.8), { position: [Math.sin(t) * 0.30 * W, 0.15 * T, Math.cos(t) * 0.215 * W - 0.01], rotation: [Math.PI, 0, 0] }); }
    return;
  }
  if (id === 'feather_mantle') {
    capelet(0.18);
    for (let k = 0; k < 10; k++) {
      const t = k / 10 * Math.PI * 2, sx = Math.sin(t), cz = Math.cos(t);
      add(taperedCurve([[sx * 0.29 * W, 0.20 * T, cz * 0.21 * W - 0.01], [sx * 0.32 * W, 0.11 * T, cz * 0.235 * W - 0.01], [sx * 0.335 * W, 0.03 * T, cz * 0.245 * W - 0.01]], [0.022, 0.03, 0.004], 3, 4), 'chest', k % 2 ? bone : lift(cc, 0.35));
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
    drape(c, cc, { x: 0.12 * W, top: 0.30 * T, length: 0.62, width: 0.26 * W, bottom: 0.34 * W, zTop: -0.15 * W, zBottom: -0.28, sx: 4, sy: 6 });
    add(low(), 'chest', cc, { position: [0.19 * W, 0.27 * T, 0.0], scale: [0.12, 0.05, 0.17] });
    add(low(), 'chest', trim, { position: [0.12 * W, 0.26 * T, 0.13 * W], scale: [0.025, 0.025, 0.012], metal: true });
    return;
  }
  // Full cape: shoulders to above the knees, flaring back so the legs clear it when walking.
  drape(c, cc, { top: 0.30 * T, length: 0.70, width: 0.40 * W, bottom: 0.60 * W, zTop: -0.15 * W, zBottom: -0.32 });
  add(taperedCurve([[-0.17 * W, 0.29 * T, -0.02], [0, 0.31 * T, -0.145 * W], [0.17 * W, 0.29 * T, -0.02]], [0.03, 0.032, 0.03], 5, 8), 'chest', cc);
  for (const s of [-1, 1]) add(low(), 'chest', trim, { position: [s * 0.14 * W, 0.27 * T, 0.10 * W], scale: [0.026, 0.026, 0.014], metal: true });
}

// ---------------------------------------------------------------- legs: greaves and boot cuffs
export function buildLegGear(a, c) {
  const { add, L } = c;
  for (const side of ['L', 'R']) {
    const knee = 'knee' + side;
    if (a.bottom.id === 'greaves') {
      add(profile([[-L * 0.40, 0.098, 0.10, 0.012], [-L * 0.22, 0.108, 0.112, 0.016], [-0.06, 0.112, 0.114, 0.014], [-0.02, 0.10, 0.10, 0.01]], 10), knee, a.bottom.color, { metal: true });
      add(low(), knee, a.bottom.color, { position: [0, 0.0, 0.085], scale: [0.07, 0.06, 0.035], metal: true });
    } else if (a.shoes.id === 'boots') {
      add(profile([[-0.08, 0.112, 0.111], [-0.03, 0.12, 0.118], [-0.018, 0.105, 0.104]], 10), knee, tone(a.shoes.color, 0.8));
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
        const front = new THREE.PlaneGeometry(0.19 * W, 0.44, 1, 3), fb = backface(front);
        add(front, 'chest', dc, { position: [0, 0.06 * T, zs * 0.18 * W], rotation: [0, ry, 0] }); add(fb, 'chest', dc, { position: [0, 0.06 * T, zs * 0.18 * W], rotation: [0, ry, 0] });
        const skirt = new THREE.PlaneGeometry(0.19 * W, 0.24, 1, 2), sb = backface(skirt);
        add(skirt, 'hips', dc, { position: [0, -0.12, zs * 0.205 * W], rotation: [zs * -0.08, ry, 0] }); add(sb, 'hips', dc, { position: [0, -0.12, zs * 0.205 * W], rotation: [zs * -0.08, ry, 0] });
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
      add(taperedCurve([[0.17 * W, 0.25 * T, 0.10 * W], [0.02, 0.10, 0.155 * W], [-0.16 * W, -0.07, 0.14 * W]], [0.018, 0.018, 0.018], 4, 6), 'chest', tone(dc, 0.7));
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
      add(taperedCurve([[0.17 * W, 0.25 * T, 0.10 * W], [0.03, 0.12, 0.155 * W], [-0.15 * W, -0.06, 0.14 * W]], [0.018, 0.018, 0.018], 4, 6), 'chest', leather);
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
      add(taperedCurve([[-0.20 * W, 0.22 * T, 0.08 * W], [0, 0.20 * T, 0.155 * W], [0.20 * W, 0.22 * T, 0.08 * W]], [0.016, 0.016, 0.016], 4, 6), 'chest', leather);
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
      for (const s of [-1, 1]) add(taperedCurve([[s * 0.11 * W, 0.30 * T, 0.0], [s * 0.15 * W, 0.24 * T, 0.12 * W], [s * 0.13 * W, 0.02 * T, 0.15 * W]], [0.016, 0.016, 0.016], 4, 6), 'chest', leather);
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

/** All gear in build order. `c` carries add/head helpers, body scale factors and shared colours. */
export function buildGear(a, c) {
  buildLegGear(a, c);
  buildMarks(a, c);
  buildAccessory(a, c);
  buildCape(a, c);
  buildDecor(a, c);
  buildHeld(a, c);
  buildOffhand(a, c);
}
