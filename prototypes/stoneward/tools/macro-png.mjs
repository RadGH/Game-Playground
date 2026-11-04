// Draw a macro map to a PNG for eyeballing: node tools/macro-png.mjs <seed> <width> [shape] [out.png]
import { generateMacro } from '../js/planet/macro.js';
import { BIOME_RGB } from '../js/planet/biomes.js';
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
const [seed = 7, width = 8192, shape = 'continents', out = 'macro.png'] = process.argv.slice(2);
const t0 = performance.now();
const m = generateMacro({ seed: +seed, width: +width, shape });
console.log(`${m.mw}x${m.mh} in ${(performance.now() - t0).toFixed(0)} ms, rivers ${m.rivers.length}`);
const W = m.mw * 2, H = m.mh;   // draw twice side by side to see the seam
const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) { raw[y * (W * 3 + 1)] = 0; for (let x = 0; x < W; x++) {
  const i = y * m.mw + (x % m.mw); let [r, g, b] = BIOME_RGB[m.biome[i]];
  if (m.river[i]) { r = 60; g = 110; b = 180; }
  const o = y * (W * 3 + 1) + 1 + x * 3; raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; } }
const crc = (buf) => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } let x = 0xffffffff; for (const v of buf) x = t[(x ^ v) & 255] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
const counts = {}; for (const b of m.biome) counts[b] = (counts[b] || 0) + 1; console.log(counts);
