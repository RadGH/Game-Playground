// Chibi 2 — TIER-2 CLASS ARMOUR and EMBLEMS (Thousandvale play-test 4, S18, 2026-10-05).
//
// "Second tier of armour for every class with iconography (flames, lightning bolts, poison drops…) on
// higher-level gear." Two opt-in additions, both drawn by `buildArmour2(a, c)` (called by chibi2.js
// right after buildGear, with the same context):
//
//   1. `top.emblem` (+ `top.emblemColor`, optional `top.emblemBack: false`) — an icon in relief on a
//      (and `hat.emblem` / `hat.emblemColor` — the same icon on the helm brow)
//      backing disc on the chest, and again on the back (on a long cape if one is worn, else on the
//      body). The ids are EMBLEM_IDS below: flame, bolt, drop, frost, sun, skull, leaf, rune, blood,
//      moon, eye, hourglass, fist, note, cog, arrow, sword, shield, cross, claw, coin, feather, star,
//      crown. Extra fields on a slot survive the shared 2D normaliser (it Object.assigns a slot), so no
//      registration is needed for them.
//   2. Five tier-2 DECOR kits — bigger silhouettes, trimmed, carrying the emblem on their own faces:
//        t2_pauldrons   layered plate pauldrons with a crest fin and a gorget (martial)
//        t2_mantle      a high flared collar, shoulder caps with gems, a stole down the front (casters)
//        t2_harness     one great leather pauldron, a baldric with the emblem as its buckle, bracers (agile)
//        t2_vestments   a long trimmed tabard with the emblem on it, shoulder caps, a cord belt (holy)
//        t2_wildmantle  a fur ring with horns/antlers and tufts in the emblem colour (nature / spirit)
//      `decor.color` is the kit, `decor.color2` its trim. The ids are registered in
//      avatar-2d/js/parts/chibi2-parts.js (the normaliser drops ids it does not know).
//
// NOTHING here runs for a look that names neither — every existing outfit builds exactly the geometry
// it always did (tests/class-outfits-t2.test.js compares vertex counts with and without this file).
// The tier-2 OUTFITS (one per class) are data: avatar-3d/data/class-outfits-t2.json, read through
// class-outfits.js (`loadClassOutfits2`, `tier2Dress`).

import * as THREE from 'three';
import { profile, taperedCurve } from './chibi2-geometry.js';

export const T2_DECOR = ['t2_pauldrons', 't2_mantle', 't2_harness', 't2_vestments', 't2_wildmantle'];

const tone = (c, k) => '#' + new THREE.Color(c).multiplyScalar(k).getHexString();
const lift = (c, k) => '#' + new THREE.Color(c).lerp(new THREE.Color('#ffffff'), k).getHexString();
const gem = () => new THREE.IcosahedronGeometry(1, 0);
const low = () => new THREE.SphereGeometry(1, 8, 5);

// ---------------------------------------------------------------- emblem shapes (unit box, y up)
const P = (pts) => { const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]); s.closePath(); return s; };
const pathOf = (pts) => { const s = new THREE.Path(); s.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]); s.closePath(); return s; };
const circlePts = (cx, cy, r, n = 18, rev = false) => Array.from({ length: n }, (_, i) => { const t = (rev ? -1 : 1) * i / n * Math.PI * 2; return [cx + Math.cos(t) * r, cy + Math.sin(t) * r]; });
const circle = (cx, cy, r, n) => P(circlePts(cx, cy, r, n));
const hole = (shape, pts) => { shape.holes.push(pathOf(pts)); return shape; };
/** A bar from (x1,y1) to (x2,y2), w wide. */
const bar = (x1, y1, x2, y2, w) => {
  const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, nx = -dy / L * w / 2, ny = dx / L * w / 2;
  return P([[x1 + nx, y1 + ny], [x2 + nx, y2 + ny], [x2 - nx, y2 - ny], [x1 - nx, y1 - ny]]);
};
const rot = (pts, a, cx = 0, cy = 0) => pts.map(([x, y]) => [cx + (x - cx) * Math.cos(a) - (y - cy) * Math.sin(a), cy + (x - cx) * Math.sin(a) + (y - cy) * Math.cos(a)]);
const scalePts = (pts, k, ox = 0, oy = 0) => pts.map(([x, y]) => [ox + x * k, oy + y * k]);

function flamePts(k = 1, oy = 0) {
  const s = new THREE.Shape();
  const m = (x, y) => [x * k, y * k + oy];
  s.moveTo(...m(0, -1));
  s.quadraticCurveTo(...m(0.82, -1), ...m(0.76, -0.3));
  s.quadraticCurveTo(...m(0.74, 0.15), ...m(0.55, 0.52));
  s.quadraticCurveTo(...m(0.46, 0.12), ...m(0.28, 0.06));
  s.quadraticCurveTo(...m(0.38, 0.62), ...m(0, 1));
  s.quadraticCurveTo(...m(-0.18, 0.5), ...m(-0.3, 0.14));
  s.quadraticCurveTo(...m(-0.36, 0.44), ...m(-0.56, 0.62));
  s.quadraticCurveTo(...m(-0.78, 0.12), ...m(-0.76, -0.3));
  s.quadraticCurveTo(...m(-0.82, -1), ...m(0, -1));
  return s;
}
function dropShape(k = 1, ox = 0, oy = 0) {
  const s = new THREE.Shape();
  s.moveTo(ox, oy + k);
  s.quadraticCurveTo(ox + 0.62 * k, oy + 0.12 * k, ox + 0.6 * k, oy - 0.35 * k);
  s.absarc(ox, oy - 0.35 * k, 0.6 * k, 0, Math.PI, true);
  s.quadraticCurveTo(ox - 0.62 * k, oy + 0.12 * k, ox, oy + k);
  return s;
}
function almond(w, h, ox = 0, oy = 0) {
  const s = new THREE.Shape();
  s.moveTo(ox - w, oy); s.quadraticCurveTo(ox, oy + h * 2, ox + w, oy); s.quadraticCurveTo(ox, oy - h * 2, ox - w, oy);
  return s;
}
function crescentPts(R = 0.86, r = 0.72, cx2 = 0.38, cy2 = 0.12) {
  const d = Math.hypot(cx2, cy2), ux = cx2 / d, uy = cy2 / d, a = (R * R - r * r + d * d) / (2 * d), h = Math.sqrt(Math.max(0, R * R - a * a));
  const p1 = [a * ux - h * uy, a * uy + h * ux], p2 = [a * ux + h * uy, a * uy - h * ux];
  const t1 = Math.atan2(p1[1], p1[0]), t2 = Math.atan2(p2[1], p2[0]);
  const out = [], n = 20;
  // outer arc from p1 round the far side (away from the inner centre) to p2
  let e = t2; while (e < t1) e += Math.PI * 2;
  for (let i = 0; i <= n; i++) { const t = t1 + (e - t1) * i / n; out.push([Math.cos(t) * R, Math.sin(t) * R]); }
  // inner arc back from p2 to p1, on the inner circle's near side
  const s2 = Math.atan2(p2[1] - cy2, p2[0] - cx2), s1 = Math.atan2(p1[1] - cy2, p1[0] - cx2);
  let e2 = s1; while (e2 < s2) e2 += Math.PI * 2;
  for (let i = 1; i < n; i++) { const t = s2 + (e2 - s2) * i / n; out.push([cx2 + Math.cos(t) * r, cy2 + Math.sin(t) * r]); }
  return out;
}
function starPts(n = 5, R = 1, r = 0.42, a0 = Math.PI / 2) {
  return Array.from({ length: n * 2 }, (_, i) => { const t = a0 + i / (n * 2) * Math.PI * 2, rr = i % 2 ? r : R; return [Math.cos(t) * rr, Math.sin(t) * rr]; });
}

/**
 * Every emblem as layers: `[{ shapes, k }]`. Layer 0 is the icon in the emblem colour; a later layer
 * stands a little proud of it in a lighter (k > 0) or darker (k < 0) shade — a flame's hot core, an
 * eye's pupil, a drop's glint.
 */
export const EMBLEMS = {
  flame: () => [{ shapes: [flamePts()] }, { shapes: [flamePts(0.5, -0.4)], k: 0.55 }],
  bolt: () => [{ shapes: [P([[0.22, 1], [-0.58, -0.06], [-0.06, -0.06], [-0.32, -1], [0.58, 0.16], [0.06, 0.16], [0.48, 1]])] }],
  drop: () => [{ shapes: [dropShape()] }, { shapes: [almond(0.1, 0.12, -0.22, -0.2)], k: 0.7 }],
  blood: () => [{ shapes: [dropShape(0.8, -0.18, 0.15), dropShape(0.38, 0.58, -0.38), dropShape(0.26, 0.5, 0.5)] }],
  frost: () => {
    const shapes = [];
    for (let i = 0; i < 3; i++) {
      const a = i * Math.PI / 3, c = Math.cos(a), s = Math.sin(a);
      shapes.push(bar(-c, -s, c, s, 0.16));
      for (const sg of [-1, 1]) for (const b of [-1, 1]) {
        const px = c * sg * 0.55, py = s * sg * 0.55, ba = a + (sg < 0 ? Math.PI : 0) + b * 0.8;
        shapes.push(bar(px, py, px + Math.cos(ba) * 0.32, py + Math.sin(ba) * 0.32, 0.12));
      }
    }
    return [{ shapes }, { shapes: [P(circlePts(0, 0, 0.16, 6))], k: 0.6 }];
  },
  sun: () => [{ shapes: [circle(0, 0, 0.46, 20), ...Array.from({ length: 8 }, (_, i) => P(rot([[0, 1], [-0.16, 0.5], [0.16, 0.5]], i * Math.PI / 4)))] }, { shapes: [circle(0, 0, 0.28, 16)], k: 0.5 }],
  skull: () => {
    const head = P([...circlePts(0, 0.18, 0.7, 22)]);
    hole(head, circlePts(-0.27, 0.12, 0.18, 10, true)); hole(head, circlePts(0.27, 0.12, 0.18, 10, true));
    hole(head, [[0, -0.08], [0.08, -0.24], [-0.08, -0.24]]);
    const jaw = P([[-0.42, -0.36], [0.42, -0.36], [0.36, -0.8], [-0.36, -0.8]]);
    for (const x of [-0.18, 0, 0.18]) hole(jaw, [[x - 0.04, -0.46], [x - 0.04, -0.7], [x + 0.04, -0.7], [x + 0.04, -0.46]]);
    return [{ shapes: [head, jaw] }];
  },
  leaf: () => {
    const l = new THREE.Shape(); l.moveTo(0, 1); l.quadraticCurveTo(0.85, 0.25, 0, -0.78); l.quadraticCurveTo(-0.85, 0.25, 0, 1);
    hole(l, [[0, 0.78], [-0.035, 0.05], [0, -0.6], [0.035, 0.05]]);
    return [{ shapes: [l, bar(0, -0.76, 0.08, -1, 0.1)] }];
  },
  rune: () => {
    const frame = P([[0, 1], [0.78, 0], [0, -1], [-0.78, 0]]);
    hole(frame, [[0, 0.8], [-0.6, 0], [0, -0.8], [0.6, 0]]);
    return [{ shapes: [frame] }, { shapes: [bar(0, 0.62, 0, -0.62, 0.13), bar(0, 0.3, 0.3, 0.55, 0.11), bar(0, 0.3, -0.3, 0.55, 0.11), bar(0, -0.2, 0.28, -0.46, 0.11), bar(0, -0.2, -0.28, -0.46, 0.11)], k: 0.4 }];
  },
  moon: () => [{ shapes: [P(crescentPts())] }, { shapes: [P(scalePts(starPts(4, 1, 0.35), 0.2, 0.45, 0.42))], k: 0.6 }],
  eye: () => {
    const outer = almond(1, 0.36); hole(outer, circlePts(0, 0, 0.34, 16, true));
    return [{ shapes: [outer] }, { shapes: [circle(0, 0, 0.26, 14)], k: 0.5 }, { shapes: [almond(0.07, 0.14)], k: -0.75 }];
  },
  hourglass: () => [{ shapes: [bar(-0.6, 0.9, 0.6, 0.9, 0.16), bar(-0.6, -0.9, 0.6, -0.9, 0.16), P([[-0.46, 0.8], [0.46, 0.8], [0.06, 0], [0.46, -0.8], [-0.46, -0.8], [-0.06, 0]])] }, { shapes: [P([[-0.28, -0.74], [0.28, -0.74], [0, -0.35]])], k: 0.55 }],
  fist: () => {
    const f = P([[-0.58, 0.45], [-0.58, -0.45], [-0.3, -0.85], [0.42, -0.85], [0.62, -0.5], [0.62, 0.45], [0.45, 0.62], [-0.42, 0.62]]);
    for (const x of [-0.29, 0.02, 0.32]) hole(f, [[x - 0.025, 0.6], [x - 0.025, 0.1], [x + 0.025, 0.1], [x + 0.025, 0.6]]);
    return [{ shapes: [f] }, { shapes: [P([[-0.58, 0.05], [0.25, 0.05], [0.25, -0.12], [-0.58, -0.12]])], k: -0.35 }];
  },
  note: () => [{ shapes: [P(rot(circlePts(-0.3, -0.62, 0.3, 14).map(([x, y]) => [x, -0.62 + (y + 0.62) * 0.72]), -0.4, -0.3, -0.62)), bar(-0.02, -0.6, -0.02, 0.95, 0.12), P([[-0.08, 0.95], [0.08, 0.95], [0.55, 0.55], [0.48, 0.28], [0.08, 0.6]])] }],
  cog: () => {
    const teeth = [];
    for (let i = 0; i < 16; i++) { const t = i / 16 * Math.PI * 2, r = i % 2 ? 0.66 : 0.92; teeth.push([Math.cos(t - 0.12) * r, Math.sin(t - 0.12) * r], [Math.cos(t + 0.12) * r, Math.sin(t + 0.12) * r]); }
    const g = P(teeth); hole(g, circlePts(0, 0, 0.28, 12, true));
    return [{ shapes: [g] }];
  },
  arrow: () => [{ shapes: [bar(0, -0.75, 0, 0.55, 0.12), P([[0, 1], [0.3, 0.5], [-0.3, 0.5]]), P([[0, -0.5], [0.3, -0.75], [0.3, -1], [0, -0.75]]), P([[0, -0.5], [-0.3, -0.75], [-0.3, -1], [0, -0.75]])] }],
  sword: () => [{ shapes: [P([[0, 1], [0.13, 0.78], [0.13, -0.38], [-0.13, -0.38], [-0.13, 0.78]]), bar(-0.5, -0.42, 0.5, -0.42, 0.14), bar(0, -0.45, 0, -0.84, 0.11), circle(0, -0.92, 0.1, 10)] }, { shapes: [bar(0, 0.72, 0, -0.32, 0.05)], k: 0.5 }],
  shield: () => {
    const s = new THREE.Shape(); s.moveTo(-0.78, 0.82); s.lineTo(0.78, 0.82); s.lineTo(0.76, 0.05); s.quadraticCurveTo(0.6, -0.65, 0, -1); s.quadraticCurveTo(-0.6, -0.65, -0.76, 0.05); s.closePath();
    return [{ shapes: [s] }, { shapes: [P([[-0.62, 0.3], [0, -0.22], [0.62, 0.3], [0.62, 0.05], [0, -0.47], [-0.62, 0.05]])], k: 0.45 }];
  },
  cross: () => [{ shapes: [P([[-0.16, 1], [0.16, 1], [0.08, 0.25], [0.8, 0.16], [0.8, -0.16], [0.08, -0.12], [0.18, -1], [-0.18, -1], [-0.08, -0.12], [-0.8, -0.16], [-0.8, 0.16], [-0.08, 0.25]])] }],
  claw: () => [{ shapes: [-0.45, 0, 0.45].map(x => P([[x - 0.12, 0.95], [x + 0.06, 0.9], [x + 0.2, 0.1], [x + 0.05, -0.95], [x - 0.02, 0.05]])) }],
  coin: () => { const c = circle(0, 0, 0.9, 22); hole(c, [[-0.24, 0.24], [-0.24, -0.24], [0.24, -0.24], [0.24, 0.24]].reverse()); return [{ shapes: [c] }, { shapes: [hole(circle(0, 0, 0.74, 20), circlePts(0, 0, 0.64, 20, true))], k: 0.45 }]; },
  feather: () => {
    const f = new THREE.Shape(); f.moveTo(0.05, 1); f.quadraticCurveTo(0.6, 0.2, 0.08, -0.7); f.lineTo(-0.08, -0.7); f.quadraticCurveTo(-0.45, 0.3, 0.05, 1);
    hole(f, [[0.04, 0.82], [0.01, 0.82], [-0.02, -0.6], [0.02, -0.6]]);
    return [{ shapes: [P(rot([[0.05, 1], [0.32, 0.6], [0.36, 0.1], [0.08, -0.7], [-0.08, -0.7], [-0.3, 0.0], [-0.22, 0.55]], -0.35)), bar(-0.02, -0.65, 0.22, -1, 0.07)] }, { shapes: [bar(...rot([[0.05, 0.85], [-0.02, -0.62]], -0.35).flat(), 0.045)], k: -0.4 }];
  },
  star: () => [{ shapes: [P(starPts())] }, { shapes: [P(starPts(5, 0.45, 0.2))], k: 0.5 }],
  crown: () => [{ shapes: [P([[-0.8, -0.6], [0.8, -0.6], [0.8, 0.5], [0.42, 0.05], [0, 0.7], [-0.42, 0.05], [-0.8, 0.5]]), ...[-0.8, 0, 0.8].map(x => circle(x, x ? 0.6 : 0.82, 0.13, 10))] }, { shapes: [bar(-0.7, -0.4, 0.7, -0.4, 0.12)], k: 0.5 }],
};
// stream C/E's armour-tiers.json names three of them differently
EMBLEMS.snowflake = EMBLEMS.frost; EMBLEMS.sunburst = EMBLEMS.sun; EMBLEMS.gear = EMBLEMS.cog;
export const EMBLEM_IDS = Object.keys(EMBLEMS);

/** One emblem as [{geometry, k}] in a unit box, `depth` thick, front face at +z, centred on z = 0. */
export function emblemGeometries(id, depth = 0.25) {
  const make = EMBLEMS[id] || EMBLEMS.star;
  return make().map((layer, i) => {
    const g = new THREE.ExtrudeGeometry(layer.shapes, { depth, bevelEnabled: false, curveSegments: 4 });
    g.translate(0, 0, -depth / 2 + i * depth * 0.55);
    return { geometry: g, k: layer.k || 0 };
  });
}

/**
 * (Exported for the shield builder: a themed shield's `offhand.emblem` belongs on its face — `placeEmblem(c.add,
 * 'elbowL', id, colour, { position, rotation, size })`.)
 * Lay an emblem: `size` metres across (half-size), at `position` in `bone` space, facing `face` (an
 * Euler — [0,0,0] faces +z), on a backing disc of `back` colour with a `rim` ring. Everything rigid.
 */
export function placeEmblem(add, bone, id, color, { position, rotation = [0, 0, 0], size = 0.06, back = '#2a2a30', rim = '#d8b040', disc = true, tilt = 0 }) {
  const e = new THREE.Euler(rotation[0] + tilt, rotation[1], rotation[2]);
  const fwd = new THREE.Vector3(0, 0, 1).applyEuler(e);
  const at = (d) => new THREE.Vector3(...position).addScaledVector(fwd, d).toArray();
  const r = [e.x, e.y, e.z];
  if (disc) {
    add(new THREE.CylinderGeometry(size * 1.32, size * 1.32, size * 0.18, 20), bone, back, { position: at(0), rotation: new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromEuler(e).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)))).toArray().slice(0, 3), metal: true });
    add(new THREE.TorusGeometry(size * 1.32, size * 0.14, 4, 20), bone, rim, { position: at(size * 0.08), rotation: r, metal: true });
  }
  for (const { geometry, k } of emblemGeometries(id)) {
    const col = k > 0 ? lift(color, k) : k < 0 ? tone(color, 1 + k) : color;
    add(geometry, bone, col, { position: at(size * 0.16), rotation: r, scale: [size, size, size * 0.5], metal: true });
  }
}

/** Where a long cape's back face is at a share `v` down it: [y, z, tilt] in chest space (chibi2-gear.js drape). */
const CAPE_SHEETS = { cape: [0.30, 0.70, -0.15, -0.32], travel_cloak: [0.31, 0.86, -0.155, -0.36], tattered_cape: [0.30, 0.72, -0.15, -0.3] };
function capeBack(id, W, T, v = 0.32) {
  const s = CAPE_SHEETS[id]; if (!s) return null;
  const [top, length, zTopW, zBottom] = s, zTop = zTopW * W;
  const y = top * T - v * length, z = zTop + (zBottom - zTop) * v - 0.012;
  return { y, z, tilt: Math.atan2(-(zBottom - zTop), length) };
}

/**
 * Where a helm's brow is, in head space (head spans y 0..0.60, +z forward; positions scale by H): the emblem sits
 * there, a little proud of whatever the hat is. Hats not listed use the default.
 */
export const BROW = {
  default: [0, 0.47, 0.37], hood: [0, 0.53, 0.43], wizard: [0, 0.52, 0.41], circlet: [0, 0.44, 0.345], headband: [0, 0.43, 0.35],
  war_helm: [0, 0.48, 0.38], horned_helm: [0, 0.48, 0.38], great_helm: [0, 0.47, 0.385], plate_helm: [0, 0.5, 0.37], dragon_helm: [0, 0.4, 0.38],
  rune_helm: [0, 0.47, 0.38], wolf_helm: [0, 0.56, 0.36], bone_headdress: [0, 0.45, 0.35], tricorn: [0, 0.6, 0.36], feather_cap: [0, 0.5, 0.37],
  wide_brim: [0, 0.55, 0.33], leather_cap: [0, 0.48, 0.37], goggles_up: [0, 0.55, 0.36], chain_coif: [0, 0.48, 0.37],
};
function helmBrow(a, c, id) {
  const p = BROW[a.hat.id] || BROW.default, col = a.hat.emblemColor || a.top?.emblemColor || '#ffcf4a', rim = a.hat.color2 || '#d8b040';
  // built in head units then handed to head(), which scales positions and sizes by H
  const parts = [];
  placeEmblem((g, bone, colour, o) => parts.push([g, colour, o]), 'head', id, col, { position: p, rotation: [-0.25, 0, 0], size: 0.05, back: tone(a.hat.color || '#555', 0.6), rim });
  for (const [g, colour, o] of parts) c.head(g, colour, o);
}

// ---------------------------------------------------------------- the build
export function buildArmour2(a, c) {
  const decor = a.decor?.id || 'none', emblem = a.top?.emblem || null;
  const kit = T2_DECOR.includes(decor), brow = a.hat?.emblem && a.hat.id && a.hat.id !== 'none' ? a.hat.emblem : null;
  if (!kit && !emblem && !brow) return;                        // every existing look: nothing at all
  if (brow) helmBrow(a, c, brow);
  const { add, W, T, chestZ, topStyle } = c;
  const ec = a.top?.emblemColor || '#ffcf4a';
  const dc = a.decor?.color || '#6a6a72', trim = a.decor?.color2 || a.top?.color2 || c.trim || '#d8b040';
  const emblemId = emblem || 'star';
  const plate = topStyle?.armor === 'plate', armoured = !!topStyle?.armor;
  const front = (y, lift0) => chestZ(0, y, 1, lift0);

  // ---- the kits
  if (decor === 't2_pauldrons') pauldrons(a, c, dc, trim, emblem ? emblemId : null, ec);
  if (decor === 't2_mantle') mantle(a, c, dc, trim, emblem ? emblemId : null, ec);
  if (decor === 't2_harness') harness(a, c, dc, trim, emblem ? emblemId : null, ec);
  if (decor === 't2_vestments') vestments(a, c, dc, trim, emblem ? emblemId : null, ec);
  if (decor === 't2_wildmantle') wildmantle(a, c, dc, trim, emblem ? emblemId : null, ec);
  if (!emblem) return;

  // ---- the chest emblem (the harness carries it as its buckle, the vestments on the tabard)
  if (decor !== 't2_harness' && decor !== 't2_vestments') {
    const y = 0.11 * T, z = front(y, plate ? 0.05 : armoured ? 0.03 : 0.018);
    placeEmblem(add, 'chest', emblemId, ec, { position: [0, y, z], size: 0.052 * Math.min(W, 1.25), back: tone(a.top?.color || '#333', 0.55), rim: trim });
  }
  // ---- and on the back: a long cape carries it, a capelet or no cape puts it on the body
  if (a.top?.emblemBack === false || decor === 't2_vestments') return;
  const cb = capeBack(a.cape?.id, W, T);
  if (cb) placeEmblem(add, 'chest', emblemId, ec, { position: [0, cb.y, cb.z], rotation: [0, Math.PI, 0], tilt: -cb.tilt, size: 0.08 * Math.min(W, 1.25), back: tone(a.cape.color || '#333', 0.6), rim: trim });
  else if (a.cape?.id === 'none' || !a.cape?.id || a.cape?.id === 'shoulder_cape' || a.cape?.id === 'fur_mantle' || a.cape?.id === 'feather_mantle') {
    const y = (['shoulder_cape', 'fur_mantle', 'feather_mantle'].includes(a.cape?.id) ? -0.02 : 0.1) * T;
    placeEmblem(add, 'chest', emblemId, ec, { position: [0, y, chestZ(0, y, -1, plate ? 0.05 : 0.02)], rotation: [0, Math.PI, 0], size: 0.06 * Math.min(W, 1.25), back: tone(a.top?.color || '#333', 0.55), rim: trim });
  }
}

/** Layered plate pauldrons, a crest fin on each, a raised gorget. Martial classes. */
function pauldrons(a, c, dc, trim, emblem, ec) {
  const { add, W, T } = c;
  for (const [side, s] of [['L', -1], ['R', 1]]) {
    const arm = 'arm' + side;
    // the shell: larger than tier 1's (and than the plate top's own shoulder caps, which it covers)
    add(profile([[-0.12, 0.192, 0.178], [-0.05, 0.198, 0.184], [0.03, 0.176, 0.166], [0.095, 0.11, 0.104], [0.128, 0.004, 0.004]], 14), arm, dc, { position: [s * 0.035, 0, 0], metal: true });
    // three lames stepping down the upper arm, each edged in trim
    for (let i = 0; i < 3; i++) {
      const y0 = -0.125 - i * 0.042, r = 0.186 - i * 0.012;
      add(profile([[y0 - 0.04, r - 0.006, r - 0.012], [y0, r, r - 0.008]], 14), arm, i % 2 ? tone(dc, 0.82) : dc, { position: [s * 0.035, 0, 0], metal: true });
      add(profile([[y0 - 0.046, r + 0.002, r - 0.004], [y0 - 0.036, r + 0.002, r - 0.004]], 14), arm, trim, { position: [s * 0.035, 0, 0], metal: true });
    }
    // rim of the shell in trim
    add(profile([[-0.128, 0.2, 0.186], [-0.112, 0.2, 0.186]], 14), arm, trim, { position: [s * 0.035, 0, 0], metal: true });
    // the crest: a fin of three teeth running front to back over the top of the shell
    const fin = new THREE.Shape();
    fin.moveTo(-0.15, 0); fin.lineTo(-0.11, 0.08); fin.lineTo(-0.06, 0.03); fin.lineTo(0.0, 0.12); fin.lineTo(0.05, 0.035); fin.lineTo(0.11, 0.09); fin.lineTo(0.15, 0); fin.closePath();
    const fg = new THREE.ExtrudeGeometry(fin, { depth: 0.018, bevelEnabled: false }); fg.translate(0, 0, -0.009);
    add(fg, arm, trim, { position: [s * 0.075, 0.085, 0], rotation: [0, Math.PI / 2, -s * 0.5], metal: true });
    // rivets
    for (const zz of [-0.12, 0.12]) add(gem(), arm, lift(trim, 0.3), { position: [s * 0.09, -0.07, zz], scale: [0.014, 0.014, 0.014], metal: true });
    if (emblem) placeEmblem(add, arm, emblem, ec, { position: [s * 0.215, -0.04, 0], rotation: [0, s * Math.PI / 2, 0], size: 0.045, back: tone(dc, 0.6), rim: trim });
  }
  // the gorget: a steel collar standing round the neck
  add(profile([[0.24 * T, 0.165 * W, 0.13 * W, -0.005], [0.3 * T, 0.145 * W, 0.12 * W, -0.008], [0.345 * T, 0.118, 0.105, -0.012]], 16), 'chest', tone(dc, 0.92), { metal: true });
  add(profile([[0.338 * T, 0.122, 0.109, -0.012], [0.352 * T, 0.122, 0.109, -0.012]], 16), 'chest', trim, { metal: true });
}

/** A high flared collar behind the head, gem-set shoulder caps and a stole down the front. Casters. */
function mantle(a, c, dc, trim, emblem, ec) {
  const { add, W, T, chestZ } = c;
  // the collar: an open cone behind the head, flaring as it rises, both faces drawn
  const collar = new THREE.CylinderGeometry(0.2 * W, 0.13 * W, 0.24, 18, 1, true, Math.PI * 0.62, Math.PI * 0.76);
  const back = collar.clone(); { const idx = back.index.array; for (let i = 0; i < idx.length; i += 3) [idx[i], idx[i + 1]] = [idx[i + 1], idx[i]]; back.computeVertexNormals(); }
  add(collar, 'chest', dc, { position: [0, 0.4 * T, -0.02] }); add(back, 'chest', tone(dc, 0.6), { position: [0, 0.4 * T, -0.02] });
  // piping round the collar's top edge, in the emblem colour
  const edge = [];
  for (let k = 0; k <= 14; k++) { const t = Math.PI * 0.62 + Math.PI * 0.76 * k / 14; edge.push([Math.sin(t) * 0.2 * W, 0.4 * T + 0.12, Math.cos(t) * 0.2 * W - 0.02]); }
  add(taperedCurve(edge, [0.008, 0.012, 0.008], 4, 20), 'chest', trim, { metal: true });
  // shoulder caps with a gem
  for (const [side, s] of [['L', -1], ['R', 1]]) {
    const arm = 'arm' + side;
    add(profile([[-0.08, 0.16, 0.15], [-0.02, 0.165, 0.155], [0.05, 0.13, 0.122], [0.1, 0.004, 0.004]], 12), arm, dc, { position: [s * 0.03, 0, 0] });
    add(profile([[-0.092, 0.168, 0.158], [-0.074, 0.168, 0.158]], 12), arm, trim, { position: [s * 0.03, 0, 0], metal: true });
    add(gem(), arm, ec, { position: [s * 0.075, 0.075, 0], scale: [0.03, 0.04, 0.03], metal: true });
    for (let k = 0; k < 3; k++) add(new THREE.ConeGeometry(0.018, 0.07, 4), arm, trim, { position: [s * (0.12 + k * 0.02), 0.02 - k * 0.04, 0], rotation: [0, 0, -s * (1.1 + k * 0.2)], metal: true });
    if (emblem) placeEmblem(add, arm, emblem, ec, { position: [s * 0.19, -0.035, 0], rotation: [0, s * Math.PI / 2, 0], size: 0.03, disc: false });
  }
  // the stole: two panels hanging from the shoulders down the front, tipped with the emblem colour
  for (const s of [-1, 1]) {
    const x = s * 0.105 * W, pts = [];
    for (let k = 0; k <= 6; k++) { const y = (0.3 - k * 0.09) * T; pts.push([x, y, chestZ(x, Math.max(y, -0.14 * T), 1, 0.03) + (y < -0.14 * T ? 0.02 : 0)]); }
    add(taperedCurve(pts, [0.03, 0.034, 0.036], 4, 14), 'chest', tone(dc, 0.85));
    const tip = pts[pts.length - 1];
    add(new THREE.BoxGeometry(0.075, 0.03, 0.02), 'chest', trim, { position: [tip[0], tip[1] - 0.01, tip[2]], metal: true });
    if (emblem) placeEmblem(add, 'chest', emblem, ec, { position: [tip[0], tip[1] + 0.06, tip[2] + 0.03], size: 0.024, disc: false });
  }
}

/** One great leather pauldron, a baldric whose buckle is the emblem, bracers. Agile classes. */
function harness(a, c, dc, trim, emblem, ec) {
  const { add, W, T, chestZ } = c;
  // the left shoulder: a big layered guard; the right: a small cap
  add(profile([[-0.13, 0.19, 0.176], [-0.05, 0.196, 0.182], [0.04, 0.165, 0.155], [0.1, 0.09, 0.085], [0.122, 0.004, 0.004]], 12), 'armL', dc, { position: [-0.035, 0, 0] });
  for (let i = 0; i < 2; i++) add(profile([[-0.17 - i * 0.04, 0.183 - i * 0.012, 0.17 - i * 0.012], [-0.135 - i * 0.04, 0.19 - i * 0.012, 0.176 - i * 0.012]], 12), 'armL', i ? dc : tone(dc, 0.8), { position: [-0.035, 0, 0] });
  add(profile([[-0.135, 0.198, 0.184], [-0.12, 0.198, 0.184]], 12), 'armL', trim, { position: [-0.035, 0, 0], metal: true });
  for (let k = 0; k < 4; k++) add(gem(), 'armL', lift(trim, 0.2), { position: [-0.11, 0.02 - k * 0.045, 0.09], scale: [0.012, 0.012, 0.012], metal: true });
  if (emblem) placeEmblem(add, 'armL', emblem, ec, { position: [-0.215, -0.05, 0], rotation: [0, -Math.PI / 2, 0], size: 0.04, back: tone(dc, 0.6), rim: trim });
  add(profile([[-0.07, 0.14, 0.13], [0.0, 0.14, 0.13], [0.06, 0.1, 0.095], [0.09, 0.004, 0.004]], 10), 'armR', dc, { position: [0.025, 0, 0] });
  if (emblem) placeEmblem(add, 'armR', emblem, ec, { position: [0.17, -0.02, 0], rotation: [0, Math.PI / 2, 0], size: 0.026, disc: false });
  // the baldric: right shoulder to left hip, laid on the chest
  const pts = [];
  for (let k = 0; k <= 8; k++) { const t = k / 8, x = (0.17 - 0.36 * t) * W, y = (0.29 - 0.42 * t) * T; pts.push([x, y, chestZ(x, y, 1, 0.022)]); }
  add(taperedCurve(pts, [0.024, 0.024, 0.024], 4, 16), 'chest', tone(dc, 0.75));
  for (const t of [0.2, 0.8]) { const [x, y, z] = pts[Math.round(t * 8)]; add(new THREE.BoxGeometry(0.03, 0.03, 0.012), 'chest', trim, { position: [x, y, z + 0.018], rotation: [0, 0, 0.9], metal: true }); }
  // the buckle IS the emblem
  const mid = pts[4];
  if (emblem) placeEmblem(add, 'chest', emblem, ec, { position: [mid[0], mid[1], mid[2] + 0.02], size: 0.045, back: tone(dc, 0.5), rim: trim });
  // bracers
  for (const side of ['L', 'R']) {
    const elbow = 'elbow' + side;
    add(profile([[-0.17 * T, 0.088, 0.092], [-0.12 * T, 0.096, 0.1], [-0.06 * T, 0.09, 0.094]], 10), elbow, dc);
    for (const y of [-0.165, -0.065]) add(profile([[y * T - 0.006, 0.098, 0.102], [y * T + 0.006, 0.098, 0.102]], 10), elbow, trim, { metal: true });
    add(gem(), elbow, ec, { position: [0, -0.115 * T, 0.1], scale: [0.016, 0.022, 0.01], metal: true });
  }
}

/** A long trimmed tabard with the emblem on it, shoulder caps, a cord belt. Holy classes. */
function vestments(a, c, dc, trim, emblem, ec) {
  const { add, W, T, chestZ, hipsZ } = c;
  for (const [zs, ry] of [[1, 0], [-1, Math.PI]]) {
    // the chest panel follows the body (plate pushes it out), the skirt hangs past the knees
    const zc = Math.max(...[-0.12, -0.04, 0.04, 0.12, 0.2, 0.27].map(y => Math.abs(chestZ(0, y * T, zs, 0.045)))) * zs, zh = Math.abs(hipsZ ? hipsZ(0, -0.1, zs, 0.06) : 0.2 * W) * zs;
    const g = new THREE.PlaneGeometry(0.22 * W, 0.46, 1, 3);
    add(g, 'chest', dc, { position: [0, 0.07 * T, zc], rotation: [0, ry, 0] });
    const gb = g.clone(); { const idx = gb.index.array; for (let i = 0; i < idx.length; i += 3) [idx[i], idx[i + 1]] = [idx[i + 1], idx[i]]; gb.computeVertexNormals(); }
    add(gb, 'chest', dc, { position: [0, 0.07 * T, zc - zs * 0.002], rotation: [0, ry, 0] });
    const sk = new THREE.PlaneGeometry(0.22 * W, 0.36, 1, 3);
    add(sk, 'hips', dc, { position: [0, -0.2, zh + zs * 0.02], rotation: [zs * -0.1, ry, 0] });
    const skb = sk.clone(); { const idx = skb.index.array; for (let i = 0; i < idx.length; i += 3) [idx[i], idx[i + 1]] = [idx[i + 1], idx[i]]; skb.computeVertexNormals(); }
    add(skb, 'hips', dc, { position: [0, -0.2, zh + zs * 0.018], rotation: [zs * -0.1, ry, 0] });
    // trim: both edges and the hem
    for (const sx of [-1, 1]) {
      add(new THREE.BoxGeometry(0.016, 0.46, 0.008), 'chest', trim, { position: [sx * 0.11 * W, 0.07 * T, zc + zs * 0.004], metal: true });
      add(new THREE.BoxGeometry(0.016, 0.36, 0.008), 'hips', trim, { position: [sx * 0.11 * W, -0.2, zh + zs * 0.026], rotation: [zs * -0.1, 0, 0], metal: true });
    }
    add(new THREE.BoxGeometry(0.22 * W + 0.016, 0.02, 0.008), 'hips', trim, { position: [0, -0.375, zh + zs * 0.045], rotation: [zs * -0.1, 0, 0], metal: true });
    if (emblem) placeEmblem(add, 'chest', emblem, ec, { position: [0, 0.1 * T, zc + zs * 0.006], rotation: [0, ry, 0], size: 0.06 * Math.min(W, 1.25), disc: false });
    if (emblem) placeEmblem(add, 'hips', emblem, ec, { position: [0, -0.27, zh + zs * 0.034], rotation: [zs * -0.1, ry, 0], size: 0.03, disc: false });
  }
  // shoulder caps and a cord belt with tassels
  for (const [side, s] of [['L', -1], ['R', 1]]) {
    add(profile([[-0.07, 0.158, 0.148], [0.0, 0.16, 0.15], [0.06, 0.115, 0.11], [0.095, 0.004, 0.004]], 12), 'arm' + side, lift(trim, 0.1), { position: [s * 0.03, 0, 0], metal: true });
    add(profile([[-0.082, 0.165, 0.155], [-0.068, 0.165, 0.155]], 12), 'arm' + side, ec, { position: [s * 0.03, 0, 0], metal: true });
    if (emblem) placeEmblem(add, 'arm' + side, emblem, ec, { position: [s * 0.19, -0.03, 0], rotation: [0, s * Math.PI / 2, 0], size: 0.03, disc: false });
  }
  add(profile([[0.005, 0.215 * W, 0.155 * W], [0.03, 0.215 * W, 0.155 * W]], 16), 'hips', trim);
  for (const s of [-1, 1]) add(taperedCurve([[s * 0.06 * W, 0.0, 0.17 * W], [s * 0.07 * W, -0.12, 0.18 * W]], [0.01, 0.014], 4, 4), 'hips', trim);
}

/** A fur ring with horns and tufts. Nature and spirit classes. */
function wildmantle(a, c, dc, trim, emblem, ec) {
  const { add, W, T } = c;
  add(profile([[0.16 * T, 0.31 * W, 0.225 * W, -0.01], [0.24 * T, 0.3 * W, 0.215 * W, -0.01], [0.31 * T, 0.25 * W, 0.18 * W, -0.012], [0.345 * T, 0.14, 0.115, -0.02], [0.37 * T, 0.09, 0.08, -0.02]], 18), 'chest', dc);
  for (let k = 0; k < 18; k++) {
    const t = k / 18 * Math.PI * 2;
    add(new THREE.ConeGeometry(0.032, 0.1, 4), 'chest', k % 3 ? tone(dc, 0.8) : ec, { position: [Math.sin(t) * 0.31 * W, 0.135 * T, Math.cos(t) * 0.225 * W - 0.01], rotation: [Math.PI, 0, 0] });
  }
  // horns / antlers rising off each shoulder
  for (const s of [-1, 1]) {
    add(taperedCurve([[s * 0.22 * W, 0.3 * T, -0.04], [s * 0.3 * W, 0.42 * T, -0.06], [s * 0.3 * W, 0.56 * T, -0.02], [s * 0.26 * W, 0.62 * T, 0.03]], [0.03, 0.022, 0.012, 0.003], 6, 10), 'chest', trim);
    add(taperedCurve([[s * 0.295 * W, 0.45 * T, -0.06], [s * 0.36 * W, 0.5 * T, -0.07], [s * 0.38 * W, 0.56 * T, -0.06]], [0.014, 0.008, 0.002], 5, 5), 'chest', trim);
    for (let k = 0; k < 3; k++) add(gem(), 'chest', k % 2 ? trim : ec, { position: [s * (0.12 + k * 0.035) * W, (0.2 - k * 0.025) * T, 0.205 * W - k * 0.012], scale: [0.016, 0.016, 0.016] });
  }
  // a bone clasp at the throat, the emblem hung from it
  add(low(), 'chest', trim, { position: [0, 0.3 * T, 0.13 * W], scale: [0.03, 0.022, 0.016] });
  if (emblem) placeEmblem(add, 'chest', emblem, ec, { position: [0, 0.22 * T, 0.2 * W], size: 0.032, disc: false });
}
