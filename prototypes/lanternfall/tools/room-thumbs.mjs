// node tools/room-thumbs.mjs <file.json|room-id|--all> [--scale 1] — compile + settle a room, write rooms/_thumbs/<id>.png
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { loadData } from '../js/core/data.js';
import { compileRoom } from '../js/world/roomload.js';
import { writePng } from './png.mjs';
const here = new URL('../', import.meta.url);
const data = await loadData();
const args = process.argv.slice(2); const scale = +(args[args.indexOf('--scale') + 1] || 1) || 1;
let files = [];
if (args[0] === '--all') { const idx = JSON.parse(readFileSync(new URL('rooms/index.json', here))); files = Object.values(idx.rooms).map(r => new URL('rooms/' + r.file, here)); }
else if (args[0]?.endsWith('.json')) files = [new URL(args[0], 'file://' + process.cwd() + '/')];
else { const idx = JSON.parse(readFileSync(new URL('rooms/index.json', here))); files = [new URL('rooms/' + idx.rooms[args[0]].file, here)]; }
mkdirSync(new URL('rooms/_thumbs/', here), { recursive: true });
for (const f of files) {
  const room = JSON.parse(readFileSync(f)); const t0 = Date.now();
  const c = compileRoom(room, data); const g = c.grid, W = g.W, H = g.H, s = scale;
  const px = new Uint8Array(W * H * 4 * s * s);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, m = g.mat[i]; let col;
    if (m === 0) { const b = g.bg[i]; col = b ? data.mats.ramps[b][0].map(v => v * 0.8 + 10) : [14, 16, 24]; }
    else { const r = data.mats.ramps[m]; col = r[(g.shade[i] & 7) % r.length].map(v => Math.min(255, v * 2.2 + 12)); }
    for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) { const o = ((y * s + dy) * W * s + x * s + dx) * 4; px[o] = col[0]; px[o + 1] = col[1]; px[o + 2] = col[2]; px[o + 3] = 255; }
  }
  // things as markers
  for (const t of c.things) { const [x, y] = t.at || t.rect || [0, 0]; const color = { entry: [80, 255, 80], exit: [255, 80, 80], lamp_post: [255, 200, 90], spawn: [255, 0, 255], lever: [0, 200, 255] }[t.t] || [255, 255, 255];
    for (let dy = -3; dy <= 0; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; for (let a = 0; a < s; a++) for (let b = 0; b < s; b++) { const o = ((yy * s + a) * W * s + xx * s + b) * 4; px[o] = color[0]; px[o + 1] = color[1]; px[o + 2] = color[2]; } } }
  const out = new URL(`rooms/_thumbs/${room.id}.png`, here); writePng(out, px, W * s, H * s);
  console.log(`${room.id} ${W}x${H} compiled in ${Date.now() - t0} ms -> ${out.pathname} ${c.errors.length ? 'ERRORS ' + c.errors.join(';') : ''}`);
}
