// The procedural decorator (docs/10 §6.7): roughens block edges, rounds corners, cracks, moss, wax runs
// and rubble, so a coarse ASCII map looks hand-carved. Seeded; never touches keep-out rects. Pure.
import { CLS } from './materials.js';
import { F } from './grid.js';
import { createRng } from '../core/rng.js';

function valueNoise(seed) {
  const h = (x, y) => { let n = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0; n = (n ^ (n >>> 13)) * 1274126177 | 0; return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  return (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1); return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy; };
}

export function decorate(g, spec, seed, keepOut) {
  const rng = createRng(seed), W = g.W, H = g.H, mats = g.mats, cls = mats.cls, mat = g.mat;
  const keep = new Uint8Array(W * H);
  for (const r of keepOut) for (let y = Math.max(0, r[1]); y < Math.min(H, r[1] + r[3]); y++) for (let x = Math.max(0, r[0]); x < Math.min(W, r[0] + r[2]); x++) keep[y * W + x] = 1;
  const solid = m => cls[m] === CLS.STATIC && m !== 1;
  const canEdit = i => !keep[i] && !(g.flags[i] & F.PINNED) && mat[i] !== 1;
  const noise = valueNoise(seed);
  // 1. edge erosion: near solid/air boundaries, noise swaps cells across the boundary
  const erode = spec.erode ?? 0.3;
  if (erode > 0) {
    const out = mat.slice();
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x; if (!canEdit(i)) continue; const m = mat[i];
      let other = -1;
      for (let d = 1; d <= 4 && other < 0; d++) {
        const cands = [i - d, i + d, i - d * W, i + d * W];
        for (const j of cands) { if (j < 0 || j >= W * H) continue; const t = mat[j]; if (t !== m && (solid(t) !== solid(m)) && cls[t] !== CLS.LIQUID && cls[m] !== CLS.LIQUID) { other = t; break; } }
      }
      if (other < 0) continue;
      const n = noise(x / 6, y / 6) * 0.6 + noise(x / 2.5, y / 2.5) * 0.4;
      if (n > 1 - erode * 0.85) out[i] = other;
    }
    for (let i = 0; i < W * H; i++) if (out[i] !== mat[i]) { const x = i % W, y = (i / W) | 0; g.set(x, y, out[i]); }
  }
  // 2. rounding: cellular automaton on solid/air
  for (let pass = 0; pass < (spec.round ?? 2); pass++) {
    const changes = [];
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x; if (!canEdit(i)) continue; const m = mat[i];
      let n = 0, best = 0; const counts = {};
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const t = mat[i + dy * W + dx]; if (solid(t) || t === 1) { n++; counts[t] = (counts[t] || 0) + 1; if (!best || counts[t] > counts[best]) best = t; } }
      if (solid(m) && n <= 2) changes.push([x, y, 0]);
      else if (m === 0 && n >= 6 && best && best !== 1) changes.push([x, y, best]);
    }
    for (const [x, y, m] of changes) g.set(x, y, m);
  }
  // 3. shading bands (strata) + grime above floors: write the ramp step into shade low bits
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, m = mat[i]; if (!solid(m)) continue;
    let step = Math.floor(noise(x / 40 + 7, y / 7) * 4 + noise(x / 9, y / 9) * 2);
    if (spec.grime && y > 0 && mat[i - W] === 0) step = Math.max(0, step - 2);
    g.shade[i] = (g.shade[i] & 0xf8) | (Math.max(0, Math.min(7, step)));
  }
  // 5. cracks: random walks through stone/brick turning cells to air (1 wide)
  const nCracks = Math.round((spec.cracks ?? 0.1) * W * H / 4000);
  for (let k = 0; k < nCracks; k++) {
    let x = rng.int(2, W - 3), y = rng.int(2, H - 3); if (!solid(mat[y * W + x])) continue;
    const len = rng.int(6, 20); let dx = rng.pick([-1, 1]), dy = rng.pick([-1, 0, 1]);
    for (let s = 0; s < len; s++) {
      const i = y * W + x; if (!canEdit(i) || !solid(mat[i])) break;
      // never cut through thin walls: need solid on both sides perpendicular
      if (solid(mat[i - 1]) && solid(mat[i + 1]) && solid(mat[i - W]) && solid(mat[i + W]) && solid(mat[i - 2]) && solid(mat[i + 2])) g.set(x, y, 0);
      if (rng.chance(0.3)) dy = rng.pick([-1, 0, 1]); if (rng.chance(0.15)) dx = -dx;
      x += dx; y += dy; if (x < 3 || y < 3 || x >= W - 3 || y >= H - 3) break;
    }
  }
  // 6. moss on top surfaces near water or open sky
  const moss = spec.moss ?? 0.1, glow = spec.glow ?? 0;
  if (moss > 0 || glow > 0) {
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x; if (!canEdit(i)) continue; const m = mat[i];
      if (!(m === 2 || m === 3) || mat[i - W] !== 0) continue;
      const n = noise(x / 5 + 100, y / 5);
      if (n < moss * 1.6) { const skin = glow > 0 && noise(x / 11 + 50, y / 11) < glow * 3 ? 11 : 10; g.set(x, y, skin); if (n < moss * 0.6 && mat[i + W] === m) g.set(x, y + 1, skin); }
    }
  }
  // 7. wax runs: frozen drips under wax undersides
  if (spec.waxDrips) {
    for (let y = 1; y < H - 12; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x; if (mat[i] !== 8 || mat[i + W] !== 0 || keep[i + W]) continue;
      if (rng.next() < spec.waxDrips * 0.08) { const len = rng.int(2, 10); for (let s = 1; s <= len; s++) { if (mat[i + W * s] !== 0) break; g.set(x, y + s, 8); } }
    }
  }
  // 8. rubble piles at wall bases
  if (spec.rubble) {
    for (let k = 0; k < spec.rubble * W / 40; k++) {
      const x = rng.int(4, W - 5); for (let y = 2; y < H - 2; y++) { const i = y * W + x; if (mat[i] === 0 && solid(mat[i + W]) && !keep[i]) { const r = rng.int(1, 3); for (let dy = 0; dy < r; dy++) for (let dx = -r + dy; dx <= r - dy; dx++) if (mat[i - dy * W + dx] === 0) g.set(x + dx, y - dy, 20); break; } }
    }
  }
}
