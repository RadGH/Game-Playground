// The scope's view: where the sensor picture is centred and how many screen pixels a cell takes. Pure (node-tested).
// The scope never tilts or orbits (PLAN §0.1): a view is only a centre and a range. Screen north = up = smaller y,
// so W / up / stick-up pans to smaller y (game standards: top-down W = screen north).

export function createView({ size = [1536, 1536], cx, cy, ppc = 2 } = {}) {
  const v = { w: size[0], h: size[1], cx: cx ?? size[0] / 2, cy: cy ?? size[1] / 2, ppc, sw: 400, sh: 400 };
  const clamp = () => {
    // the centre may go a little past the map edge (half a screen) so an edge can be looked at in the middle
    const hx = v.sw / v.ppc / 2, hy = v.sh / v.ppc / 2;
    const mx = Math.min(hx, v.w / 2), my = Math.min(hy, v.h / 2);
    v.cx = Math.max(Math.min(v.cx, v.w - mx * 0.25), mx * 0.25);
    v.cy = Math.max(Math.min(v.cy, v.h - my * 0.25), my * 0.25);
  };
  const api = {
    get cx() { return v.cx; }, get cy() { return v.cy; }, get ppc() { return v.ppc; },
    get size() { return [v.w, v.h]; }, get screen() { return [v.sw, v.sh]; },
    setScreen(sw, sh) { v.sw = Math.max(1, sw); v.sh = Math.max(1, sh); clamp(); },
    setPpc(p) { v.ppc = p; clamp(); },
    centre(x, y) { v.cx = x; v.cy = y; clamp(); },
    /** Pan by screen pixels (dx right, dy down). Dragging the picture moves it with the finger: pass -drag. */
    panPx(dx, dy) { v.cx += dx / v.ppc; v.cy += dy / v.ppc; clamp(); },
    /** Pan by a direction (north = {x:0,y:-1}) for a time, at px per second. */
    panDir(x, y, pxPerSec, dt) { api.panPx(x * pxPerSec * dt, y * pxPerSec * dt); },
    toScreen(x, y) { return [(x - v.cx) * v.ppc + v.sw / 2, (y - v.cy) * v.ppc + v.sh / 2]; },
    toCell(sx, sy) { return [(sx - v.sw / 2) / v.ppc + v.cx, (sy - v.sh / 2) / v.ppc + v.cy]; },
    /** Visible cell rectangle [x0, y0, x1, y1] (may extend past the map). */
    rect() { const hw = v.sw / v.ppc / 2, hh = v.sh / v.ppc / 2; return [v.cx - hw, v.cy - hh, v.cx + hw, v.cy + hh]; },
    /** Zoom to a new range keeping the cell under screen point (sx, sy) where it is. */
    zoomAt(ppc, sx = v.sw / 2, sy = v.sh / 2) {
      const [x, y] = api.toCell(sx, sy);
      v.ppc = ppc;
      v.cx = x - (sx - v.sw / 2) / ppc; v.cy = y - (sy - v.sh / 2) / ppc; clamp();
    },
  };
  return api;
}

/** Map grid references: one square per 64-cell chunk. Columns are letters (A..Z, then AA..), rows are numbers from 1. */
export const GRID = 64;
export function colName(i) { let s = ''; i = Math.floor(i); do { s = String.fromCharCode(65 + (i % 26)) + s; i = Math.floor(i / 26) - 1; } while (i >= 0); return s; }
export function gridRef(x, y) { return `${colName(Math.max(0, Math.floor(x / GRID)))}${Math.max(0, Math.floor(y / GRID)) + 1}`; }
