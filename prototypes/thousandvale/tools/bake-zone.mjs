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
import { decodeMacro, makeRefiner, bicubic, heightRange, RIVER_WIDTH, RIVER_DEPTH, crossingsOf, bridgeFor, DECK_LAND } from './lib/world-core.mjs';
import { addZoneSites, TOWN_RADIUS } from './lib/zone-sites.mjs';
import { encodeScatter, encodeNav, sameLayerFile } from './lib/zone-layers.mjs';
import { carveTheme, inFen, shoreDistance, cutCliff } from './lib/zone-theme.mjs';
import { layPaths } from './lib/zone-paths.mjs';
import { SET_SURFACES, specsFor, layLanes, resolveSetPieces, prepareEPieces, carvePonds, paintSetPieces, setPieceScatter, setPieceKeepOff, setPiecePlacements, setPieceNav } from './lib/zone-setpieces.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORLD_DIR = join(HERE, '..', 'data', 'world');
const ZONES_DIR = join(HERE, '..', 'data', 'zones');
export const ZONE_BAKE_VERSION = 4;   // 3: play-test 1 (rivers, bridges, lakes, skirt, paths, scatter); 4: play-test 2 (set pieces, lanes, town offices)
export const M1_ZONE = 'z12_02';          // the starter zone (world.json `starter`; Torborhold, Petbeck Basin)
const SIZE = 1025, STEP = 2, ZM = 2048;
/**
 * Apron: samples computed beyond each zone edge so neighbour work (the wet skirt's rings, rock on steep ground)
 * sees what the neighbour sees (the skirt needs 1, the bridge grading reads world data only). Everything in the apron
 * is world-pure; 6 keeps room for wider neighbour work.
 */
const AP = 6;
/** The skirt ring's ground is raised to at least surface + this, so the water sheet's edge is always under ground (P21). */
const SKIRT_BURY = 0.15;
/** Proctown size by settlement kind. */
const TOWN_SIZE = { hamlet: 1, village: 2, town: 3, city: 4, capital: 5 };
const ROAD_SURFACE_ID = BIOMES.length + SET_SURFACES.length;    // meta.biomes = World Forge's + the set-piece surfaces + painted road / street (road stays LAST)
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
/** Stream E's names + settlement asks per world zone (data/provinces/<sheet>-places.json) and the sheet row. */
function placesFor(id) {
  const sid = sheetIdFor(id); if (!sid) return null;
  let places = null, sheet = null;
  try { places = JSON.parse(readFileSync(join(HERE, '..', 'data', 'provinces', `${sid.sheet}-places.json`), 'utf8')).zones?.[sid.zone] || null; } catch { /* none */ }
  try { sheet = JSON.parse(readFileSync(join(HERE, '..', 'data', 'provinces', `${sid.sheet}.json`), 'utf8')).zones?.[sid.zone] || null; } catch { /* none */ }
  return { rename: places?.rename || {}, asks: places?.asks || [], town: sheet?.town || null, setPieces: places?.setPieces || [], lanes: places?.lanes || [] };
}
let SITE_PINS = {};
try { SITE_PINS = JSON.parse(readFileSync(join(HERE, '..', 'data', 'world', 'site-pins.json'), 'utf8')); } catch { /* none */ }
let SET_PIECES = {};
try { SET_PIECES = JSON.parse(readFileSync(join(HERE, '..', 'data', 'world', 'set-pieces.json'), 'utf8')); } catch { /* none */ }
let OFFICES = null;
try { OFFICES = JSON.parse(readFileSync(join(HERE, '..', 'data', 'world', 'town-offices.json'), 'utf8')); } catch { /* none: proctown's own trade list */ }
const OFFICE_ROLE = OFFICES ? Object.fromEntries(Object.entries(OFFICES.roles).map(([role, want]) => [want, role]).reverse()) : {};
let E_SETPIECES = [];
try { E_SETPIECES = JSON.parse(readFileSync(join(HERE, '..', 'data', 'vignettes', 'setpieces.json'), 'utf8')).vignettes || []; } catch { /* none */ }
let THEMES = {};
try { THEMES = JSON.parse(readFileSync(join(HERE, '..', 'data', 'world', 'zone-themes.json'), 'utf8')); } catch { /* none */ }
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
  const G = SIZE + 2 * AP, NG = G * G;            // grid with an AP-sample apron all round
  const wxOf = gi => ox + (gi - AP) * STEP, wzOf = gj => oz + (gj - AP) * STEP;
  const gIdx = (x, z) => (clamp(Math.round(z / STEP), -AP, SIZE - 1 + AP) + AP) * G + clamp(Math.round(x / STEP), -AP, SIZE - 1 + AP) + AP;   // zone metres → apron grid
  const province = W.provinces.find(p => p.id === zone.province) || null;

  // 1. base ground at world coordinates
  const ground = new Float32Array(NG);
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) ground[j * G + i] = ref.baseGround(wxOf(i), wzOf(j));

  // 2. sea and lakes (levels from the world bake)
  const waterTop = new Float32Array(NG).fill(NaN), waterKind = new Uint8Array(NG);
  const lakeLevel = new Map(); for (const l of W.lakes) for (const c of l.cells) lakeLevel.set(c, l.level);
  // a world lake is the 0.5 contour of a bicubic "lake-ness" field over its macro cells (it used to be the cells
  // themselves: a one-cell lake was a 128 m square pit with vertical sides — P21's square water), carved as a bowl
  const LAKE_NOISE = makeNoise2D(subSeed(W.seed, 'thousandvale-lake-shores'));
  const lakeField = new Float32Array(m.width * m.height); for (let q = 0; q < lakeField.length; q++) lakeField[q] = m.water[q] === 2 ? 1 : 0;
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    const k = j * G + i, wx = wxOf(i), wz = wzOf(j);
    const mi = clamp(Math.round(wz / M), 0, m.height - 1) * m.width + clamp(Math.round(wx / M), 0, m.width - 1);
    if (m.water[mi] === 1 || ground[k] < 0) { waterTop[k] = 0; waterKind[k] = 1; continue; }
    const cx = Math.round(wx / M), cz = Math.round(wz / M);
    let near = -1, nd = Infinity;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const x = cx + dx, z = cz + dz; if (x < 0 || z < 0 || x >= m.width || z >= m.height) continue;
      const q = z * m.width + x; if (m.water[q] !== 2) continue;
      const d = Math.hypot(x * M - wx, z * M - wz); if (d < nd) { nd = d; near = q; }
    }
    if (near < 0) continue;
    const v = bicubic(m, lakeField, wx / M, wz / M) + (fbm(LAKE_NOISE, wx / 90, wz / 90, { octaves: 3 }) - 0.5) * 0.35, lv = lakeLevel.get(near) ?? 0;
    if (v >= 0.5) { waterTop[k] = lv; waterKind[k] = 2; ground[k] = Math.min(ground[k], lv - 0.15 - 2.5 * smoothstep(0.5, 0.95, v)); }
    else if (v > 0.3) { const lip = lv + 0.4 * smoothstep(0.5, 0.42, v); ground[k] = lip + (ground[k] - lip) * smoothstep(0.42, 0.3, v); }
  }
  const wetAt = (x, z) => !Number.isNaN(waterTop[gIdx(x, z)]);

  // 3. settlements: pick spots (move inward / off water if needed), hub first
  const rank = { capital: 0, city: 1, town: 2, village: 3, hamlet: 4 };
  // World Forge's own `dungeon` nodes (kind dungeon/lair) become `lair` marks: `type:'dungeon'` is reserved for the
  // door record the server reads ({id, x, z, yaw}); a lair mark anchors the door in a zone with no town
  const sites = W.nodes.filter(n => n.zone === id).map(n => ({ nodeId: n.id, type: n.type === 'dungeon' ? 'lair' : n.type, kind: n.kind, name: n.name, size: n.size, x: n.x - ox, z: n.z - oz, ...(n.starter ? { starter: true } : {}) }));
  // stream E's names (impose like Torborhold), the settlements E's sheet needs where World Forge put none, and the
  // zone's sheet town grown to a town if World Forge made it smaller
  const PL = placesFor(id);
  if (PL) {
    for (const s of sites) { const nn = PL.rename[slug(s.name)]; if (nn) { s.wfName = s.name; s.name = nn; } }
    for (const a of PL.asks) sites.push({ type: 'settlement', kind: a.kind, name: a.name, x: a.x, z: a.z, ask: true, askR: a.r });
    for (const s of sites) if (s.type === 'settlement' && PL.town && s.name === PL.town && (rank[s.kind] ?? 9) > rank.town) { s.grownFrom = s.kind; s.kind = 'town'; }
  }
  // a ford marks where a road meets the river: snap it onto the nearest river point (World Forge's node is a cell centre)
  for (const s of sites.filter(s => s.type === 'crossing')) {
    let best = null, bestD = 300;
    for (const r of W.rivers) for (const p of r.pts) {
      const x = p[0] - ox, z = p[1] - oz; if (x < 40 || z < 40 || x > ZM - 40 || z > ZM - 40) continue;
      const d = Math.hypot(x - s.x, z - s.z); if (d < bestD) { bestD = d; best = [x, z]; }
    }
    if (best && bestD > 4) { s.snappedFrom = { x: s.x, z: s.z }; s.x = Math.round(best[0]); s.z = Math.round(best[1]); }
  }
  const settlements = sites.filter(s => s.type === 'settlement');
  const hub = settlements.find(s => (opts.hub ? s.name === opts.hub : s.starter)) || (PL?.town && settlements.find(s => s.name === PL.town)) || settlements.slice().sort((a, b) => (rank[a.kind] ?? 9) - (rank[b.kind] ?? 9) || (b.size || 0) - (a.size || 0))[0];
  if (hub) hub.hub = true;
  settlements.sort((a, b) => (b.hub ? 1 : 0) - (a.hub ? 1 : 0) || (rank[a.kind] ?? 9) - (rank[b.kind] ?? 9));
  const roughness = (x, z, r) => {
    let lo = Infinity, hi = -Infinity, wet = 0;
    for (let dz = -r; dz <= r; dz += 8) for (let dx = -r; dx <= r; dx += 8) { if (dx * dx + dz * dz > r * r) continue; const h = ground[gIdx(x + dx, z + dz)]; lo = Math.min(lo, h); hi = Math.max(hi, h); if (wetAt(x + dx, z + dz)) wet++; }
    return hi - lo + wet * 4;
  };
  const placed = [];
  for (const s of settlements) {
    s.radius = s.ask ? Math.max(s.askR || 0, TOWN_RADIUS[s.kind] || 50) : TOWN_RADIUS[s.kind] || 50;
    // E's asks are spots E chose (flat, off roads, >= r + 70 from edges): keep them where asked, nudging at most 48 m
    const keepOff = s.hub && !s.ask ? s.radius + 200 : s.radius + LEVEL_EASE + 30;
    const ok = (x, z) => x >= keepOff && z >= keepOff && x <= ZM - keepOff && z <= ZM - keepOff
      && placed.every(p => Math.hypot(p.x - x, p.z - z) >= p.radius + s.radius + LEVEL_EASE * 2);
    let best = null, bestS = Infinity;
    const reach = s.ask ? (ok(s.x, s.z) ? 0 : 48) : s.hub ? 480 : 320;
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
    // meet the road at the road's own graded height (a spur ended up to 6 m off it, a step at the junction)
    const miss = best[2] - pts[n][2];
    pts.forEach((p, k) => { p[2] += miss * smoothstep(0, 1, k / n); });
    roads.push({ id: `spur_${slug(s.name)}`, cls: 'trail', width: 3.5, pts, spur: true });
  }
  // 4a. set-piece lanes (play-test 2, Q18): authored farm lanes, graded like a spur, so a crossroads (and the inn at it)
  // and the farm gates have real roads. A lane that `joins` a town starts in it and becomes one of its high streets.
  const SPECS = specsFor(id, { authored: SET_PIECES, places: PL ? { setPieces: PL.setPieces, lanes: PL.lanes } : null });
  const lanes = SPECS.lanes.length ? layLanes({ lanes: SPECS.lanes, roads, ground, gIdx, ZM, edge: SPUR_EDGE }) : [];
  roads.push(...lanes);
  // grade: ease the ground toward the road's height across its width + a shoulder (never inside a town)
  const inTown = (x, z, extra = 0) => placed.some(s => Math.hypot(s.x - x, s.z - z) < s.radius + extra);
  const roadMask = new Uint8Array(NG);
  for (const r of roads) {
    const half = r.width / 2, shoulder = 4, reach = half + shoulder;
    const xs = r.pts.map(p => p[0]), zs = r.pts.map(p => p[1]);
    const i0 = Math.max(0, Math.floor((Math.min(...xs) - reach) / STEP) + AP), i1 = Math.min(G - 1, Math.ceil((Math.max(...xs) + reach) / STEP) + AP);
    const j0 = Math.max(0, Math.floor((Math.min(...zs) - reach) / STEP) + AP), j1 = Math.min(G - 1, Math.ceil((Math.max(...zs) + reach) / STEP) + AP);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = (i - AP) * STEP, z = (j - AP) * STEP;
      if (inTown(x, z, -2)) continue;
      const [d, k, t] = polyDist(r.pts, x, z);
      if (d > reach) continue;
      const a = r.pts[k], b = r.pts[k + 1], h = a[2] + (b[2] - a[2]) * t;
      const kk = j * G + i, w = d <= half ? 0.9 : 0.9 * (1 - smoothstep(0, 1, (d - half) / shoulder));
      ground[kk] += (h - ground[kk]) * w;
      if (d <= half) roadMask[kk] = 1;
    }
  }

  // 4b. theme terrain (data/world/zone-themes.json): the water E's archetype needs, off towns and roads, inside the edges
  const cliff = THEMES[id]?.cliff ? cutCliff({ G, AP, STEP, ZM, ground, roads, polyDist }, THEMES[id].cliff) : null;
  const theme = THEMES[id]?.theme ? carveTheme({ id, theme: THEMES[id], G, AP, STEP, ZM, ground, waterTop, waterKind, settlements: placed, roads, polyDist, hub: placed.find(s => s.hub) || placed[0] || null }) : null;

  // 5. level and plan each placed settlement (proctown — the one planner Farhold uses)
  const plans = [];
  for (const s of placed) {
    let sum = 0, n = 0;
    for (let dz = -s.radius; dz <= s.radius; dz += 4) for (let dx = -s.radius; dx <= s.radius; dx += 4) if (dx * dx + dz * dz <= s.radius ** 2) { sum += ground[gIdx(s.x + dx, s.z + dz)]; n++; }
    const mean = sum / n, R = s.radius;
    for (let j = AP; j < SIZE + AP; j++) for (let i = AP; i < SIZE + AP; i++) {
      const x = (i - AP) * STEP, z = (j - AP) * STEP, d = Math.hypot(x - s.x, z - s.z);
      if (d > R + LEVEL_EASE) continue;
      const k = j * G + i, w = d <= R ? 0.85 : 0.85 * (1 - smoothstep(0, 1, (d - R) / LEVEL_EASE));
      if (Number.isNaN(waterTop[k])) ground[k] += (mean + (ground[k] - mean) * 0.15 - ground[k]) * w;
    }
    const size = TOWN_SIZE[s.kind] || 2, tx = s.x, tz = s.z;
    const culture = cultureFor({ race: province?.race || 'human', biome: zone.biomes ? Object.keys(zone.biomes)[0] : '' });
    const linksAt = radius => roads.filter(r => !r.spur || r.id === `spur_${slug(s.name)}` || r.joins === s.name).flatMap(r => ringCrossings(r.pts, tx, tz, radius)).map(([x, z]) => [x, z]);
    const plan = planTown({
      seed: (hashStr(id + ':' + (s.wfName || s.name)) >>> 0) % 100000, size, culture,   // a renamed town keeps its plan
      heightAt: (x, z) => ground[gIdx(tx + x, tz + z)],
      buildable: (x, z) => !wetAt(tx + x, tz + z),
      linksAt,
      // play-test 2 (Q10): every townsperson who serves gets their own building, round the square (opt-in proctown option)
      ...(OFFICES?.byKind?.[s.kind] ? { trades: { list: OFFICES.byKind[s.kind], share: OFFICES.share?.[s.kind] ?? 0.5, pick: 'square' } } : {}),
    });
    plan.origin = { x: tx, z: tz }; plan.town = s; plan.culture = culture;
    // the town circle must hold the plan: grow the radius to the plan's own wall/ring + a margin
    const need = (plan.wallRadius || footprintOf(size).ring) + 8;
    if (need > s.radius) s.radius = Math.ceil(need);
    plans.push(plan);
  }

  // 5b. set pieces (play-test 2, Q18): fitted to the ground and the ground prepared, BEFORE the rivers are carved (a river
  // still owns its bed). tools/lib/zone-setpieces.mjs; data/world/set-pieces.json + stream E's places `setPieces`.
  const riversNear = W.rivers.filter(r => !(r.bbox[2] < ox - 200 || r.bbox[0] > ox + ZM + 200 || r.bbox[3] < oz - 200 || r.bbox[1] > oz + ZM + 200)).map(r => ({ id: r.id, pts: r.pts.map(([x, z, h, c]) => [x - ox, z - oz, h, c]) }));
  const pinDiscs = Object.entries(SITE_PINS[id] || {}).map(([k, p]) => ({ x: p.x, z: p.z, r: k.startsWith('door') ? 30 : k === 'world_grimtallow' ? 110 : 50 }));
  const SP = resolveSetPieces({ id, ZM, STEP, G, AP, ground, gIdx, waterTop, roadMask, rivers: riversNear, roads, plans, specs: SPECS, pins: pinDiscs,
    riverReach: cls => RIVER_WIDTH[cls] / 2 + 10 + cls * 6 + 4 });
  const pieces = SP.pieces;
  // stream E's own set pieces (data/vignettes/setpieces.json, placed in data/vignettes/placements/<zone>.json): level + paint
  let vignettes = [];
  try { vignettes = JSON.parse(readFileSync(join(HERE, '..', 'data', 'vignettes', 'placements', `${id}.json`), 'utf8')).placements || []; } catch { /* E has not placed this zone yet */ }
  const ePieces = prepareEPieces({ ground, gIdx, waterTop, roadMask, ZM }, vignettes, E_SETPIECES, pieces, SP.log);

  // 6. rivers: the world bake's polylines (surfaces fixed there), carved where they come near.
  // Play-test 1 (P21): the cross-section is ONE continuous profile of the distance to the NEAREST river line, applied
  // once per sample (it used to be applied per segment with min(), which only ever lowered ground, so a river running
  // above its floodplain had banks lower than its own water and the sheet hung over dry ground):
  //   d ≤ half        channel: surface − (depth + 0.3) · (1 − (d/half)²)  → exactly the surface at the edge (d = half)
  //   half … +BANK    bank:    rises to surface + BANK_LIP (raised where the land was low, cut where it was high)
  //   … reach         eases back to the land
  // So the waterline is the curve d = half — the shoreline follows the river's smooth line, not the 2 m grid.
  const BANK = 3, BANK_LIP = 0.4;
  const riversUsed = [];
  const nOver = new Float32Array(NG).fill(Infinity), nD = new Float32Array(NG), nSurf = new Float32Array(NG), nCls = new Uint8Array(NG);
  for (const r of W.rivers) {
    const rx0 = ox - AP * STEP - 80, rz0 = oz - AP * STEP - 80, rx1 = ox + ZM + AP * STEP + 80, rz1 = oz + ZM + AP * STEP + 80;
    if (r.bbox[2] < rx0 || r.bbox[0] > rx1 || r.bbox[3] < rz0 || r.bbox[1] > rz1) continue;
    const pts = r.pts; let used = false;
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k], b = pts[k + 1], cls = Math.max(a[3], b[3]);
      if (Math.max(a[0], b[0]) < rx0 || Math.min(a[0], b[0]) > rx1 || Math.max(a[1], b[1]) < rz0 || Math.min(a[1], b[1]) > rz1) continue;
      used = true;
      const half = RIVER_WIDTH[cls] / 2, reach = half + 10 + cls * 6;
      const i0 = Math.max(0, Math.floor((Math.min(a[0], b[0]) - reach - ox) / STEP) + AP), i1 = Math.min(G - 1, Math.ceil((Math.max(a[0], b[0]) + reach - ox) / STEP) + AP);
      const j0 = Math.max(0, Math.floor((Math.min(a[1], b[1]) - reach - oz) / STEP) + AP), j1 = Math.min(G - 1, Math.ceil((Math.max(a[1], b[1]) + reach - oz) / STEP) + AP);
      const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const wx = wxOf(i), wz = wzOf(j);
        const t = clamp(((wx - a[0]) * dx + (wz - a[1]) * dz) / L2, 0, 1);
        const d = Math.hypot(wx - (a[0] + dx * t), wz - (a[1] + dz * t));
        if (d > reach) continue;
        const k2 = j * G + i, over = d - half;
        if (over < nOver[k2]) { nOver[k2] = over; nD[k2] = d; nSurf[k2] = a[2] + (b[2] - a[2]) * t; nCls[k2] = cls; }
      }
    }
    if (used) riversUsed.push({ id: r.id, name: r.name });
  }
  for (let k2 = 0; k2 < NG; k2++) {
    if (nOver[k2] === Infinity) continue;
    const cls = nCls[k2], half = RIVER_WIDTH[cls] / 2, reach = half + 10 + cls * 6, d = nD[k2], surface = nSurf[k2];
    if (d <= half) {
      const depth = (RIVER_DEPTH[cls] + 0.3) * (1 - (d / half) ** 2);
      // the river owns its bed: a town levelled below the river's surface (or any hollow) no longer leaves a 1.7 m
      // hole in a stream that should be wadeable; where a lake or the sea is already here, only ever deepen
      ground[k2] = Number.isNaN(waterTop[k2]) ? surface - depth : Math.min(ground[k2], surface - depth);
      if (!(waterTop[k2] >= surface)) { waterTop[k2] = Number.isNaN(waterTop[k2]) ? surface : Math.max(waterTop[k2], surface); if (waterKind[k2] !== 1) waterKind[k2] = 3; }
    } else if (Number.isNaN(waterTop[k2]) || waterTop[k2] <= ground[k2]) {
      const lip = surface + BANK_LIP * smoothstep(0, 1, (d - half) / BANK);
      const tt = smoothstep(0, 1, (d - half - BANK) / (reach - half - BANK));
      ground[k2] = lip + (ground[k2] - lip) * tt;
    }
  }

  // 6b. bridges: every world bridge whose deck or approaches reach this zone (+ crossings on this zone's own spurs).
  // The road is graded to EXACTLY the deck height at both abutments and eased back to the road over `ramp` metres,
  // so the deck meets the road at both ends (play-test 1, P24: one deck floated metres above a road the river carve
  // had cut down, and spurs crossed rivers with no bridge at all). World-pure for world bridges (edges still agree).
  const bridgesHere = [];
  {
    const lo = -AP * STEP - 4, hi = ZM + AP * STEP + 4;
    // a world road is not drawn inside a town (the town's streets carry it), so neither is its bridge
    const inPlaced = (x, z) => placed.some(s => Math.hypot(s.x - x, s.z - z) < s.radius + 4);
    for (const wb of W.bridges) {
      const road = roads.find(r => r.worldId === wb.road); if (!road) continue;
      if (inPlaced(wb.x - ox, wb.z - oz)) continue;
      const reach = wb.ramp + wb.width + 6;
      const ax = wb.a[0] - ox, az = wb.a[1] - oz, bx = wb.b[0] - ox, bz = wb.b[1] - oz;
      if (Math.max(ax, bx) + reach < lo || Math.min(ax, bx) - reach > hi || Math.max(az, bz) + reach < lo || Math.min(az, bz) - reach > hi) continue;
      const loc = p => ({ ...p, x: p.x - ox, z: p.z - oz, a: [p.a[0] - ox, p.a[1] - oz], b: [p.b[0] - ox, p.b[1] - oz] });
      bridgesHere.push({ ...wb, id: null, x: wb.x - ox, z: wb.z - oz, a: [ax, az], b: [bx, bz], pieces: wb.pieces?.map(loc), pts: road.pts, roadId: road.id });
    }
    const riversLocal = W.rivers.map(r => ({ id: r.id, bbox: [r.bbox[0] - ox, r.bbox[1] - oz, r.bbox[2] - ox, r.bbox[3] - oz], pts: r.pts.map(([x, z, h, c]) => [x - ox, z - oz, h, c]) }));
    // zone-local lines (always well inside the zone): spur roads, and the streets of every town a river runs through
    const local = [...roads.filter(r => r.spur).map(r => ({ id: r.id, pts: r.pts, width: r.width })),
      ...plans.flatMap(pl => pl.streets.map((st, i) => ({ id: `${slug(pl.town.name)}_street_${i}`, street: true, width: st.width, pts: st.pts.map(([x, z]) => [pl.origin.x + x, pl.origin.z + z, 0]) })))];
    for (const r of local) {
      let len = 0; for (let k = 1; k < r.pts.length; k++) len += Math.hypot(r.pts[k][0] - r.pts[k - 1][0], r.pts[k][1] - r.pts[k - 1][1]);
      for (const c of crossingsOf(r.pts, riversLocal)) {
        // a street that runs INTO the water and stops gets no bridge to nowhere (class 1 is wadeable); a spur is not
        // drawn inside a town, so a spur crossing inside one is the town streets' business
        if (c.s0 - DECK_LAND < 0.5 || c.s1 + DECK_LAND > len - 0.5) continue;
        const b = bridgeFor(r.pts, c, r.width);
        if (!r.street && inPlaced(b.x, b.z)) continue;
        // share a deck height with any bridge whose approaches overlap this one's (the world's wins: it is fixed)
        for (const o of bridgesHere) {
          const gap = Math.min(...[o.a, o.b].flatMap(e => [b.a, b.b].map(f => Math.hypot(e[0] - f[0], e[1] - f[1]))));
          if (gap < o.ramp + b.ramp + 10) b.deck = o.deck;
        }
        if (bridgesHere.some(o => Math.hypot(o.x - b.x, o.z - b.z) < 14)) continue;
        bridgesHere.push({ road: r.id, ...b, pts: r.pts, roadId: r.id, spur: true, ...(r.street ? { street: true } : {}) });
      }
    }
    for (const br of bridgesHere) gradeBridge(br);
  }
  function gradeBridge(br) {
    // the road polyline near the bridge, with arc lengths
    const cum = [0]; for (let k = 1; k < br.pts.length; k++) cum.push(cum[k - 1] + Math.hypot(br.pts[k][0] - br.pts[k - 1][0], br.pts[k][1] - br.pts[k - 1][1]));
    const sLo = br.s0 - br.ramp - 12, sHi = br.s1 + br.ramp + 12;
    let k0 = 0; while (k0 < br.pts.length - 2 && cum[k0 + 1] < sLo) k0++;
    let k1 = br.pts.length - 1; while (k1 > 1 && cum[k1 - 1] > sHi) k1--;
    const pts = br.pts.slice(k0, k1 + 1), c0 = cum[k0];
    const half = br.width / 2, shoulder = 4, reach = half + shoulder, flat = 1.5, IN_DECK = 2.5;
    const xs = pts.map(p => p[0]), zs = pts.map(p => p[1]);
    const i0 = Math.max(0, Math.floor((Math.min(...xs) - reach) / STEP) + AP), i1 = Math.min(G - 1, Math.ceil((Math.max(...xs) + reach) / STEP) + AP);
    const j0 = Math.max(0, Math.floor((Math.min(...zs) - reach) / STEP) + AP), j1 = Math.min(G - 1, Math.ceil((Math.max(...zs) + reach) / STEP) + AP);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = (i - AP) * STEP, z = (j - AP) * STEP, kk = j * G + i;
      if (waterTop[kk] > ground[kk]) continue;                      // never dam the channel
      const [d, k, t] = polyDist(pts, x, z);
      if (d > reach) continue;
      const s = cum[k0 + k] + t * (cum[k0 + k + 1] - cum[k0 + k]);
      // out = metres outside the deck along the road (negative = under it). The abutment block runs IN_DECK metres in
      // under the deck so the triangles at the abutment are all at deck height (no lip where the deck lands)
      const out = s <= (br.s0 + br.s1) / 2 ? br.s0 - s : s - br.s1;
      if (out < -IN_DECK || out > br.ramp) continue;                // under the deck middle: leave the banks alone
      const wa = 1 - smoothstep(0, 1, Math.max(0, out - flat) / (br.ramp - flat));
      const wl = d <= half ? 1 : 1 - smoothstep(0, 1, (d - half) / shoulder);
      const target = out < 0 ? br.deck - 0.05 : br.deck;           // under the deck the block sits just below it
      ground[kk] += (target - ground[kk]) * wa * wl;
      if (d <= half) roadMask[kk] = 1;
    }
  }

  // 6c. mill ponds (set pieces): small lakes dug after the rivers and bridges, before the skirt buries their edges
  carvePonds({ ground, waterTop, waterKind, gIdx, roadMask }, pieces);

  // 7. the wet skirt (P21): one ring of water surface laid past every wet edge, 8-connected (the old 4-connected ring
  // left the corner triangles out, so the sheet stopped in 2 m steps short of the bank), and the ground under every
  // skirt sample raised to at least surface + SKIRT_BURY. The sheet's edge is then always under the ground, the
  // visible shoreline is the bank meeting the flat water (the curve d = half of step 6), and the skirt itself never
  // makes new visible water. waterAt() reads the same layer (dry where ground ≥ surface), so drawn = measured;
  // tests/B/water-edge.test.js checks every sheet edge in every zone is buried.
  {
    const add = [];
    for (let j = 1; j < G - 1; j++) for (let i = 1; i < G - 1; i++) {
      const k = j * G + i; if (!Number.isNaN(waterTop[k])) continue;
      let sum = 0, c = 0, kind = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const n = k + dj * G + di; if (n === k || Number.isNaN(waterTop[n])) continue;
        sum += waterTop[n]; c++; if (waterKind[n] > kind) kind = waterKind[n];
      }
      if (c) add.push(k, sum / c, kind);
    }
    for (let q = 0; q < add.length; q += 3) {
      const k = add[q], surface = add[q + 1];
      waterTop[k] = surface; waterKind[k] = add[q + 2];
      if (ground[k] < surface + SKIRT_BURY) ground[k] = surface + SKIRT_BURY;
    }
  }

  // 8. surface: warped macro biome, water and rock overrides, then roads and town streets painted on
  const N = SIZE * SIZE, biome = new Uint8Array(N);
  const BEACH = 4, MOUNTAINS = 17, LAKE = 3, COAST = 2, MARSH = 15;
  const FEN_NOISE = makeNoise2D(hashStr('fen:' + id));
  for (let j = 0; j < SIZE; j++) for (let i = 0; i < SIZE; i++) {
    const gi = i + AP, gj = j + AP, k = gj * G + gi;
    let b = m.biome[ref.warpedIndex(wxOf(gi), wzOf(gj))];
    if (waterKind[k] && waterTop[k] > ground[k]) b = waterKind[k] === 1 ? COAST : LAKE;
    else if (b < 4 || b === 25) b = BEACH;
    else if (theme && !roadMask[k] && theme.beach.some(bb => shoreDistance(bb.lake, i * STEP, j * STEP) < bb.band)) b = BEACH;
    else if (theme?.fen && !roadMask[k] && inFen(theme.fen, i * STEP, j * STEP, FEN_NOISE)) b = MARSH;
    else if (roadMask[k]) b = ROAD_SURFACE_ID;
    else { const s = Math.hypot(ground[k + 1] - ground[k - 1], ground[k + G] - ground[k - G]) / (2 * STEP); if (s > 0.9 && b !== 18) b = MOUNTAINS; }
    biome[j * SIZE + i] = b;
  }
  paintSetPieces({ biome, SIZE, STEP, surfaceId: key => BIOMES.length + SET_SURFACES.findIndex(s => s[0] === key), isProtected: o => biome[o] === LAKE || biome[o] === COAST || biome[o] === ROAD_SURFACE_ID }, pieces, ePieces);
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
    const k = (j + AP) * G + i + AP, o = j * SIZE + i;
    height[o] = q(ground[k]); wTop[o] = Number.isNaN(waterTop[k]) ? 0 : q(waterTop[k]); wKind[o] = wTop[o] ? waterKind[k] : 0;
  }

  const metaSites = sites.map(s => { const o = { ...s }; delete o.size; delete o.nodeId; return o; });
  const meta = {
    name: hub ? `${hub.name} (${id})` : id, zone: id, sheet: sheetIdFor(id), province: province ? { id: province.id, name: province.name } : null,
    size: SIZE, step: STEP, origin: { x: 0, z: 0 }, heightMin: hMin, heightMax: hMax,
    bakeVersion: ZONE_BAKE_VERSION, inputHash: null,
    biomes: [...BIOMES.map(b => [b.key, b.name, b.color]), ...SET_SURFACES, ['road', 'Road', '#b39a6e']], waterKinds: ['none', 'sea', 'lake', 'river'],
    source: { tool: 'tools/bake-zone.mjs', world: { seed: W.seed, width: W.width, height: W.height, method: W.method, seaLevel: W.seaLevel, inputHash: W.inputHash }, zone: { zx: zone.zx, zy: zone.zy }, worldOrigin: { x: ox, z: oz }, zoneMetres: ZM },
    rivers: riversUsed, sites: metaSites, spawn: null,
    // decks the reader stands walkers on (terrain-read deckAt): every bridge whose deck touches this zone
    bridges: bridgesHere.flatMap(b => (b.pieces || [b]).map(p => ({ a: [r2(p.a[0]), r2(p.a[1])], b: [r2(p.b[0]), r2(p.b[1])], h: b.deck, w: p.width })))
      .filter(d => Math.max(d.a[0], d.b[0]) > -d.w && Math.min(d.a[0], d.b[0]) < ZM + d.w && Math.max(d.a[1], d.b[1]) > -d.w && Math.min(d.a[1], d.b[1]) < ZM + d.w),
    ...(cliff ? { cliff } : {}),
    ...(theme ? { theme: { kind: THEMES[id].theme, lakes: theme.lakes.map(l => ({ name: l.name, kind: l.kind, x: l.x, z: l.z, r: l.r, level: l.level })), fen: theme.fen } } : {}),
  };
  meta.inputHash = (hashStr(JSON.stringify({ id, w: W.inputHash, ZONE_BAKE_VERSION, FORMAT_VERSION, hub: opts.hub || null })) >>> 0).toString(16).padStart(8, '0');
  const terrain = createTerrain({ meta, height, waterTop: wTop, waterKind: wKind, biome });

  // 10. sites other streams use (door, event/camp arenas) — clear of towns, roads and E's vignettes
  const avoid = vignettes.map(v => ({ x: v.x, z: v.z, r: v.radius || 12 }));
  const pieceDiscs = pieces.filter(p => p.kind !== 'belt').map(p => ({ x: p.x, z: p.z, r: p.r + 6 })).concat(pieces.flatMap(p => (p.kind === 'belt' ? p.fields : []).map(f => ({ x: f.R.cx, z: f.R.cz, r: Math.hypot(f.R.w, f.R.d) / 2 + 4 }))));
  addZoneSites(terrain, meta.sites, { asks: asksFor(id, meta.sites, W), avoid: [...avoid, ...pieceDiscs], doorName: 'Barrow entrance', town: meta.sites.find(s => s.hub), pins: SITE_PINS[id] || {} });
  const hubSite = meta.sites.find(s => s.hub);
  meta.spawn = hubSite ? spawnNear(terrain, hubSite) : { x: 1024, z: 1024 };

  // 11. bridges from the world bake (zone-local copies), placements, scatter, nav
  const bridges = bridgesHere.filter(b => b.x >= 0 && b.x < ZM && b.z >= 0 && b.z < ZM).map((b, i) => ({ ...b, pts: undefined, id: `bridge_${String(b.road).replace(/^spur_/, 's_')}_${b.river}_${i}` }));
  // footpaths (P19): every door, arena and E fort/farm/cave/waystone gets a trail to the road network — painted, not graded
  const keepOff = setPieceKeepOff(pieces);
  const paths = layPaths({ t: terrain, biome, SIZE, STEP, ZM, roadId: ROAD_SURFACE_ID, sites: meta.sites, vignettes, plans,
    blocked: keepOff, extraStarts: pieces.filter(p => p.pathFrom).map(p => ({ id: p.id, x: p.pathFrom.x, z: p.pathFrom.z, r: p.pathFrom.r || 0 })) });
  const placements = [...placementsFor(meta, plans, roads, bridges, paths), ...setPiecePlacements(pieces, { groundAt: terrain.groundAt, culture: plans[0]?.culture || 'human' })];
  const keepClear = [
    ...placed.map(s => ({ x: s.x, z: s.z, r: s.radius + 6 })),
    ...meta.sites.filter(s => s.type === 'dungeon').map(s => ({ x: s.x, z: s.z, r: 14 })),
    ...meta.sites.filter(s => s.type === 'event' || s.type === 'camp').map(s => ({ x: s.x, z: s.z, r: s.r })),
    ...avoid,
  ];
  const scatter = scatterFor(W, zone, terrain, biome, keepClear, keepOff);
  const roadAtSample = (x, z) => biome[clamp(Math.round(z / STEP), 0, SIZE - 1) * SIZE + clamp(Math.round(x / STEP), 0, SIZE - 1)] === ROAD_SURFACE_ID;
  scatter.push(...setPieceScatter(pieces, { isWet: (x, z) => terrain.waterAt(x, z).kind !== 'none', onRoad: roadAtSample }));
  // decks for every world bridge whose span reaches into this zone (one on the edge is stamped by both zones)
  const decks = meta.bridges;
  // (stream E's own set-piece buildings are NOT stamped: E places its NPCs and checks its discs against nav, and its own
  // hut must not read as 'town ground' to its own placer — E's vignette collision is E's/A's, like every vignette prop)
  const pieceNav = setPieceNav(pieces);
  const nav = navFor(terrain, biome, scatter, plans, decks, pieceNav);
  return { meta, height, waterTop: wTop, waterKind: wKind, biome, terrain, plans, townPlan: plans.find(p => p.town.hub) || null, placements, roads, bridges, paths, scatter, nav, vignettesUsed: vignettes.length, pieces, ePieces, pieceLog: SP.log };
}

// ---------------------------------------------------------------------------------------------- scatter
/** Per-biome density per 6 m cell (36 m²): [kind index, probability]. Trees clump by a grove noise. */
const SCATTER_TABLE = {
  // P19 (play-test 1, "occasional rock/bush"): open country carries about twice the cover it did — copses (trees are
  // still clumped by the grove noise), bushes, stones and the odd big rock — while forests stay as dense as they were
  grassland: [[0, 0.024], [4, 0.05], [5, 0.018], [6, 0.003]],
  temperateForest: [[0, 0.30], [4, 0.08], [5, 0.012], [6, 0.004]],
  borealForest: [[1, 0.32], [4, 0.03], [5, 0.015], [6, 0.006]],
  rainforest: [[0, 0.36], [4, 0.16]],
  savanna: [[2, 0.032], [4, 0.06], [5, 0.016], [6, 0.003]],
  shrubland: [[4, 0.13], [5, 0.022], [2, 0.01], [6, 0.003]],
  marsh: [[8, 0.16], [3, 0.012], [4, 0.02]],
  hills: [[1, 0.065], [5, 0.04], [6, 0.02], [7, 0.005], [4, 0.05]],
  mountains: [[5, 0.05], [6, 0.03], [7, 0.012], [1, 0.02]],
  snowyPeaks: [[6, 0.02], [7, 0.01]],
  tundra: [[5, 0.03], [4, 0.02], [6, 0.006]],
  desert: [[5, 0.018], [6, 0.008], [3, 0.003]],
  badlands: [[5, 0.04], [6, 0.02], [7, 0.008], [3, 0.006]],
  beach: [[5, 0.015], [4, 0.008]],
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

function scatterFor(W, zone, t, biome, keepClear, keepOff = () => false) {
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
    if (keepClear.some(c => Math.hypot(c.x - x, c.z - z) < c.r) || keepOff(x, z)) continue;
    // keep a clear verge beside roads/streets (2 m round the trunk)
    let verge = false;
    for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) { const ii = clamp(i + dx / 2, 0, SIZE - 1), jj = clamp(j + dz / 2, 0, SIZE - 1); if (biome[jj * SIZE + ii] === t.biomes.length - 1) verge = true; }
    if (verge) continue;
    items.push({ x, z, kind, scale: 0.7 + h01(cx, cz, 4) * (kind === 7 ? 1.3 : 0.9), yaw: h01(cx, cz, 5) * Math.PI * 2, variant: Math.floor(h01(cx, cz, 6) * 4) });
  }
  return items;
}

// ---------------------------------------------------------------------------------------------- nav
function navFor(t, biome, scatter, plans, decks = [], extra = { buildings: [], walls: [] }) {
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
  // bridge decks: a road-wide strip along the road, long enough to land on both banks even when the road crosses
  // the channel at a slant (span x 1.6 + 2 x 10 m). Before this, every bridge read as DEEP water and a river cut
  // the province in two for anything that walks by nav (found by tests/B/zone-reach.test.js).
  // (since play-test 1 the deck is exact: abutment a to abutment b, the reader's deckAt strip, + one sample)
  for (const d of decks) {
    const cx = (d.a[0] + d.b[0]) / 2, cz = (d.a[1] + d.b[1]) / 2, L = Math.hypot(d.b[0] - d.a[0], d.b[1] - d.a[1]) || 1;
    const ux = (d.b[0] - d.a[0]) / L, uz = (d.b[1] - d.a[1]) / L, half = L / 2 + STEP, hw = d.w / 2 + STEP * 0.5, r = Math.hypot(half, hw);
    for (let j = Math.max(0, Math.floor((cz - r) / STEP)); j <= Math.min(SIZE - 1, Math.ceil((cz + r) / STEP)); j++)
      for (let i = Math.max(0, Math.floor((cx - r) / STEP)); i <= Math.min(SIZE - 1, Math.ceil((cx + r) / STEP)); i++) {
        const dx = i * STEP - cx, dz = j * STEP - cz, along = dx * ux + dz * uz, across = dx * uz - dz * ux;
        if (Math.abs(along) <= half && Math.abs(across) <= hw) { const o = j * SIZE + i; bits[o] = (bits[o] & ~(NAV.DEEP | NAV.SHALLOW | NAV.STEEP | NAV.SOLID)) | NAV.WALK | NAV.ROAD; }
      }
  }
  // set pieces: buildings (BUILDING over the rotated footprint) and stone walls (SOLID, one sample wide, gates left open)
  for (const R of extra.buildings) {
    const c = Math.cos(R.a), s = Math.sin(R.a), r = Math.hypot(R.w, R.d) / 2;
    for (let j = Math.max(0, Math.floor((R.cz - r) / STEP)); j <= Math.min(SIZE - 1, Math.ceil((R.cz + r) / STEP)); j++)
      for (let i = Math.max(0, Math.floor((R.cx - r) / STEP)); i <= Math.min(SIZE - 1, Math.ceil((R.cx + r) / STEP)); i++) {
        const dx = i * STEP - R.cx, dz = j * STEP - R.cz, lx = dx * c + dz * s, lz = -dx * s + dz * c;
        if (Math.abs(lx) <= R.w / 2 && Math.abs(lz) <= R.d / 2) bits[j * SIZE + i] |= NAV.BUILDING;
      }
  }
  for (const pts of extra.walls) for (let q = 0; q < pts.length - 1; q++) {
    const a = pts[q], b = pts[q + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const e0 = pts[0], e1 = pts[pts.length - 1];
    for (let u = 0; u <= L; u += 0.5) {
      const x = a[0] + (b[0] - a[0]) * u / L, z = a[1] + (b[1] - a[1]) * u / L, i = Math.round(x / STEP), j = Math.round(z / STEP);
      // the two gate posts are the line's ends: leave the sample nearest each post open so the gate stays a gate in nav
      if (Math.min(Math.hypot(i * STEP - e0[0], j * STEP - e0[1]), Math.hypot(i * STEP - e1[0], j * STEP - e1[1])) < 1.5) continue;
      if (i >= 0 && j >= 0 && i < SIZE && j < SIZE) bits[j * SIZE + i] |= NAV.SOLID;
    }
  }
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
export function placementsFor(meta, plans, roads = [], bridges = [], paths = []) {
  const out = [];
  for (const s of meta.sites) {
    if (s.type === 'settlement') out.push({ kind: 'settlement', id: slug(s.name), x: r2(s.x), z: r2(s.z), yaw: 0, data: { kind: s.kind, name: s.name, radius: s.radius ?? TOWN_RADIUS[s.kind] ?? 40, hub: !!s.hub, planned: !s.unplanned, ...(s.wfName ? { wfName: s.wfName } : {}), ...(s.ask ? { ask: true } : {}) } });
    else if (s.type === 'dungeon') out.push({ kind: 'dungeon_door', id: s.id, x: s.x, z: s.z, yaw: s.yaw, data: { name: s.name } });
    else if (s.type === 'event' || s.type === 'camp') out.push({ kind: s.type + '_site', id: s.id, x: s.x, z: s.z, yaw: 0, data: { r: s.r } });
    else out.push({ kind: s.type, id: slug(s.name || s.kind), x: r2(s.x), z: r2(s.z), yaw: 0, data: { kind: s.kind, name: s.name } });
  }
  (meta.theme?.lakes || []).forEach((l, i) => out.push({ kind: 'lake', id: l.name ? slug(l.name) : `pool_${i}`, x: l.x, z: l.z, yaw: 0, data: { r: l.r, level: l.level, kind: l.kind, name: l.name } }));
  if (meta.theme?.fen) out.push({ kind: 'fen', id: 'fen', x: meta.theme.fen.x, z: meta.theme.fen.z, yaw: 0, data: { r: meta.theme.fen.r } });
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
        data: { town, want: p.want, district: p.district, w: r2(p.w), d: r2(p.d), angle: +p.angle.toFixed(4), front: +face.toFixed(4), streetGap: r2(gap),
          ...(p.office ? { office: p.want, role: OFFICE_ROLE[p.want] || null, lit: !!OFFICES?.offices?.[p.want]?.lit, label: OFFICES?.offices?.[p.want]?.label || null } : {}) },
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
      out.push({ kind: 'road', id: all.length > 1 ? `${r.id}_${n}` : r.id, x: pts[0][0], z: pts[0][1], yaw: 0, data: { cls: r.cls, width: r.width, spur: !!r.spur, ...(r.lane ? { lane: true, name: r.name || null, to: r.to || null } : {}), pts } });
    });
  }
  // a bridge: a straight flat deck from abutment a to abutment b (both [x, z, h], h = deck), `width` wide, centred on
  // (x, z), yaw = a→b; the road is graded to the deck height at a and b. terrain meta.bridges carries the same decks.
  // a footpath (tools/lib/zone-paths.mjs): painted trail from a place to the road network; NOT graded (follows the ground)
  for (const p of paths) out.push({ kind: 'path', id: p.id, x: p.pts[0][0], z: p.pts[0][1], yaw: 0, data: { from: p.from, to: p.to, width: p.width, pts: p.pts } });
  // A bridge that bends is several straight pieces (data.part = [i, n]) sharing ends, all at the same deck height.
  for (const b of bridges) {
    const pieces = b.pieces || [b];
    pieces.forEach((p, i) => out.push({ kind: 'bridge', id: pieces.length > 1 ? `${b.id}_p${i}` : b.id, x: r2(p.x), z: r2(p.z), yaw: p.yaw, data: {
      span: r2(Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1])), deck: b.deck, width: p.width, a: [r2(p.a[0]), r2(p.a[1]), b.deck], b: [r2(p.b[0]), r2(p.b[1]), b.deck],
      road: b.spur ? b.road : `road_${b.road}`, ...(b.street ? { street: true } : {}), river: b.river, cls: b.cls, surface: b.surface, ramp: b.ramp, ...(pieces.length > 1 ? { part: [i, pieces.length], bridge: b.id } : {}),
    } }));
  }
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
    roads: b.roads.length, bridges: b.bridges.length, paths: b.paths.length, pathMetres: Math.round(b.paths.reduce((s, p) => s + p.pts.reduce((a, q, k) => a + (k ? Math.hypot(q[0] - p.pts[k - 1][0], q[1] - p.pts[k - 1][1]) : 0), 0), 0)), scatter: b.scatter.length, scatterKinds: kinds,
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
    const stale = Object.entries(files).filter(([f, v]) => !existsSync(join(dir, f)) || !sameLayerFile(f, readFileSync(join(dir, f)), v)).map(([f]) => f);
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
