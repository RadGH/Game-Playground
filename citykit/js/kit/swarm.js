// The Swarm: Overdrive Frame's alien hive army (owner brief: "blow up swarms by the hundreds"). Biological, insect-like
// and original. Every kind has one job and its own outline so a crowd reads at a glance at the game's zoom:
//   Swarmer      — the trash: a low, fast runner with two raised scythe arms and a spiked tail (hundreds at once)
//   Leaper       — a grasshopper-backed pouncer: huge folded hind legs, a frilled head; leaps at the mech
//   Spitter      — a six-legged crawler whose tail arches over its back to a glowing acid sac; lobs acid arcs
//   Brute        — heavy, six thick legs, a pale armour plate with horns across its whole front: shoot it from the side
//                  or behind, where the glowing vents on its back are
//   Burrower     — a ringed worm that bursts out of the ground with a four-petal jaw (used sparingly)
//   Bloater      — a waddling glowing gas sac in a cage of ribs; it swells and bursts next to you (used sparingly)
//   Hive / Great Hive — the spawner nests (1×1 and 2×2 lots): ribbed mounds whose petal mouths open to let swarmers out
//   Broodmother  — the boss (~1.75 tiles long): claws, a crest, egg sacs; each of those can be shot off
//
// Every model is rebuilt per frame through userData.pose(anim, phase, heading) (enemy-bits.js `poseable`), faces one
// of 16 screen directions, and uses glow materials for eyes, sacs, vents and pores so the night layer shines.
// Scale (Overdrive Frame ARCH.md): 1 unit = 16 m; a mech is 0.75 tall; swarmer 0.12 long, brute 0.4, broodmother ~1.75.
import { addRecipes } from './buildings.js';
import {
  put, geo, cbox, seg, ball, hemi, spike, disc, ringFlat, group, marker, V, arr, clamp01, ease, lerp, lerpV, TAU, bump, ik, step, lunge,
  frame, torsoGroup, C, dim, lit, neonMat, shade, throws, flight, chunk, poseable, jitter, partKey,
} from './enemy-bits.js';
import * as THREE from 'three';

// ---------- skins: carapace + bioluminescence, picked by the seed or by name ----------
const SKINS = [
  { name: 'Dusk', shell: '#3a2f4e', plate: '#5c4b78', belly: '#9a86b4', glow: '#b6ff3a' },
  { name: 'Moss', shell: '#2c3f33', plate: '#4a6650', belly: '#a2bb98', glow: '#ff4fd8' },
  { name: 'Rust', shell: '#4c2e22', plate: '#7a4a38', belly: '#c79f80', glow: '#3ff0d0' },
];
const skinParam = { key: 'skin', label: 'Colour', min: 0, max: SKINS.length, step: 1, def: 0, names: ['From seed', ...SKINS.map(s => s.name)] };
const skinOf = p => SKINS[p.skin ? p.skin - 1 : p.seed % SKINS.length];
function mats(p) {
  const s = skinOf(p);
  return { shell: C(s.shell, 0.3, 0.35), plate: C(s.plate, 0.3, 0.4), belly: C(s.belly, 0.05, 0.6), leg: C(shade(s.shell, 0.15), 0.2, 0.5), dark: C(shade(s.shell, -0.35), 0.2, 0.5), bone: C('#ddd2b6', 0.05, 0.45), glow: s.glow, R: p.R.fork(3) };
}
/** A glowing splat on the ground (the glow of a dead bug soaking in), growing with k. */
function splat(root, color, k, x = 0, z = 0, r = 0.06) { if (k > 0) disc(root, r * (0.35 + 0.65 * ease(k)), 0.003, neonMat(color, 0.3), x, 0.003, z, 18).castShadow = false; }

// =====================================================================================================================
// Swarmer — drawn at 3× and scaled to 0.12 long.
// =====================================================================================================================
const A_SWARMER = { walk: { label: 'Run', frames: 8, fps: 14 }, attack: { label: 'Slash', frames: 6, fps: 12 }, die: { label: 'Die', frames: 8, fps: 12, once: true } };
function swarmerLook(p) { const L = mats(p); return { ...L, scale: 0.335 * jitter(p), bits: throws(L.R, 6, { spread: 0.35, up: 0.4, size: [0.03, 0.05] }) }; }
/** Swarmer body, also reused small by the hive's spawn and the broodmother's summon. */
function drawSwarmer(root, L, anim, t) {
  const on = !(anim === 'die' && t > 0.45);
  const gl = lit(L.glow, on, 0.7);
  let bx = 0, by = 0.085, pitch = -0.04, roll = 0, yaw = 0, legPh = 0, stride = 0.12, sc = 0, curl = 0, lost = 0;
  if (anim === 'walk') { legPh = t; by += 0.008 * Math.cos(t * TAU * 2); roll = 0.03 * Math.sin(t * TAU); yaw = 0.04 * Math.sin(t * TAU); }
  else if (anim === 'attack') { const l = lunge(t); sc = l; bx = 0.04 * l; pitch = l < 0 ? 0.22 * -l : -0.18 * l; by += l < 0 ? 0.01 * -l : 0; stride = 0; }
  else if (anim === 'die') { const k = ease(t / 0.6); by = 0.085 + 0.06 * bump(t, 0, 0.5) - 0.045 * k; roll = 2.9 * k; curl = ease(t / 0.75); stride = 0; lost = t > 0.15 ? (t - 0.15) / 0.85 : 0; }
  else { by += 0.004 * Math.sin(t * TAU); stride = 0; }
  const f = frame(bx, by, 0, pitch, roll, yaw);
  const T = torsoGroup(root, f);
  // thorax + wedge head with a back-swept crest, mandibles, two eyes
  ball(T, 0.054, L.shell, 0.03, 0, 0, 1.25, 0.8, 1.0);
  ball(T, 0.044, L.plate, 0.1, 0.004, 0, 1.35, 0.72, 0.95);
  spike(T, [0.09, 0.025, 0], [0.04, 0.075, 0], 0.014, L.plate);
  for (const s of [1, -1]) {
    seg(T, [0.135, -0.01, s * 0.016], [0.17, -0.024, s * 0.006], 0.008, 0.001, L.dark, 5);
    ball(T, 0.01, gl, 0.128, 0.016, s * 0.02, 1, 0.8, 1, 8);
  }
  // abdomen: four segments tapering back to a tail spike, plates on top, a pair of glowing spots per segment
  const SEGS = [[-0.035, 0.004, 0.06], [-0.088, 0.014, 0.052], [-0.132, 0.026, 0.04], [-0.165, 0.038, 0.028]];
  for (const [x, y, r] of SEGS) {
    ball(T, r, L.shell, x, y, 0, 0.95, 0.72, 1);
    ball(T, r * 1.04, L.plate, x + 0.004, y + r * 0.18, 0, 0.75, 0.5, 0.98);
    for (const s of [1, -1]) ball(T, r * 0.27, gl, x, y + r * 0.5, s * r * 0.45, 1, 0.6, 1, 8);
  }
  for (let i = 0; i < 3; i++) seg(T, [SEGS[i][0], SEGS[i][1] + SEGS[i][2] * 0.76, 0], [SEGS[i + 1][0], SEGS[i + 1][1] + SEGS[i + 1][2] * 0.76, 0], 0.008, 0.007, gl, 6);   // glowing dorsal line
  spike(T, [-0.178, 0.044, 0], [-0.235, 0.085, 0], 0.02, L.plate);
  ball(T, 0.011, gl, -0.225, 0.078, 0, 1, 1, 1, 8);
  // scythe arms: carried high, they rise back on the wind-up and chop down on the hit; thrown off when it dies
  for (const s of [1, -1]) {
    const sh = [0.06, 0.025, s * 0.03];
    let el = [0.1, 0.13, s * 0.055], tip = [0.165, 0.06, s * 0.05];
    if (sc < 0) { el = lerpV(el, [0.04, 0.17, s * 0.06], -sc); tip = lerpV(tip, [0.07, 0.2, s * 0.055], -sc); }
    if (sc > 0) { el = lerpV(el, [0.15, 0.09, s * 0.05], sc); tip = lerpV(tip, [0.24, -0.06, s * 0.03], sc); }
    if (lost > 0) {
      const b = L.bits[s > 0 ? 0 : 1], { p } = flight(f.tp([0.12, 0.1, s * 0.05]), b.v, lost * 0.8, 0.012);
      const o = seg(root, p, [p[0] + 0.07 * Math.cos(b.spin[1] * lost), p[1] + 0.01, p[2] + 0.07 * Math.sin(b.spin[1] * lost)], 0.01, 0.001, L.plate, 5); o.castShadow = true;
      continue;
    }
    seg(T, sh, el, 0.017, 0.014, L.leg, 6);
    seg(T, el, tip, 0.016, 0.002, L.plate, 6);
    spike(T, lerpV(el, tip, 0.45), [lerp(el[0], tip[0], 0.45) - 0.02, lerp(el[1], tip[1], 0.45) - 0.025, s * 0.05], 0.005, L.plate, 4);
    ball(T, 0.011, L.plate, ...el, 1, 1, 1, 8);
  }
  // four running legs, diagonal pairs; knees high
  const LEGS = [[0.02, 1, 0, 0.11], [0.02, -1, 0.5, 0.11], [-0.04, 1, 0.5, -0.12], [-0.04, -1, 0, -0.12]];
  for (const [hx, s, off, fx] of LEGS) {
    const hip = f.tp([hx, -0.012, s * 0.032]);
    const st = step(legPh + off, 0.5);
    let foot = [fx + st.u * stride, 0.045 * st.lift, s * 0.135];
    if (curl) foot = lerpV(foot, f.tp([hx * 0.6, 0.07, s * 0.05]), curl);
    const [knee, ft] = ik(hip, foot, 0.09, 0.115, [fx > 0 ? -0.2 : 0.2, 1, s * 0.4]);
    seg(root, hip, knee, 0.015, 0.012, L.leg, 6); seg(root, knee, ft, 0.012, 0.003, L.leg, 6);
    ball(root, 0.013, L.plate, ...knee, 1, 1, 1, 6);
  }
  if (lost) { splat(root, L.glow, (lost - 0.1) / 0.6, -0.02, 0, 0.1); for (let i = 2; i < 6; i++) chunk(root, f.tp([-0.08, 0.02, 0]), L.bits[i], lost * 0.8, i % 2 ? L.plate : L.shell, 'ball'); }
}

// =====================================================================================================================
// Leaper — drawn at 2× (0.16 long): hind legs with knees far above the back, a frill behind the head.
// =====================================================================================================================
const A_LEAPER = { walk: { label: 'Scuttle', frames: 8, fps: 12 }, leap: { label: 'Leap', frames: 10, fps: 12, once: true }, attack: { label: 'Rake', frames: 6, fps: 12 }, die: { label: 'Die', frames: 8, fps: 12, once: true } };
function leaperLook(p) { const L = mats(p); return { ...L, scale: 0.5 * jitter(p), bits: throws(L.R, 6, { spread: 0.3, up: 0.35, size: [0.025, 0.045] }) }; }
function drawLeaper(root, L, anim, t) {
  const on = !(anim === 'die' && t > 0.5);
  const gl = lit(L.glow, on, 0.7);
  let bx = 0, by = 0.1, pitch = 0.05, roll = 0, legPh = 0, stride = 0.08, rake = 0, curl = 0, hindPush = 0, air = 0, tuck = 0;
  if (anim === 'walk') { legPh = t; by += 0.012 * Math.abs(Math.sin(t * TAU)); pitch = 0.05 + 0.04 * Math.sin(t * TAU * 2); }
  else if (anim === 'leap') {
    if (t < 0.25) { const k = ease(t / 0.25); by = lerp(0.1, 0.06, k); pitch = 0.05 + 0.2 * k; }                       // crouch, head up
    else if (t < 0.4) { const k = ease((t - 0.25) / 0.15); by = lerp(0.06, 0.2, k); pitch = 0.25 + 0.1 * k; hindPush = k; bx = 0.04 * k; }   // spring
    else if (t < 0.82) { const k = (t - 0.4) / 0.42; by = 0.2 + 0.2 * Math.sin(Math.PI * k); pitch = lerp(0.35, -0.3, k); hindPush = 1; air = 1; bx = 0.04; tuck = Math.sin(Math.PI * k); }
    else { const k = ease((t - 0.82) / 0.18); by = lerp(0.2, 0.08, Math.min(1, k * 1.6)) + 0.02 * k; pitch = lerp(-0.3, 0.05, k); air = 1 - k; hindPush = 1 - k; }
    stride = 0;
  }
  else if (anim === 'attack') { const l = lunge(t); rake = l; pitch = 0.05 + (l < 0 ? 0.35 * -l : -0.15 * l); by += l < 0 ? 0.03 * -l : 0; bx = 0.03 * l; stride = 0; }
  else if (anim === 'die') { const k = ease(t / 0.6); by = 0.1 + 0.05 * bump(t, 0, 0.45) - 0.03 * k; roll = -2.7 * k; curl = ease(t / 0.8); stride = 0; }
  const f = frame(bx, by, 0, pitch, roll, 0);
  const T = torsoGroup(root, f);
  // body: a rounded back, a pale belly, a frilled head with fangs
  ball(T, 0.07, L.shell, -0.025, 0.005, 0, 1.4, 0.8, 0.9);
  ball(T, 0.06, L.belly, -0.01, -0.025, 0, 1.35, 0.55, 0.8);
  for (let i = 0; i < 3; i++) ball(T, 0.072, L.plate, -0.07 + i * 0.04, 0.012, 0, 0.2, 0.78, 0.92);
  ball(T, 0.045, L.plate, 0.1, 0.0, 0, 1.15, 0.85, 0.95);
  const fr = put(T, geo('frill', () => { const g = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2); return g; }), L.plate, 0.065, 0.03, 0);
  fr.scale.set(0.025, 0.11, 0.115); fr.rotation.z = 0.8;
  for (let i = 0; i < 7; i++) { const a = (i / 6 - 0.5) * 2.6; ball(T, 0.011, gl, 0.06 - 0.075 * Math.cos(a) * Math.sin(0.8), 0.03 + 0.1 * Math.cos(a) * Math.cos(0.8), Math.sin(a) * 0.105, 1, 1, 1, 8); }
  for (const s of [1, -1]) {
    ball(T, 0.011, gl, 0.13, 0.018, s * 0.022, 1, 0.8, 1, 8);
    const open = rake < 0 ? -rake : 0;
    seg(T, [0.135, -0.018, s * 0.02], [0.165 + 0.01 * open, -0.07, s * (0.012 + 0.02 * open)], 0.009, 0.001, L.bone, 5);
  }
  // hind legs: thigh goes up and back to a knee high over the body, shin down to the foot
  for (const s of [1, -1]) {
    const hip = f.tp([-0.05, 0.02, s * 0.05]);
    let foot = [-0.035 - 0.12 * hindPush, 0.0, s * 0.1];
    if (air) foot = lerpV(foot, f.tp([-0.26, -0.02 + 0.05 * tuck, s * 0.08]), air);
    if (anim === 'walk') foot[0] += 0.03 * Math.sin((t + (s > 0 ? 0 : 0.5)) * TAU);
    if (curl) foot = lerpV(foot, f.tp([-0.12, 0.16, s * 0.12]), curl * (0.7 + 0.3 * Math.sin(t * 30)));
    const [knee, ft] = ik(hip, foot, 0.14, 0.15, [-0.5, 1, 0]);
    seg(root, hip, knee, 0.028, 0.016, L.shell, 8);
    seg(root, knee, ft, 0.012, 0.005, L.leg, 6);
    ball(root, 0.014, gl, ...knee, 1, 1, 1, 8);
    for (let k = 1; k <= 2; k++) spike(root, lerpV(knee, ft, k * 0.3), [lerp(knee[0], ft[0], k * 0.3) - 0.02, lerp(knee[1], ft[1], k * 0.3) + 0.01, ft[2]], 0.004, L.plate, 4);
  }
  // four front legs (the first pair also rakes)
  const FRONT = [[0.06, 1, 0, 0.15, 0.08], [0.06, -1, 0.5, 0.15, 0.08], [0.0, 1, 0.5, 0.05, 0.11], [0.0, -1, 0, 0.05, 0.11]];
  FRONT.forEach(([hx, s, off, fx, fz], i) => {
    const hip = f.tp([hx, -0.03, s * 0.03]);
    const st = step(legPh + off, 0.55);
    let foot = [fx + st.u * stride, 0.03 * st.lift, s * fz];
    if (air) foot = lerpV(foot, f.tp([fx + 0.07, -0.04, s * fz * 0.8]), air);
    if (i < 2 && rake) foot = rake < 0 ? lerpV(foot, f.tp([0.16, 0.08, s * 0.06]), -rake) : lerpV(foot, [0.24, 0.0, s * 0.05], rake);
    if (curl) foot = lerpV(foot, f.tp([hx, 0.08, s * 0.05]), curl);
    const [knee, ft] = ik(hip, foot, 0.065, 0.085, [0, 1, s * 0.4]);
    seg(root, hip, knee, 0.009, 0.007, L.leg, 6); seg(root, knee, ft, 0.007, 0.002, L.leg, 6);
  });
  if (anim === 'die' && t > 0.35) { const k = (t - 0.35) / 0.65; splat(root, L.glow, k, -0.02, 0, 0.1); for (let i = 0; i < 4; i++) chunk(root, f.tp([0.0, 0.02, 0]), L.bits[i], k * 0.7, i % 2 ? L.plate : L.shell, 'ball'); }
}

// =====================================================================================================================
// Spitter — drawn at 2× (0.2 long): low six-legged body, the tail arches over the back to a glowing acid sac.
// =====================================================================================================================
const A_SPITTER = { walk: { label: 'Crawl', frames: 8, fps: 10 }, spit: { label: 'Spit', frames: 8, fps: 10 }, die: { label: 'Die', frames: 8, fps: 10, once: true } };
function spitterLook(p) {
  const L = mats(p);
  return { ...L, acid: '#a8ff2e', scale: 0.5 * jitter(p), drops: throws(L.R, 8, { spread: 0.35, up: 0.4, size: [0.02, 0.03] }), splats: Array.from({ length: 4 }, () => [L.R.range(-0.12, 0.12), L.R.range(-0.12, 0.12), L.R.range(0.04, 0.07)]) };
}
/** A point on a cubic curve. */
const bez = (a, b, c, d, u) => { const v = 1 - u; return [0, 1, 2].map(i => v * v * v * a[i] + 3 * v * v * u * b[i] + 3 * v * u * u * c[i] + u * u * u * d[i]); };
function drawSpitter(root, L, anim, t) {
  const alive = !(anim === 'die' && t > 0.32);
  const gl = lit(L.glow, alive, 0.7);
  let by = 0.085, pitch = 0, roll = 0, legPh = 0, stride = 0.09, back = 0, whip = 0, sacK = 1, glob = -1, curl = 0, burst = -1;
  if (anim === 'walk') { legPh = t; by += 0.006 * Math.cos(t * TAU * 2); roll = 0.03 * Math.sin(t * TAU); sacK = 1 + 0.05 * Math.sin(t * TAU * 2); }
  else if (anim === 'spit') {
    stride = 0;
    if (t < 0.4) { const k = ease(t / 0.4); back = k; sacK = 1 + 0.3 * k; pitch = 0.08 * k; }
    else if (t < 0.55) { const k = ease((t - 0.4) / 0.15); back = 1 - k; whip = k; sacK = 1.3 - 0.45 * k; pitch = 0.08 - 0.16 * k; }
    else { const k = ease((t - 0.55) / 0.45); whip = 1 - k; sacK = 0.85 + 0.15 * k; pitch = -0.08 * (1 - k); }
    if (t >= 0.5 && t < 0.95) glob = (t - 0.5) / 0.45;
  }
  else if (anim === 'die') { sacK = t < 0.3 ? 1 + 0.5 * ease(t / 0.3) : 0; burst = t < 0.3 ? -1 : (t - 0.3) / 0.7; const k = ease((t - 0.25) / 0.6); by = lerp(0.085, 0.05, k); roll = 0.5 * k; curl = k; stride = 0; }
  const f = frame(0, by, 0, pitch, roll, 0);
  const T = torsoGroup(root, f);
  // body + head
  ball(T, 0.07, L.shell, -0.01, 0, 0, 1.6, 0.62, 1.0);
  for (let i = 0; i < 4; i++) ball(T, 0.071, L.plate, -0.085 + i * 0.045, 0.006, 0, 0.18, 0.66, 1.02);
  ball(T, 0.045, L.belly, 0.0, -0.022, 0, 2.2, 0.4, 0.8);
  ball(T, 0.038, L.plate, 0.12, -0.002, 0, 1.2, 0.8, 1.0);
  for (const s of [1, -1]) { ball(T, 0.009, gl, 0.148, 0.012, s * 0.018, 1, 1, 1, 8); seg(T, [0.15, -0.015, s * 0.014], [0.18, -0.03, s * 0.006], 0.007, 0.001, L.dark, 5); }
  // the tail: a cubic arc from the rump over the back; the sac rides its end, nozzle forward
  const a = [-0.1, 0.03, 0], b = [-0.2, 0.15, 0];
  let c = [-0.13, 0.27, 0], d = [-0.01, 0.27, 0];
  c = lerpV(c, [-0.19, 0.25, 0], back); d = lerpV(d, [-0.08, 0.3, 0], back);
  c = lerpV(c, [-0.06, 0.3, 0], whip); d = lerpV(d, [0.07, 0.23, 0], whip);
  if (curl) { c = lerpV(c, [-0.24, 0.1, 0], curl); d = lerpV(d, [-0.26, 0.0, 0], curl); }
  const N = 7;
  for (let i = 0; i < N; i++) {
    const u0 = i / N, u1 = (i + 1) / N, p0 = bez(a, b, c, d, u0), p1 = bez(a, b, c, d, u1);
    seg(T, p0, p1, 0.032 - i * 0.002, 0.03 - i * 0.002, L.shell, 8);
    ball(T, 0.034 - i * 0.002, L.plate, ...p0, 1, 0.8, 1, 10);
  }
  const tip = bez(a, b, c, d, 1), tan = V(...tip).sub(V(...bez(a, b, c, d, 0.9))).normalize();
  const fwd = V(1, -0.15, 0).normalize().lerp(tan, 0.3).normalize();
  if (sacK > 0) {
    const r = 0.06 * sacK;
    ball(T, r, neonMat(L.acid, alive ? 0.55 : 0.3), tip[0] - fwd.x * 0.01, tip[1] + r * 0.4, 0, 1.15, 0.95, 1, 16);
    for (const z of [-0.6, 0, 0.6]) { const o = put(T, geo('rib', () => new THREE.TorusGeometry(1, 0.06, 5, 20, Math.PI)), L.dark, tip[0] - fwd.x * 0.01 + z * r * 0.85, tip[1] + r * 0.4, 0); o.scale.setScalar(r * Math.sqrt(1 - z * z * 0.7) * 1.02); o.rotation.y = Math.PI / 2; }
    const nz = [tip[0] + fwd.x * (r + 0.03), tip[1] + r * 0.3 + fwd.y * (r + 0.03), 0];
    seg(T, [tip[0], tip[1] + r * 0.3, 0], nz, 0.018, 0.01, L.dark, 8);
    ball(T, 0.011, neonMat(L.acid, 0.8), ...nz, 1, 1, 1, 8);
    marker(T, 'muzzle', ...nz);
    // the glob: a short arc out of the nozzle (the game draws the real projectile on from here)
    if (glob >= 0) { const k = glob; ball(T, 0.022 * (1 - 0.4 * k), neonMat(L.acid, 0.9), nz[0] + 0.3 * k, nz[1] + 0.12 * k - 0.1 * k * k, 0, 1.3, 1, 1, 10); }
  }
  // six legs, alternating tripods, low and splayed
  const LEGS = [[0.06, 1, 0, 0.13, 0.12], [0.0, -1, 0, 0.02, 0.15], [-0.06, 1, 0, -0.11, 0.13], [0.06, -1, 0.5, 0.13, 0.12], [0.0, 1, 0.5, 0.02, 0.15], [-0.06, -1, 0.5, -0.11, 0.13]];
  for (const [hx, s, off, fx, fz] of LEGS) {
    const hip = f.tp([hx, -0.015, s * 0.04]);
    const st = step(legPh + off, 0.5);
    let foot = [fx + st.u * stride, 0.035 * st.lift, s * fz];
    if (curl) foot = lerpV(foot, f.tp([hx, 0.03, s * 0.08]), curl * 0.8);
    const [knee, ft] = ik(hip, foot, 0.08, 0.1, [0, 1, s * 0.5]);
    seg(root, hip, knee, 0.011, 0.009, L.leg, 6); seg(root, knee, ft, 0.009, 0.002, L.leg, 6);
    ball(root, 0.009, L.plate, ...knee, 1, 1, 1, 6);
  }
  // burst: acid droplets fly out and fall, glowing splashes spread on the ground
  if (burst >= 0) {
    const sp = ease(burst * 1.5);
    for (const [x, z, r] of L.splats) disc(root, r * (0.4 + 0.6 * sp), 0.003, neonMat(L.acid, 0.35), x * sp, 0.003, z * sp, 16).castShadow = false;
    if (burst < 0.8) for (const pc of L.drops) chunk(root, [-0.02, 0.32, 0], pc, burst, neonMat(L.acid, 0.8), 'ball');
  }
}

// =====================================================================================================================
// Brute — drawn at 1× (~0.4 long): a pale horned armour plate across the whole front, glowing vents on its back.
// =====================================================================================================================
const A_BRUTE = { walk: { label: 'Walk', frames: 8, fps: 8 }, charge: { label: 'Charge', frames: 8, fps: 14 }, slam: { label: 'Slam', frames: 10, fps: 10 }, die: { label: 'Die', frames: 10, fps: 10, once: true } };
function bruteLook(p) { const L = mats(p); return { ...L, scale: 0.94 * jitter(p), vent: '#ff8a2e', shells: throws(L.R, 5, { spread: 0.35, up: 0.5, size: [0.05, 0.08] }) }; }
function drawBrute(root, L, anim, t) {
  const on = !(anim === 'die' && t > 0.6);
  const vent = lit(L.vent, on, 0.55), gl = lit(L.glow, on, 0.7);
  let bx = 0, by = 0.15, pitch = 0, roll = 0, legPh = 0, stride = 0.08, rear = 0, wave = -1, buckle = 0, plateOff = 0, lost = 0;
  if (anim === 'walk') { legPh = t; by += 0.008 * Math.cos(t * TAU * 2); roll = 0.04 * Math.sin(t * TAU); }
  else if (anim === 'charge') { legPh = t; stride = 0.15; by = 0.135 + 0.014 * Math.abs(Math.cos(t * TAU)); pitch = -0.14 + 0.04 * Math.sin(t * TAU * 2); bx = 0.02; }
  else if (anim === 'slam') {
    stride = 0;
    if (t < 0.4) { rear = ease(t / 0.4); }
    else if (t < 0.55) { rear = 1 - 1.3 * ease((t - 0.4) / 0.15); }
    else { rear = -0.3 * (1 - ease((t - 0.55) / 0.45)); }
    pitch = 0.62 * Math.max(0, rear) + 0.25 * Math.min(0, rear); by += 0.07 * Math.max(0, rear) + 0.05 * Math.min(0, rear); bx = -0.03 * Math.max(0, rear) + 0.06 * Math.max(0, -rear) / 0.3;
    if (t > 0.5) wave = (t - 0.5) / 0.5;
  }
  else if (anim === 'die') { buckle = ease(t / 0.7); by = lerp(0.15, 0.07, buckle); roll = 0.35 * buckle; pitch = -0.15 * buckle; stride = 0; plateOff = ease((t - 0.2) / 0.55); lost = clamp01((t - 0.15) / 0.85); }
  const f = frame(bx, by, 0, pitch, roll, 0);
  const T = torsoGroup(root, f);
  // body, belly, overlapping back shells with glowing vents between (its weak spot)
  ball(T, 0.13, L.shell, -0.05, 0, 0, 1.3, 0.68, 0.95);
  ball(T, 0.1, L.dark, -0.02, -0.04, 0, 1.4, 0.5, 0.85);
  for (let i = 0; i < 3; i++) {
    const x = 0.03 - i * 0.075, y = 0.055 - i * 0.008;
    if (lost > 0 && i > 0) { chunk(root, f.tp([x, y + 0.03, 0]), L.shells[i], lost, L.plate, 'ball'); continue; }
    const sh = ball(T, 0.105 - i * 0.008, L.plate, x, y, 0, 0.62, 0.42, 1.0); sh.rotation.z = 0.3 - i * 0.12;
    if (i < 2) for (const s of [1, -1]) cbox(T, 0.016, 0.012, 0.05, vent, x - 0.045, y + 0.03, s * 0.045);
  }
  if (lost > 0) for (const s of [1, -1]) cbox(T, 0.05, 0.012, 0.03, vent, -0.11, 0.05, s * 0.04);   // exposed core where the shells were
  for (let i = 0; i < 3; i++) for (const s of [1, -1]) ball(T, 0.01, gl, -0.08 - i * 0.045, -0.02, s * 0.118, 1, 1, 0.5, 8);
  // the front plate: a pale curved shield leaning back, rim spikes, two side horns and a nose horn; small head below
  const P = group(plateOff > 0 ? root : T, 'plate');
  if (plateOff > 0) { const pp = lerpV(f.tp([0.14, 0.03, 0]), [0.24, 0.035, 0.04], plateOff); P.position.set(...pp); P.rotation.set(0.3 * plateOff, 0, lerp(0.28, -1.45, plateOff)); }
  else { P.position.set(0.14, 0.03, 0); P.rotation.z = 0.28; }
  ball(P, 0.15, L.bone, 0, 0, 0, 0.3, 0.8, 1.22);
  ball(P, 0.15, L.dark, -0.012, 0, 0, 0.26, 0.74, 1.15);
  for (let k = -2; k <= 2; k++) spike(P, [0.0, 0.1 - Math.abs(k) * 0.012, k * 0.055], [-0.03, 0.16 - Math.abs(k) * 0.02, k * 0.07], 0.012, L.bone, 5);
  for (const s of [1, -1]) spike(P, [0.03, -0.02, s * 0.13], [0.13, 0.06, s * 0.18], 0.025, L.bone, 7);
  spike(P, [0.04, 0.0, 0], [0.12, 0.02, 0], 0.022, L.bone, 7);
  for (const s of [1, -1]) cbox(P, 0.006, 0.012, 0.035, lit(L.glow, on, 0.8), 0.045, 0.045, s * 0.06).rotation.x = s * 0.3;   // eye slits in the plate
  ball(T, 0.045, L.dark, 0.17, -0.07, 0, 1.2, 0.7, 1.1);
  for (const s of [-1, 0, 1]) ball(T, 0.008, gl, 0.21, -0.065, s * 0.022, 1, 1, 1, 8);
  // six thick legs, alternating tripods; the front pair lifts when it rears
  const LEGS = [[0.07, 1, 0, 0.17, 0.18], [-0.03, -1, 0, -0.01, 0.2], [-0.12, 1, 0, -0.17, 0.18], [0.07, -1, 0.5, 0.17, 0.18], [-0.03, 1, 0.5, -0.01, 0.2], [-0.12, -1, 0.5, -0.17, 0.18]];
  LEGS.forEach(([hx, s, off, fx, fz]) => {
    const hip = f.tp([hx, -0.035, s * 0.08]);
    const st = step(legPh + off, anim === 'charge' ? 0.42 : 0.55);
    let foot = [fx + st.u * stride, (anim === 'charge' ? 0.05 : 0.03) * st.lift, s * fz];
    if (rear > 0 && hx > 0) foot = lerpV(foot, f.tp([0.2, -0.02, s * 0.14]), rear);
    if (rear < 0 && hx > 0) foot = [0.22, 0, s * 0.17];
    if (buckle) foot = lerpV(foot, [fx * 1.25, 0, s * fz * 1.3], buckle);
    const [knee, ft] = ik(hip, foot, 0.11, 0.13, [hx > 0 ? -0.2 : 0.2, 1, s * 0.5]);
    seg(root, hip, knee, 0.036, 0.028, L.shell, 8); seg(root, knee, ft, 0.028, 0.012, L.leg, 8);
    ball(root, 0.03, L.plate, ...knee, 1, 1, 1, 8);
  });
  // the slam's shockwave
  if (wave >= 0 && wave < 0.95) {
    const r = 0.05 + 0.3 * ease(wave);
    ringFlat(root, r, 0.012 * (1 - wave * 0.6), neonMat(L.vent, 0.7), 0.26, 0.008, 0);
    if (wave < 0.45) for (let i = 0; i < 6; i++) { const a2 = i * TAU / 6; seg(root, [0.26 + Math.cos(a2) * 0.04, 0.01, Math.sin(a2) * 0.04], [0.26 + Math.cos(a2) * 0.1, 0.07 * (1 - wave), Math.sin(a2) * 0.1], 0.01, 0.0, L.dark, 5); }
  }
  if (anim === 'die' && t > 0.3) splat(root, L.vent, (t - 0.3) / 0.7, -0.05, 0, 0.14);
}

// =====================================================================================================================
// Burrower — a ringed worm ~0.3 tall that bursts out of a mound; a four-petal jaw with a glowing throat.
// =====================================================================================================================
const A_BURROW = { emerge: { label: 'Emerge', frames: 8, fps: 10, once: true }, attack: { label: 'Bite', frames: 8, fps: 10 }, burrow: { label: 'Burrow', frames: 8, fps: 10, once: true }, die: { label: 'Die', frames: 10, fps: 10, once: true } };
function burrowLook(p) {
  const L = mats(p);
  const dirt = Array.from({ length: 9 }, (_, i) => { const a = i * TAU / 9 + L.R.range(-0.3, 0.3); return [Math.cos(a), Math.sin(a), L.R.range(0.025, 0.04), L.R.range(0.09, 0.13)]; });
  return { ...L, scale: jitter(p), dirt, clods: throws(L.R, 10, { spread: 0.3, up: 0.45, size: [0.02, 0.04] }), soil: C('#4a3a2c', 0, 0.95), soilDark: C('#2f251c', 0, 1), bits: throws(L.R, 6, { spread: 0.3, up: 0.3, size: [0.04, 0.06] }) };
}
const WORM_N = 10, WORM_SEG = 0.04;
/** The spine: a chain from the ground up, each link turning a little; returns points + tangents. */
function wormSpine(lean, curl, n) {
  const pts = [[0, 0, 0]], tans = [];
  let a = 0.15 + lean;            // angle from vertical toward +x
  for (let i = 0; i < n; i++) {
    a += curl / n * (i < n / 2 ? 0.6 : 1.4);
    const p = pts[pts.length - 1], d = [Math.sin(a), Math.cos(a), 0];
    tans.push(d); pts.push([p[0] + d[0] * WORM_SEG, p[1] + d[1] * WORM_SEG, 0]);
  }
  return { pts, tans };
}
function drawBurrower(root, L, anim, t) {
  const on = !(anim === 'die' && t > 0.55);
  const gl = lit(L.glow, on, 0.7);
  let out = 1, lean = 0, curl = 0.9, open = 0.25, sway = 0, throwK = -1, topple = 0;
  if (anim === 'emerge') { out = ease(t / 0.8); throwK = t; open = bump(t, 0.6, 1.0) * 0.6; lean = -0.15 * (1 - out); }
  else if (anim === 'attack') { const l = lunge(t); lean = l < 0 ? -0.35 * -l : 0.5 * l; curl = l < 0 ? 0.9 + 0.3 * -l : 0.9 + 0.45 * l; open = l < 0 ? -l : clamp01(1 - l * 1.4); }
  else if (anim === 'burrow') { const k = ease(t / 0.85); out = 1 - k; lean = 0.6 * Math.min(1, t * 3); curl = 0.9 + 1.2 * Math.min(1, t * 3); open = 0; throwK = t * 0.6; }
  else if (anim === 'die') { topple = ease(t / 0.65); open = 1 - topple * 0.5; curl = 0.9 * (1 - topple); lean = -0.15 * topple; }
  const n = Math.max(0, Math.round(WORM_N * out));
  const sp = wormSpine(lean + sway, curl, WORM_N);
  // emerge / burrow: the worm slides along its own spine — only the top `n` links are above ground, so draw the
  // spine's last n points shifted down to start at the ground
  const W = group(root, 'worm');
  if (topple > 0) { W.rotation.z = -topple * 1.42; W.rotation.x = topple * 0.2; W.position.y = 0.05 * topple; }
  const shift = WORM_N - n;
  const base = sp.pts[shift];
  const P = i => [sp.pts[i][0] - base[0], sp.pts[i][1] - base[1] + (anim === 'attack' ? 0 : 0), 0];
  const under = i => topple === 0 && P(i)[1] < 0.015 && i > shift + 1;   // dived back under the street: not drawn
  for (let i = shift; i < WORM_N; i++) {
    if (under(i) || under(i + 1)) continue;
    const a = P(i), b = P(i + 1), r = 0.042 + 0.012 * (i / WORM_N);
    seg(W, a, b, r, r, L.shell, 10);
    const ring = put(W, geo('wring', () => new THREE.TorusGeometry(1, 0.22, 6, 18)), L.plate, ...lerpV(a, b, 0.5));
    ring.scale.setScalar(r * 1.02); ring.quaternion.setFromUnitVectors(V(0, 0, 1), V(...sp.tans[i]));
    if (i % 2 === 0) for (const s of [1, -1]) ball(W, 0.014, gl, ...lerpV(a, b, 0.5).map((v, k) => k === 2 ? s * r * 0.95 : v), 1, 1, 0.6, 8);
  }
  // head + jaw: four petals round a glowing throat, opening wide to bite
  if (n > 0 && !under(WORM_N)) {
    const tipP = P(WORM_N), tan = V(...sp.tans[WORM_N - 1]);
    const H = group(W, 'head', ...tipP); H.quaternion.setFromUnitVectors(V(0, 1, 0), tan);
    ball(H, 0.058, L.plate, 0, 0.0, 0, 1, 0.7, 1, 14);
    disc(H, 0.034, 0.01, lit(L.glow, on, 0.8), 0, 0.028, 0, 14);
    for (let i = 0; i < 8; i++) { const a = i * TAU / 8; spike(H, [Math.cos(a) * 0.028, 0.03, Math.sin(a) * 0.028], [Math.cos(a) * 0.016, 0.05, Math.sin(a) * 0.016], 0.005, L.bone, 4); }
    for (let i = 0; i < 4; i++) {
      const a = i * TAU / 4 + Math.PI / 4, ca = Math.cos(a), sa = Math.sin(a), sp2 = 0.25 + 1.0 * open;
      const b0 = [ca * 0.045, 0.02, sa * 0.045], tip2 = [ca * (0.045 + 0.06 * Math.sin(sp2)), 0.02 + 0.075 * Math.cos(sp2), sa * (0.045 + 0.06 * Math.sin(sp2))];
      seg(H, b0, tip2, 0.026, 0.004, L.shell, 6);
      spike(H, lerpV(b0, tip2, 0.5), [lerpV(b0, tip2, 0.5)[0] * 0.7, lerpV(b0, tip2, 0.5)[1] + 0.01, lerpV(b0, tip2, 0.5)[2] * 0.7], 0.005, L.bone, 4);
    }
    marker(H, 'muzzle', 0, 0.05, 0);
  }
  // the mound: a ring of heaped soil with a dark hole, clods thrown on emerge/burrow
  for (const [cx, cz, r, d] of L.dirt) hemi(root, r * 1.6, L.soil, cx * d, 0.0, cz * d, 1, 0.55, 1, 10);
  disc(root, 0.07, 0.006, L.soilDark, 0, 0.002, 0, 16);
  // glowing cracks round the hole: the warning that something is coming up (bright before it emerges)
  const warn = anim === 'emerge' ? 1 - 0.6 * clamp01(t / 0.6) : 0.4;
  for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + 0.3; const c = cbox(root, 0.09 + 0.03 * (i % 2), 0.004, 0.008 + 0.006 * warn, lit(L.glow, on, 0.3 + 0.5 * warn), Math.cos(a) * 0.12, 0.003, Math.sin(a) * 0.12); c.rotation.y = -a; c.castShadow = false; }
  if (throwK >= 0) for (const pc of L.clods) chunk(root, [0, 0.03, 0], pc, Math.min(1, throwK * 1.3), pc.pick < 0.5 ? L.soil : L.soilDark, 'ball');
  if (anim === 'die' && t > 0.4) { splat(root, L.glow, (t - 0.4) / 0.6, 0.12, 0, 0.11); for (let i = 0; i < 4; i++) chunk(root, [0.1, 0.12, 0], L.bits[i], (t - 0.4) / 0.6, L.plate, 'ball'); }
}

// =====================================================================================================================
// Bloater — a waddling glowing gas sac caged in dark ribs (~0.18 tall); swells, then bursts.
// =====================================================================================================================
const A_BLOAT = { walk: { label: 'Waddle', frames: 8, fps: 8 }, swell: { label: 'Swell', frames: 8, fps: 10 }, burst: { label: 'Burst', frames: 10, fps: 12, once: true } };
function bloatLook(p) { const L = mats(p); return { ...L, gas: '#d8ff4a', scale: jitter(p), shards: throws(L.R, 10, { spread: 0.45, up: 0.5, size: [0.03, 0.05] }), puffs: throws(L.R, 7, { spread: 0.25, up: 0.08, size: [0.05, 0.08] }) }; }
function drawBloater(root, L, anim, t) {
  let by = 0.1, roll = 0, pitch = 0, legPh = 0, stride = 0.05, swell = 1, pulse = 0, gone = -1;
  if (anim === 'walk') { legPh = t; roll = 0.12 * Math.sin(t * TAU); by += 0.01 * Math.abs(Math.sin(t * TAU)); swell = 1 + 0.04 * Math.sin(t * TAU * 2); }
  else if (anim === 'swell') { swell = 1.18 + 0.2 * Math.sin(t * TAU) ** 2 + 0.06 * Math.sin(t * TAU * 4); pulse = 0.5 + 0.5 * Math.sin(t * TAU * 2); stride = 0; by = 0.1 + 0.015 * swell; }
  else if (anim === 'burst') { if (t < 0.15) { swell = 1.45 + t; pulse = 1; } else gone = (t - 0.15) / 0.85; stride = 0; }
  const f = frame(0, by, 0, pitch, roll, 0);
  const T = torsoGroup(root, f);
  const R = 0.08 * swell;
  if (gone < 0) {
    ball(T, R, neonMat(pulse > 0.6 ? '#f4ffb0' : L.gas, 0.45 + 0.3 * pulse), -0.01, 0.025, 0, 1.15, 0.95, 1, 18);
    for (const x of [-0.6, -0.2, 0.2, 0.6]) {
      const rr = R * Math.sqrt(1 - x * x) * 1.03;
      const o = put(T, geo('brib', () => new THREE.TorusGeometry(1, 0.07, 6, 24, Math.PI * 1.25)), L.dark, -0.01 + x * R * 1.15, 0.025, 0);
      o.scale.set(rr, rr, rr); o.rotation.set(0, Math.PI / 2, -Math.PI / 8);
    }
    ball(T, R * 0.75, L.plate, -0.01, 0.025 + R * 0.62, 0, 1.3, 0.35, 0.9);
    for (let i = 0; i < 4; i++) spike(T, [-0.05 + i * 0.03, 0.025 + R * 0.85, 0], [-0.07 + i * 0.03, 0.025 + R * 0.85 + 0.03, 0], 0.008, L.bone, 4);
  }
  // head low at the front, two eyes
  if (gone < 0) {
    ball(T, 0.035, L.shell, 0.085, -0.035, 0, 1.1, 0.85, 1.1);
    for (const s of [1, -1]) ball(T, 0.008, lit(L.glow, true, 0.8), 0.112, -0.025, s * 0.016, 1, 1, 1, 8);
  }
  // four stubby legs
  for (const [hx, hz, off] of [[0.05, 1, 0], [0.05, -1, 0.5], [-0.06, 1, 0.5], [-0.06, -1, 0]]) {
    const hip = f.tp([hx, -0.05, hz * 0.05]);
    const st = step(legPh + off, 0.55);
    let foot = [hx * 1.3 + st.u * stride, 0.025 * st.lift, hz * 0.1];
    if (gone >= 0) { const k = ease(gone * 2); foot = lerpV(foot, [hx * 1.8, 0, hz * 0.14], k); }
    const [knee, ft] = ik(hip, foot, 0.05, 0.065, [0, 1, hz * 0.5]);
    seg(root, hip, knee, 0.016, 0.013, L.shell, 7); seg(root, knee, ft, 0.013, 0.006, L.leg, 7);
  }
  // the burst: shell shards fly, a cloud of glowing gas swells and fades, a splash soaks the ground
  if (gone >= 0) {
    for (let i = 0; i < L.shards.length; i++) chunk(root, f.tp([0, 0.03, 0]), L.shards[i], gone * 0.9, i % 3 ? L.dark : L.plate);
    const cloud = 1 - ease((gone - 0.2) / 0.8);
    if (cloud > 0.02) for (const pf of L.puffs) { const k = ease(gone / 0.5); ball(root, pf.size * (0.5 + 0.7 * k) * cloud, neonMat(L.gas, 0.5), pf.v[0] * k, by + 0.03 + pf.v[1] * k, pf.v[2] * k, 1, 0.8, 1, 10).castShadow = false; }
    splat(root, L.gas, gone * 1.4, 0, 0, 0.2);
  }
}

// =====================================================================================================================
// Hive — a ribbed mound with roots and pores; petal mouths open to let swarmers out. 1×1 or 2×2 lot.
// =====================================================================================================================
const A_HIVE = { idle: { label: 'Pulse', frames: 6, fps: 6 }, spawn: { label: 'Spawn', frames: 12, fps: 10 }, die: { label: 'Die', frames: 12, fps: 10, once: true } };
function hiveLook(big) {
  return p => {
    const L = mats(p), R = L.R;
    // mounds: [x, z, radius, height]; the great hive has a main mound and three smaller ones
    const mounds = big ? [[0, 0, 0.42, 0.85], [0.48, -0.42, 0.22, 0.42], [-0.46, 0.4, 0.24, 0.48], [-0.42, -0.48, 0.18, 0.3]] : [[0, 0, 0.27, 0.48]];
    const roots = Array.from({ length: big ? 14 : 8 }, (_, i) => { const a = i * TAU / (big ? 14 : 8) + R.range(-0.2, 0.2); return { a, len: (big ? 0.9 : 0.45) * R.range(0.8, 1.0), bend: R.range(-0.5, 0.5) }; });
    const pores = mounds.map(([, , r]) => Array.from({ length: Math.round(5 + r * 12) }, (_, i) => ({ a: i * 2.4 + R.range(-0.3, 0.3), v: R.range(0.12, 0.62), r: R.range(0.022, 0.034) * (r / 0.27) ** 0.6 })));
    const lumps = mounds.map(([, , r]) => Array.from({ length: 5 }, (_, i) => ({ a: i * TAU / 5 + R.range(-0.4, 0.4), d: r * R.range(0.75, 0.95), s: r * R.range(0.38, 0.5) })));
    return { ...L, big, mounds, roots, pores, lumps, scale: 1, flesh: C(shade(skinOf(p).belly, -0.08), 0.05, 0.45), lip: C(shade(skinOf(p).belly, 0.1), 0.05, 0.4), chunks: throws(R, 12, { spread: 0.5, up: 0.6, size: [0.05, 0.09] }) };
  };
}
function drawHive(root, L, anim, t) {
  const on = !(anim === 'die' && t > 0.55);
  let open = 0.12, breathe = 0.02 * Math.sin(t * TAU), sink = 0, crack = 0, spawn = -1;
  if (anim === 'spawn') { open = t < 0.25 ? 0.12 + 0.88 * ease(t / 0.25) : t > 0.85 ? 1 - 0.88 * ease((t - 0.85) / 0.15) : 1; spawn = clamp01((t - 0.2) / 0.7); breathe = 0.03 * bump(t, 0, 0.3); }
  else if (anim === 'die') { crack = ease(t / 0.35); sink = ease((t - 0.25) / 0.7); open = 0.12 + 0.5 * crack; breathe = 0; }
  const pulse = anim === 'idle' ? 0.5 + 0.5 * Math.sin(t * TAU) : anim === 'spawn' ? 1 : 0;
  const gl = lit(L.glow, on, 0.5 + 0.3 * pulse);
  // roots: dark ridged tendrils spreading over the ground
  for (const r of L.roots) {
    let p0 = [0, 0.01, 0]; const n = 4;
    for (let i = 1; i <= n; i++) {
      const u = i / n, a = r.a + r.bend * u, d = r.len * u * (L.big ? 1 : 1);
      const p1 = [Math.cos(a) * d, 0.012 * (1 - u) + 0.004, Math.sin(a) * d];
      seg(root, p0, p1, (L.big ? 0.05 : 0.03) * (1.1 - u * 0.8), (L.big ? 0.05 : 0.03) * (1.1 - (u) * 0.9), L.dark, 6);
      if (i === 2 || i === 4) ball(root, 0.012 * (L.big ? 1.4 : 1), gl, ...p1, 1, 0.6, 1, 8);
      p0 = p1;
    }
  }
  L.mounds.forEach(([x, z, r, h], mi) => {
    const hh = h * (1 + breathe) * (1 - 0.55 * sink);
    const M = group(root, 'mound', x, 0, z);
    // a wide dark base with fleshy lumps round it, a pale swollen middle, a ribbed neck up to the mouth
    hemi(M, r * 1.12, L.shell, 0, 0, 0, 1, hh * 0.42 / (r * 1.12), 1, 22);
    for (const l of L.lumps[mi]) hemi(M, l.s, L.flesh, Math.cos(l.a) * l.d, 0, Math.sin(l.a) * l.d, 1, 0.85 * (1 - 0.5 * sink), 1, 14);
    ball(M, r * 0.78, L.flesh, 0, hh * 0.45, 0, 1, hh * 0.3 / (r * 0.78), 1, 20);
    seg(M, [0, hh * 0.5, 0], [0, hh * 0.92, 0], r * 0.5, r * 0.36, L.shell, 14);
    const lip = put(M, geo('hlip', () => new THREE.TorusGeometry(1, 0.28, 8, 20)), L.lip, 0, hh * 0.93, 0); lip.scale.setScalar(r * 0.36); lip.rotation.x = Math.PI / 2;
    const ribs = 6;
    for (let i = 0; i < ribs; i++) {
      const a = i * TAU / ribs + mi + 0.3;
      const pts = [[r * 1.12, 0.0], [r * 1.0, hh * 0.25], [r * 0.7, hh * 0.52], [r * 0.48, hh * 0.72], [r * 0.4, hh * 0.92]];
      for (let k = 0; k < 4; k++) { const A = pts[k], B = pts[k + 1]; seg(M, [Math.cos(a) * A[0], A[1], Math.sin(a) * A[0]], [Math.cos(a) * B[0], B[1], Math.sin(a) * B[0]], r * 0.085, r * 0.07, L.plate, 6); }
    }
    // pores: dark sockets with a glowing bead inside, pulsing
    for (const pr of L.pores[mi]) {
      const y = hh * (0.08 + pr.v * 0.62), rr = (pr.v < 0.35 ? r * 1.1 * Math.sqrt(1 - (y / (hh * 0.42)) ** 2) : r * 0.78 * Math.sqrt(Math.max(0, 1 - ((y - hh * 0.45) / (hh * 0.3)) ** 2))) * 0.97;
      const px = Math.cos(pr.a) * rr, pz = Math.sin(pr.a) * rr;
      ball(M, pr.r * 1.3, L.dark, px * 0.97, y, pz * 0.97, 1, 1, 1, 10);
      ball(M, pr.r * (0.85 + 0.3 * pulse), gl, px * 1.0 + Math.cos(pr.a) * pr.r * 0.7, y + pr.r * 0.2, pz * 1.0 + Math.sin(pr.a) * pr.r * 0.7, 1, 1, 1, 10);
    }
    // the mouth: a glowing throat ringed by petals that open outward
    const top = hh * 0.96, mr = r * 0.3;
    disc(M, mr * 0.85, 0.01, lit(L.glow, on, 0.8), 0, top - 0.005, 0, 16);
    const petals = 5;
    for (let i = 0; i < petals; i++) {
      const a = i * TAU / petals + mi * 0.4, ca = Math.cos(a), sa = Math.sin(a);
      if (crack > 0.3 && i % 2 === 0) { chunk(root, [x + ca * mr, top, z + sa * mr], L.chunks[(i + mi) % L.chunks.length], (crack - 0.3) / 0.7 * 0.8, L.plate); continue; }
      const ang = lerp(0.15, 1.35, open), len = r * 0.6;
      const b0 = [ca * mr, top - 0.01, sa * mr], tip = [ca * (mr + Math.sin(ang) * len), top - 0.01 + Math.cos(ang) * len, sa * (mr + Math.sin(ang) * len)];
      seg(M, b0, tip, r * 0.15, r * 0.02, L.bone, 6);
      ball(M, r * 0.04, gl, ...lerpV(b0, tip, 0.6), 1, 1, 1, 6);
    }
    if (mi === 0) marker(M, 'muzzle', 0, top + 0.02, 0);
    // spawn: a swarmer crawls up out of the mouth and down the side toward the viewer
    if (spawn >= 0 && (mi === 0 || (L.big && mi === 1))) {
      const k = clamp01(spawn * (mi === 0 ? 1 : 1.25) - (mi === 0 ? 0 : 0.25));
      const S = group(M, 'spawnling');
      const s = L.big ? 1.0 : 0.85;
      const pos = k < 0.3 ? [0, lerp(top - 0.08, top + 0.03, ease(k / 0.3)), 0] : [lerp(0, r * 1.15, ease((k - 0.3) / 0.7)), lerp(top + 0.03, 0.02, ease((k - 0.3) / 0.7) ** 1.3), 0];
      S.position.set(...pos); S.rotation.y = -Math.PI / 4; S.rotation.z = k < 0.3 ? 1.2 : -0.6 * (1 - ease((k - 0.3) / 0.7));
      const inner = group(S); inner.scale.setScalar(0.335 * s);
      drawSwarmer(inner, L, 'walk', (k * 4) % 1);
    }
  });
  // death: chunks of shell fly, a glowing ooze spreads
  if (crack > 0) for (let i = 0; i < 8; i++) { const [x, z, r, h] = L.mounds[i % L.mounds.length]; chunk(root, [x, h * 0.6, z], L.chunks[i], ease((t - 0.15) / 0.8), i % 2 ? L.shell : L.plate); }
  if (anim === 'die' && t > 0.3) splat(root, L.glow, (t - 0.3) / 0.7, 0, 0, L.big ? 0.75 : 0.36);
}

// =====================================================================================================================
// Broodmother — the boss, ~1.75 long and ~1 tall. Breakable parts (named groups `part:<name>`, a stump when broken):
//   claw-left, claw-right (the great front scythes), sac-left, sac-right (glowing egg clusters on the abdomen),
//   crest (the crown of spines over the head).
// =====================================================================================================================
const BROOD_PARTS = ['claw-left', 'claw-right', 'sac-left', 'sac-right', 'crest'];
const A_BROOD = {
  crawl: { label: 'Crawl', frames: 10, fps: 8 }, spit: { label: 'Spit', frames: 8, fps: 10 }, summon: { label: 'Summon', frames: 12, fps: 10 },
  roar: { label: 'Roar', frames: 12, fps: 10 }, die: { label: 'Die', frames: 14, fps: 10, once: true },
};
function broodLook(p) {
  const L = mats(p), R = L.R;
  const crest = Array.from({ length: 7 }, (_, i) => ({ z: (i - 3) * 0.07, len: (0.4 - Math.abs(i - 3) * 0.06) * R.range(0.9, 1.1), lean: R.range(-0.08, 0.08) }));
  const sk = skinOf(p);
  const eggs = Array.from({ length: 6 }, (_, i) => [R.range(-0.18, 0.18), R.range(-0.08, 0.1), R.range(0.0, 0.06), R.range(0.055, 0.085)]);
  return { ...L, shell: C(shade(sk.shell, 0.12), 0.3, 0.35), plate: C(shade(sk.plate, 0.22), 0.3, 0.4), band: C(shade(sk.belly, -0.12), 0.1, 0.45), crest, eggs, acid: '#a8ff2e', scale: jitter(p) * 0.88, bits: throws(R, 14, { spread: 0.7, up: 0.8, size: [0.07, 0.13] }) };
}
function drawBrood(root, L, anim, t, st, p) {
  const on = !(anim === 'die' && t > 0.6);
  const gl = lit(L.glow, on, 0.7), acid = lit(L.acid, on, 0.6);
  const broken = name => st.broken.has(name) || !!p[partKey(name)];
  let bx = 0, by = 0.5, pitch = 0.04, roll = 0, legPh = 0, stride = 0.22, mouth = 0.2, clawUp = 0, clawStab = 0, crestUp = 0, abdLift = 0, sacGlow = 0.6, die = 0, spitK = -1, summonK = -1;
  if (anim === 'crawl') { legPh = t; by += 0.02 * Math.cos(t * TAU * 2); roll = 0.03 * Math.sin(t * TAU); pitch = 0.04 + 0.015 * Math.sin(t * TAU * 2); clawStab = 0.15 * Math.sin(t * TAU); }
  else if (anim === 'spit') { const l = lunge(t); pitch = l < 0 ? 0.04 + 0.22 * -l : 0.04 - 0.12 * l; by += 0.05 * Math.max(0, -l); mouth = l < 0 ? 0.2 + 0.8 * -l : 1 - 0.8 * l; stride = 0; if (t > 0.48 && t < 0.95) spitK = (t - 0.48) / 0.47; }
  else if (anim === 'summon') { abdLift = 2 * bump(t, 0, 1); sacGlow = 0.6 + 0.4 * Math.sin(t * TAU * 3) ** 2; stride = 0; summonK = t; by += 0.03 * abdLift; }
  else if (anim === 'roar') { const r = t < 0.3 ? ease(t / 0.3) : t < 0.75 ? 1 : 1 - ease((t - 0.75) / 0.25); pitch = 0.04 + 0.45 * r; by += 0.12 * r; bx = -0.06 * r; clawUp = r; crestUp = r; mouth = 0.2 + 0.8 * r * (0.85 + 0.15 * Math.sin(t * TAU * 6)); stride = 0; }
  else if (anim === 'die') { die = ease(t / 0.75); by = lerp(0.5, 0.2, die); pitch = lerp(0.04, -0.2, die) + 0.25 * bump(t, 0, 0.3); roll = 0.3 * die; stride = 0; mouth = 1 - die * 0.6; sacGlow = 1 - die; }
  const f = frame(bx, by, 0, pitch, roll, 0);
  const T = torsoGroup(root, f, 'torso');
  // cephalothorax: armoured, with plates; head forward with mandibles and an eye cluster
  ball(T, 0.27, L.shell, 0.22, 0.02, 0, 1.25, 0.7, 1.0, 22);
  for (let i = 0; i < 3; i++) ball(T, 0.24 - i * 0.03, L.plate, 0.32 - i * 0.12, 0.06 + i * 0.005, 0, 0.55, 0.62, 1.02, 18);
  ball(T, 0.16, L.dark, 0.25, -0.1, 0, 1.6, 0.5, 0.9, 16);
  ball(T, 0.13, L.plate, 0.55, 0.0, 0, 1.15, 0.85, 1.0, 18);
  for (const [x, y, z, r] of [[0.66, 0.06, 0.05, 0.022], [0.66, 0.06, -0.05, 0.022], [0.68, 0.0, 0.085, 0.016], [0.68, 0.0, -0.085, 0.016], [0.63, 0.1, 0.0, 0.018]]) ball(T, r, gl, x, y, z, 1, 1, 1, 10);
  for (const s of [1, -1]) {
    const open = 0.3 + 0.9 * mouth;
    const a = [0.64, -0.08, s * 0.05], b = [0.75 + 0.03 * open, -0.13 - 0.02 * open, s * (0.06 + 0.07 * open)], c = [0.84, -0.17, s * (0.01 + 0.07 * open)];
    seg(T, a, b, 0.03, 0.022, L.bone, 8); seg(T, b, c, 0.022, 0.002, L.bone, 8);
  }
  ball(T, 0.045, lit(L.acid, on, 0.8), 0.69, -0.07, 0, 1, 0.6 + 0.6 * mouth, 1, 12);   // the glowing maw
  marker(T, 'muzzle', 0.74, -0.06, 0);
  if (spitK >= 0) { const k = spitK; ball(T, 0.05 * (1 - 0.3 * k), neonMat(L.acid, 0.9), 0.76 + 0.6 * k, -0.06 + 0.2 * k - 0.25 * k * k, 0, 1.3, 1, 1, 12); }
  // crest: a crown of spines on the thorax, membranes glowing between; flares up on the roar
  if (!broken('crest')) {
    const Cr = group(T, 'part:crest', 0.36, 0.17, 0); Cr.rotation.z = 0.5 - 0.45 * crestUp;
    for (const c of L.crest) {
      spike(Cr, [0, 0, c.z], [-0.05 + c.lean, c.len * (1 + 0.25 * crestUp), c.z * (1.25 + 0.4 * crestUp)], 0.03, L.bone, 6);
      ball(Cr, 0.024, gl, -0.025, c.len * 0.5, c.z * 1.15, 1, 1.4, 1, 8);
    }
  } else {
    const S = group(T, 'stump:crest', 0.36, 0.17, 0); S.rotation.z = 0.5;
    for (const c of L.crest) { spike(S, [0, 0, c.z], [-0.01, c.len * 0.25, c.z * 1.05], 0.03, L.dark, 6); }
    ball(S, 0.05, acid, 0, 0.02, 0, 1.6, 0.4, 3, 10);
  }
  // abdomen: a huge raised segmented sac behind, lifting on the summon
  const Ab = torsoGroup(T, frame(-0.1, 0.03, 0, 0.18 + 0.25 * abdLift, 0, 0), 'abdomen');
  ball(Ab, 0.42, L.band, -0.38, 0.06, 0, 1.18, 0.78, 0.92, 24);
  for (let i = 0; i < 5; i++) ball(Ab, 0.405 - Math.abs(i - 1.5) * 0.04, i % 2 ? L.shell : L.plate, -0.14 - i * 0.12, 0.12, 0, 0.2, 0.75, 0.96, 18);
  for (let i = 0; i < 4; i++) for (const s of [1, -1]) ball(Ab, 0.032, gl, -0.2 - i * 0.12, 0.38 - Math.abs(i - 1.5) * 0.035, s * 0.09, 1, 0.6, 1, 10);
  seg(Ab, [-0.12, 0.39, 0], [-0.62, 0.36, 0], 0.012, 0.01, gl, 6);   // glowing seam along the ridge
  spike(Ab, [-0.8, 0.1, 0], [-0.93, 0.02, 0], 0.07, L.plate, 8);
  // egg sacs on each flank (breakable)
  for (const [name, s] of [['sac-left', 1], ['sac-right', -1]]) {
    if (!broken(name)) {
      const Sg = group(Ab, 'part:' + name, -0.4, 0.04, s * 0.34);
      for (const [x, y, z, r] of L.eggs) ball(Sg, r * (1 + 0.12 * sacGlow), neonMat(L.acid, on ? 0.35 + 0.35 * sacGlow : 0.0), x, y, s * z, 1, 1.1, 1, 12);
      const mem = ball(Sg, 0.2, C(shade(skinOf(p).belly, -0.3), 0.05, 0.4), -0.0, 0.0, -s * 0.05, 1.3, 0.8, 0.45, 16);
      mem.castShadow = false;
    } else {
      const Sg = group(Ab, 'stump:' + name, -0.4, 0.04, s * 0.31);
      ball(Sg, 0.12, L.dark, 0, 0, 0, 1.5, 0.8, 0.35, 12);
      ball(Sg, 0.07, acid, 0, 0, s * 0.02, 1.4, 0.7, 0.3, 10);
      for (let i = 0; i < 3; i++) seg(Sg, [-0.06 + i * 0.06, -0.02, s * 0.03], [-0.06 + i * 0.06, -0.09 - i * 0.02, s * 0.05], 0.012, 0.003, acid, 5);
    }
  }
  // summon: little swarmers drop from under the abdomen and scurry out
  if (summonK >= 0) for (let i = 0; i < 3; i++) {
    const k = clamp01(summonK * 1.6 - i * 0.3); if (k <= 0) continue;
    const S = group(root, 'brood'); const side = i - 1;
    S.position.set(lerp(-0.45, -0.75 - 0.1 * i, ease(k)), Math.max(0, lerp(0.3, 0, ease(k / 0.4))), side * lerp(0.05, 0.5, ease(k)));
    S.rotation.y = -Math.PI - side * 0.8;
    const inner = group(S); inner.scale.setScalar(0.335);
    drawSwarmer(inner, L, 'walk', (k * 3) % 1);
  }
  // the great claws: shoulder → upper arm → a long hooked scythe; raised on the roar
  for (const [name, s] of [['claw-left', 1], ['claw-right', -1]]) {
    const sh = [0.45, -0.02, s * 0.16];
    if (broken(name)) {
      const S = group(T, 'stump:' + name);
      const el = [0.6, 0.06, s * 0.26];
      seg(S, sh, el, 0.06, 0.05, L.shell, 10); ball(S, 0.05, acid, ...el, 1, 1, 1, 10);
      for (let i = 0; i < 3; i++) spike(S, el, [el[0] + 0.03 + i * 0.01, el[1] - 0.03 - i * 0.03, el[2] + s * 0.02], 0.012, acid, 4);
      continue;
    }
    const Cg = group(T, 'part:' + name);
    let el = [0.62, 0.22 + 0.04 * clawStab, s * 0.3], tip = [0.95 + 0.04 * clawStab, -0.05 - 0.06 * clawStab, s * 0.24];
    if (clawUp) { el = lerpV(el, [0.48, 0.55, s * 0.4], clawUp); tip = lerpV(tip, [0.8, 0.75, s * 0.55], clawUp); }
    if (die && on === false) tip = lerpV(tip, [0.9, -0.3, s * 0.35], die);
    seg(Cg, sh, el, 0.065, 0.05, L.shell, 10);
    ball(Cg, 0.055, L.plate, ...el, 1, 1, 1, 12);
    seg(Cg, el, tip, 0.055, 0.008, L.bone, 10);
    const mid = lerpV(el, tip, 0.55);
    spike(Cg, mid, [mid[0] - 0.03, mid[1] - 0.09, mid[2]], 0.018, L.bone, 5);
    spike(Cg, lerpV(el, tip, 0.3), [lerpV(el, tip, 0.3)[0] - 0.02, lerpV(el, tip, 0.3)[1] - 0.07, lerpV(el, tip, 0.3)[2]], 0.014, L.bone, 5);
    for (let i = 0; i < 3; i++) ball(Cg, 0.012, gl, ...lerpV(el, tip, 0.15 + i * 0.2), 1, 1, 1, 8);
  }
  // six walking legs (three each side), long, knees high
  const LEGS = [[0.32, 1, 0, 0.55, 0.62], [0.18, -1, 0.0, 0.18, 0.78], [0.04, 1, 0.0, -0.25, 0.7], [0.32, -1, 0.5, 0.55, 0.62], [0.18, 1, 0.5, 0.18, 0.78], [0.04, -1, 0.5, -0.25, 0.7]];
  LEGS.forEach(([hx, s, off, fx, fz], i) => {
    const hip = f.tp([hx, -0.05, s * 0.17]);
    const stp = step(legPh + off + i * 0.04, 0.6);
    let foot = [fx + stp.u * stride, 0.08 * stp.lift, s * fz];
    if (anim === 'roar' && hx > 0.25) foot = lerpV(foot, f.tp([0.55, 0.0, s * 0.45]), clawUp * 0.6);
    if (die) foot = lerpV(foot, [fx * 1.15, 0, s * (fz + 0.15)], die);
    const [knee, ft] = ik(hip, foot, 0.5, 0.62, [fx * 0.2, 1, s * 0.35]);
    seg(root, hip, knee, 0.05, 0.04, L.shell, 10); seg(root, knee, ft, 0.04, 0.008, L.leg, 10);
    ball(root, 0.045, L.plate, ...knee, 1, 1, 1, 10);
    ball(root, 0.016, gl, ...lerpV(knee, ft, 0.12), 1, 1, 1, 8);
  });
  // death: armour chunks blow out, the sacs burst into a glowing pool
  if (anim === 'die' && t > 0.25) {
    const k = (t - 0.25) / 0.75;
    for (let i = 0; i < 10; i++) chunk(root, f.tp([0.0 - i * 0.05, 0.25, (i % 3 - 1) * 0.1]), L.bits[i], k * 0.9, i % 2 ? L.plate : L.shell, i % 3 ? 'box' : 'ball');
    splat(root, L.acid, k * 1.3, -0.3, 0, 0.7);
  }
}

// ---------- recipes ----------
const common = { group: 'swarm', genre: ['alien'], dirs: 16, noStyle: true };
const breakParams = BROOD_PARTS.map(n => ({ key: partKey(n), label: { 'claw-left': 'Left claw', 'claw-right': 'Right claw', 'sac-left': 'Left egg sac', 'sac-right': 'Right egg sac', crest: 'Crest' }[n], min: 0, max: 1, step: 1, def: 0, names: ['Whole', 'Shot off'] }));
addRecipes({
  'sw-swarmer': {
    ...common, name: 'Swarmer', size: [1, 1], anims: A_SWARMER, dims: { len: 0.13, h: 0.08 },
    blurb: 'The swarm\'s trash, hundreds at once: a low runner about 2 m long with two raised scythe arms and a spiked tail.',
    params: [skinParam], build: poseable(A_SWARMER, swarmerLook, drawSwarmer),
  },
  'sw-leaper': {
    ...common, name: 'Leaper', size: [1, 1], anims: A_LEAPER, dims: { len: 0.17, h: 0.11 },
    blurb: 'Pounces: crouches on huge folded hind legs and leaps at the mech from a distance. A frilled head with fangs.',
    params: [skinParam], build: poseable(A_LEAPER, leaperLook, drawLeaper),
  },
  'sw-spitter': {
    ...common, name: 'Spitter', size: [1, 1], anims: A_SPITTER, dims: { len: 0.19, h: 0.23 },
    blurb: 'Hangs back and lobs acid in arcs from the glowing sac at the end of its tail. Bursts when it dies.',
    params: [skinParam], build: poseable(A_SPITTER, spitterLook, drawSpitter),
  },
  'sw-brute': {
    ...common, name: 'Brute', size: [1, 1], anims: A_BRUTE, dims: { len: 0.44, h: 0.31 },
    blurb: 'Six thick legs and a horned armour plate across its whole front: flank it and shoot the glowing vents on its back.',
    params: [skinParam], build: poseable(A_BRUTE, bruteLook, drawBrute),
  },
  'sw-burrower': {
    ...common, name: 'Burrower', size: [1, 1], anims: A_BURROW, dims: { h: 0.42 },
    blurb: 'Used sparingly: a ringed worm that bursts out of the street under you with a four-petal jaw, then dives back down.',
    params: [skinParam], build: poseable(A_BURROW, burrowLook, drawBurrower),
  },
  'sw-bloater': {
    ...common, name: 'Bloater', size: [1, 1], anims: A_BLOAT, dims: { len: 0.24, h: 0.23 },
    blurb: 'Used sparingly: a glowing gas sac caged in ribs that waddles up, swells and bursts. Shoot it early.',
    params: [skinParam], build: poseable(A_BLOAT, bloatLook, drawBloater),
  },
  'sw-hive': {
    ...common, name: 'Hive', size: [1, 1], anims: A_HIVE, dims: { h: 0.6 },
    blurb: 'A spawner nest on one lot: a ribbed mound with glowing pores; its petal mouth opens to let swarmers out.',
    params: [skinParam], build: poseable(A_HIVE, hiveLook(false), drawHive),
  },
  'sw-hive-great': {
    ...common, name: 'Great Hive', size: [2, 2], anims: A_HIVE, dims: { h: 1.05 },
    blurb: 'A big nest over a 2×2 lot: four mounds and a web of roots; two mouths spawn at once.',
    params: [skinParam], build: poseable(A_HIVE, hiveLook(true), drawHive),
  },
  'sw-broodmother': {
    ...common, name: 'Broodmother', size: [2, 2], anims: A_BROOD, dims: { len: 1.8, h: 0.95 }, parts: BROOD_PARTS,
    blurb: 'Boss, about 28 m long: great claws, a crest and two glowing egg sacs that can each be shot off. Spits, roars and calls swarmers.',
    params: [skinParam, ...breakParams], build: poseable(A_BROOD, broodLook, drawBrood, { parts: BROOD_PARTS }),
  },
});
