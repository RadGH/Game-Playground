#!/usr/bin/env node
// Thousandvale — WORLD bake v1 (stream B, PLAN §3.2.1).
//
//   node prototypes/thousandvale/tools/bake-world.mjs           # writes data/world/{world.json, macro.bin}
//   node prototypes/thousandvale/tools/bake-world.mjs --check   # fail if the files are stale
//
// World Forge at 288 × 224 (16 macro samples per 2,048 m zone edge → an 18 × 14 grid of zones), then
// everything a zone bake needs that must NOT depend on which zone is being baked:
//   - rivers as smoothed, meandering polylines in world metres, each point carrying its water SURFACE
//     (a running minimum of the base ground downstream — water never runs uphill, and both zones a
//     river crosses read the same surface)
//   - lakes with one level each (just under the lowest base ground on the lake's shore)
//   - settlements, landmarks, dungeons, passes, roads in world metres; a per-zone summary
// The zone bake (tools/bake-zone.mjs) reads these two files and never runs World Forge itself.

import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateWorld } from '../../../worldgen/js/world.js';
import { BIOMES } from '../../../worldgen/js/biomes.js';
import { hashStr } from '../../../worldgen/js/noise.js';
import { WORLD, WORLD_BAKE_VERSION, encodeMacro, makeRefiner } from './lib/world-core.mjs';

/**
 * Player-facing names may not carry banned words (playground CLAUDE.md conv. 9 + PLAN §16: "ember", "veil",
 * "muster", WoW/Skyrim terms). World Forge's namer knows none of that, so the bake swaps a banned word for an
 * original one, keeping the rest of the name. The banned-names test (stream G/E) runs over world.json.
 */
export const NAME_SWAPS = [[/ember/gi, 'Cinder'], [/veil/gi, 'Shroud'], [/muster/gi, 'Gather'], [/horde/gi, 'Throng'], [/alliance/gi, 'Accord'],
  [/delve/gi, 'Burrow'], [/hearthstone/gi, 'Homestone'], [/keystone/gi, 'Capstone'], [/renown/gi, 'Repute'], [/fel(?=[a-z])/gi, 'Fal']];
export function cleanName(name) {
  if (!name) return name;
  let out = String(name);
  for (const [re, to] of NAME_SWAPS) out = out.replace(re, m => (m[0] === m[0].toUpperCase() ? to : to.toLowerCase()));
  return out;
}

/**
 * The starter province's hub (PLAN §5.1). World Forge names places at random, so the bake renames the
 * chosen settlement to Torborhold — the name every earlier doc, test and quest uses.
 */
export const STARTER = { zone: 'z12_02', settlementId: null, name: 'Torborhold' };   // Petbeck Basin (danger 0.167, 30 zones, grassland), E's Torbor Downs block x11-14 y1-4 at E's start cell [1,1]; its biggest settlement becomes Torborhold

const HERE = dirname(fileURLToPath(import.meta.url));
export const OUT_DIR = join(HERE, '..', 'data', 'world');

export function bakeWorld(cfg = WORLD) {
  const w = generateWorld({ seed: cfg.seed, width: cfg.width, height: cfg.height, method: cfg.method, seaLevel: cfg.seaLevel, regionCount: cfg.regionCount });
  const M = cfg.macroMetres, W = w.width, H = w.height;
  const meta = { ...cfg, width: W, height: H, bakeVersion: WORLD_BAKE_VERSION };
  const macro = { ...meta, elevation: w.elevation, slope: w.slope, water: w.water, river: w.river, biome: w.biome };
  const ref = makeRefiner(macro);
  const cellXZ = c => ({ x: (c % W) * M, z: Math.floor(c / W) * M });

  // rivers: smooth + meander + surfaces, in world metres
  const rivers = w.rivers.map(r => {
    let line = r.cells.map(c => ({ ...cellXZ(c), cls: w.river[c] || 1 }));
    for (let pass = 0; pass < 3; pass++) {
      const nl = [line[0]];
      for (let k = 0; k < line.length - 1; k++) {
        const a = line[k], b = line[k + 1];
        nl.push({ x: a.x * 0.75 + b.x * 0.25, z: a.z * 0.75 + b.z * 0.25, cls: a.cls }, { x: a.x * 0.25 + b.x * 0.75, z: a.z * 0.25 + b.z * 0.75, cls: b.cls });
      }
      nl.push(line[line.length - 1]); line = nl;
    }
    for (const p of line) { const [dx, dz] = ref.meander(p.x, p.z); p.x += dx; p.z += dz; }
    let run = Infinity;
    for (const p of line) { run = Math.min(run, ref.baseGround(p.x, p.z) - 0.8); p.s = +run.toFixed(3); p.x = +p.x.toFixed(2); p.z = +p.z.toFixed(2); }
    const bbox = [Math.min(...line.map(p => p.x)), Math.min(...line.map(p => p.z)), Math.max(...line.map(p => p.x)), Math.max(...line.map(p => p.z))];
    return { id: r.id, name: cleanName(r.name), bbox, pts: line.map(p => [p.x, p.z, p.s, p.cls]) };
  });

  // lakes: connected macro water==2 components, one level each
  const lakeOf = new Int32Array(W * H).fill(-1);
  const lakes = [];
  for (let i = 0; i < W * H; i++) {
    if (w.water[i] !== 2 || lakeOf[i] >= 0) continue;
    const id = lakes.length, cells = [], stack = [i]; lakeOf[i] = id;
    while (stack.length) {
      const c = stack.pop(); cells.push(c);
      const x = c % W, y = (c / W) | 0;
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + a, ny = y + b; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx; if (w.water[n] === 2 && lakeOf[n] < 0) { lakeOf[n] = id; stack.push(n); }
      }
    }
    // shore: base ground half a cell outside every edge between lake and land
    let level = Infinity;
    for (const c of cells) {
      const x = c % W, y = (c / W) | 0;
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + a, ny = y + b; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (w.water[ny * W + nx] === 0) level = Math.min(level, ref.baseGround((x + a * 0.75) * M, (y + b * 0.75) * M));
      }
    }
    lakes.push({ id, cells, level: Number.isFinite(level) ? +(level - 0.4).toFixed(3) : 0 });
  }

  // zones: the 18 × 14 grid
  const Z = cfg.zoneCells, cols = Math.floor(W / Z), rows = Math.floor(H / Z);
  const nodes = w.nodes.map(n => ({ id: n.id, type: n.type, kind: n.kind, name: cleanName(n.name), size: n.size, region: n.region ?? -1, x: (n.x + 0.5) * M, z: (n.y + 0.5) * M, zone: zoneId(Math.floor(n.x / Z), Math.floor(n.y / Z)) }));
  const zones = [];
  for (let zy = 0; zy < rows; zy++) for (let zx = 0; zx < cols; zx++) {
    let land = 0, riverCells = 0; const mix = {};
    for (let y = zy * Z; y < zy * Z + Z; y++) for (let x = zx * Z; x < zx * Z + Z; x++) {
      const i = y * W + x; if (!w.water[i]) land++; if (w.river[i]) riverCells++;
      const k = BIOMES[w.biome[i]].key; mix[k] = (mix[k] || 0) + 1;
    }
    const id = zoneId(zx, zy);
    const regCount = new Map();
    for (let y = zy * Z; y < zy * Z + Z; y++) for (let x = zx * Z; x < zx * Z + Z; x++) { const r = w.region[y * W + x]; if (r >= 0) regCount.set(r, (regCount.get(r) || 0) + 1); }
    const province = [...regCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? -1;
    zones.push({
      id, zx, zy, province, origin: { x: zx * Z * M, z: zy * Z * M }, land: +(land / (Z * Z)).toFixed(3), riverCells,
      biomes: Object.fromEntries(Object.entries(mix).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => [k, +(v / (Z * Z)).toFixed(2)])),
      settlements: nodes.filter(n => n.zone === id && n.type === 'settlement').map(n => n.name),
    });
  }
  const provinces = w.regions.map(r => ({ id: r.id, name: cleanName(r.name), biome: r.biomeName, danger: +(r.danger ?? 0).toFixed(3), race: r.race || null, zones: zones.filter(z => z.province === r.id && z.land > 0.5).map(z => z.id) }));
  // the starter hub: rename the chosen settlement (the biggest one in the starter zone unless pinned)
  const starterZone = zones.find(z => z.id === STARTER.zone);
  if (starterZone) {
    const rank = { capital: 0, city: 1, town: 2, village: 3, hamlet: 4 };
    const pick = STARTER.settlementId != null ? nodes.find(n => n.id === STARTER.settlementId)
      : nodes.filter(n => n.zone === STARTER.zone && n.type === 'settlement').sort((a, b) => (rank[a.kind] ?? 9) - (rank[b.kind] ?? 9))[0];
    if (pick) { pick.originalName = pick.name; pick.name = STARTER.name; pick.starter = true; }
    starterZone.starter = true;
  }
  for (const z of zones) z.settlements = nodes.filter(n => n.zone === z.id && n.type === 'settlement').map(n => n.name);
  // roads: macro cell paths → smoothed polylines densified to ~16 m, each point with a graded height
  // (the base ground averaged ±48 m along the road, so a road rolls with the land but irons out the
  // bumps) — world metres, zone-independent, so a road meets itself across every zone edge
  const roads = (w.roads || []).map(r => {
    let line = r.cells.map(c => { const p = cellXZ(c); return [p.x + M / 2, p.z + M / 2]; });
    for (let pass = 0; pass < 3; pass++) {
      const nl = [line[0]];
      for (let k = 0; k < line.length - 1; k++) { const a = line[k], b = line[k + 1]; nl.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); }
      nl.push(line[line.length - 1]); line = nl;
    }
    const dense = [line[0]];
    for (let k = 1; k < line.length; k++) {
      const a = dense[dense.length - 1], b = line[k], d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.max(1, Math.round(d / 16));
      for (let q = 1; q <= n; q++) dense.push([a[0] + (b[0] - a[0]) * q / n, a[1] + (b[1] - a[1]) * q / n]);
    }
    const g = dense.map(([x, z]) => ref.baseGround(x, z));
    const pts = dense.map(([x, z], k) => {
      let sum = 0, n = 0; for (let q = Math.max(0, k - 3); q <= Math.min(dense.length - 1, k + 3); q++) { sum += g[q]; n++; }
      return [+x.toFixed(2), +z.toFixed(2), +(sum / n).toFixed(3)];
    });
    const xs = pts.map(p => p[0]), zs = pts.map(p => p[1]);
    return { id: r.id, class: r.class, width: ROAD_WIDTH[r.class] || 4, from: r.from, to: r.to, bbox: [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)], pts };
  });
  // bridges: where a road crosses a river (segment intersection), facing along the road
  const bridges = [];
  for (const rd of roads) for (const rv of rivers) {
    if (rd.bbox[2] < rv.bbox[0] || rd.bbox[0] > rv.bbox[2] || rd.bbox[3] < rv.bbox[1] || rd.bbox[1] > rv.bbox[3]) continue;
    for (let i = 0; i < rd.pts.length - 1; i++) for (let j = 0; j < rv.pts.length - 1; j++) {
      const hit = segX(rd.pts[i], rd.pts[i + 1], rv.pts[j], rv.pts[j + 1]);
      if (!hit) continue;
      const a = rd.pts[i], b = rd.pts[i + 1], cls = Math.max(rv.pts[j][3], rv.pts[j + 1][3]);
      bridges.push({ road: rd.id, river: rv.id, x: +hit[0].toFixed(2), z: +hit[1].toFixed(2), yaw: +Math.atan2(b[0] - a[0], b[1] - a[1]).toFixed(4), span: RIVER_SPAN[cls] || 10, deck: +(Math.max(a[2], b[2], rv.pts[j][2] + 1.6)).toFixed(3) });
    }
  }
  const json = {
    _doc: 'Thousandvale world bake (tools/bake-world.mjs). World metres: +x east, +z south; macro sample (i,j) at (i*128, j*128). Zone (zx,zy) covers x in [zx*2048, zx*2048+2048]. Rivers: pts [x, z, surface, class]. Roads: pts [x, z, gradedHeight], width by class. Bridges: road x river crossings {x, z, yaw (along the road), span, deck}. macro.bin holds the layers.',
    ...meta, grid: { cols, rows, zoneMetres: Z * M },
    inputHash: (hashStr(JSON.stringify({ cfg, WORLD_BAKE_VERSION })) >>> 0).toString(16).padStart(8, '0'),
    starter: { zone: STARTER.zone, hub: STARTER.name, province: starterZone?.province ?? null },
    stats: { roads: roads.length, bridges: bridges.length, landZones: zones.filter(z => z.land > 0.5).length, provinces: provinces.length, zones: zones.length, rivers: rivers.length, lakes: lakes.length, settlements: nodes.filter(n => n.type === 'settlement').length },
    provinces, zones, nodes, rivers, lakes: lakes.map(l => ({ id: l.id, level: l.level, cells: l.cells })), roads, bridges,
  };
  return { json, macroBytes: encodeMacro(macro, meta), macro };
}

export const ROAD_WIDTH = { highway: 8, road: 6, trail: 3.5 };
const RIVER_SPAN = [0, 12, 20, 32];
function segX(p1, p2, p3, p4) {
  const d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0]);
  if (Math.abs(d) < 1e-9) return null;
  const t = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d;
  const u = ((p3[0] - p1[0]) * (p2[1] - p1[1]) - (p3[1] - p1[1]) * (p2[0] - p1[0])) / d;
  return t >= 0 && t < 1 && u >= 0 && u < 1 ? [p1[0] + (p2[0] - p1[0]) * t, p1[1] + (p2[1] - p1[1]) * t] : null;
}

export function zoneId(zx, zy) { return `z${String(zx).padStart(2, '0')}_${String(zy).padStart(2, '0')}`; }

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const t0 = performance.now();
  const { json, macroBytes } = bakeWorld();
  const text = JSON.stringify(json) + '\n';
  const fj = join(OUT_DIR, 'world.json'), fm = join(OUT_DIR, 'macro.bin');
  if (process.argv.includes('--check')) {
    const same = existsSync(fj) && existsSync(fm) && readFileSync(fj, 'utf8') === text && Buffer.compare(readFileSync(fm), Buffer.from(macroBytes)) === 0;
    console.log(same ? 'world bake is up to date' : 'world bake is STALE'); process.exit(same ? 0 : 1);
  }
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(fj, text); writeFileSync(fm, macroBytes);
  console.log(JSON.stringify(json.stats), `world.json ${(text.length / 1024).toFixed(0)} KB, macro.bin ${(macroBytes.length / 1024).toFixed(0)} KB, ${Math.round(performance.now() - t0)} ms`);
}
