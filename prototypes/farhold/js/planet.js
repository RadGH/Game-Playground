// Farhold — the ground under your feet.
//
// This module turns a Star Forge planet into something you can walk on. It is deliberately
// PURE JavaScript: no Three.js, no DOM. The renderer (terrain.js) and the node tests both ask it
// the same question — "how high is the ground at these metres?" — and get the same answer.
//
//   import { createWorld, makeTerrain, M_PER_CELL } from './planet.js';
//   const { star, system, planet, world } = createWorld({ seed: 7 });
//   const terrain = makeTerrain(world, planet);
//   terrain.heightAt(12_400, 8_900);   // metres above sea level, at metres east / metres south
//
// Scale: one world-map cell is 640 m on a side (the same 64 x 10 m tile World Forge zooms into),
// so a 256 x 128 map is a planet surface 164 km x 82 km.
//
// RIVERS AND ROADS are cut into the ground here, not painted on top of it by the renderer. They are
// carved from the actual PATH — a smoothed polyline through the map's river and road cells — and not
// from the cell grid, because a map cell is 640 m and a river is about 30 m. Carving by cell gave a
// gorge wide enough to swallow a town, which is exactly what it did: World Forge founds towns on
// rivers (45 of 93 on one test world), so a town in a 640 m trench is the common case, not the odd
// one. Carving by path gives a channel the width of the water, with banks either side.

import { makeStar } from '../../../universe/js/stars.js';
import { generateSystem } from '../../../universe/js/system.js';
import { generatePlanetMap, reliefFor, surfaceOf } from '../../../universe/js/planetmap.js';
import { ARCH_BY_KEY } from '../../../universe/js/system.js';
import { PLANET_BANDS, bandForPlanet } from './rpg.js';
import { elevationToMetres, elevationToMetresExact } from '../../../worldgen/js/relief.js';
import { BIOMES, isWater } from '../../../worldgen/js/biomes.js';
import { makeNoise2D, fbm, ridged, subSeed, clamp, lerp, makeRng, smoothstep, blur } from '../../../worldgen/js/noise.js';

/** Metres across one world-map cell. The one number that sets the size of the planet. */
/**
 * How many metres one world-map cell is across — the single number that decides how big a planet
 * feels underfoot. 640 m is World Forge's own tile, and it gives a 163 km x 82 km surface, which is
 * a lot of ground to walk when you have no vehicle. It is a **live binding** so the title screen can
 * shrink it: every module imports it rather than copying it, so `setMetresPerCell` moves all of them.
 * Call it BEFORE `createWorld`/`makeTerrain`, because they close over the derived width and depth.
 */
export let M_PER_CELL = 640;
export const M_PER_CELL_DEFAULT = 640;
export function setMetresPerCell(metres) {
  // the floor was 40 m, which stopped at a 10 x 5 km world. "Super tiny" wants 64 m (16 x 8 km) and
  // there is no reason a test or a future knob should not go smaller, so it is 16 m now.
  M_PER_CELL = Math.max(16, Math.min(2000, Math.round(metres)));
  return M_PER_CELL;
}

const IDX = (w, x, y) => y * w + x;

/** Hex colour -> [r, g, b] in 0..1, worked out once per biome and kept. */
function rgbOf(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
const BIOME_RGB = BIOMES.map(b => rgbOf(b.color));
const ROCK_RGB = rgbOf('#7d7568');
const SNOW_RGB = rgbOf('#e9eef2');
const SAND_RGB = rgbOf('#d8c795');

/**
 * A star, its system, and the planet you are going to land on.
 * `seed` picks everything; the same seed always gives the same sky and the same ground.
 */
/**
 * A FULLER SYSTEM, with somewhere to go at every level.
 *
 * "Let's also make it so there are more stars per system, and so that every system has at least one
 * tier of each planet."
 *
 * Two changes on top of Star Forge's own generator, and neither touches the shared library:
 *
 *   * `planets: 0.85` pushes every star toward the top of its own planet range, so a system is
 *     four to eight worlds rather than two or three;
 *   * every planet's difficulty band is then read, and any band with nothing in it is handed the
 *     nearest unclaimed world — so a system always has a low, a medium and a high world to fly to,
 *     however its rolls came out.
 *
 * Forcing a band does not change what a world IS; it changes which level range its regions are laid
 * over, which is the thing a player actually meets.
 */
export function createSystem({ seed = 1, starClass = null, fillBands = true, tries = 10 } = {}) {
  const star = makeStar({ seed: seed >>> 0, classKey: starClass, id: 0 });
  /**
   * Keep the star, re-roll its worlds until there are enough of them.
   *
   * A band needs a world of its own, so a system with two rocks in it cannot have somewhere to go at
   * every level however the bands are handed out. The star is fixed — same name, same class, same
   * light — and only the planet roll is nudged, so a seed still means one particular star; we stop at
   * the first roll with a body for every band and keep the fullest roll if none of them manage it
   * (a black hole with three planets in reach is allowed to be a thin system).
   */
  let system = null, best = null;
  for (let i = 0; i < Math.max(1, tries); i++) {
    // `planets: 0.85` is Star Forge's own top-of-range nudge and is left alone — re-rolling only
    // when a system is genuinely short keeps every seed that was already full exactly as it was
    const built = generateSystem(star, {
      seed: subSeed(seed, i ? 'system' + i : 'system'), rareWorlds: 0.55, planets: 0.85,
    });
    const n = landableBodies(built).length;
    if (!best || n > best.n) best = { system: built, n };
    if (n >= PLANET_BANDS.length) { system = built; break; }
  }
  system = system || best.system;
  if (fillBands) balanceBands(system);
  return { star, system };
}

/**
 * Every body in this system you could actually put boots on — planets AND their moons.
 *
 * Moons are small planets here (own id, own seed, own surface map, `landable: true`), and the game
 * already lets you land on one, so they count toward "a world for every band". Without them a red
 * dwarf with one rock and a gas giant looked like a dead end.
 */
export function landableBodies(system) {
  const out = [];
  for (const p of system?.planets || []) {
    if (!p.giant && p.landable !== false) out.push(p);
    for (const m of p.moons || []) if (m.landable !== false) out.push(m);
  }
  return out;
}

/**
 * Make sure every difficulty band has a world in this system.
 *
 * Runs over the landable planets, notes which bands are already represented, and forces the rest
 * onto whichever worlds are furthest from the star — the outer dark is where the hard ones belong,
 * and it keeps the inner system as the place you start.
 */
export function balanceBands(system, { protect = null } = {}) {
  const bodies = landableBodies(system);
  if (!bodies.length) return system;

  /**
   * THE WORLD A NEWCOMER LANDS ON IS ALWAYS A LEVEL-1 WORLD.
   *
   * This is the fix for "started at level 1 and was dropped into a level 30-33 zone". The low band
   * is claimed FIRST, by whichever world `chooseLanding` would hand a new character — the same
   * picker the new game and a load both use, so all three agree — and the rest of the bands are
   * handed out around it. `protect` is passed when the caller has already picked the landing site.
   */
  const start = protect
    || chooseLanding(system, { requireHabitable: true })
    || chooseLanding(system)
    || bodies[0];
  if (start) start.forcedBand = 'low';

  const have = new Set(bodies.map(b => bandForPlanet(b).key));
  const missing = PLANET_BANDS.filter(b => !have.has(b.key) && b.key !== 'low');
  if (!missing.length) return system;
  // hardest band onto the furthest world — the outer dark is where the hard ones belong, and it
  // keeps the inner system as the place you start
  const byDistance = bodies
    .filter(b => b !== start && !b.forcedBand)
    .sort((a, b) => (b.orbit?.au ?? 0) - (a.orbit?.au ?? 0) || (b.difficulty ?? 0) - (a.difficulty ?? 0));
  for (const band of [...missing].reverse()) {
    const pick = byDistance.find(p => !p.forcedBand);
    if (!pick) break;
    pick.forcedBand = band.key;
  }
  return system;
}

/** Which bands this system can actually send you to. `[]` means something is wrong. */
export function bandsInSystem(system) {
  return [...new Set(landableBodies(system).map(b => bandForPlanet(b).key))];
}

/**
 * Which planet to land on: a landable body, preferring one you can breathe on, then one in the
 * star's water zone, then anything solid.
 */
/**
 * Is this a world worth starting a character on?
 *
 * Two things, and both matter. `surfaceOf().inhabited` is the same predicate worldgen uses to
 * decide whether to found any settlements at all, so without it you can land somewhere with no
 * towns, no people, no work and no trade. And `biomeMode: 'single'` worlds are locked to one biome
 * family all the way round — a lava world is lava everywhere — which makes the first hour one
 * colour and gives the zone bands nothing to distinguish themselves with.
 */
export function isHabitableStart(planet) {
  if (!planet || planet.giant || planet.landable === false) return false;
  if (!surfaceOf(planet).inhabited) return false;
  if (ARCH_BY_KEY[planet.archetype]?.biomeMode === 'single') return false;
  return true;
}

export function chooseLanding(system, { prefer = null, requireHabitable = false, avoidHabitable = false } = {}) {
  const solid = system.planets.filter(p => !p.giant && p.landable !== false);
  if (prefer != null) {
    const hit = solid.find(p => p.id === prefer || p.name === prefer);
    if (hit) return hit;
  }
  /**
   * "Habitable start" OFF now means something again.
   *
   * Round 10 made the starting system always hold a settled world, and the default scoring below
   * prefers exactly that kind of world — so unticking the box stopped changing anything at all. With
   * `avoidHabitable` the game deliberately puts you down on the harshest rock in the system instead:
   * no towns, no trade, and a two-minute flight to the blue world you can see from the ground. That
   * is a real choice rather than a checkbox that does nothing.
   */
  if (avoidHabitable) {
    const harsh = solid.filter(p => !isHabitableStart(p));
    if (harsh.length) {
      return harsh.sort((a, b) =>
        ((b.atmosphere?.breathable ? 1 : 0) - (a.atmosphere?.breathable ? 1 : 0))
        || (a.difficulty - b.difficulty))[0];
    }
  }
  // "Habitable start": only a settled, multi-biome world will do, and if this system has none the
  // caller is told so rather than being handed the least-bad rock.
  if (requireHabitable) {
    const good = solid.filter(isHabitableStart);
    if (!good.length) return null;
    return good.sort((a, b) =>
      ((b.atmosphere?.breathable ? 1 : 0) - (a.atmosphere?.breathable ? 1 : 0))
      || ((b.orbit?.inZone ? 1 : 0) - (a.orbit?.inZone ? 1 : 0))
      || (a.difficulty - b.difficulty))[0];
  }
  // `surfaceOf().inhabited` is the SAME predicate worldgen uses to decide whether to found any
  // settlements at all, and it is pure archetype + atmosphere, so it costs nothing to ask. Without
  // it the game happily landed you on a void-touched rock where nobody lives: no towns, no people,
  // no work, no trade, and two survey objectives that could never be finished. The balance harness
  // found 29% of systems starting that way.
  const score = p => (surfaceOf(p).inhabited ? 6 : 0)
    + (p.atmosphere?.breathable ? 4 : 0)
    + (p.orbit?.inZone ? 2 : 0)
    + (p.archetype === 'living' ? 3 : 0)
    - p.difficulty;
  return solid.sort((a, b) => score(b) - score(a))[0] || system.planets[0];
}

/**
 * Everything a run needs: the star, the system around it, the planet, and its surface map.
 *
 * With `habitable: true` (the title screen's default) the seed is treated as a STARTING POINT
 * rather than a fixed answer: about a quarter of systems have no settled, multi-biome world in
 * them at all, and landing on a locked-biome rock with nobody on it is a poor first hour. Nearby
 * seeds are tried in order until one does, and the seed that was actually used comes back as
 * `systemSeed` so the run is still reproducible and the player can be told.
 */
export function createWorld({
  seed = 1, starClass = null, prefer = null, width = 256, height = 128,
  habitable = false, searchSeeds = 24, regionScale = 1,
  // The seed search is a START-OF-GAME thing. `createWorld({ seed: 9 })` from a tool or a test has to
  // mean seed 9 and nothing else, so the search only runs when a caller asks for it — `main.js` does,
  // always, which is what gives the starting system a world you can live on.
  liveable = habitable,
} = {}) {
  let usedSeed = seed;
  let star = null, system = null, planet = null;

  /**
   * THE STARTING SYSTEM ALWAYS HAS A WORLD YOU CAN LIVE ON.
   *
   * "There should also be at least one starting planet that is habitable, at least in the starting
   * system." So the seed search runs whether or not the title screen's *Habitable start* box is
   * ticked: the acceptance test is "this system contains a settled, multi-biome world", and only
   * WHERE YOU LAND depends on the box. Untick it and you can still start on a barren rock — but the
   * blue world is one short hop away in the same system, not a hundred seeds away.
   *
   * Bands are handed out AFTER the landing site is known (`fillBands: false` here, `balanceBands`
   * below), so the world you start on is the world that gets the level-1 band.
   */
  for (let i = 0; i <= (liveable || habitable ? searchSeeds : 0); i++) {
    usedSeed = seed + i;
    ({ star, system } = createSystem({ seed: usedSeed, starClass, fillBands: false }));
    const canLive = !liveable || landableBodies(system).some(isHabitableStart);
    planet = chooseLanding(system, {
      prefer,
      requireHabitable: habitable && !prefer,
      avoidHabitable: liveable && !habitable && !prefer,
    });
    if (planet && (canLive || prefer != null)) break;
    planet = null;
  }
  // nothing within reach: take the best of the seed the player actually asked for
  if (!planet) {
    usedSeed = seed;
    ({ star, system } = createSystem({ seed, starClass, fillBands: false }));
    planet = chooseLanding(system, { prefer });
  }
  balanceBands(system, { protect: planet });

  const world = generatePlanetMap(planet, { width, height, regionScale });
  return { star, system, planet, world, systemSeed: usedSeed, movedSeed: usedSeed !== seed };
}

// ---------------------------------------------------------------------------- paths

/** Catmull-Rom through the cell centres, so a chain of 640 m cells reads as a curve. */
export function smoothPath(points, perSegment = 4) {
  if (points.length < 2) return points.slice();
  const out = [];
  const at = i => points[clamp(i, 0, points.length - 1)];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    for (let s = 0; s < perSegment; s++) {
      const t = s / perSegment, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

/**
 * A bucketed index of path segments, so "how far am I from the nearest river?" is a handful of
 * distance checks instead of thousands. `heightAt` asks this for every vertex of every terrain
 * ring, so the early-out when no bucket holds anything is what keeps it cheap.
 */
function makePathIndex(paths, bucket = 220, padOverride = null) {
  const buckets = new Map();
  const key = (bx, bz) => bx * 73856093 ^ bz * 19349663;
  for (const path of paths) {
    const pts = path.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const seg = { path, i, x1: pts[i][0], z1: pts[i][1], x2: pts[i + 1][0], z2: pts[i + 1][1] };
      // drop the segment into every bucket its bounding box touches, plus a margin for the banks.
      // `padOverride` is for asking a wider question than "am I on it" — the road merge asks which
      // corridor is within sixty metres, and a pad of the road's own width would never find it.
      const pad = padOverride ?? (path.reach || 60);
      const bx0 = Math.floor((Math.min(seg.x1, seg.x2) - pad) / bucket);
      const bx1 = Math.floor((Math.max(seg.x1, seg.x2) + pad) / bucket);
      const bz0 = Math.floor((Math.min(seg.z1, seg.z2) - pad) / bucket);
      const bz1 = Math.floor((Math.max(seg.z1, seg.z2) + pad) / bucket);
      for (let bx = bx0; bx <= bx1; bx++) {
        for (let bz = bz0; bz <= bz1; bz++) {
          const k = key(bx, bz);
          let list = buckets.get(k);
          if (!list) buckets.set(k, list = []);
          list.push(seg);
        }
      }
    }
  }
  return {
    buckets, bucket, key,
    /** Nearest point on any path: { dist, path, i, t } or null when nothing is near. */
    nearest(x, z) {
      const bx = Math.floor(x / bucket), bz = Math.floor(z / bucket);
      const list = buckets.get(key(bx, bz));
      if (!list) return null;
      let best = null, bestD2 = Infinity;
      for (const seg of list) {
        const dx = seg.x2 - seg.x1, dz = seg.z2 - seg.z1;
        const len2 = dx * dx + dz * dz;
        let t = len2 > 0 ? ((x - seg.x1) * dx + (z - seg.z1) * dz) / len2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const px = seg.x1 + dx * t, pz = seg.z1 + dz * t;
        const d2 = (x - px) * (x - px) + (z - pz) * (z - pz);
        if (d2 < bestD2) { bestD2 = d2; best = { seg, t }; }
      }
      if (!best) return null;
      return { dist: Math.sqrt(bestD2), path: best.seg.path, i: best.seg.i, t: best.t };
    },
  };
}

/**
 * The terrain sampler. The world map's elevation is sampled smoothly between cells, converted to
 * metres with the planet's own relief scale, and given two octaves of detail — exactly what
 * `worldgen/js/local.js` does when it zooms into a cell. Rivers and roads are then cut in.
 */
export function makeTerrain(world, planet = null, opts = {}) {
  const w = world.width, h = world.height;
  const raw = world.relief || { landMetres: 4200, seaMetres: 4200, datum: 'sea', label: 'sea level' };
  /**
   * HOW TALL THE WORLD IS, against how wide it is.
   *
   * `universe/` hands back a planet's true relief — 8.5 km of land on the world this was diagnosed
   * on. That is a real number for a real planet, but this map is 90-160 km across, not 40,000, so
   * 8.5 km of rise packed into 160 km makes every ordinary coastline a vertical cliff: a 0.45 step
   * in the elevation field across one 640 m cell came out as a 6.8 km drop. That is what "extremely
   * sharp spikes… thousands of feet taller than its surroundings" actually was — not noise, but the
   * vertical scale never having been matched to the horizontal one.
   *
   * `reliefScale` divides it down to something a person can walk up, and it follows the planet-scale
   * knob: a map half as wide gets hills half as tall, so the slopes stay the same.
   */
  const reliefScale = (opts.reliefScale ?? 0.22) * (M_PER_CELL / M_PER_CELL_DEFAULT);
  const relief = {
    ...raw,
    landMetres: raw.landMetres * reliefScale,
    seaMetres: raw.seaMetres * reliefScale,
    scaledBy: reliefScale,
  };
  /**
   * The noise between map cells has to be scaled with the relief, or it takes over.
   *
   * Round 4b divided the relief down so the vertical scale matched the horizontal one — and left
   * these alone. A ±39 m wobble on top of an 8 km mountain is texture; the same wobble on top of a
   * 90 m headland is the whole shape of the coast, and it pushed shoreline land below sea level.
   * Seed 7 went from a beach you could walk along to open ocean, and props, rivers, roads and towns
   * all disappeared with it.
   */
  const detailFlat = (opts.detailFlat ?? 13) * reliefScale / 0.22;
  const detailRelief = (opts.detailRelief ?? 78) * reliefScale / 0.22;
  const detailFine = (opts.detailFine ?? 2.4) * reliefScale / 0.22;
  const n1 = makeNoise2D(subSeed(world.seed, 'farhold-coarse'));
  const n2 = makeNoise2D(subSeed(world.seed, 'farhold-fine'));
  const n3 = makeNoise2D(subSeed(world.seed, 'farhold-tint'));

  /**
   * DESPIKE THE ELEVATION.
   *
   * Reported in play: "on many planets there are extremely sharp spikes in the terrain, like a
   * single pixel that is thousands of feet taller than its surroundings." They are real: the world
   * map's elevation is generated per cell and a noise field will occasionally throw one cell far
   * above its neighbours. A cell is 640 m and the sampler is bilinear, so one bad value becomes a
   * kilometre-wide spire.
   *
   * This runs once, when the terrain is built, and pulls any cell that disagrees violently with the
   * MEDIAN of its neighbours back toward them. The median is the point: an average would be dragged
   * up by the spike it is meant to remove, and would also flatten real ridges, where most of the
   * neighbours genuinely are high. A ridge survives; a lone needle does not.
   */
  (function despike() {
    const src = world.elevation;
    if (!src || src.length !== w * h) return;
    const out = src.slice();
    const ring = new Float32Array(8);
    let fixed = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        let k = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            ring[k++] = src[(y + dy) * w + (((x + dx) % w) + w) % w];
          }
        }
        const sorted = Array.prototype.slice.call(ring).sort((a, b) => a - b);
        const median = (sorted[3] + sorted[4]) / 2;
        const spread = sorted[6] - sorted[1];                 // how varied the neighbourhood is
        const gap = src[i] - median;
        // a real ridge has a wide spread; a needle sticks out of flat ground
        const allowed = Math.max(0.045, spread * 1.35);
        if (Math.abs(gap) > allowed) {
          out[i] = median + Math.sign(gap) * allowed;
          fixed++;
        }
      }
    }
    if (fixed) world.elevation = out;
    world.despiked = fixed;
  })();

  const widthM = (w - 1) * M_PER_CELL;
  const depthM = (h - 1) * M_PER_CELL;
  const hasSea = (world.opts?.liquid ?? 'water') !== 'none' && relief.datum === 'sea';
  const seaLevel = 0;

  /**
   * Smooth sample of a world layer at fractional cell coordinates (bilinear).
   *
   * Longitude wraps, latitude clamps — see `clampToWorld`. Sampling past the eastern edge must give
   * the western cells, or the ground would end in a cliff at the seam even though you can walk
   * across it.
   */
  function layer(arr, fx, fy) {
    const x = ((fx % w) + w) % w, y = clamp(fy, 0, h - 1.001);
    const x0 = Math.floor(x), y0 = Math.floor(y), tx = x - x0, ty = y - y0;
    const x1 = (x0 + 1) % w, y1 = Math.min(h - 1, y0 + 1);          // x wraps, y clamps
    return lerp(lerp(arr[IDX(w, x0, y0)], arr[IDX(w, x1, y0)], tx), lerp(arr[IDX(w, x0, y1)], arr[IDX(w, x1, y1)], tx), ty);
  }
  const cellX = x => ((Math.round(x / M_PER_CELL) % w) + w) % w;    // longitude wraps
  const cellY = z => clamp(Math.round(z / M_PER_CELL), 0, h - 1);

  /**
   * R21 — CLIFFS, BECAUSE THE WHOLE WORLD WAS ROLLING HILLS.
   *
   * The play-test: *"in general for map generation, there are only rolling hills. There are almost
   * no cliffs."* Measured over 2 km of the reported world: slope p50 0.27, p99 0.78, max 1.53, and
   * **nothing at all steeper than 63°**. That is not a tuning accident, it is the shape of the
   * formula — `naturalHeightAt` was a bilinear ramp plus two symmetric `fbm` terms, and symmetric
   * fBm has no cliffs in it anywhere. Everything upstream that could have made one is smoothed
   * away before Farhold sees it: `thermalErode` explicitly slumps anything past its talus angle,
   * `hydraulicErode` carves the valleys back out, and `despike()` pulls outlying cells to the
   * neighbour median.
   *
   * `ridged` noise is the opposite: `1 - |n|` raised to a power leaves CREASES — a sharp line where
   * the field turns over, which is what a cliff edge is. Two things make it safe to add:
   *
   *   1. It is gated on `broken` (World Forge's own slope layer), so cliffs appear where the map
   *      already says the ground is broken and never in the middle of a meadow. A grassland stays
   *      a grassland; a headland gets a face.
   *   2. `smoothstep(0.30, 0.72, …)` gives the gate a soft edge, so a cliff band fades in over some
   *      hundreds of metres instead of starting mid-air.
   *
   * THE BUDGET IS REAL AND `tests/planet.test.js` OWNS IT. That test walks cell centres and fails
   * if `heightAt` drifts more than 130 m from the cell's own elevation. `coarse` and `fine` already
   * spend about 47 m of that at full tilt, so `cliffMetres` has roughly 83 m of headroom — and it
   * is spent in exactly the same places `coarse` spends its own, because both are gated on
   * `broken`. The default keeps the pair comfortably inside the bar while still being a drop you
   * cannot walk up — and `cliffBand` sharpens the face without adding any height to it.
   *
   * THE FACE HAS TO BE NARROW, NOT JUST TALL. A cliff is steepness, and steepness is height over
   * DISTANCE — piling amplitude onto a 500 m wavelength gives a bigger hill, not a cliff. So the
   * crease field is run through a narrow `smoothstep` band (`cliffBand`): inside the band the
   * ground climbs the whole `cliffMetres` over the few metres it takes the field to cross it, and
   * outside the band it is flat. That is a bench, a face, and another bench.
   *
   * `cliffCellFreq` is in CELLS, not metres, deliberately: a map cell is 640 m on a full-size world
   * and 64 m on Super tiny, and a cliff that stayed 500 m wide would be invisible on the small one
   * (which is the world this was reported on). Tying it to the cell keeps escarpments the same
   * shape relative to the hills they cut through, whatever size world you are standing on.
   *
   * AND CLIFF COUNTRY HAS TO BE RARE. The first cut of this gated on `broken` alone, and `broken`
   * is over 0.30 across 47% of the map — which produced a corrugated world where 39% of the ground
   * was steeper than 45°. Unwalkable, and no more interesting than the rolling hills it replaced,
   * because a cliff you meet every fifty metres is just texture. So there are two gates, and a
   * face has to pass both: `broken` (this ground is rugged at all) and a slow, separate mask
   * (`cliffMask`) that says this REGION is cliff country. The mask turns over across kilometres,
   * so escarpments come in ranges with quiet farmland between them.
   */
  const cliffMetres = (opts.cliffMetres ?? 220) * reliefScale / 0.22;
  const cliffCellFreq = opts.cliffCellFreq ?? 0.21;
  const cliffBand = opts.cliffBand ?? 0.02;
  const cliffBroken = opts.cliffBroken ?? [0.55, 0.85];      // how rugged the ground must be
  const cliffMaskAt = opts.cliffMask ?? [0.50, 0.66];        // how much of the world is cliff country
  const cliffMaskFreq = (opts.cliffMaskCellFreq ?? 0.03) / M_PER_CELL;
  const cliffFreq = cliffCellFreq / M_PER_CELL;
  const n4 = makeNoise2D(subSeed(world.seed, 'farhold-cliff'));
  const n5 = makeNoise2D(subSeed(world.seed, 'farhold-cliff-country'));

  /** The ground before any river or road touched it. */
  function naturalHeightAt(x, z) {
    const fx = x / M_PER_CELL, fy = z / M_PER_CELL;
    // R21: the EXACT metres, not the rounded ones — the rounding was a 1 m staircase on every
    // hillside and it is what made the slopes look faceted. See `elevationToMetresExact`.
    const base = elevationToMetresExact(layer(world.elevation, fx, fy), relief);
    const broken = clamp(layer(world.slope, fx, fy), 0, 1);
    const damp = base < 0 ? 0.3 : 1;
    const coarse = (fbm(n1, x * 0.0055, z * 0.0055, { octaves: 4 }) - 0.5) * (detailFlat + broken * detailRelief) * damp;
    const fine = (fbm(n2, x * 0.016, z * 0.016, { octaves: 3 }) - 0.5) * (detailFine * (1 + broken * 3)) * damp;
    /**
     * The cliff term. `gate` keeps it on broken ground; `terrace` bends the ridged field's own
     * profile toward its top, which turns a rounded crease into a lip with a face under it.
     */
    let cliff = 0;
    const rugged = smoothstep(cliffBroken[0], cliffBroken[1], broken) * damp;
    if (rugged > 0.001) {
      // is this cliff country at all? a slow field, so escarpments come in ranges
      const country = smoothstep(cliffMaskAt[0], cliffMaskAt[1],
        fbm(n5, x * cliffMaskFreq, z * cliffMaskFreq, { octaves: 2 }));
      const gate = rugged * country;
      if (gate > 0.001) {
        const r = ridged(n4, x * cliffFreq, z * cliffFreq, { octaves: 3, sharpness: 2.2 });
        // the narrow band IS the face: the ground crosses the whole drop while `r` crosses 2·band
        const face = smoothstep(0.5 - cliffBand, 0.5 + cliffBand, r);
        cliff = (face - 0.5) * cliffMetres * gate;
      }
    }
    return base + coarse + fine + cliff;
  }

  // ---------------------------------------------------------------- rivers and roads as paths
  const toMetres = i => [(i % w) * M_PER_CELL, Math.floor(i / w) * M_PER_CELL];

  // A river's water is about as wide as the map says it is, not as wide as a map cell.
  const riverWidth = width => 7 + (width || 1) * 5;          // metres across the water
  const riverDepth = width => 2.4 + (width || 1) * 1.5;      // metres from surface to bed
  const riverBank = width => riverWidth(width) * 0.5 + 26;   // where the valley meets the land
  /**
   * How high the carve may build a channel's rim to meet its own water. See the note in `heightAt`.
   *
   * Five metres covers 97% of the shortfalls measured across three worlds and leaves the handful
   * that are real topography alone — a river spilling into a basin still spills, and `waterRibbon`'s
   * skirt closes those the way it always has.
   */
  const bankRise = opts.bankRise ?? 5;
  /**
   * How far above the water the rim stands once it is there — a bank, not a kerb flush with it.
   *
   * It has to clear the RIVER'S OWN FALL over the width of its channel, not just the water line.
   * `waterAt` measures against the nearest point of a curving line and the sheet is drawn from the
   * point it belongs to, and on a bend those two are a quarter of a metre apart — so a rim built to
   * the nearest-point surface exactly can come out a hand's breadth under the sheet that is drawn
   * over it, which is the round-11 "I walk on the bottom under the blue layer" bug by another
   * route. `water.test.js` caught it on the first run at 0.15 m.
   */
  const bankLip = opts.bankLip ?? 0.8;
  /** How far out across the channel the rim is at full height, as a fraction of bank minus water. */
  const bankCrest = opts.bankCrest ?? 0.65;

  const riverPaths = (world.rivers || []).map(r => {
    const points = smoothPath(r.cells.map(toMetres), 5);
    return {
      kind: 'river', id: r.id, name: r.name, width: r.width || 1,
      half: riverWidth(r.width) / 2, depth: riverDepth(r.width), reach: riverBank(r.width),
      points, surface: null,
    };
  });
  // The water surface: the natural ground along the line, forced downhill so a river never runs up
  // a slope, then smoothed. The bed is this minus the depth, which is what `heightAt` carves to.
  const riverRide = opts.riverRide ?? 1.2;      // how far the water may sit above the natural ground
  for (const path of riverPaths) {
    const natural = path.points.map(p => naturalHeightAt(p[0], p[1]));
    const smooth = natural.slice();
    for (let i = 1; i < smooth.length; i++) smooth[i] = Math.min(smooth[i], smooth[i - 1]);
    // Smooth it, then pull it back down to the ground, then force it downhill again — and repeat.
    // Smoothing alone lifts the line over steep ground, which left the surface floating tens of
    // metres above the bed and turned a mountain stream into a 56 m deep canal.
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 1; i < smooth.length - 1; i++) smooth[i] = (smooth[i - 1] + smooth[i] * 2 + smooth[i + 1]) / 4;
      for (let i = 0; i < smooth.length; i++) smooth[i] = Math.min(smooth[i], natural[i] + riverRide);
      for (let i = 1; i < smooth.length; i++) smooth[i] = Math.min(smooth[i], smooth[i - 1]);
    }
    path.surface = smooth;
  }

  const riverIndex = makePathIndex(riverPaths);

  // Lakes. Unlike a river, a lake really is a cell-sized feature, so a mask over the map's own
  // `water === 2` cells is the right shape for it. The surface is the map elevation with no detail
  // noise on top, which is flat across the lake because the generator filled the depression.
  const lakeDepth = opts.lakeDepth ?? 7;
  const lakeField = new Float32Array(w * h);
  let anyLake = false;

  /**
   * NO LAKE IN THE MIDDLE OF A TOWN.
   *
   * "We should also fix an issue I witnessed where a town had a lake right in the middle. It was
   * kind of cool, but it made travelling between buildings terrible. It's OK if a river passes
   * through a town so long as bridges are formed, but let's try to keep lakes from appearing in the
   * same place as a town."
   *
   * World Forge founds settlements on habitability and fills depressions into lakes, and the two
   * passes do not talk to each other — so a town can end up sitting in one. A river is fine: it is
   * a narrow carved channel with bridges where roads cross it. A lake is a hole. So any lake cell
   * inside a settlement's footprint is simply not a lake here; the carve and the sheet both read
   * this mask, so the water never appears rather than appearing and being walked through.
   */
  const townCells = new Set();
  for (const node of world.nodes || []) {
    if (node.type !== 'settlement' && node.type !== 'port') continue;
    // a port is MEANT to be on water; only inland settlements push the lake out
    if (node.type === 'port') continue;
    const reach = 1 + Math.round((node.size || 1) * 0.6);
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const nx = node.x + dx, ny = node.y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (Math.hypot(dx, dy) > reach) continue;
        townCells.add(IDX(w, nx, ny));
      }
    }
  }
  let drained = 0;
  for (let i = 0; i < w * h; i++) {
    if (world.water[i] !== 2) continue;
    if (townCells.has(i)) { world.water[i] = 0; drained++; continue; }
  }
  const lakeSurfaceAt = (fx, fy) => elevationToMetres(layer(world.elevation, fx, fy), relief);

  /**
   * Lakes as whole bodies of water, not loose cells.
   *
   * The carve above digs each lake a basin, but nothing ever drew water in it — a lake was a dry
   * hole in the ground with a blue dot on the map. Flood-filling `water === 2` gives one entry per
   * lake, and every cell of a lake shares ONE surface height (the lowest rim reading, so the far
   * shore is never left standing in mid-air). `js/features.js` lays a flat sheet at that height and
   * lets the banks poke through it, which is how a shoreline meets its water.
   */
  const lakes = [];
  {
    const seen = new Uint8Array(w * h);
    for (let i0 = 0; i0 < w * h; i0++) {
      if (world.water[i0] !== 2 || seen[i0]) continue;
      const cells = [];
      const stack = [i0];
      seen[i0] = 1;
      let minX = w, maxX = 0, minY = h, maxY = 0, surface = Infinity;
      while (stack.length) {
        const i = stack.pop();
        const cx = i % w, cy = (i / w) | 0;
        cells.push(i);
        if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
        surface = Math.min(surface, elevationToMetres(world.elevation[i], relief));
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = IDX(w, nx, ny);
          if (world.water[j] === 2 && !seen[j]) { seen[j] = 1; stack.push(j); }
        }
      }
      lakes.push({
        cells, surface,
        wx: ((minX + maxX) / 2 + 0.5) * M_PER_CELL, wz: ((minY + maxY) / 2 + 0.5) * M_PER_CELL,
        radius: (Math.max(maxX - minX, maxY - minY) / 2 + 1) * M_PER_CELL,
      });
    }
  }

  /**
   * A SINGLE BLUE PIXEL IS NOT A LAKE.
   *
   * Reported from a play session: "I found a single blue pixel on the map that rendered as a lake,
   * but it has sharp corners and looks completely unnatural" — seed 1, Hes-Subud IV, x 22844,
   * z 10308. It is a real lake as far as the map is concerned, and on that world 25 of the 27 lakes
   * are exactly one cell. They are not bodies of water; they are the depression filler rounding one
   * cell of a hillside down, and a lake drawn one cell at a time comes out as a blue SQUARE a couple
   * of hundred metres across with four right angles in it.
   *
   * So anything under `minLakeCells` is simply not a lake here. The cell goes back to dry land in
   * `world.water` as well, so the minimap, the props and the carve all tell the same story rather
   * than the map showing water where there is none. Anything up to `roundLakeCells` survives but is
   * marked `round`, and `js/water-plan.js` gives it a shoreline instead of a rectangle.
   */
  const minLakeCells = opts.minLakeCells ?? 2;
  const roundLakeCells = opts.roundLakeCells ?? 4;
  let tinyDrained = 0;
  for (let i = lakes.length - 1; i >= 0; i--) {
    const lake = lakes[i];
    if (lake.cells.length >= minLakeCells) {
      lake.round = lake.cells.length <= roundLakeCells;
      continue;
    }
    for (const c of lake.cells) world.water[c] = 0;
    tinyDrained += lake.cells.length;
    lakes.splice(i, 1);
  }

  // the mask the carve shapes the basins from, built from the lakes that are left
  for (const lake of lakes) for (const i of lake.cells) { lakeField[i] = 1; anyLake = true; }
  if (anyLake) blur(lakeField, w, h, 1);

  /**
   * A lake is LEVEL, and the carve has to know that.
   *
   * It used to dig each cell down from that cell's own map elevation, which on a lake spread over
   * uneven ground left half the bed standing above the water line — so the sheet laid at the lake's
   * one surface height came out buried, and the other half of the lake was a dry shelf. This field
   * holds the whole lake's surface at each of the lake's OWN cells, and nothing outside them.
   *
   * It used to be dilated a ring outward, on the theory that would grade the rim. It did the
   * opposite: a lake in a bowl sits well below the ground around it, so handing the rim the lake's
   * level dug a 240 m trench round the outside of every lake. Outside a lake cell the carve goes
   * back to the local map height, and the blurred `lakeField` fades the depth out to nothing, which
   * is all the grading the rim needs.
   */
  const lakeLevel = new Float32Array(w * h);
  for (const lake of lakes) for (const i of lake.cells) lakeLevel[i] = lake.surface;

  const roadWidth = klass => (klass === 'trail' ? 4.5 : 7);
  let roadPaths = (world.roads || []).map(r => {
    const points = smoothPath(r.cells.map(toMetres), 5);
    return {
      kind: 'road', id: r.id, klass: r.class || 'trail', cells: r.cells, bridgeCells: r.bridges || [],
      half: roadWidth(r.class) / 2, reach: roadWidth(r.class) / 2 + 16,
      points, surface: null,
    };
  });

  /**
   * ROADS MERGE. THEY DO NOT WEAVE.
   *
   * Reported: "roads spanning between cities sometimes come together, but rather than merging into
   * one road they weave back and forth together like two messy roads that keep colliding."
   *
   * That is exactly what they were. World Forge routes every link with its own A* pass, so two links
   * between neighbouring towns pick very nearly the same cells — and then `smoothPath` curves each
   * one independently, so the two lines cross and re-cross every few metres. On the seed the user
   * played, 44 pairs of roads shared 819 points within twenty metres of each other.
   *
   * The rule is a HIERARCHY (TOWN_EXPANSION 9.1-9.4). A highway outranks a road outranks a trail,
   * and between equals the longer line is the trunk. The trunk claims its corridor; any lower road
   * that runs inside that corridor does not draw a second line beside it — it ENDS at a junction on
   * the trunk, and picks up again at another junction where it leaves. One road on the ground, two
   * routes over it, and nothing left to weave against. `mergeCells` is in map cells rather than
   * metres because the weave is a cell-sized artefact: the two lines share the cells themselves.
   */
  const roadRank = klass => (klass === 'highway' ? 3 : klass === 'road' ? 2 : 1);
  const mergeDist = (opts.mergeCells ?? 0.3) * M_PER_CELL;

  function mergeRoadNetwork(paths) {
    // trunks first, so the biggest road in a corridor is the one that keeps it
    const order = paths.slice().sort((a, b) =>
      roadRank(b.klass) - roadRank(a.klass) || b.points.length - a.points.length);
    const claimed = [];
    let junctions = 0;
    for (const path of order) {
      if (!claimed.length || path.points.length < 4) { claimed.push(path); continue; }
      // `pad` has to be the merge distance, not the road's own width, or the index would not even
      // look at a corridor sixty metres away
      const index = makePathIndex(claimed, 220, mergeDist);
      const pts = path.points;
      const inside = pts.map(p => {
        const hit = index.nearest(p[0], p[1]);
        return !!hit && hit.dist < mergeDist;
      });
      if (!inside.some(Boolean)) { claimed.push(path); continue; }
      // where the trunk is, for the junction node this road ends on — the hit comes back with it,
      // because the deck has to be pinned to the trunk's own height later on as well
      const onTrunk = (p) => {
        const hit = index.nearest(p[0], p[1]);
        if (!hit) return null;
        const a = hit.path.points[hit.i];
        const b = hit.path.points[Math.min(hit.path.points.length - 1, hit.i + 1)];
        return { point: [a[0] + (b[0] - a[0]) * hit.t, a[1] + (b[1] - a[1]) * hit.t], trunk: hit.path, i: hit.i, t: hit.t };
      };
      // every run of points that is NOT in somebody else's corridor becomes a road of its own,
      // starting and ending on the trunk it left and rejoined
      const pieces = [];
      let start = -1;
      for (let i = 0; i <= pts.length; i++) {
        const out = i < pts.length && !inside[i];
        if (out && start < 0) start = i;
        if (!out && start >= 0) {
          const run = pts.slice(start, i);
          const joins = [];
          if (start > 0) {
            const j = onTrunk(run[0]);
            if (j) { run.unshift(j.point); joins.push({ ...j, at: 'start' }); junctions++; }
          }
          if (i < pts.length) {
            const j = onTrunk(run[run.length - 1]);
            if (j) { run.push(j.point); joins.push({ ...j, at: 'end' }); junctions++; }
          }
          if (run.length >= 3) pieces.push({ run, joins });
          start = -1;
        }
      }
      for (let k = 0; k < pieces.length; k++) {
        const piece = {
          ...path, points: pieces[k].run, joins: pieces[k].joins,
          id: k ? `${path.id}.${k}` : path.id, merged: true,
        };
        claimed.push(piece);
      }
    }
    return { paths: claimed, junctions };
  }

  const merged = mergeRoadNetwork(roadPaths);
  roadPaths = merged.paths;
  // A road is graded: the surface is the natural ground smoothed along the line, so the road itself
  // is flat across its width and gentle along its length instead of following every bump.
  const bridgeClearance = opts.bridgeClearance ?? 2.4;
  const rampPerPoint = opts.rampPerPoint ?? 0.5;
  for (const path of roadPaths) {
    const raw = path.points.map(p => naturalHeightAt(p[0], p[1]));
    const smooth = raw.slice();
    for (let pass = 0; pass < 4; pass++) {
      for (let i = 1; i < smooth.length - 1; i++) smooth[i] = (smooth[i - 1] + smooth[i] * 2 + smooth[i + 1]) / 4;
    }

    // A road that meets a river has to go OVER it. The graded height follows the natural ground,
    // which at a crossing can sit at or under the water, so the road (and the bridge standing on
    // it) dipped into the river. Lift each crossing point clear of the water, then let the lift
    // decay along the road so the approaches ramp up to the bridge instead of stepping onto it.
    const lift = new Float64Array(smooth.length);
    /**
     * ROUND 17 — THE LIFT WALKS THE ROAD. IT DOES NOT SAMPLE ITS CORNERS.
     *
     * *"The river collides with a road here and messes with the water. Can we make sure crossings
     * like this generate raised bridges instead?"* (seed 56138, Chodikvraun III, x 11547 z 3152.)
     *
     * This asked the river index about each road POINT and nothing in between. A road point is one
     * fifth of a map cell along the line — 12.8 m on the smallest planet and 128 m on the largest —
     * and the deck between two points is a straight interpolation. So a river that passes between
     * two points got a lift at neither of them, the interpolated deck ran straight through the
     * water, `findCrossings` then refused to call it a bridge (its deck was not clear of the
     * surface), and with no crossing on record the deck clamp at the bottom of `heightAt` raised
     * the ground to meet the road: the earth plug the user was looking at.
     *
     * It is the SAME blind spot round 16's `ringCrossings` fixed for town gates — a question asked
     * of a polyline's samples instead of of the polyline. Measured at the user's own spot, road 8
     * crossed a river 8 m from the middle of its channel with a lift of exactly zero attributed to
     * the crossing.
     *
     * A leg is walked every `GRADE_STEP` metres and the WORST water on it is charged to both of its
     * ends. Both ends clearing it is what makes the straight line between them clear it too.
     */
    const GRADE_STEP = 4;
    /**
     * The river's own surface at a point, or null where there is no river within its banks.
     *
     * `surfaceOfHit` is the number `waterAt` answers with AND the number the sheet is drawn at (R18
     * collapsed the two into one), and a road lifted to clear a DIFFERENT number is a road the
     * game thinks is under water. Measured on seed 7, a road approaching a bridge sat 2.35 m under
     * the river it was running beside because the lift cleared the nearest point and the water was
     * reported from the quad the sheet was actually drawn from.
     */
    const riverSurfaceNear = (x, z) => {
      const hit = riverIndex.nearest(x, z);
      if (!hit || hit.dist >= hit.path.reach) return null;
      return surfaceOfHit(hit);
    };
    /** The highest water anywhere along a leg, walked rather than sampled at its ends. */
    const worstAlong = (ax, az, bx, bz, at) => {
      const len = Math.hypot(bx - ax, bz - az);
      const steps = Math.max(1, Math.ceil(len / GRADE_STEP));
      let worst = -Infinity;
      for (let s = 0; s <= steps; s++) {
        const u = s / steps;
        const got = at(ax + (bx - ax) * u, az + (bz - az) * u);
        if (got !== null && got > worst) worst = got;
      }
      return worst;
    };
    /** The water each point has to clear, charged from the legs either side of it. */
    const needs = (at) => {
      const out = new Float64Array(path.points.length).fill(-Infinity);
      for (let i = 0; i + 1 < path.points.length; i++) {
        const [ax, az] = path.points[i], [bx, bz] = path.points[i + 1];
        const worst = worstAlong(ax, az, bx, bz, at);
        if (worst === -Infinity) continue;
        if (worst > out[i]) out[i] = worst;
        if (worst > out[i + 1]) out[i + 1] = worst;
      }
      // a road of a single leg still has two ends; a road of one point has no leg at all
      if (path.points.length === 1) {
        const got = at(path.points[0][0], path.points[0][1]);
        if (got !== null) out[0] = got;
      }
      return out;
    };
    const riverNeed = needs(riverSurfaceNear);
    for (let i = 0; i < path.points.length; i++) {
      if (riverNeed[i] === -Infinity) continue;
      lift[i] = Math.max(lift[i], riverNeed[i] + bridgeClearance - smooth[i]);
    }
    /**
     * …AND CLEAR OF EVERY OTHER KIND OF WATER TOO.
     *
     * "I found a case where the road was underwater. Roads should be safely above water level."
     * The lift above only knew about rivers, so a road crossing a lake or running along a shore
     * simply followed the ground down under the surface. Sea level and a lake's own level are both
     * checked here, and the same ramping carries the approaches up to meet it.
     */
    const roadRide = opts.roadRide ?? 0.9;
    // the lowest the deck may ever sit at each point, so the pin below can never undo it
    const wetFloor = new Float64Array(path.points.length).fill(-Infinity);
    // A SHORELINE, not a sea lane. Lifting a road clear of the sea is right where the road runs
    // along a coast and the ground is only just under water; doing it where the sea floor is
    // twenty metres down builds a plank across open water with nothing holding it up. Worldgen
    // marks real crossings as bridges, and those already have their own lift above.
    // Walked along the legs for the same reason the river lift above is — a lake shore between two
    // road points is a lake shore the road knew nothing about.
    const flatWaterNear = (x, z) => {
      let water = -Infinity;
      const cell = IDX(w, cellX(x), cellY(z));
      if (hasSea && naturalHeightAt(x, z) > seaLevel - (opts.shoreDepth ?? 8)) water = Math.max(water, seaLevel);
      if (lakeLevel[cell]) water = Math.max(water, lakeLevel[cell]);
      return water === -Infinity ? null : water;
    };
    const flatNeed = needs(flatWaterNear);
    for (let i = 0; i < path.points.length; i++) {
      if (flatNeed[i] === -Infinity) continue;
      wetFloor[i] = flatNeed[i] + roadRide;
      lift[i] = Math.max(lift[i], wetFloor[i] - smooth[i]);
    }
    /**
     * THE FLOOR THE DECK MAY NEVER GO UNDER, KEPT ON THE PATH.
     *
     * Round 17. Every pass below this one — the pin to the ground, and the junction levelling that
     * runs after every road is graded — is free to LOWER a point, and neither of them knew that the
     * point it was lowering was a bridge. The junction pass in particular pulled the last six points
     * of a merged road onto its trunk's height: measured on the user's world, road 8's crossing came
     * out 1.37 m over the water where the lift had put it 2.40 m over, which is under the clearance
     * `findCrossings` needs to call something a bridge — so the crossing was never recorded and the
     * ground was plugged instead. One floor, written once, applied last.
     */
    const floor = new Float64Array(path.points.length).fill(-Infinity);
    for (let i = 0; i < path.points.length; i++) {
      if (riverNeed[i] > -Infinity) floor[i] = Math.max(floor[i], riverNeed[i] + bridgeClearance);
      if (wetFloor[i] > -Infinity) floor[i] = Math.max(floor[i], wetFloor[i]);
    }
    path.floor = floor;
    path.ground = raw;
    for (let i = 1; i < lift.length; i++) lift[i] = Math.max(lift[i], lift[i - 1] - rampPerPoint);
    for (let i = lift.length - 2; i >= 0; i--) lift[i] = Math.max(lift[i], lift[i + 1] - rampPerPoint);
    for (let i = 0; i < smooth.length; i++) smooth[i] += Math.max(0, lift[i]);

    /**
     * …AND THE ROAD STILL HAS TO SIT ON THE GROUND.
     *
     * Smoothing a line over four passes carries it across a dip, which is what gives a road its
     * gentle gradient — but carried far enough it becomes a plank in the air, which is the
     * "roads flying in the air that clip through the player" note. So outside a real crossing the
     * deck is pinned within a few metres of the ground under it: a shallow cutting where the road
     * climbs, a low embankment where it falls, and nothing you can walk under.
     *
     * A point that HAS a lift is left alone. That is a bridge, and a bridge is meant to be up there.
     */
    const maxFill = opts.roadFill ?? 3.5;
    const maxCut = opts.roadCut ?? 3.5;
    for (let i = 0; i < smooth.length; i++) {
      if (lift[i] > 0.5) continue;
      const ground = raw[i];
      smooth[i] = Math.max(ground - maxCut, Math.min(ground + maxFill, smooth[i]));
    }
    // …and the water has the last word. Pinning the deck to the ground could pull it back under a
    // surface it had just been lifted clear of, which is a road under water again by another route.
    for (let i = 0; i < smooth.length; i++) {
      if (wetFloor[i] > -Infinity) smooth[i] = Math.max(smooth[i], wetFloor[i]);
    }
    /**
     * A SEA LANE IS NOT A ROAD.
     *
     * World Forge routes some links across open water — a shipping lane between two ports. Lifting
     * those to sea level would lay a plank across the ocean, and leaving them alone draws a road
     * along the sea floor. Neither is right, so the span is simply marked `wet` and `js/features.js`
     * does not draw road there. What crosses the water is a boat.
     */
    path.wet = smooth.map((deck, i) => hasSea && raw[i] < seaLevel - (opts.shoreDepth ?? 8));
    path.surface = smooth;
    path.lift = lift;
  }

  /**
   * A JUNCTION IS ONE HEIGHT, NOT TWO.
   *
   * Each road grades its own deck, so the road joining a trunk and the trunk itself arrived at the
   * same spot up to a metre apart — a step in the ground at every junction the merge above made, and
   * a bridge deck that no longer matched what you collide with (the nearest road wins there, and at
   * a junction that is a coin toss). The joining road is pulled onto the trunk's height at the
   * junction and the correction fades out over the next few points, so the approach ramps instead
   * of stepping. It runs after every road is graded, because a piece can be built before its trunk.
   */
  for (const path of roadPaths) {
    const joins = path.joins || [];
    /**
     * ROUND 22 — TWO JOINS ON A SHORT ROAD MUST NOT REACH ACROSS EACH OTHER.
     *
     * The fade was a flat six points from each end whatever the road's length, and a merged piece
     * can be four points long: at seed 11 road 18 leaves trunk 5 and rejoins the SAME segment of
     * it a few metres later, so both of its ends were pinned and each fade ran the whole length of
     * the road. The second one then lifted the first one's junction point by a quarter of its own
     * correction, and road 18's ribbon started 2.02 m above the trunk it joins — a step in the
     * ground at the junction and one of the two roads buried.
     *
     * Half the road each, so the two fades meet in the middle and neither touches the other's
     * pinned end. On a four-point piece that is a span of one, which means the endpoints are set
     * exactly and nothing else moves — which is the honest answer for a road that short.
     */
    const span0 = Math.min(6, Math.max(1, joins.length > 1
      ? Math.floor(((path.surface?.length || 1) - 1) / 2)
      : (path.surface?.length || 1)));
    for (const join of joins) {
      const trunk = join.trunk;
      if (!trunk?.surface || !path.surface) continue;
      const y = lerp(trunk.surface[join.i], trunk.surface[Math.min(trunk.surface.length - 1, join.i + 1)], join.t);
      const at = join.at === 'start' ? 0 : path.surface.length - 1;
      const delta = y - path.surface[at];
      if (!Number.isFinite(delta) || Math.abs(delta) < 1e-4) continue;
      const span = Math.min(span0, path.surface.length);
      for (let k = 0; k < span; k++) {
        const idx = join.at === 'start' ? k : path.surface.length - 1 - k;
        const want = path.surface[idx] + delta * (1 - k / span);
        /**
         * ROUND 22 — AND THE FADE MAY NOT PULL A POINT UNDER ITS OWN FLOOR.
         *
         * *"The terrain repeatedly clips through the road… the road also clips through the ground."*
         * Measured at seed 19 the worst case in the whole world was 3.49 m, and it was HERE.
         *
         * The floor pass below this one exists to undo what this one does to a bridge, and the two
         * were fighting. This pass drags the six points after a junction down onto the trunk's
         * height; on road 7 that put point 1 nearly four metres under the river it has to bridge;
         * the floor pass then pushed point 1 back up, and its own "no more than half a metre of
         * step between two points" ramp dragged point 0 — THE JUNCTION ITSELF — up 3.56 m with it.
         * So the branch's ribbon started three and a half metres above the trunk it was supposed
         * to join, the terrain there is graded to whichever of the two roads is nearer, and one of
         * them is buried. That is the clipping, and it is at every junction where the branch has a
         * bridge in its first few points.
         *
         * Clamping the fade to the floor here settles it: the points the fade touches are already
         * at or above their floor, so the floor pass finds nothing to restore and never reaches the
         * junction. The junction point itself (k = 0) still takes the trunk's height exactly,
         * unless its OWN floor is higher — which is a bridge starting on a junction, and there the
         * water has to win.
         */
        const bottom = path.floor?.[idx] ?? -Infinity;
        path.surface[idx] = Math.max(want, bottom);
      }
    }
  }

  /**
   * …AND A JUNCTION MAY NOT PULL A BRIDGE INTO THE RIVER.
   *
   * Round 17, and the second half of the user's *"the river collides with a road here and messes
   * with the water"*. The pass above is right about junctions and blind about everything else: it
   * lowers the last six points of a merged road onto its trunk's height whatever those points are
   * standing over. On the user's world (seed 56138, Chodikvraun III) road 8 crosses a river four
   * points from its junction, and the correction dropped its deck from 2.40 m over the water to
   * 1.37 m — under the clearance `findCrossings` demands, so the crossing was never recorded, no
   * bridge was built, and the deck clamp in `heightAt` filled the channel instead. Road 12 lost
   * 1.19 m the same way. Two of the six missed crossings around the user's town were this.
   *
   * So the floor has the last word, and the ramp then carries the approaches back up to it — the
   * same shape the lift itself uses, so a restored bridge is still something you walk onto rather
   * than climb.
   */
  for (const path of roadPaths) {
    if (!path.floor || !path.surface) continue;
    /**
     * IT IS THE RESTORATION THAT RAMPS, NOT THE ROAD.
     *
     * The first version of this ramped `surface` itself — `surface[i] = max(surface[i],
     * surface[i-1] - rampPerPoint)` — which is what the lift pass appears to do and is not. The
     * lift pass ramps a DELTA that is zero nearly everywhere; ramping the absolute height says "a
     * road may never descend more than half a metre between two points", and two road points are
     * 128 m apart on a full-sized planet. Seed 7 road 4 came down off a pass, so its 140 m descent
     * was flattened into a 140 m viaduct and the deck clamp then built the embankment under it.
     * Caught by `planet.test.js`'s "a lifted road is something you can stand on" within a minute.
     */
    const add = new Float64Array(path.surface.length);
    let raised = false;
    for (let i = 0; i < path.surface.length; i++) {
      const want = path.floor[i] - path.surface[i];
      if (want <= 0) continue;
      add[i] = want;
      raised = true;
    }
    if (!raised) continue;
    for (let i = 1; i < add.length; i++) add[i] = Math.max(add[i], add[i - 1] - rampPerPoint);
    for (let i = add.length - 2; i >= 0; i--) add[i] = Math.max(add[i], add[i + 1] - rampPerPoint);
    for (let i = 0; i < path.surface.length; i++) {
      if (add[i] <= 0) continue;
      path.surface[i] += add[i];
      // `lift` is what js/features.js reads to decide whether a stretch is drawn as a thick deck or
      // as a flat draped ribbon, so it has to carry what was put back as well
      if (path.lift) path.lift[i] += add[i];
    }
  }

  const roadIndex = makePathIndex(roadPaths);
  // how far past the road's own edge the deck keeps its ground when a channel is carved under it
  const deckGrip = opts.deckGrip ?? 1.5;
  /**
   * ROUND 22 — THE FLAT SHELF EITHER SIDE OF A ROAD, IN METRES PAST ITS OWN KERB.
   *
   * *"At this location the terrain repeatedly clips through the road."* (seed 25392, Kydsel IV,
   * x 5160 z 1597, and again at x 5805 z 1788.)
   *
   * The road ribbon is drawn six centimetres over the graded deck, and `heightAt` used to start
   * blending the ground back to the natural hillside at the kerb EXACTLY. So the ground is at deck
   * height at `half` and already climbing at `half + 0.1`. That would still be invisible if the
   * terrain were drawn at infinite resolution — but the innermost terrain ring has two-metre cells,
   * and a triangle whose outer vertex sits two metres past the kerb in a three-and-a-half-metre
   * cutting is 0.14 m above the deck there. The triangle is a straight line from the kerb to that
   * vertex, so it carries the hillside right across the paving: more than double the six
   * centimetres of lift, and what the player sees is grass cutting up through the road.
   *
   * Lifting the ribbon instead would only paper over it (and would make every road a kerbstone).
   * Holding the ground dead flat for a verge WIDER THAN ONE TERRAIN CELL means the nearest vertex
   * outside the carriageway is at deck height too, so the triangle between them is flat and the
   * ribbon clears it everywhere. Two and a half metres covers the two-metre inner ring with enough
   * spare for the mitre: `ribbon()` in js/features.js turns its edge on the averaged tangent
   * `prev → next`, so at a bend the drawn edge lies a little further out than `half`.
   *
   * It costs nothing at the far end — the blend simply runs from `half + roadVerge` to `reach`
   * instead of from `half` — and a verge is what a real road has anyway.
   */
  const roadVerge = opts.roadVerge ?? 2.5;
  /**
   * ROUND 16 — the quay, and how square a crossing has to be before it counts as one.
   *
   * *"Since the road is near the water but doesn't need to cross it, it would be better to shape
   * alongside the river like a quay."* `quayApron` is how far out from the road's edge the quay
   * top runs, and `quayFade` is how far back from the water's edge it starts — so a road beside a
   * river gets a defined lip at deck height instead of a shoulder that slumps into the sheet.
   *
   * `crossingDot` is the dot product of the two tangents above which a road is running ALONGSIDE a
   * river rather than over it. 0.72 is about 44 degrees.
   */
  const quayApron = opts.quayApron ?? 10;
  const quayFade = opts.quayFade ?? 10;
  /**
   * How high the quay's lip stands above the water it borders.
   *
   * A quay is a defined edge a step above the water, NOT a wall all the way up to the road. Holding
   * the bank at the full deck height built a three-metre face right beside every bridge abutment —
   * correct as engineering, wrong as a thing to look at, and it is not what the user asked for.
   */
  const quayRise = opts.quayRise ?? 1.4;
  const CROSS_DOT = opts.crossingDot ?? 0.72;

  /**
   * Height along a path at a nearest-point hit — and, for a river, THE WATER SURFACE HERE.
   *
   * R18 — this used to have a twin. `riverTopAt` answered `max(surface[i], surface[i + 1])`: the
   * higher END of a segment, for the whole length of that segment. That is constant along a segment
   * and it STEPS at every boundary, by 12.21 m at the worst pair of points on seed 7.
   *
   * `waterRibbon` (js/water-plan.js) pushes one vertex per river point at that point's own height
   * and fills the quad between two points with two triangles, so what is actually DRAWN between
   * point i and point i+1 is a linear ramp — which is exactly this lerp. Measuring against the max
   * meant the water the game tested against and the water you could see were two different
   * surfaces: swimming down a river, `waterAt().surface` dropped several metres the instant you
   * crossed a boundary, js/player.js found the body above the new surface, `swimming` went false,
   * and you were falling through the air over water still drawn underneath you.
   *
   * `makePathIndex.nearest` has always returned `t`, so the ramp costs nothing the max did not.
   * The two functions are one now, because two names for one lerp is how the prose on the other one
   * came to describe behaviour it no longer had.
   *
   * THE BEND CASE, which the max used to hide: the sheet is drawn as a flat slab per point, both
   * edges at that point's height, while this measures along the nearest SEGMENT. Out near the bank
   * on a bend those are not the same quad and they differ by ~0.10 m (measured on seed 7, 24 m off
   * the centre line). `waterAt` carries that as an explicit constant `EDGE` instead — see there.
   */
  // A `function` declaration, not a `const` arrow, because it is HOISTED: `riverSurfaceNear` is
  // built and called during setup, hundreds of lines above this one. R18 collapsed the hoisted
  // `riverTopAt` into this and briefly made it a const — which is a TDZ crash `node --check`
  // cannot see, and this project has had three of those already.
  function surfaceOfHit(hit) {
    const surf = hit.path.surface;
    const a = surf[hit.i], b = surf[Math.min(surf.length - 1, hit.i + 1)];
    // every caller passes a hit from `makePathIndex.nearest`, which always sets a clamped `t`;
    // the guard is for a hand-built hit, and errs towards more water rather than less
    if (hit.t == null) return Math.max(a, b);
    return lerp(a, b, hit.t < 0 ? 0 : hit.t > 1 ? 1 : hit.t);
  }

  /**
   * Is this road running ACROSS this river, or along beside it?
   *
   * Written without allocating anything: `heightAt` reaches it for every terrain vertex that lands
   * in a channel with a road over it, and two throwaway arrays a vertex is a lot of garbage.
   */
  function crossesSquarely(roadHit, riverHit) {
    const rp = roadHit.path.points, ri = Math.min(rp.length - 2, Math.max(0, roadHit.i));
    let ax = rp[ri + 1][0] - rp[ri][0], az = rp[ri + 1][1] - rp[ri][1];
    const al = Math.hypot(ax, az) || 1; ax /= al; az /= al;
    const vp = riverHit.path.points, vi = Math.min(vp.length - 2, Math.max(0, riverHit.i));
    let bx = vp[vi + 1][0] - vp[vi][0], bz = vp[vi + 1][1] - vp[vi][1];
    const bl = Math.hypot(bx, bz) || 1; bx /= bl; bz /= bl;
    return Math.abs(ax * bx + az * bz) < CROSS_DOT;
  }

  /**
   * Ground height in metres above sea level (or above the datum on a dry world), with the road
   * graded in and the river valley cut.
   */
  function heightAt(x, z) {
    let height = naturalHeightAt(x, z);

    // a road flattens the ground it runs over, and its shoulders blend back into the land
    const road = roadIndex.nearest(x, z);
    let deck = null;
    let verge = 0;
    if (road && road.dist < road.path.reach) {
      const graded = surfaceOfHit(road);
      deck = graded;
      verge = road.path.half + roadVerge;
      const t = smoothstep(verge, road.path.reach, road.dist);   // 0 on the road, 1 off it
      height = lerp(graded, height, t);
    }

    // a lake sits in its own basin
    if (anyLake) {
      const fx = x / M_PER_CELL, fy = z / M_PER_CELL;
      // full depth inside a real lake cell, with the blurred field only shaping the rim outside it
      const cell = IDX(w, cellX(x), cellY(z));
      const inLake = world.water[cell] === 2 ? 1 : 0;
      const lake = Math.max(inLake, layer(lakeField, fx, fy));
      if (lake > 0.05) {
        // the lake's OWN level where there is one, so the bed is dug from the water line and not
        // from whatever the map happened to say this corner of the basin was
        const surface = inLake ? lakeLevel[cell] : lakeSurfaceAt(fx, fy);
        const bed = surface - lakeDepth * smoothstep(0.05, 0.6, lake);
        height = Math.min(height, bed);
      }
    }

    // a river cuts a channel with a flat bed and banks either side
    const river = riverIndex.nearest(x, z);
    let riverSurface = null;
    if (river && river.dist < river.path.reach) {
      riverSurface = surfaceOfHit(river);
      const bed = riverSurface - river.path.depth;
      const t = smoothstep(river.path.half, river.path.reach, river.dist);
      const carved = lerp(bed, height, t);
      height = Math.min(height, carved);        // a river only ever cuts down, never fills up

      /**
       * ROUND 17 — A CHANNEL WITH A RIM, SO THE WATER HAS SOMETHING TO STOP AGAINST.
       *
       * *"The water does not touch the shoreline."* (seed 56138, Chodikvraun III, x 11572 z 2995.)
       *
       * `waterRibbon` in js/water-plan.js pushes the drawn sheet outward, per point and per side,
       * until the carved ground has climbed back to the water line — that is how a real shoreline
       * hides the edge of a sheet, and it has worked since round 5. What it cannot do is find a
       * bank that was never built. The carve above blends from the flat bed back to the NATURAL
       * ground at `reach`, and the natural ground is `naturalHeightAt`, which piles up to 78 m of
       * relief noise on top of the map's elevation. So the rim of the channel is wherever that
       * noise happened to leave it: measured across three worlds, between 9% and 28% of river edges
       * had NO point anywhere out to `reach` that reached the water line, and the sheet then ran the
       * full thirty metres and stopped in mid-air — 5.59 m of open edge at the user's own town.
       *
       * The shortfall is nearly always small (97% of them under five metres; two thirds of them
       * under one), because it is noise rather than topography. So the outer part of the channel is
       * brought UP to the water line where it falls short, fading in from the water's own edge so
       * the river keeps its width and its shape, and capped at `bankRise` so a river that genuinely
       * runs along a shelf above a valley gets no thirty-metre wall built round it.
       *
       * Three things it must not do, and each is somebody's bug from an earlier round:
       *   * it never touches the water itself (`dist > half`), or a quay could narrow a river;
       *   * it never fills a bridge's footprint, which is the dam round 16 took out;
       *   * it never dams a river mouth — at the sea the bank legitimately does not come back.
       */
      /**
       * THE RIM IS BUILT TO THE WATER THAT IS DRAWN OVER IT.
       *
       * R18 — this used to call `riverTopAt`, a second function that answered the highest surface
       * of the segment rather than the one drawn here, so the rim was built to a different number
       * from the one `waterAt` measures against. Both are `surfaceOfHit` now, which is also the
       * ramp `waterRibbon` draws, so the rim, the water test and the sheet cannot disagree.
       *
       * It is the SAME value as `riverSurface` above — same hit, same function — so it is reused
       * rather than recomputed. This is the hottest sampler in the game: `heightAt` runs for every
       * terrain vertex, and this block used to lerp the same two array entries twice per call.
       */
      const bankTarget = riverSurface;
      if (bankRise > 0 && river.dist > river.path.half && height < bankTarget + bankLip
          && !(hasSea && riverSurface <= seaLevel + 1)) {
        let want = Math.min(bankTarget + bankLip, height + bankRise);
        /**
         * AND A BANK NEVER TOWERS OVER THE ROAD BESIDE IT.
         *
         * A road running alongside a river whose surface sits above the carriageway — the quay case
         * from round 16 — would otherwise get a five-metre wall of earth built along its verge,
         * because the rim's job is to reach the water line and the water line is above the road.
         * `round16-roads.test.js` walked a player up 5.14 m in one two-metre step onto one.
         *
         * So where there is a road, the rise starts from the road's own deck and fades up to the
         * full rim with the road's own shoulder — which is the same curve the carriageway already
         * blends back into the land with, so the two cannot leave a step between them.
         */
        if (deck !== null) {
          // the same curve the carriageway blends back with — including R22's verge, or the rim
          // would start climbing inside the flat shelf the verge exists to keep flat
          const shoulder = smoothstep(verge, road.path.reach, road.dist);
          want = lerp(Math.max(height, deck), want, shoulder);
        }
        /**
         * AND IT FADES OUT AT A BRIDGE RATHER THAN SWITCHING OFF.
         *
         * A rim that is simply absent inside a crossing's footprint and full height one metre
         * outside it is a five-metre cliff around every bridge: `round16-roads.test.js` measured a
         * player being asked to climb 5.14 m in one step walking off a deck. `spanFade` is 0 inside
         * the footprint and 1 a few metres out, so the bank comes up to meet the abutment.
         */
        const clear = want > height ? spanFade(x, z, SPAN_FADE) : 0;
        if (clear > 0) {
          // Fully up by `bankCrest` of the way out, not only in the last centimetre: the sheet's
          // widening walks in steps of half a channel-width, so a rim that only reaches the water
          // line exactly at `reach` is a rim no sample ever lands on.
          const top = river.path.half + (river.path.reach - river.path.half) * bankCrest;
          const rim = smoothstep(river.path.half, top, river.dist);   // 0 at the water, 1 at the bank
          height = lerp(height, want, rim * clear);
        }
      }
    }

    if (deck === null) return height;

    /**
     * A BRIDGE SPANS THE RIVER. IT DOES NOT DAM IT.
     *
     * *"For other situations where roads overlap rivers I've seen them pull the terrain up, cutting
     * off the water, is it possible to have bridges span the gap in that case rather than to raise
     * the elevation up, and ensure the player can walk across the river."*
     *
     * That is exactly what the old clamp below did. It re-imposed the graded deck out to
     * `half + deckGrip` metres either side of the centre line — measured at the user's own spot
     * (seed 4477, Pewargate) that is a twelve-metre earth plug straight across a river that is
     * fifty metres of water either side of it. A dam, not a bridge, and the only reason you could
     * walk over the crossing at all.
     *
     * So the ground inside a real crossing's footprint is left carved, and the bridge itself carries
     * you: `js/features.js` puts its deck mesh on exactly these records and files a matching deck
     * collider (`ObstacleField.addDeck`), which is what `js/player.js` already stands on through
     * `standAt`. ONE list decides both, so the thing you can see and the thing you can stand on can
     * never disagree — which is how the old version ended up with a deck 9.3 m above its collision.
     */
    const spanned = riverSurface !== null && spannedAt(x, z);
    if (spanned && height < riverSurface) return height;

    /**
     * A QUAY WHERE THE ROAD RUNS ALONGSIDE THE WATER.
     *
     * *"There is a road clipping into the water, and the water level is lower on one side of the
     * road. In this case since the road is near the water but doesn't need to cross it, it would be
     * better to shape alongside the river like a quay."*
     *
     * The road's shoulder (up at the top of this function) lerps the ground from the deck back to
     * the land over sixteen metres, and the river's carve then cuts that slope away again from
     * below. What is left where the two meet is a slumped bank of no particular height, which the
     * water sheet stops against at whatever point it happens to reach — one side short, the other
     * running on, which is the "water level is lower on one side" the user saw.
     *
     * A quay is the opposite of a slumped bank: a flat top at the road's own height with a defined
     * edge. It runs from the road out `quayApron` metres and fades in over the last `quayFade`
     * metres before the water's edge, and it stops DEAD at the edge of the channel — so the sheet
     * has a fixed, known place to stop on this side (see `waterRibbon` in js/water-plan.js).
     */
    // Three gates, and each one is in the user's own sentence. The channel itself is never touched
    // (`river.dist >= half` keeps the plan's water width clear, so a quay can never narrow a river
    // to nothing). The road has to be above the water, or it is a ford, not a quay. And the road
    // has to be running ALONGSIDE the river — *"near the water but doesn't need to cross it"* — so
    // a road that crosses gets abutments and a bridge and never a shelf in the middle of its own
    // channel. It is the same test `findCrossings` uses to decide what a bridge is.
    /**
     * ROUND 17 ADDED `!spanned`, AND IT IS NOT BELT AND BRACES.
     *
     * The quay is refused over a crossing by `!crossesSquarely` — which was sound only while the
     * two agreed about what a crossing IS. A road meeting a river at forty degrees now gets a
     * bridge (see the walk in `findCrossings`: if the carriageway is in the water it is crossing,
     * whatever the angle), and `crossesSquarely` still called that road "alongside" — so the quay
     * happily shelved the channel up under its own bridge, which is the dam round 16 removed,
     * rebuilt by the module that was supposed to be the alternative to it. The footprint is the
     * authority on where a bridge is; nothing else gets to fill it.
     */
    if (riverSurface !== null && !spanned && river.dist >= river.path.half && deck > riverSurface + 0.3
        && !crossesSquarely(road, river)) {
      const toWater = 1 - smoothstep(river.path.half, river.path.half + quayFade, river.dist);
      const toRoad = 1 - smoothstep(road.path.half, road.path.half + quayApron, road.dist);
      const quay = toWater * toRoad;
      // the lip: a step above the water, or the road's own level if the road is lower than that
      const top = Math.min(deck, riverSurface + quayRise);
      if (quay > 0) height = Math.max(height, lerp(height, top, quay));
    }

    /**
     * …AND THE ROAD DECK HAS THE LAST WORD EVERYWHERE ELSE, SO A ROAD IS SOMETHING YOU CAN STAND ON.
     *
     * Reported in round 11: "roads, mainly ones crossing rivers, do not actually have any physics
     * and you can walk right through them." They had none because the carve ran AFTER the grading
     * and only ever cuts down: the road was lifted clear of the water a few lines above, and then
     * the river cut the deck straight back out again.
     *
     * Collision comes from this function, so the deck has to be IN it — for a lake causeway, a
     * shoreline road, a cutting, an embankment. The one case it is now NOT in is a river crossing,
     * which is the branch above: there the bridge is the thing you stand on.
     */
    /**
     * …AND THE VERGE STOPS AT THE WATER'S EDGE.
     *
     * The wider band is what stops a terrain triangle carrying a hillside across the paving. It is
     * also, word for word, the earth plug round 16 took out of every river — the clamp only raises
     * ground, so widening it beside a channel would shelve the riverbed up to the deck for another
     * two and a half metres either side of a bridge that does not cover them. So where there is a
     * river and the crossing's own footprint does not reach, the clamp keeps exactly the band it
     * has always had. `spannedAt` is the authority on where a bridge is; nothing else gets to fill
     * that channel, this included.
     */
    const band = (riverSurface === null || spanned) ? verge : road.path.half;
    if (road.dist < band + deckGrip) {
      const t = smoothstep(band, band + deckGrip, road.dist);
      height = Math.max(height, lerp(deck, height, t));
    }
    return height;
  }

  // ------------------------------------------------------------- where a road really crosses a river

  /**
   * THE CROSSINGS, WORKED OUT FROM THE TWO POLYLINES — NOT FROM THE MAP CELLS.
   *
   * `js/features.js` used to find its bridges by looking for a road CELL that was also a river cell
   * (plus whatever World Forge had already flagged). On the user's own world — seed 4477, Delta
   * Thiakean II — that finds nothing at all, because a cell is 224 m across and both lines are
   * smoothed curves that wander inside their cells: the road passes 2.3 m from the middle of a
   * twelve-metre river and the two never share a cell. So there was no bridge, and the only thing
   * carrying the player over the water was the earth plug the deck clamp left behind.
   *
   * This walks each road every `CROSS_STEP` metres and asks the river index directly. A step counts
   * as a crossing when the road is over the water itself, the deck is genuinely clear above the
   * surface, and the two lines meet at more than about 44 degrees — a road running ALONGSIDE a
   * river is a quay, not a bridge. Consecutive steps are gathered into one crossing.
   *
   * ONE list, two readers: `heightAt` leaves the channel alone inside a crossing's footprint, and
   * `js/features.js` stands its bridge mesh and its deck collider on the very same record.
   */
  const CROSS_STEP = 4;
  /** How far past the deck clamp's own fade a crossing's footprint reaches. See `halfWidth` below. */
  const SPAN_PAD = 0.75;

  /** Would this point be under the river if no road had ever been graded over it? */
  function openChannelAt(x, z, surf) {
    const hit = riverIndex.nearest(x, z);
    if (!hit || hit.dist >= hit.path.reach) return false;
    const s = surfaceOfHit(hit);
    const bed = s - hit.path.depth;
    const natural = naturalHeightAt(x, z);
    const t = smoothstep(hit.path.half, hit.path.reach, hit.dist);
    return Math.min(natural, lerp(bed, natural, t)) < surf;
  }

  /**
   * IS THERE ANY ROAD HERE AT ALL?
   *
   * Round 17. A crossing's footprint is a rectangle drawn along the road's tangent AT THE WATER,
   * and a road bends, merges and ends. `deckGrip + SPAN_PAD` is the same margin the footprint's own
   * half-width uses, so "on the carriageway" means the same thing to the length of a deck as it
   * does to its width. Any road counts, not just the one that walked into the water: two merged
   * lines either side of a junction are one road on the ground, which is the point of the merge.
   */
  function carriagewayAt(x, z) {
    const hit = roadIndex.nearest(x, z);
    return !!hit && hit.dist < hit.path.half + deckGrip + SPAN_PAD;
  }

  /** How far the carriageway runs from a point along a bearing, in metres, up to 140. */
  function roadRunFrom(x, z, tx, tz, sign) {
    let out = 0;
    for (let d = CROSS_STEP; d <= 140; d += CROSS_STEP) {
      if (!carriagewayAt(x + tx * sign * d, z + tz * sign * d)) break;
      out = d;
    }
    return out;
  }

  /**
   * How far a flat plank at `deckY` stays level with the road under it, out to `limit` metres.
   * Never shorter than the plan's own channel, or a bridge would stop short of the water.
   */
  function meshHalf(cx0, cz0, tx, tz, deckY, limit, surf) {
    const LEVEL = 0.8;                            // metres of disagreement a rigid deck can hide
    let out = 0;
    for (let d = CROSS_STEP; d <= limit; d += CROSS_STEP) {
      let ok = true;
      for (const side of [-1, 1]) {
        const hit = roadIndex.nearest(cx0 + tx * side * d, cz0 + tz * side * d);
        if (!hit || hit.dist >= hit.path.reach || Math.abs(surfaceOfHit(hit) - deckY) > LEVEL) { ok = false; break; }
      }
      if (!ok) break;
      out = d;
    }
    const river = riverIndex.nearest(cx0, cz0);
    const channel = river ? river.path.half + 4 : 8;
    return Math.max(out, channel, 6);
  }

  function findCrossings() {
    const out = [];
    for (const path of roadPaths) {
      const pts = path.points;
      if (!pts || pts.length < 2 || !path.surface) continue;
      let run = null;
      const finish = () => {
        if (!run) return;
        // how far the water reaches along the road either side of the run: the bridge has to land
        // on dry ground, not stop at the edge of the plan's own channel
        const mx = (run.sx + run.ex) / 2, mz = (run.sz + run.ez) / 2;
        let back = 0, fwd = 0;
        for (let d = CROSS_STEP; d <= 90; d += CROSS_STEP) {
          if (!openChannelAt(mx - run.tx * d, mz - run.tz * d, run.surf)) break;
          if (!carriagewayAt(mx - run.tx * d, mz - run.tz * d)) break;
          back = d;
        }
        for (let d = CROSS_STEP; d <= 90; d += CROSS_STEP) {
          if (!openChannelAt(mx + run.tx * d, mz + run.tz * d, run.surf)) break;
          if (!carriagewayAt(mx + run.tx * d, mz + run.tz * d)) break;
          fwd = d;
        }
        const ABUTMENT = 7;                       // metres of deck landed on each bank
        /**
         * THE MIDDLE OF A BRIDGE IS OVER THE WATER.
         *
         * `shift` centres the footprint between the two banks, which is right when the two walks
         * above measured the same channel. Round 17 let a road cross at any angle (see the walk
         * below), and a road running at forty degrees is over the water for a long way along its own
         * line — so `fwd` and `back` came back large and lopsided and the shift carried the centre
         * clean out of the river. Measured on seed 7, one crossing's middle ended up 12.1 m from a
         * six-metre channel, which put the bridge mesh on the bank and left the deck clamp to fill
         * the water it was supposed to span.
         *
         * So the shift is only taken as far as it can go while the middle is still over the water.
         */
        const overWater = (x, z) => {
          const hit = riverIndex.nearest(x, z);
          return !!hit && hit.dist <= hit.path.half;
        };
        let shift = (fwd - back) / 2;
        for (let tries = 0; tries < 4 && shift !== 0; tries++) {
          if (overWater(mx + run.tx * shift, mz + run.tz * shift)) break;
          shift /= 2;
          if (Math.abs(shift) < CROSS_STEP / 2) shift = 0;
        }
        const px = mx + run.tx * shift, pz = mz + run.tz * shift;
        /**
         * THE DECK HEIGHT IS THE ROAD AT THE MIDDLE OF THE CROSSING, NOT THE HIGHEST POINT OF IT.
         *
         * The graded surface RAMPS up to a crossing — `rampPerPoint` spreads the lift over the
         * neighbouring road points, which are a fifth of a map cell apart (45 m on the default
         * planet size). Taking the highest deck over the run and laying one flat plank at that
         * height leaves a two-metre ledge where the plank meets the road at each end, which is a
         * wall you walk into rather than a bridge you walk onto. Measured at Pewargate: the road is
         * at 3.30 m thirty-one metres out and the deck was at 5.25.
         */
        const mid = roadIndex.nearest(px, pz);
        const deckY = mid && mid.dist < mid.path.reach ? surfaceOfHit(mid) : run.deck;
        /**
         * …AND THE DECK STOPS WHERE THE ROAD DOES.
         *
         * Round 17. *"The bridge only connects to one side of the road (I think the road just
         * stops)."* It does: `back` and `fwd` above measured how far the WATER reached along the
         * road's tangent and nothing asked whether there was any road out there. A road that ends
         * at the settlement it serves — road 58 on the user's world ends at the exact cell of
         * Feafungate's town node, which is in the middle of a river — let `fwd` run thirty-seven
         * metres past its last point, so the crossing was centred off the end of the carriageway
         * and half the deck landed in an empty field. `roadAt` reads 0.00 at eighteen metres past
         * the abutment and the bridge kept going to thirty-seven.
         *
         * It is also the whole of *"there is a tower inside of the bridge"*. The footprint is a
         * straight rectangle along the crossing's tangent, and `heightAt` opens the channel under
         * every metre of it — so the part that ran past the road was ground that the town planner
         * was perfectly entitled to build on (`roadAt` says 0.00 there) and that the terrain had
         * dug out to the river bed. A tower stood in a bridge because the bridge was somewhere the
         * road was not.
         *
         * So: both walks stop at the end of the carriageway, the centre shifts to sit between what
         * is left, and the abutments are trimmed to the road that has to carry them.
         */
        const roadRun = (sign) => roadRunFrom(px, pz, run.tx, run.tz, sign);
        // never shorter than the water it has to cover, or the deck would stop inside the channel
        const atRiver = riverIndex.nearest(px, pz);
        const channel = (atRiver ? atRiver.path.half : 4) + CROSS_STEP;
        const halfLength = Math.max(
          channel,
          Math.min((back + fwd) / 2 + ABUTMENT, Math.min(roadRun(-1), roadRun(1)) + CROSS_STEP),
        );
        /**
         * THE DECK IS EXACTLY AS WIDE AS THE HOLE IT COVERS.
         *
         * `SPAN_PAD` is not fussiness. The deck clamp fades out over `deckGrip` metres, so a
         * footprint that ends on a knife edge leaves one sample's worth of full-height ground
         * standing along the side of every bridge. But the pad cannot live in `spannedAt` alone
         * either: measured, a road that curves through its crossing puts carriageway up to 0.7 m
         * outside the rectangle, so a pad only `heightAt` knew about carved half a metre of road
         * that the deck did not cover — a strip with no ground and no bridge. One number, stored on
         * the record, used by the hole AND by the mesh AND by the collider.
         */
        const halfWidth = path.half + deckGrip + SPAN_PAD;
        /**
         * TWO ROADS OVER THE SAME WATER ARE ONE BRIDGE — A WIDER ONE.
         *
         * `mergeRoadNetwork` leaves pairs of lines running a couple of metres apart, and both of
         * them walk the same crossing. Dropping the second one was the obvious thing and it was
         * wrong: measured on seed 11, road 6 opened the channel and road 7 — 2.8 m away, not in
         * anybody's footprint — put its own deck clamp straight back across it. The second road's
         * corridor has to be INSIDE the footprint, or it dams what the first one opened.
         */
        /**
         * TWELVE METRES, AND NOT MORE. Round 17 tried widening this to the two footprints' own
         * widths, so that a merged pair of roads eleven metres apart came out as one bridge instead
         * of two with a 17 cm step between their decks. It produced a worse thing: the union of two
         * diverging roads is a deck twenty-seven metres wide and fourteen long, which is a raft, and
         * it declares ground a bridge where neither road goes. Two neighbouring bridges with a hand's
         * breadth between their decks is the better of the two, so the window is left where round 16
         * put it.
         */
        const near = out.find(c => Math.hypot(c.x - px, c.z - pz) < 12);
        if (near) {
          const dx = px - near.x, dz = pz - near.z;
          near.halfLength = Math.max(near.halfLength, Math.abs(dx * near.tx + dz * near.tz) + halfLength);
          /**
           * …AND THE UNION IS STILL CLAMPED TO THE ROAD. Round 17.
           *
           * Growing a footprint to cover both roads is right for the width — that is what stops the
           * second road damming what the first one opened — and it is not right for the LENGTH,
           * because two roads that merge also diverge. On seed 1337 the union ran a deck 29.5 m past
           * the end of one road's carriageway into the wedge between the two, which is the same
           * "a bridge where the road is not" that item 4c was about.
           */
          const nearChannel = (riverIndex.nearest(near.x, near.z)?.path.half ?? 4) + CROSS_STEP;
          near.halfLength = Math.max(nearChannel, Math.min(
            near.halfLength,
            Math.min(roadRunFrom(near.x, near.z, near.tx, near.tz, -1),
              roadRunFrom(near.x, near.z, near.tx, near.tz, 1)) + CROSS_STEP,
          ));
          near.halfWidth = Math.max(near.halfWidth, Math.abs(dx * -near.tz + dz * near.tx) + halfWidth);
          // a deck is never wider than it is long: the width grew to cover a second road and the
          // length was clamped to the first one's carriageway, which between them can describe a
          // raft rather than a bridge
          near.halfLength = Math.max(near.halfLength, near.halfWidth + CROSS_STEP);
          near.deck = Math.max(near.deck, deckY);
          near.meshHalfLength = Math.max(near.meshHalfLength, meshHalf(px, pz, run.tx, run.tz, deckY, halfLength, run.surf));
          run = null;
          return;
        }
        out.push({
          x: px, z: pz,
          // `atan2(dx, dz)` is the standard yaw for a +Z-forward body, which the bridge mesh is
          angle: Math.atan2(run.tx, run.tz),
          tx: run.tx, tz: run.tz,
          surf: run.surf, deck: deckY,
          halfLength,
          /**
           * How long the flat BRIDGE MESH may be, as opposed to the footprint.
           *
           * The footprint is the hole in the ground, and every metre of it has to be covered by
           * something you can stand on — `js/features.js` files a chain of short deck colliders
           * along it that follow the road's own ramp. The mesh is one rigid box, so it is only as
           * long as the stretch where the road is actually level with it; past that the drawn road
           * ribbon (a thick `roadDeck`, see js/water-plan.js) carries the look.
           */
          meshHalfLength: meshHalf(px, pz, run.tx, run.tz, deckY, halfLength, run.surf),
          // The deck is as wide as the ground the old clamp used to hold up, and no wider — that is
          // the corridor the player used to walk across, so nothing they could stand on is lost.
          // `js/features.js` scales the bridge mesh to this too, so what you see is what carries you.
          halfWidth,
          roadHalf: path.half, klass: path.klass, road: path.id,
          river: run.river,
        });
        run = null;
      };
      for (let i = 0; i + 1 < pts.length; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
        const legX = bx - ax, legZ = bz - az;
        const legLen = Math.hypot(legX, legZ);
        if (legLen < 1e-6) continue;
        const tx = legX / legLen, tz = legZ / legLen;
        const steps = Math.max(1, Math.ceil(legLen / CROSS_STEP));
        for (let s = 0; s < steps; s++) {
          const u = s / steps;
          const x = ax + legX * u, z = az + legZ * u;
          const hit = riverIndex.nearest(x, z);
          let over = false;
          /**
           * ROUND 17 — IF THE CARRIAGEWAY IS IN THE WATER, IT NEEDS A BRIDGE. THE ANGLE IS NOT A VETO.
           *
           * `crossesSquarely` used to gate this as well, on the reasoning that a road running
           * alongside a river is a quay rather than a bridge. That reasoning is sound and this was
           * the wrong place for it: the quay in `heightAt` is already guarded by
           * `river.dist >= river.path.half`, which is to say a quay is a thing you build BESIDE the
           * water. Here the test is `dist <= half` — the road is over the water itself — and a road
           * whose middle is in the middle of a river is crossing it at whatever angle it likes.
           *
           * Measured on the user's world, seven of the twenty-four unbridged wet road samples around
           * their town failed on nothing but this: road 63 sat at dist 0.00 of a six-metre river and
           * was called "alongside" because it met the water at 41 degrees. With no crossing recorded
           * the deck clamp raised the ground to the road, which is the plug the user reported.
           */
          if (hit && hit.dist <= hit.path.half) {
            const surf = surfaceOfHit(hit);
            const deckHere = lerp(path.surface[i], path.surface[i + 1], u);
            if (deckHere >= surf + bridgeClearance * 0.6) {
              over = true;
              if (!run) run = { sx: x, sz: z, ex: x, ez: z, tx, tz, surf, deck: deckHere, river: hit.path.id };
              else { run.ex = x; run.ez = z; run.deck = Math.max(run.deck, deckHere); }
            }
          }
          if (!over) finish();
        }
      }
      finish();
    }
    return out;
  }

  const crossings = findCrossings();

  // a coarse bucket grid, so `heightAt` can ask "am I under a bridge?" without walking the list
  const CROSS_BUCKET = 96;
  const crossMap = new Map();
  const crossKey = (bx, bz) => bx * 73856093 ^ bz * 19349663;
  /**
   * How far outside a bridge's footprint anything may still ask about it, in metres.
   *
   * Round 17: `bridgedAt` takes a pad now (a fort is thirty metres across, so its middle clearing
   * the deck proves nothing about its walls), and the bank rim fades over the same distance rather
   * than stopping dead at the edge. Both need the bucket grid to hold a crossing a little way
   * beyond its own rectangle, or the question comes back "no bridge here" from the bucket next door.
   */
  const CROSS_PAD = 16;
  const SPAN_FADE = 8;
  for (const c of crossings) {
    const r = c.halfLength + c.halfWidth + CROSS_PAD;
    for (let bx = Math.floor((c.x - r) / CROSS_BUCKET); bx <= Math.floor((c.x + r) / CROSS_BUCKET); bx++) {
      for (let bz = Math.floor((c.z - r) / CROSS_BUCKET); bz <= Math.floor((c.z + r) / CROSS_BUCKET); bz++) {
        const k = crossKey(bx, bz);
        let list = crossMap.get(k);
        if (!list) crossMap.set(k, list = []);
        list.push(c);
      }
    }
  }

  /**
   * 0 inside a bridge's footprint, 1 at `pad` metres outside it, and smooth in between.
   *
   * The same rectangle `spannedAt` tests, measured rather than answered yes/no, so the ground can
   * come back up to an abutment instead of standing off it in a cliff.
   */
  function spanFade(x, z, pad) {
    if (!crossMap.size || pad <= 0) return 1;
    const list = crossMap.get(crossKey(Math.floor(x / CROSS_BUCKET), Math.floor(z / CROSS_BUCKET)));
    if (!list) return 1;
    let fade = 1;
    for (const c of list) {
      const dx = x - c.x, dz = z - c.z;
      const along = Math.abs(dx * c.tx + dz * c.tz) - c.halfLength;
      const across = Math.abs(dx * -c.tz + dz * c.tx) - c.halfWidth;
      const out = Math.max(along, across);          // <= 0 means inside the footprint
      if (out >= pad) continue;
      const f = out <= 0 ? 0 : out / pad;
      if (f < fade) fade = f;
    }
    return fade;
  }

  /** Is this point inside a bridge's footprint — the rectangle the deck covers? */
  function spannedAt(x, z, pad = 0) {
    if (!crossMap.size) return false;
    const list = crossMap.get(crossKey(Math.floor(x / CROSS_BUCKET), Math.floor(z / CROSS_BUCKET)));
    if (!list) return false;
    for (const c of list) {
      const dx = x - c.x, dz = z - c.z;
      if (Math.abs(dx * c.tx + dz * c.tz) > c.halfLength + pad) continue;
      if (Math.abs(dx * -c.tz + dz * c.tx) > c.halfWidth + pad) continue;
      return true;
    }
    return false;
  }

  /**
   * The water at a point: the sea, or a river running through it.
   * Returns { kind, surface, depth } — depth is how far the bed is below the surface, so a game can
   * ask "can I swim here?" and "how deep is it?" without knowing anything about rivers.
   */
  function waterAt(x, z) {
    /**
     * A RIVER IS AS WIDE AS THE WATER, NOT AS WIDE AS THE PLAN SAID.
     *
     * The user's longest bug report of the round: "on the edges of the river, I fall through the
     * blue water layer and walk on the bottom, until I hit the middle of the river where I pop back
     * on top of the blue layer and equip my raft. I then sink down to the bottom without my raft
     * again on the other side… grass/trees are appearing underwater on the edges… NPCs are walking
     * around underwater in that area too."
     *
     * Every one of those is the same disagreement. The DRAWN sheet (`js/water-plan.js`) is pushed
     * outward per point until the carved bank has climbed back to the water line — that is the real
     * edge of the water, and on the user's world it reaches 26 m past the plan's half-width, four
     * times the width the plan believed in. This test used `half`, the plan's number, so everything
     * between the plan's edge and the real edge was under the blue layer and counted as dry land:
     * no swimming, no boat, trees planted in it and NPCs wading through it.
     *
     * Asking the SAME question the sheet asks — is the ground here below the river's surface, inside
     * the bank — is what makes the two agree. `reach` is where the sheet stops as well, so there is
     * no case left where one says water and the other says land.
     */
    const river = riverIndex.nearest(x, z);
    // R18 — the sub-`EDGE` shoreline sliver, held until the lake and the sea have had their say
    let edgeOfRiver = null;
    // `<=`: the sheet is allowed to reach the top of the bank exactly, so the test has to as well,
    // or there is a one-metre sliver of drawn water standing over "dry" ground at the very edge
    if (river && river.dist <= river.path.reach) {
      // the water that is DRAWN here, ramped along the segment — see `surfaceOfHit`, and round
      // 11's "I walk on the bottom under the blue layer"
      const surface = surfaceOfHit(river);
      const ground = heightAt(x, z);
      /**
       * R18 — A HAND'S BREADTH OF SLACK AT THE WATERLINE, AND NOWHERE ELSE.
       *
       * `waterRibbon` draws one FLAT slab per river point, both of its edges at that point's own
       * height; `waterAt` measures a ramp along the nearest SEGMENT. On a straight reach those are
       * the same number, but on a bend the nearest segment to a spot out near the bank is not the
       * slab that was drawn over it, and the two land a few centimetres apart. Measured on seed 7:
       * 0.10 m, twenty-four metres off the centre line.
       *
       * Before R18 that gap was papered over by a second function answering the HIGHER end of the
       * segment, which was generous enough to cover any bend — and which is exactly what made the
       * surface an 11 m staircase along every river. The slack is explicit now, and constant, so it
       * cannot reappear as a step: a spot within `EDGE` of the sheet counts as water, and the depth
       * is floored at zero so the shoreline sliver is water you cannot swim in rather than dry land
       * with the blue layer drawn over it. Nothing can wade at 0 m (`boardDepth` is 0.55), so this
       * changes what GROWS there and what the sheet agrees with, not how anybody moves.
       */
      const EDGE = 0.25;
      if (surface > ground) {
        return { kind: 'river', surface, depth: surface - ground, path: river.path, dist: river.dist };
      }
      /**
       * The sliver is a FALLBACK, never an answer that wins over real water.
       *
       * Taking it immediately meant an early `return` that skipped the lake and the sea below — so
       * where a river runs into a lake or down to the sea, a spot inside the river's `reach` whose
       * ground sits a few centimetres ABOVE the river surface but metres below the lake's would
       * come back as `{kind:'river', depth:0}`: not wading, not swimming, and the player walks the
       * bottom under a drawn sheet. That is round 11's bug in a narrow band, reintroduced by the
       * slack that was meant to close a different one. It is held here and used at the end instead.
       */
      if (surface + EDGE > ground) edgeOfRiver = { kind: 'river', surface, depth: 0, path: river.path, dist: river.dist };
    }
    // Whether you are IN a lake is the map's own answer for this cell — the blurred field is for
    // shaping the basin, and a one-cell lake blurs away to almost nothing.
    if (anyLake && world.water[IDX(w, cellX(x), cellY(z))] === 2) {
      const surface = lakeLevel[IDX(w, cellX(x), cellY(z))] || lakeSurfaceAt(x / M_PER_CELL, z / M_PER_CELL);
      const ground = heightAt(x, z);
      if (surface > ground) return { kind: 'lake', surface, depth: surface - ground, dist: 0 };
    }
    if (hasSea) {
      const ground = heightAt(x, z);
      if (ground < seaLevel) return { kind: 'sea', surface: seaLevel, depth: seaLevel - ground, dist: 0 };
    }
    // nothing has real depth here, so the shoreline sliver is the honest answer after all
    return edgeOfRiver;
  }

  /** How steep the ground is here: rise over run, sampled across `step` metres. */
  function slopeAt(x, z, step = 3) {
    const l = heightAt(x - step, z), r = heightAt(x + step, z);
    const u = heightAt(x, z - step), d = heightAt(x, z + step);
    return Math.hypot(r - l, d - u) / (2 * step);
  }

  /** The surface normal, for lighting and for sliding down a cliff. */
  function normalAt(x, z, step = 3, out = [0, 1, 0]) {
    const l = heightAt(x - step, z), r = heightAt(x + step, z);
    const u = heightAt(x, z - step), d = heightAt(x, z + step);
    const nx = l - r, ny = 2 * step, nz = u - d;
    const len = Math.hypot(nx, ny, nz) || 1;
    out[0] = nx / len; out[1] = ny / len; out[2] = nz / len;
    return out;
  }

  const biomeIdAt = (x, z) => world.biome[IDX(w, cellX(x), cellY(z))];
  const biomeAt = (x, z) => BIOMES[biomeIdAt(x, z)];
  const temperatureAt = (x, z) => layer(world.temperature, x / M_PER_CELL, z / M_PER_CELL);
  const underwater = (x, z) => !!waterAt(x, z);

  /**
   * CAN ANYTHING GROW HERE?
   *
   * "I found a case where trees and grass were growing underwater in a lake. Obviously they should
   * only grow on the land."
   *
   * `underwater()` answers a question about a POINT — is this exact spot under water — and a lake's
   * drawn sheet is a whole cell wide plus an overlap, so a point just inside the shore reads as dry
   * while the water is visibly over it. Planting asks a stricter question: is this spot clear of
   * every water surface nearby, with a margin. A tree at the water's edge then stands on the bank
   * instead of in the shallows.
   */
  function plantable(x, z, margin = 0.6) {
    if (waterAt(x, z)) return false;
    const ground = heightAt(x, z);
    if (hasSea && ground < seaLevel + margin) return false;
    // any lake whose cell touches this one — the sheet reaches a little past its own cells
    const cx0 = cellX(x), cy0 = cellY(z);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = clamp(cx0 + dx, 0, w - 1), ny = clamp(cy0 + dy, 0, h - 1);
        const level = lakeLevel[IDX(w, nx, ny)];
        if (level && ground < level + margin) return false;
      }
    }
    // …and a river's own surface, which is a smooth line rather than a cell. The whole wetted
    // channel, out to the bank — a seedling two metres from the plan's centre line was still in
    // the water, which is what put grass and trees under the blue layer along every river edge.
    const river = riverIndex.nearest(x, z);
    if (river && river.dist < river.path.reach + 2) {
      // the same number `waterAt` uses — nothing grows under the sheet that is actually drawn
      const surface = surfaceOfHit(river);
      if (ground < surface + margin) return false;
    }
    return true;
  }

  /** 0..1 how much river / road runs through this point, for props, spawns and the tests. */
  function riverAt(x, z) {
    const hit = riverIndex.nearest(x, z);
    if (!hit || hit.dist >= hit.path.reach) return 0;
    return 1 - smoothstep(hit.path.half, hit.path.reach, hit.dist);
  }
  function roadAt(x, z) {
    const hit = roadIndex.nearest(x, z);
    if (!hit || hit.dist >= hit.path.reach) return 0;
    return 1 - smoothstep(hit.path.half, hit.path.reach, hit.dist);
  }

  /**
   * Ground colour at a point, written into `out` as r/g/b in 0..1. The biome colour is the start;
   * steep ground shows rock, high cold ground shows snow, the shoreline shows sand, a river bank
   * shows mud, and a slow noise mottles the flats so a prairie is not one flat green.
   */
  function colorAt(x, z, height = heightAt(x, z), steep = slopeAt(x, z), out = [0, 0, 0]) {
    const id = biomeIdAt(x, z);
    // an id with no colour used to throw and take the frame loop with it
    const base = BIOME_RGB[id] || BIOME_RGB[0];
    let r = base[0], g = base[1], b = base[2];
    if (!isWater(id)) {
      const mottle = (fbm(n3, x * 0.0021, z * 0.0021, { octaves: 2 }) - 0.5) * 0.14;
      r = clamp(r + mottle, 0, 1); g = clamp(g + mottle * 0.9, 0, 1); b = clamp(b + mottle * 0.7, 0, 1);
      const rock = smoothstep(0.32, 0.85, steep);
      if (rock > 0) { r = lerp(r, ROCK_RGB[0], rock); g = lerp(g, ROCK_RGB[1], rock); b = lerp(b, ROCK_RGB[2], rock); }
      const snowStart = 700 + temperatureAt(x, z) * 5200;
      const snow = smoothstep(snowStart, snowStart + 550, height) * (1 - rock * 0.5);
      if (snow > 0) { r = lerp(r, SNOW_RGB[0], snow); g = lerp(g, SNOW_RGB[1], snow); b = lerp(b, SNOW_RGB[2], snow); }
      if (hasSea && height < 9) {
        const sand = (1 - smoothstep(1, 9, height)) * (1 - rock);
        r = lerp(r, SAND_RGB[0], sand); g = lerp(g, SAND_RGB[1], sand); b = lerp(b, SAND_RGB[2], sand);
      }
      // a river drags sand and mud onto its banks
      const bank = riverAt(x, z);
      if (bank > 0) {
        const k = bank * 0.75;
        r = lerp(r, SAND_RGB[0], k); g = lerp(g, SAND_RGB[1], k); b = lerp(b, SAND_RGB[2], k);
      }
    }
    out[0] = r; out[1] = g; out[2] = b;
    return out;
  }

  /** Keep a position on the map. Walk off the edge and you are stopped by the world's rim. */
  /**
   * Keep a position on the planet.
   *
   * **East-west WRAPS; north-south does not.** A world map is an equirectangular projection of a
   * sphere: walking (or flying) far enough east brings you round to the west, exactly as it does on
   * a real planet. It used to clamp both, so you could fly into an invisible wall and stop — which
   * is what "I can reach the edge of the world" was. Latitude still clamps, because the top and the
   * bottom of the map are the poles and there is nothing past them.
   */
  /**
   * Keep a position on the map: longitude wraps, latitude stops at the pole.
   *
   * NOTE THE EARLY RETURN. `((x % widthM) + widthM) % widthM` is not an identity for an x that is
   * already in range — `x + widthM` loses a low bit, and the value comes back about 1e-11 out. 68%
   * of in-range values failed a `wrap(x) === x` check, which is what broke flight: `js/atmos.js`
   * compared its position against this result to decide whether it had hit the edge of the map, so
   * the "bounced off the edge" branch fired on two frames out of three IN THE MIDDLE OF THE MAP,
   * scaling the horizontal velocity by -0.4 about forty-five times a second. The ship hovered, W and
   * S did nothing, and Space was the only control that still worked. It only flew correctly along an
   * exact compass axis, where x never changed and so stayed an exact float.
   */
  function clampToWorld(x, z) {
    const wrapped = (x >= 0 && x < widthM) ? x : ((x % widthM) + widthM) % widthM;
    return [wrapped, clamp(z, 0, depthM)];
  }

  /**
   * The same thing for something that can go OVER THE POLE — which is the whole planet, seamlessly.
   *
   * The map is a rectangle of a sphere: east and west join up, and the top and bottom edges are the
   * two poles. Cross a pole and you come down the other side, half a world round in longitude and
   * facing the way you came. Returns the corrected position and how much to add to a heading.
   */
  function wrapAround(x, z) {
    let nx = x, nz = z, turn = 0;
    if (nz < 0) { nz = -nz; turn = Math.PI; }
    else if (nz > depthM) { nz = depthM - (nz - depthM); turn = Math.PI; }
    nz = clamp(nz, 0, depthM);
    if (turn) nx += widthM / 2;
    nx = (nx >= 0 && nx < widthM) ? nx : ((nx % widthM) + widthM) % widthM;
    return { x: nx, z: nz, turn };
  }

  /**
   * Somewhere sensible to start: dry land, not a cliff, not in a river, and leaning toward a road
   * or a town, because an empty plain is a poor first thing to see.
   */
  /**
   * R17 — DRY GROUND TO WALK ON, NOT A DRY PIXEL TO STAND ON.
   *
   * `spawnPoint` asked `waterAt(x, z)` of the exact spot and nothing around it, which is the same
   * one-point test round 17 replaced everywhere else in the game (`dryFor` in js/features.js, the
   * footprint walk in the town builder). It did not matter much until this round widened the river
   * carve so the water meets its bank — after that, seed 19 put the player fourteen metres from a
   * channel, and two seconds of walking forward ended underwater. The browser suite found it:
   * `round3.spec.js` walks for two seconds and then presses H, and a horse will not be mounted in
   * the water.
   *
   * Twelve metres and eight bearings, which is about two seconds at a walk — the distance a new
   * player covers before they have looked at anything.
   */
  function dryAround(x, z, r = 12) {
    if (waterAt(x, z) || riverAt(x, z) > 0.25) return false;
    for (let a = 0; a < 8; a++) {
      const px = x + Math.cos((a / 8) * Math.PI * 2) * r;
      const pz = z + Math.sin((a / 8) * Math.PI * 2) * r;
      if (waterAt(px, pz) || riverAt(px, pz) > 0.25) return false;
    }
    return true;
  }

  function spawnPoint(rng = makeRng(world.seed)) {
    const towns = (world.nodes || []).filter(n => n.type === 'settlement' || n.type === 'port');

    /**
     * START IN A TOWN.
     *
     * Landing in an empty field with no road and nobody on it is a bad first thirty seconds — and
     * the roads, the shops and the work all radiate out from a settlement, so starting beside one
     * gives a new character somewhere to go. The old code only *preferred* a town (`nearTown` in
     * the score below), which on most seeds put you a couple of kilometres away from one.
     */
    if (towns.length) {
      // the biggest settlement, with a coin-toss among equals so the same world is not always
      // the same doorstep
      const ranked = towns.slice().sort((a, b) => (b.size ?? 1) - (a.size ?? 1));
      const pick = ranked[Math.floor(rng() * Math.min(3, ranked.length))] || ranked[0];
      // stand just outside the buildings, on dry land, looking in
      for (let tries = 0; tries < 60; tries++) {
        const angle = rng() * Math.PI * 2;
        const out = 18 + rng() * 26;
        let [x, z] = clampToWorld(pick.x * M_PER_CELL + Math.cos(angle) * out, pick.y * M_PER_CELL + Math.sin(angle) * out);
        if (!dryAround(x, z)) continue;
        if (slopeAt(x, z, 6) > 0.5) continue;
        return { x, z, height: heightAt(x, z), town: pick.name };
      }
    }

    let best = null, bestScore = -Infinity;
    for (let tries = 0; tries < 400; tries++) {
      const cx = 2 + Math.floor(rng() * (w - 4)), cy = 2 + Math.floor(rng() * (h - 4));
      const i = IDX(w, cx, cy);
      if (world.water[i] !== 0) continue;
      const b = BIOMES[world.biome[i]];
      if (!b || isWater(world.biome[i])) continue;
      let x = cx * M_PER_CELL, z = cy * M_PER_CELL;
      // step off the water if this cell carries a river through it
      const hit = riverIndex.nearest(x, z);
      if (hit && hit.dist < hit.path.reach) {
        const push = hit.path.reach + 12 - hit.dist;
        const pts = hit.path.points;
        const j = Math.min(pts.length - 2, hit.i);
        const dx = pts[j + 1][0] - pts[j][0], dz = pts[j + 1][1] - pts[j][1];
        const len = Math.hypot(dx, dz) || 1;
        x += (-dz / len) * push; z += (dx / len) * push;
        [x, z] = clampToWorld(x, z);
      }
      const height = heightAt(x, z);
      if (hasSea && height < 4) continue;
      if (waterAt(x, z)) continue;
      const steep = slopeAt(x, z, 6);
      let townCells = Infinity;
      for (const t of towns) townCells = Math.min(townCells, Math.hypot(t.x - cx, t.y - cy));
      const nearTown = Number.isFinite(townCells) ? Math.max(0, 1 - townCells / 6) : 0;
      const score = (b.habit ?? 0.3) * 2 - steep * 4 - Math.abs(height - 320) / 2200
        + nearTown * 2.2 + roadAt(x, z) * 1.2 + rng() * 0.25;
      if (score > bestScore) { bestScore = score; best = { x, z, height }; }
    }
    if (!best) best = { x: widthM / 2, z: depthM / 2, height: heightAt(widthM / 2, depthM / 2) };
    return best;
  }

  return {
    world, planet, relief, hasSea, seaLevel, widthM, depthM, metresPerCell: M_PER_CELL,
    width: w, height: h,
    riverPaths, roadPaths, lakes,
    /**
     * Where a road really crosses a river, with the footprint of the deck that spans it.
     * `js/features.js` builds one bridge (mesh + deck collider) per entry; `heightAt` leaves the
     * channel under each one alone. See `findCrossings`.
     */
    crossings,
    /** How many lake cells were pushed out of a settlement's footprint, for the tests. */
    drainedForTowns: drained,
    /** …and how many were a single blue pixel rather than a body of water. */
    drainedTiny: tinyDrained,
    /** How many junction nodes the road merge created, for the tests. */
    roadJunctions: merged.junctions,
    heightAt, naturalHeightAt, slopeAt, normalAt, colorAt, biomeAt, biomeIdAt, temperatureAt,
    underwater, plantable, waterAt, riverAt, roadAt, wrapAround,
    clampToWorld, spawnPoint, layer,

    /**
     * IS THIS POINT UNDER A BRIDGE?
     *
     * `spannedAt` has always decided where `heightAt` leaves a river channel open; round 17 lets
     * everything that puts something on the ground ask the same question. A bridge's footprint is a
     * hole in the terrain with a deck over it, so a house, a wall, a town street, a set piece or a
     * clay bank standing in one is standing in mid-air over a river — which is what the user saw as
     * *"there is a tower inside of the bridge"*. One list, every reader.
     */
    bridgedAt: (x, z, pad = 0) => spannedAt(x, z, pad),

    /** The graded height of the road at a point — already lifted clear of any river. Null off-road. */
    roadSurfaceAt(x, z) {
      const hit = roadIndex.nearest(x, z);
      if (!hit || hit.dist >= hit.path.reach) return null;
      return lerp(hit.path.surface[hit.i], hit.path.surface[Math.min(hit.path.surface.length - 1, hit.i + 1)], hit.t);
    },

    /** The river at a point: how wide, how deep, and where its surface is. Null when there is none. */
    riverInfoAt(x, z) {
      const hit = riverIndex.nearest(x, z);
      if (!hit || hit.dist >= hit.path.reach) return null;
      const surface = lerp(hit.path.surface[hit.i], hit.path.surface[Math.min(hit.path.surface.length - 1, hit.i + 1)], hit.t);
      // the way the river runs here, so a caller can tell "across" from "alongside"
      const pts = hit.path.points, i = Math.min(pts.length - 2, Math.max(0, hit.i));
      const dx = pts[i + 1][0] - pts[i][0], dz = pts[i + 1][1] - pts[i][1];
      const len = Math.hypot(dx, dz) || 1;
      return { half: hit.path.half, width: hit.path.half * 2, depth: hit.path.depth, reach: hit.path.reach, surface, dist: hit.dist, dir: [dx / len, dz / len] };
    },

    /** Map cell under a world position, for the minimap and for "where am I". */
    cellAt: (x, z) => ({ x: cellX(x), y: cellY(z) }),
    /** The region name the player is standing in, when the map named one. */
    regionAt(x, z) {
      if (!world.region || !world.regions?.length) return null;
      const id = world.region[IDX(w, cellX(x), cellY(z))];
      return world.regions[id]?.name || null;
    },
    /** The climate at a point, in the shape worldgen's weather model wants. */
    climateAt(x, z) {
      const fx = x / M_PER_CELL, fy = z / M_PER_CELL;
      const i = IDX(w, cellX(x), cellY(z));
      return {
        temperature: layer(world.temperature, fx, fy),
        moisture: layer(world.moisture, fx, fy),
        elevation: layer(world.elevation, fx, fy),
        biome: world.biome[i], water: world.water[i],
        aura: world.aura?.[i] ?? 0, magic: world.magic?.[i] ?? 0, volcanic: world.volcanic?.[i] ?? 0,
        liquid: world.opts?.liquid ?? 'water',
        archetype: planet?.archetype || world.planet?.archetype || null,
      };
    },
  };
}

/** A plain-language line about where you are, for the HUD. */
/**
 * The line under the place card. It used to lead with the planet's name, which is already the first
 * line of the same card — three lines of wrapped text to say one thing twice.
 */
export function describePlanet(planet, star) {
  const air = planet.atmosphere?.breathable ? 'breathable air' : planet.atmosphere?.density > 0.2 ? 'air you should not breathe' : 'almost no air';
  const g = `${(planet.gravity ?? 1).toFixed(2)} g`;
  return `${planet.archetypeName}, ${g}, ${air} · ${star.name} (${star.className})`;
}
