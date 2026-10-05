// Thousandvale — terrain reader (stream B, shared ★: change only through stream B).
//
// ONE heightmap, read by everything: the client mesh, grass, scatter, water, the server's movement
// check and monster steering (PLAN §3.2.4). This module is pure — no three.js, DOM, window, storage or
// fetch. You load the bytes yourself and hand them in:
//
//   // browser
//   const buf = await (await fetch('data/zones/test/terrain.bin')).arrayBuffer();
//   // node
//   const buf = fs.readFileSync(new URL('../data/zones/test/terrain.bin', import.meta.url));
//
//   import { parseTerrain } from './js/rules/terrain-read.js';
//   const t = parseTerrain(buf);
//   t.heightAt(x, z)      // ground height in metres (triangle interpolation — see below)
//   t.slopeAt(x, z)       // degrees, 0 = flat
//   t.normalAt(x, z)      // [nx, ny, nz], unit, +y up
//   t.waterAt(x, z)       // { kind: 'none'|'sea'|'lake'|'river', surface, depth }
//   t.biomeAt(x, z)       // biome id (t.biomes[id] = { key, name, color })
//   t.sample(x, z)        // all of the above in one object
//   t.walkable(x, z)      // in bounds, slope ≤ MAX_WALK_SLOPE, water no deeper than WADE_DEPTH
//   t.heightGrid()        // Float32Array of metres, size*size, for building the mesh (use gridIndices())
//   t.waterGrid()         // Float32Array water surface (NaN = dry), for the water mesh
//
// COORDINATES. Metres. +x is east, +z is south (three.js: +y up, the camera looks down -z by default).
// Grid sample (i, j) sits at x = origin.x + i * step, z = origin.z + j * step. Row j runs along +z.
// The test zone has origin (0, 0), step 2 m, 1025 × 1025 samples, so it covers x, z ∈ [0, 2048].
// Outside the bounds every query clamps to the nearest edge (heightAt never returns NaN).
//
// DRAWN = MEASURED. A height map can be interpolated two ways (bilinear vs the two triangles a mesh
// actually draws) and they disagree by centimetres on every slope — enough for feet to float or sink.
// So the reader uses the SAME triangles a mesh must draw: each grid square (i, j)-(i+1, j+1) is cut
// along the diagonal from (i+1, j) to (i, j+1). Build the client mesh with `gridIndices()` below
// (or the same split) and heightAt() is exactly the drawn surface. Water works the same way: the water
// surface is its own grid layer, so the drawn water and waterAt() are the same numbers (the Farhold
// staircase lesson: never draw one surface and measure another).
//
// FILE FORMAT (terrain.bin, little-endian), version 1:
//   0  'TVZN'           magic (4 bytes)
//   4  u32 version      FORMAT_VERSION
//   8  u32 jsonBytes    length of the UTF-8 JSON meta that follows
//   12 json meta        { name, size, step, origin:{x,z}, heightMin, heightMax, inputHash, bakeVersion,
//                         biomes:[[key,name,color],…], waterKinds:[…], source:{…}, sites:[…], spawn:{x,z} }
//      padding to a multiple of 4
//      u16[size*size]  height      ground = heightMin + v / 65535 * (heightMax - heightMin)
//      u16[size*size]  waterTop    0 = dry; else water surface on the same scale as height
//      u8 [size*size]  waterKind   0 none, 1 sea, 2 lake, 3 river
//      u8 [size*size]  biome       index into meta.biomes
// A file with the wrong magic or version is REFUSED (throws), never misread (PLAN §3.2.5).
//
// FILE VERSION 2 (what the bake writes since 2026-10-04 — ~10x smaller, same layers, same reader API):
//   'TVZN' | u32 2 | u32 jsonBytes | json meta | pad to 4 | u32 packedBytes | raw DEFLATE (packedBytes) of
//      u16[size*size] height RESIDUALS — each sample minus the planar guess left + up - upLeft (first row:
//                     left, first column: up), mod 65536 — so a smooth slope is a run of near-zero numbers
//      u16[size*size] waterTop, u8[size*size] waterKind, u8[size*size] biome   (as in version 1)
//   Decoded by ./inflate.js (pure, synchronous). FORMAT_VERSION stays 1: it names the LAYERS (and feeds the bake
//   hashes); FILE_VERSIONS lists the containers this reader opens.

import { inflateRaw } from './inflate.js';

export const FORMAT_MAGIC = 'TVZN';
export const FORMAT_VERSION = 1;
/** File container versions parseTerrain / parseNav open (1 = plain, 2 = deflated). */
export const FILE_VERSIONS = Object.freeze([1, 2]);
export const WATER_KINDS = ['none', 'sea', 'lake', 'river'];
/** Steepest ground a walker climbs, in degrees. Server movement checks and monster steering use this. */
export const MAX_WALK_SLOPE = 46;
/** Deepest water you wade through on foot, in metres; deeper is swimming. */
export const WADE_DEPTH = 1.1;

const RAD = 180 / Math.PI;

/** Undo the planar height predictor of file version 2 (in place, mod 65536). */
export function unpredictHeights(h, size, rows = size) {
  for (let j = 0; j < rows; j++) {
    const row = j * size;
    for (let i = 0; i < size; i++) {
      const k = row + i;
      const p = j === 0 ? (i === 0 ? 0 : h[k - 1]) : i === 0 ? h[k - size] : h[k - 1] + h[k - size] - h[k - size - 1];
      h[k] = (h[k] + p) & 0xffff;
    }
  }
  return h;
}

/** The planar height predictor (writer side; exported so the bake and the tests share one definition). */
export function predictHeights(h, size, rows = size) {
  const out = new Uint16Array(h.length);
  for (let j = 0; j < rows; j++) {
    const row = j * size;
    for (let i = 0; i < size; i++) {
      const k = row + i;
      const p = j === 0 ? (i === 0 ? 0 : h[k - 1]) : i === 0 ? h[k - size] : h[k - 1] + h[k - size] - h[k - size - 1];
      out[k] = (h[k] - p) & 0xffff;
    }
  }
  return out;
}

/** Version-2 payload: u32 packedBytes then raw deflate; returns the decoded bytes (exactly `want` long). */
function unpack(bytes, off, want, what) {
  if (bytes.length < off + 4) throw new Error(`${what}: file too short`);
  const n = new DataView(bytes.buffer, bytes.byteOffset + off, 4).getUint32(0, true);
  if (bytes.length < off + 4 + n) throw new Error(`${what}: file is ${bytes.length} bytes, header says ${off + 4 + n}`);
  return inflateRaw(bytes.subarray(off + 4, off + 4 + n), want);
}

function toBytes(buf) {
  if (buf instanceof Uint8Array) return buf;
  if (buf instanceof ArrayBuffer) return new Uint8Array(buf);
  if (ArrayBuffer.isView(buf)) return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  throw new TypeError('parseTerrain: expected an ArrayBuffer or a typed array');
}

function decodeUtf8(bytes) {
  if (typeof TextDecoder !== 'undefined') return new TextDecoder().decode(bytes);
  let s = ''; for (const b of bytes) s += String.fromCharCode(b); return decodeURIComponent(escape(s));
}

/** Copy a little-endian u16 run out of the file (handles any byte alignment, any host endianness). */
function readU16(bytes, offset, count) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset + offset, count * 2);
  const out = new Uint16Array(count);
  for (let k = 0; k < count; k++) out[k] = dv.getUint16(k * 2, true);
  return out;
}

/**
 * Parse a terrain.bin into a reader. Throws on a bad magic, a newer/older version, or a short file.
 * @param {ArrayBuffer|Uint8Array} buffer
 */
export function parseTerrain(buffer) {
  const bytes = toBytes(buffer);
  if (bytes.length < 12) throw new Error('terrain: file too short');
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (magic !== FORMAT_MAGIC) throw new Error(`terrain: bad magic "${magic}" (expected ${FORMAT_MAGIC})`);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = dv.getUint32(4, true);
  if (!FILE_VERSIONS.includes(version)) throw new Error(`terrain: file version ${version}, this reader reads ${FILE_VERSIONS.join('/')} — re-bake or update the reader`);
  const jsonBytes = dv.getUint32(8, true);
  const meta = JSON.parse(decodeUtf8(bytes.subarray(12, 12 + jsonBytes)));
  const N = meta.size * meta.size;
  let off = 12 + jsonBytes; off = (off + 3) & ~3;
  if (version === 2) {
    const raw = unpack(bytes, off, N * 6, 'terrain');
    const height = unpredictHeights(readU16(raw, 0, N), meta.size);
    const waterTop = readU16(raw, N * 2, N);
    return createTerrain({ meta, height, waterTop, waterKind: raw.slice(N * 4, N * 5), biome: raw.slice(N * 5, N * 6) });
  }
  const need = off + N * 2 * 2 + N * 2;
  if (bytes.length < need) throw new Error(`terrain: file is ${bytes.length} bytes, header says ${need}`);
  const height = readU16(bytes, off, N); off += N * 2;
  const waterTop = readU16(bytes, off, N); off += N * 2;
  const waterKind = bytes.slice(off, off + N); off += N;
  const biome = bytes.slice(off, off + N);
  return createTerrain({ meta, height, waterTop, waterKind, biome });
}

/**
 * Build a reader straight from layers (the bake tool and tests use this; games use parseTerrain).
 * layers: { meta, height:Uint16Array, waterTop:Uint16Array, waterKind:Uint8Array, biome:Uint8Array }
 */
export function createTerrain({ meta, height, waterTop, waterKind, biome }) {
  const size = meta.size, step = meta.step;
  const ox = meta.origin?.x ?? 0, oz = meta.origin?.z ?? 0;
  const hMin = meta.heightMin, scale = (meta.heightMax - meta.heightMin) / 65535;
  const last = size - 1;
  const extent = last * step;
  const biomes = (meta.biomes || []).map(([key, name, color], id) => ({ id, key, name, color }));

  const H = (i, j) => hMin + height[j * size + i] * scale;
  const W = (i, j) => { const v = waterTop[j * size + i]; return v ? hMin + v * scale : NaN; };

  /** Grid-space coordinates, clamped to the map: returns [i0, j0, fx, fz]. */
  function cell(x, z) {
    let gx = (x - ox) / step, gz = (z - oz) / step;
    if (!(gx > 0)) gx = 0; else if (gx > last) gx = last;      // also maps NaN to 0
    if (!(gz > 0)) gz = 0; else if (gz > last) gz = last;
    let i = Math.floor(gx), j = Math.floor(gz);
    if (i >= last) i = last - 1;
    if (j >= last) j = last - 1;
    return [i, j, gx - i, gz - j];
  }

  /** Triangle interpolation over a layer getter, using the mesh's diagonal (i+1,j)–(i,j+1). */
  function tri(get, x, z) {
    const [i, j, fx, fz] = cell(x, z);
    const h10 = get(i + 1, j), h01 = get(i, j + 1);
    if (fx + fz <= 1) { const h00 = get(i, j); return h00 + (h10 - h00) * fx + (h01 - h00) * fz; }
    const h11 = get(i + 1, j + 1);
    return h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
  }

  function heightAt(x, z) { return tri(H, x, z); }

  /** Unit normal of the triangle under (x, z) — flat per triangle, exactly what the mesh draws. */
  function normalAt(x, z) {
    const [i, j, fx, fz] = cell(x, z);
    let dhdx, dhdz;
    if (fx + fz <= 1) { const h00 = H(i, j); dhdx = (H(i + 1, j) - h00) / step; dhdz = (H(i, j + 1) - h00) / step; }
    else { const h11 = H(i + 1, j + 1); dhdx = (h11 - H(i, j + 1)) / step; dhdz = (h11 - H(i + 1, j)) / step; }
    const len = Math.hypot(dhdx, 1, dhdz);
    return [-dhdx / len, 1 / len, -dhdz / len];
  }

  function slopeAt(x, z) { return Math.acos(Math.min(1, normalAt(x, z)[1])) * RAD; }

  /** Nearest grid sample index (for per-sample layers: biome, water kind). */
  function nearest(x, z) {
    const [i, j, fx, fz] = cell(x, z);
    return (j + (fz >= 0.5 ? 1 : 0)) * size + i + (fx >= 0.5 ? 1 : 0);
  }

  function waterAt(x, z) {
    const [i, j, fx, fz] = cell(x, z);
    // water only where every corner of this triangle is wet — the drawn sheet stops at the same edge
    const lower = fx + fz <= 1;
    const a = lower ? W(i, j) : W(i + 1, j + 1), b = W(i + 1, j), c = W(i, j + 1);
    if (Number.isNaN(a) || Number.isNaN(b) || Number.isNaN(c)) return { kind: 'none', surface: NaN, depth: 0 };
    const surface = lower ? a + (b - a) * fx + (c - a) * fz : a + (c - a) * (1 - fx) + (b - a) * (1 - fz);
    const depth = surface - heightAt(x, z);
    if (depth <= 0) return { kind: 'none', surface, depth: 0 };
    return { kind: WATER_KINDS[waterKind[nearest(x, z)]] || 'lake', surface, depth };
  }

  function biomeAt(x, z) { return biome[nearest(x, z)]; }

  function inBounds(x, z) { return x >= ox && z >= oz && x <= ox + extent && z <= oz + extent; }

  function walkable(x, z) {
    if (!inBounds(x, z)) return false;
    if (slopeAt(x, z) > MAX_WALK_SLOPE) return false;
    return waterAt(x, z).depth <= WADE_DEPTH;
  }

  function sample(x, z) {
    const water = waterAt(x, z);
    const b = biomeAt(x, z);
    return { x, z, height: heightAt(x, z), slope: slopeAt(x, z), normal: normalAt(x, z), water, biome: b, biomeKey: biomes[b]?.key };
  }

  /** Clamp a point into the map, e.g. for a server that refuses to let anyone walk off the edge. */
  function clamp(x, z) {
    return [Math.min(ox + extent, Math.max(ox, Number.isFinite(x) ? x : ox)), Math.min(oz + extent, Math.max(oz, Number.isFinite(z) ? z : oz))];
  }

  let hGrid = null, wGrid = null;
  /** Ground heights in metres as one Float32Array (index j * size + i), built once and cached — for mesh builders. */
  function heightGrid() {
    if (!hGrid) { hGrid = new Float32Array(size * size); for (let k = 0; k < hGrid.length; k++) hGrid[k] = hMin + height[k] * scale; }
    return hGrid;
  }
  /** Water surface heights in metres (NaN where dry), same indexing, cached — for the water mesh. */
  function waterGrid() {
    if (!wGrid) { wGrid = new Float32Array(size * size); for (let k = 0; k < wGrid.length; k++) wGrid[k] = waterTop[k] ? hMin + waterTop[k] * scale : NaN; }
    return wGrid;
  }

  return {
    meta, size, step, origin: { x: ox, z: oz }, extent,
    bounds: { minX: ox, minZ: oz, maxX: ox + extent, maxZ: oz + extent },
    biomes, layers: { height, waterTop, waterKind, biome },
    heightAt, normalAt, slopeAt, waterAt, biomeAt, sample, walkable, inBounds, clamp,
    /** Ground height of grid sample (i, j), for mesh builders. */
    heightOfSample: H, heightGrid, waterGrid,
    /** Water surface of grid sample (i, j), or NaN when dry. */
    waterOfSample: W,
  };
}

/**
 * Triangle indices for a size × size vertex grid (vertex index = j * size + i), cut along the same
 * diagonal heightAt() uses. Counter-clockwise seen from above (+y), so three.js front faces point up.
 * Pass `stride` > 1 for a coarser LOD mesh over every stride-th sample ((size-1) % stride must be 0).
 */
export function gridIndices(size, stride = 1) {
  const n = (size - 1) / stride;
  if (!Number.isInteger(n)) throw new Error('gridIndices: (size - 1) must divide by stride');
  const verts = n + 1;
  const out = new Uint32Array(n * n * 6);
  let k = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = j * verts + i, b = a + 1, c = a + verts, d = c + 1;   // a=(i,j) b=(i+1,j) c=(i,j+1) d=(i+1,j+1)
    // lower triangle a, c, b and upper triangle b, c, d — both share the b–c diagonal
    out[k++] = a; out[k++] = c; out[k++] = b;
    out[k++] = b; out[k++] = c; out[k++] = d;
  }
  return out;
}

/**
 * The walker interface the combat core uses (Farhold ground.js style — the same shape as
 * js/rules/terrain-flat.js), over a parsed terrain. Requested by stream C.
 *   slopeAt(x, z, s)      rise/run (NOT degrees), measured as a central difference over ±s metres
 *                         (s omitted: the exact triangle under the point)
 *   normalAt(x, z, s, out) unit normal; s > 0 smooths it the same way
 *   waterAt(x, z)          depth in metres, 0 when dry;  underwater(x, z) deeper than WADE_DEPTH
 *   roadAt                 0 until the M1 bake has roads;  clampToWorld(x, z) -> [x, z];  biomeIdAt(x, z)
 */
export function groundAdapter(t) {
  function grad(x, z, s) {
    if (!(s > 0)) { const n = t.normalAt(x, z); return [-n[0] / n[1], -n[2] / n[1]]; }
    return [(t.heightAt(x + s, z) - t.heightAt(x - s, z)) / (2 * s), (t.heightAt(x, z + s) - t.heightAt(x, z - s)) / (2 * s)];
  }
  return {
    heightAt: t.heightAt,
    slopeAt(x, z, s) { const [gx, gz] = grad(x, z, s); return Math.hypot(gx, gz); },
    normalAt(x, z, s, out = [0, 1, 0]) {
      const [gx, gz] = grad(x, z, s), len = Math.hypot(gx, 1, gz);
      out[0] = -gx / len; out[1] = 1 / len; out[2] = -gz / len; return out;
    },
    waterAt: (x, z) => t.waterAt(x, z).depth,
    underwater: (x, z) => t.waterAt(x, z).depth > WADE_DEPTH,
    roadAt: () => 0,
    clampToWorld: t.clamp,
    biomeIdAt: t.biomeAt,
    walkable: t.walkable,
  };
}

// ---------------------------------------------------------------------------------------------------
// Zone side layers (M1 bake, tools/bake-zone.mjs). Same rules: load the bytes yourself, pure decode,
// refuse a wrong magic/version. Both are in the zone's own metres, the same frame as terrain.bin.

/** Scatter kinds (index = wire id in scatter.bin). APPEND ONLY. `solid` = blocks movement (in nav.bin). */
export const SCATTER_KINDS = Object.freeze([
  { key: 'tree_broadleaf', solid: true, r: 0.5 }, { key: 'tree_conifer', solid: true, r: 0.45 },
  { key: 'tree_acacia', solid: true, r: 0.4 }, { key: 'tree_dead', solid: true, r: 0.35 },
  { key: 'bush', solid: false, r: 0.9 }, { key: 'rock_small', solid: false, r: 0.5 },
  { key: 'rock_large', solid: true, r: 1.4 }, { key: 'boulder', solid: true, r: 2.4 },
  { key: 'reed', solid: false, r: 0.6 },
]);
export const SCATTER_VERSION = 1;
export const NAV_VERSION = 1;
/** nav.bin bits per 2 m sample (same grid as terrain.bin). */
export const NAV = Object.freeze({ WALK: 1, ROAD: 2, SHALLOW: 4, DEEP: 8, STEEP: 16, SOLID: 32, TOWN: 64, BUILDING: 128 });

function readHeader(bytes, magic, version, what) {
  const m = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (m !== magic) throw new Error(`${what}: bad magic "${m}"`);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const v = dv.getUint32(4, true);
  const ok = Array.isArray(version) ? version.includes(v) : v === version;
  if (!ok) throw new Error(`${what}: version ${v}, reader reads ${[].concat(version).join('/')}`);
  const jl = dv.getUint32(8, true);
  const meta = JSON.parse(decodeUtf8(bytes.subarray(12, 12 + jl)));
  return { meta, dv, off: (12 + jl + 3) & ~3, version: v };
}

/**
 * scatter.bin: 'TVSC' | u32 version | u32 jsonBytes | JSON {extent, count, terrainHash} | pad4 |
 *   count × 8-byte records: u16 x, u16 z (metres = v / 65535 * extent), u8 kind, u8 scale (0.5 + v/255*1.5),
 *   u8 yaw (v/256 * 2π), u8 variant
 * Returns { meta, count, x: Float32Array, z, kind: Uint8Array, scale: Float32Array, yaw: Float32Array, variant: Uint8Array }.
 */
export function parseScatter(buffer) {
  const bytes = toBytes(buffer);
  const { meta, dv, off } = readHeader(bytes, 'TVSC', SCATTER_VERSION, 'scatter');
  const n = meta.count, E = meta.extent;
  if (bytes.length < off + n * 8) throw new Error('scatter: file too short');
  const x = new Float32Array(n), z = new Float32Array(n), kind = new Uint8Array(n), scale = new Float32Array(n), yaw = new Float32Array(n), variant = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const o = off + i * 8;
    x[i] = dv.getUint16(o, true) / 65535 * E; z[i] = dv.getUint16(o + 2, true) / 65535 * E;
    kind[i] = bytes[o + 4]; scale[i] = 0.5 + bytes[o + 5] / 255 * 1.5; yaw[i] = bytes[o + 6] / 256 * Math.PI * 2; variant[i] = bytes[o + 7];
  }
  return { meta, count: n, x, z, kind, scale, yaw, variant, kinds: SCATTER_KINDS };
}

/**
 * nav.bin: 'TVNV' | u32 version | u32 jsonBytes | JSON {size, step, terrainHash} | pad4 | u8[size*size] bits (NAV).
 *   Version 2: after pad4, u32 packedBytes + raw DEFLATE of the same u8 bits.
 * Returns { meta, size, step, bits, at(x,z) -> bits of the nearest sample, passable(x,z) -> WALK and not SOLID/BUILDING/DEEP }.
 */
export function parseNav(buffer) {
  const bytes = toBytes(buffer);
  const { meta, off, version } = readHeader(bytes, 'TVNV', FILE_VERSIONS, 'nav');
  const size = meta.size, step = meta.step;
  let bits;
  if (version === 2) bits = unpack(bytes, off, size * size, 'nav');
  else {
    if (bytes.length < off + size * size) throw new Error('nav: file too short');
    bits = bytes.slice(off, off + size * size);
  }
  const at = (x, z) => {
    const i = Math.min(size - 1, Math.max(0, Math.round(x / step))), j = Math.min(size - 1, Math.max(0, Math.round(z / step)));
    return bits[j * size + i];
  };
  const passable = (x, z) => { const b = at(x, z); return (b & NAV.WALK) !== 0 && (b & (NAV.SOLID | NAV.BUILDING | NAV.DEEP)) === 0; };
  return { meta, size, step, bits, at, passable };
}
