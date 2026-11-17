// Roads, power and water: what's connected to what, and whether there's enough.
//   Roads (tiles.road 1 street, 2 avenue, 3 highway): a lot grows only beside a road that reaches the Colony Core.
//   Power: roads, walls, power lines (tiles.power = 1), buildings, turrets and zoned land all carry power and hand it
//          on to anything within POWER_REACH tiles (owner 2026-11-16: "Zoning and buildings should also supply power
//          zones"). A piece with a plant is live. Short supply = a brownout: everything gets the same share, turrets
//          fire slower and nothing grows. Lines are drawn as pylons spaced up to PYLON_SPAN apart (pylonPlan).
//   Water: pipes (tiles.pipe = 1, drawn in the underground view) from pumps; a building within PIPE_REACH tiles of a
//          connected pipe has water. Bigger homes and shops need it.
import { item } from './catalog.js';

export const PIPE_REACH = 5;
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
/** A big per-tile array kept off the save (saveRegion copies every plain field of the region). */
const hidden = (o, k, v) => Object.defineProperty(o, k, { value: v, enumerable: false });

/** Tiles reachable along roads from the Colony Core (Uint8Array mask). */
export function roadReach(r) {
  const N = r.size, seen = new Uint8Array(N * N); if (!r.core) return seen;
  const q = [];
  // start from every road tile touching the core's footprint
  for (let z = r.core.z - 1; z <= r.core.z + 3; z++) for (let x = r.core.x - 1; x <= r.core.x + 3; x++) {
    if (x < 0 || z < 0 || x >= N || z >= N) continue; const i = z * N + x; if (r.tiles.road[i] && !seen[i]) { seen[i] = 1; q.push(i); }
  }
  while (q.length) { const i = q.pop(), x = i % N, z = (i / N) | 0; for (const [dx, dz] of N4) { const nx = x + dx, nz = z + dz; if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue; const j = nz * N + nx; if (!seen[j] && r.tiles.road[j]) { seen[j] = 1; q.push(j); } } }
  return seen;
}
/** Which way a zoned building's front (its doors, porches, shopfronts — the model's +z side) faces, as the model turn
 *  that puts it there (iso.js turnXZ: 0 = front toward +z, 1 = −x, 2 = −z, 3 = +x). The model is built size[0] wide
 *  along x; a lot laid the other way round (w = size[1]) can only face −x / +x, an upright one only +z / −z, a square
 *  one any way. Picks the allowed side with the most road beside it. Returns { face, road } (road = tiles of road on
 *  that side; 0 means no allowed side touches a road). size defaults to [long, short] — every non-square recipe is
 *  built wider than deep. */
export function lotFace(r, x, z, w, d, size = [Math.max(w, d), Math.min(w, d)]) {
  const N = r.size, road = (tx, tz) => (tx >= 0 && tz >= 0 && tx < N && tz < N && r.tiles.road[tz * N + tx] ? 1 : 0);
  const side = q => {
    let n = 0;
    if (q === 0 || q === 2) { const tz = q === 0 ? z + d : z - 1; for (let j = 0; j < w; j++) n += road(x + j, tz); }
    else { const tx = q === 3 ? x + w : x - 1; for (let k = 0; k < d; k++) n += road(tx, z + k); }
    return n;
  };
  const allowed = size[0] === size[1] ? [0, 3, 2, 1] : w === size[0] ? [0, 2] : [3, 1];
  let best = { face: allowed[0], road: 0 };
  for (const q of allowed) { const n = side(q); if (n > best.road) best = { face: q, road: n }; }
  return best;
}
/** Does the rectangle touch a road tile that is in `reach`? */
export function touchesRoad(r, reach, x, z, w, d) {
  const N = r.size;
  for (let k = -1; k <= d; k++) for (let j = -1; j <= w; j++) {
    if ((k === -1 || k === d) === (j === -1 || j === w)) continue;    // edges only, no corners
    const tx = x + j, tz = z + k; if (tx < 0 || tz < 0 || tx >= N || tz >= N) continue;
    if (reach[tz * N + tx]) return true;
  }
  return false;
}

/** How far power reaches (tiles, counted along the grid: across + along). Anything within this of a live conductor is
 *  powered, and conductors this close pass power to each other — so homes, shops, zoned lots, buildings, roads, walls
 *  and power lines all hand power on, SimCity-style. */
export const POWER_REACH = 5;
const BRIDGE = (POWER_REACH - 1) >> 1;     // grow each conductor this far; two growths touch when they are ≤ POWER_REACH apart
/** Pylons on a power line: at most this many tiles apart, evenly spaced along each straight run. */
export const PYLON_SPAN = 5;

/** Conductors: 1 = a road, power line or wall; 2 = a building or turret; 3 = painted zone (not built yet). */
export function conductors(r) {
  const N = r.size, NN = N * N, c = new Uint8Array(NN), T = r.tiles;
  for (let i = 0; i < NN; i++) { if (T.road[i] || T.power[i] || T.wall[i]) c[i] = 1; else if (T.zone[i]) c[i] = 3; }
  for (const l of r.lots) for (let k = 0; k < l.d; k++) for (let j = 0; j < l.w; j++) c[(l.z + k) * N + l.x + j] = 2;
  for (const t of r.turrets) c[t.z * N + t.x] = 2;
  return c;
}
/** Grid distance (across + along) from any tile marked in `src`, up to `max` (255 beyond). */
function spread(N, src, max) {
  const dist = new Uint8Array(N * N).fill(255); let q = [];
  for (let i = 0; i < N * N; i++) if (src[i]) { dist[i] = 0; q.push(i); }
  for (let d = 0; d < max && q.length; d++) {
    const next = [];
    for (const i of q) {
      const x = i % N;
      if (x > 0 && dist[i - 1] === 255) { dist[i - 1] = d + 1; next.push(i - 1); }
      if (x < N - 1 && dist[i + 1] === 255) { dist[i + 1] = d + 1; next.push(i + 1); }
      if (i >= N && dist[i - N] === 255) { dist[i - N] = d + 1; next.push(i - N); }
      if (i < N * N - N && dist[i + N] === 255) { dist[i + N] = d + 1; next.push(i + N); }
    }
    q = next;
  }
  return dist;
}

/**
 * Power. Every conductor (roads, lines, walls, buildings, turrets, zoned land) passes power to any other conductor
 * within POWER_REACH tiles; a connected piece with a plant is live. Short supply in a piece = a brownout there:
 * everything gets the same share. Sets lot.powered / turret.powered (0..1) and
 * r.power = { supply, demand, share, reach } — reach[i] = 1 where a tile is within reach of a live piece (the overlay).
 */
export function solvePower(r) {
  const N = r.size, NN = N * N, cond = conductors(r);
  const grown = spread(N, cond, BRIDGE);
  const comp = new Int32Array(NN).fill(-1), pieces = [];
  for (let s = 0; s < NN; s++) {
    if (grown[s] === 255 || comp[s] >= 0) continue;
    const id = pieces.length, q = [s]; comp[s] = id; pieces.push({ supply: 0, demand: 0 });
    while (q.length) {
      const i = q.pop(), x = i % N;
      if (x > 0 && grown[i - 1] !== 255 && comp[i - 1] < 0) { comp[i - 1] = id; q.push(i - 1); }
      if (x < N - 1 && grown[i + 1] !== 255 && comp[i + 1] < 0) { comp[i + 1] = id; q.push(i + 1); }
      if (i >= N && grown[i - N] !== 255 && comp[i - N] < 0) { comp[i - N] = id; q.push(i - N); }
      if (i < NN - N && grown[i + N] !== 255 && comp[i + N] < 0) { comp[i + N] = id; q.push(i + N); }
    }
  }
  for (const l of r.lots) { const g = comp[l.z * N + l.x]; l.grid = g; const p = pieces[g]; if (!p) continue; const u = l.power ?? 0; if (u > 0) p.supply += u; else p.demand -= u; }
  for (const t of r.turrets) { const g = comp[t.z * N + t.x]; t.grid = g; const p = pieces[g]; if (p) p.demand += t.power ?? 3; }
  let supply = 0, demand = 0;
  for (const p of pieces) { p.share = p.supply <= 0 ? 0 : Math.min(1, p.supply / Math.max(1e-6, p.demand)); supply += p.supply; demand += p.demand; }
  for (const l of r.lots) l.powered = (l.power ?? 0) > 0 ? 1 : pieces[l.grid]?.share ?? 0;
  for (const t of r.turrets) t.powered = pieces[t.grid]?.share ?? 0;
  // the reach the overlay shows: within POWER_REACH of a conductor in a live piece
  const live = new Uint8Array(NN); for (let i = 0; i < NN; i++) if (cond[i] && pieces[comp[i]]?.supply > 0) live[i] = 1;
  const d = spread(N, live, POWER_REACH), reach = new Uint8Array(NN);
  for (let i = 0; i < NN; i++) if (d[i] !== 255) reach[i] = 1;
  r.power = hidden({ supply, demand, share: demand ? Math.min(1, supply / demand) : 1 }, 'reach', reach);
  return r.power;
}
/** Tiles within POWER_REACH (or `reach`) of the given tiles — the ghost's glow while you draw a line. → Set of indices */
export function reachOf(r, tiles, reach = POWER_REACH, sum = reach) {
  const N = r.size, out = new Set();
  for (const [x, z] of tiles) for (let k = -reach; k <= reach; k++) for (let j = -reach; j <= reach; j++) {
    if (Math.abs(j) + Math.abs(k) > sum) continue; const tx = x + j, tz = z + k;
    if (tx >= 0 && tz >= 0 && tx < N && tz < N) out.add(tz * N + tx);
  }
  return out;
}

/**
 * Where the pylons stand on the power lines, and which pairs a wire spans. Lines are split into straight runs between
 * ends, corners and junctions; each run gets a pylon at both ends and evenly spaced ones between, never more than
 * PYLON_SPAN tiles apart. Drawing a longer line re-spaces them. A pylon that would land on a road, building or wall
 * slides to the nearest free tile of its run (or is left out). Cached until the lines change (r.lineRev).
 * → { poles: [{ x, z, axis: 'x'|'z', corner }], spans: [[a, b, axis]] } (a, b = indices into poles)
 */
export function pylonPlan(r) {
  const tur = new Set((r.turrets || []).map(t => t.z * r.size + t.x));
  const key = `${r.lineRev || 0}|${r.lots.length}|${r.size}|${[...tur].join(',')}`;
  if (r._pylons?.key === key) return r._pylons;
  const N = r.size, P = r.tiles.power, isP = (x, z) => x >= 0 && z >= 0 && x < N && z < N && P[z * N + x] > 0;
  // never a pylon on a road, building, wall or turret (report #86: one stood on a turret and couldn't be removed)
  const blocked = i => r.tiles.road[i] || r.tiles.lot[i] >= 0 || r.tiles.wall[i] || tur.has(i);
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const dirsAt = (x, z) => DIRS.map(([dx, dz], k) => isP(x + dx, z + dz) ? k : -1).filter(k => k >= 0);
  const isNode = (x, z) => { const ds = dirsAt(x, z); return ds.length !== 2 || (ds[0] >> 1) !== (ds[1] >> 1); };
  const poles = [], at = new Map(), spans = [], walked = new Set();
  const pole = (i, axis, corner) => { if (at.has(i)) { const p = poles[at.get(i)]; if (corner) p.corner = true; return at.get(i); } at.set(i, poles.length); poles.push({ x: i % N, z: (i / N) | 0, axis, corner: !!corner }); return poles.length - 1; };
  for (let i = 0; i < N * N; i++) {
    if (!P[i]) continue; const x = i % N, z = (i / N) | 0;
    if (!isNode(x, z)) continue;
    const ds = dirsAt(x, z);
    if (!ds.length && !blocked(i)) pole(i, 'x', false);
    for (const k of ds) {
      if (walked.has(i * 4 + k)) continue;
      const [dx, dz] = DIRS[k], run = [i]; let cx = x, cz = z;
      for (;;) { cx += dx; cz += dz; run.push(cz * N + cx); if (isNode(cx, cz)) break; }
      walked.add(i * 4 + k); walked.add(run[run.length - 1] * 4 + (k ^ 1));
      const axis = dx ? 'x' : 'z', L = run.length - 1, n = Math.max(1, Math.ceil(L / PYLON_SPAN));
      let prev = -1;
      for (let s = 0; s <= n; s++) {
        let t = Math.round(s * L / n), pick = -1;
        const end = s === 0 || s === n;
        for (const o of end ? [0] : [0, 1, -1, 2, -2]) { const u = t + o; if (u <= 0 || u >= L) { if (end && !blocked(run[u])) pick = u; continue; } if (!blocked(run[u])) { pick = u; break; } }
        if (pick < 0) continue;
        const ix = run[pick], cornerHere = end && dirsAt(ix % N, (ix / N) | 0).length !== 1 && isNode(ix % N, (ix / N) | 0);
        const id = pole(ix, axis, cornerHere);
        if (prev >= 0 && prev !== id) spans.push([prev, id, axis]);
        prev = id;
      }
    }
  }
  Object.defineProperty(r, '_pylons', { value: { key, poles, spans }, enumerable: false, configurable: true, writable: true });
  return r._pylons;
}

/** Water: pumps feed connected pipes; a lot within PIPE_REACH of a live pipe has water (share if short). */
export function solveWater(r) {
  const N = r.size, live = new Uint8Array(N * N);
  let supply = 0, demand = 0;
  const pumps = r.lots.filter(l => (l.water ?? 0) > 0 && l.powered > 0);
  const q = [];
  for (const p of pumps) {
    supply += p.water * Math.min(1, p.powered);
    for (let k = -1; k <= p.d; k++) for (let j = -1; j <= p.w; j++) { const x = p.x + j, z = p.z + k; if (x < 0 || z < 0 || x >= N || z >= N) continue; const i = z * N + x; if (r.tiles.pipe[i] && !live[i]) { live[i] = 1; q.push(i); } }
  }
  while (q.length) { const i = q.pop(), x = i % N, z = (i / N) | 0; for (const [dx, dz] of N4) { const nx = x + dx, nz = z + dz; if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue; const j = nz * N + nx; if (r.tiles.pipe[j] && !live[j]) { live[j] = 1; q.push(j); } } }
  // reach: distance from a live pipe (simple expanding square, cheap)
  const reach = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) if (live[i]) { const x = i % N, z = (i / N) | 0; for (let k = -PIPE_REACH; k <= PIPE_REACH; k++) for (let j = -PIPE_REACH; j <= PIPE_REACH; j++) { const tx = x + j, tz = z + k; if (tx >= 0 && tz >= 0 && tx < N && tz < N && Math.abs(j) + Math.abs(k) <= PIPE_REACH + 1) reach[tz * N + tx] = 1; } }
  for (const l of r.lots) { l.wet = (l.water ?? 0) > 0 || reach[(l.z + (l.d >> 1)) * N + l.x + (l.w >> 1)] ? 1 : 0; if (l.wet && (l.water ?? 0) < 0) demand -= l.water; }
  // homes and shops use water by size
  for (const l of r.lots) if (l.kind === 'zoned' && l.wet) demand += Math.ceil((l.people + l.jobs) / 40);
  const share = demand ? Math.min(1, supply / demand) : 1;
  for (const l of r.lots) if (l.wet && (l.water ?? 0) <= 0) l.wet = share;
  r.waterNet = hidden({ supply, demand, share }, 'reach', reach);
  return r.waterNet;
}

/** Simple traffic: each lot sends its people/jobs onto the nearest road tiles; load ÷ capacity → 0..1+ jam. */
export function solveTraffic(r, roadsCat) {
  const N = r.size, load = new Float32Array(N * N);
  for (const l of r.lots) {
    const trips = (l.people || 0) * 0.6 + (l.jobs || 0) * 0.5; if (!trips) continue;
    // spread over the road tiles around the lot and a few steps beyond along the road
    const cells = [];
    for (let k = -1; k <= l.d; k++) for (let j = -1; j <= l.w; j++) { const x = l.x + j, z = l.z + k; if (x >= 0 && z >= 0 && x < N && z < N && r.tiles.road[z * N + x]) cells.push(z * N + x); }
    for (const c of cells) { let i = c; for (let step = 0; step < 6; step++) { load[i] += trips / Math.max(1, cells.length) / (1 + step * 0.4); const x = i % N, z = (i / N) | 0; let next = -1; for (const [dx, dz] of N4) { const nx = x + dx, nz = z + dz; if (nx >= 0 && nz >= 0 && nx < N && nz < N && r.tiles.road[nz * N + nx]) { const j = nz * N + nx; if (next < 0 || (r.tiles.road[j] > r.tiles.road[next])) next = j; } } if (next < 0) break; i = next; } }
  }
  for (let i = 0; i < N * N; i++) { const lv = r.tiles.road[i]; r.tiles.traffic[i] = lv ? load[i] / (roadsCat[lv - 1]?.capacity || 60) : 0; }
}

/** Facts about a catalog entry placed as a lot (power/water/people/jobs) — copied onto the lot when built. */
export function entryFacts(id) { const e = item(id); return { power: e.power ?? 0, water: e.water ?? 0, people: e.people ?? 0, jobs: e.jobs ?? 0 }; }

/**
 * Bridge decks (owner report #83, 2026-11-16: "This should have been a bridge but the bridge segments are lower than the
 * ground"). A road tile over water is a bridge; its deck sits at the height of the HIGHER bank at the two ends of its
 * straight run across the water, so it never dips below the land it leaves from (rivers are carved a level below their
 * banks — terrain.js settleRivers — and the sea is at 0). One source for drawing, vehicles and the tests.
 * → Map tileIndex → deck level (whole height levels, like ter.height). Not cached: the renderer refreshes its copy.
 */
export function bridgeDecks(r) {
  const N = r.size, road = r.tiles.road, water = r.ter.water, height = r.ter.height;
  const map = new Map(), isBridge = i => road[i] && water[i];
  for (let i = 0; i < N * N; i++) {
    if (!isBridge(i) || map.has(i)) continue;
    const x = i % N, z = (i / N) | 0;
    const along = (dx, dz) => { const nx = x + dx, nz = z + dz; return nx >= 0 && nz >= 0 && nx < N && nz < N && road[nz * N + nx]; };
    // the run's axis: the way the road continues (a lone tile or a crossing takes x)
    const axis = (along(1, 0) || along(-1, 0)) && !(along(0, 1) || along(0, -1)) ? [1, 0] : !(along(1, 0) || along(-1, 0)) && (along(0, 1) || along(0, -1)) ? [0, 1] : [1, 0];
    const run = [i]; let bank = 0;
    for (const s of [1, -1]) {
      let cx = x, cz = z;
      for (;;) {
        cx += axis[0] * s; cz += axis[1] * s;
        if (cx < 0 || cz < 0 || cx >= N || cz >= N) break;
        const j = cz * N + cx;
        if (isBridge(j)) { run.push(j); continue; }
        if (!water[j]) bank = Math.max(bank, height[j]);   // the bank this end lands on
        break;
      }
    }
    // no bank at either end (off the map): the highest dry ground beside the run
    if (!bank) for (const j of run) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const jx = j % N + dx, jz = ((j / N) | 0) + dz; if (jx >= 0 && jz >= 0 && jx < N && jz < N && !water[jz * N + jx]) bank = Math.max(bank, height[jz * N + jx]); }
    const deck = Math.max(1, bank);
    for (const j of run) map.set(j, Math.max(map.get(j) || 0, deck, height[j]));
  }
  return map;
}
