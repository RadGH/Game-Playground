// The slow world pass (every `slow.every` ticks; PLAN §1.3 "regrowth, cooling" row). PURE.
//
//   * frost: cold chunks warm a step (water.js warmChunk) every `frost.warmEvery` ticks;
//   * wet: showers raise the quarter-res wet field, everything else dries; when a wet value crosses
//     `wetAt` its 16 cells get/lose the WET bit (fire reads the bit), and bare soil turns to mud at
//     `mudAt` and back to soil below `dryAt`;
//   * regrowth: chunks that may hold scorched ground, ash or rubble sample `regrowSamples` cells and
//     turn each one into its `regrow` material with a chance that makes the AVERAGE wait equal the
//     material's `regrowTicks`;
//   * coarse light: the quarter-res `light` field (is this spot lit at night — the sight rule reads it)
//     is rebuilt from every emitting cell (lava, crystal, lamps, fire, glowing embers).

import { BURN, WET, SCORCH } from './grid.js';

export function createSlow(g, M, water, rng) {
  const S = M.rules.slow, F = M.rules.frost, Wt = M.rules.wet;
  const QW = g.QW, CW = g.CW;
  const glowAt = 150;
  let globalRain = 0;
  let visit = 0;

  function setRain(on) { globalRain = on ? 1 : 0; if (on) g.wetAwake.fill(1); }

  function wetStep() {
    const showers = water.showers;
    for (let s = showers.length - 1; s >= 0; s--) {
      const sh = showers[s];
      sh.left -= S.every;
      const qr = Math.max(1, sh.r >> 2), qx = sh.x >> 2, qy = sh.y >> 2;
      for (let dy = -qr; dy <= qr; dy++) for (let dx = -qr; dx <= qr; dx++) {
        if (dx * dx + dy * dy > qr * qr) continue;
        const x = qx + dx, y = qy + dy;
        if (x < 0 || y < 0 || x >= QW || y >= g.QH) continue;
        setWet(x, y, Math.min(255, g.wet[y * QW + x] + Wt.rainPerSlow + Wt.dryPerSlow));
        g.wetAwake[((y >> 4) * CW) + (x >> 4)] = 1;
      }
      if (sh.left <= 0) showers.splice(s, 1);
    }
    for (let ci = 0; ci < g.nChunks; ci++) {
      if (!g.wetAwake[ci]) continue;
      const qx0 = (ci % CW) << 4, qy0 = ((ci / CW) | 0) << 4;
      let any = 0;
      for (let y = qy0; y < qy0 + 16; y++) for (let x = qx0; x < qx0 + 16; x++) {
        const old = g.wet[y * QW + x];
        const v = globalRain ? Math.min(255, old + Wt.rainPerSlow) : Math.max(0, old - Wt.dryPerSlow);
        setWet(x, y, v);
        if (v) any = 1;
      }
      g.wetAwake[ci] = any || globalRain ? 1 : 0;
    }
  }

  /** Set one wet value; when it crosses a threshold its 16 cells change (WET bit, mud). */
  function setWet(qx, qy, v) {
    const q = qy * QW + qx;
    const old = g.wet[q];
    if (old === v) return;
    g.wet[q] = v;
    const cross = (old >= Wt.wetAt) !== (v >= Wt.wetAt) || (old >= Wt.mudAt) !== (v >= Wt.mudAt) || (old >= Wt.dryAt) !== (v >= Wt.dryAt);
    if (cross) { applyWet(qx, qy, v); g.ver[((qy >> 4) * CW) + (qx >> 4)]++; }
  }

  function applyWet(qx, qy, v) {
    for (let yy = qy * 4; yy < qy * 4 + 4; yy++) for (let xx = qx * 4; xx < qx * 4 + 4; xx++) {
      const i = g.idx(xx, yy);
      let c = g.cells[i];
      const m = c & 255;
      if (M.water[m]) continue;
      c = v >= Wt.wetAt ? (c | WET) >>> 0 : (c & ~WET) >>> 0;
      if (v >= Wt.mudAt && M.mud[m] !== 255 && !(c & BURN)) c = ((c & ~0xff & ~SCORCH) | M.mud[m]) >>> 0;
      else if (v < Wt.dryAt && M.dry[m] !== 255) c = ((c & ~0xff) | M.dry[m]) >>> 0;
      g.cells[i] = c;
    }
  }

  function regrowStep() {
    const every = S.every, samples = S.regrowSamples;
    for (let ci = 0; ci < g.nChunks; ci++) {
      if (!g.regrowHint[ci]) continue;
      const base = ci << 12;
      let found = 0, changed = false;
      const full = (visit % 64) === 0;
      const n = full ? 4096 : samples;
      for (let k = 0; k < n; k++) {
        const li = full ? k : rng.int(4096);
        const i = base + li;
        const c = g.cells[i];
        const m = c & 255;
        const to = M.regrow[m];
        if (to === 255 || (c & BURN)) continue;
        found++;
        if (((c >>> 8) & 255) > M.ambient + 10) continue;
        // chance per sample so the mean wait is regrowTicks: each cell is sampled samples/4096 per pass
        const p = (every * 4096) / (samples * M.regrowTicks[m]);
        if (rng.float() < p) {
          let nc = ((c & ~0xff) | to) >>> 0;
          if (M.regrow[to] === 255) nc = (nc & ~SCORCH) >>> 0;
          g.cells[i] = nc; changed = true;
        }
      }
      if (changed) g.ver[ci]++;
      if (full && !found) g.regrowHint[ci] = 0;
    }
  }

  function lightStep() {
    const lr = S.lightRadius;
    g.light.fill(0);
    for (let ci = 0; ci < g.nChunks; ci++) {
      if (!g.emitHint[ci]) continue;
      const base = ci << 12;
      const qx0 = (ci % CW) << 4, qy0 = ((ci / CW) | 0) << 4;
      let any = false;
      for (let qy = 0; qy < 16; qy++) for (let qx = 0; qx < 16; qx++) {
        let e = 0;
        for (let sy = 0; sy < 4 && !e; sy++) for (let sx = 0; sx < 4; sx++) {
          const c = g.cells[base + ((qy * 4 + sy) << 6) + qx * 4 + sx];
          if ((c & BURN) || M.emits[c & 255] || ((c >>> 8) & 255) >= glowAt) { e = 1; break; }
        }
        if (!e) continue;
        any = true;
        const X = qx0 + qx, Y = qy0 + qy;
        for (let dy = -lr; dy <= lr; dy++) for (let dx = -lr; dx <= lr; dx++) {
          const d2 = dx * dx + dy * dy;
          if (d2 > lr * lr) continue;
          const x = X + dx, y = Y + dy;
          if (x < 0 || y < 0 || x >= QW || y >= g.QH) continue;
          const v = 255 - Math.floor((d2 * 200) / (lr * lr));
          const q = y * QW + x;
          if (v > g.light[q]) g.light[q] = v;
        }
      }
      if (!any) g.emitHint[ci] = 0;
    }
  }

  function step(tick) {
    visit++;
    if (tick % F.warmEvery === 0) {
      for (let ci = 0; ci < g.nChunks; ci++) if (g.cold[ci]) water.warmChunk(ci);
    }
    wetStep();
    regrowStep();
    lightStep();
  }

  return { step, setRain, get raining() { return globalRain; } };
}
