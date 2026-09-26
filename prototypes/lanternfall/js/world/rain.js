// Near rain + drips (docs/06 §11): drops only in sky columns, wet what they hit, splash, ripple water,
// deposit a little water (capped per room). Far rain is a shader. Pure.
import { PK } from '../entities/particles.js';
import { CLS } from './materials.js';
import { F } from './grid.js';
export function createRain(world, spec = {}) {
  const R = { density: spec.density ?? 90, wind: spec.wind ?? 0.15, deposit: spec.deposit ?? 1 / 14, maxDeposit: spec.maxDeposit ?? 8000, deposited: 0, scale: 1, drips: [], acc: 0 };
  R.step = function (P, view, dt, ripples) {
    const g = world.grid, skyTop = world.skyTop;
    if (R.density > 0 && skyTop) {
      R.acc += R.density * R.scale * (view.x1 - view.x0 + 128) / 100 * dt;
      while (R.acc >= 1) {
        R.acc -= 1;
        const x = view.x0 - 64 + world.grid.rand() * (view.x1 - view.x0 + 128) | 0;
        if (x < 0 || x >= g.W || skyTop[x] < 0) continue;
        if (P.counts[PK.RAIN] > 1800) break;
        P.spawn(PK.RAIN, x, Math.max(0, view.y0 - 8), R.wind * 90, 420 + (world.grid.rand() - 0.5) * 80, 3, 0x8fa6c4, 0, 0);
      }
    }
    // drips
    for (const d of R.drips) { d.t -= dt; if (d.t <= 0) { d.t = d.every[0] + world.grid.rand() * (d.every[1] - d.every[0]); P.spawn(PK.DRIP, d.x + 0.5, d.y + 1, 0, 10, 4, 0x9fb8d4, 0, 900); } }
  };
  R.onHit = function (x, y, px, py, m, kind, ripples) {
    const g = world.grid, c = g.mats.cls[m];
    if (c === CLS.LIQUID) { ripples?.impulse(x, kind === PK.DRIP ? -1 : -0.6); return 'splashL'; }
    g.wet(x, y, 255);
    const chance = kind === PK.DRIP ? 0.25 : R.deposit;
    if (R.deposited < R.maxDeposit && world.grid.rand() < chance && g.get(px, py) === 0) { g.set(px, py, 22); R.deposited++; }
    return 'splash';
  };
  /** Find drip points under ledges near open sky or wet cells (max 48). */
  R.findDrips = function (limit = 48) {
    const g = world.grid, W = g.W, out = [];
    for (let y = 2; y < g.H - 2 && out.length < limit * 4; y += 1) for (let x = 2; x < W - 2; x += 3) {
      const i = y * W + x; if (g.mats.cls[g.mat[i]] !== CLS.STATIC || g.mat[i + W] !== 0) continue;
      if ((g.mat[i - 1] !== 0 || g.mat[i + 1] !== 0) && g.mat[i + W * 2] === 0 && g.mat[i + W * 3] === 0 && world.grid.rand() < 0.08) out.push({ x, y, every: [1.2, 4.0], t: world.grid.rand() * 3 });
    }
    return out.sort(() => world.grid.rand() - 0.5).slice(0, limit);
  };
  return R;
}

/** 1D ripple height per view column (docs/06 §15.2). */
export function createRipples(n = 1024) {
  const h = new Float32Array(n), v = new Float32Array(n); let off = 0;
  return {
    h, setOffset(o) { off = o | 0; },
    impulse(worldX, a) { const i = (worldX | 0) - off; if (i >= 1 && i < n - 1) { v[i] += a; v[i - 1] += a * 0.5; v[i + 1] += a * 0.5; } },
    step() { for (let i = 1; i < n - 1; i++) v[i] += (h[i - 1] + h[i + 1] - 2 * h[i]) * 0.3 - h[i] * 0.02; for (let i = 0; i < n; i++) { v[i] *= 0.985; h[i] += v[i]; if (h[i] > 3) h[i] = 3; else if (h[i] < -3) h[i] = -3; } },
  };
}
