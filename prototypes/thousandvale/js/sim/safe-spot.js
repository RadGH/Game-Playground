// Where a saved character may wake up (play-test 12, #81 — Torbor Downs regenerated).
//
// A character is saved with the spot it logged out on. A re-bake can change what stands there: the regenerated Torbor
// Downs raised hills, cut a coastline into what was land and moved camps and wayside things, so a saved spot can now be
// under the sea, on a cliff, or inside something solid. Before this the server only asked `walkable` for a WILDS spot (and
// sent anyone failing it to the province's first town — for Torbor Downs that is Torborhold, wherever they were); a TOWN
// spot was used as saved.
//
//   spotProblem(terrain, x, z)  -> null when (x, z) is good ground to stand on, else why not:
//                                  'out' | 'sea' | 'deep' | 'steep' | 'solid' (nav SOLID / BUILDING)
//   safeSpot(terrain, at, opts) -> { x, z, moved, why } — `at` itself when it is good; else the nearest good spot within
//                                  opts.maxR metres (rings 2 m apart, preferring dry ground), then dry ground out to
//                                  opts.farR (rings 8 m apart — someone saved out where the sea now is); null if none
//   nearestTown(towns, at)      -> index of the town circle nearest `at` (the fall-back when no good spot is near)
//
// Pure (no I/O): `terrain` is the province's stitched terrain (inBounds, moveAt or walkable + waterAt, and `nav.at` when
// stream B's nav is loaded). tests/W/safe-spot.test.js runs it on positions saved on the OLD Torbor Downs map.

const BLOCK = 32 | 128;           // terrain-read NAV.SOLID | NAV.BUILDING (kept literal: this file stays dependency-free)

/** Why (x, z) is no place to wake up, or null. */
export function spotProblem(terrain, x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return 'out';
  if (terrain.inBounds && !terrain.inBounds(x, z)) return 'out';
  // swimming depth first ('deep'), then a shallow sea shelf you could wade but should not wake in ('sea')
  const m = terrain.moveAt ? terrain.moveAt(x, z) : null;
  if (m === 'out') return 'out';
  if (m === 'swim') return 'deep';
  const w = terrain.waterAt ? terrain.waterAt(x, z) : null;
  if (w && typeof w === 'object' && w.kind === 'sea' && w.depth > 0.25) return 'sea';
  if (m === 'steep') return 'steep';
  if (!terrain.moveAt && terrain.walkable && !terrain.walkable(x, z)) return 'steep';
  const nav = terrain.nav;
  if (nav && typeof nav.at === 'function' && (nav.at(x, z) & BLOCK)) return 'solid';
  return null;
}

/** Wet-but-wadeable ground is good enough only when nothing dry is near. */
const isWet = (terrain, x, z) => { const w = terrain.waterAt ? terrain.waterAt(x, z) : null; return !!(w && typeof w === 'object' ? w.depth > 0.05 : w > 0.05); };

/**
 * The nearest good spot to `at`. Rings 2 m apart out to maxR (default 160 m), each ring walked at ~2 m steps from a fixed
 * bearing (the same input always gives the same answer). A spot must also have its 4 neighbours 1.5 m away good, so
 * nobody wakes up wedged against a wall or on a cliff lip.
 */
export function safeSpot(terrain, at, { maxR = 160, farR = 800, nudge = false } = {}) {
  if (!at) return null;
  // nudge (feedback #96, /reset): the spot may look fine on the map and still hold you (a prop, a bad seam) — always move
  // at least 3 m, to the nearest roomy dry spot
  const why = spotProblem(terrain, at.x, at.z) || (nudge ? 'stuck' : null);
  if (!why) return { x: at.x, z: at.z, moved: false, why: null };
  const roomy = (x, z) => !spotProblem(terrain, x, z) && [[1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5]].every(([dx, dz]) => !spotProblem(terrain, x + dx, z + dz));
  let wetPick = null;
  for (let r = nudge ? 4 : 2; r <= maxR; r += 2) {
    const n = Math.max(8, Math.ceil((2 * Math.PI * r) / 2));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, x = at.x + Math.cos(a) * r, z = at.z + Math.sin(a) * r;
      if (!roomy(x, z)) continue;
      if (!isWet(terrain, x, z)) return { x: +x.toFixed(2), z: +z.toFixed(2), moved: true, why, r };
      if (!wetPick) wetPick = { x: +x.toFixed(2), z: +z.toFixed(2), moved: true, why, r };
    }
    if (wetPick && r >= wetPick.r + 24) return wetPick;       // a wadeable spot, and nothing dry within 24 m more
  }
  if (wetPick) return wetPick;
  // Out at sea (the regenerated coast took the old square's edge): keep looking, coarser, out to farR, so a swimmer wakes
  // on the nearest shore rather than in a town across the island. Dry ground only.
  for (let r = maxR + 8; r <= farR; r += 8) {
    const n = Math.max(16, Math.ceil((2 * Math.PI * r) / 6));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, x = at.x + Math.cos(a) * r, z = at.z + Math.sin(a) * r;
      if (roomy(x, z) && !isWet(terrain, x, z)) return { x: +x.toFixed(2), z: +z.toFixed(2), moved: true, why, r };
    }
  }
  return null;
}

/** Index of the town whose circle is nearest `at` (towns: [{x, z, r}]), or 0. */
export function nearestTown(towns, at) {
  let best = 0, bd = Infinity;
  (towns || []).forEach((t, i) => { const d = Math.hypot(t.x - at.x, t.z - at.z) - (t.r || 0); if (d < bd) { bd = d; best = i; } });
  return best;
}
