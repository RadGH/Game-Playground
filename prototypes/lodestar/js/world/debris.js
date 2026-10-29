// Debris particles (PLAN M1). PURE. Sim-only, never saved.
//
// A particle flies on a fake arc: x, y move across the flat map while a PRETEND height z rises and
// falls under gravity. z exists only for drawing (a shadow on the ground and the particle above it);
// no rule reads it except "has it landed". All positions are integers in 1/256 of a cell.
//
// Caps (PLAN §1.4): at most `debris.max` alive and at most `landingsPerSecond` turning into cells.
// A spawn over the cap is refused. A particle that lands while the landing budget is spent waits on
// the ground (still drawn) for up to 20 ticks, then disappears without changing a cell.
//
// Landing: into water → hot ones hiss into steam; on burnable ground → a hot one lights it; on bare
// ground → a rubble cell (hot ones glowing); on lava, cliffs and walls → nothing.

import { BURN, EDGE, WET } from './grid.js';
import { addGas, GAS_STEAM } from './gas.js';

const FP = 256;

export function createDebris(g, M, fire, rng) {
  const R = M.rules.debris;
  const max = R.max;
  const x = new Int32Array(max), y = new Int32Array(max), z = new Int32Array(max);
  const vx = new Int32Array(max), vy = new Int32Array(max), vz = new Int32Array(max);
  const matA = new Uint8Array(max), hotA = new Uint8Array(max), bounces = new Uint8Array(max), wait = new Uint8Array(max);
  const grav = Math.round(R.gravity * FP);
  const bounce = Math.round(R.bounce * FP);
  const rubble = M.id.rubble;
  let n = 0;
  let budgetAcc = 0;
  const stats = { spawned: 0, refused: 0, landed: 0, dropped: 0, landedThisSecond: 0, maxLandingsPerSecond: 0, peakAlive: 0 };
  let secondTicks = 0;

  /** Spawn one particle. Units: cells and cells/tick (floats ok — converted to fixed point). */
  function spawn(px, py, pvx, pvy, pvz, mat, hot) {
    if (n >= max) { stats.refused++; return false; }
    x[n] = Math.round(px * FP); y[n] = Math.round(py * FP); z[n] = FP; // start a little off the ground
    vx[n] = Math.round(pvx * FP); vy[n] = Math.round(pvy * FP); vz[n] = Math.round(pvz * FP);
    matA[n] = mat; hotA[n] = hot ? 1 : 0; bounces[n] = R.bounces; wait[n] = 0;
    n++;
    stats.spawned++;
    if (n > stats.peakAlive) stats.peakAlive = n;
    return true;
  }

  function remove(i) {
    n--;
    if (i !== n) {
      x[i] = x[n]; y[i] = y[n]; z[i] = z[n]; vx[i] = vx[n]; vy[i] = vy[n]; vz[i] = vz[n];
      matA[i] = matA[n]; hotA[i] = hotA[n]; bounces[i] = bounces[n]; wait[i] = wait[n];
    }
  }

  function land(cx, cy, m, hot) {
    const i = g.idx(cx, cy);
    const c = g.cells[i];
    const cm = c & 255;
    if (M.water[cm]) {
      if (hot) addGas(g, cx, cy, GAS_STEAM, R.landSteam);
      return;
    }
    if (M.hot[cm] || (c & EDGE) || M.walk[cm] === 0) return;
    if (hot && fire.canBurn(c) && !(c & BURN)) {
      // a hot chunk lands on something burnable: it catches about half the time, else it smoulders
      if (rng.float() < R.igniteChance) { fire.ignite(cx, cy); return; }
    }
    // bare or plant ground takes the rubble; rock, ore and crystal stay as they are
    const sh = M.shade[cm];
    const soft = sh === 0 || sh === 1 || sh === 11 || sh === 12; // ground, plant, rubble, mud
    if (!soft && !hot) return;
    let nc = c;
    if (soft) nc = ((nc & ~0xff & ~0xff0000) | (m === 255 ? rubble : m)) >>> 0;
    if (hot) {
      const t = (nc >>> 8) & 255;
      if (t < R.hotLandTemp) nc = ((nc & ~0xff00) | (R.hotLandTemp << 8)) >>> 0;
      g.wakeAt(cx, cy);
    }
    nc = (nc & ~BURN) >>> 0;
    g.cells[i] = nc;
    g.ver[i >>> 12]++;
    if (M.regrow[nc & 255] !== 255) g.regrowHint[i >>> 12] = 1;
  }

  function step() {
    budgetAcc += R.landingsPerSecond;
    let budget = Math.floor(budgetAcc / 20);
    budgetAcc -= budget * 20;
    if (budgetAcc > 20) budgetAcc = 20;
    const W = g.W * FP, H = g.H * FP;
    let i = 0;
    while (i < n) {
      if (wait[i]) {
        if (budget > 0) {
          budget--; stats.landed++; stats.landedThisSecond++;
          land(x[i] >> 8, y[i] >> 8, matA[i], hotA[i]);
          remove(i); continue;
        }
        if (++wait[i] > 20) { stats.dropped++; remove(i); continue; }
        i++; continue;
      }
      x[i] += vx[i]; y[i] += vy[i]; z[i] += vz[i]; vz[i] -= grav;
      if (x[i] < 0 || y[i] < 0 || x[i] >= W || y[i] >= H) { remove(i); continue; }
      if (z[i] <= 0) {
        z[i] = 0;
        if (bounces[i] > 0 && vz[i] < -grav * 2) {
          bounces[i]--;
          vz[i] = (-vz[i] * bounce) >> 8;
          vx[i] = (vx[i] * 150) >> 8; vy[i] = (vy[i] * 150) >> 8;
          i++; continue;
        }
        vx[i] = 0; vy[i] = 0; vz[i] = 0;
        if (budget > 0) {
          budget--; stats.landed++; stats.landedThisSecond++;
          land(x[i] >> 8, y[i] >> 8, matA[i], hotA[i]);
          remove(i); continue;
        }
        wait[i] = 1;
      }
      i++;
    }
    if (++secondTicks >= 20) {
      if (stats.landedThisSecond > stats.maxLandingsPerSecond) stats.maxLandingsPerSecond = stats.landedThisSecond;
      stats.landedThisSecond = 0; secondTicks = 0;
    }
  }

  /** Pack alive particles for the renderer: [x, y, z, vx, vy, vz, mat, hot] floats in cells. */
  function pack() {
    const out = new Float32Array(n * 8);
    for (let i = 0; i < n; i++) {
      const o = i * 8;
      out[o] = x[i] / FP; out[o + 1] = y[i] / FP; out[o + 2] = z[i] / FP;
      out[o + 3] = vx[i] / FP; out[o + 4] = vy[i] / FP; out[o + 5] = wait[i] ? 0 : vz[i] / FP;
      out[o + 6] = matA[i]; out[o + 7] = hotA[i];
    }
    return out;
  }

  return {
    spawn, step, pack, stats,
    get alive() { return n; },
    clear() { n = 0; },
  };
}
