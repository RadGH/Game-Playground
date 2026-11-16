// Procedural buildings, part 2: industry, services, the colony's own buildings, landmarks and resource outposts for
// Arcline (prototypes/arcline/docs/PLAN.md §0). Same contract as buildings.js: each recipe is a function of a few
// numbers (+ style + seed), its ground origin at the lot centre, nothing outside ±size/2 in x/z.
//
// Lot sizes are fixed per recipe (the page and the game read `size` straight off the recipe), so a building that comes
// "small or large" is two recipes sharing one builder: e.g. 'ind-refinery' (2×2) + 'ind-refinery-l' (3×3). Those
// builders draw on a 3×3 plan and scale it down for the smaller lot.
import * as THREE from 'three';
import { addRecipes } from './buildings.js';
import { STYLES, facadeMat, leafMat, waterMat } from './materials.js';
import { box, cyl, dome, storeys, slab, neonEdges, sign, roofProps, balconies, lotPad, FLOOR, bodyMat, trimMat, neonMat, glassMat } from './shapes.js';

// ---------------------------------------------------------------------------------------------------------------
// Helpers (local to this file; candidates for shapes.js later)
// ---------------------------------------------------------------------------------------------------------------
const cache = new Map();
const cached = (k, make) => { if (!cache.has(k)) cache.set(k, make()); return cache.get(k); };
const G = (k, make) => cached('g:' + k, make);
const f3 = n => n.toFixed(3);

/** Plain coloured material (not tied to a style). */
const M = (color, metal = 0.3, rough = 0.6) => bodyMat('chrome', 0, { color, metal, rough });
/** Double-sided plain material (dishes, open bowls, cooling towers you can see into). */
const M2 = (color, metal = 0.3, rough = 0.6) => cached(`m2:${color}:${metal}:${rough}`, () =>
  new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough, side: THREE.DoubleSide }));
/** Looks like `day` in sunlight and glows `glow` at night (skylights, furnace slits, cell racks). */
function lamp(day, glow, dayGlow = 0) {
  return cached(`lamp:${day}:${glow}:${dayGlow}`, () => {
    const m = new THREE.MeshStandardMaterial({ color: day, emissive: glow, emissiveIntensity: 1, roughness: 0.35, metalness: 0.3 });
    m.userData.glow = true; m.userData.dayGlow = dayGlow; return m;
  });
}
/** Translucent-looking crystal: tinted by day, bright at night. */
function crystalMat(color, dayGlow = 0.45) {
  return cached(`crys:${color}:${dayGlow}`, () => {
    const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1, roughness: 0.15, metalness: 0.1, flatShading: true });
    m.userData.glow = true; m.userData.dayGlow = dayGlow; return m;
  });
}

const STEEL = '#8a949f', DARK = '#3a4049', RUST = '#8a5a3c', HAZARD = '#e3b52c';
const CYAN = '#3ff0ff', ORANGE = '#ff8a2a', WARM = '#ffd18a', RED = '#ff3030', GREEN = '#7dff6a';
const neonOf = (p, i = 0) => STYLES[p.style].neon[(p.seed + i) % STYLES[p.style].neon.length];

function addMesh(parent, geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
/** A sphere centred at (x, y, z). */
function ball(parent, r, mat, x, y, z, seg = 12) { return addMesh(parent, G(`ball${f3(r)}:${seg}`, () => new THREE.SphereGeometry(r, seg, Math.ceil(seg * 0.7))), mat, x, y, z); }
/** A round rod between two points (pipes, struts, legs, cables). */
function rod(parent, a, b, r, mat, seg = 8) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const L = d.length();
  const m = addMesh(parent, G(`rod${f3(r)}:${f3(L)}:${seg}`, () => new THREE.CylinderGeometry(r, r, L, seg)), mat, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); return m;
}
/** A flat bar (conveyor belt, ramp, girder) from a to b: w wide, t thick. */
function belt(parent, a, b, w, t, mat) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2]; const h = Math.hypot(dx, dz), L = Math.hypot(h, dy);
  const m = addMesh(parent, G(`box${f3(L)}:${f3(t)}:${f3(w)}`, () => new THREE.BoxGeometry(L, t, w)), mat, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  m.rotation.set(0, -Math.atan2(dz, dx), Math.atan2(dy, h), 'YXZ'); return m;
}
/** A box turned about y (containers, trucks). */
function tbox(parent, w, h, d, mat, x, y, z, ry = 0) { const m = box(parent, w, h, d, mat, x, y, z); m.rotation.y = ry; return m; }
/** A ring (torus). Flat by default; tilt turns it about x then y. */
function ring(parent, R, tube, mat, x, y, z, { arc = Math.PI * 2, tilt = 0, spin = 0, seg = 48 } = {}) {
  const m = addMesh(parent, G(`tor${f3(R)}:${f3(tube)}:${f3(arc)}:${seg}`, () => new THREE.TorusGeometry(R, tube, 8, seg, arc)), mat, x, y, z);
  m.rotation.set(Math.PI / 2 + tilt, spin, 0, 'YXZ'); return m;
}
/** A solid of revolution from [r, y] points (stepped seating, cooling towers, hoppers). */
function lathe(parent, pts, mat, x, y, z, seg = 32) {
  const k = 'lathe' + pts.map(([r, h]) => f3(r) + ',' + f3(h)).join(';') + ':' + seg;
  return addMesh(parent, G(k, () => new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)), seg)), mat, x, y, z);
}
/** A horizontal cylinder along x (or turned by ry): drums, coils, lying tanks. Centre at (x, y, z). */
function hcyl(parent, r, len, mat, x, y, z, ry = 0, seg = 16) {
  const m = addMesh(parent, G(`hc${f3(r)}:${f3(len)}:${seg}`, () => new THREE.CylinderGeometry(r, r, len, seg)), mat, x, y, z);
  m.rotation.set(0, ry, Math.PI / 2, 'YXZ'); return m;
}
/** Half-cylinder barrel roof along x (ry turns it), its flat side at y. squash flattens it. */
function barrel(parent, len, r, mat, x, y, z, { ry = 0, squash = 0.5 } = {}) {
  const m = addMesh(parent, G(`bar${f3(r)}:${f3(len)}`, () => new THREE.CylinderGeometry(r, r, len, 20, 1, false, 0, Math.PI)), mat, x, y, z);
  m.rotation.set(0, ry, Math.PI / 2, 'YXZ'); m.scale.set(squash, 1, 1); return m;
}
/** One sawtooth roof tooth: vertical glazed face toward +z, slope down toward −z. len along x, base along z. */
function tooth(parent, len, base, h, mat, x, y, z) {
  const geo = G(`tooth${f3(len)}:${f3(base)}:${f3(h)}`, () => {
    const s = new THREE.Shape(); s.moveTo(-base / 2, 0); s.lineTo(base / 2, 0); s.lineTo(-base / 2, h); s.closePath();
    const e = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false }); e.translate(0, 0, -len / 2); return e;
  });
  const m = addMesh(parent, geo, mat, x, y, z); m.rotation.y = Math.PI / 2; return m;
}
/** A tower with windows wrapped round a cylinder (seg 8 = octagon). Returns its top y. */
function roundTower(parent, { r, floors, x = 0, y = 0, z = 0, style, kind = 'curtain', seed = 1, seg = 8, lit = 0.55, rt = r, ry = 0 }) {
  const h = floors * FLOOR;
  const cols = Math.max(seg, Math.round((2 * Math.PI * r) / 0.18 / seg) * seg);
  const side = facadeMat(style, kind, seed, cols, floors, lit), roof = bodyMat(style, 2);
  addMesh(parent, G(`rt${f3(r)}:${f3(rt)}:${f3(h)}:${seg}`, () => new THREE.CylinderGeometry(rt, r, h, seg)), [side, roof, roof], x, y + h / 2, z).rotation.y = ry;
  return y + h;
}
/** A dish antenna: bowl of radius r tilted back by `tilt`, facing `face` (radians about y), feed horn glowing. */
function dish(parent, r, x, y, z, { tilt = 0.7, face = 0, mat = M2('#e9edf1', 0.4, 0.4), glow = CYAN } = {}) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.set(0, face, 0, 'YXZ');
  const tiltG = new THREE.Group(); tiltG.rotation.x = tilt; g.add(tiltG);
  const a = 0.55, R = r / Math.sin(a);
  const bowl = addMesh(tiltG, G(`dish${f3(R)}:${a}`, () => new THREE.SphereGeometry(R, 28, 8, 0, Math.PI * 2, 0, a)), mat, 0, R, 0);
  bowl.rotation.x = Math.PI;
  const depth = R * (1 - Math.cos(a)), fy = r * 0.75;
  ring(tiltG, r, r * 0.025, M('#9aa3ad', 0.6, 0.4), 0, depth, 0);
  for (let i = 0; i < 3; i++) { const t = i * 2.094; rod(tiltG, [Math.cos(t) * r * 0.95, depth, Math.sin(t) * r * 0.95], [0, fy, 0], r * 0.015, M(STEEL, 0.6, 0.4), 5); }
  cyl(tiltG, r * 0.06, r * 0.1, M(DARK, 0.5, 0.5), 0, fy - r * 0.05, 0, { seg: 8 });
  ball(tiltG, r * 0.045, neonMat(glow, 0.6), 0, fy + r * 0.07, 0);
  parent.add(g); return g;
}
/** A blinking-style beacon light. */
function beacon(parent, x, y, z, color = RED, s = 0.035) { return box(parent, s, s, s, neonMat(color, 0.9), x, y, z); }
/** A slim lamp post with a glowing head. */
function lampPost(parent, x, z, y, h = 0.22, color = WARM) {
  cyl(parent, 0.008, h, M(DARK, 0.5, 0.5), x, y, z, { seg: 5 });
  box(parent, 0.04, 0.015, 0.04, neonMat(color, 0.25), x, y + h, z);
}
/** A floodlight mast: tall pole, cross bar, glowing lamp panels. */
function floodMast(parent, x, z, y, h, color = WARM) {
  cyl(parent, 0.016, h, M(STEEL, 0.6, 0.4), x, y, z, { rt: 0.01, seg: 6 });
  box(parent, 0.14, 0.02, 0.02, M(DARK), x, y + h, z);
  for (const dx of [-0.045, 0, 0.045]) box(parent, 0.035, 0.03, 0.015, neonMat(color, 0.3), x + dx, y + h + 0.02, z);
}
/** Hazard stripes along x (len) at a height: alternating yellow / dark blocks. */
function hazardBar(parent, len, x, y, z, { h = 0.02, d = 0.012, alongZ = false, n = Math.max(2, Math.round(len / 0.05)) } = {}) {
  const s = len / n;
  for (let i = 0; i < n; i++) {
    const o = -len / 2 + s * (i + 0.5); const m = M(i % 2 ? '#22252b' : HAZARD, 0.2, 0.6);
    if (alongZ) box(parent, d, h, s, m, x, y, z + o); else box(parent, s, h, d, m, x + o, y, z);
  }
}
/** A shipping container. */
const CONTAINER = ['#a8432f', '#2f7f8a', '#d6a12c', '#5d6b78', '#3c5fa8', '#7c8a3c', '#b8b2a6'];
function container(parent, x, y, z, ry, color, len = 0.27) {
  const m = tbox(parent, len, 0.1, 0.105, M(color, 0.4, 0.55), x, y, z, ry);
  tbox(parent, len + 0.006, 0.012, 0.11, M('#2a2e34', 0.5, 0.5), x, y + 0.094, z, ry);
  return m;
}
/** A hover truck: cab + trailer floating over a cyan under-glow. ry: 0 = facing +x. */
function hoverTruck(parent, x, z, y, ry, color = '#d8dde3', s = 1) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; parent.add(g);
  box(g, 0.08 * s, 0.075 * s, 0.09 * s, M(color, 0.4, 0.4), 0.12 * s, 0.03 * s, 0);
  box(g, 0.012 * s, 0.03 * s, 0.07 * s, lamp('#2b4766', '#bfe8ff'), 0.165 * s, 0.07 * s, 0);
  box(g, 0.21 * s, 0.09 * s, 0.1 * s, M('#9aa3ad', 0.4, 0.5), -0.04 * s, 0.03 * s, 0);
  box(g, 0.3 * s, 0.008, 0.07 * s, neonMat(CYAN, 0.35), 0, 0.012, 0);
  return g;
}
/** Stylised alien tree (3 kinds) with glowing bulbs; s = scale (1 ≈ a quarter of a tile tall). */
const LEAF = ['#2f9e8a', '#3f74c8', '#7a5fd0', '#2fae6a', '#b85fa0'];
const BULB = ['#5ff8ff', '#7fb6ff', '#e08bff', '#b6ff5f', '#ff7fd0'];
function alienTree(parent, x, z, y, s, R) {
  const ci = R.int(0, LEAF.length - 1), kind = R.int(0, 2);
  const leaf = leafMat(LEAF[ci]), leaf2 = leafMat(LEAF[(ci + 1) % LEAF.length]), glow = neonMat(BULB[ci], 0.25), trunk = M('#4a3a48', 0.1, 0.8);
  if (kind === 0) {               // parasol: stacked discs with bulbs under the rim
    cyl(parent, 0.025 * s, 0.3 * s, trunk, x, y, z, { rt: 0.014 * s, seg: 6 });
    dome(parent, 0.16 * s, leaf, x, y + 0.26 * s, z, { squash: 0.45, seg: 14 });
    dome(parent, 0.09 * s, leaf2, x, y + 0.32 * s, z, { squash: 0.7, seg: 12 });
    for (let i = 0; i < 5; i++) { const a = i * 1.257 + R.range(0, 0.5); ball(parent, 0.02 * s, glow, x + Math.cos(a) * 0.13 * s, y + 0.235 * s, z + Math.sin(a) * 0.13 * s, 6); }
  } else if (kind === 1) {        // spire: stacked cones, a glowing tip
    cyl(parent, 0.02 * s, 0.1 * s, trunk, x, y, z, { seg: 6 });
    for (let i = 0; i < 3; i++) cyl(parent, (0.13 - 0.03 * i) * s, 0.15 * s, i % 2 ? leaf2 : leaf, x, y + (0.08 + 0.1 * i) * s, z, { rt: 0.01 * s, seg: 7 });
    ball(parent, 0.028 * s, glow, x, y + 0.42 * s, z, 8);
  } else {                        // frond: curling arms ending in pods, some lit
    cyl(parent, 0.02 * s, 0.34 * s, trunk, x, y, z, { rt: 0.012 * s, seg: 6 });
    for (let i = 0; i < 5; i++) {
      const a = i * 1.257 + R.range(0, 0.4), ex = x + Math.cos(a) * 0.13 * s, ez = z + Math.sin(a) * 0.13 * s;
      rod(parent, [x, y + 0.33 * s, z], [ex, y + 0.25 * s, ez], 0.009 * s, leaf, 5);
      ball(parent, 0.032 * s, i % 2 ? glow : leaf2, ex, y + 0.24 * s, ez, 8);
    }
    ball(parent, 0.06 * s, leaf, x, y + 0.36 * s, z, 10);
  }
}
/** A small power pylon: four legs, cross arm, three glowing insulators, a transformer box at its foot. */
function pylon(parent, x, z, y, h = 0.55, glow = CYAN) {
  const m = M('#6f7884', 0.6, 0.45), w = 0.07;
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) rod(parent, [x + a * w, y, z + b * w], [x + a * 0.015, y + h, z + b * 0.015], 0.007, m, 4);
  for (const t of [0.3, 0.6]) box(parent, w * 2 * (1 - t * 0.8), 0.008, w * 2 * (1 - t * 0.8), m, x, y + h * t, z);
  box(parent, 0.22, 0.016, 0.02, m, x, y + h * 0.88, z);
  for (const dx of [-0.09, 0, 0.09]) box(parent, 0.016, 0.035, 0.016, lamp('#6fb7c8', glow, 0.3), x + dx, y + h * 0.88 - 0.035, z);
  box(parent, 0.1, 0.07, 0.07, M('#59616c', 0.4, 0.5), x + 0.11, y, z + 0.06);
  beacon(parent, x, y + h, z, RED, 0.022);
}
/** Rocks / ore lumps scattered in a ring (rIn..rOut) round (cx, cz). */
function rocks(parent, R, n, cx, cz, rIn, rOut, mats, y, size = [0.04, 0.1], limit = 0.95) {
  const geo = G('ico', () => new THREE.IcosahedronGeometry(1, 0));
  for (let i = 0; i < n; i++) {
    const a = R.range(0, Math.PI * 2), d = R.range(rIn, rOut), s = R.range(size[0], size[1]);
    const x = Math.max(-limit + s, Math.min(limit - s, cx + Math.cos(a) * d)), z = Math.max(-limit + s, Math.min(limit - s, cz + Math.sin(a) * d));
    const m = addMesh(parent, geo, R.pick(mats), x, y + s * 0.35, z);
    m.scale.set(s, s * R.range(0.5, 0.9), s * R.range(0.7, 1.2)); m.rotation.set(R.range(0, 3), R.range(0, 3), R.range(0, 3));
  }
}
/** A crystal spike (stretched octahedron) leaning a little. */
function crystal(parent, x, z, y, h, r, mat, lean = 0, dir = 0) {
  const m = addMesh(parent, G('oct', () => new THREE.OctahedronGeometry(1, 0)), mat, x, y + h * 0.4, z);
  m.scale.set(r, h * 0.55, r); m.rotation.set(Math.sin(dir) * lean, dir, Math.cos(dir) * lean, 'YXZ'); return m;
}
/** A flat disc of ground (deposit patches, scorched rings). */
function groundDisc(parent, r, color, y = 0, seg = 9, x = 0, z = 0, h = 0.012) { return cyl(parent, r, h, M(color, 0.05, 0.95), x, y, z, { seg }); }
/** An irregular deposit patch: a main disc plus overlapping lobes, darker core. Stays inside a 2×2 lot. */
function deposit(parent, R, color, core) {
  groundDisc(parent, 0.82, color, 0, 9).rotation.y = R.range(0, 1);
  for (let i = 0; i < 6; i++) {
    const a = i * 1.047 + R.range(-0.3, 0.3), r = R.range(0.25, 0.4), d = 0.92 - r;
    groundDisc(parent, r, color, 0, 7, Math.cos(a) * d, Math.sin(a) * d, 0.012 - i * 0.0005).rotation.y = R.range(0, 1);
  }
  groundDisc(parent, 0.55, core, 0.012, 8, R.range(-0.05, 0.05), R.range(-0.05, 0.05), 0.008).rotation.y = R.range(0, 1);
}
/** Hyperbolic cooling tower (open top you can see into), with a glowing rim. */
function coolingTower(parent, x, z, y, r, h, rim = CYAN, color = '#dfe4e9') {
  const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push([r * (0.62 + 0.38 * Math.pow((t - 0.68) / 0.68, 2)), t * h]); }
  lathe(parent, pts, M2(color, 0.1, 0.8), x, y, z, 28);
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; rod(parent, [x + Math.cos(a) * r * 0.98, y, z + Math.sin(a) * r * 0.98], [x + Math.cos(a + 0.4) * r * 0.86, y + h * 0.12, z + Math.sin(a + 0.4) * r * 0.86], r * 0.03, M('#9aa1a8'), 4); }
  ring(parent, pts[10][0], r * 0.035, neonMat(rim, 0.4), x, y + h, z);
  ring(parent, pts[0][0] * 0.99, r * 0.03, M('#7d858e'), x, y + h * 0.12, z);
  return pts[10][0];
}
/** Steam puffs over a stack or tower (light, matte, rising). */
function steam(parent, R, x, z, y, s) {
  const m = cached('steam', () => new THREE.MeshStandardMaterial({ color: '#f4f6f8', roughness: 1, transparent: true, opacity: 0.5, depthWrite: false }));
  for (let i = 0; i < 4; i++) ball(parent, s * (0.6 + i * 0.25), m, x + R.range(-0.3, 0.3) * s + i * s * 0.25, y + i * s * 0.75, z + R.range(-0.3, 0.3) * s - i * s * 0.15, 10).castShadow = false;
}
/** Banded smoke stack with a red beacon (and a soot ring). */
function stack(parent, x, z, y, r, h, band = '#b8322b') {
  cyl(parent, r, h, M('#cfd3d6', 0.2, 0.7), x, y, z, { rt: r * 0.8, seg: 14 });
  for (const t of [0.62, 0.82]) cyl(parent, r * (1 - t * 0.2) + 0.006, h * 0.07, M(band, 0.2, 0.6), x, y + h * t, z, { seg: 14 });
  cyl(parent, r * 0.81, h * 0.05, M('#2a2a2e', 0.2, 0.9), x, y + h * 0.95, z, { seg: 14 });
  beacon(parent, x + r * 0.8, y + h * 0.9, z, RED, 0.025);
}
/** A low perimeter fence along the lot's back edges (−x and −z), with gaps. */
function fence(parent, w, d, y, R, sides = ['-x', '-z']) {
  const m = M('#6f7884', 0.5, 0.5), e = 0.47;
  for (const s of sides) {
    const along = s.endsWith('x') ? d : w, n = Math.round(along / 0.25);
    for (let i = 0; i < n; i++) {
      if (R.chance(0.12)) continue;
      const o = -along / 2 + (i + 0.5) * along / n;
      if (s.endsWith('x')) box(parent, 0.012, 0.07, along / n - 0.02, m, (s[0] === '-' ? -1 : 1) * w * e * 2 / 2 * 0.98, y, o);
      else box(parent, along / n - 0.02, 0.07, 0.012, m, o, y, (s[0] === '-' ? -1 : 1) * d * e * 2 / 2 * 0.98);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Industry
// ---------------------------------------------------------------------------------------------------------------
function buildWorkshop(p) {
  const g = new THREE.Group(); const y0 = lotPad(g, 2, 2, '#575d63');
  const hw = 1.5, hd = 1.1, hx = -0.15, hz = -0.32;
  const top = storeys(g, { w: hw, d: hd, floors: p.floors, x: hx, z: hz, y: y0, style: p.style, kind: 'bands', seed: p.seed, lit: 0.5 });
  slab(g, hw + 0.04, hd + 0.04, p.style, hx, top, hz, 0.03);
  // sawtooth roof: each tooth's glazed face looks toward the yard and glows warm at night
  const tz = hd / p.teeth, roofM = M(p.style === 'graphite' ? '#4a5262' : '#8d969f', 0.5, 0.45), sky = lamp('#5d86a8', '#e8c48a');
  for (let i = 0; i < p.teeth; i++) {
    const z = hz - hd / 2 + tz * (i + 0.5);
    tooth(g, hw - 0.02, tz, 0.15, roofM, hx, top + 0.03, z);
    box(g, hw - 0.08, 0.1, 0.008, sky, hx, top + 0.045, z + tz / 2 + 0.003);
  }
  // extraction fans + a short exhaust stack at the back
  for (const dx of [-0.45, 0.15]) { cyl(g, 0.07, 0.04, M(DARK, 0.5, 0.5), hx + dx, top + 0.03, hz - hd / 2 + 0.12, { seg: 12 }); cyl(g, 0.055, 0.012, M('#1c1f24'), hx + dx, top + 0.07, hz - hd / 2 + 0.12, { seg: 12 }); }
  stack(g, hx - hw / 2 + 0.12, hz - hd / 2 + 0.12, top + 0.03, 0.045, 0.35 + p.floors * 0.1, '#d6a12c');
  // loading bay on the yard side: roller doors, glowing strips, a dock with hazard edge
  const fz = hz + hd / 2, doors = 3;
  for (let i = 0; i < doors; i++) {
    const x = hx - hw / 2 + (i + 0.5) * hw / doors;
    box(g, 0.3, 0.17, 0.012, M('#3b4149', 0.5, 0.6), x, y0 + 0.05, fz + 0.002);
    for (let k = 1; k < 5; k++) box(g, 0.3, 0.004, 0.016, M('#2a2f36'), x, y0 + 0.05 + k * 0.034, fz + 0.002);
    box(g, 0.32, 0.018, 0.02, neonMat('#ffb02e', 0.5), x, y0 + 0.23, fz + 0.004);
  }
  box(g, hw, 0.05, 0.14, M('#8e9496', 0.1, 0.9), hx, y0, fz + 0.07);
  hazardBar(g, hw, hx, y0 + 0.035, fz + 0.142);
  // a trailer backed up to the first door, another truck waiting
  hoverTruck(g, hx - hw / 3, fz + 0.32, y0 + 0.02, -Math.PI / 2, '#d8dde3');
  if (p.R.chance(0.6)) hoverTruck(g, 0.25, 0.78, y0 + 0.02, 0, '#e3b52c');
  // office annex with its sign
  const ox = 0.78, oz = -0.4;
  const otop = storeys(g, { w: 0.3, d: 0.5, floors: p.floors + 1, x: ox, z: oz, y: y0, style: p.style, kind: 'curtain', seed: p.seed + 3 });
  slab(g, 0.33, 0.53, p.style, ox, otop, oz);
  neonEdges(g, 0.3, 0.5, neonOf(p), ox, otop - 0.005, oz, 0.02, 0.3);
  sign(g, '+x', neonOf(p, 1), p.seed, { x: ox + 0.16, y: y0 + 0.08, z: oz + 0.12, h: Math.min(0.4, (p.floors + 1) * FLOOR * 0.7), w: 0.1 });
  // pallets and crates in the yard
  const crate = [M('#b58a5a', 0.1, 0.8), M('#6f7d6a', 0.2, 0.7), M('#4f6b8a', 0.3, 0.6)];
  for (let i = 0; i < 6; i++) {
    const x = p.R.range(0.5, 0.88), z = p.R.range(0.25, 0.88), s = p.R.range(0.06, 0.09);
    box(g, s, s * p.R.range(0.7, 1.2), s, p.R.pick(crate), x, y0, z);
  }
  for (const x of [-0.9, 0.4]) { box(g, 0.025, 0.06, 0.025, M(HAZARD, 0.2, 0.6), x, y0, 0.9); box(g, 0.026, 0.012, 0.026, neonMat('#ffb02e', 0.5), x, y0 + 0.06, 0.9); }
  fence(g, 2, 2, y0, p.R);
  return g;
}

function buildDepot(p) {
  const g = new THREE.Group(); const y0 = lotPad(g, 3, 2, '#55595e');
  // sheds along the back: walls + barrel roof with a glowing ridge light, roller doors to the yard
  const sheds = p.sheds === 2 ? [[-0.72, 1.36], [0.72, 1.36]] : [[-0.62, 1.6]];
  const roofM = M('#8d97a2', 0.55, 0.4);
  sheds.forEach(([x, len], i) => {
    const z = -0.55, d = 0.76;
    storeys(g, { w: len, d, floors: 1, x, z, y: y0, style: p.style, kind: 'louvre', seed: p.seed + i, lit: 0.3 });
    box(g, len + 0.02, 0.02, d + 0.02, trimMat(p.style), x, y0 + FLOOR, z);
    barrel(g, len, d / 2, roofM, x, y0 + FLOOR + 0.02, z, { squash: 0.55 });
    for (let k = 0; k < 4; k++) box(g, 0.012, 0.012, d * 0.95, M('#6c7580', 0.6, 0.4), x - len / 2 + (k + 0.5) * len / 4, y0 + FLOOR + 0.02, z);
    box(g, len * 0.9, 0.012, 0.03, lamp('#7a9ab8', '#bfe8ff'), x, y0 + FLOOR + 0.02 + d / 2 * 0.55 - 0.005, z);
    for (let k = 0; k < 3; k++) {
      const dx = x - len / 2 + (k + 0.5) * len / 3;
      box(g, 0.3, 0.17, 0.01, M('#3b4149', 0.5, 0.6), dx, y0, z + d / 2 + 0.003);
      box(g, 0.32, 0.016, 0.016, neonMat(neonOf(p, k), 0.5), dx, y0 + 0.18, z + d / 2 + 0.006);
      box(g, 0.05, 0.01, 0.01, M(HAZARD), dx - 0.13, y0 + 0.002, z + d / 2 + 0.03);
    }
  });
  if (p.sheds === 1) {   // a gate office + stores where the second shed would be
    const t = storeys(g, { w: 0.5, d: 0.5, floors: 2, x: 1.1, z: -0.65, y: y0, style: p.style, kind: 'curtain', seed: p.seed + 5 });
    slab(g, 0.53, 0.53, p.style, 1.1, t, -0.65); roofProps(g, 0.4, 0.4, t + 0.04, p.style, p.R, {});
    neonEdges(g, 0.5, 0.5, neonOf(p), 1.1, y0 + FLOOR, -0.65, 0.02);
  }
  // container yard: rows of stacks
  const rows = [0.17, 0.3, 0.68, 0.81];
  for (const z of rows) for (let x = -1.3; x <= 1.31; x += 0.29) {
    if (p.R.chance(0.15)) continue;
    const n = p.R.int(1, p.stacks);
    for (let k = 0; k < n; k++) container(g, x + p.R.range(-0.006, 0.006), y0 + k * 0.105, z, 0, p.R.pick(CONTAINER));
  }
  // rails + gantry crane straddling the yard, lifting a box
  const rm = M('#4a4f56', 0.7, 0.4);
  for (const z of [0.05, 0.94]) box(g, 2.9, 0.012, 0.02, rm, 0, y0, z);
  const gx = p.R.range(-0.7, 0.7), H = p.stacks * 0.105 + 0.24, ym = M(HAZARD, 0.4, 0.5);
  for (const z of [0.05, 0.94]) {
    box(g, 0.2, 0.04, 0.05, ym, gx, y0, z);
    for (const dx of [-0.08, 0.08]) box(g, 0.025, H, 0.025, ym, gx + dx, y0 + 0.04, z);
    box(g, 0.2, 0.02, 0.025, ym, gx, y0 + H * 0.55, z);
  }
  box(g, 0.21, 0.06, 0.97, ym, gx, y0 + H + 0.04, 0.495);
  const tz = 0.33 + p.R.range(-0.05, 0.25);
  box(g, 0.16, 0.06, 0.12, M('#d8dde3', 0.3, 0.5), gx, y0 + H + 0.1, tz);
  box(g, 0.004, 0.03, 0.08, lamp('#2b4766', '#bfe8ff'), gx + 0.082, y0 + H + 0.12, tz);
  const ly = y0 + H * 0.45;
  for (const dz of [-0.03, 0.03]) rod(g, [gx, y0 + H + 0.04, tz + dz], [gx, ly + 0.12, tz + dz], 0.004, M('#222'), 4);
  box(g, 0.28, 0.015, 0.11, M('#2a2e34'), gx, ly + 0.105, tz);
  container(g, gx, ly, tz, 0, p.R.pick(CONTAINER));
  for (const z of [0.05, 0.94]) beacon(g, gx, y0 + H + 0.1, z, '#ffb02e', 0.025);
  // floodlight masts at the yard corners and a truck at the gate
  floodMast(g, -1.42, 0.5, y0, 0.75); floodMast(g, 1.42, 0.5, y0, 0.75);
  hoverTruck(g, 1.2, -0.08, y0 + 0.02, Math.PI, '#d8dde3');
  return g;
}

// Refinery on a 3×3 plan, scaled down to fit a 2×2 lot. product: 0 Steel · 1 Concrete · 2 Power cells.
function buildRefinery(p, S) {
  const g = new THREE.Group(); const y0 = lotPad(g, S, S, ['#4d5258', '#6a6d70', '#5e6670'][p.product]);
  const k = S / 3, big = S === 3;
  const a = new THREE.Group(); a.scale.setScalar(k); a.position.y = y0; g.add(a);
  const R = p.R;
  if (p.product === 0) {
    // STEEL: smelter hall, blast furnace with glowing vents and a molten channel, banded stacks, ore + coal heaps
    const t = storeys(a, { w: 1.5, d: 0.95, floors: 3, x: -0.55, z: -0.85, style: p.style, kind: 'louvre', seed: p.seed, lit: 0.35 });
    slab(a, 1.54, 0.99, p.style, -0.55, t, -0.85);
    box(a, 1.3, 0.12, 0.3, M('#5a5f66', 0.5, 0.5), -0.55, t + 0.04, -0.85);
    box(a, 1.26, 0.05, 0.012, lamp('#6b5040', ORANGE, 0.25), -0.55, t + 0.08, -0.85 + 0.156);
    box(a, 0.6, 0.3, 0.012, lamp('#4a3a30', ORANGE, 0.35), -0.55, 0, -0.85 + 0.48);   // open furnace door glow
    for (const x of [-1.2, -0.92, ...(big ? [-0.64] : [])]) stack(a, x, -1.25, 0, 0.09, 1.9 + R.range(-0.2, 0.2));
    steam(a, R, -1.2, -1.25, 2.0, 0.09);
    // blast furnace
    const fx = 0.75, fz = -0.55;
    cyl(a, 0.36, 0.28, M('#3b3f46', 0.6, 0.5), fx, 0, fz, { seg: 16 });
    for (let i = 0; i < 8; i++) { const an = i * Math.PI / 4; box(a, 0.05, 0.08, 0.05, lamp('#5a3a2a', ORANGE, 0.6), fx + Math.cos(an) * 0.35, 0.1, fz + Math.sin(an) * 0.35); }
    cyl(a, 0.32, 0.95, M(RUST, 0.5, 0.6), fx, 0.28, fz, { rt: 0.22, seg: 16 });
    for (const y of [0.5, 0.8, 1.05]) cyl(a, 0.3 - (y - 0.28) * 0.1 + 0.015, 0.03, M(DARK, 0.6, 0.4), fx, y, fz, { seg: 16 });
    cyl(a, 0.14, 0.3, M('#5d6168', 0.5, 0.5), fx, 1.23, fz, { seg: 12 });
    beacon(a, fx, 1.55, fz, RED, 0.03);
    rod(a, [fx, 1.4, fz], [1.2, 1.05, 0.05], 0.05, M('#6d7279', 0.5, 0.5));
    cyl(a, 0.15, 0.6, M('#6d7279', 0.5, 0.5), 1.2, 0.45, 0.05, { seg: 14 }); cyl(a, 0.04, 0.45, M(DARK), 1.2, 0, 0.05, { rt: 0.15, seg: 14 });
    // molten channel to the casting bay, ladle cars on it
    box(a, 0.08, 0.012, 0.95, neonMat('#ff9a3a', 0.9), fx, 0, 0.3);
    box(a, 0.14, 0.01, 0.97, M('#2a2a2e', 0.2, 0.9), fx, 0, 0.3);
    for (const z of [0.15, 0.55]) { box(a, 0.12, 0.04, 0.14, M(DARK, 0.6, 0.4), fx + 0.12, 0, z); cyl(a, 0.06, 0.08, M('#5a4a40', 0.5, 0.6), fx + 0.12, 0.04, z, { seg: 12 }); cyl(a, 0.05, 0.005, neonMat(ORANGE, 0.8), fx + 0.12, 0.12, z, { seg: 12 }); }
    // ore and coal heaps feeding a conveyor up to the furnace top
    cyl(a, 0.38, 0.28, M('#6a4433', 0.1, 0.95), -0.85, 0, 0.75, { rt: 0.02, seg: 10 });
    cyl(a, 0.3, 0.22, M('#26272b', 0.1, 0.95), -0.25, 0, 1.0, { rt: 0.02, seg: 10 });
    belt(a, [-0.55, 0.12, 0.55], [fx - 0.12, 1.35, fz + 0.1], 0.08, 0.025, M('#4f555c', 0.5, 0.5));
    for (const t of [0.3, 0.6]) { const x = -0.55 + (fx - 0.12 + 0.55) * t, z = 0.55 + (fz + 0.1 - 0.55) * t, y = 0.12 + 1.23 * t; rod(a, [x, 0, z], [x, y - 0.02, z], 0.015, M(STEEL), 5); }
    // finished coils
    for (let i = 0; i < (big ? 6 : 4); i++) hcyl(a, 0.08, 0.1, M('#b4bcc4', 0.5, 0.35), 1.0 + (i % 2) * 0.22, 0.08, 0.8 + Math.floor(i / 2) * 0.2, Math.PI / 2, 16);
  } else if (p.product === 1) {
    // CONCRETE: a row of silos with catwalk, batching tower, rotary kiln with a glowing mouth, aggregate heaps
    const sil = M('#cfccc4', 0.15, 0.7), band = M(neonOf(p) === '#7dff6a' ? '#5f8a4a' : '#4f7fa8', 0.3, 0.5);
    const n = big ? 4 : 3;
    for (let i = 0; i < n; i++) {
      const x = -1.15 + i * 0.44, z = -0.85;
      for (const [dx, dz] of [[-0.12, -0.12], [0.12, -0.12], [0.12, 0.12], [-0.12, 0.12]]) rod(a, [x + dx, 0, z + dz], [x + dx * 0.9, 0.42, z + dz * 0.9], 0.016, M(STEEL), 5);
      cyl(a, 0.19, 0.2, sil, x, 0.25, z, { rt: 0.05, seg: 18 }).rotation.x = Math.PI;
      cyl(a, 0.19, 1.15, sil, x, 0.45, z, { seg: 18 });
      cyl(a, 0.195, 0.08, band, x, 1.25, z, { seg: 18 });
      cyl(a, 0.19, 0.1, sil, x, 1.6, z, { rt: 0.08, seg: 18 });
      beacon(a, x, 1.72, z, GREEN, 0.025);
    }
    box(a, 0.44 * (n - 1) + 0.2, 0.025, 0.12, M('#7d858e', 0.5, 0.5), -1.15 + 0.22 * (n - 1), 1.6, -0.62);
    // batching tower + conveyor from the heaps
    const bt = storeys(a, { w: 0.45, d: 0.45, floors: 7, x: 1.05, z: -0.95, style: p.style, kind: 'bands', seed: p.seed + 2, lit: 0.45 });
    slab(a, 0.5, 0.5, p.style, 1.05, bt, -0.95); roofProps(a, 0.4, 0.4, bt + 0.04, p.style, R, {});
    neonEdges(a, 0.45, 0.45, neonOf(p), 1.05, FLOOR * 2, -0.95, 0.02);
    belt(a, [-0.3, 0.12, 0.6], [0.85, 1.35, -0.85], 0.08, 0.025, M('#4f555c', 0.5, 0.5));
    for (const t of [0.25, 0.55, 0.8]) { const x = -0.3 + 1.15 * t, z = 0.6 - 1.45 * t; rod(a, [x, 0, z], [x, 0.12 + 1.23 * t - 0.02, z], 0.014, M(STEEL), 5); }
    // rotary kiln on rollers with a glowing mouth + preheater
    const kz = 0.05;
    hcyl(a, 0.14, 1.5, M('#9a8a78', 0.4, 0.6), -0.15, 0.3, kz, 0, 18).rotation.z = Math.PI / 2 + 0.05;
    for (const x of [-0.7, -0.15, 0.4]) { box(a, 0.06, 0.18, 0.26, M(DARK, 0.5, 0.5), x, 0, kz); ring(a, 0.15, 0.02, M('#5d6168', 0.7, 0.4), x, 0.3, kz, { tilt: Math.PI / 2, spin: Math.PI / 2 }); }
    cyl(a, 0.13, 0.01, neonMat(ORANGE, 0.8), -0.91, 0.27, kz, { seg: 16 }).rotation.z = Math.PI / 2;
    cyl(a, 0.11, 0.5, M('#2a2a2e', 0.2, 0.9), -1.1, 0, kz, { rt: 0.08, seg: 12 });
    // aggregate heaps (sand, gravel, cement) by the kiln
    [['#c8b48a', -0.9, 0.75, 0.3], ['#8d8a84', -0.3, 0.85, 0.28], ['#b9bcbf', 0.3, 1.05, 0.22]].forEach(([c, x, z, r]) => cyl(a, r, r * 0.75, M(c, 0, 1), x, 0, z, { rt: 0.02, seg: 12 }));
    // mixer drums at the loading bay
    for (let i = 0; i < (big ? 2 : 1); i++) {
      const x = 0.95, z = 0.35 + i * 0.5;
      hoverTruck(a, x, z, 0.02, 0, '#e3e7eb', 1.3);
      const d = hcyl(a, 0.08, 0.22, M(i ? '#e07a2a' : '#e3b52c', 0.3, 0.5), x - 0.06, 0.18, z, 0, 14); d.rotation.z = Math.PI / 2 - 0.25;
    }
  } else {
    // POWER CELLS: clean white factory, glowing cell racks, coolant towers with cyan rims, teal coolant pipes
    const t = storeys(a, { w: 1.5, d: 0.9, floors: 3, x: -0.6, z: -0.9, style: 'pearl', kind: 'curtain', seed: p.seed, lit: 0.6 });
    slab(a, 1.54, 0.94, 'pearl', -0.6, t, -0.9);
    neonEdges(a, 1.5, 0.9, CYAN, -0.6, t, -0.9, 0.025, 0.4);
    neonEdges(a, 1.5, 0.9, CYAN, -0.6, FLOOR, -0.9, 0.02, 0.4);
    for (let i = 0; i < 3; i++) box(a, 0.3, 0.012, 0.6, lamp('#3d6a94', '#bfe8ff'), -1.1 + i * 0.5, t + 0.04, -0.9);
    sign(a, '+x', CYAN, p.seed, { x: 0.17, y: FLOOR, z: -0.75, h: 0.4, w: 0.14 });
    // racks of cells in the yard
    const rack = M('#5d6670', 0.6, 0.4), cell = lamp('#2a3946', CYAN, 0.35), cap = M('#c9d2dc', 0.6, 0.3);
    const rows = big ? 4 : 3;
    for (let r = 0; r < rows; r++) {
      const z = 0.0 + r * 0.32, x0 = -1.25, len = 1.15;
      box(a, len, 0.04, 0.2, rack, x0 + len / 2, 0, z);
      for (let i = 0; i < 9; i++) for (const dz of [-0.05, 0.05]) {
        const x = x0 + 0.07 + i * 0.127;
        cyl(a, 0.034, 0.11, M('#3c4652', 0.5, 0.4), x, 0.04, z + dz, { seg: 10 });
        cyl(a, 0.036, 0.025, cell, x, 0.12, z + dz, { seg: 10 });
        cyl(a, 0.02, 0.02, cap, x, 0.145, z + dz, { seg: 8 });
      }
      for (const x of [x0 + 0.02, x0 + len - 0.02]) box(a, 0.02, 0.25, 0.2, rack, x, 0, z);
      box(a, len, 0.015, 0.2, M('#8a949f', 0.6, 0.4), x0 + len / 2, 0.25, z);
    }
    // coolant towers + pipes
    const towers = big ? [[0.95, -0.85], [0.95, 0.15], [0.35, 0.95]] : [[0.95, -0.7], [0.75, 0.55]];
    for (const [x, z] of towers) { coolingTower(a, x, z, 0, 0.36, 1.05, CYAN); }
    const pipe = M('#3f8a8e', 0.6, 0.35);
    for (const [x, z] of towers) {
      rod(a, [0.15, 0.12, -0.6], [x - 0.3, 0.12, z], 0.035, pipe);
      box(a, 0.05, 0.12, 0.05, M(DARK), (0.15 + x - 0.3) / 2, 0, (-0.6 + z) / 2);
    }
    box(a, 0.2, 0.25, 0.2, M('#59616c', 0.4, 0.5), 0.15, 0, -0.6);
    for (const dx of [-0.06, 0.06]) box(a, 0.02, 0.05, 0.02, lamp('#6fb7c8', CYAN, 0.3), 0.15 + dx, 0.25, -0.6);
  }
  return g;
}

// ---------------------------------------------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------------------------------------------
function buildFusion(p, S) {
  const g = new THREE.Group(); const y0 = lotPad(g, S, S, '#5b6168');
  const a = new THREE.Group(); a.scale.setScalar(S / 3); a.position.y = y0; g.add(a);
  const R = p.R, cx = -0.3, cz = -0.3;
  // a raised octagonal deck with a cyan ground ring
  cyl(a, 1.0, 0.08, M('#7d838a', 0.3, 0.7), cx, 0, cz, { seg: 8 });
  ring(a, 0.92, 0.015, neonMat(CYAN, 0.4), cx, 0.085, cz, { seg: 8 });
  // reactor: plinth, dome, glowing equator band, oculus
  cyl(a, 0.68, 0.22, M(DARK, 0.5, 0.5), cx, 0.08, cz, { seg: 24 });
  for (let i = 0; i < 12; i++) { const an = i * Math.PI / 6; box(a, 0.06, 0.12, 0.02, lamp('#2a4a5a', CYAN, 0.3), cx + Math.cos(an) * 0.68, 0.12, cz + Math.sin(an) * 0.68).rotation.y = -an + Math.PI / 2; }
  dome(a, 0.6, M('#e6eaee', 0.4, 0.35), cx, 0.3, cz, { squash: 0.85, seg: 32 });
  ring(a, 0.605, 0.03, neonMat(CYAN, 0.55), cx, 0.32, cz);
  cyl(a, 0.13, 0.04, lamp('#9fe8f0', CYAN, 0.7), cx, 0.3 + 0.6 * 0.85 - 0.02, cz, { seg: 16 });
  ring(a, 0.15, 0.015, M(DARK), cx, 0.3 + 0.6 * 0.85 + 0.02, cz);
  // containment rings, tilted, each with a lit arc
  const ringM = M('#4a525e', 0.7, 0.35);
  for (let i = 0; i < p.rings; i++) {
    const Rr = 0.78 + i * 0.09, tilt = [0.35, -0.5, 0.95][i], spin = [0.4, 1.6, 2.6][i], y = 0.55 + i * 0.05;
    ring(a, Rr, 0.035, ringM, cx, y, cz, { tilt, spin });
    ring(a, Rr, 0.04, neonMat(CYAN, 0.6), cx, y, cz, { tilt, spin, arc: Math.PI * 0.7 });
    ring(a, Rr, 0.04, neonMat(CYAN, 0.6), cx, y, cz, { tilt, spin: spin + Math.PI, arc: Math.PI * 0.35 });
  }
  // cooling towers with steam
  const spots = [[0.95, -0.95], [0.95, 0.3], [-1.05, 0.95]];
  for (let i = 0; i < p.towers; i++) { const [x, z] = spots[i]; const r = coolingTower(a, x, z, 0, 0.4, 1.1, CYAN); steam(a, R, x, z, 1.2, r * 0.6); }
  // turbine hall + control room
  const ht = storeys(a, { w: 1.0, d: 0.48, floors: 2, x: 0.5, z: 1.1, style: p.style, kind: 'bands', seed: p.seed, lit: 0.5 });
  slab(a, 1.04, 0.52, p.style, 0.5, ht, 1.1); roofProps(a, 0.9, 0.4, ht + 0.04, p.style, R, { antenna: false });
  neonEdges(a, 1.0, 0.48, CYAN, 0.5, ht, 1.1, 0.02, 0.35);
  rod(a, [cx + 0.5, 0.15, cz + 0.55], [0.3, 0.15, 0.86], 0.05, M('#5f6873', 0.6, 0.4));
  // switchyard: transformers + insulators on the left edge
  for (let i = 0; i < 3; i++) {
    const z = -0.05 + i * 0.3, x = -1.3;
    box(a, 0.16, 0.14, 0.2, M('#6b737d', 0.5, 0.5), x, 0, z);
    for (const dz of [-0.06, 0, 0.06]) { cyl(a, 0.012, 0.1, M('#c9d2dc'), x, 0.14, z + dz, { seg: 6 }); ball(a, 0.018, lamp('#8fd8e8', CYAN, 0.3), x, 0.25, z + dz, 8); }
  }
  pylon(a, -1.25, -1.25, 0, 0.75);
  return g;
}

function buildWater(p) {
  const g = new THREE.Group(); const y0 = lotPad(g, 2, 2, '#55606a');
  const pipeM = M('#4f7fa8', 0.6, 0.35), flange = M('#33506b', 0.6, 0.4), BLUE = '#3fb0ff';
  // pump house
  const t = storeys(g, { w: 0.7, d: 0.55, floors: 2, x: -0.5, z: -0.58, y: y0, style: p.style, kind: 'grid', seed: p.seed, lit: 0.5 });
  slab(g, 0.74, 0.59, p.style, -0.5, t, -0.58);
  neonEdges(g, 0.7, 0.55, BLUE, -0.5, t, -0.58, 0.02, 0.35);
  box(g, 0.16, 0.17, 0.01, M('#3b4149', 0.5, 0.6), -0.5, y0, -0.58 + 0.28);
  box(g, 0.18, 0.015, 0.015, neonMat(BLUE, 0.5), -0.5, y0 + 0.18, -0.58 + 0.285);
  for (const dx of [-0.2, 0.1]) cyl(g, 0.06, 0.05, M(DARK, 0.5, 0.5), -0.5 + dx, t + 0.04, -0.6, { seg: 12 });
  // water tank(s): body, blue lit band, cap, ladder
  const tanks = p.tanks === 2 ? [[0.45, -0.45, 0.34, 0.66], [0.58, 0.5, 0.26, 0.46]] : [[0.45, -0.45, 0.36, 0.72]];
  for (const [x, z, r, h] of tanks) {
    cyl(g, r + 0.02, 0.05, M('#8e9496', 0.1, 0.9), x, y0, z, { seg: 24 });
    cyl(g, r, h, M('#dfe4ea', 0.35, 0.45), x, y0 + 0.05, z, { seg: 24 });
    for (const y of [0.3, 0.6]) if (y < h) cyl(g, r + 0.005, 0.015, M('#a9b4bf', 0.6, 0.4), x, y0 + 0.05 + y, z, { seg: 24 });
    cyl(g, r + 0.006, 0.035, lamp('#4f7fa8', BLUE, 0.35), x, y0 + 0.05 + h - 0.08, z, { seg: 24 });
    dome(g, r, M('#c9d2dc', 0.4, 0.4), x, y0 + 0.05 + h, z, { squash: 0.3, seg: 24 });
    box(g, 0.04, h + 0.05, 0.01, M(STEEL, 0.6, 0.4), x + r * 0.7, y0 + 0.05, z + r * 0.72);
    for (const a of [0.3, 1.9, 3.5, 5.1]) box(g, 0.035, h * 0.92, 0.035, M('#a9b4bf', 0.6, 0.4), x + Math.cos(a) * r, y0 + 0.05, z + Math.sin(a) * r);
    cyl(g, r * 0.3, 0.012, lamp('#2f6a9a', BLUE, 0.35), x + r + 0.004, y0 + 0.05 + h * 0.5, z, { seg: 20 }).rotation.z = Math.PI / 2;
    for (const w of [-1, 1]) box(g, 0.006, 0.012, r * 0.3, M('#e9edf1', 0.2, 0.5), x + r + 0.012, y0 + 0.05 + h * 0.5 + w * 0.02, z);
    beacon(g, x, y0 + 0.05 + h + r * 0.3, z, RED, 0.025);
  }
  // intake pool with a glowing ring under the surface
  const px = -0.45, pz = 0.45;
  cyl(g, 0.38, 0.06, M('#9aa0a2', 0.1, 0.9), px, y0, pz, { seg: 28 });
  cyl(g, 0.32, 0.005, lamp('#1d4a6a', BLUE, 0.15), px, y0 + 0.045, pz, { seg: 28 });
  cyl(g, 0.33, 0.012, waterMat(), px, y0 + 0.05, pz, { seg: 28 });
  ring(g, 0.34, 0.01, neonMat(BLUE, 0.3), px, y0 + 0.065, pz);
  box(g, 0.06, 0.12, 0.06, M(DARK, 0.5, 0.5), px + 0.2, y0 + 0.02, pz - 0.1);
  // pipes: pool → pump house → tank, plus two pipes diving into the underground network through a lit grate
  const py = y0 + 0.09;
  rod(g, [px + 0.2, py, pz - 0.1], [px + 0.2, py, -0.3], 0.035, pipeM); ball(g, 0.04, flange, px + 0.2, py, pz - 0.1, 10);
  rod(g, [-0.15, py + 0.05, -0.5], [tanks[0][0] - tanks[0][2], py + 0.05, -0.5], 0.04, pipeM);
  if (tanks[1]) { rod(g, [tanks[0][0], py, tanks[0][1] + tanks[0][2]], [tanks[1][0], py, tanks[1][1] - tanks[1][2]], 0.035, pipeM); }
  for (const x of [0.0, 0.08]) for (const pz2 of [-0.5]) cyl(g, 0.048, 0.02, flange, x, py + 0.01, pz2, { seg: 12 }).rotation.z = Math.PI / 2;
  const gx = -0.05, gz = 0.05;
  box(g, 0.42, 0.04, 0.32, M('#5d6670', 0.5, 0.5), gx, y0, gz);
  box(g, 0.36, 0.006, 0.26, lamp('#1d2a34', BLUE, 0.2), gx, y0 + 0.037, gz);
  for (let i = 0; i < 7; i++) box(g, 0.006, 0.01, 0.26, M('#2a3038', 0.5, 0.5), gx - 0.15 + i * 0.05, y0 + 0.04, gz);
  for (const dx of [-0.08, 0.08]) {
    rod(g, [gx + dx, y0 + 0.04, gz], [gx + dx, py + 0.12, gz], 0.03, pipeM);
    rod(g, [gx + dx, py + 0.12, gz], [gx + dx, py + 0.12, -0.3], 0.03, pipeM);
    ball(g, 0.034, flange, gx + dx, py + 0.12, gz, 10);
  }
  ring(g, 0.035, 0.008, M('#c0392b', 0.4, 0.5), gx + 0.08, py + 0.2, gz, { tilt: Math.PI / 2 });
  rod(g, [gx + 0.08, py + 0.12, gz], [gx + 0.08, py + 0.2, gz], 0.006, M(DARK), 4);
  fence(g, 2, 2, y0, p.R);
  lampPost(g, 0.85, 0.85, y0, 0.25, BLUE); lampPost(g, -0.88, -0.05, y0, 0.25, BLUE);
  return g;
}

function buildSchool(p) {
  const g = new THREE.Group(); const y0 = lotPad(g, 2, 2, '#66707a');
  const accents = ['#f2a03c', '#4fb3d9', '#7ccf6a', '#e86a7a'];
  // L-shaped classroom wings
  const blocks = [[-0.05, -0.62, 1.7, 0.6], [-0.65, 0.2, 0.55, 1.05]];
  blocks.forEach(([x, z, w, d], i) => {
    const t = storeys(g, { w, d, floors: p.floors, x, z, y: y0, style: p.style, kind: 'bands', seed: p.seed + i, lit: 0.5 });
    slab(g, w + 0.04, d + 0.04, p.style, x, t, z);
    // solar panel rows on the roof
    const n = Math.floor((i ? d : w) / 0.22);
    for (let k = 0; k < n; k++) {
      const o = -((i ? d : w) / 2) + 0.12 + k * 0.22;
      const m = box(g, i ? w * 0.75 : 0.18, 0.012, i ? 0.18 : d * 0.7, M('#22355a', 0.7, 0.25), i ? x : x + o, t + 0.06, i ? z + o : z);
      m.rotation[i ? 'x' : 'z'] = 0.35;
    }
    // coloured fins on the courtyard side
    for (let k = 0; k < 5; k++) {
      const c = M(accents[(k + p.seed) % 4], 0.2, 0.6);
      if (i === 0) box(g, 0.03, p.floors * FLOOR * 0.85, 0.03, c, x - w / 2 + 0.2 + k * (w - 0.4) / 4, y0 + 0.02, z + d / 2 + 0.015);
      else box(g, 0.03, p.floors * FLOOR * 0.85, 0.03, c, x + w / 2 + 0.015, y0 + 0.02, z - d / 2 + 0.2 + k * (d - 0.4) / 4);
    }
  });
  // entrance canopy with a glowing emblem
  box(g, 0.4, 0.025, 0.2, trimMat(p.style), -0.65, y0 + FLOOR * 0.9, -0.2);
  const ey = y0 + FLOOR * p.floors - 0.11;
  cyl(g, 0.085, 0.012, M('#2a2e34'), 0.62, ey, -0.31, { seg: 20 }).rotation.x = Math.PI / 2;
  ring(g, 0.07, 0.011, neonMat(neonOf(p), 0.5), 0.62, ey, -0.3, { tilt: -Math.PI / 2 });
  box(g, 0.012, 0.09, 0.012, neonMat(neonOf(p), 0.5), 0.62, ey - 0.045, -0.3);
  box(g, 0.08, 0.012, 0.012, neonMat(neonOf(p), 0.5), 0.62, ey + 0.01, -0.3);
  // play field: running loop, pitch, centre circle, goals
  const fx = 0.32, fz = 0.32;
  box(g, 1.18, 0.008, 1.0, M('#b85a3a', 0.05, 0.9), fx, y0, fz);
  box(g, 1.0, 0.012, 0.82, M('#4f9a52', 0.05, 0.9), fx, y0, fz);
  const line = M('#f0f2f0', 0, 0.8);
  box(g, 0.01, 0.004, 0.82, line, fx, y0 + 0.012, fz);
  for (const s of [-1, 1]) { box(g, 1.0, 0.004, 0.01, line, fx, y0 + 0.012, fz + s * 0.405); box(g, 0.01, 0.004, 0.82, line, fx + s * 0.495, y0 + 0.012, fz); }
  ring(g, 0.12, 0.005, line, fx, y0 + 0.014, fz);
  for (const s of [-1, 1]) { const gx = fx + s * 0.47; rod(g, [gx, y0, fz - 0.08], [gx, y0 + 0.07, fz - 0.08], 0.006, line, 4); rod(g, [gx, y0, fz + 0.08], [gx, y0 + 0.07, fz + 0.08], 0.006, line, 4); rod(g, [gx, y0 + 0.07, fz - 0.08], [gx, y0 + 0.07, fz + 0.08], 0.006, line, 4); }
  // trees + benches + lamps in the courtyard edge
  alienTree(g, -0.2, 0.0, y0, 0.9, p.R); alienTree(g, 0.85, -0.2, y0, 0.8, p.R);
  for (const z of [0.35, 0.7]) box(g, 0.05, 0.03, 0.14, M('#8a6a4a', 0.1, 0.8), -0.28, y0, z);
  lampPost(g, -0.3, 0.92, y0); lampPost(g, 0.92, 0.92, y0);
  return g;
}

function buildUniversity(p) {
  const g = new THREE.Group(); const y0 = lotPad(g, 3, 3, '#6a7078');
  const st = p.style, R = p.R;
  // quad: lawn, cross paths, a glowing obelisk
  box(g, 1.7, 0.01, 1.7, M('#4f8a52', 0.05, 0.9), 0.05, y0, 0.15);
  box(g, 1.7, 0.012, 0.16, M('#c8c2b4', 0.05, 0.9), 0.05, y0, 0.15); box(g, 0.16, 0.012, 1.7, M('#c8c2b4', 0.05, 0.9), 0.05, y0, 0.15);
  cyl(g, 0.12, 0.03, M('#c8c2b4'), 0.05, y0, 0.15, { seg: 16 });
  cyl(g, 0.035, 0.42, lamp('#cfd8e0', neonOf(p), 0.4), 0.05, y0 + 0.03, 0.15, { rt: 0.008, seg: 4 });
  for (const [x, z] of [[-0.45, -0.3], [0.55, -0.3], [-0.45, 0.65], [0.55, 0.65]]) alienTree(g, x, z, y0, 1.1, R);
  // main hall with portico, drum and glass dome
  const mh = storeys(g, { w: 2.0, d: 0.7, floors: p.floors + 1, x: 0, z: -1.05, y: y0, style: st, kind: 'grid', seed: p.seed, lit: 0.55 });
  slab(g, 2.06, 0.76, st, 0, mh, -1.05);
  for (let i = 0; i < 8; i++) cyl(g, 0.025, (p.floors + 1) * FLOOR * 0.8, M('#e6e2d8', 0.1, 0.6), -0.7 + i * 0.2, y0, -0.64, { seg: 8 });
  box(g, 1.6, 0.04, 0.12, M('#e6e2d8', 0.1, 0.6), 0, y0 + (p.floors + 1) * FLOOR * 0.8, -0.66);
  cyl(g, 0.3, 0.14, bodyMat(st, 1), 0, mh + 0.03, -1.05, { seg: 24 });
  dome(g, 0.3, glassMat(st), 0, mh + 0.17, -1.05, { squash: 0.85, seg: 24 });
  for (let i = 0; i < 6; i++) { const r = ring(g, 0.3, 0.008, M('#c9d2dc', 0.6, 0.4), 0, mh + 0.17, -1.05, { tilt: Math.PI / 2, spin: i * Math.PI / 6, arc: Math.PI }); r.scale.set(1, 1, 1); }
  cyl(g, 0.03, 0.16, lamp('#dfe5ec', WARM, 0.2), 0, mh + 0.17 + 0.25, -1.05, { seg: 8 });
  neonEdges(g, 2.0, 0.7, neonOf(p), 0, y0 + FLOOR, -1.05, 0.02, 0.3);
  // observatory tower in the back corner: round tower + dome with a glowing slit
  const ot = roundTower(g, { r: 0.24, floors: p.floors + 3, x: 1.2, z: -1.2, y: y0, style: st, kind: 'bands', seed: p.seed + 5, seg: 12 });
  dome(g, 0.25, M('#e9edf1', 0.5, 0.3), 1.2, ot, -1.2, { squash: 1, seg: 24 });
  box(g, 0.05, 0.22, 0.08, lamp('#1d2430', '#bfe8ff', 0.2), 1.2 + 0.0, ot + 0.04, -1.2 + 0.2).rotation.x = -0.6;
  ring(g, 0.25, 0.012, neonMat(CYAN, 0.3), 1.2, ot, -1.2);
  // wings around the quad (left, right, front-left, front-right); a gate gap in the middle front
  const wings = [[-1.13, 0.2, 0.52, 1.5], [1.17, 0.25, 0.5, 1.4], [-0.52, 1.18, 0.66, 0.5], [0.6, 1.18, 0.62, 0.5]].slice(0, p.wings);
  wings.forEach(([x, z, w, d], i) => {
    const f = Math.max(1, p.floors - (i % 2));
    const t = storeys(g, { w, d, floors: f, x, z, y: y0, style: st, kind: i < 2 ? 'grid' : 'curtain', seed: p.seed + 1 + i, lit: 0.5 });
    slab(g, w + 0.04, d + 0.04, st, x, t, z);
    roofProps(g, w * 0.7, d * 0.7, t + 0.04, st, R, { antenna: i === 1 });
    balconies(g, w, d, y0, f, st, 1, x, z);
  });
  // gate posts with lights
  for (const x of [-0.12, 0.22]) { box(g, 0.06, 0.24, 0.06, M('#d8d2c4'), x, y0, 1.38); box(g, 0.07, 0.02, 0.07, neonMat(WARM, 0.3), x, y0 + 0.24, 1.38); }
  return g;
}

function buildPark(p) {
  const g = new THREE.Group(); const y0 = lotPad(g, 2, 2, '#5d6870');
  const plaza = p.plaza === 1, R = p.R, pave = M('#c9c3b6', 0.05, 0.9), pave2 = M('#a8a296', 0.05, 0.9);
  // lawn quarters (fewer in plaza mode) and paths
  const grass = M('#4f8a52', 0.05, 0.95);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    if (plaza && sx === sz) { // paved quarters with a tile pattern
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) box(g, 0.18, 0.012, 0.18, (i + j) % 2 ? pave : pave2, sx * 0.5 + (i - 1.5) * 0.19, y0, sz * 0.5 + (j - 1.5) * 0.19);
    } else box(g, 0.78, 0.02, 0.78, grass, sx * 0.5, y0, sz * 0.5);
  }
  box(g, 1.94, 0.014, 0.18, pave, 0, y0, 0); box(g, 0.18, 0.014, 1.94, pave, 0, y0, 0);
  ring(g, 0.48, 0.07, pave, 0, y0 + 0.006, 0, { seg: 40 }).scale.z = 0.15;
  // hedges along the outer edges with gaps at the paths
  const hedge = leafMat('#3a7a50');
  for (const s of [-1, 1]) for (const h of [-1, 1]) {
    box(g, 0.66, 0.06, 0.06, hedge, h * 0.55, y0, s * 0.93); box(g, 0.06, 0.06, 0.66, hedge, s * 0.93, y0, h * 0.55);
  }
  if (!plaza) {
    // fountain: basin, water, glowing rim lights, a column with rising jets
    cyl(g, 0.3, 0.07, M('#d4cec2', 0.1, 0.8), 0, y0, 0, { seg: 28 });
    cyl(g, 0.26, 0.012, waterMat(), 0, y0 + 0.055, 0, { seg: 28 });
    for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5; box(g, 0.02, 0.012, 0.02, neonMat('#5fd8ff', 0.3), Math.cos(a) * 0.28, y0 + 0.07, Math.sin(a) * 0.28); }
    cyl(g, 0.04, 0.14, M('#d4cec2', 0.1, 0.8), 0, y0 + 0.06, 0, { seg: 12 });
    cyl(g, 0.1, 0.02, M('#d4cec2', 0.1, 0.8), 0, y0 + 0.2, 0, { seg: 16 });
    const jet = lamp('#cfeefa', '#5fd8ff', 0.25);
    cyl(g, 0.012, 0.18, jet, 0, y0 + 0.22, 0, { seg: 6 });
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; rod(g, [Math.cos(a) * 0.05, y0 + 0.24, Math.sin(a) * 0.05], [Math.cos(a) * 0.18, y0 + 0.08, Math.sin(a) * 0.18], 0.006, jet, 4); }
    ball(g, 0.025, jet, 0, y0 + 0.41, 0, 8);
  } else {
    // plaza: a holo sculpture of turning cubes on a plinth, ringed by benches
    cyl(g, 0.22, 0.06, M('#4a525e', 0.5, 0.4), 0, y0, 0, { seg: 8 });
    ring(g, 0.22, 0.01, neonMat(neonOf(p), 0.4), 0, y0 + 0.06, 0, { seg: 8 });
    for (let i = 0; i < 5; i++) {
      const s = 0.14 - i * 0.018, c = i % 2 ? neonOf(p) : neonOf(p, 1);
      const m = box(g, s, s, s, lamp('#c9d2dc', c, 0.4), 0, y0 + 0.08 + i * 0.13, 0); m.rotation.y = i * 0.35; m.rotation.x = 0.2;
    }
  }
  // glowing alien trees in the lawn quarters
  const spots = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { if (plaza && sx === sz) continue; for (const [a, b] of [[0.3, 0.3], [0.7, 0.35], [0.35, 0.72], [0.72, 0.72]]) spots.push([sx * a, sz * b]); }
  for (let i = spots.length - 1; i > 0; i--) { const j = R.int(0, i); [spots[i], spots[j]] = [spots[j], spots[i]]; }
  for (const [x, z] of spots.slice(0, p.trees)) alienTree(g, x + R.range(-0.05, 0.05), z + R.range(-0.05, 0.05), y0 + 0.02, R.range(0.9, 1.3), R);
  // benches + lamps along the paths
  const bench = M('#7a5a40', 0.1, 0.8);
  for (const [x, z, ry] of [[0.6, 0.13, 0], [-0.6, -0.13, 0], [0.13, -0.6, Math.PI / 2], [-0.13, 0.6, Math.PI / 2]]) tbox(g, 0.14, 0.03, 0.045, bench, x, y0 + 0.014, z, ry);
  for (const [x, z] of [[0.35, 0.12], [-0.35, -0.12], [0.12, -0.35], [-0.12, 0.35], [0.85, 0.12], [-0.85, -0.12], [0.12, 0.85], [-0.12, -0.85]]) lampPost(g, x, z, y0, 0.2);
  return g;
}

function buildArena(p) {
  const g = new THREE.Group(); const y0 = lotPad(g, 3, 3, '#646a72');
  const bowl = new THREE.Group(); bowl.position.y = y0; bowl.scale.z = 0.86; g.add(bowl);
  const r0 = 0.55, rise = 0.045, tread = 0.06, steps = p.tiers * 3;
  // field with markings
  cyl(bowl, r0 + 0.01, 0.02, M('#4f9a52', 0.05, 0.9), 0, 0, 0, { seg: 40 });
  const line = M('#f0f2f0', 0, 0.8);
  ring(bowl, 0.12, 0.005, line, 0, 0.022, 0); box(bowl, 0.008, 0.004, 0.9, line, 0, 0.02, 0);
  ring(bowl, r0 - 0.04, 0.006, line, 0, 0.022, 0);
  // stepped seating (lathe), coloured in tier bands
  const seatCols = ['#3c5fa8', '#c9d2dc', '#a8432f', '#2f7f8a'];
  for (let tIdx = 0; tIdx < p.tiers; tIdx++) {
    const pts = [];
    for (let s = tIdx * 3; s < (tIdx + 1) * 3; s++) { const r = r0 + s * tread, y = 0.02 + s * rise; pts.push([r, y], [r, y + rise], [r + tread, y + rise]); }
    lathe(bowl, pts, M2(seatCols[(tIdx + p.seed) % 4], 0.1, 0.8), 0, 0, 0, 48);
  }
  const rOut = r0 + steps * tread, hTop = 0.02 + steps * rise;
  // outer wall with windows + a concourse ring
  const wallH = hTop + 0.06;
  const cols = 48, floors = Math.max(1, Math.round(wallH / FLOOR));
  addMesh(bowl, G(`arenawall${f3(rOut)}:${f3(wallH)}`, () => new THREE.CylinderGeometry(rOut + 0.04, rOut + 0.08, wallH, 48, 1, true)),
    facadeMat(p.style, 'louvre', p.seed, cols, floors, 0.5), 0, wallH / 2, 0);
  ring(bowl, rOut + 0.06, 0.03, trimMat(p.style), 0, wallH, 0, { seg: 64 });
  ring(bowl, rOut + 0.065, 0.012, neonMat(neonOf(p), 0.5), 0, wallH * 0.45, 0, { seg: 64 });
  // ring roof canopy over the upper seats (open in the middle)
  if (p.roof === 1) {
    const rIn = r0 + steps * tread * 0.45;
    lathe(bowl, [[rOut + 0.08, wallH], [rIn, wallH + 0.12], [rIn - 0.02, wallH + 0.1]], M2('#e6eaee', 0.4, 0.4), 0, 0, 0, 64);
    ring(bowl, rIn, 0.018, neonMat(neonOf(p, 1), 0.5), 0, wallH + 0.115, 0, { seg: 64 });
  }
  // big screens on opposite sides
  for (const s of [-1, 1]) { box(bowl, 0.4, 0.2, 0.03, M(DARK), 0, wallH + (p.roof ? 0.13 : 0.02), s * (rOut - 0.1)); box(bowl, 0.36, 0.16, 0.032, lamp('#1d2430', neonOf(p, 2), 0.6), 0, wallH + (p.roof ? 0.15 : 0.04), s * (rOut - 0.1)); }
  // corner plazas: floodlight masts, ticket kiosks, lamps
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    floodMast(g, sx * 1.3, sz * 1.3, y0, wallH + 0.55, '#f4f8ff');
    box(g, 0.12, 0.1, 0.08, bodyMat(p.style, 1), sx * 1.1, y0, sz * 1.32);
    box(g, 0.13, 0.015, 0.09, neonMat(neonOf(p), 0.5), sx * 1.1, y0 + 0.1, sz * 1.32);
    lampPost(g, sx * 1.35, sz * 1.0, y0);
  }
  return g;
}

// ---------------------------------------------------------------------------------------------------------------
// Colony
// ---------------------------------------------------------------------------------------------------------------
function turretMount(parent, x, z, y, s = 1, glow = CYAN) {
  cyl(parent, 0.2 * s, 0.08 * s, M('#59616c', 0.5, 0.5), x, y, z, { rt: 0.17 * s, seg: 8 });
  cyl(parent, 0.13 * s, 0.07 * s, M(DARK, 0.6, 0.4), x, y + 0.08 * s, z, { seg: 12 });
  box(parent, 0.18 * s, 0.09 * s, 0.14 * s, M('#6f7884', 0.6, 0.4), x, y + 0.15 * s, z);
  for (const dz of [-0.035, 0.035]) hcyl(parent, 0.016 * s, 0.22 * s, M('#2a2e34', 0.7, 0.4), x + 0.16 * s, y + 0.2 * s, z + dz * s, 0, 8);
  box(parent, 0.02 * s, 0.025 * s, 0.1 * s, lamp('#2a4a5a', glow, 0.5), x + 0.091 * s, y + 0.19 * s, z);
  hazardBar(parent, 0.3 * s, x, y + 0.002, z + 0.2 * s, { h: 0.01, d: 0.03 });
}

function buildCore(p) {
  const g = new THREE.Group(); const y0 = lotPad(g, 3, 3, '#4f555c');
  const st = p.style, R = p.R, hullM = bodyMat(st, 0), hull2 = bodyMat(st, 1), dk = M(DARK, 0.6, 0.4);
  // scorched landing ring + guide lights
  groundDisc(g, 1.35, '#3a3d42', y0, 24);
  for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8; box(g, 0.035, 0.012, 0.035, neonMat(i % 2 ? CYAN : '#ffb02e', 0.5), Math.cos(a) * 1.28, y0 + 0.012, Math.sin(a) * 1.28); }
  // landing legs (four struts to big footpads)
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2, c = Math.cos(a), s = Math.sin(a);
    box(g, 0.2, 0.04, 0.2, dk, c * 1.02, y0, s * 1.02).rotation.y = -a;
    rod(g, [c * 0.62, y0 + 0.42, s * 0.62], [c * 1.02, y0 + 0.04, s * 1.02], 0.045, M('#7d858e', 0.7, 0.35));
    rod(g, [c * 0.55, y0 + 0.25, s * 0.55], [c * 0.92, y0 + 0.06, s * 0.92], 0.025, M(HAZARD, 0.4, 0.5));
  }
  // engine bells under the hull, faintly lit
  for (let i = 0; i < 3; i++) { const a = i * 2.094 + 0.5; cyl(g, 0.17, 0.2, dk, Math.cos(a) * 0.35, y0 + 0.1, Math.sin(a) * 0.35, { rt: 0.1, seg: 14 }); cyl(g, 0.15, 0.005, lamp('#3a2a2a', '#ff9a5a', 0), Math.cos(a) * 0.35, y0 + 0.105, Math.sin(a) * 0.35, { seg: 14 }); }
  // hull: flared lower body, window band, upper deck
  const hy = y0 + 0.3;
  cyl(g, 0.78, 0.36, hullM, 0, hy, 0, { rt: 0.95, seg: 8 });
  cyl(g, 0.952, 0.05, lamp('#2a3a4a', WARM), 0, hy + 0.34, 0, { seg: 8 });
  cyl(g, 0.97, 0.03, trimMat(st), 0, hy + 0.39, 0, { seg: 8 });
  cyl(g, 0.92, 0.22, hull2, 0, hy + 0.42, 0, { rt: 0.72, seg: 8 });
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + Math.PI / 8; box(g, 0.04, 0.2, 0.012, M(HAZARD, 0.3, 0.5), Math.cos(a) * 0.86, hy + 0.05, Math.sin(a) * 0.86).rotation.y = -a + Math.PI / 2; }
  // twin engine nacelles on the back quarter, exhausts glowing faintly; a dorsal spine with radiator fins
  for (const s of [-1, 1]) {
    const a = -Math.PI * 3 / 4 + s * 0.55, nx = Math.cos(a) * 0.78, nz = Math.sin(a) * 0.78, ny = hy + 0.42;
    const nac = hcyl(g, 0.15, 0.5, hull2, nx, ny, nz, -a, 16);
    hcyl(g, 0.155, 0.06, trimMat(st), nx, ny, nz, -a, 16);
    const ex = nx + Math.cos(a) * 0.25, ez = nz + Math.sin(a) * 0.25;
    hcyl(g, 0.12, 0.06, dk, ex, ny, ez, -a, 16);
    hcyl(g, 0.1, 0.065, lamp('#2a2f3a', '#7fd8ff', 0.15), ex, ny, ez, -a, 16);
    rod(g, [nx * 0.6, ny - 0.05, nz * 0.6], [nx, ny - 0.08, nz], 0.04, dk, 6);
  }
  for (let k = 0; k < 5; k++) { const t = -0.3 + k * 0.13; const m = box(g, 0.012, 0.08, 0.2, M('#9aa3ad', 0.6, 0.4), -0.42 + t * 0.2, hy + 0.64, -0.42 - t * 0.2 + 0.1); m.rotation.y = Math.PI / 4; }
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + 0.3; box(g, 0.1, 0.03, 0.06, M('#59616c', 0.5, 0.5), Math.cos(a) * 0.62, hy + 0.64, Math.sin(a) * 0.62).rotation.y = -a; }
  // boarding ramp to the front
  belt(g, [0.0, y0 + 0.01, 1.25], [0.0, hy + 0.08, 0.72], 0.26, 0.03, M('#6f7884', 0.6, 0.4));
  for (const dx of [-0.13, 0.13]) belt(g, [dx, y0 + 0.03, 1.25], [dx, hy + 0.1, 0.72], 0.012, 0.012, neonMat(CYAN, 0.5));
  box(g, 0.22, 0.14, 0.02, lamp('#3d5a74', '#bfe8ff', 0.3), 0, hy + 0.06, 0.74);
  // command tower (the city hall)
  const tb = hy + 0.64;
  const tt = roundTower(g, { r: 0.36, rt: 0.3, floors: 3 + p.level, x: -0.05, z: -0.1, y: tb, style: st, kind: 'curtain', seed: p.seed, seg: 8 });
  cyl(g, 0.4, 0.06, lamp('#2b4766', '#bfe8ff', 0.1), -0.05, tt, -0.1, { rt: 0.36, seg: 8 });
  cyl(g, 0.38, 0.04, trimMat(st), -0.05, tt + 0.06, -0.1, { seg: 8 });
  cyl(g, 0.02, 0.5, M(STEEL, 0.6, 0.4), 0.05, tt + 0.1, -0.15, { seg: 6 }); beacon(g, 0.05, tt + 0.6, -0.15);
  dish(g, 0.13, -0.2, tt + 0.1, -0.05, { tilt: 0.8, face: 0.6 });
  if (p.level >= 3) { ring(g, 0.45, 0.015, neonMat(neonOf(p), 0.5), -0.05, tt + 0.3, -0.1, { seg: 48 }); ring(g, 0.3, 0.012, neonMat(neonOf(p), 0.5), -0.05, tt + 0.4, -0.1, { seg: 48 }); }
  // modules on the lot corners: power (front-left), storage (front-right), turret (back-right), more with level
  const pw = [-1.05, 1.0];
  cyl(g, 0.24, 0.1, dk, pw[0], y0, pw[1], { seg: 16 });
  dome(g, 0.22, M('#e6eaee', 0.4, 0.35), pw[0], y0 + 0.1, pw[1], { squash: 0.9, seg: 20 });
  ring(g, 0.225, 0.018, neonMat(CYAN, 0.55), pw[0], y0 + 0.11, pw[1]);
  ring(g, 0.3, 0.015, neonMat(CYAN, 0.5), pw[0], y0 + 0.2, pw[1], { tilt: 0.5, arc: Math.PI * 1.2 });
  const sx = 1.05, sz = 1.0;
  for (let i = 0; i < 2; i++) hcyl(g, 0.09, 0.42, M('#c9d2dc', 0.5, 0.4), sx - 0.1, y0 + 0.1, sz - 0.2 + i * 0.2, Math.PI / 2, 14);
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) container(g, sx + 0.25 - j * 0.0, y0 + i * 0.105, sz - 0.2 + j * 0.22, Math.PI / 2, CONTAINER[(i + j + p.seed) % CONTAINER.length]);
  turretMount(g, 1.05, -1.05, y0, 1.1);
  rod(g, [0.62, y0 + 0.36, 0.62], [sx - 0.2, y0 + 0.2, sz - 0.35], 0.02, M(DARK), 6);
  rod(g, [-0.62, y0 + 0.36, 0.62], [pw[0] + 0.15, y0 + 0.15, pw[1] - 0.15], 0.02, neonMat(CYAN, 0.25), 6);
  if (p.level >= 2) {
    // solar wings and a habitat module with a walkway tube
    for (const s of [-1, 1]) { const m = box(g, 0.5, 0.012, 0.22, M('#22355a', 0.7, 0.25), s * 0.0 - 0.75, y0 + 0.62, s * 0.0 - 0.75); m.rotation.y = Math.PI / 4; m.rotation.x = 0.3 * s; }
    rod(g, [-0.6, y0 + 0.5, -0.6], [-0.95, y0 + 0.62, -0.95], 0.02, M(STEEL), 6);
    const ht = storeys(g, { w: 0.4, d: 0.4, floors: 2, x: 1.1, z: 0.05, y: y0, style: st, kind: 'bands', seed: p.seed + 4 });
    dome(g, 0.2, bodyMat(st, 2), 1.1, ht, 0.05, { squash: 0.5 });
    rod(g, [0.85, y0 + 0.4, 0.05], [0.9, y0 + 0.3, 0.05], 0.05, glassMat(st));
  }
  if (p.level >= 3) {
    turretMount(g, -1.05, -1.05, y0, 1.1);
    cyl(g, 0.02, 1.0, M(STEEL, 0.6, 0.4), -1.15, y0, 0.0, { seg: 6 }); beacon(g, -1.15, y0 + 1.0, 0.0);
    dish(g, 0.16, -1.15, y0 + 0.65, 0.0, { tilt: 0.6, face: 1.2 });
  }
  return g;
}

function buildPad(p) {
  const g = new THREE.Group(); const y0 = lotPad(g, 2, 2, '#4d5258');
  const pads = p.pads === 2 ? [[-0.47, -0.47, 0.46], [0.47, 0.47, 0.46]] : [[0, 0, 0.88]];
  const R = p.R;
  pads.forEach(([x, z, r], i) => {
    cyl(g, r, 0.06, M('#3e434a', 0.3, 0.7), x, y0, z, { seg: 8 });
    cyl(g, r * 0.97, 0.004, M('#4a5058', 0.3, 0.8), x, y0 + 0.06, z, { seg: 8 });
    ring(g, r * 0.72, r * 0.03, M(HAZARD, 0.2, 0.6), x, y0 + 0.064, z, { seg: 40 });
    ring(g, r * 0.4, r * 0.018, M('#e9edf1', 0.1, 0.7), x, y0 + 0.064, z, { seg: 32 });
    // landing cross + target light
    box(g, r * 0.7, 0.004, r * 0.08, M('#e9edf1', 0.1, 0.7), x, y0 + 0.064, z); box(g, r * 0.08, 0.004, r * 0.7, M('#e9edf1', 0.1, 0.7), x, y0 + 0.064, z);
    cyl(g, r * 0.1, 0.006, lamp('#2a3a2a', GREEN, 0.4), x, y0 + 0.064, z, { seg: 16 });
    // chevrons pointing in, on the rim
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; for (const off of [-0.03, 0.03]) { const m = box(g, r * 0.12, 0.004, r * 0.03, M(HAZARD, 0.2, 0.6), x + Math.cos(a) * r * 0.86, y0 + 0.064, z + Math.sin(a) * r * 0.86); m.rotation.y = -a + off * 12; } }
    // beacons on every corner of the octagon, green and red
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 + Math.PI / 8; const rr = r * 0.95; box(g, 0.03, 0.04, 0.03, neonMat(k % 2 ? GREEN : RED, 0.7), x + Math.cos(a) * rr, y0 + 0.06, z + Math.sin(a) * rr); }
  });
  // kiosk + fuel + lights on the free corners
  const [kx, kz] = p.pads === 2 ? [0.62, -0.62] : [0.82, -0.82];
  const kt = storeys(g, { w: 0.24, d: 0.24, floors: 1, x: kx, z: kz, y: y0, style: p.style, kind: 'curtain', seed: p.seed });
  dome(g, 0.12, glassMat(p.style), kx, kt, kz, { squash: 0.6 });
  beacon(g, kx, kt + 0.07, kz, '#ffb02e', 0.025);
  const [fx, fz] = p.pads === 2 ? [-0.62, 0.62] : [-0.74, 0.74];
  for (const d of [-0.07, 0.07]) hcyl(g, 0.055, 0.24, M('#d8dde3', 0.5, 0.4), fx + d, y0 + 0.06, fz, Math.PI / 4, 12);
  floodMast(g, p.pads === 2 ? 0.82 : 0.84, p.pads === 2 ? 0.0 : 0.84, y0, 0.5);
  floodMast(g, p.pads === 2 ? -0.82 : -0.84, p.pads === 2 ? 0.0 : -0.84, y0, 0.5);
  // a drop pod resting on the (first) pad
  if (p.pod === 1) {
    const [x, z, r] = pads[0], s = Math.min(1, r / 0.6), py = y0 + 0.064;
    groundDisc(g, r * 0.45, '#2a2c30', py - 0.008, 16, x, z, 0.01);
    for (let k = 0; k < 3; k++) { const a = k * 2.094; rod(g, [x + Math.cos(a) * 0.08 * s, py + 0.12 * s, z + Math.sin(a) * 0.08 * s], [x + Math.cos(a) * 0.2 * s, py, z + Math.sin(a) * 0.2 * s], 0.012 * s, M('#7d858e', 0.6, 0.4), 5); }
    cyl(g, 0.12 * s, 0.06 * s, M(DARK, 0.6, 0.4), x, py + 0.05 * s, z, { rt: 0.15 * s, seg: 12 });
    cyl(g, 0.11 * s, 0.006, lamp('#3a2a2a', '#ff9a5a', 0.2), x, py + 0.045 * s, z, { seg: 12 });
    cyl(g, 0.15 * s, 0.26 * s, M('#e6eaee', 0.4, 0.4), x, py + 0.11 * s, z, { rt: 0.11 * s, seg: 12 });
    cyl(g, 0.11 * s, 0.12 * s, M('#c0392b', 0.3, 0.5), x, py + 0.37 * s, z, { rt: 0.02 * s, seg: 12 });
    box(g, 0.1 * s, 0.12 * s, 0.01, lamp('#2b4766', WARM, 0.3), x, py + 0.18 * s, z + 0.135 * s);
    beacon(g, x, py + 0.49 * s, z, RED, 0.02);
  }
  return g;
}

function buildComms(p) {
  const g = new THREE.Group(); const y0 = lotPad(g, 2, 2, '#555c64');
  const T = p.tier, st = p.style;
  // equipment shed with cable trays
  const t = storeys(g, { w: 0.5, d: 0.36, floors: 1, x: -0.62, z: 0.68, y: y0, style: st, kind: 'grid', seed: p.seed });
  slab(g, 0.54, 0.4, st, -0.62, t, 0.68); roofProps(g, 0.4, 0.3, t + 0.04, st, p.R, { antenna: false });
  box(g, 0.16, 0.015, 0.015, neonMat(neonOf(p), 0.5), -0.62, y0 + 0.18, 0.68 + 0.185);
  // lattice mast
  const mx = 0.6, mz = -0.6, mh = 0.9 + T * 0.45, m = M('#c9d2dc', 0.6, 0.4), w = 0.06 + T * 0.015;
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) rod(g, [mx + a * w, y0, mz + b * w], [mx + a * 0.015, y0 + mh, mz + b * 0.015], 0.008, m, 4);
  for (let k = 1; k < 2 + T * 2; k++) { const f = k / (2 + T * 2), s = w * 2 * (1 - f * 0.75); box(g, s, 0.008, s, m, mx, y0 + mh * f, mz); }
  for (let k = 0; k < T; k++) { const y = y0 + mh * (0.45 + k * 0.18); box(g, 0.035, 0.12, 0.02, M('#e9edf1', 0.3, 0.5), mx + w * 0.6, y, mz); box(g, 0.02, 0.12, 0.035, M('#e9edf1', 0.3, 0.5), mx, y, mz + w * 0.6); }
  beacon(g, mx, y0 + mh, mz); beacon(g, mx + w * 0.5, y0 + mh * 0.5, mz + w * 0.5, RED, 0.02);
  if (T >= 3) for (const f of [0.3, 0.6]) ring(g, w * 2 * (1 - f * 0.75) * 0.75, 0.008, neonMat(CYAN, 0.4), mx, y0 + mh * f, mz, { seg: 4 });
  // main dish on a pedestal (alt-az yoke at tier 3)
  const dr = [0.32, 0.5, 0.66][T - 1], dx = [-0.25, -0.22, -0.12][T - 1], dz = [-0.2, -0.22, -0.12][T - 1];
  const ph = 0.18 + T * 0.1;
  cyl(g, 0.12 + T * 0.03, 0.05, M('#8e9496', 0.1, 0.9), dx, y0, dz, { seg: 16 });
  cyl(g, 0.07 + T * 0.015, ph, M('#d8dde3', 0.4, 0.5), dx, y0 + 0.05, dz, { rt: 0.05 + T * 0.01, seg: 12 });
  if (T >= 3) for (const s of [-1, 1]) box(g, 0.04, 0.2, 0.08, M('#d8dde3', 0.4, 0.5), dx + s * 0.12, y0 + 0.05 + ph - 0.05, dz).rotation.y = Math.PI / 4;
  dish(g, dr, dx, y0 + 0.05 + ph, dz, { tilt: 0.75, face: Math.PI / 4 + p.R.range(-0.4, 0.4) });
  // small dishes
  const small = T === 1 ? [] : T === 2 ? [[0.62, 0.35], [0.25, 0.75]] : [[0.7, 0.15], [0.7, 0.5], [0.7, 0.82], [0.3, 0.82]];
  for (const [x, z] of small) { cyl(g, 0.03, 0.14, M('#d8dde3', 0.4, 0.5), x, y0, z, { seg: 8 }); dish(g, 0.13, x, y0 + 0.14, z, { tilt: 0.9, face: p.R.range(0, 6.28) }); }
  if (T === 1) dish(g, 0.12, mx, y0 + mh * 0.7, mz + 0.03, { tilt: 1.3, face: Math.PI / 2 });
  // cable trays from shed to dishes
  rod(g, [-0.4, y0 + 0.03, 0.55], [dx, y0 + 0.03, dz + 0.15], 0.012, M('#2a2e34'), 4);
  rod(g, [-0.4, y0 + 0.03, 0.55], [mx - 0.1, y0 + 0.03, mz + 0.1], 0.012, M('#2a2e34'), 4);
  lampPost(g, 0.15, 0.9, y0, 0.22, CYAN); lampPost(g, -0.9, -0.1, y0, 0.22, CYAN);
  box(g, 0.16, 0.1, 0.12, M('#59616c', 0.4, 0.5), -0.15, y0, 0.75); for (const dx of [-0.04, 0.04]) box(g, 0.02, 0.02, 0.012, neonMat(GREEN, 0.5), -0.15 + dx, y0 + 0.07, 0.812);
  return g;
}

// ---------------------------------------------------------------------------------------------------------------
// Landmarks
// ---------------------------------------------------------------------------------------------------------------
function buildArcology(p) {
  const g = new THREE.Group(); const y0 = lotPad(g, 3, 3, '#5f666e');
  const st = p.style, R = p.R;
  // podium with a garden roof
  let y = storeys(g, { w: 2.7, d: 2.7, floors: 3, y: y0, style: st, kind: 'curtain', seed: p.seed, lit: 0.7 });
  y = slab(g, 2.78, 2.78, st, 0, y);
  box(g, 2.6, 0.03, 2.6, leafMat('#3f8a5a'), 0, y, 0);
  neonEdges(g, 2.7, 2.7, neonOf(p), 0, y0 + FLOOR, 0, 0.025);
  for (const [x, z] of [[-1.1, -1.1], [1.1, -1.1], [1.1, 1.1], [-1.1, 1.1], [0, 1.15], [1.15, 0], [-1.15, 0], [0, -1.15]]) alienTree(g, x, z, y + 0.03, 1.4, R);
  // stacked tiers: octagonal glass drums, each standing on a garden terrace with a lit rim
  const total = p.floors - 3, tiers = p.tiers;
  let left = total, r = 1.22;
  const step = Math.pow(0.4 / 1.22, 1 / tiers);   // each tier steps in so the top drum is ~0.4 across
  for (let i = 0; i < tiers && left > 0; i++) {
    const f = i === tiers - 1 ? left : Math.max(4, Math.round(total / tiers * (1.25 - i * 0.15)));
    left -= f;
    const ry = i * Math.PI / 8, y1 = y + 0.03;   // each drum turns half a facet: the stack twists as it climbs
    const top = roundTower(g, { r, rt: r * 0.96, floors: f, y: y1, style: st, kind: i % 2 ? 'bands' : 'curtain', seed: p.seed + i, seg: 8, lit: 0.6, ry });
    // vertical fins on the corners, a lit sky-lobby band halfway up
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 + ry; const fm = box(g, 0.04, top - y1, 0.04, trimMat(st), Math.cos(a) * r * 0.985, y1, -Math.sin(a) * r * 0.985); fm.rotation.y = a; }
    if (f >= 10) { const ly = y1 + Math.round(f / 2) * FLOOR; cyl(g, r * 1.005, 0.06, lamp('#3a4a5a', WARM, 0.1), 0, ly, 0, { seg: 8 }).rotation.y = ry; }
    y = top;
    // terrace: a planted ledge with trees and a glowing edge (hanging greenery over the lip)
    const nr = r * step;
    cyl(g, r * 1.04, 0.05, trimMat(st), 0, y, 0, { seg: 8 }).rotation.y = ry;
    cyl(g, r * 0.99, 0.035, leafMat('#3f8a5a'), 0, y + 0.05, 0, { seg: 8 }).rotation.y = ry;
    cyl(g, r * 1.045, 0.08, leafMat('#2f7a4a'), 0, y - 0.08, 0, { seg: 8, rt: r * 1.045 }).rotation.y = ry;
    ring(g, r * 1.04, 0.016, neonMat(neonOf(p, i), 0.4), 0, y + 0.05, 0, { seg: 8 }).rotation.y = ry;
    const nt = Math.round(r * 8);
    for (let k = 0; k < nt; k++) { const a = (k + 0.5) * Math.PI * 2 / nt; alienTree(g, Math.cos(a) * (r * 0.97 + nr) / 2, Math.sin(a) * (r * 0.97 + nr) / 2, y + 0.085, 0.9 + r * 0.6, R); }
    y += 0.05; r = nr;
  }
  // crown: tapered glass cap, a halo ring, a spire with a beacon
  cyl(g, r * 0.9, 0.5, glassMat(st), 0, y, 0, { rt: r * 0.3, seg: 8 });
  ring(g, r * 1.05, 0.03, neonMat(neonOf(p), 0.6), 0, y + 0.55, 0, { seg: 48 });
  ring(g, r * 0.75, 0.02, neonMat(neonOf(p, 1), 0.6), 0, y + 0.75, 0, { seg: 48 });
  cyl(g, 0.05, 1.4, trimMat(st), 0, y + 0.5, 0, { rt: 0.01, seg: 8 });
  beacon(g, 0, y + 1.9, 0, RED, 0.05);
  // exoskeleton: four columns sweeping up from the podium corners to the second terrace
  const ex = M('#d8dde3', 0.6, 0.35), yTo = y0 + 3 * FLOOR + (total / tiers) * FLOOR * 1.6;
  const c = Math.max(0.9, 1.22 * step + 0.06);   // column tops sit just outside the second drum
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    rod(g, [sx * 1.3, y0, sz * 1.3], [sx * c, yTo, sz * c], 0.075, ex, 8);
    rod(g, [sx * 1.3, y0 + 0.6, sz * 1.3], [sx * c, yTo - 0.5, sz * c], 0.02, neonMat(neonOf(p), 0.3), 4);
    for (const t of [0.35, 0.7]) { const k = 1.3 + (c - 1.3) * t, py = y0 + (yTo - y0) * t; rod(g, [sx * k, py, sz * k], [sx * 0.75, py, sz * 0.75], 0.025, ex, 6); }
  }
  ring(g, c * Math.SQRT2, 0.04, ex, 0, yTo, 0, { seg: 4 }).rotation.y = Math.PI / 4;
  ring(g, c * Math.SQRT2 + 0.02, 0.015, neonMat(neonOf(p), 0.4), 0, yTo + 0.05, 0, { seg: 4 }).rotation.y = Math.PI / 4;
  return g;
}

function shuttle(parent, x, z, y, s = 1) {
  const white = M('#eef1f4', 0.3, 0.45), dark = M('#2a2e34', 0.5, 0.5), red = M('#b8322b', 0.3, 0.5);
  cyl(parent, 0.2 * s, 1.5 * s, white, x, y + 0.15 * s, z, { seg: 20 });
  cyl(parent, 0.205 * s, 0.1 * s, dark, x, y + 0.75 * s, z, { seg: 20 });
  cyl(parent, 0.2 * s, 0.5 * s, white, x, y + 1.65 * s, z, { rt: 0.02 * s, seg: 20 });
  cyl(parent, 0.21 * s, 0.03 * s, red, x, y + 1.4 * s, z, { seg: 20 });
  box(parent, 0.012, 0.18 * s, 0.1 * s, lamp('#2b4766', WARM, 0.2), x + 0.0, y + 1.45 * s, z + 0.17 * s).rotation.y = 0;
  for (const a of [Math.PI / 4, Math.PI * 3 / 4, Math.PI * 5 / 4, Math.PI * 7 / 4]) {
    const bx = x + Math.cos(a) * 0.27 * s, bz = z + Math.sin(a) * 0.27 * s;
    if (Math.abs(a - Math.PI * 5 / 4) < 0.1) continue;   // tower side
    cyl(parent, 0.08 * s, 0.9 * s, white, bx, y + 0.15 * s, bz, { seg: 14 });
    cyl(parent, 0.08 * s, 0.18 * s, red, bx, y + 1.05 * s, bz, { rt: 0.01 * s, seg: 14 });
    cyl(parent, 0.07 * s, 0.1 * s, dark, bx, y + 0.06 * s, bz, { rt: 0.05 * s, seg: 10 });
  }
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; const f = box(parent, 0.012, 0.3 * s, 0.16 * s, dark, x + Math.cos(a) * 0.24 * s, y + 0.15 * s, z + Math.sin(a) * 0.24 * s); f.rotation.y = -a + Math.PI / 2; }
  cyl(parent, 0.14 * s, 0.15 * s, dark, x, y, z, { rt: 0.1 * s, seg: 14 });
  cyl(parent, 0.13 * s, 0.006, lamp('#2a3a4a', '#7fd8ff', 0.3), x, y, z, { seg: 14 });
}

function buildSpaceport(p) {
  const g = new THREE.Group(); const y0 = lotPad(g, 4, 4, '#5a6068');
  const st = p.style, R = p.R;
  // apron markings + blue edge lights
  for (const z of [0.35, 1.6]) box(g, 3.8, 0.004, 0.025, M(HAZARD, 0.2, 0.6), 0, y0, z);
  for (let i = 0; i < 14; i++) box(g, 0.025, 0.02, 0.025, neonMat('#4fa0ff', 0.4), -1.85 + i * 0.285, y0, 0.33);
  // launch pad: octagonal platform, flame trench, ring markers
  const lx = -0.95, lz = -0.95;
  cyl(g, 0.9, 0.12, M('#8e9496', 0.1, 0.9), lx, y0, lz, { seg: 8 });
  box(g, 0.32, 0.005, 1.0, M('#26282c', 0.1, 0.95), lx, y0 + 0.12, lz + 0.35);
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + Math.PI / 8; box(g, 0.04, 0.03, 0.04, neonMat(i % 2 ? '#ffb02e' : RED, 0.6), lx + Math.cos(a) * 0.82, y0 + 0.12, lz + Math.sin(a) * 0.82); }
  ring(g, 0.6, 0.012, M(HAZARD, 0.2, 0.6), lx, y0 + 0.122, lz, { seg: 40 });
  for (const a of [0.4, 1.9, 3.3]) { const x = lx + Math.cos(a) * 0.72, z = lz + Math.sin(a) * 0.72; box(g, 0.06, 0.05, 0.04, M(DARK), x, y0 + 0.12, z); box(g, 0.05, 0.035, 0.012, neonMat('#f4f8ff', 0.3), x, y0 + 0.15, z + 0.02).rotation.x = -0.6; }
  ring(g, 0.3, 0.02, lamp('#4a5058', '#9fd8ff', 0), lx, y0 + 0.125, lz, { seg: 32 });
  // launch tower: lattice with frames, service arms, beacons
  const tx = lx - 0.5, tz = lz - 0.5, th = 3.1, tw = 0.14, tm = M('#c0392b', 0.4, 0.55);
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) rod(g, [tx + a * tw, y0 + 0.12, tz + b * tw], [tx + a * tw, y0 + th, tz + b * tw], 0.016, tm, 5);
  for (let k = 1; k <= 12; k++) {
    const y = y0 + 0.12 + k * (th - 0.12) / 12;
    for (const [a, b, c, d] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) rod(g, [tx + a * tw, y, tz + b * tw], [tx + c * tw, y, tz + d * tw], 0.008, tm, 4);
    if (k % 2) for (const [a, b, c, d] of [[-1, -1, 1, 1], [1, -1, -1, 1]]) rod(g, [tx + a * tw, y - (th - 0.12) / 12, tz + b * tw], [tx + c * tw, y, tz + d * tw], 0.005, tm, 4);
  }
  for (const k of [0.45, 0.7, 0.88]) { belt(g, [tx + tw, y0 + th * k, tz + tw], [lx - 0.14, y0 + th * k, lz - 0.14], 0.06, 0.04, M('#7d858e', 0.6, 0.4)); box(g, 0.05, 0.012, 0.05, neonMat('#ffb02e', 0.5), lx - 0.17, y0 + th * k + 0.04, lz - 0.17); }
  rod(g, [tx, y0 + th, tz], [tx, y0 + th + 0.5, tz], 0.012, M(STEEL), 5);
  beacon(g, tx, y0 + th + 0.5, tz, RED, 0.04); beacon(g, tx + tw, y0 + th * 0.5, tz + tw, RED, 0.03);
  if (p.shuttle === 1) shuttle(g, lx, lz, y0 + 0.12, 1.15);
  // fuel spheres
  for (const [x, z] of [[-1.62, 0.0], [-1.25, 0.05]]) {
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) rod(g, [x + a * 0.1, y0, z + b * 0.1], [x + a * 0.09, y0 + 0.2, z + b * 0.09], 0.012, M(STEEL), 4);
    ball(g, 0.17, M('#e9edf1', 0.4, 0.4), x, y0 + 0.32, z, 18);
    ring(g, 0.172, 0.01, M('#b8322b', 0.3, 0.5), x, y0 + 0.32, z);
  }
  // hangars along the front with glowing doors; a small craft out front
  const nh = p.hangars;
  for (let i = 0; i < nh; i++) {
    const x = -1.35 + i * 1.0, z = 1.25, w = 0.9, d = 1.1;
    storeys(g, { w, d, floors: 1, x, z, y: y0, style: st, kind: 'louvre', seed: p.seed + i, lit: 0.3 });
    barrel(g, d, w / 2, M('#c9d2dc', 0.5, 0.4), x, y0 + FLOOR, z, { ry: Math.PI / 2, squash: 0.6 });
    box(g, w * 0.8, 0.18, 0.01, M('#3b4149', 0.5, 0.6), x, y0, z - d / 2 - 0.004);
    box(g, w * 0.82, 0.02, 0.016, neonMat(neonOf(p, i), 0.5), x, y0 + 0.19, z - d / 2 - 0.006);
    for (let k = 0; k < 5; k++) box(g, 0.012, 0.012, d * 0.96, M('#8a949f', 0.6, 0.4), x - w * 0.36 + k * w * 0.18, y0 + FLOOR + 0.27 * Math.sqrt(1 - Math.pow((-w * 0.36 + k * w * 0.18) / (w / 2), 2)) - 0.01, z);
  }
  if (nh < 3) {
    const cx = -1.35 + nh * 1.0 + 0.1, cz = 1.3;
    const c = new THREE.Group(); c.position.set(cx, y0 + 0.05, cz); c.rotation.y = 0.5; g.add(c);
    box(c, 0.5, 0.08, 0.18, M('#e6eaee', 0.4, 0.4), 0, 0, 0); box(c, 0.2, 0.012, 0.6, M('#c9d2dc', 0.4, 0.4), -0.05, 0.03, 0);
    box(c, 0.1, 0.05, 0.12, lamp('#2b4766', '#bfe8ff', 0.2), 0.2, 0.06, 0); box(c, 0.02, 0.05, 0.14, neonMat('#7fd8ff', 0.4), -0.26, 0.015, 0);
    for (const dz of [-0.06, 0.06]) rod(g, [cx, y0, cz + dz], [cx, y0 + 0.05, cz + dz], 0.01, M(DARK), 4);
  }
  // terminal + control tower on the right
  const t = storeys(g, { w: 1.3, d: 1.2, floors: 3, x: 1.15, z: -0.7, y: y0, style: st, kind: 'curtain', seed: p.seed + 7, lit: 0.65 });
  slab(g, 1.36, 1.26, st, 1.15, t, -0.7); roofProps(g, 1.0, 0.9, t + 0.04, st, R, { antenna: false });
  neonEdges(g, 1.3, 1.2, neonOf(p), 1.15, y0 + FLOOR, -0.7, 0.025);
  box(g, 1.1, 0.03, 0.3, trimMat(st), 1.15, y0 + FLOOR * 0.95, -0.7 + 0.72);
  const cx = 1.55, cz = -1.55;
  cyl(g, 0.12, 1.5, bodyMat(st, 1), cx, y0, cz, { rt: 0.08, seg: 12 });
  cyl(g, 0.24, 0.16, lamp('#2b4766', '#bfe8ff', 0.15), cx, y0 + 1.5, cz, { rt: 0.28, seg: 12 });
  cyl(g, 0.29, 0.04, trimMat(st), cx, y0 + 1.66, cz, { seg: 12 });
  ring(g, 0.24, 0.012, neonMat(neonOf(p), 0.5), cx, y0 + 1.5, cz, { seg: 12 });
  box(g, 0.3, 0.02, 0.04, M('#c9d2dc', 0.6, 0.4), cx, y0 + 1.75, cz).rotation.y = 0.7;
  cyl(g, 0.012, 0.25, M(STEEL), cx, y0 + 1.7, cz, { seg: 4 }); beacon(g, cx, y0 + 1.95, cz);
  floodMast(g, 0.45, 0.4, y0, 0.9); floodMast(g, -1.8, 1.85, y0, 0.7);
  return g;
}

function buildLance(p) {
  const g = new THREE.Group(); const y0 = lotPad(g, 3, 3, '#4d5258');
  const st = p.style, armour = M('#4a515c', 0.6, 0.4), armour2 = M('#5d6570', 0.6, 0.4);
  const railCol = ['#2f8aa0', CYAN, '#e8fbff'][p.charge], railDay = [0, 0.4, 0.8][p.charge];
  // stepped octagonal fortress base with glowing seams
  cyl(g, 1.4, 0.35, armour, 0, y0, 0, { rt: 1.25, seg: 8 });
  cyl(g, 1.255, 0.03, lamp('#2a3a44', railCol, railDay * 0.5), 0, y0 + 0.35, 0, { seg: 8 });
  cyl(g, 1.0, 0.3, armour2, 0, y0 + 0.38, 0, { rt: 0.88, seg: 8 });
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + Math.PI / 8; const m = box(g, 0.5, 0.28, 0.05, M('#3a4049', 0.6, 0.4), Math.cos(a) * 1.25, y0 + 0.02, Math.sin(a) * 1.25); m.rotation.y = -a + Math.PI / 2; m.rotation.x = 0; }
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; box(g, 0.08, 0.2, 0.012, lamp('#2a3a44', railCol, railDay * 0.4), Math.cos(a) * 1.33, y0 + 0.06, Math.sin(a) * 1.33).rotation.y = -a + Math.PI / 2; }
  // capacitor banks on the first step
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4 + Math.PI / 8, x = Math.cos(a) * 1.1, z = Math.sin(a) * 1.1;
    cyl(g, 0.09, 0.22, M('#c9d2dc', 0.6, 0.3), x, y0 + 0.35, z, { seg: 12 });
    cyl(g, 0.092, 0.04, lamp('#2a3a44', railCol, railDay), x, y0 + 0.5, z, { seg: 12 });
    rod(g, [x, y0 + 0.4, z], [x * 0.6, y0 + 0.62, z * 0.6], 0.018, M(DARK), 5);
  }
  // turntable with teeth
  const tt = y0 + 0.68;
  cyl(g, 0.78, 0.1, M('#6f7884', 0.6, 0.4), 0, tt, 0, { seg: 32 });
  for (let i = 0; i < 24; i++) { const a = i * Math.PI / 12; box(g, 0.05, 0.06, 0.05, M(DARK), Math.cos(a) * 0.8, tt + 0.02, Math.sin(a) * 0.8).rotation.y = -a; }
  // the barrel: a cradle, two rails with glowing inner faces, coil rings, an emitter crown
  const L = p.length, bg = new THREE.Group(); bg.position.set(0, tt + 0.1, 0); bg.rotation.set(-0.12, Math.PI / 4, 0, 'YXZ'); g.add(bg);
  // breech: an armoured housing with vents, a lit seam
  box(bg, 0.78, 0.42, 0.7, armour2, 0, 0, 0);
  box(bg, 0.8, 0.025, 0.72, lamp('#2a3a44', railCol, railDay * 0.5), 0, 0.3, 0);
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) box(bg, 0.012, 0.05, 0.4, M('#2a2e34'), s * 0.395, 0.08 + k * 0.08, 0);
  // two pale rails with a glowing gap between them, held by collars; coils light up as the charge builds
  const rail = M('#b4bcc6', 0.55, 0.3), railDk = M('#59616c', 0.6, 0.35), glowRail = lamp('#2a4a5a', railCol, railDay);
  for (const s of [-1, 1]) {
    box(bg, 0.13, L, 0.26, rail, s * 0.17, 0.42, 0);
    box(bg, 0.06, L * 0.97, 0.3, railDk, s * 0.235, 0.42, 0);
    box(bg, 0.014, L * 0.98, 0.16, glowRail, s * 0.1, 0.42, 0);
  }
  box(bg, 0.19, L * 0.98, 0.04, glowRail, 0, 0.42, -0.1);
  const coils = Math.max(4, Math.round(L / 0.42)), lit = [0, Math.ceil(coils / 2), coils][p.charge];
  for (let k = 0; k < coils; k++) {
    const y = 0.7 + k * (L - 0.55) / coils;
    box(bg, 0.6, 0.06, 0.36, M('#4a515c', 0.6, 0.4), 0, y - 0.03, 0);
    const m = k < lit ? lamp('#3a5a6a', railCol, railDay) : M('#a07840', 0.55, 0.35);
    for (const s of [-1, 1]) box(bg, 0.025, 0.04, 0.38, m, s * 0.31, y - 0.02, 0);
    box(bg, 0.6, 0.04, 0.025, m, 0, y - 0.02, 0.19);
  }
  // emitter crown: four prongs round a glowing focus
  const top = 0.42 + L;
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; rod(bg, [Math.cos(a) * 0.24, top - 0.15, Math.sin(a) * 0.2], [Math.cos(a) * 0.09, top + 0.3, Math.sin(a) * 0.09], 0.028, rail, 6); }
  ball(bg, p.charge === 2 ? 0.11 : 0.075, lamp('#9fe8f0', railCol, railDay), 0, top + 0.14, 0, 16);
  ring(bg, 0.17, 0.015, neonMat(railCol, railDay), 0, top + 0.14, 0, { seg: 24 });
  ring(bg, 0.12, 0.012, neonMat(railCol, railDay), 0, top + 0.26, 0, { seg: 24 });
  // hydraulic braces from the turntable to the barrel
  for (const s of [-1, 1]) rod(g, [s * 0.5, tt + 0.1, 0.35], [s * 0.18, tt + 0.1 + L * 0.42, -0.12], 0.04, M('#9aa3ad', 0.7, 0.3));
  beacon(g, 1.18, y0 + 0.35, 0.4, RED, 0.04); beacon(g, -0.4, y0 + 0.35, -1.18, RED, 0.04);
  return g;
}

// ---------------------------------------------------------------------------------------------------------------
// Outposts (each 2×2: the machine on its deposit, a power pylon)
// ---------------------------------------------------------------------------------------------------------------
function buildMetal(p) {
  const g = new THREE.Group(); const R = p.R;
  deposit(g, R, '#4b4440', '#5a4436');
  const ore = [M('#3d3936', 0.2, 0.8), M(RUST, 0.3, 0.7), M('#b8c0c8', 0.55, 0.3), M('#6a4433', 0.2, 0.8)];
  rocks(g, R, 26, 0, 0, 0.55, 0.95, ore, 0, [0.04, 0.1]);
  const y0 = 0.02, L = p.level;
  // rig platform + derrick tower + drill string
  const cx = 0.05, cz = -0.1;
  box(g, 0.75, 0.08, 0.75, M('#5d6670', 0.5, 0.5), cx, y0, cz);
  hazardBar(g, 0.75, cx, y0 + 0.04, cz + 0.376);
  hazardBar(g, 0.75, cx + 0.376, y0 + 0.04, cz, { alongZ: true });
  const h = 0.8 + L * 0.3, w = 0.2, dm = M(HAZARD, 0.4, 0.5);
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) rod(g, [cx + a * w, y0 + 0.08, cz + b * w], [cx + a * 0.04, y0 + 0.08 + h, cz + b * 0.04], 0.014, dm, 5);
  for (let k = 1; k <= 3 + L; k++) { const f = k / (4 + L), s = 2 * (w - (w - 0.04) * f); box(g, s, 0.012, s, dm, cx, y0 + 0.08 + h * f, cz); if (k % 2) box(g, 0.03, 0.02, 0.012, neonMat(WARM, 0.2), cx + s / 2, y0 + 0.07 + h * f, cz + s / 2); }
  ring(g, 0.08, 0.014, neonMat(ORANGE, 0.4), cx, y0 + 0.1, cz, { seg: 16 });
  box(g, 0.14, 0.06, 0.14, M('#4a515c', 0.6, 0.4), cx, y0 + 0.08 + h, cz);
  beacon(g, cx, y0 + 0.14 + h, cz, '#ffb02e', 0.03);
  cyl(g, 0.025, h * 0.85, M('#8a949f', 0.8, 0.3), cx, y0 + 0.08, cz, { seg: 8 });
  cyl(g, 0.06, 0.06, M(DARK, 0.6, 0.4), cx, y0 + 0.08, cz, { seg: 10 });
  // motor house, hopper + conveyor to the ore heap
  box(g, 0.22, 0.16, 0.18, M('#d8dde3', 0.4, 0.5), cx - 0.22, y0 + 0.08, cz - 0.2);
  box(g, 0.012, 0.04, 0.12, lamp('#2b4766', '#bfe8ff', 0.2), cx - 0.11, y0 + 0.16, cz - 0.2);
  cyl(g, 0.13, 0.2, M('#7d858e', 0.5, 0.5), 0.3, y0 + 0.2, 0.3, { rt: 0.16, seg: 10 }).rotation.x = 0;
  cyl(g, 0.04, 0.2, M('#7d858e', 0.5, 0.5), 0.3, y0, 0.3, { rt: 0.13, seg: 10 });
  belt(g, [0.32, y0 + 0.28, 0.42], [0.55, y0 + 0.1, 0.7], 0.08, 0.02, M('#4f555c', 0.5, 0.5));
  cyl(g, 0.22, 0.18 + L * 0.03, M('#6a4433', 0.1, 0.95), 0.62, 0, 0.72, { rt: 0.02, seg: 10 });
  for (let i = 0; i < 4; i++) { const a = R.range(0, 6.28); ball(g, 0.03, M('#b8c0c8', 0.55, 0.3), 0.62 + Math.cos(a) * 0.12, 0.05, 0.72 + Math.sin(a) * 0.12, 6); }
  floodMast(g, -0.4, 0.45, y0, 0.45);
  pylon(g, -0.65, 0.65, y0, 0.55);
  rod(g, [-0.65, y0 + 0.48, 0.65], [cx - 0.22, y0 + 0.24, cz - 0.2], 0.005, M('#1d1f23'), 3);
  return g;
}

function buildStone(p) {
  const g = new THREE.Group(); const R = p.R, L = p.level;
  deposit(g, R, '#a8a08e', '#b9b19e');
  const stone = [M('#b5ad9a', 0.05, 0.9), M('#9d9583', 0.05, 0.9), M('#c7c0ae', 0.05, 0.9)];
  rocks(g, R, 18, 0, 0, 0.6, 0.95, stone, 0, [0.04, 0.09]);
  // a cut rock face in terraces at the back-left (the quarry wall), with drill scars
  const face = [[-0.45, -0.45, 1.0, 0.8, 0.12 + 0.06 * L], [-0.52, -0.55, 0.85, 0.62, 0.24 + 0.08 * L], [-0.6, -0.62, 0.65, 0.45, 0.36 + 0.1 * L]];
  face.forEach(([x, z, w, d, h], i) => {
    box(g, w, h, d, stone[i % 3], x, 0, z);
    for (let k = 0; k < 5; k++) box(g, 0.006, h * 0.8, 0.006, M('#7a7262', 0, 1), x + w / 2 + 0.002, 0, z - d / 2 + 0.08 + k * (d - 0.16) / 4);
    for (let k = 0; k < 4; k++) box(g, w * 0.18, h * 0.7, 0.006, M('#a39b88', 0, 1), x - w / 2 + 0.12 + k * (w - 0.24) / 3, 0, z + d / 2 + 0.002);
    box(g, 0.03, 0.02, 0.03, neonMat(WARM, 0.2), x + w / 2 - 0.05, h, z + d / 2 - 0.05);
  });
  // cut blocks stacked on pallets
  for (let i = 0; i < 4 + L * 2; i++) {
    const x = 0.25 + (i % 3) * 0.2, z = 0.55 - Math.floor(i / 3) * 0.2, lay = i >= 6 ? 1 : 0;
    box(g, 0.16, 0.08, 0.12, stone[(i + 1) % 3], x, 0.02 + (i % 2 && lay ? 0.08 : 0), z);
  }
  // quarry saw: tracked base, boom, a big disc saw with a glowing cut line
  const bx = 0.25, bz = -0.15;
  box(g, 0.32, 0.06, 0.24, M('#2a2e34', 0.5, 0.6), bx, 0.02, bz);
  box(g, 0.24, 0.12, 0.18, M(HAZARD, 0.4, 0.5), bx, 0.08, bz);
  box(g, 0.012, 0.05, 0.1, lamp('#2b4766', '#bfe8ff', 0.2), bx + 0.122, 0.13, bz);
  belt(g, [bx - 0.05, 0.22, bz], [-0.12, 0.32 + L * 0.05, bz - 0.1], 0.05, 0.04, M(HAZARD, 0.4, 0.5));
  const sx = -0.15, sy = 0.3 + L * 0.05, sz = bz - 0.1;
  const disc = addMesh(g, G('saw', () => new THREE.CylinderGeometry(0.13, 0.13, 0.012, 24)), M('#c0c6cc', 0.5, 0.3), sx, sy, sz); disc.rotation.x = Math.PI / 2;
  box(g, 0.014, 0.1, 0.004, neonMat(ORANGE, 0.6), sx - 0.1, sy - 0.14, sz + 0.0);
  // crusher + conveyor + gravel heap
  box(g, 0.2, 0.2, 0.2, M('#7d858e', 0.5, 0.5), 0.65, 0.02, -0.35);
  cyl(g, 0.1, 0.1, M('#5d6168', 0.5, 0.5), 0.65, 0.22, -0.35, { rt: 0.13, seg: 8 });
  box(g, 0.012, 0.03, 0.12, neonMat('#ffb02e', 0.4), 0.756, 0.12, -0.35); beacon(g, 0.65, 0.32, -0.35, '#ffb02e', 0.025);
  belt(g, [0.65, 0.18, -0.25], [0.65, 0.05, 0.05], 0.06, 0.02, M('#4f555c', 0.5, 0.5));
  cyl(g, 0.17, 0.14, M('#8d8a84', 0, 1), 0.68, 0, 0.12, { rt: 0.02, seg: 10 });
  floodMast(g, 0.0, 0.3, 0.02, 0.45);
  pylon(g, -0.65, 0.62, 0.02, 0.55);
  rod(g, [-0.65, 0.5, 0.62], [0.65, 0.2, -0.35], 0.005, M('#1d1f23'), 3);
  return g;
}

function buildCrystal(p) {
  const g = new THREE.Group(); const R = p.R, L = p.level;
  deposit(g, R, '#3b3550', '#4a3f66');
  const hues = [['#5ff8ff', '#2fd0e8'], ['#b07bff', '#d59bff'], ['#7dff9a', '#3fe8a0']][p.hue];
  const cm = [crystalMat(hues[0]), crystalMat(hues[1])];
  rocks(g, R, 14, 0, 0, 0.62, 0.95, [M('#2c2840', 0.2, 0.8), M('#463d5c', 0.2, 0.8)], 0, [0.04, 0.08]);
  // crystal clusters scattered round the deposit
  for (let c = 0; c < 8; c++) {
    const a = c * 0.785 + R.range(0, 0.4), d = R.range(0.58, 0.78), x = Math.cos(a) * d, z = Math.sin(a) * d;
    if ((x < -0.4 && z > 0.4) || (x > 0.4 && z < -0.4)) continue;   // pylon + canister corners
    const big = R.range(0.22, 0.38) * (0.8 + L * 0.15);
    crystal(g, x, z, 0, big, big * 0.18, R.pick(cm), R.range(0, 0.25), R.range(0, 6.28));
    for (let k = 0; k < 4; k++) { const b = R.range(0, 6.28); crystal(g, x + Math.cos(b) * 0.06, z + Math.sin(b) * 0.06, 0, big * R.range(0.4, 0.7), big * 0.12, R.pick(cm), R.range(0.35, 0.7), b + Math.PI / 2); }
  }
  // extractor: hexagonal deck, a big central crystal held by three arching prongs, a glowing containment ring
  cyl(g, 0.48, 0.07, M('#59616c', 0.5, 0.5), 0, 0, 0, { seg: 6 });
  ring(g, 0.46, 0.012, neonMat(hues[0], 0.4), 0, 0.07, 0, { seg: 6 });
  crystal(g, 0, 0, 0.05, 0.55 + L * 0.08, 0.1, cm[0]);
  for (let k = 0; k < 5; k++) { const a = k * 1.256; crystal(g, Math.cos(a) * 0.12, Math.sin(a) * 0.12, 0.05, 0.22, 0.04, cm[k % 2], 0.35, a + Math.PI / 2); }
  const pm = M('#c9d2dc', 0.6, 0.35), H = 0.65 + L * 0.12;
  for (let k = 0; k < 3; k++) {
    const a = k * 2.094 + 0.3, x = Math.cos(a), z = Math.sin(a);
    box(g, 0.1, 0.1, 0.1, M(DARK, 0.6, 0.4), x * 0.38, 0.07, z * 0.38);
    rod(g, [x * 0.38, 0.15, z * 0.38], [x * 0.33, H * 0.7, z * 0.33], 0.025, pm, 6);
    rod(g, [x * 0.33, H * 0.7, z * 0.33], [x * 0.16, H, z * 0.16], 0.022, pm, 6);
    ball(g, 0.035, neonMat(hues[0], 0.6), x * 0.16, H, z * 0.16, 10);
    rod(g, [x * 0.16, H, z * 0.16], [0, H * 0.75, 0], 0.008, lamp('#dff', hues[0], 0.6), 4);   // energy beam
  }
  for (let i = 0; i < L; i++) ring(g, 0.3 - i * 0.04, 0.014, neonMat(hues[1], 0.5), 0, 0.3 + i * 0.18, 0, { seg: 32 });
  // canister rack + pylon
  for (let i = 0; i < 2 + L; i++) {
    const x = 0.55 + (i % 2) * 0.12, z = -0.62 + Math.floor(i / 2) * 0.13;
    cyl(g, 0.045, 0.16, M('#d8dde3', 0.5, 0.4), x, 0.012, z, { seg: 10 });
    cyl(g, 0.047, 0.03, crystalMat(hues[0], 0.5), x, 0.09, z, { seg: 10 });
  }
  pylon(g, -0.65, 0.65, 0.012, 0.55, hues[0]);
  rod(g, [-0.65, 0.5, 0.65], [-0.3, 0.12, 0.22], 0.005, M('#1d1f23'), 3);
  return g;
}

// ---------------------------------------------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------------------------------------------
const PRODUCT = { key: 'product', label: 'Product', min: 0, max: 2, step: 1, def: 0, names: ['Steel', 'Concrete', 'Power cells'] };
const LEVEL = { key: 'level', label: 'Rig size', min: 1, max: 3, step: 1, def: 2 };

addRecipes({
  // Industry
  'ind-workshop': {
    name: 'Fab Workshop', group: 'industry', zone: 'I', size: [2, 2],
    blurb: 'Small fabrication hall: sawtooth skylights, a loading bay with lit doors, an office annex.',
    params: [{ key: 'floors', label: 'Storeys', min: 1, max: 3, step: 1, def: 1 }, { key: 'teeth', label: 'Roof teeth', min: 3, max: 6, step: 1, def: 4 }],
    build: buildWorkshop,
  },
  'ind-depot': {
    name: 'Logistics Depot', group: 'industry', zone: 'I', size: [3, 2],
    blurb: 'Barrel-roofed sheds, a container yard and a gantry crane straddling the stacks.',
    params: [{ key: 'sheds', label: 'Sheds', min: 1, max: 2, step: 1, def: 2 }, { key: 'stacks', label: 'Stack height', min: 1, max: 4, step: 1, def: 3 }],
    build: buildDepot,
  },
  'ind-refinery': {
    name: 'Refinery', group: 'industry', zone: 'I', size: [2, 2],
    blurb: 'Turns raw Metal, Stone or Crystal into Steel, Concrete or Power cells — the look follows the product.',
    params: [PRODUCT], build: p => buildRefinery(p, 2),
  },
  'ind-refinery-l': {
    name: 'Large Refinery', group: 'industry', zone: 'I', size: [3, 3],
    blurb: 'The full-size refinery: extra stacks, silos or coolant towers for its product.',
    params: [PRODUCT], build: p => buildRefinery(p, 3),
  },
  // Services
  'svc-power': {
    name: 'Fusion Plant', group: 'services', size: [2, 2],
    blurb: 'Compact fusion reactor: a white dome in glowing containment rings, cooling towers, a switchyard.',
    params: [{ key: 'rings', label: 'Rings', min: 1, max: 3, step: 1, def: 2 }, { key: 'towers', label: 'Cooling towers', min: 1, max: 2, step: 1, def: 1 }],
    build: p => buildFusion(p, 2),
  },
  'svc-power-l': {
    name: 'Large Fusion Plant', group: 'services', size: [3, 3],
    blurb: 'The big reactor: more rings, up to three cooling towers, a turbine hall.',
    params: [{ key: 'rings', label: 'Rings', min: 1, max: 3, step: 1, def: 3 }, { key: 'towers', label: 'Cooling towers', min: 1, max: 3, step: 1, def: 2 }],
    build: p => buildFusion(p, 3),
  },
  'svc-water': {
    name: 'Water Pump', group: 'services', size: [2, 2],
    blurb: 'Pump house, intake pool and tanks; blue-lit pipes dive into the underground network.',
    params: [{ key: 'tanks', label: 'Tanks', min: 1, max: 2, step: 1, def: 1 }],
    build: buildWater,
  },
  'svc-school': {
    name: 'School', group: 'services', size: [2, 2],
    blurb: 'Low L-shaped campus with solar roofs, coloured fins, a courtyard and a play field.',
    params: [{ key: 'floors', label: 'Storeys', min: 1, max: 3, step: 1, def: 2 }],
    build: buildSchool,
  },
  'svc-university': {
    name: 'University', group: 'services', size: [3, 3],
    blurb: 'Domed main hall, an observatory tower and wings round a green quad.',
    params: [{ key: 'wings', label: 'Wings', min: 1, max: 4, step: 1, def: 3 }, { key: 'floors', label: 'Storeys', min: 2, max: 5, step: 1, def: 3 }],
    build: buildUniversity,
  },
  'svc-park': {
    name: 'Park & Plaza', group: 'services', size: [2, 2],
    blurb: 'Lawns and paths with glowing alien trees round a fountain, or a paved plaza with a light sculpture.',
    params: [{ key: 'trees', label: 'Trees', min: 2, max: 12, step: 1, def: 7 }, { key: 'plaza', label: 'Layout', min: 0, max: 1, step: 1, def: 0, names: ['Garden', 'Plaza'] }],
    build: buildPark,
  },
  'svc-arena': {
    name: 'Arena', group: 'services', size: [3, 3],
    blurb: 'Leisure: an oval arena with tiered seating, big screens and floodlight masts.',
    params: [{ key: 'tiers', label: 'Seating tiers', min: 2, max: 4, step: 1, def: 3 }, { key: 'roof', label: 'Roof', min: 0, max: 1, step: 1, def: 1, names: ['Open', 'Ring roof'] }],
    build: buildArena,
  },
  // Colony
  'col-core': {
    name: 'Colony Core', group: 'colony', size: [3, 3],
    blurb: 'The founding ship, landed for good: command tower (city hall), small reactor, storage and a starter turret.',
    params: [{ key: 'level', label: 'Upgrade', min: 1, max: 3, step: 1, def: 1 }],
    build: buildCore,
  },
  'col-pad': {
    name: 'Landing Pad', group: 'colony', size: [2, 2],
    blurb: 'Where settler pods come down once it is built: marked pads ringed with beacons.',
    params: [{ key: 'pads', label: 'Pads', min: 1, max: 2, step: 1, def: 1 }, { key: 'pod', label: 'Pod', min: 0, max: 1, step: 1, def: 0, names: ['Empty', 'Pod landed'] }],
    build: buildPad,
  },
  'col-comms': {
    name: 'Comms Array', group: 'colony', size: [2, 2],
    blurb: 'Calls passing ships. Bigger arrays (tier 1–3) hear more of them.',
    params: [{ key: 'tier', label: 'Tier', min: 1, max: 3, step: 1, def: 1 }],
    build: buildComms,
  },
  // Landmarks
  'lm-arcology': {
    name: 'Arcology Spire', group: 'landmarks', size: [3, 3],
    blurb: 'A city in one tower: stacked glass drums on garden terraces, an exoskeleton and a lit crown.',
    params: [{ key: 'floors', label: 'Storeys', min: 40, max: 90, step: 5, def: 50 }, { key: 'tiers', label: 'Tiers', min: 3, max: 6, step: 1, def: 4 }],
    build: buildArcology,
  },
  'lm-spaceport': {
    name: 'Spaceport', group: 'landmarks', size: [4, 4],
    blurb: 'Launch tower with a docked shuttle, hangars, fuel spheres, terminal and control tower.',
    params: [{ key: 'shuttle', label: 'Shuttle', min: 0, max: 1, step: 1, def: 1, names: ['Away', 'Docked'] }, { key: 'hangars', label: 'Hangars', min: 1, max: 3, step: 1, def: 2 }],
    build: buildSpaceport,
  },
  'lm-lance': {
    name: 'Orbital Lance', group: 'landmarks', size: [3, 3],
    blurb: 'A rail cannon pointed at the sky: fires on a long cooldown. Its rails glow as it charges.',
    params: [{ key: 'charge', label: 'Charge', min: 0, max: 2, step: 1, def: 1, names: ['Idle', 'Charging', 'Ready'] }, { key: 'length', label: 'Barrel length', min: 2, max: 4.5, step: 0.5, def: 3 }],
    build: buildLance,
  },
  // Outposts
  'out-metal': {
    name: 'Metal Drill', group: 'outposts', size: [2, 2],
    blurb: 'A derrick drilling an ore deposit; a conveyor drops the ore on a heap. Powered by its pylon.',
    params: [LEVEL], build: buildMetal,
  },
  'out-stone': {
    name: 'Stone Quarry', group: 'outposts', size: [2, 2],
    blurb: 'A terraced quarry face, a disc saw cutting blocks, a crusher making gravel.',
    params: [LEVEL], build: buildStone,
  },
  'out-crystal': {
    name: 'Crystal Extractor', group: 'outposts', size: [2, 2],
    blurb: 'Three prongs hold a giant crystal in a glowing field; the deposit glows round it at night.',
    params: [LEVEL, { key: 'hue', label: 'Crystal', min: 0, max: 2, step: 1, def: 0, names: ['Cyan', 'Violet', 'Green'] }],
    build: buildCrystal,
  },
});
