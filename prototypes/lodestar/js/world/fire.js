// Fire and heat (PLAN M1). PURE. Runs every tick on awake chunks only.
//
// Phase 1 — scatter: every burning cell (and every always-hot cell such as lava, in an awake chunk)
//   adds heat to its 8 neighbours: a side neighbour gets `sideWeight`, a diagonal `diagWeight`,
//   each scaled by the wind table (downwind gets more, upwind less). Heat only goes diagonally
//   through a corner when one of the two side cells on that corner can burn, so a one-cell line of
//   stone, a road or a shoreline is a firebreak even where it runs diagonally.
// Phase 2 — apply, on every chunk that was scattered from or received heat:
//   * a burning cell spends one unit of fuel (`amt`) and puts smoke into the gas layer; at zero it
//     becomes its `burnsTo` material, glowing hot, and is marked scorched;
//   * a flammable cell that got heat warms by `gain` per 4 heat (gain is worked out from the
//     material's `ignite` ticks — see materials.js) and catches at `igniteAt`. A WET cell takes the
//     heat only `wetHeat` of the ticks (so it catches later). Road, bridge and cliff cells never burn;
//   * water that gets heat makes steam; ice that gets heat melts;
//   * a cell above ambient with no heat cools by `coolPerTick` (embers glow and fade).
// A chunk stays awake while anything in it burns or is hotter than ambient.

import { BURN, ROAD, EDGE, BRIDGE, SCORCH, WET } from './grid.js';
import { addGas, GAS_SMOKE, GAS_STEAM, GAS_ASH } from './gas.js';
import { hash2 } from '../sim/rng.js';

const OFF = [1, 65, 64, 63, -1, -65, -64, -63];
const DX = [1, 1, 0, -1, -1, -1, 0, 1];
const DY = [0, 1, 1, 1, 0, -1, -1, -1];

export function createFire(g, M, rng) {
  const R = M.rules.fire;
  const ambient = M.ambient;
  const fireTemp = R.fireTemp;
  const hotBurnTo = R.hotBurnTo;
  const cool = R.coolPerTick;
  const wetHeat = R.wetHeat;
  const rainOut = R.rainOutChance;
  const steamFromWater = R.steamFromWater;
  const jitter = R.jitter;
  const fuelJitter = R.fuelJitter;
  const meltTemp = M.rules.frost.meltTemp;
  const W = g.W, H = g.H, CW = g.CW;
  const cells = g.cells, heat = g.heat, rows = g.rows;
  const recv = new Uint8Array(g.nChunks);
  const w8 = new Uint16Array(8);
  let windKey = -1;
  let burningCount = 0;

  function weights() {
    const key = g.wind.dir * 8 + g.wind.strength;
    if (key === windKey) return;
    windKey = key;
    const table = R.windWeights[Math.max(0, Math.min(R.windWeights.length - 1, g.wind.strength))];
    for (let d = 0; d < 8; d++) {
      let rel = (d - g.wind.dir + 8) & 7;
      if (rel > 4) rel = 8 - rel;
      const base = table[rel];
      w8[d] = d & 1 ? Math.round((base * R.diagWeight) / 4) : Math.round((base * R.sideWeight) / 4);
    }
  }

  // materials heat can do something to (catch, steam, melt)
  const recept = new Uint8Array(256);
  for (let m = 0; m < M.count; m++) recept[m] = M.flammable[m] || M.water[m] || M.melt[m] !== 255 ? 1 : 0;
  const canBurn = (c) => M.flammable[c & 255] === 1 && (c & (ROAD | EDGE | BRIDGE)) === 0;

  /** Add heat from the cell at (x, y) [index i, chunk ci] to its neighbours. */
  // A burning cell's own heat slot is never used for heat (fire skips burning targets), so it holds
  // SURROUNDED once a scatter found nothing left around it to heat — the middle of a big fire then
  // costs nothing per tick. Neighbours only stop being heatable (they burn out), so the mark holds.
  const SURROUNDED = 65535;
  function scatter(i, x, y, lx, ly, ci) {
    if (heat[i] === SURROUNDED) return;
    const interior = lx > 0 && lx < 63 && ly > 0 && ly < 63;
    let found = 0;
    for (let d = 0; d < 8; d++) {
      const w = w8[d];
      if (!w) continue;
      let j;
      if (interior) {
        j = i + OFF[d];
        // only cells the heat can change: not already burning, and burnable, water or ice
        const cj = cells[j];
        if ((cj & BURN) !== 0 || recept[cj & 255] === 0) continue;
        if (d & 1) {
          // corner rule: one of the two side cells must be able to burn
          if (!canBurn(cells[i + OFF[(d + 7) & 7]]) && !canBurn(cells[i + OFF[(d + 1) & 7]])) continue;
        }
      } else {
        const nx = x + DX[d], ny = y + DY[d];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        j = g.idx(nx, ny);
        const cj = cells[j];
        if ((cj & BURN) !== 0 || recept[cj & 255] === 0) continue;
        if (d & 1) {
          const a = g.idx(x + DX[(d + 7) & 7], y + DY[(d + 7) & 7]);
          const b = g.idx(x + DX[(d + 1) & 7], y + DY[(d + 1) & 7]);
          if (!canBurn(cells[a]) && !canBurn(cells[b])) continue;
        }
        const cjk = j >>> 12;
        if (cjk !== ci) recv[cjk] = 1;
      }
      found++;
      // a stale SURROUNDED mark on a cell that no longer burns (a blast or frost put it out) is no heat
      const h = (heat[j] === SURROUNDED ? 0 : heat[j]) + w;
      heat[j] = h > 65534 ? 65534 : h;
      const rr = (j >>> 6) & 63;
      rows[((j >>> 12) << 1) | (rr >> 5)] |= 1 << (rr & 31);
    }
    if (!found && (cells[i] & BURN)) heat[i] = SURROUNDED;
  }

  /** Light one cell (no checks beyond bounds). Used by rules and by blasts, debris and spells. */
  function ignite(x, y) {
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    const i = g.idx(x, y);
    const c = cells[i];
    if (!canBurn(c) || (c & BURN)) return false;
    let a = (c >>> 16) & 255;
    const m = c & 255;
    if (!a) a = fuelFor(m, x, y);
    cells[i] = ((c & 0x0000ff) | (fireTemp << 8) | (a << 16) | (c & 0xff000000) | BURN) >>> 0;
    heat[i] = 0;
    g.ver[i >>> 12]++;
    g.wakeAt(x, y);
    pushNext(i);
    return true;
  }

  function fuelFor(m, x, y) {
    const f = M.fuel[m];
    if (!fuelJitter) return f;
    const h = (hash2(x, y, 77) & 1023) / 1023; // 0..1
    return Math.max(1, Math.min(255, Math.round(f * (1 - fuelJitter + 2 * fuelJitter * h))));
  }

  // cells that heat their neighbours next tick: every burning cell, and an always-hot cell (lava)
  // that has a burnable neighbour. Filled by the apply pass and by ignite().
  let list = new Int32Array(4096), listN = 0;
  let next = new Int32Array(4096), nextN = 0;
  function pushNext(i) {
    if (nextN === next.length) { const a = new Int32Array(next.length * 2); a.set(next); next = a; }
    next[nextN++] = i;
  }

  function step(tick) {
    weights();
    const nC = g.nChunks;
    // swap: what the last apply (and ignite() since) collected is this tick's scatter list
    const tl = list; list = next; next = tl;
    listN = nextN; nextN = 0;
    // ---- phase 1: scatter
    for (let k = 0; k < listN; k++) {
      const i = list[k];
      const ci = i >>> 12, li = i & 4095;
      const lx = li & 63, ly = li >> 6;
      recv[ci] = 1;
      scatter(i, ((ci % CW) << 6) + lx, (((ci / CW) | 0) << 6) + ly, lx, ly, ci);
    }
    // ---- phase 2: apply on awake + scattered-from + receiving chunks, in chunk order
    const awake = g.awake;
    burningCount = 0;
    for (let ci = 0; ci < nC; ci++) {
      if (!recv[ci] && !awake[ci]) continue;
      recv[ci] = 0;
      awake[ci] = 0;
      applyChunk(ci, tick);
    }
    // next tick's awake set
    const wn = g.wakeNext;
    for (let ci = 0; ci < nC; ci++) {
      if (wn[ci]) { awake[ci] = 1; wn[ci] = 0; }
    }
  }

  const flammable = M.flammable, hotT = M.hot, waterT = M.water, meltT = M.melt, smokeT = M.smoke, ashT = M.ashSmoke;
  const gainT = M.gain, igniteAtT = M.igniteAt, burnsToT = M.burnsTo, walkT = M.walk, regrowT = M.regrow;
  const IDLE = (ambient << 8) >>> 0;

  function hasBurnableSide(i, x, y) {
    if (x > 0 && canBurn(cells[g.idx(x - 1, y)]) && !(cells[g.idx(x - 1, y)] & BURN)) return true;
    if (x < W - 1 && canBurn(cells[g.idx(x + 1, y)]) && !(cells[g.idx(x + 1, y)] & BURN)) return true;
    if (y > 0 && canBurn(cells[g.idx(x, y - 1)]) && !(cells[g.idx(x, y - 1)] & BURN)) return true;
    if (y < H - 1 && canBurn(cells[g.idx(x, y + 1)]) && !(cells[g.idx(x, y + 1)] & BURN)) return true;
    return false;
  }

  function applyChunk(ci, tick) {
    const base = ci << 12;
    const ox = (ci % CW) << 6, oy = ((ci / CW) | 0) << 6;
    let busy = false, changed = false, cold = false;
    const m0 = rows[ci * 2], m1 = rows[ci * 2 + 1];
    let n0 = 0, n1 = 0;
    for (let ly = 0; ly < 64; ly++) {
     // rows nothing happened in last tick (no heat, nothing burning or cooling) are skipped whole
     if (((ly < 32 ? m0 >>> ly : m1 >>> (ly - 32)) & 1) === 0) continue;
     let rowBusy = false;
     const rowEnd = (ly + 1) << 6;
     for (let li = ly << 6; li < rowEnd; li++) {
      const i = base + li;
      let c = cells[i];
      let h = heat[i];
      if (h === SURROUNDED && (c & BURN) === 0) { heat[i] = 0; h = 0; }
      // the common case: nothing burning, no heat, at ambient
      if (h === 0 && (c & 0x0100ff00) === IDLE) continue;
      const m = c & 255;
      let t = (c >>> 8) & 255;
      if (c & BURN) {
        rowBusy = true; changed = true; burningCount++;
        if ((c & WET) !== 0 && rainOut > 0 && rng.float() < rainOut) {
          // doused: stops burning, keeps the fuel it has left, cools from here
          heat[i] = 0;
          c = (c & ~BURN) >>> 0;
          cells[i] = ((c & ~0xff00) | (hotBurnTo << 8)) >>> 0;
          continue;
        }
        const x = ox + (li & 63), y = oy + (li >> 6);
        // smoke: each cell puffs on one tick in four (staggered), four ticks' worth at once
        const sm = smokeT[m];
        if (sm && (li & 3) === (tick & 3)) addGas(g, x, y, ashT[m] && (tick & 4) === 0 ? GAS_ASH : GAS_SMOKE, sm * 4);
        let a = ((c >>> 16) & 255) - 1;
        if (a <= 0) {
          heat[i] = 0;
          const to = burnsToT[m];
          const scorch = walkT[to] > 0 ? SCORCH : 0;
          c = ((to & 255) | (hotBurnTo << 8) | (c & 0xff000000 & ~BURN) | scorch) >>> 0;
          if (regrowT[to] !== 255) g.regrowHint[ci] = 1;
        } else {
          c = ((c & 0xff00ffff) | (a << 16)) >>> 0;
          if (t !== fireTemp) c = ((c & ~0xff00) | (fireTemp << 8)) >>> 0;
          pushNext(i);
        }
        cells[i] = c;
        continue;
      }
      if (hotT[m]) {
        heat[i] = 0;
        const x = ox + (li & 63), y = oy + (li >> 6);
        if (hasBurnableSide(i, x, y)) { pushNext(i); rowBusy = true; }
        continue;
      }
      if (h) {
        heat[i] = 0;
        if (flammable[m] && (c & (ROAD | EDGE | BRIDGE)) === 0) {
          rowBusy = true;
          if ((c & WET) !== 0 && rng.float() >= wetHeat) continue;
          const x = ox + (li & 63), y = oy + (li >> 6);
          let at = igniteAtT[m];
          if (jitter) {
            const span = (at - ambient) * jitter;
            at = Math.round(at - span + ((hash2(x, y, 31) & 1023) / 1023) * 2 * span);
            if (at > 255) at = 255;
            if (at <= ambient) at = ambient + 1;
          }
          t += (h * gainT[m]) >> 2;
          if (t >= at) {
            let a = (c >>> 16) & 255;
            if (!a) a = fuelFor(m, x, y);
            c = ((c & 0xff0000ff) | (fireTemp << 8) | (a << 16) | BURN) >>> 0;
            pushNext(i);
          } else {
            c = ((c & ~0xff00) | ((t > 255 ? 255 : t) << 8)) >>> 0;
          }
          cells[i] = c;
          changed = true;
        } else if (waterT[m]) {
          if (steamFromWater && (h >= 8 || (tick & 1) === 0)) {
            const x = ox + (li & 63), y = oy + (li >> 6);
            addGas(g, x, y, GAS_STEAM, steamFromWater);
          }
        } else if (meltT[m] !== 255) {
          t += h >> 1;
          if (t >= meltTemp) c = ((meltT[m] & 255) | (ambient << 8) | (c & 0xffff0000)) >>> 0;
          else c = ((c & ~0xff00) | (t << 8)) >>> 0;
          cells[i] = c;
          rowBusy = true; changed = true;
        }
        continue;
      }
      if (t > ambient) {
        t -= cool;
        if (t < ambient) t = ambient;
        cells[i] = ((c & ~0xff00) | (t << 8)) >>> 0;
        rowBusy = true; changed = true;
      } else if (t < ambient) {
        cold = true;
      }
    }
     if (rowBusy) {
       busy = true;
       if (ly < 32) n0 |= 1 << ly; else n1 |= 1 << (ly - 32);
     }
    }
    rows[ci * 2] = n0; rows[ci * 2 + 1] = n1;
    if (busy) { g.wakeNext[ci] = 1; g.emitHint[ci] = 1; }
    if (cold) g.cold[ci] = 1;
    if (changed) g.ver[ci]++;
  }

  return {
    step,
    ignite,
    canBurn,
    get burning() { return burningCount; },
  };
}
