// Stream E — shared helpers for the Hunters vs Farmers AI (farmer.js, hunter.js, suspicion.js).
//
// The AI runs inside the sim on every peer: it reads only what its own team could know (its vision,
// its memory of seen buildings, the noise rule a player hears, the public map) and acts only through
// the mode's commands, after checking them with the sim's own refusal functions so it never sends an
// illegal one. Everything kept between thinks lives in player.ai (plain data, part of the state).
//
// Path budget: a `move` / `build` / `chop` / `revive` / `pullup` command runs a grid A* inside the sim,
// and the AI checks the route first (one more A*). routeBudget() caps that at ROUTES_PER_TICK new
// routes per tick per match, shared by every AI seat; a seat that is over the cap tries again next tick.

import { findPath } from '../path.js';
import { liveGrid, cellOf, cellX, cellZ, canStand } from '../grid.js';
import { KIND, WALK_HUNTER } from '../mapgen.js';

export const ROUTES_PER_TICK = 3;
const BUDGET = new WeakMap();   // state -> { tick, n } (never state: a budget is not game truth)

/** Take one route from this tick's budget; false when it is spent. */
export function routeBudget(state) {
  let b = BUDGET.get(state);
  if (!b || b.tick !== state.tick) { b = { tick: state.tick, n: 0 }; BUDGET.set(state, b); }
  if (b.n >= ROUTES_PER_TICK) return false;
  b.n++;
  return true;
}

const whoOf = e => (e.kind === 'hunter' || e.kind === 'army' ? 'hunter' : 'farmer');

/** Would the sim find a route for `e` to cell `goal` (same options as units.js routeTo)? */
export function canRoute(ctx, e, goal, near = false, closest = false, maxNodes) {
  // (the same search the sim runs; maxNodes caps it for "is it a SHORT walk?" questions)
  const path = findPath(ctx, liveGrid(ctx), cellOf(ctx.map, e.x, e.z), goal, { who: whoOf(e), near, closest, maxNodes });
  return path ? path : null;
}

export const d2 = (ax, az, bx, bz) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz);
export const dist = (ax, az, bx, bz) => Math.sqrt(d2(ax, az, bx, bz));
export const live = e => e && e.alive && !e._gone;

/** Distance (cells, 4-neighbour BFS) from every cell to the nearest trail cell; cached per map. */
const TRAIL_D = new WeakMap();
export function trailDistance(map) {
  let t = TRAIL_D.get(map);
  if (t) return t;
  const n = map.cols * map.rows, out = new Int32Array(n).fill(-1), q = [];
  for (let i = 0; i < n; i++) if (map.cells[i] === KIND.trail) { out[i] = 0; q.push(i); }
  for (let h = 0; h < q.length; h++) {
    const c = q[h], x = c % map.cols, z = (c / map.cols) | 0;
    for (const j of [x + 1 < map.cols ? c + 1 : -1, x > 0 ? c - 1 : -1, z + 1 < map.rows ? c + map.cols : -1, z > 0 ? c - map.cols : -1]) {
      if (j < 0 || out[j] >= 0) continue;
      out[j] = out[c] + 1; q.push(j);
    }
  }
  TRAIL_D.set(map, out);
  return out;
}

/** The 8 neighbours of cell c (inside the map). */
export function n8(map, c) {
  const x = c % map.cols, z = (c / map.cols) | 0, out = [];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dz) continue;
    const nx = x + dx, nz = z + dz;
    if (nx >= 0 && nz >= 0 && nx < map.cols && nz < map.rows) out.push(nz * map.cols + nx);
  }
  return out;
}

/** Is cell c open ground a hunter could stand on (live grid, ignoring buildings)? */
export function hunterGround(g, c) { return WALK_HUNTER[g.cells[c]] === 1; }

export { liveGrid, cellOf, cellX, cellZ, canStand, KIND };
