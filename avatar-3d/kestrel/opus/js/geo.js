// Kestrel (opus) — the mesh builder every piece (body, face, hair, garments) is written through.
//
// A piece is a PARAMETRIC SURFACE: a function at(u, θ) → point (+ skin weights, colour, cover bits) sampled on a grid of
// rows (u) and columns (θ). The same function sampled again with an outward offset is a garment that fits the body under
// it and deforms with it exactly, because it carries the same skin weights at the same (u, θ). Everything goes into one
// vertex soup; `finish()` drops every triangle that an active garment covers (so skin under clothes is not drawn and
// cannot poke through), computes smooth normals, darkens concave places a little (cheap baked occlusion: grooves
// between muscles, the ear, the navel), compacts and returns one BufferGeometry → one draw call per character.
import * as THREE from 'three';
import { clamp } from './kmath.js';

export const COVER = { BRA: 1, BRIEFS: 2, SHIRT: 4, PANTS: 8, BOOTS: 16, SCALP: 32 };

export class MeshBuilder {
  constructor(boneIndex) {
    this.bi = boneIndex;            // bone name → index
    this.P = []; this.C = []; this.SI = []; this.SW = []; this.I = [];
    this.M = []; this.R = []; this.G = []; this.A = []; this.K = [];   // cover mask, roughness, glow, occlusion strength
    this.count = 0;
  }
  /** Add a vertex. w = [[boneName, weight], ...] (normalised here, top 4 kept). */
  v(p, c, w, mask = 0, rough = 0.6, glow = 0, ao = 0, conc = 0) {
    let ws = w && w.length ? w : [['root', 1]];
    if (ws.length > 4 || ws.some(e => e[1] <= 1e-4)) ws = ws.filter(e => e[1] > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
    let tot = 0; for (const e of ws) tot += e[1]; tot = tot || 1;
    for (let k = 0; k < 4; k++) {
      const e = ws[k];
      if (e) { const ix = this.bi[e[0]]; if (ix === undefined) throw new Error('kestrel: no bone ' + e[0]); this.SI.push(ix); this.SW.push(e[1] / tot); }
      else { this.SI.push(0); this.SW.push(0); }
    }
    this.P.push(p[0], p[1], p[2]); this.C.push(c[0], c[1], c[2]);
    this.M.push(mask); this.R.push(rough); this.G.push(glow); this.A.push(ao); this.K.push(conc);
    return this.count++;
  }
  t(a, b, c) { this.I.push(a, b, c); }

  /**
   * A sampled surface. spec:
   *   us: [u...] rows;  segs: columns per row;  wrap (default true): last column joins the first
   *   theta(j, segs): column → angle (default even spacing over 2π, or over [t0, t1] when not wrapping)
   *   at(u, θ) → { p:[x,y,z], w:[[bone,w]...] }   (required)
   *   color(u, θ, p) → linear rgb;  mask(u, θ, p) → cover bits;  rough, glow, ao: numbers or functions (u, θ, p)
   *   offset(u, θ, p) → metres pushed out along the surface normal (garments)
   *   capStart / capEnd: true → the first / last row collapses to ONE vertex (its average): poles, finger tips
   *   out(p, u, θ) → a direction that is "outside" (default: away from the row's centroid) — fixes the winding
   */
  surface(spec) {
    const us = spec.us, nu = us.length, segs = spec.segs, wrap = spec.wrap !== false;
    const cols = wrap ? segs : segs + 1;
    const thetaOf = spec.theta || ((j) => wrap ? j / segs * Math.PI * 2 : (spec.t0 ?? 0) + ((spec.t1 ?? Math.PI * 2) - (spec.t0 ?? 0)) * j / segs);
    const th = []; for (let j = 0; j < cols; j++) th.push(thetaOf(j, segs));
    // 1. sample
    const S = new Array(nu);
    for (let i = 0; i < nu; i++) { S[i] = new Array(cols); for (let j = 0; j < cols; j++) S[i][j] = spec.at(us[i], th[j]); }
    const P = (i, j) => S[i][j].p;
    // 2. grid normals (central differences, wrap aware), oriented outward
    const cent = S.map(row => { const c = [0, 0, 0]; for (const s of row) { c[0] += s.p[0]; c[1] += s.p[1]; c[2] += s.p[2]; } return c.map(x => x / row.length); });
    const N = new Array(nu);
    for (let i = 0; i < nu; i++) {
      N[i] = new Array(cols);
      const i0 = Math.max(0, i - 1), i1 = Math.min(nu - 1, i + 1);
      for (let j = 0; j < cols; j++) {
        const j0 = wrap ? (j - 1 + cols) % cols : Math.max(0, j - 1), j1 = wrap ? (j + 1) % cols : Math.min(cols - 1, j + 1);
        const a = P(i1, j), b = P(i0, j), c = P(i, j1), d = P(i, j0);
        let du = [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dt = [c[0] - d[0], c[1] - d[1], c[2] - d[2]];
        // a collapsed row (pole): use the neighbouring row's spread instead
        if (dt[0] * dt[0] + dt[1] * dt[1] + dt[2] * dt[2] < 1e-14) { const k = i === 0 ? 1 : i - 1; const c2 = P(k, j1), d2 = P(k, j0); dt = [c2[0] - d2[0], c2[1] - d2[1], c2[2] - d2[2]]; }
        let n = [du[1] * dt[2] - du[2] * dt[1], du[2] * dt[0] - du[0] * dt[2], du[0] * dt[1] - du[1] * dt[0]];
        const o = spec.out ? spec.out(P(i, j), us[i], th[j]) : [P(i, j)[0] - cent[i][0], P(i, j)[1] - cent[i][1], P(i, j)[2] - cent[i][2]];
        if (n[0] * o[0] + n[1] * o[1] + n[2] * o[2] < 0) n = [-n[0], -n[1], -n[2]];
        const l = Math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]) || 1; N[i][j] = [n[0] / l, n[1] / l, n[2] / l];
      }
    }
    // 2b. concavity from the grid's own second derivatives (spacing-aware, so uneven rows do not band)
    const K = new Array(nu);
    const LC = spec.aoScale ?? 0.012;
    for (let i = 0; i < nu; i++) {
      K[i] = new Array(cols).fill(0);
      if (!spec.ao) continue;
      for (let j = 0; j < cols; j++) {
        const n = N[i][j], p = P(i, j);
        let k = 0;
        const sec = (a, b) => {   // second derivative along a line through p (a before, b after)
          const d0 = [p[0] - a[0], p[1] - a[1], p[2] - a[2]], d1 = [b[0] - p[0], b[1] - p[1], b[2] - p[2]];
          const h0 = Math.sqrt(d0[0] * d0[0] + d0[1] * d0[1] + d0[2] * d0[2]), h1 = Math.sqrt(d1[0] * d1[0] + d1[1] * d1[1] + d1[2] * d1[2]);
          if (h0 < 1e-6 || h1 < 1e-6) return 0;
          const dd = [(d1[0] / h1 - d0[0] / h0) * 2 / (h0 + h1), (d1[1] / h1 - d0[1] / h0) * 2 / (h0 + h1), (d1[2] / h1 - d0[2] / h0) * 2 / (h0 + h1)];
          return dd[0] * n[0] + dd[1] * n[1] + dd[2] * n[2];
        };
        if (i > 0 && i < nu - 1 && !(i === 1 && spec.capStart) && !(i === nu - 2 && spec.capEnd)) k += sec(P(i - 1, j), P(i + 1, j));
        if (wrap || (j > 0 && j < cols - 1)) k += sec(P(i, wrap ? (j - 1 + cols) % cols : j - 1), P(i, wrap ? (j + 1) % cols : j + 1));
        K[i][j] = k * LC;
      }
    }
    // 3. emit vertices (offset along the normal for garments)
    const fn = (f, u, t, p, d) => typeof f === 'function' ? f(u, t, p) : (f ?? d);
    const idx = new Array(nu);
    const emit = (i, j, pOverride) => {
      const s = S[i][j], u = us[i], t = Math.atan2(Math.sin(th[j]), Math.cos(th[j]));   // colour/mask see -π..π
      let p = pOverride || s.p;
      const off = spec.offset ? spec.offset(u, t, p) : 0;
      if (off) { const n = N[i][j]; p = [p[0] + n[0] * off, p[1] + n[1] * off, p[2] + n[2] * off]; }
      let c = spec.color ? spec.color(u, t, s.p, s) : [0.5, 0.5, 0.5];
      // painted form shading (opt-in): a soft key from the upper front baked into the colour, so forms read under flat light
      if (spec.shade) {
        const n = N[i][j], k = Math.max(0, n[0] * 0.25 + n[1] * 0.45 + n[2] * 0.86);
        const f = 1 - spec.shade * (1 - k) * 0.5 + spec.shade * 0.06;
        c = [c[0] * f, c[1] * (f * 0.985 + 0.015 * (f > 1 ? 1 : f)), c[2] * f * (f < 1 ? 0.97 : 1)];
      }
      return this.v(p, c, s.w, fn(spec.mask, u, t, s.p, 0), fn(spec.rough, u, t, s.p, 0.6), fn(spec.glow, u, t, s.p, 0), fn(spec.ao, u, t, s.p, 0), K[i][j]);
    };
    for (let i = 0; i < nu; i++) {
      const pole = (i === 0 && spec.capStart) || (i === nu - 1 && spec.capEnd);
      if (pole) {
        const c = cent[i];
        const k = emit(i, 0, c);
        // a pole's normal is the average of its row's normals
        idx[i] = new Array(cols).fill(k);
      } else { idx[i] = new Array(cols); for (let j = 0; j < cols; j++) idx[i][j] = emit(i, j); }
    }
    // 4. triangles, each quad wound to face along the outward normal
    const pos = this.P;
    const facing = (a, b, c, n) => {
      const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
      const e1 = [pos[b * 3] - ax, pos[b * 3 + 1] - ay, pos[b * 3 + 2] - az], e2 = [pos[c * 3] - ax, pos[c * 3 + 1] - ay, pos[c * 3 + 2] - az];
      const x = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      return x[0] * n[0] + x[1] * n[1] + x[2] * n[2];
    };
    const t0 = this.I.length;
    const jn = wrap ? cols : cols - 1;
    for (let i = 0; i < nu - 1; i++) for (let j = 0; j < jn; j++) {
      const j1 = (j + 1) % cols;
      const a = idx[i][j], b = idx[i + 1][j], c = idx[i][j1], d = idx[i + 1][j1];
      const n = N[i][j], n2 = N[i + 1][j1];
      const nn = [n[0] + n2[0], n[1] + n2[1], n[2] + n2[2]];
      const tri = (x, y, z) => { if (x === y || y === z || x === z) return; if (facing(x, y, z, nn) >= 0) this.t(x, y, z); else this.t(x, z, y); };
      tri(a, b, d); tri(a, d, c);
    }
    const key = (spec.name || '?').replace(/[LR0-9]+$/, '');
    (this.tally ||= {})[key] = (this.tally[key] || 0) + (this.I.length - t0) / 3;
    return idx;
  }

  /**
   * Build the BufferGeometry. `hide` = cover bits of the garments that are worn: a triangle whose three corners are all
   * covered by a worn garment is dropped. Normals are computed BEFORE dropping, so the edge of the skin that tucks under a
   * garment keeps its smooth shading. Returns { geometry, triangles }.
   */
  finish(hide = 0, { occlusion = 1 } = {}) {
    const nV = this.count, P = this.P, I = this.I;
    // smooth normals over every triangle (area weighted)
    const Nn = new Float32Array(nV * 3);
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t], b = I[t + 1], c = I[t + 2];
      const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
      const e1x = P[b * 3] - ax, e1y = P[b * 3 + 1] - ay, e1z = P[b * 3 + 2] - az;
      const e2x = P[c * 3] - ax, e2y = P[c * 3 + 1] - ay, e2z = P[c * 3 + 2] - az;
      const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
      for (const v of [a, b, c]) { Nn[v * 3] += nx; Nn[v * 3 + 1] += ny; Nn[v * 3 + 2] += nz; }
    }
    for (let v = 0; v < nV; v++) { const l = Math.sqrt(Nn[v * 3] * Nn[v * 3] + Nn[v * 3 + 1] * Nn[v * 3 + 1] + Nn[v * 3 + 2] * Nn[v * 3 + 2]) || 1; Nn[v * 3] /= l; Nn[v * 3 + 1] /= l; Nn[v * 3 + 2] /= l; }
    // baked occlusion: concave places (grooves between muscles, the ear, the navel) darker, ridges a touch lighter.
    // The concavity comes from each surface's own grid (surface() above), smoothed once over the mesh.
    const C = this.C.slice();
    if (occlusion) {
      const sum = new Float32Array(nV), cnt = new Uint16Array(nV);
      for (let t = 0; t < I.length; t += 3) for (let k = 0; k < 3; k++) { const a = I[t + k], b = I[t + (k + 1) % 3]; sum[a] += this.K[b]; cnt[a]++; sum[b] += this.K[a]; cnt[b]++; }
      for (let v = 0; v < nV; v++) {
        const a = this.A[v]; if (!a) continue;
        const kk = cnt[v] ? (this.K[v] * 0.5 + 0.5 * sum[v] / cnt[v]) : this.K[v];
        const k = clamp(kk * 0.9, -0.4, 1);
        const f = k > 0 ? 1 - a * 0.62 * k : 1 + a * 0.14 * -k;
        C[v * 3] *= f; C[v * 3 + 1] *= f * (k > 0 ? 0.97 : 1); C[v * 3 + 2] *= f * (k > 0 ? 0.95 : 1);
      }
    }
    // drop covered triangles, compact
    const keep = [];
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t], b = I[t + 1], c = I[t + 2];
      if (hide && (this.M[a] & hide) && (this.M[b] & hide) && (this.M[c] & hide)) continue;
      keep.push(a, b, c);
    }
    const remap = new Int32Array(nV).fill(-1); let n = 0;
    for (const v of keep) if (remap[v] < 0) remap[v] = n++;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), ex = new Float32Array(n * 2);
    for (let v = 0; v < nV; v++) {
      const r = remap[v]; if (r < 0) continue;
      for (let k = 0; k < 3; k++) { pos[r * 3 + k] = P[v * 3 + k]; nor[r * 3 + k] = Nn[v * 3 + k]; col[r * 3 + k] = C[v * 3 + k]; }
      for (let k = 0; k < 4; k++) { si[r * 4 + k] = this.SI[v * 4 + k]; sw[r * 4 + k] = this.SW[v * 4 + k]; }
      ex[r * 2] = this.R[v]; ex[r * 2 + 1] = this.G[v];
    }
    const index = n > 65535 ? new Uint32Array(keep.length) : new Uint16Array(keep.length);
    for (let i = 0; i < keep.length; i++) index[i] = remap[keep[i]];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    g.setAttribute('kestrelSurf', new THREE.BufferAttribute(ex, 2));       // x = roughness, y = glow (see material.js)
    g.setIndex(new THREE.BufferAttribute(index, 1));
    return { geometry: g, triangles: keep.length / 3, vertices: n };
  }
}
