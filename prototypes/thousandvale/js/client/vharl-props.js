// Vharlen, the Burning Isle — the island's own wilderness props (stream W, docs/EXPANSION-1.md): knappers' anvils,
// pumice racks, sulphur cart wrecks, bathing huts, ash shrines, fallen ironpalms, salamander traps, glass kilns,
// outrigger canoes, steam pits, lava-tube mouths, houses buried in ash, Rim Keeper waymarkers…
//
// The vocabulary (ids, sizes, what each is) is data/vignettes/vharlen-props.json `island`; island recipes use only those
// ids (and a few neutral kit pieces). js/client/decor.js asks `buildVharlProp(id)` for any `vh_` id it is handed, so
// every view that draws kit props (vignettes, curios, sites, wayside, folk camps) draws these the same way: ONE
// geometry per id, instanced by id, vertex-coloured, flat-shaded (a non-indexed soup has one normal per face).
// Palette: the vharl look — red ochre, dark basalt, reed thatch, black sand, sulphur yellow, pumice grey.
// Every triangle is wound to face AWAY from the centre of the piece it belongs to (Soup.tri's `c`), so the one-sided
// prop material never shows a piece inside out. Base at y = 0, long axis local X, front / opening +z.

import * as THREE from 'three';

function rng(seed) { let s = seed >>> 0 || 1; return () => { s = Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909); s ^= s >>> 16; return (s >>> 0) / 4294967296; }; }
const hashName = n => { let h = 2166136261; for (const c of n) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const COL = new Map();
const C = (hex, k = 1) => { const key = hex + k; if (!COL.has(key)) { const c = new THREE.Color(hex); c.multiplyScalar(k); COL.set(key, c); } return COL.get(key); };

// palette
const BASALT = '#2f2d30', BASALT2 = '#3b383b', BASALT3 = '#4a4648', OCHRE = '#9a4a2c', OCHRE2 = '#b35a32', THATCH = '#9c8450', THATCH2 = '#7f6a3e';
const SAND = '#1f1d1e', SULPHUR = '#e0c437', SULPHUR2 = '#c4a62a', PUMICE = '#bdb7ab', PUMICE2 = '#a29c90', ASH = '#8d8883', ASH2 = '#a39e98';
const OBSID = '#141217', OBSID2 = '#2a2236', GLASS_G = '#3f8a62', GLASS_A = '#c58b2c', DRIFT = '#7d6d58', DRIFT2 = '#5f5242', PALM = '#5b4a39', PALM2 = '#6c5944';
const FROND = '#4d6a2c', FROND2 = '#5f7f36', DEAD = '#8a7b4e', TEAL = '#3aa39b', STEAM = '#e6e3dc', FISH = '#b9b09c', IRON = '#38383c', BONE = '#d9d1bd', RAG = '#a5302a';
const LEAF = '#4b6628', CHAR = '#1b1816', CHAR2 = '#2c2622', CLAY = '#a2553a', CLAY2 = '#8a4630', REED = '#a99a62', REED2 = '#8e8150', GLOW = '#ff9a3a';

/** A triangle soup with a transform stack; every triangle faces away from its part's centre. */
class Soup {
  constructor() { this.p = []; this.c = []; this.m = [new THREE.Matrix4()]; this._v = new THREE.Vector3(); }
  get M() { return this.m[this.m.length - 1]; }
  /** run fn with an extra transform: translate (x, y, z), then yaw about y, then roll about local x / pitch about local z */
  with({ x = 0, y = 0, z = 0, yaw = 0, rx = 0, rz = 0, s = 1 } = {}, fn) {
    const t = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, yaw, rz, 'YXZ')), new THREE.Vector3(s, s, s));
    this.m.push(this.M.clone().multiply(t)); fn(); this.m.pop();
  }
  X(p) { this._v.set(p[0], p[1], p[2]).applyMatrix4(this.M); return [this._v.x, this._v.y, this._v.z]; }
  /** a, b, c in the current frame; ctr = the centre the face must point away from (same frame); two = both sides */
  tri(a, b, c, col, ctr, two = false) {
    a = this.X(a); b = this.X(b); c = this.X(c);
    const push = (p, q, r) => { this.p.push(...p, ...q, ...r); for (let k = 0; k < 3; k++) this.c.push(col.r, col.g, col.b); };
    if (two) { push(a, b, c); push(a, c, b); return; }
    if (ctr) {
      const o = this.X(ctr);
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const gx = (a[0] + b[0] + c[0]) / 3 - o[0], gy = (a[1] + b[1] + c[1]) / 3 - o[1], gz = (a[2] + b[2] + c[2]) / 3 - o[2];
      if (nx * gx + ny * gy + nz * gz < 0) { push(a, c, b); return; }
    }
    push(a, b, c);
  }
  quad(a, b, c, d, col, ctr, two = false) { this.tri(a, b, c, col, ctr, two); this.tri(a, c, d, col, ctr, two); }
  /** n-sided prism / frustum standing at (x, z) from y0 to y1; radii r (bottom) and rt (top); sx/sz squash it */
  prism(x, z, n, r, rt, y0, y1, side, cap = null, rot = 0, { sx = 1, sz = 1, bottom = false } = {}) {
    const ring = (rr, y) => Array.from({ length: n }, (_, i) => { const a = rot + i / n * Math.PI * 2; return [x + Math.cos(a) * rr * sx, y, z + Math.sin(a) * rr * sz]; });
    const lo = ring(r, y0), hi = ring(rt, y1), ctr = [x, (y0 + y1) / 2, z];
    const sides = Array.isArray(side) ? side : [side];
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; this.quad(lo[i], lo[j], hi[j], hi[i], sides[i % sides.length], ctr); }
    if (cap && rt > 0.001) for (let i = 1; i < n - 1; i++) this.tri(hi[0], hi[i], hi[i + 1], cap, [x, y0 - 1, z]);
    if (bottom && r > 0.001) for (let i = 1; i < n - 1; i++) this.tri(lo[0], lo[i], lo[i + 1], sides[0], [x, y1 + 1, z]);
  }
  /** a box centred on (x, y, z), w (x) by h (y) by d (z), turned by yaw */
  box(x, y, z, w, h, d, col, { yaw = 0, rx = 0, rz = 0, top = null } = {}) {
    this.with({ x, y, z, yaw, rx, rz }, () => {
      const W = w / 2, H = h / 2, D = d / 2, o = [0, 0, 0];
      const P = (i, j, k) => [i * W, j * H, k * D];
      this.quad(P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1), col, o);
      this.quad(P(1, -1, -1), P(-1, -1, -1), P(-1, 1, -1), P(1, 1, -1), col, o);
      this.quad(P(1, -1, 1), P(1, -1, -1), P(1, 1, -1), P(1, 1, 1), col, o);
      this.quad(P(-1, -1, -1), P(-1, -1, 1), P(-1, 1, 1), P(-1, 1, -1), col, o);
      this.quad(P(-1, 1, 1), P(1, 1, 1), P(1, 1, -1), P(-1, 1, -1), top || col, o);
      this.quad(P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1), P(-1, -1, 1), col, o);
    });
  }
  /** a round-ish tube from point a to point b (local frame), radius r0 -> r1, n sides */
  rod(a, b, r0, r1, n, col, { caps = true } = {}) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), dir = B.clone().sub(A), len = dir.length();
    if (len < 1e-6) return;
    dir.normalize();
    const up = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const u = new THREE.Vector3().crossVectors(dir, up).normalize(), v = new THREE.Vector3().crossVectors(dir, u).normalize();
    const ring = (P, r) => Array.from({ length: n }, (_, i) => { const t = i / n * Math.PI * 2; return P.clone().addScaledVector(u, Math.cos(t) * r).addScaledVector(v, Math.sin(t) * r).toArray(); });
    const ra = ring(A, r0), rb = ring(B, r1), mid = A.clone().add(B).multiplyScalar(0.5).toArray();
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; this.quad(ra[i], ra[j], rb[j], rb[i], col, mid); }
    if (caps) {
      const ea = A.clone().addScaledVector(dir, -1).toArray(), eb = B.clone().addScaledVector(dir, 1).toArray();
      for (let i = 1; i < n - 1; i++) { this.tri(ra[0], ra[i], ra[i + 1], col, eb); this.tri(rb[0], rb[i], rb[i + 1], col, ea); }
    }
  }
  /** a dome (half ellipsoid) on the ground at (x, z) */
  dome(x, z, rx, h, rz, col, { rings = 3, segs = 9, y = 0, cols = null } = {}) {
    const pt = (i, k) => { const ph = (i / rings) * Math.PI / 2, th = k / segs * Math.PI * 2; return [x + Math.cos(th) * Math.cos(ph) * rx, y + Math.sin(ph) * h, z + Math.sin(th) * Math.cos(ph) * rz]; };
    const ctr = [x, y, z];
    for (let i = 0; i < rings; i++) for (let k = 0; k < segs; k++) {
      const c = cols ? cols[(i + k) % cols.length] : col;
      if (i === rings - 1) this.tri(pt(i, k), pt(i, k + 1), [x, y + h, z], c, ctr);
      else this.quad(pt(i, k), pt(i, k + 1), pt(i + 1, k + 1), pt(i + 1, k), c, ctr);
    }
  }
  /** a faceted lump (a stone, a pot of sulphur) centred at (x, y, z) */
  lump(x, y, z, sx, sy, sz, cols, R) {
    const g = new THREE.IcosahedronGeometry(1, 0), p = g.attributes.position, seen = new Map();
    const P = i => { const k = [p.getX(i), p.getY(i), p.getZ(i)].map(v => v.toFixed(3)).join(','); if (!seen.has(k)) seen.set(k, 0.82 + R() * 0.36); const j = seen.get(k); return [x + p.getX(i) * sx * j, y + p.getY(i) * sy * j, z + p.getZ(i) * sz * j]; };
    for (let t = 0; t < p.count; t += 3) this.tri(P(t), P(t + 1), P(t + 2), Array.isArray(cols) ? cols[(t / 3) % cols.length] : cols, [x, y, z]);
    g.dispose();
  }
  /** a flat disc on the ground (faces up) */
  disc(x, z, r, y, col, n = 10, { sx = 1, sz = 1 } = {}) {
    const ring = Array.from({ length: n }, (_, i) => { const a = i / n * Math.PI * 2; return [x + Math.cos(a) * r * sx, y, z + Math.sin(a) * r * sz]; });
    for (let i = 0; i < n; i++) this.tri([x, y, z], ring[i], ring[(i + 1) % n], col, [x, y - 1, z]);
  }
  /** a thin blade (frond, rag, net, mat) — drawn from both sides */
  blade(a, b, c, d, col) { this.quad(a, b, c, d, col, null, true); }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeVertexNormals(); g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

// ---- small shared bits ---------------------------------------------------------------------------------------------
const stones = (S, R, x, z, r, n, cols, size = 0.28) => { for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + R() * 0.2; S.lump(x + Math.cos(a) * r, size * 0.45, z + Math.sin(a) * r, size * (0.9 + R() * 0.5), size * (0.7 + R() * 0.4), size * (0.9 + R() * 0.4), cols, R); } };
const frond = (S, R, base, ang, len, droop, w, cols) => {
  const dx = Math.cos(ang), dz = Math.sin(ang); let p = base;
  for (let k = 1; k <= 3; k++) {
    const t = k / 3, q = [base[0] + dx * len * t, base[1] + droop[0] * Math.sin(t * Math.PI * 0.8) - droop[1] * t * t, base[2] + dz * len * t];
    const ww = w * (1 - t * 0.6), px = -dz * ww, pz = dx * ww;
    S.blade([p[0] - px, p[1], p[2] - pz], [p[0] + px, p[1], p[2] + pz], [q[0] + px * 0.7, q[1], q[2] + pz * 0.7], [q[0] - px * 0.7, q[1], q[2] - pz * 0.7], cols[k % cols.length]);
    p = q;
  }
};
const pole = (S, x, z, h, r = 0.06, col = C(DRIFT), lean = 0) => S.rod([x, -0.1, z], [x + lean, h, z], r, r * 0.85, 5, col);
/** a thatched roof slope from (y0, z0) at the eaves up to (y1, z1) at the ridge, x from -L to L, in bands of reed colour */
const thatch = (S, L, y0, z0, y1, z1, n, cols, ctr) => { for (let i = 0; i < n; i++) { const a = i / n, b = (i + 1) / n; S.quad([-L, y0 + (y1 - y0) * a, z0 + (z1 - z0) * a], [L, y0 + (y1 - y0) * a, z0 + (z1 - z0) * a], [L, y0 + (y1 - y0) * b, z0 + (z1 - z0) * b], [-L, y0 + (y1 - y0) * b, z0 + (z1 - z0) * b], cols[i % cols.length], ctr); } };
const basket = (S, x, z, r, h, fill, R) => { S.prism(x, z, 7, r * 0.8, r, 0, h, [C(REED), C(REED2)], null, R() * 0.5, { bottom: false }); S.dome(x, z, r * 0.95, h * 0.45, r * 0.95, C(fill), { y: h * 0.85, rings: 2, segs: 7 }); };

// ---- the builders --------------------------------------------------------------------------------------------------
const B = {
  vh_knapping_stone(S, R) {
    S.prism(0, 0, 6, 0.5, 0.42, 0, 0.78, [C(BASALT), C(BASALT2)], C(BASALT3), 0.3);
    for (let i = 0; i < 9; i++) { const a = R() * 6.28, d = 0.6 + R() * 0.5; S.lump(Math.cos(a) * d, 0.03, Math.sin(a) * d, 0.09, 0.03, 0.06, [C(OBSID), C(OBSID2)], R); }
    S.lump(0.05, 0.86, 0.05, 0.16, 0.1, 0.12, [C(OBSID), C(OBSID2)], R);
    S.lump(-0.2, 0.84, -0.1, 0.07, 0.06, 0.07, C(PUMICE2), R);
  },
  vh_obsidian_cores(S, R) { for (let i = 0; i < 7; i++) { const a = i * 2.4, d = i ? 0.3 + R() * 0.15 : 0; S.lump(Math.cos(a) * d, 0.18 + (i ? 0 : 0.18), Math.sin(a) * d, 0.22, 0.18, 0.2, [C(OBSID), C(OBSID2), C(OBSID)], R); } },
  vh_glass_shards(S, R) { for (let i = 0; i < 16; i++) { const a = R() * 6.28, d = R() * 0.75; S.lump(Math.cos(a) * d, 0.02, Math.sin(a) * d, 0.1 + R() * 0.06, 0.025, 0.07, R() < 0.3 ? C(GLASS_G) : R() < 0.5 ? C(OBSID2) : C(OBSID), R); } },
  vh_pumice_rack(S, R) {
    for (const x of [-1.15, 1.15]) for (const z of [-0.35, 0.35]) pole(S, x, z, 1.35, 0.05);
    for (const y of [0.55, 1.05]) { S.box(0, y, 0, 2.5, 0.05, 0.8, C(REED2)); for (let i = 0; i < 5; i++) S.box(-0.9 + i * 0.45, y + 0.12, (R() - 0.5) * 0.3, 0.32, 0.18, 0.26, C(i % 2 ? PUMICE : PUMICE2), { yaw: R() * 0.4 }); }
  },
  vh_pumice_pile(S, R) { for (let i = 0; i < 9; i++) { const a = i * 2.2, d = i < 3 ? 0.1 : 0.4; S.box(Math.cos(a) * d, 0.12 + (i < 3 ? 0.25 : 0), Math.sin(a) * d, 0.34, 0.22, 0.28, C(i % 2 ? PUMICE : PUMICE2), { yaw: R() * 3 }); } },
  vh_sulphur_heap(S, R) { S.dome(0, 0, 0.75, 0.55, 0.65, C(SULPHUR), { cols: [C(SULPHUR), C(SULPHUR2)] }); for (let i = 0; i < 6; i++) { const a = R() * 6.28; S.lump(Math.cos(a) * 0.75, 0.08, Math.sin(a) * 0.65, 0.14, 0.1, 0.12, C(SULPHUR), R); } },
  vh_sulphur_baskets(S, R) { basket(S, -0.45, 0, 0.3, 0.45, SULPHUR, R); basket(S, 0.25, 0.25, 0.28, 0.42, SULPHUR, R); basket(S, 0.3, -0.35, 0.26, 0.4, SULPHUR2, R); },
  vh_sulphur_cart(S, R) {
    // tipped on its left side: the bed stands on edge, one wheel up in the air, one under it
    S.with({ y: 0.55, rz: 0, rx: -1.25 }, () => {
      S.box(0, 0, 0, 1.8, 0.08, 1.0, C(DRIFT)); S.box(0, 0.22, 0.5, 1.8, 0.4, 0.06, C(DRIFT2)); S.box(0, 0.22, -0.5, 1.8, 0.4, 0.06, C(DRIFT2));
      S.box(0.9, 0.22, 0, 0.06, 0.4, 1.0, C(DRIFT2)); S.rod([-0.9, 0, 0.3], [-2.0, -0.1, 0.35], 0.04, 0.04, 4, C(DRIFT)); S.rod([-0.9, 0, -0.3], [-2.0, -0.1, -0.35], 0.04, 0.04, 4, C(DRIFT));
    });
    S.prism(0.1, -0.55, 10, 0.55, 0.55, 0.0, 0.08, C(DRIFT2), C(DRIFT), 0, {}); S.prism(0.3, 0.75, 10, 0.55, 0.55, 0.85, 0.93, C(DRIFT2), C(DRIFT));
    S.dome(0.4, 0.95, 0.8, 0.22, 0.55, C(SULPHUR), { cols: [C(SULPHUR), C(SULPHUR2)] });
    for (let i = 0; i < 8; i++) S.lump(0.4 + (R() - 0.5) * 1.8, 0.06, 1.2 + R() * 0.5, 0.12, 0.08, 0.1, C(SULPHUR), R);
  },
  vh_bath_hut(S, R) {
    S.box(0, 0.2, 0, 3.0, 0.4, 2.8, C(BASALT), { top: C(BASALT3) });
    S.box(0, 1.25, -1.3, 2.8, 1.7, 0.18, C(OCHRE)); S.box(-1.35, 1.25, 0, 0.18, 1.7, 2.6, C(OCHRE2)); S.box(1.35, 1.25, 0, 0.18, 1.7, 2.6, C(OCHRE2));
    for (const x of [-1.35, 1.35]) S.box(x, 1.25, 1.3, 0.22, 1.7, 0.22, C(DRIFT2));
    // steep reed thatch: two slopes meeting at a ridge along X, eaves over the walls
    const y0 = 2.0, y1 = 3.4, e = 1.75;
    thatch(S, 1.7, y0, e, y1, 0, 5, [C(THATCH), C('#8d7646')], [0, 1.2, 0]); thatch(S, 1.7, y0, -e, y1, 0, 5, [C(THATCH2), C('#725f37')], [0, 1.2, 0]);
    S.rod([-1.8, y1 + 0.02, 0], [1.8, y1 + 0.02, 0], 0.09, 0.09, 5, C(THATCH2));      // the ridge roll
    S.tri([-1.4, y0, e - 0.3], [-1.4, y0, -e + 0.3], [-1.4, y1 - 0.15, 0], C(OCHRE), [0, 1.2, 0]); S.tri([1.4, y0, -e + 0.3], [1.4, y0, e - 0.3], [1.4, y1 - 0.15, 0], C(OCHRE), [0, 1.2, 0]);
    S.box(0, 0.62, -0.7, 1.6, 0.45, 0.5, C(DRIFT));   // a bench inside
  },
  vh_hot_pool(S, R) { S.disc(0, 0, 1.25, 0.06, C(TEAL), 12); stones(S, R, 0, 0, 1.45, 11, [C(BASALT), C(BASALT2)], 0.32); S.lump(0.3, 0.25, -0.2, 0.35, 0.12, 0.3, C(STEAM), R); S.lump(-0.4, 0.4, 0.3, 0.3, 0.1, 0.25, C(STEAM), R); },
  vh_ash_shrine(S, R) {
    let y = 0; for (const [w, h, d] of [[1.3, 0.35, 1.0], [1.0, 0.35, 0.8], [0.75, 0.35, 0.6]]) { S.box(0, y + h / 2, 0, w, h, d, C(y ? BASALT2 : BASALT), { yaw: R() * 0.2, top: C(BASALT3) }); y += h; }
    S.prism(0, 0, 8, 0.32, 0.38, y, y + 0.18, C(BASALT3), C(ASH)); S.dome(0, 0, 0.3, 0.1, 0.3, C(ASH2), { y: y + 0.18, rings: 2, segs: 8 });
    for (const [x, yy] of [[-0.3, 0.5], [0.25, 0.2], [0.05, 0.75]]) S.box(x, yy, (yy < 0.35 ? 0.5 : yy < 0.7 ? 0.4 : 0.3) + 0.01, 0.16, 0.18, 0.02, C(OCHRE2));
  },
  vh_slag_totem(S, R) { pole(S, 0, 0, 2.4, 0.07, C(CHAR2)); for (let i = 0; i < 4; i++) S.lump((R() - 0.5) * 0.15, 0.9 + i * 0.38, (R() - 0.5) * 0.15, 0.17, 0.13, 0.15, [C(OBSID), C(CHAR)], R); S.blade([0.05, 2.25, 0], [0.55, 2.15, 0.05], [0.5, 1.6, 0.1], [0.05, 1.75, 0], C(RAG)); },
  vh_offering_bowl(S, R) { S.prism(0, 0, 9, 0.28, 0.42, 0, 0.3, C(BASALT2), null, 0.2); S.disc(0, 0, 0.36, 0.27, C(ASH2), 9); S.lump(0.1, 0.32, 0.05, 0.08, 0.05, 0.07, C(OBSID2), R); },
  vh_fallen_ironpalm(S, R) {
    const n = 7; for (let i = 0; i < n; i++) { const x0 = -3.4 + i * 0.85, x1 = x0 + 0.85; S.rod([x0, 0.32, 0], [x1, 0.3 + (i === n - 1 ? 0.15 : 0), 0.03 * Math.sin(i)], 0.3 - i * 0.012, 0.29 - i * 0.012, 7, C(i % 2 ? PALM : PALM2), { caps: i === 0 || i === n - 1 }); }
    for (let f = 0; f < 8; f++) frond(S, R, [2.6, 0.5, 0], f / 8 * 6.28, 1.8 + R() * 0.6, [0.3, 0.7], 0.3, [C(DEAD), C('#7a6b42')]);
    S.prism(-3.45, 0, 7, 0.36, 0.3, 0, 0.5, C(PALM2), C('#c2ad84'), 0.2);
  },
  vh_ironpalm_stump(S, R) { S.prism(0, 0, 8, 0.38, 0.32, 0, 0.62, [C(PALM), C(PALM2)], C('#c2ad84'), R()); for (let i = 0; i < 4; i++) { const a = i * 1.57 + R(); S.rod([Math.cos(a) * 0.3, 0.05, Math.sin(a) * 0.3], [Math.cos(a) * 0.75, -0.05, Math.sin(a) * 0.75], 0.07, 0.03, 4, C(PALM2)); } },
  vh_ironpalm(S, R) {
    const h = 7.6, lean = 0.6; let prev = [0, 0, 0];
    for (let i = 1; i <= 8; i++) { const t = i / 8, p = [lean * t * t, h * t, 0]; S.rod(prev, p, 0.26 - 0.1 * (t - 0.125), 0.25 - 0.1 * t, 6, C(i % 2 ? PALM : PALM2), { caps: false }); prev = p; }
    for (let f = 0; f < 11; f++) frond(S, R, [lean, h, 0], f / 11 * 6.28 + R() * 0.3, 2.4 + R() * 0.8, [0.5, 1.4], 0.42, [C(FROND), C(FROND2)]);
    S.lump(lean, h - 0.15, 0, 0.32, 0.3, 0.32, C(PALM2), R);
  },
  vh_tree_fern(S, R) {
    const h = 2.6 + R() * 0.5, lean = (R() - 0.5) * 0.4;
    S.rod([0, -0.1, 0], [lean, h, 0], 0.2, 0.16, 6, C('#4a3a2a'));
    for (let f = 0; f < 11; f++) frond(S, R, [lean, h, 0], f / 11 * 6.28 + R() * 0.3, 1.7 + R() * 0.8, [0.5, 0.9], 0.32, [C(FROND), C(FROND2)]);
  },
  vh_charred_trunk(S, R) {
    S.rod([0, -0.2, 0], [0.2, 4.6, 0.1], 0.36, 0.08, 6, C(CHAR));
    for (let i = 0; i < 4; i++) { const y = 2 + i * 0.6, a = i * 2.1 + R(); S.rod([0.08 * y / 4.6, y, 0], [Math.cos(a) * 1.0, y + 0.6, Math.sin(a) * 1.0], 0.08, 0.02, 4, C(CHAR2)); }
    S.prism(0, 0, 7, 0.55, 0.3, -0.05, 0.35, C(CHAR2), null, 0.4);
  },
  vh_salamander_trap(S, R) {
    // a woven cone along X, mouth at -X, staked at both ends
    const n = 8;
    for (let i = 0; i < n; i++) { const a0 = i / n * 6.28, a1 = (i + 1) / n * 6.28, r = 0.32; S.quad([-0.75, 0.35 + Math.sin(a0) * r, Math.cos(a0) * r], [-0.75, 0.35 + Math.sin(a1) * r, Math.cos(a1) * r], [0.8, 0.35, 0], [0.8, 0.35, 0], C(i % 2 ? REED : REED2), [0, 0.35, 0], true); }
    for (let i = 0; i < 3; i++) S.prism(-0.75 + i * 0.4, 0, 8, 0.33 - i * 0.07, 0.33 - i * 0.07, 0.33 + i * 0, 0.37, C(REED2), null, 0, { sz: 1 });
    pole(S, -0.85, 0.35, 0.55, 0.035); pole(S, 0.9, 0, 0.6, 0.035); S.lump(0.5, 0.35, 0, 0.1, 0.06, 0.08, C('#c25a2a'), R);
  },
  vh_glass_kiln(S, R) {
    S.dome(0, 0, 1.25, 1.9, 1.25, C(BASALT2), { cols: [C(BASALT), C(BASALT2), C(BASALT3)], rings: 4, segs: 10 });
    S.prism(0, 0, 6, 0.22, 0.18, 1.7, 2.25, C(BASALT), C(CHAR));          // chimney
    S.box(0, 0.4, 1.12, 0.75, 0.75, 0.25, C(GLOW)); S.box(0, 0.86, 1.18, 0.95, 0.16, 0.3, C(BASALT3));
    S.box(-0.5, 0.1, 1.35, 0.4, 0.2, 0.3, C(BASALT)); S.box(0.55, 0.1, 1.35, 0.4, 0.2, 0.3, C(BASALT));
  },
  vh_glass_floats(S, R) { for (let i = 0; i < 6; i++) { const a = i * 2.1 + R(), d = i ? 0.28 : 0; S.lump(Math.cos(a) * d, 0.14, Math.sin(a) * d, 0.15, 0.14, 0.15, C(i % 2 ? GLASS_G : GLASS_A), R); } S.rod([-0.35, 0.05, 0.3], [0.35, 0.05, -0.25], 0.015, 0.015, 3, C(REED2)); S.prism(0.38, 0.2, 6, 0.06, 0.04, 0, 0.3, C(GLASS_G), C(GLASS_G)); },
  vh_outrigger(S, R) {
    // hull: a lathe along X, pointed at both ends, open top (a dark inside)
    const L = 2.9, segs = 8, prof = t => Math.sin(Math.PI * t) ** 0.7;
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs, t1 = (i + 1) / segs, x0 = -L + 2 * L * t0, x1 = -L + 2 * L * t1, w0 = 0.42 * prof(t0) + 0.01, w1 = 0.42 * prof(t1) + 0.01;
      const yb0 = 0.08 + 0.25 * (1 - prof(t0)), yb1 = 0.08 + 0.25 * (1 - prof(t1)), top = 0.62;
      S.quad([x0, top, w0], [x1, top, w1], [x1, yb1, 0], [x0, yb0, 0], C(DRIFT2), [ (x0 + x1) / 2, 0.45, -1 ]);
      S.quad([x0, yb0, 0], [x1, yb1, 0], [x1, top, -w1], [x0, top, -w0], C(DRIFT), [(x0 + x1) / 2, 0.45, 1]);
      S.quad([x0, top - 0.02, w0 * 0.85], [x1, top - 0.02, w1 * 0.85], [x1, top - 0.02, -w1 * 0.85], [x0, top - 0.02, -w0 * 0.85], C(CHAR2), [(x0 + x1) / 2, -1, 0]);
    }
    S.rod([-1.6, 0.18, 1.85], [1.6, 0.18, 1.85], 0.1, 0.1, 6, C(DRIFT));                 // the float
    S.rod([-1.6, 0.18, 1.85], [-1.9, 0.26, 1.85], 0.1, 0.02, 6, C(DRIFT)); S.rod([1.6, 0.18, 1.85], [1.9, 0.26, 1.85], 0.1, 0.02, 6, C(DRIFT));
    for (const x of [-0.9, 0.9]) S.rod([x, 0.66, -0.3], [x, 0.3, 1.85], 0.045, 0.04, 5, C(PALM2));
    S.rod([0.4, 0.66, 0.2], [-1.1, 0.7, -0.15], 0.03, 0.03, 4, C(DRIFT)); S.box(-1.25, 0.7, -0.15, 0.4, 0.04, 0.16, C(DRIFT)); // a paddle across it
  },
  vh_steam_pit(S, R) { stones(S, R, 0, 0, 0.9, 10, [C(BASALT), C(OCHRE)], 0.24); S.dome(0, 0, 0.75, 0.42, 0.75, C(LEAF), { cols: [C(LEAF), C('#5d7a32'), C('#41592a')] }); S.lump(0.15, 0.7, 0, 0.3, 0.18, 0.28, C(STEAM), R); S.lump(-0.1, 1.0, 0.1, 0.22, 0.12, 0.2, C(STEAM), R); },
  vh_fish_rack(S, R) {
    for (const x of [-1.15, 1.15]) { S.rod([x, -0.1, -0.35], [x, 1.6, 0], 0.05, 0.04, 5, C(DRIFT)); S.rod([x, -0.1, 0.35], [x, 1.6, 0], 0.05, 0.04, 5, C(DRIFT)); }
    S.rod([-1.25, 1.5, 0], [1.25, 1.5, 0], 0.035, 0.035, 5, C(REED2));
    for (let i = 0; i < 7; i++) { const x = -0.95 + i * 0.32; S.blade([x - 0.1, 1.48, 0.01], [x + 0.1, 1.48, 0.01], [x + 0.06, 0.9 - R() * 0.15, 0.01], [x - 0.06, 0.9 - R() * 0.15, 0.01], C(i % 2 ? FISH : '#a8957a')); }
  },
  vh_net_poles(S, R) {
    pole(S, -1.4, 0, 2.0, 0.06); pole(S, 1.4, 0, 2.0, 0.06);
    const sag = x => 1.85 - 0.25 * (1 - (x / 1.4) ** 2);
    for (let i = 0; i < 6; i++) { const x0 = -1.4 + i * 0.4667, x1 = x0 + 0.4667; S.blade([x0, sag(x0), 0], [x1, sag(x1), 0], [x1, 0.5 + 0.1 * Math.sin(i), 0.05], [x0, 0.5 + 0.1 * Math.sin(i + 1), 0.05], C(i % 2 ? '#6b6252' : '#5a5246')); }
    for (let i = 0; i < 4; i++) S.lump(-1 + i * 0.66, sag(-1 + i * 0.66) - 0.06, 0.05, 0.08, 0.08, 0.08, C(GLASS_G), R);
  },
  vh_lava_tube(S, R) {
    // the half-sunk mouth: an arch of basalt rubble round a black opening facing +z, the roof humped behind it
    S.dome(0, -1.4, 2.5, 1.6, 2.0, C(BASALT2), { cols: [C(BASALT), C(BASALT2), C('#3d2f2c')], rings: 3, segs: 10 });
    const n = 9; for (let i = 0; i <= n; i++) { const a = Math.PI * i / n; S.lump(Math.cos(a) * 1.55, Math.sin(a) * 1.75 + 0.1, 0.35, 0.42, 0.38, 0.45, [C(BASALT), C(BASALT3)], R); }
    S.quad([-1.3, 0, 0.1], [1.3, 0, 0.1], [1.0, 1.55, 0.1], [-1.0, 1.55, 0.1], C('#060506'), [0, 0.8, -1]);
    S.disc(0, 0.9, 1.1, 0.02, C('#0e0c0d'), 9, { sz: 0.6 });
  },
  vh_buried_roof(S, R) {
    const e = 1.9, y0 = 0.0, y1 = 2.2, L = 2.5;
    thatch(S, L, y0, e, y1, 0, 5, [C(THATCH2), C('#6b5a36')], [0, 0.4, 0]); thatch(S, L, y0, -e, y1, 0, 5, [C('#6b5a36'), C('#5c4d2e')], [0, 0.4, 0]);
    S.rod([-L - 0.1, y1 + 0.02, 0], [L + 0.1, y1 + 0.02, 0], 0.1, 0.1, 5, C('#5c4d2e'));
    S.dome(-0.6, 0.9, 1.6, 0.35, 0.9, C(ASH2), { y: 0.3, rings: 2, segs: 8 });          // ash lying on the slope
    S.tri([-L + 0.1, y0, e - 0.2], [-L + 0.1, y0, -e + 0.2], [-L + 0.1, y1 - 0.1, 0], C(OCHRE), [0, 0.4, 0]); S.tri([L - 0.1, y0, -e + 0.2], [L - 0.1, y0, e - 0.2], [L - 0.1, y1 - 0.1, 0], C(OCHRE2), [0, 0.4, 0]);
    S.box(-L + 0.1, 0.9, 0, 0.05, 0.5, 0.4, C('#0e0c0d'));    // a gable window, dark inside
    S.dome(0, 0, L + 0.8, 0.45, e + 0.8, C(ASH), { cols: [C(ASH), C(ASH2)], rings: 2, segs: 12 });
    S.prism(1.2, -0.6, 6, 0.28, 0.24, 1.0, 2.6, C(BASALT2), C(CHAR));    // the chimney
  },
  vh_buried_wall(S, R) { S.box(0, 0.55, 0, 3.0, 1.3, 0.3, C(OCHRE), { top: C(OCHRE2) }); S.box(0.4, 0.75, 0.16, 0.7, 0.55, 0.04, C('#0e0c0d')); S.box(0.4, 0.45, 0.2, 0.85, 0.08, 0.12, C(DRIFT2)); S.dome(0, 0, 2.0, 0.45, 1.0, C(ASH), { cols: [C(ASH), C(ASH2)], rings: 2, segs: 10 }); },
  vh_buried_urn(S, R) { S.prism(0, 0, 9, 0.3, 0.2, 0.0, 0.5, [C(CLAY), C(CLAY2)], null, 0); S.prism(0, 0, 9, 0.2, 0.16, 0.5, 0.62, C(CLAY2), C('#1a1414')); S.dome(0, 0, 0.6, 0.18, 0.6, C(ASH), { rings: 2, segs: 9 }); },
  vh_clay_pots(S, R) {
    const pot = (x, z, h, r) => { S.prism(x, z, 9, r * 0.6, r, 0, h * 0.55, C(CLAY2), null, 0.1); S.prism(x, z, 9, r, r * 0.55, h * 0.55, h * 0.9, C(CLAY), null, 0.1); S.prism(x, z, 9, r * 0.55, r * 0.6, h * 0.9, h, C(CLAY2), C('#1a1414'), 0.1); S.prism(x, z, 9, r * 1.001, r * 1.001, h * 0.5, h * 0.56, C(BASALT2), null, 0.1); };
    pot(-0.3, 0, 0.8, 0.28); pot(0.3, 0.2, 0.62, 0.24); pot(0.25, -0.35, 0.5, 0.2);
  },
  vh_rim_waymarker(S, R) {
    S.prism(0, 0, 6, 0.32, 0.28, 0, 2.5, [C(BASALT), C(BASALT2)], null, 0.3);
    for (const [y0, y1] of [[0.7, 0.85], [1.5, 1.65], [2.15, 2.3]]) S.prism(0, 0, 6, 0.322, 0.322, y0, y1, C(OCHRE2), null, 0.3);
    S.prism(0, 0, 6, 0.36, 0.2, 2.5, 2.85, C(PUMICE), C(PUMICE2), 0.3);
    S.box(0.0, 1.1, 0.29, 0.22, 0.3, 0.02, C(PUMICE));   // a carved pale panel facing +z
    stones(S, R, 0, 0, 0.42, 6, [C(BASALT2), C(BASALT3)], 0.18);
  },
  vh_basalt_cairn(S, R) { let y = 0; for (let i = 0; i < 5; i++) { const h = 0.22 + R() * 0.08, r = 0.38 - i * 0.04; S.prism((R() - 0.5) * 0.06, (R() - 0.5) * 0.06, 6, r, r * 0.97, y, y + h, [C(BASALT), C(BASALT2)], C(BASALT3), R()); y += h; } },
  vh_reed_screen(S, R) { pole(S, -1.2, 0, 1.6, 0.05); pole(S, 1.2, 0, 1.6, 0.05); for (let i = 0; i < 12; i++) { const x = -1.12 + i * 0.204; S.blade([x - 0.1, 0.05, 0.02], [x + 0.1, 0.05, 0.02], [x + 0.08, 1.45 + R() * 0.15, 0.02], [x - 0.08, 1.45 + R() * 0.15, 0.02], C(i % 2 ? REED : REED2)); } S.rod([-1.25, 1.1, 0.05], [1.25, 1.1, 0.05], 0.025, 0.025, 4, C(DRIFT2)); },
  vh_reed_lean_to(S, R) {
    pole(S, -1.4, 0.9, 1.8, 0.05); pole(S, 1.4, 0.9, 1.8, 0.05); S.rod([-1.5, 1.75, 0.9], [1.5, 1.75, 0.9], 0.04, 0.04, 4, C(DRIFT2));
    S.blade([-1.5, 1.75, 0.9], [1.5, 1.75, 0.9], [1.5, 0.05, -1.0], [-1.5, 0.05, -1.0], C(REED));
    S.blade([-1.5, 1.7, 0.9], [-1.5, 0.05, -1.0], [-1.5, 0.05, 0.6], [-1.5, 0.05, 0.6], C(REED2));
    S.box(0.2, 0.04, -0.2, 1.8, 0.06, 0.9, C(REED2));
  },
  vh_stilt_platform(S, R) { for (const x of [-1.2, 1.2]) for (const z of [-1.2, 1.2]) pole(S, x, z, 1.25, 0.08); for (let i = 0; i < 9; i++) S.box(0, 1.2, -1.3 + i * 0.325, 2.8, 0.08, 0.28, C(i % 2 ? DRIFT : DRIFT2), { yaw: (R() - 0.5) * 0.04 }); S.box(-1.4, 0.6, 1.5, 0.12, 0.08, 0.6, C(DRIFT2), { rx: 1.1 }); },
  vh_mooring_post(S, R) { S.prism(0, 0, 6, 0.17, 0.14, 0, 1.15, [C(DRIFT), C(DRIFT2)], C('#9a8a70'), R()); S.prism(0, 0, 8, 0.24, 0.24, 0.55, 0.72, C('#8f7c56'), C('#8f7c56')); S.prism(0, 0, 8, 0.21, 0.21, 0.72, 0.86, C('#7b6a48'), null); },
  vh_charred_beams(S, R) { for (let i = 0; i < 5; i++) { const z = (i - 2) * 0.32 + (R() - 0.5) * 0.1, y = 0.12 + (i % 2) * 0.2; S.box((R() - 0.5) * 0.4, y, z, 2.6 + R() * 0.5, 0.2, 0.22, C(i % 2 ? CHAR : CHAR2), { yaw: (R() - 0.5) * 0.4, rz: (R() - 0.5) * 0.12 }); } },
  vh_pilgrim_post(S, R) { pole(S, 0, 0, 2.2, 0.05, C(DRIFT2)); for (let i = 0; i < 5; i++) { const y = 1.4 + i * 0.16, a = R() * 6.28, dx = Math.cos(a) * 0.35, dz = Math.sin(a) * 0.35; S.blade([0, y, 0], [0, y + 0.05, 0], [dx, y - 0.4, dz], [dx * 0.9, y - 0.45, dz * 0.9], C(i % 2 ? RAG : ASH2)); } },
  vh_scoria_ring(S, R) { stones(S, R, 0, 0, 0.6, 9, [C('#7a3424'), C('#5a2a20'), C(BASALT)], 0.24); S.disc(0, 0, 0.45, 0.03, C(CHAR), 9); for (let i = 0; i < 3; i++) S.rod([Math.cos(i * 2.1) * 0.35, 0.05, Math.sin(i * 2.1) * 0.35], [0, 0.3, 0], 0.05, 0.04, 4, C(CHAR2)); },
  vh_salamander_bones(S, R) {
    S.lump(1.0, 0.25, 0, 0.55, 0.25, 0.38, C(BONE), R); S.lump(1.5, 0.15, 0, 0.35, 0.14, 0.24, C(BONE), R);   // the skull and snout
    S.box(1.1, 0.4, 0.14, 0.12, 0.05, 0.08, C('#2a2620')); S.box(1.1, 0.4, -0.14, 0.12, 0.05, 0.08, C('#2a2620'));
    S.rod([0.5, 0.15, 0], [-1.3, 0.1, 0], 0.07, 0.04, 5, C(BONE));
    for (let i = 0; i < 6; i++) { const x = 0.3 - i * 0.28, w = 0.7 - i * 0.07; for (const s of [-1, 1]) { const mid = [x - 0.04, 0.42 - i * 0.03, s * w * 0.75]; S.rod([x, 0.15, 0], mid, 0.045, 0.04, 4, C(BONE)); S.rod(mid, [x - 0.08, 0.02, s * w], 0.04, 0.025, 4, C(BONE)); } }
  },
  vh_ash_drift(S, R) { S.dome(0, 0, 1.3, 0.45, 0.9, C(ASH), { cols: [C(ASH), C(ASH2), C('#9a958f')], rings: 3, segs: 11 }); S.dome(0.8, 0.4, 0.6, 0.25, 0.5, C(ASH2), { rings: 2, segs: 8 }); },
  vh_kettle(S, R) { stones(S, R, 0, 0, 0.32, 3, [C(BASALT), C(BASALT2)], 0.22); S.prism(0, 0, 10, 0.28, 0.38, 0.22, 0.55, C(IRON), null, 0); S.prism(0, 0, 10, 0.38, 0.33, 0.55, 0.72, C(IRON), C('#6b4a2a'), 0); S.rod([-0.36, 0.72, 0], [0, 0.95, 0], 0.015, 0.015, 3, C(IRON), { caps: false }); S.rod([0, 0.95, 0], [0.36, 0.72, 0], 0.015, 0.015, 3, C(IRON), { caps: false }); },
  vh_bedroll(S, R) { S.box(0, 0.03, 0, 1.9, 0.05, 0.8, C(REED), { top: C(REED2) }); S.prism(-0.75, 0, 7, 0.16, 0.16, 0.05, 0.25, C(REED2), C(REED2), 0, { sx: 0.6, sz: 2.2 }); },
};

/** Ids that burn (a flame sprite and a light, as the kit's campfire): js/client/site-view.js / vignette-props.js. */
export const VHARL_FIRE = new Set(['vh_glass_kiln', 'vh_scoria_ring']);
/**
 * Where a burning prop's flames go, in the prop's own space (x, y above its base, z; turned with the prop), with the
 * sprite size. A prop not listed gets decor.js's default — one flame low over its middle, which is right for an open
 * ring of stones. The kiln needs its own (2026-10-22): the default sat inside its 1.9 m dome, so it never showed.
 */
export const VHARL_FIRE_AT = {
  vh_glass_kiln: [
    { x: 0, y: 0.45, z: 1.42, w: 0.75, h: 0.85, light: true },     // the glowing mouth, in front of its face
    { x: 0, y: 2.5, z: 0, w: 0.45, h: 0.7 },                       // a lick of flame out of the chimney
  ],
};
/** Every island prop id this file draws. */
export const VHARL_PROP_IDS = Object.freeze(Object.keys(B));

const GEO = new Map();
/** The geometry of island prop `id` (base at y = 0), cached; null for an id this file does not draw. */
export function buildVharlProp(id) {
  if (!B[id]) return null;
  if (!GEO.has(id)) { const S = new Soup(); B[id](S, rng(hashName(id))); GEO.set(id, S.build()); }
  return GEO.get(id);
}
