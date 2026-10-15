// Vharlen, the Burning Isle — the things that stand on its ground that no kit piece is (stream T, docs/EXPANSION-1.md):
// tree ferns, basalt column clusters, obsidian boulders, steam vent mounds and sulphur crusts. Low-poly, flat-shaded,
// vertex-coloured, one geometry per variant; js/client/scatter-view.js instances them like every other scatter kind
// (KIND_ART `custom`). Each builder takes a variant name and returns a BufferGeometry with its base at y = 0.

import * as THREE from 'three';

function rng(seed) { let s = seed >>> 0 || 1; return () => { s = Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909); s ^= s >>> 16; return (s >>> 0) / 4294967296; }; }
const hashName = n => { let h = 2166136261; for (const c of n) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

/** A triangle soup builder: tri(a, b, c, colour) with [x, y, z] points; flat normals. */
class Soup {
  constructor() { this.p = []; this.c = []; }
  tri(a, b, c, col) { this.p.push(...a, ...b, ...c); for (let k = 0; k < 3; k++) this.c.push(col.r, col.g, col.b); }
  quad(a, b, c, d, col) { this.tri(a, b, c, col); this.tri(a, c, d, col); }
  /** an n-sided prism from y0 to y1 at (x, z), radius r (top radius rt), side colour / cap colour */
  prism(x, z, n, r, rt, y0, y1, side, cap, rot = 0) {
    const ring = (rr, y) => Array.from({ length: n }, (_, i) => { const a = rot + i / n * Math.PI * 2; return [x + Math.cos(a) * rr, y, z + Math.sin(a) * rr]; });
    const lo = ring(r, y0), hi = ring(rt, y1);
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; this.quad(lo[i], lo[j], hi[j], hi[i], side); }
    if (cap) for (let i = 1; i < n - 1; i++) this.tri(hi[0], hi[i + 1], hi[i], cap);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeVertexNormals();
    // make every triangle face up/outward: computeVertexNormals on a non-indexed soup is flat per face already
    g.computeBoundingSphere();
    return g;
  }
}
const C = (hex, k = 1) => { const c = new THREE.Color(hex); c.multiplyScalar(k); return c; };

/** Tree fern: a fibrous trunk 2.4–3.8 m with a crown of drooping fronds. */
function treeFern(name) {
  const R = rng(hashName(name)), S = new Soup();
  const h = 2.4 + R() * 1.4, lean = (R() - 0.5) * 0.4;
  const trunk = C('#4a3a2a'), frond = C('#3f6a2c'), frond2 = C('#557f36');
  const segs = 4;
  for (let s = 0; s < segs; s++) {
    const y0 = h * s / segs, y1 = h * (s + 1) / segs, x0 = lean * y0 / h, x1 = lean * y1 / h;
    const ring = (x, y, r) => Array.from({ length: 6 }, (_, i) => [x + Math.cos(i / 6 * Math.PI * 2) * r, y, Math.sin(i / 6 * Math.PI * 2) * r]);
    const a = ring(x0, y0, 0.2 - 0.04 * s / segs), b = ring(x1, y1, 0.18 - 0.04 * (s + 1) / segs);
    for (let i = 0; i < 6; i++) { const j = (i + 1) % 6; S.quad(a[i], a[j], b[j], b[i], C('#4a3a2a', 0.8 + 0.3 * ((s + i) % 2))); }
  }
  const top = [lean, h, 0], n = 9 + Math.floor(R() * 4);
  for (let f = 0; f < n; f++) {
    const a = f / n * Math.PI * 2 + R() * 0.3, len = 1.8 + R() * 1.0, rise = 0.5 + R() * 0.3, dx = Math.cos(a), dz = Math.sin(a);
    // three segments, each a flat leaf blade, drooping as it goes out
    let p = top;
    for (let k = 1; k <= 3; k++) {
      const t = k / 3, q = [top[0] + dx * len * t, h + rise * Math.sin(t * Math.PI * 0.8) - 0.9 * t * t, dz * len * t];
      const w = 0.32 * (1 - t * 0.6), px = -dz * w, pz = dx * w;
      S.quad([p[0] - px, p[1], p[2] - pz], [p[0] + px, p[1], p[2] + pz], [q[0] + px * 0.7, q[1], q[2] + pz * 0.7], [q[0] - px * 0.7, q[1], q[2] - pz * 0.7], k % 2 ? frond : frond2);
      S.quad([p[0] + px, p[1], p[2] + pz], [p[0] - px, p[1], p[2] - pz], [q[0] - px * 0.7, q[1], q[2] - pz * 0.7], [q[0] + px * 0.7, q[1], q[2] + pz * 0.7], k % 2 ? frond : frond2);
      p = q;
    }
  }
  void trunk;
  return S.build();
}

/** Basalt columns: a tight cluster of hexagonal prisms, tallest in the middle, pale broken tops. */
function basaltColumns(name) {
  const R = rng(hashName(name)), S = new Soup();
  const n = 6 + Math.floor(R() * 6);
  const side = [C('#2f2e31'), C('#38363a'), C('#28272a')], cap = C('#55524f');
  for (let i = 0; i < n; i++) {
    const a = i === 0 ? 0 : (i * 2.4), d = i === 0 ? 0 : 0.55 + 0.45 * Math.sqrt(i / n) * 1.6;
    const x = Math.cos(a) * d, z = Math.sin(a) * d, r = 0.34 + R() * 0.14;
    const hgt = (3.6 - d * 1.2) * (0.7 + R() * 0.5);
    S.prism(x, z, 6, r, r * 0.98, -0.3, Math.max(0.5, hgt), side[i % 3], cap, R() * 0.5);
  }
  return S.build();
}

/** Obsidian boulder: a faceted glassy lump. */
function obsidian(name) {
  const R = rng(hashName(name));
  const g = new THREE.IcosahedronGeometry(1, 0);            // (already one vertex per corner per face)
  const p = g.attributes.position;
  const sx = 1.1 + R() * 0.5, sy = 0.6 + R() * 0.4, sz = 0.9 + R() * 0.4;
  const seen = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = [p.getX(i), p.getY(i), p.getZ(i)].map(v => v.toFixed(3)).join(',');
    if (!seen.has(k)) seen.set(k, 0.8 + R() * 0.4);
    const j = seen.get(k);
    p.setXYZ(i, p.getX(i) * sx * j, Math.max(-0.2, p.getY(i) * sy * j + sy * 0.55), p.getZ(i) * sz * j);
  }
  const col = new Float32Array(p.count * 3);
  for (let t = 0; t < p.count / 3; t++) { const c = C(R() < 0.25 ? '#2a2236' : '#141217', 1); for (let v = 0; v < 3; v++) col.set([c.r, c.g, c.b], (t * 3 + v) * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals(); g.computeBoundingSphere();
  return g;
}

/** Steam vent: a low crusted mound with a dark throat. */
function steamVent(name) {
  const R = rng(hashName(name)), S = new Soup();
  const r = 1.2 + R() * 0.4;
  S.prism(0, 0, 9, r, 0.45, -0.1, 0.55 + R() * 0.25, C('#6a625a'), null, R());
  S.prism(0, 0, 9, 0.45, 0.32, 0.55, 0.62, C('#d8cf9a'), C('#1a1714'), R());
  return S.build();
}

/** Sulphur crust: a flat yellow patch with a few crystal knobs. */
function sulphurCrust(name) {
  const R = rng(hashName(name)), S = new Soup();
  const n = 10, pts = Array.from({ length: n }, (_, i) => { const a = i / n * Math.PI * 2, rr = 0.8 + R() * 0.7; return [Math.cos(a) * rr, 0.05, Math.sin(a) * rr]; });
  for (let i = 0; i < n; i++) S.tri([0, 0.07, 0], pts[(i + 1) % n], pts[i], C(i % 2 ? '#e1c63a' : '#cdb032'));
  const k = 3 + Math.floor(R() * 4);
  for (let i = 0; i < k; i++) { const a = R() * Math.PI * 2, d = R() * 0.8; S.prism(Math.cos(a) * d, Math.sin(a) * d, 4, 0.1 + R() * 0.08, 0.02, 0, 0.18 + R() * 0.25, C('#f0dc50'), null, R()); }
  return S.build();
}

const BUILDERS = { tree_fern: treeFern, basalt_columns: basaltColumns, obsidian, steam_vent: steamVent, sulphur_crust: sulphurCrust };
/** Materials per look: matte for most, glassy for obsidian. Shared across zones. */
const MATS = new Map();
export function vharlMaterial(kind, cheap = false) {
  const look = kind === 'obsidian' ? 'glass' : 'matte';
  const k = look + (cheap ? ':low' : '');
  if (!MATS.has(k)) MATS.set(k, cheap ? new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })
    : look === 'glass' ? new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.18, metalness: 0.35 })
      : new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92, side: THREE.DoubleSide }));
  return MATS.get(k);
}
/** Build one variant (`<kind>:<variant>`); null for an unknown kind. */
export function buildVharlPiece(kind, variant) {
  const f = BUILDERS[kind]; return f ? f(`${kind}:${variant}`) : null;
}
