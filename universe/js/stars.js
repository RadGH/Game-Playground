// Stellar classes — the table the whole universe hangs off.
//
//   import { STAR_CLASSES, makeStar, habitableZone } from './stars.js';
//   const star = makeStar({ seed: 12, name: 'Kel Varren', classKey: 'yellow' });
//
// Pure data + pure functions: no DOM, no fetch, safe in node and in a worker. Real stars are sorted
// by colour and temperature; ours are too, but the names are plain English so a game can print them
// ("an orange dwarf", "a blue giant") without a glossary. Nothing here is taken from any other game.

import { makeRng, subSeed, clamp } from '../../worldgen/js/noise.js';

/**
 * One row per kind of star.
 *   color        what it looks like (also the 3D emissive colour and the galaxy map dot)
 *   tempK        surface temperature, kelvin — drives the colour and the sky of its planets
 *   lum          brightness, ours = 1. This is what sets the habitable zone and every planet's heat.
 *   radius/mass  relative to ours
 *   weight       how common it is before the mix sliders touch it
 *   planets      [min, max] planets to try for
 *   exotic       true for the four odd ones (they get their own 3D model and their own hazards)
 */
export const STAR_CLASSES = [
  { key: 'blueGiant', name: 'Blue Giant', color: '#a6c0ff', corona: '#5f86ff', tempK: 28000, lum: 12000, radius: 7.0, mass: 16, weight: 2, planets: [1, 5], exotic: false,
    tags: ['hot', 'bright', 'short-lived'], blurb: 'enormous, violently bright, and it will not last. Anything close is scoured; anything far is cold.' },
  { key: 'white', name: 'White Star', color: '#e8eeff', corona: '#b9cdff', tempK: 8600, lum: 18, radius: 1.8, mass: 2.0, weight: 6, planets: [2, 7], exotic: false,
    tags: ['hot', 'bright'], blurb: 'hot and hard-edged. Its habitable zone sits far out, and it burns through it fast.' },
  { key: 'palegold', name: 'Pale Star', color: '#fff4d8', corona: '#ffe6a8', tempK: 6600, lum: 2.4, radius: 1.25, mass: 1.25, weight: 10, planets: [3, 8], exotic: false,
    tags: ['warm', 'steady'], blurb: 'a shade hotter than ours and a little bluer at noon. Good worlds, slightly harsh light.' },
  { key: 'yellow', name: 'Yellow Star', color: '#ffe9a8', corona: '#ffcf6a', tempK: 5700, lum: 1.0, radius: 1.0, mass: 1.0, weight: 14, planets: [3, 9], exotic: false,
    tags: ['warm', 'steady', 'life'], blurb: 'the comfortable middle. Most of the living worlds anyone has found orbit one of these.' },
  { key: 'orange', name: 'Orange Dwarf', color: '#ffc27a', corona: '#ff9a4a', tempK: 4400, lum: 0.34, radius: 0.78, mass: 0.8, weight: 18, planets: [2, 8], exotic: false,
    tags: ['cool', 'steady', 'long-lived'], blurb: 'dimmer, calmer and far longer lived than ours. Its habitable zone is tight but it stays put for ages.' },
  { key: 'redDwarf', name: 'Red Dwarf', color: '#ff8a6a', corona: '#d94a2a', tempK: 3100, lum: 0.03, radius: 0.32, mass: 0.3, weight: 30, planets: [1, 6], exotic: false,
    tags: ['cool', 'dim', 'flares', 'common'], blurb: 'the commonest star there is. Planets have to huddle in close, so most of them end up tidally locked.' },
  { key: 'redGiant', name: 'Red Giant', color: '#ff9b5c', corona: '#c0421c', tempK: 3500, lum: 900, radius: 42, mass: 1.1, weight: 5, planets: [1, 6], exotic: false,
    tags: ['dying', 'huge', 'cool'], blurb: 'a dying star swollen over its inner planets. What is left of them is cooked rock.' },
  { key: 'whiteDwarf', name: 'White Dwarf', color: '#dfe9ff', corona: '#8fb4ff', tempK: 16000, lum: 0.004, radius: 0.013, mass: 0.65, weight: 4, planets: [0, 3], exotic: true,
    tags: ['dead', 'dense', 'dim'], blurb: 'the cooling cinder a star like ours leaves behind. Bright to look at, almost no warmth.' },
  { key: 'neutronStar', name: 'Neutron Star', color: '#cfe4ff', corona: '#7fd0ff', tempK: 600000, lum: 0.0006, radius: 0.00002, mass: 1.6, weight: 2, planets: [0, 3], exotic: true,
    tags: ['dead', 'dense', 'radiation', 'pulsar'], blurb: 'a city-sized corpse spinning hundreds of times a second, sweeping two beams of hard radiation.' },
  { key: 'binaryPair', name: 'Binary Pair', color: '#ffe0b0', corona: '#ffb060', tempK: 5200, lum: 1.7, radius: 1.0, mass: 1.8, weight: 8, planets: [1, 7], exotic: true,
    tags: ['double', 'unstable', 'two suns'], blurb: 'two stars round a common centre. Planets get two sunrises and a climate that never quite settles.' },
  { key: 'blackHole', name: 'Black Hole', color: '#140c1c', corona: '#ff9a3c', tempK: 0, lum: 0.0, radius: 0.00001, mass: 8, weight: 1, planets: [0, 4], exotic: true,
    tags: ['dead', 'dense', 'radiation', 'accretion'], blurb: 'nothing comes back out. What light there is comes off the disc of matter falling in.' },
];

export const STAR_BY_KEY = Object.fromEntries(STAR_CLASSES.map(s => [s.key, s]));
export const STAR_KEYS = STAR_CLASSES.map(s => s.key);

/** The three mix sliders in the viewer, and which classes each one pushes on. */
export const MIX_GROUPS = {
  hot: ['blueGiant', 'white', 'palegold'],
  cool: ['yellow', 'orange', 'redDwarf'],
  dying: ['redGiant', 'whiteDwarf'],
  exotic: ['neutronStar', 'binaryPair', 'blackHole'],
};

/**
 * Where liquid water can sit, in AU. Scales with the square root of brightness, which is why a red
 * dwarf's zone is a tenth of ours and a blue giant's is a hundred times further out.
 */
export function habitableZone(lum) {
  const l = Math.max(1e-6, lum);
  return { inner: Math.sqrt(l / 1.1), outer: Math.sqrt(l / 0.53) };
}

/** Where water ice survives (everything past this line can grow into a gas or ice giant). */
export function frostLine(lum) { return 4.85 * Math.sqrt(Math.max(1e-6, lum)); }

/** Equilibrium temperature, kelvin, of a body `au` from a star of brightness `lum`. */
export function orbitTempK(lum, au, albedo = 0.3, greenhouse = 0) {
  const t = 278.6 * Math.pow(Math.max(1e-9, lum) * (1 - albedo) / 0.7, 0.25) / Math.sqrt(Math.max(0.004, au));
  return t * (1 + greenhouse);
}

/** Roughly what colour a star of this temperature burns (used for the 3D light and the sky). */
export function colorForTempK(k) {
  const stops = [[2500, '#ff7a45'], [3400, '#ff9b6a'], [4400, '#ffc27a'], [5700, '#ffe9a8'], [6600, '#fff4d8'], [8600, '#e8eeff'], [15000, '#c8d8ff'], [30000, '#a6c0ff']];
  if (k <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (k <= stops[i][0]) {
      const [k0, c0] = stops[i - 1], [k1, c1] = stops[i];
      return mix(c0, c1, (k - k0) / (k1 - k0));
    }
  }
  return stops[stops.length - 1][1];
}
const hex2 = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
function mix(a, b, t) {
  const A = hex2(a), B = hex2(b);
  const c = A.map((v, i) => Math.round(v + (B[i] - v) * clamp(t, 0, 1)));
  return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
}
export { mix as mixColor };

/**
 * Pick a class. `mix` scales the weights of the groups above, e.g. { hot: 1.4, exotic: 0.2 }.
 * Anything not named keeps its base weight.
 */
export function pickStarClass(rng, mixWeights = {}) {
  const scale = {};
  for (const [group, keys] of Object.entries(MIX_GROUPS)) {
    const m = mixWeights[group];
    if (m == null) continue;
    for (const k of keys) scale[k] = m;
  }
  return rng.weighted(STAR_CLASSES, s => Math.max(0.0001, s.weight * (scale[s.key] ?? 1))).key;
}

// ---------------------------------------------------------------------------- star names
// A built-in namer so `universe/` works on its own. Pass a Name Forge instance to makeStar and the
// names come from a real language instead (see galaxy.js, which threads one through).

const ONSET = ['k', 'v', 'th', 's', 'm', 'r', 'l', 'n', 'd', 'z', 'b', 'ch', 'g', 'h', 'p', 'y', 'x', 'tr', 'kr', 'vr', 'sh', 'el', 'ar'];
const VOWEL = ['a', 'e', 'i', 'o', 'u', 'ae', 'ea', 'ia', 'ei', 'au', 'y'];
const CODA = ['n', 'r', 'l', 's', 'th', 'm', 'k', 'x', 'd', 'sh', ''];
const SECOND = ['Prime', 'Reach', 'Gate', 'Watch', 'Light', 'Deep', 'Vault', 'Crown', 'Anchor', 'Verge', 'Span', 'Fall', 'Hold', 'Drift', 'Rise'];
const GREEK = ['Alpha', 'Beta', 'Delta', 'Sigma', 'Theta', 'Omega', 'Kappa', 'Lyra', 'Vega', 'Nova'];

/** A star name from a seed, without any data files. */
export function fallbackStarName(seed) {
  const rng = makeRng(seed);
  const word = (syl = rng.int(2, 3)) => {
    let s = '';
    for (let i = 0; i < syl; i++) s += rng.pick(ONSET) + rng.pick(VOWEL) + (i === syl - 1 || rng() < 0.35 ? rng.pick(CODA) : '');
    return (s.charAt(0).toUpperCase() + s.slice(1)).replace(/(.)\1\1/g, '$1$1');
  };
  const roll = rng();
  if (roll < 0.12) return `${rng.pick(GREEK)} ${word(2)}`;
  if (roll < 0.28) return `${word(2)} ${rng.int(2, 9)}${String.fromCharCode(65 + rng.int(0, 11))}`;
  if (roll < 0.46) return `${word(2)} ${rng.pick(SECOND)}`;
  if (roll < 0.6) return `${word(1)}-${word(2)}`;
  return word(rng.int(2, 3));
}

/** A star name from Name Forge when a game has it, otherwise the built-in one. */
export function starName(seed, namegen = null, race = null) {
  if (!namegen) return fallbackStarName(seed);
  try {
    const races = ['elf', 'human', 'dragon', 'gnome', 'fey', 'undead'];
    const r = race || races[seed % races.length];
    const out = namegen.generate('region', { seed, race: r });
    return (out?.text || fallbackStarName(seed)).replace(/^[Tt]he\s+/, '');
  } catch { return fallbackStarName(seed); }
}

/**
 * Build one star record.
 * opts: { seed, name, classKey, namegen, x, y, id }
 * Everything that varies (exact brightness, radius, rotation, flare rate) is rolled from the seed,
 * so the same star always comes back the same.
 */
export function makeStar({ seed = 1, name = null, classKey = null, namegen = null, nameRace = null, x = 0, y = 0, id = 0, mix: mixWeights = {} } = {}) {
  const rng = makeRng(subSeed(seed, 'star'));
  const key = classKey && STAR_BY_KEY[classKey] ? classKey : pickStarClass(rng, mixWeights);
  const C = STAR_BY_KEY[key];
  const jitter = (v, amt) => v * rng.range(1 - amt, 1 + amt);
  const lum = +jitter(C.lum, 0.45).toPrecision(3);
  const radius = +jitter(C.radius, 0.25).toPrecision(3);
  const mass = +jitter(C.mass, 0.2).toPrecision(3);
  const tempK = Math.round(jitter(C.tempK, 0.12));
  const hz = habitableZone(lum);
  const star = {
    id, seed, name: name || starName(subSeed(seed, 'name'), namegen, nameRace),
    classKey: key, className: C.name, exotic: C.exotic,
    color: C.exotic && key === 'blackHole' ? C.color : colorForTempK(tempK),
    corona: C.corona, tempK, lum, radius, mass,
    habitable: { inner: +hz.inner.toFixed(3), outer: +hz.outer.toFixed(3) },
    frostLine: +frostLine(lum).toFixed(3),
    planetRange: C.planets, tags: [...C.tags], blurb: C.blurb,
    x, y,
    rotation: +rng.range(6, 40).toFixed(1),          // days, or ms for a pulsar
    flareRate: key === 'redDwarf' ? +rng.range(0.4, 1).toFixed(2) : +rng.range(0, 0.3).toFixed(2),
    age: +rng.range(0.4, 11).toFixed(1),             // billions of years
  };
  if (key === 'binaryPair') {
    const secondKey = rng.weighted(STAR_CLASSES.filter(s => !s.exotic), s => s.weight).key;
    const S = STAR_BY_KEY[secondKey];
    star.companion = {
      classKey: secondKey, className: S.name, color: colorForTempK(S.tempK), corona: S.corona,
      radius: +(S.radius * rng.range(0.5, 0.95)).toPrecision(3), lum: +(S.lum * rng.range(0.3, 0.9)).toPrecision(3),
      separation: +rng.range(0.12, 0.6).toFixed(3), period: +rng.range(20, 400).toFixed(0),
    };
    star.lum = +(star.lum + star.companion.lum).toPrecision(3);
    const hz2 = habitableZone(star.lum);
    star.habitable = { inner: +hz2.inner.toFixed(3), outer: +hz2.outer.toFixed(3) };
    star.frostLine = +frostLine(star.lum).toFixed(3);
  }
  if (key === 'blackHole' || key === 'neutronStar') {
    star.accretion = {
      inner: +rng.range(0.02, 0.06).toFixed(3), outer: +rng.range(0.2, 0.7).toFixed(3),
      color: key === 'blackHole' ? '#ffa23c' : '#9fd8ff', brightness: +rng.range(0.5, 1).toFixed(2),
      jets: rng() < (key === 'blackHole' ? 0.5 : 0.8),
    };
    star.radiation = 1;
  }
  if (key === 'neutronStar') star.pulse = +rng.range(1.5, 700).toFixed(1);   // spins per second
  return star;
}

/** Plain-language line about a star, for a UI card. */
export function starSummary(star) {
  const hz = star.habitable;
  const brightness = star.lum >= 10 ? `${Math.round(star.lum)}×` : star.lum >= 0.1 ? `${star.lum.toFixed(2)}×` : `${(star.lum * 1000).toFixed(1)}/1000 of`;
  return `${star.className}, ${brightness} our sun's light. Water can sit between ${hz.inner.toFixed(2)} and ${hz.outer.toFixed(2)} AU. ${star.blurb}`;
}

/** Interpolate a star's colour toward white for the 3D core (the surface is always brighter than the light it casts). */
export function coreColor(star) { return mix(star.color, '#ffffff', 0.45); }
