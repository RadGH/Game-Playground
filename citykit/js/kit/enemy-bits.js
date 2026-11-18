// Shared pieces for the posable enemy recipes (swarm.js, army.js): small mesh builders, limb maths (two-bone IK, gait
// steps), flying debris for death animations, and `poseable()` — the wrapper that turns a draw function into a model
// with the City Kit pose contract plus the extras enemies need:
//   userData.pose(anim, phase 0..1, heading)   rebuild the model for one frame, facing a world heading (atan2(dz, dx))
//   userData.face(aim)                         turn a turret / upper body to a world heading, independent of the hull
//   userData.only(layer | null)                show one layer ('hull' / 'turret'), so a hull and a turret bake apart
//                                              and the game combines any hull facing with any turret facing; the
//                                              frame of the whole model is unchanged, so both pictures share an anchor
//   userData.breakPart(name, on = true)        a boss part shot off (the model shows a stump instead)
//   userData.parts                             the breakable part names
//   userData.muzzles()                         → [{ name, x, y, z }] every `muzzle*` marker in model space, for spawning
//                                              projectiles where the barrel / nozzle really is
// The model is drawn nose along +x before turning; the ground origin is its footprint centre.
import * as THREE from 'three';
import { bodyMat, neonMat } from './shapes.js';
import { shade } from './materials.js';
export { neonMat, shade };

// ---------- geometry cache + builders ----------
const G = new Map();
export const geo = (k, make) => { if (!G.has(k)) G.set(k, make()); return G.get(k); };
export function put(parent, g, m, x = 0, y = 0, z = 0) { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o; }
/** A box by its centre. */
export function cbox(parent, w, h, d, m, x = 0, y = 0, z = 0) { return put(parent, geo(`b${w.toFixed(4)}:${h.toFixed(4)}:${d.toFixed(4)}`, () => new THREE.BoxGeometry(w, h, d)), m, x, y, z); }
const UP = new THREE.Vector3(0, 1, 0);
/** A tapered rod from point a to point b (radius r0 at a, r1 at b). Points are [x, y, z]. */
export function seg(parent, a, b, r0, r1, m, sides = 8) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const len = d.length();
  const g = geo(`s${r0.toFixed(4)}:${r1.toFixed(4)}:${sides}`, () => { const c = new THREE.CylinderGeometry(r1, r0, 1, sides); c.translate(0, 0.5, 0); return c; });
  const o = put(parent, g, m, a[0], a[1], a[2]); o.scale.y = Math.max(len, 1e-4); if (len > 1e-6) o.quaternion.setFromUnitVectors(UP, d.normalize()); return o;
}
/** A stretched sphere. */
export function ball(parent, r, m, x, y, z, sx = 1, sy = 1, sz = 1, s = 14) {
  const o = put(parent, geo(`sp${s}`, () => new THREE.SphereGeometry(1, s, Math.ceil(s * 0.6))), m, x, y, z); o.scale.set(r * sx, r * sy, r * sz); return o;
}
/** A dome (upper half of a stretched sphere) sitting on y: nothing below it, for things that rest on the ground. */
export function hemi(parent, r, m, x, y, z, sx = 1, sy = 1, sz = 1, s = 18) {
  const o = put(parent, geo(`hemi${s}`, () => new THREE.SphereGeometry(1, s, Math.ceil(s / 3), 0, Math.PI * 2, 0, Math.PI / 2)), m, x, y, z); o.scale.set(r * sx, r * sy, r * sz); return o;
}
/** A pointed spike from a (base, width w) to b. */
export function spike(parent, a, b, w, m, sides = 6) { return seg(parent, a, b, w, 0.0005, m, sides); }
/** A flat disc / short cylinder standing on its axis (y), centred at (x, y, z). */
export function disc(parent, r, h, m, x = 0, y = 0, z = 0, s = 16) { return put(parent, geo(`c${r.toFixed(4)}:${h.toFixed(4)}:${s}`, () => new THREE.CylinderGeometry(r, r, h, s)), m, x, y, z); }
/** A wheel: a short cylinder on its side (axis z) with a hub bar so the turn reads. spin = wheel angle. */
export function wheel(parent, r, w, m, hub, x, y, z, spin = 0) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.z = -spin; parent.add(g);
  const t = disc(g, r, w, m, 0, 0, 0, 14); t.rotation.x = Math.PI / 2;
  const s = Math.sign(z) || 1;
  const h = disc(g, r * 0.55, 0.004, hub, 0, 0, s * (w / 2 + 0.001), 10); h.rotation.x = Math.PI / 2;
  cbox(g, r * 1.0, r * 0.18, 0.004, m, 0, 0, s * (w / 2 + 0.003));
  return g;
}
/** A flat ring lying on the ground plane (or any y). */
export function ringFlat(parent, r, tube, m, x, y, z) { const o = put(parent, geo(`t${r.toFixed(3)}:${tube.toFixed(3)}`, () => new THREE.TorusGeometry(r, tube, 6, 32)), m, x, y, z); o.rotation.x = Math.PI / 2; o.castShadow = false; return o; }
/** A side profile (x along the length, y up) pushed out sideways to `depth`, centred on z = 0, softly bevelled. */
export function profile(parent, key, pts, depth, m, bevel = 0.004) {
  const g = geo(`prof:${key}`, () => {
    const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const e = new THREE.ExtrudeGeometry(sh, { depth: depth - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 6 });
    e.translate(0, 0, -(depth - bevel * 2) / 2); e.computeVertexNormals(); return e;
  });
  return put(parent, g, m);
}
/** An empty marker (projectile spawn point) — named 'muzzle' or 'muzzle:<n>'. */
export function marker(parent, name, x, y, z) { const o = new THREE.Object3D(); o.name = name; o.position.set(x, y, z); parent.add(o); return o; }
/** A named child group (layers, breakable parts). */
export function group(parent, name = '', x = 0, y = 0, z = 0) { const g = new THREE.Group(); g.name = name; g.position.set(x, y, z); parent.add(g); return g; }

// ---------- maths ----------
export const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const arr = v => [v.x, v.y, v.z];
export const clamp01 = x => Math.max(0, Math.min(1, x));
export const ease = x => { x = clamp01(x); return x * x * (3 - 2 * x); };
export const lerp = (a, b, t) => a + (b - a) * t;
export const lerpV = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const TAU = Math.PI * 2;
/** 0 → 1 → 0 bump over [a, b]. */
export const bump = (t, a, b) => (t <= a || t >= b) ? 0 : Math.sin(Math.PI * (t - a) / (b - a));

/** Two-bone IK: the knee for a limb hip → foot (bone lengths L1, L2), bending toward `bend`. Returns [knee, foot]. */
export function ik(hip, foot, L1, L2, bend) {
  const H = V(...hip); let F = V(...foot);
  let d = F.clone().sub(H); let len = d.length();
  const max = (L1 + L2) * 0.999, min = Math.abs(L1 - L2) + 1e-3;
  if (len > max) { F = H.clone().addScaledVector(d.normalize(), max); d = F.clone().sub(H); len = max; }
  if (len < min) { F = H.clone().addScaledVector(d.normalize(), min); d = F.clone().sub(H); len = min; }
  const dir = d.clone().divideScalar(len);
  const a = (L1 * L1 - L2 * L2 + len * len) / (2 * len);
  const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  const b = V(...bend); b.addScaledVector(dir, -b.dot(dir)); if (b.lengthSq() < 1e-8) b.set(0, 1, 0); b.normalize();
  return [arr(H.clone().addScaledVector(dir, a).addScaledVector(b, h)), arr(F)];
}
/** One foot's place in a walk cycle: u = −0.5..0.5 along the stride (+ forward), lift 0..1; duty = share on the ground. */
export function step(phase, duty = 0.6) {
  const t = ((phase % 1) + 1) % 1;
  if (t < duty) return { u: 0.5 - t / duty, lift: 0 };
  const s = (t - duty) / (1 - duty);
  return { u: -0.5 + ease(s), lift: Math.sin(Math.PI * s) };
}
/** Strike curve: −1 at full wind-up (~35%), +1 at the hit (~55%), back to 0. */
export function lunge(t) {
  if (t < 0.35) return -ease(t / 0.35);
  if (t < 0.55) return -1 + 2 * ease((t - 0.35) / 0.2);
  return 1 - ease((t - 0.55) / 0.45);
}
/** A torso frame: position + pitch (nose up +) + roll + yaw. tp(local) → parent-space point. */
export function frame(x, y, z, pitch = 0, roll = 0, yaw = 0) {
  const m = new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(roll, yaw, pitch, 'YZX')), V(1, 1, 1));
  return { m, tp: p => arr(V(...p).applyMatrix4(m)) };
}
/** A group placed by a frame, so torso parts are written in torso space. */
export function torsoGroup(parent, f, name = '') { const g = new THREE.Group(); g.name = name; g.matrixAutoUpdate = false; g.matrix.copy(f.m); parent.add(g); return g; }

// ---------- materials ----------
export const C = (color, metal = 0.1, rough = 0.55) => bodyMat('concrete', 0, { color, metal, rough });
/** A glow after death: its light gone. */
export const dim = color => C(shade(color, -0.5), 0, 0.7);
/** A glow while alive (`on`), dark after. */
export const lit = (color, on, dayGlow = 0.6) => on ? neonMat(color, dayGlow) : dim(color);
export const SCORCH = C('#26231f', 0.15, 0.95), SOOT = C('#3a3631', 0.1, 0.9);
export const FIRE = '#ff7a1c', FIRE_HOT = '#ffd36a';

// ---------- debris: pieces thrown out by a death ----------
/** Seeded throw directions for n pieces. spread = horizontal speed, up = launch speed. */
export function throws(R, n, { spread = 0.3, up = 0.35, size = [0.02, 0.05] } = {}) {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * TAU + R.range(-0.5, 0.5), s = R.range(0.5, 1) * spread;
    return { v: [Math.cos(a) * s, R.range(0.5, 1) * up, Math.sin(a) * s], spin: [R.range(-6, 6), R.range(-6, 6), R.range(-6, 6)], size: R.range(size[0], size[1]), pick: R() };
  });
}
/** Where a thrown piece is at time k (0..1 of its flight): ballistic, stops when it lands. Returns { p, landed, k }. */
export function flight(p0, v, k, rest = 0.01, g = 1.6) {
  const a = -g, b = v[1], c = p0[1] - rest;                    // y(k) = c + b k + a k² → land at the positive root
  const land = (-b - Math.sqrt(Math.max(0, b * b - 4 * a * c))) / (2 * a);
  const kk = Math.min(k, Math.max(0, land));
  return { p: [p0[0] + v[0] * kk, Math.max(rest, p0[1] + v[1] * kk + a * kk * kk), p0[2] + v[2] * kk], landed: k >= land, k: kk, land };
}
/** Throw a box-ish chunk. */
export function chunk(parent, p0, piece, k, m, shape = 'box') {
  const { p, k: kk } = flight(p0, piece.v, k, piece.size * 0.4);
  const s = piece.size;
  const o = shape === 'ball' ? ball(parent, s * 0.6, m, ...p, 1, 0.7, 1, 8) : cbox(parent, s, s * 0.55, s * 0.8, m, ...p);
  o.rotation.set(piece.spin[0] * kk, piece.spin[1] * kk, piece.spin[2] * kk);
  return o;
}
/** A burst of fire: a glowing core and flame tongues, k = 0..1 (grows then dies down to embers). */
export function fireball(parent, x, y, z, r, k, R = null) {
  if (k <= 0 || k >= 1) return;
  const grow = ease(k / 0.25), fade = 1 - ease((k - 0.35) / 0.65);
  const s = r * (0.4 + 0.8 * grow) * (0.35 + 0.65 * fade);
  if (s < 0.003) return;
  ball(parent, s, neonMat(k < 0.45 ? FIRE_HOT : FIRE, 0.9), x, y + s * 0.6, z, 1, 0.85, 1, 12);
  for (let i = 0; i < 5; i++) {
    const a = i * TAU / 5 + (R ? 0 : 0.3);
    ball(parent, s * 0.55, neonMat(FIRE, 0.9), x + Math.cos(a) * s * 0.8, y + s * (0.5 + 0.5 * ((i * 7) % 3) / 2), z + Math.sin(a) * s * 0.8, 1, 1.2, 1, 8);
  }
}
/** Small flames licking up from a wreck (looped by phase t). */
export function flames(parent, spots, t) {
  spots.forEach(([x, y, z, r], i) => {
    const f = 0.75 + 0.25 * Math.sin((t * 3 + i * 0.37) * TAU);
    seg(parent, [x, y, z], [x + 0.004 * Math.sin((t + i) * TAU), y + r * 2.4 * f, z], r, 0.001, neonMat(FIRE, 0.9), 6);
    ball(parent, r * 0.8, neonMat(FIRE_HOT, 0.9), x, y + r * 0.4, z, 1, 0.8, 1, 8);
  });
}

// ---------- the recipe wrapper ----------
/**
 * Wrap draw(root, look, anim, t, st, p) into build(p) → a posable model. `st` carries the pose state the draw may
 * read: { anim, t, heading, aim (world heading or null), broken: Set }. The draw builds into `root`, which is turned
 * to the heading afterwards. A turret part reads its local yaw with `aimLocal(st)`.
 */
export function poseable(anims, makeLook, draw, { parts = [] } = {}) {
  const first = Object.keys(anims)[0];
  return p => {
    const g = new THREE.Group(); const body = new THREE.Group(); body.name = 'body'; g.add(body);
    const look = makeLook(p);
    const st = { anim: first, t: 0, heading: 0, aim: null, broken: new Set(), only: null };
    for (const name of parts) if (p[partKey(name)]) st.broken.add(name);
    const redraw = () => {
      body.clear();
      draw(body, look, st.anim, st.t, st, p);
      body.rotation.y = -st.heading;
      body.scale.setScalar(look.scale || 1);              // a look may be drawn at a comfortable size and scaled down
      groundClamp(g, body);
      if (st.only) body.traverse(o => { if (o.name.startsWith('layer:')) o.visible = o.name === 'layer:' + st.only; });
    };
    g.userData.pose = (anim, t = 0, heading = 0) => { st.anim = anims[anim] ? anim : first; st.t = clamp01(t); st.heading = heading; redraw(); };
    g.userData.face = aim => { st.aim = aim; redraw(); };
    g.userData.only = layer => { st.only = layer || null; redraw(); };
    g.userData.parts = parts.slice();
    g.userData.breakPart = (name, on = true) => { if (on) st.broken.add(name); else st.broken.delete(name); redraw(); };
    g.userData.muzzles = () => {
      g.updateMatrixWorld(true); const out = [];
      g.traverse(o => { if (o.name.startsWith('muzzle')) { const v = g.worldToLocal(o.getWorldPosition(new THREE.Vector3())); out.push({ name: o.name, x: +v.x.toFixed(4), y: +v.y.toFixed(4), z: +v.z.toFixed(4) }); } });
      return out;
    };
    g.userData.state = st;
    redraw();
    return g;
  };
}
/** Nothing is drawn under the street: a piece that dips below the ground (a collapsing leg, a landing chunk, a
 *  crashing hull) is lifted until it rests on it. The baked picture has no ground to hide it, so it would show. */
const _m = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _b = new THREE.Box3(), _v = new THREE.Vector3();
function groundClamp(g, body) {
  g.updateMatrixWorld(true);
  _inv.copy(g.matrixWorld).invert();
  body.traverse(o => {
    if (!o.isMesh) return;
    const geo = o.geometry; if (!geo.boundingBox) geo.computeBoundingBox();
    _m.multiplyMatrices(_inv, o.matrixWorld);
    _b.copy(geo.boundingBox).applyMatrix4(_m);
    if (_b.min.y > -0.001) return;
    let lo = Infinity; const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) { _v.fromBufferAttribute(pos, i).applyMatrix4(_m); if (_v.y < lo) lo = _v.y; }
    if (lo > -0.001) return;
    // lift by -lo in model space: move the piece's world position up, back into its parent's space
    const w = o.getWorldPosition(new THREE.Vector3());
    const up = new THREE.Vector3(0, -lo, 0).transformDirection(g.matrixWorld).multiplyScalar(-lo);
    o.position.copy(o.parent.worldToLocal(w.add(up)));
    o.updateMatrixWorld(true);
  });
}
/** A turret's yaw inside the turned hull: aim (world) relative to the hull heading; 0 when no aim is set. */
export const aimLocal = st => st.aim == null ? 0 : -(st.aim - st.heading);
/** The param key that breaks a part from the review page: 'sac-left' → 'brk_sac_left'. */
export const partKey = name => 'brk_' + name.replace(/-/g, '_');
/** The seed's size jitter (±6%), so a crowd is not one stamp. */
export const jitter = p => 1 + ((p.seed * 37) % 13 - 6) / 100;
