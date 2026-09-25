// One canvas the size of the whole map holding every cell's color. Only chunks marked dirty are
// recomputed and uploaded (putImageData with a dirty rectangle), so a single cell change costs
// one 32x32 upload, not the whole map.

import { M, S } from '../world/materials.js';
import { CHUNK } from '../world/world.js';
import { hash2 } from '../core/rng.js';
import { hexToABGR } from '../core/util.js';

export class TerrainLayer {
  constructor(world, opts = {}) {
    this.world = world;
    this.canvas = document.createElement('canvas');
    this.canvas.width = world.w; this.canvas.height = world.h;
    this.ctx = this.canvas.getContext('2d');
    this.image = this.ctx.createImageData(world.w, world.h);
    this.pix = new Uint32Array(this.image.data.buffer);
    this.palette = [];
    this.planPalette = [];
    this.teamTint = opts.teamTint || {};
    // Original surface line: used for depth shading and the cave back wall.
    this.surface = opts.surface || new Float32Array(world.w).fill(0);
    this.buildPalettes();
    this.time = 0;
  }

  buildPalettes() {
    const mats = this.world.mats;
    for (const m of mats.list) {
      this.palette[m.id] = m.colors.map((c) => hexToABGR(c));
      // Blueprint outline color: same hue, mostly transparent.
      this.planPalette[m.id] = m.colors.map((c) => hexToABGR(c, 70));
    }
    this.caveWall = ['#15142a', '#17162e', '#131226', '#181730'].map((c) => hexToABGR(c));
    // Damage darkening lookup: 8 levels.
    this.dark = [];
    for (let lvl = 0; lvl < 8; lvl++) this.dark[lvl] = 0.45 + 0.55 * (lvl / 7);
  }

  colorAt(x, y) {
    const w = this.world;
    const i = y * w.w + x;
    const m = w.mat[i];
    const h = hash2(x, y);
    if (m === M.EMPTY) {
      const p = w.plan[i];
      if (p) {
        // Blueprint: dotted outline pattern.
        if (((x + y) & 1) === 0) return this.planPalette[p][h & 3];
        return 0x10ffffff;
      }
      // Below the original surface, empty space is a cave: draw a dark back wall.
      const depth = y - this.surface[x];
      if (depth > 1) {
        const f = Math.max(0.35, 1 - depth / 260);
        return scaleColor(this.caveWall[h & 3], f);
      }
      return 0;
    }
    if (m === M.FOOTPRINT) return 0; // buildings draw their own sprites
    const pal = this.palette[m];
    let c = pal[h % pal.length];
    if (w.mats.built[m]) {
      // Darken by damage and add crack speckles.
      const frac = w.hp[i] / w.mats.hp[m];
      if (frac < 0.999) {
        const lvl = Math.max(0, Math.min(7, Math.floor(frac * 8)));
        let f = this.dark[lvl];
        if (frac < 0.6 && (h & 7) === 0) f *= 0.5;
        c = scaleColor(c, f);
      }
      // Team edge tint for built cells touching air: faint faction glow on outer surfaces.
      const t = w.team[i];
      if (t && this.teamTint[t] && isEdge(w, x, y)) c = mixColor(c, this.teamTint[t], 0.35);
    } else if (m === M.SLAG) {
      const heat = w.aux[i] / 180;
      c = mixColor(pal[h % pal.length], hexToABGR('#6d7189'), heat);
    } else if (w.mats.state[m] === S.STATIC && m !== M.BEDROCK) {
      const depth = y - this.surface[x];
      let f = Math.max(0.45, 1 - depth / 320);
      // Strata: gentle bands that wobble with x.
      if (m === M.ROCK) f *= 1 + 0.07 * Math.sin((y + Math.sin(x * 0.045) * 6 + Math.sin(x * 0.011) * 14) * 0.33);
      // Surface cells (air above) are lighter so the skyline reads.
      if (y > 0 && w.mat[i - w.w] === M.EMPTY) f *= 1.3;
      else if (y > 1 && w.mat[i - 2 * w.w] === M.EMPTY) f *= 1.12;
      c = scaleColor(c, f);
      // Ore glints.
      if (m === M.CRYSTAL && (h & 31) === 0) c = 0xffffffd0 >>> 0;
    } else if (m === M.DUST) {
      if (y > 0 && w.mat[i - w.w] === M.EMPTY) c = scaleColor(c, 1.2);
    }
    return c;
  }

  // Redraw dirty chunks. Returns number of chunks redrawn.
  update() {
    const w = this.world;
    if (!w.anyGfxDirty) return 0;
    let n = 0;
    for (let cy = 0; cy < w.ch; cy++) for (let cx = 0; cx < w.cw; cx++) {
      const ci = cy * w.cw + cx;
      if (!w.dirtyGfx[ci]) continue;
      w.dirtyGfx[ci] = 0;
      const x0 = cx * CHUNK, y0 = cy * CHUNK;
      const x1 = Math.min(w.w, x0 + CHUNK), y1 = Math.min(w.h, y0 + CHUNK);
      for (let y = y0; y < y1; y++) {
        const row = y * w.w;
        for (let x = x0; x < x1; x++) this.pix[row + x] = this.colorAt(x, y);
      }
      this.ctx.putImageData(this.image, 0, 0, x0, y0, x1 - x0, y1 - y0);
      n++;
    }
    w.anyGfxDirty = false;
    return n;
  }
}

function isEdge(w, x, y) {
  return w.get(x, y - 1) === M.EMPTY || w.get(x - 1, y) === M.EMPTY || w.get(x + 1, y) === M.EMPTY;
}

function scaleColor(c, f) {
  const r = Math.min(255, (c & 255) * f), g = Math.min(255, ((c >> 8) & 255) * f), b = Math.min(255, ((c >> 16) & 255) * f);
  return ((c & 0xff000000) | (b << 16) | (g << 8) | r) >>> 0;
}

function mixColor(a, b, t) {
  const ar = a & 255, ag = (a >> 8) & 255, ab = (a >> 16) & 255;
  const br = b & 255, bg = (b >> 8) & 255, bb = (b >> 16) & 255;
  const r = ar + (br - ar) * t, g = ag + (bg - ag) * t, bl = ab + (bb - ab) * t;
  return ((a & 0xff000000) | (bl << 16) | (g << 8) | r) >>> 0;
}
