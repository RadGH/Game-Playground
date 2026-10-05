// Thousandvale — encoders for the zone side layers (stream B). Decoders: js/rules/terrain-read.js.
import { SCATTER_VERSION, NAV_VERSION } from '../../js/rules/terrain-read.js';

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

export function encodeNav(bits, meta) {
  const { out, off } = header('TVNV', NAV_VERSION, meta, bits.length);
  out.set(bits, off);
  return out;
}
