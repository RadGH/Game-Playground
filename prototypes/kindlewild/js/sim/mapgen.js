// Map generator. PURE, seeded: the same seed + recipe always gives the same land.
//
// The pipeline (PLAN §6):
//   1. height  — fbm + ridges, shaped by the recipe (plain, valley, basin, island, volcano, flat)
//   2. moisture + temperature — noise, wetter low down, colder high up, the recipe's climate on top
//   3. biome per cell (data/biomes.json) — ground + scattered cells
//   4. water   — everything under the sea line is filled to it (still water, costs nothing), and
//                rivers are CARVED down to below that line from high wet ground to the nearest water,
//                so a river is a long still arm of the lake: free to run, and a meteor can still
//                breach a bank and empty it
//   5. features — crystal glades, lava vents on volcanic peaks, ruins
//   6. sites   — flat dry spots near water for villages, open ground for herds (the game spawns them)

import { makeNoise } from './noise.js';
import { makeRng } from './rng.js';
import { setCell, LEVEL } from './world.js';

export function generate(w, biomesJson, recipeId, seed, opts = {}) {
  const recipe = { ...biomesJson.recipes[recipeId] || biomesJson.recipes.greenvale, ...(opts.recipe || {}) };
  const B = biomesJson.biomes;
  const M = w.M, ID = M.id, W = w.W, H = w.H;
  const rng = makeRng(seed);
  const nz = makeNoise(seed);
  const nm = makeNoise(seed * 7 + 11);
  const nt = makeNoise(seed * 13 + 5);
  const nf = makeNoise(seed * 3 + 101);
  const sc = 1 / 70;
  const hf = new Float32Array(W * H);
  // 1. height 0..1
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H;
    let h = 0.5 + nz.fbm(x * sc, y * sc, 5) * 0.55 + (nz.ridge(x * sc * 0.6 + 40, y * sc * 0.6) - 0.6) * 0.25;
    const dx = u - 0.5, dy = v - 0.5, r = Math.hypot(dx, dy) * 2;
    switch (recipe.shape) {
      case 'flat': h = 0.5; break;
      case 'island': h = h * 0.8 + 0.35 - r * r * 0.55; break;
      case 'basin': h = h * 0.75 + (r - 0.5) * 0.35; break;
      case 'valley': h = h * 0.7 + Math.abs(dx) * 0.8 - 0.05; break;
      case 'volcano': { const cone = Math.max(0, 1 - r * 1.6); h = h * 0.6 + cone * 0.55 - (r < 0.12 ? (0.12 - r) * 2.5 : 0) + 0.05; break; }
      default: break;
    }
    if (opts.shapeFn) h = opts.shapeFn(h, x, y, u, v);
    hf[y * W + x] = Math.max(0, Math.min(1, h));
  }
  const sea = recipe.sea ?? 0.3;
  const HMAX = 120;
  for (let i = 0; i < w.N; i++) w.height[i] = Math.round(20 + hf[i] * HMAX);
  const seaH = Math.round(20 + sea * HMAX);

  // 4a. rivers: walk downhill from high wet spots, carving
  const riverCells = new Uint8Array(W * H);
  for (let r = 0; r < (recipe.rivers ?? 0); r++) {
    let best = -1, bestS = -1;
    for (let t = 0; t < 60; t++) {
      const x = 10 + rng.int(W - 20), y = 10 + rng.int(H - 20);
      const s = hf[y * W + x] + nm.fbm(x * sc, y * sc, 3) * 0.3;
      if (hf[y * W + x] > sea + 0.15 && s > bestS) { bestS = s; best = y * W + x; }
    }
    if (best < 0) continue;
    let x = best % W, y = (best / W) | 0;
    let wobble = rng() * Math.PI * 2;
    for (let step = 0; step < W * 3; step++) {
      const i = y * W + x;
      if (hf[i] < sea - 0.01) break;
      // carve a 2-3 wide channel down below the sea line
      const width = 1 + (step > 30 ? 1 : 0) + (rng() < 0.3 ? 1 : 0);
      for (let oy = -width; oy <= width; oy++) for (let ox = -width; ox <= width; ox++) {
        const xx = x + ox, yy = y + oy;
        if (xx < 1 || yy < 1 || xx >= W - 1 || yy >= H - 1) continue;
        if (ox * ox + oy * oy > width * width) continue;
        const j = yy * W + xx;
        riverCells[j] = 1;
        hf[j] = Math.min(hf[j], sea - 0.03 - (ox === 0 && oy === 0 ? 0.02 : 0));
      }
      // next: the lowest neighbour, with a wandering bias so it meanders
      wobble += (rng() - 0.5) * 0.6;
      let bx = x, by = y, bs = Infinity;
      for (let d = 0; d < 8; d++) {
        const a = d * Math.PI / 4;
        const nx = x + Math.round(Math.cos(a)), ny = y + Math.round(Math.sin(a));
        if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1) continue;
        const s = hf[ny * W + nx] - Math.cos(a - wobble) * 0.01 + (riverCells[ny * W + nx] ? 0.05 : 0);
        if (s < bs) { bs = s; bx = nx; by = ny; }
      }
      if (bx === x && by === y) break;
      x = bx; y = by;
      if (x <= 1 || y <= 1 || x >= W - 2 || y >= H - 2) break;
    }
  }
  for (let i = 0; i < w.N; i++) w.height[i] = Math.round(20 + hf[i] * HMAX);

  // 2-3. biomes
  const biomeOf = new Array(W * H);
  const glades = [];
  for (let g = 0; g < (recipe.glades ?? 0); g++) glades.push([20 + rng.int(W - 40), 20 + rng.int(H - 40), 8 + rng.int(8)]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const h = hf[i];
    const m = nm.fbm(x * sc * 1.3, y * sc * 1.3, 4) * 0.6 + (recipe.wet ?? 0) + (sea - h) * 0.8;
    const T = nt.fbm(x * sc * 0.7, y * sc * 0.7, 3) * 0.4 + (recipe.temp ?? 0) - Math.max(0, h - 0.6) * 1.5;
    let b;
    if (recipe.shape === 'flat') b = 'grass';
    else if (h < sea + 0.02) b = T < -0.4 ? 'tundra' : 'beach';
    else if (h > 0.86) b = T < 0.2 ? 'peak' : 'mountain';
    else if (h > 0.74) b = 'mountain';
    else if (recipe.shape === 'volcano' && h > 0.55) b = 'ash';
    else if (T < -0.3) b = m > 0.1 ? 'pines' : 'tundra';
    else if (T > 0.55 && m < 0.1) b = 'desert';
    else if (T > 0.4 && m < 0.25) b = 'steppe';
    else if (m > 0.55 && h < sea + 0.12) b = 'marsh';
    else {
      const f = nf.fbm(x * sc * 2, y * sc * 2, 3) + m * 0.4;
      b = f > 0.32 ? 'forest' : f > 0.05 ? 'grass' : 'meadow';
    }
    for (const [gx, gy, gr] of glades) if ((x - gx) ** 2 + (y - gy) ** 2 < gr * gr * (0.7 + nf.n2(x * 0.2, y * 0.2) * 0.3) && h > sea + 0.03) b = 'glade';
    if (recipe.biome) b = recipe.biome;
    biomeOf[i] = b;
    const bio = B[b] || B.grass;
    w.ground[i] = ID[bio.ground];
    w.mat[i] = 0;
    if (h >= sea) {
      for (const [mid, p] of bio.scatter) {
        if (rng() < p * (opts.scatterScale ?? 1)) { setCell(w, i, ID[mid]); break; }
      }
    }
  }

  // 4b. water: fill everything under the sea line, to the line (still: no flow, no cost)
  if (sea > 0) {
    for (let i = 0; i < w.N; i++) {
      if (w.height[i] < seaH) {
        const depth = Math.min(255, (seaH - w.height[i]) * LEVEL);
        w.mat[i] = ID.water; w.life[i] = depth; w.flag[i] = 0;
        if (w.ground[i] !== ID.snow) w.ground[i] = w.height[i] < seaH - 3 ? ID.sand : (w.ground[i] === ID.marsh ? ID.marsh : ID.sand);
        if (biomeOf[i] === 'tundra' && w.height[i] > seaH - 3 && rng() < 0.8) { w.mat[i] = ID.ice; }
      }
    }
  }

  // 5. features
  const vents = [];
  for (let v = 0; v < (recipe.vents ?? 0); v++) {
    // the highest few spots
    let best = -1, bh = -1;
    for (let t = 0; t < 400; t++) {
      const i = rng.int(w.N);
      const x = i % W, y = (i / W) | 0;
      if (x < 8 || y < 8 || x > W - 9 || y > H - 9) continue;
      if (vents.some(([vx, vy]) => Math.hypot(vx - x, vy - y) < 30)) continue;
      if (w.height[i] > bh) { bh = w.height[i]; best = i; }
    }
    if (best >= 0) {
      const x = best % W, y = (best / W) | 0;
      vents.push([x, y]);
      if (!opts.dormantVents) setCell(w, best, ID.vent);
      for (let k = 0; k < 40; k++) {
        const xx = x + rng.int(9) - 4, yy = y + rng.int(9) - 4;
        if (w.inside(xx, yy)) w.ground[yy * W + xx] = ID.basalt;
      }
    }
  }

  // 6. sites: villages on flat dry land near water
  const sites = [];
  const flatness = (x, y, r) => {
    let lo = 255, hi = 0, wet = 0, blocked = 0;
    for (let yy = y - r; yy <= y + r; yy += 2) for (let xx = x - r; xx <= x + r; xx += 2) {
      if (!w.inside(xx, yy)) return 999;
      const j = yy * W + xx;
      if (M.liquid[w.mat[j]]) wet++;
      if (w.mat[j] === ID.boulder) blocked++;
      lo = Math.min(lo, w.height[j]); hi = Math.max(hi, w.height[j]);
    }
    return (hi - lo) + wet * 10 + blocked * 2;
  };
  for (let v = 0; v < (recipe.villages ?? 0) + (opts.extraSites ?? 0); v++) {
    let best = null, bs = Infinity;
    for (let t = 0; t < 140; t++) {
      const x = 24 + rng.int(W - 48), y = 24 + rng.int(H - 48);
      if (sites.some(s => Math.hypot(s.x - x, s.y - y) < 60)) continue;
      const b = biomeOf[y * W + x];
      if (b === 'mountain' || b === 'peak' || b === 'marsh' || b === 'ash') continue;
      let s = flatness(x, y, 10);
      // near water is good
      let near = 99;
      for (let k = 0; k < 24; k++) {
        const a = k / 24 * Math.PI * 2;
        for (let rr = 12; rr < 40; rr += 4) {
          const xx = (x + Math.cos(a) * rr) | 0, yy = (y + Math.sin(a) * rr) | 0;
          if (w.inside(xx, yy) && w.mat[yy * W + xx] === ID.water) { near = Math.min(near, rr); break; }
        }
      }
      s += near * 0.3 + rng() * 4;
      if (s < bs) { bs = s; best = { x, y }; }
    }
    if (best) sites.push(best);
  }
  // clear village ground
  for (const s of sites) {
    for (let yy = s.y - 12; yy <= s.y + 12; yy++) for (let xx = s.x - 12; xx <= s.x + 12; xx++) {
      if (!w.inside(xx, yy)) continue;
      const j = yy * W + xx;
      if ((xx - s.x) ** 2 + (yy - s.y) ** 2 > 150) continue;
      if (!M.liquid[w.mat[j]]) { w.mat[j] = 0; if (w.ground[j] === ID.snow || w.ground[j] === ID.sand) w.ground[j] = ID.dirt; }
    }
  }
  w.heightVer++;
  w.wakeAll();
  return { recipe, sites, vents, biomeOf, seaH };
}

/** Pick a random open spot of a biome kind ('land', 'water', or a biome id) — for herds and dens. */
export function findSpot(w, info, rng, want = 'land', avoid = []) {
  const M = w.M;
  if (want === 'water') {
    // deep water can be rare: look at every cell, then pick one at random
    const deep = [];
    for (let i = 0; i < w.N; i += 3) if (w.mat[i] === M.id.water && w.life[i] > 12) deep.push(i);
    if (!deep.length) return null;
    const i = deep[(rng() * deep.length) | 0];
    return { x: i % w.W, y: (i / w.W) | 0 };
  }
  for (let t = 0; t < 300; t++) {
    const x = 6 + rng.int(w.W - 12), y = 6 + rng.int(w.H - 12);
    const i = y * w.W + x;
    if (avoid.some(a => Math.hypot(a.x - x, a.y - y) < (a.r ?? 30))) continue;
    const m = w.mat[i];
    if (want === 'water') { if (m === M.id.water && w.life[i] > 12) return { x, y }; continue; }
    if (M.liquid[m] || M.solid[m]) continue;
    if (want !== 'land' && info.biomeOf[i] !== want) continue;
    return { x, y };
  }
  return null;
}
