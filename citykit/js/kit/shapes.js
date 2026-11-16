// Building blocks every recipe is made from. Units are tiles (1 = one tile edge); y is up; a piece's (x, z) is its
// centre and y its BOTTOM, so stacking is just "put the next one at the last one's top".
import * as THREE from 'three';
import { FLOOR } from '../iso.js';
import { facadeMat, bodyMat, trimMat, neonMat, glassMat, signMat, STYLES } from './materials.js';

const geo = new Map();
const boxGeo = (w, h, d) => { const k = `b${w.toFixed(3)}:${h.toFixed(3)}:${d.toFixed(3)}`; if (!geo.has(k)) geo.set(k, new THREE.BoxGeometry(w, h, d)); return geo.get(k); };
const cylGeo = (rt, rb, h, seg) => { const k = `c${rt.toFixed(3)}:${rb.toFixed(3)}:${h.toFixed(3)}:${seg}`; if (!geo.has(k)) geo.set(k, new THREE.CylinderGeometry(rt, rb, h, seg)); return geo.get(k); };

function mesh(g, mat, x, y, z) { const m = new THREE.Mesh(g, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m; }

/** A plain box, bottom at y. */
export function box(parent, w, h, d, mat, x = 0, y = 0, z = 0) { const m = mesh(boxGeo(w, h, d), mat, x, y + h / 2, z); parent.add(m); return m; }

/** A cylinder, bottom at y (rb = bottom radius, rt = top radius). */
export function cyl(parent, rb, h, mat, x = 0, y = 0, z = 0, { rt = rb, seg = 20 } = {}) { const m = mesh(cylGeo(rt, rb, h, seg), mat, x, y + h / 2, z); parent.add(m); return m; }

/** A sphere-ish dome sitting on y. */
export function dome(parent, r, mat, x = 0, y = 0, z = 0, { squash = 0.7, seg = 24 } = {}) {
  const k = `d${r.toFixed(3)}:${seg}`; if (!geo.has(k)) geo.set(k, new THREE.SphereGeometry(r, seg, Math.ceil(seg / 2), 0, Math.PI * 2, 0, Math.PI / 2));
  const m = mesh(geo.get(k), mat, x, y, z); m.scale.y = squash; parent.add(m); return m;
}

/**
 * A block of storeys with windows on all four sides. Returns its top y.
 * o: { w, d, floors, x, z, y, style, kind ('grid'|'bands'|'curtain'|'louvre'), seed, lit (0..1 share lit at night), bay (bay width in tiles) }
 */
export function storeys(parent, o) {
  const { w, d, floors, x = 0, z = 0, y = 0, style = 'chrome', kind = 'grid', seed = 1, lit = kind === 'curtain' ? 0.32 : 0.42, bay = 0.18 } = o;
  const h = floors * FLOOR;
  const cw = Math.max(1, Math.round(w / bay)), cd = Math.max(1, Math.round(d / bay));
  const side = n => facadeMat(style, kind, seed, n, floors, lit);
  const roof = bodyMat(style, 2);
  const mats = [side(cd), side(cd), roof, roof, side(cw), side(cw)];   // +x −x +y −y +z −z
  const m = mesh(boxGeo(w, h, d), mats, x, y + h / 2, z); parent.add(m);
  return y + h;
}

/** A thin trim slab (floor plate, cornice, podium edge). */
export function slab(parent, w, d, style, x = 0, y = 0, z = 0, t = 0.04) { box(parent, w, t, d, trimMat(style), x, y, z); return y + t; }

/** Neon strips along the four top edges of a w × d footprint at height y. */
export function neonEdges(parent, w, d, color, x = 0, y = 0, z = 0, t = 0.03, dayGlow = 0.35) {
  const m = neonMat(color, dayGlow);
  box(parent, w + t, t, t, m, x, y, z + d / 2); box(parent, w + t, t, t, m, x, y, z - d / 2);
  box(parent, t, t, d + t, m, x + w / 2, y, z); box(parent, t, t, d + t, m, x - w / 2, y, z);
}

/** A vertical sign on a face. face: '+x' | '+z' (the two faces the camera sees at rotation 0; others work too). */
export function sign(parent, face, color, seed, { w = 0.12, h = 0.6, x = 0, y = 0, z = 0, depth = 0.04 } = {}) {
  const mat = signMat(color, seed);
  const frame = trimMat('graphite');
  const g = new THREE.Group(); g.position.set(x, y, z);
  // sign panel: a box whose two broad faces carry the glowing texture
  const panel = new THREE.Mesh(boxGeo(face.endsWith('x') ? depth : w, h, face.endsWith('x') ? w : depth),
    face.endsWith('x') ? [mat, mat, frame, frame, frame, frame] : [frame, frame, frame, frame, mat, mat]);
  panel.position.set(0, h / 2, 0); panel.castShadow = true; g.add(panel);
  parent.add(g); return g;
}

/** Rooftop clutter: vents, AC boxes, antennas with red beacons, maybe a helipad or a tank. */
export function roofProps(parent0, w, d, y, style, R, { helipad = false, tank = false, antenna = true, x = 0, z = 0 } = {}) {
  // x/z: the centre of the roof it sits on (owner bug 2026-11-16: props and roofs were always centred on the lot)
  const parent = new THREE.Group(); parent.position.set(x, 0, z); parent0.add(parent);
  const t = trimMat(style), b = bodyMat(style, 1);
  const n = Math.max(1, Math.round(w * d * 6));
  for (let i = 0; i < n && !helipad; i++) {
    const s = R.range(0.06, 0.14);
    box(parent, s, R.range(0.04, 0.09), s * R.range(0.8, 1.6), R.chance(0.5) ? t : b, R.range(-w / 2 + s, w / 2 - s), y, R.range(-d / 2 + s, d / 2 - s));
  }
  if (helipad) {
    const r = Math.min(w, d) * 0.42;
    cyl(parent, r, 0.03, bodyMat('graphite', 0), 0, y, 0, { seg: 28 });
    const ring = neonMat('#7dff6a', 0.3);
    const k = `ring${r.toFixed(3)}`; if (!geo.has(k)) geo.set(k, new THREE.TorusGeometry(r * 0.8, 0.012, 6, 36));
    const tor = new THREE.Mesh(geo.get(k), ring); tor.rotation.x = Math.PI / 2; tor.position.set(0, y + 0.035, 0); parent.add(tor);
  }
  if (tank) cyl(parent, Math.min(w, d) * 0.18, 0.18, b, w * 0.2, y, -d * 0.2, { seg: 14 });
  if (antenna) {
    const h = R.range(0.25, 0.7);
    const ax = R.range(-w / 3, w / 3), az = R.range(-d / 3, d / 3);
    cyl(parent, 0.012, h, t, ax, y, az, { seg: 6 });
    box(parent, 0.04, 0.04, 0.04, neonMat('#ff3030', 0.9), ax, y + h, az);
  }
}

/** Balcony bands across the camera-facing faces (+x and +z) every `every` floors. */
export function balconies(parent, w, d, y0, floors, style, every = 2, x = 0, z = 0) {
  const m = trimMat(style);
  for (let f = every; f < floors; f += every) {
    const y = y0 + f * FLOOR - 0.02;
    box(parent, w + 0.06, 0.02, 0.05, m, x, y, z + d / 2 + 0.02);
    box(parent, 0.05, 0.02, d + 0.06, m, x + w / 2 + 0.02, y, z);
    box(parent, w + 0.06, 0.02, 0.05, m, x, y, z - d / 2 - 0.02);
    box(parent, 0.05, 0.02, d + 0.06, m, x - w / 2 - 0.02, y, z);
  }
}

/** A street-level pad under a lot: pavement with a curb, a few tiles wide. Every building sits on one. */
export function lotPad(parent, w, d, color = '#59616c') {
  box(parent, w * 0.98, 0.025, d * 0.98, bodyMat('concrete', 0, { color, rough: 0.95, metal: 0 }), 0, 0, 0);
  return 0.025;
}

export { FLOOR, STYLES, glassMat, neonMat, bodyMat, trimMat };
