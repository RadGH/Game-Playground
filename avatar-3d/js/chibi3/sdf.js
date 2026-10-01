// Chibi 3 shape maths. No Three.js here, so node tests and tools can build and measure shapes.
//
// A Chibi 3 body is not a pile of separate meshes like Chibi 2. Every surface is described as a
// SIGNED DISTANCE FIELD: a function that answers "how far is this point from the surface", negative
// inside, positive outside. Shapes are blended with a SMOOTH MINIMUM, which is what lets a deltoid
// melt into a shoulder, or a nose into a face, with no seam — the single thing that makes the body
// read as a body instead of a chibi doll of joined tubes. mesher.js turns a field into triangles.
//
// Units are metres, +y up, +z forward (the way the face looks), +x the character's left.
//
// A primitive is a plain object:
//   { d(x, y, z) -> distance, box: [minX, minY, minZ, maxX, maxY, maxZ],
//     op: 'add' | 'sub' | 'inter', k: blend radius (m), paint: { color, mat, bone, rough, metal } }
// `box` is a bound on where the primitive can matter; a point outside it skips the primitive, which is
// what keeps a 40-primitive body affordable on a half-million-point grid.

export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const mix = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** Polynomial smooth minimum (blend radius k). Returns the blended distance. */
export function smin(a, b, k) {
  if (k <= 0) return a < b ? a : b;
  const h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1);
  return mix(b, a, h) - k * h * (1 - h);
}
/** Smooth subtraction: carve b out of a. */
export function ssub(a, b, k) {
  if (k <= 0) return a > -b ? a : -b;
  const h = clamp(0.5 - 0.5 * (a + b) / k, 0, 1);
  return mix(a, -b, h) + k * h * (1 - h);
}
/** Smooth intersection. */
export function sinter(a, b, k) {
  if (k <= 0) return a > b ? a : b;
  const h = clamp(0.5 - 0.5 * (b - a) / k, 0, 1);
  return mix(b, a, h) + k * h * (1 - h);
}

// ------------------------------------------------------------------ rotation helpers (no Three.js)

/** 3x3 rotation (row-major) from Euler XYZ radians; turns a WORLD offset into the primitive's LOCAL frame. */
export function inverseRotation(rx = 0, ry = 0, rz = 0) {
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
  // R = Rx * Ry * Rz (three.js 'XYZ' order); its inverse is the transpose.
  const r = [
    cy * cz, -cy * sz, sy,
    cx * sz + sx * sy * cz, cx * cz - sx * sy * sz, -sx * cy,
    sx * sz - cx * sy * cz, sx * cz + cx * sy * sz, cx * cy,
  ];
  return [r[0], r[3], r[6], r[1], r[4], r[7], r[2], r[5], r[8]];
}
/** A rotation whose local +y runs along the direction (dx, dy, dz). Row-major inverse (world -> local). */
export function alignY(dx, dy, dz) {
  const l = Math.hypot(dx, dy, dz) || 1; const y = [dx / l, dy / l, dz / l];
  const ref = Math.abs(y[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  let x = [y[1] * ref[2] - y[2] * ref[1], y[2] * ref[0] - y[0] * ref[2], y[0] * ref[1] - y[1] * ref[0]];
  const lx = Math.hypot(...x); x = x.map(v => v / lx);
  const z = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
  return [...x, ...y, ...z];
}
const local = (m, x, y, z) => m ? [m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, m[6] * x + m[7] * y + m[8] * z] : [x, y, z];

function boxAround(cx, cy, cz, r) { return [cx - r, cy - r, cz - r, cx + r, cy + r, cz + r]; }
function boxUnion(a, b) { return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2]), Math.max(a[3], b[3]), Math.max(a[4], b[4]), Math.max(a[5], b[5])]; }

// ------------------------------------------------------------------------------- primitives

export function sphere(c, r, extra = {}) {
  const [cx, cy, cz] = c;
  return { d: (x, y, z) => { const dx = x - cx, dy = y - cy, dz = z - cz; return Math.sqrt(dx * dx + dy * dy + dz * dz) - r; }, box: boxAround(cx, cy, cz, r), ...extra };
}

/** Ellipsoid with radii [rx, ry, rz], optional Euler rotation `rot`. Approximate (good near the surface). */
export function ellipsoid(c, radii, extra = {}) {
  const [cx, cy, cz] = c, [rx, ry, rz] = radii, m = extra.rot ? inverseRotation(...extra.rot) : null;
  const ix = 1 / rx, iy = 1 / ry, iz = 1 / rz, ix2 = ix * ix, iy2 = iy * iy, iz2 = iz * iz, rmin = Math.min(rx, ry, rz);
  const big = Math.max(rx, ry, rz);
  // (no allocations here: this is the hottest function in the whole build)
  const d = m ? (x, y, z) => {
    const ox = x - cx, oy = y - cy, oz = z - cz;
    const px = m[0] * ox + m[1] * oy + m[2] * oz, py = m[3] * ox + m[4] * oy + m[5] * oz, pz = m[6] * ox + m[7] * oy + m[8] * oz;
    const ax = px * ix, ay = py * iy, az = pz * iz, bx = px * ix2, by = py * iy2, bz = pz * iz2;
    const k0 = Math.sqrt(ax * ax + ay * ay + az * az), k1 = Math.sqrt(bx * bx + by * by + bz * bz);
    return k1 < 1e-9 ? -rmin : k0 * (k0 - 1) / k1;
  } : (x, y, z) => {
    const px = x - cx, py = y - cy, pz = z - cz;
    const ax = px * ix, ay = py * iy, az = pz * iz, bx = px * ix2, by = py * iy2, bz = pz * iz2;
    const k0 = Math.sqrt(ax * ax + ay * ay + az * az), k1 = Math.sqrt(bx * bx + by * by + bz * bz);
    return k1 < 1e-9 ? -rmin : k0 * (k0 - 1) / k1;
  };
  return { d, box: boxAround(cx, cy, cz, big), ...extra };
}

/**
 * Round cone between points a and b with radii ra and rb (a capsule when they match) — the workhorse
 * for limbs, fingers and muscles. `squash` [sx, sz] flattens the cross-section (a forearm is wider
 * than it is deep); the flattening frame is built from `up` (default world z).
 */
export function cone(a, b, ra, rb, extra = {}) {
  const [ax, ay, az] = a, [bx, by, bz] = b;
  const sq = extra.squash || null;
  const m = sq ? alignY(bx - ax, by - ay, bz - az) : null;
  const L = Math.hypot(bx - ax, by - ay, bz - az);
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const l2 = bax * bax + bay * bay + baz * baz, rr = ra - rb, a2 = l2 - rr * rr, il2 = 1 / l2;
  const srr = rr > 0 ? 1 : rr < 0 ? -1 : 0, krr = srr * rr * rr;
  const fn = (px, py, pz) => {
    // iq's round cone, in world space
    const yv = px * bax + py * bay + pz * baz, z = yv - l2;
    const xx = px * l2 - bax * yv, xy = py * l2 - bay * yv, xz = pz * l2 - baz * yv;
    const x2 = xx * xx + xy * xy + xz * xz, y2 = yv * yv * l2, z2 = z * z * l2;
    const k = krr * x2;
    if ((z > 0 ? 1 : z < 0 ? -1 : 0) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - rb;
    if ((yv > 0 ? 1 : yv < 0 ? -1 : 0) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - ra;
    return (Math.sqrt(x2 * a2 * il2) + yv * rr) * il2 - ra;
  };
  const r = Math.max(ra, rb);
  let d;
  if (sq) {
    // squash the cross-section: scale the local x/z offsets about the axis, then correct the distance roughly
    const [sx, sz] = sq, kx = 1 / sx, kz = 1 / sz, corr = Math.min(sx, sz);
    d = (x, y, z) => {
      const ox = x - ax, oy = y - ay, oz = z - az;
      const lx = m[0] * ox + m[1] * oy + m[2] * oz, ly = m[3] * ox + m[4] * oy + m[5] * oz, lz = m[6] * ox + m[7] * oy + m[8] * oz;
      // rebuild a world offset with the squashed local coordinates (local y stays on the axis)
      const qx = lx * kx, qz = lz * kz;
      return fn(m[0] * qx + m[3] * ly + m[6] * qz, m[1] * qx + m[4] * ly + m[7] * qz, m[2] * qx + m[5] * ly + m[8] * qz) * corr;
    };
  } else d = (x, y, z) => fn(x - ax, y - ay, z - az);
  const pad = r * (sq ? Math.max(1, ...sq) : 1);
  const box = boxUnion(boxAround(ax, ay, az, pad), boxAround(bx, by, bz, pad));
  return { d, box, axis: { a, b, L }, ...extra };
}

/** Rounded box: centre, half-sizes, corner radius, optional Euler rotation. */
export function roundBox(c, half, r = 0, extra = {}) {
  const [cx, cy, cz] = c, [hx, hy, hz] = half, m = extra.rot ? inverseRotation(...extra.rot) : null;
  const big = Math.hypot(hx, hy, hz) + r;
  return {
    d(x, y, z) {
      const ox = x - cx, oy = y - cy, oz = z - cz;
      const px = m ? m[0] * ox + m[1] * oy + m[2] * oz : ox, py = m ? m[3] * ox + m[4] * oy + m[5] * oz : oy, pz = m ? m[6] * ox + m[7] * oy + m[8] * oz : oz;
      const qx = Math.abs(px) - hx + r, qy = Math.abs(py) - hy + r, qz = Math.abs(pz) - hz + r;
      const mx = qx > 0 ? qx : 0, my = qy > 0 ? qy : 0, mz = qz > 0 ? qz : 0;
      const inner = Math.max(qx, qy, qz);
      return Math.sqrt(mx * mx + my * my + mz * mz) + (inner < 0 ? inner : 0) - r;
    },
    box: boxAround(cx, cy, cz, big), ...extra,
  };
}

/** Torus lying in the local xz plane: major radius R, tube radius r. */
export function torus(c, R, r, extra = {}) {
  const [cx, cy, cz] = c, m = extra.rot ? inverseRotation(...extra.rot) : null, sx = extra.stretch || [1, 1];
  return {
    d(x, y, z) {
      const [px, py, pz] = local(m, x - cx, y - cy, z - cz);
      const q = Math.hypot(px / sx[0], pz / sx[1]) - R;
      return Math.hypot(q, py) - r;
    },
    box: boxAround(cx, cy, cz, (R + r) * Math.max(...sx)), ...extra,
  };
}

/** Half-space: everything on the side the normal points away from is inside. A mask, not a solid. */
export function plane(point, normal, extra = {}) {
  const l = Math.hypot(...normal), [nx, ny, nz] = normal.map(v => v / l), [px, py, pz] = point;
  return { d: (x, y, z) => (x - px) * nx + (y - py) * ny + (z - pz) * nz, box: null, ...extra };
}

/** Wrap any distance function. `box` null means "everywhere" (never skipped). */
export function custom(d, box = null, extra = {}) { return { d, box, ...extra }; }

// ------------------------------------------------------------------------------- noise

const P = new Uint8Array(512);
{ let s = 1337; const p = Array.from({ length: 256 }, (_, i) => i); for (let i = 255; i > 0; i--) { s = (s * 16807) % 2147483647; const j = s % (i + 1); [p[i], p[j]] = [p[j], p[i]]; } for (let i = 0; i < 512; i++) P[i] = p[i & 255]; }
const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
function grad(h, x, y, z) { const u = h < 8 ? x : y, v = h < 4 ? y : h === 12 || h === 14 ? x : z; return ((h & 1) ? -u : u) + ((h & 2) ? -v : v); }
/** Classic 3D Perlin noise in roughly -1..1. */
export function noise3(x, y, z) {
  const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
  x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
  const u = fade(x), v = fade(y), w = fade(z);
  const A = P[X] + Y, AA = P[A] + Z, AB = P[A + 1] + Z, B = P[X + 1] + Y, BA = P[B] + Z, BB = P[B + 1] + Z;
  return mix(mix(mix(grad(P[AA] & 15, x, y, z), grad(P[BA] & 15, x - 1, y, z), u), mix(grad(P[AB] & 15, x, y - 1, z), grad(P[BB] & 15, x - 1, y - 1, z), u), v),
    mix(mix(grad(P[AA + 1] & 15, x, y, z - 1), grad(P[BA + 1] & 15, x - 1, y, z - 1), u), mix(grad(P[AB + 1] & 15, x, y - 1, z - 1), grad(P[BB + 1] & 15, x - 1, y - 1, z - 1), u), v), w);
}

// ------------------------------------------------------------------------------- shapes

/**
 * A Shape is an ordered list of primitives combined left to right, plus optional whole-shape
 * modifiers. `eval(x, y, z)` is the distance; `paintAt(x, y, z)` says which primitive owns a point
 * (for its colour, material and bone).
 *
 *   base     another field { eval } the shape starts from (a garment starts from the body)
 *   offset   added to the base's distance (negative inflates: -0.006 is a 6 mm layer of cloth)
 *   displace (x, y, z) => metres pushed outward (folds, quilting, muscle striation)
 */
const EMPTY = [];
export class Shape {
  constructor(prims = [], opts = {}) {
    this.prims = prims; this.base = opts.base || null; this.offset = opts.offset || 0;
    // baseFast: a cheap stand-in for `base` (a sampled grid) used to fill the mesher's grid; the exact
    // base still places the vertices and gives the normals
    this.baseFast = opts.baseFast || null;
    // MARGIN: how far off the surface this shape must still answer correctly. Box culling skips a
    // primitive whose bound is further away than this — fine at the surface, but a garment asks the
    // body "how far am I" from up to 4 cm out, and a culled answer there is garbage.
    this.margin = opts.margin ?? 0.002;
    this.wideMargin = 0.06;
    this.displace = opts.displace || null; this.basePaint = opts.basePaint || null; this.name = opts.name || 'shape';
  }
  add(p) { this.prims.push(p); this.idx = null; return p; }
  /**
   * SPATIAL INDEX. A body has ~140 primitives but any one point is near maybe ten of them, so the
   * shape is cut into bricks (3 cm by default) and each brick keeps the ordered list of primitives
   * that can reach it. eval() then looks at its brick's list only. Order is preserved, because a
   * carve only removes what was added before it.
   */
  buildIndex(brick = 0.02) {
    // only worth it for a shape with many primitives (the body); a garment has a handful, and a
    // full-body index for each of thirty garments is gigabytes of tiny lists
    if (this.prims.length < 16) { this.idx = null; this.unindexed = true; return this; }
    const b = this.bounds(0.08), n = [0, 1, 2].map(i => Math.max(1, Math.ceil((b[i + 3] - b[i]) / brick)));
    const listsFor = margin => {
      const lists = new Array(n[0] * n[1] * n[2]).fill(EMPTY);
      for (const p of this.prims) {
        if (p.op === 'paint') continue;
        const k = (p.k || 0) + margin;
        const r = p.box ? [0, 1, 2].map(i => [Math.max(0, Math.floor((p.box[i] - k - b[i]) / brick)), Math.min(n[i] - 1, Math.floor((p.box[i + 3] + k - b[i]) / brick))]) : [[0, n[0] - 1], [0, n[1] - 1], [0, n[2] - 1]];
        for (let z = r[2][0]; z <= r[2][1]; z++) for (let y = r[1][0]; y <= r[1][1]; y++) for (let x = r[0][0]; x <= r[0][1]; x++) { const i = x + y * n[0] + z * n[0] * n[1]; if (lists[i] === EMPTY) lists[i] = []; lists[i].push(p); }
      }
      return lists;
    };
    const lists = listsFor(this.margin), wide = listsFor(this.wideMargin);
    // a second set of lists for paintAt: every primitive that can be NEAREST to a point up to ~5 cm
    // off the surface (garments sit that far out), plus paint and carve primitives
    const plists = new Array(n[0] * n[1] * n[2]).fill(EMPTY);
    for (const p of this.prims) {
      if (!p.paint) continue;
      const k = (p.op === 'paint' ? (p.band || 0.003) : 0.055) + (p.k || 0);
      const r = p.box ? [0, 1, 2].map(i => [Math.max(0, Math.floor((p.box[i] - k - b[i]) / brick)), Math.min(n[i] - 1, Math.floor((p.box[i + 3] + k - b[i]) / brick))]) : [[0, n[0] - 1], [0, n[1] - 1], [0, n[2] - 1]];
      for (let z = r[2][0]; z <= r[2][1]; z++) for (let y = r[1][0]; y <= r[1][1]; y++) for (let x = r[0][0]; x <= r[0][1]; x++) { const i = x + y * n[0] + z * n[0] * n[1]; if (plists[i] === EMPTY) plists[i] = []; plists[i].push(p); }
    }
    this.idx = { b, n, brick, lists, wide, plists };
    return this;
  }
  evalFast(x, y, z) { return this._eval(x, y, z, this.baseFast || this.base, false); }
  eval(x, y, z) { return this._eval(x, y, z, this.base, false); }
  /** Correct up to ~6 cm off the surface (what a garment built on this shape needs). */
  evalWide(x, y, z) { return this._eval(x, y, z, this.base, true); }
  _eval(x, y, z, base, wide) {
    let ps = this.prims;
    const I = this.idx, far = wide ? this.wideMargin : this.margin;
    if (I) {
      const i = Math.floor((x - I.b[0]) / I.brick), j = Math.floor((y - I.b[1]) / I.brick), k = Math.floor((z - I.b[2]) / I.brick);
      if (i < 0 || j < 0 || k < 0 || i >= I.n[0] || j >= I.n[1] || k >= I.n[2]) {
        if (!this.base) return Math.max(far, I.b[0] - x, x - I.b[3], I.b[1] - y, y - I.b[4], I.b[2] - z, z - I.b[5]);
        ps = EMPTY;
      } else ps = (wide ? I.wide : I.lists)[i + j * I.n[0] + k * I.n[0] * I.n[1]];
      // nothing can reach this brick: all we know is that the surface is at least `far` away
      if (!this.base && ps.length === 0) return far;
    }
    let d = base ? (base.evalWide ? base.evalWide(x, y, z) : base.eval(x, y, z)) + this.offset : 1e9;
    const M = wide ? this.wideMargin : this.margin, culled = !I;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i], b = p.box, k = p.k || 0, km = k + M;
      // (an indexed brick already lists only primitives that can reach it, so no bound test there)
      if (culled && b && (x < b[0] - km || y < b[1] - km || z < b[2] - km || x > b[3] + km || y > b[4] + km || z > b[5] + km)) {
        if (p.op === 'inter') d = 1e9;   // a bounded intersection outside its bound leaves nothing
        continue;
      }
      if (p.op === 'paint') continue;      // paint-only: colours a region, never moves the surface
      const v = p.d(x, y, z);
      if (p.op === 'sub') d = ssub(d, v, k);
      else if (p.op === 'inter') d = sinter(d, v, k);
      else d = smin(d, v, k);
    }
    // every primitive was out of reach: same honest lower bound as an empty brick
    if (d > 1e8) return far;
    if (this.displace) d -= this.displace(x, y, z);
    return d;
  }
  /** Bounding box of every additive primitive (and the base's box), padded. */
  bounds(pad = 0.02) {
    let b = this.base?.bounds ? this.base.bounds(0) : null;
    for (const p of this.prims) if (p.box && (!p.op || p.op === 'add')) b = b ? boxUnion(b, p.box) : p.box.slice();
    if (!b) throw new Error('Shape has no bounded primitives');
    return [b[0] - pad, b[1] - pad, b[2] - pad, b[3] + pad, b[4] + pad, b[5] + pad];
  }
  /**
   * Which primitive paints a point. Carving primitives that carry a paint (a mouth slit, a visor's
   * eye slot) win when the point sits on their wall; otherwise the nearest additive primitive.
   * Returns { paint, weights } where weights blends colour across the seam between two primitives.
   */
  paintAt(x, y, z) {
    let best = null, bestD = 1e9, second = null, secondD = 1e9, wall = null, splash = null, splashD = 1e9;
    let list = this.prims;
    const I = this.idx;
    if (I) {
      const i = Math.floor((x - I.b[0]) / I.brick), j = Math.floor((y - I.b[1]) / I.brick), k = Math.floor((z - I.b[2]) / I.brick);
      if (i >= 0 && j >= 0 && k >= 0 && i < I.n[0] && j < I.n[1] && k < I.n[2]) { const l = I.plists[i + j * I.n[0] + k * I.n[0] * I.n[1]]; if (l.length) list = l; }
    }
    for (const p of list) {
      if (!p.paint) continue;
      const b = p.box;
      if (b && (p.op === 'sub' || p.op === 'paint') && (x < b[0] - 0.01 || y < b[1] - 0.01 || z < b[2] - 0.01 || x > b[3] + 0.01 || y > b[4] + 0.01 || z > b[5] + 0.01)) continue;
      const v = p.d(x, y, z);
      if (p.op === 'sub') { if (!wall && Math.abs(v) < (p.paintBand || 0.0025)) wall = p; continue; }
      if (p.op === 'paint') { if (v < (p.band || 0.003) && v < splashD) { splash = p; splashD = v; } continue; }
      if (p.op === 'inter') continue;
      if (v < bestD) { second = best; secondD = bestD; best = p; bestD = v; }
      else if (v < secondD) { second = p; secondD = v; }
    }
    const bone = best?.paint?.bone || this.basePaint?.bone || null;
    if (wall) return { paint: wall.paint, other: null, t: 0, bone };
    if (splash) {
      const band = splash.band || 0.003;
      return { paint: splash.paint, other: best?.paint || this.basePaint, t: smoothstep(-band, band, splashD), bone };
    }
    if (!best) return { paint: this.basePaint, other: null, t: 0, bone };
    // colours blend over the primitive's own blend radius, so a lip melts into the skin around it
    const k = Math.max(0.002, Math.min(best.k || 0.004, second?.k || 0.004));
    const t = second && second.paint !== best.paint ? 0.5 * (1 - smoothstep(0, k, secondD - bestD)) : 0;
    return { paint: best.paint, other: second?.paint || null, t, bone };
  }
}

/** Union of fields (for ambient occlusion and hidden-surface tests). */
export function unionField(fields) {
  return { eval(x, y, z) { let d = 1e9; for (const f of fields) { const v = f.eval(x, y, z); if (v < d) d = v; } return d; } };
}

/**
 * Almond (eye opening): the lens where two circles overlap, in the local xy plane, pushed `depth`
 * along local z. halfW is the corner-to-corner half width, halfH the half height. `inner` (-1..1)
 * drops and rounds the inner corner a little, as a real eye's does.
 */
export function almond(c, halfW, halfH, depth, extra = {}) {
  const [cx, cy, cz] = c, m = extra.rot ? inverseRotation(...extra.rot) : null;
  const Rc = (halfW * halfW + halfH * halfH) / (2 * halfH), off = Rc - halfH, side = extra.innerSide || 0;
  return {
    d(x, y, z) {
      let [px, py, pz] = local(m, x - cx, y - cy, z - cz);
      // the inner corner (toward the nose) sits a little lower
      if (side) py += 0.18 * halfH * Math.max(0, (px * side) / halfW) ** 2;
      const lens = Math.max(Math.hypot(px, py + off) - Rc, Math.hypot(px, py - off) - Rc);
      const slab = Math.abs(pz) - depth;
      return Math.max(lens, slab);
    },
    box: boxAround(cx, cy, cz, Math.max(halfW, depth) * 1.2), ...extra,
  };
}
