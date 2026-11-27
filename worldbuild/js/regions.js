// World Build — stage 3, Regions & biomes: cut the land into the brief's regions with borders that follow ridges and
// rivers, work out how wet and how wooded each spot is, and give every spot a monster level that grows with the walk
// from the start. Pure and seeded.
//
//   regionWorld(W)   adds W.regionList, W.macro.region (Uint8 index into regionList), W.macro.level (Uint8 levels),
//                    W.macro.wet / W.macro.forest (0..1), W.macro.travel (metres walked from the start),
//                    W.classify(x, z, extra) → biome name (stage 6 calls it again once roads and towns exist)

import { makeHeap, makeNoise2D, fbm, smoothstep, clamp, gridBilinear } from './core.js';
import { THEMES } from './themes.js';
import { distanceFrom } from './water.js';

export const LEVEL_RUN = 70;   // metres per level where two regions meet
const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export function regionWorld(W) {
  const { brief, macro: M, pin } = W;
  const { nx, nz, cell } = M, MN = nx * nz;
  const H = M.H;
  // the region list: the pinned piece's own regions first (their ids unchanged), then the brief's
  const list = [];
  if (pin) for (const [id, r] of Object.entries(pin.lists.regions)) list.push({ id, name: r.name, levels: r.levels, pinned: true, theme: id === 'thornmere_wilds' ? 'oldwood' : 'farmland', ground: r.ground, forest: r.forest });
  for (const r of brief.regions) list.push({ id: r.id, name: r.name, levels: r.levels, theme: r.theme, ground: THEMES[r.theme].ground, forest: r.forest ?? THEMES[r.theme].forest, brief: r });
  const idxOf = Object.fromEntries(list.map((r, i) => [r.id, i]));
  const reg = new Uint8Array(MN).fill(255);
  const cellOf = (x, z) => clamp(Math.round((z - M.minZ) / cell), 0, nz - 1) * nx + clamp(Math.round((x - M.minX) / cell), 0, nx - 1);
  const cx = j => M.minX + (j % nx) * cell, cz = j => M.minZ + Math.floor(j / nx) * cell;

  // ---------------------------------------------------------------- 1. grow every region from its middle at once
  // stepping over a ridge (height up then down) or across a river costs a lot, so borders settle on ridges and rivers
  const cost = new Float64Array(MN).fill(Infinity);
  const heap = makeHeap(1 << 16);
  const weight = list.map(r => r.brief?.weight || 1);
  if (pin) for (let j = 0; j < MN; j++) if (M.keep[j]) { reg[j] = idxOf[pin.regionAt(cx(j), cz(j))]; cost[j] = 0; }
  for (const r of brief.regions) {
    const j = cellOf(r.at[0], r.at[1]);
    if (M.keep[j]) throw new Error(`region ${r.id}: its middle ${r.at.join(', ')} is inside the pinned piece.`);
    cost[j] = 0; reg[j] = idxOf[r.id]; heap.push(0, j);
  }
  while (heap.size) {
    const c = heap.topPri(), j = heap.pop();
    if (c > cost[j]) continue;
    const i = j % nx, k = (j - i) / nx, ri = reg[j], w = weight[ri];
    for (const [di, dk] of N8) {
      const ii = i + di, kk = k + dk;
      if (ii < 0 || kk < 0 || ii >= nx || kk >= nz) continue;
      const jj = kk * nx + ii;
      if (M.keep[jj]) continue;
      const L = (di && dk ? 1.4142 : 1) * cell;
      const step = L + 9 * Math.abs(H[jj] - H[j]) + (M.river[jj] && !M.river[j] ? 260 : 0) + (M.sea[jj] ? 4 * L : 0);
      const nc = c + step / w;
      if (nc < cost[jj]) { cost[jj] = nc; reg[jj] = ri; heap.push(nc, jj); }
    }
  }
  for (let j = 0; j < MN; j++) if (reg[j] === 255) reg[j] = 0;

  // ---------------------------------------------------------------- 2. how far you walk from the start to each spot
  let startAt = brief.start?.at || (pin ? [pin.map.spawn.at[0] + pin.at[0], pin.map.spawn.at[1] + pin.at[1]] : list[0].brief.at);
  // a start that landed in water or on a cliff moves to the nearest dry, gentle spot (and says so in W.startMoved)
  {
    const okAt = j => !M.sea[j] && M.lake[j] < 0 && !M.river[j] && (() => { const i = j % nx, k = (j - i) / nx; let worst = 0; for (const [di, dk] of N8) { const ii = i + di, kk = k + dk; if (ii >= 0 && kk >= 0 && ii < nx && kk < nz) worst = Math.max(worst, Math.abs(H[kk * nx + ii] - H[j])); } return worst < 3; })();
    const j0 = cellOf(startAt[0], startAt[1]);
    if (!M.keep[j0] && !okAt(j0)) {
      let best = -1, bd = Infinity;
      for (let j = 0; j < MN; j++) { const d = Math.hypot(cx(j) - startAt[0], cz(j) - startAt[1]); if (d < bd && d < 600 && !M.keep[j] && okAt(j)) { bd = d; best = j; } }
      if (best >= 0) { W.startMoved = { from: startAt, to: [cx(best), cz(best)], by: Math.round(bd) }; startAt = [cx(best), cz(best)]; }
    }
  }
  const gateCell = new Uint8Array(MN);
  if (pin) for (const gt of pin.gates) for (let dk = -4; dk <= 4; dk++) for (let di = -4; di <= 4; di++) { const j = cellOf(gt.edge[0] + di * cell, gt.edge[1] + dk * cell); if (!M.keep[j]) gateCell[j] = 1; }
  const travel = new Float64Array(MN).fill(Infinity);   // (Float64: see water.js distanceFrom)
  {
    const j0 = cellOf(startAt[0], startAt[1]);
    travel[j0] = 0; heap.push(0, j0);
    while (heap.size) {
      const c = heap.topPri(), j = heap.pop();
      if (c > travel[j]) continue;
      const i = j % nx, k = (j - i) / nx;
      for (const [di, dk] of N8) {
        const ii = i + di, kk = k + dk;
        if (ii < 0 || kk < 0 || ii >= nx || kk >= nz) continue;
        const jj = kk * nx + ii;
        if (M.sea[jj] || M.lake[jj] >= 0) continue;
        // out of the pinned piece only through its gates (its edge is a wall of hills everywhere else)
        if (M.keep[j] && !M.keep[jj] && !gateCell[jj]) continue;
        const L = (di && dk ? 1.4142 : 1) * cell, g = Math.abs(H[jj] - H[j]) / L;
        // the kept piece is crossed by its own roads only (its edge is a wall of hills except at the gates)
        const nc = c + L * (1 + 6 * g * g * 10) + (M.river[jj] ? 40 : 0);
        if (nc < travel[jj]) { travel[jj] = nc; heap.push(nc, jj); }
      }
    }
  }

  // ---------------------------------------------------------------- 3. levels: each region's band, low near where you come in
  const level = new Uint8Array(MN);
  // t = the share of the region nearer the start than this spot (by walk), 0 where you come in, 1 at the far end.
  // A rank, not a distance: a few far, steep corners would otherwise squash everything else near 0.
  const share = new Float32Array(MN);
  list.forEach((r, ri) => {
    if (r.pinned) return;
    const cells = [];
    for (let j = 0; j < MN; j++) if (reg[j] === ri) cells.push(j);
    cells.sort((a, b) => (travel[a] - travel[b]) || (a - b));
    const n = cells.length;
    cells.forEach((j, q) => { share[j] = Number.isFinite(travel[j]) ? q / Math.max(1, n - 1) : 1; });
    r.entry = travel[cells[Math.floor(n * 0.04)]] ?? 0; r.far = travel[cells[Math.floor(n * 0.96)]] ?? 1;
    for (const j of cells) level[j] = Math.round(r.levels[0] + (r.levels[1] - r.levels[0]) * share[j]);
  });
  // across a border between two new regions the level may only climb so fast (1 level per `LEVEL_RUN` m): where a
  // region of 22+ meets one of 16, its edge eases from 16 upwards instead of jumping (the brief's band is where each
  // region heads, not a wall). The pinned piece is not a source: its edge is a wall of hills except at the gates.
  {
    const LF = new Float64Array(MN);
    for (let j = 0; j < MN; j++) LF[j] = level[j];
    const hq = makeHeap(1 << 16);
    for (let j = 0; j < MN; j++) if (!M.keep[j]) hq.push(LF[j], j);
    while (hq.size) {
      const v = hq.topPri(), j = hq.pop();
      if (v > LF[j]) continue;
      const i = j % nx, k = (j - i) / nx;
      for (const [di, dk] of N8) {
        const ii = i + di, kk = k + dk;
        if (ii < 0 || kk < 0 || ii >= nx || kk >= nz) continue;
        const jj = kk * nx + ii;
        if (M.keep[jj]) continue;
        const cand = v + (di && dk ? 1.4142 : 1) * cell / LEVEL_RUN;
        if (cand < LF[jj] - 1e-9) { LF[jj] = cand; hq.push(cand, jj); }
      }
    }
    for (let j = 0; j < MN; j++) if (!M.keep[j]) level[j] = Math.round(LF[j]);
  }
  if (pin) for (let j = 0; j < MN; j++) if (M.keep[j]) { const b = pin.levelBandAt(cx(j), cz(j)); level[j] = Math.round((b[0] + b[1]) / 2); }

  // ---------------------------------------------------------------- 4. wetness and woods
  const nWet = makeNoise2D((W.seed ^ 0x7a11) >>> 0), nWood = makeNoise2D((W.seed ^ 0x3c3c) >>> 0);
  const waterCells = [];
  for (let j = 0; j < MN; j++) if (M.river[j] || M.lake[j] >= 0 || M.sea[j]) waterCells.push(j);
  const wd = distanceFrom(M, waterCells, 400);
  const wet = new Float32Array(MN), forest = new Float32Array(MN);
  const accMax = Math.log(1 + Math.max(...M.acc.subarray(0, 1000)) + 1);
  for (let j = 0; j < MN; j++) {
    const r = list[reg[j]], th = THEMES[r.theme];
    const near = Number.isFinite(wd[j]) ? 1 - smoothstep(0, 260, wd[j]) : 0;
    const flow = clamp(Math.log(1 + M.acc[j]) / 9, 0, 1);
    const x = cx(j), z = cz(j);
    wet[j] = clamp(th.wet * 0.55 + near * 0.35 + flow * 0.15 + (fbm(nWet, x / 500, z / 500, { octaves: 3 }) - 0.5) * 0.5, 0, 1);
    const n = fbm(nWood, x / 260, z / 260, { octaves: 4 });
    let f = r.forest * (0.25 + 1.5 * n);
    if (th.snowline && H[j] > th.snowline - 40) f *= smoothstep(th.snowline + 20, th.snowline - 40, H[j]);
    f *= 0.6 + 0.6 * smoothstep(0.15, 0.6, wet[j]);
    forest[j] = clamp(f, 0, 1);
  }
  void accMax;
  Object.assign(M, { region: reg, level, travel, share, wet, forest, waterDist: wd });
  W.regionList = list;
  W.regionIndex = idxOf;
  W.startAt = startAt;

  /**
   * The biome at a spot from the ground alone (`extra` lets stage 6 add roads / towns / fields on top). Kept as one
   * function so the picture of stage 3 and the final biome grid agree everywhere nothing was built.
   */
  W.classify = (x, z, h, slope, waterDepth, extra = null) => {
    const j = cellOf(x, z), r = list[reg[j]], th = THEMES[r.theme];
    if (waterDepth > W.brief.limits.wadeDepth) return 'water';
    if (extra) { const b = extra(x, z); if (b) return b; }
    if (waterDepth > -0.6 && waterDepth > -9) return th.ground === 'dustland' ? 'shore' : (M.sea[j] || h < 1.2 ? 'beach' : 'shore');
    if (h < 2 && (wd[j] < 60) && M.sea[j] === 0 && brief.sea.edges.length && r.theme === 'coast') return 'beach';
    if (slope > 34) return th.snowline && h > th.snowline ? 'snow' : 'rock';
    if (th.snowline && h > th.snowline + gridNoise(x, z) * 30) return slope > 26 ? 'scree' : 'snow';
    if (slope > 27) return r.theme === 'alpine' || r.theme === 'moor' ? 'scree' : 'rock';
    const wv = gridBilinear(M, x, z, wet);
    if (wv > 0.78 && slope < 6) return r.theme === 'fen' ? 'fen' : 'marsh';
    if (gridBilinear(M, x, z, forest) > 0.55) return 'forest';
    return r.ground || th.ground;
  };
  const nG = makeNoise2D((W.seed ^ 0x1234) >>> 0);
  const gridNoise = (x, z) => nG(x / 90, z / 90);
  return W;
}
