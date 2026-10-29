// Gas layer: smoke, steam and ash at quarter resolution (one value per 4x4 cells). PURE.
//
// Each step (every `gas.every` ticks) runs on awake gas chunks only (a chunk = 16x16 gas cells):
//   density' = decay * ( (1-diffuse)*self + diffuse*mean(4 neighbours) ), then the wind carries a
//   share (`advect[strength]`) of each cell to its downwind neighbour (taken from the upwind side).
// All integer maths in 1/256 steps. The kind of a gas cell follows whichever contributor was denser.
// A chunk goes back to sleep (and is zeroed in both buffers) when nothing in it is above `sleepBelow`.

import { DIR8 } from '../sim/rng.js';

export const GAS_NONE = 0, GAS_SMOKE = 1, GAS_STEAM = 2, GAS_ASH = 3;

/** Add gas at world cell (x, y). Wakes the gas chunk. */
export function addGas(g, x, y, kind, amount) {
  if (x < 0 || y < 0 || x >= g.W || y >= g.H) return;
  const q = (y >> 2) * g.QW + (x >> 2);
  const d = g.gasDensity[q];
  const nd = d + amount;
  g.gasDensity[q] = nd > 255 ? 255 : nd;
  if (amount >= d || g.gasKind[q] === 0) g.gasKind[q] = kind;
  g.gasAwake[(y >> 6) * g.CW + (x >> 6)] = 1;
}

/** Add a soft puff of radius r (cells). */
export function puff(g, x, y, r, kind, amount) {
  const qr = Math.max(0, (r >> 2));
  const qx = x >> 2, qy = y >> 2;
  for (let dy = -qr; dy <= qr; dy++) {
    for (let dx = -qr; dx <= qr; dx++) {
      const dd = dx * dx + dy * dy;
      if (dd > qr * qr + qr) continue;
      const a = qr ? Math.round(amount * (1 - dd / (qr * qr + qr + 1))) : amount;
      if (a > 0) addGas(g, (qx + dx) * 4, (qy + dy) * 4, kind, a);
    }
  }
}

export function createGas(g, M) {
  const R = M.rules.gas;
  const QW = g.QW, QH = g.QH, CW = g.CW, CH = g.CH;
  const decay = Math.round(R.decay * 256);
  const diff = Math.round(R.diffuse * 256);
  const sleepBelow = R.sleepBelow;
  const list = [];
  const touched = new Uint8Array(g.nChunks);

  function step() {
    const wd = DIR8[g.wind.dir & 7];
    const share = Math.round((R.advect[Math.max(0, Math.min(R.advect.length - 1, g.wind.strength))] || 0) * 256);
    // a diagonal wind moves both ways at ~0.7 the share
    const sx = wd[0] && wd[1] ? Math.round(share * 0.7) : share;
    const ux = -wd[0], uy = -wd[1]; // upwind offset
    let src = g.gasDensity, dst = g.gasBack;
    let srcK = g.gasKind, dstK = g.gasKindBack;
    list.length = 0;
    for (let ci = 0; ci < g.nChunks; ci++) if (g.gasAwake[ci]) list.push(ci);
    // a sleeping neighbour of an awake chunk is computed too (gas drifts into it)
    for (const ci of list) touched[ci] = 1;
    for (const ci of list) {
      const cx = ci % CW, cy = (ci / CW) | 0;
      for (let d = 0; d < 8; d++) {
        const nx = cx + DIR8[d][0], ny = cy + DIR8[d][1];
        if (nx >= 0 && ny >= 0 && nx < CW && ny < CH) touched[ny * CW + nx] = 1;
      }
    }
    const run = [];
    for (let ci = 0; ci < g.nChunks; ci++) if (touched[ci]) { run.push(ci); touched[ci] = 0; }
    for (const ci of run) {
      const qx0 = (ci % CW) << 4, qy0 = ((ci / CW) | 0) << 4;
      let maxD = 0;
      for (let y = qy0; y < qy0 + 16; y++) {
        const row = y * QW;
        for (let x = qx0; x < qx0 + 16; x++) {
          const i = row + x;
          const s = src[i];
          const n = y > 0 ? src[i - QW] : 0;
          const so = y < QH - 1 ? src[i + QW] : 0;
          const w = x > 0 ? src[i - 1] : 0;
          const e = x < QW - 1 ? src[i + 1] : 0;
          if ((s | n | so | w | e) === 0) { dst[i] = 0; dstK[i] = 0; continue; }
          let v = ((256 - diff) * s + ((diff * (n + so + w + e)) >> 2)) >> 8;
          // wind: lose a share downwind, gain a share from upwind
          let k = srcK[i];
          if (share) {
            const upx = x + ux, upy = y + uy;
            const up = upx >= 0 && upy >= 0 && upx < QW && upy < QH ? src[upy * QW + upx] : 0;
            v = v - ((v * sx) >> 8) + ((up * sx) >> 8);
            if (up > s) k = srcK[upy * QW + upx];
          }
          if (!k) {
            // gas that arrived by diffusion takes its neighbours' kind
            if (n) k = srcK[i - QW]; else if (so) k = srcK[i + QW]; else if (w) k = srcK[i - 1]; else if (e) k = srcK[i + 1];
          }
          v = (v * decay) >> 8;
          if (v < sleepBelow) v = 0;
          dst[i] = v; dstK[i] = v ? k : 0;
          if (v > maxD) maxD = v;
        }
      }
      g.gasAwake[ci] = maxD > 0 ? 1 : 0;
      g.gasVer[ci]++;
    }
    // copy back the computed chunks (keeps both buffers equal outside the run set)
    for (const ci of run) {
      const qx0 = (ci % CW) << 4, qy0 = ((ci / CW) | 0) << 4;
      for (let y = qy0; y < qy0 + 16; y++) {
        const a = y * QW + qx0;
        src.set(dst.subarray(a, a + 16), a);
        srcK.set(dstK.subarray(a, a + 16), a);
      }
    }
    return run.length;
  }

  return { step };
}

/** Number of awake gas chunks. */
export function gasAwakeCount(g) {
  let n = 0;
  for (let i = 0; i < g.nChunks; i++) n += g.gasAwake[i];
  return n;
}
