// Chibi 2.5 clipping measure (pure + Three.js maths, no renderer): how much of one part pokes through another.
// Used by tests/chibi25.test.js and tools/chibi25-clip-report.mjs. Reads the `trace` hook of createChibi2Character.
//
// A "cover" (the hat, the hair, the chest) is rasterised into a map of directions seen from a centre point (the middle
// of the head): for each direction bin, the NEAREST distance at which the cover's surface lies. A vertex of the
// "inner" part pokes through when its own distance along its direction is beyond that surface by more than `tol`.
// `inside: true` flips it (a beard vertex that is INSIDE the chest surface has sunk into the body).
import * as THREE from 'three';

const TB = 48, PB = 96;
const binOf = (d) => {
  const th = Math.acos(THREE.MathUtils.clamp(d.y, -1, 1)), ph = Math.atan2(d.x, d.z) + Math.PI;
  return Math.min(TB - 1, Math.floor(th / Math.PI * TB)) * PB + Math.min(PB - 1, Math.floor(ph / (2 * Math.PI) * PB));
};

/** Direction map of the nearest (or, with far, farthest) surface distance of `pieces` from `centre`. */
export function coverMap(pieces, centre, { far = false, outward = true } = {}) {
  const nrm = new THREE.Vector3(), e2 = new THREE.Vector3(), mid = new THREE.Vector3();
  const map = new Float32Array(TB * PB).fill(far ? -Infinity : Infinity);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), p = new THREE.Vector3(), d = new THREE.Vector3();
  for (const piece of pieces) {
    const pos = piece.positions, idx = piece.index;
    const tri = idx ? idx.length / 3 : pos.length / 9;
    for (let t = 0; t < tri; t++) {
      const i0 = idx ? idx[t * 3] : t * 3, i1 = idx ? idx[t * 3 + 1] : t * 3 + 1, i2 = idx ? idx[t * 3 + 2] : t * 3 + 2;
      a.fromArray(pos, i0 * 3); b.fromArray(pos, i1 * 3); c.fromArray(pos, i2 * 3);
      // only surfaces that FACE AWAY from the centre count (a crown cylinder's base disc, a lining shell or the inside
      // of a brim are hidden inside the hat and would flag every hair under it)
      if (outward) { nrm.subVectors(b, a).cross(e2.subVectors(c, a)); mid.addVectors(a, b).add(c).divideScalar(3).sub(centre); if (nrm.dot(mid) <= 0) continue; }
      const size = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));
      const n = Math.max(1, Math.min(12, Math.ceil(size / 0.012)));
      for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) {
        const u = i / n, v = j / n, w = 1 - u - v;
        p.set(a.x * w + b.x * u + c.x * v, a.y * w + b.y * u + c.y * v, a.z * w + b.z * u + c.z * v);
        d.subVectors(p, centre); const r = d.length(); if (r < 1e-6) continue;
        const k = binOf(d.divideScalar(r));
        if (far ? r > map[k] : r < map[k]) map[k] = r;
      }
    }
  }
  return map;
}

/** How many vertices of `pieces` poke past the cover (or sink inside it with `inside`). */
export function poke(pieces, map, centre, { tol = 0.01, inside = false, filter = () => true } = {}) {
  const v = new THREE.Vector3(), d = new THREE.Vector3();
  let n = 0, hit = 0, covered = 0;
  for (const piece of pieces) {
    const pos = piece.positions;
    for (let i = 0; i < pos.length; i += 3) {
      v.fromArray(pos, i); if (!filter(v)) continue;
      d.subVectors(v, centre); const r = d.length(); if (r < 1e-6) continue;
      const m = map[binOf(d.divideScalar(r))]; n++;
      if (!Number.isFinite(m)) continue;
      covered++;
      if (inside ? r < m - tol : r > m + tol) hit++;
    }
  }
  return { vertices: n, covered, poking: hit, share: covered ? hit / covered : 0 };
}

/** The pieces of a trace whose tag matches (a string prefix or a RegExp). */
export const tagged = (trace, t) => trace.filter(p => typeof t === 'string' ? p.tag === t || p.tag.startsWith(t + ':') : t.test(p.tag));

/**
 * Seen from the FRONT (+z, orthographic): the share of `pieces` vertices with a cover surface in front of them at the
 * same (x, y). For "are the brows hidden by the fringe" — what a camera facing the character sees.
 */
export function hiddenFromFront(pieces, covers, { cell = 0.006, tol = 0.003 } = {}) {
  const grid = new Map(), key = (x, y) => Math.round(x / cell) + ',' + Math.round(y / cell);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), p = new THREE.Vector3();
  for (const piece of covers) {
    const pos = piece.positions, idx = piece.index, tri = idx ? idx.length / 3 : pos.length / 9;
    for (let t = 0; t < tri; t++) {
      a.fromArray(pos, (idx ? idx[t * 3] : t * 3) * 3); b.fromArray(pos, (idx ? idx[t * 3 + 1] : t * 3 + 1) * 3); c.fromArray(pos, (idx ? idx[t * 3 + 2] : t * 3 + 2) * 3);
      const n = Math.max(1, Math.min(16, Math.ceil(Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a)) / (cell * 0.7))));
      for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) {
        const u = i / n, v = j / n, w = 1 - u - v;
        p.set(a.x * w + b.x * u + c.x * v, a.y * w + b.y * u + c.y * v, a.z * w + b.z * u + c.z * v);
        const k = key(p.x, p.y); if (!(grid.get(k) >= p.z)) grid.set(k, p.z);
      }
    }
  }
  let n = 0, hid = 0; const v = new THREE.Vector3();
  for (const piece of pieces) for (let i = 0; i < piece.positions.length; i += 3) {
    v.fromArray(piece.positions, i); n++;
    const z = grid.get(key(v.x, v.y)); if (z != null && z > v.z + tol) hid++;
  }
  return { vertices: n, hidden: hid, share: n ? hid / n : 0 };
}
