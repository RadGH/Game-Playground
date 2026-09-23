/**
 * highdef-3d / kit / textures.js
 *
 * Every surface, sprite atlas and helper texture in the forest world comes out of this one
 * module. Nothing here is loaded from a bitmap: ground and bark surfaces are painted onto
 * canvases in layers at load time, the leaves and grass are our own SVG files rasterised
 * into atlases, and the water / cloud / noise / ramp helpers are generated maths.
 *
 * How a surface is built (makeSurface):
 *
 *   1. Two canvases are painted AT THE SAME TIME: a colour canvas, and a greyscale height
 *      canvas where mid-grey is flat, lighter is raised and darker is sunk. Every layer
 *      (base mottling, strokes, blobs, cracks, stones...) draws into both, so the bumps
 *      always line up with the colour. A normal map guessed separately never lines up.
 *   2. Everything is drawn "wrap-around": a mark that crosses the right edge is drawn again
 *      on the left, and so on, so the result tiles with no seam.
 *   3. When the painting is done the height canvas is read back and turned into a normal
 *      map (Sobel filter), an ambient-occlusion map (low spots in the neighbourhood get
 *      darker) and a roughness map (each surface has its own rule, e.g. wet mud is smoother
 *      in its low spots, rock is rougher inside cracks).
 *
 * Colour maps are tagged sRGB; normal / roughness / AO are tagged as plain data (linear).
 * Results are cached by name + size + seed + tint so asking twice does not redraw.
 *
 * Coordinates: canvas x goes right, canvas y goes DOWN. Three.js flips a canvas texture
 * vertically on upload (flipY = true), so the top row of the canvas is v = 1. The normal
 * map's green channel is derived with that in mind (see heightToNormal).
 */

import * as THREE from 'three';

/* ==============================================================================================
 * 1. Seeded random numbers
 * ============================================================================================ */

/**
 * Seeded 0..1 random generator (mulberry32). The same seed always gives the same sequence,
 * so a texture is the same every load and a seed in a save file means something.
 * @param {number} seed any number; fractions are truncated
 * @returns {() => number} a function returning a fresh 0..1 value each call
 */
export function makeRng(seed) {
  let s = (Math.floor(Number(seed) || 0) * 0x9E3779B1) >>> 0;
  return function rng() {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random number in a range. `range` may be a [min, max] pair or a single fixed number. */
function between(rng, range) {
  if (typeof range === 'number') return range;
  return range[0] + (range[1] - range[0]) * rng();
}

/** One random entry of a list. */
function pick(rng, list) {
  return list[Math.floor(rng() * list.length) % list.length];
}

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a, b, t) => a + (b - a) * t;
/** Smooth 0..1 curve (ease in and out), used for noise interpolation and soft thresholds. */
const smooth = (t) => t * t * (3 - 2 * t);
const smoothstep = (a, b, x) => smooth(clamp01((x - a) / (b - a)));
const TAU = Math.PI * 2;

/* ==============================================================================================
 * 2. Colour helpers
 * ============================================================================================ */

/** '#rrggbb' -> [r, g, b] (0..255). Also accepts a THREE.Color or [r,g,b] and passes it on. */
function toRgb(c) {
  if (Array.isArray(c)) return c;
  if (c && c.isColor) return [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)];
  const n = parseInt(String(c).replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** CSS colour string with an alpha, from a hex colour or [r,g,b]. */
function rgba(c, a) {
  const [r, g, b] = toRgb(c);
  return `rgba(${r},${g},${b},${a})`;
}

/** Mix two colours by t (0 = a, 1 = b). Returns [r,g,b]. */
function mix(a, b, t) {
  const A = toRgb(a), B = toRgb(b);
  return [lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)];
}

/* ==============================================================================================
 * 3. Tileable value noise / fBm
 *
 * Value noise on an integer lattice. Because the lattice wraps at `period` cells, sampling
 * across the whole tile gives a pattern that repeats seamlessly. fBm stacks several octaves
 * (each twice as fine as the last) so the result has both large soft patches and fine
 * detail - this is what the large-scale "patchiness" layers use instead of per-pixel random,
 * which just reads as TV static.
 * ============================================================================================ */

/** Deterministic 0..1 value for an integer lattice point. */
function hash2(ix, iy, seed) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * Smoothly interpolated value noise at (x, y) in lattice units, wrapping every `period` cells
 * (`periodY` may differ, for patterns stretched along one axis such as bark ridges).
 */
function valueNoise(x, y, period, seed, periodY = period) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const sx = smooth(x - x0), sy = smooth(y - y0);
  const ax = ((x0 % period) + period) % period, bx = (ax + 1) % period;
  const ay = ((y0 % periodY) + periodY) % periodY, by = (ay + 1) % periodY;
  const n00 = hash2(ax, ay, seed), n10 = hash2(bx, ay, seed);
  const n01 = hash2(ax, by, seed), n11 = hash2(bx, by, seed);
  return lerp(lerp(n00, n10, sx), lerp(n01, n11, sx), sy);
}

/**
 * Tileable fractal noise. u and v are 0..1 across the tile.
 * @param {object} o  scale = lattice cells across the tile for the first octave (integer),
 *                    octaves, gain (how much quieter each octave is), seed.
 * @returns {number} 0..1, averaging around 0.5
 */
function fbm(u, v, o) {
  const scale = o.scale || 4, octaves = o.octaves || 4, gain = o.gain ?? 0.5, seed = o.seed || 0;
  let amp = 1, sum = 0, norm = 0, period = scale;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(u * period, v * period, period, seed + i * 101);
    norm += amp;
    amp *= gain;
    period *= 2;
  }
  return sum / norm;
}

/**
 * Ridged noise stretched along one axis: `scaleX` creases across the tile, `scaleY` along it.
 * With scaleY much smaller than scaleX the creases run as long vertical ridges - bark.
 * Still tileable: every octave's lattice divides the tile a whole number of times.
 */
function ridgedXY(u, v, scaleX, scaleY, octaves, seed, gain = 0.5) {
  let amp = 1, sum = 0, norm = 0, px = scaleX, py = scaleY;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(valueNoise(u * px, v * py, px, seed + i * 131, py) * 2 - 1);
    sum += amp * n;
    norm += amp;
    amp *= gain;
    px *= 2;
    py *= 2;
  }
  return sum / norm;
}

/** Ridged variant: sharp creases instead of soft hills (good for rock veins, drifts). */
function ridged(u, v, o) {
  const scale = o.scale || 4, octaves = o.octaves || 4, gain = o.gain ?? 0.5, seed = o.seed || 0;
  let amp = 1, sum = 0, norm = 0, period = scale;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(valueNoise(u * period, v * period, period, seed + i * 131) * 2 - 1);
    sum += amp * n * n;
    norm += amp;
    amp *= gain;
    period *= 2;
  }
  return sum / norm;
}

/* ==============================================================================================
 * 4. Canvas plumbing
 * ============================================================================================ */

function makeCanvas(w, h) {
  if (typeof document === 'undefined') {
    throw new Error('textures.js needs a browser: there is no document to make a canvas from.');
  }
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Wrap a canvas in a three.js texture with the settings every map here shares. */
function canvasTexture(canvas, { srgb = false, repeat = 1, anisotropy = 8, wrap = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = wrap ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = anisotropy;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** Put a greyscale Float32Array (0..1) onto a fresh canvas. */
function greyCanvas(values, size) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let i = 0, n = size * size; i < n; i++) {
    const g = Math.round(clamp01(values[i]) * 255);
    d[i * 4] = g;
    d[i * 4 + 1] = g;
    d[i * 4 + 2] = g;
    d[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/* ==============================================================================================
 * 5. The Painter: colour canvas + height canvas drawn together, with wrap-around
 *
 * Height marks: `height` is roughly how far toward fully raised (+1) or fully sunk (-1) a mark
 * pushes the surface. Positive marks paint white with that alpha onto the mid-grey height
 * canvas, negative marks paint black. Because they composite, overlapping bumps add up.
 * ============================================================================================ */

class Painter {
  constructor(size, rng, seed) {
    this.size = size;
    this.rng = rng;
    this.seed = seed;
    this.colour = makeCanvas(size, size);
    this.c = this.colour.getContext('2d');
    this.height = makeCanvas(size, size);
    this.h = this.height.getContext('2d');
    this.h.fillStyle = '#808080';
    this.h.fillRect(0, 0, size, size);
    this.c.lineCap = this.h.lineCap = 'round';
    this.c.lineJoin = this.h.lineJoin = 'round';
  }

  /** Fill style for the height canvas: white for raised, black for sunk, alpha = strength. */
  heightStyle(amount, scale = 1) {
    const a = Math.min(1, Math.abs(amount) * scale);
    return amount >= 0 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
  }

  /** Noise sample across the tile (u, v in 0..1), seeded from this surface's seed. */
  noise(u, v, scale = 4, octaves = 4, salt = 0, gain = 0.5) {
    return fbm(u, v, { scale, octaves, gain, seed: this.seed * 7 + salt });
  }

  /**
   * Per-pixel base layer. `fn(u, v)` returns `{ rgb: [r,g,b], h: 0..1 }`. Every recipe starts
   * with one of these: a soft colour gradient/mottle plus its matching low-frequency height.
   */
  fill(fn) {
    const size = this.size;
    const img = this.c.createImageData(size, size), him = this.h.createImageData(size, size);
    const d = img.data, hd = him.data;
    let i = 0;
    for (let y = 0; y < size; y++) {
      const v = y / size;
      for (let x = 0; x < size; x++, i += 4) {
        const r = fn(x / size, v);
        d[i] = r.rgb[0]; d[i + 1] = r.rgb[1]; d[i + 2] = r.rgb[2]; d[i + 3] = 255;
        const g = Math.round(clamp01(r.h) * 255);
        hd[i] = g; hd[i + 1] = g; hd[i + 2] = g; hd[i + 3] = 255;
      }
    }
    this.c.putImageData(img, 0, 0);
    this.h.putImageData(him, 0, 0);
  }

  /**
   * Call `draw(dx, dy)` once for the mark itself and again for every tile offset the mark
   * spills over into. A mark of radius r centred at (x, y) near the right edge is drawn at
   * (x, y) and at (x - size, y), which is what makes the tile seamless.
   */
  wrap(x, y, r, draw) {
    const s = this.size;
    const xs = [0], ys = [0];
    if (x - r < 0) xs.push(s);
    if (x + r > s) xs.push(-s);
    if (y - r < 0) ys.push(s);
    if (y + r > s) ys.push(-s);
    for (const dx of xs) for (const dy of ys) draw(dx, dy);
  }

  /** A straight line on both canvases, with wrap. */
  line(x1, y1, x2, y2, w, colour, alpha, height) {
    const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
    const r = Math.hypot(x2 - x1, y2 - y1) / 2 + w;
    this.wrap(cx, cy, r, (dx, dy) => {
      this.c.strokeStyle = rgba(colour, alpha);
      this.c.lineWidth = w;
      this.c.beginPath();
      this.c.moveTo(x1 + dx, y1 + dy);
      this.c.lineTo(x2 + dx, y2 + dy);
      this.c.stroke();
      if (height) {
        this.h.strokeStyle = this.heightStyle(height, alpha);
        this.h.lineWidth = w;
        this.h.beginPath();
        this.h.moveTo(x1 + dx, y1 + dy);
        this.h.lineTo(x2 + dx, y2 + dy);
        this.h.stroke();
      }
    });
  }

  /**
   * Many short directional strokes: grass blades, pine needles, straw, wood grain.
   * angle is in radians (0 = to the right, -PI/2 = up); spread is +/- around it.
   * When `taper` is set the last third of each stroke is drawn thinner so it reads as a tip.
   */
  strokes(count, o) {
    const rng = this.rng, s = this.size;
    const len = o.len ?? [6, 16], width = o.width ?? [1, 2];
    const angle = o.angle ?? -Math.PI / 2, spread = o.spread ?? 0.5;
    const colours = o.colours ?? ['#6c8a45'], alpha = o.alpha ?? [0.5, 0.9];
    const height = o.height ?? 0.15, taper = o.taper ?? true;
    for (let i = 0; i < count; i++) {
      const x = rng() * s, y = rng() * s;
      const L = between(rng, len), w = between(rng, width);
      const a = angle + (rng() - 0.5) * 2 * spread;
      const col = pick(rng, colours), al = between(rng, alpha);
      const ca = Math.cos(a), sa = Math.sin(a);
      if (taper) {
        const mx = x + ca * L * 0.62, my = y + sa * L * 0.62;
        this.line(x, y, mx, my, w, col, al, height);
        this.line(mx, my, x + ca * L, y + sa * L, Math.max(0.5, w * 0.5), col, al, height * 0.7);
      } else {
        this.line(x, y, x + ca * L, y + sa * L, w, col, al, height);
      }
    }
  }

  /**
   * Soft elliptical blobs with a radial fade: patches of shade, moss, damp, dry grass.
   * aspect squashes the ellipse, angle turns it. hardness 0 = fades from the centre,
   * 1 = flat disc with a sharp edge.
   */
  blobs(count, o) {
    const rng = this.rng, s = this.size;
    const rr = o.r ?? [8, 24], colours = o.colours ?? ['#3f5530'], alpha = o.alpha ?? [0.3, 0.6];
    const height = o.height ?? -0.1, aspect = o.aspect ?? [0.6, 1], hardness = o.hardness ?? 0.15;
    for (let i = 0; i < count; i++) {
      this.blob(rng() * s, rng() * s, between(rng, rr), pick(rng, colours), between(rng, alpha), {
        height, aspect: between(rng, aspect), angle: rng() * TAU, hardness,
      });
    }
  }

  /** One blob (see blobs). */
  blob(x, y, r, colour, alpha, o = {}) {
    const aspect = o.aspect ?? 1, angle = o.angle ?? 0, hardness = o.hardness ?? 0.15, height = o.height ?? 0;
    const paint = (ctx, inner, outer) => (dx, dy) => {
      ctx.save();
      ctx.translate(x + dx, y + dy);
      ctx.rotate(angle);
      ctx.scale(1, aspect);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, inner);
      g.addColorStop(hardness, inner);
      g.addColorStop(1, outer);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.fill();
      ctx.restore();
    };
    this.wrap(x, y, r, (dx, dy) => {
      paint(this.c, rgba(colour, alpha), rgba(colour, 0))(dx, dy);
      if (height) {
        const hc = height >= 0 ? [255, 255, 255] : [0, 0, 0];
        paint(this.h, rgba(hc, Math.min(1, Math.abs(height) * alpha)), rgba(hc, 0))(dx, dy);
      }
    });
  }

  /** Tiny dots: seed heads, mineral grains, sand, sparkle. */
  specks(count, o) {
    const rng = this.rng, s = this.size;
    const size = o.size ?? [0.6, 1.8], colours = o.colours ?? ['#ffffff'], alpha = o.alpha ?? [0.3, 0.8];
    const height = o.height ?? 0.08;
    for (let i = 0; i < count; i++) {
      const x = rng() * s, y = rng() * s, r = between(rng, size);
      const col = rgba(pick(rng, colours), between(rng, alpha));
      this.wrap(x, y, r, (dx, dy) => {
        this.c.fillStyle = col;
        this.c.beginPath();
        this.c.arc(x + dx, y + dy, r, 0, TAU);
        this.c.fill();
        if (height) {
          this.h.fillStyle = this.heightStyle(height);
          this.h.beginPath();
          this.h.arc(x + dx, y + dy, r, 0, TAU);
          this.h.fill();
        }
      });
    }
  }

  /**
   * A crack: a wandering polyline drawn as a dark tapered line with a lighter highlight along
   * its lower-right lip (light from the top-left), sunk into the height map. `vertical` makes
   * bark fissures (they run up the tile and wrap top to bottom). May branch once.
   */
  crack(x, y, o, _depthLevel = 0) {
    const rng = this.rng;
    const L = between(rng, o.len ?? [40, 160]);
    const w = between(rng, o.width ?? [1, 3]);
    // a fixed angle still gets a little spread so a set of cracks is not perfectly parallel
    let a = o.angle != null ? o.angle + (rng() - 0.5) * 2 * (o.spread ?? 0.2)
      : (o.vertical ? -Math.PI / 2 + (rng() - 0.5) * 0.3 : rng() * TAU);
    const wander = o.wander ?? 0.5, step = o.step ?? 6;
    const pts = [[x, y]];
    const n = Math.max(2, Math.round(L / step));
    for (let i = 0; i < n; i++) {
      a += (rng() - 0.5) * wander;
      if (o.vertical) a = lerp(a, -Math.PI / 2, 0.15); // keep fissures heading up the trunk
      x += Math.cos(a) * step;
      y += Math.sin(a) * step;
      pts.push([x, y]);
    }
    this.polyline(pts, o, w);
    if (_depthLevel === 0 && rng() < (o.branch ?? 0.3)) {
      const [bx, by] = pts[Math.floor(rng() * pts.length)];
      this.crack(bx, by, { ...o, len: L * 0.5, width: w * 0.6, angle: a + (rng() < 0.5 ? 1 : -1) * between(rng, [0.6, 1.2]) }, 1);
    }
  }

  /** Draw a tapered polyline (used by crack): highlight first, then the dark line, then height. */
  polyline(pts, o, w) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [px, py] of pts) {
      if (px < minX) minX = px; if (px > maxX) maxX = px;
      if (py < minY) minY = py; if (py > maxY) maxY = py;
    }
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const r = Math.hypot(maxX - minX, maxY - minY) / 2 + w + 2;
    const colour = o.colour ?? '#2b2926', alpha = o.alpha ?? 0.8;
    const hi = o.highlight ?? '#a09b93', hiAlpha = o.highlightAlpha ?? 0.35;
    const depth = o.depth ?? -0.5;
    const segs = pts.length - 1;
    const widthAt = (i) => Math.max(0.4, w * (1 - (i / segs) * (o.taperTo ?? 0.75)));
    const draw = (ctx, style, dx, dy, ox, oy, mult) => {
      ctx.strokeStyle = style;
      for (let i = 0; i < segs; i++) {
        ctx.lineWidth = widthAt(i) * mult;
        ctx.beginPath();
        ctx.moveTo(pts[i][0] + dx + ox, pts[i][1] + dy + oy);
        ctx.lineTo(pts[i + 1][0] + dx + ox, pts[i + 1][1] + dy + oy);
        ctx.stroke();
      }
    };
    this.wrap(cx, cy, r, (dx, dy) => {
      draw(this.c, rgba(hi, hiAlpha), dx, dy, 1, 1, 1.1);
      draw(this.c, rgba(colour, alpha), dx, dy, 0, 0, 1);
      if (depth) draw(this.h, this.heightStyle(depth), dx, dy, 0, 0, 1.2);
    });
  }

  /** Several cracks at random spots. */
  cracks(count, o) {
    for (let i = 0; i < count; i++) this.crack(this.rng() * this.size, this.rng() * this.size, o);
  }

  /**
   * A rounded stone: a jittered polygon filled with a light-to-dark gradient (lit from the
   * top-left) and a thin dark rim, raised as a dome in the height map.
   */
  stone(x, y, r, o = {}) {
    const rng = this.rng;
    const sides = o.sides ?? 8, jitter = o.jitter ?? 0.25;
    const base = o.colour ?? '#7d786f';
    const light = o.light ?? mix(base, '#ffffff', 0.25), dark = o.dark ?? mix(base, '#000000', 0.35);
    const height = o.height ?? 0.5, alpha = o.alpha ?? 1, rot = o.angle ?? rng() * TAU;
    const pts = [];
    for (let i = 0; i < sides; i++) {
      const ang = rot + (i / sides) * TAU + (rng() - 0.5) * jitter;
      const rad = r * (1 + (rng() - 0.5) * 2 * jitter);
      pts.push([x + Math.cos(ang) * rad, y + Math.sin(ang) * rad * (o.aspect ?? 1)]);
    }
    // sharp = straight edges (a rock facet, a bark slab); default is rounded (a pebble).
    // rim = how dark the outline is; a facet wants almost none or it reads as a lily pad.
    const sharp = o.sharp ?? false, rim = o.rim ?? 0.7;
    this.wrap(x, y, r * 1.5, (dx, dy) => {
      const g = this.c.createLinearGradient(x + dx - r, y + dy - r, x + dx + r, y + dy + r);
      g.addColorStop(0, rgba(light, alpha));
      g.addColorStop(0.5, rgba(base, alpha));
      g.addColorStop(1, rgba(dark, alpha));
      this.c.fillStyle = g;
      tracePoly(this.c, pts, dx, dy, sharp);
      this.c.fill();
      if (rim > 0) {
        this.c.strokeStyle = rgba(dark, rim * alpha);
        this.c.lineWidth = Math.max(0.6, r * 0.08);
        this.c.stroke();
      }
      if (height) {
        const hg = this.h.createRadialGradient(x + dx - r * 0.15, y + dy - r * 0.15, 0, x + dx, y + dy, r * 1.1);
        const hc = height >= 0 ? [255, 255, 255] : [0, 0, 0];
        hg.addColorStop(0, rgba(hc, Math.min(1, Math.abs(height))));
        hg.addColorStop(0.7, rgba(hc, Math.min(1, Math.abs(height)) * (sharp ? 0.85 : 0.6)));
        hg.addColorStop(1, rgba(hc, sharp ? Math.min(1, Math.abs(height)) * 0.6 : 0));
        this.h.fillStyle = hg;
        tracePoly(this.h, pts, dx, dy, sharp);
        this.h.fill();
      }
    });
  }

  /** Many stones at random spots (gravel). */
  stones(count, o) {
    const rng = this.rng, s = this.size;
    for (let i = 0; i < count; i++) {
      this.stone(rng() * s, rng() * s, between(rng, o.r ?? [3, 9]), { ...o, colour: pick(rng, o.colours ?? ['#7d786f']) });
    }
  }

  /** Multiply the colour canvas by a tint (a hex string or THREE.Color). */
  tint(colour) {
    const style = colour && colour.isColor ? colour.getStyle() : String(colour);
    this.c.save();
    this.c.globalCompositeOperation = 'multiply';
    this.c.fillStyle = style;
    this.c.fillRect(0, 0, this.size, this.size);
    this.c.restore();
  }
}

/**
 * Trace a closed polygon. Rounded by default (curves through the edge midpoints, for
 * pebbles); `sharp` joins the corners with straight lines (for facets and slabs).
 */
function tracePoly(ctx, pts, dx, dy, sharp = false) {
  const n = pts.length;
  ctx.beginPath();
  if (sharp) {
    ctx.moveTo(pts[0][0] + dx, pts[0][1] + dy);
    for (let i = 1; i < n; i++) ctx.lineTo(pts[i][0] + dx, pts[i][1] + dy);
    ctx.closePath();
    return;
  }
  let [px, py] = pts[n - 1];
  let [qx, qy] = pts[0];
  ctx.moveTo((px + qx) / 2 + dx, (py + qy) / 2 + dy);
  for (let i = 0; i < n; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[(i + 1) % n];
    ctx.quadraticCurveTo(ax + dx, ay + dy, (ax + bx) / 2 + dx, (ay + by) / 2 + dy);
  }
  ctx.closePath();
}

/* ==============================================================================================
 * 6. Height -> normal, ambient occlusion, roughness
 * ============================================================================================ */

/** Read the height canvas back as a Float32Array of 0..1 values. */
function readHeight(p) {
  const d = p.h.getImageData(0, 0, p.size, p.size).data;
  const out = new Float32Array(p.size * p.size);
  for (let i = 0; i < out.length; i++) out[i] = d[i * 4] / 255;
  return out;
}

/** Wrapping box blur on a square Float32Array, `radius` pixels each side, two passes. */
function blurWrap(src, size, radius) {
  const tmp = new Float32Array(size * size), out = new Float32Array(size * size);
  const win = radius * 2 + 1;
  // horizontal pass, running sum
  for (let y = 0; y < size; y++) {
    const row = y * size;
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += src[row + ((k + size) % size)];
    for (let x = 0; x < size; x++) {
      tmp[row + x] = sum / win;
      sum += src[row + ((x + radius + 1) % size)] - src[row + ((x - radius + size) % size)];
    }
  }
  // vertical pass
  for (let x = 0; x < size; x++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += tmp[((k + size) % size) * size + x];
    for (let y = 0; y < size; y++) {
      out[y * size + x] = sum / win;
      sum += tmp[((y + radius + 1) % size) * size + x] - tmp[((y - radius + size) % size) * size + x];
    }
  }
  return out;
}

/**
 * Sobel filter over the wrapped height field -> tangent-space normal map canvas.
 * Sign convention: three.js flips canvas textures on upload, so the canvas top row is v = 1.
 * A slope that rises toward the TOP of the canvas must therefore lean the normal toward
 * +v (green above 0.5). With dy measured as (rows below - rows above), that is ny = +dy.
 * A slope rising to the right leans the normal toward -u, so nx = -dx.
 * `strength` is scaled with the size so a 1024 texture bumps the same as a 512 one.
 */
function heightToNormal(h, size, strength) {
  const out = new Uint8ClampedArray(size * size * 4);
  const k = strength * size / 128;
  const at = (x, y) => h[((y + size) % size) * size + ((x + size) % size)];
  let i = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++, i += 4) {
      const tl = at(x - 1, y - 1), t = at(x, y - 1), tr = at(x + 1, y - 1);
      const l = at(x - 1, y), r = at(x + 1, y);
      const bl = at(x - 1, y + 1), b = at(x, y + 1), br = at(x + 1, y + 1);
      const dx = (tr + 2 * r + br) - (tl + 2 * l + bl);
      const dy = (bl + 2 * b + br) - (tl + 2 * t + tr);
      let nx = -dx * k, ny = dy * k, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len; nz /= len;
      out[i] = (nx * 0.5 + 0.5) * 255;
      out[i + 1] = (ny * 0.5 + 0.5) * 255;
      out[i + 2] = (nz * 0.5 + 0.5) * 255;
      out[i + 3] = 255;
    }
  }
  const c = makeCanvas(size, size);
  c.getContext('2d').putImageData(new ImageData(out, size, size), 0, 0);
  return c;
}

/**
 * Ambient occlusion from height: a pixel that sits below the average of its neighbourhood is
 * in a crevice and gets darker. A little of the absolute height is mixed in as well so the
 * tops of bumps stay bright. Returns 0..1 values (1 = fully lit).
 */
function heightToAO(h, size, strength) {
  const hb = blurWrap(h, size, Math.max(2, Math.round(size / 40)));
  const out = new Float32Array(size * size);
  for (let i = 0; i < out.length; i++) {
    const occ = Math.max(0, hb[i] - h[i]);
    let ao = 1 - occ * strength * 7;
    ao *= 0.8 + 0.2 * h[i];
    out[i] = Math.max(0.25, Math.min(1, ao));
  }
  return { ao: out, blurred: hb };
}

/* ==============================================================================================
 * 7. Surface recipes
 *
 * Each recipe paints its layers into the Painter and returns:
 *   normal   - normal map strength (1 is a gentle surface, 2-3 is chunky)
 *   ao       - how dark the crevices go
 *   rough    - function ({ h, hb, n, u, v }) -> roughness 0..1
 *              h = height 0..1, hb = blurred height, n = a 0..1 noise sample
 * Colours are kept desaturated and mid-toned on purpose: the renderer grades on top.
 * ============================================================================================ */

/** Shared base layer: two colours mixed by large-scale noise, plus a matching low-frequency height. */
function mottle(p, a, b, o = {}) {
  const scale = o.scale ?? 3, octaves = o.octaves ?? 4, gain = o.gain ?? 0.55;
  const hAmp = o.heightAmp ?? 0.25, hScale = o.hScale ?? scale * 2;
  const c = o.contrast ?? 1, third = o.third ?? null, thirdAmount = o.thirdAmount ?? 0.35;
  p.fill((u, v) => {
    const n = clamp01(0.5 + (p.noise(u, v, scale, octaves, 1, gain) - 0.5) * c);
    let rgb = mix(a, b, n);
    if (third) {
      const n2 = p.noise(u, v, scale * 2, 3, 2);
      rgb = mix(rgb, third, smoothstep(0.55, 0.75, n2) * thirdAmount);
    }
    const hn = p.noise(u, v, hScale, 4, 3);
    return { rgb, h: 0.5 + (hn - 0.5) * hAmp };
  });
}

const RECIPES = {
  /* ------------------------------------------------------------------ grass & meadow */
  grass(p) {
    const s = p.size, k = (s * s) / (512 * 512); // scale counts with area
    mottle(p, '#4e6a35', '#77874a', { scale: 3, heightAmp: 0.2, third: '#3f5a2e', thirdAmount: 0.4 });
    p.blobs(30 * k, { r: [20, 60], colours: ['#8a9450', '#5f7a3c'], alpha: [0.15, 0.3], height: 0.06 });
    p.strokes(5200 * k, { len: [7, 20], width: [0.8, 1.8], angle: -Math.PI / 2, spread: 0.55,
      colours: ['#5e7a3e', '#6c8a45', '#7f944c', '#8d9a52', '#4e6633', '#a3a45b', '#56733a'], alpha: [0.45, 0.85], height: 0.16 });
    p.blobs(40 * k, { r: [10, 28], colours: ['#3d5330', '#465e33'], alpha: [0.25, 0.45], height: -0.12 });
    p.strokes(1600 * k, { len: [10, 24], width: [0.7, 1.3], angle: -Math.PI / 2, spread: 0.7,
      colours: ['#9aa35a', '#7c9048', '#617c3f'], alpha: [0.35, 0.7], height: 0.12 });
    p.specks(700 * k, { size: [0.6, 1.6], colours: ['#b5b06c', '#4a3d2c', '#c2b57a'], alpha: [0.3, 0.7], height: 0.05 });
    return { normal: 0.9, ao: 0.8, rough: ({ n }) => 0.86 + (n - 0.5) * 0.12 };
  },

  meadow(p) {
    const s = p.size, k = (s * s) / (512 * 512);
    mottle(p, '#6a7a40', '#8f9452', { scale: 2, heightAmp: 0.22, third: '#56683a', thirdAmount: 0.45 });
    p.blobs(24 * k, { r: [24, 70], colours: ['#a19b58', '#6d803f'], alpha: [0.15, 0.3], height: 0.05 });
    p.strokes(4200 * k, { len: [10, 28], width: [0.8, 1.6], angle: -Math.PI / 2, spread: 0.7,
      colours: ['#7f8f48', '#93985a', '#a7a35f', '#657a3f', '#b3ab6a', '#586d38'], alpha: [0.4, 0.8], height: 0.15 });
    p.blobs(30 * k, { r: [10, 26], colours: ['#4a5c32'], alpha: [0.25, 0.4], height: -0.1 });
    p.strokes(1200 * k, { len: [14, 32], width: [0.6, 1.1], angle: -Math.PI / 2, spread: 0.9,
      colours: ['#c0b473', '#a8a060'], alpha: [0.3, 0.6], height: 0.1 });
    // small flower heads and seed tufts
    p.specks(220 * k, { size: [1.2, 2.6], colours: ['#cfc8ad', '#c4b25e', '#b79a9a', '#d5d0bc'], alpha: [0.5, 0.85], height: 0.1 });
    p.specks(500 * k, { size: [0.6, 1.4], colours: ['#4a3d2c', '#c2b57a'], alpha: [0.3, 0.6], height: 0.05 });
    return { normal: 0.9, ao: 0.75, rough: ({ n }) => 0.84 + (n - 0.5) * 0.12 };
  },

  forest_floor(p) {
    const s = p.size, k = (s * s) / (512 * 512);
    mottle(p, '#4a3c2d', '#6a5840', { scale: 3, heightAmp: 0.25, third: '#3d3327', thirdAmount: 0.5 });
    // fallen needles in every direction
    p.strokes(3600 * k, { len: [8, 22], width: [0.7, 1.3], angle: 0, spread: Math.PI,
      colours: ['#8c7a52', '#6d5c3c', '#a08a5c', '#5a4a32', '#7a6845'], alpha: [0.4, 0.8], height: 0.12 });
    // dead leaves: flat ellipses with a midrib
    for (let i = 0; i < 70 * k; i++) {
      const x = p.rng() * s, y = p.rng() * s, r = between(p.rng, [7, 15]), a = p.rng() * TAU;
      const col = pick(p.rng, ['#7a5d3a', '#8e6a3f', '#5c4a2f', '#9a7a48', '#6b5232']);
      p.blob(x, y, r, col, between(p.rng, [0.7, 0.95]), { aspect: 0.55, angle: a, hardness: 0.85, height: 0.25 });
      p.line(x - Math.cos(a) * r * 0.8, y - Math.sin(a) * r * 0.8, x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8, 0.8, '#3e2f1e', 0.6, -0.1);
    }
    // twigs
    p.strokes(90 * k, { len: [20, 60], width: [1.2, 2.6], angle: 0, spread: Math.PI, colours: ['#3f3223', '#54432f'], alpha: [0.7, 0.95], height: 0.35, taper: false });
    // moss cushions and damp patches
    p.blobs(26 * k, { r: [14, 40], colours: ['#546b3a', '#4a6234'], alpha: [0.35, 0.6], height: 0.15, hardness: 0.3 });
    p.blobs(20 * k, { r: [16, 40], colours: ['#2f261b'], alpha: [0.2, 0.4], height: -0.15 });
    p.specks(600 * k, { size: [0.6, 1.8], colours: ['#b8a274', '#2c2218', '#6f8a4a'], alpha: [0.3, 0.7], height: 0.06 });
    return { normal: 1.1, ao: 0.9, rough: ({ n, h }) => 0.9 - (h - 0.5) * 0.1 + (n - 0.5) * 0.08 };
  },

  /* ------------------------------------------------------------------ dirt, mud, sand, snow, ash */
  dirt(p) {
    const s = p.size, k = (s * s) / (512 * 512);
    mottle(p, '#5b4b3b', '#7a6750', { scale: 3, heightAmp: 0.22, third: '#4a3d31', thirdAmount: 0.45 });
    p.blobs(40 * k, { r: [10, 40], colours: ['#8a7659', '#4b3e31'], alpha: [0.2, 0.4], height: 0.08 });
    // half-buried pebbles: close to the dirt tone, a touch lighter on top, so they do not pop
    p.stones(260 * k, { r: [1.5, 5], colours: ['#6f6254', '#5c5146', '#7c6f5f', '#544a3f'], light: '#8c7f6e', dark: '#3a3128', alpha: 0.85, height: 0.35, sides: 7 });
    p.cracks(6 * k, { len: [30, 90], width: [0.8, 1.6], colour: '#2e251c', alpha: 0.6, highlight: '#8a7a66', highlightAlpha: 0.25, depth: -0.3, wander: 0.7 });
    p.specks(1600 * k, { size: [0.5, 1.4], colours: ['#3a2f24', '#8f8068', '#a89a80'], alpha: [0.3, 0.7], height: 0.06 });
    p.strokes(300 * k, { len: [4, 10], width: [0.6, 1.2], angle: 0, spread: Math.PI, colours: ['#a08c66', '#4a3b2c'], alpha: [0.3, 0.6], height: 0.05 });
    return { normal: 1.0, ao: 0.8, rough: ({ n }) => 0.8 + (n - 0.5) * 0.14 };
  },

  mud(p) {
    const s = p.size, k = (s * s) / (512 * 512);
    mottle(p, '#3e3229', '#5a4a3b', { scale: 2, heightAmp: 0.45, hScale: 3, third: '#2f261f', thirdAmount: 0.5 });
    // the low spots hold water: darken them
    p.blobs(30 * k, { r: [20, 60], colours: ['#2a221c'], alpha: [0.2, 0.45], height: -0.2, hardness: 0.4 });
    p.blobs(50 * k, { r: [8, 24], colours: ['#6a5846', '#4c3e32'], alpha: [0.3, 0.5], height: 0.18 });
    // smeared ridges and ruts: wide, faint, soft-ended so they read as pushed mud not sticks
    p.strokes(70 * k, { len: [30, 90], width: [6, 14], angle: 0.3, spread: 0.5, colours: ['#4a3b2f', '#33291f', '#5a4a3c'], alpha: [0.12, 0.28], height: 0.12, taper: true });
    p.strokes(120 * k, { len: [10, 30], width: [2, 5], angle: 0.3, spread: 1.2, colours: ['#2c241d'], alpha: [0.1, 0.25], height: -0.1, taper: true });
    p.cracks(10 * k, { len: [30, 80], width: [0.8, 1.8], colour: '#241c16', alpha: 0.7, highlight: '#6f5d4c', highlightAlpha: 0.3, depth: -0.35, wander: 0.9 });
    p.stones(60 * k, { r: [1.5, 4], colours: ['#6e6559', '#5a5148'], height: 0.35, sides: 7 });
    p.specks(500 * k, { size: [0.5, 1.4], colours: ['#7a6a55', '#1f1813'], alpha: [0.3, 0.6], height: 0.05 });
    // wet in the low spots (smooth), drier and rougher on the ridges
    return { normal: 1.3, ao: 1.0, rough: ({ h, n }) => lerp(0.3, 0.78, smoothstep(0.35, 0.7, h)) + (n - 0.5) * 0.08 };
  },

  sand(p) {
    const s = p.size, k = (s * s) / (512 * 512);
    // wind ripples: a warped sine across the tile, integer wave count so it tiles
    p.fill((u, v) => {
      const warp = (p.noise(u, v, 2, 3, 5) - 0.5) * 0.35;
      // 14 ripples down the tile, leaning 2 whole waves across it - whole counts so it tiles
      const rip = 0.5 + 0.5 * Math.sin(((v + warp) * 14 + u * 2) * TAU);
      const n = p.noise(u, v, 3, 4, 1);
      const rgb = mix(mix('#a89572', '#c0ad88', n), '#8e7d5e', rip * 0.35);
      return { rgb, h: 0.5 + (rip - 0.5) * 0.3 + (n - 0.5) * 0.2 };
    });
    p.blobs(24 * k, { r: [20, 60], colours: ['#c9b791', '#8f7f62'], alpha: [0.15, 0.3], height: 0.05 });
    p.specks(4000 * k, { size: [0.4, 1.1], colours: ['#d8c8a3', '#7f6f52', '#b8a684'], alpha: [0.25, 0.6], height: 0.04 });
    p.stones(30 * k, { r: [1.5, 4], colours: ['#9c8f78', '#b5a88e'], height: 0.3, sides: 7 });
    return { normal: 0.8, ao: 0.6, rough: ({ n }) => 0.9 + (n - 0.5) * 0.08 };
  },

  snow(p) {
    const s = p.size, k = (s * s) / (512 * 512);
    // soft drifts: big smooth height, colour nearly uniform with a cool shadow in the dips
    p.fill((u, v) => {
      const d = p.noise(u, v, 2, 4, 1, 0.45);
      const fine = p.noise(u, v, 12, 3, 2);
      const rgb = mix('#c4c9d1', '#dfe2e6', smoothstep(0.35, 0.7, d));
      return { rgb: mix(rgb, '#b3bac6', (1 - d) * 0.25), h: 0.5 + (d - 0.5) * 0.7 + (fine - 0.5) * 0.08 };
    });
    // very soft, very faint: anything with an edge reads as a polka dot on snow
    p.blobs(14 * k, { r: [40, 110], colours: ['#e6e8ec'], alpha: [0.1, 0.2], height: 0.12, hardness: 0, aspect: [0.4, 0.8] });
    p.blobs(12 * k, { r: [30, 80], colours: ['#aab2c0'], alpha: [0.08, 0.16], height: -0.1, hardness: 0, aspect: [0.4, 0.8] });
    // crust flecks and sparkle
    p.specks(900 * k, { size: [0.4, 1.2], colours: ['#f2f3f5', '#a9b1bd'], alpha: [0.3, 0.7], height: 0.05 });
    p.strokes(300 * k, { len: [6, 18], width: [0.6, 1.2], angle: 0.4, spread: 0.3, colours: ['#e9ebee', '#b9c0ca'], alpha: [0.2, 0.4], height: 0.06 });
    // smooth on the wind-packed tops, rougher and more granular in the dips
    return { normal: 0.7, ao: 0.5, rough: ({ h, n }) => lerp(0.75, 0.42, smoothstep(0.4, 0.75, h)) + (n - 0.5) * 0.1 };
  },

  ash(p) {
    const s = p.size, k = (s * s) / (512 * 512);
    mottle(p, '#3f3c39', '#5e5a56', { scale: 3, heightAmp: 0.2, third: '#2f2c2a', thirdAmount: 0.5 });
    // flakes of pale ash lying every which way
    for (let i = 0; i < 500 * k; i++) {
      p.blob(p.rng() * s, p.rng() * s, between(p.rng, [2, 7]), pick(p.rng, ['#8a8683', '#9b9794', '#6f6b68', '#7d7975']), between(p.rng, [0.4, 0.8]),
        { aspect: between(p.rng, [0.3, 0.7]), angle: p.rng() * TAU, hardness: 0.7, height: 0.15 });
    }
    p.blobs(30 * k, { r: [10, 34], colours: ['#232120'], alpha: [0.25, 0.45], height: -0.12 });
    p.cracks(8 * k, { len: [30, 100], width: [0.8, 1.8], colour: '#1c1a19', alpha: 0.7, highlight: '#8a8683', highlightAlpha: 0.25, depth: -0.3, wander: 0.8 });
    // a few dull embers, kept subtle
    p.specks(40 * k, { size: [0.8, 1.8], colours: ['#8a4f30', '#7a4028'], alpha: [0.4, 0.7], height: 0 });
    p.specks(1400 * k, { size: [0.4, 1.2], colours: ['#a5a19e', '#1e1c1b'], alpha: [0.3, 0.6], height: 0.05 });
    return { normal: 0.9, ao: 0.8, rough: ({ n }) => 0.9 + (n - 0.5) * 0.08 };
  },

  /* ------------------------------------------------------------------ rock, cliff, gravel, cobble */
  rock(p) {
    const s = p.size, k = (s * s) / (512 * 512);
    p.fill((u, v) => {
      const n = p.noise(u, v, 3, 5, 1, 0.55);
      const veins = ridged(u, v, { scale: 3, octaves: 3, seed: p.seed * 7 + 9 });
      let rgb = mix('#56534e', '#787570', n);
      rgb = mix(rgb, '#8a857c', smoothstep(0.75, 0.95, veins) * 0.35);
      return { rgb, h: 0.5 + (n - 0.5) * 0.5 + (veins - 0.5) * 0.12 };
    });
    // facets: big angular plates with a lit and a shaded side, so the rock has planes not just grain
    for (let i = 0; i < 22 * k; i++) {
      p.stone(p.rng() * s, p.rng() * s, between(p.rng, [30, 90]), { colour: pick(p.rng, ['#6c6963', '#7d7a74', '#5c5953', '#736f68']), light: '#8f8b83', dark: '#3d3a36', alpha: 0.5, height: 0.3, sides: 5, jitter: 0.35, aspect: between(p.rng, [0.6, 1]), sharp: true, rim: 0.15 });
    }
    p.blobs(40 * k, { r: [12, 50], colours: ['#8c887f', '#45423e', '#6e6a62'], alpha: [0.15, 0.35], height: 0.1 });
    p.cracks(20 * k, { len: [60, 240], width: [2, 4.5], colour: '#221f1b', alpha: 0.85, highlight: '#a5a096', highlightAlpha: 0.45, depth: -0.7, wander: 0.45, branch: 0.5 });
    p.cracks(30 * k, { len: [15, 60], width: [0.6, 1.2], colour: '#2f2c28', alpha: 0.6, highlight: '#8f8a80', highlightAlpha: 0.3, depth: -0.25, wander: 0.8, branch: 0.1 });
    // mineral grains
    p.specks(3200 * k, { size: [0.4, 1.3], colours: ['#a19c92', '#3a3733', '#8d8377', '#c0b9ad'], alpha: [0.25, 0.6], height: 0.05 });
    // lichen patches, faint
    p.blobs(14 * k, { r: [6, 18], colours: ['#7a8462', '#8f8a5a'], alpha: [0.2, 0.4], height: 0.04, hardness: 0.5 });
    return { normal: 1.6, ao: 1.0, rough: ({ h, hb, n }) => 0.68 + Math.max(0, hb - h) * 1.6 + (n - 0.5) * 0.12 };
  },

  cliff(p) {
    const s = p.size, k = (s * s) / (512 * 512);
    // strata: horizontal bands stepped in height, warped a little
    p.fill((u, v) => {
      // strata: 7 beds down the tile, warped hard so no two beds run parallel, with a
      // sloping bed line rather than a hard groove; the bed id wraps so v = 1 meets v = 0
      const warp = (p.noise(u, v, 2, 3, 4) - 0.5) * 0.3 + (p.noise(u, v, 5, 2, 12) - 0.5) * 0.06;
      const band = (v + warp) * 7;
      const layer = Math.floor(band);
      const step = hash2(((layer % 7) + 7) % 7, 0, p.seed);
      const frac = band - layer;
      const edge = smoothstep(0.86, 1.0, frac) * (0.5 + 0.5 * p.noise(u, v, 6, 2, 14)); // broken bed line
      const n = p.noise(u, v, 4, 5, 1, 0.55);
      let rgb = mix('#4f4b45', '#77716a', n * 0.65 + step * 0.35);
      rgb = mix(rgb, '#7a6a55', smoothstep(0.7, 0.95, p.noise(u, v, 3, 3, 8)) * 0.35); // rust streaks
      return { rgb: mix(rgb, '#2e2b28', edge * 0.45), h: 0.42 + step * 0.22 + frac * 0.08 + (n - 0.5) * 0.3 - edge * 0.25 };
    });
    for (let i = 0; i < 26 * k; i++) {
      p.stone(p.rng() * s, p.rng() * s, between(p.rng, [30, 100]), { colour: pick(p.rng, ['#6c6963', '#7d7a74', '#5c5953', '#736f68']), light: '#8f8b83', dark: '#3d3a36', alpha: 0.45, height: 0.3, sides: 5, jitter: 0.35, aspect: between(p.rng, [0.4, 0.8]), sharp: true, rim: 0.15 });
    }
    p.blobs(30 * k, { r: [16, 60], colours: ['#8a837a', '#3f3b37'], alpha: [0.15, 0.3], height: 0.08 });
    // long vertical fractures plus short strata cracks
    p.cracks(10 * k, { len: [120, 300], width: [1.2, 3], vertical: true, colour: '#221f1c', alpha: 0.8, highlight: '#9a948a', highlightAlpha: 0.4, depth: -0.55, wander: 0.35, branch: 0.4 });
    p.cracks(36 * k, { len: [20, 90], width: [0.6, 1.6], angle: 0, colour: '#2a2723', alpha: 0.7, highlight: '#8f8a80', highlightAlpha: 0.3, depth: -0.3, wander: 0.35 });
    p.specks(2600 * k, { size: [0.4, 1.4], colours: ['#a19c92', '#33302c', '#b0a596'], alpha: [0.25, 0.6], height: 0.05 });
    p.strokes(120 * k, { len: [20, 70], width: [1.5, 4], angle: Math.PI / 2, spread: 0.15, colours: ['#3a342e', '#6a5d4f'], alpha: [0.15, 0.35], height: -0.05, taper: true }); // water stains running down
    return { normal: 1.8, ao: 1.1, rough: ({ h, hb, n }) => 0.7 + Math.max(0, hb - h) * 1.5 + (n - 0.5) * 0.1 };
  },

  gravel(p) {
    const s = p.size, k = (s * s) / (512 * 512);
    mottle(p, '#4a453f', '#5f5952', { scale: 4, heightAmp: 0.15 });
    p.specks(2000 * k, { size: [0.5, 1.6], colours: ['#7d766c', '#3a3631'], alpha: [0.3, 0.6], height: 0.05 });
    // packed, close in tone to the ground, a soft highlight only: pale stones read as pearls
    const gl = '#8a847b', gd = '#2e2b27';
    p.stones(1600 * k, { r: [2, 6], colours: ['#66615a', '#716b63', '#5c5750', '#6d675f', '#7a746c', '#544f49', '#6e6459'], light: gl, dark: gd, height: 0.45, sides: 7, jitter: 0.3 });
    p.stones(320 * k, { r: [5, 11], colours: ['#6f6962', '#605a53', '#7b756d', '#665d54'], light: gl, dark: gd, height: 0.6, sides: 8, jitter: 0.25 });
    p.stones(700 * k, { r: [1.2, 3], colours: ['#7d776e', '#4d4843'], light: gl, dark: gd, height: 0.3, sides: 6, jitter: 0.3 });
    return { normal: 2.0, ao: 1.1, rough: ({ h, n }) => 0.72 + (0.5 - h) * 0.3 + (n - 0.5) * 0.08 };
  },

  cobble(p) {
    const s = p.size, k = s / 512;
    // mortar base
    mottle(p, '#4a463f', '#5d5850', { scale: 4, heightAmp: 0.12 });
    p.specks(1500 * k * k, { size: [0.5, 1.5], colours: ['#7a746b', '#332f2b'], alpha: [0.3, 0.6], height: 0.04 });
    // stones on a jittered grid so they pack without overlapping much
    const cols = 8, rows = 8, cw = s / cols, ch = s / rows;
    const tones = ['#7d786f', '#8f8a80', '#6f6a62', '#8a8275', '#79736a', '#948d82', '#6a655e'];
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const x = (i + 0.5) * cw + (p.rng() - 0.5) * cw * 0.3 + (j % 2 ? cw * 0.5 : 0);
        const y = (j + 0.5) * ch + (p.rng() - 0.5) * ch * 0.25;
        const r = Math.min(cw, ch) * between(p.rng, [0.36, 0.46]);
        p.stone(x, y, r, { colour: pick(p.rng, tones), height: 0.8, sides: 9, jitter: 0.18, aspect: between(p.rng, [0.8, 1.1]) });
      }
    }
    // wear on the stone tops and grit in the joints
    p.specks(1800 * k * k, { size: [0.4, 1.3], colours: ['#aaa399', '#2f2c28'], alpha: [0.2, 0.5], height: 0.03 });
    p.blobs(24 * k * k, { r: [12, 40], colours: ['#5f5b53', '#2f2c28'], alpha: [0.1, 0.25], height: 0 });
    return { normal: 2.2, ao: 1.2, rough: ({ h, n }) => lerp(0.92, 0.55, smoothstep(0.45, 0.8, h)) + (n - 0.5) * 0.08 };
  },

  /* ------------------------------------------------------------------ moss */
  moss(p) {
    const s = p.size, k = (s * s) / (512 * 512);
    mottle(p, '#3d5330', '#5a7340', { scale: 3, heightAmp: 0.3, third: '#2f4227', thirdAmount: 0.45 });
    // moss is a carpet of little cushions: soft clumps first, then smaller tufts on top of
    // them, then only a few bright tips - lots of tiny sharp dots just reads as static
    p.blobs(500 * k, { r: [6, 16], colours: ['#4f6a3a', '#5a7640', '#3f5731'], alpha: [0.3, 0.6], height: 0.3, hardness: 0.1, aspect: [0.7, 1] });
    p.blobs(1400 * k, { r: [3, 8], colours: ['#6f8a48', '#5a7640', '#7d9553', '#486235'], alpha: [0.35, 0.7], height: 0.25, hardness: 0.15, aspect: [0.7, 1] });
    p.blobs(900 * k, { r: [1.5, 3.5], colours: ['#88995a', '#7d9553', '#9aa562'], alpha: [0.25, 0.5], height: 0.15, hardness: 0.2 });
    p.blobs(30 * k, { r: [10, 34], colours: ['#2c3d25'], alpha: [0.25, 0.45], height: -0.15 });
    p.blobs(20 * k, { r: [8, 24], colours: ['#96a55f'], alpha: [0.2, 0.35], height: 0.1 });
    p.specks(400 * k, { size: [0.5, 1.2], colours: ['#b9bd7e', '#1f2b1b'], alpha: [0.3, 0.6], height: 0.05 });
    return { normal: 1.2, ao: 0.9, rough: ({ n }) => 0.94 + (n - 0.5) * 0.06 };
  },

  /* ------------------------------------------------------------------ bark (tiles in Y as well as X) */
  bark_pine(p) {
    const s = p.size, k = (s * s) / (512 * 512);
    // base: long vertical ridges from noise stretched up the trunk, wandering a little so
    // they are not ruler-straight; the ridges carry most of the height
    p.fill((u, v) => {
      const wander = (p.noise(u, v, 2, 3, 21) - 0.5) * 0.06;
      const ridge = ridgedXY(u + wander, v, 8, 1, 3, p.seed * 7 + 40, 0.45);
      const n = p.noise(u, v, 3, 4, 1, 0.55);
      let rgb = mix('#3a2c22', '#6a5140', ridge * 0.65 + n * 0.35);
      rgb = mix(rgb, '#7a5e48', smoothstep(0.6, 0.9, p.noise(u, v, 4, 3, 2)) * 0.3);
      return { rgb, h: 0.3 + ridge * 0.5 + (n - 0.5) * 0.15 };
    });
    // plates: tall straight-edged slabs laid over the ridges, faint, lit on one side
    for (let i = 0; i < 36 * k; i++) {
      p.stone(p.rng() * s, p.rng() * s, between(p.rng, [14, 30]), { colour: pick(p.rng, ['#6b5240', '#5c4636', '#75594a', '#4f3d30']), light: '#8a6d55', dark: '#2a1f18', alpha: 0.3, height: 0.18, sides: 6, jitter: 0.15, aspect: between(p.rng, [1.8, 3]), sharp: true, rim: 0.2 });
    }
    // vertical fissures between and across the plates, wrapping top to bottom
    p.cracks(22 * k, { len: [s * 0.5, s * 1.3], width: [1.5, 4], vertical: true, colour: '#1e1712', alpha: 0.85, highlight: '#8a6d55', highlightAlpha: 0.35, depth: -0.7, wander: 0.3, branch: 0.3 });
    // short horizontal cracking across the plates
    p.cracks(50 * k, { len: [8, 40], width: [0.6, 1.6], angle: 0, colour: '#241b15', alpha: 0.7, highlight: '#7a5f4b', highlightAlpha: 0.3, depth: -0.3, wander: 0.5, branch: 0 });
    // flaky texture: fine vertical grain and scale edges
    p.strokes(2600 * k, { len: [6, 18], width: [0.6, 1.2], angle: -Math.PI / 2, spread: 0.12, colours: ['#7a5f4a', '#3a2c22', '#8c6f57', '#4a3a2d'], alpha: [0.2, 0.5], height: 0.06 });
    p.specks(900 * k, { size: [0.5, 1.4], colours: ['#96785f', '#1d1611'], alpha: [0.25, 0.55], height: 0.04 });
    return { normal: 1.8, ao: 1.1, rough: ({ h, hb, n }) => 0.8 + Math.max(0, hb - h) * 1.2 + (n - 0.5) * 0.1 };
  },

  bark_birch(p) {
    const s = p.size, k = (s * s) / (512 * 512);
    // pale papery bark: the exception to the vertical rule - dark horizontal dashes and peels
    mottle(p, '#c9c3b8', '#b4aea3', { scale: 2, heightAmp: 0.1, third: '#d9d4ca', thirdAmount: 0.4 });
    // grey smudges and the dark rough patches near old branch scars
    p.blobs(30 * k, { r: [10, 40], colours: ['#9a948b', '#e0dbd2'], alpha: [0.15, 0.3], height: 0.04, aspect: [0.3, 0.6], hardness: 0.2 });
    p.blobs(8 * k, { r: [14, 34], colours: ['#3d3733', '#514a45'], alpha: [0.5, 0.8], height: -0.15, aspect: [0.25, 0.5], hardness: 0.5 });
    // lenticels: short dark horizontal dashes, each embossed with a paler line above
    p.strokes(160 * k, { len: [6, 34], width: [1.4, 3.2], angle: 0, spread: 0.06, colours: ['#3a3532', '#4d4642', '#2e2a27'], alpha: [0.6, 0.9], height: -0.3, taper: false });
    p.strokes(260 * k, { len: [3, 14], width: [0.8, 1.6], angle: 0, spread: 0.08, colours: ['#5a534e', '#6e6761'], alpha: [0.4, 0.7], height: -0.15, taper: false });
    // peeling curls: a horizontal strip, lighter on top, with a shadow line under its lower edge
    for (let i = 0; i < 14 * k; i++) {
      const x = p.rng() * s, y = p.rng() * s, w = between(p.rng, [30, 110]), h = between(p.rng, [3, 9]);
      p.line(x, y, x + w, y + (p.rng() - 0.5) * 4, h, '#e3ded5', 0.7, 0.25);
      p.line(x, y + h * 0.6, x + w, y + h * 0.6 + (p.rng() - 0.5) * 4, 1.2, '#3a3531', 0.55, -0.25);
    }
    // fine horizontal paper grain
    p.strokes(1800 * k, { len: [4, 14], width: [0.5, 1], angle: 0, spread: 0.05, colours: ['#e8e4dc', '#a8a299', '#d0cbc2'], alpha: [0.2, 0.45], height: 0.04, taper: false });
    p.specks(500 * k, { size: [0.4, 1.2], colours: ['#2f2b28', '#ece8e0'], alpha: [0.2, 0.5], height: 0.03 });
    // papery and fairly smooth; the dark patches are rougher
    return { normal: 0.9, ao: 0.6, rough: ({ h, n }) => lerp(0.78, 0.55, smoothstep(0.4, 0.6, h)) + (n - 0.5) * 0.08 };
  },

  bark_oak(p) {
    const s = p.size, k = (s * s) / (512 * 512);
    // base: deep vertical ridges (more of them and deeper than pine) broken up by a second,
    // finer ridge layer so each ridge is a chain of chunks rather than one long rope
    p.fill((u, v) => {
      const wander = (p.noise(u, v, 2, 3, 21) - 0.5) * 0.08;
      const ridge = ridgedXY(u + wander, v, 11, 1, 3, p.seed * 7 + 50, 0.5);
      const chunk = ridgedXY(u, v + wander, 3, 6, 2, p.seed * 7 + 51, 0.5);
      const n = p.noise(u, v, 3, 4, 1, 0.55);
      const r = ridge * (0.7 + 0.3 * chunk);
      let rgb = mix('#3a3128', '#6d5e50', r * 0.7 + n * 0.3);
      rgb = mix(rgb, '#4e5a38', smoothstep(0.7, 0.95, p.noise(u, v, 4, 3, 2)) * (1 - r) * 0.35); // moss in the dips
      return { rgb, h: 0.25 + r * 0.6 + (n - 0.5) * 0.12 };
    });
    // deep furrows between the ridge columns
    p.cracks(28 * k, { len: [s * 0.6, s * 1.4], width: [2, 5], vertical: true, colour: '#1a1410', alpha: 0.9, highlight: '#8a7a68', highlightAlpha: 0.3, depth: -0.8, wander: 0.35, branch: 0.35 });
    p.cracks(60 * k, { len: [6, 30], width: [0.6, 1.8], angle: 0, colour: '#221b16', alpha: 0.7, highlight: '#7e6e5e', highlightAlpha: 0.25, depth: -0.35, wander: 0.6, branch: 0 });
    // moss in the crevices, faint
    p.blobs(24 * k, { r: [4, 14], colours: ['#4e5a38', '#5c6a3e'], alpha: [0.25, 0.5], height: 0.05, hardness: 0.3 });
    p.strokes(2000 * k, { len: [5, 16], width: [0.6, 1.2], angle: -Math.PI / 2, spread: 0.15, colours: ['#7d6e60', '#2e251e', '#8c7c6c'], alpha: [0.2, 0.45], height: 0.05 });
    p.specks(800 * k, { size: [0.5, 1.3], colours: ['#9a8a78', '#15100c'], alpha: [0.25, 0.55], height: 0.04 });
    return { normal: 2.0, ao: 1.2, rough: ({ h, hb, n }) => 0.82 + Math.max(0, hb - h) * 1.2 + (n - 0.5) * 0.08 };
  },

  bark_dead(p) {
    const s = p.size, k = (s * s) / (512 * 512);
    // silvered, barkless wood: exposed grain running up, deep checks, beetle galleries
    mottle(p, '#5b554d', '#7d766c', { scale: 2, heightAmp: 0.18, hScale: 3, third: '#4a443d', thirdAmount: 0.4 });
    p.strokes(3200 * k, { len: [20, 80], width: [0.6, 1.4], angle: -Math.PI / 2, spread: 0.06, colours: ['#8f877c', '#3f3a34', '#a19a8f', '#59534b'], alpha: [0.25, 0.55], height: 0.08, taper: false });
    p.cracks(16 * k, { len: [s * 0.5, s * 1.3], width: [1.5, 4], vertical: true, colour: '#1c1916', alpha: 0.85, highlight: '#a39b8f', highlightAlpha: 0.4, depth: -0.7, wander: 0.2, branch: 0.25 });
    p.cracks(40 * k, { len: [10, 50], width: [0.6, 1.4], vertical: true, colour: '#2a2622', alpha: 0.7, highlight: '#948c80', highlightAlpha: 0.3, depth: -0.3, wander: 0.25, branch: 0 });
    // beetle holes and galleries
    p.specks(30 * k, { size: [1.5, 3], colours: ['#1a1714'], alpha: [0.8, 0.95], height: -0.5 });
    p.cracks(10 * k, { len: [20, 70], width: [1, 2], colour: '#2b2621', alpha: 0.6, highlight: '#8f877c', highlightAlpha: 0.2, depth: -0.3, wander: 1.2, branch: 0.5 });
    // a few clinging bark scraps, darker
    p.blobs(10 * k, { r: [10, 30], colours: ['#3f3630', '#4c4239'], alpha: [0.5, 0.8], height: 0.3, aspect: [0.3, 0.6], hardness: 0.7 });
    p.specks(700 * k, { size: [0.4, 1.2], colours: ['#b5ada1', '#1c1916'], alpha: [0.2, 0.5], height: 0.04 });
    return { normal: 1.5, ao: 1.0, rough: ({ h, hb, n }) => 0.78 + Math.max(0, hb - h) * 1.2 + (n - 0.5) * 0.1 };
  },

  /* ------------------------------------------------------------------ built surfaces */
  wood_plank(p) {
    const s = p.size, k = (s * s) / (512 * 512);
    const planks = 4, pw = s / planks;
    // each plank its own tone; grain wanders along the plank, wrapping top to bottom
    p.fill((u, v) => {
      const i = Math.floor(u * planks);
      const tone = hash2(i, 3, p.seed);
      const local = (u * planks - i);
      // grain: lines running UP the plank. The phase runs ACROSS the plank (`local`), so a
      // line of constant phase is vertical; tileable noise in v makes it wander along the
      // length. (Phase in v would give horizontal bands - lines of constant phase are
      // perpendicular to the direction the phase changes in.)
      const warp = (p.noise(u, v, 2, 3, 6) - 0.5) * 3 + (p.noise(u, v, 6, 2, 9) - 0.5) * 0.8;
      const grain = Math.sin((local * 7 + warp + tone * 3) * TAU) * 0.5 + 0.5;
      const line = smoothstep(0.82, 0.97, grain);
      const n = p.noise(u, v, 4, 3, 1);
      let rgb = mix('#8a6f4f', '#6e5638', tone * 0.6 + n * 0.4);
      rgb = mix(rgb, '#4f3b26', line * 0.5);
      const gap = Math.min(local, 1 - local) < 0.025 ? 1 : 0;
      return { rgb: mix(rgb, '#2a1f14', gap * 0.8), h: 0.55 + (n - 0.5) * 0.12 - line * 0.08 - gap * 0.4 };
    });
    // knots: a few dark ellipses with rings
    for (let i = 0; i < 5 * k; i++) {
      const x = p.rng() * s, y = p.rng() * s, r = between(p.rng, [5, 12]);
      p.blob(x, y, r, '#4a3420', 0.85, { aspect: 0.6, angle: Math.PI / 2, hardness: 0.6, height: -0.2 });
      p.blob(x, y, r * 0.5, '#2f2014', 0.9, { aspect: 0.6, angle: Math.PI / 2, hardness: 0.6, height: -0.3 });
      p.blob(x, y, r * 1.6, '#6a5236', 0.35, { aspect: 0.55, angle: Math.PI / 2, hardness: 0.6, height: 0 });
    }
    // fine grain lines, scratches and the odd nail
    p.strokes(2200 * k, { len: [20, 90], width: [0.5, 1.1], angle: -Math.PI / 2, spread: 0.04, colours: ['#a48762', '#4e3a26', '#8f7350'], alpha: [0.15, 0.4], height: 0.05, taper: false });
    p.strokes(80 * k, { len: [10, 40], width: [0.6, 1.2], angle: -Math.PI / 2, spread: 0.6, colours: ['#3d2d1c'], alpha: [0.2, 0.4], height: -0.1, taper: false });
    for (let i = 0; i < planks; i++) {
      for (const yy of [s * 0.12, s * 0.62]) {
        const x = (i + 0.5) * pw + (p.rng() - 0.5) * 4, y = yy + (p.rng() - 0.5) * 6;
        p.stone(x, y, 2.4, { colour: '#6b665f', light: '#9a948b', dark: '#2f2c28', height: 0.3, sides: 8, jitter: 0.05 });
      }
    }
    return { normal: 1.2, ao: 0.9, rough: ({ h, n }) => 0.62 + (0.5 - h) * 0.3 + (n - 0.5) * 0.1 };
  },

  thatch(p) {
    const s = p.size, k = (s * s) / (512 * 512);
    mottle(p, '#6f5d3a', '#8c7748', { scale: 3, heightAmp: 0.2, third: '#5a4a2f', thirdAmount: 0.4 });
    // rows of bundles overlapping downward: each row's lower edge casts a shadow band
    const rowsN = 5, rh = s / rowsN;
    for (let j = 0; j < rowsN; j++) {
      const y = j * rh; // the j = 0 row wraps to the bottom edge by itself
      p.line(-4, y, s + 4, y, rh * 0.26, '#2f2618', 0.6, -0.4);
      p.line(-4, y + rh * 0.14, s + 4, y + rh * 0.14, rh * 0.1, '#b39c66', 0.35, 0.2);
    }
    // straw: long near-vertical strokes in several straw tones
    p.strokes(5200 * k, { len: [rh * 0.5, rh * 1.1], width: [0.8, 1.8], angle: Math.PI / 2, spread: 0.1,
      colours: ['#a08a58', '#8c7648', '#b59c66', '#6f5d3a', '#c4ab74', '#7d6a40', '#9a8555'], alpha: [0.35, 0.75], height: 0.18, taper: false });
    p.strokes(1600 * k, { len: [rh * 0.3, rh * 0.8], width: [0.5, 1], angle: Math.PI / 2, spread: 0.18, colours: ['#d2ba82', '#4f4128'], alpha: [0.25, 0.5], height: 0.1, taper: false });
    // loose ends and a few bent straws
    p.strokes(300 * k, { len: [10, 30], width: [0.8, 1.4], angle: Math.PI / 2, spread: 0.8, colours: ['#c4ab74', '#5c4c30'], alpha: [0.3, 0.6], height: 0.12 });
    p.blobs(20 * k, { r: [16, 44], colours: ['#4a3d26'], alpha: [0.15, 0.3], height: -0.06 });
    return { normal: 1.3, ao: 1.0, rough: ({ n }) => 0.9 + (n - 0.5) * 0.08 };
  },
};

/* ==============================================================================================
 * 8. makeSurface
 * ============================================================================================ */

const surfaceCache = new Map();

/**
 * A tileable PBR ground/surface set drawn on canvases.
 * @param {string} name one of CATALOG.surfaces
 * @param {object} opts size (512 default, 1024 for hero surfaces), seed, repeat, tint
 * @returns {{ map: THREE.CanvasTexture, normalMap: THREE.CanvasTexture, roughnessMap: THREE.CanvasTexture, aoMap: THREE.CanvasTexture, size: number, name: string }}
 */
export function makeSurface(name, opts = {}) {
  const { size = 512, seed = 1, repeat = 1, tint = null } = opts;
  const recipe = RECIPES[name];
  if (!recipe) {
    throw new Error(`textures.makeSurface: unknown surface "${name}". Known: ${Object.keys(RECIPES).join(', ')}`);
  }
  const tintKey = tint ? (tint.isColor ? tint.getHexString() : String(tint)) : '';
  const key = `${name}|${size}|${seed}|${tintKey}`;
  let set = surfaceCache.get(key);
  if (!set) {
    set = buildSurface(name, recipe, size, seed, tint);
    surfaceCache.set(key, set);
  }
  if (repeat === 1) return set;
  // A different repeat is a different texture object, but the drawing is shared: clones
  // point at the same canvas, so nothing is redrawn.
  const withRepeat = (t) => { const c = t.clone(); c.repeat.set(repeat, repeat); c.needsUpdate = true; return c; };
  return { ...set, map: withRepeat(set.map), normalMap: withRepeat(set.normalMap), roughnessMap: withRepeat(set.roughnessMap), aoMap: withRepeat(set.aoMap) };
}

function buildSurface(name, recipe, size, seed, tint) {
  const rng = makeRng(seed * 1000 + name.length);
  const p = new Painter(size, rng, seed);
  const rules = recipe(p) || {};
  if (tint) p.tint(tint);

  const h = readHeight(p);
  const { ao, blurred } = heightToAO(h, size, rules.ao ?? 1);
  const roughFn = rules.rough || (() => 0.8);
  const rough = new Float32Array(size * size);
  let i = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++, i++) {
      const n = p.noise(x / size, y / size, 6, 3, 77);
      rough[i] = clamp01(roughFn({ h: h[i], hb: blurred[i], n, u: x / size, v: y / size }));
    }
  }
  return {
    name, size, seed,
    map: canvasTexture(p.colour, { srgb: true }),
    normalMap: canvasTexture(heightToNormal(h, size, rules.normal ?? 1)),
    roughnessMap: canvasTexture(greyCanvas(rough, size)),
    aoMap: canvasTexture(greyCanvas(ao, size)),
  };
}

/** Forget every cached surface (e.g. when the renderer is torn down). Does not dispose GPU memory. */
export function clearSurfaceCache() {
  surfaceCache.clear();
}

/* ==============================================================================================
 * 9. Sprite atlases from the SVG files
 *
 * Each SVG is fetched as text, turned into a Blob URL, loaded into an Image and drawn into its
 * atlas cell with a 2 px transparent gutter on every side so mipmapping never bleeds one leaf
 * into the next. Alpha is left straight (not premultiplied) because the foliage materials
 * alpha-test for hard edges. A file that fails to load gets a simple drawn fallback shape.
 * ============================================================================================ */

const FOLIAGE_DIR = new URL('../../assets/foliage/', import.meta.url).href;

/** Default 4x4 foliage layout: row 0 broadleaf, row 1 needle spray, row 2 small leaf, row 3 frond. */
export const FOLIAGE_ROWS = [
  ['leaf-broad-1', 'leaf-broad-2', 'leaf-broad-3', 'leaf-broad-4'],
  ['needle-spray-1', 'needle-spray-2', 'needle-spray-3', 'needle-spray-4'],
  ['leaf-small-1', 'leaf-small-2', 'leaf-small-3', 'leaf-small-4'],
  ['frond-1', 'frond-2', 'frond-3', 'frond-4'],
];
export const GRASS_ROW = ['grass-blade-1', 'grass-blade-2', 'grass-blade-3', 'grass-blade-4'];
export const PROP_ROWS = [
  ['flower-daisy', 'flower-bell', 'flower-thistle', 'mushroom-cap'],
  ['berry-sprig', 'dead-leaf', null, null],
];

/** Gutter in pixels around every cell. */
const ATLAS_PAD = 2;

/**
 * Load one SVG sprite as an Image. Resolves to null (never rejects) if anything goes wrong,
 * so a missing file can never take the page down.
 */
async function loadSprite(name) {
  if (typeof fetch === 'undefined' || typeof Image === 'undefined') return null;
  const url = `${FOLIAGE_DIR}${name}.svg`;
  let text;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    text = await res.text();
  } catch (err) {
    console.warn(`textures.js: could not fetch ${url}:`, err && err.message ? err.message : err);
    return null;
  }
  // Blob URL first; fall back to a data: URL for the odd environment that blocks blob images.
  const tryLoad = (src) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
  let img = null;
  let blobUrl = null;
  try {
    blobUrl = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml;charset=utf-8' }));
    img = await tryLoad(blobUrl);
  } catch (err) {
    img = null;
  } finally {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
  }
  if (!img) {
    try {
      img = await tryLoad(`data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(text)))}`);
    } catch (err) {
      img = null;
    }
  }
  if (!img) console.warn(`textures.js: ${name}.svg fetched but would not decode; drawing a fallback.`);
  return img;
}

/** A stand-in shape for a sprite that failed to load: a leaf, a blade or a dot, by kind. */
function drawFallback(ctx, x, y, w, h, kind) {
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.fillStyle = kind === 'grass' ? '#5f7a3f' : kind === 'prop' ? '#8a7a5a' : '#5b7440';
  ctx.strokeStyle = '#33452a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (kind === 'grass') {
    ctx.moveTo(-w * 0.06, h * 0.48);
    ctx.quadraticCurveTo(w * 0.05, -h * 0.1, w * 0.12, -h * 0.48);
    ctx.quadraticCurveTo(w * 0.02, -h * 0.1, w * 0.06, h * 0.48);
  } else if (kind === 'prop') {
    ctx.arc(0, -h * 0.1, w * 0.18, 0, TAU);
    ctx.moveTo(0, h * 0.08);
    ctx.lineTo(0, h * 0.45);
  } else {
    ctx.ellipse(0, 0, w * 0.28, h * 0.42, 0.3, 0, TAU);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

const atlasCache = new Map();

/**
 * Build an atlas from a 2D list of sprite names (null = empty cell). Cached by layout.
 * @returns {Promise<{ texture: THREE.CanvasTexture, cols: number, rows: number, cell: number, index: object, canvas: HTMLCanvasElement }>}
 */
async function buildAtlas(grid, cell, kind) {
  const key = `${kind}|${cell}|${JSON.stringify(grid)}`;
  if (atlasCache.has(key)) return atlasCache.get(key);
  const job = (async () => {
    const rows = grid.length, cols = Math.max(...grid.map((r) => r.length));
    const canvas = makeCanvas(cols * cell, rows * cell);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const index = {};
    const jobs = [];
    grid.forEach((row, r) => row.forEach((name, c) => {
      if (!name) return;
      index[name] = [c, r];
      jobs.push(loadSprite(name).then((img) => {
        const x = c * cell + ATLAS_PAD, y = r * cell + ATLAS_PAD, w = cell - ATLAS_PAD * 2, h = cell - ATLAS_PAD * 2;
        if (img) {
          try {
            ctx.drawImage(img, x, y, w, h);
            return;
          } catch (err) {
            console.warn(`textures.js: drawImage failed for ${name}:`, err);
          }
        }
        drawFallback(ctx, x, y, w, h, kind);
      }));
    }));
    await Promise.all(jobs);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.premultiplyAlpha = false;
    texture.anisotropy = 8;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return { texture, cols, rows, cell, index, canvas };
  })();
  atlasCache.set(key, job);
  return job;
}

/**
 * The 4x4 foliage atlas. Rows default to FOLIAGE_ROWS (broadleaf / needle / small leaf / frond).
 * @param {string[][]} rows four rows of four sprite names
 * @param {object} opts cell = pixel size of one cell (256)
 */
export async function loadFoliageAtlas(rows = FOLIAGE_ROWS, opts = {}) {
  return buildAtlas(rows, opts.cell ?? 256, 'leaf');
}

/** The four grass blades in a 4x1 strip. */
export async function loadGrassAtlas(opts = {}) {
  return buildAtlas([GRASS_ROW], opts.cell ?? 256, 'grass');
}

/** The six extras in a 4x2 grid; `index` maps a name to its [col, row]. */
export async function loadPropAtlas(opts = {}) {
  return buildAtlas(PROP_ROWS, opts.cell ?? 256, 'prop');
}

/**
 * UV rectangle of one atlas cell, inset by the gutter, for building quad geometry.
 * Remember three.js flips the canvas on upload: row 0 (the top of the canvas) is at v = 1.
 * @returns {{ u0: number, v0: number, u1: number, v1: number }} v0 < v1, v1 is the top of the sprite
 */
export function atlasUV(atlas, col, row) {
  const padU = ATLAS_PAD / (atlas.cols * atlas.cell), padV = ATLAS_PAD / (atlas.rows * atlas.cell);
  return {
    u0: col / atlas.cols + padU,
    u1: (col + 1) / atlas.cols - padU,
    v0: 1 - (row + 1) / atlas.rows + padV,
    v1: 1 - row / atlas.rows - padV,
  };
}

/* ==============================================================================================
 * 10. Utility maps
 * ============================================================================================ */

/** Wrap RGBA bytes in a DataTexture with sensible defaults. */
function dataTexture(bytes, w, h, { srgb = false, wrap = true, mip = true, nearest = false } = {}) {
  const t = new THREE.DataTexture(bytes, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = wrap ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.generateMipmaps = mip;
  t.minFilter = nearest ? THREE.NearestFilter : mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.magFilter = nearest ? THREE.NearestFilter : THREE.LinearFilter;
  t.anisotropy = nearest ? 1 : 8;
  t.needsUpdate = true;
  return t;
}

/**
 * Two-octave tileable ripple normal map for water. A handful of directional waves with whole
 * wave counts (so they tile) at two sizes, plus a little noise so it is not a perfect grid.
 * Scroll two copies of it in different directions for moving water.
 */
export function makeWaterNormals(size = 512, seed = 7) {
  const rng = makeRng(seed);
  const waves = [];
  for (let i = 0; i < 4; i++) waves.push({ kx: Math.round(between(rng, [1, 4])) * (rng() < 0.5 ? -1 : 1), ky: Math.round(between(rng, [1, 4])), amp: between(rng, [0.5, 1]), ph: rng() * TAU });
  for (let i = 0; i < 5; i++) waves.push({ kx: Math.round(between(rng, [5, 13])) * (rng() < 0.5 ? -1 : 1), ky: Math.round(between(rng, [5, 13])), amp: between(rng, [0.12, 0.3]), ph: rng() * TAU });
  const h = new Float32Array(size * size);
  let i = 0;
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++, i++) {
      const u = x / size;
      let s = 0;
      for (const w of waves) s += w.amp * Math.sin((w.kx * u + w.ky * v) * TAU + w.ph);
      // broken up by cell-like ridged noise and soft fBm so the waves do not read as a plaid
      s += (ridged(u, v, { scale: 6, octaves: 3, seed: seed * 13 + 3 }) - 0.5) * 2.4;
      s += (fbm(u, v, { scale: 10, octaves: 3, seed: seed * 13 }) - 0.5) * 1.6;
      h[i] = 0.5 + s * 0.1;
    }
  }
  const canvas = heightToNormal(h, size, 0.7);
  const bytes = new Uint8Array(canvas.getContext('2d').getImageData(0, 0, size, size).data.buffer);
  return dataTexture(bytes, size, size, { srgb: false });
}

/**
 * Soft tileable cloud layer: white with a fractal alpha. Meant for a sky dome or a slowly
 * scrolling cloud-shadow projector. `cover` (0..1) is how much of the sky is cloud.
 */
export function makeCloudTexture(size = 1024, seed = 3, cover = 0.45) {
  const bytes = new Uint8Array(size * size * 4);
  const lo = 0.62 - cover * 0.3, hi = lo + 0.28;
  let i = 0;
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++, i += 4) {
      const u = x / size;
      const n = fbm(u, v, { scale: 3, octaves: 6, gain: 0.55, seed: seed * 17 });
      const wisps = fbm(u, v, { scale: 9, octaves: 3, gain: 0.5, seed: seed * 17 + 5 });
      const a = smoothstep(lo, hi, n * 0.85 + wisps * 0.15);
      // slightly grey in the thick middle so clouds have body
      const g = Math.round(255 - a * 30);
      bytes[i] = g; bytes[i + 1] = g; bytes[i + 2] = Math.min(255, g + 4);
      bytes[i + 3] = Math.round(a * 255);
    }
  }
  return dataTexture(bytes, size, size, { srgb: true });
}

/**
 * RGBA "blue-ish" noise for dithering, AO sampling and jitter. White noise with its low
 * frequencies removed (each channel minus a 3x3 blur of itself), which pushes the energy
 * into fine grain so it does not clump. Nearest filtering, no mipmaps, wraps.
 */
export function makeNoiseTexture(size = 256, seed = 11) {
  const rng = makeRng(seed);
  const n = size * size;
  const white = new Float32Array(n * 4);
  for (let i = 0; i < white.length; i++) white[i] = rng();
  const bytes = new Uint8Array(n * 4);
  for (let ch = 0; ch < 4; ch++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let sum = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) sum += white[((((y + dy + size) % size) * size + ((x + dx + size) % size)) * 4) + ch];
        }
        const v = white[(y * size + x) * 4 + ch] - sum / 9 + 0.5;
        bytes[(y * size + x) * 4 + ch] = Math.round(clamp01(v) * 255);
      }
    }
  }
  return dataTexture(bytes, size, size, { srgb: false, mip: false, nearest: true });
}

/**
 * A 1D colour ramp (256x1) for colour grading, fog by depth, height tinting, etc.
 * @param {Array} stops  [[t, '#hex'], ...] or [{ t, color }, ...], t in 0..1
 */
export function makeGradientRamp(stops) {
  const w = 256;
  const canvas = makeCanvas(w, 1);
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, w, 0);
  const list = (stops && stops.length ? stops : [[0, '#000000'], [1, '#ffffff']]).map((s) => (Array.isArray(s) ? { t: s[0], color: s[1] } : { t: s.t ?? s.offset ?? 0, color: s.color }));
  for (const s of list) {
    const col = s.color && s.color.isColor ? s.color.getStyle() : String(s.color);
    g.addColorStop(clamp01(s.t), col);
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, 1);
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = false;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/**
 * A soft sphere-shading image (a "matcap") in muted leaf greens: a highlight up-left, a
 * darker rim, and a faint warm bounce low-right. A fallback for foliage materials when no
 * real lighting model is wanted, e.g. distant impostors.
 */
export function makeLeafMatcapFallback(size = 256) {
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const c = size / 2;
  ctx.fillStyle = '#20281c';
  ctx.fillRect(0, 0, size, size);
  const body = ctx.createRadialGradient(c * 0.7, c * 0.65, 0, c, c, c);
  body.addColorStop(0, '#c2cfa6');
  body.addColorStop(0.25, '#8ea36c');
  body.addColorStop(0.65, '#5d7645');
  body.addColorStop(0.92, '#38492e');
  body.addColorStop(1, '#26331f');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(c, c, c, 0, TAU);
  ctx.fill();
  const bounce = ctx.createRadialGradient(c * 1.35, c * 1.4, 0, c * 1.35, c * 1.4, c * 0.8);
  bounce.addColorStop(0, 'rgba(150,140,90,0.35)');
  bounce.addColorStop(1, 'rgba(150,140,90,0)');
  ctx.fillStyle = bounce;
  ctx.beginPath();
  ctx.arc(c, c, c, 0, TAU);
  ctx.fill();
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

/* ==============================================================================================
 * 11. Catalog, for a gallery page
 * ============================================================================================ */

export const CATALOG = {
  surfaces: Object.keys(RECIPES),
  atlases: [
    { id: 'foliage', load: 'loadFoliageAtlas', cols: 4, rows: 4, sprites: FOLIAGE_ROWS.flat() },
    { id: 'grass', load: 'loadGrassAtlas', cols: 4, rows: 1, sprites: GRASS_ROW.slice() },
    { id: 'props', load: 'loadPropAtlas', cols: 4, rows: 2, sprites: PROP_ROWS.flat().filter(Boolean) },
  ],
  utility: ['makeWaterNormals', 'makeCloudTexture', 'makeNoiseTexture', 'makeGradientRamp', 'makeLeafMatcapFallback'],
};
