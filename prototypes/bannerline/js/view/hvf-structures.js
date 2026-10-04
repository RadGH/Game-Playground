// Hunters vs Farmers buildings (stream C, docs/hvf-PLAN.md §14). Same style as structures.js:
// every static piece goes through a Kit and is merged per material (1-3 draw calls a building).
//
//   import { makeHvfBuilding, HVF_KINDS, hvfMaterials, linkedPiece } from './hvf-structures.js';
//   const b = makeHvfBuilding('pen', { color: '#4fa3e8', w: 6, d: 6 });   // w/d in metres (data/hvf/buildings.json size x cell 2 m)
//   scene.add(b.group);
//   b.setProgress(0..1)     // under construction: scaffold + the building rising out of it (1 = done)
//   b.setDamage(0..1)       // 0 healthy .. 1 nearly down: cracks, a lean, smoke and flames from 0.6
//   b.setReady(bool)        // Harvest Hall: can train (glow); Kennel / Lodge: a hunter can shop / respawn here
//   b.fire(yaw)             // Arrow Tower: an archer's shot (a flash on the platform)
//   b.update(dt)            // windmill sails, cloth, smoke, the flash
//   b.radius                // a pick radius (m)
//   hvfMaterials()          // the 4 materials every HvF building uses: pass each to world.fogify()
//
// Fences, walls and briar hedges are laid one cell at a time and JOIN their neighbours:
//   linkedPiece('fence' | 'wall' | 'hedge', mask)  -> { std, metal, glow } BufferGeometries, cached
//   mask bits: 1 = north (-z), 2 = east (+x), 4 = south (+z), 8 = west (-x). 16 shapes per kind, so a
//   whole fence line is at most 16 InstancedMeshes; makeHvfBuilding('fence', { mask }) builds one.
//
// Kinds (sim ids): coop, pen, sty, barn, hive, granary, windmill, farmhouse, sheepdog, fence, wall,
// hedge, mud, lookout, tower, hall (farmers); kennel, lodge (hunters); watchstone, snare, grave, mine
// (small things). Everything faces +z (the door), sits on y = 0 and is centred on the footprint.

import * as THREE from 'three';
import { Kit } from './structures.js';

const TAU = Math.PI * 2;
function rng(seed) { let a = seed >>> 0; return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// one material set for the whole mode (so H can fogify them once)
const MATS = {};
export function hvfMaterial(kind) {
  if (MATS[kind]) return MATS[kind];
  MATS[kind] = kind === 'metal' ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.6 })
    : kind === 'glow' ? new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })
      : kind === 'cloth' ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide })
        : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
  return MATS[kind];
}
export const hvfMaterials = () => ['std', 'metal', 'glow', 'cloth'].map(hvfMaterial);
const kit = () => new Kit({ material: hvfMaterial });

// palette
const P = {
  wood: '#8a6440', dark: '#5a3e26', plank: '#a07a50', straw: '#d8b55a', thatch: '#c8a24a', wall: '#e2d8be', red: '#a8432f',
  stone: '#9a968c', stoneDark: '#6e6a62', roofSlate: '#5a5a62', iron: '#5a5f66', hay: '#e0c060', earth: '#5b4126', mud: '#4a331c',
  hunter: '#b23a2a', hide: '#7a6248', bone: '#e6dcc4', ward: '#8a8f9a', wardGlow: '#9fe0ff',
};
export const HVF_PALETTE = P;

/** Thatched / tiled roof: a 4-sided pyramid stretched to w x d. */
function roof(k, w, d, h, y, color, { z = 0, x = 0, ridge = true } = {}) {
  k.cone(0.71, h, color, { p: [x, y + h / 2, z], r: [0, Math.PI / 4, 0], s: [w, 1, d] }, 4);
  if (ridge) k.box(w * 0.98, 0.12, 0.16, '#3e2c1c', { p: [x, y + h - 0.05, z] });
}
function plankWall(k, w, h, d, color, y = 0) { k.box(w, h, d, color, { p: [0, y + h / 2, 0] }); for (let x = -w / 2 + 0.35; x < w / 2; x += 0.7) k.box(0.04, h * 0.98, d + 0.02, '#3e2c1c', { p: [x, y + h / 2, 0] }); }
function door(k, w, h, z, color = '#3a2a1a') { k.box(w, h, 0.08, color, { p: [0, h / 2, z] }); k.box(w + 0.2, 0.14, 0.12, P.dark, { p: [0, h + 0.07, z] }); }
function hayBale(k, x, z, r = 0.45, y = 0) { k.cyl(r, r, r * 1.6, P.hay, { p: [x, y + r, z], r: [0, 0, Math.PI / 2] }, 9); }
function trough(k, x, z, len = 1.4, rot = 0) { k.at({ p: [x, 0, z], r: [0, rot, 0] }, () => { k.box(len, 0.35, 0.5, P.dark, { p: [0, 0.22, 0] }); k.box(len - 0.12, 0.05, 0.36, '#4a6a8a', { p: [0, 0.38, 0] }); }); }
function railFence(k, ax, az, bx, bz, h = 0.9) {
  const len = Math.hypot(bx - ax, bz - az), yaw = -Math.atan2(bz - az, bx - ax);
  k.at({ p: [(ax + bx) / 2, 0, (az + bz) / 2], r: [0, yaw, 0] }, () => {
    for (const y of [h * 0.45, h * 0.85]) k.box(len, 0.1, 0.08, P.plank, { p: [0, y, 0] });
    const n = Math.max(1, Math.round(len / 1.4));
    for (let i = 0; i <= n; i++) k.box(0.14, h, 0.14, P.dark, { p: [-len / 2 + len * i / n, h / 2, 0] });
  });
}

// ----------------------------------------------------------------- the farm
const BUILD = {
  coop(k, w, d, o) {
    k.box(w * 0.7, 0.35, d * 0.55, P.dark, { p: [0, 0.18, -d * 0.1] });               // stilts base
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box(0.1, 0.5, 0.1, P.dark, { p: [x * w * 0.3, 0.25, -d * 0.1 + z * d * 0.22] });
    k.at({ p: [0, 0.5, -d * 0.1] }, () => plankWall(k, w * 0.7, 1.0, d * 0.5, P.red));
    roof(k, w * 0.82, d * 0.68, 0.7, 1.5, P.thatch, { z: -d * 0.1 });
    k.box(0.12, 0.6, 0.6, P.plank, { p: [0, 0.35, d * 0.25], r: [0.7, 0, 0] });          // ramp
    k.box(0.32, 0.36, 0.06, '#2a1e14', { p: [0, 0.8, d * 0.16] });
    // run fenced with chicken wire posts
    railFence(k, -w * 0.45, d * 0.45, w * 0.45, d * 0.45, 0.6); railFence(k, -w * 0.45, d * 0.45, -w * 0.45, -d * 0.4, 0.6); railFence(k, w * 0.45, d * 0.45, w * 0.45, -d * 0.4, 0.6);
    for (let i = 0; i < 6; i++) k.sphere(0.06, P.hay, { p: [(i / 5 - 0.5) * w * 0.6, 0.04, d * 0.3] }, 5);
    k.box(0.5, 0.12, 0.08, o.color, { p: [0, 1.25, d * 0.16] });                          // owner's colour on the gable
  },
  pen(k, w, d, o) {
    railFence(k, -w * 0.47, -d * 0.47, w * 0.47, -d * 0.47); railFence(k, -w * 0.47, -d * 0.47, -w * 0.47, d * 0.47); railFence(k, w * 0.47, -d * 0.47, w * 0.47, d * 0.47);
    railFence(k, -w * 0.47, d * 0.47, -w * 0.12, d * 0.47); railFence(k, w * 0.12, d * 0.47, w * 0.47, d * 0.47);   // a gate gap
    k.box(w * 0.22, 0.1, 0.06, P.plank, { p: [0, 0.55, d * 0.52], r: [0, 0.6, 0] });       // gate swung open
    k.at({ p: [0, 0, -d * 0.3] }, () => { plankWall(k, w * 0.42, 1.3, d * 0.28, P.wall); });   // the shelter
    roof(k, w * 0.5, d * 0.36, 0.8, 1.3, P.thatch, { z: -d * 0.3 });
    trough(k, w * 0.28, d * 0.15, 1.2, Math.PI / 2);
    hayBale(k, -w * 0.3, d * 0.2); hayBale(k, -w * 0.3, d * 0.05, 0.4, 0.9 - 0.4);
    k.box(w * 0.94, 0.03, d * 0.94, '#6a7a3a', { p: [0, 0.015, 0] });                    // grazed grass
    k.box(0.6, 0.4, 0.05, o.color, { p: [-w * 0.47, 1.05, d * 0.4] });                    // tally board in the owner's colour
  },
  sty(k, w, d, o) {
    k.box(w * 0.94, 0.03, d * 0.94, P.mud, { p: [0, 0.015, 0] });
    for (let i = 0; i < 5; i++) k.sphere(0.35, '#3e2a16', { p: [(i % 3 - 1) * w * 0.25, 0.02, (i > 2 ? 1 : -0.2) * d * 0.2], s: [1.4, 0.12, 1] }, 7);
    const r = (ax, az, bx, bz) => { const len = Math.hypot(bx - ax, bz - az), yaw = -Math.atan2(bz - az, bx - ax); k.at({ p: [(ax + bx) / 2, 0, (az + bz) / 2], r: [0, yaw, 0] }, () => { k.box(len, 0.7, 0.12, P.stoneDark, { p: [0, 0.35, 0] }); k.box(len, 0.12, 0.2, P.stone, { p: [0, 0.74, 0] }); }); };
    r(-w * 0.46, -d * 0.46, w * 0.46, -d * 0.46); r(-w * 0.46, -d * 0.46, -w * 0.46, d * 0.46); r(w * 0.46, -d * 0.46, w * 0.46, d * 0.46); r(-w * 0.46, d * 0.46, -w * 0.1, d * 0.46); r(w * 0.1, d * 0.46, w * 0.46, d * 0.46);
    k.at({ p: [-w * 0.18, 0, -d * 0.18] }, () => plankWall(k, w * 0.5, 1.1, d * 0.4, P.plank));
    k.box(w * 0.58, 0.1, d * 0.52, P.roofSlate, { p: [-w * 0.18, 1.25, -d * 0.12], r: [-0.25, 0, 0] });
    trough(k, w * 0.28, d * 0.12, 1.0);
    k.box(0.4, 0.35, 0.05, o.color, { p: [-w * 0.18, 0.75, d * 0.03] });
  },
  barn(k, w, d, o) {
    plankWall(k, w * 0.86, 2.6, d * 0.8, P.red);
    for (const x of [-w * 0.43, w * 0.43]) k.box(0.14, 2.6, d * 0.82, P.wall, { p: [x, 1.3, 0] });
    // gambrel roof: two pitches each side
    for (const s of [-1, 1]) { k.box(w * 0.3, 0.12, d * 0.9, P.roofSlate, { p: [s * w * 0.32, 3.05, 0], r: [0, 0, s * -0.95] }); k.box(w * 0.3, 0.12, d * 0.9, P.roofSlate, { p: [s * w * 0.13, 3.75, 0], r: [0, 0, s * -0.35] }); }
    k.box(w * 0.56, 1.3, 0.1, P.red, { p: [0, 3.1, d * 0.4], s: [1, 1, 1] });
    k.box(w * 0.3, 1.9, 0.1, P.wall, { p: [0, 0.95, d * 0.41] }); k.box(w * 0.26, 1.7, 0.12, P.red, { p: [0, 0.9, d * 0.42] });
    for (const s of [-1, 1]) k.box(0.1, 1.9, 0.14, P.wall, { p: [0, 0.95, d * 0.42], r: [0, 0, s * 0.42], s: [1, 1.35, 1] });
    k.box(0.9, 0.7, 0.1, '#2a1e14', { p: [0, 3.0, d * 0.41] }); hayBale(k, 0, d * 0.44, 0.22, 2.75);
    hayBale(k, w * 0.5, d * 0.35, 0.5); hayBale(k, w * 0.5, d * 0.1, 0.5); hayBale(k, w * 0.5, d * 0.22, 0.5, 0.95);
    k.cyl(0.08, 0.08, 1.1, P.dark, { p: [w * 0.35, 4.2, 0] }, 5); k.box(0.7, 0.05, 0.12, P.iron, { p: [w * 0.35, 4.75, 0], kind: 'metal' });
    k.box(0.9, 0.5, 0.06, o.color, { p: [0, 2.35, d * 0.43] });
  },
  hive(k, w, d, o) {
    k.box(0.9, 0.12, 0.9, P.dark, { p: [0, 0.35, 0] }); for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box(0.08, 0.35, 0.08, P.dark, { p: [x * 0.38, 0.17, z * 0.38] });
    for (let i = 0; i < 4; i++) k.cyl(0.38 - i * 0.07, 0.42 - i * 0.07, 0.28, i % 2 ? P.straw : P.thatch, { p: [0, 0.55 + i * 0.25, 0] }, 12);
    k.sphere(0.12, P.thatch, { p: [0, 1.55, 0] }, 8); k.box(0.16, 0.08, 0.06, '#2a1e14', { p: [0, 0.48, 0.4] });
    for (let i = 0; i < 6; i++) k.sphere(0.03, '#f0c020', { p: [Math.cos(i) * 0.6, 0.8 + (i % 3) * 0.25, Math.sin(i * 1.3) * 0.6], kind: 'glow' }, 4);
    k.cyl(0.1, 0.12, 0.08, o.color, { p: [0, 0.43, 0.45], r: [Math.PI / 2, 0, 0] }, 8);
  },
  granary(k, w, d, o) {
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { k.cyl(0.12, 0.14, 0.7, P.stone, { p: [x * w * 0.3, 0.35, z * d * 0.3] }, 7); k.cyl(0.25, 0.25, 0.08, P.stone, { p: [x * w * 0.3, 0.72, z * d * 0.3] }, 8); }   // staddle stones
    k.at({ p: [0, 0.76, 0] }, () => plankWall(k, w * 0.78, 1.9, d * 0.78, P.plank));
    roof(k, w * 0.95, d * 0.95, 1.6, 2.66, P.thatch);
    door(k, 0.8, 1.2, d * 0.4); k.box(0.8, 1.2, 0.08, '#3a2a1a', { p: [0, 1.4, d * 0.4] });
    k.box(0.6, 0.12, 0.6, P.plank, { p: [0, 0.4, d * 0.5], r: [0.5, 0, 0] });
    for (let i = 0; i < 3; i++) k.cyl(0.18, 0.15, 0.4, '#c8a87a', { p: [w * 0.45 + 0.2, 0.2, -d * 0.3 + i * 0.45] }, 7);   // sacks
    k.box(0.5, 0.3, 0.06, o.color, { p: [0, 2.4, d * 0.4] });
  },
  windmill(k, w, d, o) {
    k.cyl(1.05, 1.5, 6.2, P.wall, { p: [0, 3.1, 0] }, 10);
    for (let y = 0.6; y < 6; y += 1.5) k.cyl(1.52 - y * 0.075, 1.55 - y * 0.075, 0.1, P.stoneDark, { p: [0, y, 0] }, 10);
    k.cone(1.35, 1.6, P.thatch, { p: [0, 7.0, 0] }, 10);
    door(k, 0.8, 1.5, 1.48);
    k.box(0.5, 0.6, 0.08, '#3a2a1a', { p: [0, 3.6, 1.2] });
    k.cyl(0.1, 0.1, 0.9, P.dark, { p: [0, 5.5, 1.3], r: [Math.PI / 2, 0, 0] }, 6);
    k.box(0.6, 0.4, 0.06, o.color, { p: [0, 2.2, 1.35] });
  },
  farmhouse(k, w, d, o) {
    k.box(w * 0.9, 0.4, d * 0.85, P.stoneDark, { p: [0, 0.2, 0] });
    k.box(w * 0.84, 2.0, d * 0.78, P.wall, { p: [0, 1.4, 0] });
    for (const x of [-w * 0.42, 0, w * 0.42]) k.box(0.16, 2.0, d * 0.8, P.dark, { p: [x, 1.4, 0] });
    k.box(w * 0.86, 0.16, d * 0.8, P.dark, { p: [0, 2.4, 0] });
    roof(k, w * 1.0, d * 0.98, 1.7, 2.4, P.thatch);
    k.box(0.5, 2.2, 0.5, P.stone, { p: [w * 0.3, 3.4, -d * 0.15] });
    door(k, 0.8, 1.4, d * 0.4);
    for (const x of [-w * 0.25, w * 0.25]) { k.box(0.55, 0.55, 0.06, '#ffd88a', { p: [x, 1.55, d * 0.4], kind: 'glow' }); k.box(0.7, 0.08, 0.1, P.dark, { p: [x, 1.25, d * 0.42] }); }
    hayBale(k, -w * 0.52, d * 0.3, 0.35); k.cyl(0.3, 0.3, 0.6, P.wood, { p: [w * 0.5, 0.3, d * 0.35] }, 9);
    k.box(0.05, 1.6, 0.05, P.dark, { p: [-w * 0.42, 3.0, d * 0.4] }); k.box(0.7, 0.45, 0.04, o.color, { p: [-w * 0.42 + 0.36, 3.55, d * 0.4], kind: 'cloth' });
  },
  sheepdog(k, w, d, o) {
    k.at({ p: [0, 0, -0.1] }, () => plankWall(k, 1.2, 0.8, 1.0, P.plank));
    roof(k, 1.4, 1.2, 0.6, 0.8, P.red, { z: -0.1 });
    k.box(0.45, 0.5, 0.05, '#1e1814', { p: [0, 0.3, 0.42] });
    k.cyl(0.18, 0.2, 0.1, P.iron, { p: [0.45, 0.05, 0.6], kind: 'metal' }, 10);       // bowl
    k.box(0.5, 0.12, 0.06, o.color, { p: [0, 0.95, 0.42] });
  },
  mud(k, w, d) {
    const r = rng(7);
    k.box(w * 0.98, 0.04, d * 0.98, P.mud, { p: [0, 0.02, 0] });
    for (let i = 0; i < 9; i++) k.sphere(0.3 + r() * 0.3, i % 2 ? '#3e2a16' : '#5e4228', { p: [(r() - 0.5) * w * 0.8, 0.03, (r() - 0.5) * d * 0.8], s: [1.3, 0.1, 1] }, 7);
    for (let i = 0; i < 4; i++) k.cyl(0.12, 0.12, 0.02, '#6a8aa0', { p: [(r() - 0.5) * w * 0.7, 0.05, (r() - 0.5) * d * 0.7] }, 8);   // puddles
  },
  lookout(k, w, d, o) {
    const H = 4.2;
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.cyl(0.09, 0.12, H, P.dark, { p: [x * 0.55, H / 2, z * 0.55], r: [z * 0.06, 0, -x * 0.06] }, 5);
    for (const y of [1.2, 2.6]) for (const s of [-1, 1]) { k.box(1.3, 0.07, 0.07, P.plank, { p: [0, y, s * 0.52], r: [0, 0, s * 0.6] }); k.box(0.07, 0.07, 1.3, P.plank, { p: [s * 0.52, y, 0], r: [s * 0.6, 0, 0] }); }
    k.box(1.7, 0.14, 1.7, P.plank, { p: [0, H, 0] });
    for (const s of [-1, 1]) { k.box(1.7, 0.5, 0.06, P.plank, { p: [0, H + 0.3, s * 0.82] }); k.box(0.06, 0.5, 1.7, P.plank, { p: [s * 0.82, H + 0.3, 0] }); }
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box(0.07, 1.1, 0.07, P.dark, { p: [x * 0.8, H + 0.6, z * 0.8] });
    roof(k, 2.0, 2.0, 0.8, H + 1.15, P.thatch, { ridge: false });
    k.box(0.08, 1.8, 0.08, P.dark, { p: [0.5, H * 0.4, 0.9], r: [0.15, 0, 0] });        // ladder rails
    k.box(0.5, 0.25, 0.04, o.color, { p: [0, H + 0.3, 0.86] });
  },
  tower(k, w, d, o) {
    k.cyl(w * 0.42, w * 0.48, 4.2, P.stone, { p: [0, 2.1, 0] }, 9);
    for (let y = 0.7; y < 4; y += 1.1) k.cyl(w * 0.485 - y * 0.014, w * 0.49 - y * 0.014, 0.08, P.stoneDark, { p: [0, y, 0] }, 9);
    k.cyl(w * 0.5, w * 0.46, 0.5, P.stoneDark, { p: [0, 4.45, 0] }, 9);
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; k.box(0.5, 0.6, 0.35, P.stone, { p: [Math.cos(a) * w * 0.46, 5.0, Math.sin(a) * w * 0.46], r: [0, -a, 0] }); }
    k.box(0.12, 0.8, 0.06, '#1e1814', { p: [0, 2.6, w * 0.44] }); k.box(0.12, 0.8, 0.06, '#1e1814', { p: [w * 0.44, 2.0, 0], r: [0, Math.PI / 2, 0] });   // arrow slits
    door(k, 0.8, 1.4, w * 0.46);
    k.cyl(0.05, 0.05, 2.2, P.dark, { p: [0, 5.8, 0] }, 5);
  },
  hall(k, w, d, o) {
    k.box(w * 0.92, 0.35, d * 0.88, P.stoneDark, { p: [0, 0.17, 0] });
    plankWall(k, w * 0.86, 2.8, d * 0.8, '#a87a4a', 0.35);
    roof(k, w * 1.0, d * 0.95, 2.6, 3.15, P.thatch);
    k.box(w * 0.22, 2.0, 0.1, '#2a1e14', { p: [0, 1.35, d * 0.41] });
    k.box(w * 0.32, 0.5, 0.14, P.dark, { p: [0, 2.6, d * 0.42] });
    // the sheaf over the door and two scarecrows on guard
    for (let i = -3; i <= 3; i++) k.cone(0.05, 1.0, P.straw, { p: [i * 0.08, 3.1, d * 0.46], r: [0, 0, i * 0.12] }, 4);
    k.box(0.5, 0.1, 0.14, '#8a2a1a', { p: [0, 2.85, d * 0.47] });
    for (const s of [-1, 1]) { k.at({ p: [s * w * 0.4, 0, d * 0.55] }, () => { k.cyl(0.05, 0.05, 2.0, P.dark, { p: [0, 1.0, 0] }, 4); k.box(1.2, 0.07, 0.07, P.dark, { p: [0, 1.45, 0] }); k.cone(0.32, 0.8, '#6a7a4a', { p: [0, 1.2, 0] }, 6); k.sphere(0.22, '#c8a87a', { p: [0, 1.85, 0] }, 7); k.cone(0.34, 0.35, '#5a4632', { p: [0, 2.14, 0] }, 7); }); }
    k.box(0.7, 1.2, 0.04, o.color, { p: [w * 0.28, 2.0, d * 0.415], kind: 'cloth' }); k.box(0.7, 1.2, 0.04, o.color, { p: [-w * 0.28, 2.0, d * 0.415], kind: 'cloth' });
  },
  // ------------------------------------------------------------- hunters
  kennel(k, w, d, o) {
    k.box(5.0, 0.3, 4.2, P.stoneDark, { p: [0, 0.15, 0] });
    plankWall(k, 4.2, 2.2, 3.4, '#5a4a3e', 0.3);
    roof(k, 4.8, 4.0, 1.8, 2.5, '#3a2e26');
    k.box(1.4, 1.5, 0.08, '#1e1814', { p: [0, 1.05, 1.72] });
    for (let i = 0; i < 3; i++) k.box(0.9, 0.6, 0.7, P.dark, { p: [-1.5 + i * 1.5, 0.6, 2.4] });   // dog boxes
    for (let i = 0; i < 3; i++) k.box(0.4, 0.35, 0.05, '#120c08', { p: [-1.5 + i * 1.5, 0.55, 2.76] });
    // hides on a rack and a skull on the gable
    k.box(0.1, 1.8, 0.1, P.dark, { p: [-2.6, 0.9, 1.0] }); k.box(0.1, 1.8, 0.1, P.dark, { p: [-2.6, 0.9, -1.0] }); k.box(0.1, 0.1, 2.2, P.dark, { p: [-2.6, 1.75, 0] });
    k.box(0.04, 1.1, 0.9, P.hide, { p: [-2.62, 1.15, 0.45], kind: 'cloth' }); k.box(0.04, 0.9, 0.8, '#8a7a5a', { p: [-2.62, 1.25, -0.5], kind: 'cloth' });
    k.sphere(0.25, P.bone, { p: [0, 3.5, 1.9], s: [1, 0.8, 0.9] }, 8); for (const s of [-1, 1]) k.cone(0.06, 0.5, P.bone, { p: [s * 0.28, 3.75, 1.9], r: [0, 0, s * -0.8] }, 5);
    k.cyl(0.08, 0.08, 3.4, P.dark, { p: [2.3, 1.7, 1.8] }, 5); k.box(0.06, 1.0, 0.8, o.color || P.hunter, { p: [2.3, 2.9, 2.22], kind: 'cloth' });
  },
  lodge(k, w, d, o) {
    for (let i = 0; i < 9; i++) { const a = i / 9 * TAU; k.cyl(0.05, 0.06, 3.6, P.dark, { p: [Math.cos(a) * 0.9, 1.6, Math.sin(a) * 0.9], r: [Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45] }, 4); }
    k.cone(1.8, 3.0, P.hide, { p: [0, 1.5, 0] }, 9);
    k.cone(0.9, 0.6, '#5a4a36', { p: [0, 3.25, 0] }, 9);
    k.box(0.9, 1.2, 0.06, '#1e1814', { p: [0, 0.6, 1.3], r: [-0.55, 0, 0] });
    k.cyl(0.35, 0.4, 0.15, P.stoneDark, { p: [1.6, 0.08, 1.2] }, 8); k.cone(0.22, 0.5, '#ff8a2a', { p: [1.6, 0.4, 1.2], kind: 'glow' }, 6);   // campfire
    for (let i = 0; i < 3; i++) k.cyl(0.04, 0.04, 1.6, P.dark, { p: [-1.6, 0.8, 0.8], r: [0, i * 2.1, 0.3] }, 4);   // a spear stand
    k.box(0.06, 0.6, 0.5, o.color || P.hunter, { p: [0.25, 3.8, 0], kind: 'cloth' }); k.cyl(0.03, 0.03, 1.2, P.dark, { p: [0, 3.7, 0] }, 4);
  },
  // ------------------------------------------------------------- small things
  watchstone(k) {
    k.cyl(0.45, 0.6, 0.25, P.stoneDark, { p: [0, 0.12, 0] }, 7);
    k.cyl(0.2, 0.34, 1.6, P.ward, { p: [0, 1.0, 0] }, 6);
    for (let i = 0; i < 3; i++) k.box(0.06, 0.25, 0.04, P.wardGlow, { p: [Math.cos(i * 2.1) * 0.27, 0.7 + i * 0.3, Math.sin(i * 2.1) * 0.27], r: [0, -i * 2.1, 0], kind: 'glow' });
    k.ico(0.16, P.wardGlow, { p: [0, 1.95, 0], kind: 'glow' });
  },
  snare(k) {
    k.torus(0.35, 0.03, '#a89a7a', { p: [0, 0.05, 0], r: [Math.PI / 2, 0, 0] });
    k.cyl(0.035, 0.03, 0.6, P.dark, { p: [0.42, 0.28, 0], r: [0, 0, 0.3] }, 4);
    k.box(0.02, 0.02, 0.5, '#a89a7a', { p: [0.4, 0.5, 0], r: [0.0, 0, -0.9] });
    for (let i = 0; i < 6; i++) k.cone(0.02, 0.12, '#7a7066', { p: [Math.cos(i) * 0.3, 0.06, Math.sin(i) * 0.3], kind: 'metal' }, 3);
    for (let i = 0; i < 5; i++) k.box(0.4, 0.02, 0.06, '#5a6a32', { p: [Math.cos(i * 1.3) * 0.2, 0.08, Math.sin(i * 1.3) * 0.2], r: [0, i * 1.3, 0] });   // leaves over it
  },
  grave(k, w, d, o) {
    k.box(0.7, 0.9, 0.18, P.stone, { p: [0, 0.45, -0.6] }); k.cyl(0.35, 0.35, 0.18, P.stone, { p: [0, 0.9, -0.6], r: [Math.PI / 2, 0, 0] }, 12);
    k.box(1.0, 0.18, 1.7, P.earth, { p: [0, 0.09, 0.3] });
    for (let i = 0; i < 4; i++) k.sphere(0.12, '#e8e0a0', { p: [(i - 1.5) * 0.2, 0.2, 0.9], kind: 'glow' }, 5);   // flowers
    k.box(0.4, 0.06, 0.04, o.color, { p: [0, 0.7, -0.5] });
  },
  mine(k) {
    k.cyl(0.42, 0.5, 0.08, '#4a3e2c', { p: [0, 0.03, 0] }, 12);
    k.sphere(0.32, P.iron, { p: [0, 0.05, 0], s: [1, 0.5, 1], kind: 'metal' }, 10);
  },
};

// fence / wall / hedge joined to neighbours
function linkedInto(k, kind, mask) {
  const dirs = [[1, 0, -1], [2, 1, 0], [4, 0, 1], [8, -1, 0]];
  if (kind === 'fence') {
    k.box(0.18, 1.1, 0.18, P.dark, { p: [0, 0.55, 0] });
    k.cone(0.13, 0.2, P.dark, { p: [0, 1.2, 0] }, 4);
    for (const [bit, dx, dz] of dirs) if (mask & bit) for (const y of [0.45, 0.85]) k.box(dx ? 1.0 : 0.08, 0.1, dz ? 1.0 : 0.08, P.plank, { p: [dx * 0.5, y, dz * 0.5] });
    if (!mask) for (const y of [0.45, 0.85]) k.box(1.6, 0.1, 0.08, P.plank, { p: [0, y, 0] });
  } else if (kind === 'wall') {
    k.box(0.9, 1.4, 0.9, P.stone, { p: [0, 0.7, 0] });
    for (const [bit, dx, dz] of dirs) if (mask & bit) k.box(dx ? 1.05 : 0.8, 1.3, dz ? 1.05 : 0.8, (dx + dz) % 2 ? P.stone : '#a8a498', { p: [dx * 0.55, 0.65, dz * 0.55] });
    k.box(1.0, 0.16, 1.0, '#b3afa3', { p: [0, 1.48, 0] });
    for (const [bit, dx, dz] of dirs) if (mask & bit) k.box(dx ? 1.05 : 0.95, 0.16, dz ? 1.05 : 0.95, '#b3afa3', { p: [dx * 0.55, 1.38, dz * 0.55] });
  } else {
    const r = rng(mask + 11);
    const blob = (x, z) => { k.ico(0.6 + r() * 0.2, r() < 0.5 ? '#3e4a2a' : '#4a3a2c', { p: [x, 0.55, z], s: [1, 0.8 + r() * 0.3, 1] }); for (let i = 0; i < 4; i++) k.cone(0.03, 0.25, '#d6cca6', { p: [x + (r() - 0.5), 0.6 + r() * 0.5, z + (r() - 0.5)], r: [r() * 3, 0, r() * 3] }, 3); if (r() < 0.5) k.sphere(0.07, '#8a1a3a', { p: [x + (r() - 0.5) * 0.8, 0.9, z + 0.45] }, 5); };
    blob(0, 0);
    for (const [bit, dx, dz] of dirs) if (mask & bit) blob(dx * 0.55, dz * 0.55);
  }
}
const LINK_CACHE = new Map();
/** Geometries for a fence / wall / hedge cell joined to the neighbours in `mask` (N1 E2 S4 W8). Cached. */
export function linkedPiece(kind, mask = 0) {
  const key = kind + mask;
  if (!LINK_CACHE.has(key)) { const k = kit(); linkedInto(k, kind, mask); LINK_CACHE.set(key, { std: k.geometry('std'), metal: k.geometry('metal'), glow: k.geometry('glow') }); }
  return LINK_CACHE.get(key);
}
/** The neighbour mask for cell (cx, cz) given `same(cx, cz)` -> bool. */
export function linkMask(cx, cz, same) { return (same(cx, cz - 1) ? 1 : 0) | (same(cx + 1, cz) ? 2 : 0) | (same(cx, cz + 1) ? 4 : 0) | (same(cx - 1, cz) ? 8 : 0); }

export const HVF_KINDS = ['coop', 'pen', 'sty', 'barn', 'hive', 'granary', 'windmill', 'farmhouse', 'sheepdog', 'fence', 'wall', 'hedge', 'mud', 'lookout', 'tower', 'hall', 'kennel', 'lodge', 'watchstone', 'snare', 'grave', 'mine'];
const DEFAULT_SIZE = { coop: [4, 4], pen: [6, 6], sty: [6, 4], barn: [6, 6], hive: [2, 2], granary: [4, 4], windmill: [4, 4], farmhouse: [4, 4], sheepdog: [2, 2], fence: [2, 2], wall: [2, 2], hedge: [2, 2], mud: [4, 4], lookout: [2, 2], tower: [4, 4], hall: [6, 6], kennel: [6, 6], lodge: [4, 4], watchstone: [1, 1], snare: [1, 1], grave: [2, 2], mine: [1, 1] };

/**
 * One building. `w`, `d` metres (default: data/hvf/buildings.json sizes x 2 m); `color` the owner's
 * colour (farmer band / hunter red); `mask` for fence/wall/hedge.
 */
export function makeHvfBuilding(kind, { color = '#e8c34a', w = null, d = null, mask = 0, seed = 1 } = {}) {
  const [dw, dd] = DEFAULT_SIZE[kind] || [2, 2]; w = w ?? dw; d = d ?? dd;
  const group = new THREE.Group(); group.name = 'hvf-' + kind;
  const body = new THREE.Group(); group.add(body);
  if (kind === 'fence' || kind === 'wall' || kind === 'hedge') {
    const g = linkedPiece(kind, mask);
    for (const [k, geo] of Object.entries(g)) if (geo) body.add(new THREE.Mesh(geo, hvfMaterial(k)));
  } else {
    const k = kit(); (BUILD[kind] || BUILD.mine)(k, w, d, { color, seed }); body.add(k.build(kind));
  }
  // moving parts
  let sails = null, flash = null, glowRing = null, readyK = 0, ready = false;
  if (kind === 'windmill') {
    const sk = kit();
    for (let i = 0; i < 4; i++) sk.at({ r: [0, 0, i * Math.PI / 2] }, () => { sk.box(0.12, 3.2, 0.08, P.dark, { p: [0, 1.7, 0] }); sk.box(0.7, 2.6, 0.03, '#e8e0cc', { p: [0.38, 2.0, 0.02], kind: 'cloth' }); for (let y = 0.8; y < 3.3; y += 0.45) sk.box(0.7, 0.04, 0.05, P.dark, { p: [0.38, y, 0.03] }); });
    sk.cyl(0.25, 0.25, 0.3, P.dark, { r: [Math.PI / 2, 0, 0] }, 8);
    sails = sk.build('sails'); sails.position.set(0, 5.5, 1.78); body.add(sails);
  }
  if (kind === 'tower') {
    flash = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), new THREE.MeshBasicMaterial({ color: '#fff0c0', transparent: true, opacity: 0, toneMapped: false, depthWrite: false }));
    flash.position.set(0, 5.4, 0); body.add(flash);
    // the archer: a little hooded figure on the platform that turns to aim
    const ak = kit(); ak.cyl(0.18, 0.24, 0.7, '#5a6a3a', { p: [0, 0.35, 0] }, 7); ak.sphere(0.17, '#e6b48c', { p: [0, 0.85, 0] }, 8); ak.cone(0.22, 0.35, '#3a4a2a', { p: [0, 1.02, -0.02] }, 7);
    ak.torus(0.35, 0.025, P.dark, { p: [0.15, 0.55, 0.25], r: [0, Math.PI / 2, 0] }, Math.PI);
    const archer = ak.build('archer'); archer.position.y = 4.7; body.add(archer); group.userData.archer = archer;
  }
  if (kind === 'hall' || kind === 'kennel' || kind === 'lodge') {
    const r = Math.max(w, d) * 0.62;
    glowRing = new THREE.Mesh(new THREE.RingGeometry(r - 0.4, r, 56), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
    glowRing.rotation.x = -Math.PI / 2; glowRing.position.y = 0.08; group.add(glowRing);
  }
  // construction scaffold
  const sk = kit(), sw = w * 0.55, sd = d * 0.55, sh = kind === 'windmill' ? 7 : kind === 'tower' ? 5.4 : kind === 'barn' || kind === 'hall' ? 4 : 2.6;
  if (!['fence', 'wall', 'hedge', 'mud', 'snare', 'mine', 'watchstone', 'grave'].includes(kind)) {
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) sk.box(0.1, sh, 0.1, P.plank, { p: [x * sw, sh / 2, z * sd] });
    for (let y = 0.9; y < sh; y += 1.2) for (const s of [-1, 1]) { sk.box(sw * 2, 0.08, 0.08, P.plank, { p: [0, y, s * sd] }); sk.box(0.08, 0.08, sd * 2, P.plank, { p: [s * sw, y, 0] }); }
    sk.box(sw * 2.1, 0.06, sd * 2.1, '#6a5038', { p: [0, 0.03, 0] });
  }
  const scaffold = sk.build('scaffold'); scaffold.visible = false; group.add(scaffold);
  // damage: smoke puffs + a flame (shared materials, one sprite-free mesh each)
  const smoke = new THREE.Group(); smoke.visible = false; group.add(smoke);
  const smokeMat = new THREE.MeshBasicMaterial({ color: '#3a3430', transparent: true, opacity: 0.45, depthWrite: false });
  const fireMat = new THREE.MeshBasicMaterial({ color: '#ff8a2a', transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
  const puffs = []; for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 0), smokeMat); smoke.add(m); puffs.push(m); }
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.0, 6), fireMat); smoke.add(flame);
  const top = sh * 0.75;
  let progress = 1, damage = 0, t = 0, kick = 0;
  return {
    group, kind, radius: Math.max(w, d) * 0.6, w, d,
    setProgress(p) { progress = Math.max(0, Math.min(1, p)); scaffold.visible = progress < 1; body.scale.y = Math.max(0.04, progress); body.visible = progress > 0.02; },
    setDamage(k) { damage = Math.max(0, Math.min(1, k)); smoke.visible = damage >= 0.6; body.rotation.z = damage > 0.8 ? 0.05 : 0; },
    setReady(v) { ready = !!v; },
    fire(yaw = null) { kick = 1; if (yaw != null && group.userData.archer) group.userData.archer.rotation.y = yaw; },
    update(dt) {
      t += dt;
      if (sails) sails.rotation.z -= dt * 0.9;
      if (flash) { kick = Math.max(0, kick - dt * 5); flash.material.opacity = kick; flash.scale.setScalar(0.6 + kick); }
      if (glowRing) { readyK += ((ready ? 1 : 0) - readyK) * Math.min(1, dt * 4); glowRing.material.opacity = readyK * (0.35 + 0.25 * Math.sin(t * 3)); }
      if (smoke.visible) { puffs.forEach((m, i) => { const k = ((t * 0.4 + i / puffs.length) % 1); m.position.set(Math.sin(i * 2 + t) * 0.3, top + k * 3, Math.cos(i * 3) * 0.3); m.scale.setScalar(0.6 + k * 1.4); }); smokeMat.opacity = 0.25 + damage * 0.3; flame.position.y = top - 0.2; flame.scale.set(1, 0.8 + Math.sin(t * 13) * 0.2, 1); flame.visible = damage > 0.75; }
    },
    dispose() { const shared = new Set([...LINK_CACHE.values()].flatMap(v => Object.values(v))); group.traverse(o => { if (o.geometry && !shared.has(o.geometry)) o.geometry.dispose(); }); smokeMat.dispose(); fireMat.dispose(); flash?.material.dispose(); glowRing?.material.dispose(); },
  };
}

/** Merged geometries of a building (no moving parts) for an InstancedMesh, e.g. many hives or graves. */
export function hvfBuildingGeometry(kind, opts = {}) {
  if (kind === 'fence' || kind === 'wall' || kind === 'hedge') return linkedPiece(kind, opts.mask || 0);
  const [dw, dd] = DEFAULT_SIZE[kind] || [2, 2];
  const k = kit(); (BUILD[kind] || BUILD.mine)(k, opts.w ?? dw, opts.d ?? dd, { color: opts.color || '#e8c34a', seed: 1 });
  return { std: k.geometry('std'), metal: k.geometry('metal'), glow: k.geometry('glow'), cloth: k.geometry('cloth') };
}
