// Farhold round 23 — where the GPU grass grows, and what colour it is.
//
// Pure: no Three.js. js/grass-gpu.js bakes these answers into a small texture around the player; the
// node tests ask them directly.
//
// A blade is only as right as the ground under it, so the rules are the same ones the CPU grass in
// js/props.js has always used — plantable ground, no road, no levelled plot — plus the two it never
// had: no lawn in the middle of a town, and no grass on sand, ice or ash.

/** How much grass a biome grows, 0..1. Anything not listed grows a little. */
export const GRASS_DENSITY = {
  grassland: 0.85, savanna: 0.8, hills: 0.75, hallowed: 0.9, marsh: 0.6,
  temperateForest: 0.62, rainforest: 0.55, shrubland: 0.45, borealForest: 0.35,
  tundra: 0.22, veiledHills: 0.4, blighted: 0.3, glimmerwaste: 0.35, mountains: 0.12,
  // no grass on sand, ice, ash or bare rock
  beach: 0, desert: 0, badlands: 0, ice: 0, snowyPeaks: 0, volcanic: 0, ashPlain: 0, seaIce: 0,
  deepOcean: 0, ocean: 0, coast: 0, lake: 0,
};

/** The same leaf tints js/props.js gives its scatter, so the grass and the bushes agree. */
export const GRASS_TINT = {
  grassland: '#6a9a4a', savanna: '#9aa050', hills: '#6f9048', hallowed: '#86d09a', marsh: '#557a52',
  temperateForest: '#4f8a48', rainforest: '#3f8a44', shrubland: '#84984e', borealForest: '#46705a',
  tundra: '#7a8a70', veiledHills: '#6e6082', blighted: '#5e4e66', glimmerwaste: '#a99ada',
  mountains: '#727a5a',
};
const DEFAULT_TINT = '#5f8f45';

export function grassDensityFor(biomeKey) {
  const d = GRASS_DENSITY[biomeKey];
  return d == null ? 0.3 : d;
}
export function grassTintFor(biomeKey) { return GRASS_TINT[biomeKey] || DEFAULT_TINT; }

/**
 * The density at one point of ground, 0..1. `q` is whatever the terrain can answer:
 *   { biomeKey, plantable, road (0..1), cleared, town (0..1 how far inside a settlement) }
 * Grass fades out over the last stretch of a road's shoulder rather than stopping at a line.
 */
export function grassAt(q = {}) {
  if (!q.plantable || q.cleared) return 0;
  let d = grassDensityFor(q.biomeKey);
  d *= 1 - smoothstep(0.25, 0.5, q.road || 0);
  d *= 1 - smoothstep(0.55, 0.9, q.town || 0);
  return Math.max(0, Math.min(1, d));
}

function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * THE LATTICE, so a test can check the property that matters without a GPU.
 *
 * An instance is a SLOT: `slotCell(originCell, offset)` says which square of ground it draws, and
 * every blade property is a hash of THAT square. The origin moves in whole squares, so the same
 * ground always gets the same blade whichever slot is drawing it — the grass cannot crawl.
 * (highdef-3d/README.md "The grass belongs to the ground", and the same trap here.)
 */
export function slotCell(originCell, offset) { return [originCell[0] + offset[0], originCell[1] + offset[1]]; }
export function snapOrigin(x, z, cell) { return [Math.round(x / cell), Math.round(z / cell)]; }

/** The shader's hash, on the CPU: four 0..1 numbers from a whole-number square (pcg4d). */
export function hashCell(cx, cz, k = 0) {
  let x = cx >>> 0, y = cz >>> 0, z = k >>> 0, w = 0x2545f491;
  const M = 1664525, C = 1013904223;
  x = (Math.imul(x, M) + C) >>> 0; y = (Math.imul(y, M) + C) >>> 0; z = (Math.imul(z, M) + C) >>> 0; w = (Math.imul(w, M) + C) >>> 0;
  x = (x + Math.imul(y, w)) >>> 0; y = (y + Math.imul(z, x)) >>> 0; z = (z + Math.imul(x, y)) >>> 0; w = (w + Math.imul(y, z)) >>> 0;
  x ^= x >>> 16; y ^= y >>> 16; z ^= z >>> 16; w ^= w >>> 16;
  x = (x + Math.imul(y, w)) >>> 0; y = (y + Math.imul(z, x)) >>> 0; z = (z + Math.imul(x, y)) >>> 0; w = (w + Math.imul(y, z)) >>> 0;
  return [x / 4294967296, y / 4294967296, z / 4294967296, w / 4294967296];
}
