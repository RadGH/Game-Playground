// Kestrel (fable attempt) — geometry core.
//
// Everything is a LOFT: a stack of cross-section rings, each ring a superellipse in its own frame (centre `c`,
// axes `u`/`v`, radii `ru`/`rv`, exponent `n`: 2 = ellipse, higher = squarer), optionally SCULPTED by radial bumps
// (a 2D Gaussian in ring-angle × ring-index space: a biceps, a pec, a calf, a glute is one bump each). Each ring
// carries the bones it is skinned to, so the one loft spans a whole limb and the skin bends at the joint by weight,
// with no seam. Rings can be marked `hidden` so the skin under a garment is not built (no poke-through, fewer tris).
//
// Pieces are authored in METRES in bind space (world space with the character standing at the origin) and merged by
// `Builder.finish()` into ONE indexed BufferGeometry with position / normal / color / skinIndex / skinWeight.
// No UVs, no textures: colour is per vertex (a function of position may paint gradients, AO, lips, blush).
import * as THREE from 'three';

const { sin, cos, abs, sign, PI, exp, sqrt } = Math;
export const TAU = PI * 2;
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
/** 0 at a, 1 at b, smooth between. */
export const sstep = (x, a, b) => smooth((x - a) / (b - a));
export const gauss = (d, w) => exp(-(d * d) / (2 * w * w));
/** Angle distance on a circle. */
export const adist = (a, b) => { let d = (a - b) % TAU; if (d > PI) d -= TAU; if (d < -PI) d += TAU; return d; };

/** Superellipse coordinates for angle a and exponent n (n = 2 is a circle). */
export function sell(a, n) {
  const c = cos(a), s = sin(a);
  if (n === 2) return [c, s];
  const k = 2 / n;
  return [sign(c) * abs(c) ** k, sign(s) * abs(s) ** k];
}

/**
 * Build a ring.  y-ring: centre (x, y, z), u = +x, v = +z, so angle 0 is the character's +x side (its left),
 * PI/2 is the front (+z), PI the right side, 3PI/2 the back.
 *   rx / rz   half-width / half-depth (metres)
 *   n         superellipse exponent (2 round, 3-4 squarish, 1.5 diamond-ish)
 *   w         [[boneName, weight], ...] (normalised later)
 *   tilt      rotation about the x axis in radians (a ring leaning forward/back)
 *   roll      rotation about the z axis (a ring leaning sideways)
 *   hidden    the skin between this ring and the next is not built
 *   f(a)      optional extra radial factor at angle a
 */
export function ringY(y, rx, rz, w, { x = 0, z = 0, n = 2, tilt = 0, roll = 0, hidden = false, f = null, phase = 0 } = {}) {
  let u = [1, 0, 0], v = [0, 0, 1];
  if (tilt) { const c = cos(tilt), s = sin(tilt); v = [0, s, c]; }        // tilt about x: +z rotates toward +y
  if (roll) { const c = cos(roll), s = sin(roll); u = [c, s, 0]; }
  return { c: [x, y, z], u, v, ru: rx, rv: rz, n, w, hidden, f, phase };
}
/** A ring in the x/y plane at depth z (feet, things that run forward). angle 0 = +x, PI/2 = +y (up). */
export function ringZ(z, rx, ry, w, { x = 0, y = 0, n = 2, hidden = false, f = null, tilt = 0, phase = 0 } = {}) {
  let v = [0, 1, 0];
  if (tilt) { const c = cos(tilt), s = sin(tilt); v = [0, c, -s]; }       // lean the ring's up axis back/forward
  return { c: [x, y, z], u: [1, 0, 0], v, ru: rx, rv: ry, n, w, hidden, f, phase };
}
/** A ring in the y/z plane at x (a limb that runs sideways: a mouth, a brow). angle 0 = +y, PI/2 = +z. */
export function ringX(x, ry, rz, w, { y = 0, z = 0, n = 2, hidden = false, f = null, phase = 0 } = {}) {
  return { c: [x, y, z], u: [0, 1, 0], v: [0, 0, 1], ru: ry, rv: rz, n, w, hidden, f, phase };
}

/**
 * A piece: positions (bind space), indices, per-vertex colour (THREE.Color-able values or null for the piece colour),
 * per-vertex bone weights [[name, w], ...], and `flat` (true = no smoothing: every face has its own vertices).
 */
export class Piece {
  constructor() { this.pos = []; this.idx = []; this.skin = []; this.col = []; this.color = '#ffffff'; this.flat = false; this.normals = null; this.tag = ''; }
  get count() { return this.pos.length / 3; }
}

/**
 * The loft. `sculpt` is a list of bumps { a, i, wa, wi, k } in (angle, ring index) space: radial scale 1 + k·gauss.
 * `S` sides per ring. Caps: 'fan' (a centre vertex), 'pinch' (last ring shrunk to a point), or false.
 * The winding is chosen so the faces point OUT (away from the loft's spine), whichever way the rings were listed.
 */
export function loft(rings, S, { capStart = false, capEnd = false, sculpt = null, color = null, flat = false, tag = '' } = {}) {
  const p = new Piece(); p.flat = flat; p.tag = tag; if (color) p.color = color;
  const R = rings.length;
  // a bump sits at angle `a` (width `wa`) and either ring index `i` (width `wi`) or height `y` in metres (width `wy`)
  const bump = (a, i) => {
    if (!sculpt) return 1;
    let k = 1;
    const y = rings[i].c[1];
    for (const b of sculpt) {
      const da = adist(a, b.a) / b.wa, di = b.y != null ? (y - b.y) / b.wy : (i - b.i) / b.wi;
      k += b.k * exp(-(da * da + di * di) / 2);
    }
    return k;
  };
  for (let i = 0; i < R; i++) {
    const r = rings[i];
    for (let j = 0; j < S; j++) {
      const a = j / S * TAU + (r.phase || 0);
      const [su, sv] = sell(a, r.n || 2);
      let k = bump(a, i); if (r.f) k *= r.f(a, j);
      const x = r.c[0] + (r.u[0] * su * r.ru + r.v[0] * sv * r.rv) * k;
      const y = r.c[1] + (r.u[1] * su * r.ru + r.v[1] * sv * r.rv) * k;
      const z = r.c[2] + (r.u[2] * su * r.ru + r.v[2] * sv * r.rv) * k;
      p.pos.push(x, y, z); p.skin.push(r.w); p.col.push(null);
    }
  }
  // orientation: the face normal of (ring i, j) -> (ring i, j+1) -> (ring i+1, j) should point away from the ring centre
  let flip = false;
  {
    const r0 = rings[0], r1 = rings[Math.min(1, R - 1)];
    const ax = r0.c[0] + r0.u[0] * r0.ru, ay = r0.c[1] + r0.u[1] * r0.ru, az = r0.c[2] + r0.u[2] * r0.ru;            // angle 0
    const bx = r0.c[0] + r0.v[0] * r0.rv, by = r0.c[1] + r0.v[1] * r0.rv, bz = r0.c[2] + r0.v[2] * r0.rv;            // angle 90
    const cx = r1.c[0] + r1.u[0] * r1.ru, cy = r1.c[1] + r1.u[1] * r1.ru, cz = r1.c[2] + r1.u[2] * r1.ru;
    const e1 = [bx - ax, by - ay, bz - az], e2 = [cx - ax, cy - ay, cz - az];
    const nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
    const out = [ax - r0.c[0], ay - r0.c[1], az - r0.c[2]];
    if (nx * out[0] + ny * out[1] + nz * out[2] < 0) flip = true;
  }
  const tri = (a, b, c) => flip ? p.idx.push(a, c, b) : p.idx.push(a, b, c);
  for (let i = 0; i < R - 1; i++) {
    if (rings[i].hidden && rings[i + 1].hidden) continue;   // a band is dropped only when BOTH its rings are under the garment
    for (let j = 0; j < S; j++) {
      const a = i * S + j, b = i * S + (j + 1) % S, c = a + S, d = b + S;
      tri(a, b, c); tri(b, d, c);
    }
  }
  const cap = (i, first) => {
    const r = rings[i];
    const ci = p.count; p.pos.push(r.c[0], r.c[1], r.c[2]); p.skin.push(r.w); p.col.push(null);
    for (let j = 0; j < S; j++) {
      const a = i * S + j, b = i * S + (j + 1) % S;
      if (first) tri(ci, a, b); else tri(ci, b, a);
    }
  };
  if (capStart && !rings[0].hidden) cap(0, true);
  if (capEnd && !rings[R - 1].hidden) cap(R - 1, false);
  return p;
}

/** Mirror a piece in x (and swap L/R bone names). The winding is reversed so faces still point out. */
export function mirrorX(src) {
  const p = new Piece(); p.flat = src.flat; p.color = src.color; p.tag = src.tag;
  for (let i = 0; i < src.count; i++) p.pos.push(-src.pos[i * 3], src.pos[i * 3 + 1], src.pos[i * 3 + 2]);
  for (let i = 0; i < src.idx.length; i += 3) p.idx.push(src.idx[i], src.idx[i + 2], src.idx[i + 1]);
  p.skin = src.skin.map(w => w.map(([b, k]) => [swapSide(b), k]));
  p.col = src.col.slice();
  return p;
}
export function swapSide(name) {
  if (name.endsWith('L')) return name.slice(0, -1) + 'R';
  if (name.endsWith('R')) return name.slice(0, -1) + 'L';
  return name;
}

/** Transform a piece in place by a matrix (positions only; weights unchanged). */
export function transform(p, m) {
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.set(p.pos[i * 3], p.pos[i * 3 + 1], p.pos[i * 3 + 2]).applyMatrix4(m); p.pos[i * 3] = v.x; p.pos[i * 3 + 1] = v.y; p.pos[i * 3 + 2] = v.z; }
  if (m.determinant() < 0) for (let i = 0; i < p.idx.length; i += 3) { const t = p.idx[i + 1]; p.idx[i + 1] = p.idx[i + 2]; p.idx[i + 2] = t; }
  return p;
}
export function translate(p, x, y, z) { for (let i = 0; i < p.count; i++) { p.pos[i * 3] += x; p.pos[i * 3 + 1] += y; p.pos[i * 3 + 2] += z; } return p; }

/** A matrix from a position and Euler rotation (XYZ) and optional scale. */
export function placeAt(pos, rot = [0, 0, 0], scl = [1, 1, 1]) {
  return new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...scl));
}
/** A frame that points the piece's +y axis along `dir` (unit), placed at `pos`. */
export function alongDir(pos, dir, roll = 0) {
  const d = new THREE.Vector3(...dir).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
  if (roll) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), roll));
  return new THREE.Matrix4().compose(new THREE.Vector3(...pos), q, new THREE.Vector3(1, 1, 1));
}

/**
 * A spike / petal: a flat-shaded pyramid from a base polygon at the origin pointing up +y, `len` long, base radii
 * `rx`/`rz`, bent by `bend` (x and z curve offsets at the tip) through `steps` rings. Used by hair.
 */
export function spike(len, rx, rz, w, { sides = 4, steps = 3, bend = [0, 0], taper = 0.15, color = null, flat = true } = {}) {
  const rings = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, k = lerp(1, taper, smooth(t));
    rings.push({ c: [bend[0] * t * t, len * t, bend[1] * t * t], u: [1, 0, 0], v: [0, 0, 1], ru: rx * k, rv: rz * k, n: 2, w, hidden: false, f: null, phase: PI / sides });
  }
  const p = loft(rings, sides, { capStart: true, capEnd: true, color, flat });
  return p;
}

/**
 * A flat polygon fan (a disc with a custom outline r(a)) in the x/y plane facing +z, `S` sides. For eyes.
 * `colorAt(a, r01)` paints by angle and radius (0 centre, 1 rim); `dome` lifts the centre by that many metres.
 */
export function disc(radius, S, w, { outline = null, colorAt = null, color = null, dome = 0, rings = 1, z = 0 } = {}) {
  const p = new Piece(); if (color) p.color = color;
  p.pos.push(0, 0, z + dome); p.skin.push(w); p.col.push(colorAt ? colorAt(0, 0) : null);
  for (let ri = 1; ri <= rings; ri++) {
    const t = ri / rings;
    for (let j = 0; j < S; j++) {
      const a = j / S * TAU, r = radius * t * (outline ? outline(a) : 1);
      p.pos.push(cos(a) * r, sin(a) * r, z + dome * (1 - t * t)); p.skin.push(w); p.col.push(colorAt ? colorAt(a, t) : null);
    }
  }
  const at = (ri, j) => ri === 0 ? 0 : 1 + (ri - 1) * S + (j % S);
  for (let ri = 1; ri <= rings; ri++) for (let j = 0; j < S; j++) {
    if (ri === 1) p.idx.push(0, at(1, j), at(1, j + 1));
    else p.idx.push(at(ri - 1, j), at(ri, j), at(ri, j + 1), at(ri - 1, j), at(ri, j + 1), at(ri - 1, j + 1));
  }
  return p;
}

/** A thin band following an outline in the x/y plane facing +z, between radius r·(1-t) and r. (Eye lash lines.) */
export function band(radius, S, w, { outline = null, inner = 0.8, a0 = 0, a1 = TAU, color = null, z = 0, thick = null } = {}) {
  const p = new Piece(); if (color) p.color = color;
  const closed = a1 - a0 >= TAU - 1e-6, n = closed ? S : S + 1;
  for (let j = 0; j < n; j++) {
    const a = a0 + (a1 - a0) * (j / S), o = outline ? outline(a) : 1, k = thick ? thick(j / S) : 1;
    const ro = radius * o, ri = ro * lerp(1, inner, k);
    p.pos.push(cos(a) * ro, sin(a) * ro, z, cos(a) * ri, sin(a) * ri, z); p.skin.push(w, w); p.col.push(null, null);
  }
  const m = closed ? S : S;
  for (let j = 0; j < m; j++) {
    const a = j * 2, b = ((j + 1) % n) * 2;
    p.idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  return p;
}

/** A sphere-ish blob (lat/long) with a radial function r(theta, phi) -> radius; for the skull. */
export function blob(rows, cols, radial, w, { color = null, tag = '', skinAt = null, colorAt = null } = {}) {
  const p = new Piece(); if (color) p.color = color; p.tag = tag;
  // pole vertices as rows 0 and `rows`; rows 1..rows-1 are rings
  for (let i = 0; i <= rows; i++) {
    const phi = i / rows * PI;                    // 0 = top, PI = bottom
    const nj = (i === 0 || i === rows) ? 1 : cols;
    for (let j = 0; j < nj; j++) {
      const th = j / cols * TAU;                  // 0 = +x, PI/2 = +z (front)
      const dx = sin(phi) * cos(th), dy = cos(phi), dz = sin(phi) * sin(th);
      const r = radial(th, phi, dx, dy, dz);
      const x = dx * r[0], y = dy * r[1], z = dz * r[2];
      p.pos.push(x, y, z); p.skin.push(skinAt ? skinAt(x, y, z) : w); p.col.push(colorAt ? colorAt(x, y, z, th, phi) : null);
    }
  }
  const at = (i, j) => i === 0 ? 0 : i === rows ? 1 + (rows - 1) * cols : 1 + (i - 1) * cols + (j % cols);
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    if (i === 0) p.idx.push(0, at(1, j + 1), at(1, j));
    else if (i === rows - 1) p.idx.push(at(i, j), at(i, j + 1), at(rows, 0));
    else p.idx.push(at(i, j), at(i, j + 1), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1), at(i + 1, j));
  }
  return p;
}

/**
 * A grid sheet: (cols+1) x (rows+1) vertices from fn(u, v) -> { p: [x,y,z], w: weights, c: colour|null }, facing the
 * direction given by the grid's winding (u along x, v along y, facing +z when p follows u→+x, v→+y).
 */
export function sheet(cols, rows, fn, { color = null, flip = false } = {}) {
  const p = new Piece(); if (color) p.color = color;
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
    const r = fn(i / cols, j / rows);
    p.pos.push(...r.p); p.skin.push(r.w); p.col.push(r.c ?? null);
  }
  const at = (i, j) => j * (cols + 1) + i;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1);
    if (flip) p.idx.push(a, c, b, b, c, d); else p.idx.push(a, b, c, b, d, c);
  }
  return p;
}

// ---------------------------------------------------------------------------- the builder

/**
 * Collects pieces (each with its own colour / colour function), computes smooth normals PER PIECE (so a brow does
 * not smooth into the skull), and merges all of them into one indexed geometry with skin attributes. `boneIndex`
 * maps a bone name to its skeleton index.
 */
export class Builder {
  constructor(boneIndex) { this.boneIndex = boneIndex; this.pieces = []; this.triangles = 0; }
  /** `colorAt(x, y, z, i)` returns a colour for a vertex or null for the piece colour. */
  add(piece, { color = null, colorAt = null, matrix = null } = {}) {
    if (matrix) transform(piece, matrix);
    if (color) piece.color = color;
    if (colorAt) piece.colorAt = colorAt;
    this.pieces.push(piece); this.triangles += piece.idx.length / 3;
    return piece;
  }
  finish() {
    const chunks = [];
    const c = new THREE.Color(), base = new THREE.Color();
    for (const p of this.pieces) {
      if (!p.idx.length) continue;
      for (let i = 0; i < p.pos.length; i++) if (!Number.isFinite(p.pos[i])) throw new Error(`Kestrel: NaN position in piece "${p.tag || p.color}" at vertex ${Math.floor(i / 3)}`);
      let pos, idx;
      if (p.flat) {
        // unshare every vertex so each face is lit as its own plane
        pos = new Float32Array(p.idx.length * 3); idx = null;
        const skin = [], col = [];
        for (let i = 0; i < p.idx.length; i++) {
          const v = p.idx[i];
          pos[i * 3] = p.pos[v * 3]; pos[i * 3 + 1] = p.pos[v * 3 + 1]; pos[i * 3 + 2] = p.pos[v * 3 + 2];
          skin.push(p.skin[v]); col.push(p.col[v]);
        }
        chunks.push(this.#chunk(pos, Array.from({ length: p.idx.length }, (_, i) => i), skin, col, p, c, base));
      } else {
        chunks.push(this.#chunk(Float32Array.from(p.pos), p.idx, p.skin, p.col, p, c, base));
      }
    }
    // merge
    let nv = 0, ni = 0;
    for (const ch of chunks) { nv += ch.pos.length / 3; ni += ch.idx.length; }
    const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), col = new Float32Array(nv * 3);
    const si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4);
    const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    let ov = 0, oi = 0;
    for (const ch of chunks) {
      const n = ch.pos.length / 3;
      pos.set(ch.pos, ov * 3); nrm.set(ch.nrm, ov * 3); col.set(ch.col, ov * 3); si.set(ch.si, ov * 4); sw.set(ch.sw, ov * 4);
      for (let i = 0; i < ch.idx.length; i++) idx[oi + i] = ch.idx[i] + ov;
      ov += n; oi += ch.idx.length;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    return g;
  }
  #chunk(pos, idx, skin, col, p, c, base) {
    const n = pos.length / 3;
    const nrm = computeNormals(pos, idx);
    const colors = new Float32Array(n * 3), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    base.set(p.color);
    for (let i = 0; i < n; i++) {
      let v = col[i];
      if (p.colorAt) { const r = p.colorAt(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], i, v); if (r != null) v = r; }
      if (v == null) c.copy(base); else c.set(v);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
      const w = skin[i] || [['root', 1]];
      let total = 0; for (const [, k] of w) total += k;
      for (let k = 0; k < 4; k++) {
        const e = w[k];
        if (!e) { si[i * 4 + k] = 0; sw[i * 4 + k] = 0; continue; }
        const bi = this.boneIndex[e[0]];
        if (bi == null) throw new Error('Kestrel: no bone ' + e[0]);
        si[i * 4 + k] = bi; sw[i * 4 + k] = e[1] / (total || 1);
      }
    }
    return { pos, idx, nrm, col: colors, si, sw };
  }
}

/** Smooth vertex normals for an indexed triangle list; a zero normal takes the direction from the chunk centre. */
export function computeNormals(pos, idx) {
  const n = pos.length / 3, nrm = new Float32Array(n * 3);
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    const e1x = pos[b] - pos[a], e1y = pos[b + 1] - pos[a + 1], e1z = pos[b + 2] - pos[a + 2];
    const e2x = pos[c] - pos[a], e2y = pos[c + 1] - pos[a + 1], e2z = pos[c + 2] - pos[a + 2];
    const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    for (const k of [a, b, c]) { nrm[k] += nx; nrm[k + 1] += ny; nrm[k + 2] += nz; }
  }
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < n; i++) { cx += pos[i * 3]; cy += pos[i * 3 + 1]; cz += pos[i * 3 + 2]; }
  cx /= n || 1; cy /= n || 1; cz /= n || 1;
  for (let i = 0; i < n; i++) {
    let x = nrm[i * 3], y = nrm[i * 3 + 1], z = nrm[i * 3 + 2], l = sqrt(x * x + y * y + z * z);
    if (!(l > 1e-12)) { x = pos[i * 3] - cx; y = pos[i * 3 + 1] - cy; z = pos[i * 3 + 2] - cz; l = sqrt(x * x + y * y + z * z) || 1; if (l < 1e-9) { x = 0; y = 1; z = 0; l = 1; } }
    nrm[i * 3] = x / l; nrm[i * 3 + 1] = y / l; nrm[i * 3 + 2] = z / l;
  }
  return nrm;
}

/** Colour helpers. */
export function shade(hex, k) { const c = new THREE.Color(hex); c.r = clamp(c.r * k, 0, 1); c.g = clamp(c.g * k, 0, 1); c.b = clamp(c.b * k, 0, 1); return '#' + c.getHexString(); }
export function mix(a, b, t) { const c = new THREE.Color(a).lerp(new THREE.Color(b), clamp(t, 0, 1)); return '#' + c.getHexString(); }
export function warm(hex, t) { return mix(hex, '#ff8a5a', t); }
