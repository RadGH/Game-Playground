// Thousandvale — TELEGRAPHS: the shapes on the ground that say "move".
//
// A telegraph is placed, shown for its wind-up, and RESOLVES at the end of the wind-up against
// whoever is inside at that moment — never at placement, so stepping out is a dodge. Server
// authoritative: the client only draws what `tele` events describe.
//
// Pure geometry here; js/rules/encounter.js owns the lifecycle (placing, timing, resolving).
//
// Shapes (all on the ground plane, `x, z` = anchor, `yaw` = facing, radians, 0 = +z):
//   circle  r                     everything within r
//   ring    r, r2                 between r2 (inner) and r (outer) — the classic "get in close"
//   donut   r, r2                 the same band; kept as its own name for authors
//   cone    r, arc                a wedge of `arc` radians centred on yaw
//   line    len, w                a rectangle from the anchor out along yaw (a beam, a charge)
//   cross   r, w                  two lines through the anchor, along yaw and across it, r each way
//
// A body counts as inside if ANY of it is inside (`br`, its radius), which is what players expect
// from a red circle: touching the edge is being hit.

export const SHAPES = ['circle', 'ring', 'donut', 'cone', 'line', 'cross'];
export const BODY_RADIUS = 0.45;

const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

/** Is the point (px, pz) — a body of radius br — inside telegraph `t`? */
export function inside(t, px, pz, br = BODY_RADIUS) {
  const dx = px - t.x, dz = pz - t.z;
  const d = Math.hypot(dx, dz);
  switch (t.shape) {
    case 'circle': return d <= t.r + br;
    case 'ring':
    case 'donut': return d - br <= t.r && d + br >= (t.r2 || 0);
    case 'cone': {
      if (d > t.r + br) return false;
      if (d <= br) return true;
      const off = Math.abs(wrap(Math.atan2(dx, dz) - t.yaw));
      // the edge of the wedge widened by the body's own angular size at that distance
      return off <= t.arc / 2 + Math.asin(Math.min(1, br / d));
    }
    case 'line': {
      const fx = Math.sin(t.yaw), fz = Math.cos(t.yaw);
      const along = dx * fx + dz * fz, across = Math.abs(dx * fz - dz * fx);
      return along >= -br && along <= t.len + br && across <= t.w / 2 + br;
    }
    case 'cross': {
      const fx = Math.sin(t.yaw), fz = Math.cos(t.yaw);
      const a = dx * fx + dz * fz, b = dx * fz - dz * fx;
      const arm = (u, v) => Math.abs(u) <= t.r + br && Math.abs(v) <= t.w / 2 + br;
      return arm(a, b) || arm(b, a);
    }
    default: return false;
  }
}

/** Does the segment (ax,az)-(bx,bz) pass within `r` of (cx,cz)? (line-of-sight blockers) */
export function segmentNear(ax, az, bx, bz, cx, cz, r) {
  const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((cx - ax) * dx + (cz - az) * dz) / len2));
  return Math.hypot(ax + dx * t - cx, az + dz * t - cz) <= r;
}

/** A rough area (m²) for the perf budget and the tests. */
export function area(t) {
  switch (t.shape) {
    case 'circle': return Math.PI * t.r * t.r;
    case 'ring': case 'donut': return Math.PI * (t.r * t.r - (t.r2 || 0) ** 2);
    case 'cone': return 0.5 * t.arc * t.r * t.r;
    case 'line': return t.len * t.w;
    case 'cross': return 4 * t.r * t.w - t.w * t.w;
    default: return 0;
  }
}

/** The compact description a `tele` event carries (numbers rounded to cm / mrad). */
export function wireShape(t) {
  const c = v => Math.round(v * 100) / 100;
  const out = { shape: t.shape, x: c(t.x), z: c(t.z) };
  if (t.yaw) out.yaw = Math.round(t.yaw * 1000) / 1000;
  if (t.r != null) out.r = c(t.r);
  if (t.r2) out.r2 = c(t.r2);
  if (t.arc != null) out.arc = Math.round(t.arc * 1000) / 1000;
  if (t.len != null) out.len = c(t.len);
  if (t.w != null) out.w = c(t.w);
  return out;
}
