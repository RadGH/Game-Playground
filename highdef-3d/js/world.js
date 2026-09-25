// The world field: one authoritative heightmap plus the moisture and biome grids that go with it.
//
// Why a baked grid instead of calling the noise whenever something asks how tall the ground is:
// the terrain mesh, the grass, the tree scatter, the water edge and the character's feet all need
// the SAME answer. If the mesh reads a noise function and the character reads a cheaper version of
// it, the character sinks into hills and floats over dips, and it is very hard to see why. So the
// height is generated once into a Float32Array at one metre per cell, and everything — including
// the mesh — reads that array. Whatever the array says IS the ground.
//
// Generation runs as a generator so the page can draw a progress bar instead of freezing.

import { fbm, ridged, billow, warp2, value2, worley2, clamp, smoothstep, remap, makeRng } from './noise.js';

/**
 * The biome table. Each biome is a look (which ground surfaces blend in) plus a planting rule
 * (what the scatter pass is allowed to grow there). Names are original.
 */
export const BIOMES = {
  shore:     { id: 0, label: 'Shore',      ground: ['sand', 'gravel'],          grass: 0.15, trees: 0.04, tint: [0.92, 0.88, 0.74] },
  meadow:    { id: 1, label: 'Meadow',     ground: ['meadow', 'grass'],         grass: 1.00, trees: 0.10, tint: [0.72, 0.82, 0.48] },
  birchwood: { id: 2, label: 'Birchwood',  ground: ['grass', 'forest_floor'],   grass: 0.75, trees: 0.55, tint: [0.66, 0.78, 0.46] },
  pinewood:  { id: 3, label: 'Pinewood',   ground: ['forest_floor', 'moss'],    grass: 0.45, trees: 0.85, tint: [0.42, 0.55, 0.38] },
  deepwood:  { id: 4, label: 'Deepwood',   ground: ['forest_floor', 'moss'],    grass: 0.30, trees: 1.00, tint: [0.32, 0.44, 0.32] },
  marsh:     { id: 5, label: 'Marsh',      ground: ['mud', 'moss'],             grass: 0.55, trees: 0.30, tint: [0.46, 0.50, 0.36] },
  moor:      { id: 6, label: 'Moor',       ground: ['grass', 'dirt', 'rock'],   grass: 0.50, trees: 0.16, tint: [0.60, 0.60, 0.44] },
  crags:     { id: 7, label: 'Crags',      ground: ['rock', 'gravel'],          grass: 0.08, trees: 0.05, tint: [0.58, 0.58, 0.60] },
  snowline:  { id: 8, label: 'Snowline',   ground: ['snow', 'rock'],            grass: 0.00, trees: 0.03, tint: [0.92, 0.94, 0.98] },
};
export const BIOME_BY_ID = Object.fromEntries(Object.values(BIOMES).map(b => [b.id, b]));
export const BIOME_NAMES = Object.keys(BIOMES);

/** Default world shape. Every number is in metres. */
export const WORLD_DEFAULTS = {
  seed: 20260922,
  size: 1024,        // the world is this many metres on a side, centred on the origin
  cell: 1,           // one height sample per metre
  waterLevel: 2.6,   // anything under this is sea, lake or marsh water
  maxHeight: 118,    // the tallest peak the shaping aims for
  mountainAmount: 0.62,
  riverAmount: 1.0,
  coastFalloff: 0.20, // how much of the outer edge slopes down into open water
  treeLine: 64,      // above this, trees give out
  snowLine: 78,
};

/**
 * Build the world. Call `.next()` on the returned generator until `done`, reading `value.progress`
 * (0..1) and `value.label` to drive a loading bar. The final `value.world` is the world object.
 */
export function* generateWorld(options = {}) {
  const opt = { ...WORLD_DEFAULTS, ...options };
  const { seed, size, cell, waterLevel } = opt;
  const dim = Math.round(size / cell) + 1;          // samples across, inclusive of both edges
  const heights = new Float32Array(dim * dim);
  const moisture = new Float32Array(dim * dim);
  const biome = new Uint8Array(dim * dim);
  const half = size / 2;

  // --- pass 1: height -------------------------------------------------------------------------
  // Shaping, in the order the layers matter:
  //   continent  — a soft dome with a noisy edge, so the world has a coast instead of a cliff
  //   base       — warped rolling hills
  //   mountains  — ridged noise, gated by its own large-scale mask so ranges sit in one place
  //   rivers     — a carve where a warped noise band crosses its own middle
  const S = 1 / 340;      // the size of the big landforms: one "hill" is about 340 m
  const rows = dim;
  let minH = Infinity, maxH = -Infinity;
  for (let j = 0; j < rows; j++) {
    const z = -half + j * cell;
    for (let i = 0; i < dim; i++) {
      const x = -half + i * cell;

      // continent mask: 1 in the middle, easing to 0 at the rim, with the rim itself pushed
      // around by noise so the coastline wanders.
      const rx = x / half, rz = z / half;
      const r = Math.sqrt(rx * rx + rz * rz);
      const coastWobble = (fbm(x * S * 1.6, z * S * 1.6, { seed: seed + 5, octaves: 4 }) - 0.5) * 0.34;
      const continent = 1 - smoothstep(0.62 + coastWobble, 1.02 + coastWobble, r);

      // base hills, domain-warped so the valleys bend
      const [wx, wz] = warp2(x * S, z * S, { seed: seed + 11, strength: 0.42, freq: 1.1 });
      let base = fbm(wx, wz, { seed, octaves: 6, gain: 0.52 });
      base = Math.pow(base, 1.35);                       // pull the low ground down, keep peaks

      // where mountains are allowed to be at all
      const rangeMask = smoothstep(0.52, 0.82, fbm(x * S * 0.55 + 31, z * S * 0.55 - 17, { seed: seed + 77, octaves: 3 }));
      const mtn = ridged(wx * 1.9, wz * 1.9, { seed: seed + 131, octaves: 6, gain: 0.55 });
      const mountains = mtn * rangeMask * opt.mountainAmount;

      // medium-scale roughness so hillsides are not billiard-table smooth
      const rough = (billow(x * 0.035, z * 0.035, { seed: seed + 401, octaves: 3 }) - 0.5) * 0.045;

      let h = (base * 0.52 + mountains * 1.05 + rough) * continent;

      // rivers: a band where a warped noise field crosses 0.5. Widened and deepened downstream
      // (which here means "at lower ground"), so they open out before they reach the sea.
      const riv = fbm(x * S * 2.1 + 101, z * S * 2.1 + 61, { seed: seed + 909, octaves: 4 });
      const band = Math.abs(riv - 0.5);
      const width = 0.018 + 0.022 * (1 - clamp(h * 1.6, 0, 1));
      const river = (1 - smoothstep(0, width, band)) * opt.riverAmount;
      h -= river * (0.055 + 0.03 * (1 - clamp(h, 0, 1)));

      let metres = h * opt.maxHeight;
      // dig the sea floor away from the shore so the water has some depth to it
      if (continent < 0.12) metres -= (0.12 - continent) * 90;
      heights[j * dim + i] = metres;
      if (metres < minH) minH = metres;
      if (metres > maxH) maxH = metres;
    }
    if ((j & 31) === 0) yield { progress: (j / rows) * 0.55, label: 'shaping the land' };
  }

  // --- pass 2: a light thermal smoothing ------------------------------------------------------
  // Raw ridged noise leaves single-cell spikes that read as glitter when the sun hits them. Two
  // passes of a gentle 3x3 blur, weighted so peaks keep their shape, takes those out without
  // flattening the ranges.
  for (let pass = 0; pass < 2; pass++) {
    const copy = heights.slice();
    for (let j = 1; j < dim - 1; j++) {
      for (let i = 1; i < dim - 1; i++) {
        const k = j * dim + i;
        const sum = copy[k - dim - 1] + copy[k - dim] + copy[k - dim + 1] +
                    copy[k - 1] + copy[k] * 4 + copy[k + 1] +
                    copy[k + dim - 1] + copy[k + dim] + copy[k + dim + 1];
        heights[k] = sum / 12;
      }
    }
    yield { progress: 0.55 + pass * 0.05, label: 'settling the slopes' };
  }

  // --- pass 3: moisture and biome -------------------------------------------------------------
  // Moisture is its own noise field, raised near water and lowered on steep sunny slopes. The
  // biome then falls out of (height, slope, moisture) through a small decision ladder.
  for (let j = 0; j < dim; j++) {
    for (let i = 0; i < dim; i++) {
      const k = j * dim + i;
      const x = -half + i * cell, z = -half + j * cell;
      const h = heights[k];
      const hx = heights[j * dim + Math.min(dim - 1, i + 1)] - heights[j * dim + Math.max(0, i - 1)];
      const hz = heights[Math.min(dim - 1, j + 1) * dim + i] - heights[Math.max(0, j - 1) * dim + i];
      const slope = Math.min(1, Math.hypot(hx, hz) / (2 * cell) / 1.4);   // 0 flat … 1 near-vertical

      let m = fbm(x * 0.0042 + 7, z * 0.0042 - 3, { seed: seed + 555, octaves: 4 });
      m += smoothstep(waterLevel + 9, waterLevel - 1, h) * 0.35;   // wetter near the waterline
      m -= smoothstep(40, 95, h) * 0.30;                            // drier up high
      m -= slope * 0.22;                                            // water runs off a steep face
      m = clamp(m, 0, 1);
      moisture[k] = m;

      biome[k] = classify(h, slope, m, waterLevel, opt);
    }
    if ((j & 63) === 0) yield { progress: 0.65 + (j / dim) * 0.35, label: 'seeding the biomes' };
  }

  const world = makeWorld({ opt, dim, cell, size, half, heights, moisture, biome, waterLevel, minH, maxH });
  yield { progress: 1, label: 'ready', world };
  return world;
}

/** The biome decision ladder. Kept separate so a test can walk it. */
export function classify(h, slope, m, waterLevel, opt = WORLD_DEFAULTS) {
  if (h > opt.snowLine) return BIOMES.snowline.id;
  if (slope > 0.55 || h > opt.treeLine) return BIOMES.crags.id;
  if (h < waterLevel + 1.6) return BIOMES.shore.id;
  if (h < waterLevel + 5.0 && m > 0.62) return BIOMES.marsh.id;
  if (h > 52) return BIOMES.moor.id;
  if (m > 0.66) return BIOMES.deepwood.id;
  if (m > 0.52) return BIOMES.pinewood.id;
  if (m > 0.40) return BIOMES.birchwood.id;
  return BIOMES.meadow.id;
}

/** Wrap the raw arrays in the reader every other module uses. */
function makeWorld({ opt, dim, cell, size, half, heights, moisture, biome, waterLevel, minH, maxH }) {
  const last = dim - 1;

  /** Grid index from world metres, clamped to the edge so a query off the map still answers. */
  function gx(x) { return clamp((x + half) / cell, 0, last); }
  function gz(z) { return clamp((z + half) / cell, 0, last); }

  /** Ground height at any point, bilinear between the four samples around it. */
  function heightAt(x, z) {
    const fx = gx(x), fz = gz(z);
    const i = Math.floor(fx), j = Math.floor(fz);
    const i2 = Math.min(last, i + 1), j2 = Math.min(last, j + 1);
    const tx = fx - i, tz = fz - j;
    const a = heights[j * dim + i], b = heights[j * dim + i2];
    const c = heights[j2 * dim + i], d = heights[j2 * dim + i2];
    return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
  }

  /** The exact value at a grid node — what the terrain mesh uses so the mesh matches the array. */
  function heightAtNode(i, j) {
    return heights[clamp(j, 0, last) * dim + clamp(i, 0, last)];
  }

  /** Surface normal from the slope of the grid. `out` is any {x,y,z}. */
  function normalAt(x, z, out = { x: 0, y: 1, z: 0 }) {
    const d = cell;
    const hl = heightAt(x - d, z), hr = heightAt(x + d, z);
    const hd = heightAt(x, z - d), hu = heightAt(x, z + d);
    let nx = hl - hr, ny = 2 * d, nz = hd - hu;
    const len = Math.hypot(nx, ny, nz) || 1;
    out.x = nx / len; out.y = ny / len; out.z = nz / len;
    return out;
  }

  /** 0 = dead flat, 1 = a wall. The number the scatter and the ground shader both key off. */
  function slopeAt(x, z) {
    const n = normalAt(x, z, { x: 0, y: 1, z: 0 });
    return clamp(1 - n.y, 0, 1) * 1.6;
  }

  function moistureAt(x, z) {
    const i = Math.round(gx(x)), j = Math.round(gz(z));
    return moisture[j * dim + i];
  }
  function biomeAt(x, z) {
    const i = Math.round(gx(x)), j = Math.round(gz(z));
    return biome[j * dim + i];
  }
  function biomeNameAt(x, z) { return BIOME_BY_ID[biomeAt(x, z)]?.label || '—'; }

  function isWater(x, z) { return heightAt(x, z) < waterLevel; }
  function depthAt(x, z) { return Math.max(0, waterLevel - heightAt(x, z)); }

  /** Somewhere sensible to put the player: dry, gently sloped, not in the sea, near the middle. */
  function findSpawn(seed = opt.seed) {
    const rng = makeRng(seed ^ 0x51ed);
    let best = null;
    for (let tries = 0; tries < 4000; tries++) {
      const a = rng() * Math.PI * 2;
      const rad = Math.sqrt(rng()) * half * 0.42;
      const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
      const h = heightAt(x, z);
      if (h < waterLevel + 2.5 || h > 42) continue;
      const s = slopeAt(x, z);
      if (s > 0.22) continue;
      const score = -s * 40 - Math.abs(h - 16) * 0.4;
      if (!best || score > best.score) best = { x, z, y: h, score, biome: biomeNameAt(x, z) };
      if (tries > 600 && best) break;
    }
    return best || { x: 0, z: 0, y: heightAt(0, 0), biome: biomeNameAt(0, 0) };
  }

  /**
   * March a ray until it goes under the ground, then bisect. Used for click-to-move and for
   * working out what the pointer is over. Marching the heightmap directly rather than raycasting
   * the meshes means the answer does not change with the terrain's detail level, and it is the
   * same answer the character's feet will get.
   */
  function raycast(origin, dir, maxDist = 3000) {
    const step0 = 0.6;
    let t = 0, prev = origin.y - heightAt(origin.x, origin.z);
    if (prev <= 0) return { x: origin.x, y: origin.y, z: origin.z, t: 0, hit: true };
    while (t < maxDist) {
      // longer strides high above the ground, short ones close to it
      const step = Math.max(step0, Math.min(24, prev * 0.7));
      t += step;
      const x = origin.x + dir.x * t, y = origin.y + dir.y * t, z = origin.z + dir.z * t;
      if (!contains(x, z)) return null;
      const d = y - heightAt(x, z);
      if (d <= 0) {
        // bisect between the last point above and this one below
        let lo = t - step, hi = t;
        for (let i = 0; i < 24; i++) {
          const mid = (lo + hi) / 2;
          const mx = origin.x + dir.x * mid, my = origin.y + dir.y * mid, mz = origin.z + dir.z * mid;
          if (my - heightAt(mx, mz) > 0) lo = mid; else hi = mid;
        }
        const ft = (lo + hi) / 2;
        return { x: origin.x + dir.x * ft, y: origin.y + dir.y * ft, z: origin.z + dir.z * ft, t: ft, hit: true };
      }
      prev = d;
    }
    return null;
  }

  function contains(x, z) { return x >= -half && x <= half && z >= -half && z <= half; }

  return {
    ...opt, dim, cell, size, half, waterLevel, raycast, contains,
    heights, moisture, biome,
    min: minH, max: maxH,
    heightAt, heightAtNode, normalAt, slopeAt,
    moistureAt, biomeAt, biomeNameAt, isWater, depthAt, findSpawn,
  };
}

/** Convenience for the node tests and any caller that does not want a progress bar. */
export function generateWorldSync(options = {}) {
  const it = generateWorld(options);
  let step = it.next();
  while (!step.done && !step.value.world) step = it.next();
  return step.value.world;
}
