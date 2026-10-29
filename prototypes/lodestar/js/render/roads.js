// The road look (PLAN §0.13: roads are smooth lines, not stair-stepped pixels). PURE (no GL here; scope.js uploads).
//
// The sim marks a cell as road when its centre is within `width` (2.2 cells) of the road's centre line
// (js/world/vectors.js rasterLine). This file builds a DISTANCE FIELD of the same thing: one byte per cell, the
// distance from that cell's centre to the nearest LAID part of any road, in 1/`SCALE` cells. The cell shader samples
// it with linear filtering, which gives the exact same edge (distance = width) at sub-cell precision — a smooth,
// anti-aliased band whose inside is precisely the cells the sim walks on as road (drawn == measured, tested in
// tests/m3-roads.test.js). Junctions need no special case: the field is a minimum over every road.

import { cutPolyline } from '../world/vectors.js';

export const SCALE = 40;          // field units per cell
export const FAR = 255;           // "no road near": 255 / 40 = 6.4 cells
export const REACH = FAR / SCALE;

/** Distance from point (px, py) to segment a-b. */
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + dx * t - px, qy = ay + dy * t - py;
  return Math.sqrt(qx * qx + qy * qy);
}

/** The polylines that are actually laid for one road record { pts, laid: [[a, b]] }. */
export function laidParts(v) {
  const out = [];
  for (const [a, b] of v.laid || []) { const p = cutPolyline(v.pts, a, b); if (p.length >= 2) out.push(p); }
  return out;
}

/**
 * Stamp roads into `field` (Uint8Array W×H, row-major, FAR = nothing). Returns the dirty rectangle
 * [x0, y0, x1, y1] (inclusive) or null. Pass `clearRect` to reset an area first (a road was removed).
 */
export function stampRoads(field, W, H, roads, clearRect = null) {
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  if (clearRect) {
    const [cx0, cy0, cx1, cy1] = clearRect;
    for (let y = Math.max(0, cy0); y <= Math.min(H - 1, cy1); y++) field.fill(FAR, y * W + Math.max(0, cx0), y * W + Math.min(W - 1, cx1) + 1);
    x0 = cx0; y0 = cy0; x1 = cx1; y1 = cy1;
  }
  const R = Math.ceil(REACH) + 1;
  for (const v of roads) {
    for (const part of laidParts(v)) {
      for (let i = 1; i < part.length; i++) {
        const [ax, ay] = part[i - 1], [bx, by] = part[i];
        const sx0 = Math.max(0, Math.floor(Math.min(ax, bx)) - R), sx1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx)) + R);
        const sy0 = Math.max(0, Math.floor(Math.min(ay, by)) - R), sy1 = Math.min(H - 1, Math.ceil(Math.max(ay, by)) + R);
        for (let y = sy0; y <= sy1; y++) for (let x = sx0; x <= sx1; x++) {
          // cell (x, y) centre is at x + 0.5 in world units; the line's points are stamped at pt + 0.5 too, so both
          // shift together and the distance is the same as from (x, y) to the polyline in point units
          const d = segDist(x, y, ax, ay, bx, by);
          if (d >= REACH) continue;
          const q = Math.round(d * SCALE);
          const k = y * W + x;
          if (q < field[k]) field[k] = q;
        }
        if (sx0 < x0) x0 = sx0; if (sy0 < y0) y0 = sy0; if (sx1 > x1) x1 = sx1; if (sy1 > y1) y1 = sy1;
      }
    }
  }
  return x1 < 0 ? null : [x0, y0, x1, y1];
}

/** Bounding box of a road record's points, grown by the field's reach. */
export function roadBox(v) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of v.pts) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  const R = Math.ceil(REACH) + 2;
  return [Math.floor(x0) - R, Math.floor(y0) - R, Math.ceil(x1) + R, Math.ceil(y1) + R];
}
