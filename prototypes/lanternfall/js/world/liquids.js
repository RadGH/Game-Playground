// Liquid helpers (docs/06 §8): the level equaliser (pressure-lite), surfaces, shock flood fill, basins.
// Pure.
import { CLS } from './materials.js';
import { F } from './grid.js';

/**
 * Equaliser: every 8th tick take up to `bodies` liquid bodies that have cells stuck wandering on a flat
 * surface, flood fill them (budget 20k cells), and move cells from the highest surface to the lowest open
 * spot touching the body. Fixes U-bends and wide 1-cell stair slopes that falling-sand rules leave behind.
 */
export function stepLiquids(world) {
  const g = world.grid; if (!world.stuckLiquid) world.stuckLiquid = [];
  if (g.tick % 8 !== 0) return 0;
  const seeds = world.stuckLiquid; world.stuckLiquid = [];
  const visit = world._visit || (world._visit = new Uint32Array(g.n)); world._visitId = (world._visitId || 0) + 1;
  let moved = 0, bodies = 0;
  for (const s of seeds) {
    if (bodies >= 6) break;
    if (visit[s] === world._visitId || g.mats.cls[g.mat[s]] !== CLS.LIQUID) continue;
    bodies++; moved += equaliseBody(world, g, s, visit, world._visitId, 32);
  }
  return moved;
}

function equaliseBody(world, g, seed, visit, vid, budget) {
  const W = g.W, H = g.H, mat = g.mat, cls = g.mats.cls, m0 = mat[seed];
  const stack = [seed]; visit[seed] = vid; let n = 0;
  const tops = [], lows = [];
  const isOpen = j => mat[j] === 0 || cls[mat[j]] === CLS.GAS;
  while (stack.length && n < 20000) {
    const i = stack.pop(); n++;
    const x = i % W, y = (i / W) | 0;
    if (y > 0 && isOpen(i - W)) tops.push(i);
    const nb = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1];
    for (let k = 0; k < 4; k++) {
      const j = nb[k]; if (j < 0 || visit[j] === vid) continue;
      if (mat[j] === m0) { visit[j] = vid; stack.push(j); }
      else if (isOpen(j) && k !== 2) { // open spot beside or below the body, resting on something
        const jy = (j / W) | 0; if (jy < H - 1) { const b = mat[j + W]; if (b !== 0 && cls[b] !== CLS.GAS) { visit[j] = vid; lows.push(j); } }
      }
    }
  }
  if (!tops.length || !lows.length) return 0;
  tops.sort((a, b) => a - b);            // smallest index = highest
  lows.sort((a, b) => b - a);            // largest index = lowest
  let moved = 0;
  for (let k = 0; k < Math.min(budget, tops.length, lows.length); k++) {
    const t = tops[k], l = lows[k], ty = (t / W) | 0, ly = (l / W) | 0;
    if (ly <= ty + 1) break;
    const tx = t % W, lx = l % W;
    const flags = g.flags[t] & F.FROM_WATER, temp = g.temp[t];
    g.set(tx, ty, 0); g.set(lx, ly, m0, { flags, temp });
    moved++;
  }
  return moved;
}

/** Walk up from (x, y) while liquid; returns the surface y (first liquid row) or -1 if not in liquid. */
export function surfaceAt(g, x, y) {
  x |= 0; y |= 0; if (!g.liquidAt(x, y)) return -1;
  while (y > 0 && g.liquidAt(x, y - 1)) y--;
  return y;
}

/** Spark in water: flood-fill connected water (and touching metal) with SHOCK for `ticks`. */
export function electrify(world, x, y, ticks = 30, budget = 20000) {
  const g = world.grid, W = g.W, H = g.H; x |= 0; y |= 0; if (!g.inside(x, y)) return 0;
  const start = y * W + x, m = g.mat[start]; if (m !== 22 && m !== 4 && m !== 25) return 0;
  const visit = world._visit || (world._visit = new Uint32Array(g.n)); const vid = world._visitId = (world._visitId || 0) + 1;
  const stack = [start]; visit[start] = vid; let n = 0; const list = [];
  while (stack.length && n < budget) {
    const i = stack.pop(); n++; list.push(i);
    g.flags[i] |= F.SHOCK; const cx = i % W, cy = (i / W) | 0; g.touchGfx(cx, cy);
    const nb = [cx > 0 ? i - 1 : -1, cx < W - 1 ? i + 1 : -1, cy > 0 ? i - W : -1, cy < H - 1 ? i + W : -1];
    for (const j of nb) { if (j < 0 || visit[j] === vid) continue; const t = g.mat[j]; if (t === 22 || t === 4 || t === 25) { visit[j] = vid; stack.push(j); } }
  }
  (world.shocked || (world.shocked = [])).push({ until: g.tick + ticks, cells: list });
  return n;
}
/** Clear SHOCK flags whose time is up. */
export function stepShock(world) {
  const g = world.grid; if (!world.shocked?.length) return;
  const keep = [];
  for (const s of world.shocked) { if (s.until > g.tick) { keep.push(s); continue; } for (const i of s.cells) { g.flags[i] &= ~F.SHOCK; g.touchGfx(i % g.W, (i / g.W) | 0); } }
  // re-apply live ones (an expired list may have cleared cells another zone still holds)
  for (const s of keep) for (const i of s.cells) g.flags[i] |= F.SHOCK;
  world.shocked = keep;
}

/**
 * Basins (docs/06 §8.5): a named rect with a target level that fills from the surface or drains from the
 * bottom by `rate` cells per tick, driven by wiring (fill/drain/stop).
 */
export function createBasin(spec) {
  return { id: spec.id, rect: spec.rect, level: spec.level ?? spec.rect[1], mode: 'idle', rate: spec.rate ?? 120, target: spec.level ?? spec.rect[1], inlets: spec.inlets || [], drains: spec.drains || [], surface: null };
}
export function stepBasin(world, b) {
  const g = world.grid, [rx, ry, rw, rh] = b.rect, W = g.W;
  if (b.mode === 'idle') return;
  let n = b.rate;
  if (b.mode === 'drain') {
    // remove water from the bottom-most rows first
    for (let y = ry + rh - 1; y >= ry && n > 0; y--) for (let x = rx; x < rx + rw && n > 0; x++) {
      if (g.mat[y * W + x] === 22) { g.set(x, y, 0); n--; }
    }
    if (n === b.rate) b.mode = 'idle';
  } else if (b.mode === 'fill') {
    // add a row at the current surface (lowest empty row inside the rect)
    for (let y = ry + rh - 1; y >= b.target && n > 0; y--) {
      for (let x = rx; x < rx + rw && n > 0; x++) { const i = y * W + x; if (g.mat[i] === 0) { g.set(x, y, 22); n--; } }
      if (n > 0 && y === b.target) break;
    }
    if (n === b.rate) b.mode = 'idle';
  }
  // report level: highest water row in the rect's middle column
  const mx = rx + (rw >> 1); let lvl = ry + rh;
  for (let y = ry; y < ry + rh; y++) if (g.mat[y * W + mx] === 22) { lvl = y; break; }
  b.surface = lvl;
}

