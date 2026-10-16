// Graphics pass 2026-10-16 (G-PROPS) — paints the surface layers (js/client/surface-plan.js LAYERS) as pixels. Pure (no
// three, no DOM, no canvas): plain maths on a Uint8Array, so it runs the same in a test, a worker or the page, and the
// same seed always paints the same picture.
//
// Every layer TILES (the noise is periodic, the boards / blocks / tiles wrap at the edge). Each pixel is RGBA:
//   RGB = an albedo MULTIPLIER around mid grey (128 = x1.0; the shader does rgb * 2), slightly tinted (rust, moss, soot)
//   A   = height (0 = deep: a seam, mortar, a gap; 255 = the proud face) for the relief and the crease shading
// so a wall keeps the colour the town gave it and only gains grain, seams and wear.
//
//   paintLayers(px) -> Uint8Array(LAYER_COUNT * px * px * 4)      layer i starts at i * px * px * 4

import { LAYERS } from './surface-plan.js';

function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (s + 0x6d2b79f5) >>> 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const smooth = t => t * t * (3 - 2 * t);
const fract = v => v - Math.floor(v);

/** Periodic value noise: lattice of `p` cells across one tile (so it wraps), u, v in tile units. */
function makeNoise(seed) {
  const T = new Float32Array(4096); const r = rng(seed); for (let i = 0; i < T.length; i++) T[i] = r();
  const at = (x, y, p) => T[(((x % p) + p) % p) * 61 + (((y % p) + p) % p) * 7 + p * 13 & 4095];
  return (u, v, p) => {
    const x = u * p, y = v * p, x0 = Math.floor(x), y0 = Math.floor(y), fx = smooth(x - x0), fy = smooth(y - y0);
    const a = at(x0, y0, p), b = at(x0 + 1, y0, p), c = at(x0, y0 + 1, p), d = at(x0 + 1, y0 + 1, p);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}
function fbm(n, u, v, p, oct = 3) { let s = 0, a = 0.5, t = 0; for (let o = 0; o < oct; o++) { s += n(u, v, p << o) * a; t += a; a *= 0.5; } return s / t; }

/**
 * One layer's pixel function: (u, v) in [0, 1) -> [m, tintR, tintG, tintB, h] where m is the brightness multiplier
 * (1 = unchanged), tint a small colour shift added to the multiplier per channel, h the height 0..1.
 */
function layerFn(id, seed) {
  const n = makeNoise(seed), r = rng(seed * 7 + 3);
  switch (id) {
    case 'planks': {
      const rows = 7, joints = [];
      for (let i = 0; i < rows; i++) joints.push({ a: r(), b: r() < 0.6 ? fract(r()) : null, tone: 0.86 + r() * 0.28, k: r() });
      return (u, v) => {
        const row = Math.floor(v * rows), t = v * rows - row, J = joints[row];
        const du = Math.min(Math.abs(fract(u - J.a + 0.5) - 0.5), J.b == null ? 1 : Math.abs(fract(u - J.b + 0.5) - 0.5));
        const seam = Math.min(t, 1 - t) * 2;                                   // 0 at the board edge
        const grain = fbm(n, u, v * 0.25 + row * 0.13, 6, 2) * 0.6 + n(u * 1, v * 14 + J.k * 9, 22) * 0.4;
        const ring = 0.5 + 0.5 * Math.sin((v * rows * 3.2 + grain * 5 + J.k * 6) * Math.PI);
        let m = J.tone * (0.84 + grain * 0.22 + ring * 0.07);
        let h = 0.75 + grain * 0.2;
        if (seam < 0.12) { m *= 0.45 + seam * 3.5; h = seam * 3; }
        if (du * 512 < 2.2) { m *= 0.55; h = 0.15; }                            // butt joint
        const nail = Math.hypot((du - 0.012) * 7, (t - 0.5) * 1.1) < 0.1 && du < 0.03 ? 1 : 0;
        if (nail) { m *= 0.55; h = 0.95; }
        return [m, 0.02, 0, -0.02, h];
      };
    }
    case 'logs': {
      const rows = 5; const tones = Array.from({ length: rows }, () => 0.85 + r() * 0.3);
      return (u, v) => {
        const row = Math.floor(v * rows), t = v * rows - row, x = t * 2 - 1;
        const round = Math.sqrt(clamp(1 - x * x));
        const bark = fbm(n, u * 1, v * 3, 8, 3), streak = n(u * 0.5, v * 12, 24);
        let m = tones[row] * (0.55 + round * 0.45) * (0.82 + bark * 0.25 + streak * 0.1);
        let h = round * (0.75 + bark * 0.25);
        if (round < 0.25) { m *= 0.6; }
        return [m, 0.02, 0.005, -0.02, h];
      };
    }
    case 'ashlar': case 'brick': {
      const brick = id === 'brick';
      const rows = brick ? 10 : 5, mortar = brick ? 0.09 : 0.06;
      const rowsOf = Array.from({ length: rows }, (_, i) => { const cuts = [0]; let x = brick ? (i % 2) * 0.125 : r() * 0.3; const w = () => (brick ? 0.25 : 0.24 + r() * 0.2); const list = []; let s = x; while (s < x + 1 - 0.12) { list.push(s); s += w(); } return { starts: list.map(fract).sort((a, b) => a - b), tones: list.map(() => 0.82 + r() * 0.34), moss: list.map(() => r()) }; });
      return (u, v) => {
        const row = Math.floor(v * rows), t = v * rows - row, R = rowsOf[row];
        let k = R.starts.length - 1; for (let i = 0; i < R.starts.length; i++) if (u >= R.starts[i]) k = i;
        const s0 = R.starts[k], s1 = k + 1 < R.starts.length ? R.starts[k + 1] : R.starts[0] + 1;
        const uu = u < s0 ? u + 1 : u, along = (uu - s0) / (s1 - s0);
        const ex = Math.min(along, 1 - along) * (s1 - s0) * rows, ey = Math.min(t, 1 - t);
        const edge = Math.min(ex, ey);
        const rough = fbm(n, u, v, brick ? 16 : 10, 3);
        const chip = edge - rough * (brick ? 0.05 : 0.09);
        if (chip < mortar) return [0.62 + rough * 0.2, 0, 0, 0, 0.1 + rough * 0.1];
        let m = R.tones[k] * (0.82 + rough * 0.3) * (0.9 + clamp(chip * 3) * 0.1);
        const moss = !brick && R.moss[k] > 0.8 && t < 0.35 ? (0.35 - t) * 0.5 : 0;
        return [m, -moss * 0.25, moss * 0.2, -moss * 0.3, 0.65 + clamp(chip * 4) * 0.25 + rough * 0.1];
      };
    }
    case 'rubble': {
      const pts = Array.from({ length: 26 }, () => ({ x: r(), y: r() * 1, tone: 0.78 + r() * 0.36, moss: r() }));
      return (u, v) => {
        let d1 = 9, d2 = 9, best = null;
        for (const p of pts) for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
          const dx = u - p.x - ox, dy = (v - p.y - oy) * 1.35, d = dx * dx + dy * dy;
          if (d < d1) { d2 = d1; d1 = d; best = p; } else if (d < d2) d2 = d;
        }
        const edge = Math.sqrt(d2) - Math.sqrt(d1), rough = fbm(n, u, v, 12, 3);
        if (edge < 0.022 + rough * 0.02) return [0.55 + rough * 0.15, 0, 0, 0, 0.08];
        const dome = clamp(edge * 6);
        const moss = best.moss > 0.85 ? 0.22 * rough : 0;
        return [best.tone * (0.78 + rough * 0.3) * (0.85 + dome * 0.15), -moss * 0.3, moss * 0.25, -moss * 0.35, 0.45 + dome * 0.45 + rough * 0.1];
      };
    }
    case 'plaster': {
      const cracks = Array.from({ length: 5 }, () => { const pts = []; let x = r(), y = r(), a = r() * Math.PI * 2; for (let i = 0; i < 40; i++) { pts.push([x, y]); a += (r() - 0.5) * 0.7; x += Math.cos(a) * 0.005; y += Math.sin(a) * 0.005; } return pts; });
      return (u, v) => {
        const blot = fbm(n, u, v, 3, 3), fine = n(u, v, 48);
        let m = 0.9 + blot * 0.16 + fine * 0.05, h = 0.7 + blot * 0.2 + fine * 0.1;
        // patches where the limewash has fallen off show the wattle / stone beneath
        const patch = fbm(n, u + 0.37, v + 0.11, 5, 2);
        if (patch > 0.7) { const k = clamp((patch - 0.7) * 5); m *= 1 - 0.1 * k; h -= 0.2 * k; }
        let cd = 1; for (const c of cracks) for (const [x, y] of c) { const dx = Math.abs(fract(u - x + 0.5) - 0.5), dy = Math.abs(fract(v - y + 0.5) - 0.5); cd = Math.min(cd, dx * dx + dy * dy); }
        if (cd < 0.000008) { m *= 0.62; h = 0.2; }
        return [m, 0.015, 0.01, -0.01, h];
      };
    }
    case 'thatch': {
      const courses = 4;
      return (u, v) => {
        const c = Math.floor(v * courses), t = v * courses - c;
        const strand = n(u, v * 0.12 + c * 0.31, 64) * 0.6 + n(u, v * 0.2, 128) * 0.4;
        const lump = fbm(n, u, v, 4, 2);
        let m = (0.72 + strand * 0.42) * (0.62 + t * 0.48) * (0.9 + lump * 0.2);
        const h = clamp(t * 0.8 + strand * 0.25);
        const soot = (1 - t) * 0.04;
        return [m, 0.02 - soot, 0.01 - soot, -0.03 - soot, h];
      };
    }
    case 'tile': {
      const rows = 6, per = 7;
      const tones = Array.from({ length: rows * per }, () => 0.84 + r() * 0.3);
      return (u, v) => {
        const row = Math.floor(v * rows), t = v * rows - row;
        const uu = u * per + (row % 2) * 0.5, col = Math.floor(uu), x = uu - col;
        const curve = Math.sin(x * Math.PI);                                   // the barrel of a tile across its width
        const lap = t;                                                         // 0 at the lower lip, 1 where the row above covers it
        const rough = fbm(n, u, v, 12, 2);
        let m = tones[((col % per) + per) % per + row * per] * (0.6 + curve * 0.4) * (0.68 + clamp(1 - lap) * 0.0 + lap * 0.34) * (0.9 + rough * 0.18);
        if (t > 0.92) m *= 0.55;                                               // the shadow under the row above
        const lichen = rough > 0.74 ? (rough - 0.74) * 1.2 : 0;
        return [m, -lichen * 0.2, lichen * 0.5, -lichen * 0.4, clamp(curve * 0.55 + (1 - t) * 0.35 + rough * 0.1)];
      };
    }
    case 'shingle': {
      const rows = 8, per = 6;
      const cells = Array.from({ length: rows * per }, () => ({ tone: 0.8 + r() * 0.36, cut: r() * 0.18 }));
      return (u, v) => {
        const row = Math.floor(v * rows), t = v * rows - row;
        const uu = u * per + (row % 2) * 0.5, col = Math.floor(uu), x = uu - col;
        const C = cells[((col % per) + per) % per + row * per];
        const rough = n(u * 1, v * 0.5, 40) * 0.6 + fbm(n, u, v, 10, 2) * 0.4;
        let m = C.tone * (0.62 + t * 0.4) * (0.9 + rough * 0.2), h = clamp(0.3 + t * 0.6 + rough * 0.1);
        if (x < 0.035 || x > 0.965) { m *= 0.5; h = 0.1; }
        if (t < C.cut * 0.25) { m *= 0.55; h = 0.05; }
        return [m, 0, 0, 0.01, h];
      };
    }
    case 'metal': {
      return (u, v) => {
        const dent = fbm(n, u, v, 8, 3), streak = n(u * 1, v * 0.15, 32);
        const rust = clamp((fbm(n, u + 0.5, v + 0.2, 4, 3) - 0.58) * 4);
        let m = 0.86 + dent * 0.2 + streak * 0.08, h = 0.6 + dent * 0.3;
        // no rivets or seams: the same colour is iron on a lamp and basalt on a Vharlen prop, so keep it to dents and rust
        return [m * (1 - rust * 0.12), rust * 0.14, rust * 0.02, -rust * 0.1, h - rust * 0.1];
      };
    }
    case 'cloth': {
      return (u, v) => {
        const N = 48, wx = Math.sin(u * N * Math.PI * 2), wy = Math.sin(v * N * Math.PI * 2);
        const weave = 0.5 + 0.25 * (Math.sign(wx * wy) * Math.min(Math.abs(wx), Math.abs(wy)));
        const fold = fbm(n, u, v * 0.5, 3, 2), stain = clamp((fbm(n, u + 0.3, v, 5, 2) - 0.66) * 4);
        const m = (0.82 + weave * 0.18 + fold * 0.14) * (1 - stain * 0.14);
        return [m, stain * 0.02, stain * 0.01, -stain * 0.03, clamp(weave * 0.4 + fold * 0.6)];
      };
    }
    case 'rope': {
      return (u, v) => {
        const twist = fract(u * 3 + v * 1);                                   // three strands wound along u
        const prof = Math.sin(twist * Math.PI), fib = n(u * 1, v * 1, 96);
        const m = (0.62 + prof * 0.45) * (0.88 + fib * 0.18);
        return [m, 0.015, 0.005, -0.02, clamp(prof * 0.85 + fib * 0.15)];
      };
    }
    default: return () => [1, 0, 0, 0, 0.5];
  }
}

/** Paint every layer at px x px. Returns RGBA bytes, layer after layer. */
export function paintLayers(px, { seed = 20261016 } = {}) {
  const per = px * px * 4, out = new Uint8Array(LAYERS.length * per);
  LAYERS.forEach((L, li) => paintLayer(out, px, li, seed));
  return out;
}
/**
 * Paint ONE layer into `out` (so the page can spread the work over idle frames). Each layer is then scaled so its mean
 * multiplier is ~0.97: the detail adds grain and seams but never darkens or brightens a town's palette as a whole.
 */
export function paintLayer(out, px, li, seed = 20261016) {
  const per = px * px * 4, f = layerFn(LAYERS[li].id, seed + li * 977), base = li * per;
  const tmp = new Float32Array(px * px * 4);
  let sum = 0;
  for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) {
    // v runs UP the surface (row 0 of the array is the bottom: texture coordinates start at the bottom)
    const [m, tr, tg, tb, h] = f((x + 0.5) / px, (y + 0.5) / px);
    const o = (y * px + x) * 4;
    tmp[o] = m + tr; tmp[o + 1] = m + tg; tmp[o + 2] = m + tb; tmp[o + 3] = h;
    sum += m;
  }
  const k = 0.97 / Math.max(0.2, sum / (px * px));
  for (let i = 0; i < px * px; i++) {
    const o = i * 4;
    out[base + o] = clamp(tmp[o] * k * 128, 0, 255) | 0;
    out[base + o + 1] = clamp(tmp[o + 1] * k * 128, 0, 255) | 0;
    out[base + o + 2] = clamp(tmp[o + 2] * k * 128, 0, 255) | 0;
    out[base + o + 3] = clamp(tmp[o + 3] * 255, 0, 255) | 0;
  }
  return out;
}
/** Mean multiplier of one layer (tests: a layer must not darken or brighten the town's palette as a whole). */
export function layerMean(bytes, px, li) {
  const per = px * px * 4, base = li * per; let s = 0;
  for (let i = 0; i < px * px; i++) s += (bytes[base + i * 4] + bytes[base + i * 4 + 1] + bytes[base + i * 4 + 2]) / 3;
  return s / (px * px) / 128;
}
