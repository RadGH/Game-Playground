// Chunk painter: turns a chunk's cell layers into two RGBA images for the 3/4 view — colour and
// glow — in ONE pass, so a glowing pixel hidden behind a nearer building is hidden in both. PURE
// apart from writing into the buffers it is handed.
//
// The image is wider and taller than the chunk: MX cells of margin left and right (tree canopies)
// and OV cells above (columns stand UP: a cell with tall = t draws its front face over the t rows
// above it, then its top). Rows are painted north to south, so whatever is further south is drawn
// later and covers what is behind it — that is the whole 3/4 occlusion rule. Chunks are drawn in the
// same order by the renderer, so a chunk's overhang covers the bottom of the chunk north of it.
//
// Colour alpha = DEPTH (play-test 2, "people walk in front of buildings"): 255 = flat ground (never
// hides a sprite); 160 + row = a pixel painted by something STANDING on cell row `row` (0..63) of this
// chunk (pass 2). The renderer turns that row into a depth value, so a person standing north of a
// tall building is hidden by its front face. 0 = nothing painted. Anything reading the colour image
// should treat any alpha > 0 as opaque.
//
// Glow alpha: 255 = always lit (lava, fire, crystals, lamps); 120 = a window, which the renderer
// lights only at night.

import { CH } from '../planet/chunkgen.js';

export const MX = 4, OV = 32;
export const IW = CH + MX * 2, IH = CH + OV;

const PLANT = 1, BLOCK = 2, CRYSTAL = 3;
const BURN = 1;

export function createPainter(M) {
  const style = new Uint8Array(M.count);
  const pine = M.id.pine, dead = M.id.deadtree, bush = M.id.bush;
  for (let m = 1; m < M.count; m++) {
    if (M.tree[m] || m === bush || m === M.id.charwood) style[m] = PLANT;
    else if (m === M.id.crystal) style[m] = CRYSTAL;
    else if (M.tall[m] > 0 || M.roof[m] || M.built[m]) style[m] = BLOCK;
  }
  const water = M.id.water;

  /** Paint chunk `c` into `out` and `glow` (Uint8ClampedArray IW*IH*4). gx0/gy0 = world cell of its corner. */
  function paint(c, out, gx0, gy0, glow) {
    out.fill(0); glow?.fill(0);
    let gr = 0, gg = 0, gb = 0, ga = 0;            // the glow the next put() writes
    let ca = 255;                                    // the colour alpha (depth row) the next put() writes
    const put = (px, py, r, g, b) => {
      if (px < 0 || py < 0 || px >= IW || py >= IH) return;
      const o = (py * IW + px) * 4; out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = ca;
      if (glow) { glow[o] = gr; glow[o + 1] = gg; glow[o + 2] = gb; glow[o + 3] = ga; }
    };
    const noGlow = () => { gr = gg = gb = ga = 0; };
    // pass 1: the ground of the whole chunk
    for (let y = 0; y < CH; y++) for (let x = 0; x < CH; x++) {
      const i = y * CH + x, gx = gx0 + x, gy = gy0 + y;
      const h = c.height[i];
      const hn = y > 0 ? c.height[i - CH] : h, hw = x > 0 ? c.height[i - 1] : h;
      const n = hash(gx, gy);
      const m = c.mat[i];
      let r, g, b;
      noGlow();
      if (m === water) {
        const depth = Math.max(0, Math.min(1, (70 - h) / 60 + (8 - c.life[i]) * -0.02));
        r = 70 - depth * 46 + (n & 7); g = 150 - depth * 92 + (n & 7); b = 196 - depth * 92 + ((n >> 3) & 7);
        if (depth < 0.12) { r += 18; g += 14; b += 6; }
      } else if (m && M.liquid[m]) {
        r = M.r[m] + (n & 31) - 16; g = M.g[m] + ((n >> 5) & 31) - 16; b = M.b[m];
        if (M.emit[m]) { gr = M.er[m] * 255; gg = M.eg[m] * 255; gb = M.eb[m] * 255; ga = 255; }
      } else {
        const gm = c.ground[i];
        const v = M.vary[gm], d = ((n & 255) / 255 - 0.5) * v;
        let shade = 1 + (h - hn) * 0.05 + (h - hw) * 0.035;
        if (M.pattern[gm] === 2 && ((gx & 3) === 0 || (gy & 1) === 0 && ((gx + 2) & 3) === 0)) shade *= 0.9;
        r = (M.r[gm] + d) * shade; g = (M.g[gm] + d) * shade; b = (M.b[gm] + d * 0.6) * shade;
      }
      if (c.flag[i] & BURN && !(m && M.tall[m])) { r = 255; g = 120 + (n & 63); b = 30; gr = 255; gg = 130; gb = 40; ga = 255; }
      put(x + MX, y + OV, clamp(r), clamp(g), clamp(b));
    }
    // pass 2: everything standing up, north row first
    for (let y = 0; y < CH; y++) for (let x = 0; x < CH; x++) {
      const i = y * CH + x, m = c.mat[i];
      if (!m || m === water || M.liquid[m]) continue;
      const t = c.tall[i], s = style[m];
      const gx = gx0 + x, gy = gy0 + y, n = hash(gx, gy);
      const R = M.r[m], G = M.g[m], B = M.b[m];
      const px = x + MX, py = y + OV;
      const burning = c.flag[i] & BURN;
      ca = 160 + y;
      noGlow();
      if (M.emit[m]) { gr = M.er[m] * 255; gg = M.eg[m] * 255; gb = M.eb[m] * 255; ga = 255; }
      if (burning) { gr = 255; gg = 120; gb = 30; ga = 255; }
      const fire = (r, g, b, k) => burning && ((n >> k) & 3) ? [255, 110 + ((n >> (k + 2)) & 90), 30] : [r, g, b];
      if (s === PLANT) {
        if (m === bush || t <= 1) { blob(put, px, py - 1, 1, ...fire(R, G, B, 0), n); continue; }
        const trunk = m === dead ? t : Math.max(1, Math.round(t * 0.35));
        for (let k = 0; k < trunk; k++) put(px, py - k, ...fire(92 - (k & 1) * 8, 66, 40, k));
        if (m === dead || m === M.id.charwood) { put(px - 1, py - t + 1, 80, 64, 48); put(px + 1, py - t + 2, 80, 64, 48); continue; }
        if (m === pine) {
          const top = py - t;
          for (let k = 0; k < t - 1; k++) {
            const w = Math.floor(k * 0.45);
            for (let dx = -w; dx <= w; dx++) {
              const f = dx > 0 ? 0.78 : 1, j = hash(gx + dx, gy - k) & 15;
              put(px + dx, top + k, ...fire(clamp((R + j - 8) * f), clamp((G + j - 8) * f), clamp((B + j - 8) * f), (dx + k) & 7));
            }
          }
        } else {
          const rad = Math.max(1, Math.round(t * 0.32));
          blob(put, px, py - t + rad, rad, ...fire(R, G, B, 2), n);
        }
      } else if (s === BLOCK || s === CRYSTAL) {
        // front face (the wall colour for roofs), darker toward the ground; windows on houses
        const FR = M.fr[m], FG = M.fg[m], FB = M.fb[m];
        const win = M.windows[m] && t >= 3;
        for (let k = 1; k <= t; k++) {
          let f = 0.62 + 0.18 * (k / t);
          if (M.pattern[m] === 2 && ((k & 1) ? (gx & 1) === 0 : ((gx + 1) & 3) === 0)) f *= 0.86;
          // cracks: the weaker the cell, the more of its face is split dark
          if (c.hp[i] && c.hp[i] < 200 && M.built[m] && (hash(gx * 7 + k, gy) & 255) > c.hp[i] + 40) f *= 0.45;
          if (win && k === 2 && (gx % 3) === 1 && !burning) {
            gr = 255; gg = 176; gb = 90; ga = 120;
            put(px, py - k + 1, 46, 34, 26);
            gr = gg = gb = ga = 0;
            continue;
          }
          put(px, py - k + 1, ...fire(clamp(FR * f), clamp(FG * f), clamp(FB * f), k & 7));
        }
        if (M.emit[m]) { gr = M.er[m] * 255; gg = M.eg[m] * 255; gb = M.eb[m] * 255; ga = 255; }
        // top: brighter on a north-facing slope edge so gables read
        const j = (n & 15) - 8;
        const north = y > 0 ? c.tall[i - CH] : t, south = y < CH - 1 ? c.tall[i + CH] : t;
        const lift = M.roof[m] ? (t > north ? 1.14 : t > south ? 0.9 : 1) : 1.08;
        const rr = (M.pattern[m] === 1 && (gy & 1)) ? 0.92 : 1;
        put(px, py - t, ...fire(clamp(R * lift * rr + j), clamp(G * lift * rr + j), clamp(B * lift * rr + j), 3));
      } else {
        const j = (n & 15) - 8;
        put(px, py, ...fire(clamp(R + j), clamp(G + j), clamp(B + j), 1));
      }
    }
    return out;
  }

  return { paint, IW, IH, MX, OV };
}

function blob(put, cx, cy, r, R, G, B, n) {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const d = dx * dx + dy * dy;
    if (d > r * r + r * 0.6) continue;
    const j = hash(cx + dx + n, cy + dy) & 15;
    const f = 1 + (-dx - dy) * 0.06 / Math.max(1, r);
    put(cx + dx, cy + dy, clamp((R + j - 8) * f), clamp((G + j - 8) * f), clamp((B + j - 8) * f));
  }
}

export function hash(x, y) {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  return (h ^ (h >>> 16)) >>> 0;
}
function clamp(v) { return v < 0 ? 0 : v > 255 ? 255 : v | 0; }
