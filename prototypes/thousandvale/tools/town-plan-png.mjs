#!/usr/bin/env node
// Stream W — a top-down drawing of one town's PLAN, straight from the baked files (no browser).
//
//   node prototypes/thousandvale/tools/town-plan-png.mjs <zone> <town id> <out.png> [--scale 5] [--dir <zones dir>]
//   node prototypes/thousandvale/tools/town-plan-png.mjs --all <out dir>                      every town of every zone
//
// What is drawn (zone metres, north up):
//   grey-green  ground       tan         road surface as painted in terrain.bin (what the player sees as road)
//   brown       building plots (offices darker, outlined)          red tint   nav BUILDING / SOLID samples
//   dark grey   wall runs + towers        yellow   gate openings (line = the way the gate faces)
//   white       street centrelines (thick = main, thin = alley)    MAGENTA    each gate's main street (data.gates[].main)
//   blue        water         cyan dots   square furniture (well, stalls)     orange dots   stream E's bodies / props
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTerrain, parseNav, NAV } from '../js/rules/terrain-read.js';
import { encodePng } from './lib/png.mjs';
import { squareFurniture } from '../js/client/town-square.js';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..');

export function drawTown({ zone, town, scale = 5, dir = join(ROOT, 'data', 'zones') }) {
  const zdir = join(dir, zone);
  const P = JSON.parse(readFileSync(join(zdir, 'placements.json'), 'utf8')).placements;
  const buf = b => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  const t = parseTerrain(buf(readFileSync(join(zdir, 'terrain.bin'))));
  const nav = parseNav(buf(readFileSync(join(zdir, 'nav.bin'))));
  const S = P.find(p => p.kind === 'settlement' && p.id === town);
  if (!S) throw new Error(`no settlement ${town} in ${zone}`);
  const R = S.data.radius + 12, x0 = S.x - R, z0 = S.z - R, W = Math.round(2 * R * scale);
  const px = new Uint8Array(W * W * 4);
  const set = (i, j, r, g, b, a = 1) => { if (i < 0 || j < 0 || i >= W || j >= W) return; const o = (j * W + i) * 4; px[o] = px[o] * (1 - a) + r * a; px[o + 1] = px[o + 1] * (1 - a) + g * a; px[o + 2] = px[o + 2] * (1 - a) + b * a; px[o + 3] = 255; };
  const roadId = t.biomes.length - 1;
  for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
    const x = x0 + i / scale, z = z0 + j / scale;
    const wet = t.waterAt(Math.max(0, Math.min(2047.9, x)), Math.max(0, Math.min(2047.9, z))).kind !== 'none';
    const b = t.biomeAt ? t.biomeAt(x, z) : 0, id = typeof b === 'number' ? b : b?.id;
    let c = [118, 138, 96];
    if (id === roadId) c = [196, 172, 126];
    if (wet) c = [70, 120, 170];
    set(i, j, ...c);
    const n = nav.at ? nav.at(x, z) : 0;
    if (n & NAV.SOLID) set(i, j, 200, 40, 40, 0.35); else if (n & NAV.BUILDING) set(i, j, 170, 60, 30, 0.22);
  }
  const line = (a, b, w, col, alpha = 1) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L * scale * 2)), hw = Math.max(0.5, w * scale / 2);
    for (let q = 0; q <= n; q++) {
      const cx = (a[0] + (b[0] - a[0]) * q / n - x0) * scale, cz = (a[1] + (b[1] - a[1]) * q / n - z0) * scale;
      for (let dj = -Math.ceil(hw); dj <= Math.ceil(hw); dj++) for (let di = -Math.ceil(hw); di <= Math.ceil(hw); di++) if (di * di + dj * dj <= hw * hw + 0.3) set(Math.round(cx + di), Math.round(cz + dj), ...col, alpha);
    }
  };
  const poly = (pts, w, col, alpha) => { for (let k = 0; k < pts.length - 1; k++) line(pts[k], pts[k + 1], w, col, alpha); };
  const dot = (x, z, r, col) => line([x, z], [x, z], r * 2, col);
  const mine = p => p.data?.town === town;
  for (const p of P.filter(p => p.kind === 'building' && mine(p))) {
    const c = Math.cos(p.data.angle), s = Math.sin(p.data.angle), w = p.data.w / 2, d = p.data.d / 2;
    const col = p.data.office ? [112, 70, 44] : [150, 110, 78];
    for (let j = Math.floor((p.z - z0 - 12) * scale); j < (p.z - z0 + 12) * scale; j++) for (let i = Math.floor((p.x - x0 - 12) * scale); i < (p.x - x0 + 12) * scale; i++) {
      const dx = x0 + i / scale - p.x, dz = z0 + j / scale - p.z;
      if (Math.abs(dx * c + dz * s) <= w && Math.abs(-dx * s + dz * c) <= d) set(i, j, ...col, 0.9);
    }
    // the door side
    const fa = p.data.front, half = (Math.abs(Math.cos(fa - p.data.angle)) > 0.5 ? p.data.w : p.data.d) / 2;
    dot(p.x + Math.cos(fa) * half, p.z + Math.sin(fa) * half, 0.5, [250, 230, 150]);
  }
  for (const p of P.filter(p => p.kind === 'street' && mine(p))) poly(p.data.pts, p.data.cls === 'main' ? 0.9 : 0.35, [255, 255, 255], p.data.cls === 'main' ? 0.95 : 0.7);
  const wall = P.find(p => p.kind === 'town_wall' && mine(p));
  if (wall) {
    for (const r of wall.data.runs) poly(r, Math.max(1, wall.data.thick), [50, 50, 56]);
    for (const tw of wall.data.towers) dot(tw.x, tw.z, 2.4, [50, 50, 56]);
    for (const g of wall.data.gates) {
      if (g.main?.pts) poly(g.main.pts, 0.6, [255, 0, 220]);
      if (g.ends) line(g.ends[0], g.ends[1], 0.5, [255, 220, 0]);
      line([g.x, g.z], [g.x + g.out[0] * 6, g.z + g.out[1] * 6], 0.5, [255, 220, 0]);
    }
  }
  const sq = P.find(p => p.kind === 'town_square' && mine(p));
  if (sq) {
    const f = squareFurniture({ square: { x: sq.x, z: sq.z, r: sq.data.r }, stalls: sq.data.stalls });
    dot(f.well.x, f.well.z, f.well.r, [0, 230, 230]);
    for (const s of f.stalls) dot(s.x, s.z, s.r, [0, 230, 230]);
  }
  for (const suffix of ['', '.quest']) {
    const f = join(ROOT, 'data', 'vignettes', 'placements', `${zone}${suffix}.json`);
    if (!existsSync(f)) continue;
    for (const v of JSON.parse(readFileSync(f, 'utf8')).placements || []) if (Number.isFinite(v.x) && Math.hypot(v.x - S.x, v.z - S.z) < R) dot(v.x, v.z, Math.max(0.5, Math.min(v.radius || 0.5, 3)), suffix ? [255, 120, 0] : [255, 170, 60]);
  }
  return encodePng(W, W, px, { opaque: true });
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const a = process.argv.slice(2), opt = k => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : null; };
  const scale = +(opt('--scale') || 5), dir = opt('--dir') || join(ROOT, 'data', 'zones');
  if (a[0] === '--all') {
    const out = a[1]; mkdirSync(out, { recursive: true });
    for (const zone of readdirSync(dir).filter(z => /^z\d\d_\d\d$/.test(z))) {
      const P = JSON.parse(readFileSync(join(dir, zone, 'placements.json'), 'utf8')).placements;
      for (const s of P.filter(p => p.kind === 'settlement' && p.data.planned)) { writeFileSync(join(out, `${zone}-${s.id}.png`), drawTown({ zone, town: s.id, scale, dir })); console.log('drew', zone, s.id); }
    }
  } else {
    writeFileSync(a[2], drawTown({ zone: a[0], town: a[1], scale, dir }));
    console.log('wrote', a[2]);
  }
}
