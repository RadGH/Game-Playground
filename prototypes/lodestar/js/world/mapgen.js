// Map generator for the home archetype (PLAN M1). PURE: same seed → same map.
//
// Order: river (one long chain W→E or N→S, deep channel with shallow edges, 2–4 fords) and lakes on
// it (plus maybe one more) → distance to water → the HQ spot (open land, away from water) → a lava
// field ringed in basalt (obsidian where it meets water) far from the HQ → 1–2 plateaus whose rims
// are CLIFF POLYLINES with 1–2 gaps → ground cover from two noise fields (grass, dry grass, forest
// with clearings, shrubs at its edge, soil patches, beaches) → rock outcrops holding ore (copper,
// iron, coal, building stone, silica sand, mana crystal), four of them guaranteed near the HQ →
// cliffs rasterised through vectors.js → a walking flood from the HQ, and any land it did not reach
// gets a ford cut to it through the water. Returns metadata the tests and the renderer use.

import { createRng } from '../sim/rng.js';
import { fbm, valueNoise } from './noise.js';
import { cell, EDGE } from './grid.js';
import { floodMask } from './edges.js';

const LAND = 0, SHALLOW = 1, DEEP = 2;
// Math.hypot is not required to round the same way in every engine; sqrt is.
const hyp = (a, b) => Math.sqrt(a * a + b * b);

/** Catmull-Rom through control points, sampled about once per cell. */
function spline(ctrl) {
  const out = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
    const len = hyp(p2[0] - p1[0], p2[1] - p1[1]);
    const n = Math.max(2, Math.ceil(len));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(ctrl[ctrl.length - 1]);
  return out;
}

/** Two-pass chamfer distance (in cells, 3-4 metric / 3) to any cell where src is nonzero. */
function distanceTo(src, W, H) {
  const BIG = 60000;
  const d = new Uint16Array(W * H);
  for (let i = 0; i < W * H; i++) d[i] = src[i] ? 0 : BIG;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    let v = d[i];
    if (x > 0 && d[i - 1] + 3 < v) v = d[i - 1] + 3;
    if (y > 0) {
      if (d[i - W] + 3 < v) v = d[i - W] + 3;
      if (x > 0 && d[i - W - 1] + 4 < v) v = d[i - W - 1] + 4;
      if (x < W - 1 && d[i - W + 1] + 4 < v) v = d[i - W + 1] + 4;
    }
    d[i] = v;
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
    const i = y * W + x;
    let v = d[i];
    if (x < W - 1 && d[i + 1] + 3 < v) v = d[i + 1] + 3;
    if (y < H - 1) {
      if (d[i + W] + 3 < v) v = d[i + W] + 3;
      if (x < W - 1 && d[i + W + 1] + 4 < v) v = d[i + W + 1] + 4;
      if (x > 0 && d[i + W - 1] + 4 < v) v = d[i + W - 1] + 4;
    }
    d[i] = v;
  }
  for (let i = 0; i < W * H; i++) d[i] = Math.min(65535, Math.round(d[i] / 3));
  return d;
}

function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Generate the home world into grid g.
 * @returns meta { hq:{x,y}, river:{pts}, fords:[{x,y,nx,ny,half}], lakes, lava, plateaus, cliffs, outcrops, carved }
 */
export function generateHome(g, M, vectors, data, seed) {
  const P = data.home;
  const W = g.W, H = g.H;
  const rng = createRng(seed).split('mapgen');
  const area = (W * H) / (1536 * 1536);
  const scaleCount = (n) => Math.max(1, Math.round(n * area));
  const water = new Uint8Array(W * H);
  const id = M.id;
  const meta = { seed, size: [W, H], fords: [], lakes: [], lava: [], plateaus: [], cliffs: [], outcrops: [], carved: 0 };

  // ---- river
  const R = P.river;
  const vertical = rng.chance(0.5);
  const L = vertical ? H : W, C = vertical ? W : H;
  const ctrl = [];
  let c0 = C * (0.3 + rng.float() * 0.4);
  for (let s = -40; ; s += R.step) {
    const last = s >= L + 40;
    ctrl.push([last ? L + 40 : s, c0]);
    if (last) break;
    c0 += (rng.float() - 0.5) * 2 * R.wiggle * R.step;
    c0 = Math.max(C * 0.18, Math.min(C * 0.82, c0));
  }
  let pts = spline(ctrl);
  // meanders: a slow and a quick sideways wobble on top of the control curve
  const mSaltR = rng.int(1e6);
  pts = pts.map(([a, b], i) => [a, b + (fbm(i / 260, 0.5, mSaltR, 3) - 0.5) * 2 * R.meander + (valueNoise(i / 55, 3.5, mSaltR + 5) - 0.5) * R.meander * 0.45]);
  if (vertical) pts = pts.map(([a, b]) => [b, a]);
  meta.river = { pts: pts.filter((_, i) => i % 8 === 0).map(([x, y]) => [Math.round(x), Math.round(y)]), vertical };
  const nP = pts.length;
  const deepHalf = new Float32Array(nP), shallowHalf = new Float32Array(nP);
  const dSalt = rng.int(1e6);
  for (let i = 0; i < nP; i++) {
    const v = valueNoise(i / 140, 0, dSalt);
    deepHalf[i] = R.deep[0] + (R.deep[1] - R.deep[0]) * v;
    shallowHalf[i] = deepHalf[i] + R.shallowExtra[0] + (R.shallowExtra[1] - R.shallowExtra[0]) * valueNoise(i / 90, 7, dSalt);
  }
  // lakes on the river (indices along the river, kept away from the ends)
  const lakeIdx = [];
  const nLakes = rng.range(P.lakes.onRiver[0], P.lakes.onRiver[1]);
  for (let k = 0; k < nLakes; k++) lakeIdx.push(Math.floor(nP * (0.2 + 0.6 * ((k + 0.5) / nLakes) + (rng.float() - 0.5) * 0.12)));
  const lakeR = lakeIdx.map(() => rng.range(P.lakes.r[0], P.lakes.r[1]) * Math.sqrt(area > 0.5 ? 1 : 0.8));
  // fords: spaced along the river, outside lakes, not at the map ends
  const nFords = rng.range(R.fords[0], R.fords[1]);
  const fordIdx = [];
  for (let tries = 0; fordIdx.length < nFords && tries < 400; tries++) {
    const i = Math.floor(nP * (0.08 + rng.float() * 0.84));
    const [fx, fy] = pts[i];
    if (fx < 20 || fy < 20 || fx > W - 20 || fy > H - 20) continue;
    if (fordIdx.some((j) => Math.abs(j - i) < R.fordSpacing)) continue;
    if (lakeIdx.some((j, k) => Math.abs(j - i) < lakeR[k] + 40)) continue;
    fordIdx.push(i);
  }
  fordIdx.sort((a, b) => a - b);
  const fordWin = Math.ceil(R.deep[1] + R.fordLen / 2);
  const inFord = new Uint8Array(nP);
  for (const f of fordIdx) for (let i = Math.max(0, f - fordWin); i <= Math.min(nP - 1, f + fordWin); i++) inFord[i] = 1;
  const stampDisc = (cx, cy, r, v) => {
    const R0 = Math.ceil(r);
    for (let dy = -R0; dy <= R0; dy++) for (let dx = -R0; dx <= R0; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      const x = Math.floor(cx) + dx, y = Math.floor(cy) + dy;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const k = y * W + x;
      if (water[k] < v) water[k] = v;
    }
  };
  for (let i = 0; i < nP; i++) {
    const [x, y] = pts[i];
    stampDisc(x, y, shallowHalf[i], SHALLOW);
  }
  for (let i = 0; i < nP; i++) {
    if (inFord[i]) continue;
    const [x, y] = pts[i];
    stampDisc(x, y, deepHalf[i], DEEP);
  }
  for (const f of fordIdx) {
    const a = pts[Math.max(0, f - 2)], b = pts[Math.min(nP - 1, f + 2)];
    const tx = b[0] - a[0], ty = b[1] - a[1], tl = hyp(tx, ty) || 1;
    meta.fords.push({ x: Math.round(pts[f][0]), y: Math.round(pts[f][1]), nx: -ty / tl, ny: tx / tl, half: Math.ceil(shallowHalf[f]) + 3 });
  }
  // lakes
  const lakeBlob = (cx, cy, r, salt) => {
    const R0 = Math.ceil(r * 1.3);
    for (let dy = -R0; dy <= R0; dy++) for (let dx = -R0; dx <= R0; dx++) {
      const x = Math.floor(cx) + dx, y = Math.floor(cy) + dy;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const f = 0.5 + 0.95 * fbm(x / 55, y / 55, salt, 4);
      const d = Math.sqrt(dx * dx + dy * dy) / f;
      const k = y * W + x;
      if (d < r - P.lakes.shallowBand) water[k] = DEEP;
      else if (d < r && water[k] < SHALLOW) water[k] = SHALLOW;
    }
  };
  lakeIdx.forEach((i, k) => {
    const [x, y] = pts[Math.max(0, Math.min(nP - 1, i))];
    lakeBlob(x, y, lakeR[k], rng.int(1e6));
    meta.lakes.push({ x: Math.round(x), y: Math.round(y), r: lakeR[k], onRiver: true });
  });

  // ---- distance to water, HQ
  let dWater = distanceTo(water, W, H);
  let hq = null;
  for (let t = 0; t < 600 && !hq; t++) {
    const x = Math.floor(W * (0.25 + rng.float() * 0.5)), y = Math.floor(H * (0.25 + rng.float() * 0.5));
    const dw = dWater[y * W + x];
    if (dw >= P.hq.waterDist + (t < 300 ? 0 : -20) && dw < P.hq.waterDist + 160) hq = { x, y };
  }
  if (!hq) hq = { x: W >> 1, y: H >> 1 };
  meta.hq = hq;
  const hqD = (x, y) => hyp(x - hq.x, y - hq.y);

  // extra lake (not on the river), away from the HQ
  const nExtra = rng.range(P.lakes.extra[0], P.lakes.extra[1]);
  for (let k = 0; k < nExtra; k++) {
    for (let t = 0; t < 100; t++) {
      const r = rng.range(P.lakes.r[0], P.lakes.r[1]) * 0.7;
      const x = r + 20 + rng.float() * (W - 2 * r - 40), y = r + 20 + rng.float() * (H - 2 * r - 40);
      if (hqD(x, y) < r + 140 || dWater[Math.floor(y) * W + Math.floor(x)] < r + 40) continue;
      lakeBlob(x, y, r, rng.int(1e6));
      meta.lakes.push({ x: Math.round(x), y: Math.round(y), r, onRiver: false });
      break;
    }
  }
  if (nExtra) dWater = distanceTo(water, W, H);

  // ---- material map (row-major), starting as grass on land and water classes
  const mats = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) mats[i] = water[i] === DEEP ? id.deep : water[i] === SHALLOW ? id.shallow : id.grass;

  // ---- lava field
  const lavaMask = new Uint8Array(W * H);
  const lavaN = P.lava.count;
  for (let k = 0; k < lavaN; k++) {
    for (let t = 0; t < 300; t++) {
      const r = rng.range(P.lava.r[0], P.lava.r[1]) * (area < 0.6 ? 0.8 : 1);
      const x = r + 30 + rng.float() * (W - 2 * r - 60), y = r + 30 + rng.float() * (H - 2 * r - 60);
      if (hqD(x, y) < P.lava.minHqDist * Math.sqrt(area) + r) continue;
      if (dWater[Math.floor(y) * W + Math.floor(x)] < r + P.lava.waterGap) continue;
      const salt = rng.int(1e6);
      const R0 = Math.ceil(r * 1.4 + P.lava.basalt + 4);
      for (let dy = -R0; dy <= R0; dy++) for (let dx = -R0; dx <= R0; dx++) {
        const xx = Math.floor(x) + dx, yy = Math.floor(y) + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const kk = yy * W + xx;
        if (water[kk]) continue;
        const f = 0.65 + 0.7 * fbm(xx / 38, yy / 38, salt, 4);
        const d = Math.sqrt(dx * dx + dy * dy) / f;
        if (d < r) { mats[kk] = id.lava; lavaMask[kk] = 1; }
        else if (d < r + P.lava.basalt * (0.6 + 0.8 * valueNoise(xx / 9, yy / 9, salt + 3))) mats[kk] = id.basalt;
      }
      meta.lava.push({ x: Math.round(x), y: Math.round(y), r });
      break;
    }
  }
  // lava touching water: obsidian shore
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const k = y * W + x;
    if (mats[k] !== id.lava) continue;
    if (water[k - 1] || water[k + 1] || water[k - W] || water[k + W]) mats[k] = id.obsidian;
  }

  // ---- plateaus with cliff rims
  const plateauMask = new Uint8Array(W * H);
  const cliffLines = [];
  const nPlat = rng.range(P.plateaus.count[0], P.plateaus.count[1]);
  for (let k = 0; k < nPlat; k++) {
    for (let t = 0; t < 300; t++) {
      const r = rng.range(P.plateaus.r[0], P.plateaus.r[1]) * (area < 0.6 ? 0.8 : 1);
      const x = r + 40 + rng.float() * (W - 2 * r - 80), y = r + 40 + rng.float() * (H - 2 * r - 80);
      if (hqD(x, y) < P.plateaus.minHqDist + r * 1.3) continue;
      if (meta.plateaus.some((p) => hyp(p.x - x, p.y - y) < p.r + r + 60)) continue;
      const salt = rng.int(1e6);
      const N = 72;
      const poly = [];
      let ok = true;
      for (let a = 0; a < N; a++) {
        const u = rot[Math.floor((a * rot.length) / N)];
        const ux = u[0], uy = u[1];
        const f = 0.72 + 0.56 * fbm(a / 9, k * 3.1, salt, 3);
        const px = x + ux * r * f, py = y + uy * r * f;
        const pi = Math.floor(py) * W + Math.floor(px);
        if (px < 8 || py < 8 || px > W - 8 || py > H - 8 || dWater[pi] < P.plateaus.waterGap || lavaMask[pi] || mats[pi] === id.basalt) { ok = false; break; }
        poly.push([px, py]);
      }
      if (!ok) continue;
      // gaps: drop runs of points, splitting the rim into open polylines
      const gaps = rng.range(P.plateaus.gaps[0], P.plateaus.gaps[1]);
      const drop = new Uint8Array(N);
      const seg = (2 * Math.PI * r) / N;
      const g0 = rng.int(N);
      for (let gi = 0; gi < gaps; gi++) {
        const start = (g0 + Math.floor((gi * N) / gaps) + rng.int(Math.max(1, Math.floor(N / (gaps * 3))))) % N;
        const len = Math.max(2, Math.ceil(rng.range(P.plateaus.gapLen[0], P.plateaus.gapLen[1]) / seg) + 1);
        for (let j = 0; j < len; j++) drop[(start + j) % N] = 1;
      }
      // walk from a dropped point so each kept run is contiguous
      let s0 = drop.indexOf(1);
      let run = [];
      for (let j = 1; j <= N; j++) {
        const a = (s0 + j) % N;
        if (drop[a]) { if (run.length >= 2) cliffLines.push(run); run = []; }
        else run.push(poly[a]);
      }
      if (run.length >= 2) cliffLines.push(run);
      // interior mask
      let minX = W, minY = H, maxX = 0, maxY = 0;
      for (const [px, py] of poly) { minX = Math.min(minX, px); minY = Math.min(minY, py); maxX = Math.max(maxX, px); maxY = Math.max(maxY, py); }
      for (let yy = Math.floor(minY); yy <= Math.ceil(maxY); yy++) for (let xx = Math.floor(minX); xx <= Math.ceil(maxX); xx++) {
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        if (pointInPoly(xx + 0.5, yy + 0.5, poly)) plateauMask[yy * W + xx] = 1;
      }
      meta.plateaus.push({ x: Math.round(x), y: Math.round(y), r, gaps });
      break;
    }
  }

  // ---- ground cover
  const B = P.biome;
  const mSalt = rng.int(1e6), dSalt2 = rng.int(1e6), tSalt = rng.int(1e6);
  // the moisture field is broad (hundreds of cells), so work it out every 4 cells and blend
  const GW = (W >> 2) + 2, GH = (H >> 2) + 2;
  const mGrid = new Float32Array(GW * GH);
  for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) mGrid[gy * GW + gx] = fbm((gx * 4) / B.scale, (gy * 4) / B.scale, mSalt, 5);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = y * W + x;
    if (mats[k] !== id.grass) continue;
    const gx = x >> 2, gy = y >> 2, fx = (x & 3) / 4, fy = (y & 3) / 4;
    const a = mGrid[gy * GW + gx], b = mGrid[gy * GW + gx + 1], c2 = mGrid[(gy + 1) * GW + gx], d2 = mGrid[(gy + 1) * GW + gx + 1];
    let m = (a + (b - a) * fx) + ((c2 + (d2 - c2) * fx) - (a + (b - a) * fx)) * fy;
    const det = fbm(x / 26, y / 26, dSalt2, 3);
    const plat = plateauMask[k];
    if (plat) m -= 0.12;
    const dw = dWater[k];
    if (dw <= B.beach + det * 5 && m < B.forest + 0.08) { mats[k] = id.sand; continue; }
    if (dw < 26) m += (26 - dw) * 0.004; // a little greener along water
    if (m > B.forest) {
      const tv = fbm(x / 7, y / 7, tSalt, 2);
      if (tv > B.clearing + (m - B.forest) * -0.6) mats[k] = id.tree;
      else if (tv > B.clearing - 0.08) mats[k] = id.shrub;
    } else if (m > B.forest - 0.035) {
      if (valueNoise(x / 3, y / 3, tSalt + 9) > 0.62) mats[k] = id.shrub;
    } else if (m < B.dry + (valueNoise(x / 2.5, y / 2.5, tSalt + 21) - 0.5) * 0.05) {
      mats[k] = id.dry_grass;
      if (det < B.soilPatch + 0.05) mats[k] = id.soil;
    } else if (det < B.soilPatch) {
      mats[k] = id.soil;
    }
    if (plat && det > 0.68 && mats[k] !== id.tree) mats[k] = id.gravel;
  }

  // ---- outcrops
  const oreMat = { copper: id.ore_copper, iron: id.ore_iron, coal: id.ore_coal, stone: id.ore_stone, silica: id.ore_sand, crystal: id.crystal };
  const amts = new Uint8Array(W * H);
  const placeOutcrop = (res, x, y, r) => {
    const salt = rng.int(1e6);
    const om = oreMat[res];
    const R0 = Math.ceil(r * 1.5);
    let cells = 0;
    for (let dy = -R0; dy <= R0; dy++) for (let dx = -R0; dx <= R0; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const kk = yy * W + xx;
      if (water[kk] || lavaMask[kk] || mats[kk] === id.basalt) continue;
      const f = 0.65 + 0.7 * fbm(xx / 6, yy / 6, salt, 2);
      const d = Math.sqrt(dx * dx + dy * dy) / f;
      if (d >= r) continue;
      if (res === 'crystal') {
        // crystal grows as spikes on a bed of rock
        mats[kk] = valueNoise(xx / 1.7, yy / 1.7, salt + 1) > 0.48 + d / r * 0.3 ? om : id.rock;
      } else if (res === 'silica') {
        mats[kk] = d < r * 0.8 ? om : id.sand;
      } else {
        mats[kk] = d < r * 0.62 && valueNoise(xx / 2.2, yy / 2.2, salt + 1) > 0.25 ? om : id.rock;
      }
      if (mats[kk] === om) {
        cells++;
        amts[kk] = rng.range(M.amtLo[om], M.amtHi[om]);
      }
    }
    meta.outcrops.push({ id: meta.outcrops.length + 1, res, x, y, r, cells });
  };
  const okSpot = (x, y, r) => {
    if (x < r + 4 || y < r + 4 || x > W - r - 4 || y > H - r - 4) return false;
    const k = y * W + x;
    return !water[k] && !lavaMask[k] && dWater[k] > r + 3 && hqD(x, y) > P.hq.clear + r + 8 && mats[k] !== id.basalt;
  };
  for (const res of P.nearHq) {
    for (let t = 0; t < 200; t++) {
      const r = rng.range(P.outcropR[0], P.outcropR[1]);
      const ang = rng.int(1024);
      const dist = rng.range(P.nearHqR[0], P.nearHqR[1]);
      const u = rot[Math.floor((ang / 1024) * rot.length) % rot.length];
      const x = Math.round(hq.x + u[0] * dist), y = Math.round(hq.y + u[1] * dist);
      if (!okSpot(x, y, r) || plateauMask[y * W + x]) continue;
      if (meta.outcrops.some((o) => hyp(o.x - x, o.y - y) < o.r + r + 14)) continue;
      placeOutcrop(res, x, y, r);
      break;
    }
  }
  for (const [res, n] of Object.entries(P.outcrops)) {
    const want = scaleCount(n);
    for (let c = 0; c < want; c++) {
      for (let t = 0; t < 200; t++) {
        const r = rng.range(P.outcropR[0], P.outcropR[1]) + (res === 'crystal' ? 2 : 0);
        const x = rng.range(r + 4, W - r - 5), y = rng.range(r + 4, H - r - 5);
        if (!okSpot(x, y, r)) continue;
        if (meta.outcrops.some((o) => hyp(o.x - x, o.y - y) < o.r + r + 20)) continue;
        placeOutcrop(res, x, y, r);
        break;
      }
    }
  }

  // ---- HQ clearing
  for (let dy = -P.hq.treeClear; dy <= P.hq.treeClear; dy++) for (let dx = -P.hq.treeClear; dx <= P.hq.treeClear; dx++) {
    const x = hq.x + dx, y = hq.y + dy;
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const k = y * W + x;
    // a rough round clearing: trees, shrubs and rock go; the ground keeps its own cover
    const d = Math.sqrt(dx * dx + dy * dy) / (0.8 + 0.4 * valueNoise(x / 9, y / 9, 444));
    if (d > P.hq.treeClear) continue;
    const m = mats[k];
    if (d <= P.hq.clear && !water[k] && (M.shade[m] >= 3 || M.ore[m])) { mats[k] = id.grass; amts[k] = 0; }
    else if (m === id.tree || m === id.shrub) mats[k] = id.grass;
  }

  // ---- write cells
  const amb = P.ambient ?? M.ambient;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = y * W + x;
    const m = mats[k];
    const t = M.hot[m] ? M.hot[m] : amb;
    g.cells[g.idx(x, y)] = cell(m, t, amts[k], 0);
  }
  // cliffs through the vector layer
  for (const line of cliffLines) {
    const v = vectors.add('cliff', line, false);
    meta.cliffs.push({ id: v.id, pts: v.pts });
  }

  // ---- reachability: cut fords to any land the HQ cannot walk to
  meta.carved = ensureReachable(g, M, hq);

  // hints
  for (let ci = 0; ci < g.nChunks; ci++) {
    const base = ci << 12;
    for (let li = 0; li < 4096; li++) if (M.emits[g.cells[base + li] & 255]) { g.emitHint[ci] = 1; break; }
  }
  for (let ci = 0; ci < g.nChunks; ci++) g.ver[ci]++;
  return meta;
}

// 256 unit vectors around the circle, built by repeated rotation with + and * only, so every engine
// builds the same list (Math.cos/sin may differ in the last bit between browsers).
const rot = (() => {
  const N = 256;
  const out = [];
  // cos/sin of 2*pi/256 from their series
  const a = (2 * 3.141592653589793) / N;
  let c = 1, s = 0, term = 1;
  for (let n = 1; n < 12; n++) { term = (-term * a * a) / ((2 * n - 1) * (2 * n)); c += term; }
  term = a; s = a;
  for (let n = 1; n < 12; n++) { term = (-term * a * a) / ((2 * n) * (2 * n + 1)); s += term; }
  let x = 1, y = 0;
  for (let i = 0; i < N; i++) {
    out.push([x, y]);
    const nx = x * c - y * s, ny = x * s + y * c;
    x = nx; y = ny;
  }
  return out;
})();

/**
 * Flood from the HQ; every walkable area it does not reach is either tiny (an islet in deep water —
 * it becomes deep water) or gets a 3-wide shallow ford cut through the water to the nearest reached
 * cell. A pocket shut in by lava or cliffs with no water route out is filled (lava or cliff).
 * Returns how many fords were cut.
 */
export function ensureReachable(g, M, hq) {
  const W = g.W, H = g.H, N = W * H;
  const shallow = M.id.shallow, deep = M.id.deep;
  let carved = 0;
  const walkMask = () => {
    const walk = new Uint8Array(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = g.cells[g.idx(x, y)];
      walk[y * W + x] = !(c & EDGE) && M.walk[c & 255] > 0 ? 1 : 0;
    }
    return walk;
  };
  const prev = new Int32Array(N);
  const q = new Int32Array(N);
  for (let pass = 0; pass < 6; pass++) {
    const walk = walkMask();
    const seen = floodMask(walk, W, H, hq.x, hq.y);
    let any = false;
    const done = new Uint8Array(N);
    for (let start = 0; start < N; start++) {
      if (!walk[start] || seen[start] || done[start]) continue;
      any = true;
      const comp = floodMask(walk, W, H, start % W, (start / W) | 0);
      let size = 0;
      for (let i = 0; i < N; i++) if (comp[i]) { done[i] = 1; size++; }
      if (size < 40) {
        // islet: let the water have it
        for (let i = 0; i < N; i++) if (comp[i]) g.cells[g.idx(i % W, (i / W) | 0)] = cell(deep, M.ambient, 0, 0);
        continue;
      }
      prev.fill(-1);
      let h = 0, t = 0;
      for (let i = 0; i < N; i++) if (comp[i]) { q[t++] = i; prev[i] = i; }
      let hit = -1;
      while (h < t && hit < 0) {
        const p = q[h++];
        const x = p % W, y = (p / W) | 0;
        for (let d = 0; d < 4; d++) {
          const nx = x + (d === 0 ? 1 : d === 1 ? -1 : 0), ny = y + (d === 2 ? 1 : d === 3 ? -1 : 0);
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const k = ny * W + nx;
          if (prev[k] >= 0) continue;
          const c = g.cells[g.idx(nx, ny)];
          if ((c & EDGE) || M.hot[c & 255]) continue;
          prev[k] = p;
          if (seen[k]) { hit = k; break; }
          q[t++] = k;
        }
      }
      if (hit < 0) {
        let nearLava = false;
        for (let i = 0; i < N && !nearLava; i++) if (comp[i]) {
          const x = i % W, y = (i / W) | 0;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const xx = x + dx, yy = y + dy;
            if (xx >= 0 && yy >= 0 && xx < W && yy < H && M.hot[g.cells[g.idx(xx, yy)] & 255]) { nearLava = true; break; }
          }
        }
        for (let i = 0; i < N; i++) if (comp[i]) {
          g.cells[g.idx(i % W, (i / W) | 0)] = nearLava ? cell(M.id.lava, M.hot[M.id.lava], 0, 0) : cell(M.id.cliff, M.ambient, 0, EDGE);
        }
        continue;
      }
      for (let p = hit; prev[p] !== p; p = prev[p]) {
        const x = p % W, y = (p / W) | 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const i = g.idx(xx, yy);
          const c = g.cells[i];
          if (!(c & EDGE) && M.walk[c & 255] === 0 && M.water[c & 255]) g.cells[i] = cell(shallow, M.ambient, 0, 0);
        }
      }
      carved++;
    }
    if (!any) return carved;
  }
  return carved;
}
