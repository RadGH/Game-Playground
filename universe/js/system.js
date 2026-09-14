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
  { key: 'barren', name: 'Barren Rock', biomeMode: 'single', family: 'rock', palette: null, giant: false,
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

/** Baseline four + one or two rare elements, with abundances. */
function resourcesFor(rng, arch, o) {
  const bias = arch.resourceBias;
  const resources = BASELINE.map(b => ({
    key: b.key, name: b.name, color: b.color, tags: b.tags,
    abundance: +clamp((0.15 + rng() * 0.6) * (bias[b.key] ?? 1), 0.01, 1).toFixed(2),
  }));
  const pool = rareFor(arch.key);
  const rares = [];
  if (pool.length) {
    const first = rng.weighted(pool, e => e.weight);
    rares.push(first);
    const wantTwo = rng() < 0.18 + clamp(o.rareDensity, 0, 1) * 0.5;
    if (wantTwo && pool.length > 1) {
      const rest = pool.filter(e => e !== first);
      rares.push(rng.weighted(rest, e => e.weight));
    }
  }
  const rareElements = rares.map(e => ({
    key: e.key, name: e.name, color: e.color, tags: e.tags, value: e.value, blurb: e.blurb,
    abundance: +clamp(0.05 + rng() * 0.45 * (0.6 + clamp(o.rareDensity, 0, 1)), 0.02, 1).toFixed(2),
  }));
  return { resources, rareElements };
}

/** Moons for a planet. Big planets keep more of them; the giants keep a lot. */
function moonsFor(rng, planet, o, systemName) {
  const arch = ARCH_BY_KEY[planet.archetype];
  const base = arch.giant ? rng.int(2, 7) : planet.radius > 0.9 ? rng.int(0, 2) : rng.int(0, 1);
  const count = rng() < clamp(o.moonChance, 0, 1) ? base : Math.min(base, arch.giant ? 2 : 0);
  const moons = [];
  for (let i = 0; i < count; i++) {
    const kinds = arch.giant || planet.temperature.K < 260 ? ['ice', 'barren', 'barren'] : ['barren', 'barren', 'lava'];
    const kind = rng.pick(kinds);
    const radius = +(planet.radius * rng.range(0.06, 0.28)).toFixed(3);
    const distance = +(2.2 + i * rng.range(1.3, 2.6) + rng()).toFixed(2);     // in planet radii
    moons.push({
      name: `${planet.name} ${MOON_LETTER[i] || i}`,
      kind, radius,
      distance,
      periodDays: +(distance * rng.range(0.4, 1.6)).toFixed(2),
      color: kind === 'ice' ? '#cfe0ea' : kind === 'lava' ? '#8a4630' : '#8f8a82',
      tidalLocked: rng() < 0.8,
      seed: subSeed(planet.seed, 'moon' + i),
    });
  }
  return moons;
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
  const planets = [];
  let au = Math.max(0.035, Math.sqrt(Math.max(1e-5, star.lum)) * rng.range(0.22, 0.45));

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

    const named = prng() < 0.42;
    const name = named ? starName(subSeed(pseed, 'pname'), o.namegen, o.nameRace) : `${systemName} ${NUMERAL[i] || i + 1}`;

    const planet = {
      id: i, seed: pseed, name, index: i,
      archetype: key, archetypeName: arch.name, blurb: arch.blurb,
      star: { id: star.id, name: star.name, classKey: star.classKey, color: star.color, lum: star.lum, frostLine: star.frostLine, habitable: star.habitable },
      orbit: {
        au: +au.toFixed(3),
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
    planet.moons = moonsFor(prng, planet, o, systemName);
    planet.rings = ringsFor(prng, planet, o);
    planets.push(planet);

    // next orbit — a Titius–Bode style ladder, wider once you are past the frost line
    au *= rng.range(beyondFrost ? 1.5 : 1.35, beyondFrost ? 2.2 : 1.85);
  }

  // ------------------------------------------------------------------ belts and comets
  const belts = [];
  if (planets.length >= 2 && rng() < clamp(o.beltChance, 0, 1)) {
    const gap = rng.int(0, planets.length - 2);
    const inner = planets[gap].orbit.au * rng.range(1.15, 1.4);
    const outer = Math.min(planets[gap + 1].orbit.au * rng.range(0.65, 0.85), inner * rng.range(1.3, 2.2));
    if (outer > inner) {
      const bseed = subSeed(seed, 'belt' + gap);
      const brng = makeRng(bseed);
      const pool = rareFor('barren');
      belts.push({
        id: belts.length, seed: bseed, kind: 'belt',
        name: `the ${starName(subSeed(bseed, 'bname'), o.namegen, o.nameRace)} Belt`,
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
        id: i, seed: cseed, name: `${starName(subSeed(cseed, 'cname'), o.namegen, o.nameRace)} Comet`,
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
