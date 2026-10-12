// Thousandvale — the shared core of the world and zone bakes (stream B).
//
// One rule makes zone edges agree BY CONSTRUCTION (PLAN §3.2.3): every value a zone bake writes is a
// pure function of WORLD coordinates and the world bake's outputs — never of which zone is being
// baked. So the base ground, the river surfaces, the lake levels and the height quantisation all live
// here, computed from the macro field, and two neighbouring zones compute the same number for the
// same point on their shared edge.
//
//   macro.bin  'TVWM' | u32 version | u32 jsonBytes | JSON | pad4 | u16 elevation[w*h] (0..1 → 0..65535)
//              | u16 slope[w*h] (0..1) | u8 water[w*h] | u8 river[w*h] | u8 biome[w*h]
//   world.json the readable half: grid, relief, zones, nodes, rivers (smoothed polylines WITH surfaces),
//              lakes (with levels), roads — everything a zone bake needs besides the macro layers.

import { makeNoise2D, fbm, ridged, subSeed, clamp } from '../../../../worldgen/js/noise.js';

export const MACRO_MAGIC = 'TVWM';
export const MACRO_VERSION = 1;
export const WORLD_BAKE_VERSION = 2;   // 2: crossing-walk bridges with abutments (play-test 1, P24)

// World choice (2026-10-04, coordinator ruling "fix the land count now"): a scan of 54 combinations
// (plates/pangea/noise × sea level 0.20/0.28/0.35 × ocean/land frame × 3 seeds) for ~200 zones that are
// more than half land; pangea seed 1001 at sea level 0.20 gives 202 of 252, cut into exactly 12 regions
// of 10–29 zones (the provinces), with the most relief variety of the near-200 candidates (hills 25 %,
// grassland 25 %, savanna 11 %, mountains 10 %, forests 15 %).
export const WORLD = {
  seed: 1001, width: 288, height: 224, method: 'pangea', seaLevel: 0.2, regionCount: 12,   // PLAN §3.1–3.2: 16 samples per zone edge
  zoneCells: 16, macroMetres: 128,                          // a zone = 16 × 128 m = 2,048 m
  landMetres: 1400, seaMetres: 160,
};

/** World-fixed height quantisation, so a u16 means the same metres in every zone (edges match to the bit). */
export function heightRange(world = WORLD) {
  return { min: -world.seaMetres - 80, max: world.landMetres + 260 };
}

export function encodeMacro(w, meta) {
  const N = w.width * w.height;
  const json = new TextEncoder().encode(JSON.stringify(meta));
  let off = 12 + json.length; off = (off + 3) & ~3;
  const out = new Uint8Array(off + N * 4 + N * 3);
  const dv = new DataView(out.buffer);
  for (let k = 0; k < 4; k++) out[k] = MACRO_MAGIC.charCodeAt(k);
  dv.setUint32(4, MACRO_VERSION, true); dv.setUint32(8, json.length, true); out.set(json, 12);
  for (let i = 0; i < N; i++) dv.setUint16(off + i * 2, Math.round(clamp(w.elevation[i], 0, 1) * 65535), true);
  off += N * 2;
  for (let i = 0; i < N; i++) dv.setUint16(off + i * 2, Math.round(clamp(w.slope[i], 0, 1) * 65535), true);
  off += N * 2;
  out.set(w.water, off); off += N; out.set(w.river, off); off += N; out.set(w.biome, off);
  return out;
}

export function decodeMacro(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const magic = String.fromCharCode(...bytes.subarray(0, 4));
  if (magic !== MACRO_MAGIC) throw new Error('macro.bin: bad magic ' + magic);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(4, true) !== MACRO_VERSION) throw new Error('macro.bin: version ' + dv.getUint32(4, true));
  const jl = dv.getUint32(8, true);
  const meta = JSON.parse(new TextDecoder().decode(bytes.subarray(12, 12 + jl)));
  const N = meta.width * meta.height;
  let off = (12 + jl + 3) & ~3;
  const elevation = new Float32Array(N), slope = new Float32Array(N);
  for (let i = 0; i < N; i++) elevation[i] = dv.getUint16(off + i * 2, true) / 65535;
  off += N * 2;
  for (let i = 0; i < N; i++) slope[i] = dv.getUint16(off + i * 2, true) / 65535;
  off += N * 2;
  const water = bytes.slice(off, off + N); off += N;
  const river = bytes.slice(off, off + N); off += N;
  const biome = bytes.slice(off, off + N);
  return { ...meta, elevation, slope, water, river, biome };
}

/** Catmull-Rom. */
function cr(p0, p1, p2, p3, t) {
  return p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
}
/** Bicubic sample of a macro layer at fractional macro coordinates (edges clamp). */
export function bicubic(m, arr, fx, fy) {
  const w = m.width, h = m.height;
  const x1 = Math.floor(fx), y1 = Math.floor(fy), tx = fx - x1, ty = fy - y1;
  const at = (x, y) => arr[clamp(y, 0, h - 1) * w + clamp(x, 0, w - 1)];
  const row = y => cr(at(x1 - 1, y), at(x1, y), at(x1 + 1, y), at(x1 + 2, y), tx);
  return cr(row(y1 - 1), row(y1), row(y1 + 1), row(y1 + 2), ty);
}
/** Nearest macro cell index for world metres. */
export function macroIndex(m, wx, wz) {
  const M = m.macroMetres;
  return clamp(Math.round(wz / M), 0, m.height - 1) * m.width + clamp(Math.round(wx / M), 0, m.width - 1);
}

/**
 * The refine functions for one world: base ground (before rivers/lakes/towns), biome warp noise.
 * Everything takes WORLD metres. Seeded from the world seed only.
 */
export function makeRefiner(m) {
  const M = m.macroMetres;
  const seed = subSeed(m.seed, 'thousandvale-zone-detail');
  const nA = makeNoise2D(subSeed(seed, 'a')), nB = makeNoise2D(subSeed(seed, 'b')), nC = makeNoise2D(subSeed(seed, 'c'));
  const nWX = makeNoise2D(subSeed(seed, 'wx')), nWZ = makeNoise2D(subSeed(seed, 'wz'));
  const metres = e => (e >= 0.5 ? (e - 0.5) * 2 * m.landMetres : (e - 0.5) * 2 * m.seaMetres);
  function baseGround(wx, wz) {
    const fx = wx / M, fy = wz / M;
    const base = metres(bicubic(m, m.elevation, fx, fy));
    const rel = clamp(bicubic(m, m.slope, fx, fy), 0, 1);
    const hills = (fbm(nA, wx / 420, wz / 420, { octaves: 4 }) - 0.5) * (14 + rel * 90);
    const ridge = ridged(nB, wx / 900, wz / 900, { octaves: 3 }) * rel * 60;
    const fine = (fbm(nC, wx / 38, wz / 38, { octaves: 3 }) - 0.5) * (1.2 + rel * 5);
    return base + hills + ridge + fine;
  }
  /** A warped macro index: biome borders wander instead of following 128 m squares. */
  function warpedIndex(wx, wz) {
    const ox = (fbm(nWX, wx / 260, wz / 260, { octaves: 3 }) - 0.5) * 220;
    const oz = (fbm(nWZ, wx / 260, wz / 260, { octaves: 3 }) - 0.5) * 220;
    return macroIndex(m, wx + ox, wz + oz);
  }
  /** Low-frequency sideways push for a river point (meanders). */
  function meander(x, z) {
    return [(fbm(nWX, x / 300, z / 300, { octaves: 2 }) - 0.5) * 50, (fbm(nWZ, x / 300, z / 300, { octaves: 2 }) - 0.5) * 50];
  }
  return { baseGround, warpedIndex, meander, metres };
}

export const RIVER_WIDTH = [0, 7, 14, 24];
/**
 * Channel depth at the centre by river class, plus 0.3 m everywhere in the channel (bake-zone step 6).
 * Play-test 1 (P2): class 1 was 1.2 + 0.3 = 1.5 m in the middle — past WADE_DEPTH (1.1), so every small stream
 * had an invisible wall down its centre. A stream (class 1) is now wadeable all the way (0.8 m at the centre);
 * a river (class 2, 1.6 m) and a big river (class 3, 2.9 m) are swum in the middle, and every road over them has a
 * bridge (crossingsOf below).
 */
export const RIVER_DEPTH = [0, 0.5, 1.3, 2.6];
/** Deck height above the river surface by class (a bridge clears the water by at least this). */
export const DECK_CLEARANCE = [0, 1.0, 1.5, 2.2];
/** Metres of dry bank a bridge deck reaches past the wet channel at each end (the abutment). */
export const DECK_LAND = 1.5;
/** A crossing runs while the road is within the channel half-width + this of a river centreline (dry bank under the abutments). */
export const BANK_MARGIN = 2.5;

/**
 * Where a road crosses river water: walk the road polyline at 1 m and test the distance to every river
 * centreline against its half-width. A crossing is a run of metres within half-width + BANK_MARGIN (so its ends stand
 * on dry bank) that touches the water (half-width + 0.5 m) somewhere; gaps ≤ 2 m join.
 * Replaces the old segment-intersection test, which missed a road running into a channel at a slant or along it
 * and doubled a crossing on a polyline vertex. Pure: world (or any one frame's) metres in, crossings out.
 *   roadPts [[x, z, h]…]   rivers [{id, pts:[[x, z, surface, cls]…]}]   (same frame)
 * → [{ river, cls, surface, s0, s1 (arc metres along the road where the water starts / ends), x, z (middle) }]
 */
export function crossingsOf(roadPts, rivers) {
  if (roadPts.length < 2) return [];
  const xs = roadPts.map(p => p[0]), zs = roadPts.map(p => p[1]);
  const pad = 20, bb = [Math.min(...xs) - pad, Math.min(...zs) - pad, Math.max(...xs) + pad, Math.max(...zs) + pad];
  const segs = [];
  for (const r of rivers) {
    if (r.bbox && (r.bbox[2] < bb[0] || r.bbox[0] > bb[2] || r.bbox[3] < bb[1] || r.bbox[1] > bb[3])) continue;
    for (let k = 0; k < r.pts.length - 1; k++) {
      const a = r.pts[k], b = r.pts[k + 1];
      if (Math.max(a[0], b[0]) < bb[0] || Math.min(a[0], b[0]) > bb[2] || Math.max(a[1], b[1]) < bb[1] || Math.min(a[1], b[1]) > bb[3]) continue;
      segs.push({ river: r.id, a, b, cls: Math.max(a[3], b[3]) });
    }
  }
  if (!segs.length) return [];
  const wetAt = (x, z) => {
    let best = null;
    for (const g of segs) {
      const dx = g.b[0] - g.a[0], dz = g.b[1] - g.a[1], L2 = dx * dx + dz * dz || 1;
      const t = clamp(((x - g.a[0]) * dx + (z - g.a[1]) * dz) / L2, 0, 1);
      const d = Math.hypot(x - g.a[0] - dx * t, z - g.a[1] - dz * t);
      const half = RIVER_WIDTH[g.cls] / 2;
      if (d <= half + BANK_MARGIN && (!best || d - half < best.over)) best = { over: d - half, wet: d <= half + 0.5, river: g.river, cls: g.cls, surface: g.a[2] + (g.b[2] - g.a[2]) * t };
    }
    return best;
  };
  const out = []; let cur = null, s = 0;
  for (let k = 0; k < roadPts.length - 1; k++) {
    const a = roadPts[k], b = roadPts[k + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let q = 0; q < L; q += 1) {
      const x = a[0] + (b[0] - a[0]) * q / L, z = a[1] + (b[1] - a[1]) * q / L, w = wetAt(x, z), at = s + q;
      if (w) {
        if (cur && at - cur.s1 <= 2) { cur.s1 = at; if (w.cls > cur.cls) cur.cls = w.cls; cur.surface = Math.max(cur.surface, w.surface); cur.wet ||= w.wet; }
        else { if (cur) out.push(cur); cur = { river: w.river, cls: w.cls, surface: w.surface, s0: at, s1: at, wet: w.wet }; }
      }
    }
    s += L;
  }
  if (cur) out.push(cur);
  return out.filter(c => c.wet).map(({ wet, ...c }) => { const m = pointAlong(roadPts, (c.s0 + c.s1) / 2); return { ...c, surface: +c.surface.toFixed(3), x: +m[0].toFixed(2), z: +m[1].toFixed(2) }; });
}

/** The point at arc length s along a polyline [[x, z, h?]…] → [x, z, h] (clamped to the ends). */
export function pointAlong(pts, s) {
  if (s <= 0) return [pts[0][0], pts[0][1], pts[0][2] ?? 0];
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k], b = pts[k + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (s <= L) { const t = L ? s / L : 0; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, (a[2] ?? 0) + ((b[2] ?? 0) - (a[2] ?? 0)) * t]; }
    s -= L;
  }
  const e = pts[pts.length - 1]; return [e[0], e[1], e[2] ?? 0];
}

/**
 * A bridge for one crossing: a flat deck from abutment a to abutment b (one straight piece, or `pieces` — a chain of
 * straight pieces sharing ends — where the road bends through a long crossing) (DECK_LAND metres of dry bank past
 * the water at each end, measured along the road), at deck height h, road width + 1 m wide. The zone bake grades the
 * road on both banks to exactly h at a and b (bake-zone gradeBridge), so the deck meets the road at both ends.
 *   h = surface + clearance, raised by up to 2 m toward the road's own graded height where the road runs high.
 */
export function bridgeFor(roadPts, c, roadWidth) {
  const S0 = c.s0 - DECK_LAND, S1 = c.s1 + DECK_LAND, M = pointAlong(roadPts, (c.s0 + c.s1) / 2);
  const clear = c.surface + DECK_CLEARANCE[c.cls];
  const h = +(clear + clamp(M[2] - clear, 0, 2)).toFixed(3);
  // a straight deck piece from arc s0 to s1, widened by how far the road bends off its chord
  const piece = (s0, s1) => {
    const A = pointAlong(roadPts, s0), B = pointAlong(roadPts, s1), span = Math.hypot(B[0] - A[0], B[1] - A[1]);
    let dev = 0;
    if (span > 0.01) { const ux = (B[0] - A[0]) / span, uz = (B[1] - A[1]) / span; for (let s = s0; s <= s1; s += 1) { const p = pointAlong(roadPts, s); dev = Math.max(dev, Math.abs((p[0] - A[0]) * uz - (p[1] - A[1]) * ux)); } }
    return { a: [+A[0].toFixed(2), +A[1].toFixed(2)], b: [+B[0].toFixed(2), +B[1].toFixed(2)], span: +span.toFixed(2), dev,
      x: +((A[0] + B[0]) / 2).toFixed(2), z: +((A[1] + B[1]) / 2).toFixed(2), yaw: +Math.atan2(B[0] - A[0], B[1] - A[1]).toFixed(4) };
  };
  // a road that bends through a long crossing gets a chain of straight pieces (each bending ≤ 1.2 m), not one fat deck
  let n = 1, pieces;
  for (;;) {
    pieces = []; for (let q = 0; q < n; q++) pieces.push(piece(S0 + (S1 - S0) * q / n, S0 + (S1 - S0) * (q + 1) / n));
    if (n >= 8 || pieces.every(p => p.dev <= 1.2)) break;
    n++;
  }
  for (const p of pieces) { p.width = +(roadWidth + 1 + 2 * p.dev).toFixed(2); delete p.dev; }
  const A = pieces[0].a, B = pieces[pieces.length - 1].b;
  return {
    x: +((A[0] + B[0]) / 2).toFixed(2), z: +((A[1] + B[1]) / 2).toFixed(2), yaw: +Math.atan2(B[0] - A[0], B[1] - A[1]).toFixed(4),
    span: +(S1 - S0).toFixed(2), deck: h, width: Math.max(...pieces.map(p => p.width)), a: A, b: B,
    s0: +S0.toFixed(2), s1: +S1.toFixed(2), river: c.river, cls: c.cls, surface: c.surface,
    ramp: +clamp((h - c.surface) * 10, 14, 40).toFixed(1),
    ...(pieces.length > 1 ? { pieces } : {}),
  };
}
