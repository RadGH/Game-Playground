// A region's ground, made from the same world-coordinate noise as the world map (so it lines up with its neighbours):
// height levels, sea and rivers, ore deposits, nests, and alien plants. Plain data in typed arrays; index = z*size+x.
//
// Heights are whole levels 0..MAX (0 = water level). A level step between two tiles is a low cliff; roads climb one
// level on a ramp tile. Light terraforming (owner Q19) levels tiles to a target height for money — `level()`.
import { fbm, hash2 } from './noise.js';
import { sample, biomeAt, riverAt, SEA, BIOMES } from './world.js';
import { rng } from '../../../../citykit/js/kit/rng.js';

export const MAX = 5;
export const DEP = { NONE: 0, METAL: 1, STONE: 2, CRYSTAL: 3 };
export const DEP_NAMES = ['', 'metal', 'stone', 'crystal'];

export function generateTerrain(world, region) {
  const seed = world.seed, N = region.size, wx0 = region.wx, wz0 = region.wz;
  const height = new Uint8Array(N * N), water = new Uint8Array(N * N), deposit = new Uint8Array(N * N);
  const amount = new Uint16Array(N * N), flora = new Uint8Array(N * N), biome = new Uint8Array(N * N);
  const BIDS = Object.keys(BIOMES);
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const i = z * N + x, wx = wx0 + x, wz = wz0 + z;
    const s = sample(seed, wx, wz);
    if (s.h < SEA) { water[i] = 2; height[i] = 0; continue; }                     // sea
    // land: 1..MAX, gentler near the coast, terraces inland
    const t = (s.h - SEA) / (1 - SEA);
    height[i] = Math.max(1, Math.min(MAX, 1 + Math.floor(Math.pow(t, 1.15) * MAX * 1.35)));
    if (riverAt(seed, wx, wz)) { water[i] = 1; }
    biome[i] = BIDS.indexOf(biomeAt(seed, wx, wz));
  }
  // rivers sit one level below their banks. Depth spreads inward from the banks: a tile in the middle of a wide river
  // has no dry neighbour, and taking "the lowest dry neighbour" there left it at full height — a raised river
  // (owner report #70, 2026-11-16). Relax until stable: each river tile = min(bank − 1, neighbouring river tile).
  smoothSteps(height, water, N);
  settleRivers({ size: N, height, water });   // after smoothing, so a save's re-settle on load gives the same result
  // deposits: blobs of ore where the region is rich in it
  const R = rng(seed * 7919 + region.id * 31 + 5);
  const kinds = [[DEP.METAL, region.deposits.metal], [DEP.STONE, region.deposits.stone], [DEP.CRYSTAL, region.deposits.crystal]];
  for (const [k, rich] of kinds) {
    const blobs = Math.round(rich * (N / 64) * (N / 64) * 3.2) + (rich > 0.3 ? 1 : 0);
    for (let b = 0; b < blobs; b++) {
      const cx = R.int(4, N - 5), cz = R.int(4, N - 5), r = R.range(2.2, 4.5);
      for (let z = Math.floor(cz - r); z <= cz + r; z++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        if (x < 0 || z < 0 || x >= N || z >= N) continue; const i = z * N + x;
        const d = Math.hypot(x - cx, z - cz) / r + (hash2(seed + b, x, z) - 0.5) * 0.5;
        if (d < 1 && !water[i] && !deposit[i]) { deposit[i] = k; amount[i] = Math.round(400 + 1200 * (1 - d) * rich); }
      }
    }
  }
  // plants: per biome density, never on water or deposits
  for (let i = 0; i < N * N; i++) if (!water[i] && !deposit[i]) { const x = i % N, z = (i / N) | 0; const v = fbm(seed + 616, wx0 + x, wz0 + z, 14, 2), keep = hash2(seed + 3, wx0 + x, wz0 + z); if (v > 0.62 && keep < 0.45) flora[i] = 1 + (hash2(seed, wx0 + x, wz0 + z) * 3 | 0); }
  // nests: spread over land, not on ore, not too close to each other
  const nests = [];
  for (let k = 0, tries = 0; k < region.nests && tries < region.nests * 60; tries++) {
    const x = R.int(3, N - 4), z = R.int(3, N - 4), i = z * N + x;
    if (water[i] || deposit[i] || nests.some(n => Math.hypot(n.x - x, n.z - z) < 10)) continue;
    nests.push({ x, z, size: R.range(0.6, 1.3), grow: 0 }); k++;
  }
  return { size: N, height, water, deposit, amount, flora, biome, nests };
}

/** No single-tile pits or spikes: a land tile surrounded on 3+ sides by one level takes it. */
function smoothSteps(height, water, N) {
  for (let pass = 0; pass < 2; pass++) for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) {
    const i = z * N + x; if (water[i]) continue;
    const ns = [i - 1, i + 1, i - N, i + N].filter(j => !water[j]).map(j => height[j]);
    if (ns.length < 3) continue;
    const counts = {}; for (const h of ns) counts[h] = (counts[h] || 0) + 1;
    const [h, c] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (c >= 3 && +h !== height[i]) height[i] = +h;
  }
}

/** Is this rectangle flat dry land (all one height, no water)? Lots and most buildings need it. */
export function isFlat(ter, x, z, w, d) {
  const N = ter.size; let h = -1;
  for (let k = 0; k < d; k++) for (let j = 0; j < w; j++) {
    const tx = x + j, tz = z + k; if (tx < 0 || tz < 0 || tx >= N || tz >= N) return false;
    const i = tz * N + tx; if (ter.water[i]) return false; if (h < 0) h = ter.height[i]; else if (ter.height[i] !== h) return false;
  }
  return true;
}

/** Cost and result of levelling a rectangle to `to` (light terraforming): returns { cost, changed }. Water stays. */
export function levelCost(ter, x, z, w, d, to, perStep) {
  let steps = 0; const N = ter.size;
  for (let k = 0; k < d; k++) for (let j = 0; j < w; j++) { const tx = x + j, tz = z + k; if (tx < 0 || tz < 0 || tx >= N || tz >= N) continue; const i = tz * N + tx; if (ter.water[i]) continue; steps += Math.abs(ter.height[i] - to); }
  return { cost: steps * perStep, changed: steps };
}
export function level(ter, x, z, w, d, to) {
  const N = ter.size;
  for (let k = 0; k < d; k++) for (let j = 0; j < w; j++) { const tx = x + j, tz = z + k; if (tx < 0 || tz < 0 || tx >= N || tz >= N) continue; const i = tz * N + tx; if (!ter.water[i]) ter.height[i] = Math.max(1, Math.min(MAX, to)); }
}

/** River tiles sit below their banks: depth spreads inward from the banks (see generateTerrain). Also run on old saves. */
export function settleRivers(ter) {
  const N = ter.size, height = ter.height, water = ter.water;
  for (let i = 0; i < N * N; i++) if (water[i] === 1) height[i] = MAX;
  for (let changed = true, pass = 0; changed && pass < N * 2; pass++) {
    changed = false;
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const i = z * N + x; if (water[i] !== 1) continue;
      let h = height[i];
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz; if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
        const j = nz * N + nx;
        const cand = water[j] === 0 ? height[j] - 1 : water[j] === 2 ? 0 : height[j];
        if (cand < h) h = cand;
      }
      h = Math.max(0, h); if (h !== height[i]) { height[i] = h; changed = true; }
    }
  }
  return ter;
}
