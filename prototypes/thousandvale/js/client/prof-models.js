// W9 professions — every model the professions put in the world, as plain geometry (no scene, no materials of its
// own beyond two shared ones). prof-view.js instances them.
//
//   NODES     boulder ×4 shapes (a player-sized rock) + ore chunks in 5 shapes by metal tier (the chunk colour is the
//             node's `tint`, per instance) · a marked tree (trunk + crown, a painted band and an axe notch) · a herb
//             patch · a mushroom ring · a fibre stand (reeds / flax). Each has a SPENT look built from the same parts:
//             a boulder with no ore and rubble at its foot, a tree whose band is crossed out, a patch picked bare.
//   STATIONS  forge (hearth, hood, anvil on a block, quench tub) · workbench (bench, vice, a small loom) · still
//             (copper pot, coil, bottles) · temper (grindstone, rune bench) — one merged geometry each.
//   TOOLS     pick, hatchet, knife, sickle, hammer, needle, spoon — modelled along +y with the grip at the origin
//             (avatar-3d chibi2-motion-prof.js PROF_TOOL_MOUNT turns them into the fist).
//
// Colour: every part is vertex-coloured. A part drawn with the TINT material has near-white vertex colours and takes
// the node's colour per instance; everything else is drawn with the plain material. Two materials, two shader
// programs (instancing on / off makes it four), all warmed at boot by prof-view.js `sample()`.

import * as THREE from 'three';

const TAU = Math.PI * 2;
function rng(seed) { let a = (seed >>> 0) || 1; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Pieces `{ g, c }` (geometry, colour) merged into one flat-shaded, vertex-coloured geometry. `c` may be a function of the vertex position. */
export function merged(pieces, { flat = true } = {}) {
  const parts = pieces.map(({ g, c }) => ({ g: g.index && flat ? g.toNonIndexed() : g, c }));
  let n = 0; for (const { g } of parts) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), idx = [];
  let o = 0; const cc = new THREE.Color(), v = new THREE.Vector3();
  for (const { g, c } of parts) {
    const cnt = g.attributes.position.count, P = g.attributes.position.array;
    pos.set(P, o * 3);
    for (let i = 0; i < cnt; i++) {
      if (typeof c === 'function') { v.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); cc.set(c(v)); } else if (i === 0) cc.set(c);
      col[(o + i) * 3] = cc.r; col[(o + i) * 3 + 1] = cc.g; col[(o + i) * 3 + 2] = cc.b;
    }
    if (g.index) for (const i of g.index.array) idx.push(i + o);
    else for (let i = 0; i < cnt; i++) idx.push(i + o);
    o += cnt;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(idx); out.computeVertexNormals();
  return out;
}
const box = (w, h, d, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (rx) g.rotateX(rx); if (rz) g.rotateZ(rz); if (ry) g.rotateY(ry); g.translate(x, y, z); return g; };
const cyl = (r0, r1, h, x = 0, y = 0, z = 0, seg = 8, rx = 0, rz = 0) => { const g = new THREE.CylinderGeometry(r1, r0, h, seg); if (rx) g.rotateX(rx); if (rz) g.rotateZ(rz); g.translate(x, y, z); return g; };
const ball = (r, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, d = 0) => { const g = new THREE.IcosahedronGeometry(r, d); g.scale(sx, sy, sz); g.translate(x, y, z); return g; };

// ------------------------------------------------------------------------------------------------ boulders and ore
/** How a boulder of shape v (0–3) is squashed: [sx, sy, sz, lean]. Its foot is at y = 0 and it is about 1 unit tall. */
const BOULDER = [[1.1, 1, 0.95, 0.0], [0.92, 1.12, 0.86, 0.12], [1.12, 0.98, 0.9, -0.08], [0.98, 1.05, 1.12, 0.05]];
/** The rock's surface radius in direction (dx, dy, dz) for shape v — the same lumps the geometry has, so chunks sit ON it. */
function boulderRadius(v, dx, dy, dz) {
  const s = v * 7.3 + 1;
  return 0.5 * (1 + 0.16 * Math.sin(dx * 3.1 + s) * Math.cos(dz * 2.7 + s * 1.3) + 0.1 * Math.sin(dy * 4.3 + s * 2.1) + 0.07 * Math.cos((dx + dz) * 5.2 + s));
}
/** A rock's raw surface point for direction (dx, dy, dz) — before it is stood on the ground and made one unit tall. */
function boulderPoint(v, dx, dy, dz, out) {
  const [sx, sy, sz, lean] = BOULDER[v % 4], r = boulderRadius(v, dx, dy, dz), flatFoot = dy < -0.45 ? 0.75 : 1;
  return out.set(dx * r * sx + lean * (dy + 0.5) * 0.5, Math.max(-0.42, dy * r * sy * flatFoot), dz * r * sz);
}
const FIT = new Map();
/** { y0, k }: lift by -y0 and scale by k so shape v stands on y = 0 and is exactly one unit tall. */
function boulderFit(v) {
  v %= 4; if (FIT.has(v)) return FIT.get(v);
  const g = new THREE.IcosahedronGeometry(1, 2), P = g.attributes.position, p = new THREE.Vector3(), q = new THREE.Vector3(); let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < P.count; i++) { p.fromBufferAttribute(P, i).normalize(); boulderPoint(v, p.x, p.y, p.z, q); lo = Math.min(lo, q.y); hi = Math.max(hi, q.y); }
  const fit = { y0: lo, k: 1 / (hi - lo) }; FIT.set(v, fit); return fit;
}
/** A player-sized rock: one unit tall, foot at y = 0. Grey with darker hollows; flat-shaded. */
export function boulderGeometry(v = 0) {
  const g = new THREE.IcosahedronGeometry(1, 2).toNonIndexed(), P = g.attributes.position, { y0, k } = boulderFit(v);
  const p = new THREE.Vector3(), q = new THREE.Vector3();
  for (let i = 0; i < P.count; i++) { p.fromBufferAttribute(P, i).normalize(); boulderPoint(v, p.x, p.y, p.z, q); P.setXYZ(i, q.x * k, (q.y - y0) * k, q.z * k); }
  return merged([{ g, c: w => { const t = 0.17 + 0.09 * w.y + 0.035 * Math.sin(w.x * 9 + w.z * 7 + v); return new THREE.Color(t * 1.03, t, t * 0.95); } }]);
}
/** Where `n` ore chunks sit on boulder shape v: [{ pos: [x, y, z], normal: [x, y, z], scale, spin }] in the boulder's unit space. Pure, stable per (v, n). */
export function chunkPlacements(v = 0, n = 6) {
  const { y0, k } = boulderFit(v), R = rng(1000 + (v % 4) * 131), out = [], q = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    // spread round the upper two thirds, never underneath: golden-angle longitudes, heights from the shoulder up
    const a = i * 2.39996 + R() * 0.5 + v, y = 0.08 + 0.78 * ((i + 0.5) / n) * (0.75 + 0.5 * R()), rr = Math.sqrt(Math.max(0.05, 1 - y * y));
    const d = new THREE.Vector3(Math.cos(a) * rr, y, Math.sin(a) * rr).normalize();
    boulderPoint(v, d.x, d.y, d.z, q);
    out.push({ pos: [q.x * k, (q.y - y0) * k, q.z * k], normal: [d.x, d.y * 1.15, d.z], scale: 0.7 + 0.6 * R(), spin: R() * TAU });
  }
  return out;
}
/**
 * One ore chunk, sticking out along +y from the origin (its root is buried a little), about 0.2 units tall — a
 * different silhouette per metal tier, so a silver boulder does not read as a re-coloured copper one:
 *   1 nuggets (copper, tin): a knobbly lump          2 slabs (iron): a flat angular plate
 *   3 prisms (silver): a six-sided crystal            4 shards (blackiron): a jagged dark spike
 *   5 stars (sunsteel): a cluster of three bright points
 */
export function oreChunkGeometry(tier = 1) {
  const bright = q => { const k = 0.78 + 0.22 * Math.min(1, Math.max(0, q.y / 0.2)); return new THREE.Color(k, k, k); };
  switch (tier) {
    case 2: return merged([{ g: box(0.2, 0.2, 0.07, 0, 0.06, 0, 0.3, 0, 0.35), c: bright }, { g: box(0.12, 0.14, 0.06, 0.07, 0.03, 0.05, -0.5, 0.2, -0.3), c: bright }]);
    case 3: { const a = cyl(0.055, 0.05, 0.2, 0, 0.07, 0, 6), tip = new THREE.ConeGeometry(0.05, 0.08, 6); tip.translate(0, 0.21, 0); const b = cyl(0.04, 0.035, 0.12, 0.07, 0.03, 0.02, 6, 0, -0.5), tb = new THREE.ConeGeometry(0.035, 0.06, 6); tb.rotateZ(-0.5); tb.translate(0.115, 0.105, 0.02); return merged([{ g: a, c: bright }, { g: tip, c: '#ffffff' }, { g: b, c: bright }, { g: tb, c: '#ffffff' }]); }
    case 4: { const a = new THREE.ConeGeometry(0.07, 0.3, 4); a.translate(0, 0.1, 0); const b = new THREE.ConeGeometry(0.05, 0.2, 4); b.rotateZ(0.6); b.translate(-0.06, 0.05, 0.03); const c = new THREE.ConeGeometry(0.04, 0.16, 4); c.rotateZ(-0.7); c.translate(0.06, 0.04, -0.02); return merged([{ g: a, c: bright }, { g: b, c: bright }, { g: c, c: bright }]); }
    case 5: { const a = new THREE.OctahedronGeometry(0.1); a.scale(0.7, 1.5, 0.7); a.translate(0, 0.1, 0); const b = new THREE.OctahedronGeometry(0.07); b.scale(0.7, 1.4, 0.7); b.rotateZ(0.7); b.translate(-0.08, 0.05, 0.02); const c = new THREE.OctahedronGeometry(0.06); c.scale(0.7, 1.4, 0.7); c.rotateZ(-0.8); c.translate(0.08, 0.04, -0.03); return merged([{ g: a, c: '#ffffff' }, { g: b, c: bright }, { g: c, c: bright }]); }
    default: return merged([{ g: ball(0.1, 0, 0.05, 0, 1.1, 0.9, 1), c: bright }, { g: ball(0.065, 0.07, 0.07, 0.03), c: bright }, { g: ball(0.05, -0.06, 0.03, -0.04), c: bright }]);
  }
}
/** Broken rock at the foot of a spent boulder (unit space, drawn with the plain material). */
export function rubbleGeometry() {
  const R = rng(77), pieces = [];
  for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU + R(), d = 0.62 + 0.25 * R(), s = 0.05 + 0.07 * R(); pieces.push({ g: ball(s, Math.cos(a) * d, s * 0.6, Math.sin(a) * d, 1.2, 0.8, 1), c: i % 3 ? '#6b6862' : '#57534e' }); }
  return merged(pieces);
}

// ------------------------------------------------------------------------------------------------ the marked tree
/** A tree 1 unit tall, foot at y = 0: a trunk that is a third of its height and a layered crown. v = 0–3 picks the crown. Plain material. */
export function treeGeometry(v = 0) {
  const R = rng(300 + v * 17), pieces = [];
  pieces.push({ g: cyl(0.045, 0.03, 0.5, 0, 0.25, 0, 7), c: q => (q.y < 0.04 ? '#3a2a1c' : '#5a4230') });
  for (const a of [0.4, 2.5, 4.4]) pieces.push({ g: cyl(0.05, 0.012, 0.09, Math.cos(a) * 0.045, 0.03, Math.sin(a) * 0.045, 4, 0, 0), c: '#3f2e20' });       // root flares
  if (v % 2 === 0) {            // broadleaf: lumps of foliage
    const greens = ['#3f7a34', '#4f8f3f', '#356b2d', '#5a9a48'];
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + R(), d = i < 5 ? 0.12 + 0.05 * R() : 0, y = 0.55 + (i < 5 ? 0.13 * R() : 0.2); pieces.push({ g: ball(0.15 + 0.05 * R(), Math.cos(a) * d, y, Math.sin(a) * d, 1, 0.85, 1, 1), c: greens[i % 4] }); }
    pieces.push({ g: cyl(0.02, 0.012, 0.2, 0.06, 0.48, 0.02, 5, 0, -0.8), c: '#5a4230' });
  } else {                      // conifer: three skirts
    for (let i = 0; i < 3; i++) { const g = new THREE.ConeGeometry(0.2 - i * 0.045, 0.3, 8); g.translate(0, 0.52 + i * 0.17, 0); pieces.push({ g, c: i % 2 ? '#2f6a3a' : '#3a7a44' }); }
  }
  return merged(pieces);
}
/** The woodsman's mark: a painted band round the trunk at chest height, in WORLD metres (a tree of any size wears it at 1.3 m). Tint material. */
export function treeBandGeometry() { return merged([{ g: cyl(1.06, 1.06, 0.2, 0, 1.3, 0, 10), c: '#ffffff' }, { g: cyl(1.07, 1.07, 0.04, 0, 1.55, 0, 10), c: '#f0f0f0' }]); }
/** The axe notch under the band (pale fresh wood), a unit trunk radius; and the chips on the ground. Plain material. */
export function treeNotchGeometry() {
  const wedge = new THREE.CylinderGeometry(1.1, 1.1, 0.34, 8, 1, false, -0.7, 1.4); wedge.scale(1, 1, 1.02); wedge.translate(0, 0.85, 0);
  const chips = []; const R = rng(5); for (let i = 0; i < 6; i++) chips.push({ g: box(0.25, 0.04, 0.12, 0.6 * (R() - 0.5), 0.02, 1.5 + 0.9 * R(), R() * 3), c: '#e8cf9a' });
  return merged([{ g: wedge, c: '#e8cf9a' }, ...chips]);
}
/** Spent: the band crossed out — two grey strips over it, world metres at unit trunk radius. Plain material. */
export function treeCrossGeometry() {
  const a = box(0.12, 0.62, 0.05, 0, 1.3, 1.1, 0, 0, 0.75), b = box(0.12, 0.62, 0.05, 0, 1.3, 1.1, 0, 0, -0.75);
  return merged([{ g: a, c: '#2b2b2b' }, { g: b, c: '#2b2b2b' }]);
}

// ------------------------------------------------------------------------------------------------ foraging patches
/** Herb patch: leaves (plain) and flower heads (tint), unit = the node's `size` (knee-high). About 1.6 units across. */
export function herbLeavesGeometry() {
  const R = rng(41), pieces = [];
  for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU + R() * 0.6, d = 0.2 + 0.55 * R(), x = Math.cos(a) * d, z = Math.sin(a) * d, hgt = 0.6 + 0.5 * R();
    pieces.push({ g: cyl(0.03, 0.02, hgt, x, hgt / 2, z, 4), c: '#4f8a40' });
    for (const k of [0, 1, 2]) { const la = a + k * 2.1; pieces.push({ g: ball(0.16, x + Math.cos(la) * 0.12, hgt * (0.35 + 0.2 * k), z + Math.sin(la) * 0.12, 1, 0.3, 0.55), c: k % 2 ? '#5a9a48' : '#467c3a' }); } }
  return merged(pieces);
}
export function herbFlowersGeometry() {
  const R = rng(41), pieces = [];
  for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU + R() * 0.6, d = 0.2 + 0.55 * R(), x = Math.cos(a) * d, z = Math.sin(a) * d, hgt = 0.6 + 0.5 * R();
    if (i % 3 === 2) continue; pieces.push({ g: ball(0.13, x, hgt + 0.08, z, 1, 0.8, 1), c: '#ffffff' }); pieces.push({ g: ball(0.06, x, hgt + 0.17, z), c: '#fff6c8' }); }
  return merged(pieces);
}
/** Mushroom ring: stems (plain) and caps (tint); unit = `size`. A ring 2.2 units across with a few in the middle. */
function shroomSpots() { const R = rng(63), out = []; for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + R() * 0.4, d = i < 6 ? 1.1 + 0.2 * R() : 0.4 * R(); out.push([Math.cos(a) * d, Math.sin(a) * d, 0.7 + 0.7 * R()]); } return out; }
export function mushroomStemsGeometry() { return merged(shroomSpots().map(([x, z, s]) => ({ g: cyl(0.1 * s, 0.07 * s, 0.6 * s, x, 0.3 * s, z, 6), c: '#efe6d2' }))); }
export function mushroomCapsGeometry() {
  return merged(shroomSpots().flatMap(([x, z, s]) => { const cap = new THREE.SphereGeometry(0.3 * s, 8, 4, 0, TAU, 0, Math.PI / 2); cap.scale(1, 0.75, 1); cap.translate(x, 0.56 * s, z); const under = cyl(0.3 * s, 0.26 * s, 0.03 * s, x, 0.55 * s, z, 8); return [{ g: cap, c: '#ffffff' }, { g: under, c: '#cfcfcf' }]; }));
}
/** Fibre stand (reeds, flax): stalks (plain) and seed heads (tint); unit = `size` (waist-high). */
function stalks() { const R = rng(88), out = []; for (let i = 0; i < 14; i++) { const a = R() * TAU, d = 0.45 * Math.sqrt(R()); out.push([Math.cos(a) * d, Math.sin(a) * d, 0.75 + 0.3 * R(), (R() - 0.5) * 0.25, (R() - 0.5) * 0.25]); } return out; }
export function fibreStalksGeometry() { return merged(stalks().map(([x, z, hgt, lx, lz]) => ({ g: cyl(0.018, 0.012, hgt, x + lx * hgt / 2, hgt / 2, z + lz * hgt / 2, 4, lz, -lx), c: q => (q.y < 0.2 ? '#7a8a4a' : '#9aa85a') }))); }
export function fibreHeadsGeometry() { return merged(stalks().map(([x, z, hgt, lx, lz]) => ({ g: ball(0.05, x + lx * hgt, hgt + 0.04, z + lz * hgt, 0.8, 2.2, 0.8), c: '#ffffff' }))); }
/** Spent patch: cut stubble (plain), unit = `size`. */
export function stubbleGeometry() { const R = rng(9), p = []; for (let i = 0; i < 10; i++) { const a = R() * TAU, d = 0.9 * Math.sqrt(R()); p.push({ g: cyl(0.03, 0.025, 0.12 + 0.1 * R(), Math.cos(a) * d, 0.07, Math.sin(a) * d, 4), c: i % 2 ? '#8a8a5a' : '#6f7a48' }); } return merged(p); }

/**
 * What a node is made of. model -> [{ part, tint?, when: 'ready' | 'spent' | 'both', unit: 'size' | 'trunk' | 'boulder', lit? }].
 * prof-view.js keeps one InstancedMesh per part.
 */
export const NODE_PARTS = {
  boulder: v => [{ part: 'boulder' + (v % 4), when: 'both', unit: 'size' }, { part: 'rubble', when: 'spent', unit: 'size' }],      // + the chunks, placed by chunkPlacements
  tree: v => [{ part: 'tree' + (v % 4), when: 'both', unit: 'size' }, { part: 'treeBand', tint: true, when: 'both', unit: 'trunk' }, { part: 'treeNotch', when: 'spent', unit: 'trunk' }, { part: 'treeCross', when: 'spent', unit: 'trunk' }],
  herb: () => [{ part: 'herbLeaves', when: 'ready', unit: 'size' }, { part: 'herbFlowers', tint: true, when: 'ready', unit: 'size' }, { part: 'stubble', when: 'spent', unit: 'size' }],
  mushroom: () => [{ part: 'mushroomStems', when: 'ready', unit: 'size' }, { part: 'mushroomCaps', tint: true, when: 'ready', unit: 'size' }, { part: 'stubble', when: 'spent', unit: 'size' }],
  fibre: () => [{ part: 'fibreStalks', when: 'ready', unit: 'size' }, { part: 'fibreHeads', tint: true, when: 'ready', unit: 'size' }, { part: 'stubble', when: 'spent', unit: 'size' }],
};
/** Every part's geometry builder (built once, on first use). */
export const PART_GEOMETRY = {
  boulder0: () => boulderGeometry(0), boulder1: () => boulderGeometry(1), boulder2: () => boulderGeometry(2), boulder3: () => boulderGeometry(3), rubble: rubbleGeometry,
  ore1: () => oreChunkGeometry(1), ore2: () => oreChunkGeometry(2), ore3: () => oreChunkGeometry(3), ore4: () => oreChunkGeometry(4), ore5: () => oreChunkGeometry(5),
  tree0: () => treeGeometry(0), tree1: () => treeGeometry(1), tree2: () => treeGeometry(2), tree3: () => treeGeometry(3), treeBand: treeBandGeometry, treeNotch: treeNotchGeometry, treeCross: treeCrossGeometry,
  herbLeaves: herbLeavesGeometry, herbFlowers: herbFlowersGeometry, mushroomStems: mushroomStemsGeometry, mushroomCaps: mushroomCapsGeometry, fibreStalks: fibreStalksGeometry, fibreHeads: fibreHeadsGeometry, stubble: stubbleGeometry,
};
export const TINT_PARTS = new Set(['ore1', 'ore2', 'ore3', 'ore4', 'ore5', 'treeBand', 'herbFlowers', 'mushroomCaps', 'fibreHeads']);
/** A tree's trunk radius in metres for its height (treeGeometry's trunk is 0.045 of the height at the foot, a little less at the band). */
export const trunkRadius = size => Math.max(0.16, size * 0.04);
/** How far above the ground a node's glint floats, in metres. */
export function glintHeight(look) { const m = look?.model, s = look?.size || 1; return m === 'boulder' ? s + 0.5 : m === 'tree' ? 2.4 : m === 'fibre' ? s + 0.5 : 1.0; }

// ------------------------------------------------------------------------------------------------ stations
/** A station as one merged geometry, metres, facing +z, standing on y = 0, about 2 m wide. `glow` = where its fire is (for a light / flame sprite), or null. */
export function stationGeometry(kind) {
  const P = [];
  const stone = q => (Math.sin(q.x * 13) * Math.sin(q.y * 11 + q.z * 7) > 0.3 ? '#6f6a62' : '#7d776c'), wood = '#6a4a2a', dark = '#3a2a1c', iron = '#3a3d44', steel = '#9aa2ac', copper = '#c9824a';
  if (kind === 'forge') {
    P.push({ g: box(1.3, 0.9, 1.0, -0.55, 0.45, -0.2), c: stone }, { g: box(1.0, 0.12, 0.7, -0.55, 0.92, -0.2), c: '#2a1a12' });                 // hearth and its bed of coals
    for (let i = 0; i < 7; i++) P.push({ g: ball(0.09, -0.9 + (i % 4) * 0.22, 0.99, -0.35 + Math.floor(i / 4) * 0.25, 1, 0.6, 1), c: i % 2 ? '#ff7a30' : '#ffb04a' });
    P.push({ g: box(1.3, 0.12, 0.12, -0.55, 1.9, 0.24), c: stone }, { g: box(0.12, 1.0, 0.12, -1.14, 1.4, 0.24), c: stone }, { g: box(0.12, 1.0, 0.12, 0.04, 1.4, 0.24), c: stone });   // hood frame
    { const hood = new THREE.CylinderGeometry(0.22, 0.75, 0.8, 4); hood.rotateY(Math.PI / 4); hood.translate(-0.55, 2.3, -0.2); P.push({ g: hood, c: '#5a554e' }, { g: box(0.36, 0.7, 0.36, -0.55, 3.0, -0.2), c: stone }); }
    P.push({ g: cyl(0.26, 0.3, 0.55, 0.75, 0.275, 0.15, 8), c: wood });                                                                      // the anvil's block
    P.push({ g: box(0.5, 0.14, 0.26, 0.75, 0.78, 0.15), c: iron }, { g: box(0.22, 0.16, 0.18, 0.75, 0.63, 0.15), c: iron }, { g: box(0.34, 0.06, 0.24, 0.75, 0.57, 0.15), c: iron });
    { const horn = new THREE.ConeGeometry(0.09, 0.3, 6); horn.rotateZ(-Math.PI / 2); horn.translate(1.14, 0.78, 0.15); P.push({ g: horn, c: iron }); }
    P.push({ g: cyl(0.26, 0.3, 0.5, 0.9, 0.25, -0.75, 10), c: dark }, { g: cyl(0.25, 0.25, 0.02, 0.9, 0.46, -0.75, 10), c: '#3f6a8a' });        // quench tub
    P.push({ g: box(0.05, 0.6, 0.05, 0.3, 0.75, -0.62, 0, 0, 0.3), c: iron }, { g: box(0.05, 0.6, 0.05, 0.4, 0.75, -0.62, 0, 0, -0.2), c: iron });   // tongs leaning
    return { geometry: merged(P), glow: { x: -0.55, y: 1.15, z: -0.2, color: '#ff9a3d' } };
  }
  if (kind === 'workbench') {
    P.push({ g: box(1.6, 0.1, 0.7, -0.2, 0.85, 0), c: wood });
    for (const [x, z] of [[-0.9, -0.28], [0.5, -0.28], [-0.9, 0.28], [0.5, 0.28]]) P.push({ g: box(0.09, 0.8, 0.09, x, 0.4, z), c: dark });
    P.push({ g: box(1.4, 0.06, 0.5, -0.2, 0.25, 0), c: dark });
    P.push({ g: box(0.5, 0.04, 0.36, -0.55, 0.92, 0.02, 0.2), c: '#b08a5e' }, { g: box(0.3, 0.03, 0.3, -0.5, 0.95, 0.04, -0.3), c: '#7a5a8a' });   // a hide and a cloth on the bench
    P.push({ g: cyl(0.06, 0.06, 0.2, 0.25, 1.0, -0.15, 8), c: '#e8e0c8' }, { g: cyl(0.06, 0.06, 0.2, 0.4, 1.0, 0.1, 8), c: '#8fb6e0' });           // spools
    P.push({ g: box(0.22, 0.18, 0.14, 0.42, 0.99, -0.2), c: iron });                                                                              // a vice
    // a small upright loom beside it
    P.push({ g: box(0.08, 1.7, 0.08, 1.0, 0.85, -0.25), c: wood }, { g: box(0.08, 1.7, 0.08, 1.0, 0.85, 0.45), c: wood }, { g: box(0.08, 0.08, 0.8, 1.0, 1.66, 0.1), c: wood }, { g: box(0.08, 0.08, 0.8, 1.0, 0.5, 0.1), c: wood });
    P.push({ g: box(0.02, 1.1, 0.6, 1.0, 1.08, 0.1), c: q => (Math.floor(q.z * 14) % 2 ? '#e8e0c8' : '#c9bfa2') }, { g: box(0.03, 0.35, 0.6, 1.0, 0.72, 0.1), c: '#7a5a8a' });
    return { geometry: merged(P), glow: null };
  }
  if (kind === 'still') {
    P.push({ g: box(0.9, 0.5, 0.8, -0.4, 0.25, 0), c: stone }, { g: box(0.5, 0.2, 0.3, -0.4, 0.2, 0.3), c: '#1c120c' });                             // brick base with a fire mouth
    P.push({ g: ball(0.36, -0.4, 0.85, 0, 1, 0.95, 1, 1), c: copper }, { g: cyl(0.16, 0.08, 0.35, -0.4, 1.3, 0, 8), c: copper });                  // the pot and its neck
    P.push({ g: cyl(0.04, 0.04, 0.8, -0.05, 1.42, 0, 6, 0, Math.PI / 2 - 0.25), c: copper });                                                      // the arm
    for (let i = 0; i < 4; i++) { const t = new THREE.TorusGeometry(0.15, 0.025, 5, 12); t.rotateX(Math.PI / 2); t.translate(0.45, 1.15 - i * 0.12, 0); P.push({ g: t, c: copper }); }   // the coil
    P.push({ g: cyl(0.2, 0.22, 0.75, 0.45, 0.6, 0, 10), c: '#5a4230' }, { g: cyl(0.1, 0.12, 0.2, 0.45, 0.1, 0.32, 8), c: '#7fd0c0' });               // the cooling barrel, a catch jar
    P.push({ g: box(0.7, 0.06, 0.4, 1.05, 0.8, -0.1), c: wood }, { g: box(0.06, 0.8, 0.06, 0.75, 0.4, -0.1), c: dark }, { g: box(0.06, 0.8, 0.06, 1.35, 0.4, -0.1), c: dark });   // a little table of bottles
    for (const [x, c] of [[0.85, '#d83838'], [1.05, '#58c0a0'], [1.25, '#c070e0']]) P.push({ g: cyl(0.06, 0.06, 0.16, x, 0.91, -0.1, 8), c }, { g: cyl(0.025, 0.025, 0.08, x, 1.03, -0.1, 6), c: '#d8d0c0' });
    return { geometry: merged(P), glow: { x: -0.4, y: 0.25, z: 0.45, color: '#ff9a3d' } };
  }
  // temper: a grindstone on its frame and a low bench with a rune plate and a small crucible
  { const wheel = new THREE.CylinderGeometry(0.42, 0.42, 0.14, 16); wheel.rotateX(Math.PI / 2); wheel.translate(-0.5, 0.75, 0); P.push({ g: wheel, c: q => (Math.sin(Math.atan2(q.y - 0.75, q.x + 0.5) * 9) > 0.4 ? '#8d8a84' : '#9c9992') }); }
  P.push({ g: box(0.08, 0.8, 0.08, -0.85, 0.4, 0.22), c: wood }, { g: box(0.08, 0.8, 0.08, -0.15, 0.4, 0.22), c: wood }, { g: box(0.08, 0.8, 0.08, -0.85, 0.4, -0.22), c: wood }, { g: box(0.08, 0.8, 0.08, -0.15, 0.4, -0.22), c: wood }, { g: box(0.8, 0.07, 0.07, -0.5, 0.75, 0.22), c: dark }, { g: box(0.8, 0.07, 0.07, -0.5, 0.75, -0.22), c: dark });
  P.push({ g: cyl(0.03, 0.03, 0.34, -0.5, 0.75, 0.28, 6, Math.PI / 2), c: iron }, { g: box(0.05, 0.22, 0.05, -0.5, 0.64, 0.45), c: iron });         // the crank
  P.push({ g: box(1.0, 0.1, 0.6, 0.7, 0.7, 0), c: wood }, { g: box(0.1, 0.65, 0.5, 0.28, 0.33, 0), c: dark }, { g: box(0.1, 0.65, 0.5, 1.12, 0.33, 0), c: dark });
  P.push({ g: box(0.46, 0.04, 0.34, 0.62, 0.77, 0.02), c: '#2d3a52' }, { g: box(0.3, 0.02, 0.04, 0.62, 0.8, 0.02), c: '#7fd0ff' }, { g: box(0.04, 0.02, 0.22, 0.62, 0.8, 0.02), c: '#7fd0ff' });   // the rune plate
  P.push({ g: cyl(0.1, 0.13, 0.16, 1.0, 0.83, -0.12, 8), c: '#4a4038' }, { g: cyl(0.1, 0.1, 0.02, 1.0, 0.9, -0.12, 8), c: '#ffb04a' });               // a crucible, glowing
  P.push({ g: box(0.05, 0.9, 0.02, 0.9, 1.0, 0.24, 0, 0.25, 0), c: steel });                                                                         // a blade leaning on the bench
  return { geometry: merged(P), glow: { x: 1.0, y: 1.0, z: -0.12, color: '#ffb04a' } };
}
export const STATION_KINDS = ['forge', 'workbench', 'still', 'temper'];
/** Which station props a craftsman's role gets (data/rules/professions.json `roles.<role>.stations`). */
export function stationsFor(stationProfs = []) {
  const out = [];
  if (stationProfs.includes('smithing')) out.push('forge');
  if (stationProfs.includes('tempering')) out.push('temper');
  if (stationProfs.includes('outfitting')) out.push('workbench');
  if (stationProfs.includes('alchemy')) out.push('still');
  return out;
}

// ------------------------------------------------------------------------------------------------ tools in the hand
/** A tool along +y, grip at the origin (hand units: a fist is about 0.09 across; a pick's haft is 0.62 long). Plain material. */
export function toolGeometry(kind) {
  const wood = '#6a4a2a', iron = '#8d97a3', dark = '#4a505a', P = [];
  switch (kind) {
    case 'pick': { P.push({ g: cyl(0.02, 0.018, 0.7, 0, 0.27, 0, 6), c: wood });
      const head = new THREE.TorusGeometry(0.3, 0.028, 5, 10, 1.5); head.rotateZ(Math.PI / 2 - 0.75); head.translate(0, 0.3, 0); P.push({ g: head, c: iron }, { g: box(0.07, 0.06, 0.06, 0, 0.6, 0), c: dark }); break; }
    case 'hatchet': P.push({ g: cyl(0.018, 0.016, 0.5, 0, 0.17, 0, 6), c: wood }, { g: box(0.16, 0.13, 0.025, 0.08, 0.36, 0), c: iron }, { g: box(0.04, 0.16, 0.02, 0.17, 0.36, 0), c: '#c8ccd6' }, { g: box(0.05, 0.08, 0.04, 0, 0.36, 0), c: dark }); break;
    case 'hammer': P.push({ g: cyl(0.018, 0.016, 0.42, 0, 0.13, 0, 6), c: wood }, { g: box(0.2, 0.09, 0.09, 0, 0.34, 0), c: dark }, { g: box(0.03, 0.1, 0.1, 0.1, 0.34, 0), c: iron }, { g: box(0.03, 0.1, 0.1, -0.1, 0.34, 0), c: iron }); break;
    case 'sickle': { P.push({ g: cyl(0.018, 0.016, 0.2, 0, 0.02, 0, 6), c: wood }); const bl = new THREE.TorusGeometry(0.14, 0.014, 4, 12, 3.3); bl.scale(1, 1, 0.5); bl.rotateZ(-0.5); bl.translate(0.02, 0.26, 0); P.push({ g: bl, c: '#c8ccd6' }); break; }
    case 'knife': { P.push({ g: cyl(0.017, 0.015, 0.14, 0, -0.01, 0, 6), c: wood }, { g: box(0.05, 0.015, 0.03, 0, 0.065, 0), c: dark }); const bl = new THREE.ConeGeometry(0.028, 0.24, 4); bl.scale(1, 1, 0.3); bl.translate(0, 0.19, 0); P.push({ g: bl, c: '#c8ccd6' }); break; }
    case 'needle': { const n = new THREE.ConeGeometry(0.008, 0.2, 4); n.translate(0, 0.1, 0); P.push({ g: n, c: '#e8ecf2' }, { g: cyl(0.004, 0.004, 0.3, 0.02, -0.12, 0, 3, 0, 0.15), c: '#f4f0e6' }); break; }
    default: P.push({ g: cyl(0.012, 0.012, 0.5, 0, 0.2, 0, 6), c: wood }, { g: ball(0.05, 0, 0.47, 0, 1, 0.45, 0.8), c: wood });       // a long spoon
  }
  return merged(P);
}
export const TOOL_KINDS = ['pick', 'hatchet', 'knife', 'sickle', 'hammer', 'needle', 'spoon'];

/** A four-pointed glint (two crossed quads), for the additive material: a node you have not worked twinkles so it reads from the road. */
export function glintGeometry() {
  const ray = (w, h, rz, ry = 0) => { const g = new THREE.PlaneGeometry(w, h); g.rotateZ(rz); if (ry) g.rotateY(ry); return { g, c: '#ffffff' }; };
  return merged([ray(0.07, 1, 0), ray(0.07, 1, Math.PI / 2), ray(0.05, 0.5, Math.PI / 4), ray(0.05, 0.5, -Math.PI / 4), ray(0.07, 1, 0, Math.PI / 2)], { flat: false });
}
