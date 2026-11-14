// Rays through block grids: a shot, beam or the builder's mouse finds the exact block it touches by stepping cell
// to cell (a 3D "DDA" walk — same idea as drawing a line on graph paper one square at a time).

import { key } from './grid.js';
import { bounds } from './grid.js';
import { toLocal, dirToLocal } from './body.js';

/**
 * Walk a ray through a grid in local coordinates.
 * @returns {{blk, t:number, face:number, x:number,y:number,z:number}|null} face = DIRS index of the face entered
 */
export function rayGrid(g, o, d, maxT, bb = null) {
  bb = bb || g.bounds || bounds(g);
  // clip to the grid's box first
  let t0 = 0, t1 = maxT;
  const lo = [bb.x0, bb.y0, bb.z0], hi = [bb.x1 + 1, bb.y1 + 1, bb.z1 + 1], O = [o.x, o.y, o.z], D = [d.x, d.y, d.z];
  let enterAxis = -1;
  for (let a = 0; a < 3; a++) {
    if (Math.abs(D[a]) < 1e-12) { if (O[a] < lo[a] || O[a] > hi[a]) return null; continue; }
    let ta = (lo[a] - O[a]) / D[a], tb = (hi[a] - O[a]) / D[a];
    if (ta > tb) [ta, tb] = [tb, ta];
    if (ta > t0) { t0 = ta; enterAxis = a; }
    if (tb < t1) t1 = tb;
    if (t0 > t1) return null;
  }
  const eps = 1e-6;
  let x = Math.floor(O[0] + D[0] * (t0 + eps)), y = Math.floor(O[1] + D[1] * (t0 + eps)), z = Math.floor(O[2] + D[2] * (t0 + eps));
  const sx = D[0] > 0 ? 1 : -1, sy = D[1] > 0 ? 1 : -1, sz = D[2] > 0 ? 1 : -1;
  const next = (c, s, a) => ((s > 0 ? c + 1 : c) - O[a]) / D[a];
  let tx = Math.abs(D[0]) < 1e-12 ? Infinity : next(x, sx, 0);
  let ty = Math.abs(D[1]) < 1e-12 ? Infinity : next(y, sy, 1);
  let tz = Math.abs(D[2]) < 1e-12 ? Infinity : next(z, sz, 2);
  const dx = Math.abs(1 / D[0]), dy = Math.abs(1 / D[1]), dz = Math.abs(1 / D[2]);
  let t = t0, face = enterAxis < 0 ? -1 : enterAxis * 2 + (D[enterAxis] > 0 ? 1 : 0);
  for (let i = 0; i < 512 && t <= t1 + eps; i++) {
    const blk = g.occ.get(key(x, y, z));
    if (blk) return { blk, t, face, x, y, z };
    if (tx < ty && tx < tz) { t = tx; tx += dx; x += sx; face = sx > 0 ? 1 : 0; }
    else if (ty < tz) { t = ty; ty += dy; y += sy; face = sy > 0 ? 3 : 2; }
    else { t = tz; tz += dz; z += sz; face = sz > 0 ? 5 : 4; }
  }
  return null;
}

/** World ray against one body. Returns hit with world-space t (same as local t; rotation keeps lengths). */
export function rayBody(body, o, d, maxT) {
  // quick reject with the bounding sphere
  const ox = o.x - body.pos.x, oy = o.y - body.pos.y, oz = o.z - body.pos.z;
  const b = ox * d.x + oy * d.y + oz * d.z; const c = ox * ox + oy * oy + oz * oz - body.radius * body.radius;
  if (c > 0 && b > 0) return null;
  const disc = b * b - c; if (disc < 0) return null;
  const tn = -b - Math.sqrt(disc); if (tn > maxT) return null;
  if (!body.grid.bounds || body.grid.boundsV !== body.grid.version) { body.grid.bounds = bounds(body.grid); body.grid.boundsV = body.grid.version; }
  return rayGrid(body.grid, toLocal(body, o), dirToLocal(body, d), maxT);
}

/** Nearest hit among bodies (filter decides who can be hit). */
export function rayWorld(bodies, o, d, maxT, filter = () => true) {
  let best = null;
  for (const b of bodies) {
    if (b.dead || !filter(b)) continue;
    const h = rayBody(b, o, d, best ? best.t : maxT);
    if (h && (!best || h.t < best.t)) best = { ...h, body: b };
  }
  return best;
}
