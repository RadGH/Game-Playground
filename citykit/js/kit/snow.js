// Snowfield buildings (Overdrive Frame round 6, "Frostline"): a research and radar station in the mountains north of
// the city, and the snowfield round it. Snowy pine stands, ice ridges, a radar dome, lab modules on stilts, generator
// sheds, fuel tanks (they blow up), the ski lift's pylons, stations and cabins, avalanche fences, a frozen relay dish
// and an icebreaker stuck in the lake. Same contract as buildings.js (ground origin at the lot centre, nothing outside
// ±size/2), group 'outposts' so every one gets the wreck stages, genre 'snow'.
//
// The look: polar-station red and white panels with yellow trim, dark spruce under heavy snow caps, blue-grey rock,
// pale blue ice. Everything sits on a pad of snow with soft drifts (a lot reads as "built on the snowfield", not a
// city pavement). Missions here are cold daylight to blue dusk, so the station has warm lit windows and beacons.
import * as THREE from 'three';
import { addRecipes } from './buildings.js';
import { box, cyl, dome, lotPad, neonMat, bodyMat } from './shapes.js';

const cache = new Map();
const cached = (k, make) => { if (!cache.has(k)) cache.set(k, make()); return cache.get(k); };
const f3 = n => n.toFixed(3);

const SNOW = '#eef3f8', SNOW2 = '#d7e2ee', ICE = '#9fd0e8', ROCK = '#59606b', ROCK2 = '#6d7581', PINE = '#24443a', PINE2 = '#2f5546', BARK = '#4a3527';
const RED = '#c4402f', WHITE = '#e9edf0', PANEL = '#c3cad2', DARK = '#353b44', STEEL = '#8a949f', YELLOW = '#e8b52a', GREEN = '#3c5a48';
const WARM = '#ffd18a', CYAN = '#3ff0ff', BEACON = '#ff3030', LIME = '#7dff6a', AMBER = '#ffb02e';

/** Plain coloured material. */
const M = (color, metal = 0.3, rough = 0.6) => bodyMat('chrome', 0, { color, metal, rough });
const snowMat = () => M(SNOW, 0, 0.88);
const iceMat = () => cached('sice', () => new THREE.MeshStandardMaterial({ color: ICE, metalness: 0.15, roughness: 0.18, transparent: true, opacity: 0.88 }));
/** Looks like `day` in daylight and glows `glow` at night (windows, door panels). */
function lamp(day, glow, dayGlow = 0) {
  return cached(`slamp:${day}:${glow}:${dayGlow}`, () => {
    const m = new THREE.MeshStandardMaterial({ color: day, emissive: glow, emissiveIntensity: 1, roughness: 0.35, metalness: 0.3 });
    m.userData.glow = true; m.userData.dayGlow = dayGlow; return m;
  });
}
function add(parent, geo, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; }
const G = (k, make) => cached('sg:' + k, make);
/** A sphere centred at (x, y, z). */
const ball = (p, r, mat, x, y, z, seg = 16) => add(p, G(`ball${f3(r)}:${seg}`, () => new THREE.SphereGeometry(r, seg, Math.ceil(seg * 0.7))), mat, x, y, z);
/** A round rod from a to b. */
function rod(p, a, b, r, mat, seg = 6) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), L = d.length();
  const m = add(p, G(`rod${f3(r)}:${f3(L)}:${seg}`, () => new THREE.CylinderGeometry(r, r, L, seg)), mat, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); return m;
}
/** A lying cylinder (tank) along x, turned by ry; centre at (x, y, z). */
function hcyl(p, r, len, mat, x, y, z, ry = 0, seg = 18) {
  const m = add(p, G(`hc${f3(r)}:${f3(len)}:${seg}`, () => new THREE.CylinderGeometry(r, r, len, seg)), mat, x, y, z);
  m.rotation.set(0, ry, Math.PI / 2, 'YXZ'); return m;
}
/** A cone standing on y (base radius r, height h). */
const cone = (p, r, h, mat, x, y, z, seg = 9) => add(p, G(`cone${f3(r)}:${f3(h)}:${seg}`, () => new THREE.ConeGeometry(r, h, seg)), mat, x, y + h / 2, z);
/** A rough rock: a squashed low-poly lump, flat-shaded. */
function rock(p, r, mat, x, y, z, R, sy = 0.7) {
  const m = add(p, G(`rock${f3(r)}`, () => new THREE.DodecahedronGeometry(r, 0)), mat, x, y + r * sy * 0.6, z);
  m.scale.set(1 + R.range(-0.15, 0.25), sy, 1 + R.range(-0.15, 0.25)); m.rotation.y = R.range(0, Math.PI); return m;
}
/** A soft snow drift: a flattened half sphere. */
const drift = (p, r, x, y, z, sy = 0.32, sx = 1) => { const m = dome(p, r, snowMat(), x, y, z, { squash: sy, seg: 14 }); m.scale.x = sx; return m; };
const beacon = (p, x, y, z, color = BEACON, s = 0.035) => box(p, s, s, s, neonMat(color, 0.9), x, y, z);
/** The lot: a pad of packed snow with soft drifts round its edge (never past it). */
function snowPad(g, w, d, R, { drifts = 1 } = {}) {
  const y = lotPad(g, w, d, SNOW2);
  for (let i = 0; i < Math.round(w * d * 2.5 * drifts); i++) {
    const s = R.range(0.06, 0.14), side = R.int(0, 3), t = R.range(-0.42, 0.42);
    const x = side < 2 ? (side ? 1 : -1) * (w / 2 - s - 0.02) : t * w * 0.9, z = side >= 2 ? (side === 2 ? 1 : -1) * (d / 2 - s - 0.02) : t * d * 0.9;
    drift(g, s, x, y, z, R.range(0.25, 0.45));
  }
  return y;
}
/** One spruce: a bark trunk and three or four tiers of dark needles, each under a heavy snow cap. */
function pine(g, x, z, H, R, y0 = 0) {
  const tiers = H > 0.7 ? 4 : 3, rb = H * 0.3;
  cyl(g, 0.025 + H * 0.02, H * 0.22, M(BARK, 0.05, 0.9), x, y0, z, { seg: 6 });
  for (let k = 0; k < tiers; k++) {
    const f = k / tiers, r = rb * (1 - f * 0.72), y = y0 + H * (0.14 + f * 0.62), h = H * (0.42 - f * 0.08);
    cone(g, r, h, M(k % 2 ? PINE : PINE2, 0.05, 0.85), x, y, z, 9).rotation.y = R.range(0, 1);
    cone(g, r * 0.82, h * 0.5, snowMat(), x, y + h * 0.42, z, 9).rotation.y = R.range(0, 1);   // the cap: same slope, upper half
  }
  cone(g, rb * 0.16, H * 0.14, snowMat(), x, y0 + H * 0.86, z, 6);
}
/** A row of lit windows on the +z face (or the +x face when alongZ). */
function windows(p, n, len, x, y, z, { alongZ = false, color = WARM, w = 0.07, h = 0.06, lit = 0.75, R = null } = {}) {
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n - 0.5, on = !R || R.chance(lit);
    box(p, alongZ ? 0.012 : w, h, alongZ ? w : 0.012, on ? lamp('#2b4766', color, 0.12) : M('#1c2633', 0.6, 0.3), alongZ ? x : x + t * len, y, alongZ ? z + t * len : z);
  }
}
/** A slab of snow lying on a roof (slightly over the edges, with a rounded top). */
function roofSnow(p, w, d, x, y, z) { box(p, w + 0.03, 0.03, d + 0.03, snowMat(), x, y, z); drift(p, Math.min(w, d) * 0.45, x, y + 0.03, z, 0.18, Math.max(1, w / d)); }

// ---------------------------------------------------------------- recipes
function buildPines(p) {
  const g = new THREE.Group(), R = p.R, y0 = snowPad(g, 2, 2, R, { drifts: 1.4 });
  // a stand of spruce in snow: tall ones at the back, smaller ones in front, a fallen log, snow mounds between
  const spots = [[-0.5, -0.5, 1.0], [0.45, -0.55, 0.85], [-0.05, 0.05, 1.08], [-0.6, 0.45, 0.7], [0.55, 0.4, 0.78], [0.1, 0.7, 0.55], [0.75, -0.05, 0.6]];
  for (const [x, z, h] of spots.slice(0, 5 + (p.seed % 3))) pine(g, x + R.range(-0.08, 0.08), z + R.range(-0.08, 0.08), h * R.range(0.88, 1.08), R, y0);
  for (let i = 0; i < 5; i++) drift(g, R.range(0.12, 0.22), R.range(-0.7, 0.7), y0, R.range(-0.7, 0.7), 0.35);
  hcyl(g, 0.035, 0.5, M(BARK, 0.05, 0.9), -0.3, y0 + 0.035, 0.78, 0.4);
  box(g, 0.5, 0.025, 0.06, snowMat(), -0.3, y0 + 0.06, 0.78).rotation.y = 0.4;
  return g;
}

function buildSpruce(p) {
  const g = new THREE.Group(), R = p.R, y0 = snowPad(g, 1, 1, R, { drifts: 1.2 });
  pine(g, -0.12, -0.1, 0.95 * R.range(0.9, 1.05), R, y0);
  pine(g, 0.22, 0.18, 0.62 * R.range(0.9, 1.1), R, y0);
  if (p.seed % 2) pine(g, -0.25, 0.28, 0.42, R, y0);
  rock(g, 0.09, M(ROCK, 0.05, 0.9), 0.3, y0, -0.3, R);
  drift(g, 0.1, 0.3, y0 + 0.05, -0.3, 0.5);
  return g;
}

function buildRidge(p) {
  const g = new THREE.Group(), R = p.R, y0 = snowPad(g, 2, 1, R, { drifts: 0.6 });
  // a broken ice ridge: blue-grey rock lumps along x, snow lying on top, blue ice shards pushed up between them
  for (let i = 0; i < 6; i++) {
    const x = -0.75 + i * 0.3 + R.range(-0.05, 0.05), r = R.range(0.17, 0.26), z = R.range(-0.12, 0.12);
    const m = rock(g, r, M(i % 2 ? ROCK : ROCK2, 0.05, 0.85), x, y0, z, R, R.range(0.9, 1.4));
    const top = m.position.y + r * m.scale.y * 0.7;
    drift(g, r * 0.85, x, top - r * 0.25, z, 0.42);
  }
  for (let i = 0; i < 5; i++) {
    const s = cone(g, R.range(0.05, 0.09), R.range(0.25, 0.45), iceMat(), R.range(-0.8, 0.8), y0, R.range(-0.3, 0.3), 5);
    s.rotation.set(R.range(-0.4, 0.4), R.range(0, 3), R.range(-0.4, 0.4));
  }
  for (let i = 0; i < 6; i++) drift(g, R.range(0.12, 0.2), R.range(-0.8, 0.8), y0, (R.chance(0.5) ? 1 : -1) * R.range(0.25, 0.38), 0.3);
  return g;
}

function buildRadar(p) {
  const g = new THREE.Group(), R = p.R, y0 = snowPad(g, 2, 2, R);
  // the station's radar: a red-and-white equipment block, a white geodesic radome on top, a lit control window band,
  // a ladder, a mast with a beacon, a snow bank against the back wall
  const bw = 1.3, bh = 0.42;
  box(g, bw, bh, bw, M(WHITE, 0.3, 0.5), 0, y0, 0);
  box(g, bw + 0.01, 0.08, bw + 0.01, M(RED, 0.25, 0.55), 0, y0 + bh - 0.12, 0);
  windows(g, 6, bw * 0.8, 0, y0 + 0.16, bw / 2 + 0.003, { R, lit: 0.8 });
  windows(g, 6, bw * 0.8, bw / 2 + 0.003, y0 + 0.16, 0, { alongZ: true, R, lit: 0.8 });
  box(g, 0.2, 0.26, 0.02, lamp('#3a3020', AMBER, 0.25), 0.35, y0, bw / 2 + 0.01);           // the door
  roofSnow(g, bw, bw, 0, y0 + bh, 0);
  // radome: a ring plinth and a flat-shaded icosphere (reads as panels)
  cyl(g, 0.5, 0.08, M(PANEL, 0.4, 0.5), 0, y0 + bh, 0, { seg: 24 });
  const dm = cached('sradome', () => new THREE.MeshStandardMaterial({ color: '#f4f6f8', roughness: 0.55, metalness: 0.1, flatShading: true }));
  const r = 0.56, s = add(g, G('radome', () => new THREE.IcosahedronGeometry(r, 2)), dm, 0, y0 + bh + 0.08 + r * 0.72, 0);
  s.scale.y = 0.95;
  ring2(g, r * 0.98, 0.012, M(RED, 0.25, 0.55), 0, y0 + bh + 0.08 + r * 0.3, 0);
  beacon(g, 0, y0 + bh + 0.08 + r * 1.27, 0, BEACON, 0.035);
  // ladder up the side and a little mast on the corner
  for (const s2 of [-1, 1]) rod(g, [-bw / 2 - 0.02, y0, s2 * 0.05 - 0.3], [-bw / 2 - 0.02, y0 + bh + 0.05, s2 * 0.05 - 0.3], 0.006, M(YELLOW), 4);
  for (let k = 1; k < 6; k++) rod(g, [-bw / 2 - 0.02, y0 + k * bh / 6, -0.35], [-bw / 2 - 0.02, y0 + k * bh / 6, -0.25], 0.004, M(YELLOW), 3);
  cyl(g, 0.01, 0.5, M(STEEL), bw / 2 - 0.1, y0 + bh, -bw / 2 + 0.1, { seg: 5 }); beacon(g, bw / 2 - 0.1, y0 + bh + 0.5, -bw / 2 + 0.1, BEACON, 0.025);
  // floodlight on a pole in the front corner, a drift against the back
  cyl(g, 0.012, 0.36, M(STEEL), 0.85, y0, 0.85, { seg: 5 }); box(g, 0.08, 0.035, 0.035, neonMat(WARM, 0.3), 0.85, y0 + 0.36, 0.85);
  drift(g, 0.4, -0.3, y0, -0.8, 0.35, 2);
  return g;
}
/** A flat ring round something upright (the radome's red band). */
function ring2(p, R0, tube, mat, x, y, z) { const m = add(p, G(`tor${f3(R0)}:${f3(tube)}`, () => new THREE.TorusGeometry(R0, tube, 6, 40)), mat, x, y, z); m.rotation.x = Math.PI / 2; return m; }

function buildLab(p) {
  const g = new THREE.Group(), R = p.R, y0 = snowPad(g, 2, 1, R);
  // a lab module on stilts (the snow blows under it instead of burying it): red cladding, a white roof, a lit window
  // ribbon, steps up to the door; two storeys stack a second, shorter module on top
  const L = 1.65, D = 0.6, legH = 0.24, h1 = 0.36, n = Math.min(2, Math.max(1, p.floors));
  for (const x of [-0.7, 0, 0.7]) for (const z of [-0.22, 0.22]) { cyl(g, 0.022, legH, M(STEEL, 0.6, 0.4), x, y0, z, { seg: 6 }); box(g, 0.08, 0.02, 0.08, M(DARK), x, y0, z); }
  rod(g, [-0.7, y0 + 0.04, -0.22], [0, y0 + legH - 0.02, -0.22], 0.008, M(STEEL), 4); rod(g, [0.7, y0 + 0.04, 0.22], [0, y0 + legH - 0.02, 0.22], 0.008, M(STEEL), 4);
  let y = y0 + legH;
  for (let f = 0; f < n; f++) {
    const l = f ? L * 0.62 : L, x = f ? -0.25 : 0;
    box(g, l, h1, D, M(RED, 0.25, 0.55), x, y, 0);
    box(g, l + 0.01, 0.03, D + 0.01, M(WHITE, 0.3, 0.5), x, y, 0);
    windows(g, f ? 4 : 7, l * 0.8, x, y + 0.15, D / 2 + 0.003, { R, w: 0.09, h: 0.08 });
    windows(g, f ? 4 : 7, l * 0.8, x, y + 0.15, -D / 2 - 0.003, { R, w: 0.09, h: 0.08 });
    for (const e of [-1, 1]) box(g, 0.015, h1 * 0.9, D * 0.9, M(WHITE, 0.3, 0.5), x + e * l / 2, y + 0.01, 0);
    y += h1;
    roofSnow(g, l, D, x, y, 0);
    y += 0.03;
  }
  // door and steps on the +x end, a lit panel; a weather mast and a gold instrument box on the roof
  box(g, 0.012, 0.24, 0.16, lamp('#3a3020', AMBER, 0.3), L / 2 + 0.008, y0 + legH + 0.02, 0.1);
  for (let k = 0; k < 4; k++) box(g, 0.07, 0.02, 0.18, M(STEEL, 0.6, 0.4), L / 2 + 0.05 + (3 - k) * 0.035, y0 + k * legH / 4, 0.1);
  cyl(g, 0.008, 0.36, M(STEEL), 0.55, y, -0.12, { seg: 5 });
  for (const a of [0, 2.1, 4.2]) ball(g, 0.02, M(WHITE), 0.55 + Math.cos(a) * 0.06, y + 0.34, -0.12 + Math.sin(a) * 0.06, 8);
  beacon(g, 0.55, y + 0.38, -0.12, BEACON, 0.022);
  box(g, 0.14, 0.08, 0.1, M('#c9a24a', 0.8, 0.35), 0.25, y, 0.1);
  return g;
}

function buildGenerator(p) {
  const g = new THREE.Group(), R = p.R, y0 = snowPad(g, 1, 1, R);
  // a corrugated generator shed: ribbed green walls, two exhaust stacks with a warm glow at the vents, a grille, fuel line
  const w = 0.7, d = 0.55, h = 0.32;
  box(g, w, h, d, M(GREEN, 0.35, 0.55), -0.05, y0, -0.05);
  for (let i = 0; i < 9; i++) box(g, 0.012, h, d + 0.012, M('#2e4638', 0.35, 0.55), -0.05 - w / 2 + 0.04 + i * (w - 0.08) / 8, y0, -0.05);
  box(g, w + 0.06, 0.03, d + 0.06, M(DARK, 0.4, 0.5), -0.05, y0 + h, -0.05);
  roofSnow(g, w, d, -0.05, y0 + h + 0.03, -0.05);
  box(g, 0.26, 0.16, 0.012, M(DARK, 0.6, 0.4), -0.15, y0 + 0.06, d / 2 - 0.04);              // the grille
  for (let k = 0; k < 4; k++) box(g, 0.24, 0.012, 0.016, M(STEEL), -0.15, y0 + 0.08 + k * 0.035, d / 2 - 0.035);
  box(g, 0.1, 0.02, 0.012, lamp('#3a2a14', '#ff8a2a', 0.5), -0.15, y0 + 0.03, d / 2 - 0.033);   // heat glow under the grille
  for (const x of [0.12, 0.24]) { cyl(g, 0.04, 0.32, M(STEEL, 0.6, 0.35), x, y0 + h, -0.2, { seg: 10 }); cyl(g, 0.045, 0.03, M(DARK), x, y0 + h + 0.32, -0.2, { seg: 10 }); }
  box(g, 0.1, 0.1, 0.012, lamp('#3a3020', AMBER, 0.3), 0.18, y0, d / 2 - 0.035);
  box(g, 0.03, 0.03, 0.012, neonMat(LIME, 0.6), 0.32, y0 + 0.24, d / 2 - 0.035);
  rod(g, [0.3, y0 + 0.03, 0.4], [0.3, y0 + 0.03, 0.22], 0.012, M(YELLOW), 6);
  drift(g, 0.2, -0.38, y0, 0.36, 0.4, 1.4);
  return g;
}

function buildFuel(p) {
  const g = new THREE.Group(), R = p.R, y0 = snowPad(g, 1, 1, R);
  // two yellow fuel tanks lying on saddles inside a low berm, frost on top, hazard stripes, a pump with a red light
  box(g, 0.88, 0.05, 0.88, M(PANEL, 0.3, 0.6), 0, y0, 0);
  for (const s of [-1, 1]) { box(g, 0.88, 0.07, 0.04, M(SNOW2, 0, 0.9), 0, y0 + 0.05, s * 0.42); box(g, 0.04, 0.07, 0.88, M(SNOW2, 0, 0.9), s * 0.42, y0 + 0.05, 0); }
  for (const z of [-0.17, 0.17]) {
    for (const x of [-0.22, 0.22]) box(g, 0.06, 0.1, 0.24, M(DARK), x, y0 + 0.05, z);
    hcyl(g, 0.13, 0.66, M(YELLOW, 0.4, 0.4), 0, y0 + 0.2, z);
    for (const e of [-1, 1]) ball(g, 0.13, M(YELLOW, 0.4, 0.4), e * 0.33, y0 + 0.2, z, 14).scale.x = 0.35;
    hcyl(g, 0.132, 0.05, M('#222', 0.3, 0.6), 0.12, y0 + 0.2, z);
    box(g, 0.5, 0.025, 0.12, snowMat(), 0, y0 + 0.32, z);                                   // frost on the top
  }
  rod(g, [0.36, y0 + 0.2, -0.17], [0.36, y0 + 0.2, 0.17], 0.012, M(STEEL), 5);
  box(g, 0.08, 0.14, 0.08, M(RED, 0.3, 0.5), 0.36, y0 + 0.05, 0.32);
  beacon(g, 0.36, y0 + 0.2, 0.32, BEACON, 0.025);
  return g;
}

function buildPylon(p) {
  const g = new THREE.Group(), R = p.R, y0 = snowPad(g, 1, 1, R, { drifts: 0.8 });
  // a ski-lift pylon: a tapering steel lattice tower, a cross arm along x with sheave wheels at both ends (the cable
  // runs along z, drawn live by the game), a maintenance ladder, a red beacon on top
  const H = 1.32, steel = M('#b9c2cc', 0.6, 0.35), w = 0.16;
  box(g, 0.4, 0.06, 0.4, M(PANEL, 0.3, 0.6), 0, y0, 0);
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) rod(g, [a * w, y0 + 0.06, b * w], [a * 0.05, y0 + H, b * 0.05], 0.012, steel, 5);
  for (let k = 1; k < 7; k++) { const f = k / 7, s = 2 * (w - (w - 0.05) * f); box(g, s, 0.012, s, steel, 0, y0 + 0.06 + (H - 0.06) * f, 0); }
  for (let k = 0; k < 6; k += 2) for (const sg of [-1, 1]) { const f0 = k / 7, f1 = (k + 1) / 7, s0 = w - (w - 0.05) * f0, s1 = w - (w - 0.05) * f1; rod(g, [-s0, y0 + 0.06 + (H - 0.06) * f0, sg * s0], [s1, y0 + 0.06 + (H - 0.06) * f1, sg * s1], 0.005, steel, 3); }
  box(g, 0.78, 0.06, 0.07, M(RED, 0.3, 0.5), 0, y0 + H, 0);
  for (const s of [-1, 1]) {
    const wh = add(g, G('sheave', () => new THREE.TorusGeometry(0.05, 0.014, 6, 16)), M(DARK, 0.5, 0.4), s * 0.36, y0 + H - 0.03, 0);
    wh.rotation.y = Math.PI / 2;
    box(g, 0.02, 0.08, 0.14, M(STEEL), s * 0.36, y0 + H - 0.07, 0);
  }
  box(g, 0.8, 0.03, 0.09, snowMat(), 0, y0 + H + 0.06, 0);
  beacon(g, 0, y0 + H + 0.1, 0, BEACON, 0.03);
  for (const s2 of [-1, 1]) rod(g, [w + 0.02, y0 + 0.06, s2 * 0.04], [0.07, y0 + H, s2 * 0.04], 0.004, M(YELLOW), 3);
  drift(g, 0.24, -0.1, y0, 0.15, 0.35, 1.3);
  return g;
}

function buildCabin(p) {
  const g = new THREE.Group();
  // a cable-car cabin as it hangs: the grip (at y 0.5, where the cable runs), a hanger arm, the red cabin with a lit
  // window band. Not a lot: the game draws it moving along the line (render/snow-ground.js)
  const y = 0.08, h = 0.24, w = 0.3, d = 0.22;
  box(g, 0.08, 0.04, 0.04, M(DARK, 0.5, 0.4), 0, 0.48, 0);
  rod(g, [0, 0.48, 0], [0, y + h + 0.06, 0], 0.012, M(STEEL, 0.6, 0.35), 5);
  rod(g, [0, y + h + 0.06, 0], [-0.1, y + h, 0], 0.01, M(STEEL, 0.6, 0.35), 4);
  rod(g, [0, y + h + 0.06, 0], [0.1, y + h, 0], 0.01, M(STEEL, 0.6, 0.35), 4);
  box(g, w, h, d, M(p.seed % 2 ? RED : YELLOW, 0.3, 0.5), 0, y, 0);
  box(g, w + 0.02, 0.025, d + 0.02, M(WHITE, 0.3, 0.5), 0, y + h, 0);
  box(g, w + 0.006, 0.08, d + 0.006, lamp('#2b4766', WARM, 0.15), 0, y + 0.12, 0);
  box(g, w + 0.03, 0.02, d + 0.03, M(DARK), 0, y, 0);
  return g;
}

function buildLiftStation(p) {
  const g = new THREE.Group(), R = p.R, y0 = snowPad(g, 2, 2, R);
  // the lift's end station: a concrete base, the drive house with lit windows, the big bullwheel under a red canopy
  // (the cable leaves along z, toward the pylons), a parked cabin, a ticket hut, a beacon
  box(g, 1.7, 0.1, 1.7, M('#8b939c', 0.1, 0.85), 0, y0, 0);
  const hx = -0.42;
  box(g, 0.75, 0.5, 1.1, M(WHITE, 0.3, 0.5), hx, y0 + 0.1, -0.15);
  box(g, 0.76, 0.06, 1.11, M(RED, 0.25, 0.55), hx, y0 + 0.44, -0.15);
  windows(g, 5, 0.9, hx + 0.38, y0 + 0.3, -0.15, { alongZ: true, R, w: 0.12, h: 0.1, lit: 0.85 });
  roofSnow(g, 0.75, 1.1, hx, y0 + 0.6, -0.15);
  // the wheel and its canopy
  for (const [x, z] of [[0.2, -0.6], [0.8, -0.6], [0.2, 0.25], [0.8, 0.25]]) cyl(g, 0.025, 0.62, M(STEEL, 0.6, 0.4), x, y0 + 0.1, z, { seg: 6 });
  box(g, 0.75, 0.05, 1.0, M(RED, 0.3, 0.5), 0.5, y0 + 0.72, -0.18);
  roofSnow(g, 0.75, 1.0, 0.5, y0 + 0.77, -0.18);
  const wheel = add(g, G('bull', () => new THREE.TorusGeometry(0.3, 0.035, 8, 32)), M(DARK, 0.6, 0.35), 0.5, y0 + 0.6, -0.18);
  wheel.rotation.x = Math.PI / 2;
  cyl(g, 0.05, 0.12, M(YELLOW, 0.5, 0.4), 0.5, y0 + 0.6, -0.18, { seg: 10 });
  for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; rod(g, [0.5, y0 + 0.66, -0.18], [0.5 + Math.cos(a) * 0.29, y0 + 0.62, -0.18 + Math.sin(a) * 0.29], 0.008, M(STEEL), 4); }
  // a cabin waiting on the rail, a ticket hut with a lit window, the stairs, a beacon
  box(g, 0.55, 0.03, 0.04, M(STEEL), 0.5, y0 + 0.58, 0.32);
  const c = buildCabin({ seed: p.seed + 1 }); c.position.set(0.5, y0 + 0.08, 0.32); g.add(c);
  box(g, 0.24, 0.24, 0.2, M(RED, 0.25, 0.55), -0.6, y0 + 0.1, 0.65);
  box(g, 0.012, 0.08, 0.12, lamp('#2b4766', WARM, 0.15), -0.475, y0 + 0.2, 0.65);
  roofSnow(g, 0.24, 0.2, -0.6, y0 + 0.34, 0.65);
  beacon(g, hx, y0 + 0.68, -0.6, BEACON, 0.03);
  cyl(g, 0.012, 0.42, M(STEEL), 0.85, y0 + 0.1, 0.8, { seg: 5 }); box(g, 0.08, 0.035, 0.035, neonMat(WARM, 0.3), 0.85, y0 + 0.52, 0.8);
  return g;
}

function buildFence(p) {
  const g = new THREE.Group(), R = p.R, y0 = snowPad(g, 2, 1, R, { drifts: 0.5 });
  // avalanche fence: two staggered rows of slatted steel fence leaning uphill (toward −z) on struts, with the snow
  // piled deep against their uphill side
  const wood = M('#5e5246', 0.1, 0.85), post = M(STEEL, 0.6, 0.4);
  for (const [z, x0, len] of [[-0.18, -0.85, 1.1], [0.22, -0.2, 1.05]]) {
    const fg = new THREE.Group(); fg.position.set(x0 + len / 2, y0, z); fg.rotation.x = -0.35; g.add(fg);
    for (let i = 0; i <= 4; i++) box(fg, 0.025, 0.36, 0.025, post, -len / 2 + i * len / 4, 0, 0);
    for (let k = 0; k < 6; k++) box(fg, len, 0.03, 0.012, wood, 0, 0.04 + k * 0.055, 0);
    box(fg, len + 0.02, 0.025, 0.05, snowMat(), 0, 0.37, 0);
    for (let i = 0; i <= 4; i += 2) rod(g, [x0 + i * len / 4, y0 + 0.28, z - 0.12], [x0 + i * len / 4, y0, z + 0.18], 0.008, post, 4);
    drift(g, 0.24, x0 + len / 2, y0, z - 0.14, 0.75, len / 0.5);
  }
  return g;
}

function buildDish(p) {
  const g = new THREE.Group(), R = p.R, y0 = snowPad(g, 2, 2, R);
  // the frozen relay dish: a big white dish on a turntable and yoke, tilted toward the south sky, its rim crusted
  // with ice and hung with icicles; a hut with a cyan status light and a cable run
  box(g, 0.9, 0.1, 0.9, M('#8b939c', 0.1, 0.85), -0.1, y0, -0.1);
  cyl(g, 0.28, 0.32, M(WHITE, 0.3, 0.5), -0.1, y0 + 0.1, -0.1, { rt: 0.2, seg: 16 });
  cyl(g, 0.3, 0.06, M(RED, 0.3, 0.5), -0.1, y0 + 0.42, -0.1, { seg: 16 });
  const yoke = new THREE.Group(); yoke.position.set(-0.1, y0 + 0.62, -0.1); yoke.rotation.y = Math.PI / 4 + R.range(-0.2, 0.2); g.add(yoke);
  for (const s of [-1, 1]) box(yoke, 0.06, 0.32, 0.08, M(PANEL, 0.4, 0.5), s * 0.3, -0.18, 0);
  const tilt = new THREE.Group(); tilt.rotation.x = 0.8; yoke.add(tilt);
  const dishMat = cached('sdish', () => new THREE.MeshStandardMaterial({ color: '#eef1f4', metalness: 0.25, roughness: 0.5, side: THREE.DoubleSide }));
  // the bowl: a shallow parabola turned on a lathe (opens up, rim at y = depth), a dark back plate under it
  const rimR = 0.7, depth = 0.22;
  const prof = []; for (let k = 0; k <= 10; k++) { const r = 0.03 + (rimR - 0.03) * k / 10; prof.push(new THREE.Vector2(r, depth * (r / rimR) ** 2)); }
  add(tilt, G('sdishbowl', () => new THREE.LatheGeometry(prof, 32)), dishMat, 0, 0, 0);
  cyl(tilt, 0.14, 0.06, M(PANEL, 0.4, 0.5), 0, -0.05, 0, { seg: 12 });
  const rimY = depth;
  const rim = add(tilt, G('sdishrim2', () => new THREE.TorusGeometry(rimR, 0.03, 6, 36)), iceMat(), 0, rimY, 0); rim.rotation.x = Math.PI / 2;
  for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2 + R.range(-0.1, 0.1), Ln = R.range(0.06, 0.16); const ic = add(tilt, G(`icl${f3(Ln)}`, () => new THREE.ConeGeometry(0.016, Ln, 5)), iceMat(), Math.cos(a) * rimR, rimY - Ln / 2, Math.sin(a) * rimR); ic.rotation.x = Math.PI; }
  for (const a of [0, 2.1, 4.2]) rod(tilt, [Math.cos(a) * rimR * 0.92, rimY, Math.sin(a) * rimR * 0.92], [0, 0.5, 0], 0.008, M(STEEL), 4);
  cyl(tilt, 0.04, 0.1, M(DARK), 0, 0.46, 0, { seg: 8 }); ball(tilt, 0.025, neonMat(CYAN, 0.5), 0, 0.58, 0, 8);
  // snow lying in the bowl's low side
  const sn = dome(tilt, 0.32, snowMat(), 0, 0.03, 0.22, { squash: 0.35, seg: 16 }); sn.scale.x = 1.4;
  // the hut
  box(g, 0.36, 0.26, 0.3, M(RED, 0.25, 0.55), 0.62, y0, 0.62);
  roofSnow(g, 0.36, 0.3, 0.62, y0 + 0.26, 0.62);
  box(g, 0.012, 0.16, 0.1, lamp('#3a3020', AMBER, 0.3), 0.43, y0 + 0.02, 0.62);
  box(g, 0.04, 0.04, 0.012, neonMat(CYAN, 0.6), 0.62, y0 + 0.17, 0.776);
  rod(g, [0.45, y0 + 0.03, 0.5], [-0.05, y0 + 0.03, 0.1], 0.012, M(DARK), 4);
  drift(g, 0.3, -0.7, y0, 0.7, 0.35, 1.5);
  return g;
}

function buildIcebreaker(p) {
  const g = new THREE.Group(), R = p.R;
  // an icebreaker frozen in the lake, listing a little: a red hull with a black waterline, a white superstructure with
  // a lit bridge, a funnel, a deck crane, ice slabs heaped against the bow. Stands on ice, not a snow pad
  box(g, 2.95, 0.02, 1.95, iceMat(), 0, 0, 0);
  const ship = new THREE.Group(); ship.rotation.set(0.06, 0.12, -0.05); g.add(ship);
  const L = 2.3, B = 0.62;
  const hullShape = new THREE.Shape(); hullShape.moveTo(-L / 2, -B / 2); hullShape.lineTo(L / 2 - 0.45, -B / 2); hullShape.quadraticCurveTo(L / 2 + 0.05, -B / 2 + 0.05, L / 2 + 0.1, 0); hullShape.quadraticCurveTo(L / 2 + 0.05, B / 2 - 0.05, L / 2 - 0.45, B / 2); hullShape.lineTo(-L / 2, B / 2); hullShape.lineTo(-L / 2, -B / 2);
  const hull = add(ship, G('shull', () => new THREE.ExtrudeGeometry(hullShape, { depth: 0.3, bevelEnabled: false })), M(RED, 0.3, 0.55), 0, 0, 0);
  hull.rotation.x = -Math.PI / 2; hull.position.y = -0.05;
  const wl = add(ship, G('shullw', () => new THREE.ExtrudeGeometry(hullShape, { depth: 0.07, bevelEnabled: false })), M('#1d1f24', 0.3, 0.6), 0, 0, 0);
  wl.rotation.x = -Math.PI / 2; wl.position.y = -0.06; wl.scale.set(1.01, 1.01, 1);
  box(ship, L - 0.2, 0.02, B - 0.04, M('#7d6a55', 0.1, 0.85), -0.05, 0.25, 0);                    // the deck
  // superstructure aft, bridge with a lit window band, funnel, mast
  box(ship, 0.6, 0.24, 0.5, M(WHITE, 0.3, 0.5), -0.6, 0.27, 0);
  box(ship, 0.5, 0.16, 0.46, M(WHITE, 0.3, 0.5), -0.55, 0.51, 0);
  box(ship, 0.012, 0.06, 0.4, lamp('#2b4766', WARM, 0.15), -0.295, 0.58, 0);
  windows(ship, 5, 0.5, -0.6, 0.38, 0.252, { R, w: 0.05, h: 0.05 }); windows(ship, 5, 0.5, -0.6, 0.38, -0.252, { R, w: 0.05, h: 0.05 });
  roofSnow(ship, 0.5, 0.46, -0.55, 0.67, 0);
  cyl(ship, 0.09, 0.26, M(YELLOW, 0.4, 0.45), -0.85, 0.51, 0, { seg: 14 }); cyl(ship, 0.095, 0.05, M(DARK), -0.85, 0.77, 0, { seg: 14 });
  cyl(ship, 0.01, 0.4, M(STEEL), -0.45, 0.7, 0, { seg: 5 }); beacon(ship, -0.45, 1.1, 0, BEACON, 0.03);
  // the deck crane and a hatch with snow on the foredeck
  cyl(ship, 0.04, 0.22, M(YELLOW, 0.4, 0.45), 0.3, 0.27, 0.12, { seg: 8 });
  rod(ship, [0.3, 0.48, 0.12], [0.8, 0.7, -0.05], 0.018, M(YELLOW, 0.4, 0.45), 6);
  box(ship, 0.4, 0.06, 0.36, M(GREEN, 0.3, 0.5), 0.45, 0.27, 0); box(ship, 0.4, 0.03, 0.36, snowMat(), 0.45, 0.33, 0);
  for (const s of [-1, 1]) box(ship, 1.9, 0.05, 0.02, M(STEEL, 0.6, 0.4), -0.05, 0.27, s * (B / 2 - 0.02));
  // ice slabs heaped against the hull and a crust of snow round it
  for (let i = 0; i < 12; i++) {
    const a = R.range(0, Math.PI * 2), rx = 1.28 * Math.abs(Math.cos(a)) + 0.05, rz = 0.45 * Math.abs(Math.sin(a)) + 0.1;
    const s = box(g, R.range(0.12, 0.26), R.range(0.03, 0.06), R.range(0.1, 0.2), iceMat(), Math.sign(Math.cos(a)) * Math.min(1.35, rx), 0.01, Math.sign(Math.sin(a)) * Math.min(0.85, rz));
    s.rotation.set(R.range(-0.5, 0.5), R.range(0, 3), R.range(-0.5, 0.5));
  }
  for (let i = 0; i < 6; i++) drift(g, R.range(0.12, 0.22), R.range(-1.3, 1.3), 0.01, (R.chance(0.5) ? 1 : -1) * R.range(0.5, 0.8), 0.3);
  return g;
}

const SNOWY = { group: 'outposts', genre: ['snow'] };
addRecipes({
  'snow-pines': { ...SNOWY, name: 'Snowy Pine Stand', size: [2, 2], blurb: 'A stand of dark spruce under heavy snow caps, a fallen log and drifts between the trunks.', params: [], build: buildPines },
  'snow-spruce': { ...SNOWY, name: 'Spruce Pair', size: [1, 1], blurb: 'Two or three snow-capped spruce and a rock.', params: [], build: buildSpruce },
  'snow-ridge': { ...SNOWY, name: 'Ice Ridge', size: [2, 1], blurb: 'A broken ridge of blue-grey rock with snow on top and ice shards pushed up between.', params: [], build: buildRidge },
  'snow-radar': { ...SNOWY, name: 'Radar Dome', size: [2, 2], blurb: 'A white geodesic radome on a red-and-white equipment block with a lit control room.', params: [], build: buildRadar },
  'snow-lab': { ...SNOWY, name: 'Lab on Stilts', size: [2, 1], blurb: 'A red lab module raised on steel stilts so the snow blows under it. Two storeys stack a second module.', params: [{ key: 'floors', label: 'Storeys', min: 1, max: 2, step: 1, def: 1 }], build: buildLab },
  'snow-generator': { ...SNOWY, name: 'Generator Shed', size: [1, 1], blurb: 'A ribbed green shed with two exhaust stacks and a warm glow under its grille.', params: [], build: buildGenerator },
  'snow-fuel': { ...SNOWY, name: 'Fuel Tanks', size: [1, 1], blurb: 'Two yellow fuel tanks on saddles inside a snow berm. Hit them hard and they go up.', params: [], build: buildFuel },
  'snow-pylon': { ...SNOWY, name: 'Lift Pylon', size: [1, 1], blurb: 'A steel lattice pylon of the ski lift, its cross arm carrying the cable wheels.', params: [], build: buildPylon },
  'snow-cabin': { ...SNOWY, name: 'Lift Cabin', size: [1, 1], blurb: 'A cable-car cabin as it hangs from the cable, lit inside.', params: [], build: buildCabin },
  'snow-lift': { ...SNOWY, name: 'Lift Station', size: [2, 2], blurb: 'The lift\'s end station: the drive house, the bullwheel under a red canopy and a cabin waiting.', params: [], build: buildLiftStation },
  'snow-fence': { ...SNOWY, name: 'Avalanche Fence', size: [2, 1], blurb: 'Two staggered rows of slatted fence leaning uphill, snow piled deep behind them.', params: [], build: buildFence },
  'snow-dish': { ...SNOWY, name: 'Frozen Relay Dish', size: [2, 2], blurb: 'A big relay dish on its yoke, the rim crusted with ice and hung with icicles.', params: [], build: buildDish },
  'snow-icebreaker': { ...SNOWY, name: 'Icebreaker', size: [3, 2], blurb: 'A red icebreaker frozen fast in the lake, listing, ice slabs heaped against its hull.', params: [], build: buildIcebreaker },
});
