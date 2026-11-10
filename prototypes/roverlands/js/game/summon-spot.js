// Where the phone's Garage puts a summoned vehicle (Expansion 1 M4, docs/EXPANSION-1.md "Phone"): the nearest flat, dry,
// clear spot within 25 m of you, a road if there is one. PURE (no DOM / three / Rapier): the page runs it with the world
// and the bodies near you, then sends `{ t:'summon', vehicle, p, yaw }`; the room checks the 25 m again.
//
//   findSummonSpot({ world, from: [x, z], lift, blockers: [{ x, z, r }], halfLen, yaw, range })
//     -> { p: [x, y, z], yaw, road } | null
//   world = { heightAt(x, z), slopeAt?(x, z), waterAt?(x, z) (null when dry), roadDistAt?(x, z) (metres from a road's middle) }
//   lift  = how far above the ground the body's middle rests (session.restLift(def))
//   blockers = things a vehicle must not be put into: world objects near you (blockersNear), other vehicles, you
//   halfLen = half the vehicle's length (it is kept that far clear of every blocker)
//   yaw  = the way the camera faces: the vehicle is put down facing that way (or along the road when on one)
//
//   blockersNear(objects, [x, z], range) -> [{ x, z, r }] from world.objects (box shapes as their corner circle)

export const SUMMON_RANGE = 25;          // js/net/places.js says the same (the room's check)
const MIN_R = 4.5;                       // not on top of you
const MAX_SLOPE = 0.12;                  // 1 - normal.y: ~28 degrees would be 0.12 — a car rests on that without rolling far
const ROAD_HALF = 3.5;                   // within this of a road's middle counts as "on the road"

export function blockersNear(objects, at, range = 60) {
  const out = [];
  for (const o of Array.isArray(objects) ? objects : []) {
    if (!o || !Number.isFinite(o.x) || !Number.isFinite(o.z) || o.decor) continue;
    if (Math.abs(o.x - at[0]) > range || Math.abs(o.z - at[1]) > range) continue;
    const s = o.s || 1, sh = o.shape || {};
    const r = sh.t === 'box' ? Math.hypot(sh.hx || 0.5, sh.hz || 0.5) * s : (sh.r || 0.5) * s;
    out.push({ x: o.x, z: o.z, r });
  }
  return out;
}

/** A spot's score (lower is better) or Infinity when the spot cannot be used. */
function scoreAt(world, x, z, from, blockers, clear) {
  const h = world.heightAt(x, z);
  if (!Number.isFinite(h)) return Infinity;
  if (world.waterAt && world.waterAt(x, z) != null) return Infinity;
  // flat under the whole vehicle, not just the middle
  const slope = world.slopeAt ? Math.max(world.slopeAt(x, z), world.slopeAt(x + clear * 0.7, z), world.slopeAt(x - clear * 0.7, z), world.slopeAt(x, z + clear * 0.7), world.slopeAt(x, z - clear * 0.7)) : 0;
  if (slope > MAX_SLOPE) return Infinity;
  for (const b of blockers) if (Math.hypot(b.x - x, b.z - z) < b.r + clear) return Infinity;
  const d = Math.hypot(x - from[0], z - from[1]);
  const rd = world.roadDistAt ? world.roadDistAt(x, z) : Infinity;
  const road = Number.isFinite(rd) && rd <= ROAD_HALF;
  return d + slope * 40 + (road ? 0 : 14);       // a road spot up to 14 m further away still wins
}

export function findSummonSpot({ world, from, lift = 0.8, blockers = [], halfLen = 2.6, yaw = 0, range = SUMMON_RANGE } = {}) {
  if (!world?.heightAt || !from) return null;
  let best = null, bs = Infinity;
  const clear = halfLen + 0.6;
  for (let r = MIN_R; r <= range - 0.5; r += 1.5) {
    const n = Math.max(8, Math.round(2 * Math.PI * r / 2));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r * 0.37;
      const x = from[0] + Math.cos(a) * r, z = from[1] + Math.sin(a) * r;
      const s = scoreAt(world, x, z, from, blockers, clear);
      if (s < bs) { bs = s; best = [x, z]; }
    }
  }
  if (!best) return null;
  const [x, z] = best;
  const rd = world.roadDistAt ? world.roadDistAt(x, z) : Infinity, road = Number.isFinite(rd) && rd <= ROAD_HALF;
  let face = yaw;
  if (road && world.roadDistAt) {
    // along the road: the road's middle runs across the direction its distance grows fastest
    const e = 1, gx = world.roadDistAt(x + e, z) - world.roadDistAt(x - e, z), gz = world.roadDistAt(x, z + e) - world.roadDistAt(x, z - e);
    if (Math.hypot(gx, gz) > 1e-3) {
      const along = Math.atan2(-gz, gx);        // perpendicular to the gradient, as a yaw (yaw 0 faces +z)
      const cand = [along, along + Math.PI];    // pick the one closer to where the camera faces
      face = cand.reduce((p, c) => (Math.abs(Math.atan2(Math.sin(c - yaw), Math.cos(c - yaw))) < Math.abs(Math.atan2(Math.sin(p - yaw), Math.cos(p - yaw))) ? c : p));
    }
  }
  const r2 = v => Math.round(v * 100) / 100;
  return { p: [r2(x), r2(world.heightAt(x, z) + lift), r2(z)], yaw: r2(Math.atan2(Math.sin(face), Math.cos(face))), road };
}
