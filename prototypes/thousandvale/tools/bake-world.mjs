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
import { WORLD, WORLD_BAKE_VERSION, encodeMacro, makeRefiner, crossingsOf, bridgeFor } from './lib/world-core.mjs';

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
  // link trails (play-test 1 P19 / E's ask): every settlement on a province sheet that the World Forge road net does not
  // reach — stream E's added towns and hamlets (data/provinces/<sheet>-places.json `asks`) — gets a trail to the nearest
  // road (or an already linked settlement), routed over the macro grid (slope cost; sea and lakes are walls; rivers are
  // crossed and bridged like any road). World-level, so a trail crosses zone edges and both zones grade it the same.
  roads.push(...linkTrails({ w, M, W, H, ref, roads, zoneCells: cfg.zoneCells }));
  // bridges: every place a road's line runs through river water (crossingsOf walks the road at 1 m), one flat deck
  // each from bank to bank (bridgeFor); the zone bake grades the road to the deck at both ends
  const bridges = [];
  for (const rd of roads) for (const c of crossingsOf(rd.pts, rivers)) {
    const b = bridgeFor(rd.pts, c, rd.width);
    // two roads sharing one line (a highway and a trail on the same cells) get one bridge, the wider road's
    const twin = bridges.find(o => Math.hypot(o.x - b.x, o.z - b.z) < 14);
    if (twin) { (twin.alsoRoads ||= []).push(rd.id); continue; }
    bridges.push({ road: rd.id, ...b });
  }
  // bridges whose approaches overlap share one deck height (the highest), so their ramps agree where they meet
  for (let pass = 0; pass < 4; pass++) for (const p of bridges) for (const q of bridges) {
    if (p === q || p.deck === q.deck) continue;
    const gap = Math.min(...[p.a, p.b].flatMap(e => [q.a, q.b].map(f => Math.hypot(e[0] - f[0], e[1] - f[1]))));
    if (gap < p.ramp + q.ramp + 10) { const h = Math.max(p.deck, q.deck); p.deck = h; q.deck = h; }
  }
  const json = {
    _doc: 'Thousandvale world bake (tools/bake-world.mjs). World metres: +x east, +z south; macro sample (i,j) at (i*128, j*128). Zone (zx,zy) covers x in [zx*2048, zx*2048+2048]. Rivers: pts [x, z, surface, class]. Roads: pts [x, z, gradedHeight], width by class; link trails (id link_<name>, link: true) join stream E added settlements to the net. Bridges: road x river crossings {road, x, z (middle), yaw (a->b, along the road), span (|ab|), deck (flat deck height), width, a, b (abutments, [x, z]), s0, s1 (arc metres along the road), river, cls, surface, ramp (metres of graded approach each side), alsoRoads}. macro.bin holds the layers.',
    ...meta, grid: { cols, rows, zoneMetres: Z * M },
    inputHash: (hashStr(JSON.stringify({ cfg, WORLD_BAKE_VERSION })) >>> 0).toString(16).padStart(8, '0'),
    starter: { zone: STARTER.zone, hub: STARTER.name, province: starterZone?.province ?? null },
    stats: { roads: roads.length, bridges: bridges.length, landZones: zones.filter(z => z.land > 0.5).length, provinces: provinces.length, zones: zones.length, rivers: rivers.length, lakes: lakes.length, settlements: nodes.filter(n => n.type === 'settlement').length },
    provinces, zones, nodes, rivers, lakes: lakes.map(l => ({ id: l.id, level: l.level, cells: l.cells })), roads, bridges,
  };
  return { json, macroBytes: encodeMacro(macro, meta), macro };
}

export const ROAD_WIDTH = { highway: 8, road: 6, trail: 3.5 };
/** Trails from unlinked sheet settlements to the road net (see bakeWorld). Returns road records (class 'trail'). */
function linkTrails({ w, M, W, H, ref, roads, zoneCells }) {
  let pmap = {}; try { pmap = JSON.parse(readFileSync(join(OUT_DIR, 'province-map.json'), 'utf8')).provinces || {}; } catch { return []; }
  const wants = [];
  for (const [sid, pm] of Object.entries(pmap)) {
    let places = null; try { places = JSON.parse(readFileSync(join(OUT_DIR, '..', 'provinces', `${sid}-places.json`), 'utf8')).zones || {}; } catch { continue; }
    for (const [ez, zid] of Object.entries(pm.map || {})) {
      const zx = +zid.slice(1, 3), zy = +zid.slice(4, 6), ox = zx * zoneCells * M, oz = zy * zoneCells * M;
      for (const a of places[ez]?.asks || []) wants.push({ name: a.name, x: ox + a.x, z: oz + a.z, r: a.r || 40 });
    }
  }
  if (!wants.length) return [];
  const N = W * H, roadCell = new Uint8Array(N), roadPt = new Map();
  const cellOf = (x, z) => clamp(Math.floor(z / M), 0, H - 1) * W + clamp(Math.floor(x / M), 0, W - 1);
  for (const r of roads) for (const p of r.pts) { const c = cellOf(p[0], p[1]); roadCell[c] = 1; if (!roadPt.has(c)) roadPt.set(c, p); }
  const near = (x, z) => { let d = Infinity; for (const r of roads) { if (r.bbox[0] - 400 > x || r.bbox[2] + 400 < x || r.bbox[1] - 400 > z || r.bbox[3] + 400 < z) continue; for (const p of r.pts) d = Math.min(d, Math.hypot(p[0] - x, p[1] - z)); } return d; };
  const cost = c => (w.water[c] ? Infinity : 1 + w.slope[c] * 40);
  const out = [];
  wants.sort((a, b) => a.name.localeCompare(b.name));
  for (const s of wants) {
    if (near(s.x, s.z) <= s.r + 60) continue;
    // Dijkstra over macro cells to the nearest road cell
    const start = cellOf(s.x, s.z), dist = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), open = [[0, start]];
    dist[start] = 0; let goal = -1;
    while (open.length) {
      let bi = 0; for (let q = 1; q < open.length; q++) if (open[q][0] < open[bi][0]) bi = q;
      const [d, c] = open.splice(bi, 1)[0]; if (d > dist[c]) continue;
      if (roadCell[c] && c !== start) { goal = c; break; }
      if (d > 400) break;                                             // far too far over hard ground: give up
      const x = c % W, y = (c / W) | 0;
      for (const [dx, dy, m] of [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.41], [1, -1, 1.41], [-1, 1, 1.41], [-1, -1, 1.41]]) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx, k = cost(n); if (!(k < Infinity)) continue;
        const nd = d + (k + cost(c)) * 0.5 * m; if (nd < dist[n]) { dist[n] = nd; from[n] = c; open.push([nd, n]); }
      }
    }
    if (goal < 0) continue;
    const cells = []; for (let c = goal; c >= 0; c = from[c]) cells.push(c); cells.reverse();
    const end = roadPt.get(goal);
    let line = [[s.x, s.z], ...cells.slice(1, -1).map(c => [(c % W + 0.5) * M, (((c / W) | 0) + 0.5) * M]), [end[0], end[1]]];
    for (let pass = 0; pass < 3; pass++) {
      const nl = [line[0]];
      for (let k = 0; k < line.length - 1; k++) { const a = line[k], b = line[k + 1]; nl.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); }
      nl.push(line[line.length - 1]); line = nl;
    }
    const dense = [line[0]];
    for (let k = 1; k < line.length; k++) {
      const a = dense[dense.length - 1], b = line[k], d = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(d / 16));
      for (let q = 1; q <= n; q++) dense.push([a[0] + (b[0] - a[0]) * q / n, a[1] + (b[1] - a[1]) * q / n]);
    }
    const g = dense.map(([x, z]) => ref.baseGround(x, z)), n = dense.length - 1;
    const pts = dense.map(([x, z], k) => { let sum = 0, c = 0; for (let q = Math.max(0, k - 3); q <= Math.min(n, k + 3); q++) { sum += g[q]; c++; } return [x, z, sum / c]; });
    const miss = end[2] - pts[n][2];                                  // meet the road at its own graded height
    pts.forEach((p, k) => { const t = k / n; p[2] += miss * t * t * (3 - 2 * t); });
    const fin = pts.map(p => [+p[0].toFixed(2), +p[1].toFixed(2), +p[2].toFixed(3)]), xs = fin.map(p => p[0]), zs = fin.map(p => p[1]);
    const rec = { id: `link_${s.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`, class: 'trail', width: ROAD_WIDTH.trail, from: s.name, to: 'road', link: true, bbox: [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)], pts: fin };
    out.push(rec);
    roads.push(rec); for (const p of fin) { const c = cellOf(p[0], p[1]); roadCell[c] = 1; if (!roadPt.has(c)) roadPt.set(c, p); }   // later links may join this one
  }
  roads.splice(roads.length - out.length, out.length);                // the caller appends them
  return out;
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

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
