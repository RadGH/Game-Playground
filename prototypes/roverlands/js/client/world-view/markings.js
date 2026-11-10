// Road and airfield paint (Wayfare County): the lines that make asphalt read as a road and concrete as a runway.
//
//   highways   white edge lines + a dashed yellow centre line (4 m on, 8 m off)
//   lanes      a dashed white centre line (3 m on, 6 m off); the switchback a solid yellow one (no passing)
//   runway     white edge lines, 30 m centre dashes, threshold bars and touchdown blocks at both ends
//   taxiway    a solid yellow centre line          launch pad   a yellow ring and cross
//
// Paint is thin quads a few centimetres over the ground, merged into one mesh per 128 m cell (the ground's own chunk
// grid) and shown only while that cell's ground is drawn at its finest level — the coarser ground levels can sit a
// little above or below the true heights, and paint would then float or vanish. Lines stop short of junctions (any
// point within reach of another paved road), and bridges are skipped (their decks are planks).
// Nothing here is shared with the physics or the room: it is looks only. The classic map gets an empty group.

import * as THREE from 'three';
import { enhance } from '../../../../../highdef-3d/js/materials.js';

const CELL = 128;
const WHITE = [0.86, 0.86, 0.84], YELLOW = [0.88, 0.66, 0.16];

export function createMarkings(world, quality, { csm } = {}) {
  const group = new THREE.Group();
  group.name = 'markings';
  const empty = { group, count: 0, meshes: 0, update() {}, dispose() {} };
  if (world.map !== 'county') return empty;

  const half = world.size / 2, per = Math.ceil(world.size / CELL);
  const cells = new Map();           // cell key -> { P, C, I }
  const lift = 0.035;
  let quads = 0;
  const cellOf = (x, z) => Math.floor((x + half) / CELL) * 1000 + Math.floor((z + half) / CELL);
  /** One quad a..d (each [x, z]) in a colour, into the cell of its first corner. */
  function quad(a, b, c, d, col) {
    const key = cellOf((a[0] + c[0]) / 2, (a[1] + c[1]) / 2);
    let g = cells.get(key);
    if (!g) cells.set(key, g = { P: [], C: [], I: [] });
    const base = g.P.length / 3;
    for (const v of [a, b, c, d]) { g.P.push(v[0], world.heightAt(v[0], v[1]) + lift, v[1]); g.C.push(col[0], col[1], col[2]); }
    g.I.push(base, base + 2, base + 1, base, base + 3, base + 2);
    quads++;
  }

  // ---- roads ------------------------------------------------------------------------------------------------------
  // a hash of every paved road point, to stop lines short of junctions
  const paved = world.roads.filter(r => r.kind !== 'bridge' && (r.cls === 'highway' || r.cls === 'lane' || r.cls === 'street'));
  const H = 16, grid = new Map();
  for (const r of paved) for (const p of r.pts) {
    const k = Math.floor(p[0] / H) * 100000 + Math.floor(p[1] / H);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(p[0], p[1], r.halfW, r.id);
  }
  const nearOther = (x, z, id) => {
    const gi = Math.floor(x / H), gj = Math.floor(z / H);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const L = grid.get((gi + di) * 100000 + gj + dj); if (!L) continue;
      for (let q = 0; q < L.length; q += 4) {
        if (L[q + 3] === id) continue;
        const dx = L[q] - x, dz = L[q + 1] - z, r = L[q + 2] + 2.5;
        if (dx * dx + dz * dz < r * r) return true;
      }
    }
    return false;
  };
  /** A polyline at 1 m steps with a unit normal at every point. */
  function dense(pts) {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.sqrt(dx * dx + dz * dz);
      const n = Math.max(1, Math.round(L));
      for (let s = 0; s < n; s++) out.push([a[0] + dx * s / n, a[1] + dz * s / n]);
    }
    out.push([pts[pts.length - 1][0], pts[pts.length - 1][1]]);
    for (let i = 0; i < out.length; i++) {
      const a = out[Math.max(0, i - 2)], b = out[Math.min(out.length - 1, i + 2)];
      const tx = b[0] - a[0], tz = b[1] - a[1], l = Math.sqrt(tx * tx + tz * tz) || 1;
      out[i].push(-tz / l, tx / l);
    }
    return out;
  }
  /** Paint a line `off` m right of the centre, `w` wide, `on` m painted then `gap` m bare (gap 0 = solid). */
  function line(d, off, w, on, gap, col, ok = () => true) {
    const period = on + gap;
    for (let i = 0; i < d.length - 1; i++) {
      if (gap > 0 && (i % period) >= on) continue;
      if (!ok(i)) continue;
      const p = d[i], q = d[i + 1];
      const o0 = off - w / 2, o1 = off + w / 2;
      quad([p[0] + p[2] * o0, p[1] + p[3] * o0], [p[0] + p[2] * o1, p[1] + p[3] * o1], [q[0] + q[2] * o1, q[1] + q[3] * o1], [q[0] + q[2] * o0, q[1] + q[3] * o0], col);
    }
  }
  for (const r of paved) {
    if (r.cls === 'street') continue;
    const d = dense(r.pts);
    // stop short of junctions: a point where another paved road is within reach is bare, with 6 m of margin
    const bare = new Uint8Array(d.length);
    for (let i = 0; i < d.length; i += 2) if (nearOther(d[i][0], d[i][1], r.id)) for (let k = Math.max(0, i - 6); k <= Math.min(d.length - 1, i + 6); k++) bare[k] = 1;
    const ok = (i) => !bare[i] && !bare[i + 1];
    if (r.cls === 'highway') {
      line(d, 0, 0.16, 4, 8, YELLOW, ok);
      line(d, r.halfW - 0.45, 0.16, 1, 0, WHITE, ok);
      line(d, -(r.halfW - 0.45), 0.16, 1, 0, WHITE, ok);
    } else if (r.kind === 'switchback') {
      line(d, -0.12, 0.11, 1, 0, YELLOW, ok);
      line(d, 0.12, 0.11, 1, 0, YELLOW, ok);
    } else {
      line(d, 0, 0.13, 3, 6, WHITE, ok);
    }
  }

  // ---- the airfield ---------------------------------------------------------------------------------------------
  const rw = world.sites.runway;
  if (rw) {
    const z = rw.z0, hw = rw.w / 2;
    const rect = (x0, z0, x1, z1, col) => quad([x0, z0], [x0, z1], [x1, z1], [x1, z0], col);
    const seg = 4;                                       // long lines in 4 m pieces so they follow the ground
    for (let x = rw.x0 + 2; x < rw.x1 - 2; x += seg) {
      const x1 = Math.min(rw.x1 - 2, x + seg);
      rect(x, z - hw + 0.8, x1, z - hw + 1.7, WHITE);
      rect(x, z + hw - 1.7, x1, z + hw - 0.8, WHITE);
    }
    // centre line: 30 m dashes, 20 m gaps, clear of the threshold bars
    for (let x = rw.x0 + 70; x < rw.x1 - 70; x += 50) for (let s = 0; s < 30; s += seg) rect(x + s, z - 0.45, Math.min(x + 30, x + s + seg), z + 0.45, WHITE);
    for (const [end, dir] of [[rw.x0, 1], [rw.x1, -1]]) {
      // threshold bars: eight a side, 30 m long
      for (let b = 0; b < 8; b++) for (const side of [-1, 1]) {
        const zc = z + side * (1.8 + b * 1.6);
        if (Math.abs(zc - z) > hw - 2.4) continue;
        for (let s = 0; s < 30; s += seg) { const xa = end + dir * (6 + s), xb = end + dir * (6 + Math.min(30, s + seg)); rect(Math.min(xa, xb), zc - 0.55, Math.max(xa, xb), zc + 0.55, WHITE); }
      }
      // touchdown blocks 150 m in
      for (const side of [-1, 1]) for (let s = 0; s < 44; s += seg) {
        const xa = end + dir * (150 + s), xb = end + dir * (150 + Math.min(44, s + seg));
        rect(Math.min(xa, xb), z + side * 4.5 - 1.6, Math.max(xa, xb), z + side * 4.5 + 1.6, WHITE);
      }
    }
    const tw = world.sites.airport?.taxiway;
    if (tw) for (let x = tw.x0; x < tw.x1; x += seg) rect(x, tw.z0 - 0.15, Math.min(tw.x1, x + seg), tw.z0 + 0.15, YELLOW);
  }
  const lc = world.sites.launch;
  if (lc?.pad) {
    const { x, z, r } = lc.pad, n = 48;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      const P = (a, rr) => [x + Math.cos(a) * rr, z + Math.sin(a) * rr];
      quad(P(a0, r - 0.5), P(a0, r + 0.5), P(a1, r + 0.5), P(a1, r - 0.5), YELLOW);
    }
    for (let s = -r + 2; s < r - 2; s += 4) {
      const e = Math.min(r - 2, s + 4);
      quad([x + s, z - 0.4], [x + s, z + 0.4], [x + e, z + 0.4], [x + e, z - 0.4], YELLOW);
      quad([x - 0.4, z + s], [x - 0.4, z + e], [x + 0.4, z + e], [x + 0.4, z + s], YELLOW);
    }
  }

  // ---- meshes ------------------------------------------------------------------------------------------------------
  // double-sided: the quads above are wound both ways (lines vs rectangles vs the ring), and paint is never seen from below
  const material = enhance(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }), { csm, wind: false, defines: { RL_MARKINGS: '' } });
  for (const [key, g] of cells) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(g.P, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(g.C.map(v => v * v), 3));   // the colours above are sRGB-ish
    const nrm = new Float32Array(g.P.length); for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    geo.setIndex(g.P.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(g.I, 1) : new THREE.Uint16BufferAttribute(g.I, 1));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, material);
    mesh.receiveShadow = true; mesh.castShadow = false;
    mesh.renderOrder = 1;
    mesh.userData.cell = [Math.floor(key / 1000), key % 1000];
    mesh.name = 'markings';
    group.add(mesh);
  }
  void per;
  return {
    group, count: quads, meshes: group.children.length,
    update(cam) {
      // the same test the ground uses for its finest level: distance to the nearest edge of the 128 m cell
      const lim = quality.terrainLod[0];
      for (const m of group.children) {
        const [cx, cz] = m.userData.cell;
        const x0 = -half + cx * CELL, z0 = -half + cz * CELL;
        const dx = Math.max(x0 - cam.x, 0, cam.x - (x0 + CELL)), dz = Math.max(z0 - cam.z, 0, cam.z - (z0 + CELL));
        m.visible = Math.sqrt(dx * dx + dz * dz) < lim;
      }
    },
    dispose() { for (const m of group.children) m.geometry.dispose(); material.dispose(); },
  };
}
