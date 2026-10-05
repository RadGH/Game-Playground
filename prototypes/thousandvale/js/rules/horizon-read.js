// Thousandvale — far-horizon reader (stream B, shared ★). Pure: no three/DOM/window/storage/fetch.
//
// data/world/horizon.bin is the WHOLE world at 32 m (1,153 × 897 samples over 36.9 × 28.7 km), made by
// tools/bake-horizon.mjs. Where a zone is baked, every horizon sample IS that zone's own ground sample (every 16th
// of its 2 m grid), so a far mesh built from it meets the loaded zone exactly; elsewhere it is the same base ground
// the zone bake starts from (macro field + detail noise, sea and lakes), so a zone baked later lands where the
// horizon promised. This is 4× finer than macro.bin (128 m), which the client used before.
//
//   const h = parseHorizon(bytes);          // ArrayBuffer | Uint8Array
//   h.heightAt(wx, wz)                      // WORLD metres; the same triangle split as terrain-read.js
//   h.waterAt(wx, wz) -> { surface, depth } | null    h.biomeAt(wx, wz) -> biome index (h.biomes[i] = [key, name, color])
//   h.heightGrid() / h.waterGrid()          // Float32Array width*height (NaN = dry) for a mesh; gridIndices() from terrain-read
//   h.width, h.height, h.step (32), h.zoneMetres (2048), h.baked -> Set of zone ids that are exact
//   horizonRef(manifest, zoneId)            // the small object the server puts in `joined` (see docs/world.md §7)
//
// FILE (little-endian): 'TVHZ' | u32 1 | u32 jsonBytes | json meta | pad4 | u32 packedBytes | raw DEFLATE of
//   u16[w*h] height RESIDUALS (planar predictor, as terrain.bin v2) | u16[w*h] waterTop (0 = dry) | u8[w*h] biome
//   heights: heightMin + v / 65535 * (heightMax - heightMin) — the SAME world-fixed scale as every zone bake.

import { inflateRaw } from './inflate.js';
import { unpredictHeights } from './terrain-read.js';

export const HORIZON_MAGIC = 'TVHZ';
export const HORIZON_VERSION = 1;

function toBytes(buf) {
  if (buf instanceof Uint8Array) return buf;
  if (buf instanceof ArrayBuffer) return new Uint8Array(buf);
  if (ArrayBuffer.isView(buf)) return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  throw new TypeError('parseHorizon: expected an ArrayBuffer or a typed array');
}
function utf8(bytes) {
  if (typeof TextDecoder !== 'undefined') return new TextDecoder().decode(bytes);
  let s = ''; for (const b of bytes) s += String.fromCharCode(b); return decodeURIComponent(escape(s));
}

export function parseHorizon(buffer) {
  const bytes = toBytes(buffer);
  if (bytes.length < 16) throw new Error('horizon: file too short');
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (magic !== HORIZON_MAGIC) throw new Error(`horizon: bad magic "${magic}"`);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const v = dv.getUint32(4, true);
  if (v !== HORIZON_VERSION) throw new Error(`horizon: version ${v}, reader reads ${HORIZON_VERSION}`);
  const jl = dv.getUint32(8, true);
  const meta = JSON.parse(utf8(bytes.subarray(12, 12 + jl)));
  const off = (12 + jl + 3) & ~3;
  const W = meta.width, H = meta.height, N = W * H;
  const n = dv.getUint32(off, true);
  if (bytes.length < off + 4 + n) throw new Error('horizon: file too short');
  const raw = inflateRaw(bytes.subarray(off + 4, off + 4 + n), N * 5);
  const rv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const hq = new Uint16Array(N), wq = new Uint16Array(N);
  for (let k = 0; k < N; k++) { hq[k] = rv.getUint16(k * 2, true); wq[k] = rv.getUint16(N * 2 + k * 2, true); }
  unpredictHeights(hq, W, H);
  const biome = raw.slice(N * 4, N * 5);
  return createHorizon(meta, hq, wq, biome);
}

export function createHorizon(meta, hq, wq, biome) {
  const W = meta.width, H = meta.height, step = meta.step, scale = (meta.heightMax - meta.heightMin) / 65535, lo = meta.heightMin;
  const hAt = (i, j) => lo + hq[j * W + i] * scale;
  const cl = (v, a, b) => (v < a ? a : v > b ? b : v);
  /** Triangle interpolation over the grid (split (i+1,j)-(i,j+1), as terrain-read.js), clamped to the world. */
  function interp(get, x, z) {
    const fx = cl((Number.isFinite(x) ? x : 0) / step, 0, W - 1.000001), fz = cl((Number.isFinite(z) ? z : 0) / step, 0, H - 1.000001);
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, w = fz - j;
    const h10 = get(i + 1, j), h01 = get(i, j + 1);
    if (u + w <= 1) { const h00 = get(i, j); return h00 + (h10 - h00) * u + (h01 - h00) * w; }
    const h11 = get(i + 1, j + 1); return h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - w);
  }
  let hg = null, wg = null;
  const wAt = (i, j) => { const q = wq[j * W + i]; return q ? lo + q * scale : NaN; };
  return {
    meta, width: W, height: H, step, zoneMetres: meta.zoneMetres, biomes: meta.biomes, baked: new Set(meta.baked || []),
    layers: { height: hq, waterTop: wq, biome },
    heightAt: (x, z) => interp(hAt, x, z),
    heightOfSample: hAt,
    waterAt(x, z) {
      const i = Math.round(cl(x / step, 0, W - 1)), j = Math.round(cl(z / step, 0, H - 1));
      if (!wq[j * W + i]) return null;
      const surface = lo + wq[j * W + i] * scale;
      return { surface, depth: Math.max(0, surface - interp(hAt, x, z)) };
    },
    biomeAt: (x, z) => biome[Math.round(cl(z / step, 0, H - 1)) * W + Math.round(cl(x / step, 0, W - 1))],
    heightGrid() { if (!hg) { hg = new Float32Array(W * H); for (let k = 0; k < W * H; k++) hg[k] = lo + hq[k] * scale; } return hg; },
    waterGrid() { if (!wg) { wg = new Float32Array(W * H); for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) wg[j * W + i] = wAt(i, j); } return wg; },
  };
}

/**
 * What the server's `joined` message carries so the client knows which far terrain to draw and where the zone sits
 * in it. `manifest` = data/world/horizon.json. Zone-local metres + zone.origin = horizon (world) metres.
 */
export function horizonRef(manifest, zoneId) {
  const m = /^z(\d\d)_(\d\d)$/.exec(String(zoneId));
  const zm = manifest.zoneMetres || 2048;
  return {
    file: manifest.file, hash: manifest.hash, step: manifest.step,
    zone: m ? { id: zoneId, origin: { x: +m[1] * zm, z: +m[2] * zm } } : { id: zoneId, origin: null },
  };
}
