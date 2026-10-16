#!/usr/bin/env node
// Thousandvale — MAP bake (stream B, play-test 1 P3: "no world map or region map — the most missing piece").
//
//   node prototypes/thousandvale/tools/bake-map.mjs            # writes data/world/map/
//   node prototypes/thousandvale/tools/bake-map.mjs --check    # exit 1 if the checked-in map is stale
//
// Reads the checked-in bake (data/world/{world.json, horizon.bin}, data/zones/<id>/{terrain.bin, placements.json})
// and stream E's province sheet (names, level bands, dungeon names). Writes, sized for a browser:
//
//   data/world/map/world.png          the whole world, 1 px = 32 m (1153 × 897): shaded relief in biome colours,
//                                     water, rivers and roads as thin lines. No text — labels come from map.json so
//                                     the client draws them crisp at any zoom.
//   data/world/map/zones/<id>.png     one per BAKED zone, 1 px = 4 m (512 × 512): relief, water (deeper = darker),
//                                     roads and streets, bridges, building footprints. Four of them side by side are
//                                     a province (2048 px); halve them for an 8 m view.
//   data/world/map/map.json           everything to draw ON the images, in WORLD metres (+x east, +z south; zone
//                                     (zx, zy) covers x ∈ [zx·2048, zx·2048 + 2048]):
//     world   { image, width, height, mPerPx: 32, metres: [w, h] }
//     zoneImage { mPerPx: 4, size: 512 }
//     zones   [{ id, origin {x, z}, image|null, province, sheetZone, name, band [lo, hi], archetype, town, dungeon }]
//              (band / name / archetype only for zones on a province sheet — stream E's level bands)
//     provinces [{ id, name, sheet, band [lo, hi], zones, bounds [x0, z0, x1, z1] }]
//     labels  [{ kind, name, x, z, zone, minZoom }]  kind: province | zone | town | village | hamlet | dungeon |
//              event | camp | ford | bridge | lake | river.  minZoom: 0 world, 1 province, 2 zone — show a label at
//              that zoom and closer.
//     roads   [{ id, cls, pts [[x, z]…] }]  world roads, simplified to ~2 m error (draw over the world image)
//     rivers  [{ id, name, cls, pts [[x, z]…] }]
// Deterministic; tests/B/map.test.js checks it is current and sane.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTerrain } from '../js/rules/terrain-read.js';
import { parseHorizon } from '../js/rules/horizon-read.js';
import { encodePng } from './lib/png.mjs';
import { REGION_PALETTES, regionAt } from '../js/client/horizon-grid.js';
import { loadWorld } from './bake-zone.mjs';
import { CONTINENTS, continentRect } from './lib/world-core.mjs';
import { builtLines } from './lib/coast-lines.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, '..', 'data');
const OUT = join(DATA, 'world', 'map');
export const MAP_VERSION = 1;
const ZPX = 512, ZM = 2048, ZMPP = ZM / ZPX;

const hex = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

/** Hillshade 0..1 from a height getter (light from the north-west, like a paper map). */
function shade(h, x, z, d) {
  const dx = (h(x + d, z) - h(x - d, z)) / (2 * d), dz = (h(x, z + d) - h(x, z - d)) / (2 * d);
  const len = Math.hypot(dx, 1, dz), nx = -dx / len, ny = 1 / len, nz = -dz / len;
  const L = [-0.55, 0.65, -0.52], ll = Math.hypot(...L);
  return clamp((nx * L[0] + ny * L[1] + nz * L[2]) / ll, 0, 1);
}
/** Quantise to a few steps (smaller PNGs; maps read better in bands anyway). */
const band = (v, n) => Math.round(v * n) / n;

function line(px, W, H, x0, y0, x1, y1, rgb, a = 1) {
  const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2) + 1;
  for (let q = 0; q <= n; q++) {
    const x = Math.round(x0 + (x1 - x0) * q / n), y = Math.round(y0 + (y1 - y0) * q / n);
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const o = (y * W + x) * 4;
    for (let c = 0; c < 3; c++) px[o + c] = Math.round(px[o + c] * (1 - a) + rgb[c] * a);
  }
}

/** Douglas–Peucker on [[x, z]…]. */
function simplify(pts, eps) {
  if (pts.length < 3) return pts.map(p => [p[0], p[1]]);
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); let best = -1, bd = eps;
    const ax = pts[a][0], az = pts[a][1], dx = pts[b][0] - ax, dz = pts[b][1] - az, L = Math.hypot(dx, dz) || 1;
    for (let k = a + 1; k < b; k++) { const d = Math.abs((pts[k][0] - ax) * dz - (pts[k][1] - az) * dx) / L; if (d > bd) { bd = d; best = k; } }
    if (best > 0) { keep[best] = 1; stack.push([a, best], [best, b]); }
  }
  return pts.filter((_, k) => keep[k]).map(p => [+p[0].toFixed(1), +p[1].toFixed(1)]);
}

export function bakeMap() {
  const W = JSON.parse(readFileSync(join(DATA, 'world', 'world.json'), 'utf8'));
  const H = parseHorizon(readFileSync(join(DATA, 'world', 'horizon.bin')));
  const PMAP = JSON.parse(readFileSync(join(DATA, 'world', 'province-map.json'), 'utf8')).provinces || {};
  const sheets = {};
  for (const sid of Object.keys(PMAP)) { try { sheets[sid] = JSON.parse(readFileSync(join(DATA, 'provinces', `${sid}.json`), 'utf8')); } catch { /* none */ } }
  const sheetOf = id => { for (const [sid, pm] of Object.entries(PMAP)) { const e = Object.entries(pm.map || {}).find(([, z]) => z === id); if (e) return { sid, zone: e[0], row: sheets[sid]?.zones?.[e[0]] || null }; } return null; };
  const biomeRgb = H.biomes.map(b => hex(b[2]));
  // a region with its own ground (Vharlen) is drawn in its own colours (js/client/horizon-grid.js REGION_PALETTES)
  const regionRgb = Object.fromEntries(Object.entries(REGION_PALETTES).map(([k, P]) => [k, H.biomes.map(b => (P.colors[b[0]] ? hex(P.colors[b[0]]) : hex(b[2])))]));
  // 2026-10-14 islands: an expansion island's roads are its own (tools/lib/vharlen.mjs) and World Forge's old mainland
  // roads and rivers inside its block are gone; elsewhere a line is drawn only where it runs over land
  // play-test 11 (Z4, live #4 "rivers and roads spilling out of the island and running into the ocean"): the lines drawn
  // are the ones BUILT — every road a zone bake laid, each river from its source to its mouth at the sea, nothing over
  // open water and nothing of the old mainland inside an island's block (tools/lib/coast-lines.mjs)
  const { roads: ROADS, rivers: RIVERS } = builtLines({ W: loadWorld().json, H, PMAP, CONTINENTS, continentRect,
    placementsOf: id => { const f = join(DATA, 'zones', id, 'placements.json'); return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')).placements : null; } });
  const dry = () => true;
  const files = {};

  // ---- world image: 1 px = one horizon sample (32 m) ----
  const WW = H.width, WH = H.height, step = H.step, wpx = new Uint8Array(WW * WH * 4);
  const hAt = (x, z) => H.heightAt(x, z);
  for (let j = 0; j < WH; j++) for (let i = 0; i < WW; i++) {
    const x = i * step, z = j * step, o = (j * WW + i) * 4;
    const w = H.waterAt(x, z);
    let rgb;
    if (w && w.depth > 0) { const d = clamp(w.depth / 40, 0, 1); rgb = [52 - 30 * d, 104 - 50 * d, 150 - 40 * d].map(v => band(v / 255, 24) * 255); }
    else { const s = band(0.45 + 0.75 * shade(hAt, x, z, step), 10), rg = regionAt(x, z), b = (rg ? regionRgb[rg] : biomeRgb)[H.biomeAt(x, z)] || [120, 140, 90]; rgb = b.map(c => clamp(c * s, 0, 255)); }
    wpx[o] = rgb[0]; wpx[o + 1] = rgb[1]; wpx[o + 2] = rgb[2]; wpx[o + 3] = 255;
  }
  for (const r of RIVERS) for (let k = 0; k < r.pts.length - 1; k++) { const a = r.pts[k], b = r.pts[k + 1]; if (!dry(a, b)) continue; line(wpx, WW, WH, a[0] / step, a[1] / step, b[0] / step, b[1] / step, [58, 112, 160], r.cls >= 2 ? 1 : 0.6); }
  for (const r of ROADS) for (let k = 0; k < r.pts.length - 1; k++) { const a = r.pts[k], b = r.pts[k + 1]; if (!dry(a, b)) continue; line(wpx, WW, WH, a[0] / step, a[1] / step, b[0] / step, b[1] / step, [214, 190, 140], r.cls === 'trail' ? 0.45 : 0.8); }
  files['world.png'] = encodePng(WW, WH, wpx, { opaque: true });

  // ---- zone images + labels from the baked zones ----
  const zones = [], labels = [];
  for (const z of W.zones) {
    const dir = join(DATA, 'zones', z.id), sh = sheetOf(z.id), row = sh?.row;
    const rec = { id: z.id, origin: z.origin, image: null, province: z.province, land: z.land };
    if (row) Object.assign(rec, { sheetZone: sh.zone, sheet: sh.sid, name: row.name, band: row.band || null, archetype: row.archetype || null, town: row.town || null, dungeon: row.dungeon?.name || null });
    if (existsSync(join(dir, 'terrain.bin'))) {
      const t = parseTerrain(readFileSync(join(dir, 'terrain.bin')));
      const P = JSON.parse(readFileSync(join(dir, 'placements.json'), 'utf8')).placements;
      const px = new Uint8Array(ZPX * ZPX * 4), roadId = t.biomes.length - 1, zb = t.biomes.map(b => hex(REGION_PALETTES[t.meta.palette]?.colors[b.key] || b.color));
      const g = (x, zz) => t.groundAt(x, zz);
      for (let j = 0; j < ZPX; j++) for (let i = 0; i < ZPX; i++) {
        const x = (i + 0.5) * ZMPP, zz = (j + 0.5) * ZMPP, o = (j * ZPX + i) * 4;
        const w = t.waterAt(x, zz), bi = t.biomeAt(x, zz);
        let rgb;
        if (w.depth > 0 && Number.isNaN(t.deckAt(x, zz))) { const d = clamp(w.depth / 3, 0, 1); rgb = [70 - 40 * d, 128 - 60 * d, 168 - 40 * d].map(v => band(v / 255, 20) * 255); }
        else {
          const s = band(0.5 + 0.7 * shade(g, x, zz, ZMPP), 12);
          const b = bi === roadId ? [196, 170, 120] : zb[bi] || [120, 140, 90];
          rgb = b.map(c => clamp(c * s, 0, 255));
        }
        px[o] = rgb[0]; px[o + 1] = rgb[1]; px[o + 2] = rgb[2]; px[o + 3] = 255;
      }
      // buildings (rotated footprints) and bridge decks on top
      const fill = (cx, cz, w, d, ang, rgb) => {
        const c = Math.cos(ang), s = Math.sin(ang), r = Math.hypot(w, d) / 2;
        for (let j = Math.max(0, Math.floor((cz - r) / ZMPP)); j <= Math.min(ZPX - 1, Math.ceil((cz + r) / ZMPP)); j++)
          for (let i = Math.max(0, Math.floor((cx - r) / ZMPP)); i <= Math.min(ZPX - 1, Math.ceil((cx + r) / ZMPP)); i++) {
            const dx = (i + 0.5) * ZMPP - cx, dz = (j + 0.5) * ZMPP - cz, lx = dx * c + dz * s, lz = -dx * s + dz * c;
            if (Math.abs(lx) <= w / 2 && Math.abs(lz) <= d / 2) { const o = (j * ZPX + i) * 4; px[o] = rgb[0]; px[o + 1] = rgb[1]; px[o + 2] = rgb[2]; }
          }
      };
      for (const b of P.filter(p => p.kind === 'building')) fill(b.x, b.z, b.data.w, b.data.d, b.data.angle, [92, 62, 44]);
      // town perimeters (play-test 4, S7): the runs as a dark line, towers as dots; gates are simply where the line breaks
      for (const w of P.filter(p => p.kind === 'town_wall')) {
        const ink = w.data.tier === 'wall' ? [64, 60, 56] : [104, 84, 60];
        const dot = (x, zz) => { const i = Math.floor(x / ZMPP), j = Math.floor(zz / ZMPP); if (i < 0 || j < 0 || i >= ZPX || j >= ZPX) return; const o = (j * ZPX + i) * 4; px[o] = ink[0]; px[o + 1] = ink[1]; px[o + 2] = ink[2]; };
        for (const run of w.data.runs) for (let k = 0; k < run.length - 1; k++) {
          const [ax, az] = run[k], [bx, bz] = run[k + 1], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / (ZMPP / 2)));
          for (let q = 0; q <= n; q++) dot(ax + (bx - ax) * q / n, az + (bz - az) * q / n);
        }
        for (const t of w.data.towers) fill(t.x, t.z, 4.6, 4.6, 0, ink);
      }
      for (const b of P.filter(p => p.kind === 'bridge')) {
        const [ax, az] = b.data.a, [bx, bz] = b.data.b;
        fill((ax + bx) / 2, (az + bz) / 2, Math.hypot(bx - ax, bz - az), b.data.width, Math.atan2(bz - az, bx - ax), [138, 100, 64]);
      }
      const name = `zones/${z.id}.png`;
      files[name] = encodePng(ZPX, ZPX, px, { opaque: true });
      rec.image = `data/world/map/${name}`;
      const ox = z.origin.x, oz = z.origin.z, W2 = v => +v.toFixed(1);
      for (const p of P) {
        if (p.kind === 'settlement') labels.push({ kind: p.data.hub || p.data.kind === 'town' ? 'town' : p.data.kind === 'village' ? 'village' : 'hamlet', name: p.data.name, x: W2(ox + p.x), z: W2(oz + p.z), zone: z.id, minZoom: p.data.hub ? 0 : 1, ...(p.data.hub ? { hub: true } : {}) });
        else if (p.kind === 'dungeon_door') labels.push({ kind: 'dungeon', name: row?.dungeon?.name || p.data?.name || 'Dungeon', x: W2(ox + p.x), z: W2(oz + p.z), zone: z.id, minZoom: 1, id: p.id });
        else if (p.kind === 'event_site') labels.push({ kind: 'event', name: null, id: p.id, x: W2(ox + p.x), z: W2(oz + p.z), zone: z.id, minZoom: 2, r: p.data.r });
        else if (p.kind === 'camp_site') labels.push({ kind: 'camp', name: null, id: p.id, x: W2(ox + p.x), z: W2(oz + p.z), zone: z.id, minZoom: 2, r: p.data.r });
        else if (p.kind === 'crossing') labels.push({ kind: 'ford', name: p.data.name, x: W2(ox + p.x), z: W2(oz + p.z), zone: z.id, minZoom: 2 });
        else if (p.kind === 'lake' && p.data.name) labels.push({ kind: 'lake', name: p.data.name, x: W2(ox + p.x), z: W2(oz + p.z), zone: z.id, minZoom: 1 });
        else if (p.kind === 'bridge' && !(p.data.part?.[0] > 0)) labels.push({ kind: 'bridge', name: null, x: W2(ox + p.x), z: W2(oz + p.z), zone: z.id, minZoom: 2 });
      }
      for (const r of t.meta.rivers || []) {
        const wr = W.rivers.find(q => q.id === r.id); if (!wr || !r.name) continue;
        // label each named river once per zone, at its point nearest the zone middle
        let best = null, bd = Infinity;
        for (const p of wr.pts) { const x = p[0] - ox, zz = p[1] - oz; if (x < 100 || zz < 100 || x > ZM - 100 || zz > ZM - 100) continue; const d = Math.hypot(x - 1024, zz - 1024); if (d < bd) { bd = d; best = p; } }
        if (best) labels.push({ kind: 'river', name: r.name, x: W2(best[0]), z: W2(best[1]), zone: z.id, minZoom: 1 });
      }
    }
    if (row) labels.push({ kind: 'zone', name: row.name, x: z.origin.x + 1024, z: z.origin.z + 1024, zone: z.id, minZoom: 1, band: row.band || null });
    zones.push(rec);
  }
  const provinces = Object.entries(PMAP).map(([sid, pm]) => {
    const ids = Object.values(pm.map || {}), zs = zones.filter(z => ids.includes(z.id));
    const xs = zs.map(z => z.origin.x), zz = zs.map(z => z.origin.z), bands = zs.map(z => z.band).filter(Boolean);
    const bounds = [Math.min(...xs), Math.min(...zz), Math.max(...xs) + ZM, Math.max(...zz) + ZM];
    const s = sheets[sid];
    labels.push({ kind: 'province', name: s?.name || sid, x: (bounds[0] + bounds[2]) / 2, z: (bounds[1] + bounds[3]) / 2, zone: null, minZoom: 0 });
    return { id: sid, name: s?.name || sid, sheet: `data/provinces/${sid}.json`, band: s?.band || (bands.length ? [Math.min(...bands.map(b => b[0])), Math.max(...bands.map(b => b[1]))] : null), zones: ids, bounds };
  });
  const map = {
    _doc: 'Stream B map bake (tools/bake-map.mjs). WORLD metres (+x east, +z south). Draw world.png at 32 m/px for the world view, zones/<id>.png at 4 m/px (halve for 8 m) for province/zone views, then the vectors and labels on top. labels[].minZoom: 0 world, 1 province, 2 zone. band = stream E level band [lo, hi].',
    version: MAP_VERSION, worldInputHash: W.inputHash,
    world: { image: 'data/world/map/world.png', width: WW, height: WH, mPerPx: step, metres: [WW * step, WH * step] },
    zoneImage: { mPerPx: ZMPP, size: ZPX, zoneMetres: ZM },
    grid: W.grid,
    zones, provinces, labels,
    roads: ROADS.map(r => ({ id: r.id, cls: r.cls, width: r.width, pts: simplify(r.pts, 2) })),
    rivers: RIVERS.map(r => ({ id: r.id, name: r.name, cls: r.cls, pts: simplify(r.pts, 2) })),
  };
  files['map.json'] = JSON.stringify(map) + '\n';
  return { files, map };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const t0 = performance.now();
  const { files } = bakeMap();
  if (process.argv.includes('--check')) {
    const stale = Object.entries(files).filter(([f, v]) => !existsSync(join(OUT, f)) || Buffer.compare(readFileSync(join(OUT, f)), Buffer.from(v)) !== 0).map(([f]) => f);
    console.log(stale.length ? `map is STALE: ${stale.join(', ')}` : 'map is up to date'); process.exit(stale.length ? 1 : 0);
  }
  mkdirSync(join(OUT, 'zones'), { recursive: true });
  let total = 0;
  for (const [f, v] of Object.entries(files)) { writeFileSync(join(OUT, f), v); total += v.length; }
  console.log(`wrote ${Object.keys(files).length} files to ${OUT}: ${(total / 1024).toFixed(0)} KB in ${Math.round(performance.now() - t0)} ms`);
}
