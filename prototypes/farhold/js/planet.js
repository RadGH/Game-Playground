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
// so a 256 x 128 map is a planet surface 164 km x 82 km. Big enough to walk for hours, small enough
// that the whole thing generates in under a second and fits in memory as one set of typed arrays.

import { makeStar } from '../../../universe/js/stars.js';
import { generateSystem } from '../../../universe/js/system.js';
import { generatePlanetMap, reliefFor, surfaceOf } from '../../../universe/js/planetmap.js';
import { elevationToMetres } from '../../../worldgen/js/relief.js';
import { BIOMES, isWater } from '../../../worldgen/js/biomes.js';
import { makeNoise2D, fbm, subSeed, clamp, lerp, makeRng, smoothstep, blur } from '../../../worldgen/js/noise.js';

/** Metres across one world-map cell. The one number that sets the size of the planet. */
export const M_PER_CELL = 640;

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
export function createSystem({ seed = 1, starClass = null } = {}) {
  const star = makeStar({ seed: seed >>> 0, classKey: starClass, id: 0 });
  const system = generateSystem(star, { seed: subSeed(seed, 'system'), rareWorlds: 0.55 });
  return { star, system };
}

/**
 * Which planet to land on: a landable body, preferring one you can breathe on, then one in the
 * star's water zone, then anything solid. Moons count — they are small planets here.
 */
export function chooseLanding(system, { prefer = null } = {}) {
  const solid = system.planets.filter(p => !p.giant && p.landable !== false);
  if (prefer != null) {
    const hit = solid.find(p => p.id === prefer || p.name === prefer);
    if (hit) return hit;
  }
  const score = p => (p.atmosphere?.breathable ? 4 : 0) + (p.orbit?.inZone ? 2 : 0) + (p.archetype === 'living' ? 3 : 0) - p.difficulty;
  return solid.sort((a, b) => score(b) - score(a))[0] || system.planets[0];
}

/** Everything a run needs: the star, the system around it, the planet, and its surface map. */
export function createWorld({ seed = 1, starClass = null, prefer = null, width = 256, height = 128 } = {}) {
  const { star, system } = createSystem({ seed, starClass });
  const planet = chooseLanding(system, { prefer });
  const world = generatePlanetMap(planet, { width, height });
  return { star, system, planet, world };
}

/**
 * The terrain sampler. Everything below reads the world map and adds noise on top, exactly the way
 * `worldgen/js/local.js` does when it zooms into a cell — so what you walk over matches what the
 * map said was there, and the same seed always grows the same hill.
 *
 * opts: { detailFlat, detailRelief, detailFine } — metres of added roughness on flat ground, extra
 * metres on broken ground, and the small octave on top.
 */
export function makeTerrain(world, planet = null, opts = {}) {
  const w = world.width, h = world.height;
  const relief = world.relief || { landMetres: 4200, seaMetres: 4200, datum: 'sea', label: 'sea level' };
  const detailFlat = opts.detailFlat ?? 13;
  const detailRelief = opts.detailRelief ?? 78;
  const detailFine = opts.detailFine ?? 2.4;
  const n1 = makeNoise2D(subSeed(world.seed, 'farhold-coarse'));
  const n2 = makeNoise2D(subSeed(world.seed, 'farhold-fine'));
  const n3 = makeNoise2D(subSeed(world.seed, 'farhold-tint'));

  const widthM = (w - 1) * M_PER_CELL;
  const depthM = (h - 1) * M_PER_CELL;

  // Rivers and roads are cut into the ground rather than painted on top of it, so a river runs
  // along the floor of its own valley and a road sits in a shallow cutting. Both start as a mask
  // over the map's cells, softened so the valley has sides instead of a step.
  const riverDepth = opts.riverDepth ?? 16;
  const N = w * h;
  const riverField = new Float32Array(N);
  const roadField = new Float32Array(N);
  if (world.river) for (let i = 0; i < N; i++) riverField[i] = world.river[i] ? Math.min(1, world.river[i] / 3) : 0;
  for (const road of world.roads || []) for (const c of road.cells || []) if (c >= 0 && c < N) roadField[c] = 1;
  blur(riverField, w, h, 1);
  blur(roadField, w, h, 1);
  // blurring flattens the peaks; scale them back so the carve depth means what it says
  const restore = arr => {
    let max = 0;
    for (let i = 0; i < N; i++) if (arr[i] > max) max = arr[i];
    if (max <= 1e-6) return;
    const k = Math.min(6, 1 / max);
    for (let i = 0; i < N; i++) arr[i] = Math.min(1, arr[i] * k);
  };
  restore(riverField);
  restore(roadField);
  // A world generated dry has no sea; its heights are measured from a datum instead.
  const hasSea = (world.opts?.liquid ?? 'water') !== 'none' && relief.datum === 'sea';
  const seaLevel = 0;

  /** Smooth sample of a world layer at fractional cell coordinates (bilinear, edge-clamped). */
  function layer(arr, fx, fy) {
    const x = clamp(fx, 0, w - 1.001), y = clamp(fy, 0, h - 1.001);
    const x0 = Math.floor(x), y0 = Math.floor(y), tx = x - x0, ty = y - y0;
    const x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
    return lerp(lerp(arr[IDX(w, x0, y0)], arr[IDX(w, x1, y0)], tx), lerp(arr[IDX(w, x0, y1)], arr[IDX(w, x1, y1)], tx), ty);
  }
  const cellX = x => clamp(Math.round(x / M_PER_CELL), 0, w - 1);
  const cellY = z => clamp(Math.round(z / M_PER_CELL), 0, h - 1);
  const nearest = (arr, x, z) => arr[IDX(w, cellX(x), cellY(z))];

  /** Ground height in metres above sea level (or above the datum on a dry world). */
  function heightAt(x, z) {
    const fx = x / M_PER_CELL, fy = z / M_PER_CELL;
    const base = elevationToMetres(layer(world.elevation, fx, fy), relief);
    const broken = clamp(layer(world.slope, fx, fy), 0, 1);
    // under water the detail calms down — the seabed is not a mountain range
    const damp = base < 0 ? 0.3 : 1;
    // a road is graded flat and a river bed is smooth, so both quieten the detail noise
    const river = layer(riverField, fx, fy);
    const road = layer(roadField, fx, fy);
    const smoothed = 1 - 0.75 * road - 0.5 * river;
    const coarse = (fbm(n1, x * 0.0055, z * 0.0055, { octaves: 4 }) - 0.5) * (detailFlat + broken * detailRelief) * damp * smoothed;
    const fine = (fbm(n2, x * 0.016, z * 0.016, { octaves: 3 }) - 0.5) * (detailFine * (1 + broken * 3)) * damp * smoothed;
    // and the river cuts its valley
    return base + coarse + fine - riverDepth * smoothstep(0, 0.7, river);
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

  const biomeIdAt = (x, z) => nearest(world.biome, x, z);
  const biomeAt = (x, z) => BIOMES[biomeIdAt(x, z)];
  const temperatureAt = (x, z) => layer(world.temperature, x / M_PER_CELL, z / M_PER_CELL);
  const underwater = (x, z) => hasSea && heightAt(x, z) < seaLevel;

  /**
   * Ground colour at a point, written into `out` as r/g/b in 0..1. The biome colour is the start;
   * steep ground shows rock, high cold ground shows snow, the shoreline shows sand, and a slow
   * noise mottles the large flats so a prairie is not one flat green.
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
    }
    out[0] = r; out[1] = g; out[2] = b;
    return out;
  }

  /** Keep a position on the map. Walk off the edge and you are stopped by the world's rim. */
  function clampToWorld(x, z) {
    return [clamp(x, 0, widthM), clamp(z, 0, depthM)];
  }

  /**
   * Somewhere sensible to start: dry land, not a cliff, not the middle of an ice cap, and — when
   * the planet has a sea — within sight of something other than ocean. It also leans toward
   * starting near a road or a town, because an empty plain is a poor first thing to see.
   */
  function spawnPoint(rng = makeRng(world.seed)) {
    const towns = (world.nodes || []).filter(n => n.type === 'settlement' || n.type === 'port');
    let best = null, bestScore = -Infinity;
    for (let tries = 0; tries < 400; tries++) {
      const cx = 2 + Math.floor(rng() * (w - 4)), cy = 2 + Math.floor(rng() * (h - 4));
      const i = IDX(w, cx, cy);
      if (world.water[i] !== 0) continue;
      const b = BIOMES[world.biome[i]];
      if (!b || isWater(world.biome[i])) continue;
      const x = cx * M_PER_CELL, z = cy * M_PER_CELL;
      const height = heightAt(x, z);
      if (hasSea && height < 4) continue;
      const steep = slopeAt(x, z, 6);
      // how close the nearest town is, in map cells
      let townCells = Infinity;
      for (const t of towns) townCells = Math.min(townCells, Math.hypot(t.x - cx, t.y - cy));
      const nearTown = Number.isFinite(townCells) ? Math.max(0, 1 - townCells / 6) : 0;
      const onRoad = roadField[i];
      const score = (b.habit ?? 0.3) * 2 - steep * 4 - Math.abs(height - 320) / 2200
        + nearTown * 2.2 + onRoad * 1.2 + rng() * 0.25;
      if (score > bestScore) { bestScore = score; best = { x, z, height }; }
    }
    if (!best) best = { x: widthM / 2, z: depthM / 2, height: heightAt(widthM / 2, depthM / 2) };
    return best;
  }

  return {
    world, planet, relief, hasSea, seaLevel, widthM, depthM, metresPerCell: M_PER_CELL,
    width: w, height: h,
    heightAt, slopeAt, normalAt, colorAt, biomeAt, biomeIdAt, temperatureAt, underwater,
    clampToWorld, spawnPoint, layer,
    /** 0..1 how much of a river / road runs through this point — the carve fields. */
    riverAt: (x, z) => layer(riverField, x / M_PER_CELL, z / M_PER_CELL),
    roadAt: (x, z) => layer(roadField, x / M_PER_CELL, z / M_PER_CELL),
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
    /** Map cell under a world position, for the minimap and for "where am I". */
    cellAt: (x, z) => ({ x: cellX(x), y: cellY(z) }),
    /** The region name the player is standing in, when the map named one. */
    regionAt(x, z) {
      if (!world.region || !world.regions?.length) return null;
      const id = world.region[IDX(w, cellX(x), cellY(z))];
      return world.regions[id]?.name || null;
    },
  };
}

/** A plain-language line about where you are, for the HUD. */
export function describePlanet(planet, star) {
  const air = planet.atmosphere?.breathable ? 'breathable air' : planet.atmosphere?.density > 0.2 ? 'air you should not breathe' : 'almost no air';
  const g = `${(planet.gravity ?? 1).toFixed(2)} g`;
  return `${planet.name} — ${planet.archetypeName}, ${g}, ${air}, orbiting ${star.name} (${star.className}).`;
}
