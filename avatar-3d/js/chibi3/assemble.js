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
import { meshField, filterTriangles, compact, fieldAO, fieldCurvature } from './mesher.js';
import { noise3 } from './sdf.js';
import { jointWeights, normalize } from './skin.js';

const tmpColor = new THREE.Color();
const linear = hex => { tmpColor.set(hex); return [tmpColor.r, tmpColor.g, tmpColor.b]; };

export class Assembler {
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
    const fields = this.layers.filter(l => l.kind === 'field' && this.inLod(l));
    const t0 = performance.now();
    for (const L of fields) {
      const t = performance.now();
      if (L.shape.buildIndex && !L.shape.idx) L.shape.buildIndex();
      const field = L.inflate ? { eval: (x, y, z) => L.shape.eval(x, y, z) - L.inflate } : L.shape;
      const step = L.stepFixed ? L.step : L.step * this.stepScale;
      const bounds = L.bounds || L.shape.bounds(step * 2);
      L.mesh = meshField(field, bounds, step, { project: this.lod === 0 ? 2 : 1, clip: L.keep || null });
      L.field = field;
      this.timings[L.name] = (this.timings[L.name] || 0) + Math.round(performance.now() - t);
      this.tris = this.tris || {}; this.tris[L.name] = (this.tris[L.name] || 0) + L.mesh.indices.length / 3;
    }
    // hidden-surface removal: drop triangles of hideable layers buried inside a covering layer
    const covers = fields.filter(l => l.covers);
    for (const L of fields) {
      if (!L.hideable || !covers.length) continue;
      const m = L.mesh, p = m.positions;
      const hidden = new Uint8Array(p.length / 3);
      for (let v = 0; v < hidden.length; v++) {
        const x = p[v * 3], y = p[v * 3 + 1], z = p[v * 3 + 2];
        for (const C of covers) if (C !== L && C.field.eval(x, y, z) < -(L.hideDepth ?? 0.0025)) { hidden[v] = 1; break; }
      }
      m.indices = filterTriangles(m.indices, p, (a, b, c) => !(hidden[a] && hidden[b] && hidden[c]));
      L.mesh = compact(m);
    }
    const all = { eval: (x, y, z) => { let d = 1e9; for (const L of fields) { const v = L.field.eval(x, y, z); if (v < d) d = v; } return d; } };
    for (const L of fields) out.push(this.attributesForField(L, all));
    for (const L of this.layers.filter(l => l.kind === 'geometry' && this.inLod(l))) out.push(this.attributesForGeometry(L, all));
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
      const ownerBone = owner === painter ? pa.bone : owner.paintAt(x, y, z).bone;
      let P = pa.paint || L.paint;
      if (L.paintFn) P = L.paintFn(x, y, z, P) || P;
      let c = linear(P.color);
      if (pa.other && pa.t > 0.001 && !L.paintFn) { const o = linear(pa.other.color); c = c.map((cv, i) => cv + (o[i] - cv) * pa.t); }
      if (P.vary) { const k = 1 + noise3(x * 9 + 3.1, y * 9, z * 9) * P.vary + noise3(x * 31, y * 31, z * 31 + 7) * P.vary * 0.4; c = c.map(cv => cv * k); }
      const ao = this.lod === 2 ? 1 : fieldAO(all, x, y, z, nx, ny, nz, L.aoStrength ?? 1);
      let wear = 0;
      if (P.wear && this.lod < 2) { const k = fieldCurvature(L.field, x, y, z, 0.005); wear = Math.max(0, Math.min(1, k * 2.2 - 0.25)) * P.wear * 0.55 * wearScale; if (k < -0.15) c = c.map(cv => cv * (1 + Math.max(-0.35, k * 0.25))); }
      color.set(c, v * 3);
      surf.set([P.tile ?? 0, P.rough ?? 0.7, P.metal ?? 0, ao], v * 4);
      extra.set([P.emissive || 0, P.sheen ?? 0, P.detail ?? 0.5, wear], v * 4);
      const w = L.weights ? L.weights(x, y, z, ownerBone) : jointWeights(this.rig, x, y, z, ownerBone || L.bone || 'chest');
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
      surf.set([P.tile ?? 0, P.rough ?? 0.7, P.metal ?? 0, ao], v * 4);
      extra.set([P.emissive || 0, P.sheen ?? 0, P.detail ?? 0.5, L.wear ?? 0], v * 4);
      const w = L.weights ? L.weights(x, y, z) : [[this.rig.byName[L.bone].index, 1]];
      writeWeights(si, sw, v, w);
    }
    return { positions, normals, indices: new Uint32Array(g.index.array), color, surf, extra, si, sw };
  }
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
