import { inShape } from '../world/zone.js';
// Walking: the ONE movement rule, used by the authoritative sim (server or solo worker) AND by the client's own
// prediction, so the two agree to the centimetre. Pure: no clocks, no DOM.
//
// An area's blockers are circles { x, z, r } plus the area's rectangle bounds. A walker is a circle of radius `r`.
// Movement slides along blockers (push-out after the step), so walking diagonally into a rock glides round it.

export const WALK_SPEED = 4.6;          // m/s — a measured pace for slower, WoW-like combat (bestiary brutes 3.2, skirmishers 4.6)
export const PLAYER_RADIUS = 0.45;

/** Normalise a stick/keys vector to length <= 1. */
export function clampInput(mx, mz) {
  const l = Math.hypot(mx, mz);
  return l > 1 ? [mx / l, mz / l] : [mx || 0, mz || 0];
}

/** Push a circle at (x,z) radius r out of every blocker and back inside the bounds. Returns [x, z]. */
export function resolve(area, x, z, r) {
  for (let pass = 0; pass < 2; pass++) {
    for (const b of area.blockers) {
      const dx = x - b.x, dz = z - b.z, min = b.r + r, d2 = dx * dx + dz * dz;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2) || 1e-6;
      x = b.x + (dx / d) * min; z = b.z + (dz / d) * min;
    }
  }
  const B = area.bounds;
  x = Math.max(B.x0 + r, Math.min(B.x1 - r, x));
  z = Math.max(B.z0 + r, Math.min(B.z1 - r, z));
  return [x, z];
}

/** One step of walking. `a` = { x, z, yaw, r }, input already in WORLD space (+x east, -z north). Mutates `a`. */
/** Ground that slows you (mud, shallow flood water): a 2 m grid built once per area, read by everyone who walks. */
export const SLOW_GROUND = { mud: 0.7, bog: 0.6, shallows: 0.65 };
const SLOW_CELL = 2;
export function slowAt(area, x, z) {
  if (!area?.zone?.surfaces) return 1;
  let g = area._slow;
  if (!g) {
    const B = area.bounds, nx = Math.ceil((B.x1 - B.x0) / SLOW_CELL), nz = Math.ceil((B.z1 - B.z0) / SLOW_CELL), cells = new Float64Array(nx * nz).fill(1);
    const shapes = area.zone.surfaces.map((sh, i) => [sh, i]), base = 1;   // a zone's base ground never slows (many dungeon floors are 'mud'); only painted patches do
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const cx = B.x0 + (i + 0.5) * SLOW_CELL, cz = B.z0 + (j + 0.5) * SLOW_CELL; let k = base;
      for (const [sh] of shapes) if (inShape(sh, cx, cz)) k = SLOW_GROUND[sh.s] || 1;
      cells[j * nx + i] = k;
    }
    g = area._slow = { nx, nz, cells };
    Object.defineProperty(area, '_slow', { enumerable: false, value: g, writable: true });
  }
  const B = area.bounds, i = Math.floor((x - B.x0) / SLOW_CELL), j = Math.floor((z - B.z0) / SLOW_CELL);
  return i < 0 || j < 0 || i >= g.nx || j >= g.nz ? 1 : g.cells[j * g.nx + i];
}
export function walk(area, a, mx, mz, dt, speed = WALK_SPEED) {
  [mx, mz] = clampInput(mx, mz);
  const moving = mx * mx + mz * mz > 0.0025;
  if (moving) {
    speed *= slowAt(area, a.x, a.z);
    [a.x, a.z] = resolve(area, a.x + mx * speed * dt, a.z + mz * speed * dt, a.r ?? PLAYER_RADIUS);
    a.yaw = Math.atan2(mx, mz);
  }
  a.moving = moving;
  return a;
}
