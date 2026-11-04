// The macro map: the whole planet at one macro cell per `macroCell` (32) metres. PURE — runs in node
// and in the sim worker. Seamless east-west by construction: every field is 3D noise sampled on a
// CYLINDER (longitude → an angle), so x = 0 and x = mw - 1 are neighbours exactly like any other
// pair. North and south end in ice caps nobody can cross.
//
//   const m = generateMacro({ seed: 7, width: 4096, water: 0.45, shape: 'continents' });
//   m.mw, m.mh            macro size (width / 32, half that tall)
//   m.elev[i]             0..1, sea level = m.sea
//   m.temp[i], m.moist[i] 0..1
//   m.biome[i]            row of BIOMES (js/planet/biomes.js)
//   m.river[i]            0 none, 1..3 river size (flow)
//   m.rivers              [{ pts: [[x, y], ...] }] polylines in macro cells, x may run past mw (unwrapped)
//   m.site[i]             0..1 how good a place to land is
//
// Why our own and not worldgen/js/world.js: worldgen frames every map in ocean and its drainage,
// regions and A* all assume hard edges (its README says so). Rewriting those to wrap would touch
// most of that file; the planet needs fewer layers, so this is the smaller, seamless version.

import { makeNoise3D, makeRng, subSeed } from './noise.js';
import { BIOME } from './biomes.js';

const TAU = Math.PI * 2;

/** fBm of 3D noise, normalised to about 0..1. */
function fbm3(n, x, y, z, oct, gain = 0.5) {
  let a = 1, f = 1, s = 0, norm = 0;
  for (let o = 0; o < oct; o++) { s += a * n(x * f, y * f, z * f); norm += a; a *= gain; f *= 2.03; }
  return s / norm * 0.5 + 0.5;
}
function ridged3(n, x, y, z, oct) {
  let a = 1, f = 1, s = 0, norm = 0, prev = 1;
  for (let o = 0; o < oct; o++) { let v = 1 - Math.abs(n(x * f, y * f, z * f)); v *= v; s += a * v * prev; norm += a; prev = v; a *= 0.5; f *= 2.1; }
  return s / norm;
}

/**
 * Where a macro cell sits on the unit cylinder. u = 0..1 around, v = 0..0.5 down (the map is twice
 * as wide as it is tall, so a circle of radius 1/TAU keeps one unit of v the same length as one of u).
 */
export function cylinder(u, v, freq) {
  const a = u * TAU, r = freq / TAU;
  return [Math.cos(a) * r, v * freq, Math.sin(a) * r];
}

export function generateMacro(opts = {}) {
  const seed = (opts.seed ?? 1) >>> 0;
  const macroCell = opts.macroCell ?? 32;
  const width = opts.width ?? 4096;
  const mw = Math.max(16, Math.round(width / macroCell)), mh = mw >> 1;
  const water = opts.water ?? 0.45;
  const shape = opts.shape ?? 'continents';
  const iceRows = Math.max(1, Math.round(mh * (opts.iceRows ?? 0.06)));
  const N = mw * mh;

  const nElev = makeNoise3D(subSeed(seed, 'elev'));
  const nWarp = makeNoise3D(subSeed(seed, 'warp'));
  const nMount = makeNoise3D(subSeed(seed, 'mount'));
  const nMoist = makeNoise3D(subSeed(seed, 'moist'));
  const nOdd = makeNoise3D(subSeed(seed, 'odd'));
  const nOddKind = makeNoise3D(subSeed(seed, 'oddkind'));

  // continent scale is planet-relative (a tiny world still has a few continents, not one blob);
  // more octaves on bigger worlds so the extra resolution actually has detail in it
  const baseFreq = shape === 'archipelago' ? 7 : shape === 'pangea' ? 2.2 : 3.6;
  const oct = Math.min(8, 4 + Math.round(Math.log2(mw / 32)));

  const elev = new Float32Array(N), temp = new Float32Array(N), moist = new Float32Array(N);
  const mount = new Float32Array(N), odd = new Float32Array(N), oddKind = new Float32Array(N);
  for (let y = 0; y < mh; y++) {
    const v = (y + 0.5) / mw;                       // 0..0.5
    const lat = (y + 0.5) / mh * 2 - 1;             // -1 north .. 1 south
    for (let x = 0; x < mw; x++) {
      const u = (x + 0.5) / mw;
      const [px, py, pz] = cylinder(u, v, baseFreq);
      const w = 0.35;
      const wx = nWarp(px * 1.7, py * 1.7, pz * 1.7) * w, wy = nWarp(px * 1.7 + 9.1, py * 1.7, pz * 1.7) * w;
      let e = fbm3(nElev, px + wx, py + wy, pz + wx * 0.5, oct);
      if (shape === 'pangea') e = e * 0.8 + 0.2 * (1 - Math.abs(lat));
      if (shape === 'archipelago') e = Math.pow(e, 1.3);
      const i = y * mw + x;
      elev[i] = e;
      const [mx, my, mz] = cylinder(u, v, baseFreq * 2.4);
      mount[i] = ridged3(nMount, mx, my, mz, Math.max(3, oct - 2));
      const [qx, qy, qz] = cylinder(u, v, baseFreq * 1.8);
      moist[i] = fbm3(nMoist, qx, qy, qz, 4);
      const [ox, oy, oz] = cylinder(u, v, baseFreq * 3.1);
      odd[i] = fbm3(nOdd, ox, oy, oz, 3);
      oddKind[i] = fbm3(nOddKind, ox * 0.6, oy * 0.6, oz * 0.6, 2);
    }
  }

  // sea level = the percentile that leaves `water` of the planet under water
  const sorted = Float32Array.from(elev).sort();
  const sea = sorted[Math.min(N - 1, Math.floor(N * water))];
  // mountains rise only on land, more the further inland (higher) it is
  for (let i = 0; i < N; i++) {
    const land = elev[i] - sea;
    if (land > 0) {
      const inland = Math.min(1, land / 0.12);
      elev[i] += Math.max(0, mount[i] - 0.45) * 0.55 * inland;
    }
  }
  let top = 0; for (let i = 0; i < N; i++) if (elev[i] > top) top = elev[i];

  // temperature: latitude + height; moisture: noise, wetter by the sea
  for (let y = 0; y < mh; y++) {
    const lat = Math.abs((y + 0.5) / mh * 2 - 1);
    for (let x = 0; x < mw; x++) {
      const i = y * mw + x;
      const h = Math.max(0, (elev[i] - sea) / Math.max(1e-6, top - sea));
      temp[i] = clamp01(1 - lat * 0.95 - h * 0.55);
    }
  }
  const coast = coastDistance(elev, sea, mw, mh);
  for (let i = 0; i < N; i++) moist[i] = clamp01(moist[i] * 0.75 + Math.max(0, 0.35 - coast[i] * 0.04));

  // rivers: from wet high ground, steepest way down (wrapping in x) until the sea or a pit
  const flow = new Float32Array(N);
  const river = new Uint8Array(N);
  const rivers = [];
  const rng = makeRng(subSeed(seed, 'rivers'));
  const order = [];
  for (let i = 0; i < N; i++) if (elev[i] > sea) order.push(i);
  order.sort((a, b) => elev[b] - elev[a]);
  for (const i of order) flow[i] += moist[i];
  const down = new Int32Array(N).fill(-1);
  for (const i of order) {
    const x = i % mw, y = (i / mw) | 0;
    let best = -1, be = elev[i];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const ny = y + dy; if (ny < 0 || ny >= mh) continue;
      const j = ny * mw + wrap(x + dx, mw);
      if (elev[j] < be) { be = elev[j]; best = j; }
    }
    down[i] = best;
    if (best >= 0) flow[best] += flow[i];
  }
  const riverMin = 5 * Math.pow(Math.max(1, mw / 128), 0.8);
  const seen = new Uint8Array(N);
  for (const i of order) {
    if (flow[i] < riverMin || seen[i] || temp[i] < 0.08) continue;
    // only start where nothing upstream is already a river (a source)
    const pts = [];
    let j = i, ux = i % mw, steps = 0;
    while (j >= 0 && elev[j] > sea && steps++ < mw * 2) {
      const x = j % mw, y = (j / mw) | 0;
      // unwrapped x so a river crossing the seam stays one continuous line
      if (pts.length) { const px = pts[pts.length - 1][0]; let dx = x - wrap(px, mw); if (dx > mw / 2) dx -= mw; if (dx < -mw / 2) dx += mw; ux = px + dx; } else ux = x;
      pts.push([ux + 0.5 + (rng() - 0.5) * 0.5, y + 0.5 + (rng() - 0.5) * 0.5]);
      const size = flow[j] > riverMin * 8 ? 3 : flow[j] > riverMin * 3 ? 2 : 1;
      if (river[j] >= size && seen[j]) { break; }        // joined a bigger river
      river[j] = Math.max(river[j], size); seen[j] = 1;
      j = down[j];
    }
    if (j >= 0 && pts.length) { const x = j % mw, y = (j / mw) | 0; let dx = x - wrap(pts[pts.length - 1][0], mw); if (dx > mw / 2) dx -= mw; if (dx < -mw / 2) dx += mw; pts.push([pts[pts.length - 1][0] + dx + 0.5, y + 0.5]); }
    if (pts.length >= 3) rivers.push({ pts, size: river[i] || 1, mouth: j >= 0 && elev[j] <= sea });
  }

  // biomes
  const biome = new Uint8Array(N);
  for (let y = 0; y < mh; y++) {
    for (let x = 0; x < mw; x++) {
      const i = y * mw + x;
      biome[i] = classify(elev[i], sea, top, temp[i], moist[i], mount[i], odd[i], oddKind[i], river[i], y < iceRows || y >= mh - iceRows);
    }
  }
  // a pit no river could leave is a lake
  for (const i of order) if (down[i] < 0 && flow[i] > riverMin && biome[i] !== BIOME.ice) biome[i] = BIOME.lake;

  // landing quality: land, temperate, near fresh water, wood and hills; never strange
  const site = new Float32Array(N);
  for (let y = 2; y < mh - 2; y++) for (let x = 0; x < mw; x++) {
    const i = y * mw + x, b = biome[i];
    if (!(b === BIOME.grass || b === BIOME.meadow || b === BIOME.forest) || temp[i] < 0.42) continue;
    let s = 0.3, wood = 0, hill = 0, wet = 0, bad = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const j = (y + dy) * mw + wrap(x + dx, mw), c = biome[j];
      if (c === BIOME.forest || c === BIOME.deepwood) wood++;
      if (c === BIOME.hills || c === BIOME.mountain) hill++;
      if (river[j] || c === BIOME.lake || c === BIOME.sea || c === BIOME.beach) wet++;
      if (c === BIOME.volcanic || c === BIOME.moor) bad++;
    }
    s += Math.min(wood, 6) * 0.06 + Math.min(hill, 4) * 0.08 + Math.min(wet, 3) * 0.08 - bad * 0.1;
    site[i] = clamp01(s);
  }

  return { seed, width: mw * macroCell, height: mh * macroCell, macroCell, mw, mh, sea, top, iceRows, elev, temp, moist, mount, biome, river, rivers, flow, site, shape, water };
}

function classify(e, sea, top, t, m, mount, odd, oddKind, river, polar) {
  if (polar || t < 0.04) return e > sea ? BIOME.ice : BIOME.ice;
  if (e <= sea) return e < sea - 0.06 ? BIOME.deep : BIOME.sea;
  const h = (e - sea) / Math.max(1e-6, top - sea);
  if (h < 0.025) return BIOME.beach;
  if (h > 0.62 || (h > 0.48 && t < 0.3)) return BIOME.peak;
  // strange lands: patches where the 'odd' field runs high; volcanic likes mountains, moor likes wet lowland
  if (odd > 0.7) {
    if (oddKind < 0.35 && h > 0.15) return BIOME.volcanic;
    if (oddKind < 0.5 && m > 0.45) return BIOME.moor;
    if (oddKind < 0.6) return BIOME.crystal;
    return BIOME.ruins;
  }
  if (h > 0.36 || mount > 0.78) return BIOME.mountain;
  if (h > 0.2 || mount > 0.66) return BIOME.hills;
  if (river >= 2 && m > 0.55 && h < 0.08) return BIOME.marsh;
  if (m > 0.62) return BIOME.deepwood;
  if (m > 0.47) return BIOME.forest;
  if (m > 0.36) return BIOME.grass;
  return BIOME.meadow;
}

/** Rough distance (in macro cells) from each land cell to the sea, wrapping x. Two-pass chamfer. */
function coastDistance(elev, sea, mw, mh) {
  const N = mw * mh, d = new Float32Array(N);
  for (let i = 0; i < N; i++) d[i] = elev[i] <= sea ? 0 : 1e9;
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < mh; y++) for (let k = 0; k < mw * 2; k++) {
      const x = k % mw, i = y * mw + x;
      const l = y * mw + wrap(x - 1, mw); if (d[l] + 1 < d[i]) d[i] = d[l] + 1;
      if (y > 0) { const u = i - mw; if (d[u] + 1 < d[i]) d[i] = d[u] + 1; }
    }
    for (let y = mh - 1; y >= 0; y--) for (let k = mw * 2 - 1; k >= 0; k--) {
      const x = k % mw, i = y * mw + x;
      const r = y * mw + wrap(x + 1, mw); if (d[r] + 1 < d[i]) d[i] = d[r] + 1;
      if (y < mh - 1) { const b = i + mw; if (d[b] + 1 < d[i]) d[i] = d[b] + 1; }
    }
  }
  return d;
}

export function wrap(x, w) { return ((x % w) + w) % w; }
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

/** Bilinear read of a macro field at a fractional macro position, wrapping x and clamping y. */
export function sampleMacro(field, mw, mh, fx, fy) {
  fx -= 0.5; fy -= 0.5;
  const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
  const xa = wrap(x0, mw), xb = wrap(x0 + 1, mw);
  const ya = Math.max(0, Math.min(mh - 1, y0)), yb = Math.max(0, Math.min(mh - 1, y0 + 1));
  const a = field[ya * mw + xa], b = field[ya * mw + xb], c = field[yb * mw + xa], d = field[yb * mw + xb];
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}
