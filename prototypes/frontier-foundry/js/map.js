// The local map: the tile grid you actually build on.
//
// It is derived from worldgen's local detail for one world cell, so what you see here agrees with
// the world map above it. On top of the terrain we place resource nodes by biome and planet
// archetype, and every one of them starts hidden until something scans it.
//
//   import { createLocalMap, scanArea, findPath } from './map.js';
//   const map = createLocalMap({ world, wx, wy, planet, data, size: 96 });

import { generateLocalDetail } from '../../../worldgen/js/local.js';
import { BIOMES } from '../../../worldgen/js/biomes.js';
import { makeRng, subSeed } from '../../../worldgen/js/noise.js';
import { aStar } from '../../../worldgen/js/roads.js';
import { ROAD_SPEED, BALANCE } from './rules.js';

// Road speed per tier lives in js/rules.js so data/balance.json can tune it; the array is shared by
// reference, so a balance file loaded later reaches every map that was already built.
export { ROAD_SPEED };

const IDX = (w, x, y) => y * w + x;

/** Node kinds a structure's requiresNode list can name. */
export function nodeKind(resourceDef) {
  if (resourceDef.id === 'ice') return 'ice';
  if (resourceDef.kind === 'fluid') return 'fluid';
  if (resourceDef.kind === 'gas') return 'gas';
  if (resourceDef.kind === 'rare') return resourceDef.phase === 'liquid' ? 'fluid' : resourceDef.phase === 'gas' ? 'gas' : 'rare';
  if (resourceDef.kind === 'organic') return 'organic';
  if (resourceDef.kind === 'mineral') return 'mineral';
  return 'ore';
}

/**
 * Build the playable grid for one world cell — or, when `chunks` is more than one, for a square
 * block of world cells around it.
 *
 * The grid is one flat set of typed arrays so every tile index in the engine stays a plain
 * `y * width + x` for the whole life of the run. What changes with `chunks` is how much of that
 * grid has actually been generated: a chunk is one worldgen local tile (`size` × `size`) and it is
 * only filled in when something asks for it — the camera panning towards it, a save being reloaded,
 * or the warm ring laid down at landfall. A chunk that has not been generated is blank: not
 * buildable, impassable, no nodes, and under full fog, so nothing can reach it by accident.
 *
 * `chunks: 1` is the old single-tile map, which is what the engine tests and the balance sim use.
 *
 * opts: { world, wx, wy, planet, data, size = 96, chunks = 1, seed, nodeDensity = 1, warm }
 */
export function createLocalMap({ world, wx, wy, planet, data, size = 96, chunks = 1, seed = null, nodeDensity = 1, warm = null } = {}) {
  const CH = size;
  const cols = Math.max(1, Math.round(chunks));
  const W = CH * cols, H = CH * cols;
  const N = W * H;
  const s = seed ?? subSeed(world.seed, `foundry:${wx}:${wy}`);
  const centre = (cols - 1) >> 1;

  const map = {
    schema: 1, seed: s, width: W, height: H, size: CH,
    worldCell: { x: wx, y: wy }, planetId: planet?.id ?? null,
    biomeKey: null, biomeName: null, title: null,
    elevation: new Float32Array(N), biome: new Uint8Array(N), slope: new Float32Array(N),
    water: new Uint8Array(N), buildable: new Uint8Array(N), forest: new Uint8Array(N),
    moveCost: new Float32Array(N).fill(Infinity), road: new Uint8Array(N),
    occupied: new Int32Array(N).fill(-1),
    roadSpeed: ROAD_SPEED,
    features: [], clearing: null,
    nodes: [], nodeAt: new Int32Array(N).fill(-1), nodeSeq: 0,
    regrow: new Float32Array(N),
    cut: new Set(),                                  // tiles with biomass cut out of them, so regrow is not a full-map sweep
    chunk: {
      size: CH, cols, rows: cols, centre,
      originWx: wx - centre, originWy: wy - centre,
      ready: new Uint8Array(cols * cols),
      fresh: [],                                     // chunks generated since the renderer last looked
      version: 0, generated: 0,
      bounds: { x0: 0, y0: 0, x1: W - 1, y1: H - 1 },
    },
    gen: { world, planet, data, nodeDensity, seed: s },
  };
  // The block you start inside. One ring of neighbours means there is somewhere to walk and build
  // before anything has to stream in, and it is the region the landing site and the nests are
  // chosen from. On a one-chunk map that is simply the whole map.
  ensureChunks(map, centre, centre, warm ?? (cols > 1 ? 1 : 0));
  // A resource the survey says this world carries but the scatter never placed is a chain the
  // player can never finish. Guarantee one patch of each inside the starting block.
  const rng = makeRng(subSeed(s, 'guarantee'));
  const list = resourceList(map);
  const b = map.chunk.bounds;
  const scarce = new Set(planet?.scarce || []);
  for (const r of list) {
    // A scarce resource is one this archetype does not naturally carry but the rocket needs anyway.
    // Two small patches rather than one: a single titanium seam is about two hours of a mk2 drill,
    // and when it runs out the run is over even though the tree is finished.
    const want = scarce.has(r.id) ? (BALANCE.map.scarceNodeCount ?? 2) : 1;
    let have = map.nodes.filter(n => n.resource === r.id).length;
    while (have < want) {
      if (!forceNode(map, r, rng, scarce.has(r.id) ? (BALANCE.map.scarceNodeAmount ?? 0.55) : 1, b)) break;
      have++;
    }
  }
  return map;
}

/** The resources this planet can put in the ground. */
function resourceList(map) {
  const { planet, data } = map.gen;
  return [...new Set([...(planet?.resources || []), ...(planet?.rareElements || [])])]
    .map(id => data.resource[id]).filter(Boolean);
}

/** Which chunk a tile belongs to. */
export const chunkAt = (map, x, y) => map.chunk
  ? { cx: Math.floor(x / map.chunk.size), cy: Math.floor(y / map.chunk.size) }
  : { cx: 0, cy: 0 };

/** Has this tile been generated? A blank tile is unbuildable and impassable, so this is a hint, not a gate. */
export function isChunkReady(map, x, y) {
  const C = map.chunk;
  if (!C) return true;
  const cx = Math.floor(x / C.size), cy = Math.floor(y / C.size);
  if (cx < 0 || cy < 0 || cx >= C.cols || cy >= C.rows) return false;
  return !!C.ready[cy * C.cols + cx];
}

/**
 * Generate one chunk from worldgen and write it into the grid. Safe to call more than once — a
 * chunk that is already there is left alone. Returns true when it actually generated something.
 */
export function ensureChunk(map, cx, cy) {
  const C = map.chunk;
  if (!C) return false;
  if (cx < 0 || cy < 0 || cx >= C.cols || cy >= C.rows) return false;
  const k = cy * C.cols + cx;
  if (C.ready[k]) return false;

  const CH = C.size, ox = cx * CH, oy = cy * CH, W = map.width;
  const { world, planet, data, nodeDensity, seed } = map.gen;
  const detail = generateLocalDetail(world, C.originWx + cx, C.originWy + cy, { size: CH, density: 0.9 });

  for (let y = 0; y < CH; y++) for (let x = 0; x < CH; x++) {
    const src = IDX(CH, x, y), dst = IDX(W, ox + x, oy + y);
    const b = BIOMES[detail.biome[src]];
    map.elevation[dst] = detail.elevation[src];
    map.biome[dst] = detail.biome[src];
    const slope = map.slope[dst] = detail.slope[src];
    const wet = map.water[dst] = detail.water[src] ? 1 : 0;
    map.moveCost[dst] = wet ? Infinity : (b.move ?? 1.5) * (1 + slope * 2.2);
    map.buildable[dst] = wet || slope > 0.78 ? 0 : 1;
    map.forest[dst] = !wet && b.tags.includes('forest') ? 1 : 0;
  }
  // scattered props make a tile slower and a little harder to build on, but never block it
  for (const f of detail.features || []) {
    const x = Math.round(f.x), y = Math.round(f.y);
    if (x < 0 || y < 0 || x >= CH || y >= CH) continue;
    const dst = IDX(W, ox + x, oy + y);
    if (map.water[dst]) continue;
    if (f.kind === 'tree' || f.kind === 'pine') { map.forest[dst] = 1; map.moveCost[dst] += 0.5; }
    else if (f.kind === 'boulder' || f.kind === 'ruinblock') map.moveCost[dst] += 0.8;
    else if (f.kind === 'pond') { map.water[dst] = 1; map.buildable[dst] = 0; map.moveCost[dst] = Infinity; }
    map.features.push({ ...f, x: f.x + ox, y: f.y + oy });
  }

  blendEdges(map, cx, cy, ox, oy, CH);

  C.ready[k] = 1;
  C.generated++;
  // and only now decide what can be built on, with the whole chunk written (see refreshBuildable)
  refreshBuildable(map, ox - 1, oy - 1, ox + CH, oy + CH);
  C.fresh.push({ cx, cy, x: ox, y: oy, w: CH, h: CH });
  C.version++;
  growBounds(map, ox, oy, ox + CH - 1, oy + CH - 1);
  if (cx === C.centre && cy === C.centre) {
    map.biomeKey = detail.biomeKey; map.biomeName = detail.biomeName; map.title = detail.title;
    map.clearing = { x: detail.clearing.x + ox, y: detail.clearing.y + oy, r: detail.clearing.r };
  }

  const rng = makeRng(subSeed(seed, `chunk:${cx}:${cy}`));
  placeNodes(map, { planet, data, rng, density: nodeDensity, x0: ox, y0: oy, x1: ox + CH - 1, y1: oy + CH - 1 });
  return true;
}

/**
 * Dither the biome across a chunk boundary.
 *
 * worldgen gives each world cell one parent biome, so two neighbouring chunks meet along a razor
 * straight line - which on a map you can walk across reads as a rendering bug rather than as
 * scrubland giving way to forest. Near each edge some tiles take the neighbour's biome instead,
 * with the chance falling off inland, so the two interlock. Both sides run this, so the band is
 * symmetrical however the chunks happen to stream in.
 */
function blendEdges(map, cx, cy, ox, oy, CH) {
  const C = map.chunk, W = map.width;
  const world = map.gen.world;
  const wIdx = (x, y) => clampInt(y, 0, world.height - 1) * world.width + clampInt(x, 0, world.width - 1);
  const mine = world.biome[wIdx(C.originWx + cx, C.originWy + cy)];
  const band = Math.min(16, CH >> 2);
  const rng = makeRng(subSeed(map.seed, `blend:${cx}:${cy}`));
  const SIDES = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  for (const [dx, dy] of SIDES) {
    const gx = cx + dx, gy = cy + dy;
    if (gx < 0 || gy < 0 || gx >= C.cols || gy >= C.rows) continue;
    const theirs = world.biome[wIdx(C.originWx + gx, C.originWy + gy)];
    if (theirs === mine) continue;
    const b = BIOMES[theirs];
    if (!b) continue;
    for (let y = 0; y < CH; y++) for (let x = 0; x < CH; x++) {
      const d = dy < 0 ? y : dy > 0 ? CH - 1 - y : dx < 0 ? x : CH - 1 - x;
      if (d >= band) continue;
      if (rng() > 0.55 * (1 - d / band) ** 1.5) continue;
      const i = IDX(W, ox + x, oy + y);
      if (map.water[i]) continue;
      map.biome[i] = theirs;
      map.moveCost[i] = (b.move ?? 1.5) * (1 + map.slope[i] * 2.2);
      map.buildable[i] = map.slope[i] > 0.78 ? 0 : 1;
      map.forest[i] = b.tags.includes('forest') ? 1 : 0;
    }
  }
}

const clampInt = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** A real cliff: nothing stands on it however flat its neighbours are. */
export const CLIFF_SLOPE = 1.15;
/** The most tilted ground a building will sit on, measured over a tile and its four neighbours. */
export const BUILD_SLOPE = 0.82;

/** Mean slope over a tile and the four around it. */
function areaSlope(map, x, y) {
  const W = map.width, H = map.height;
  let sum = map.slope[y * W + x], n = 1;
  if (x > 0) { sum += map.slope[y * W + x - 1]; n++; }
  if (x < W - 1) { sum += map.slope[y * W + x + 1]; n++; }
  if (y > 0) { sum += map.slope[(y - 1) * W + x]; n++; }
  if (y < H - 1) { sum += map.slope[(y + 1) * W + x]; n++; }
  return sum / n;
}

/**
 * Work out what can be built on, over a box of tiles.
 *
 * worldgen's per-tile slope is speckled: a flat shelf comes out peppered with single steep tiles,
 * and a factory wants 3x3 and 4x4 blocks of clear ground. Judging each tile on its own left seed 7
 * with 190 legal 4x4 spots on a whole 96x96 map - the bot's base ran out of room somewhere around
 * chemistry and the run simply stopped. Averaging the slope over the tile and its four neighbours
 * keeps genuine cliffs (`CLIFF_SLOPE`) unbuildable and turns the speckle back into ground. Movement
 * cost still reads the raw slope, so rough ground is still slow to cross.
 */
export function refreshBuildable(map, x0, y0, x1, y1) {
  const W = map.width;
  x0 = Math.max(0, x0); y0 = Math.max(0, y0);
  x1 = Math.min(map.width - 1, x1); y1 = Math.min(map.height - 1, y1);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * W + x;
    if (map.chunk && !isChunkReady(map, x, y)) continue;
    if (map.water[i]) { map.buildable[i] = 0; continue; }
    map.buildable[i] = map.slope[i] <= CLIFF_SLOPE && areaSlope(map, x, y) <= BUILD_SLOPE ? 1 : 0;
  }
}

/** Widen the box that says how much of the grid is real. */
function growBounds(map, x0, y0, x1, y1) {
  const b = map.chunk.bounds;
  if (map.chunk.generated === 1) { b.x0 = x0; b.y0 = y0; b.x1 = x1; b.y1 = y1; return; }
  b.x0 = Math.min(b.x0, x0); b.y0 = Math.min(b.y0, y0);
  b.x1 = Math.max(b.x1, x1); b.y1 = Math.max(b.y1, y1);
}

/** The box of the grid that has been generated: everything outside it is blank. */
export const generatedBounds = map => map.chunk ? map.chunk.bounds : { x0: 0, y0: 0, x1: map.width - 1, y1: map.height - 1 };

/** Generate the chunk at (cx, cy) and every chunk within `ring` of it. Returns how many were new. */
export function ensureChunks(map, cx, cy, ring = 0) {
  let made = 0;
  for (let dy = -ring; dy <= ring; dy++) for (let dx = -ring; dx <= ring; dx++) {
    if (ensureChunk(map, cx + dx, cy + dy)) made++;
  }
  return made;
}

/** The same thing in tile coordinates: keep a (2*ring+1)² block of chunks around this spot loaded. */
export function ensureChunksAround(map, x, y, ring = 1) {
  if (!map.chunk) return 0;
  const { cx, cy } = chunkAt(map, x, y);
  return ensureChunks(map, cx, cy, ring);
}

/** Hand the renderer the chunks generated since it last asked, and clear the list. */
export function takeFreshChunks(map) {
  if (!map.chunk) return [];
  const out = map.chunk.fresh;
  map.chunk.fresh = [];
  return out;
}

/** Weight for putting a resource on this tile: biome match counts for most of it. */
function affinity(resDef, biomeKey, tileWater) {
  const f = resDef.found || {};
  const listed = f.biomes && f.biomes.length ? f.biomes.includes(biomeKey) : true;
  let w = (f.rarity ?? 0.5) * (listed ? 3 : 0.35);
  if (resDef.kind === 'fluid' && tileWater) w *= 1.6;
  return w;
}

/** Scatter hidden resource patches over the map. */
function placeNodes(map, { planet, data, rng, density = 1, x0 = 1, y0 = 1, x1 = null, y1 = null }) {
  const list = [...new Set([...(planet?.resources || []), ...(planet?.rareElements || [])])]
    .map(id => data.resource[id]).filter(Boolean);
  const scarce = new Set(planet?.scarce || []);
  if (!list.length) return;
  // one chunk at a time: the density is per tile, so a streamed-in chunk gets the same scatter the
  // starting one did
  const ax = Math.max(2, x0), ay = Math.max(2, y0);
  const bx = Math.min(map.width - 3, x1 ?? map.width - 3), by = Math.min(map.height - 3, y1 ?? map.height - 3);
  if (bx <= ax || by <= ay) return;
  const target = Math.round(((bx - ax + 1) * (by - ay + 1)) / 190 * density);
  const minGap = 6;
  let made = 0, tries = 0;
  while (made < target && tries++ < target * 60) {
    const x = rng.int(ax, bx), y = rng.int(ay, by);
    const i = IDX(map.width, x, y);
    if (!map.buildable[i] && !map.water[i]) continue;
    let clash = false;
    for (const n of map.nodes) if ((n.x - x) ** 2 + (n.y - y) ** 2 < minGap * minGap) { clash = true; break; }
    if (clash) continue;
    const biomeKey = BIOMES[map.biome[i]].key;
    const weights = list.map(r => affinity(r, biomeKey, map.water[i]) * (scarce.has(r.id) ? (BALANCE.map.scarceNodeWeight ?? 0.35) : 1));
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) continue;
    let r = rng() * total, pick = list[0];
    for (let k = 0; k < list.length; k++) { r -= weights[k]; if (r <= 0) { pick = list[k]; break; } }
    // fluids and gases need a spot a pump can stand on; solids do not sit in deep water
    if (map.water[i] && pick.kind !== 'fluid') continue;
    // a node nothing can be built on is a node that does not exist - demand room for a 3x3 drill
    let room = true;
    for (let dy = -1; dy <= 1 && room; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!map.buildable[IDX(map.width, x + dx, y + dy)]) { room = false; break; }
    }
    if (!room) continue;
    const rich = (pick.found?.richness ?? 1) * rng.range(0.6, 1.5);
    const rare = pick.kind === 'rare';
    const B = BALANCE.map;
    const nk = nodeKind(pick);
    const base = nk === 'fluid' || nk === 'gas' ? (B.fluidNodeSize ?? 60000) : rare ? (B.rareNodeSize ?? 9000) : (B.oreNodeSize ?? 26000);
    // a resource this archetype does not naturally carry is still here - the rocket has to be
    // buildable on every world - but the patches are small, so it is a reason to go looking
    const amount = Math.round(base * rich * (B.nodeAmount ?? 1) * (scarce.has(pick.id) ? (B.scarceNodeAmount ?? 0.55) : 1));
    const node = {
      id: 'n' + (map.nodeSeq++), resource: pick.id, kind: nk,
      x, y, index: i, radius: rare ? 2 : 3,
      amount, initial: amount, richness: +rich.toFixed(2),
      scanned: false, depleted: false, claimedBy: null,
    };
    map.nodes.push(node);
    stampNode(map, node, map.nodes.length - 1);
    made++;
  }
}

/** Write a node's disc into the lookup grid. */
function stampNode(map, node, index) {
  for (let dy = -node.radius; dy <= node.radius; dy++) for (let dx = -node.radius; dx <= node.radius; dx++) {
    const xx = node.x + dx, yy = node.y + dy;
    if (xx < 0 || yy < 0 || xx >= map.width || yy >= map.height) continue;
    if (dx * dx + dy * dy > node.radius * node.radius) continue;
    map.nodeAt[IDX(map.width, xx, yy)] = index;
  }
}

/** Drop one patch of a resource anywhere there is room for a drill. */
function forceNode(map, resDef, rng, amountScale = 1, box = null) {
  const B = BALANCE.map;
  const nk = nodeKind(resDef);
  const ax = Math.max(4, box?.x0 ?? 4), ay = Math.max(4, box?.y0 ?? 4);
  const bx = Math.min(map.width - 5, box?.x1 ?? map.width - 5), by = Math.min(map.height - 5, box?.y1 ?? map.height - 5);
  // Random darts first, then - because a guaranteed resource has to actually be there - a sweep of
  // every tile in the box at a shrinking minimum gap. A sulfur patch that never got placed is a
  // world where science stops at the second pack tier and the rocket is unreachable, and on a rough
  // map four hundred random tries genuinely did miss.
  const spots = [];
  for (let tries = 0; tries < 400; tries++) spots.push([rng.int(ax, bx), rng.int(ay, by), 36]);
  for (const gap of [36, 16, 4]) for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) spots.push([x, y, gap]);
  for (const [x, y, minGap] of spots) {
    const i = IDX(map.width, x, y);
    if (nk === 'fluid') { if (!map.buildable[i] && !map.water[i]) continue; }
    else if (!map.buildable[i]) continue;
    let room = true;
    for (let dy = -1; dy <= 1 && room; dy++) for (let dx = -1; dx <= 1; dx++) if (!map.buildable[IDX(map.width, x + dx, y + dy)]) { room = false; break; }
    if (!room) continue;
    if (map.nodes.some(n => (n.x - x) ** 2 + (n.y - y) ** 2 < minGap)) continue;
    const rich = (resDef.found?.richness ?? 1) * rng.range(0.7, 1.3);
    const base = nk === 'fluid' || nk === 'gas' ? (B.fluidNodeSize ?? 60000) : resDef.kind === 'rare' ? (B.rareNodeSize ?? 9000) : (B.oreNodeSize ?? 26000);
    const amount = Math.round(base * rich * (B.nodeAmount ?? 1) * amountScale);
    const node = {
      id: 'n' + (map.nodeSeq++), resource: resDef.id, kind: nk, x, y, index: i,
      radius: resDef.kind === 'rare' ? 2 : 3, amount, initial: amount, richness: +rich.toFixed(2),
      scanned: false, depleted: false, claimedBy: null,
    };
    map.nodes.push(node);
    stampNode(map, node, map.nodes.length - 1);
    return node;
  }
  return null;
}

/** The node covering a tile, or null. */
export function nodeAtTile(map, x, y) {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return null;
  const k = map.nodeAt[IDX(map.width, x, y)];
  return k < 0 ? null : map.nodes[k];
}

/** The node a w x h footprint at (x,y) sits on: the one covering the most of it. */
export function nodeUnderFootprint(map, x, y, w, h, { includeDepleted = false } = {}) {
  const counts = new Map();
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
    const n = nodeAtTile(map, x + dx, y + dy);
    if (n && (includeDepleted || !n.depleted)) counts.set(n, (counts.get(n) || 0) + 1);
  }
  let best = null, bestN = 0;
  for (const [n, c] of counts) if (c > bestN) { best = n; bestN = c; }
  return best;
}

/** Reveal every node whose centre is within r of (x,y). Returns the ones that were hidden. */
export function scanArea(map, x, y, r) {
  const found = [];
  for (const n of map.nodes) {
    if (n.scanned) continue;
    if ((n.x - x) ** 2 + (n.y - y) ** 2 <= r * r) { n.scanned = true; found.push(n); }
  }
  return found;
}

/** A cost field for ground movement. blockedCost lets callers make walls expensive but not impossible. */
export function costField(map, { blockedCost = Infinity, waterCost = Infinity, ignoreRoads = false } = {}) {
  const N = map.width * map.height;
  const cost = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    if (map.water[i]) { cost[i] = map.road[i] ? 1.2 : waterCost; continue; }
    let c = map.moveCost[i];
    if (!ignoreRoads && map.road[i]) c = 1 / (ROAD_SPEED[map.road[i]] ?? 1);
    if (map.occupied[i] >= 0 && map.blocking && map.blocking.has(map.occupied[i])) c = blockedCost;
    cost[i] = c;
  }
  return cost;
}

/** A* between two tiles. Returns an array of tile indices or null. */
export function findPath(map, from, to, opts = {}) {
  const cost = opts.cost || costField(map, opts);
  return aStar({ width: map.width, height: map.height }, from, to, cost, { endpointsFree: true, maxExpand: opts.maxExpand || 0 });
}

/**
 * A Dijkstra field over the whole map pointing at one goal. Enemies share one of these per wave,
 * which is much cheaper than an A* each.
 */
export function flowField(map, goalIndex, cost) {
  const N = map.width * map.height, w = map.width;
  const dist = new Float64Array(N).fill(Infinity);
  const next = new Int32Array(N).fill(-1);
  dist[goalIndex] = 0;
  const hk = [0], hv = [goalIndex];
  const push = (k, v) => { hk.push(k); hv.push(v); let i = hk.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (hk[p] <= hk[i]) break; [hk[p], hk[i]] = [hk[i], hk[p]]; [hv[p], hv[i]] = [hv[i], hv[p]]; i = p; } };
  const pop = () => { const top = hv[0], lk = hk.pop(), lv = hv.pop(); if (hk.length) { hk[0] = lk; hv[0] = lv; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < hk.length && hk[l] < hk[m]) m = l; if (r < hk.length && hk[r] < hk[m]) m = r; if (m === i) break; [hk[m], hk[i]] = [hk[i], hk[m]]; [hv[m], hv[i]] = [hv[i], hv[m]]; i = m; } } return top; };
  const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
  while (hk.length) {
    const cur = pop();
    const d0 = dist[cur];
    const x = cur % w, y = (cur / w) | 0;
    for (const [dx, dy, k] of DIRS) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= map.width || yy >= map.height) continue;
      const j = yy * w + xx;
      const c = cost[j];
      if (!isFinite(c)) continue;
      const nd = d0 + c * k;
      if (nd < dist[j]) { dist[j] = nd; next[j] = cur; push(nd, j); }
    }
  }
  return { dist, next, goal: goalIndex };
}

/**
 * A landing site with no iron, fuel, copper or stone inside the pod's own reach is not a puzzle, it
 * is a dead run - there would be nothing to haul the first ore with. This drops (or moves) one
 * patch of each starter resource into the ring just outside the pod, so every start is playable and
 * the interesting hauling problem starts with the second ring instead.
 */
export function ensureStarterNodes(map, data, site, rng, { need = ['iron_ore', 'coal', 'copper_ore', 'stone'], inner = 5, outer = 10 } = {}) {
  const placed = [];
  for (const res of need) {
    const def = data.resource[res];
    if (!def) continue;
    const close = map.nodes.find(n => !n.depleted && n.resource === res && Math.hypot(n.x - site.x, n.y - site.y) <= outer);
    if (close) { placed.push(close); continue; }
    // a free ring position with room for a drill - scanned properly, widening if the ring is tight
    let spot = null;
    for (let pass = 0; pass < 3 && !spot; pass++) {
      const lo = inner, hi = outer + pass * 3, gap = 5 - pass;
      const cands = [];
      // only the ring matters, so walk the box around it rather than the whole grid - on a chunked
      // map that is the difference between 400 tiles and a quarter of a million
      const ry0 = Math.max(3, Math.floor(site.y - hi)), ry1 = Math.min(map.height - 4, Math.ceil(site.y + hi));
      const rx0 = Math.max(3, Math.floor(site.x - hi)), rx1 = Math.min(map.width - 4, Math.ceil(site.x + hi));
      for (let y = ry0; y <= ry1 && !spot; y++) for (let x = rx0; x <= rx1; x++) {
        const d = Math.hypot(x - site.x, y - site.y);
        if (d < lo || d > hi) continue;
        let room = true;
        for (let dy = -1; dy <= 1 && room; dy++) for (let dx = -1; dx <= 1; dx++) if (!map.buildable[IDX(map.width, x + dx, y + dy)]) { room = false; break; }
        if (!room) continue;
        if (map.nodes.some(n => !n.depleted && Math.hypot(n.x - x, n.y - y) < gap)) continue;
        if (placed.some(n => Math.hypot(n.x - x, n.y - y) < gap)) continue;
        cands.push({ x, y });
      }
      if (cands.length) spot = cands[Math.floor(rng() * cands.length)];
    }
    if (!spot) continue;
    // Reuse a far-away node of a resource we have plenty of, so the map keeps the same node count.
    // Never the *last* patch of anything: this used to quietly eat the only sulfur (or titanium, or
    // tungsten) patch on the map to make another iron one, and a world with no sulfur is a world
    // where science stops at the second pack tier and the rocket can never be built.
    const spread = new Map();
    for (const n of map.nodes) if (!n.depleted) spread.set(n.resource, (spread.get(n.resource) || 0) + 1);
    const spare = map.nodes
      .map((n, i) => ({ n, i, d: Math.hypot(n.x - site.x, n.y - site.y) }))
      .filter(e => e.d > outer + 14 && !need.includes(e.n.resource) && e.n.kind !== 'fluid' && e.n.kind !== 'gas' && e.n.kind !== 'rare')
      .filter(e => (spread.get(e.n.resource) || 0) > 1)
      .sort((a, b) => b.d - a.d)[0];
    const node = spare ? spare.n : { id: 'n' + (map.nodeSeq++), radius: 3, richness: 1, claimedBy: null, scanned: false, depleted: false };
    if (spare) for (let dy = -node.radius; dy <= node.radius; dy++) for (let dx = -node.radius; dx <= node.radius; dx++) {
      const xx = node.x + dx, yy = node.y + dy;
      if (xx < 0 || yy < 0 || xx >= map.width || yy >= map.height) continue;
      const i = IDX(map.width, xx, yy);
      if (map.nodeAt[i] === spare.i) map.nodeAt[i] = -1;
    }
    node.resource = res;
    node.kind = nodeKind(def);
    node.x = spot.x; node.y = spot.y; node.index = IDX(map.width, spot.x, spot.y);
    node.richness = Math.max(1, node.richness);
    node.amount = node.initial = Math.round(34000 * node.richness);
    node.depleted = false; node.claimedBy = null;
    const idx = spare ? spare.i : map.nodes.push(node) - 1;
    for (let dy = -node.radius; dy <= node.radius; dy++) for (let dx = -node.radius; dx <= node.radius; dx++) {
      const xx = spot.x + dx, yy = spot.y + dy;
      if (xx < 0 || yy < 0 || xx >= map.width || yy >= map.height) continue;
      if (dx * dx + dy * dy > node.radius * node.radius) continue;
      map.nodeAt[IDX(map.width, xx, yy)] = idx;
    }
    placed.push(node);
  }
  return placed;
}

/** Cut biomass out of a tile; it grows back over time. */
export function harvestTile(map, i, amount, rate = 1) {
  if (!map.forest[i]) return 0;
  const left = 1 - map.regrow[i];
  const got = Math.min(amount, left * 6);
  map.regrow[i] = Math.min(1, map.regrow[i] + got / 6);
  if (map.regrow[i] >= 1) map.forest[i] = 0;
  if (map.cut) map.cut.add(i); else map.cut = new Set([i]);
  return got * rate;
}

/**
 * Called once a second by the game: cut ground slowly comes back.
 *
 * Only the tiles something has actually cut are walked. A full-grid sweep was fine on one 96×96
 * tile and is a quarter of a million pointless reads a second on a streamed map.
 */
export function tickRegrow(map, dt, rate = 1) {
  const step = 0.0006 * dt * rate;
  if (!map.cut) {                                     // a map from an older save: rebuild the list once
    map.cut = new Set();
    for (let i = 0; i < map.regrow.length; i++) if (map.regrow[i] > 0) map.cut.add(i);
  }
  if (!map.cut.size) return;
  for (const i of map.cut) {
    const v = Math.max(0, map.regrow[i] - step);
    map.regrow[i] = v;
    if (v < 0.98 && !map.water[i]) map.forest[i] = 1;
    if (v <= 0) map.cut.delete(i);
  }
}

/**
 * Where the pod comes down: flat, open, with resources nearby.
 *
 * Open ground dominates the score on purpose. A site with four ore patches in arm's reach but only
 * a quarter of the neighbourhood buildable is a base that runs out of room an hour in - which is
 * exactly what the sim kept doing before this was weighted properly.
 */
export function findLandingSite(map, { footprint = 4, stride = 2, openRadius = 18, box = null } = {}) {
  const pad = footprint + 2;
  const rr = openRadius * openRadius;
  // On a streamed map the pod comes down on the world cell you aimed at, not somewhere three
  // chunks away, so the search is the centre chunk unless a caller says otherwise.
  const C = map.chunk;
  const area = box || (C && C.cols > 1
    ? { x0: C.centre * C.size, y0: C.centre * C.size, x1: (C.centre + 1) * C.size - 1, y1: (C.centre + 1) * C.size - 1 }
    : { x0: 0, y0: 0, x1: map.width - 1, y1: map.height - 1 });
  const ax = Math.max(4, area.x0), ay = Math.max(4, area.y0);
  const bx = Math.min(map.width - pad - 4, area.x1), by = Math.min(map.height - pad - 4, area.y1);
  let best = null, bestScore = -Infinity, fallback = null, fallbackFree = -1;
  for (let y = ay; y < by; y += stride) for (let x = ax; x < bx; x += stride) {
    let free = 0;
    for (let dy = 0; dy < pad; dy++) for (let dx = 0; dx < pad; dx++) free += map.buildable[IDX(map.width, x + dx, y + dy)];
    if (free > fallbackFree) { fallbackFree = free; fallback = { x, y, score: 0 }; }
    if (free < pad * pad) continue;
    // how much of the neighbourhood you could actually build a factory on
    let open = 0, seen = 0;
    for (let dy = -openRadius; dy <= openRadius; dy += 2) for (let dx = -openRadius; dx <= openRadius; dx += 2) {
      if (dx * dx + dy * dy > rr) continue;
      const xx = x + dx, yy = y + dy;
      seen++;
      if (xx < ax - 2 || yy < ay - 2 || xx > bx + pad + 2 || yy > by + pad + 2) continue;   // off the tile is not room
      open += map.buildable[IDX(map.width, xx, yy)];
    }
    let score = (open / Math.max(1, seen)) * 60;
    for (const n of map.nodes) {
      const d = Math.hypot(n.x - x, n.y - y);
      if (d < 34) score += (34 - d) / 34 * (n.kind === 'rare' ? 0.6 : 1);
    }
    if (score > bestScore) { bestScore = score; best = { x, y, score: +score.toFixed(2), open: +(open / Math.max(1, seen)).toFixed(2) }; }
  }
  return best || fallback || { x: Math.floor(map.width / 2), y: Math.floor(map.height / 2), score: 0 };
}
