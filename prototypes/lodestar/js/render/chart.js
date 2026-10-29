// The chart view: at range ¼ and ½ the scope stops drawing cells and draws a downsampled CHART instead — flat fills
// per kind of ground with outlines where land meets water, lava or a cliff, like a plotted map (PLAN M2, ROAST 1.4).
// Pure helpers (chartClassGrid) are node-tested; paintChart writes into an ImageData-shaped object.

export const CHART_CLASSES = ['land', 'forest', 'sand', 'rock', 'shallow', 'deep', 'lava', 'ore', 'cliff'];
const CI = Object.fromEntries(CHART_CLASSES.map((c, i) => [c, i]));
// which "side" a class is on, for outlines: 0 land, 1 water, 2 lava, 3 cliff
const SIDE = [0, 0, 0, 0, 1, 1, 2, 0, 3];
// priority when a block holds several kinds: an edge, lava, deep water or ore must survive the downsample
const PRIORITY = [1, 2, 1, 2, 4, 5, 6, 7, 9];

export const CHART_COLOURS = {
  land: [96, 108, 72], forest: [58, 82, 56], sand: [150, 138, 98], rock: [104, 100, 96],
  shallow: [58, 108, 132], deep: [30, 58, 96], lava: [196, 84, 34], ore: [222, 186, 96], cliff: [24, 22, 22],
  outline: [228, 214, 170], grey: null,
};

/**
 * One chart class per factor×factor block of cells.
 * @param {(x:number,y:number)=>number} cellAt  §3.1 cell getter
 * @param {number} N map size in cells (square)
 * @param {number} factor 2 or 4
 * @param {(mat:number)=>string} chartOf  material index → chart class name
 */
export function chartClassGrid(cellAt, N, factor, chartOf) {
  const g = N / factor, out = new Uint8Array(g * g);
  const count = new Uint16Array(CHART_CLASSES.length);
  for (let by = 0; by < g; by++) for (let bx = 0; bx < g; bx++) {
    count.fill(0);
    for (let y = 0; y < factor; y++) for (let x = 0; x < factor; x++) {
      const c = cellAt(bx * factor + x, by * factor + y);
      const cls = (c & (1 << 30)) ? CI.cliff : (CI[chartOf(c & 0xff)] ?? CI.land);
      count[cls]++;
    }
    let best = 0, bestScore = -1;
    for (let k = 0; k < count.length; k++) {
      if (!count[k]) continue;
      // a cliff, lava or ore cell anywhere in the block wins; otherwise the most common kind, ties by priority
      const score = (k === CI.cliff || k === CI.ore || k === CI.lava ? 1000 : 0) + count[k] * 10 + PRIORITY[k];
      if (score > bestScore) { bestScore = score; best = k; }
    }
    out[by * g + bx] = best;
  }
  return out;
}

/** Paint a class grid into `img` ({ width, height, data }) with outlines between sides. `grey` paints the seen-before copy. */
export function paintChart(img, grid, g, { grey = false } = {}) {
  const d = img.data;
  const col = CHART_CLASSES.map(c => CHART_COLOURS[c]);
  const ol = CHART_COLOURS.outline;
  for (let y = 0; y < g; y++) for (let x = 0; x < g; x++) {
    const k = grid[y * g + x];
    let c = col[k];
    const s = SIDE[k];
    const edge = (x > 0 && SIDE[grid[y * g + x - 1]] !== s) || (y > 0 && SIDE[grid[(y - 1) * g + x]] !== s) ||
      (x < g - 1 && SIDE[grid[y * g + x + 1]] !== s) || (y < g - 1 && SIDE[grid[(y + 1) * g + x]] !== s);
    if (edge && s !== 3) c = ol;
    // forest stipple and lava hatch so the chart reads without colour too
    let r = c[0], gg = c[1], b = c[2];
    if (k === CI.forest && ((x + y * 3) % 5 === 0)) { r += 26; gg += 30; b += 18; }
    if (k === CI.lava && ((x + y) % 4 === 0)) { r = 250; gg = 150; b = 60; }
    if (k === CI.deep && ((x * 7 + y) % 9 === 0)) { r += 10; gg += 16; b += 26; }
    const i = (y * g + x) * 4;
    if (grey) { const l = Math.round((r * 0.3 + gg * 0.55 + b * 0.15) * 0.62); d[i] = d[i + 1] = d[i + 2] = l; }
    else { d[i] = r; d[i + 1] = gg; d[i + 2] = b; }
    d[i + 3] = 255;
  }
}
