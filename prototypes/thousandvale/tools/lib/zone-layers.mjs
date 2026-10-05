// Thousandvale — encoders for the zone side layers (stream B). Decoders: js/rules/terrain-read.js.
import { SCATTER_VERSION, parseTerrain, parseNav } from '../../js/rules/terrain-read.js';
import { deflateRawSync } from 'node:zlib';

function header(magic, version, meta, payload) {
  const json = new TextEncoder().encode(JSON.stringify(meta));
  const off = (12 + json.length + 3) & ~3;
  const out = new Uint8Array(off + payload);
  const dv = new DataView(out.buffer);
  for (let k = 0; k < 4; k++) out[k] = magic.charCodeAt(k);
  dv.setUint32(4, version, true); dv.setUint32(8, json.length, true); out.set(json, 12);
  return { out, dv, off };
}

/** items: [{x, z, kind, scale (0.5..2), yaw (rad), variant}] in zone metres. */
export function encodeScatter(items, meta) {
  const { out, dv, off } = header('TVSC', SCATTER_VERSION, { ...meta, count: items.length }, items.length * 8);
  const E = meta.extent, TAU = Math.PI * 2;
  items.forEach((it, i) => {
    const o = off + i * 8;
    dv.setUint16(o, Math.round(Math.min(1, Math.max(0, it.x / E)) * 65535), true);
    dv.setUint16(o + 2, Math.round(Math.min(1, Math.max(0, it.z / E)) * 65535), true);
    out[o + 4] = it.kind; out[o + 5] = Math.round(Math.min(1, Math.max(0, (it.scale - 0.5) / 1.5)) * 255);
    out[o + 6] = Math.round(((it.yaw % TAU) + TAU) % TAU / TAU * 256) & 255; out[o + 7] = it.variant & 255;
  });
  return out;
}

/** nav.bin, file version 2: the NAV bits deflated (decoder: parseNav). */
export function encodeNav(bits, meta) {
  const body = deflateRawSync(bits, { level: 9 });
  const { out, dv, off } = header('TVNV', 2, meta, 4 + body.length);
  dv.setUint32(off, body.length, true); out.set(body, off + 4);
  return out;
}

/**
 * Is a checked-in layer file the same as a fresh bake? terrain.bin / nav.bin are deflated, and deflate's exact
 * bytes may change with the zlib version even when the layers do not — so those two compare DECODED (meta +
 * every layer); anything else compares bytes.
 */
export function sameLayerFile(name, a, b) {
  const A = Buffer.from(a), B = Buffer.from(b);
  if (Buffer.compare(A, B) === 0) return true;
  try {
    if (name.endsWith('terrain.bin')) {
      const x = parseTerrain(A), y = parseTerrain(B);
      if (JSON.stringify(x.meta) !== JSON.stringify(y.meta)) return false;
      return ['height', 'waterTop', 'waterKind', 'biome'].every(k => Buffer.compare(Buffer.from(x.layers[k].buffer, x.layers[k].byteOffset, x.layers[k].byteLength), Buffer.from(y.layers[k].buffer, y.layers[k].byteOffset, y.layers[k].byteLength)) === 0);
    }
    if (name.endsWith('nav.bin')) {
      const x = parseNav(A), y = parseNav(B);
      return JSON.stringify(x.meta) === JSON.stringify(y.meta) && Buffer.compare(Buffer.from(x.bits), Buffer.from(y.bits)) === 0;
    }
  } catch { return false; }
  return false;
}
