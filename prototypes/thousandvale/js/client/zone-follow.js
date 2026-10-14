// Ground zones that are CARRIED (owner feedback 10, Y25, report #52: "Blessed Earth with the Moving Light talent
// should FOLLOW the player, not be left behind").
//
// The rules have always moved such a zone with whoever it rides; since round 10 the event says so —
// `fx { kind:'place', obj, x, z, r, seconds, follow: <entity id> }` — and the drawing ignored the field, so the ring
// stayed where it was cast while the damage and the healing walked away with the caster. A zone's effects are built
// in world coordinates round the spot it was cast on; carrying one is shifting everything it drew by how far its
// owner has moved since. This file is that arithmetic, with no three.js in it, so a node test can ask it.

/** The entity a `place` / `pool` / `zone` event rides, or null. An id of 0 is a real id. */
export function carriedBy(ev) {
  const f = ev ? ev.follow : null;
  return f === null || f === undefined || f === false || (typeof f === 'object') ? null : f;
}

/** How long a zone is drawn, ms. A carried zone is drawn for its whole life (up to 12 s); one left on the ground keeps the old 6 s cap. */
export function zoneDrawMs(ev) {
  const ms = (Number.isFinite(ev?.seconds) && ev.seconds > 0 ? ev.seconds : 2) * 1000;
  return Math.min(carriedBy(ev) != null ? 12000 : 6000, ms);
}

/**
 * Where a carried zone's drawing must be shifted to: its owner's place now, less the spot it was drawn round.
 * `base` = { x, y, z } the cast spot (y = the ground there); `pos` = the owner now; `ground(x, z)` = the ground height.
 */
export function carryOffset(base, pos, ground = () => 0) {
  if (!base || !pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return { x: 0, y: 0, z: 0 };
  return { x: pos.x - base.x, y: ground(pos.x, pos.z) - base.y, z: pos.z - base.z };
}
