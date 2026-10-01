// Chibi 3 mesher: distance field -> triangles. No Three.js here (node tests time it and count triangles).
//
// SURFACE NETS: sample the field on a grid, put one vertex in every grid cell the surface passes
// through (the average of where the surface crosses that cell's edges), and join the vertices of the
// four cells around every crossed grid edge into a quad. It never makes the slivers marching cubes
// does, and every vertex is shared, so the result is one welded, smooth skin.
//
// Two refinements make it look sculpted rather than voxel-built:
//   1. every vertex is PROJECTED onto the true surface (a Newton step along the field's gradient),
//      so a 1.2 cm grid still lands every vertex on the curve, not inside a cube;
//   2. normals are the field's own gradient at the vertex — exact, not averaged from faces.

/** A field sampled on a regular grid. `sample` reads it back with trilinear filtering. */
export class Grid {
  constructor(bounds, step) {
    this.min = bounds.slice(0, 3); this.step = step;
    this.n = [0, 1, 2].map(i => Math.max(2, Math.ceil((bounds[i + 3] - bounds[i]) / step) + 1));
    this.data = new Float32Array(this.n[0] * this.n[1] * this.n[2]);
  }
  fill(field) {
    const [nx, ny, nz] = this.n, [x0, y0, z0] = this.min, h = this.step, d = this.data;
    let i = 0;
    for (let k = 0; k < nz; k++) { const z = z0 + k * h; for (let j = 0; j < ny; j++) { const y = y0 + j * h; for (let ii = 0; ii < nx; ii++) d[i++] = field.eval(x0 + ii * h, y, z); } }
    return this;
  }
  /** Trilinear sample; outside the grid it answers "far outside". */
  sample(x, y, z) {
    const [nx, ny, nz] = this.n, h = this.step;
    const fx = (x - this.min[0]) / h, fy = (y - this.min[1]) / h, fz = (z - this.min[2]) / h;
    if (fx < 0 || fy < 0 || fz < 0 || fx > nx - 1 || fy > ny - 1 || fz > nz - 1) return 1;
    const i = Math.min(nx - 2, fx | 0), j = Math.min(ny - 2, fy | 0), k = Math.min(nz - 2, fz | 0);
    const u = fx - i, v = fy - j, w = fz - k, d = this.data, sx = 1, sy = nx, sz = nx * ny, o = i + j * sy + k * sz;
    const c00 = d[o] * (1 - u) + d[o + sx] * u, c10 = d[o + sy] * (1 - u) + d[o + sy + sx] * u;
    const c01 = d[o + sz] * (1 - u) + d[o + sz + sx] * u, c11 = d[o + sz + sy] * (1 - u) + d[o + sz + sy + sx] * u;
    return (c00 * (1 - v) + c10 * v) * (1 - w) + (c01 * (1 - v) + c11 * v) * w;
  }
  /** As a field object, so a garment can be built on top of a sampled body. */
  asField(bounds) { return { eval: (x, y, z) => this.sample(x, y, z), bounds: () => bounds }; }
}

const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];

/**
 * Mesh one field. Returns { positions: Float32Array, normals: Float32Array, indices: Uint32Array, grid }.
 *   field   { eval(x, y, z) }
 *   bounds  [minX, minY, minZ, maxX, maxY, maxZ]
 *   step    grid spacing in metres (the level of detail)
 *   clip    optional (x, y, z) => boolean, true keeps a vertex (used to cut a region's seam)
 */
export function meshField(field, bounds, step, { project = 2, clip = null, grid = null, fill = null } = {}) {
  const g = grid || new Grid(bounds, step).fill(fill || field);
  const [nx, ny, nz] = g.n, [x0, y0, z0] = g.min, h = g.step, d = g.data;
  const sy = nx, sz = nx * ny;
  const cellIndex = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const csy = nx - 1, csz = (nx - 1) * (ny - 1);
  const pos = [];
  const corner = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const o = i + j * sy + k * sz;
    let mask = 0;
    for (let c = 0; c < 8; c++) {
      const v = d[o + (c & 1) + ((c >> 1) & 1) * sy + ((c >> 2) & 1) * sz];
      corner[c] = v; if (v < 0) mask |= 1 << c;
    }
    if (mask === 0 || mask === 255) continue;
    let px = 0, py = 0, pz = 0, count = 0;
    for (const [a, b] of EDGES) {
      const va = corner[a], vb = corner[b];
      if ((va < 0) === (vb < 0)) continue;
      const t = va / (va - vb);
      px += (a & 1) + (((b & 1) - (a & 1)) * t); py += ((a >> 1) & 1) + ((((b >> 1) & 1) - ((a >> 1) & 1)) * t); pz += ((a >> 2) & 1) + ((((b >> 2) & 1) - ((a >> 2) & 1)) * t);
      count++;
    }
    cellIndex[i + j * csy + k * csz] = pos.length / 3;
    pos.push(x0 + (i + px / count) * h, y0 + (j + py / count) * h, z0 + (k + pz / count) * h);
  }
  const idx = [];
  const cell = (i, j, k) => (i < 0 || j < 0 || k < 0 || i >= nx - 1 || j >= ny - 1 || k >= nz - 1) ? -1 : cellIndex[i + j * csy + k * csz];
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const o = i + j * sy + k * sz, inside = d[o] < 0;
    // edge along +x: the four cells around it differ in j and k
    if (i < nx - 1 && inside !== (d[o + 1] < 0)) quad(cell(i, j - 1, k - 1), cell(i, j, k - 1), cell(i, j, k), cell(i, j - 1, k), inside);
    if (j < ny - 1 && inside !== (d[o + sy] < 0)) quad(cell(i - 1, j, k - 1), cell(i - 1, j, k), cell(i, j, k), cell(i, j, k - 1), inside);
    if (k < nz - 1 && inside !== (d[o + sz] < 0)) quad(cell(i - 1, j - 1, k), cell(i, j - 1, k), cell(i, j, k), cell(i - 1, j, k), inside);
  }
  function quad(a, b, c, e, flip) {
    if (a < 0 || b < 0 || c < 0 || e < 0) return;
    if (flip) idx.push(a, b, c, a, c, e); else idx.push(a, c, b, a, e, c);
  }
  const positions = new Float32Array(pos), count = positions.length / 3, normals = new Float32Array(count * 3);
  const raw = Float32Array.from(positions);
  // project onto the true surface, then take the gradient as the normal
  const e = Math.min(0.0008, h * 0.1);
  for (let v = 0; v < count; v++) {
    let x = positions[v * 3], y = positions[v * 3 + 1], z = positions[v * 3 + 2], gx = 0, gy = 1, gz = 0;
    for (let it = 0; it <= project; it++) {
      const f = field.eval(x, y, z);
      gx = field.eval(x + e, y, z) - field.eval(x - e, y, z);
      gy = field.eval(x, y + e, z) - field.eval(x, y - e, z);
      gz = field.eval(x, y, z + e) - field.eval(x, y, z - e);
      const gl = Math.hypot(gx, gy, gz) / (2 * e);
      if (it === project || gl < 1e-6) break;
      // a step never moves a vertex further than half a cell, so a bad gradient cannot fling it off
      const s = Math.max(-h * 0.5, Math.min(h * 0.5, f / gl));
      x -= gx / (2 * e) / gl * s; y -= gy / (2 * e) / gl * s; z -= gz / (2 * e) / gl * s;
    }
    positions[v * 3] = x; positions[v * 3 + 1] = y; positions[v * 3 + 2] = z;
    const l = Math.hypot(gx, gy, gz) || 1;
    normals[v * 3] = gx / l; normals[v * 3 + 1] = gy / l; normals[v * 3 + 2] = gz / l;
  }
  let indices = new Uint32Array(idx);
  // A projection step can push a vertex past its neighbour where the surface folds tightly (robe
  // pleats, a hem meeting a crease) and turn a triangle inside out, which then culls as a pinhole.
  // Any vertex of a triangle facing against its own normals goes back to where the grid put it.
  for (let pass = 0; pass < 3; pass++) {
    let fixed = 0;
    for (let t = 0; t < indices.length; t += 3) {
      const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3, P = positions, N = normals;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (nx * (N[a] + N[b] + N[c]) + ny * (N[a + 1] + N[b + 1] + N[c + 1]) + nz * (N[a + 2] + N[b + 2] + N[c + 2]) >= 0) continue;
      for (const v of [a, b, c]) if (P[v] !== raw[v] || P[v + 1] !== raw[v + 1] || P[v + 2] !== raw[v + 2]) { P[v] = raw[v]; P[v + 1] = raw[v + 1]; P[v + 2] = raw[v + 2]; fixed++; }
    }
    if (!fixed) break;
  }
  if (clip) indices = filterTriangles(indices, positions, (a, b, c) => clip(...at(positions, a)) || clip(...at(positions, b)) || clip(...at(positions, c)));
  return compact({ positions, normals, indices, grid: g });
}

const at = (p, i) => [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]];

/** Keep triangles for which keep(a, b, c) is true. */
export function filterTriangles(indices, positions, keep) {
  const out = [];
  for (let t = 0; t < indices.length; t += 3) if (keep(indices[t], indices[t + 1], indices[t + 2])) out.push(indices[t], indices[t + 1], indices[t + 2]);
  return new Uint32Array(out);
}

/** Drop vertices no triangle uses (after clipping or hidden-surface removal). */
export function compact(m) {
  const count = m.positions.length / 3, used = new Int32Array(count).fill(-1);
  let n = 0;
  for (const i of m.indices) if (used[i] < 0) used[i] = n++;
  if (n === count) return m;
  const positions = new Float32Array(n * 3), normals = new Float32Array(n * 3);
  const extra = {};
  for (const [key, arr] of Object.entries(m.attributes || {})) extra[key] = { size: arr.size, array: new Float32Array(n * arr.size) };
  for (let i = 0; i < count; i++) {
    const j = used[i]; if (j < 0) continue;
    positions.set(m.positions.subarray(i * 3, i * 3 + 3), j * 3); normals.set(m.normals.subarray(i * 3, i * 3 + 3), j * 3);
    for (const [key, arr] of Object.entries(m.attributes || {})) extra[key].array.set(arr.array.subarray(i * arr.size, i * arr.size + arr.size), j * arr.size);
  }
  const indices = new Uint32Array(m.indices.length);
  for (let t = 0; t < m.indices.length; t++) indices[t] = used[m.indices[t]];
  return { ...m, positions, normals, indices, attributes: m.attributes ? extra : undefined };
}

/**
 * Ambient occlusion from a distance field (the classic SDF trick): step out along the normal and see
 * how much closer the nearest surface is than the step. Five taps, 0.8 cm to 13 cm. 1 = open sky.
 */
export function fieldAO(field, x, y, z, nx, ny, nz, strength = 1) {
  let occ = 0, w = 1;
  for (let i = 1; i <= 5; i++) {
    const s = 0.008 * Math.pow(1.85, i - 1);
    const dd = field.eval(x + nx * s, y + ny * s, z + nz * s);
    occ += w * Math.max(0, s - dd) / s; w *= 0.62;
  }
  return Math.max(0.15, Math.min(1, 1 - occ * 0.55 * strength));
}

/**
 * Curvature from the field's Laplacian at a scale `s`: positive on ridges and edges (convex), negative
 * in creases. Plate armour uses it for worn bright edges, cloth and skin for darker creases.
 */
export function fieldCurvature(field, x, y, z, s = 0.006) {
  const c = field.eval(x, y, z) * 6;
  const sum = field.eval(x + s, y, z) + field.eval(x - s, y, z) + field.eval(x, y + s, z) + field.eval(x, y - s, z) + field.eval(x, y, z + s) + field.eval(x, y, z - s);
  return (sum - c) / (s * s) * 0.01;
}
