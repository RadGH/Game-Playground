// World generator — the macro layer. Pure data, no DOM, safe to run in a Web Worker or in node.
//
//   import { generateWorld, DEFAULTS, cellInfo } from './world.js';
//   const world = generateWorld({ seed: 7, method: 'plates', width: 256, height: 128 });
//
// The result is a plain object (no classes) so it can be posted from a worker and saved as JSON:
//   { seed, width, height, opts,
//     elevation, temperature, moisture, flow, biome, region, aura, magic, water, river, volcanic,  ← typed arrays
//     regions, nodes, roads, rivers, lakes, continents, seas, ranges, forests, history }           ← lists
//
// Everything is seeded: the same seed + the same knobs always gives the same world, in any browser.

import { makeRng, makeNoise2D, fbm, ridged, warp2, subSeed, clamp, lerp, smoothstep, normalize, quantile, blur } from './noise.js';
import { classify, BIOMES, isWater, isOcean, LAND_START, lockBiome, BIOME_FAMILIES } from './biomes.js';
import { buildRegions } from './regions.js';
import { placeNodes } from './nodes.js';
import { buildRoads } from './roads.js';
import { makeHistory } from './history.js';
import { Namer } from './names.js';
import { DEFAULT_RELIEF, elevationToMetres } from './relief.js';

/** Every knob, with its default. Ranges and plain-language notes live in README.md. */
export const DEFAULTS = {
  seed: 1,
  width: 256, height: 128,
  method: 'plates',              // noise | plates | voronoi | diamond | archipelago | pangea | mixed
  continentScale: 1.0,           // 0.4 (few huge shapes) … 2.5 (many small ones)
  landmasses: 5,                 // plate / blob / island seed count
  seaLevel: 0.58,                // share of the world that ends up as ocean
  coastRoughness: 0.55,
  mountainScale: 0.55,           // how much ridged relief is laid over the base shape
  mountainSharpness: 0.5,
  thermalErosion: 3,             // smoothing passes that slump steep slopes
  hydraulicErosion: 0.35,        // 0 … 1 → number of rain droplets carving valleys
  riverDensity: 0.5,
  lakeAmount: 0.5,
  temperature: 0.5,              // world-wide warm/cold shift
  latitudeBands: 0.85,           // strength of the equator→pole gradient
  lapseRate: 0.5,                // how much height cools a cell
  windDirection: 'west',         // west | east | north | south | bands
  rainfall: 0.5,
  rainShadow: 0.6,
  biomeVariety: 0.6,
  biomeLock: null,               // null | a key of BIOME_FAMILIES — forces every land cell into one family (single-biome planets)
  polarCaps: 0,                  // 0 … 1 — how far ice caps reach down from the top and bottom rows (0 = off)
  atmosphereTint: null,          // null | '#rrggbb' or { color, strength 0..1 } — a colour wash laid over the drawn map
  palette: null,                 // null | a key of PALETTES in biomes.js — swaps the biome colours (lava, crystal, toxic, void, ember, rust)
  liquid: 'water',               // water | lava | none — 'none' is a dry world: no seas, lakes or rivers; low ground is dry basin
  frame: 'ocean',                // ocean | land | rim — what the map edge fades into (ocean = the classic island framing)
  inhabited: true,               // false skips settlements, ports, roads, bridges, sea lanes, borders and history (landmarks and passes stay)
  nameTheme: null,               // null | a NAME_THEMES key in names.js — a vocabulary for dead, icy, molten … worlds
  auraStrength: 0.35,            // evil/good influence field
  auraBalance: 0.55,             // 0 = all blessed, 1 = all cursed
  magicStrength: 0.3,
  regionCount: 22,
  minRegionCells: 16,
  settlementDensity: 0.5,
  landmarkDensity: 0.5,
  dungeonDensity: 0.5,
  roadExtras: 0.3,
  seaLanes: true,
  history: true,
  namegen: null,                 // a Name Forge instance; without it the built-in namer is used
  raceTable: null,
  onProgress: null,
};

export const METHODS = ['noise', 'plates', 'voronoi', 'diamond', 'archipelago', 'pangea', 'mixed'];
export const WINDS = ['west', 'east', 'north', 'south', 'bands'];

/** Knob sets that give a recognisable world in one click. */
export const PRESETS = {
  'Temperate continents': { method: 'plates', landmasses: 5, seaLevel: 0.58, continentScale: 1.0, mountainScale: 0.55, temperature: 0.5, rainfall: 0.5, auraStrength: 0.3, biomeVariety: 0.65 },
  'Shattered isles': { method: 'archipelago', landmasses: 8, seaLevel: 0.72, continentScale: 1.6, mountainScale: 0.45, temperature: 0.58, rainfall: 0.62, auraStrength: 0.25, biomeVariety: 0.7, seaLanes: true },
  'Frozen north': { method: 'plates', landmasses: 4, seaLevel: 0.55, continentScale: 0.9, mountainScale: 0.7, temperature: 0.24, latitudeBands: 0.95, rainfall: 0.4, biomeVariety: 0.55, auraStrength: 0.3 },
  'Ashen world': { method: 'mixed', landmasses: 6, seaLevel: 0.6, continentScale: 1.2, mountainScale: 0.75, mountainSharpness: 0.75, temperature: 0.66, rainfall: 0.28, auraStrength: 0.85, auraBalance: 0.88, magicStrength: 0.5, biomeVariety: 0.7 },
  'One great land': { method: 'pangea', landmasses: 2, seaLevel: 0.52, continentScale: 0.7, mountainScale: 0.6, temperature: 0.52, rainfall: 0.45, rainShadow: 0.8, biomeVariety: 0.8 },
};

const IDX = (w, x, y) => y * w + x;

// ---------------------------------------------------------------------------- base height methods

function baseNoise(opts, rng) {
  const { width: w, height: h, continentScale: cs } = opts;
  const n1 = makeNoise2D(subSeed(opts.seed, 'shape1')), n2 = makeNoise2D(subSeed(opts.seed, 'shape2'));
  const wx = makeNoise2D(subSeed(opts.seed, 'warpx')), wy = makeNoise2D(subSeed(opts.seed, 'warpy'));
  const f = (2.6 * cs) / w;
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = warp2(wx, wy, x, y, 26 / cs, f * 1.5);
    const big = fbm(n1, p.x * f, p.y * f * 1.7, { octaves: 5, gain: 0.52, freq: 1 });
    const blobs = fbm(n2, x * f * 0.55, y * f * 0.95, { octaves: 2, gain: 0.5 });
    out[IDX(w, x, y)] = big * 0.62 + blobs * 0.38;
  }
  return out;
}

function basePlates(opts, rng) {
  const { width: w, height: h } = opts;
  const count = Math.max(3, Math.round(opts.landmasses * 2.4));
  const sites = [];
  for (let i = 0; i < count; i++) {
    const continental = rng() < 0.44 + opts.landmasses * 0.015;
    sites.push({
      x: rng() * w, y: rng() * h,
      vx: rng.range(-1, 1), vy: rng.range(-1, 1),
      base: continental ? rng.range(0.55, 0.72) : rng.range(0.18, 0.34),
      continental,
    });
  }
  const wx = makeNoise2D(subSeed(opts.seed, 'pwx')), wy = makeNoise2D(subSeed(opts.seed, 'pwy'));
  const det = makeNoise2D(subSeed(opts.seed, 'pdet'));
  const out = new Float32Array(w * h);
  const boundaryWidth = Math.max(4, w * 0.055 / Math.max(0.5, opts.continentScale));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = warp2(wx, wy, x, y, w * 0.055, 5.5 / w);      // wiggly plate edges
    let b1 = -1, b2 = -1, d1 = Infinity, d2 = Infinity;
    for (let i = 0; i < count; i++) {
      const dx = p.x - sites[i].x, dy = (p.y - sites[i].y) * 1.35;
      const d = dx * dx + dy * dy;
      if (d < d1) { d2 = d1; b2 = b1; d1 = d; b1 = i; } else if (d < d2) { d2 = d; b2 = i; }
    }
    const s1 = sites[b1], s2 = sites[b2] || s1;
    const near = 1 - clamp((Math.sqrt(d2) - Math.sqrt(d1)) / boundaryWidth, 0, 1);
    // convergence: are the two plates driving into each other along the line between them?
    let nx = s2.x - s1.x, ny = s2.y - s1.y; const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
    const conv = (s1.vx - s2.vx) * nx + (s1.vy - s2.vy) * ny;
    let e = s1.base;
    if (conv > 0) e += near * conv * (s1.continental && s2.continental ? 0.42 : s1.continental ? 0.3 : -0.16);
    else e += near * conv * (s1.continental ? 0.12 : 0.2);       // rifts and trenches pull down
    e += (fbm(det, x * 3.5 / w, y * 3.5 / w, { octaves: 5 }) - 0.5) * 0.3;
    out[IDX(w, x, y)] = e;
  }
  out.plates = sites;
  return out;
}

function baseVoronoi(opts, rng) {
  const { width: w, height: h } = opts;
  const count = Math.max(8, Math.round(opts.landmasses * 7 * opts.continentScale));
  const sites = [];
  for (let i = 0; i < count; i++) sites.push({ x: rng() * w, y: rng() * h, land: rng() < 0.46, lift: rng.range(0.5, 1) });
  const wx = makeNoise2D(subSeed(opts.seed, 'vwx')), wy = makeNoise2D(subSeed(opts.seed, 'vwy'));
  const det = makeNoise2D(subSeed(opts.seed, 'vdet'));
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = warp2(wx, wy, x, y, w * 0.04 * (0.4 + opts.coastRoughness), 7 / w);
    let b1 = -1, d1 = Infinity, d2 = Infinity;
    for (let i = 0; i < count; i++) {
      const dx = p.x - sites[i].x, dy = (p.y - sites[i].y) * 1.3;
      const d = dx * dx + dy * dy;
      if (d < d1) { d2 = d1; d1 = d; b1 = i; } else if (d < d2) d2 = d;
    }
    const s = sites[b1];
    const edge = clamp((Math.sqrt(d2) - Math.sqrt(d1)) / (w * 0.07), 0, 1);   // 0 at the cell border, 1 in the middle
    let e = s.land ? 0.5 + edge * 0.32 * s.lift : 0.3 - edge * 0.2;
    e += (fbm(det, x * 4 / w, y * 4 / w, { octaves: 5 }) - 0.5) * 0.26;
    out[IDX(w, x, y)] = e;
  }
  return out;
}

function baseDiamond(opts, rng) {
  const { width: w, height: h } = opts;
  let size = 1; while (size + 1 < Math.max(w, h)) size *= 2;
  const n = size + 1;
  const g = new Float32Array(n * n);
  const at = (x, y) => g[y * n + x];
  const set = (x, y, v) => { g[y * n + x] = v; };
  set(0, 0, rng.range(0.3, 0.7)); set(n - 1, 0, rng.range(0.3, 0.7)); set(0, n - 1, rng.range(0.3, 0.7)); set(n - 1, n - 1, rng.range(0.3, 0.7));
  let step = size, scale = 0.55 * (0.6 + opts.continentScale * 0.5);
  while (step > 1) {
    const half = step >> 1;
    for (let y = half; y < n; y += step) for (let x = half; x < n; x += step)
      set(x, y, (at(x - half, y - half) + at(x + half, y - half) + at(x - half, y + half) + at(x + half, y + half)) / 4 + rng.range(-scale, scale));
    for (let y = 0; y < n; y += half) for (let x = (y + half) % step; x < n; x += step) {
      let sum = 0, c = 0;
      if (x - half >= 0) { sum += at(x - half, y); c++; }
      if (x + half < n) { sum += at(x + half, y); c++; }
      if (y - half >= 0) { sum += at(x, y - half); c++; }
      if (y + half < n) { sum += at(x, y + half); c++; }
      set(x, y, sum / c + rng.range(-scale, scale));
    }
    step = half; scale *= 0.54;
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const gx = (x / (w - 1)) * (n - 1), gy = (y / (h - 1)) * (n - 1);
    const x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
    const x1 = Math.min(n - 1, x0 + 1), y1 = Math.min(n - 1, y0 + 1);
    out[IDX(w, x, y)] = lerp(lerp(at(x0, y0), at(x1, y0), fx), lerp(at(x0, y1), at(x1, y1), fx), fy);
  }
  return out;
}

function baseArchipelago(opts, rng) {
  const { width: w, height: h } = opts;
  const count = Math.max(6, Math.round(opts.landmasses * 9 * opts.continentScale));
  const isles = [];
  for (let i = 0; i < count; i++) isles.push({ x: rng.range(w * 0.05, w * 0.95), y: rng.range(h * 0.08, h * 0.92), r: rng.range(w * 0.018, w * 0.075) * (rng() < 0.15 ? 2.2 : 1), a: rng.range(0, Math.PI) });
  const sh = makeNoise2D(subSeed(opts.seed, 'isle'));
  const det = makeNoise2D(subSeed(opts.seed, 'idet'));
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let best = 0;
    for (const I of isles) {
      const dx = x - I.x, dy = (y - I.y) * 1.25;
      const rx = dx * Math.cos(I.a) - dy * Math.sin(I.a), ry = (dx * Math.sin(I.a) + dy * Math.cos(I.a)) * 1.7;
      const d = Math.hypot(rx, ry);
      const wobble = 1 + (fbm(sh, x * 9 / w, y * 9 / w, { octaves: 3 }) - 0.5) * 1.1;
      const v = 1 - clamp(d / (I.r * wobble), 0, 1);
      if (v > best) best = v;
    }
    out[IDX(w, x, y)] = 0.28 + Math.pow(best, 0.75) * 0.55 + (fbm(det, x * 6 / w, y * 6 / w, { octaves: 4 }) - 0.5) * 0.22;
  }
  return out;
}

function basePangea(opts, rng) {
  const { width: w, height: h } = opts;
  const cx = w * rng.range(0.42, 0.58), cy = h * rng.range(0.44, 0.56);
  const ang = makeNoise2D(subSeed(opts.seed, 'pang'));
  const det = makeNoise2D(subSeed(opts.seed, 'pgdet'));
  const wx = makeNoise2D(subSeed(opts.seed, 'pgwx')), wy = makeNoise2D(subSeed(opts.seed, 'pgwy'));
  const out = new Float32Array(w * h);
  const extra = [];
  for (let i = 0; i < Math.max(0, opts.landmasses - 1) * 3; i++) extra.push({ x: rng() * w, y: rng() * h, r: rng.range(w * 0.012, w * 0.04) });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = warp2(wx, wy, x, y, w * 0.09, 3.2 / w);
    const dx = (p.x - cx) / (w * 0.42), dy = (p.y - cy) / (h * 0.46);
    const d = Math.hypot(dx, dy);
    const theta = Math.atan2(dy, dx);
    const lobes = 0.72 + (fbm(ang, Math.cos(theta) * 1.4 + 3, Math.sin(theta) * 1.4 + 3, { octaves: 3 }) - 0.5) * 0.9;
    let e = 0.34 + smoothstep(lobes + 0.18, lobes - 0.3, d) * 0.42;
    for (const I of extra) { const dd = Math.hypot(x - I.x, (y - I.y) * 1.3); if (dd < I.r) e = Math.max(e, 0.5 + (1 - dd / I.r) * 0.18); }
    e += (fbm(det, x * 4.5 / w, y * 4.5 / w, { octaves: 5 }) - 0.5) * 0.26;
    out[IDX(w, x, y)] = e;
  }
  return out;
}

function baseMixed(opts, rng) {
  const { width: w, height: h } = opts;
  const a = basePlates(opts, makeRng(subSeed(opts.seed, 'mix-a')));
  const b = baseNoise(opts, makeRng(subSeed(opts.seed, 'mix-b')));
  const c = baseArchipelago({ ...opts, landmasses: Math.max(2, Math.round(opts.landmasses * 0.6)) }, makeRng(subSeed(opts.seed, 'mix-c')));
  normalize(a); normalize(b); normalize(c);
  const blend = makeNoise2D(subSeed(opts.seed, 'mixblend'));
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = IDX(w, x, y);
    const t = fbm(blend, x * 2.2 / w, y * 2.2 / w, { octaves: 2 });
    out[i] = a[i] * (0.35 + t * 0.4) + b[i] * (0.5 - t * 0.25) + c[i] * (0.2 + (1 - t) * 0.12);
  }
  out.plates = a.plates;
  return out;
}

const BASE_METHODS = { noise: baseNoise, plates: basePlates, voronoi: baseVoronoi, diamond: baseDiamond, archipelago: baseArchipelago, pangea: basePangea, mixed: baseMixed };

/** Edge falloff so the map is framed by ocean instead of clipped land — noisy so it is not an oval. */
/**
 * Fade the map out towards its edge. `opts.frame` picks what it fades into:
 *   'ocean' — pushed down below sea level, so every world is framed in water (the classic look)
 *   'land'  — eased towards the map's own average ground, so the edge is just more terrain
 *   'rim'   — raised into a ring of high ground, like standing inside a crater wall
 */
function applyEdgeMask(hArr, opts) {
  const { width: w, height: h } = opts;
  const frame = opts.frame === 'land' || opts.frame === 'rim' ? opts.frame : 'ocean';
  const n = makeNoise2D(subSeed(opts.seed, 'mask'));
  let mean = 0;
  if (frame !== 'ocean') { for (let i = 0; i < hArr.length; i++) mean += hArr[i]; mean /= hArr.length; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (x / (w - 1)) * 2 - 1, dy = (y / (h - 1)) * 2 - 1;
    const wob = (fbm(n, x * 3 / w, y * 3 / w, { octaves: 3 }) - 0.5) * 0.34;
    const d = Math.max(Math.abs(dx), Math.abs(dy) * 0.94) + wob * 0.5;
    const m = 1 - smoothstep(0.68, 1.02, d);
    const i = IDX(w, x, y);
    if (frame === 'ocean') hArr[i] = hArr[i] * (0.25 + 0.75 * m) - (1 - m) * 0.18;
    else if (frame === 'land') hArr[i] = hArr[i] * m + mean * (1 - m);
    else hArr[i] = hArr[i] * m + (mean + 0.35) * (1 - m);
  }
}

// ---------------------------------------------------------------------------- erosion

/** Thermal erosion: slump anything steeper than the talus angle into its lowest neighbour. */
function thermalErode(hArr, w, h, passes, talus = 0.012) {
  const delta = new Float32Array(hArr.length);
  for (let p = 0; p < passes; p++) {
    delta.fill(0);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = IDX(w, x, y); let lowest = -1, drop = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = IDX(w, xx, yy), d = hArr[i] - hArr[j];
        if (d > drop) { drop = d; lowest = j; }
      }
      if (lowest >= 0 && drop > talus) { const move = (drop - talus) * 0.45; delta[i] -= move; delta[lowest] += move; }
    }
    for (let i = 0; i < hArr.length; i++) hArr[i] += delta[i];
  }
}

/**
 * Hydraulic erosion by rain droplets: drop water on a random cell, let it roll downhill picking up
 * and dropping sediment. This is what carves branching valleys instead of smooth domes.
 */
function hydraulicErode(hArr, w, h, drops, rng, opts = {}) {
  const { inertia = 0.05, capacityK = 3.2, erodeK = 0.32, depositK = 0.28, evap = 0.02, minSlope = 0.0008, maxSteps = 48, gravity = 4 } = opts;
  const sample = (x, y) => {
    const x0 = Math.min(w - 2, Math.max(0, Math.floor(x))), y0 = Math.min(h - 2, Math.max(0, Math.floor(y)));
    const fx = x - x0, fy = y - y0;
    const i = IDX(w, x0, y0);
    const h00 = hArr[i], h10 = hArr[i + 1], h01 = hArr[i + w], h11 = hArr[i + w + 1];
    return {
      height: h00 * (1 - fx) * (1 - fy) + h10 * fx * (1 - fy) + h01 * (1 - fx) * fy + h11 * fx * fy,
      gx: (h10 - h00) * (1 - fy) + (h11 - h01) * fy,
      gy: (h01 - h00) * (1 - fx) + (h11 - h10) * fx,
      i, fx, fy,
    };
  };
  const deposit = (s, amount) => {
    hArr[s.i] += amount * (1 - s.fx) * (1 - s.fy); hArr[s.i + 1] += amount * s.fx * (1 - s.fy);
    hArr[s.i + w] += amount * (1 - s.fx) * s.fy; hArr[s.i + w + 1] += amount * s.fx * s.fy;
  };
  for (let d = 0; d < drops; d++) {
    let x = rng() * (w - 2) + 0.5, y = rng() * (h - 2) + 0.5, dx = 0, dy = 0, water = 1, speed = 1, sediment = 0;
    for (let step = 0; step < maxSteps; step++) {
      const s = sample(x, y);
      dx = dx * inertia - s.gx * (1 - inertia); dy = dy * inertia - s.gy * (1 - inertia);
      const len = Math.hypot(dx, dy); if (len < 1e-6) break;
      dx /= len; dy /= len;
      const nx = x + dx, ny = y + dy;
      if (nx < 1 || ny < 1 || nx >= w - 1 || ny >= h - 1) break;
      const ns = sample(nx, ny);
      const dh = ns.height - s.height;
      const capacity = Math.max(-dh, minSlope) * speed * water * capacityK;
      if (dh > 0 || sediment > capacity) {
        const drop = dh > 0 ? Math.min(dh, sediment) : (sediment - capacity) * depositK;
        sediment -= drop; deposit(s, drop);
      } else {
        const take = Math.min((capacity - sediment) * erodeK, -dh);
        sediment += take; deposit(s, -take);
      }
      speed = Math.sqrt(Math.max(0, speed * speed + -dh * gravity));
      water *= 1 - evap;
      x = nx; y = ny;
      if (water < 0.01) break;
    }
  }
}

// ---------------------------------------------------------------------------- water, rivers

/** Tiny binary min-heap over (index, key) pairs — used by the depression fill. */
export class MinHeap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    this.k.push(key); this.v.push(val); let i = this.k.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (this.k[p] <= this.k[i]) break; this.swap(p, i); i = p; }
  }
  pop() {
    const top = this.v[0], lastK = this.k.pop(), lastV = this.v.pop();
    if (this.k.length) {
      this.k[0] = lastK; this.v[0] = lastV; let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < this.k.length && this.k[l] < this.k[m]) m = l;
        if (r < this.k.length && this.k[r] < this.k[m]) m = r;
        if (m === i) break; this.swap(m, i); i = m;
      }
    }
    return top;
  }
  swap(a, b) { [this.k[a], this.k[b]] = [this.k[b], this.k[a]]; [this.v[a], this.v[b]] = [this.v[b], this.v[a]]; }
}

/**
 * Fill depressions so every land cell drains somewhere (priority flood). Returns the filled surface;
 * wherever the filled surface sits above the real ground there is standing water — a lake.
 */
export function fillDepressions(elev, w, h, water, epsilon = 1e-5) {
  const filled = Float32Array.from(elev);
  const seen = new Uint8Array(elev.length);
  const heap = new MinHeap();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = IDX(w, x, y);
    if (water[i] === 1 || x === 0 || y === 0 || x === w - 1 || y === h - 1) { seen[i] = 1; heap.push(filled[i], i); }
  }
  while (heap.size) {
    const i = heap.pop();
    const x = i % w, y = (i / w) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const j = IDX(w, xx, yy); if (seen[j]) continue;
      seen[j] = 1;
      if (filled[j] <= filled[i]) filled[j] = filled[i] + epsilon;
      heap.push(filled[j], j);
    }
  }
  return filled;
}

// ---------------------------------------------------------------------------- the generator

/** Generate a world. See DEFAULTS for every knob. */
export function generateWorld(userOpts = {}) {
  const opts = { ...DEFAULTS, ...userOpts };
  opts.width = Math.max(64, Math.min(512, Math.round(opts.width)));
  opts.height = Math.max(32, Math.min(256, Math.round(opts.height)));
  const w = opts.width, h = opts.height, N = w * h;
  const progress = (f, label) => opts.onProgress?.(f, label);
  const rng = makeRng(opts.seed);
  const t0 = Date.now();

  // 1 — base shape ---------------------------------------------------------
  progress(0.02, 'shaping the land');
  const method = BASE_METHODS[opts.method] ? opts.method : 'plates';
  const elevation = BASE_METHODS[method](opts, makeRng(subSeed(opts.seed, 'base-' + method)));
  const plates = elevation.plates || null;
  normalize(elevation);
  if (method !== 'pangea') applyEdgeMask(elevation, opts); else applyEdgeMask(elevation, { ...opts, seed: opts.seed ^ 7 });
  normalize(elevation);

  // 2 — mountain ranges laid over it ---------------------------------------
  progress(0.12, 'raising mountains');
  const ridgeNoise = makeNoise2D(subSeed(opts.seed, 'ridge'));
  const rwx = makeNoise2D(subSeed(opts.seed, 'ridgewx')), rwy = makeNoise2D(subSeed(opts.seed, 'ridgewy'));
  const ridgeField = new Float32Array(N);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = IDX(w, x, y);
    const p = warp2(rwx, rwy, x, y, w * 0.05, 4 / w);
    const r = ridged(ridgeNoise, p.x * 5.5 / w, p.y * 5.5 / w, { octaves: 5, sharpness: 1.6 + opts.mountainSharpness * 1.6 });
    ridgeField[i] = r;
    const band = smoothstep(0.42, 0.78, elevation[i]);
    elevation[i] += r * band * opts.mountainScale * 0.55;
  }
  normalize(elevation);

  // 3 — erosion ------------------------------------------------------------
  if (opts.thermalErosion > 0) { progress(0.2, 'slumping slopes'); thermalErode(elevation, w, h, Math.round(opts.thermalErosion)); }
  if (opts.hydraulicErosion > 0) {
    progress(0.26, 'raining on the rock');
    const drops = Math.round(opts.hydraulicErosion * N * 1.2);
    hydraulicErode(elevation, w, h, drops, makeRng(subSeed(opts.seed, 'droplets')));
  }
  normalize(elevation);

  // 4 — sea level: pick the height that leaves the asked-for share of ocean --
  progress(0.36, 'pouring the sea');
  const shore = quantile(elevation, clamp(opts.seaLevel, 0.02, 0.95));
  let maxE = 0; for (let i = 0; i < N; i++) if (elevation[i] > maxE) maxE = elevation[i];
  const spanLand = Math.max(1e-4, maxE - shore), spanSea = Math.max(1e-4, shore);
  for (let i = 0; i < N; i++) elevation[i] = elevation[i] >= shore ? 0.5 + ((elevation[i] - shore) / spanLand) * 0.5 : (elevation[i] / spanSea) * 0.5;

  // 5 — coast roughness + mountain sharpness -------------------------------
  const cn = makeNoise2D(subSeed(opts.seed, 'coast'));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = IDX(w, x, y);
    const near = Math.exp(-Math.pow((elevation[i] - 0.5) / 0.07, 2));
    elevation[i] = clamp(elevation[i] + (fbm(cn, x * 22 / w, y * 22 / w, { octaves: 3 }) - 0.5) * 0.1 * opts.coastRoughness * near, 0, 1);
    if (elevation[i] > 0.5) {
      const land01 = (elevation[i] - 0.5) * 2;
      elevation[i] = 0.5 + Math.pow(land01, 1 + opts.mountainSharpness * 1.1) * 0.5;
    }
  }

  // 6 — ocean vs inland water ---------------------------------------------
  progress(0.42, 'finding the coasts');
  const water = new Uint8Array(N);        // 0 land, 1 ocean, 2 lake
  // a dry world (liquid: 'none') keeps every cell as land: what would have been sea is low basin
  const dry = opts.liquid === 'none';
  if (!dry) {
    const stack = [];
    for (let x = 0; x < w; x++) { stack.push(IDX(w, x, 0), IDX(w, x, h - 1)); }
    for (let y = 0; y < h; y++) { stack.push(IDX(w, 0, y), IDX(w, w - 1, y)); }
    while (stack.length) {
      const i = stack.pop();
      if (water[i] === 1 || elevation[i] >= 0.5) continue;
      water[i] = 1;
      const x = i % w, y = (i / w) | 0;
      if (x > 0) stack.push(i - 1); if (x < w - 1) stack.push(i + 1);
      if (y > 0) stack.push(i - w); if (y < h - 1) stack.push(i + w);
    }
    for (let i = 0; i < N; i++) if (elevation[i] < 0.5 && water[i] !== 1) water[i] = 2;   // enclosed → inland sea/lake
  }

  // 7 — climate ------------------------------------------------------------
  progress(0.48, 'setting the climate');
  const temperature = new Float32Array(N), moisture = new Float32Array(N);
  const tn = makeNoise2D(subSeed(opts.seed, 'temp'));
  for (let y = 0; y < h; y++) {
    const lat = Math.abs(((y + 0.5) / h) * 2 - 1);
    for (let x = 0; x < w; x++) {
      const i = IDX(w, x, y);
      let t = 1 - Math.pow(lat, 1.45);
      t = lerp(0.62, t, clamp(opts.latitudeBands, 0, 1));
      t += (opts.temperature - 0.5) * 0.95;
      if (elevation[i] > 0.5) t -= (elevation[i] - 0.5) * 2 * opts.lapseRate * 0.62;
      t += (fbm(tn, x * 5 / w, y * 5 / w, { octaves: 3 }) - 0.5) * 0.12;
      temperature[i] = clamp(t, 0, 1);
    }
  }
  computeMoisture(elevation, water, moisture, opts);

  // 8 — drainage: fill sinks, flow, rivers, lakes ---------------------------
  progress(0.58, 'running the rivers');
  const filled = fillDepressions(elevation, w, h, water, 1e-5);
  const lakeDepth = lerp(0.018, 0.0022, clamp(opts.lakeAmount, 0, 1));
  if (!dry) for (let i = 0; i < N; i++) if (water[i] === 0 && filled[i] - elevation[i] > lakeDepth) water[i] = 2;

  // process cells from the highest filled surface down, so accumulation only ever flows forwards
  const ordArr = new Int32Array(N); for (let i = 0; i < N; i++) ordArr[i] = i;
  ordArr.sort((a, b) => filled[b] - filled[a]);
  const down = new Int32Array(N).fill(-1);
  for (const i of ordArr) {
    if (water[i] === 1) continue;
    const x = i % w, y = (i / w) | 0;
    let best = -1, bestDrop = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const j = IDX(w, xx, yy);
      const drop = (filled[i] - filled[j]) / Math.hypot(dx, dy);
      if (drop > bestDrop) { bestDrop = drop; best = j; }
    }
    down[i] = best;
  }
  const flow = new Float32Array(N);
  for (let i = 0; i < N; i++) flow[i] = water[i] === 1 ? 0 : 0.35 + moisture[i] * 1.3;
  for (const i of ordArr) { const d = down[i]; if (d >= 0 && water[i] !== 1) flow[d] += flow[i]; }

  const areaScale = N / (256 * 128);
  // river density 0 means no rivers at all — it used to leave a threshold of 150, so the biggest
  // drainage lines still became rivers — and a dry world has none whatever the knob says
  const noRivers = dry || !(opts.riverDensity > 0);
  const riverThreshold = noRivers ? Infinity : lerp(150, 16, clamp(opts.riverDensity, 0, 1)) * Math.sqrt(areaScale);
  const river = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (water[i] !== 0) continue;
    if (flow[i] >= riverThreshold) river[i] = flow[i] > riverThreshold * 12 ? 3 : flow[i] > riverThreshold * 4 ? 2 : 1;
  }
  // moisture bonus along fresh water
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = IDX(w, x, y);
    if (river[i] || water[i] === 2) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const j = IDX(w, xx, yy); const d = Math.hypot(dx, dy);
      if (water[j] === 0) moisture[j] = clamp(moisture[j] + 0.16 / (1 + d * d), 0, 1);
    }
  }

  // trace river courses into polylines
  const rivers = traceRivers({ w, h, river, water, down, flow });

  // 9 — aura and magic ------------------------------------------------------
  progress(0.66, 'seeding the aura');
  const aura = new Float32Array(N), magic = new Float32Array(N), volcanic = new Uint8Array(N);
  const an = makeNoise2D(subSeed(opts.seed, 'aura')), an2 = makeNoise2D(subSeed(opts.seed, 'aura2'));
  const mn = makeNoise2D(subSeed(opts.seed, 'magic'));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = IDX(w, x, y);
    const a = fbm(an, x * 2.6 / w, y * 2.6 / w, { octaves: 4 }) * 0.7 + fbm(an2, x * 7 / w, y * 7 / w, { octaves: 3 }) * 0.3;
    aura[i] = clamp(((a - 0.5) * 2 + (opts.auraBalance - 0.5) * 1.6) * (0.35 + opts.auraStrength * 1.8), -1, 1);
    magic[i] = clamp(fbm(mn, x * 4.5 / w, y * 4.5 / w, { octaves: 4 }) * (0.3 + opts.magicStrength * 1.7) - 0.12, 0, 1);
    const relief = ridgeField[i];
    if (elevation[i] > 0.62 && relief > 0.72 && (magic[i] > 0.55 || aura[i] > 0.45)) volcanic[i] = 1;
  }

  // 10 — biomes -------------------------------------------------------------
  progress(0.72, 'growing biomes');
  const biome = new Uint8Array(N);
  const slope = new Float32Array(N);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = IDX(w, x, y);
    const l = elevation[IDX(w, Math.max(0, x - 1), y)], r = elevation[IDX(w, Math.min(w - 1, x + 1), y)];
    const u = elevation[IDX(w, x, Math.max(0, y - 1))], d = elevation[IDX(w, x, Math.min(h - 1, y + 1))];
    slope[i] = clamp(Math.hypot(r - l, d - u) * 9, 0, 1);
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = IDX(w, x, y);
    let nearOcean = false;
    for (let dy = -1; dy <= 1 && !nearOcean; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      if (water[IDX(w, xx, yy)] === 1) { nearOcean = true; break; }
    }
    biome[i] = classify({
      elev: elevation[i], temp: temperature[i], moist: moisture[i], slope: slope[i],
      aura: aura[i], magic: magic[i], water: water[i], depth: water[i] ? (0.5 - elevation[i]) / 0.5 : 0,
      nearOcean, volcanic: volcanic[i] === 1,
    }, opts.biomeVariety);
  }

  // 10b — optional planet knobs: lock every land cell into one biome family, then freeze the poles.
  // Both are off by default, so a normal world is unaffected.
  if (opts.biomeLock && BIOME_FAMILIES[opts.biomeLock]) {
    for (let i = 0; i < N; i++) {
      biome[i] = lockBiome(biome[i], opts.biomeLock, { elev: elevation[i], slope: slope[i], moist: moisture[i] });
    }
  }
  if (opts.polarCaps > 0) {
    const reach = clamp(opts.polarCaps, 0, 1) * 0.42;             // at 1 the caps come a bit past the tropics
    const ragged = makeNoise2D(subSeed(opts.seed, 'caps'));
    for (let y = 0; y < h; y++) {
      const lat = Math.abs(((y + 0.5) / h) * 2 - 1);               // 0 equator … 1 pole
      for (let x = 0; x < w; x++) {
        const i = IDX(w, x, y);
        const edge = 1 - reach + (fbm(ragged, x * 7 / w, y * 7 / h, { octaves: 3 }) - 0.5) * 0.16;
        if (lat < edge) continue;
        biome[i] = water[i] === 0 ? 12 : 25;                       // ice sheet on land, sea ice on water
        if (water[i] === 0) temperature[i] = Math.min(temperature[i], 0.1);
      }
    }
  }

  // 11 — continents ---------------------------------------------------------
  const continents = findContinents(w, h, water);

  const world = {
    schema: 1, kind: 'world', seed: opts.seed, width: w, height: h, method,
    opts: serialisableOpts(opts),
    elevation, temperature, moisture, flow, biome, water, river, aura, magic, volcanic, slope,
    filled, down,
    regions: [], nodes: [], roads: [], seaLanes: [], rivers, lakes: [], continents, seas: [], ranges: [], forests: [], history: [],
    plates: plates ? plates.map(p => ({ x: p.x, y: p.y, vx: p.vx, vy: p.vy, continental: p.continental })) : null,
    stats: {},
  };

  // 12 — regions, nodes, roads, history ------------------------------------
  progress(0.78, 'drawing borders');
  // one namer for the whole world, carrying the naming theme (null for World Forge's own worlds)
  world._namer = new Namer({ namegen: opts.namegen, raceTable: opts.raceTable, seed: world.seed, theme: opts.nameTheme });
  buildRegions(world, opts);
  progress(0.86, 'founding towns');
  placeNodes(world, opts);
  progress(0.92, 'laying roads');
  buildRoads(world, opts);
  if (opts.history && opts.inhabited !== false) { progress(0.97, 'writing history'); makeHistory(world, opts); }

  let land = 0, waterCells = 0;
  for (let i = 0; i < N; i++) { if (water[i] === 0) land++; else waterCells++; }
  world.stats = {
    landCells: land, waterCells, landFraction: land / N,
    regions: world.regions.length, nodes: world.nodes.length, roads: world.roads.length, rivers: world.rivers.length,
    lakes: world.lakes.length, continents: world.continents.length, ms: Date.now() - t0,
  };
  progress(1, 'done');
  return world;
}

/** Prevailing-wind moisture sweep: air picks up water over sea and drops it climbing land (rain shadow). */
function computeMoisture(elevation, water, moisture, opts) {
  const w = opts.width, h = opts.height;
  const dirs = { west: [1, 0], east: [-1, 0], north: [0, 1], south: [0, -1] };
  const rainK = 0.02 + (1 - opts.rainfall) * 0.012;
  const orographic = 8 + opts.rainShadow * 20;
  const runLine = (sx, sy, dx, dy) => {
    let humidity = 0.7, prev = 0.5;
    let x = sx, y = sy;
    while (x >= 0 && y >= 0 && x < w && y < h) {
      const i = IDX(w, x, y);
      if (water[i] !== 0) { humidity = Math.min(1, humidity + 0.16 * (1 - humidity) + 0.03); moisture[i] = Math.max(moisture[i], 0.9); }
      else {
        const rise = Math.max(0, elevation[i] - prev);
        let rain = humidity * (rainK + rise * orographic);
        rain = Math.min(rain, humidity * 0.5);
        moisture[i] = Math.max(moisture[i], rain);
        humidity -= rain * (0.5 + opts.rainShadow * 0.45);
        humidity += 0.02 * (1 - humidity);          // land breathes some water back (plants, lakes, soil)
        humidity = Math.max(0, humidity);
      }
      prev = elevation[i];
      x += dx; y += dy;
    }
  };
  if (opts.windDirection === 'bands') {
    for (let y = 0; y < h; y++) {
      const lat = Math.abs(((y + 0.5) / h) * 2 - 1);
      const eastward = lat > 0.32 && lat < 0.68;           // westerlies in the middle latitudes, trades elsewhere
      if (eastward) runLine(0, y, 1, 0); else runLine(w - 1, y, -1, 0);
    }
  } else {
    const [dx, dy] = dirs[opts.windDirection] || dirs.west;
    if (dx) { for (let y = 0; y < h; y++) runLine(dx > 0 ? 0 : w - 1, y, dx, 0); }
    else { for (let x = 0; x < w; x++) runLine(x, dy > 0 ? 0 : h - 1, 0, dy); }
  }
  // normalise the land part against a high percentile (one freak rainy cell must not flatten the rest)
  const landVals = [];
  for (let i = 0; i < moisture.length; i++) if (water[i] === 0) landVals.push(moisture[i]);
  landVals.sort((a, b) => a - b);
  const max = (landVals.length ? landVals[Math.floor(landVals.length * 0.92)] : 1) || 1;
  const mn = makeNoise2D(subSeed(opts.seed, 'moistnoise'));
  // rain also follows latitude: wet at the equator, a dry belt either side, wet again in the
  // middle latitudes, dry at the poles. Mixing that with the wind sweep stops continental
  // interiors from turning into one flat desert.
  const latBase = y => {
    const lat = Math.abs(((y + 0.5) / h) * 2 - 1);
    return clamp(0.22 + 0.62 * Math.exp(-Math.pow(lat / 0.2, 2)) + 0.45 * Math.exp(-Math.pow((lat - 0.62) / 0.22, 2)), 0, 1);
  };
  for (let y = 0; y < h; y++) {
    const lb = latBase(y);
    for (let x = 0; x < w; x++) {
      const i = IDX(w, x, y);
      if (water[i] !== 0) { moisture[i] = 1; continue; }
      let m = Math.min(1.25, moisture[i] / max);
      m = Math.pow(m, 0.72);
      m = m * 0.56 + lb * 0.44;
      m = m * (0.7 + opts.rainfall * 0.6) + (opts.rainfall - 0.5) * 0.2;
      m += (fbm(mn, x * 8 / w, y * 8 / w, { octaves: 3 }) - 0.5) * 0.16;
      moisture[i] = clamp(m, 0, 1);
    }
  }
  blur(moisture, w, h, 1);
}

/** Follow every river from its source to the sea or a lake, and record the polyline. */
export function traceRivers({ w, h, river, water, down, flow }) {
  const N = w * h;
  const isRiver = i => i >= 0 && i < N && river[i] > 0;
  const hasUpstream = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (isRiver(i) && down[i] >= 0 && isRiver(down[i])) hasUpstream[down[i]] = 1;
  const rivers = [];
  const claimed = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (!isRiver(i) || hasUpstream[i]) continue;
    const cells = []; let cur = i, guard = 0, mouth = null;
    while (cur >= 0 && guard++ < N) {
      cells.push(cur);
      claimed[cur] = 1;
      const nxt = down[cur];
      if (nxt < 0) { mouth = { x: cur % w, y: (cur / w) | 0, type: water[cur] === 1 ? 'sea' : water[cur] === 2 ? 'lake' : 'sink' }; break; }
      if (water[nxt] === 1) { cells.push(nxt); mouth = { x: nxt % w, y: (nxt / w) | 0, type: 'sea' }; break; }
      if (water[nxt] === 2) { cells.push(nxt); mouth = { x: nxt % w, y: (nxt / w) | 0, type: 'lake' }; break; }
      if (claimed[nxt] && !isRiver(nxt)) { mouth = { x: nxt % w, y: (nxt / w) | 0, type: 'confluence' }; break; }
      if (claimed[nxt]) { cells.push(nxt); mouth = { x: nxt % w, y: (nxt / w) | 0, type: 'confluence' }; break; }
      cur = nxt;
    }
    if (cells.length < 3) continue;
    const last = cells[cells.length - 1];
    rivers.push({
      id: rivers.length, cells, length: cells.length,
      width: Math.max(...cells.map(c => river[c] || 0)),
      flow: flow[last],
      source: { x: cells[0] % w, y: (cells[0] / w) | 0 },
      mouth: mouth || { x: last % w, y: (last / w) | 0, type: water[last] === 1 ? 'sea' : water[last] === 2 ? 'lake' : 'sink' },
      name: null,
    });
  }
  rivers.sort((a, b) => b.length - a.length);
  rivers.forEach((r, i) => { r.id = i; });
  return rivers;
}

/** Connected land masses, largest first. */
function findContinents(w, h, water) {
  const N = w * h, seen = new Uint8Array(N), out = [];
  for (let s = 0; s < N; s++) {
    if (seen[s] || water[s] !== 0) continue;
    const stack = [s]; seen[s] = 1;
    let n = 0, sx = 0, sy = 0, minX = w, maxX = 0, minY = h, maxY = 0;
    const cells = [];
    while (stack.length) {
      const i = stack.pop(); const x = i % w, y = (i / w) | 0;
      n++; sx += x; sy += y; cells.push(i);
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      const push = j => { if (j >= 0 && j < N && !seen[j] && water[j] === 0) { seen[j] = 1; stack.push(j); } };
      if (x > 0) push(i - 1); if (x < w - 1) push(i + 1); if (y > 0) push(i - w); if (y < h - 1) push(i + w);
    }
    out.push({ id: out.length, cells: n, center: { x: Math.round(sx / n), y: Math.round(sy / n) }, bbox: [minX, minY, maxX, maxY], name: null, sample: cells[0] });
  }
  out.sort((a, b) => b.cells - a.cells);
  out.forEach((c, i) => { c.id = i; });
  return out;
}

/** Strip functions and big objects so the knob set can be posted to a worker or saved to JSON. */
function serialisableOpts(opts) {
  const o = { ...opts };
  delete o.onProgress; delete o.namegen; delete o.raceTable;
  return o;
}

// Heights: DEFAULT_RELIEF and elevationToMetres live in relief.js (the renderer needs them without
// pulling in the generator) and are re-exported from here for old callers.
export { DEFAULT_RELIEF, elevationToMetres };

/** Readable info about one cell — used by the viewer's hover readout and by games. */
export function cellInfo(world, x, y) {
  if (x < 0 || y < 0 || x >= world.width || y >= world.height) return null;
  const i = y * world.width + x;
  const b = BIOMES[world.biome[i]];
  const region = world.region ? world.regions[world.region[i]] : null;
  const relief = world.relief || DEFAULT_RELIEF;
  const heightMetres = elevationToMetres(world.elevation[i], relief);
  const wet = world.water[i] !== 0;
  return {
    x, y, index: i,
    biome: b.key, biomeName: b.name,
    elevation: world.elevation[i],
    elevationMetres: heightMetres,
    // the same number, spelled out: height above the datum (negative below it), how deep the water
    // is when there is a sea, and what the height is measured from
    heightMetres,
    depthMetres: wet && relief.datum !== 'datum' ? Math.max(0, -heightMetres) : 0,
    datum: relief.datum || 'sea', datumLabel: relief.label || (relief.datum === 'datum' ? 'datum' : 'sea level'),
    temperature: world.temperature[i],
    temperatureC: Math.round(-24 + world.temperature[i] * 62),
    moisture: world.moisture[i],
    water: world.water[i] === 1 ? 'ocean' : world.water[i] === 2 ? 'lake' : 'land',
    river: world.river[i] > 0 ? world.river[i] : 0,
    flow: world.flow[i],
    aura: world.aura[i], magic: world.magic[i],
    region: region ? { id: region.id, name: region.name } : null,
  };
}

/** Nearest node to a cell (any type, or filtered). */
export function nearestNode(world, x, y, filter = null) {
  let best = null, bd = Infinity;
  for (const n of world.nodes) {
    if (filter && !filter(n)) continue;
    const d = (n.x - x) ** 2 + (n.y - y) ** 2;
    if (d < bd) { bd = d; best = n; }
  }
  return best ? { node: best, distance: Math.sqrt(bd) } : null;
}

export { IDX, isWater, isOcean, LAND_START, BIOMES };
