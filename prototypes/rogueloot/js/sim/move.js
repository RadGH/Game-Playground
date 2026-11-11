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
export function walk(area, a, mx, mz, dt, speed = WALK_SPEED) {
  [mx, mz] = clampInput(mx, mz);
  const moving = mx * mx + mz * mz > 0.0025;
  if (moving) {
    [a.x, a.z] = resolve(area, a.x + mx * speed * dt, a.z + mz * speed * dt, a.r ?? PLAYER_RADIUS);
    a.yaw = Math.atan2(mx, mz);
  }
  a.moving = moving;
  return a;
}
