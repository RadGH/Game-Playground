// Frost, lightning and rain (PLAN M1). PURE. Water and lava never flow — these rules only change
// what a fixed water cell IS (water ↔ ice) or what touches it.
//
// frost(x, y, r): water → ice (deep → thick ice), burning cells go out, everything gets very cold.
//   Cold cells warm by `frost.warmBy` every `frost.warmEvery` ticks (slow.js) and ice turns back
//   into the water it came from at `frost.meltTemp`. Heat (fire, a blast) melts it at once.
// lightning(x, y): finds water within `seekWater` cells of the strike and floods the charge through
//   CONNECTED conducting cells (4-way), at most `floodRadius` cells from the strike and `floodMax`
//   cells in all. Ice does not conduct. On dry land the strike scorches and lights the spot.
// rain(x, y, r, ticks): a shower over a circle; wetness rises every slow pass while it lasts.

import { BURN, SCORCH } from './grid.js';
import { addGas, puff, GAS_STEAM } from './gas.js';

export function createWater(g, M, fire, events) {
  const F = M.rules.frost, L = M.rules.lightning;

  function frost(x, y, r) {
    x |= 0; y |= 0; r = Math.max(1, Math.round(r));
    let frozen = 0;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const xx = x + dx, yy = y + dy;
        if (!g.inside(xx, yy)) continue;
        const i = g.idx(xx, yy);
        let c = g.cells[i];
        const m = c & 255;
        if (M.hot[m]) continue;
        if (M.freeze[m] !== 255) { c = ((c & ~0xff) | M.freeze[m]) >>> 0; frozen++; }
        if ((c & BURN) && F.putOut) c = (c & ~BURN) >>> 0;
        const t = (c >>> 8) & 255;
        if (t > F.temp) c = ((c & ~0xff00) | (F.temp << 8)) >>> 0;
        g.cells[i] = c;
        g.ver[i >>> 12]++;
        g.cold[i >>> 12] = 1;
      }
    }
    events.push({ e: 'frost', x, y, r, frozen });
    return frozen;
  }

  /** Warm cold cells one step (called by slow.js on frost ticks). Returns cells still cold. */
  function warmChunk(ci) {
    const base = ci << 12;
    const amb = M.ambient;
    let still = 0, changed = false;
    for (let li = 0; li < 4096; li++) {
      const i = base + li;
      let c = g.cells[i];
      let t = (c >>> 8) & 255;
      if (t >= amb) continue;
      const m = c & 255;
      t = Math.min(amb, t + F.warmBy);
      if (M.melt[m] !== 255 && t >= F.meltTemp) {
        c = ((c & ~0xff & ~0xff00) | M.melt[m] | (amb << 8)) >>> 0;
      } else {
        c = ((c & ~0xff00) | (t << 8)) >>> 0;
        if (t < amb) still++;
      }
      g.cells[i] = c;
      changed = true;
    }
    if (changed) g.ver[ci]++;
    g.cold[ci] = still ? 1 : 0;
    return still;
  }

  function lightning(x, y) {
    x |= 0; y |= 0;
    // look for water near the strike
    let sx = -1, sy = -1, best = 1e9;
    for (let dy = -L.seekWater; dy <= L.seekWater; dy++)
      for (let dx = -L.seekWater; dx <= L.seekWater; dx++) {
        const xx = x + dx, yy = y + dy;
        if (!g.inside(xx, yy)) continue;
        if (M.conducts[g.cells[g.idx(xx, yy)] & 255]) {
          const d = dx * dx + dy * dy;
          if (d < best) { best = d; sx = xx; sy = yy; }
        }
      }
    let flood = new Int32Array(0);
    if (sx >= 0) {
      const R2 = L.floodRadius * L.floodRadius;
      const seen = new Set();
      const out = [];
      const queue = [sx | (sy << 16)];
      seen.add(queue[0]);
      for (let qi = 0; qi < queue.length && out.length < L.floodMax; qi++) {
        const p = queue[qi];
        const px = p & 0xffff, py = p >>> 16;
        out.push(p);
        const nb = [[px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]];
        for (const [nx, ny] of nb) {
          if (!g.inside(nx, ny)) continue;
          const k = nx | (ny << 16);
          if (seen.has(k)) continue;
          if ((nx - sx) * (nx - sx) + (ny - sy) * (ny - sy) > R2) continue;
          if (!M.conducts[g.cells[g.idx(nx, ny)] & 255]) continue;
          seen.add(k);
          queue.push(k);
        }
      }
      flood = Int32Array.from(out);
      addGas(g, sx, sy, GAS_STEAM, 60);
    } else if (g.inside(x, y)) {
      // dry strike: scorch and light the spot and its four sides
      for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy;
        if (!g.inside(xx, yy)) continue;
        const i = g.idx(xx, yy);
        let c = g.cells[i];
        if (M.water[c & 255] || M.hot[c & 255]) continue;
        if (!fire.ignite(xx, yy)) {
          const t = (c >>> 8) & 255;
          c = ((c & ~0xff00) | (Math.max(t, L.strikeTemp) << 8)) >>> 0;
          if (M.walk[c & 255] > 0 && M.shade[c & 255] <= 1) c = (c | SCORCH) >>> 0;
          g.cells[i] = c; g.ver[i >>> 12]++;
          g.wakeAt(xx, yy);
        }
      }
    }
    events.push({ e: 'lightning', x, y, flood });
    return flood;
  }

  const showers = [];
  /** Start a rain shower over a circle for `ticks` ticks. */
  function rain(x, y, r, ticks) {
    showers.push({ x: x | 0, y: y | 0, r: r | 0, left: ticks | 0 });
    events.push({ e: 'rain', x, y, r });
  }

  return { frost, warmChunk, lightning, rain, showers };
}

export { puff };
