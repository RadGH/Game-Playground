// Thousandvale — Torbor Downs regenerated (play-test 12, #81; docs/TORBOR-REGEN.md).
//
// Owner, 2026-10-17: "Let's just regenerate the first island to have more variety, more complex terrain like Mistfall.
// There should still be some valleys, plains, etc, but also more hills and stuff too." + "divide the main continent up
// into several biomes" + it should reach the shore instead of being a square inland.
//
// What made Mistfall's hills (tools/lib/vharlen.mjs, the Steamwood): 70 m of ridged noise at a 520 m scale on top of the
// island's lowland, everywhere off the coast. What made Torbor Downs flat: tools/lib/world-core.mjs `mainland` scales its
// hills by the World Forge macro SLOPE, which is ~0 over the eastern basin (14 m of hills, 1-2 m of fine detail).
//
// This profile keeps every Torbor Downs settlement, road, river, lake and pinned site EXACTLY where it was, and raises the
// land between them:
//   * a distance field (16 m grid over the block) from every world road, river, lake, pinned town and pinned door: the new
//     relief is 0 within PROTECT_NEAR metres of them and full PROTECT_FAR metres away. So roads, rivers and towns keep the
//     ground the world bake graded them on (to the bit, where nothing else moved), and they run through VALLEYS with hills
//     rising on both sides — a road winding between hills, as round Mistfall.
//   * the island cut into REGIONS (a warped Voronoi over hand-placed seeds, one or two per sheet zone, named for the zone):
//     each region has its own biome mix and its own relief (amplitude + shape): rolling chalk downs, flat fen, heather
//     moor swells, red sandstone mesas, broken blackthorn ridges, long golden wolds, pine highwood ridges… Region
//     weights blend softly (~300 m) so a border is a change of ground, never a step.
//   * a COASTLINE inside the block: the land ends a wandering 120-560 m inside the old square edge (never nearer a pinned
//     town or door than its radius + 90 m; there a headland runs out to the block edge), easing down to a shingle shore,
//     except where a region keeps sea cliffs (Redcliff, the highwood, the scar).
// Pure functions of world metres + world data (world.json lines, data/world/town-pins.json, site-pins.json), so two
// neighbouring zones compute the same number on their shared edge. No node:fs: the caller hands the data in.

import { makeNoise2D, fbm, ridged, subSeed } from '../../../../worldgen/js/noise.js';

const sm = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const ss = (a, b, v) => sm((v - a) / (b - a));
/** fbm sits in 0.3..0.7 most of the time: stretched so a region's `amp` is its real hill-top-to-valley range */
const st = v => ss(0.24, 0.78, v);

/** World Forge biome ids (worldgen/js/biomes.js) Torbor Downs uses. */
export const TB = { lake: 3, beach: 4, grassland: 5, savanna: 6, shrubland: 7, temperateForest: 8, borealForest: 10, tundra: 11, badlands: 14, marsh: 15, hills: 16, mountains: 17, snowyPeaks: 18, veiledHills: 22, hallowed: 23 };
/** What those ids ARE on Torbor Downs (zone meta `biomeNames`; the client's `downs` palette draws them). */
export const TORBOR_BIOME_NAMES = {
  grassland: 'Chalk Downs', temperateForest: 'Oakwood', borealForest: 'Pine Highwood', hills: 'Heather Moor', hallowed: "Saint's Meadow",
  marsh: 'Brack Fen', badlands: 'Red Scarps', shrubland: 'Gorse Heath', savanna: 'Golden Wolds', veiledHills: 'Blackthorn Scar',
  tundra: 'High Fell', mountains: 'Grey Crags', snowyPeaks: 'Fell Tops', beach: 'Shingle Shore',
};

export const TORBOR = {
  province: 'torbor_downs',
  block: { x0: 11 * 2048, z0: 1 * 2048, x1: 15 * 2048, z1: 5 * 2048 },
  /** relief is 0 within NEAR metres of a road / river / lake / pinned town or door, full past FAR */
  PROTECT_NEAR: 14, PROTECT_FAR: 210,
  /** coastline: how far inside the block's edge the land ends (metres; noise picks within), and the shore easing */
  inset: [120, 560], shoreBand: 420,
  /**
   * Regions: [key, x, z] seeds in world metres. Sheet zones (grid [gx, gy] -> world zone z(11+gx)_(01+gy)):
   *   row 0  hollin_pass · ashcombe · brackwater · saltmouth     row 1  delvers_hill · Torborhold · torbor_cross · gullwick
   *   row 2  wychwood · saint_orrins_rise · millbrook · redcliff  row 3  blackthorn_scar · coldwater · gorse_march · sunken_wolds
   */
  seeds: [
    ['highwood', 23250, 2850], ['highwood', 22950, 4650], ['highwood', 24100, 3500],
    ['oakwood', 25350, 2700], ['oakwood', 23450, 7150], ['oakwood', 24350, 6250], ['oakwood', 28650, 6350],
    ['downs', 25500, 5250], ['downs', 27650, 5050], ['downs', 27450, 7250], ['downs', 26650, 3500], ['downs', 29250, 2800], ['downs', 26500, 6300],
    ['fen', 27950, 2750], ['fen', 29950, 4750], ['fen', 28700, 3700],
    ['moor', 24350, 4350], ['moor', 30150, 2450], ['moor', 25000, 8100],
    ['meadow', 25750, 7250], ['meadow', 26200, 6800],
    ['scarps', 29750, 7150], ['scarps', 30150, 6150], ['scarps', 29000, 6050],
    ['gorse', 27700, 9250], ['gorse', 26750, 8350], ['gorse', 28200, 8000],
    ['wolds', 29750, 9300], ['wolds', 29000, 8350], ['wolds', 30200, 8300],
    ['scar', 23400, 9250], ['scar', 24300, 8600], ['scar', 22900, 8300],
    ['fell', 25650, 9350], ['fell', 26400, 9700],
  ],
};

/**
 * Per region: its relief (amp metres, and how the 0..1 shape is drawn), whether its coast keeps cliffs, and its biomes.
 * biome(n, n2, h) picks the World Forge id from two patch noises (0..1) and the ground height.
 */
const REGIONS = {
  downs: { amp: 44, big: 0.85, cliff: 0, biome: (n, n2) => (n2 > 0.7 ? TB.temperateForest : n > 0.72 ? TB.hills : TB.grassland) },
  oakwood: { amp: 52, big: 1, cliff: 0.3, biome: (n, n2) => (n2 < 0.24 ? TB.grassland : n > 0.78 ? TB.hallowed : TB.temperateForest) },
  highwood: { amp: 62, big: 1, cliff: 1, biome: (n, n2, h) => (h > 760 ? TB.tundra : n2 > 0.74 ? TB.hills : TB.borealForest) },
  fen: { amp: 3, big: 0, cliff: 0, biome: (n, n2) => (n2 > 0.72 ? TB.grassland : n > 0.74 ? TB.temperateForest : TB.marsh) },
  moor: { amp: 60, big: 1, cliff: 0.6, biome: (n, n2) => (n2 > 0.76 ? TB.borealForest : n < 0.25 ? TB.grassland : TB.hills) },
  meadow: { amp: 20, big: 0.25, cliff: 0, biome: (n, n2) => (n2 > 0.7 ? TB.temperateForest : TB.hallowed) },
  scarps: { amp: 66, big: 0.6, cliff: 1, biome: (n, n2) => (n2 > 0.7 ? TB.shrubland : n < 0.22 ? TB.savanna : TB.badlands) },
  gorse: { amp: 34, big: 0.55, cliff: 0.2, biome: (n, n2) => (n2 > 0.74 ? TB.grassland : n > 0.76 ? TB.hills : TB.shrubland) },
  wolds: { amp: 52, big: 0.8, cliff: 0.3, biome: (n, n2) => (n2 > 0.68 ? TB.shrubland : n > 0.7 ? TB.temperateForest : n < 0.26 ? TB.grassland : TB.savanna) },
  scar: { amp: 62, big: 1, cliff: 1, biome: (n, n2, h) => (h > 900 ? TB.tundra : n2 > 0.78 ? TB.hills : TB.veiledHills) },
  fell: { amp: 52, big: 0.9, cliff: 0.5, biome: (n, n2, h) => (h > 1120 ? TB.snowyPeaks : n2 > 0.72 ? TB.hills : TB.tundra) },
};
const KEYS = Object.keys(REGIONS);

/**
 * The protect field: metres from each 16 m grid point of the block (+ a margin) to the nearest protected thing.
 * lines = [[[x, z], …], …] polylines; discs = [{x, z, r}] (distance measured from the rim). Two-pass chamfer over
 * the grid, seeded with exact distances in the cells next to each feature. Deterministic.
 */
function protectField({ lines, discs, x0, z0, x1, z1, step = 16 }) {
  const W = Math.ceil((x1 - x0) / step) + 1, H = Math.ceil((z1 - z0) / step) + 1, N = W * H;
  const D = new Float32Array(N).fill(1e9);
  const seedPt = (px, pz, r = 0) => {
    const reach = r + step * 2, i0 = Math.max(0, Math.floor((px - reach - x0) / step)), i1 = Math.min(W - 1, Math.ceil((px + reach - x0) / step));
    const j0 = Math.max(0, Math.floor((pz - reach - z0) / step)), j1 = Math.min(H - 1, Math.ceil((pz + reach - z0) / step));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const d = Math.max(0, Math.hypot(x0 + i * step - px, z0 + j * step - pz) - r), k = j * W + i;
      if (d < D[k]) D[k] = d;
    }
  };
  for (const pts of lines) for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k], b = pts[k + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / 4));
    for (let q = 0; q <= n; q++) seedPt(a[0] + (b[0] - a[0]) * q / n, a[1] + (b[1] - a[1]) * q / n);
  }
  for (const d of discs) seedPt(d.x, d.z, d.r);
  const a = step, b = step * Math.SQRT2;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i; let v = D[k];
    if (i > 0) v = Math.min(v, D[k - 1] + a);
    if (j > 0) { v = Math.min(v, D[k - W] + a); if (i > 0) v = Math.min(v, D[k - W - 1] + b); if (i < W - 1) v = Math.min(v, D[k - W + 1] + b); }
    D[k] = v;
  }
  for (let j = H - 1; j >= 0; j--) for (let i = W - 1; i >= 0; i--) {
    const k = j * W + i; let v = D[k];
    if (i < W - 1) v = Math.min(v, D[k + 1] + a);
    if (j < H - 1) { v = Math.min(v, D[k + W] + a); if (i < W - 1) v = Math.min(v, D[k + W + 1] + b); if (i > 0) v = Math.min(v, D[k + W - 1] + b); }
    D[k] = v;
  }
  return (wx, wz) => {
    const fx = Math.min(W - 1.0001, Math.max(0, (wx - x0) / step)), fz = Math.min(H - 1.0001, Math.max(0, (wz - z0) / step));
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j, k = j * W + i;
    return (D[k] * (1 - tx) + D[k + 1] * tx) * (1 - tz) + (D[k + W] * (1 - tx) + D[k + W + 1] * tx) * tz;
  };
}

/**
 * The regenerated Torbor Downs ground. `data` = { world (world.json: roads, rivers, lakes), townPins (data/world/town-pins.json),
 * sitePins (data/world/site-pins.json), harbours [{x, z, r}] } — all world metres after the caller has added zone origins.
 * Returns { height(wx, wz, mainland), seaward(wx, wz), biomeAt(wx, wz, h), regionAt, protect(wx, wz), shoreHeight }.
 */
export function makeDowns({ seed, macroMetres = 128, macroWidth = 288, world, protectDiscs = [], townDiscs = [], mainland = () => 0, rugged = () => 0 }) {
  const s0 = subSeed(seed, 'torbor-regen');
  const nW = makeNoise2D(subSeed(s0, 'warp')), nW2 = makeNoise2D(subSeed(s0, 'warp2'));
  const nA = makeNoise2D(subSeed(s0, 'a')), nB = makeNoise2D(subSeed(s0, 'b')), nC = makeNoise2D(subSeed(s0, 'c'));
  const nP = makeNoise2D(subSeed(s0, 'patch')), nP2 = makeNoise2D(subSeed(s0, 'patch2')), nBig = makeNoise2D(subSeed(s0, 'big'));
  const nI = makeNoise2D(subSeed(s0, 'inset')), nI2 = makeNoise2D(subSeed(s0, 'inset2'));
  const B = TORBOR.block, M = macroMetres;
  // what the relief keeps off: every world road and river that touches the block, lakes (their macro cells), towns, pins
  const inBlock = bb => !(bb[2] < B.x0 - 300 || bb[0] > B.x1 + 300 || bb[3] < B.z0 - 300 || bb[1] > B.z1 + 300);
  const lines = [...world.roads, ...world.rivers].filter(r => inBlock(r.bbox)).map(r => r.pts);
  const lakeDiscs = [];
  for (const l of world.lakes || []) for (const c of l.cells) {
    const x = (c % macroWidth) * M, z = Math.floor(c / macroWidth) * M;
    if (x > B.x0 - 300 && x < B.x1 + 300 && z > B.z0 - 300 && z < B.z1 + 300) lakeDiscs.push({ x, z, r: M * 0.9 });
  }
  const protect = protectField({ lines, discs: [...protectDiscs, ...lakeDiscs], x0: B.x0 - 256, z0: B.z0 - 256, x1: B.x1 + 256, z1: B.z1 + 256 });
  const townField = townDiscs.length ? protectField({ lines: [], discs: townDiscs, x0: B.x0 - 256, z0: B.z0 - 256, x1: B.x1 + 256, z1: B.z1 + 256, step: 32 }) : () => 1e9;

  /**
   * A lazily filled 16 m grid over the block (+512 m) of `C` numbers per point, bilinear between points: the region weights
   * and the coast's inset change over hundreds of metres, and computing them for every 2 m sample made a zone bake three
   * times slower. World-aligned, so the same point always reads the same number whichever zone asks first.
   */
  function gridCache(C, fn) {
    const G = 16, T = 32, gx0 = B.x0 - 512, gz0 = B.z0 - 512, NX = Math.ceil((B.x1 + 512 - gx0) / G) + 1, NZ = Math.ceil((B.z1 + 512 - gz0) / G) + 1;
    const data = new Float32Array(NX * NZ * C), done = new Uint8Array(Math.ceil(NX / T) * Math.ceil(NZ / T)), TX = Math.ceil(NX / T);
    const fill = (ti, tj) => {
      for (let j = tj * T; j < Math.min(NZ, tj * T + T); j++) for (let i = ti * T; i < Math.min(NX, ti * T + T); i++) {
        const v = fn(gx0 + i * G, gz0 + j * G), o = (j * NX + i) * C;
        for (let c = 0; c < C; c++) data[o + c] = v[c];
      }
      done[tj * TX + ti] = 1;
    };
    // Catmull-Rom over the 4 x 4 points round the sample: smooth slopes across the grid lines (bilinear left 16 m facets
    // on the high sea cliffs, where the coast's fall multiplies every kink in the inset by hundreds of metres)
    const out = new Float32Array(C), wx4 = new Float32Array(4), wz4 = new Float32Array(4);
    const crw = (t, w) => { const t2 = t * t, t3 = t2 * t; w[0] = -0.5 * t3 + t2 - 0.5 * t; w[1] = 1.5 * t3 - 2.5 * t2 + 1; w[2] = -1.5 * t3 + 2 * t2 + 0.5 * t; w[3] = 0.5 * t3 - 0.5 * t2; };
    return (wx, wz) => {
      const fx = (wx - gx0) / G, fz = (wz - gz0) / G;
      if (!(fx >= 1 && fz >= 1 && fx < NX - 2 && fz < NZ - 2)) return fn(wx, wz);
      const i = Math.floor(fx), j = Math.floor(fz);
      for (const b of [j - 1, j + 2]) for (const a of [i - 1, i + 2]) { const t = Math.floor(b / T) * TX + Math.floor(a / T); if (!done[t]) fill(Math.floor(a / T), Math.floor(b / T)); }
      // (the four corner tiles of the 4 x 4 block cover every point in it: a block spans at most two tiles each way)
      crw(fx - i, wx4); crw(fz - j, wz4);
      out.fill(0);
      for (let b = 0; b < 4; b++) for (let a = 0; a < 4; a++) {
        const w = wx4[a] * wz4[b], o = ((j - 1 + b) * NX + (i - 1 + a)) * C;
        for (let c = 0; c < C; c++) out[c] += data[o + c] * w;
      }
      return out;
    };
  }
  const weightGrid = gridCache(KEYS.length, (x, z) => { const w = weightsExact(x, z), v = new Float32Array(KEYS.length); for (const e of w) v[KEYS.indexOf(e.k)] = e.w; return v; });
  /** Region weights at a point: [{k, w}] sorted, weights > 0.01 (from the cached grid). */
  function weights(wx, wz) {
    const v = weightGrid(wx, wz), out = [];
    let sum = 0; for (let c = 0; c < KEYS.length; c++) if (v[c] > 0.01) sum += v[c];
    for (let c = 0; c < KEYS.length; c++) if (v[c] > 0.01) out.push({ k: KEYS[c], w: v[c] / sum });
    return out.sort((a, b) => b.w - a.w);
  }
  /** Region weights at a point, computed (warped seeds; soft, normalised). Returns [{k, w}] sorted, weights > 0.01. */
  function weightsExact(wx, wz) {
    const ux = wx + (fbm(nW, wx / 1400, wz / 1400, { octaves: 3 }) - 0.5) * 900, uz = wz + (fbm(nW2, wx / 1400, wz / 1400, { octaves: 3 }) - 0.5) * 900;
    let dmin = Infinity; const ds = TORBOR.seeds.map(([k, x, z]) => { const d = Math.hypot(ux - x, uz - z); if (d < dmin) dmin = d; return [k, d]; });
    const acc = {}; let sum = 0;
    for (const [k, d] of ds) { const w = Math.exp(-(d - dmin) / 150); if (w < 0.004) continue; acc[k] = (acc[k] || 0) + w; sum += w; }
    return Object.entries(acc).map(([k, w]) => ({ k, w: w / sum })).filter(e => e.w > 0.01).sort((a, b) => b.w - a.w);
  }
  /** The 0..1 relief shape of one region at a point. */
  function shape(k, wx, wz) {
    switch (k) {
      case 'downs': return 0.85 * st(fbm(nA, wx / 700, wz / 700, { octaves: 3 })) + 0.15 * st(fbm(nC, wx / 240, wz / 240, { octaves: 2 }));
      case 'oakwood': return 0.55 * st(fbm(nA, wx / 520, wz / 520, { octaves: 4 })) + 0.45 * ridged(nB, wx / 640, wz / 640, { octaves: 3 });
      case 'highwood': return 0.75 * ridged(nB, wx / 430, wz / 430, { octaves: 4 }) + 0.25 * st(fbm(nC, wx / 200, wz / 200, { octaves: 3 }));
      case 'fen': return st(fbm(nC, wx / 180, wz / 180, { octaves: 2 }));
      case 'moor': return 0.7 * st(fbm(nA, wx / 850, wz / 850, { octaves: 3 })) + 0.3 * ridged(nB, wx / 520, wz / 520, { octaves: 2 });
      case 'meadow': return st(fbm(nA, wx / 560, wz / 560, { octaves: 3 }));
      case 'scarps': {     // mesas: a broad field cut into steps with steep risers
        const f = (0.65 * st(fbm(nB, wx / 640, wz / 640, { octaves: 3 })) + 0.35 * ridged(nC, wx / 360, wz / 360, { octaves: 2 })) * 6.4;
        return (Math.floor(f) + ss(0.74, 1, f % 1)) / 6.4;
      }
      case 'gorse': return 0.55 * st(fbm(nC, wx / 230, wz / 230, { octaves: 3 })) + 0.45 * st(fbm(nA, wx / 600, wz / 600, { octaves: 2 }));
      case 'wolds': return st(fbm(nA, wx / 1150 + wz / 2600, wz / 480, { octaves: 3 }));     // long swells running east-west
      case 'scar': return 0.8 * ridged(nB, wx / 300, wz / 300, { octaves: 4, sharpness: 1.4 }) + 0.2 * st(fbm(nC, wx / 150, wz / 150, { octaves: 2 }));
      case 'fell': return 0.7 * ridged(nB, wx / 520, wz / 520, { octaves: 3 }) + 0.3 * st(fbm(nA, wx / 300, wz / 300, { octaves: 3 }));
    }
    return 0;
  }
  /** metres from the block's edge (inside positive), the corners rounded off (radius CORNER) so the island is not a square */
  const CORNER = 1300;
  function edgeDist(wx, wz) {
    const dx = Math.min(wx - B.x0, B.x1 - wx), dz = Math.min(wz - B.z0, B.z1 - wz);
    if (dx < CORNER && dz < CORNER) return CORNER - Math.hypot(CORNER - dx, CORNER - dz);
    return Math.min(dx, dz);
  }
  /** The coastline: how far in from the block edge the sea comes here. A pinned town or door keeps it off (a headland). */
  const caps = protectDiscs.filter(d => d.coast !== false).map(d => ({ ...d, e: edgeDist(d.x, d.z) }));
  const insetGrid = gridCache(1, (x, z) => [insetExact(x, z)]);
  let insetFrozen = false;          // the road headlands are found with the exact inset; after that the grid is used
  function insetAt(wx, wz) { return insetFrozen ? insetGrid(wx, wz)[0] : insetExact(wx, wz); }
  function insetExact(wx, wz) {
    const [lo, hi] = TORBOR.inset;
    const n = 0.65 * fbm(nI, wx / 1500, wz / 1500, { octaves: 3 }) + 0.35 * fbm(nI2, wx / 420, wz / 420, { octaves: 2 });
    let I = lo + (hi - lo) * ss(0.25, 0.75, n);
    I += 420 * ss(0.6, 0.78, fbm(nI2, wx / 950 + 13.7, wz / 950 - 4.1, { octaves: 2 }));     // the odd deep bay
    // high ground meets the sea in cliffs at the old edge rather than being cut back: the south-west mountains stand 600-1200 m
    // right up to it, and a coast 500 m in made a third of Blackthorn Scar's zone a kilometre-high wall. There the cliff stands
    // just outside the old edge (world-core: under the sea within 220 m of it) and the zones keep their ground.
    I *= 1 - ss(160, 600, mainland(wx, wz));
    const IMAX = hi + 420;
    for (const c of caps) {
      const d = Math.hypot(wx - c.x, wz - c.z);
      if (c.e - c.r - (c.margin ?? 110) + 0.4 * Math.max(0, d - 0.5 * c.e) > IMAX) continue;       // it can never reach down to here
      const cap = c.e - c.r - (c.margin ?? 110) + 0.4 * Math.max(0, d - (c.e - edgeDist(wx, wz)) * 0.5);
      if (cap < I) I = cap;
    }
    return Math.max(-200, I);
  }
  /** Metres past the coastline (> 0 = at sea; world-core's continentGround falls to the sea floor over `fall`). */
  const FAR_INLAND = TORBOR.inset[1] + 420 + TORBOR.shoreBand + 10;
  function seaward(wx, wz) {
    const e = edgeDist(wx, wz);
    if (e > FAR_INLAND) return TORBOR.inset[1] + 420 - e;             // deep inland: no inset can reach (cheap; < -shoreBand)
    if (e < -600) return 400 - e;                                     // far out at sea (world-core has it under water past 220 m)
    return insetAt(wx, wz) - e;
  }
  // a road that starts and ends on the island is never cut by the new coast: wherever one would come within 70 m of the
  // sea, that stretch becomes a headland too (a few passes: a new headland can move the coast elsewhere only outward)
  {
    const inside = p => p[0] > B.x0 && p[0] < B.x1 && p[1] > B.z0 && p[1] < B.z1;
    const inner = world.roads.filter(r => inBlock(r.bbox) && inside(r.pts[0]) && inside(r.pts[r.pts.length - 1]));
    for (let pass = 0; pass < 4; pass++) {
      let added = 0;
      for (const r of inner) for (let k = 0; k < r.pts.length; k += 2) {
        const p = r.pts[k]; if (edgeDist(p[0], p[1]) > TORBOR.inset[1] + 500) continue;
        if (seaward(p[0], p[1]) > -32) { caps.push({ x: p[0], z: p[1], r: 6, margin: 30, e: edgeDist(p[0], p[1]) }); added++; }
      }
      if (!added) break;
    }
    insetFrozen = true;
  }

  /** The added relief and the coast easing, on top of the pangea ground (`mainland`). */
  function height(wx, wz, mainland) {
    const d = protect(wx, wz);
    const env = ss(TORBOR.PROTECT_NEAR, TORBOR.PROTECT_FAR, d);
    let h = mainland;
    const inland = -seaward(wx, wz);
    const W = weights(wx, wz);
    if (env > 0) {
      let rel = 0, big = 0;
      for (const { k, w } of W) { rel += w * REGIONS[k].amp * shape(k, wx, wz); big += w * REGIONS[k].big; }
      // and, over most of the island, the odd real HILL (60-75 m, a kilometre or two across) standing out of the rest
      if (big > 0) rel += big * 72 * ss(0.5, 0.78, fbm(nBig, wx / 1500, wz / 1500, { octaves: 3 }));
      // ground the pangea already made rugged (the south-west mountains: World Forge macro slope 0.2-0.8) keeps its own
      // shape — stacking these hills on it made two zones two-thirds cliff
      h += rel * env * (1 - 0.8 * ss(0.1, 0.4, rugged(wx, wz)));
    }
    // the shore: the land eases down to a low shingle shore over `shoreBand` metres, except where a region keeps cliffs
    // (and never round a pinned town: it stays on the ground it was planned on)
    if (inland < TORBOR.shoreBand) {
      let cliff = 0; for (const { k, w } of W) cliff += w * REGIONS[k].cliff;
      const keep = 1 - ss(40, 320, townField(wx, wz));
      // (and not on high ground: that is a cliff coast, whatever the region)
      const wgt = (1 - ss(0, TORBOR.shoreBand, inland)) * (1 - 0.85 * cliff) * (1 - keep) * (1 - ss(70, 240, mainland));
      if (wgt > 0) {
        const target = 1.6 + Math.max(0, inland) * 0.03;
        if (target < h) h += (target - h) * wgt;
      }
    }
    return h;
  }

  /** Which World Forge biome id the regenerated Torbor Downs shows here (before water / road / rock overrides). */
  function biomeAt(wx, wz, h) {
    const W = weights(wx, wz);
    // the region by its weight, the noise choosing between near-equals so a border wanders
    const jitter = (fbm(nP, wx / 190, wz / 190, { octaves: 2 }) - 0.5) * 0.3;
    let best = W[0].k;
    if (W[1] && W[1].w + jitter > W[0].w - jitter) best = W[1].k;
    const n = fbm(nP, wx / 620, wz / 620, { octaves: 3 }), n2 = fbm(nP2, wx / 480, wz / 480, { octaves: 3 });
    const inland = -seaward(wx, wz);
    if (inland < 70 && h < 5.5) return TB.beach;
    if (h > 1150) return TB.snowyPeaks;
    if (h > 860 && best !== 'scar' && best !== 'highwood') return TB.tundra;
    return REGIONS[best].biome(n, n2, h);
  }
  function regionAt(wx, wz) { return weights(wx, wz)[0].k; }
  return { height, seaward, biomeAt, regionAt, weights, protect, insetAt, edgeDist };
}
