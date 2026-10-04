#!/usr/bin/env node
// Thousandvale — ZONE bake v1 (stream B, PLAN §3.2.2).
//
//   node prototypes/thousandvale/tools/bake-zone.mjs z03_02     # one zone → data/zones/z03_02/
//   node prototypes/thousandvale/tools/bake-zone.mjs --m1       # the M1 zone (Torborhold's)
//   node prototypes/thousandvale/tools/bake-zone.mjs z03_02 --check
//
// Reads data/world/{world.json, macro.bin} (tools/bake-world.mjs) and writes
//   data/zones/<id>/terrain.bin    the terrain-read.js format (v1): 1025² samples at 2 m
//   data/zones/<id>/placements.json typed records {kind, id, x, z, yaw, data} — town plan, sites
//   data/zones/<id>/zone.json       readable meta + summary
//
// Edges agree by construction: heights, rivers, lakes, biomes and the u16 quantisation are pure
// functions of WORLD coordinates (tools/lib/world-core.mjs); per-sample neighbour work (rock on steep
// ground, the wet ring) runs on a grid with a one-sample apron so the edge sample sees the same
// neighbours in both zones. Zone-local work (moving and levelling the town) stays ≥ 200 m from
// every edge. tests/B/zone-bake.test.js bakes a neighbour and compares the shared edge bit for bit.
//
// Coordinates: zone metres, origin at the zone's north-west corner (x, z ∈ [0, 2048]);
// meta.source.worldOrigin is where that corner sits in world metres.

import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BIOMES } from '../../../worldgen/js/biomes.js';
import { hashStr, clamp, smoothstep } from '../../../worldgen/js/noise.js';
import { planTown, overlaps } from '../../../proctown/js/townplan.js';
import { FORMAT_VERSION, createTerrain } from '../js/rules/terrain-read.js';
import { encodeTerrain } from './bake-test-zone.mjs';
import { decodeMacro, makeRefiner, heightRange, RIVER_WIDTH, RIVER_DEPTH } from './lib/world-core.mjs';
import { addZoneSites, TOWN_RADIUS } from './lib/zone-sites.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORLD_DIR = join(HERE, '..', 'data', 'world');
const ZONES_DIR = join(HERE, '..', 'data', 'zones');
export const ZONE_BAKE_VERSION = 1;
export const M1_ZONE = 'z03_02';          // Torborhold's zone (world seed 1000)
const SIZE = 1025, STEP = 2;
/** Proctown size by settlement kind. */
const TOWN_SIZE = { hamlet: 1, village: 2, town: 3, city: 4, capital: 5 };
/** Sites other streams ask for, per zone. */
const ASKS = {
  z03_02: [
    { type: 'event', id: 'event_grandmother_skein', nearSite: 'Mawehaven', r: 40 },     // zone event boss (E)
    { type: 'camp', id: 'elite_hobb_gallowsby', nearSite: 'Bilpintet Ford', r: 25 },    // the elite's camp at a ford (E)
  ],
};
/** Which settlement is the zone's HUB town (the room that never copies). Default: the highest-ranked one. */
const HUB = { z03_02: 'Torborhold' };

let worldCache = null;
export function loadWorld() {
  if (!worldCache) {
    const json = JSON.parse(readFileSync(join(WORLD_DIR, 'world.json'), 'utf8'));
    const macro = decodeMacro(readFileSync(join(WORLD_DIR, 'macro.bin')));
    worldCache = { json, macro, ref: makeRefiner(macro) };
  }
  return worldCache;
}

/**
 * Bake one zone. opts.town = false skips the town move/level/plan (the edge test uses the full bake).
 */
export function bakeZone(id, opts = {}) {
  const { json: W, macro: m, ref } = loadWorld();
  const zone = W.zones.find(z => z.id === id);
  if (!zone) throw new Error('no zone ' + id);
  const ox = zone.origin.x, oz = zone.origin.z, ZM = W.grid.zoneMetres;
  const G = SIZE + 2, NG = G * G;                 // grid with a one-sample apron all round
  const wxOf = gi => ox + (gi - 1) * STEP, wzOf = gj => oz + (gj - 1) * STEP;

  // 1. base ground at world coordinates
  const ground = new Float32Array(NG);
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) ground[j * G + i] = ref.baseGround(wxOf(i), wzOf(j));

  // 2. sea and lakes (levels from the world bake)
  const waterTop = new Float32Array(NG).fill(NaN), waterKind = new Uint8Array(NG);
  const lakeLevel = new Map(); for (const l of W.lakes) for (const c of l.cells) lakeLevel.set(c, l.level);
  const M = m.macroMetres;
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    const k = j * G + i, wx = wxOf(i), wz = wzOf(j);
    const mi = clamp(Math.round(wz / M), 0, m.height - 1) * m.width + clamp(Math.round(wx / M), 0, m.width - 1);
    if (m.water[mi] === 1 || ground[k] < 0) { waterTop[k] = 0; waterKind[k] = 1; }
    else if (m.water[mi] === 2) { const lv = lakeLevel.get(mi) ?? 0; waterTop[k] = lv; waterKind[k] = 2; ground[k] = Math.min(ground[k], lv - 2.5); }
  }

  // 3. rivers: the world bake's polylines (surfaces already fixed), carved where they come near
  const x0 = ox - STEP - 80, z0 = oz - STEP - 80, x1 = ox + ZM + STEP + 80, z1 = oz + ZM + STEP + 80;
  const riversUsed = [];
  for (const r of W.rivers) {
    if (r.bbox[2] < x0 || r.bbox[0] > x1 || r.bbox[3] < z0 || r.bbox[1] > z1) continue;
    const pts = r.pts, segs = [];
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k], b = pts[k + 1];
      if (Math.max(a[0], b[0]) < x0 || Math.min(a[0], b[0]) > x1 || Math.max(a[1], b[1]) < z0 || Math.min(a[1], b[1]) > z1) continue;
      segs.push(k);
    }
    if (!segs.length) continue;
    riversUsed.push({ id: r.id, name: r.name });
    for (const k of segs) {
      const a = pts[k], b = pts[k + 1], cls = Math.max(a[3], b[3]);
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
        // a sample near two segments takes the deeper carve (order-independent: min/max only)
        if (d <= half) {
          const depth = RIVER_DEPTH[cls] * (1 - (d / half) ** 2) + 0.3;
          ground[k2] = Math.min(ground[k2], surface - depth);
          if (!(waterTop[k2] >= surface)) { waterTop[k2] = Number.isNaN(waterTop[k2]) ? surface : Math.max(waterTop[k2], surface); if (waterKind[k2] !== 1) waterKind[k2] = 3; }
        } else {
          const tt = smoothstep(0, 1, (d - half) / (reach - half));
          const lip = surface + 0.25;
          const target = Math.max(lip, ground[k2]);
          ground[k2] = Math.min(ground[k2], lip + (target - lip) * tt);
        }
      }
    }
  }

  // 4. the town: move it inward if it sits near an edge, level its ground, plan it with proctown
  const sitesWorld = W.nodes.filter(n => n.zone === id);
  const sites = sitesWorld.map(n => ({ type: n.type, kind: n.kind, name: n.name, size: n.size, x: n.x - ox, z: n.z - oz }));
  const rank = { capital: 0, city: 1, town: 2, village: 3, hamlet: 4 };
  const main = sites.find(s => s.type === 'settlement' && s.name === (opts.hub ?? HUB[id]))
    || sites.filter(s => s.type === 'settlement').sort((a, b) => (rank[a.kind] ?? 9) - (rank[b.kind] ?? 9) || (b.size || 0) - (a.size || 0))[0];
  if (main) main.hub = true;
  let townPlan = null;
  if (main && opts.town !== false) {
    main.radius = TOWN_RADIUS[main.kind] || 50;
    const keepOff = main.radius + 200;
    const H = (x, z) => ground[(clamp(Math.round(z / STEP), 0, SIZE - 1) + 1) * G + clamp(Math.round(x / STEP), 0, SIZE - 1) + 1];
    const W_ = (x, z) => !Number.isNaN(waterTop[(clamp(Math.round(z / STEP), 0, SIZE - 1) + 1) * G + clamp(Math.round(x / STEP), 0, SIZE - 1) + 1]);
    const roughness = (x, z, r) => { let lo = Infinity, hi = -Infinity, wet = 0; for (let dz = -r; dz <= r; dz += 8) for (let dx = -r; dx <= r; dx += 8) { if (dx * dx + dz * dz > r * r) continue; const h = H(x + dx, z + dz); lo = Math.min(lo, h); hi = Math.max(hi, h); if (W_(x + dx, z + dz)) wet++; } return hi - lo + wet * 4; };
    const inside = (x, z) => x >= keepOff && z >= keepOff && x <= ZM - keepOff && z <= ZM - keepOff;
    let best = null, bestS = Infinity;
    for (let dz = -480; dz <= 480; dz += 16) for (let dx = -480; dx <= 480; dx += 16) {
      const x = main.x + dx, z = main.z + dz;
      if (!inside(x, z)) continue;
      const s = roughness(x, z, main.radius) + Math.hypot(dx, dz) * 0.02;
      if (s < bestS) { bestS = s; best = { x, z }; }
    }
    if (best) { main.movedFrom = { x: main.x, z: main.z }; main.x = best.x; main.z = best.z; }
    // level: blend toward the disc's mean height inside the circle, easing out over 40 m
    let sum = 0, n = 0;
    for (let dz = -main.radius; dz <= main.radius; dz += 4) for (let dx = -main.radius; dx <= main.radius; dx += 4) if (dx * dx + dz * dz <= main.radius ** 2) { sum += H(main.x + dx, main.z + dz); n++; }
    const mean = sum / n, R = main.radius, ease = 40;
    for (let j = 1; j <= SIZE; j++) for (let i = 1; i <= SIZE; i++) {
      const x = (i - 1) * STEP, z = (j - 1) * STEP, d = Math.hypot(x - main.x, z - main.z);
      if (d > R + ease) continue;
      const k = j * G + i, w = d <= R ? 0.85 : 0.85 * (1 - smoothstep(0, 1, (d - R) / ease));
      const target = mean + (ground[k] - mean) * 0.15;   // keep a little of the natural roll
      if (Number.isNaN(waterTop[k])) ground[k] = ground[k] + (target - ground[k]) * w;
    }
    // the plan, in the town's own frame (centred on the town)
    const tx = main.x, tz = main.z;
    townPlan = planTown({
      seed: (hashStr(id + ':' + main.name) >>> 0) % 100000, size: TOWN_SIZE[main.kind] || 2, culture: 'human',
      heightAt: (x, z) => H(tx + x, tz + z),
      buildable: (x, z) => !W_(tx + x, tz + z),
    });
    townPlan.origin = { x: tx, z: tz };
  }

  // 5. one dry ring outside every wet edge carries the surface (so a sheet of wet triangles reaches the bank)
  {
    const copy = waterTop.slice(), kinds = waterKind.slice();
    for (let j = 1; j < G - 1; j++) for (let i = 1; i < G - 1; i++) {
      const k = j * G + i; if (!Number.isNaN(copy[k])) continue;
      let s = 0, c = 0, kind = 0;
      for (const o of [1, -1, G, -G]) { const v = copy[k + o]; if (!Number.isNaN(v)) { s += v; c++; kind = Math.max(kind, kinds[k + o]); } }
      if (c) { waterTop[k] = s / c; waterKind[k] = kind; }
    }
  }

  // 6. biomes (warped macro biome, water and rock overrides) on the cropped grid
  const N = SIZE * SIZE, biome = new Uint8Array(N);
  const BEACH = 4, MOUNTAINS = 17, LAKE = 3, COAST = 2;
  for (let j = 0; j < SIZE; j++) for (let i = 0; i < SIZE; i++) {
    const gi = i + 1, gj = j + 1, k = gj * G + gi, wx = wxOf(gi), wz = wzOf(gj);
    let b = m.biome[ref.warpedIndex(wx, wz)];
    if (waterKind[k] && waterTop[k] > ground[k]) b = waterKind[k] === 1 ? COAST : LAKE;
    else if (b < 4 || b === 25) b = BEACH;
    else {
      const s = Math.hypot(ground[k + 1] - ground[k - 1], ground[k + G] - ground[k - G]) / (2 * STEP);
      if (s > 0.9 && b !== 18) b = MOUNTAINS;
    }
    biome[j * SIZE + i] = b;
  }

  // 7. quantise on the WORLD range and crop
  const { min: hMin, max: hMax } = heightRange(W);
  const q = v => clamp(Math.round((v - hMin) / (hMax - hMin) * 65535), 1, 65535);
  const height = new Uint16Array(N), wTop = new Uint16Array(N), wKind = new Uint8Array(N);
  for (let j = 0; j < SIZE; j++) for (let i = 0; i < SIZE; i++) {
    const k = (j + 1) * G + i + 1, o = j * SIZE + i;
    height[o] = q(ground[k]);
    wTop[o] = Number.isNaN(waterTop[k]) ? 0 : q(waterTop[k]);
    wKind[o] = wTop[o] ? waterKind[k] : 0;
  }

  const meta = {
    name: main ? `${main.name} (${id})` : id, zone: id,
    size: SIZE, step: STEP, origin: { x: 0, z: 0 }, heightMin: hMin, heightMax: hMax,
    bakeVersion: ZONE_BAKE_VERSION, inputHash: null,
    biomes: BIOMES.map(b => [b.key, b.name, b.color]), waterKinds: ['none', 'sea', 'lake', 'river'],
    source: { tool: 'tools/bake-zone.mjs', world: { seed: W.seed, width: W.width, height: W.height, method: W.method, inputHash: W.inputHash }, zone: { zx: zone.zx, zy: zone.zy }, worldOrigin: { x: ox, z: oz }, zoneMetres: ZM },
    rivers: riversUsed, sites: sites.map(s => { const o = { ...s }; delete o.size; return o; }), spawn: null,
  };
  meta.inputHash = (hashStr(JSON.stringify({ id, w: W.inputHash, ZONE_BAKE_VERSION, FORMAT_VERSION, town: opts.town !== false })) >>> 0).toString(16).padStart(8, '0');
  const terrain = createTerrain({ meta, height, waterTop: wTop, waterKind: wKind, biome });
  if (opts.town !== false) addZoneSites(terrain, meta.sites, { asks: ASKS[id] || [], doorName: 'Barrow entrance', town: meta.sites.find(s => s.hub) });
  const town = meta.sites.find(s => s.name === main?.name);
  meta.spawn = town ? spawnNear(terrain, town) : { x: 1024, z: 1024 };
  const placements = placementsFor(meta, townPlan);
  return { meta, height, waterTop: wTop, waterKind: wKind, biome, terrain, townPlan, placements };
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

/** Typed placement records: {kind, id, x, z, yaw, data}. Every id is unique within the zone. */
export function placementsFor(meta, plan) {
  const out = [];
  for (const s of meta.sites) {
    if (s.type === 'settlement') out.push({ kind: 'settlement', id: slug(s.name), x: r2(s.x), z: r2(s.z), yaw: 0, data: { kind: s.kind, name: s.name, radius: s.radius ?? TOWN_RADIUS[s.kind] ?? 40, hub: !!s.hub } });
    else if (s.type === 'dungeon') out.push({ kind: 'dungeon_door', id: s.id, x: s.x, z: s.z, yaw: s.yaw, data: { name: s.name } });
    else if (s.type === 'event' || s.type === 'camp') out.push({ kind: s.type + '_site', id: s.id, x: s.x, z: s.z, yaw: 0, data: { r: s.r } });
    else out.push({ kind: s.type, id: slug(s.name || s.kind), x: r2(s.x), z: r2(s.z), yaw: 0, data: { kind: s.kind, name: s.name } });
  }
  if (plan) {
    const { x: tx, z: tz } = plan.origin, town = slug(meta.sites.find(s => s.type === 'settlement' && Math.hypot(s.x - tx, s.z - tz) < 1)?.name || 'town');
    out.push({ kind: 'town_square', id: `${town}_square`, x: r2(tx + plan.square.cx), z: r2(tz + plan.square.cz), yaw: 0, data: { r: r2(plan.square.r), town } });
    plan.streets.forEach((st, i) => {
      const pts = st.pts.map(([x, z]) => [r2(tx + x), r2(tz + z)]);
      out.push({ kind: 'street', id: `${town}_street_${i}`, x: pts[0][0], z: pts[0][1], yaw: 0, data: { town, cls: st.cls, width: st.width, pts } });
    });
    // a door must open onto a street: of the plot's four sides, face the one whose front is nearest a
    // DRAWN street. (proctown's own `facing` points at the nearest BLOCK edge, and after its connectivity
    // pass dropped orphan stubs some block edges are no longer streets — measured 9 of 17 right.)
    const streetGap = (x, z) => {
      let best = Infinity;
      for (const st of plan.streets) for (let k = 0; k < st.pts.length - 1; k++) {
        const [ax, az] = st.pts[k], [bx, bz] = st.pts[k + 1], dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz || 1;
        const t = clamp(((x - ax) * dx + (z - az) * dz) / L, 0, 1);
        best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t) - st.width / 2);
      }
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
  return out;
}
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

/** Summary for zone.json and the console. */
export function summarise(b) {
  const t = b.terrain; let wet = 0, steep = 0, n = 0;
  for (let z = 1; z < 2048; z += 16) for (let x = 1; x < 2048; x += 16) { n++; if (t.waterAt(x, z).kind !== 'none') wet++; if (!t.walkable(x, z)) steep++; }
  const town = b.meta.sites.find(s => s.movedFrom);
  return {
    zone: b.meta.zone, inputHash: b.meta.inputHash, rivers: b.meta.rivers.length, wetShare: +(wet / n).toFixed(3), unwalkableShare: +(steep / n).toFixed(3),
    town: b.townPlan ? { name: b.meta.sites.find(s => s.radius && Math.hypot(s.x - b.townPlan.origin.x, s.z - b.townPlan.origin.z) < 1)?.name, at: b.townPlan.origin, movedFrom: town?.movedFrom, plots: b.townPlan.plots.length, streets: b.townPlan.streets.length, overlaps: overlaps(b.townPlan).length } : null,
    sites: b.meta.sites.map(s => [s.type + (s.hub ? '(HUB)' : ''), s.kind || s.id, s.name || '', Math.round(s.x), Math.round(s.z), s.radius ?? s.r ?? '', s.yaw ?? ''].join(' ')),
    spawn: b.meta.spawn, placements: b.placements.length,
  };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const id = process.argv.includes('--m1') ? M1_ZONE : process.argv.slice(2).find(a => /^z\d\d_\d\d$/.test(a));
  if (!id) { console.error('usage: bake-zone.mjs <zXX_YY> | --m1 [--check]'); process.exit(2); }
  const t0 = performance.now();
  const b = bakeZone(id);
  const bytes = encodeTerrain(b);
  const dir = join(ZONES_DIR, id), file = join(dir, 'terrain.bin');
  const plText = JSON.stringify({ _doc: 'Stream B zone placements (tools/bake-zone.mjs). Zone metres; yaw = atan2(dx, dz) the way the thing faces. kinds: settlement, town_square, street (data.pts), building (a proctown plot: data.w along `angle`, data.d across, want; yaw faces the nearest drawn street, data.streetGap = metres from the front to it), town_wall, dungeon_door, event_site, camp_site, landmark/dungeon/pass/crossing (World Forge nodes).', zone: id, terrainHash: b.meta.inputHash, placements: b.placements }, null, 1) + '\n';
  if (process.argv.includes('--check')) {
    const same = existsSync(file) && Buffer.compare(readFileSync(file), Buffer.from(bytes)) === 0 && readFileSync(join(dir, 'placements.json'), 'utf8') === plText;
    console.log(same ? `${id} is up to date` : `${id} is STALE`); process.exit(same ? 0 : 1);
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, bytes);
  writeFileSync(join(dir, 'placements.json'), plText);
  const info = summarise(b);
  writeFileSync(join(dir, 'zone.json'), JSON.stringify({ ...b.meta, biomes: undefined, summary: info, file: 'terrain.bin', bytes: bytes.length }, null, 2) + '\n');
  console.log(JSON.stringify(info, null, 2));
  console.log(`wrote ${file} (${(bytes.length / 1048576).toFixed(2)} MB) in ${Math.round(performance.now() - t0)} ms`);
}
