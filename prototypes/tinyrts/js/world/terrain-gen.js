// Seeded terrain generation. Same seed + options always gives the same map.
//
// Steps: surface height line -> flatten home pads -> rock body with a dust skin -> caves
// (worm tunnels) -> ore veins (guaranteed near each base) -> bedrock floor and sides.
//
// Options:
//   width, height   map size in cells
//   seed            number
//   style           'rolling' | 'canyons' | 'islands' | 'flat'
//   bases           [{x, w}] home pads (center x, pad width) — kept flat and cave-free
//   caves           0..1 how much tunneling
//   ore             0.5..2 ore richness

import { Rng } from '../core/rng.js';
import { M } from './materials.js';

// 1D value noise with smooth interpolation, a few octaves.
function makeNoise1D(rng, size = 512) {
  const vals = new Float32Array(size);
  for (let i = 0; i < size; i++) vals[i] = rng.next() * 2 - 1;
  return (x) => {
    const xi = Math.floor(x), t = x - xi;
    const a = vals[((xi % size) + size) % size], b = vals[(((xi + 1) % size) + size) % size];
    const s = t * t * (3 - 2 * t);
    return a + (b - a) * s;
  };
}

function fbm(noise, x, octaves, baseFreq) {
  let sum = 0, amp = 1, freq = baseFreq, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += noise(x * freq + o * 97.3) * amp;
    norm += amp; amp *= 0.5; freq *= 2;
  }
  return sum / norm;
}

export function generateTerrain(world, opts = {}) {
  const W = world.w, H = world.h;
  const rng = new Rng(opts.seed ?? 1);
  const style = opts.style || 'rolling';
  const bases = opts.bases || [];
  const caveAmt = opts.caves ?? (style === 'flat' ? 0.2 : 0.6);
  const oreRich = opts.ore ?? 1;
  const noise = makeNoise1D(rng);

  const baseLevel = Math.round(H * (opts.groundLevel ?? 0.55));
  const amp = { rolling: 0.16, canyons: 0.22, islands: 0.2, flat: 0.03 }[style] * H;

  // 1. Surface line.
  const surf = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    let n = fbm(noise, x, 4, 1 / 90);
    if (style === 'canyons') {
      // Terraced plateaus with sharp drops.
      n = Math.round(n * 3) / 3 + fbm(noise, x + 5000, 2, 1 / 30) * 0.08;
    }
    surf[x] = baseLevel + n * amp;
  }
  // Canyons: carve 1-3 steep chasms away from bases.
  if (style === 'canyons') {
    const n = rng.int(1, 3);
    for (let k = 0; k < n; k++) {
      const cx = rng.int(Math.floor(W * 0.25), Math.floor(W * 0.75));
      if (bases.some((b) => Math.abs(b.x - cx) < b.w)) continue;
      const cw = rng.int(14, 30), depth = rng.int(30, 60);
      for (let x = cx - cw; x <= cx + cw; x++) {
        if (x < 0 || x >= W) continue;
        const t = 1 - Math.abs(x - cx) / cw;
        surf[x] += depth * Math.min(1, t * 1.6);
      }
    }
  }

  // 2. Flatten home pads, blending into the surrounding terrain.
  for (const b of bases) {
    const lo = Math.max(0, Math.floor(b.x - b.w / 2)), hi = Math.min(W - 1, Math.ceil(b.x + b.w / 2));
    let avg = 0;
    for (let x = lo; x <= hi; x++) avg += surf[x];
    avg = Math.round(avg / (hi - lo + 1));
    b.y = avg;
    const blend = 40;
    for (let x = lo - blend; x <= hi + blend; x++) {
      if (x < 0 || x >= W) continue;
      let t = 1;
      if (x < lo) t = 1 - (lo - x) / blend;
      else if (x > hi) t = 1 - (x - hi) / blend;
      t = t * t * (3 - 2 * t);
      surf[x] = surf[x] * (1 - t) + avg * t;
    }
  }

  // Keep a margin at top and bottom.
  for (let x = 0; x < W; x++) surf[x] = Math.max(H * 0.2, Math.min(H - 30, surf[x]));

  // 3. Fill rock with a dust skin.
  const dustDepth = new Uint8Array(W);
  for (let x = 0; x < W; x++) dustDepth[x] = 2 + Math.floor((fbm(noise, x + 9000, 2, 1 / 20) + 1) * 1.5);
  for (let x = 0; x < W; x++) {
    const top = Math.round(surf[x]);
    for (let y = top; y < H; y++) {
      const i = y * W + x;
      world.mat[i] = y - top < dustDepth[x] ? M.DUST : M.ROCK;
    }
  }

  // Islands: floating rock masses held up by thin pillars (so they are anchored).
  if (style === 'islands') {
    const count = rng.int(2, 4);
    for (let k = 0; k < count; k++) {
      const cx = rng.int(Math.floor(W * 0.2), Math.floor(W * 0.8));
      if (bases.some((b) => Math.abs(b.x - cx) < b.w)) continue;
      const iw = rng.int(20, 40), ih = rng.int(8, 14);
      const cy = Math.round(surf[cx] - rng.int(40, 70));
      if (cy < 20) continue;
      for (let x = cx - iw; x <= cx + iw; x++) {
        const t = 1 - Math.abs(x - cx) / iw;
        const depth = Math.round(ih * Math.sqrt(Math.max(0, t)));
        for (let y = cy; y < cy + depth; y++) if (world.inBounds(x, y)) world.mat[y * W + x] = y === cy ? M.DUST : M.ROCK;
      }
      const px = cx + rng.int(-4, 4);
      for (let y = cy; y < Math.round(surf[px]); y++) for (let x = px - 2; x <= px + 2; x++) if (world.inBounds(x, y)) world.mat[y * W + x] = M.ROCK;
    }
  }

  // 4. Caves: worm tunnels below the surface, kept away from home pads.
  const protectedX = (x) => bases.some((b) => Math.abs(x - b.x) < b.w / 2 + 12);
  const worms = Math.round((W / 160) * caveAmt * 2);
  for (let k = 0; k < worms; k++) {
    let x = rng.range(20, W - 20);
    let y = rng.range(surf[Math.floor(x)] + 25, H - 20);
    let ang = rng.range(-0.4, 0.4) + (rng.chance(0.5) ? 0 : Math.PI);
    const len = rng.int(60, 200);
    let r = rng.range(3, 6);
    for (let s = 0; s < len; s++) {
      ang += rng.range(-0.35, 0.35);
      ang = Math.atan2(Math.sin(ang) * 0.85, Math.cos(ang)); // lean toward horizontal tunnels
      x += Math.cos(ang) * 1.5; y += Math.sin(ang) * 1.5;
      r = Math.max(2.5, Math.min(7, r + rng.range(-0.3, 0.3)));
      if (x < 8 || x > W - 8) break;
      const sy = surf[Math.floor(x)];
      if (y < sy + 14) y = sy + 14;
      if (y > H - 14) y = H - 14;
      if (protectedX(x)) continue;
      carveCircle(world, x, y, r);
    }
  }

  // 5. Ore veins.
  const placeVein = (mat, cx, cy, size) => {
    let x = cx, y = cy;
    for (let s = 0; s < size; s++) {
      const r = rng.range(1.5, 3.2);
      for (let yy = Math.floor(y - r); yy <= y + r; yy++) for (let xx = Math.floor(x - r); xx <= x + r; xx++) {
        if (!world.inBounds(xx, yy)) continue;
        if ((xx - x) ** 2 + (yy - y) ** 2 > r * r) continue;
        const i = yy * W + xx;
        if (world.mat[i] === M.ROCK || world.mat[i] === M.DUST) world.mat[i] = mat;
      }
      x += rng.range(-2.5, 2.5); y += rng.range(-1.2, 1.8);
    }
  };
  // Guaranteed ore near each base: 2 crystal veins and 1 ferrite vein within reach of the core.
  for (const b of bases) {
    for (let k = 0; k < 2; k++) {
      const off = (k === 0 ? -1 : 1) * rng.int(Math.floor(b.w / 2) + 6, Math.floor(b.w / 2) + 40);
      const vx = Math.max(10, Math.min(W - 10, b.x + off));
      placeVein(M.CRYSTAL, vx, surf[Math.floor(vx)] + rng.int(6, 14), Math.round(44 * oreRich));
    }
    const fx = Math.max(10, Math.min(W - 10, b.x + (b.x < W / 2 ? 1 : -1) * rng.int(40, 70)));
    placeVein(M.FERRITE, fx, surf[Math.floor(fx)] + rng.int(8, 16), Math.round(36 * oreRich));
  }
  // Scattered ore: crystal shallow, ferrite deeper and richer toward the middle.
  const scatter = Math.round((W / 90) * oreRich);
  for (let k = 0; k < scatter; k++) {
    const x = rng.int(10, W - 10);
    const mid = 1 - Math.abs(x - W / 2) / (W / 2);
    if (rng.chance(0.55 - mid * 0.25)) placeVein(M.CRYSTAL, x, surf[x] + rng.int(4, 30), rng.int(14, 28));
    else placeVein(M.FERRITE, x, surf[x] + rng.int(14, 60), rng.int(14, 24 + Math.round(mid * 14)));
  }

  // 6. Bedrock floor and side walls below the surface.
  for (let x = 0; x < W; x++) {
    const floorH = 5 + (noise(x * 0.2 + 300) > 0.3 ? 1 : 0);
    for (let y = H - floorH; y < H; y++) world.mat[y * W + x] = M.BEDROCK;
  }
  for (let y = 0; y < H; y++) for (const x of [0, 1, W - 2, W - 1]) {
    if (y >= Math.round(surf[x]) + 4) world.mat[y * W + x] = M.BEDROCK;
  }

  // Initialize HP and chunk flags.
  for (let i = 0; i < W * H; i++) world.hp[i] = world.mats.hp[world.mat[i]];
  world.dirtyGfx.fill(1); world.dirtyNav.fill(1); world.awakeNext.fill(1); world.awake.fill(1);
  world.anyGfxDirty = true; world.anyNavDirty = true;

  return { surface: surf, bases };
}

export function carveCircle(world, cx, cy, r, keepBedrock = true) {
  const W = world.w;
  for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
    if (!world.inBounds(x, y)) continue;
    if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
    const i = y * W + x;
    if (keepBedrock && world.mat[i] === M.BEDROCK) continue;
    world.mat[i] = M.EMPTY;
  }
}

// Standard base layout for a map: returns [{x, w}] for 1 or 2 bases.
export function defaultBases(W, versus) {
  // Cores sit ~110 cells in from the edge so there's room behind them for the economy.
  const pad = 90;
  if (versus) return [{ x: 110, w: pad }, { x: W - 110, w: pad }];
  return [{ x: 110, w: pad }];
}
