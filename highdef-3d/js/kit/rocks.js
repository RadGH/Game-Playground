/**
 * rocks.js — the procedural ROCK, CLIFF, PROP and GROUND-DETAIL kit for highdef-3d.
 *
 * Everything in here is built from plain numbers: no model files, no textures required.
 * Feed a builder a seed and it hands back one `BufferGeometry` (one draw call) plus its size.
 *
 * ---------------------------------------------------------------------------------------
 * THE GEOMETRY CONTRACT (shared with trees.js so everything can be merged and share materials)
 * ---------------------------------------------------------------------------------------
 * Every geometry carries exactly these attributes, in this order:
 *   position (3)  normal (3)  uv (2)  color (3)  aWind (2)
 *
 *   - color  : linear-space vertex colour. Baked shading lives here (darker undersides and
 *              crevices), plus per-piece tint variation so a field of rocks is not one grey.
 *   - aWind  : x = how much this vertex sways (0..1), y = a phase offset (0..1). Rock is 0,0.
 *              Cloth, hides and grass tufts use it so a wind shader can move them.
 *
 * Every geometry is NON-INDEXED with flat (per-triangle) normals unless noted, so that
 * `mergeGeometries()` accepts any mix of them. Y is up. The origin is the point that sits on
 * the ground, centred on X/Z. Rocks are sunk so ~10-15% sits below y = 0.
 *
 * Two colour modes, stored in `geometry.userData.colorMode`:
 *   'tint'   — rocks and cliffs. Colours hover around (1,1,1); the MATERIAL supplies the grey
 *              and the vertex colour only darkens, lightens or greens it (moss).
 *   'albedo' — props and ground details. These mix wood, iron, rope, bone and cloth in one
 *              geometry, so the vertex colour IS the surface colour. Render them with a white
 *              base colour (`color: 0xffffff, vertexColors: true`).
 * Vertex colours above 1.0 are the emissive mask (embers, ore, crystal, runes) and the
 * geometry also gets `userData.emissiveMask = true` so a caller can pick a glowing material.
 *
 * ---------------------------------------------------------------------------------------
 * HOW A ROCK IS MADE (the tricks, in plain words)
 * ---------------------------------------------------------------------------------------
 * 1. Start with a ball made of triangles (an icosahedron subdivided a few times).
 * 2. Push every corner in or out along its own direction by "value noise": a smooth random
 *    field, layered at four scales (big bulges, medium lumps, small grit, finer grit).
 * 3. Squash it on one axis, lean it over (skew), and pinch the top (taper) so it becomes a
 *    loaf, a slab or a spike instead of a potato.
 * 4. Flatten the bottom: any corner below a cut line is lifted up to that line. This gives
 *    the rock a bedded base so it looks like it grew out of the ground.
 * 5. Keep the normals FLAT: each triangle is its own little plane. Hard edges are what make
 *    rock read as rock at a distance; smoothing turns it into a blob.
 * 6. Bake shading into the vertex colour: darker toward the bottom, darker where a face
 *    points down, darker in the dips of the noise (crevices), greener on top when mossy.
 *
 * All randomness comes from a seeded `rng()` so the same seed always gives the same rock.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ============================================================================================
// 1. RANDOM NUMBERS AND NOISE
// ============================================================================================

/**
 * Deterministic random generator (mulberry32). Same seed -> same sequence of 0..1 numbers.
 * Accepts a number or any string (strings are hashed first).
 */
export function makeRng(seed = 1) {
  let a = seedToInt(seed);
  return function rng() {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedToInt(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) return Math.floor(seed) | 0;
  const s = String(seed);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h | 0;
}

const rand = (rng, a, b) => a + (b - a) * rng();
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
/** 0 at `a`, 1 at `b`, eased in between (works with a > b too). */
const smooth = (a, b, t) => { t = clamp((t - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const mul3 = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
/** A colour nudged a little: one overall brightness change plus a tiny per-channel one. */
function jitterColor(rng, c, k = 0.1) {
  const g = rand(rng, 1 - k, 1 + k);
  return [c[0] * g * rand(rng, 0.97, 1.03), c[1] * g * rand(rng, 0.97, 1.03), c[2] * g * rand(rng, 0.97, 1.03)];
}
/** A quick 0..1 hash of one number — used to give each rock stratum its own step size. */
const hash1 = (n) => { const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); };

/**
 * 3D value noise seeded from `rng`. `noise(x,y,z)` is a smooth random field in -1..1;
 * `fbm()` layers it at several scales (each layer twice as fine and half as strong) which is
 * what gives rock both big bulges and small grit from one function.
 */
function makeNoise(rng) {
  const perm = new Uint8Array(512);
  const vals = new Float32Array(256);
  for (let i = 0; i < 256; i++) { perm[i] = i; vals[i] = rng(); }
  for (let i = 255; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  const lat = (ix, iy, iz) => vals[perm[(ix & 255) + perm[(iy & 255) + perm[iz & 255]]]];
  const fade = (t) => t * t * (3 - 2 * t);
  function noise(x, y, z) {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    const fx = fade(x - ix), fy = fade(y - iy), fz = fade(z - iz);
    const x00 = lerp(lat(ix, iy, iz), lat(ix + 1, iy, iz), fx);
    const x10 = lerp(lat(ix, iy + 1, iz), lat(ix + 1, iy + 1, iz), fx);
    const x01 = lerp(lat(ix, iy, iz + 1), lat(ix + 1, iy, iz + 1), fx);
    const x11 = lerp(lat(ix, iy + 1, iz + 1), lat(ix + 1, iy + 1, iz + 1), fx);
    return lerp(lerp(x00, x10, fy), lerp(x01, x11, fy), fz) * 2 - 1;
  }
  function fbm(x, y, z, octaves = 4, gain = 0.5, lac = 2.0) {
    let sum = 0, amp = 1, norm = 0, f = 1;
    for (let o = 0; o < octaves; o++) { sum += amp * noise(x * f, y * f, z * f); norm += amp; amp *= gain; f *= lac; }
    return sum / norm;
  }
  return { noise, fbm };
}

// ============================================================================================
// 2. COLOURS (linear space) AND SMALL MATHS HELPERS
// ============================================================================================

const WHITE = [1, 1, 1];
const NO_WIND = [0, 0];
const C = {
  wood: [0.42, 0.28, 0.15], woodDark: [0.25, 0.16, 0.09], woodCut: [0.70, 0.55, 0.33], bark: [0.30, 0.22, 0.14],
  iron: [0.16, 0.16, 0.17], rope: [0.52, 0.44, 0.28], stone: [0.48, 0.47, 0.45], stoneDark: [0.30, 0.30, 0.29],
  ash: [0.20, 0.19, 0.18], charcoal: [0.07, 0.06, 0.06], straw: [0.72, 0.58, 0.28], bone: [0.80, 0.76, 0.66],
  clothRed: [0.55, 0.13, 0.11], clothPale: [0.80, 0.74, 0.60], hide: [0.50, 0.36, 0.22], moss: [0.28, 0.40, 0.13],
  lichen: [0.64, 0.68, 0.52], snow: [0.92, 0.94, 0.98], sand: [0.76, 0.66, 0.45], mud: [0.28, 0.22, 0.15],
  water: [0.10, 0.14, 0.18], capBrown: [0.60, 0.38, 0.20], capRed: [0.62, 0.16, 0.10], stem: [0.85, 0.80, 0.68],
  root: [0.30, 0.22, 0.14], cone: [0.36, 0.24, 0.13],
  // These sit above 1.0 on purpose: they are the emissive mask.
  ember: [1.7, 0.55, 0.12], ore: [1.5, 1.05, 0.35], crystal: [0.55, 1.35, 1.55], rune: [0.45, 1.45, 1.25],
};
const UV_PER_METRE = 1; // a texture repeats once per metre in the triplanar mapping

const _v = new THREE.Vector3();
/** Apply a Matrix4 to a plain [x,y,z] and return a new array. */
function xf(M, p) { _v.set(p[0], p[1], p[2]).applyMatrix4(M); return [_v.x, _v.y, _v.z]; }
/** Build a Matrix4 from { at:[x,y,z], rot:[rx,ry,rz] (radians, XYZ order), scale: n | [x,y,z] }. */
function mat(o = {}) {
  const at = o.at || [0, 0, 0], rot = o.rot || [0, 0, 0];
  const s = o.scale == null ? 1 : o.scale;
  const sv = Array.isArray(s) ? s : [s, s, s];
  return new THREE.Matrix4().compose(
    new THREE.Vector3(at[0], at[1], at[2]),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], 'XYZ')),
    new THREE.Vector3(sv[0], sv[1], sv[2]));
}
/** Pick a value for this LOD: full / medium / coarse. */
const byLod = (lod, a, b, c) => (lod >= 2 ? c : lod === 1 ? b : a);

/**
 * Triplanar UVs for one flat triangle: look at which way its normal mostly points and use the
 * other two coordinates as the texture coordinates. Cheap, seamless enough for rock, and it
 * never stretches the way a sphere mapping does.
 */
function triplanarUV(a, b, c, nx, ny, nz) {
  const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
  const k = UV_PER_METRE;
  const f = (ax >= ay && ax >= az) ? (p) => [p[2] * k, p[1] * k]
    : (ay >= az) ? (p) => [p[0] * k, p[2] * k]
      : (p) => [p[0] * k, p[1] * k];
  return [f(a), f(b), f(c)];
}

// ============================================================================================
// 3. THE MESH BUILDER — collects triangles, hands back one contract geometry
// ============================================================================================

class MeshBuilder {
  constructor() { this.pos = []; this.col = []; this.uv = []; this.wind = []; }
  get triCount() { return this.pos.length / 9; }

  /**
   * Add one triangle. `color` and `wind` may be a single value or one per corner.
   * Zero-area triangles (a lathe's pole, a chamfer of size 0) are dropped here so they never
   * cost anything and never produce a broken normal.
   */
  tri(a, b, c, color = WHITE, wind = NO_WIND, uvs = null) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * nx + ny * ny + nz * nz < 1e-14) return;
    if (!uvs) uvs = triplanarUV(a, b, c, nx, ny, nz);
    const cols = Array.isArray(color[0]) ? color : [color, color, color];
    const winds = Array.isArray(wind[0]) ? wind : [wind, wind, wind];
    const pts = [a, b, c];
    for (let k = 0; k < 3; k++) {
      const p = pts[k], cc = cols[k], w = winds[k], t = uvs[k];
      this.pos.push(p[0], p[1], p[2]);
      this.col.push(cc[0], cc[1], cc[2]);
      this.wind.push(w[0], w[1]);
      this.uv.push(t[0], t[1]);
    }
  }
  quad(a, b, c, d, color, wind) { this.tri(a, b, c, color, wind); this.tri(a, c, d, color, wind); }

  /** A triangle whose winding is fixed so its normal points AWAY from `center`. */
  triOut(a, b, c, center, color, wind) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const cx = (a[0] + b[0] + c[0]) / 3 - center[0], cy = (a[1] + b[1] + c[1]) / 3 - center[1], cz = (a[2] + b[2] + c[2]) / 3 - center[2];
    if (nx * cx + ny * cy + nz * cz < 0) {
      const swapC = Array.isArray(color?.[0]) ? [color[0], color[2], color[1]] : color;
      const swapW = Array.isArray(wind?.[0]) ? [wind[0], wind[2], wind[1]] : wind;
      this.tri(a, c, b, swapC, swapW);
    } else this.tri(a, b, c, color, wind);
  }
  quadOut(a, b, c, d, center, color, wind) { this.triOut(a, b, c, center, color, wind); this.triOut(a, c, d, center, color, wind); }

  /** Append a finished contract geometry (non-indexed), transformed by `M`. */
  add(geom, M) {
    const p = geom.getAttribute('position'), c = geom.getAttribute('color'), u = geom.getAttribute('uv'), w = geom.getAttribute('aWind');
    for (let i = 0; i < p.count; i++) {
      const q = M ? xf(M, [p.getX(i), p.getY(i), p.getZ(i)]) : [p.getX(i), p.getY(i), p.getZ(i)];
      this.pos.push(q[0], q[1], q[2]);
      if (c) this.col.push(c.getX(i), c.getY(i), c.getZ(i)); else this.col.push(1, 1, 1);
      if (u) this.uv.push(u.getX(i), u.getY(i)); else this.uv.push(0, 0);
      if (w) this.wind.push(w.getX(i), w.getY(i)); else this.wind.push(0, 0);
    }
  }

  /** Re-colour vertices added after `fromTri` using fn(x, y, z, [r,g,b]) -> [r,g,b]. */
  paint(fromTri, fn) {
    for (let i = fromTri * 3; i < this.pos.length / 3; i++) {
      const out = fn(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2], [this.col[i * 3], this.col[i * 3 + 1], this.col[i * 3 + 2]]);
      if (out) { this.col[i * 3] = out[0]; this.col[i * 3 + 1] = out[1]; this.col[i * 3 + 2] = out[2]; }
    }
  }

  /** Finish: attributes in contract order, flat (or welded-smooth) normals, bounding sphere. */
  build({ smooth: smoothNormalsWanted = false } = {}) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(this.pos.length), 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aWind', new THREE.Float32BufferAttribute(this.wind, 2));
    if (smoothNormalsWanted) smoothNormals(g); else g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

/**
 * Smooth normals on a non-indexed geometry: corners that sit at the same spot get the average
 * of their triangles' normals. Used for snow, sand and puddles where facets would look wrong.
 */
function smoothNormals(g) {
  const p = g.getAttribute('position'), n = g.getAttribute('normal');
  const acc = new Map();
  const key = (i) => `${Math.round(p.getX(i) * 1e4)},${Math.round(p.getY(i) * 1e4)},${Math.round(p.getZ(i) * 1e4)}`;
  const fa = new THREE.Vector3(), fb = new THREE.Vector3(), fc = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    fa.fromBufferAttribute(p, i); fb.fromBufferAttribute(p, i + 1); fc.fromBufferAttribute(p, i + 2);
    fb.sub(fa); fc.sub(fa); fb.cross(fc); // face normal, length = 2x area (so big faces weigh more)
    for (let k = 0; k < 3; k++) {
      const id = key(i + k);
      const s = acc.get(id) || [0, 0, 0];
      s[0] += fb.x; s[1] += fb.y; s[2] += fb.z;
      acc.set(id, s);
    }
  }
  for (let i = 0; i < p.count; i++) {
    const s = acc.get(key(i));
    const len = Math.hypot(s[0], s[1], s[2]) || 1;
    n.setXYZ(i, s[0] / len, s[1] / len, s[2] / len);
  }
  n.needsUpdate = true;
}

/**
 * Merge several contract geometries into one (for callers batching kit pieces). Every input is
 * already non-indexed with the same five attributes, which is exactly what mergeGeometries needs.
 */
export function mergeParts(geometries) {
  const g = mergeGeometries(geometries.filter(Boolean), false);
  g.computeBoundingSphere();
  return g;
}

// ============================================================================================
// 4. PRIMITIVES — chamfered box, lathe, tube, cloth, disc
// ============================================================================================

/**
 * A box with its twelve edges shaved off (`chamfer` metres). A sharp 90° edge catches no light
 * and reads as a programmer's cube; a small bevel gives every plank a bright rim.
 * 6 face quads + 12 edge strips + 8 corner triangles = 44 triangles (12 when chamfer = 0).
 * `colorOf(axis, sign)` may colour each face differently (cut ends of a plank, say).
 */
function box(m, size, color, o = {}) {
  const M = o.matrix || mat(o);
  const hx = size[0] / 2, hy = size[1] / 2, hz = size[2] / 2;
  const c = Math.min(o.chamfer ?? 0.02, hx * 0.45, hy * 0.45, hz * 0.45);
  const center = xf(M, [0, 0, 0]);
  const wind = o.wind || NO_WIND;
  const colorOf = o.colorOf || (() => color);
  const edgeCol = mul3(color, 1.08);
  const S = [-1, 1];
  const P = (sx, sy, sz, axis) => xf(M, [
    sx * (axis === 0 ? hx : hx - c), sy * (axis === 1 ? hy : hy - c), sz * (axis === 2 ? hz : hz - c)]);
  for (let axis = 0; axis < 3; axis++) for (const s of S) {
    const corners = [];
    for (const s1 of S) for (const s2 of S) {
      const sg = [0, 0, 0]; sg[axis] = s; sg[(axis + 1) % 3] = s1; sg[(axis + 2) % 3] = s2;
      corners.push(P(sg[0], sg[1], sg[2], axis));
    }
    m.quadOut(corners[0], corners[1], corners[3], corners[2], center, colorOf(axis, s), wind);
  }
  if (c <= 0) return;
  for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) {
    const e = 3 - a - b; // the axis the edge runs along
    for (const sa of S) for (const sb of S) {
      const pts = [];
      for (const se of S) {
        const sg = [0, 0, 0]; sg[a] = sa; sg[b] = sb; sg[e] = se;
        pts.push(P(sg[0], sg[1], sg[2], a), P(sg[0], sg[1], sg[2], b));
      }
      m.quadOut(pts[0], pts[1], pts[3], pts[2], center, edgeCol, wind);
    }
  }
  for (const sx of S) for (const sy of S) for (const sz of S) {
    m.triOut(P(sx, sy, sz, 0), P(sx, sy, sz, 1), P(sx, sy, sz, 2), center, edgeCol, wind);
  }
}

/**
 * A lathe: spin a profile of [radius, y] points around the Y axis. Draw the profile from the
 * bottom centre, outward, up the side and back in to the top centre and the normals come out
 * facing outward; go inward and down again and you get a hollow (a bucket, a well).
 * A closed loop (first point == last point) makes a ring, like a barrel hoop.
 * `color` may be a function (ringIndex, segIndex) -> colour: barrel staves, block courses.
 * `o.jitter(ring, seg, angle)` -> [dRadius, dY] roughens the surface (hay, a broken column).
 * Triangles: (profile points - 1) * radial * 2, minus the degenerate ones at the poles.
 */
function lathe(m, profile, radial, color, o = {}) {
  const M = o.matrix || mat(o);
  const colorOf = typeof color === 'function' ? color : () => color;
  const wind = o.wind || NO_WIND;
  const rings = [];
  for (let j = 0; j < profile.length; j++) {
    const ring = [];
    for (let k = 0; k <= radial; k++) {
      const kk = k % radial; // the last point repeats the first, so the seam closes
      const ang = (kk / radial) * Math.PI * 2;
      let r = profile[j][0], y = profile[j][1];
      if (o.jitter) { const d = o.jitter(j, kk, ang); r += d[0]; y += d[1]; }
      ring.push(xf(M, [r * Math.cos(ang), y, r * Math.sin(ang)]));
    }
    rings.push(ring);
  }
  for (let j = 0; j < profile.length - 1; j++) {
    for (let k = 0; k < radial; k++) {
      m.quad(rings[j][k], rings[j + 1][k], rings[j + 1][k + 1], rings[j][k + 1], colorOf(j, k), wind);
    }
  }
}
/** Radius of a lathe profile at height y (straight-line between the two nearest points). */
function profileRadiusAt(profile, y) {
  for (let j = 0; j < profile.length - 1; j++) {
    const [r0, y0] = profile[j], [r1, y1] = profile[j + 1];
    if ((y >= y0 && y <= y1) || (y >= y1 && y <= y0)) { const t = y1 === y0 ? 0 : (y - y0) / (y1 - y0); return lerp(r0, r1, t); }
  }
  return profile[profile.length - 1][0];
}
/** A plain post/log: a lathe cylinder with optional different end colours (cut wood). */
function cylinder(m, r0, r1, h, radial, color, o = {}) {
  const capCol = o.capColor || color;
  const colorOf = typeof color === 'function' ? color : (j) => (j === 0 || j === 2 ? capCol : color);
  lathe(m, [[0, 0], [r0, 0], [r1, h], [0, h]], radial, colorOf, o);
}

/**
 * A tube along a path of points with a radius that can change along it (roots, arches, ropes).
 * Ring orientation is carried from one point to the next ("parallel transport") so the tube
 * never twists suddenly where the path bends.
 */
function tube(m, pts, radiusAt, sides, color, o = {}) {
  const n = pts.length;
  if (n < 2) return;
  const wind = o.wind || NO_WIND;
  const T = [], N = [], B = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[Math.min(n - 1, i + 1)];
    const t = new THREE.Vector3(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]).normalize();
    T.push(t);
    let nn;
    if (i === 0) {
      const up = Math.abs(t.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      nn = up.sub(t.clone().multiplyScalar(t.dot(up))).normalize();
    } else {
      nn = N[i - 1].clone(); nn.sub(t.clone().multiplyScalar(t.dot(nn)));
      if (nn.lengthSq() < 1e-8) nn.set(0, 1, 0).sub(t.clone().multiplyScalar(t.y));
      nn.normalize();
    }
    N.push(nn); B.push(t.clone().cross(nn));
  }
  const rings = [];
  for (let i = 0; i < n; i++) {
    const r = radiusAt(i / (n - 1), i);
    const ring = [];
    for (let k = 0; k <= sides; k++) {
      const kk = k % sides, ang = (kk / sides) * Math.PI * 2;
      const c = Math.cos(ang), s = Math.sin(ang);
      let rr = r;
      const px = pts[i][0] + (N[i].x * c + B[i].x * s) * r, py = pts[i][1] + (N[i].y * c + B[i].y * s) * r, pz = pts[i][2] + (N[i].z * c + B[i].z * s) * r;
      if (o.noiseFn) rr = r * (1 + o.noiseFn(px, py, pz));
      ring.push([pts[i][0] + (N[i].x * c + B[i].x * s) * rr, pts[i][1] + (N[i].y * c + B[i].y * s) * rr, pts[i][2] + (N[i].z * c + B[i].z * s) * rr]);
    }
    rings.push(ring);
  }
  const colorOf = typeof color === 'function' ? color : () => color;
  for (let i = 0; i < n - 1; i++) {
    const mid = [(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2, (pts[i][2] + pts[i + 1][2]) / 2];
    for (let k = 0; k < sides; k++) {
      m.quadOut(rings[i][k], rings[i][k + 1], rings[i + 1][k + 1], rings[i + 1][k], mid, colorOf(i, k), wind);
    }
  }
  if (o.caps) {
    for (const [i, j] of [[0, 1], [n - 1, n - 2]]) {
      const inside = [lerp(pts[i][0], pts[j][0], 0.2), lerp(pts[i][1], pts[j][1], 0.2), lerp(pts[i][2], pts[j][2], 0.2)];
      for (let k = 0; k < sides; k++) m.triOut(pts[i], rings[i][k], rings[i][k + 1], inside, o.capColor || colorOf(i, k), wind);
    }
  }
}

/**
 * A hanging sheet of cloth or hide: a grid `w` wide, `h` tall, attached along its TOP edge
 * (local y = 0) and hanging down to y = -h. Both sides are emitted so it lights from either
 * direction. Wind strength grows from 0 at the attached edge to 1 at the free edge.
 */
function cloth(m, w, h, nx, ny, colorOf, o = {}) {
  const M = o.matrix || mat(o);
  const windOf = o.windOf || ((u, v) => [v * (o.windMax ?? 1), (u * 0.35 + (o.phase || 0)) % 1]);
  const sag = o.sag || 0;
  const P = [];
  for (let i = 0; i <= nx; i++) {
    const col = [];
    for (let j = 0; j <= ny; j++) {
      const u = i / nx, v = j / ny;
      const z = sag * Math.sin(u * Math.PI) * v; // a gentle belly so it is not a flat plane
      col.push({ p: xf(M, [-w / 2 + w * u, -h * v, z]), c: colorOf(u, v), wd: windOf(u, v) });
    }
    P.push(col);
  }
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const A = P[i][j], B = P[i + 1][j], Cc = P[i + 1][j + 1], D = P[i][j + 1];
    m.tri(A.p, B.p, Cc.p, [A.c, B.c, Cc.c], [A.wd, B.wd, Cc.wd]);
    m.tri(A.p, Cc.p, D.p, [A.c, Cc.c, D.c], [A.wd, Cc.wd, D.wd]);
    m.tri(A.p, Cc.p, B.p, [A.c, Cc.c, B.c], [A.wd, Cc.wd, B.wd]);
    m.tri(A.p, D.p, Cc.p, [A.c, D.c, Cc.c], [A.wd, D.wd, Cc.wd]);
  }
}

/**
 * A round patch of ground: rings of triangles from the centre out to `radius`, with
 * fn(x, z, t, angle) -> { y, color, wind } shaping and colouring every point (t = 0 centre,
 * 1 rim). `rimNoise` wobbles the outline so it is not a perfect polygon.
 * Triangles: rings * segs * 2 - segs.
 */
function disc(m, rng, radius, rings, segs, fn, o = {}) {
  const wob = [];
  for (let k = 0; k < segs; k++) wob.push(1 + (o.rimNoise || 0) * (rng() - 0.5) * 2);
  const BELOW = [0, -1000, 0];
  const P = [];
  for (let i = 0; i <= rings; i++) {
    const row = [];
    for (let k = 0; k <= segs; k++) {
      const kk = k % segs, t = i / rings;
      const ang = (kk / segs) * Math.PI * 2 + (i > 0 && i < rings ? (hash1(i * 7 + kk) - 0.5) * 0.5 / segs * Math.PI * 2 : 0);
      const r = radius * t * lerp(1, wob[kk], t);
      const x = r * Math.cos(ang), z = r * Math.sin(ang);
      const s = fn(x, z, t, ang);
      row.push({ p: [x, s.y, z], c: s.color, w: s.wind || NO_WIND });
    }
    P.push(row);
  }
  for (let i = 0; i < rings; i++) for (let k = 0; k < segs; k++) {
    const A = P[i][k], B = P[i + 1][k], Cc = P[i + 1][k + 1], D = P[i][k + 1];
    m.triOut(A.p, B.p, Cc.p, BELOW, [A.c, B.c, Cc.c], [A.w, B.w, Cc.w]);
    m.triOut(A.p, Cc.p, D.p, BELOW, [A.c, Cc.c, D.c], [A.w, Cc.w, D.w]);
  }
}

/** A few crossed grass blades (two quads at right angles), swaying with the wind. */
function grassTuft(m, rng, at, h, color) {
  const w = h * 0.5;
  for (let q = 0; q < 2; q++) {
    const a = q * Math.PI / 2 + rng() * 0.6, c = Math.cos(a) * w / 2, s = Math.sin(a) * w / 2;
    const p0 = [at[0] - c, at[1], at[2] - s], p1 = [at[0] + c, at[1], at[2] + s];
    const p2 = [at[0] + c, at[1] + h, at[2] + s], p3 = [at[0] - c, at[1] + h, at[2] - s];
    const ph = rng();
    const wind = [[0, ph], [0, ph], [0.35, ph], [0.35, ph]];
    const cols = [mul3(color, 0.6), mul3(color, 0.6), color, color];
    m.tri(p0, p1, p2, [cols[0], cols[1], cols[2]], [wind[0], wind[1], wind[2]]);
    m.tri(p0, p2, p3, [cols[0], cols[2], cols[3]], [wind[0], wind[2], wind[3]]);
    m.tri(p0, p2, p1, [cols[0], cols[2], cols[1]], [wind[0], wind[2], wind[1]]);
    m.tri(p0, p3, p2, [cols[0], cols[3], cols[2]], [wind[0], wind[3], wind[2]]);
  }
}

// ============================================================================================
// 5. THE ROCK CORE — one deformed icosahedron, shaped, flattened, shaded
// ============================================================================================
// Icosahedron triangle counts by `detail`: 0=20  1=80  2=180  3=320  4=500  5=720  6=980
// (three.js subdivides each of the 20 faces into (detail+1)^2 triangles).

/**
 * Build one rock in "unit" space (about 2 units across before shaping) and return its contract
 * geometry with the base at y = 0. Options:
 *   detail   icosahedron subdivision (see the table above)
 *   amp/freq noise strength (fraction of radius) and scale; octaves = layers of noise
 *   sx,sy,sz squash factors; skew leans the top over in x; taper > 0 pinches the top, < 0 the base
 *   cut      fraction of the height sliced off the bottom to make the flat bed
 *   strata   number of horizontal bands stepped in/out (sedimentary look); strataAmp = step size
 *   crack    { width, depth } carves one jagged groove through the rock
 *   moss     0..1 how green the up-facing triangles get
 *   ore      true = thin bright streaks tagged as emissive
 *   base     colour multiplier for the whole rock (default white = "tint" mode)
 *   tintVar  how far the per-rock brightness may wander from 1 (default 0.15)
 *   paint    fn(x, y, z, nx, ny, nz, [r,g,b]) -> [r,g,b] for custom marks (runes, eye sockets)
 */
function rockCore(rng, p = {}) {
  const noise = makeNoise(rng);
  let g = new THREE.IcosahedronGeometry(1, p.detail ?? 3);
  if (g.index) g = g.toNonIndexed();
  const pos = g.getAttribute('position');
  const count = pos.count;
  const disp = new Float32Array(count);
  const amp = p.amp ?? 0.2, freq = p.freq ?? 1.5, octaves = p.octaves ?? 4;
  const off = [rng() * 100, rng() * 100, rng() * 100];
  const sx = p.sx ?? 1, sy = p.sy ?? 1, sz = p.sz ?? 1, skew = p.skew ?? 0, taper = p.taper ?? 0;
  const strata = p.strata ?? 0, strataAmp = p.strataAmp ?? 0.1, strataSeed = rng() * 10;
  let crackN = null;
  if (p.crack) {
    const a = rng() * Math.PI * 2;
    crackN = new THREE.Vector3(Math.cos(a), rand(rng, -0.35, 0.35), Math.sin(a)).normalize();
  }
  const v = new THREE.Vector3();
  // --- 1-3: noise push, strata steps, crack, then shaping ---
  for (let i = 0; i < count; i++) {
    v.fromBufferAttribute(pos, i);
    const d = noise.fbm(v.x * freq + off[0], v.y * freq + off[1], v.z * freq + off[2], octaves);
    disp[i] = d;
    let r = 1 + amp * d;
    if (strata > 0) {
      const band = Math.floor((v.y + 1) * 0.5 * strata);
      r += (hash1(band + strataSeed) - 0.5) * 2 * strataAmp;
    }
    if (crackN) {
      const dist = v.dot(crackN) + 0.12 * noise.noise(v.x * 4 + off[0], v.y * 4, v.z * 4);
      const t = 1 - Math.abs(dist) / p.crack.width;
      if (t > 0) { r -= p.crack.depth * t * t; disp[i] = Math.min(disp[i], -1.2 * t); }
    }
    v.multiplyScalar(r);
    const k = 1 - taper * clamp((v.y + 1) / 2, 0, 1);
    v.x *= sx * k; v.z *= sz * k; v.y *= sy;
    v.x += skew * v.y;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  // --- 4: flatten the bottom and put the base at y = 0 ---
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < count; i++) { const y = pos.getY(i); if (y < minY) minY = y; if (y > maxY) maxY = y; }
  const cut = minY + (maxY - minY) * (p.cut ?? 0.15);
  for (let i = 0; i < count; i++) pos.setY(i, Math.max(pos.getY(i), cut) - cut);
  const height = maxY - cut;
  // --- 5: flat normals ---
  g.computeVertexNormals();
  const nrm = g.getAttribute('normal');
  // --- 6: baked shading in the vertex colour ---
  const base = p.base || WHITE;
  const tint = rand(rng, 1 - (p.tintVar ?? 0.15), 1 + (p.tintVar ?? 0.15));
  const warm = rand(rng, -0.04, 0.04);
  const tintC = [base[0] * tint * (1 + warm), base[1] * tint, base[2] * tint * (1 - warm)];
  const mossC = [0.62, 1.05, 0.38]; // multiplies a grey into a moss green
  const col = new Float32Array(count * 3);
  const wind = new Float32Array(count * 2);
  let emissive = false;
  for (let i = 0; i < count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const nx = nrm.getX(i), ny = nrm.getY(i), nz = nrm.getZ(i);
    const hf = height > 0 ? y / height : 1;
    let shade = 1 - 0.35 * (1 - hf) * (1 - hf);                 // darker toward the ground
    if (ny < 0) shade *= 1 + 0.45 * ny;                          // faces pointing down are in shadow
    shade *= 1 - 0.5 * Math.max(0, -disp[i]) * (p.crevice ?? 0.7); // dips of the noise are crevices
    let c = mul3(tintC, shade);
    if (p.moss) {
      const spread = 0.55 + 0.45 * (noise.noise(x * 3 + off[0], y * 3, z * 3) * 0.5 + 0.5);
      const mAmt = smooth(0.45, 0.85, ny) * spread * Math.sqrt(hf) * p.moss;
      c = mix3(c, [c[0] * mossC[0], c[1] * mossC[1], c[2] * mossC[2]], mAmt);
    }
    if (p.ore) {
      const streak = noise.fbm(x * 2.5 + off[1], y * 7, z * 2.5 + off[2], 3);
      if (Math.abs(streak) < 0.09) { c = C.ore; emissive = true; }
    }
    if (p.paint) c = p.paint(x, y, z, nx, ny, nz, c) || c;
    col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
  }
  // --- triplanar uvs, one flat triangle at a time ---
  const uv = new Float32Array(count * 2);
  for (let i = 0; i < count; i += 3) {
    const a = [pos.getX(i), pos.getY(i), pos.getZ(i)], b = [pos.getX(i + 1), pos.getY(i + 1), pos.getZ(i + 1)], c2 = [pos.getX(i + 2), pos.getY(i + 2), pos.getZ(i + 2)];
    const t = triplanarUV(a, b, c2, nrm.getX(i), nrm.getY(i), nrm.getZ(i));
    for (let k = 0; k < 3; k++) { uv[(i + k) * 2] = t[k][0]; uv[(i + k) * 2 + 1] = t[k][1]; }
  }
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aWind', new THREE.Float32BufferAttribute(wind, 2));
  g.computeBoundingBox();
  const bb = g.boundingBox;
  return { geom: g, height, width: Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z), emissive, bb };
}

/**
 * Drop one rock into a builder at real size. `size` is the width across (or the height when
 * `tall` is set); `sink` is the fraction of its height buried below the ground line.
 */
function placeRock(m, rng, o) {
  const core = rockCore(rng, o);
  const s = o.size / (o.tall ? core.height : core.width);
  const sink = (o.sink ?? 0.12) * core.height * s;
  const at = o.at || [0, 0, 0];
  const M = mat({ at: [at[0], at[1] - sink, at[2]], rot: o.rot || [0, rng() * Math.PI * 2, 0], scale: s });
  const from = m.triCount;
  m.add(core.geom, M);
  return { height: core.height * s - sink, radius: core.width * s / 2, emissive: core.emissive, from, scale: s };
}

// ============================================================================================
// 6. ROCKS
// ============================================================================================
// Triangle budgets (lod 0 / 1 / 2):
//   pebble 180/80/20   stone 320/180/80   boulder, mossy_boulder(+32 grass), shard, slab,
//   cracked_boulder, standing_stone, ore_vein 720/180/80   rock_cluster ~900-1260/320-400/60
//   cairn ~1100-1600/480-640/80   crystal_cluster ~580/300/70

const ROCK_SIZES = {
  pebble: [0.1, 0.3], stone: [0.3, 0.8], boulder: [1.2, 3.5], mossy_boulder: [1.2, 3.5], shard: [0.8, 2.2],
  slab: [1.0, 3.0], cracked_boulder: [1.4, 3.5], rock_cluster: [1.5, 4.0], standing_stone: [2.5, 4.5],
  cairn: [0.6, 1.6], ore_vein: [1.0, 2.5], crystal_cluster: [0.6, 1.4],
};

const ROCK_BUILDERS = {
  pebble(m, rng, lod, size) {
    return placeRock(m, rng, { detail: byLod(lod, 2, 1, 0), size, amp: 0.10, freq: 2.2, sx: rand(rng, 0.8, 1.3), sy: rand(rng, 0.45, 0.75), sz: rand(rng, 0.8, 1.2), cut: 0.15, sink: 0.1 });
  },
  stone(m, rng, lod, size) {
    return placeRock(m, rng, { detail: byLod(lod, 3, 2, 1), size, amp: 0.16, freq: 1.8, sx: rand(rng, 0.9, 1.4), sy: rand(rng, 0.55, 0.9), sz: rand(rng, 0.8, 1.1), skew: rand(rng, -0.1, 0.1), taper: rand(rng, -0.1, 0.25), cut: 0.15 });
  },
  boulder(m, rng, lod, size, extra = {}) {
    return placeRock(m, rng, { detail: byLod(lod, 5, 2, 1), size, amp: 0.22, freq: 1.5, sx: rand(rng, 0.9, 1.3), sy: rand(rng, 0.6, 0.95), sz: rand(rng, 0.8, 1.1), skew: rand(rng, -0.15, 0.15), taper: rand(rng, -0.1, 0.3), cut: rand(rng, 0.15, 0.22), strata: rng() < 0.4 ? 4 : 0, strataAmp: 0.06, ...extra });
  },
  mossy_boulder(m, rng, lod, size) {
    const r = ROCK_BUILDERS.boulder(m, rng, lod, size, { moss: rand(rng, 0.7, 1.0) });
    if (lod === 0) { // a few grass tufts on the crown; they carry wind
      for (let i = 0; i < 8; i++) {
        const a = rng() * Math.PI * 2, d = rng() * r.radius * 0.5;
        grassTuft(m, rng, [Math.cos(a) * d, r.height * 0.92, Math.sin(a) * d], rand(rng, 0.12, 0.22), [0.7, 1.1, 0.45]);
      }
    }
    return r;
  },
  shard(m, rng, lod, size) {
    return placeRock(m, rng, { detail: byLod(lod, 5, 2, 1), size, tall: true, amp: 0.18, freq: 2.0, sx: 0.55, sy: 1.8, sz: 0.38, skew: rand(rng, -0.25, 0.25), taper: rand(rng, 0.55, 0.8), cut: 0.08, sink: 0.15, rot: [rand(rng, -0.12, 0.12), rng() * Math.PI * 2, rand(rng, -0.12, 0.12)] });
  },
  slab(m, rng, lod, size) {
    return placeRock(m, rng, { detail: byLod(lod, 5, 2, 1), size, amp: 0.14, freq: 1.6, sx: 1.4, sy: rand(rng, 0.28, 0.42), sz: 1.0, cut: 0.2, strata: 3, strataAmp: 0.08, rot: [rand(rng, -0.1, 0.1), rng() * Math.PI * 2, 0], sink: 0.15 });
  },
  cracked_boulder(m, rng, lod, size) {
    return ROCK_BUILDERS.boulder(m, rng, lod, size, { crack: { width: rand(rng, 0.12, 0.2), depth: rand(rng, 0.18, 0.3) } });
  },
  standing_stone(m, rng, lod, size) {
    return placeRock(m, rng, { detail: byLod(lod, 5, 2, 1), size, tall: true, amp: 0.13, freq: 1.8, sx: 0.85, sy: 2.4, sz: 0.42, skew: rand(rng, -0.08, 0.08), taper: rand(rng, 0.15, 0.35), cut: 0.1, sink: 0.12, rot: [rand(rng, -0.05, 0.05), rng() * Math.PI * 2, rand(rng, -0.05, 0.05)] });
  },
  ore_vein(m, rng, lod, size) {
    return ROCK_BUILDERS.boulder(m, rng, lod, size, { ore: true, strata: 0 });
  },
  rock_cluster(m, rng, lod, size) {
    // several stones of different seeds, packed around the centre — ONE geometry
    const n = byLod(lod, 5 + Math.floor(rng() * 3), 4 + Math.floor(rng() * 2), 3);
    let height = 0;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng() * 1.2, d = i === 0 ? 0 : rand(rng, 0.2, 0.4) * size;
      const s = (i === 0 ? rand(rng, 0.45, 0.6) : rand(rng, 0.2, 0.4)) * size;
      const r = placeRock(m, rng, { detail: byLod(lod, 2, 1, 0), size: s, amp: 0.18, freq: 1.8, sx: rand(rng, 0.9, 1.3), sy: rand(rng, 0.55, 0.9), sz: rand(rng, 0.8, 1.1), taper: rand(rng, -0.1, 0.25), cut: 0.18, sink: 0.2, at: [Math.cos(a) * d, 0, Math.sin(a) * d], rot: [rand(rng, -0.15, 0.15), rng() * Math.PI * 2, rand(rng, -0.15, 0.15)] });
      height = Math.max(height, r.height);
    }
    return { height, radius: size / 2 };
  },
  cairn(m, rng, lod, size) {
    // a stack of flat stones, each a little smaller and a little off-centre — ONE geometry
    const n = byLod(lod, 6 + Math.floor(rng() * 4), 6 + Math.floor(rng() * 2), 4);
    let y = 0, widest = 0;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const w = size * 0.6 * lerp(1, 0.4, t) * rand(rng, 0.9, 1.1);
      const sy = rand(rng, 0.3, 0.45);
      const r = placeRock(m, rng, { detail: byLod(lod, 2, 1, 0), size: w, amp: 0.12, freq: 2.0, sx: 1.15, sy, sz: 0.95, cut: 0.22, sink: i === 0 ? 0.25 : 0.12, at: [(rng() - 0.5) * w * 0.15, y, (rng() - 0.5) * w * 0.15], rot: [rand(rng, -0.06, 0.06), rng() * Math.PI * 2, rand(rng, -0.06, 0.06)] });
      y += r.height * 0.92; // each stone settles a little into the one below
      widest = Math.max(widest, r.radius);
    }
    return { height: y, radius: widest };
  },
  crystal_cluster(m, rng, lod, size) {
    const base = placeRock(m, rng, { detail: byLod(lod, 3, 2, 0), size: size * 0.9, amp: 0.2, freq: 2, sx: 1.2, sy: 0.5, sz: 1.0, cut: 0.2, sink: 0.25, base: [0.85, 0.85, 0.9] });
    const n = byLod(lod, 7 + Math.floor(rng() * 5), 5, 3), sides = byLod(lod, 6, 6, 4);
    let top = base.height;
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2, d = rand(rng, 0.05, 0.45) * base.radius;
      const h = size * rand(rng, 0.35, 0.9) * (i === 0 ? 1.15 : 1), r = h * rand(rng, 0.12, 0.2);
      const tilt = d / base.radius * 0.9; // crystals lean outward, away from the middle
      const facet = rng();
      lathe(m, [[0, -h * 0.15], [r, 0], [r, h * 0.72], [r * 0.4, h * 0.9], [0, h]], sides,
        (j, k) => mul3(C.crystal, 0.8 + 0.35 * hash1(k * 3.1 + facet * 7) + (j >= 2 ? 0.15 : 0)),
        { at: [Math.cos(a) * d, base.height * 0.6, Math.sin(a) * d], rot: [Math.sin(a) * tilt, rng() * Math.PI, -Math.cos(a) * tilt] });
      top = Math.max(top, base.height * 0.6 + h);
    }
    return { height: top, radius: base.radius, emissive: true };
  },
};

/**
 * Build a rock. opts: { seed | rng, lod (0..2), size (metres; a random one from the kind's range
 * when omitted) }. Returns { geometry, height, radius, footprint }.
 */
export function buildRock(kind, opts = {}) {
  const builder = ROCK_BUILDERS[kind];
  if (!builder) throw new Error(`rocks.js: unknown rock kind "${kind}"`);
  const rng = opts.rng || makeRng(opts.seed ?? kind);
  const lod = clamp(opts.lod | 0, 0, 2);
  const size = opts.size ?? rand(rng, ROCK_SIZES[kind][0], ROCK_SIZES[kind][1]);
  const m = new MeshBuilder();
  const info = builder(m, rng, lod, size);
  const geometry = m.build();
  geometry.userData.colorMode = 'tint';
  geometry.userData.kind = kind;
  if (info.emissive) geometry.userData.emissiveMask = true;
  const { height, radius } = measure(geometry);
  return { geometry, height, radius, footprint: radius * 0.85 };
}

/** Height above ground and horizontal radius of a finished geometry. */
function measure(geometry) {
  geometry.computeBoundingBox();
  const bb = geometry.boundingBox;
  return { height: bb.max.y, radius: Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2, width: bb.max.x - bb.min.x, depth: bb.max.z - bb.min.z };
}

// ============================================================================================
// 7. CLIFFS
// ============================================================================================
// Triangle budgets (lod 0 / 1 / 2) for a 12 m wide, 10 m tall face:
//   cliff_face, overhang, cave_mouth ~1,600-2,300 / ~600 / ~70    outcrop ~1,300/750/100
//   arch ~560/220/90    spire 720/180/80    scree_slope ~2,400/1,100/150

/**
 * The cliff wall: a grid of columns (across x) and rows (up y). Rows are grouped into
 * horizontal BANDS, each set back a different amount — that stepping is the strata, and it is
 * what makes a cliff read as rock instead of a lumpy wall. Within a band, runs of columns are
 * set back by another random amount, which draws the vertical joint cracks. Noise goes on
 * top of both. Recessed bands are darkened; the last two rows fold back over the top into the
 * hillside; the two ends are closed with a skirt so a tiled section never shows a hole.
 * Built facing +Z, x centred, base at y = 0, occupying z from -depth up to about +0.2 depth.
 */
function cliffWall(m, rng, o) {
  const W = o.width, H = o.height, D = o.depth, lod = o.lod;
  const noise = makeNoise(rng);
  const cols = byLod(lod, clamp(Math.round(W / 0.45), 10, 40), clamp(Math.round(W / 0.9), 6, 20), 4);
  const bands = byLod(lod, clamp(Math.round(H / 1.4), 3, 12), clamp(Math.round(H / 2.2), 2, 6), 2);
  const rowsPer = byLod(lod, 2, 1, 1);
  const sink = o.sink ?? Math.min(0.8, H * 0.08);
  const overhang = o.overhang ?? 0;
  const noiseAmp = (o.noiseAmp ?? 0.18) * D;
  // band heights: random splits of H
  const parts = []; let sum = 0;
  for (let b = 0; b < bands; b++) { const v = rand(rng, 0.6, 1.4); parts.push(v); sum += v; }
  const bandH = parts.map((v) => H * v / sum);
  const recess = [], bandTint = [], joints = [];
  for (let b = 0; b < bands; b++) {
    recess.push(rng() < 0.25 ? rand(rng, 0.3, 0.55) * D : rand(rng, 0, 0.25) * D);
    const k = rand(rng, 0.9, 1.1), warm = rand(rng, -0.05, 0.05);
    bandTint.push([k * (1 + warm), k, k * (1 - warm)]);
    const arr = new Float32Array(cols + 1);
    let i = 0;
    while (i <= cols) { // runs of columns with one setback each = vertical jointing
      const len = 1 + Math.floor(rng() * byLod(lod, 5, 3, 2));
      const val = rng() < 0.45 ? 0 : rand(rng, 0.05, 0.22) * D;
      for (let e = 0; e < len && i <= cols; e++) arr[i++] = val;
    }
    joints.push(arr);
  }
  // the profile: a list of rows going up
  const rows = [];
  let y = -sink;
  rows.push({ y, band: 0 });
  for (let b = 0; b < bands; b++) {
    if (b > 0) rows.push({ y: y + 0.03, band: b }); // the ledge between two bands
    for (let k = 1; k <= rowsPer; k++) rows.push({ y: y + bandH[b] * k / rowsPer, band: b });
    y += bandH[b];
  }
  rows.push({ y: y + 0.35, band: bands - 1, cap: 0.45 });
  rows.push({ y: y + 0.7, band: bands - 1, cap: 1 });
  // column x positions (ends exact so sections can tile)
  const xs = [];
  for (let i = 0; i <= cols; i++) xs.push(-W / 2 + W * i / cols + (i > 0 && i < cols ? (rng() - 0.5) * (W / cols) * 0.5 : 0));
  // evaluate every grid vertex once
  const verts = rows.map((row) => xs.map((x, i) => {
    let z, shade;
    if (row.cap) {
      z = -D * row.cap + noiseAmp * 0.5 * noise.fbm(x * 0.5, row.y * 0.5, 9, 2);
      shade = 1 - 0.15 * row.cap;
    } else {
      const rec = recess[row.band] + joints[row.band][i];
      z = -rec + noiseAmp * noise.fbm(x * 0.7, row.y * 0.7, row.band * 3.1, 3)
        + overhang * D * 0.5 * (smooth(0.25 * H, 0.85 * H, row.y) - 0.5);
      shade = (1 - 0.5 * clamp(rec / (0.55 * D), 0, 1)) * (0.65 + 0.35 * smooth(-sink, 1.5, row.y));
    }
    if (o.hole) {
      const t = o.hole(x, row.y);
      if (t > 0) { z -= t * D * 0.85; shade *= 1 - 0.9 * t; }
    }
    return { p: [x, row.y, z], c: mul3(bandTint[row.band], shade) };
  }));
  for (let r = 0; r < rows.length - 1; r++) for (let i = 0; i < cols; i++) {
    const A = verts[r][i], B = verts[r][i + 1], Cc = verts[r + 1][i + 1], Dd = verts[r + 1][i];
    m.tri(A.p, B.p, Cc.p, [A.c, B.c, Cc.c]);
    m.tri(A.p, Cc.p, Dd.p, [A.c, Cc.c, Dd.c]);
  }
  if (o.closeEnds !== false) { // end skirts back to z = -depth
    for (const i of [0, cols]) for (let r = 0; r < rows.length - 1; r++) {
      const F0 = verts[r][i], F1 = verts[r + 1][i];
      const B0 = [xs[i], F0.p[1], -D], B1 = [xs[i], F1.p[1], -D];
      const centre = [0, (F0.p[1] + F1.p[1]) / 2, -D / 2];
      const dark = [mul3(F0.c, 0.75), mul3(F1.c, 0.75)];
      m.triOut(F0.p, F1.p, B1, centre, [dark[0], dark[1], dark[1]]);
      m.triOut(F0.p, B1, B0, centre, [dark[0], dark[1], dark[0]]);
    }
  }
}

const CLIFF_BUILDERS = {
  cliff_face(m, rng, o) { cliffWall(m, rng, o); },
  overhang(m, rng, o) { cliffWall(m, rng, { ...o, overhang: 1, noiseAmp: 0.14 }); },
  cave_mouth(m, rng, o) {
    const rx = Math.max(1.5, o.width * 0.22), ry = Math.max(1.8, o.height * 0.42);
    cliffWall(m, rng, { ...o, hole: (x, y) => { const d = Math.hypot(x / rx, Math.max(0, y) / ry); return d < 1 ? smooth(1, 0.7, d) : 0; } });
    // a tumble of stones either side of the opening
    for (const s of [-1, 1]) for (let i = 0; i < byLod(o.lod, 3, 2, 0); i++) {
      placeRock(m, rng, { detail: byLod(o.lod, 2, 1, 0), size: rand(rng, 0.5, 1.1), amp: 0.18, freq: 1.8, sx: 1.2, sy: 0.7, sz: 1, cut: 0.18, sink: 0.25, at: [s * (rx + rand(rng, 0.2, 1.2)), 0, rand(rng, 0.2, 1.0)] });
    }
  },
  outcrop(m, rng, o) {
    // tilted slabs breaking out of the hillside, all dipping the same way — the same dip is
    // what makes them read as one bed of rock instead of a pile
    const n = byLod(o.lod, 5, 4, 3), dip = rand(rng, 0.25, 0.55);
    for (let i = 0; i < n; i++) {
      const t = i / Math.max(1, n - 1);
      const w = o.width * rand(rng, 0.55, 0.9);
      placeRock(m, rng, { detail: byLod(o.lod, 3, 2, 0), size: w, amp: 0.14, freq: 1.7, sx: 1.5, sy: rand(rng, 0.25, 0.4), sz: 0.9, cut: 0.2, strata: 3, strataAmp: 0.07, sink: 0.35,
        at: [(rng() - 0.5) * o.width * 0.25, t * o.height * 0.75, -t * o.depth * 0.8 + o.depth * 0.3], rot: [-dip + rand(rng, -0.06, 0.06), rand(rng, -0.15, 0.15), rand(rng, -0.08, 0.08)] });
    }
    for (let i = 0; i < byLod(o.lod, 4, 2, 0); i++) {
      placeRock(m, rng, { detail: 1, size: rand(rng, 0.3, 0.7), amp: 0.18, freq: 2, sy: 0.7, cut: 0.18, sink: 0.25, at: [(rng() - 0.5) * o.width, 0, rand(rng, 0.1, 0.6) * o.depth] });
    }
  },
  arch(m, rng, o) {
    // a stone tube bent over a half-ellipse; the legs are thicker than the span
    // width/height are the OUTER size, so the path runs inside them by the stone's thickness
    const n = byLod(o.lod, 26, 14, 8), sides = byLod(o.lod, 10, 7, 5), sink = 0.5;
    const noise = makeNoise(rng);
    const thick = o.depth / 2, legR = thick * 1.7;
    const halfW = Math.max(thick, o.width / 2 - legR), top = Math.max(thick * 2, o.height - thick);
    const pts = [];
    for (let i = 0; i < n; i++) {
      const th = Math.PI * (1 - i / (n - 1));
      pts.push([halfW * Math.cos(th) * (1 + 0.06 * Math.sin(th * 3)), -sink + (top + sink) * Math.pow(Math.sin(th), 0.75), 0]);
    }
    tube(m, pts, (t) => thick * (1 + 0.7 * Math.pow(Math.abs(2 * t - 1), 2)), sides,
      (i, k) => mul3(WHITE, 0.85 + 0.15 * (i / n) * (0.7 + 0.3 * hash1(k))),
      { noiseFn: (x, y, z) => 0.14 * noise.fbm(x * 1.2, y * 1.2, z * 1.2, 3) });
  },
  spire(m, rng, o) {
    placeRock(m, rng, { detail: byLod(o.lod, 5, 2, 1), size: o.height, tall: true, amp: 0.26, freq: 2.0, sx: 0.55, sy: 3.0, sz: 0.55, taper: rand(rng, 0.65, 0.8), skew: rand(rng, -0.1, 0.1), strata: 6, strataAmp: 0.05, cut: 0.08, sink: 0.08 });
  },
  scree_slope(m, rng, o) {
    // a bed of gravel rising toward -z (the hillside behind it) with loose stones on it
    const W = o.width, Dp = o.depth, H = o.height;
    const noise = makeNoise(rng);
    const g = byLod(o.lod, 8, 5, 3);
    const bedY = (x, z) => H * (0.5 - z / Dp) + 0.12 * noise.fbm(x, z, 3, 2);
    const grid = [];
    for (let i = 0; i <= g; i++) { const row = []; for (let j = 0; j <= g; j++) { const x = -W / 2 + W * i / g, z = -Dp / 2 + Dp * j / g; row.push([x, bedY(x, z), z]); } grid.push(row); }
    for (let i = 0; i < g; i++) for (let j = 0; j < g; j++) {
      m.quadOut(grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1], [0, -1000, 0], [0.62, 0.62, 0.6]);
    }
    const n = byLod(o.lod, 28, 12, 6), tilt = -Math.atan2(H, Dp);
    for (let i = 0; i < n; i++) {
      const x = (rng() - 0.5) * W * 0.95, z = (rng() - 0.5) * Dp * 0.95;
      placeRock(m, rng, { detail: byLod(o.lod, 1, 0, 0), size: rand(rng, 0.12, 0.45) * (1 + 0.6 * (z / Dp + 0.5)), amp: 0.16, freq: 2, sy: 0.7, cut: 0.15, sink: 0.3, at: [x, bedY(x, z), z], rot: [tilt, rng() * Math.PI * 2, 0] });
    }
  },
};

const CLIFF_SIZES = {
  cliff_face: { width: [8, 16], height: [6, 18], depth: [3, 6] }, outcrop: { width: [4, 9], height: [1.5, 4], depth: [3, 6] },
  overhang: { width: [8, 14], height: [6, 12], depth: [4, 7] }, arch: { width: [6, 12], height: [5, 9], depth: [1.6, 2.6] },
  spire: { width: [3, 6], height: [8, 20], depth: [3, 6] }, scree_slope: { width: [6, 12], height: [1.5, 4], depth: [5, 9] },
  cave_mouth: { width: [10, 16], height: [7, 12], depth: [5, 8] },
};

/**
 * Build a cliff piece facing +Z. opts: { width, height, depth, seed | rng, lod }.
 * Returns { geometry, height, width, depth }.
 * Tiling note: two sections built from different seeds do not share the same strata profile
 * at their ends. Overlap neighbours by ~5% of their width and turn each a few degrees along the
 * contour; the closed end skirts mean the join shows rock, never a hole.
 */
export function buildCliff(kind, opts = {}) {
  const builder = CLIFF_BUILDERS[kind];
  if (!builder) throw new Error(`rocks.js: unknown cliff kind "${kind}"`);
  const rng = opts.rng || makeRng(opts.seed ?? kind);
  const lod = clamp(opts.lod | 0, 0, 2);
  const S = CLIFF_SIZES[kind];
  const o = { lod, width: opts.width ?? rand(rng, S.width[0], S.width[1]), height: opts.height ?? rand(rng, S.height[0], S.height[1]), depth: opts.depth ?? rand(rng, S.depth[0], S.depth[1]) };
  const m = new MeshBuilder();
  builder(m, rng, o);
  const geometry = m.build();
  geometry.userData.colorMode = 'tint';
  geometry.userData.kind = kind;
  const mm = measure(geometry);
  return { geometry, height: mm.height, width: mm.width, depth: mm.depth };
}

// ============================================================================================
// 8. PROPS — every one an original design. Colour mode 'albedo'.
// ============================================================================================
// Triangle budgets (lod 0 / 1 / 2), rough:
//   campfire ~1,100/300/120   fire_ring ~800/200/100   wood_pile ~700/400/220   sawhorse ~440/120/60
//   fence_post 48/16/16   fence_rail 88/24/24   palisade_stake ~70/50/30   crate ~1,300/360/12
//   barrel ~430/280/140   cart_wheel ~330/230/120   signpost ~200/100/60   torch_post ~230/120/60
//   stone_marker ~330/190/90   rune_stone ~740/200/90   ruined_pillar ~350/200/100
//   ruined_arch ~1,000/450/200   ruined_wall ~1,800/500/150   stone_step ~130/40/36   well ~900/450/200
//   hay_bale ~330/170/80   drying_rack ~600/300/100   banner_pole ~560/300/90   skull_totem ~560/200/80
//   dolmen ~1,300/720/80

/** A ring of stones around a bed of ash (shared by the campfire and the empty fire ring). */
function firePit(m, rng, lod, radius) {
  const n = byLod(lod, 9, 7, 6);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng() * 0.3, d = radius * rand(rng, 0.92, 1.05);
    placeRock(m, rng, { detail: byLod(lod, 1, 0, 0), size: rand(rng, 0.2, 0.3), amp: 0.16, freq: 2, sy: 0.75, cut: 0.15, sink: 0.25, at: [Math.cos(a) * d, 0, Math.sin(a) * d], base: C.stone });
  }
  disc(m, rng, radius * 0.8, byLod(lod, 3, 2, 1), byLod(lod, 12, 8, 6), (x, z, t) => ({ y: 0.02 + 0.03 * (1 - t) * hash1(x * 3 + z * 5), color: mul3(C.ash, 0.7 + 0.5 * t) }), { rimNoise: 0.1 });
}

const PROP_BUILDERS = {
  campfire(m, rng, lod) {
    firePit(m, rng, lod, 0.55);
    const rad = byLod(lod, 7, 5, 4);
    for (let i = 0; i < 4; i++) { // logs leaning together, charred at the inner end
      const a = (i / 4) * Math.PI * 2 + rng() * 0.5;
      cylinder(m, 0.06, 0.05, 0.65, rad, (j, k) => (j <= 1 ? C.charcoal : jitterColor(rng, C.bark, 0.08)),
        { at: [Math.cos(a) * 0.3, 0.06, Math.sin(a) * 0.3], rot: [-Math.sin(a) * 0.95, 0, Math.cos(a) * 0.95] }); // tops lean in to the middle
    }
    for (let i = 0; i < byLod(lod, 5, 3, 2); i++) { // embers: tagged emissive
      const a = rng() * Math.PI * 2, d = rng() * 0.2;
      placeRock(m, rng, { detail: 0, size: rand(rng, 0.06, 0.1), amp: 0.1, sy: 0.6, cut: 0.1, sink: 0.3, at: [Math.cos(a) * d, 0.03, Math.sin(a) * d], base: C.ember, tintVar: 0.05 });
    }
    return { footprint: 0.7, emissive: true };
  },
  fire_ring(m, rng, lod) { firePit(m, rng, lod, 0.55); return { footprint: 0.7 }; },
  wood_pile(m, rng, lod) {
    const rad = byLod(lod, 8, 6, 5), r = 0.11;
    const rowsN = byLod(lod, [5, 4, 3, 2], [5, 4, 3, 2], [5, 4, 3]);
    let y = r;
    rowsN.forEach((count, row) => {
      for (let i = 0; i < count; i++) {
        const z = (i - (count - 1) / 2) * r * 2.05 + (rng() - 0.5) * 0.02, len = rand(rng, 0.85, 1.05);
        const bark = jitterColor(rng, C.bark, 0.12), cut = jitterColor(rng, C.woodCut, 0.1);
        cylinder(m, r * rand(rng, 0.9, 1.1), r * rand(rng, 0.9, 1.1), len, rad, bark, { capColor: cut, at: [-len / 2 + (rng() - 0.5) * 0.1, y, z], rot: [0, 0, -Math.PI / 2] });
      }
      y += r * 1.75;
    });
    return { footprint: 0.65 };
  },
  sawhorse(m, rng, lod) {
    const ch = byLod(lod, 0.012, 0, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { // four legs splayed outward
      box(m, [0.06, 0.85, 0.06], jitterColor(rng, C.wood, 0.08), { at: [sx * 0.5, 0.41, sz * 0.2], rot: [-sz * 0.35, 0, 0], chamfer: ch });
    }
    box(m, [1.2, 0.1, 0.1], jitterColor(rng, C.wood, 0.08), { at: [0, 0.83, 0], chamfer: ch, colorOf: (axis) => (axis === 0 ? C.woodCut : C.wood) });
    if (lod < 2) for (const sx of [-1, 1]) box(m, [0.04, 0.03, 0.55], C.woodDark, { at: [sx * 0.5, 0.35, 0], chamfer: 0 });
    return { footprint: 0.65 };
  },
  fence_post(m, rng, lod) {
    const col = jitterColor(rng, C.wood, 0.1);
    box(m, [0.14, 1.15, 0.14], col, { at: [0, 0.5, 0], chamfer: byLod(lod, 0.015, 0, 0), colorOf: (axis) => (axis === 1 ? C.woodCut : col) });
    // a four-sided weathered point on top
    const t = [0.02, 1.32, -0.01], b = 1.07, s = 0.07;
    const k = [[-s, b, -s], [s, b, -s], [s, b, s], [-s, b, s]];
    for (let i = 0; i < 4; i++) m.triOut(k[i], k[(i + 1) % 4], t, [0, 0.9, 0], mul3(col, 1.05));
    return { footprint: 0.12 };
  },
  fence_rail(m, rng, lod) {
    // two rails of a 2.4 m fence section; put a fence_post at each end (x = ±1.2)
    for (const y of [0.45, 0.95]) {
      const col = jitterColor(rng, C.wood, 0.1);
      box(m, [2.4, 0.09, 0.05], col, { at: [0, y, 0], rot: [0, 0, (rng() - 0.5) * 0.03], chamfer: byLod(lod, 0.012, 0, 0), colorOf: (axis) => (axis === 0 ? C.woodCut : col) });
    }
    return { footprint: 1.2 };
  },
  palisade_stake(m, rng, lod) {
    const noise = makeNoise(rng), rad = byLod(lod, 9, 7, 5);
    lathe(m, [[0, -0.3], [0.13, -0.3], [0.125, 0.9], [0.115, 1.85], [0.06, 2.22], [0, 2.4]], rad,
      (j, k) => (j >= 3 ? mul3(C.woodCut, 0.8 + 0.2 * hash1(k)) : mul3(C.bark, 0.85 + 0.3 * hash1(k * 1.7 + j))),
      { jitter: (j, k, a) => [0.012 * noise.noise(Math.cos(a) * 3, j * 1.7, Math.sin(a) * 3), 0] });
    return { footprint: 0.15 };
  },
  crate(m, rng, lod) {
    const s = 0.8, h = s / 2;
    if (lod >= 2) { box(m, [s, s, s], C.wood, { at: [0, h, 0], chamfer: 0 }); return { footprint: 0.5 }; }
    const ch = lod === 0 ? 0.012 : 0, pw = s / 3;
    // six faces, each three planks with their own tint, then corner battens over the joints
    for (let axis = 0; axis < 3; axis++) for (const sg of [-1, 1]) for (let i = 0; i < 3; i++) {
      const size = [s - 0.04, s - 0.04, s - 0.04], at = [0, h, 0];
      size[axis] = 0.04; at[axis] += sg * (h - 0.02);
      const along = (axis + 1) % 3; size[along] = pw - 0.01; at[along] += (i - 1) * pw;
      box(m, size, jitterColor(rng, C.wood, 0.12), { at, chamfer: ch });
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(m, [0.06, s, 0.06], jitterColor(rng, C.woodDark, 0.1), { at: [sx * (h - 0.03), h, sz * (h - 0.03)], chamfer: ch });
    for (const sy of [0.03, s - 0.03]) for (const sz of [-1, 1]) box(m, [s, 0.06, 0.06], jitterColor(rng, C.woodDark, 0.1), { at: [0, sy, sz * (h - 0.03)], chamfer: ch });
    return { footprint: 0.5 };
  },
  barrel(m, rng, lod) {
    const rad = byLod(lod, 14, 10, 7);
    const prof = [[0, 0], [0.26, 0], [0.295, 0.2], [0.31, 0.45], [0.295, 0.7], [0.26, 0.9], [0, 0.9]];
    const stave = []; for (let k = 0; k < rad; k++) stave.push(jitterColor(rng, C.wood, 0.12));
    lathe(m, prof, rad, (j, k) => (j === 0 || j === 5 ? C.woodCut : stave[k]));
    for (const y of [0.16, 0.68]) { // iron hoops follow the belly
      const r = profileRadiusAt(prof, y + 0.03);
      lathe(m, [[r - 0.004, y], [r + 0.018, y], [r + 0.018, y + 0.06], [r - 0.004, y + 0.06], [r - 0.004, y]], rad, C.iron);
    }
    return { footprint: 0.33 };
  },
  cart_wheel(m, rng, lod) {
    // built lying flat around y, then stood up on its rim; 1.2 m across
    const R = 0.6, rad = byLod(lod, 16, 12, 8);
    const M = mat({ at: [0, R, 0], rot: [Math.PI / 2, 0, 0] });
    const stand = (o) => ({ ...o, matrix: new THREE.Matrix4().multiplyMatrices(M, mat(o)) });
    lathe(m, [[R - 0.08, -0.04], [R, -0.04], [R, 0.04], [R - 0.08, 0.04], [R - 0.08, -0.04]], rad,
      (j, k) => (j === 1 ? C.iron : jitterColor(rng, C.wood, 0.1)), stand({}));
    lathe(m, [[0, -0.07], [0.1, -0.07], [0.1, 0.07], [0, 0.07]], byLod(lod, 10, 8, 6), C.woodDark, stand({}));
    const spokes = byLod(lod, 8, 8, 6);
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * Math.PI * 2;
      box(m, [0.045, R - 0.1, 0.035], jitterColor(rng, C.wood, 0.1), stand({ at: [Math.cos(a) * (R / 2 - 0.02), 0, Math.sin(a) * (R / 2 - 0.02)], rot: [0, -a, Math.PI / 2], chamfer: 0 }));
    }
    return { footprint: 0.6 };
  },
  signpost(m, rng, lod) {
    const rad = byLod(lod, 8, 6, 5);
    cylinder(m, 0.07, 0.06, 2.0, rad, jitterColor(rng, C.wood, 0.08), { capColor: C.woodCut });
    const boards = byLod(lod, 2, 2, 1);
    for (let i = 0; i < boards; i++) {
      const a = rng() * Math.PI * 2, y = 1.75 - i * 0.28, col = jitterColor(rng, C.woodCut, 0.1);
      const M = mat({ at: [0, y, 0], rot: [0, a, 0] });
      box(m, [0.62, 0.16, 0.03], col, { matrix: new THREE.Matrix4().multiplyMatrices(M, mat({ at: [0.25, 0, 0] })), chamfer: byLod(lod, 0.008, 0, 0) });
      // pointed tip: a small prism on the far end
      const P = (p) => xf(M, p), tip = P([0.72, 0, 0]);
      const q = [P([0.56, -0.08, -0.015]), P([0.56, 0.08, -0.015]), P([0.56, 0.08, 0.015]), P([0.56, -0.08, 0.015])];
      const cen = P([0.58, 0, 0]);
      for (let e = 0; e < 4; e++) m.triOut(q[e], q[(e + 1) % 4], tip, cen, col);
    }
    return { footprint: 0.4 };
  },
  torch_post(m, rng, lod) {
    const rad = byLod(lod, 7, 6, 5);
    cylinder(m, 0.06, 0.05, 1.8, rad, jitterColor(rng, C.wood, 0.08), { capColor: C.woodCut });
    lathe(m, [[0.05, 1.55], [0.08, 1.55], [0.08, 1.62], [0.05, 1.62], [0.05, 1.55]], rad, C.iron); // bracket
    cylinder(m, 0.09, 0.075, 0.28, rad, C.charcoal, { at: [0, 1.62, 0] });                        // wrapped head
    placeRock(m, rng, { detail: byLod(lod, 1, 0, 0), size: 0.2, amp: 0.15, sy: 0.7, cut: 0.15, sink: 0.2, at: [0, 1.88, 0], base: C.ember, tintVar: 0.05 });
    return { footprint: 0.15, emissive: true };
  },
  stone_marker(m, rng, lod) {
    // a squat waymark with a chiselled band around it
    const r = placeRock(m, rng, { detail: byLod(lod, 3, 2, 1), size: 0.9, tall: true, amp: 0.1, freq: 2, sx: 0.7, sy: 1.6, sz: 0.5, taper: 0.2, cut: 0.1, sink: 0.12, base: C.stone });
    m.paint(r.from, (x, y, z, c) => (Math.abs(y - r.height * 0.7) < 0.035 ? mul3(c, 0.55) : null));
    return { footprint: 0.35 };
  },
  rune_stone(m, rng, lod) {
    // a tall slab with a glowing carved pattern on its front (+z) face; emissive tagged
    const H = rand(rng, 1.6, 2.2);
    placeRock(m, rng, { detail: byLod(lod, 5, 2, 1), size: H, tall: true, amp: 0.1, freq: 2, sx: 1.0, sy: 1.8, sz: 0.42, taper: 0.15, cut: 0.1, sink: 0.12, base: [0.42, 0.42, 0.44], rot: [0, 0, 0],
      paint: (x, y, z, nx, ny, nz, c) => {
        if (nz < 0.55 || y < 0.15 || y > 0.9) return null;
        const line = Math.abs(Math.sin(y * 11 + Math.sin(x * 7) * 1.6)) < 0.18 && Math.abs(x) < 0.55;
        return line ? C.rune : null;
      } });
    return { footprint: 0.45, emissive: true };
  },
  ruined_pillar(m, rng, lod) {
    const H = rand(rng, 2, 5), rad = byLod(lod, 12, 8, 6), noise = makeNoise(rng);
    box(m, [0.9, 0.22, 0.9], jitterColor(rng, C.stone, 0.06), { at: [0, 0.11, 0], chamfer: byLod(lod, 0.03, 0, 0) });
    const drums = byLod(lod, Math.max(2, Math.round(H / 0.8)), 2, 1);
    let y = 0.22;
    for (let d = 0; d < drums; d++) {
      const h = (H - 0.22) / drums, last = d === drums - 1, r = 0.3 * rand(rng, 0.95, 1.05);
      lathe(m, [[0, 0], [r, 0], [r, h], [0, h]], rad, jitterColor(rng, C.stone, 0.08),
        { at: [(rng() - 0.5) * 0.04, y, (rng() - 0.5) * 0.04], rot: [0, rng(), 0], jitter: (j, k, a) => (last && j >= 2 ? [0.05 * noise.noise(Math.cos(a) * 2, 5, Math.sin(a) * 2), -0.35 * h * Math.max(0, noise.noise(Math.cos(a) * 1.5, 9, Math.sin(a) * 1.5) + 0.3)] : [0, 0]) });
      y += h;
    }
    return { footprint: 0.5 };
  },
  ruined_arch(m, rng, lod) {
    // two broken pillars and the surviving stones of the span, with the missing ones on the ground
    const W = 2.6, H = 3.2, ch = byLod(lod, 0.02, 0, 0);
    for (const s of [-1, 1]) {
      const h = H * 0.62 * rand(rng, 0.85, 1.05);
      for (let i = 0; i < byLod(lod, 5, 3, 1); i++) {
        const bh = h / byLod(lod, 5, 3, 1);
        box(m, [0.5, bh - 0.01, 0.5], jitterColor(rng, C.stone, 0.08), { at: [s * W / 2 + (rng() - 0.5) * 0.03, bh / 2 + i * bh, (rng() - 0.5) * 0.03], rot: [0, (rng() - 0.5) * 0.05, 0], chamfer: ch });
      }
    }
    const n = byLod(lod, 9, 7, 5), gapStart = Math.floor(n / 2) - 1;
    for (let i = 0; i < n; i++) {
      const th = Math.PI * (1 - i / (n - 1));
      if (i >= gapStart && i <= gapStart + 1) continue; // the fallen keystones
      box(m, [0.36, 0.34, 0.5], jitterColor(rng, C.stone, 0.08), { at: [(W / 2) * Math.cos(th), H * 0.62 + (H * 0.38) * Math.sin(th), 0], rot: [0, 0, th - Math.PI / 2], chamfer: ch });
    }
    for (let i = 0; i < 2; i++) box(m, [0.36, 0.34, 0.5], jitterColor(rng, C.stoneDark, 0.08), { at: [(rng() - 0.5) * 1.2, 0.15, rand(rng, 0.4, 1.0)], rot: [rng() * 0.3, rng() * 3, rng() * 0.6], chamfer: ch });
    return { footprint: 1.6 };
  },
  ruined_wall(m, rng, lod) {
    // courses of blocks under a crumbling top line; blocks that would poke above it are gone
    const L = 3.0, Hm = 1.5, course = 0.3, noise = makeNoise(rng), ch = byLod(lod, 0.02, 0, 0);
    if (lod >= 2) {
      for (let i = 0; i < 3; i++) box(m, [L / 3, Hm * rand(rng, 0.5, 1), 0.5], C.stone, { at: [-L / 3 + i * L / 3, Hm * 0.35, 0], chamfer: 0 });
      return { footprint: 1.5 };
    }
    const topAt = (x) => Hm * (0.55 + 0.45 * noise.noise(x * 1.3, 2, 0)) * (1 - 0.5 * Math.pow(Math.abs(x) / (L / 2), 4));
    let rowIndex = 0;
    for (let y = course / 2; y < Hm; y += course, rowIndex++) {
      let x = -L / 2 + (rowIndex % 2 ? 0.25 : 0) * rng();
      while (x < L / 2 - 0.1) {
        const w = rand(rng, 0.45, 0.8);
        const cx = Math.min(x + w / 2, L / 2 - w / 2);
        if (y < topAt(cx)) box(m, [w - 0.02, course - 0.02, 0.5], jitterColor(rng, C.stone, 0.1), { at: [cx, y, (rng() - 0.5) * 0.03], chamfer: ch });
        x += w;
      }
    }
    for (let i = 0; i < byLod(lod, 4, 2, 0); i++) box(m, [0.5, 0.28, 0.4], jitterColor(rng, C.stoneDark, 0.1), { at: [(rng() - 0.5) * L, 0.12, rand(rng, 0.35, 0.9) * (rng() < 0.5 ? -1 : 1)], rot: [rng() * 0.4, rng() * 3, rng() * 0.5], chamfer: ch });
    return { footprint: 1.5 };
  },
  stone_step(m, rng, lod, opts) {
    // a short flight (opts.steps, default 3) rising toward -z
    const steps = opts.steps ?? 3, ch = byLod(lod, 0.03, 0, 0);
    for (let i = 0; i < steps; i++) {
      box(m, [1.4 * rand(rng, 0.97, 1.03), 0.18, 0.4], jitterColor(rng, C.stone, 0.08), { at: [(rng() - 0.5) * 0.02, 0.09 + i * 0.17, -i * 0.38], rot: [(rng() - 0.5) * 0.02, 0, (rng() - 0.5) * 0.02], chamfer: ch });
    }
    return { footprint: 0.8 };
  },
  well(m, rng, lod, opts) {
    const rad = byLod(lod, 14, 10, 8), ch = byLod(lod, 0.015, 0, 0);
    // the ring wall as stone blocks: alternate tint per segment and per course
    const courses = byLod(lod, 4, 2, 1);
    for (let cI = 0; cI < courses; cI++) {
      const y0 = cI / courses, y1 = (cI + 1) / courses - 0.01;
      lathe(m, [[0.9, y0], [1.1, y0], [1.1, y1], [0.9, y1], [0.9, y0]], rad, (j, k) => mul3(C.stone, 0.85 + 0.3 * hash1(k * 2.3 + cI * 5.1)), { rot: [0, cI * 0.2, 0] });
    }
    disc(m, rng, 0.9, 1, rad, () => ({ y: 0.25, color: C.water }));
    for (const s of [-1, 1]) box(m, [0.12, 2.1, 0.12], jitterColor(rng, C.wood, 0.08), { at: [s * 1.0, 1.05 + 0.9, 0], chamfer: ch });
    cylinder(m, 0.05, 0.05, 2.2, byLod(lod, 8, 6, 5), C.woodDark, { at: [-1.1, 2.55, 0], rot: [0, 0, -Math.PI / 2] });
    for (const s of [-1, 1]) box(m, [2.5, 0.04, 0.8], jitterColor(rng, C.wood, 0.1), { at: [0, 2.95 - 0.22, s * 0.32], rot: [-s * 0.6, 0, 0], chamfer: ch });
    if (lod < 2) {
      cylinder(m, 0.012, 0.012, 0.75, 4, C.rope, { at: [0, 1.8, 0] });
      lathe(m, [[0, 1.55], [0.14, 1.55], [0.17, 1.82], [0.15, 1.82], [0.13, 1.58], [0, 1.58]], byLod(lod, 10, 8, 6), (j) => (j >= 3 ? C.woodDark : C.wood));
    }
    return { footprint: 1.2 };
  },
  hay_bale(m, rng, lod) {
    const rad = byLod(lod, 12, 8, 6), noise = makeNoise(rng), R = 0.4, L = 1.2;
    const prof = [[0, 0], [R * 0.9, 0], [R, L * 0.2], [R, L * 0.5], [R, L * 0.8], [R * 0.9, L], [0, L]];
    lathe(m, prof, rad, (j, k) => mul3(C.straw, 0.8 + 0.35 * hash1(k * 1.9 + j * 3.7)),
      { at: [-L / 2, R, 0], rot: [0, 0, -Math.PI / 2], jitter: (j, k, a) => [0.06 * noise.noise(Math.cos(a) * 2, j, Math.sin(a) * 2), 0] });
    if (lod < 2) for (const y of [L * 0.3, L * 0.7]) lathe(m, [[R + 0.02, y], [R + 0.04, y], [R + 0.04, y + 0.04], [R + 0.02, y + 0.04], [R + 0.02, y]], rad, C.rope, { at: [-L / 2, R, 0], rot: [0, 0, -Math.PI / 2] });
    return { footprint: 0.6 };
  },
  drying_rack(m, rng, lod) {
    const ch = byLod(lod, 0.012, 0, 0), rad = byLod(lod, 7, 6, 5);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(m, [0.06, 1.75, 0.06], jitterColor(rng, C.wood, 0.08), { at: [sx * 1.0, 0.85, sz * 0.3], rot: [-sz * 0.33, 0, 0], chamfer: ch });
    cylinder(m, 0.04, 0.04, 2.3, rad, C.woodDark, { at: [-1.15, 1.7, 0], rot: [0, 0, -Math.PI / 2] });
    const hides = byLod(lod, 3, 3, 2);
    for (let i = 0; i < hides; i++) {
      const base = jitterColor(rng, C.hide, 0.15);
      cloth(m, rand(rng, 0.45, 0.6), rand(rng, 0.7, 0.95), byLod(lod, 4, 3, 2), byLod(lod, 5, 3, 2),
        (u, v) => mul3(base, 0.85 + 0.2 * hash1(u * 5 + v * 9) + 0.1 * v), { at: [-0.7 + i * 0.7, 1.68, 0], sag: 0.06, windMax: 0.5, phase: i * 0.3 });
    }
    return { footprint: 1.1 };
  },
  banner_pole(m, rng, lod) {
    const rad = byLod(lod, 8, 6, 5);
    lathe(m, [[0, 0], [0.05, 0], [0.04, 3.9], [0.07, 3.95], [0.07, 4.0], [0, 4.25]], rad, (j) => (j >= 3 ? C.iron : C.woodDark)); // pole and a spear finial
    cylinder(m, 0.025, 0.025, 0.9, rad, C.woodDark, { at: [-0.45, 3.6, 0], rot: [0, 0, -Math.PI / 2] });
    const field = jitterColor(rng, C.clothRed, 0.1), band = C.clothPale;
    cloth(m, 0.8, 2.0, byLod(lod, 6, 4, 2), byLod(lod, 10, 6, 3),
      (u, v) => (v > 0.42 && v < 0.56 ? band : mul3(field, 0.9 + 0.15 * v)), { at: [0, 3.58, 0.03], sag: 0.12, windMax: 1 });
    return { footprint: 0.5 };
  },
  skull_totem(m, rng, lod) {
    const rad = byLod(lod, 8, 6, 5);
    cylinder(m, 0.08, 0.06, 2.2, rad, jitterColor(rng, C.bark, 0.1), { capColor: C.woodCut });
    const skulls = byLod(lod, 3, 3, 2);
    for (let i = 0; i < skulls; i++) {
      const y = 0.9 + i * 0.5, a = rng() * Math.PI * 2;
      // a skull: a bone-coloured lump with two dark pits toward its front
      placeRock(m, rng, { detail: byLod(lod, 1, 1, 0), size: 0.2, amp: 0.08, freq: 2, sx: 1, sy: 0.85, sz: 1.1, cut: 0.1, sink: 0.05, base: C.bone, tintVar: 0.06, at: [Math.cos(a) * 0.15, y, Math.sin(a) * 0.15], rot: [0, -a + Math.PI / 2, 0],
        paint: (x, y2, z, nx, ny, nz, c) => (z > 0.5 && y2 > 0.3 && y2 < 0.7 && Math.abs(Math.abs(x) - 0.35) < 0.18 ? mul3(c, 0.2) : null) });
      lathe(m, [[0.07, y - 0.02], [0.095, y - 0.02], [0.095, y + 0.03], [0.07, y + 0.03], [0.07, y - 0.02]], rad, C.rope); // the binding
    }
    for (let i = 0; i < byLod(lod, 3, 2, 0); i++) { // hanging bones on cords
      const a = rng() * Math.PI * 2, x = Math.cos(a) * 0.12, z = Math.sin(a) * 0.12;
      cylinder(m, 0.006, 0.006, 0.25, 3, C.rope, { at: [x, 1.9, z] });
      lathe(m, [[0, 0], [0.03, 0], [0.018, 0.04], [0.018, 0.2], [0.03, 0.24], [0, 0.24]], byLod(lod, 6, 5, 4), C.bone, { at: [x, 1.66, z], rot: [rng() * 0.3, 0, rng() * 0.3] });
    }
    return { footprint: 0.3 };
  },
  dolmen(m, rng, lod) {
    // three uprights carrying one great capstone, 3 m across
    const legs = 3, R = 0.9, legH = 1.8;
    for (let i = 0; i < legs; i++) {
      const a = (i / legs) * Math.PI * 2 + 0.4;
      placeRock(m, rng, { detail: byLod(lod, 3, 2, 0), size: legH, tall: true, amp: 0.12, freq: 1.8, sx: 0.8, sy: 2.0, sz: 0.45, taper: 0.1, cut: 0.1, sink: 0.1, at: [Math.cos(a) * R, 0, Math.sin(a) * R], rot: [0, -a, 0] });
    }
    placeRock(m, rng, { detail: byLod(lod, 3, 2, 0), size: 3.0, amp: 0.12, freq: 1.5, sx: 1.4, sy: 0.32, sz: 1.05, cut: 0.25, strata: 2, sink: 0.08, at: [0, legH * 0.9 - 0.05, 0], rot: [rand(rng, -0.05, 0.05), rng() * Math.PI * 2, rand(rng, -0.05, 0.05)] });
    return { footprint: 1.6 };
  },
};

/**
 * Build a set-dressing prop. opts: { seed | rng, lod, steps (stone_step only) }.
 * Returns { geometry, height, radius, footprint }.
 */
export function buildProp(kind, opts = {}) {
  const builder = PROP_BUILDERS[kind];
  if (!builder) throw new Error(`rocks.js: unknown prop kind "${kind}"`);
  const rng = opts.rng || makeRng(opts.seed ?? kind);
  const lod = clamp(opts.lod | 0, 0, 2);
  const m = new MeshBuilder();
  const info = builder(m, rng, lod, opts) || {};
  const geometry = m.build();
  geometry.userData.colorMode = 'albedo';
  geometry.userData.kind = kind;
  if (info.emissive) geometry.userData.emissiveMask = true;
  const { height, radius } = measure(geometry);
  return { geometry, height, radius, footprint: info.footprint ?? radius };
}

// ============================================================================================
// 9. GROUND DETAILS — flat-ish patches with a little relief, laid on the terrain
// ============================================================================================
// Lay these a couple of centimetres above the ground (or use polygonOffset) so they never
// fight the terrain for the same pixels. Triangle budgets (lod 0 / 1 / 2), rough:
//   root_mat ~900/300/90   lichen_patch ~180/60/24   pine_cone_scatter ~800/240/60
//   bone_scatter ~500/220/80   mushroom_ring ~700/300/100   puddle_ring ~140/60/24
//   snow_drift ~360/120/36   sand_ripple ~360/120/36   ash_patch ~250/100/40

const GROUND_BUILDERS = {
  root_mat(m, rng, lod) {
    // roots crawling out from the centre: wavy paths, half sunk into the ground, tapering
    const noise = makeNoise(rng), n = byLod(lod, 7, 5, 3), sides = byLod(lod, 6, 4, 3), steps = byLod(lod, 10, 6, 4);
    for (let i = 0; i < n; i++) {
      let a = (i / n) * Math.PI * 2 + rng() * 0.8;
      const len = rand(rng, 1.0, 2.0), r0 = rand(rng, 0.08, 0.14);
      const pts = [[0, r0 * 0.55, 0]];
      let x = 0, z = 0;
      for (let s = 1; s <= steps; s++) {
        a += 0.5 * noise.noise(x * 2, i * 3, z * 2);
        const st = len / steps;
        x += Math.cos(a) * st; z += Math.sin(a) * st;
        const r = r0 * (1 - s / steps);
        pts.push([x, r * 0.55 + 0.02 * Math.max(0, noise.noise(x * 4, 1, z * 4)), z]);
      }
      const col = jitterColor(rng, C.root, 0.12);
      tube(m, pts, (t) => r0 * (1.05 - t) + 0.01, sides, (seg, k) => mul3(col, 0.8 + 0.3 * hash1(seg * 1.3 + k * 0.7)), { noiseFn: (px, py, pz) => 0.15 * noise.noise(px * 6, py * 6, pz * 6) });
    }
    return { footprint: 0 };
  },
  lichen_patch(m, rng, lod) {
    const noise = makeNoise(rng);
    disc(m, rng, 0.6, byLod(lod, 3, 2, 1), byLod(lod, 16, 10, 6), (x, z, t) => {
      const b = noise.noise(x * 6, z * 6, 1) * 0.5 + 0.5;
      return { y: 0.01 + 0.02 * (1 - t) * b, color: mix3(C.stoneDark, mul3(C.lichen, 0.85 + 0.3 * b), smooth(0.2, 0.7, b)) };
    }, { rimNoise: 0.3 });
    return { footprint: 0 };
  },
  pine_cone_scatter(m, rng, lod) {
    const n = byLod(lod, 10, 6, 3);
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2, d = rng() * 0.7;
      placeRock(m, rng, { detail: byLod(lod, 1, 0, 0), size: rand(rng, 0.08, 0.11), amp: 0.16, freq: 4, sx: 0.6, sy: 0.55, sz: 1.0, taper: 0.3, cut: 0.1, sink: 0.15, at: [Math.cos(a) * d, 0, Math.sin(a) * d], base: C.cone, tintVar: 0.12 });
    }
    return { footprint: 0 };
  },
  bone_scatter(m, rng, lod) {
    const rad = byLod(lod, 7, 5, 4), n = byLod(lod, 6, 4, 2);
    for (let i = 0; i < n; i++) { // long bones: a shaft with a knob at each end
      const L = rand(rng, 0.3, 0.55), a = rng() * Math.PI * 2, d = rng() * 0.6;
      const col = jitterColor(rng, C.bone, 0.08);
      lathe(m, [[0, 0], [0.045, 0], [0.028, 0.06], [0.028, L - 0.06], [0.045, L], [0, L]], rad, col, { at: [Math.cos(a) * d, 0.03, Math.sin(a) * d], rot: [Math.PI / 2, 0, rng() * Math.PI * 2] });
    }
    for (let i = 0; i < byLod(lod, 2, 1, 1); i++) {
      const a = rng() * Math.PI * 2, d = rng() * 0.5;
      placeRock(m, rng, { detail: byLod(lod, 2, 1, 0), size: 0.22, amp: 0.08, freq: 2, sx: 1, sy: 0.8, sz: 1.15, cut: 0.15, sink: 0.2, at: [Math.cos(a) * d, 0, Math.sin(a) * d], base: C.bone, tintVar: 0.06,
        paint: (x, y, z, nx, ny, nz, c) => (z > 0.5 && y > 0.3 && y < 0.7 && Math.abs(Math.abs(x) - 0.35) < 0.18 ? mul3(c, 0.2) : null) });
    }
    if (lod < 2) { // a curve of ribs
      const a0 = rng() * Math.PI * 2, cx = Math.cos(a0) * 0.4, cz = Math.sin(a0) * 0.4;
      for (let r = 0; r < byLod(lod, 4, 2, 0); r++) {
        const pts = [];
        for (let s = 0; s <= 6; s++) { const t = s / 6, th = Math.PI * t; pts.push([cx + Math.cos(th) * 0.22 + r * 0.09, 0.02 + Math.sin(th) * 0.18, cz + r * 0.09]); }
        tube(m, pts, () => 0.012, 4, C.bone, {});
      }
    }
    return { footprint: 0 };
  },
  mushroom_ring(m, rng, lod) {
    const n = byLod(lod, 9 + Math.floor(rng() * 4), 7, 4), rad = byLod(lod, 8, 6, 5), R = rand(rng, 0.5, 0.8);
    const capCol = rng() < 0.3 ? C.capRed : C.capBrown;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng() * 0.4, d = R * rand(rng, 0.9, 1.1);
      const h = rand(rng, 0.08, 0.16), cw = h * rand(rng, 0.7, 1.1);
      const cap = jitterColor(rng, capCol, 0.15);
      lathe(m, [[0, 0], [0.018, 0], [0.016, h * 0.6], [0.03, h * 0.62], [cw, h * 0.72], [cw * 0.7, h * 0.94], [0, h]], rad,
        (j) => (j >= 3 ? cap : C.stem), { at: [Math.cos(a) * d, 0, Math.sin(a) * d], rot: [rand(rng, -0.15, 0.15), 0, rand(rng, -0.15, 0.15)] });
    }
    return { footprint: 0 };
  },
  puddle_ring(m, rng, lod) {
    // a sunken dark middle with a raised mud lip; smooth normals so the lip is a soft roll
    disc(m, rng, 0.9, byLod(lod, 4, 3, 2), byLod(lod, 16, 10, 6), (x, z, t) => {
      const lip = Math.exp(-Math.pow((t - 0.72) / 0.12, 2));
      const water = t < 0.6;
      return { y: water ? 0.004 : 0.01 + 0.035 * lip, color: water ? C.water : mix3(C.mud, mul3(C.mud, 1.25), lip) };
    }, { rimNoise: 0.25 });
    return { footprint: 0, smooth: true };
  },
  snow_drift(m, rng, lod) {
    const noise = makeNoise(rng);
    const stretch = rand(rng, 1.3, 1.8);
    disc(m, rng, 1.5, byLod(lod, 8, 5, 3), byLod(lod, 20, 12, 6), (x, z, t, ang) => {
      const e = Math.hypot(x / stretch, z) / 1.5; // an oval, longer along x
      const h = 0.35 * Math.pow(Math.max(0, 1 - e), 1.6) + 0.02 * noise.noise(x * 3, 0, z * 3) * (1 - t);
      return { y: Math.max(0.005, h), color: mul3(C.snow, 0.93 + 0.07 * (1 - e)) };
    }, { rimNoise: 0.15 });
    return { footprint: 0, smooth: true };
  },
  sand_ripple(m, rng, lod) {
    const dir = rng() * Math.PI, cd = Math.cos(dir), sd = Math.sin(dir), wl = rand(rng, 0.22, 0.32);
    disc(m, rng, 1.2, byLod(lod, 8, 5, 3), byLod(lod, 20, 12, 6), (x, z, t) => {
      const along = x * cd + z * sd;
      const w = Math.sin(along / wl * Math.PI * 2);
      return { y: 0.01 + 0.03 * (w * 0.5 + 0.5) * (1 - t * t), color: mul3(C.sand, 0.9 + 0.15 * (w * 0.5 + 0.5)) };
    }, { rimNoise: 0.2 });
    return { footprint: 0, smooth: true };
  },
  ash_patch(m, rng, lod) {
    const noise = makeNoise(rng);
    disc(m, rng, 0.7, byLod(lod, 3, 2, 1), byLod(lod, 14, 10, 6), (x, z, t) => ({ y: 0.01 + 0.03 * (1 - t) * (noise.noise(x * 5, 2, z * 5) * 0.5 + 0.5), color: mul3(C.ash, 0.6 + 0.4 * t) }), { rimNoise: 0.3 });
    for (let i = 0; i < byLod(lod, 6, 3, 1); i++) { // charred sticks
      const a = rng() * Math.PI * 2, d = rng() * 0.35, L = rand(rng, 0.2, 0.4);
      cylinder(m, 0.02, 0.014, L, byLod(lod, 5, 4, 3), C.charcoal, { at: [Math.cos(a) * d, 0.02, Math.sin(a) * d], rot: [Math.PI / 2 + rand(rng, -0.2, 0.2), 0, rng() * Math.PI * 2] });
    }
    for (let i = 0; i < byLod(lod, 3, 2, 0); i++) {
      const a = rng() * Math.PI * 2, d = rng() * 0.25;
      placeRock(m, rng, { detail: 0, size: rand(rng, 0.04, 0.07), amp: 0.1, sy: 0.6, cut: 0.1, sink: 0.3, at: [Math.cos(a) * d, 0.02, Math.sin(a) * d], base: C.ember, tintVar: 0.05 });
    }
    return { footprint: 0, emissive: lod < 2 };
  },
};

/**
 * Build a ground detail. opts: { seed | rng, lod }. Returns { geometry, height, radius, footprint }
 * (footprint is 0: these are decoration, nothing should be kept clear for them).
 */
export function buildGroundDetail(kind, opts = {}) {
  const builder = GROUND_BUILDERS[kind];
  if (!builder) throw new Error(`rocks.js: unknown ground detail kind "${kind}"`);
  const rng = opts.rng || makeRng(opts.seed ?? kind);
  const lod = clamp(opts.lod | 0, 0, 2);
  const m = new MeshBuilder();
  const info = builder(m, rng, lod, opts) || {};
  const geometry = m.build({ smooth: !!info.smooth });
  geometry.userData.colorMode = 'albedo';
  geometry.userData.kind = kind;
  if (info.emissive) geometry.userData.emissiveMask = true;
  const { height, radius } = measure(geometry);
  return { geometry, height, radius, footprint: info.footprint ?? 0 };
}

// ============================================================================================
// 10. CATALOG
// ============================================================================================

export const CATALOG = {
  rocks: Object.keys(ROCK_BUILDERS),
  cliffs: Object.keys(CLIFF_BUILDERS),
  props: Object.keys(PROP_BUILDERS),
  ground: Object.keys(GROUND_BUILDERS),
};
