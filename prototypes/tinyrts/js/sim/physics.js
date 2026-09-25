// Box movement against the cell grid. A unit is a box `w` wide and `h` tall whose feet are at
// (x, y): it occupies columns floor(x - w/2) .. +w-1 and rows floor(y) - h .. floor(y) - 1.

import { M, S } from '../world/materials.js';

export const GRAVITY = 220;

export function boxFree(world, u, x, y) {
  const x0 = Math.floor(x - u.w / 2), y1 = Math.floor(y), y0 = y1 - u.h;
  for (let cy = y0; cy < y1; cy++) for (let cx = x0; cx < x0 + u.w; cx++) {
    if (world.solidFor(cx, cy, u.team)) return false;
  }
  return true;
}

export function grounded(world, u) {
  const x0 = Math.floor(u.x - u.w / 2), row = Math.floor(u.y);
  for (let cx = x0; cx < x0 + u.w; cx++) if (world.solidFor(cx, row, u.team)) return true;
  return false;
}

// Is there natural terrain touching the side the unit faces (or either side)? Hollow cling to it.
export function touchingTerrain(world, u, dir) {
  const x0 = Math.floor(u.x - u.w / 2), y1 = Math.floor(u.y), y0 = y1 - u.h;
  const cols = dir > 0 ? [x0 + u.w] : dir < 0 ? [x0 - 1] : [x0 - 1, x0 + u.w];
  const st = world.mats.state;
  for (const cx of cols) for (let cy = y0; cy < y1; cy++) {
    const m = world.get(cx, cy);
    if (st[m] === S.STATIC || st[m] === S.LOOSE) return true;
  }
  return false;
}

// Apply gravity and fall, cell by cell. Returns fall distance if the unit landed this tick, else 0.
export function fall(world, u, dt) {
  if (u.vy < 0) return 0; // rising (jump) is handled by rise()
  if (grounded(world, u)) {
    u.vy = 0;
    if (u.airborne) { u.airborne = false; return Math.max(0.001, u.y - (u.fallStart ?? u.y)); }
    return 0;
  }
  if (!u.airborne) { u.airborne = true; u.fallStart = u.y; }
  u.vy = Math.min(u.vy + GRAVITY * dt, 220);
  let dy = u.vy * dt;
  while (dy > 0) {
    const step = Math.min(1, dy);
    if (!boxFree(world, u, u.x, u.y + step)) {
      u.y = Math.floor(u.y + step);
      u.vy = 0; u.airborne = false;
      return Math.max(0.001, u.y - (u.fallStart ?? u.y));
    }
    u.y += step; dy -= step;
    if (u.y > world.h + 10) return 0;
  }
  return 0;
}

// Jump / move up (negative vy) — handled by moving up while free.
export function rise(world, u, dt) {
  if (u.vy >= 0) return;
  let dy = -u.vy * dt;
  while (dy > 0) {
    const step = Math.min(1, dy);
    if (!boxFree(world, u, u.x, u.y - step)) { u.vy = 0; return; }
    u.y -= step; dy -= step;
  }
  u.vy += GRAVITY * dt;
  if (u.vy > 0) { u.vy = 0; u.airborne = true; u.fallStart = u.y; }
}

// Walk sideways by dx, stepping up at most `step` cells. Returns true if it moved.
export function walk(world, u, dx, step = 3) {
  const nx = u.x + dx;
  if (Math.floor(nx - u.w / 2) === Math.floor(u.x - u.w / 2)) { u.x = nx; return true; }
  for (let lift = 0; lift <= step; lift++) {
    if (boxFree(world, u, nx, u.y - lift)) { u.x = nx; u.y -= lift; return true; }
  }
  // Blocked at head height but open lower down (stepping off a ledge under an overhang).
  for (let drop = 1; drop <= step; drop++) {
    if (boxFree(world, u, u.x, u.y + drop) && boxFree(world, u, nx, u.y + drop)) { u.x = nx; u.y += drop; return true; }
  }
  return false;
}

// Height of the obstacle directly ahead (in cells, from the feet), up to max.
export function obstacleHeight(world, u, dir, max = 40) {
  const cx = dir > 0 ? Math.floor(u.x - u.w / 2) + u.w : Math.floor(u.x - u.w / 2) - 1;
  const y1 = Math.floor(u.y);
  let hgt = 0;
  for (let k = 1; k <= max; k++) {
    if (world.solidFor(cx, y1 - k, u.team)) hgt = k; else if (k > hgt + 1) break;
  }
  return hgt;
}

// What blocks the unit ahead: 'terrain' | 'built' | 'building' | null, plus a sample cell.
export function blockerAhead(world, u, dir) {
  const cx = dir > 0 ? Math.floor(u.x - u.w / 2) + u.w : Math.floor(u.x - u.w / 2) - 1;
  const y1 = Math.floor(u.y), y0 = y1 - u.h;
  let kind = null, cell = null;
  for (let cy = y1 - 1; cy >= y0; cy--) {
    const m = world.get(cx, cy);
    if (m === M.EMPTY) continue;
    if (!world.solidFor(cx, cy, u.team)) continue;
    const i = world.inBounds(cx, cy) ? world.idx(cx, cy) : -1;
    let k;
    if (m === M.FOOTPRINT) k = 'building';
    else if (world.mats.built[m]) k = 'built';
    else k = 'terrain';
    // Prefer man-made blockers: they're what the Hollow chew.
    if (!kind || (kind === 'terrain' && k !== 'terrain')) { kind = k; cell = { x: cx, y: cy, i, team: i >= 0 ? world.team[i] : 0, owner: i >= 0 ? world.owner[i] : 0 }; }
  }
  return kind ? { kind, ...cell } : null;
}

// Fly toward (tx, ty): straight if clear; otherwise climb until clear. Returns distance left.
export function flyToward(world, u, tx, ty, speed, dt) {
  const dx = tx - u.x, dy = ty - u.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.5) return d;
  const step = Math.min(d, speed * dt);
  const nx = u.x + (dx / d) * step, ny = u.y + (dy / d) * step;
  if (boxFree(world, u, nx, ny)) { u.x = nx; u.y = ny; u.stuckFly = 0; return d - step; }
  // Try horizontal only, then vertical only, then climb.
  if (boxFree(world, u, nx, u.y)) { u.x = nx; return d; }
  if (boxFree(world, u, u.x, ny)) { u.y = ny; return d; }
  if (boxFree(world, u, u.x, u.y - step)) { u.y -= step; u.stuckFly = (u.stuckFly || 0) + dt; return d; }
  if (boxFree(world, u, u.x, u.y + step)) { u.y += step; return d; }
  u.stuckFly = (u.stuckFly || 0) + dt;
  return d;
}

// Fly toward (tx, ty) using a flyer path when the straight line is blocked (caves, tunnels,
// overhangs). Keeps its path on the unit; returns distance left to the final target.
export function flyTo(game, u, tx, ty, speed, dt) {
  const world = game.world;
  const direct = Math.hypot(tx - u.x, ty - u.y);
  if (!u.flyGoal || Math.abs(u.flyGoal.x - tx) > 4 || Math.abs(u.flyGoal.y - ty) > 4) {
    u.flyPath = null; u.flyGoal = { x: tx, y: ty }; u.flyBest = direct; u.flyStall = 0;
  }
  // Stalled = not getting closer (sliding along a ceiling counts as stalled too).
  if (direct < (u.flyBest ?? Infinity) - 1) { u.flyBest = direct; u.flyStall = 0; }
  else if (direct > 2) u.flyStall = (u.flyStall || 0) + dt;
  if (!u.flyPath && ((u.stuckFly || 0) > 0.4 || (u.flyStall || 0) > 0.6)) {
    u.flyPath = game._findFlyPath(game, u, tx, ty);
    u.flyPathI = 0;
    u.stuckFly = 0; u.flyStall = 0; u.flyBest = direct;
  }
  if (u.flyPath && u.flyPath.length) {
    while (u.flyPathI < u.flyPath.length - 1) {
      const p = u.flyPath[u.flyPathI];
      if (Math.hypot(p.x - u.x, p.y - u.y) < 2.5) u.flyPathI++; else break;
    }
    const p = u.flyPath[u.flyPathI];
    flyToward(world, u, p.x, p.y, speed, dt);
    if (u.flyPathI >= u.flyPath.length - 1 && Math.hypot(p.x - u.x, p.y - u.y) < 2.5) { u.flyPath = null; }
    if ((u.stuckFly || 0) > 1.5 || (u.flyStall || 0) > 3) { u.flyPath = null; u.flyStall = 0; }
    return direct;
  }
  return flyToward(world, u, tx, ty, speed, dt);
}

// Push a unit out of solid cells (after terrain changed around it): try up first, then sideways.
export function unstick(world, u) {
  if (boxFree(world, u, u.x, u.y)) return true;
  for (let k = 1; k < 30; k++) {
    if (boxFree(world, u, u.x, u.y - k)) { u.y -= k; return true; }
    if (boxFree(world, u, u.x - k, u.y)) { u.x -= k; return true; }
    if (boxFree(world, u, u.x + k, u.y)) { u.x += k; return true; }
  }
  return false;
}
