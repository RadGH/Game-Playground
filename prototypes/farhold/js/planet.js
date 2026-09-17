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
import { elevationToMetres } from '../../../worldgen/js/relief.js';
import { BIOMES, isWater } from '../../../worldgen/js/biomes.js';
import { makeNoise2D, fbm, subSeed, clamp, lerp, makeRng, smoothstep, blur } from '../../../worldgen/js/noise.js';

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
  M_PER_CELL = Math.max(40, Math.min(2000, Math.round(metres)));
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
export function createSystem({ seed = 1, starClass = null, fillBands = true } = {}) {
  const star = makeStar({ seed: seed >>> 0, classKey: starClass, id: 0 });
  const system = generateSystem(star, { seed: subSeed(seed, 'system'), rareWorlds: 0.55, planets: 0.85 });
  if (fillBands) balanceBands(system);
  return { star, system };
}

/**
 * Make sure every difficulty band has a world in this system.
 *
 * Runs over the landable planets, notes which bands are already represented, and forces the rest
 * onto whichever worlds are furthest from the star — the outer dark is where the hard ones belong,
 * and it keeps the inner system as the place you start.
 */
export function balanceBands(system) {
  const landable = (system.planets || []).filter(p => !p.giant && p.landable !== false);
  if (landable.length < PLANET_BANDS.length) return system;
  const have = new Set();
  for (const p of landable) have.add(bandForPlanet(p).key);
  const missing = PLANET_BANDS.filter(b => !have.has(b.key));
  if (!missing.length) return system;
  // hardest band onto the furthest world
  const byDistance = [...landable].sort((a, b) => (b.orbit?.au ?? 0) - (a.orbit?.au ?? 0));
  for (const band of [...missing].reverse()) {
    const pick = byDistance.find(p => !p.forcedBand);
    if (!pick) break;
    pick.forcedBand = band.key;
  }
  return system;
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

export function chooseLanding(system, { prefer = null, requireHabitable = false } = {}) {
  const solid = system.planets.filter(p => !p.giant && p.landable !== false);
  if (prefer != null) {
    const hit = solid.find(p => p.id === prefer || p.name === prefer);
    if (hit) return hit;
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
} = {}) {
  let usedSeed = seed;
  let star = null, system = null, planet = null;

  for (let i = 0; i <= (habitable ? searchSeeds : 0); i++) {
    usedSeed = seed + i;
    ({ star, system } = createSystem({ seed: usedSeed, starClass }));
    planet = chooseLanding(system, { prefer, requireHabitable: habitable && !prefer });
    if (planet) break;
  }
  // nothing within reach: take the best of the seed the player actually asked for
  if (!planet) {
    usedSeed = seed;
    ({ star, system } = createSystem({ seed, starClass }));
    planet = chooseLanding(system, { prefer });
  }

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
function makePathIndex(paths, bucket = 220) {
  const buckets = new Map();
  const key = (bx, bz) => bx * 73856093 ^ bz * 19349663;
  for (const path of paths) {
    const pts = path.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const seg = { path, i, x1: pts[i][0], z1: pts[i][1], x2: pts[i + 1][0], z2: pts[i + 1][1] };
      // drop the segment into every bucket its bounding box touches, plus a margin for the banks
      const pad = path.reach || 60;
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

  /** The ground before any river or road touched it. */
  function naturalHeightAt(x, z) {
    const fx = x / M_PER_CELL, fy = z / M_PER_CELL;
    const base = elevationToMetres(layer(world.elevation, fx, fy), relief);
    const broken = clamp(layer(world.slope, fx, fy), 0, 1);
    const damp = base < 0 ? 0.3 : 1;
    const coarse = (fbm(n1, x * 0.0055, z * 0.0055, { octaves: 4 }) - 0.5) * (detailFlat + broken * detailRelief) * damp;
    const fine = (fbm(n2, x * 0.016, z * 0.016, { octaves: 3 }) - 0.5) * (detailFine * (1 + broken * 3)) * damp;
    return base + coarse + fine;
  }

  // ---------------------------------------------------------------- rivers and roads as paths
  const toMetres = i => [(i % w) * M_PER_CELL, Math.floor(i / w) * M_PER_CELL];

  // A river's water is about as wide as the map says it is, not as wide as a map cell.
  const riverWidth = width => 7 + (width || 1) * 5;          // metres across the water
  const riverDepth = width => 2.4 + (width || 1) * 1.5;      // metres from surface to bed
  const riverBank = width => riverWidth(width) * 0.5 + 26;   // where the valley meets the land

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
    lakeField[i] = 1;
    anyLake = true;
  }
  if (anyLake) blur(lakeField, w, h, 1);
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
  if (anyLake) {
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
  const roadPaths = (world.roads || []).map(r => {
    const points = smoothPath(r.cells.map(toMetres), 5);
    return {
      kind: 'road', id: r.id, klass: r.class || 'trail', cells: r.cells, bridgeCells: r.bridges || [],
      half: roadWidth(r.class) / 2, reach: roadWidth(r.class) / 2 + 16,
      points, surface: null,
    };
  });
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
    for (let i = 0; i < path.points.length; i++) {
      const [x, z] = path.points[i];
      const hit = riverIndex.nearest(x, z);
      if (!hit || hit.dist >= hit.path.reach) continue;
      const surf = lerp(hit.path.surface[hit.i], hit.path.surface[Math.min(hit.path.surface.length - 1, hit.i + 1)], hit.t);
      lift[i] = Math.max(lift[i], surf + bridgeClearance - smooth[i]);
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
    for (let i = 0; i < path.points.length; i++) {
      const [x, z] = path.points[i];
      let water = -Infinity;
      const cell = IDX(w, cellX(x), cellY(z));
      // A SHORELINE, not a sea lane. Lifting a road clear of the sea is right where the road runs
      // along a coast and the ground is only just under water; doing it where the sea floor is
      // twenty metres down builds a plank across open water with nothing holding it up. Worldgen
      // marks real crossings as bridges, and those already have their own lift above.
      if (hasSea && smooth[i] > seaLevel - (opts.shoreDepth ?? 8)) water = Math.max(water, seaLevel);
      if (lakeLevel[cell]) water = Math.max(water, lakeLevel[cell]);
      if (water > -Infinity) {
        wetFloor[i] = water + roadRide;
        lift[i] = Math.max(lift[i], wetFloor[i] - smooth[i]);
      }
    }
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

  const roadIndex = makePathIndex(roadPaths);

  /** Height along a path at a nearest-point hit. */
  const surfaceOfHit = hit => lerp(hit.path.surface[hit.i], hit.path.surface[Math.min(hit.path.surface.length - 1, hit.i + 1)], hit.t);

  /**
   * Ground height in metres above sea level (or above the datum on a dry world), with the road
   * graded in and the river valley cut.
   */
  function heightAt(x, z) {
    let height = naturalHeightAt(x, z);

    // a road flattens the ground it runs over, and its shoulders blend back into the land
    const road = roadIndex.nearest(x, z);
    if (road && road.dist < road.path.reach) {
      const graded = surfaceOfHit(road);
      const t = smoothstep(road.path.half, road.path.reach, road.dist);   // 0 on the road, 1 off it
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
    if (river && river.dist < river.path.reach) {
      const surface = surfaceOfHit(river);
      const bed = surface - river.path.depth;
      const t = smoothstep(river.path.half, river.path.reach, river.dist);
      const carved = lerp(bed, height, t);
      height = Math.min(height, carved);        // a river only ever cuts down, never fills up
    }
    return height;
  }

  /**
   * The water at a point: the sea, or a river running through it.
   * Returns { kind, surface, depth } — depth is how far the bed is below the surface, so a game can
   * ask "can I swim here?" and "how deep is it?" without knowing anything about rivers.
   */
  function waterAt(x, z) {
    const river = riverIndex.nearest(x, z);
    if (river && river.dist < river.path.half) {
      const surface = surfaceOfHit(river);
      const ground = heightAt(x, z);
      if (surface > ground) return { kind: 'river', surface, depth: surface - ground, path: river.path, dist: river.dist };
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
    return null;
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
    // …and a river's own surface, which is a smooth line rather than a cell
    const river = riverIndex.nearest(x, z);
    if (river && river.dist < river.path.half + 2) {
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
    const base = BIOME_RGB[id];
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
  function clampToWorld(x, z) {
    const wrapped = ((x % widthM) + widthM) % widthM;
    return [wrapped, clamp(z, 0, depthM)];
  }

  /**
   * Somewhere sensible to start: dry land, not a cliff, not in a river, and leaning toward a road
   * or a town, because an empty plain is a poor first thing to see.
   */
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
        if (waterAt(x, z)) continue;
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
    /** How many lake cells were pushed out of a settlement's footprint, for the tests. */
    drainedForTowns: drained,
    heightAt, naturalHeightAt, slopeAt, normalAt, colorAt, biomeAt, biomeIdAt, temperatureAt,
    underwater, plantable, waterAt, riverAt, roadAt,
    clampToWorld, spawnPoint, layer,

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
      return { half: hit.path.half, width: hit.path.half * 2, depth: hit.path.depth, reach: hit.path.reach, surface, dist: hit.dist };
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
export function describePlanet(planet, star) {
  const air = planet.atmosphere?.breathable ? 'breathable air' : planet.atmosphere?.density > 0.2 ? 'air you should not breathe' : 'almost no air';
  const g = `${(planet.gravity ?? 1).toFixed(2)} g`;
  return `${planet.name} — ${planet.archetypeName}, ${g}, ${air}, orbiting ${star.name} (${star.className}).`;
}
