// World Build — stage 2, Shape: the ground in metres, mountain ranges, valleys, lakes, the sea, and rivers that only run
// downhill into lakes or the sea. Pure and seeded.
//
// Two grids: a coarse 8 m grid for everything about drainage (fast to flood and route over), then the 2 m grid the game
// walks (Oathwild's terrain.js cell), made by smoothly upsampling the coarse ground and adding fine detail. The pinned
// hand-made piece is read straight out of Oathwild's own height grid, value for value, and the `seam` round it blends
// into the new ground. Rivers are cut into the 2 m grid with the same channel shape terrain.js uses.
//
//   const W = shapeWorld(brief, pin)   → the world object every later stage adds to (see pipeline.js for its fields)

import { makeNoise2D, fbm, ridged, smoothstep, clamp, lerp, rngFor, makeGrid, gridSample, gridCubic, gridBilinear, polyDist, simplify, evenPoints, smoothLine } from './core.js';
import { RELIEF } from './themes.js';
import { applyGround } from './edits.js';
import { routeRiver, carveRiverPath, priorityFlood, accumulate, findLakes, traceStreams, distanceFrom } from './water.js';

export const MACRO_CELL = 8;
export const WATER = Object.freeze({ none: 0, river: 1, marsh: 2, lake: 3, sea: 4 });

export function shapeWorld(brief, pin, { edits = null } = {}) {
  const seed = brief.seed;
  const Bd = brief.size.bounds, cell = brief.size.cell;
  const bounds = { ...Bd, margin: brief.size.margin };
  const nx = Math.round((Bd.maxX - Bd.minX) / cell) + 1, nz = Math.round((Bd.maxZ - Bd.minZ) / cell) + 1;
  const M = makeGrid({ minX: Bd.minX, minZ: Bd.minZ, cell: MACRO_CELL, nx: Math.round((Bd.maxX - Bd.minX) / MACRO_CELL) + 1, nz: Math.round((Bd.maxZ - Bd.minZ) / MACRO_CELL) + 1 });
  M.H = M.data;
  const MN = M.nx * M.nz;
  const mx = i => M.minX + i * MACRO_CELL, mz = k => M.minZ + k * MACRO_CELL;
  const noise = k => makeNoise2D((seed ^ Math.imul(k + 1, 0x9e3779b1)) >>> 0);
  const nBase = noise(1), nRidge = noise(2), nRange = noise(3), nWx = noise(4), nWz = noise(5), nDet = noise(6), nCoast = noise(7), nDet2 = noise(8), nFrame = noise(9);

  // ---------------------------------------------------------------- relief blend from the regions' centres (soft)
  const centres = brief.regions.map(r => ({ at: r.at, w: r.weight, R: RELIEF[r.relief] }));
  if (pin) centres.push({ at: [(pin.keep.minX + pin.keep.maxX) / 2, (pin.keep.minZ + pin.keep.maxZ) / 2], w: 1.4, R: RELIEF.hills });
  const RB = { base: new Float32Array(MN), roll: new Float32Array(MN), detail: new Float32Array(MN), ridge: new Float32Array(MN), terrace: new Float32Array(MN) };
  const seaEdges = brief.sea.edges;
  const edgeDist = (x, z, e) => (e === 'north' ? z - Bd.minZ : e === 'south' ? Bd.maxZ - z : e === 'west' ? x - Bd.minX : Bd.maxX - x);
  const frameEdges = ['north', 'south', 'east', 'west'].filter(e => !seaEdges.includes(e));

  // ---------------------------------------------------------------- 1. raw ground
  for (let k = 0; k < M.nz; k++) for (let i = 0; i < M.nx; i++) {
    const x = mx(i), z = mz(k), j = k * M.nx + i;
    const wx = x + nWx(x / 900, z / 900) * 230, wz = z + nWz(x / 900, z / 900) * 230;
    let sw = 0; const P = { base: 0, roll: 0, detail: 0, ridge: 0, terrace: 0 };
    for (const c of centres) {
      const d = Math.max(60, Math.hypot(wx - c.at[0], wz - c.at[1]));
      const w = c.w / (d * d * d * d);
      sw += w;
      for (const key in P) P[key] += w * (c.R[key] || 0);
    }
    for (const key in P) { P[key] /= sw; RB[key][j] = P[key]; }
    let h = brief.relief.base + P.base + (fbm(nBase, x / 1300, z / 1300, { octaves: 5 }) - 0.5) * 2 * brief.relief.roll * P.roll;
    h += (ridged(nRidge, x / 620, z / 620, { octaves: 4 }) - 0.35) * 70 * P.ridge;
    // the world's own edge: hills on every edge that is not sea (rivers drain inward, the far view has a skyline)
    let e = Infinity;
    for (const ed of frameEdges) e = Math.min(e, edgeDist(x, z, ed));
    if (e < 420) h += 80 * smoothstep(420, 0, e) * (0.65 + 0.7 * fbm(nFrame, x / 260, z / 260, { octaves: 3 }));
    // mountain ranges: a ridged spine along each line, passes cut down where the brief asks
    for (const r of brief.ranges) {
      const d = polyDist(x + nWx(x / 320, z / 320) * 90, z + nWz(x / 320, z / 320) * 90, r.points);
      if (d >= r.width) continue;
      const core = 0.5 + 0.5 * Math.cos(Math.PI * d / r.width);
      let hr = r.height * Math.pow(core, 1 + r.sharpness) * (0.42 + 0.78 * ridged(nRange, x / 380, z / 380, { octaves: 5, sharpness: 2 }));
      for (const [px, pz, depth] of r.passes) {
        const s = r.width * 0.32, g = Math.exp(-((x - px) ** 2 + (z - pz) ** 2) / (2 * s * s));
        hr *= 1 - depth * g;
      }
      h += hr;
    }
    M.H[j] = h;
  }

  // ---------------------------------------------------------------- 2. a little weathering (cliffs slump, then rain cuts gullies)
  thermal(M, 4, 9.5);
  droplets(M, rngFor(seed, 'droplets'), Math.round(MN * 0.3));

  // ---------------------------------------------------------------- 3. lake basins the brief asks for, then the sea
  for (const l of brief.lakes) {
    // the lake fills to the lowest point of its shore, so the basin is dug below that (a lake on a slope still holds)
    let ring = Infinity;
    for (let a = 0; a < 64; a++) for (const rr of [1.15, 1.35]) ring = Math.min(ring, gridBilinear(M, l.at[0] + Math.cos(a / 64 * 6.2832) * l.radius * rr, l.at[1] + Math.sin(a / 64 * 6.2832) * l.radius * rr));
    l.estimate = ring - 0.8;
    const R = l.radius * 1.4;
    forBox(M, l.at[0], l.at[1], R, (j, x, z) => {
      const d = Math.hypot(x - l.at[0], z - l.at[1]) / l.radius + (fbm(nCoast, x / 120, z / 120, { octaves: 3 }) - 0.5) * 0.35;
      const w = 1 - smoothstep(0.8, 1.3, d);
      if (w <= 0) return;
      const bottom = l.estimate - 1 - l.depth * (1 - Math.min(1, d) ** 2);
      M.H[j] = lerp(M.H[j], Math.min(M.H[j], bottom), w);
    });
  }
  for (const ed of seaEdges) {
    const S = brief.sea;
    for (let j = 0; j < MN; j++) {
      const i = j % M.nx, k = (j - i) / M.nx, x = mx(i), z = mz(k);
      const e = edgeDist(x, z, ed) + (fbm(nCoast, x / 700, z / 700, { octaves: 4 }) - 0.5) * 2 * S.wobble;
      const t = 1 - smoothstep(S.from - S.shelf, S.from + S.shelf, e);
      if (t > 0) M.H[j] = lerp(M.H[j], -S.depth, t);
    }
  }

  // ---------------------------------------------------------------- 4. the pinned piece and its seam
  const keepM = new Uint8Array(MN);
  if (pin) {
    for (let j = 0; j < MN; j++) {
      const i = j % M.nx, k = (j - i) / M.nx, x = mx(i), z = mz(k);
      const d = pin.keepDist(x, z);
      if (d === 0) { keepM[j] = 1; M.H[j] = pin.heightAt(x, z); continue; }
      if (d < pin.seam) M.H[j] = lerp(pin.seamHeight(x, z), M.H[j], smoothstep(0, pin.seam, d));
    }
  }
  const blockedKeep = j => keepM[j] === 1;

  // ---------------------------------------------------------------- 5. the sea mask (below sea level and joined to a sea edge)
  const sea = new Uint8Array(MN);
  if (seaEdges.length) {
    const q = [];
    for (let j = 0; j < MN; j++) {
      const i = j % M.nx, k = (j - i) / M.nx;
      const onEdge = (seaEdges.includes('north') && k === 0) || (seaEdges.includes('south') && k === M.nz - 1) || (seaEdges.includes('west') && i === 0) || (seaEdges.includes('east') && i === M.nx - 1);
      if (onEdge && M.H[j] < 0) { sea[j] = 1; q.push(j); }
    }
    for (let p = 0; p < q.length; p++) {
      const j = q[p], i = j % M.nx, k = (j - i) / M.nx;
      for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ii = i + di, kk = k + dk;
        if (ii < 0 || kk < 0 || ii >= M.nx || kk >= M.nz) continue;
        const jj = kk * M.nx + ii;
        if (!sea[jj] && !keepM[jj] && M.H[jj] < 0) { sea[jj] = 1; q.push(jj); }
      }
    }
  }
  const cellOf = (x, z) => clamp(Math.round((z - M.minZ) / MACRO_CELL), 0, M.nz - 1) * M.nx + clamp(Math.round((x - M.minX) / MACRO_CELL), 0, M.nx - 1);
  const cellXZ = j => { const i = j % M.nx; return [mx(i), mz((j - i) / M.nx)]; };

  // ---------------------------------------------------------------- 6. the rivers the brief names, routed and cut so they fall
  const joinOf = (river, end) => pin?.joins.find(jn => jn.river === river && jn.end === end);
  const forced = [];
  const riverCells = new Uint8Array(MN);
  const lakeById = Object.fromEntries(brief.lakes.map(l => [l.id, l]));
  // the outer edge of a pinned join: one coarse cell outside the kept area, along the river's own direction
  const outsideJoin = jn => {
    const [x, z] = jn.at, back = 1;   // pin.js points dir out of the kept area for both ends
    for (let s = 0; s < 40; s += 2) { const px = x + jn.dir[0] * back * s, pz = z + jn.dir[1] * back * s; if (!pin.inKeep(px, pz)) return cellOf(px, pz); }
    return cellOf(x + jn.dir[0] * back * 16, z + jn.dir[1] * back * 16);
  };
  // order: rivers that start at a fixed level (a lake, a pinned river) after the ones that set those levels
  const order = [...brief.rivers].sort((a, b) => (typeof a.from === 'string' ? 1 : 0) - (typeof b.from === 'string' ? 1 : 0));
  for (const r of order) {
    let from, startLevel = null, endLevel = -Infinity, isTarget, endAt = null, startAt = null;
    if (Array.isArray(r.from)) from = cellOf(r.from[0], r.from[1]);
    else if (r.from.startsWith('pin:')) {
      const jn = joinOf(r.from.slice(4), 'out');
      if (!jn) throw new Error(`river ${r.id}: the pin has no "out" join for ${r.from.slice(4)}.`);
      from = outsideJoin(jn); startLevel = jn.surface - 0.05; startAt = jn.at;
      M.H[from] = Math.min(M.H[from], startLevel);
    } else if (r.from.startsWith('lake:')) {
      const l = lakeById[r.from.slice(5)];
      from = cellOf(l.at[0], l.at[1]); startLevel = l.estimate;
    }
    if (r.to === 'sea') isTarget = j => sea[j] === 1;
    else if (r.to.startsWith('lake:')) {
      const l = lakeById[r.to.slice(5)];
      isTarget = j => { const [x, z] = cellXZ(j); return Math.hypot(x - l.at[0], z - l.at[1]) < l.radius * 0.6; };
      endLevel = l.estimate;
    } else if (r.to.startsWith('pin:')) {
      const jn = joinOf(r.to.slice(4), 'in');
      if (!jn) throw new Error(`river ${r.id}: the pin has no "in" join for ${r.to.slice(4)}.`);
      const t = outsideJoin(jn);
      isTarget = j => j === t; endLevel = jn.surface + 0.05; endAt = jn.at;
    } else { const t = cellOf(r.to[0], r.to[1]); isTarget = j => j === t; }
    const fromLake = typeof r.from === 'string' && r.from.startsWith('lake:') ? lakeById[r.from.slice(5)] : null;
    const blocked = j => blockedKeep(j) || (sea[j] && r.to !== 'sea') || (fromLake ? false : false);
    const path = routeRiver(M, from, isTarget, { blocked, endLevel: Number.isFinite(endLevel) ? endLevel : 0 });
    if (!path) throw new Error(`river ${r.id}: no way found from its source to ${r.to}.`);
    // a river out of a lake starts at the lake's edge (the cells inside the basin are the lake itself)
    let p0 = 0;
    if (fromLake) while (p0 < path.length - 2 && Math.hypot(...cellXZ(path[p0]).map((v, q) => v - fromLake.at[q])) < fromLake.radius * 0.95) p0++;
    const run = path.slice(p0);
    const bed = carveRiverPath(M, run, { startLevel, endLevel, valley: 70 + r.width * 4, blocked: blockedKeep });
    for (const j of run) riverCells[j] = 1;
    forced.push({ def: r, cells: run, bed, startAt, endAt });
  }

  // ---------------------------------------------------------------- 7. drainage: fill pits, find lakes, gather rain into streams
  const outlets = [];
  for (let j = 0; j < MN; j++) {
    if (sea[j]) { outlets.push([j, M.H[j]]); continue; }
    const i = j % M.nx, k = (j - i) / M.nx;
    if (!keepM[j] && (i === 0 || k === 0 || i === M.nx - 1 || k === M.nz - 1)) outlets.push([j, M.H[j]]);
  }
  for (const f of forced) if (f.endAt) outlets.push([f.cells[f.cells.length - 1], f.bed[f.bed.length - 1]]);
  const F = priorityFlood(M, outlets, blockedKeep);
  const wantedCells = brief.lakes.map(l => { const out = []; forBox(M, l.at[0], l.at[1], l.radius * 0.5, j => out.push(j)); return out; });
  const lakesFound = findLakes(M, F, { wanted: wantedCells, blocked: j => blockedKeep(j) || sea[j] === 1, maxLakes: 4, minCells: 120 });
  const lakeM = new Int16Array(MN).fill(-1);
  const natural = ['the Little Mere', 'Hollow Pool', 'Crane Pool', 'the Black Pond', 'Long Pool', 'the Cold Pond', 'Otter Pool', 'Lily Pond'];
  const lakes = lakesFound.map((l, n) => {
    const want = l.wantedIndex >= 0 ? brief.lakes[l.wantedIndex] : null;
    let sx = 0, sz = 0;
    for (const j of l.cells) { lakeM[j] = n; const [x, z] = cellXZ(j); sx += x; sz += z; }
    return { id: want?.id || `pool_${n + 1}`, name: want?.name || natural[n % natural.length], level: l.level, area: Math.round(l.area), at: [Math.round(sx / l.cells.length), Math.round(sz / l.cells.length)], cells: l.cells, wanted: !!want };
  });
  const rainAt = j => (keepM[j] ? 0 : 1);
  const acc = accumulate(M, F, rainAt);
  const threshold = brief.streams.catchment * 1e6 / (MACRO_CELL * MACRO_CELL);
  const stop = j => sea[j] === 1 || lakeM[j] >= 0 || riverCells[j] === 1;
  const TS = traceStreams(M, F, acc, { threshold, stop, maxStreams: brief.streams.max, minCells: Math.round(brief.streams.minLength / (MACRO_CELL * 1.2)), blocked: blockedKeep });
  const streams = TS.streams;
  for (const s of streams) for (const j of s.cells) riverCells[j] = 1;

  // ---------------------------------------------------------------- 8. river lines (control points like map.json rivers)
  const rivers = [];
  const toPoints = (cells, tol) => evenPoints(simplify(cells.map(cellXZ), tol).map(([x, z]) => [Math.round(x * 10) / 10, Math.round(z * 10) / 10]), 18, 4);
  for (const f of forced) {
    const pts = toPoints(f.cells, 5);
    if (f.startAt) pts.unshift([Math.round(f.startAt[0] * 100) / 100, Math.round(f.startAt[1] * 100) / 100]);
    if (f.endAt) pts.push([Math.round(f.endAt[0] * 100) / 100, Math.round(f.endAt[1] * 100) / 100]);
    pts.splice(0, pts.length, ...evenPoints(pts, 18, 4));
    const r = f.def;
    rivers.push({ id: r.id, name: r.name, kind: 'river', width: r.width, depth: r.depth, drop: 1.2, points: pts, from: r.from, to: r.to, startLevel: f.startAt ? joinOf(r.from.slice(4), 'out').surface : (typeof r.from === 'string' && r.from.startsWith('lake:') ? 'lake:' + r.from.slice(5) : null), endLevel: f.endAt ? joinOf(r.to.slice(4), 'in').surface : null, joins: f.startAt ? { pin: r.from.slice(4), end: 'out' } : f.endAt ? { pin: r.to.slice(4), end: 'in' } : null });
  }
  const [w0, w1] = brief.streams.width;
  const flowMax = Math.max(1, ...streams.map(s => s.flow));
  streams.forEach((s, n) => {
    const t = Math.log(s.flow / threshold + 1) / Math.log(flowMax / threshold + 1);
    const width = Math.round((w0 + (w1 - w0) * t) * 2) / 2;
    rivers.push({ id: `stream_${n + 1}`, name: null, kind: 'stream', width, depth: Math.round((0.42 + width * 0.04) * 100) / 100,   // (a stream up to 6 m wide can be waded)
       drop: 0.9, points: toPoints(s.cells, 5), mouth: s.mouth, flow: Math.round(s.flow) });
  });

  // ---------------------------------------------------------------- 9. the 2 m ground: smooth upsample + fine detail; the pin, value for value
  const riverDistM = distanceFrom(M, Array.from({ length: MN }, (_, j) => j).filter(j => riverCells[j] || lakeM[j] >= 0), 120);
  const N = nx * nz;
  const H = new Float32Array(N), Wt = new Float32Array(N).fill(NaN), WK = new Uint8Array(N);
  const keep2 = new Uint8Array(N);
  const pg = pin?.T.grid, pmb = pin?.map.bounds;
  const pinIndex = pin ? (x, z) => Math.round((z - pin.at[1] - pmb.minZ) / cell) * pg.nx + Math.round((x - pin.at[0] - pmb.minX) / cell) : null;
  for (let k = 0; k < nz; k++) {
    const z = Bd.minZ + k * cell;
    for (let i = 0; i < nx; i++) {
      const x = Bd.minX + i * cell, j = k * nx + i;
      if (pin) {
        const d = pin.keepDist(x, z);
        if (d === 0) {
          const pj = pinIndex(x, z);
          keep2[j] = 1; H[j] = pg.heights[pj];
          const w = pg.water[pj];
          if (!Number.isNaN(w)) { Wt[j] = w; WK[j] = pin.kindOf(w); }
          continue;
        }
      }
      let h = gridCubic(M, x, z);
      const rd = gridBilinear({ ...M, data: riverDistM }, x, z);
      const damp = Number.isFinite(rd) ? smoothstep(8, 90, rd) : 1;
      const amp = brief.relief.detail * gridBilinear(M, x, z, RB.detail) * (0.35 + 0.65 * damp);
      h += (fbm(nDet, x / 52, z / 52, { octaves: 3 }) - 0.5) * 2 * amp * 1.6;
      const rg = gridBilinear(M, x, z, RB.ridge);
      if (rg > 0.05) h += (ridged(nDet2, x / 170, z / 170, { octaves: 2 }) - 0.45) * amp * 5 * rg * damp;
      const tr = gridBilinear(M, x, z, RB.terrace);
      if (tr > 0.5 && h > 2) { const s = h / tr, f = s - Math.floor(s); h += (Math.floor(s) + smoothstep(0.55, 0.95, f) - s) * tr * 0.7 * damp; }
      if (pin) {
        const d = pin.keepDist(x, z);
        if (d < pin.seam) {
          const cx = clamp(x, pin.keep.minX, pin.keep.maxX), cz = clamp(z, pin.keep.minZ, pin.keep.maxZ);
          const pj = pinIndex(cx, cz);
          const t = smoothstep(0, pin.seam, d);
          // right at the edge the kept heights themselves (no step), softening into the averaged edge further out
          const anchor = lerp(pg.heights[pj], pin.seamHeight(x, z), smoothstep(0, 24, d));
          h = lerp(anchor, h, t);
          // the pin's marsh may lap over its edge: let it go on while the blended ground is under it
          const pw = pg.water[pj];
          if (!Number.isNaN(pw) && pin.kindOf(pw) === WATER.marsh && t < 0.7 && h < pw) { Wt[j] = pw; WK[j] = WATER.marsh; }
        }
      }
      H[j] = h;
    }
  }
  const W = {
    brief, seed, bounds, cell, nx, nz, N, H, water: Wt, wkind: WK, keep: keep2, pin,
    macro: { ...M, sea, keep: keepM, lake: lakeM, river: riverCells, riverDist: riverDistM, relief: RB, filled: F.filled, acc },
    lakes, rivers, seaLevel: 0,
    grid: { minX: Bd.minX, minZ: Bd.minZ, cell, nx, nz },
  };

  // ---------------------------------------------------------------- 10. hand ground strokes (the editor's layer) on the raw ground,
  // then the river channels (terrain.js step 4, outside the pin)
  if (edits) W.editLeft = applyGround(W, edits);
  carveRivers(W);
  // ---------------------------------------------------------------- 11. lakes and the sea at 2 m
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
    const j = k * nx + i;
    if (keep2[j]) continue;
    const x = Bd.minX + i * cell, z = Bd.minZ + k * cell;
    const mi = clamp(Math.round((x - M.minX) / MACRO_CELL), 0, M.nx - 1), mk = clamp(Math.round((z - M.minZ) / MACRO_CELL), 0, M.nz - 1);
    let lk = -1, sa = 0;
    for (let dk = -1; dk <= 1; dk++) for (let di = -1; di <= 1; di++) {
      const ii = mi + di, kk = mk + dk;
      if (ii < 0 || kk < 0 || ii >= M.nx || kk >= M.nz) continue;
      const jm = kk * M.nx + ii;
      if (lakeM[jm] >= 0) lk = lakeM[jm];
      if (sea[jm]) sa = 1;
    }
    if (lk >= 0 && H[j] < lakes[lk].level) { if (!(Wt[j] >= lakes[lk].level)) { Wt[j] = lakes[lk].level; WK[j] = WATER.lake; } }
    else if (sa && H[j] < 0) { Wt[j] = 0; WK[j] = WATER.sea; }
  }
  return W;
}

/** Cut every generated river into the 2 m ground: a surface that never rises, the channel and banks of terrain.js. */
export function carveRivers(W) {
  const { H, water: Wt, wkind: WK, keep, nx, nz, cell, N } = W;
  const g = { minX: W.bounds.minX, minZ: W.bounds.minZ, cell, nx, nz, data: H };
  const best = new Float32Array(N).fill(Infinity), surf = new Float32Array(N), ri = new Int16Array(N).fill(-1);
  const touched = [];
  const lakeLevel = id => W.lakes.find(l => l.id === id)?.level;
  // big rivers first, so a stream that meets one knows its surface there
  const order = W.rivers.map((r, n) => n).sort((a, b) => (W.rivers[a].kind === 'river' ? 0 : 1) - (W.rivers[b].kind === 'river' ? 0 : 1));
  for (const n of order) {
    const r = W.rivers[n];
    const pts = smoothLine(r.points, 2);
    let start = typeof r.startLevel === 'number' ? r.startLevel : typeof r.startLevel === 'string' ? lakeLevel(r.startLevel.slice(5)) : null;
    let end = typeof r.endLevel === 'number' ? r.endLevel : null;
    if (typeof r.to === 'string' && r.to.startsWith('lake:')) end = lakeLevel(r.to.slice(5)) ?? end;
    if (r.to === 'sea') end = W.seaLevel;
    if (r.kind === 'stream') {
      // a stream ends in a river (its surface there), a lake (its level) or the sea
      const last = pts[pts.length - 1];
      const host = nearestRiverSurface(W, last.x, last.z, n);
      if (host != null) end = host;
      else { const w = Wt[nearestIdx(W, last.x, last.z)]; if (!Number.isNaN(w)) end = w; }
    }
    let prev = start != null ? start : gridSample(g, pts[0].x, pts[0].z) - r.drop;
    // a river running OUT of the pinned piece starts at the pinned river's surface; the seam ground just outside is
    // the pinned channel already cut, so it must not pull the surface down there (that left a step at the edge).
    // (A river running IN simply falls to the pinned surface, which `end` holds it above.)
    const nearJoin = (p) => r.joins?.end === 'out' && W.pin && W.pin.keepDist(p.x, p.z) < W.pin.seam * 0.5;
    for (const p of pts) {
      if (!nearJoin(p)) prev = Math.min(prev, gridSample(g, p.x, p.z) - r.drop);
      p.y = end != null ? Math.max(prev, end) : prev;
    }
    for (let q = 1; q < pts.length; q++) if (pts[q].y > pts[q - 1].y) pts[q].y = pts[q - 1].y;
    r.pts = pts.map(p => ({ x: Math.round(p.x * 100) / 100, z: Math.round(p.z * 100) / 100, s: Math.round(p.s * 100) / 100, y: Math.round(p.y * 100) / 100 }));
    const reach = r.width / 2 + 30;
    const R = Math.ceil(reach / cell);
    for (const p of r.pts) {
      const i0 = Math.round((p.x - g.minX) / cell), k0 = Math.round((p.z - g.minZ) / cell);
      for (let dk = -R; dk <= R; dk++) for (let di = -R; di <= R; di++) {
        const i = i0 + di, k = k0 + dk;
        if (i < 0 || k < 0 || i >= nx || k >= nz) continue;
        const j = k * nx + i;
        if (keep[j]) continue;
        const d = Math.hypot(g.minX + i * cell - p.x, g.minZ + k * cell - p.z);
        if (d > reach) continue;
        if (best[j] === Infinity) touched.push(j);
        if (d < best[j]) { best[j] = d; surf[j] = p.y; ri[j] = n; }
      }
    }
  }
  for (const j of touched) {
    const r = W.rivers[ri[j]], half = r.width / 2, d = best[j], s = surf[j];
    const target = d < half ? s - 0.3 - (r.depth - 0.3) * (1 - (d / half) ** 2) : s + 0.25 + (d - half) * 0.45;
    if (target < H[j]) H[j] = target;
    // where the land under a river is lower than its bed (it crosses a hollow to reach a lake or a bigger river), the
    // bed and banks are built up to hold it (a levee), so the water never floats over the ground beside it
    else if (d < half + 3 && H[j] < target - 0.01) H[j] = target;
    if (d < half + 1.5) { Wt[j] = Number.isNaN(Wt[j]) ? s : Math.max(Wt[j], s); WK[j] = WK[j] || WATER.river; }
  }
}
function nearestIdx(W, x, z) {
  const i = clamp(Math.round((x - W.bounds.minX) / W.cell), 0, W.nx - 1), k = clamp(Math.round((z - W.bounds.minZ) / W.cell), 0, W.nz - 1);
  return k * W.nx + i;
}
function nearestRiverSurface(W, x, z, self) {
  let best = null, bd = 25;
  W.rivers.forEach((r, n) => {
    if (n === self || !r.pts) return;
    for (const p of r.pts) { const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = p.y; } }
  });
  return best;
}

function forBox(M, x, z, r, fn) {
  const i0 = Math.max(0, Math.floor((x - r - M.minX) / M.cell)), i1 = Math.min(M.nx - 1, Math.ceil((x + r - M.minX) / M.cell));
  const k0 = Math.max(0, Math.floor((z - r - M.minZ) / M.cell)), k1 = Math.min(M.nz - 1, Math.ceil((z + r - M.minZ) / M.cell));
  for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) fn(k * M.nx + i, M.minX + i * M.cell, M.minZ + k * M.cell);
}

/** Slopes steeper than `talus` metres per cell slide down a little each pass. */
function thermal(M, passes, talus) {
  const { nx, nz, H } = M;
  for (let p = 0; p < passes; p++) for (let k = 1; k < nz - 1; k++) for (let i = 1; i < nx - 1; i++) {
    const j = k * nx + i;
    let lo = j, drop = 0;
    for (const jj of [j + 1, j - 1, j + nx, j - nx]) { const d = H[j] - H[jj]; if (d > drop) { drop = d; lo = jj; } }
    if (drop > talus) { const m = (drop - talus) * 0.25; H[j] -= m; H[lo] += m; }
  }
}
/** A light rain of droplets that pick up ground going downhill and drop it where they slow — branching gullies. */
function droplets(M, rng, count) {
  const { nx, nz, H, cell } = M;
  for (let d = 0; d < count; d++) {
    let x = 1 + rng() * (nx - 3), z = 1 + rng() * (nz - 3), dx = 0, dz = 0, speed = 1, water = 1, sed = 0;
    for (let life = 0; life < 40; life++) {
      const i = Math.floor(x), k = Math.floor(z), u = x - i, v = z - k, j = k * nx + i;
      const h00 = H[j], h10 = H[j + 1], h01 = H[j + nx], h11 = H[j + nx + 1];
      const gx = (h10 - h00) * (1 - v) + (h11 - h01) * v, gz = (h01 - h00) * (1 - u) + (h11 - h10) * u;
      dx = dx * 0.3 - gx * 0.7; dz = dz * 0.3 - gz * 0.7;
      const L = Math.hypot(dx, dz); if (L < 1e-6) break;
      dx /= L; dz /= L;
      const nxp = x + dx, nzp = z + dz;
      if (nxp < 1 || nzp < 1 || nxp >= nx - 2 || nzp >= nz - 2) break;
      const hOld = h00 * (1 - u) * (1 - v) + h10 * u * (1 - v) + h01 * (1 - u) * v + h11 * u * v;
      const i2 = Math.floor(nxp), k2 = Math.floor(nzp), u2 = nxp - i2, v2 = nzp - k2, j2 = k2 * nx + i2;
      const hNew = H[j2] * (1 - u2) * (1 - v2) + H[j2 + 1] * u2 * (1 - v2) + H[j2 + nx] * (1 - u2) * v2 + H[j2 + nx + 1] * u2 * v2;
      const dh = hNew - hOld;
      const cap = Math.max(-dh, 0.01) * speed * water * 0.6;
      if (sed > cap || dh > 0) {
        const put = dh > 0 ? Math.min(dh, sed) : (sed - cap) * 0.3;
        sed -= put; H[j] += put * (1 - u) * (1 - v); H[j + 1] += put * u * (1 - v); H[j + nx] += put * (1 - u) * v; H[j + nx + 1] += put * u * v;
      } else {
        const take = Math.min((cap - sed) * 0.3, -dh);
        sed += take; H[j] -= take * (1 - u) * (1 - v); H[j + 1] -= take * u * (1 - v); H[j + nx] -= take * (1 - u) * v; H[j + nx + 1] -= take * u * v;
      }
      speed = Math.sqrt(Math.max(0.01, speed * speed - dh * 0.5 / cell * 8));
      water *= 0.97; x = nxp; z = nzp;
    }
  }
}
