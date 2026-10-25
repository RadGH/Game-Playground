// Roverlands world generator. PURE: no DOM, no three.js, no Rapier — runs the same in Node and in the browser, and
// gives the same world from the same seed on every machine (see wmath.js for why no Math.sin / exp / pow / hypot is
// used in anything that decides a height, a surface or an object).
//
//   import { generateWorld } from './js/world/worldgen.js';
//   const world = generateWorld({ seed: 7 });                 // ~0.6-1.0 s in a browser
//   for (const step of generateWorldSteps({ seed: 7 })) ...   // the same, yielding { progress, label } for a bar;
//                                                             // the last step carries { progress: 1, world }
//
// THE CONTRACT (docs/PLAN.md "World contract" — this file implements it; fields marked + are additions)
//
//   world.size 1536, world.cell 2, world.dim 769           x, z in [-768, 768]; x east, z south; y up
//   world.heights   Float32Array dim*dim, index = j*dim + i, x = -size/2 + i*cell, z = -size/2 + j*cell
//   world.surface   Uint8Array dim*dim — SURFACES id per sample
//  +world.biome     Uint8Array dim*dim — BIOMES id per sample (world-data.js)
//  +world.water     Float32Array dim*dim — water SURFACE height at the sample, NaN where dry (rivers, lakes, pools)
//  +world.roadDist  Float32Array dim*dim — metres from the edge of the nearest road's driving width (<= 0 = on it),
//                   1e9 far from any road. The renderer thins grass with it; scatter keeps objects off roads with it.
//   world.waterLevel  -50: there is no sea. Every body of water carries its own height: use world.waterAt(x, z).
//   world.heightAt(x,z)  bilinear over heights.  world.normalAt(x,z[,out])  [nx,ny,nz] (or fills out.x/.y/.z)
//   world.surfaceAt(x,z) SURFACES entry (nearest sample).  world.waterAt(x,z) water height or null.
//   world.biomeAt(x,z)   biome label ("Mudflats").  +world.biomeIdAt(x,z) biome id.
//   world.sites = { home:{x,z,r,y}, flags:[{id,x,z,y,name,note,r}], pads:[{x,z,y,yaw,vehicle}], ramps:[{x,z,yaw,len,h,id}],
//                   bridges:[{x0,z0,x1,z1,w,y,id}], labels:[{x,z,text,kind}] }
//  +world.labels    the same array as sites.labels
//   world.objects   [{ id, kind, x, y, z, yaw, s, shape, breakAt, mass, fall, +look, +tint }]  (index = id)
//  +world.decor     [{ kind, look, x, y, z, yaw, s }] ground plants / pebbles: drawn, never simulated
//  +world.roads     [{ id, cls:'road'|'gravel'|'track', from, to, halfW, pts:[[x,z,y], ...] every 2 m }]
//  +world.roadGraph { nodes:[{ id, x, z, y, name? }], edges:[{ a, b, road }] }  (a, b = node ids, road = roads index)
//  +world.river     { pts:[[x,z,halfWidth,level], ...] every 8 m west->east }   +world.lakes [{x,z,r,level,name}]
//  +world.stats     { ms, objects, decor, byKind }
//
// OBJECT PLACEMENT — how `y`, `yaw` and `shape` are meant
//   y is the BASE of the object (where it meets the ground). The collider's own centre is y + lift, where
//   lift = shape.lift if given, else h/2 (cyl), hy (box), r (ball), 0 (wedge).
//   yaw turns the object about +y the way three.js `rotation.y` does: local +z points at world (sin yaw, 0, cos yaw),
//   local +x at (cos yaw, 0, -sin yaw).
//   shapes:  { t:'cyl', r, h }   vertical cylinder        { t:'box', hx, hy, hz }   half extents
//            { t:'ball', r }                              { t:'wedge', hx, hy, hz } a RAMP: flat bottom
//              2hx wide (x) and 2hz long (z); its top rises from 0 at local z = -hz to 2hy at z = +hz, with a
//              vertical back face at z = +hz. Drive along local +z to go up it.
//   + a box may carry `round: 'z'`: it is really a log lying along local z (a physics that can should use a
//     cylinder of radius hy). It always works as a box.
//   s is the visual scale the shape was computed from (the renderer sizes its model with it); the shape is already
//   scaled — never multiply the shape by s again.

import { SURFACES, SURF, BIOMES, BIOME, ANCHORS, PLACES, PLACE_NAMES, ROAD_CLASSES, KINDS } from './world-data.js';
import { dsin, dcos, clamp, lerp, smoothstep, fbm, ridged, makeRng, hash01 } from './wmath.js';
import { createRouter, chaikin, resample, profile, createCarve } from './roads.js';
import { scatterObjects } from './scatter.js';

export { SURFACES, BIOMES };

export const WORLD = { size: 1536, cell: 2 };

const SIZE = 1536, CELL = 2, DIM = 769, HALF = 768;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Synchronous: the whole world. */
export function generateWorld(opts = {}) {
  let last;
  for (const step of generateWorldSteps(opts)) last = step;
  return last.world;
}

/** The same, a step at a time: yields { progress 0..1, label } and finally { progress: 1, label, world }. */
export function* generateWorldSteps(opts = {}) {
  const t0 = now();
  const seed = (Number(opts.seed) || 0) >>> 0;
  const vehicles = opts.vehicles && opts.vehicles.length ? opts.vehicles : ['trail_jeep', 'dirtbike', 'tank', 'hover_tank', 'helicopter', 'rocket_car', 'forklift', 'trailer_utility',
    'semi_truck', 'trailer_box', 'trailer_flatbed', 'trailer_tanker', 'fire_truck', 'ambulance', 'police_car'];
  const S = (seed * 7919 + 1013) % 100000;          // noise seed base
  const rng = makeRng(seed * 2654435761 + 7);

  const N = DIM * DIM;
  const heights = new Float32Array(N);
  const biome = new Uint8Array(N);
  const surface = new Uint8Array(N);
  const water = new Float32Array(N).fill(NaN);
  const xOf = (i) => -HALF + i * CELL;

  // ------------------------------------------------------------------------------------------------------------------
  // 1. biome field + the land itself
  yield { progress: 0.02, label: 'raising the land' };
  const anchors = ANCHORS.map(([key, x, z]) => {
    const fixed = key === 'lot' || (key === 'meadow' && z === 610);
    return { b: BIOME[key], x: fixed ? x : x + (rng() - 0.5) * 50, z: fixed ? z : z + (rng() - 0.5) * 50 };
  });
  const NA = anchors.length, NB = BIOMES.length;
  const ax = new Float64Array(NA), az = new Float64Array(NA), ab = new Int32Array(NA);
  anchors.forEach((a, k) => { ax[k] = a.x; az[k] = a.z; ab[k] = a.b; });

  // the river, column by column (it is a function of x, so one centreline z per column)
  const R = PLACES.river;
  const rPhase = (rng() - 0.5) * 0.5;
  const rz = new Float64Array(DIM), rk = new Float64Array(DIM), rL = new Float64Array(DIM), rW = new Float64Array(DIM);
  const rFord = new Float64Array(DIM);
  const riverZ = (x) => {
    let z = R.z0;
    for (const [a, f, p] of R.waves) z += a * dsin(x * f + p + rPhase);
    return z + (fbm(x * 0.003, 7.7, S + 11, 3) - 0.5) * 46;
  };
  for (let i = 0; i < DIM; i++) {
    const x = xOf(i);
    rz[i] = riverZ(x);
    const slope = (riverZ(x + 1) - riverZ(x - 1)) / 2;
    rk[i] = 1 / Math.sqrt(1 + slope * slope);
    rL[i] = R.levelWest - (x + HALF) * R.fall;
    rW[i] = lerp(R.width[0], R.width[1], fbm(x * 0.01, 3.3, S + 19, 2));
    let fd = 0;
    for (const f of PLACES.fords) fd = Math.max(fd, 1 - smoothstep(9, 22, Math.abs(x - f.x)));
    rFord[i] = fd;
  }
  const colOf = (x) => clamp(Math.round((x + HALF) / CELL), 0, DIM - 1);
  const riverDist = (x, z) => { const i = colOf(x); return Math.abs(z - rz[i]) * rk[i]; };
  const riverHalfW = (x) => { const i = colOf(x); return rW[i] * (1 + 0.6 * rFord[i]); };

  // per-biome height functions
  const H = [
    /* meadow */ (x, z) => 7 + 7 * fbm(x * 0.005, z * 0.005, S + 101, 3) + 2.5 * fbm(x * 0.02, z * 0.02, S + 102, 2),
    /* pine   */ (x, z) => 16 + 30 * ridged(x * 0.0045, z * 0.0045, S + 201, 4) + 6 * fbm(x * 0.02, z * 0.02, S + 202, 2),
    /* birch  */ (x, z) => 9 + 10 * fbm(x * 0.0065, z * 0.0065, S + 301, 3) + 2.5 * fbm(x * 0.025, z * 0.025, S + 302, 2),
    /* bog    */ (x, z) => 2.0 + 1.0 * fbm(x * 0.025, z * 0.025, S + 401, 3) + 0.5 * fbm(x * 0.08, z * 0.08, S + 402, 2),
    /* river  */ (x, z) => 5 + 3 * fbm(x * 0.006, z * 0.006, S + 501, 3),
    /* canyon */ (x, z) => {
      const c = fbm(x * 0.0045 + 3.1, z * 0.0045, S + 601, 4);
      const t = Math.max(0, (c - 0.3) * 7);
      const fl = Math.floor(t), fr = t - fl;
      return 14 + 11 * (fl + smoothstep(0.72, 0.95, fr)) + 1.2 * fbm(x * 0.03, z * 0.03, S + 602, 2);
    },
    /* dunes  */ (x, z) => {
      const wz = z + 40 * (fbm(x * 0.004, z * 0.004, S + 701, 2) - 0.5);
      const b = fbm(wz * 0.016, x * 0.005, S + 702, 2);
      const crest = 1 - Math.abs(2 * b - 1);
      return 8 + 10 * crest * crest + 3 * fbm(x * 0.006, z * 0.006, S + 703, 2);
    },
    /* snow   */ (x, z) => {
      const dx = x - PLACES.summit.x, dz = z - PLACES.summit.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      const dome = Math.max(0, 1 - d / 380);
      return 30 + 92 * dome * dome * (3 - 2 * dome) + 20 * ridged(x * 0.006, z * 0.006, S + 801, 4) * (0.35 + dome);
    },
    /* farm   */ (x, z) => 5 + 3 * fbm(x * 0.004, z * 0.004, S + 901, 3) + 0.6 * fbm(x * 0.03, z * 0.03, S + 902, 2),
    /* lot    */ () => 6,
  ];

  // Biome weights are worked out on a 4 m lattice (a quarter of the samples) and interpolated: they change over tens
  // of metres, and the anchor search is most of the cost of this step. Heights are still evaluated per sample.
  const BLEND = 75;
  const WD = (DIM - 1) / 2 + 1;               // 385 lattice points across
  const WW = new Float32Array(WD * WD * NB);  // per-biome weight, normalised
  const wsum = new Float64Array(NB);
  for (let j = 0; j < WD; j++) {
    const z = -HALF + j * 4;
    for (let i = 0; i < WD; i++) {
      const x = -HALF + i * 4;
      const wx = x + (fbm(x * 0.0035, z * 0.0035, S + 31, 3) - 0.5) * 170;
      const wz = z + (fbm(x * 0.0035 + 9.2, z * 0.0035, S + 37, 3) - 0.5) * 170;
      let dmin = 1e18;
      const dd = _dd;
      for (let a = 0; a < NA; a++) {
        const ex = wx - ax[a], ez = wz - az[a];
        const d = Math.sqrt(ex * ex + ez * ez);
        dd[a] = d;
        if (d < dmin) dmin = d;
      }
      wsum.fill(0);
      let tw = 0;
      for (let a = 0; a < NA; a++) {
        const t = 1 - (dd[a] - dmin) / BLEND;
        if (t > 0) { wsum[ab[a]] += t * t; tw += t * t; }
      }
      const o = (j * WD + i) * NB;
      for (let b = 0; b < NB; b++) WW[o + b] = wsum[b] / tw;
    }
  }
  const wl = new Float64Array(NB);
  for (let j = 0; j < DIM; j++) {
    const z = xOf(j);
    const lj = j >> 1, tj = (j & 1) * 0.5, lj1 = Math.min(WD - 1, lj + 1);
    for (let i = 0; i < DIM; i++) {
      const x = xOf(i);
      const li = i >> 1, ti = (i & 1) * 0.5, li1 = Math.min(WD - 1, li + 1);
      const o00 = (lj * WD + li) * NB, o10 = (lj * WD + li1) * NB, o01 = (lj1 * WD + li) * NB, o11 = (lj1 * WD + li1) * NB;
      let h = 0, tw = 0, best = 0, bw = -1;
      for (let b = 0; b < NB; b++) {
        const w = (WW[o00 + b] * (1 - ti) + WW[o10 + b] * ti) * (1 - tj) + (WW[o01 + b] * (1 - ti) + WW[o11 + b] * ti) * tj;
        wl[b] = w;
        if (w > bw) { bw = w; best = b; }
      }
      for (let b = 0; b < NB; b++) {
        const w = wl[b];
        if (w < 0.002) continue;
        h += w * H[b](x, z); tw += w;
      }
      const k = j * DIM + i;
      heights[k] = h / tw;
      biome[k] = best;
    }
  }
  yield { progress: 0.30, label: 'cutting the river' };

  // ------------------------------------------------------------------------------------------------------------------
  // 2. the river valley, fords, the lake, the frozen pond, bog pools
  const noCarve = new Uint8Array(N);
  for (let j = 0; j < DIM; j++) {
    const z = xOf(j);
    for (let i = 0; i < DIM; i++) {
      const x = xOf(i), k = j * DIM + i;
      const d = Math.abs(z - rz[i]) * rk[i];
      const ford = rFord[i];
      const L = rL[i], W = rW[i] * (1 + 0.6 * ford);
      const B = lerp(4.5, 14, ford);
      const F = L + 1.3 + 0.4 * fbm(x * 0.02, z * 0.02, S + 41, 2);
      if (d > W + B + 140) continue;
      let h;
      if (d < W) {
        const t = d / W;
        h = lerp(L - 0.35 - 2.4 * (1 - t * t), L - 0.45 + 0.1 * t * t, ford);
        noCarve[k] = 1;
      } else if (d < W + B) {
        h = lerp(L - 0.3, F, smoothstep(0, 1, (d - W) / B));
      } else h = F + (d - W - B) * 0.012;
      const v = smoothstep(W + B + 25, W + B + 130, d);
      heights[k] = lerp(h, heights[k], v);
      if (d < W + B + 60 && biome[k] !== BIOME.bog) biome[k] = BIOME.river;
      if (d < W + B && h < L) water[k] = L;   // filled below once heights are final
    }
  }

  const lake = PLACES.lake;
  const lakeLevel = sampleAvg(heights, lake.x, lake.z, 20) - 0.6;
  const pond = PLACES.icePond;
  const pondLevel = sampleAvg(heights, pond.x, pond.z, 20) - 1.2;
  const POOL = 1.75;   // bog pool water level
  const pool = new Uint8Array(N);   // 1 = a fen pool was dug here
  forDisc(lake.x, lake.z, lake.r + 40, (k, x, z, d) => {
    const bowl = d < lake.r ? lakeLevel - 3.2 * (1 - (d / lake.r) * (d / lake.r)) - 0.2 : lakeLevel - 0.2 + (d - lake.r) * 0.09;
    heights[k] = lerp(bowl, heights[k], smoothstep(lake.r * 0.9, lake.r + 38, d));
  });
  forDisc(pond.x, pond.z, pond.r + 30, (k, x, z, d) => {
    const flat = d < pond.r ? pondLevel : pondLevel + (d - pond.r) * 0.12;
    heights[k] = lerp(flat, heights[k], smoothstep(pond.r, pond.r + 28, d));
  });
  // bog pools: shallow muddy water in the hollows of the fen
  for (let j = 0; j < DIM; j++) for (let i = 0; i < DIM; i++) {
    const k = j * DIM + i;
    if (biome[k] !== BIOME.bog) continue;
    const x = xOf(i), z = xOf(j);
    if (Math.abs(z - rz[i]) * rk[i] < rW[i] * 1.6 + 60) continue;   // the riverbank is not fen
    const p = fbm(x * 0.022, z * 0.022, S + 51, 3);
    if (p < 0.40) { heights[k] = Math.min(heights[k], POOL - Math.min(0.45, (0.40 - p) * 3.2)); pool[k] = 1; }
  }

  // ------------------------------------------------------------------------------------------------------------------
  // 3. home pad, the sandbox lot, the mesa and its switchback apron, flag sites
  yield { progress: 0.40, label: 'levelling the base' };
  const home = PLACES.home;
  const hHome = Math.round(sampleAvg(heights, home.x, home.z, 30) * 10) / 10;
  flattenRect(home.x, home.z, home.padW / 2, home.padD / 2, hHome, 30);
  const lot = PLACES.sandbox;
  const hLot = Math.round(sampleAvg(heights, lot.x, lot.z, 40) * 10) / 10;
  flattenRect(lot.x, lot.z, lot.w / 2, lot.d / 2, hLot, 34);
  for (let j = 0; j < DIM; j++) for (let i = 0; i < DIM; i++) {
    const x = xOf(i), z = xOf(j);
    if (Math.abs(x - lot.x) < lot.w / 2 && Math.abs(z - lot.z) < lot.d / 2) biome[j * DIM + i] = BIOME.lot;
  }
  // the runway: a long straight flat strip in open meadow, easing back into the land at both ends
  const RW = PLACES.runway;
  const hRw = Math.round(sampleAvg(heights, RW.x, RW.z, 40) * 10) / 10;
  flattenRect(RW.x, RW.z, RW.len / 2, RW.w / 2 + 3, hRw, 45);
  // the loop track round the lot, banked at both ends
  const LA = 82, LB = 56;
  forRect(lot.x, lot.z, LA + 8, LB + 8, (k, x, z) => {
    const ex = (x - lot.x) / LA, ez = (z - lot.z) / LB;
    const rho = Math.sqrt(ex * ex + ez * ez);
    const e = (rho - 1) * (LA + LB) / 2;
    if (Math.abs(e) > 5) return;
    const ae = Math.min(1, Math.abs(ex)), ends = ae * ae * ae * ae;
    heights[k] = hLot + ends * 0.14 * (e + 3.5) * smoothstep(5, 3.5, Math.abs(e));
  });
  // mud pit
  const pit = { x: lot.x + 42, z: lot.z + 22, r: 13 };
  forDisc(pit.x, pit.z, pit.r + 3, (k, x, z, d) => {
    heights[k] = hLot - 0.55 * (1 - smoothstep(pit.r * 0.5, pit.r + 2, d));
  });

  // the mesa: a flat top, cliffs all round, and a switchback track up a talus apron on its south face
  const M = PLACES.mesa;
  const FLOOR = 20;
  forDisc(M.x, M.z, M.r + 170, (k, x, z, d) => {
    let m;
    if (d < M.r) m = M.top + 0.6 * fbm(x * 0.05, z * 0.05, S + 61, 2);
    else if (d < M.r + 9) m = lerp(M.top, FLOOR, smoothstep(M.r, M.r + 9, d));
    else m = FLOOR + 1.2 * fbm(x * 0.04, z * 0.04, S + 62, 2);
    heights[k] = lerp(m, heights[k], smoothstep(M.r + 115, M.r + 170, d));
    if (d < M.r + 120) biome[k] = BIOME.canyon;
  });
  const sb = switchbackTrack(M);
  {
    // the apron: every cell takes the height of the nearest bit of track, then is smoothed between the benches
    const [ax0, ax1] = [466, 616], [az0, az1] = [M.apronZ[0] - 4, M.apronZ[1] + 6];
    const cells = [];
    forRect((ax0 + ax1) / 2, (az0 + az1) / 2, (ax1 - ax0) / 2, (az1 - az0) / 2, (k, x, z) => {
      let bd = 1e9, bh = 0;
      for (let s = 0; s < sb.pts.length; s += 1) {
        const dx = x - sb.pts[s][0], dz = z - sb.pts[s][1];
        const d2 = dx * dx + dz * dz;
        if (d2 < bd) { bd = d2; bh = sb.prof[s]; }
      }
      cells.push([k, Math.sqrt(bd), bh]);
    });
    for (const [k, , bh] of cells) heights[k] = bh;
    const tmp = new Float32Array(cells.length);
    for (let pass = 0; pass < 4; pass++) {
      cells.forEach(([k, d], n) => {
        if (d < 3.2) { tmp[n] = heights[k]; return; }
        let s = 0, c = 0;
        for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) { s += heights[k + dj * DIM + di]; c++; }
        tmp[n] = s / c;
      });
      cells.forEach(([k], n) => { heights[k] = tmp[n]; });
    }
  }

  // ------------------------------------------------------------------------------------------------------------------
  // 4. roads
  yield { progress: 0.50, label: 'laying the roads' };
  const heightAt0 = (x, z) => bilinear(heights, x, z);
  const fordAt = (x) => rFord[colOf(x)];
  const router = createRouter({ size: SIZE, heightAt: heightAt0 }, {
    blocked: (x, z) => {
      const d = riverDist(x, z);
      if (d < riverHalfW(x) + 3 && fordAt(x) < 0.5) return true;
      const lx = x - lake.x, lz = z - lake.z;
      if (lx * lx + lz * lz < (lake.r + 4) * (lake.r + 4)) return true;
      return false;
    },
    biomeCost: (x, z) => {
      const b = biome[colOf(z) * DIM + colOf(x)];
      return b === BIOME.bog ? 2.5 : b === BIOME.dunes ? 0.8 : b === BIOME.snow ? 0.4 : b === BIOME.canyon ? 0.15
        : b === BIOME.lot ? 0.6 : b === BIOME.farm ? 0.25 : 0;
    },
  });
  const allowFord = (x) => fordAt(x) >= 0.5;

  // graph nodes
  const nodes = [];
  const node = (id, x, z, extra = {}) => { const n = { id, x, z, ...extra }; nodes.push(n); return n; };
  const bankZ = (x, side, extra) => { const i = colOf(x); return rz[i] + side * (rW[i] * (1 + 0.6 * rFord[i]) + extra) / rk[i]; };
  const nH = node('home', home.x, home.z - home.padD / 2 - 2, { name: 'Home base' });
  const nSbx = node('sandbox', lot.x - lot.w / 2 + 2, lot.z, { name: 'Sandbox lot' });
  const bx = PLACES.bridge.x;
  const nB1 = node('bridge_s', bx, bankZ(bx, 1, 13));
  const nB2 = node('bridge_n', bx, bankZ(bx, -1, 13));
  const fw = PLACES.fords[0], fe = PLACES.fords[1];
  const nFW1 = node('ford_w_s', fw.x, bankZ(fw.x, 1, 22), { name: fw.name });
  const nFW2 = node('ford_w_n', fw.x, bankZ(fw.x, -1, 22));
  const nFE1 = node('ford_e_s', fe.x, bankZ(fe.x, 1, 22), { name: fe.name });
  const nFE2 = node('ford_e_n', fe.x, bankZ(fe.x, -1, 22));
  const nJ = node('junction', 10, Math.min(110, bankZ(10, -1, 120)));
  const nK = node('ridge', 20, -250);
  const nCB = node('canyon_base', sb.pts[0][0], sb.pts[0][1]);
  const rfX = -120 + (rng() - 0.5) * 40;
  const fRiver = node('flag_river', rfX, bankZ(rfX, -1, 13), { flag: 'river' });
  const fBog = node('flag_bog', -480 + (rng() - 0.5) * 40, 10 + (rng() - 0.5) * 40, { flag: 'bog' });
  const fCanyon = node('flag_canyon', M.x, M.z, { flag: 'canyon' });
  // the summit: the highest point near the peak
  let sx = PLACES.summit.x, sz = PLACES.summit.z, sh = -1e9;
  for (let dz = -70; dz <= 70; dz += 4) for (let dx = -70; dx <= 70; dx += 4) {
    const h = heightAt0(PLACES.summit.x + dx, PLACES.summit.z + dz);
    if (h > sh) { sh = h; sx = PLACES.summit.x + dx; sz = PLACES.summit.z + dz; }
  }
  const fSummit = node('flag_summit', sx, sz, { flag: 'summit' });
  const nFarm = node('farm', -450, 575, { name: 'Haystead Farms' });
  const nDunes = node('dunes', -540, -430);

  // flag pads: a small flat spot to stand on at each flag
  flattenDisc(fRiver.x, fRiver.z, 9, sampleAvg(heights, fRiver.x, fRiver.z, 6), 10);
  flattenDisc(fBog.x, fBog.z, 9, POOL + 0.5, 12);
  sh -= 1.5;
  flattenDisc(fSummit.x, fSummit.z, 22, sh, 16);   // a summit plateau, so the last climb does not have to wind round the very top

  // node heights (where roads meet)
  const deckY = Math.max(heightAt0(nB1.x, nB1.z), heightAt0(nB2.x, nB2.z), rL[colOf(bx)] + 1.3) + 2.6;
  for (const n of nodes) n.y = sampleAvg(heights, n.x, n.z, 5);
  nH.y = hHome; nSbx.y = hLot; nB1.y = deckY; nB2.y = deckY;
  nCB.y = sb.prof[0]; fCanyon.y = M.top;
  fBog.y = POOL + 0.5; fSummit.y = sh;

  const EDGES = [
    [nH, nSbx, 'road'], [nH, nB1, 'road'], [nB1, nB2, 'bridge'], [nB2, nJ, 'road'],
    [nH, nFW1, 'road'], [nFW1, nFW2, 'road', { ford: true }], [nFW2, nJ, 'road'],
    [nH, nFE1, 'road'], [nFE1, nFE2, 'road', { ford: true }], [nFE2, nCB, 'road'], [nCB, fCanyon, 'switchback'],
    [nFW2, fBog, 'gravel', { biomeMul: 0.35 }], [nJ, fRiver, 'gravel'], [nJ, nK, 'road'], [nK, fSummit, 'gravel', { biomeMul: 0.2 }],
    [nH, nFarm, 'track'], [nFarm, nFW1, 'track'], [fBog, nDunes, 'track', { biomeMul: 0.2 }], [nDunes, nK, 'track', { biomeMul: 0.3 }],
    [nCB, nK, 'track'], [nSbx, nFE1, 'track'],
  ];
  const roads = [];
  const graphEdges = [];
  const waterFloor = (x, z) => {
    const i = colOf(x), j = colOf(z), k = j * DIM + i;
    if (rFord[i] > 0.3 && riverDist(x, z) < riverHalfW(x) + 16) return -Infinity;
    let f = -Infinity;
    if (!Number.isNaN(water[k])) f = water[k] + 0.35;
    if (pool[k]) f = Math.max(f, POOL + 0.3);
    if (riverDist(x, z) < riverHalfW(x) + 6) f = Math.max(f, rL[i] + 0.6);
    return f;
  };
  const carve = createCarve(DIM, CELL, SIZE);
  // pins that are fixed by design; every other node takes whatever height the land (and the roads carved before
  // this one) has there when its first road arrives
  const fixedPin = new Map([[nH, hHome], [nSbx, hLot], [nB1, deckY], [nB2, deckY], [nCB, sb.prof[0]], [fCanyon, M.top],
    [fBog, POOL + 0.5], [fSummit, sh]]);
  const pinOf = (n) => (fixedPin.has(n) ? fixedPin.get(n) : (n.y = n.pinned ? n.y : bilinear(heights, n.x, n.z), n.pinned = true, n.y));
  // carve order: roads, then gravel, then tracks, so the rougher ways inherit the made roads where they share ground
  const order = EDGES.map((e, i) => i).sort((p, q) => rank(EDGES[p][2]) - rank(EDGES[q][2]) || p - q);
  const built = new Array(EDGES.length);
  for (const ei of order) {
    const [a, b, kind, o = {}] = EDGES[ei];
    let pts, prof, cls = kind;
    if (kind === 'bridge') {
      pts = resample([[a.x, a.z], [b.x, b.z]], 2);
      prof = new Float32Array(pts.length).fill(deckY);
      cls = 'road';
    } else if (kind === 'switchback') {
      pts = sb.pts.map(p => [p[0], p[1]]);
      const end = pts[pts.length - 1];
      const tail = resample([end, [b.x, b.z]], 2).slice(1);
      for (const p of tail) pts.push(p);
      prof = Float32Array.from([...sb.prof, ...tail.map(() => M.top)]);
      cls = 'gravel';
    } else {
      let grid = router.route(a.x, a.z, b.x, b.z, { cls, allowWater: allowFord, biomeMul: o.biomeMul });
      if (!grid) grid = router.route(a.x, a.z, b.x, b.z, { cls, allowWater: allowFord, maxGrade: 3, biomeMul: o.biomeMul });
      if (!grid) grid = [[a.x, a.z], [b.x, b.z]];
      router.markUsed(grid);
      pts = resample(chaikin(grid, 3), 2);
      const C = ROAD_CLASSES[cls];
      // a ford keeps the banks the river carve gave it (smoothing would round the bed edge up into a lip)
      if (o.ford) {
        // a ford is the riverbank itself: the river carve already gave it gentle banks and a shallow bed
        prof = Float32Array.from(pts.map(p => bilinear(heights, p[0], p[1])));
      } else {
        prof = profile(pts, (x, z) => bilinear(heights, x, z), { pinA: pinOf(a), pinB: pinOf(b), smooth: C.smooth, clamp: C.clamp, floorAt: waterFloor });
        prof = carve.pinToRoads(heights, pts, prof, C.clamp);
      }
    }
    const road = { cls, kind, from: a.id, to: b.id, halfW: ROAD_CLASSES[cls].halfW, pts, prof, ford: !!o.ford };
    built[ei] = road;
    if (kind !== 'bridge') carve.carve(heights, road, ei, noCarve, !!o.ford);
  }
  for (let i = 0; i < built.length; i++) {
    built[i].id = i;
    roads.push(built[i]);
    graphEdges.push({ a: built[i].from, b: built[i].to, road: i });
  }
  for (const n of nodes) if (!fixedPin.has(n)) n.y = bilinear(heights, n.x, n.z); else n.y = fixedPin.get(n);
  // the ford beds stay under water whatever a road did next to them
  for (let i = 0; i < DIM; i++) {
    if (rFord[i] <= 0) continue;
    for (let j = 0; j < DIM; j++) {
      const k = j * DIM + i, z = xOf(j);
      const d = Math.abs(z - rz[i]) * rk[i];
      if (d < rW[i] * (1 + 0.6 * rFord[i]) + 2) heights[k] = Math.min(heights[k], rL[i] - 0.3);
    }
  }
  const roadDist = carve.bestD;

  // ------------------------------------------------------------------------------------------------------------------
  // 5. water: rivers + lake + pools, now that the ground is final
  yield { progress: 0.66, label: 'filling the water' };
  water.fill(NaN);
  for (let j = 0; j < DIM; j++) {
    const z = xOf(j);
    for (let i = 0; i < DIM; i++) {
      const k = j * DIM + i, x = xOf(i);
      const h = heights[k];
      const d = Math.abs(z - rz[i]) * rk[i];
      if (d < rW[i] * (1 + 0.6 * rFord[i]) + 16 && h < rL[i]) { water[k] = rL[i]; continue; }
      const lx = x - lake.x, lz = z - lake.z;
      if (lx * lx + lz * lz < (lake.r + 30) * (lake.r + 30) && h < lakeLevel) { water[k] = lakeLevel; continue; }
      if (pool[k] && h < POOL && roadDist[k] > 0.5) water[k] = POOL;
    }
  }

  // ------------------------------------------------------------------------------------------------------------------
  // 6. surfaces
  yield { progress: 0.72, label: 'painting the ground' };
  const theta = 0.35, fc = dcos(theta), fs = dsin(theta);   // farm field grid (deterministic trig; see wmath.js)
  const fieldOf = (x, z) => {
    const u = x * fc + z * fs, v = -x * fs + z * fc;
    const fi = Math.floor(u / 70), fj = Math.floor(v / 46);
    const fu = u / 70 - fi, fv = v / 46 - fj;
    const edge = Math.min(fu * 70, (1 - fu) * 70, fv * 46, (1 - fv) * 46);
    return { fi, fj, edge };
  };
  for (let j = 0; j < DIM; j++) {
    const z = xOf(j);
    for (let i = 0; i < DIM; i++) {
      const x = xOf(i), k = j * DIM + i;
      const h = heights[k];
      const hx = heights[k + (i < DIM - 1 ? 1 : 0)] - heights[k - (i > 0 ? 1 : 0)];
      const hz = heights[k + (j < DIM - 1 ? DIM : 0)] - heights[k - (j > 0 ? DIM : 0)];
      const g = Math.sqrt(hx * hx + hz * hz) / (2 * CELL);           // gradient, rise / run
      const b = biome[k];
      let s;
      const rd = roadDist[k], ri = carve.bestR[k];
      if (!Number.isNaN(water[k])) {
        const depth = water[k] - h;
        s = depth < 0.8 ? SURF.shallows : (b === BIOME.bog ? SURF.mud : SURF.gravel);
      } else if (ri >= 0 && rd <= 0) {
        s = ROAD_CLASSES[roads[ri].cls].surface;
      } else if (ri >= 0 && rd < 0.9 && roads[ri].cls === 'road') {
        s = SURF.gravel;
      } else {
        const n1 = (b === BIOME.dunes || b === BIOME.farm) ? 0 : fbm(x * 0.045, z * 0.045, S + 71, 2);
        switch (b) {
          case BIOME.meadow: s = n1 > 0.72 ? SURF.dirt : SURF.grass; break;
          case BIOME.pine: s = g > 0.55 ? SURF.rock : (fbm(x * 0.03, z * 0.03, S + 72, 3) > 0.58 ? SURF.dirt : SURF.grass); break;
          case BIOME.birch: s = n1 > 0.68 ? SURF.dirt : SURF.grass; break;
          case BIOME.bog: s = fbm(x * 0.03, z * 0.03, S + 73, 3) < 0.6 ? SURF.mud : SURF.grass; break;
          case BIOME.river: {
            const d = riverDist(x, z) - riverHalfW(x);
            s = d < 7 ? (n1 > 0.48 ? SURF.gravel : SURF.mud) : SURF.grass;
            break;
          }
          case BIOME.canyon: s = g > 0.42 ? SURF.rock : (n1 > 0.7 ? SURF.gravel : SURF.dirt); break;
          case BIOME.dunes: s = g > 1.1 ? SURF.rock : SURF.sand; break;
          case BIOME.snow: {
            const line = 44 + 10 * fbm(x * 0.01, z * 0.01, S + 74, 3);
            if (g > 0.75) s = SURF.rock;
            else if (h > line) s = SURF.snow;
            else s = g > 0.5 ? SURF.rock : (n1 > 0.6 ? SURF.dirt : SURF.grass);
            const px = x - pond.x, pz = z - pond.z;
            if (px * px + pz * pz < pond.r * pond.r) s = SURF.ice;
            else if (px * px + pz * pz < (pond.r + 30) * (pond.r + 30) && g < 0.5) s = SURF.snow;
            break;
          }
          case BIOME.farm: { const fo = fieldOf(x, z); s = fo.edge < 2.6 ? SURF.grass : (hash01(fo.fi, fo.fj, 5) < 0.2 ? SURF.grass : SURF.farm); break; }
          case BIOME.lot: {
            const ex = (x - lot.x) / LA, ez = (z - lot.z) / LB;
            const e = (Math.sqrt(ex * ex + ez * ez) - 1) * (LA + LB) / 2;
            const dp = Math.sqrt((x - pit.x) * (x - pit.x) + (z - pit.z) * (z - pit.z));
            s = dp < pit.r ? SURF.mud : Math.abs(e) < 3.6 ? SURF.gravel : (x < lot.x - 50 ? SURF.gravel : (n1 > 0.5 ? SURF.dirt : SURF.grass));
            break;
          }
          default: s = SURF.grass;
        }
        if (g > 0.95 && s !== SURF.sand) s = SURF.rock;
      }
      // the home pad is paved
      if (Math.abs(x - home.x) <= home.padW / 2 && Math.abs(z - home.z) <= home.padD / 2) s = SURF.road;
      if (Math.abs(x - RW.x) <= RW.len / 2 && Math.abs(z - RW.z) <= RW.w / 2) s = SURF.road;
      surface[k] = s;
    }
  }

  // ------------------------------------------------------------------------------------------------------------------
  // 7. the world object (accessors), then everything placed on it
  const world = {
    seed, size: SIZE, cell: CELL, dim: DIM,
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

  yield { progress: 0.80, label: 'planting' };
  const sites = { home: { x: home.x, z: home.z - 24, r: home.r * 0.42, y: hHome }, flags: [], pads: [], ramps: [], bridges: [], labels: [] };
  const flagNodes = { river: fRiver, bog: fBog, canyon: fCanyon, summit: fSummit };
  for (const f of PLACES.flags) {
    const n = flagNodes[f.id];
    sites.flags.push({ id: f.id, name: f.name, note: f.note, x: n.x, z: n.z, y: world.heightAt(n.x, n.z), r: 3 });
  }
  // vehicle pads: two rows of eight at home, two columns of eight in the sandbox lot (16 m apart: a semi-trailer is 9 m)
  let vi = 0;
  for (let row = 0; row < 2; row++) for (let c = 0; c < 8; c++) {
    const x = -49 + c * 14, z = home.z + 6 + row * 16;
    sites.pads.push({ x, z, y: hHome, yaw: Math.PI, vehicle: vehicles[vi++ % vehicles.length], area: 'home' });
  }
  for (const col of [-60, -44]) for (let c = 0; c < 8; c++) {
    const x = lot.x + col, z = lot.z - 28 + c * 8;
    sites.pads.push({ x, z, y: hLot, yaw: Math.PI / 2, vehicle: vehicles[vi++ % vehicles.length], area: 'sandbox' });
  }

  // the airplane waits at the west end of the runway, nose down the strip (needs the whole strip, so it never cycles)
  if (!opts.vehicles || opts.vehicles.includes('airplane')) {
    const RWs = PLACES.runway, ax = RWs.x - RWs.len / 2 + 22;
    sites.pads.push({ x: ax, z: RWs.z, y: world.heightAt(ax, RWs.z), yaw: Math.PI / 2, vehicle: 'airplane', area: 'runway' });
  }

  // loose props (vehicles.json type 'prop'): pads AFTER the vehicle pads, because the room numbers entities in pad
  // order. Each sits on a clear flat spot no object or other pad overlaps.
  const propPad = (vehicle, x, z, yaw, area) => sites.pads.push({ x, z, y: world.heightAt(x, z), yaw, vehicle, area, prop: true });
  for (let c = 0; c < 6; c++) propPad('crate', -40 + (c % 3) * 1.3, home.z - 18 + Math.floor(c / 3) * 1.3, 0, 'home');
  for (let c = 0; c < 4; c++) propPad('bag', -28 + c * 1.2, home.z - 18, 0, 'home');
  for (let c = 0; c < 3; c++) propPad('barrel', 27 + c * 1.1, home.z - 18, 0, 'home');
  for (let c = 0; c < 2; c++) propPad('jetpack', 40 + c * 1.6, home.z - 18, Math.PI, 'home');
  propPad('ball', lot.x + 2, lot.z - 45, 0, 'sandbox');
  propPad('ball', lot.x + 14, lot.z - 45, 0, 'sandbox');
  for (let c = 0; c < 4; c++) propPad('crate', lot.x - 40 + c * 1.3, lot.z + 30, 0, 'sandbox');
  for (const f of sites.flags) propPad('crate', f.x + 4.5, f.z, 0, 'flag_' + f.id);
  sites.runway = { x0: RW.x - RW.len / 2, z0: RW.z, x1: RW.x + RW.len / 2, z1: RW.z, w: RW.w, y: hRw };

  const objects = [];
  const addObj = (o) => { o.id = objects.length; objects.push(o); return o; };

  // home: a row of open-fronted sheds behind the pads
  for (let c = 0; c < 4; c++) {
    addObj({ kind: 'shed', x: -42 + c * 28, y: hHome, z: home.z + 33, yaw: 0, s: 1,
      shape: { t: 'box', hx: 12.5, hy: 2.4, hz: 0.4 }, breakAt: null, mass: 0, fall: 'topple', look: 'shed' });
  }
  // the bridge: deck, two rails, two piers
  {
    const len = Math.abs(nB2.z - nB1.z), mz = (nB1.z + nB2.z) / 2, w = PLACES.bridge.w;
    const deck = addObj({ kind: 'bridge_deck', x: bx, y: deckY - 0.5, z: mz, yaw: 0, s: 1,
      shape: { t: 'box', hx: w / 2, hy: 0.25, hz: len / 2 + 1 }, breakAt: null, mass: 0, fall: 'topple', look: 'deck' });
    for (const side of [-1, 1]) addObj({ kind: 'bridge_rail', x: bx + side * (w / 2 - 0.12), y: deckY, z: mz, yaw: 0, s: 1,
      shape: { t: 'box', hx: 0.12, hy: 0.55, hz: len / 2 }, breakAt: null, mass: 0, fall: 'topple', look: 'rail' });
    const bed = rL[colOf(bx)] - 3;
    for (const t of [-0.22, 0.22]) {
      const pz = mz + t * len;
      addObj({ kind: 'bridge_pier', x: bx, y: bed, z: pz, yaw: 0, s: 1,
        shape: { t: 'box', hx: w / 2 - 0.4, hy: (deckY - 0.5 - bed) / 2, hz: 0.7 }, breakAt: null, mass: 0, fall: 'topple', look: 'pier' });
    }
    sites.bridges.push({ x0: bx, z0: nB1.z, x1: bx, z1: nB2.z, w, y: deckY, id: deck.id, name: PLACES.bridge.name });
  }
  // ramps: the sandbox set, and a few kickers out in the world
  const addRamp = (x, z, yaw, len, h, w = 4.2) => {
    const y = Math.min(world.heightAt(x, z), world.heightAt(x + dsin(yaw) * len / 2, z + dcos(yaw) * len / 2),
      world.heightAt(x - dsin(yaw) * len / 2, z - dcos(yaw) * len / 2)) - 0.05;
    const o = addObj({ kind: 'ramp', x, y, z, yaw, s: 1, shape: { t: 'wedge', hx: w / 2, hy: h / 2, hz: len / 2 },
      breakAt: null, mass: 0, fall: 'topple', look: 'ramp' });
    sites.ramps.push({ x, z, yaw, len, h, id: o.id });
    return o;
  };
  const E = Math.PI / 2;
  addRamp(lot.x - 25, lot.z - 28, E, 4, 0.7);
  addRamp(lot.x - 25, lot.z - 6, E, 6, 1.5);
  addRamp(lot.x - 25, lot.z + 20, E, 9, 2.8, 5);
  addRamp(lot.x + 30, lot.z - 25, E, 7, 2.0, 4.6);
  addRamp(lot.x + 56, lot.z - 25, -E, 7, 2.0, 4.6);     // landing ramp of the big jump
  addRamp(lot.x + 20, lot.z + 2, E, 5, 1.2);
  addRamp(lot.x + 38, lot.z + 2, -E, 5, 1.2);
  // lot props to smash
  for (let c = 0; c < 6; c++) addObj(propAt('crate', lot.x + 62 + (c % 3) * 1.1, lot.z - 4 + Math.floor(c / 3) * 1.1, 0));
  for (let c = 0; c < 6; c++) addObj(propAt('barrel', lot.x + 62 + (c % 3) * 0.9, lot.z + 6 + Math.floor(c / 3) * 0.9, 0));
  for (let c = 0; c < 5; c++) addObj(propAt('hay_bale', lot.x - 8 + c * 1.7, lot.z + 48, 0));
  // home: crates and barrels by the sheds
  for (let c = 0; c < 4; c++) addObj(propAt('barrel', 58 - c * 0.9, home.z + 28, 0));
  for (let c = 0; c < 3; c++) addObj(propAt('crate', -58 + c * 1.1, home.z + 28, 0));
  // kickers in the world, on open ground just off the roads
  const kickerSpots = [[-470, -520, 0.4], [-610, -380, 2.1], [430, -120, 1.2], [600, -560, -0.6], [-150, 585, -1.0], [210, 560, 0.8]];
  for (const [x0, z0, yaw] of kickerSpots) {
    const p = findOpen(x0, z0, 40, 6);
    if (p) addRamp(p.x, p.z, yaw, 6, 1.4, 4.4);
  }
  // signposts at the main junctions
  for (const n of [nJ, nK, nFW2, nFE2, nB2, nFarm]) {
    const p = findOpen(n.x + 7, n.z + 5, 10, 1.5, true);
    if (p) addObj(propAt('sign', p.x, p.z, rng() * 6.28));
  }

  // farm: fences along field edges, hay bales in the fields
  {
    const seen = new Set();
    for (let fi = -16; fi <= 4; fi++) for (let fj = 4; fj <= 20; fj++) {
      for (const dir of [0, 1]) {
        if (hash01(fi, fj, 31 + dir) > 0.17) continue;
        const key = `${fi},${fj},${dir}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const len = dir === 0 ? 70 : 46;
        const n = Math.floor(len / 2.4);
        const ux = dir === 0 ? fc : -fs, uz = dir === 0 ? fs : fc;     // along the edge
        const u0 = fi * 70, v0 = fj * 46;
        const ox = u0 * fc - v0 * fs, oz = u0 * fs + v0 * fc;          // field corner in world
        const yaw = Math.atan2(ux, uz) - Math.PI / 2;                  // local +x along the fence
        for (let p = 0; p < n; p++) {
          const t = (p + 0.5) * 2.4;
          const x = ox + ux * t, z = oz + uz * t;
          if (Math.abs(x) > HALF - 6 || Math.abs(z) > HALF - 6) continue;
          const k = nearestK(x, z);
          if (biome[k] !== BIOME.farm || !Number.isNaN(water[k]) || roadDist[k] < 3) continue;
          if (world.slopeAt(x, z) > 0.18) continue;
          addObj({ kind: 'fence', x, y: world.heightAt(x, z) - 0.04, z, yaw, s: 1,
            shape: { t: 'box', hx: 1.2, hy: 0.6, hz: 0.06 }, breakAt: KINDS.fence.breakAt, mass: KINDS.fence.mass, fall: 'topple', look: 'fence' });
        }
      }
    }
    // round bales in a few stubble fields
    let bales = 0;
    for (let fi = -16; fi <= 4 && bales < 70; fi++) for (let fj = 4; fj <= 20 && bales < 70; fj++) {
      if (hash01(fi, fj, 77) > 0.3) continue;
      const u = (fi + 0.5) * 70, v = (fj + 0.5) * 46;
      const cx = u * fc - v * fs, cz = u * fs + v * fc;
      const k = nearestK(cx, cz);
      if (Math.abs(cx) > HALF - 30 || Math.abs(cz) > HALF - 30 || biome[k] !== BIOME.farm) continue;
      const n = 3 + Math.floor(hash01(fi, fj, 78) * 5);
      for (let b = 0; b < n; b++) {
        const x = cx + (hash01(fi, fj, 80 + b) - 0.5) * 50, z = cz + (hash01(fi, fj, 90 + b) - 0.5) * 30;
        const kk = nearestK(x, z);
        if (surface[kk] !== SURF.farm || roadDist[kk] < 3) continue;
        addObj(propAt('hay_bale', x, z, hash01(fi, fj, 100 + b) * 6.28));
        bales++;
      }
    }
  }

  // the scatter: trees, bushes, reeds, rocks, logs by biome; then ground decor
  const exclusions = [
    { x: home.x, z: home.z, hx: home.padW / 2 + 8, hz: home.padD / 2 + 8 },
    { x: lot.x, z: lot.z, hx: lot.w / 2 + 4, hz: lot.d / 2 + 4 },
    { x: RW.x, z: RW.z, hx: RW.len / 2 + 6, hz: RW.w / 2 + 6 },
  ];
  const discs = [
    ...sites.flags.map(f => ({ x: f.x, z: f.z, r: 14 })),
    { x: nB1.x, z: nB1.z, r: 14 }, { x: nB2.x, z: nB2.z, r: 14 },
    ...sites.ramps.map(r => ({ x: r.x, z: r.z, r: r.len })),
  ];
  const { decor } = scatterObjects(world, { S, addObj, objects, exclusions, discs, nearestK });

  // ------------------------------------------------------------------------------------------------------------------
  // 8. labels, graph, river description
  const lab = (x, z, text, kind = 'place') => sites.labels.push({ x: Math.round(x), z: Math.round(z), text, kind });
  lab(home.x, home.z - 4, PLACE_NAMES.home, 'base');
  lab(lot.x, lot.z - lot.d / 2 - 10, PLACE_NAMES.sandbox, 'base');
  for (const key of ['bog', 'pine', 'birch', 'farm', 'canyon', 'dunes', 'snow', 'meadow']) {
    const as = anchors.filter(a => a.b === BIOME[key]);
    const cx = as.reduce((s, a) => s + a.x, 0) / as.length, cz = as.reduce((s, a) => s + a.z, 0) / as.length;
    lab(clamp(cx, -700, 700), clamp(cz, -730, 730), PLACE_NAMES[key], 'region');
  }
  lab(-560, riverZ(-560) + 30, PLACE_NAMES.river, 'water');
  lab(fw.x, bankZ(fw.x, 1, 30), fw.name, 'crossing');
  lab(fe.x, bankZ(fe.x, 1, 30), fe.name, 'crossing');
  lab(bx + 34, (nB1.z + nB2.z) / 2, PLACES.bridge.name, 'crossing');
  lab(lake.x, lake.z, lake.name, 'water');
  lab(pond.x, pond.z + pond.r + 10, pond.name, 'water');
  for (const f of sites.flags) lab(f.x, f.z - 14, f.name, 'flag');

  const river = { pts: [] };
  for (let i = 0; i < DIM; i += 4) river.pts.push([xOf(i), rz[i], rW[i] * (1 + 0.6 * rFord[i]), rL[i]]);
  const lakes = [{ x: lake.x, z: lake.z, r: lake.r, level: lakeLevel, name: lake.name }];

  world.sites = sites;
  world.labels = sites.labels;
  world.objects = objects;
  world.decor = decor;
  world.roads = roads.map(r => ({
    id: r.id, cls: r.cls, kind: r.kind, from: r.from, to: r.to, halfW: r.halfW, ford: r.ford,
    pts: r.pts.map((p, i) => [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100, Math.round(r.prof[i] * 100) / 100]),
  }));
  world.roadGraph = { nodes: nodes.map(n => ({ id: n.id, x: n.x, z: n.z, y: n.y, name: n.name, flag: n.flag })), edges: graphEdges };
  world.river = river;
  world.lakes = lakes;
  world.icePond = { x: pond.x, z: pond.z, r: pond.r, y: pondLevel };
  world.mudPit = pit;
  world.loopTrack = { x: lot.x, z: lot.z, a: LA, b: LB, halfW: 3.5 };
  const byKind = {};
  for (const o of objects) byKind[o.kind] = (byKind[o.kind] || 0) + 1;
  world.stats = { ms: Math.round(now() - t0), objects: objects.length, decor: decor.length, byKind };
  yield { progress: 1, label: 'ready', world };
  return world;

  // ==================================================================================================================
  // helpers (closures over the arrays above)
  function nearestK(x, z) {
    const i = clamp(Math.round((x + HALF) / CELL), 0, DIM - 1), j = clamp(Math.round((z + HALF) / CELL), 0, DIM - 1);
    return j * DIM + i;
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
    return { kind, x, y, z, yaw, s: 1, shape, breakAt: K.breakAt ?? null, mass: K.mass || 0, fall: K.fall || 'topple', look: kind };
  }
  /** A flat-ish dry spot near (x0, z0), at least `clear` metres off any road (or right beside one if `byRoad`). */
  function findOpen(x0, z0, radius, clear, byRoad = false) {
    for (let r = 0; r <= radius; r += 3) {
      for (let a = 0; a < 12; a++) {
        const x = x0 + (r === 0 ? 0 : r * dcos(a * 0.5236)), z = z0 + (r === 0 ? 0 : r * dsin(a * 0.5236));
        const k = nearestK(x, z);
        if (!Number.isNaN(water[k])) continue;
        if (byRoad ? (roadDist[k] < 1.2 || roadDist[k] > 6) : roadDist[k] < clear + 2) continue;
        if (world.slopeAt(x, z) > 0.12) continue;
        return { x, z };
      }
    }
    return null;
  }
  function sampleAvg(arr, x, z, r) {
    let s = 0, c = 0;
    for (let dz = -r; dz <= r; dz += CELL) for (let dx = -r; dx <= r; dx += CELL) { s += bilinear(arr, x + dx, z + dz); c++; }
    return s / c;
  }
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

const _dd = new Float64Array(64);
const rank = (kind) => (kind === 'road' || kind === 'bridge' ? 0 : kind === 'gravel' || kind === 'switchback' ? 1 : 2);

/** Bilinear height at (x, z) — THE ground height (the physics heightfield is built from the same array). */
export function bilinear(arr, x, z) {
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

/**
 * The switchback up the mesa's south face: parallel legs joined by half-circle hairpins, climbing at one steady grade
 * from the canyon floor to the top. Returns { pts: [[x,z]...] every 2 m, prof: heights }.
 */
function switchbackTrack(M) {
  const R = 9;                // hairpin radius
  const xL = 485, xR = 595;   // leg ends
  const z0 = M.apronZ[1] - 2; // first leg (lowest, southmost)
  const ctrl = [[xL - 22, z0]];
  let z = z0, east = true;
  for (let leg = 0; leg < 4; leg++) {
    const xs = east ? xL : xR, xe = east ? xR : xL;
    ctrl.push([xs, z], [xe, z]);
    if (leg === 3) break;
    // half circle round to the next leg, 2R further north (smaller z)
    const cx = xe, cz = z - R;
    for (let a = 1; a < 12; a++) {
      const t = (a / 12) * Math.PI;
      const sgn = east ? 1 : -1;
      ctrl.push([cx + sgn * R * dsin(t), cz + R * dcos(t)]);
    }
    z -= 2 * R;
    east = !east;
  }
  // from the end of the top leg up onto the mesa
  const last = ctrl[ctrl.length - 1];
  ctrl.push([last[0] - (east ? 8 : -8), last[1] - 10], [last[0] - (east ? 12 : -12), M.apronZ[0] - 8]);
  const pts = resample(ctrl, 2);
  // a steady climb by distance travelled
  let total = 0;
  const along = [0];
  for (let i = 1; i < pts.length; i++) { const ex = pts[i][0] - pts[i - 1][0], ez = pts[i][1] - pts[i - 1][1]; total += Math.sqrt(ex * ex + ez * ez); along.push(total); }
  const FLOOR = 20;
  const prof = new Float32Array(pts.length);
  for (let i = 0; i < pts.length; i++) prof[i] = FLOOR + (M.top - FLOOR) * (along[i] / total);
  return { pts, prof };
}

/** A stable hash of a world, for the determinism test and for "are we all on the same map?" checks online. */
export function worldHash(world) {
  let h = 2166136261 >>> 0;
  const eat = (bytes) => { for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 16777619) >>> 0; } };
  eat(new Uint8Array(world.heights.buffer, world.heights.byteOffset, world.heights.byteLength));
  eat(world.surface);
  const s = JSON.stringify(world.objects.map(o => [o.kind, o.x, o.y, o.z, o.yaw, o.s]));
  const enc = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) enc[i] = s.charCodeAt(i) & 255;
  eat(enc);
  return h.toString(16).padStart(8, '0');
}

/**
 * How tall an object LOOKS, in metres, from its base — what a falling piece should be sized to. (A tree's collider
 * is only its trunk, `shape.h`; the whole tree is taller.)
 */
export function objectHeight(o) {
  const K = KINDS[o.kind] || {};
  if (K.h) return K.h * (o.s || 1);
  const sh = o.shape || {};
  if (sh.t === 'box') return 2 * sh.hy;
  if (sh.t === 'wedge') return 2 * sh.hy;
  if (sh.t === 'ball') return 2 * sh.r;
  return sh.h || 1;
}
