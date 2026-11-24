// Oathwild — the ground of the round-1 map (Brightwater Vale + Thornmere Wilds), built from data/map.json.
// Pure: no DOM, no three.js, no files. Same map file + same seed = the same ground, always.
//
//   const T = createTerrain(map)                 build once (≈0.5 s in Node); everything below reads it
//   T.heightAt(x, z)          ground height (m), interpolated exactly like the client's mesh (see GRID SPLIT)
//   T.walkHeightAt(x, z)      { y, on: 'ground' | 'deck' | 'water' }  where a walker's feet go (bridge decks win)
//   T.waterAt(x, z)           { surface, depth, kind: 'river' | 'marsh' } | null   (depth > 0 = wet)
//   T.slopeAt(x, z)           ground slope in degrees
//   T.walkable(x, z)          inside the play area, slope < limits.maxSlope, water shallower than limits.wadeDepth
//   T.swimmable(x, z)         deeper water inside the play area (walkHeightAt says on: 'swim', y = surface − wadeDepth)
//                             (or on a bridge deck)
//   T.biomeAt(x, z)           'meadow' | 'wildgrass' | 'forest' | 'field' | 'village' | 'road' | 'trail' |
//                             'boardwalk' | 'water' | 'shore' | 'marsh' | 'rock'
//   T.forestAt(x, z)          tree density 0..1 (0 on roads, water, fields, towns; the client scatters trees by it)
//   T.regionAt(x, z)          'brightwater_vale' | 'thornmere_wilds'
//   T.levelBandAt(x, z)       [lo, hi] monster levels there (smallest map.json `areas` circle, else the region's)
//   T.areaAt(x, z)            the area row (or null)
//   T.roadAt(x, z)            { road, d, y } nearest road centre line within 30 m, or null
//   T.roads / T.rivers        dense lines: { id, name, class, width, pts: [{ x, z, s, y }] } (y = road height or
//                             water surface), sampled every grid.sampleStep metres — the client draws these
//   T.bridges                 [{ id, name, road, river, kind: 'bridge'|'ford', at:[x,z], a:[x,z], b:[x,z], width,
//                             deck, surface, facing }] (deck = walk height on the bridge / ford bed)
//   T.places                  map.json places with `y` (ground height at the spot)
//   T.marshLevel(id)          a marsh's water surface
//   T.grid                    { nx, nz, cell, minX, minZ, heights: Float32Array, water: Float32Array (NaN = dry) }
//   T.biomeGrid               { nx, nz, cell, minX, minZ, ids: Uint8Array } with BIOMES[id]
//   T.inPlay(x, z)            inside bounds minus margin
//   reachableFrom(T, at, { cell })  → { at(x, z): bool, count } — everything a walker can reach on foot
//
// GRID SPLIT (drawn = measured, lessons rule 22): vertex (i, k) sits at (minX + i·cell, minZ + k·cell). Each cell is
// cut along the diagonal from (i, k+1) to (i+1, k): triangle A = (i,k) (i+1,k) (i,k+1), triangle B = (i+1,k)
// (i+1,k+1) (i,k+1). `heightAt` interpolates on those two triangles, so a mesh indexed the same way (`meshIndex`
// below) is exactly the walked surface.

import { makeNoise2D, fbm, smoothstep, clamp, lerp, hashStr } from '../../../../worldgen/js/noise.js';

export const BIOMES = Object.freeze(['meadow', 'wildgrass', 'forest', 'field', 'village', 'road', 'trail', 'boardwalk', 'water', 'shore', 'marsh', 'rock']);
export const BIOME_ID = Object.freeze(Object.fromEntries(BIOMES.map((b, i) => [b, i])));
/** Preview / minimap colours (warm, readable — PLAN tone). The client may use its own palette. */
export const BIOME_COLOUR = Object.freeze({
  meadow: [126, 176, 84], wildgrass: [96, 142, 70], forest: [52, 104, 50], field: [214, 188, 104], village: [176, 150, 112],
  road: [190, 160, 116], trail: [168, 140, 98], boardwalk: [140, 104, 66], water: [64, 128, 196], shore: [196, 186, 140],
  marsh: [92, 122, 84], rock: [138, 132, 122],
});

// ---------------------------------------------------------------- lines

/** Catmull-Rom through `points` ([[x, z]…]), sampled about every `step` metres → [{ x, z, s }]. */
export function smoothLine(points, step = 2) {
  const P = points.map(([x, z]) => ({ x, z }));
  const out = [];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    const len = Math.hypot(p2.x - p1.x, p2.z - p1.z);
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), z: f(p0.z, p1.z, p2.z, p3.z) });
    }
  }
  const last = P[P.length - 1];
  out.push({ x: last.x, z: last.z });
  let s = 0;
  out.forEach((p, i) => { if (i) s += Math.hypot(p.x - out[i - 1].x, p.z - out[i - 1].z); p.s = s; });
  return out;
}

/** Distance from (x, z) to segment a-b, and the share t along it. */
export function segDist(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const L = dx * dx + dz * dz;
  const t = L ? clamp(((x - ax) * dx + (z - az) * dz) / L, 0, 1) : 0;
  return { d: Math.hypot(x - (ax + dx * t), z - (az + dz * t)), t };
}
function polyDist(x, z, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const r = segDist(x, z, a[0] ?? a.x, a[1] ?? a.z, b[0] ?? b.x, b[1] ?? b.z).d;
    if (r < best) best = r;
  }
  return best;
}
/** Where segments p1-p2 and q1-q2 cross: { x, z, t, u } or null. */
function segCross(p1, p2, q1, q2) {
  const rx = p2.x - p1.x, rz = p2.z - p1.z, sx = q2.x - q1.x, sz = q2.z - q1.z;
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((q1.x - p1.x) * sz - (q1.z - p1.z) * sx) / den;
  const u = ((q1.x - p1.x) * rz - (q1.z - p1.z) * rx) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: p1.x + rx * t, z: p1.z + rz * t, t, u };
}

// ---------------------------------------------------------------- build

export function createTerrain(map, { seed = map.seed } = {}) {
  const B = map.bounds, G = map.grid, LIM = map.limits;
  const cell = G.cell, step = G.sampleStep;
  const nx = Math.round((B.maxX - B.minX) / cell) + 1, nz = Math.round((B.maxZ - B.minZ) / cell) + 1;
  const N = nx * nz;
  const H = new Float32Array(N);
  const W = new Float32Array(N).fill(NaN);         // water surface (NaN = none)
  const WK = new Uint8Array(N);                    // 1 river, 2 marsh
  const noise = makeNoise2D(seed >>> 0), noise2 = makeNoise2D((seed ^ 0x51ed) >>> 0), noise3 = makeNoise2D((seed ^ 0x2c1b) >>> 0);
  const vx = i => B.minX + i * cell, vz = k => B.minZ + k * cell;
  const idx = (i, k) => k * nx + i;
  const regionIds = Object.keys(map.regions);
  const west = map.regions[map.border.west], east = map.regions[map.border.east];

  // the border: x of the line at a given z
  const border = map.border.points;
  const borderX = z => {
    if (z <= border[0][1]) return border[0][0];
    for (let i = 0; i < border.length - 1; i++) {
      const [ax, az] = border[i], [bx, bz] = border[i + 1];
      if (z <= bz) return ax + (bx - ax) * ((z - az) / (bz - az || 1));
    }
    return border[border.length - 1][0];
  };
  const eastShare = (x, z) => smoothstep(-map.border.blend, map.border.blend, x - borderX(z));

  // 1. raw ground: rolling base per region, edge mountains, hills, ridges
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
    const x = vx(i), z = vz(k);
    const t = eastShare(x, z);
    let h = lerp(west.base, east.base, t) + (fbm(noise, x / 230, z / 230, { octaves: 4 }) - 0.5) * 2 * lerp(west.amp, east.amp, t);
    h += (fbm(noise2, x / 38, z / 38, { octaves: 3 }) - 0.5) * 1.2;
    const e = Math.min(x - B.minX, B.maxX - x, z - B.minZ, B.maxZ - z);
    h += map.frame.height * smoothstep(map.frame.width, 0, e) * (0.75 + 0.5 * fbm(noise3, x / 90, z / 90, { octaves: 3 }));
    for (const hl of map.hills) {
      const d = Math.hypot(x - hl.at[0], z - hl.at[1]) / hl.radius;
      if (d < 1) h += hl.height * (0.5 + 0.5 * Math.cos(Math.PI * d)) * (0.85 + 0.3 * fbm(noise3, x / 60, z / 60, { octaves: 2 }));
    }
    for (const r of map.ridges) {
      const d = polyDist(x, z, r.points);
      if (d < r.width) h += r.height * (0.5 + 0.5 * Math.cos(Math.PI * d / r.width)) * (0.8 + 0.4 * fbm(noise3, x / 50, z / 50, { octaves: 3 }));
    }
    H[idx(i, k)] = h;
  }

  const sampleH = (x, z) => heightOn(H, x, z);
  function heightOn(arr, x, z) {
    const fx = clamp((x - B.minX) / cell, 0, nx - 1.000001), fz = clamp((z - B.minZ) / cell, 0, nz - 1.000001);
    const i = Math.floor(fx), k = Math.floor(fz), u = fx - i, v = fz - k;
    const h00 = arr[idx(i, k)], h10 = arr[idx(i + 1, k)], h01 = arr[idx(i, k + 1)], h11 = arr[idx(i + 1, k + 1)];
    // GRID SPLIT: diagonal (i, k+1)-(i+1, k)
    if (u + v <= 1) return h00 + (h10 - h00) * u + (h01 - h00) * v;
    return h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
  }
  const box = (x, z, r, fn) => {
    const i0 = Math.max(0, Math.floor((x - r - B.minX) / cell)), i1 = Math.min(nx - 1, Math.ceil((x + r - B.minX) / cell));
    const k0 = Math.max(0, Math.floor((z - r - B.minZ) / cell)), k1 = Math.min(nz - 1, Math.ceil((z + r - B.minZ) / cell));
    for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) fn(i, k, vx(i), vz(k), idx(i, k));
  };

  // 2. marshes: ground eased down to just under a water surface, with pools
  const marshes = (map.marshes || []).map(m => {
    let sum = 0, n = 0;
    for (let a = 0; a < 64; a++) for (const rr of [0.15, 0.3, 0.45]) { sum += sampleH(m.at[0] + Math.cos(a) * m.radius[0] * rr, m.at[1] + Math.sin(a) * m.radius[1] * rr); n++; }
    return { ...m, level: Math.round((sum / n - m.below) * 100) / 100 };
  });
  const MM = new Float32Array(N);              // marsh mask 0..1
  for (const m of marshes) {
    const [rx, rz] = m.radius, edge = m.edge / Math.max(rx, rz);
    box(m.at[0], m.at[1], Math.max(rx, rz) * 1.15, (i, k, x, z, j) => {
      const u = Math.hypot((x - m.at[0]) / rx, (z - m.at[1]) / rz) + (fbm(noise3, x / 45, z / 45, { octaves: 3 }) - 0.5) * 0.25;
      const w = 1 - smoothstep(1 - edge, 1, u);
      if (w <= 0) return;
      const n = fbm(noise2, x / 26, z / 26, { octaves: 3 });
      const g = m.level + (n - m.pools) * 2.6 - (n < 1 - m.deepPools ? 0.9 : 0);
      H[j] = lerp(H[j], g, w);
      MM[j] = Math.max(MM[j], w);
      if (w > 0.35) { W[j] = m.level; WK[j] = 2; }
    });
  }
  const marshById = Object.fromEntries(marshes.map(m => [m.id, m]));

  // 3. level ground for places (towns, camps, shrines); `lift` keeps a place in a marsh dry
  const places = {};
  for (const [id, p] of Object.entries(map.places)) {
    if (id.startsWith('_')) continue;
    places[id] = { id, ...p };
    if (!p.flat) continue;
    let c = sampleH(p.at[0], p.at[1]);
    if (p.lift) for (const m of marshes) c = Math.max(c, m.level + p.lift);
    box(p.at[0], p.at[1], p.flat, (i, k, x, z, j) => {
      const d = Math.hypot(x - p.at[0], z - p.at[1]);
      const w = 1 - smoothstep(p.flat * 0.6, p.flat, d);
      if (w <= 0) return;
      H[j] = lerp(H[j], c, w);
      if (p.lift && w > 0.5 && H[j] > W[j]) { W[j] = NaN; WK[j] = 0; }
    });
  }

  // 4. rivers: a water surface that only ever falls downstream, a channel cut under it, sloped banks
  const rivers = [];
  {
    const best = new Float32Array(N).fill(Infinity), bestSurf = new Float32Array(N), bestRiver = new Int8Array(N).fill(-1);
    map.rivers.forEach((r, ri) => {
      const pts = smoothLine(r.points, step);
      let prev = Infinity;
      const marsh = r.intoMarsh ? marshById[r.intoMarsh] : null;
      for (const p of pts) {
        prev = Math.min(prev, sampleH(p.x, p.z) - r.drop);
        p.y = marsh ? Math.max(prev, marsh.level) : prev;
      }
      rivers.push({ id: r.id, name: r.name, width: r.width, depth: r.depth, pts });
      const reach = r.width / 2 + 34;
      for (const p of pts) box(p.x, p.z, reach, (i, k, x, z, j) => {
        const d = Math.hypot(x - p.x, z - p.z);
        if (d < best[j]) { best[j] = d; bestSurf[j] = p.y; bestRiver[j] = ri; }
      });
    });
    for (let j = 0; j < N; j++) {
      if (bestRiver[j] < 0) continue;
      const r = map.rivers[bestRiver[j]], half = r.width / 2, d = best[j], s = bestSurf[j];
      const target = d < half ? s - 0.3 - (r.depth - 0.3) * (1 - (d / half) ** 2) : s + 0.25 + (d - half) * 0.45;
      if (target < H[j]) H[j] = target;
      if (d < half + 1.5) { W[j] = Number.isNaN(W[j]) ? s : Math.max(W[j], s); WK[j] = WK[j] || 1; }
    }
  }
  const riverById = Object.fromEntries(rivers.map(r => [r.id, r]));

  // 5. roads: graded to a smooth height profile; bridges and fords where they cross a river
  const roads = [];
  const bridges = [];
  const RD = new Float32Array(N).fill(Infinity);   // distance to the nearest road centre line
  const RI = new Int8Array(N).fill(-1);
  for (const [ri, r] of map.roads.entries()) {
    const pts = smoothLine(r.points, step);
    const half = r.width / 2;
    // crossings with rivers
    const pinned = new Array(pts.length).fill(null);
    for (const rv of rivers) {
      for (let a = 0; a < pts.length - 1; a++) for (let b = 0; b < rv.pts.length - 1; b++) {
        const c = segCross(pts[a], pts[a + 1], rv.pts[b], rv.pts[b + 1]);
        if (!c) continue;
        if (bridges.some(bb => bb.road === r.id && bb.river === rv.id && Math.hypot(bb.at[0] - c.x, bb.at[1] - c.z) < rv.width + 10)) continue;
        const decl = (map.crossings || []).find(x => x.road === r.id && x.river === rv.id && !bridges.some(bb => bb.id === x.id));
        const sAt = pts[a].s + (pts[a + 1].s - pts[a].s) * c.t;
        const surface = rv.pts[b].y + (rv.pts[b + 1].y - rv.pts[b].y) * c.u;
        const fordish = (map.crossings || []).find(x => x.road === r.id && x.river === rv.id && !bridges.some(bb => bb.id === x.id))?.kind === 'ford';
        const reach = rv.width / 2 + (fordish ? 1.5 : 5);
        const along = sv => { // point on the road at length sv
          const q = pts.findIndex(p => p.s >= sv);
          const p = pts[Math.max(0, q < 0 ? pts.length - 1 : q)];
          return p;
        };
        const pa = along(sAt - reach), pb = along(sAt + reach);
        const kind = decl?.kind || 'undeclared';
        const deck = kind === 'ford' ? surface - 0.35 : Math.max(sampleH(pa.x, pa.z), sampleH(pb.x, pb.z), surface + 1.2) + 0.15;
        const ang = Math.atan2(pb.x - pa.x, pb.z - pa.z);
        bridges.push({ id: decl?.id || `undeclared_${r.id}_${rv.id}`, name: decl?.name || null, road: r.id, river: rv.id, kind, art: decl?.art || null, at: [round2(c.x), round2(c.z)], a: [round2(pa.x), round2(pa.z)], b: [round2(pb.x), round2(pb.z)], width: r.width + 1, deck: round2(deck), surface: round2(surface), facing: round2(ang), s: sAt, reach });
        for (let q = 0; q < pts.length; q++) if (Math.abs(pts[q].s - sAt) <= reach) pinned[q] = deck;
      }
    }
    // the profile: ground along the line, kept above marsh water, smoothed, grade-limited
    const prof = pts.map(p => {
      let y = sampleH(p.x, p.z);
      for (const m of marshes) if (MM[nearestVertex(p.x, p.z)] > 0.05) y = Math.max(y, m.level + 0.35);
      return y;
    });
    // an end that joins a road built before keeps that road's height (junctions meet flush)
    for (const q of [0, pts.length - 1]) {
      const j = nearestVertex(pts[q].x, pts[q].z);
      if (pinned[q] == null && RI[j] >= 0 && RD[j] <= map.roads[RI[j]].width / 2 + 1) pinned[q] = sampleH(pts[q].x, pts[q].z);
    }
    for (let q = 0; q < pts.length; q++) if (pinned[q] != null) prof[q] = pinned[q];
    for (let it = 0; it < 40; it++) for (let q = 1; q < pts.length - 1; q++) if (pinned[q] == null) prof[q] = (prof[q - 1] + prof[q] + prof[q + 1]) / 3;
    const g = q => LIM.roadMaxGrade * (pts[q].s - pts[q - 1].s);   // the climb allowed between sample q-1 and q
    for (let pass = 0; pass < 3; pass++) {
      for (let q = 1; q < pts.length; q++) if (pinned[q] == null) prof[q] = clamp(prof[q], prof[q - 1] - g(q), prof[q - 1] + g(q));
      for (let q = pts.length - 2; q >= 0; q--) if (pinned[q] == null) prof[q] = clamp(prof[q], prof[q + 1] - g(q + 1), prof[q + 1] + g(q + 1));
    }
    pts.forEach((p, q) => { p.y = round2(prof[q]); p.zone = pinned[q] != null; });
    roads.push({ id: r.id, name: r.name, class: r.class, width: r.width, pts });
    // stamp onto the ground
    const shoulder = 5;
    const bestD = new Float32Array(N).fill(Infinity), bestY = new Float32Array(N), bestZone = new Uint8Array(N);
    const touched = [];
    for (const p of pts) box(p.x, p.z, half + shoulder, (i, k, x, z, j) => {
      const d = Math.hypot(x - p.x, z - p.z);
      if (bestD[j] === Infinity) touched.push(j);
      if (d < bestD[j]) { bestD[j] = d; bestY[j] = p.y; bestZone[j] = p.zone ? 1 : 0; }
    });
    for (const j of touched) {
      const d = bestD[j];
      const onEarlier = RI[j] >= 0 && RI[j] !== ri && RD[j] <= map.roads[RI[j]].width / 2 + 0.5;   // a road laid before keeps its surface
      if (d < RD[j]) { RD[j] = d; RI[j] = ri; }
      if (onEarlier) continue;
      const inRiver = WK[j] === 1 && !Number.isNaN(W[j]) && H[j] < W[j];
      if (bestZone[j]) {
        const br = bridges.find(b => b.road === r.id && Math.hypot(vx(j % nx) - b.at[0], vz(Math.floor(j / nx)) - b.at[1]) <= b.reach + half + 2);
        if (br?.kind === 'ford' && d < half + 1.5) H[j] = Math.max(H[j], br.deck);
        else if (!inRiver && d < half + shoulder) H[j] = lerp(H[j], bestY[j], 1 - smoothstep(half, half + shoulder, d));
        continue;
      }
      if (inRiver) continue;
      H[j] = lerp(H[j], bestY[j], 1 - smoothstep(half, half + shoulder, d));
    }
  }
  function nearestVertex(x, z) {
    const i = clamp(Math.round((x - B.minX) / cell), 0, nx - 1), k = clamp(Math.round((z - B.minZ) / cell), 0, nz - 1);
    return idx(i, k);
  }
  for (const p of Object.values(places)) p.y = round2(sampleH(p.at[0], p.at[1]));

  // ---------------------------------------------------------------- queries
  const inPlay = (x, z) => x >= B.minX + B.margin && x <= B.maxX - B.margin && z >= B.minZ + B.margin && z <= B.maxZ - B.margin;
  const heightAt = (x, z) => sampleH(x, z);
  function waterAt(x, z) {
    const fx = clamp((x - B.minX) / cell, 0, nx - 1.000001), fz = clamp((z - B.minZ) / cell, 0, nz - 1.000001);
    const i = Math.floor(fx), k = Math.floor(fz);
    let s = 0, n = 0, kind = 0;
    for (const j of [idx(i, k), idx(i + 1, k), idx(i, k + 1), idx(i + 1, k + 1)]) if (!Number.isNaN(W[j])) { s += W[j]; n++; kind = Math.max(kind, WK[j]); }
    if (!n) return null;
    const surface = s / n, depth = surface - heightAt(x, z);
    return { surface: round2(surface), depth: round2(depth), kind: kind === 2 ? 'marsh' : 'river' };
  }
  function deckAt(x, z) {
    for (const b of bridges) {
      if (b.kind !== 'bridge') continue;
      if (segDist(x, z, b.a[0], b.a[1], b.b[0], b.b[1]).d <= b.width / 2) return b;
    }
    return null;
  }
  function slopeAt(x, z) {
    const e = 0.5;
    const dx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e), dz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
    return Math.atan(Math.hypot(dx, dz)) * 180 / Math.PI;
  }
  function walkHeightAt(x, z) {
    const b = deckAt(x, z);
    if (b) return { y: b.deck, on: 'deck', bridge: b.id };
    const w = waterAt(x, z), g = heightAt(x, z);
    // deeper than wading: swimming — the body floats at the same height a wader at the deepest wade has, so walking
    // into a river and swimming on is one smooth slope (no ledge at the edge); the client sinks the drawn body more
    if (w && w.depth > LIM.wadeDepth) return { y: round2(w.surface - LIM.wadeDepth), on: 'swim', depth: w.depth, surface: w.surface };
    if (w && w.depth > 0) return { y: g, on: 'water', depth: w.depth, surface: w.surface };
    return { y: g, on: 'ground' };
  }
  /** Deep water a body can swim in (inside the play area). walkable() stays "stand on foot" for spawns and scenery. */
  function swimmable(x, z) {
    if (!inPlay(x, z) || deckAt(x, z)) return false;
    const w = waterAt(x, z);
    return !!(w && w.depth > LIM.wadeDepth);
  }
  function walkable(x, z) {
    if (!inPlay(x, z)) return false;
    if (deckAt(x, z)) return true;
    const w = waterAt(x, z);
    if (w && w.depth > LIM.wadeDepth) return false;
    // a river or pool's bank, just above or below the waterline, may be steeper: you scramble in to swim and climb
    // back out (owner 2026-11-24 "I can't swim across water" — banks of 39° were walls). Dry hillsides keep maxSlope.
    if (w && w.depth > -(LIM.bankBand ?? 0.8)) return slopeAt(x, z) < (LIM.bankSlope ?? 50);
    return slopeAt(x, z) < LIM.maxSlope;
  }
  const regionAt = (x, z) => (x < borderX(z) ? map.border.west : map.border.east);
  const areasBySize = [...map.areas].sort((a, b) => a.radius - b.radius);
  const areaAt = (x, z) => areasBySize.find(a => Math.hypot(x - a.at[0], z - a.at[1]) <= a.radius) || null;
  const levelBandAt = (x, z) => [...(areaAt(x, z)?.levels || map.regions[regionAt(x, z)].levels)];
  function roadAt(x, z, maxD = 30) {
    let best = null;
    for (const r of roads) for (let q = 0; q < r.pts.length - 1; q++) {
      const a = r.pts[q], b = r.pts[q + 1];
      const { d, t } = segDist(x, z, a.x, a.z, b.x, b.z);
      if (d <= maxD && (!best || d < best.d)) best = { road: r.id, class: r.class, d: round2(d), y: round2(a.y + (b.y - a.y) * t), half: r.width / 2 };
    }
    return best;
  }

  // forest density (0..1): region base + forest patches + noise, cleared from roads, water, fields, towns, camps
  const fieldHit = (x, z) => (map.fields || []).find(f => {
    const c = Math.cos(-f.angle), s = Math.sin(-f.angle);
    const lx = (x - f.at[0]) * c - (z - f.at[1]) * s, lz = (x - f.at[0]) * s + (z - f.at[1]) * c;
    return Math.abs(lx) <= f.size[0] / 2 && Math.abs(lz) <= f.size[1] / 2;
  }) || null;
  function forestAt(x, z) {
    const j = nearestVertex(x, z);
    if (RD[j] < (map.roads[RI[j]]?.width || 4) / 2 + 5) return 0;
    const w = waterAt(x, z);
    if (w && w.depth > -0.4) return 0;
    if (MM[j] > 0.5) return 0;
    if (fieldHit(x, z)) return 0;
    for (const p of Object.values(places)) if (p.flat && Math.hypot(x - p.at[0], z - p.at[1]) < p.flat + 4) return 0;
    const t = eastShare(x, z);
    let d = lerp(west.forest, east.forest, t);
    for (const f of map.forests || []) {
      const u = Math.hypot(x - f.at[0], z - f.at[1]) / f.radius;
      if (u < 1) d = Math.max(d, f.density * (1 - smoothstep(0.6, 1, u)));
    }
    const n = fbm(noise3, x / 70, z / 70, { octaves: 3 });
    return round2(clamp(d * (0.4 + 1.2 * n), 0, 1));
  }
  function biomeAt(x, z) {
    const j = nearestVertex(x, z);
    const w = waterAt(x, z);
    if (w && w.depth > LIM.wadeDepth && !deckAt(x, z)) return 'water';
    if (RD[j] <= (map.roads[RI[j]]?.width || 0) / 2) return map.roads[RI[j]].class === 'road' ? 'road' : map.roads[RI[j]].class;
    if (deckAt(x, z)) return 'road';
    for (const p of Object.values(places)) if (p.kind === 'town' && Math.hypot(x - p.at[0], z - p.at[1]) < p.radius) return 'village';
    if (fieldHit(x, z)) return 'field';
    if (MM[j] > 0.5) return w && w.depth > 0 ? 'water' : 'marsh';
    if (w && w.kind === 'river' && w.depth > -0.6) return 'shore';
    if (slopeAt(x, z) > 32) return 'rock';
    if (forestAt(x, z) > 0.55) return 'forest';
    return map.regions[regionAt(x, z)].ground;
  }
  const bc = G.biomeCell;
  const bnx = Math.round((B.maxX - B.minX) / bc), bnz = Math.round((B.maxZ - B.minZ) / bc);
  const ids = new Uint8Array(bnx * bnz);
  for (let k = 0; k < bnz; k++) for (let i = 0; i < bnx; i++) ids[k * bnx + i] = BIOME_ID[biomeAt(B.minX + (i + 0.5) * bc, B.minZ + (k + 0.5) * bc)];

  return {
    map, seed, bounds: B, limits: LIM,
    grid: { nx, nz, cell, minX: B.minX, minZ: B.minZ, heights: H, water: W },
    biomeGrid: { nx: bnx, nz: bnz, cell: bc, minX: B.minX, minZ: B.minZ, ids },
    roads, rivers, bridges, places, marshes, regionIds,
    marshLevel: id => marshById[id]?.level ?? null,
    inPlay, heightAt, walkHeightAt, waterAt, deckAt, slopeAt, walkable, swimmable, biomeAt, forestAt, fieldAt: fieldHit,
    regionAt, areaAt, levelBandAt, roadAt, borderX,
  };
}
const round2 = v => Math.round(v * 100) / 100;

/** Triangle index for the height grid, cut exactly like heightAt (GRID SPLIT). Vertex (i, k) = k * nx + i. */
export function meshIndex(nx, nz) {
  const out = new Uint32Array((nx - 1) * (nz - 1) * 6);
  let o = 0;
  for (let k = 0; k < nz - 1; k++) for (let i = 0; i < nx - 1; i++) {
    const a = k * nx + i, b = a + 1, c = a + nx, d = c + 1;
    out[o++] = a; out[o++] = c; out[o++] = b;   // (i,k) (i,k+1) (i+1,k)
    out[o++] = b; out[o++] = c; out[o++] = d;   // (i+1,k) (i,k+1) (i+1,k+1)
  }
  return out;
}

/** Flood fill of walkable ground from `at` on a `cell`-metre grid (steps refuse a slope over maxSlope or deep water). */
export function reachableFrom(T, at, { cell = 4 } = {}) {
  const B = T.bounds;
  const nx = Math.floor((B.maxX - B.minX) / cell), nz = Math.floor((B.maxZ - B.minZ) / cell);
  const seen = new Uint8Array(nx * nz);
  const cx = i => B.minX + (i + 0.5) * cell, cz = k => B.minZ + (k + 0.5) * cell;
  const ci = x => Math.floor((x - B.minX) / cell), ck = z => Math.floor((z - B.minZ) / cell);
  const ok = new Int8Array(nx * nz).fill(-1);
  const walk = j => { if (ok[j] < 0) ok[j] = T.walkable(cx(j % nx), cz(Math.floor(j / nx))) ? 1 : 0; return ok[j] === 1; };
  const maxRise = Math.tan(T.limits.maxSlope * Math.PI / 180) * cell;
  const start = ck(at[1]) * nx + ci(at[0]);
  const queue = [start];
  seen[start] = 1;
  let count = 0;
  while (queue.length) {
    const j = queue.pop();
    count++;
    const i = j % nx, k = Math.floor(j / nx);
    const h0 = T.walkHeightAt(cx(i), cz(k)), y = h0.y;
    for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ii = i + di, kk = k + dk;
      if (ii < 0 || kk < 0 || ii >= nx || kk >= nz) continue;
      const jj = kk * nx + ii;
      if (seen[jj] || !walk(jj)) continue;
      const h1 = T.walkHeightAt(cx(ii), cz(kk));
      if (Math.abs(h1.y - y) > maxRise * 1.15) continue;
      if ((h0.on === 'deck') !== (h1.on === 'deck') && Math.abs(h1.y - y) > 0.6) continue;   // on or off a bridge only at its ends
      seen[jj] = 1;
      queue.push(jj);
    }
  }
  return { count, at: (x, z) => { const i = ci(x), k = ck(z); return i >= 0 && k >= 0 && i < nx && k < nz && seen[k * nx + i] === 1; } };
}
