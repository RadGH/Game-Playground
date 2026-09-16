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
import { classify, inFamily, lockBiome, BIOME_FAMILIES } from '../../worldgen/js/biomes.js';
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

// ---------------------------------------------------------------------------- what is on the ground
//
// Which bodies have a liquid surface, which could plausibly be lived on, and what vocabulary names
// their places. World Forge does the work through four knobs (`liquid`, `frame`, `inhabited`,
// `nameTheme`); this table decides them per archetype.
//
//   liquid  'water' — seas, lakes and rivers, as World Forge always drew them
//           'lava'  — the same shapes, but they are molten rock (the card says "rivers of rock")
//           'none'  — no liquid at all: low ground is dry basin, the map edge is land, not ocean
//   settled only the four archetypes with breathable air (system.js marks the same four) — every
//           other body gets landmarks, passes and dungeons, and no towns, roads, ports or borders

const SURFACE = {
  barren: { liquid: 'none', theme: 'dead' },
  ice: { liquid: 'none', theme: 'ice' },               // frozen from pole to pole: nothing flows
  lava: { liquid: 'lava', theme: 'lava' },
  desert: { liquid: 'water', theme: 'desert' },
  ocean: { liquid: 'water', theme: null },
  toxic: { liquid: 'water', theme: 'toxic' },
  tundra: { liquid: 'water', theme: null },
  jungle: { liquid: 'water', theme: null },
  living: { liquid: 'water', theme: null },
  crystal: { liquid: 'none', theme: 'crystal' },
  voidTouched: { liquid: 'none', theme: 'void' },
  tidalLocked: { liquid: 'water', theme: 'twilight' },   // seas and a living twilight ring, but nobody's kingdom
};
const SETTLED = new Set(['living', 'ocean', 'jungle', 'tundra']);

/**
 * What a body's surface is made of, for the map generator.
 * Returns { liquid: 'water'|'lava'|'none', inhabited, theme, frame }.
 * Water needs air to stay liquid: below 0.05 bar a body is dry whatever its archetype says.
 */
export function surfaceOf(body) {
  const s = SURFACE[body?.archetype] || { liquid: 'none', theme: 'dead' };
  const air = body?.atmosphere?.density ?? 0;
  const liquid = s.liquid === 'water' && air < 0.05 ? 'none' : s.liquid;
  // a dry body never borrows a vocabulary that allows water words
  const theme = liquid === 'none' && !['dead', 'ice', 'crystal', 'void'].includes(s.theme) ? 'dead' : s.theme;
  return {
    liquid,
    inhabited: !body?.giant && SETTLED.has(body?.archetype) && liquid === 'water',
    theme,
    frame: liquid === 'none' ? 'land' : 'ocean',
  };
}

/** False for the two giants — there is nothing down there to map. Moons always have a surface. */
export function hasSurfaceMap(planet) { return !!planet && !planet.giant; }

/**
 * How big a moon's map should be. A moon is a small world: half the grid of the planet it orbits,
 * which is a quarter of the cells, so it comes back in about a quarter of the time.
 * Pass the planet's map size; get the moon's back, never smaller than 64×32.
 */
export function moonMapSize({ width = 256, height = 128 } = {}, scale = 0.5) {
  return {
    width: Math.max(64, Math.round(width * scale / 2) * 2),
    height: Math.max(32, Math.round(height * scale / 2) * 2),
  };
}

/** The map size to use for a body: a moon gets the smaller grid, a planet the full one. */
export function mapSizeFor(body, size) { return body?.moon ? moonMapSize(size) : { ...size }; }

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
    // smaller worlds get fewer, smaller provinces (a moon fewer again). `regionScale` lets a game
    // ask for more, smaller ones — Farhold does, because a region you cross in twenty minutes is a
    // level band you are stuck in for twenty minutes.
    regionCount: Math.round(clamp((10 + planet.radius * 14) * (planet.moon ? 0.45 : 1) * (extra.regionScale ?? 1), planet.moon ? 4 : 6, 90)),
    settlementDensity: planet.archetype === 'living' ? 0.6 : planet.archetype === 'jungle' || planet.archetype === 'ocean' || planet.archetype === 'tundra' ? 0.3 : 0.08,
    landmarkDensity: 0.45, dungeonDensity: planet.difficulty * 0.8,
    history: false,
    namegen: extra.namegen ?? null,
  };
  // gravity nudges relief: a low-gravity world holds taller mountains
  opts.mountainScale = clamp((recipe.mountainScale ?? 0.55) * (1.35 - planet.gravity * 0.3), 0.1, 1.2);
  if (planet.tidalLocked) { opts.latitudeBands = 0; opts.polarCaps = 0; }
  // a moon is smaller ground: fewer, chunkier landmasses and almost nobody living on it
  if (planet.moon) {
    opts.landmasses = Math.max(2, Math.round((opts.landmasses ?? 4) * 0.6));
    opts.continentScale = (recipe.continentScale ?? 1) * 1.35;
    opts.settlementDensity = planet.archetype === 'living' ? 0.25 : 0.04;
    opts.dungeonDensity = (planet.difficulty ?? 0.4) * 0.5;
  }
  // what is on the ground: liquid, map frame, whether anyone lives here, and the naming vocabulary.
  // seaLevel stays as it is — on a dry body it is the share of low basin ground below the datum.
  const surface = surfaceOf(planet);
  opts.liquid = surface.liquid;
  opts.frame = surface.frame;
  opts.inhabited = surface.inhabited;
  opts.nameTheme = surface.theme;
  opts.seaLanes = surface.inhabited;
  if (surface.liquid === 'none') { opts.riverDensity = 0; opts.lakeAmount = 0; }
  if (!surface.inhabited) opts.settlementDensity = 0;
  return { ...opts, ...stripSize(extra) };
}

function stripSize(extra) { const o = { ...extra }; delete o.namegen; return o; }

/**
 * A tidally locked world has one hot face and one frozen one, so its climate runs east–west instead
 * of north–south. Worldgen thinks in latitude, so we redo the temperature by longitude afterwards
 * and reclassify. The substellar point sits at the middle of the map, which puts the dark face on
 * the left and right edges, where the map's two sides meet on a sphere.
 *
 * The profile across the map is a raised cosine of the longitude distance from the substellar point:
 *
 *   substellar (map centre)  →  `hot`   — burning, and bone dry
 *   a quarter of the way out →  the twilight ring, which is where anything lives
 *   antistellar (map edges)  →  `cold`  — frozen, ice sheet and sea ice
 *
 * A raised cosine is flat at both ends, so the far face is a whole frozen hemisphere rather than a
 * thin band at the edges, and — because its slope is zero exactly where the map wraps — the seam
 * carries no step at all. That is what used to show up as a white stripe down the 3D sphere.
 */
export function applyTidalLock(world, planet) {
  const w = world.width, h = world.height;
  const K = planet.temperature?.K ?? 280;
  const hot = clamp(0.58 + (K - 240) / 300, 0.62, 0.99);       // the substellar point
  const cold = 0.02;                                           // the far face, always frozen
  const lock = world.opts?.biomeLock && BIOME_FAMILIES[world.opts.biomeLock] ? world.opts.biomeLock : null;

  // one column of climate, worked out once: the map only changes east to west
  const colTemp = new Float32Array(w), colDry = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    const d = Math.abs((x + 0.5) / w - 0.5) * 2;               // 0 at the substellar point, 1 at the dark face
    const s = 0.5 - 0.5 * Math.cos(Math.PI * clamp(d, 0, 1));  // raised cosine: flat at both ends
    colTemp[x] = hot + (cold - hot) * s;
    colDry[x] = clamp(0.28 + d * 1.7, 0.28, 1);                // the burning face keeps no water
  }

  for (let y = 0; y < h; y++) {
    // even on a locked world the poles catch the light at a slant, so they run colder. It also keeps
    // the freezing line a curve rather than a straight column, which is what stops the ice from
    // switching on across a whole column at once.
    const lat = Math.abs((y + 0.5) / h - 0.5) * 2;
    const polar = lat * lat * 0.2;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let t = colTemp[x] - polar;
      if (world.elevation[i] > 0.5) t -= (world.elevation[i] - 0.5) * 2 * 0.3;   // high ground is colder
      // a touch of the ground's own dampness, so the freezing line is ragged instead of ruled
      t -= (world.moisture[i] - 0.5) * 0.04;
      t = clamp(t, 0, 1);
      world.temperature[i] = t;
      const moist = clamp(world.moisture[i] * colDry[x], 0, 1);
      world.moisture[i] = moist;
      const depth = world.water[i] ? (0.5 - world.elevation[i]) / 0.5 : 0;
      if (world.water[i] !== 0 && t < 0.12) { world.biome[i] = 25; continue; }   // the night side ocean freezes
      world.biome[i] = classify({
        elev: world.elevation[i], temp: t, moist, slope: world.slope[i],
        aura: world.aura[i], magic: world.magic[i], water: world.water[i], depth,
        nearOcean: false, volcanic: world.volcanic[i] === 1,
      }, world.opts.biomeVariety ?? 0.6);
      // a single-biome body (a crystal world that also happens to be locked) keeps its family: the
      // reclassify above does not know about biomeLock, and would otherwise grow forest on crystal
      if (lock) world.biome[i] = lockBiome(world.biome[i], lock, { elev: world.elevation[i], slope: world.slope[i], moist });
    }
  }
  world.tidalLocked = true;
  world.lockProfile = { hot, cold, substellarX: w / 2 };
  return world;
}

/**
 * The temperature and the share of frozen ground in each column of a map, west to east — the check
 * that a locked world really is hot in the middle and frozen at both edges, with no column stepping
 * away from its neighbours.
 */
export function columnClimate(world) {
  const w = world.width, h = world.height;
  const temp = new Float32Array(w), ice = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    let t = 0, n = 0;
    for (let y = 0; y < h; y++) {
      const i = y * w + x;
      t += world.temperature[i];
      if (world.biome[i] === 12 || world.biome[i] === 25) n++;
    }
    temp[x] = t / h;
    ice[x] = n / h;
  }
  return { temp, ice };
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
  const key = `${planet.seed}:${width}x${height}:${planet.archetype}:${opts.regionScale ?? 1}`;
  if (!opts.force && cache.has(key)) return cache.get(key);

  const world = generateWorld(planetWorldOpts(planet, { ...opts, width, height }));
  // a tidally locked *planet* keeps one face to its star; a locked moon keeps one face to its
  // planet and still turns under the star, so the hot-face pass is for planets only
  if (planet.tidalLocked && !planet.moon) applyTidalLock(world, planet);
  world.relief = reliefFor(planet);
  world.planet = {
    id: planet.id, name: planet.name, archetype: planet.archetype, seed: planet.seed,
    moon: !!planet.moon, parentId: planet.parentId ?? null,
  };

  cache.set(key, world);
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return world;
}

/**
 * The height scale for a body's map, in metres — what World Forge's cellInfo() reads as
 * `world.relief`. Pure arithmetic on the body record, so a planet or moon reports the same heights
 * every time it is opened.
 *
 * Relief goes as one over gravity: a heavy world pulls its mountains down, a light one lets them
 * stand (our world tops out near 9 km at 1 g; a world at a third of that holds peaks twice as tall).
 * A small seeded wobble keeps two bodies of the same gravity from being identical. Bodies with a
 * real liquid sea measure from sea level and report depth; everything else (airless rock, ice
 * shells, lava plains) measures up and down from a datum.
 */
export function reliefFor(body) {
  const g = Math.max(0.02, body?.gravity ?? 1);
  const rng = makeRng(subSeed((body?.seed ?? 1) >>> 0, 'relief'));
  const wobble = 0.88 + rng() * 0.24;
  const landMetres = Math.round(clamp(8800 * Math.pow(g, -0.72) * wobble, 2400, 26000) / 10) * 10;
  const liquid = surfaceOf(body).liquid === 'water';
  const seaMetres = Math.round(landMetres * (liquid ? 0.85 : 0.45) / 10) * 10;
  return liquid
    ? { landMetres, seaMetres, datum: 'sea', label: 'sea level' }
    : { landMetres, seaMetres, datum: 'datum', label: body?.archetype === 'lava' ? 'the lava plain' : 'datum' };
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
