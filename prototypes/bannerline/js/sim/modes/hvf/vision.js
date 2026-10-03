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
import { gear } from './hunter.js';

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
  const U = data.hvf.units, H = data.hvf.hunter, B = data.hvf.buildings.kinds, out = [];
  const cells = m => Math.max(1, Math.round(m / map.cell));
  for (const e of state.ents) {
    if (e.team !== team || !e.alive || e._gone) continue;
    const c = cellOf(map, e.x, e.z);
    if (e.kind === 'farmer') out.push({ c, R: cells(U.farmer.sight), los: true });
    else if (e.kind === 'hunter') out.push({ c, R: cells(U.hunter.sight * (1 + gear(data, state.players[e.owner]).sightPct)), los: true });
    else if (e.kind === 'animal') out.push({ c, R: cells(data.hvf.animals.kinds[e.type].sight), los: false });
    else if (e.kind === 'army') out.push({ c, R: cells(U.army[e.type].sight), los: !e.flying });
    else if (e.kind === 'ward') out.push({ c, R: cells(H.watchstone.sight), los: true });
    else if (e.kind === 'hawk') out.push({ c, R: cells(H.skills.E.sight), los: false });
    else if (e.kind === 'hound') out.push({ c, R: cells(H.hound.sight), los: false });
    else if (e.kind === 'building' && e.lodge) { if (e.done !== false) out.push({ c, R: cells(e.type === 'kennel' ? 10 : H.lodge.sight), los: false }); }
    else if (e.kind === 'building' && B[e.type] && B[e.type].sight) out.push({ c, R: cells(B[e.type].sight), los: true });
    else if (e.kind === 'building') out.push({ c, R: cells(e.r + 2), los: false });
  }
  for (const f of state.hvf.flares) if (f.team === team) out.push({ c: cellOf(map, f.x, f.z), R: cells(H.flare.radius), los: false });
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
  rememberBuildings(ctx, team);
}

/** Last-seen enemy buildings (the view draws them as grey ghosts where they were last seen). */
function rememberBuildings(ctx, team) {
  const { state, map } = ctx;
  const mem = state.hvf.seen[team];
  for (const b of state.ents) {
    if (b.kind !== 'building' || b.team === team || !b.alive || b._gone || !canSee(ctx, team, b)) continue;
    const m = mem.find(q => q.id === b.id);
    if (m) { m.tick = state.tick; m.x = b.x; m.z = b.z; }
    else mem.push({ id: b.id, kind: b.type, x: b.x, z: b.z, tick: state.tick });
  }
  // a remembered building whose spot is in sight again and is not there any more is forgotten
  for (let i = mem.length - 1; i >= 0; i--) {
    const m = mem[i];
    if (!hasBit(state.hvf.vision[team], cellOf(map, m.x, m.z))) continue;
    const b = state.ents.find(e => e.id === m.id);
    if (!b || !b.alive || b._gone) mem.splice(i, 1);
  }
}

/**
 * Can `team` see entity e now? Its cell must be in the team's vision; a unit standing in tall grass is
 * seen only from 2 cells; a farmer lying low (e.lowUntil, H3) only from 3 m.
 */
export function canSee(ctx, team, e) {
  const { state, map } = ctx;
  if (e.team === team) return true;
  const { data } = ctx;
  // hidden kit: farmers notice watchstones and snares only up close
  if (e.kind === 'ward' || e.kind === 'snare') {
    const R = e.kind === 'ward' ? data.hvf.hunter.watchstone.seenWithin : data.hvf.hunter.skills.W.seenWithin;
    for (const o of state.ents) if (o.team === team && o.alive && !o._gone && (o.kind === 'farmer' || o.kind === 'army') && (o.x - e.x) * (o.x - e.x) + (o.z - e.z) * (o.z - e.z) <= R * R) return true;
    return false;
  }
  // the Horn and the hound show animals through the fog for a moment
  if (e.revealUntil > state.tick) return true;
  // a windmill stands over the trees
  const tall = e.kind === 'building' && data.hvf.buildings.kinds[e.type] && data.hvf.buildings.kinds[e.type].tall;
  if (tall) for (const o of state.ents) if (o.team === team && o.alive && !o._gone && (o.kind === 'hunter' || o.kind === 'hawk') && (o.x - e.x) * (o.x - e.x) + (o.z - e.z) * (o.z - e.z) <= tall * tall) return true;
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
