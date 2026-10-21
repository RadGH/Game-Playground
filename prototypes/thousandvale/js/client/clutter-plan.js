// 2026-10-17 ground pass (owner: "How can we add more grasses, bushes, dirt lumps, rocks, and other things to make the
// terrain (everywhere) look less flat?") — WHAT grows on each square metre of ground, decided without three.js so the
// node tests can ask it directly. js/client/ground-clutter.js draws the answer.
//
// The ground is cut into a fixed lattice of whole-number cells (one lattice per layer). A cell's contents — whether it
// holds anything, what, where inside the cell, which way it faces, how big — are a hash of the cell's own integer
// coordinates, never of where the camera is. So walking past a tuft of grass leaves it where it was, and the same field
// grows the same tufts every visit (highdef-3d/README.md "The grass belongs to the ground": an instance at a fixed
// offset from a moving centre crawls along with you, and no still screenshot shows it).
//
//   CLUTTER_LAYERS             the two lattices: `tuft` (grass, 1.5 m cells) and `detail` (bushes, ferns, stones,
//                              pebbles and dirt lumps, 3 m cells), each with how far it is drawn per quality
//   CLUTTER_BIOMES[biome]      per biome: tuft chance, detail chance, which details and how often, tuft / earth colour
//   clutterAt(layer, i, j, env) -> null | { kind, x, z, yaw, s, colour }   env = { biome, nav, palette, steep }
//   cellHash(i, j, salt)       the integer hash every roll comes from (0..1)

import { NAV } from '../rules/terrain-read.js';

/** Things that may stand on the ground, and the kit piece each is drawn as (ground-clutter.js builds them). */
export const CLUTTER_KINDS = Object.freeze({
  tuft: { piece: ['own', 'tuft'], size: [0.32, 0.62] },           // a clump of grass blades (ground-clutter.js tuftGeometry), 0.25-0.6 m tall
  fern: { piece: ['fern', 'fern'], size: [0.55, 0.95] },
  leafy: { piece: ['fern', 'broadleaf'], size: [0.7, 1.1] },      // elephant-ear leaves (jungle floor)
  heather: { piece: ['bush', 'heather'], size: [0.7, 1.2] },
  shrub: { piece: ['bush', 'shrub'], size: [0.35, 0.55] },        // a knee-high bush
  pebbles: { piece: ['rock', 'pebble'], size: [0.1, 0.22] },
  stone: { piece: ['rock', 'stone'], size: [0.16, 0.34] },
  lump: { piece: ['rock', 'stone'], size: [0.55, 1.1], squash: 0.28 },   // a clod / low mound of earth, ground-coloured
});

/** The two lattices. `cell` metres; `reach` = how far it is drawn per quality (0 = not drawn); `cap` = instances. */
export const CLUTTER_LAYERS = Object.freeze({
  tuft: { cell: 1.15, reach: { high: 46, medium: 30, low: 0 }, cap: 6400, salt: 11 },
  detail: { cell: 3, reach: { high: 75, medium: 55, low: 0 }, cap: 2000, salt: 23 },
});

const STONE = '#6e6a64', BASALT = '#403a37', GRASS = '#7a9a48', DRY = '#a39a5c', SHADE = '#5d7a3a', EARTH = '#6e5a44', SANDY = '#b5a27a', ASH = '#5a4639';
const LUSH = { tuft: 0.88, detail: 0.32, kinds: { lump: 3, pebbles: 3, stone: 1, heather: 1.2, shrub: 1, fern: 0.6 }, grass: GRASS, earth: EARTH };
const WOOD = { tuft: 0.4, detail: 0.5, kinds: { fern: 5, lump: 2, pebbles: 1.5, stone: 1, shrub: 1 }, grass: SHADE, earth: '#5a4a38' };
const ROCKY = { tuft: 0.12, detail: 0.32, kinds: { pebbles: 4, stone: 3, lump: 1 }, grass: DRY, earth: '#77706a' };
/** Per biome (the terrain bake's keys). Anything missing reads as `grassland`. */
export const CLUTTER_BIOMES = Object.freeze({
  grassland: LUSH, hallowed: { ...LUSH, grass: '#86a852' }, pasture: { ...LUSH, tuft: 0.7, detail: 0.12 },
  hills: { ...LUSH, tuft: 0.78, kinds: { lump: 2, pebbles: 3, stone: 2, heather: 2 } },
  shrubland: { tuft: 0.65, detail: 0.42, kinds: { shrub: 3, heather: 2, lump: 2, pebbles: 2, stone: 1 }, grass: '#8a9a50', earth: EARTH },
  savanna: { tuft: 0.6, detail: 0.22, kinds: { lump: 3, pebbles: 2, stone: 1, shrub: 1 }, grass: DRY, earth: '#8a6a4a' },
  temperateForest: WOOD, borealForest: { ...WOOD, tuft: 0.3, kinds: { fern: 3, stone: 2, pebbles: 2, lump: 1 } },
  rainforest: { tuft: 0.45, detail: 0.6, kinds: { leafy: 4, fern: 4, lump: 1, pebbles: 1 }, grass: '#5f8a3a', earth: '#4e3f30' },
  marsh: { tuft: 0.75, detail: 0.25, kinds: { lump: 2, fern: 2, pebbles: 1 }, grass: '#6f8a44', earth: '#4a4030' },
  blighted: { tuft: 0.2, detail: 0.3, kinds: { lump: 3, stone: 2, pebbles: 2 }, grass: '#6e6a48', earth: '#4a4038' },
  orchard: { ...LUSH, tuft: 0.6, detail: 0.15 }, graveyard: { ...LUSH, tuft: 0.45, detail: 0.1, kinds: { pebbles: 2, stone: 1 } },
  tundra: { tuft: 0.25, detail: 0.3, kinds: { stone: 3, pebbles: 3, heather: 1 }, grass: '#8a8c62', earth: '#77706a' },
  beach: { tuft: 0.04, detail: 0.14, kinds: { pebbles: 4, stone: 1 }, grass: DRY, earth: SANDY },
  coast: { tuft: 0.1, detail: 0.18, kinds: { pebbles: 4, stone: 1, lump: 1 }, grass: DRY, earth: SANDY },
  lake: { tuft: 0.3, detail: 0.2, kinds: { pebbles: 3, stone: 1, lump: 1 }, grass: '#6f8a44', earth: SANDY },
  desert: { tuft: 0.03, detail: 0.14, kinds: { pebbles: 3, stone: 2, lump: 1 }, grass: DRY, earth: SANDY },
  badlands: { ...ROCKY, earth: '#8a5a40' }, mountains: ROCKY, veiledHills: { ...LUSH, tuft: 0.6, kinds: { stone: 2, pebbles: 2, lump: 2, heather: 1 } },
  volcanic: { ...ROCKY, tuft: 0.04, earth: '#3e3634' }, ashPlain: { ...ROCKY, tuft: 0.03, detail: 0.2, earth: '#7a746c' },
  glimmerwaste: { ...ROCKY, tuft: 0.05, earth: '#6a6070' },
  field: { tuft: 0.08, detail: 0.1, kinds: { lump: 3, pebbles: 1 }, grass: DRY, earth: EARTH },
  crop: { tuft: 0, detail: 0, kinds: {} }, yard: { tuft: 0.05, detail: 0.08, kinds: { pebbles: 2, lump: 1 }, grass: DRY, earth: EARTH },
  gravel: { tuft: 0, detail: 0.2, kinds: { pebbles: 1 }, grass: DRY, earth: '#8d8577' },
  road: { tuft: 0, detail: 0, kinds: {} }, snowyPeaks: { tuft: 0, detail: 0.06, kinds: { stone: 1 } }, ice: { tuft: 0, detail: 0, kinds: {} },
});
/**
 * Vharlen (palette `vharl`, the Burning Isle) draws ash where Torbor has grass: thinner, darker grass, more scoria
 * and basalt chips, warm ash-brown lumps. Per biome overrides on top of the table above.
 */
export const CLUTTER_PALETTES = Object.freeze({
  vharl: {
    grassland: { tuft: 0.3, detail: 0.36, kinds: { lump: 3, pebbles: 3, stone: 2, fern: 0.5 }, grass: '#7d7a4a', earth: ASH },
    savanna: { tuft: 0.55, detail: 0.3, kinds: { lump: 2, pebbles: 2, stone: 1, shrub: 1 }, grass: '#7a7a44', earth: ASH },
    shrubland: { tuft: 0.6, detail: 0.45, kinds: { fern: 2, shrub: 2, lump: 2, pebbles: 2 }, grass: '#5f763a', earth: ASH },
    rainforest: { tuft: 0.4, detail: 0.62, kinds: { leafy: 5, fern: 4, lump: 1 }, grass: '#5a8038', earth: '#3e3228' },
    desert: { tuft: 0.02, detail: 0.18, kinds: { pebbles: 3, stone: 1 }, grass: '#a09a50', earth: '#9a8a40' },
    ashPlain: { tuft: 0.02, detail: 0.22, kinds: { pebbles: 3, stone: 2, lump: 1 }, grass: '#8a8670', earth: '#8a847a' },
    volcanic: { tuft: 0.02, detail: 0.3, kinds: { pebbles: 3, stone: 3, lump: 1 }, grass: '#6a6650', earth: '#2e2626' },
    beach: { tuft: 0, detail: 0.14, kinds: { pebbles: 3, stone: 1 }, grass: '#6a6650', earth: '#2c2a28' },
  },
  /**
   * Torbor Downs regenerated (play-test 12, #81; tools/lib/torbor.mjs TORBOR_BIOME_NAMES): every region its own ground
   * cover — short bright chalk turf, oak-wood ferns, pine-needle stones, heather mounds on the moor, gorse on the heath,
   * tall gold grass on the wolds, red sandstone chips on the scarps, bramble on the Scar, grey scree on the fell, pale
   * shingle on the shore. Rows for every biome id the island uses (anything missing falls back to the shared table).
   */
  downs: {
    grassland: { tuft: 0.86, detail: 0.26, kinds: { lump: 2, pebbles: 3, stone: 1.5, shrub: 0.6 }, grass: '#80a44a', earth: '#7a6a52', stone: '#cfcab8' },
    temperateForest: { tuft: 0.38, detail: 0.55, kinds: { fern: 5, lump: 2, pebbles: 1, shrub: 1.2 }, grass: '#5a7a36', earth: '#5a4a36' },
    borealForest: { tuft: 0.26, detail: 0.45, kinds: { fern: 2, stone: 3, pebbles: 2, lump: 1 }, grass: '#58704a', earth: '#4e4234', stone: '#6a6a66' },
    hills: { tuft: 0.55, detail: 0.5, kinds: { heather: 6, stone: 2, pebbles: 1.5, lump: 1 }, grass: '#8a7a58', earth: '#5a4a44' },
    hallowed: { tuft: 0.9, detail: 0.3, kinds: { shrub: 1, lump: 1, pebbles: 1, fern: 1 }, grass: '#8cb456', earth: '#6e5a44' },
    marsh: { tuft: 0.8, detail: 0.3, kinds: { lump: 3, fern: 2, pebbles: 0.5 }, grass: '#62783e', earth: '#3e3a2c' },
    badlands: { tuft: 0.22, detail: 0.42, kinds: { pebbles: 4, stone: 3, lump: 1, shrub: 1 }, grass: '#9a8a50', earth: '#8a4a32', stone: '#a4583c' },
    shrubland: { tuft: 0.6, detail: 0.48, kinds: { shrub: 4, heather: 1, pebbles: 2, lump: 1 }, grass: '#9aa04a', earth: '#9a8460' },
    savanna: { tuft: 0.92, detail: 0.16, kinds: { lump: 2, pebbles: 2, stone: 1 }, grass: '#c0a854', earth: '#8a7448' },
    veiledHills: { tuft: 0.25, detail: 0.5, kinds: { shrub: 4, stone: 2, lump: 2, pebbles: 1 }, grass: '#5e5a44', earth: '#3a3230', stone: '#4a4644' },
    tundra: { tuft: 0.3, detail: 0.42, kinds: { stone: 4, pebbles: 3, heather: 1 }, grass: '#8a9068', earth: '#77706a', stone: '#8a8780' },
    mountains: { tuft: 0.08, detail: 0.34, kinds: { pebbles: 4, stone: 3, lump: 1 }, grass: '#8a8c62', earth: '#77706a' },
    snowyPeaks: { tuft: 0, detail: 0.08, kinds: { stone: 1 }, grass: '#9a9c80', earth: '#a8a8a8' },
    beach: { tuft: 0.02, detail: 0.32, kinds: { pebbles: 5, stone: 2 }, grass: '#a39a5c', earth: '#c8c0ae', stone: '#bdb8ac' },
  },
});

export function biomeClutter(biome, palette = null) {
  return CLUTTER_PALETTES[palette]?.[biome] || CLUTTER_BIOMES[biome] || CLUTTER_BIOMES.grassland;
}

/** 0..1 from two whole numbers and a salt — a 32-bit integer mix (no float drift 30 km from the origin). */
export function cellHash(i, j, salt = 0) {
  let h = (Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul(j | 0, 0x165667b1) ^ Math.imul(salt | 0, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Ground nothing grows on: not walkable, a road, a town, a building, a solid, any water. Steep ground: stones only. */
const NO_GROWTH = NAV.ROAD | NAV.TOWN | NAV.BUILDING | NAV.SOLID | NAV.SHALLOW | NAV.DEEP;
export function groundOpen(nav) { return (nav & NAV.WALK) !== 0 && (nav & NO_GROWTH) === 0; }
export const isSteep = nav => (nav & NAV.STEEP) !== 0;

/** Where in its cell, and which way, a cell's item stands (the position the env is then sampled at). */
export function cellSpot(layer, i, j) {
  const L = CLUTTER_LAYERS[layer], c = L.cell;
  return { x: (i + 0.1 + 0.8 * cellHash(i, j, L.salt + 1)) * c, z: (j + 0.1 + 0.8 * cellHash(i, j, L.salt + 2)) * c };
}

/**
 * What cell (i, j) of a layer holds. env = { biome, nav (raw bits at the spot), palette, density (0..1, the quality's
 * thinning) }. Returns null for an empty cell.
 */
export function clutterAt(layer, i, j, env) {
  const L = CLUTTER_LAYERS[layer]; if (!L) return null;
  const B = biomeClutter(env.biome, env.palette);
  const nav = env.nav | 0;
  if ((nav & NAV.WALK) === 0 || (nav & NO_GROWTH)) return null;
  const steep = isSteep(nav), density = env.density ?? 1;
  const roll = cellHash(i, j, L.salt);
  let kind;
  if (layer === 'tuft') {
    if (steep || roll >= (B.tuft || 0) * density) return null;
    kind = 'tuft';
  } else {
    if (roll >= (B.detail || 0) * density) return null;
    const kinds = Object.entries(B.kinds || {}).filter(([k]) => !steep || k === 'stone' || k === 'pebbles');
    const sum = kinds.reduce((a, [, w]) => a + w, 0); if (!sum) return null;
    let r = cellHash(i, j, L.salt + 3) * sum; kind = kinds[kinds.length - 1][0];
    for (const [k, w] of kinds) { if ((r -= w) < 0) { kind = k; break; } }
  }
  const K = CLUTTER_KINDS[kind], { x, z } = cellSpot(layer, i, j);
  const s = K.size[0] + (K.size[1] - K.size[0]) * cellHash(i, j, L.salt + 4);
  const tone = 0.86 + 0.28 * cellHash(i, j, L.salt + 5);     // each one a little lighter or darker
  const base = kind === 'tuft' || kind === 'fern' || kind === 'leafy' ? B.grass : kind === 'lump' ? B.earth : kind === 'pebbles' || kind === 'stone' ? (B.stone || (env.palette === 'vharl' ? BASALT : STONE)) : null;
  return { kind, x, z, yaw: cellHash(i, j, L.salt + 6) * Math.PI * 2, s, tone, colour: base || null };
}
