// City quarters (Overdrive Frame round 7, "add a variety of map layouts"): the pieces the new city layouts stand in
// their streets besides the ordinary buildings — park trees and planters (City park, Ring plaza, Megablocks), freight
// cars, a signal box and a station (Rail yard), ship-to-shore cranes and container stacks (Harbour front), and a
// giant podium tower (Megablocks). Water, bridges, quays, piers, rails and paths are ground the game draws itself
// (prototypes/overdrive-frame/js/render/city-ground.js). Same contract as buildings.js: ground origin at the lot
// centre, nothing outside ±size/2.
//
// Trees and planters draw their OWN damage stages (`noWreck` + a Damage param), like the forest kit: the city's wreck
// turns anything into concrete slabs. A tree loses half its crown and drops a bough (1), burns (2), and is left a
// charred stump with its trunk lying beside it (3). Everything else gets the common wreck stages.
//
// Scale: 1 unit = 1 tile = 16 m; a frame is 0.75 tall. A street tree is 0.8–0.95 (13–15 m), a freight car 0.3 tall,
// a container 0.16 (2.6 m) a layer, a dock crane 2.3 (37 m). Freight cars and containers are drawn a little wider
// than real ones so a tile-wide lot reads as what it is.
import * as THREE from 'three';
import { addRecipes } from './buildings.js';
import { DAMAGE_NAMES } from './wreck.js';
import { box, cyl, storeys, slab, neonEdges, roofProps, lotPad, bodyMat, neonMat, glassMat, FLOOR, STYLES } from './shapes.js';

const cache = new Map();
const cached = (k, make) => { if (!cache.has(k)) cache.set(k, make()); return cache.get(k); };
const f3 = n => n.toFixed(3);

const BARK = '#5b4636', BARK_D = '#3a2c22', CHAR = '#262420', ASH = '#3b3934', CONCRETE = '#a7a49c', CONCRETE_D = '#85837c';
const LEAVES = ['#4f8f3a', '#5a9a40', '#467f36', '#62a046', '#3f7a34'], AUTUMN = ['#b8862e', '#a8622a'];
const STEEL = '#8b939b', DARK = '#33373d', YELLOW = '#e0b02a', RUST = '#8e4a2a';
const BOX_COL = ['#8a3a2a', '#2f5d7c', '#3f6b3a', '#7a5a2a', '#5b5f66', '#9a4a2a'];
const CONT_COL = ['#c0392b', '#2f6fa8', '#e0a12a', '#3f8a4a', '#d2d0c8', '#7a4fa0', '#d0652a', '#2a8a8a'];
const WARM = '#ffd18a', RED = '#ff3030', GREEN = '#7dff6a', AMBER = '#ffb02e', FIRE = '#ff8a2a';

const M = (color, metal = 0.2, rough = 0.7) => bodyMat('chrome', 0, { color, metal, rough });
function lamp(day, glow, dayGlow = 0) {
  return cached(`qlamp:${day}:${glow}:${dayGlow}`, () => {
    const m = new THREE.MeshStandardMaterial({ color: day, emissive: glow, emissiveIntensity: 1, roughness: 0.4, metalness: 0.1 });
    m.userData.glow = true; m.userData.dayGlow = dayGlow; return m;
  });
}
const fireMat = () => lamp('#ff7a1a', FIRE, 0.95), emberMat = () => lamp('#5a2a14', '#ff6a1a', 0.55);
const leafMat = c => cached(`qleaf:${c}`, () => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, metalness: 0, flatShading: true }));
function add(parent, geo, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; }
const G = (k, make) => cached('qg:' + k, make);
const blob = (p, r, mat, x, y, z) => add(p, G(`ico${f3(r)}`, () => new THREE.IcosahedronGeometry(r, 1)), mat, x, y, z);
const cone = (p, r, h, mat, x, y, z, seg = 6) => add(p, G(`cone${f3(r)}:${f3(h)}:${seg}`, () => new THREE.ConeGeometry(r, h, seg)), mat, x, y + h / 2, z);
function rod(p, a, b, r, mat, seg = 5) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), L = d.length();
  const m = add(p, G(`rod${f3(r)}:${f3(L)}:${seg}`, () => new THREE.CylinderGeometry(r, r, L, seg)), mat, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); return m;
}
const beacon = (p, x, y, z, color = RED, s = 0.03) => box(p, s, s, s, neonMat(color, 0.9), x, y, z);

// ---------------------------------------------------------------- trees and planters
/** One broadleaf tree at (x, z) of height H: a trunk that forks, a crown of leaf clumps. stage = damage 0..3. */
function tree(g, x, z, H, R, stage, { y = 0, color = null } = {}) {
  const c = color || LEAVES[R.int(0, LEAVES.length - 1)], k = H / 0.9;
  if (stage >= 3) {          // a charred stump, the trunk lying beside it, embers
    cyl(g, 0.045 * k, 0.07, M(CHAR, 0, 0.95), x, y, z, { rt: 0.035 * k, seg: 7 });
    const a = R.range(0, Math.PI * 2), L = 0.34 * k;
    rod(g, [x + Math.cos(a) * 0.06, y + 0.035, z + Math.sin(a) * 0.06], [x + Math.cos(a) * (0.06 + L), y + 0.03, z + Math.sin(a) * (0.06 + L)], 0.03 * k, M(CHAR, 0, 0.95), 6);
    for (let i = 0; i < 3; i++) blob(g, 0.022, emberMat(), x + R.range(-0.12, 0.12), y + 0.015, z + R.range(-0.12, 0.12));
    return;
  }
  const trunk = M(stage >= 2 ? BARK_D : BARK, 0, 0.95), th = 0.42 * H;
  cyl(g, 0.04 * k, th, trunk, x, y, z, { rt: 0.026 * k, seg: 7 });
  // the fork: two limbs up into the crown
  for (const s of [-1, 1]) rod(g, [x, y + th * 0.85, z], [x + s * 0.08 * k, y + th * 1.25, z + s * 0.03 * k], 0.016 * k, trunk, 5);
  const leaf = stage >= 2 ? leafMat('#2a2a22') : leafMat(c), leaf2 = stage >= 2 ? leafMat(ASH) : leafMat(R.chance(0.12) ? AUTUMN[R.int(0, 1)] : shadeHex(c, 0.12));
  const n = stage === 1 ? 3 : 6;
  for (let i = 0; i < n; i++) {
    const a = i / 6 * Math.PI * 2 + R.range(-0.3, 0.3), rr = i === 0 ? 0 : R.range(0.08, 0.15) * k;
    const yy = y + th + (i === 0 ? 0.24 : R.range(0.08, 0.22)) * k, s = (i === 0 ? 0.2 : R.range(0.13, 0.17)) * k;
    blob(g, s, i % 2 ? leaf2 : leaf, x + Math.cos(a) * rr, yy, z + Math.sin(a) * rr);
    if (stage === 2 && R.chance(0.7)) cone(g, 0.05 * k, 0.14 * k, fireMat(), x + Math.cos(a) * rr, yy + s * 0.5, z + Math.sin(a) * rr, 5);
  }
  if (stage === 1) {         // a bough down on the ground beside it
    const a = R.range(0, Math.PI * 2), cl = v => Math.max(-0.36, Math.min(0.36, v));     // the bough stays inside a 1-tile lot
    const ex = cl(x + Math.cos(a) * 0.3), ez = cl(z + Math.sin(a) * 0.3);
    rod(g, [x + Math.cos(a) * 0.05, y + 0.02, z + Math.sin(a) * 0.05], [ex, y + 0.03, ez], 0.014 * k, trunk, 5);
    blob(g, 0.09 * k, leaf, ex, y + 0.05, ez);
  }
}
function shadeHex(hex, k) { const c = new THREE.Color(hex); const t = k < 0 ? 0 : 1, a = Math.abs(k); c.r += (t - c.r) * a; c.g += (t - c.g) * a; c.b += (t - c.b) * a; return '#' + c.getHexString(); }
/** A patch of lawn with a kerb, a little inside the lot. */
function lawn(g, w, d, stage, color = '#4f7f3a') {
  box(g, w * 0.94, 0.02, d * 0.94, M(CONCRETE_D, 0, 0.95), 0, 0, 0);
  box(g, w * 0.88, 0.012, d * 0.88, M(stage >= 2 ? '#3a3a2c' : color, 0, 0.98), 0, 0.02, 0);
  return 0.032;
}
function bush(g, x, z, y, s, R, stage) { const c = stage >= 2 ? ASH : LEAVES[R.int(0, LEAVES.length - 1)]; for (let i = 0; i < 3; i++) blob(g, s * R.range(0.7, 1), leafMat(shadeHex(c, -0.1)), x + R.range(-s, s) * 0.6, y + s * 0.6, z + R.range(-s, s) * 0.6); }

function buildTree(p) {
  const g = new THREE.Group(), R = p.R, st = p.damage | 0, y = lawn(g, 1, 1, st);
  if (p.pair) { tree(g, -0.18, -0.12, R.range(0.7, 0.82), R, st, { y }); tree(g, 0.2, 0.16, R.range(0.78, 0.9), R, st, { y }); }
  else tree(g, R.range(-0.06, 0.06), R.range(-0.06, 0.06), R.range(0.82, 0.92), R, st, { y });
  if (st < 3) bush(g, 0.3, -0.3, y, 0.06, R, st);
  // a bench and a lamp at the kerb (warm light at night)
  box(g, 0.2, 0.025, 0.06, M('#6a4a30', 0, 0.9), -0.28, y + 0.04, 0.36); for (const s of [-1, 1]) box(g, 0.02, 0.04, 0.05, M(DARK), -0.28 + s * 0.08, y, 0.36);
  cyl(g, 0.008, 0.3, M(STEEL, 0.5, 0.4), 0.38, y, 0.38, { seg: 5 }); box(g, 0.05, 0.025, 0.04, lamp('#fff1cf', WARM, 0.2), 0.38, y + 0.3, 0.38);
  return g;
}
function buildGrove(p) {
  const g = new THREE.Group(), R = p.R, st = p.damage | 0, y = lawn(g, 2, 2, st);
  const spots = [[-0.5, -0.45], [0.45, -0.5], [-0.45, 0.45], [0.5, 0.45], [0, 0], [-0.05, -0.75], [0.75, 0.05]];
  const n = 4 + (p.seed % 3);
  for (let i = 0; i < n; i++) { const [x, z] = spots[i]; tree(g, x + R.range(-0.08, 0.08), z + R.range(-0.08, 0.08), R.range(0.72, 0.98), R, st, { y }); }
  if (st < 3) for (let i = 0; i < 4; i++) bush(g, R.range(-0.8, 0.8), R.range(-0.8, 0.8), y, R.range(0.05, 0.08), R, st);
  // a path stone or two and a lamp
  cyl(g, 0.008, 0.3, M(STEEL, 0.5, 0.4), 0.85, y, 0.85, { seg: 5 }); box(g, 0.05, 0.025, 0.04, lamp('#fff1cf', WARM, 0.2), 0.85, y + 0.3, 0.85);
  return g;
}
function buildPlanter(p) {
  const g = new THREE.Group(), R = p.R, st = p.damage | 0;
  const conc = M(st >= 2 ? '#6f6c66' : CONCRETE, 0.05, 0.9);
  if (st >= 3) {            // broken concrete, scattered soil
    for (let i = 0; i < 6; i++) { const m = box(g, R.range(0.12, 0.26), 0.05, R.range(0.06, 0.12), conc, R.range(-0.3, 0.3), 0, R.range(-0.3, 0.3)); m.rotation.y = R.range(0, 3); }
    box(g, 0.4, 0.02, 0.34, M('#3a2e24', 0, 1), 0, 0, 0);
    blob(g, 0.02, emberMat(), 0.05, 0.03, -0.05);
    return g;
  }
  const w = 0.72, h = 0.13, t = 0.05;
  box(g, w, 0.02, w, M(CONCRETE_D, 0, 0.95), 0, 0, 0);
  for (const s of [-1, 1]) { box(g, w, h, t, conc, 0, 0.02, s * (w - t) / 2); box(g, t, h, w - t * 2, conc, s * (w - t) / 2, 0.02, 0); }
  box(g, w - t * 2, 0.02, w - t * 2, M('#4a3a2a', 0, 1), 0, 0.02 + h - 0.03, 0);
  if (st === 1) { const m = box(g, 0.14, 0.04, 0.06, conc, 0.42, 0, 0.1); m.rotation.y = 0.6; }   // a chunk knocked off
  const kind = p.seed % 3, y = 0.02 + h - 0.01;
  if (kind === 0) for (let i = 0; i < 4; i++) bush(g, R.range(-0.18, 0.18), R.range(-0.18, 0.18), y, 0.07, R, st);
  else if (kind === 1) { tree(g, 0, 0, 0.6, R, Math.min(st, 2), { y }); }
  else for (let i = 0; i < 6; i++) cone(g, 0.04, 0.12, leafMat(st >= 2 ? ASH : '#3f7a34'), R.range(-0.2, 0.2), y, R.range(-0.2, 0.2), 5);
  if (st === 2) for (let i = 0; i < 2; i++) cone(g, 0.04, 0.12, fireMat(), R.range(-0.15, 0.15), y + 0.04, R.range(-0.15, 0.15), 5);
  // a lit strip round the rim (night)
  neonEdges(g, w - 0.02, w - 0.02, '#3ff0ff', 0, 0.02 + h, 0, 0.012, 0.15);
  return g;
}

// ---------------------------------------------------------------- rail yard
const CAR_L = 1.86, CAR_W = 0.46;
/** A bogie (a pair of axles) at x. */
function bogie(g, x, y = 0.03) { box(g, 0.34, 0.05, CAR_W * 0.7, M(DARK, 0.5, 0.5), x, y, 0); for (const dx of [-0.1, 0.1]) for (const s of [-1, 1]) cyl(g, 0.045, 0.02, M('#2a2c30', 0.6, 0.4), x + dx, y - 0.015, s * CAR_W * 0.32, { seg: 10 }).rotation.x = Math.PI / 2; }
function buildBoxcar(p) {
  const g = new THREE.Group(), R = p.R, kind = p.kind | 0;
  // the track bed under it (sleepers + rails match the ground drawing's track)
  for (let x = -0.92; x <= 0.92; x += 0.16) box(g, 0.06, 0.012, 0.36, M('#4a3c30', 0, 1), x, 0, 0);
  for (const s of [-1, 1]) box(g, 1.98, 0.016, 0.022, M('#9aa0a6', 0.7, 0.3), 0, 0.012, s * 0.15);
  bogie(g, -0.62); bogie(g, 0.62);
  const deckY = 0.085;
  box(g, CAR_L, 0.03, CAR_W, M(DARK, 0.4, 0.5), 0, deckY - 0.03, 0);                      // the frame
  for (const s of [-1, 1]) { box(g, 0.05, 0.03, 0.04, M('#222', 0.5, 0.5), s * (CAR_L / 2 + 0.02), deckY - 0.02, 0); }   // couplers
  const col = BOX_COL[(p.seed + kind) % BOX_COL.length];
  if (kind === 0) {           // box car: ribbed sides, a sliding door each side, a roof walk
    const H = 0.22, body = M(col, 0.25, 0.6);
    box(g, CAR_L - 0.04, H, CAR_W - 0.02, body, 0, deckY, 0);
    for (let x = -CAR_L / 2 + 0.12; x < CAR_L / 2 - 0.05; x += 0.12) for (const s of [-1, 1]) box(g, 0.014, H - 0.02, 0.012, M(shadeHex(col, -0.25), 0.3, 0.6), x, deckY + 0.01, s * (CAR_W / 2));
    for (const s of [-1, 1]) box(g, 0.3, H - 0.04, 0.014, M(shadeHex(col, 0.1), 0.3, 0.6), R.range(-0.2, 0.2), deckY + 0.015, s * (CAR_W / 2 + 0.004));
    box(g, CAR_L - 0.1, 0.012, 0.08, M(DARK, 0.4, 0.6), 0, deckY + H, 0);
  } else if (kind === 1) {    // flat car with one or two containers
    const n = 1 + (p.seed % 2), L = n === 1 ? 1.2 : 0.86;
    for (let i = 0; i < n; i++) container(g, n === 1 ? 0 : (i ? 0.45 : -0.45), deckY, 0, L, CAR_W - 0.04, CONT_COL[(p.seed + i * 3) % CONT_COL.length]);
  } else if (kind === 2) {    // tank car: a long cylinder, a hazard band, a walkway and a dome
    const tank = cyl(g, CAR_W * 0.46, CAR_L - 0.12, M(p.seed % 2 ? '#2a2c30' : '#d8d6cf', 0.45, 0.4), 0, deckY + CAR_W * 0.46 + 0.01, 0, { seg: 16 });
    tank.rotation.z = Math.PI / 2; tank.position.y = deckY + CAR_W * 0.46 + 0.01;
    box(g, 0.1, CAR_W * 0.94, CAR_W * 0.94, M('#ff7a1c', 0.3, 0.5), 0, deckY + 0.02, 0);      // the hazard band
    cyl(g, 0.06, 0.05, M(STEEL, 0.5, 0.4), 0, deckY + CAR_W * 0.92, 0, { seg: 10 });
    beacon(g, CAR_L / 2 - 0.1, deckY + CAR_W * 0.95, 0, AMBER, 0.022);
  } else {                    // hopper: sloped bins, ore heaped in the top
    const body = M(col, 0.25, 0.6);
    for (const x of [-0.45, 0.45]) {
      box(g, 0.84, 0.18, CAR_W - 0.02, body, x, deckY + 0.04, 0);
      const ch = add(g, G('hopch', () => new THREE.CylinderGeometry(0.0, 0.16, 0.08, 4)), body, x, deckY + 0.02, 0); ch.rotation.y = Math.PI / 4; ch.rotation.z = Math.PI;
      blob(g, 0.17, M(p.seed % 2 ? '#3a342c' : '#8a7a5a', 0, 1), x, deckY + 0.2, 0).scale.set(2.2, 0.35, 1.1);
    }
  }
  // a red tail lamp at each end (night)
  for (const s of [-1, 1]) box(g, 0.012, 0.02, 0.02, neonMat(RED, 0.5), s * (CAR_L / 2 - 0.005), deckY + 0.05, CAR_W * 0.3);
  return g;
}
/** A shipping container lying along x: corrugated sides, end doors, corner castings. Returns its top. */
function container(g, x, y, z, L, W, color, H = 0.16) {
  const body = M(color, 0.3, 0.6), rib = M(shadeHex(color, -0.22), 0.3, 0.6);
  box(g, L, H, W, body, x, y, z);
  for (let k = -L / 2 + 0.05; k < L / 2 - 0.02; k += 0.06) for (const s of [-1, 1]) box(g, 0.012, H - 0.02, 0.008, rib, x + k, y + 0.01, z + s * W / 2);
  for (const s of [-1, 1]) box(g, 0.008, H - 0.02, W - 0.03, rib, x + s * L / 2, y + 0.01, z);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, 0.022, 0.022, 0.022, M('#2a2a2a', 0.5, 0.5), x + sx * (L / 2 - 0.011), y + H - 0.022, z + sz * (W / 2 - 0.011));
  return y + H;
}
function buildContainers(p) {
  const g = new THREE.Group(), R = p.R, n = Math.max(1, Math.min(4, p.floors | 0));
  box(g, 1.96, 0.02, 0.96, M('#7d7b74', 0, 0.95), 0, 0, 0);
  const L = 0.92, W = 0.44, H = 0.16;
  for (let lv = 0; lv < n; lv++) for (const x of [-0.47, 0.47]) for (const z of [-0.235, 0.235]) {
    if (lv === n - 1 && n > 1 && R.chance(0.25)) continue;                 // a gap on the top layer
    container(g, x + R.range(-0.01, 0.01), 0.02 + lv * H, z, L, W, CONT_COL[R.int(0, CONT_COL.length - 1)], H - 0.004);
  }
  return g;
}
function buildSignal(p) {
  const g = new THREE.Group(), R = p.R, y0 = lotPad(g, 0.8, 0.8, '#6a645c');
  // a signal box raised on a brick base: a windowed cab with a hip roof, stairs up the side, a signal mast beside it
  const brick = M('#8a4a36', 0.05, 0.9), cab = M('#c9c2b0', 0.1, 0.7);
  box(g, 0.5, 0.36, 0.42, brick, -0.08, y0, 0.05);
  box(g, 0.54, 0.2, 0.46, cab, -0.08, y0 + 0.36, 0.05);
  for (const [fx, fz, w, d] of [[-0.08, 0.282, 0.44, 0.01], [0.192, 0.05, 0.01, 0.36]]) box(g, w, 0.1, d, lamp('#3d5566', '#ffe2a8', 0), fx, y0 + 0.43, fz);
  const roof = add(g, G('sigroof', () => new THREE.ConeGeometry(0.42, 0.14, 4)), M('#4a4f56', 0.3, 0.6), -0.08, y0 + 0.63, 0.05); roof.rotation.y = Math.PI / 4;
  for (let k = 0; k < 6; k++) box(g, 0.12, 0.02, 0.06, M(STEEL, 0.4, 0.5), 0.26, y0 + k * 0.06, 0.32 - k * 0.04);
  // the mast with three lamps (red / amber / green) and a little hood over each
  cyl(g, 0.016, 0.85, M(STEEL, 0.5, 0.4), 0.3, y0, -0.3, { seg: 6 });
  box(g, 0.08, 0.24, 0.05, M(DARK, 0.4, 0.5), 0.3, y0 + 0.6, -0.27);
  [RED, AMBER, GREEN].forEach((c, i) => box(g, 0.035, 0.035, 0.012, neonMat(c, i === (p.seed % 3) ? 0.9 : 0.15), 0.3, y0 + 0.79 - i * 0.07, -0.243));
  beacon(g, -0.08, y0 + 0.72, 0.05, RED, 0.025);
  void R; return g;
}
function buildStation(p) {
  const g = new THREE.Group(), y0 = lotPad(g, 3, 2, '#6d6a64');
  // the hall: a long two-storey brick-and-glass building along the platform (+z faces the tracks)
  const brick = M('#9a5a40', 0.05, 0.85), trim = M('#d8d2c2', 0.1, 0.6);
  const top = storeys(g, { w: 2.6, d: 1.0, floors: 2, y: y0, z: -0.35, style: p.style, kind: 'grid', seed: p.seed });
  box(g, 2.66, 0.04, 1.06, trim, 0, top, -0.35);
  box(g, 0.5, 0.3, 0.5, brick, -0.95, top + 0.04, -0.35);                       // the clock tower
  cyl(g, 0.11, 0.02, lamp('#f4efe2', '#fff1cf', 0.3), -0.95, top + 0.22, -0.09, { seg: 16 }).rotation.x = Math.PI / 2;
  const tr = add(g, G('stroof', () => new THREE.ConeGeometry(0.4, 0.2, 4)), M('#3e5a50', 0.3, 0.6), -0.95, top + 0.44, -0.35); tr.rotation.y = Math.PI / 4;
  // the canopy over the platform side: a long roof on columns, lights under it
  const canopyY = y0 + 0.36;
  for (let x = -1.3; x <= 1.31; x += 0.52) cyl(g, 0.016, canopyY - y0, M(STEEL, 0.5, 0.4), x, y0, 0.86, { seg: 6 });
  box(g, 2.9, 0.03, 0.9, M('#5d7a8a', 0.4, 0.4), 0, canopyY, 0.5);
  box(g, 2.9, 0.012, 0.9, glassMat(p.style), 0, canopyY + 0.03, 0.5);
  for (let x = -1.1; x <= 1.11; x += 0.55) box(g, 0.2, 0.012, 0.04, lamp('#fff8e8', WARM, 0.15), x, canopyY - 0.012, 0.5);
  // benches and a sign board on the platform side
  for (const x of [-0.6, 0.6]) box(g, 0.22, 0.04, 0.06, M('#6a4a30', 0, 0.9), x, y0 + 0.04, 0.4);
  box(g, 0.5, 0.1, 0.02, neonMat('#3ff0ff', 0.5), 0.4, canopyY - 0.12, 0.92);
  return g;
}

// ---------------------------------------------------------------- harbour
function buildCrane(p) {
  const g = new THREE.Group(), R = p.R, y0 = 0;
  const paint = M(p.seed % 2 ? '#2f6fa8' : '#d0652a', 0.35, 0.5), white = M('#e6e4dc', 0.3, 0.5), steel = M(STEEL, 0.5, 0.4);
  // rails under the legs, the portal (four legs) and the cross beams
  for (const z of [-0.78, 0.78]) box(g, 1.96, 0.02, 0.06, M('#8a8f96', 0.7, 0.3), 0, 0, z);
  const legs = [[-0.75, -0.78], [0.75, -0.78], [-0.75, 0.78], [0.75, 0.78]], H = 1.35;
  for (const [x, z] of legs) { box(g, 0.2, 0.08, 0.16, M(DARK, 0.5, 0.5), x, y0, z); box(g, 0.1, H, 0.1, paint, x, y0 + 0.08, z); }
  for (const z of [-0.78, 0.78]) { box(g, 1.6, 0.08, 0.1, paint, 0, y0 + 0.5, z); box(g, 1.6, 0.12, 0.12, paint, 0, y0 + H, z); }
  for (const x of [-0.75, 0.75]) { box(g, 0.1, 0.1, 1.66, paint, x, y0 + H + 0.02, 0); rod(g, [x, y0 + 0.55, -0.78], [x, y0 + H, 0.78], 0.02, paint, 4); }
  // the main girder across the top (along z: out over the water at −z, back over the apron), the trolley, the cab
  const gy = y0 + H + 0.12;
  box(g, 0.34, 0.14, 1.96, white, 0, gy, 0);
  box(g, 0.24, 0.1, 0.24, M(YELLOW, 0.3, 0.5), 0, gy - 0.1, -0.2 + R.range(-0.3, 0.3));
  box(g, 0.2, 0.14, 0.18, M('#d8d6cf', 0.2, 0.5), 0.18, gy - 0.16, -0.35);
  box(g, 0.16, 0.08, 0.01, lamp('#3d5566', '#ffe2a8', 0), 0.18, gy - 0.12, -0.441);
  // the machinery house on top, the A-frame and the boom raised (stowed upright over the water side)
  box(g, 0.5, 0.2, 0.6, white, 0, gy + 0.14, 0.45);
  for (const s of [-1, 1]) rod(g, [s * 0.15, gy + 0.14, 0.2], [s * 0.05, gy + 0.72, -0.05], 0.025, paint, 4);
  for (const s of [-1, 1]) rod(g, [s * 0.12, gy + 0.14, -0.6], [s * 0.08, gy + 0.78, -0.82], 0.035, white, 4);
  box(g, 0.24, 0.06, 0.08, white, 0, gy + 0.76, -0.82);
  for (const s of [-1, 1]) rod(g, [s * 0.05, gy + 0.72, -0.05], [s * 0.08, gy + 0.78, -0.8], 0.01, steel, 3);
  // hazard stripes at the leg feet, red lights on the top and the boom tip, floodlights under the girder
  for (const [x, z] of legs) for (let k = 0; k < 2; k++) box(g, 0.104, 0.03, 0.104, M(k % 2 ? DARK : YELLOW, 0.3, 0.5), x, y0 + 0.1 + k * 0.03, z);
  beacon(g, 0, gy + 0.84, -0.82, RED, 0.035); beacon(g, 0, gy + 0.78, -0.05, RED, 0.03);
  for (const z of [-0.8, 0.8]) box(g, 0.06, 0.03, 0.04, lamp('#fff8e8', '#fff1cf', 0.25), 0, gy - 0.02, z);
  return g;
}

// ---------------------------------------------------------------- megablocks
function buildMegatower(p) {
  const g = new THREE.Group(), R = p.R, y0 = lotPad(g, 4, 4, '#5a616c');
  const st = STYLES[p.style] ? p.style : 'chrome', neon = STYLES[st].neon[p.seed % STYLES[st].neon.length];
  // the podium: three storeys of shops filling most of the lot, a glass lobby band, a planted roof terrace
  const pod = storeys(g, { w: 3.7, d: 3.7, floors: 3, y: y0, style: st, kind: 'bands', seed: p.seed });
  slab(g, 3.8, 3.8, st, 0, pod);
  neonEdges(g, 3.8, 3.8, neon, 0, pod + 0.04, 0, 0.025, 0.3);
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, x = Math.cos(a) * 1.55, z = Math.sin(a) * 1.55; box(g, 0.28, 0.06, 0.28, M(CONCRETE, 0.05, 0.9), x, pod + 0.04, z); blob(g, 0.11, leafMat(LEAVES[i % LEAVES.length]), x, pod + 0.17, z); }
  // the tower: set back on the podium, a step in at two thirds of its height, a crown of neon and a mast
  const floors = Math.max(8, p.floors | 0), lo = Math.round(floors * 0.66), ox = R.range(-0.25, 0.25), oz = R.range(-0.25, 0.25);
  let y = storeys(g, { w: 2.5, d: 2.5, floors: lo, x: ox, z: oz, y: pod + 0.04, style: st, kind: 'curtain', seed: p.seed + 1 });
  y = slab(g, 2.6, 2.6, st, ox, y, oz);
  neonEdges(g, 2.6, 2.6, neon, ox, y, oz, 0.025, 0.3);
  y = storeys(g, { w: 1.9, d: 1.9, floors: floors - lo, x: ox, z: oz, y, style: st, kind: 'curtain', seed: p.seed + 2 });
  y = slab(g, 2.0, 2.0, st, ox, y, oz);
  for (let k = 0; k < 3; k++) neonEdges(g, 1.6 - k * 0.3, 1.6 - k * 0.3, neon, ox, y + 0.06 + k * 0.08, oz, 0.02, 0.35);
  roofProps(g, 1.6, 1.6, y, st, R, { helipad: floors >= 20, antenna: true, x: ox, z: oz });
  return g;
}

const DAMAGE = { key: 'damage', label: 'Damage', min: 0, max: 3, step: 1, def: 0, names: DAMAGE_NAMES };
const GREEN_P = { group: 'parks', noWreck: true };
addRecipes({
  'qt-tree': { ...GREEN_P, name: 'Street Tree', size: [1, 1], params: [{ key: 'pair', label: 'Trees', min: 0, max: 1, step: 1, def: 0, names: ['One', 'Two'] }, DAMAGE],
    blurb: 'A broadleaf tree (or two) on a kerbed patch of lawn with a bench and a lamp. Damaged drops a bough, burning sets the crown alight, rubble leaves a charred stump.', build: buildTree },
  'qt-grove': { ...GREEN_P, name: 'Tree Clump', size: [2, 2], params: [DAMAGE],
    blurb: 'Four to six park trees over shrubs on a lawn: the cover in a city park. They lose their crowns, burn and come down to stumps.', build: buildGrove },
  'qt-planter': { ...GREEN_P, name: 'Planter', size: [1, 1], params: [DAMAGE],
    blurb: 'A concrete planter with shrubs, a small tree or reeds and a lit rim: plaza cover low enough to jump onto.', build: buildPlanter },
  'qt-boxcar': { group: 'industry', genre: ['industrial'], name: 'Freight Car', size: [2, 1], params: [{ key: 'kind', label: 'Kind', min: 0, max: 3, step: 1, def: 0, names: ['Box car', 'Flat + containers', 'Tank car', 'Hopper'] }],
    blurb: 'A freight car on its stretch of track: box car, flat car with containers, tank car (it burns) or ore hopper. Low enough for a frame to jump onto.', build: buildBoxcar },
  'qt-signal': { group: 'industry', genre: ['industrial'], name: 'Signal Box', size: [1, 1], params: [],
    blurb: 'A rail yard signal box: a windowed cab on a brick base, stairs up the side, a three-lamp signal mast.', build: buildSignal },
  'qt-station': { group: 'services', name: 'Rail Station', size: [3, 2], params: [],
    blurb: 'A two-storey station hall with a clock tower and a long glass canopy over the platform side, lit underneath.', build: buildStation },
  'qt-crane': { group: 'industry', genre: ['industrial'], name: 'Dock Crane', size: [2, 2], params: [],
    blurb: 'A ship-to-shore container crane on its rails: a painted portal, the main girder with trolley and cab, the boom raised over the water side.', build: buildCrane },
  'qt-containers': { group: 'industry', genre: ['industrial'], name: 'Container Stack', size: [2, 1], params: [{ key: 'floors', label: 'Layers', min: 1, max: 4, step: 1, def: 2 }],
    blurb: 'Shipping containers two long and two wide, one to four high, in mixed colours, some missing off the top.', build: buildContainers },
  'qt-megatower': { group: 'shops', name: 'Megatower', size: [4, 4], params: [{ key: 'floors', label: 'Storeys', min: 8, max: 30, step: 1, def: 18 }],
    blurb: 'A giant tower on a three-storey podium with a planted roof terrace: glass curtain walls, a set-back at two thirds, a neon crown.', build: buildMegatower },
});
