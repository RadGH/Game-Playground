// Roads: route, smooth, profile, carve. Pure (no DOM / three / rapier).
//
//   1. ROUTE — A* over an 8 m grid of the raw land. A step costs its length, plus a lot for steep grades (anything
//      over the class's maxGrade is not a step at all), plus a per-biome cost (roads skirt the bog), and deep water is
//      a wall except inside a ford. Cells an earlier road already uses are cheap, so roads join up instead of running
//      side by side.
//   2. SMOOTH — the grid path is cut into a smooth curve (Chaikin), then resampled every 2 m.
//   3. PROFILE — the height of the road along its length: the land's own height, averaged, then clamped so it never
//      climbs faster than the class allows (a forward and a backward pass; afterwards every 2 m step is within it).
//      Both ends are pinned to their node's height so roads meet at junctions.
//   4. CARVE — every sample within halfW of the road is set to the profile (plus a little banking on bends), and the
//      shoulder blends back into the land. Cuts and fills happen here; this is what makes a hillside road a ledge.
//
// The carve is done for ALL roads at once with a nearest-road field (bestD / bestT), so where two roads meet the
// nearer one wins instead of the last one drawn.

import { clamp, smoothstep, lerp } from './wmath.js';
import { ROAD_CLASSES } from './world-data.js';

const GRID = 16;  // routing grid, metres. 8 m let A* stack hairpin legs closer than a road is wide (they carved over each other)

/** A binary min-heap of node indices keyed by a Float64Array of scores. */
function makeHeap(cap) {
  const items = new Int32Array(cap);
  let n = 0;
  return {
    get size() { return n; },
    clear() { n = 0; },
    push(i, f) {
      let k = n++;
      items[k] = i;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (f[items[p]] <= f[items[k]]) break;
        const t = items[p]; items[p] = items[k]; items[k] = t; k = p;
      }
    },
    pop(f) {
      const top = items[0];
      const last = items[--n];
      if (n > 0) {
        items[0] = last;
        let k = 0;
        for (;;) {
          const l = 2 * k + 1, r = l + 1;
          let m = k;
          if (l < n && f[items[l]] < f[items[m]]) m = l;
          if (r < n && f[items[r]] < f[items[m]]) m = r;
          if (m === k) break;
          const t = items[m]; items[m] = items[k]; items[k] = t; k = m;
        }
      }
      return top;
    },
  };
}

// 16 neighbours: the 8 around plus the 8 knight moves, so a route can run at 26.6 degrees and not only at 45.
const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
  [2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]];
const NB_LEN = NB.map(([a, b]) => Math.sqrt(a * a + b * b) * GRID);

/**
 * The router. `cost` arrays are built once per world.
 * @param {object} w  { size, heightAt(x,z) }
 * @param {object} fields { blocked: (x,z)=>bool, biomeCost: (x,z)=>number }
 */
export function createRouter(w, fields) {
  const n = Math.round(w.size / GRID) + 1;
  const half = w.size / 2;
  const N = n * n;
  const H = new Float32Array(N);
  const B = new Uint8Array(N);        // 1 = deep water / wall
  const C = new Float32Array(N);      // extra cost per metre
  const used = new Uint8Array(N);     // 1 = a road already runs here
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = -half + i * GRID, z = -half + j * GRID, k = j * n + i;
    H[k] = w.heightAt(x, z);
    B[k] = fields.blocked(x, z) ? 1 : 0;
    C[k] = fields.biomeCost(x, z);
  }
  // The search state is (cell, heading of the step that arrived there): 16 headings. A step may not turn more than
  // ~100 degrees from the one before it, and pays for the turn it does make, so a hairpin takes at least two steps
  // and its two legs end up a grid cell (16 m) apart instead of on top of each other.
  const ND = 16;
  const NS = N * ND;
  const g = new Float64Array(NS), f = new Float64Array(NS);
  const came = new Int32Array(NS);
  const closed = new Uint8Array(NS);
  const heap = makeHeap(NS * 2);
  const COS = new Float64Array(ND * ND);
  for (let p = 0; p < ND; p++) for (let q = 0; q < ND; q++) {
    const [a1, b1] = NB[p], [a2, b2] = NB[q];
    COS[p * ND + q] = (a1 * a2 + b1 * b2) / (Math.sqrt(a1 * a1 + b1 * b1) * Math.sqrt(a2 * a2 + b2 * b2));
  }
  const toIdx = (x, z) => {
    const i = clamp(Math.round((x + half) / GRID), 0, n - 1), j = clamp(Math.round((z + half) / GRID), 0, n - 1);
    return j * n + i;
  };

  /**
   * @returns {Array<[x,z]>} grid points from a to b (inclusive of the exact end points) or null.
   * opts: { cls, allowWater: (x,z)=>bool, reuse = 0.45, maxGrade, biomeMul }
   */
  function route(ax, az, bx, bz, opts = {}) {
    const cls = ROAD_CLASSES[opts.cls || 'road'];
    const maxG = opts.maxGrade ?? cls.maxGrade;
    const reuse = opts.reuse ?? 0.45;
    const biomeMul = opts.biomeMul ?? 1;
    const start = toIdx(ax, az), goal = toIdx(bx, bz);
    const gi = goal % n, gj = (goal / n) | 0;
    g.fill(Infinity); closed.fill(0); heap.clear();
    // the start has no heading yet: seed every heading at cost 0
    for (let d = 0; d < ND; d++) { const st = start * ND + d; g[st] = 0; f[st] = 0; came[st] = -1; heap.push(st, f); }
    let found = -1;
    while (heap.size) {
      const curS = heap.pop(f);
      if (closed[curS]) continue;
      const cur = (curS / ND) | 0, cd = curS % ND;
      if (cur === goal) { found = curS; break; }
      closed[curS] = 1;
      const ci = cur % n, cj = (cur / n) | 0;
      const first = came[curS] === -1;
      for (let q = 0; q < 16; q++) {
        const cosT = first ? 1 : COS[cd * ND + q];
        if (cosT < -0.17) continue;
        const ni = ci + NB[q][0], nj = cj + NB[q][1];
        if (ni < 1 || nj < 1 || ni >= n - 1 || nj >= n - 1) continue;
        const nk = nj * n + ni;
        const ns = nk * ND + q;
        if (closed[ns]) continue;
        if (B[nk] && nk !== goal) {
          if (!opts.allowWater || !opts.allowWater(-half + ni * GRID, -half + nj * GRID)) continue;
        }
        if (q >= 8) {
          const mi = ci + Math.round(NB[q][0] / 2), mj = cj + Math.round(NB[q][1] / 2);
          if (B[mj * n + mi] && !(opts.allowWater && opts.allowWater(-half + mi * GRID, -half + mj * GRID))) continue;
        }
        const L = NB_LEN[q];
        const grade = Math.abs(H[nk] - H[cur]) / L;
        if (grade > maxG) continue;
        let c = 1 + grade * 3 + (1 - cosT) * 0.6;
        if (grade > 0.12) c += (grade - 0.12) * 55;
        c += C[nk] * biomeMul;
        if (used[nk]) c *= reuse;
        const ng = g[curS] + L * c;
        if (ng < g[ns]) {
          g[ns] = ng; came[ns] = curS;
          const di = ni - gi, dj = nj - gj;
          f[ns] = ng + Math.sqrt(di * di + dj * dj) * GRID * reuse;
          heap.push(ns, f);
        }
      }
    }
    if (found < 0) return null;
    const out = [];
    for (let st = found; st !== -1; st = came[st]) { const k = (st / ND) | 0; out.push([-half + (k % n) * GRID, -half + ((k / n) | 0) * GRID]); }
    out.reverse();
    const near = (p, x, z) => (p[0] - x) * (p[0] - x) + (p[1] - z) * (p[1] - z) < (GRID * 1.2) * (GRID * 1.2);
    // cut at the FIRST point that comes within reach of the end (the rest only wanders round it), and start from the
    // LAST point still within reach of the start
    let e = out.findIndex((p, i) => i > 0 && near(p, bx, bz));
    if (e > 0) out.length = e + 1;
    let st = 0;
    for (let i = out.length - 2; i > 0; i--) if (near(out[i], ax, az)) { st = i; break; }
    if (st > 0) out.splice(0, st);
    out[0] = [ax, az];
    out[out.length - 1] = [bx, bz];
    return out;
  }

  /** Mark a finished polyline as road so later routes prefer to join it. */
  function markUsed(pts) {
    for (const [x, z] of pts) used[toIdx(x, z)] = 1;
  }

  return { route, markUsed, n };
}

/** Chaikin corner cutting, keeping the two end points. */
export function chaikin(pts, iterations = 3) {
  let p = pts;
  for (let it = 0; it < iterations; it++) {
    if (p.length < 3) return p;
    const q = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i], b = p[i + 1];
      q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      q.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    q.push(p[p.length - 1]);
    p = q;
  }
  return p;
}

/** Points every `step` metres along a polyline. Extra per-point values (index 2+) are interpolated too. */
export function resample(pts, step = 2) {
  const out = [pts[0].slice()];
  let carry = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const L = Math.sqrt(dx * dx + dz * dz);
    if (L < 1e-9) continue;
    let s = step - carry;
    while (s <= L) {
      const t = s / L;
      const p = [];
      for (let c = 0; c < a.length; c++) p.push(a[c] + (b[c] - a[c]) * t);
      out.push(p);
      s += step;
    }
    carry = L - (s - step);
  }
  const last = pts[pts.length - 1];
  const tail = out[out.length - 1];
  const dx = last[0] - tail[0], dz = last[1] - tail[1];
  if (dx * dx + dz * dz > 0.25) out.push(last.slice()); else out[out.length - 1] = last.slice();
  return out;
}

/**
 * The height of the road along its length.
 * @param {Array<[x,z]>} pts resampled every `ds` metres
 * @param {Function} groundAt (x,z) => metres
 * @param {object} o { pinA, pinB, smooth (samples), clamp (grade), floorAt?: (x,z)=>min height or -Infinity, fixed?: Float32Array|null }
 */
export function profile(pts, groundAt, o) {
  const n = pts.length;
  const raw = new Float64Array(n);
  for (let i = 0; i < n; i++) raw[i] = o.fixed ? o.fixed[i] : groundAt(pts[i][0], pts[i][1]);
  if (o.fixed) return Float32Array.from(raw);
  // two box-filter passes ≈ a gentle bell over +-2*smooth samples
  let a = raw, b = new Float64Array(n);
  const R = o.smooth | 0;
  for (let pass = 0; pass < 2; pass++) {
    let sum = 0, cnt = 0;
    for (let i = -R; i <= R; i++) if (i >= 0 && i < n) { sum += a[i]; cnt++; }
    for (let i = 0; i < n; i++) {
      b[i] = sum / cnt;
      const out = i - R, inn = i + R + 1;
      if (out >= 0) { sum -= a[out]; cnt--; }
      if (inn < n) { sum += a[inn]; cnt++; }
    }
    const t = a; a = b; b = t;
  }
  const h = a;
  // ease toward the pins over the first / last 10 samples so the clamp has less to fix
  const E = Math.min(10, (n / 2) | 0);
  if (o.pinA != null) for (let i = 0; i < E; i++) h[i] = lerp(o.pinA, h[i], smoothstep(0, E, i));
  if (o.pinB != null) for (let i = 0; i < E; i++) h[n - 1 - i] = lerp(o.pinB, h[n - 1 - i], smoothstep(0, E, i));
  if (o.floorAt) for (let i = 0; i < n; i++) h[i] = Math.max(h[i], o.floorAt(pts[i][0], pts[i][1]));
  if (o.pinA != null) h[0] = o.pinA;
  if (o.pinB != null) h[n - 1] = o.pinB;
  // grade clamp: forward then backward. After the backward pass every neighbouring pair is within the limit.
  const ds = o.ds || 2;
  const G = o.clamp * ds;
  for (let i = 1; i < n; i++) h[i] = clamp(h[i], h[i - 1] - G, h[i - 1] + G);
  for (let i = n - 2; i >= 0; i--) h[i] = clamp(h[i], h[i + 1] - G, h[i + 1] + G);
  return Float32Array.from(h);
}

/**
 * Road carving, one road at a time. `carve(heights, road, ri)` stamps that road's samples into a scratch field
 * (distance past its driving edge + target height, nearest sample wins), blends the land to it, and folds the result
 * into the shared nearest-road field (bestD / bestR) that surfaces and scatter read afterwards.
 *
 * Roads are carved in order and each road's profile is read from the land as the earlier roads left it, so a road
 * that runs along or joins another one inherits its surface instead of disagreeing with it by a few centimetres
 * (which is what made 0.4 m steps where two roads overlapped, when all of them were carved at once).
 */
export function createCarve(dim, cell, size) {
  const half = size / 2;
  const N = dim * dim;
  const bestD = new Float32Array(N).fill(1e9);
  const bestR = new Int16Array(N).fill(-1);
  const locD = new Float32Array(N).fill(1e9);
  const locT = new Float32Array(N);
  const touched = new Int32Array(N);

  function carve(heights, road, ri, noCarve, markOnly = false) {
    const cls = ROAD_CLASSES[road.cls];
    const reach = cls.halfW + cls.shoulder;
    const rc = Math.ceil(reach / cell) + 1;
    const pts = road.pts, prof = road.prof, n = pts.length;
    let nt = 0;
    for (let s = 0; s < n; s++) {
      const px = pts[s][0], pz = pts[s][1];
      const a = pts[Math.max(0, s - 3)], b = pts[Math.min(n - 1, s + 3)];
      let dx = b[0] - a[0], dz = b[1] - a[1];
      const dl = Math.sqrt(dx * dx + dz * dz) || 1;
      dx /= dl; dz /= dl;
      // a little banking on bends, from how fast the road turns
      let bank = 0;
      if (s > 5 && s < n - 6) {
        const p0 = pts[s - 5], p1 = pts[s + 5];
        const ax = px - p0[0], az = pz - p0[1], bx = p1[0] - px, bz = p1[1] - pz;
        const la = Math.sqrt(ax * ax + az * az) || 1, lb = Math.sqrt(bx * bx + bz * bz) || 1;
        bank = clamp((ax * bz - az * bx) / (la * lb) * 0.35, -0.03, 0.03);
      }
      const i0 = Math.round((px + half) / cell), j0 = Math.round((pz + half) / cell);
      for (let dj = -rc; dj <= rc; dj++) {
        const j = j0 + dj;
        if (j < 0 || j >= dim) continue;
        for (let di = -rc; di <= rc; di++) {
          const i = i0 + di;
          if (i < 0 || i >= dim) continue;
          const cx = -half + i * cell - px, cz = -half + j * cell - pz;
          const d = Math.sqrt(cx * cx + cz * cz);
          if (d > reach) continue;
          const k = j * dim + i;
          const rel = d - cls.halfW;
          if (locD[k] === 1e9) touched[nt++] = k;
          if (rel < locD[k]) { locD[k] = rel; locT[k] = prof[s] - bank * (cx * dz - cz * dx); }
        }
      }
    }
    for (let q = 0; q < nt; q++) {
      const k = touched[q], rel = locD[k];
      // never re-carve the driving surface of an earlier road: a crossing or a shared stretch keeps the road
      // that was there first, and this road's profile was pinned to it (see pinToRoads)
      const onOlder = bestD[k] <= 0.5 && bestR[k] !== ri && bestR[k] >= 0;
      if (!markOnly && !(noCarve && noCarve[k]) && !onOlder) {
        const w = rel <= 0 ? 1 : 1 - smoothstep(0, cls.shoulder, rel);
        heights[k] += (locT[k] - heights[k]) * w;
      }
      if (rel < bestD[k]) { bestD[k] = rel; bestR[k] = ri; }
      locD[k] = 1e9;
    }
  }

  /**
   * Where this road runs over an earlier road's surface, its profile must BE that surface (the ground there), easing
   * back to its own profile over `ease` samples either side. Call before carve().
   */
  function pinToRoads(heights, pts, prof, grade = 0.2, ease = 10) {
    const n = pts.length;
    const on = new Uint8Array(n);
    const g = new Float32Array(n);
    let any = false;
    for (let s = 0; s < n; s++) {
      const i = Math.round((pts[s][0] + half) / cell), j = Math.round((pts[s][1] + half) / cell);
      if (i < 0 || j < 0 || i >= dim || j >= dim) continue;
      const k = j * dim + i;
      if (bestD[k] <= 0.5 && bestR[k] >= 0) { on[s] = 1; any = true; g[s] = bilinearAt(heights, pts[s][0], pts[s][1]); }
    }
    if (!any) return prof;
    const out = Float32Array.from(prof);
    // distance (in samples) to the nearest pinned sample, and that sample's value
    let last = -1;
    const nearIdx = new Int32Array(n).fill(-1);
    for (let s = 0; s < n; s++) { if (on[s]) last = s; nearIdx[s] = last; }
    last = -1;
    for (let s = n - 1; s >= 0; s--) {
      if (on[s]) last = s;
      if (last >= 0 && (nearIdx[s] < 0 || last - s < s - nearIdx[s])) nearIdx[s] = last;
    }
    for (let s = 0; s < n; s++) {
      const q = nearIdx[s];
      if (q < 0) continue;
      const d = Math.abs(q - s);
      if (d === 0) out[s] = g[s];
      else if (d < ease) out[s] = g[q] + (prof[s] - g[q]) * smoothstep(0, ease, d);
    }
    // the ease can be steeper than the class allows: clamp again, moving only the samples that are not pinned
    const G = grade * 2;
    for (let s = 1; s < n; s++) if (!on[s]) out[s] = clamp(out[s], out[s - 1] - G, out[s - 1] + G);
    for (let s = n - 2; s >= 0; s--) if (!on[s]) out[s] = clamp(out[s], out[s + 1] - G, out[s + 1] + G);
    return out;
  }
  function bilinearAt(h, x, z) {
    const fx = (x + half) / cell, fz = (z + half) / cell;
    const i = Math.min(dim - 2, Math.max(0, Math.floor(fx))), j = Math.min(dim - 2, Math.max(0, Math.floor(fz)));
    const tx = Math.min(1, Math.max(0, fx - i)), tz = Math.min(1, Math.max(0, fz - j));
    const k = j * dim + i;
    return (h[k] + (h[k + 1] - h[k]) * tx) * (1 - tz) + (h[k + dim] + (h[k + dim + 1] - h[k + dim]) * tx) * tz;
  }

  return { carve, pinToRoads, bestD, bestR };
}
