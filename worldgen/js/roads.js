// Roads and sea lanes.
//
// Settlements on the same landmass are joined by a minimum spanning tree (the cheapest set of links
// that still reaches everyone), plus a few extra links so the network loops like a real one instead
// of looking like a family tree. Each link is routed cell by cell with A* over a cost field, so
// roads hug valleys, take mountain passes, and pay for river crossings — which is where bridges and
// fords get placed. Ports on different landmasses are joined by sea lanes over open water.
//
//   import { buildRoads, aStar, roadCostField } from './roads.js';
//   buildRoads(world, opts);   // fills world.roads, world.seaLanes, adds bridge nodes

import { makeRng, subSeed, clamp } from './noise.js';
import { BIOMES } from './biomes.js';
import { Namer } from './names.js';

const IDX = (w, x, y) => y * w + x;
const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];

/** Per-cell travel cost for land routes. Impassable cells are Infinity. */
export function roadCostField(world) {
  const N = world.width * world.height;
  const cost = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    if (world.water[i] !== 0) { cost[i] = Infinity; continue; }
    const b = BIOMES[world.biome[i]];
    // Steep ground now costs superlinearly. With a linear term a road would happily climb straight
    // over a mountain because the extra cost was small; squaring it makes a switchback cheaper.
    const sl = world.slope[i];
    let c = (b.move ?? 1.5) * (1 + sl * 2.6 + sl * sl * 16);
    if (world.passCells && world.passCells[i]) c *= 0.3;         // a known pass is the way through
    if (world.river[i]) c += 6 + world.river[i] * 5;             // crossings cost — this is where bridges go
    if (world.aura[i] > 0.5) c *= 1.25;                          // people route around cursed ground
    cost[i] = c;
  }
  return cost;
}

/** Per-cell cost for sea routes: open water only, deeper water slightly faster than shoals. */
export function seaCostField(world) {
  const N = world.width * world.height;
  const cost = new Float32Array(N);
  for (let i = 0; i < N; i++) cost[i] = world.water[i] === 1 ? (world.elevation[i] < 0.3 ? 1 : 1.4) : Infinity;
  return cost;
}

/**
 * A* over the grid. `cost` is a per-cell Float32Array (Infinity = blocked); start/goal are cell
 * indices. Returns an array of cell indices, or null when there is no route.
 * `endpointsFree` lets a route start or finish on a blocked cell (a port sitting on land, say).
 */
export function aStar(world, start, goal, cost, { endpointsFree = true, maxExpand = 0, climb = 0 } = {}) {
  const w = world.width, h = world.height, N = w * h;
  if (start === goal) return [start];
  const g = new Float64Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const gx = goal % w, gy = (goal / w) | 0;
  let minCost = Infinity;
  for (let i = 0; i < N; i++) if (cost[i] < minCost) minCost = cost[i];
  if (!isFinite(minCost) || minCost <= 0) minCost = 0.5;
  const heuristic = i => { const x = i % w, y = (i / w) | 0; return Math.hypot(x - gx, y - gy) * minCost; };
  const hk = [], hv = [];
  const push = (k, v) => { hk.push(k); hv.push(v); let i = hk.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (hk[p] <= hk[i]) break; [hk[p], hk[i]] = [hk[i], hk[p]]; [hv[p], hv[i]] = [hv[i], hv[p]]; i = p; } };
  const pop = () => { const top = hv[0], lk = hk.pop(), lv = hv.pop(); if (hk.length) { hk[0] = lk; hv[0] = lv; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < hk.length && hk[l] < hk[m]) m = l; if (r < hk.length && hk[r] < hk[m]) m = r; if (m === i) break; [hk[m], hk[i]] = [hk[i], hk[m]]; [hv[m], hv[i]] = [hv[i], hv[m]]; i = m; } } return top; };
  g[start] = 0; push(heuristic(start), start);
  let expanded = 0;
  while (hk.length) {
    const cur = pop();
    if (cur === goal) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    if (maxExpand && ++expanded > maxExpand) return null;
    const x = cur % w, y = (cur / w) | 0;
    for (const [dx, dy, k] of DIRS) {
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const j = IDX(w, xx, yy);
      if (closed[j]) continue;
      let c = cost[j];
      if (!isFinite(c)) { if (!(endpointsFree && j === goal)) continue; c = 1; }
      let step = c * k;
      // the cost of the climb itself, which is what sends a route round a peak instead of over it
      if (climb > 0) step += Math.abs(world.elevation[j] - world.elevation[cur]) * climb * k;
      const ng = g[cur] + step;
      if (ng < g[j]) { g[j] = ng; came[j] = cur; push(ng + heuristic(j), j); }
    }
  }
  if (came[goal] < 0 && goal !== start) return null;
  const path = [goal];
  let cur = goal, guard = 0;
  while (cur !== start && guard++ < N) { cur = came[cur]; if (cur < 0) return null; path.push(cur); }
  return path.reverse();
}

/** Minimum spanning tree over points by straight-line distance (Prim's). Returns [aIndex, bIndex] pairs. */
function mst(points) {
  const n = points.length; if (n < 2) return [];
  const inTree = new Uint8Array(n), best = new Float64Array(n).fill(Infinity), from = new Int32Array(n).fill(-1);
  best[0] = 0; const edges = [];
  for (let it = 0; it < n; it++) {
    let pick = -1, bv = Infinity;
    for (let i = 0; i < n; i++) if (!inTree[i] && best[i] < bv) { bv = best[i]; pick = i; }
    if (pick < 0) break;
    inTree[pick] = 1;
    if (from[pick] >= 0) edges.push([from[pick], pick]);
    for (let i = 0; i < n; i++) {
      if (inTree[i]) continue;
      const d = (points[i].x - points[pick].x) ** 2 + (points[i].y - points[pick].y) ** 2;
      if (d < best[i]) { best[i] = d; from[i] = pick; }
    }
  }
  return edges;
}

const CLASS_OF = (a, b) => {
  const rank = { capital: 4, city: 3, town: 2, village: 1, hamlet: 0, port: 1 };
  const lo = Math.min(rank[a.tier || a.kind] ?? 0, rank[b.tier || b.kind] ?? 0);
  return lo >= 3 ? 'highway' : lo >= 1 ? 'road' : 'trail';
};

export function buildRoads(world, opts) {
  const w = world.width, h = world.height;
  const rng = makeRng(subSeed(world.seed, 'roads'));
  const namer = world._namer || (world._namer = new Namer({ namegen: opts.namegen, raceTable: opts.raceTable, seed: world.seed }));
  // nobody lives here: no roads, no bridges or fords, no sea lanes — skipped, not built and hidden
  if (opts.inhabited === false) {
    world.roads = [];
    world.seaLanes = [];
    world.roadCells = new Uint8Array(world.width * world.height);
    for (const r of world.rivers) r.navigable = false;
    return world;
  }
  const cost = roadCostField(world);
  const roads = [];
  const bridgeCells = new Map();
  const linked = new Set();

  const hubs = world.nodes.filter(n => n.type === 'settlement' || n.type === 'port');
  const byContinent = new Map();
  for (const n of hubs) {
    const c = world.continentOf ? world.continentOf[n.index] : 0;
    if (!byContinent.has(c)) byContinent.set(c, []);
    byContinent.get(c).push(n);
  }

  const addRoad = (a, b) => {
    const key = a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
    if (linked.has(key)) return null;
    const path = aStar(world, a.index, b.index, cost, { climb: opts.roadClimb ?? 320 });
    if (!path) return null;
    linked.add(key);
    const bridges = [];
    let length = 0;
    for (let i = 1; i < path.length; i++) {
      const p = path[i], q = path[i - 1];
      length += Math.hypot((p % w) - (q % w), ((p / w) | 0) - ((q / w) | 0));
      if (world.river[p]) { bridges.push(p); if (!bridgeCells.has(p)) bridgeCells.set(p, world.river[p]); }
    }
    const road = { id: roads.length, class: CLASS_OF(a, b), from: a.id, to: b.id, cells: path, length: Math.round(length * 10) / 10, bridges };
    roads.push(road);
    return road;
  };

  // one network per landmass
  for (const [, group] of byContinent) {
    if (group.length < 2) continue;
    for (const [ai, bi] of mst(group)) addRoad(group[ai], group[bi]);
    // extra links so the network loops: join some towns to their second-nearest neighbour
    const extras = Math.round(group.length * clamp(opts.roadExtras, 0, 1) * 0.6);
    const order = group.map((n, i) => i); rng.shuffle(order);
    let made = 0;
    for (const i of order) {
      if (made >= extras) break;
      const a = group[i];
      const near = group
        .map((n, j) => ({ n, j, d: (n.x - a.x) ** 2 + (n.y - a.y) ** 2 }))
        .filter(o => o.j !== i)
        .sort((p, q) => p.d - q.d)
        .slice(1, 4);
      const pick = near[Math.floor(rng() * near.length)];
      if (!pick) continue;
      if (addRoad(a, pick.n)) made++;
    }
  }

  // ---- bridges and fords become nodes of their own
  const nodes = world.nodes;
  for (const [cell, width] of bridgeCells) {
    const x = cell % w, y = (cell / w) | 0;
    const rid = world.region ? world.region[cell] : -1;
    const race = world.regions[rid]?.race || 'human';
    const kind = width >= 2 ? 'bridge' : 'ford';
    const nm = namer.unique(namer.landmark('bridge', race, subSeed(world.seed, 'br' + cell)), race, cell);
    nodes.push({
      id: nodes.length, type: 'crossing', kind, name: kind === 'ford' ? nm.text.replace(/(Bridge|Span|Crossing)$/, 'Ford') : nm.text,
      x, y, index: cell, region: rid, race, size: 1, tags: [kind, 'route', 'river'], biome: BIOMES[world.biome[cell]].key,
    });
  }

  // ---- sea lanes between landmasses
  world.seaLanes = [];
  if (opts.seaLanes) {
    const seaCost = seaCostField(world);
    const ports = world.nodes.filter(n => n.tags.includes('port'));
    const byCont = new Map();
    for (const p of ports) {
      const c = world.continentOf ? world.continentOf[p.index] : 0;
      if (!byCont.has(c)) byCont.set(c, []);
      byCont.get(c).push(p);
    }
    const conts = [...byCont.keys()];
    if (conts.length > 1) {
      // representative point per landmass, MST over those, then the closest port pair per link
      const reps = conts.map(c => { const list = byCont.get(c); const x = list.reduce((s, p) => s + p.x, 0) / list.length, y = list.reduce((s, p) => s + p.y, 0) / list.length; return { x, y, c }; });
      for (const [ai, bi] of mst(reps)) {
        const A = byCont.get(reps[ai].c), B = byCont.get(reps[bi].c);
        let best = null, bd = Infinity;
        for (const a of A) for (const b of B) { const d = (a.x - b.x) ** 2 + (a.y - b.y) ** 2; if (d < bd) { bd = d; best = [a, b]; } }
        if (!best) continue;
        const path = aStar(world, best[0].index, best[1].index, seaCost, { endpointsFree: true, maxExpand: world.width * world.height });
        if (path) world.seaLanes.push({ id: world.seaLanes.length, from: best[0].id, to: best[1].id, cells: path, length: path.length });
      }
    }
  }

  // ---- navigable rivers (a boat can get inland this far)
  for (const r of world.rivers) r.navigable = r.width >= 2 && (r.mouth.type === 'sea' || r.mouth.type === 'lake');

  world.roads = roads;
  // handy lookup for the renderer and for games: which cells carry a road, and of what class
  const roadCells = new Uint8Array(world.width * world.height);
  for (const r of roads) { const v = r.class === 'highway' ? 3 : r.class === 'road' ? 2 : 1; for (const c of r.cells) if (roadCells[c] < v) roadCells[c] = v; }
  world.roadCells = roadCells;
  for (const n of world.nodes) if (n.region >= 0 && world.regions[n.region] && !world.regions[n.region].nodes.includes(n.id)) world.regions[n.region].nodes.push(n.id);
  return world;
}

/** Which settlements can reach each other by road — used by tests and by travel code. */
export function roadGraph(world) {
  const adj = new Map();
  for (const n of world.nodes) adj.set(n.id, new Set());
  for (const r of world.roads) { adj.get(r.from)?.add(r.to); adj.get(r.to)?.add(r.from); }
  for (const l of world.seaLanes || []) { adj.get(l.from)?.add(l.to); adj.get(l.to)?.add(l.from); }
  return adj;
}
