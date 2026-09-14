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
 * Build the playable grid for one world cell.
 * opts: { world, wx, wy, planet, data, size = 96, seed, nodeDensity = 1 }
 */
export function createLocalMap({ world, wx, wy, planet, data, size = 96, seed = null, nodeDensity = 1 } = {}) {
  const detail = generateLocalDetail(world, wx, wy, { size, density: 0.9 });
  const N = size * size;
  const s = seed ?? subSeed(world.seed, `foundry:${wx}:${wy}`);
  const rng = makeRng(s);

  const water = new Uint8Array(N), buildable = new Uint8Array(N), forest = new Uint8Array(N);
  const moveCost = new Float32Array(N), road = new Uint8Array(N);
  const occupied = new Int32Array(N).fill(-1);

  for (let i = 0; i < N; i++) {
    const b = BIOMES[detail.biome[i]];
    water[i] = detail.water[i] ? 1 : 0;
    const slope = detail.slope[i];
    moveCost[i] = water[i] ? Infinity : (b.move ?? 1.5) * (1 + slope * 2.2);
    buildable[i] = water[i] || slope > 0.78 ? 0 : 1;
    forest[i] = !water[i] && b.tags.includes('forest') ? 1 : 0;
  }
  // scattered props make a tile slower and a little harder to build on, but never block it
  for (const f of detail.features || []) {
    const x = Math.round(f.x), y = Math.round(f.y);
    if (x < 0 || y < 0 || x >= size || y >= size) continue;
    const i = IDX(size, x, y);
    if (water[i]) continue;
    if (f.kind === 'tree' || f.kind === 'pine') { forest[i] = 1; moveCost[i] += 0.5; }
    else if (f.kind === 'boulder' || f.kind === 'ruinblock') moveCost[i] += 0.8;
    else if (f.kind === 'pond') { water[i] = 1; buildable[i] = 0; moveCost[i] = Infinity; }
  }

  const map = {
    schema: 1, seed: s, width: size, height: size, size,
    worldCell: { x: wx, y: wy }, planetId: planet?.id ?? null,
    biomeKey: detail.biomeKey, biomeName: detail.biomeName, title: detail.title,
    elevation: detail.elevation, biome: detail.biome, slope: detail.slope,
    water, buildable, forest, moveCost, road, occupied,
    roadSpeed: ROAD_SPEED,
    features: detail.features, clearing: detail.clearing,
    nodes: [], nodeAt: new Int32Array(N).fill(-1),
    regrow: new Float32Array(N),                     // 0..1 biomass that has been cut and is coming back
  };
  placeNodes(map, { planet, data, rng, density: nodeDensity });
  return map;
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
function placeNodes(map, { planet, data, rng, density = 1 }) {
  const list = [...new Set([...(planet?.resources || []), ...(planet?.rareElements || [])])]
    .map(id => data.resource[id]).filter(Boolean);
  const scarce = new Set(planet?.scarce || []);
  if (!list.length) return;
  const target = Math.round((map.width * map.height) / 190 * density);
  const minGap = 6;
  let tries = 0;
  while (map.nodes.length < target && tries++ < target * 60) {
    const x = rng.int(2, map.width - 3), y = rng.int(2, map.height - 3);
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
      id: 'n' + map.nodes.length, resource: pick.id, kind: nk,
      x, y, index: i, radius: rare ? 2 : 3,
      amount, initial: amount, richness: +rich.toFixed(2),
      scanned: false, depleted: false, claimedBy: null,
    };
    map.nodes.push(node);
    stampNode(map, node, map.nodes.length - 1);
  }
  // If the survey says this world has it, this world has it. A resource on the planet's list that
  // the random scatter never happened to place is a chain the player can never finish - and when
  // that chain is the rocket, a run they can never leave. Anything listed gets at least one patch.
  for (const r of list) {
    if (map.nodes.some(n => n.resource === r.id)) continue;
    forceNode(map, r, rng, scarce.has(r.id) ? (BALANCE.map.scarceNodeAmount ?? 0.55) : 1);
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
function forceNode(map, resDef, rng, amountScale = 1) {
  const B = BALANCE.map;
  const nk = nodeKind(resDef);
  for (let tries = 0; tries < 400; tries++) {
    const x = rng.int(4, map.width - 5), y = rng.int(4, map.height - 5);
    const i = IDX(map.width, x, y);
    if (nk === 'fluid') { if (!map.buildable[i] && !map.water[i]) continue; }
    else if (!map.buildable[i]) continue;
    let room = true;
    for (let dy = -1; dy <= 1 && room; dy++) for (let dx = -1; dx <= 1; dx++) if (!map.buildable[IDX(map.width, x + dx, y + dy)]) { room = false; break; }
    if (!room) continue;
    if (map.nodes.some(n => (n.x - x) ** 2 + (n.y - y) ** 2 < 36)) continue;
    const rich = (resDef.found?.richness ?? 1) * rng.range(0.7, 1.3);
    const base = nk === 'fluid' || nk === 'gas' ? (B.fluidNodeSize ?? 60000) : resDef.kind === 'rare' ? (B.rareNodeSize ?? 9000) : (B.oreNodeSize ?? 26000);
    const amount = Math.round(base * rich * (B.nodeAmount ?? 1) * amountScale);
    const node = {
      id: 'n' + map.nodes.length, resource: resDef.id, kind: nk, x, y, index: i,
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
export function nodeUnderFootprint(map, x, y, w, h) {
  const counts = new Map();
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
    const n = nodeAtTile(map, x + dx, y + dy);
    if (n && !n.depleted) counts.set(n, (counts.get(n) || 0) + 1);
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
      for (let y = 3; y < map.height - 3 && !spot; y++) for (let x = 3; x < map.width - 3; x++) {
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
    // reuse a far-away node of a resource we are not short of, so the map keeps the same node count
    const spare = map.nodes
      .map((n, i) => ({ n, i, d: Math.hypot(n.x - site.x, n.y - site.y) }))
      .filter(e => e.d > outer + 14 && !need.includes(e.n.resource) && e.n.kind !== 'fluid' && e.n.kind !== 'gas' && e.n.kind !== 'rare')
      .sort((a, b) => b.d - a.d)[0];
    const node = spare ? spare.n : { id: 'n' + map.nodes.length, radius: 3, richness: 1, claimedBy: null, scanned: false, depleted: false };
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
  return got * rate;
}

/** Called once a second by the game: cut ground slowly comes back. */
export function tickRegrow(map, dt, rate = 1) {
  const step = 0.0006 * dt * rate;
  for (let i = 0; i < map.regrow.length; i++) {
    if (map.regrow[i] > 0) {
      map.regrow[i] = Math.max(0, map.regrow[i] - step);
      if (map.regrow[i] < 0.98 && !map.water[i]) map.forest[i] = 1;
    }
  }
}

/**
 * Where the pod comes down: flat, open, with resources nearby.
 *
 * Open ground dominates the score on purpose. A site with four ore patches in arm's reach but only
 * a quarter of the neighbourhood buildable is a base that runs out of room an hour in - which is
 * exactly what the sim kept doing before this was weighted properly.
 */
export function findLandingSite(map, { footprint = 4, stride = 2, openRadius = 18 } = {}) {
  const pad = footprint + 2;
  const rr = openRadius * openRadius;
  let best = null, bestScore = -Infinity, fallback = null, fallbackFree = -1;
  for (let y = 4; y < map.height - pad - 4; y += stride) for (let x = 4; x < map.width - pad - 4; x += stride) {
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
      if (xx < 1 || yy < 1 || xx >= map.width - 1 || yy >= map.height - 1) continue;   // off the tile is not room
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
