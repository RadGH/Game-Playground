// Chibi 3 capes: real cloth geometry (not a distance field — a cape is thinner than the grid), a
// two-sided sheet with a thick hem, hung from the shoulders on the cape spring chains.

import * as THREE from 'three';
import { paint, shadeHex } from './paint.js';
import { chainWeights, mixWeights } from './skin.js';

/**
 * Add a cape. `length` 0..1 (0.5 to the knees, 1 to the ankles), `flare` how much wider the hem is.
 * `tattered` cuts a ragged hem. Colours: a.cape.color outside, a.cape.color2 (or darker) lining.
 */
export function buildCape(ctx, { length = 0.85, flare = 0.45, tattered = false, collar = true } = {}) {
  const { a, R, asm } = ctx, L = ctx.L, S = L.S, W = L.W;
  const outer = a.cape?.color || '#3a4a8a', inner = a.cape?.color2 || shadeHex(outer, -0.35);
  const cols = 28, rows = 30;
  const topY = L.shoulder + 0.035 * S, hemY = L.ankle + (1 - length) * (L.hip - L.ankle) + 0.04 * S;
  const half = L.shX + 0.03 * S;
  const thick = 0.005 * S;
  // the top edge wraps round the back of the shoulders and comes forward over them
  const top = u => { const a2 = u * 1.25; return [Math.sin(a2) * half, topY - Math.abs(u) ** 2 * 0.02 * S, -Math.cos(a2) * 0.15 * S * W - 0.01 * S]; };
  const P = (u, v) => {
    const t = top(u), drop = topY - hemY;
    const spread = 1 + v * flare;
    const fold = Math.sin(u * Math.PI * 3.5 + 0.6) * 0.022 * S * v ** 1.2 + Math.sin(u * Math.PI * 7.3) * 0.006 * S * v;
    let y = t[1] - v * drop;
    if (tattered && v > 0.85) y += Math.abs(Math.sin(u * 23.1) * Math.sin(u * 7.7)) * 0.08 * S * (v - 0.85) / 0.15;
    // away from the back it falls clear of the buttocks and calves
    const back = -0.17 * S * W - v * 0.07 * S - Math.max(0, 0.6 - Math.abs(u)) * 0.02 * S;
    return [t[0] * spread + fold * 0.2 * Math.sign(u), y, (Math.abs(u) > 0.92 ? t[2] : 0) * (1 - v) + (Math.abs(u) > 0.92 ? back * v : back) + fold, u, v];
  };
  const positions = [], uvs = [], index = [];
  const grid = (sign) => {
    const base = positions.length / 3;
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
      const u = i / cols * 2 - 1, v = j / rows, p = P(u, v);
      positions.push(p[0], p[1], p[2]); uvs.push(u, v, sign);
    }
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const a0 = base + j * (cols + 1) + i, b0 = a0 + 1, c0 = a0 + cols + 1, d0 = c0 + 1;
      if (sign > 0) index.push(a0, c0, b0, b0, c0, d0); else index.push(a0, b0, c0, b0, d0, c0);
    }
    return base;
  };
  const outerBase = grid(1), innerBase = grid(-1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  // push the two sheets apart along their normals so the cloth has thickness
  const pos = g.attributes.position, nrm = g.attributes.normal, n = pos.count / 2;
  for (let i = 0; i < n; i++) {
    const o = outerBase + i, k = innerBase + i;
    pos.setXYZ(k, pos.getX(o) - nrm.getX(o) * thick, pos.getY(o) - nrm.getY(o) * thick, pos.getZ(o) - nrm.getZ(o) * thick);
  }
  g.computeVertexNormals();
  const out = paint('cloth', outer, { detail: 0.9 }), lin = paint('silk', inner);
  const meta = uvs;
  asm.addGeometry({ name: 'cape', geometry: g, bone: 'chest', paint: out,
    paintFn: (x, y, z, P0, v) => meta[v * 3 + 2] > 0 ? out : lin,
    weights: (x, y, z, v) => {
      const u = meta[v * 3], vv = meta[v * 3 + 1];
      const left = chainWeights(R, ['capeL1', 'capeL2', 'capeL3'], vv, 'chest'), right = chainWeights(R, ['capeR1', 'capeR2', 'capeR3'], vv, 'chest');
      return mixWeights(right, left, (u + 1) / 2);
    } });
  if (collar) {
    // a rolled collar where the cape gathers at the shoulders, with two clasps
    const c = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(Array.from({ length: 9 }, (_, i) => new THREE.Vector3(...top(-1.05 + i / 8 * 2.1)).add(new THREE.Vector3(0, 0.006 * S, 0.004 * S)))), 32, 0.014 * S, 10, false);
    asm.addGeometry({ name: 'capeCollar', geometry: c, bone: 'chest', paint: out });
    for (const s of [-1, 1]) {
      const p = top(s * 1.0), clasp = new THREE.CylinderGeometry(0.018 * S, 0.018 * S, 0.008 * S, 16);
      clasp.rotateX(Math.PI / 2); clasp.translate(p[0], p[1] - 0.01 * S, p[2] + 0.012 * S);
      asm.addGeometry({ name: 'clasp', geometry: clasp, bone: 'chest', paint: paint('gold', '#d0a848'), wear: 0.4 });
    }
  }
}
