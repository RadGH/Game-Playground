// Planet → world map. Turns a planet record from system.js into a set of World Forge knobs, then
// into an actual world you can zoom into like any other.
//
//   import { planetWorldOpts, generatePlanetMap, hasSurfaceMap } from './planetmap.js';
//   const opts  = planetWorldOpts(planet, { width: 256, height: 128 });
//   const world = generatePlanetMap(planet);      // cached per planet seed + size
//
// Single-biome planets (ice, lava, desert, barren, toxic, crystal, void-touched) come out locked to
// one biome family via worldgen's `biomeLock` knob, so a lava world is lava all the way round.
// Multi-biome planets (living, ocean, jungle, tundra, tidally locked) get a real climate, and the
// ones with `poles` get ice caps from the `polarCaps` knob.
//
// Gas and ice giants have no surface: `hasSurfaceMap()` is false for them and `generatePlanetMap()`
// returns null. Draw those with texture.js's banded cloud deck instead.

import { generateWorld } from '../../worldgen/js/world.js';
import { classify, inFamily } from '../../worldgen/js/biomes.js';
import { makeRng, subSeed, clamp } from '../../worldgen/js/noise.js';
import { ARCH_BY_KEY } from './system.js';

/** Per-archetype map recipe. Anything not named here falls back to the generator's own defaults. */
const RECIPES = {
  barren: { method: 'diamond', seaLevel: 0.1, rainfall: 0.05, rainShadow: 0.2, mountainScale: 0.7, mountainSharpness: 0.7, hydraulicErosion: 0.08, riverDensity: 0, lakeAmount: 0.1, temperature: 0.45, latitudeBands: 0.3, biomeVariety: 0.2, landmasses: 7, continentScale: 1.5 },
  ice: { method: 'plates', seaLevel: 0.45, rainfall: 0.35, temperature: 0.06, latitudeBands: 0.5, mountainScale: 0.5, hydraulicErosion: 0.15, riverDensity: 0.15, polarCaps: 1, biomeVariety: 0.35 },
  lava: { method: 'mixed', seaLevel: 0.3, rainfall: 0.05, temperature: 0.98, latitudeBands: 0.15, mountainScale: 0.85, mountainSharpness: 0.8, thermalErosion: 1, hydraulicErosion: 0.05, riverDensity: 0.7, lakeAmount: 0.85, magicStrength: 0.6, biomeVariety: 0.3 },
  desert: { method: 'plates', seaLevel: 0.2, rainfall: 0.1, rainShadow: 0.85, temperature: 0.82, mountainScale: 0.6, hydraulicErosion: 0.22, riverDensity: 0.12, lakeAmount: 0.2, biomeVariety: 0.35 },
  ocean: { method: 'archipelago', seaLevel: 0.9, rainfall: 0.85, temperature: 0.56, mountainScale: 0.35, landmasses: 10, continentScale: 1.8, riverDensity: 0.7, biomeVariety: 0.7, polarCaps: 0.45 },
  toxic: { method: 'mixed', seaLevel: 0.3, rainfall: 0.6, temperature: 0.88, mountainScale: 0.5, auraStrength: 0.9, auraBalance: 0.95, riverDensity: 0.4, biomeVariety: 0.4 },
  tundra: { method: 'plates', seaLevel: 0.55, rainfall: 0.42, temperature: 0.24, latitudeBands: 0.9, mountainScale: 0.6, riverDensity: 0.45, polarCaps: 0.75, biomeVariety: 0.6 },
  jungle: { method: 'plates', seaLevel: 0.6, rainfall: 0.95, temperature: 0.82, latitudeBands: 0.55, mountainScale: 0.5, riverDensity: 0.8, lakeAmount: 0.7, biomeVariety: 0.7 },
  living: { method: 'plates', seaLevel: 0.62, rainfall: 0.55, temperature: 0.5, latitudeBands: 0.9, mountainScale: 0.58, riverDensity: 0.6, polarCaps: 0.5, biomeVariety: 0.9, landmasses: 5 },
  crystal: { method: 'voronoi', seaLevel: 0.42, rainfall: 0.3, temperature: 0.35, mountainScale: 0.85, mountainSharpness: 0.9, thermalErosion: 0, hydraulicErosion: 0.05, magicStrength: 1, riverDensity: 0.2, biomeVariety: 0.4 },
  voidTouched: { method: 'noise', seaLevel: 0.4, rainfall: 0.35, temperature: 0.4, mountainScale: 0.7, auraStrength: 1, auraBalance: 1, magicStrength: 0.8, riverDensity: 0.3, biomeVariety: 0.4 },
  tidalLocked: { method: 'plates', seaLevel: 0.55, rainfall: 0.45, temperature: 0.5, latitudeBands: 0, lapseRate: 0.35, mountainScale: 0.6, riverDensity: 0.4, biomeVariety: 0.7 },
};

/** False for the two giants — there is nothing down there to map. */
export function hasSurfaceMap(planet) { return !!planet && !planet.giant; }

/**
 * World Forge knobs for a planet. Deterministic: the same planet always gives the same knob set.
 * extra: { width, height, namegen, ...anything you want to override }
 */
export function planetWorldOpts(planet, extra = {}) {
  const arch = ARCH_BY_KEY[planet.archetype] || ARCH_BY_KEY.barren;
  const recipe = RECIPES[planet.archetype] || {};
  const rng = makeRng(subSeed(planet.seed, 'mapknobs'));

  // a little variation between two planets of the same kind
  const wobble = (v, amt) => +clamp(v + (rng() - 0.5) * amt, 0, 1).toFixed(3);

  const opts = {
    seed: planet.seed >>> 0,
    width: extra.width ?? 256, height: extra.height ?? 128,
    ...recipe,
    seaLevel: clamp((recipe.seaLevel ?? 0.58) + (rng() - 0.5) * 0.1, 0.04, 0.95),
    temperature: wobble(recipe.temperature ?? 0.5, 0.1),
    rainfall: wobble(recipe.rainfall ?? 0.5, 0.12),
    landmasses: recipe.landmasses ?? rng.int(3, 8),
    windDirection: rng.pick(['west', 'east', 'bands']),
    // the planet's own numbers push the climate around
    biomeLock: arch.biomeMode === 'single' ? arch.family : null,
    polarCaps: planet.poles ? (recipe.polarCaps ?? 0.5) * clamp(1.7 - planet.temperature.K / 280, 0.35, 1.5) : (recipe.polarCaps ?? 0) * 0.4,
    palette: arch.palette,
    atmosphereTint: planet.atmosphere.density > 0.08
      ? { color: planet.atmosphere.color, strength: clamp(0.05 + planet.atmosphere.density * 0.1, 0, 0.32) }
      : null,
    // smaller worlds get fewer, smaller provinces
    regionCount: Math.round(clamp(10 + planet.radius * 14, 6, 40)),
    settlementDensity: planet.archetype === 'living' ? 0.6 : planet.archetype === 'jungle' || planet.archetype === 'ocean' || planet.archetype === 'tundra' ? 0.3 : 0.08,
    landmarkDensity: 0.45, dungeonDensity: planet.difficulty * 0.8,
    history: false,
    namegen: extra.namegen ?? null,
  };
  // gravity nudges relief: a low-gravity world holds taller mountains
  opts.mountainScale = clamp((recipe.mountainScale ?? 0.55) * (1.35 - planet.gravity * 0.3), 0.1, 1.2);
  if (planet.tidalLocked) { opts.latitudeBands = 0; opts.polarCaps = 0; }
  return { ...opts, ...stripSize(extra) };
}

function stripSize(extra) { const o = { ...extra }; delete o.namegen; return o; }

/**
 * A tidally locked world has one hot face and one frozen one, so its climate runs east–west instead
 * of north–south. Worldgen thinks in latitude, so we redo the temperature by longitude afterwards
 * and reclassify. The substellar point sits at the middle of the map.
 */
export function applyTidalLock(world, planet) {
  const w = world.width, h = world.height;
  const warm = clamp((planet.temperature.K - 160) / 260, 0.15, 0.95);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const d = Math.abs((x + 0.5) / w - 0.5) * 2;             // 0 at the substellar point, 1 at the dark face
      let t = warm * (1 - Math.pow(d, 1.5)) + 0.02;
      if (world.elevation[i] > 0.5) t -= (world.elevation[i] - 0.5) * 2 * 0.35;
      t = clamp(t, 0, 1);
      world.temperature[i] = t;
      const depth = world.water[i] ? (0.5 - world.elevation[i]) / 0.5 : 0;
      if (world.water[i] !== 0 && t < 0.1) { world.biome[i] = 25; continue; }   // the night side ocean freezes
      world.biome[i] = classify({
        elev: world.elevation[i], temp: t, moist: world.moisture[i], slope: world.slope[i],
        aura: world.aura[i], magic: world.magic[i], water: world.water[i], depth,
        nearOcean: false, volcanic: world.volcanic[i] === 1,
      }, world.opts.biomeVariety ?? 0.6);
    }
  }
  world.tidalLocked = true;
  return world;
}

// ---------------------------------------------------------------------------- cache
// Generating a 256×128 world is half a second, and the viewer flips between planets, so keep the
// last few. Keyed by the planet seed and the grid size, which is everything the map depends on.

const cache = new Map();
const CACHE_MAX = 10;

/**
 * The planet's surface as a World Forge world (null for a gas or ice giant).
 * opts: { width, height, namegen, force, ...knob overrides }
 */
export function generatePlanetMap(planet, opts = {}) {
  if (!hasSurfaceMap(planet)) return null;
  const width = opts.width ?? 256, height = opts.height ?? 128;
  const key = `${planet.seed}:${width}x${height}:${planet.archetype}`;
  if (!opts.force && cache.has(key)) return cache.get(key);

  const world = generateWorld(planetWorldOpts(planet, { ...opts, width, height }));
  if (planet.tidalLocked) applyTidalLock(world, planet);
  world.planet = { id: planet.id, name: planet.name, archetype: planet.archetype, seed: planet.seed };

  cache.set(key, world);
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return world;
}

/** Drop the cache (the viewer calls this when the galaxy is regenerated). */
export function clearMapCache() { cache.clear(); }

/**
 * What share of the land is in one biome family — the check that a single-biome world really is one.
 * Pass the family you locked to (planet.biomeFamily). Water cells are ignored.
 */
export function familyShare(world, family) {
  let land = 0, hit = 0;
  for (let i = 0; i < world.biome.length; i++) {
    if (world.water[i] !== 0) continue;
    land++;
    if (inFamily(world.biome[i], family)) hit++;
  }
  return { land, family, share: land ? hit / land : 0 };
}

/** How many distinct land biomes the surface uses, and how much ice it carries. */
export function mapMix(world) {
  const counts = new Map();
  let land = 0, ice = 0;
  for (let i = 0; i < world.biome.length; i++) {
    const b = world.biome[i];
    if (b === 12 || b === 25) ice++;
    if (world.water[i] !== 0) continue;
    land++;
    counts.set(b, (counts.get(b) || 0) + 1);
  }
  return { land, ice, distinct: counts.size, counts };
}
