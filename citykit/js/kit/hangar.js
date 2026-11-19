// Hangar pieces (Overdrive Frame round 2): the walls, bays, service spines and safety rail of the walkable hangar hub,
// plus the test range's targets. Same scale as workshop.js (1 unit = 1 tile = 16 m; a mech is 0.75 tall, so the back
// walls at 1.9 are ~30 m). Every bay has a lit neon sign with a word-free pictogram in its own colour (the game paints
// the bay's name on the floor), so the bays read from across the hangar at night.
//
// Wall pieces are built along x (length `len` tiles) with their working face toward +z; the game turns them with the
// lot's `rot` for the other back wall. Nothing sticks out past ±len/2 in x or ±0.5 in z.
import * as THREE from 'three';
import { addRecipes, GROUPS } from './buildings.js';
import { box, cyl, bodyMat, neonMat, glassMat } from './shapes.js';

if (!GROUPS.some(g => g.id === 'hangar')) GROUPS.push({ id: 'hangar', label: 'Hangar & test range' });

const mat = (color, metal = 0.45, rough = 0.55) => bodyMat('graphite', 0, { color, metal, rough });
const STEEL = '#6f7883', DARK = '#2a2f37', PANEL = '#4b525c', CONC = '#5d6168', HAZ = '#e3b52c', BLACK = '#1b1d21';
/** Bay colours by station (match prototypes/overdrive-frame/js/sim/hangarmap.js BAYS). */
export const STATIONS = [
  ['Contracts terminal', '#3ff0ff'], ['Assembly bay', '#ffb02e'], ['Parts dealer', '#5fffb0'],
  ['Workshop', '#ff7a3a'], ['Paint bay', '#ff5adf'], ['Test range door', '#ff4a4a'], ['Tuning rig', '#7dff9a'],
];
const WALL_H = 1.9, BACK = 0.34;             // wall height, thickness of the wall slab (the rest of the tile is kit)
const zBack = -0.5 + BACK / 2, zFace = -0.5 + BACK;

/** A cylinder lying along x (len), centre at (x, y, z). */
function rodX(p, r, len, m, x, y, z) { const o = cyl(p, r, len, m, 0, 0, 0, { seg: 12 }); o.rotation.z = Math.PI / 2; o.position.set(x, y, z); return o; }
/** Yellow/black hazard band along x at height y on the face plane z. */
function hazard(p, len, y, z, h = 0.05, step = 0.08) {
  const yel = mat(HAZ, 0.2, 0.6), blk = mat(BLACK, 0.2, 0.7);
  for (let x = -len / 2, i = 0; x < len / 2 - 1e-6; x += step, i++) box(p, Math.min(step, len / 2 - x), h, 0.012, i % 2 ? blk : yel, x + Math.min(step, len / 2 - x) / 2, y, z);
}
/** Catwalk with a railing along the face at height y. */
function catwalk(p, len, y, color = '#ffa020') {
  const grate = mat('#59616b', 0.6, 0.5), rail = mat('#c9a030', 0.4, 0.5);
  box(p, len - 0.02, 0.025, 0.16, grate, 0, y, zFace + 0.08);
  box(p, len - 0.02, 0.012, 0.012, rail, 0, y + 0.07, zFace + 0.155);
  for (let x = -len / 2 + 0.12; x < len / 2; x += 0.3) box(p, 0.012, 0.07, 0.012, rail, x, y, zFace + 0.155);
  box(p, len - 0.04, 0.012, 0.03, neonMat(color, 0.35), 0, y - 0.015, zFace + 0.05);     // strip light under the deck
}

// ---------------------------------------------------------------- pictograms for the bay signs (in the x-y plane)
function icon(p, station, color, x, y, z, s = 0.12) {
  const g = new THREE.Group(); g.position.set(x, y, z); p.add(g);
  const n = neonMat(color, 0.85), t = 0.018;
  const bar = (w, h, bx, by) => box(g, w * s, h * s, t, n, bx * s, by * s - h * s / 2, 0);
  const ring = (r, tube) => { const m = new THREE.Mesh(new THREE.TorusGeometry(r * s, tube * s, 8, 32), n); g.add(m); return m; };
  switch (station) {
    case 0: bar(1.6, 0.14, 0, 0.6); bar(1.6, 0.14, 0, -0.5); bar(0.14, 1.1, -0.8, 0.6); bar(0.14, 1.1, 0.8, 0.6);      // a screen…
      bar(0.9, 0.12, -0.15, 0.3); bar(0.6, 0.12, -0.3, 0.05); bar(1.0, 0.12, -0.1, -0.2); break;                     // …with lines of text
    case 1: { ring(0.55, 0.13); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, m = box(g, 0.26 * s, 0.22 * s, t, n, Math.cos(a) * 0.72 * s, Math.sin(a) * 0.72 * s - 0.11 * s, 0); m.rotation.z = a; } break; }   // a gear
    case 2: { const d = box(g, 1.0 * s, 1.0 * s, t, n, 0, -0.5 * s, 0); d.rotation.z = Math.PI / 4; const h = box(g, 0.3 * s, 0.3 * s, t * 1.4, mat(BLACK), 0.22 * s, 0.07 * s, 0.004); h.rotation.z = Math.PI / 4; break; }   // a price tag
    case 3: { const hd = box(g, 1.2 * s, 0.4 * s, t, n, 0.1 * s, 0.3 * s, 0); hd.rotation.z = -0.5; const hn = box(g, 0.18 * s, 1.3 * s, t, n, -0.15 * s, -0.75 * s, 0); hn.rotation.z = -0.5; break; }   // a hammer
    case 4: { const b = new THREE.Mesh(new THREE.SphereGeometry(0.45 * s, 16, 12), n); b.position.y = -0.25 * s; g.add(b); const c = new THREE.Mesh(new THREE.ConeGeometry(0.4 * s, 0.75 * s, 16), n); c.position.y = 0.38 * s; g.add(c); break; }   // a paint drop
    case 6: for (let i = 0; i < 3; i++) { const x = (i - 1) * 0.55; bar(0.1, 1.3, x, 0.65); box(g, 0.34 * s, 0.2 * s, t * 1.3, n, x * s, ([0.3, -0.25, 0.1][i]) * s, 0.003); } break;   // tuning sliders
    default: ring(0.7, 0.09); ring(0.4, 0.09); { const d = new THREE.Mesh(new THREE.SphereGeometry(0.13 * s, 12, 8), n); g.add(d); } break;   // a target
  }
  return g;
}

// ---------------------------------------------------------------- the stations behind each bay
const KIT = [
  // 0 contracts terminal: a long console under a wall of screens, a dish on top
  (g, c) => {
    const bez = mat(DARK, 0.4, 0.5), scr = neonMat(c, 0.55), scr2 = neonMat('#bff8ff', 0.6);
    box(g, 2.6, 0.16, 0.34, mat(PANEL), 0, 0, 0.18); box(g, 2.6, 0.04, 0.4, mat(STEEL), 0, 0.16, 0.17);
    box(g, 2.4, 0.015, 0.22, neonMat(c, 0.4), 0, 0.2, 0.17);                                    // glowing desk top
    for (let i = 0; i < 4; i++) { const x = -1.2 + i * 0.8; box(g, 0.72, 0.42, 0.04, bez, x, 0.42, zFace + 0.03); box(g, 0.66, 0.36, 0.01, i % 2 ? scr2 : scr, x, 0.45, zFace + 0.055); }
    box(g, 1.5, 0.3, 0.04, bez, 0, 0.9, zFace + 0.03); box(g, 1.44, 0.24, 0.01, scr, 0, 0.93, zFace + 0.055);
    for (const x of [-1.3, 1.3]) { box(g, 0.08, 0.36, 0.08, mat(STEEL), x, 0, 0.4); box(g, 0.1, 0.03, 0.1, neonMat(c, 0.7), x, 0.36, 0.4); }   // holo posts
  },
  // 1 assembly: a cradle of two towers with walkways and service arms, hoist hooks from the header
  (g, c) => {
    const fr = mat('#3c434d', 0.55, 0.45), yel = mat(HAZ, 0.3, 0.5), grate = mat('#59616b', 0.6, 0.5);
    box(g, 2.4, 0.02, 0.8, mat('#43474e', 0.2, 0.9), 0, 0, 0.08);
    for (const x of [-1.15, 1.15]) {
      box(g, 0.14, 1.15, 0.14, fr, x, 0, 0.1); box(g, 0.2, 0.05, 0.2, yel, x, 0, 0.1);
      for (const y of [0.38, 0.72]) { box(g, 0.42, 0.02, 0.3, grate, x - Math.sign(x) * 0.22, y, 0.1); box(g, 0.42, 0.01, 0.01, yel, x - Math.sign(x) * 0.22, y + 0.06, 0.25); }
      for (const [y, r] of [[0.55, 0.3], [0.85, 0.22]]) { const a = box(g, r, 0.05, 0.05, yel, x - Math.sign(x) * (0.2 + r / 2), y, 0.18); a.rotation.z = Math.sign(x) * 0.25; box(g, 0.05, 0.05, 0.05, neonMat('#bfe8ff', 0.9), x - Math.sign(x) * (0.25 + r), y - 0.04, 0.18); }
      box(g, 0.06, 0.06, 0.06, neonMat(c, 0.8), x, 1.15, 0.1);
    }
    box(g, 2.44, 0.08, 0.14, fr, 0, 1.15, 0.1);
    for (const x of [-0.4, 0.4]) { box(g, 0.012, 0.3, 0.012, mat(BLACK), x, 0.85, 0.1); box(g, 0.06, 0.05, 0.04, yel, x, 0.8, 0.1); }
    box(g, 2.3, 0.012, 0.012, neonMat(c, 0.5), 0, 0.022, 0.47);                                 // lit bay edge
  },
  // 2 parts dealer: tall shelving with mech parts on every shelf, price strips, a counter
  (g, c) => {
    const sh = mat('#3a4049', 0.5, 0.5), parts = ['#c9ced6', '#b8462e', '#2f6fb3', '#e3b52c', '#5a6170', '#3f8a4a'];
    for (let r = 0; r < 3; r++) {
      const x = -1.2 + r * 1.2;
      for (const s of [-0.5, 0.5]) box(g, 0.04, 1.1, 0.3, sh, x + s, 0, zFace + 0.15);
      for (let k = 0; k < 4; k++) {
        const y = 0.06 + k * 0.27; box(g, 1.0, 0.02, 0.3, sh, x, y, zFace + 0.15); box(g, 1.0, 0.012, 0.01, neonMat(c, 0.5), x, y + 0.005, zFace + 0.305);
        for (let j = 0; j < 3; j++) { const col = mat(parts[(r * 5 + k * 3 + j) % parts.length], 0.5, 0.4), px = x - 0.32 + j * 0.32;
          if ((r + k + j) % 3 === 0) { const o = cyl(g, 0.06, 0.18, col, px, y + 0.02, zFace + 0.15, { seg: 10 }); o.rotation.z = Math.PI / 2; o.position.y = y + 0.08; }
          else box(g, 0.2, 0.12 + ((j + k) % 2) * 0.06, 0.16, col, px, y + 0.02, zFace + 0.15); }
      }
    }
    box(g, 2.2, 0.2, 0.18, mat(PANEL), 0, 0, 0.36); box(g, 2.2, 0.02, 0.2, neonMat(c, 0.45), 0, 0.2, 0.36);
  },
  // 3 workshop: a fabricator with a glowing furnace mouth, a robot arm, material bins
  (g, c) => {
    const m = mat('#4a515b', 0.55, 0.45), hot = neonMat('#ff7a2a', 0.9), yel = mat(HAZ, 0.3, 0.5);
    box(g, 1.3, 0.75, 0.5, m, -0.5, 0, zFace + 0.25); box(g, 1.3, 0.06, 0.52, mat(STEEL), -0.5, 0.75, zFace + 0.25);
    box(g, 0.6, 0.22, 0.02, hot, -0.5, 0.22, zFace + 0.51); box(g, 0.7, 0.04, 0.03, yel, -0.5, 0.48, zFace + 0.51);
    for (let i = 0; i < 3; i++) cyl(g, 0.05, 0.4, mat(DARK), -0.95 + i * 0.12, 0.8, zFace + 0.15, { seg: 10 });   // stacks
    // robot arm on a plinth
    cyl(g, 0.12, 0.12, yel, 0.6, 0, 0.1, { seg: 16 });
    const up = box(g, 0.08, 0.45, 0.08, yel, 0.6, 0.12, 0.1); up.rotation.z = 0.25;
    const fore = box(g, 0.06, 0.36, 0.06, yel, 0.42, 0.5, 0.1); fore.rotation.z = 1.2;
    box(g, 0.05, 0.05, 0.05, neonMat('#bfe8ff', 0.95), 0.22, 0.42, 0.1);
    // bins: scrap, alloy, exotic
    [['#8a8f99', '#c9ced6'], ['#2f5f9a', '#4aa8ff'], ['#7a4a1a', '#ff9a2e']].forEach(([b, glow], i) => {
      box(g, 0.24, 0.16, 0.22, mat(b, 0.4, 0.6), 1.0, 0, -0.25 + i * 0.25); box(g, 0.2, 0.03, 0.18, neonMat(glow, 0.5), 1.0, 0.16, -0.25 + i * 0.25);
    });
  },
  // 4 paint bay: a booth frame, tinted curtains, spray arms, a strip of colour swatches
  (g, c) => {
    const fr = mat('#3c434d', 0.55, 0.45), cur = glassMat('pearl'), noz = mat(DARK);
    for (const x of [-1.2, 1.2]) { box(g, 0.08, 1.2, 0.08, fr, x, 0, 0.42); box(g, 0.08, 1.2, 0.08, fr, x, 0, zFace + 0.05); box(g, 0.02, 1.05, 0.7, cur, x, 0.1, 0.06); }
    box(g, 2.48, 0.08, 0.86, fr, 0, 1.15, 0.06);
    for (const x of [-0.6, 0, 0.6]) { box(g, 0.03, 0.3, 0.03, noz, x, 0.85, 0.15); box(g, 0.08, 0.04, 0.08, neonMat(c, 0.6), x, 0.83, 0.15); }
    ['#ff5adf', '#3ff0ff', '#ffe14a', '#5fffb0', '#ff4a4a', '#ffffff'].forEach((col, i) => box(g, 0.24, 0.24, 0.015, neonMat(col, 0.6), -0.75 + i * 0.3, 0.55, zFace + 0.01));
    box(g, 2.3, 0.01, 0.8, mat('#3a2f3c', 0.1, 0.7), 0, 0, 0.06);                                // overspray-stained floor plate
  },
  // 5 test range door: a blast door with chevrons, a frame, red/green lights
  (g, c) => {
    const d = mat('#59606a', 0.6, 0.4), yel = mat(HAZ, 0.3, 0.5), blk = mat(BLACK);
    box(g, 2.9, 1.25, 0.1, d, 0, 0, zFace + 0.05);
    for (let i = 0; i < 9; i++) { const s = box(g, 0.16, 0.5, 0.012, i % 2 ? blk : yel, -1.28 + i * 0.32, 0.05, zFace + 0.105); s.rotation.z = 0.5; }
    box(g, 0.02, 1.25, 0.012, blk, 0, 0, zFace + 0.106);                                           // the seam
    box(g, 3.2, 0.12, 0.2, mat(STEEL), 0, 1.25, zFace + 0.1);
    for (const x of [-1.52, 1.52]) box(g, 0.14, 1.37, 0.2, mat(STEEL), x, 0, zFace + 0.1);
    box(g, 0.1, 0.1, 0.05, neonMat('#ff4040', 0.9), -0.3, 1.27, zFace + 0.21); box(g, 0.1, 0.1, 0.05, neonMat('#5dff6a', 0.9), 0.3, 1.27, zFace + 0.21);
    hazard(g, 2.9, 0, 0.47, 0.012, 0.12);
  },
  // 6 tuning rig (round 7): a calibration gantry — a scanning ring on rails over a test plinth, diagnostic screens,
  //   cable looms from the header, a dial bank on the side
  (g, c) => {
    const fr = mat('#3c434d', 0.55, 0.45), yel = mat(HAZ, 0.3, 0.5), bez = mat(DARK, 0.4, 0.5), scr = neonMat(c, 0.55);
    box(g, 1.3, 0.06, 0.9, mat('#43474e', 0.2, 0.9), 0, 0, 0.08); box(g, 1.1, 0.012, 0.012, neonMat(c, 0.6), 0, 0.065, 0.53);   // the plinth
    for (const x of [-0.75, 0.75]) { box(g, 0.1, 1.2, 0.1, fr, x, 0, 0.1); box(g, 0.14, 0.05, 0.14, yel, x, 0, 0.1); box(g, 0.02, 1.0, 0.02, neonMat(c, 0.45), x + Math.sign(x) * -0.06, 0.1, 0.16); }
    box(g, 1.6, 0.08, 0.12, fr, 0, 1.2, 0.1);
    const scan = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.03, 10, 48), neonMat(c, 0.8)); scan.rotation.x = Math.PI / 2; scan.position.set(0, 0.62, 0.1); g.add(scan);   // the scanning ring
    for (const x of [-0.62, 0.62]) box(g, 0.06, 0.06, 0.06, mat(STEEL), x, 0.6, 0.1);
    for (let i = 0; i < 5; i++) box(g, 0.012, 0.4 + (i % 2) * 0.15, 0.012, mat(BLACK), -0.4 + i * 0.2, 0.8 - (i % 2) * 0.15, 0.02);   // cable looms
    for (let i = 0; i < 3; i++) { const x = -1.15; box(g, 0.34, 0.26, 0.04, bez, x, 0.35 + i * 0.3, zFace + 0.03); box(g, 0.3, 0.2, 0.01, i === 1 ? neonMat('#bfffd0', 0.6) : scr, x, 0.38 + i * 0.3, zFace + 0.055); }
    for (let i = 0; i < 4; i++) { const k = cyl(g, 0.05, 0.04, mat(STEEL), 1.12, 0.3 + i * 0.18, zFace + 0.06, { seg: 12 }); k.rotation.x = Math.PI / 2; box(g, 0.015, 0.04, 0.012, neonMat(c, 0.9), 1.12, 0.31 + i * 0.18, zFace + 0.09); }
  },
];

addRecipes({
  'hg-wall': {
    name: 'Hangar Wall', group: 'hangar', genre: ['industrial'], noStyle: true, size: [4, 1], bakeScale: 2,
    blurb: 'A 30 m hangar wall section: ribbed panels with a catwalk, a window band, pipes and vents, a steel column, or a firing-range berm.',
    params: [{ key: 'len', label: 'Length', min: 1, max: 6, step: 1, def: 4, unit: 'tiles' },
      { key: 'kind', label: 'Kind', min: 0, max: 4, step: 1, def: 0, names: ['Ribbed + catwalk', 'Window band', 'Pipes + vents', 'Column', 'Range berm'] }],
    build(p) {
      const g = new THREE.Group(), L = p.len, k = p.kind;
      if (k === 3) {                                                    // a steel column with a beacon
        box(g, 0.6, WALL_H + 0.15, 0.6, mat('#3a4048', 0.6, 0.45), 0, 0, -0.2);
        box(g, 0.64, 0.12, 0.64, mat(HAZ, 0.3, 0.5), 0, 0, -0.2); hazard(g, 0.6, 0.12, 0.101, 0.05);
        box(g, 0.05, 1.3, 0.02, neonMat('#d8ecff', 0.4), 0, 0.3, 0.105);
        cyl(g, 0.06, 0.08, neonMat('#ffa020', 0.8), 0, WALL_H + 0.15, -0.2, { seg: 12 });
        return g;
      }
      box(g, L, WALL_H, BACK, mat(k === 4 ? '#4c4a46' : '#3d434c', 0.4, 0.6), 0, 0, zBack);
      box(g, L, 0.06, BACK + 0.04, mat(STEEL), 0, WALL_H - 0.06, zBack);                  // cap
      if (k === 4) {                                                   // berm: a sloped bank of blocks + target boards
        for (let r = 0; r < 4; r++) box(g, L - 0.02, 0.18, 0.62 - r * 0.15, mat(r % 2 ? '#5a554c' : '#635d52', 0.1, 0.9), 0, r * 0.18, zFace + (0.62 - r * 0.15) / 2 - 0.02);
        for (let x = -L / 2 + 0.6; x < L / 2 - 0.3; x += 1.2) { box(g, 0.5, 0.5, 0.03, mat('#d9dce0', 0.1, 0.8), x, 0.9, zFace + 0.02);
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.025, 8, 28), neonMat('#ff4a4a', 0.6)); ring.position.set(x, 1.15, zFace + 0.04); g.add(ring); }
        box(g, L, 0.03, 0.02, neonMat('#ffe8c0', 0.4), 0, 1.6, zFace + 0.01);
        return g;
      }
      for (let x = -L / 2 + 0.125; x < L / 2; x += 0.25) box(g, 0.035, WALL_H - 0.1, 0.04, mat('#4a515b', 0.5, 0.5), x, 0.05, zFace + 0.02);   // ribs
      box(g, L, 0.1, 0.04, mat(CONC, 0.1, 0.9), 0, 0, zFace + 0.02); hazard(g, L, 0.1, zFace + 0.045, 0.05);
      if (k === 1) {                                                   // window band: the night city glows through
        box(g, L - 0.1, 0.5, 0.03, glassMat('chrome'), 0, 1.05, zFace + 0.05);
        box(g, L - 0.14, 0.44, 0.01, neonMat('#2a4a7a', 0.15), 0, 1.08, zFace + 0.035);
        for (let x = -L / 2 + 0.05; x <= L / 2; x += 0.5) box(g, 0.04, 0.54, 0.05, mat(STEEL), x, 1.03, zFace + 0.05);
      }
      if (k === 2) {                                                   // pipes + vents
        for (const [y, r, c] of [[0.55, 0.05, '#7a4a2a'], [0.7, 0.035, '#2f6fb3'], [1.45, 0.06, '#5a6170']]) rodX(g, r, L, mat(c, 0.6, 0.4), 0, y, zFace + 0.09);
        for (let x = -L / 2 + 0.5; x < L / 2; x += 1) { box(g, 0.34, 0.24, 0.05, mat(DARK), x, 0.95, zFace + 0.04); for (let i = 0; i < 4; i++) box(g, 0.3, 0.015, 0.02, mat(STEEL), x, 0.98 + i * 0.05, zFace + 0.07); }
      }
      catwalk(g, L, k === 1 ? 0.78 : 1.25);
      for (let x = -L / 2 + 0.5; x < L / 2; x += 1) box(g, 0.14, 0.05, 0.05, neonMat('#fff4d8', 0.5), x, 1.7, zFace + 0.03);   // wall lights
      return g;
    },
  },
  'hg-bay': {
    name: 'Hangar Bay', group: 'hangar', genre: ['industrial'], noStyle: true, size: [4, 1], bakeScale: 2,
    blurb: 'The back of a bay you walk your mech into: a lit neon sign with a pictogram, side pillars and the station itself.',
    params: [{ key: 'station', label: 'Station', min: 0, max: STATIONS.length - 1, step: 1, def: 0, names: STATIONS.map(s => s[0]) },
      { key: 'len', label: 'Width', min: 4, max: 4, step: 1, def: 4, unit: 'tiles' }],
    build(p) {
      const g = new THREE.Group(), L = 4, [, c] = STATIONS[p.station] || STATIONS[0];
      const neon = neonMat(c, 0.7);
      box(g, L, WALL_H, BACK, mat('#353a42', 0.4, 0.6), 0, 0, zBack);
      box(g, L - 0.6, 1.25, 0.02, mat('#23272e', 0.3, 0.7), 0, 0, zFace + 0.01);                  // recess
      box(g, L - 0.62, 0.02, 0.02, neonMat(c, 0.35), 0, 1.24, zFace + 0.025);
      box(g, L, 0.06, BACK + 0.04, mat(STEEL), 0, WALL_H - 0.06, zBack);
      // side pillars with hazard feet and a colour strip
      for (const s of [-1, 1]) {
        box(g, 0.3, WALL_H, 0.42, mat('#444b55', 0.55, 0.45), s * (L / 2 - 0.15), 0, -0.29);
        box(g, 0.32, 0.12, 0.44, mat(HAZ, 0.3, 0.5), s * (L / 2 - 0.15), 0, -0.29);
        box(g, 0.04, 1.2, 0.02, neon, s * (L / 2 - 0.15), 0.25, -0.07);
      }
      // the sign: a dark panel with a neon frame and the pictogram, a light bar under it washing the bay
      const sy = 1.38, sw = 1.6, sh = 0.36, sz = zFace + 0.06;
      box(g, sw, sh, 0.06, mat(BLACK, 0.3, 0.6), 0, sy, sz);
      for (const [w, h, x, y] of [[sw, 0.025, 0, sy], [sw, 0.025, 0, sy + sh - 0.025], [0.025, sh, -sw / 2, sy], [0.025, sh, sw / 2, sy]]) box(g, w, h, 0.02, neon, x, y, sz + 0.035);
      icon(g, p.station, c, 0, sy + sh / 2, sz + 0.04, 0.12);
      for (const s of [-1, 1]) box(g, 0.42, 0.04, 0.02, neon, s * 0.5, sy + sh / 2 - 0.02, sz + 0.035);   // side bars beside the pictogram
      box(g, L - 0.7, 0.04, 0.06, neonMat('#fff4d8', 0.6), 0, sy - 0.12, zFace + 0.05);
      // the station's own kit, in front of the wall
      KIT[p.station]?.(g, c);
      return g;
    },
  },
  'hg-spine': {
    name: 'Service Spine', group: 'hangar', genre: ['industrial'], noStyle: true, size: [1, 2], bakeScale: 2,
    blurb: 'The 8 m-tall row of lockers, pipes and lights between two bays.',
    params: [{ key: 'len', label: 'Length', min: 1, max: 3, step: 1, def: 2, unit: 'tiles' }],
    build(p) {
      const g = new THREE.Group(), L = p.len, W = 0.86;
      box(g, W, 0.42, L - 0.04, mat('#3d434c', 0.45, 0.55), 0, 0, 0);
      for (const s of [-1, 1]) for (let z = -L / 2 + 0.17; z < L / 2 - 0.1; z += 0.22) { box(g, 0.012, 0.3, 0.18, mat(((z * 10) | 0) % 2 ? '#56606b' : '#4a535d', 0.5, 0.5), s * (W / 2 + 0.006), 0.05, z); box(g, 0.014, 0.02, 0.06, mat('#9aa4b0'), s * (W / 2 + 0.01), 0.2, z + 0.04); }
      box(g, W + 0.02, 0.04, L - 0.02, mat(HAZ, 0.3, 0.5), 0, 0.42, 0);
      for (const x of [-0.22, 0.2]) { const o = cyl(g, 0.035, L - 0.1, mat(x < 0 ? '#2f6fb3' : '#7a4a2a', 0.6, 0.4), 0, 0, 0, { seg: 10 }); o.rotation.x = Math.PI / 2; o.position.set(x, 0.5, 0); }
      box(g, 0.08, 0.03, L - 0.1, neonMat('#d8ecff', 0.45), 0, 0.46, 0);
      box(g, W, 0.12, 0.02, mat(HAZ, 0.3, 0.5), 0, 0.15, L / 2 - 0.02); hazard(g, W, 0.15, L / 2 - 0.005, 0.12, 0.1);
      cyl(g, 0.05, 0.08, neonMat('#ffa020', 0.8), 0, 0.46, L / 2 - 0.12, { seg: 12 });
      return g;
    },
  },
  'hg-rail': {
    name: 'Safety Rail', group: 'hangar', genre: ['industrial'], noStyle: true, size: [4, 1], bakeScale: 2,
    blurb: 'A low yellow safety rail with red reflectors along the open edges of the hangar floor.',
    params: [{ key: 'len', label: 'Length', min: 1, max: 6, step: 1, def: 4, unit: 'tiles' }],
    build(p) {
      const g = new THREE.Group(), L = p.len, yel = mat(HAZ, 0.35, 0.5);
      box(g, L, 0.025, 0.2, mat(CONC, 0.1, 0.9), 0, 0, 0.3);
      for (let x = -L / 2 + 0.12; x < L / 2; x += 0.35) { box(g, 0.025, 0.09, 0.025, yel, x, 0.025, 0.3); box(g, 0.02, 0.02, 0.01, neonMat('#ff3020', 0.45), x, 0.08, 0.32); }
      for (const y of [0.06, 0.1]) box(g, L - 0.02, 0.014, 0.014, yel, 0, y, 0.3);
      return g;
    },
  },
});

// ---------------------------------------------------------------- test range targets (face a way: forward = +x)
function target(kind) {
  return (p) => {
    const g = new THREE.Group(), inner = new THREE.Group(); g.add(inner);
    const white = mat('#e2e5ea', 0.1, 0.8), steel = mat('#4c535d', 0.55, 0.45), red = neonMat('#ff4a4a', 0.65), yel = mat(HAZ, 0.3, 0.5);
    const y0 = kind === 'sled' ? 0.08 : 0;
    if (kind === 'sled') {                                               // a rail cart with wheels and a beacon
      box(inner, 0.34, 0.05, 0.42, steel, 0, 0.03, 0); box(inner, 0.36, 0.015, 0.44, yel, 0, 0.065, 0);
      for (const x of [-0.12, 0.12]) for (const z of [-0.17, 0.17]) { const w = cyl(inner, 0.035, 0.03, mat(BLACK, 0.1, 0.9), 0, 0, 0, { seg: 12 }); w.rotation.x = Math.PI / 2; w.position.set(x, 0.035, z); }
      cyl(inner, 0.025, 0.04, neonMat('#ffa020', 0.9), -0.13, 0.08, 0.16, { seg: 10 });
    } else box(inner, 0.32, 0.05, 0.42, steel, 0, 0, 0);
    box(inner, 0.05, 0.12, 0.05, steel, 0, y0 + 0.05, 0);                 // post
    // a mech-shaped board: body, shoulders, head
    box(inner, 0.03, 0.34, 0.34, white, 0.02, y0 + 0.15, 0);
    box(inner, 0.03, 0.08, 0.46, white, 0.02, y0 + 0.4, 0);
    box(inner, 0.03, 0.1, 0.14, white, 0.02, y0 + 0.48, 0);
    for (const [r, t] of [[0.12, 0.012], [0.06, 0.012]]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(r, t, 8, 28), red); ring.rotation.y = Math.PI / 2; ring.position.set(0.04, y0 + 0.3, 0); inner.add(ring); }
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), red); dot.position.set(0.04, y0 + 0.3, 0); inner.add(dot);
    box(inner, 0.032, 0.02, 0.3, red, 0.022, y0 + 0.53, 0);
    if (kind === 'armour') {                                             // bolted plates and a yellow edge
      for (const [y, h, w] of [[0.15, 0.1, 0.36], [0.4, 0.09, 0.5]]) { box(inner, 0.05, h, w, steel, 0.06, y0 + y, 0); box(inner, 0.052, 0.012, w, yel, 0.06, y0 + y + h - 0.012, 0); }
      for (const z of [-0.2, 0.2]) box(inner, 0.08, 0.5, 0.06, mat('#3a4048', 0.6, 0.4), 0.03, y0 + 0.05, z);
    }
    g.userData.face = h => { inner.rotation.y = -h; };
    return g;
  };
}
const T_PARAMS = [{ key: 'seed', label: 'Variant', min: 1, max: 2, step: 1, def: 1 }];
addRecipes({
  'hg-target': { name: 'Range Target', group: 'hangar', genre: ['industrial'], noStyle: true, dirs: 16, bakeScale: 6, dims: { h: 0.55 }, blurb: 'A mech-shaped target board with a lit ring, on a weighted stand.', params: T_PARAMS, build: target('plain') },
  'hg-target-armour': { name: 'Armoured Range Target', group: 'hangar', genre: ['industrial'], noStyle: true, dirs: 16, bakeScale: 6, dims: { h: 0.55 }, blurb: 'The target board behind bolted steel plates: for testing armour-piercing weapons.', params: T_PARAMS, build: target('armour') },
  'hg-target-sled': { name: 'Moving Range Target', group: 'hangar', genre: ['industrial'], noStyle: true, dirs: 16, bakeScale: 6, dims: { h: 0.63 }, blurb: 'The target board on a rail cart that runs back and forth.', params: T_PARAMS, build: target('sled') },
});
