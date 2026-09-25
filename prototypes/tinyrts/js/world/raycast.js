// Walking a straight line through cells (a DDA / Bresenham-style step). Used for link beams, turret
// line of fire and laser beams.

import { M, S } from './materials.js';

// Step along the line from (x0,y0) to (x1,y1), calling visit(x, y) for each cell. Stops early if
// visit returns true. Returns the cell it stopped at, or null if it reached the end.
export function walkLine(x0, y0, x1, y1, visit) {
  let x = Math.floor(x0), y = Math.floor(y0);
  const ex = Math.floor(x1), ey = Math.floor(y1);
  const dx = Math.abs(ex - x), dy = -Math.abs(ey - y);
  const sx = x < ex ? 1 : -1, sy = y < ey ? 1 : -1;
  let err = dx + dy;
  for (let guard = 0; guard < 4000; guard++) {
    if (visit(x, y)) return { x, y };
    if (x === ex && y === ey) return null;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
  return null;
}

// Is the line clear of terrain (rock, dust, ore, bedrock)? Built cells and buildings don't block.
// Used for link beams.
export function terrainClear(world, x0, y0, x1, y1) {
  const st = world.mats.state, mat = world.mat, W = world.w;
  const hit = walkLine(x0, y0, x1, y1, (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= world.h) return false;
    const s = st[mat[y * W + x]];
    return s === S.STATIC || s === S.LOOSE;
  });
  return hit === null;
}

// Line of fire for `team`: blocked by any solid cell that isn't the team's own built cell or own
// building footprint. Returns null when clear, else the blocking cell {x, y}.
export function fireBlocked(world, team, x0, y0, x1, y1) {
  const mat = world.mat, tm = world.team, W = world.w, built = world.mats.built;
  return walkLine(x0, y0, x1, y1, (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= world.h) return false;
    const i = y * W + x;
    const m = mat[i];
    if (m === M.EMPTY) return false;
    if ((built[m] || m === M.FOOTPRINT) && tm[i] === team) return false;
    return true;
  });
}
