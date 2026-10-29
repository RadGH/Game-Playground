// Headless snapshot: run a level/sandbox N seconds and write a PNG of the CPU frame (no lights).
// node tools/snap.mjs <level|sandbox> <secs> <out.png> [scale] [recipe]
import fs from 'node:fs';
import zlib from 'node:zlib';
import { loadData } from '../tests/load.mjs';
import { createSession, prepareData } from '../js/game/session.js';
import { createFrame, buildFrame } from '../js/render/frame.js';
const data = prepareData(loadData());
const [id = '1-1', secsS = '10', out = 'snap.png', scaleS = '2', recipe = 'greenvale'] = process.argv.slice(2);
const level = id === 'sandbox' ? null : data.levels.acts.flatMap(a => a.levels).find(l => l.id === id);
const s = createSession(data, level ? { mode: 'challenge', level } : { mode: 'sandbox', recipe, seed: 7, W: 224, H: 224 });
for (let k = 0; k < +secsS * 30; k++) s.step();
const f = createFrame(s.sim.world);
buildFrame(f, s.sim.world, s.sim.ps, { daylight: 1, draw: (api) => s.sim.creatures.draw(api, s.sim.tick) });
writePng(out, f.color, s.sim.world.W, s.sim.world.H, +scaleS);
console.log('wrote', out, JSON.stringify(s.state().creatures), 'burning', s.sim.world.stats.burning, 'result', JSON.stringify(s.result));
function writePng(file, rgba, W, H, k) {
  const w = W * k, h = H * k;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const o = ((y / k | 0) * W + (x / k | 0)) * 4, p = y * (w * 3 + 1) + 1 + x * 3;
      raw[p] = rgba[o]; raw[p + 1] = rgba[o + 1]; raw[p + 2] = rgba[o + 2];
    }
  }
  const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k2 = 0; k2 < 8; k2++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = (b) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}
