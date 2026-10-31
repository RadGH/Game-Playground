// Finding a way round a planned interior. Pure: a plan in, a list of points out. Used by the planner's own check, by the page
// (people walking indoors, tap to walk) and by the tests, so all three agree on what "reachable" means.
//
//   solids(plan, lv, shut?)             the rectangles a body cannot enter on one floor
//   findPath(plan, lv, a, b, r, shut?)  [[x, z], ...] or null; a, b = { x, z } in the building's own frame
//   routeInside(plan, a, b, r, shut?)   the same across floors, by the lift: [[x, z, lv], ...]
// A plan's frame: x across the building, +z towards the street, origin at the middle of the footprint.

const CELL = 0.2, MARGIN = 1.6;

/** Everything solid on a floor. `shut(door)` = this door is closed right now (a shutter, a garage door, a locked vault). */
export function solids(plan, lv, shut = null) {
  const out = [];
  for (const w of plan.walls) if (w.lv === lv) out.push(w);
  for (const f of plan.furn) if (f.lv === lv && f.solid !== false) out.push(f.rect);
  if (shut) for (const d of plan.doors) if (d.lv === lv && d.kind !== 'room' && shut(d)) out.push(d.rect);
  return out;
}

function gridFor(plan, lv, r, shut) {
  const key = `${lv}|${r}`, closed = shut ? plan.doors.filter(d => d.lv === lv && d.kind !== 'room' && shut(d)).map(d => d.id).join() : '';
  plan._grids ??= new Map();
  const had = plan._grids.get(key);
  if (had && had.closed === closed) return had;
  const x0 = -plan.w / 2 - MARGIN, z0 = -plan.d / 2 - MARGIN, nx = Math.ceil((plan.w + MARGIN * 2) / CELL), nz = Math.ceil((plan.d + MARGIN * 2) / CELL);
  const blocked = new Uint8Array(nx * nz);
  for (const q of solids(plan, lv, shut)) {
    const i0 = Math.max(0, Math.floor((q.x0 - r - x0) / CELL)), i1 = Math.min(nx - 1, Math.ceil((q.x1 + r - x0) / CELL)), j0 = Math.max(0, Math.floor((q.z0 - r - z0) / CELL)), j1 = Math.min(nz - 1, Math.ceil((q.z1 + r - z0) / CELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const cx = x0 + (i + 0.5) * CELL, cz = z0 + (j + 0.5) * CELL;
      if (cx > q.x0 - r && cx < q.x1 + r && cz > q.z0 - r && cz < q.z1 + r) blocked[j * nx + i] = 1;
    }
  }
  const g = { x0, z0, nx, nz, blocked, closed, from: null, dist: null };
  plan._grids.set(key, g);
  return g;
}

const cellOf = (g, x, z) => [Math.max(0, Math.min(g.nx - 1, Math.floor((x - g.x0) / CELL))), Math.max(0, Math.min(g.nz - 1, Math.floor((z - g.z0) / CELL)))];

/** The free cell nearest a point, within half a metre: a spot right by a sofa may sit a hair inside the inflated edge. */
function freeNear(g, x, z) {
  const [i, j] = cellOf(g, x, z);
  if (!g.blocked[j * g.nx + i]) return j * g.nx + i;
  let best = -1, d = 1e9;
  for (let r = 1; r <= 3; r++) {
    for (let b = -r; b <= r; b++) for (let a = -r; a <= r; a++) {
      if (Math.max(Math.abs(a), Math.abs(b)) !== r) continue;
      const ii = i + a, jj = j + b;
      if (ii < 0 || jj < 0 || ii >= g.nx || jj >= g.nz || g.blocked[jj * g.nx + ii]) continue;
      const e = a * a + b * b;
      if (e < d) { d = e; best = jj * g.nx + ii; }
    }
    if (best >= 0) return best;
  }
  return -1;
}

function clearLine(g, a, b) {
  const ax = a % g.nx, az = Math.floor(a / g.nx), bx = b % g.nx, bz = Math.floor(b / g.nx), n = Math.max(Math.abs(ax - bx), Math.abs(az - bz)) * 2;
  for (let k = 0; k <= n; k++) {
    const t = n ? k / n : 0, i = Math.round(ax + (bx - ax) * t), j = Math.round(az + (bz - az) * t);
    if (g.blocked[j * g.nx + i]) return false;
  }
  return true;
}

/** One flood per target cell, kept: everybody walking to the same door costs one search. */
function floodTo(g, goal) {
  g.cache ??= new Map();
  let dist = g.cache.get(goal);
  if (!dist) {
    if (g.cache.size > 24) g.cache.clear();
    dist = new Int32Array(g.nx * g.nz).fill(-1);
    const q = new Int32Array(g.nx * g.nz); let h = 0, t = 0;
    q[t++] = goal; dist[goal] = 0;
    while (h < t) {
      const c = q[h++], i = c % g.nx, j = Math.floor(c / g.nx);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= g.nx || jj >= g.nz) continue;
        const n = jj * g.nx + ii;
        if (dist[n] >= 0 || g.blocked[n]) continue;
        if (di && dj && (g.blocked[j * g.nx + ii] || g.blocked[jj * g.nx + i])) continue;
        dist[n] = dist[c] + 1; q[t++] = n;
      }
    }
    g.cache.set(goal, dist);
  }
  return dist;
}
/** Can a body get from a to b? Cheaper than asking for the path. */
export function canReach(plan, lv, a, b, r = 0.4, shut = null) {
  const g = gridFor(plan, lv, r, shut), start = freeNear(g, a.x, a.z), goal = freeNear(g, b.x, b.z);
  return start >= 0 && goal >= 0 && floodTo(g, goal)[start] >= 0;
}
export function findPath(plan, lv, a, b, r = 0.4, shut = null) {
  const g = gridFor(plan, lv, r, shut), start = freeNear(g, a.x, a.z), goal = freeNear(g, b.x, b.z);
  if (start < 0 || goal < 0) return null;
  const dist = floodTo(g, goal);
  if (dist[start] < 0) return null;
  const cells = [start];
  for (let c = start; c !== goal;) {
    const i = c % g.nx, j = Math.floor(c / g.nx);
    let best = -1, bd = dist[c];
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= g.nx || jj >= g.nz) continue;
      const n = jj * g.nx + ii;
      if (dist[n] < 0 || dist[n] >= bd) continue;
      if (di && dj && (g.blocked[j * g.nx + ii] || g.blocked[jj * g.nx + i])) continue;
      bd = dist[n]; best = n;
    }
    if (best < 0) return null;
    c = best; cells.push(c);
  }
  // straighten: from each kept point, the furthest one it can see
  const keep = [cells[0]];
  for (let at = 0; at < cells.length - 1;) {
    let n = Math.min(cells.length - 1, at + 40);
    while (n > at + 1 && !clearLine(g, cells[at], cells[n])) n--;
    keep.push(cells[n]); at = n;
  }
  const pts = keep.map(c => [g.x0 + (c % g.nx + 0.5) * CELL, g.z0 + (Math.floor(c / g.nx) + 0.5) * CELL]);
  pts[0] = [a.x, a.z]; pts[pts.length - 1] = [b.x, b.z];
  return pts;
}

/** Across floors: to the lift, up, and on. Points carry their floor. */
export function routeInside(plan, a, b, r = 0.4, shut = null) {
  const la = a.lv ?? 0, lb = b.lv ?? 0;
  if (la === lb) { const p = findPath(plan, la, a, b, r, shut); return p && p.map(q => [q[0], q[1], la]); }
  const L = plan.lift; if (!L) return null;
  const up = findPath(plan, la, a, L, r, shut), on = findPath(plan, lb, L, b, r, shut);
  return up && on ? [...up.map(q => [q[0], q[1], la]), ...on.map(q => [q[0], q[1], lb])] : null;
}

/** The point just outside the street door. */
export const outsideDoor = plan => { const d = plan.doors.find(x => x.a === 'out' && x.kind !== 'garage'); return { x: d.x, z: d.z + 0.95, lv: 0 }; };
