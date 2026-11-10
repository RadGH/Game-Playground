// Wayfare County — the generator for map 'county'. PURE (no DOM / three.js / Rapier), deterministic from the seed, the
// same on every machine (no Math.sin / cos / exp / pow / hypot in anything that decides a height, a surface or an
// object — see ../wmath.js). Called through ../worldgen.js: generateWorld({ seed, map: 'county' }).
//
// It fills the same contract as the classic world (docs/PLAN.md "World contract"; ../README-world.md "Wayfare
// County" lists the extra sites). 3072 m square at a 2 m cell: dim 1537, 2.36 M height samples.
//
// The order (each step reads the land as the steps before it left it):
//   1. masks on an 8 m lattice (mountains, hills, badlands, giant wood, farm belt), interpolated per sample
//   2. the land: rolling base + ridged mountains with strata cliffs + hills + terraced badland mesas
//   3. the plateau (flat top, sheer rim, talus) ; the river valley with its gorge stretch ; the lake bowl
//   4. stamps: towns flattened, the airfield, the launch site, farm plots, raider camps, the switchback apron
//   5. roads: town streets, highways, lanes, the switchback, mountain + dirt roads; carved one at a time
//   6. water, surfaces, then everything placed (bridges, buildings, giant logs, scatter) and the sites list

import { SURFACES, SURF, BIOMES, BIOME, ROAD_CLASSES, KINDS } from '../world-data.js';
import { dsin, dcos, clamp, lerp, smoothstep, fbm, ridged, makeRng, hash01, TAU } from '../wmath.js';
import { createRouter, chaikin, resample, profile, createCarve } from '../roads.js';
import { scatterObjects } from '../scatter.js';
import { C, CITIES, PLACE_LABELS, GARAGE_VEHICLES, DEPOT_VEHICLES, REGION_LABELS, CAMPS, COUNTY_SCATTER } from './county-data.js';
import { planCity } from './cities.js';
import { jobSpots } from './job-spots.js';

const SIZE = 3072, CELL = 2, DIM = 1537, HALF = 1536;
const LS = 8, LD = SIZE / LS + 1;          // mask lattice: 8 m, 385 across
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Bilinear height over a county-sized array. */
export function countyBilinear(arr, x, z) {
  const fx = (x + HALF) / CELL, fz = (z + HALF) / CELL;
  let i = Math.floor(fx), j = Math.floor(fz);
  if (i < 0) i = 0; else if (i > DIM - 2) i = DIM - 2;
  if (j < 0) j = 0; else if (j > DIM - 2) j = DIM - 2;
  let tx = fx - i, tz = fz - j;
  tx = tx < 0 ? 0 : tx > 1 ? 1 : tx; tz = tz < 0 ? 0 : tz > 1 ? 1 : tz;
  const k = j * DIM + i;
  const a = arr[k], b = arr[k + 1], c = arr[k + DIM], d = arr[k + DIM + 1];
  return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
}

export function* generateCountySteps(opts = {}) {
  const t0 = now();
  const ms = {};
  let tl = t0;
  const lap = (name) => { const t = now(); ms[name] = Math.round(t - tl); tl = t; };
  const seed = (Number(opts.seed) || 0) >>> 0;
  const S = (seed * 7919 + 2027) % 100000;
  const rng = makeRng(seed * 2654435761 + 11);
  const N = DIM * DIM;
  const heights = new Float32Array(N);
  const biome = new Uint8Array(N);
  const surface = new Uint8Array(N);
  const water = new Float32Array(N).fill(NaN);
  const paint = new Uint8Array(N);       // 0 = by biome, 1 = paved (concrete), 2 = lot gravel, 3 = lawn, 4 = farm soil,
                                         // 5 = road bank (earthworks), 6 = asphalt (hairpin bowls)
  const xOf = (i) => -HALF + i * CELL;
  const colOf = (x) => clamp(Math.round((x + HALF) / CELL), 0, DIM - 1);
  const B = BIOME;

  // ------------------------------------------------------------------------------------------------------------------
  // 1. masks on the 8 m lattice
  yield { progress: 0.02, label: 'drawing the county' };
  const L2 = LD * LD;
  const mM = new Float32Array(L2), mH = new Float32Array(L2), mB = new Float32Array(L2), mG = new Float32Array(L2), mF = new Float32Array(L2);
  const lBase = new Float32Array(L2), lForest = new Float32Array(L2), lStrata = new Float32Array(L2);
  const lScarp = new Float32Array(L2), lScarpW = new Float32Array(L2), lScarpA = new Float32Array(L2);
  const lWarpX = new Float32Array(L2), lWarpZ = new Float32Array(L2);
  const MP = C.mountains, SC = C.scarp.line;
  let scarpLen = 0;
  const scarpAlong0 = [0];
  for (let s = 0; s < SC.length - 1; s++) { const dx = SC[s + 1][0] - SC[s][0], dz = SC[s + 1][1] - SC[s][1]; scarpLen += Math.sqrt(dx * dx + dz * dz); scarpAlong0.push(scarpLen); }
  // Every hot loop runs in a closure of its own: V8 will not optimise a function with as much bytecode as this
  // generator (all of it ran 2-3x slower once the generator grew past the limit), but it optimises each closure.
  (() => {
  for (let j = 0; j < LD; j++) {
    const z = -HALF + j * LS;
    for (let i = 0; i < LD; i++) {
      const x = -HALF + i * LS, o = j * LD + i;
      const wx = x + (fbm(x * 0.0024, z * 0.0024, S + 5, 3) - 0.5) * 260;
      const wz = z + (fbm(x * 0.0024 + 7.3, z * 0.0024, S + 6, 3) - 0.5) * 260;
      let dm = 1e9;
      for (let s = 0; s < MP.length - 1; s++) dm = Math.min(dm, segDist(wx, wz, MP[s][0], MP[s][1], MP[s + 1][0], MP[s + 1][1]));
      mM[o] = 1 - smoothstep(150, 640, dm);
      const ex = (wx - C.hills.x) / C.hills.rx, ez = (wz - C.hills.z) / C.hills.rz;
      mH[o] = 1 - smoothstep(0.25, 1.1, Math.sqrt(ex * ex + ez * ez));
      mB[o] = smoothstep(C.badlands.x0 - 120, C.badlands.x0 + 170, wx) * smoothstep(C.badlands.z0 + 120, C.badlands.z0 - 170, wz);
      const gx = wx - C.giantwood.x, gz = wz - C.giantwood.z;
      mG[o] = 1 - smoothstep(0.55, 1.0, Math.sqrt(gx * gx + gz * gz) / C.giantwood.r);
      mF[o] = smoothstep(C.farmBelt.x0 + 90, C.farmBelt.x0 - 130, wx) * smoothstep(C.farmBelt.z0 - 90, C.farmBelt.z0 + 130, wz);
      lBase[o] = 16 + 34 * fbm(x * 0.0011, z * 0.0011, S + 11, 3) + 9 * fbm(x * 0.0045, z * 0.0045, S + 12, 2);
      lForest[o] = fbm(x * 0.0026, z * 0.0026, S + 71, 3);
      lStrata[o] = smoothstep(0.56, 0.64, fbm(x * 0.0028, z * 0.0028, S + 33, 2));   // cliff bands in a few places, not everywhere
      lWarpX[o] = fbm(x * 0.0013, z * 0.0013, S + 35, 3); lWarpZ[o] = fbm(x * 0.0013 + 3.7, z * 0.0013, S + 36, 3);
      // the scarp: signed distance to its line (north = high side), and how sharp it is here
      let bd = 1e18, sd = 0, along = 0;
      for (let s = 0; s < SC.length - 1; s++) {
        const ax = SC[s][0], az = SC[s][1], vx = SC[s + 1][0] - ax, vz = SC[s + 1][1] - az;
        const L = vx * vx + vz * vz, t = clamp(((x - ax) * vx + (z - az) * vz) / L, 0, 1);
        const px = x - ax - vx * t, pz = z - az - vz * t, d2 = px * px + pz * pz;
        if (d2 < bd) { bd = d2; sd = (vx * pz - vz * px) < 0 ? Math.sqrt(d2) : -Math.sqrt(d2); along = scarpAlong0[s] + t * Math.sqrt(L); }
      }
      lScarp[o] = sd + (fbm(x * 0.01, z * 0.01, S + 17, 2) - 0.5) * 24;
      let gap = 0;
      for (const gx0 of C.scarp.gaps) gap = Math.max(gap, 1 - smoothstep(30, 80, Math.abs(x - gx0)));
      lScarpW[o] = lerp(C.scarp.width, 150, gap);
      lScarpA[o] = smoothstep(0, 160, along) * smoothstep(0, 160, scarpLen - along);   // fades out at both ends
    }
  }
  })();
  const lat = (arr, x, z) => {
    const fx = (x + HALF) / LS, fz = (z + HALF) / LS;
    const i = Math.min(LD - 2, Math.floor(fx)), j = Math.min(LD - 2, Math.floor(fz));
    const tx = fx - i, tz = fz - j, o = j * LD + i;
    return (arr[o] * (1 - tx) + arr[o + 1] * tx) * (1 - tz) + (arr[o + LD] * (1 - tx) + arr[o + LD + 1] * tx) * tz;
  };
  lap('masks');

  // the vale's ridged hills on a 4 m lattice (every second sample), read bilinearly in step 2
  // (filled on first use: only the free vale needs it)
  const V4 = (DIM - 1) / 2 + 1, lV4 = new Float32Array(V4 * V4).fill(-1);
  const v4 = (a, b) => {
    const o = b * V4 + a;
    let v = lV4[o];
    if (v < 0) { v = lV4[o] = Math.max(0, ridgedG((-HALF + a * 4) * 0.0029, (-HALF + b * 4) * 0.0029, S + 15, 3) - 0.1) / 0.9; }
    return v;
  };
  const valeAt = (i, j) => {
    const a = i >> 1, b = j >> 1;
    if (!(i & 1) && !(j & 1)) return v4(a, b);
    const a1 = Math.min(V4 - 1, a + 1), b1 = Math.min(V4 - 1, b + 1);
    const tx = (i & 1) * 0.5, tz = (j & 1) * 0.5;
    return (v4(a, b) * (1 - tx) + v4(a1, b) * tx) * (1 - tz) + (v4(a, b1) * (1 - tx) + v4(a1, b1) * tx) * tz;
  };
  // ------------------------------------------------------------------------------------------------------------------
  // 2. the land
  yield { progress: 0.06, label: 'raising the mountains' };
  (() => {   // own closure: see the masks loop
  for (let j = 0; j < DIM; j++) {
    const z = xOf(j);
    // lattice row and blend for this sample row (the same for the whole row)
    const fz = (z + HALF) / LS, lj = Math.min(LD - 2, Math.floor(fz)), tz = fz - lj;
    for (let i = 0; i < DIM; i++) {
      const x = xOf(i), k = j * DIM + i;
      const fx = (x + HALF) / LS, li = Math.min(LD - 2, Math.floor(fx)), tx = fx - li, o = lj * LD + li;
      const w00 = (1 - tx) * (1 - tz), w10 = tx * (1 - tz), w01 = (1 - tx) * tz, w11 = tx * tz;
      const L = (a) => a[o] * w00 + a[o + 1] * w10 + a[o + LD] * w01 + a[o + LD + 1] * w11;
      let h = L(lBase) + 1.4 * fbm(x * 0.03, z * 0.03, S + 13, 1);
      let bio = B.c_vale;
      const wh = L(mH), wb = L(mB), wg = L(mG), wf = L(mF);
      // the named peaks: a massif where the range is lifted and its own ridges carry on up to a summit
      let pw = 0, pkH = 0;
      for (const pk of C.peaks) {
        const dx = x - pk.x, dz = z - pk.z, d2 = dx * dx + dz * dz;
        if (d2 < pk.r * pk.r) { const t = 1 - Math.sqrt(d2) / pk.r, w = t * t * (3 - 2 * t); if (w > pw) { pw = w; pkH = pk.h; } }
      }
      const wm = L(mM);
      // the vale between everything: ridged hills, strongest where nothing else is
      const free = clamp(1 - wh - wm - wb - wg - wf * 1.5, 0, 1);
      if (free > 0.01) {
        // from a 4 m lattice (the 8 m mask lattice creased the hills along its rows; every 2 m sample cost 0.4 s)
        const v4 = valeAt(i, j);
        h += free * 46 * v4 * v4;
      }
      // the scarp: a cliff step up to the north, a long gentle dip slope behind it
      const sa = L(lScarpA);
      if (sa > 0.001) {
        const sd = L(lScarp), sw = L(lScarpW);
        if (sd > -sw && sd < 520) h += C.scarp.h * sa * smoothstep(-sw / 2, sw / 2, sd) * (1 - smoothstep(260, 520, sd)) * (1 - wm) * (1 - wb);
      }
      if (wh > 0.002) {
        const r = Math.max(0, ridgedG(x * 0.0033, z * 0.0033, S + 21, 4) - 0.12) / 0.88;
        let hh = 20 + 120 * r * r;
        const t = hh / 18, f = Math.floor(t);
        hh = lerp(hh, 18 * (f + smoothstep(0.7, 0.95, t - f)), 0.5);
        h += wh * wh * (3 - 2 * wh) * hh;
      }
      if (wm > 0.002) {
        // big smooth forms with sharp crests: ridged GRADIENT noise (value noise sits on an axis-aligned lattice and
        // reads as blocks from the air), each octave turned 37 degrees from the last, seen through a domain warp
        const wx = x + 150 * (L(lWarpX) - 0.5) * 2, wz = z + 150 * (L(lWarpZ) - 0.5) * 2;
        const r = Math.min(1, Math.max(0, ridgedG(wx * 0.0017, wz * 0.0017, S + 31, 3, 0.36) - 0.15) / 0.76);
        let hm = 30 + 330 * r * (0.55 + 0.45 * wm);
        if (pw > 0) hm = lerp(hm, (pkH - 45) * (0.3 * pw + 0.7 * Math.min(1, r * 1.3)), pw);
        // strata: in places the slope breaks into cliff bands 26 m apart
        const cl = L(lStrata) * (1 - pw);                // no strata rings round a summit
        if (cl > 0) { const t = hm / 26, f = Math.floor(t); hm = lerp(hm, 26 * (f + smoothstep(0.66, 0.9, t - f)), cl * 0.6); }
        h += wm * wm * (3 - 2 * wm) * hm;
        if (wm > 0.45) bio = B.c_mountain; else if (wm > 0.16) bio = B.c_forest;
      }
      if (wb > 0.002) {
        const t = gfbm(x * 0.0031 + 5.1, z * 0.0031, S + 41, 4);    // gradient noise: mesas with organic outlines, not lattice blocks
        const tt = Math.max(0, t - 0.3) * 7.5, f = Math.floor(tt);
        const hb = 30 + 15 * (f + smoothstep(0.74, 0.95, tt - f)) + 1.4 * fbm(x * 0.03, z * 0.03, S + 42, 1);
        h = lerp(h, hb, wb);
        if (wb > 0.5) bio = B.c_badlands;
      }
      if (wg > 0.002) { h = lerp(h, 34 + 16 * fbm(x * 0.004, z * 0.004, S + 51, 3), wg * 0.75); if (wg > 0.4) bio = B.c_giantwood; }
      if (wf > 0.002) { h = lerp(h, 27 + 3 * fbm(x * 0.0026, z * 0.0026, S + 61, 2), wf); if (wf > 0.5) bio = B.c_farm; }
      if (bio === B.c_vale && wh > 0.3) bio = B.c_hills;
      if (bio === B.c_vale && L(lForest) > 0.6) bio = B.c_forest;
      heights[k] = h;
      biome[k] = bio;
    }
  }
  })();
  lap('land');
  // 2c. scree: at the foot of every cliff the hollow fills partway with fallen rock. Box-blur the land over a few
  // samples; where the blur is HIGHER than the ground (a concave foot), raise the ground part of the way toward it.
  // Only concave ground moves, so crests and cliff tops stay sharp.
  const scree = new Uint8Array(N);
  (() => {
    const R = C.scree.blur, tmp = new Float32Array(N), inv = 1 / (2 * R + 1);
    const lF = new Float32Array(L2);       // how much fills, by region, on the mask lattice
    for (let o = 0; o < L2; o++) lF[o] = Math.max(mM[o] * C.scree.mountain, mB[o] * C.scree.badlands, mH[o] * C.scree.hills);
    for (let j = 0; j < DIM; j++) {
      const o = j * DIM;
      let acc = 0;
      for (let i = -R; i <= R; i++) acc += heights[o + clamp(i, 0, DIM - 1)];
      for (let i = 0; i < DIM; i++) {
        tmp[o + i] = acc * inv;
        acc += heights[o + Math.min(DIM - 1, i + R + 1)] - heights[o + Math.max(0, i - R)];
      }
    }
    // the vertical pass row by row (a running sum per column), so memory is read in order
    const acc = new Float64Array(DIM);
    for (let j = -R; j <= R; j++) { const o = clamp(j, 0, DIM - 1) * DIM; for (let i = 0; i < DIM; i++) acc[i] += tmp[o + i]; }
    for (let j = 0; j < DIM; j++) {
      const z = xOf(j), oIn = Math.min(DIM - 1, j + R + 1) * DIM, oOut = Math.max(0, j - R) * DIM;
      for (let i = 0; i < DIM; i++) {
        const k = j * DIM + i, b = acc[i] * inv;
        acc[i] += tmp[oIn + i] - tmp[oOut + i];
        const d = b - heights[k];
        if (d <= 0.3) continue;
        const f = lat(lF, xOf(i), z);
        if (f <= 0.01) continue;
        const lift = d * f;
        heights[k] += lift;
        if (lift > 1.0) scree[k] = 1;
      }
    }
  })();
  lap('scree');

  // ------------------------------------------------------------------------------------------------------------------
  // 3a. the plateau: a flat top, a sheer rim, a talus skirt
  yield { progress: 0.24, label: 'lifting the plateau' };
  const PL = C.plateau;
  const plateauD = (x, z) => { const dx = x - PL.x, dz = z - PL.z; return Math.sqrt(dx * dx + dz * dz) + (fbm(x * 0.0042, z * 0.0042, S + 81, 2) - 0.5) * 80; };
  forDisc(PL.x, PL.z, PL.r + 260, (k, x, z) => {
    const d = plateauD(x, z);
    if (d < PL.r) { heights[k] = PL.top + 1.6 * fbm(x * 0.02, z * 0.02, S + 82, 2); biome[k] = B.c_plateau; return; }
    let p;
    if (d < PL.r + PL.cliffW) p = PL.top - PL.cliff * smoothstep(PL.r, PL.r + PL.cliffW, d);
    else p = PL.top - PL.cliff - (d - PL.r - PL.cliffW) * (0.55 + 0.25 * fbm(x * 0.02, z * 0.02, S + 83, 2));
    if (p > heights[k]) { heights[k] = p; if (d < PL.r + PL.cliffW + 6) biome[k] = B.c_plateau; }
  });

  // 3b. the river, column by column
  yield { progress: 0.30, label: 'cutting the gorge' };
  const R = C.river, LK = C.lake, G = R.gorge;
  const rPhase = (rng() - 0.5) * 0.4;
  const riverZ = (x) => {
    let z = R.z0;
    for (const [a, f, p] of R.waves) z += a * dsin(x * f + p + rPhase);
    return z + (fbm(x * 0.003, 3.7, S + 91, 3) - 0.5) * R.noise * 2;
  };
  const rz = new Float64Array(DIM), rk = new Float64Array(DIM), rL = new Float64Array(DIM), rW = new Float64Array(DIM);
  const rFord = new Float64Array(DIM), rG = new Float64Array(DIM);
  const LAKE_LEVEL = 14;
  const lakeW = LK.x - LK.r - 30, lakeE = LK.x + LK.r + 30;
  for (let i = 0; i < DIM; i++) {
    const x = xOf(i);
    rz[i] = riverZ(x);
    const sl = (riverZ(x + 1) - riverZ(x - 1)) / 2;
    rk[i] = 1 / Math.sqrt(1 + sl * sl);
    rG[i] = smoothstep(G.x0 - G.ramp, G.x0, x) * (1 - smoothstep(G.x1, G.x1 + G.ramp, x));
    rL[i] = x < lakeW ? LAKE_LEVEL + R.fall * (lakeW - x) : x <= lakeE ? LAKE_LEVEL
      : LAKE_LEVEL - R.fall * (x - lakeE) - G.drop * smoothstep(G.x0, G.x1, x);
    rW[i] = lerp(R.width[0], R.width[1], fbm(x * 0.008, 3.3, S + 93, 2)) * lerp(1, 0.62, rG[i]);
    rFord[i] = 1 - smoothstep(9, 24, Math.abs(x - C.ford.x));
  }
  const lakeZ = rz[colOf(LK.x)];
  const riverDist = (x, z) => { const i = colOf(x); return Math.abs(z - rz[i]) * rk[i]; };
  const riverHalfW = (x) => { const i = colOf(x); return rW[i] * (1 + 0.6 * rFord[i]); };
  const lakeD = (x, z) => { const dx = x - LK.x, dz = z - lakeZ; return Math.sqrt(dx * dx + dz * dz) + (fbm(x * 0.0045, z * 0.0045, S + 95, 3) - 0.5) * 150; };
  const noCarve = new Uint8Array(N);
  (() => {   // own closure: see the masks loop
  for (let j = 0; j < DIM; j++) {
    const z = xOf(j);
    for (let i = 0; i < DIM; i++) {
      const d = Math.abs(z - rz[i]) * rk[i];
      if (d > 260) continue;
      const x = xOf(i), k = j * DIM + i;
      const ford = rFord[i], gf = rG[i];
      const L = rL[i], W = rW[i] * (1 + 0.6 * ford);
      const h0 = heights[k];
      // the plain valley: bed, banks, a floodplain, then back into the land
      const Bk = lerp(5, 14, ford);
      const F = L + 1.4 + 0.4 * fbm(x * 0.02, z * 0.02, S + 97, 2);
      let hp;
      if (d < W) { const t = d / W; hp = lerp(L - 0.4 - 3.0 * (1 - t * t), L - 0.45 + 0.1 * t * t, ford); }
      else if (d < W + Bk) hp = lerp(L - 0.3, F, smoothstep(0, 1, (d - W) / Bk));
      else hp = F + (d - W - Bk) * 0.015;
      hp = lerp(hp, h0, smoothstep(W + Bk + 30, W + Bk + 180, d));
      let h = hp;
      if (gf > 0) {
        // the gorge: a narrow bed between sheer walls that climb until they meet the land
        let hg;
        if (d < W) { const t = d / W; hg = L - 0.5 - 3.4 * (1 - t * t); }
        else if (d < W + 3) hg = L + 0.25;
        else hg = Math.min(h0, L + 0.8 + (d - W - 3) * (4.6 + 2.2 * fbm(x * 0.03, z * 0.03, S + 99, 2)));
        h = lerp(hp, hg, gf);
      }
      heights[k] = h;
      if (d < W) noCarve[k] = 1;
      if (gf > 0.5 && d < W + 3 + (h0 - L) / 4.6 + 6) biome[k] = B.c_gorge;
      else if (d < W + Bk + 70 && gf <= 0.5 && biome[k] !== B.c_mountain) biome[k] = B.river;
    }
  }
  })();
  // 3c. the lake: a bowl the river runs through
  forDisc(LK.x, lakeZ, LK.r + 140, (k, x, z) => {
    const d = lakeD(x, z);
    const bowl = d < LK.r ? LAKE_LEVEL - 0.3 - 6.5 * (1 - (d / LK.r) * (d / LK.r)) : LAKE_LEVEL - 0.3 + (d - LK.r) * 0.05;
    heights[k] = lerp(bowl, heights[k], smoothstep(LK.r * 0.92, LK.r + 110, d));
    if (d < LK.r + 60) biome[k] = B.c_shore;
    if (d < LK.r) noCarve[k] = 1;
  });
  lap('plateau+river');

  // ------------------------------------------------------------------------------------------------------------------
  // 4. stamps: towns, the airfield, the launch site, farm plots, raider camps, the switchback apron
  yield { progress: 0.40, label: 'laying out the towns' };
  const cities = CITIES.map(spec => {
    const crng = makeRng(seed * 31 + hashStr(spec.id));
    const plan = planCity(spec, crng);
    const hx = plan.ux + 18, hz = plan.uz + 18;
    let hc = spec.id === 'highgate' ? PL.top : Math.round(rectAvg(plan.x, plan.z, hx, hz) * 10) / 10;
    if (spec.id === 'port_lindell') hc = Math.max(hc, LAKE_LEVEL + 3.2);
    plan.y = hc; plan.hx = hx; plan.hz = hz;
    flattenRect(plan.x, plan.z, hx, hz, hc, spec.id === 'highgate' ? 20 : 60);
    forRect(plan.x, plan.z, hx, hz, (k) => { biome[k] = B.c_city; paint[k] = 3; });
    for (const l of plan.lots) forRect((l.x0 + l.x1) / 2, (l.z0 + l.z1) / 2, (l.x1 - l.x0) / 2, (l.z1 - l.z0) / 2, (k) => { paint[k] = 2; });
    for (const yd of plan.yards) forRect((yd.x0 + yd.x1) / 2, (yd.z0 + yd.z1) / 2, (yd.x1 - yd.x0) / 2, (yd.z1 - yd.z0) / 2, (k) => { paint[k] = 1; });
    return plan;
  });
  const cityById = Object.fromEntries(cities.map(c => [c.id, c]));

  // the airfield: one flat pad for the runway, the taxiway, the apron and the hangars
  const AP = C.airport;
  const rwy = { x0: AP.x - AP.len / 2, x1: AP.x + AP.len / 2, z: AP.z, w: AP.w };
  const twy = { x0: rwy.x0 + 40, x1: rwy.x1 - 40, z: AP.z - 62, w: 16 };
  const apron = { x0: AP.x - 300, x1: AP.x + 30, z0: AP.z - 150, z1: twy.z - twy.w / 2 };
  const airRect = { x: AP.x, z: AP.z - 60, hx: AP.len / 2 + 80, hz: 140 };
  const hAir = Math.round(rectAvg(airRect.x, airRect.z, airRect.hx, airRect.hz) * 10) / 10;
  flattenRect(airRect.x, airRect.z, airRect.hx, airRect.hz, hAir, 80);
  forRect(airRect.x, airRect.z, airRect.hx, airRect.hz, (k) => { biome[k] = B.c_airfield; });
  const pave = (x0, z0, x1, z1) => forRect((x0 + x1) / 2, (z0 + z1) / 2, (x1 - x0) / 2, (z1 - z0) / 2, (k) => { paint[k] = 1; });
  pave(rwy.x0, rwy.z - rwy.w / 2, rwy.x1, rwy.z + rwy.w / 2);
  pave(twy.x0, twy.z - twy.w / 2, twy.x1, twy.z + twy.w / 2);
  for (const cx of [twy.x0 + 8, twy.x1 - 8, AP.x]) pave(cx - 8, twy.z, cx + 8, rwy.z - rwy.w / 2);
  pave(apron.x0, apron.z0, apron.x1, apron.z1);

  // the launch site: a paved disc far from the towns
  const LC = C.launch;
  const hLaunch = Math.round(rectAvg(LC.x, LC.z, LC.r, LC.r) * 10) / 10;
  flattenDisc(LC.x, LC.z, LC.r, hLaunch, 60);
  forDisc(LC.x, LC.z, LC.r, (k, x, z, d) => { biome[k] = B.c_airfield; if (d < 26) paint[k] = 1; else paint[k] = 2; });

  // farm plots: rectangular fields around Marrow Flats, each flattened to its own level
  const MF = cityById.marrow_flats;
  const plotSpots = [];
  for (const z of [770, 870]) for (const x of [-1330, -1200, -1070, -940]) plotSpots.push([x, z]);
  for (const x of [-770, -640]) plotSpots.push([x, MF.z + MF.uz + 150]);
  const plots = plotSpots.map(([x0, z0], n) => {
    const x = x0 + (rng() - 0.5) * 10, z = z0 + (rng() - 0.5) * 8;
    const w = 96 + Math.round(rng() * 8), h = 60 + Math.round(rng() * 6);
    const y = Math.round(rectAvg(x, z, w / 2, h / 2) * 10) / 10;
    flattenRect(x, z, w / 2, h / 2, y, 14);
    forRect(x, z, w / 2, h / 2, (k) => { paint[k] = 4; biome[k] = B.c_farm; });
    return { id: 'plot_' + (n + 1), x: r2(x), z: r2(z), w, h, yaw: 0, y };
  });
  const barnSpot = { x: -1010, z: 960 };
  const hBarn = Math.round(rectAvg(barnSpot.x, barnSpot.z, 40, 30) * 10) / 10;
  flattenRect(barnSpot.x, barnSpot.z, 40, 30, hBarn, 20);
  forRect(barnSpot.x, barnSpot.z, 40, 30, (k) => { biome[k] = B.c_farm; paint[k] = 2; });

  // raider camps: small flat clearings in the Rustwild
  const camps = CAMPS.map(c => {
    let best = null;
    for (let t = 0; t < 14; t++) {
      const x = c.x + (t ? (rng() - 0.5) * 140 : 0), z = c.z + (t ? (rng() - 0.5) * 140 : 0);
      const lo = rectMin(x, z, 22), hi = rectMax(x, z, 22);
      const score = hi - lo;
      if (!best || score < best.score) best = { x, z, score };
    }
    const y = Math.round(rectAvg(best.x, best.z, 18, 18) * 10) / 10;
    flattenDisc(best.x, best.z, 24, y, 22);
    forDisc(best.x, best.z, 24, (k) => { paint[k] = 2; });
    return { id: c.id, name: c.name, x: r2(best.x), z: r2(best.z), y, r: 24 };
  });

  // the switchback up the plateau's south face. Not shelves cut into the cliff: a SPUR, a natural ramp of ground that
  // runs out of the rim down to the vale, and a road traced up it the way a surveyor would lay one — each leg follows
  // the slope across the spur at the road's grade, curving with the ground, and turns in a wide paved hairpin bowl
  // when it nears the spur's flank. Then the earthworks: around the road the ground may be no higher than a cut bank
  // and no lower than a fill bank reaching out from the road's edge (planar banks, like a real road's), and each
  // hairpin's bowl is level. See traceSwitchback() at the end of the file.
  yield { progress: 0.46, label: 'surveying the switchback' };
  const SW = C.switchback;
  let zR = PL.z;
  while (zR < PL.z + PL.r + 120 && bilinear(heights, SW.x, zR) > PL.top - 2) zR += 2;
  zR -= 4;                                           // the spur's top meets the plateau just inside the rim
  const spurAxis = (z) => SW.x + SW.wobble * dsin((z - zR) * 0.011 + 0.7);
  /** The spur's smooth surface (the trace steers on this one; the land gets a little noise on top). */
  const spurS = (x, z) => {
    const a = z <= zR ? PL.top : PL.top - SW.gA * (z - zR);
    const u = Math.abs(x - spurAxis(z));
    const W = SW.W + 36 * (fbm(z * 0.006, 2.1, S + 205, 2) - 0.5);     // the spur is not the same width all the way down
    let d;
    if (u <= W) d = SW.drop * (u / W) * (u / W);
    else {
      // past the core the flank steepens to a natural ~40 degree side
      const e = u - W, sl0 = 2 * SW.drop / W, ease = 18;
      d = SW.drop + (e < ease ? sl0 * e + (0.85 - sl0) * e * e / (2 * ease) : sl0 * ease + (0.85 - sl0) * ease / 2 + 0.85 * (e - ease));
    }
    // past the rim the spur's shoulders round off and fall away (its crest runs on into the plateau), so it grows
    // out of the cliff instead of ending along a straight line
    const zS = zR + 14 - 34 * fbm(x * 0.012, 4.4, S + 207, 2);          // where the shoulders start to fall (a wavy line)
    if (z < zS) d += 0.9 * (zS - z) * smoothstep(30, W, u);
    return a - d;
  };
  const valeH = bilinear(heights, SW.x, zR + (PL.top - 40) / SW.gA + 60);
  const zFoot = zR + (PL.top - valeH) / SW.gA;      // where the spur's crest meets the vale
  const sb = traceSwitchback(SW, PL.top, zR, zFoot, spurS, spurAxis, makeRng(seed * 977 + 41));
  sb.footH = sb.prof[0];
  (() => {
    // 1. the spur itself: ground rises to its surface (plus a little noise) wherever it is higher
    const x0 = SW.x - SW.wobble - SW.W - 130, x1 = SW.x + SW.wobble + SW.W + 130, z0 = zR - 120, z1 = zFoot + 40;
    forRect((x0 + x1) / 2, (z0 + z1) / 2, (x1 - x0) / 2, (z1 - z0) / 2, (k, x, z) => {
      const sv = spurS(x, z) + (fbm(x * 0.018, z * 0.018, S + 201, 3) - 0.5) * 6 * smoothstep(zR, zR + 40, z);
      if (sv > heights[k]) { heights[k] = sv; if (z > zR + 2) biome[k] = B.c_plateau; }
    });
    // 2. earthworks: a bucket grid of the road (and the hairpin bowls) so each sample asks only what is near it
    const w = ROAD_CLASSES.lane.halfW + 0.6, FILL = 0.72, CUT = 1.05, REACH = 46;
    const BK = 16, bucket = new Map();
    const put = (x, z, item) => { const key = Math.floor(x / BK) * 4096 + Math.floor(z / BK); if (!bucket.has(key)) bucket.set(key, []); bucket.get(key).push(item); };
    sb.pts.forEach((p, i) => put(p[0], p[1], [p[0], p[1], 0, sb.prof[i]]));
    for (const b of sb.bowls) for (let a = 0; a < 8; a++) put(b.x + b.r * dcos(a * 0.785), b.z + b.r * dsin(a * 0.785), [b.x, b.z, b.r, b.y]);
    const bx0 = Math.min(...sb.pts.map(p => p[0])) - REACH, bx1 = Math.max(...sb.pts.map(p => p[0])) + REACH;
    const bz0 = Math.min(...sb.pts.map(p => p[1])) - REACH, bz1 = Math.max(...sb.pts.map(p => p[1])) + REACH;
    forRect((bx0 + bx1) / 2, (bz0 + bz1) / 2, (bx1 - bx0) / 2, (bz1 - bz0) / 2, (k, x, z) => {
      let lo = -Infinity, hi = Infinity;
      const gi = Math.floor(x / BK), gj = Math.floor(z / BK);
      const seen = new Set();
      for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) {
        const L = bucket.get((gi + di) * 4096 + gj + dj); if (!L) continue;
        for (const it of L) {
          if (it[2] > 0) { if (seen.has(it)) continue; seen.add(it); }
          const dx = x - it[0], dz = z - it[1];
          let d = Math.sqrt(dx * dx + dz * dz) - it[2] - w;
          if (d > REACH) continue;
          if (d < 0) d = 0;
          lo = Math.max(lo, it[3] - d * FILL);
          hi = Math.min(hi, it[3] + d * CUT);
        }
      }
      if (lo === -Infinity) return;
      const h0 = heights[k];
      const h = lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, h0));
      heights[k] = h;
      if (Math.abs(h - h0) > 0.5) paint[k] = paint[k] || 5;    // a bank: raw earth and broken rock, not lawn
    });
    // the bowl: the hairpin is paved 4 m wider on its inside, so a long vehicle can swing round it
    for (const b of sb.bowls) forDisc(b.x, b.z, b.r + w - 0.6, (k, x, z, d) => {
      if (d > b.r - w - 4 && (x - b.x) * b.ux + (z - b.z) * b.uz > -3) paint[k] = 6;
    });
  })();
  lap('stamps');

  // ------------------------------------------------------------------------------------------------------------------
  // 5. roads
  yield { progress: 0.52, label: 'surveying the roads' };
  const heightAt0 = (x, z) => bilinear(heights, x, z);
  const inRect = (x, z, r, m = 0) => Math.abs(x - r.x) < r.hx + m && Math.abs(z - r.z) < r.hz + m;
  const blockRects = [
    ...cities.map(c => ({ x: c.x, z: c.z, hx: c.ux + 14, hz: c.uz + 14 })),
    { x: (rwy.x0 + rwy.x1) / 2, z: (twy.z - twy.w / 2 + rwy.z + rwy.w / 2) / 2, hx: AP.len / 2 + 12, hz: (rwy.z + rwy.w / 2 - twy.z + twy.w / 2) / 2 + 10 },
    { x: (apron.x0 + apron.x1 + 50) / 2, z: apron.z0 - 22, hx: (apron.x1 + 50 - apron.x0) / 2 + 6, hz: 34 },   // hangars, tower, jump point
    ...plots.map(p => ({ x: p.x, z: p.z, hx: p.w / 2 + 8, hz: p.h / 2 + 8 })),
    // the switchback's spur (only the switchback itself climbs it): from just inside the rim to just short of the foot
    { x: SW.x, z: (zR + 12 + sb.pts[0][1] - 8) / 2, hx: SW.wobble + SW.W + 20, hz: (sb.pts[0][1] - 8 - zR - 12) / 2 },
  ];
  const router = createRouter({ size: SIZE, heightAt: heightAt0 }, {
    blocked: (x, z) => {
      if (riverDist(x, z) < riverHalfW(x) + 4 && rFord[colOf(x)] < 0.5) return true;
      if (lakeD(x, z) < LK.r + 6) return true;
      for (const r of blockRects) if (inRect(x, z, r)) return true;
      const lx = x - LC.x, lz = z - LC.z;
      if (lx * lx + lz * lz < (LC.r - 10) * (LC.r - 10)) return true;
      return false;
    },
    biomeCost: (x, z) => {
      const b = biome[colOf(z) * DIM + colOf(x)];
      return b === B.c_mountain ? 0.35 : b === B.c_giantwood ? 0.15 : b === B.c_badlands ? 0.1 : b === B.c_shore ? 0.3 : b === B.c_gorge ? 2 : 0;
    },
  });
  const allowFord = (x) => rFord[colOf(x)] >= 0.5;
  const nodes = [];
  const node = (id, x, z, extra = {}) => { const n = { id, x, z, ...extra }; nodes.push(n); return n; };
  const bankZ = (x, side, extra) => { const i = colOf(x); return rz[i] + side * (rW[i] * (1 + 0.6 * rFord[i]) + extra) / rk[i]; };

  // town gates
  const gate = {};
  for (const c of cities) for (const s of ['n', 's', 'e', 'w']) gate[c.id + '_' + s] = node(c.id + '_' + s, c.gates[s][0], c.gates[s][1], { town: c.id });
  const fixedPin = new Map();
  for (const c of cities) for (const s of ['n', 's', 'e', 'w']) fixedPin.set(gate[c.id + '_' + s], c.y);
  // bridges: two bank nodes each; the gorge bridge stands on the rims
  const bridgeNodes = C.bridges.map(b => {
    let zs = bankZ(b.x, 1, b.extra), zn = bankZ(b.x, -1, b.extra);
    if (b.high) {
      const rim = (side) => {
        const i = colOf(b.x);
        let d = rW[i] + 4, prev = rL[i];
        for (; d < 220; d += 2) {
          const h = heightAt0(b.x, rz[i] + side * d / rk[i]);
          if (d > rW[i] + 12 && h - prev < 0.4) break;
          prev = h;
        }
        return rz[i] + side * (d + b.extra) / rk[i];
      };
      zs = rim(1); zn = rim(-1);
    }
    const s = node(b.id + '_s', b.x, zs), n = node(b.id + '_n', b.x, zn);
    const i = colOf(b.x);
    const banks = Math.max(heightAt0(b.x, zs), heightAt0(b.x, zn));
    const deckY = b.high ? Math.round((banks + 0.3) * 10) / 10 : Math.round((Math.max(banks, rL[i] + 1.4) + 2.8) * 10) / 10;
    fixedPin.set(s, deckY); fixedPin.set(n, deckY);
    return { ...b, s, n, deckY };
  });
  const BR = Object.fromEntries(bridgeNodes.map(b => [b.id, b]));
  const nFordS = node('ford_s', C.ford.x, bankZ(C.ford.x, 1, 24), { name: C.ford.name });
  const nFordN = node('ford_n', C.ford.x, bankZ(C.ford.x, -1, 24));
  const nJ = node('junction', C.junction.x, C.junction.z, { name: C.junction.name });
  const nFoot = node('switchback_foot', sb.pts[0][0], sb.pts[0][1]);
  const nTop = node('switchback_top', sb.pts[sb.pts.length - 1][0], sb.pts[sb.pts.length - 1][1]);
  fixedPin.set(nFoot, sb.prof[0]); fixedPin.set(nTop, PL.top);
  const nSouth = node('south_junction', 60, 955);
  const nApron = node('airfield', apron.x0 - 12, (apron.z0 + apron.z1) / 2, { name: AP.name });
  fixedPin.set(nApron, hAir);
  const nLaunch = node('launch', LC.x - LC.r + 6, LC.z - 10, { name: LC.name });
  fixedPin.set(nLaunch, hLaunch);
  const nRust = node('rustwild_gate', 1060, -300, { name: 'Rustwild Gate' });
  const campNodes = camps.map(c => { const n = node(c.id, c.x, c.z + c.r - 4); fixedPin.set(n, c.y); return n; });
  const nElder = node('elderwood_gate', -880, -230, { name: 'Elderwood' });
  const elderLoop = [[-1040, -150], [-1270, -260], [-1210, -480], [-990, -470]].map(([x, z], q) => node('elderwood_' + (q + 1), x + (rng() - 0.5) * 30, z + (rng() - 0.5) * 30));
  const nFarmYard = node('farm_yard', barnSpot.x, barnSpot.z - 30);
  fixedPin.set(nFarmYard, hBarn);
  const nFarmW = node('farm_west', -1395, 820);
  // the summit above Highgate: the highest point of the mountains north of the plateau
  let sm = { x: 160, z: -1380, h: -1e9 };
  for (let z = -1500; z <= -1290; z += 6) for (let x = -260; x <= 560; x += 6) { const h = heightAt0(x, z); if (h > sm.h) sm = { x, z, h }; }
  sm.h -= 2;
  flattenDisc(sm.x, sm.z, 12, sm.h, 14);
  const nSummit = node('summit', sm.x, sm.z, { name: 'Greyspine Lookout' });
  fixedPin.set(nSummit, sm.h);
  // the top of the Copper Hills (a viewpoint)
  let hm = { x: 560, z: 420, h: -1e9 };
  for (let z = 330; z <= 520; z += 6) for (let x = 330; x <= 900; x += 6) {
    if (riverDist(x, z) < 120) continue;
    const h = heightAt0(x, z); if (h > hm.h) hm = { x, z, h };
  }
  hm.h -= 1.5;
  flattenDisc(hm.x, hm.z, 10, hm.h, 12);
  const nHillTop = node('hilltop', hm.x, hm.z, { name: 'Copper Knoll' });
  fixedPin.set(nHillTop, hm.h);
  for (const n of [nFarmW, nJ, nSouth, nRust, nElder, ...elderLoop, nFordS, nFordN]) n.y = undefined;

  const G_ = gate;
  const EDGES = [
    // streets first (they are the towns' own ground), then the made roads, then the rough ways
    // highways
    [G_.marrow_flats_n, BR.lindell.s, 'highway'], [BR.lindell.s, BR.lindell.n, 'bridge'], [BR.lindell.n, G_.port_lindell_s, 'highway'],
    [G_.port_lindell_e, nJ, 'highway'], [nJ, BR.gorge.n, 'highway'], [BR.gorge.n, BR.gorge.s, 'bridge'], [BR.gorge.s, G_.copperton_n, 'highway'],
    [G_.marrow_flats_e, nSouth, 'highway'], [nSouth, G_.copperton_w, 'highway'],
    // lanes
    [nJ, nFoot, 'lane'], [nFoot, nTop, 'switchback'], [nTop, G_.highgate_s, 'lane'],
    [nSouth, nApron, 'lane'], [G_.copperton_s, nLaunch, 'lane'],
    [G_.copperton_e, BR.east.s, 'lane'], [BR.east.s, BR.east.n, 'bridge'], [BR.east.n, nRust, 'lane'],
    // mountain (gravel) roads: the router has to zig-zag to stay under their grade
    [G_.highgate_n, nSummit, 'mountain', { biomeMul: 0.1 }], [G_.port_lindell_w, nElder, 'mountain'],
    // dirt
    [nElder, elderLoop[0], 'dirt'], [elderLoop[0], elderLoop[1], 'dirt'], [elderLoop[1], elderLoop[2], 'dirt'], [elderLoop[2], elderLoop[3], 'dirt'], [elderLoop[3], nElder, 'dirt'],
    ...campNodes.map(n => [nRust, n, 'dirt', { biomeMul: 0.1 }]),
    [nJ, nFordN, 'dirt'], [nFordN, nFordS, 'dirt', { ford: true }], [nFordS, nSouth, 'dirt'],
    [G_.marrow_flats_w, nFarmW, 'dirt'], [G_.marrow_flats_w, nFarmYard, 'dirt'],
    [G_.copperton_n, nHillTop, 'dirt'], [G_.highgate_e, nTop, 'dirt'],
  ];
  // town streets become roads too (first, so everything else pins to them)
  const streetEdges = [];
  for (const c of cities) c.streets.forEach((s, q) => streetEdges.push({ c, s, q }));

  const roads = [], graphEdges = [];
  const waterFloor = (x, z) => {
    const i = colOf(x), k = colOf(z) * DIM + i;
    if (rFord[i] > 0.3 && riverDist(x, z) < riverHalfW(x) + 18) return -Infinity;
    let f = -Infinity;
    if (riverDist(x, z) < riverHalfW(x) + 8) f = Math.max(f, rL[i] + 0.8);
    if (lakeD(x, z) < LK.r + 12) f = Math.max(f, LAKE_LEVEL + 0.8);
    void k;
    return f;
  };
  const carve = createCarve(DIM, CELL, SIZE);
  const pinOf = (n) => (fixedPin.has(n) ? fixedPin.get(n) : (n.pinned ? n.y : (n.y = bilinear(heights, n.x, n.z), n.pinned = true, n.y)));
  // the switchback goes before the lanes, so the lane that reaches its foot pins onto it rather than cutting across it
  const rank = (kind) => ({ street: 0, highway: 1, bridge: 1, switchback: 1.5, lane: 2, mountain: 3, dirt: 4 }[kind] ?? 5);
  const built = [];
  // streets
  for (const { c, s, q } of streetEdges) {
    const pts = resample(s.pts, 2);
    const prof = new Float32Array(pts.length).fill(c.y);
    const road = { cls: 'street', kind: 'street', from: c.id, to: c.id + '_street' + q, halfW: ROAD_CLASSES.street.halfW, pts, prof, ford: false, town: c.id, main: s.main };
    carve.carve(heights, road, built.length, noCarve);
    built.push(road);
  }
  lap('router+streets');
  yield { progress: 0.58, label: 'laying the roads' };
  // rough roads already laid (mountain + dirt), by 8 m bucket: a later one that runs along an earlier one takes the
  // earlier one's line (they were routed onto the same grid cells but wander differently where they part)
  const roughPts = new Map();
  const snapToBuilt = (pts) => pts.map(([x, z]) => {
    const gi = Math.floor(x / 8), gj = Math.floor(z / 8);
    let bd = 1e9, bx = 0, bz = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const L = roughPts.get((gi + di) * 8192 + gj + dj); if (!L) continue;
      for (let q = 0; q < L.length; q += 2) { const dx = L[q] - x, dz = L[q + 1] - z, d = dx * dx + dz * dz; if (d < bd) { bd = d; bx = L[q]; bz = L[q + 1]; } }
    }
    if (bd > 81) return [x, z];
    const w = 1 - smoothstep(3, 9, Math.sqrt(bd));
    return [x + (bx - x) * w, z + (bz - z) * w];
  });
  const order = EDGES.map((e, i) => i).sort((p, q) => rank(EDGES[p][2]) - rank(EDGES[q][2]) || p - q);
  const routeMs = {};
  let road_fallbacks = 0;
  for (const ei of order) {
    const [a, b, kind, o = {}] = EDGES[ei];
    const tr = now();
    let pts, prof, cls = kind;
    if (kind === 'bridge') {
      const deckY = fixedPin.get(a);
      pts = resample([[a.x, a.z], [b.x, b.z]], 2);
      prof = new Float32Array(pts.length).fill(deckY);
      cls = 'highway';
      if (a.id.startsWith('east')) cls = 'lane';
    } else if (kind === 'switchback') {
      pts = sb.pts.map(p => [p[0], p[1]]);
      prof = Float32Array.from(sb.prof);
      cls = 'lane';
    } else {
      const C2 = ROAD_CLASSES[cls];
      const ro = { cls, allowWater: allowFord, biomeMul: o.biomeMul, heur: 1.1, box: 360, reuse: cls === 'dirt' ? 0.8 : 0.45 };
      let grid = router.route(a.x, a.z, b.x, b.z, ro);
      if (!grid) grid = router.route(a.x, a.z, b.x, b.z, { ...ro, maxGrade: C2.maxGrade * 1.6 });
      if (!grid) grid = router.route(a.x, a.z, b.x, b.z, { ...ro, maxGrade: 3 });
      road_fallbacks += grid ? 0 : 1;
      if (!grid) grid = [[a.x, a.z], [b.x, b.z]];
      grid = unloop(grid);
      router.markUsed(grid);
      pts = resample(chaikin(grid, 3), 2);
      // gravel and dirt roads: the router's 16 m grid leaves ruler-straight runs; let them wander a little
      if (cls === 'mountain' || cls === 'dirt') pts = resample(snapToBuilt(meander(pts, S + 404, cls === 'mountain' ? 7 : 5)), 2);
      if (o.ford) prof = Float32Array.from(pts.map(p => bilinear(heights, p[0], p[1])));
      else {
        prof = profile(pts, (x, z) => bilinear(heights, x, z), { pinA: pinOf(a), pinB: pinOf(b), smooth: C2.smooth, clamp: C2.clamp, floorAt: waterFloor, cones: true });
        prof = carve.pinToRoads(heights, pts, prof, C2.clamp);
      }
    }
    const road = { cls, kind, from: a.id, to: b.id, halfW: ROAD_CLASSES[cls].halfW, pts, prof, ford: !!o.ford };
    if (cls === 'mountain' || cls === 'dirt') for (const p of pts) { const key = Math.floor(p[0] / 8) * 8192 + Math.floor(p[1] / 8); if (!roughPts.has(key)) roughPts.set(key, []); roughPts.get(key).push(p[0], p[1]); }
    if (kind !== 'bridge') carve.carve(heights, road, built.length, noCarve, !!o.ford);
    built.push(road);
    routeMs[a.id + '>' + b.id] = Math.round(now() - tr);
  }
  built.forEach((r, i) => { r.id = i; roads.push(r); if (r.kind !== 'street') graphEdges.push({ a: r.from, b: r.to, road: i }); });
  for (const n of nodes) n.y = fixedPin.has(n) ? fixedPin.get(n) : bilinear(heights, n.x, n.z);
  // the ford bed stays under water whatever a road did next to it
  (() => {   // own closure: see the masks loop
  for (let i = 0; i < DIM; i++) {
    if (rFord[i] <= 0) continue;
    for (let j = 0; j < DIM; j++) {
      const k = j * DIM + i, d = Math.abs(xOf(j) - rz[i]) * rk[i];
      if (d < rW[i] * (1 + 0.6 * rFord[i]) + 2) heights[k] = Math.min(heights[k], rL[i] - 0.3);
    }
  }
  })();
  const roadDist = carve.bestD;
  lap('roads');

  // giant fallen logs in the Elderwood: half buried in an earth berm, so a car can climb over them
  yield { progress: 0.68, label: 'felling the giants' };
  const giantLogs = [];
  for (let t = 0; t < 80 && giantLogs.length < 9; t++) {
    const a = rng() * TAU, rr = Math.sqrt(rng()) * C.giantwood.r * 0.8;
    const x = C.giantwood.x + rr * dcos(a), z = C.giantwood.z + rr * dsin(a);
    const yaw = rng() * TAU, len = 26 + rng() * 14, r = 1.1 + rng() * 0.35;
    const fx = dsin(yaw), fz = dcos(yaw);
    let ok = biome[nearestK(x, z)] === B.c_giantwood;
    for (let s = -0.6; s <= 0.6 && ok; s += 0.2) {
      const px = x + fx * len * s, pz = z + fz * len * s, k = nearestK(px, pz);
      if (roadDist[k] < 6 || !Number.isNaN(water[k]) || slopeAt0(px, pz) > 0.25) ok = false;
    }
    for (const g of giantLogs) if ((g.x - x) * (g.x - x) + (g.z - z) * (g.z - z) < 60 * 60) ok = false;
    if (!ok) continue;
    const y = Math.min(heightAt0(x + fx * len / 2, z + fz * len / 2), heightAt0(x - fx * len / 2, z - fz * len / 2), heightAt0(x, z));
    const top = y + r * 0.55 + r;               // centre sits r * 0.55 above the lowest ground; top = centre + r
    // the berm: ground rises to (top - 0.35 m) along the log, easing out over 7 m either side
    const berm = top - 0.35;
    forDisc(x, z, len / 2 + 9, (k, px, pz) => {
      const ax = px - x, az = pz - z;
      const along = ax * fx + az * fz, across = Math.abs(ax * fz - az * fx);
      if (Math.abs(along) > len / 2 + 1) return;
      const w = 1 - smoothstep(r * 0.6, r + 7, across);
      const endFade = 1 - smoothstep(len / 2 - 3, len / 2 + 1, Math.abs(along));
      const target = lerp(heights[k], Math.max(heights[k], berm), w * endFade);
      heights[k] = target;
    });
    giantLogs.push({ x, z, y, yaw, len, r });
  }
  lap('logs');

  // ------------------------------------------------------------------------------------------------------------------
  // 6. water
  yield { progress: 0.72, label: 'filling the river' };
  water.fill(NaN);
  (() => {   // own closure: see the masks loop
  for (let j = 0; j < DIM; j++) {
    const z = xOf(j);
    for (let i = 0; i < DIM; i++) {
      const k = j * DIM + i, h = heights[k];
      const d = Math.abs(z - rz[i]) * rk[i];
      if (d < rW[i] * (1 + 0.6 * rFord[i]) + 18 && h < rL[i]) { water[k] = rL[i]; continue; }
      if (h < LAKE_LEVEL && Math.abs(xOf(i) - LK.x) < LK.r + 150 && Math.abs(z - lakeZ) < LK.r + 150 && lakeD(xOf(i), z) < LK.r + 40) water[k] = LAKE_LEVEL;
    }
  }
  })();

  // 7. surfaces
  yield { progress: 0.76, label: 'painting the ground' };
  (() => {   // own closure: see the masks loop
  for (let j = 0; j < DIM; j++) {
    const z = xOf(j);
    for (let i = 0; i < DIM; i++) {
      const x = xOf(i), k = j * DIM + i;
      const h = heights[k];
      const hx = heights[k + (i < DIM - 1 ? 1 : 0)] - heights[k - (i > 0 ? 1 : 0)];
      const hz = heights[k + (j < DIM - 1 ? DIM : 0)] - heights[k - (j > 0 ? DIM : 0)];
      const g = Math.sqrt(hx * hx + hz * hz) / (2 * CELL);
      const b = biome[k];
      const rd = roadDist[k], ri = carve.bestR[k];
      let s;
      if (!Number.isNaN(water[k])) s = water[k] - h < 0.8 ? SURF.shallows : SURF.gravel;
      else if (ri >= 0 && rd <= 0) s = ROAD_CLASSES[roads[ri].cls].surface;
      else if (ri >= 0 && rd < 0.9 && (roads[ri].cls === 'highway' || roads[ri].cls === 'lane')) s = SURF.gravel;
      else if (paint[k] === 1) s = SURF.concrete;     // yards, plazas, the runway, the apron, the launch pad
      else if (paint[k] === 2) s = SURF.gravel;
      else if (paint[k] === 3) s = SURF.grass;
      else if (paint[k] === 4) s = SURF.farm;
      else if (paint[k] === 5) s = g > 0.62 ? SURF.rock : fbm(x * 0.045, z * 0.045, S + 101, 2) > 0.55 ? SURF.dirt : SURF.gravel;   // road banks
      else if (paint[k] === 6) s = SURF.asphalt;       // hairpin bowls
      else {
        const n1 = fbm(x * 0.045, z * 0.045, S + 101, 2);
        switch (b) {
          case B.c_mountain: {
            const line = 225 + 25 * fbm(x * 0.008, z * 0.008, S + 103, 3);
            s = g > 0.7 ? SURF.rock : h > line ? SURF.snow : g > 0.45 ? (n1 > 0.5 ? SURF.gravel : SURF.rock) : (n1 > 0.62 ? SURF.dirt : SURF.grass);
            break;
          }
          case B.c_badlands: s = g > 0.4 ? SURF.rock : n1 > 0.62 ? SURF.sand : n1 < 0.3 ? SURF.gravel : SURF.dirt; break;
          case B.c_gorge: s = g > 0.5 ? SURF.rock : SURF.gravel; break;
          case B.c_plateau: s = g > 0.6 ? SURF.rock : n1 > 0.7 ? SURF.dirt : SURF.grass; break;
          case B.c_giantwood: case B.c_forest: s = g > 0.6 ? SURF.rock : n1 > 0.64 ? SURF.dirt : SURF.grass; break;
          case B.c_hills: s = g > 0.62 ? SURF.rock : n1 > 0.7 ? SURF.dirt : SURF.grass; break;
          case B.c_shore: { const dl = lakeD(x, z) - LK.r; s = dl < 18 ? (n1 > 0.45 ? SURF.sand : SURF.gravel) : SURF.grass; break; }
          case B.river: { const d = riverDist(x, z) - riverHalfW(x); s = d < 7 ? (n1 > 0.48 ? SURF.gravel : SURF.mud) : SURF.grass; break; }
          case B.c_farm: s = SURF.grass; break;
          default: s = n1 > 0.74 ? SURF.dirt : SURF.grass;
        }
        // scree aprons at cliff feet (2c): loose broken rock
        if (scree[k] && s !== SURF.snow && g < 0.95 && (b === B.c_mountain || b === B.c_badlands || b === B.c_hills || b === B.c_forest)) s = SURF.gravel;
        if (g > 1.0 && s !== SURF.sand) s = SURF.rock;
      }
      surface[k] = s;
    }
  }
  })();
  lap('water+surfaces');

  // ------------------------------------------------------------------------------------------------------------------
  // 8. the world object, then everything placed on it
  const world = {
    seed, map: 'county', name: 'Wayfare County', size: SIZE, cell: CELL, dim: DIM,
    heights, surface, biome, water, roadDist,
    waterLevel: -50,
    heightAt: (x, z) => bilinear(heights, x, z),
    normalAt(x, z, out) {
      const e = 1.0;
      const hx = bilinear(heights, x + e, z) - bilinear(heights, x - e, z);
      const hz = bilinear(heights, x, z + e) - bilinear(heights, x, z - e);
      const nx = -hx / (2 * e), nz = -hz / (2 * e);
      const l = Math.sqrt(nx * nx + 1 + nz * nz);
      if (out) { out.x = nx / l; out.y = 1 / l; out.z = nz / l; return out; }
      return [nx / l, 1 / l, nz / l];
    },
    slopeAt(x, z) { const n = this.normalAt(x, z); return 1 - n[1]; },
    surfaceIdAt: (x, z) => surface[nearestK(x, z)],
    surfaceAt: (x, z) => SURFACES[surface[nearestK(x, z)]],
    biomeIdAt: (x, z) => biome[nearestK(x, z)],
    biomeAt: (x, z) => BIOMES[biome[nearestK(x, z)]].label,
    waterAt: (x, z) => waterAtImpl(x, z),
    roadDistAt: (x, z) => roadDist[nearestK(x, z)],
  };

  yield { progress: 0.82, label: 'building the towns' };
  const objects = [];
  const addObj = (o) => { o.id = objects.length; objects.push(o); return o; };
  const sites = {
    home: null, flags: [], pads: [], ramps: [], bridges: [], labels: [],
    cities: [], places: [], shops: [], farms: null, fireRisk: [], rustwild: null, airport: null, runway: null, launch: null, survey: [],
  };

  // bridges: deck, rails, piers (straight north-south decks)
  for (const b of bridgeNodes) {
    const len = Math.abs(b.n.z - b.s.z), mz = (b.s.z + b.n.z) / 2, w = b.high ? 9.6 : 9.2;
    const deck = addObj({ kind: 'bridge_deck', x: b.x, y: b.deckY - 0.5, z: mz, yaw: 0, s: 1,
      shape: { t: 'box', hx: w / 2, hy: 0.25, hz: len / 2 + 1 }, breakAt: null, mass: 0, fall: 'topple', look: 'deck' });
    for (const side of [-1, 1]) addObj({ kind: 'bridge_rail', x: b.x + side * (w / 2 - 0.12), y: b.deckY, z: mz, yaw: 0, s: 1,
      shape: { t: 'box', hx: 0.12, hy: 0.55, hz: len / 2 }, breakAt: null, mass: 0, fall: 'topple', look: 'rail' });
    const nPier = b.high ? 3 : 2;
    for (let q = 0; q < nPier; q++) {
      const t = nPier === 2 ? (q ? 0.22 : -0.22) : (q - 1) * 0.3;
      const pz = mz + t * len;
      const bed = Math.min(heightAt0(b.x - w / 2, pz), heightAt0(b.x + w / 2, pz), heightAt0(b.x, pz)) - 1.5;
      if (b.deckY - 0.5 - bed < 1) continue;
      addObj({ kind: 'bridge_pier', x: b.x, y: bed, z: pz, yaw: 0, s: 1,
        shape: { t: 'box', hx: w / 2 - 0.6, hy: (b.deckY - 0.5 - bed) / 2, hz: b.high ? 1.4 : 0.8 }, breakAt: null, mass: 0, fall: 'topple', look: 'pier' });
    }
    sites.bridges.push({ x0: b.x, z0: b.s.z, x1: b.x, z1: b.n.z, w, y: b.deckY, id: deck.id, name: b.name, high: !!b.high });
  }

  // buildings
  const building = (x, z, hx, hz, h, role, o = {}) => {
    const y = Math.min(heightAt0(x - hx, z - hz), heightAt0(x + hx, z - hz), heightAt0(x - hx, z + hz), heightAt0(x + hx, z + hz), heightAt0(x, z)) - 0.15;
    return addObj({ kind: 'building', x: r2(x), y: r2(y), z: r2(z), yaw: 0, s: 1, shape: { t: 'box', hx: r2(hx), hy: r2(h / 2 + 0.15), hz: r2(hz) },
      breakAt: null, mass: 0, fall: 'topple', look: 'building', role, roof: o.roof || 'flat', colour: o.colour || [0.8, 0.78, 0.72],
      roofColour: o.roofColour || [0.32, 0.3, 0.3], floors: o.floors || Math.max(1, Math.round(h / 3.4)), windows: o.windows ?? true, town: o.town });
  };
  for (const c of cities) {
    const ids = c.buildings.map(bd => building(bd.x, bd.z, bd.hx, bd.hz, bd.h, bd.role, { ...bd, town: c.id }).id);
    sites.cities.push({ id: c.id, name: c.name, x: c.x, z: c.z, y: c.y, hx: c.ux + 5, hz: c.uz + 5,
      gates: Object.fromEntries(Object.entries(c.gates).map(([s, p]) => [s, { x: p[0], z: p[1], node: c.id + '_' + s }])) });
    for (const p of c.places) {
      const id = c.id + '_' + p.kind;
      const place = { id, kind: p.kind, city: c.id, name: c.name + ' ' + PLACE_LABELS[p.kind], x: r2(p.x), z: r2(p.z), y: c.y, yaw: p.yaw, r: p.r, building: ids[p.building] };
      if (p.yard) place.yard = { x0: r2(p.yard.x0), z0: r2(p.yard.z0), x1: r2(p.yard.x1), z1: r2(p.yard.z1) };
      if (p.door) place.door = { x: r2(p.door[0]), z: r2(p.door[1]) };
      place._slots = p.padSlots;
      sites.places.push(place);
    }
  }
  // the farm: a barn, a hay barn, hay bales
  const barn = building(barnSpot.x - 12, barnSpot.z - 8, 11, 8, 9, 'barn', { roof: 'gable', colour: [0.62, 0.18, 0.14], roofColour: [0.30, 0.28, 0.26], windows: false, town: 'marrow_flats' });
  const hayBarn = building(barnSpot.x + 16, barnSpot.z - 10, 8, 6, 6, 'hay_barn', { roof: 'flat', colour: [0.56, 0.44, 0.30], windows: false, town: 'marrow_flats' });
  const bales = [];
  for (let q = 0; q < 8; q++) bales.push(addObj(propAt('hay_bale', barnSpot.x + 12 + (q % 4) * 2.0, barnSpot.z + 10 + Math.floor(q / 4) * 2.2, rng() * TAU)));
  // the airfield
  const hangars = [];
  for (let q = 0; q < 3; q++) {
    const hx = apron.x0 + 50 + q * 70;
    hangars.push(building(hx, apron.z0 - 20, 26, 16, 13, 'hangar', { roof: 'gable', colour: [0.70, 0.72, 0.74], roofColour: [0.50, 0.54, 0.58], windows: false }));
  }
  const tower = building(apron.x1 + 30, apron.z0 + 6, 4, 4, 20, 'control_tower', { colour: [0.86, 0.86, 0.84] });
  const jump = building(apron.x0 + 250, apron.z0 - 16, 9, 7, 8, 'jump_point', { colour: [0.92, 0.62, 0.20], roofColour: [0.30, 0.30, 0.32] });
  // the launch site: a tower beside the pad, a block house at the edge
  const launchTower = building(LC.x + 16, LC.z, 3, 3, 46, 'launch_tower', { colour: [0.72, 0.30, 0.22], windows: false });
  const bunker = building(LC.x - 40, LC.z + 36, 9, 6, 4, 'launch_control', { colour: [0.66, 0.66, 0.62] });
  // raider camps: a couple of shacks and loose junk
  for (const c of camps) {
    c.buildings = [];
    for (let q = 0; q < 3; q++) {
      const hx = 3 + rng() * 2, hz = 2.5 + rng() * 1.5, h = 3 + rng() * 1.5, a0 = (q / 3) * TAU + rng() * 0.6, rr = 13 + rng() * 5;
      // turn round the clearing until the shack is off the track that runs into the camp
      for (let t = 0; t < 12; t++) {
        const a = a0 + t * 0.52, x = c.x + rr * dcos(a), z = c.z + rr * dsin(a);
        let clear = true;
        for (let dz = -hz - 2; dz <= hz + 2 && clear; dz += 1) for (let dx = -hx - 2; dx <= hx + 2; dx += 1) if (roadDist[nearestK(x + dx, z + dz)] < 1) { clear = false; break; }
        // and off the shacks already standing here
        for (const id of c.buildings) { const o = objects[id]; if (Math.abs(o.x - x) < o.shape.hx + hx + 1.5 && Math.abs(o.z - z) < o.shape.hz + hz + 1.5) clear = false; }
        if (!clear) continue;
        c.buildings.push(building(x, z, hx, hz, h, 'raider_shack', { colour: [0.46, 0.36, 0.28], roofColour: [0.36, 0.30, 0.26], windows: false, town: c.id }).id);
        break;
      }
    }
    for (let q = 0; q < 4; q++) addObj(propAt(q % 2 ? 'barrel' : 'crate', c.x + (rng() - 0.5) * 12, c.z + (rng() - 0.5) * 12, rng() * TAU));
    // the shacks as plain boxes for the room's combat referee (raider shots stop on them): [{ x, z, hx, hz, y0, y1 }]
    c.cover = c.buildings.map(id => { const o = objects[id]; return { x: o.x, z: o.z, hx: o.shape.hx, hz: o.shape.hz, y0: o.y, y1: r2(o.y + o.shape.hy * 2) }; });
  }
  // the giant logs
  for (const g of giantLogs) {
    addObj({ kind: 'log', x: r3(g.x), y: r3(g.y), z: r3(g.z), yaw: r3(g.yaw), s: r3(g.r / KINDS.log.r), look: 'log', breakAt: null,
      mass: Math.round(600 * 3.1416 * g.r * g.r * g.len), fall: 'topple', giant: true,
      shape: { t: 'box', hx: r3(g.r), hy: r3(g.r * 0.92), hz: r3(g.len / 2), lift: r3(g.r * 0.55), round: 'z' } });
  }
  // kickers on the dirt tracks
  const addRamp = (x, z, yaw, len, h, w = 4.4) => {
    const y = Math.min(world.heightAt(x, z), world.heightAt(x + dsin(yaw) * len / 2, z + dcos(yaw) * len / 2),
      world.heightAt(x - dsin(yaw) * len / 2, z - dcos(yaw) * len / 2)) - 0.05;
    const o = addObj({ kind: 'ramp', x: r2(x), y, z: r2(z), yaw, s: 1, shape: { t: 'wedge', hx: w / 2, hy: h / 2, hz: len / 2 }, breakAt: null, mass: 0, fall: 'topple', look: 'ramp' });
    sites.ramps.push({ x: r2(x), z: r2(z), yaw, len, h, id: o.id });
  };
  for (const [x0, z0, yaw] of [[900, -380, 0.6], [1180, -760, 2.4], [1000, -1000, -0.8], [-1000, -330, 1.9], [-1180, -560, 0.3], [20, 700, 1.1]]) {
    const p = findOpen(x0, z0, 60, 6);
    if (p) addRamp(p.x, p.z, yaw, 6, 1.4);
  }
  // white guard posts round the outside of every switchback hairpin (the drop side), ~4 m apart
  for (const b of sb.bowls) {
    const ro = b.r + ROAD_CLASSES.lane.halfW + 1.2, n = Math.floor((ro * 2.8) / 4);
    for (let q = 0; q <= n; q++) {
      const t = -1.4 + (2.8 * q) / n, ct = dcos(t), st = dsin(t);
      const ux = b.ux * ct - b.uz * st, uz = b.ux * st + b.uz * ct;
      const x = b.x + ux * ro, z = b.z + uz * ro, k = nearestK(x, z);
      if (roadDist[k] < 0.5 || roadDist[k] > 3.5 || !Number.isNaN(water[k])) continue;   // only where the road bends past
      addObj(propAt('guard_post', x, z, 0));
    }
  }
  // signposts at the junctions
  for (const n of [nJ, nSouth, nRust, nElder, BR.gorge.n, BR.lindell.n, nFoot]) {
    const p = findOpen(n.x + 8, n.z + 6, 14, 1.5, true);
    if (p) addObj(propAt('sign', p.x, p.z, rng() * TAU));
  }

  // pads: each garage's four, the depots' two, the airfield, the farm. Vehicle pads first, then props.
  const padAt = (x, z, yaw, vehicle, area, extra = {}) => { const p = { x: r2(x), z: r2(z), y: r2(world.heightAt(x, z)), yaw, vehicle, area, ...extra }; sites.pads.push(p); return sites.pads.length - 1; };
  const garageOrder = ['marrow_flats', 'port_lindell', 'highgate', 'copperton'];
  for (const cid of garageOrder) {
    const g = sites.places.find(p => p.city === cid && p.kind === 'garage');
    g.pads = g._slots.map((s, q) => padAt(s[0], s[1], 0, GARAGE_VEHICLES[cid][q % GARAGE_VEHICLES[cid].length], cid + '_garage'));
  }
  for (const cid of garageOrder) {
    const d = sites.places.find(p => p.city === cid && p.kind === 'depot');
    d.pads = d._slots.map((s, q) => padAt(s[0], s[1], 0, DEPOT_VEHICLES[q % DEPOT_VEHICLES.length], cid + '_depot'));
  }
  const planePad = padAt(rwy.x0 + 26, rwy.z, Math.PI / 2, 'airplane', 'airfield');
  const heliPad = padAt(apron.x0 + 40, (apron.z0 + apron.z1) / 2 + 8, 0, 'helicopter', 'airfield');
  const harvPads = [padAt(barnSpot.x - 28, barnSpot.z + 16, 0, 'harvester', 'farm'), padAt(barnSpot.x - 10, barnSpot.z + 16, 0, 'harvester', 'farm')];
  for (const p of sites.places) delete p._slots;
  // props: crates at every depot, a few at the farm
  for (const cid of garageOrder) {
    const d = sites.places.find(p => p.city === cid && p.kind === 'depot');
    for (let q = 0; q < 3; q++) padAt(d.yard.x1 - 4 - q * 1.4, d.yard.z0 + 3, 0, 'crate', cid + '_depot', { prop: true });
  }
  const mfg = sites.places.find(p => p.id === 'marrow_flats_garage');
  sites.home = { x: mfg.x, z: mfg.z, r: 12, y: mfg.y, city: 'marrow_flats', place: mfg.id };

  // shops (the places a player buys at)
  for (const p of sites.places) if (['garage', 'outfitter', 'supply', 'market'].includes(p.kind)) {
    sites.shops.push({ id: p.id, kind: p.kind === 'garage' ? 'dealer' : p.kind, place: p.id, city: p.city, name: p.name, x: p.x, z: p.z, y: p.y, yaw: p.yaw, r: p.r });
  }
  // the farms
  sites.farms = { town: 'marrow_flats', plots, barn: { x: barnSpot.x - 12, z: barnSpot.z - 8, y: hBarn, building: barn.id, hayBarn: hayBarn.id },
    yard: { x: barnSpot.x, z: barnSpot.z, hx: 40, hz: 30, y: hBarn }, market: 'marrow_flats_market', pads: harvPads, bales: bales.map(b => b.id) };
  // fire risk: barns, hay, houses, grass
  let fr = 0;
  const risk = (kind, x, z, r, extra = {}) => sites.fireRisk.push({ id: 'fire_' + (++fr), kind, x: r2(x), z: r2(z), y: r2(world.heightAt(x, z)), r, ...extra });
  risk('barn', barn.x, barn.z, 14, { obj: barn.id, town: 'marrow_flats' });
  risk('barn', hayBarn.x, hayBarn.z, 10, { obj: hayBarn.id, town: 'marrow_flats' });
  risk('hay', barnSpot.x + 15, barnSpot.z + 11, 8, { objs: bales.map(b => b.id), town: 'marrow_flats' });
  const houses = objects.filter(o => o.kind === 'building' && o.role === 'house');
  for (let q = 0; q < houses.length && q < 40; q += Math.max(1, Math.floor(houses.length / 10))) risk('house', houses[q].x, houses[q].z, Math.max(houses[q].shape.hx, houses[q].shape.hz) + 4, { obj: houses[q].id, town: houses[q].town });
  for (const p of plots.slice(0, 4)) risk('crop', p.x, p.z, Math.min(p.w, p.h) / 2, { plot: p.id, town: 'marrow_flats' });
  for (const [x0, z0] of [[-300, 500], [200, 780], [-200, -420], [300, -250], [900, 900], [-900, 500]]) {
    const p = findOpen(x0, z0, 80, 8);
    if (p && surface[nearestK(p.x, p.z)] === SURF.grass) risk('grass', p.x, p.z, 16);
  }
  // the Rustwild
  sites.rustwild = { name: 'Rustwild', poly: [[470, -260], [1536, -260], [1536, -1536], [860, -1536], [620, -1180], [470, -700]],
    camps, gate: { x: nRust.x, z: nRust.z } };
  // the airfield
  sites.runway = { x0: rwy.x0, z0: rwy.z, x1: rwy.x1, z1: rwy.z, w: rwy.w, y: hAir };
  sites.airport = { name: AP.name, y: hAir, runway: sites.runway, taxiway: { x0: twy.x0, z0: twy.z, x1: twy.x1, z1: twy.z, w: twy.w, y: hAir },
    apron: { x0: apron.x0, z0: apron.z0, x1: apron.x1, z1: apron.z1, y: hAir }, hangars: hangars.map(h => ({ x: h.x, z: h.z, building: h.id })),
    tower: tower.id, pads: [planePad, heliPad],
    jumpPoint: { x: jump.x, z: r2(jump.z + jump.shape.hz + 5), y: hAir, yaw: 0, r: 6, building: jump.id } };
  sites.places.push({ id: 'wayfare_field_jump_point', kind: 'jump_point', city: null, name: 'Jump Point', x: sites.airport.jumpPoint.x, z: sites.airport.jumpPoint.z, y: hAir, yaw: 0, r: 6, building: jump.id });
  // skydiving (M9): landing target rings on open, flat ground (no rng: the same spots every time) and the plateau the
  // glider level lands on (its rim is noisy by +-40 m, so `r` is the part that is surely on top)
  sites.skyTargets = [];
  for (const [id, name, x0, z0] of [['southmead', 'Southmead Ring', 120, 820], ['vale_green', 'Vale Green Ring', -60, 140], ['copperfoot', 'Copperfoot Ring', 620, 900], ['pebblerun', 'Pebblerun Ring', -230, 560]]) {
    const p = findOpen(x0, z0, 120, 14);
    if (p) sites.skyTargets.push({ id, name, x: r2(p.x), z: r2(p.z), y: r2(world.heightAt(p.x, p.z)), r: 30 });
  }
  sites.plateau = { name: PL.name, x: PL.x, z: PL.z, r: PL.r - 50, y: PL.top };
  sites.launch = { name: LC.name, x: LC.x, z: LC.z, y: hLaunch, r: LC.r, pad: { x: LC.x, z: LC.z, r: 18 }, tower: launchTower.id, control: bunker.id,
    road: roads.find(r => r.to === 'launch')?.id ?? null };
  // survey viewpoints
  const view = (id, name, kind, x, z) => sites.survey.push({ id, name, kind, x: r2(x), z: r2(z), y: r2(world.heightAt(x, z)) });
  view('greyspine_lookout', 'Greyspine Lookout', 'summit', sm.x, sm.z);
  for (const p of C.peaks) {
    // the true top near the peak's centre
    let pk = { x: p.x, z: p.z, h: -1e9 };
    for (let z = p.z - 160; z <= p.z + 160; z += 4) for (let x = p.x - 160; x <= p.x + 160; x += 4) { const h = heightAt0(x, z); if (h > pk.h) pk = { x, z, h }; }
    view(p.id, p.name, 'summit', pk.x, pk.z);
  }
  view('copper_knoll', 'Copper Knoll', 'summit', hm.x, hm.z);
  view('highgate_rim', 'Highgate Rim', 'rim', PL.x - PL.r * 0.55, PL.z + PL.r * 0.55);
  view('gorge_rim', 'Gorge Overlook', 'rim', BR.gorge.x + 70, BR.gorge.n.z - 6);
  let basin = null;
  for (let t = 0; t < 40 && !basin; t++) {
    const x = -250 + (t % 8) * 40, z = 420 + Math.floor(t / 8) * 40;
    if (slopeAt0(x, z) < 0.04 && roadDist[nearestK(x, z)] > 20 && Number.isNaN(water[nearestK(x, z)])) basin = { x, z };
  }
  if (basin) view('vale_basin', 'Vale Basin', 'basin', basin.x, basin.z);
  const mesa = camps.length ? { x: camps[2].x + 60, z: camps[2].z - 60 } : { x: 1200, z: -900 };
  view('rustwild_mesa', 'Redstep Mesa', 'mesa', mesa.x, mesa.z);

  // the scatter
  yield { progress: 0.88, label: 'planting the forests' };
  const exclusions = [
    ...cities.map(c => ({ x: c.x, z: c.z, hx: c.hx + 4, hz: c.hz + 4 })),
    { x: airRect.x, z: airRect.z, hx: airRect.hx + 6, hz: airRect.hz + 6 },
    { x: LC.x, z: LC.z, hx: LC.r + 6, hz: LC.r + 6 },
    ...plots.map(p => ({ x: p.x, z: p.z, hx: p.w / 2 + 3, hz: p.h / 2 + 3 })),
    { x: barnSpot.x, z: barnSpot.z, hx: 44, hz: 34 },
  ];
  const discs = [
    ...camps.map(c => ({ x: c.x, z: c.z, r: c.r + 8 })),
    ...bridgeNodes.flatMap(b => [{ x: b.s.x, z: b.s.z, r: 16 }, { x: b.n.x, z: b.n.z, r: 16 }]),
    ...sites.ramps.map(r => ({ x: r.x, z: r.z, r: r.len })),
    ...sites.survey.map(v => ({ x: v.x, z: v.z, r: 12 })),
    ...giantLogs.map(g => ({ x: g.x, z: g.z, r: g.len / 2 + 2 })),
  ];
  const { decor } = scatterObjects(world, { S, addObj, objects, exclusions, discs, nearestK,
    rules: COUNTY_SCATTER.biomes, decorRules: COUNTY_SCATTER.decor, density: COUNTY_SCATTER.density, step: COUNTY_SCATTER.step, decorStep: COUNTY_SCATTER.decorStep });
  lap('objects');

  // M8: the Rustwild Gate garage — just outside the zone beside the road in, flat and clear (a knocked-out raider-hunter
  // wakes up here; the gate's own buggies park here) — and a coarse 8 m height grid of the badlands for the room's
  // raiders (the room has no world, only sites). Nothing on the ground changes: no world hash moves.
  {
    const R = sites.rustwild, g = R.gate, P = R.poly;
    const inP = (x, z) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) if ((P[i][1] > z) !== (P[j][1] > z) && x < (P[j][0] - P[i][0]) * (z - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]) c = !c; return c; };
    let best = null;
    for (let r = 20; r <= 120 && !best; r += 4) for (let a = 0; a < 24 && !best; a++) {
      const x = g.x + r * Math.cos(a * Math.PI / 12), z = g.z + r * Math.sin(a * Math.PI / 12);
      if (inP(x, z) || inP(x, z - 12)) continue;
      const k = nearestK(x, z);
      if (!Number.isNaN(water[k]) || roadDist[k] < 5 || roadDist[k] > 18 || slopeAt0(x, z) > 0.05) continue;
      let clear = true;
      for (const o of objects) if (Math.abs(o.x - x) < 13 && Math.abs(o.z - z) < 13) { clear = false; break; }
      if (clear) best = { x: r2(x), z: r2(z) };
    }
    if (best) {
      best.y = r2(bilinear(heights, best.x, best.z)); best.yaw = r3(Math.atan2(g.x - best.x, g.z - best.z));
      R.garage = { ...best, name: 'Rustwild Gate Garage', r: 10 };
      sites.labels.push({ x: Math.round(best.x), z: Math.round(best.z + 16), text: 'Rustwild Gate Garage', kind: 'shop' });
    }
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of P) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const step = 8, nx = Math.floor((x1 - x0) / step) + 1, nz = Math.floor((z1 - z0) / step) + 1, h = new Array(nx * nz);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) h[j * nx + i] = Math.round(bilinear(heights, x0 + i * step, z0 + j * step) * 10) / 10;
    R.grid = { x0, z0, step, nx, nz, h };
  }

  // ------------------------------------------------------------------------------------------------------------------
  // 9. labels, graph, river description
  const lab = (x, z, text, kind = 'place') => sites.labels.push({ x: Math.round(x), z: Math.round(z), text, kind });
  for (const c of cities) lab(c.x, c.z - c.uz - 26, c.name, 'city');
  for (const [x, z, t] of REGION_LABELS) lab(x, z, t, 'region');
  lab(LK.x, lakeZ, LK.name, 'water');
  lab(-1300, riverZ(-1300) + 34, 'Tollen River', 'water');
  lab(1000, riverZ(1000) + 34, 'Tollen River', 'water');
  for (const b of sites.bridges) lab(b.x0 + 40, (b.z0 + b.z1) / 2, b.name, 'crossing');
  lab(C.ford.x + 40, rz[colOf(C.ford.x)], C.ford.name, 'crossing');
  lab(nJ.x + 20, nJ.z - 20, C.junction.name, 'place');
  for (const p of sites.places) if (p.city) lab(p.x, p.z + 10, PLACE_LABELS[p.kind], 'shop');
  lab(AP.x, AP.z + 40, AP.name, 'base');
  lab(LC.x, LC.z - LC.r - 14, LC.name, 'base');
  for (const c of camps) lab(c.x, c.z - 34, c.name, 'camp');
  for (const v of sites.survey) lab(v.x, v.z - 16, v.name, 'view');
  lab(barnSpot.x, barnSpot.z - 40, 'Marrow Barn', 'place');

  const river = { pts: [] };
  for (let i = 0; i < DIM; i += 4) river.pts.push([xOf(i), rz[i], rW[i] * (1 + 0.6 * rFord[i]), rL[i]]);
  world.sites = sites;
  world.labels = sites.labels;
  world.objects = objects;
  world.decor = decor;
  world.roads = roads.map(r => ({
    id: r.id, cls: r.cls, kind: r.kind, from: r.from, to: r.to, halfW: r.halfW, ford: r.ford, ...(r.town ? { town: r.town } : {}),
    pts: r.pts.map((p, i) => [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100, Math.round(r.prof[i] * 100) / 100]),
  }));
  world.roadGraph = { nodes: nodes.map(n => ({ id: n.id, x: r2(n.x), z: r2(n.z), y: r2(n.y), name: n.name, town: n.town })), edges: graphEdges };
  world.river = river;
  world.lakes = [{ x: LK.x, z: lakeZ, r: LK.r, level: LAKE_LEVEL, name: LK.name }];
  world.plateau = { x: PL.x, z: PL.z, r: PL.r, top: PL.top, name: PL.name };
  world.gorge = { x0: G.x0, x1: G.x1, name: 'Tollen Gorge' };
  // M7: where the emergency and haul jobs happen (js/world/county/job-spots.js; read by the job referees)
  sites.jobSpots = jobSpots({ roads: world.roads, heightAt: (x, z) => world.heightAt(x, z), waterAt: waterAtImpl, riverZ: x => rz[colOf(x)], gorge: G, cities: sites.cities });
  world.switchback = { pts: sb.pts.map(p => [r2(p[0]), r2(p[1])]), legs: sb.legs, hairpins: sb.bowls.map(b => ({ x: r2(b.x), z: r2(b.z), r: r2(b.r), y: r2(b.y) })), grade: r3((sb.prof[sb.prof.length - 1] - sb.footH) / sb.climbLen) };
  const byKind = {};
  for (const o of objects) byKind[o.kind] = (byKind[o.kind] || 0) + 1;
  lap('finish');
  world.stats = { ms: Math.round(now() - t0), steps: ms, routes: routeMs, straightRoads: road_fallbacks, objects: objects.length, decor: decor.length, byKind };
  yield { progress: 1, label: 'ready', world };
  return world;

  // ==================================================================================================================
  // helpers (closures over the arrays above)
  function bilinear(arr, x, z) { return countyBilinear(arr, x, z); }
  function nearestK(x, z) {
    const i = clamp(Math.round((x + HALF) / CELL), 0, DIM - 1), j = clamp(Math.round((z + HALF) / CELL), 0, DIM - 1);
    return j * DIM + i;
  }
  function slopeAt0(x, z) {
    const hx = bilinear(heights, x + 1, z) - bilinear(heights, x - 1, z), hz = bilinear(heights, x, z + 1) - bilinear(heights, x, z - 1);
    const nx = -hx / 2, nz = -hz / 2;
    return 1 - 1 / Math.sqrt(nx * nx + 1 + nz * nz);
  }
  function waterAtImpl(x, z) {
    const fx = clamp((x + HALF) / CELL, 0, DIM - 1.000001), fz = clamp((z + HALF) / CELL, 0, DIM - 1.000001);
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
    const k = j * DIM + i;
    const c = [water[k], water[k + 1], water[k + DIM], water[k + DIM + 1]];
    const wts = [(1 - tx) * (1 - tz), tx * (1 - tz), (1 - tx) * tz, tx * tz];
    let s = 0, w = 0;
    for (let q = 0; q < 4; q++) if (!Number.isNaN(c[q])) { s += c[q] * wts[q]; w += wts[q]; }
    if (w < 0.2) return null;
    const lvl = s / w;
    return lvl > bilinear(heights, x, z) ? lvl : null;
  }
  function propAt(kind, x, z, yaw) {
    const K = KINDS[kind];
    const y = bilinear(heights, x, z) - 0.03;
    const shape = K.hx ? { t: 'box', hx: K.hx, hy: K.hy, hz: K.hz } : { t: 'cyl', r: K.r, h: K.colH };
    return { kind, x: r3(x), y: r3(y), z: r3(z), yaw: r3(yaw), s: 1, shape, breakAt: K.breakAt ?? null, mass: K.mass || 0, fall: K.fall || 'topple', look: kind };
  }
  function findOpen(x0, z0, radius, clear, byRoad = false) {
    for (let r = 0; r <= radius; r += 3) {
      for (let a = 0; a < 12; a++) {
        const x = x0 + (r === 0 ? 0 : r * dcos(a * 0.5236)), z = z0 + (r === 0 ? 0 : r * dsin(a * 0.5236));
        const k = nearestK(x, z);
        if (!Number.isNaN(water[k]) || paint[k]) continue;
        if (byRoad ? (roadDist[k] < 1.2 || roadDist[k] > 6) : roadDist[k] < clear + 2) continue;
        if (slopeAt0(x, z) > 0.12) continue;
        let hit = false;
        for (const o of objects) if (o.kind === 'building' && Math.abs(o.x - x) < o.shape.hx + clear + 2 && Math.abs(o.z - z) < o.shape.hz + clear + 2) { hit = true; break; }
        if (!hit) return { x, z };
      }
    }
    return null;
  }
  function rectAvg(cx, cz, hx, hz) {
    let s = 0, c = 0;
    for (let dz = -hz; dz <= hz; dz += 8) for (let dx = -hx; dx <= hx; dx += 8) { s += bilinear(heights, cx + dx, cz + dz); c++; }
    return s / c;
  }
  function rectMin(cx, cz, r) { let m = 1e9; for (let dz = -r; dz <= r; dz += 4) for (let dx = -r; dx <= r; dx += 4) m = Math.min(m, bilinear(heights, cx + dx, cz + dz)); return m; }
  function rectMax(cx, cz, r) { let m = -1e9; for (let dz = -r; dz <= r; dz += 4) for (let dx = -r; dx <= r; dx += 4) m = Math.max(m, bilinear(heights, cx + dx, cz + dz)); return m; }
  function forDisc(cx, cz, r, fn) {
    const i0 = colOf(cx - r), i1 = colOf(cx + r), j0 = colOf(cz - r), j1 = colOf(cz + r);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = xOf(i), z = xOf(j), dx = x - cx, dz = z - cz;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d <= r) fn(j * DIM + i, x, z, d);
    }
  }
  function forRect(cx, cz, hx, hz, fn) {
    const i0 = colOf(cx - hx), i1 = colOf(cx + hx), j0 = colOf(cz - hz), j1 = colOf(cz + hz);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) fn(j * DIM + i, xOf(i), xOf(j));
  }
  function flattenRect(cx, cz, hx, hz, y, blend) {
    forRect(cx, cz, hx + blend, hz + blend, (k, x, z) => {
      const ex = Math.max(0, Math.abs(x - cx) - hx), ez = Math.max(0, Math.abs(z - cz) - hz);
      const d = Math.sqrt(ex * ex + ez * ez);
      heights[k] = lerp(y, heights[k], smoothstep(0, blend, d));
    });
  }
  function flattenDisc(cx, cz, r, y, blend) {
    forDisc(cx, cz, r + blend, (k, x, z, d) => { heights[k] = lerp(y, heights[k], smoothstep(r, r + blend, d)); });
  }
}

/**
 * Lay the switchback up the spur, the way a road is surveyed onto a hillside rather than drawn with a ruler.
 *
 * A walker starts at the spur's foot with the road at ground height and steps 2 m at a time. On a leg it heads across
 * the slope at the angle that makes the GROUND rise at the road's grade (sin a = grade / slope), nudged by how far the
 * road has drifted above or below the ground (above: aim a little more uphill; below: a little more across), and it
 * can only turn so fast (radius >= 45 m), so a leg curves with the land. When it nears the spur's flank (a different
 * distance for every leg) it turns uphill round a half-circle hairpin of radius 16-20 m at a gentle grade, and the
 * next leg runs back the other way. It stops when the road reaches the plateau's height and runs on, level, onto it.
 * Pure: dsin / dcos only. Returns { pts every 2 m, prof, legs, bowls: [{ x, z, r, y }], climbLen }.
 */
function traceSwitchback(SW, top, zR, zFoot, spurS, spurAxis, rng) {
  const ds = 2;
  const grad = (x, z) => [(spurS(x + 1, z) - spurS(x - 1, z)) / 2, (spurS(x, z + 1) - spurS(x, z - 1)) / 2];
  let x = spurAxis(zFoot) - SW.startX, z = zFoot - 6, dx = 1, dz = 0, sigma = 1;
  let r = spurS(x, z);
  const pts = [[x, z]], prof = [r], bowls = [];
  let legs = 1, legEnd = SW.legEnd[0] + rng() * (SW.legEnd[1] - SW.legEnd[0]) + 10;
  const kMax = ds / 45;                              // the most a leg turns per step (radians)
  /** The heading a leg running `sg` (+1 east, -1 west) wants here: across the slope, rising at the road's grade. */
  const desired = (x, z, r, sg, fallback) => {
    const [gx, gz] = grad(x, z);
    const gl = Math.sqrt(gx * gx + gz * gz);
    if (gl <= 0.02) return fallback;
    const ux = gx / gl, uz = gz / gl;                  // straight uphill
    let tx = -uz, tz = ux;                             // along the slope, pointed the way this leg runs
    if (tx * sg < 0) { tx = -tx; tz = -tz; }
    // how fast the ground under the road should rise: the road's grade, less a little when the road is below the
    // ground (just after a hairpin, which climbs far less than the slope it turns on — that leg starts in a cutting
    // and climbs out of it), more when above. Never more than gently downhill: a leg never doubles back.
    const want = SW.grade + 0.025 * (r - spurS(x, z));
    const sn = clamp(want / gl, -0.1, 0.85), cs = Math.sqrt(1 - sn * sn);
    return [tx * cs + ux * sn, tz * cs + uz * sn];
  };
  for (let step = 0; step < 4000 && r < top - 0.15; step++) {
    const u = x - spurAxis(z);
    // the last climb: once the road can reach the plateau's height by the crest at the rim, it heads there
    const ex = spurAxis(zR) - x, ez = zR - 24 - z, eD = Math.sqrt(ex * ex + ez * ez);
    const final = r + SW.grade * eD >= top - 0.5;
    if (!final && sigma * u > legEnd && pts.length > 10) {
      // the hairpin: round a circle on the uphill side until the heading lines up with the next leg (a leg that
      // arrives climbing diagonally needs less than a half turn; a full half turn sends it back downhill across itself)
      const [gx, gz] = grad(x, z);
      let nx = -dz, nz = dx;
      if (nx * gx + nz * gz < 0) { nx = -nx; nz = -nz; }
      const R = SW.R[0] + rng() * (SW.R[1] - SW.R[0]);
      const n = Math.round((3.141592653589793 * R) / ds), da = 3.141592653589793 / n;
      const turn = (nx === -dz && nz === dx) ? 1 : -1;
      const c = [x + nx * R, z + nz * R];
      const ca = dcos(da), sa = dsin(da) * turn;
      const y0 = r;
      sigma = -sigma;
      for (let q = 0; q < n * 1.2; q++) {
        const ndx = dx * ca - dz * sa, ndz = dx * sa + dz * ca;
        // step along the chord at the middle heading, so the walker stays on the circle
        x += (dx + ndx) / 2 * ds; z += (dz + ndz) / 2 * ds; dx = ndx; dz = ndz;
        r += SW.hairGrade * ds;
        pts.push([x, z]); prof.push(r);
        if (q >= n * 0.55) {
          const w = desired(x, z, r, sigma, [dx, dz]);
          if ((dx * w[1] - dz * w[0]) * turn <= 0) break;     // turned as far as the next leg wants
        }
      }
      bowls.push({ x: c[0], z: c[1], r: R, y: (y0 + r) / 2, ux: nx, uz: nz });   // u: from the entry toward the apex
      legs++;
      legEnd = SW.legEnd[0] + rng() * (SW.legEnd[1] - SW.legEnd[0]);
      continue;
    }
    const [wx, wz] = final ? [ex / eD, ez / eD] : desired(x, z, r, sigma, [dx, dz]);
    // turn toward it, no faster than kMax
    const cross = dx * wz - dz * wx, dot = dx * wx + dz * wz;
    let a = cross > 0 ? Math.min(kMax, Math.abs(cross)) : -Math.min(kMax, Math.abs(cross));
    if (dot < 0) a = cross >= 0 ? kMax : -kMax;
    const ca = dcos(a), sa = dsin(a);
    const ndx = dx * ca - dz * sa, ndz = dx * sa + dz * ca;
    const l = Math.sqrt(ndx * ndx + ndz * ndz);
    dx = ndx / l; dz = ndz / l;
    x += dx * ds; z += dz * ds;
    r = Math.min(top, r + SW.grade * ds);
    pts.push([x, z]); prof.push(r);
  }
  let climbLen = (pts.length - 1) * ds;
  // level onto the plateau: swing round to the north, then straight on
  for (let q = 0; q < 34; q++) {
    const cross = dx * -1 - dz * 0, dot = -dz;       // toward (0, -1)
    let a = Math.sign(cross) * Math.min(kMax * 1.5, Math.abs(cross));
    if (dot < 0) a = (cross >= 0 ? 1 : -1) * kMax * 1.5;
    const ca = dcos(a), sa = dsin(a);
    const ndx = dx * ca - dz * sa, ndz = dx * sa + dz * ca, l = Math.sqrt(ndx * ndx + ndz * ndz);
    dx = ndx / l; dz = ndz / l;
    x += dx * ds; z += dz * ds;
    pts.push([x, z]); prof.push(top);
  }
  return { pts, prof: Float32Array.from(prof), legs, bowls, climbLen };
}

/**
 * Take the loops out of a routed grid path. The router's search state is (cell, heading), so a path may come back
 * through a cell it already used (a knot in a hairpin) — carved, the two passes fight over the same ground and leave a
 * cliff across the road. Any point that comes back within 12 m of an earlier one (not its neighbour) cuts out
 * everything in between. Hairpin legs one grid cell (16 m) apart are left alone.
 */
function unloop(pts) {
  const out = pts.slice();
  const cross = (a, b, c, d) => {
    const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
  };
  for (let i = 0; i < out.length; i++) {
    for (let j = out.length - 1; j > i + 2; j--) {
      const dx = out[j][0] - out[i][0], dz = out[j][1] - out[i][1];
      if (dx * dx + dz * dz < 144) { out.splice(i + 1, j - i - 1); break; }
      // segment i..i+1 crosses segment j-1..j: keep i, jump to j
      if (j - 1 > i + 1 && cross(out[i], out[i + 1], out[j - 1], out[j])) { out.splice(i + 1, j - i - 1); break; }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Gradient noise for the mountains. Value noise (wmath fbm / ridged) interpolates random HEIGHTS on a square lattice,
// so its ridges run along the lattice and a range of it looks blocky from the air. Gradient noise interpolates random
// SLOPES (twelve directions, 30 degrees apart) instead. Integer hashes, + - * and floor only, like wmath: the same
// on every engine.
const GX = [1, 0.8660254037844386, 0.5, 0, -0.5, -0.8660254037844386, -1, -0.8660254037844386, -0.5, 0, 0.5, 0.8660254037844386];
const GZ = [0, 0.5, 0.8660254037844386, 1, 0.8660254037844386, 0.5, 0, -0.5, -0.8660254037844386, -1, -0.8660254037844386, -0.5];
function gdot(ix, iz, seed, fx, fz) {
  let h = (Math.imul(ix | 0, 374761393) + Math.imul(iz | 0, 668265263) + Math.imul(seed | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  const g = ((h ^ (h >>> 16)) >>> 0) % 12;
  return GX[g] * fx + GZ[g] * fz;
}
/** 2D gradient noise, about -0.7..0.7. */
export function gnoise(x, z, seed) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10), v = zf * zf * zf * (zf * (zf * 6 - 15) + 10);
  const a = gdot(xi, zi, seed, xf, zf), b = gdot(xi + 1, zi, seed, xf - 1, zf);
  const c = gdot(xi, zi + 1, seed, xf, zf - 1), d = gdot(xi + 1, zi + 1, seed, xf - 1, zf - 1);
  return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v;
}
/** Fractal gradient noise mapped to about 0..1 (centred on 0.5 like wmath fbm), octaves turned like ridgedG's. */
export function gfbm(x, z, seed, oct = 4) {
  let s = 0, a = 1, n = 0, px = x, pz = z;
  for (let i = 0; i < oct; i++) {
    s += gnoise(px, pz, seed + i * 1013) * a; n += a; a *= 0.5;
    const qx = (px * 0.8 - pz * 0.6) * 2.03 + 17.1, qz = (px * 0.6 + pz * 0.8) * 2.03 - 9.3;
    px = qx; pz = qz;
  }
  return 0.5 + 1.05 * s / n;
}
/** Ridged gradient noise, 0..1: sharp crests, each octave turned by (0.8, 0.6) = 36.87 degrees and 2.03x finer, an
 *  octave only showing where the one before it is high (so the valleys stay smooth and the crests get the detail). */
export function ridgedG(x, z, seed, oct = 5, gain = 0.5) {
  let s = 0, a = 1, n = 0, prev = 1, px = x, pz = z;
  for (let i = 0; i < oct; i++) {
    const g = gnoise(px, pz, seed + i * 7717) * 1.4;
    let v = 1 - Math.sqrt(g * g + 0.0036);           // a crest rounded over a few metres, not a knife edge
    if (v < 0) v = 0;
    v *= v;
    s += v * a * prev; n += a;
    prev = v < 1 ? v : 1;
    a *= gain;
    const qx = (px * 0.8 - pz * 0.6) * 2.03 + 17.1, qz = (px * 0.6 + pz * 0.8) * 2.03 - 9.3;
    px = qx; pz = qz;
  }
  return s / n;
}

/**
 * A routed road wanders sideways a few metres along its straight runs, so it reads as a road that grew round the land
 * rather than a line drawn between grid cells. The push comes from ONE displacement field over the whole county (low-
 * frequency noise, a bend every ~90 m), taken across the road at each point: two roads that share a way get the same
 * push and stay together (a per-road wander pulled shared tracks apart and carved steps between them). It fades out
 * over 40 m at both ends (junctions stay put) and wherever the road already turns hard (a hairpin keeps its shape).
 */
function meander(pts, seed, amp) {
  const n = pts.length;
  if (n < 30) return pts;
  const s = [0];
  for (let i = 1; i < n; i++) { const dx = pts[i][0] - pts[i - 1][0], dz = pts[i][1] - pts[i - 1][1]; s.push(s[i - 1] + Math.sqrt(dx * dx + dz * dz)); }
  const L = s[n - 1];
  // how hard the road turns round each point (over +-12 m), spread so a bend's neighbours calm down too
  const calm = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 6)], b = pts[i], c = pts[Math.min(n - 1, i + 6)];
    const ux = b[0] - a[0], uz = b[1] - a[1], vx = c[0] - b[0], vz = c[1] - b[1];
    const lu = Math.sqrt(ux * ux + uz * uz) || 1, lv = Math.sqrt(vx * vx + vz * vz) || 1;
    calm[i] = smoothstep(0.75, 0.97, (ux * vx + uz * vz) / (lu * lv));
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    let m = 1;
    for (let k = Math.max(0, i - 15); k <= Math.min(n - 1, i + 15); k++) if (calm[k] < m) m = calm[k];
    const a = pts[Math.max(0, i - 2)], c = pts[Math.min(n - 1, i + 2)];
    const tx = c[0] - a[0], tz = c[1] - a[1], l = Math.sqrt(tx * tx + tz * tz) || 1;
    const nx = -tz / l, nz = tx / l;
    const [x, z] = pts[i];
    const Dx = 2 * (fbm(x * 0.011, z * 0.011, seed, 2) - 0.5), Dz = 2 * (fbm(x * 0.011 + 5.3, z * 0.011, seed + 1, 2) - 0.5);
    const off = amp * 1.6 * (Dx * nx + Dz * nz) * smoothstep(0, 40, s[i]) * smoothstep(0, 40, L - s[i]) * m;
    out.push([x + nx * off, z + nz * off]);
  }
  return out;
}

function segDist(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az, wx = px - ax, wz = pz - az;
  const t = clamp((wx * vx + wz * vz) / (vx * vx + vz * vz), 0, 1);
  const dx = wx - vx * t, dz = wz - vz * t;
  return Math.sqrt(dx * dx + dz * dz);
}
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }
function r2(v) { return Math.round(v * 100) / 100; }
function r3(v) { return Math.round(v * 1000) / 1000; }
