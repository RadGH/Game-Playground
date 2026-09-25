// The planet contract, and a local stand-in for it.
//
// The universe project owns planets for real. Frontier Foundry only needs this shape:
//
//   planet = { id, name, archetype, biomeMode, resources:[resourceId], rareElements:[id],
//              hazards:[tag], gravity, dayLength, seed }
//   generatePlanetMap(planet) -> a worldgen World
//
// Pass your own { get(id), list(), generateMap(planet) } as `planets` to Game.create and this file
// is never used. Without one, these stubs generate perfectly playable planets on their own.

import { generateWorld } from '../../../worldgen/js/world.js';
import { makeRng, subSeed } from '../../../worldgen/js/noise.js';

/** The ten kinds of world, with the worldgen knobs that make each one look like itself. */
export const ARCHETYPES = {
  temperate:    { name: 'Temperate',     hazards: [], gravity: 1.0, dayLength: 1200, knobs: { temperature: 0.52, rainfall: 0.55, seaLevel: 0.58, method: 'plates' }, biomeMode: 'green' },
  arid:         { name: 'Arid',          hazards: ['duststorm', 'heat'], gravity: 0.9, dayLength: 1500, knobs: { temperature: 0.74, rainfall: 0.18, seaLevel: 0.42, method: 'plates' }, biomeMode: 'desert' },
  frozen:       { name: 'Frozen',        hazards: ['cold', 'blizzard'], gravity: 0.95, dayLength: 1800, knobs: { temperature: 0.12, rainfall: 0.4, seaLevel: 0.5, method: 'plates' }, biomeMode: 'ice' },
  volcanic:     { name: 'Volcanic',      hazards: ['ashfall', 'heat', 'quake'], gravity: 1.1, dayLength: 1000, knobs: { temperature: 0.8, rainfall: 0.25, mountainScale: 0.9, magicStrength: 0.5, seaLevel: 0.45, method: 'plates' }, biomeMode: 'ash' },
  toxic:        { name: 'Toxic',         hazards: ['corrosion', 'spores'], gravity: 1.05, dayLength: 1300, knobs: { temperature: 0.62, rainfall: 0.78, auraStrength: 0.6, auraBalance: 0.8, seaLevel: 0.55, method: 'noise' }, biomeMode: 'blight' },
  verdant:      { name: 'Verdant',       hazards: ['overgrowth'], gravity: 1.0, dayLength: 1150, knobs: { temperature: 0.6, rainfall: 0.85, seaLevel: 0.55, method: 'plates' }, biomeMode: 'jungle' },
  barren:       { name: 'Barren',        hazards: ['radiation', 'vacuumdust'], gravity: 0.7, dayLength: 2200, knobs: { temperature: 0.4, rainfall: 0.05, seaLevel: 0.3, method: 'diamond' }, biomeMode: 'rock' },
  shattered:    { name: 'Shattered',     hazards: ['storm', 'quake', 'radiation'], gravity: 0.8, dayLength: 900, knobs: { temperature: 0.45, rainfall: 0.3, mountainScale: 1.1, mountainSharpness: 0.85, magicStrength: 0.7, seaLevel: 0.4, method: 'archipelago' }, biomeMode: 'shard' },
  oceanic:      { name: 'Oceanic',       hazards: ['squall', 'tide'], gravity: 1.0, dayLength: 1250, knobs: { temperature: 0.58, rainfall: 0.8, seaLevel: 0.8, method: 'archipelago' }, biomeMode: 'water' },
  gas_shrouded: { name: 'Gas-Shrouded',  hazards: ['storm', 'lowlight', 'pressure'], gravity: 1.25, dayLength: 700, knobs: { temperature: 0.5, rainfall: 0.5, seaLevel: 0.5, magicStrength: 0.4, method: 'mixed' }, biomeMode: 'murk' },
};

const RARE_BY_ARCHETYPE = {
  temperate: ['ferrovine'],
  arid: ['glimmer_salt', 'voltaic_ore', 'emberlace'],
  frozen: ['cryonite', 'nullstone', 'brinepearl'],
  volcanic: ['pyrocrystal', 'emberlace', 'helion_gas'],
  toxic: ['xenoplasm', 'helion_gas'],
  verdant: ['ferrovine', 'xenoplasm', 'brinepearl'],
  barren: ['umbral_shale', 'aetherite', 'nullstone', 'emberlace'],
  shattered: ['aetherite', 'voltaic_ore', 'umbral_shale', 'nullstone'],
  oceanic: ['glimmer_salt', 'brinepearl'],
  gas_shrouded: ['voltaic_ore', 'helion_gas'],
};

/**
 * Resources nothing else can substitute for on the road to a rocket. A world that rolled none of
 * them would be a world you can never leave, so makePlanet adds any that are missing and marks
 * them `scarce` - their patches are small and off in a corner, which is a reason to explore
 * rather than a dead run.
 */
export const ROCKET_CHAIN = ['titanium_ore', 'tungsten_ore', 'platinum_ore', 'gold_ore', 'sulfur', 'lithium_ore', 'crude_oil', 'water'];

const SYLL_A = ['Ker', 'Vol', 'Tha', 'Mir', 'Oss', 'Pel', 'Drav', 'Ish', 'Corr', 'Ayl', 'Nim', 'Sorr', 'Ul', 'Zeth', 'Hald'];
const SYLL_B = ['an', 'is', 'ora', 'ex', 'un', 'ath', 'ine', 'ov', 'ar', 'ys', 'eth', 'ul'];
const SUFFIX = ['', ' Prime', ' Minor', ' II', ' III', ' Reach', ' Hollow', ' Deep'];

/** A plain planet name from a seed. Original syllables, no borrowed lore. */
export function planetName(seed) {
  const rng = makeRng(seed);
  return rng.pick(SYLL_A) + rng.pick(SYLL_B) + rng.pick(SUFFIX);
}

/**
 * Build a planet that satisfies the contract. `resourceTable` is data.resources - pass it so the
 * planet only ever lists resources that actually exist.
 */
export function makePlanet({ id, seed, archetype, name, resourceTable = [], tier = 1 } = {}) {
  const rng = makeRng(subSeed(seed ?? 1, 'planet:' + (id ?? '')));
  const keys = Object.keys(ARCHETYPES);
  archetype = archetype || keys[Math.floor(rng() * keys.length)];
  const a = ARCHETYPES[archetype];
  const resources = [];
  for (const r of resourceTable) {
    const f = r.found;
    if (!f || f.exclusive) continue;
    if (f.archetypes && !f.archetypes.includes(archetype)) continue;
    if (rng() < Math.min(1, f.rarity + 0.15)) resources.push(r.id);
  }
  // a world is not playable without iron, stone and coal or biomass
  // every world has to be landable: iron to build with, copper to wire with, stone to build on and
  // coal to burn. Everything else is what makes one planet different from the next.
  for (const must of ['iron_ore', 'copper_ore', 'stone', 'coal']) if (!resources.includes(must)) resources.push(must);
  // and every world has to be leavable: whatever the rocket chain needs that this archetype does
  // not naturally carry turns up anyway, in small patches, marked scarce
  const scarce = [];
  for (const must of ROCKET_CHAIN) {
    if (resources.includes(must)) continue;
    if (!resourceTable.some(x => x.id === must)) continue;
    resources.push(must);
    scarce.push(must);
  }
  // Shuffle before taking one or two. Slicing the pool in order meant anything listed third or
  // later - emberlace on arid, brinepearl on frozen and verdant, nullstone on barren and shattered -
  // could never turn up on any seed, which is a building and a research node nobody would ever see.
  const pool = rng.shuffle([...(RARE_BY_ARCHETYPE[archetype] || [])]);
  const rareElements = pool.slice(0, 1 + (rng() < 0.45 ? 1 : 0)).filter(r => resourceTable.some(x => x.id === r));
  return {
    id: id ?? 'p_' + (seed ?? 1),
    name: name || planetName(subSeed(seed ?? 1, 'name:' + (id ?? ''))),
    archetype, biomeMode: a.biomeMode,
    resources, rareElements, scarce,
    hazards: [...a.hazards],
    gravity: a.gravity, dayLength: a.dayLength,
    tier,
    seed: seed ?? 1,
  };
}

/** The worldgen world for a planet. Same planet always gives the same world. */
export function generatePlanetMap(planet, opts = {}) {
  const a = ARCHETYPES[planet.archetype] || ARCHETYPES.temperate;
  return generateWorld({
    seed: subSeed(planet.seed ?? 1, 'world:' + planet.id),
    width: opts.width ?? 128, height: opts.height ?? 64,
    ...a.knobs, ...opts.knobs,
    settlementDensity: 0, dungeonDensity: 0.2, landmarkDensity: 0.4, history: false,
    onProgress: opts.onProgress ?? null,
  });
}

/** A small star system: one starter world plus a few harder ones. */
export function generateSystem({ seed = 1, count = 5, resourceTable = [] } = {}) {
  const rng = makeRng(subSeed(seed, 'system'));
  const order = ['temperate', 'arid', 'frozen', 'volcanic', 'verdant', 'toxic', 'barren', 'oceanic', 'shattered', 'gas_shrouded'];
  const picked = ['temperate', ...rng.shuffle(order.slice(1)).slice(0, Math.max(0, count - 1))];
  return picked.map((archetype, i) => makePlanet({ id: 'p' + (i + 1), seed: subSeed(seed, 'p' + i), archetype, resourceTable, tier: i + 1 }));
}

/** The default provider Game.create uses when the caller does not pass one. */
export function localPlanets(resourceTable, seed = 1, count = 5) {
  const list = generateSystem({ seed, count, resourceTable });
  const by = Object.fromEntries(list.map(p => [p.id, p]));
  return { list: () => list, get: id => by[id], generateMap: p => generatePlanetMap(p) };
}

// ---------------------------------------------------------------------------- the universe adapter
//
// The universe project describes a planet slightly differently from the contract above: its
// resources and rare elements are objects with camelCase keys, its day length is in hours, and it
// has a few more archetypes than Frontier Foundry has content for. This maps one onto the other, so
// a game can be started straight from a universe planet without either project changing.
//
//   import { generateGalaxy } from '../../../universe/js/galaxy.js';
//   import { generateSystem } from '../../../universe/js/system.js';
//   import { hasSurfaceMap, generatePlanetMap as universeMap } from '../../../universe/js/planetmap.js';
//   const provider = universePlanets(systems, data.resources, { generateMap: universeMap });
//   const game = Game.createSync({ data, planets: provider, planet: provider.list()[0] });

/** universe archetype key -> the nearest Frontier Foundry archetype. */
export const UNIVERSE_ARCHETYPES = {
  barren: 'barren', crystal: 'shattered', desert: 'arid', ice: 'frozen', jungle: 'verdant',
  lava: 'volcanic', living: 'verdant', ocean: 'oceanic', tidalLocked: 'barren', toxic: 'toxic',
  tundra: 'frozen', voidTouched: 'shattered', gasGiant: 'gas_shrouded', iceGiant: 'gas_shrouded',
};

/** universe rare-element key -> our resource id. All twelve have buildings on this side now. */
export const UNIVERSE_RARE = {
  aetherite: 'aetherite', cryonite: 'cryonite', voltaicOre: 'voltaic_ore', pyrocrystal: 'pyrocrystal',
  xenoplasm: 'xenoplasm', umbralShale: 'umbral_shale', glimmerSalt: 'glimmer_salt', ferrovine: 'ferrovine',
  helionGas: 'helion_gas', nullstone: 'nullstone', emberlace: 'emberlace', brinepearl: 'brinepearl',
};

/** universe hazard tag -> ours. */
const UNIVERSE_HAZARDS = {
  heat: 'heat', cold: 'cold', storms: 'storm', toxic: 'corrosion', radiation: 'radiation',
  ash: 'ashfall', dust: 'duststorm', quake: 'quake', pressure: 'pressure', lowlight: 'lowlight',
};

/**
 * Turn a universe planet into one Frontier Foundry can play.
 * The universe's own resource list is four broad categories, so the detailed list is rolled from our
 * resource table the same way makePlanet does - the universe decides the archetype, the rare
 * elements, the hazards, the gravity and the day, and we fill in what is actually in the ground.
 */
export function fromUniversePlanet(up, resourceTable = [], { dayScale = 12 } = {}) {
  const archetype = UNIVERSE_ARCHETYPES[up.archetype] || 'temperate';
  const seed = up.seed ?? 1;
  const base = makePlanet({ id: 'u' + (up.star?.id ?? 0) + '_' + up.id, seed, archetype, name: up.name, resourceTable });
  const rare = (up.rareElements || [])
    .map(r => UNIVERSE_RARE[r.key || r])
    .filter(id => id && resourceTable.some(x => x.id === id));
  const hazards = [...new Set((up.hazards || []).map(h => UNIVERSE_HAZARDS[h] || h))];
  const isMoon = !!up.moon;
  return {
    ...base,
    archetype,
    biomeMode: up.biomeMode || base.biomeMode,
    name: up.name || base.name,
    rareElements: rare.length ? rare : base.rareElements,
    resources: [...new Set([...base.resources, ...rare])],
    hazards: hazards.length ? hazards : base.hazards,
    gravity: up.gravity ?? base.gravity,
    dayLength: Math.max(300, Math.round((up.dayLengthHours ?? 24) * dayScale)),
    tier: 1 + Math.round((up.difficulty ?? 0.5) * 4),
    // a moon is a landing target in its own right; these two fields are the only difference
    moon: isMoon,
    parentId: isMoon ? 'u' + (up.star?.id ?? 0) + '_' + up.parentId : null,
    universe: {
      starId: up.star?.id ?? null,
      planetId: isMoon ? up.parentId : up.id,
      moonId: isMoon ? up.id : null,
      archetype: up.archetype,
    },
  };
}

/**
 * A planet provider backed by universe systems.
 * `systems` is an array of universe system records (or one system). `generateMap` should be the
 * universe's own planetmap.generatePlanetMap where you have it - it is handed the ORIGINAL universe
 * planet, not the adapted one - and falls back to ours otherwise.
 */
export function universePlanets(systems, resourceTable = [], { generateMap = null, landable = null, moons = true } = {}) {
  const list = [], originals = new Map();
  const ok = up => {
    if (up.giant) return false;
    if (landable) return !!landable(up);
    return up.landable !== false;
  };
  const take = up => {
    const p = fromUniversePlanet(up, resourceTable);
    originals.set(p.id, up);
    list.push(p);
  };
  for (const sys of [].concat(systems || [])) {
    for (const up of sys.planets || []) {
      if (ok(up)) take(up);
      // the moons come along even when the planet itself cannot be landed on — the moons of a gas
      // giant are usually the reason to go there at all
      if (moons) for (const um of up.moons || []) if (ok(um)) take(um);
    }
  }
  list.sort((a, b) => a.tier - b.tier);
  const by = Object.fromEntries(list.map(p => [p.id, p]));
  return {
    list: () => list,
    get: id => by[id] || null,
    original: id => originals.get(id) || null,
    generateMap: p => (generateMap ? generateMap(originals.get(p.id) || p) : generatePlanetMap(p)),
  };
}
