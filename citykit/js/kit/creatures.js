// Alien wildlife for Arcline (owner rulings, Arcline PLAN §0: wildlife only, NO flyers, NO ranged attacks — every
// creature walks up and hits; walls block every attack). Four kinds, each with its own outline so a horde reads at a
// glance: low many-legged Swarmer, armoured hunched Wall-breaker, tall stilt-legged Sapper with glowing acid sacs,
// and the huge crystal-backed Brute.
//
// Each is a jointed model rebuilt for every frame: userData.pose(anim, phase 0..1, heading) clears the model, works
// out where each foot is in the walk cycle, bends the legs to reach it (two-bone IK), and draws it facing `heading`
// (world angle, atan2(dz, dx)). The model walks on the spot; the game moves the sprite.
//   walk   8 frames, loop — legs step in the creature's own gait, the body bobs and sways
//   attack 6 frames, loop — wind up, strike toward the heading (bite / ram / stab / slam), recover
//   die    8 frames, once — collapses or bursts; its glow goes out
//   idle   4 frames, loop — breathing
// Bioluminescent spots use glow materials, so they shine at night.
import * as THREE from 'three';
import { addRecipes } from './buildings.js';
import { bodyMat, neonMat } from './shapes.js';
import { shade } from './materials.js';

// ---------- parts ----------
const G = new Map();
const geo = (k, make) => { if (!G.has(k)) G.set(k, make()); return G.get(k); };
function put(parent, g, m, x = 0, y = 0, z = 0) { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o; }
const UP = new THREE.Vector3(0, 1, 0);
/** A tapered rod between two points (radius r0 at a, r1 at b). Points are [x, y, z] arrays. */
function seg(parent, a, b, r0, r1, m, sides = 8) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const len = d.length();
  const g = geo(`s${r0.toFixed(4)}:${r1.toFixed(4)}:${sides}`, () => { const c = new THREE.CylinderGeometry(r1, r0, 1, sides); c.translate(0, 0.5, 0); return c; });
  const o = put(parent, g, m, a[0], a[1], a[2]); o.scale.y = Math.max(len, 1e-4); if (len > 1e-6) o.quaternion.setFromUnitVectors(UP, d.normalize()); return o;
}
function ball(parent, r, m, x, y, z, sx = 1, sy = 1, sz = 1, s = 16) {
  const o = put(parent, geo(`sp${s}`, () => new THREE.SphereGeometry(1, s, Math.ceil(s * 0.6))), m, x, y, z); o.scale.set(r * sx, r * sy, r * sz); return o;
}
/** A crystal: a stretched octahedron from base point a pointing to b. */
function crystal(parent, a, b, w, m) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const len = d.length();
  const o = put(parent, geo('oct', () => { const g = new THREE.OctahedronGeometry(0.5); g.translate(0, 0.5, 0); return g; }), m, a[0], a[1], a[2]);
  o.scale.set(w, len, w); o.quaternion.setFromUnitVectors(UP, d.normalize()); return o;
}
function ringFlat(parent, r, tube, m, x, y, z) { const o = put(parent, geo(`t${r.toFixed(3)}:${tube.toFixed(3)}`, () => new THREE.TorusGeometry(r, tube, 6, 32)), m, x, y, z); o.rotation.x = Math.PI / 2; o.castShadow = false; return o; }
function disc(parent, r, m, x, z, y = 0.003) { const o = put(parent, geo('disc', () => new THREE.CylinderGeometry(1, 1, 0.004, 20)), m, x, y, z); o.scale.set(r, 1, r); o.castShadow = false; return o; }

// ---------- maths ----------
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const arr = v => [v.x, v.y, v.z];
const clamp01 = x => Math.max(0, Math.min(1, x));
const ease = x => { x = clamp01(x); return x * x * (3 - 2 * x); };
const lerp = (a, b, t) => a + (b - a) * t;
const lerpV = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const TAU = Math.PI * 2;

/** Two-bone IK: the knee for a limb from hip to foot with bone lengths L1, L2, bending toward `bend`. Clamps the
 *  foot in if it is out of reach. Returns [knee, foot]. */
function ik(hip, foot, L1, L2, bend) {
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
/** One foot's place in a walk cycle: u = −0.5..0.5 along the stride (+ = forward), lift 0..1. duty = share on the ground. */
function step(phase, duty = 0.6) {
  const t = ((phase % 1) + 1) % 1;
  if (t < duty) return { u: 0.5 - t / duty, lift: 0 };
  const s = (t - duty) / (1 - duty);
  return { u: -0.5 + ease(s), lift: Math.sin(Math.PI * s) };
}
/** Attack curve: −1 at full wind-up (~35%), +1 at the strike (~55%), back to 0. */
function lunge(t) {
  if (t < 0.35) return -ease(t / 0.35);
  if (t < 0.55) return -1 + 2 * ease((t - 0.35) / 0.2);
  return 1 - ease((t - 0.55) / 0.45);
}
/** A torso frame: position + pitch (nose up +) + roll + yaw. tp(local) → body-space point. */
function frame(x, y, z, pitch = 0, roll = 0, yaw = 0) {
  const m = new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(roll, yaw, pitch, 'YZX')), V(1, 1, 1));
  const tp = p => arr(V(...p).applyMatrix4(m));
  return { m, tp };
}
/** A group placed by a frame, so torso parts are written in torso space. */
function torsoGroup(parent, f) { const g = new THREE.Group(); g.matrixAutoUpdate = false; g.matrix.copy(f.m); parent.add(g); return g; }

// ---------- materials ----------
const C = (color, metal = 0.1, rough = 0.55) => bodyMat('concrete', 0, { color, metal, rough });
const dim = color => C(shade(color, -0.45), 0, 0.7);          // a spot after death: its glow gone

// ---------- the recipe frame shared by all four ----------
const ANIMS = {
  walk: { label: 'Walk', frames: 8, fps: 10 },
  attack: { label: 'Attack', frames: 6, fps: 10 },
  die: { label: 'Die', frames: 8, fps: 10, once: true },
  idle: { label: 'Idle', frames: 4, fps: 5 },
};
/** Wrap a draw(group, look, anim, t) into a build(p) that returns a posable model. */
function creature(makeLook, draw) {
  return p => {
    const g = new THREE.Group(); const body = new THREE.Group(); g.add(body);
    const look = makeLook(p);
    g.userData.pose = (anim, t, heading = 0) => {
      body.clear();
      draw(body, look, ANIMS[anim] ? anim : 'walk', clamp01(t), p);
      body.rotation.y = -heading;
    };
    g.userData.pose('walk', 0, 0);
    return g;
  };
}

// =====================================================================================================================
// Swarmer: small, fast, low, six splayed legs, snapping mandibles, rows of glowing spots along its back.
// =====================================================================================================================
const SWARM_SKINS = [['#5e467c', '#a88cc2'], ['#3f6150', '#8fb39c'], ['#74443d', '#c08a78']];
/** Height of the swarmer's abdomen shell at (x, z), torso space. */
function swarmerTop(x, z) { const u = (x + 0.08) / 0.108, w = z / 0.08; return 0.01 + 0.058 * Math.sqrt(Math.max(0, 1 - u * u - w * w)); }
function swarmerLook(p) {
  const [shell, belly] = SWARM_SKINS[p.seed % SWARM_SKINS.length];
  const spots = [];
  // spots sit ON the abdomen's shell (centre −0.08, 0.01; radii 0.108 × 0.058 × 0.08)
  for (let i = 0; i < 4; i++) for (const s of [1, -1]) {
    const x = -0.035 - i * 0.04, z = s * (0.028 + p.R.range(0, 0.012));
    spots.push([x, swarmerTop(x, z) - 0.002, z, p.R.range(0.013, 0.017)]);
  }
  return { shell: C(shell, 0.25, 0.35), plate: C(shade(shell, -0.25), 0.25, 0.4), belly: C(belly), leg: C(shade(shell, 0.1), 0.2, 0.5), glow: '#3ff0d0', spots };
}
function drawSwarmer(root, L, anim, t) {
  const glowOn = !(anim === 'die' && t > 0.55);
  const glow = glowOn ? neonMat(L.glow, 0.7) : dim(L.glow);
  let bx = 0, by = 0.075, pitch = 0, roll = 0, yaw = 0, open = 0.3, legPh = 0, stride = 0.09, frontLift = 0, curl = 0;
  if (anim === 'walk') { legPh = t; by += 0.007 * Math.cos(t * TAU * 2); yaw = 0.06 * Math.sin(t * TAU); roll = 0.04 * Math.sin(t * TAU); open = 0.2 + 0.15 * Math.sin(t * TAU * 2); }
  else if (anim === 'attack') { const l = lunge(t); bx = 0.05 * l; pitch = -0.28 * Math.max(0, l) + 0.18 * Math.max(0, -l); by += 0.02 * Math.max(0, -l); open = l < 0 ? -l : clamp01(0.2 - l); frontLift = Math.max(0, -l); stride = 0; }
  else if (anim === 'idle') { by += 0.003 * Math.sin(t * TAU); open = 0.25 + 0.1 * Math.sin(t * TAU); stride = 0; }
  else if (anim === 'die') { const k = ease(t / 0.7); by = 0.075 + 0.04 * Math.sin(Math.PI * clamp01(t / 0.5)) - 0.02 * k; roll = 2.6 * k; curl = ease(t / 0.8); open = 1; stride = 0; }
  const f = frame(bx, by, 0, pitch, roll, yaw);
  const T = torsoGroup(root, f);
  // abdomen with segment plates and spines, thorax, head
  ball(T, 0.08, L.shell, -0.08, 0.01, 0, 1.35, 0.72, 1.0);
  for (let i = 0; i < 3; i++) ball(T, 0.081, L.plate, -0.045 - i * 0.045, 0.012, 0, 0.22, 0.76 - i * 0.05, 1.02 - i * 0.06);
  for (let i = 0; i < 3; i++) seg(T, [-0.06 - i * 0.045, 0.06 - i * 0.004, 0], [-0.1 - i * 0.045, 0.1 - i * 0.012, 0], 0.012, 0.0, L.plate, 5);
  ball(T, 0.058, L.shell, 0.025, 0.0, 0, 1.1, 0.72, 0.95);
  ball(T, 0.05, L.belly, 0.0, -0.022, 0, 2.0, 0.45, 0.9);
  ball(T, 0.04, L.shell, 0.09, -0.006, 0, 1.15, 0.8, 1.0);
  for (const [x, y, z, r] of L.spots) ball(T, r, glow, x, y, z, 1, 0.6, 1, 8);
  for (let i = 0; i < 4; i++) { const x0 = -0.02 - i * 0.04, x1 = x0 - 0.04; seg(T, [x0, swarmerTop(x0, 0) + 0.003, 0], [x1, swarmerTop(x1, 0) + 0.003, 0], 0.007, 0.006, glow, 6); }   // glowing dorsal line
  for (const s of [1, -1]) ball(T, 0.009, glowOn ? neonMat('#e8fff8', 0.7) : dim('#e8fff8'), 0.118, 0.012, s * 0.018, 1, 1, 1, 8);
  // mandibles: open on the wind-up, snap shut on the bite
  for (const s of [1, -1]) {
    const a = [0.11, -0.012, s * 0.018], b = [0.16 + 0.01 * open, -0.02, s * (0.03 + 0.03 * open)], c = [0.19, -0.026, s * (0.006 + 0.03 * open)];
    seg(T, a, b, 0.009, 0.007, L.plate, 6); seg(T, b, c, 0.007, 0.001, L.plate, 6);
  }
  // six legs: alternating tripods
  const HIPS = [[0.05, 1, 0], [0.015, 1, 0.5], [-0.025, 1, 0], [0.05, -1, 0.5], [0.015, -1, 0], [-0.025, -1, 0.5]];
  const FEET = [0.13, 0.02, -0.09];
  HIPS.forEach(([hx, s, off], i) => {
    const hip = f.tp([hx, -0.005, s * 0.035]);
    const st = step(legPh + off, 0.5);
    let foot = [FEET[i % 3] + st.u * stride, 0.035 * st.lift, s * (i % 3 === 1 ? 0.165 : 0.145)];
    if (frontLift && i % 3 === 0) foot = lerpV(foot, f.tp([0.17, 0.06, s * 0.09]), frontLift);
    if (curl) foot = lerpV(foot, f.tp([hx * 0.6, -0.06, s * 0.06]), curl);
    const [knee, ft] = ik(hip, foot, 0.095, 0.125, [0, 1, s * 0.4]);
    seg(root, hip, knee, 0.012, 0.009, L.leg, 6); seg(root, knee, ft, 0.009, 0.003, L.leg, 6);
    ball(root, 0.009, L.plate, ...knee, 1, 1, 1, 6);
  });
  if (anim === 'die' && t > 0.3) { const k = ease((t - 0.3) / 0.6); disc(root, 0.03 + 0.06 * k, neonMat(L.glow, 0.3), -0.02, 0.02); }
}

// =====================================================================================================================
// Wall-breaker: hunched, four pillar legs, stacked back armour and a great ram shield with horns.
// =====================================================================================================================
const BREAK_SKINS = [['#b07a52', '#6a4a36'], ['#9a937e', '#5a554a'], ['#a86060', '#5e3636']];
function breakerLook(p) {
  const [shell, under] = BREAK_SKINS[p.seed % BREAK_SKINS.length];
  return { shell: C(shell, 0.2, 0.45), plate: C(shade(shell, 0.2), 0.2, 0.4), dark: C(under, 0.1, 0.7), bone: C('#e2d6b8', 0.05, 0.5), leg: C(shade(under, 0.15), 0.1, 0.7), glow: '#ffa23a' };
}
function drawBreaker(root, L, anim, t) {
  const glowOn = !(anim === 'die' && t > 0.6);
  const glow = glowOn ? neonMat(L.glow, 0.6) : dim(L.glow);
  let bx = 0, by = 0.2, pitch = 0, roll = 0, legPh = 0, stride = 0.1, sink = 0, fall = 0, impact = 0;
  if (anim === 'walk') { legPh = t; by += 0.012 * Math.cos(t * TAU * 2); roll = 0.05 * Math.sin(t * TAU); pitch = 0.03 * Math.sin(t * TAU * 2); }
  else if (anim === 'attack') { const l = lunge(t); bx = 0.09 * l; pitch = l < 0 ? 0.22 * -l : -0.3 * l; by += l < 0 ? 0.02 * -l : -0.03 * l; stride = 0; impact = t > 0.47 && t < 0.7 ? 1 - Math.abs(t - 0.55) / 0.15 : 0; }
  else if (anim === 'idle') { by += 0.006 * Math.sin(t * TAU); stride = 0; }
  else if (anim === 'die') { const k = ease(t / 0.75); sink = k; by = lerp(0.2, 0.095, k); roll = 0.55 * k; pitch = -0.2 * k; fall = ease((t - 0.25) / 0.6); stride = 0; }
  const f = frame(bx, by, 0, pitch, roll, 0);
  const T = torsoGroup(root, f);
  // body + belly
  ball(T, 0.14, L.dark, -0.03, -0.02, 0, 1.3, 0.8, 0.95);
  // back armour: four overlapping shells, seams glowing (the last two slide off when it dies)
  for (let i = 0; i < 4; i++) {
    const x = 0.07 - i * 0.075, y = 0.075 - i * 0.008, r = 0.135 - i * 0.008;
    if (i >= 2 && fall > 0) {
      // fallen plate: from its place on the back to the ground beside the body, tipping flat
      const side = i === 2 ? 1 : -1;
      const P = lerpV(f.tp([x, y, 0]), [x - 0.04, 0.03, side * 0.26], fall);
      const sh = ball(root, r, L.shell, ...P, 0.55, 0.42, 1.08); sh.rotation.set(side * fall * 1.2, 0, 0.35 - i * 0.12);
      continue;
    }
    const sh = ball(T, r, L.shell, x, y, 0, 0.55, 0.42, 1.08);
    sh.rotation.z = 0.35 - i * 0.12;
    if (i < 3) for (const s of [1, -1]) seg(T, [x - 0.04, y + 0.035, s * 0.015], [x - 0.04, y - 0.01, s * 0.13], 0.011, 0.011, glow, 5);
  }
  // spots down the flanks
  for (let i = 0; i < 3; i++) for (const s of [1, -1]) ball(T, 0.015, glow, -0.06 - i * 0.05, -0.04, s * 0.128, 1, 1, 0.5, 8);
  // ram shield: a curved leaning plate with a bone rim, a bone boss and two horns
  const SG = new THREE.Group(); SG.position.set(0.15, 0, 0); SG.rotation.z = 0.38; T.add(SG);
  ball(SG, 0.17, L.shell, 0, 0, 0, 0.32, 0.62, 1.15);
  const rim = put(SG, geo('rim', () => new THREE.TorusGeometry(1, 0.1, 6, 28)), L.bone, 0.012, 0, 0);
  rim.rotation.y = Math.PI / 2; rim.scale.set(0.17 * 1.15, 0.17 * 0.62, 0.17);
  for (const s of [1, -1]) { const sl = put(SG, geo('slit', () => new THREE.BoxGeometry(0.012, 0.014, 0.06)), glow, 0.054, 0.02, s * 0.06); sl.rotation.x = s * 0.35; }   // glowing mask slits
  for (let k = -1; k <= 1; k++) seg(SG, [0.03, 0.09, k * 0.07], [0.04, 0.15, k * 0.08], 0.014, 0.0, L.bone, 5);     // rim spikes
  ball(T, 0.05, L.bone, 0.205, -0.0, 0, 0.8, 1, 1);
  // small head tucked under the shield, two eyes
  ball(T, 0.045, L.dark, 0.17, -0.08, 0, 1.2, 0.8, 1);
  for (const s of [1, -1]) ball(T, 0.011, glow, 0.205, -0.075, s * 0.025, 1, 1, 1, 8);
  // four pillar legs, diagonal pairs
  const LEGS = [[0.08, 1, 0], [0.08, -1, 0.5], [-0.13, 1, 0.5], [-0.13, -1, 0]];
  for (const [hx, s, off] of LEGS) {
    const hip = f.tp([hx, -0.04, s * 0.095]);
    const st = step(legPh + off, 0.6);
    let foot = [hx + 0.02 + st.u * stride, 0.04 * st.lift, s * 0.15];
    if (sink) foot = lerpV(foot, [hx * 1.3, 0, s * 0.24], sink);
    const [knee, ft] = ik(hip, foot, 0.1, 0.11, [hx > 0 ? -1 : 1, 0.2, s * 0.6]);
    seg(root, hip, knee, 0.042, 0.034, L.leg, 8); seg(root, knee, ft, 0.034, 0.03, L.leg, 8);
    ball(root, 0.036, L.shell, ...knee, 1, 1, 1, 8);
    ball(root, 0.035, L.dark, ft[0] + 0.01, 0.012, ft[2], 1.3, 0.45, 1.15, 10);
  }
  if (impact > 0) for (let i = 0; i < 5; i++) { const a = (i - 2) * 0.5; seg(T, [0.23, 0.0, 0], [0.23 + Math.cos(a) * 0.09 * impact, 0.0 + Math.sin(a) * 0.08 * impact, (i - 2) * 0.03], 0.012, 0.0, neonMat('#ffe2a0', 0.9), 5); }
}

// =====================================================================================================================
// Sapper: tall and thin on four stilt legs, a stabbing proboscis, glowing acid sacs hung underneath that burst.
// =====================================================================================================================
const SAP_SKINS = ['#c9c2a8', '#a9b7a2', '#bfa8b2'];
function sapperLook(p) {
  const skin = SAP_SKINS[p.seed % SAP_SKINS.length];
  const drops = Array.from({ length: 8 }, (_, i) => [i * TAU / 8 + p.R.range(-0.3, 0.3), p.R.range(0.06, 0.16), p.R.range(0.05, 0.13)]);
  const splats = Array.from({ length: 5 }, () => [p.R.range(-0.12, 0.12), p.R.range(-0.12, 0.12), p.R.range(0.03, 0.07)]);
  return { skin: C(skin, 0.05, 0.5), dark: C(shade(skin, -0.45), 0.1, 0.6), leg: C(shade(skin, -0.2), 0.1, 0.5), acid: '#8cff3a', drops, splats };
}
function drawSapper(root, L, anim, t) {
  let bx = 0, by = 0.38, pitch = 0, roll = 0, legPh = 0, stride = 0.12, sacK = 1, stab = 0, splay = 0, burst = -1;
  if (anim === 'walk') { legPh = t; by += 0.012 * Math.sin(t * TAU * 2); roll = 0.06 * Math.sin(t * TAU); bx = 0.01 * Math.sin(t * TAU * 2); }
  else if (anim === 'attack') { const l = lunge(t); stab = Math.max(0, l); by -= 0.13 * Math.max(0, l) - 0.03 * Math.max(0, -l); bx = 0.04 * l; pitch = -0.35 * Math.max(0, l) + 0.15 * Math.max(0, -l); sacK = 1 + 0.35 * Math.max(0, -l) - 0.15 * Math.max(0, l); stride = 0; }
  else if (anim === 'idle') { by += 0.006 * Math.sin(t * TAU); sacK = 1 + 0.06 * Math.sin(t * TAU); stride = 0; }
  else if (anim === 'die') { sacK = t < 0.35 ? 1 + 0.7 * ease(t / 0.35) : 0; burst = t < 0.35 ? -1 : (t - 0.35) / 0.65; const k = ease((t - 0.3) / 0.6); splay = k; by = lerp(0.38, 0.05, k); pitch = -0.4 * k; roll = 0.3 * k; stride = 0; }
  const f = frame(bx, by, 0, pitch, roll, 0);
  const T = torsoGroup(root, f);
  // body: a pale pod with a dorsal crest and a hooded head
  ball(T, 0.066, L.skin, 0, 0, 0, 1.4, 0.75, 0.85);
  ball(T, 0.04, L.dark, -0.065, 0.005, 0, 1.2, 0.8, 0.8);
  put(T, geo('crest', () => new THREE.BoxGeometry(0.12, 0.05, 0.008)), L.dark, -0.01, 0.045, 0).rotation.z = 0.12;
  ball(T, 0.032, L.skin, 0.075, -0.005, 0, 1.2, 0.85, 0.85);
  for (const s of [1, -1]) ball(T, 0.008, neonMat(L.acid, 0.7), 0.1, 0.005, s * 0.015, 1, 1, 1, 8);
  // proboscis: hangs forward; on the attack it stabs down and forward
  const p0 = [0.1, -0.015, 0], p1 = lerpV([0.15, -0.07, 0], [0.18, -0.1, 0], stab), p2 = lerpV([0.17, -0.14, 0], [0.27, -0.3, 0], stab);
  seg(T, p0, p1, 0.012, 0.008, L.dark, 6); seg(T, p1, p2, 0.008, 0.002, L.dark, 6);
  if (anim !== 'die' || t < 0.35) ball(T, 0.009, neonMat(L.acid, 0.8), ...p2, 1, 1, 1, 8);
  // acid sacs hang under the body and swing behind the motion
  const swing = anim === 'walk' ? 0.025 * Math.sin((t - 0.15) * TAU * 2) : anim === 'attack' ? -0.02 * lunge(t) : 0;
  if (sacK > 0) for (const [x, z, r] of [[-0.03, 0, 0.042], [0.015, 0.035, 0.034], [0.015, -0.035, 0.034]]) {
    const top = [x, -0.03, z], bot = [x - swing, -0.08, z];
    seg(T, top, bot, 0.006, 0.006, L.dark, 5);
    ball(T, r * sacK, neonMat(L.acid, 0.55), bot[0], bot[1] - r * sacK * 0.8, bot[2], 1, 1.15, 1, 12);
  }
  // four stilt legs, one after another; knees high above the body, knee joints glow
  const LEGS = [[1, 1, 0], [-1, -1, 0.25], [1, -1, 0.5], [-1, 1, 0.75]];
  for (const [sx, sz, off] of LEGS) {
    const hip = f.tp([sx * 0.025, -0.01, sz * 0.025]);
    const st = step(legPh + off, 0.72);
    let foot = [sx * 0.2 + st.u * stride, 0.06 * st.lift, sz * 0.2];
    if (splay) foot = lerpV(foot, [sx * 0.33, 0, sz * 0.3], splay);
    const [knee, ft] = ik(hip, foot, 0.25, 0.4, [sx * 0.15, 1, sz * 0.15]);
    seg(root, hip, knee, 0.011, 0.008, L.leg, 6); seg(root, knee, ft, 0.008, 0.003, L.leg, 6);
    ball(root, 0.012, neonMat(L.acid, 0.5), ...knee, 1, 1, 1, 8);
  }
  // burst: droplets fly out and fall, glowing acid splashes spread on the ground
  if (burst >= 0) {
    const sp = ease(burst * 1.4);
    for (const [x, z, r] of L.splats) disc(root, r * (0.4 + 0.6 * sp), neonMat(L.acid, 0.35), x * sp + 0.0, z * sp);
    if (burst < 0.75) for (const [a, d, h] of L.drops) {
      const k = burst / 0.75;
      ball(root, 0.012, neonMat(L.acid, 0.7), Math.cos(a) * d * k, Math.max(0.01, 0.28 + h * k - 0.5 * k * k), Math.sin(a) * d * k, 1, 1, 1, 8);
    }
  }
}

// =====================================================================================================================
// Brute: huge knuckle-walker, massive forearms, crystal spines along its back; a double-fist slam with a shockwave.
// =====================================================================================================================
const BRUTE_SKINS = [['#6f7f9c', '#46506a'], ['#8a7f73', '#564d44'], ['#6b8582', '#40524f']];
function bruteLook(p) {
  const [hide, dark] = BRUTE_SKINS[p.seed % BRUTE_SKINS.length];
  // crystal spines: along the spine and over the shoulders, angled up and back
  const spines = [];
  const n = 9;
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const x = lerp(0.12, -0.18, u) + p.R.range(-0.02, 0.02), z = (i % 3 - 1) * 0.07 + p.R.range(-0.02, 0.02);
    const y = 0.15 - 0.06 * u;
    const len = p.R.range(0.18, 0.31) * (1 - 0.3 * u);
    spines.push({ a: [x, y, z], b: [x - len * 0.5, y + len, z + z * 0.9], w: p.R.range(0.06, 0.09) });
  }
  return { hide: C(hide, 0.15, 0.7), dark: C(dark, 0.1, 0.75), plate: C(shade(hide, 0.2), 0.2, 0.55), tusk: C('#e4dcc4', 0.05, 0.4), glow: '#ff4fd8', spines };
}
function drawBrute(root, L, anim, t) {
  const glowOn = !(anim === 'die' && t > 0.65);
  const glow = glowOn ? neonMat(L.glow, 0.5) : dim(L.glow);
  const crystalMat = glowOn ? neonMat('#ff8ae6', 0.45) : C('#7a4e72', 0.3, 0.3);
  let bx = 0, by = 0.42, pitch = 0.12, roll = 0, legPh = 0, armStride = 0.17, legStride = 0.12, raise = 0, slam = 0, die = 0, wave = -1;
  if (anim === 'walk') { legPh = t; by += 0.018 * Math.cos(t * TAU * 2); roll = 0.07 * Math.sin(t * TAU); pitch = 0.12 + 0.03 * Math.sin(t * TAU * 2); }
  else if (anim === 'attack') {
    const l = lunge(t); raise = Math.max(0, -l); slam = Math.max(0, l);
    by += 0.08 * raise - 0.06 * slam; bx = -0.03 * raise + 0.06 * slam; pitch = 0.12 + 0.4 * raise - 0.32 * slam; armStride = 0; legStride = 0;
    if (t > 0.5) wave = (t - 0.5) / 0.5;
  }
  else if (anim === 'idle') { by += 0.01 * Math.sin(t * TAU); armStride = 0; legStride = 0; }
  else if (anim === 'die') { die = ease(t / 0.8); by = lerp(0.42, 0.19, die); pitch = lerp(0.12, -0.45, die); roll = 0.7 * die; bx = 0.08 * die; armStride = 0; legStride = 0; }
  const f = frame(bx, by, 0, pitch, roll, 0);
  const T = torsoGroup(root, f);
  // torso, hump, chest plate, shoulders
  ball(T, 0.22, L.hide, -0.03, 0, 0, 1.15, 0.82, 0.95);
  ball(T, 0.17, L.dark, 0.06, -0.08, 0, 1.0, 0.7, 0.85);
  ball(T, 0.14, L.plate, 0.13, -0.02, 0, 0.7, 0.9, 1.0);
  for (const s of [1, -1]) ball(T, 0.12, L.hide, 0.1, 0.06, s * 0.19, 1, 0.85, 0.9);
  // spots along the flanks
  for (let i = 0; i < 4; i++) for (const s of [1, -1]) ball(T, 0.014, glow, -0.02 - i * 0.06, -0.05 + (i % 2) * 0.03, s * 0.2, 1, 1, 0.5, 8);
  // head: low and forward, glowing eyes, tusks
  ball(T, 0.075, L.dark, 0.26, -0.05, 0, 1.1, 0.85, 1);
  ball(T, 0.05, L.hide, 0.3, -0.1, 0, 1.0, 0.6, 1.1);
  for (const s of [1, -1]) {
    ball(T, 0.013, glow, 0.32, -0.03, s * 0.035, 1, 0.7, 1, 8);
    seg(T, [0.31, -0.11, s * 0.04], [0.36, -0.06, s * 0.07], 0.013, 0.002, L.tusk, 6);
  }
  // crystal spines (two snap off and fall when it dies)
  L.spines.forEach((c, i) => {
    if (die && (i === 2 || i === 6) && die > 0.3) {
      const k = ease((die - 0.3) / 0.7); const gx = c.a[0] + (i === 2 ? 0.25 : -0.2), gz = i === 2 ? 0.32 : -0.3;
      crystal(root, [gx, 0.02, gz], [gx + 0.15, 0.02 + 0.06 * (1 - k), gz + 0.04], c.w, crystalMat);
      return;
    }
    crystal(T, c.a, c.b, c.w, crystalMat);
    ball(T, c.w * 0.75, L.dark, ...c.a, 1, 0.5, 1, 8);
  });
  // arms: knuckle-walking fists, the strike raises both and slams them down
  for (const s of [1, -1]) {
    const sh = f.tp([0.13, 0.04, s * 0.24]);
    const st = step(legPh + (s > 0 ? 0 : 0.5), 0.55);
    let fist = [0.3 + st.u * armStride, 0.06 + 0.07 * st.lift, s * 0.27];
    if (raise) fist = lerpV(fist, f.tp([0.18, 0.42, s * 0.13]), raise);
    if (slam) fist = lerpV(fist, [0.48, 0.07, s * 0.11], slam);
    if (die) fist = lerpV(fist, [0.36, 0.05, s * 0.42], die);
    const [el, fs] = ik(sh, fist, 0.24, 0.27, [-1, 0.2, s * 0.8]);
    seg(root, sh, el, 0.065, 0.055, L.hide, 10);
    seg(root, el, fs, 0.075, 0.07, L.plate, 10);
    ball(root, 0.06, L.hide, ...el, 1, 1, 1, 10);
    ball(root, 0.075, L.dark, fs[0], fs[1], fs[2], 1.1, 0.85, 1.1, 12);
    for (let k = -1; k <= 1; k++) crystal(root, [fs[0] + 0.02, fs[1] + 0.03, fs[2] + k * 0.035], [fs[0] + 0.05, fs[1] + 0.1, fs[2] + k * 0.045], 0.03, crystalMat);
  }
  // hind legs
  for (const s of [1, -1]) {
    const hip = f.tp([-0.17, -0.1, s * 0.13]);
    const st = step(legPh + (s > 0 ? 0.5 : 0), 0.6);
    let foot = [-0.18 + st.u * legStride, 0.05 * st.lift, s * 0.17];
    if (die) foot = lerpV(foot, [-0.3, 0, s * 0.25], die);
    const [kn, ft] = ik(hip, foot, 0.17, 0.18, [1, 0.1, s * 0.3]);
    seg(root, hip, kn, 0.07, 0.055, L.hide, 10); seg(root, kn, ft, 0.05, 0.045, L.dark, 10);
    ball(root, 0.05, L.dark, ft[0] + 0.02, 0.018, ft[2], 1.4, 0.5, 1.1, 10);
  }
  // the slam's shockwave: a glowing ring spreading on the ground in front
  if (wave >= 0 && wave < 0.9) {
    const r = 0.05 + 0.35 * ease(wave);
    ringFlat(root, r, 0.016 * (1 - wave * 0.6), neonMat(L.glow, 0.6), 0.48, 0.01, 0);
    if (wave < 0.4) for (let i = 0; i < 6; i++) { const a = i * TAU / 6; seg(root, [0.48 + Math.cos(a) * 0.05, 0.01, Math.sin(a) * 0.05], [0.48 + Math.cos(a) * 0.12, 0.08 * (1 - wave), Math.sin(a) * 0.12], 0.012, 0.0, L.dark, 5); }
  }
}

const seedParam = [];
addRecipes({
  'cr-swarmer': {
    name: 'Swarmer', group: 'creatures', size: [1, 1], dirs: 16, anims: ANIMS, noStyle: true,
    blurb: 'Small, fast and many: a low six-legged biter about a third of a tile long. Comes in packs.',
    params: seedParam, build: creature(swarmerLook, drawSwarmer),
  },
  'cr-breaker': {
    name: 'Wall-breaker', group: 'creatures', size: [1, 1], dirs: 16, anims: ANIMS, noStyle: true,
    blurb: 'Armoured and hunched behind a horned ram shield; it charges walls head first.',
    params: seedParam, build: creature(breakerLook, drawBreaker),
  },
  'cr-sapper': {
    name: 'Sapper', group: 'creatures', size: [1, 1], dirs: 16, anims: ANIMS, noStyle: true,
    blurb: 'Fragile and tall on four stilt legs; its glowing acid sacs melt walls and burst when it dies.',
    params: seedParam, build: creature(sapperLook, drawSapper),
  },
  'cr-brute': {
    name: 'Brute', group: 'creatures', size: [1, 1], dirs: 16, anims: ANIMS, noStyle: true,
    blurb: 'Rare and huge: fills a tile, crystal spines on its back, smashes with both fists.',
    params: seedParam, build: creature(bruteLook, drawBrute),
  },
});
