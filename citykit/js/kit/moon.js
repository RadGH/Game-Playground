// Moon outpost buildings (Overdrive Frame round 5, "first taste of the moon"): a mining and research outpost on grey
// dust under a black sky. Pressurised domes, habitat modules, a research tower, a comms mast, ore silos with their
// conveyor, a rover garage, solar arrays, oxygen tanks and the mine's drill rig. Same contract as buildings.js (ground
// origin at the lot centre, nothing outside ±size/2), group 'outposts' so every one gets the wreck stages, genre
// 'moon'. Missions on the moon are always at night, so every recipe has lights: lit portholes, beacons, floodlights.
//
// The look: white and light-grey panels, space-agency orange bands, gold foil on the equipment, dark solar glass, all
// sitting on a pad of the same grey dust as the ground (a lot reads as "built on the moon", not a city pavement).
import * as THREE from 'three';
import { addRecipes } from './buildings.js';
import { box, cyl, dome, storeys, slab, lotPad, FLOOR, bodyMat, neonMat } from './shapes.js';

const cache = new Map();
const cached = (k, make) => { if (!cache.has(k)) cache.set(k, make()); return cache.get(k); };
const f3 = n => n.toFixed(3);

const DUST = '#6f6d6a', WHITE = '#e4e7ea', PANEL = '#c4c9ce', DARK = '#3a4049', STEEL = '#8a949f', ORANGE = '#e0782c', GOLD = '#c9a24a', SOLAR = '#1d3a6e';
const WARM = '#ffd18a', CYAN = '#3ff0ff', RED = '#ff3030', GREEN = '#7dff6a', AMBER = '#ffb02e';

/** Plain coloured material. */
const M = (color, metal = 0.3, rough = 0.6) => bodyMat('chrome', 0, { color, metal, rough });
/** Looks like `day` in sunlight and glows `glow` at night (portholes, door panels, greenhouse glass). */
function lamp(day, glow, dayGlow = 0) {
  return cached(`mlamp:${day}:${glow}:${dayGlow}`, () => {
    const m = new THREE.MeshStandardMaterial({ color: day, emissive: glow, emissiveIntensity: 1, roughness: 0.35, metalness: 0.3 });
    m.userData.glow = true; m.userData.dayGlow = dayGlow; return m;
  });
}
function add(parent, geo, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; }
const G = (k, make) => cached('mg:' + k, make);
/** A sphere centred at (x, y, z). */
const ball = (p, r, mat, x, y, z, seg = 16) => add(p, G(`ball${f3(r)}:${seg}`, () => new THREE.SphereGeometry(r, seg, Math.ceil(seg * 0.7))), mat, x, y, z);
/** A round rod from a to b. */
function rod(p, a, b, r, mat, seg = 6) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), L = d.length();
  const m = add(p, G(`rod${f3(r)}:${f3(L)}:${seg}`, () => new THREE.CylinderGeometry(r, r, L, seg)), mat, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); return m;
}
/** A lying cylinder (habitat module, tank) along x, turned by ry; centre at (x, y, z). */
function hcyl(p, r, len, mat, x, y, z, ry = 0, seg = 18) {
  const m = add(p, G(`hc${f3(r)}:${f3(len)}:${seg}`, () => new THREE.CylinderGeometry(r, r, len, seg)), mat, x, y, z);
  m.rotation.set(0, ry, Math.PI / 2, 'YXZ'); return m;
}
/** A flat ring (torus) lying on the ground, or tilted. */
function ring(p, R, tube, mat, x, y, z, { tilt = 0, seg = 40 } = {}) {
  const m = add(p, G(`tor${f3(R)}:${f3(tube)}:${seg}`, () => new THREE.TorusGeometry(R, tube, 6, seg)), mat, x, y, z);
  m.rotation.set(Math.PI / 2 + tilt, 0, 0); return m;
}
/** A flat bar from a to b (conveyor belt, ramp): w wide, t thick. */
function belt(p, a, b, w, t, mat) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], h = Math.hypot(dx, dz), L = Math.hypot(h, dy);
  const m = add(p, G(`belt${f3(L)}:${f3(t)}:${f3(w)}`, () => new THREE.BoxGeometry(L, t, w)), mat, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  m.rotation.set(0, -Math.atan2(dz, dx), Math.atan2(dy, h), 'YXZ'); return m;
}
const beacon = (p, x, y, z, color = RED, s = 0.035) => box(p, s, s, s, neonMat(color, 0.9), x, y, z);
/** The lot: a pad of moon dust (a shade lighter than the ground) with a few rocks round its edge. */
function dustPad(g, w, d, R) {
  const y = lotPad(g, w, d, DUST);
  for (let i = 0; i < Math.round(w * d * 2); i++) {
    const s = R.range(0.025, 0.06), side = R.int(0, 3), t = R.range(-0.45, 0.45);
    const x = side < 2 ? (side ? 1 : -1) * (w / 2 - s - 0.02) : t * w * 0.9, z = side >= 2 ? (side === 2 ? 1 : -1) * (d / 2 - s - 0.02) : t * d * 0.9;
    ball(g, s, M('#5d5b58', 0.05, 0.95), x, y + s * 0.4, z, 6).scale.y = 0.6;
  }
  return y;
}
/** A row of round lit portholes along x on the +z face (or the +x face when alongZ). */
function portholes(p, n, len, x, y, z, { alongZ = false, color = WARM, r = 0.022, lit = 0.8, R = null } = {}) {
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n - 0.5, on = !R || R.chance(lit);
    const m = cyl(p, r, 0.012, on ? lamp('#2b4766', color, 0.15) : M('#1c2633', 0.6, 0.3), alongZ ? x : x + t * len, y - r, alongZ ? z + t * len : z, { seg: 10 });
    m.rotation.set(alongZ ? 0 : Math.PI / 2, 0, alongZ ? Math.PI / 2 : 0); m.position.y = y;
  }
}

// ---------------------------------------------------------------- recipes
function buildDome(p) {
  const g = new THREE.Group(), R = p.R, y0 = dustPad(g, 2, 2, R);
  // ring wall with a band of lit windows, then the glass greenhouse dome with its frame
  cyl(g, 0.86, 0.1, M(PANEL, 0.4, 0.5), 0, y0, 0, { seg: 32 });
  cyl(g, 0.865, 0.035, lamp('#24384c', WARM, 0.1), 0, y0 + 0.04, 0, { seg: 32 });
  ring(g, 0.87, 0.012, M(ORANGE, 0.2, 0.6), 0, y0 + 0.1, 0);
  const glow = [GREEN, '#9fe8ff', '#c8ff9a'][p.seed % 3];
  const glass = cached(`mdome:${glow}`, () => { const m = new THREE.MeshStandardMaterial({ color: '#7f9db4', emissive: glow, emissiveIntensity: 0.22, metalness: 0.55, roughness: 0.12 }); m.userData.glow = true; m.userData.dayGlow = 0; return m; });
  dome(g, 0.82, glass, 0, y0 + 0.1, 0, { squash: 0.82, seg: 32 });
  const H = 0.82 * 0.82, frame = M(WHITE, 0.5, 0.4);
  for (const k of [0.3, 0.6, 0.85]) { const r = 0.82 * Math.cos(Math.asin(k)); ring(g, r + 0.004, 0.01, frame, 0, y0 + 0.1 + H * k, 0); }
  for (let i = 0; i < 8; i++) {                                    // meridian ribs
    const a = i * Math.PI / 4; let prev = null;
    for (let k = 0; k <= 6; k++) { const th = k / 6 * Math.PI / 2 * 0.98, pt = [Math.cos(a) * 0.825 * Math.cos(th), y0 + 0.1 + H * Math.sin(th), Math.sin(a) * 0.825 * Math.cos(th)]; if (prev) rod(g, prev, pt, 0.009, frame, 5); prev = pt; }
  }
  // inside: rows of planters glowing under the glass, a little hab block
  for (let i = -2; i <= 2; i++) box(g, 0.9 - Math.abs(i) * 0.12, 0.05, 0.08, lamp('#2f5a3a', glow, 0.3), 0, y0 + 0.1, i * 0.2);
  // airlock tube out to the lot edge (toward +x) with a lit hatch, and a beacon on the crown
  const side = p.seed % 2 ? 1 : -1;
  hcyl(g, 0.11, 0.2, M(WHITE, 0.4, 0.5), 0.86, y0 + 0.12, side * 0.3);
  box(g, 0.03, 0.16, 0.16, M(DARK, 0.5, 0.5), 0.965, y0 + 0.04, side * 0.3);
  box(g, 0.012, 0.1, 0.08, lamp('#3a3020', AMBER, 0.3), 0.98, y0 + 0.07, side * 0.3);
  beacon(g, 0, y0 + 0.1 + H, 0, RED, 0.03);
  // a little floodlight and a rover parking stripe in the corner
  cyl(g, 0.01, 0.3, M(STEEL), -0.85, y0, 0.85, { seg: 5 }); box(g, 0.06, 0.03, 0.03, neonMat(WARM, 0.3), -0.85, y0 + 0.3, 0.85);
  return g;
}

function buildHab(p) {
  const g = new THREE.Group(), R = p.R, y0 = dustPad(g, 2, 1, R);
  const shell = M(WHITE, 0.35, 0.45), band = M(ORANGE, 0.2, 0.6), r = 0.17, cy = y0 + 0.06 + r;
  // two modules end to end through a node, on short legs; a second storey sits on top (floors 2)
  for (let level = 0; level < Math.min(2, p.floors); level++) {
    const y = cy + level * (r * 2 + 0.05), len = level ? 0.9 : 0.72;
    for (const s of level ? [0] : [-1, 1]) {
      const x = level ? 0 : s * 0.5;
      hcyl(g, r, len, shell, x, y, 0);
      for (const e of [-1, 1]) hcyl(g, r + 0.006, 0.03, band, x + e * (len / 2 - 0.05), y, 0);
      for (const e of [-1, 1]) hcyl(g, r * 0.9, 0.02, M(PANEL), x + e * len / 2, y, 0);
      portholes(g, 5, len * 0.75, x, y + 0.02, r - 0.004, { R });
      portholes(g, 5, len * 0.75, x, y + 0.02, -r + 0.004, { R });
      if (!level) for (const e of [-0.25, 0.25]) for (const zz of [-0.1, 0.1]) cyl(g, 0.014, 0.08, M(STEEL), x + e, y0, zz, { seg: 5 });
    }
    if (level) { for (const e of [-0.35, 0.35]) box(g, 0.06, 0.07, 0.12, M(PANEL), e, cy + r - 0.01, 0); }
  }
  ball(g, r * 1.12, M(PANEL, 0.4, 0.5), 0, cy, 0, 18);            // the node between the two lower modules
  if (p.floors < 2) {                                               // a gold-foil equipment box on top
    box(g, 0.16, 0.08, 0.12, M(GOLD, 0.8, 0.35), 0.45, cy + r - 0.02, 0);
    box(g, 0.012, 0.05, 0.012, neonMat(GREEN, 0.6), 0.45, cy + r + 0.06, 0.05);
  }
  // radiator fins off the far end, a beacon, a lit hatch on the near end
  const top = cy + (Math.min(2, p.floors) - 1) * (r * 2 + 0.05) + r;
  box(g, 0.02, 0.12, 0.42, M('#dfe3e6', 0.5, 0.3), -0.93, cy - 0.06, 0);
  beacon(g, 0.2, top, 0, RED, 0.03);
  box(g, 0.012, 0.12, 0.1, lamp('#3a3020', AMBER, 0.3), 0.9, cy - 0.08, 0);
  return g;
}

function buildLab(p) {
  const g = new THREE.Group(), R = p.R, y0 = dustPad(g, 1, 1, R);
  const n = Math.max(2, p.floors);
  // stepped base, white tower with a lit window grid, an orange band each storey, observatory dome on top
  box(g, 0.84, 0.06, 0.84, M(PANEL, 0.4, 0.5), 0, y0, 0);
  const top = storeys(g, { w: 0.62, d: 0.62, floors: n, y: y0 + 0.06, style: 'pearl', kind: 'bands', seed: p.seed, lit: 0.6 });
  for (let f = 1; f < n; f++) box(g, 0.64, 0.015, 0.64, M(ORANGE, 0.2, 0.6), 0, y0 + 0.06 + f * FLOOR - 0.01, 0);
  slab(g, 0.68, 0.68, 'pearl', 0, top);
  dome(g, 0.24, M(WHITE, 0.4, 0.35), -0.08, top + 0.04, -0.08, { squash: 0.8, seg: 24 });
  box(g, 0.05, 0.12, 0.26, lamp('#22303c', CYAN, 0.35), -0.08 + 0.17, top + 0.06, -0.08).rotation.y = Math.PI / 4;   // the telescope slit
  cyl(g, 0.008, 0.28, M(STEEL), 0.22, top + 0.04, 0.22, { seg: 5 }); beacon(g, 0.22, top + 0.32, 0.22, RED, 0.03);
  // gold-foil instrument boxes and a lit door at the foot
  box(g, 0.14, 0.1, 0.1, M(GOLD, 0.8, 0.35), 0.3, y0 + 0.06, -0.32);
  box(g, 0.012, 0.13, 0.12, lamp('#3a3020', WARM, 0.3), 0.315, y0 + 0.06, 0.12);
  return g;
}

function buildMast(p) {
  const g = new THREE.Group(), R = p.R, y0 = dustPad(g, 1, 1, R);
  const steel = M('#d4d9de', 0.6, 0.35), H = 1.45, w = 0.13;
  box(g, 0.36, 0.05, 0.36, M(PANEL), 0, y0, 0);
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) rod(g, [a * w, y0 + 0.05, b * w], [a * 0.02, y0 + H, b * 0.02], 0.01, steel, 4);
  for (let k = 1; k < 9; k++) { const f = k / 9, s = w * 2 * (1 - f * 0.85); box(g, s, 0.01, s, steel, 0, y0 + 0.05 + (H - 0.05) * f, 0); if (k % 2) for (const sgn of [-1, 1]) rod(g, [-s / 2, y0 + 0.05 + (H - 0.05) * f, sgn * s / 2], [s / 2, y0 + 0.05 + (H - 0.05) * (f + 1 / 9), sgn * s / 2 * 0.9], 0.005, steel, 3); }
  // a dish turned toward home, panel antennas, red beacons up the mast, guy wires to the corners
  const dg = new THREE.Group(); dg.position.set(0.07, y0 + H * 0.72, 0.07); dg.rotation.set(0.9, Math.PI / 4 + R.range(-0.3, 0.3), 0, 'YXZ'); g.add(dg);
  const bowl = add(dg, G('mdish', () => new THREE.SphereGeometry(0.2, 20, 6, 0, Math.PI * 2, 0, 0.6)), cached('mdishmat', () => new THREE.MeshStandardMaterial({ color: WHITE, metalness: 0.4, roughness: 0.4, side: THREE.DoubleSide })), 0, 0.2, 0); bowl.rotation.x = Math.PI;
  cyl(dg, 0.012, 0.12, M(DARK), 0, 0.02, 0, { seg: 6 }); ball(dg, 0.014, neonMat(CYAN, 0.5), 0, 0.15, 0, 8);
  for (const s of [-1, 1]) box(g, 0.02, 0.16, 0.05, M(WHITE), s * 0.05, y0 + H * 0.5, -0.05);
  for (const f of [0.35, 0.7, 1]) beacon(g, 0, y0 + 0.05 + (H - 0.05) * f, 0, RED, f === 1 ? 0.04 : 0.025);
  const wire = M('#9aa3ad', 0.6, 0.4);
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) rod(g, [a * 0.46, y0, b * 0.46], [0, y0 + H * 0.6, 0], 0.003, wire, 3);
  // equipment cabinet with status lights
  box(g, 0.14, 0.1, 0.08, M(GOLD, 0.8, 0.35), 0.3, y0, -0.3);
  for (const dx of [-0.03, 0.03]) box(g, 0.02, 0.02, 0.01, neonMat(GREEN, 0.6), 0.3 + dx, y0 + 0.07, -0.255);
  return g;
}

function buildSilo(p) {
  const g = new THREE.Group(), R = p.R, y0 = dustPad(g, 2, 1, R);
  // two ore silos with cone hoppers on legs, a conveyor climbing to their tops, ore heaped at its foot
  for (const x of [0.15, 0.62]) {
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) cyl(g, 0.014, 0.16, M(STEEL), x + a * 0.14, y0, b * 0.14, { seg: 5 });
    add(g, G('mcone', () => new THREE.ConeGeometry(0.21, 0.12, 20)), M(PANEL, 0.4, 0.5), x, y0 + 0.11, 0).rotation.x = Math.PI;
    cyl(g, 0.21, 0.42, M(WHITE, 0.35, 0.45), x, y0 + 0.17, 0, { seg: 20 });
    cyl(g, 0.215, 0.03, M(ORANGE, 0.2, 0.6), x, y0 + 0.36, 0, { seg: 20 });
    dome(g, 0.21, M(PANEL, 0.4, 0.5), x, y0 + 0.59, 0, { squash: 0.35, seg: 20 });
    cyl(g, 0.205, 0.02, lamp('#24384c', WARM, 0.1), x, y0 + 0.5, 0, { seg: 20 });
    beacon(g, x, y0 + 0.66, 0, RED, 0.028);
  }
  const top = [0.15, y0 + 0.66, 0], foot = [-0.75, y0 + 0.08, 0];
  belt(g, foot, top, 0.08, 0.02, M(DARK, 0.4, 0.6));
  for (let k = 1; k < 4; k++) { const t = k / 4, x = foot[0] + (top[0] - foot[0]) * t, y = foot[1] + (top[1] - foot[1]) * t; cyl(g, 0.01, y - y0, M(STEEL), x, y0, 0.03, { seg: 4 }); }
  for (let k = 0; k < 5; k++) { const t = 0.1 + k * 0.18; ball(g, 0.025, M('#8d8a86', 0.1, 0.9), foot[0] + (top[0] - foot[0]) * t, foot[1] + (top[1] - foot[1]) * t + 0.03, 0, 6); }
  for (let i = 0; i < 6; i++) ball(g, R.range(0.05, 0.1), M('#7c7976', 0.05, 0.95), -0.78 + R.range(-0.08, 0.08), y0, R.range(-0.25, 0.25), 7).scale.y = 0.6;
  box(g, 0.05, 0.04, 0.05, neonMat(AMBER, 0.6), foot[0] + 0.08, y0 + 0.12, 0.08);
  return g;
}

function buildGarage(p) {
  const g = new THREE.Group(), R = p.R, y0 = dustPad(g, 2, 2, R);
  // a low half-buried hangar: barrel roof along x, a wide door on the +z face lit amber, side walls in panels
  const len = 1.5, r = 0.42, cz = -0.25;
  box(g, len, 0.08, r * 2, M(PANEL, 0.4, 0.5), 0, y0, cz);
  const roof = add(g, G('mgroof', () => new THREE.CylinderGeometry(r, r, len, 24, 1, false, 0, Math.PI)), M(WHITE, 0.35, 0.45), 0, y0 + 0.08, cz);
  roof.rotation.set(0, 0, Math.PI / 2);                            // half cylinder: axis along x, curved side up
  const arch = G(`march${f3(r)}`, () => new THREE.TorusGeometry(r + 0.004, 0.012, 6, 24, Math.PI));
  for (let k = 0; k < 5; k++) add(g, arch, M(ORANGE, 0.2, 0.6), -len / 2 + 0.1 + k * (len - 0.2) / 4, y0 + 0.08, cz).rotation.set(0, Math.PI / 2, 0);
  box(g, 0.9, 0.3, 0.02, M(DARK, 0.5, 0.5), 0, y0 + 0.08, cz + r - 0.01);
  for (let k = 0; k < 4; k++) box(g, 0.2, 0.06, 0.012, lamp('#3a3020', AMBER, 0.2), -0.33 + k * 0.22, y0 + 0.12, cz + r + 0.005);
  box(g, 0.94, 0.03, 0.03, neonMat(AMBER, 0.5), 0, y0 + 0.39, cz + r);
  // the apron: hazard chevrons and a six-wheeled rover parked outside
  for (let k = 0; k < 5; k++) box(g, 0.12, 0.004, 0.04, M('#e3b52c', 0.2, 0.6), -0.4 + k * 0.2, y0, 0.55).rotation.y = 0.6;
  const rx = 0.45, rz = 0.72;
  for (const dx of [-0.13, 0, 0.13]) for (const dz of [-0.1, 0.1]) { const w = cyl(g, 0.045, 0.03, M('#2a2d31', 0.2, 0.9), rx + dx, y0 + 0.045, rz + dz, { seg: 10 }); w.rotation.x = Math.PI / 2; w.position.y = y0 + 0.045; }
  box(g, 0.38, 0.07, 0.2, M(WHITE, 0.35, 0.45), rx, y0 + 0.07, rz);
  box(g, 0.14, 0.07, 0.17, lamp('#24384c', CYAN, 0.2), rx + 0.1, y0 + 0.14, rz);
  box(g, 0.1, 0.05, 0.14, M(GOLD, 0.8, 0.35), rx - 0.1, y0 + 0.14, rz);
  for (const dz of [-0.06, 0.06]) box(g, 0.012, 0.02, 0.03, neonMat(WARM, 0.7), rx + 0.195, y0 + 0.1, rz + dz);
  cyl(g, 0.006, 0.18, M(STEEL), rx - 0.15, y0 + 0.14, rz - 0.07, { seg: 4 }); beacon(g, rx - 0.15, y0 + 0.32, rz - 0.07, AMBER, 0.02);
  // floodlight on the roof end
  cyl(g, 0.012, 0.25, M(STEEL), -0.85, y0, 0.6, { seg: 5 }); box(g, 0.08, 0.03, 0.03, neonMat(WARM, 0.3), -0.85, y0 + 0.25, 0.6);
  return g;
}

function buildSolar(p) {
  const g = new THREE.Group(), R = p.R, y0 = dustPad(g, 2, 1, R);
  // two rows of tilted solar panels (dark glass with a silver grid) on posts, cabled to an inverter box
  const glass = cached('msolar', () => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 32; const x = c.getContext('2d');
    x.fillStyle = SOLAR; x.fillRect(0, 0, 64, 32); x.strokeStyle = '#8fa6c8'; x.lineWidth = 1;
    for (let i = 0; i <= 64; i += 8) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 32); x.stroke(); }
    for (let j = 0; j <= 32; j += 8) { x.beginPath(); x.moveTo(0, j); x.lineTo(64, j); x.stroke(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: t, metalness: 0.6, roughness: 0.2 });
  });
  const frame = M(PANEL, 0.5, 0.4);
  for (const z of [-0.22, 0.22]) for (const x of [-0.55, 0.05]) {
    const pg = new THREE.Group(); pg.position.set(x, y0 + 0.13, z); pg.rotation.x = -0.5; g.add(pg);
    box(pg, 0.56, 0.02, 0.32, frame, 0, -0.01, 0);
    box(pg, 0.54, 0.012, 0.3, glass, 0, 0.005, 0);
    cyl(g, 0.012, 0.13, M(STEEL), x, y0, z, { seg: 5 });
  }
  box(g, 0.14, 0.12, 0.12, M(GOLD, 0.8, 0.35), 0.78, y0, 0);
  box(g, 0.02, 0.02, 0.012, neonMat(GREEN, 0.7), 0.78, y0 + 0.09, 0.065);
  rod(g, [0.71, y0 + 0.02, 0], [-0.8, y0 + 0.02, 0], 0.008, M(DARK), 4);
  beacon(g, 0.78, y0 + 0.12, 0, AMBER, 0.02);
  return g;
}

function buildTank(p) {
  const g = new THREE.Group(), R = p.R, y0 = dustPad(g, 1, 1, R);
  // two oxygen spheres on legs inside a low blast wall, pipes and a pressure light (they burst when hit hard)
  box(g, 0.86, 0.06, 0.86, M(PANEL, 0.4, 0.5), 0, y0, 0);
  for (const [x, z] of [[-0.17, 0.17], [0.17, -0.17]]) {
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; rod(g, [x + Math.cos(a) * 0.16, y0 + 0.06, z + Math.sin(a) * 0.16], [x + Math.cos(a) * 0.1, y0 + 0.2, z + Math.sin(a) * 0.1], 0.01, M(STEEL), 4); }
    ball(g, 0.17, M(WHITE, 0.45, 0.35), x, y0 + 0.24, z, 20);
    ring(g, 0.172, 0.01, M(ORANGE, 0.2, 0.6), x, y0 + 0.24, z);
    beacon(g, x, y0 + 0.41, z, RED, 0.025);
  }
  rod(g, [-0.17, y0 + 0.12, 0.17], [0.38, y0 + 0.12, 0.38], 0.012, M(GOLD, 0.8, 0.35), 6);
  rod(g, [0.17, y0 + 0.12, -0.17], [0.38, y0 + 0.12, 0.38], 0.012, M(GOLD, 0.8, 0.35), 6);
  box(g, 0.08, 0.1, 0.08, M(DARK), 0.36, y0 + 0.06, 0.36);
  box(g, 0.03, 0.03, 0.012, lamp('#3a3020', AMBER, 0.4), 0.36, y0 + 0.13, 0.405);
  for (const s of [-1, 1]) box(g, 0.86, 0.04, 0.02, M('#e3b52c', 0.2, 0.6), 0, y0 + 0.06, s * 0.42);
  return g;
}

function buildDrill(p) {
  const g = new THREE.Group(), R = p.R, y0 = dustPad(g, 2, 2, R);
  // a drill rig over the pit's edge: a lattice derrick on a platform, the drill string with its glowing head at the
  // foot, a conveyor carrying ore off to a heap, floodlights on the corners
  const steel = M('#d9a43a', 0.5, 0.45), H = 1.0;
  box(g, 1.1, 0.08, 1.1, M(PANEL, 0.4, 0.5), -0.2, y0, -0.2);
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) rod(g, [-0.2 + a * 0.3, y0 + 0.08, -0.2 + b * 0.3], [-0.2 + a * 0.07, y0 + H, -0.2 + b * 0.07], 0.014, steel, 4);
  for (let k = 1; k < 7; k++) { const f = k / 7, s = 0.6 * (1 - f * 0.77); box(g, s, 0.012, s, steel, -0.2, y0 + 0.08 + (H - 0.08) * f, -0.2); }
  for (const s of [-1, 1]) rod(g, [-0.2 - 0.3, y0 + 0.08, -0.2 + s * 0.3], [-0.2 + 0.3, y0 + 0.5, -0.2 + s * 0.3], 0.007, steel, 3);
  box(g, 0.2, 0.06, 0.2, M(DARK), -0.2, y0 + H, -0.2);
  cyl(g, 0.03, H - 0.1, M(STEEL, 0.7, 0.3), -0.2, y0 + 0.1, -0.2, { seg: 8 });
  cyl(g, 0.09, 0.1, lamp('#4a2a1a', '#ff8a2a', 0.5), -0.2, y0 + 0.08, -0.2, { rt: 0.06, seg: 12 });
  beacon(g, -0.2, y0 + H + 0.08, -0.2, RED, 0.04);
  // the operator's cab, lit
  box(g, 0.3, 0.2, 0.24, M(WHITE, 0.35, 0.45), 0.5, y0, -0.55);
  box(g, 0.012, 0.08, 0.18, lamp('#24384c', WARM, 0.15), 0.655, y0 + 0.1, -0.55);
  box(g, 0.24, 0.012, 0.012, neonMat(ORANGE, 0.5), 0.5, y0 + 0.2, -0.43);
  // conveyor to an ore heap in the near corner
  belt(g, [-0.05, y0 + 0.35, 0.05], [0.6, y0 + 0.12, 0.6], 0.09, 0.02, M(DARK, 0.4, 0.6));
  for (const t of [0.35, 0.7]) cyl(g, 0.01, 0.35 - 0.23 * t, M(STEEL), -0.05 + 0.65 * t, y0, 0.05 + 0.55 * t, { seg: 4 });
  for (let i = 0; i < 7; i++) ball(g, R.range(0.06, 0.12), M('#7c7976', 0.05, 0.95), 0.72 + R.range(-0.12, 0.12), y0, 0.72 + R.range(-0.12, 0.12), 7).scale.y = 0.55;
  for (const [x, z] of [[-0.9, 0.85], [0.85, -0.9]]) { cyl(g, 0.012, 0.42, M(STEEL), x, y0, z, { seg: 5 }); box(g, 0.1, 0.035, 0.035, neonMat(WARM, 0.3), x, y0 + 0.42, z); }
  return g;
}

const MOON = { group: 'outposts', genre: ['moon'] };
addRecipes({
  'moon-dome': { ...MOON, name: 'Greenhouse Dome', size: [2, 2], blurb: 'A pressurised glass dome over glowing planters, ribbed in white, with an airlock tube out to the dust.', params: [], build: buildDome },
  'moon-hab': { ...MOON, name: 'Habitat Modules', size: [2, 1], blurb: 'Crew quarters: white pressure cylinders end to end, lit portholes, orange bands. Two storeys stack a third module on top.', params: [{ key: 'floors', label: 'Storeys', min: 1, max: 2, step: 1, def: 1 }], build: buildHab },
  'moon-lab': { ...MOON, name: 'Research Tower', size: [1, 1], blurb: 'A white lab tower with ribbon windows and an observatory dome on the roof.', params: [{ key: 'floors', label: 'Storeys', min: 2, max: 4, step: 1, def: 3 }], build: buildLab },
  'moon-mast': { ...MOON, name: 'Comms Mast', size: [1, 1], blurb: 'A tall lattice mast with a dish turned toward home, red beacons up its length and guy wires to the dust.', params: [], build: buildMast },
  'moon-silo': { ...MOON, name: 'Ore Silos', size: [2, 1], blurb: 'Two ore silos on legs, fed by a conveyor climbing from the heap at their foot.', params: [], build: buildSilo },
  'moon-garage': { ...MOON, name: 'Rover Garage', size: [2, 2], blurb: 'A low barrel-roofed hangar with an amber-lit door and a six-wheeled rover parked on the apron.', params: [], build: buildGarage },
  'moon-solar': { ...MOON, name: 'Solar Array', size: [2, 1], blurb: 'Two rows of tilted solar panels on posts, cabled to an inverter box.', params: [], build: buildSolar },
  'moon-tank': { ...MOON, name: 'Oxygen Tanks', size: [1, 1], blurb: 'Two oxygen spheres on legs behind a low blast wall. Hit them hard and they go up.', params: [], build: buildTank },
  'moon-drill': { ...MOON, name: 'Mine Drill Rig', size: [2, 2], blurb: 'A lattice derrick over the mine with a glowing drill head, an operator cab and a conveyor to the ore heap.', params: [], build: buildDrill },
});
