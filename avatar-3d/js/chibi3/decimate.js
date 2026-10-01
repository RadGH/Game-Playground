// Chibi 3 mesh simplifier. No Three.js (node tests run it).
//
// Surface nets give every part of a layer the same density: a flat breastplate gets as many
// triangles per square centimetre as the curl of an ear. This removes the ones that do not change
// the shape, using QUADRIC ERROR edge collapse (Garland & Heckbert): each vertex remembers the planes
// of the triangles around it, and an edge is only collapsed when the merged vertex stays within
// `maxError` metres of all of them. Flat areas thin out, curves and creases keep their triangles.
//
// Chibi 3 adds one thing: after a collapse the new vertex is put back ON the true surface (the
// distance field), so simplifying never makes the surface drift inward the way it does on a mesh
// that only knows its own triangles. Open boundaries (region seams) are pinned.

/** A tiny binary min-heap of [cost, edge, version]. */
class Heap {
  constructor() { this.c = []; this.e = []; this.v = []; }
  get size() { return this.c.length; }
  push(cost, edge, ver) {
    const c = this.c, e = this.e, v = this.v; let i = c.length; c.push(cost); e.push(edge); v.push(ver);
    while (i > 0) { const p = (i - 1) >> 1; if (c[p] <= c[i]) break; [c[p], c[i]] = [c[i], c[p]]; [e[p], e[i]] = [e[i], e[p]]; [v[p], v[i]] = [v[i], v[p]]; i = p; }
  }
  pop() {
    const c = this.c, e = this.e, v = this.v, top = [c[0], e[0], v[0]], lc = c.pop(), le = e.pop(), lv = v.pop();
    if (c.length) {
      c[0] = lc; e[0] = le; v[0] = lv; let i = 0;
      for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < c.length && c[l] < c[m]) m = l; if (r < c.length && c[r] < c[m]) m = r; if (m === i) break; [c[m], c[i]] = [c[i], c[m]]; [e[m], e[i]] = [e[i], e[m]]; [v[m], v[i]] = [v[i], v[m]]; i = m; }
    }
    return top;
  }
}

/**
 * Simplify { positions, normals, indices }. Options:
 *   maxError   metres a vertex may leave the original surface (default 0.0004)
 *   minRatio   never go below this fraction of the triangles (default 0.12)
 *   field      { eval(x,y,z) } — re-project merged vertices onto it and take normals from it
 * Returns a new { positions, normals, indices }.
 */
export function decimate(mesh, { maxError = 0.0004, minRatio = 0.12, field = null, pin = null, endpointsOnly = false, freeBoundaries = false } = {}) {
  const P = Float64Array.from(mesh.positions), nV = P.length / 3, T = Int32Array.from(mesh.indices), nT = T.length / 3;
  if (nT < 64) return mesh;
  const Q = new Float64Array(nV * 10);
  const triDead = new Uint8Array(nT), vDead = new Uint8Array(nV);
  // vertex -> triangles
  const vt = Array.from({ length: nV }, () => []);
  for (let t = 0; t < nT; t++) for (let k = 0; k < 3; k++) vt[T[t * 3 + k]].push(t);
  const addPlane = (i, a, b, c, d, w) => {
    const q = i * 10;
    Q[q] += w * a * a; Q[q + 1] += w * a * b; Q[q + 2] += w * a * c; Q[q + 3] += w * a * d;
    Q[q + 4] += w * b * b; Q[q + 5] += w * b * c; Q[q + 6] += w * b * d;
    Q[q + 7] += w * c * c; Q[q + 8] += w * c * d; Q[q + 9] += w * d * d;
  };
  const triNormal = (t, out) => {
    const a = T[t * 3] * 3, b = T[t * 3 + 1] * 3, c = T[t * 3 + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    out[0] = uy * vz - uz * vy; out[1] = uz * vx - ux * vz; out[2] = ux * vy - uy * vx;
    return Math.hypot(out[0], out[1], out[2]);
  };
  const n = [0, 0, 0];
  for (let t = 0; t < nT; t++) {
    const area2 = triNormal(t, n); if (area2 < 1e-14) continue;
    const a = n[0] / area2, b = n[1] / area2, c = n[2] / area2, i0 = T[t * 3] * 3, d = -(a * P[i0] + b * P[i0 + 1] + c * P[i0 + 2]);
    for (let k = 0; k < 3; k++) addPlane(T[t * 3 + k], a, b, c, d, area2 * 0.5);
  }
  // edges, and boundary edges (used by one triangle only) pinned with heavy planes
  const edgeKey = (a, b) => a < b ? a * nV + b : b * nV + a;
  const edgeCount = new Map();
  for (let t = 0; t < nT; t++) for (let k = 0; k < 3; k++) { const a = T[t * 3 + k], b = T[t * 3 + (k + 1) % 3], key = edgeKey(a, b); edgeCount.set(key, (edgeCount.get(key) || 0) + 1); }
  const pinned = pin ? Uint8Array.from(pin) : new Uint8Array(nV);
  if (!freeBoundaries) for (const [key, cnt] of edgeCount) if (cnt !== 2) { pinned[Math.floor(key / nV)] = 1; pinned[key % nV] = 1; }
  const errAt = (q, x, y, z) => {
    const o = q;
    return Q[o] * x * x + 2 * Q[o + 1] * x * y + 2 * Q[o + 2] * x * z + 2 * Q[o + 3] * x + Q[o + 4] * y * y + 2 * Q[o + 5] * y * z + 2 * Q[o + 6] * y + Q[o + 7] * z * z + 2 * Q[o + 8] * z + Q[o + 9];
  };
  const sumQ = new Float64Array(10);
  const cost = (a, b, out) => {
    for (let i = 0; i < 10; i++) sumQ[i] = Q[a * 10 + i] + Q[b * 10 + i];
    const save = Q.subarray(0, 0); void save;
    let best = Infinity, bx = 0, by = 0, bz = 0;
    // endpointsOnly: the merged vertex IS one of the two (so every other attribute it carries — colour,
    // skin weights, morphs — stays exact; used to derive the far levels of detail)
    const cand = pinned[a] ? [[P[a * 3], P[a * 3 + 1], P[a * 3 + 2]]] : pinned[b] ? [[P[b * 3], P[b * 3 + 1], P[b * 3 + 2]]]
      : endpointsOnly ? [[P[a * 3], P[a * 3 + 1], P[a * 3 + 2]], [P[b * 3], P[b * 3 + 1], P[b * 3 + 2]]]
      : [[P[a * 3], P[a * 3 + 1], P[a * 3 + 2]], [P[b * 3], P[b * 3 + 1], P[b * 3 + 2]], [(P[a * 3] + P[b * 3]) / 2, (P[a * 3 + 1] + P[b * 3 + 1]) / 2, (P[a * 3 + 2] + P[b * 3 + 2]) / 2]];
    for (const [x, y, z] of cand) {
      const e = sumQ[0] * x * x + 2 * sumQ[1] * x * y + 2 * sumQ[2] * x * z + 2 * sumQ[3] * x + sumQ[4] * y * y + 2 * sumQ[5] * y * z + 2 * sumQ[6] * y + sumQ[7] * z * z + 2 * sumQ[8] * z + sumQ[9];
      if (e < best) { best = e; bx = x; by = y; bz = z; }
    }
    out[0] = bx; out[1] = by; out[2] = bz;
    return Math.max(0, best);
  };
  void errAt;
  // the area-weighted quadric is in metres^2 * metres^2; normalise by the local area so the cost is
  // a squared distance we can compare with maxError
  const area = new Float64Array(nV);
  for (let t = 0; t < nT; t++) { const a2 = triNormal(t, n) * 0.5; for (let k = 0; k < 3; k++) area[T[t * 3 + k]] += a2; }
  const edgesA = [], edgesB = [], ver = [];
  const heap = new Heap(), tmp = [0, 0, 0];
  for (const key of edgeCount.keys()) {
    const a = Math.floor(key / nV), b = key % nV;
    if (pinned[a] && pinned[b]) continue;
    const id = edgesA.length; edgesA.push(a); edgesB.push(b); ver.push(0);
    heap.push(cost(a, b, tmp) / (area[a] + area[b] + 1e-12), id, 0);
  }
  const vVer = new Uint32Array(nV);
  const limit = maxError * maxError;
  let alive = nT;
  const minTris = Math.ceil(nT * minRatio);
  const before = [0, 0, 0], after = [0, 0, 0];
  const mark = new Uint32Array(nV), mark2 = new Uint32Array(nV); let stamp = 0, stamp2 = 0;
  while (heap.size && alive > minTris) {
    const [c, id] = heap.pop();
    if (c > limit) break;
    let a = edgesA[id], b = edgesB[id];
    if (vDead[a] || vDead[b] || a === b) continue;
    // stale entry: recompute and push back if the cost changed
    const fresh = cost(a, b, tmp) / (area[a] + area[b] + 1e-12);
    if (Math.abs(fresh - c) > 1e-12 * (1 + c)) { heap.push(fresh, id, 0); continue; }
    if (pinned[b] && !pinned[a]) { const s = a; a = b; b = s; }
    // with endpoints only, keep whichever vertex the cost picked
    if (endpointsOnly && !pinned[a] && tmp[0] === P[b * 3] && tmp[1] === P[b * 3 + 1] && tmp[2] === P[b * 3 + 2]) { const s = a; a = b; b = s; }
    let tx = tmp[0], ty = tmp[1], tz = tmp[2];
    if (field && !pinned[a] && !pinned[b]) {
      // back onto the true surface (one Newton step)
      const e = 0.0004, f = field.eval(tx, ty, tz);
      const gx = (field.eval(tx + e, ty, tz) - field.eval(tx - e, ty, tz)) / (2 * e), gy = (field.eval(tx, ty + e, tz) - field.eval(tx, ty - e, tz)) / (2 * e), gz = (field.eval(tx, ty, tz + e) - field.eval(tx, ty, tz - e)) / (2 * e);
      const g2 = gx * gx + gy * gy + gz * gz;
      if (g2 > 1e-8 && Math.abs(f) < maxError * 4) { tx -= f * gx / g2; ty -= f * gy / g2; tz -= f * gz / g2; }
    }
    // the link condition: a and b may share exactly two neighbours (else the surface pinches)
    stamp++;
    for (const t of vt[a]) if (!triDead[t]) for (let k = 0; k < 3; k++) mark[T[t * 3 + k]] = stamp;
    let sharedCount = 0; stamp2++;
    for (const t of vt[b]) if (!triDead[t]) for (let k = 0; k < 3; k++) { const w = T[t * 3 + k]; if (w !== a && w !== b && mark[w] === stamp && mark2[w] !== stamp2) { mark2[w] = stamp2; sharedCount++; } }
    if (sharedCount !== 2) continue;
    // no triangle may flip
    let flips = false;
    for (let vi = 0; vi < 2; vi++) {
      const v = vi ? b : a;
      for (const t of vt[v]) {
        if (triDead[t]) continue;
        const i0 = T[t * 3], i1 = T[t * 3 + 1], i2 = T[t * 3 + 2];
        if ((i0 === a || i1 === a || i2 === a) && (i0 === b || i1 === b || i2 === b)) continue;   // removed by the collapse
        triNormal(t, before);
        const sx = P[v * 3], sy = P[v * 3 + 1], sz = P[v * 3 + 2];
        P[v * 3] = tx; P[v * 3 + 1] = ty; P[v * 3 + 2] = tz;
        const l2 = triNormal(t, after);
        P[v * 3] = sx; P[v * 3 + 1] = sy; P[v * 3 + 2] = sz;
        const l1 = Math.hypot(before[0], before[1], before[2]);
        if (l2 < 1e-14 || (before[0] * after[0] + before[1] * after[1] + before[2] * after[2]) < 0.3 * l1 * l2) { flips = true; break; }
      }
      if (flips) break;
    }
    if (flips) continue;
    // collapse b into a
    P[a * 3] = tx; P[a * 3 + 1] = ty; P[a * 3 + 2] = tz;
    for (let i = 0; i < 10; i++) Q[a * 10 + i] += Q[b * 10 + i];
    area[a] += area[b];
    for (const t of vt[b]) {
      if (triDead[t]) continue;
      const hasA = T[t * 3] === a || T[t * 3 + 1] === a || T[t * 3 + 2] === a;
      if (hasA) { triDead[t] = 1; alive--; continue; }
      for (let k = 0; k < 3; k++) if (T[t * 3 + k] === b) T[t * 3 + k] = a;
      vt[a].push(t);
    }
    vDead[b] = 1; vVer[a]++;
    vt[a] = vt[a].filter(t => !triDead[t]);
    // new costs for every edge around a
    stamp++;
    const nb = [];
    for (const t of vt[a]) for (let k = 0; k < 3; k++) { const w = T[t * 3 + k]; if (w !== a && mark[w] !== stamp) { mark[w] = stamp; nb.push(w); } }
    for (const w of nb) {
      if (pinned[a] && pinned[w]) continue;
      const nid = edgesA.length; edgesA.push(a); edgesB.push(w); ver.push(0);
      heap.push(cost(a, w, tmp) / (area[a] + area[w] + 1e-12), nid, 0);
    }
  }
  // compact
  const remap = new Int32Array(nV).fill(-1), outIdx = [];
  let nv = 0;
  for (let t = 0; t < nT; t++) {
    if (triDead[t]) continue;
    const a = T[t * 3], b = T[t * 3 + 1], c = T[t * 3 + 2];
    if (a === b || b === c || a === c) continue;
    for (const v of [a, b, c]) if (remap[v] < 0) remap[v] = nv++;
    outIdx.push(remap[a], remap[b], remap[c]);
  }
  const positions = new Float32Array(nv * 3), normals = new Float32Array(nv * 3);
  for (let v = 0; v < nV; v++) {
    const r = remap[v]; if (r < 0) continue;
    positions[r * 3] = P[v * 3]; positions[r * 3 + 1] = P[v * 3 + 1]; positions[r * 3 + 2] = P[v * 3 + 2];
    if (field) {
      const e = 0.0004, x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
      let gx = field.eval(x + e, y, z) - field.eval(x - e, y, z), gy = field.eval(x, y + e, z) - field.eval(x, y - e, z), gz = field.eval(x, y, z + e) - field.eval(x, y, z - e);
      const l = Math.hypot(gx, gy, gz) || 1; normals[r * 3] = gx / l; normals[r * 3 + 1] = gy / l; normals[r * 3 + 2] = gz / l;
    } else if (mesh.normals && v < mesh.normals.length / 3) {
      normals[r * 3] = mesh.normals[v * 3]; normals[r * 3 + 1] = mesh.normals[v * 3 + 1]; normals[r * 3 + 2] = mesh.normals[v * 3 + 2];
    }
  }
  return { ...mesh, positions, normals, indices: new Uint32Array(outIdx), remap };
}
