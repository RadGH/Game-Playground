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

const HERE = dirname(fileURLToPath(import.meta.url));
export const OUT_DIR = join(HERE, '..', 'data', 'world');

export function bakeWorld(cfg = WORLD) {
  const w = generateWorld({ seed: cfg.seed, width: cfg.width, height: cfg.height, method: cfg.method });
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
    return { id: r.id, name: r.name, bbox, pts: line.map(p => [p.x, p.z, p.s, p.cls]) };
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
  const nodes = w.nodes.map(n => ({ id: n.id, type: n.type, kind: n.kind, name: n.name, size: n.size, x: (n.x + 0.5) * M, z: (n.y + 0.5) * M, zone: zoneId(Math.floor(n.x / Z), Math.floor(n.y / Z)) }));
  const zones = [];
  for (let zy = 0; zy < rows; zy++) for (let zx = 0; zx < cols; zx++) {
    let land = 0, riverCells = 0; const mix = {};
    for (let y = zy * Z; y < zy * Z + Z; y++) for (let x = zx * Z; x < zx * Z + Z; x++) {
      const i = y * W + x; if (!w.water[i]) land++; if (w.river[i]) riverCells++;
      const k = BIOMES[w.biome[i]].key; mix[k] = (mix[k] || 0) + 1;
    }
    const id = zoneId(zx, zy);
    zones.push({
      id, zx, zy, origin: { x: zx * Z * M, z: zy * Z * M }, land: +(land / (Z * Z)).toFixed(3), riverCells,
      biomes: Object.fromEntries(Object.entries(mix).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => [k, +(v / (Z * Z)).toFixed(2)])),
      settlements: nodes.filter(n => n.zone === id && n.type === 'settlement').map(n => n.name),
    });
  }
  const roads = (w.roads || []).map(r => ({ id: r.id, class: r.class, from: r.from, to: r.to, pts: r.cells.map(c => { const p = cellXZ(c); return [p.x + M / 2, p.z + M / 2]; }) }));
  const json = {
    _doc: 'Thousandvale world bake (tools/bake-world.mjs). World metres: +x east, +z south; macro sample (i,j) at (i*128, j*128). Zone (zx,zy) covers x in [zx*2048, zx*2048+2048]. Rivers: pts [x, z, surface, class]. macro.bin holds the layers.',
    ...meta, grid: { cols, rows, zoneMetres: Z * M },
    inputHash: (hashStr(JSON.stringify({ cfg, WORLD_BAKE_VERSION })) >>> 0).toString(16).padStart(8, '0'),
    stats: { landZones: zones.filter(z => z.land > 0.5).length, zones: zones.length, rivers: rivers.length, lakes: lakes.length, settlements: nodes.filter(n => n.type === 'settlement').length },
    zones, nodes, rivers, lakes: lakes.map(l => ({ id: l.id, level: l.level, cells: l.cells })), roads,
  };
  return { json, macroBytes: encodeMacro(macro, meta), macro };
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
