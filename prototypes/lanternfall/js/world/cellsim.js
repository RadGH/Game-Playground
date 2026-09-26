// Cell passes (docs/06 §4–6, §8.1, §9): pass A moves powders and liquids bottom-up, pass B moves gases
// and fire top-down. Only awake chunks inside the sim window step every tick; awake chunks outside it
// step on a slow lane (every 4th tick, staggered). Pure.
import { CLS } from './materials.js';
import { CHUNK, F } from './grid.js';

const FLAT_LIMIT = 24; // sideways moves on flat liquid before a cell stops wandering (reset by falling)

/**
 * Step every cell pass once.
 * @param world { grid, mats, steamDebt, wind }
 * @param view  { x0, y0, x1, y1 } sim window in cells (camera view + margin); null = whole grid
 */
export function stepCells(world, view) {
  const g = world.grid; g.beginTick();
  const { CW, CH } = g, tick = g.tick;
  const leftFirst = (tick & 1) === 0;
  let cx0 = 0, cy0 = 0, cx1 = CW - 1, cy1 = CH - 1;
  if (view) { cx0 = Math.max(0, (view.x0 / CHUNK) | 0); cy0 = Math.max(0, (view.y0 / CHUNK) | 0); cx1 = Math.min(CW - 1, (view.x1 / CHUNK) | 0); cy1 = Math.min(CH - 1, (view.y1 / CHUNK) | 0); }
  const stats = world.cellStats || (world.cellStats = { active: 0, slow: 0, scanned: 0 });
  stats.active = 0; stats.slow = 0; stats.scanned = 0;
  // decide which chunks run this tick
  const run = world._run || (world._run = new Uint8Array(g.NC));
  for (let c = 0; c < g.NC; c++) {
    run[c] = 0; if (!g.awake[c]) continue;
    const cx = c % CW, cy = (c / CW) | 0;
    const inWin = cx >= cx0 && cx <= cx1 && cy >= cy0 && cy <= cy1;
    if (inWin || ((cx + cy + tick) & 3) === 0) { run[c] = 1; if (inWin) stats.active++; else stats.slow++; g.lastActive[c] = tick; }
    else { // carry the chunk to next tick untouched
      g.awakeNext[c] = 1; const o = c * 4;
      if (g.dirty[o] <= g.dirty[o + 2]) { const dn = g.dirtyNext; if (g.dirty[o] < dn[o]) dn[o] = g.dirty[o]; if (g.dirty[o + 1] < dn[o + 1]) dn[o + 1] = g.dirty[o + 1]; if (g.dirty[o + 2] > dn[o + 2]) dn[o + 2] = g.dirty[o + 2]; if (g.dirty[o + 3] > dn[o + 3]) dn[o + 3] = g.dirty[o + 3]; }
    }
  }
  // pass A: bottom-up
  for (let cy = CH - 1; cy >= 0; cy--) for (let k = 0; k < CW; k++) {
    const cx = leftFirst ? k : CW - 1 - k, c = cy * CW + cx;
    if (run[c]) passA(world, g, c, leftFirst);
  }
  // pass B: top-down
  for (let cy = 0; cy < CH; cy++) for (let k = 0; k < CW; k++) {
    const cx = leftFirst ? k : CW - 1 - k, c = cy * CW + cx;
    if (run[c]) passB(world, g, c, leftFirst);
  }
  return stats;
}

function passA(world, g, c, leftFirst) {
  const o = c * 4, x0 = g.dirty[o], y0 = g.dirty[o + 1], x1 = g.dirty[o + 2], y1 = g.dirty[o + 3];
  if (x0 > x1) return;
  const W = g.W, H = g.H, mat = g.mat, stamp = g.stamp, sv = g.stampVal, mats = g.mats, cls = mats.cls, dens = mats.density;
  let scanned = 0;
  for (let y = y1; y >= y0; y--) {
    const row = y * W;
    for (let q = 0; q <= x1 - x0; q++) {
      const x = leftFirst ? x0 + q : x1 - q, i = row + x, m = mat[i];
      scanned++;
      const k = cls[m];
      if (k !== CLS.POWDER && k !== CLS.LIQUID) continue;
      if (stamp[i] === sv) continue;
      if (k === CLS.POWDER) stepPowder(world, g, i, x, y, m);
      else stepLiquid(world, g, i, x, y, m);
    }
  }
  world.cellStats.scanned += scanned;
}

function freeFor(cls, dens, m, t) { // can m swap into t?
  const kt = cls[t];
  if (t === 0 || kt === CLS.GAS || kt === CLS.FIRE) return 1;
  if (kt === CLS.LIQUID && dens[t] < dens[m]) return 2; // sinking through a lighter liquid
  return 0;
}

function drainCheck(world, g, i, x, y) { // a cell pushed against a drain edge leaves the room
  if (!g.drainMask) return false;
  let side = -1;
  if (y === g.H - 1 && g.drainMask[x]) side = 0;
  else if (x === 0 && g.drainMask[g.W + y]) side = 1;
  else if (x === g.W - 1 && g.drainMask[g.W + g.H + y]) side = 2;
  if (side < 0) return false;
  const m = g.mat[i]; g.set(x, y, 0); if (g.onDrain) g.onDrain(m, x, y); world.drained = (world.drained || 0) + 1; return true;
}

function stepPowder(world, g, i, x, y, m) {
  const W = g.W, mat = g.mat, mats = g.mats, cls = mats.cls, dens = mats.density;
  if (y >= g.H - 1) { drainCheck(world, g, i, x, y); return; }
  const b = i + W, fb = freeFor(cls, dens, m, mat[b]);
  if (fb === 1 || (fb === 2 && g.rand() < 0.5)) { g.swap(i, b, x, y, x, y + 1); return; }
  // floaters: lighter than the liquid below -> rises through liquid above
  if (y > 0) { const u = i - W, mu = mat[u]; if (cls[mu] === CLS.LIQUID && dens[mu] > dens[m] && g.rand() < 0.3) { g.swap(i, u, x, y, x, y - 1); return; } }
  // ember hitting water
  if (m === 21) { const mb = mat[b]; if (mb === 22) { g.set(x, y, 19); if (y > 0 && mat[i - W] === 0) g.set(x, y - 1, 29, { temp: 110 }); world.steamDebt = (world.steamDebt || 0) + 0; return; } }
  const rep = mats.repose[m]; if (rep > 1 && g.rand() * rep >= 1) return;
  const d = ((x + y + g.tick) & 1) ? 1 : -1;
  for (let s = 0; s < 2; s++) {
    const dd = s ? -d : d, nx = x + dd; if (nx < 0 || nx >= W) continue;
    if (freeFor(cls, dens, m, mat[i + dd]) === 1 && freeFor(cls, dens, m, mat[b + dd])) { g.swap(i, b + dd, x, y, nx, y + 1); return; }
  }
}

function stepLiquid(world, g, i, x, y, m) {
  const W = g.W, mat = g.mat, mats = g.mats, cls = mats.cls, dens = mats.density, aux = g.aux;
  if ((g.flags[i] & F.SHOCK) && g.rand() < 0.03) g.flags[i] &= ~F.SHOCK;
  if (y >= g.H - 1 || x === 0 || x === W - 1) { if (drainCheck(world, g, i, x, y)) return; }
  if (y < g.H - 1) {
    const b = i + W, fb = freeFor(cls, dens, m, mat[b]);
    if (fb === 1 || (fb === 2 && g.rand() < 0.6)) { aux[i] &= 1; g.swap(i, b, x, y, x, y + 1); return; }
    let dir = (aux[i] & 1) ? 1 : -1;
    // diagonal down
    for (let s = 0; s < 2; s++) {
      const dd = s ? -dir : dir, nx = x + dd; if (nx < 0 || nx >= W) continue;
      if (freeFor(cls, dens, m, mat[i + dd]) === 1 && freeFor(cls, dens, m, mat[b + dd]) === 1) { aux[i] = dd > 0 ? 1 : 0; g.swap(i, b + dd, x, y, nx, y + 1); return; }
    }
    // sideways: walk up to dispersion cells, prefer a ledge to fall off
    const disp = mats.dispersion[m], flat = aux[i] >> 1;
    for (let s = 0; s < 2; s++) {
      const dd = s ? -dir : dir; let tx = -1, ledge = false;
      for (let k = 1; k <= disp; k++) {
        const nx = x + dd * k; if (nx < 0 || nx >= W) break;
        const t = mat[i + dd * k]; if (freeFor(cls, dens, m, t) !== 1) break;
        tx = nx; if (freeFor(cls, dens, m, mat[b + dd * k]) === 1) { ledge = true; break; }
      }
      if (tx >= 0 && !ledge && flat >= FLAT_LIMIT && world.stuckLiquid && world.stuckLiquid.length < 64) world.stuckLiquid.push(i);
      if (tx >= 0 && (ledge || flat < FLAT_LIMIT)) {
        const j = y * W + tx; g.swap(i, j, x, y, tx, y);
        aux[j] = (dd > 0 ? 1 : 0) | ((ledge ? 0 : Math.min(31, flat + 1)) << 1);
        return;
      }
    }
  }
  // density sort: a denser liquid sitting on top of us -> swap
  if (y > 0) { const u = i - W, mu = mat[u]; if (cls[mu] === CLS.LIQUID && dens[mu] > dens[m] && g.rand() < 0.25) { g.swap(i, u, x, y, x, y - 1); } }
}

function passB(world, g, c, leftFirst) {
  const o = c * 4, x0 = g.dirty[o], y0 = g.dirty[o + 1], x1 = g.dirty[o + 2], y1 = g.dirty[o + 3];
  if (x0 > x1) return;
  const W = g.W, mat = g.mat, stamp = g.stamp, sv = g.stampVal, cls = g.mats.cls;
  for (let y = y0; y <= y1; y++) {
    const row = y * W;
    for (let q = 0; q <= x1 - x0; q++) {
      const x = leftFirst ? x0 + q : x1 - q, i = row + x, m = mat[i], k = cls[m];
      if (k !== CLS.GAS && k !== CLS.FIRE) continue;
      if (stamp[i] === sv) { g.touch(x, y); continue; }
      if (k === CLS.GAS) stepGas(world, g, i, x, y, m); else stepFire(world, g, i, x, y, m);
    }
  }
}

function stepGas(world, g, i, x, y, m) {
  const W = g.W, mat = g.mat, mats = g.mats, cls = mats.cls;
  // lifetime (stored /4)
  if ((g.tick & 3) === 0) {
    if (g.life[i] <= 1) {
      if (m === 29 && (world.steamDebt || 0) > 0 && g.rand() < 0.35) { world.steamDebt--; g.set(x, y, 22, { flags: F.FROM_WATER }); }
      else g.set(x, y, 0);
      return;
    }
    g.life[i]--;
  }
  const up = mats.density[m] < 1, dy = up ? -1 : 1, ny = y + dy;
  if (ny >= 0 && ny < g.H && g.rand() < 0.8) {
    const j = i + dy * W, t = mat[j];
    if (t === 0 || (cls[t] === CLS.GAS && (mats.density[t] < 1) !== up)) { g.swap(i, j, x, y, x, ny); return; }
    if (up && cls[t] === CLS.LIQUID && g.rand() < 0.5) { g.swap(i, j, x, y, x, ny); return; } // bubbles through liquid
  }
  const wind = world.wind || 0, side = g.rand() < 0.5 + wind * 0.35 ? 1 : -1, n = 1 + ((g.rand() * 3) | 0);
  let tx = -1;
  for (let k = 1; k <= n; k++) { const nx = x + side * k; if (nx < 0 || nx >= W || mat[i + side * k] !== 0) break; tx = nx; }
  if (tx >= 0) g.swap(i, y * W + tx, x, y, tx, y);
  else g.touch(x, y); // gases keep their chunk awake
}

function stepFire(world, g, i, x, y, m) {
  const W = g.W, H = g.H, mat = g.mat, mats = g.mats, cls = mats.cls, flags = g.flags;
  // die when touching water/ice/wet
  for (let k = 0; k < 4; k++) {
    const nx = x + (k === 0 ? -1 : k === 1 ? 1 : 0), ny = y + (k === 2 ? -1 : k === 3 ? 1 : 0);
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
    const j = ny * W + nx, t = mat[j];
    if (t === 22 || t === 9 || (flags[j] & F.WET)) {
      g.set(x, y, 0);
      if (t === 22 && g.rand() < 0.35) { g.set(nx, ny, 29, { temp: 110, flags: F.FROM_WATER }); world.steamDebt = (world.steamDebt || 0) + 1; }
      return;
    }
  }
  if (m === 32) {
    // ignite neighbours, heat them
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue; const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx, t = mat[j];
      if ((!dx || !dy) && g.temp[j] < 600) { g.temp[j] += 18; g.markHot(nx, ny); }
      if (mats.flam[t] && !(flags[j] & F.BURNING)) { const p = mats.flam[t] / 25 * ((flags[j] & F.WET) ? 0.25 : 1); if (g.rand() < p) ignite(g, j, nx, ny); }
    }
  }
  if ((g.tick & 3) === 0) { if (g.life[i] <= 1) { if (m === 32 && g.rand() < 0.4) g.set(x, y, 30); else g.set(x, y, 0); return; } g.life[i]--; }
  if (y > 0 && g.rand() < 0.5) { const j = i - W; if (mat[j] === 0) { g.swap(i, j, x, y, x, y - 1); return; } }
  const d = g.rand() < 0.5 ? 1 : -1, nx = x + d;
  if (nx >= 0 && nx < W && mat[i + d] === 0 && g.rand() < 0.3) { g.swap(i, i + d, x, y, nx, y); return; }
  g.touch(x, y);
}

/** Set a flammable cell burning (fuel in life). */
export function ignite(g, i, x, y) {
  const m = g.mat[i]; if (!g.mats.flam[m]) return false;
  if (m === 31) { g.set(x, y, 32); return true; } // miasma flashes
  g.flags[i] |= F.BURNING; if (g.life[i] === 0) g.life[i] = m === 23 ? 24 : 12;
  g.temp[i] = Math.max(g.temp[i], 300); g.markHot(x, y); g.touch(x, y);
  return true;
}
