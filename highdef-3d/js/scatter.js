// Where every plant, rock and log in the world goes.
//
// This is deliberately pure arithmetic: no three.js, no meshes, no textures. It takes the world
// field and the placement rules and returns lists of points. That means the node tests can check
// that nothing is planted in a lake or on a cliff face without a browser anywhere in sight, and it
// means the same seed always grows the same forest.
//
// The placement itself is a jittered grid rather than true blue-noise: split the world into cells,
// and inside each cell throw down a number of candidate points from that cell's own random stream.
// Each candidate then has to survive the rules — deep enough soil, gentle enough slope, above the
// waterline, not on top of something already placed. It is not as evenly spaced as a proper
// Poisson-disc scatter, but it is a hundred times faster, it is resumable cell by cell, and a
// forest floor is not evenly spaced anyway.

import { makeRng, clamp, fbm } from './noise.js';
import { BIOME_BY_ID, BIOMES } from './world.js';

/** A stable random stream for one cell of one layer, so cells can be built in any order. */
function cellRng(seed, layer, cx, cz) {
  let h = (seed ^ (layer * 2654435761) ^ (cx * 668265263) ^ (cz * 374761393)) >>> 0;
  return makeRng(h || 1);
}

/** Pick a key from a `{ key: weight }` object. */
function pickWeighted(weights, r) {
  let total = 0;
  for (const k in weights) total += weights[k];
  if (total <= 0) return null;
  let t = r * total;
  for (const k in weights) { t -= weights[k]; if (t <= 0) return k; }
  return Object.keys(weights)[0];
}

const LAYER_INDEX = { trees: 1, bushes: 2, ferns: 3, flowers: 4, rocks: 5, debris: 6, ground: 7 };

/** biome id -> the key used in the rules file. Built once; the inner loop runs millions of times. */
const KEY_BY_ID = Object.fromEntries(Object.entries(BIOMES).map(([k, v]) => [v.id, k]));

/**
 * Scatter one layer over the whole world.
 *
 * @param {object} world     from world.js
 * @param {object} rules     one `layers[...]` entry from data/vegetation.json
 * @param {string} layerName e.g. 'trees'
 * @param {object} opts      { density = 1, seed, exclusions = [] }
 * @returns {Map<string, Array>} cell key "cx,cz" → array of
 *          { kind, x, y, z, rot, scale, tilt, variant, biome }
 */
export function scatterLayer(world, rules, layerName, opts = {}) {
  const {
    density: densityScale = 1,
    seed = world.seed,
    variants = 3,
    exclusions = [],
  } = opts;

  const cellSize = rules.cellSize;
  const cells = Math.ceil(world.size / cellSize);
  const half = world.size / 2;
  const layerIdx = LAYER_INDEX[layerName] || 9;
  const out = new Map();

  // A "clearing" field: a very large-scale noise that opens glades in the thick of a wood. Without
  // one, a dense forest is a uniform mat of trees with no shape to it and nowhere to walk.
  const clearingAt = (x, z) => clamp(fbm(x * 0.0035 + 41, z * 0.0035 - 23, { seed: seed + 8123, octaves: 3 }) * 2.1 - 0.55, 0, 1);

  for (let cz = 0; cz < cells; cz++) {
    for (let cx = 0; cx < cells; cx++) {
      const rng = cellRng(seed, layerIdx, cx, cz);
      const ox = -half + cx * cellSize;
      const oz = -half + cz * cellSize;

      // How many candidates to try in this cell: the highest density any biome asks for, times
      // the cell area. Most will be rejected; that rejection is what shapes the edges.
      const maxDensity = Math.max(...Object.values(rules.biomes).map(b => b.density));
      const tries = Math.min(4000, Math.round(maxDensity * cellSize * cellSize * densityScale * 1.6));
      if (tries <= 0) continue;

      const placed = [];
      for (let i = 0; i < tries; i++) {
        const x = ox + rng() * cellSize;
        const z = oz + rng() * cellSize;
        const y = world.heightAt(x, z);
        if (y < world.waterLevel + 0.15) continue;

        const slope = world.slopeAt(x, z);
        if (slope > rules.maxSlope) continue;

        const biomeId = world.biomeAt(x, z);
        const biome = BIOME_BY_ID[biomeId];
        const rule = rules.biomes[KEY_BY_ID[biomeId]];
        if (!rule || rule.density <= 0) continue;

        // The biome's own density, thinned toward its edge by slope and by the clearing field.
        let chance = (rule.density / maxDensity) * densityScale;
        chance *= 1 - clamp(slope / rules.maxSlope, 0, 1) * 0.55;
        if (layerName === 'trees' || layerName === 'bushes') chance *= clearingAt(x, z);
        if (rng() > chance) continue;

        const kind = pickWeighted(rule.weights, rng());
        if (!kind) continue;

        // keep things from standing inside each other
        const clear = rules.clearRadius || 0;
        if (clear > 0) {
          let blocked = false;
          for (const p of placed) {
            if ((p.x - x) ** 2 + (p.z - z) ** 2 < clear * clear) { blocked = true; break; }
          }
          if (blocked) continue;
        }
        let excluded = false;
        for (const ex of exclusions) {
          if ((ex.x - x) ** 2 + (ex.z - z) ** 2 < ex.r * ex.r) { excluded = true; break; }
        }
        if (excluded) continue;

        // A plant leans very SLIGHTLY downhill, and sits a few centimetres into the ground so it
        // never looks stuck on the surface. The lean is deliberately small: a tree grows toward
        // the light, not square to the hill it is on, and at the old 0.55 a wood on a slope looked
        // like it had been blown over.
        const n = world.normalAt(x, z);
        const lean = layerName === 'trees' ? 0.18 : 0.38;
        placed.push({
          kind,
          x, y: y - 0.06, z,
          rot: rng() * Math.PI * 2,
          scale: 0.78 + rng() * 0.48,
          tiltX: (n.z * lean) + (rng() - 0.5) * 0.06,
          tiltZ: (-n.x * lean) + (rng() - 0.5) * 0.06,
          variant: Math.floor(rng() * variants),
          biome: biome ? biome.label : '—',
          biomeId,
        });
      }
      if (placed.length) out.set(`${cx},${cz}`, placed);
    }
  }
  return out;
}

/**
 * Run every layer in the rules file.
 * @returns {{ [layer]: Map }} plus a `counts` summary.
 */
export function scatterWorld(world, rulesFile, opts = {}) {
  const result = { counts: {}, cellSizes: {} };
  const exclusions = opts.exclusions || [];
  for (const [name, rules] of Object.entries(rulesFile.layers)) {
    const d = (opts.densities && opts.densities[name]) ?? opts.density ?? 1;
    const cells = scatterLayer(world, rules, name, { ...opts, density: d, exclusions });
    result[name] = cells;
    result.cellSizes[name] = rules.cellSize;
    let n = 0;
    for (const arr of cells.values()) n += arr.length;
    result.counts[name] = n;
  }
  return result;
}

/**
 * Everything within `radius` of a point, across every layer. Used for collision and for the
 * "what am I looking at" readout.
 */
export function nearbyInstances(scatter, layer, cellSize, x, z, radius, worldHalf = 512) {
  const cells = scatter[layer];
  if (!cells) return [];
  const half = radius + cellSize;
  const out = [];
  const c0x = Math.floor((x - half + worldHalf) / cellSize), c1x = Math.floor((x + half + worldHalf) / cellSize);
  const c0z = Math.floor((z - half + worldHalf) / cellSize), c1z = Math.floor((z + half + worldHalf) / cellSize);
  for (let cz = c0z; cz <= c1z; cz++) {
    for (let cx = c0x; cx <= c1x; cx++) {
      const arr = cells.get(`${cx},${cz}`);
      if (!arr) continue;
      for (const p of arr) {
        if ((p.x - x) ** 2 + (p.z - z) ** 2 <= radius * radius) out.push(p);
      }
    }
  }
  return out;
}
