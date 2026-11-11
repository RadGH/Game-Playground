// The prop kit, drawn: one builder per kind (same ids as js/world/props.js). Stylised flat-shaded low-poly (ruling 14).
// A builder returns parts [[geometry, colour], ...] in the prop's own space (y up, facing +z, 1 unit = 1 m at scale 1);
// zone-view.js instances every part of every kind, so a forest of 400 trees is a handful of draw calls.
import * as THREE from 'three';

const C = (r, h, n = 6, y = 0) => new THREE.CylinderGeometry(r, r * 1.1, h, n).translate(0, y + h / 2, 0);
const T = (r1, r2, h, n = 6, y = 0) => new THREE.CylinderGeometry(r1, r2, h, n).translate(0, y + h / 2, 0);
const K = (r, h, n = 7, y = 0) => new THREE.ConeGeometry(r, h, n).translate(0, y + h / 2, 0);
const B = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
const I = (r, x = 0, y = 0, z = 0, d = 0) => jitter(new THREE.IcosahedronGeometry(r, d), r * 0.22, Math.round(r * 997 + x * 31 + y * 17)).translate(x, y, z);
const D = (r, x = 0, y = 0, z = 0) => jitter(new THREE.DodecahedronGeometry(r, 0), r * 0.25, Math.round(r * 613 + x * 7)).translate(x, y, z);
function jitter(geo, amt, seed) {
  const p = geo.attributes.position, seen = new Map(); let s = seed || 1;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647 - 0.5; };
  for (let i = 0; i < p.count; i++) { const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`; if (!seen.has(k)) seen.set(k, [r() * amt, r() * amt, r() * amt]); const d = seen.get(k); p.setXYZ(i, p.getX(i) + d[0], p.getY(i) + d[1], p.getZ(i) + d[2]); }
  geo.computeVertexNormals(); return geo;
}
const rot = (g, y = 0, x = 0, z = 0) => { g.rotateX(x); g.rotateY(y); g.rotateZ(z); return g; };
const WOOD = '#7a4f2e', DWOOD = '#5a3a22', LEAF = '#5fae3d', LEAF2 = '#79c24a', PINE = '#2f7d47', STONE = '#9a958c', STONE2 = '#b8b2a6', ROOF = '#b5523a', THATCH = '#c9a050', PLASTER = '#efe2c4';

export const PROP_MESHES = {
  tree: () => [[C(0.18, 1.7), WOOD], [I(1.25, 0, 2.5, 0), LEAF], [I(0.85, 0.55, 3.2, 0.2), LEAF2], [I(0.7, -0.5, 2.9, -0.3), LEAF]],
  tree_big: () => [[T(0.3, 0.45, 2.4), WOOD], [I(2.0, 0, 3.6, 0), LEAF], [I(1.4, 1.1, 4.6, 0.4), LEAF2], [I(1.2, -1.0, 4.2, -0.6), LEAF]],
  pine: () => [[C(0.13, 1), WOOD], [K(1.15, 1.8, 7, 0.7), PINE], [K(0.85, 1.5, 7, 1.6), PINE], [K(0.5, 1.1, 7, 2.5), PINE]],
  palm: () => { const parts = [[rot(T(0.12, 0.18, 3.4), 0, 0, 0.15), '#8a6a3a']]; for (let i = 0; i < 6; i++) parts.push([rot(B(0.35, 0.06, 1.8, 0, 0, 0.9), i * 1.05, -0.35).translate(0.5, 3.35, 0), '#4f9a3a']); return parts; },
  birch: () => [[C(0.12, 2.4), '#e8e4d8'], [I(0.9, 0, 2.9, 0), '#8fcf5a'], [I(0.6, 0.35, 3.5, 0.1), '#a5dc6a']],
  dead_tree: () => [[T(0.12, 0.22, 2.6), '#6a5a48'], [rot(T(0.05, 0.08, 1.2), 0, 0, 0.9).translate(0.5, 1.8, 0), '#6a5a48'], [rot(T(0.05, 0.08, 1.0), 2, 0, -0.8).translate(-0.4, 2.1, 0.1), '#6a5a48']],
  elder_tree: () => [[T(0.7, 1.1, 4.5), '#6a4a2e'], [I(3.4, 0, 6.2, 0, 1), '#3f8a5a'], [I(2.2, 2.0, 7.4, 0.5), '#5aa86a'], [I(2.0, -1.8, 6.8, -1.0), '#3f8a5a'], [rot(T(0.25, 0.4, 2.2), 0, 0, 1.2).translate(1.4, 0.4, 0), '#6a4a2e']],
  bush: () => [[I(0.65, 0, 0.45, 0), '#4f9a34'], [I(0.45, 0.45, 0.35, 0.2), '#62b040']],
  fern: () => { const p = []; for (let i = 0; i < 5; i++) p.push([rot(B(0.14, 0.03, 0.7, 0, 0, 0.35), i * 1.25, -0.6).translate(0, 0.15, 0), '#3f8a34']); return p; },
  flowers: () => ['#f06aa8', '#fff3a0', '#ffffff', '#b78cff', '#ff8a4a'].map((c, i) => [new THREE.IcosahedronGeometry(0.09, 0).translate(Math.cos(i * 1.7) * 0.45, 0.14, Math.sin(i * 1.7) * 0.45), c]),
  grass: () => { const p = []; for (let i = 0; i < 6; i++) p.push([rot(K(0.06, 0.55), 0, 0.2 * Math.cos(i), 0.2 * Math.sin(i)).translate(Math.cos(i * 2.1) * 0.25, 0, Math.sin(i * 2.1) * 0.25), '#6aaa3a']); return p; },
  reeds: () => { const p = []; for (let i = 0; i < 7; i++) p.push([C(0.025, 1.1 + (i % 3) * 0.2, 4).translate(Math.cos(i * 2.4) * 0.3, 0, Math.sin(i * 2.4) * 0.3), '#8aa04a']); return p; },
  mushroom: () => [[C(0.05, 0.22, 5), '#f0e6d0'], [new THREE.SphereGeometry(0.16, 6, 3, 0, 6.3, 0, 1.6).translate(0, 0.22, 0), '#d8402a'], [C(0.04, 0.15, 5).translate(0.25, 0, 0.1), '#f0e6d0'], [new THREE.SphereGeometry(0.11, 6, 3, 0, 6.3, 0, 1.6).translate(0.25, 0.15, 0.1), '#c8a050']],
  stump: () => [[T(0.38, 0.45, 0.45), WOOD], [T(0.36, 0.36, 0.02, 8, 0.45), '#d8b880']],
  log: () => [[rot(C(0.28, 2.4, 7), 0, 0, Math.PI / 2).translate(1.2, 0.28, 0), WOOD]],
  rock: () => [[D(0.95, 0, 0.35, 0).scale(1, 0.7, 1), STONE], [D(0.5, 0.75, 0.2, 0.45), STONE2]],
  boulder: () => [[D(1.7, 0, 0.9, 0).scale(1, 0.75, 1), STONE], [D(0.8, 1.3, 0.4, 0.7), STONE2], [D(0.5, -1.2, 0.3, -0.8), STONE]],
  rock_small: () => [[D(0.18, 0, 0.08, 0), STONE2], [D(0.12, 0.3, 0.06, 0.2), STONE], [D(0.1, -0.25, 0.05, 0.25), STONE2]],
  standing_stone: () => [[jitter(B(0.7, 2.6, 0.45), 0.08, 3), '#8a8a90']],
  ruin_pillar: () => [[T(0.38, 0.45, 2.4, 8), STONE2], [B(1.0, 0.25, 1.0, 0, 2.4, 0), STONE], [D(0.3, 0.5, 0.15, 0.6), STONE2]],
  ruin_wall: () => [[jitter(B(3.0, 1.6, 0.7), 0.12, 5), STONE2], [jitter(B(1.2, 0.8, 0.7, 0.9, 1.6, 0), 0.1, 6), STONE2]],
  ruin_arch: () => [[B(0.6, 3.0, 0.6, -1.3), STONE2], [B(0.6, 3.0, 0.6, 1.3), STONE2], [B(3.2, 0.6, 0.7, 0, 3.0, 0), STONE]],
  gravestone: () => [[B(0.5, 0.75, 0.15), '#8a8a90'], [rot(C(0.25, 0.15, 8), 0, Math.PI / 2).translate(0, 0.75, 0), '#8a8a90']],
  cairn: () => [[D(0.6, 0, 0.3, 0), STONE], [D(0.45, 0, 0.75, 0), STONE2], [D(0.3, 0, 1.1, 0), STONE]],
  fence: () => [[B(0.12, 1.0, 0.12, -1.0), WOOD], [B(0.12, 1.0, 0.12, 1.0), WOOD], [B(2.2, 0.1, 0.06, 0, 0.75, 0), WOOD], [B(2.2, 0.1, 0.06, 0, 0.4, 0), WOOD]],
  wall_stone: () => [[jitter(B(2.0, 1.4, 0.9), 0.06, 9), '#a8a090'], [B(2.1, 0.2, 1.0, 0, 1.4, 0), '#8a8274']],
  house: () => [[B(5, 3, 4.4), PLASTER], [rot(K(4.2, 2.4, 4, 3), Math.PI / 4).scale(1.05, 1, 0.85), ROOF], [B(1.1, 1.9, 0.1, 0, 0, 2.2), DWOOD], [B(0.9, 0.9, 0.1, 1.6, 1.4, 2.21), '#7ab0d8'], [B(0.5, 1.2, 0.5, 1.5, 4.2, -0.8), STONE]],
  hut: () => [[C(1.8, 1.8, 8), '#b08a5a'], [K(2.4, 2.0, 8, 1.8), THATCH], [B(0.9, 1.4, 0.1, 0, 0, 1.8), DWOOD]],
  tent: () => [[rot(K(1.5, 1.9, 4), Math.PI / 4).scale(1, 1, 1.4), '#c8b080'], [B(0.08, 2.0, 0.08, 0, 0, 1.5), WOOD]],
  windmill: () => { const p = [[T(1.6, 2.2, 6, 8), '#e8dcc0'], [K(2.0, 1.8, 8, 6), ROOF]]; for (let i = 0; i < 4; i++) p.push([rot(B(0.5, 3.4, 0.08, 0, 0, 0), 0, 0, i * Math.PI / 2).translate(0, 6, 2.0), '#d8c8a0']); return p; },
  well: () => [[T(0.85, 0.9, 0.8, 10), STONE2], [B(0.1, 1.6, 0.1, -0.75, 0.8, 0), WOOD], [B(0.1, 1.6, 0.1, 0.75, 0.8, 0), WOOD], [rot(K(1.1, 0.7, 4, 2.3), Math.PI / 4), ROOF]],
  dock: () => [[B(3, 0.15, 6, 0, 0.1, 0), '#9a6a3a'], [C(0.12, 1.1, 5).translate(-1.4, -0.6, 2.8), DWOOD], [C(0.12, 1.1, 5).translate(1.4, -0.6, 2.8), DWOOD], [C(0.12, 1.1, 5).translate(-1.4, -0.6, -1), DWOOD], [C(0.12, 1.1, 5).translate(1.4, -0.6, -1), DWOOD]],
  bridge: () => [[B(2.8, 0.2, 8, 0, 0.35, 0), '#9a6a3a'], [B(0.12, 0.8, 8, -1.35, 0.5, 0), DWOOD], [B(0.12, 0.8, 8, 1.35, 0.5, 0), DWOOD]],
  cart: () => [[B(1.4, 0.5, 2.2, 0, 0.5, 0), '#8a5a2a'], [rot(C(0.42, 0.12, 10), 0, 0, Math.PI / 2).translate(-0.75, 0.0, 0.5), DWOOD], [rot(C(0.42, 0.12, 10), 0, 0, Math.PI / 2).translate(0.75, 0.0, 0.5), DWOOD], [B(0.1, 0.1, 1.6, 0, 0.6, 1.8), WOOD]],
  haystack: () => [[T(0.6, 1.1, 1.2, 8), '#d8b850'], [K(0.65, 0.6, 8, 1.2), '#e8c860']],
  scarecrow: () => [[C(0.06, 1.9, 5), WOOD], [B(1.3, 0.08, 0.08, 0, 1.4, 0), WOOD], [I(0.22, 0, 1.95, 0), '#d8b850'], [K(0.3, 0.35, 6, 2.05), '#5a3a22'], [B(0.6, 0.6, 0.2, 0, 1.05, 0), '#7a6a9a']],
  signpost: () => [[C(0.07, 1.8, 5), WOOD], [B(0.9, 0.25, 0.06, 0.3, 1.4, 0), '#a07040'], [B(0.8, 0.22, 0.06, -0.25, 1.05, 0), '#a07040']],
  palisade: () => { const p = []; for (let i = 0; i < 5; i++) p.push([K(0.16, 0.5, 5, 2.0).translate((i - 2) * 0.42, 0, 0), WOOD], [C(0.16, 2.0, 6).translate((i - 2) * 0.42, 0, 0), WOOD]); return p; },
  watchtower: () => [[B(0.2, 4, 0.2, -1, 0, -1), WOOD], [B(0.2, 4, 0.2, 1, 0, -1), WOOD], [B(0.2, 4, 0.2, -1, 0, 1), WOOD], [B(0.2, 4, 0.2, 1, 0, 1), WOOD], [B(2.6, 0.2, 2.6, 0, 4, 0), '#9a6a3a'], [rot(K(2.1, 1.4, 4, 5.2), Math.PI / 4), THATCH], [B(2.6, 0.8, 0.1, 0, 4.2, 1.3), WOOD]],
  torch: () => [[T(0.06, 0.08, 1.5, 5), DWOOD], [K(0.16, 0.38, 5, 1.55), '#ffb240']],
  campfire: () => { const p = [[K(0.35, 0.7, 6), '#ff9a2a'], [K(0.2, 0.45, 5, 0.1).translate(0.12, 0, 0.05), '#ffd24a']]; for (let i = 0; i < 6; i++) p.push([D(0.16, Math.cos(i) * 0.55, 0.08, Math.sin(i) * 0.55), STONE]); return p; },
  banner: () => [[C(0.05, 2.6, 5), DWOOD], [B(0.8, 1.1, 0.04, 0.42, 1.3, 0), '#8a1a1a'], [B(0.9, 0.06, 0.06, 0.42, 2.45, 0), DWOOD]],
  crate: () => [[B(0.9, 0.9, 0.9), '#a07a48'], [B(0.95, 0.12, 0.95, 0, 0.4, 0), '#7a5a30']],
  barrel: () => [[T(0.38, 0.32, 0.95, 9), '#8a5a2a'], [T(0.4, 0.4, 0.06, 9, 0.2), '#5a5a5a'], [T(0.4, 0.4, 0.06, 9, 0.7), '#5a5a5a']],
  bones: () => [[rot(C(0.04, 0.5, 5), 0, 0, 1.4).translate(0.2, 0.05, 0), '#e8e0c8'], [rot(C(0.04, 0.4, 5), 1, 0, 1.5).translate(-0.1, 0.05, 0.2), '#e8e0c8'], [I(0.13, -0.3, 0.1, -0.1), '#e8e0c8']],
  stalagmite: () => [[jitter(K(0.55, 2.2, 6), 0.1, 11), '#8a8478'], [jitter(K(0.3, 1.2, 5).translate(0.5, 0, 0.3), 0.06, 12), '#9a948a']],
  cave_pillar: () => [[jitter(T(0.9, 1.3, 4.5, 7), 0.18, 13), '#7a746a'], [jitter(K(1.1, 1.2, 7, 4.5), 0.15, 14), '#6a645a']],
  crystal: () => [[rot(new THREE.OctahedronGeometry(0.3).scale(0.6, 1.8, 0.6), 0, 0.2).translate(0, 0.45, 0), '#7ae0ff'], [rot(new THREE.OctahedronGeometry(0.22).scale(0.6, 1.6, 0.6), 0, -0.4, 0.3).translate(0.25, 0.3, 0.1), '#b8a0ff'], [rot(new THREE.OctahedronGeometry(0.18).scale(0.6, 1.5, 0.6), 0, 0.5, -0.3).translate(-0.2, 0.25, -0.1), '#7ae0ff']],
  cobweb: () => [[rot(new THREE.CircleGeometry(0.9, 6), 0, -0.3).translate(0, 1.6, 0), '#e8e8e8']],
  egg_sac: () => [[I(0.4, 0, 0.35, 0), '#e8e0b8'], [I(0.28, 0.4, 0.25, 0.2), '#d8d0a8'], [I(0.22, -0.3, 0.2, 0.25), '#e8e0b8']],
  leech_pool: () => [[new THREE.CircleGeometry(1.6, 12).rotateX(-Math.PI / 2).translate(0, 0.03, 0), '#3a4a2a'], [new THREE.CircleGeometry(1.1, 10).rotateX(-Math.PI / 2).translate(0.2, 0.04, 0.1), '#2a3a1a']],
  coffin: () => [[B(0.7, 0.45, 1.9), '#5a3a22'], [B(0.75, 0.08, 1.95, 0, 0.45, 0), '#4a2a1a']],
  sarcophagus: () => [[B(1.2, 0.9, 2.4), '#a8a090'], [B(1.3, 0.2, 2.5, 0, 0.9, 0), '#8a8274'], [I(0.25, 0, 1.25, -0.6), '#8a8274']],
  brazier: () => [[T(0.12, 0.2, 0.9, 6), '#4a4a4a'], [T(0.45, 0.25, 0.3, 8, 0.9), '#5a5a5a'], [K(0.3, 0.6, 6, 1.1), '#ff9a2a']],
  bone_pile: () => [[I(0.35, 0, 0.15, 0), '#e8e0c8'], [rot(C(0.04, 0.6, 5), 0, 0, 1.4).translate(0.3, 0.1, 0.2), '#e8e0c8'], [I(0.14, -0.3, 0.3, 0.1), '#e8e0c8']],
  crypt_wall: () => [[B(2.2, 2.6, 0.8), '#7a7268'], [B(2.3, 0.25, 0.9, 0, 2.6, 0), '#6a6258']],
  niche: () => [[B(1.4, 2.0, 0.6), '#7a7268'], [B(0.9, 0.9, 0.2, 0, 0.8, 0.25), '#2a2420']],
  boat_wreck: () => [[rot(B(2.0, 0.9, 5.0, 0, 0, 0), 0, 0, 0.5), '#7a5a3a'], [rot(B(0.1, 2.4, 0.1, 0, 0.2, 0.5), 0, 0, 0.6), '#5a3a22'], [rot(B(1.8, 0.15, 1.2, 0, 0.6, -1.5), 0, 0, 0.5), '#6a4a2a']],
  lighthouse: () => [[T(1.5, 2.4, 9, 8), '#e8e0d0'], [T(1.6, 1.6, 0.8, 8, 3), '#c84a3a'], [T(1.6, 1.6, 0.8, 8, 6), '#c84a3a'], [T(1.3, 1.3, 1.6, 8, 9), '#ffe8a0'], [K(1.6, 1.4, 8, 10.6), '#5a3a2a']],
  grain_sacks: () => [[I(0.38, 0, 0.32, 0).scale(1, 1.2, 1), '#d8c08a'], [I(0.34, 0.5, 0.3, 0.2).scale(1, 1.2, 1), '#c8b07a'], [I(0.32, 0.2, 0.75, 0.1).scale(1, 1.1, 1), '#d8c08a']],
  market_stall: () => [[B(2.2, 0.9, 1.1, 0, 0, 0), '#9a6a3a'], [B(0.08, 2.2, 0.08, -1.05, 0, -0.5), '#5a3a22'], [B(0.08, 2.2, 0.08, 1.05, 0, -0.5), '#5a3a22'], [rot(B(2.4, 0.06, 1.4, 0, 0, 0), 0, -0.25).translate(0, 2.2, 0), '#d84a3a'], [I(0.18, -0.5, 1.0, 0), '#e8a040'], [I(0.18, 0.4, 1.0, 0.1), '#7ac040']],
  lantern_post: () => [[C(0.06, 2.4, 5), '#3a3a3a'], [B(0.5, 0.06, 0.06, 0.2, 2.3, 0), '#3a3a3a'], [B(0.22, 0.3, 0.22, 0.4, 1.95, 0), '#ffd27a']],
  burrow_mound: () => [[new THREE.SphereGeometry(0.6, 7, 3, 0, 6.3, 0, 1.4).scale(1, 0.45, 1), '#8a6a3a'], [new THREE.CircleGeometry(0.22, 8).rotateX(-Math.PI / 2).translate(0, 0.26, 0), '#2a1a0a']],
  gate: () => [[B(0.3, 2.6, 0.3, -1.6), '#5a3a22'], [B(0.3, 2.6, 0.3, 1.6), '#5a3a22'], [B(3.6, 0.3, 0.3, 0, 2.5, 0), '#5a3a22'], [rot(B(1.4, 2.0, 0.12, 0, 0, 0), 1.2).translate(-1.6, 0, 0.6), '#7a5a3a']],
  rope_bridge: () => [[B(2.0, 0.1, 9, 0, 0.3, 0), '#9a7a4a'], [B(0.05, 0.05, 9, -1, 1.1, 0), '#c8a870'], [B(0.05, 0.05, 9, 1, 1.1, 0), '#c8a870']],
  mine_cart: () => [[T(0.7, 0.55, 0.7, 4, 0.25), '#6a5a4a'], [rot(C(0.18, 0.1, 8), 0, 0, Math.PI / 2).translate(-0.5, 0.0, 0.35), '#3a3a3a'], [rot(C(0.18, 0.1, 8), 0, 0, Math.PI / 2).translate(0.5, 0.0, 0.35), '#3a3a3a'], [D(0.35, 0, 0.85, 0), '#6a6a72']],
  timber_frame: () => [[B(0.25, 2.8, 0.25, -1.3), '#6a4a2a'], [B(0.25, 2.8, 0.25, 1.3), '#6a4a2a'], [B(2.9, 0.3, 0.3, 0, 2.8, 0), '#6a4a2a']],
  // the Elderglade / Elder Roots (pale elven stone, roots, moonlight) and the Mirefen / Mire Crypt (stilts, cypress, bronze and wax)
  moon_well: () => [[T(2.3, 2.5, 0.5, 12), '#c8ccd8'], [new THREE.CircleGeometry(2.0, 14).rotateX(-Math.PI / 2).translate(0, 0.38, 0), '#bfe8ff'], [T(0.5, 0.6, 1.1, 6).translate(0, 0.5, -2.6), '#c8ccd8']],
  root_pillar: () => [[jitter(T(0.75, 1.25, 5.2, 7), 0.2, 21), '#5a3a22'], [jitter(rot(T(0.3, 0.5, 3.2, 6), 0, 0, 0.5).translate(0.9, 0.2, 0.3), 0.08, 22), '#6a4a2e']],
  root_arch: () => [[rot(T(0.32, 0.48, 3.6, 6), 0, 0, 0.42).translate(-1.75, 0, 0), '#5a3a22'], [rot(T(0.32, 0.48, 3.6, 6), 0, 0, -0.42).translate(1.75, 0, 0), '#5a3a22'], [rot(C(0.3, 3.0, 6), 0, 0, Math.PI / 2).translate(1.5, 3.35, 0), '#6a4a2e']],
  rune_stone: () => [[jitter(B(0.9, 3.2, 0.5), 0.05, 4), '#9aa4b4'], [new THREE.TorusGeometry(0.34, 0.07, 5, 10).translate(0, 2.3, 0.28), '#bfe8ff']],
  stilt_hut: () => [[B(0.25, 1.6, 3.6, -1.6), DWOOD], [B(0.25, 1.6, 3.6, 1.6), DWOOD], [B(4.2, 0.18, 4.2, 0, 1.5, 0), '#8a6a3a'], [B(3.2, 2.1, 3.0, 0, 1.68, -0.2), '#a08048'], [rot(K(2.9, 1.7, 4, 3.75), Math.PI / 4).scale(1, 1, 1.05), '#7a8a4a']],
  boardwalk: () => [[B(2.4, 0.12, 6, 0, 0.3, 0), '#8a6a3a'], [B(0.14, 0.42, 6, 1.15, 0, 0), DWOOD]],
  lily_pads: () => [[new THREE.CircleGeometry(0.55, 7).rotateX(-Math.PI / 2).translate(0, 0.5, 0), '#4a9a4a'], [new THREE.CircleGeometry(0.4, 7).rotateX(-Math.PI / 2).translate(0.8, 0.5, 0.5), '#5aa850']],
  swamp_tree: () => [[T(0.22, 0.62, 3.8, 7), '#6a5a48'], [I(1.5, 0, 4.6, 0), '#5a8a4a'], [rot(K(1.0, 1.4, 5), 0, Math.PI).translate(0.6, 4.1, 0.3), '#8aa07a']],
  totem: () => [[C(0.3, 3.0, 7), '#8a6a3a'], [I(0.45, 0, 3.1, 0), '#5a9a4a'], [B(1.3, 0.2, 0.2, 0, 2.3, 0), '#c8a050']],
  crypt_door: () => [[B(2.4, 3.0, 0.6), '#6a6258'], [B(1.4, 2.4, 0.2, 0, 0, 0.3), '#3a2e2a'], [new THREE.OctahedronGeometry(0.2).translate(0, 1.5, 0.45), '#d9b04a']],
  bell: () => [[B(0.3, 4.2, 0.3, -1.5), DWOOD], [B(0.3, 4.2, 0.3, 1.5), DWOOD], [B(3.4, 0.3, 0.3, 0, 4.2, 0), DWOOD], [T(0.95, 1.3, 1.8, 10, 2.2), '#b08a3a']],
  sconce: () => [[T(0.08, 0.16, 1.4, 5), '#3a3a3a'], [C(0.26, 0.32, 6, 1.4), '#e8d8a8'], [K(0.12, 0.32, 5, 1.72), '#ffd080']],
  // Highcairn Pass (snow, nests, prayer flags), Redcliff Heights (the warband's country in red rock) and the Warband Mine (rails, ore, powder)
  snow_pine: () => [[C(0.13, 1), WOOD], [K(1.1, 2.6, 7, 0.6), PINE], [K(0.6, 0.9, 7, 2.6), '#eef4f8']],
  drake_nest: () => [[T(1.4, 1.7, 0.55, 9), '#8a7a60'], [I(0.32, 0.3, 0.55, 0.2), '#c8b890'], [I(0.28, -0.4, 0.55, -0.1), '#d8c8a0']],
  flag_line: () => [[B(6.4, 0.05, 0.05, 0, 2.7, 0), '#c8a870'], [B(0.5, 0.42, 0.03, -2.2, 2.25, 0), '#b8352a'], [B(0.5, 0.42, 0.03, 0, 2.25, 0), '#e0a84a'], [B(0.5, 0.42, 0.03, 2.2, 2.25, 0), '#3a6aa8']],
  war_tent: () => [[rot(K(3.0, 3.4, 4), Math.PI / 4).scale(1, 1, 1.5), '#5a3230'], [B(0.14, 4.2, 0.14), DWOOD], [B(0.9, 0.6, 0.04, 0.45, 3.5, 0), '#b8352a']],
  drake_post: () => [[C(0.2, 2.6, 6), WOOD], [new THREE.TorusGeometry(0.28, 0.06, 5, 10).translate(0, 2.3, 0), '#5a5a5a'], [rot(C(0.05, 2.0, 4), 0, 0, 1.25).translate(0.9, 1.4, 0), '#5a5a5a']],
  skull_pole: () => [[C(0.12, 3.0, 5), DWOOD], [I(0.26, 0, 3.15, 0), '#e8e0c8'], [I(0.2, 0.05, 2.45, 0.1), '#e8e0c8']],
  firepot_stack: () => [[I(0.32, 0, 0.3, 0), '#6a4a3a'], [I(0.3, 0.55, 0.3, 0.2), '#7a5a4a'], [I(0.28, 0.25, 0.8, 0.1), '#6a4a3a']],
  red_spire: () => [[jitter(K(1.3, 6.5, 6), 0.25, 31), '#a04a3a'], [D(0.8, 0.9, 0.5, 0.4), '#b85a48']],
  rail: () => [[B(0.1, 0.1, 6, -0.75, 0.12, 0), '#5a5a5a'], [B(0.1, 0.1, 6, 0.75, 0.12, 0), '#5a5a5a'], [B(2.0, 0.08, 5.8, 0, 0.02, 0), '#4a3a2a']],
  ore_rock: () => [[D(0.95, 0, 0.35, 0).scale(1, 0.7, 1), '#5a5048'], [new THREE.OctahedronGeometry(0.26).translate(0.35, 0.6, 0.3), '#e0a84a'], [new THREE.OctahedronGeometry(0.2).translate(-0.4, 0.5, -0.2), '#e0a84a']],
  powder_keg: () => [[T(0.36, 0.3, 0.8, 8), '#4a3a2a'], [T(0.38, 0.38, 0.06, 8, 0.42), '#8a8a8a'], [C(0.03, 0.3, 4).translate(0.1, 0.8, 0), '#e8e0c8']],
  // the Sunken Ruins (drowned stone, kelp, the Bride's altar), Gravewatch Hills (barrows, obelisks) and the Deep Catacomb (bone, gold, candles)
  altar: () => [[B(2.2, 1.0, 1.0), '#8a8a90'], [B(2.4, 0.15, 1.2, 0, 1.0, 0), '#a8a8b0'], [C(0.06, 0.4, 5).translate(-0.8, 1.15, 0), '#f0e8c8'], [C(0.06, 0.4, 5).translate(0.8, 1.15, 0), '#f0e8c8']],
  drowned_statue: () => [[B(1.0, 0.5, 1.0), '#7a7a82'], [T(0.3, 0.38, 1.6, 7, 0.5), '#8a8a90'], [I(0.25, 0, 2.35, 0), '#8a8a90'], [rot(B(0.9, 0.14, 0.14, 0, 0, 0), 0, 0, 0.35).translate(0.2, 1.75, 0), '#8a8a90']],
  kelp: () => [[rot(C(0.05, 1.8, 4), 0, 0, 0.12), '#2f6a4a'], [rot(C(0.05, 1.4, 4), 0, 0, -0.18).translate(0.35, 0, 0.2), '#3a7a52'], [rot(C(0.05, 1.6, 4), 0, 0.3, 0.08).translate(-0.3, 0, -0.2), '#2f6a4a']],
  seal_sigil: () => [[new THREE.RingGeometry(3.2, 3.8, 24).rotateX(-Math.PI / 2).translate(0, 0.04, 0), '#d9b04a'], [new THREE.RingGeometry(1.2, 1.6, 16).rotateX(-Math.PI / 2).translate(0, 0.04, 0), '#d9b04a'], [new THREE.CircleGeometry(0.6, 8).rotateX(-Math.PI / 2).translate(0, 0.04, 0), '#d9b04a']],
  barrow_mound: () => [[new THREE.SphereGeometry(3.4, 10, 6, 0, 6.3, 0, 1.5).scale(1, 0.55, 1), '#5a7a3a'], [B(1.4, 1.8, 0.4, 0, 0, 3.0), '#3a3430'], [B(2.2, 0.4, 0.6, 0, 1.8, 3.0), '#7a7268']],
  obelisk: () => [[B(1.1, 0.4, 1.1), '#3a3440'], [T(0.3, 0.45, 3.6, 4, 0.4), '#3a3440'], [K(0.3, 0.5, 4, 4.0), '#d9b04a']],
  bone_cage: () => [[T(0.75, 0.8, 0.12, 8), '#e8e0c8'], [new THREE.TorusGeometry(0.7, 0.05, 5, 12).rotateX(Math.PI / 2).translate(0, 2.0, 0), '#e8e0c8'], [T(0.72, 0.72, 2.0, 8).translate(0, 0.1, 0), '#d8d0b8']],
  throne: () => [[B(1.8, 0.9, 1.4), '#3a3440'], [B(1.8, 2.6, 0.4, 0, 0.9, -0.5), '#3a3440'], [B(0.3, 0.6, 1.2, -0.75, 0.9, 0.1), '#d9b04a'], [B(0.3, 0.6, 1.2, 0.75, 0.9, 0.1), '#d9b04a'], [K(0.5, 0.7, 4, 3.5).translate(0, 0, -0.5), '#d9b04a']],
  bone_pillar: () => [[jitter(T(0.7, 0.9, 4.6, 7), 0.15, 41), '#d8d0b8'], [T(1.0, 1.0, 0.3, 8), '#c8c0a8'], [T(1.0, 1.0, 0.3, 8, 4.6), '#c8c0a8']],
  candle_cluster: () => [[C(0.07, 0.5, 5), '#f0e8c8'], [C(0.06, 0.35, 5).translate(0.22, 0, 0.1), '#f0e8c8'], [C(0.06, 0.28, 5).translate(-0.18, 0, 0.15), '#f0e8c8'], [K(0.08, 0.2, 5, 0.5), '#ffd080']],
  waypoint_stone: () => [[T(0.9, 1.1, 0.3, 8), STONE], [jitter(B(0.5, 1.8, 0.5, 0, 0.3, 0), 0.04, 2), '#8a8aa0'], [new THREE.OctahedronGeometry(0.28).translate(0, 2.5, 0), '#7ae0ff']],
  portal_ring: () => [[new THREE.TorusGeometry(1.4, 0.18, 6, 18).translate(0, 1.6, 0), STONE2], [T(1.2, 1.4, 0.2, 10), STONE]],
  cave_mouth: () => [[D(2.0, -2.2, 1.0, 0), '#6a6660'], [D(2.0, 2.2, 1.0, 0), '#6a6660'], [D(1.8, 0, 2.8, -0.4), '#5a5650'], [B(2.4, 0.02, 2.0, 0, 0.01, 0.6), '#1a1612']],
};
/** Kinds that give off light (torches, campfires; capped per zone). */
export const LIGHTS = { brazier: { color: '#ff9a3a', y: 1.3, i: 6, d: 8 }, lantern_post: { color: '#ffd27a', y: 2.0, i: 4, d: 7 }, crystal: { color: '#7ae0ff', y: 0.6, i: 2, d: 4 }, lighthouse: { color: '#ffe8a0', y: 9.5, i: 8, d: 16 }, torch: { color: '#ffae55', y: 1.8, i: 5, d: 7 }, campfire: { color: '#ff9a3a', y: 0.8, i: 7, d: 9 }, waypoint_stone: { color: '#7ae0ff', y: 2.5, i: 3, d: 5 }, moon_well: { color: '#bfe8ff', y: 1.0, i: 5, d: 10 }, rune_stone: { color: '#bfe8ff', y: 2.3, i: 2, d: 5 }, sconce: { color: '#ffd080', y: 1.8, i: 5, d: 7 }, candle_cluster: { color: '#ffd080', y: 0.7, i: 2, d: 4 }, altar: { color: '#ffd080', y: 1.4, i: 3, d: 6 }, obelisk: { color: '#d9b04a', y: 4.2, i: 2, d: 6 } };
