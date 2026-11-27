// Oathwild dungeons — how long the camera boom may be indoors (brainstorm 2026-11-27-regions §3). Pure.
//
//   cameraBoom(walk, target, yaw, pitch, want, { radius = 0.25, step = 0.2 }) → metres
//     target = the point the camera looks at ({ x, z, y? } — y defaults to the floor + 1.6 m, head height)
//     yaw    = the way the camera looks, as js/rules/combat.js facing (along (sin yaw, cos yaw)); the camera sits BEHIND
//     pitch  = radians above level (25° ≈ 0.436)
//     want   = the boom the player chose
//   A small sphere (radius) is swept from the target back along the boom; the boom ends at the last spot where the
//   sphere is still in open space: under the ceiling, above the floor (a pit has none), out of walls, columns and shut
//   gates. The client eases toward the result each frame (never pops); in spacious rooms it stays long.
//   boomPoint(target, yaw, pitch, len) → { x, y, z } where the camera sits for that boom

export function boomPoint(t, yaw, pitch, len) {
  const h = Math.cos(pitch) * len;
  return { x: t.x - Math.sin(yaw) * h, y: t.y + Math.sin(pitch) * len, z: t.z - Math.cos(yaw) * h };
}

export function cameraBoom(walk, target, yaw, pitch, want, { radius = 0.25, step = 0.2 } = {}) {
  const t = { x: target.x, z: target.z, y: target.y ?? walk.y(target.x, target.z) + 1.6 };
  const open = p => walk.air(p.x, p.y, p.z) && walk.air(p.x + radius, p.y, p.z) && walk.air(p.x - radius, p.y, p.z)
    && walk.air(p.x, p.y, p.z + radius) && walk.air(p.x, p.y, p.z - radius) && walk.air(p.x, p.y + radius, p.z);
  let ok = 0;
  for (let d = step; d <= want + 1e-9; d += step) {
    if (!open(boomPoint(t, yaw, pitch, d))) break;
    ok = d;
  }
  if (ok > want - step && open(boomPoint(t, yaw, pitch, want))) return want;
  return Math.round(ok * 100) / 100;
}
