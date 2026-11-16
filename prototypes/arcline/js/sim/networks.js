// Roads, power and water: what's connected to what, and whether there's enough.
//   Roads (tiles.road 1 street, 2 avenue, 3 highway): a lot grows only beside a road that reaches the Colony Core.
//   Power: cables run inside every road and every wall, plus power lines (tiles.power = 1) you draw to far outposts.
//          A building is on the grid if it touches a road or line that reaches a plant. Short supply = a brownout:
//          everything gets the same share, turrets fire slower and nothing grows.
//   Water: pipes (tiles.pipe = 1, drawn in the underground view) from pumps; a building within PIPE_REACH tiles of a
//          connected pipe has water. Bigger homes and shops need it.
import { item } from './catalog.js';

export const PIPE_REACH = 5;
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

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

/** Power: which lots are on a grid with a plant, and supply/demand. Sets lot.powered and r.power = { supply, demand, share }. */
export function solvePower(r) {
  const N = r.size, cond = new Uint8Array(N * N);
  // cables run in roads, power lines AND walls (so turrets behind a wall line are powered along it)
  for (let i = 0; i < N * N; i++) if (r.tiles.road[i] || r.tiles.power[i] || r.tiles.wall[i]) cond[i] = 1;
  for (const l of r.lots) for (let k = 0; k < l.d; k++) for (let j = 0; j < l.w; j++) cond[(l.z + k) * N + l.x + j] = 2;   // buildings conduct too
  for (const t of r.turrets) cond[t.z * N + t.x] = 2;
  // flood each connected piece; a piece with a plant is live
  const comp = new Int32Array(N * N).fill(-1); const pieces = [];
  for (let s = 0; s < N * N; s++) {
    if (!cond[s] || comp[s] >= 0) continue;
    const id = pieces.length, q = [s]; comp[s] = id; pieces.push({ supply: 0, demand: 0 });
    while (q.length) { const i = q.pop(), x = i % N, z = (i / N) | 0; for (const [dx, dz] of N4) { const nx = x + dx, nz = z + dz; if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue; const j = nz * N + nx; if (cond[j] && comp[j] < 0) { comp[j] = id; q.push(j); } } }
  }
  for (const l of r.lots) { const p = pieces[comp[l.z * N + l.x]]; const u = l.power ?? 0; if (u > 0) p.supply += u; else p.demand -= u; l.grid = comp[l.z * N + l.x]; }
  for (const t of r.turrets) { const p = pieces[comp[t.z * N + t.x]]; p.demand += t.power ?? 3; t.grid = comp[t.z * N + t.x]; }
  let supply = 0, demand = 0;
  for (const p of pieces) { p.share = p.supply <= 0 ? 0 : Math.min(1, p.supply / Math.max(1e-6, p.demand)); supply += p.supply; demand += p.demand; }
  for (const l of r.lots) l.powered = (l.power ?? 0) > 0 ? 1 : pieces[l.grid]?.share ?? 0;
  for (const t of r.turrets) t.powered = pieces[t.grid]?.share ?? 0;
  r.power = { supply, demand, share: demand ? Math.min(1, supply / demand) : 1 };
  return r.power;
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
  r.waterNet = { supply, demand, share, reach };
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
