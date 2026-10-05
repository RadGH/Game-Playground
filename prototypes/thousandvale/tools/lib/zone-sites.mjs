// Thousandvale — site placement for a baked zone (stream B). Pure over a terrain reader
// (js/rules/terrain-read.js); shared by tools/bake-test-zone.mjs and tools/bake-zone.mjs.
//
// Every site is a plain record in `meta.sites`:
//   { type:'settlement', kind, name, x, z, radius }        radius = the town hub circle (stream A reads it)
//   { type:'dungeon', id, name, x, z, yaw }                 the dungeon door; yaw = the way the doorway FACES
//                                                           (protocol convention: yaw = atan2(dx, dz)), so a
//                                                           player standing at (x + sin(yaw)*4, z + cos(yaw)*4)
//                                                           looks straight into it
//   { type:'event', id, x, z, r }                           open dry ground for a zone event boss (stream E)
//   { type:'camp',  id, x, z, r }                           open ground for an elite's camp (stream E)
// Coordinates are zone metres (the reader's frame).

/** The town hub circle by settlement kind — the same table stream A falls back to (js/sim/realm.js). */
export const TOWN_RADIUS = { capital: 140, city: 140, town: 90, village: 65, hamlet: 40 };

const TAU = Math.PI * 2;

/** True when every sample of the disc (every `step` m) is walkable, dry and gentler than `maxSlope`°. */
export function discIsOpen(t, x, z, r, { step = 4, maxSlope = 18 } = {}) {
  for (let dz = -r; dz <= r; dz += step) for (let dx = -r; dx <= r; dx += step) {
    if (dx * dx + dz * dz > r * r) continue;
    const px = x + dx, pz = z + dz;
    if (!t.inBounds(px, pz) || !t.walkable(px, pz)) return false;
    if (t.waterAt(px, pz).kind !== 'none') return false;
    if (t.slopeAt(px, pz) > maxSlope) return false;
  }
  return true;
}

const farFrom = (avoid, x, z, extra = 0) => avoid.every(a => Math.hypot(a.x - x, a.z - z) >= (a.r || 0) + extra);

/**
 * The nearest open disc of radius r to `near`, searching rings outwards to `maxDist`.
 * avoid: [{x, z, r}] — keep (r + gap) away from each.
 */
export function placeOpenSite(t, near, r, { avoid = [], gap = 20, maxDist = 320, edge = 40, maxSlope = 18 } = {}) {
  for (let d = 0; d <= maxDist; d += 8) {
    const n = Math.max(1, Math.round(TAU * d / 12));
    let best = null, bestS = Infinity;
    for (let k = 0; k < n; k++) {
      const a = k / n * TAU, x = near.x + Math.cos(a) * d, z = near.z + Math.sin(a) * d;
      if (x < t.bounds.minX + r + edge || z < t.bounds.minZ + r + edge || x > t.bounds.maxX - r - edge || z > t.bounds.maxZ - r - edge) continue;
      if (!farFrom(avoid, x, z, r + gap)) continue;
      if (!discIsOpen(t, x, z, r, { maxSlope })) continue;
      const s = t.slopeAt(x, z);
      if (s < bestS) { bestS = s; best = { x: Math.round(x), z: Math.round(z) }; }
    }
    if (best) return best;
  }
  return null;
}

/**
 * The dungeon door: on a ring around the town, in front of rising ground (a barrow dug into a
 * hillside reads as a door; one in a flat field reads as a hatch), the doorway facing downhill and
 * roughly back toward the town, with flat dry ground in front for a party to stand on.
 */
export function placeDoor(t, town, { avoid = [], minDist = 150, maxDist = 280, name = 'Barrow entrance', id = 'door_1' } = {}) {
  let best = null, bestScore = -Infinity;
  for (let d = minDist; d <= maxDist; d += 10) {
    const n = Math.round(TAU * d / 14);
    for (let k = 0; k < n; k++) {
      const a = k / n * TAU, x = town.x + Math.cos(a) * d, z = town.z + Math.sin(a) * d;
      if (!t.inBounds(x, z) || x < t.bounds.minX + 80 || z < t.bounds.minZ + 80 || x > t.bounds.maxX - 80 || z > t.bounds.maxZ - 80) continue;
      if (!farFrom(avoid, x, z, 40)) continue;
      // downhill = minus the gradient; the doorway faces downhill, blended toward the town
      const g = 6, gx = (t.heightAt(x + g, z) - t.heightAt(x - g, z)) / (2 * g), gz = (t.heightAt(x, z + g) - t.heightAt(x, z - g)) / (2 * g);
      const toTown = Math.atan2(town.x - x, town.z - z);
      const downhill = Math.hypot(gx, gz) > 0.02 ? Math.atan2(-gx, -gz) : toTown;
      const yaw = blendAngle(downhill, toTown, 0.35);
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      // a flat dry apron in front (8 m out, 7 m round) and walkable at the door itself
      if (!t.walkable(x, z) || !discIsOpen(t, x + fx * 8, z + fz * 8, 7, { step: 3, maxSlope: 16 })) continue;
      // rising ground behind: how much higher it is 15 m back than at the door
      const rise = t.heightAt(x - fx * 15, z - fz * 15) - t.heightAt(x, z);
      const river = nearestWater(t, x, z, 60);
      const score = Math.min(rise, 8) * 2 - Math.abs(d - 190) * 0.03 - (river < 40 ? 20 : 0);
      if (score > bestScore) { bestScore = score; best = { type: 'dungeon', id, name, x: Math.round(x), z: Math.round(z), yaw: +yaw.toFixed(3) }; }
    }
  }
  return best;
}

function blendAngle(a, b, t) {
  let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU;
  return a + d * t;
}

/** Distance to the nearest water within `r` m (Infinity if none), sampled every 6 m. */
export function nearestWater(t, x, z, r) {
  let best = Infinity;
  for (let dz = -r; dz <= r; dz += 6) for (let dx = -r; dx <= r; dx += 6) {
    const d = Math.hypot(dx, dz); if (d > r || d >= best) continue;
    if (t.waterAt(x + dx, z + dz).kind !== 'none') best = d;
  }
  return best;
}

/**
 * Add the M1 sites to a zone's site list (mutates and returns `sites`):
 *  - `radius` on every settlement (TOWN_RADIUS by kind)
 *  - one dungeon door near the main settlement
 *  - event / camp sites asked for by name: [{ type, id, near:{x,z} | nearSite:'<site name>', r }]
 * avoid: extra discs to keep clear (vignettes etc.)
 */
export function addZoneSites(t, sites, { asks = [], avoid = [], doorName, town: hubTown = null } = {}) {
  for (const s of sites) if (s.type === 'settlement' && !Number.isFinite(s.radius)) s.radius = TOWN_RADIUS[s.kind] || 50;
  const rank = { capital: 0, city: 1, town: 2, village: 3, hamlet: 4 };
  const town = hubTown || sites.filter(s => s.type === 'settlement').sort((a, b) => (rank[a.kind] ?? 9) - (rank[b.kind] ?? 9))[0];
  const keep = [...avoid, ...sites.filter(s => s.type === 'settlement').map(s => ({ x: s.x, z: s.z, r: s.radius }))];
  if (!sites.some(s => s.type === 'dungeon' && s.id)) {
    // near the hub town; a zone with no town gets it by World Forge's own dungeon/lair mark, else near the middle;
    // widen the ring if it is crowded or rough
    const wf = sites.find(s => s.type === 'lair');
    const at = town || (wf ? { x: wf.x, z: wf.z, radius: 0 } : { x: 1024, z: 1024, radius: 0 });
    const door = placeDoor(t, at, { avoid: keep, name: doorName, minDist: town ? 150 : 0, maxDist: 280 })
      || placeDoor(t, at, { avoid: keep, name: doorName, minDist: town ? 120 : 0, maxDist: 700 });
    if (door) { sites.push(door); keep.push({ x: door.x, z: door.z, r: 30 }); }
  }
  for (const ask of asks) {
    if (sites.some(s => s.type === ask.type && s.id === ask.id)) continue;
    const near = ask.near || sites.find(s => (s.name || s.id) === ask.nearSite) || town;
    if (!near) continue;
    const p = placeOpenSite(t, near, ask.r, { avoid: keep })
      || placeOpenSite(t, near, ask.r, { avoid: keep, maxDist: 900, gap: 10 })
      || placeOpenSite(t, near, ask.r, { avoid: keep, maxDist: 900, gap: 10, maxSlope: 24 });
    if (p) { const site = { type: ask.type, id: ask.id, x: p.x, z: p.z, r: ask.r }; sites.push(site); keep.push(site); }
  }
  return sites;
}
