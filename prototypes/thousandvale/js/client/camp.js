// The waystone camp at the zone's spawn point — client-side dressing for M0, in the placement shape
// stream B's bake will emit ({ kind, id, x, z, yaw, data }). Replaced by baked placements in M1.
// Nothing here collides or affects play; it only gives the respawn point a place to be.

const CAMP = [
  { kind: 'prop', id: 'rune_stone', x: 0, z: -9, yaw: 0, data: { label: 'Waystone', glow: '#7fd7ff' } },
  { kind: 'prop', id: 'campfire', x: 7, z: 5, yaw: 0, data: { fire: true } },
  { kind: 'prop', id: 'wood_pile', x: 10.5, z: 7.2, yaw: 0.6 },
  { kind: 'prop', id: 'well', x: -12, z: 2, yaw: 0.3 },
  { kind: 'prop', id: 'crate', x: -14, z: -9, yaw: 0.2 }, { kind: 'prop', id: 'crate', x: -15.2, z: -7.6, yaw: 1.1 },
  { kind: 'prop', id: 'barrel', x: -12.8, z: -10.6, yaw: 0 }, { kind: 'prop', id: 'barrel', x: -11.6, z: -9.5, yaw: 0 },
  { kind: 'prop', id: 'hay_bale', x: 14, z: -8, yaw: 0.4 }, { kind: 'prop', id: 'hay_bale', x: 15.6, z: -6.9, yaw: 1.4 },
  { kind: 'prop', id: 'banner_pole', x: -5, z: -10, yaw: 0 }, { kind: 'prop', id: 'banner_pole', x: 5, z: -10, yaw: 0 },
  { kind: 'prop', id: 'signpost', x: -4, z: 16, yaw: 3.0 },
  { kind: 'prop', id: 'torch_post', x: -3, z: 12, yaw: 0, data: { fire: true } },
  { kind: 'prop', id: 'torch_post', x: 4, z: 12, yaw: 0, data: { fire: true } },
  { kind: 'prop', id: 'torch_post', x: 18, z: -2, yaw: 0, data: { fire: true } },
  { kind: 'prop', id: 'torch_post', x: -18, z: -2, yaw: 0, data: { fire: true } },
  // A palisade with three gaps (angles: x = cos a * r, z = sin a * r).
  { kind: 'ring', id: 'palisade_stake', x: 0, z: 0, data: { r: 22, from: 2.0, to: 3.35, step: 0.04 } },
  { kind: 'ring', id: 'palisade_stake', x: 0, z: 0, data: { r: 22, from: 3.85, to: 5.25, step: 0.04 } },
  { kind: 'ring', id: 'palisade_stake', x: 0, z: 0, data: { r: 22, from: 5.75, to: 7.73, step: 0.04 } },
];

/** The camp placed at `spawn`, skipping any piece that would stand in water or on a cliff. */
export function campPlacements(spawn, terrain) {
  const out = [];
  for (const p of CAMP) {
    const q = { ...p, x: spawn.x + p.x, z: spawn.z + p.z };
    if (p.kind === 'prop' && terrain && (terrain.waterAt(q.x, q.z).depth > 0 || terrain.slopeDeg(q.x, q.z) > 30)) continue;
    out.push(q);
  }
  return out;
}
export const CAMP_RADIUS = 26;
