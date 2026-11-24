// Oathwild — draw the round-1 map as a PNG (pure Node, no browser) so the owner and the builders can SEE it.
//
//   node prototypes/oathwild/tools/map-preview.mjs [--out path.png] [--scale 1.5] [--text]
//
// Default output: prototypes/oathwild/docs/map-overview.png (north at the top; x east, z south).
// Draws biomes with hill shading, rivers, marsh water, roads, bridges (white) and fords (blue dashes), region border,
// level-band circles (thin), camps (red), shrines (cyan), towns (yellow), NPCs (white dots), chests (gold),
// quest objects (violet), roam zones (orange rings) and the names of places. --text also prints a text summary.
import { readFileSync, writeFileSync } from 'node:fs';
import { createTerrain, BIOMES, BIOME_COLOUR } from '../js/world/terrain.js';
import { encodePng } from '../../thousandvale/tools/lib/png.mjs';

const here = p => new URL(p, import.meta.url);
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const map = JSON.parse(readFileSync(here('../data/map.json'), 'utf8'));
let placements = null, npcs = null, regions = null;
try { placements = JSON.parse(readFileSync(here('../data/placements.json'), 'utf8')); } catch { /* not made yet */ }
try { npcs = JSON.parse(readFileSync(here('../data/npcs.json'), 'utf8')); } catch { /* not made yet */ }
try { regions = JSON.parse(readFileSync(here('../data/regions.json'), 'utf8')); } catch { /* */ }

const t0 = Date.now();
const T = createTerrain(map);
const built = Date.now() - t0;
const mpp = Number(arg('--scale', 1.5));     // metres per pixel
const B = map.bounds;
const W = Math.round((B.maxX - B.minX) / mpp), Hh = Math.round((B.maxZ - B.minZ) / mpp);
const px = new Uint8Array(W * Hh * 4);
const toPx = (x, z) => [Math.round((x - B.minX) / mpp), Math.round((z - B.minZ) / mpp)];
const put = (x, y, [r, g, b], a = 1) => {
  if (x < 0 || y < 0 || x >= W || y >= Hh) return;
  const o = (y * W + x) * 4;
  px[o] = px[o] * (1 - a) + r * a; px[o + 1] = px[o + 1] * (1 - a) + g * a; px[o + 2] = px[o + 2] * (1 - a) + b * a; px[o + 3] = 255;
};

// ground
for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
  const wx = B.minX + (x + 0.5) * mpp, wz = B.minZ + (y + 0.5) * mpp;
  const bg = T.biomeGrid, bi = Math.min(bg.nx - 1, Math.floor((wx - bg.minX) / bg.cell)), bk = Math.min(bg.nz - 1, Math.floor((wz - bg.minZ) / bg.cell));
  let c = [...BIOME_COLOUR[BIOMES[bg.ids[bk * bg.nx + bi]]]];
  const w = T.waterAt(wx, wz);
  if (w && w.depth > 0) { const k = Math.min(1, w.depth / 2); c = [64 - 20 * k, 128 - 30 * k, 196 - 20 * k].map(Math.round); }
  // light from the north-west
  const h = T.heightAt(wx, wz), hx = T.heightAt(wx + 2, wz), hz = T.heightAt(wx, wz + 2);
  const shade = Math.max(0.55, Math.min(1.35, 1 + ((h - hx) + (h - hz)) * 0.18));
  const tint = 0.9 + Math.min(0.2, h / 300);
  put(x, y, c.map(v => Math.max(0, Math.min(255, v * shade * tint))));
  if (!T.inPlay(wx, wz)) put(x, y, [40, 40, 50], 0.35);
}
// region border
for (let z = B.minZ; z < B.maxZ; z += 1) { const [x, y] = toPx(T.borderX(z), z); if ((z | 0) % 8 < 4) put(x, y, [250, 240, 200], 0.7); }
// roads
const ROADC = { road: [236, 214, 160], trail: [214, 190, 140], boardwalk: [150, 108, 64] };
for (const r of T.roads) for (const p of r.pts) {
  const rad = Math.max(1, Math.round(r.width / 2 / mpp));
  const [x, y] = toPx(p.x, p.z);
  for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) if (dx * dx + dy * dy <= rad * rad) put(x + dx, y + dy, ROADC[r.class] || ROADC.trail, 0.9);
}
for (const b of T.bridges) {
  const n = 30;
  for (let i = 0; i <= n; i++) {
    const x = b.a[0] + (b.b[0] - b.a[0]) * i / n, z = b.a[1] + (b.b[1] - b.a[1]) * i / n;
    const [px0, py0] = toPx(x, z);
    const col = b.kind === 'ford' ? (i % 4 < 2 ? [120, 190, 255] : [236, 214, 160]) : b.kind === 'bridge' ? [255, 255, 255] : [255, 0, 255];
    for (let d = -2; d <= 2; d++) { put(px0 + d, py0, col); put(px0, py0 + d, col); }
  }
}
const ring = (at, r, col, a = 0.8) => { const n = Math.max(24, Math.round(r / mpp * 6)); for (let i = 0; i < n; i++) { const [x, y] = toPx(at[0] + Math.cos(i / n * 6.283) * r, at[1] + Math.sin(i / n * 6.283) * r); put(x, y, col, a); } };
const dot = (at, r, col) => { const [x, y] = toPx(at[0], at[1]); for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) put(x + dx, y + dy, col); };
for (const a of map.areas) ring(a.at, a.radius, [255, 255, 255], 0.18);
if (placements) {
  for (const z of placements.roam || []) ring(z.at, z.radius, [255, 150, 40], 0.75);
  for (const b of placements.buildings || []) { const [x, y] = toPx(b.at[0], b.at[1]); const r = Math.max(2, Math.round((b.footprint || 6) / 2 / mpp)); for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) put(x + dx, y + dy, [120, 70, 50]); }
  for (const p of placements.props || []) dot(p.at, 1, [90, 60, 40]);
  for (const o of placements.objects || []) dot(o.at, 2, [190, 90, 255]);
}
if (regions) for (const r of Object.values(regions.regions)) {
  for (const c of Object.values(r.chests || {})) dot(c.at, 2, [255, 200, 40]);
  for (const c of Object.values(r.camps || {})) { dot(c.at, 4, [220, 40, 40]); ring(c.at, 8, [220, 40, 40]); }
  for (const s of Object.values(r.shrines || {})) { dot(s.at, 4, [60, 230, 255]); ring(s.at, 40, [60, 230, 255], 0.35); }
}
if (npcs) for (const n of Object.values(npcs.npcs || {})) if (n.at) dot(n.at, 2, [255, 255, 255]);
for (const p of Object.values(T.places)) if (p.kind === 'town') ring(p.at, p.radius, [255, 230, 80], 0.9);

// labels (a 5x7 pixel font)
const FONT = {
  A: '01110100011000111111100011000110001', B: '11110100011000111110100011000111110', C: '01110100011000010000100001000101110', D: '11110100011000110001100011000111110',
  E: '11111100001000011110100001000011111', F: '11111100001000011110100001000010000', G: '01110100011000010111100011000101111', H: '10001100011000111111100011000110001',
  I: '01110001000010000100001000010001110', J: '00111000100001000010000101001001100', K: '10001100101010011000101001001010001', L: '10000100001000010000100001000011111',
  M: '10001110111010110101100011000110001', N: '10001100011100110101100111000110001', O: '01110100011000110001100011000101110', P: '11110100011000111110100001000010000',
  Q: '01110100011000110001101011001001101', R: '11110100011000111110101001001010001', S: '01111100001000001110000010000111110', T: '11111001000010000100001000010000100',
  U: '10001100011000110001100011000101110', V: '10001100011000110001100010101000100', W: '10001100011000110101101011010101010', X: '10001100010101000100010101000110001',
  Y: '10001100010101000100001000010000100', Z: '11111000010001000100010001000011111', ' ': '00000000000000000000000000000000000', "'": '00100001000000000000000000000000000',
  0: '01110100011001110101110011000101110', 1: '00100011000010000100001000010001110', 2: '01110100010000100010001000100011111', 3: '11111000100010000010000011000101110',
  4: '00010001100101010010111110001000010', 5: '11111100001111000001000011000101110', 6: '00110010001000011110100011000101110', 7: '11111000010001000100010000100001000',
  8: '01110100011000101110100011000101110', 9: '01110100011000101111000010001001100', '-': '00000000000000011111000000000000000',
};
function label(text, at, col = [255, 255, 255]) {
  const s = String(text).toUpperCase();
  let [x, y] = toPx(at[0], at[1]);
  x -= Math.round(s.length * 3); y -= 14;
  for (const ch of s) {
    const g = FONT[ch] || FONT[' '];
    for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) if (g[r * 5 + c] === '1') { put(x + c + 1, y + r + 1, [0, 0, 0], 0.7); put(x + c, y + r, col); }
    x += 6;
  }
}
for (const p of Object.values(T.places)) {
  const col = p.kind === 'camp' ? [255, 170, 160] : p.kind === 'shrine' ? [170, 240, 255] : p.kind === 'town' ? [255, 240, 140] : [255, 255, 255];
  label(p.name.replace(/^the /i, ''), p.at, col);
}
for (const a of map.areas) { const [x, y] = toPx(a.at[0], a.at[1] + a.radius - 10); label(`L${a.levels[0]}-${a.levels[1]}`, [a.at[0], a.at[1] + a.radius], [230, 230, 230]); void x; void y; }
for (const b of T.bridges) if (b.name) label(b.name.replace(/^the /i, ''), [b.at[0], b.at[1] + 16], [200, 230, 255]);

const out = arg('--out', new URL('../docs/map-overview.png', import.meta.url).pathname);
writeFileSync(out, encodePng(W, Hh, px, { opaque: true }));
console.log(`map ${W}x${Hh}px (${mpp} m/px) -> ${out}  (terrain built in ${built} ms)`);

if (process.argv.includes('--text')) {
  const count = {};
  for (const id of T.biomeGrid.ids) count[BIOMES[id]] = (count[BIOMES[id]] || 0) + 1;
  const total = T.biomeGrid.ids.length;
  console.log('biomes:', Object.entries(count).map(([k, v]) => `${k} ${Math.round(v / total * 100)}%`).join(', '));
  console.log('marsh level:', T.marshes.map(m => `${m.id} ${m.level} m`).join(', '));
  for (const b of T.bridges) console.log(`crossing ${b.id} (${b.kind}) at ${b.at} deck ${b.deck} water ${b.surface}`);
  for (const p of Object.values(T.places)) console.log(`${p.id.padEnd(16)} ${p.kind.padEnd(8)} (${p.at}) y ${p.y} slope ${T.slopeAt(...p.at).toFixed(1)} walk ${T.walkable(...p.at)} band ${T.levelBandAt(...p.at)} ${T.biomeAt(...p.at)}`);
}
