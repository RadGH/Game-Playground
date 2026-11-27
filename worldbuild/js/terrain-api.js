// World Build — the generated world as a terrain object with the SAME queries as Oathwild's createTerrain(map)
// (prototypes/oathwild/js/world/terrain.js), read from baked grids instead of rebuilt from hand data. This is the piece
// Oathwild adopts for a big map: the server and the browser both call bakedTerrain() on the same files, so what is
// drawn and what is walked still come from one source (lessons rule 22). Inside the pinned piece every query answers
// exactly what Oathwild's own terrain answers there (tests/terrain-api.test.mjs compares thousands of spots).
//
//   const T = bakedTerrain(W)      W = the pipeline's world (or worldFromFiles(...) for map files written by build.mjs)
//   T.heightAt / walkHeightAt / waterAt / deckAt / slopeAt / walkable / swimmable / inPlay / biomeAt / forestAt /
//   fieldAt / regionAt / areaAt / levelBandAt / roadAt / marshLevel     — as terrain.js (see its header)
//   T.roads / T.rivers / T.bridges / T.places / T.grid / T.biomeGrid / T.bounds / T.limits / T.seed
//   T.buildBiomeGrid()   (fills T.biomeGrid; the pipeline calls it once fields and towns exist)
//   waterAt(...).kind may also be 'lake' or 'sea' (new kinds; Oathwild's own map only has 'river' and 'marsh')

import { clamp, lerp, smoothstep, segDist, makeNoise2D, fbm, gridSample } from './core.js';
import { BIOMES, BIOME_ID } from './themes.js';

const KIND = ['river', 'river', 'marsh', 'lake', 'sea'];

export function bakedTerrain(W) {
  const B = W.bounds, LIM = W.brief.limits, pin = W.pin;
  const { nx, nz, cell } = W;
  const H = W.H, Wt = W.water, WK = W.wkind;
  const g = { minX: B.minX, minZ: B.minZ, cell, nx, nz, data: H };
  const idx = (i, k) => k * nx + i;
  const heightAt = (x, z) => gridSample(g, x, z);
  const inPlay = (x, z) => x >= B.minX + B.margin && x <= B.maxX - B.margin && z >= B.minZ + B.margin && z <= B.maxZ - B.margin;
  const nearestVertex = (x, z) => idx(clamp(Math.round((x - B.minX) / cell), 0, nx - 1), clamp(Math.round((z - B.minZ) / cell), 0, nz - 1));
  const inKeep = pin ? pin.inKeep : () => false;

  function waterAt(x, z) {
    const fx = clamp((x - B.minX) / cell, 0, nx - 1.000001), fz = clamp((z - B.minZ) / cell, 0, nz - 1.000001);
    const i = Math.floor(fx), k = Math.floor(fz);
    let s = 0, n = 0, kind = 0;
    for (const j of [idx(i, k), idx(i + 1, k), idx(i, k + 1), idx(i + 1, k + 1)]) if (!Number.isNaN(Wt[j])) { s += Wt[j]; n++; kind = Math.max(kind, WK[j]); }
    if (!n) return null;
    const surface = s / n, depth = surface - heightAt(x, z);
    return { surface: Math.round(surface * 100) / 100, depth: Math.round(depth * 100) / 100, kind: KIND[kind] || 'river' };
  }
  // bridges bucketed by 64 m so a query looks at a handful
  const bridges = W.bridges;
  const bBuck = new Map(), BK = 64, bkey = (i, k) => i * 65536 + k;
  for (const b of bridges) {
    if (b.kind !== 'bridge') continue;
    const x0 = Math.min(b.a[0], b.b[0]) - b.width, x1 = Math.max(b.a[0], b.b[0]) + b.width, z0 = Math.min(b.a[1], b.b[1]) - b.width, z1 = Math.max(b.a[1], b.b[1]) + b.width;
    for (let i = Math.floor(x0 / BK); i <= Math.floor(x1 / BK); i++) for (let k = Math.floor(z0 / BK); k <= Math.floor(z1 / BK); k++) { const kk = bkey(i, k); if (!bBuck.has(kk)) bBuck.set(kk, []); bBuck.get(kk).push(b); }
  }
  function deckAt(x, z) {
    for (const b of bBuck.get(bkey(Math.floor(x / BK), Math.floor(z / BK))) || []) {
      const dx = b.b[0] - b.a[0], dz = b.b[1] - b.a[1], L2 = dx * dx + dz * dz || 1, t = ((x - b.a[0]) * dx + (z - b.a[1]) * dz) / L2;
      if (t < 0 || t > 1) continue;
      if (segDist(x, z, b.a[0], b.a[1], b.b[0], b.b[1]).d <= b.width / 2) return b;
    }
    return null;
  }
  function slopeAt(x, z) {
    const e = 0.5;
    const dx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e), dz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
    return Math.atan(Math.hypot(dx, dz)) * 180 / Math.PI;
  }
  function walkHeightAt(x, z) {
    const b = deckAt(x, z);
    if (b) { const gh = heightAt(x, z); if (gh < b.deck) return { y: b.deck, on: 'deck', bridge: b.id }; }
    const w = waterAt(x, z), gh = heightAt(x, z);
    if (w && w.depth > LIM.wadeDepth) return { y: Math.round((w.surface - LIM.wadeDepth) * 100) / 100, on: 'swim', depth: w.depth, surface: w.surface };
    if (w && w.depth > 0) return { y: gh, on: 'water', depth: w.depth, surface: w.surface };
    return { y: gh, on: 'ground' };
  }
  function swimmable(x, z) {
    if (!inPlay(x, z) || deckAt(x, z)) return false;
    const w = waterAt(x, z);
    return !!(w && w.depth > LIM.wadeDepth);
  }
  function walkable(x, z) {
    if (!inPlay(x, z)) return false;
    if (deckAt(x, z)) return true;
    const w = waterAt(x, z);
    if (w && w.depth > LIM.wadeDepth) return false;
    if (w && w.depth > -(LIM.bankBand ?? 0.8)) return slopeAt(x, z) < (LIM.bankSlope ?? 50);
    return slopeAt(x, z) < LIM.maxSlope;
  }

  // roads bucketed by 32 m (segments)
  const roads = W.roads;
  const rBuck = new Map(), RK = 32;
  roads.forEach(r => {
    for (let q = 0; q < r.pts.length - 1; q++) {
      const a = r.pts[q], b = r.pts[q + 1], pad = 32;
      for (let i = Math.floor((Math.min(a.x, b.x) - pad) / RK); i <= Math.floor((Math.max(a.x, b.x) + pad) / RK); i++) for (let k = Math.floor((Math.min(a.z, b.z) - pad) / RK); k <= Math.floor((Math.max(a.z, b.z) + pad) / RK); k++) {
        const kk = bkey(i, k); if (!rBuck.has(kk)) rBuck.set(kk, []); rBuck.get(kk).push([r, a, b]);
      }
    }
  });
  function roadAt(x, z, maxD = 30) {
    let best = null;
    for (const [r, a, b] of rBuck.get(bkey(Math.floor(x / RK), Math.floor(z / RK))) || []) {
      const { d, t } = segDist(x, z, a.x, a.z, b.x, b.z);
      if (d <= maxD && (!best || d < best.d)) best = { road: r.id, class: r.class, d: Math.round(d * 100) / 100, y: Math.round((a.y + (b.y - a.y) * t) * 100) / 100, half: r.width / 2 };
    }
    return best;
  }

  // places, fields, towns
  const places = W.places;
  const placeList = Object.values(places);
  const pBuck = new Map(), PK = 128;
  for (const p of placeList) {
    const r = Math.max(p.flat || 0, p.kind === 'town' ? p.radius : 0) + 6;
    for (let i = Math.floor((p.at[0] - r) / PK); i <= Math.floor((p.at[0] + r) / PK); i++) for (let k = Math.floor((p.at[1] - r) / PK); k <= Math.floor((p.at[1] + r) / PK); k++) { const kk = bkey(i, k); if (!pBuck.has(kk)) pBuck.set(kk, []); pBuck.get(kk).push(p); }
  }
  const placesNear = (x, z) => pBuck.get(bkey(Math.floor(x / PK), Math.floor(z / PK))) || [];
  const fields = W.fields || [];
  const fieldHit = (x, z) => {
    if (pin && inKeep(x, z)) return pin.T.fieldAt(x - pin.at[0], z - pin.at[1]);
    for (const f of fields) {
      if (Math.abs(x - f.at[0]) > f.size[0] + f.size[1] || Math.abs(z - f.at[1]) > f.size[0] + f.size[1]) continue;
      const c = Math.cos(-f.angle), s = Math.sin(-f.angle);
      const lx = (x - f.at[0]) * c - (z - f.at[1]) * s, lz = (x - f.at[0]) * s + (z - f.at[1]) * c;
      if (Math.abs(lx) <= f.size[0] / 2 && Math.abs(lz) <= f.size[1] / 2) return f;
    }
    return null;
  };
  const M = W.macro;
  const mGrid = { minX: M.minX, minZ: M.minZ, cell: M.cell, nx: M.nx, nz: M.nz };
  const mIdx = (x, z) => clamp(Math.round((z - M.minZ) / M.cell), 0, M.nz - 1) * M.nx + clamp(Math.round((x - M.minX) / M.cell), 0, M.nx - 1);
  const noise3 = makeNoise2D((W.seed ^ 0x2c1b) >>> 0);
  const RD = W.roadDist, RI = W.roadIdx;

  function forestAt(x, z) {
    if (pin && inKeep(x, z)) return pin.T.forestAt(x - pin.at[0], z - pin.at[1]);
    const j = nearestVertex(x, z);
    if (RD && RD[j] < (roads[RI[j]]?.width || 4) / 2 + 5) return 0;
    const w = waterAt(x, z);
    if (w && w.depth > -0.4) return 0;
    if (fieldHit(x, z)) return 0;
    for (const p of placesNear(x, z)) if (Math.hypot(x - p.at[0], z - p.at[1]) < Math.max(p.flat || 0, p.kind === 'town' ? p.radius : 0) + 4) return 0;
    const fv = bilinear(mGrid, M.forest, x, z);
    const n = fbm(noise3, x / 70, z / 70, { octaves: 3 });
    return Math.round(clamp(fv * (0.4 + 1.2 * n), 0, 1) * 100) / 100;
  }
  const regionList = W.regionList;
  const regionAt = (x, z) => (pin && inKeep(x, z) ? pin.regionAt(x, z) : regionList[M.region[mIdx(x, z)]].id);
  const areas = W.areas || [];
  const areasBySize = [...areas].sort((a, b) => a.radius - b.radius);
  const areaAt = (x, z) => areasBySize.find(a => Math.hypot(x - a.at[0], z - a.at[1]) <= a.radius) || null;
  function levelBandAt(x, z) {
    if (pin && inKeep(x, z)) return pin.levelBandAt(x, z);
    const a = areaAt(x, z);
    if (a) return [...a.levels];
    const lv = M.level[mIdx(x, z)];
    return [Math.max(1, lv - 1), lv + 1];
  }
  const towns = placeList.filter(p => p.kind === 'town');
  function extraBiome(x, z) {
    const j = nearestVertex(x, z);
    if (RD && RD[j] <= (roads[RI[j]]?.width || 0) / 2) { const c = roads[RI[j]].class; return c === 'road' ? 'road' : c; }
    if (deckAt(x, z)) return 'road';
    for (const p of towns) if (Math.abs(x - p.at[0]) < p.radius && Math.hypot(x - p.at[0], z - p.at[1]) < p.radius) return 'village';
    if (fieldHit(x, z)) return 'field';
    return null;
  }
  function biomeAt(x, z) {
    if (pin && inKeep(x, z)) return pin.T.biomeAt(x - pin.at[0], z - pin.at[1]);
    if (T.biomeGrid.ids) {
      const bg = T.biomeGrid, i = clamp(Math.floor((x - bg.minX) / bg.cell), 0, bg.nx - 1), k = clamp(Math.floor((z - bg.minZ) / bg.cell), 0, bg.nz - 1);
      return BIOMES[bg.ids[k * bg.nx + i]];
    }
    return liveBiome(x, z);
  }
  function liveBiome(x, z) {
    const w = waterAt(x, z), h = heightAt(x, z);
    if (w && w.depth > LIM.wadeDepth && !deckAt(x, z)) return 'water';
    return W.classify(x, z, h, slopeAt(x, z), w ? w.depth : -Infinity, extraBiome);
  }
  const bc = 4;
  const biomeGrid = { nx: Math.round((B.maxX - B.minX) / bc), nz: Math.round((B.maxZ - B.minZ) / bc), cell: bc, minX: B.minX, minZ: B.minZ, ids: null };
  function buildBiomeGrid() {
    const { nx: bnx, nz: bnz } = biomeGrid;
    const ids = new Uint8Array(bnx * bnz);
    const pg = pin?.T.biomeGrid;
    for (let k = 0; k < bnz; k++) for (let i = 0; i < bnx; i++) {
      const x = B.minX + (i + 0.5) * bc, z = B.minZ + (k + 0.5) * bc;
      if (pin && inKeep(x, z)) {
        // the pinned piece's own biome cell (same 4 m cells, same ids for its twelve biomes)
        const pi = Math.floor((x - pin.at[0] - pg.minX) / pg.cell), pk = Math.floor((z - pin.at[1] - pg.minZ) / pg.cell);
        ids[k * bnx + i] = pg.ids[pk * pg.nx + pi];
        continue;
      }
      ids[k * bnx + i] = BIOME_ID[liveBiome(x, z)];
    }
    biomeGrid.ids = ids;
    return biomeGrid;
  }
  const marshes = (pin?.T.marshes || []).map(m => ({ ...m, at: [m.at[0] + (pin?.at[0] || 0), m.at[1] + (pin?.at[1] || 0)] }));
  const T = {
    map: W.mapJson || null, seed: W.seed, bounds: B, limits: LIM,
    grid: { nx, nz, cell, minX: B.minX, minZ: B.minZ, heights: H, water: Wt },
    biomeGrid, buildBiomeGrid,
    roads, rivers: W.allRivers || W.rivers, bridges, places, marshes, regionIds: regionList.map(r => r.id),
    marshLevel: id => marshes.find(m => m.id === id)?.level ?? null,
    inPlay, heightAt, walkHeightAt, waterAt, deckAt, slopeAt, walkable, swimmable, biomeAt, forestAt, fieldAt: fieldHit,
    regionAt, areaAt, levelBandAt, roadAt, borderX: pin ? z => pin.T.borderX(z - pin.at[1]) + pin.at[0] : () => Infinity,
    inKeep,
  };
  return T;
}

function bilinear(g, arr, x, z) {
  const fx = clamp((x - g.minX) / g.cell, 0, g.nx - 1.000001), fz = clamp((z - g.minZ) / g.cell, 0, g.nz - 1.000001);
  const i = Math.floor(fx), k = Math.floor(fz), u = fx - i, v = fz - k, j = k * g.nx + i;
  return (arr[j] * (1 - u) + arr[j + 1] * u) * (1 - v) + (arr[j + g.nx] * (1 - u) + arr[j + g.nx + 1] * u) * v;
}
void lerp; void smoothstep;
