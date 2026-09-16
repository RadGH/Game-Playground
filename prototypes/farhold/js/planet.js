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
 * star's water zone, then anything solid.
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
  const relief = world.relief || { landMetres: 4200, seaMetres: 4200, datum: 'sea', label: 'sea level' };
  const detailFlat = opts.detailFlat ?? 13;
  const detailRelief = opts.detailRelief ?? 78;
  const detailFine = opts.detailFine ?? 2.4;
  const n1 = makeNoise2D(subSeed(world.seed, 'farhold-coarse'));
  const n2 = makeNoise2D(subSeed(world.seed, 'farhold-fine'));
  const n3 = makeNoise2D(subSeed(world.seed, 'farhold-tint'));

  const widthM = (w - 1) * M_PER_CELL;
  const depthM = (h - 1) * M_PER_CELL;
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
  for (let i = 0; i < w * h; i++) if (world.water[i] === 2) { lakeField[i] = 1; anyLake = true; }
  if (anyLake) blur(lakeField, w, h, 1);
  const lakeSurfaceAt = (fx, fy) => elevationToMetres(layer(world.elevation, fx, fy), relief);

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
    for (let i = 1; i < lift.length; i++) lift[i] = Math.max(lift[i], lift[i - 1] - rampPerPoint);
    for (let i = lift.length - 2; i >= 0; i--) lift[i] = Math.max(lift[i], lift[i + 1] - rampPerPoint);
    for (let i = 0; i < smooth.length; i++) smooth[i] += Math.max(0, lift[i]);
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
      const inLake = world.water[IDX(w, cellX(x), cellY(z))] === 2 ? 1 : 0;
      const lake = Math.max(inLake, layer(lakeField, fx, fy));
      if (lake > 0.05) {
        const surface = lakeSurfaceAt(fx, fy);
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
      const surface = lakeSurfaceAt(x / M_PER_CELL, z / M_PER_CELL);
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
  function clampToWorld(x, z) {
    return [clamp(x, 0, widthM), clamp(z, 0, depthM)];
  }

  /**
   * Somewhere sensible to start: dry land, not a cliff, not in a river, and leaning toward a road
   * or a town, because an empty plain is a poor first thing to see.
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
    riverPaths, roadPaths,
    heightAt, naturalHeightAt, slopeAt, normalAt, colorAt, biomeAt, biomeIdAt, temperatureAt,
    underwater, waterAt, riverAt, roadAt,
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
