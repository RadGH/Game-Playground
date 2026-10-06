// Procedural Towns — the SET-PIECE KIT (play-test 2, Q18/Q19).
//
// The building kit next door (buildkit.js) makes houses; this makes everything that stands AROUND
// them in a bespoke place: graveyards (headstones, crypts, iron railings, a mausoleum), farmland
// (crops by type, fences, scarecrows, haystacks, a barn, a windmill, a water wheel), orchards, shrines,
// ruins, a lumber camp, a hunters' camp, a fishing spot, an inn yard, a drill field.
//
// SAME PARADIGM AS THE BUILDING KIT: no Three.js, no DOM — every model is a list of the eight unit
// shapes in `MESHES` (box, cyl, gable, shed, hip, frustum, cone, dome; origin at the CENTRE OF THE
// BASE, one metre each way, so `y` is the bottom of the part). A game instances them: one
// InstancedMesh per mesh kind holds every model in a zone, whatever it is. `propkit-three.js` is a
// small helper that does exactly that for a Three.js game (and the gallery page uses it).
//
//   import { propModel, cropField, fenceLine, PROP_MODEL_IDS, PROP_MODEL_INFO } from './propkit.js';
//   const m = propModel('gravestone', { seed: 7 });
//   // m.parts  -> [{ mesh, x, y, z, w, h, d, yaw, rx, rz, colour, tag? }]
//   // m.spin   -> [{ x, y, z, axis: 'x'|'z', speed, parts: [...] }]  (turning bits: a water wheel, sails)
//   // m.fires  -> [{ x, y, z, s }]        flame points (a campfire, a smoking pit)
//   // m.glows  -> [{ x, y, z, color }]    small lights (the inn-sign lantern, the sigil slab at night)
//   // m.solid  -> { r, h } | null         a footprint for the camera / collision on big things
//   // m.radius -> metres                  how far the model reaches from its origin
//
// PART FRAME. Local metres; +z is the model's FRONT, +y up from the ground. A part's matrix is
//
//     T(x, y, z) * Ry(yaw) * Rx(rx) * Rz(rz) * S(w, h, d)
//
// i.e. Three.js `new Euler(rx, yaw, rz, 'YXZ')` — yaw about y first, then the pitch `rx` about the
// part's own x, then the roll `rz` about its own z — applied about the part's ORIGIN (the centre of
// its base). The model itself is then turned by the game's placement yaw about the model origin.
// A SPIN group's parts are relative to its pivot (x, y, z in the model frame); the game turns the
// pivot about its `axis` (the model's own x or z, after the model's yaw) at `speed` rad/s.
//
// Deterministic: the same id + seed is the same model every time (lean, lichen, which variant, a size
// jitter of at most 10 %), so nothing has to be stored.

import { makeRng } from './townplan.js';
import { MESHES } from './buildkit.js';

// ---------------------------------------------------------------------------- colour

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const hexRgb = c => { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgbHex = a => '#' + a.map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
/** Lighten (k > 0) or darken (k < 0) by a fraction. */
export function shade(c, k) { return rgbHex(hexRgb(c).map(v => (k >= 0 ? v + (255 - v) * k : v * (1 + k)))); }
export function mixHex(a, b, t) { const A = hexRgb(a), B = hexRgb(b); return rgbHex(A.map((v, i) => v + (B[i] - v) * t)); }

const C = {
  stone: '#8a857c', stoneD: '#6d6961', stoneL: '#a39d92', stoneW: '#b4ae9f', moss: '#5f7a3a', lichen: '#9aa860',
  wood: '#6e553d', woodD: '#4a3a2c', woodL: '#8f7352', plank: '#9a7c58', iron: '#2f2f34', ironL: '#4a4a52', rust: '#7a4a2a',
  thatch: '#b39a5c', hay: '#c9ae62', hayD: '#a68c4a', earth: '#5f5040', earthD: '#3e3328', earthL: '#76644c', mud: '#4e4234',
  leaf: '#5b7a3a', leafD: '#45612c', leafL: '#7a9a48', bark: '#4f3d2e', cloth: '#a89878', clothD: '#7c6c54', hide: '#8a6a4a',
  bone: '#d8d0b8', red: '#8a3a2a', barn: '#7a3a2a', white: '#d8d2c2', gold: '#b08a3a', water: '#3a5a6a', sand: '#c8b890',
  shingle: '#4a3e38', void: '#0b0a0c', straw: '#cdb46a', violet: '#7a5aa0',
};

// ---------------------------------------------------------------------------- tiny rotation maths

/** 3x3 rotation for Euler(rx, yaw, rz, 'YXZ') = Ry * Rx * Rz, row-major [m11..m33]. */
function rot(yaw = 0, rx = 0, rz = 0) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cx = Math.cos(rx), sx = Math.sin(rx), cz = Math.cos(rz), sz = Math.sin(rz);
  // Ry
  const Y = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];
  const X = [1, 0, 0, 0, cx, -sx, 0, sx, cx];
  const Z = [cz, -sz, 0, sz, cz, 0, 0, 0, 1];
  return mul(mul(Y, X), Z);
}
function mul(a, b) {
  const o = new Array(9);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
  return o;
}
const apply = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
/** Euler 'YXZ' back out of a rotation (Three.js's own extraction). -> [yaw, rx, rz] */
function euler(m) {
  const m13 = m[2], m21 = m[3], m22 = m[4], m23 = m[5], m31 = m[6], m33 = m[8], m11 = m[0];
  const rx = Math.asin(-clamp(m23, -1, 1));
  let yaw, rz;
  if (Math.abs(m23) < 0.9999999) { yaw = Math.atan2(m13, m33); rz = Math.atan2(m21, m22); } else { yaw = Math.atan2(-m31, m11); rz = 0; }
  return [yaw, rx, rz];
}
const r4 = v => Math.round(v * 1e4) / 1e4;

// ---------------------------------------------------------------------------- the builder context

/**
 * A model is drawn into a context that keeps a transform stack, so a whole tilted headstone (slab +
 * rounded top + lichen) leans as one thing, and a spinning wheel's paddles can be laid out by angle.
 */
function context(rng) {
  const parts = [], spin = [], fires = [], glows = [];
  let M = rot(), T = [0, 0, 0];
  const world = p => { const q = apply(M, p); return [T[0] + q[0], T[1] + q[1], T[2] + q[2]]; };
  const k = {
    rng, parts, spin, fires, glows,
    /** A part by its BASE origin (the kit's native frame). */
    on(mesh, x, y, z, w, h, d, colour, o = {}) {
      const R = mul(M, rot(o.yaw || 0, o.rx || 0, o.rz || 0));
      const p = world([x, y, z]);
      const [yaw, rx, rz] = euler(R);
      const part = { mesh, x: r4(p[0]), y: r4(p[1]), z: r4(p[2]), w: r4(Math.max(0.01, w)), h: r4(Math.max(0.01, h)), d: r4(Math.max(0.01, d)), yaw: r4(yaw), rx: r4(rx), rz: r4(rz), colour };
      if (o.tag) part.tag = o.tag;
      parts.push(part);
      return part;
    },
    /** A part by its CENTRE (handy for anything tilted: the base origin is worked out). */
    at(mesh, cx, cy, cz, w, h, d, colour, o = {}) {
      const up = apply(rot(o.yaw || 0, o.rx || 0, o.rz || 0), [0, 1, 0]);
      return k.on(mesh, cx - up[0] * h / 2, cy - up[1] * h / 2, cz - up[2] * h / 2, w, h, d, colour, o);
    },
    box(cx, cy, cz, w, h, d, colour, o) { return k.at('box', cx, cy, cz, w, h, d, colour, o); },
    /** A box standing on y (base origin), the common case. */
    block(x, y, z, w, h, d, colour, o) { return k.on('box', x, y, z, w, h, d, colour, o); },
    /** A beam (box) or rod (cyl) from point a to point b, `t` thick. */
    beam(a, b, t, colour, mesh = 'box', o = {}) {
      const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz) || 0.01;
      const rx = Math.acos(clamp(dy / L, -1, 1)), yaw = Math.abs(Math.sin(rx)) < 1e-6 ? 0 : Math.atan2(dx, dz);
      return k.on(mesh, a[0], a[1], a[2], t, L, o.d ?? t, colour, { yaw, rx, tag: o.tag });
    },
    rod(a, b, dia, colour, o) { return k.beam(a, b, dia, colour, 'cyl', o); },
    /** A horizontal cylinder centred at (cx, cy, cz), running along x (`cylX`) or z (`cylZ`). */
    cylX(cx, cy, cz, len, dia, colour, o = {}) { return k.at('cyl', cx, cy, cz, dia, len, dia, colour, { ...o, rz: Math.PI / 2 }); },
    cylZ(cx, cy, cz, len, dia, colour, o = {}) { return k.at('cyl', cx, cy, cz, dia, len, dia, colour, { ...o, rx: Math.PI / 2 }); },
    /** A ball: two domes back to back (an apple, a crown of leaves, a pumpkin squashed with `squash`). */
    ball(cx, cy, cz, r, colour, squash = 1, o = {}) {
      k.on('dome', cx, cy, cz, r * 2, r * squash, r * 2 * (o.long || 1), colour, o);
      k.on('dome', cx, cy, cz, r * 2, r * squash, r * 2 * (o.long || 1), shade(colour, -0.08), { ...o, rx: Math.PI });
    },
    group(x, y, z, o, fn) {
      const sM = M, sT = T;
      T = world([x, y, z]); M = mul(M, rot(o.yaw || 0, o.rx || 0, o.rz || 0));
      fn(); M = sM; T = sT;
    },
    /** Parts that turn about a pivot (axis 'x' or 'z' of the model). */
    spinner(x, y, z, axis, speed, fn) {
      const sub = context(rng);
      fn(sub);
      const p = world([x, y, z]);
      spin.push({ x: r4(p[0]), y: r4(p[1]), z: r4(p[2]), axis, speed, parts: sub.parts });
    },
    fire(x, y, z, s = 1) { const p = world([x, y, z]); fires.push({ x: r4(p[0]), y: r4(p[1]), z: r4(p[2]), s }); },
    glow(x, y, z, color) { const p = world([x, y, z]); glows.push({ x: r4(p[0]), y: r4(p[1]), z: r4(p[2]), color }); },
    j: (v, amt = 0.1) => v * (1 + (rng() - 0.5) * 2 * amt),
    pick: list => list[Math.floor(rng() * list.length) % list.length],
    tone: (c, amt = 0.06) => shade(c, (rng() - 0.5) * 2 * amt),
  };
  return k;
}

// ---------------------------------------------------------------------------- shared pieces

function lichen(k, x, z, s = 0.3) { k.on('dome', x, 0, z, s * k.j(1, 0.3), s * 0.25, s * 0.8, k.pick([C.lichen, C.moss, '#7f8f4a'])); }
function post(k, x, z, h, t = 0.14, colour = C.woodD) { k.block(x, 0, z, t, h, t, colour); }
function plank(k, a, b, t, colour = C.wood) { k.beam(a, b, t, colour, 'box', { d: t * 0.45 }); }

function headstone(k, variant) {
  const st = k.tone(C.stoneL, 0.08);
  k.block(0, 0, 0, 0.82, 0.12, 0.32, k.tone(C.stoneD));           // plinth
  if (variant === 0) {        // rounded top
    k.block(0, 0.1, 0, 0.62, 0.72, 0.16, st);
    k.cylZ(0, 0.82, 0, 0.16, 0.62, st);
  } else if (variant === 1) { // cross on a short slab
    k.block(0, 0.1, 0, 0.5, 0.45, 0.16, st);
    k.block(0, 0.55, 0, 0.14, 0.62, 0.14, st);
    k.box(0, 0.92, 0, 0.5, 0.13, 0.13, st);
  } else {                    // square slab with a little gable cap
    k.block(0, 0.1, 0, 0.6, 0.8, 0.16, st);
    k.on('gable', 0, 0.9, 0, 0.66, 0.18, 0.2, shade(st, -0.08));
  }
  k.block(0, 0.42, 0.083, 0.3, 0.04, 0.01, shade(st, -0.25));     // the carved name line
  lichen(k, 0.18, 0.12, 0.3);
}

function fruitTree(k, crown, fruit, { blossom = false, h = 3.4 } = {}) {
  const lean = (k.rng() - 0.5) * 0.12;
  const H = k.j(h, 0.1), top = [lean * H, H * 0.5, 0];
  k.rod([0, 0, 0], top, 0.32, C.bark);
  for (let i = 0; i < 3; i++) {
    const a = i * 2.1 + k.rng();
    k.rod(top, [top[0] + Math.sin(a) * 0.9, H * 0.72, Math.cos(a) * 0.9], 0.13, C.bark);
  }
  const cy = H * 0.68, R = H * 0.42;
  k.ball(top[0], cy, 0, R, crown, 0.85);
  for (let i = 0; i < 4; i++) { const a = i * 1.57 + 0.4; k.ball(top[0] + Math.sin(a) * R * 0.6, cy - R * 0.1, Math.cos(a) * R * 0.6, R * 0.62, shade(crown, (i % 2 ? -0.07 : 0.06)), 0.85); }
  if (fruit) {
    for (let i = 0; i < 12; i++) {
      const a = i * 2.399, el = 0.25 + (i % 4) * 0.18;
      const rr = R * 0.98 * Math.cos(el);
      k.on('dome', top[0] + Math.sin(a) * rr * 1.05, cy + Math.sin(el) * R * 0.6 - 0.1, Math.cos(a) * rr * 1.05, blossom ? 0.34 : 0.18, blossom ? 0.12 : 0.13, blossom ? 0.34 : 0.18, fruit);
    }
    if (!blossom) for (let i = 0; i < 3; i++) { const a = k.rng() * 6.28, r = 0.8 + k.rng() * 1.2; k.on('dome', Math.sin(a) * r, 0, Math.cos(a) * r, 0.16, 0.09, 0.16, fruit); }
  }
}

function tent(k, w, h, d, colour) {
  k.on('gable', 0, 0, 0, w, h, d, colour);
  k.block(0, 0, d / 2 - 0.02, w * 0.36, h * 0.62, 0.04, C.void);          // the door gap
  k.on('gable', 0, 0, d / 2 + 0.01, w * 0.42, h * 0.72, 0.04, shade(colour, -0.2));
  for (const s of [-1, 1]) for (const z of [-d / 2, d / 2]) k.rod([s * w * 0.5, 0.05, z], [s * w * 0.9, 0.01, z * 1.15], 0.02, C.clothD);
  k.rod([0, h - 0.05, -d / 2 - 0.1], [0, h - 0.05, d / 2 + 0.1], 0.06, C.woodD);
}

function logPile(k, n, len, dia, colour = C.bark) {
  let row = 0, i = 0;
  while (i < n) {
    const inRow = Math.max(1, 4 - row);
    for (let c = 0; c < inRow && i < n; c++, i++) {
      const x = (c - (inRow - 1) / 2) * dia * 1.02;
      k.cylZ(x, dia / 2 + row * dia * 0.86, 0, k.j(len, 0.05), dia * k.j(1, 0.08), k.tone(colour, 0.08));
      k.on('cyl', x, dia / 2 + row * dia * 0.86, len / 2 - 0.01, dia * 0.86, 0.02, dia * 0.86, '#c8a878', { rx: Math.PI / 2 });   // pale cut end
    }
    row++;
  }
}

function waterWheel(k, R, width, speed = 0.5) {
  k.spinner(0, R + 0.25, 0, 'x', speed, s => {
    s.cylX(0, 0, 0, width + 0.6, 0.3, C.woodD);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      s.group(0, 0, 0, { rx: a }, () => {
        s.box(0, R, 0, width, 0.14, (2 * Math.PI * R) / 12 + 0.05, C.wood);
        s.box(0, R - 0.3, 0, width * 0.92, 0.6, 0.08, C.woodL);
        if (i % 2 === 0) for (const sx of [-1, 1]) s.box(sx * width * 0.42, R / 2, 0, 0.1, R, 0.12, C.woodD);
      });
    }
  });
}

// ---------------------------------------------------------------------------- the models

/** id -> [group, label, description, builder(k)] */
const MODELS = {
  // ------------------------------------------------------------ graveyard
  gravestone: ['graveyard', 'Gravestone', 'An upright weathered headstone, ~1.1 m, three shapes.', k => {
    k.group(0, 0, 0, { rz: (k.rng() - 0.5) * 0.06, rx: (k.rng() - 0.5) * 0.05 }, () => headstone(k, Math.floor(k.rng() * 3)));
  }],
  gravestone_leaning: ['graveyard', 'Leaning gravestone', 'A headstone tilted ~15 degrees and half sunk, moss on the low side.', k => {
    const side = k.rng() < 0.5 ? -1 : 1;
    k.group(0, -0.12, 0, { rz: side * k.j(0.26, 0.15), rx: (k.rng() - 0.5) * 0.15 }, () => headstone(k, k.rng() < 0.5 ? 0 : 2));
    k.on('dome', side * 0.35, 0, 0, 0.5, 0.12, 0.4, C.moss);
  }],
  tomb_chest: ['graveyard', 'Tomb chest', 'A waist-high stone box tomb with a carved lid and a cracked corner.', k => {
    const st = k.tone(C.stone);
    k.block(0, 0, 0, 1.2, 0.12, 2.3, C.stoneD);
    k.block(0, 0.12, 0, 0.95, 0.66, 2.05, st);
    for (const s of [-1, 1]) for (const e of [-1, 1]) k.block(s * 0.44, 0.12, e * 0.98, 0.12, 0.66, 0.12, shade(st, 0.08));
    k.block(0, 0.78, 0, 1.12, 0.12, 2.22, shade(st, -0.1));
    k.on('gable', 0, 0.9, 0, 0.8, 0.12, 1.9, shade(st, -0.05));
    k.block(0.4, 0.78, 0.92, 0.3, 0.13, 0.3, C.stoneD, { yaw: 0.4, rz: 0.2 });    // the cracked corner
    lichen(k, -0.5, 0.9, 0.4); lichen(k, 0.45, -1.0, 0.3);
  }],
  grave_slab: ['graveyard', 'Ledger slab', 'A flat stone ledger laid over a grave on a low plinth, edges worn round.', k => {
    const st = k.tone(C.stone);
    k.block(0, 0, 0, 1.0, 0.14, 2.1, C.stoneD);
    k.block(0, 0.14, 0, 0.9, 0.1, 1.95, st);
    k.block(0, 0.24, 0.55, 0.32, 0.02, 0.06, shade(st, -0.25)); k.block(0, 0.24, 0.55, 0.06, 0.02, 0.32, shade(st, -0.25));   // a carved cross
    lichen(k, 0.35, -0.7, 0.25);
  }],
  iron_fence: ['graveyard', 'Iron railing', 'A 2 m section of black wrought-iron railing with spear-point finials; tiles end to end.', k => {
    ironRun(k, -1, 1);
  }],
  iron_gate: ['graveyard', 'Iron gate', 'A 2.4 m double iron gate between two stone pillars with caps.', k => {
    for (const s of [-1, 1]) {
      k.block(s * 1.55, 0, 0, 0.6, 2.1, 0.6, C.stone);
      k.block(s * 1.55, 2.1, 0, 0.72, 0.14, 0.72, C.stoneD);
      k.on('hip', s * 1.55, 2.24, 0, 0.5, 0.35, 0.5, C.stoneD);
      lichen(k, s * 1.55 + 0.32, 0.1, 0.3);
    }
    for (const s of [-1, 1]) k.group(s * 1.2, 0, 0, { yaw: s * 0.25 }, () => {
      const L = 1.15;
      k.box(-s * L / 2, 0.15, 0, L, 0.05, 0.05, C.iron); k.box(-s * L / 2, 1.5, 0, L, 0.05, 0.05, C.iron);
      for (let i = 0; i <= 5; i++) {
        const x = -s * (i / 5) * L, h = 1.6 + Math.sin((i / 5) * Math.PI) * 0.3;
        k.block(x, 0, 0, 0.035, h, 0.035, C.iron);
        k.on('cone', x, h, 0, 0.08, 0.16, 0.08, C.iron);
      }
    });
  }],
  lychgate: ['graveyard', 'Lychgate', 'A roofed timber gateway into a churchyard, ~3 m wide, 3.2 m tall.', k => {
    for (const s of [-1, 1]) for (const z of [-0.7, 0.7]) post(k, s * 1.4, z, 2.4, 0.22, C.woodD);
    for (const s of [-1, 1]) k.box(s * 1.4, 2.45, 0, 0.22, 0.18, 1.8, C.wood);
    for (const z of [-0.7, 0.7]) k.box(0, 2.45, z, 3.1, 0.18, 0.2, C.wood);
    for (const s of [-1, 1]) k.beam([s * 1.4, 1.9, 0.7], [s * 0.9, 2.36, 0.7], 0.1, C.woodD);
    const pitch = Math.atan2(0.9, 1.2);
    for (const s of [-1, 1]) k.box(0, 2.98, s * 0.6, 3.6, 0.12, 1.6, C.shingle, { rx: s * pitch });
    k.on('gable', 0, 2.55, 0, 1.6, 0.82, 3.0, C.woodD, { yaw: Math.PI / 2 });
    k.box(0, 3.45, 0, 3.7, 0.12, 0.16, shade(C.shingle, -0.2));
    for (const s of [-1, 1]) k.block(s * 1.4, 0.45, 0, 0.3, 0.06, 1.2, C.plank);   // coffin rests
  }],
  crypt_door: ['graveyard', 'Crypt door', 'A low stone ossuary front set into an earth bank: pitched lintel, iron-banded door.', k => {
    k.on('dome', 0, -0.6, -1.6, 5.2, 3.0, 4.2, k.tone(C.moss));
    k.on('dome', 0, -0.4, -1.4, 3.8, 2.4, 3.2, k.tone(C.earth));
    for (const s of [-1, 1]) k.block(s * 1.0, 0, 0, 0.5, 2.0, 0.6, C.stone);
    k.on('gable', 0, 2.0, 0, 2.7, 0.8, 0.7, C.stoneD);
    k.block(0, 0, 0.05, 1.5, 1.95, 0.4, C.void);
    k.block(0, 0, 0.2, 1.2, 1.8, 0.08, C.woodD);
    for (const y of [0.35, 0.9, 1.45]) k.block(0, y, 0.25, 1.22, 0.08, 0.03, C.ironL);
    k.block(0.4, 0.85, 0.27, 0.12, 0.12, 0.04, C.rust);
    for (const s of [-1, 1]) k.block(s * 1.6, 0, 0.3, 0.6, 0.4, 0.4, C.stoneD, { yaw: s * 0.3 });
    lichen(k, -0.9, 0.35, 0.4);
  }],
  mausoleum: ['graveyard', 'Mausoleum', 'A small columned stone house of the dead: steps, four columns, a pediment roof and a bronze door.', k => {
    const st = k.tone(C.stoneW, 0.05);
    k.block(0, 0, 0, 4.6, 0.25, 5.6, C.stoneD);
    k.block(0, 0.25, 0.25, 4.2, 0.25, 5.0, C.stone);
    k.block(0, 0.5, -0.4, 3.6, 2.8, 3.6, st);
    for (const x of [-1.5, -0.5, 0.5, 1.5]) { k.on('cyl', x, 0.5, 1.9, 0.38, 2.8, 0.38, shade(st, 0.06)); k.block(x, 0.5, 1.9, 0.5, 0.14, 0.5, C.stone); k.block(x, 3.16, 1.9, 0.5, 0.14, 0.5, C.stone); }
    k.block(0, 3.3, 0.2, 4.0, 0.36, 4.6, shade(st, -0.05));
    k.on('gable', 0, 3.66, 0.2, 4.1, 1.2, 4.7, shade(st, -0.12));
    k.block(0, 4.85, 0.2, 0.3, 0.1, 4.8, C.stoneD);
    k.block(0, 0.5, 1.42, 1.3, 2.0, 0.08, '#5a4a2a');
    k.block(0, 1.4, 1.47, 0.08, 0.3, 0.03, C.gold);
    k.on('cone', 0, 4.86, 2.5, 0.3, 0.5, 0.3, st);
    for (const s of [-1, 1]) { k.block(s * 2.0, 0.25, 2.3, 0.5, 0.7, 0.5, C.stone); k.on('cyl', s * 2.0, 0.95, 2.3, 0.5, 0.4, 0.5, C.stoneD); }
    lichen(k, -1.8, 1.6, 0.5); lichen(k, 1.9, -2.0, 0.5);
  }],
  grave_cross: ['graveyard', 'Grave cross', 'A ringed stone cross over a grave, ~1.6 m.', k => {
    k.group(0, 0, 0, { rz: (k.rng() - 0.5) * 0.06 }, () => {
      k.block(0, 0, 0, 0.7, 0.25, 0.45, C.stoneD);
      k.block(0, 0.25, 0, 0.2, 1.4, 0.16, C.stoneL);
      k.box(0, 1.25, 0, 0.82, 0.18, 0.16, C.stoneL);
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; k.box(Math.sin(a) * 0.26, 1.25 + Math.cos(a) * 0.26, 0, 0.22, 0.08, 0.12, C.stone, { rz: -a }); }
      lichen(k, 0.2, 0.15, 0.3);
    });
  }],
  celtic_cross: ['graveyard', 'Ringed high cross', 'A tall ringed wayside cross, ~3 m, carved bands.', k => {
    k.block(0, 0, 0, 1.0, 0.5, 0.7, C.stoneD); k.on('frustum', 0, 0.5, 0, 0.7, 0.3, 0.5, C.stoneD);
    k.block(0, 0.8, 0, 0.32, 2.2, 0.22, C.stone);
    k.box(0, 2.45, 0, 1.3, 0.28, 0.22, C.stone);
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; k.box(Math.sin(a) * 0.42, 2.45 + Math.cos(a) * 0.42, 0, 0.3, 0.1, 0.16, C.stone, { rz: -a }); }
    for (const y of [1.2, 1.6, 2.0]) k.block(0, y, 0, 0.34, 0.05, 0.24, C.stoneD);
    lichen(k, 0.4, 0.3, 0.4);
  }],
  grave_obelisk: ['graveyard', 'Obelisk', 'A tapering stone obelisk on a stepped base, ~2.6 m.', k => {
    k.block(0, 0, 0, 1.0, 0.25, 1.0, C.stoneD); k.block(0, 0.25, 0, 0.8, 0.35, 0.8, C.stone);
    k.on('frustum', 0, 0.6, 0, 0.55, 1.8, 0.55, C.stoneL); k.on('hip', 0, 2.4, 0, 0.26, 0.3, 0.26, C.stoneL);
    lichen(k, 0.4, 0.4, 0.3);
  }],
  grave_mound: ['graveyard', 'Grave mound', 'A fresh rounded earth mound with a wooden marker, 2 m long.', k => {
    k.on('dome', 0, -0.05, 0, 1.0, 0.38, 2.0, k.tone(C.earth));
    k.block(0, 0, -1.05, 0.08, 0.9, 0.06, C.wood); k.box(0, 0.7, -1.05, 0.42, 0.07, 0.06, C.wood);
    k.on('dome', 0.25, 0.25, 0.3, 0.2, 0.08, 0.2, '#c9a04a');                      // a few flowers
  }],
  open_grave: ['graveyard', 'Open grave', 'A dug grave pit with spoil heaped beside it and a spade stuck in.', k => {
    k.block(0, -0.04, 0, 1.0, 0.06, 2.0, C.void);
    for (const s of [-1, 1]) k.block(s * 0.52, -0.02, 0, 0.06, 0.06, 2.1, C.earthD);
    k.on('dome', 1.05, 0, 0, 0.9, 0.62, 2.0, k.tone(C.earth));
    k.rod([1.0, 0.4, 0.3], [0.9, 1.3, 0.2], 0.05, C.wood);
    k.box(1.02, 0.32, 0.31, 0.22, 0.28, 0.03, C.ironL, { rz: 0.1 });
  }],
  bell_frame: ['graveyard', 'Bell frame', "A small bell hung in a two-post timber frame with a pull rope (the sexton's bell).", k => {
    for (const s of [-1, 1]) { post(k, s * 0.65, 0, 2.6, 0.2); k.beam([s * 0.65, 0, 0.45], [s * 0.65, 1.6, 0], 0.12, C.woodD); k.beam([s * 0.65, 0, -0.45], [s * 0.65, 1.6, 0], 0.12, C.woodD); }
    k.box(0, 2.55, 0, 1.6, 0.2, 0.22, C.wood);
    k.on('gable', 0, 2.65, 0, 0.6, 0.45, 1.8, C.shingle, { yaw: Math.PI / 2 });
    k.rod([0, 2.45, 0], [0, 2.25, 0], 0.04, C.iron);
    k.on('cone', 0, 1.75, 0, 0.62, 0.55, 0.62, '#8a6a30'); k.on('dome', 0, 2.1, 0, 0.36, 0.18, 0.36, '#8a6a30');
    k.rod([0.1, 0.4, 0], [0.1, 1.8, 0], 0.025, C.straw);
  }],
  // ------------------------------------------------------------ farm
  scarecrow: ['farm', 'Scarecrow', 'A cross of poles in a sack-head, ragged coat and straw hat, arms out, ~2.2 m.', k => {
    post(k, 0, 0, 2.0, 0.1, C.wood);
    k.box(0, 1.52, 0, 1.7, 0.08, 0.08, C.wood, { rz: (k.rng() - 0.5) * 0.12 });
    k.on('frustum', 0, 0.85, 0, 0.62, 0.75, 0.36, k.pick(['#6a5a40', '#5a4a3a', '#6a4a3a']));
    k.box(0, 1.52, 0, 1.25, 0.24, 0.26, '#5c4c36');
    for (const s of [-1, 1]) k.on('cone', s * 0.72, 1.38, 0, 0.18, 0.3, 0.14, C.straw, { rx: Math.PI });
    k.ball(0, 1.92, 0, 0.21, '#c2ab80');
    k.block(-0.07, 1.95, 0.19, 0.05, 0.05, 0.02, '#2a2018'); k.block(0.07, 1.95, 0.19, 0.05, 0.05, 0.02, '#2a2018');
    k.block(0, 2.06, 0, 0.66, 0.04, 0.66, C.straw); k.on('cone', 0, 2.08, 0, 0.36, 0.34, 0.36, C.straw);
    k.on('cone', 0, 0.85, 0, 0.5, 0.25, 0.3, C.straw, { rx: Math.PI });
  }],
  haystack: ['farm', 'Haystack', 'A rounded loose haystack about 2.5 m across with a pole through the top.', k => {
    const s = k.j(1, 0.1);
    k.on('cyl', 0, 0, 0, 2.6 * s, 0.9 * s, 2.6 * s, C.hayD);
    k.on('dome', 0, 0.85 * s, 0, 2.7 * s, 1.5 * s, 2.7 * s, C.hay);
    k.rod([0, 1.6 * s, 0], [0.05, 3.0 * s, 0.02], 0.08, C.woodD);
    for (let i = 0; i < 5; i++) { const a = i * 1.3; k.on('cone', Math.sin(a) * 1.2 * s, 0, Math.cos(a) * 1.2 * s, 0.5, 0.3, 0.5, C.straw); }
  }],
  hay_bale_round: ['farm', 'Round bale', 'A rolled bale of hay on its side, 1.5 m across.', k => {
    k.cylX(0, 0.72, 0, 1.2, 1.45, k.tone(C.hay));
    for (const s of [-1, 1]) k.cylX(s * 0.6, 0.72, 0, 0.02, 1.3, C.hayD);
  }],
  hay_bale_square: ['farm', 'Square bale', 'A small square bale tied with twine.', k => {
    k.block(0, 0, 0, 0.5, 0.42, 0.95, k.tone(C.hay));
    for (const z of [-0.22, 0.22]) k.block(0, 0, z, 0.52, 0.44, 0.03, C.hayD);
  }],
  haycart: ['farm', 'Hay cart', 'A two-wheeled farm cart heaped with hay, shafts down.', k => {
    k.block(0, 0.75, 0, 1.6, 0.12, 2.6, C.wood);
    for (const s of [-1, 1]) { k.block(s * 0.8, 0.85, 0, 0.08, 0.4, 2.6, C.woodD); k.cylX(s * 0.95, 0.6, -0.1, 0.1, 1.2, C.woodD); k.cylX(s * 0.95, 0.6, -0.1, 0.14, 0.2, C.iron); }
    k.cylX(0, 0.6, -0.1, 2.0, 0.1, C.iron);
    for (const s of [-1, 1]) k.beam([s * 0.5, 0.75, 1.3], [s * 0.45, 0.05, 2.9], 0.1, C.wood);
    k.on('dome', 0, 0.85, 0, 1.7, 1.1, 2.7, C.hay);
  }],
  sheaf_stook: ['farm', 'Stook', 'Wheat sheaves stood together to dry in the field.', k => {
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; k.group(Math.sin(a) * 0.18, 0, Math.cos(a) * 0.18, { yaw: a, rx: 0.22 }, () => { k.on('cone', 0, 0, 0, 0.32, 1.25, 0.32, k.tone(C.straw, 0.08)); k.block(0, 0.55, 0, 0.26, 0.06, 0.26, C.hayD); }); }
    k.on('cone', 0, 1.0, 0, 0.42, 0.4, 0.42, C.hay);
  }],
  beehive: ['farm', 'Beehive', 'A straw skep beehive on a little wooden stand.', k => {
    for (const s of [-1, 1]) for (const e of [-1, 1]) post(k, s * 0.25, e * 0.25, 0.5, 0.06);
    k.block(0, 0.5, 0, 0.7, 0.06, 0.7, C.wood);
    for (let i = 0; i < 4; i++) k.on('cyl', 0, 0.56 + i * 0.13, 0, 0.6 - i * 0.08, 0.13, 0.6 - i * 0.08, i % 2 ? C.hayD : C.straw);
    k.on('dome', 0, 1.08, 0, 0.3, 0.16, 0.3, C.straw);
    k.block(0, 0.56, 0.27, 0.12, 0.06, 0.04, C.void);
  }],
  cider_press: ['orchard', 'Cider press', 'A wooden screw press: a slatted tub, a big screw post and a turning bar, apples heaped beside.', k => {
    k.block(0, 0, 0, 1.6, 0.4, 1.6, C.woodD);
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; k.block(Math.sin(a) * 0.52, 0.4, Math.cos(a) * 0.52, 0.18, 0.7, 0.06, C.wood, { yaw: a }); }
    for (const y of [0.55, 0.95]) k.on('cyl', 0, y, 0, 1.15, 0.06, 1.15, C.iron);
    for (const s of [-1, 1]) post(k, s * 0.75, 0, 2.2, 0.18, C.woodD);
    k.box(0, 2.15, 0, 1.75, 0.22, 0.22, C.wood);
    k.on('cyl', 0, 1.1, 0, 0.14, 1.05, 0.14, '#5a4a3a');
    k.box(0, 1.15, 0, 0.9, 0.18, 0.9, C.woodL);
    k.box(0, 1.6, 0, 1.6, 0.08, 0.08, C.woodL);
    for (let i = 0; i < 6; i++) k.on('dome', 1.15 + (i % 3) * 0.2, 0, 0.3 + Math.floor(i / 3) * 0.22, 0.2, 0.15, 0.2, i % 2 ? '#a83a2a' : '#c8902a');
  }],
  barn: ['farm', 'Barn', 'A big gable barn of red-brown boards: wide front doors, a hayloft hatch, a stone footing.', k => {
    const W = 8, D = 12, H = 4.2, R = 3.0, wall = k.pick([C.barn, '#6a4a32', '#7a5238']);
    k.block(0, 0, 0, W + 0.3, 0.45, D + 0.3, C.stoneD);
    k.block(0, 0.4, 0, W, H - 0.4, D, wall);
    k.on('gable', 0, H, 0, W, R, D - 0.04, wall);
    const pitch = Math.atan2(R, W / 2), slab = Math.hypot(W / 2, R) + 0.45;
    for (const s of [-1, 1]) k.box(-s * (W / 4 + 0.08), H + R / 2 + 0.05, 0, slab, 0.16, D + 0.6, C.shingle, { rz: s * pitch });
    k.box(0, H + R + 0.08, 0, 0.3, 0.16, D + 0.65, shade(C.shingle, -0.2));
    for (const s of [-1, 1]) for (const e of [-1, 1]) k.block(s * (W / 2 - 0.05), 0.4, e * (D / 2 - 0.05), 0.2, H - 0.4, 0.2, C.white);
    for (const e of [-1, 1]) {
      const z = e * (D / 2 + 0.04);
      for (const s of [-1, 1]) {
        k.block(s * 0.82, 0.4, z, 1.6, 3.2, 0.08, shade(wall, -0.15));
        k.beam([s * 0.1, 0.5, z + e * 0.05], [s * 1.55, 3.5, z + e * 0.05], 0.12, C.white, 'box', { d: 0.04 });
        k.beam([s * 1.55, 0.5, z + e * 0.05], [s * 0.1, 3.5, z + e * 0.05], 0.12, C.white, 'box', { d: 0.04 });
      }
      k.block(0, 3.6, z, 3.4, 0.14, 0.1, C.white);
      k.block(0, H + 0.4, z, 1.3, 1.2, 0.1, shade(wall, -0.25));
    }
    k.box(0, H + R - 0.3, D / 2 + 0.5, 0.18, 0.18, 1.2, C.woodD);
    k.rod([0, H + R - 0.35, D / 2 + 1.0], [0, H + 1.0, D / 2 + 1.0], 0.03, C.straw);
    for (let i = 0; i < 6; i++) k.block(-W / 2 - 0.05, 2.2, -D / 2 + 1.5 + i * 1.8, 0.06, 0.06, 0.9, C.white);
  }],
  windmill: ['mill', 'Windmill', 'A stone tower mill with a timber cap and four canvas sails that turn.', k => {
    k.on('cyl', 0, 0, 0, 4.6, 0.6, 4.6, C.stoneD);
    k.on('cyl', 0, 0.6, 0, 4.2, 3.6, 4.2, k.tone(C.stoneW, 0.05));
    k.on('cyl', 0, 4.2, 0, 3.7, 3.4, 3.7, k.tone(C.stoneW, 0.05));
    k.on('cyl', 0, 7.6, 0, 3.9, 0.25, 3.9, C.woodD);
    k.on('gable', 0, 7.85, -0.1, 3.4, 1.9, 4.0, C.woodD);
    k.on('gable', 0, 7.85, -0.1, 3.0, 1.7, 4.3, C.shingle);
    k.block(0, 0.6, 2.06, 1.0, 1.9, 0.12, C.woodD);
    for (const y of [3.0, 5.6]) for (const a of [0.6, -0.9, 2.4]) k.block(Math.sin(a) * 1.92, y, Math.cos(a) * 1.92, 0.5, 0.7, 0.1, C.void, { yaw: a });
    k.cylZ(0, 8.4, 2.25, 0.9, 0.36, C.woodD);
    k.spinner(0, 8.4, 2.7, 'z', 0.55, s => {
      s.cylZ(0, 0, 0, 0.3, 0.6, C.woodD);
      for (let i = 0; i < 4; i++) s.group(0, 0, 0, { rz: i * Math.PI / 2 + 0.3 }, () => {
        s.box(0, 2.9, 0.05, 0.16, 5.9, 0.16, C.wood);
        s.box(0.48, 3.4, 0, 0.95, 4.6, 0.05, C.cloth);
        for (let j = 0; j < 4; j++) s.box(0.48, 1.4 + j * 1.3, 0.04, 1.0, 0.06, 0.06, C.woodD);
      });
    });
    k.beam([0, 7.8, -1.9], [0, 0.2, -5.0], 0.2, C.woodD);
  }],
  watermill_wheel: ['mill', 'Water wheel', 'A 4.5 m undershot water wheel on an axle, wooden paddles, turning slowly.', k => {
    waterWheel(k, 2.2, 0.8, 0.45);
    for (const s of [-1, 1]) { k.block(s * 0.7, 0, 0, 0.3, 2.6, 0.5, C.stoneD); k.box(s * 0.7, 2.6, 0, 0.34, 0.2, 0.6, C.woodD); }
  }],
  millstone: ['mill', 'Millstones', 'A pair of round grinding stones on a wooden frame, a grain hopper above.', k => {
    k.block(0, 0, 0, 1.8, 0.5, 1.8, C.woodD);
    k.on('cyl', 0, 0.5, 0, 1.4, 0.3, 1.4, C.stone); k.on('cyl', 0, 0.8, 0, 1.36, 0.28, 1.36, C.stoneL);
    k.on('cyl', 0, 1.08, 0, 0.25, 0.04, 0.25, C.void);
    for (const s of [-1, 1]) post(k, s * 0.8, 0, 2.0, 0.12);
    k.box(0, 1.95, 0, 1.8, 0.12, 0.14, C.wood);
    k.on('frustum', 0, 1.3, 0, 0.75, 0.65, 0.75, C.wood, { rx: Math.PI, yaw: 0 });
    k.on('dome', 0, 1.24, 0, 0.6, 0.08, 0.6, C.hay);
  }],
  sluice_gate: ['mill', 'Sluice gate', 'A timber sluice: two posts and a sliding board with a lever, set across a channel.', k => {
    for (const s of [-1, 1]) k.block(s * 1.0, -0.4, 0, 0.26, 2.2, 0.3, C.woodD);
    k.box(0, 1.75, 0, 2.3, 0.2, 0.3, C.wood);
    k.block(0, -0.3, 0, 1.75, 1.1, 0.1, C.woodL);
    for (const y of [-0.1, 0.4]) k.block(0, y, 0.06, 1.75, 0.08, 0.04, C.ironL);
    k.rod([0, 0.75, 0], [0, 1.85, 0], 0.08, C.iron);
    k.beam([0, 1.85, 0], [0.9, 2.3, 0.1], 0.07, C.wood);
  }],
  gear_housing: ['mill', 'Gear housing', 'A wooden casing with a big wooden cog wheel visible through a missing plank.', k => {
    k.block(0, 0, 0, 1.8, 1.8, 1.2, C.woodD);
    for (let i = 0; i < 5; i++) if (i !== 2) k.block(-0.72 + i * 0.36, 0.05, 0.61, 0.32, 1.7, 0.04, k.tone(C.wood));
    k.block(0, 1.8, 0, 2.0, 0.12, 1.4, C.wood);
    k.spinner(0, 0.95, 0.62, 'z', 0.7, s => {
      s.cylZ(0, 0, 0, 0.1, 1.2, C.woodL);
      for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; s.box(Math.sin(a) * 0.62, Math.cos(a) * 0.62, 0, 0.12, 0.16, 0.12, C.woodD, { rz: -a }); }
      s.cylZ(0, 0, 0.02, 0.14, 0.22, C.iron);
    });
  }],
  water_trough: ['farm', 'Water trough', 'A long stone or timber trough with water in it.', k => {
    const wood = k.rng() < 0.5;
    k.block(0, 0, 0, 0.8, 0.5, 2.0, wood ? C.wood : C.stone);
    k.block(0, 0.42, 0, 0.62, 0.06, 1.82, C.water);
    if (wood) for (const z of [-0.8, 0.8]) k.block(0, 0, z, 0.84, 0.52, 0.06, C.iron);
  }],
  well: ['farm', 'Well', 'A stone well ring with a little roof, a winch and a bucket.', k => {
    k.on('cyl', 0, 0, 0, 1.7, 0.8, 1.7, k.tone(C.stone));
    k.on('cyl', 0, 0.8, 0, 1.8, 0.1, 1.8, C.stoneD);
    k.on('cyl', 0, 0.82, 0, 1.3, 0.02, 1.3, '#1a2830');
    for (const s of [-1, 1]) post(k, s * 0.8, 0, 2.3, 0.14);
    k.cylX(0, 1.55, 0, 1.6, 0.14, C.wood); k.box(0.92, 1.55, 0.18, 0.06, 0.06, 0.4, C.iron);
    k.on('gable', 0, 2.25, 0, 1.4, 0.8, 2.2, C.shingle, { yaw: Math.PI / 2 });
    k.rod([0.2, 1.5, 0], [0.2, 1.0, 0], 0.02, C.straw); k.on('cyl', 0.2, 0.8, 0, 0.26, 0.24, 0.26, C.woodL);
  }],
  chicken_coop: ['farm', 'Chicken coop', 'A small raised hen house with a ramp and a wire run.', k => {
    for (const s of [-1, 1]) for (const e of [-1, 1]) post(k, s * 0.6, e * 0.45, 0.5, 0.08);
    k.block(0, 0.5, 0, 1.4, 0.8, 1.1, C.plank);
    k.on('shed', 0, 1.3, 0, 1.3, 0.4, 1.6, C.shingle, { yaw: Math.PI / 2 });
    k.block(0.3, 0.6, 0.56, 0.3, 0.35, 0.03, C.void);
    k.beam([0.3, 0.55, 0.6], [0.3, 0.0, 1.4], 0.32, C.wood, 'box', { d: 0.04 });
    for (const [x, z] of [[-1.6, 0.8], [-1.6, -0.6], [-0.8, 1.4]]) post(k, x, z, 0.9, 0.05, C.woodL);
    for (let i = 0; i < 3; i++) { const x = -1.1 + i * 0.35, z = 0.7 + (i % 2) * 0.3; k.ball(x, 0.15, z, 0.13, i ? '#e8e0d0' : '#a8603a'); k.on('cone', x, 0.27, z + 0.08, 0.05, 0.08, 0.05, '#c03a2a'); }
  }],
  pig_sty: ['farm', 'Pig sty', 'A low lean-to shelter and a muddy pen of rails.', k => {
    k.block(-1.0, 0, -0.9, 1.6, 1.0, 1.4, C.stoneD);
    k.on('shed', -1.0, 1.0, -0.9, 1.6, 0.45, 1.8, C.shingle, { yaw: Math.PI / 2 });
    k.block(-1.0, 0, -0.18, 0.6, 0.65, 0.02, C.void);
    k.block(0.3, -0.04, 0.6, 3.2, 0.06, 2.4, C.mud);
    for (const [ax, az, bx, bz] of [[-1.3, 1.8, 1.9, 1.8], [1.9, 1.8, 1.9, -0.6], [1.9, -0.6, 0.2, -0.6]]) {
      const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / 1.6));
      for (let i = 0; i <= n; i++) post(k, ax + (bx - ax) * i / n, az + (bz - az) * i / n, 0.9, 0.1);
      for (const y of [0.35, 0.75]) plank(k, [ax, y, az], [bx, y, bz], 0.1, C.wood);
    }
  }],
  goat_shed: ['farm', 'Goat shed', 'A small timber shed with a half door and a hay rack.', k => {
    k.block(0, 0, 0, 2.4, 1.8, 1.8, C.plank);
    k.on('gable', 0, 1.8, 0, 2.1, 0.9, 2.6, C.thatch, { yaw: Math.PI / 2 });
    k.block(0, 0, 0.91, 0.8, 0.9, 0.04, C.woodD);
    k.block(-0.8, 0.6, 0.95, 0.7, 0.5, 0.25, C.wood); k.block(-0.8, 0.85, 0.95, 0.6, 0.3, 0.2, C.hay);
  }],
  compost_heap: ['farm', 'Compost heap', 'A rotting heap of straw and peelings in a board bay, a fork stuck in.', k => {
    for (const [x, z, w, d] of [[0, -0.9, 2.0, 0.08], [-1.0, 0, 0.08, 1.8], [1.0, 0, 0.08, 1.8]]) k.block(x, 0, z, w, 0.7, d, C.woodD);
    k.on('dome', 0, 0, 0, 1.8, 0.75, 1.7, '#4e4632');
    k.on('dome', 0.2, 0.3, 0.1, 0.8, 0.4, 0.7, C.hayD);
    k.rod([0.3, 0.5, 0.2], [0.5, 1.6, 0.4], 0.04, C.wood);
  }],
  pumpkin_pile: ['farm', 'Pumpkin pile', 'A heap of harvested pumpkins and squashes.', k => {
    const spots = [[0, 0, 0.32], [0.55, 0.1, 0.26], [-0.5, 0.15, 0.28], [0.1, 0.6, 0.24], [0.2, 0.3, 0.22]];
    spots.forEach(([x, z, r], i) => { const y = i === 4 ? 0.36 : 0; k.ball(x, y + r * 0.4, z, r, i % 3 === 2 ? '#b8a040' : k.tone('#d0702a'), 0.75); k.on('cyl', x, y + r * 1.1, z, 0.05, 0.1, 0.05, '#4a5a2a'); });
  }],
  // ------------------------------------------------------------ orchard
  apple_tree: ['orchard', 'Apple tree', 'A short broad orchard apple tree, ~3.5 m, round crown with red fruit and a few windfalls.', k => fruitTree(k, k.tone(C.leaf), '#b82a20')],
  pear_tree: ['orchard', 'Pear tree', 'A taller narrow pear tree with yellow-green fruit.', k => fruitTree(k, k.tone('#5f8240'), '#c8c040', { h: 4.2 })],
  plum_tree: ['orchard', 'Plum tree', 'A small dark-leaved plum tree with purple fruit.', k => fruitTree(k, k.tone('#4a6a34'), '#5a2a5a', { h: 3.0 })],
  cherry_tree: ['orchard', 'Cherry tree', 'A cherry tree in pink blossom.', k => fruitTree(k, k.tone('#6a8a44'), '#f0b0c8', { blossom: true, h: 3.6 })],
  orchard_ladder: ['orchard', 'Orchard ladder', 'A tall tapering picking ladder leaned on a prop.', k => {
    const lean = 0.28;
    k.group(0, 0, 0, { rx: -lean }, () => {
      for (const s of [-1, 1]) k.beam([s * 0.32, 0, 0], [s * 0.12, 3.4, 0], 0.07, C.woodL);
      for (let i = 1; i < 10; i++) { const t = i / 10, hw = 0.32 - 0.2 * t; k.box(0, 3.4 * t, 0, hw * 2, 0.04, 0.05, C.wood); }
    });
    k.beam([0, 0, -1.6], [0, 3.15, -0.88], 0.06, C.wood);
  }],
  fruit_crate: ['orchard', 'Fruit crates', 'Stacked slatted crates of picked fruit.', k => {
    const crate = (x, y, z, fruit, yaw = 0) => {
      k.group(x, y, z, { yaw }, () => {
        for (const yy of [0.04, 0.2]) for (const s of [-1, 1]) k.block(0, yy, s * 0.27, 0.66, 0.1, 0.03, C.woodL);
        for (const s of [-1, 1]) k.block(s * 0.32, 0, 0, 0.03, 0.36, 0.56, C.wood);
        k.block(0, 0, 0, 0.6, 0.04, 0.5, C.woodD);
        if (fruit) for (let i = 0; i < 4; i++) k.on('dome', -0.18 + (i % 2) * 0.36, 0.26, -0.1 + Math.floor(i / 2) * 0.2, 0.22, 0.1, 0.22, fruit);
      });
    };
    crate(0, 0, 0, '#b82a20'); crate(0.7, 0, 0.05, '#c8c040', 0.1); crate(0.3, 0.37, 0, '#b82a20', -0.08);
  }],
  // ------------------------------------------------------------ shrine
  standing_stone: ['shrine', 'Standing stone', 'A rough grey megalith 2.5-3.5 m tall, lichen-spotted, tapered, leaning a little.', k => {
    const h = k.j(3.0, 0.15), w = k.j(1.0, 0.15);
    k.group(0, -0.25, 0, { rz: (k.rng() - 0.5) * 0.16, rx: (k.rng() - 0.5) * 0.1, yaw: k.rng() * 0.5 }, () => {
      k.on('frustum', 0, 0, 0, w, h * 0.75, w * 0.7, k.tone(C.stoneD));
      k.on('hip', 0, h * 0.75, 0, w * 0.45, h * 0.25, w * 0.32, k.tone(C.stoneD));
      lichen(k, w * 0.2, w * 0.25, 0.4);
      k.box(0, h * 0.4, w * 0.3, w * 0.4, 0.3, 0.2, C.lichen, { rx: -0.1 });
    });
  }],
  altar_stone: ['shrine', 'Altar stone', 'A flat recumbent slab on two low stones, worn hollow in the middle.', k => {
    for (const s of [-1, 1]) k.block(s * 0.8, 0, 0, 0.55, 0.55, 0.95, k.tone(C.stoneD), { yaw: s * 0.06 });
    k.block(0, 0.55, 0, 2.4, 0.26, 1.2, C.stone, { rz: 0.02 });
    k.block(0, 0.8, 0, 0.9, 0.02, 0.5, C.stoneD);
    lichen(k, -1.0, 0.5, 0.35);
    for (const x of [-0.8, 0.85]) { k.on('cyl', x, 0.81, 0.35, 0.09, 0.18, 0.09, '#e8dcc0'); }
  }],
  shrine_statue: ['shrine', 'Shrine statue', 'A 2.2 m stone figure of a hooded mother holding a bowl to her chest, on a plinth.', k => {
    const st = '#9a958a';
    k.block(0, 0, 0, 1.1, 0.2, 1.1, C.stoneD); k.block(0, 0.2, 0, 0.9, 0.5, 0.9, C.stone);
    k.on('frustum', 0, 0.7, 0, 0.78, 1.15, 0.6, st);
    k.on('cone', 0, 0.7, 0, 0.95, 0.4, 0.8, shade(st, -0.05));
    k.on('cyl', 0, 1.82, 0, 0.42, 0.15, 0.4, st);
    k.ball(0, 2.1, 0.02, 0.21, st);
    k.on('cone', 0, 1.9, -0.04, 0.58, 0.62, 0.56, shade(st, -0.08));             // the hood
    k.block(0, 1.98, 0.17, 0.22, 0.24, 0.06, '#5a5650');                         // the face in shadow
    for (const s of [-1, 1]) k.beam([s * 0.3, 1.75, 0.05], [s * 0.1, 1.45, 0.34], 0.12, st, 'cyl');
    k.on('cyl', 0, 1.45, 0.34, 0.36, 0.1, 0.36, shade(st, 0.1));
    k.on('cyl', 0, 1.53, 0.34, 0.28, 0.02, 0.28, '#7a9ab0');
    lichen(k, 0.4, 0.45, 0.35);
    for (let i = 0; i < 3; i++) k.on('dome', -0.3 + i * 0.3, 0.7, 0.42, 0.12, 0.06, 0.12, k.pick(['#e8c040', '#d06080', '#f0f0e0']));
  }],
  offering_bowl: ['shrine', 'Offering bowl', 'A shallow stone bowl on a short pillar, coins and flowers in it.', k => {
    k.on('cyl', 0, 0, 0, 0.42, 0.12, 0.42, C.stoneD); k.on('cyl', 0, 0.12, 0, 0.26, 0.66, 0.26, C.stone);
    k.on('cyl', 0, 0.62, 0, 0.8, 0.18, 0.8, C.stoneL);
    k.on('cyl', 0, 0.8, 0, 0.62, 0.02, 0.62, '#4a4a40');
    for (let i = 0; i < 5; i++) k.on('cyl', -0.2 + i * 0.1, 0.81, (i % 2) * 0.1, 0.07, 0.015, 0.07, C.gold);
    k.on('dome', 0.15, 0.81, -0.12, 0.12, 0.06, 0.12, '#d06080');
  }],
  prayer_cairn: ['shrine', 'Prayer cairn', 'A knee-high heap of flat painted pebbles, each with a scratched wish.', k => {
    const cols = ['#9a8f80', '#b0a490', '#8a3a2a', '#3a5a8a', '#c8a040', '#d8d0b8'];
    let y = 0;
    for (let i = 0; i < 7; i++) { const w = 0.9 - i * 0.11; k.on('cyl', (k.rng() - 0.5) * 0.08, y, (k.rng() - 0.5) * 0.08, w, 0.1, w * 0.85, i < 2 ? cols[i] : k.pick(cols), { yaw: k.rng() * 3, rz: (k.rng() - 0.5) * 0.08 }); y += 0.095; }
    for (let i = 0; i < 6; i++) { const a = i; k.on('cyl', Math.sin(a) * 0.65, 0, Math.cos(a) * 0.65, 0.2, 0.06, 0.16, k.pick(cols)); }
  }],
  wayside_shrine: ['shrine', 'Wayside shrine', 'A small roofed post by the road with a painted icon and a candle.', k => {
    k.block(0, 0, 0, 0.4, 0.25, 0.4, C.stoneD);
    post(k, 0, 0, 1.35, 0.16, C.woodD);
    k.block(0, 1.3, 0, 0.6, 0.55, 0.4, C.wood);
    k.block(0, 1.38, 0.18, 0.4, 0.4, 0.05, C.void);
    k.block(0, 1.42, 0.19, 0.22, 0.3, 0.02, '#c8a040');
    k.on('gable', 0, 1.85, 0, 0.58, 0.36, 0.8, C.shingle, { yaw: Math.PI / 2 });
    k.on('cyl', 0.12, 1.38, 0.12, 0.05, 0.1, 0.05, '#efe6cc');
    k.glow(0.12, 1.55, 0.14, '#ffc070');
  }],
  sigil_slab: ['shrine', 'Sigil slab', 'A cracked floor slab carved with a ring of unreadable marks that faintly glow violet at night.', k => {
    k.block(0, -0.02, 0, 2.3, 0.16, 2.3, '#5a5260');
    k.block(0.45, 0.13, 0.2, 1.1, 0.02, 0.04, '#2a2430', { yaw: 0.7 });
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; k.block(Math.sin(a) * 0.78, 0.14, Math.cos(a) * 0.78, 0.18, 0.015, 0.06, C.violet, { yaw: a, tag: 'glow' }); }
    k.on('cyl', 0, 0.14, 0, 0.5, 0.015, 0.5, '#4a3a62');
    k.glow(0, 0.4, 0, '#9a6aff');
    lichen(k, -0.9, -0.8, 0.4);
  }],
  // ------------------------------------------------------------ ruins
  broken_tower: ['ruins', 'Broken tower', 'The stump of a round stone tower, 6-7 m, the top bitten off, scorched, one empty window.', k => {
    const R = 2.2, n = 14;
    k.on('cyl', 0, -0.3, 0, R * 2 + 0.3, 1.0, R * 2 + 0.3, C.stoneD);
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2, h = 3.5 + Math.abs(Math.sin(i * 1.7 + k.rng())) * 3.2 * (i < n / 2 ? 1 : 0.6);
      k.block(Math.sin(a) * R, 0, Math.cos(a) * R, 1.05, h, 0.7, k.tone(i % 3 ? C.stoneD : '#5a5650'), { yaw: a });
    }
    k.on('cyl', 0, 0, 0, R * 1.6, 0.1, R * 1.6, C.earthD);
    k.block(0, 3.0, R + 0.02, 0.6, 1.1, 0.6, C.void);
    for (let i = 0; i < 5; i++) { const a = 2.0 + i * 0.5; k.block(Math.sin(a) * (R + 1.2), 0, Math.cos(a) * (R + 1.2), 0.7, 0.4, 0.5, C.stoneD, { yaw: a, rz: 0.2 }); }
    lichen(k, R, 0.5, 0.6);
  }],
  collapsed_stair: ['ruins', 'Collapsed stair', 'A stone stair climbing a broken wall to nowhere, the top steps fallen into rubble.', k => {
    k.block(-0.9, 0, -0.6, 0.6, 2.8, 3.4, C.stoneD);
    for (let i = 0; i < 6; i++) k.block(0, i * 0.42, 1.2 - i * 0.45, 1.3, 0.42, 0.45, k.tone(C.stone));
    for (let i = 0; i < 6; i++) k.block(0.2 + (k.rng() - 0.5) * 1.6, 0, -1.8 - k.rng() * 1.2, 0.5, 0.35, 0.45, C.stone, { yaw: k.rng() * 3, rz: (k.rng() - 0.5) * 0.4 });
    lichen(k, -0.6, 1.4, 0.4);
  }],
  ruined_wall: ['ruins', 'Ruined wall', 'A 3 m stretch of broken masonry wall with a jagged top.', k => {
    const n = 5;
    for (let i = 0; i < n; i++) k.block(-1.2 + i * 0.6, 0, 0, 0.62, 0.6 + Math.abs(Math.sin(i * 1.9 + k.rng() * 2)) * 2.2, 0.7, k.tone(C.stoneD));
    k.block(0, 0, 0, 3.1, 0.4, 0.85, C.stone);
    for (let i = 0; i < 3; i++) k.block(-1 + k.rng() * 2, 0, 0.8 + k.rng() * 0.5, 0.45, 0.3, 0.4, C.stoneD, { yaw: k.rng() * 3 });
    lichen(k, 0.6, 0.4, 0.4);
  }],
  ruined_arch: ['ruins', 'Ruined arch', 'A lone stone archway, one shoulder cracked, standing in rubble.', k => {
    for (const s of [-1, 1]) k.block(s * 1.4, 0, 0, 0.8, 3.0, 0.8, k.tone(C.stoneD));
    for (let i = 0; i < 7; i++) { const a = (i / 6 - 0.5) * Math.PI; k.box(Math.sin(a) * 1.4, 3.0 + Math.cos(a) * 1.0, 0, 0.75, 0.55, 0.8, C.stone, { rz: -a }); }
    k.block(1.9, 0, 0.6, 0.6, 0.5, 0.6, C.stoneD, { yaw: 0.5, rz: 0.3 });
    lichen(k, -1.4, 0.45, 0.4);
  }],
  fallen_column: ['ruins', 'Fallen column', 'A toppled fluted column in three drums, its capital beside it.', k => {
    for (let i = 0; i < 3; i++) k.cylX(-1.6 + i * 1.25, 0.32, (k.rng() - 0.5) * 0.3, 1.15, 0.66, k.tone(C.stoneW), { yaw: (k.rng() - 0.5) * 0.2 });
    k.block(2.3, 0, 0.2, 0.9, 0.35, 0.9, C.stone, { yaw: 0.4 });
    k.block(-2.6, 0, 0, 0.9, 0.5, 0.9, C.stoneD);
    lichen(k, 0, 0.4, 0.4);
  }],
  rubble_heap: ['ruins', 'Rubble heap', 'A heap of fallen dressed stones and broken blocks.', k => {
    k.on('dome', 0, 0, 0, 2.6, 0.7, 2.2, C.earthD);
    for (let i = 0; i < 9; i++) { const a = i * 2.4, r = k.rng() * 1.0; k.block(Math.sin(a) * r, 0.1 + (1 - r) * 0.3, Math.cos(a) * r, k.j(0.6, 0.3), k.j(0.35, 0.3), k.j(0.45, 0.3), k.tone(C.stoneD, 0.1), { yaw: k.rng() * 3, rz: (k.rng() - 0.5) * 0.6 }); }
  }],
  // ------------------------------------------------------------ lumber
  saw_pit: ['lumber', 'Saw pit', 'A long pit with a log on trestles across it and a two-man saw; sawdust heap.', k => {
    k.block(0, -0.05, 0, 1.7, 0.06, 4.3, C.void);
    for (const s of [-1, 1]) k.block(s * 0.95, 0, 0, 0.3, 0.2, 4.5, C.woodD);
    for (const z of [-1.4, 1.4]) { k.box(0, 0.6, z, 2.2, 0.16, 0.2, C.wood); for (const s of [-1, 1]) k.beam([s * 1.0, 0, z], [s * 0.6, 0.55, z], 0.1, C.woodD); }
    k.cylZ(0, 0.98, 0, 4.4, 0.6, C.bark);
    k.on('cyl', 0, 0.98, 2.19, 0.5, 0.02, 0.5, '#c8a878', { rx: Math.PI / 2 });
    k.block(0, 0.4, 0.4, 0.04, 1.5, 0.3, C.ironL);
    k.box(0, 1.95, 0.4, 0.5, 0.06, 0.06, C.wood); k.box(0, 0.45, 0.4, 0.5, 0.06, 0.06, C.wood);
    k.on('dome', 1.5, 0, 1.2, 1.0, 0.3, 0.9, '#c8b088');
  }],
  log_stack: ['lumber', 'Log stack', 'A neat pyramid of felled trunks, bark on, ~4 m long, chocked with wedges.', k => {
    logPile(k, 9, 4.2, 0.5);
    for (const s of [-1, 1]) k.block(s * 1.1, 0, 0, 0.2, 0.3, 0.3, C.woodL, { rz: s * 0.3 });
  }],
  tree_stump: ['lumber', 'Tree stump', 'A fresh-cut stump, pale top, sometimes an axe left in it.', k => {
    const r = k.j(0.42, 0.15);
    k.on('cyl', 0, 0, 0, r * 2, 0.5, r * 2, C.bark);
    k.on('cyl', 0, 0.5, 0, r * 1.8, 0.02, r * 1.8, '#c8a878');
    for (let i = 0; i < 4; i++) { const a = i * 1.6 + k.rng(); k.beam([Math.sin(a) * r * 0.8, 0.12, Math.cos(a) * r * 0.8], [Math.sin(a) * (r + 0.4), -0.02, Math.cos(a) * (r + 0.4)], 0.14, C.bark, 'cyl'); }
    if (k.rng() < 0.5) { k.rod([0.05, 0.5, 0], [0.35, 1.1, 0.1], 0.05, C.wood); k.box(0.05, 0.56, 0, 0.26, 0.16, 0.03, C.ironL, { rz: -0.5 }); }
  }],
  axe_block: ['lumber', 'Chopping block', 'A broad stump chopping block with an axe bitten into it and split logs around.', k => {
    k.on('cyl', 0, 0, 0, 0.8, 0.6, 0.8, C.bark); k.on('cyl', 0, 0.6, 0, 0.72, 0.02, 0.72, '#c8a878');
    k.rod([0.05, 0.6, 0], [0.45, 1.25, 0.1], 0.05, C.woodL); k.box(0.07, 0.68, 0, 0.3, 0.18, 0.03, C.ironL, { rz: -0.55 });
    for (let i = 0; i < 5; i++) { const a = i * 1.2 + 0.4; k.cylZ(Math.sin(a) * 0.9, 0.1, Math.cos(a) * 0.9, 0.5, 0.2, k.tone('#a88a62'), { yaw: a }); }
  }],
  felled_log: ['lumber', 'Felled log', 'A long felled trunk lying on the ground, a few lopped branch stubs.', k => {
    const L = k.j(6, 0.1);
    k.cylZ(0, 0.38, 0, L, 0.75, C.bark, { yaw: (k.rng() - 0.5) * 0.3 });
    k.on('cyl', 0, 0.38, L / 2, 0.66, 0.02, 0.66, '#c8a878', { rx: Math.PI / 2 });
    for (let i = 0; i < 3; i++) k.rod([0, 0.55, -1.5 + i * 1.4], [0.3 * (i % 2 ? 1 : -1), 0.95, -1.4 + i * 1.4], 0.12, C.bark);
  }],
  plank_stack: ['lumber', 'Plank stack', 'Sawn planks stacked with spacer sticks to season.', k => {
    for (let r = 0; r < 5; r++) {
      for (let i = 0; i < 4; i++) k.block(-0.6 + i * 0.4, 0.15 + r * 0.12, 0, 0.36, 0.06, 3.0, k.tone(C.plank, 0.05));
      for (const z of [-1.2, 0, 1.2]) k.block(0, 0.21 + r * 0.12, z, 1.7, 0.06, 0.06, C.woodD);
    }
    for (const z of [-1.2, 0, 1.2]) k.block(0, 0, z, 1.7, 0.15, 0.15, C.woodD);
  }],
  timber_sled: ['lumber', 'Timber sled', 'A drag sled for hauling logs out of the wood, two logs chained on.', k => {
    for (const s of [-1, 1]) k.block(s * 0.6, 0, 0, 0.14, 0.18, 2.6, C.woodD);
    for (const z of [-1.0, 0, 1.0]) k.block(0, 0.18, z, 1.4, 0.1, 0.16, C.wood);
    k.cylZ(-0.25, 0.52, 0, 3.0, 0.45, C.bark); k.cylZ(0.25, 0.52, 0.1, 2.8, 0.42, k.tone(C.bark));
    k.cylX(0, 0.55, 0.6, 1.1, 0.04, C.iron);
    k.beam([0, 0.15, 1.3], [0, 0.05, 2.6], 0.1, C.woodL);
  }],
  lumber_tent: ['lumber', 'Lumber tent', 'A canvas wall tent for the woodcutters, rolled flap, a stool outside.', k => {
    k.block(0, 0, 0, 2.6, 0.9, 3.0, C.cloth);
    k.on('gable', 0, 0.9, 0, 2.7, 1.2, 3.1, shade(C.cloth, -0.06));
    k.block(0, 0, 1.51, 1.0, 1.5, 0.03, C.void);
    k.cylX(0, 1.85, 1.52, 1.1, 0.16, C.clothD);
    for (const s of [-1, 1]) { k.rod([0, 2.1, s * 1.6], [0, 0, s * 1.6], 0.06, C.woodD); k.rod([s * 1.35, 0.9, 1.55], [s * 1.9, 0, 2.0], 0.02, C.clothD); }
    k.on('cyl', 1.0, 0, 2.1, 0.4, 0.4, 0.4, C.bark);
  }],
  grindstone: ['lumber', 'Grindstone', 'A round whetstone wheel in a wooden frame with a foot treadle and a water trough.', k => {
    for (const s of [-1, 1]) for (const z of [-0.3, 0.3]) post(k, s * 0.2, z, 0.8, 0.08);
    k.block(0, 0.4, 0, 0.5, 0.06, 0.7, C.wood);
    k.block(0, 0.2, 0.55, 0.4, 0.25, 0.5, C.woodD); k.block(0, 0.4, 0.55, 0.32, 0.03, 0.42, C.water);
    k.cylX(0, 0.85, 0, 0.18, 0.9, C.stoneL); k.cylX(0, 0.85, 0, 0.6, 0.06, C.iron);
    k.beam([0.3, 0.85, 0], [0.45, 0.7, 0.2], 0.04, C.iron);
    k.beam([0, 0.08, -0.5], [0, 0.18, 0.4], 0.12, C.wood);
  }],
  // ------------------------------------------------------------ hunting
  hunters_tent: ['hunt', "Hunter's tent", 'A low A-frame hide tent, stained, guy ropes, a pelt over the door.', k => {
    tent(k, 2.8, 1.7, 3.2, k.tone(C.hide));
    k.block(0.55, 0.2, 1.62, 0.6, 0.9, 0.04, '#5a4030', { rz: 0.12 });
  }],
  skinning_frame: ['hunt', 'Skinning frame', 'A pole frame with a stretched hide lashed inside it, knives on a stump beside.', k => {
    for (const s of [-1, 1]) post(k, s * 0.9, 0, 2.0, 0.12, C.wood);
    k.box(0, 1.9, 0, 2.0, 0.1, 0.1, C.wood); k.box(0, 0.35, 0, 2.0, 0.1, 0.1, C.wood);
    k.box(0, 1.12, 0, 1.45, 1.2, 0.04, '#9a7450');
    for (let i = 0; i < 6; i++) k.rod([-0.85, 0.6 + i * 0.22, 0], [-0.7, 0.62 + i * 0.22, 0], 0.02, C.straw);
    k.on('cyl', 1.4, 0, 0.4, 0.5, 0.5, 0.5, C.bark); k.block(1.4, 0.5, 0.4, 0.3, 0.02, 0.04, C.ironL, { yaw: 0.5 });
  }],
  trophy_post: ['hunt', 'Trophy post', "A tall post hung with antlers, skulls and a boar-tusk necklace; the hunters' boast board.", k => {
    post(k, 0, 0, 3.1, 0.26, C.woodD);
    k.box(0, 2.6, 0, 1.4, 0.16, 0.16, C.wood);
    for (const s of [-1, 1]) { k.rod([s * 0.1, 2.85, 0.1], [s * 0.55, 3.35, 0.1], 0.05, C.bone); k.rod([s * 0.35, 3.1, 0.1], [s * 0.45, 3.45, 0.2], 0.04, C.bone); }
    k.ball(0, 2.85, 0.16, 0.14, C.bone);
    for (const x of [-0.55, 0.55]) { k.rod([x, 2.6, 0], [x, 2.25, 0], 0.02, C.straw); k.ball(x, 2.15, 0, 0.11, C.bone); }
    for (let i = 0; i < 5; i++) k.on('cone', -0.2 + i * 0.1, 1.85, 0.14, 0.04, 0.14, 0.04, '#e8e0c8', { rx: Math.PI });
  }],
  smoking_rack: ['hunt', 'Smoking rack', 'A smoke-blackened pole rack over a smouldering pit, strips of meat and fish hanging.', k => {
    for (const s of [-1, 1]) { k.beam([s * 1.1, 0, -0.4], [s * 1.05, 1.6, 0], 0.08, '#3a2e24'); k.beam([s * 1.1, 0, 0.4], [s * 1.05, 1.6, 0], 0.08, '#3a2e24'); }
    k.box(0, 1.56, 0, 2.3, 0.08, 0.08, '#3a2e24');
    for (let i = 0; i < 8; i++) { const x = -0.9 + i * 0.26; k.box(x, 1.25, 0, 0.12, 0.55, 0.03, i % 3 === 0 ? '#9a8a6a' : '#7a3a2a'); }
    k.on('cyl', 0, -0.02, 0, 1.3, 0.08, 1.3, '#2a2420');
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; k.block(Math.sin(a) * 0.68, 0, Math.cos(a) * 0.68, 0.25, 0.18, 0.2, C.stoneD, { yaw: a }); }
    k.fire(0, 0.15, 0, 0.6);
  }],
  bone_heap: ['hunt', 'Bone heap', 'A knee-high heap of gnawed sheep and deer bones, a few collars and a boot.', k => {
    k.on('dome', 0, 0, 0, 1.6, 0.45, 1.5, '#a89a80');
    for (let i = 0; i < 10; i++) { const a = i * 2.4, r = k.rng() * 0.7; k.cylX(Math.sin(a) * r, 0.1 + (0.7 - r) * 0.4, Math.cos(a) * r, k.j(0.5, 0.3), 0.06, C.bone, { yaw: k.rng() * 3, rx: (k.rng() - 0.5) * 0.5 }); }
    k.ball(0.2, 0.42, 0.1, 0.12, C.bone); k.ball(-0.5, 0.15, 0.55, 0.1, C.bone);
    k.block(0.7, 0, -0.3, 0.14, 0.3, 0.26, '#3a2a1e');
  }],
  den_mouth: ['hunt', 'Den mouth', 'A low earth-and-root overhang hollow big enough for a horse-sized hound, bones at the lip.', k => {
    k.on('dome', 0, -0.6, -1.0, 7.0, 3.6, 5.2, k.tone(C.earth));
    k.on('dome', -2.2, -0.4, 0.2, 2.6, 1.8, 2.4, C.stoneD); k.on('dome', 2.4, -0.4, 0.0, 2.4, 1.6, 2.2, C.stoneD);
    k.on('dome', 0, -0.5, 1.4, 2.8, 2.1, 1.0, C.void);
    for (let i = 0; i < 5; i++) k.rod([-1.4 + i * 0.7, 2.4, 1.0], [-1.3 + i * 0.7 + (k.rng() - 0.5) * 0.4, 1.3, 1.7], 0.07, C.bark);
    for (let i = 0; i < 5; i++) k.cylX(-0.8 + i * 0.4, 0.04, 2.2 + (k.rng() - 0.5) * 0.4, 0.45, 0.06, C.bone, { yaw: k.rng() * 3 });
  }],
  // ------------------------------------------------------------ fishing
  jetty: ['fishing', 'Jetty', 'A plank jetty on posts, 6 m long and 1.6 m wide, running out over the water.', k => {
    for (let i = 0; i < 12; i++) k.block(0, 0.3, -2.75 + i * 0.5, 1.6, 0.1, 0.46, k.tone(C.plank, 0.07), { yaw: (k.rng() - 0.5) * 0.02 });
    for (const s of [-1, 1]) { k.block(s * 0.72, 0.18, 0, 0.12, 0.14, 6.0, C.woodD); for (const z of [-2.6, 0, 2.6]) k.block(s * 0.72, -0.6, z, 0.2, 1.3, 0.2, C.woodD); }
    for (const s of [-1, 1]) k.block(s * 0.72, 0.4, 2.85, 0.16, 0.6, 0.16, C.woodD);
    k.rod([0.72, 0.85, 2.85], [0.9, 0.35, 3.3], 0.03, C.straw);
  }],
  rowboat: ['fishing', 'Rowboat', 'A small clinker rowboat, oars shipped, pulled up or moored.', k => {
    const col = k.pick([C.wood, '#5a4a3a', '#4a5a6a']);
    k.on('frustum', 0, 0.5, 0, 1.1, 0.5, 2.8, col, { rx: Math.PI });
    k.block(0, 0, 0, 0.7, 0.12, 2.3, shade(col, -0.2));
    for (const s of [-1, 1]) k.box(s * 0.62, 0.42, 0, 0.08, 0.12, 3.0, shade(col, 0.1), { yaw: 0 });
    k.on('cone', 0, 0.27, 1.35, 0.5, 0.5, 0.5, col, { rx: Math.PI / 2 });
    for (const z of [-0.5, 0.4]) k.block(0, 0.3, z, 1.15, 0.06, 0.28, C.plank);
    for (const s of [-1, 1]) k.beam([s * 0.35, 0.42, -0.8], [s * 0.3, 0.42, 1.2], 0.06, C.woodL);
  }],
  fish_trap: ['fishing', 'Fish traps', 'Wicker funnel fish traps on a rope, some stacked on the bank.', k => {
    const trap = (x, y, z, yaw) => { k.group(x, y, z, { yaw }, () => { k.cylZ(0, 0.28, 0, 0.7, 0.56, C.hay); k.on('cone', 0, 0.28, 0.35, 0.56, 0.45, 0.56, C.hayD, { rx: Math.PI / 2 }); for (const zz of [-0.25, 0.1]) k.cylZ(0, 0.28, zz, 0.04, 0.6, C.woodD); }); };
    trap(0, 0, 0, 0.2); trap(0.7, 0, 0.2, -0.3); trap(0.35, 0.5, 0.1, 0.1);
    k.rod([0, 0.3, -0.4], [-0.6, 0.02, -1.3], 0.025, C.straw);
  }],
  rod_rack: ['fishing', 'Rod rack', 'A lean-to rack holding four fishing rods and a coil of net.', k => {
    for (const s of [-1, 1]) k.beam([s * 0.8, 0, 0.3], [s * 0.8, 1.8, -0.1], 0.1, C.woodD);
    k.box(0, 1.6, -0.06, 1.8, 0.08, 0.08, C.wood); k.box(0, 0.25, 0.25, 1.8, 0.08, 0.08, C.wood);
    for (let i = 0; i < 4; i++) k.rod([-0.6 + i * 0.4, 0, 0.35], [-0.65 + i * 0.4, 2.9, -0.25], 0.03, C.woodL);
    k.cylX(0.4, 0.95, 0.15, 0.3, 0.45, '#8a8060'); k.on('dome', -0.5, 0, 0.6, 0.7, 0.25, 0.6, '#7a7058');
  }],
  // ------------------------------------------------------------ inn / town dressing
  inn_sign: ['inn', 'Inn sign', 'A painted hanging sign on a gallows post: a milk pail over a plough, a lantern under the arm.', k => {
    k.block(0, 0, 0, 0.6, 0.25, 0.6, C.stoneD);
    post(k, 0, 0, 3.2, 0.22, C.woodD);
    k.box(0.65, 2.95, 0, 1.4, 0.14, 0.14, C.wood);
    k.beam([0, 2.3, 0], [0.6, 2.9, 0], 0.1, C.woodD);
    for (const x of [0.4, 1.1]) k.rod([x, 2.88, 0], [x, 2.55, 0], 0.02, C.iron);
    k.box(0.75, 2.15, 0, 0.95, 0.8, 0.07, '#7a3a2a');
    k.box(0.75, 2.15, 0, 1.03, 0.88, 0.05, C.gold);
    k.box(0.75, 2.3, 0.04, 0.3, 0.26, 0.02, '#d8d2c2'); k.box(0.75, 1.98, 0.04, 0.55, 0.08, 0.02, '#4a4a52');
    k.rod([1.3, 2.88, 0], [1.3, 2.7, 0], 0.015, C.iron);
    k.block(1.3, 2.45, 0, 0.18, 0.25, 0.18, '#ffd28a'); k.on('hip', 1.3, 2.7, 0, 0.22, 0.1, 0.22, C.iron);
    k.glow(1.3, 2.55, 0, '#ffc070');
  }],
  hitching_post: ['inn', 'Hitching rail', 'A horizontal rail on two posts with iron rings, for tying horses.', k => {
    for (const s of [-1, 1]) post(k, s * 1.0, 0, 1.05, 0.16);
    k.box(0, 0.95, 0, 2.3, 0.13, 0.13, C.wood);
    for (const x of [-0.4, 0.4]) k.on('cyl', x, 0.75, 0.07, 0.16, 0.02, 0.16, C.iron, { rx: Math.PI / 2 });
    k.block(0, 0, 0.6, 1.2, 0.4, 0.4, C.wood);
  }],
  bench: ['inn', 'Bench', 'A rough plank bench for two.', k => {
    k.block(0, 0.42, 0, 1.8, 0.08, 0.38, C.plank);
    for (const s of [-1, 1]) { k.block(s * 0.7, 0, 0, 0.1, 0.42, 0.34, C.woodD); }
    k.block(0, 0.15, 0, 1.4, 0.06, 0.06, C.woodD);
  }],
  picnic_table: ['inn', 'Trestle table', 'An outdoor trestle table with two benches, a jug and mugs.', k => {
    k.block(0, 0.72, 0, 2.0, 0.08, 0.8, C.plank);
    for (const s of [-1, 1]) { k.beam([s * 0.75, 0, 0.35], [s * 0.75, 0.72, -0.25], 0.08, C.woodD); k.beam([s * 0.75, 0, -0.35], [s * 0.75, 0.72, 0.25], 0.08, C.woodD); }
    for (const e of [-1, 1]) { k.block(0, 0.42, e * 0.7, 2.0, 0.06, 0.3, C.plank); for (const s of [-1, 1]) k.block(s * 0.8, 0, e * 0.7, 0.08, 0.42, 0.26, C.woodD); }
    k.on('cyl', 0.2, 0.8, 0, 0.18, 0.3, 0.18, '#8a6a4a');
    for (const x of [-0.5, -0.2, 0.6]) k.on('cyl', x, 0.8, 0.2, 0.12, 0.15, 0.12, '#a89878');
  }],
  notice_post: ['inn', 'Notice post', 'A board on a post with layered nailed notices (bounties, lost sheep).', k => {
    post(k, 0, 0, 2.3, 0.16);
    k.block(0, 1.1, 0.08, 1.3, 1.0, 0.06, C.wood);
    k.on('gable', 0, 2.1, 0.08, 0.3, 0.3, 1.5, C.shingle, { yaw: Math.PI / 2 });
    for (let i = 0; i < 5; i++) k.block(-0.4 + (i % 3) * 0.4 + (k.rng() - 0.5) * 0.1, 1.25 + Math.floor(i / 3) * 0.42, 0.115, 0.32, 0.36, 0.01, k.pick(['#e8dcc0', '#d8ccb0', '#c8b898']), { rz: (k.rng() - 0.5) * 0.15 });
  }],
  lantern_post: ['inn', 'Lantern post', 'An iron-capped lantern on a timber post with a bracket arm.', k => {
    k.block(0, 0, 0, 0.4, 0.2, 0.4, C.stoneD);
    post(k, 0, 0, 2.6, 0.16, C.woodD);
    k.box(0.3, 2.5, 0, 0.6, 0.08, 0.08, C.iron);
    k.rod([0.55, 2.46, 0], [0.55, 2.3, 0], 0.015, C.iron);
    k.block(0.55, 2.02, 0, 0.2, 0.28, 0.2, '#ffd28a'); k.on('hip', 0.55, 2.3, 0, 0.26, 0.12, 0.26, C.iron); k.block(0.55, 1.98, 0, 0.24, 0.04, 0.24, C.iron);
    k.glow(0.55, 2.15, 0, '#ffc070');
  }],
  campfire: ['misc', 'Campfire', 'A ring of stones round a crackling log fire.', k => {
    for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; k.block(Math.sin(a) * 0.6, 0, Math.cos(a) * 0.6, 0.28, k.j(0.2, 0.2), 0.22, k.tone(C.stoneD), { yaw: a }); }
    k.on('cyl', 0, -0.02, 0, 1.0, 0.05, 1.0, '#2a2420');
    for (let i = 0; i < 4; i++) { const a = i * 1.57 + 0.3; k.rod([Math.sin(a) * 0.45, 0.02, Math.cos(a) * 0.45], [0, 0.5, 0], 0.09, C.bark); }
    k.fire(0, 0.2, 0, 1);
  }],
  cauldron_tripod: ['misc', 'Cauldron on a tripod', 'A black cauldron hung from a tripod over a small fire.', k => {
    for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; k.rod([Math.sin(a) * 0.8, 0, Math.cos(a) * 0.8], [0, 1.7, 0], 0.07, C.woodD); }
    k.rod([0, 1.7, 0], [0, 1.0, 0], 0.02, C.iron);
    k.ball(0, 0.7, 0, 0.33, C.iron, 0.9); k.on('cyl', 0, 0.98, 0, 0.5, 0.03, 0.5, '#4a5a3a');
    for (let i = 0; i < 6; i++) { const a = i; k.block(Math.sin(a) * 0.45, 0, Math.cos(a) * 0.45, 0.2, 0.14, 0.18, C.stoneD, { yaw: a }); }
    k.fire(0, 0.05, 0, 0.5);
  }],
  wagon_wheel_leaning: ['misc', 'Leaning wheel', 'A spare cart wheel leaned against something.', k => {
    k.group(0, 0, 0, { rx: -0.2 }, () => {
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; k.box(0, 0.55 + Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0.08, 0.28, 0.08, C.wood, { rx: a + Math.PI / 2 }); }
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; k.rod([0, 0.55, 0], [0, 0.55 + Math.cos(a) * 0.48, Math.sin(a) * 0.48], 0.04, C.woodL); }
      k.cylX(0, 0.55, 0, 0.18, 0.18, C.woodD);
    });
  }],
  // ------------------------------------------------------------ training
  training_dummy: ['training', 'Training dummy', 'A straw-stuffed sack man on a post, arms of rope, battered shield.', k => {
    post(k, 0, 0, 1.4, 0.12, C.wood);
    k.block(0, 0, 0, 0.5, 0.12, 0.5, C.woodD);
    k.on('cyl', 0, 0.95, 0, 0.62, 0.85, 0.5, k.tone('#a8925a'));
    for (const y of [1.15, 1.5]) k.on('cyl', 0, y, 0, 0.64, 0.04, 0.52, C.straw);
    k.box(0, 1.65, 0, 1.3, 0.1, 0.1, C.wood);
    for (const s of [-1, 1]) k.on('cone', s * 0.62, 1.32, 0, 0.16, 0.3, 0.16, C.straw, { rx: Math.PI });
    k.ball(0, 2.0, 0, 0.22, '#b8a27a');
    k.cylZ(-0.38, 1.25, 0.2, 0.06, 0.55, '#6a4a3a', { yaw: 0.3 });
    k.block(0.1, 1.3, 0.26, 0.15, 0.02, 0.02, '#4a3a2a', { rz: 0.6 });
  }],
  archery_butt: ['training', 'Archery butt', 'A round straw target with painted rings on an A-frame stand, arrows stuck in it.', k => {
    for (const s of [-1, 1]) k.beam([s * 0.6, 0, 0.2], [s * 0.15, 1.6, -0.05], 0.09, C.wood);
    k.beam([0, 0, -0.7], [0, 1.4, -0.12], 0.08, C.wood);
    k.group(0, 0.95, 0.08, { rx: 0.15 }, () => {
      k.cylZ(0, 0, 0, 0.3, 1.25, C.straw);
      [['#e8e0d0', 1.0], ['#3a3a40', 0.78], ['#3a5a9a', 0.56], ['#b83a2a', 0.36], ['#e8c040', 0.16]].forEach(([c, d], i) => k.cylZ(0, 0, 0.15 + i * 0.006, 0.006, d, c));
      for (let i = 0; i < 4; i++) { const x = (k.rng() - 0.5) * 0.6, y = (k.rng() - 0.5) * 0.6; k.rod([x, y, 0.12], [x * 1.05, y * 1.05 + 0.02, 0.62], 0.02, C.woodL); }
    });
  }],
  weapon_rack: ['training', 'Weapon rack', 'A wooden rack of blunt practice swords, staves and spears.', k => {
    for (const s of [-1, 1]) post(k, s * 1.0, 0, 1.5, 0.12);
    k.box(0, 1.4, 0, 2.2, 0.1, 0.12, C.wood); k.box(0, 0.3, 0.12, 2.2, 0.08, 0.2, C.wood);
    for (let i = 0; i < 6; i++) {
      const x = -0.8 + i * 0.32;
      if (i % 3 === 2) k.rod([x, 0.25, 0.12], [x, 2.1, -0.04], 0.04, C.woodL);
      else { k.beam([x, 0.25, 0.12], [x, 1.5, 0.03], 0.07, i % 3 ? '#9a9890' : C.woodL, 'box', { d: 0.02 }); k.box(x, 1.12, 0.06, 0.22, 0.04, 0.05, C.woodD); }
    }
  }],
  sand_pit: ['training', 'Sparring pit', 'A shallow ring of raked sand edged with half-buried logs, 6 m across.', k => {
    k.on('cyl', 0, -0.06, 0, 6.0, 0.1, 6.0, C.sand);
    for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; k.cylX(Math.sin(a) * 3.1, 0.08, Math.cos(a) * 3.1, 1.4, 0.32, k.tone(C.bark), { yaw: a }); }
    for (let i = 0; i < 4; i++) k.block(0, 0.04, -1.6 + i * 1.0, 3.6, 0.01, 0.06, '#b0a078');
  }],
  // ------------------------------------------------------------ boundaries (tiles)
  wooden_fence: ['farm', 'Split-rail fence', 'A 3 m section of split-rail field fence, two rails on three posts.', k => {
    for (const x of [-1.45, 0, 1.45]) post(k, x, 0, 1.1, 0.14, k.tone(C.woodD));
    for (const y of [0.45, 0.88]) plank(k, [-1.5, y + (k.rng() - 0.5) * 0.06, 0], [1.5, y + (k.rng() - 0.5) * 0.06, 0], 0.12, k.tone(C.wood));
  }],
  stone_wall: ['farm', 'Dry-stone wall', 'A 3 m stretch of dry-stone wall, knee-to-waist high, uneven top.', k => {
    stoneRun(k, -1.5, 1.5, 0);
  }],
};

/** Models that need the solid footprint without a builder hint get one from their parts. */
export const PROP_MODEL_IDS = Object.freeze(Object.keys(MODELS));
export const PROP_MODEL_INFO = Object.freeze(Object.fromEntries(Object.entries(MODELS).map(([id, [group, label, desc]]) => [id, { label, group, desc }])));
export const PROP_GROUPS = Object.freeze([...new Set(Object.values(MODELS).map(m => m[0]))]);

function ironRun(k, x0, x1) {
  const L = x1 - x0;
  for (const x of [x0 + 0.05, x1 - 0.05]) { k.block(x, 0, 0, 0.09, 1.3, 0.09, C.iron); k.on('dome', x, 1.3, 0, 0.12, 0.08, 0.12, C.iron); }
  for (const y of [0.18, 1.0]) k.box((x0 + x1) / 2, y, 0, L, 0.05, 0.04, C.iron);
  const n = Math.max(2, Math.round(L / 0.2));
  for (let i = 1; i < n; i++) { const x = x0 + (L * i) / n; k.block(x, 0.1, 0, 0.03, 1.08, 0.03, C.iron); k.on('cone', x, 1.18, 0, 0.07, 0.15, 0.07, C.iron); }
}
function stoneRun(k, x0, x1, z) {
  const L = x1 - x0, n = Math.max(2, Math.round(L / 0.75));
  k.block((x0 + x1) / 2, 0, z, L, 0.55, 0.7, k.tone(C.stoneD));
  for (let i = 0; i < n; i++) {
    const x = x0 + (L * (i + 0.5)) / n;
    k.block(x, 0.5, z, L / n + 0.04, k.j(0.38, 0.4), 0.62, k.tone(C.stone, 0.1), { yaw: (k.rng() - 0.5) * 0.08 });
    k.block(x, 0.88 + (k.rng() - 0.5) * 0.08, z, L / n * 0.9, 0.14, 0.5, k.tone(C.stoneD, 0.08), { rz: (k.rng() - 0.5) * 0.25 });
  }
  if (k.rng() < 0.6) lichen(k, x0 + L * k.rng(), z + 0.35, 0.35);
}

// ---------------------------------------------------------------------------- the API

const SOLID = { barn: { r: 7.2, h: 7.4 }, windmill: { r: 2.5, h: 10 }, broken_tower: { r: 2.6, h: 6.5 }, mausoleum: { r: 2.8, h: 5.2 }, crypt_door: { r: 2.4, h: 2.5 },
  den_mouth: { r: 3.2, h: 3.0 }, haystack: { r: 1.3, h: 2.4 }, standing_stone: { r: 0.6, h: 3.0 }, ruined_arch: { r: 1.9, h: 4.0 }, celtic_cross: { r: 0.5, h: 3.0 } };

/** Every corner of every part -> the farthest horizontal reach. */
function radiusOfParts(parts) {
  let r = 0;
  for (const p of parts) r = Math.max(r, Math.hypot(p.x, p.z) + Math.hypot(p.w, p.d, p.h) / 2);
  return Math.round(r * 100) / 100;
}

/**
 * One model. -> { id, parts, spin, fires, glows, solid, radius } or null for an id this kit does not know.
 * `seed` varies the small things (lean, lichen, variant, size jitter); the same seed is the same model.
 */
export function propModel(id, { seed = 1 } = {}) {
  const def = MODELS[id];
  if (!def) return null;
  const k = context(makeRng(hashStr(id) ^ Math.imul((seed >>> 0) || 1, 2654435761)));
  def[3](k);
  const all = [...k.parts, ...k.spin.flatMap(s => s.parts.map(p => ({ ...p, x: p.x + s.x, z: p.z + s.z })))];
  return { id, parts: k.parts, spin: k.spin, fires: k.fires, glows: k.glows, solid: SOLID[id] || null, radius: radiusOfParts(all) };
}

function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// ---------------------------------------------------------------------------- crops

/**
 * Crop looks. `kind` picks the planting style:
 *   grain  — row strips broken into clumps (a field reads as a mass, not single stalks)
 *   tall   — stalks with leaves (maize)
 *   leafy  — a dome per plant, an optional root showing (turnip/beet)
 *   vine   — a low vine strip with fruit domes (pumpkin/squash)
 *   tuft   — low cones (potato, carrot, onion)
 *   pole   — paired poles with climbing foliage (beans, peas)
 *   trellis — posts, a wire and a leafy hedge with grape clusters (vineyard)
 *   hop    — tall poles with twine and climbing bines
 *   bare   — furrows only (fallow, ploughed)
 */
export const CROPS = Object.freeze({
  wheat: { kind: 'grain', colour: '#c9a84a', top: '#dcc070', h: 0.95, row: 0.9 },
  barley: { kind: 'grain', colour: '#b9a456', top: '#d0bc78', h: 0.8, row: 0.9 },
  rye: { kind: 'grain', colour: '#a89a5a', top: '#c0b070', h: 1.2, row: 0.9 },
  oats: { kind: 'grain', colour: '#b8ac72', top: '#cfc490', h: 0.85, row: 0.9 },
  flax: { kind: 'grain', colour: '#6f9a7a', top: '#7a90d0', h: 0.8, row: 0.8 },
  corn: { kind: 'tall', colour: '#6a8a3a', top: '#d8c060', h: 2.1, row: 1.1, step: 0.9 },
  maize: { kind: 'tall', colour: '#6a8a3a', top: '#d8c060', h: 2.1, row: 1.1, step: 0.9 },
  turnip: { kind: 'leafy', colour: '#5f8a3a', root: '#d8c8d8', r: 0.22, row: 0.7, step: 0.6 },
  beet: { kind: 'leafy', colour: '#4a6a32', root: '#8a2a3a', r: 0.22, row: 0.7, step: 0.6 },
  cabbage: { kind: 'leafy', colour: '#7a9a5a', r: 0.32, row: 0.9, step: 0.8 },
  lettuce: { kind: 'leafy', colour: '#8ab060', r: 0.22, row: 0.6, step: 0.5 },
  pumpkin: { kind: 'vine', colour: '#4f7a34', fruit: '#d0702a', r: 0.32, row: 1.6, step: 1.3 },
  squash: { kind: 'vine', colour: '#4f7a34', fruit: '#c8a040', r: 0.24, row: 1.4, step: 1.1 },
  potato: { kind: 'tuft', colour: '#5a7a3a', h: 0.45, row: 0.8, step: 0.5 },
  carrot: { kind: 'tuft', colour: '#6a9a3a', h: 0.32, row: 0.55, step: 0.4 },
  onion: { kind: 'tuft', colour: '#7a9a5a', h: 0.4, row: 0.5, step: 0.35 },
  beans: { kind: 'pole', colour: '#4f7a34', h: 1.9, row: 1.2, step: 1.2 },
  peas: { kind: 'pole', colour: '#6a9a44', h: 1.4, row: 1.0, step: 1.0 },
  vineyard: { kind: 'trellis', colour: '#4f7a34', fruit: '#4a2a5a', h: 1.4, row: 2.0, step: 3.0 },
  grapes: { kind: 'trellis', colour: '#4f7a34', fruit: '#4a2a5a', h: 1.4, row: 2.0, step: 3.0 },
  hops: { kind: 'hop', colour: '#6a9a3a', h: 4.2, row: 2.4, step: 2.6 },
  fallow: { kind: 'bare', row: 0.9, colour: '#6a5a44' },
  ploughed: { kind: 'bare', row: 0.7, colour: '#5a4834' },
});
export const CROP_IDS = Object.freeze(Object.keys(CROPS));
const GENERIC_CROP = { kind: 'leafy', colour: '#5f8a3a', r: 0.2, row: 0.7, step: 0.6 };
export const CROP_PART_CAP = 600;

/** A planted plot, centred, +z front; rows run front-to-back. Unknown crop -> a generic green row crop. */
export function cropField({ w = 10, d = 10, crop = 'wheat', seed = 1 } = {}) {
  const def = CROPS[String(crop).toLowerCase()] || GENERIC_CROP;
  const rng = makeRng(hashStr('crop:' + crop) ^ ((seed >>> 0) || 1));
  const k = context(rng);
  const W = Math.max(1, w), D = Math.max(1, d);
  const rows = Math.max(1, Math.floor((W - 0.2) / def.row));
  const x0 = -((rows - 1) * def.row) / 2;
  const len = D - 0.3;
  const per = { grain: 2, tall: 3, leafy: def.root ? 2 : 1, vine: 3, tuft: 1, pole: 3, trellis: 4, hop: 3, bare: 0 }[def.kind];
  // the planting step stretches until the field fits the cap (a big field is clumps, not stalks)
  let step = def.kind === 'grain' ? 1.8 : (def.step || 0.6);
  const count = st => rows * (1 + per * Math.floor(len / st));
  while (count(step) > CROP_PART_CAP && step < len) step *= 1.25;
  const earth = def.kind === 'bare' ? def.colour : '#5f5040';
  for (let r = 0; r < rows; r++) {
    const x = x0 + r * def.row;
    k.block(x, -0.04, 0, def.row * (def.kind === 'bare' ? 0.55 : 0.6), def.kind === 'bare' ? 0.2 : 0.16, len, shade(earth, (rng() - 0.5) * 0.1));
    if (def.kind === 'bare') continue;
    const n = Math.max(1, Math.floor(len / step));
    for (let i = 0; i < n; i++) {
      const z = -len / 2 + (i + 0.5) * (len / n), jz = (rng() - 0.5) * 0.1;
      switch (def.kind) {
        case 'grain': {
          const seg = len / n - 0.15, h = def.h * (0.85 + rng() * 0.25);
          k.block(x, 0.05, z + jz, def.row * 0.62, h * 0.8, seg, shade(def.colour, (rng() - 0.5) * 0.12));
          k.block(x, 0.05 + h * 0.8, z + jz, def.row * 0.56, h * 0.22, seg * 0.95, shade(def.top, (rng() - 0.5) * 0.1));
          break;
        }
        case 'tall': {
          const h = def.h * (0.85 + rng() * 0.25);
          k.on('cyl', x, 0, z, 0.08, h, 0.08, '#7a9a44');
          k.box(x, h * 0.55, z, 0.9, 0.05, 0.16, def.colour, { yaw: rng() * 3, rz: 0.4 });
          k.on('cone', x, h, z, 0.18, 0.4, 0.18, def.top);
          break;
        }
        case 'leafy': {
          const r0 = def.r * (0.85 + rng() * 0.3);
          k.on('dome', x + (rng() - 0.5) * 0.08, 0.06, z + jz, r0 * 2, r0 * 1.1, r0 * 2, shade(def.colour, (rng() - 0.5) * 0.12));
          if (def.root) k.on('dome', x, 0.04, z + jz + r0 * 0.6, r0 * 0.9, r0 * 0.5, r0 * 0.9, def.root);
          break;
        }
        case 'vine': {
          const seg = len / n;
          k.block(x, 0.06, z, 0.5, 0.14, seg * 0.95, shade(def.colour, (rng() - 0.5) * 0.1));
          const r0 = def.r * (0.8 + rng() * 0.4), fx = x + (rng() - 0.5) * 0.3;
          k.on('dome', fx, 0.06, z + jz, r0 * 2, r0 * 1.3, r0 * 2, shade(def.fruit, (rng() - 0.5) * 0.12));
          k.on('cyl', fx, 0.06 + r0 * 1.3, z + jz, 0.05, 0.1, 0.05, '#4a5a2a');
          break;
        }
        case 'tuft':
          k.on('cone', x + (rng() - 0.5) * 0.1, 0.06, z + jz, 0.3, def.h * (0.8 + rng() * 0.4), 0.3, shade(def.colour, (rng() - 0.5) * 0.12));
          break;
        case 'pole': {
          k.rod([x - 0.15, 0, z], [x, def.h, z], 0.04, '#8a7050');
          k.rod([x + 0.15, 0, z], [x, def.h, z], 0.04, '#8a7050');
          k.on('cone', x, 0.05, z, 0.42, def.h * 0.92, 0.42, shade(def.colour, (rng() - 0.5) * 0.12));
          break;
        }
        case 'trellis': {
          const seg = len / n;
          k.block(x, 0, z - seg / 2 + 0.05, 0.1, def.h + 0.2, 0.1, C.woodD);
          k.block(x, def.h, z, 0.03, 0.03, seg, '#3a3a3a');
          k.block(x, 0.45, z, 0.45, def.h - 0.35, seg * 0.92, shade(def.colour, (rng() - 0.5) * 0.12));
          k.on('cone', x + 0.24, 0.55, z, 0.16, 0.25, 0.16, def.fruit, { rx: Math.PI });
          break;
        }
        case 'hop': {
          k.on('cyl', x, 0, z, 0.12, def.h, 0.12, C.woodD);
          k.rod([x + 0.4, 0, z + 0.3], [x, def.h * 0.95, z], 0.02, '#8a7a5a');
          k.on('frustum', x, 0.1, z, 0.55, def.h * 0.85, 0.55, shade(def.colour, (rng() - 0.5) * 0.12));
          break;
        }
        default: break;
      }
    }
  }
  return k.parts;
}

// ---------------------------------------------------------------------------- fences along a line

export const FENCE_LINE_KINDS = Object.freeze(['wooden', 'iron', 'stone', 'hedge']);

/**
 * A fence/wall along a polyline [[x, z], ...] in local metres -> parts. `kind`: wooden (split rails on
 * posts), iron (railing with spear finials), stone (dry-stone wall), hedge (a clipped green hedge).
 */
export function fenceLine(points, { kind = 'wooden', seed = 1 } = {}) {
  const k = context(makeRng(hashStr('fence:' + kind) ^ ((seed >>> 0) || 1)));
  const pts = (points || []).filter(p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az);
    if (L < 0.05) continue;
    const yaw = Math.atan2(bz - az, bx - ax);          // local +x runs along the segment
    k.group(ax, 0, az, { yaw: -yaw }, () => {
      if (kind === 'iron') ironRun(k, 0, L);
      else if (kind === 'stone') stoneRun(k, 0, L, 0);
      else if (kind === 'hedge') {
        const n = Math.max(1, Math.round(L / 1.5));
        k.block(L / 2, 0, 0, L, 1.1, 0.8, k.tone(C.leafD));
        for (let j = 0; j < n; j++) k.on('dome', (L * (j + 0.5)) / n, 1.05, 0, L / n + 0.1, 0.35, 0.8, k.tone(C.leaf, 0.08));
      } else {
        const n = Math.max(1, Math.round(L / 2.5));
        for (let j = 0; j <= n; j++) post(k, (L * j) / n, 0, 1.1, 0.14, k.tone(C.woodD));
        for (const y of [0.45, 0.88]) plank(k, [0, y, 0], [L, y + (k.rng() - 0.5) * 0.05, 0], 0.11, k.tone(C.wood));
      }
    });
  }
  return k.parts;
}

export { MESHES };
