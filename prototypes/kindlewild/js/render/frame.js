// Builds one frame on the CPU: the colour of every cell, what glows, and a "relief height" (terrain
// + tall things like trees and walls) that the GPU lights from the sun. Creatures, particles,
// bolts and gas are drawn into the same buffers. The renderer (gl.js) uploads them.
//
// colour alpha carries a surface class for the shader: 0 plain, 1 water, 2 lava/fire, 3 shiny,
// 4 foliage (sways a little), 5 charged water.

import { BURN, WET, CHARGED } from '../sim/world.js';
import { hash2 } from '../sim/rng.js';
import { GAS_LOOK } from '../sim/gas.js';

export const CLS = { plain: 0, water: 1, hot: 2, shiny: 3, leaf: 4, charged: 5, glow: 6 };

export function createFrame(w) {
  const N = w.N;
  const f = {
    color: new Uint8Array(N * 4),
    emit: new Uint8Array(N * 4),
    relief: new Uint8Array(N),
    hv: new Uint8Array(N),          // per-cell variation, computed once
    frame: 0,
  };
  for (let y = 0; y < w.H; y++) for (let x = 0; x < w.W; x++) f.hv[y * w.W + x] = hash2(x, y);
  return f;
}

const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

export function buildFrame(f, w, ps, extra) {
  const M = w.M, W = w.W, H = w.H, ID = M.id;
  const { color, emit, relief, hv } = f;
  const { mat, ground, height, temp, life, flag } = w;
  const amb = M.ambient;
  f.frame++;
  const fr = f.frame;
  // light buckets (8x8 cells): bright clusters become point lights for the shader
  const BW = Math.ceil(W / 8), BH = Math.ceil(H / 8);
  if (!f.lb || f.lb.length !== BW * BH * 6) f.lb = new Float32Array(BW * BH * 6);
  const lb = f.lb;
  lb.fill(0);
  const night = extra.daylight < 0.5;
  for (let i = 0, o = 0; i < w.N; i++, o += 4) {
    const m = mat[i];
    const g = ground[i];
    const v = hv[i] - 128;
    let r, gg, b, cls = 0, er = 0, eg = 0, eb = 0;
    let rh = height[i];
    const x = i % W;
    const y = (i - x) / W;
    {
      // the floor (always: water shows it through, low things sit on it)
      const k = (v * M.vary[g]) >> 7;
      r = M.r[g] + k; gg = M.g[g] + k; b = M.b[g] + k;
      const p = M.pattern[g];
      if (p === 1 && y % 3 === 0) { r -= 14; gg -= 14; b -= 14; }
      if (M.flag.road[g] && ((x + (y >> 1)) % 3 === 0 || y % 2 === 0) && hv[i] > 200) { r -= 18; gg -= 18; b -= 18; }
      if (M.emit[g]) { er = M.er[g] * 255; eg = M.eg[g] * 255; eb = M.eb[g] * 255; }
      if (flag[i] & WET) { r *= 0.8; gg *= 0.82; b *= 0.88; }
    }
    if (m !== 0) {
      if (M.liquid[m]) {
        const a = life[i];
        const k = (v * M.vary[m]) >> 8;
        const depth = Math.min(1, a / 40);
        if (m === ID.water || m === ID.holy) {
          // shallow water shows the floor, deep water goes dark
          const d = 0.6 + depth * 0.4;
          r = r * (1 - d) + (M.r[m] * (1.15 - depth * 0.6)) * d + k;
          gg = gg * (1 - d) + (M.g[m] * (1.15 - depth * 0.45)) * d + k;
          b = b * (1 - d) + (M.b[m] * (1.1 - depth * 0.25)) * d + k;
          cls = CLS.water;
          if (flag[i] & CHARGED) { r = 190; gg = 240; b = 255; cls = CLS.charged; er = 80; eg = 160; eb = 255; }
        } else if (m === ID.lava) {
          const fl = ((hv[(i + fr * 7) % w.N] >> 3) + (fr >> 1)) & 31;
          r = 255; gg = 40 + (v >> 2) + fl * 2 + Math.min(40, a >> 1); b = 8 + (fl >> 1);
          if (fl > 27) { gg += 70; b += 30; }   // hot flecks
          cls = CLS.hot;
        } else {
          r = M.r[m] + k; gg = M.g[m] + k; b = M.b[m] + k;
          cls = m === ID.oil ? CLS.shiny : CLS.water;
        }
        if (M.emit[m]) { er += M.er[m] * 255; eg += M.eg[m] * 255; eb += M.eb[m] * 255; }
        rh = height[i] + Math.min(4, a >> 3);
      } else if (!(M.flyOver[m] && !M.tree[m] && m !== ID.fire) || M.flag.flame[m]) {
        const k = (v * M.vary[m]) >> 7;
        r = M.r[m] + k; gg = M.g[m] + k; b = M.b[m] + k;
        if (M.tree[m]) {
          // canopy: 2x2 clumps, each lit top-left and shaded bottom-right, so a wood reads as trees
          const c = hash2(x >> 1, y >> 1) - 128;
          r += c >> 4; gg += c >> 3; b += c >> 4;
          const lx = x & 1, ly = y & 1;
          if (!lx && !ly) { r += 18; gg += 24; b += 10; } else if (lx && ly) { r -= 16; gg -= 18; b -= 10; }
          cls = CLS.leaf;
          rh += 6 + (hv[i] & 3);
        } else if (M.built[m]) {
          const p = M.pattern[m];
          if (p === 2 && ((y % 3 === 0) || ((x + (y / 3 | 0) * 2) % 4 === 0))) { r -= 22; gg -= 22; b -= 22; }
          if (p === 1 && (M.roof[m] ? (x + y) % 3 === 0 : y % 2 === 0)) { r -= 16; gg -= 16; b -= 16; }
          rh += M.roof[m] ? 8 : 6;
        } else if (M.solid[m]) {
          rh += m === ID.boulder ? 4 : 5;
          if (M.shiny[m]) cls = CLS.shiny;
          // a lit window: cottages glow warm at night
          if (m === ID.glass && (flag[i] & 4) && night) { r = 255; gg = 210; b = 120; er += 230; eg += 150; eb += 60; cls = CLS.glow; }
        } else if (m === ID.crop) {
          const ripe = life[i] / 255;
          r = 90 + ripe * 130 + (k >> 1); gg = 150 + ripe * 40 + (k >> 1); b = 50;
          if ((x + y) % 2) { r -= 15; gg -= 15; }
          rh += 1;
        } else if (m === ID.fire) {
          r = M.r[g]; gg = M.g[g]; b = M.b[g];
        } else {
          rh += 1;
        }
        if (M.emit[m]) {
          let s = 1;
          if (m === ID.mushroom) s = night ? 1 : 0.4;
          er += M.er[m] * 255 * s; eg += M.eg[m] * 255 * s; eb += M.eb[m] * 255 * s;
          if (m === ID.frostfire || m === ID.void) cls = CLS.glow;
        }
      } else {
        // low things on the floor: tall grass, flowers, seeds, rubble, bones...
        const k = (v * M.vary[m]) >> 7;
        if (M.flag.confetti[m]) {
          const pick = hv[i] % 5;
          const pal = [[235, 90, 160], [250, 210, 70], [150, 120, 250], [255, 255, 255], [255, 120, 80]][pick];
          if ((hv[i] & 3) === 0) { r = pal[0]; gg = pal[1]; b = pal[2]; } else { r = r * 0.7 + M.r[m] * 0.15; gg = gg * 0.9 + 20; b = b * 0.7; }
        } else if (m === ID.tallgrass) {
          const s = (hv[i] & 1) ? 1 : 0.8;
          r = (M.r[m] + k) * s; gg = (M.g[m] + k) * s; b = (M.b[m] + k) * s; cls = CLS.leaf; rh += 1;
        } else {
          r = M.r[m] + k; gg = M.g[m] + k; b = M.b[m] + k;
          if (M.emit[m]) { er += M.er[m] * 255; eg += M.eg[m] * 255; eb += M.eb[m] * 255; }
          if (m === ID.crust) { const glow = life[i] / 255; r += glow * 120; gg += glow * 30; cls = CLS.hot; er *= glow * 1.5; eg *= glow * 1.5; eb *= glow; }
          if (m === ID.frostfire) cls = CLS.glow;
          rh += M.hard[m] > 30 ? 2 : 0;
        }
      }
    }
    // edges: tall things get a lit top edge and a dark lower edge (eaves, canopy shade), so a
    // roof or a wood reads as a raised shape and not a flat patch of colour
    if (m !== 0 && (M.built[m] || M.tree[m] || M.solid[m])) {
      const up = y > 0 ? mat[i - W] : 0, dn = y < H - 1 ? mat[i + W] : 0;
      const tall = (q) => q !== 0 && (M.built[q] || M.tree[q] || M.solid[q]);
      if (!tall(up)) { r += 26; gg += 24; b += 20; }
      else if (!tall(dn)) { r *= 0.62; gg *= 0.62; b *= 0.66; }
      if (M.roof[m] && y > 0 && M.roof[up] && !M.roof[mat[i - 2 * W]] && y > 1) { r += 12; gg += 10; b += 8; }
      const lf = x > 0 ? mat[i - 1] : 0, rt = x < W - 1 ? mat[i + 1] : 0;
      if (!tall(lf)) { r *= 0.85; gg *= 0.85; b *= 0.85; }
      if (!tall(rt)) { r += 8; gg += 8; b += 6; }
    }
    // heat glow
    const t = temp[i];
    if (flag[i] & BURN) {
      const fl = hash2(x + fr, y - fr * 3) ;
      const hot = fl > 170 ? 2 : fl > 80 ? 1 : 0;
      if (hot === 2) { r = 255; gg = 230; b = 120; } else if (hot === 1) { r = 255; gg = 140; b = 30; } else { r = 220; gg = 60; b = 20; }
      if (M.tree[m]) rh += 2;
      er += 255; eg += 120 + (fl >> 2); eb += 30;
      cls = CLS.hot;
    } else if (t > 110) {
      const h = (t - 110) / 145;
      r += h * 200; gg += h * 50; b -= h * 20;
      er += h * 255; eg += h * 70; eb += h * 10;
    } else if (t < 20) {
      const c = (20 - t) / 20;
      r = r * (1 - c * 0.4) + 200 * c * 0.4; gg = gg * (1 - c * 0.3) + 235 * c * 0.3; b = b * (1 - c * 0.2) + 255 * c * 0.4;
    }
    if (er + eg + eb > 180) {
      // a lava sea counts for little each cell, or a flood becomes a sun
      const k = (((y >> 3) * BW) + (x >> 3)) * 6, e = (er + eg + eb) * (cls === CLS.hot && M.liquid[m] ? 0.12 : 1);
      const q = e / (er + eg + eb); lb[k] += er * q; lb[k + 1] += eg * q; lb[k + 2] += eb * q; lb[k + 3] += x * e; lb[k + 4] += y * e; lb[k + 5] += e;
    }
    color[o] = clamp(r); color[o + 1] = clamp(gg); color[o + 2] = clamp(b); color[o + 3] = cls * 40;
    emit[o] = clamp(er * 0.25); emit[o + 1] = clamp(eg * 0.25); emit[o + 2] = clamp(eb * 0.25); emit[o + 3] = 255;
    relief[i] = rh > 255 ? 255 : rh;
  }
  // the brightest buckets become point lights (colour = what glows there)
  const pts = f.pointLights || (f.pointLights = []);
  pts.length = 0;
  for (let k = 0; k < BW * BH; k++) {
    const e = lb[k * 6 + 5];
    if (e < 900) continue;
    if (pts.length < 20) pts.push(k);
    else { let mi = 0; for (let q = 1; q < pts.length; q++) if (lb[pts[q] * 6 + 5] < lb[pts[mi] * 6 + 5]) mi = q; if (lb[pts[mi] * 6 + 5] < e) pts[mi] = k; }
  }
  for (let q = 0; q < pts.length; q++) {
    const k = pts[q] * 6, e = lb[k + 5];
    const m = Math.max(lb[k], lb[k + 1], lb[k + 2]) || 1;
    pts[q] = { x: lb[k + 3] / e + 0.5, y: lb[k + 4] / e + 0.5, r: 255 * lb[k] / m, g: 255 * lb[k + 1] / m, b: 255 * lb[k + 2] / m, rad: 9 + Math.min(16, Math.sqrt(e) / 9), ttl: 1, max: 1, power: Math.min(0.9, 0.25 + e / 10000) };
  }
  // gas: blend over the cells
  if (w.gasTotal) {
    const GW = w.GW;
    for (let gy = 0; gy < w.GH; gy++) for (let gx = 0; gx < GW; gx++) {
      const j = gy * GW + gx;
      const d = w.gasDens[j];
      if (d < 4) continue;
      const L = GAS_LOOK[w.gasKind[j]];
      const a = Math.min(0.85, (d / 255) * L[3] * 1.6);
      for (let oy = 0; oy < 2; oy++) for (let ox = 0; ox < 2; ox++) {
        const x = gx * 2 + ox, y = gy * 2 + oy;
        if (x >= W || y >= H) continue;
        const o = (y * W + x) * 4;
        const aa = a * (0.85 + (hv[y * W + x] & 31) / 160);
        color[o] = color[o] * (1 - aa) + L[0] * aa;
        color[o + 1] = color[o + 1] * (1 - aa) + L[1] * aa;
        color[o + 2] = color[o + 2] * (1 - aa) + L[2] * aa;
        if (L[4]) { emit[o] = clamp(emit[o] + L[0] * aa * L[4] * 0.5); emit[o + 1] = clamp(emit[o + 1] + L[1] * aa * L[4] * 0.5); emit[o + 2] = clamp(emit[o + 2] + L[2] * aa * L[4] * 0.5); }
      }
    }
  }
  // creatures and anything else the game draws into the world
  if (extra.draw) extra.draw(f.drawApi ||= makeDrawApi(f, w));
  // particles
  for (let k = 0; k < ps.n; k++) {
    const px = ps.x[k] | 0;
    const z = ps.z[k];
    const py = (ps.y[k] - z * 0.7) | 0;
    if (z > 1.5) {
      const sx = px, sy = ps.y[k] | 0;
      if (sx >= 0 && sy >= 0 && sx < W && sy < H) { const o = (sy * W + sx) * 4; color[o] *= 0.7; color[o + 1] *= 0.7; color[o + 2] *= 0.7; }
    }
    if (px < 0 || py < 0 || px >= W || py >= H) continue;
    const o = (py * W + px) * 4;
    const fade = Math.min(1, ps.life[k] / (ps.max[k] * 0.3 + 1));
    color[o] = clamp(color[o] * (1 - fade) + ps.r[k] * fade);
    color[o + 1] = clamp(color[o + 1] * (1 - fade) + ps.g[k] * fade);
    color[o + 2] = clamp(color[o + 2] * (1 - fade) + ps.b[k] * fade);
    const gl = ps.glow[k] * fade;
    if (gl > 0) {
      emit[o] = clamp(emit[o] + ps.r[k] * gl * 0.4); emit[o + 1] = clamp(emit[o + 1] + ps.g[k] * gl * 0.4); emit[o + 2] = clamp(emit[o + 2] + ps.b[k] * gl * 0.4);
      color[o + 3] = CLS.glow * 40;
    }
  }
  // lightning bolts
  if (w.bolts) for (const bolt of w.bolts) {
    const a = bolt.ttl / 8;
    for (let s = 1; s < bolt.pts.length; s++) {
      const p0 = bolt.pts[s - 1], p1 = bolt.pts[s];
      line([p0[0] - 1, p0[1]], [p1[0] - 1, p1[1]], bolt.color, a * 0.6, true);
      line([p0[0] + 1, p0[1]], [p1[0] + 1, p1[1]], bolt.color, a * 0.6, true);
      line(p0, p1, bolt.color, a);
      // a fork now and then
      if ((s * 7 + bolt.pts.length) % 4 === 0 && s < bolt.pts.length - 2) line(p1, [p1[0] + ((s & 1) ? 6 : -6), p1[1] + 5], bolt.color, a * 0.7);
    }
  }
  // rain clouds throw a soft shadow on the land under them
  for (const c of w.rain) {
    const r = c.r * 1.1, r2 = r * r;
    for (let y = Math.max(0, (c.y - r) | 0); y < Math.min(H, c.y + r); y++) for (let x = Math.max(0, (c.x - r) | 0); x < Math.min(W, c.x + r); x++) {
      const d2 = (x - c.x) ** 2 + (y - c.y) ** 2;
      if (d2 > r2) continue;
      const o = (y * W + x) * 4, k = 1 - 0.32 * (1 - d2 / r2) * (c.storm ? 1.3 : 1);
      color[o] *= k; color[o + 1] *= k; color[o + 2] *= k * 1.05;
    }
  }
  function line(p0, p1, c, a, edge) {
    const n = Math.ceil(Math.max(Math.abs(p1[0] - p0[0]), Math.abs(p1[1] - p0[1])));
    for (let s = 0; s <= n; s++) {
      const x = (p0[0] + (p1[0] - p0[0]) * s / n) | 0, y = (p0[1] + (p1[1] - p0[1]) * s / n) | 0;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const o = (y * W + x) * 4;
      if (edge) { color[o] = c[0]; color[o + 1] = c[1]; color[o + 2] = c[2]; } else { color[o] = 255; color[o + 1] = 255; color[o + 2] = 255; }
      color[o + 3] = CLS.glow * 40;
      emit[o] = clamp(emit[o] + c[0] * a * 0.5); emit[o + 1] = clamp(emit[o + 1] + c[1] * a * 0.5); emit[o + 2] = clamp(emit[o + 2] + c[2] * a * 0.5);
    }
  }
}

// What extra.draw gets: put pixels into the frame.
export function makeDrawApi(f, w) {
  const W = w.W, H = w.H;
  return {
    /** Put a pixel. rgb 0-255; glow 0-1 adds light; shadow darkens instead of painting. */
    px(x, y, r, g, b, glow = 0) {
      x |= 0; y |= 0;
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const o = (y * W + x) * 4;
      f.color[o] = r; f.color[o + 1] = g; f.color[o + 2] = b; f.color[o + 3] = glow > 0 ? CLS.glow * 40 : 0;
      if (glow > 0) { f.emit[o] = clamp(f.emit[o] + r * glow * 0.5); f.emit[o + 1] = clamp(f.emit[o + 1] + g * glow * 0.5); f.emit[o + 2] = clamp(f.emit[o + 2] + b * glow * 0.5); }
    },
    shade(x, y, k) {
      x |= 0; y |= 0;
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const o = (y * W + x) * 4;
      f.color[o] *= k; f.color[o + 1] *= k; f.color[o + 2] *= k;
    },
    glow(x, y, r, g, b) {
      x |= 0; y |= 0;
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const o = (y * W + x) * 4;
      f.emit[o] = clamp(f.emit[o] + r * 0.5); f.emit[o + 1] = clamp(f.emit[o + 1] + g * 0.5); f.emit[o + 2] = clamp(f.emit[o + 2] + b * 0.5);
    },
    lift(x, y, h) { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= W || y >= H) return; const i = y * W + x; f.relief[i] = Math.min(255, f.relief[i] + h); },
  };
}
