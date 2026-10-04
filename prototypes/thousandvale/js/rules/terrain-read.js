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

export const FORMAT_MAGIC = 'TVZN';
export const FORMAT_VERSION = 1;
export const WATER_KINDS = ['none', 'sea', 'lake', 'river'];
/** Steepest ground a walker climbs, in degrees. Server movement checks and monster steering use this. */
export const MAX_WALK_SLOPE = 46;
/** Deepest water you wade through on foot, in metres; deeper is swimming. */
export const WADE_DEPTH = 1.1;

const RAD = 180 / Math.PI;

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
  if (version !== FORMAT_VERSION) throw new Error(`terrain: format version ${version}, this reader reads ${FORMAT_VERSION} — re-bake or update the reader`);
  const jsonBytes = dv.getUint32(8, true);
  const meta = JSON.parse(decodeUtf8(bytes.subarray(12, 12 + jsonBytes)));
  const N = meta.size * meta.size;
  let off = 12 + jsonBytes; off = (off + 3) & ~3;
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
