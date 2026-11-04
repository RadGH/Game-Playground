// Render a block of generated chunks to PNG: node tools/chunk-png.mjs <seed> <width> <cx> <cy> <n> out.png
import { generateMacro } from '../js/planet/macro.js';
import { createChunkGen, CH } from '../js/planet/chunkgen.js';
import { compileMaterials } from '../js/sim/materials.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
const here = new URL('..', import.meta.url).pathname;
const [seed = 7, width = 4096, cx0 = 10, cy0 = 10, n = 6, out = 'chunks.png'] = process.argv.slice(2).map((v, i) => i < 5 ? +v : v);
const M = compileMaterials(JSON.parse(readFileSync(here + 'data/materials.json')));
const macro = generateMacro({ seed, width });
const gen = createChunkGen(macro, M);
const W = n * CH, H = n * CH, raw = Buffer.alloc((W * 3 + 1) * H);
let t0 = performance.now();
for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
  const c = gen.generate((cx0 + a) % gen.chunksX, cy0 + b);
  for (let y = 0; y < CH; y++) for (let x = 0; x < CH; x++) {
    const i = y * CH + x, m = c.mat[i] || c.ground[i];
    const sh = 0.75 + c.height[i] / 255 * 0.5 + (c.tall[i] ? 0.15 : 0);
    const o = (b * CH + y) * (W * 3 + 1) + 1 + (a * CH + x) * 3;
    raw[o] = Math.min(255, M.r[m] * sh); raw[o + 1] = Math.min(255, M.g[m] * sh); raw[o + 2] = Math.min(255, M.b[m] * sh);
  }
}
console.log(`${n * n} chunks in ${(performance.now() - t0).toFixed(0)} ms`);
const crc = (buf) => { let c, t = []; for (let k = 0; k < 256; k++) { c = k; for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[k] = c >>> 0; } let x = 0xffffffff; for (const v of buf) x = t[(x ^ v) & 255] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
