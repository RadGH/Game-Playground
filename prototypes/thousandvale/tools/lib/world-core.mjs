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
export const WORLD_BAKE_VERSION = 1;

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
export const RIVER_DEPTH = [0, 1.2, 2.0, 3.0];
