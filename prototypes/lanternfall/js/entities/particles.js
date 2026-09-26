// The particle pool (docs/06 §18): struct-of-arrays, fixed cap, updated in the fixed step so particles
// that become cells stay deterministic. Kinds: rain, splash, liquid, drip, spark, ember, debris, dust, moth, smoke.
import { CLS } from '../world/materials.js';
export const PK = { RAIN: 1, SPLASH: 2, LIQUID: 3, DRIP: 4, SPARK: 5, EMBER: 6, DEBRIS: 7, DUST: 8, MOTH: 9, SMOKE: 10, GLINT: 11 };
let pr = 0x2545F491; const prand = () => { pr ^= pr << 13; pr ^= pr >>> 17; pr ^= pr << 5; return (pr >>> 0) / 4294967296; };
export function createParticles(cap = 4000) {
  const P = {
    cap, n: 0, x: new Float32Array(cap), y: new Float32Array(cap), vx: new Float32Array(cap), vy: new Float32Array(cap),
    life: new Float32Array(cap), max: new Float32Array(cap), kind: new Uint8Array(cap), mat: new Uint8Array(cap), col: new Uint32Array(cap), g: new Float32Array(cap),
    counts: new Uint16Array(16),
  };
  P.spawn = function (kind, x, y, vx, vy, life, col = 0xffffff, mat = 0, grav = 900) {
    let i = P.n; if (i >= cap) { i = (prand() * cap) | 0; P.counts[P.kind[i]]--; } else P.n++;
    P.x[i] = x; P.y[i] = y; P.vx[i] = vx; P.vy[i] = vy; P.life[i] = life; P.max[i] = life; P.kind[i] = kind; P.col[i] = col; P.mat[i] = mat; P.g[i] = grav; P.counts[kind]++;
    return i;
  };
  P.kill = function (i) { const j = --P.n; P.counts[P.kind[i]]--; if (i !== j) { for (const a of ['x', 'y', 'vx', 'vy', 'life', 'max', 'kind', 'mat', 'col', 'g']) P[a][i] = P[a][j]; } };
  return P;
}

/**
 * Step particles (docs/06 §11.3, §13.2-3). hooks: { onRainHit(x,y,mat), onLiquidLand(x,y,mat) }
 */
export function stepParticles(P, world, dt, hooks = {}) {
  const g = world.grid, cls = g.mats.cls;
  for (let i = P.n - 1; i >= 0; i--) {
    const k = P.kind[i];
    P.life[i] -= dt;
    if (P.life[i] <= 0) { if (k === PK.LIQUID) { const x = P.x[i] | 0, y = P.y[i] | 0; if (g.get(x, y) === 0) g.set(x, y, P.mat[i]); } P.kill(i); continue; }
    if (k === PK.EMBER) { P.vx[i] += ((world.wind || 0) * 20 - P.vx[i]) * dt; P.vy[i] = -30 + Math.sin(P.life[i] * 7) * 10; }
    else if (k === PK.MOTH) { const t = hooks.mothTarget?.(P.x[i], P.y[i]); if (t) { const dx = t.x - P.x[i], dy = t.y - P.y[i], d = Math.hypot(dx, dy) || 1; const orbit = d < 12; P.vx[i] += ((orbit ? -dy : dx) / d * 60 - P.vx[i]) * dt * 3; P.vy[i] += ((orbit ? dx : dy) / d * 60 - P.vy[i]) * dt * 3; } P.vx[i] += (prand() - 0.5) * 200 * dt; P.vy[i] += (prand() - 0.5) * 200 * dt; }
    else if (k === PK.DUST) { P.vx[i] += (prand() - 0.5) * 10 * dt; }
    else P.vy[i] += P.g[i] * dt;
    if (k === PK.SPARK) { P.vx[i] *= 0.96; P.vy[i] *= 0.96; }
    const ox = P.x[i], oy = P.y[i];
    const nx = ox + P.vx[i] * dt, ny = oy + P.vy[i] * dt;
    if (k === PK.RAIN || k === PK.DRIP || k === PK.LIQUID || k === PK.DEBRIS) {
      // march cell by cell (rain moves ~7 cells a tick)
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(nx - ox), Math.abs(ny - oy))));
      let hit = false;
      for (let s = 1; s <= steps; s++) {
        const x = (ox + (nx - ox) * s / steps) | 0, y = (oy + (ny - oy) * s / steps) | 0;
        if (y < 0) continue; if (y >= g.H || x < 0 || x >= g.W) { P.kill(i); hit = true; break; }
        const m = g.mat[y * g.W + x], c = cls[m];
        if (c === CLS.STATIC || c === CLS.POWDER || c === CLS.LIQUID) {
          const px = (ox + (nx - ox) * (s - 1) / steps) | 0, py = (oy + (ny - oy) * (s - 1) / steps) | 0;
          if (k === PK.RAIN || k === PK.DRIP) hooks.onRainHit?.(x, y, px, py, m, k);
          else if (k === PK.LIQUID) { if (g.get(px, py) === 0) g.set(px, py, P.mat[i]); }
          else if (k === PK.DEBRIS) { if (P.mat[i] && hooks.debrisBudget?.() && g.get(px, py) === 0) g.set(px, py, P.mat[i]); }
          P.kill(i); hit = true; break;
        }
      }
      if (hit) continue;
    }
    P.x[i] = nx; P.y[i] = ny;
  }
}
