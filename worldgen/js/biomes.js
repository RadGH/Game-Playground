// Biome table for the world generator: ids, display names, map colours, and the rules that turn
// temperature × moisture × elevation (+ the aura layer) into a biome id.
//
//   import { BIOMES, biomeId, classify, LAND_START } from './biomes.js';
//   BIOMES[world.biome[i]].name   // 'Boreal Forest'
//
// Ids are stable: a saved world keeps meaning if new biomes are appended at the end.

export const BIOMES = [
  // water
  { id: 0,  key: 'deepOcean', name: 'Deep Ocean', color: '#0b1d33', tags: ['water', 'ocean'], travel: 'sea' },
  { id: 1,  key: 'ocean',     name: 'Ocean',      color: '#123a5e', tags: ['water', 'ocean'], travel: 'sea' },
  { id: 2,  key: 'coast',     name: 'Shallows',   color: '#1d5a86', tags: ['water', 'ocean', 'shallow'], travel: 'sea' },
  { id: 3,  key: 'lake',      name: 'Lake',       color: '#2a6fa8', tags: ['water', 'fresh'], travel: 'sea' },
  // land — mild
  { id: 4,  key: 'beach',     name: 'Beach',      color: '#d3c592', tags: ['land', 'coastal', 'open'], move: 1.0, habit: 0.55 },
  { id: 5,  key: 'grassland', name: 'Grassland',  color: '#6f9f52', tags: ['land', 'open', 'fertile'], move: 1.0, habit: 1.0 },
  { id: 6,  key: 'savanna',   name: 'Savanna',    color: '#9fa04e', tags: ['land', 'open', 'hot'], move: 1.05, habit: 0.7 },
  { id: 7,  key: 'shrubland', name: 'Shrubland',  color: '#87984f', tags: ['land', 'open', 'dry'], move: 1.15, habit: 0.7 },
  { id: 8,  key: 'temperateForest', name: 'Temperate Forest', color: '#3f7a45', tags: ['land', 'forest', 'fertile'], move: 1.5, habit: 0.85 },
  { id: 9,  key: 'rainforest', name: 'Rainforest', color: '#1e6b39', tags: ['land', 'forest', 'wet', 'hot'], move: 2.2, habit: 0.45 },
  { id: 10, key: 'borealForest', name: 'Boreal Forest', color: '#356052', tags: ['land', 'forest', 'cold'], move: 1.7, habit: 0.5 },
  { id: 11, key: 'tundra',    name: 'Tundra',     color: '#8d9a8f', tags: ['land', 'cold', 'open'], move: 1.3, habit: 0.25 },
  { id: 12, key: 'ice',       name: 'Ice Sheet',  color: '#e2ecf2', tags: ['land', 'cold', 'harsh'], move: 2.0, habit: 0.05 },
  { id: 13, key: 'desert',    name: 'Desert',     color: '#dac68d', tags: ['land', 'dry', 'hot', 'harsh'], move: 1.6, habit: 0.15 },
  { id: 14, key: 'badlands',  name: 'Badlands',   color: '#a5714a', tags: ['land', 'dry', 'harsh', 'broken'], move: 1.9, habit: 0.15 },
  { id: 15, key: 'marsh',     name: 'Marsh',      color: '#4a6b52', tags: ['land', 'wet', 'harsh'], move: 2.4, habit: 0.3 },
  // land — relief
  { id: 16, key: 'hills',     name: 'Hills',      color: '#7c8a55', tags: ['land', 'relief'], move: 1.5, habit: 0.6 },
  { id: 17, key: 'mountains', name: 'Mountains',  color: '#7f786d', tags: ['land', 'relief', 'harsh'], move: 3.2, habit: 0.12 },
  { id: 18, key: 'snowyPeaks', name: 'Snowy Peaks', color: '#d8dce0', tags: ['land', 'relief', 'cold', 'harsh'], move: 4.5, habit: 0.03 },
  { id: 19, key: 'volcanic',  name: 'Volcanic Waste', color: '#4b3730', tags: ['land', 'harsh', 'hot', 'aura'], move: 2.6, habit: 0.06 },
  // land — aura touched (evil, good, raw magic). Original names, no borrowed lore.
  { id: 20, key: 'blighted',  name: 'Blighted Forest', color: '#4a3a56', tags: ['land', 'forest', 'evil', 'aura', 'harsh'], move: 2.0, habit: 0.15 },
  { id: 21, key: 'ashPlain',  name: 'Ash Plain',  color: '#57504c', tags: ['land', 'open', 'evil', 'aura', 'harsh'], move: 1.7, habit: 0.08 },
  { id: 22, key: 'veiledHills', name: 'Veiled Hills', color: '#68597a', tags: ['land', 'relief', 'evil', 'aura'], move: 1.9, habit: 0.2 },
  { id: 23, key: 'hallowed',  name: 'Hallowed Glade', color: '#8fd0a0', tags: ['land', 'forest', 'good', 'aura'], move: 1.2, habit: 0.8 },
  { id: 24, key: 'glimmerwaste', name: 'Glimmer Waste', color: '#a99ada', tags: ['land', 'open', 'magic', 'aura'], move: 1.8, habit: 0.25 },
];

export const BY_KEY = Object.fromEntries(BIOMES.map(b => [b.key, b]));
export const biomeId = key => BY_KEY[key].id;
/** First land id — anything below is water. */
export const LAND_START = 4;
export const isWater = id => id < LAND_START;
export const isOcean = id => id < 3;

/** Colour ramps for the debug layers. */
export const RAMPS = {
  elevation: [[0, '#08111c'], [0.35, '#14486e'], [0.5, '#cbbd8a'], [0.62, '#5e8a45'], [0.75, '#8d7a4f'], [0.88, '#8d8279'], [1, '#ffffff']],
  temperature: [[0, '#2b4f9e'], [0.3, '#4aa8d8'], [0.5, '#8fd08a'], [0.7, '#e2c260'], [1, '#c4372c']],
  moisture: [[0, '#b8a06a'], [0.35, '#c9c58a'], [0.6, '#5fa86a'], [1, '#1c5f8f']],
  drainage: [[0, '#101820'], [0.25, '#1d3a4a'], [0.6, '#2f7fa8'], [1, '#9fe0ff']],
  aura: [[0, '#5ad48a'], [0.5, '#2a2f38'], [1, '#a4364a']],
  magic: [[0, '#1a1d24'], [1, '#b49cf0']],
};

/** Sample a ramp at t (0..1) → '#rrggbb'. */
export function rampColor(ramp, t) {
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  for (let i = 1; i < ramp.length; i++) {
    if (t <= ramp[i][0]) {
      const [t0, c0] = ramp[i - 1], [t1, c1] = ramp[i];
      const k = (t - t0) / (t1 - t0 || 1);
      return mixHex(c0, c1, k);
    }
  }
  return ramp[ramp.length - 1][1];
}
export function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
export function mixHex(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  const r = Math.round(A[0] + (B[0] - A[0]) * t), g = Math.round(A[1] + (B[1] - A[1]) * t), bl = Math.round(A[2] + (B[2] - A[2]) * t);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
}

/**
 * Classify one cell.
 * c: { elev (0..1, 0.5 = shore), temp (0..1), moist (0..1), slope (0..1), aura (-1..1), magic (0..1),
 *      water: 0 land / 1 ocean / 2 lake, depth (0..1 below sea), nearOcean (bool), volcanic (bool) }
 * variety: 0..1 — at 0 the world uses a handful of coarse biomes, at 1 every band shows up.
 */
export function classify(c, variety = 0.6) {
  if (c.water === 2) return 3;                                   // lake
  if (c.water === 1) return c.depth > 0.45 ? 0 : c.depth > 0.12 ? 1 : 2;

  const t = c.temp, m = c.moist, e = c.elev;
  const high = (e - 0.5) * 2;                                    // 0 at shore, 1 at the highest peak

  // relief first: peaks and mountains ignore the climate table
  if (c.volcanic && high > 0.35) return 19;
  if (high > 0.84 || (high > 0.7 && c.slope > 0.5)) return t < 0.38 ? 18 : 17;
  if (high > 0.62 && (c.slope > 0.2 || high > 0.76)) return t < 0.2 ? 18 : 17;

  // coastal fringe
  if (c.nearOcean && high < 0.045 && m < 0.85 && t > 0.18) return 4;

  let id;
  if (t < 0.12) id = 12;                                          // ice
  else if (t < 0.24) id = m > 0.45 && variety > 0.25 ? 10 : 11;   // boreal forest / tundra
  else if (t < 0.42) {
    if (m < 0.22) id = variety > 0.4 ? 7 : 5;
    else if (m < 0.55) id = 5;
    else id = 10;
  } else if (t < 0.68) {
    if (m < 0.18) id = 13;
    else if (m < 0.33) id = variety > 0.35 ? 7 : 5;
    else if (m < 0.62) id = 5;
    else if (m < 0.86) id = 8;
    else id = variety > 0.3 ? 15 : 8;
  } else {
    if (m < 0.18) id = 13;
    else if (m < 0.32) id = variety > 0.35 ? 14 : 13;
    else if (m < 0.5) id = 6;
    else if (m < 0.72) id = variety > 0.4 ? 6 : 8;
    else id = 9;
  }

  // wet flats become marsh regardless of band
  if (m > 0.9 && high < 0.12 && c.slope < 0.12 && t > 0.25 && variety > 0.2) id = 15;
  // hills sit between the plains and the mountains
  if (high > 0.28 && c.slope > 0.2 && id !== 12 && id !== 15) id = 16;
  else if (high > 0.46 && id !== 12) id = 16;

  // aura overrides (knob-driven; at aura 0 none of this fires)
  const a = c.aura;
  if (a > 0.62) {
    if (BIOMES[id].tags.includes('forest')) return 20;            // blighted forest
    if (BIOMES[id].tags.includes('relief')) return 22;            // veiled hills
    if (a > 0.8 && high < 0.3) return 21;                         // ash plain
    return a > 0.74 ? 21 : id;
  }
  if (a < -0.62 && (BIOMES[id].tags.includes('forest') || id === 5)) return 23;   // hallowed glade
  if (c.magic > 0.78 && Math.abs(a) < 0.5) return 24;                             // glimmer waste
  return id;
}

/** Plain-language one-liner about a biome, for tooltips and region blurbs. */
export const BIOME_BLURB = {
  deepOcean: 'open water, far from any shore', ocean: 'open sea', coast: 'shallow water over a shelf', lake: 'still fresh water',
  beach: 'sand and shingle along the shore', grassland: 'open grass, easy going', savanna: 'dry grass with scattered trees',
  shrubland: 'low scrub and hard ground', temperateForest: 'mixed woodland', rainforest: 'dense, wet, hard to cross',
  borealForest: 'cold evergreen forest', tundra: 'frozen ground, low cover', ice: 'permanent ice', desert: 'sand and rock, no water',
  badlands: 'eroded rock and dust', marsh: 'standing water and reeds', hills: 'rolling high ground', mountains: 'steep rock',
  snowyPeaks: 'snow above the tree line', volcanic: 'lava rock and fume', blighted: 'sick forest, twisted growth',
  ashPlain: 'grey ash over dead ground', veiledHills: 'hills under a permanent haze', hallowed: 'bright, calm, unnaturally green',
  glimmerwaste: 'raw magic crusted over the ground',
};
