// Entities against the grid (docs/06 §12, docs/07 §2.1). A body is { x, y (feet, bottom-centre), w, h }.
// Solid for movement = STATIC or POWDER cells (+ fragments later). Moves in 1-cell sub-steps with
// step-up / step-down. Pure.
import { CLS } from './materials.js';

export function isSolidCell(g, x, y) {
  if (x < 0 || x >= g.W || y >= g.H) return true;   // room edge = bedrock (top is open)
  if (y < 0) return false;
  const c = g.mats.cls[g.mat[y * g.W + x]]; return c === CLS.STATIC || c === CLS.POWDER;
}
/** Any solid cell in the column x over rows [y0, y1]? */
function colSolid(g, x, y0, y1) { for (let y = y0; y <= y1; y++) if (isSolidCell(g, x, y)) return true; return false; }
function rowSolid(g, x0, x1, y) { for (let x = x0; x <= x1; x++) if (isSolidCell(g, x, y)) return true; return false; }

/** Box extents in integer cells: left, right (inclusive), top, bottom (inclusive, the feet row). */
export function extents(b) { const l = Math.round(b.x - b.w / 2), r = l + b.w - 1, bot = Math.round(b.y) - 1, top = bot - b.h + 1; return { l, r, top, bot }; }
export function overlapsSolid(g, b) { const e = extents(b); for (let y = e.top; y <= e.bot; y++) for (let x = e.l; x <= e.r; x++) if (isSolidCell(g, x, y)) return true; return false; }
export function grounded(g, b) { const e = extents(b); return rowSolid(g, e.l, e.r, e.bot + 1); }
export function headBlocked(g, b) { const e = extents(b); return rowSolid(g, e.l, e.r, e.top - 1); }

/**
 * Move a body by (dx, dy) cells with collision. opts: { stepUp, stepDown, wasGrounded }
 * returns { hitX, hitY, landed, bonk, steppedUp }
 */
export function moveBox(g, b, dx, dy, opts = {}) {
  const res = { hitX: 0, hitY: false, landed: false, bonk: false, steppedUp: 0 };
  // horizontal, 1-cell sub-steps
  let rem = dx;
  while (Math.abs(rem) > 1e-6) {
    const step = Math.max(-1, Math.min(1, rem)); rem -= step;
    const nx = b.x + step, e = extents({ ...b, x: nx });
    const edgeX = step > 0 ? e.r : e.l;
    if (!colSolid(g, edgeX, e.top, e.bot)) { b.x = nx; continue; }
    // step-up: find the lowest lift <= stepUp that clears
    let lifted = false;
    for (let up = 1; up <= (opts.stepUp ?? 2); up++) {
      if (!colSolid(g, edgeX, e.top - up, e.bot - up) && !rowSolid(g, e.l, e.r, e.top - up)) {
        // the whole box must fit when lifted
        const cand = { ...b, x: nx, y: b.y - up };
        if (!overlapsSolid(g, cand)) { b.x = nx; b.y -= up; res.steppedUp += up; lifted = true; break; }
      }
    }
    if (!lifted) { res.hitX = step > 0 ? 1 : -1; break; }
  }
  // vertical
  rem = dy;
  while (Math.abs(rem) > 1e-6) {
    const step = Math.max(-1, Math.min(1, rem)); rem -= step;
    const e = extents({ ...b, y: b.y + step });
    const edgeY = step > 0 ? e.bot : e.top;
    if (!rowSolid(g, e.l, e.r, edgeY)) { b.y += step; continue; }
    res.hitY = true; if (step > 0) res.landed = true; else res.bonk = true;
    if (step > 0) { const snapped = { ...b, y: Math.round(b.y) }; if (!overlapsSolid(g, snapped)) b.y = snapped.y; }
    break;
  }
  // step-down glue: was grounded, now a small drop below -> snap down
  if (opts.stepDown && opts.wasGrounded && dy >= 0 && !res.landed && !grounded(g, b)) {
    for (let d = 1; d <= opts.stepDown; d++) { const cand = { ...b, y: b.y + d }; if (grounded(g, cand) && !overlapsSolid(g, cand)) { b.y += d; res.landed = true; break; } }
  }
  return res;
}

/** Push a body out of solid cells (buried by sand, a door closing): up to 4 up, then sideways. */
export function depenetrate(g, b) {
  if (!overlapsSolid(g, b)) return 0;
  for (let d = 1; d <= 4; d++) { if (!overlapsSolid(g, { ...b, y: b.y - d })) { b.y -= d; return d; } }
  for (let d = 1; d <= 4; d++) for (const s of [-1, 1]) { if (!overlapsSolid(g, { ...b, x: b.x + s * d })) { b.x += s * d; return d; } }
  return -1; // stuck
}

/** Fractions of the body's cells that are liquid / steam / web / shocked etc. */
export function sampleBox(g, b) {
  const e = extents(b); const r = g.countIn(e.l, e.top, b.w, b.h);
  const tot = Math.max(1, r.total);
  // head row liquid?
  let head = true; for (let x = e.l; x <= e.r; x++) if (!g.liquidAt(x, e.top + 1)) { head = false; break; }
  return { liquid: r.liquid / tot, steam: r.steam / tot, web: r.web / tot, shock: r.shock, mats: r.mats, head };
}
export function wallTouchRows(g, b, dir) {
  const e = extents(b), x = dir > 0 ? e.r + 1 : e.l - 1; let n = 0; for (let y = e.top; y <= e.bot; y++) if (isSolidCell(g, x, y)) n++; return n;
}
