// The Moon — the generator for map 'moon' (Expansion 1, groundwork for M11 / M12). PURE (no DOM / three.js / Rapier),
// deterministic from the seed, the same on every machine: + - * / and Math.sqrt only in anything that decides a height,
// a surface or an object (dsin / dcos and the integer-hash noise from ../wmath.js; see "Same world everywhere" in
// ../README-world.md). Called through ../worldgen.js: generateWorld({ seed, map: 'moon' }).
//
// Same world contract as the classic map and Wayfare County (heights / surface / biome / water / roadDist arrays and
// heightAt / normalAt / surfaceAt / waterAt / ... accessors, objects, decor, sites, labels) plus:
//   gravity: 1.62, sky: 'black', space: { hour, sunDir, planet }, craters, rille, ridge, mare.
// 2048 m square at a 2 m cell: dim 1025, 1.05 M height samples. No water anywhere, no roads (the land is the road).
//
// The order (each step reads the land as the steps before it left it):
//   1. the land: the smooth dark sea (mare) blended into rolling bright highlands, the Lumen Ridge crest
//   2. craters, biggest first (each one ADDS its bowl, rim and ejecta to whatever is there): 3 named giants with a
//      gentle breach in the wall so you can drive in, medium ones (some steep enough to need a run-up), small, tiny
//   3. the rille: a winding channel carved along a smoothed path, its floor following the land, ramps at both ends
//   4. the base, the landing pad and the far-side depot flattened
//   5. biome + surface per sample, then buildings, ramps, boulders, pebbles, and the sites list

import { SURFACES, SURF, BIOMES, BIOME, KINDS } from '../world-data.js';
import { dsin, dcos, clamp, lerp, smoothstep, fbm, makeRng, hash01, TAU } from '../wmath.js';
import { gfbm, ridgedG } from '../county/countygen.js';
import { MOON } from './moon-data.js';

const SIZE = MOON.size, CELL = MOON.cell, DIM = SIZE / CELL + 1, HALF = SIZE / 2;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export function* generateMoonSteps(opts = {}) {
  const t0 = now();
  const ms = {};
  let tl = t0;
  const lap = (name) => { const t = now(); ms[name] = Math.round(t - tl); tl = t; };
  const seed = (Number(opts.seed) || 0) >>> 0;
  const S = (seed * 7919 + 3301) % 100000;
  const rng = makeRng(seed * 2654435761 + 977);
  const N = DIM * DIM;
  const heights = new Float32Array(N);
  const biome = new Uint8Array(N);
  const surface = new Uint8Array(N);
  const water = new Float32Array(N).fill(NaN);
  const roadDist = new Float32Array(N).fill(999);
  const mareM = new Float32Array(N);      // 1 = the smooth sea
  const inCrater = new Uint8Array(N);     // 1 = inside a medium / big crater's rim
  const rilleD = new Float32Array(N).fill(1e9), rilleI = new Int32Array(N).fill(-1);
  const xOf = (i) => -HALF + i * CELL;
  const colOf = (x) => clamp(Math.round((x + HALF) / CELL), 0, DIM - 1);
  const nearestK = (x, z) => colOf(z) * DIM + colOf(x);
  const bil = (x, z) => bilinear(heights, x, z);

  // ------------------------------------------------------------------------------------------------------------------
  // 1. the land
  yield { progress: 0.03, label: 'pouring the dust' };
  const MA = MOON.mare, HL = MOON.highland, RG = MOON.ridge;
  const ridgeLen = [0];
  for (let s = 0; s < RG.line.length - 1; s++) ridgeLen.push(ridgeLen[s] + dist(RG.line[s], RG.line[s + 1]));
  const ridgeTot = ridgeLen[ridgeLen.length - 1];
  (() => {
    for (let j = 0; j < DIM; j++) {
      const z = xOf(j);
      for (let i = 0; i < DIM; i++) {
        const x = xOf(i), k = j * DIM + i;
        const wq = (fbm(x * 0.0021, z * 0.0021, S + 1, 3) - 0.5) * 0.36;
        const ex = (x - MA.x) / MA.rx, ez = (z - MA.z) / MA.rz;
        const q = Math.sqrt(ex * ex + ez * ez) + wq;
        const m = 1 - smoothstep(0.8, 1.06, q);
        mareM[k] = m;
        const high = HL.base + HL.amp * gfbm(x * 0.0016, z * 0.0016, S + 3, 4) + 6 * (fbm(x * 0.009, z * 0.009, S + 4, 2) - 0.5);
        const sea = MA.h + 2.4 * (fbm(x * 0.004, z * 0.004, S + 5, 2) - 0.5);
        let h = high + (sea - high) * m;
        // the crest: a ridged band along its line, fading at both ends
        let bd = 1e9, along = 0;
        for (let s = 0; s < RG.line.length - 1; s++) {
          const ax = RG.line[s][0], az = RG.line[s][1], vx = RG.line[s + 1][0] - ax, vz = RG.line[s + 1][1] - az;
          const L2 = vx * vx + vz * vz, t = clamp(((x - ax) * vx + (z - az) * vz) / L2, 0, 1);
          const px = x - ax - vx * t, pz = z - az - vz * t, d = Math.sqrt(px * px + pz * pz);
          if (d < bd) { bd = d; along = ridgeLen[s] + t * Math.sqrt(L2); }
        }
        if (bd < RG.width) {
          const f = 1 - smoothstep(0, RG.width, bd + (fbm(x * 0.008, z * 0.008, S + 6, 2) - 0.5) * 60);
          const ends = smoothstep(0, 220, along) * smoothstep(0, 160, ridgeTot - along);
          h += RG.height * f * f * ends * (0.62 + 0.5 * ridgedG(x * 0.0055, z * 0.0055, S + 7, 3, 0.5));
        }
        // fine undulation: the regolith is never billiard-table flat
        h += 0.34 * (fbm(x * 0.06, z * 0.06, S + 9, 2) - 0.5);
        heights[k] = h;
      }
    }
  })();
  lap('land');

  // ------------------------------------------------------------------------------------------------------------------
  // 2. craters
  yield { progress: 0.3, label: 'denting the craters' };
  const RL = MOON.rille;
  // the rille's path first (the craters keep clear of it): Chaikin x3, a point every 2 m, then a sideways wiggle
  let path = RL.line.map(p => [p[0], p[1]]);
  for (let it = 0; it < 3; it++) path = chaikin(path);
  path = resample(path, 2);
  {
    const n = path.length, out = [];
    let s = 0;
    for (let i = 0; i < n; i++) {
      if (i) s += dist(path[i], path[i - 1]);
      const a = path[Math.max(0, i - 3)], c = path[Math.min(n - 1, i + 3)];
      const tx = c[0] - a[0], tz = c[1] - a[1], l = Math.sqrt(tx * tx + tz * tz) || 1;
      const w = RL.wiggle * 2 * (fbm(s * 0.0058, 3.3, S + 21, 2) - 0.5);
      out.push([path[i][0] - tz / l * w, path[i][1] + tx / l * w]);
    }
    path = resample(out, 2);
  }
  const pathLen = [0];
  for (let i = 1; i < path.length; i++) pathLen.push(pathLen[i - 1] + dist(path[i], path[i - 1]));
  const L = pathLen[pathLen.length - 1];
  const nearRille = (x, z) => { let d = 1e9; for (let i = 0; i < path.length; i += 8) { const dx = path[i][0] - x, dz = path[i][1] - z, q = dx * dx + dz * dz; if (q < d) d = q; } return Math.sqrt(d); };

  const sitesDisc = [MOON.base, MOON.landing, MOON.depot];
  const clearOfSites = (x, z, R) => sitesDisc.every(s => { const dx = x - s.x, dz = z - s.z; return Math.sqrt(dx * dx + dz * dz) > s.r + MOON.keepOut + R * 1.8; });
  const craters = [];
  // the named giants (moved a little per seed); breach = the gentle way in
  for (const b of MOON.bigCraters) {
    const x = b.x + (rng() - 0.5) * 60, z = b.z + (rng() - 0.5) * 60, R = b.R * (0.94 + rng() * 0.12);
    // the breach faces the lowest land round the crater (16 bearings, a seeded nudge breaks ties), so the way in
    // runs out onto falling ground rather than into a hillside
    const a0 = rng() * TAU / 16;
    let best = null;
    for (let q = 0; q < 16; q++) {
      const a = a0 + q * TAU / 16, h = bil(x + dcos(a) * R * 1.5, z + dsin(a) * R * 1.5) + bil(x + dcos(a) * R * 1.15, z + dsin(a) * R * 1.15);
      if (!best || h < best.h) best = { a, h };
    }
    craters.push({ id: b.id, name: b.name, size: 'big', x, z, R, D: b.depth, H: b.rim, p: 2, f0: 0.4, peak: b.depth * 0.42, bx: dcos(best.a), bz: dsin(best.a) });
  }
  /** Up to `count` craters of a size class; `extra(x, z, R, placed)` may refuse a spot. More small ones than large. */
  const tryPlace = (spec, size, count, maxTries, extra) => {
    const out = [];
    for (let t = 0; t < maxTries && out.length < count; t++) {
      const R = spec.R[0] + (spec.R[1] - spec.R[0]) * rng() * rng();
      const x = -HALF + 60 + rng() * (SIZE - 120), z = -HALF + 60 + rng() * (SIZE - 120);
      if (!clearOfSites(x, z, R)) continue;
      if (!extra(x, z, R, out)) continue;
      out.push({ size, x, z, R });
    }
    return out;
  };
  const bigs = craters.slice();
  // a medium crater wants fairly level ground under it (one on a ridge flank reads as a smear, not a crater)
  const gentle = (x, z, r) => {
    const e = bil(x + r, z), w = bil(x - r, z), n = bil(x, z - r), so = bil(x, z + r);
    return Math.abs(e - w) < r * 0.5 && Math.abs(so - n) < r * 0.5 && Math.abs(bil(x, z) - (e + w + n + so) / 4) < r * 0.2;   // not a slope, not a crest
  };
  // nothing else in a big crater's way in: the corridor from its middle out through the breach to 1.6 R
  const offBreach = (x, z, R) => bigs.every(c => {
    const t = clamp((x - c.x) * c.bx + (z - c.z) * c.bz, 0, c.R * 1.6), px = c.x + c.bx * t - x, pz = c.z + c.bz * t - z;
    return Math.sqrt(px * px + pz * pz) > R * 1.9 + 14;
  });
  const apart = (x, z, R, c, k) => { const dx = x - c.x, dz = z - c.z; return Math.sqrt(dx * dx + dz * dz) > (c.R + R) * k; };
  const offBigFloors = (x, z, R) => bigs.every(c => { const dx = x - c.x, dz = z - c.z; return Math.sqrt(dx * dx + dz * dz) > c.R * 0.75 + R; });
  const medOk = tryPlace(MOON.medium, 'medium', MOON.medium.count, 4000, (x, z, R, placed) =>
    nearRille(x, z) > R * 1.9 + 50 && bigs.every(c => apart(x, z, R, c, 1.1)) && placed.every(c => apart(x, z, R, c, 1.05)) && gentle(x, z, R * 1.6) && offBreach(x, z, R));
  medOk.sort((a, b) => b.R - a.R);
  medOk.forEach((c, i) => {
    const steep = i % 3 === 1;                    // every third one: a steep wall that wants a run-up
    Object.assign(c, { id: 'medium' + i, name: MOON.craterNames[i] || null, D: c.R * (steep ? 0.24 : 0.19), H: c.R * (steep ? 0.075 : 0.055), p: steep ? 3 : 2, f0: 0.18, peak: 0 });
    craters.push(c);
  });
  const smalls = tryPlace(MOON.small, 'small', MOON.small.count, 3000, (x, z, R) => nearRille(x, z) > RL.floorHalf + RL.wall + R * 1.6 + 6 && offBigFloors(x, z, R) && offBreach(x, z, R));
  for (const c of smalls) Object.assign(c, { D: c.R * 0.22, H: c.R * 0.06, p: 2, f0: 0.05, peak: 0 });
  const tinies = tryPlace(MOON.tiny, 'tiny', MOON.tiny.count, 4000, (x, z, R) => nearRille(x, z) > RL.floorHalf + R + 4 && offBreach(x, z, R * 0.5));
  for (const c of tinies) Object.assign(c, { D: c.R * 0.16, H: c.R * 0.04, p: 2, f0: 0, peak: 0 });
  // every crater: profile ADDED to the land under it
  const all = craters.concat(smalls, tinies);
  (() => {
    for (const c of all) {
      const E = 0.9;                                   // ejecta reaches 0.9 R past the rim
      const reach = c.R * (1 + E);
      const i0 = colOf(c.x - reach), i1 = colOf(c.x + reach), j0 = colOf(c.z - reach), j1 = colOf(c.z + reach);
      const big = c.size === 'big', mark = big || c.size === 'medium';
      for (let j = j0; j <= j1; j++) {
        const z = xOf(j), dz = z - c.z;
        for (let i = i0; i <= i1; i++) {
          const x = xOf(i), dx = x - c.x;
          const r = Math.sqrt(dx * dx + dz * dz), q = r / c.R;
          if (q >= 1 + E) continue;
          let add;
          if (q < 1) {
            const u = q < c.f0 ? 0 : (q - c.f0) / (1 - c.f0);
            let wall = u * u;
            if (c.p === 3) wall = u * u * u;
            let H = c.H;
            if (big) {
              // the breach: within ~25 degrees of it the wall is a straight ramp (about 20 degrees) and the rim lower
              const cosA = r > 0.01 ? (dx * c.bx + dz * c.bz) / r : 0;
              const w = smoothstep(0.88, 0.98, cosA);
              wall = wall + (u - wall) * w;
              H = c.H * (1 - 0.6 * w);
            }
            add = -c.D + (c.D + H) * wall;
            if (c.peak && q < 0.24) { const t = 1 - q / 0.24; add += c.peak * t * t; }
            if (mark) inCrater[j * DIM + i] = 1;
          } else {
            const t = (q - 1) / E;
            let H = c.H;
            if (big) { const cosA = (dx * c.bx + dz * c.bz) / r; H = c.H * (1 - 0.6 * smoothstep(0.88, 0.98, cosA)); }
            add = H * (1 - t) * (1 - t);
          }
          heights[j * DIM + i] += add;
        }
      }
    }
  })();
  lap('craters');

  // ------------------------------------------------------------------------------------------------------------------
  // 3. the rille: floor = the land along the path, smoothed over ~200 m, less the depth (eased to 0 at both ends)
  yield { progress: 0.55, label: 'cutting the rille' };
  const floor = new Float64Array(path.length);
  {
    const raw = path.map(p => bil(p[0], p[1]));
    const box = (a, r) => { const out = new Float64Array(a.length); let s = 0; const n = a.length; const at = (i) => a[clamp(i, 0, n - 1)];
      for (let i = -r; i <= r; i++) s += at(i); for (let i = 0; i < n; i++) { out[i] = s / (2 * r + 1); s += at(i + r + 1) - at(i - r); } return out; };
    const sm = box(box(raw, 50), 50);
    for (let i = 0; i < path.length; i++) {
      const s = pathLen[i], ramp = smoothstep(0, RL.endRamp, s) * smoothstep(0, RL.endRamp, L - s);
      floor[i] = Math.min(sm[i], raw[i]) - RL.depth * ramp;
    }
    // never steeper than 10 % along the floor (a forward and a backward pass that only ever lower it)
    for (let i = 1; i < floor.length; i++) floor[i] = Math.min(floor[i], floor[i - 1] + 0.1 * (pathLen[i] - pathLen[i - 1]));
    for (let i = floor.length - 2; i >= 0; i--) floor[i] = Math.min(floor[i], floor[i + 1] + 0.1 * (pathLen[i + 1] - pathLen[i]));
  }
  const reach = RL.floorHalf + RL.wall * 1.6 + 4;
  (() => {
    for (let pi = 0; pi < path.length; pi++) {
      const [px, pz] = path[pi];
      const i0 = colOf(px - reach), i1 = colOf(px + reach), j0 = colOf(pz - reach), j1 = colOf(pz + reach);
      for (let j = j0; j <= j1; j++) {
        const dz = xOf(j) - pz;
        for (let i = i0; i <= i1; i++) {
          const dx = xOf(i) - px, d = Math.sqrt(dx * dx + dz * dz), k = j * DIM + i;
          if (d <= reach && d < rilleD[k]) { rilleD[k] = d; rilleI[k] = pi; }
        }
      }
    }
    const slope = RL.depth / RL.wall;
    for (let k = 0; k < N; k++) {
      const pi = rilleI[k];
      if (pi < 0) continue;
      const d = rilleD[k];
      // the wall: a straight bank that rounds off into the floor over the last 3 m
      const e = d - RL.floorHalf;
      const t = e <= 0 ? 0 : e < 3 ? (e * e) / 6 : e - 1.5;
      const target = floor[pi] + t * slope + 0.12 * (fbm(xOf(k % DIM) * 0.08, xOf((k / DIM) | 0) * 0.08, S + 23, 1) - 0.5);
      if (target < heights[k] - 0.3) heights[k] = target;
      else { if (target < heights[k]) heights[k] = target; rilleI[k] = -1; }   // barely touched: not the rille
    }
  })();
  lap('rille');

  // ------------------------------------------------------------------------------------------------------------------
  // 4. the base, the landing pad and the depot: flat discs with a skirt back into the land
  yield { progress: 0.65, label: 'levelling the base' };
  const flats = [];
  for (const s of sitesDisc) {
    let sum = 0, n = 0;
    for (let dz = -s.r; dz <= s.r; dz += 4) for (let dx = -s.r; dx <= s.r; dx += 4) if (dx * dx + dz * dz <= s.r * s.r) { sum += bil(s.x + dx, s.z + dz); n++; }
    const y = Math.round((sum / n) * 100) / 100, skirt = s === MOON.depot ? 70 : 50;
    flats.push({ ...s, y, skirt });
    const R = s.r + skirt;
    for (let j = colOf(s.z - R); j <= colOf(s.z + R); j++) for (let i = colOf(s.x - R); i <= colOf(s.x + R); i++) {
      const dx = xOf(i) - s.x, dz = xOf(j) - s.z, d = Math.sqrt(dx * dx + dz * dz);
      if (d > R) continue;
      const k = j * DIM + i, w = smoothstep(s.r, R, d);
      heights[k] = y + (heights[k] - y) * w;
    }
  }
  const [baseF, landF, depotF] = flats;
  lap('flats');

  // ------------------------------------------------------------------------------------------------------------------
  // 5. biome + surface
  yield { progress: 0.72, label: 'greying the ground' };
  (() => {
    for (let j = 0; j < DIM; j++) for (let i = 0; i < DIM; i++) {
      const k = j * DIM + i, x = xOf(i), z = xOf(j);
      let onFlat = null;
      for (const f of flats) { const dx = x - f.x, dz = z - f.z; if (dx * dx + dz * dz < (f.r + 6) * (f.r + 6)) { onFlat = f; break; } }
      let b;
      if (onFlat) b = BIOME.m_base;
      else if (rilleI[k] >= 0) b = BIOME.m_rille;
      else if (inCrater[k]) b = BIOME.m_crater;
      else if (mareM[k] > 0.5) b = BIOME.m_mare;
      else b = BIOME.m_highland;
      biome[k] = b;
      let s = SURF.regolith;
      if (onFlat) {
        const dx = x - onFlat.x, dz = z - onFlat.z, d2 = dx * dx + dz * dz;
        if (d2 < (onFlat.r - 6) * (onFlat.r - 6)) s = SURF.concrete;
      } else if (i > 0 && j > 0 && i < DIM - 1 && j < DIM - 1) {
        const gx = heights[k + 1] - heights[k - 1], gz = heights[k + DIM] - heights[k - DIM];
        const g = Math.sqrt(gx * gx + gz * gz) / (2 * CELL);
        if (g > 0.66) s = SURF.moonrock;
      }
      surface[k] = s;
    }
  })();
  lap('surfaces');

  // ------------------------------------------------------------------------------------------------------------------
  // 6. the world object, then everything placed on it
  const world = {
    seed, map: 'moon', name: 'The Moon', size: SIZE, cell: CELL, dim: DIM,
    heights, surface, biome, water, roadDist,
    waterLevel: -1e4,
    gravity: MOON.gravity, sky: 'black', space: JSON.parse(JSON.stringify(MOON.space)),
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
    waterAt: () => null,
    roadDistAt: (x, z) => roadDist[nearestK(x, z)],
  };
  const H = world.heightAt;

  yield { progress: 0.8, label: 'building the base' };
  const objects = [];
  const addObj = (o) => { o.id = objects.length; objects.push(o); return o; };
  const labels = [];
  const lab = (x, z, text, kind = 'place') => labels.push({ x: Math.round(x), z: Math.round(z), text, kind });
  const sites = {
    home: null, flags: [], pads: [], ramps: [], bridges: [], labels, places: [], shops: [], survey: [], samples: [],
    craters: [], base: null, landing: null, depot: null, sampleDrop: null, garage: null, fields: [],
  };

  const building = (x, z, hx, hz, h, role, o = {}) => {
    const y = Math.min(H(x - hx, z - hz), H(x + hx, z - hz), H(x - hx, z + hz), H(x + hx, z + hz), H(x, z)) - 0.15;
    return addObj({ kind: 'building', x: r2(x), y: r2(y), z: r2(z), yaw: 0, s: 1, shape: { t: 'box', hx: r2(hx), hy: r2(h / 2 + 0.15), hz: r2(hz) },
      breakAt: null, mass: 0, fall: 'topple', look: 'building', role, name: o.name, roof: 'flat', colour: o.colour || [0.85, 0.85, 0.85],
      roofColour: o.roofColour || [0.62, 0.62, 0.64], floors: Math.max(1, Math.round(h / 3.4)), windows: role !== 'solar' && role !== 'mast' && role !== 'tank' && role !== 'tunnel', town: o.town || null });
  };
  const baseIds = MOON.buildings.map(b => building(baseF.x + b.dx, baseF.z + b.dz, b.hx, b.hz, b.h, b.role, { ...b, town: 'greywatch' }));
  const garageB = baseIds.find(o => o.role === 'garage'), dropB = baseIds.find(o => o.role === 'sample_drop');
  const depotIds = MOON.depotBuildings.map(b => building(depotF.x + b.dx, depotF.z + b.dz, b.hx, b.hz, b.h, b.role, { ...b, town: 'farside' }));
  // landing pad lights: four short posts on the rim
  const lights = [];
  for (let q = 0; q < 4; q++) { const a = q * TAU / 4 + 0.785; lights.push(building(landF.x + dcos(a) * (landF.r - 4), landF.z + dsin(a) * (landF.r - 4), 0.3, 0.3, 1.8, 'pad_light', { colour: [0.95, 0.6, 0.2], town: 'greywatch' }).id); }

  const vehicles = opts.vehicles && opts.vehicles.length ? opts.vehicles : [MOON.vehicle];
  const padAt = (x, z, yaw, area) => { const p = { x: r2(x), z: r2(z), y: r2(H(x, z)), yaw, vehicle: vehicles[sites.pads.length % vehicles.length], area }; sites.pads.push(p); return sites.pads.length - 1; };
  const garagePads = MOON.garagePads.map(([dx, dz]) => padAt(baseF.x + dx, baseF.z + dz, 0, 'greywatch'));
  const depotPads = MOON.depotPads.map(([dx, dz]) => padAt(depotF.x + dx, depotF.z + dz, 0, 'farside'));
  // a crate of samples at the drop and supplies at the depot (prop pads, after the vehicle pads like the other maps)
  sites.pads.push({ x: r2(dropB.x - 6), z: r2(dropB.z + 2), y: r2(H(dropB.x - 6, dropB.z + 2)), yaw: 0, vehicle: 'crate', area: 'greywatch', prop: true });
  sites.pads.push({ x: r2(depotF.x), z: r2(depotF.z + 4), y: r2(H(depotF.x, depotF.z + 4)), yaw: 0, vehicle: 'crate', area: 'farside', prop: true });

  const gp = sites.pads[garagePads[0]];
  sites.home = { x: r2(baseF.x - 38), z: r2(baseF.z + 40), y: r2(H(baseF.x - 38, baseF.z + 40)), r: 14, place: 'greywatch_garage' };
  sites.base = { id: 'greywatch', name: baseF.name, x: baseF.x, z: baseF.z, y: baseF.y, r: baseF.r, buildings: baseIds.map(o => o.id) };
  sites.garage = { x: garageB.x, z: r2(garageB.z + garageB.shape.hz + 6), y: r2(H(garageB.x, garageB.z + garageB.shape.hz + 6)), building: garageB.id, pads: garagePads };
  sites.sampleDrop = { id: 'greywatch_sample_drop', name: 'Sample Drop', x: dropB.x, z: r2(dropB.z + 7), y: r2(H(dropB.x, dropB.z + 7)), r: 6, building: dropB.id };
  sites.landing = { id: 'greywatch_landing', name: landF.name, x: landF.x, z: landF.z, y: landF.y, r: landF.r, pad: { x: landF.x, z: landF.z, r: landF.r - 6 }, lights };
  sites.depot = { id: 'farside_depot', name: depotF.name, x: depotF.x, z: depotF.z, y: depotF.y, r: depotF.r, building: depotIds[0].id, buildings: depotIds.map(o => o.id), pads: depotPads };
  sites.places.push(
    { id: 'greywatch_garage', kind: 'garage', city: 'greywatch', name: 'Rover Garage', x: sites.garage.x, z: sites.garage.z, y: sites.garage.y, yaw: 0, r: 16, building: garageB.id, pads: garagePads },
    { id: 'greywatch_sample_drop', kind: 'sample_drop', city: 'greywatch', name: 'Sample Drop', x: sites.sampleDrop.x, z: sites.sampleDrop.z, y: sites.sampleDrop.y, yaw: 0, r: 6, building: dropB.id },
    { id: 'greywatch_landing', kind: 'landing_pad', city: 'greywatch', name: landF.name, x: landF.x, z: landF.z, y: landF.y, yaw: 0, r: landF.r, building: null },
    { id: 'farside_depot', kind: 'depot', city: null, name: depotF.name, x: depotF.x, z: r2(depotF.z + 10), y: r2(H(depotF.x, depotF.z + 10)), yaw: 0, r: 20, building: depotIds[0].id, pads: depotPads },
  );
  void gp;

  // the crater table (big + medium; small ones are only counted)
  for (const c of craters) {
    const floorY = H(c.x + c.R * 0.3, c.z), rimY = H(c.x + c.R, c.z);
    const rec = { id: c.id, name: c.name, size: c.size, x: r2(c.x), z: r2(c.z), R: r2(c.R), depth: r2(c.D), rim: r2(c.H), floorY: r2(floorY), rimY: r2(rimY),
      steep: c.p === 3 || c.size === 'big', wallSlope: r2((c.D + c.H) * c.p / (c.R * (1 - c.f0))) };
    if (c.size === 'big') rec.breach = { x: r2(c.x + c.bx * c.R), z: r2(c.z + c.bz * c.R) };
    sites.craters.push(rec);
  }
  const craterById = (id) => craters.find(c => c.id === id);

  // jump ramps: two practice kickers by the base, then wedges on the outer apron of medium craters, aimed at the bowl
  const addRamp = (x, z, yaw, len, h, w, id, name) => {
    const y = Math.min(H(x, z), H(x + dsin(yaw) * len / 2, z + dcos(yaw) * len / 2), H(x - dsin(yaw) * len / 2, z - dcos(yaw) * len / 2)) - 0.05;
    const o = addObj({ kind: 'ramp', x: r2(x), y: r2(y), z: r2(z), yaw: r3(yaw), s: 1, shape: { t: 'wedge', hx: w / 2, hy: h / 2, hz: len / 2 }, breakAt: null, mass: 0, fall: 'topple', look: 'ramp' });
    sites.ramps.push({ x: r2(x), z: r2(z), yaw: r3(yaw), len, h, id: o.id, ramp: id, name });
  };
  const RP = MOON.ramps;
  RP.practice.forEach(([dx, dz, yaw], i) => addRamp(baseF.x + dx, baseF.z + dz, yaw, RP.len, RP.h, RP.w, 'practice_' + i, 'Hopper Ramp'));
  {
    let made = 0;
    for (const c of medOk) {
      if (made >= RP.crater) break;
      if (c.p === 3) continue;
      // the apron side facing the base (so the first jump is near home); the ramp's top points at the crater centre
      const tx = baseF.x - c.x, tz = baseF.z - c.z, tl = Math.sqrt(tx * tx + tz * tz) || 1;
      const ux = tx / tl, uz = tz / tl;
      const x = c.x + ux * c.R * 1.35, z = c.z + uz * c.R * 1.35;
      if (!clearOfSites(x, z, 0)) continue;
      const yaw = Math.atan2(-ux, -uz);              // local +z = up the ramp = toward the crater (render-only angle use)
      addRamp(x, z, yaw, RP.len, RP.h, RP.w, c.id, (c.name || 'Crater') + ' Jump');
      made++;
    }
  }

  // boulders: a jittered grid; ejecta round medium / big craters, the named fields, a sprinkle everywhere
  yield { progress: 0.88, label: 'rolling the boulders' };
  const BIN = 128, BN = Math.ceil(SIZE / BIN) + 1, binOf = (x, z) => clamp(Math.floor((z + HALF) / BIN), 0, BN - 1) * BN + clamp(Math.floor((x + HALF) / BIN), 0, BN - 1);
  const cbins = new Map();
  for (const c of craters) {
    const reach2 = c.R * 2.4;
    for (let bz = Math.floor((c.z - reach2 + HALF) / BIN); bz <= Math.floor((c.z + reach2 + HALF) / BIN); bz++)
      for (let bx = Math.floor((c.x - reach2 + HALF) / BIN); bx <= Math.floor((c.x + reach2 + HALF) / BIN); bx++) {
        if (bx < 0 || bz < 0 || bx >= BN || bz >= BN) continue;
        const key = bz * BN + bx; if (!cbins.has(key)) cbins.set(key, []); cbins.get(key).push(c);
      }
  }
  const keepDiscs = [...flats.map(f => ({ x: f.x, z: f.z, r: f.r + 14 })), ...sites.ramps.map(r => ({ x: r.x, z: r.z, r: r.len + 6 }))];
  const hashC = new Map(), HC = 4, HN = Math.ceil(SIZE / HC) + 1;
  const hk = (x, z) => Math.floor((x + HALF) / HC) * HN + Math.floor((z + HALF) / HC);
  const crowded = (x, z, r) => {
    const ci = Math.floor((x + HALF) / HC), cj = Math.floor((z + HALF) / HC), rr = Math.ceil((r + 3) / HC);
    for (let di = -rr; di <= rr; di++) for (let dj = -rr; dj <= rr; dj++) {
      const a = hashC.get((ci + di) * HN + (cj + dj)); if (!a) continue;
      for (const [ox, oz, or] of a) { const dx = ox - x, dz = oz - z, m = r + or; if (dx * dx + dz * dz < m * m) return true; }
    }
    return false;
  };
  const put = (x, z, r) => { const k = hk(x, z); let a = hashC.get(k); if (!a) hashC.set(k, a = []); a.push([x, z, r]); };
  for (const o of objects) put(o.x, o.z, Math.max(o.shape.hx || o.shape.r || 1, o.shape.hz || 0));
  const LOOKS = ['boulder', 'cracked_boulder', 'slab', 'stone', 'shard', 'rock_cluster'];
  const GREY = [[1.0, 1.0, 1.02], [1.08, 1.07, 1.05], [0.92, 0.92, 0.94], [1.02, 1.01, 0.98]];   // the kit's rock colours are dark: lift them a little, keep them grey
  const STEP = 6, G = Math.floor(SIZE / STEP);
  const fieldCount = {};
  for (let gj = 0; gj < G; gj++) for (let gi = 0; gi < G; gi++) {
    const x = -HALF + (gi + 0.5 + (hash01(gi, gj, S + 31) - 0.5) * 0.92) * STEP;
    const z = -HALF + (gj + 0.5 + (hash01(gi, gj, S + 32) - 0.5) * 0.92) * STEP;
    const k = nearestK(x, z), b = biome[k];
    if (b === BIOME.m_base) continue;
    let p = b === BIOME.m_mare ? 0.0035 : b === BIOME.m_rille ? 0.006 : 0.009, big = 0;
    const list = cbins.get(binOf(x, z));
    if (list) for (const c of list) {
      const dx = x - c.x, dz = z - c.z, q = Math.sqrt(dx * dx + dz * dz) / c.R;
      if (q > 0.85 && q < 2.3) { const e = (1 - Math.abs(q - 1.25) / 1.05); if (e > 0) { p += (c.size === 'big' ? 0.06 : 0.045) * e; big += e; } }
    }
    let field = null;
    for (const f of MOON.fields) { const dx = x - f.x, dz = z - f.z, d = Math.sqrt(dx * dx + dz * dz); if (d < f.r) { p += f.density * (1 - d / f.r); big += 1; field = f.id; } }
    if (rilleI[k] >= 0 && rilleD[k] < RL.floorHalf - 1) p *= 0.15;         // keep the rille floor mostly clear to drive
    const roll = hash01(gi, gj, S + 33);
    if (roll >= p) continue;
    const u = hash01(gi, gj, S + 34) * (1 + Math.min(1, big) * 0.6);
    const kind = u < 0.5 ? 'rock_s' : u < 0.8 ? 'rock_m' : u < 1.08 ? 'rock_l' : 'boulder';
    const K = KINDS[kind];
    const s = 0.6 + 0.65 * hash01(gi, gj, S + 35);
    const r = K.r * s, h = K.colH * s;
    if (world.slopeAt(x, z) > (kind === 'boulder' ? 0.9 : 1.1)) continue;
    if (keepDiscs.some(d => (x - d.x) * (x - d.x) + (z - d.z) * (z - d.z) < (d.r + r) * (d.r + r))) continue;
    if (x < -HALF + 6 || x > HALF - 6 || z < -HALF + 6 || z > HALF - 6) continue;
    const space = r + (kind === 'boulder' || kind === 'rock_l' ? 0.8 : 0.3);
    if (crowded(x, z, space)) continue;
    const y = H(x, z) - h * 0.18;
    addObj({ kind, x: r3(x), y: r3(y), z: r3(z), yaw: r3(hash01(gi, gj, S + 36) * TAU), s: r3(s), look: LOOKS[Math.floor(hash01(gi, gj, S + 37) * LOOKS.length) % LOOKS.length],
      shape: { t: 'cyl', r: r3(r), h: r3(h) }, breakAt: null, mass: 0, fall: 'topple', tint: GREY[Math.floor(hash01(gi, gj, S + 38) * 4) % 4] });
    put(x, z, space);
    if (field) fieldCount[field] = (fieldCount[field] || 0) + 1;
  }
  for (const f of MOON.fields) sites.fields.push({ id: f.id, name: f.name, x: f.x, z: f.z, r: f.r, rocks: fieldCount[f.id] || 0 });
  // decor: pebbles (drawn, never simulated)
  const decor = [];
  const DS = 4.5, DG = Math.floor(SIZE / DS);
  for (let gj = 0; gj < DG; gj++) for (let gi = 0; gi < DG; gi++) {
    if (hash01(gi, gj, S + 41) > 0.06) continue;
    const x = -HALF + (gi + 0.5 + (hash01(gi, gj, S + 42) - 0.5) * 0.95) * DS, z = -HALF + (gj + 0.5 + (hash01(gi, gj, S + 43) - 0.5) * 0.95) * DS;
    const k = nearestK(x, z);
    if (surface[k] !== SURF.regolith || world.slopeAt(x, z) > 0.7) continue;
    decor.push({ kind: 'pebble', look: 'pebble', x: r3(x), y: r3(H(x, z) - 0.02), z: r3(z), yaw: r3(hash01(gi, gj, S + 44) * TAU), s: r3(0.8 + 0.9 * hash01(gi, gj, S + 45)) });
  }
  lap('objects');

  // ------------------------------------------------------------------------------------------------------------------
  // 7. named spots: sample sites, survey spots, labels
  const rilleAt = (f) => { const i = clamp(Math.round(f * (path.length - 1)), 0, path.length - 1); return { x: path[i][0], z: path[i][1] }; };
  const ridgeTop = (() => { let best = { x: 0, z: 0, h: -1e9 }; for (let s = 0; s < RG.line.length - 1; s++) for (let t = 0; t <= 1; t += 0.02) {
    const cx = RG.line[s][0] + (RG.line[s + 1][0] - RG.line[s][0]) * t, cz = RG.line[s][1] + (RG.line[s + 1][1] - RG.line[s][1]) * t;
    for (let dz = -60; dz <= 60; dz += 6) for (let dx = -60; dx <= 60; dx += 6) { const h = H(cx + dx, cz + dz); if (h > best.h) best = { x: cx + dx, z: cz + dz, h }; } }
    return best; })();
  const mareFlat = (() => { let best = null; for (let z = MA.z - 300; z <= MA.z + 200; z += 40) for (let x = MA.x - 450; x <= MA.x + 450; x += 40) {
    if (mareM[nearestK(x, z)] < 0.95 || rilleI[nearestK(x, z)] >= 0 || !clearOfSites(x, z, 0)) continue;
    let lo = 1e9, hi = -1e9; for (let d = -20; d <= 20; d += 5) for (let e = -20; e <= 20; e += 5) { const h = H(x + d, z + e); if (h < lo) lo = h; if (h > hi) hi = h; }
    if (inCrater[nearestK(x, z)]) continue;
    if (!best || hi - lo < best.v) best = { x, z, v: hi - lo }; }
    return best || { x: MA.x, z: MA.z }; })();
  const resolve = (at) => {
    const [kind, arg] = at.split(':');
    if (kind === 'craterFloor') { const c = craterById(arg); const off = c.size === 'big' ? c.R * 0.3 : 0; return { x: c.x + off * 0.7, z: c.z + off * 0.7 }; }
    if (kind === 'craterRim') { const c = craterById(arg); const ux = -c.bx, uz = -c.bz; return { x: c.x + ux * c.R, z: c.z + uz * c.R }; }
    if (kind === 'rille') return rilleAt(Number(arg));
    if (kind === 'ridgeFoot') { const a = RG.line[1], b = RG.line[2]; const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2; const vx = b[0] - a[0], vz = b[1] - a[1], l = Math.sqrt(vx * vx + vz * vz); return { x: mx - vz / l * RG.width * 1.05, z: mz + vx / l * RG.width * 1.05 }; }
    if (kind === 'ridgeTop') return { x: ridgeTop.x, z: ridgeTop.z };
    if (kind === 'mareFlat') return { x: mareFlat.x, z: mareFlat.z };
    if (kind === 'field') { const f = MOON.fields[Number(arg)]; return { x: f.x, z: f.z }; }
    if (kind === 'mediumFloor') {
      const far = (c) => sites.samples.every(q => Math.sqrt((q.x - c.x) * (q.x - c.x) + (q.z - c.z) * (q.z - c.z)) > 240);
      // not a crater with a jump ramp: its landing ring would lie right across the samples
      // (nor a steep one: those are the rare-sample craters, and only Orrin and Vandry's floors are meant to be rare)
      const free = c => c.p !== 3 && !sites.ramps.some(r => r.ramp === c.id);
      const c = medOk.find(c => far(c) && free(c)) || medOk.find(free) || medOk.find(far) || medOk[0];
      return { x: c.x, z: c.z };
    }
    return { x: 0, z: 0 };
  };
  for (const s of MOON.samples) { const p = resolve(s.at); sites.samples.push({ id: s.id, name: s.name, kind: s.kind, x: r2(p.x), z: r2(p.z), y: r2(H(p.x, p.z)), r: 12 }); }
  for (const s of MOON.survey) { const p = resolve(s.at); sites.survey.push({ id: s.id, name: s.name, kind: s.kind, x: r2(p.x), z: r2(p.z), y: r2(H(p.x, p.z)) }); }

  lab(MA.x, MA.z - 40, MA.name, 'region');
  lab(RG.line[2][0], RG.line[2][1] - 30, RG.name, 'region');
  { const p = rilleAt(0.62); lab(p.x, p.z - 34, RL.name, 'region'); }
  for (const c of craters) if (c.name) lab(c.x, c.z - c.R - 18, c.name, c.size === 'big' ? 'region' : 'place');
  lab(baseF.x, baseF.z - baseF.r - 14, baseF.name, 'base');
  lab(landF.x, landF.z + landF.r + 14, landF.name, 'base');
  lab(depotF.x, depotF.z + depotF.r + 14, depotF.name, 'base');
  lab(sites.sampleDrop.x, sites.sampleDrop.z + 10, 'Sample Drop', 'shop');
  for (const s of sites.samples) lab(s.x, s.z - 14, s.name, 'sample');
  for (const v of sites.survey) lab(v.x, v.z + 16, v.name, 'view');
  for (const f of MOON.fields) if (!sites.samples.some(s => s.name === f.name)) lab(f.x, f.z, f.name, 'place');

  world.sites = sites;
  world.labels = labels;
  world.objects = objects;
  world.decor = decor;
  world.roads = [];
  world.roadGraph = { nodes: [], edges: [] };
  world.river = { pts: [] };
  world.lakes = [];
  world.craters = sites.craters;
  world.rille = { name: RL.name, floorHalf: RL.floorHalf, wall: RL.wall, depth: RL.depth, length: Math.round(L),
    pts: path.filter((_, i) => i % 4 === 0).map((p, q) => [r2(p[0]), r2(p[1]), r2(floor[q * 4])]) };
  world.ridge = { name: RG.name, line: RG.line.map(p => p.slice()), crest: { x: r2(ridgeTop.x), z: r2(ridgeTop.z), y: r2(ridgeTop.h) } };
  world.mare = { name: MA.name, x: MA.x, z: MA.z, rx: MA.rx, rz: MA.rz };
  const byKind = {};
  for (const o of objects) byKind[o.kind] = (byKind[o.kind] || 0) + 1;
  lap('finish');
  world.stats = { ms: Math.round(now() - t0), steps: ms, objects: objects.length, decor: decor.length, byKind,
    craters: { big: bigs.length, medium: medOk.length, small: smalls.length, tiny: tinies.length } };
  yield { progress: 1, label: 'ready', world };
  return world;
}

/** Bilinear over a moon-sized array (the same arithmetic world-async.js rebuilds on the page). */
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

function chaikin(pts) {
  const out = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}
function resample(pts, step) {
  const out = [pts[0].slice()];
  let carry = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], l = dist(a, b);
    let t = step - carry;
    while (t <= l) { out.push([a[0] + (b[0] - a[0]) * t / l, a[1] + (b[1] - a[1]) * t / l]); t += step; }
    carry = l - (t - step);
  }
  return out;
}
function dist(a, b) { const dx = b[0] - a[0], dz = b[1] - a[1]; return Math.sqrt(dx * dx + dz * dz); }
function r2(v) { return Math.round(v * 100) / 100; }
function r3(v) { return Math.round(v * 1000) / 1000; }
