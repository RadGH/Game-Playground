// Oathwild's scenery kit: every data/art.json scenery id that has no GLB is built here from unit-shape parts, in the
// style and frame of the playground's set-piece kit (proctown/js/propkit.js) and building kit (proctown/js/buildkit.js
// + offices.js). Pure — no three.js, no DOM — so tests/world/kit-props.test.mjs checks every model in Node, and
// render/kit-draw.js instances the parts (one InstancedMesh per unit shape per 128 m tile for placed things; one baked
// geometry per tree / rock / bush for the scatter).
//
//   kitModel(id, { seed, size }) -> { id, parts, fires, glows, spin, bounds, radius } | null (no kit for that id)
//   KIT_IDS, KIT_SOURCE[id]  ('propkit:<model>' | 'buildkit:<want>' | 'oathwild')  what each id is drawn from
//
// FRAME. Built like propkit: metres, base at y = 0, FRONT at +z. kitModel() then turns the model half a turn so its
// front looks down -Z — Oathwild's placement convention (data/placements.json `facing` = rotation.y for a model whose
// front looks down -Z; a building's door, a shrine's face, a tent's flap all face the street / path they serve).
// A part: { mesh, x, y, z, w, h, d, yaw, rx, rz, colour, tag? } (matrix T * R(Euler(rx, yaw, rz, 'YXZ')) * S).
// Mesh kinds: propkit's eight (box cyl gable shed hip frustum cone dome) plus three of ours — 'leaf' (a lumpy
// ball for crowns and bushes), 'rock' (a jagged boulder) and 'pebble' (a small 20-face stone); all origin at the centre
// of the base. tag 'glow' = drawn unlit (crystal, runes, lantern glass, spirit water).
//
// SIZE. `size` = the art row's [w, h, d] (what collision and placement radii were laid out for). Each entry says how
// it meets it: fit 'h' / 'w' scales the model to that height / width, a number scales by it, no fit = built to size.

import { propModel, propContext, shade, mixHex, PROP_COLOURS as C } from '../../../../../proctown/js/propkit.js';
import { describeBuilding, partsFor, describeStall, stallParts } from '../../../../../proctown/js/buildkit.js';
import { officeDressing } from '../../../../../proctown/js/offices.js';

const PI = Math.PI;
const hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

// ------------------------------------------------------------------------------------------- part list helpers

/** Parts (+ fires / glows / spin pivots) turned about y by `yaw` (whole model). */
function turnModel(m, yaw) {
  if (!yaw) return m;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const tp = p => ({ ...p, x: p.x * c + p.z * s, z: -p.x * s + p.z * c });
  return {
    ...m,
    parts: m.parts.map(p => ({ ...tp(p), yaw: (p.yaw || 0) + yaw })),
    fires: (m.fires || []).map(tp), glows: (m.glows || []).map(tp),
    spin: (m.spin || []).map(g => ({ ...tp(g), yaw: (g.yaw || 0) + yaw, parts: g.parts })),
  };
}
function scaleModel(m, s) {
  if (s === 1) return m;
  const sp = p => ({ ...p, x: p.x * s, y: p.y * s, z: p.z * s });
  return {
    ...m,
    parts: m.parts.map(p => ({ ...sp(p), w: p.w * s, h: p.h * s, d: p.d * s })),
    fires: (m.fires || []).map(f => ({ ...sp(f), s: (f.s || 1) * s })), glows: (m.glows || []).map(sp),
    spin: (m.spin || []).map(g => ({ ...sp(g), scale: (g.scale || 1) * s, parts: g.parts })),
  };
}

// rotation of a part (Euler YXZ) applied to a unit-box corner — for bounds
function rotM(yaw, rx, rz) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cx = Math.cos(rx), sx = Math.sin(rx), cz = Math.cos(rz), sz = Math.sin(rz);
  const Y = [cy, 0, sy, 0, 1, 0, -sy, 0, cy], X = [1, 0, 0, 0, cx, -sx, 0, sx, cx], Z = [cz, -sz, 0, sz, cz, 0, 0, 0, 1];
  const mul = (a, b) => { const o = []; for (let r = 0; r < 3; r++) for (let q = 0; q < 3; q++) o[r * 3 + q] = a[r * 3] * b[q] + a[r * 3 + 1] * b[3 + q] + a[r * 3 + 2] * b[6 + q]; return o; };
  return mul(mul(Y, X), Z);
}
/** Every part (spinning ones at their pivot, unturned) -> [minX, minY, minZ, maxX, maxY, maxZ] and the reach from the origin. */
export function boundsOf(m) {
  const B = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  let reach = 0;
  const add = (p, ox = 0, oy = 0, oz = 0, s = 1) => {
    const M = rotM(p.yaw || 0, p.rx || 0, p.rz || 0);
    for (const ux of [-0.5, 0.5]) for (const uy of [0, 1]) for (const uz of [-0.5, 0.5]) {
      const v = [ux * p.w, uy * p.h, uz * p.d];
      const x = ox + (p.x + M[0] * v[0] + M[1] * v[1] + M[2] * v[2]) * s, y = oy + (p.y + M[3] * v[0] + M[4] * v[1] + M[5] * v[2]) * s, z = oz + (p.z + M[6] * v[0] + M[7] * v[1] + M[8] * v[2]) * s;
      B[0] = Math.min(B[0], x); B[1] = Math.min(B[1], y); B[2] = Math.min(B[2], z); B[3] = Math.max(B[3], x); B[4] = Math.max(B[4], y); B[5] = Math.max(B[5], z);
      reach = Math.max(reach, Math.hypot(x, z));
    }
  };
  for (const p of m.parts) add(p);
  for (const g of m.spin || []) for (const p of g.parts) add(p, g.x, g.y, g.z, g.scale || 1);
  return { bounds: B.map(v => Math.round(v * 100) / 100), radius: Math.round(reach * 100) / 100 };
}

const fromProp = (id, seed, yaw = 0) => { const m = propModel(id, { seed }); return turnModel({ parts: m.parts, fires: m.fires, glows: m.glows, spin: m.spin }, yaw); };
/** A propkit model's parts drawn into a builder context (so a custom model can stand one in its scene). */
function stamp(k, id, seed, { x = 0, z = 0, yaw = 0, s = 1, keep = null } = {}) {
  const m = scaleModel(turnModel(fromProp(id, seed), yaw), s);
  for (const p of m.parts) if (!keep || keep(p)) k.parts.push({ ...p, x: p.x + x, z: p.z + z });
  for (const f of m.fires) k.fires.push({ ...f, x: f.x + x, z: f.z + z });
  for (const g of m.glows) k.glows.push({ ...g, x: g.x + x, z: g.z + z });
  for (const g of m.spin) k.spin.push({ ...g, x: g.x + x, z: g.z + z });
}

// ------------------------------------------------------------------------------------------- shared small pieces

const WOOD = ['#7a5a3a', '#6e553d', '#86643f', '#5f4a34'];
const IRON = '#34333a', GOLD = '#c9a43a', CANVAS = '#d8c9a4', HIDE = '#8a6a4a';

function crate(k, x, y, z, s = 0.7, yaw = 0) {
  const c = k.tone(k.pick(WOOD), 0.06);
  k.block(x, y, z, s, s, s, c, { yaw });
  for (const t of [0.04, s - 0.1]) k.block(x, y + t, z, s + 0.03, 0.06, s + 0.03, shade(c, -0.25), { yaw });
  k.block(x, y + 0.05, z, s + 0.02, s - 0.1, 0.07, shade(c, -0.18), { yaw: yaw + PI / 4 });   // the diagonal brace showing through
}
function barrel(k, x, y, z, h = 0.95, open = false) {
  const c = k.tone('#7a5a3a', 0.06);
  k.on('cyl', x, y, z, 0.64, h, 0.64, c);
  k.on('cyl', x, y + h * 0.5 - 0.02, z, 0.69, h * 0.07 + 0.02, 0.69, shade(c, 0.06));            // the belly
  for (const t of [0.12, 0.82]) k.on('cyl', x, y + h * t, z, 0.67, 0.05, 0.67, IRON);
  k.on('cyl', x, y + h - 0.01, z, open ? 0.52 : 0.58, 0.02, open ? 0.52 : 0.58, open ? '#1e1a16' : shade(c, -0.12));
}
function sack(k, x, z, s = 1, colour = '#b9a47e', lean = 0) {
  k.on('dome', x, 0, z, 0.56 * s, 0.62 * s, 0.46 * s, colour, { rz: lean });
  k.on('cyl', x + lean * 0.3, 0.55 * s, z, 0.14 * s, 0.14 * s, 0.14 * s, shade(colour, -0.12));
  k.on('dome', x + lean * 0.35, 0.66 * s, z, 0.2 * s, 0.1 * s, 0.2 * s, shade(colour, -0.05));
}
function leafBall(k, x, y, z, w, h, colour, amt = 0.07) { k.at('leaf', x, y, z, w, h, w * k.j(1, 0.12), k.tone(colour, amt), { yaw: k.rng() * PI * 2 }); }
function stake(k, x, z, h, dia, colour, { lean = 0, yaw = 0 } = {}) {
  k.on('cyl', x, 0, z, dia, h * 0.84, dia, colour, { rx: lean, yaw });
  k.group(x, 0, z, { yaw, rx: lean }, () => k.on('cone', 0, h * 0.84, 0, dia, h * 0.16, dia, shade(colour, 0.12)));
}
function rune(k, x, y, z, w, h, colour = '#9fe8ff') { k.block(x, y, z, w, h, 0.03, colour, { tag: 'glow' }); }
function pennant(k, x, y, z, len, colour) {
  k.block(x + len / 2, y - 0.35, z, len, 0.35, 0.03, colour);
  k.on('gable', x + len + 0.12, y - 0.35, z, 0.24, 0.35, 0.03, colour, { rz: -PI / 2 });
}

// ------------------------------------------------------------------------------------------- trees and plants

function oak(k, W, H, { leaf = C.leaf, crowns = 4 } = {}) {
  const lean = (k.rng() - 0.5) * 0.25, th = H * 0.44, top = [lean, th, 0];
  k.rod([0, 0, 0], top, W * 0.1, C.bark);
  for (let i = 0; i < 3; i++) { const a = i * 2.1 + k.rng(); k.on('cone', Math.sin(a) * W * 0.05, 0, Math.cos(a) * W * 0.05, W * 0.09, 0.6, W * 0.09, shade(C.bark, -0.1), { rz: Math.sin(a) * 0.9, rx: -Math.cos(a) * 0.9 }); }
  for (let i = 0; i < 3; i++) { const a = i * 2.1 + 0.6 + k.rng(); k.rod(top, [lean + Math.sin(a) * W * 0.26, H * 0.62, Math.cos(a) * W * 0.26], W * 0.045, C.bark); }
  const cy = H * 0.68, R = W * 0.5;
  leafBall(k, lean, cy, 0, R * 1.3, (H - th) * 0.82, leaf);
  for (let i = 0; i < crowns - 1; i++) { const a = i * (PI * 2 / (crowns - 1)) + k.rng(); leafBall(k, lean + Math.sin(a) * R * 0.55, cy - H * 0.06 + (i % 2) * H * 0.08, Math.cos(a) * R * 0.55, R * 0.85, (H - th) * 0.55, shade(leaf, i % 2 ? -0.08 : 0.07)); }
}
function pine(k, W, H, leaf = '#3f5f3a') {
  k.on('cyl', 0, 0, 0, W * 0.09, H * 0.92, W * 0.09, '#5a4230');
  const tiers = 4;
  for (let t = 0; t < tiers; t++) {
    const f = t / tiers, w = W * (1 - f * 0.62) * k.j(1, 0.05);
    k.on('cone', 0, H * (0.16 + f * 0.62), 0, w, H * 0.34, w, k.tone(shade(leaf, t % 2 ? 0.05 : -0.03), 0.04), { yaw: k.rng() * PI });
  }
}
function birch(k, W, H) {
  const lean = (k.rng() - 0.5) * 0.4;
  k.rod([0, 0, 0], [lean, H * 0.8, 0], W * 0.08, '#e4e0d4');
  for (let i = 0; i < 4; i++) { const y = H * (0.12 + i * 0.16); k.on('cyl', lean * y / (H * 0.8), y, 0, W * 0.085, 0.07, W * 0.085, '#3a3532'); }
  const leaf = '#93a845';
  leafBall(k, lean, H * 0.62, 0, W * 0.9, H * 0.42, leaf);
  leafBall(k, lean + W * 0.2, H * 0.78, W * 0.1, W * 0.6, H * 0.28, shade(leaf, 0.08));
  leafBall(k, lean - W * 0.22, H * 0.5, -W * 0.1, W * 0.55, H * 0.24, shade(leaf, -0.06));
}
function willow(k, W, H) {
  k.rod([0, 0, 0], [0.2, H * 0.5, 0], W * 0.12, '#5a4632');
  const leaf = '#7f9a48';
  leafBall(k, 0.2, H * 0.72, 0, W * 0.85, H * 0.4, leaf);
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * PI * 2 + k.rng() * 0.3, r = W * 0.38;
    const len = H * k.j(0.42, 0.18);
    k.block(0.2 + Math.sin(a) * r, H * 0.78 - len, Math.cos(a) * r, W * 0.16, len, W * 0.05, k.tone(shade(leaf, 0.06), 0.06), { yaw: a + PI / 2, rx: 0.12 });
  }
}
function marshTree(k, W, H) {
  k.rod([0, 0, 0], [0.4, H * 0.35, 0.2], W * 0.12, '#4e4232');
  k.rod([0.4, H * 0.35, 0.2], [-0.2, H * 0.62, -0.1], W * 0.09, '#4e4232');
  k.rod([0.3, H * 0.4, 0.15], [W * 0.35, H * 0.58, 0.3], W * 0.05, '#4e4232');
  const leaf = '#6e7a44';
  leafBall(k, -0.2, H * 0.72, -0.1, W * 0.75, H * 0.24, leaf);
  leafBall(k, W * 0.34, H * 0.62, 0.3, W * 0.45, H * 0.16, shade(leaf, -0.05));
  for (let i = 0; i < 5; i++) { const a = k.rng() * PI * 2, r = W * 0.25; k.block(-0.2 + Math.sin(a) * r, H * 0.4, -0.1 + Math.cos(a) * r, 0.12, H * 0.25, 0.04, '#8a9070', { yaw: a }); }
}
function deadTree(k, W, H) {
  const grey = '#7d746a';
  const top = [0.2, H * 0.72, 0];
  k.rod([0, 0, 0], top, W * 0.09, grey);
  for (let i = 0; i < 5; i++) {
    const a = i * 1.3 + k.rng(), y = H * (0.35 + i * 0.09), from = [top[0] * y / top[1], y, 0];
    const to = [from[0] + Math.sin(a) * W * 0.4, y + H * 0.2, Math.cos(a) * W * 0.4];
    k.rod(from, to, W * 0.035, shade(grey, (i % 2) * 0.06));
    k.rod(to, [to[0] + Math.sin(a + 0.8) * W * 0.15, to[1] + H * 0.08, to[2] + Math.cos(a + 0.8) * W * 0.15], W * 0.018, grey);
  }
  for (let i = 0; i < 3; i++) { const a = i * 2.1; k.on('cone', 0, 0, 0, W * 0.08, 0.5, W * 0.08, shade(grey, -0.1), { rz: Math.sin(a) * 1, rx: -Math.cos(a) * 1 }); }
}
function bush(k, W, H, leaf, { berries = null } = {}) {
  const n = 3 + Math.floor(k.rng() * 2);
  for (let i = 0; i < n; i++) { const a = i / n * PI * 2 + k.rng(), r = W * 0.22; leafBall(k, Math.sin(a) * r, H * 0.42, Math.cos(a) * r, W * 0.6, H * 0.78, shade(leaf, (i % 3 - 1) * 0.06)); }
  leafBall(k, 0, H * 0.55, 0, W * 0.6, H * 0.9, shade(leaf, 0.05));
  if (berries) for (let i = 0; i < 7; i++) { const a = i * 2.4, r = W * 0.36; k.at('pebble', Math.sin(a) * r, H * (0.45 + (i % 3) * 0.14), Math.cos(a) * r, 0.1, 0.1, 0.1, berries); }
}
function fern(k, W, H) {
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * PI * 2 + k.rng() * 0.3;
    k.group(0, 0, 0, { yaw: a }, () => k.block(0, 0, 0, W * 0.18, H * k.j(1.05, 0.12), 0.03, k.tone('#5f8a2e', 0.08), { rx: 0.95 }));
  }
  k.on('dome', 0, 0, 0, W * 0.25, H * 0.25, W * 0.25, '#4e7428');
}
function mushroomCap(k, x, z, stemH, capW, cap, { spots = true, glow = false } = {}) {
  k.on('cyl', x, 0, z, capW * 0.28, stemH, capW * 0.28, '#e4dccb');
  k.on('cyl', x, stemH - 0.02, z, capW * 0.8, 0.04, capW * 0.8, '#bba98e');
  k.on('dome', x, stemH, z, capW, capW * 0.42, capW, cap);
  if (spots) for (let i = 0; i < 5; i++) { const a = i * 1.26 + k.rng(), r = capW * 0.3; k.on('dome', x + Math.sin(a) * r, stemH + capW * 0.22, z + Math.cos(a) * r, capW * 0.14, capW * 0.06, capW * 0.14, glow ? '#c7f0ff' : '#f2ece0', glow ? { tag: 'glow' } : {}); }
}
function rockLump(k, W, H, D, colour, { moss = null, sink = 0.18 } = {}) {
  k.on('rock', 0, -H * sink, 0, W, H * (1 + sink), D, k.tone(colour, 0.05), { yaw: k.rng() * PI * 2, rz: (k.rng() - 0.5) * 0.2 });
  if (moss) k.on('dome', W * 0.05, H * 0.72, 0, W * 0.6, H * 0.18, D * 0.55, k.tone(moss, 0.06), { yaw: k.rng() * PI });
}

// ------------------------------------------------------------------------------------------- the entries

const B = {};   // id -> { src, fit?, build(k, ctx) }  (ctx = { seed, size })
const prop = (model, { fit, yaw = 0, keepFires = true } = {}) => ({ src: 'propkit:' + model, fit, build: (k, ctx) => { stamp(k, model, ctx.seed, { yaw }); if (!keepFires) k.fires.length = 0; } });

// ---- trees (scatter: one baked mesh per id; sizes from art.json)
B['oak-a'] = { src: 'oathwild', build: (k, { size }) => oak(k, size[0], size[1]) };
B['oak-b'] = { src: 'oathwild', build: (k, { size }) => oak(k, size[0], size[1], { leaf: '#5d7434', crowns: 5 }) };
B['pine-a'] = { src: 'oathwild', build: (k, { size }) => pine(k, size[0], size[1]) };
B['pine-b'] = { src: 'oathwild', build: (k, { size }) => pine(k, size[0], size[1], '#36584e') };
B.birch = { src: 'oathwild', build: (k, { size }) => birch(k, size[0], size[1]) };
B.willow = { src: 'oathwild', build: (k, { size }) => willow(k, size[0], size[1]) };
B['marsh-tree'] = { src: 'oathwild', build: (k, { size }) => marshTree(k, size[0], size[1]) };
B['dead-tree'] = { src: 'oathwild', build: (k, { size }) => deadTree(k, size[0], size[1]) };

// ---- plants
B['bush-a'] = { src: 'oathwild', build: (k, { size }) => bush(k, size[0], size[1], '#5b7f2c') };
B['bush-b'] = { src: 'oathwild', build: (k, { size }) => bush(k, size[0], size[1], '#4d6a32', { berries: '#9a2f3a' }) };
B['bush-c'] = { src: 'oathwild', build: (k, { size }) => bush(k, size[0], size[1], '#7a6a3a') };
B.fern = { src: 'oathwild', build: (k, { size }) => fern(k, size[0], size[1]) };
B.mushrooms = { src: 'oathwild', build: k => { mushroomCap(k, 0, 0, 0.22, 0.24, '#b5452f'); mushroomCap(k, 0.16, 0.1, 0.14, 0.16, '#c2593c'); mushroomCap(k, -0.12, 0.12, 0.1, 0.12, '#a8402c', { spots: false }); } };
B['mushroom-giant'] = { src: 'oathwild', build: k => {
  mushroomCap(k, 0, 0, 1.9, 1.5, '#7d5a8e', { glow: true });
  mushroomCap(k, 0.75, 0.35, 1.1, 0.85, '#8e6a9c', { glow: true });
  mushroomCap(k, -0.5, 0.45, 0.6, 0.5, '#6e4e80');
  k.glow(0, 2.0, 0, '#c7f0ff');
} };
B.reeds = { src: 'oathwild', build: k => {
  for (let i = 0; i < 14; i++) {
    const a = k.rng() * PI * 2, r = k.rng() * 0.5, h = 1.0 + k.rng() * 0.6, x = Math.sin(a) * r, z = Math.cos(a) * r;
    const lean = (k.rng() - 0.5) * 0.25;
    k.on('box', x, 0, z, 0.05, h, 0.05, k.tone('#7d8a3a', 0.08), { rz: lean, yaw: a });
    if (i % 3 === 0) k.group(x, 0, z, { yaw: a, rz: lean }, () => k.on('cyl', 0, h - 0.05, 0, 0.08, 0.26, 0.08, '#5a3e26'));
  }
  for (let i = 0; i < 5; i++) k.group(0, 0, 0, { yaw: i * 1.3 }, () => k.block(0.2, 0, 0, 0.1, 0.9, 0.02, '#6e7d34', { rz: 0.4 }));
} };
B['bog-plant'] = { src: 'oathwild', build: k => {
  for (let i = 0; i < 6; i++) k.group(0, 0, 0, { yaw: i / 6 * PI * 2 + k.rng() * 0.3 }, () => k.block(0, 0, 0.12, 0.18, 0.5, 0.04, k.tone('#6d7f32', 0.08), { rx: 0.8 }));
  k.on('cyl', 0, 0, 0, 0.18, 0.55, 0.18, '#7a3a3a');
  k.on('cone', 0, 0.55, 0, 0.26, 0.14, 0.26, '#8a4a40', { rx: PI });
  k.on('dome', 0.12, 0.62, 0, 0.12, 0.08, 0.12, '#e8d8a0', { tag: 'glow' });
} };
B['stump-a'] = { ...prop('tree_stump', { fit: 'h' }) };
B['stump-b'] = { src: 'oathwild', build: k => {
  k.on('cyl', 0, 0, 0, 0.62, 0.9, 0.62, C.bark);
  for (let i = 0; i < 5; i++) { const a = i * 1.26 + k.rng(); k.on('cone', Math.sin(a) * 0.18, 0.86, Math.cos(a) * 0.18, 0.2, 0.3 + k.rng() * 0.3, 0.12, shade(C.bark, 0.08), { yaw: a }); }
  k.on('cyl', 0, 0.86, 0, 0.5, 0.02, 0.5, '#9a7c58');
  for (let i = 0; i < 3; i++) { const a = i * 2.1; k.on('cone', Math.sin(a) * 0.25, 0, Math.cos(a) * 0.25, 0.22, 0.4, 0.22, shade(C.bark, -0.1), { rz: Math.sin(a) * 0.8, rx: -Math.cos(a) * 0.8 }); }
  k.on('dome', 0.25, 0.4, 0.18, 0.22, 0.06, 0.18, '#c8a060', { rx: -0.4 });    // a shelf fungus
  k.on('dome', -0.1, 0, 0.3, 0.5, 0.12, 0.4, C.moss);
} };
B.log = { src: 'propkit:felled_log', fit: 0.65, build: (k, ctx) => stamp(k, 'felled_log', ctx.seed, { yaw: PI / 2 }) };
B['log-hollow'] = { src: 'oathwild', build: k => {
  const L = 3.2, D = 1.1;
  k.cylX(0, D / 2, 0, L, D, C.bark);
  for (const s of [-1, 1]) { k.cylX(s * (L / 2 + 0.005), D / 2, 0, 0.02, D * 0.72, '#1d1712'); k.cylX(s * (L / 2 + 0.01), D / 2, 0, 0.01, D * 0.86, '#9a7c58'); }
  for (let i = 0; i < 4; i++) k.on('dome', -L / 2 + 0.4 + i * 0.7, D * 0.85, (k.rng() - 0.5) * 0.4, 0.6, 0.12, 0.5, k.tone(C.moss, 0.08));
  for (let i = 0; i < 3; i++) k.on('dome', -0.6 + i * 0.5, D * 0.45, D / 2 - 0.02, 0.26, 0.07, 0.2, '#c8a060', { rx: -1.2 });
  mushroomCap(k, L / 2 + 0.3, 0.3, 0.2, 0.2, '#b5452f');
} };
B.pumpkins = prop('pumpkin_pile');

// ---- rocks
const ROCK = '#7d7a74';
B['rock-small'] = { src: 'oathwild', build: (k, { size }) => { k.on('pebble', 0, -0.06, 0, size[0], size[1], size[2], k.tone(ROCK, 0.06), { yaw: k.rng() * 6.28 }); k.on('pebble', size[0] * 0.5, -0.04, 0.1, size[0] * 0.45, size[1] * 0.4, size[2] * 0.5, k.tone(ROCK, 0.08)); } };
B['rock-medium'] = { src: 'oathwild', build: (k, { size }) => { rockLump(k, size[0], size[1], size[2], ROCK); k.on('pebble', size[0] * 0.55, -0.05, size[2] * 0.3, 0.3, 0.25, 0.28, k.tone(ROCK, 0.08)); } };
B['rock-large'] = { src: 'oathwild', build: (k, { size }) => { rockLump(k, size[0], size[1], size[2], '#7a7872', { moss: k.rng() < 0.5 ? C.moss : null }); k.on('rock', size[0] * 0.45, -0.1, size[2] * 0.2, size[0] * 0.5, size[1] * 0.45, size[2] * 0.55, k.tone(ROCK, 0.06), { yaw: 1.3 }); for (const a of [2.2, 4.1]) k.on('pebble', Math.sin(a) * size[0] * 0.55, -0.04, Math.cos(a) * size[2] * 0.55, 0.3, 0.22, 0.26, k.tone(ROCK, 0.08)); } };
B.boulder = { src: 'oathwild', build: (k, { size }) => { rockLump(k, size[0], size[1], size[2], '#827a70', { moss: C.lichen }); for (let i = 0; i < 3; i++) { const a = i * 2.2 + k.rng(); k.on('pebble', Math.sin(a) * size[0] * 0.6, -0.05, Math.cos(a) * size[2] * 0.6, 0.35, 0.3, 0.3, k.tone(ROCK, 0.08)); } } };
B['boulder-mossy'] = { src: 'oathwild', build: (k, { size }) => { rockLump(k, size[0], size[1], size[2], '#6f6d64', { moss: '#5d7a2e' }); k.on('dome', -size[0] * 0.3, 0, size[2] * 0.3, 0.7, 0.25, 0.6, '#58722c'); fern(k, 0.6, 0.5); } };
B['rock-cluster'] = { src: 'oathwild', build: (k, { size }) => { for (let i = 0; i < 5; i++) { const a = i * 1.3 + k.rng(), r = i ? size[0] * 0.35 : 0, s = i ? 0.45 : 0.7; k.on('rock', Math.sin(a) * r, -0.08, Math.cos(a) * r, size[0] * s, size[1] * s * 1.3, size[2] * s * 1.6, k.tone(ROCK, 0.07), { yaw: a }); } } };
B['rock-slab'] = { src: 'oathwild', build: (k, { size }) => { k.on('rock', 0, -0.15, 0, size[0], size[1] * 0.75, size[2], k.tone('#8a8680', 0.05), { rz: 0.12, yaw: k.rng() }); k.on('rock', size[0] * 0.35, -0.1, size[2] * 0.4, size[0] * 0.4, size[1] * 0.5, size[2] * 0.5, k.tone(ROCK, 0.06)); } };
B['cliff-chunk'] = { src: 'oathwild', build: (k, { size }) => {
  const [W, H, D] = size;
  k.on('rock', 0, -0.4, 0, W * 0.8, H, D * 0.75, k.tone('#7a7264', 0.04), { yaw: k.rng() });
  k.on('rock', W * 0.3, -0.3, D * 0.2, W * 0.55, H * 0.62, D * 0.6, k.tone('#857c6c', 0.05), { yaw: 1.1 });
  k.on('rock', -W * 0.3, -0.3, -D * 0.15, W * 0.5, H * 0.45, D * 0.55, k.tone('#6f6858', 0.05), { yaw: 2.3 });
  k.on('dome', 0, H * 0.5, 0, W * 0.5, 0.3, D * 0.42, C.moss);
} };

// ---- graves and ruins
B['gravestone-a'] = prop('gravestone');
B['gravestone-b'] = prop('grave_cross');
B['gravestone-c'] = prop('gravestone_leaning');
B['grave-fence'] = prop('iron_fence');
B.sarcophagus = { src: 'propkit:tomb_chest', build: (k, ctx) => { stamp(k, 'tomb_chest', ctx.seed, { yaw: PI / 2 }); k.block(0, 1.02, 0, 0.5, 0.08, 0.32, '#7a7466'); k.on('dome', -0.6, 0, 0.55, 0.5, 0.1, 0.4, C.moss); } };
B.rubble = prop('rubble_heap', { fit: 0.96 });
B['ruin-wall'] = prop('ruined_wall', { fit: 'w' });
B['ruin-arch'] = prop('ruined_arch', { fit: 1 });
B['ruin-pillar'] = { src: 'oathwild', build: k => {
  const st = k.tone(C.stoneW, 0.05);
  k.block(0, 0, 0, 1.15, 0.3, 1.15, shade(st, -0.12));
  k.block(0, 0.3, 0, 0.95, 0.14, 0.95, shade(st, -0.05));
  k.on('cyl', 0, 0.44, 0, 0.72, 1.9, 0.72, st);
  for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2; k.block(Math.sin(a) * 0.36, 0.5, Math.cos(a) * 0.36, 0.06, 1.8, 0.04, shade(st, -0.15), { yaw: a }); }
  k.on('cyl', 0, 2.34, 0, 0.72, 0.42, 0.72, st, { rz: 0.18, rx: 0.1 });            // the broken top drum, slipped
  k.on('cone', 0.12, 2.6, 0, 0.5, 0.35, 0.4, shade(st, -0.06), { rz: 0.4 });
  k.on('cyl', 0.95, 0, 0.35, 0.68, 0.4, 0.68, shade(st, -0.04), { rz: PI / 2 - 0.1, yaw: 0.6 });
  k.on('dome', -0.3, 0.3, 0.45, 0.5, 0.1, 0.35, C.moss);
} };
B['statue-broken'] = { src: 'propkit:shrine_statue', build: (k, ctx) => {
  stamp(k, 'shrine_statue', ctx.seed, { keep: p => p.y < 1.75 });                // the head and shoulders gone
  k.on('dome', 0, 1.72, 0, 0.42, 0.1, 0.36, '#8f897c');                          // the broken face of the stone
  k.on('rock', 0.7, -0.05, 0.35, 0.45, 0.4, 0.4, '#8a857c', { yaw: 0.7 });        // the fallen head
  k.on('pebble', -0.5, 0, 0.5, 0.3, 0.2, 0.25, '#7e786e');
  k.on('pebble', 0.4, 0, -0.45, 0.25, 0.16, 0.22, '#7e786e');
} };

// ---- stones and shrines
function megalith(k, h, w, colour = '#787468') {
  // a rough tapered stone: a jagged core, a narrower crown, lichen pressed flat on its faces
  const lean = (k.rng() - 0.5) * 0.12;
  k.group(0, -0.25, 0, { rz: lean, rx: (k.rng() - 0.5) * 0.08, yaw: k.rng() * 0.6 }, () => {
    k.on('rock', 0, 0, 0, w, h * 0.78, w * 0.68, k.tone(colour, 0.04));
    k.on('rock', 0.04, h * 0.62, 0, w * 0.66, h * 0.4, w * 0.48, k.tone(shade(colour, 0.04), 0.04), { yaw: 0.4 });
    for (let i = 0; i < 2; i++) k.on('dome', (k.rng() - 0.5) * w * 0.3, h * (0.18 + i * 0.22), w * 0.24, w * 0.34, 0.03, w * 0.26, k.tone(mixHex(colour, C.lichen, 0.45), 0.04), { rx: PI / 2 - 0.15 });
  });
  k.on('dome', 0, 0, 0, w * 1.3, 0.12, w * 1.0, k.tone(C.moss, 0.06));
}
B['standing-stone-a'] = { src: 'oathwild', build: (k, { size }) => megalith(k, size[1] + 0.25, size[0] * 0.95) };
B['standing-stone-b'] = { src: 'oathwild', build: k => {
  // a seal-stone: one broad carved stone, a ring cut into its face, two smaller stones at its shoulders
  const st = k.tone('#7a7564', 0.04);
  k.on('rock', 0, -0.3, 0, 1.6, 3.3, 1.0, st, { yaw: 0.05 });
  k.block(0, 1.35, 0.42, 0.9, 0.08, 0.05, shade(st, -0.3));
  k.block(0, 2.15, 0.38, 0.9, 0.08, 0.05, shade(st, -0.3));
  for (const s of [-1, 1]) k.block(s * 0.45, 1.35, 0.4, 0.08, 0.88, 0.05, shade(st, -0.3));
  k.on('cyl', 0, 1.62, 0.4, 0.36, 0.05, 0.36, '#5a6e7a', { rx: PI / 2 });       // the seal
  for (const s of [-1, 1]) k.on('rock', s * 1.15, -0.1, -0.2, 0.7, 1.5, 0.6, k.tone(st, 0.05), { yaw: s });
  k.on('dome', 0.3, 0, 0.6, 0.8, 0.12, 0.5, C.moss);
} };
B['druid-stone'] = { src: 'oathwild', build: (k, { size }) => {
  megalith(k, size[1] - 0.2, size[0] * 0.62, '#6f7262');
  for (let i = 0; i < 4; i++) k.block(0, 0.7 + i * 0.45, size[0] * 0.25, 0.16 + (i % 2) * 0.2, 0.05, 0.04, '#46503a');   // carved marks
  for (let i = 0; i < 7; i++) { const a = i / 7 * PI * 2; k.on('pebble', Math.sin(a) * 1.05, -0.05, Math.cos(a) * 1.05, 0.34, 0.3, 0.3, k.tone('#7a7464', 0.06)); }
  for (const a of [0.9, 3.6]) k.on('leaf', Math.sin(a) * 0.55, -0.05, Math.cos(a) * 0.5, 0.45, 0.35, 0.4, k.tone('#4e6a2a', 0.08));   // ferny clumps at its foot
} };
B['shrine-respawn'] = { src: 'oathwild', build: k => {
  const st = C.stoneL, dk = C.stoneD, cloth = '#2f4f7a', trim = GOLD;
  k.block(0, 0, 0, 2.2, 0.22, 1.7, dk);
  k.block(0, 0.22, 0, 1.8, 0.2, 1.4, st);
  for (const s of [-1, 1]) {
    k.block(s * 0.7, 0.42, -0.15, 0.36, 2.35, 0.36, k.tone(st, 0.04));
    k.block(s * 0.7, 2.77, -0.15, 0.46, 0.14, 0.46, dk);
    k.block(s * 0.7, 0.42, -0.15, 0.46, 0.18, 0.46, dk);
    k.block(s * 0.7, 1.1, 0.04, 0.3, 1.45, 0.03, cloth);                       // a hanging banner on each pillar
    k.block(s * 0.7, 1.08, 0.05, 0.32, 0.06, 0.03, trim);
    k.on('gable', s * 0.7, 0.95, 0.05, 0.3, 0.16, 0.03, cloth, { rx: PI });
    rune(k, s * 0.7, 2.0, 0.05, 0.12, 0.3, '#ffe39a');
  }
  k.block(0, 2.9, -0.15, 1.95, 0.3, 0.55, st);                                   // the lintel
  k.on('gable', 0, 3.2, -0.15, 2.1, 0.38, 0.62, dk);
  k.block(0, 2.98, 0.13, 0.5, 0.16, 0.03, trim);
  // the font: a pedestal, a basin and the crystal over it
  k.on('cyl', 0, 0.42, -0.1, 0.42, 0.75, 0.42, dk);
  k.on('cyl', 0, 1.15, -0.1, 0.78, 0.16, 0.78, st);
  k.on('cyl', 0, 1.29, -0.1, 0.62, 0.03, 0.62, '#7fd8ff', { tag: 'glow' });
  k.on('cone', 0, 1.62, -0.1, 0.28, 0.42, 0.28, '#bff0ff', { tag: 'glow' });
  k.on('cone', 0, 1.64, -0.1, 0.28, 0.32, 0.28, '#9fe0ff', { rx: PI, tag: 'glow' });
  k.glow(0, 1.7, -0.1, '#9fe0ff');
  for (const s of [-1, 1]) k.on('dome', s * 0.9, 0.42, 0.55, 0.3, 0.08, 0.25, C.moss);
} };
B.waystone = { src: 'oathwild', build: k => {
  const st = '#6a7480';
  k.block(0, 0, 0, 1.6, 0.25, 1.3, C.stoneD);
  k.block(0, 0.25, 0, 1.2, 0.2, 1.0, C.stone);
  k.on('frustum', 0, 0.45, 0, 0.9, 2.7, 0.7, st);
  k.on('hip', 0, 3.15, 0, 0.42, 0.3, 0.34, shade(st, -0.1));
  for (let i = 0; i < 4; i++) rune(k, (i % 2 ? 0.1 : -0.1), 0.9 + i * 0.5, 0.29 - i * 0.04, 0.16, 0.2);
  rune(k, 0, 2.95, 0.18, 0.22, 0.06);
  k.glow(0, 1.8, 0.4, '#9fe8ff');
  k.on('cyl', 0.55, 0.45, 0.4, 0.32, 0.25, 0.32, '#3a3a40');                      // an offering cup
} };
B['road-marker'] = { src: 'oathwild', build: k => {
  const st = k.tone(C.stoneL, 0.05);
  k.block(0, 0, 0, 0.6, 0.12, 0.42, C.stoneD);
  k.block(0, 0.12, 0, 0.46, 0.8, 0.3, st);
  k.cylZ(0, 0.92, 0, 0.3, 0.46, st);
  k.block(0, 0.6, 0.152, 0.3, 0.04, 0.01, shade(st, -0.3));
  k.block(0, 0.48, 0.152, 0.2, 0.04, 0.01, shade(st, -0.3));
  k.on('dome', 0.15, 0, 0.2, 0.3, 0.07, 0.2, C.moss);
} };
B['druid-altar'] = { src: 'propkit:altar_stone', build: (k, ctx) => {
  stamp(k, 'altar_stone', ctx.seed);
  for (const s of [-1, 1]) k.on('cyl', s * 0.7, 0.99, 0, 0.22, 0.1, 0.22, '#4a3a2c');
  k.on('dome', 0, 0.99, 0, 0.35, 0.05, 0.28, '#6e8a3a');
  for (let i = 0; i < 5; i++) k.on('leaf', -1.1 + i * 0.55, 0, 0.6, 0.4, 0.35, 0.3, k.tone('#4e6a2a', 0.08));
  k.on('dome', 0.1, 0.99, 0.1, 0.5, 0.05, 0.3, '#d8cfa0');       // the wrapped tablet's cloth
} };
B['antler-totem'] = prop('trophy_post', { fit: 'h' });
B['wicker-effigy'] = { src: 'oathwild', build: k => {
  const w = '#b08a56', wd = '#8a6a40';
  for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2; k.rod([Math.sin(a) * 0.3, 0, Math.cos(a) * 0.25], [Math.sin(a) * 0.16, 1.5, Math.cos(a) * 0.14], 0.05, k.tone(w, 0.06)); }   // the legs + body cage
  for (const y of [0.4, 0.8, 1.2]) k.on('cyl', 0, y, 0, 0.62 - y * 0.2, 0.06, 0.5 - y * 0.15, wd);
  k.rod([-0.75, 1.65, 0], [0.75, 1.65, 0], 0.08, wd);                            // the arms
  for (const s of [-1, 1]) { k.rod([s * 0.75, 1.65, 0], [s * 0.95, 1.2, 0], 0.06, w); k.rod([s * 0.95, 1.2, 0], [s * 1.0, 1.0, 0.1], 0.04, w); }
  k.on('cyl', 0, 1.5, 0, 0.36, 0.25, 0.3, w);
  k.ball(0, 2.05, 0, 0.22, w, 1.1);                                               // the head
  for (const s of [-1, 1]) k.rod([s * 0.1, 2.2, 0], [s * 0.35, 2.55, -0.05], 0.05, wd);   // horns of willow
  for (let i = 0; i < 3; i++) k.block(-0.2 + i * 0.2, 1.25, 0.24, 0.06, 0.2, 0.02, '#a03a2a');  // red cloth ties
  for (let i = 0; i < 4; i++) { const a = i * 1.57 + 0.4; k.on('cyl', Math.sin(a) * 0.55, 0, Math.cos(a) * 0.55, 0.3, 0.12, 0.3, '#5a4a3a'); }  // bundles at the feet
} };
B['spirit-pool'] = { src: 'oathwild', build: k => {
  k.on('cyl', 0, -0.05, 0, 2.3, 0.08, 1.9, '#2a3f4a');
  k.on('cyl', 0, 0.03, 0, 2.0, 0.02, 1.6, '#7fe0d8', { tag: 'glow' });
  for (let i = 0; i < 12; i++) { const a = i / 12 * PI * 2; k.on('pebble', Math.sin(a) * 1.15, -0.04, Math.cos(a) * 0.95, 0.4, 0.28 + (i % 3) * 0.08, 0.34, k.tone('#6f7266', 0.08)); }
  for (const a of [0.6, 2.8, 4.6]) k.on('rock', Math.sin(a) * 1.3, -0.1, Math.cos(a) * 1.1, 0.35, 1.1, 0.3, '#6a6a60', { yaw: a });
  for (const a of [0.6, 2.8, 4.6]) rune(k, Math.sin(a) * 1.3, 0.55, Math.cos(a) * 1.1 + 0.16, 0.08, 0.2, '#a8fff0');
  for (let i = 0; i < 6; i++) { const a = i * 1.1 + 0.3; k.on('box', Math.sin(a) * 1.25, 0, Math.cos(a) * 1.05, 0.04, 0.6 + (i % 2) * 0.3, 0.04, '#6e8a40', { rz: 0.1 }); }
  k.glow(0, 0.3, 0, '#7fe0d8');
} };
B['shrine-bell'] = prop('bell_frame', { fit: 0.85 });

// ---- camps
function tent(k, w, h, d, colour) {   // propkit's tent(), with a ridge pole, stakes and the flap tied back
  k.on('gable', 0, 0, 0, w, h, d, colour);
  k.block(0, 0, d / 2 - 0.02, w * 0.36, h * 0.62, 0.04, C.void);
  k.on('gable', w * 0.12, 0, d / 2 + 0.01, w * 0.3, h * 0.66, 0.04, shade(colour, -0.2), { rz: -0.25 });
  for (const s of [-1, 1]) for (const z of [-d / 2, d / 2]) { k.rod([s * w * 0.5, 0.05, z], [s * w * 0.72, 0.01, z * 1.08], 0.02, C.clothD); k.block(s * w * 0.72, 0, z * 1.08, 0.05, 0.15, 0.05, C.woodD); }
  k.rod([0, h - 0.05, -d / 2 - 0.1], [0, h - 0.05, d / 2 + 0.1], 0.06, C.woodD);
  for (const z of [-d / 2 - 0.05, d / 2 + 0.05]) k.block(0, 0, z, 0.06, h + 0.12, 0.06, C.woodD);
  k.on('gable', 0, 0, -d / 2 - 0.01, w, h, 0.04, shade(colour, -0.08));   // the back panel, a shade darker
}
B['tent-small'] = { src: 'oathwild', build: k => tent(k, 1.5, 1.45, 1.9, k.pick(['#b49a6e', '#a88f68', '#9c8a6a'])) };
B['tent-large'] = { src: 'oathwild', build: k => {
  // a round pavilion: canvas wall, cone roof with a scalloped valance, a centre pole and a pennant
  const c = k.pick(['#8a4a3a', '#7a5a3a', '#6e4a3e']), r = 2.6;
  k.on('cyl', 0, 0, 0, r, 1.6, r, CANVAS);
  for (let i = 1; i < 10; i++) { const a = i / 10 * PI * 2; k.block(Math.sin(a) * r / 2, 0, Math.cos(a) * r / 2, 0.05, 1.6, 0.05, shade(CANVAS, -0.18), { yaw: a }); }   // seams (none across the door)
  k.on('cone', 0, 1.6, 0, r + 0.25, 1.55, r + 0.25, c);
  k.on('cyl', 0, 1.42, 0, r + 0.14, 0.2, r + 0.14, shade(c, -0.1));   // the valance band
  for (let i = 0; i < 16; i++) { const a = (i + 0.5) / 16 * PI * 2; k.on('gable', Math.sin(a) * (r + 0.14) / 2, 1.44, Math.cos(a) * (r + 0.14) / 2, 0.5, 0.22, 0.03, shade(c, -0.1), { yaw: a, rx: PI }); }   // scallops hanging from it
  k.block(0, 0, r / 2 - 0.02, 0.9, 1.4, 0.06, C.void);
  for (const s of [-1, 1]) k.on('gable', s * 0.38, 0, r / 2 + 0.03, 0.4, 1.45, 0.05, shade(CANVAS, -0.1), { rz: s * 0.12 });
  k.block(0, 3.1, 0, 0.08, 0.7, 0.08, C.woodD);
  pennant(k, 0.04, 3.8, 0, 0.6, '#c8a040');
  for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2 + 0.3; k.rod([Math.sin(a) * r * 0.5, 1.5, Math.cos(a) * r * 0.5], [Math.sin(a) * r * 0.8, 0.02, Math.cos(a) * r * 0.8], 0.02, C.clothD); }
} };
B.bedroll = { src: 'oathwild', build: k => {
  const blanket = k.pick(['#7a4a3a', '#5a6a4a', '#6a5a7a']);
  k.block(0, 0, 0, 0.8, 0.06, 1.8, shade(blanket, -0.15));
  k.cylX(0, 0.16, -0.75, 0.82, 0.32, blanket);
  k.on('dome', 0, 0.06, 0.7, 0.5, 0.12, 0.3, '#c8bca0');
  k.block(0.65, 0, 0.3, 0.42, 0.5, 0.3, HIDE); k.block(0.65, 0.42, 0.33, 0.44, 0.08, 0.32, shade(HIDE, -0.15));
  k.on('cyl', 0.55, 0, -0.1, 0.12, 0.2, 0.12, '#5a4a3a');
} };
B.campfire = prop('campfire', { fit: 0.8 });
function banner(k, cloth, emblem, trim) {
  k.block(0, 0, 0, 0.7, 0.18, 0.7, C.stoneD);
  for (let i = 0; i < 5; i++) { const a = i * 1.25; k.on('pebble', Math.sin(a) * 0.42, 0, Math.cos(a) * 0.42, 0.25, 0.2, 0.22, k.tone(C.stone, 0.08)); }
  k.on('cyl', 0, 0, 0, 0.12, 3.2, 0.12, C.woodD);
  k.on('cone', 0, 3.2, 0, 0.16, 0.22, 0.16, trim);
  k.box(0, 2.95, 0.04, 1.05, 0.07, 0.07, C.woodD);
  k.block(0, 1.35, 0.06, 0.95, 1.55, 0.03, cloth);
  k.on('gable', 0, 1.1, 0.06, 0.95, 0.28, 0.03, cloth, { rx: PI });                // the swallow-tail point
  for (const s of [-1, 1]) k.block(s * 0.45, 1.35, 0.07, 0.05, 1.55, 0.03, trim);
  emblem(k);
}
B['banner-village'] = { src: 'oathwild', build: k => banner(k, '#2f5a86', k2 => { k2.on('cyl', 0, 2.0, 0.08, 0.42, 0.03, 0.42, '#d8b84a', { rx: PI / 2 }); k2.block(0, 1.65, 0.09, 0.06, 0.6, 0.02, '#d8b84a'); }, '#d8b84a') };
B['banner-bandit'] = { src: 'oathwild', build: k => banner(k, '#3a2a2a', k2 => { k2.rod([-0.25, 1.65, 0.09], [0.25, 2.25, 0.09], 0.07, '#b83a2a'); k2.rod([0.25, 1.65, 0.09], [-0.25, 2.25, 0.09], 0.07, '#b83a2a'); k2.ball(0, 1.95, 0.1, 0.1, '#e0d8c8'); }, '#8a2a22') };
B['goblin-totem'] = { src: 'oathwild', build: k => {
  const w = '#6e5a3e';
  k.on('cyl', 0, 0, 0, 0.32, 2.6, 0.32, w);
  for (let i = 0; i < 3; i++) { k.on('cyl', 0, 0.5 + i * 0.6, 0, 0.42, 0.18, 0.42, ['#8a3a2a', '#3a5a3a', '#c8a040'][i]); }
  k.block(0, 1.6, 0.14, 0.3, 0.32, 0.12, '#a08a6a');                              // a carved face
  for (const s of [-1, 1]) k.block(s * 0.07, 1.78, 0.2, 0.06, 0.06, 0.02, '#d8603a', { tag: 'glow' });
  k.ball(0, 2.78, 0, 0.2, C.bone, 1);                                              // the skull on top
  for (const s of [-1, 1]) k.rod([s * 0.12, 2.85, 0], [s * 0.5, 3.15, -0.05], 0.07, '#d8ccb0');   // horns
  k.rod([-0.45, 2.3, 0], [0.45, 2.3, 0], 0.08, w);
  for (const s of [-1, 1]) { k.block(s * 0.42, 1.85, 0, 0.04, 0.45, 0.02, '#c8b490'); k.ball(s * 0.42, 1.8, 0, 0.07, C.bone, 1); }   // dangling bones
  for (let i = 0; i < 3; i++) k.block(0.2, 2.2 - i * 0.18, 0.05, 0.03, 0.3, 0.12, ['#3a6aa0', '#a03a3a', '#e0d0a0'][i], { rz: -0.3 });   // feathers
  for (let i = 0; i < 6; i++) { const a = i * 1.05; k.on('pebble', Math.sin(a) * 0.5, 0, Math.cos(a) * 0.5, 0.22, 0.18, 0.2, k.tone(C.stone, 0.08)); }
} };
B['spike-barricade'] = { src: 'oathwild', build: k => {
  const L = 3.0;
  k.cylX(0, 0.35, 0, L, 0.32, C.bark);
  for (let i = 0; i < 5; i++) {
    const x = -L / 2 + 0.3 + i * (L - 0.6) / 4;
    for (const s of [-1, 1]) k.group(x, 0.35, 0, { rx: s * 0.75 }, () => { k.on('cyl', 0, -0.45, 0, 0.12, 1.3, 0.12, k.tone(C.wood, 0.08)); k.on('cone', 0, 0.85, 0, 0.12, 0.3, 0.12, '#c8a878'); });
  }
  k.rod([-L / 2, 0.55, 0], [L / 2, 0.55, 0], 0.03, C.clothD);
} };
B['junk-pile'] = { src: 'oathwild', build: k => {
  barrel(k, -0.55, 0, -0.1, 0.8, true);
  k.on('cyl', 0.4, 0, 0.1, 0.5, 0.25, 0.5, '#6a5040', { rz: 1.2 });               // a staved-in barrel on its side
  for (let i = 0; i < 5; i++) k.block(-0.4 + i * 0.22, 0, 0.3 - i * 0.1, 0.12, 0.04, 1.2 + k.rng() * 0.4, k.tone(C.plank, 0.1), { yaw: k.rng() * 2, rx: 0.15 });
  crate(k, 0.5, 0, -0.35, 0.55, 0.4);
  k.on('cyl', 0.2, 0.55, -0.3, 0.42, 0.06, 0.42, IRON, { rz: 0.4 });               // a cart wheel rim
  for (let i = 0; i < 4; i++) k.ball(-0.2 + i * 0.25, 0.08, 0.5, 0.07, C.bone, 0.8);
  k.on('cyl', -0.9, 0, 0.35, 0.36, 0.3, 0.36, '#5a3a2a');                        // a cracked pot
  sack(k, 0.8, 0.45, 0.7, '#9a8a6a', 0.3);
} };
B.cage = { src: 'oathwild', build: k => {
  const W = 1.4, H = 2.0;
  k.block(0, 0, 0, W + 0.1, 0.14, W * 0.85 + 0.1, C.woodD);
  k.block(0, H, 0, W + 0.1, 0.12, W * 0.85 + 0.1, C.woodD);
  k.on('hip', 0, H + 0.12, 0, W + 0.2, 0.4, W * 0.85 + 0.2, C.thatch);
  for (let i = 0; i <= 6; i++) for (const s of [-1, 1]) { k.block(-W / 2 + i * W / 6, 0.14, s * W * 0.42, 0.06, H - 0.14, 0.06, IRON); }
  for (let i = 1; i < 5; i++) for (const s of [-1, 1]) k.block(s * W / 2, 0.14, -W * 0.42 + i * W * 0.17, 0.06, H - 0.14, 0.06, IRON);
  k.block(0, 1.0, W * 0.43, 0.18, 0.2, 0.06, '#6a5a3a');                          // the padlock
  k.block(0, 0.14, 0, 0.6, 0.06, 0.4, C.straw);
} };
B['stolen-goods'] = { src: 'oathwild', build: k => {
  crate(k, -0.5, 0, -0.1, 0.72); crate(k, 0.3, 0, -0.2, 0.62, 0.3); crate(k, -0.3, 0.72, -0.1, 0.5, -0.2);
  sack(k, 0.75, 0.35, 0.9, '#b9a47e', -0.2); sack(k, -0.9, 0.35, 0.8, '#a8946c', 0.25);
  k.cylX(0.1, 0.18, 0.5, 1.4, 0.34, '#8a3a3a');                                   // a rolled rug
  k.cylX(0.1, 0.18, 0.5, 1.42, 0.12, '#c8a040');
  k.block(0.35, 0.62, -0.2, 0.42, 0.28, 0.3, '#5a3e2a'); k.cylX(0.35, 0.9, -0.2, 0.42, 0.3, '#5a3e2a');   // a small strongbox
  for (let i = 0; i < 6; i++) k.on('cyl', -0.1 + (k.rng() - 0.5) * 0.6, 0, 0.85 + (k.rng() - 0.5) * 0.2, 0.1, 0.02, 0.1, GOLD);   // spilled coins
  k.on('cyl', 0.6, 0, 0.75, 0.24, 0.3, 0.24, '#c8b04a');                         // a gold cup
} };
B['fish-rack'] = { src: 'oathwild', build: k => {
  for (const s of [-1, 1]) { k.rod([s * 0.95, 0, -0.4], [s * 0.95, 1.4, 0], 0.08, C.woodD); k.rod([s * 0.95, 0, 0.4], [s * 0.95, 1.4, 0], 0.08, C.woodD); }
  k.cylX(0, 1.35, 0, 2.1, 0.07, C.wood);
  k.cylX(0, 0.95, 0, 2.0, 0.05, C.wood);
  for (let i = 0; i < 7; i++) { const x = -0.8 + i * 0.27; const y = i % 2 ? 0.95 : 1.35; k.block(x, y - 0.42, 0, 0.12, 0.4, 0.05, k.tone('#9aa0a0', 0.08)); k.on('gable', x, y - 0.5, 0, 0.14, 0.1, 0.05, '#7a8080', { rx: PI }); }
  k.block(0.3, 0, 0.6, 0.6, 0.04, 0.5, '#6a6a5a', { yaw: 0.3 });                   // a heaped net
  k.on('dome', 0.3, 0.04, 0.6, 0.55, 0.12, 0.45, '#8a8a72');
  k.on('cyl', -0.6, 0, 0.55, 0.42, 0.32, 0.42, '#8a6a44');                        // a fish basket
} };
B.rowboat = { src: 'propkit:rowboat', build: (k, ctx) => stamp(k, 'rowboat', ctx.seed, { yaw: PI / 2 }) };
B.boardwalk = { src: 'oathwild', build: k => {
  const L = 4, W = 1.8;
  for (const s of [-1, 1]) k.block(0, 0.32, s * (W / 2 - 0.15), L, 0.14, 0.14, C.woodD);
  for (let i = 0; i < 13; i++) k.block(-L / 2 + 0.15 + i * (L - 0.3) / 12, 0.46, (k.rng() - 0.5) * 0.08, 0.26, 0.06, W * k.j(1, 0.04), k.tone(C.plank, 0.08), { yaw: (k.rng() - 0.5) * 0.06 });
  for (const x of [-L / 2 + 0.2, 0, L / 2 - 0.2]) for (const s of [-1, 1]) k.block(x, -0.6, s * (W / 2 - 0.1), 0.16, 1.05, 0.16, C.woodD);
  k.block(L / 2 - 0.2, 0.46, W / 2 - 0.1, 0.12, 0.7, 0.12, C.woodD);
  k.on('cyl', L / 2 - 0.2, 0.9, W / 2 - 0.1, 0.18, 0.12, 0.18, '#a08c62');      // a rope coil on the post
} };

// ---- loot
function chest(k, wood, band, { studs = false, gem = null, coins = false } = {}) {
  const W = 0.66, H = 0.4, D = 0.46;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.block(sx * (W / 2 - 0.05), 0, sz * (D / 2 - 0.05), 0.08, 0.05, 0.08, band);
  k.block(0, 0.04, 0, W, H, D, wood);
  k.cylX(0, 0.04 + H, 0, W, D, shade(wood, 0.05));
  for (const x of [-W / 2 + 0.1, W / 2 - 0.1]) { k.block(x, 0.03, 0, 0.06, H + 0.02, D + 0.03, band); k.cylX(x, 0.04 + H, 0, 0.06, D + 0.03, band); }
  k.block(0, 0.04 + H - 0.06, 0, W + 0.02, 0.05, D + 0.02, band);
  k.block(0, H - 0.1, D / 2 + 0.01, 0.14, 0.18, 0.03, gem ? GOLD : '#9a8a5a');
  if (studs) for (let i = 0; i < 4; i++) k.on('dome', -0.2 + i * 0.13, 0.12, D / 2 + 0.01, 0.04, 0.02, 0.04, '#9a9aa4', { rx: PI / 2 });
  if (gem) { k.on('dome', 0, H - 0.02, D / 2 + 0.03, 0.07, 0.04, 0.07, gem, { rx: PI / 2, tag: 'glow' }); k.glow(0, H + 0.2, D / 2, gem); }
  if (coins) for (let i = 0; i < 7; i++) k.on('cyl', (k.rng() - 0.5) * 0.9, 0, D / 2 + 0.15 + k.rng() * 0.3, 0.09, 0.02, 0.09, GOLD);
}
B['chest-common'] = { src: 'oathwild', build: k => chest(k, '#7a5a3a', '#4a4038') };
B['chest-rare'] = { src: 'oathwild', build: k => chest(k, '#5a4434', '#3a3a44', { studs: true }) };
B['chest-epic'] = { src: 'oathwild', build: k => chest(k, '#4a2e3a', GOLD, { studs: true, gem: '#b8f0ff', coins: true }) };
B['loot-sack'] = { src: 'oathwild', build: k => { sack(k, 0, 0, 0.75, '#9a7a4a', 0.15); k.on('cyl', 0.25, 0, 0.12, 0.08, 0.015, 0.08, GOLD); k.block(-0.18, 0, 0.1, 0.3, 0.04, 0.22, '#7a5a3a', { yaw: 0.5 }); } };
B.crate = { src: 'oathwild', build: k => crate(k, 0, 0, 0, 0.62) };
B['crate-stack'] = { src: 'oathwild', build: k => { crate(k, -0.28, 0, 0, 0.68, 0.1); crate(k, 0.45, 0, 0.05, 0.58, -0.2); crate(k, -0.2, 0.68, 0, 0.56, 0.35); sack(k, 0.5, 0.48, 0.6, '#b9a47e', -0.25); } };
B['barrel-open'] = { src: 'oathwild', build: k => { barrel(k, 0, 0, 0, 0.95, true); k.block(0.05, 0.9, 0.1, 0.3, 0.12, 0.25, '#6a5a44', { rz: 0.3 }); k.on('dome', -0.06, 0.9, -0.05, 0.3, 0.1, 0.28, '#a8946c'); } };

// ---- town things
B.well = prop('well');
B['market-stall'] = { src: 'buildkit:stall', build: (k, ctx) => {
  const kinds = ['produce', 'cloth', 'bread', 'brew', 'charms'];
  const st = describeStall({ kind: kinds[ctx.seed % kinds.length], seed: ctx.seed });
  for (const p of stallParts({ ...st, w: 1.9, d: 1.4 })) k.parts.push({ ...p });
  crate(k, 0.7, 0, -0.85, 0.45, 0.2); sack(k, -0.75, -0.85, 0.65);
} };
B.cart = { src: 'propkit:haycart', fit: 0.78, build: (k, ctx) => stamp(k, 'haycart', ctx.seed, { yaw: PI / 2 }) };
B.haystack = prop('haystack', { fit: 'h' });
B.signpost = { src: 'oathwild', build: k => {
  k.on('cyl', 0, 0, 0, 0.16, 2.5, 0.16, C.wood);
  k.on('cone', 0, 2.5, 0, 0.2, 0.15, 0.2, C.woodD);
  for (let i = 0; i < 4; i++) { const a = i * 1.3 + 0.2; k.on('pebble', Math.sin(a) * 0.22, 0, Math.cos(a) * 0.22, 0.2, 0.14, 0.18, k.tone(C.stone, 0.08)); }
  const arms = [[2.15, -0.5, 1], [1.8, 0.9, -1], [1.45, 2.4, 1]];
  for (const [y, yaw, s] of arms) k.group(0, y, 0, { yaw }, () => {
    k.block(s * 0.45, 0, 0.1, 0.78, 0.2, 0.04, k.tone(C.plank, 0.06));
    k.on('gable', s * 0.92, 0, 0.1, 0.22, 0.2, 0.04, k.tone(C.plank, 0.06), { rz: -s * PI / 2 });
    k.block(s * 0.4, 0.08, 0.125, 0.5, 0.035, 0.01, '#3a2e22');
  });
} };
B['lamp-post'] = { src: 'oathwild', build: k => {
  k.block(0, 0, 0, 0.5, 0.25, 0.5, C.stoneD);
  k.block(0, 0.25, 0, 0.2, 2.75, 0.2, C.wood);
  k.block(0, 0.25, 0, 0.28, 0.3, 0.28, C.woodD);
  k.block(0, 2.9, 0.25, 0.08, 0.08, 0.6, IRON);                                  // the bracket arm
  k.rod([0, 2.5, 0.1], [0, 2.88, 0.45], 0.05, IRON);
  k.block(0, 2.15, 0.5, 0.06, 0.75, 0.06, IRON);                                // the hanging chain
  k.block(0, 1.95, 0.5, 0.3, 0.04, 0.3, IRON);
  k.block(0, 1.99, 0.5, 0.22, 0.34, 0.22, '#ffd28a', { tag: 'glow' });          // lantern glass
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.block(sx * 0.12, 1.99, 0.5 + sz * 0.12, 0.03, 0.34, 0.03, IRON);
  k.on('hip', 0, 2.33, 0.5, 0.34, 0.16, 0.34, IRON);
  k.glow(0, 2.15, 0.5, '#ffc070');
} };
B.anvil = { src: 'oathwild', build: k => {
  k.on('cyl', 0, 0, 0, 0.5, 0.45, 0.5, C.bark);
  k.on('cyl', 0, 0.44, 0, 0.44, 0.02, 0.44, '#9a7c58');
  k.block(0, 0.46, 0, 0.18, 0.18, 0.12, IRON);
  k.block(0, 0.64, 0, 0.5, 0.14, 0.18, '#3e3e46');
  k.on('cone', 0.33, 0.64, 0, 0.12, 0.2, 0.14, '#3e3e46', { rz: -PI / 2 });
  k.block(-0.08, 0.78, 0.02, 0.28, 0.04, 0.05, C.woodD, { yaw: 0.4 });            // the hammer
  k.block(0.02, 0.78, 0.02, 0.08, 0.07, 0.08, IRON, { yaw: 0.4 });
} };
B['stone-wall-low'] = prop('stone_wall');
B['fence-rail'] = prop('wooden_fence', { fit: 'w' });
B.woodpile = { src: 'oathwild', build: k => {
  for (const s of [-1, 1]) k.block(s * 0.95, 0, 0, 0.12, 1.2, 0.12, C.woodD);
  k.block(0, 0, 0, 2.0, 0.1, 0.9, C.woodD);
  for (let r = 0; r < 4; r++) for (let i = 0; i < 7; i++) {
    const x = -0.78 + i * 0.26 + (r % 2) * 0.1;
    if (x > 0.85) continue;
    k.cylZ(x, 0.22 + r * 0.24, 0, 0.82, 0.24 * k.j(1, 0.1), k.tone(C.bark, 0.1));
    k.on('cyl', x, 0.22 + r * 0.24, 0.41, 0.2, 0.02, 0.2, '#c8a878', { rx: PI / 2 });
  }
  k.on('shed', 0, 1.2, 0, 2.2, 0.25, 1.1, '#6a5a44', { yaw: PI / 2 });
  k.on('cyl', 0.62, 0, 0.75, 0.5, 0.4, 0.5, C.bark); k.on('cyl', 0.62, 0.39, 0.75, 0.42, 0.02, 0.42, '#c8a878');   // the chopping block
  k.block(0.62, 0.4, 0.75, 0.05, 0.5, 0.05, C.wood, { rz: 0.5 }); k.block(0.5, 0.36, 0.75, 0.04, 0.12, 0.16, IRON, { rz: 0.5 });
} };
B.wheelbarrow = { src: 'oathwild', build: k => {
  k.on('frustum', 0, 0.3, -0.1, 0.7, 0.4, 0.9, C.plank, { rx: PI });
  k.block(0, 0.3, -0.1, 0.72, 0.04, 0.92, shade(C.plank, -0.2));
  k.cylX(0, 0.22, 0.55, 0.1, 0.44, C.woodD); k.cylX(0, 0.22, 0.55, 0.12, 0.12, IRON);
  for (const s of [-1, 1]) { k.rod([s * 0.22, 0.22, 0.55], [s * 0.3, 0.62, -0.85], 0.06, C.wood); k.block(s * 0.25, 0, -0.45, 0.05, 0.32, 0.05, C.woodD); }
  k.on('dome', 0, 0.68, -0.1, 0.55, 0.18, 0.7, '#5a4a38');                      // a load of earth
} };
B.trough = { src: 'propkit:water_trough', fit: 1, build: (k, ctx) => { stamp(k, 'water_trough', ctx.seed, { yaw: PI / 2 }); k.on('cyl', 1.25, 0, 0.3, 0.36, 0.36, 0.36, '#7a5a3a'); } };
B['scarecrow-post'] = prop('scarecrow', { fit: 'h' });
B['wanted-board'] = prop('notice_post');

// ---- walls (not placed in round 1, kept so every row has a model)
function palisade(k, L, H) {
  const n = Math.round(L / 0.32);
  for (let i = 0; i < n; i++) stake(k, -L / 2 + (i + 0.5) * L / n, 0, H * k.j(1, 0.06), 0.3, k.tone(C.bark, 0.08));
  for (const y of [0.6, H * 0.7]) k.box(0, y, -0.18, L, 0.12, 0.08, C.woodD);
}
B['palisade-wall'] = { src: 'oathwild', build: (k, { size }) => palisade(k, size[0], size[1]) };
B['palisade-corner'] = { src: 'oathwild', build: (k, { size }) => { for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2; stake(k, Math.sin(a) * 0.8, Math.cos(a) * 0.8, size[1] * k.j(1, 0.05), 0.36, k.tone(C.bark, 0.08)); } k.block(0, size[1] * 0.55, 0, 1.9, 0.12, 1.9, C.woodD); } };
B['palisade-gate'] = { src: 'oathwild', build: (k, { size }) => {
  const L = size[0], H = size[1];
  for (const s of [-1, 1]) { k.block(s * (L / 2 - 0.2), 0, 0, 0.4, H, 0.4, C.woodD); k.on('cone', s * (L / 2 - 0.2), H, 0, 0.42, 0.3, 0.42, C.woodD); }
  k.box(0, H - 0.25, 0, L, 0.25, 0.3, C.wood);
  for (const s of [-1, 1]) { for (let i = 0; i < 6; i++) k.block(s * (0.18 + i * 0.36), 0.1, 0.05, 0.32, H * 0.72, 0.12, k.tone(C.wood, 0.08)); k.block(s * 1.1, 0.6, 0.12, 2.0, 0.12, 0.05, C.woodD); k.block(s * 1.1, H * 0.6, 0.12, 2.0, 0.12, 0.05, C.woodD); }
} };
B['bridge-wood'] = { src: 'oathwild', build: (k, { size }) => { const [L, , W] = size; for (let i = 0; i < 16; i++) k.block(-L / 2 + (i + 0.5) * L / 16, 0.9, 0, L / 16 - 0.03, 0.1, W, k.tone(C.plank, 0.08)); for (const s of [-1, 1]) { k.block(0, 1.0, s * W / 2, L, 0.08, 0.1, C.woodD); for (let i = 0; i <= 4; i++) k.block(-L / 2 + i * L / 4, 0, s * W / 2, 0.16, 1.6, 0.16, C.woodD); } } };
B['bridge-stone'] = { src: 'oathwild', build: (k, { size }) => { const [L, H, W] = size; k.block(0, H * 0.7, 0, L, H * 0.3, W, C.stone); for (const s of [-1, 1]) { k.block(-L / 2 + 0.5, 0, s * W * 0.25, 1, H * 0.7, W * 0.4, C.stoneD); k.block(L / 2 - 0.5, 0, s * W * 0.25, 1, H * 0.7, W * 0.4, C.stoneD); k.block(0, H, s * (W / 2 - 0.15), L, 0.5, 0.3, C.stoneL); } } };

// ---- buildings (front +z = door side)
function house(k, { want, w, d, seed, culture = 'human', district = 'craft', tune = null, office = null }) {
  const plot = { cx: 0, cz: 0, angle: 0, facing: PI / 2, w: w + 1.2, d: d + 1.2, want, district };
  const desc = describeBuilding({ plot, culture, seed, want, district, tune });
  for (const p of partsFor(desc)) k.parts.push({ ...p, tag: p.tag === 'lamp' ? 'glow' : p.tag });
  if (office) {
    const o = officeDressing(office, desc, { seed });
    for (const p of o.parts) k.parts.push({ ...p, tag: p.tag === 'lamp' ? 'glow' : p.tag });
    for (const f of o.fires) k.fires.push(f);
  }
  return desc;
}
B.smithy = { src: 'buildkit:forge + offices:forge', centre: true, build: k => {
  house(k, { want: 'forge', w: 3.4, d: 2.9, seed: 2, office: 'forge', tune: { storeyHeight: [2.8, 3.0], minPitch: 0.7 } });
} };
B.watermill = { src: 'buildkit:house + propkit:watermill_wheel', centre: true, build: k => {
  const desc = house(k, { want: 'house', w: 4.6, d: 3.8, seed: 2, tune: { storeyHeight: [2.7, 2.9], minStoreys: 2, minPitch: 0.7 } });
  stamp(k, 'watermill_wheel', 4, { x: desc.footprint.w / 2 + 0.95, z: 0, s: 0.95 });   // the wheel turns (a spin group)
  stamp(k, 'sluice_gate', 4, { x: desc.footprint.w / 2 + 0.95, z: 2.6, s: 0.8, yaw: PI / 2 });
  for (let i = 0; i < 3; i++) sack(k, -desc.footprint.w / 2 + 0.4 + i * 0.5, desc.footprint.d / 2 + 0.45, 0.8, '#c2b089', (i - 1) * 0.2);
} };
function tower(k, H, W, { roof = C.shingle, banner: flag = null } = {}) {
  // four timber legs, X braces, a planked platform with a rail, a hip roof on posts, a ladder up the front
  const legH = H * 0.62, half = W / 2 - 0.15;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.rod([sx * half, 0, sz * half], [sx * half * 0.82, legH, sz * half * 0.82], 0.26, k.tone(C.woodD, 0.05));
  for (const y of [legH * 0.15, legH * 0.55]) {
    const h2 = legH * 0.4, a = half * (1 - (y / legH) * 0.18), b = half * (1 - ((y + h2) / legH) * 0.18);
    for (const s of [-1, 1]) { k.rod([-a, y, s * a], [b, y + h2, s * b], 0.1, C.wood); k.rod([s * a, y, -a], [s * b, y + h2, b], 0.1, C.wood); }
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.block(sx * half, 0, sz * half, 0.5, 0.25, 0.5, C.stoneD);
  const P = W * 0.92;
  k.block(0, legH, 0, P, 0.22, P, C.woodD);
  for (let i = 0; i < 8; i++) k.block(-P / 2 + (i + 0.5) * P / 8, legH + 0.22, 0, P / 8 - 0.03, 0.05, P, k.tone(C.plank, 0.06));
  for (const s of [-1, 1]) { k.block(0, legH + 0.27, s * P / 2, P, 1.0, 0.08, k.tone(C.wood, 0.04)); k.block(s * P / 2, legH + 0.27, 0, 0.08, 1.0, P, k.tone(C.wood, 0.04)); }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.block(sx * (P / 2 - 0.06), legH + 0.27, sz * (P / 2 - 0.06), 0.14, H - legH - 1.4, 0.14, C.woodD);
  k.on('hip', 0, H - 1.15, 0, P + 0.7, 1.2, P + 0.7, roof);
  k.block(0, H - 1.15, 0, P + 0.4, 0.12, P + 0.4, C.woodD);
  // the ladder, on the front (+z), through a hatch
  for (const s of [-1, 1]) k.rod([s * 0.25, 0, half + 0.75], [s * 0.25, legH + 0.3, P / 2 + 0.02], 0.07, C.wood);
  const steps = Math.floor(legH / 0.35);
  for (let i = 1; i < steps; i++) { const t = i / steps; k.box(0, legH * t, half + 0.75 - (half + 0.73 - P / 2) * t, 0.5, 0.05, 0.05, C.woodD); }
  if (flag) { k.block(0, H, 0, 0.07, 1.0, 0.07, C.woodD); pennant(k, 0.04, H + 0.95, 0, 0.7, flag); }
  k.block(P / 2 - 0.4, legH + 0.27, -P / 2 + 0.4, 0.5, 0.5, 0.5, '#6a5a44');      // a lookout's crate
}
B.watchtower = { src: 'oathwild', build: (k, { size }) => tower(k, size[1], size[0], { banner: '#2f5a86' }) };
B.lookout = { src: 'oathwild', build: (k, { size }) => tower(k, size[1] + 0.6, size[0] + 0.3, { roof: '#6a5a44' }) };
B['goblin-hut'] = { src: 'oathwild', build: k => {
  // a lumpy round hut: a mud-and-stone ring, hides over bent poles, sticks out of the smoke hole, a skull over the door
  const r = 2.5;
  k.on('cyl', 0, 0, 0, r, 0.9, r * 0.92, '#6a5640');
  for (let i = 0; i < 12; i++) { const a = i / 12 * PI * 2; k.on('pebble', Math.sin(a) * r / 2, -0.05, Math.cos(a) * r * 0.46, 0.5, 0.45, 0.4, k.tone('#7a7264', 0.1)); }
  k.on('dome', 0, 0.8, 0, r + 0.2, 1.7, r * 0.92 + 0.2, '#7a6248');
  for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2 + 0.3; k.on('dome', Math.sin(a) * 0.55, 1.15, Math.cos(a) * 0.5, 1.4, 1.2, 1.1, k.pick(['#8a6a4a', '#6e5238', '#9a7a52', '#5e4a36']), { yaw: a, rx: 0.12 }); }   // hide patches
  for (let i = 0; i < 6; i++) { const a = i * 1.05; k.rod([Math.sin(a) * 0.2, 2.1, Math.cos(a) * 0.2], [Math.sin(a) * 0.6, 3.4, Math.cos(a) * 0.5], 0.08, '#4e3e2c'); }
  k.block(0, 0, r * 0.42, 0.9, 1.35, 0.3, C.void);                               // the doorway
  k.on('gable', 0, 1.3, r * 0.42 + 0.05, 1.3, 0.45, 0.4, '#5e4a36');
  for (const s of [-1, 1]) k.block(s * 0.52, 0, r * 0.45, 0.14, 1.6, 0.14, '#4e3e2c');
  k.ball(0, 1.95, r * 0.48, 0.2, C.bone, 1);
  for (const s of [-1, 1]) k.rod([s * 0.1, 2.05, r * 0.5], [s * 0.4, 2.35, r * 0.48], 0.06, '#d8ccb0');
  k.block(0.9, 0, 0.9, 0.5, 0.6, 0.4, '#5e4a36', { yaw: 0.7 });                   // a lean of junk on the side
  k.on('cyl', -1.05, 0, 0.7, 0.4, 0.5, 0.4, '#5a3a2a');
} };
B['hag-hut'] = { src: 'oathwild', build: k => {
  // a crooked hut on stilts in the bog: leaning walls, a skewed turf roof, a bent chimney, herbs hung under the eaves
  const W = 3.2, D = 2.6, lift = 1.1, Hw = 2.3;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.rod([sx * W * 0.42, 0, sz * D * 0.42], [sx * W * 0.38, lift, sz * D * 0.38], 0.22, '#4a3a2a');
  k.block(0, lift, 0, W + 0.3, 0.16, D + 0.3, '#5a4632');
  k.group(0, lift + 0.16, 0, { rz: 0.05 }, () => {
    k.block(0, 0, 0, W, Hw, D, '#6e5e48');
    for (let i = 0; i < 9; i++) k.block(-W / 2 + (i + 0.5) * W / 9, 0, D / 2 + 0.01, W / 9 - 0.04, Hw, 0.04, k.tone('#6a5a44', 0.1));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.block(sx * (W / 2 - 0.06), 0, sz * (D / 2 - 0.06), 0.16, Hw, 0.16, '#3e3226');
    k.on('gable', 0, Hw, 0, W + 0.7, 1.7, D + 0.6, '#5d6a3a', { yaw: PI / 2, rz: -0.08 });
    k.on('gable', 0, Hw + 0.02, 0, W + 0.6, 1.6, D + 0.45, '#4e5a2e', { yaw: PI / 2 });
    k.block(0.1, 0, D / 2 + 0.03, 0.8, 1.6, 0.06, '#3a2e22');                    // the door
    k.block(-0.85, 1.0, D / 2 + 0.03, 0.5, 0.45, 0.05, '#e8a84a', { tag: 'glow' });  // a lit window
    k.block(-0.85, 1.0, D / 2 + 0.06, 0.06, 0.45, 0.04, '#3e3226'); k.block(-0.85, 1.2, D / 2 + 0.06, 0.5, 0.05, 0.04, '#3e3226');
    k.group(W / 2 - 0.5, Hw + 0.4, -0.5, { rz: -0.22 }, () => { k.block(0, 0, 0, 0.45, 1.7, 0.45, '#6a6258'); k.block(0, 1.6, 0, 0.55, 0.16, 0.55, '#4a443c'); });
    for (let i = 0; i < 5; i++) k.block(-1.2 + i * 0.55, Hw - 0.5, D / 2 + 0.35, 0.12, 0.42, 0.08, k.pick(['#6a8a3a', '#8a7a3a', '#7a4a6a']));
  });
  k.glow(-0.85, lift + 1.4, D / 2 + 0.3, '#e8a84a');
  for (let i = 0; i < 6; i++) k.block(0.1, lift * (i / 6), D / 2 + 0.45 + (1 - i / 6) * 1.2, 0.8, 0.06, 0.26, k.tone(C.woodD, 0.08));  // steps down to the ground
  stamp(k, 'cauldron_tripod', 5, { x: -1.9, z: 1.9 });
  for (let i = 0; i < 4; i++) k.ball(1.9 + (i % 2) * 0.3, 0.12, 1.6 + i * 0.2, 0.12, C.bone, 0.9);
} };
B['ruin-tower'] = prop('broken_tower', { fit: 0.72 });
B['barrow-entrance'] = { src: 'propkit:crypt_door', fit: 0.92, build: (k, ctx) => {
  stamp(k, 'crypt_door', ctx.seed);
  for (const s of [-1, 1]) { k.on('rock', s * 2.2, -0.2, 0.8, 0.9, 2.2, 0.8, k.tone('#6e6a5a', 0.05), { yaw: s * 0.4 }); rune(k, s * 2.2, 1.0, 1.22, 0.1, 0.3, '#8ac8ff'); }
  for (let i = 0; i < 5; i++) k.ball(-0.8 + i * 0.4, 0.06, 2.4, 0.08, C.bone, 0.8);
} };

// ------------------------------------------------------------------------------------------- the API

export const KIT_IDS = Object.freeze(Object.keys(B));
export const KIT_SOURCE = Object.freeze(Object.fromEntries(Object.entries(B).map(([id, e]) => [id, e.src])));

const cache = new Map();
/**
 * One model for an art id, fitted to `size` ([w, h, d], the art row's) and turned to face -Z.
 * Spinning parts (the mill wheel) come back in `spin`; fires and glows as points.
 */
export function kitModel(id, { seed = 1, size = null } = {}) {
  const e = B[id];
  if (!e) return null;
  const key = `${id}|${seed}|${size ? size.join(',') : ''}`;
  if (cache.has(key)) return cache.get(key);
  const k = propContext(hashStr(id) ^ Math.imul((seed >>> 0) || 1, 2654435761));
  const sz = size || [1, 1, 1];
  e.build(k, { seed, size: sz });
  let m = { parts: k.parts, fires: k.fires, glows: k.glows, spin: k.spin };
  if (e.centre) {   // a building with a lean-to or a wheel on one side: centre its bounds on the placement point
    const nb = boundsOf(m).bounds, cx = (nb[0] + nb[3]) / 2, cz = (nb[2] + nb[5]) / 2;
    const mv = p => ({ ...p, x: p.x - cx, z: p.z - cz });
    m = { ...m, parts: m.parts.map(mv), fires: m.fires.map(mv), glows: m.glows.map(mv), spin: m.spin.map(mv) };
  }
  if (e.fit) {
    const nb = boundsOf(m).bounds;
    const h = nb[4] - Math.max(0, nb[1]), w = nb[3] - nb[0];
    const s = typeof e.fit === 'number' ? e.fit : e.fit === 'h' ? sz[1] / h : sz[0] / w;
    m = scaleModel(m, Math.round(s * 1000) / 1000);
  }
  m = turnModel(m, PI);
  const { bounds, radius } = boundsOf(m);
  const out = { id, ...m, bounds, radius };
  cache.set(key, out);
  return out;
}

