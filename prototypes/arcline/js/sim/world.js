// A whole world: a grid of cells packed with mixed-size regions side by side, like SimCity 4's region map (owner Q10:
// "Mixed sizes"). Small = 1×1 cell (64×64 tiles), medium = 2×2 (128), large = 4×4 (256). Each region gets a name, a
// biome, how rich it is in Metal / Stone / Crystal, how many nests, and whether it has coast or rivers. The actual
// ground is made later by terrain.js from the same world-coordinate noise, so neighbouring regions line up.
import { fbm, hash2 } from './noise.js';
import { rng } from '../../../../citykit/js/kit/rng.js';

export const CELL = 64;                     // tiles per world cell
export const SIZES = { small: 1, medium: 2, large: 4 };

/** Alien biomes. Original names. ground/dark are map colours; deposits = how likely each raw material is. */
export const BIOMES = {
  verdant:  { name: 'Tealgrass Plains', ground: '#5f8a64', alt: '#567f5b', dark: '#2f4a36', deposits: { metal: 0.35, stone: 0.5, crystal: 0.15 }, nests: 0.9, weather: { rain: 0.3, storm: 0.1, aurora: 0.2, stars: 0.4, mist: 0.2 } },
  dunes:    { name: 'Saffron Dunes', ground: '#b49565', alt: '#a88a5b', dark: '#6a5534', deposits: { metal: 0.3, stone: 0.65, crystal: 0.1 }, nests: 0.7, weather: { rain: 0.05, storm: 0.05, aurora: 0.1, stars: 0.8, mist: 0.05 } },
  crystal:  { name: 'Prism Fields', ground: '#6f6a8c', alt: '#665f84', dark: '#3a3552', deposits: { metal: 0.2, stone: 0.3, crystal: 0.75 }, nests: 1.1, weather: { rain: 0.2, storm: 0.1, aurora: 0.8, stars: 0.5, mist: 0.3 } },
  ashland:  { name: 'Basalt Reach', ground: '#5a5650', alt: '#524e49', dark: '#2c2a27', deposits: { metal: 0.8, stone: 0.4, crystal: 0.15 }, nests: 1.0, weather: { rain: 0.15, storm: 0.35, aurora: 0.1, stars: 0.3, mist: 0.4 } },
  tundra:   { name: 'Frostglass Steppe', ground: '#8fa3a8', alt: '#879a9f', dark: '#4a5a60', deposits: { metal: 0.4, stone: 0.4, crystal: 0.4 }, nests: 0.6, weather: { rain: 0.1, storm: 0.05, aurora: 0.9, stars: 0.6, mist: 0.3 } },
  jungle:   { name: 'Glowroot Tangle', ground: '#3f7552', alt: '#386b4a', dark: '#1e3a2a', deposits: { metal: 0.3, stone: 0.3, crystal: 0.45 }, nests: 1.6, weather: { rain: 0.7, storm: 0.3, aurora: 0.1, stars: 0.2, mist: 0.6 } },
};

/** Ground facts at a world tile: height 0..1 (sea below SEA), temperature and moisture for biomes. */
export const SEA = 0.34;
export function sample(seed, wx, wz) {
  const h = fbm(seed, wx, wz, 260, 5) * 0.85 + fbm(seed + 77, wx, wz, 60, 3) * 0.15;
  const temp = fbm(seed + 501, wx, wz, 520, 3), wet = fbm(seed + 902, wx, wz, 380, 3);
  return { h, temp, wet };
}
export function biomeAt(seed, wx, wz) {
  const { h, temp, wet } = sample(seed, wx, wz);
  if (temp < 0.36) return 'tundra';
  if (temp > 0.62 && wet < 0.45) return 'dunes';
  if (wet > 0.62) return 'jungle';
  if (h > 0.62) return 'ashland';
  if (fbm(seed + 333, wx, wz, 300, 2) > 0.6) return 'crystal';
  return 'verdant';
}

const SYL = ['ar', 'vel', 'qui', 'zan', 'tor', 'mis', 'oro', 'lyn', 'dra', 'ke', 'sol', 'nyx', 'thal', 'ira', 'cor', 'phe', 'ul', 'vax', 'sen', 'ry'];
const TAIL = ['Reach', 'Basin', 'Fold', 'Crossing', 'Shelf', 'Hollow', 'Rise', 'Flats', 'Bend', 'Gate', 'Strand', 'Mesa'];
function regionName(R) { const a = R.pick(SYL), b = R.pick(SYL); const n = (a + b).replace(/^./, c => c.toUpperCase()); return `${n} ${R.pick(TAIL)}`; }

/**
 * generateWorld({ seed, cells }) → { seed, cells, regions: [{ id, cx, cz, span, size, name, biome, land, deposits,
 * nests, coast, river }], grid: Int16Array cell → region index }
 * Packing: big regions first at random free spots, then medium, then small fills every gap (no holes).
 */
export function generateWorld({ seed = 1, cells = 12, mix = { large: 0.42, medium: 0.33 } } = {}) {
  const R = rng(seed * 31 + 7);
  const grid = new Int16Array(cells * cells).fill(-1);
  const regions = [];
  const free = (cx, cz, s) => { if (cx + s > cells || cz + s > cells) return false; for (let z = 0; z < s; z++) for (let x = 0; x < s; x++) if (grid[(cz + z) * cells + cx + x] >= 0) return false; return true; };
  const place = (cx, cz, s) => { const id = regions.length; for (let z = 0; z < s; z++) for (let x = 0; x < s; x++) grid[(cz + z) * cells + cx + x] = id; regions.push({ id, cx, cz, span: s }); };
  const tries = (s, share) => {
    const want = Math.floor((cells * cells * share) / (s * s));
    // try every free spot in a shuffled order (random tries alone leave most big regions unplaced)
    const spots = []; for (let cz = 0; cz <= cells - s; cz++) for (let cx = 0; cx <= cells - s; cx++) spots.push([cx, cz]);
    for (let i = spots.length - 1; i > 0; i--) { const j = R.int(0, i); [spots[i], spots[j]] = [spots[j], spots[i]]; }
    let n = 0; for (const [cx, cz] of spots) { if (n >= want) break; if (free(cx, cz, s)) { place(cx, cz, s); n++; } }
  };
  tries(SIZES.large, mix.large); tries(SIZES.medium, mix.medium);
  for (let cz = 0; cz < cells; cz++) for (let cx = 0; cx < cells; cx++) if (grid[cz * cells + cx] < 0) place(cx, cz, 1);

  for (const r of regions) {
    const size = r.span * CELL, wx = r.cx * CELL, wz = r.cz * CELL;
    // look at the region's ground on a coarse 9×9 grid: biome by vote, how much is land, coast
    const votes = {}; let land = 0, n = 0;
    for (let j = 0; j <= 8; j++) for (let i = 0; i <= 8; i++) {
      const x = wx + (size * i) / 8, z = wz + (size * j) / 8, s = sample(seed, x, z);
      n++; if (s.h >= SEA) { land++; const b = biomeAt(seed, x, z); votes[b] = (votes[b] || 0) + 1; }
    }
    r.size = size; r.wx = wx; r.wz = wz;
    r.biome = Object.entries(votes).sort((a, b) => b[1] - a[1])[0]?.[0] || 'verdant';
    r.land = land / n; r.coast = land < n;
    const B = BIOMES[r.biome], RR = rng(seed * 997 + r.id * 131 + 1);
    r.name = regionName(RR);
    r.deposits = Object.fromEntries(Object.entries(B.deposits).map(([k, v]) => [k, Math.round(Math.min(1, v * RR.range(0.6, 1.4)) * 100) / 100]));
    r.nests = Math.round(B.nests * RR.range(0.7, 1.3) * r.span * r.span * 3);
    r.river = riverCrosses(seed, wx, wz, size);
    r.city = null;   // filled when the player founds a city here
  }
  return { seed, cells, regions, grid };
}

/** Rivers are where a ridged noise line runs through land; a region has one if that line crosses it. */
export function riverAt(seed, wx, wz) {
  const v = fbm(seed + 4242, wx, wz, 210, 3);
  return Math.abs(v - 0.5) < 0.012 + 0.006 * fbm(seed + 99, wx, wz, 40, 2);
}
function riverCrosses(seed, wx, wz, size) {
  for (let j = 0; j < 24; j++) for (let i = 0; i < 24; i++) { const x = wx + size * i / 24, z = wz + size * j / 24; if (sample(seed, x, z).h >= SEA && riverAt(seed, x, z)) return true; }
  return false;
}

/** The region at a world cell, or null. */
export function regionAt(world, cx, cz) { if (cx < 0 || cz < 0 || cx >= world.cells || cz >= world.cells) return null; const i = world.grid[cz * world.cells + cx]; return i >= 0 ? world.regions[i] : null; }
/** Regions sharing an edge with r (for interstate links and arrivals from neighbour cities). */
export function neighbours(world, r) {
  const out = new Set();
  for (let k = 0; k < r.span; k++) for (const [cx, cz] of [[r.cx - 1, r.cz + k], [r.cx + r.span, r.cz + k], [r.cx + k, r.cz - 1], [r.cx + k, r.cz + r.span]]) { const o = regionAt(world, cx, cz); if (o && o !== r) out.add(o); }
  return [...out];
}
export { hash2 };
