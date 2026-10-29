// The cell grid (PLAN §3.1). PURE.
//
// One Uint32 per cell. The whole map lives in ONE buffer laid out chunk by chunk: chunk ci holds
// cells [ci*4096, ci*4096+4096) in row order inside the chunk. So `grid.chunk(cx, cy)` is a real
// Uint32Array per 64x64 chunk (a view, no copy), which is what saves and worker frames send, while
// the rules can still walk across chunk borders with one index function.
//
// Quarter-res fields (one value per 4x4 cells) are plain row-major Uint8Arrays: gasDensity,
// gasKind, wet, fog, noise, glow, light. Wind is a direction (0-7, see rng.DIR8) and a strength 0-3.

export const CHUNK = 64;
export const CHUNK_SHIFT = 6;
export const CHUNK_CELLS = 4096;

// Cell bit layout (PLAN §3.1).
export const MAT_MASK = 0xff;
export const TEMP_SHIFT = 8;
export const AMT_SHIFT = 16;
export const BURN = 1 << 24;
export const OWNED = 1 << 25;
export const SCORCH = 1 << 26;
export const ROAD = 1 << 27;
export const BRIDGE = 1 << 28;
export const RAIL = 1 << 29;
export const EDGE = 1 << 30;
export const WET = 1 << 31; // note: sign bit; always compare with !== 0, never > 0

export const mat = (c) => c & 0xff;
export const temp = (c) => (c >>> 8) & 0xff;
export const amt = (c) => (c >>> 16) & 0xff;
/** Build a cell value. */
export const cell = (m, t, a = 0, flags = 0) => ((m & 0xff) | ((t & 0xff) << 8) | ((a & 0xff) << 16) | flags) >>> 0;
export const withMat = (c, m) => ((c & ~0xff) | m) >>> 0;
export const withTemp = (c, t) => ((c & ~0xff00) | ((t & 0xff) << 8)) >>> 0;
export const withAmt = (c, a) => ((c & ~0xff0000) | ((a & 0xff) << 16)) >>> 0;

/**
 * Create an empty grid. W and H must be multiples of 64.
 */
export function createGrid(W, H) {
  if (W % CHUNK || H % CHUNK) throw new Error('grid: size must be a multiple of 64');
  const CW = W >> CHUNK_SHIFT, CH = H >> CHUNK_SHIFT;
  const nChunks = CW * CH;
  const cells = new Uint32Array(W * H);
  const QW = W >> 2, QH = H >> 2;
  const q = QW * QH;
  const g = {
    W, H, CW, CH, nChunks, QW, QH,
    cells,
    // per-chunk state
    ver: new Uint32Array(nChunks),        // bumped whenever any cell in the chunk changes (render sync)
    awake: new Uint8Array(nChunks),       // fire/heat rules run on this chunk this tick
    rows: new Uint32Array(nChunks * 2),   // which of the chunk's 64 rows have anything to do (bit per row)
    wakeNext: new Uint8Array(nChunks),
    cold: new Uint8Array(nChunks),        // has cells below ambient (frost) — slow pass warms them
    regrowHint: new Uint8Array(nChunks),  // may hold regrowable cells
    emitHint: new Uint8Array(nChunks),    // may hold emitting cells (coarse light field)
    gasAwake: new Uint8Array(nChunks),
    gasVer: new Uint32Array(nChunks),     // bumped when the chunk's gas changes (render sync)
    wetAwake: new Uint8Array(nChunks),
    // per-cell scratch (heat gathered this tick)
    heat: new Uint16Array(W * H),
    // quarter-res fields
    gasDensity: new Uint8Array(q),
    gasKind: new Uint8Array(q),
    gasBack: new Uint8Array(q),
    gasKindBack: new Uint8Array(q),
    wet: new Uint8Array(q),
    fog: new Uint8Array(q),
    noise: new Uint8Array(q),
    glow: new Uint8Array(q),
    light: new Uint8Array(q),
    wind: { dir: 0, strength: 1 },
    /** Index of world cell (x, y). No bounds check. */
    idx(x, y) {
      return ((((y >> 6) * CW + (x >> 6)) << 12) | ((y & 63) << 6) | (x & 63)) >>> 0;
    },
    inside(x, y) { return x >= 0 && y >= 0 && x < W && y < H; },
    get(x, y) { return cells[g.idx(x, y)]; },
    /** Set a cell and mark its chunk changed. */
    set(x, y, v) {
      const i = g.idx(x, y);
      cells[i] = v >>> 0;
      g.ver[i >>> 12]++;
    },
    /** World x of cell index i. */
    xOf(i) { return (((i >>> 12) % CW) << 6) | (i & 63); },
    yOf(i) { return ((((i >>> 12) / CW) | 0) << 6) | ((i >>> 6) & 63); },
    chunkIndex(cx, cy) { return cy * CW + cx; },
    /** The cells of one chunk as a Uint32Array view (no copy). */
    chunk(cx, cy) {
      const ci = cy * CW + cx;
      return cells.subarray(ci << 12, (ci << 12) + CHUNK_CELLS);
    },
    /** Wake the chunk holding (x, y) for the fire/heat rules, and its neighbours if near a border. */
    wakeAt(x, y) {
      const cx = x >> 6, cy = y >> 6;
      g.wakeChunk(cx, cy);
      const lx = x & 63, ly = y & 63;
      if (lx < 2) g.wakeChunk(cx - 1, cy);
      if (lx > 61) g.wakeChunk(cx + 1, cy);
      if (ly < 2) g.wakeChunk(cx, cy - 1);
      if (ly > 61) g.wakeChunk(cx, cy + 1);
    },
    wakeChunk(cx, cy) {
      if (cx < 0 || cy < 0 || cx >= CW || cy >= CH) return;
      const ci = cy * CW + cx;
      g.awake[ci] = 1;
      g.wakeNext[ci] = 1;
      // something outside the rules touched it: look at every row next tick
      g.rows[ci * 2] = 0xffffffff; g.rows[ci * 2 + 1] = 0xffffffff;
    },
    /** Quarter-res index of world cell (x, y). */
    qIdx(x, y) { return (y >> 2) * QW + (x >> 2); },
  };
  return g;
}

/** Count awake chunks. */
export function awakeCount(g) {
  let n = 0;
  for (let i = 0; i < g.nChunks; i++) n += g.awake[i];
  return n;
}
