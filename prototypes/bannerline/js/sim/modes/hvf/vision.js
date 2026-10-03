// Fog of war (docs/hvf-PLAN.md §4). Per team, recomputed on ticks where tick % 4 === team (5 Hz
// each, staggered). Vision lives IN STATE as packed bitsets (32 cells per int) so a snapshot restored
// between updates sees exactly what the original saw.
//
// Line of sight uses precomputed integer ray tables per radius (built once from integer circle maths,
// no trig): for every cell offset within the radius, the Bresenham cells between the eye and it.
// Opaque: trees, rocks, cliffs (seen from below), fences and walls; a ground eye never sees a plateau
// cell (except a ramp); a plateau eye sees down past its own cliff edge. Small radii (animals, posts)
// are STAMPS: a disc, no line of sight.

import { liveGrid, blocksSight, cellOf } from './grid.js';
import { KIND } from './mapgen.js';
import { FARMERS, HUNTERS } from './state.js';

const RAYS = new Map();   // radius (cells) -> { off: Int32Array [dx, dz, start, count], path: Int16Array [dx, dz ...] }
function raysFor(R) {
  let t = RAYS.get(R);
  if (t) return t;
  const off = [], path = [];
  for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
    if (dx * dx + dz * dz > R * R) continue;
    const start = path.length >> 1;
    // Bresenham from (0,0) to (dx,dz), the cells strictly between
    let x = 0, z = 0;
    const ax = Math.abs(dx), az = -Math.abs(dz), sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
    let err = ax + az;
    for (;;) {
      if (x === dx && z === dz) break;
      const e2 = 2 * err;
      if (e2 >= az) { err += az; x += sx; }
      if (e2 <= ax) { err += ax; z += sz; }
      if (x === dx && z === dz) break;
      path.push(x, z);
    }
    off.push(dx, dz, start, (path.length >> 1) - start);
  }
  t = { off: Int32Array.from(off), path: Int16Array.from(path) };
  RAYS.set(R, t);
  return t;
}

const setBit = (bits, i) => { bits[i >> 5] |= 1 << (i & 31); };
export const hasBit = (bits, i) => (bits[i >> 5] & (1 << (i & 31))) !== 0;

/** Mark everything an eye at cell c sees within R cells (line of sight). */
export function seeFrom(map, g, bits, c, R) {
  const cols = map.cols, rows = map.rows, L = map.level;
  const ex = c % cols, ez = (c / cols) | 0, eyeHigh = L[c] === 1;
  const T = raysFor(R), off = T.off, path = T.path;
  for (let k = 0; k < off.length; k += 4) {
    const tx = ex + off[k], tz = ez + off[k + 1];
    if (tx < 0 || tz < 0 || tx >= cols || tz >= rows) continue;
    const t = tz * cols + tx;
    if (!eyeHigh && L[t] === 1 && g.cells[t] !== KIND.ramp) continue;   // can't see onto a plateau from below
    let clear = true;
    for (let s = off[k + 2], e = s + off[k + 3]; s < e; s++) {
      const x = ex + path[2 * s], z = ez + path[2 * s + 1], i = z * cols + x;
      if (eyeHigh && g.cells[i] === KIND.cliff) continue;
      if (blocksSight(g, i) || (!eyeHigh && L[i] === 1 && g.cells[i] !== KIND.ramp)) { clear = false; break; }
    }
    if (clear) setBit(bits, t);
  }
}

/** A stamp: a disc of radius R cells, no line of sight. */
export function stamp(map, bits, c, R) {
  const cols = map.cols, rows = map.rows, ex = c % cols, ez = (c / cols) | 0;
  for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
    if (dx * dx + dz * dz > R * R) continue;
    const x = ex + dx, z = ez + dz;
    if (x >= 0 && z >= 0 && x < cols && z < rows) setBit(bits, z * cols + x);
  }
}

/** Everything that gives a team vision: [{ c (cell), R (cells), los }]. */
export function viewers(ctx, team) {
  const { state, data, map } = ctx;
  const U = data.hvf.units, out = [];
  const cells = m => Math.max(1, Math.round(m / map.cell));
  for (const e of state.ents) {
    if (e.team !== team || !e.alive || e._gone) continue;
    if (e.kind === 'farmer') out.push({ c: cellOf(map, e.x, e.z), R: cells(U.farmer.sight), los: true, id: e.id });
    else if (e.kind === 'hunter') out.push({ c: cellOf(map, e.x, e.z), R: cells(U.hunter.sight), los: true, id: e.id });
    else if (e.kind === 'animal') out.push({ c: cellOf(map, e.x, e.z), R: cells(data.hvf.animals.kinds[e.type].sight), los: false, id: e.id });
    else if (e.kind === 'building' && e.type === 'kennel') out.push({ c: cellOf(map, e.x, e.z), R: cells(10), los: false, id: e.id });
    else if (e.kind === 'building') out.push({ c: cellOf(map, e.x, e.z), R: cells(e.r + 2), los: false, id: e.id });
  }
  return out;
}

/** Recompute one team's vision (tick % 4 === team) and fold it into what it has explored. */
export function visionTick(ctx) {
  const { state, map } = ctx;
  const team = state.tick % 4;
  if (team !== FARMERS && team !== HUNTERS) return;
  updateVision(ctx, team);
}

export function updateVision(ctx, team) {
  const { state, map } = ctx;
  const g = liveGrid(ctx);
  const bits = state.hvf.vision[team];
  bits.fill(0);
  for (const v of viewers(ctx, team)) { if (v.los) seeFrom(map, g, bits, v.c, v.R); else stamp(map, bits, v.c, v.R); }
  const ex = state.hvf.explored[team];
  for (let i = 0; i < bits.length; i++) ex[i] |= bits[i];
}

/**
 * Can `team` see entity e now? Its cell must be in the team's vision; a unit standing in tall grass is
 * seen only from 2 cells; a farmer lying low (e.lowUntil, H3) only from 3 m.
 */
export function canSee(ctx, team, e) {
  const { state, map } = ctx;
  if (e.team === team) return true;
  const c = cellOf(map, e.x, e.z);
  if (!hasBit(state.hvf.vision[team], c)) return false;
  const g = liveGrid(ctx);
  let near = -1;
  if (g.cells[c] === KIND.tallgrass && e.kind !== 'building') near = 2 * map.cell;
  if (e.lowUntil && e.lowUntil > state.tick) near = 3;
  if (near < 0) return true;
  for (const o of state.ents) {
    if (o.team !== team || !o.alive || o._gone || (o.kind !== 'farmer' && o.kind !== 'hunter' && o.kind !== 'army' && o.kind !== 'animal')) continue;
    if ((o.x - e.x) * (o.x - e.x) + (o.z - e.z) * (o.z - e.z) <= near * near) return true;
  }
  return false;
}
