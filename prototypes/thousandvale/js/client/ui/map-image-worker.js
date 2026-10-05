// Draws the map's terrain pictures off the main thread (map-load.js asks):
//   -> { id, type: 'world', url }   (data/world/horizon.bin, the whole world at 32 m)  <- { id, rgba, w, h, step }
//   -> { id, type: 'zone',  url }   (a zone's terrain.bin, 2 m; drawn at 4 m a pixel)   <- { id, rgba, w, h, mpp, origin }
// A parchment-toned relief: biome colour, muted, lit from the north-west by the slope, water by depth, a faint
// contour every 50 m. Pure maths on the readers stream B owns (horizon-read.js, terrain-read.js).
import { parseHorizon } from '../../rules/horizon-read.js';
import { parseTerrain } from '../../rules/terrain-read.js';

const hex = c => { const n = parseInt(String(c || '#7a8a5a').replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const PAPER = [196, 182, 150];
/** Biome colours pulled toward an old-map paper tone so the overlays (roads, names, markers) read on top. */
function palette(biomes) {
  return (biomes || []).map(b => {
    const c = hex(Array.isArray(b) ? b[2] : b?.color);
    return [c[0] * 0.62 + PAPER[0] * 0.38, c[1] * 0.62 + PAPER[1] * 0.38, c[2] * 0.62 + PAPER[2] * 0.38];
  });
}

/**
 * Shade a height grid into RGBA. H: Float32Array (W*Hh), water: Float32Array (NaN dry), biome: Uint8Array, cell = metres
 * per sample, stride = take every stride-th sample.
 */
function shade(Hg, Wg, B, W, Hh, cell, stride, pal, seaLevel = 0) {
  const w = Math.floor((W - 1) / stride), h = Math.floor((Hh - 1) / stride);
  const out = new Uint8ClampedArray(w * h * 4);
  const at = (i, j) => Hg[Math.min(Hh - 1, j) * W + Math.min(W - 1, i)];
  const d = cell * stride;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = x * stride, jj = y * stride, k = jj * W + i;
      const z0 = Hg[k];
      const dzdx = (at(i + stride, jj) - at(Math.max(0, i - stride), jj)) / (2 * d);
      const dzdy = (at(i, jj + stride) - at(i, Math.max(0, jj - stride))) / (2 * d);
      // light from the north-west, a little above the horizon
      const nx = -dzdx, ny = 1, nz = -dzdy, nl = Math.hypot(nx, ny, nz);
      const lit = (nx * -0.55 + ny * 0.62 + nz * -0.55) / nl;
      let shadeK = 0.55 + lit * 0.62;
      shadeK = Math.max(0.45, Math.min(1.3, shadeK));
      const wt = Wg[k];
      let r, g, b;
      if (wt === wt) {           // water (not NaN)
        const depth = Math.max(0, wt - z0);
        const t = Math.min(1, depth / 18);
        r = 120 - 70 * t; g = 156 - 62 * t; b = 168 - 40 * t;
        // a pale shore line where water is shallow
        if (depth < 0.8) { r += 30; g += 26; b += 14; }
      } else {
        const c = pal[B[k]] || PAPER;
        r = c[0] * shadeK; g = c[1] * shadeK; b = c[2] * shadeK;
        // a soft contour every 50 m
        const band = ((z0 - seaLevel) / 50);
        const f = band - Math.floor(band);
        if (f < 0.06 * (stride > 1 ? 1 : 2) && z0 > seaLevel + 4) { r *= 0.9; g *= 0.9; b *= 0.88; }
      }
      const o = (y * w + x) * 4;
      out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = 255;
    }
  }
  return { rgba: out, w, h };
}

self.onmessage = async ({ data }) => {
  try {
    const r = await fetch(data.url);
    if (!r.ok) throw new Error(`${data.url.split('/').slice(-2).join('/')} ${r.status}`);
    const buf = await r.arrayBuffer();
    if (data.type === 'world') {
      const hz = parseHorizon(buf);
      const W = hz.width, H = hz.height;
      const biome = new Uint8Array(W * H);
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) biome[j * W + i] = hz.biomeAt(i * hz.step, j * hz.step) || 0;
      const out = shade(hz.heightGrid(), hz.waterGrid(), biome, W, H, hz.step, 1, palette(hz.biomes));
      self.postMessage({ id: data.id, rgba: out.rgba, w: out.w, h: out.h, step: hz.step }, [out.rgba.buffer]);
    } else if (data.type === 'zone') {
      const t = parseTerrain(buf);
      const S = t.size;
      const out = shade(t.heightGrid(), t.waterGrid(), t.layers.biome || new Uint8Array(S * S), S, S, t.step, 2, palette((t.biomes || []).map(b => (Array.isArray(b) ? b : [b.key, b.name, b.color]))));
      self.postMessage({ id: data.id, rgba: out.rgba, w: out.w, h: out.h, mpp: t.step * 2, origin: t.origin }, [out.rgba.buffer]);
    }
  } catch (e) {
    self.postMessage({ id: data.id, error: e.message || String(e) });
  }
};
