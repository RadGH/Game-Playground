// Thousandvale — BESPOKE AREAS ("set pieces") in the zone bake (stream B, owner play-test 2, Q18:
// "more content, more bespoke areas, especially near the start: graveyards, farmlands, various other details").
//
// Pure, deterministic, zone-local. Called by tools/bake-zone.mjs in three steps:
//   1. layLanes()        before the roads are graded: authored farm lanes (graded like a spur, painted as road),
//                        so a crossroads, an inn at it and farm gates have real roads to sit on
//   2. resolveSetPieces() after the towns are levelled and planned: every piece is fitted to the ground (a search
//                        round its `near` hint), then the ground is prepared (fields smoothed to a plane, a graveyard
//                        and an inn yard levelled flat, a clearing eased) — the rivers are carved AFTER this, so a
//                        river still owns its bed
//   3. carvePonds()      after the bridges: mill ponds dug as small lakes (level just under the lowest point of the
//                        rim, so the water can never spill), before the wet skirt so the sheet edge is buried like
//                        every other lake (tests/B/water-edge.test.js)
// then paintSetPieces() (surfaces), setPieceScatter() (hedges, fruit trees, yews, reeds), setPiecePlacements()
// (typed records for streams A/D/E) and setPieceNav() (buildings + walls).
//
// Kinds (data/world/set-pieces.json; stream E may add/override per zone with `setPieces` in its places file):
//   farm       a farmyard (flat, `yard` surface, slot `farmstead` for E's farm buildings/NPCs) and up to `fields`
//              strips round it on a 3x3 grid (some split in two), each `field` (ploughed furrows), `crop` or
//              `pasture`; hedges round the crops, fences round the pastures, a gate on the side facing the yard
//   graveyard  levelled flat, `graveyard` surface, a stone wall with a lych-gate facing the road/town, a gravel path
//              (`yard`) from the gate, grave rows as data (x, z, yaw, style), yews in two corners, a chapel for a
//              town's yard
//   orchard    a gentle plane, `orchard` surface, fruit trees in rows (scatter tree_fruit), a hedge round it with
//              a gate, a shed
//   mill_pond  an oval pond (a small lake), a mill on the bank at its lowest side with the wheel at the water,
//              reeds round the margin
//   clearing   a round gap in the trees, eased ground, a trampled `yard` middle, slot `camp`
//   inn        an inn at a crossroads of two named lanes/roads (`at: [a, b]`): a flat yard in the flattest corner,
//              the inn facing the road, a stable, a well, and a signpost at the crossing naming where each road goes
//   belt       (automatic, every planned settlement) a patchwork of field strips round the town outside its ring
//   graveyard  (automatic, every planned settlement that has no authored one) near the town, by a road
//
// Coordinates: zone metres. A rect is {cx, cz, w, d, a}: local +x = (cos a, sin a) (proctown's convention); yaw for
// placements = atan2(dx, dz) of the way a thing faces.

import { hashStr, clamp, smoothstep } from '../../../../worldgen/js/noise.js';

/** Extra surfaces appended to the biome table BEFORE `road` (road stays the last entry). [key, name, colour]. */
export const SET_SURFACES = [
  ['field', 'Ploughed field', '#7b5d3c'],
  ['crop', 'Crop field', '#b0a24c'],
  ['pasture', 'Pasture', '#8db35e'],
  ['yard', 'Yard', '#8f7b58'],
  ['graveyard', 'Graveyard', '#4e6a3c'],
  ['orchard', 'Orchard', '#74a04a'],
  ['gravel', 'Gravel', '#9c9484'],
];
/** stream E's set-piece `ground.surface` words -> our surfaces (null = leave the land's own surface) */
export const E_SURFACE = { dirt: 'yard', farmland: 'field', graveyard: 'graveyard', gravel: 'gravel', grass: null, yard: 'yard', field: 'field', crop: 'crop', pasture: 'pasture', orchard: 'orchard' };
/** Scatter kinds this module adds (terrain-read SCATTER_KINDS, appended there). */
export const KIND_TREE_FRUIT = 9, KIND_HEDGE = 10, KIND_CONIFER = 1, KIND_REED = 8, KIND_BUSH = 4;
/** No piece comes nearer a zone edge than this (zone-local work must never touch the shared edge). */
export const PIECE_EDGE = 130;

// ------------------------------------------------------------------------------------------------ helpers
const TAU = Math.PI * 2;
const yawOfAngle = a => +Math.atan2(Math.cos(a), Math.sin(a)).toFixed(4);
const r2 = v => Math.round(v * 100) / 100;
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
function rngOf(key) {
  let s = (hashStr(String(key)) >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
export const makeRect = (cx, cz, w, d, a) => ({ cx, cz, w, d, a });
export function toLocal(R, x, z) { const c = Math.cos(R.a), s = Math.sin(R.a), dx = x - R.cx, dz = z - R.cz; return [dx * c + dz * s, -dx * s + dz * c]; }
export function toWorld(R, lx, lz) { const c = Math.cos(R.a), s = Math.sin(R.a); return [R.cx + lx * c - lz * s, R.cz + lx * s + lz * c]; }
export const inRect = (R, x, z, pad = 0) => { const [lx, lz] = toLocal(R, x, z); return Math.abs(lx) <= R.w / 2 + pad && Math.abs(lz) <= R.d / 2 + pad; };
export const rectCorners = R => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => toWorld(R, u * R.w / 2, v * R.d / 2));
/** metres outside the rect (0 inside) */
function outside(R, x, z) { const [lx, lz] = toLocal(R, x, z); const ox = Math.max(0, Math.abs(lx) - R.w / 2), oz = Math.max(0, Math.abs(lz) - R.d / 2); return Math.hypot(ox, oz); }
function polyDist(pts, x, z) {
  let best = Infinity, bk = 0, bt = 0;
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k], b = pts[k + 1], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1;
    const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / L2, 0, 1), d = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
    if (d < best) { best = d; bk = k; bt = t; }
  }
  return [best, bk, bt];
}
/** Rect footprint sample points (every `step` m, edges included). */
function rectSamples(R, step = 6) {
  const out = [], nx = Math.max(1, Math.ceil(R.w / step)), nz = Math.max(1, Math.ceil(R.d / step));
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) out.push(toWorld(R, (i / nx - 0.5) * R.w, (j / nz - 0.5) * R.d));
  return out;
}
function discSamples(x, z, r, step = 6) {
  const out = [[x, z]];
  for (let rr = step; rr <= r; rr += step) { const n = Math.ceil(TAU * rr / step); for (let q = 0; q < n; q++) out.push([x + Math.cos(q / n * TAU) * rr, z + Math.sin(q / n * TAU) * rr]); }
  return out;
}
/** Segment intersection of two polylines -> first [x, z, ka, ta, kb, tb] or null. */
function crossPolylines(A, B) {
  for (let i = 0; i < A.length - 1; i++) for (let j = 0; j < B.length - 1; j++) {
    const p = A[i], r = [A[i + 1][0] - p[0], A[i + 1][1] - p[1]], q = B[j], s = [B[j + 1][0] - q[0], B[j + 1][1] - q[1]];
    const den = r[0] * s[1] - r[1] * s[0]; if (Math.abs(den) < 1e-9) continue;
    const t = ((q[0] - p[0]) * s[1] - (q[1] - p[1]) * s[0]) / den, u = ((q[0] - p[0]) * r[1] - (q[1] - p[1]) * r[0]) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return [p[0] + r[0] * t, p[1] + r[1] * t, i, t, j, u];
  }
  return null;
}
const hAt = (pts, k, t) => pts[k][2] + (pts[k + 1][2] - pts[k][2]) * t;
/**
 * 0 on a road sample, rising to 1 at `reach` m from the nearest one: levelling fades out toward a road so a flat yard
 * beside a road never leaves a step at the road's edge (the road keeps its own grade; tests/B/bridges.test.js walks it).
 */
function roadFade(roadMask, gIdx, x, z, reach = 6) {
  let best = reach;
  for (let dz = -reach; dz <= reach; dz += 2) for (let dx = -reach; dx <= reach; dx += 2) {
    const d = Math.hypot(dx, dz); if (d >= best) continue;
    if (roadMask[gIdx(x + dx, z + dz)]) best = d;
  }
  return smoothstep(0, 1, best / reach);
}

// ------------------------------------------------------------------------------------------------ the data
/**
 * Pieces + lanes for a zone: B's authored file, then stream E's per-zone `setPieces` / `lanes` (same id wins: E's), then
 * the automatic ones (belts round every planned settlement; a graveyard for every settlement without an authored one).
 * `auto: false` on the zone entry turns the automatic ones off.
 */
export function specsFor(id, { authored = {}, places = null } = {}) {
  const zb = authored.zones?.[id] || {};
  const pieces = new Map(), lanes = new Map();
  for (const p of zb.pieces || []) pieces.set(p.id, { ...p, source: 'B' });
  for (const l of zb.lanes || []) lanes.set(l.id, { ...l, source: 'B' });
  for (const p of places?.setPieces || []) pieces.set(p.id, { ...p, source: 'E' });
  for (const l of places?.lanes || []) lanes.set(l.id, { ...l, source: 'E' });
  return { pieces: [...pieces.values()], lanes: [...lanes.values()], auto: zb.auto !== false && authored.auto !== false };
}

// ------------------------------------------------------------------------------------------------ 1. lanes
/**
 * Authored lanes -> road records {id, cls:'lane', width, pts [[x, z, h]], spur: true, lane: true, joins?, to?}.
 * Waypoints are Chaikin-smoothed and resampled every 8 m; heights are the ground smoothed along the lane, then pulled
 * to EXACTLY the height of any road the lane touches or crosses (world roads and earlier lanes win), so a crossroads
 * is one level and a lane meets its road with no step. Throws if a lane comes within `edge` of a zone edge.
 */
export function layLanes({ lanes, roads, ground, gIdx, ZM, edge = 120 }) {
  const out = [];
  for (const L of lanes) {
    let pts = L.pts.map(p => [p[0], p[1]]);
    for (let pass = 0; pass < 2; pass++) {
      const nl = [pts[0]];
      for (let q = 0; q < pts.length - 1; q++) { const a = pts[q], b = pts[q + 1]; nl.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); }
      nl.push(pts[pts.length - 1]); pts = nl;
    }
    // resample every 8 m
    const rs = [pts[0]]; let carry = 0;
    for (let q = 0; q < pts.length - 1; q++) {
      const a = pts[q], b = pts[q + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      let s = 8 - carry;
      while (s < len) { rs.push([a[0] + (b[0] - a[0]) * s / len, a[1] + (b[1] - a[1]) * s / len]); s += 8; }
      carry = len - (s - 8);
    }
    rs.push(pts[pts.length - 1]);
    for (const [x, z] of rs) if (x < edge || z < edge || x > ZM - edge || z > ZM - edge) throw new Error(`lane ${L.id}: (${x.toFixed(0)}, ${z.toFixed(0)}) is within ${edge} m of the zone edge`);
    const g = rs.map(([x, z]) => ground[gIdx(x, z)]);
    const p3 = rs.map(([x, z], k) => { let s = 0, c = 0; for (let q = Math.max(0, k - 4); q <= Math.min(rs.length - 1, k + 4); q++) { s += g[q]; c++; } return [x, z, s / c]; });
    // pull to every road it meets (fixed roads first: world roads, spurs, earlier lanes)
    const fixed = [...roads, ...out];
    const pulls = [];
    for (const r of fixed) {
      const X = crossPolylines(p3, r.pts);
      if (X) pulls.push({ k: X[2], t: X[3], h: hAt(r.pts, X[4], X[5]) });
      for (const end of [0, p3.length - 1]) {
        const [d, k, t] = polyDist(r.pts, p3[end][0], p3[end][1]);
        if (d < 8) pulls.push({ k: end === 0 ? 0 : p3.length - 2, t: end === 0 ? 0 : 1, h: hAt(r.pts, k, t) });
      }
    }
    if (pulls.length) {
      const cum = [0]; for (let k = 1; k < p3.length; k++) cum.push(cum[k - 1] + Math.hypot(p3[k][0] - p3[k - 1][0], p3[k][1] - p3[k - 1][1]));
      const base = p3.map(p => p[2]);
      for (let k = 0; k < p3.length; k++) {
        let wsum = 0, acc = 0;
        for (const pl of pulls) {
          const s = cum[pl.k] + pl.t * (cum[pl.k + 1] - cum[pl.k]), d = Math.abs(cum[k] - s);
          const w = 1 - smoothstep(0, 1, d / 48); if (w <= 0) continue;
          // the nearest pull decides (weights renormalised); at the crossing itself w = 1 and the lane IS the road
          wsum += w; acc += w * (pl.h - base[k]);
        }
        if (wsum > 0) { const wmax = Math.min(1, wsum); p3[k][2] = base[k] + acc / wsum * wmax; }
      }
    }
    out.push({ id: L.id.startsWith('lane_') ? L.id : `lane_${L.id}`, cls: 'lane', width: L.width || 3.2, pts: p3, spur: true, lane: true, ...(L.joins ? { joins: L.joins } : {}), ...(L.to ? { to: L.to } : {}), name: L.name || null });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ 2. pieces
/**
 * ctx: { id, ZM, STEP, G, AP, ground, gIdx, waterTop, roadMask, rivers [{pts [[x, z, h, cls]]}] (zone-local),
 *        roads (incl. lanes), plans (proctown, origin + town), settlements (placed), pins [{x, z, r}], specs, culture }
 * -> { pieces: [...], log: [...] } and the ground is prepared in place.
 */
export function resolveSetPieces(ctx) {
  const { id, ZM, ground, gIdx, waterTop, roads, plans, specs } = ctx;
  const log = [];
  // ---- what is in the way: coarse distance fields (8 m) to rivers and roads, town circles, pins
  const C = 8, N = Math.ceil(ZM / C) + 1;
  const riverD = new Float32Array(N * N).fill(1e9), roadD = new Float32Array(N * N).fill(1e9);
  const fill = (arr, lines, cap, halfOf) => {
    for (const ln of lines) {
      const pts = ln.pts;
      for (let k = 0; k < pts.length - 1; k++) {
        const a = pts[k], b = pts[k + 1], half = halfOf(ln, a, b);
        const x0 = Math.max(0, Math.floor((Math.min(a[0], b[0]) - cap) / C)), x1 = Math.min(N - 1, Math.ceil((Math.max(a[0], b[0]) + cap) / C));
        const z0 = Math.max(0, Math.floor((Math.min(a[1], b[1]) - cap) / C)), z1 = Math.min(N - 1, Math.ceil((Math.max(a[1], b[1]) + cap) / C));
        const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1;
        for (let j = z0; j <= z1; j++) for (let i = x0; i <= x1; i++) {
          const x = i * C, z = j * C, t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / L2, 0, 1);
          const d = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t) - half;
          if (d < arr[j * N + i]) arr[j * N + i] = d;
        }
      }
    }
  };
  fill(riverD, ctx.rivers, 90, (ln, a, b) => ctx.riverReach(Math.max(a[3] || 1, b[3] || 1)));
  fill(roadD, roads, 70, ln => (ln.width || 4) / 2);
  const field = (arr, x, z) => { const i = clamp(Math.round(x / C), 0, N - 1), j = clamp(Math.round(z / C), 0, N - 1); return arr[j * N + i] - C * 0.71; };
  const towns = plans.map(p => ({ x: p.origin.x, z: p.origin.z, r: p.town.radius, name: p.town.name, kind: p.town.kind, hub: !!p.town.hub, plan: p }));
  const pins = ctx.pins || [];
  const taken = [];   // [{x, z, r, R?}] footprints of accepted pieces (+ their fields)
  const hard = (x, z, pad) => x < PIECE_EDGE || z < PIECE_EDGE || x > ZM - PIECE_EDGE || z > ZM - PIECE_EDGE || !Number.isNaN(waterTop[gIdx(x, z)])
    || field(riverD, x, z) < pad || pins.some(p => Math.hypot(p.x - x, p.z - z) < p.r + pad);
  const townHit = (x, z, pad) => towns.some(t => Math.hypot(t.x - x, t.z - z) < t.r + pad);
  // what accepted pieces cover, rasterised at 2 m (a shape is marked once when it is taken; the test is then a lookup
  // at the point and at +-pad on each axis — the per-shape test was 70% of a zone bake)
  const OC = 2, ON = Math.ceil(ZM / OC) + 1, occ = new Uint8Array(ON * ON);
  const mark = o => {
    const rad = o.R ? Math.hypot(o.R.w, o.R.d) / 2 : o.r, cx = o.R ? o.R.cx : o.x, cz = o.R ? o.R.cz : o.z;
    for (let j = Math.max(0, Math.floor((cz - rad) / OC)); j <= Math.min(ON - 1, Math.ceil((cz + rad) / OC)); j++)
      for (let i = Math.max(0, Math.floor((cx - rad) / OC)); i <= Math.min(ON - 1, Math.ceil((cx + rad) / OC)); i++) {
        const x = i * OC, z = j * OC;
        if (o.R ? outside(o.R, x, z) <= OC * 0.71 : Math.hypot(x - cx, z - cz) <= o.r + OC * 0.71) occ[j * ON + i] = 1;
      }
  };
  taken.push = (...os) => { for (const o of os) { Array.prototype.push.call(taken, o); mark(o); } return taken.length; };
  const occAt = (x, z) => { const i = Math.round(x / OC), j = Math.round(z / OC); return i >= 0 && j >= 0 && i < ON && j < ON && occ[j * ON + i] === 1; };
  const takenHit = (x, z, pad) => occAt(x, z) || occAt(x + pad, z) || occAt(x - pad, z) || occAt(x, z + pad) || occAt(x, z - pad)
    || occAt(x + pad * 0.7, z + pad * 0.7) || occAt(x - pad * 0.7, z + pad * 0.7) || occAt(x + pad * 0.7, z - pad * 0.7) || occAt(x - pad * 0.7, z - pad * 0.7);
  /** A footprint is free: every sample clear of edges, water, rivers, pins, towns, roads (by `roadPad`), other pieces. */
  const free = (samples, { roadPad = 4, townPad = 14, pad = 4, riverPad = 6 } = {}) => samples.every(([x, z]) => !hard(x, z, riverPad) && !townHit(x, z, townPad) && field(roadD, x, z) >= roadPad && !takenHit(x, z, pad));
  /** how far the ground strays from its best plane over the samples (m), and that plane */
  const planeFit = (samples) => {
    let n = 0, sx = 0, sz = 0, sh = 0, sxx = 0, szz = 0, sxz = 0, sxh = 0, szh = 0;
    const x0 = samples[0][0], z0 = samples[0][1];
    for (const [x, z] of samples) { const X = x - x0, Z = z - z0, H = ground[gIdx(x, z)]; n++; sx += X; sz += Z; sh += H; sxx += X * X; szz += Z * Z; sxz += X * Z; sxh += X * H; szh += Z * H; }
    // normal equations for H = A + B X + C Z
    const m = [[n, sx, sz, sh], [sx, sxx, sxz, sxh], [sz, sxz, szz, szh]];
    for (let c = 0; c < 3; c++) { let p = c; for (let r = c + 1; r < 3; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r; [m[c], m[p]] = [m[p], m[c]]; if (Math.abs(m[c][c]) < 1e-9) return { res: 0, at: () => sh / n, slope: 0 }; for (let r = 0; r < 3; r++) if (r !== c) { const f = m[r][c] / m[c][c]; for (let k = c; k < 4; k++) m[r][k] -= f * m[c][k]; } }
    const A = m[0][3] / m[0][0], B = m[1][3] / m[1][1], Cc = m[2][3] / m[2][2];
    let res = 0; for (const [x, z] of samples) res = Math.max(res, Math.abs(ground[gIdx(x, z)] - (A + B * (x - x0) + Cc * (z - z0))));
    return { res, at: (x, z) => A + B * (x - x0) + Cc * (z - z0), slope: Math.atan(Math.hypot(B, Cc)) * 180 / Math.PI, mean: sh / n };
  };
  const nearestRoad = (x, z) => {
    let best = null;
    for (const r of roads) { const [d, k, t] = polyDist(r.pts, x, z); if (!best || d < best.d) { const a = r.pts[k], b = r.pts[k + 1]; best = { d, road: r, x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, h: hAt(r.pts, k, t), dir: Math.atan2(b[1] - a[1], b[0] - a[0]) }; } }
    return best;
  };
  const nearestTown = (x, z) => towns.slice().sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))[0] || null;
  /** search round a hint for the best spot (deterministic: fixed scan order, ties keep the first) */
  const search = (hint, reach, step, test) => {
    let best = null, bestS = Infinity;
    for (let dz = -reach; dz <= reach; dz += step) for (let dx = -reach; dx <= reach; dx += step) {
      const d = Math.hypot(dx, dz); if (d > reach) continue;
      const r = test(hint[0] + dx, hint[1] + dz); if (!r) continue;
      const s = r.score + d * 0.01; if (s < bestS) { bestS = s; best = r; }
    }
    return best;
  };

  // ---- ground preparation (in place). Skips water, road and town-street samples so a road keeps its grade.
  const prep = (R, { mode, ease = 8, weight = 0.9, disc = null }) => {
    const pad = ease + 2, rad = disc ? disc.r + pad : Math.hypot(R.w, R.d) / 2 + pad, cx = disc ? disc.x : R.cx, cz = disc ? disc.z : R.cz;
    const S = disc ? discSamples(disc.x, disc.z, disc.r, 4) : rectSamples(R, 4);
    const fit = planeFit(S), flat = S.reduce((s, [x, z]) => s + ground[gIdx(x, z)], 0) / S.length;
    const target = mode === 'flat' ? () => (disc?.h ?? R?.h ?? flat) : (x, z) => fit.at(x, z);
    const writes = [];
    for (let z = Math.floor((cz - rad) / 2) * 2; z <= cz + rad; z += 2) for (let x = Math.floor((cx - rad) / 2) * 2; x <= cx + rad; x += 2) {
      const o = disc ? Math.max(0, Math.hypot(x - disc.x, z - disc.z) - disc.r) : outside(R, x, z);
      if (o > ease) continue;
      const k = gIdx(x, z); if (!Number.isNaN(waterTop[k]) || ctx.roadMask[k]) continue;
      if (x < PIECE_EDGE - ease - 4 || z < PIECE_EDGE - ease - 4 || x > ZM - PIECE_EDGE + ease + 4 || z > ZM - PIECE_EDGE + ease + 4) continue;
      const w = o <= 0 ? weight : weight * (1 - smoothstep(0, 1, o / ease));
      // a target taken at the rect's own edge for samples outside it, so the plane does not run on past the rect
      let tx = x, tz = z;
      if (o > 0 && !disc) { const [lx, lz] = toLocal(R, x, z); [tx, tz] = toWorld(R, clamp(lx, -R.w / 2, R.w / 2), clamp(lz, -R.d / 2, R.d / 2)); }
      writes.push(k, ground[k] + (target(tx, tz) - ground[k]) * w * roadFade(ctx.roadMask, gIdx, x, z));
    }
    for (let q = 0; q < writes.length; q += 2) ground[writes[q]] = writes[q + 1];
    return { fit, flat };
  };

  const pieces = [];
  const add = p => { pieces.push(p); return p; };
  const fieldsOf = [];   // every field rect, for the hedge/fence/paint passes

  // ---- generic strip generator: candidate rects, keep the free + gentle ones
  const tryField = (R, owner, rng, opts = {}) => {
    const S = rectSamples(R, 6);
    if (!free(S, { roadPad: opts.roadPad ?? 3, townPad: opts.townPad ?? 12, pad: 3 })) return null;
    const f = planeFit(S); if (f.res > (opts.maxRes ?? 4.5) || f.slope > (opts.maxSlope ?? 12)) return null;
    const roll = rng(), crop = opts.crop || (roll < 0.36 ? 'field' : roll < 0.72 ? 'crop' : 'pasture');
    const fieldRec = { R, crop, owner, furrow: R.w >= R.d ? R.a : R.a + Math.PI / 2, hedge: crop === 'pasture' ? 'fence' : (rng() < (opts.hedgeShare ?? 0.75) ? 'hedge' : 'none'), cropKind: crop === 'crop' ? ['wheat', 'barley', 'oats', 'turnips', 'cabbages', 'flax'][Math.floor(rng() * 6)] : crop === 'pasture' ? (rng() < 0.6 ? 'sheep' : 'cattle') : 'tilled' };
    taken.push({ R });
    fieldsOf.push(fieldRec);
    return fieldRec;
  };

  const spec = specs.pieces.slice();
  // automatic pieces: a graveyard per planned settlement with none authored, a belt of fields round every one
  if (specs.auto) {
    for (const t of towns) {
      const has = spec.some(p => p.kind === 'graveyard' && (p.town === t.name || (p.near && Math.hypot(p.near[0] - t.x, p.near[1] - t.z) < t.r + 220)));
      if (!has) spec.push({ id: `${slug(t.name)}_graveyard`, kind: 'graveyard', town: t.name, auto: true, size: t.kind === 'hamlet' ? [20, 15] : t.kind === 'village' ? [26, 18] : [34, 24], chapel: t.kind !== 'hamlet' });
    }
    for (const t of towns) spec.push({ id: `${slug(t.name)}_belt`, kind: 'belt', town: t.name, auto: true, fields: t.kind === 'hamlet' ? 5 : t.kind === 'village' ? 7 : 10 });
  }
  // order: inns first (they need the crossing), then graveyards, farms, orchards, ponds, clearings, belts last
  const ORDER = { inn: 0, graveyard: 1, farm: 2, orchard: 3, mill_pond: 4, clearing: 5, sheepfold: 6, stone_circle: 6, copse: 7, belt: 8 };
  spec.sort((a, b) => (ORDER[a.kind] ?? 9) - (ORDER[b.kind] ?? 9) || (a.auto ? 1 : 0) - (b.auto ? 1 : 0));

  for (const sp of spec) {
    const rng = rngOf(`${id}:${sp.id}`);
    const town = sp.town ? towns.find(t => t.name === sp.town) : null;
    if (sp.town && !town) { log.push(`${sp.id}: no planned settlement "${sp.town}" here — skipped`); continue; }
    const hint = sp.near || (town ? [town.x, town.z] : [ZM / 2, ZM / 2]);
    const name = sp.name || null;

    if (sp.kind === 'inn') {
      const [aId, bId] = sp.at || [];
      const A = roads.find(r => r.id === aId || r.id === `lane_${aId}`), B = roads.find(r => r.id === bId || r.id === `lane_${bId}`);
      if (!A || !B) { log.push(`${sp.id}: roads ${aId} / ${bId} not found`); continue; }
      const X = crossPolylines(A.pts, B.pts) || (() => { const [d, k, t] = polyDist(B.pts, A.pts[A.pts.length - 1][0], A.pts[A.pts.length - 1][1]); return d < 10 ? [B.pts[k][0] + (B.pts[k + 1][0] - B.pts[k][0]) * t, B.pts[k][1] + (B.pts[k + 1][1] - B.pts[k][1]) * t, A.pts.length - 2, 1, k, t] : null; })();
      if (!X) { log.push(`${sp.id}: ${aId} and ${bId} do not meet`); continue; }
      const xh = hAt(A.pts, X[2], X[3]);
      const dirA = Math.atan2(A.pts[X[2] + 1][1] - A.pts[X[2]][1], A.pts[X[2] + 1][0] - A.pts[X[2]][0]);
      const [w, d] = sp.size || [34, 26];
      // four corners between the roads: the yard is aligned to road A, set back so it clears both roads
      let best = null;
      for (const [u, v] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) for (let back = 6; back <= 22; back += 2) {
        const R = makeRect(0, 0, w, d, dirA);
        const [cx, cz] = toWorld({ ...R, cx: X[0], cz: X[1] }, u * (w / 2 + back), v * (d / 2 + back));
        R.cx = cx; R.cz = cz;
        const S = rectSamples(R, 4);
        if (!free(S, { roadPad: 2.5, townPad: 20, pad: 4 })) continue;
        const f = planeFit(S); const sc = f.res + Math.abs(f.mean - xh) * 0.5 + back * 0.05;
        if (!best || sc < best.sc) best = { R, sc, u, v };
        break;
      }
      if (!best) { log.push(`${sp.id}: no free corner at the crossing`); continue; }
      const R = best.R; R.h = xh + (ground[gIdx(R.cx, R.cz)] - xh) * 0.3;
      prep(R, { mode: 'flat', ease: 10, weight: 0.95 });
      taken.push({ R: { ...R, w: R.w + 4, d: R.d + 4 } });
      // the inn fronts the crossing: the long side nearest the crossing point
      const toX = Math.atan2(X[1] - R.cz, X[0] - R.cx);
      const innR = makeRect(...toWorld(R, -best.u * w * 0.18, -best.v * d * 0.14), 14, 9, dirA);
      const faceA = (Math.sin(toX - dirA) >= 0 ? 1 : -1) * Math.PI / 2 + dirA;    // perpendicular to road A, toward the crossing side
      const stableR = makeRect(...toWorld(R, best.u * w * 0.28, -best.v * d * 0.18), 10, 6, dirA);
      const well = toWorld(R, best.u * w * 0.05, best.v * d * 0.28);
      const arms = [A, B].flatMap(r => [-1, 1].map(sg => ({ road: r, sg }))).map(({ road: r, sg }) => {
        const k = X[r === A ? 2 : 4], seg = sg > 0 ? [r.pts[k], r.pts[Math.min(r.pts.length - 1, k + 1)]] : [r.pts[k + 1], r.pts[k]];
        const yaw = +Math.atan2(seg[1][0] - seg[0][0], seg[1][1] - seg[0][1]).toFixed(4);
        const to = (r.to && (sg > 0 ? r.to[1] : r.to[0])) || null;
        return { yaw, to, road: r.id };
      }).filter(a => a.to);
      add({ id: sp.id, kind: 'inn', name: name || 'Crossroads Inn', R, x: R.cx, z: R.cz, r: Math.hypot(w, d) / 2, crossing: { x: X[0], z: X[1], h: xh, arms },
        buildings: [{ R: innR, want: 'inn', face: faceA, label: name || 'Inn', lit: true }, { R: stableR, want: 'stable', face: faceA, label: 'Stables', lit: false }],
        slots: [{ kind: 'innkeeper', ...front(innR, faceA) }, { kind: 'stablehand', ...front(stableR, faceA) }, { kind: 'well', x: well[0], z: well[1], r: 1.2 }],
        surface: 'yard' });
      continue;
    }

    if (sp.kind === 'graveyard') {
      const [w, d] = sp.size || [34, 24];
      const reach = sp.near ? 120 : 260;
      const centre = sp.near || (town ? [town.x, town.z] : hint);
      const res = search(centre, reach, 8, (x, z) => {
        if (town && !sp.near) { const dt = Math.hypot(x - town.x, z - town.z); if (dt < town.r + 26 || dt > town.r + 170) return null; }
        const nr = nearestRoad(x, z); const a = nr && nr.d < 90 ? nr.dir : (sp.yaw ?? rng() * Math.PI);
        const R = makeRect(x, z, w, d, a), S = rectSamples(R, 4);
        if (!free(S, { roadPad: 4, townPad: 18, pad: 6 })) return null;
        const f = planeFit(S); if (f.res > 3.2 || f.slope > 10) return null;
        const ds = town ? Math.hypot(x - town.x, z - town.z) - town.r : 0;
        return { R, score: f.res * 2 + f.slope * 0.3 + (nr ? Math.max(0, nr.d - 30) * 0.03 : 2) + ds * 0.01 };
      });
      if (!res) { log.push(`${sp.id}: no room for a graveyard`); continue; }
      const R = res.R;
      const pr = prep(R, { mode: 'flat', ease: 9, weight: 0.97 });
      R.h = pr.flat;
      taken.push({ R: { ...R, w: R.w + 6, d: R.d + 6 } });
      // gate on the side facing the nearest road (else the town)
      const nr = nearestRoad(R.cx, R.cz), look = nr && nr.d < 120 ? [nr.x, nr.z] : town ? [town.x, town.z] : [R.cx, R.cz + 1];
      const [lx, lz] = toLocal(R, look[0], look[1]);
      const side = Math.abs(lx) / R.w > Math.abs(lz) / R.d ? (lx > 0 ? 'E' : 'W') : (lz > 0 ? 'S' : 'N');   // local sides
      const gate = sideGate(R, side, 3.2);
      const graves = [], hw = R.w / 2 - 2.2, hd = R.d / 2 - 2.2;
      // the path runs from the gate across the yard; graves in rows parallel to the gate side, a chapel at the far end
      const alongX = side === 'N' || side === 'S';                       // path runs along local z when the gate is N/S
      const chapel = sp.chapel !== false && (sp.chapel || (town && town.kind !== 'hamlet')) && R.w * R.d >= 600;
      const farSign = side === 'S' || side === 'E' ? -1 : 1;
      let chapelR = null;
      if (chapel) {
        const cw = 7.5, cd = 5.5;
        const [px, pz] = alongX ? [0, farSign * (hd - cd / 2 + 0.6)] : [farSign * (hw - cw / 2 + 0.6), 0];
        chapelR = makeRect(...toWorld(R, px, pz), alongX ? cw : cd, alongX ? cd : cw, R.a);
      }
      const styles = ['headstone', 'headstone', 'headstone', 'cross', 'cross', 'slab', 'mound', 'mound', 'tomb'];
      const rowStep = 2.7, colStep = 1.6;
      for (let a = -hw; a <= hw; a += alongX ? colStep : rowStep) for (let b = -hd; b <= hd; b += alongX ? rowStep : colStep) {
        if (alongX ? Math.abs(a) < 2.2 : Math.abs(b) < 2.2) continue;     // the path
        const [x, z] = toWorld(R, a + (rng() - 0.5) * 0.25, b + (rng() - 0.5) * 0.25);
        if (chapelR && outside(chapelR, x, z) < 1.4) continue;
        if (rng() < 0.16) continue;                                         // gaps: not every plot is filled
        const st = styles[Math.floor(rng() * styles.length)];
        // graves face the gate side (east-facing tradition aside, a row reads as a row)
        const faceYaw = yawOfAngle(R.a + ({ E: 0, W: Math.PI, S: Math.PI / 2, N: -Math.PI / 2 })[side]);
        graves.push([r2(x), r2(z), +(faceYaw + (rng() - 0.5) * 0.08).toFixed(3), st]);
      }
      const yews = [[-1, -1], [1, 1], [1, -1], [-1, 1]].filter((_, q) => q < 2 || rng() < 0.4).map(([u, v]) => toWorld(R, u * (hw - 0.4), v * (hd - 0.4)));
      const g = add({ id: sp.id, kind: 'graveyard', name: name || (town ? `${town.name} Graveyard` : 'Old Graveyard'), town: town?.name || nearestTown(R.cx, R.cz)?.name || null, R, x: R.cx, z: R.cz, r: Math.hypot(R.w, R.d) / 2, side, gate, graves, yews, surface: 'graveyard',
        walls: [{ kind: 'wall', pts: wallWithGap(R, side, 3.2, 0.4), h: 0.95, material: 'drystone' }],
        buildings: chapelR ? [{ R: chapelR, want: 'chapel', face: gate.angleIn + Math.PI, label: 'Chapel', lit: false }] : [],
        slots: [{ kind: 'gravedigger', x: gate.x, z: gate.z, r: 1.5, yaw: gate.yawIn }], auto: !!sp.auto });
      g.pathFrom = outFrom(gate, 4);
      continue;
    }

    if (sp.kind === 'farm' || sp.kind === 'orchard') {
      const isOrch = sp.kind === 'orchard';
      const [fw, fd] = isOrch ? (sp.size || [56, 40]) : (sp.fieldSize || [50, 32]);
      const yardR0 = isOrch ? 0 : 15;
      const res = search(hint, sp.reach ?? 140, 8, (x, z) => {
        const nr = nearestRoad(x, z); const a = sp.yaw ?? (nr && nr.d < 160 ? nr.dir : rng() * Math.PI);
        const R = isOrch ? makeRect(x, z, fw, fd, a) : makeRect(x, z, yardR0 * 2 + 4, yardR0 * 2 + 4, a);
        const S = rectSamples(R, 4);
        if (!free(S, { roadPad: 4, townPad: 16, pad: 6 })) return null;
        const f = planeFit(S); if (f.res > (isOrch ? 2.6 : 1.8) || f.slope > 9) return null;
        // a farm wants room for its fields: count free neighbour cells
        let room = 0;
        if (!isOrch) for (const [u, v] of GRID8) { const C2 = makeRect(...toWorld(R, u * (fw + 6), v * (fd + 6)), fw, fd, a); if (free(rectSamples(C2, 8), { roadPad: 3, townPad: 12, pad: 3 })) room++; }
        return { R, score: f.res + f.slope * 0.2 - room * 0.8 + (nr ? Math.max(0, nr.d - 60) * 0.01 : 1) };
      });
      if (!res) { log.push(`${sp.id}: no room for ${sp.kind}`); continue; }
      const R = res.R;
      if (isOrch) {
        prep(R, { mode: 'plane', ease: 8, weight: 0.8 });
        taken.push({ R: { ...R, w: R.w + 6, d: R.d + 6 } });
        const nr = nearestRoad(R.cx, R.cz), [lx, lz] = toLocal(R, nr?.x ?? R.cx, nr?.z ?? R.cz + 1);
        const side = Math.abs(lx) / R.w > Math.abs(lz) / R.d ? (lx > 0 ? 'E' : 'W') : (lz > 0 ? 'S' : 'N');
        const gate = sideGate(R, side, 3);
        const shedR = makeRect(...toWorld(R, ...gateInset(side, R, 6, 3)), 5, 4, R.a);
        const trees = [], sx = sp.spacing || 6.5, sz = (sp.spacing || 6.5) + 0.8;
        for (let a = -R.w / 2 + 4; a <= R.w / 2 - 3.5; a += sx) for (let b = -R.d / 2 + 4; b <= R.d / 2 - 3.5; b += sz) {
          const [x, z] = toWorld(R, a + (rng() - 0.5) * 0.6, b + (rng() - 0.5) * 0.6);
          if (Math.hypot(x - gate.x, z - gate.z) < 5 || outside(shedR, x, z) < 2.5) continue;
          if (rng() < 0.06) continue;                                     // a gap where one died
          trees.push([x, z]);
        }
        const fruit = sp.fruit || ['apple', 'pear', 'plum', 'cherry'][Math.floor(rng() * 4)];
        add({ id: sp.id, kind: 'orchard', name: name || `${fruit[0].toUpperCase()}${fruit.slice(1)} Orchard`, town: nearestTown(R.cx, R.cz)?.name || null, R, x: R.cx, z: R.cz, r: Math.hypot(R.w, R.d) / 2, gate, fruit, trees, surface: 'orchard',
          walls: [{ kind: sp.boundary || 'hedge', pts: wallWithGap(R, side, 3, 0.6), h: 1.5 }],
          buildings: [{ R: shedR, want: 'hut', face: gate.angleIn + Math.PI, label: null, lit: false }],
          slots: [{ kind: 'picker', x: gate.x, z: gate.z, r: 1.5, yaw: gate.yawIn }], pathFrom: outFrom(gate, 4) });
        continue;
      }
      // a farm: flat yard + fields on the 3x3 grid round it (corner cells sometimes split in two)
      const yard = makeRect(R.cx, R.cz, yardR0 * 2, yardR0 * 2, R.a);
      const yp = prep({ ...yard, w: yard.w + 2, d: yard.d + 2 }, { mode: 'flat', ease: 8, weight: 0.95 });
      yard.h = yp.flat;
      taken.push({ R: { ...yard, w: yard.w + 6, d: yard.d + 6 } });
      const fields = [], want = sp.fields ?? 6;
      const order = GRID8.slice().sort((p, q) => (Math.abs(p[0]) + Math.abs(p[1])) - (Math.abs(q[0]) + Math.abs(q[1])) || rng() - 0.5);
      for (const [u, v] of order) {
        if (fields.length >= want) break;
        const [cx, cz] = toWorld(R, u * (fw + 6), v * (fd + 6));
        const split = u !== 0 && v !== 0 && rng() < 0.5;
        const rects = split ? [-1, 1].map(s => makeRect(...toWorld(makeRect(cx, cz, fw, fd, R.a), s * fw / 4, 0), fw / 2 - 1.5, fd, R.a)) : [makeRect(cx, cz, fw, fd, R.a)];
        for (const FR of rects) { const f = tryField(FR, sp.id, rng); if (f) { f.gateToward = [yard.cx, yard.cz]; fields.push(f); } }
      }
      for (const f of fields) f.prep = prep(f.R, { mode: 'plane', ease: 6, weight: 0.85 });
      const house = makeRect(...toWorld(yard, -yardR0 * 0.35, -yardR0 * 0.4), 10, 7, R.a);
      const barn = makeRect(...toWorld(yard, yardR0 * 0.45, -yardR0 * 0.25), 9, 12, R.a);
      const nr = nearestRoad(yard.cx, yard.cz);
      add({ id: sp.id, kind: 'farm', name: name || 'Farmstead', town: nearestTown(R.cx, R.cz)?.name || null, R: yard, x: yard.cx, z: yard.cz, r: yardR0 * 1.42, fields, surface: 'yard',
        buildings: sp.buildings === false ? [] : [{ R: house, want: 'house', face: yawFace(R.a, nr ? [nr.x, nr.z] : null, yard), label: null, lit: false }, { R: barn, want: 'granary', face: yawFace(R.a, nr ? [nr.x, nr.z] : null, yard), label: null, lit: false }],
        slots: [{ kind: 'farmstead', x: yard.cx, z: yard.cz, r: yardR0, yaw: 0 }, { kind: 'farmer', ...front(house, yawFace(R.a, nr ? [nr.x, nr.z] : null, yard)) }],
        pathFrom: { x: yard.cx, z: yard.cz, r: yardR0 * 1.42 + 6 } });
      continue;
    }

    if (sp.kind === 'mill_pond') {
      const rx = sp.r || 20, rz = (sp.r || 20) * 0.7;
      const res = search(hint, sp.reach ?? 120, 8, (x, z) => {
        const a = sp.yaw ?? rng() * Math.PI, R = makeRect(x, z, rx * 2 + 24, rz * 2 + 24, a);
        const S = rectSamples(R, 5);
        if (!free(S, { roadPad: 4, townPad: 16, pad: 6, riverPad: sp.riverPad ?? 4 })) return null;
        const f = planeFit(S); if (f.slope > 8) return null;
        // a mill wants a gentle slope (water runs out on the low side) and to be near running water
        const rd = field(riverD, x, z);
        return { R, score: Math.abs(f.slope - 3) * 0.4 + f.res * 0.6 + Math.max(0, rd - 20) * 0.02 };
      });
      if (!res) { log.push(`${sp.id}: no room for a mill pond`); continue; }
      const R = res.R, pond = { x: R.cx, z: R.cz, rx, rz, a: R.a };
      taken.push({ R });
      add({ id: sp.id, kind: 'mill_pond', name: name || 'Mill Pond', town: nearestTown(R.cx, R.cz)?.name || null, R, x: R.cx, z: R.cz, r: Math.hypot(R.w, R.d) / 2, pond, buildings: [], slots: [], walls: [], pending: true });
      continue;
    }

    if (sp.kind === 'clearing') {
      const r = sp.r || 22;
      const res = search(hint, sp.reach ?? 100, 8, (x, z) => {
        const S = discSamples(x, z, r + 2, 5);
        if (!free(S, { roadPad: 6, townPad: 30, pad: 8 })) return null;
        const f = planeFit(S); if (f.res > 3 || f.slope > 12) return null;
        return { R: null, x, z, score: f.res + f.slope * 0.2 };
      });
      if (!res) { log.push(`${sp.id}: no room for a clearing`); continue; }
      const disc = { x: res.x, z: res.z, r };
      prep(null, { mode: 'plane', ease: 10, weight: 0.6, disc });
      taken.push({ x: res.x, z: res.z, r: r + 4 });
      add({ id: sp.id, kind: 'clearing', name: name || 'Clearing', town: nearestTown(res.x, res.z)?.name || null, R: null, x: res.x, z: res.z, r, for: sp.for || 'camp', surface: 'yard', yardR: r * 0.45,
        slots: [{ kind: sp.for || 'camp', x: res.x, z: res.z, r: r * 0.6, yaw: 0 }], buildings: [], walls: [], pathFrom: sp.path === false ? null : { x: res.x, z: res.z, r: r + 5 } });
      continue;
    }

    if (sp.kind === 'stone_circle' || sp.kind === 'sheepfold' || sp.kind === 'copse') {
      const r = sp.r || ({ stone_circle: 10, sheepfold: 9, copse: 30 })[sp.kind];
      const res = search(hint, sp.reach ?? 120, 8, (x, z) => {
        const S = discSamples(x, z, r + 3, 5);
        if (!free(S, { roadPad: 5, townPad: 30, pad: 8 })) return null;
        const f = planeFit(S); if (sp.kind !== 'copse' && (f.res > 2.5 || f.slope > 12)) return null;
        // a stone circle wants a rise to stand on; a fold wants the lee; a copse anywhere not too steep
        return { x, z, score: f.res + f.slope * 0.15 - (sp.kind === 'stone_circle' ? ground[gIdx(x, z)] * 0.02 : 0) };
      });
      if (!res) { log.push(`${sp.id}: no room for a ${sp.kind}`); continue; }
      const disc = { x: res.x, z: res.z, r };
      if (sp.kind !== 'copse') prep(null, { mode: 'plane', ease: 8, weight: 0.7, disc });
      taken.push({ x: res.x, z: res.z, r: r + 4 });
      const P = { id: sp.id, kind: sp.kind, name: name || ({ stone_circle: 'Standing Stones', sheepfold: 'Sheepfold', copse: 'Copse' })[sp.kind], town: nearestTown(res.x, res.z)?.name || null, R: null, x: res.x, z: res.z, r, buildings: [], walls: [], slots: [] };
      if (sp.kind === 'stone_circle') {
        const n = sp.stones || 9 + Math.floor(rng() * 5), a0 = rng() * TAU;
        P.stones = Array.from({ length: n }, (_, q) => { const a = a0 + q / n * TAU + (rng() - 0.5) * 0.12; return [res.x + Math.cos(a) * r, res.z + Math.sin(a) * r, +(a + Math.PI / 2).toFixed(3), rng() < 0.18 ? 'fallen' : 'standing']; });
        P.altar = [res.x, res.z];
        P.slots = [{ kind: 'ritual', x: res.x, z: res.z, r: r * 0.6, yaw: 0 }];
      } else if (sp.kind === 'sheepfold') {
        const n = 20, gapA = rng() * TAU, pts = [];
        for (let q = 0; q <= n; q++) { const a = gapA + 0.32 + q / n * (TAU - 0.64); pts.push([r2(res.x + Math.cos(a) * r), r2(res.z + Math.sin(a) * r)]); }
        P.walls = [{ kind: 'wall', pts, h: 1.0, material: 'drystone' }];
        P.gate = { x: r2(res.x + Math.cos(gapA) * r), z: r2(res.z + Math.sin(gapA) * r), width: 2 * r * Math.sin(0.32), side: null, yawIn: yawOfAngle(gapA + Math.PI), angleIn: gapA + Math.PI };
        P.surface = 'pasture'; P.pastureR = r - 0.5;
        P.slots = [{ kind: 'shepherd', x: P.gate.x + Math.cos(gapA) * 2, z: P.gate.z + Math.sin(gapA) * 2, r: 1.5, yaw: P.gate.yawIn }, { kind: 'flock', x: res.x, z: res.z, r: r * 0.7, yaw: 0 }];
        P.pathFrom = outFrom(P.gate, 4);
      } else {
        P.trees = []; P.treeKind = sp.tree === 'conifer' ? KIND_CONIFER : 0;
        for (let q = 0; q < r * r * 0.12; q++) { const a = rng() * TAU, d = Math.sqrt(rng()) * r * (0.75 + 0.25 * Math.sin(a * 3 + rng())); P.trees.push([res.x + Math.cos(a) * d, res.z + Math.sin(a) * d]); }
        P.bushes = []; for (let q = 0; q < r * 0.9; q++) { const a = rng() * TAU, d = r * (0.9 + rng() * 0.25); P.bushes.push([res.x + Math.cos(a) * d, res.z + Math.sin(a) * d]); }
      }
      add(P);
      continue;
    }

    if (sp.kind === 'belt') {
      // field strips round a settlement, outside its ring: two rings of candidates, tangential strips
      const t = town; if (!t) continue;
      const fields = [], want = sp.fields || 6;
      const [fw, fd] = sp.fieldSize || [46, 26];
      const a0 = rng() * TAU;
      for (const ring of [t.r + 24, t.r + 58, t.r + 92]) {
        const n = Math.max(6, Math.round(TAU * ring / (fw + 10)));
        for (let q = 0; q < n && fields.length < want; q++) {
          const ang = a0 + q / n * TAU + (ring % 2 ? 0.5 / n * TAU : 0);
          const cx = t.x + Math.cos(ang) * ring, cz = t.z + Math.sin(ang) * ring;
          const FR = makeRect(cx, cz, fw, fd, ang + Math.PI / 2);
          const f = tryField(FR, sp.id, rng, { townPad: 10, hedgeShare: 0.6, maxRes: 4 });
          if (f) { f.gateToward = [t.x, t.z]; fields.push(f); }
        }
      }
      for (const f of fields) f.prep = prep(f.R, { mode: 'plane', ease: 6, weight: 0.85 });
      if (fields.length) add({ id: sp.id, kind: 'belt', name: null, town: t.name, R: null, x: t.x, z: t.z, r: t.r + 120, fields, buildings: [], slots: [], walls: [], auto: true });
      continue;
    }
    log.push(`${sp.id}: unknown kind ${sp.kind}`);
  }

  // hedges / fences round every field (a gate on the side facing its yard or town)
  for (const p of pieces) for (const f of p.fields || []) {
    if (f.hedge === 'none') continue;
    const [lx, lz] = toLocal(f.R, ...(f.gateToward || [f.R.cx, f.R.cz + 1]));
    const side = Math.abs(lx) / f.R.w > Math.abs(lz) / f.R.d ? (lx > 0 ? 'E' : 'W') : (lz > 0 ? 'S' : 'N');
    f.gate = sideGate(f.R, side, f.hedge === 'fence' ? 3 : 4);
    f.walls = [{ kind: f.hedge, pts: wallWithGap(f.R, side, f.hedge === 'fence' ? 3 : 4, 0.8), h: f.hedge === 'fence' ? 1.1 : 1.6 }];
  }
  return { pieces, log };
}

/** a point `d` m outside a gate (path start) */
const outFrom = (g, d) => ({ x: g.x - Math.cos(g.angleIn) * d, z: g.z - Math.sin(g.angleIn) * d, r: 0 });
const GRID8 = [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]];
/** a point 1.2 m in front of a building's door side, facing the building */
function front(R, faceAngle) {
  const half = (Math.abs(Math.cos(faceAngle - R.a)) > 0.7 ? R.w : R.d) / 2 + 1.2;
  return { x: R.cx + Math.cos(faceAngle) * half, z: R.cz + Math.sin(faceAngle) * half, r: 1, yaw: yawOfAngle(faceAngle + Math.PI) };
}
/** the angle a building in rect frame `a` faces: whichever of its four sides points most toward `look` */
function yawFace(a, look, R) {
  if (!look) return a + Math.PI / 2;
  const want = Math.atan2(look[1] - R.cz, look[0] - R.cx);
  let best = a, bd = Infinity;
  for (let q = 0; q < 4; q++) { const s = a + q * Math.PI / 2, d = Math.abs(Math.atan2(Math.sin(want - s), Math.cos(want - s))); if (d < bd) { bd = d; best = s; } }
  return best;
}
/** gate point on a rect side ('N' = local -z, 'S' = +z, 'W' = -x, 'E' = +x); yawIn = facing INTO the rect */
function sideGate(R, side, width) {
  const [lx, lz] = { N: [0, -R.d / 2], S: [0, R.d / 2], W: [-R.w / 2, 0], E: [R.w / 2, 0] }[side];
  const [x, z] = toWorld(R, lx, lz), inAng = R.a + ({ E: Math.PI, W: 0, S: -Math.PI / 2, N: Math.PI / 2 })[side];
  return { x: r2(x), z: r2(z), width, side, yawIn: yawOfAngle(inAng), angleIn: inAng };
}
function gateInset(side, R, along, inset) {
  return { N: [along, -R.d / 2 + inset], S: [along, R.d / 2 - inset], W: [-R.w / 2 + inset, along], E: [R.w / 2 - inset, along] }[side];
}
/** a closed rect outline inset `inset` m, opened by a gap `gap` m wide in the middle of `side` -> one open polyline */
function wallWithGap(R, side, gap, inset) {
  const hw = R.w / 2 - inset, hd = R.d / 2 - inset, g = gap / 2;
  // walk clockwise from the gap's far post round to its near post (local coords)
  const loops = {
    N: [[g, -hd], [hw, -hd], [hw, hd], [-hw, hd], [-hw, -hd], [-g, -hd]],
    E: [[hw, g], [hw, hd], [-hw, hd], [-hw, -hd], [hw, -hd], [hw, -g]],
    S: [[-g, hd], [-hw, hd], [-hw, -hd], [hw, -hd], [hw, hd], [g, hd]],
    W: [[-hw, -g], [-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd], [-hw, g]],
  };
  return loops[side].map(([u, v]) => toWorld(R, u, v).map(r2));
}

// ------------------------------------------------------------------------------------------------ 2b. stream E's set pieces
/**
 * Stream E's hand-designed set pieces (data/vignettes/setpieces.json, placed by E's placer into
 * data/vignettes/placements/<zone>.json as `{type:'vignette', setpiece:true, x, z, yaw, radius, ground:{flat, surface}}`):
 * the bake levels the disc (`flat`: level; else eased toward a plane so it is not lumpy), paints `surface` over it, paints
 * the recipe's `fields` (crop plots) and keeps its `buildings` in nav. Recipe offsets rotate like js/sim/vignettes.js
 * vignettePoint (x' = x + lx cos + lz sin, z' = z - lx sin + lz cos). A disc that would land on one of B's own pieces is
 * skipped (logged) — E re-places round B's set_piece/field placements, so that only happens on the first bake.
 * Mutates ground; returns [{id, x, z, r, surface, fields: [{R, crop}], buildings: [R]}].
 */
export function prepareEPieces(ctx, vignettes, recipes, bPieces, log = []) {
  const { ground, gIdx, waterTop, roadMask, ZM } = ctx;
  const byId = new Map((recipes || []).map(r => [r.id, r]));
  const keepOff = setPieceKeepOff(bPieces);
  const out = [];
  for (const v of vignettes || []) {
    if (!v.setpiece || !v.ground || !(v.radius > 0)) continue;
    const rc = byId.get(v.id) || byId.get(v.vignette) || {};
    const r = v.radius, c = Math.cos(v.yaw || 0), s = Math.sin(v.yaw || 0);
    if (Math.min(v.x, v.z, ZM - v.x, ZM - v.z) - r - 8 < 24)   // the ease must stay well off the shared edge samples
       { log.push(`E ${v.id}: too near the zone edge — ground left as is`); continue; }
    if (discSamples(v.x, v.z, r, 6).some(([x, z]) => keepOff(x, z))) { log.push(`E ${v.id}: overlaps a B set piece — ground left as is (E re-places)`); continue; }
    // level: the disc + 8 m ease; flat = to the mean, else 50% toward the best plane
    const S = discSamples(v.x, v.z, r, 4);
    let mean = 0; for (const [x, z] of S) mean += ground[gIdx(x, z)]; mean /= S.length;
    const ease = 8, writes = [];
    for (let z = Math.floor((v.z - r - ease) / 2) * 2; z <= v.z + r + ease; z += 2) for (let x = Math.floor((v.x - r - ease) / 2) * 2; x <= v.x + r + ease; x += 2) {
      const o = Math.max(0, Math.hypot(x - v.x, z - v.z) - r); if (o > ease) continue;
      const k = gIdx(x, z); if (!Number.isNaN(waterTop[k]) || roadMask[k]) continue;
      const w = (v.ground.flat ? 0.95 : 0.45) * (o <= 0 ? 1 : 1 - smoothstep(0, 1, o / ease));
      writes.push(k, ground[k] + (mean - ground[k]) * w * roadFade(roadMask, gIdx, x, z));
    }
    for (let q = 0; q < writes.length; q += 2) ground[writes[q]] = writes[q + 1];
    const toW = (lx, lz) => [v.x + lx * c + lz * s, v.z - lx * s + lz * c];
    const rectOf = (f) => makeRect(...toW(f.x || 0, f.z || 0), f.w || 6, f.d || 6, -((v.yaw || 0) + (f.yaw || 0)));
    out.push({ id: v.id, x: v.x, z: v.z, r, surface: E_SURFACE[v.ground.surface] ?? null,
      fields: (rc.fields || []).map(f => ({ R: rectOf(f), crop: /fallow|plough|till/i.test(f.crop || '') ? 'field' : 'crop', grows: f.crop || null })),
      buildings: (rc.buildings || []).map(rectOf) });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ 3. ponds
/** Dig every pending mill pond (after the rivers and bridges, before the wet skirt). Mutates ground/waterTop/waterKind. */
export function carvePonds(ctx, pieces) {
  const { ground, waterTop, waterKind, gIdx, roadMask } = ctx;
  for (const p of pieces) {
    if (p.kind !== 'mill_pond' || !p.pending) continue;
    delete p.pending;
    const { x, z, rx, rz, a } = p.pond, c = Math.cos(a), s = Math.sin(a);
    const ell = (px, pz) => { const dx = px - x, dz = pz - z, lx = dx * c + dz * s, lz = -dx * s + dz * c; return Math.hypot(lx / rx, lz / rz); };
    // the rim: the lowest ground just outside the outline sets the level (water can never spill)
    let lo = Infinity, loAt = null;
    for (let q = 0; q < 64; q++) { const t = q / 64 * TAU, lx = Math.cos(t) * (rx + 3), lz = Math.sin(t) * (rz + 3), px = x + lx * c - lz * s, pz = z + lx * s + lz * c; const h = ground[gIdx(px, pz)]; if (h < lo) { lo = h; loAt = [px, pz]; } }
    const level = lo - 0.3, depth = 1.7, BANK = 7;
    const R = Math.max(rx, rz) + BANK + 4;
    for (let pz = Math.floor((z - R) / 2) * 2; pz <= z + R; pz += 2) for (let px = Math.floor((x - R) / 2) * 2; px <= x + R; px += 2) {
      const e = ell(px, pz), k = gIdx(px, pz);
      if (roadMask[k]) continue;
      if (e <= 1) {
        ground[k] = Math.min(ground[k], level - 0.15 - depth * (1 - e * e));
        waterTop[k] = level; waterKind[k] = 2;
      } else {
        const out = (e - 1) * Math.min(rx, rz);           // ~metres outside the outline
        if (out > BANK) continue;
        const lip = level + 0.45 * smoothstep(0, 1, out / 2);
        if (ground[k] < lip) ground[k] = lip;                                // never lower than the lip: the pond holds
        else ground[k] = lip + (ground[k] - lip) * smoothstep(0, 1, out / BANK);
      }
    }
    p.level = +level.toFixed(2);
    // the mill on the low side, its wheel at the water's edge, facing out from the pond
    const ang = Math.atan2(loAt[1] - z, loAt[0] - x);
    const edge = (() => { for (let rr = 0; rr < Math.max(rx, rz) * 1.2; rr += 0.5) if (ell(x + Math.cos(ang) * rr, z + Math.sin(ang) * rr) > 1) return rr; return Math.max(rx, rz); })();
    const mx = x + Math.cos(ang) * (edge + 6.5), mz = z + Math.sin(ang) * (edge + 6.5);
    const millR = makeRect(mx, mz, 9, 7, ang + Math.PI / 2);
    // the mill pad: flat at the lip height so the mill stands on dry ground beside the water
    const padH = level + 0.6;
    for (let pz = Math.floor((mz - 9) / 2) * 2; pz <= mz + 9; pz += 2) for (let px = Math.floor((mx - 9) / 2) * 2; px <= mx + 9; px += 2) {
      const o = outside({ ...millR, w: millR.w + 2, d: millR.d + 2 }, px, pz), k = gIdx(px, pz); if (o > 3 || !Number.isNaN(waterTop[k])) continue;
      const w = o <= 0 ? 1 : 1 - smoothstep(0, 1, o / 3); ground[k] += (padH - ground[k]) * w;
    }
    p.buildings = [{ R: millR, want: 'mill', face: ang, label: 'Mill', lit: false }];
    p.wheel = { x: r2(x + Math.cos(ang) * (edge + 1.2)), z: r2(z + Math.sin(ang) * (edge + 1.2)), yaw: yawOfAngle(ang + Math.PI / 2) };
    p.slots = [{ kind: 'miller', ...front(millR, ang) }];
    p.surface = null;
    // reeds round the margin (just outside the waterline)
    p.reeds = [];
    const rng = rngOf('reeds:' + p.id);
    for (let q = 0; q < 90; q++) { const t = rng() * TAU, f = 1.02 + rng() * 0.12; const lx = Math.cos(t) * rx * f, lz = Math.sin(t) * rz * f; const px = x + lx * c - lz * s, pz = z + lx * s + lz * c; if (Math.hypot(px - mx, pz - mz) < 9) continue; p.reeds.push([px, pz]); }
  }
}

// ------------------------------------------------------------------------------------------------ paint, scatter, placements, nav
/** Paint surfaces into the zone biome array (SIZE²). surfaceId(key) -> biome index. Water and road are never painted over. */
export function paintSetPieces({ biome, SIZE, STEP, surfaceId, isProtected }, pieces, ePieces = []) {
  const paintRect = (R, key, pad = 0) => {
    const id = surfaceId(key), rad = Math.hypot(R.w, R.d) / 2 + pad + 2;
    for (let j = Math.max(0, Math.floor((R.cz - rad) / STEP)); j <= Math.min(SIZE - 1, Math.ceil((R.cz + rad) / STEP)); j++)
      for (let i = Math.max(0, Math.floor((R.cx - rad) / STEP)); i <= Math.min(SIZE - 1, Math.ceil((R.cx + rad) / STEP)); i++) {
        const o = j * SIZE + i; if (isProtected(o)) continue;
        if (inRect(R, i * STEP, j * STEP, pad)) biome[o] = id;
      }
  };
  const paintDisc = (x, z, r, key) => {
    const id = surfaceId(key);
    for (let j = Math.max(0, Math.floor((z - r) / STEP)); j <= Math.min(SIZE - 1, Math.ceil((z + r) / STEP)); j++)
      for (let i = Math.max(0, Math.floor((x - r) / STEP)); i <= Math.min(SIZE - 1, Math.ceil((x + r) / STEP)); i++) {
        const o = j * SIZE + i; if (isProtected(o)) continue;
        if (Math.hypot(i * STEP - x, j * STEP - z) <= r) biome[o] = id;
      }
  };
  for (const p of pieces) {
    for (const f of p.fields || []) paintRect(f.R, f.crop);
    if (p.surface && p.R) paintRect(p.R, p.surface);
    if (p.kind === 'clearing') paintDisc(p.x, p.z, p.yardR, 'yard');
    if (p.kind === 'sheepfold') paintDisc(p.x, p.z, p.pastureR, 'pasture');
    if (p.kind === 'graveyard') {   // the gravel path from the gate to the far wall (or the chapel)
      const R = p.R, along = p.side === 'N' || p.side === 'S';
      paintRect({ ...R, w: along ? 2.6 : R.w - 1, d: along ? R.d - 1 : 2.6 }, 'yard');
    }
    for (const b of p.buildings || []) paintRect({ ...b.R, w: b.R.w + 2, d: b.R.d + 2 }, 'yard');
  }
  for (const e of ePieces) {
    if (e.surface) paintDisc(e.x, e.z, e.r, e.surface);
    for (const f of e.fields) paintRect(f.R, f.crop);
  }
}

/** Scatter items {x, z, kind, scale, yaw, variant} for the pieces (hedges, fruit trees, yews, reeds). */
export function setPieceScatter(pieces, { isWet = () => false, onRoad = () => false } = {}) {
  const out = [];
  for (const p of pieces) {
    const rng = rngOf('scatter:' + p.id);
    const hedgeLine = (pts) => {
      for (let q = 0; q < pts.length - 1; q++) {
        const a = pts[q], b = pts[q + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        for (let s = 0.9; s < L - 0.4; s += 1.7) {
          const x = a[0] + (b[0] - a[0]) * s / L + (rng() - 0.5) * 0.3, z = a[1] + (b[1] - a[1]) * s / L + (rng() - 0.5) * 0.3;
          if (isWet(x, z) || onRoad(x, z)) continue;
          out.push({ x, z, kind: KIND_HEDGE, scale: 0.85 + rng() * 0.35, yaw: Math.atan2(b[0] - a[0], b[1] - a[1]), variant: Math.floor(rng() * 4) });
          if (rng() < 0.04) out.push({ x: x + (rng() - 0.5), z: z + (rng() - 0.5), kind: 0, scale: 0.8 + rng() * 0.5, yaw: rng() * TAU, variant: Math.floor(rng() * 4) });   // a hedgerow oak
        }
      }
    };
    for (const f of p.fields || []) for (const w of f.walls || []) if (w.kind === 'hedge') hedgeLine(w.pts);
    for (const w of p.walls || []) if (w.kind === 'hedge') hedgeLine(w.pts);
    for (const [x, z] of p.bushes || []) if (!onRoad(x, z) && !isWet(x, z)) out.push({ x, z, kind: KIND_BUSH, scale: 0.8 + rng() * 0.5, yaw: rng() * TAU, variant: Math.floor(rng() * 4) });
    for (const [x, z] of p.stones || []) out.push({ x, z, kind: 7, scale: 0.62 + rng() * 0.25, yaw: rng() * TAU, variant: Math.floor(rng() * 4) });
    if (p.altar) out.push({ x: p.altar[0], z: p.altar[1], kind: 6, scale: 0.9, yaw: rng() * TAU, variant: 0 });
    for (const [x, z] of p.trees || []) if (!onRoad(x, z) && !isWet(x, z)) out.push({ x, z, kind: p.treeKind ?? KIND_TREE_FRUIT, scale: 0.8 + rng() * 0.35, yaw: rng() * TAU, variant: Math.floor(rng() * 4) });
    for (const [x, z] of p.yews || []) out.push({ x, z, kind: KIND_CONIFER, scale: 0.75 + rng() * 0.3, yaw: rng() * TAU, variant: 3 });
    for (const [x, z] of p.reeds || []) if (!onRoad(x, z)) out.push({ x, z, kind: KIND_REED, scale: 0.8 + rng() * 0.6, yaw: rng() * TAU, variant: Math.floor(rng() * 4) });
  }
  return out;
}

/** True where random scatter must keep off (inside a piece footprint, its fields, or its buildings). */
export function setPieceKeepOff(pieces) {
  const rects = [], discs = [];
  for (const p of pieces) {
    if (p.R) rects.push({ ...p.R, w: p.R.w + 3, d: p.R.d + 3 });
    if (p.kind === 'clearing' || p.kind === 'stone_circle' || p.kind === 'sheepfold' || p.kind === 'copse') discs.push({ x: p.x, z: p.z, r: p.r + 2 });
    if (p.kind === 'mill_pond' && p.pond) discs.push({ x: p.pond.x, z: p.pond.z, r: Math.max(p.pond.rx, p.pond.rz) + 3 });
    if (p.kind === 'inn' && p.crossing) discs.push({ x: p.crossing.x, z: p.crossing.z, r: 8 });
    for (const f of p.fields || []) rects.push({ ...f.R, w: f.R.w + 2.5, d: f.R.d + 2.5 });
    for (const b of p.buildings || []) rects.push({ ...b.R, w: b.R.w + 3, d: b.R.d + 3 });
  }
  return (x, z) => rects.some(R => Math.abs(R.cx - x) < R.w + R.d && Math.abs(R.cz - z) < R.w + R.d && inRect(R, x, z)) || discs.some(d => Math.hypot(d.x - x, d.z - z) < d.r);
}

/** Typed placement records for the pieces (see world.md §10). groundAt(x, z) for heights. */
export function setPiecePlacements(pieces, { groundAt, culture = 'human' } = {}) {
  const out = [];
  const poly = R => rectCorners(R).map(p => p.map(r2));
  for (const p of pieces) {
    const base = { piece: p.kind, name: p.name, town: p.town || null, ...(p.auto ? { auto: true } : {}) };
    const d = { ...base, r: r2(p.r) };
    if (p.R) Object.assign(d, { poly: poly(p.R), w: r2(p.R.w), d: r2(p.R.d), angle: +p.R.a.toFixed(4) });
    if (p.gate) d.gate = { x: p.gate.x, z: p.gate.z, width: p.gate.width, yaw: p.gate.yawIn };
    if (p.kind === 'graveyard') { d.graves = p.graves; d.graveStyles = ['headstone', 'cross', 'slab', 'mound', 'tomb']; d.level = r2(p.R.h); }
    if (p.kind === 'orchard') { d.fruit = p.fruit; d.trees = p.trees.length; }
    if (p.kind === 'mill_pond') { d.pond = { x: r2(p.pond.x), z: r2(p.pond.z), rx: p.pond.rx, rz: p.pond.rz, angle: +p.pond.a.toFixed(4), level: p.level }; d.wheel = p.wheel; }
    if (p.kind === 'clearing') { d.for = p.for; d.yardR = r2(p.yardR); }
    if (p.kind === 'stone_circle') d.stones = p.stones.map(([x, z, a, st]) => [r2(x), r2(z), a, st]);
    if (p.kind === 'copse') d.trees = p.trees.length;
    if (p.kind === 'inn') d.crossing = { x: r2(p.crossing.x), z: r2(p.crossing.z), h: r2(p.crossing.h) };
    if (p.kind === 'belt' || p.kind === 'farm') d.fields = (p.fields || []).length;
    d.slots = (p.slots || []).map(s => ({ kind: s.kind, x: r2(s.x), z: r2(s.z), r: r2(s.r || 1), ...(s.yaw != null ? { yaw: +(+s.yaw).toFixed(4) } : {}) }));
    out.push({ kind: 'set_piece', id: p.id, x: r2(p.x), z: r2(p.z), yaw: p.R ? yawOfAngle(p.R.a) : 0, data: d });
    (p.fields || []).forEach((f, i) => {
      out.push({ kind: 'field', id: `${p.id}_field_${i}`, x: r2(f.R.cx), z: r2(f.R.cz), yaw: yawOfAngle(f.furrow), data: { ...base, setPiece: p.id, crop: f.crop, grows: f.cropKind, poly: poly(f.R), w: r2(f.R.w), d: r2(f.R.d), angle: +f.R.a.toFixed(4), furrowAngle: +f.furrow.toFixed(4), boundary: f.hedge, ...(f.gate ? { gate: { x: f.gate.x, z: f.gate.z, width: f.gate.width, yaw: f.gate.yawIn } } : {}) } });
      (f.walls || []).forEach((w, k) => out.push(wallRec(w, `${p.id}_field_${i}_${w.kind}_${k}`, p.id, groundAt)));
    });
    (p.walls || []).forEach((w, k) => out.push(wallRec(w, `${p.id}_${w.kind}_${k}`, p.id, groundAt)));
    (p.buildings || []).forEach((b, k) => out.push({ kind: 'set_building', id: `${p.id}_bldg_${k}`, x: r2(b.R.cx), z: r2(b.R.cz), yaw: yawOfAngle(b.face), data: { setPiece: p.id, piece: p.kind, want: b.want, w: r2(b.R.w), d: r2(b.R.d), angle: +b.R.a.toFixed(4), front: +b.face.toFixed(4), culture, label: b.label, lit: !!b.lit, ground: groundAt ? r2(groundAt(b.R.cx, b.R.cz)) : null } }));
    if (p.kind === 'inn' && p.crossing) out.push({ kind: 'signpost', id: `${p.id}_signpost`, x: r2(p.crossing.x + 3.2), z: r2(p.crossing.z + 3.2), yaw: 0, data: { setPiece: p.id, arms: p.crossing.arms.map(a => ({ to: a.to, yaw: a.yaw, road: a.road })) } });
  }
  return out;
}
function wallRec(w, id, piece, groundAt) {
  return { kind: w.kind, id, x: w.pts[0][0], z: w.pts[0][1], yaw: 0, data: { setPiece: piece, h: w.h, ...(w.material ? { material: w.material } : {}), pts: w.pts.map(([x, z]) => [x, z, groundAt ? r2(groundAt(x, z)) : 0]) } };
}

/** Footprints for nav.bin: buildings (BUILDING) and walls (SOLID, 1 sample wide). */
export function setPieceNav(pieces) {
  const buildings = [], walls = [];
  for (const p of pieces) {
    for (const b of p.buildings || []) buildings.push(b.R);
    for (const w of p.walls || []) if (w.kind === 'wall') walls.push(w.pts);
  }
  return { buildings, walls };
}
