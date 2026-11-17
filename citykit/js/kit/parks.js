// Parks, plazas and other places people enjoy (Arcline round 4, owner 2026-11-17: "Add a new tab with a variety of
// parks and plazas and other happiness-related buildings"). Same contract as buildings.js: each recipe is a function of
// a few numbers (+ style + seed), its ground origin at the lot centre, nothing outside ±size/2 in x/z. Everything that
// should light up at night uses a glow material (neonMat or glowMat below) so the night picture has its lamps.
//
// Sizes: 1×1 pocket pieces, 2×1 / 3×1 strips, 2×2 squares, 3×3 parks and the 4×4 biodome. The Park & Plaza and the
// Arena (buildings2.js) sit in the same review-page group.
import * as THREE from 'three';
import { addRecipes, GROUPS, RECIPES } from './buildings.js';
import './buildings2.js';   // the Park & Plaza and Arena move into this group on the review page
import { STYLES, leafMat, waterMat } from './materials.js';
import { box, cyl, dome, lotPad, bodyMat, neonMat } from './shapes.js';

if (!GROUPS.some(g => g.id === 'parks')) GROUPS.splice(4, 0, { id: 'parks', label: 'Parks & plazas' });

// ---------------------------------------------------------------- local helpers
const cache = new Map();
const cached = (k, make) => { if (!cache.has(k)) cache.set(k, make()); return cache.get(k); };
const f3 = n => n.toFixed(3);
/** Plain coloured material. */
const M = (color, metal = 0.2, rough = 0.75) => bodyMat('chrome', 0, { color, metal, rough });
/** Looks like `day` in sunlight and glows `glow` at night. */
function glowMat(day, glow, dayGlow = 0.2) {
  return cached(`pk-glow:${day}:${glow}:${dayGlow}`, () => {
    const m = new THREE.MeshStandardMaterial({ color: day, emissive: glow, emissiveIntensity: 1, roughness: 0.35, metalness: 0.2 });
    m.userData.glow = true; m.userData.dayGlow = dayGlow; return m;
  });
}
function add(parent, geo, mat, x, y, z) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; }
function ball(parent, r, mat, x, y, z, seg = 10) { return add(parent, cached(`pk-ball${f3(r)}:${seg}`, () => new THREE.SphereGeometry(r, seg, Math.ceil(seg * 0.7))), mat, x, y, z); }
/** A round rod between two points. */
function rod(parent, a, b, r, mat, seg = 6) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), L = d.length();
  const m = add(parent, cached(`pk-rod${f3(r)}:${f3(L)}:${seg}`, () => new THREE.CylinderGeometry(r, r, L, seg)), mat, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); return m;
}
/** A flat ring (torus) lying on the ground. */
function ring(parent, R, tube, mat, x, y, z, seg = 40, arc = Math.PI * 2) {
  const m = add(parent, cached(`pk-tor${f3(R)}:${f3(tube)}:${seg}:${f3(arc)}`, () => new THREE.TorusGeometry(R, tube, 6, seg, arc)), mat, x, y, z);
  m.rotation.x = Math.PI / 2; return m;
}
/** A turned box. */
function tbox(parent, w, h, d, mat, x, y, z, ry = 0) { const m = box(parent, w, h, d, mat, x, y, z); m.rotation.y = ry; return m; }
/** A solid of revolution from [r, y] points. */
function lathe(parent, pts, mat, x, y, z, seg = 28) {
  const k = 'pk-lathe' + pts.map(([r, h]) => f3(r) + ',' + f3(h)).join(';') + ':' + seg;
  return add(parent, cached(k, () => new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)), seg)), cached(`pk-ds:${mat.uuid}`, () => { const c = mat.clone(); c.side = THREE.DoubleSide; c.userData = { ...mat.userData }; return c; }), x, y, z);
}

const GRASS = '#4f8a52', GRASS2 = '#5c9a5a', PAVE = '#c9c3b6', PAVE2 = '#a8a296', DARKPAVE = '#3b4250', WOOD = '#7a5a40', STEEL = '#8a949f', DARK = '#3a4049';
const WARM = '#ffd18a', CYAN = '#3ff0ff';
const LEAF = ['#3f9e6a', '#2f8a7a', '#6a9e3f', '#7a4fa8', '#2f7aa8'], BULB = ['#9dffb0', '#7ff7ff', '#e8ff7a', '#ff8af0', '#8ac8ff'];
const neonOf = (p, i = 0) => STYLES[p.style || 'chrome'].neon[((p.seed || 1) + i) % STYLES[p.style || 'chrome'].neon.length];

/** A glowing alien tree: parasol, spire or bulb kinds. s = scale. */
function tree(g, x, z, y, s, R) {
  const ci = R.int(0, LEAF.length - 1), kind = R.int(0, 2);
  const leaf = leafMat(LEAF[ci]), leaf2 = leafMat(LEAF[(ci + 1) % LEAF.length]), glow = neonMat(BULB[ci], 0.25), trunk = M('#4a3a48', 0.1, 0.8);
  if (kind === 0) {
    cyl(g, 0.022 * s, 0.28 * s, trunk, x, y, z, { rt: 0.013 * s, seg: 6 });
    dome(g, 0.15 * s, leaf, x, y + 0.24 * s, z, { squash: 0.45, seg: 12 });
    dome(g, 0.085 * s, leaf2, x, y + 0.3 * s, z, { squash: 0.7, seg: 10 });
    for (let i = 0; i < 4; i++) { const a = i * 1.57 + R.range(0, 0.5); ball(g, 0.018 * s, glow, x + Math.cos(a) * 0.12 * s, y + 0.22 * s, z + Math.sin(a) * 0.12 * s, 6); }
  } else if (kind === 1) {
    cyl(g, 0.018 * s, 0.09 * s, trunk, x, y, z, { seg: 6 });
    for (let i = 0; i < 3; i++) cyl(g, (0.12 - 0.028 * i) * s, 0.14 * s, i % 2 ? leaf2 : leaf, x, y + (0.07 + 0.095 * i) * s, z, { rt: 0.01 * s, seg: 7 });
    ball(g, 0.026 * s, glow, x, y + 0.4 * s, z, 8);
  } else {
    cyl(g, 0.02 * s, 0.2 * s, trunk, x, y, z, { rt: 0.012 * s, seg: 6 });
    ball(g, 0.11 * s, leaf, x, y + 0.24 * s, z, 10);
    ball(g, 0.07 * s, leaf2, x + 0.06 * s, y + 0.3 * s, z - 0.04 * s, 8);
    ball(g, 0.03 * s, glow, x - 0.05 * s, y + 0.32 * s, z + 0.05 * s, 6);
  }
}
/** A street lamp with a warm head (glows at night). */
function lampPost(g, x, z, y, h = 0.22, color = WARM) {
  cyl(g, 0.008, h, M(DARK, 0.5, 0.5), x, y, z, { seg: 5 });
  box(g, 0.04, 0.015, 0.04, neonMat(color, 0.25), x, y + h, z);
}
function bench(g, x, z, y, ry = 0) { tbox(g, 0.14, 0.03, 0.045, M(WOOD, 0.1, 0.8), x, y + 0.014, z, ry); }
/** Lawn with a slightly varied colour. */
function lawn(g, w, d, x, z, y, c = GRASS) { box(g, w, 0.02, d, M(c, 0.05, 0.95), x, y, z); return y + 0.02; }
/** Square paving of alternating tiles. */
function paving(g, w, d, x, z, y, a = PAVE, b = PAVE2, n = 4) {
  const sw = w / n, sd = d / n; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) box(g, sw * 0.97, 0.012, sd * 0.97, M((i + j) % 2 ? a : b, 0.05, 0.9), x - w / 2 + sw * (i + 0.5), y, z - d / 2 + sd * (j + 0.5));
  return y + 0.012;
}
/** Low hedge round a w×d area, gaps in the middle of each side (paths). */
function hedgeRing(g, w, d, y, gap = 0.22) {
  const h = leafMat('#3a7a50'), hw = w / 2 - 0.05, hd = d / 2 - 0.05;
  for (const s of [-1, 1]) {
    const lx = (w - gap) / 2 - 0.08; box(g, lx, 0.06, 0.05, h, -(gap / 2 + lx / 2), y, s * hd); box(g, lx, 0.06, 0.05, h, gap / 2 + lx / 2, y, s * hd);
    const lz = (d - gap) / 2 - 0.08; box(g, 0.05, 0.06, lz, h, s * hw, y, -(gap / 2 + lz / 2)); box(g, 0.05, 0.06, lz, h, s * hw, y, gap / 2 + lz / 2);
  }
}
/** A fountain basin with glowing jets. r = basin radius. */
function fountain(g, x, z, y, r, tiers = 1) {
  const stone = M('#d4cec2', 0.1, 0.8), jet = glowMat('#cfeefa', '#5fd8ff', 0.25);
  cyl(g, r, 0.07, stone, x, y, z, { seg: 28 }); cyl(g, r * 0.88, 0.012, waterMat(), x, y + 0.055, z, { seg: 28 });
  for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5; box(g, 0.02, 0.012, 0.02, neonMat('#5fd8ff', 0.3), x + Math.cos(a) * r * 0.93, y + 0.07, z + Math.sin(a) * r * 0.93); }
  let top = y + 0.06;
  for (let t = 0; t < tiers; t++) {
    const rr = r * (0.45 - t * 0.15);
    cyl(g, 0.035, 0.12, stone, x, top, z, { seg: 10 }); top += 0.12;
    cyl(g, rr, 0.025, stone, x, top, z, { seg: 18 }); cyl(g, rr * 0.85, 0.008, waterMat(), x, top + 0.02, z, { seg: 18 }); top += 0.025;
  }
  cyl(g, 0.01, 0.16, jet, x, top, z, { seg: 6 });
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; rod(g, [x + Math.cos(a) * 0.04, top + 0.02, z + Math.sin(a) * 0.04], [x + Math.cos(a) * r * 0.55, y + 0.08, z + Math.sin(a) * r * 0.55], 0.005, jet, 4); }
  ball(g, 0.022, jet, x, top + 0.18, z, 8);
}

// ---------------------------------------------------------------- 1×1
function buildPocket(p) {
  const g = new THREE.Group(), R = p.R; const y0 = lotPad(g, 1, 1, '#5d6870');
  const y = lawn(g, 0.86, 0.86, 0, 0, y0, R.chance(0.5) ? GRASS : GRASS2);
  box(g, 0.86, 0.013, 0.14, M(PAVE, 0.05, 0.9), 0, y0, 0.18);
  for (let i = 0; i < p.trees; i++) tree(g, -0.25 + i * 0.25 + R.range(-0.04, 0.04), -0.18 + R.range(-0.06, 0.06), y, R.range(0.9, 1.2), R);
  bench(g, -0.12, 0.18, y0); bench(g, 0.16, 0.18, y0);
  lampPost(g, 0.36, 0.3, y0, 0.22);
  // flower beds that glow softly at night
  for (let i = 0; i < 6; i++) ball(g, 0.018, neonMat(BULB[(i + p.seed) % BULB.length], 0.15), -0.35 + i * 0.13, y + 0.01, 0.36, 6);
  return g;
}
function buildFountainSq(p) {
  const g = new THREE.Group(); const y0 = lotPad(g, 1, 1, '#646b74');
  const y = paving(g, 0.94, 0.94, 0, 0, y0, PAVE, PAVE2, 5);
  fountain(g, 0, 0, y, 0.26, p.tiers);
  for (const [x, z, ry] of [[0.36, 0, Math.PI / 2], [-0.36, 0, Math.PI / 2], [0, 0.36, 0], [0, -0.36, 0]]) bench(g, x, z, y, ry);
  for (const [x, z] of [[0.38, 0.38], [-0.38, -0.38], [0.38, -0.38], [-0.38, 0.38]]) lampPost(g, x, z, y, 0.2, CYAN);
  return g;
}
function buildPlayground(p) {
  const g = new THREE.Group(), R = p.R; const y0 = lotPad(g, 1, 1, '#5d6870');
  const soft = M(['#c0563a', '#3a7ac0', '#5aa04a'][p.seed % 3], 0.05, 0.95);
  box(g, 0.88, 0.016, 0.88, soft, 0, y0, 0); const y = y0 + 0.016;
  const red = M('#e0503a', 0.3, 0.5), yel = M('#f2c230', 0.3, 0.5), blue = M('#3a8ae0', 0.3, 0.5), metal = M(STEEL, 0.6, 0.4);
  // slide tower
  for (const [x, z] of [[-0.3, -0.3], [-0.12, -0.3], [-0.3, -0.12], [-0.12, -0.12]]) cyl(g, 0.012, 0.22, metal, x, y, z, { seg: 6 });
  box(g, 0.22, 0.02, 0.22, yel, -0.21, y + 0.22, -0.21);
  const roof = new THREE.Mesh(cached('pk-cone', () => new THREE.ConeGeometry(0.17, 0.1, 4)), red); roof.position.set(-0.21, y + 0.32, -0.21); roof.rotation.y = Math.PI / 4; roof.castShadow = true; g.add(roof);
  const sl = box(g, 0.08, 0.012, 0.36, blue, -0.21, y + 0.1, 0.04); sl.rotation.x = 0.62;
  // swings
  rod(g, [0.12, y, -0.35], [0.22, y + 0.24, -0.35], 0.01, metal); rod(g, [0.32, y, -0.35], [0.22, y + 0.24, -0.35], 0.01, metal);
  rod(g, [0.12, y, 0.05], [0.22, y + 0.24, 0.05], 0.01, metal); rod(g, [0.32, y, 0.05], [0.22, y + 0.24, 0.05], 0.01, metal);
  rod(g, [0.22, y + 0.24, -0.35], [0.22, y + 0.24, 0.05], 0.01, metal);
  for (const z of [-0.22, -0.08]) { rod(g, [0.22, y + 0.24, z], [0.22, y + 0.07, z], 0.003, metal, 4); box(g, 0.06, 0.01, 0.04, red, 0.22, y + 0.06, z); }
  // climbing dome + a springy ride
  const frame = M(STEEL, 0.5, 0.4); dome(g, 0.12, cached('pk-wire', () => new THREE.MeshStandardMaterial({ color: '#c9d2dc', wireframe: true, metalness: 0.5 })), -0.22, y, 0.26, { squash: 1, seg: 8 });
  ball(g, 0.04, yel, 0.22, y + 0.08, 0.3, 8); cyl(g, 0.008, 0.06, frame, 0.22, y, 0.3, { seg: 5 });
  lampPost(g, 0.38, 0.38, y0, 0.22); lampPost(g, -0.4, 0.4, y0, 0.18, '#ffb0f0');
  for (let i = 0; i < 3; i++) R.int(0, 1);
  return g;
}

// ---------------------------------------------------------------- strips (2×1, 3×1)
function buildCourt(p) {
  const g = new THREE.Group(); const y0 = lotPad(g, 2, 1, '#565d66');
  const floor = M(['#3a6aa8', '#a8543a', '#3a8a5a'][p.sport % 3], 0.05, 0.85); box(g, 1.84, 0.012, 0.84, floor, 0, y0, 0); const y = y0 + 0.012;
  const line = neonMat('#f0f2f0', 0.15);
  box(g, 1.7, 0.004, 0.012, line, 0, y, 0.36); box(g, 1.7, 0.004, 0.012, line, 0, y, -0.36);
  box(g, 0.012, 0.004, 0.72, line, 0.85, y, 0); box(g, 0.012, 0.004, 0.72, line, -0.85, y, 0); box(g, 0.012, 0.004, 0.72, line, 0, y, 0);
  ring(g, 0.12, 0.005, line, 0, y + 0.003, 0, 24);
  const metal = M(STEEL, 0.6, 0.4);
  if (p.sport === 1) { // net
    for (const z of [-0.4, 0.4]) cyl(g, 0.01, 0.14, metal, 0, y, z, { seg: 6 });
    box(g, 0.01, 0.07, 0.8, cached('pk-net', () => new THREE.MeshStandardMaterial({ color: '#e8eef4', wireframe: true })), 0, y + 0.07, 0);
  } else { // hoops at both ends
    for (const s of [-1, 1]) { cyl(g, 0.012, 0.26, metal, s * 0.88, y, 0, { seg: 6 }); box(g, 0.01, 0.1, 0.16, M('#f0f2f0', 0.1, 0.6), s * 0.86, y + 0.24, 0); ring(g, 0.03, 0.004, neonMat('#ff8a2a', 0.3), s * 0.83, y + 0.25, 0, 12); }
  }
  // fence + floodlights
  const fence = cached('pk-fence', () => new THREE.MeshStandardMaterial({ color: '#9aa4b0', wireframe: true }));
  box(g, 1.9, 0.12, 0.01, fence, 0, y0, -0.46); box(g, 1.9, 0.12, 0.01, fence, 0, y0, 0.46);
  for (const [x, z] of [[-0.94, -0.44], [0.94, 0.44], [0.94, -0.44], [-0.94, 0.44]]) {
    cyl(g, 0.012, 0.4, metal, x, y0, z, { seg: 6 }); box(g, 0.08, 0.03, 0.03, neonMat('#fff4d8', 0.35), x, y0 + 0.4, z);
  }
  return g;
}
function buildPromenade(p) {
  const g = new THREE.Group(), R = p.R; const y0 = lotPad(g, 3, 1, '#5d6870');
  // boardwalk planks along x, a water-blue edge strip with a railing
  const deck = M('#8a6a48', 0.05, 0.85), deck2 = M('#7a5c3e', 0.05, 0.85);
  for (let i = 0; i < 14; i++) box(g, 0.2, 0.02, 0.54, i % 2 ? deck : deck2, -1.3 + i * 0.2, y0, 0.12);
  const y = y0 + 0.02;
  box(g, 2.9, 0.02, 0.22, M('#2a6f9a', 0.4, 0.15), 0, y0, -0.32);   // a strip of water-blue glass edging
  const rail = M(STEEL, 0.6, 0.35), glowRail = neonMat(neonOf(p), 0.3);
  box(g, 2.9, 0.012, 0.012, glowRail, 0, y0 + 0.14, -0.2);
  for (let i = 0; i < 11; i++) cyl(g, 0.006, 0.14, rail, -1.4 + i * 0.28, y0, -0.2, { seg: 4 });
  // planters with trees, benches, lamps, a kiosk
  for (let i = 0; i < 3; i++) {
    const x = -1 + i; box(g, 0.2, 0.06, 0.2, M('#5a626c', 0.3, 0.6), x, y, 0.3); lawn(g, 0.17, 0.17, x, 0.3, y + 0.06);
    tree(g, x, 0.3, y + 0.08, R.range(0.9, 1.2), R);
    bench(g, x + 0.3, 0.06, y, 0); lampPost(g, x - 0.35, -0.12, y, 0.24, WARM);
  }
  if (p.kiosk) {
    box(g, 0.22, 0.14, 0.16, M('#c9d2dc', 0.4, 0.4), 1.3, y, 0.25);
    box(g, 0.26, 0.02, 0.2, neonMat(neonOf(p, 1), 0.4), 1.3, y + 0.14, 0.25);
    box(g, 0.2, 0.04, 0.005, glowMat('#ffe9c0', WARM, 0.3), 1.3, y + 0.06, 0.165);
  }
  return g;
}

// ---------------------------------------------------------------- 2×2
function buildGarden(p) {
  const g = new THREE.Group(), R = p.R; const y0 = lotPad(g, 2, 2, '#5d6870');
  paving(g, 1.9, 1.9, 0, 0, y0, PAVE2, PAVE, 6); const y = y0 + 0.012;
  const bed = M('#4a525e', 0.4, 0.5), soil = M('#3a2f2a', 0, 1), grow = glowMat('#e8b0ff', '#d070ff', 0.25);
  const crops = ['#6abf4a', '#3fa86a', '#a8c83a', '#4ab0a0'];
  // raised hydroponic beds with violet grow-lights on frames
  for (let row = 0; row < p.rows; row++) {
    const z = -0.62 + row * (1.24 / Math.max(1, p.rows - 1));
    box(g, 1.1, 0.08, 0.18, bed, -0.25, y, z); box(g, 1.06, 0.012, 0.14, soil, -0.25, y + 0.08, z);
    for (let i = 0; i < 8; i++) ball(g, 0.035, leafMat(crops[(i + row) % crops.length]), -0.74 + i * 0.14, y + 0.11, z, 7);
    rod(g, [-0.78, y + 0.08, z], [-0.78, y + 0.26, z], 0.008, M(STEEL, 0.6, 0.4)); rod(g, [0.28, y + 0.08, z], [0.28, y + 0.26, z], 0.008, M(STEEL, 0.6, 0.4));
    box(g, 1.06, 0.015, 0.05, grow, -0.25, y + 0.26, z);
  }
  // a small greenhouse dome with a lit frame, a water tank
  const glass = cached('pk-ghouse', () => new THREE.MeshStandardMaterial({ color: '#bfe8ff', metalness: 0.6, roughness: 0.1, transparent: true, opacity: 0.45 }));
  dome(g, 0.3, glass, 0.6, y, -0.45, { squash: 0.9, seg: 16 });
  ring(g, 0.3, 0.008, neonMat('#9dffb0', 0.3), 0.6, y + 0.005, -0.45, 24);
  tree(g, 0.6, -0.45, y, 0.9, R);
  cyl(g, 0.14, 0.32, M('#c9d2dc', 0.5, 0.35), 0.6, y, 0.45, { seg: 16 }); ring(g, 0.14, 0.006, neonMat(CYAN, 0.3), 0.6, y + 0.32, 0.45, 20);
  lampPost(g, 0.85, 0.05, y, 0.22); lampPost(g, -0.88, 0.88, y, 0.22);
  return g;
}
function buildSkate(p) {
  const g = new THREE.Group(); const y0 = lotPad(g, 2, 2, '#646b74');
  const conc = M('#b9b4ab', 0.05, 0.85), conc2 = M('#a39e95', 0.05, 0.85);
  box(g, 1.92, 0.04, 1.92, conc, 0, y0, 0); const y = y0 + 0.04;
  // a bowl: a lathed dish set in a raised deck
  ring(g, 0.42, 0.04, conc2, -0.45, y + 0.11, -0.45, 28);
  lathe(g, [[0.02, 0.02], [0.2, 0.03], [0.34, 0.08], [0.4, 0.13]], conc, -0.45, y, -0.45, 28);
  ring(g, 0.4, 0.012, neonMat(neonOf(p), 0.35), -0.45, y + 0.13, -0.45, 28);
  // quarter pipe, funbox with a rail, stairs with a handrail
  const qp = new THREE.Mesh(cached('pk-qp', () => { const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(0.3, 0); s.lineTo(0.3, 0.22); s.quadraticCurveTo(0.3, 0, 0, 0); return new THREE.ExtrudeGeometry(s, { depth: 0.8, bevelEnabled: false }); }), conc2);
  qp.position.set(0.58, y, 0.05); qp.castShadow = true; qp.receiveShadow = true; g.add(qp);
  box(g, 0.4, 0.07, 0.24, conc2, 0.35, y, -0.55); rod(g, [0.17, y + 0.12, -0.55], [0.53, y + 0.12, -0.55], 0.008, neonMat(neonOf(p, 1), 0.3));
  rod(g, [0.17, y + 0.07, -0.55], [0.17, y + 0.12, -0.55], 0.006, M(STEEL)); rod(g, [0.53, y + 0.07, -0.55], [0.53, y + 0.12, -0.55], 0.006, M(STEEL));
  for (let i = 0; i < 3; i++) box(g, 0.5, 0.04 * (3 - i), 0.1, conc2, -0.45, y, 0.25 + i * 0.1);
  rod(g, [-0.75, y + 0.2, 0.22], [-0.75, y + 0.08, 0.52], 0.008, M(STEEL, 0.6, 0.4));
  // graffiti-style glowing wall panel + floodlights
  box(g, 0.04, 0.3, 0.7, M('#4a5260', 0.2, 0.7), -0.92, y, 0.45);
  for (let i = 0; i < 3; i++) box(g, 0.006, 0.08, 0.16, neonMat(neonOf(p, i), 0.4), -0.898, y + 0.07 + i * 0.07, 0.25 + i * 0.18);
  for (const [x, z] of [[0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) { cyl(g, 0.012, 0.42, M(STEEL, 0.6, 0.4), x, y, z, { seg: 6 }); box(g, 0.08, 0.03, 0.03, neonMat('#fff4d8', 0.35), x, y + 0.42, z); }
  return g;
}
function buildMemorial(p) {
  const g = new THREE.Group(), R = p.R; const y0 = lotPad(g, 2, 2, '#5d6870');
  lawn(g, 1.9, 1.9, 0, 0, y0, GRASS); const y = y0 + 0.02;
  hedgeRing(g, 1.9, 1.9, y, 0.3);
  box(g, 0.3, 0.012, 1.9, M(PAVE, 0.05, 0.9), 0, y, 0); box(g, 1.9, 0.012, 0.3, M(PAVE, 0.05, 0.9), 0, y, 0);
  // stepped plinth + obelisk with a glowing seam and a light at the tip
  const stone = M('#d8d4cc', 0.1, 0.7), dark = M('#2c3038', 0.3, 0.4);
  box(g, 0.6, 0.05, 0.6, stone, 0, y, 0); box(g, 0.46, 0.05, 0.46, stone, 0, y + 0.05, 0);
  const h = 0.4 + p.height * 0.2;
  const ob = new THREE.Mesh(cached(`pk-ob${f3(h)}`, () => new THREE.CylinderGeometry(0.05, 0.1, h, 4)), dark); ob.position.set(0, y + 0.1 + h / 2, 0); ob.rotation.y = Math.PI / 4; ob.castShadow = true; g.add(ob);
  for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) { const s = box(g, 0.008, h * 0.8, 0.008, neonMat('#bfe8ff', 0.3), Math.cos(a) * 0.075, y + 0.12, Math.sin(a) * 0.075); s.rotation.y = a; }
  ball(g, 0.03, neonMat('#fff4d8', 0.5), 0, y + 0.12 + h, 0, 8);
  // two reflecting pools with an eternal flame between them
  for (const s of [-1, 1]) { box(g, 0.5, 0.03, 0.22, stone, s * 0.55, y, 0.55); box(g, 0.45, 0.01, 0.17, waterMat(), s * 0.55, y + 0.03, 0.55); }
  cyl(g, 0.06, 0.06, stone, 0, y, 0.55, { seg: 10 }); dome(g, 0.04, glowMat('#ffb050', '#ff8a2a', 0.6), 0, y + 0.06, 0.55, { squash: 1.6, seg: 8 });
  // name wall + trees
  box(g, 0.9, 0.16, 0.05, dark, 0, y, -0.62); box(g, 0.8, 0.006, 0.004, neonMat('#bfe8ff', 0.3), 0, y + 0.1, -0.594);
  for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.25], [0.6, 0.25]]) tree(g, x, z, y, R.range(1, 1.25), R);
  for (const [x, z] of [[0.22, 0.22], [-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22]]) box(g, 0.03, 0.02, 0.03, neonMat(WARM, 0.2), x * 1.6, y, z * 1.6);
  return g;
}
function buildNeonPlaza(p) {
  const g = new THREE.Group(); const y0 = lotPad(g, 2, 2, '#3a404c');
  paving(g, 1.92, 1.92, 0, 0, y0, DARKPAVE, '#2e3440', 6); const y = y0 + 0.012;
  const c1 = neonOf(p), c2 = neonOf(p, 1), c3 = neonOf(p, 2);
  // a glowing grid set in the floor
  for (let i = -2; i <= 2; i++) { box(g, 1.8, 0.003, 0.01, neonMat(c1, 0.15), 0, y, i * 0.36); box(g, 0.01, 0.003, 1.8, neonMat(c2, 0.15), i * 0.36, y, 0); }
  // neon arches over the crossing paths
  for (const [ax, az, ry] of [[0, -0.75, 0], [0, 0.75, 0], [-0.75, 0, Math.PI / 2], [0.75, 0, Math.PI / 2]]) {
    const a = add(g, cached('pk-arch', () => new THREE.TorusGeometry(0.28, 0.018, 6, 24, Math.PI)), neonMat((ry ? c2 : c1), 0.45), ax, y, az); a.rotation.y = ry;
  }
  // holo pillars + a central light sculpture
  for (const [x, z] of [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]]) {
    cyl(g, 0.05, 0.42, M(DARK, 0.6, 0.3), x, y, z, { seg: 8 });
    cyl(g, 0.055, 0.06, neonMat(c3, 0.5), x, y + 0.18, z, { seg: 8 }); cyl(g, 0.055, 0.03, neonMat(c1, 0.5), x, y + 0.36, z, { seg: 8 });
  }
  cyl(g, 0.2, 0.05, M(DARK, 0.5, 0.3), 0, y, 0, { seg: 16 });
  for (let i = 0; i < p.rings; i++) { const r = ring(g, 0.16 - i * 0.03, 0.01, neonMat(i % 2 ? c2 : c3, 0.5), 0, y + 0.12 + i * 0.12, 0, 24); r.rotation.x = Math.PI / 2 + (i % 2 ? 0.35 : -0.35); r.rotation.y = i * 0.6; }
  // food stalls with lit counters
  for (const [x, z] of [[-0.82, 0.28], [0.82, -0.28]]) {
    box(g, 0.18, 0.13, 0.22, M('#c9d2dc', 0.4, 0.4), x, y, z); box(g, 0.24, 0.02, 0.28, neonMat(c2, 0.4), x, y + 0.13, z);
    box(g, 0.005, 0.05, 0.18, glowMat('#ffe9c0', WARM, 0.35), x - Math.sign(x) * 0.093, y + 0.05, z);
  }
  return g;
}
function buildTerrace(p) {
  const g = new THREE.Group(), R = p.R; const y0 = lotPad(g, 2, 2, '#5d6870');
  // garden decks stacked on pillars (a rooftop garden without the building under it), a lift core, glowing railings
  const conc = M('#c9cbc8', 0.1, 0.7), rail = neonMat(neonOf(p), 0.3), pillar = M('#9aa2ac', 0.4, 0.4);
  const decks = [[1.9, 1.9, 0, 0], [1.3, 1.3, 0.25, -0.25], [0.8, 0.8, -0.3, 0.3]].slice(0, p.decks);
  let y = y0;
  for (let i = 0; i < decks.length; i++) {
    const [w, d, x, z] = decks[i];
    if (i) { for (const [px, pz] of [[x - w / 2 + 0.08, z - d / 2 + 0.08], [x + w / 2 - 0.08, z - d / 2 + 0.08], [x - w / 2 + 0.08, z + d / 2 - 0.08], [x + w / 2 - 0.08, z + d / 2 - 0.08]]) cyl(g, 0.035, 0.32, pillar, px, y, pz, { seg: 8 }); y += 0.32; }
    box(g, w, 0.05, d, conc, x, y, z); y += 0.05;
    lawn(g, w - 0.12, d - 0.12, x, z, y, i % 2 ? GRASS2 : GRASS);
    box(g, w - 0.04, 0.01, 0.01, rail, x, y + 0.07, z - d / 2 + 0.02); box(g, w - 0.04, 0.01, 0.01, rail, x, y + 0.07, z + d / 2 - 0.02);
    box(g, 0.01, 0.01, d - 0.04, rail, x - w / 2 + 0.02, y + 0.07, z); box(g, 0.01, 0.01, d - 0.04, rail, x + w / 2 - 0.02, y + 0.07, z);
    const n = Math.max(2, Math.round(w * 3));
    for (let k = 0; k < n; k++) tree(g, x + R.range(-w / 2 + 0.18, w / 2 - 0.18), z + R.range(-d / 2 + 0.18, d / 2 - 0.18), y + 0.02, R.range(0.75, 1.05) * (i ? 0.85 : 1), R);
    if (i === decks.length - 1) { lampPost(g, x - w / 2 + 0.15, z + d / 2 - 0.15, y + 0.02, 0.18); bench(g, x, z + d / 2 - 0.15, y + 0.02); }
  }
  // lift core with a glass strip
  box(g, 0.18, y - y0 + 0.12, 0.18, M('#5a626c', 0.4, 0.5), 0.78, y0, 0.78);
  box(g, 0.004, y - y0, 0.12, glowMat('#bfe8ff', '#7fe8ff', 0.25), 0.689, y0 + 0.05, 0.78);
  return g;
}

// ---------------------------------------------------------------- 3×3 and 4×4
function buildCentral(p) {
  const g = new THREE.Group(), R = p.R; const y0 = lotPad(g, 3, 3, '#5d6870');
  lawn(g, 2.9, 2.9, 0, 0, y0, GRASS); const y = y0 + 0.02;
  // a ring path and cross paths
  ring(g, 0.95, 0.07, M(PAVE, 0.05, 0.9), 0, y + 0.004, 0, 56).scale.z = 0.12;
  box(g, 2.9, 0.012, 0.14, M(PAVE, 0.05, 0.9), 0, y, 0); box(g, 0.14, 0.012, 2.9, M(PAVE, 0.05, 0.9), 0, y, 0);
  // a pond with a footbridge in one quarter
  cyl(g, 0.48, 0.012, waterMat(), 0.72, y, 0.72, { seg: 28 }); ring(g, 0.48, 0.02, M('#8a8a80', 0.1, 0.8), 0.72, y + 0.01, 0.72, 28);
  const bridge = new THREE.Mesh(cached('pk-bridge', () => new THREE.TorusGeometry(0.3, 0.03, 4, 12, Math.PI)), M(WOOD, 0.1, 0.8)); bridge.position.set(0.72, y, 0.72); bridge.scale.set(1, 0.4, 3); bridge.rotation.y = Math.PI / 4; bridge.castShadow = true; g.add(bridge);
  for (let i = 0; i < 6; i++) ball(g, 0.02, neonMat('#9dffb0', 0.2), 0.72 + Math.cos(i) * 0.38, y + 0.02, 0.72 + Math.sin(i) * 0.38, 6);
  // a pavilion in the middle
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; cyl(g, 0.014, 0.22, M('#e8e4dc', 0.1, 0.6), Math.cos(a) * 0.2, y, Math.sin(a) * 0.2, { seg: 6 }); }
  cyl(g, 0.24, 0.02, M('#e8e4dc', 0.1, 0.6), 0, y, 0, { seg: 6 });
  const roof = new THREE.Mesh(cached('pk-pav', () => new THREE.ConeGeometry(0.28, 0.12, 6)), M('#4a7a8a', 0.3, 0.5)); roof.position.set(0, y + 0.28, 0); roof.castShadow = true; g.add(roof);
  ring(g, 0.24, 0.008, neonMat(WARM, 0.3), 0, y + 0.22, 0, 6);
  // many trees, benches and lamps along the paths
  const spots = []; for (let i = 0; i < 40; i++) { const x = R.range(-1.25, 1.25), z = R.range(-1.25, 1.25); if (Math.abs(x) < 0.16 || Math.abs(z) < 0.16 || Math.hypot(x, z) < 0.42 || Math.abs(Math.hypot(x, z) - 0.95) < 0.12 || Math.hypot(x - 0.72, z - 0.72) < 0.56) continue; spots.push([x, z]); }
  for (const [x, z] of spots.slice(0, p.trees)) tree(g, x, z, y, R.range(1, 1.4), R);
  for (const [x, z, ry] of [[0.5, 0.13, 0], [-0.5, -0.13, 0], [0.13, -0.5, Math.PI / 2], [-0.13, 0.5, Math.PI / 2], [1.2, -0.13, 0], [-1.2, 0.13, 0]]) bench(g, x, z, y, ry);
  for (const [x, z] of [[0.3, 0.12], [-0.3, -0.12], [0.12, -0.3], [-0.12, 0.3], [1.0, 0.12], [-1.0, -0.12], [0.12, -1.0], [-0.12, 1.0], [1.38, 0.12], [-1.38, -0.12], [0.12, 1.38], [-0.12, -1.38]]) lampPost(g, x, z, y, 0.22);
  return g;
}
function buildAmphi(p) {
  const g = new THREE.Group(), R = p.R; const y0 = lotPad(g, 3, 3, '#646a72');
  // half-bowl seating facing the stage (towards −z), stepped
  const seat = [M('#c9cbc8', 0.1, 0.7), M('#a8aaa6', 0.1, 0.7)];
  for (let t = 0; t < p.rows; t++) {
    const r = 0.55 + t * 0.16, m = add(g, cached(`pk-step${t}`, () => new THREE.CylinderGeometry(r + 0.16, r + 0.16, 0.05 * (t + 1), 32, 1, false, -Math.PI / 2, Math.PI)), seat[t % 2], 0, y0 + 0.025 * (t + 1), -0.35);
    m.scale.z = 1;
    ring(g, r + 0.16, 0.006, neonMat(neonOf(p), 0.2), 0, y0 + 0.05 * (t + 1) + 0.004, -0.35, 24, Math.PI).rotation.z = 0;
  }
  // the inner floor and the stage
  cyl(g, 0.55, 0.02, M('#7a6a5a', 0.1, 0.8), 0, y0, -0.35, { seg: 24 });
  box(g, 1.6, 0.1, 0.5, M('#3a3f48', 0.3, 0.6), 0, y0, -1.15);
  box(g, 1.5, 0.005, 0.02, neonMat(neonOf(p, 1), 0.5), 0, y0 + 0.1, -0.9);
  // a curved canopy over the stage on two masts, with spotlights
  for (const s of [-1, 1]) cyl(g, 0.025, 0.7, M(STEEL, 0.6, 0.4), s * 0.78, y0, -1.32, { seg: 8 });
  const canopy = add(g, cached('pk-canopy', () => new THREE.CylinderGeometry(0.6, 0.6, 1.6, 20, 1, true, 0, Math.PI)), cached('pk-canopy-m', () => new THREE.MeshStandardMaterial({ color: '#e8eef4', metalness: 0.3, roughness: 0.5, side: THREE.DoubleSide })), 0, y0 + 0.62, -1.2);
  canopy.rotation.z = Math.PI / 2; canopy.scale.set(1, 1, 0.45);
  for (let i = 0; i < 5; i++) box(g, 0.05, 0.04, 0.05, neonMat(i % 2 ? '#fff4d8' : neonOf(p, 2), 0.4), -0.6 + i * 0.3, y0 + 0.66, -1.05);
  // screens either side + trees round the back of the bowl
  for (const s of [-1, 1]) { box(g, 0.05, 0.3, 0.4, M(DARK, 0.4, 0.4), s * 1.3, y0, -1.0); box(g, 0.006, 0.24, 0.34, glowMat('#6ab0ff', '#3f9fff', 0.4), s * 1.272, y0 + 0.04, -1.0); }
  for (let i = 0; i < 9; i++) { const a = -0.2 + i * 0.4, r = 1.38; const x = Math.cos(a) * r * (i % 2 ? 0.98 : 1), z = -0.35 + Math.sin(a) * r * 0.9; if (Math.abs(x) < 1.42 && Math.abs(z) < 1.42) tree(g, x, z, y0, R.range(0.9, 1.15), R); }
  for (const [x, z] of [[-1.35, 1.35], [1.35, 1.35], [-1.35, -0.3], [1.35, -0.3]]) lampPost(g, x, z, y0, 0.24);
  return g;
}
function buildBiodome(p) {
  const g = new THREE.Group(), R = p.R; const y0 = lotPad(g, 4, 4, '#5d6870');
  paving(g, 3.9, 3.9, 0, 0, y0, PAVE, PAVE2, 8); const y = y0 + 0.012;
  // a ring wall, jungle inside, a geodesic frame of rods with glowing nodes over it (open, so the jungle shows)
  const rad = 1.7;
  cyl(g, rad + 0.04, 0.1, M('#c9d2dc', 0.5, 0.35), 0, y, 0, { seg: 40 });
  lawn(g, 2.4, 2.4, 0, 0, y + 0.1, '#3f7a4a');
  cyl(g, 1.2, 0.02, M('#3f7a4a', 0.05, 0.95), 0, y + 0.1, 0, { seg: 32 });
  cyl(g, 0.35, 0.012, waterMat(), 0.5, y + 0.12, -0.4, { seg: 20 });
  for (let i = 0; i < 26; i++) { const a = R.range(0, Math.PI * 2), d = Math.sqrt(R()) * 1.35; tree(g, Math.cos(a) * d, Math.sin(a) * d, y + 0.12, R.range(1.2, 1.9), R); }
  const geo = cached('pk-geo', () => new THREE.IcosahedronGeometry(1, 2)), pos = geo.attributes.position, seen = new Set();
  const frame = M('#dfe6ee', 0.7, 0.3), node = neonMat(neonOf(p), 0.3), H = 1.25 + p.height * 0.25;
  const P = i => { const vx = pos.getX(i), vy = pos.getY(i), vz = pos.getZ(i); return [vx * rad, y + 0.1 + Math.max(0, vy) * H, vz * rad, vy]; };
  for (let f = 0; f < pos.count; f += 3) for (const [a, b] of [[f, f + 1], [f + 1, f + 2], [f + 2, f]]) {
    const A = P(a), B = P(b); if (A[3] < -0.02 || B[3] < -0.02) continue;
    const k = [A, B].map(v => v.slice(0, 3).map(n => n.toFixed(2)).join(',')).sort().join('|'); if (seen.has(k)) continue; seen.add(k);
    rod(g, A, B, 0.012, frame, 4);
  }
  const nodes = new Set();
  for (let i = 0; i < pos.count; i++) { const v = P(i); if (v[3] < 0.05) continue; const k = v.slice(0, 3).map(n => n.toFixed(2)).join(','); if (nodes.has(k)) continue; nodes.add(k); ball(g, 0.024, node, v[0], v[1], v[2], 6); }
  // entrance + lamps outside
  box(g, 0.4, 0.22, 0.2, M('#c9d2dc', 0.5, 0.35), 0, y, rad + 0.08); box(g, 0.3, 0.14, 0.005, glowMat('#ffe9c0', WARM, 0.3), 0, y + 0.02, rad + 0.181);
  for (const [x, z] of [[1.8, 1.8], [-1.8, 1.8], [1.8, -1.8], [-1.8, -1.8]]) lampPost(g, x, z, y, 0.26);
  return g;
}

// ---------------------------------------------------------------- registry
addRecipes({
  'pk-pocket': { name: 'Pocket Park', group: 'parks', size: [1, 1], blurb: 'A scrap of lawn: a couple of glowing trees, benches, a lamp and a bed of night flowers.',
    params: [{ key: 'trees', label: 'Trees', min: 1, max: 3, step: 1, def: 2 }], build: buildPocket },
  'pk-fountain': { name: 'Fountain Square', group: 'parks', size: [1, 1], blurb: 'A paved square round a tiered fountain whose jets glow cyan at night.',
    params: [{ key: 'tiers', label: 'Tiers', min: 1, max: 2, step: 1, def: 2 }], build: buildFountainSq },
  'pk-playground': { name: 'Playground', group: 'parks', size: [1, 1], blurb: 'Slide tower, swings, a climbing dome and a springy ride on a soft floor.',
    params: [], build: buildPlayground },
  'pk-court': { name: 'Sports Court', group: 'parks', size: [2, 1], blurb: 'A fenced court with glowing lines and floodlights: hoops or a net.',
    params: [{ key: 'sport', label: 'Sport', min: 0, max: 1, step: 1, def: 0, names: ['Hoops', 'Net'] }], build: buildCourt },
  'pk-promenade': { name: 'Promenade', group: 'parks', size: [3, 1], blurb: 'A boardwalk with a glowing rail, tree planters, benches, lamps and a snack kiosk.',
    params: [{ key: 'kiosk', label: 'Kiosk', min: 0, max: 1, step: 1, def: 1, names: ['No', 'Yes'] }], build: buildPromenade },
  'pk-garden': { name: 'Hydro Garden', group: 'parks', size: [2, 2], blurb: 'Raised hydroponic beds under violet grow-lights, a greenhouse dome and a water tank.',
    params: [{ key: 'rows', label: 'Bed rows', min: 2, max: 4, step: 1, def: 3 }], build: buildGarden },
  'pk-skate': { name: 'Skate Park', group: 'parks', size: [2, 2], blurb: 'A bowl, a quarter pipe, a funbox with a rail, stairs and a glowing graffiti wall.',
    params: [], build: buildSkate },
  'pk-memorial': { name: 'Founders\' Memorial', group: 'parks', size: [2, 2], blurb: 'An obelisk with glowing seams over reflecting pools and an eternal flame.',
    params: [{ key: 'height', label: 'Obelisk', min: 0, max: 2, step: 1, def: 1 }], build: buildMemorial },
  'pk-neon': { name: 'Neon Night Plaza', group: 'parks', size: [2, 2], blurb: 'A dark plaza that comes alive at night: a lit floor grid, neon arches, holo pillars, food stalls.',
    params: [{ key: 'rings', label: 'Sculpture rings', min: 1, max: 4, step: 1, def: 3 }], build: buildNeonPlaza },
  'pk-terrace': { name: 'Sky Terrace Gardens', group: 'parks', size: [2, 2], blurb: 'Rooftop-style garden decks stacked on pillars, with glowing railings and a lift core.',
    params: [{ key: 'decks', label: 'Decks', min: 1, max: 3, step: 1, def: 3 }], build: buildTerrace },
  'pk-central': { name: 'Central Park', group: 'parks', size: [3, 3], blurb: 'A big lawn with a ring path, a pond and footbridge, a pavilion and dozens of trees.',
    params: [{ key: 'trees', label: 'Trees', min: 6, max: 24, step: 1, def: 16 }], build: buildCentral },
  'pk-amphi': { name: 'Amphitheatre', group: 'parks', size: [3, 3], blurb: 'Stepped seats facing a stage under a curved canopy with spotlights and side screens.',
    params: [{ key: 'rows', label: 'Seat rows', min: 2, max: 5, step: 1, def: 4 }], build: buildAmphi },
  'pk-biodome': { name: 'Grand Biodome', group: 'parks', size: [4, 4], blurb: 'A jungle under a geodesic frame with glowing nodes, on a ring wall with an entrance hall.',
    params: [{ key: 'height', label: 'Height', min: 0, max: 2, step: 1, def: 1 }], build: buildBiodome },
});
for (const id of ['svc-park', 'svc-arena']) if (RECIPES[id]) RECIPES[id].group = 'parks';
