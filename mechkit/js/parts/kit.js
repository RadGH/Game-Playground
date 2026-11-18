// The Mech Kit's building blocks: cached geometry, the four makers' materials (with paint regions marked for the
// paint mask), and each maker's own way of drawing an armour block, a limb, a joint and a light — so one leg or arm
// drawer gives four looks (sleek / chunky / rounded / scrap).
//
// Conventions (every part file follows them):
//   units are City Kit tiles (1 = 16 m); a mech is ~0.75 tall. y is up. A part faces +x; its right side is +z.
//   side = +1 builds the right-hand copy, −1 the left (z is multiplied by side, so nothing is mirrored by scale).
//   Paint: materials from paint(mk, 'primary' | 'secondary' | 'accent') carry userData.paint; the baker draws them in a
//   neutral grey and renders a mask (R primary, G secondary, B accent) so the game tints them at run time.
//   Lights: glow(mk) / glowOf(colour) materials carry userData.glow (City Kit's neonMat), so the night layer shines.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { neonMat } from '../../../citykit/js/kit/materials.js';

export const MAKERS = {
  celerity:  { look: 'sleek',   glow: '#3ff0ff', metal: 0.45, rough: 0.32 },
  brannoch:  { look: 'chunky',  glow: '#ffb02e', metal: 0.35, rough: 0.6 },
  calyx:     { look: 'rounded', glow: '#7dff9a', metal: 0.18, rough: 0.36 },
  patchwork: { look: 'scrap',   glow: '#ff6a2a', metal: 0.3,  rough: 0.82 },
};
/** The grey the paint regions are baked in; the runtime tint divides by it (bake-mech.js). */
export const PAINT_BASE = '#cccccc';

// ---------- the visual registry ----------
export const VISUALS = {};
/** Register visuals keyed by part id (the same ids as data/parts.json). */
export function addParts(map) { Object.assign(VISUALS, map); }

// ---------- materials ----------
const MC = new Map();
const cached = (k, make) => { if (!MC.has(k)) MC.set(k, make()); return MC.get(k); };
export function paint(mk, region) {
  const s = MAKERS[mk];
  return cached(`paint:${mk}:${region}`, () => {
    const m = new THREE.MeshStandardMaterial({ color: PAINT_BASE, metalness: s.metal, roughness: s.rough + (region === 'secondary' ? 0.08 : 0) });
    m.userData.paint = region; return m;
  });
}
/** Unpainted metal: joints, pistons, frames. tone 'dark' | 'steel' | 'rubber' | 'rust' | 'brass' | 'black'. */
export function metal(tone = 'dark') {
  const T = { dark: ['#2e3238', 0.55, 0.5], steel: ['#9aa1aa', 0.8, 0.32], rubber: ['#1d1e22', 0, 0.9], rust: ['#7c4527', 0.25, 0.9], brass: ['#b0893f', 0.8, 0.35], black: ['#16181c', 0.4, 0.55], gun: ['#43484f', 0.7, 0.4] }[tone];
  return cached(`metal:${tone}`, () => new THREE.MeshStandardMaterial({ color: T[0], metalness: T[1], roughness: T[2] }));
}
export const glow = (mk, dayGlow = 0.65) => neonMat(MAKERS[mk].glow, dayGlow);
export const glowOf = (color, dayGlow = 0.65) => neonMat(color, dayGlow);
/** A visor or lens: dark glass that glows the maker's colour at night and a little by day. */
export function lens(mk, dayGlow = 0.8) { return neonMat(MAKERS[mk].glow, dayGlow); }

/** Everything a drawer needs for one maker. */
export function kitOf(mk) {
  return { mk, look: MAKERS[mk].look, P: paint(mk, 'primary'), S: paint(mk, 'secondary'), A: paint(mk, 'accent'),
    D: metal('dark'), M: metal('steel'), R: metal('rubber'), K: metal('black'), U: metal('rust'), B: metal('brass'), N: metal('gun'), G: glow(mk), L: lens(mk) };
}

// ---------- geometry ----------
const GC = new Map();
export const geo = (k, make) => { if (!GC.has(k)) GC.set(k, make()); return GC.get(k); };
const f3 = v => v.toFixed(3);
export function put(parent, g, m, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o;
}
/** Centred box. */
export function box(parent, w, h, d, m, x = 0, y = 0, z = 0) { return put(parent, geo(`b${f3(w)}:${f3(h)}:${f3(d)}`, () => new THREE.BoxGeometry(w, h, d)), m, x, y, z); }
/** Centred box with rounded edges (r = radius). */
export function rbox(parent, w, h, d, r, m, x = 0, y = 0, z = 0, seg = 2) {
  r = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  return put(parent, geo(`rb${f3(w)}:${f3(h)}:${f3(d)}:${f3(r)}:${seg}`, () => new RoundedBoxGeometry(w, h, d, seg, r)), m, x, y, z);
}
/** Centred box with every edge chamfered flat (c = chamfer size): the sleek maker's faceted plate. */
export function cbox(parent, w, h, d, c, m, x = 0, y = 0, z = 0) {
  c = Math.min(c, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  const g = geo(`cb${f3(w)}:${f3(h)}:${f3(d)}:${f3(c)}`, () => {
    const iw = w / 2 - c, ih = h / 2 - c;
    const s = new THREE.Shape([[-iw, -ih], [iw, -ih], [iw, ih], [-iw, ih]].map(([a, b]) => new THREE.Vector2(a, b)));
    const e = new THREE.ExtrudeGeometry(s, { depth: Math.max(1e-4, d - 2 * c), bevelEnabled: true, bevelThickness: c, bevelSize: c, bevelSegments: 1, curveSegments: 1 });
    e.translate(0, 0, -(d - 2 * c) / 2); e.computeVertexNormals(); return e;
  });
  return put(parent, g, m, x, y, z);
}
/**
 * A side profile in the x-y plane (points [x, y]) pushed out along z to `depth`, centred on z = 0, edges bevelled.
 * The workhorse for wedges, fins, visors and blades.
 */
export function prism(parent, key, pts, depth, m, bevel = 0.004, x = 0, y = 0, z = 0) {
  const g = geo(`pr:${key}:${f3(depth)}:${f3(bevel)}`, () => {
    const sh = new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b)));
    const d = Math.max(1e-4, depth - bevel * 2);
    const e = new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 8 });
    e.translate(0, 0, -d / 2); e.computeVertexNormals(); return e;
  });
  return put(parent, g, m, x, y, z);
}
/** A profile in the x-z plane (top view, points [x, z]) pushed UP along y by `height`, bottom at y. */
export function slabTop(parent, key, pts, height, m, bevel = 0.003, x = 0, y = 0, z = 0) {
  const o = prism(parent, 'top:' + key, pts.map(([a, b]) => [a, -b]), height, m, bevel, x, y + height / 2, z);
  o.rotation.x = -Math.PI / 2; return o;
}
/** Cylinder along an axis ('x' | 'y' | 'z'), centred. rt = top radius (toward +axis). */
export function cyl(parent, r, len, m, axis = 'y', x = 0, y = 0, z = 0, { rt = r, seg = 16, open = false } = {}) {
  const o = put(parent, geo(`cy${f3(r)}:${f3(rt)}:${f3(len)}:${seg}:${open}`, () => new THREE.CylinderGeometry(rt, r, len, seg, 1, open)), m, x, y, z);
  if (axis === 'x') o.rotation.z = -Math.PI / 2; else if (axis === 'z') o.rotation.x = Math.PI / 2;
  return o;
}
/** Ellipsoid. */
export function ball(parent, rx, ry, rz, m, x = 0, y = 0, z = 0, seg = 18) {
  const o = put(parent, geo(`sp${seg}`, () => new THREE.SphereGeometry(1, seg, Math.ceil(seg * 0.65))), m, x, y, z); o.scale.set(rx, ry, rz); return o;
}
/** Half ellipsoid (dome) with its flat side at y, bulging up. */
export function dome(parent, rx, ry, rz, m, x = 0, y = 0, z = 0, seg = 18) {
  const o = put(parent, geo(`dm${seg}`, () => new THREE.SphereGeometry(1, seg, Math.ceil(seg / 2), 0, Math.PI * 2, 0, Math.PI / 2)), m, x, y, z); o.scale.set(rx, ry, rz); return o;
}
/** Capsule along an axis, total length len (including the round ends). */
export function capsule(parent, r, len, m, axis = 'y', x = 0, y = 0, z = 0) {
  const o = put(parent, geo(`cap${f3(r)}:${f3(len)}`, () => new THREE.CapsuleGeometry(r, Math.max(1e-4, len - 2 * r), 6, 14)), m, x, y, z);
  if (axis === 'x') o.rotation.z = -Math.PI / 2; else if (axis === 'z') o.rotation.x = Math.PI / 2;
  return o;
}
/** Torus lying in the plane across `axis`. */
export function ring(parent, r, tube, m, axis = 'y', x = 0, y = 0, z = 0) {
  const o = put(parent, geo(`to${f3(r)}:${f3(tube)}`, () => new THREE.TorusGeometry(r, tube, 8, 28)), m, x, y, z);
  if (axis === 'y') o.rotation.x = Math.PI / 2; else if (axis === 'x') o.rotation.y = Math.PI / 2;
  return o;
}

// ---------- maths ----------
export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
/** A rod (tapered cylinder) from a to b ([x,y,z] arrays). */
export function rod(parent, a, b, r0, r1, m, sides = 10) {
  const d = V(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const len = d.length();
  const g = geo(`rod${f3(r0)}:${f3(r1)}:${sides}`, () => { const c = new THREE.CylinderGeometry(r1, r0, 1, sides); c.translate(0, 0.5, 0); return c; });
  const o = put(parent, g, m, a[0], a[1], a[2]); o.scale.y = Math.max(len, 1e-4); if (len > 1e-6) o.quaternion.setFromUnitVectors(UP, d.normalize()); return o;
}
/**
 * A group whose origin is at a, whose +y axis points from a toward b, and whose +z stays as close as it can to
 * `lateral` (so plates on a limb keep facing out). Build the limb's pieces inside it: y runs 0 … len.
 */
export function along(parent, a, b, lateral = [0, 0, 1]) {
  const A = V(...a), Y = V(...b).sub(A); const len = Y.length(); Y.normalize();
  let Z = V(...lateral); Z.addScaledVector(Y, -Z.dot(Y)); if (Z.lengthSq() < 1e-8) Z.set(1, 0, 0); Z.normalize();
  const X = V().crossVectors(Y, Z).normalize();
  const g = new THREE.Group(); g.position.copy(A);
  g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
  parent.add(g); g.userData.len = len; return g;
}
/** A group at p turned by Euler angles (x, y, z), for building rotated sub-assemblies. */
export function at(parent, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.set(rx, ry, rz); parent.add(g); return g; }

/** Two-bone IK: the knee for a limb from hip to foot (lengths L1, L2), bending toward `bend`. Returns [knee, foot]. */
export function ik(hip, foot, L1, L2, bend) {
  const H = V(...hip); let F = V(...foot);
  let d = F.clone().sub(H); let len = d.length();
  const max = (L1 + L2) * 0.999, min = Math.abs(L1 - L2) + 1e-3;
  if (len > max) { F = H.clone().addScaledVector(d.normalize(), max); d = F.clone().sub(H); len = max; }
  if (len < min) { F = H.clone().addScaledVector(d.normalize(), min); d = F.clone().sub(H); len = min; }
  const dir = d.clone().divideScalar(len);
  const a = (L1 * L1 - L2 * L2 + len * len) / (2 * len);
  const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  const b = V(...bend); b.addScaledVector(dir, -b.dot(dir)); if (b.lengthSq() < 1e-8) b.set(1, 0, 0); b.normalize();
  const K = H.clone().addScaledVector(dir, a).addScaledVector(b, h);
  return [[K.x, K.y, K.z], [F.x, F.y, F.z]];
}
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp01 = x => Math.max(0, Math.min(1, x));
export const ease = x => { x = clamp01(x); return x * x * (3 - 2 * x); };
export const TAU = Math.PI * 2;

// =====================================================================================================================
// Maker shape language. Every drawer calls these instead of choosing shapes itself, so the four makers stay distinct.

/** An armour block, centred. */
export function block(K, parent, w, h, d, m, x = 0, y = 0, z = 0) {
  switch (K.look) {
    case 'sleek':   return cbox(parent, w, h, d, Math.min(w, h, d) * 0.28, m, x, y, z);
    case 'chunky':  return rbox(parent, w, h, d, Math.min(w, h, d) * 0.14, m, x, y, z);
    case 'rounded': return rbox(parent, w, h, d, Math.min(w, h, d) * 0.46, m, x, y, z, 4);
    default:        return box(parent, w, h, d, m, x, y, z);
  }
}
/** A joint (hinge) at p, its axle along z. */
export function joint(K, parent, p, r, m = K.D) {
  const [x, y, z] = p;
  switch (K.look) {
    case 'sleek':   cyl(parent, r * 0.8, r * 1.6, m, 'z', x, y, z, { seg: 10 }); break;
    case 'chunky':  cyl(parent, r * 1.05, r * 2.2, m, 'z', x, y, z, { seg: 14 }); cyl(parent, r * 0.55, r * 2.5, K.M, 'z', x, y, z, { seg: 10 }); break;
    case 'rounded': ball(parent, r * 1.05, r * 1.05, r * 1.05, K.S, x, y, z, 14); break;
    default:        cyl(parent, r, r * 1.8, m, 'z', x, y, z, { seg: 8 }); cyl(parent, r * 0.45, r * 2.3, K.U, 'z', x, y, z, { seg: 6 });
  }
}
/**
 * A limb segment from a to b of thickness t: the maker's armour around a rod. outward = which way the limb's face
 * points (for plates). Returns the `along` group (y runs 0 … len).
 */
export function limb(K, parent, a, b, t, { lateral = [0, 0, 1], m = K.P, trim = K.S, face = 1, seed = 0 } = {}) {
  const g = along(parent, a, b, lateral); const len = g.userData.len;
  switch (K.look) {
    case 'sleek': {
      // a narrow blade of armour, wider at the top, with a glowing seam down its front
      cbox(g, t * 0.7, len * 0.62, t * 0.9, t * 0.12, K.D, 0, len * 0.5, 0);
      prism(g, `slk-limb:${f3(len)}:${f3(t)}`, [[-t * 0.55, len * 0.12], [t * 0.75, len * 0.18], [t * 0.5, len * 0.86], [-t * 0.38, len * 0.92]], t * 1.05, m, Math.min(0.004, t * 0.12));
      box(g, t * 0.1, len * 0.5, t * 0.22, K.G, t * 0.66, len * 0.5, 0);
      break;
    }
    case 'chunky': {
      // a thick slab with a hydraulic ram beside it
      rbox(g, t * 1.15, len * 0.7, t * 1.2, t * 0.16, m, 0, len * 0.5, 0);
      rbox(g, t * 0.5, len * 0.4, t * 1.32, t * 0.1, trim, -t * 0.2, len * 0.5, 0);
      cyl(g, t * 0.17, len * 0.62, K.M, 'y', t * 0.68, len * 0.5, 0, { seg: 8 });
      cyl(g, t * 0.26, len * 0.3, K.D, 'y', t * 0.68, len * 0.32, 0, { seg: 8 });
      break;
    }
    case 'rounded': {
      // a smooth capsule with ring joints
      capsule(g, t * 0.6, len * 0.92, m, 'y', 0, len * 0.5, 0);
      ball(g, t * 0.66, len * 0.2, t * 0.66, trim, 0, len * 0.16, 0, 14);
      break;
    }
    default: {
      // scrap: an exposed tube with a mismatched plate strapped on and a hose
      cyl(g, t * 0.3, len * 0.95, K.D, 'y', 0, len * 0.5, 0, { seg: 8 });
      const pl = box(g, t * 0.95, len * 0.55, t * 0.95, (seed & 1) ? m : trim, t * 0.08, len * (0.45 + 0.08 * ((seed >> 1) & 1)), 0); pl.rotation.y = 0.15 * face; pl.rotation.z = 0.05;
      box(g, t * 1.05, t * 0.18, t * 1.05, K.U, t * 0.08, len * 0.3, 0);
      box(g, t * 1.05, t * 0.18, t * 1.05, K.U, t * 0.08, len * 0.66, 0);
      cyl(g, t * 0.08, len * 0.8, K.R, 'y', -t * 0.42, len * 0.5, t * 0.25, { seg: 6 });
    }
  }
  return g;
}
/** A small light: a strip (sleek), a round lamp (chunky / scrap) or a pod (rounded). Faces +x. */
export function lamp(K, parent, x, y, z, s = 0.012, m = K.G) {
  switch (K.look) {
    case 'sleek':   return box(parent, s * 0.5, s * 0.4, s * 2.2, m, x, y, z);
    case 'rounded': return ball(parent, s * 0.8, s * 0.8, s * 0.8, m, x, y, z, 10);
    default:        cyl(parent, s * 1.05, s * 0.7, K.D, 'x', x - s * 0.2, y, z, { seg: 12 }); return cyl(parent, s * 0.8, s * 0.4, m, 'x', x + s * 0.2, y, z, { seg: 12 });
  }
}
/** Hazard stripes on a face: n accent bars slanted across a dark strip (x-facing face at x, size w (z) × h (y)). */
export function hazard(K, parent, x, y, z, w, h, n = 4) {
  box(parent, 0.004, h, w, K.K, x, y, z);
  const step = w / n;
  for (let i = 0; i < n; i++) { const b = box(parent, 0.006, h * 1.3, step * 0.45, K.A, x + 0.001, y, z - w / 2 + step * (i + 0.5)); b.rotation.x = 0.7; b.scale.y = 0.8; }
}
/** Vent grille: a few dark slats on a face looking +x. */
export function vents(K, parent, x, y, z, w, h, n = 3) {
  for (let i = 0; i < n; i++) box(parent, 0.006, h / (n * 1.8), w, K.K, x, y - h / 2 + (i + 0.5) * h / n, z);
}
/** Mark everything under `root` as cast/receive shadow and tag it with a part key. */
export function finish(root, key) { root.userData.partKey = key; return root; }
