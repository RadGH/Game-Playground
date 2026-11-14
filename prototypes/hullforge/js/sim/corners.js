// Automatic corners (owner 2026-11-14: "Add corners automatically for both 1x1 and 1x2 style gaps").
//
// Ships are built from cubes only. Wherever the cubes make a little staircase, this file fills the triangular gap
// with a cosmetic wedge so the hull reads as a slope instead of steps. It has no effect on the game (no hit points,
// no mass, shots pass through it); it is recomputed whenever a block is placed or destroyed.
//
// Looking at one slice through the hull (s runs away from the wall, h runs up from the floor):
//
//   1x1 gap (45°)              1x2 gap (half slope, spread over two cells)
//   ┌───┐                      ┌───┐
//   │###│\                     │###│ ‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾
//   │###│ \                    │###│ ‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾  (a: 1 → ½ high)  (b: ½ → 0)
//   ├───┼───┐                  ├───┼───────┬───────┐
//   │###│###│                  │###│#######│#######│
//
// A gap cell E is EMPTY, has a smooth block below it (its floor, E − n) and a smooth block behind it (its wall,
// E − t). The cell on the far side (E + t) must be empty too, or it is a notch, not a step.
//   - tread one cell long (nothing under E + t)      → `w11`: a 45° wedge in E
//   - tread two cells long (E + t has a floor, E + 2t does not, and E + t is free) → `w12a` in E + `w12b` in E + t
//   - tread three or more cells long                  → nothing (a flat deck beside a tall wall stays square)
// A 1x1 wedge has two legs (floor and wall are interchangeable); it takes the colour of either, never a window's.
// Every orientation is tried (6 floor directions × 4 wall directions), so steep 2:1 steps come out as the 1x2 shape
// turned on its side. A 45° wedge seen from both of its legs is kept once, and a cell that already holds a 1x2 piece
// in a plane never also gets the 45° wedge of that plane.
//
// Only blocks with `smooth: true` (hull, frame, armor, window, rock, station) make corners; parts never do, and
// the cell in front of a turret's mount face or a thruster's nozzle is never filled.

import { BLOCKS } from '../data/blocks.js';
import { DIRS, OPP } from '../core/math.js';
import { key, get, cellsOf } from './grid.js';

/** Cells that must stay clear: where a turret's gun sits and where a thruster's flame goes. */
export function keepClearCells(g) {
  const out = new Set();
  for (const b of g.cells.values()) {
    const def = BLOCKS[b.t];
    if (def && (def.cat === 'turret' || b.t === 'thruster')) { const [dx, dy, dz] = DIRS[b.r]; out.add(key(b.x + dx, b.y + dy, b.z + dz)); }
  }
  return out;
}

/**
 * @param {{cells: Map}} g
 * @returns {Array<{x:number,y:number,z:number,n:number,t:number,kind:'w11'|'w12a'|'w12b',src:object}>}
 *   n = the floor's "up" direction (DIRS index), t = the direction from the wall into the gap, src = the floor block
 *   (the wedge takes its colour).
 */
export function cornerPlan(g) {
  const clear = keepClearCells(g);
  const occ = (x, y, z) => g.occ.has(key(x, y, z));
  const smoothAt = (x, y, z) => { const b = get(g, x, y, z); return b && BLOCKS[b.t]?.smooth ? b : null; };
  const free = (x, y, z) => !occ(x, y, z) && !clear.has(key(x, y, z));

  // candidate gap cells: empty neighbours of smooth blocks
  const cand = new Map();
  for (const b of g.cells.values()) {
    if (!BLOCKS[b.t]?.smooth) continue;
    for (const [bx, by, bz] of cellsOf(b)) for (const [dx, dy, dz] of DIRS) {
      const x = bx + dx, y = by + dy, z = bz + dz; const k = key(x, y, z);
      if (!cand.has(k) && free(x, y, z)) cand.set(k, [x, y, z]);
    }
  }

  const pieces = new Map();   // cell key → list of pieces in that cell
  const add = (x, y, z, n, t, kind, src) => {
    const k = key(x, y, z); let L = pieces.get(k); if (!L) pieces.set(k, (L = []));
    L.push({ x, y, z, n, t, kind, src });
  };
  for (const [x, y, z] of cand.values()) {
    for (let n = 0; n < 6; n++) {
      const [nx, ny, nz] = DIRS[n];
      const floor = smoothAt(x - nx, y - ny, z - nz); if (!floor) continue;
      if (occ(x + nx, y + ny, z + nz)) continue;                       // a pocket with a ceiling: leave it
      for (let t = 0; t < 6; t++) {
        if (t === n || t === OPP[n]) continue;
        const [tx, ty, tz] = DIRS[t];
        if (!smoothAt(x - tx, y - ty, z - tz)) continue;                // no wall behind
        const bx = x + tx, by = y + ty, bz = z + tz;                    // the next cell along the tread
        if (occ(bx, by, bz)) continue;                                  // a one-wide notch: leave it
        if (!occ(bx - nx, by - ny, bz - nz)) { add(x, y, z, n, t, 'w11', floor); continue; }   // tread 1 long
        // tread at least 2 long: a 1x2 piece only if it is exactly 2 and the second cell can take it
        const bFloor = smoothAt(bx - nx, by - ny, bz - nz);
        const cx = bx + tx, cy = by + ty, cz = bz + tz;
        if (bFloor && free(bx, by, bz) && !occ(bx + nx, by + ny, bz + nz) && !occ(cx, cy, cz) && !occ(cx - nx, cy - ny, cz - nz)) {
          add(x, y, z, n, t, 'w12a', floor); add(bx, by, bz, n, t, 'w12b', bFloor);
        }
      }
    }
  }

  // tidy each cell: one 45° wedge per plane (seen from either leg), and no 45° wedge where a 1x2 piece already
  // covers that plane (the 1x2 piece contains it)
  const out = [];
  const plane = (a, b) => { const A = a >> 1, B = b >> 1; return A < B ? A * 3 + B : B * 3 + A; };
  for (const L of pieces.values()) {
    const big = new Set(L.filter(p => p.kind !== 'w11').map(p => plane(p.n, p.t)));
    const seen = new Map();
    for (const p of L) {
      let id;
      if (p.kind === 'w11') {
        if (big.has(plane(p.n, p.t))) continue;
        id = 'w11:' + Math.min(p.n, p.t) + ':' + Math.max(p.n, p.t);
      } else id = p.kind + ':' + p.n + ':' + p.t;
      // a 45° wedge has two legs; it takes the colour of the leg that is not a window (glass slopes look wrong)
      if (seen.has(id)) { const i = seen.get(id); if (out[i].src.t === 'window' && p.src.t !== 'window') out[i] = p; continue; }
      seen.set(id, out.length); out.push(p);
    }
  }
  return out;
}

/**
 * The cross-section of each piece in (s, h): s from the wall (0) outwards (1), h from the floor (0) up (1).
 * Used by the mesh builder and by the tests.
 */
export const PROFILES = {
  w11: [[0, 0], [1, 0], [0, 1]],
  w12a: [[0, 0], [1, 0], [1, 0.5], [0, 1]],
  w12b: [[0, 0], [1, 0], [0, 0.5]],
};
/** Height of a piece's top surface at s (0..1). */
export function profileHeight(kind, s) {
  if (kind === 'w11') return 1 - s;
  if (kind === 'w12a') return 1 - s / 2;
  return 0.5 - s / 2;
}
