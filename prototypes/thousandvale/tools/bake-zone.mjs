#!/usr/bin/env node
// Thousandvale — ZONE bake v1 (stream B, PLAN §3.2.2).
//
//   node prototypes/thousandvale/tools/bake-zone.mjs z12_02     # one zone → data/zones/z12_02/
//   node prototypes/thousandvale/tools/bake-zone.mjs --m1       # the starter / M1 zone (Torborhold's)
//   node prototypes/thousandvale/tools/bake-zone.mjs z12_02 --check
//   node prototypes/thousandvale/tools/bake-zone.mjs --province torbor_downs   # every zone of an E sheet (data/world/province-map.json)
//
// Reads data/world/{world.json, macro.bin} (tools/bake-world.mjs) and writes data/zones/<id>/:
//   terrain.bin      the terrain-read.js format (v1): 1025² samples at 2 m (height, water, kind, surface)
//   nav.bin          per-sample movement bits (walk/road/shallow/deep/steep/solid/town/building) — parseNav
//   scatter.bin      trees, bushes, rocks, reeds (8 bytes each) — parseScatter
//   placements.json  typed records {kind, id, x, z, yaw, data}: settlements, town plans (square, streets,
//                    buildings, walls), roads, bridges, dungeon door, event/camp sites, World Forge nodes
//   zone.json        readable meta + summary
//
// Edges agree by construction: heights, rivers, lakes, roads, biomes, scatter and the u16 quantisation are
// functions of WORLD coordinates and the world bake only; neighbour work (rock on steep ground, the wet
// ring) runs on a grid with a one-sample apron; zone-local work (moving, levelling and planning towns,
// road spurs to a moved town) stays clear of every edge. tests/B/zone-bake.test.js compares neighbours.
//
// Coordinates: zone metres, origin at the zone's north-west corner (x, z ∈ [0, 2048]);
// meta.source.worldOrigin is where that corner sits in world metres. yaw = atan2(dx, dz).

import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BIOMES } from '../../../worldgen/js/biomes.js';
import { hashStr, clamp, smoothstep, makeNoise2D, fbm, subSeed } from '../../../worldgen/js/noise.js';
import { planTown, overlaps, footprintOf, cultureFor } from '../../../proctown/js/townplan.js';
import { FORMAT_VERSION, createTerrain, SCATTER_KINDS, NAV } from '../js/rules/terrain-read.js';
import { encodeTerrain } from './bake-test-zone.mjs';
import { decodeMacro, makeRefiner, heightRange, RIVER_WIDTH, RIVER_DEPTH } from './lib/world-core.mjs';
import { addZoneSites, TOWN_RADIUS } from './lib/zone-sites.mjs';
import { encodeScatter, encodeNav } from './lib/zone-layers.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORLD_DIR = join(HERE, '..', 'data', 'world');
const ZONES_DIR = join(HERE, '..', 'data', 'zones');
export const ZONE_BAKE_VERSION = 2;
export const M1_ZONE = 'z12_02';          // the starter zone (world.json `starter`; Torborhold, Petbeck Basin)
const SIZE = 1025, STEP = 2, ZM = 2048;
/** Proctown size by settlement kind. */
const TOWN_SIZE = { hamlet: 1, village: 2, town: 3, city: 4, capital: 5 };
const ROAD_SURFACE_ID = BIOMES.length;    // an extra entry appended to meta.biomes: painted road / street
const LEVEL_EASE = 40;                    // metres a levelled town eases back into the land
const SPUR_EDGE = 120;                    // a spur road never comes nearer a zone edge than this

/**
 * Sites other streams ask for. Every zone that one of stream E's province sheets uses (data/world/province-map.json)
 * gets an event arena (`event_<E zone id>`, r 40; the sheet's world-boss zone also gets `<worldBoss.id>`, r 100 for an
 * arena of 50 plus room). The starter zone keeps E's named M1 ids: `event_grandmother_skein` by the zone's second
 * settlement and `elite_hobb_gallowsby` at its ford.
 */
function asksFor(id, sites, W) {
  const asks = [];
  const hub = sites.find(s => s.hub);
  for (const [sheetId, pm] of Object.entries(PROVINCE_MAP.provinces || {})) {
    const eid = Object.entries(pm.map || {}).find(([, z]) => z === id)?.[0];
    if (!eid) continue;
    let sheet = null; try { sheet = JSON.parse(readFileSync(join(HERE, '..', 'data', 'provinces', `${sheetId}.json`), 'utf8')); } catch { /* no sheet */ }
    if (sheet?.worldBoss?.zone === eid) asks.push({ type: 'event', id: sheet.worldBoss.id, near: { x: 1024, z: 1024 }, r: 100 });
    if (id !== W.starter?.zone) asks.push({ type: 'event', id: `event_${eid}`, near: hub ? { x: (hub.x + 1024) / 2, z: (hub.z + 1024) / 2 } : { x: 1024, z: 1024 }, r: 40 });
  }
  if (id === W.starter?.zone && hub) {
    const other = sites.filter(s => s.type === 'settlement' && !s.hub).sort((a, b) => Math.hypot(a.x - hub.x, a.z - hub.z) - Math.hypot(b.x - hub.x, b.z - hub.z))[0];
    const ford = sites.find(s => s.type === 'crossing');
    asks.push({ type: 'event', id: 'event_grandmother_skein', ...(other ? { nearSite: other.name } : { near: { x: 1024, z: 1024 } }), r: 40 });
    asks.push({ type: 'camp', id: 'elite_hobb_gallowsby', ...(ford ? { nearSite: ford.name } : { near: { x: (hub.x + 1024) / 2, z: (hub.z + 1024) / 2 } }), r: 25 });
  }
  return asks;
}
let PROVINCE_MAP = {};
try { PROVINCE_MAP = JSON.parse(readFileSync(join(HERE, '..', 'data', 'world', 'province-map.json'), 'utf8')); } catch { /* none yet */ }
/** The E sheet zone id for a world zone, if any (written into meta so E can match on its own ids). */
function sheetIdFor(id) {
  for (const [sheetId, pm] of Object.entries(PROVINCE_MAP.provinces || {})) { const e = Object.entries(pm.map || {}).find(([, z]) => z === id); if (e) return { sheet: sheetId, zone: e[0] }; }
  return null;
}

let worldCache = null;
export function loadWorld() {
  if (!worldCache) {
    const json = JSON.parse(readFileSync(join(WORLD_DIR, 'world.json'), 'utf8'));
    const macro = decodeMacro(readFileSync(join(WORLD_DIR, 'macro.bin')));
    worldCache = { json, macro, ref: makeRefiner(macro) };
  }
  return worldCache;
}

/** Distance from (x, z) to polyline pts ([[x, z, …], …]) → [d, segIndex, t]. */
function polyDist(pts, x, z) {
  let best = Infinity, bk = -1, bt = 0;
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k], b = pts[k + 1], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1;
    const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / L2, 0, 1);
    const d = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
    if (d < best) { best = d; bk = k; bt = t; }
  }
  return [best, bk, bt];
}

/** Where polyline pts crosses the circle (cx, cz, r): [[x, z], …] (segment–circle intersections). */
function ringCrossings(pts, cx, cz, r) {
  const out = [];
  for (let k = 0; k < pts.length - 1; k++) {
    const ax = pts[k][0] - cx, az = pts[k][1] - cz, bx = pts[k + 1][0] - cx, bz = pts[k + 1][1] - cz;
    const dx = bx - ax, dz = bz - az, A = dx * dx + dz * dz, B = 2 * (ax * dx + az * dz), C = ax * ax + az * az - r * r;
    const disc = B * B - 4 * A * C; if (A < 1e-9 || disc < 0) continue;
    for (const s of [-1, 1]) { const t = (-B + s * Math.sqrt(disc)) / (2 * A); if (t >= 0 && t < 1) out.push([ax + dx * t, az + dz * t]); }
  }
  return out;
}

/**
 * Bake one zone. opts.hub names the hub settlement (default: the world's starter flag, else the biggest).
 */
export function bakeZone(id, opts = {}) {
  const { json: W, macro: m, ref } = loadWorld();
  const zone = W.zones.find(z => z.id === id);
  if (!zone) throw new Error('no zone ' + id);
  const ox = zone.origin.x, oz = zone.origin.z, M = m.macroMetres;
  const G = SIZE + 2, NG = G * G;                 // grid with a one-sample apron all round
  const wxOf = gi => ox + (gi - 1) * STEP, wzOf = gj => oz + (gj - 1) * STEP;
  const gIdx = (x, z) => (clamp(Math.round(z / STEP), -1, SIZE) + 1) * G + clamp(Math.round(x / STEP), -1, SIZE) + 1;   // zone metres → apron grid
  const province = W.provinces.find(p => p.id === zone.province) || null;

  // 1. base ground at world coordinates
  const ground = new Float32Array(NG);
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) ground[j * G + i] = ref.baseGround(wxOf(i), wzOf(j));

  // 2. sea and lakes (levels from the world bake)
  const waterTop = new Float32Array(NG).fill(NaN), waterKind = new Uint8Array(NG);
  const lakeLevel = new Map(); for (const l of W.lakes) for (const c of l.cells) lakeLevel.set(c, l.level);
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    const k = j * G + i, wx = wxOf(i), wz = wzOf(j);
    const mi = clamp(Math.round(wz / M), 0, m.height - 1) * m.width + clamp(Math.round(wx / M), 0, m.width - 1);
    if (m.water[mi] === 1 || ground[k] < 0) { waterTop[k] = 0; waterKind[k] = 1; }
    else if (m.water[mi] === 2) { const lv = lakeLevel.get(mi) ?? 0; waterTop[k] = lv; waterKind[k] = 2; ground[k] = Math.min(ground[k], lv - 2.5); }
  }
  const wetAt = (x, z) => !Number.isNaN(waterTop[gIdx(x, z)]);

  // 3. settlements: pick spots (move inward / off water if needed), hub first
  const rank = { capital: 0, city: 1, town: 2, village: 3, hamlet: 4 };
  // World Forge's own `dungeon` nodes (kind dungeon/lair) become `lair` marks: `type:'dungeon'` is reserved for the
  // door record the server reads ({id, x, z, yaw}); a lair mark anchors the door in a zone with no town
  const sites = W.nodes.filter(n => n.zone === id).map(n => ({ nodeId: n.id, type: n.type === 'dungeon' ? 'lair' : n.type, kind: n.kind, name: n.name, size: n.size, x: n.x - ox, z: n.z - oz, ...(n.starter ? { starter: true } : {}) }));
  const settlements = sites.filter(s => s.type === 'settlement');
  const hub = settlements.find(s => (opts.hub ? s.name === opts.hub : s.starter)) || settlements.slice().sort((a, b) => (rank[a.kind] ?? 9) - (rank[b.kind] ?? 9) || (b.size || 0) - (a.size || 0))[0];
  if (hub) hub.hub = true;
  settlements.sort((a, b) => (b.hub ? 1 : 0) - (a.hub ? 1 : 0) || (rank[a.kind] ?? 9) - (rank[b.kind] ?? 9));
  const roughness = (x, z, r) => {
    let lo = Infinity, hi = -Infinity, wet = 0;
    for (let dz = -r; dz <= r; dz += 8) for (let dx = -r; dx <= r; dx += 8) { if (dx * dx + dz * dz > r * r) continue; const h = ground[gIdx(x + dx, z + dz)]; lo = Math.min(lo, h); hi = Math.max(hi, h); if (wetAt(x + dx, z + dz)) wet++; }
    return hi - lo + wet * 4;
  };
  const placed = [];
  for (const s of settlements) {
    s.radius = TOWN_RADIUS[s.kind] || 50;
    const keepOff = s.hub ? s.radius + 200 : s.radius + LEVEL_EASE + 30;
    const ok = (x, z) => x >= keepOff && z >= keepOff && x <= ZM - keepOff && z <= ZM - keepOff
      && placed.every(p => Math.hypot(p.x - x, p.z - z) >= p.radius + s.radius + LEVEL_EASE * 2);
    let best = null, bestS = Infinity;
    const reach = s.hub ? 480 : 320;
    for (let dz = -reach; dz <= reach; dz += 16) for (let dx = -reach; dx <= reach; dx += 16) {
      const x = s.x + dx, z = s.z + dz;
      if (!ok(x, z)) continue;
      const sc = roughness(x, z, s.radius) + Math.hypot(dx, dz) * 0.02;
      if (sc < bestS) { bestS = sc; best = { x, z }; }
    }
    if (!best) { s.unplanned = 'no room'; continue; }
    if (best.x !== s.x || best.z !== s.z) s.movedFrom = { x: s.x, z: s.z };
    s.x = best.x; s.z = best.z;
    placed.push(s);
  }
  // a crossing that sat on a settlement's cell keeps its own spot (it marks the river); nothing to move

  // 4. roads: the world polylines (graded heights) + a spur from each moved settlement to the network
  const pad = 80, x0 = ox - pad, z0 = oz - pad, x1 = ox + ZM + pad, z1 = oz + ZM + pad;
  const roads = W.roads.filter(r => !(r.bbox[2] < x0 || r.bbox[0] > x1 || r.bbox[3] < z0 || r.bbox[1] > z1))
    .map(r => ({ id: `road_${r.id}`, worldId: r.id, cls: r.class, width: r.width, pts: r.pts.map(([x, z, h]) => [x - ox, z - oz, h]) }));
  for (const s of placed) {
    if (!s.movedFrom) continue;
    // nearest road point that keeps the spur clear of the zone edges
    let best = null, bestD = Infinity;
    for (const r of roads) for (const p of r.pts) {
      if (p[0] < SPUR_EDGE || p[1] < SPUR_EDGE || p[0] > ZM - SPUR_EDGE || p[1] > ZM - SPUR_EDGE) continue;
      const d = Math.hypot(p[0] - s.x, p[1] - s.z);
      if (d > s.radius && d < bestD) { bestD = d; best = p; }
    }
    if (!best || bestD > 900) continue;
    const n = Math.max(2, Math.round(bestD / 16)), pts = [];
    for (let q = 0; q <= n; q++) { const x = s.x + (best[0] - s.x) * q / n, z = s.z + (best[1] - s.z) * q / n; pts.push([x, z, 0]); }
    const g = pts.map(([x, z]) => ref.baseGround(ox + x, oz + z));
    pts.forEach((p, k) => { let sum = 0, c = 0; for (let q = Math.max(0, k - 3); q <= Math.min(pts.length - 1, k + 3); q++) { sum += g[q]; c++; } p[2] = sum / c; });
    roads.push({ id: `spur_${slug(s.name)}`, cls: 'trail', width: 3.5, pts, spur: true });
  }
  // grade: ease the ground toward the road's height across its width + a shoulder (never inside a town)
  const inTown = (x, z, extra = 0) => placed.some(s => Math.hypot(s.x - x, s.z - z) < s.radius + extra);
  const roadMask = new Uint8Array(NG);
  for (const r of roads) {
    const half = r.width / 2, shoulder = 4, reach = half + shoulder;
    const xs = r.pts.map(p => p[0]), zs = r.pts.map(p => p[1]);
    const i0 = Math.max(0, Math.floor((Math.min(...xs) - reach) / STEP) + 1), i1 = Math.min(G - 1, Math.ceil((Math.max(...xs) + reach) / STEP) + 1);
    const j0 = Math.max(0, Math.floor((Math.min(...zs) - reach) / STEP) + 1), j1 = Math.min(G - 1, Math.ceil((Math.max(...zs) + reach) / STEP) + 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = (i - 1) * STEP, z = (j - 1) * STEP;
      if (inTown(x, z, -2)) continue;
      const [d, k, t] = polyDist(r.pts, x, z);
      if (d > reach) continue;
      const a = r.pts[k], b = r.pts[k + 1], h = a[2] + (b[2] - a[2]) * t;
      const kk = j * G + i, w = d <= half ? 0.9 : 0.9 * (1 - smoothstep(0, 1, (d - half) / shoulder));
      ground[kk] += (h - ground[kk]) * w;
      if (d <= half) roadMask[kk] = 1;
    }
  }

  // 5. level and plan each placed settlement (proctown — the one planner Farhold uses)
  const plans = [];
  for (const s of placed) {
    let sum = 0, n = 0;
    for (let dz = -s.radius; dz <= s.radius; dz += 4) for (let dx = -s.radius; dx <= s.radius; dx += 4) if (dx * dx + dz * dz <= s.radius ** 2) { sum += ground[gIdx(s.x + dx, s.z + dz)]; n++; }
    const mean = sum / n, R = s.radius;
    for (let j = 1; j <= SIZE; j++) for (let i = 1; i <= SIZE; i++) {
      const x = (i - 1) * STEP, z = (j - 1) * STEP, d = Math.hypot(x - s.x, z - s.z);
      if (d > R + LEVEL_EASE) continue;
      const k = j * G + i, w = d <= R ? 0.85 : 0.85 * (1 - smoothstep(0, 1, (d - R) / LEVEL_EASE));
      if (Number.isNaN(waterTop[k])) ground[k] += (mean + (ground[k] - mean) * 0.15 - ground[k]) * w;
    }
    const size = TOWN_SIZE[s.kind] || 2, tx = s.x, tz = s.z;
    const culture = cultureFor({ race: province?.race || 'human', biome: zone.biomes ? Object.keys(zone.biomes)[0] : '' });
    const linksAt = radius => roads.filter(r => !r.spur || r.id === `spur_${slug(s.name)}`).flatMap(r => ringCrossings(r.pts, tx, tz, radius)).map(([x, z]) => [x, z]);
    const plan = planTown({
      seed: (hashStr(id + ':' + s.name) >>> 0) % 100000, size, culture,
      heightAt: (x, z) => ground[gIdx(tx + x, tz + z)],
      buildable: (x, z) => !wetAt(tx + x, tz + z),
      linksAt,
    });
    plan.origin = { x: tx, z: tz }; plan.town = s; plan.culture = culture;
    // the town circle must hold the plan: grow the radius to the plan's own wall/ring + a margin
    const need = (plan.wallRadius || footprintOf(size).ring) + 8;
    if (need > s.radius) s.radius = Math.ceil(need);
    plans.push(plan);
  }

  // 6. rivers: the world bake's polylines (surfaces fixed there), carved where they come near
  const riversUsed = [];
  for (const r of W.rivers) {
    const rx0 = ox - STEP - 80, rz0 = oz - STEP - 80, rx1 = ox + ZM + STEP + 80, rz1 = oz + ZM + STEP + 80;
    if (r.bbox[2] < rx0 || r.bbox[0] > rx1 || r.bbox[3] < rz0 || r.bbox[1] > rz1) continue;
    const pts = r.pts; let used = false;
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k], b = pts[k + 1], cls = Math.max(a[3], b[3]);
      if (Math.max(a[0], b[0]) < rx0 || Math.min(a[0], b[0]) > rx1 || Math.max(a[1], b[1]) < rz0 || Math.min(a[1], b[1]) > rz1) continue;
      used = true;
      const half = RIVER_WIDTH[cls] / 2, reach = half + 10 + cls * 6;
      const i0 = Math.max(0, Math.floor((Math.min(a[0], b[0]) - reach - ox) / STEP) + 1), i1 = Math.min(G - 1, Math.ceil((Math.max(a[0], b[0]) + reach - ox) / STEP) + 1);
      const j0 = Math.max(0, Math.floor((Math.min(a[1], b[1]) - reach - oz) / STEP) + 1), j1 = Math.min(G - 1, Math.ceil((Math.max(a[1], b[1]) + reach - oz) / STEP) + 1);
      const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const wx = wxOf(i), wz = wzOf(j);
        const t = clamp(((wx - a[0]) * dx + (wz - a[1]) * dz) / L2, 0, 1);
        const d = Math.hypot(wx - (a[0] + dx * t), wz - (a[1] + dz * t));
        if (d > reach) continue;
        const k2 = j * G + i, surface = a[2] + (b[2] - a[2]) * t;
        if (d <= half) {
          const depth = RIVER_DEPTH[cls] * (1 - (d / half) ** 2) + 0.3;
          ground[k2] = Math.min(ground[k2], surface - depth);
          if (!(waterTop[k2] >= surface)) { waterTop[k2] = Number.isNaN(waterTop[k2]) ? surface : Math.max(waterTop[k2], surface); if (waterKind[k2] !== 1) waterKind[k2] = 3; }
        } else {
          const tt = smoothstep(0, 1, (d - half) / (reach - half)), lip = surface + 0.25;
          ground[k2] = Math.min(ground[k2], lip + (Math.max(lip, ground[k2]) - lip) * tt);
        }
      }
    }
    if (used) riversUsed.push({ id: r.id, name: r.name });
  }

  // 7. one dry ring outside every wet edge carries the surface (a sheet of wet triangles reaches the bank)
  {
    const copy = waterTop.slice(), kinds = waterKind.slice();
    for (let j = 1; j < G - 1; j++) for (let i = 1; i < G - 1; i++) {
      const k = j * G + i; if (!Number.isNaN(copy[k])) continue;
      let s = 0, c = 0, kind = 0;
      for (const o of [1, -1, G, -G]) { const v = copy[k + o]; if (!Number.isNaN(v)) { s += v; c++; kind = Math.max(kind, kinds[k + o]); } }
      if (c) { waterTop[k] = s / c; waterKind[k] = kind; }
    }
  }

  // 8. surface: warped macro biome, water and rock overrides, then roads and town streets painted on
  const N = SIZE * SIZE, biome = new Uint8Array(N);
  const BEACH = 4, MOUNTAINS = 17, LAKE = 3, COAST = 2;
  for (let j = 0; j < SIZE; j++) for (let i = 0; i < SIZE; i++) {
    const gi = i + 1, gj = j + 1, k = gj * G + gi;
    let b = m.biome[ref.warpedIndex(wxOf(gi), wzOf(gj))];
    if (waterKind[k] && waterTop[k] > ground[k]) b = waterKind[k] === 1 ? COAST : LAKE;
    else if (b < 4 || b === 25) b = BEACH;
    else if (roadMask[k]) b = ROAD_SURFACE_ID;
    else { const s = Math.hypot(ground[k + 1] - ground[k - 1], ground[k + G] - ground[k - G]) / (2 * STEP); if (s > 0.9 && b !== 18) b = MOUNTAINS; }
    biome[j * SIZE + i] = b;
  }
  for (const plan of plans) {
    const { x: tx, z: tz } = plan.origin;
    for (const st of plan.streets) {
      const pts = st.pts.map(([x, z]) => [tx + x, tz + z]), half = st.width / 2;
      const xs = pts.map(p => p[0]), zs = pts.map(p => p[1]);
      for (let j = Math.max(0, Math.floor((Math.min(...zs) - half) / STEP)); j <= Math.min(SIZE - 1, Math.ceil((Math.max(...zs) + half) / STEP)); j++)
        for (let i = Math.max(0, Math.floor((Math.min(...xs) - half) / STEP)); i <= Math.min(SIZE - 1, Math.ceil((Math.max(...xs) + half) / STEP)); i++) {
          const o = j * SIZE + i; if (biome[o] === LAKE || biome[o] === COAST) continue;
          if (polyDist(pts, i * STEP, j * STEP)[0] <= half) biome[o] = ROAD_SURFACE_ID;
        }
    }
  }

  // 9. quantise on the WORLD range and crop
  const { min: hMin, max: hMax } = heightRange(W);
  const q = v => clamp(Math.round((v - hMin) / (hMax - hMin) * 65535), 1, 65535);
  const height = new Uint16Array(N), wTop = new Uint16Array(N), wKind = new Uint8Array(N);
  for (let j = 0; j < SIZE; j++) for (let i = 0; i < SIZE; i++) {
    const k = (j + 1) * G + i + 1, o = j * SIZE + i;
    height[o] = q(ground[k]); wTop[o] = Number.isNaN(waterTop[k]) ? 0 : q(waterTop[k]); wKind[o] = wTop[o] ? waterKind[k] : 0;
  }

  const metaSites = sites.map(s => { const o = { ...s }; delete o.size; delete o.nodeId; return o; });
  const meta = {
    name: hub ? `${hub.name} (${id})` : id, zone: id, sheet: sheetIdFor(id), province: province ? { id: province.id, name: province.name } : null,
    size: SIZE, step: STEP, origin: { x: 0, z: 0 }, heightMin: hMin, heightMax: hMax,
    bakeVersion: ZONE_BAKE_VERSION, inputHash: null,
    biomes: [...BIOMES.map(b => [b.key, b.name, b.color]), ['road', 'Road', '#b39a6e']], waterKinds: ['none', 'sea', 'lake', 'river'],
    source: { tool: 'tools/bake-zone.mjs', world: { seed: W.seed, width: W.width, height: W.height, method: W.method, seaLevel: W.seaLevel, inputHash: W.inputHash }, zone: { zx: zone.zx, zy: zone.zy }, worldOrigin: { x: ox, z: oz }, zoneMetres: ZM },
    rivers: riversUsed, sites: metaSites, spawn: null,
  };
  meta.inputHash = (hashStr(JSON.stringify({ id, w: W.inputHash, ZONE_BAKE_VERSION, FORMAT_VERSION, hub: opts.hub || null })) >>> 0).toString(16).padStart(8, '0');
  const terrain = createTerrain({ meta, height, waterTop: wTop, waterKind: wKind, biome });

  // 10. sites other streams use (door, event/camp arenas) — clear of towns, roads and E's vignettes
  let vignettes = [];
  try { vignettes = JSON.parse(readFileSync(join(HERE, '..', 'data', 'vignettes', 'placements', `${id}.json`), 'utf8')).placements || []; } catch { /* E has not placed this zone yet */ }
  const avoid = vignettes.map(v => ({ x: v.x, z: v.z, r: v.radius || 12 }));
  addZoneSites(terrain, meta.sites, { asks: asksFor(id, meta.sites, W), avoid, doorName: 'Barrow entrance', town: meta.sites.find(s => s.hub) });
  const hubSite = meta.sites.find(s => s.hub);
  meta.spawn = hubSite ? spawnNear(terrain, hubSite) : { x: 1024, z: 1024 };

  // 11. bridges from the world bake (zone-local copies), placements, scatter, nav
  const bridges = W.bridges.filter(b => b.x >= ox && b.x < ox + ZM && b.z >= oz && b.z < oz + ZM).map((b, i) => ({ ...b, x: b.x - ox, z: b.z - oz, id: `bridge_${b.road}_${b.river}_${i}` }));
  const placements = placementsFor(meta, plans, roads, bridges);
  const keepClear = [
    ...placed.map(s => ({ x: s.x, z: s.z, r: s.radius + 6 })),
    ...meta.sites.filter(s => s.type === 'dungeon').map(s => ({ x: s.x, z: s.z, r: 14 })),
    ...meta.sites.filter(s => s.type === 'event' || s.type === 'camp').map(s => ({ x: s.x, z: s.z, r: s.r })),
    ...avoid,
  ];
  const scatter = scatterFor(W, zone, terrain, biome, keepClear);
  const nav = navFor(terrain, biome, scatter, plans);
  return { meta, height, waterTop: wTop, waterKind: wKind, biome, terrain, plans, townPlan: plans.find(p => p.town.hub) || null, placements, roads, bridges, scatter, nav, vignettesUsed: vignettes.length };
}

// ---------------------------------------------------------------------------------------------- scatter
/** Per-biome density per 6 m cell (36 m²): [kind index, probability]. Trees clump by a grove noise. */
const SCATTER_TABLE = {
  grassland: [[0, 0.014], [4, 0.025], [5, 0.008]],
  temperateForest: [[0, 0.30], [4, 0.08], [5, 0.012], [6, 0.004]],
  borealForest: [[1, 0.32], [4, 0.03], [5, 0.015], [6, 0.006]],
  rainforest: [[0, 0.36], [4, 0.16]],
  savanna: [[2, 0.022], [4, 0.035], [5, 0.007]],
  shrubland: [[4, 0.09], [5, 0.012], [2, 0.006]],
  marsh: [[8, 0.16], [3, 0.012], [4, 0.02]],
  hills: [[1, 0.05], [5, 0.03], [6, 0.015], [7, 0.004], [4, 0.03]],
  mountains: [[5, 0.05], [6, 0.03], [7, 0.012], [1, 0.02]],
  snowyPeaks: [[6, 0.02], [7, 0.01]],
  tundra: [[5, 0.02], [4, 0.012], [6, 0.004]],
  desert: [[5, 0.012], [6, 0.006], [3, 0.002]],
  badlands: [[5, 0.03], [6, 0.015], [7, 0.006], [3, 0.004]],
  beach: [[5, 0.01]],
  blighted: [[3, 0.12], [4, 0.03]], ashPlain: [[3, 0.03], [5, 0.02]], veiledHills: [[3, 0.05], [6, 0.02]],
  hallowed: [[0, 0.22], [4, 0.1]], glimmerwaste: [[5, 0.03], [6, 0.02]], volcanic: [[6, 0.03], [7, 0.01]],
};
const TREE_KINDS = new Set([0, 1, 2, 3]);
const SC = 6;   // scatter cell, metres (world-aligned)

/** Hash of world cell coordinates → 0..1 (salted). */
function h01(cx, cz, salt) {
  let h = Math.imul(cx + 374761393 + salt * 668265263, 668265263) ^ Math.imul(cz + 2246822519, 374761393);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function scatterFor(W, zone, t, biome, keepClear) {
  const ox = zone.origin.x, oz = zone.origin.z;
  const grove = makeNoise2D(subSeed(W.seed, 'thousandvale-groves'));
  const keys = t.biomes.map(b => b.key);
  const items = [];
  const c0x = Math.floor(ox / SC), c0z = Math.floor(oz / SC), c1x = Math.ceil((ox + ZM) / SC), c1z = Math.ceil((oz + ZM) / SC);
  for (let cz = c0z; cz < c1z; cz++) for (let cx = c0x; cx < c1x; cx++) {
    const wx = (cx + 0.1 + 0.8 * h01(cx, cz, 1)) * SC, wz = (cz + 0.1 + 0.8 * h01(cx, cz, 2)) * SC;
    const x = wx - ox, z = wz - oz;
    if (x < 0 || z < 0 || x >= ZM || z >= ZM) continue;          // half-open: an edge point belongs to one zone
    const i = Math.round(x / 2), j = Math.round(z / 2), b = biome[j * SIZE + i];
    const table = SCATTER_TABLE[keys[b]];
    if (!table) continue;                                          // water, road
    const roll = h01(cx, cz, 3);
    const groveF = smoothstep(0.35, 0.7, fbm(grove, wx / 140, wz / 140, { octaves: 3 })) * 2;
    let acc = 0, kind = -1;
    for (const [k, p] of table) { acc += TREE_KINDS.has(k) ? p * groveF : p; if (roll < acc) { kind = k; break; } }
    if (kind < 0) continue;
    if (t.waterAt(x, z).kind !== 'none') continue;
    const slope = t.slopeAt(x, z);
    if (TREE_KINDS.has(kind) && slope > 32) kind = 6;              // too steep for a tree: a rock instead
    if (slope > 50) continue;
    if (keepClear.some(c => Math.hypot(c.x - x, c.z - z) < c.r)) continue;
    // keep a clear verge beside roads/streets (2 m round the trunk)
    let verge = false;
    for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) { const ii = clamp(i + dx / 2, 0, SIZE - 1), jj = clamp(j + dz / 2, 0, SIZE - 1); if (biome[jj * SIZE + ii] === t.biomes.length - 1) verge = true; }
    if (verge) continue;
    items.push({ x, z, kind, scale: 0.7 + h01(cx, cz, 4) * (kind === 7 ? 1.3 : 0.9), yaw: h01(cx, cz, 5) * Math.PI * 2, variant: Math.floor(h01(cx, cz, 6) * 4) });
  }
  return items;
}

// ---------------------------------------------------------------------------------------------- nav
function navFor(t, biome, scatter, plans) {
  const bits = new Uint8Array(SIZE * SIZE), roadId = t.biomes.length - 1;
  for (let j = 0; j < SIZE; j++) for (let i = 0; i < SIZE; i++) {
    const x = i * STEP, z = j * STEP, o = j * SIZE + i;
    let b = 0;
    const w = t.waterAt(Math.min(x + 0.01, 2047.99), Math.min(z + 0.01, 2047.99));
    if (w.depth > 1.1) b |= NAV.DEEP; else if (w.kind !== 'none') b |= NAV.SHALLOW;
    if (t.slopeAt(Math.min(x + 0.5, 2047.5), Math.min(z + 0.5, 2047.5)) > 46) b |= NAV.STEEP;
    if (!(b & (NAV.DEEP | NAV.STEEP))) b |= NAV.WALK;
    if (biome[o] === roadId) b |= NAV.ROAD;
    bits[o] = b;
  }
  const stamp = (cx, cz, r, bit) => {
    for (let j = Math.max(0, Math.floor((cz - r) / STEP)); j <= Math.min(SIZE - 1, Math.ceil((cz + r) / STEP)); j++)
      for (let i = Math.max(0, Math.floor((cx - r) / STEP)); i <= Math.min(SIZE - 1, Math.ceil((cx + r) / STEP)); i++)
        if (Math.hypot(i * STEP - cx, j * STEP - cz) <= r + STEP * 0.5) bits[j * SIZE + i] |= bit;
  };
  for (const it of scatter) if (SCATTER_KINDS[it.kind].solid) stamp(it.x, it.z, SCATTER_KINDS[it.kind].r * it.scale, NAV.SOLID);
  for (const plan of plans) {
    const { x: tx, z: tz } = plan.origin;
    stamp(tx, tz, plan.town.radius, NAV.TOWN);
    for (const p of plan.plots) {
      // rotated footprint: test each sample in the plot's bounding circle against its box
      const c = Math.cos(p.angle), s = Math.sin(p.angle), r = Math.hypot(p.w, p.d) / 2;
      const cx = tx + p.cx, cz = tz + p.cz;
      for (let j = Math.max(0, Math.floor((cz - r) / STEP)); j <= Math.min(SIZE - 1, Math.ceil((cz + r) / STEP)); j++)
        for (let i = Math.max(0, Math.floor((cx - r) / STEP)); i <= Math.min(SIZE - 1, Math.ceil((cx + r) / STEP)); i++) {
          const dx = i * STEP - cx, dz = j * STEP - cz, lx = dx * c + dz * s, lz = -dx * s + dz * c;
          if (Math.abs(lx) <= p.w / 2 && Math.abs(lz) <= p.d / 2) bits[j * SIZE + i] |= NAV.BUILDING;
        }
    }
  }
  return bits;
}

function spawnNear(t, s) {
  let best = null, bestS = Infinity;
  for (let dz = -40; dz <= 40; dz += 4) for (let dx = -40; dx <= 40; dx += 4) {
    const x = s.x + dx, z = s.z + dz;
    if (!t.walkable(x, z) || t.waterAt(x, z).kind !== 'none') continue;
    const sc = t.slopeAt(x, z) + Math.hypot(dx, dz) * 0.05;
    if (sc < bestS) { bestS = sc; best = { x, z }; }
  }
  return best || { x: s.x, z: s.z };
}

/** proctown angle (direction (cos a, sin a) in x/z) → protocol yaw (atan2(dx, dz)). */
const yawOf = a => +Math.atan2(Math.cos(a), Math.sin(a)).toFixed(4);
const r2 = v => Math.round(v * 100) / 100;
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

/** Typed placement records: {kind, id, x, z, yaw, data}. Every id is unique within the zone. */
export function placementsFor(meta, plans, roads = [], bridges = []) {
  const out = [];
  for (const s of meta.sites) {
    if (s.type === 'settlement') out.push({ kind: 'settlement', id: slug(s.name), x: r2(s.x), z: r2(s.z), yaw: 0, data: { kind: s.kind, name: s.name, radius: s.radius ?? TOWN_RADIUS[s.kind] ?? 40, hub: !!s.hub, planned: !s.unplanned } });
    else if (s.type === 'dungeon') out.push({ kind: 'dungeon_door', id: s.id, x: s.x, z: s.z, yaw: s.yaw, data: { name: s.name } });
    else if (s.type === 'event' || s.type === 'camp') out.push({ kind: s.type + '_site', id: s.id, x: s.x, z: s.z, yaw: 0, data: { r: s.r } });
    else out.push({ kind: s.type, id: slug(s.name || s.kind), x: r2(s.x), z: r2(s.z), yaw: 0, data: { kind: s.kind, name: s.name } });
  }
  for (const plan of plans) {
    const { x: tx, z: tz } = plan.origin, town = slug(plan.town.name);
    out.push({ kind: 'town_square', id: `${town}_square`, x: r2(tx + plan.square.cx), z: r2(tz + plan.square.cz), yaw: 0, data: { r: r2(plan.square.r), town, culture: plan.culture } });
    plan.streets.forEach((st, i) => {
      const pts = st.pts.map(([x, z]) => [r2(tx + x), r2(tz + z)]);
      out.push({ kind: 'street', id: `${town}_street_${i}`, x: pts[0][0], z: pts[0][1], yaw: 0, data: { town, cls: st.cls, width: st.width, pts } });
    });
    // a door must open onto a street: face the plot side whose front is nearest a DRAWN street (proctown's
    // own `facing` points at the nearest block edge, which after its connectivity pass is a street only
    // about half the time)
    const streetGap = (x, z) => {
      let best = Infinity;
      for (const st of plan.streets) best = Math.min(best, polyDist(st.pts, x, z)[0] - st.width / 2);
      return best;
    };
    plan.plots.forEach((p, i) => {
      let face = p.facing, gap = Infinity;
      for (let q = 0; q < 4; q++) {
        const a = p.angle + q * Math.PI / 2, half = (q % 2 ? p.d : p.w) / 2 + 1;
        const g = streetGap(p.cx + Math.cos(a) * half, p.cz + Math.sin(a) * half);
        if (g < gap - 1e-6) { gap = g; face = a; }
      }
      out.push({
        kind: 'building', id: `${town}_plot_${i}`, x: r2(tx + p.cx), z: r2(tz + p.cz), yaw: yawOf(face),
        data: { town, want: p.want, district: p.district, w: r2(p.w), d: r2(p.d), angle: +p.angle.toFixed(4), front: +face.toFixed(4), streetGap: r2(gap) },
      });
    });
    if (plan.wall) out.push({ kind: 'town_wall', id: `${town}_wall`, x: r2(tx), z: r2(tz), yaw: 0, data: { town, radius: plan.wallRadius, gates: plan.wall.gates } });
  }
  // a road stops at a town's edge: inside, the town's own high streets (proctown `links`) carry it on
  const circles = plans.map(p => ({ x: p.origin.x, z: p.origin.z, r: p.town.radius }));
  for (const r of roads) {
    clipOutside(r.pts, circles).forEach((piece, n, all) => {
      const pts = piece.map(([x, z, h]) => [r2(x), r2(z), r2(h)]);
      if (pts.length < 2) return;
      out.push({ kind: 'road', id: all.length > 1 ? `${r.id}_${n}` : r.id, x: pts[0][0], z: pts[0][1], yaw: 0, data: { cls: r.cls, width: r.width, spur: !!r.spur, pts } });
    });
  }
  for (const b of bridges) out.push({ kind: 'bridge', id: b.id, x: r2(b.x), z: r2(b.z), yaw: b.yaw, data: { span: b.span, deck: b.deck, road: `road_${b.road}` } });
  return out;
}

/** Split a polyline [[x, z, h]…] into the pieces outside every circle, cutting exactly at the rims. */
function clipOutside(pts, circles) {
  const inside = p => circles.some(c => Math.hypot(p[0] - c.x, p[1] - c.z) < c.r);
  const pieces = []; let cur = [];
  const cut = (a, b) => {   // the rim point between an outside a and an inside b (or vice versa), by bisection
    let lo = 0, hi = 1; const ain = inside(a);
    for (let k = 0; k < 24; k++) { const mid = (lo + hi) / 2, p = [a[0] + (b[0] - a[0]) * mid, a[1] + (b[1] - a[1]) * mid]; if (inside(p) === ain) lo = mid; else hi = mid; }
    const t = (lo + hi) / 2; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  };
  for (let k = 0; k < pts.length; k++) {
    const p = pts[k], pin = inside(p);
    if (k > 0) {
      const q = pts[k - 1], qin = inside(q);
      if (qin !== pin) { const c = cut(q, p); if (pin) { cur.push(c); pieces.push(cur); cur = []; } else cur.push(c); }
    }
    if (!pin) cur.push(p);
  }
  if (cur.length) pieces.push(cur);
  return pieces;
}

/** Summary for zone.json and the console. */
export function summarise(b) {
  const t = b.terrain; let wet = 0, steep = 0, n = 0;
  for (let z = 1; z < 2048; z += 16) for (let x = 1; x < 2048; x += 16) { n++; if (t.waterAt(x, z).kind !== 'none') wet++; if (!t.walkable(x, z)) steep++; }
  const kinds = {}; for (const it of b.scatter) kinds[SCATTER_KINDS[it.kind].key] = (kinds[SCATTER_KINDS[it.kind].key] || 0) + 1;
  return {
    zone: b.meta.zone, province: b.meta.province?.name, inputHash: b.meta.inputHash, rivers: b.meta.rivers.length, wetShare: +(wet / n).toFixed(3), unwalkableShare: +(steep / n).toFixed(3),
    towns: b.plans.map(p => ({ name: p.town.name, kind: p.town.kind, hub: !!p.town.hub, at: [p.origin.x, p.origin.z], radius: p.town.radius, movedFrom: p.town.movedFrom || null, culture: p.culture, plots: p.plots.length, streets: p.streets.length, links: p.links || 0, overlaps: overlaps(p).length })),
    roads: b.roads.length, bridges: b.bridges.length, scatter: b.scatter.length, scatterKinds: kinds,
    sites: b.meta.sites.map(s => [s.type + (s.hub ? '(HUB)' : ''), s.kind || s.id, s.name || '', Math.round(s.x), Math.round(s.z), s.radius ?? s.r ?? '', s.yaw ?? '', s.unplanned || ''].join(' ').trim()),
    spawn: b.meta.spawn, placements: b.placements.length, vignettesAvoided: b.vignettesUsed,
  };
}

/** Everything a zone bake writes, as {file: bytes|string}. */
export function zoneFiles(b) {
  const id = b.meta.zone;
  const pl = JSON.stringify({
    _doc: 'Stream B zone placements (tools/bake-zone.mjs). Zone metres; yaw = atan2(dx, dz), the way the thing faces. kinds: settlement (data.radius, hub, planned), town_square, street (data.pts, width, cls), building (a proctown plot: data.w along `angle` (local +x = (cos angle, sin angle)), data.d across, want; yaw faces the nearest drawn street, data.streetGap = metres from the front to it), town_wall, road (data.pts [[x,z,h]], width, cls, spur), bridge (yaw along the road, span, deck height), dungeon_door, event_site, camp_site, landmark/dungeon/pass/crossing (World Forge nodes).',
    zone: id, terrainHash: b.meta.inputHash, placements: b.placements,
  }, null, 1) + '\n';
  const lm = { extent: ZM, terrainHash: b.meta.inputHash, zone: id };
  return {
    'terrain.bin': encodeTerrain(b),
    'nav.bin': encodeNav(b.nav, { size: SIZE, step: STEP, ...lm }),
    'scatter.bin': encodeScatter(b.scatter, lm),
    'placements.json': pl,
  };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const pi = process.argv.indexOf('--province');
  const ids = process.argv.includes('--m1') ? [M1_ZONE]
    : pi > 0 ? Object.values(PROVINCE_MAP.provinces?.[process.argv[pi + 1]]?.map || {})
    : process.argv.slice(2).filter(a => /^z\d\d_\d\d$/.test(a));
  if (!ids.length) { console.error('usage: bake-zone.mjs <zXX_YY>… | --m1 | --province <sheet id> [--check]'); process.exit(2); }
  let staleAny = false;
  for (const id of ids) {
  const t0 = performance.now();
  const b = bakeZone(id);
  const files = zoneFiles(b), dir = join(ZONES_DIR, id);
  if (process.argv.includes('--check')) {
    const stale = Object.entries(files).filter(([f, v]) => !existsSync(join(dir, f)) || Buffer.compare(readFileSync(join(dir, f)), Buffer.from(v)) !== 0).map(([f]) => f);
    console.log(stale.length ? `${id} is STALE: ${stale.join(', ')}` : `${id} is up to date`); if (stale.length) staleAny = true; continue;
  }
  mkdirSync(dir, { recursive: true });
  for (const [f, v] of Object.entries(files)) writeFileSync(join(dir, f), v);
  const info = summarise(b);
  writeFileSync(join(dir, 'zone.json'), JSON.stringify({ ...b.meta, biomes: undefined, summary: info, files: Object.fromEntries(Object.entries(files).map(([f, v]) => [f, v.length])) }, null, 2) + '\n');
  if (ids.length === 1) console.log(JSON.stringify(info, null, 2));
  else console.log(`${id} ${b.meta.sheet?.zone || ''}: ${info.towns.map(t => `${t.name}${t.hub ? '*' : ''}(${t.plots})`).join(', ') || 'no settlement'}; sites ${b.meta.sites.filter(s => ['event', 'camp', 'dungeon'].includes(s.type)).map(s => s.id).join(' ')}; scatter ${info.scatter}`);
  console.log(`wrote ${dir} in ${Math.round(performance.now() - t0)} ms`);
  }
  if (staleAny) process.exit(1);
}
