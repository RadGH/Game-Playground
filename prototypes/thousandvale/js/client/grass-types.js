// 2026-10-20 — GPU grass (owner: "Can we have GPU grass with various textures by biome or surface?"). WHAT kind of grass
// grows on each metre of ground, and how far the field reaches — decided without three.js so the node tests can ask it
// directly. js/client/grass-gpu.js bakes these answers into a small wrapping texture round the player and the graphics
// card draws the blades.
//
//   GRASS_TYPES                 the blade looks (short turf, meadow with flowers, tall gold grass, heather, reeds, forest
//                               floor, fell grass, Vharlen ash grass, broad jungle blades, …): height, width, how thick it
//                               grows, how stiff it is in the wind, how it tapers, root / tip colour and flower heads
//   GRASS_BIOMES                per terrain biome: which type grows there, how much of the ground it covers, and an
//                               optional second type that grows in patches (a meadow with clumps of wild grass)
//   GRASS_PALETTES              per province palette (`downs` = Torbor Downs regenerated, `vharl` = Vharlen) the rows
//                               that differ — every region its own grass
//   grassAt({ biome, palette, nav, x, z }) -> { type, cover } | null     null = nothing grows here
//   GRASS_DISTANCES             the Settings choices: how far the field reaches and how many blades it may use
//   grassLattice(distance)      the blade slots (an instance is a SLOT, not a blade — see grass-gpu.js), for the GPU and tests
//   grassHash(cx, cz, k)        the shader's integer hash, on the CPU (tests check the field cannot crawl)
//   typeTable()                 the types packed for the shader (Float32Array, TYPE_ROWS vec4 per type, linear colours)

import { NAV } from '../rules/terrain-read.js';
import { groundOpen, isSteep, cellHash } from './clutter-plan.js';

/**
 * The blade looks. Index 0 is "no grass"; the order of the rest is the index the shader reads, so add new types at the END.
 *   h       [min, max] height in metres          w      blade width at the root (m)
 *   dense   0..1 how many of the slots it fills  stiff  0..1 how little the wind bends it
 *   lean    0..1 how far it curves over at rest  taper  width profile: 1 = straight to a point, < 1 stays wide longer
 *   root / tip   colours (sRGB hex) at the bottom and top of a blade
 *   flower  { p: share of blades with a head, a / b: the two head colours, size: head width in m }
 */
export const GRASS_TYPES = Object.freeze([
  null,
  { id: 'turf', name: 'short turf', h: [0.3, 0.56], w: 0.085, dense: 1, stiff: 0.55, lean: 0.25, taper: 1, root: '#36561a', tip: '#8cba48', flower: { p: 0.025, a: '#f4f2e8', b: '#ecd44a', size: 0.035 } },
  { id: 'meadow', name: 'meadow with flowers', h: [0.36, 0.68], w: 0.085, dense: 0.95, stiff: 0.35, lean: 0.3, taper: 1, root: '#355620', tip: '#90bc50', flower: { p: 0.2, a: '#f1ecfa', b: '#eabc2e', size: 0.055 } },
  { id: 'wild', name: 'tall wild grass', h: [0.6, 1.1], w: 0.072, dense: 0.95, stiff: 0.22, lean: 0.45, taper: 1.15, root: '#5e6230', tip: '#d6be6c', flower: { p: 0.14, a: '#e2d08e', b: '#c4a258', size: 0.028 } },
  { id: 'heather', name: 'heather sprigs', h: [0.16, 0.34], w: 0.1, dense: 0.9, stiff: 0.8, lean: 0.15, taper: 0.45, root: '#45362a', tip: '#6c5a46', flower: { p: 0.75, a: '#8a4688', b: '#b46aaa', size: 0.075 } },
  { id: 'reed', name: 'reeds and rushes', h: [0.95, 1.6], w: 0.05, dense: 0.65, stiff: 0.62, lean: 0.12, taper: 0.9, root: '#435426', tip: '#9c9a58', flower: { p: 0.18, a: '#5c3a22', b: '#7a5838', size: 0.034 } },
  { id: 'forest', name: 'forest-floor grass', h: [0.18, 0.42], w: 0.06, dense: 0.5, stiff: 0.4, lean: 0.38, taper: 1, root: '#22341a', tip: '#5e7a38', flower: { p: 0, a: '#ffffff', b: '#ffffff', size: 0 } },
  { id: 'fell', name: 'coarse fell grass', h: [0.18, 0.42], w: 0.055, dense: 0.85, stiff: 0.55, lean: 0.42, taper: 1.1, root: '#4e5a36', tip: '#a6ae72', flower: { p: 0.04, a: '#ece8d6', b: '#dcd6b4', size: 0.03 } },
  { id: 'ash', name: 'Vharlen ash grass', h: [0.32, 0.66], w: 0.062, dense: 0.85, stiff: 0.45, lean: 0.42, taper: 1, root: '#2c281c', tip: '#7f7c4a', flower: { p: 0.05, a: '#cc6a36', b: '#d8c060', size: 0.03 } },
  { id: 'jungle', name: 'broad jungle blades', h: [0.4, 0.8], w: 0.13, dense: 0.55, stiff: 0.2, lean: 0.6, taper: 0.55, root: '#1c3814', tip: '#5e9a38', flower: { p: 0.02, a: '#e05a6a', b: '#f0a040', size: 0.07 } },
  { id: 'lush', name: 'lush green grass', h: [0.36, 0.68], w: 0.085, dense: 0.95, stiff: 0.35, lean: 0.35, taper: 1, root: '#2d4c1c', tip: '#86ae48', flower: { p: 0.04, a: '#f4f2e8', b: '#ecd44a', size: 0.04 } },
  { id: 'withered', name: 'withered grass', h: [0.2, 0.5], w: 0.055, dense: 0.7, stiff: 0.3, lean: 0.55, taper: 1, root: '#4a4232', tip: '#9a8c6a', flower: { p: 0, a: '#ffffff', b: '#ffffff', size: 0 } },
  { id: 'glimmer', name: 'glimmer grass', h: [0.15, 0.4], w: 0.05, dense: 0.5, stiff: 0.6, lean: 0.2, taper: 1, root: '#383250', tip: '#b8a8e0', flower: { p: 0.2, a: '#d8f0ff', b: '#c4a2ff', size: 0.04 } },
]);
export const TYPE_INDEX = Object.freeze(Object.fromEntries(GRASS_TYPES.map((t, i) => [t ? t.id : 'none', i])));

/**
 * Per biome (the terrain bake's keys) in a province with no palette of its own. `type` + `cover` (0..1 of the ground);
 * `mix` = [second type, share 0..1] grown in patches ~14 m across. cover 0 = nothing grows (sand, rock, ice, fields, roads).
 */
const NONE = Object.freeze({ type: 'none', cover: 0 });
export const GRASS_BIOMES = Object.freeze({
  grassland: { type: 'lush', cover: 0.9, mix: ['meadow', 0.25] },
  hallowed: { type: 'meadow', cover: 0.95 },
  pasture: { type: 'turf', cover: 0.85 },
  orchard: { type: 'meadow', cover: 0.7 },
  graveyard: { type: 'wild', cover: 0.45 },
  field: { type: 'turf', cover: 0.12 },
  hills: { type: 'fell', cover: 0.8, mix: ['heather', 0.3] },
  veiledHills: { type: 'fell', cover: 0.6, mix: ['withered', 0.4] },
  shrubland: { type: 'wild', cover: 0.65, mix: ['heather', 0.25] },
  savanna: { type: 'wild', cover: 0.88 },
  temperateForest: { type: 'forest', cover: 0.55 },
  borealForest: { type: 'forest', cover: 0.4, mix: ['fell', 0.3] },
  rainforest: { type: 'jungle', cover: 0.6 },
  marsh: { type: 'reed', cover: 0.75, mix: ['lush', 0.35] },
  lake: { type: 'reed', cover: 0.45, mix: ['lush', 0.4] },
  tundra: { type: 'fell', cover: 0.35 },
  mountains: { type: 'fell', cover: 0.12 },
  blighted: { type: 'withered', cover: 0.3 },
  badlands: { type: 'wild', cover: 0.15 },
  glimmerwaste: { type: 'glimmer', cover: 0.12 },
  volcanic: { type: 'ash', cover: 0.04 }, ashPlain: { type: 'ash', cover: 0.05 },
  coast: { type: 'wild', cover: 0.1 },
  beach: NONE, desert: NONE, ice: NONE, seaIce: NONE, snowyPeaks: NONE, deepOcean: NONE, ocean: NONE,
  crop: NONE, yard: { type: 'turf', cover: 0.06 }, gravel: NONE, road: NONE,
});

/** Per province palette: the rows that differ. Anything missing falls back to GRASS_BIOMES. */
export const GRASS_PALETTES = Object.freeze({
  /**
   * Torbor Downs regenerated (tools/lib/torbor.mjs TORBOR_BIOME_NAMES): short bright turf on the Chalk Downs, a flowering
   * meadow at Saint's Meadow, heather on the Heather Moor, gold wild grass on the Golden Wolds, reeds in Brack Fen, dark
   * sparse grass under the Oakwood and the Pine Highwood, coarse grey-green grass on the High Fell.
   */
  downs: {
    grassland: { type: 'turf', cover: 0.95, mix: ['meadow', 0.12] },
    hallowed: { type: 'meadow', cover: 0.95, mix: ['lush', 0.2] },
    pasture: { type: 'turf', cover: 0.9 },
    hills: { type: 'heather', cover: 0.85, mix: ['fell', 0.35] },
    savanna: { type: 'wild', cover: 0.95, mix: ['meadow', 0.06] },
    shrubland: { type: 'wild', cover: 0.65, mix: ['heather', 0.3] },
    marsh: { type: 'reed', cover: 0.85, mix: ['lush', 0.3] },
    lake: { type: 'reed', cover: 0.55, mix: ['lush', 0.4] },
    temperateForest: { type: 'forest', cover: 0.55, mix: ['lush', 0.15] },
    borealForest: { type: 'forest', cover: 0.4, mix: ['fell', 0.25] },
    veiledHills: { type: 'withered', cover: 0.65, mix: ['fell', 0.3] },
    badlands: { type: 'wild', cover: 0.22 },
    tundra: { type: 'fell', cover: 0.72 },
    mountains: { type: 'fell', cover: 0.18 },
    beach: NONE, snowyPeaks: NONE,
  },
  /** Vharlen, the Burning Isle: thin olive ash grass where Torbor has turf, broad blades in the steaming jungle. */
  vharl: {
    grassland: { type: 'ash', cover: 0.7 },
    savanna: { type: 'ash', cover: 0.85, mix: ['wild', 0.35] },
    shrubland: { type: 'ash', cover: 0.55, mix: ['jungle', 0.25] },
    rainforest: { type: 'jungle', cover: 0.65, mix: ['lush', 0.15] },
    marsh: { type: 'reed', cover: 0.7, mix: ['jungle', 0.2] },
    lake: { type: 'reed', cover: 0.4 },
    blighted: { type: 'withered', cover: 0.25, mix: ['ash', 0.4] },
    badlands: { type: 'ash', cover: 0.1 },
    mountains: { type: 'ash', cover: 0.08 },
    glimmerwaste: { type: 'glimmer', cover: 0.18 },
    ashPlain: { type: 'ash', cover: 0.04 }, volcanic: { type: 'ash', cover: 0.02 },
    coast: { type: 'ash', cover: 0.06 },
    desert: NONE, beach: NONE,
  },
});

/** The row for a biome in a palette (never null: an unknown biome reads as grassland). */
export function grassRow(biome, palette = null) {
  return GRASS_PALETTES[palette]?.[biome] || GRASS_BIOMES[biome] || GRASS_BIOMES.grassland;
}

const PATCH = 14;   // metres across a patch of the second type
/** Smooth value noise 0..1 at ~PATCH m, from the integer hash (same on every machine). */
export function patchNoise(x, z, salt = 41) {
  const gx = x / PATCH, gz = z / PATCH, i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = cellHash(i, j, salt), b = cellHash(i + 1, j, salt), c = cellHash(i, j + 1, salt), d = cellHash(i + 1, j + 1, salt);
  return (a * (1 - sx) + b * sx) * (1 - sz) + (c * (1 - sx) + d * sx) * sz;
}

/**
 * What grows on the metre of ground at (x, z). env = { biome, palette, nav (raw nav bits; 0 = no nav, nothing grows),
 * x, z }. Nothing on roads, towns, buildings, solids, water or steep ground (clutter-plan.js's rule — the tufts and the
 * GPU grass agree). Returns null or { type (index into GRASS_TYPES), cover (0..1) }.
 */
export function grassAt({ biome, palette = null, nav = 0, x = 0, z = 0 }) {
  if (!groundOpen(nav | 0) || isSteep(nav | 0)) return null;
  const row = grassRow(biome, palette);
  if (!row.cover) return null;
  let id = row.type;
  if (row.mix && patchNoise(x, z) < row.mix[1]) id = row.mix[0];
  const type = TYPE_INDEX[id];
  if (!type) return null;
  // the cover itself breathes a little across the field, so a meadow is not one even carpet
  const cover = Math.min(1, row.cover * (0.78 + 0.44 * patchNoise(x, z, 57)));
  return { type, cover };
}

// ---------------------------------------------------------------- how far, and how many blades
/**
 * Settings → Graphics → Grass distance. Each is a radius and a SLOT budget (a slot draws BLADES_PER_SLOT blades, fanned
 * from one root); the budget grows more slowly than the area, so a far field is thinner further out — and the inner part
 * carries up to six slots a square (RINGS), so what is at your feet stays thick. (Farhold's GRASS_DISTANCES, scaled for
 * a phone-friendly game.) Since 2026-10-21 a slot draws a clump of `clump` blades.
 */
// 2026-10-21: a slot is a CLUMP (the CPU tufts read as tufty grass; single blades read as mown lawn) — 4 blades fanned
// from one root on the phone settings (Near / Medium), 5 on Far / Very far. Blade totals stay where they were.
export const BLADES_PER_SLOT = 5;
export const GRASS_DISTANCES = Object.freeze({
  off: { label: 'Off', radius: 0, slots: 0, clump: 4 },
  near: { label: 'Near (28 m)', radius: 28, slots: 3500, clump: 4 },
  medium: { label: 'Medium (42 m)', radius: 42, slots: 5000, clump: 4 },
  far: { label: 'Far (70 m)', radius: 70, slots: 10400, clump: 5 },
  veryFar: { label: 'Very far (110 m)', radius: 110, slots: 22400, clump: 5 },
});
/** Blades in one slot's clump at a distance setting. */
export const bladesPerSlot = id => (GRASS_DISTANCES[id] || GRASS_DISTANCES.medium).clump;
export const GRASS_DISTANCE_IDS = Object.freeze(['auto', ...Object.keys(GRASS_DISTANCES)]);
/** 'auto' -> what the device gets: Medium on a phone or Medium quality, Far otherwise, nothing on Low. */
export function grassDistanceFor(choice, { quality = 'high', phone = false } = {}) {
  if (quality === 'low') return 'off';
  if (GRASS_DISTANCES[choice]) return choice;
  return phone || quality === 'medium' ? 'medium' : 'far';
}
/** Up to four clumps a lattice square; slot k only within RINGS[k] of the radius (the inner ~15 m on Medium is doubled). */
export const RINGS = Object.freeze([1, 0.4, 0.25, 0.15]);

/**
 * The slots: every (square offset, blade number) the patch draws, nearest first. Pure numbers, so a test can check the
 * one property that matters without a GPU (an instance draws a whole lattice square and nothing of its own).
 * Returns { cell (m), count (slots), blades, offsets Float32Array [i, j]*, slots Float32Array [k, limit]* }.
 */
export function grassLattice(distance) {
  const D = GRASS_DISTANCES[distance] || GRASS_DISTANCES.medium;
  if (!D.radius) return { cell: 1, count: 0, blades: 0, clump: D.clump, offsets: new Float32Array(0), slots: new Float32Array(0), radius: 0 };
  const radius = D.radius, spread = RINGS.reduce((a, f) => a + f * f, 0);
  const cell = Math.sqrt((Math.PI * radius * radius * spread) / D.slots);
  const half = Math.ceil(radius / cell), pts = [];
  for (let j = -half; j <= half; j++) for (let i = -half; i <= half; i++) {
    const d = Math.hypot(i * cell, j * cell);
    if (d > radius) continue;
    for (let k = 0; k < RINGS.length; k++) { const lim = radius * RINGS[k]; if (d > lim) break; pts.push([i, j, d, k, lim]); }
  }
  pts.sort((a, b) => (a[2] - b[2]) || (a[3] - b[3]));
  const offsets = new Float32Array(pts.length * 2), slots = new Float32Array(pts.length * 2);
  pts.forEach((p, n) => { offsets[n * 2] = p[0]; offsets[n * 2 + 1] = p[1]; slots[n * 2] = p[3]; slots[n * 2 + 1] = p[4]; });
  return { cell, count: pts.length, blades: pts.length * D.clump, clump: D.clump, offsets, slots, radius };
}
/** The patch's centre square for a point: whole squares only (moving it by less would move every blade). */
export const snapOrigin = (x, z, cell) => [Math.round(x / cell), Math.round(z / cell)];

/** pcg4d — the shader's hash on the CPU: four 0..1 numbers from a whole-number square and a blade number. */
export function grassHash(cx, cz, k = 0) {
  let x = cx >>> 0, y = cz >>> 0, z = k >>> 0, w = 0x2545f491;
  const M = 1664525, C = 1013904223;
  x = (Math.imul(x, M) + C) >>> 0; y = (Math.imul(y, M) + C) >>> 0; z = (Math.imul(z, M) + C) >>> 0; w = (Math.imul(w, M) + C) >>> 0;
  x = (x + Math.imul(y, w)) >>> 0; y = (y + Math.imul(z, x)) >>> 0; z = (z + Math.imul(x, y)) >>> 0; w = (w + Math.imul(y, z)) >>> 0;
  x ^= x >>> 16; y ^= y >>> 16; z ^= z >>> 16; w ^= w >>> 16;
  x = (x + Math.imul(y, w)) >>> 0; y = (y + Math.imul(z, x)) >>> 0; z = (z + Math.imul(x, y)) >>> 0; w = (w + Math.imul(y, z)) >>> 0;
  return [x / 4294967296, y / 4294967296, z / 4294967296, w / 4294967296];
}

// ---------------------------------------------------------------- the table the shader reads
export const TYPE_ROWS = 6;
const lin = v => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
/** '#rrggbb' -> linear [r, g, b]. */
export function hexLinear(hex) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  return [lin(((n >> 16) & 255) / 255), lin(((n >> 8) & 255) / 255), lin((n & 255) / 255)];
}
/**
 * Every type as TYPE_ROWS vec4s (row-major: texel (row, type)):
 *   0 hMin, hMax, width, dense      1 stiff, lean, taper, flower share     2 root rgb, flower size
 *   3 tip rgb, 0                    4 flower a rgb, 0                      5 flower b rgb, 0
 */
export function typeTable() {
  const n = GRASS_TYPES.length, out = new Float32Array(n * TYPE_ROWS * 4);
  GRASS_TYPES.forEach((t, i) => {
    if (!t) return;
    const put = (row, a, b, c, d) => { const o = (i * TYPE_ROWS + row) * 4; out[o] = a; out[o + 1] = b; out[o + 2] = c; out[o + 3] = d; };
    put(0, t.h[0], t.h[1], t.w, t.dense);
    put(1, t.stiff, t.lean, t.taper, t.flower.p);
    put(2, ...hexLinear(t.root), t.flower.size);
    put(3, ...hexLinear(t.tip), 0);
    put(4, ...hexLinear(t.flower.a), 0);
    put(5, ...hexLinear(t.flower.b), 0);
  });
  return out;
}
export { NAV };
