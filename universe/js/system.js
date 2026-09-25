// One star's system: planets on orbits, their moons, rings, belts and comets.
//
//   import { generateSystem, ARCHETYPES } from './system.js';
//   const system = generateSystem(star, { seed: star.seed, planets: 0.6, rareChance: 0.2 });
//   system.planets[2].rareElements   // [{ key, name, color, abundance, … }]
//
// Pure data: no DOM, no canvas, safe in node and in a worker. What a planet *looks like* is decided
// here (archetype, biome family, sky colour, hazards); the actual surface map is generated later by
// planetmap.js from the planet's seed, and the sphere texture by texture.js.

import { makeRng, subSeed, clamp, lerp } from '../../worldgen/js/noise.js';
import { orbitTempK, starName } from './stars.js';
import { BASELINE, rareFor } from './elements.js';

// ---------------------------------------------------------------------------- archetypes
//
//  biomeMode  'single' — the whole surface is one kind of ground (planetmap locks the biome family)
//             'multi'  — a real climate with several biomes, ice caps and oceans
//  family     which BIOME_FAMILIES key the surface locks to (null for multi-biome worlds)
//  palette    a PALETTES key in worldgen/js/biomes.js, or null for the normal colours
//  giant      true for the two that have no surface to stand on

export const ARCHETYPES = [
  { key: 'barren', name: 'Barren Rock', biomeMode: 'single', family: 'rock', palette: 'dust', giant: false,
    sky: '#1a1c22', sea: null, atmosphere: { type: 'none', density: [0, 0.06], color: '#7a808c' },
    hazards: ['radiation', 'cold'], difficulty: 0.35, poles: false, landable: true, tempK: [90, 620],
    radius: [0.3, 1.1], albedo: 0.13, resourceBias: { metals: 1.4, stone: 1.5, waterIce: 0.15, gas: 0.1 },
    tags: ['dead', 'mining'], blurb: 'cratered rock with no air worth the name. Easy to land on, nothing to breathe.' },

  { key: 'ice', name: 'Ice World', biomeMode: 'single', family: 'ice', palette: null, giant: false,
    sky: '#243448', sea: '#2a4a68', atmosphere: { type: 'thin nitrogen', density: [0.02, 0.3], color: '#bcd8ef' },
    hazards: ['cold'], difficulty: 0.45, poles: true, landable: true, tempK: [40, 235],
    radius: [0.4, 1.3], albedo: 0.62, resourceBias: { metals: 0.6, stone: 0.9, waterIce: 1.8, gas: 0.5 },
    tags: ['cold', 'water'], blurb: 'frozen from pole to pole. Under kilometres of ice there may be an ocean.' },

  { key: 'lava', name: 'Lava World', biomeMode: 'single', family: 'lava', palette: 'lava', giant: false,
    sky: '#3a1208', sea: '#ff5a18', atmosphere: { type: 'sulphur haze', density: [0.2, 1], color: '#d4762e' },
    hazards: ['heat', 'toxic', 'storms'], difficulty: 0.85, poles: false, landable: true, tempK: [700, 2200],
    radius: [0.5, 1.5], albedo: 0.08, resourceBias: { metals: 1.6, stone: 1.2, waterIce: 0.02, gas: 0.6 },
    tags: ['hot', 'volcanic'], blurb: 'the crust has not finished cooling. Rivers of rock, and a sky full of ash.' },

  { key: 'desert', name: 'Desert World', biomeMode: 'single', family: 'desert', palette: 'rust', giant: false,
    sky: '#c99a62', sea: '#5a6f52', atmosphere: { type: 'carbon dioxide', density: [0.1, 0.8], color: '#d8a86a' },
    hazards: ['heat', 'storms'], difficulty: 0.5, poles: false, landable: true, tempK: [250, 460],
    radius: [0.5, 1.4], albedo: 0.28, resourceBias: { metals: 1.1, stone: 1.3, waterIce: 0.2, gas: 0.5 },
    tags: ['hot', 'dry'], blurb: 'dust to the horizon in every direction, cut by canyons that were rivers once.' },

  { key: 'ocean', name: 'Ocean World', biomeMode: 'multi', family: 'ocean', palette: null, giant: false,
    sky: '#6fa8d8', sea: '#12507e', atmosphere: { type: 'nitrogen and oxygen', density: [0.5, 1.3], color: '#a8d4f0' },
    hazards: ['storms'], difficulty: 0.4, poles: true, landable: true, tempK: [255, 330],
    radius: [0.7, 1.7], albedo: 0.3, resourceBias: { metals: 0.7, stone: 0.7, waterIce: 1.9, gas: 1.0 },
    tags: ['water', 'life'], blurb: 'one ocean with islands in it. Everything anyone builds here floats or is anchored.' },

  { key: 'gasGiant', name: 'Gas Giant', biomeMode: 'single', family: null, palette: null, giant: true,
    sky: '#c8a878', sea: null, atmosphere: { type: 'hydrogen and helium', density: [1, 1], color: '#d8b888' },
    hazards: ['storms', 'radiation'], difficulty: 0.7, poles: false, landable: false, tempK: [60, 700],
    radius: [4, 13], albedo: 0.45, resourceBias: { metals: 0.1, stone: 0.05, waterIce: 0.3, gas: 2.0 },
    tags: ['giant', 'gas'], blurb: 'banded cloud decks and a storm that has been running for centuries. No ground at all.' },

  { key: 'iceGiant', name: 'Ice Giant', biomeMode: 'single', family: null, palette: null, giant: true,
    sky: '#6fb0c8', sea: null, atmosphere: { type: 'hydrogen, helium and methane', density: [1, 1], color: '#7fc4dc' },
    hazards: ['cold', 'storms'], difficulty: 0.65, poles: false, landable: false, tempK: [40, 200],
    radius: [3, 7], albedo: 0.5, resourceBias: { metals: 0.15, stone: 0.1, waterIce: 1.2, gas: 1.8 },
    tags: ['giant', 'gas', 'cold'], blurb: 'a smaller, colder giant, blue-green with methane. Its moons are the prize, not the planet.' },

  { key: 'toxic', name: 'Toxic World', biomeMode: 'single', family: 'toxic', palette: 'toxic', giant: false,
    sky: '#8a7a2e', sea: '#4a5c1c', atmosphere: { type: 'carbon dioxide and sulphur', density: [1.2, 4], color: '#c2b45a' },
    hazards: ['toxic', 'heat', 'storms'], difficulty: 0.8, poles: false, landable: true, tempK: [330, 760],
    radius: [0.6, 1.4], albedo: 0.7, resourceBias: { metals: 0.9, stone: 1.0, waterIce: 0.1, gas: 1.4 },
    tags: ['hot', 'poison'], blurb: 'a thick, hot, acid sky that hides the whole surface. Suits last about a day.' },

  { key: 'tundra', name: 'Tundra World', biomeMode: 'multi', family: 'tundra', palette: null, giant: false,
    sky: '#8fa8bc', sea: '#2a5470', atmosphere: { type: 'nitrogen and oxygen', density: [0.4, 1.0], color: '#b8cfe0' },
    hazards: ['cold', 'storms'], difficulty: 0.5, poles: true, landable: true, tempK: [225, 275],
    radius: [0.6, 1.4], albedo: 0.42, resourceBias: { metals: 1.0, stone: 1.0, waterIce: 1.4, gas: 0.8 },
    tags: ['cold', 'life'], blurb: 'cold but not hostile: frozen ground, low scrub, a short hard summer.' },

  { key: 'jungle', name: 'Jungle World', biomeMode: 'multi', family: 'jungle', palette: null, giant: false,
    sky: '#7fc8b0', sea: '#116a62', atmosphere: { type: 'nitrogen, oxygen and water', density: [0.8, 1.6], color: '#9fe0c8' },
    hazards: ['toxic', 'heat', 'storms'], difficulty: 0.55, poles: false, landable: true, tempK: [285, 325],
    radius: [0.7, 1.5], albedo: 0.22, resourceBias: { metals: 0.7, stone: 0.8, waterIce: 1.5, gas: 1.1 },
    tags: ['hot', 'wet', 'life'], blurb: 'wet, green and crowded. Everything grows fast and most of it bites.' },

  { key: 'living', name: 'Living World', biomeMode: 'multi', family: null, palette: null, giant: false,
    sky: '#7fb4e8', sea: '#14548a', atmosphere: { type: 'nitrogen and oxygen', density: [0.7, 1.2], color: '#a8d0f4' },
    hazards: [], difficulty: 0.2, poles: true, landable: true, tempK: [265, 305],
    radius: [0.8, 1.3], albedo: 0.31, resourceBias: { metals: 1.0, stone: 1.0, waterIce: 1.3, gas: 1.0 },
    tags: ['life', 'rare', 'settle'], blurb: 'oceans, ice caps, forest and desert on the same globe, and air you can breathe. Rare enough that finding one is news.' },

  { key: 'crystal', name: 'Crystal World', biomeMode: 'single', family: 'crystal', palette: 'crystal', giant: false,
    sky: '#6a5aa8', sea: '#3a4aa0', atmosphere: { type: 'thin argon', density: [0.05, 0.4], color: '#b4a8f0' },
    hazards: ['radiation', 'cold'], difficulty: 0.7, poles: false, landable: true, tempK: [120, 400],
    radius: [0.4, 1.2], albedo: 0.55, resourceBias: { metals: 0.8, stone: 1.4, waterIce: 0.4, gas: 0.3 },
    tags: ['exotic', 'mining'], blurb: 'the ground grew instead of settling: fields of faceted rock that ring when you walk on them.' },

  { key: 'voidTouched', name: 'Void-Touched', biomeMode: 'single', family: 'void', palette: 'void', giant: false,
    sky: '#1a1228', sea: '#2a1c44', atmosphere: { type: 'ionised dust', density: [0.05, 0.6], color: '#6a4a9a' },
    hazards: ['radiation', 'toxic', 'cold'], difficulty: 0.95, poles: false, landable: true, tempK: [80, 420],
    radius: [0.4, 1.3], albedo: 0.06, resourceBias: { metals: 0.9, stone: 1.1, waterIce: 0.2, gas: 0.4 },
    tags: ['exotic', 'dangerous'], blurb: 'light behaves oddly here and instruments disagree with each other. Crews that stay too long come back wrong.' },

  { key: 'tidalLocked', name: 'Tidally Locked', biomeMode: 'multi', family: null, palette: null, giant: false,
    sky: '#b06a4a', sea: '#2a4460', atmosphere: { type: 'carbon dioxide and nitrogen', density: [0.2, 1.0], color: '#c08a6a' },
    hazards: ['heat', 'cold', 'storms'], difficulty: 0.6, poles: false, landable: true, tempK: [200, 420],
    radius: [0.5, 1.4], albedo: 0.25, resourceBias: { metals: 1.2, stone: 1.2, waterIce: 0.7, gas: 0.7 },
    tags: ['locked', 'extreme'], blurb: 'one face always burning, one always frozen. Everything lives in the ring of twilight between them.' },
];

export const ARCH_BY_KEY = Object.fromEntries(ARCHETYPES.map(a => [a.key, a]));
export const ARCHETYPE_KEYS = ARCHETYPES.map(a => a.key);

export const SYSTEM_DEFAULTS = {
  seed: 1,
  planets: 0.55,          // 0 … 1 — how full the system is, inside the star class's own range
  moonChance: 0.55,       // how readily a planet keeps moons
  ringChance: 0.28,       // rings on a planet that could have them
  beltChance: 0.55,       // an asteroid belt somewhere in the system
  cometChance: 0.5,       // a few long-period comets
  rareWorlds: 0.5,        // 0 … 1 — how often crystal / void-touched / living worlds turn up
  hazardLevel: 0.5,       // scales every hazard tag and the difficulty number
  rareDensity: 0.5,       // 0 … 1 — how often a planet carries a second rare element
  namegen: null,
  nameRace: null,         // which Name Forge language names the planets
};

const NUMERAL = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const MOON_LETTER = 'abcdefgh';

// ---------------------------------------------------------------------------- orbit spacing
//
// Orbits step outwards on a Titius–Bode style ladder: each one is a fixed *ratio* wider than the
// last, never a fixed distance. These are the floors on that ratio, so two planets can never come
// out on rings that nearly touch — 1.5× inside the frost line is roughly Venus → Earth → Mars, and
// past the frost line the real gaps are wider still (Jupiter → Saturn is 1.83×).

export const MIN_ORBIT_RATIO = 1.5;         // inside the frost line
export const MIN_ORBIT_RATIO_OUTER = 1.7;   // past it

/**
 * The next rung on the ladder. Never closer than the floor above, whatever the roll says.
 * Rounded *up* to four decimals so the stored numbers keep the invariant too — rounding an orbit
 * down is what used to let two rings drift a percent or two closer than the floor.
 */
export function nextOrbitAu(au, rng, beyondFrost = false) {
  const min = beyondFrost ? MIN_ORBIT_RATIO_OUTER : MIN_ORBIT_RATIO;
  const step = rng.range(min, beyondFrost ? 2.4 : 2.0);
  return Math.ceil(au * Math.max(min, step) * 1e4) / 1e4;
}

/** The ratio between each orbit and the one inside it — the check that the ladder held. */
export function orbitRatios(system) {
  const aus = (system.planets || []).map(p => p.orbit.au);
  return aus.slice(1).map((au, i) => au / aus[i]);
}

// ---------------------------------------------------------------------------- helpers

/** Which archetype a rocky planet of this temperature should be, before the rare rolls. */
function rockyArchetype(rng, tempK, o, ctx) {
  const rare = clamp(o.rareWorlds, 0, 1);
  // exotics can turn up anywhere, but they are meant to be uncommon
  if (rng() < 0.05 * rare) return 'crystal';
  if (rng() < 0.035 * rare) return 'voidTouched';
  // nothing lives around a corpse: a neutron star or a black hole leaves cold, scoured rock
  if (ctx.dead) return rng() < 0.45 ? 'barren' : rng() < 0.6 ? 'ice' : rng() < 0.5 ? 'voidTouched' : 'crystal';
  if (ctx.locked) return 'tidalLocked';

  if (tempK > 720) return rng() < 0.72 ? 'lava' : 'toxic';
  if (tempK > 470) return rng() < 0.45 ? 'toxic' : rng() < 0.5 ? 'lava' : 'desert';
  if (tempK > 340) return rng() < 0.6 ? 'desert' : rng() < 0.5 ? 'toxic' : 'barren';
  if (tempK > 255) {
    // the interesting band — this is the only place a living world can happen
    if (ctx.inZone && rng() < 0.27 * (0.5 + rare)) return 'living';
    const r = rng();
    if (r < 0.32) return 'ocean';
    if (r < 0.56) return 'jungle';
    if (r < 0.74) return 'desert';
    if (r < 0.9) return 'tundra';
    return 'barren';
  }
  if (tempK > 215) return rng() < 0.45 ? 'tundra' : rng() < 0.5 ? 'ice' : 'barren';
  if (tempK > 150) return rng() < 0.55 ? 'ice' : 'barren';
  return rng() < 0.7 ? 'ice' : 'barren';
}

/**
 * Baseline four + one or two rare elements, with abundances.
 * extra: { scale } multiplies every abundance (a moon holds less of everything than a planet),
 *        { twoChance } scales the odds of a second rare element.
 */
function resourcesFor(rng, arch, o, { scale = 1, twoChance = 1 } = {}) {
  const bias = arch.resourceBias;
  const resources = BASELINE.map(b => ({
    key: b.key, name: b.name, color: b.color, tags: b.tags,
    abundance: +clamp((0.15 + rng() * 0.6) * (bias[b.key] ?? 1) * scale, 0.01, 1).toFixed(2),
  }));
  const pool = rareFor(arch.key);
  const rares = [];
  if (pool.length) {
    const first = rng.weighted(pool, e => e.weight);
    rares.push(first);
    const wantTwo = rng() < (0.18 + clamp(o.rareDensity, 0, 1) * 0.5) * twoChance;
    if (wantTwo && pool.length > 1) {
      const rest = pool.filter(e => e !== first);
      rares.push(rng.weighted(rest, e => e.weight));
    }
  }
  const rareElements = rares.map(e => ({
    key: e.key, name: e.name, color: e.color, tags: e.tags, value: e.value, blurb: e.blurb,
    abundance: +clamp((0.05 + rng() * 0.45 * (0.6 + clamp(o.rareDensity, 0, 1))) * scale, 0.02, 1).toFixed(2),
  }));
  return { resources, rareElements };
}

// ---------------------------------------------------------------------------- moons
//
// A moon is a small planet, not a decoration: it gets an archetype, a temperature, resources, a
// stable id and its own seed, so planetmap.js will build it a (smaller) surface map and texture.js
// will skin it, exactly as they do for a planet.
//
// Only four kinds of moon exist, which is about what the real ones look like:
//   barren  — airless rock, the default
//   ice     — anything cold, and most of what orbits a giant
//   lava    — squeezed by a giant it orbits close in; volcanic, never cold
//   living  — rare, and only a big moon of a giant inside the star's water zone

const MOON_ARCHETYPES = ['barren', 'ice', 'lava', 'living'];

const MOON_NAMES = { barren: 'Barren Moon', ice: 'Ice Moon', lava: 'Volcanic Moon', living: 'Living Moon' };

const MOON_BLURB = {
  barren: 'a dead rock locked to the world it circles. Dust, craters, and a sky with no air in it.',
  ice: 'ice the whole way round, hard as rock at this temperature, with the parent world filling half the sky.',
  lava: 'kneaded by the world it orbits until the inside never cools. Sulphur plains and standing fountains of rock.',
  living: 'a moon big enough to hold its own air, in the one band where that air stays warm. Vanishingly rare.',
};

/** Which of the four kinds a moon of this size, at this temperature, ends up being. */
export function moonArchetype(rng, { radius, tempK, inZone, tidal = 0, dead = false, rareWorlds = 0.5 }) {
  if (dead) return rng() < 0.6 ? 'ice' : 'barren';
  if (tidal > 0.55 && rng() < 0.55) return 'lava';
  // the rare one: a big moon (so it can hold air), where the sunlight is right for water. In
  // practice that means a large moon of a giant that sits in or near the star's water zone.
  const warm = tempK >= 250 && tempK <= 330;
  if (radius >= 0.25 && (inZone || warm) && warm && rng() < 0.12 + clamp(rareWorlds, 0, 1) * 0.2) return 'living';
  if (tempK > 500) return rng() < 0.6 ? 'lava' : 'barren';
  if (tempK < 230) return rng() < 0.7 ? 'ice' : 'barren';
  return rng() < 0.22 ? 'ice' : 'barren';
}

/** Moons for a planet. Big planets keep more of them; the giants keep a lot. */
function moonsFor(rng, planet, o, star) {
  const parentArch = ARCH_BY_KEY[planet.archetype];
  const base = parentArch.giant ? rng.int(2, 7) : planet.radius > 0.9 ? rng.int(0, 2) : rng.int(0, 1);
  const count = rng() < clamp(o.moonChance, 0, 1) ? base : Math.min(base, parentArch.giant ? 2 : 0);
  const moons = [];
  let distance = 2.2;
  for (let i = 0; i < count; i++) {
    // its own seed, from the planet's, so a moon's map is the same every time it is opened
    const mseed = subSeed(planet.seed, 'moon' + i);
    const mrng = makeRng(mseed);
    // never smaller than about 300 km across: below that there is no ground worth mapping
    const radius = +Math.max(0.05, planet.radius * mrng.range(0.06, 0.28)).toFixed(3);
    distance = +(distance + mrng.range(1.3, 2.6) + mrng()).toFixed(2);       // in planet radii
    const periodDays = +(distance * mrng.range(0.4, 1.6)).toFixed(2);

    // a giant squeezes the moons that orbit it close in, and that heat is all their own
    const tidal = parentArch.giant && distance < 6 ? +clamp((6 - distance) / 5 * mrng.range(0.4, 1.2), 0, 1).toFixed(2) : 0;
    const sunK = orbitTempK(star.lum, planet.orbit.au, 0.2, 0) + tidal * 320;
    const key = moonArchetype(mrng, {
      radius, tempK: star.radiation ? 80 : sunK, inZone: planet.orbit.inZone, tidal,
      dead: !!star.radiation, rareWorlds: o.rareWorlds,
    });
    const arch = ARCH_BY_KEY[key];

    let K = orbitTempK(star.lum, planet.orbit.au, arch.albedo, 0) + tidal * 320;
    if (star.radiation) K = Math.min(K, 90);
    K = clamp(K, arch.tempK[0], arch.tempK[1]);

    // small worlds hold almost nothing above them; only the rare living moon keeps real air
    const dens = arch.atmosphere.density;
    const thin = key === 'living' ? 1 : clamp(radius * 1.1, 0.03, 0.7);
    const atmDensity = +clamp(mrng.range(dens[0], dens[1]) * thin, 0, 4).toFixed(2);
    const density = key === 'ice' ? mrng.range(0.4, 0.7) : mrng.range(0.7, 1.15);
    const gravity = +clamp(radius * density, 0.01, 4.5).toFixed(2);

    const { resources, rareElements } = resourcesFor(mrng, arch, o, {
      scale: +clamp(0.35 + radius * 0.7, 0.3, 0.9).toFixed(2), twoChance: 0.35,
    });
    const hazards = [...arch.hazards];
    if (star.radiation) hazards.push('radiation');
    if (atmDensity < 0.05) hazards.push('radiation');
    if (K > 420 && !hazards.includes('heat')) hazards.push('heat');
    if (K < 200 && !hazards.includes('cold')) hazards.push('cold');
    if (clamp(o.hazardLevel, 0, 1) < 0.25) hazards.length = Math.min(hazards.length, 1);

    const tidalLocked = mrng() < 0.85;
    moons.push({
      // a small planet, with the fields planetmap.js and texture.js read
      id: `${planet.id}m${i}`, seed: mseed, index: i, moon: true,
      parentId: planet.id, parentName: planet.name,
      name: `${planet.name} ${MOON_LETTER[i] || i}`,
      archetype: key, archetypeName: MOON_NAMES[key] || `${arch.name} Moon`, blurb: MOON_BLURB[key] || arch.blurb,
      kind: key === 'living' ? 'living' : key,       // the old field, still read by the 3D models
      star: { id: star.id, name: star.name, classKey: star.classKey, color: star.color, lum: star.lum, frostLine: star.frostLine, habitable: star.habitable },
      orbit: {
        au: planet.orbit.au, aroundPlanet: distance, periodDays,
        inZone: planet.orbit.inZone, beyondFrost: planet.orbit.beyondFrost,
      },
      distance, periodDays,                          // the old fields, still read by the 3D models
      radius, gravity, mass: +(Math.pow(radius, 3) * density).toFixed(6),
      dayLengthHours: tidalLocked ? +(periodDays * 24).toFixed(1) : +mrng.range(9, 60).toFixed(1),
      tidalLocked, axialTilt: +mrng.range(0, 8).toFixed(1),
      atmosphere: { type: atmDensity < 0.02 ? 'none' : arch.atmosphere.type, density: atmDensity, color: arch.atmosphere.color, breathable: key === 'living' && atmDensity > 0.5 },
      temperature: { K: Math.round(K), C: Math.round(K - 273.15), label: tempLabel(K) },
      biomeMode: arch.biomeMode, biomeFamily: arch.family, palette: arch.palette,
      poles: arch.poles === true && K < 320,
      skyColor: arch.sky, seaColor: arch.sea,
      color: key === 'ice' ? '#cfe0ea' : key === 'lava' ? '#8a4630' : key === 'living' ? '#7fa06a' : '#8f8a82',
      giant: false, landable: true,
      tidalHeat: tidal,
      resources, rareElements, hazards: [...new Set(hazards)],
      difficulty: +clamp(arch.difficulty * (0.6 + clamp(o.hazardLevel, 0, 1) * 0.8) * 0.9 + (star.radiation ? 0.15 : 0), 0.05, 1).toFixed(2),
      tags: ['moon', ...arch.tags, ...(planet.orbit.inZone ? ['habitable zone'] : [])],
      moons: [], rings: null,
    });
  }
  return moons;
}

/** Every moon in a system, flat, with its parent — for a travel list or a test. */
export function moonsOf(system) {
  return (system?.planets || []).flatMap(p => (p.moons || []).map(m => ({ moon: m, parent: p })));
}

/** Find one moon by its id (`"<planetId>m<index>"`). */
export function moonById(system, id) {
  for (const p of system?.planets || []) for (const m of p.moons || []) if (m.id === id) return m;
  return null;
}

/** Rings: gas giants most often, a big rocky world occasionally. */
function ringsFor(rng, planet, o) {
  const arch = ARCH_BY_KEY[planet.archetype];
  const chance = clamp(o.ringChance, 0, 1) * (arch.giant ? 1.6 : planet.radius > 1.0 ? 0.45 : 0.15);
  if (rng() > chance) return null;
  const inner = +rng.range(1.4, 1.9).toFixed(2);
  return {
    inner, outer: +(inner + rng.range(0.5, 1.8)).toFixed(2),
    color: rng.pick(['#d8c8a8', '#bcc8d4', '#c8b0a0', '#a8b8c0', '#e0d0b8']),
    opacity: +rng.range(0.35, 0.85).toFixed(2),
    gaps: rng.int(0, 3),
    tilt: +rng.range(-0.5, 0.5).toFixed(2),
  };
}

/**
 * Roll a name until it is one nothing else in this system answers to.
 * `roll(t)` is tried for t = 0…4; `fallback` is used if they all collide (a number is appended if
 * even that is taken, so the result is unique whatever happens).
 */
function uniqueName(used, roll, fallback) {
  for (let t = 0; t < 5; t++) {
    const n = roll(t);
    if (!used.has(n)) { used.add(n); return n; }
  }
  let n = fallback, k = 2;
  while (used.has(n)) n = `${fallback} ${k++}`;
  used.add(n);
  return n;
}

/** A readable temperature label, so a UI does not have to do the sums. */
function tempLabel(K) {
  if (K > 1200) return 'molten';
  if (K > 700) return 'furnace';
  if (K > 440) return 'scorching';
  if (K > 330) return 'baking';
  if (K > 290) return 'hot';
  if (K > 265) return 'temperate';
  if (K > 230) return 'cold';
  if (K > 150) return 'frozen';
  return 'bitter';
}

// ---------------------------------------------------------------------------- the generator

/**
 * Build a star's system.
 * star: a record from stars.js (its seed, brightness and habitable zone drive everything).
 * opts: SYSTEM_DEFAULTS above.
 */
export function generateSystem(star, userOpts = {}) {
  const o = { ...SYSTEM_DEFAULTS, ...userOpts };
  const seed = o.seed ?? star.seed ?? 1;
  const rng = makeRng(subSeed(seed, 'system'));
  const [lo, hi] = star.planetRange || [1, 6];
  const count = Math.max(0, Math.round(lerp(lo, hi, clamp(o.planets, 0, 1)) + (rng() < 0.5 ? 0 : 1) - (rng() < 0.25 ? 1 : 0)));

  const systemName = star.name;
  // no two things in one system may share a name: the star is already taken, and a rolled planet
  // name that collides is re-rolled (up to five times) before falling back to the numbered form
  const usedNames = new Set([systemName]);
  const planets = [];
  let au = Math.ceil(Math.max(0.035, Math.sqrt(Math.max(1e-5, star.lum)) * rng.range(0.22, 0.45)) * 1e4) / 1e4;

  for (let i = 0; i < count; i++) {
    const pseed = subSeed(seed, 'planet' + i);
    const prng = makeRng(pseed);
    const inZone = au >= star.habitable.inner * 0.82 && au <= star.habitable.outer * 1.18;
    const beyondFrost = au > star.frostLine;
    // close-in planets round a dim star end up showing the same face to it
    const locked = i < 3 && au < star.habitable.inner * 1.1 && (star.classKey === 'redDwarf' || star.classKey === 'orange') && prng() < 0.5;

    let key;
    // giants form out past the frost line, where there is ice to sweep up. A few end up close in
    // anyway (they migrate inwards), which is why the last case is small but not zero.
    const nearFrost = au > star.frostLine * 0.55;
    const giantChance = beyondFrost ? 0.58 + clamp(i / Math.max(1, count), 0, 1) * 0.18 : nearFrost ? 0.2 : 0.005;
    if (prng() < giantChance) key = prng() < (au > star.frostLine * 2.4 ? 0.55 : 0.3) ? 'iceGiant' : 'gasGiant';
    else {
      const arch0 = ARCH_BY_KEY.barren;
      const tempGuess = orbitTempK(star.lum, au, arch0.albedo, 0);
      key = rockyArchetype(prng, tempGuess, o, { inZone, locked, index: i, dead: !!star.radiation });
    }
    const arch = ARCH_BY_KEY[key];

    const greenhouse = key === 'toxic' ? prng.range(0.5, 1.1) : key === 'jungle' ? prng.range(0.05, 0.2)
      : key === 'living' ? prng.range(0.02, 0.1) : key === 'desert' ? prng.range(0, 0.12) : 0;
    let K = orbitTempK(star.lum, au, arch.albedo, greenhouse);
    // a collapsed star gives out almost nothing: whatever is left orbiting it is frozen
    if (star.radiation) K = Math.min(K, 90);
    // then nudge it into the archetype's own band, so a "lava world" is never chilly
    K = clamp(K, arch.tempK[0], arch.tempK[1]);

    const radius = +prng.range(arch.radius[0], arch.radius[1]).toFixed(3);
    const density = arch.giant ? prng.range(0.16, 0.34) : key === 'ice' ? prng.range(0.45, 0.75) : prng.range(0.8, 1.25);
    const gravity = +clamp(radius * density, 0.02, 4.5).toFixed(2);
    const dens = arch.atmosphere.density;
    const atmDensity = +prng.range(dens[0], dens[1]).toFixed(2);
    const dayHours = locked ? +(365 * Math.pow(au, 1.5) * 24 / Math.sqrt(star.mass || 1)).toFixed(1) : +prng.range(arch.giant ? 8 : 12, arch.giant ? 20 : 64).toFixed(1);

    const { resources, rareElements } = resourcesFor(prng, arch, o);
    const hazards = [...arch.hazards];
    if (star.radiation) hazards.push('radiation');
    if (star.flareRate > 0.6 && au < star.habitable.outer) hazards.push('storms');
    if (K > 420 && !hazards.includes('heat')) hazards.push('heat');
    if (K < 200 && !hazards.includes('cold')) hazards.push('cold');
    if (clamp(o.hazardLevel, 0, 1) > 0.75 && prng() < 0.35) hazards.push(prng.pick(['radiation', 'toxic', 'storms']));
    if (clamp(o.hazardLevel, 0, 1) < 0.25) hazards.length = Math.min(hazards.length, 1);

    let name = null;
    if (prng() < 0.42) {
      for (let t = 0; t < 5 && !name; t++) {
        const roll = starName(subSeed(pseed, t ? 'pname' + t : 'pname'), o.namegen, o.nameRace);
        if (!usedNames.has(roll)) name = roll;
      }
    }
    if (!name) name = `${systemName} ${NUMERAL[i] || i + 1}`;   // always unique: one per index
    usedNames.add(name);

    const planet = {
      id: i, seed: pseed, name, index: i,
      archetype: key, archetypeName: arch.name, blurb: arch.blurb,
      star: { id: star.id, name: star.name, classKey: star.classKey, color: star.color, lum: star.lum, frostLine: star.frostLine, habitable: star.habitable },
      orbit: {
        au,
        periodDays: +(365.25 * Math.sqrt(Math.pow(au, 3) / Math.max(0.05, star.mass || 1))).toFixed(1),
        eccentricity: +prng.range(0, 0.18).toFixed(3),
        inclination: +prng.range(-0.06, 0.06).toFixed(3),
        inZone, beyondFrost,
      },
      radius, gravity, mass: +(Math.pow(radius, 3) * density).toFixed(3),
      dayLengthHours: dayHours, tidalLocked: !!locked || key === 'tidalLocked',
      axialTilt: +prng.range(0, key === 'tidalLocked' ? 4 : 35).toFixed(1),
      atmosphere: { type: arch.atmosphere.type, density: atmDensity, color: arch.atmosphere.color, breathable: ['living', 'ocean', 'jungle', 'tundra'].includes(key) && atmDensity > 0.5 },
      temperature: { K: Math.round(K), C: Math.round(K - 273.15), label: tempLabel(K) },
      biomeMode: arch.biomeMode, biomeFamily: arch.family, palette: arch.palette,
      poles: arch.poles === true && K < 320 && !arch.giant,
      skyColor: arch.sky, seaColor: arch.sea,
      giant: arch.giant, landable: arch.landable,
      resources, rareElements, hazards: [...new Set(hazards)],
      difficulty: +clamp(arch.difficulty * (0.6 + clamp(o.hazardLevel, 0, 1) * 0.8) + (star.radiation ? 0.15 : 0), 0.05, 1).toFixed(2),
      tags: [...arch.tags, ...(inZone ? ['habitable zone'] : []), ...(locked ? ['locked'] : [])],
      moons: [], rings: null,
    };
    planet.moons = moonsFor(prng, planet, o, star);
    planet.rings = ringsFor(prng, planet, o);
    planets.push(planet);

    // next orbit — a Titius–Bode style ladder, wider once you are past the frost line
    au = nextOrbitAu(au, rng, beyondFrost);
  }

  // ------------------------------------------------------------------ belts and comets
  const belts = [];
  if (planets.length >= 2 && rng() < clamp(o.beltChance, 0, 1)) {
    const gap = rng.int(0, planets.length - 2);
    // sit the belt in the middle of the gap (geometric middle, because the ladder is a ratio) and
    // keep a clear lane either side of it
    const lo = planets[gap].orbit.au, hi = planets[gap + 1].orbit.au;
    const mid = Math.sqrt(lo * hi), wide = rng.range(1.06, 1.28);
    const inner = Math.max(mid / wide, lo * 1.1);
    const outer = Math.min(mid * wide, hi * 0.9);
    if (outer > inner * 1.04) {
      const bseed = subSeed(seed, 'belt' + gap);
      const brng = makeRng(bseed);
      const pool = rareFor('barren');
      belts.push({
        id: belts.length, seed: bseed, kind: 'belt',
        name: uniqueName(usedNames, t => `the ${starName(subSeed(bseed, t ? 'bname' + t : 'bname'), o.namegen, o.nameRace)} Belt`, `the ${systemName} Belt`),
        inner: +inner.toFixed(3), outer: +outer.toFixed(3),
        density: +brng.range(0.25, 1).toFixed(2),
        rocks: brng.int(200, 2400),
        resources: ['metals', 'stone', 'waterIce'],
        rareElements: pool.length ? [brng.weighted(pool, e => e.weight).key] : [],
        hazards: ['collision'],
      });
    }
  }

  const comets = [];
  if (rng() < clamp(o.cometChance, 0, 1)) {
    const n = rng.int(1, 4);
    for (let i = 0; i < n; i++) {
      const cseed = subSeed(seed, 'comet' + i);
      const crng = makeRng(cseed);
      const peri = +crng.range(0.2, 1.6).toFixed(2);
      const aph = +(peri * crng.range(6, 45)).toFixed(1);
      comets.push({
        id: i, seed: cseed,
        name: uniqueName(usedNames, t => `${starName(subSeed(cseed, t ? 'cname' + t : 'cname'), o.namegen, o.nameRace)} Comet`, `${systemName} Comet ${i + 1}`),
        perihelion: peri, aphelion: aph,
        periodYears: +Math.pow((peri + aph) / 2, 1.5).toFixed(1),
        tail: +crng.range(0.3, 1).toFixed(2),
        resources: ['waterIce', 'gas'],
      });
    }
  }

  const living = planets.filter(p => p.archetype === 'living').length;
  return {
    schema: 1, kind: 'system',
    seed, star, name: systemName, opts: { ...o, namegen: undefined },
    planets, belts, comets,
    stats: {
      planets: planets.length, giants: planets.filter(p => p.giant).length,
      moons: planets.reduce((a, p) => a + p.moons.length, 0),
      ringed: planets.filter(p => p.rings).length,
      living, inZone: planets.filter(p => p.orbit.inZone).length,
      landable: planets.filter(p => p.landable).length,
      maxDifficulty: planets.length ? Math.max(...planets.map(p => p.difficulty)) : 0,
    },
  };
}

/** A one-line description of a planet, for a UI card or a ship's log. */
export function planetSummary(planet) {
  const t = planet.temperature;
  const air = planet.atmosphere.density < 0.05 ? 'no atmosphere'
    : planet.atmosphere.breathable ? `breathable ${planet.atmosphere.type}`
      : `${planet.atmosphere.type} at ${planet.atmosphere.density.toFixed(2)} bar`;
  const rare = planet.rareElements.map(r => r.name).join(' and ');
  return `${planet.archetypeName} at ${planet.orbit.au} AU — ${t.label}, ${t.C}°C, ${planet.gravity}g, ${air}. Worth mining for ${rare || 'nothing unusual'}.`;
}

// ---------------------------------------------------------------------------- drawing the orbits
//
// Real orbits run from 0.03 AU to 150 AU, so a viewer has to squash them onto a log scale or the
// inner planets pile up on the star. That squashing is what used to push two rings almost on top of
// each other. `orbitLayout` does the log scale first, then walks outwards pushing any ring that
// landed too close to its neighbour, and hands back a size cap so a planet is never drawn wider than
// its own lane. No DOM and no Three.js in here, so the node tests can check the invariant.

export const ORBIT_LAYOUT_DEFAULTS = {
  inner: 2.2,         // where the innermost ring sits, in scene units
  outer: 11.5,        // where the outermost one sits, before the minimum-gap pass
  minGap: 1.0,        // the smallest allowed distance between two rings (and star → first ring)
  starRadius: 0.6,    // how big the star is drawn, so the first ring clears it
  even: 0.55,         // 0 = true log spacing, 1 = every ring the same distance apart
  sizeCap: 0.34,      // a planet's drawn radius, at most, as a share of its narrowest gap

  // ---- lanes and moons
  //
  // Reported from Farhold's orbit view: *"planets are too close together, some are drawn larger
  // than their own sun, and moons share an orbital ring with planets so they could collide."* The
  // last one is the real fault: a moon drawn a fixed number of PLANET radii out, with the planet
  // itself drawn far too big, ends up sweeping a circle wider than the gap to the next world.
  //
  // A **lane** is the space either side of a ring that belongs to that planet and nothing else. A
  // moon may only ever be drawn inside its parent's lane, and two neighbouring lanes never touch,
  // so nothing a moon sweeps can meet anything else in the system.
  laneShare: 0.8,     // how much of the half-gap either side a planet owns outright
  moonInner: 2.4,     // the closest a moon is drawn, in its planet's own drawn radii
  moonStep: 1.35,     // each moon out sits this much further than the one inside it

  // 'ladder' remaps the orbits for drawing (the default, and what a chart wants).
  // 'au' keeps the real orbit in AU and lends only the gaps, the size cap and the moon lanes —
  // for a caller drawing the system at its own scale, where "0.3 AU away" has to mean what it says.
  map: 'ladder',
};

/**
 * Where to draw every orbit in a system.
 * Returns { radii, radiusFor(au), gapAt(i), sizeFor(i, wanted), laneAt(i), moonRings(i, n), minGap, max }.
 *   radii[i]            — the drawn radius of planet i, in scene units
 *   radiusFor(au)       — the same mapping for anything that is not a planet (belts, comets)
 *   gapAt(i)            — the narrower of the two gaps around planet i
 *   sizeFor(i, r, o)    — `r`, capped so the planet cannot fill its lane; pass `{ moons: n }` and it
 *                         also leaves room for that many moons to circle it inside the same lane
 *   laneAt(i)           — how far out from planet i's ring still belongs to planet i
 *   moonRings(i, n, o)  — where to draw that planet's n moons, all inside its lane
 */
export function orbitLayout(system, userOpts = {}) {
  const o = { ...ORBIT_LAYOUT_DEFAULTS, ...userOpts };
  const planets = system?.planets || [];
  const aus = planets.map(p => p.orbit.au);
  const n = aus.length;
  const L = au => Math.log(Math.max(1e-4, au));
  const first = Math.max(o.inner, o.starRadius + o.minGap);
  const lo = n ? L(aus[0]) : 0, hi = n ? L(aus[n - 1]) : 1;

  // where a planet sits between the innermost and the outermost, two ways: by its distance (log,
  // because orbits are a ratio ladder) and by its place in the queue. Blending the two is what
  // stops a far-out giant from squashing the inner planets into one another.
  const place = (au, i) => {
    if (n < 2) return 0;
    const byLog = clamp((L(au) - lo) / Math.max(1e-6, hi - lo), 0, 1);
    const byIndex = i / (n - 1);
    return clamp(o.even, 0, 1) * byIndex + (1 - clamp(o.even, 0, 1)) * byLog;
  };
  // with no planets (or only one) there is no ladder to interpolate along, so fall back to a plain
  // fourth-root scale — still monotone, which is all a belt or a comet needs
  const bare = au => Math.max(o.starRadius * 1.1, first * Math.pow(Math.max(1e-4, au), 0.25));

  // the blended scale, then a pass outwards that opens up anything still too tight
  const radii = [];
  if (o.map === 'au') {
    // Nothing to remap: the rungs ARE the orbits. The minimum-gap pass is skipped too — you cannot
    // shove a planet outwards when the caller is drawing it where it actually is.
    for (let i = 0; i < n; i++) radii.push(aus[i]);
  } else {
    let prev = o.starRadius;
    for (let i = 0; i < n; i++) {
      const r = Math.max(first + (o.outer - first) * place(aus[i], i), prev + o.minGap);
      radii.push(r);
      prev = r;
    }
  }

  // a monotone mapping for everything else: straight-line interpolation between the planet rings,
  // in log space, so a belt still lands between the two planets it was rolled between
  function radiusFor(au) {
    if (!radii.length) return bare(au);
    if (n === 1) return Math.max(o.starRadius * 1.1, radii[0] * Math.pow(Math.max(1e-4, au) / aus[0], 0.25));
    if (au <= aus[0]) {
      const slope = (radii[1] - radii[0]) / Math.max(1e-6, L(aus[1]) - L(aus[0]));
      return Math.max(o.starRadius * 1.1, radii[0] - (L(aus[0]) - L(au)) * slope);
    }
    if (au >= aus[n - 1]) {
      const slope = (radii[n - 1] - radii[n - 2]) / Math.max(1e-6, L(aus[n - 1]) - L(aus[n - 2]));
      return radii[n - 1] + (L(au) - L(aus[n - 1])) * slope;
    }
    let i = 0;
    while (i < n - 2 && aus[i + 1] < au) i++;
    const t = (L(au) - L(aus[i])) / Math.max(1e-6, L(aus[i + 1]) - L(aus[i]));
    return radii[i] + t * (radii[i + 1] - radii[i]);
  }

  const gapAt = i => Math.min(
    radii[i] - (i > 0 ? radii[i - 1] : o.starRadius),
    i + 1 < radii.length ? radii[i + 1] - radii[i] : Infinity,
  );

  /** How far out from planet i's ring is still planet i's own business. */
  const laneAt = i => (radii.length ? gapAt(i) * 0.5 * clamp(o.laneShare, 0, 1) : Infinity);

  /**
   * The drawn radius a planet may have. Two caps: it never fills the gap to its neighbour, and —
   * if it has moons — it leaves enough room for the whole moon ladder to sit outside it and still
   * inside its lane. Without the second cap a big planet swallowed its own moons.
   */
  function sizeFor(i, wanted, { moons = 0 } = {}) {
    let cap = o.sizeCap * gapAt(i);
    if (moons > 0) {
      const outermost = o.moonInner * Math.pow(o.moonStep, moons - 1);
      // +0.6 is the moon's own drawn radius, which has to clear the lane edge as well
      cap = Math.min(cap, laneAt(i) / (outermost + 0.6));
    }
    return Math.min(wanted, cap);
  }

  /**
   * Where to draw planet i's moons, from a ladder that starts clear of the planet's own surface.
   * If the outermost one has walked out of the lane the whole set is pulled back in together, so
   * the ladder keeps its shape and no moon strays into the ring next door.
   */
  function moonRings(i, count, { bodyRadius = 0 } = {}) {
    const out = [];
    if (count <= 0) return out;
    let r = Math.max(bodyRadius * o.moonInner, 1e-6);
    for (let k = 0; k < count; k++) { out.push(r); r *= o.moonStep; }
    const lane = laneAt(i);
    const top = out[out.length - 1];
    if (Number.isFinite(lane) && top > lane) for (let k = 0; k < out.length; k++) out[k] *= lane / top;
    // …and never inside the planet itself, however tight the lane turned out to be
    for (let k = 0; k < out.length; k++) out[k] = Math.max(out[k], bodyRadius * 1.5);
    return out;
  }

  return {
    opts: o, radii, radiusFor, gapAt, laneAt, sizeFor, moonRings,
    minGap: radii.length ? Math.min(...radii.map((_, i) => gapAt(i))) : Infinity,
    max: radii.length ? radii[radii.length - 1] : o.inner,
  };
}

/** Every planet + moon + belt in one flat list, for a travel or scan UI. */
export function bodies(system) {
  const out = [];
  for (const p of system.planets) {
    out.push({ kind: 'planet', ref: p, name: p.name, au: p.orbit.au });
    for (const m of p.moons) out.push({ kind: 'moon', ref: m, name: m.name, au: p.orbit.au, parent: p.id });
  }
  for (const b of system.belts) out.push({ kind: 'belt', ref: b, name: b.name, au: (b.inner + b.outer) / 2 });
  for (const c of system.comets) out.push({ kind: 'comet', ref: c, name: c.name, au: c.perihelion });
  return out.sort((a, b) => a.au - b.au);
}
