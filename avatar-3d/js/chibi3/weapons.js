// Chibi 3 held items: blades, axes, maces, spears, staves, wands, shields, orbs, books and torches,
// built as ordinary geometry (not distance fields — a blade's edge is thinner than any grid) and
// skinned rigidly to a bone.
//
// AUTHORING SPACE. Every hand-held item is written in GRIP space: the handle runs along local +y,
// centred on the palm (y = 0 is the middle of the fist), the business end out at +y. The striking
// EDGE faces local +z (a sword has edges at +z and -z, an axe's bit and a hammer's face point +z),
// and the flat of a blade faces ±x. The grip bone's bind rotation is Euler(PI/2, 0, 0), so in the
// bind pose (arm hanging) local +y is world +z (forward) and local +z is world -y (down): a sword
// held at rest points forward with its edges up and down, and an overhead chop that pitches the arm
// forward and down leads with the edge.
//
// Shields are strapped to the LEFT FOREARM (bone foreArmL), not gripped: the forearm runs across the
// back of the shield, so when the elbow bends and the forearm points forward the shield stands
// upright, facing out. In the bind pose (arm hanging) it lies on its side on the outer forearm.
//
// Each item is one geometry with a paint per triangle (blade flats brushed, bevels polished, the
// fuller darker; grips leather; hafts wood), handed to the assembler with ao:false.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { paint, shadeHex, mixHex } from './paint.js';

// ------------------------------------------------------------------ id -> family

const RIGHT = {
  sword: ['sword', 'fh_sword', 'arming_sword', 'cleaver', 'blade', 'shortsword', 'short_sword'],
  longsword: ['longsword', 'fh_longsword', 'bastard_sword'],
  sabre: ['sabre', 'saber', 'fh_sabre', 'scimitar', 'cutlass'],
  rapier: ['rapier', 'fh_rapier'],
  greatsword: ['greatsword', 'fh_greatsword', 'claymore', 'zweihander'],
  axe: ['axe', 'fh_axe', 'hatchet', 'handaxe'],
  greataxe: ['greataxe', 'fh_greataxe', 'battleaxe', 'battle_axe'],
  mace: ['mace', 'fh_mace', 'scepter', 'fh_scepter', 'flail', 'club', 'morningstar'],
  hammer: ['hammer', 'fh_hammer'],
  maul: ['warhammer', 'maul', 'fh_maul'],
  dagger: ['dagger', 'daggers', 'fh_dagger', 'fh_daggers', 'knife'],
  spear: ['spear', 'fh_spear', 'javelin', 'fh_javelin', 'pike', 'lance', 'trident'],
  halberd: ['halberd', 'fh_halberd', 'glaive', 'polearm'],
  staff: ['staff', 'staff_orb', 'staff_crystal', 'staff_skull', 'staff_crook', 'staff_totem', 'wizard_staff'],
  quarterstaff: ['quarterstaff', 'fh_quarterstaff'],
  wand: ['wand', 'fh_wand'],
};
const NOT_HELD = new Set(['none', '', 'bow', 'crossbow', 'lute', 'book', 'hourglass', 'orb', 'flame', 'lightning', 'ring_rune', 'map', 'quiver']);
const LEFT = {
  shield: ['heater_shield', 'fh_heater_shield', 'shield'],
  kite: ['kite_shield', 'fh_kite_shield'],
  round: ['round_shield', 'buckler'],
  tower: ['tower_shield', 'fh_tower_shield'],
  dagger: ['dagger', 'fh_dagger', 'knife', 'parrying_dagger'],
  axe: ['axe', 'fh_axe', 'hatchet', 'handaxe'],
  sword: ['sword', 'fh_sword', 'shortsword', 'short_sword', 'sabre', 'saber'],
  orb: ['orb', 'relic', 'idol', 'crystal_ball'],
  book: ['book', 'grimoire', 'tome'],
  torch: ['torch'],
};
const lookup = (table, id) => { for (const [k, ids] of Object.entries(table)) if (ids.includes(id)) return k; return null; };

/** Which kind of thing an id is (for tools and tests; no geometry). */
export function heldKind(id = 'none') {
  if (NOT_HELD.has(id)) return 'none';
  return lookup(RIGHT, id) || (/staff/.test(id) ? 'staff' : /axe/.test(id) ? 'axe' : /spear|lance|pike/.test(id) ? 'spear' : /mace|club|hammer/.test(id) ? 'mace' : /dagger|knife/.test(id) ? 'dagger' : 'sword');
}
export function offhandKind(id = 'none') {
  const k = lookup(LEFT, id);
  if (k) return k;
  if (/shield|buckler/.test(id)) return 'shield';
  return 'none';
}

/** Variant -> the family the animator sees, and whether it takes both hands. */
const FAMILY = {
  sword: ['sword', false], longsword: ['sword', false], sabre: ['sword', false], rapier: ['sword', false],
  greatsword: ['greatsword', true], axe: ['axe', false], greataxe: ['greataxe', true], mace: ['mace', false],
  hammer: ['hammer', false], maul: ['hammer', true], dagger: ['dagger', false], spear: ['spear', false],
  halberd: ['spear', true], staff: ['staff', false], quarterstaff: ['staff', true], wand: ['wand', false], none: ['none', false],
};
const LEFT_FAMILY = { shield: 'shield', kite: 'shield', round: 'shield', tower: 'shield', dagger: 'dagger', axe: 'axe', sword: 'sword', orb: 'orb', book: 'book', torch: 'torch', none: 'none' };

// ------------------------------------------------------------------ geometry kit

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const norm = a => { const l = Math.hypot(...a) || 1; return a.map(v => v / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Pieces of one item, each with a paint (or a per-triangle paint function of the centroid). */
class Kit {
  constructor() { this.parts = []; }
  /** `flat` true: faceted (a blade, a forged head); false keeps the geometry's smooth normals. */
  add(geometry, P, { flat = false, matrix = null } = {}) {
    let g = geometry.index ? geometry.toNonIndexed() : geometry;
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    if (matrix) g.applyMatrix4(matrix);
    if (flat || !g.attributes.normal) g.computeVertexNormals();
    const n = g.attributes.position.count, paints = new Array(n), p = g.attributes.position;
    for (let t = 0; t < n; t += 3) {
      const P3 = typeof P === 'function'
        ? P((p.getX(t) + p.getX(t + 1) + p.getX(t + 2)) / 3, (p.getY(t) + p.getY(t + 1) + p.getY(t + 2)) / 3, (p.getZ(t) + p.getZ(t + 1) + p.getZ(t + 2)) / 3, t / 3, g)
        : P;
      paints[t] = paints[t + 1] = paints[t + 2] = P3;
    }
    this.parts.push({ g, paints });
    return this;
  }
  /** Apply a function to every vertex position of every part so far (bend a shield, etc). */
  warp(fn) {
    for (const { g } of this.parts) {
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const [x, y, z] = fn(p.getX(i), p.getY(i), p.getZ(i)); p.setXYZ(i, x, y, z); }
      g.computeVertexNormals();
    }
    return this;
  }
  /** One geometry in bind space + the per-vertex paints. */
  finish(matrix) {
    const g = mergeGeometries(this.parts.map(p => p.g));
    const paints = this.parts.flatMap(p => p.paints);
    g.applyMatrix4(matrix);
    // a degenerate sliver (a blade's tip) has no normal; give it one rather than a NaN
    const nrm = g.attributes.normal;
    for (let i = 0; i < nrm.count; i++) if (!Number.isFinite(nrm.getX(i)) || nrm.getX(i) ** 2 + nrm.getY(i) ** 2 + nrm.getZ(i) ** 2 < 1e-8) nrm.setXYZ(i, 0, 1, 0);
    return { geometry: g, paints, triangles: g.attributes.position.count / 3 };
  }
}

/**
 * Loft a tube along a path. `radius(i, angle)` -> r or [rNormal, rBinormal]. Rings are perpendicular
 * to the path; caps close either end.
 */
function loft(path, radius, sides = 12, { caps = true } = {}) {
  const pos = [], idx = [], n = path.length;
  const rings = [];
  for (let i = 0; i < n; i++) {
    const p = path[i], q = path[Math.min(n - 1, i + 1)], o = path[Math.max(0, i - 1)];
    const t = norm([q[0] - o[0], q[1] - o[1], q[2] - o[2]]);
    const ref = Math.abs(t[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1];
    const b = norm(cross(t, ref)), nn = cross(b, t);
    const ring = [];
    for (let j = 0; j < sides; j++) {
      const a = j / sides * Math.PI * 2, r = radius(i, a), [rx, rz] = Array.isArray(r) ? r : [r, r];
      ring.push([p[0] + nn[0] * Math.cos(a) * rx + b[0] * Math.sin(a) * rz, p[1] + nn[1] * Math.cos(a) * rx + b[1] * Math.sin(a) * rz, p[2] + nn[2] * Math.cos(a) * rx + b[2] * Math.sin(a) * rz]);
    }
    rings.push(ring); for (const v of ring) pos.push(...v);
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < sides; j++) {
    const a = i * sides + j, b = i * sides + (j + 1) % sides, c = (i + 1) * sides + j, d = (i + 1) * sides + (j + 1) % sides;
    idx.push(a, b, c, b, d, c);
  }
  if (caps) for (const [ri, start] of [[0, true], [n - 1, false]]) {
    const ring = rings[ri], base = pos.length / 3, cx = ring.reduce((s, v) => s + v[0], 0) / sides, cy = ring.reduce((s, v) => s + v[1], 0) / sides, cz = ring.reduce((s, v) => s + v[2], 0) / sides;
    pos.push(cx, cy, cz); for (const v of ring) pos.push(...v);
    for (let j = 0; j < sides; j++) { const a = base + 1 + j, b = base + 1 + (j + 1) % sides; if (start) idx.push(base, b, a); else idx.push(base, a, b); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
const straight = (y0, y1, n, x = 0, z = 0) => Array.from({ length: n }, (_, i) => [x, y0 + (y1 - y0) * i / (n - 1), z]);

/** Lathe around local y from [r, y] points (bottom to top). */
function lathe(points, segments = 16) { return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(Math.max(1e-4, r), y)), segments); }

/** Shape in (y along the haft, z out from it), extruded `depth` along x, centred. */
function extrudeYZ(shape, depth, bevel, opts = {}) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * (opts.sizeK ?? 0.8), bevelSegments: opts.segments ?? 2, curveSegments: opts.curve ?? 14, steps: 1 });
  g.translate(0, 0, -depth / 2);
  // shape x -> local y, shape y -> local z, extrude z -> local x
  g.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1));
  return g;
}

// ------------------------------------------------------------------ paints

function palette(color = '#c4ccd4', color2) {
  const steel = color, dark = shadeHex(steel, -0.45);
  return {
    flat: paint('metal', steel, { rough: 0.3, detail: 0.55 }),
    bevel: paint('metal', shadeHex(steel, 0.18), { rough: 0.16, detail: 0.25 }),
    fuller: paint('metal', shadeHex(steel, -0.25), { rough: 0.42, detail: 0.6 }),
    dark: paint('darkMetal', mixHex(dark, '#3a3a40', 0.5), { rough: 0.5 }),
    brass: paint('gold', color2 && color2 !== color ? color2 : '#b8913e', { rough: 0.32 }),
    leather: paint('leather', '#4a2f22', { rough: 0.7, detail: 0.9 }),
    leather2: paint('leather', '#6b4630', { rough: 0.66, detail: 0.9 }),
    wood: paint('wood', '#6e4a2c', { rough: 0.62, detail: 0.45 }),
  };
}

// ------------------------------------------------------------------ parts

/**
 * A blade: a 12-sided cross-section (two bevelled edges, two flats, a fuller groove down each flat)
 * lofted from the guard to the point. Length L, half-width w, half-thickness th, from y0 up.
 * `curve` bends it toward -z (a sabre), `leaf` swells the middle (a spear head).
 */
function blade(kit, pal, { y0, L, w, th, fullerTo = 0.65, curve = 0, leaf = 0, tipStart = 0.82, stations = 26 }) {
  const ring = (fw, ft, fuller) => [
    [0, fw], [ft * 0.42, fw * 0.8], [ft, fw * 0.24], [ft * (1 - 0.32 * fuller), 0], [ft, -fw * 0.24], [ft * 0.42, -fw * 0.8],
    [0, -fw], [-ft * 0.42, -fw * 0.8], [-ft, -fw * 0.24], [-ft * (1 - 0.32 * fuller), 0], [-ft, fw * 0.24], [-ft * 0.42, fw * 0.8],
  ];
  const S = 12, pos = [], idx = [], kinds = [];
  for (let i = 0; i <= stations; i++) {
    const t = i / stations;
    let width = w * (1 - 0.18 * t) * (1 + leaf * Math.sin(Math.PI * Math.min(1, t / 0.85)) * 0.6);
    if (t > tipStart) { const u = (t - tipStart) / (1 - tipStart); width *= Math.sqrt(Math.max(0, 1 - u * u)) * (1 - u * 0.15); }
    const thick = th * (1 - 0.4 * t) * (t > tipStart ? Math.max(0.12, 1 - (t - tipStart) / (1 - tipStart)) : 1);
    const fuller = t < fullerTo ? Math.min(1, (fullerTo - t) / 0.08) * Math.min(1, t / 0.04 + 0.2) : 0;
    const y = y0 + L * t, bend = curve * L * t * t;
    for (const [x, z] of ring(Math.max(width, 0.0004), Math.max(thick, 0.0003), fuller)) pos.push(x, y, z - bend);
  }
  // face kind by which pair of ring slots it spans: 0 bevel, 1 flat, 2 fuller
  const slotKind = [0, 1, 2, 2, 1, 0, 0, 1, 2, 2, 1, 0];
  for (let i = 0; i < stations; i++) for (let j = 0; j < S; j++) {
    const a = i * S + j, b = i * S + (j + 1) % S, c = (i + 1) * S + j, d = (i + 1) * S + (j + 1) % S;
    idx.push(a, b, c, b, d, c);
    const t = i / stations, k = slotKind[j] === 2 && t >= fullerTo ? 1 : slotKind[j];
    kinds.push(k, k);
  }
  // close the base
  const base = pos.length / 3; pos.push(0, y0, 0);
  for (let j = 0; j < S; j++) { idx.push(base, (j + 1) % S, j); kinds.push(1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  const P = [pal.bevel, pal.flat, pal.fuller];
  kit.add(g, (x, y, z, tri) => P[kinds[tri]], { flat: true });
}

/** A leather-wrapped grip from y0 to y1 with metal ferrules, radius r. */
function grip(kit, pal, y0, y1, r, { ferrules = true, wrap = pal.leather } = {}) {
  const n = Math.max(12, Math.round((y1 - y0) / 0.004));
  const len = y1 - y0;
  // the wrap: a spiral strap standing proud of the core
  kit.add(loft(straight(y0, y1, n), (i, a) => { const y = i / (n - 1) * len; const s = Math.sin((y / 0.017) * Math.PI * 2 + a); return r * (1 + 0.1 * Math.max(0, s) ** 0.5); }, 14, { caps: false }), wrap);
  if (ferrules) for (const y of [y0, y1]) kit.add(lathe([[r * 1.05, y - 0.006], [r * 1.25, y - 0.004], [r * 1.25, y + 0.004], [r * 1.05, y + 0.006]], 16), pal.brass);
}

/** A crossguard across z at height y. */
function crossguard(kit, pal, y, half, r, { curl = 0.015, style = 'bar' } = {}) {
  const pts = [-1, -0.6, -0.25, 0, 0.25, 0.6, 1].map(t => [0, y + curl * t * t, t * half]);
  kit.add(loft(pts, (i, a) => { const t = Math.abs(i / 6 * 2 - 1); return [r * (0.75 + 0.25 * t) * 0.85, r * (1.2 - 0.3 * t)]; }, 8), pal.flat, { flat: false });
  for (const s of [-1, 1]) kit.add(new THREE.SphereGeometry(r * 1.25, 10, 8).translate(0, y + curl, s * half), pal.brass);
  if (style === 'langets') kit.add(new THREE.BoxGeometry(r * 1.6, r * 3.2, r * 1.5).translate(0, y + r * 1.4, 0), pal.flat, { flat: true });
  // the guard's centre block
  kit.add(new THREE.BoxGeometry(r * 2.4, r * 1.8, r * 2.6).translate(0, y, 0), pal.flat, { flat: true });
}

/** Wheel pommel with a peen at y (the end of the grip, going -y). */
function pommel(kit, pal, y, r, style = 'wheel') {
  if (style === 'ball') { kit.add(new THREE.SphereGeometry(r, 16, 12).translate(0, y - r * 0.8, 0), pal.brass); return; }
  // a disc on edge (faces ±x) with a bevelled rim and a little peen block
  const disc = new THREE.CylinderGeometry(r, r, r * 0.9, 20, 1).rotateZ(Math.PI / 2).translate(0, y - r * 0.95, 0);
  kit.add(disc, pal.brass);
  kit.add(new THREE.CylinderGeometry(r * 0.62, r * 0.7, r * 1.1, 16).rotateZ(Math.PI / 2).translate(0, y - r * 0.95, 0), pal.flat);
  kit.add(new THREE.CylinderGeometry(r * 0.28, r * 0.35, r * 0.5, 8).translate(0, y - r * 2.05, 0), pal.brass);
}

/** A wooden haft with slight taper and grain, y0..y1. */
function haft(kit, pal, y0, y1, r0, r1, wood = pal.wood) {
  const n = Math.max(8, Math.round((y1 - y0) / 0.03));
  kit.add(loft(straight(y0, y1, n), (i, a) => (r0 + (r1 - r0) * i / (n - 1)) * (1 + 0.025 * Math.sin(a * 3 + i)), 12), wood);
}

/** A band of leather wrap on a haft. */
function wrapBand(kit, pal, y0, y1, r) {
  const n = Math.max(6, Math.round((y1 - y0) / 0.004));
  kit.add(loft(straight(y0, y1, n), (i, a) => { const y = i / (n - 1) * (y1 - y0); return r * (1.08 + 0.09 * Math.max(0, Math.sin((y / 0.014) * Math.PI * 2 + a)) ** 0.5); }, 14), pal.leather);
}

// ------------------------------------------------------------------ the items

function buildSword(kit, pal, S, h, variant) {
  const spec = {
    sword: { L: 0.74, w: 0.022, grip: [-0.06, 0.05], guard: 0.095, pommel: 'wheel' },
    longsword: { L: 0.9, w: 0.024, grip: [-0.16, 0.05], guard: 0.12, pommel: 'wheel' },
    sabre: { L: 0.74, w: 0.02, grip: [-0.06, 0.05], guard: 0.07, pommel: 'ball', curve: 0.12, fullerTo: 0.75 },
    rapier: { L: 0.86, w: 0.01, grip: [-0.06, 0.05], guard: 0.08, pommel: 'ball', fullerTo: 0.15 },
    greatsword: { L: 1.12, w: 0.03, grip: [-0.3, 0.05], guard: 0.17, pommel: 'wheel', ricasso: true },
    dagger: { L: 0.24, w: 0.016, grip: [-0.05, 0.045], guard: 0.05, pommel: 'ball', fullerTo: 0.5, tipStart: 0.6 },
  }[variant];
  const gr = 0.0155 * h;
  grip(kit, pal, spec.grip[0] * S, spec.grip[1] * S, gr);
  crossguard(kit, pal, (spec.grip[1] + 0.008) * S, spec.guard * S, 0.008 * S, { curl: variant === 'greatsword' ? 0.03 * S : 0.012 * S, style: variant === 'longsword' || variant === 'greatsword' ? 'langets' : 'bar' });
  let y0 = (spec.grip[1] + 0.016) * S;
  if (spec.ricasso) {
    // an unsharpened stretch above the guard, with its own little lugs
    kit.add(new THREE.BoxGeometry(0.008 * S, 0.11 * S, spec.w * 1.5 * S).translate(0, y0 + 0.055 * S, 0), pal.flat, { flat: true });
    for (const s of [-1, 1]) kit.add(new THREE.ConeGeometry(0.008 * S, 0.035 * S, 6).rotateX(s * Math.PI / 2).translate(0, y0 + 0.11 * S, s * spec.w * 1.25 * S), pal.flat, { flat: true });
    y0 += 0.11 * S;
  }
  blade(kit, pal, { y0, L: spec.L * S, w: spec.w * S, th: (variant === 'rapier' ? 0.004 : 0.0036) * S, fullerTo: spec.fullerTo ?? 0.66, curve: spec.curve || 0, tipStart: spec.tipStart ?? 0.84 });
  pommel(kit, pal, spec.grip[0] * S, (variant === 'dagger' ? 0.014 : 0.02) * S, spec.pommel);
  if (variant === 'rapier') {
    // a swept hilt: two rings curving from the guard back over the fist
    kit.add(new THREE.TorusGeometry(0.045 * S, 0.003 * S, 6, 24, Math.PI).rotateY(Math.PI / 2).translate(0, 0.0, 0.0), pal.flat);
  }
  return { tipAlong: y0 + spec.L * S, buttAlong: spec.grip[0] * S - 0.04 * S, offhandAlong: variant === 'greatsword' ? -0.19 * S : variant === 'longsword' ? -0.1 * S : null };
}

/** Crescent axe bit outline in (y along the haft, z out). */
function axeShape(H, size, double = false) {
  const s = new THREE.Shape(), k = size;
  s.moveTo(H - 0.045 * k, 0.012 * k);
  s.bezierCurveTo(H - 0.06 * k, 0.07 * k, H - 0.17 * k, 0.11 * k, H - 0.21 * k, 0.2 * k);   // the beard sweeping down
  s.quadraticCurveTo(H - 0.02 * k, 0.29 * k, H + 0.17 * k, 0.21 * k);                     // the edge
  s.bezierCurveTo(H + 0.12 * k, 0.12 * k, H + 0.06 * k, 0.07 * k, H + 0.045 * k, 0.012 * k);
  s.lineTo(H - 0.045 * k, 0.012 * k);
  void double;
  return s;
}

function buildAxe(kit, pal, S, h, great) {
  const H = (great ? 0.74 : 0.36) * S, k = (great ? 1.0 : 0.62) * S, r = (great ? 0.018 : 0.015) * h * S;
  const butt = (great ? -0.42 : -0.11) * S;
  haft(kit, pal, butt, H + 0.1 * k, r * 1.05, r * 0.92);
  wrapBand(kit, pal, -0.075 * S, 0.075 * S, r);
  if (great) wrapBand(kit, pal, -0.36 * S, -0.22 * S, r);
  // the bit: extruded, then thinned toward the edge so it is actually sharp
  const thick = (great ? 0.022 : 0.016) * S;
  const bit = extrudeYZ(axeShape(H, k), thick, 0.004 * S, { curve: 18 });
  const p = bit.attributes.position;
  for (let i = 0; i < p.count; i++) { const z = p.getZ(i) / k, f = Math.max(0, Math.min(1, (z - 0.06) / 0.17)); p.setX(i, p.getX(i) * (1 - 0.82 * f * f)); }
  const edgeZ = 0.17 * k;
  kit.add(bit, (x, y, z) => z > edgeZ ? pal.bevel : pal.flat, { flat: true });
  // eye/socket around the haft, back spike (or a hammer poll), iron langets down the haft
  kit.add(new THREE.CylinderGeometry(r * 1.55, r * 1.55, 0.1 * k, 12).translate(0, H, 0), pal.dark, { flat: true });
  for (const y of [H - 0.05 * k, H + 0.05 * k]) kit.add(new THREE.TorusGeometry(r * 1.6, 0.004 * S, 6, 16).rotateX(Math.PI / 2).translate(0, y, 0), pal.brass);
  if (great) kit.add(new THREE.ConeGeometry(0.02 * S, 0.14 * S, 6).rotateX(-Math.PI / 2).translate(0, H, -0.075 * S - r), pal.flat, { flat: true });
  else kit.add(new THREE.BoxGeometry(0.026 * S, 0.04 * S, 0.04 * S).translate(0, H, -0.03 * S - r), pal.dark, { flat: true });
  for (const s of [-1, 1]) kit.add(new THREE.BoxGeometry(0.003 * S, 0.22 * k, 0.012 * S).translate(s * r * 1.05, H - 0.15 * k, 0), pal.dark, { flat: true });
  kit.add(new THREE.ConeGeometry(r * 1.2, 0.03 * S, 10).rotateX(Math.PI).translate(0, butt - 0.012 * S, 0), pal.dark);
  return { tipAlong: H + 0.1 * k, buttAlong: butt, offhandAlong: great ? -0.29 * S : null, headAlong: H };
}

function buildMace(kit, pal, S, h, kind) {
  const two = kind === 'maul', H = (two ? 0.72 : 0.42) * S, r = 0.015 * h * S, butt = (two ? -0.4 : -0.1) * S;
  haft(kit, pal, butt, H, r, r * 0.9, kind === 'mace' ? pal.dark : pal.wood);
  wrapBand(kit, pal, -0.075 * S, 0.075 * S, r);
  if (two) wrapBand(kit, pal, -0.36 * S, -0.22 * S, r);
  if (kind === 'mace') {
    kit.add(new THREE.SphereGeometry(0.032 * S, 16, 12).translate(0, H, 0), pal.dark);
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * Math.PI * 2;
      const f = new THREE.Shape(); f.moveTo(-0.05 * S, 0); f.lineTo(-0.03 * S, 0.045 * S); f.lineTo(0.035 * S, 0.042 * S); f.lineTo(0.06 * S, 0); f.lineTo(-0.05 * S, 0);
      const g = extrudeYZ(f, 0.006 * S, 0.0015 * S, { segments: 1 });
      g.rotateY(a); g.translate(0, H, 0);
      kit.add(g, (x, y, z) => pal.flat, { flat: true });
    }
    kit.add(new THREE.ConeGeometry(0.012 * S, 0.04 * S, 8).translate(0, H + 0.07 * S, 0), pal.flat, { flat: true });
  } else {
    // hammer: a striking face toward +z, a spike toward -z
    const w = (two ? 0.06 : 0.04) * S;
    kit.add(new THREE.BoxGeometry(w * 1.1, w * 1.1, w * 2.2).translate(0, H, w * 0.4), pal.dark, { flat: true });
    kit.add(new THREE.CylinderGeometry(w * 0.7, w * 0.62, w * 0.4, 10).rotateX(Math.PI / 2).translate(0, H, w * 1.65), pal.bevel);
    kit.add(new THREE.ConeGeometry(w * 0.4, w * 1.4, 6).rotateX(-Math.PI / 2).translate(0, H, -w * 1.3), pal.flat, { flat: true });
    kit.add(new THREE.ConeGeometry(w * 0.3, w * 0.9, 6).translate(0, H + w * 0.95, 0), pal.flat, { flat: true });
  }
  return { tipAlong: H + 0.06 * S, buttAlong: butt, offhandAlong: two ? -0.29 * S : null, headAlong: H };
}

function buildSpear(kit, pal, S, h, halberd) {
  const top = (halberd ? 1.3 : 1.25) * S, butt = (halberd ? -0.62 : -0.6) * S, r = 0.0145 * h * S;
  haft(kit, pal, butt, top - 0.05 * S, r, r * 0.88);
  wrapBand(kit, pal, -0.075 * S, 0.075 * S, r);
  kit.add(new THREE.CylinderGeometry(r * 1.1, r * 1.35, 0.08 * S, 10).translate(0, top - 0.06 * S, 0), pal.dark, { flat: true });
  blade(kit, pal, { y0: top - 0.025 * S, L: (halberd ? 0.24 : 0.28) * S, w: 0.024 * S, th: 0.004 * S, fullerTo: 0, leaf: halberd ? 0 : 0.55, tipStart: 0.55, stations: 16 });
  if (halberd) {
    const bit = extrudeYZ(axeShape(top - 0.13 * S, 0.62 * S), 0.012 * S, 0.003 * S);
    const p = bit.attributes.position;
    for (let i = 0; i < p.count; i++) { const z = p.getZ(i) / (0.62 * S), f = Math.max(0, Math.min(1, (z - 0.06) / 0.17)); p.setX(i, p.getX(i) * (1 - 0.8 * f * f)); }
    kit.add(bit, pal.flat, { flat: true });
    kit.add(new THREE.ConeGeometry(0.014 * S, 0.12 * S, 6).rotateX(-Math.PI / 2).translate(0, top - 0.13 * S, -0.07 * S), pal.flat, { flat: true });
  }
  kit.add(new THREE.ConeGeometry(r * 1.1, 0.06 * S, 8).rotateX(Math.PI).translate(0, butt - 0.03 * S, 0), pal.dark);
  return { tipAlong: top + 0.26 * S, buttAlong: butt - 0.06 * S, offhandAlong: halberd ? -0.42 * S : -0.4 * S };
}

/** Smooth 1D noise for gnarled wood. */
const wob = (t, seed) => Math.sin(t * 7.1 + seed) * 0.6 + Math.sin(t * 13.7 + seed * 2.3) * 0.3 + Math.sin(t * 29 + seed * 5.1) * 0.1;

function buildStaff(kit, pal, S, h, id, a) {
  const quarter = id === 'quarterstaff' || id === 'fh_quarterstaff';
  const wood = paint('wood', quarter ? '#7a5634' : (a.held?.color && a.held.color !== '#9a9aa8' ? a.held.color : '#5e4128'), { rough: 0.66, detail: 0.5 });
  const butt = (quarter ? -0.86 : -0.82) * S, top = (quarter ? 0.86 : 0.98) * S, r = 0.017 * h * S;
  if (quarter) {
    haft(kit, pal, butt, top, r, r, wood);
    for (const [y0, y1] of [[butt, butt + 0.12 * S], [top - 0.12 * S, top]]) kit.add(loft(straight(y0, y1, 4), () => r * 1.12, 14), pal.dark);
    wrapBand(kit, pal, -0.09 * S, 0.09 * S, r); wrapBand(kit, pal, -0.53 * S, -0.35 * S, r);
    return { tipAlong: top, buttAlong: butt, offhandAlong: -0.44 * S };
  }
  // gnarled shaft: the centre line wanders, the girth swells at knots
  const n = 64, path = [];
  for (let i = 0; i < n; i++) { const t = i / (n - 1), y = butt + (top - butt) * t; path.push([wob(t * 3, 1) * 0.006 * S, y, wob(t * 3, 4) * 0.006 * S]); }
  const knots = [0.18, 0.41, 0.63, 0.86];
  kit.add(loft(path, (i, ang) => {
    const t = i / (n - 1); let k = 1 + 0.06 * wob(t * 9 + ang, 2) + 0.05 * Math.sin(ang * 3 + t * 20);
    for (const c of knots) k += 0.22 * Math.exp(-(((t - c) / 0.018) ** 2)) * (0.6 + 0.4 * Math.sin(ang * 2 + c * 10));
    return r * k * (1 - 0.25 * t) * (t > 0.96 ? 1 + (t - 0.96) * 14 : 1);
  }, 12), wood);
  // metal bands and a wrapped hand grip
  for (const y of [-0.3 * S, 0.48 * S]) kit.add(new THREE.TorusGeometry(r * 1.05, 0.0035 * S, 6, 18).rotateX(Math.PI / 2).translate(path[Math.round((y - butt) / (top - butt) * (n - 1))][0], y, 0), pal.brass);
  wrapBand(kit, pal, -0.08 * S, 0.08 * S, r * 0.95);
  kit.add(new THREE.ConeGeometry(r * 0.9, 0.05 * S, 8).rotateX(Math.PI).translate(path[0][0], butt - 0.02 * S, path[0][2]), pal.dark);
  // the claw: four tines curling up from the head around the crystal
  const head = path[n - 1], gemY = top + 0.085 * S, gemR = 0.034 * S;
  const crystal = a.held?.color2 || (id === 'staff_skull' ? '#7affb0' : id === 'staff_orb' ? '#b07aff' : '#6fd6ff');
  for (let i = 0; i < 4; i++) {
    const ang = i / 4 * Math.PI * 2 + 0.4, cx = Math.cos(ang), cz = Math.sin(ang);
    const pts = [[head[0] + cx * r * 0.5, top - 0.02 * S, head[2] + cz * r * 0.5], [head[0] + cx * 0.032 * S, top + 0.03 * S, head[2] + cz * 0.032 * S], [cx * 0.044 * S, gemY, cz * 0.044 * S], [cx * 0.022 * S, gemY + 0.06 * S, cz * 0.022 * S]];
    const curve = new THREE.CatmullRomCurve3(pts.map(p => V(...p)));
    const cp = Array.from({ length: 14 }, (_, k) => curve.getPointAt(k / 13).toArray());
    kit.add(loft(cp, (k) => r * (0.55 - 0.42 * k / 13), 7), wood);
  }
  if (id === 'staff_orb') kit.add(new THREE.SphereGeometry(gemR * 1.05, 24, 16).translate(0, gemY, 0), paint('glow', crystal, { emissive: 0.5, rough: 0.1 }));
  else if (id === 'staff_skull') {
    kit.add(new THREE.SphereGeometry(gemR, 18, 14).scale(1, 1.05, 1.1).translate(0, gemY + 0.005 * S, 0), paint('bone', '#d8ceb4'));
    for (const s of [-1, 1]) kit.add(new THREE.SphereGeometry(gemR * 0.28, 8, 6).translate(s * gemR * 0.38, gemY + 0.008 * S, gemR * 0.9), paint('glow', crystal, { emissive: 1.4 }));
  } else {
    // a long six-sided crystal, pointed at both ends, faceted
    const c = lathe([[0.0001, -gemR * 1.5], [gemR * 0.8, -gemR * 0.7], [gemR * 0.85, gemR * 0.9], [0.0001, gemR * 2.2]], 6).translate(0, gemY, 0);
    kit.add(c, paint('glow', crystal, { emissive: 0.45, rough: 0.08 }), { flat: true });
  }
  return { tipAlong: gemY + 0.07 * S, buttAlong: butt, offhandAlong: -0.32 * S, gemAlong: gemY, glow: crystal };
}

function buildWand(kit, pal, S, h, a) {
  const r = 0.008 * S, top = 0.3 * S;
  kit.add(loft(straight(-0.06 * S, top, 18), (i) => r * (1.25 - 0.55 * i / 17) * (1 + 0.08 * Math.sin(i * 1.7)), 10), paint('wood', '#4a3020', { rough: 0.55 }));
  wrapBand(kit, pal, -0.06 * S, 0.05 * S, r * 1.1);
  kit.add(new THREE.TorusGeometry(r * 1.2, 0.002 * S, 6, 14).rotateX(Math.PI / 2).translate(0, 0.06 * S, 0), pal.brass);
  kit.add(lathe([[0.0001, 0], [0.008 * S, 0.012 * S], [0.0001, 0.03 * S]], 6).translate(0, top, 0), paint('glow', a.held?.color2 || '#ff8ad8', { emissive: 1.1 }), { flat: true });
  return { tipAlong: top + 0.03 * S, buttAlong: -0.07 * S, offhandAlong: null };
}

// ------------------------------------------------------------------ shields

/**
 * A shield's body as columns across its width (u), each split into rows (v): a front face at +t, a
 * back face at -t, and a wall round the edge. Built this way (not as an extruded shape, whose caps
 * are a few long slivers) so that bending it afterwards bends the middle of the face too.
 * Returns { geometry (non-indexed), tags: per triangle 1 front, 2 back, 3 wall }.
 */
function shieldBody(outline, t, cols = 40, rows = 12, cutsU = [], cutsV = []) {
  const pts = outline.getSpacedPoints(240).map(p => [p.x, p.y]);
  let umin = Infinity, umax = -Infinity, vmin = Infinity, vmax = -Infinity;
  for (const [u, v] of pts) { umin = Math.min(umin, u); umax = Math.max(umax, u); vmin = Math.min(vmin, v); vmax = Math.max(vmax, v); }
  const span = (u) => {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
      const [u0, v0] = pts[i], [u1, v1] = pts[i + 1];
      if ((u0 - u) * (u1 - u) > 0 || u0 === u1) continue;
      const v = v0 + (v1 - v0) * (u - u0) / (u1 - u0); lo = Math.min(lo, v); hi = Math.max(hi, v);
    }
    return lo <= hi ? [lo, hi] : [0, 0];
  };
  // columns at a regular step plus every cut (so a painted device has a straight edge)
  const eps = (umax - umin) * 1e-4;
  const us = [...new Set([...Array.from({ length: cols + 1 }, (_, i) => umin + eps + (umax - umin - 2 * eps) * i / cols), ...cutsU.filter(u => u > umin + eps && u < umax - eps)])].sort((x, y) => x - y);
  const levels = [...new Set([...Array.from({ length: rows - 1 }, (_, j) => vmin + (vmax - vmin) * (j + 1) / rows), ...cutsV])].sort((x, y) => x - y);
  const columns = us.map(u => { const [lo, hi] = span(u); return [lo, ...levels.filter(v => v > lo + 1e-5 && v < hi - 1e-5), hi].map(v => [u, v]); });
  const pos = [], tags = [];
  const tri = (a, b, c, tag) => { pos.push(...a, ...b, ...c); tags.push(tag); };
  const F = p => [p[0], p[1], t], Bk = p => [p[0], p[1], -t];
  for (let i = 0; i < columns.length - 1; i++) {
    // zip the two columns together: always advance the side whose next point is lower
    const L = columns[i], R = columns[i + 1];
    let a = 0, b = 0;
    while (a < L.length - 1 || b < R.length - 1) {
      const nextL = a < L.length - 1 ? L[a + 1][1] : Infinity, nextR = b < R.length - 1 ? R[b + 1][1] : Infinity;
      if (nextL <= nextR) { tri(F(L[a]), F(R[b]), F(L[a + 1]), 1); tri(Bk(L[a]), Bk(L[a + 1]), Bk(R[b]), 2); a++; }
      else { tri(F(L[a]), F(R[b]), F(R[b + 1]), 1); tri(Bk(L[a]), Bk(R[b + 1]), Bk(R[b]), 2); b++; }
    }
  }
  const wall = (p, q) => { tri(F(p), Bk(p), Bk(q), 3); tri(F(p), Bk(q), F(q), 3); };
  for (let i = 0; i < columns.length - 1; i++) { wall(columns[i][0], columns[i + 1][0]); wall(columns[i + 1][columns[i + 1].length - 1], columns[i][columns[i].length - 1]); }
  const first = columns[0], last = columns[columns.length - 1];
  for (let j = 0; j < first.length - 1; j++) wall(first[j + 1], first[j]);
  for (let j = 0; j < last.length - 1; j++) wall(last[j], last[j + 1]);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return { geometry: g, tags };
}

function shieldOutline(kind, S) {
  const s = new THREE.Shape(), k = S;
  if (kind === 'kite') {
    s.moveTo(-0.2 * k, 0.33 * k); s.quadraticCurveTo(0, 0.4 * k, 0.2 * k, 0.33 * k);
    s.quadraticCurveTo(0.24 * k, 0.05 * k, 0.12 * k, -0.25 * k); s.quadraticCurveTo(0.03 * k, -0.45 * k, 0, -0.52 * k);
    s.quadraticCurveTo(-0.03 * k, -0.45 * k, -0.12 * k, -0.25 * k); s.quadraticCurveTo(-0.24 * k, 0.05 * k, -0.2 * k, 0.33 * k);
  } else if (kind === 'round') {
    s.absarc(0, 0, 0.28 * k, 0, Math.PI * 2, false);
  } else if (kind === 'tower') {
    s.moveTo(-0.24 * k, 0.5 * k); s.quadraticCurveTo(0, 0.56 * k, 0.24 * k, 0.5 * k); s.lineTo(0.24 * k, -0.5 * k); s.quadraticCurveTo(0, -0.56 * k, -0.24 * k, -0.5 * k); s.lineTo(-0.24 * k, 0.5 * k);
  } else {
    s.moveTo(-0.25 * k, 0.3 * k); s.lineTo(0.25 * k, 0.3 * k); s.lineTo(0.25 * k, 0.06 * k);
    s.quadraticCurveTo(0.24 * k, -0.18 * k, 0, -0.35 * k); s.quadraticCurveTo(-0.24 * k, -0.18 * k, -0.25 * k, 0.06 * k); s.lineTo(-0.25 * k, 0.3 * k);
  }
  return s;
}

/**
 * Build a shield in its own frame (u across, v up, w out of the face) and return the kit. The face
 * is painted in `color` with a `color2` device (cross, chevron or rings).
 */
function buildShield(kit, pal, S, kind, a, buckler) {
  const sc = buckler ? 0.55 : 1, k = S * sc;
  const outline = shieldOutline(kind, k);
  const depth = 0.014 * k, bevel = 0.007 * k;
  const face = a.offhand?.color || '#2a4a9a', device = a.offhand?.color2 && a.offhand.color2 !== face ? a.offhand.color2 : '#d8b040';
  const field = paint('leather', face, { rough: 0.55, detail: 0.45, wear: 0.4 });
  const charge = paint('leather', device, { rough: 0.5, detail: 0.4, wear: 0.4 });
  const back = paint('wood', '#5a3e28', { rough: 0.75 });
  const bar = 0.034 * k, crossV = (kind === 'kite' ? 0.1 : kind === 'tower' ? 0.12 : 0.06) * k;
  const onDevice = (u, v) => {
    if (kind === 'round') return (u > 0) !== (v > 0);                     // quartered
    return Math.abs(u) < bar || Math.abs(v - crossV) < bar;                  // a cross
  };
  const { geometry: bodyGeo, tags } = shieldBody(outline, depth / 2 + bevel, kind === 'round' ? 30 : 30, kind === 'round' ? 22 : 10, [-bar, bar, 0], [crossV - bar, crossV + bar, 0]);
  kit.add(bodyGeo, (u, v, w, tri) => tags[tri] === 1 ? (onDevice(u, v) ? charge : field) : tags[tri] === 2 ? back : pal.dark, { flat: true });
  // a metal rim round the edge, standing proud of the face
  const pts = outline.getSpacedPoints(96);
  const rimPath = pts.slice(0, -1).map(p => V(p.x, p.y, depth / 2 + bevel * 0.4));
  const rim = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rimPath, true), 90, 0.0075 * k, 5, true);
  kit.add(rim, pal.flat);
  // studs along the rim
  for (let i = 0; i < 16; i++) { const p = outline.getPointAt(i / 16); kit.add(new THREE.SphereGeometry(0.0055 * k, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).translate(p.x * 0.92, p.y * 0.92, depth / 2 + bevel * 0.8), pal.brass); }
  // the boss
  const bossR = (kind === 'round' ? 0.075 : 0.05) * k;
  kit.add(new THREE.SphereGeometry(bossR, 20, 7, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).scale(1, 1, 0.6).translate(0, kind === 'heater' ? 0.04 * k : 0, depth / 2 + bevel * 0.6), pal.bevel);
  kit.add(new THREE.TorusGeometry(bossR, 0.006 * k, 6, 24).translate(0, kind === 'heater' ? 0.04 * k : 0, depth / 2 + bevel * 0.6), pal.brass);
  // on the back: a leather pad, and two arm loops (enarmes) standing off it to meet the forearm
  const backW = -depth / 2 - bevel;
  kit.add(new THREE.BoxGeometry(0.3 * k, 0.12 * k, 0.008 * k, 12, 4, 1).translate(0, 0.04 * k, backW - 0.004 * k), pal.leather2, { flat: true });
  for (const u of [-0.08, 0.08]) {
    const loop = new THREE.TorusGeometry(0.045 * k, 0.007 * k, 6, 18, Math.PI).rotateY(Math.PI / 2).rotateX(-Math.PI / 2);   // the arc stands off the BACK (-w)
    kit.add(loop.scale(1, 1, 0.9).translate(u * k, 0.04 * k, backW - 0.008 * k), pal.leather);
  }
  // curve the whole shield: the edges fall back from the face
  const curve = kind === 'round' ? 0.55 : 0.95;
  kit.warp((u, v, w) => [u, v, w - (u * u) / k * curve - (kind === 'round' ? (v * v) / k * curve : 0)]);
}

// ------------------------------------------------------------------ assembly

/** The grip's bind matrix (bone position, Euler(PI/2, 0, 0)). */
function gripMatrix(R, side) {
  const p = R.byName['grip' + side].pos;
  return new THREE.Matrix4().compose(V(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)), V(1, 1, 1));
}

/** Shield frame on the outer left forearm: u along the forearm (toward the elbow), v forward, w out. */
function shieldMatrix(R, S, kind) {
  const el = R.byName.foreArmL.pos, wr = R.byName.handL.pos;
  const d = norm([wr[0] - el[0], wr[1] - el[1], wr[2] - el[2]]);
  const U = V(-d[0], -d[1], -d[2]), Vv = V(0, 0, 1), N = new THREE.Vector3().crossVectors(U, Vv).normalize();
  Vv.crossVectors(N, U).normalize();
  const t = 0.52, gap = 0.095 * S;   // forearm + a vambrace + the shield's own back + the loops
  const c = V(el[0] + (wr[0] - el[0]) * t, el[1] + (wr[1] - el[1]) * t, el[2] + (wr[2] - el[2]) * t).addScaledVector(N, gap).addScaledVector(Vv, (kind === 'round' ? 0 : -0.04) * S);
  return new THREE.Matrix4().makeBasis(U, Vv, N).setPosition(c);
}

function addItem(asm, name, bone, built) {
  const { geometry, paints } = built;
  asm.addGeometry({ name, geometry, bone, paint: paints[0], ao: false, paintFn: (x, y, z, P, v) => paints[v] || P });
  return built.triangles;
}

/**
 * Build what the hands carry. Returns the HOLD record the animator reads:
 *   { right, left, twoHanded, ids: { held, offhand }, grips, triangles }
 * right: 'none' | 'sword' | 'greatsword' | 'axe' | 'greataxe' | 'mace' | 'hammer' | 'dagger' | 'spear' | 'staff' | 'wand'
 * left:  'none' | 'shield' | 'axe' | 'sword' | 'dagger' | 'orb' | 'book' | 'torch'
 * grips (grip-local metres along +y, the handle axis):
 *   right.tipAlong / buttAlong     where the item ends (for trails, hit points)
 *   right.offhandAlong             two-handed: where the LEFT hand closes on the handle (negative =
 *                                  toward the butt). Also given for staves and spears, where a
 *                                  second hand is optional.
 *   right.headAlong / gemAlong     the head of an axe/mace, a staff's crystal (spell origin)
 *   left.*                         the same for a left-hand item; left.shield: true when strapped
 */
export function buildHeld(a, R, body, asm, opts = {}) {
  const heldId = a.held?.id || 'none', offId = a.offhand?.id || 'none';
  const S = R.P.S, h = R.P.hand;
  const variant = NOT_HELD.has(heldId) ? 'none' : heldKind(heldId) === 'none' ? 'none' : (lookup(RIGHT, heldId) || heldKind(heldId));
  const [right, twoHanded] = FAMILY[variant] || ['sword', false];
  const hold = { right, left: 'none', twoHanded, ids: { held: heldId, offhand: offId }, grips: { right: null, left: null }, triangles: 0 };
  const lodSkip = opts.lod === 2;
  if (variant !== 'none') {
    const kit = new Kit(), pal = palette(a.held?.color && a.held.color !== '#9a9aa8' ? a.held.color : '#c4ccd4', a.held?.color2);
    let g;
    if (['sword', 'longsword', 'sabre', 'rapier', 'greatsword', 'dagger'].includes(variant)) g = buildSword(kit, pal, S, h, variant);
    else if (variant === 'axe' || variant === 'greataxe') g = buildAxe(kit, pal, S, h, variant === 'greataxe');
    else if (variant === 'mace' || variant === 'hammer' || variant === 'maul') g = buildMace(kit, pal, S, h, variant);
    else if (variant === 'spear' || variant === 'halberd') g = buildSpear(kit, pal, S, h, variant === 'halberd');
    else if (variant === 'staff' || variant === 'quarterstaff') g = buildStaff(kit, palette('#8a8f96', a.held?.color2), S, h, heldId, a);
    else if (variant === 'wand') g = buildWand(kit, pal, S, h, a);
    hold.grips.right = g;
    if (!lodSkip || true) hold.triangles += addItem(asm, 'held', 'gripR', kit.finish(gripMatrix(R, 'R')));
  }
  // the off hand: nothing if the main weapon takes both hands
  let leftKind = twoHanded ? 'none' : offhandKind(offId);
  if (leftKind === 'none' && (heldId === 'daggers' || heldId === 'fh_daggers')) leftKind = 'dagger';
  hold.left = LEFT_FAMILY[leftKind] || 'none';
  if (leftKind !== 'none') {
    const kit = new Kit(), pal = palette(a.offhand?.color && ['dagger', 'axe', 'sword'].includes(leftKind) ? a.offhand.color : '#b9c2cc', a.offhand?.color2);
    if (['shield', 'kite', 'round', 'tower'].includes(leftKind)) {
      const kind = leftKind === 'shield' ? 'heater' : leftKind, buckler = offId === 'buckler';
      buildShield(kit, palette('#aab3bd', a.offhand?.color2), S, kind, a, buckler);
      hold.grips.left = { shield: true, kind, faceAlong: 0.05 * S };
      hold.triangles += addItem(asm, 'offhand', 'foreArmL', kit.finish(shieldMatrix(R, S, kind)));
    } else {
      let g;
      if (leftKind === 'dagger') g = buildSword(kit, palette(a.held?.color || '#c4ccd4'), S, h, 'dagger');
      else if (leftKind === 'sword') g = buildSword(kit, pal, S, h, 'sword');
      else if (leftKind === 'axe') g = buildAxe(kit, pal, S, h, false);
      else if (leftKind === 'orb') {
        const glow = a.offhand?.color2 || a.offhand?.color || '#9a7aff';
        kit.add(new THREE.SphereGeometry(0.045 * S, 28, 20).translate(0, 0.0, -0.062 * S), paint('glow', glow, { emissive: 0.45, rough: 0.05 }));
        for (let i = 0; i < 4; i++) {
          const ang = i / 4 * Math.PI * 2, c = new THREE.CatmullRomCurve3([V(Math.cos(ang) * 0.012 * S, 0, -0.012 * S + Math.sin(ang) * 0.012 * S), V(Math.cos(ang) * 0.042 * S, 0, -0.03 * S + Math.sin(ang) * 0.042 * S), V(Math.cos(ang) * 0.035 * S, 0, -0.07 * S + Math.sin(ang) * 0.035 * S)]);
          kit.add(new THREE.TubeGeometry(c, 10, 0.0035 * S, 6, false), pal.brass);
        }
        g = { tipAlong: 0, buttAlong: 0, orbAt: [0, 0, -0.062 * S] };
      } else if (leftKind === 'book') {
        const w = 0.13 * S, ht = 0.18 * S, th = 0.035 * S;
        const cover = paint('leather', a.offhand?.color || '#5a2a2a', { rough: 0.6, wear: 0.5 });
        kit.add(new THREE.BoxGeometry(th, ht, w).translate(0, 0, -w * 0.25), cover, { flat: true });
        kit.add(new THREE.BoxGeometry(th * 0.8, ht * 0.95, w * 0.96).translate(0.0, 0, -w * 0.25 + w * 0.03), paint('cloth', '#e8dcc0', { rough: 0.9, detail: 0.3 }), { flat: true });
        for (const s of [-1, 1]) kit.add(new THREE.BoxGeometry(th * 1.06, 0.02 * S, 0.02 * S).translate(0, s * ht * 0.42, -w * 0.25 + w * 0.48), pal.brass, { flat: true });
        g = { tipAlong: 0, buttAlong: 0 };
      } else if (leftKind === 'torch') {
        haft(kit, pal, -0.1 * S, 0.3 * S, 0.014 * S, 0.016 * S);
        wrapBand(kit, pal, 0.2 * S, 0.3 * S, 0.018 * S);
        kit.add(lathe([[0.022 * S, 0.29 * S], [0.03 * S, 0.33 * S], [0.018 * S, 0.4 * S], [0.0001, 0.45 * S]], 10), paint('glow', '#ffa040', { emissive: 1.6, rough: 0.9 }), { flat: true });
        g = { tipAlong: 0.45 * S, buttAlong: -0.1 * S, flameAlong: 0.36 * S };
      }
      hold.grips.left = g;
      hold.triangles += addItem(asm, 'offhand', 'gripL', kit.finish(gripMatrix(R, 'L')));
    }
  }
  return hold;
}
