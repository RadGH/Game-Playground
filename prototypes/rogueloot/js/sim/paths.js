// Getting round things (ruling 19: "no getting stuck"). Pure.
//   walkGrid(area)                     a 1 m grid of blocked cells, built once per area (blockers inflated by a body)
//   flowTo(w, key, x, z)               a distance field to a point, cached per target cell; monsters roll downhill on it
//   clearLine(area, ax, az, bx, bz, r) is the straight line free of blockers? (archers' line of sight, shortcutting)
export const CELL = 1;
const INFLATE = 0.45;

export function walkGrid(area) {
  if (area._grid) return area._grid;
  const B = area.bounds, nx = Math.ceil((B.x1 - B.x0) / CELL), nz = Math.ceil((B.z1 - B.z0) / CELL);
  const blocked = new Uint8Array(nx * nz);
  for (const b of area.blockers) {
    const r = b.r + INFLATE, x0 = Math.floor((b.x - r - B.x0) / CELL), x1 = Math.floor((b.x + r - B.x0) / CELL), z0 = Math.floor((b.z - r - B.z0) / CELL), z1 = Math.floor((b.z + r - B.z0) / CELL);
    for (let z = Math.max(0, z0); z <= Math.min(nz - 1, z1); z++) for (let x = Math.max(0, x0); x <= Math.min(nx - 1, x1); x++) {
      const cx = B.x0 + (x + 0.5) * CELL, cz = B.z0 + (z + 0.5) * CELL;
      if (Math.hypot(cx - b.x, cz - b.z) < r) blocked[z * nx + x] = 1;
    }
  }
  area._grid = { nx, nz, blocked, x0: B.x0, z0: B.z0 };
  return area._grid;
}
const cellOf = (g, x, z) => [Math.max(0, Math.min(g.nx - 1, Math.floor((x - g.x0) / CELL))), Math.max(0, Math.min(g.nz - 1, Math.floor((z - g.z0) / CELL)))];

/** Breadth-first distance (in cells, 8-way) from the target cell; cached by cell for `ttl` seconds of sim time. */
export function flowTo(w, x, z, ttl = 0.6) {
  const g = walkGrid(w.area), [tx, tz] = cellOf(g, x, z), key = tz * g.nx + tx;
  w._flows ||= new Map();
  const hit = w._flows.get(key);
  if (hit && w.time - hit.at < ttl) return hit.field;
  const field = new Float32Array(g.nx * g.nz).fill(Infinity), q = new Int32Array(g.nx * g.nz);
  let h = 0, t = 0; field[key] = 0; q[t++] = key;
  const D = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
  while (h < t) {
    const i = q[h++], cx = i % g.nx, cz = (i / g.nx) | 0, d0 = field[i];
    if (d0 > 90) continue;                                          // nobody chases further than this
    for (const [dx, dz, c] of D) {
      const x2 = cx + dx, z2 = cz + dz; if (x2 < 0 || z2 < 0 || x2 >= g.nx || z2 >= g.nz) continue;
      const j = z2 * g.nx + x2; if (g.blocked[j]) continue;
      if (dx && dz && (g.blocked[cz * g.nx + x2] || g.blocked[z2 * g.nx + cx])) continue;   // no squeezing past corners
      const nd = d0 + c; if (nd < field[j]) { field[j] = nd; q[t++] = j; }
    }
  }
  if (w._flows.size > 64) w._flows.clear();
  w._flows.set(key, { at: w.time, field });
  return field;
}
/** The way to go from (x, z) along the field: the best neighbouring cell's centre. */
export function downhill(w, field, x, z) {
  const g = walkGrid(w.area), [cx, cz] = cellOf(g, x, z);
  let best = null, bd = field[cz * g.nx + cx];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dz) continue; const x2 = cx + dx, z2 = cz + dz; if (x2 < 0 || z2 < 0 || x2 >= g.nx || z2 >= g.nz) continue;
    const d = field[z2 * g.nx + x2]; if (d < bd) { bd = d; best = [g.x0 + (x2 + 0.5) * CELL, g.z0 + (z2 + 0.5) * CELL]; }
  }
  return best;
}
/** Does the segment a->b (a body of radius r) clear every blocker? */
export function clearLine(area, ax, az, bx, bz, r = 0) {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-9;
  for (const b of area.blockers) {
    const t = Math.max(0, Math.min(1, ((b.x - ax) * dx + (b.z - az) * dz) / L2));
    const px = ax + dx * t - b.x, pz = az + dz * t - b.z, min = b.r + r;
    if (px * px + pz * pz < min * min) return false;
  }
  return true;
}
