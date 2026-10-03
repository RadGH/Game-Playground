// The live walk / sight grid for a Hunters vs Farmers match: the static world (sim.map, from
// mapgen.js) patched by what the match changed — chopped cells (state.hvf.chopped) and building
// footprints (building ents carry their `cells`). Cached per state object and rebuilt from the state
// when its change counters move, so a restored snapshot gets exactly the same grid.

import { KIND, WALK_FARMER, WALK_HUNTER, BLOCKS_SIGHT } from './mapgen.js';

const CACHE = new WeakMap();   // state -> { chopV, buildV, cells, occ, opaque } (not state: never hashed)

// occupancy codes: who a building cell keeps out
export const OCC_NONE = 0, OCC_ALL = 1, OCC_HUNTERS = 2;

export function liveGrid(ctx) {
  const { state, map } = ctx;
  const H = state.hvf;
  let c = CACHE.get(state);
  if (c && c.map === map && c.chopV === H.chopV && c.buildV === H.buildV) return c;
  if (!c || c.map !== map || c.chopV !== H.chopV) {
    const cells = map.cells.slice();
    for (const i of H.chopped) cells[i] = KIND.grass;
    c = { map, chopV: H.chopV, buildV: -1, cells, occ: null, opaque: null };
  }
  const occ = new Uint8Array(map.cells.length), opaque = new Uint8Array(map.cells.length);
  for (const e of state.ents) {
    if (e.kind !== 'building' || !e.alive || e._gone || !e.cells || e.blocks === 'none') continue;
    for (const i of e.cells) { occ[i] = e.blocks === 'hunters' ? OCC_HUNTERS : OCC_ALL; if (e.opaque) opaque[i] = 1; }
  }
  c.occ = occ; c.opaque = opaque; c.buildV = H.buildV;
  CACHE.set(state, c);
  return c;
}

/** Cut a cell (tree / briar -> grass). Keeps state.hvf.chopped sorted. */
export function chopCell(ctx, i) {
  const H = ctx.state.hvf, a = H.chopped;
  let lo = 0, hi = a.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < i) lo = m + 1; else hi = m; }
  if (a[lo] === i) return;
  a.splice(lo, 0, i);
  H.chopV++;
  const c = CACHE.get(ctx.state);
  if (c && c.map === ctx.map && c.chopV === H.chopV - 1) { c.cells[i] = KIND.grass; c.chopV = H.chopV; }
}

export function buildingsChanged(ctx) { ctx.state.hvf.buildV++; }

/** Can a mover of this kind stand on cell i? who: 'farmer' | 'animal' | 'hunter' | 'army'. */
export function canStand(g, who, i) {
  const k = g.cells[i];
  if (who === 'hunter' || who === 'army') { if (!WALK_HUNTER[k]) return false; return g.occ[i] === OCC_NONE; }
  if (!WALK_FARMER[k]) return false;
  return g.occ[i] !== OCC_ALL;
}

/** Can a mover step from cell a to the 4- or 8-neighbour cell b (levels change only on a ramp)? */
export function canStep(ctx, g, who, a, b) {
  if (!canStand(g, who, b)) return false;
  const L = ctx.map.level;
  return L[a] === L[b] || g.cells[a] === KIND.ramp || g.cells[b] === KIND.ramp;
}

export function blocksSight(g, i) { return BLOCKS_SIGHT[g.cells[i]] === 1 || g.opaque[i] === 1; }

export const cellOf = (map, x, z) => {
  let cx = Math.floor(x / map.cell), cz = Math.floor(z / map.cell);
  if (cx < 0) cx = 0; else if (cx >= map.cols) cx = map.cols - 1;
  if (cz < 0) cz = 0; else if (cz >= map.rows) cz = map.rows - 1;
  return cz * map.cols + cx;
};
export const cellX = (map, i) => ((i % map.cols) + 0.5) * map.cell;
export const cellZ = (map, i) => (((i / map.cols) | 0) + 0.5) * map.cell;

/** Nearest cell (4-neighbour BFS order) where who can stand, from cell i; -1 if none within `max`. */
export function nearestStandable(ctx, g, who, i, max = 400) {
  const { map } = ctx;
  if (canStand(g, who, i)) return i;
  const seen = new Set([i]), q = [i];
  for (let h = 0; h < q.length && h < max; h++) {
    const c = q[h], x = c % map.cols, z = (c / map.cols) | 0;
    const nb = [x + 1 < map.cols ? c + 1 : -1, x > 0 ? c - 1 : -1, z + 1 < map.rows ? c + map.cols : -1, z > 0 ? c - map.cols : -1];
    for (const j of nb) {
      if (j < 0 || seen.has(j)) continue;
      if (canStand(g, who, j)) return j;
      seen.add(j); q.push(j);
    }
  }
  return -1;
}
