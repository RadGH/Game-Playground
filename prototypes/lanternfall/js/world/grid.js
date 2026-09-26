// The cell grid (docs/06 §2–3): flat typed arrays, 64x64 chunks with double-buffered awake flags and
// dirty rects, and the only two writers: set() and swap(). Pure (no DOM).
import { CLS } from './materials.js';

export const CHUNK = 64;
export const F = { BURNING: 1, WET: 2, SHOCK: 4, BUILT: 8, PINNED: 16, FROM_WATER: 32, SETTLED: 64, LIT_STATIC: 128 };
export const AMBIENT_TEMP = 12;

export function createGrid(W, H, mats) {
  const n = W * H, CW = Math.ceil(W / CHUNK), CH = Math.ceil(H / CHUNK), NC = CW * CH;
  const g = {
    W, H, n, CW, CH, NC, mats,
    mat: new Uint8Array(n), shade: new Uint8Array(n), temp: new Int16Array(n).fill(AMBIENT_TEMP),
    life: new Uint8Array(n), flags: new Uint8Array(n), stamp: new Uint8Array(n), bg: new Uint8Array(n), aux: new Uint8Array(n),
    // chunk state
    awake: new Uint8Array(NC), awakeNext: new Uint8Array(NC),
    dirty: new Int16Array(NC * 4), dirtyNext: new Int16Array(NC * 4), gfx: new Int16Array(NC * 4),
    hot: new Uint8Array(NC), hotNext: new Uint8Array(NC), lastActive: new Uint32Array(NC),
    tick: 0, stampVal: 1, rngState: 0x9e3779b9,
    supportQueue: [], // cell indices whose support must be rechecked (world/support.js)
    counters: { waterCells: 0 },
    onDrain: null, // (mat, x, y) when a cell leaves through a drain edge
    drainMask: null, // Uint8Array(W + H*2) edges flagged as drains (see setDrain)
  };
  // empty rects: x0 > x1
  const clearRects = a => { for (let c = 0; c < NC; c++) { a[c * 4] = 32767; a[c * 4 + 1] = 32767; a[c * 4 + 2] = -1; a[c * 4 + 3] = -1; } };
  clearRects(g.dirty); clearRects(g.dirtyNext); clearRects(g.gfx);

  function grow(rects, c, x0, y0, x1, y1) {
    const o = c * 4, cx0 = (c % CW) * CHUNK, cy0 = ((c / CW) | 0) * CHUNK, cx1 = Math.min(W, cx0 + CHUNK) - 1, cy1 = Math.min(H, cy0 + CHUNK) - 1;
    if (x0 < cx0) x0 = cx0; if (y0 < cy0) y0 = cy0; if (x1 > cx1) x1 = cx1; if (y1 > cy1) y1 = cy1;
    if (x0 < rects[o]) rects[o] = x0; if (y0 < rects[o + 1]) rects[o + 1] = y0;
    if (x1 > rects[o + 2]) rects[o + 2] = x1; if (y1 > rects[o + 3]) rects[o + 3] = y1;
  }

  /** Something changed at (x,y): wake its chunk (and neighbours near an edge) for next tick. */
  g.touch = function (x, y) {
    const cx = (x / CHUNK) | 0, cy = (y / CHUNK) | 0, c = cy * CW + cx;
    g.awakeNext[c] = 1; grow(g.dirtyNext, c, x - 2, y - 2, x + 2, y + 2);
    grow(g.gfx, c, x, y, x, y);
    const lx = x - cx * CHUNK, ly = y - cy * CHUNK;
    if (lx < 2 && cx > 0) { g.awakeNext[c - 1] = 1; grow(g.dirtyNext, c - 1, x - 2, y - 2, x, y + 2); }
    if (lx > CHUNK - 3 && cx < CW - 1) { g.awakeNext[c + 1] = 1; grow(g.dirtyNext, c + 1, x, y - 2, x + 2, y + 2); }
    if (ly < 2 && cy > 0) { g.awakeNext[c - CW] = 1; grow(g.dirtyNext, c - CW, x - 2, y - 2, x + 2, y); }
    if (ly > CHUNK - 3 && cy < CH - 1) { g.awakeNext[c + CW] = 1; grow(g.dirtyNext, c + CW, x - 2, y, x + 2, y + 2); }
  };
  /** Mark only the graphics as changed (temperature glow, flags). */
  g.touchGfx = function (x, y) { const c = ((y / CHUNK) | 0) * CW + ((x / CHUNK) | 0); grow(g.gfx, c, x, y, x, y); };
  g.markHot = function (x, y) { g.hotNext[((y / CHUNK) | 0) * CW + ((x / CHUNK) | 0)] = 1; };
  g.wakeRect = function (x0, y0, x1, y1) {
    x0 = Math.max(0, x0 | 0); y0 = Math.max(0, y0 | 0); x1 = Math.min(W - 1, x1 | 0); y1 = Math.min(H - 1, y1 | 0);
    for (let cy = (y0 / CHUNK) | 0; cy <= ((y1 / CHUNK) | 0); cy++) for (let cx = (x0 / CHUNK) | 0; cx <= ((x1 / CHUNK) | 0); cx++) {
      const c = cy * CW + cx; g.awakeNext[c] = 1; grow(g.dirtyNext, c, x0, y0, x1, y1); grow(g.gfx, c, x0, y0, x1, y1);
    }
  };

  g.idx = (x, y) => y * W + x;
  g.inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  g.get = (x, y) => (x >= 0 && y >= 0 && x < W && y < H) ? g.mat[y * W + x] : 1; // outside = bedrock

  /** xorshift32 for cell rules (deterministic per tick). */
  g.rand = function () { let r = g.rngState; r ^= r << 13; r ^= r >>> 17; r ^= r << 5; g.rngState = r >>> 0; return (r >>> 0) / 4294967296; };

  /** Create a cell. opts: { temp, flags, shade, life } */
  g.set = function (x, y, m, opts) {
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    const i = y * W + x, old = g.mat[i];
    if (old === 22) g.counters.waterCells--; if (m === 22) g.counters.waterCells++;
    g.mat[i] = m;
    const c = mats.cls[m];
    g.life[i] = opts?.life ?? (c === CLS.GAS || c === CLS.FIRE ? lifeFor(m) : mats.hp[m]);
    g.temp[i] = opts?.temp ?? (mats.temp0[m] !== AMBIENT_TEMP ? mats.temp0[m] : (m === 0 ? g.temp[i] : AMBIENT_TEMP));
    g.flags[i] = opts?.flags ?? 0; g.aux[i] = 0;
    g.shade[i] = opts?.shade ?? ((g.rand() * 256) | 0);
    g.stamp[i] = g.stampVal;
    if (g.temp[i] > AMBIENT_TEMP + 4 || g.temp[i] < AMBIENT_TEMP - 4 || mats.emit[m * 4 + 3] > 0.5) g.markHot(x, y);
    g.touch(x, y);
    const oc = mats.cls[old];
    if (oc === CLS.STATIC && m !== old) g.supportQueue.push(i);
    return true;
  };
  function lifeFor(m) { const a = mats.lifeMin[m], b = mats.lifeMax[m]; return Math.min(255, Math.max(1, Math.round((a + g.rand() * (b - a)) / 4))); }
  g.lifeFor = lifeFor;

  /** Move cell i to j and j to i (all arrays except bg). Coordinates given to avoid divisions. */
  g.swap = function (i, j, x, y, x2, y2) {
    const mat = g.mat; let t = mat[i]; mat[i] = mat[j]; mat[j] = t;
    const sh = g.shade; t = sh[i]; sh[i] = sh[j]; sh[j] = t;
    const tp = g.temp; t = tp[i]; tp[i] = tp[j]; tp[j] = t;
    const lf = g.life; t = lf[i]; lf[i] = lf[j]; lf[j] = t;
    const fl = g.flags; t = fl[i]; fl[i] = fl[j]; fl[j] = t;
    const ax = g.aux; t = ax[i]; ax[i] = ax[j]; ax[j] = t;
    g.stamp[i] = g.stampVal; g.stamp[j] = g.stampVal;
    g.touch(x, y); g.touch(x2, y2);
  };

  /** Damage a cell; returns true if destroyed. kind index into RESIST_KINDS. */
  g.damage = function (x, y, amount, kind = 0) {
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    const i = y * W + x, m = g.mat[i], c = mats.cls[m];
    if (m === 0 || m === 1 || (c !== CLS.STATIC && c !== CLS.POWDER)) return false;
    const d = amount * mats.resist[kind][m]; if (d <= 0) return false;
    const hp = g.life[i] - d;
    if (hp <= 0) { g.set(x, y, 0); return true; }
    g.life[i] = hp; g.touchGfx(x, y); return false;
  };
  g.heat = function (x, y, delta) {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = y * W + x; g.temp[i] = Math.max(-273, Math.min(3000, g.temp[i] + delta)); g.markHot(x, y); g.touch(x, y);
  };
  g.wet = function (x, y, ticks = 255) { const i = y * W + x; g.flags[i] |= F.WET; if (mats.cls[g.mat[i]] === CLS.STATIC || mats.cls[g.mat[i]] === CLS.POWDER) g.aux[i] = Math.max(g.aux[i], ticks); g.touchGfx(x, y); };

  g.solidAt = (x, y) => { if (x < 0 || y < 0 || x >= W || y >= H) return true; const c = mats.cls[g.mat[y * W + x]]; return c === CLS.STATIC || c === CLS.POWDER; };
  g.liquidAt = (x, y) => x >= 0 && y >= 0 && x < W && y < H && mats.cls[g.mat[y * W + x]] === CLS.LIQUID;

  /** Begin a tick: promote next-buffers to current. Called by stepCells. */
  g.beginTick = function () {
    g.tick++; g.stampVal = (g.tick % 255) + 1;
    g.rngState = (g.rngState ^ Math.imul(g.tick, 2654435761)) >>> 0 || 1;
    let t = g.awake; g.awake = g.awakeNext; g.awakeNext = t; g.awakeNext.fill(0);
    t = g.dirty; g.dirty = g.dirtyNext; g.dirtyNext = t; clearRects(g.dirtyNext);
    t = g.hot; g.hot = g.hotNext; g.hotNext = t; g.hotNext.fill(0);
  };
  g.clearGfx = function (c) { const o = c * 4; g.gfx[o] = 32767; g.gfx[o + 1] = 32767; g.gfx[o + 2] = -1; g.gfx[o + 3] = -1; };
  g.allGfxDirty = function () { for (let c = 0; c < NC; c++) { const cx = (c % CW) * CHUNK, cy = ((c / CW) | 0) * CHUNK; grow(g.gfx, c, cx, cy, cx + CHUNK - 1, cy + CHUNK - 1); } };
  g.wakeAll = function () { g.wakeRect(0, 0, W - 1, H - 1); };

  /** Count materials in a rect, returns { total, liquid, water, steam, web, shock, byMat } fractions helper. */
  g.countIn = function (x0, y0, w, h) {
    const r = { total: 0, liquid: 0, gas: 0, steam: 0, web: 0, shock: 0, solid: 0, mats: {} };
    x0 = Math.floor(x0); y0 = Math.floor(y0);
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      r.total++; if (x < 0 || y < 0 || x >= W || y >= H) { r.solid++; continue; }
      const i = y * W + x, m = g.mat[i], c = mats.cls[m];
      if (c === CLS.LIQUID) { r.liquid++; r.mats[m] = (r.mats[m] || 0) + 1; if (g.flags[i] & F.SHOCK) r.shock++; }
      else if (c === CLS.GAS) { r.gas++; if (m === 29) r.steam++; }
      else if (m === 13) r.web++;
      else if (c === CLS.STATIC || c === CLS.POWDER) r.solid++;
    }
    return r;
  };
  g.snapshot = () => ({ mat: g.mat.slice(), temp: g.temp.slice(), flags: g.flags.slice(), life: g.life.slice() });
  return g;
}
