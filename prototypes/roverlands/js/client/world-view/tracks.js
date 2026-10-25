// Tyre tracks: one ribbon per wheel, ring-buffered.
//
// Each segment is a cross-section of four points carried from the last point to this one:
//     outer-left  inner-left  inner-right  outer-right
//      (raised,    (pressed     (pressed     (raised,
//       light)      down, dark)  down, dark)  light)
// so a rut on mud / sand / snow reads as DUG IN — a dark trough between two pushed-up lips, with the normals tilted
// to match — and on a road it is only a faint rubber smear. How deep it looks comes from SURFACES[].rut. Every point
// sits on the ground (world.heightAt, or the wheel's own contact height if that is higher — a log, the bridge) plus a
// small lift and a polygon offset, so it never fights the terrain for the same pixels. Old segments fade out, and the
// oldest are overwritten when the buffer is full.

import * as THREE from 'three';
import { enhance } from '../../../../../highdef-3d/js/materials.js';
import { SURFACES } from '../../world/world-data.js';

const TINT = {
  grass: [0.20, 0.24, 0.12], dirt: [0.25, 0.18, 0.11], mud: [0.11, 0.08, 0.05], sand: [0.55, 0.46, 0.32],
  gravel: [0.35, 0.33, 0.30], rock: [0.3, 0.3, 0.3], snow: [0.62, 0.68, 0.76], road: [0.12, 0.12, 0.12],
  ice: [0.7, 0.8, 0.9], farm: [0.27, 0.19, 0.11], shallows: [0.3, 0.28, 0.22],
};
const LIP = { mud: [0.30, 0.23, 0.16], sand: [0.84, 0.74, 0.55], snow: [0.96, 0.97, 1.0], farm: [0.50, 0.38, 0.25], dirt: [0.45, 0.34, 0.22] };
const LIFE = 120;   // seconds before a track has faded away

export function createTracks(world, quality, { csm }) {
  const MAX = quality.trackSegments || 3000;
  const VPS = 8;      // vertices per segment (4 at each end)
  const pos = new Float32Array(MAX * VPS * 3), nor = new Float32Array(MAX * VPS * 3);
  const col = new Float32Array(MAX * VPS * 4), birth = new Float32Array(MAX * VPS).fill(-1e6);
  const idx = new Uint32Array(MAX * 18);
  for (let s = 0; s < MAX; s++) {
    const b = s * VPS, o = s * 18;
    // quads (a0 a1 b1 b0) for the three strips: 0-1, 1-2, 2-3 at end A (0..3) to end B (4..7)
    for (let q = 0; q < 3; q++) {
      const a0 = b + q, a1 = b + q + 1, b0 = b + 4 + q, b1 = b + 4 + q + 1;
      idx.set([a0, b0, a1, a1, b0, b1], o + q * 6);
    }
  }
  const geo = new THREE.BufferGeometry();
  const aPos = new THREE.BufferAttribute(pos, 3), aNor = new THREE.BufferAttribute(nor, 3);
  const aCol = new THREE.BufferAttribute(col, 4), aBirth = new THREE.BufferAttribute(birth, 1);
  for (const a of [aPos, aNor, aCol, aBirth]) a.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', aPos); geo.setAttribute('normal', aNor);
  geo.setAttribute('color', aCol); geo.setAttribute('aBirth', aBirth);
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), world.size);

  const uNow = { value: 0 };
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true, transparent: true, depthWrite: false, roughness: 0.8,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
  });
  enhance(material, {
    csm, fog: true, wind: false, uniforms: { uNow }, defines: { RL_TRACKS: '' },
    vertex: { pars: 'attribute float aBirth; uniform float uNow; varying float vFade;', main: `vFade = 1.0 - smoothstep( ${LIFE * 0.6}.0, ${LIFE}.0, uNow - aBirth );` },
    fragment: { pars: 'varying float vFade;', main: 'gl_FragColor.a *= vFade;' },
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'tracks';
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  mesh.receiveShadow = true;

  let head = 0, written = 0;
  const last = new Map();    // key -> { p: [4 points], n: [4 normals], x, z, c, t }
  let dirtyLo = Infinity, dirtyHi = -1;

  function section(x, y, z, nx, ny, nz, w, dx, dz, surf) {
    // side vector = up x forward, flattened onto the ground
    let sx = dz, sz = -dx;
    const sl = Math.sqrt(sx * sx + sz * sz) || 1; sx /= sl; sz /= sl;
    const rut = SURFACES[surf]?.rut ?? 0.3;
    const name = SURFACES[surf]?.name || 'dirt';
    const lipW = 0.06 + 0.16 * rut;
    const off = [-(w / 2 + lipW), -w * 0.28, w * 0.28, w / 2 + lipW];
    const lift = [0.035 + 0.05 * rut, 0.02, 0.02, 0.035 + 0.05 * rut];
    const pts = [], nrm = [], cols = [];
    const trough = TINT[name] || TINT.dirt, lip = LIP[name] || trough.map(v => v * 1.4);
    const aTrough = name === 'road' ? 0.22 : name === 'rock' || name === 'ice' ? 0.15 : name === 'grass' ? 0.45 : 0.55 + 0.4 * rut;
    for (let q = 0; q < 4; q++) {
      const px = x + sx * off[q], pz = z + sz * off[q];
      const gy = Math.max(world.heightAt(px, pz), y - 0.06);
      pts.push(px, gy + lift[q], pz);
      // lips lean outward, the trough walls lean in
      const tilt = (q === 0 ? -0.45 : q === 3 ? 0.45 : q === 1 ? 0.3 : -0.3) * rut;
      nrm.push(nx + sx * tilt, ny, nz + sz * tilt);
      const edge = q === 0 || q === 3;
      const c = edge ? lip : trough;
      cols.push(c[0], c[1], c[2], edge ? aTrough * 0.55 * (0.4 + rut) : aTrough);
    }
    return { pts, nrm, cols };
  }

  function writeSeg(A, B, t) {
    const s = head;
    head = (head + 1) % MAX;
    written++;
    const b = s * VPS;
    for (let q = 0; q < 4; q++) {
      for (const [src, vi] of [[A, b + q], [B, b + 4 + q]]) {
        pos.set(src.pts.slice(q * 3, q * 3 + 3), vi * 3);
        const n = src.nrm.slice(q * 3, q * 3 + 3), l = Math.hypot(n[0], n[1], n[2]) || 1;
        nor.set([n[0] / l, n[1] / l, n[2] / l], vi * 3);
        col.set(src.cols.slice(q * 4, q * 4 + 4), vi * 4);
        birth[vi] = t;
      }
    }
    dirtyLo = Math.min(dirtyLo, s); dirtyHi = Math.max(dirtyHi, s);
  }

  return {
    mesh,
    /** A wheel in contact at (x, y, z) with ground normal n, tyre width w, on surface `surf`, heading (dirX, dirZ). */
    add(key, x, y, z, nx, ny, nz, width, surf, dirX, dirZ) {
      const t = uNow.value;
      const prev = last.get(key);
      let dx = dirX, dz = dirZ;
      if (prev) { const ex = x - prev.x, ez = z - prev.z; const d = Math.hypot(ex, ez); if (d < 0.25) return; if (d > 1.5) { last.delete(key); } else { dx = ex / d; dz = ez / d; } }
      const sec = section(x, y, z, nx, ny, nz, width || 0.3, dx || 0, dz || 1, surf ?? 0);
      const p = last.get(key);
      if (p) writeSeg(p.sec, sec, t);
      last.set(key, { x, z, sec });
    },
    lift(key) { last.delete(key); },
    update(now) {
      uNow.value = now;
      if (dirtyHi >= 0) {
        // one upload covering the touched range (the ring wraps rarely; when it does, upload everything)
        const lo = dirtyLo, hi = dirtyHi;
        for (const [a, size] of [[aPos, 3], [aNor, 3], [aCol, 4], [aBirth, 1]]) {
          a.clearUpdateRanges();
          a.addUpdateRange(lo * VPS * size, (hi - lo + 1) * VPS * size);
          a.needsUpdate = true;
        }
        dirtyLo = Infinity; dirtyHi = -1;
      }
    },
    get count() { return Math.min(written, MAX); },
    clear() { birth.fill(-1e6); aBirth.clearUpdateRanges(); aBirth.needsUpdate = true; last.clear(); },
    dispose() { geo.dispose(); material.dispose(); },
  };
}
