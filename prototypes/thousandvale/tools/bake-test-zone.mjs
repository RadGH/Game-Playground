#!/usr/bin/env node
// Thousandvale — M0 test-zone bake (stream B).
//
// The M0 one-off: ONE 2 × 2 km heightmap made from World Forge, saved as data/zones/test/terrain.bin
// (+ a readable zone.json and a preview.png-free summary). The full world/zone bake tools
// (tools/bake-world.mjs, tools/bake-zone.mjs, PLAN §3.2) are M1 and will replace this — but they keep
// this file format and js/rules/terrain-read.js, so nothing downstream changes.
//
//   node prototypes/thousandvale/tools/bake-test-zone.mjs            # bake with the defaults
//   node prototypes/thousandvale/tools/bake-test-zone.mjs --check    # bake in memory, fail if the file differs
//
// How a zone is made (the same recipe M1 will use per zone):
//   1. World Forge at 288 × 224 (16 macro samples per zone edge, PLAN §3.1). Seed 1000.
//   2. Pick the 16 × 16 macro window that best fits a first test zone: all land, one river, a
//      settlement, some hills, not a mountain wall (scored below). Each macro sample is 128 m.
//   3. Refine onto 1025 × 1025 samples at 2 m: bicubic macro height + seeded noise detail at WORLD
//      coordinates (so a neighbouring zone refined the same way meets this one at the edge).
//   4. Carve the macro rivers as smoothed channels with a water surface that never runs uphill.
//   5. Biome per sample from the macro biome with a warped edge, plus beach/rock/water overrides.
//   6. Write the header (magic, version, size, input hash) + layers. See terrain-read.js for the format.

import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateWorld } from '../../../worldgen/js/world.js';
import { BIOMES } from '../../../worldgen/js/biomes.js';
import { makeNoise2D, fbm, ridged, subSeed, hashStr, clamp, smoothstep } from '../../../worldgen/js/noise.js';
import { FORMAT_MAGIC, FORMAT_VERSION, createTerrain } from '../js/rules/terrain-read.js';
import { addZoneSites } from './lib/zone-sites.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, '..', 'data', 'zones', 'test');
export const BAKE_VERSION = 1;          // the LAYERS recipe (heights, water, biomes) — part of inputHash
export const SITES_VERSION = 2;         // the site list (radius, door, event/camp sites) — not in inputHash, so
                                        // stream E's placements keyed to the terrain hash stay valid

/** Sites other streams ask for by name (docs/requests.md "E -> B"). */
export const SITE_ASKS = [
  { type: 'event', id: 'event_grandmother_skein', nearSite: 'Mawehaven', r: 40 },   // zone event boss arena
  { type: 'camp', id: 'elite_hobb_gallowsby', nearSite: 'Fitockpi Ford', r: 25 },   // the elite's camp by the ford
];
const VIGNETTES = join(HERE, '..', 'data', 'vignettes', 'placements', 'test.json');

export const TEST_ZONE = {
  name: 'Test Vale',
  world: { seed: 1000, width: 288, height: 224, method: 'plates' },
  zoneCells: 16,          // macro samples per zone edge
  macroMetres: 128,       // metres per macro sample (2048 / 16)
  size: 1025,             // fine samples per edge
  step: 2,                // metres per fine sample
  landMetres: 1400,       // World Forge elevation 1.0 → this many metres (0.5 = sea level)
  seaMetres: 160,
  window: null,           // [cx, cy] to force a window; null = pick the best-scoring one
};

const RIVER_WIDTH = [0, 7, 14, 24];   // channel width in metres by World Forge river class
const RIVER_DEPTH = [0, 1.2, 2.0, 3.0];

/** Score a 16×16 window as a first test zone. Higher is better; -Infinity rules it out. */
function scoreWindow(world, cx, cy, n) {
  const w = world.width;
  let water = 0, river = 0, elevSum = 0, elevMin = 1, elevMax = 0, settle = 0, biomes = new Set();
  for (let y = cy; y < cy + n; y++) for (let x = cx; x < cx + n; x++) {
    const i = y * w + x;
    if (world.water[i]) water++;
    if (world.river[i]) river++;
    const e = world.elevation[i]; elevSum += e; elevMin = Math.min(elevMin, e); elevMax = Math.max(elevMax, e);
    biomes.add(world.biome[i]);
  }
  for (const nd of world.nodes) if (nd.x >= cx + 3 && nd.x < cx + n - 3 && nd.y >= cy + 3 && nd.y < cy + n - 3 && (nd.type === 'settlement')) settle++;
  if (water > n * n * 0.04 || river < 6 || settle < 1) return -Infinity;
  const relief = elevMax - elevMin;
  return Math.min(biomes.size, 4) * 2 + Math.min(river, 30) * 0.2 + settle * 2 - Math.abs(relief - 0.12) * 60;
}

function pickWindow(world, n) {
  let best = null, bestScore = -Infinity;
  for (let cy = 2; cy + n + 2 < world.height; cy += 2) for (let cx = 2; cx + n + 2 < world.width; cx += 2) {
    const s = scoreWindow(world, cx, cy, n);
    if (s > bestScore) { bestScore = s; best = [cx, cy]; }
  }
  if (!best) throw new Error('no macro window fits a test zone — change the seed');
  return best;
}

/** Catmull-Rom weights. */
function cr(p0, p1, p2, p3, t) {
  return p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
}

/** Bicubic sample of a macro layer at fractional macro coordinates. */
function bicubic(world, arr, fx, fy) {
  const w = world.width, h = world.height;
  const x1 = Math.floor(fx), y1 = Math.floor(fy), tx = fx - x1, ty = fy - y1;
  const at = (x, y) => arr[clamp(y, 0, h - 1) * w + clamp(x, 0, w - 1)];
  const row = y => cr(at(x1 - 1, y), at(x1, y), at(x1 + 1, y), at(x1 + 2, y), tx);
  return cr(row(y1 - 1), row(y1), row(y1 + 1), row(y1 + 2), ty);
}

/** Distance from p to segment ab, and the 0..1 position along it. */
function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
  const t = clamp(((px - ax) * dx + (pz - az) * dz) / L2, 0, 1);
  return [Math.hypot(px - (ax + dx * t), pz - (az + dz * t)), t];
}

export function bakeTestZone(cfg = TEST_ZONE) {
  const world = generateWorld(cfg.world);
  const n = cfg.zoneCells, M = cfg.macroMetres;
  const [cx, cy] = cfg.window || pickWindow(world, n);
  const size = cfg.size, step = cfg.step, N = size * size;
  const metres = e => (e >= 0.5 ? (e - 0.5) * 2 * cfg.landMetres : (e - 0.5) * 2 * cfg.seaMetres);
  // world-metre origin of this zone: macro sample (cx, cy) sits at (cx * M, cy * M)
  const ox = cx * M, oz = cy * M;

  const seed = subSeed(cfg.world.seed, 'thousandvale-zone-detail');
  const nA = makeNoise2D(subSeed(seed, 'a')), nB = makeNoise2D(subSeed(seed, 'b')), nC = makeNoise2D(subSeed(seed, 'c'));
  const nWarpX = makeNoise2D(subSeed(seed, 'wx')), nWarpZ = makeNoise2D(subSeed(seed, 'wz'));

  // 1. ground: bicubic macro height + detail scaled by the macro slope (flat land stays gentle)
  const ground = new Float32Array(N);
  const macroSlope = new Float32Array(N);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const wx = ox + i * step, wz = oz + j * step;          // WORLD metres — edges agree with neighbours
    const fx = wx / M, fy = wz / M;
    const base = metres(bicubic(world, world.elevation, fx, fy));
    const rel = clamp(bicubic(world, world.slope, fx, fy), 0, 1);
    const hills = (fbm(nA, wx / 420, wz / 420, { octaves: 4 }) - 0.5) * (14 + rel * 90);
    const ridge = ridged(nB, wx / 900, wz / 900, { octaves: 3 }) * rel * 60;
    const fine = (fbm(nC, wx / 38, wz / 38, { octaves: 3 }) - 0.5) * (1.2 + rel * 5);
    ground[j * size + i] = base + hills + ridge + fine;
    macroSlope[j * size + i] = rel;
  }
  const G = (i, j) => ground[clamp(j, 0, size - 1) * size + clamp(i, 0, size - 1)];
  const groundAtWorld = (wx, wz) => G(Math.round((wx - ox) / step), Math.round((wz - oz) / step));

  // 2. sea + lakes from the macro water mask (bilinear mask, threshold 0.5)
  const waterTop = new Float32Array(N).fill(NaN);
  const waterKind = new Uint8Array(N);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const fx = (ox + i * step) / M, fy = (oz + j * step) / M;
    const mi = clamp(Math.round(fy), 0, world.height - 1) * world.width + clamp(Math.round(fx), 0, world.width - 1);
    const k = j * size + i;
    if (world.water[mi] === 1 || ground[k] < 0) { waterTop[k] = 0; waterKind[k] = 1; }
  }
  // lakes: one level per lake, just under its lowest shore sample in this zone
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const fx = (ox + i * step) / M, fy = (oz + j * step) / M;
    const mi = clamp(Math.round(fy), 0, world.height - 1) * world.width + clamp(Math.round(fx), 0, world.width - 1);
    if (world.water[mi] === 2) waterKind[j * size + i] = 2;
  }
  {
    let level = Infinity;
    for (let j = 1; j < size - 1; j++) for (let i = 1; i < size - 1; i++) {
      const k = j * size + i; if (waterKind[k] !== 2) continue;
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (waterKind[k + b * size + a] !== 2) level = Math.min(level, ground[k + b * size + a]);
    }
    if (Number.isFinite(level)) for (let k = 0; k < N; k++) if (waterKind[k] === 2) { waterTop[k] = level - 0.4; ground[k] = Math.min(ground[k], level - 2.5); }
  }

  // 3. rivers: the macro river cells inside (or crossing) the window, as a smoothed polyline
  const riversUsed = [];
  for (const r of world.rivers) {
    const pts = r.cells.map(c => ({ x: (c % world.width) * M, z: Math.floor(c / world.width) * M, cls: world.river[c] || 1 }));
    const inside = pts.some(p => p.x >= ox - M && p.x <= ox + 2048 + M && p.z >= oz - M && p.z <= oz + 2048 + M);
    if (!inside || pts.length < 2) continue;
    // Chaikin smoothing ×3 so a river is a curve, not an 8-direction staircase
    let line = pts;
    for (let pass = 0; pass < 3; pass++) {
      const nl = [line[0]];
      for (let k = 0; k < line.length - 1; k++) {
        const a = line[k], b = line[k + 1];
        nl.push({ x: a.x * 0.75 + b.x * 0.25, z: a.z * 0.75 + b.z * 0.25, cls: a.cls }, { x: a.x * 0.25 + b.x * 0.75, z: a.z * 0.25 + b.z * 0.75, cls: b.cls });
      }
      nl.push(line[line.length - 1]); line = nl;
    }
    // meander: push each point sideways with low-frequency noise
    for (const p of line) { p.x += (fbm(nWarpX, p.x / 300, p.z / 300, { octaves: 2 }) - 0.5) * 50; p.z += (fbm(nWarpZ, p.x / 300, p.z / 300, { octaves: 2 }) - 0.5) * 50; }
    // surface: running minimum of the ground along the line, so water never runs uphill
    let run = Infinity;
    for (const p of line) {
      const g = groundAtWorld(p.x, p.z);
      run = Math.min(run, g - 0.8);
      p.surface = run;
    }
    riversUsed.push({ id: r.id, name: r.name, line });
  }
  for (const r of riversUsed) {
    const line = r.line;
    // only test segments near the window
    const segs = [];
    for (let k = 0; k < line.length - 1; k++) {
      const a = line[k], b = line[k + 1];
      if (Math.max(a.x, b.x) < ox - 60 || Math.min(a.x, b.x) > ox + 2108 || Math.max(a.z, b.z) < oz - 60 || Math.min(a.z, b.z) > oz + 2108) continue;
      segs.push(k);
    }
    if (!segs.length) continue;
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
      const wx = ox + i * step, wz = oz + j * step;
      let best = Infinity, bk = -1, bt = 0;
      for (const k of segs) {
        const a = line[k], b = line[k + 1];
        if (wx < Math.min(a.x, b.x) - 60 || wx > Math.max(a.x, b.x) + 60 || wz < Math.min(a.z, b.z) - 60 || wz > Math.max(a.z, b.z) + 60) continue;
        const [d, t] = segDist(wx, wz, a.x, a.z, b.x, b.z);
        if (d < best) { best = d; bk = k; bt = t; }
      }
      if (bk < 0) continue;
      const a = line[bk], b = line[bk + 1];
      const cls = Math.max(a.cls, b.cls);
      const half = RIVER_WIDTH[cls] / 2, bank = 10 + cls * 6;
      if (best > half + bank) continue;
      const surface = a.surface + (b.surface - a.surface) * bt;
      const k = j * size + i;
      if (best <= half) {
        const depth = RIVER_DEPTH[cls] * (1 - (best / half) ** 2) + 0.3;
        ground[k] = Math.min(ground[k], surface - depth);
        if (!(waterTop[k] >= surface)) { waterTop[k] = surface; waterKind[k] = waterKind[k] === 1 ? 1 : 3; }
      } else {
        // bank: ease from just above the water up to the natural ground
        const t = smoothstep(0, 1, (best - half) / bank);
        const lip = surface + 0.25;
        const target = Math.max(lip, ground[k]);
        ground[k] = Math.min(ground[k], lip + (target - lip) * t);
        if (ground[k] < lip && t < 0.05) ground[k] = lip;
      }
    }
  }
  // a wet sample needs a wet neighbour or two, else the water sheet is a single speck — and one
  // dry ring outside every wet edge keeps a waterTop so the sheet reaches the bank (drawn = measured)
  for (let pass = 0; pass < 1; pass++) {
    const copy = waterTop.slice();
    for (let j = 1; j < size - 1; j++) for (let i = 1; i < size - 1; i++) {
      const k = j * size + i;
      if (!Number.isNaN(copy[k])) continue;
      let s = 0, c = 0, kind = 0;
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const v = copy[k + b * size + a]; if (!Number.isNaN(v)) { s += v; c++; kind = waterKind[k + b * size + a]; } }
      if (c) { waterTop[k] = s / c; waterKind[k] = kind; }
    }
  }

  // 4. biome: macro biome at a noise-warped position (so borders wander), then local overrides
  const biome = new Uint8Array(N);
  const id = key => BIOMES.find(b => b.key === key).id;
  const BEACH = id('beach'), MOUNTAINS = id('mountains'), LAKE = id('lake'), COAST = id('coast');
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const wx = ox + i * step, wz = oz + j * step;
    const fx = (wx + (fbm(nWarpX, wx / 260, wz / 260, { octaves: 3 }) - 0.5) * 220) / M;
    const fy = (wz + (fbm(nWarpZ, wx / 260, wz / 260, { octaves: 3 }) - 0.5) * 220) / M;
    const mi = clamp(Math.round(fy), 0, world.height - 1) * world.width + clamp(Math.round(fx), 0, world.width - 1);
    const k = j * size + i;
    let b = world.biome[mi];
    if (waterKind[k] && !Number.isNaN(waterTop[k]) && waterTop[k] > ground[k]) b = waterKind[k] === 1 ? COAST : LAKE;
    else if (b < 4 || b === 25) b = BEACH;                     // macro water that the refine left dry
    biome[k] = b;
  }
  // rock on steep ground (needs the final ground, so a second pass)
  for (let j = 1; j < size - 1; j++) for (let i = 1; i < size - 1; i++) {
    const k = j * size + i;
    const s = Math.hypot(G(i + 1, j) - G(i - 1, j), G(i, j + 1) - G(i, j - 1)) / (2 * step);
    if (s > 0.9 && biome[k] >= 4 && biome[k] !== 18) biome[k] = MOUNTAINS;
  }

  // 5. quantise
  let hMin = Infinity, hMax = -Infinity;
  for (let k = 0; k < N; k++) { hMin = Math.min(hMin, ground[k]); hMax = Math.max(hMax, ground[k]); if (!Number.isNaN(waterTop[k])) hMax = Math.max(hMax, waterTop[k]); }
  hMin = Math.floor(hMin - 1); hMax = Math.ceil(hMax + 1);
  const q = v => clamp(Math.round((v - hMin) / (hMax - hMin) * 65535), 1, 65535);   // 0 reserved for "dry" in waterTop
  const height = new Uint16Array(N), wTop = new Uint16Array(N);
  for (let k = 0; k < N; k++) { height[k] = q(ground[k]); wTop[k] = Number.isNaN(waterTop[k]) ? 0 : q(waterTop[k]); if (!wTop[k]) waterKind[k] = 0; }

  // sites: World Forge nodes inside the window, in zone metres; spawn = flattest dry spot near the first settlement
  const sites = world.nodes
    .filter(nd => nd.x >= cx && nd.x < cx + n && nd.y >= cy && nd.y < cy + n)
    .map(nd => ({ type: nd.type, kind: nd.kind, name: nd.name, x: (nd.x + 0.5) * M - ox, z: (nd.y + 0.5) * M - oz }));
  const meta = {
    name: cfg.name,
    size, step, origin: { x: 0, z: 0 },
    heightMin: hMin, heightMax: hMax,
    bakeVersion: BAKE_VERSION,
    inputHash: null,
    biomes: BIOMES.map(b => [b.key, b.name, b.color]),
    waterKinds: ['none', 'sea', 'lake', 'river'],
    source: { tool: 'tools/bake-test-zone.mjs', world: cfg.world, macroWindow: [cx, cy], zoneCells: n, macroMetres: M, worldOrigin: { x: ox, z: oz }, landMetres: cfg.landMetres, seaMetres: cfg.seaMetres },
    rivers: riversUsed.map(r => ({ id: r.id, name: r.name })),
    sites,
    spawn: null,
  };
  meta.inputHash = (hashStr(JSON.stringify({ cfg, BAKE_VERSION, FORMAT_VERSION })) >>> 0).toString(16).padStart(8, '0');
  const terrain = createTerrain({ meta, height, waterTop: wTop, waterKind, biome });
  // stream E's vignettes stay clear of every new site (they were placed first, against this same terrain)
  let avoid = [];
  try { avoid = JSON.parse(readFileSync(VIGNETTES, 'utf8')).placements.map(p => ({ x: p.x, z: p.z, r: p.radius || 12 })); } catch { /* none yet */ }
  addZoneSites(terrain, meta.sites, { asks: cfg.asks || SITE_ASKS, avoid, doorName: 'Barrow entrance' });
  meta.sitesVersion = SITES_VERSION;
  meta.spawn = findSpawn(terrain, sites.find(s => s.type === 'settlement') || { x: 1024, z: 1024 });
  return { meta, height, waterTop: wTop, waterKind, biome, terrain, world };
}

/** The flattest dry walkable point within 120 m of a target, on a 4 m search grid. */
function findSpawn(t, target) {
  let best = null, bestS = Infinity;
  for (let dz = -120; dz <= 120; dz += 4) for (let dx = -120; dx <= 120; dx += 4) {
    const x = target.x + dx, z = target.z + dz;
    if (!t.inBounds(x, z) || t.waterAt(x, z).kind !== 'none') continue;
    let s = 0; for (const [a, b] of [[0, 0], [6, 0], [-6, 0], [0, 6], [0, -6]]) s += t.slopeAt(x + a, z + b);
    s += Math.hypot(dx, dz) * 0.02;
    if (s < bestS) { bestS = s; best = { x, z }; }
  }
  return best || { x: target.x, z: target.z };
}

/** Serialise to the terrain.bin format (see terrain-read.js). */
export function encodeTerrain({ meta, height, waterTop, waterKind, biome }) {
  const json = new TextEncoder().encode(JSON.stringify(meta));
  const N = meta.size * meta.size;
  let off = 12 + json.length; off = (off + 3) & ~3;
  const total = off + N * 2 * 2 + N * 2;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  for (let k = 0; k < 4; k++) out[k] = FORMAT_MAGIC.charCodeAt(k);
  dv.setUint32(4, FORMAT_VERSION, true);
  dv.setUint32(8, json.length, true);
  out.set(json, 12);
  for (let k = 0; k < N; k++) dv.setUint16(off + k * 2, height[k], true);
  off += N * 2;
  for (let k = 0; k < N; k++) dv.setUint16(off + k * 2, waterTop[k], true);
  off += N * 2;
  out.set(waterKind, off); off += N;
  out.set(biome, off);
  return out;
}

function summary(b) {
  const t = b.terrain; const N = b.meta.size ** 2;
  let wet = 0, steep = 0, slopes = [];
  for (let j = 0; j < b.meta.size; j += 8) for (let i = 0; i < b.meta.size; i += 8) {
    const x = i * b.meta.step + 0.7, z = j * b.meta.step + 0.3;
    const s = t.slopeAt(x, z); slopes.push(s); if (s > 46) steep++;
    if (t.waterAt(x, z).kind !== 'none') wet++;
  }
  slopes.sort((a, c) => a - c);
  const counts = {};
  for (let k = 0; k < N; k++) counts[t.biomes[b.biome[k]].key] = (counts[t.biomes[b.biome[k]].key] || 0) + 1;
  return {
    window: b.meta.source.macroWindow, heights: [b.meta.heightMin, b.meta.heightMax],
    slope: { median: +slopes[slopes.length >> 1].toFixed(1), p95: +slopes[Math.floor(slopes.length * 0.95)].toFixed(1), max: +slopes[slopes.length - 1].toFixed(1), unwalkableShare: +(steep / slopes.length).toFixed(3) },
    wetShare: +(wet / slopes.length).toFixed(3),
    biomes: Object.fromEntries(Object.entries(counts).sort((a, c) => c[1] - a[1]).map(([k, v]) => [k, +(v / N).toFixed(3)])),
    rivers: b.meta.rivers.length, sites: b.meta.sites.map(s => [s.type, s.kind || s.id, s.name || '', s.x, s.z, s.radius ?? s.r ?? '', s.yaw ?? ''].join(' ')), spawn: b.meta.spawn, inputHash: b.meta.inputHash,
  };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const t0 = performance.now();
  const b = bakeTestZone();
  const bytes = encodeTerrain(b);
  const file = join(OUT_DIR, 'terrain.bin');
  if (process.argv.includes('--check')) {
    const same = existsSync(file) && Buffer.compare(readFileSync(file), Buffer.from(bytes)) === 0;
    console.log(same ? 'terrain.bin is up to date' : 'terrain.bin is STALE — re-run without --check');
    process.exit(same ? 0 : 1);
  }
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(file, bytes);
  const info = summary(b);
  writeFileSync(join(OUT_DIR, 'zone.json'), JSON.stringify({ ...b.meta, biomes: undefined, summary: info, file: 'terrain.bin', bytes: bytes.length }, null, 2) + '\n');
  console.log(JSON.stringify(info, null, 2));
  console.log(`wrote ${file} (${(bytes.length / 1048576).toFixed(2)} MB) in ${Math.round(performance.now() - t0)} ms`);
}
