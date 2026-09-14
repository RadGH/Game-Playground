// Saving and loading. Everything in universe/ is generated from seeds, so a saved file is small:
// the knob set plus the records. Surface maps are never saved — they come back from the planet seed
// in about half a second, which is cheaper than storing half a megabyte per planet.
//
//   import { toJSON, fromJSON } from './export.js';
//   const save = toJSON({ galaxy, system, planet });
//   const { galaxy, system, planet } = fromJSON(save);
//
// `fromJSON` gives you the same records back. `regenerate()` rebuilds them from the seed instead,
// which is what you want if the generator has changed since the file was written.

import { generateGalaxy } from './galaxy.js';
import { generateSystem, moonById } from './system.js';
import { generatePlanetMap, mapSizeFor } from './planetmap.js';

export const SCHEMA = 1;

const clone = v => JSON.parse(JSON.stringify(v));

/** A galaxy as a plain JSON-safe object. `stars: false` keeps only the knobs (a few hundred bytes). */
export function galaxyToJSON(galaxy, { stars = true } = {}) {
  return {
    schema: SCHEMA, kind: 'galaxy',
    seed: galaxy.seed, layout: galaxy.layout, name: galaxy.name,
    opts: clone(galaxy.opts), stats: clone(galaxy.stats),
    stars: stars ? clone(galaxy.stars) : null,
    lanes: stars ? clone(galaxy.lanes) : null,
  };
}

/** Rebuild a galaxy: from the saved star list if it is there, otherwise from the seed + knobs. */
export function galaxyFromJSON(json, { namegen = null } = {}) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  if (!data.stars) return generateGalaxy({ ...data.opts, namegen });
  return {
    schema: SCHEMA, kind: 'galaxy', seed: data.seed, layout: data.layout, name: data.name,
    opts: data.opts, stats: data.stats, stars: data.stars, lanes: data.lanes,
  };
}

/** A system as JSON. The star travels with it, so a system file stands on its own. */
export function systemToJSON(system) {
  return {
    schema: SCHEMA, kind: 'system',
    seed: system.seed, name: system.name,
    star: clone(system.star), opts: clone(system.opts), stats: clone(system.stats),
    // the moons ride inside their planets; `moons` is the flat index, so a loader can list what is
    // landable without walking the planets, and rebuild each map from the moon's own seed
    planets: clone(system.planets), belts: clone(system.belts), comets: clone(system.comets),
    moons: moonIndex(system),
  };
}

export function systemFromJSON(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  return {
    schema: SCHEMA, kind: 'system', seed: data.seed, name: data.name, star: data.star,
    opts: data.opts, stats: data.stats, planets: data.planets, belts: data.belts || [], comets: data.comets || [],
  };
}

/** One planet on its own — enough to rebuild its map anywhere. */
export function planetToJSON(planet) { return { schema: SCHEMA, kind: 'planet', planet: clone(planet) }; }
export function planetFromJSON(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  return data.planet || data;
}

/**
 * One moon on its own. A moon record is a small planet record, so this is enough to rebuild its
 * surface map anywhere: `generatePlanetMap(moon, moonMapSize(size))` off the moon's own seed.
 */
export function moonToJSON(moon) { return { schema: SCHEMA, kind: 'moon', moon: clone(moon) }; }
export function moonFromJSON(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  return data.moon || data;
}

/**
 * Enough to redraw every moon in a system without storing a single map: the id, the parent and the
 * seed the map comes from. Saved alongside a system so a loader knows what is down there.
 */
export function moonIndex(system) {
  const out = [];
  for (const p of system?.planets || []) {
    for (const m of p.moons || []) {
      out.push({ id: m.id, name: m.name, seed: m.seed, parentId: p.id, parentName: p.name, archetype: m.archetype, radius: m.radius });
    }
  }
  return out;
}

/** Whatever the viewer is looking at, in one file. */
export function toJSON({ galaxy = null, system = null, planet = null, moon = null } = {}, opts = {}) {
  return {
    schema: SCHEMA, kind: 'universe', saved: new Date().toISOString().slice(0, 10),
    galaxy: galaxy ? galaxyToJSON(galaxy, opts) : null,
    system: system ? systemToJSON(system) : null,
    planet: planet ? clone(planet) : null,
    moon: moon ? clone(moon) : null,
  };
}

export function fromJSON(json, { namegen = null } = {}) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  if (data.kind === 'galaxy') return { galaxy: galaxyFromJSON(data, { namegen }), system: null, planet: null, moon: null };
  if (data.kind === 'system') return { galaxy: null, system: systemFromJSON(data), planet: null, moon: null };
  if (data.kind === 'planet') return { galaxy: null, system: null, planet: planetFromJSON(data), moon: null };
  if (data.kind === 'moon') return { galaxy: null, system: null, planet: null, moon: moonFromJSON(data) };
  return {
    galaxy: data.galaxy ? galaxyFromJSON(data.galaxy, { namegen }) : null,
    system: data.system ? systemFromJSON(data.system) : null,
    planet: data.planet || null,
    moon: data.moon || null,
  };
}

/**
 * Build everything again from nothing but the seed and the knobs — the check that the generator is
 * still the same generator. Returns { galaxy, star, system, planet, moon, world }.
 * `moonId` ("<planetId>m<index>", or a plain index into the planet's moons) picks a moon instead of
 * the planet itself, and `map` then builds the moon's smaller map.
 */
export function regenerate({ galaxyOpts, starId = 0, planetId = 0, moonId = null, systemOpts = {}, map = false, mapSize = null, namegen = null } = {}) {
  const galaxy = generateGalaxy({ ...galaxyOpts, namegen });
  const star = galaxy.stars[Math.min(starId, galaxy.stars.length - 1)];
  const system = generateSystem(star, { seed: star.seed, namegen, ...systemOpts });
  const planet = system.planets[Math.min(planetId, Math.max(0, system.planets.length - 1))] || null;
  let moon = null;
  if (moonId != null && planet) {
    moon = typeof moonId === 'number' ? (planet.moons || [])[moonId] || null : moonById(system, moonId);
  }
  const body = moon || planet;
  const size = mapSize || { width: 256, height: 128 };
  const world = map && body ? generatePlanetMap(body, mapSizeFor(body, size)) : null;
  return { galaxy, star, system, planet, moon, world };
}

/** Rough size of a save, in kilobytes. */
export function jsonSizeKB(obj) { return Math.round(JSON.stringify(obj).length / 1024); }

/** Kick off a browser download (no-op outside a page). */
export function download(content, filename = 'universe.json', type = 'application/json') {
  if (typeof document === 'undefined') return;
  const blob = content instanceof Blob ? content : new Blob([typeof content === 'string' ? content : JSON.stringify(content, null, 2)], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
