// Thousandvale — a tiny PNG writer for the bake tools (stream B). Node only (node:zlib), no dependencies.
//
//   import { encodePng } from './lib/png.mjs';
//   writeFileSync('x.png', encodePng(width, height, rgba));   // rgba: Uint8Array(width * height * 4)
//
// Truecolour + alpha, 8 bits, filter "up" per row (good on maps: rows repeat a lot), deflate level 9.
import { deflateSync } from 'node:zlib';

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(bytes) { let c = 0xffffffff; for (const b of bytes) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0); out.write(type, 4, 'ascii'); Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** RGBA bytes → PNG file bytes (Buffer). `opaque` drops the alpha channel (smaller files). */
export function encodePng(width, height, rgba, { opaque = false } = {}) {
  const ch = opaque ? 3 : 4, row = width * ch;
  const raw = Buffer.alloc((row + 1) * height);
  let prev = null;
  for (let y = 0; y < height; y++) {
    const o = y * (row + 1), cur = Buffer.alloc(row);
    for (let x = 0; x < width; x++) for (let c = 0; c < ch; c++) cur[x * ch + c] = rgba[(y * width + x) * 4 + c];
    raw[o] = prev ? 2 : 0;
    for (let k = 0; k < row; k++) raw[o + 1 + k] = prev ? (cur[k] - prev[k]) & 255 : cur[k];
    prev = cur;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = opaque ? 2 : 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
