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
  // water — frozen. Only produced by the optional polarCaps knob (and by a locked ice world), never by classify().
  { id: 25, key: 'seaIce',    name: 'Sea Ice',    color: '#cfe2ec', tags: ['water', 'ocean', 'cold', 'frozen'], travel: 'sea', move: 3.0, habit: 0.02 },
];

export const BY_KEY = Object.fromEntries(BIOMES.map(b => [b.key, b]));
export const biomeId = key => BY_KEY[key].id;
/** First land id — anything below is water. */
export const LAND_START = 4;
export const isWater = id => id < LAND_START || id === 25;
export const isOcean = id => id < 3 || id === 25;
/** Ids that are water of any kind (the frozen one sits past the land block, so keep this in sync). */
export const WATER_IDS = [0, 1, 2, 3, 25];

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

// ---------------------------------------------------------------------------- biome families
// A family is a small set of biomes that belong to the same kind of world. The `biomeLock` knob
// (see world.js) forces every land cell into one family, which is what a single-biome planet needs:
// an ice world is ice, tundra and snowy peaks and nothing else. Order matters — the members are
// listed lowest ground first, and `lockBiome` picks along that list by height and slope.

export const BIOME_FAMILIES = {
  grass:   { name: 'Green world',   members: ['grassland', 'shrubland', 'temperateForest', 'hills', 'mountains'], water: 'liquid' },
  jungle:  { name: 'Jungle world',  members: ['marsh', 'rainforest', 'rainforest', 'hills', 'mountains'], water: 'liquid' },
  desert:  { name: 'Desert world',  members: ['desert', 'desert', 'badlands', 'badlands', 'mountains'], water: 'liquid' },
  ice:     { name: 'Ice world',     members: ['ice', 'ice', 'tundra', 'snowyPeaks', 'snowyPeaks'], water: 'frozen' },
  tundra:  { name: 'Tundra world',  members: ['tundra', 'tundra', 'borealForest', 'hills', 'snowyPeaks'], water: 'liquid' },
  ocean:   { name: 'Ocean world',   members: ['beach', 'marsh', 'grassland', 'hills', 'mountains'], water: 'liquid' },
  rock:    { name: 'Barren world',  members: ['badlands', 'badlands', 'shrubland', 'hills', 'mountains'], water: 'none' },
  lava:    { name: 'Lava world',    members: ['volcanic', 'volcanic', 'ashPlain', 'badlands', 'mountains'], water: 'lava' },
  toxic:   { name: 'Toxic world',   members: ['marsh', 'blighted', 'ashPlain', 'veiledHills', 'mountains'], water: 'liquid' },
  crystal: { name: 'Crystal world', members: ['glimmerwaste', 'glimmerwaste', 'veiledHills', 'snowyPeaks', 'snowyPeaks'], water: 'liquid' },
  void:    { name: 'Void-touched',  members: ['ashPlain', 'blighted', 'veiledHills', 'veiledHills', 'mountains'], water: 'liquid' },
};

/**
 * Every family a biome id belongs to. Families overlap on purpose — mountains and badlands turn up
 * in several — so this returns a list, and `inFamily` is the question you usually want to ask.
 * Water is its own answer: ['water'].
 */
export function familiesOf(id) {
  if (isWater(id)) return ['water'];
  const key = BIOMES[id]?.key;
  return Object.entries(BIOME_FAMILIES).filter(([, spec]) => spec.members.includes(key)).map(([fam]) => fam);
}

/** Is this biome one of the family's members? (Water counts as in every family — it is not ground.) */
export function inFamily(id, family) {
  if (isWater(id)) return true;
  const spec = BIOME_FAMILIES[family];
  return !!spec && spec.members.includes(BIOMES[id]?.key);
}

/**
 * Force one cell into a family. `lock` is a family key from BIOME_FAMILIES.
 * Land picks a member by height + slope; water stays water unless the family freezes it.
 */
export function lockBiome(id, lock, c) {
  const fam = BIOME_FAMILIES[lock];
  if (!fam) return id;
  if (isWater(id)) return fam.water === 'frozen' ? 25 : id;
  const high = Math.max(0, (c.elev - 0.5) * 2);
  const step = high > 0.66 ? 4 : high > 0.44 ? 3 : high > 0.24 ? 2 : c.slope > 0.35 ? 2 : c.moist > 0.62 ? 1 : 0;
  return BY_KEY[fam.members[Math.min(step, fam.members.length - 1)]].id;
}

/**
 * Colour swaps for a whole map, so the same biome table can look like a different planet.
 * Used by render.js: pass `palette: 'lava'` (or set it in the world's opts) to worldPixels.
 */
export const PALETTES = {
  lava:    { deepOcean: '#8a2408', ocean: '#c4400c', lake: '#ffb02a', coast: '#ff6a18', volcanic: '#3a2620', ashPlain: '#4a423d', badlands: '#7a3c22', mountains: '#5c4a42', hills: '#6b4a34', shrubland: '#6a4a2e', beach: '#6b4030' },
  crystal: { deepOcean: '#141b3a', ocean: '#20306a', coast: '#3a5aa8', lake: '#6f7ce0', glimmerwaste: '#b9a8f2', veiledHills: '#7e6fb4', snowyPeaks: '#e4e0ff', mountains: '#6a6390', badlands: '#6f6796' },
  toxic:   { deepOcean: '#16220e', ocean: '#263a12', coast: '#41601c', lake: '#6f9a22', marsh: '#4d6b24', blighted: '#5a5030', ashPlain: '#5c5a42', veiledHills: '#6a6440', mountains: '#5e5c4c' },
  void:    { deepOcean: '#0a0810', ocean: '#140f22', coast: '#241a3a', lake: '#3a2a5c', ashPlain: '#2e2a38', blighted: '#3a2f4c', veiledHills: '#4a3c62', mountains: '#3e3a48', badlands: '#463c52' },
  ember:   { deepOcean: '#1a0f14', ocean: '#33202a', coast: '#5c3c3a', badlands: '#8a4a2e', desert: '#c08a54', mountains: '#6e5a50' },
  rust:    { deepOcean: '#1b1310', ocean: '#3a2a20', coast: '#6a4a34', desert: '#c08a58', badlands: '#8f5330', shrubland: '#8a7346', hills: '#8a6a44', mountains: '#7a6252' },
};

/** BIOMES with a palette's colours swapped in (the table itself is never mutated). */
export function palettedColors(palette) {
  const swap = PALETTES[palette] || null;
  return BIOMES.map(b => (swap && swap[b.key] ? { ...b, color: swap[b.key] } : b));
}
