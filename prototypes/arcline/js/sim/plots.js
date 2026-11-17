// Zoned land, cut into building plots (owner 2026-11-17: "I painted 4x8 rci regions but residential only took 1x1
// squares on the edge and left the middle empty… let's add multiple size buildings 1x1 and 1x2 and 2x2 for each rci…
// It should be smart enough that a 4x2 region fits two 2x2 houses without putting one 2x2 in the center which would
// cause the remaining 4 tiles to only fit 1x2 or 1x1").
//
//   Blocks:  each connected patch of one zone (painted land and the zoned buildings on it, 4-neighbour) is a block.
//   Plots:   planBlock() cuts a block into 2×2 plots first, packed from one of the block's corners so the squares line
//            up with its edges (a 4×2 strip → two 2×2, never one in the middle), then 2×1 / 1×2 for what is left, then
//            1×1. It tries the 8 ways to sweep the block (4 corners × rows or columns first) and keeps the plan with
//            the most 2×2 plots, then the fewest 1×1, then the most big plots on a road. Odd widths end up as a 1-wide
//            strip of 2×1 / 1×1 plots along one edge, nowhere else.
//   Access:  a plot can be built on if it is within T.zoneDepth tiles of a road that reaches the Colony Core, walking
//            through the same block (the block's own footpaths) — so a painted block fills its middle too, not just the
//            road front. accessDist() is that walk (1 = touching the road).
//   Growth (city.js grow) builds a 1×1, a 2×1 or the whole plot on a free plot; later the pieces in one plot combine
//   into a building the size of the plot (city.js levelUp — the same check the info panel shows).
//
// The plan only depends on the painted blocks, the roads and the big buildings already standing, so it does not shift
// as a block fills in. Cached on the region (not saved) until any of those change.
import { T } from './tuning.js';

const ZKEY = { 1: 'R', 2: 'C', 3: 'I' };
/** Default walk from a road (tiles) for zoned land to grow; T.zoneDepth overrides it. */
export const ZONE_DEPTH = 8;
export const zoneDepth = () => T.zoneDepth ?? ZONE_DEPTH;

/**
 * Cut one block into plots. mask: Uint8Array W×H (1 = in the block). Local coordinates.
 * opts.fixed: [{ x, z, w, d }] plots that are already decided (big buildings standing there) — kept as they are.
 * opts.pieces: [{ x, z, w, d }] smaller buildings already standing — a plan that cuts through one scores worse.
 * opts.front: Uint8Array W×H, 1 where a tile touches a road — big plots there score better (ties only).
 * → [{ x, z, w, d }] covering every block tile exactly once.
 */
export function planBlock(mask, W, H, { fixed = [], pieces = [], front = null } = {}) {
  const base = mask.slice();
  const out0 = [];
  for (const f of fixed) { out0.push({ x: f.x, z: f.z, w: f.w, d: f.d }); for (let k = 0; k < f.d; k++) for (let j = 0; j < f.w; j++) { const i = (f.z + k) * W + f.x + j; if (i >= 0 && i < W * H) base[i] = 0; } }
  let best = null;
  for (let o = 0; o < 8; o++) {
    const flipX = o & 1, flipZ = (o >> 1) & 1, cols = (o >> 2) & 1;
    const used = new Uint8Array(W * H), plots = [];
    const free = (x, z) => x >= 0 && z >= 0 && x < W && z < H && base[z * W + x] && !used[z * W + x];
    const take = (x, z, w, d) => { plots.push({ x, z, w, d }); for (let k = 0; k < d; k++) for (let j = 0; j < w; j++) used[(z + k) * W + x + j] = 1; };
    // 1. 2×2 squares, each grown away from the corner the sweep starts at
    const A = cols ? W : H, B = cols ? H : W;
    for (let a = 0; a < A; a++) for (let b = 0; b < B; b++) {
      let x = cols ? a : b, z = cols ? b : a;
      if (flipX) x = W - 1 - x; if (flipZ) z = H - 1 - z;
      if (!free(x, z)) continue;
      const x2 = flipX ? x - 1 : x + 1, z2 = flipZ ? z - 1 : z + 1;
      if (free(x2, z) && free(x, z2) && free(x2, z2)) take(Math.min(x, x2), Math.min(z, z2), 2, 2);
    }
    // 2. what is left: pair tiles into 2×1 / 1×2, the tile with the fewest free neighbours first (strips pair up end to
    //    end instead of stranding a tile), then 1×1
    const nfree = (x, z) => (free(x + 1, z) ? 1 : 0) + (free(x - 1, z) ? 1 : 0) + (free(x, z + 1) ? 1 : 0) + (free(x, z - 1) ? 1 : 0);
    for (;;) {
      let pick = null, pn = 9;
      for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) if (free(x, z)) { const n = nfree(x, z); if (n < pn) { pn = n; pick = [x, z]; } }
      if (!pick) break;
      const [x, z] = pick;
      let mate = null, mn = 9;
      for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) if (free(x + dx, z + dz)) { const n = nfree(x + dx, z + dz); if (n < mn) { mn = n; mate = [x + dx, z + dz]; } }
      if (mate) take(Math.min(x, mate[0]), Math.min(z, mate[1]), Math.abs(mate[0] - x) + 1, Math.abs(mate[1] - z) + 1);
      else take(x, z, 1, 1);
    }
    // score: most 2×2, fewest 1×1, standing buildings not cut through, big plots on the road
    let big = 0, single = 0, cut = 0, onRoad = 0;
    for (const p of plots) {
      if (p.w * p.d === 4) { big++; if (front) for (let k = 0; k < 2; k++) for (let j = 0; j < 2; j++) onRoad += front[(p.z + k) * W + p.x + j] ? 1 : 0; }
      if (p.w * p.d === 1) single++;
    }
    for (const q of pieces) if (!plots.some(p => q.x >= p.x && q.z >= p.z && q.x + q.w <= p.x + p.w && q.z + q.d <= p.z + p.d)) cut++;
    const score = big * 1000 - single * 10 - cut * 400 + onRoad;
    if (!best || score > best.score) best = { score, plots };
  }
  return out0.concat(best ? best.plots : []);
}

/** The block mask for zone code z: painted land with nothing else on it, or this zone's own zoned buildings. */
function blockTile(r, i, code, lotZone, turretAt) {
  if (r.tiles.zone[i] !== code || r.tiles.road[i] || r.tiles.wall[i] || turretAt.has(i) || r.ter.water[i]) return false;
  const li = r.tiles.lot[i];
  return li < 0 || lotZone[li] === code;
}
/** A cheap fingerprint of everything the plan depends on (zones, roads, walls, turrets, which tiles hold which lot). */
function planKey(r) {
  const N = r.size, Z = r.tiles.zone, Rd = r.tiles.road, Wl = r.tiles.wall, L = r.tiles.lot;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < N * N; i++) {
    const v = Z[i] | (Rd[i] ? 8 : 0) | (Wl[i] ? 16 : 0) | ((L[i] + 1) << 5);
    h = Math.imul(h ^ v, 16777619) >>> 0;
  }
  for (const t of r.turrets) h = Math.imul(h ^ (t.z * N + t.x + 7), 16777619) >>> 0;
  for (const l of r.lots) if (l.kind === 'zoned') h = Math.imul(h ^ (l.w * 13 + l.d * 7 + l.x * 31 + l.z), 16777619) >>> 0;
  return `${N}|${r.lots.length}|${h}`;
}

/**
 * Every plot of every zone, cached on the region until the land changes.
 * → { list: [{ x, z, w, d, zone: 'R'|'C'|'I', block }], at: Int32Array (plot index per tile, −1 = none), dist: Uint8Array
 *     (accessDist — 255 = no road reached), key }
 */
export function plots(r, reach = null) {
  const key = planKey(r) + '|' + (r.lineRev || 0);
  if (r._plots?.key === key) return r._plots;
  const N = r.size, NN = N * N;
  const lotZone = r.lots.map(l => (l.kind === 'zoned' ? { R: 1, C: 2, I: 3 }[l.zone] : -1));
  const turretAt = new Set(r.turrets.map(t => t.z * N + t.x));
  const list = [], at = new Int32Array(NN).fill(-1), seen = new Uint8Array(NN);
  let block = 0;
  for (let s = 0; s < NN; s++) {
    const code = r.tiles.zone[s]; if (!code || seen[s] || !blockTile(r, s, code, lotZone, turretAt)) continue;
    // flood the block
    const cells = [s]; seen[s] = 1;
    for (let q = 0; q < cells.length; q++) {
      const i = cells[q], x = i % N;
      for (const j of [x > 0 ? i - 1 : -1, x < N - 1 ? i + 1 : -1, i - N, i + N]) {
        if (j < 0 || j >= NN || seen[j] || !blockTile(r, j, code, lotZone, turretAt)) continue;
        seen[j] = 1; cells.push(j);
      }
    }
    let x0 = N, z0 = N, x1 = 0, z1 = 0;
    for (const i of cells) { const x = i % N, z = (i / N) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
    const W = x1 - x0 + 1, H = z1 - z0 + 1, mask = new Uint8Array(W * H), front = new Uint8Array(W * H);
    for (const i of cells) {
      const x = i % N, z = (i / N) | 0; mask[(z - z0) * W + x - x0] = 1;
      if ((x > 0 && r.tiles.road[i - 1]) || (x < N - 1 && r.tiles.road[i + 1]) || (z > 0 && r.tiles.road[i - N]) || (z < N - 1 && r.tiles.road[i + N])) front[(z - z0) * W + x - x0] = 1;
    }
    // buildings standing in the block: 2×2 and bigger keep their ground as a plot; smaller ones should not be cut
    const fixed = [], pieces = [], inBlock = new Set();
    for (const i of cells) { const li = r.tiles.lot[i]; if (li >= 0) inBlock.add(li); }
    for (const li of inBlock) {
      const l = r.lots[li], rect = { x: l.x - x0, z: l.z - z0, w: l.w, d: l.d };
      if (l.w * l.d >= 4) fixed.push(rect); else pieces.push(rect);
    }
    for (const p of planBlock(mask, W, H, { fixed, pieces, front })) {
      const idx = list.length; list.push({ x: p.x + x0, z: p.z + z0, w: p.w, d: p.d, zone: ZKEY[code], block });
      for (let k = 0; k < p.d; k++) for (let j = 0; j < p.w; j++) at[(p.z + z0 + k) * N + p.x + x0 + j] = idx;
    }
    block++;
  }
  const out = { key, list, at, dist: accessDist(r, at, reach) };
  Object.defineProperty(r, '_plots', { value: out, enumerable: false, configurable: true, writable: true });
  return out;
}

/** The walk from a connected road through zoned blocks: 1 on a tile touching a road in `reach`, +1 per tile through
 *  the same block. 255 = no road reached. (reach defaults to every road; city.js passes roadReach.) */
export function accessDist(r, at, reach = null) {
  const N = r.size, NN = N * N, dist = new Uint8Array(NN).fill(255), q = [];
  const roadOk = j => (reach ? reach[j] : r.tiles.road[j]);
  for (let i = 0; i < NN; i++) {
    if (at[i] < 0) continue; const x = i % N;
    if ((x > 0 && roadOk(i - 1)) || (x < N - 1 && roadOk(i + 1)) || (i >= N && roadOk(i - N)) || (i < NN - N && roadOk(i + N))) { dist[i] = 1; q.push(i); }
  }
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % N, d = dist[i];
    if (d >= 254) continue;
    for (const j of [x > 0 ? i - 1 : -1, x < N - 1 ? i + 1 : -1, i - N, i + N]) {
      if (j < 0 || j >= NN || at[j] < 0 || dist[j] <= d + 1) continue;
      if (r.tiles.zone[j] !== r.tiles.zone[i]) continue;     // only through the same zone
      dist[j] = d + 1; q.push(j);
    }
  }
  return dist;
}

/** The plot a lot stands in (the one holding its first tile, if it holds the whole lot) or null. */
export function plotOf(P, r, l) {
  const k = P.at[l.z * r.size + l.x]; if (k < 0) return null;
  const p = P.list[k];
  return l.x >= p.x && l.z >= p.z && l.x + l.w <= p.x + p.w && l.z + l.d <= p.z + p.d ? p : null;
}
/** Shortest walk to a road over a rectangle's tiles (1 = it touches one). */
export function rectAccess(P, r, x, z, w, d) {
  let m = 255; for (let k = 0; k < d; k++) for (let j = 0; j < w; j++) m = Math.min(m, P.dist[(z + k) * r.size + x + j]); return m;
}
/**
 * Which way a zoned building inside a block faces when it doesn't sit on a road with its front: toward the way out —
 * the allowed side whose neighbours are closest to a road (a road tile counts as 0). size as in networks.js lotFace.
 * → model turn (0 = +z, 1 = −x, 2 = −z, 3 = +x)
 */
export function inwardFace(P, r, x, z, w, d, size) {
  const N = r.size;
  const at = (tx, tz) => (tx < 0 || tz < 0 || tx >= N || tz >= N ? 300 : r.tiles.road[tz * N + tx] ? 0 : P.dist[tz * N + tx]);
  const side = q => {
    let m = 300;
    if (q === 0 || q === 2) { const tz = q === 0 ? z + d : z - 1; for (let j = 0; j < w; j++) m = Math.min(m, at(x + j, tz)); }
    else { const tx = q === 3 ? x + w : x - 1; for (let k = 0; k < d; k++) m = Math.min(m, at(tx, z + k)); }
    return m;
  };
  const allowed = size[0] === size[1] ? [0, 3, 2, 1] : w === size[0] ? [0, 2] : [3, 1];
  let best = allowed[0], bm = 999;
  for (const q of allowed) { const m = side(q); if (m < bm) { bm = m; best = q; } }
  return best;
}
