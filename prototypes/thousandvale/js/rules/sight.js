// Thousandvale — LINE OF SIGHT through a dungeon's walls (owner feedback 10, Y10; report #34: "Enemies can attack
// through walls in dungeons"). Pure.
//
// A dungeon's walls already stop every walker: the room hands the rules `walkable(x, z)` (js/sim/dungeon.js — the
// plan's tiles, a closed gate included) and js/rules/index.js puts it on the terrain as `blocked`. Nothing asked that
// same data whether a BLOW could get there: a monster within reach of you on the far side of a wall swung, an archer
// shot, a red zone landed, and your own cone and bolt went through just the same.
//
// `sightFor(field)` answers `(ax, az, bx, bz) -> true | false` for a terrain that has walls (`terrain.walls`, set only
// in an instance: out in the open a tree or a rock is cover for nobody), or null when there is nothing to ask — every
// caller treats null as "always in sight", so the open world and Farhold's parity fixtures run exactly as before.
//
// The test walks the segment in `step`-metre samples of the wall function (a tile is 2 m; a sample every 0.5 m cannot
// step over one). The first and last `skip` metres are not sampled: both ends are bodies standing on floor, and a body
// hugging a wall must still be hittable by what stands next to it. Answers are cached per pair of half-metre cells for
// `ttl` seconds (a gate may open), a few thousand at most — a pack of monsters asking about one standing player asks
// the same question every tick.

export const SIGHT_DEFAULTS = Object.freeze({ step: 0.5, skip: 0.6, ttl: 2 });
const Q = 2;                    // cache cells per metre (0.5 m)
const MAX_CACHE = 6000;

/** The raw test, uncached: is the segment free of wall samples? */
export function clearSight(wall, ax, az, bx, bz, { step = 0.5, skip = 0.6 } = {}) {
  const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
  if (len <= skip * 2) return true;
  const ux = dx / len, uz = dz / len;
  for (let d = skip; d <= len - skip + 1e-9; d += step) if (wall(ax + ux * d, az + uz * d)) return false;
  return true;
}

/** How far along a ray it is clear, in metres (never more than `range`): where a bolt, an arrow or a beam stops. */
export function clearReach(wall, x, z, dx, dz, range, { step = 0.5, skip = 0.6 } = {}) {
  for (let d = skip; d <= range + 1e-9; d += step) if (wall(x + dx * d, z + dz * d)) return Math.max(0, d - step * 0.5);
  return range;
}

/**
 * The room's sight test, or null when its terrain has no walls. `cfg` = engine.combatCfg.sight. The function carries
 * `.reach(x, z, dx, dz, range)`, `.stats` (asked / cached) and `.clear()`.
 */
export function sightFor(field, cfg = null) {
  const wall = field?.terrain?.walls;
  if (typeof wall !== 'function') return null;
  const o = { ...SIGHT_DEFAULTS, ...(cfg || {}) };
  const cache = new Map();
  const stats = { asked: 0, cached: 0 };
  const key = (ax, az, bx, bz) => `${Math.round(ax * Q)},${Math.round(az * Q)},${Math.round(bx * Q)},${Math.round(bz * Q)}`;
  const sight = (ax, az, bx, bz) => {
    stats.asked++;
    const now = field.clock;
    const k = key(ax, az, bx, bz);
    const hit = cache.get(k);
    if (hit && now - hit.at <= o.ttl) { stats.cached++; return hit.ok; }
    const ok = clearSight(wall, ax, az, bx, bz, o);
    if (cache.size >= MAX_CACHE) cache.clear();
    cache.set(k, { ok, at: now });
    return ok;
  };
  sight.reach = (x, z, dx, dz, range) => clearReach(wall, x, z, dx, dz, range, o);
  sight.stats = stats;
  sight.clear = () => cache.clear();
  return sight;
}
