// Chibi 3 assembler: layers of distance fields and ordinary geometry -> ONE skinned BufferGeometry.
//
// Each layer is meshed on its own grid (the face finer than the back), then every vertex is given:
//   - its paint (colour and surface) from the primitive that owns it,
//   - ambient occlusion measured from ALL layers (an arm darkens the ribs it hangs beside),
//   - edge wear from the field's curvature (plate edges polish, creases darken),
//   - skin weights (skin.js), or a layer's own weighting (cape, skirt, hair chains).
// Layers that sit UNDER an opaque layer lose the triangles nobody can see (a knight's torso under
// his breastplate), which is most of what keeps a dressed character inside its triangle budget.

import * as THREE from 'three';
import { meshField, filterTriangles, compact, fieldAO, fieldCurvature, Grid } from './mesher.js';
import { noise3 } from './sdf.js';
import { decimate } from './decimate.js';
import { jointWeights, normalize } from './skin.js';

const tmpColor = new THREE.Color();
const linear = hex => { tmpColor.set(hex); return [tmpColor.r, tmpColor.g, tmpColor.b]; };

export class Assembler {
  /** Debug switches (the dev page sets them): noSimplify, noHide, skip: [layer names]. */
  static debug = { noSimplify: false, noHide: false, skip: [] };
  /** `rig` from layoutRig(). `lod` 0 (hero), 1, 2 (crowd). */
  constructor(rig, { lod = 0 } = {}) {
    this.rig = rig; this.lod = lod; this.layers = []; this.meshes = []; this.timings = {};
    this.stepScale = [1, 2.1, 3.6][lod];
  }
  /**
   * A distance-field layer.
   *   shape     the field to mesh (a Shape)
   *   owner     the Shape that says who owns each vertex (bones + paint); default `shape`
   *   paintFrom the Shape whose paint colours it; default `shape` (a garment colours itself, but
   *             takes its bones from the body underneath)
   *   step      grid spacing at LOD 0 (metres)
   *   bounds    region to mesh; default the shape's bounds
   *   keep      (x, y, z) => boolean — triangles with no kept vertex are dropped (region seams)
   *   inflate   metres added outward (a fine region drawn over a coarse one)
   *   weights   (x, y, z, ownerBone) => [[boneIndex, w], ...] to override joint weights
   *   covers    true: this layer hides the parts of `hideable` layers inside it
   *   hideable  true: triangles buried under a covering layer are removed
   *   minLod/maxLod   which levels of detail include it
   */
  addField(spec) { this.layers.push({ kind: 'field', ...spec }); return this; }
  /** Ordinary geometry already in bind space (a sword, an eyelid, a tusk). */
  addGeometry(spec) { this.layers.push({ kind: 'geometry', ...spec }); return this; }

  build() {
    const rig = this.rig, out = [];
    const fields = this.layers.filter(l => l.kind === 'field' && this.inLod(l) && !Assembler.debug.skip.includes(l.name));
    const t0 = performance.now();
    for (const L of fields) {
      const t = performance.now();
      // (re)index the shape and every shape it is built on: adding a primitive drops an index
      for (let sh = L.shape; sh; sh = sh.base) if (sh.buildIndex && !sh.idx && !sh.unindexed) sh.buildIndex();
      const inf = L.inflate || 0;
      const field = inf ? { eval: (x, y, z) => L.shape.eval(x, y, z) - inf } : L.shape;
      const fill = L.shape.baseFast ? { eval: (x, y, z) => L.shape.evalFast(x, y, z) - inf } : null;
      const step = L.stepFixed ? L.step : L.step * this.stepScale;
      const bounds = L.bounds || L.shape.bounds(step * 2);
      L.mesh = meshField(field, bounds, step, { project: 1, clip: L.keep || null, fill, grid: L.grid && this.lod === 0 ? L.grid : null });
      L.field = field;
      // simplify: flat stretches lose triangles, curves keep them (decimate.js)
      if (L.simplify !== 0 && !Assembler.debug.noSimplify) {
        const grid = L.mesh.grid;
        L.mesh = decimate(L.mesh, { maxError: (L.simplify ?? 0.0006) * [1, 2.6, 6][this.lod], field, pin: this.lod < 2 ? paintBorders(L) : null });
        L.mesh.grid = grid;
      }
      this.timings[L.name] = (this.timings[L.name] || 0) + Math.round(performance.now() - t);
      this.tris = this.tris || {}; this.tris[L.name] = (this.tris[L.name] || 0) + L.mesh.indices.length / 3;
    }
    // hidden-surface removal: drop triangles of hideable layers buried inside a covering layer.
    // Each layer's own sampled grid answers "how deep inside am I" (cheap, and exact enough).
    const covers = fields.filter(l => l.covers);
    const tHide = performance.now();
    for (const L of fields) {
      if (!L.hideable || !covers.length || Assembler.debug.noHide) continue;
      const m = L.mesh, p = m.positions;
      const hidden = new Uint8Array(p.length / 3), depth = -(L.hideDepth ?? 0.0025);
      for (let v = 0; v < hidden.length; v++) {
        const x = p[v * 3], y = p[v * 3 + 1], z = p[v * 3 + 2];
        for (const C of covers) if (C !== L && C.mesh.grid.sample(x, y, z) < depth) { hidden[v] = 1; break; }
      }
      m.indices = filterTriangles(m.indices, p, (a, b, c) => !(hidden[a] && hidden[b] && hidden[c]));
      L.mesh = compact(m);
    }
    this.timings.hide = Math.round(performance.now() - tHide);
    // one coarse grid holding the nearest surface of EVERY layer, for ambient occlusion; each vertex
    // also asks its own layer's finer grid, so small creases still darken
    const tOcc = performance.now();
    let ob = null;
    for (const L of fields) { const g = L.mesh.grid, hi = g.min.map((v, i) => v + (g.n[i] - 1) * g.step); const b = [...g.min, ...hi]; ob = ob ? [Math.min(ob[0], b[0]), Math.min(ob[1], b[1]), Math.min(ob[2], b[2]), Math.max(ob[3], b[3]), Math.max(ob[4], b[4]), Math.max(ob[5], b[5])] : b; }
    const occ = new Grid(ob || [0, 0, 0, 1, 1, 1], this.lod === 0 ? 0.018 : 0.03);
    {
      const [nx, ny, nz] = occ.n, h = occ.step, d = occ.data; let i = 0;
      const gridBounds = fields.map(L => { const g = L.mesh.grid; return [g.min, g.min.map((v, k) => v + (g.n[k] - 1) * g.step), g]; });
      for (let k = 0; k < nz; k++) { const z = occ.min[2] + k * h; for (let j = 0; j < ny; j++) { const y = occ.min[1] + j * h; for (let ii = 0; ii < nx; ii++) {
        const x = occ.min[0] + ii * h; let v = 0.2;
        for (const [lo, hi, g] of gridBounds) if (x >= lo[0] && y >= lo[1] && z >= lo[2] && x <= hi[0] && y <= hi[1] && z <= hi[2]) { const s2 = g.sample(x, y, z); if (s2 < v) v = s2; }
        d[i++] = v;
      } } }
    }
    this.timings.occlusion = Math.round(performance.now() - tOcc);
    for (const L of fields) { const g = L.mesh.grid; L.aoField = { eval: (x, y, z) => Math.min(occ.sample(x, y, z), g.sample(x, y, z)) }; }
    const all = { eval: (x, y, z) => occ.sample(x, y, z) };
    const tAttr = performance.now();
    for (const L of fields) out.push(this.attributesForField(L, all));
    for (const L of this.layers.filter(l => l.kind === 'geometry' && this.inLod(l))) out.push(this.attributesForGeometry(L, all));
    this.timings.attributes = Math.round(performance.now() - tAttr);
    this.timings.total = Math.round(performance.now() - t0);
    return merge(out.filter(Boolean));
  }
  inLod(l) { return this.lod >= (l.minLod ?? 0) && this.lod <= (l.maxLod ?? 2); }

  attributesForField(L, all) {
    const m = L.mesh, n = m.positions.length / 3;
    if (!n) return null;
    const color = new Float32Array(n * 3), surf = new Float32Array(n * 4), extra = new Float32Array(n * 4), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    const owner = L.owner || L.shape, painter = L.paintFrom || L.shape;
    const wearScale = this.lod === 0 ? 1 : 0.6;
    for (let v = 0; v < n; v++) {
      const x = m.positions[v * 3], y = m.positions[v * 3 + 1], z = m.positions[v * 3 + 2];
      const nx = m.normals[v * 3], ny = m.normals[v * 3 + 1], nz = m.normals[v * 3 + 2];
      const pa = painter.paintAt(x, y, z);
      // A garment takes its bones from the SKIN DIRECTLY UNDER IT (the point found by stepping down
      // the body's distance field), not from whatever muscle is nearest the cloth: otherwise a sleeve
      // over the deltoid follows the chest while the skin follows the arm, and the shoulder pokes
      // through the moment the arm moves.
      let px = x, py = y, pz = z;
      if (owner !== painter && this.bodyField) {
        const bf = this.bodyField, e = 0.002;
        for (let it = 0; it < 2; it++) {
          const d0 = bf.eval(px, py, pz);
          if (Math.abs(d0) < 0.0015 || d0 > 0.08) break;
          const gx = bf.eval(px + e, py, pz) - bf.eval(px - e, py, pz), gy = bf.eval(px, py + e, pz) - bf.eval(px, py - e, pz), gz = bf.eval(px, py, pz + e) - bf.eval(px, py, pz - e);
          const gl = Math.hypot(gx, gy, gz) || 1;
          px -= gx / gl * d0; py -= gy / gl * d0; pz -= gz / gl * d0;
        }
      }
      const ownerBone = owner === painter ? pa.bone : owner.paintAt(px, py, pz).bone;
      let P = pa.paint || L.paint;
      if (L.paintFn) P = L.paintFn(x, y, z, P) || P;
      let c = linear(P.color);
      if (pa.other && pa.t > 0.001 && !L.paintFn) { const o = linear(pa.other.color); c = c.map((cv, i) => cv + (o[i] - cv) * pa.t); }
      if (P.vary) { const k = 1 + noise3(x * 9 + 3.1, y * 9, z * 9) * P.vary + noise3(x * 31, y * 31, z * 31 + 7) * P.vary * 0.4; c = c.map(cv => cv * k); }
      const ao = this.lod === 2 ? 1 : fieldAO(L.aoField, x, y, z, nx, ny, nz, L.aoStrength ?? 1);
      let wear = 0;
      if (P.wear && this.lod < 2) { const k = fieldCurvature(L.mesh.grid.asField(), x, y, z, Math.max(0.005, L.mesh.grid.step)); wear = Math.max(0, Math.min(1, k * 2.2 - 0.25)) * P.wear * 0.55 * wearScale; if (k < -0.15) c = c.map(cv => cv * (1 + Math.max(-0.35, k * 0.25))); }
      color.set(c, v * 3);
      surf.set([(P.tile ?? 0) / 255, P.rough ?? 0.7, P.metal ?? 0, ao], v * 4);
      extra.set([Math.min(1, (P.emissive || 0) / 2), Math.min(1, P.sheen ?? 0), Math.min(1, P.detail ?? 0.5), Math.min(1, wear)], v * 4);
      const w = L.weights ? L.weights(x, y, z, ownerBone, px, py, pz) : jointWeights(this.rig, px, py, pz, ownerBone || L.bone || 'chest');
      writeWeights(si, sw, v, w);
    }
    return { positions: m.positions, normals: m.normals, indices: m.indices, color, surf, extra, si, sw };
  }

  attributesForGeometry(L, all) {
    const g = L.geometry.index ? L.geometry : indexed(L.geometry);
    const p = g.attributes.position, nrm = g.attributes.normal, n = p.count;
    const positions = new Float32Array(p.array), normals = new Float32Array(nrm.array);
    const color = new Float32Array(n * 3), surf = new Float32Array(n * 4), extra = new Float32Array(n * 4), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    const vcol = g.attributes.color;
    for (let v = 0; v < n; v++) {
      const x = positions[v * 3], y = positions[v * 3 + 1], z = positions[v * 3 + 2];
      const P = L.paintFn ? L.paintFn(x, y, z, L.paint, v) : L.paint;
      let c = vcol ? [vcol.getX(v), vcol.getY(v), vcol.getZ(v)] : linear(P.color);
      if (P.vary) { const k = 1 + noise3(x * 9, y * 9, z * 9) * P.vary; c = c.map(cv => cv * k); }
      color.set(c, v * 3);
      const ao = L.ao === false || this.lod === 2 ? 1 : fieldAO(all, x, y, z, normals[v * 3], normals[v * 3 + 1], normals[v * 3 + 2], 0.5);
      surf.set([(P.tile ?? 0) / 255, P.rough ?? 0.7, P.metal ?? 0, ao], v * 4);
      extra.set([Math.min(1, (P.emissive || 0) / 2), Math.min(1, P.sheen ?? 0), Math.min(1, P.detail ?? 0.5), Math.min(1, L.wear ?? 0)], v * 4);
      const w = L.weights ? L.weights(x, y, z, v) : [[this.rig.byName[L.bone].index, 1]];
      writeWeights(si, sw, v, w);
    }
    return { positions, normals, indices: new Uint32Array(g.index.array), color, surf, extra, si, sw };
  }
}

/**
 * Vertices on a paint border (a trim, a cross, the edge of the lips) are pinned for the simplifier,
 * because colour lives on the vertices: thin the triangles across a border and the border smears.
 */
function paintBorders(L) {
  const m = L.mesh, n = m.positions.length / 3, painter = L.paintFrom || L.shape;
  if (!painter.paintAt || L.paintFn) return null;
  const ids = new Map(), key = new Int32Array(n);
  const idOf = p => { if (!p) return 0; let i = ids.get(p); if (i == null) { i = ids.size + 1; ids.set(p, i); } return i; };
  for (let v = 0; v < n; v++) {
    const pa = painter.paintAt(m.positions[v * 3], m.positions[v * 3 + 1], m.positions[v * 3 + 2]);
    key[v] = idOf(pa.paint) * 4096 + (pa.t > 0.25 ? idOf(pa.other) : 0);
  }
  if (ids.size < 2) return null;
  const pin = new Uint8Array(n), I = m.indices, P = m.positions;
  // each border vertex moves to where its nearest border-crossing edge actually crosses (found by
  // bisection), then back onto the surface: the colour edge becomes a smooth line, not a staircase
  const target = new Float32Array(n * 3), best = new Float32Array(n).fill(9);
  const keyAt = (x, y, z) => { const pa = painter.paintAt(x, y, z); return idOf(pa.paint) * 4096 + (pa.t > 0.25 ? idOf(pa.other) : 0); };
  const consider = (a, b) => {
    if (key[a] === key[b]) return;
    let lo = 0, hi = 1;
    const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2], dx = P[b * 3] - ax, dy = P[b * 3 + 1] - ay, dz = P[b * 3 + 2] - az;
    for (let i = 0; i < 5; i++) { const t = (lo + hi) / 2; if (keyAt(ax + dx * t, ay + dy * t, az + dz * t) === key[a]) lo = t; else hi = t; }
    const t = (lo + hi) / 2, len = Math.hypot(dx, dy, dz);
    // the vertex nearer the crossing takes it (staying a hair on its own side)
    if (t < 0.5 && t * len < best[a]) { best[a] = t * len; const s = Math.max(0, t - 0.04); target.set([ax + dx * s, ay + dy * s, az + dz * s], a * 3); }
    if (t >= 0.5 && (1 - t) * len < best[b]) { best[b] = (1 - t) * len; const s = Math.min(1, t + 0.04); target.set([ax + dx * s, ay + dy * s, az + dz * s], b * 3); }
  };
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2];
    if (key[a] !== key[b] || key[b] !== key[c] || key[a] !== key[c]) { pin[a] = pin[b] = pin[c] = 1; consider(a, b); consider(b, c); consider(c, a); }
  }
  const f = L.field;
  for (let v = 0; v < n; v++) {
    if (best[v] > 8) continue;
    let x = target[v * 3], y = target[v * 3 + 1], z = target[v * 3 + 2];
    if (f) { const e = 0.0004, d0 = f.eval(x, y, z), gx = (f.eval(x + e, y, z) - f.eval(x - e, y, z)) / (2 * e), gy = (f.eval(x, y + e, z) - f.eval(x, y - e, z)) / (2 * e), gz = (f.eval(x, y, z + e) - f.eval(x, y, z - e)) / (2 * e), g2 = gx * gx + gy * gy + gz * gz; if (g2 > 1e-8 && Math.abs(d0) < 0.01) { x -= d0 * gx / g2; y -= d0 * gy / g2; z -= d0 * gz / g2; } }
    P[v * 3] = x; P[v * 3 + 1] = y; P[v * 3 + 2] = z;
  }
  return pin;
}

function writeWeights(si, sw, v, w) {
  const list = normalize(w);
  for (let k = 0; k < 4; k++) { si[v * 4 + k] = list[k]?.[0] ?? 0; sw[v * 4 + k] = list[k]?.[1] ?? 0; }
}
function indexed(g) { g.setIndex(Array.from({ length: g.attributes.position.count }, (_, i) => i)); return g; }

/** Concatenate the per-layer arrays into one geometry. */
function merge(parts) {
  let nv = 0, ni = 0;
  for (const p of parts) { nv += p.positions.length / 3; ni += p.indices.length; }
  const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), col = new Float32Array(nv * 3), surf = new Float32Array(nv * 4), extra = new Float32Array(nv * 4);
  const si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4), idx = new Uint32Array(ni);
  let ov = 0, oi = 0;
  for (const p of parts) {
    const n = p.positions.length / 3;
    pos.set(p.positions, ov * 3); nrm.set(p.normals, ov * 3); col.set(p.color, ov * 3); surf.set(p.surf, ov * 4); extra.set(p.extra, ov * 4); si.set(p.si, ov * 4); sw.set(p.sw, ov * 4);
    for (let i = 0; i < p.indices.length; i++) idx[oi + i] = p.indices[i] + ov;
    ov += n; oi += p.indices.length;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('surf', new THREE.BufferAttribute(surf, 4));
  g.setAttribute('extra', new THREE.BufferAttribute(extra, 4));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}
