// Zoned buildings, part 3: every zone (homes R, shops/offices C, industry I) in 1×1, 2×1 and 2×2 lots at every level
// (owner 2026-11-17: "Add more structure variety"). Same contract as buildings.js: each recipe is a function of a few
// numbers (+ style + seed), its ground origin at the lot centre, nothing outside ±size/2 in x/z, front (doors,
// shopfronts, porches, loading doors) toward +z. Arcline picks these by zone, level and lot size (data/catalog.json).
//
// Levels (what the game grows where):
//   homes     L1 res-court (2×2) res-duplex (2×1) · L2 res-townhouse (1×1) res-walkup (2×2)
//             L3 res-slim (1×1) res-midrise (2×1) · L4 res-needle (1×1) res-twin (2×1)
//   shops     L1 com-kiosks (2×1) com-mart (2×2) · L2 com-corner (1×1) com-gallery (2×2)
//             L3 com-studio (1×1) com-capsule (2×1) · L4 com-spire (1×1) com-exchange (2×1)
//   industry  L1 ind-shed (1×1) ind-yard (2×1) · L2 ind-printworks (1×1) ind-chemworks (2×1) ind-freight (2×2)
//             L3 ind-cleanlab (1×1) ind-assembly (2×1) ind-robotics (2×2)
import * as THREE from 'three';
import { addRecipes } from './buildings.js';
import { STYLES, facadeMat, leafMat, waterMat } from './materials.js';
import { box, cyl, dome, storeys, slab, neonEdges, sign, roofProps, balconies, lotPad, FLOOR, bodyMat, trimMat, neonMat, glassMat } from './shapes.js';

// ---------------------------------------------------------------------------------------------------------------
// Helpers (local copies of the small ones in buildings2.js, plus a few new ones)
// ---------------------------------------------------------------------------------------------------------------
const cache = new Map();
const cached = (k, make) => { if (!cache.has(k)) cache.set(k, make()); return cache.get(k); };
const G = (k, make) => cached('g:' + k, make);
const f3 = n => n.toFixed(3);

const M = (color, metal = 0.3, rough = 0.6) => bodyMat('chrome', 0, { color, metal, rough });
/** Looks like `day` in sunlight and glows `glow` at night (skylights, resin tanks, capsule windows). */
function lamp(day, glow, dayGlow = 0) {
  return cached(`lamp:${day}:${glow}:${dayGlow}`, () => {
    const m = new THREE.MeshStandardMaterial({ color: day, emissive: glow, emissiveIntensity: 1, roughness: 0.35, metalness: 0.3 });
    m.userData.glow = true; m.userData.dayGlow = dayGlow; return m;
  });
}
const STEEL = '#8a949f', DARK = '#3a4049', HAZARD = '#e3b52c';
const CYAN = '#3ff0ff', WARM = '#ffd18a', RED = '#ff3030', ORANGE = '#ff8a2a';
const neonOf = (p, i = 0) => STYLES[p.style].neon[(p.seed + i) % STYLES[p.style].neon.length];

function addMesh(parent, geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
function ball(parent, r, mat, x, y, z, seg = 12) { return addMesh(parent, G(`ball${f3(r)}:${seg}`, () => new THREE.SphereGeometry(r, seg, Math.ceil(seg * 0.7))), mat, x, y, z); }
/** A round rod between two points (pipes, struts, legs, cables). */
function rod(parent, a, b, r, mat, seg = 8) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const L = d.length();
  const m = addMesh(parent, G(`rod${f3(r)}:${f3(L)}:${seg}`, () => new THREE.CylinderGeometry(r, r, L, seg)), mat, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); return m;
}
/** A box turned about y. */
function tbox(parent, w, h, d, mat, x, y, z, ry = 0) { const m = box(parent, w, h, d, mat, x, y, z); m.rotation.y = ry; return m; }
/** A horizontal cylinder along x (ry turns it). Centre at (x, y, z). */
function hcyl(parent, r, len, mat, x, y, z, ry = 0, seg = 16) {
  const m = addMesh(parent, G(`hc${f3(r)}:${f3(len)}:${seg}`, () => new THREE.CylinderGeometry(r, r, len, seg)), mat, x, y, z);
  m.rotation.set(0, ry, Math.PI / 2, 'YXZ'); return m;
}
/** A short cylinder whose axis points along z (round windows, portholes, fan faces on a wall). */
function zcyl(parent, r, len, mat, x, y, z, seg = 16) {
  const m = addMesh(parent, G(`zc${f3(r)}:${f3(len)}:${seg}`, () => new THREE.CylinderGeometry(r, r, len, seg)), mat, x, y, z);
  m.rotation.x = Math.PI / 2; return m;
}
/** Half-cylinder barrel roof along x (ry turns it), its flat side at y. squash flattens it. */
function barrel(parent, len, r, mat, x, y, z, { ry = 0, squash = 0.5 } = {}) {
  const m = addMesh(parent, G(`bar${f3(r)}:${f3(len)}`, () => new THREE.CylinderGeometry(r, r, len, 20, 1, false, 0, Math.PI)), mat, x, y, z);
  m.rotation.set(0, ry, Math.PI / 2, 'YXZ'); m.scale.set(squash, 1, 1); return m;
}
/** A vertical half ring (arch / rib) in the x-y plane at depth z: centre (x, y, z), radius R, flattened by squash. */
function arch(parent, R, tube, mat, x, y, z, squash = 1, ry = 0) {
  const m = addMesh(parent, G(`arch${f3(R)}:${f3(tube)}`, () => new THREE.TorusGeometry(R, tube, 6, 24, Math.PI)), mat, x, y, z);
  m.scale.y = squash; m.rotation.y = ry; return m;
}
/** A flat ring lying on the ground plane. */
function flatRing(parent, R, tube, mat, x, y, z) {
  const m = addMesh(parent, G(`fring${f3(R)}:${f3(tube)}`, () => new THREE.TorusGeometry(R, tube, 6, 32)), mat, x, y, z);
  m.rotation.x = Math.PI / 2; return m;
}
/** One sawtooth roof tooth: vertical glazed face toward +z, slope down toward −z. len along x, base along z. */
function tooth(parent, len, base, h, mat, x, y, z) {
  const geo = G(`tooth${f3(len)}:${f3(base)}:${f3(h)}`, () => {
    const s = new THREE.Shape(); s.moveTo(-base / 2, 0); s.lineTo(base / 2, 0); s.lineTo(-base / 2, h); s.closePath();
    const e = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false }); e.translate(0, 0, -len / 2); return e;
  });
  const m = addMesh(parent, geo, mat, x, y, z); m.rotation.y = Math.PI / 2; return m;
}
/** A gable (pitched) roof: a triangular prism span wide, len long, h tall, bottom at y. Ridge along z (gable ends face
 *  ±z, the front shows the triangle) unless ridgeX (ridge along x, slopes face ±z). */
function gable(parent, span, len, h, mat, x, y, z, ridgeX = false) {
  const geo = G(`gab${f3(span)}:${f3(len)}:${f3(h)}`, () => {
    const s = new THREE.Shape(); s.moveTo(-span / 2, 0); s.lineTo(span / 2, 0); s.lineTo(0, h); s.closePath();
    const e = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false }); e.translate(0, 0, -len / 2); return e;
  });
  const m = addMesh(parent, geo, mat, x, y, z); if (ridgeX) m.rotation.y = Math.PI / 2; return m;
}
/** A tower with windows wrapped round a cylinder (seg 8 = octagon, 4 + ry π/4 = square). Returns its top y. */
function roundTower(parent, { r, floors, x = 0, y = 0, z = 0, style, kind = 'curtain', seed = 1, seg = 8, lit = 0.55, rt = r, ry = 0 }) {
  const h = floors * FLOOR;
  const cols = Math.max(seg, Math.round((2 * Math.PI * r) / 0.18 / seg) * seg);
  const side = facadeMat(style, kind, seed, cols, floors, lit), roof = bodyMat(style, 2);
  addMesh(parent, G(`rt${f3(r)}:${f3(rt)}:${f3(h)}:${seg}`, () => new THREE.CylinderGeometry(rt, r, h, seg)), [side, roof, roof], x, y + h / 2, z).rotation.y = ry;
  return y + h;
}
function beacon(parent, x, y, z, color = RED, s = 0.035) { return box(parent, s, s, s, neonMat(color, 0.9), x, y, z); }
function lampPost(parent, x, z, y, h = 0.22, color = WARM) {
  cyl(parent, 0.008, h, M(DARK, 0.5, 0.5), x, y, z, { seg: 5 });
  box(parent, 0.04, 0.015, 0.04, neonMat(color, 0.25), x, y + h, z);
}
function hazardBar(parent, len, x, y, z, { h = 0.02, d = 0.012, alongZ = false, n = Math.max(2, Math.round(len / 0.05)) } = {}) {
  const s = len / n;
  for (let i = 0; i < n; i++) {
    const o = -len / 2 + s * (i + 0.5); const m = M(i % 2 ? '#22252b' : HAZARD, 0.2, 0.6);
    if (alongZ) box(parent, d, h, s, m, x, y, z + o); else box(parent, s, h, d, m, x + o, y, z);
  }
}
/** Banded smoke stack with a beacon near the top. */
function stack(parent, x, z, y, r, h, band = '#b8322b', light = RED) {
  cyl(parent, r, h, M('#cfd3d6', 0.2, 0.7), x, y, z, { rt: r * 0.8, seg: 14 });
  for (const t of [0.62, 0.82]) cyl(parent, r * (1 - t * 0.2) + 0.006, h * 0.07, M(band, 0.2, 0.6), x, y + h * t, z, { seg: 14 });
  cyl(parent, r * 0.81, h * 0.05, M('#2a2a2e', 0.2, 0.9), x, y + h * 0.95, z, { seg: 14 });
  beacon(parent, x, y + h, z, light, 0.03);
}
const CONTAINER = ['#a8432f', '#2f7f8a', '#d6a12c', '#5d6b78', '#3c5fa8', '#7c8a3c', '#b8b2a6'];
function container(parent, x, y, z, ry, color, len = 0.27) {
  const m = tbox(parent, len, 0.1, 0.105, M(color, 0.4, 0.55), x, y, z, ry);
  tbox(parent, len + 0.006, 0.012, 0.11, M('#2a2e34', 0.5, 0.5), x, y + 0.094, z, ry);
  return m;
}
const CRATE = ['#b58a5a', '#6f7d6a', '#4f6b8a', '#8a5a4a'];
/** A crate with a lighter lid. */
function crate(parent, x, y, z, s, color) {
  box(parent, s, s * 0.9, s, M(color, 0.15, 0.75), x, y, z);
  box(parent, s * 1.02, s * 0.1, s * 1.02, M('#c9b48a', 0.1, 0.8), x, y + s * 0.8, z);
  return y + s * 0.9;
}
/** A small hover car: body, glass cabin, cyan under-glow. ry 0 = nose toward +x. */
function hoverCar(parent, x, z, y, ry, color) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; parent.add(g);
  box(g, 0.17, 0.035, 0.085, M(color, 0.5, 0.35), 0, 0.02, 0);
  box(g, 0.08, 0.03, 0.07, lamp('#2b4766', '#9fd4ff'), -0.01, 0.055, 0);
  box(g, 0.006, 0.012, 0.06, neonMat('#ffffff', 0.5), 0.086, 0.03, 0);
  box(g, 0.14, 0.006, 0.06, neonMat(CYAN, 0.35), 0, 0.008, 0);
  return g;
}
/** A hover truck: cab + trailer floating over a cyan under-glow. ry 0 = facing +x. */
function hoverTruck(parent, x, z, y, ry, color = '#d8dde3') {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; parent.add(g);
  box(g, 0.08, 0.075, 0.09, M(color, 0.4, 0.4), 0.12, 0.03, 0);
  box(g, 0.012, 0.03, 0.07, lamp('#2b4766', '#bfe8ff'), 0.165, 0.07, 0);
  box(g, 0.21, 0.09, 0.1, M('#9aa3ad', 0.4, 0.5), -0.04, 0.03, 0);
  box(g, 0.3, 0.008, 0.07, neonMat(CYAN, 0.35), 0, 0.012, 0);
  return g;
}
const LEAF = ['#2f9e8a', '#3f74c8', '#7a5fd0', '#2fae6a', '#b85fa0'];
const BULB = ['#5ff8ff', '#7fb6ff', '#e08bff', '#b6ff5f', '#ff7fd0'];
/** A glowing alien shrub: a leafy dome with a few lit bulbs. s ≈ its radius. */
function shrub(parent, x, z, y, s, R) {
  const ci = R.int(0, LEAF.length - 1);
  dome(parent, s, leafMat(LEAF[ci]), x, y, z, { squash: 0.9, seg: 12 });
  const glow = neonMat(BULB[ci], 0.3);
  for (let i = 0; i < 3; i++) { const a = i * 2.1 + R.range(0, 1); ball(parent, s * 0.22, glow, x + Math.cos(a) * s * 0.55, y + s * 0.7, z + Math.sin(a) * s * 0.55, 6); }
}
/** A slim alien tree (stem + layered canopy + glowing tip). s = scale (1 ≈ a quarter tile tall). */
function tree(parent, x, z, y, s, R) {
  const ci = R.int(0, LEAF.length - 1);
  cyl(parent, 0.016 * s, 0.16 * s, M('#4a3a48', 0.1, 0.8), x, y, z, { rt: 0.01 * s, seg: 6 });
  dome(parent, 0.11 * s, leafMat(LEAF[ci]), x, y + 0.13 * s, z, { squash: 0.6, seg: 12 });
  dome(parent, 0.07 * s, leafMat(LEAF[(ci + 1) % LEAF.length]), x, y + 0.18 * s, z, { squash: 0.8, seg: 10 });
  ball(parent, 0.02 * s, neonMat(BULB[ci], 0.3), x, y + 0.25 * s, z, 6);
}
/** A door on a +z wall at zFace (its bottom at y), with a glowing light over it. */
function door(parent, x, y, zFace, light, { w = 0.07, h = 0.14 } = {}) {
  box(parent, w, h, 0.012, M('#2a2f38', 0.4, 0.5), x, y, zFace + 0.004);
  box(parent, w * 0.5, 0.018, 0.018, neonMat(light, 0.45), x, y + h + 0.012, zFace + 0.01);
}
/** A low railing round a w × d roof (4 thin bars on posts). */
function railing(parent, w, d, x, y, z, mat, h = 0.04) {
  const t = 0.008;
  box(parent, w, t, t, mat, x, y + h, z + d / 2 - t / 2); box(parent, w, t, t, mat, x, y + h, z - d / 2 + t / 2);
  box(parent, t, t, d, mat, x + w / 2 - t / 2, y + h, z); box(parent, t, t, d, mat, x - w / 2 + t / 2, y + h, z);
  for (const [px, pz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) box(parent, t, h, t, mat, x + px * (w / 2 - t / 2), y, z + pz * (d / 2 - t / 2));
}
/** A big display screen texture: word-free chart lines, bars and blocks in one colour (no letters). */
function screenMat(color, seed = 1, dayGlow = 0.65) {
  return cached(`screen:${color}:${seed % 6}:${dayGlow}`, () => {
    let s = seed * 31 + 7; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const c = document.createElement('canvas'); c.width = 128; c.height = 128; const g = c.getContext('2d');
    g.fillStyle = '#060912'; g.fillRect(0, 0, 128, 128);
    g.globalAlpha = 0.35; g.fillStyle = color; for (let y = 0; y < 128; y += 16) g.fillRect(0, y, 128, 1); g.globalAlpha = 1;
    // bar chart
    g.fillStyle = color; for (let i = 0; i < 7; i++) { const h = 10 + rnd() * 40; g.fillRect(8 + i * 16, 120 - h, 10, h); }
    // a line graph across the top half
    g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.beginPath(); let y = 40;
    for (let x = 4; x <= 124; x += 12) { y = Math.max(10, Math.min(60, y + (rnd() - 0.45) * 22)); x === 4 ? g.moveTo(x, y) : g.lineTo(x, y); } g.stroke();
    g.strokeStyle = color; g.lineWidth = 4; g.strokeRect(2, 2, 124, 124);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    const m = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: '#ffffff', emissiveIntensity: 1, roughness: 0.5 });
    m.userData.glow = true; m.userData.dayGlow = dayGlow; return m;
  });
}
const FLOORS = (min, max, def) => [{ key: 'floors', label: 'Storeys', min, max, step: 1, def }];

// ---------------------------------------------------------------------------------------------------------------
// Homes
// ---------------------------------------------------------------------------------------------------------------
function buildCourt(p) {
  const g = new THREE.Group(); const y0 = lotPad(g, 2, 2, '#4f5a52');
  // the garden courtyard: lawn, a pond, glowing shrubs, a path out to the street
  cyl(g, 0.46, 0.012, leafMat('#3f8a5a'), 0, y0, 0, { seg: 28 });
  box(g, 0.16, 0.016, 0.62, M('#a7ada4', 0.05, 0.9), 0, y0, 0.64);
  cyl(g, 0.13, 0.018, waterMat(), -0.16, y0, -0.12, { seg: 20 });
  for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.9 + p.R.range(-0.2, 0.2), r = p.R.range(0.22, 0.36); shrub(g, Math.cos(a) * r + 0.06, Math.sin(a) * r, y0 + 0.012, p.R.range(0.045, 0.07), p.R); }
  tree(g, 0.14, 0.1, y0 + 0.012, 1.1, p.R);
  // the ring of domed pods (the front slot stays open for the path)
  const slots = [[-0.64, -0.64], [0, -0.7], [0.64, -0.64], [0.7, 0], [0.62, 0.62], [-0.62, 0.62], [-0.7, 0]];
  const skip = p.R.int(0, slots.length - 1);
  slots.forEach(([x, z], i) => {
    if (i === skip && p.R.chance(0.5)) { tree(g, x, z, y0, 1.3, p.R); return; }
    const top = roundTower(g, { r: 0.19, floors: p.floors, x, z, y: y0, style: p.style, kind: 'bands', seed: p.seed + i, seg: 12, lit: 0.5 });
    dome(g, 0.19, bodyMat(p.style, i), x, top, z, { squash: 0.65 });
    ball(g, 0.025, neonMat(neonOf(p, i), 0.4), x, top + 0.13, z, 8);
    // a door facing the garden, with its light
    const a = Math.atan2(-z, -x), dx = Math.cos(a) * 0.185, dz = Math.sin(a) * 0.185;
    tbox(g, 0.07, 0.14, 0.02, M('#2a2f38', 0.4, 0.5), x + dx, y0, z + dz, -a + Math.PI / 2);
    tbox(g, 0.04, 0.016, 0.02, neonMat(neonOf(p, i + 1), 0.45), x + dx * 1.08, y0 + 0.155, z + dz * 1.08, -a + Math.PI / 2);
  });
  lampPost(g, 0.14, 0.9, y0); lampPost(g, -0.14, 0.9, y0);
  return g;
}

function buildDuplex(p) {
  const g = new THREE.Group(); const y0 = lotPad(g, 2, 1, '#55605a');
  const curved = p.seed % 2 === 1;
  const roofM = curved ? bodyMat(p.style, 1) : M(p.R.pick(['#6b4f46', '#4d5a6e', '#5e6b5a', '#7a5a3c']), 0.2, 0.7);
  for (const side of [-1, 1]) {
    const x = side * 0.4, w = 0.78, z = -0.15, d = 0.48;
    const top = storeys(g, { w, d, floors: p.floors, x, z, y: y0, style: p.style, kind: 'grid', seed: p.seed + side, bay: 0.15 });
    if (curved) barrel(g, w + 0.03, d / 2 + 0.03, roofM, x, top, z, { squash: 0.55 });
    else gable(g, d + 0.06, w + 0.03, 0.16, roofM, x, top, z, true);
    // a solar panel or chimney on the roof
    if (p.R.chance(0.5)) { const pm = M('#22324a', 0.6, 0.3); const pnl = box(g, 0.24, 0.012, 0.14, pm, x - side * 0.12, top + 0.06, z + 0.08); pnl.rotation.x = 0.55; }
    else box(g, 0.06, 0.16, 0.06, M('#7d6a5e', 0.1, 0.8), x + side * 0.22, top, z - 0.1);
    // the front garden, a path to the door, a porch canopy, a door light
    const dx = x + side * 0.2;
    box(g, 0.74, 0.012, 0.3, leafMat('#3f8a5a'), x, y0, 0.27);
    box(g, 0.1, 0.016, 0.34, M('#a7ada4', 0.05, 0.9), dx, y0, 0.26);
    door(g, dx, y0, z + d / 2, neonOf(p, side > 0 ? 1 : 0));
    box(g, 0.16, 0.014, 0.08, trimMat(p.style), dx, y0 + 0.17, z + d / 2 + 0.04);
    box(g, 0.2, 0.08, 0.012, lamp('#2b4766', '#ffd98a'), x - side * 0.1, y0 + 0.06, z + d / 2 + 0.004);   // picture window
    shrub(g, x - side * 0.2, 0.3, y0 + 0.012, 0.06, p.R);
    shrub(g, x - side * 0.32, 0.4, y0 + 0.012, 0.04, p.R);
    box(g, 0.5, 0.04, 0.04, leafMat('#2f7a52'), x - side * 0.08, y0, 0.44);                        // hedge (gap at the path)
  }
  box(g, 0.02, 0.08, 0.5, trimMat(p.style), 0, y0, 0.2);                                             // garden divider
  return g;
}

function buildTownhouse(p) {
  const g = new THREE.Group(); const y0 = lotPad(g, 1, 1, '#59616c');
  const s = p.seed % 2 ? 1 : -1;               // which side the garden is on
  const x = -s * 0.08, w = 0.5, z = -0.1, d = 0.6;
  const top = storeys(g, { w, d, floors: p.floors, x, z, y: y0, style: p.style, kind: 'grid', seed: p.seed, bay: 0.16 });
  const fz = z + d / 2;
  // the bay window: a glass box sticking out from the first floor up
  const bx = x - s * 0.1;
  if (p.floors >= 2) {
    const bh = (p.floors - 1) * FLOOR - 0.05;
    box(g, 0.2, 0.02, 0.1, trimMat(p.style), bx, y0 + FLOOR, fz + 0.04);
    box(g, 0.18, bh, 0.08, lamp(STYLES[p.style].glass, '#a8865a'), bx, y0 + FLOOR + 0.02, fz + 0.04);
    box(g, 0.2, 0.02, 0.1, trimMat(p.style), bx, y0 + FLOOR + 0.02 + bh, fz + 0.04);
  }
  // the porch: steps, a canopy on two posts, a porch light
  const dx = x + s * 0.12;
  door(g, dx, y0 + 0.02, fz, WARM);
  box(g, 0.14, 0.02, 0.1, M('#9aa29a', 0.05, 0.9), dx, y0, fz + 0.05);
  box(g, 0.18, 0.014, 0.13, trimMat(p.style), dx, y0 + FLOOR * 0.85, fz + 0.065);
  for (const ox of [-0.08, 0.08]) cyl(g, 0.006, FLOOR * 0.85, trimMat(p.style), dx + ox, y0, fz + 0.12, { seg: 5 });
  box(g, 0.02, 0.025, 0.02, neonMat(neonOf(p), 0.5), dx + s * 0.065, y0 + 0.12, fz + 0.015);
  // the roof deck: a rail, a little canopy over two chairs, string lights
  slab(g, w + 0.03, d + 0.03, p.style, x, top, z, 0.025);
  const ry = top + 0.025;
  railing(g, w, d, x, ry, z, trimMat(p.style));
  const cx = x + s * 0.08, cz = z - 0.1;
  for (const [ox, oz] of [[-0.1, -0.08], [0.1, -0.08], [-0.1, 0.08], [0.1, 0.08]]) cyl(g, 0.006, 0.13, trimMat(p.style), cx + ox, ry, cz + oz, { seg: 5 });
  box(g, 0.24, 0.014, 0.2, M(p.R.pick(['#c95f4a', '#3f8fa8', '#d6a12c', '#7a5fd0']), 0.1, 0.7), cx, ry + 0.13, cz);
  box(g, 0.24, 0.008, 0.008, neonMat(WARM, 0.3), cx, ry + 0.12, cz + 0.1);
  for (const ox of [-0.05, 0.05]) box(g, 0.05, 0.04, 0.05, M('#e8e2d6', 0.1, 0.7), cx + ox, ry, cz);
  shrub(g, x - s * 0.15, z + 0.15, ry, 0.04, p.R);
  // the side garden
  const gx = s * 0.33;
  box(g, 0.24, 0.012, 0.8, leafMat('#3f8a5a'), gx, y0, 0);
  tree(g, gx, -0.2, y0 + 0.012, 1.1, p.R);
  shrub(g, gx, 0.18, y0 + 0.012, 0.06, p.R);
  return g;
}

function buildWalkup(p) {
  const g = new THREE.Group(); const y0 = lotPad(g, 2, 2, '#59616c');
  const lshape = p.seed % 2 === 0;
  const side = Math.max(2, p.floors - 1);
  const wings = [[0, -0.6, 1.72, 0.5, p.floors], [-0.62, 0.13, 0.48, 0.94, side]];
  if (!lshape) wings.push([0.62, 0.13, 0.48, 0.94, side]);
  // the courtyard first (under everything)
  box(g, lshape ? 1.3 : 0.7, 0.012, 0.9, leafMat('#3f8a5a'), lshape ? 0.25 : 0, y0, 0.2);
  box(g, 0.14, 0.016, 1.1, M('#a7ada4', 0.05, 0.9), 0, y0, 0.4);
  wings.forEach(([x, z, w, d, f], i) => {
    const top = storeys(g, { w, d, floors: f, x, z, y: y0, style: p.style, kind: i ? 'grid' : 'bands', seed: p.seed + i });
    balconies(g, w, d, y0, f, p.style, 1, x, z);
    slab(g, w + 0.03, d + 0.03, p.style, x, top, z, 0.025);
    // a roof garden: planter beds with shrubs
    box(g, w - 0.12, 0.03, d - 0.12, leafMat('#357a4e'), x, top + 0.025, z);
    const n = Math.round(w * d * 8) + 1;
    for (let k = 0; k < n; k++) shrub(g, x + p.R.range(-w / 2 + 0.1, w / 2 - 0.1), z + p.R.range(-d / 2 + 0.1, d / 2 - 0.1), top + 0.055, p.R.range(0.035, 0.055), p.R);
    // doors onto the courtyard
    if (i === 0) for (const dx of [-0.2, 0.2]) door(g, dx, y0, z + d / 2, neonOf(p, 1));
    else door(g, x, y0, z + d / 2, neonOf(p, i));
  });
  // stair towers at the inner corners: glass shafts a storey taller than the wings, a glowing stripe up the front
  const stairs = lshape ? [-1] : [-1, 1];
  for (const sx of stairs) {
    const x = sx * 0.29, z = -0.27;
    const h = (p.floors + 1) * FLOOR;
    box(g, 0.14, h, 0.13, glassMat(p.style), x, y0, z);
    for (let k = 1; k <= p.floors; k++) box(g, 0.15, 0.015, 0.14, trimMat(p.style), x, y0 + k * FLOOR, z);
    box(g, 0.025, h - 0.06, 0.012, neonMat(neonOf(p), 0.4), x, y0 + 0.03, z + 0.07);
    box(g, 0.16, 0.03, 0.15, trimMat(p.style), x, y0 + h, z);
  }
  // the courtyard: trees, a bench, a front gate between low walls
  if (lshape) { tree(g, 0.62, -0.1, y0 + 0.012, 1.4, p.R); tree(g, 0.55, 0.45, y0 + 0.012, 1.2, p.R); shrub(g, 0.3, 0.2, y0 + 0.012, 0.07, p.R); }
  else { tree(g, -0.2, 0.05, y0 + 0.012, 1.2, p.R); shrub(g, 0.2, 0.3, y0 + 0.012, 0.06, p.R); }
  box(g, 0.2, 0.04, 0.05, M('#8a6a4a', 0.1, 0.8), 0.22, y0, -0.1);
  for (const sx of [-1, 1]) { box(g, 0.6, 0.07, 0.04, trimMat(p.style), sx * 0.4, y0, 0.9); box(g, 0.03, 0.03, 0.03, neonMat(neonOf(p, 2), 0.5), sx * 0.11, y0 + 0.07, 0.9); }
  return g;
}

function buildSlim(p) {
  const g = new THREE.Group(); const y0 = lotPad(g, 1, 1, '#5d6470');
  let y = storeys(g, { w: 0.84, d: 0.84, floors: 1, y: y0, style: p.style, kind: 'curtain', seed: p.seed });
  box(g, 0.36, 0.02, 0.07, neonMat(neonOf(p), 0.55), 0, y0 + FLOOR * 0.8, 0.44);   // lobby canopy
  y = slab(g, 0.88, 0.88, p.style, 0, y, 0, 0.03);
  const f = p.floors - 1, w = 0.58;
  const top = storeys(g, { w, d: w, floors: f, y, style: p.style, kind: 'grid', seed: p.seed + 1 });
  balconies(g, w, w, y, f, p.style, 1);
  // a glowing stripe up the front corner
  box(g, 0.02, f * FLOOR - 0.04, 0.02, neonMat(neonOf(p, 1), 0.35), w / 2 - 0.01, y + 0.02, w / 2 + 0.002);
  // planters on the podium roof
  for (const [px, pz] of [[-0.36, 0.36], [0.36, -0.36], [-0.36, -0.36]]) shrub(g, px, pz, y, 0.045, p.R);
  // the lit crown: a slab, a glass lantern, a ring, a mast
  let c = slab(g, w + 0.04, w + 0.04, p.style, 0, top, 0, 0.03);
  neonEdges(g, w, w, neonOf(p), 0, c, 0, 0.02, 0.4);
  c = storeys(g, { w: 0.36, d: 0.36, floors: 1, y: c, style: p.style, kind: 'curtain', seed: p.seed + 2, lit: 0.9 });
  cyl(g, 0.22, 0.04, trimMat(p.style), 0, c, 0, { rt: 0.16, seg: 16 });
  flatRing(g, 0.2, 0.012, neonMat(neonOf(p, 2), 0.5), 0, c + 0.02, 0);
  cyl(g, 0.01, 0.25, trimMat(p.style), 0, c + 0.04, 0, { seg: 6 });
  beacon(g, 0, c + 0.29, 0, RED, 0.03);
  return g;
}

function buildMidrise(p) {
  const g = new THREE.Group(); const y0 = lotPad(g, 2, 1, '#5d6470');
  // the ground floor: shopfront glass along the street, entrances lit
  let y = storeys(g, { w: 1.84, d: 0.74, floors: 1, y: y0, z: -0.06, style: p.style, kind: 'curtain', seed: p.seed });
  for (const dx of [-0.5, 0.5]) box(g, 0.24, 0.02, 0.08, neonMat(neonOf(p), 0.5), dx, y0 + FLOOR * 0.8, 0.35);
  y = slab(g, 1.86, 0.76, p.style, 0, y, -0.06, 0.03);
  // the bar, stepped down to the right at the top
  const steps = p.floors >= 8 ? 2 : 1, body = p.floors - 1 - steps;
  const w = 1.76, d = 0.62, z = -0.08;
  let top = body > 0 ? storeys(g, { w, d, floors: body, y, z, style: p.style, kind: 'bands', seed: p.seed + 1 }) : y;
  if (body > 0) balconies(g, w, d, y, body, p.style, 2, 0, z);
  const tops = [];
  let sw = w;
  for (let i = 0; i < steps; i++) {
    const lw = sw * (i === 0 ? 0.62 : 0.6), lx = -w / 2 + lw / 2;
    tops.push([top, sw]);
    slab(g, sw + 0.02, d + 0.02, p.style, -w / 2 + sw / 2, top, z, 0.02);
    top = storeys(g, { w: lw, d, floors: 1, x: lx, y: top + 0.02, z, style: p.style, kind: 'bands', seed: p.seed + 2 + i });
    sw = lw;
  }
  slab(g, sw + 0.03, d + 0.03, p.style, -w / 2 + sw / 2, top, z, 0.03);
  roofProps(g, sw * 0.8, d * 0.7, top + 0.03, p.style, p.R, { x: -w / 2 + sw / 2, z, antenna: false });
  // the roof terrace on the first step: planters, sun shades, a glowing rail
  const [ty, tw] = tops[0], ex0 = -w / 2 + tw * 0.62, ex1 = w / 2, tx = (ex0 + ex1) / 2, tlen = ex1 - ex0;
  const fy = ty + 0.02;
  railing(g, tlen - 0.02, d - 0.02, tx, fy, z, neonMat(neonOf(p, 1), 0.3), 0.035);
  for (let k = 0; k < 2; k++) {
    const ux = tx + (k - 0.5) * tlen * 0.45;
    cyl(g, 0.006, 0.12, M(DARK), ux, fy, z, { seg: 5 });
    cyl(g, 0.1, 0.04, M(p.R.pick(['#c95f4a', '#3f8fa8', '#d6a12c', '#e8e2d6']), 0.1, 0.7), ux, fy + 0.1, z, { rt: 0.005, seg: 10 });
  }
  box(g, tlen * 0.8, 0.04, 0.06, leafMat('#357a4e'), tx, fy, z - d / 2 + 0.06);
  for (let k = 0; k < 3; k++) shrub(g, tx + (k - 1) * tlen * 0.3, z - d / 2 + 0.06, fy + 0.04, 0.035, p.R);
  return g;
}

function buildNeedle(p) {
  const g = new THREE.Group(); const y0 = lotPad(g, 1, 1, '#5d6470');
  // a round podium, then the octagonal needle tapering up, glowing collars every few floors
  let y = roundTower(g, { r: 0.44, floors: 1, y: y0, style: p.style, kind: 'curtain', seed: p.seed, seg: 8 });
  y = slab(g, 0, 0, p.style, 0, y, 0, 0);
  cyl(g, 0.45, 0.03, trimMat(p.style), 0, y, 0, { seg: 8 }); y += 0.03;
  box(g, 0.24, 0.02, 0.06, neonMat(neonOf(p), 0.55), 0, y0 + FLOOR * 0.8, 0.42);
  const f = p.floors - 1, r0 = 0.28, r1 = 0.2;
  const top = roundTower(g, { r: r0, rt: r1, floors: f, y, style: p.style, kind: p.seed % 2 ? 'bands' : 'curtain', seed: p.seed + 1, seg: 8 });
  const every = f > 20 ? 6 : 4, ring = neonMat(neonOf(p, 1), 0.45);
  for (let k = every; k < f; k += every) { const t = k / f; cyl(g, r0 + (r1 - r0) * t + 0.02, 0.025, ring, 0, y + k * FLOOR - 0.012, 0, { seg: 8 }); }
  cyl(g, r1 + 0.02, 0.03, trimMat(p.style), 0, top, 0, { seg: 8 });
  cyl(g, r1 + 0.025, 0.02, ring, 0, top + 0.03, 0, { seg: 8 });
  // the spire
  cyl(g, r1, 0.3, glassMat(p.style), 0, top + 0.05, 0, { rt: 0.04, seg: 8 });
  cyl(g, 0.012, 0.45, trimMat(p.style), 0, top + 0.35, 0, { seg: 6 });
  beacon(g, 0, top + 0.8, 0, RED, 0.03);
  return g;
}

function buildTwin(p) {
  const g = new THREE.Group(); const y0 = lotPad(g, 2, 1, '#5d6470');
  let y = storeys(g, { w: 1.84, d: 0.8, floors: 2, y: y0, z: -0.04, style: p.style, kind: 'curtain', seed: p.seed });
  box(g, 0.5, 0.02, 0.06, neonMat(neonOf(p), 0.55), -0.2, y0 + FLOOR * 0.85, 0.39);
  y = slab(g, 1.88, 0.84, p.style, 0, y, -0.04, 0.03);
  neonEdges(g, 1.84, 0.8, neonOf(p), 0, y - 0.015, -0.04, 0.02, 0.35);
  const fa = p.floors - 2, fb = Math.max(4, Math.round(fa * 0.66));
  // tower A (tall, square, setback crown)
  const ax = -0.48, aw = 0.7, ad = 0.6;
  const atop = storeys(g, { w: aw, d: ad, floors: fa, x: ax, y, z: -0.06, style: p.style, kind: 'grid', seed: p.seed + 1 });
  balconies(g, aw, ad, y, fa, p.style, 3, ax, -0.06);
  let c = slab(g, aw + 0.04, ad + 0.04, p.style, ax, atop, -0.06, 0.03);
  neonEdges(g, aw, ad, neonOf(p, 1), ax, c, -0.06, 0.02, 0.4);
  c = storeys(g, { w: 0.42, d: 0.36, floors: 2, x: ax, y: c, z: -0.06, style: p.style, kind: 'curtain', seed: p.seed + 3, lit: 0.8 });
  c = slab(g, 0.46, 0.4, p.style, ax, c, -0.06, 0.03);
  cyl(g, 0.012, 0.5, trimMat(p.style), ax, c, -0.06, { seg: 6 }); beacon(g, ax, c + 0.5, -0.06);
  // tower B (shorter, rounder top)
  const bx = 0.52, bw = 0.62, bd = 0.52;
  const btop = storeys(g, { w: bw, d: bd, floors: fb, x: bx, y, z: -0.06, style: p.style, kind: 'bands', seed: p.seed + 2 });
  balconies(g, bw, bd, y, fb, p.style, 2, bx, -0.06);
  c = slab(g, bw + 0.04, bd + 0.04, p.style, bx, btop, -0.06, 0.03);
  dome(g, 0.24, glassMat(p.style), bx, c, -0.06, { squash: 0.6 });
  flatRing(g, 0.245, 0.014, neonMat(neonOf(p, 2), 0.45), bx, c + 0.01, -0.06);
  // the sky bridge between them
  const by = y + Math.max(2, Math.round(fb * 0.7)) * FLOOR;
  box(g, 0.4, 0.13, 0.2, glassMat(p.style), 0.03, by, -0.06);
  for (const dy of [0, 0.13]) box(g, 0.4, 0.015, 0.21, trimMat(p.style), 0.03, by + dy - 0.005, -0.06);
  box(g, 0.4, 0.012, 0.012, neonMat(neonOf(p, 2), 0.5), 0.03, by + 0.06, 0.045);
  return g;
}

// ---------------------------------------------------------------------------------------------------------------
// Shops & offices
// ---------------------------------------------------------------------------------------------------------------
function buildKiosks(p) {
  const g = new THREE.Group(); const y0 = lotPad(g, 2, 1, '#62666f');
  const n = 5, step = 0.35;
  box(g, 1.84, 0.12, 0.08, trimMat(p.style), 0, y0, -0.42);                         // back wall
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * step, z = -0.13, w = 0.3, d = 0.38, h = FLOOR * p.R.range(0.85, 1.05);
    box(g, w, h, d, bodyMat(p.style, i), x, y0, z);
    box(g, w * 0.8, h * 0.55, 0.012, lamp(STYLES[p.style].glass, WARM), x, y0 + 0.05, z + d / 2 + 0.003);   // serving hatch
    box(g, w * 0.86, 0.035, 0.05, trimMat(p.style), x, y0 + 0.04, z + d / 2 + 0.025);                     // counter
    // the glowing awning, tilted down toward the street
    const aw = box(g, w + 0.02, 0.015, 0.15, neonMat(neonOf(p, i), 0.6), x, y0 + h - 0.02, z + d / 2 + 0.06); aw.rotation.x = 0.3;
    let ty = y0 + h;
    if (p.floors >= 2 && i % 2 === p.seed % 2) {   // a little flat above every other kiosk
      ty = storeys(g, { w: w * 0.9, d: d * 0.85, floors: 1, x, z: z - 0.02, y: ty, style: p.style, kind: 'bands', seed: p.seed + i, bay: 0.14 });
    }
    const roof = (i + p.seed) % 3;
    if (roof === 0) dome(g, 0.13, bodyMat(p.style, i + 1), x, ty, z, { squash: 0.5 });
    else if (roof === 1) slab(g, w + 0.02, d + 0.02, p.style, x, ty, z, 0.025);
    else gable(g, w + 0.02, d, 0.07, trimMat(p.style), x, ty, z);
    // a holo panel standing on the roof (word-free pattern)
    if (roof !== 0) box(g, 0.2, 0.11, 0.012, screenMat(neonOf(p, i + 1), p.seed + i), x, ty + 0.03, z - 0.05);
  }
  // stools and tables out front, a holo menu stand at each end
  for (let i = 0; i < 4; i++) {
    const x = (i - 1.5) * 0.42;
    cyl(g, 0.045, 0.06, trimMat(p.style), x, y0, 0.3, { seg: 10 });
    for (const dx of [-0.07, 0.07]) cyl(g, 0.018, 0.035, bodyMat(p.style, 2), x + dx, y0, 0.3, { seg: 8 });
  }
  for (const x of [-0.88, 0.88]) { box(g, 0.02, 0.1, 0.02, M(DARK), x, y0, 0.36); box(g, 0.08, 0.1, 0.012, screenMat(neonOf(p, 2), p.seed + 5), x, y0 + 0.1, 0.36); }
  return g;
}

function buildMart(p) {
  const g = new THREE.Group(); const y0 = lotPad(g, 2, 2, '#5d6268');
  const h = FLOOR * 1.35 * p.floors, z = -0.42, d = 1.04, w = 1.8, fz = z + d / 2;
  // the big box: plain walls, a band of glass along the front, a parapet with a glowing stripe
  box(g, w, h, d, bodyMat(p.style, 0), 0, y0, z);
  box(g, w - 0.1, 0.06, 0.015, M(p.R.pick(['#c95f4a', '#3f8fa8', '#d6a12c', '#5f9e6a']), 0.2, 0.6), 0, y0 + h - 0.1, fz + 0.005);
  box(g, 0.9, FLOOR * 0.8, 0.015, lamp(STYLES[p.style].glass, '#ffe9b8'), -0.2, y0, fz + 0.005);
  for (let k = 0; k < 6; k++) box(g, 0.012, FLOOR * 0.8, 0.02, trimMat(p.style), -0.65 + k * 0.18, y0, fz + 0.01);
  box(g, w + 0.02, 0.04, d + 0.02, trimMat(p.style), 0, y0 + h, z);
  box(g, w, 0.015, 0.015, neonMat(neonOf(p), 0.4), 0, y0 + h + 0.02, fz + 0.015);
  if (p.floors >= 2) for (let k = 0; k < 5; k++) box(g, 0.24, 0.08, 0.012, lamp(STYLES[p.style].glass, '#ffd98a'), -0.7 + k * 0.35, y0 + FLOOR * 1.6, fz + 0.004);
  // the entrance canopy
  box(g, 1.0, 0.025, 0.18, trimMat(p.style), -0.2, y0 + FLOOR * 0.85, fz + 0.09);
  neonEdges(g, 1.0, 0.18, neonOf(p, 1), -0.2, y0 + FLOOR * 0.85 + 0.012, fz + 0.09, 0.015, 0.5);
  roofProps(g, w * 0.8, d * 0.7, y0 + h + 0.04, p.style, p.R, { z, antenna: false });
  // the forecourt: bays, a few hover cars, lamp posts
  box(g, 1.9, 0.008, 0.8, M('#3d4249', 0.1, 0.9), 0, y0, 0.53);
  const lineM = M('#e8e8e0', 0.05, 0.8);
  for (let k = 0; k < 7; k++) box(g, 0.012, 0.004, 0.24, lineM, -0.85 + k * 0.22, y0 + 0.008, 0.42);
  for (let k = 0; k < 7; k++) box(g, 0.012, 0.004, 0.24, lineM, -0.85 + k * 0.22, y0 + 0.008, 0.78);
  const colours = ['#c95f4a', '#e8e2d6', '#3f74c8', '#2f2f36', '#d6a12c', '#5f9e6a'];
  for (let k = 0; k < 6; k++) {
    if (!p.R.chance(0.55)) continue;
    const zz = k % 2 ? 0.78 : 0.42, xx = -0.74 + Math.floor(k / 2) * 0.44 + (k % 2) * 0.22;
    hoverCar(g, xx, zz, y0 + 0.012, Math.PI / 2, p.R.pick(colours));
  }
  lampPost(g, -0.92, 0.6, y0, 0.3); lampPost(g, 0.5, 0.6, y0, 0.3);
  // the pylon sign by the street corner: a tall post with a glowing word-free panel
  const ph = 0.45 + p.floors * 0.15;
  box(g, 0.05, ph, 0.05, trimMat(p.style), 0.82, y0, 0.8);
  sign(g, '+x', neonOf(p, 2), p.seed + 3, { x: 0.82, y: y0 + ph - 0.05, z: 0.8, w: 0.2, h: 0.32, depth: 0.06 });
  box(g, 0.08, 0.02, 0.22, neonMat(neonOf(p, 2), 0.6), 0.82, y0 + ph + 0.27, 0.8);
  return g;
}

function buildCorner(p) {
  const g = new THREE.Group(); const y0 = lotPad(g, 1, 1, '#62666f');
  const w = 0.78, d = 0.74, z = -0.06, fz = z + d / 2;
  // the glass shop floor with corner pillars, a sign band and a striped awning
  box(g, w - 0.02, FLOOR, d - 0.02, lamp(STYLES[p.style].glass, '#9a7a50'), 0, y0, z);
  for (const [px, pz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) box(g, 0.04, FLOOR, 0.04, trimMat(p.style), px * (w / 2 - 0.02), y0, z + pz * (d / 2 - 0.02));
  box(g, w, 0.045, d, bodyMat(p.style, 1), 0, y0 + FLOOR - 0.045, z);
  box(g, w - 0.08, 0.025, 0.01, neonMat(neonOf(p), 0.6), 0, y0 + FLOOR - 0.035, fz + 0.002);
  const stripes = [neonOf(p, 1), '#f2efe6'];
  for (let k = 0; k < 6; k++) { const a = box(g, 0.1, 0.012, 0.12, M(stripes[k % 2], 0.1, 0.7), -0.25 + k * 0.1, y0 + FLOOR * 0.72, fz + 0.055); a.rotation.x = 0.35; }
  door(g, 0.3, y0, fz, WARM, { w: 0.08, h: 0.13 });
  let top = y0 + FLOOR;
  if (p.floors > 1) top = storeys(g, { w, d, floors: p.floors - 1, y: top, z, style: p.style, kind: 'grid', seed: p.seed, bay: 0.16 });
  slab(g, w + 0.04, d + 0.04, p.style, 0, top, z, 0.035);
  // the blade sign on the street corner
  const bh = Math.max(0.2, (p.floors - 0.5) * FLOOR * 0.75);
  sign(g, '+x', neonOf(p, 2), p.seed, { x: w / 2 + 0.03, y: y0 + FLOOR * 0.55, z: 0.18, w: 0.12, h: bh, depth: 0.03 });
  // on the roof: a water tank on legs, or a roof sign for a one-storey shop
  const ry = top + 0.035;
  if (p.floors === 1) box(g, 0.4, 0.12, 0.03, screenMat(neonOf(p, 1), p.seed), -0.1, ry, z + 0.2);
  else {
    for (const [ox, oz] of [[-0.06, -0.06], [0.06, -0.06], [-0.06, 0.06], [0.06, 0.06]]) cyl(g, 0.007, 0.07, M(DARK), -0.2 + ox, ry, z - 0.12 + oz, { seg: 5 });
    cyl(g, 0.09, 0.12, M('#8a6a4a', 0.1, 0.8), -0.2, ry + 0.07, z - 0.12, { seg: 14 });
    dome(g, 0.09, M('#6a5038', 0.1, 0.8), -0.2, ry + 0.19, z - 0.12, { squash: 0.4, seg: 14 });
    box(g, 0.12, 0.06, 0.1, trimMat(p.style), 0.2, ry, z - 0.1);
  }
  // a bench and a planter out front
  box(g, 0.16, 0.03, 0.05, M('#8a6a4a', 0.1, 0.8), -0.25, y0, 0.42);
  shrub(g, 0.1, 0.43, y0, 0.04, p.R);
  return g;
}

function buildGallery(p) {
  const g = new THREE.Group(); const y0 = lotPad(g, 2, 2, '#62666f');
  const H = p.floors * FLOOR, wz = -0.12, wd = 1.6;
  // two shop wings with glass shopfronts facing the arcade
  for (const s of [-1, 1]) {
    const x = s * 0.62, w = 0.62;
    const top = storeys(g, { w, d: wd, floors: p.floors, x, z: wz, y: y0, style: p.style, kind: 'bands', seed: p.seed + s });
    box(g, 0.012, FLOOR * 0.8, wd - 0.1, lamp(STYLES[p.style].glass, '#ffe0a8'), x - s * (w / 2 + 0.005), y0, wz);
    for (let k = 0; k < 4; k++) box(g, 0.012, 0.04, 0.3, neonMat(neonOf(p, k + (s > 0 ? 1 : 0)), 0.6), x - s * (w / 2 + 0.01), y0 + FLOOR * 0.8, wz - 0.6 + k * 0.4);
    slab(g, w + 0.04, wd + 0.04, p.style, x, top, wz, 0.03);
    roofProps(g, w * 0.7, wd * 0.7, top + 0.03, p.style, p.R, { x, z: wz, antenna: s > 0 });
  }
  // the arcade: tiled floor, glowing planters down the middle, a glass vault on ribs
  box(g, 0.6, 0.01, wd, M('#b9b4aa', 0.1, 0.7), 0, y0, wz);
  for (let k = 0; k < 3; k++) { const zz = wz - 0.5 + k * 0.5; cyl(g, 0.06, 0.05, trimMat(p.style), 0, y0, zz, { seg: 12 }); shrub(g, 0, zz, y0 + 0.05, 0.05, p.R); }
  const vy = y0 + H, r = 0.31, sq = 0.7;
  barrel(g, wd, r, lamp('#8fb8d8', '#8a6a3c', 0.05), 0, vy, wz, { ry: Math.PI / 2, squash: sq });
  for (let k = 0; k < 6; k++) arch(g, r + 0.004, 0.01, trimMat(p.style), 0, vy, wz - wd / 2 + 0.05 + k * (wd - 0.1) / 5, sq);
  box(g, 0.03, 0.02, wd, trimMat(p.style), 0, vy + r * sq - 0.005, wz);
  // the neon entrance arch at the front of the arcade
  const az = wz + wd / 2 + 0.06, ay = y0 + FLOOR * 0.9;
  for (const s of [-1, 1]) box(g, 0.04, FLOOR * 0.9, 0.04, trimMat(p.style), s * 0.3, y0, az);
  arch(g, 0.3, 0.025, neonMat(neonOf(p, 2), 0.6), 0, ay, az, 0.8);
  // the front plaza
  for (const s of [-1, 1]) { tree(g, s * 0.7, 0.85, y0, 1.1, p.R); lampPost(g, s * 0.42, 0.88, y0, 0.25); }
  return g;
}

function buildStudio(p) {
  const g = new THREE.Group(); const y0 = lotPad(g, 1, 1, '#646b76');
  const x = -0.06, z = -0.06, w = 0.68, d = 0.72;
  // a recessed glass lobby, then the office floors overhanging it
  let y = storeys(g, { w: w - 0.1, d: d - 0.1, floors: 1, x, z: z - 0.05, y: y0, style: p.style, kind: 'curtain', seed: p.seed });
  for (const s of [-1, 1]) box(g, 0.04, FLOOR, 0.04, trimMat(p.style), x + s * (w / 2 - 0.03), y0, z + d / 2 - 0.03);
  y = slab(g, w + 0.02, d + 0.02, p.style, x, y, z, 0.03);
  const top = storeys(g, { w, d, floors: p.floors - 1, x, z, y, style: p.style, kind: p.seed % 2 ? 'louvre' : 'grid', seed: p.seed + 1 });
  // the vertical neon sign down the front, framed in glowing strips
  const sx = x + w / 2 - 0.1, sh = (p.floors - 1) * FLOOR * 0.85;
  sign(g, '+z', neonOf(p), p.seed, { x: sx, y: y + 0.02, z: z + d / 2 + 0.02, w: 0.11, h: sh, depth: 0.025 });
  for (const s of [-1, 1]) box(g, 0.012, sh, 0.012, neonMat(neonOf(p, 1), 0.5), sx + s * 0.065, y + 0.02, z + d / 2 + 0.026);
  // roof: a parapet, a lattice antenna mast with a dish and a beacon
  const r0 = slab(g, w + 0.04, d + 0.04, p.style, x, top, z, 0.035);
  neonEdges(g, w, d, neonOf(p, 1), x, r0, z, 0.018, 0.35);
  const mh = 0.45 + p.floors * 0.025, mx = x - 0.12, mz = z - 0.1, lm = M(STEEL, 0.6, 0.4);
  for (const [ax, az] of [[-0.05, -0.05], [0.05, -0.05], [0, 0.05]]) rod(g, [mx + ax, r0, mz + az], [mx, r0 + mh, mz], 0.007, lm, 5);
  for (const t of [0.3, 0.6]) box(g, 0.1 * (1 - t), 0.008, 0.1 * (1 - t), lm, mx, r0 + mh * t, mz);
  beacon(g, mx, r0 + mh, mz, RED, 0.03);
  const dg = new THREE.Group(); dg.position.set(x + 0.15, r0 + 0.08, z + 0.05); dg.rotation.set(-0.6, 0.6, 0, 'YXZ'); g.add(dg);
  dome(dg, 0.09, M('#e9edf1', 0.4, 0.4), 0, 0, 0, { squash: 0.35, seg: 16 }).rotation.x = Math.PI;
  cyl(g, 0.015, 0.08, M(DARK), x + 0.15, r0, z + 0.05, { seg: 6 });
  shrub(g, 0.36, 0.38, y0, 0.05, p.R);
  return g;
}

function buildCapsule(p) {
  const g = new THREE.Group(); const y0 = lotPad(g, 2, 1, '#5d6470');
  const w = 1.8, d = 0.66, z = -0.12, fz = z + d / 2;
  let y = storeys(g, { w: w - 0.06, d: d - 0.04, floors: 1, y: y0, z, style: p.style, kind: 'curtain', seed: p.seed });
  y = slab(g, w + 0.02, d + 0.02, p.style, 0, y, z, 0.03);
  const f = p.floors - 1;
  const top = storeys(g, { w, d, floors: f, y, z, style: p.style, kind: 'grid', seed: p.seed + 1 });
  // the front: a plain panel wall carrying rows of round glowing capsule windows
  box(g, w, f * FLOOR, 0.012, bodyMat(p.style, 2), 0, y, fz + 0.004);
  const cols = 11, gap = (w - 0.12) / cols, glows = ['#ffd98a', '#9fd4ff', '#ff9fd8', '#b6ff9f', '#ffe9b8'];
  const dark = M('#1f2a3a', 0.6, 0.3), rim = trimMat(p.style);
  for (let r = 0; r < f; r++) for (let c = 0; c < cols; c++) {
    const cx = -w / 2 + 0.06 + gap * (c + 0.5), cy = y + r * FLOOR + FLOOR / 2;
    zcyl(g, 0.065, 0.03, rim, cx, cy, fz + 0.025, 14);
    zcyl(g, 0.05, 0.012, p.R.chance(0.7) ? lamp('#2b4766', p.R.pick(glows)) : dark, cx, cy, fz + 0.042, 14);
  }
  // the roof: rounded parapet ends, vents, a wide glowing roof sign
  const ry = slab(g, w + 0.04, d + 0.04, p.style, 0, top, z, 0.035);
  for (let k = 0; k < 5; k++) cyl(g, 0.04, 0.05, trimMat(p.style), -0.6 + k * 0.3, ry, z - 0.18, { seg: 10 });
  box(g, 0.9, 0.18, 0.03, screenMat(neonOf(p), p.seed), 0, ry, z + 0.18);
  box(g, 0.94, 0.02, 0.04, trimMat(p.style), 0, ry + 0.18, z + 0.18);
  // the lobby canopy on two posts with glowing edges
  box(g, 0.7, 0.025, 0.16, trimMat(p.style), 0, y0 + FLOOR * 0.82, fz + 0.08);
  neonEdges(g, 0.7, 0.16, neonOf(p, 1), 0, y0 + FLOOR * 0.82 + 0.012, fz + 0.08, 0.015, 0.5);
  for (const s of [-1, 1]) cyl(g, 0.008, FLOOR * 0.82, trimMat(p.style), s * 0.32, y0, fz + 0.14, { seg: 6 });
  for (const s of [-1, 1]) shrub(g, s * 0.75, 0.38, y0, 0.05, p.R);
  return g;
}

function buildSpire(p) {
  const g = new THREE.Group(); const y0 = lotPad(g, 1, 1, '#646b76');
  let y = storeys(g, { w: 0.76, d: 0.76, floors: 1, y: y0, style: p.style, kind: 'curtain', seed: p.seed });
  box(g, 0.3, 0.02, 0.06, neonMat(neonOf(p), 0.55), 0, y0 + FLOOR * 0.82, 0.41);
  y = slab(g, 0.8, 0.8, p.style, 0, y, 0, 0.03);
  // three tapering glass sections with glowing collars at the setbacks (seg 4 turned π/4 = a square)
  const f = p.floors - 1, parts = [[0.45, 0.4, 0.45], [0.36, 0.31, 0.33], [0.28, 0.2, 0.22]];
  let left = f;
  parts.forEach(([r, rt, share], i) => {
    const n = i === 2 ? left : Math.max(1, Math.round(f * share)); left -= n;
    if (n <= 0) return;
    const top = roundTower(g, { r, rt, floors: n, y, style: p.style, kind: 'curtain', seed: p.seed + i, seg: 4, ry: Math.PI / 4, lit: 0.4 });
    const half = rt / Math.SQRT2;
    if (i < 2) { box(g, half * 2 + 0.03, 0.025, half * 2 + 0.03, trimMat(p.style), 0, top, 0); neonEdges(g, half * 2, half * 2, neonOf(p, i), 0, top + 0.012, 0, 0.015, 0.4); y = top + 0.025; }
    else y = top;
  });
  // the crown: four ribs to a needle mast, a glowing ring, the beacon
  const hw = 0.2 / Math.SQRT2, lm = trimMat(p.style);
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) rod(g, [sx * hw, y, sz * hw], [0, y + 0.3, 0], 0.008, lm, 5);
  flatRing(g, 0.08, 0.012, neonMat(neonOf(p, 2), 0.5), 0, y + 0.15, 0);
  cyl(g, 0.012, 0.55, lm, 0, y + 0.3, 0, { seg: 6 });
  beacon(g, 0, y + 0.85, 0, RED, 0.035);
  for (const [px, pz] of [[-0.4, 0.42], [0.42, -0.4]]) shrub(g, px, pz, y0, 0.04, p.R);
  return g;
}

function buildExchange(p) {
  const g = new THREE.Group(); const y0 = lotPad(g, 2, 1, '#646b76');
  let y = storeys(g, { w: 1.84, d: 0.84, floors: 2, y: y0, z: -0.04, style: p.style, kind: 'curtain', seed: p.seed });
  box(g, 0.6, 0.025, 0.05, neonMat(neonOf(p), 0.55), 0.3, y0 + FLOOR * 0.85, 0.4);
  y = slab(g, 1.88, 0.86, p.style, 0, y, -0.04, 0.035);
  // the slab in three setbacks stepping to the left
  const f = p.floors - 2, secs = [[1.56, 0.64, 0, 0.55], [1.12, 0.58, -0.18, 0.3], [0.72, 0.52, -0.36, 0]];
  let left = f, last = null;
  secs.forEach(([w, d, x, share], i) => {
    const n = i === 2 ? left : Math.max(1, Math.round(f * share)); left -= n;
    if (n <= 0) return;
    const top = storeys(g, { w, d, floors: n, x, y, z: -0.06, style: p.style, kind: i === 1 ? 'louvre' : 'curtain', seed: p.seed + i });
    // big screens: one on the front face, one on the right face
    const sh = Math.min(n * FLOOR * 0.7, 1.6);
    if (n >= 3) {
      box(g, w * 0.55, sh, 0.015, screenMat(neonOf(p, i), p.seed + i), x - w * 0.12, y + (n * FLOOR - sh) / 2, -0.06 + d / 2 + 0.008);
      box(g, 0.015, sh * 0.8, d * 0.6, screenMat(neonOf(p, i + 1), p.seed + i + 3), x + w / 2 + 0.008, y + (n * FLOOR - sh * 0.8) / 2, -0.06);
    }
    y = slab(g, w + 0.04, d + 0.04, p.style, x, top, -0.06, 0.03);
    neonEdges(g, w, d, neonOf(p, i), x, y - 0.015, -0.06, 0.018, 0.35);
    last = [w, d, x];
  });
  const [w, d, x] = last;
  roofProps(g, w * 0.8, d * 0.8, y, p.style, p.R, { x, z: -0.06, helipad: p.floors >= 30, antenna: true });
  return g;
}

// ---------------------------------------------------------------------------------------------------------------
// Industry
// ---------------------------------------------------------------------------------------------------------------
/** A roll-up door on a +z wall with a glowing frame. */
function rollDoor(parent, x, y, zFace, w, h, glow) {
  box(parent, w, h, 0.012, M('#3b4149', 0.5, 0.6), x, y, zFace + 0.003);
  for (let k = 1; k < 5; k++) box(parent, w, 0.004, 0.016, M('#2a2f36'), x, y + k * h / 5, zFace + 0.004);
  const n = neonMat(glow, 0.5);
  box(parent, w + 0.03, 0.016, 0.018, n, x, y + h, zFace + 0.006);
  for (const s of [-1, 1]) box(parent, 0.016, h, 0.018, n, x + s * (w / 2 + 0.008), y, zFace + 0.006);
}

function buildShed(p) {
  const g = new THREE.Group(); const y0 = lotPad(g, 1, 1, '#575d63');
  const x = -0.06, z = -0.12, w = 0.64, d = 0.58, fz = z + d / 2;
  const top = storeys(g, { w, d, floors: p.floors, x, z, y: y0, style: p.style, kind: 'louvre', seed: p.seed, lit: 0.25 });
  const roofM = M(p.style === 'copper' ? '#8a5a3c' : '#8d969f', 0.55, 0.4);
  gable(g, w + 0.05, d + 0.04, 0.13, roofM, x, top, z);
  // the roof vent: a turbine on the ridge
  cyl(g, 0.03, 0.06, M(STEEL, 0.6, 0.4), x - 0.1, top + 0.09, z - 0.05, { seg: 10 });
  dome(g, 0.04, M('#b8c0c8', 0.6, 0.35), x - 0.1, top + 0.15, z - 0.05, { squash: 0.8, seg: 12 });
  // the roll-up door, a work light
  rollDoor(g, x, y0, fz, 0.3, Math.min(0.18, p.floors * FLOOR - 0.04), neonOf(p));
  box(g, 0.04, 0.02, 0.03, neonMat(WARM, 0.4), x + 0.24, y0 + 0.17, fz + 0.015);
  box(g, 0.36, 0.012, 0.1, M('#8e9496', 0.1, 0.9), x, y0, fz + 0.05);
  hazardBar(g, 0.36, x, y0 + 0.012, fz + 0.1, { h: 0.006, d: 0.012 });
  // crates by the side, a pallet out front
  const cx = 0.38;
  let cy = crate(g, cx, y0, -0.25, 0.09, p.R.pick(CRATE));
  if (p.R.chance(0.6)) crate(g, cx, cy, -0.25, 0.07, p.R.pick(CRATE));
  crate(g, cx, y0, -0.08, 0.08, p.R.pick(CRATE));
  crate(g, cx - 0.01, y0, 0.32, 0.08, p.R.pick(CRATE));
  box(g, 0.14, 0.02, 0.12, M('#a8875a', 0.1, 0.8), 0.18, y0, 0.36);
  crate(g, 0.18, y0 + 0.02, 0.36, 0.07, p.R.pick(CRATE));
  for (const bx of [-0.38, -0.25]) { box(g, 0.025, 0.06, 0.025, M(HAZARD, 0.2, 0.6), bx, y0, 0.4); box(g, 0.026, 0.012, 0.026, neonMat('#ffb02e', 0.5), bx, y0 + 0.06, 0.4); }
  return g;
}

function buildYard(p) {
  const g = new THREE.Group(); const y0 = lotPad(g, 2, 1, '#575d63');
  const x = -0.55, z = -0.1, w = 0.76, d = 0.66, fz = z + d / 2;
  const top = storeys(g, { w, d, floors: p.floors, x, z, y: y0, style: p.style, kind: 'louvre', seed: p.seed, lit: 0.25 });
  gable(g, d + 0.05, w + 0.04, 0.12, M('#8d969f', 0.55, 0.4), x, top, z, true);
  rollDoor(g, x - 0.1, y0, fz, 0.3, Math.min(0.18, p.floors * FLOOR - 0.04), neonOf(p));
  door(g, x + 0.22, y0, fz, WARM);
  // the yard: gravel, a fence round three sides with a gate, crate stacks
  box(g, 1.0, 0.008, 0.86, M('#6e6a62', 0.05, 0.95), 0.43, y0, 0);
  const fm = M('#6f7884', 0.5, 0.5), fh = 0.08;
  box(g, 0.012, fh, 0.84, fm, 0.92, y0, 0);
  box(g, 0.98, fh, 0.012, fm, 0.43, y0, -0.42);
  box(g, 0.55, fh, 0.012, fm, 0.64, y0, 0.42);
  for (let k = 0; k < 6; k++) box(g, 0.016, fh + 0.02, 0.016, M(DARK), -0.06 + k * 0.196, y0, 0.42);
  for (let k = 0; k < 5; k++) box(g, 0.016, fh + 0.02, 0.016, M(DARK), 0.92, y0, -0.42 + k * 0.21);
  for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
    const cx = 0.1 + c * 0.13 + r * 0.03, cz = -0.3 + r * 0.14, n = p.R.int(1, p.floors + 1);
    let cy = y0; for (let k = 0; k < n; k++) cy = crate(g, cx, cy, cz, 0.1, p.R.pick(CRATE));
  }
  // a small jib crane lifting a crate over the yard
  const mx = 0.76, mz = -0.25, mh = 0.42 + p.floors * 0.1, ym = M(HAZARD, 0.4, 0.5);
  box(g, 0.08, 0.04, 0.08, M(DARK), mx, y0, mz);
  cyl(g, 0.022, mh, ym, mx, y0 + 0.04, mz, { seg: 8 });
  const jy = y0 + 0.04 + mh;
  box(g, 0.48, 0.03, 0.03, ym, mx - 0.18, jy, mz);
  box(g, 0.07, 0.06, 0.06, M('#4a4f56'), mx + 0.1, jy - 0.03, mz);
  rod(g, [mx, jy + 0.1, mz], [mx - 0.4, jy + 0.03, mz], 0.004, M('#222'), 4);
  rod(g, [mx, jy + 0.1, mz], [mx + 0.12, jy + 0.03, mz], 0.004, M('#222'), 4);
  cyl(g, 0.008, 0.1, M(DARK), mx, jy, mz, { seg: 5 });
  beacon(g, mx, jy + 0.1, mz, '#ffb02e', 0.025);
  const hx = mx - 0.36, hy = y0 + 0.22;
  rod(g, [hx, jy, mz], [hx, hy + 0.08, mz], 0.003, M('#222'), 4);
  crate(g, hx, hy, mz, 0.08, p.R.pick(CRATE));
  lampPost(g, 0.88, 0.36, y0, 0.3);
  hoverTruck(g, 0.4, 0.22, y0 + 0.02, 0, '#e3b52c');
  return g;
}

function buildPrintworks(p) {
  const g = new THREE.Group(); const y0 = lotPad(g, 1, 1, '#575d63');
  const x = -0.17, z = -0.08, w = 0.52, d = 0.66, fz = z + d / 2;
  const top = storeys(g, { w, d, floors: p.floors, x, z, y: y0, style: p.style, kind: 'bands', seed: p.seed, lit: 0.5 });
  slab(g, w + 0.03, d + 0.03, p.style, x, top, z, 0.03);
  box(g, w * 0.6, 0.05, d * 0.5, lamp('#7a9ab8', '#5f7f9a'), x + 0.04, top + 0.03, z);         // skylight box
  rollDoor(g, x, y0, fz, 0.22, 0.16, neonOf(p));
  // glowing resin vats along the right side, piped into the block
  const resin = [['#8a3f7a', '#ff4fd8'], ['#2f7f8a', '#3ff0ff'], ['#4f8a3f', '#7dff6a'], ['#8a6a2f', '#ffb02e']];
  const th = 0.22 + p.floors * 0.07;
  [-0.27, -0.05, 0.17].forEach((tz, i) => {
    const [day, glow] = resin[(p.seed + i) % resin.length];
    cyl(g, 0.075, 0.03, M(DARK), 0.24, y0, tz, { seg: 14 });
    cyl(g, 0.068, th, lamp(day, glow, 0.25), 0.24, y0 + 0.03, tz, { seg: 14 });
    for (const t of [0.3, 0.7]) cyl(g, 0.072, 0.015, trimMat(p.style), 0.24, y0 + 0.03 + th * t, tz, { seg: 14 });
    dome(g, 0.07, M(STEEL, 0.6, 0.4), 0.24, y0 + 0.03 + th, tz, { squash: 0.5, seg: 14 });
    rod(g, [0.24, y0 + 0.03 + th + 0.02, tz], [x + w / 2, y0 + 0.03 + th + 0.02, tz], 0.01, M(STEEL, 0.6, 0.4), 6);
  });
  box(g, 0.012, 0.012, 0.6, M(STEEL, 0.6, 0.4), 0.36, y0 + th * 0.5, -0.05);
  // the stack at the back corner
  stack(g, x - w / 2 + 0.08, z - d / 2 + 0.08, top + 0.03, 0.04, 0.32 + p.floors * 0.06, '#d6a12c', ORANGE);
  crate(g, 0.3, y0, 0.38, 0.08, p.R.pick(CRATE));
  hazardBar(g, 0.3, x, y0 + 0.002, fz + 0.08, { h: 0.006, d: 0.012 });
  return g;
}

function buildChemworks(p) {
  const g = new THREE.Group(); const y0 = lotPad(g, 2, 1, '#575d63');
  const x = -0.52, z = -0.1, w = 0.86, d = 0.66, fz = z + d / 2;
  const top = storeys(g, { w, d, floors: p.floors, x, z, y: y0, style: p.style, kind: 'louvre', seed: p.seed, lit: 0.35 });
  slab(g, w + 0.03, d + 0.03, p.style, x, top, z, 0.025);
  // a clerestory along the roof with glowing windows
  box(g, w - 0.1, 0.09, 0.22, bodyMat(p.style, 1), x, top + 0.025, z);
  box(g, w - 0.14, 0.05, 0.226, lamp('#5d86a8', '#e8c48a'), x, top + 0.045, z);
  box(g, w - 0.08, 0.015, 0.25, trimMat(p.style), x, top + 0.115, z);
  rollDoor(g, x - 0.15, y0, fz, 0.28, 0.17, neonOf(p));
  door(g, x + 0.25, y0, fz, WARM);
  // spherical tanks on legs and two tall columns
  const sm = M('#dfe4e9', 0.3, 0.45), lm = M(STEEL, 0.6, 0.4);
  for (const [tx, tz] of [[0.18, -0.24], [0.5, -0.24]]) {
    const r = 0.13, cy = y0 + 0.12 + r;
    for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) rod(g, [tx + a * 0.08, y0, tz + b * 0.08], [tx + a * 0.08, cy, tz + b * 0.08], 0.008, lm, 5);
    ball(g, r, sm, tx, cy, tz, 18);
    cyl(g, r + 0.005, 0.015, M(HAZARD, 0.2, 0.6), tx, cy - 0.008, tz, { seg: 18 });
  }
  const ch = 0.38 + p.floors * 0.1;
  for (const [tx, tz] of [[0.82, -0.3], [0.82, -0.08]]) {
    cyl(g, 0.075, ch, M('#c9cfd6', 0.4, 0.45), tx, y0, tz, { seg: 14 });
    dome(g, 0.075, M('#c9cfd6', 0.4, 0.45), tx, y0 + ch, tz, { squash: 0.5, seg: 14 });
    cyl(g, 0.08, 0.015, neonMat(neonOf(p, 1), 0.4), tx, y0 + ch * 0.75, tz, { seg: 14 });
  }
  // the pipe rack along the front of the yard
  const rz = 0.2, rh = 0.2, rm = M('#5a6470', 0.5, 0.5);
  for (let k = 0; k < 4; k++) { const px = -0.02 + k * 0.28; for (const s of [-1, 1]) box(g, 0.02, rh, 0.02, rm, px, y0, rz + s * 0.06); box(g, 0.02, 0.02, 0.15, rm, px, y0 + rh, rz); }
  const pipes = ['#b8322b', '#d6a12c', '#3f74c8'];
  pipes.forEach((c, i) => hcyl(g, 0.016, 0.9, M(c, 0.4, 0.5), 0.4, y0 + rh + 0.036, rz - 0.045 + i * 0.045));
  rod(g, [-0.02, y0 + rh + 0.036, rz], [x + w / 2, y0 + rh + 0.036, rz - 0.1], 0.016, M(pipes[0], 0.4, 0.5), 8);
  // the short stack with its warning light
  stack(g, 0.8, 0.32, y0, 0.05, 0.5 + p.floors * 0.12, '#b8322b', ORANGE);
  beacon(g, 0.8, y0 + 0.5 + p.floors * 0.12 + 0.06, 0.32, RED, 0.03);
  hazardBar(g, 0.4, 0.4, y0 + 0.002, 0.42, { h: 0.006, d: 0.014 });
  return g;
}

function buildFreight(p) {
  const g = new THREE.Group(); const y0 = lotPad(g, 2, 2, '#55595e');
  // the barrel-roofed shed along the back, loading doors to the yard
  const x = -0.12, z = -0.52, w = 1.56, d = 0.76, fz = z + d / 2;
  storeys(g, { w, d, floors: p.floors, x, z, y: y0, style: p.style, kind: 'louvre', seed: p.seed, lit: 0.3 });
  const ry = y0 + p.floors * FLOOR;
  box(g, w + 0.02, 0.02, d + 0.02, trimMat(p.style), x, ry, z);
  barrel(g, w, d / 2, M('#8d97a2', 0.55, 0.4), x, ry + 0.02, z, { squash: 0.55 });
  for (let k = 0; k < 5; k++) arch(g, d / 2 + 0.004, 0.008, M('#6c7580', 0.6, 0.4), x - w / 2 + (k + 0.5) * w / 5, ry + 0.02, z, 0.55, Math.PI / 2);
  box(g, w * 0.9, 0.012, 0.03, lamp('#7a9ab8', '#bfe8ff'), x, ry + 0.02 + d / 2 * 0.55 - 0.006, z);
  for (let k = 0; k < 3; k++) rollDoor(g, x - w / 2 + (k + 0.5) * w / 3, y0, fz, 0.28, 0.17, neonOf(p, k));
  // the gate office
  const otop = storeys(g, { w: 0.24, d: 0.5, floors: p.floors + 1, x: 0.82, z: -0.6, y: y0, style: p.style, kind: 'curtain', seed: p.seed + 4 });
  slab(g, 0.27, 0.53, p.style, 0.82, otop, -0.6, 0.03);
  neonEdges(g, 0.24, 0.5, neonOf(p, 1), 0.82, otop, -0.6, 0.016, 0.35);
  // the container yard
  const rows = [0.08, 0.2, 0.62, 0.74];
  for (const cz of rows) for (let cx = -0.78; cx <= 0.5; cx += 0.29) {
    if (p.R.chance(0.2)) continue;
    const n = p.R.int(1, p.floors + 1);
    for (let k = 0; k < n; k++) container(g, cx, y0 + k * 0.105, cz, 0, p.R.pick(CONTAINER));
  }
  // a small gantry straddling the stacks on rails
  const rm = M('#4a4f56', 0.7, 0.4);
  for (const rz of [-0.04, 0.88]) box(g, 1.7, 0.012, 0.02, rm, -0.1, y0, rz);
  const gx = -0.5 + p.R.range(0, 0.7), H = (p.floors + 1) * 0.105 + 0.16, ym = M(HAZARD, 0.4, 0.5);
  for (const rz of [-0.04, 0.88]) { box(g, 0.16, 0.035, 0.05, ym, gx, y0, rz); for (const dx of [-0.06, 0.06]) box(g, 0.022, H, 0.022, ym, gx + dx, y0 + 0.035, rz); }
  box(g, 0.17, 0.05, 0.96, ym, gx, y0 + H + 0.035, 0.42);
  box(g, 0.12, 0.05, 0.1, M('#d8dde3', 0.3, 0.5), gx, y0 + H + 0.085, 0.3);
  beacon(g, gx, y0 + H + 0.085, 0.88, '#ffb02e', 0.025);
  hoverTruck(g, 0.72, 0.42, y0 + 0.02, Math.PI / 2, '#d8dde3');
  lampPost(g, 0.92, 0.92, y0, 0.32);
  return g;
}

function buildCleanlab(p) {
  const g = new THREE.Group(); const y0 = lotPad(g, 1, 1, '#6a7178');
  const w = 0.72, d = 0.6, z = -0.08, fz = z + d / 2;
  // a white box with ribbon windows, cyan trim lines, a projecting glass band
  const top = storeys(g, { w, d, floors: p.floors, z, y: y0, style: 'pearl', kind: 'bands', seed: p.seed, lit: 0.7 });
  const cy = neonMat(CYAN, 0.45);
  for (let k = 1; k < p.floors; k++) box(g, w + 0.012, 0.012, d + 0.012, cy, 0, y0 + k * FLOOR - 0.006, z);
  const gy = y0 + FLOOR * Math.max(1, Math.floor(p.floors / 2));
  box(g, w + 0.04, FLOOR * 0.55, d + 0.04, glassMat('pearl'), 0, gy + FLOOR * 0.2, z);
  const r0 = slab(g, w + 0.03, d + 0.03, 'pearl', 0, top, z, 0.03);
  neonEdges(g, w + 0.02, d + 0.02, CYAN, 0, r0 - 0.01, z, 0.016, 0.45);
  // the glass entry pod with a cyan frame
  box(g, 0.24, 0.16, 0.1, glassMat('pearl'), -0.12, y0, fz + 0.05);
  box(g, 0.26, 0.02, 0.12, bodyMat('pearl', 0), -0.12, y0 + 0.16, fz + 0.05);
  box(g, 0.24, 0.012, 0.012, cy, -0.12, y0 + 0.18, fz + 0.105);
  // rooftop air handlers: long white boxes with dark fan discs, ducts down into the roof
  const white = bodyMat('pearl', 1), fan = M('#2a2f36', 0.4, 0.5);
  for (const ox of [-0.16, 0.16]) {
    box(g, 0.2, 0.08, 0.36, white, ox, r0, z - 0.02);
    for (const oz of [-0.1, 0.06]) { cyl(g, 0.055, 0.006, fan, ox, r0 + 0.08, z - 0.02 + oz, { seg: 14 }); cyl(g, 0.012, 0.01, cy, ox, r0 + 0.083, z - 0.02 + oz, { seg: 8 }); }
  }
  box(g, 0.5, 0.03, 0.03, M(STEEL, 0.6, 0.4), 0, r0 + 0.02, z + 0.2);
  // neat lawn strips with small shrubs
  box(g, 0.2, 0.01, 0.12, leafMat('#3f8a5a'), 0.25, y0, 0.36);
  shrub(g, 0.25, 0.36, y0 + 0.01, 0.04, p.R);
  return g;
}

function buildAssembly(p) {
  const g = new THREE.Group(); const y0 = lotPad(g, 2, 1, '#575d63');
  const w = 1.8, d = 0.68, z = -0.12, fz = z + d / 2, hallH = FLOOR * 1.3;
  // the back of the hall (solid), the open front behind slim mullions showing the glowing assembly line
  storeys(g, { w, d: 0.34, floors: 1, z: z - d / 2 + 0.17, y: y0, style: p.style, kind: 'louvre', seed: p.seed, lit: 0.3 });
  box(g, w, hallH - FLOOR, 0.34, bodyMat(p.style, 0), 0, y0 + FLOOR, z - d / 2 + 0.17);
  for (const s of [-1, 1]) box(g, 0.03, hallH, d, bodyMat(p.style, 1), s * (w / 2 - 0.015), y0, z);
  box(g, w - 0.06, 0.01, d - 0.34, M('#9aa29a', 0.1, 0.8), 0, y0, fz - (d - 0.34) / 2);
  const ly = y0 + 0.01, lz = fz - 0.12;
  box(g, w - 0.14, 0.04, 0.08, M(DARK, 0.4, 0.5), 0, ly, lz);
  box(g, w - 0.14, 0.008, 0.06, lamp('#3a5566', CYAN, 0.3), 0, ly + 0.04, lz);
  for (let k = 0; k < 6; k++) {
    const ax = -0.7 + k * 0.28;
    // a robot arm over the line, glowing at its joints
    cyl(g, 0.025, 0.06, M('#e3b52c', 0.4, 0.5), ax - 0.06, ly, lz - 0.08, { seg: 8 });
    rod(g, [ax - 0.06, ly + 0.06, lz - 0.08], [ax - 0.02, ly + 0.15, lz - 0.04], 0.01, M('#e3b52c', 0.4, 0.5), 6);
    rod(g, [ax - 0.02, ly + 0.15, lz - 0.04], [ax, ly + 0.07, lz], 0.008, M('#e3b52c', 0.4, 0.5), 6);
    ball(g, 0.014, neonMat(ORANGE, 0.5), ax - 0.02, ly + 0.15, lz - 0.04, 8);
    // a drone on the line
    box(g, 0.05, 0.02, 0.05, M('#d8dde3', 0.4, 0.4), ax + 0.07, ly + 0.048, lz);
    for (const [ox, oz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) cyl(g, 0.014, 0.004, neonMat(CYAN, 0.4), ax + 0.07 + ox * 0.035, ly + 0.07, lz + oz * 0.035, { seg: 8 });
  }
  for (let k = 0; k <= 9; k++) box(g, 0.014, hallH, 0.014, trimMat(p.style), -w / 2 + 0.03 + k * (w - 0.06) / 9, y0, fz - 0.007);
  box(g, w, 0.03, 0.02, trimMat(p.style), 0, y0 + hallH - 0.03, fz - 0.01);
  box(g, w - 0.1, 0.012, 0.012, neonMat(neonOf(p), 0.45), 0, y0 + hallH - 0.045, fz + 0.002);
  let top = slab(g, w + 0.02, d + 0.02, p.style, 0, y0 + hallH, z, 0.03);
  if (p.floors > 1) { top = storeys(g, { w: w - 0.1, d: d - 0.06, floors: p.floors - 1, y: top, z: z - 0.03, style: p.style, kind: 'bands', seed: p.seed + 1 }); top = slab(g, w - 0.06, d - 0.02, p.style, 0, top, z - 0.03, 0.03); }
  // the landing pad on the roof, a cargo drone parked on it, a hatch
  const px = 0.45, pz = z - 0.02;
  cyl(g, 0.26, 0.025, M('#2e333b', 0.3, 0.6), px, top, pz, { seg: 28 });
  flatRing(g, 0.2, 0.01, neonMat(neonOf(p, 1), 0.4), px, top + 0.028, pz);
  box(g, 0.1, 0.035, 0.1, M('#d8dde3', 0.4, 0.4), px, top + 0.03, pz);
  for (const [ox, oz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { rod(g, [px, top + 0.05, pz], [px + ox * 0.08, top + 0.06, pz + oz * 0.08], 0.006, M(DARK), 4); cyl(g, 0.035, 0.005, neonMat(CYAN, 0.35), px + ox * 0.08, top + 0.06, pz + oz * 0.08, { seg: 12 }); }
  box(g, 0.3, 0.05, 0.24, bodyMat(p.style, 2), -0.45, top, pz);
  box(g, 0.3, 0.008, 0.24, lamp('#7a9ab8', '#bfe8ff'), -0.45, top + 0.05, pz);
  hazardBar(g, 1.2, 0, y0 + 0.002, 0.4, { h: 0.006, d: 0.014 });
  return g;
}

function buildRobotics(p) {
  const g = new THREE.Group(); const y0 = lotPad(g, 2, 2, '#575d63');
  const x = -0.1, z = -0.36, w = 1.6, d = 1.0, fz = z + d / 2;
  const top = storeys(g, { w, d, floors: p.floors, x, z, y: y0, style: p.style, kind: 'louvre', seed: p.seed, lit: 0.4 });
  box(g, w + 0.02, 0.02, d + 0.02, trimMat(p.style), x, top, z);
  const roofM = M(p.style === 'copper' ? '#8a6a5a' : '#8d969f', 0.55, 0.4), sky = lamp('#5d86a8', '#a88a5a');
  if (p.seed % 2) {
    // three curved vaults running front to back, each with a skylight strip on its crown
    const n = 3, vw = w / n;
    for (let k = 0; k < n; k++) {
      const vx = x - w / 2 + vw * (k + 0.5);
      barrel(g, d, vw / 2, roofM, vx, top + 0.02, z, { ry: Math.PI / 2, squash: 0.7 });
      box(g, 0.03, 0.012, d * 0.9, sky, vx, top + 0.02 + vw / 2 * 0.7 - 0.006, z);
    }
  } else {
    // a sawtooth roof, glazed faces glowing toward the yard
    const teeth = 4, tz = d / teeth;
    for (let k = 0; k < teeth; k++) { const zz = z - d / 2 + tz * (k + 0.5); tooth(g, w - 0.02, tz, 0.16, roofM, x, top + 0.02, zz); box(g, w - 0.08, 0.1, 0.008, sky, x, top + 0.04, zz + tz / 2 + 0.003); }
  }
  for (let k = 0; k < 2; k++) rollDoor(g, x - 0.4 + k * 0.8, y0, fz, 0.3, 0.18, neonOf(p, k));
  // stacks at the back corner
  const sh = 0.5 + p.floors * 0.14;
  stack(g, 0.82, -0.78, y0, 0.055, sh, '#d6a12c');
  stack(g, 0.82, -0.56, y0, 0.045, sh * 0.8, '#d6a12c');
  // solar panels in the front-left yard
  const pm = M('#22324a', 0.6, 0.25), fm = M(STEEL, 0.6, 0.4);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) {
    const sx = -0.72 + c * 0.32, sz = 0.3 + r * 0.22;
    box(g, 0.012, 0.06, 0.012, fm, sx, y0, sz);
    const pnl = box(g, 0.28, 0.01, 0.15, pm, sx, y0 + 0.06, sz); pnl.rotation.x = -0.45;
  }
  // the big robotic arm in the yard, glowing joints, holding a part over its pedestal
  const ax = 0.45, az = 0.55, am = M('#e3b52c', 0.4, 0.45), jm = neonMat(neonOf(p, 1), 0.5);
  cyl(g, 0.11, 0.05, M(DARK, 0.5, 0.5), ax, y0, az, { seg: 18 });
  cyl(g, 0.07, 0.08, am, ax, y0 + 0.05, az, { seg: 14 });
  const j1 = [ax, y0 + 0.16, az], j2 = [ax - 0.08, y0 + 0.42, az - 0.06], j3 = [ax - 0.24, y0 + 0.32, az + 0.05];
  rod(g, j1, j2, 0.035, am, 10); rod(g, j2, j3, 0.026, am, 10);
  ball(g, 0.045, jm, ...j1); ball(g, 0.038, jm, ...j2); ball(g, 0.026, jm, ...j3);
  rod(g, j3, [j3[0] - 0.02, j3[1] - 0.08, j3[2]], 0.012, M(DARK), 6);
  box(g, 0.12, 0.06, 0.1, M('#c95f4a', 0.5, 0.4), j3[0] - 0.02, j3[1] - 0.15, j3[2]);
  box(g, 0.16, 0.08, 0.14, M('#6c7580', 0.5, 0.5), j3[0] - 0.02, y0, j3[2]);
  hazardBar(g, 0.5, ax - 0.1, y0 + 0.002, az + 0.3, { h: 0.006, d: 0.014 });
  hazardBar(g, 0.5, ax - 0.1, y0 + 0.002, az - 0.25, { h: 0.006, d: 0.014 });
  lampPost(g, 0.9, 0.9, y0, 0.32);
  return g;
}

// ---------------------------------------------------------------------------------------------------------------
addRecipes({
  // homes
  'res-court':     { name: 'Pod Court',        group: 'homes', zone: 'R', size: [2, 2], blurb: 'Level 1: a ring of domed pods round a garden courtyard.', params: FLOORS(1, 3, 1), build: buildCourt },
  'res-duplex':    { name: 'Garden Duplex',    group: 'homes', zone: 'R', size: [2, 1], blurb: 'Level 1: two semi-detached homes with front gardens.', params: FLOORS(1, 3, 1), build: buildDuplex },
  'res-townhouse': { name: 'Townhouse',        group: 'homes', zone: 'R', size: [1, 1], blurb: 'Level 2: a narrow tall house with a bay window and a roof deck.', params: FLOORS(2, 5, 3), build: buildTownhouse },
  'res-walkup':    { name: 'Garden Walk-ups',  group: 'homes', zone: 'R', size: [2, 2], blurb: 'Level 2: low U- or L-shaped flats round a courtyard, stair towers, roof gardens.', params: FLOORS(2, 5, 3), build: buildWalkup },
  'res-slim':      { name: 'Slim Apartments',  group: 'homes', zone: 'R', size: [1, 1], blurb: 'Level 3: a slender tower on a one-storey base, lit crown.', params: FLOORS(4, 12, 7), build: buildSlim },
  'res-midrise':   { name: 'Midrise Bar',      group: 'homes', zone: 'R', size: [2, 1], blurb: 'Level 3: a long bar block with a stepped top and a roof terrace.', params: FLOORS(4, 14, 8), build: buildMidrise },
  'res-needle':    { name: 'Needle Tower',     group: 'homes', zone: 'R', size: [1, 1], blurb: 'Level 4: a very slim octagonal tower with glowing collars and a spire.', params: FLOORS(10, 32, 20), build: buildNeedle },
  'res-twin':      { name: 'Twin Residences',  group: 'homes', zone: 'R', size: [2, 1], blurb: 'Level 4: two towers on one podium joined by a sky bridge.', params: FLOORS(10, 40, 24), build: buildTwin },
  // shops & offices
  'com-kiosks':    { name: 'Kiosk Row',        group: 'shops', zone: 'C', size: [2, 1], blurb: 'Level 1: a strip of kiosks with glowing awnings and holo panels.', params: FLOORS(1, 2, 1), build: buildKiosks },
  'com-mart':      { name: 'Corner Mart',      group: 'shops', zone: 'C', size: [2, 2], blurb: 'Level 1: a big-box store behind a forecourt, a tall pylon sign.', params: FLOORS(1, 2, 1), build: buildMart },
  'com-corner':    { name: 'Corner Shop',      group: 'shops', zone: 'C', size: [1, 1], blurb: 'Level 2: a glass shop floor with flats above and a blade sign.', params: FLOORS(1, 4, 2), build: buildCorner },
  'com-gallery':   { name: 'Gallery Mall',     group: 'shops', zone: 'C', size: [2, 2], blurb: 'Level 2: a glass-roofed arcade between two shop wings.', params: FLOORS(1, 4, 2), build: buildGallery },
  'com-studio':    { name: 'Studio Offices',   group: 'shops', zone: 'C', size: [1, 1], blurb: 'Level 3: a narrow office block, vertical neon sign, antenna mast.', params: FLOORS(3, 10, 5), build: buildStudio },
  'com-capsule':   { name: 'Capsule Hotel',    group: 'shops', zone: 'C', size: [2, 1], blurb: 'Level 3: a facade of stacked glowing capsule windows.', params: FLOORS(3, 12, 6), build: buildCapsule },
  'com-spire':     { name: 'Data Spire',       group: 'shops', zone: 'C', size: [1, 1], blurb: 'Level 4: a slim tapering glass tower with a crown mast.', params: FLOORS(8, 30, 16), build: buildSpire },
  'com-exchange':  { name: 'Trade Exchange',   group: 'shops', zone: 'C', size: [2, 1], blurb: 'Level 4: a stepped slab tower hung with big screens.', params: FLOORS(8, 40, 20), build: buildExchange },
  // industry
  'ind-shed':      { name: 'Fab Shed',         group: 'industry', zone: 'I', size: [1, 1], blurb: 'Level 1: a small metal shed with a lit roll-up door.', params: FLOORS(1, 2, 1), build: buildShed },
  'ind-yard':      { name: 'Parts Yard',       group: 'industry', zone: 'I', size: [2, 1], blurb: 'Level 1: a shed and a fenced crate yard with a jib crane.', params: FLOORS(1, 2, 1), build: buildYard },
  'ind-printworks': { name: 'Print Works',     group: 'industry', zone: 'I', size: [1, 1], blurb: 'Level 2: a compact fab block with glowing resin vats.', params: FLOORS(1, 3, 2), build: buildPrintworks },
  'ind-chemworks': { name: 'Chem Works',       group: 'industry', zone: 'I', size: [2, 1], blurb: 'Level 2: a process hall, tanks, a pipe rack and a stack.', params: FLOORS(1, 3, 2), build: buildChemworks },
  'ind-freight':   { name: 'Freight Depot',    group: 'industry', zone: 'I', size: [2, 2], blurb: 'Level 2: a barrel-roofed shed, container stacks, a gantry.', params: FLOORS(1, 3, 2), build: buildFreight },
  'ind-cleanlab':  { name: 'Clean Lab',        group: 'industry', zone: 'I', size: [1, 1], blurb: 'Level 3: a white high-tech lab with cyan trim and air handlers.', params: FLOORS(2, 4, 3), build: buildCleanlab },
  'ind-assembly':  { name: 'Drone Assembly',   group: 'industry', zone: 'I', size: [2, 1], blurb: 'Level 3: a long hall with a glowing assembly line and a roof pad.', params: FLOORS(1, 4, 2), build: buildAssembly },
  'ind-robotics':  { name: 'Robot Plant',      group: 'industry', zone: 'I', size: [2, 2], blurb: 'Level 3: a big vaulted or sawtooth hall, a robot arm, solar panels.', params: FLOORS(1, 4, 2), build: buildRobotics },
});
