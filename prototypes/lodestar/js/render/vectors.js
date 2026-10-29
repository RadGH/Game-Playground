// The wall look (PLAN M4, §0.13: walls are smooth lines, not stair-stepped pixels). PURE (no GL here; scope.js uploads).
//
// The sim makes a cell wall when its centre is within the wall width (1.6 cells) of the wall's centre line, and gives
// it to the section its nearest point on the line falls in (js/sim/defence/walls.js). This builds the same thing as a
// DISTANCE FIELD the shader samples with linear filtering: R = distance from the cell's centre to the wall's line in
// 1/`SCALE` cells — written only for cells whose section is STANDING — and G = what that section is (0 none, 255 a
// gate, else 1 + 200 × its hit-point share). So the smooth band the scope draws has its edge exactly where the sim's
// wall cells end, and a broken section simply is not in the field (its rubble is drawn by the cell pass) — drawn ==
// measured, tested in tests/m4-walls.test.js.

import { nearestOn } from '../world/vectors.js';

export const SCALE = 40;
export const FAR = 255;
export const REACH = FAR / SCALE;   // 6.4 cells

const loop = (v) => v.closed ? [...v.pts, v.pts[0]] : v.pts;

/** Bounding box of a wall record grown by the field's reach. */
export function wallBox(v) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of v.pts) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  const R = Math.ceil(REACH) + 2;
  return [Math.floor(x0) - R, Math.floor(y0) - R, Math.ceil(x1) + R, Math.ceil(y1) + R];
}

/**
 * Stamp walls into `field` and `info` (Uint8Array W×H each, row-major). `walls`: public wall records
 * { pts, closed, len, sections: [[a, b, state (1 = up), hpShare, gate]] }. `clearRect` resets an area first.
 * Returns the dirty rectangle or null.
 */
export function stampWalls(field, info, W, H, walls, clearRect = null) {
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  if (clearRect) {
    const [cx0, cy0, cx1, cy1] = clearRect;
    for (let y = Math.max(0, cy0); y <= Math.min(H - 1, cy1); y++) {
      field.fill(FAR, y * W + Math.max(0, cx0), y * W + Math.min(W - 1, cx1) + 1);
      info.fill(0, y * W + Math.max(0, cx0), y * W + Math.min(W - 1, cx1) + 1);
    }
    x0 = cx0; y0 = cy0; x1 = cx1; y1 = cy1;
  }
  for (const v of walls) {
    if (!v.sections?.some((s) => s[2] === 1)) continue;
    const pts = loop(v), n = v.sections.length, L = v.len;
    const [bx0, by0, bx1, by1] = wallBox(v);
    for (let y = Math.max(0, by0); y <= Math.min(H - 1, by1); y++) for (let x = Math.max(0, bx0); x <= Math.min(W - 1, bx1); x++) {
      const nr = nearestOn(pts, x, y);
      const d = Math.sqrt(nr.d2);
      if (d >= REACH) continue;
      const i = Math.max(0, Math.min(n - 1, Math.floor((nr.at / L) * n)));
      const s = v.sections[i];
      if (s[2] !== 1) continue;
      const q = Math.round(d * SCALE), k = y * W + x;
      if (q < field[k]) { field[k] = q; info[k] = s[4] ? 255 : 1 + Math.round(200 * Math.max(0, Math.min(1, s[3]))); }
    }
    if (bx0 < x0) x0 = Math.max(0, bx0); if (by0 < y0) y0 = Math.max(0, by0); if (bx1 > x1) x1 = Math.min(W - 1, bx1); if (by1 > y1) y1 = Math.min(H - 1, by1);
  }
  return x1 < 0 ? null : [x0, y0, x1, y1];
}

/** Is cell (x, y) drawn as wall? (the shader's own test: inside the band of a standing section) */
export const drawnAsWall = (field, W, x, y, width) => field[y * W + x] / SCALE <= width + 0.02;
