// The micro layers: zoom from the world map into one region, and from a region into one local tile.
//
// Both are derived from the world grid, never invented independently: the coarse values are sampled
// smoothly and higher-octave noise (seeded from the world seed plus the cell position) adds the
// detail. So the same seed always produces the same valley, and what you see up close matches what
// the world map said was there.
//
//   import { generateRegionDetail, generateLocalDetail } from './local.js';
//   const detail = generateRegionDetail(world, 3);              // a region at 6× the world resolution
//   const tile   = generateLocalDetail(world, 120, 64);         // one world cell as a 64×64 map
//
// Both results are shaped like a mini world (width/height/elevation/biome/water/…), so render.js and
// cellInfo() work on them unchanged.

import { makeRng, makeNoise2D, fbm, ridged, subSeed, clamp, lerp } from './noise.js';
import { classify, BIOMES } from './biomes.js';
import { fillDepressions } from './world.js';
import { aStar } from './roads.js';
import { Namer } from './names.js';

const IDX = (w, x, y) => y * w + x;
/** Stable 0..1 value per (x,y) — used to dapple sub-biomes without another noise field. */
const rngMix = (x, y) => { let h = Math.imul(x + 374761393, 668265263) ^ Math.imul(y + 2246822519, 374761393); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

/** Smooth (bilinear) sample of a world layer at fractional world coordinates. */
function sampleLayer(world, arr, fx, fy) {
  const w = world.width, h = world.height;
  const x = clamp(fx, 0, w - 1.001), y = clamp(fy, 0, h - 1.001);
  const x0 = Math.floor(x), y0 = Math.floor(y), tx = x - x0, ty = y - y0;
  const x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
  return lerp(lerp(arr[IDX(w, x0, y0)], arr[IDX(w, x1, y0)], tx), lerp(arr[IDX(w, x0, y1)], arr[IDX(w, x1, y1)], tx), ty);
}
const sampleNearest = (world, arr, fx, fy) => arr[IDX(world.width, clamp(Math.round(fx), 0, world.width - 1), clamp(Math.round(fy), 0, world.height - 1))];

/**
 * Refine one region onto a finer grid.
 * opts: { factor = 6 (fine cells per world cell), margin = 2 (world cells of context around it),
 *         maxCells = 240000, streams = true, paths = true, extras = true }
 */
export function generateRegionDetail(world, regionId, opts = {}) {
  const region = world.regions[regionId];
  if (!region) throw new Error('no region ' + regionId);
  const margin = opts.margin ?? 2;
  const [bx0, by0, bx1, by1] = region.bbox;
  const x0 = Math.max(0, bx0 - margin), y0 = Math.max(0, by0 - margin);
  const x1 = Math.min(world.width - 1, bx1 + margin), y1 = Math.min(world.height - 1, by1 + margin);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  let factor = opts.factor ?? 6;
  const maxCells = opts.maxCells ?? 240000;
  while (factor > 1 && cw * factor * ch * factor > maxCells) factor--;
  const w = cw * factor, h = ch * factor, N = w * h;

  const seed = subSeed(world.seed, 'region-detail-' + regionId);
  const rng = makeRng(seed);
  const n1 = makeNoise2D(subSeed(seed, 'd1')), n2 = makeNoise2D(subSeed(seed, 'd2')), n3 = makeNoise2D(subSeed(seed, 'd3'));

  const elevation = new Float32Array(N), temperature = new Float32Array(N), moisture = new Float32Array(N);
  const aura = new Float32Array(N), magic = new Float32Array(N), water = new Uint8Array(N), slope = new Float32Array(N);
  const parentCell = new Int32Array(N), regionArr = new Int16Array(N).fill(-1);

  const fRidge = 0.55 / factor, fSoft = 0.26 / factor;   // ridges every ~2 world cells, rolling ground under them
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = IDX(w, x, y);
    const fx = x0 + (x + 0.5) / factor - 0.5, fy = y0 + (y + 0.5) / factor - 0.5;
    const px = clamp(Math.round(fx), 0, world.width - 1), py = clamp(Math.round(fy), 0, world.height - 1);
    parentCell[i] = IDX(world.width, px, py);
    let e = sampleLayer(world, world.elevation, fx, fy);
    const relief = Math.abs(e - 0.5) * 2;
    // fine detail: ridged where the land is high, gentle rolling where it is low
    const rough = ridged(n1, x * fRidge, y * fRidge, { octaves: 4, sharpness: 1.6 }) - 0.5;
    const soft = fbm(n2, x * fSoft, y * fSoft, { octaves: 4 }) - 0.5;
    const amp = (e > 0.5 ? 0.05 + relief * 0.12 : 0.03) * (opts.detail ?? 1);
    e += (rough * 0.42 + soft * 0.58) * amp;
    elevation[i] = clamp(e, 0, 1);
    temperature[i] = clamp(sampleLayer(world, world.temperature, fx, fy) - Math.max(0, elevation[i] - 0.5) * 0.1, 0, 1);
    moisture[i] = clamp(sampleLayer(world, world.moisture, fx, fy) + (fbm(n3, x * 0.06, y * 0.06, { octaves: 3 }) - 0.5) * 0.18, 0, 1);
    aura[i] = sampleLayer(world, world.aura, fx, fy);
    magic[i] = sampleLayer(world, world.magic, fx, fy);
    regionArr[i] = sampleNearest(world, world.region, fx, fy);
    const parentWater = world.water[parentCell[i]];
    water[i] = elevation[i] < 0.5 ? (parentWater === 2 ? 2 : 1) : 0;
  }

  // streams: the same drainage model at the finer scale, plus the world's own rivers carved in
  const flow = new Float32Array(N);
  const streams = [];
  if (opts.streams !== false) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = IDX(w, x, y);
      if (water[i] === 0 && world.river[parentCell[i]]) elevation[i] = Math.min(elevation[i], 0.5 + (elevation[i] - 0.5) * 0.55);
    }
    const filled = fillDepressions(elevation, w, h, water, 1e-6);
    const order = Array.from({ length: N }, (_, i) => i).sort((a, b) => filled[b] - filled[a]);
    const down = new Int32Array(N).fill(-1);
    for (const i of order) {
      if (water[i] === 1) continue;
      const x = i % w, y = (i / w) | 0;
      let best = -1, bestDrop = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = IDX(w, xx, yy);
        const drop = (filled[i] - filled[j]) / Math.hypot(dx, dy);
        if (drop > bestDrop) { bestDrop = drop; best = j; }
      }
      down[i] = best;
    }
    for (let i = 0; i < N; i++) flow[i] = water[i] === 1 ? 0 : 0.3 + moisture[i];
    for (const i of order) { const d = down[i]; if (d >= 0 && water[i] !== 1) flow[d] += flow[i]; }
    const threshold = 40 * factor * 0.5;
    const isStream = new Uint8Array(N);
    for (let i = 0; i < N; i++) if (water[i] === 0 && flow[i] > threshold) isStream[i] = flow[i] > threshold * 6 ? 2 : 1;
    const hasUp = new Uint8Array(N);
    for (let i = 0; i < N; i++) if (isStream[i] && down[i] >= 0 && isStream[down[i]]) hasUp[down[i]] = 1;
    for (let i = 0; i < N; i++) {
      if (!isStream[i] || hasUp[i]) continue;
      const cells = []; let cur = i, guard = 0;
      while (cur >= 0 && guard++ < N) { cells.push(cur); if (water[cur] !== 0) break; const nx = down[cur]; if (nx < 0) break; cur = nx; }
      if (cells.length > 4) streams.push({ cells, major: isStream[i] === 2 || cells.length > factor * 8 });
    }
    streams.sort((a, b) => b.cells.length - a.cells.length);
    if (streams.length > 90) streams.length = 90;
  }

  // sub-biomes
  const biome = new Uint8Array(N);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = IDX(w, x, y);
    const l = elevation[IDX(w, Math.max(0, x - 1), y)], r = elevation[IDX(w, Math.min(w - 1, x + 1), y)];
    const u = elevation[IDX(w, x, Math.max(0, y - 1))], d = elevation[IDX(w, x, Math.min(h - 1, y + 1))];
    slope[i] = clamp(Math.hypot(r - l, d - u) * 9 * factor * 0.4, 0, 1);
    let nearOcean = false;
    for (let dy = -1; dy <= 1 && !nearOcean; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      if (water[IDX(w, xx, yy)] === 1) { nearOcean = true; break; }
    }
    biome[i] = classify({
      elev: elevation[i], temp: temperature[i], moist: moisture[i], slope: slope[i], aura: aura[i], magic: magic[i],
      water: water[i], depth: water[i] ? (0.5 - elevation[i]) / 0.5 : 0, nearOcean, volcanic: world.volcanic[parentCell[i]] === 1,
    }, world.opts?.biomeVariety ?? 0.6);
  }

  const detail = {
    kind: 'region', schema: 1, regionId, name: region.name, seed, factor,
    width: w, height: h, origin: { x: x0, y: y0 }, worldCells: { w: cw, h: ch },
    elevation, temperature, moisture, aura, magic, water, biome, slope, flow, region: regionArr, parentCell,
    volcanic: new Uint8Array(N), river: new Uint8Array(N),
    streams, nodes: [], paths: [], rivers: [], regions: world.regions, opts: world.opts,
    metresPerCell: Math.round(24000 / factor),
    relief: world.relief || null,          // so cellInfo() measures heights on the same scale
  };
  for (const s of streams) for (const c of s.cells) detail.river[c] = s.major ? 2 : 1;

  // world nodes that fall inside, mapped onto the fine grid
  const toFine = (wx, wy) => ({ x: Math.round((wx - x0 + 0.5) * factor - 0.5), y: Math.round((wy - y0 + 0.5) * factor - 0.5) });
  for (const n of world.nodes) {
    if (n.x < x0 || n.x > x1 || n.y < y0 || n.y > y1) continue;
    const p = toFine(n.x, n.y);
    detail.nodes.push({ ...n, worldX: n.x, worldY: n.y, x: clamp(p.x, 0, w - 1), y: clamp(p.y, 0, h - 1) });
  }

  // a handful of small places that only exist at this zoom
  if (opts.extras !== false) {
    const namer = new Namer({ namegen: opts.namegen, seed });
    const small = [
      { kind: 'camp', tags: ['camp'], test: c => c.open && c.habit > 0.4 },
      { kind: 'shrine', tags: ['shrine'], test: c => c.magic > 0.35 || c.aura < -0.2 },
      { kind: 'cave', tags: ['cave'], test: c => c.slope > 0.4 },
      { kind: 'ruin', tags: ['ruin'], test: c => c.aura > 0.1 },
      { kind: 'ancientwood', tags: ['forest'], test: c => c.forest },
    ];
    const extras = Math.round(clamp(w * h / 9000, 2, 14));
    let tries = 0;
    while (detail.nodes.filter(n => n.local).length < extras && tries++ < 600) {
      const i = rng.int(0, N - 1);
      if (water[i] !== 0) continue;
      const b = BIOMES[biome[i]];
      const c = { open: b.tags.includes('open'), forest: b.tags.includes('forest'), habit: b.habit ?? 0.3, slope: slope[i], aura: aura[i], magic: magic[i] };
      const kinds = small.filter(s => s.test(c));
      if (!kinds.length) continue;
      const pick = rng.pick(kinds);
      const x = i % w, y = (i / w) | 0;
      if (detail.nodes.some(n => (n.x - x) ** 2 + (n.y - y) ** 2 < (factor * 2.4) ** 2)) continue;
      const race = region.race;
      detail.nodes.push({
        id: 'local-' + detail.nodes.length, local: true, type: pick.kind === 'camp' ? 'camp' : 'landmark', kind: pick.kind,
        name: namer.landmark(pick.kind === 'camp' ? 'camp' : pick.kind, race, subSeed(seed, 'x' + i)).text,
        x, y, index: i, region: regionId, tags: [...pick.tags, 'local'], size: 1, biome: b.key,
      });
    }
  }

  // paths between the places in view
  if (opts.paths !== false && detail.nodes.length > 1) {
    const cost = new Float32Array(N);
    for (let i = 0; i < N; i++) cost[i] = water[i] !== 0 ? Infinity : (BIOMES[biome[i]].move ?? 1.5) * (1 + slope[i] * 3) + (detail.river[i] ? 5 : 0);
    const hubs = detail.nodes.filter(n => n.type === 'settlement' || n.type === 'port' || n.local);
    const seen = new Set();
    for (const a of hubs) {
      const near = hubs.filter(b => b !== a).map(b => ({ b, d: (a.x - b.x) ** 2 + (a.y - b.y) ** 2 })).sort((p, q) => p.d - q.d).slice(0, 2);
      for (const { b } of near) {
        const key = [a.id, b.id].sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        const path = aStar(detail, IDX(w, a.x, a.y), IDX(w, b.x, b.y), cost);
        if (path) detail.paths.push({ from: a.id, to: b.id, cells: path, class: (a.size >= 3 && b.size >= 3) ? 'highway' : a.local || b.local ? 'trail' : 'road' });
      }
    }
  }
  return detail;
}

// ---------------------------------------------------------------------------- local tile

const FEATURE_SETS = {
  forest: [['tree', 34], ['bush', 12], ['rock', 3], ['deadtree', 2]],
  coldForest: [['pine', 32], ['bush', 6], ['rock', 6], ['deadtree', 3]],
  open: [['bush', 10], ['rock', 4], ['tree', 3]],
  dry: [['rock', 10], ['boulder', 4], ['bush', 3], ['bones', 2]],
  wet: [['reed', 22], ['tree', 6], ['pond', 4], ['bush', 5]],
  relief: [['rock', 20], ['boulder', 10], ['pine', 4]],
  cold: [['rock', 8], ['pine', 3]],
  cursed: [['deadtree', 18], ['bones', 8], ['rock', 6], ['ruinblock', 3]],
  magic: [['crystal', 14], ['rock', 6], ['bush', 4]],
};
function featureSetFor(biomeKey) {
  const b = BIOMES.find(x => x.key === biomeKey) || BIOMES[5];
  if (b.tags.includes('evil')) return FEATURE_SETS.cursed;
  if (b.tags.includes('magic')) return FEATURE_SETS.magic;
  if (b.tags.includes('forest')) return b.tags.includes('cold') ? FEATURE_SETS.coldForest : FEATURE_SETS.forest;
  if (b.tags.includes('wet')) return FEATURE_SETS.wet;
  if (b.tags.includes('relief')) return FEATURE_SETS.relief;
  if (b.tags.includes('cold')) return FEATURE_SETS.cold;
  if (b.tags.includes('dry')) return FEATURE_SETS.dry;
  return FEATURE_SETS.open;
}

/**
 * One world cell blown up into a playable tile.
 * opts: { size = 64, metresPerCell = 10, density = 1, node = null (a node standing on this cell) }
 * Deterministic: the same world seed + cell always gives the same tile.
 */
export function generateLocalDetail(world, wx, wy, opts = {}) {
  const size = opts.size ?? 64;
  const metres = opts.metresPerCell ?? 10;
  const wi = IDX(world.width, clamp(Math.round(wx), 0, world.width - 1), clamp(Math.round(wy), 0, world.height - 1));
  const seed = subSeed(world.seed, `tile:${wx}:${wy}`);
  const rng = makeRng(seed);
  const n1 = makeNoise2D(subSeed(seed, 't1')), n2 = makeNoise2D(subSeed(seed, 't2'));
  const N = size * size;
  const elevation = new Float32Array(N), temperature = new Float32Array(N), moisture = new Float32Array(N);
  const aura = new Float32Array(N), magic = new Float32Array(N), water = new Uint8Array(N), biome = new Uint8Array(N);
  const slope = new Float32Array(N), flow = new Float32Array(N), river = new Uint8Array(N);
  const parentBiome = BIOMES[world.biome[wi]];

  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = IDX(size, x, y);
    const fx = wx - 0.5 + (x + 0.5) / size, fy = wy - 0.5 + (y + 0.5) / size;
    let e = sampleLayer(world, world.elevation, fx, fy);
    const relief = Math.max(0, sampleLayer(world, world.slope, fx, fy));
    e += (fbm(n1, x * 0.055, y * 0.055, { octaves: 4 }) - 0.5) * (0.05 + relief * 0.1);
    e += (fbm(n2, x * 0.16, y * 0.16, { octaves: 3 }) - 0.5) * (0.018 + relief * 0.03);
    elevation[i] = clamp(e, 0, 1);
    temperature[i] = clamp(sampleLayer(world, world.temperature, fx, fy), 0, 1);
    moisture[i] = clamp(sampleLayer(world, world.moisture, fx, fy) + (fbm(n2, x * 0.09 + 9, y * 0.09 + 4, { octaves: 3 }) - 0.5) * 0.2, 0, 1);
    aura[i] = sampleLayer(world, world.aura, fx, fy);
    magic[i] = sampleLayer(world, world.magic, fx, fy);
    water[i] = elevation[i] < 0.5 ? (world.water[wi] === 2 ? 2 : 1) : 0;
  }
  // a stream crosses the tile if the world cell carries a river
  if (world.river[wi]) {
    const amp = size * 0.18, mid = size / 2;
    const horizontal = rng() < 0.5;
    for (let t = 0; t < size; t++) {
      const off = Math.round(mid + Math.sin(t * 0.14 + rng() * 0.01) * amp * 0.6 + (fbm(n1, t * 0.09, 3.3, { octaves: 2 }) - 0.5) * amp);
      const wdt = Math.max(1, Math.round(world.river[wi] * 1.2));
      for (let k = -wdt; k <= wdt; k++) {
        const x = horizontal ? t : clamp(off + k, 0, size - 1), y = horizontal ? clamp(off + k, 0, size - 1) : t;
        const i = IDX(size, x, y);
        water[i] = 2; river[i] = world.river[wi]; elevation[i] = Math.min(elevation[i], 0.495);
      }
    }
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = IDX(size, x, y);
    const l = elevation[IDX(size, Math.max(0, x - 1), y)], r = elevation[IDX(size, Math.min(size - 1, x + 1), y)];
    const u = elevation[IDX(size, x, Math.max(0, y - 1))], d = elevation[IDX(size, x, Math.min(size - 1, y + 1))];
    slope[i] = clamp(Math.hypot(r - l, d - u) * 60, 0, 1);
    if (water[i]) { biome[i] = classify({ elev: elevation[i], temp: temperature[i], moist: 1, slope: 0, aura: aura[i], magic: magic[i], water: water[i], depth: 0.1, nearOcean: false, volcanic: false }); continue; }
    // a tile is mostly its world biome, but wet hollows, dry knolls and bare rock show through
    const local = classify({
      elev: elevation[i], temp: temperature[i], moist: moisture[i], slope: slope[i], aura: aura[i], magic: magic[i],
      water: 0, depth: 0, nearOcean: false, volcanic: world.volcanic[wi] === 1,
    }, 1);
    biome[i] = (local !== world.biome[wi] && rngMix(x, y) < 0.42) ? local : world.biome[wi];
  }

  // scatter props suited to the biome
  const set = featureSetFor(parentBiome.key);
  const total = set.reduce((s, [, n]) => s + n, 0);
  const density = (opts.density ?? 1) * (world.water[wi] === 0 ? 1 : 0.2);
  const count = Math.round(total * 4.5 * density * (size / 64) ** 2);
  const features = [];
  const clearing = { x: rng.range(size * 0.25, size * 0.75), y: rng.range(size * 0.25, size * 0.75), r: rng.range(size * 0.1, size * 0.22) };
  const node = opts.node || null;
  for (let k = 0; k < count * 3 && features.length < count; k++) {
    const x = rng.range(1, size - 1), y = rng.range(1, size - 1);
    const i = IDX(size, Math.round(x), Math.round(y));
    if (water[i] !== 0) continue;
    if ((x - clearing.x) ** 2 + (y - clearing.y) ** 2 < clearing.r ** 2 && rng() < 0.9) continue;   // keep the clearing open
    if (slope[i] > 0.8 && rng() < 0.6) continue;
    const kind = rng.weighted(set, e => e[1])[0];
    features.push({ kind, x, y, size: 0.7 + rng() * 0.7 });
  }
  // a footprint for whatever the node is
  if (node) {
    const cx = clearing.x, cy = clearing.y;
    if (node.type === 'settlement' || node.type === 'port' || node.type === 'camp') {
      const n = node.size >= 4 ? 22 : node.size >= 3 ? 14 : 7;
      for (let k = 0; k < n; k++) features.push({ kind: 'ruinblock', x: cx + rng.range(-clearing.r, clearing.r), y: cy + rng.range(-clearing.r, clearing.r), size: 1.1 });
      features.push({ kind: 'campfire', x: cx, y: cy, size: 1.2 });
    } else if (node.type === 'dungeon' || node.kind === 'ruin') {
      for (let k = 0; k < 12; k++) features.push({ kind: 'ruinblock', x: cx + rng.range(-clearing.r, clearing.r), y: cy + rng.range(-clearing.r, clearing.r), size: 1.2 });
      for (let k = 0; k < 5; k++) features.push({ kind: 'bones', x: cx + rng.range(-clearing.r, clearing.r), y: cy + rng.range(-clearing.r, clearing.r), size: 0.9 });
    } else if (node.kind === 'shrine' || node.kind === 'monolith') {
      for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; features.push({ kind: 'ruinblock', x: cx + Math.cos(a) * clearing.r * 0.6, y: cy + Math.sin(a) * clearing.r * 0.6, size: 1.1 }); }
    }
  }
  // ponds in wet ground
  if (moisture[IDX(size, size >> 1, size >> 1)] > 0.72 && world.water[wi] === 0) {
    const pn = rng.int(1, 3);
    for (let k = 0; k < pn; k++) features.push({ kind: 'pond', x: rng.range(4, size - 4), y: rng.range(4, size - 4), size: 1.4 + rng() * 1.6 });
  }

  const region = world.region && world.region[wi] >= 0 ? world.regions[world.region[wi]] : null;
  return {
    kind: 'local', schema: 1, seed, width: size, height: size, worldCell: { x: wx, y: wy }, metresPerCell: metres,
    elevation, temperature, moisture, aura, magic, water, biome, slope, flow, river,
    features, clearing, node: node ? { id: node.id, name: node.name, kind: node.kind } : null,
    biomeKey: parentBiome.key, biomeName: parentBiome.name,
    region: null, regions: [],
    title: node ? `${node.name} — ${parentBiome.name}` : region ? `${region.name} — ${parentBiome.name}` : parentBiome.name,
    sizeMetres: size * metres,
    relief: world.relief || null,
  };
}
