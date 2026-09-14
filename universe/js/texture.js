// Planet → sphere texture. Renders a planet's world map into a 2:1 equirectangular canvas that can
// be wrapped straight onto a sphere, plus the separate cloud, night-lights and bump layers.
//
//   import { planetTexture } from './texture.js';
//   const { map, clouds, lights, bump } = planetTexture(planet, world, { size: 1024 });
//   new THREE.CanvasTexture(map);
//
// Browser only (it needs a canvas). Everything else in universe/js is node-safe.
//
// Why the seam does not show: World Forge frames every map in ocean (the edge mask), so the left and
// right columns are already water, and the sampler wraps in longitude.

import { BIOMES, palettedColors, hexToRgb } from '../../worldgen/js/biomes.js';
import { makeNoise2D, makeNoise3D, subSeed, makeRng, clamp, lerp, smoothstep } from '../../worldgen/js/noise.js';
import { ARCH_BY_KEY } from './system.js';

const makeCanvas = (w, h) => {
  if (typeof OffscreenCanvas !== 'undefined' && typeof document === 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
};

/** Longitude/latitude (in texture space) → a point on the unit sphere, for seamless 3D noise. */
function sphere(u, v) {
  const lon = u * Math.PI * 2, lat = (v - 0.5) * Math.PI;
  const cl = Math.cos(lat);
  return { x: Math.cos(lon) * cl, y: Math.sin(lat), z: Math.sin(lon) * cl };
}

// ---------------------------------------------------------------------------- surface map

/**
 * The ground: biome colours, hillshade, water depth, a little grain.
 * Returns a canvas of size × size/2.
 */
export function surfaceTexture(planet, world, { size = 1024 } = {}) {
  const W = size, H = size >> 1;
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(W, H);
  const px = img.data;

  const arch = ARCH_BY_KEY[planet.archetype] || ARCH_BY_KEY.barren;
  const table = arch.palette ? palettedColors(arch.palette) : BIOMES;
  const RGB = table.map(b => hexToRgb(b.color));
  const gw = world.width, gh = world.height;
  const grain = makeNoise3D(subSeed(planet.seed, 'grain'));
  const molten = planet.archetype === 'lava';

  // 1 — colour every world cell once (biome colour, hillshade on land, depth shading in water).
  //     Then the texture is a smooth bilinear read of this little buffer, which is both faster and
  //     far better looking than picking the nearest cell per texel.
  const cells = new Float32Array(gw * gh * 3);
  const sea = new Uint8Array(gw * gh);
  const at = (x, y) => Math.min(gh - 1, Math.max(0, y)) * gw + ((x % gw) + gw) % gw;
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const i = y * gw + x;
      const b = world.biome[i];
      const c = RGB[b] || RGB[0];
      let r = c[0], g = c[1], bl = c[2];
      const isWater = world.water[i] !== 0;
      const frozen = b === 25;
      if (!isWater) {
        const l = world.elevation[at(x - 1, y)], rr = world.elevation[at(x + 1, y)];
        const u = world.elevation[at(x, y - 1)], d = world.elevation[at(x, y + 1)];
        const k = 1 + clamp(((l - rr) + (u - d)) * 6.5, -0.45, 0.45);
        r *= k; g *= k; bl *= k;
      } else if (!frozen) {
        const depth = clamp((0.5 - world.elevation[i]) / 0.5, 0, 1);
        const k = 1 - depth * 0.32;
        r *= k; g *= k; bl *= k;
        if (molten) { r = clamp(r * 1.35 + 45, 0, 255); g = clamp(g * 1.05 + 12, 0, 255); bl *= 0.85; }
      }
      sea[i] = isWater && !frozen ? 1 : 0;
      cells[i * 3] = r; cells[i * 3 + 1] = g; cells[i * 3 + 2] = bl;
    }
  }

  // 2 — bilinear read, wrapping in longitude so the seam never shows
  for (let y = 0; y < H; y++) {
    const v = (y + 0.5) / H;
    const gy = v * gh - 0.5;
    const y0 = Math.floor(gy), fy = gy - y0;
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W;
      const gx = u * gw - 0.5;
      const x0 = Math.floor(gx), fx = gx - x0;
      const i00 = at(x0, y0), i10 = at(x0 + 1, y0), i01 = at(x0, y0 + 1), i11 = at(x0 + 1, y0 + 1);
      const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
      let r = cells[i00 * 3] * w00 + cells[i10 * 3] * w10 + cells[i01 * 3] * w01 + cells[i11 * 3] * w11;
      let g = cells[i00 * 3 + 1] * w00 + cells[i10 * 3 + 1] * w10 + cells[i01 * 3 + 1] * w01 + cells[i11 * 3 + 1] * w11;
      let b = cells[i00 * 3 + 2] * w00 + cells[i10 * 3 + 2] * w10 + cells[i01 * 3 + 2] * w01 + cells[i11 * 3 + 2] * w11;

      // fine grain so the sphere does not look like flat vector art up close
      const isSea = sea[i00] === 1;
      const p = sphere(u, v);
      const n = grain(p.x * 26, p.y * 26, p.z * 26) * (isSea ? 5 : 13);
      r += n; g += n; b += n;

      const o = (y * W + x) * 4;
      px[o] = clamp(r, 0, 255); px[o + 1] = clamp(g, 0, 255); px[o + 2] = clamp(b, 0, 255); px[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** A grey height map matching the surface, for an optional bump/normal map. */
export function bumpTexture(planet, world, { size = 512 } = {}) {
  const W = size, H = size >> 1;
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(W, H);
  const gw = world.width, gh = world.height;
  for (let y = 0; y < H; y++) {
    const gy = clamp(((y + 0.5) / H) * gh, 0, gh - 1) | 0;
    for (let x = 0; x < W; x++) {
      const gx = Math.floor(((x + 0.5) / W) * gw) % gw;
      const i = gy * gw + gx;
      const e = world.water[i] === 0 ? 0.5 + (world.elevation[i] - 0.5) * 1.6 : 0.42;
      const v = clamp(e, 0, 1) * 255;
      const o = (y * W + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = v; img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// ---------------------------------------------------------------------------- clouds

/**
 * A transparent cloud layer for a second, slightly larger sphere. Density and colour come from the
 * planet's atmosphere; the shape is 3D noise sampled on the sphere, so it wraps perfectly.
 * Returns null when there is not enough air to hold a cloud.
 */
export function cloudTexture(planet, { size = 512 } = {}) {
  const density = planet.atmosphere?.density ?? 0;
  if (density < 0.12) return null;
  const W = size, H = size >> 1;
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(W, H);
  const n = makeNoise3D(subSeed(planet.seed, 'cloud'));
  const wispy = planet.archetype === 'toxic' || planet.archetype === 'lava' ? 1.8 : 1;
  // `cover` is roughly the share of the globe under cloud — keep it well under half or the surface
  // never shows, which is the mistake that makes a planet look like a ball of wool
  const cover = clamp(0.14 + density * 0.2 + (planet.archetype === 'jungle' ? 0.14 : 0) + (planet.archetype === 'ocean' ? 0.08 : 0), 0.05, 0.55);
  const tint = hexToRgb(planet.atmosphere?.color || '#ffffff');
  const white = planet.archetype === 'living' || planet.archetype === 'ocean' || planet.archetype === 'tundra' || planet.archetype === 'jungle';

  for (let y = 0; y < H; y++) {
    const v = (y + 0.5) / H;
    // bands: clouds stretch out along latitude on a spinning world
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W;
      const p = sphere(u, v);
      let f = 0, amp = 0.5, freq = 2.2 * wispy;
      for (let o = 0; o < 5; o++) { f += amp * n(p.x * freq, p.y * freq * 2.4, p.z * freq); amp *= 0.52; freq *= 2.05; }
      f = f * 0.5 + 0.5;
      const alpha = clamp((f - (1 - cover)) / Math.max(0.06, cover * 0.55), 0, 1) * clamp(0.45 + density * 0.3, 0, 0.85);
      const o = (y * W + x) * 4;
      img.data[o] = white ? 250 : tint[0]; img.data[o + 1] = white ? 252 : tint[1]; img.data[o + 2] = white ? 255 : tint[2];
      img.data[o + 3] = alpha * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// ---------------------------------------------------------------------------- night lights

/**
 * Settlement lights for the dark side. Only worlds that could hold people get them, and they cluster
 * on habitable ground near water, the same way the world generator places towns.
 * Returns null when nobody lives there.
 */
export function lightsTexture(planet, world, { size = 512, density = 1 } = {}) {
  if (!world || !['living', 'ocean', 'jungle', 'tundra'].includes(planet.archetype)) return null;
  const W = size, H = size >> 1;
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const rng = makeRng(subSeed(planet.seed, 'lights'));
  const gw = world.width, gh = world.height;
  const count = Math.round((planet.archetype === 'living' ? 110 : 40) * density * (size / 512));
  ctx.globalCompositeOperation = 'lighter';
  let placed = 0, tries = 0;
  while (placed < count && tries++ < count * 30) {
    const gx = rng.int(0, gw - 1), gy = rng.int(0, gh - 1);
    const i = gy * gw + gx;
    if (world.water[i] !== 0) continue;
    const hab = world.habitability ? world.habitability[i] : 0.5;
    if (rng() > clamp(hab, 0.05, 1)) continue;
    const x = (gx + rng()) / gw * W, y = (gy + rng()) / gh * H;
    const r = rng.range(1, 3.2) * (size / 512);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,232,180,0.9)');
    g.addColorStop(0.4, 'rgba(255,196,120,0.28)');
    g.addColorStop(1, 'rgba(255,170,80,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    placed++;
  }
  ctx.globalCompositeOperation = 'source-over';
  canvas.lightCount = placed;
  return placed > 4 ? canvas : null;
}

/**
 * What glows by itself. Lava worlds light up along their lava seas and the hottest low ground;
 * everything else returns null (a living world's towns come from lightsTexture instead).
 */
export function emissiveTexture(planet, world, { size = 512 } = {}) {
  if (!world || planet.archetype !== 'lava') return null;
  const W = size, H = size >> 1;
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(W, H);
  const gw = world.width, gh = world.height;
  const n = makeNoise3D(subSeed(planet.seed, 'emissive'));
  for (let y = 0; y < H; y++) {
    const v = (y + 0.5) / H;
    const gy = clamp(v * gh, 0, gh - 1) | 0;
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W;
      const gx = Math.floor(u * gw) % gw;
      const i = gy * gw + gx;
      const p = sphere(u, v);
      const veins = clamp(1 - Math.abs(n(p.x * 9, p.y * 9, p.z * 9)) * 3.2, 0, 1);
      // molten where the ground is below the lava line, plus glowing cracks in the low country
      let heat = world.water[i] !== 0 ? 1 : veins * clamp(1 - (world.elevation[i] - 0.5) * 4, 0, 1);
      heat = clamp(heat, 0, 1);
      const o = (y * W + x) * 4;
      img.data[o] = 255 * heat;
      img.data[o + 1] = 150 * heat * heat;
      img.data[o + 2] = 40 * heat * heat * heat;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// ---------------------------------------------------------------------------- gas giants

/** Banded cloud decks, turbulence and a long-lived storm — for the two worlds with no surface. */
export function gasTexture(planet, { size = 1024 } = {}) {
  const W = size, H = size >> 1;
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(W, H);
  const rng = makeRng(subSeed(planet.seed, 'gas'));
  const n = makeNoise3D(subSeed(planet.seed, 'gasnoise'));
  const warp = makeNoise2D(subSeed(planet.seed, 'gaswarp'));
  const ice = planet.archetype === 'iceGiant';

  // a palette of three to five band colours
  const base = hexToRgb(ice ? '#4fa8c8' : '#c8a878');
  const alt = hexToRgb(ice ? '#8fd8e8' : '#f0dcb8');
  const dark = hexToRgb(ice ? '#255a78' : '#8a6a48');
  const bands = rng.int(7, 16);

  for (let y = 0; y < H; y++) {
    const v = (y + 0.5) / H;
    const lat = (v - 0.5) * 2;
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W;
      const p = sphere(u, v);
      // wobble the band edges so they are not stripes on a beach ball
      const wob = (warp(u * 5, v * 9) * 0.5) * 0.06 + (n(p.x * 3, p.y * 3, p.z * 3)) * 0.03;
      const band = Math.sin((v + wob) * Math.PI * bands);
      const turb = n(p.x * 7, p.y * 20, p.z * 7) * 0.35 + n(p.x * 16, p.y * 42, p.z * 16) * 0.18;
      let t = clamp(band * 0.5 + 0.5 + turb * 0.5, 0, 1);
      const polar = smoothstep(0.6, 1, Math.abs(lat));
      let r = lerp(base[0], alt[0], t), g = lerp(base[1], alt[1], t), b = lerp(base[2], alt[2], t);
      r = lerp(r, dark[0], polar * 0.5); g = lerp(g, dark[1], polar * 0.5); b = lerp(b, dark[2], polar * 0.5);
      const o = (y * W + x) * 4;
      img.data[o] = clamp(r, 0, 255); img.data[o + 1] = clamp(g, 0, 255); img.data[o + 2] = clamp(b, 0, 255); img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // one or two great storms, drawn as stacked ellipses
  const storms = rng.int(1, ice ? 2 : 3);
  for (let s = 0; s < storms; s++) {
    const cx = rng() * W, cy = H * rng.range(0.25, 0.75);
    const rx = W * rng.range(0.035, 0.09), ry = rx * rng.range(0.35, 0.6);
    const hue = ice ? '#d8f0ff' : '#e8865a';
    for (let k = 5; k >= 1; k--) {
      ctx.save();
      ctx.translate(cx, cy); ctx.rotate(rng.range(-0.12, 0.12));
      ctx.globalAlpha = 0.14 * k / 5 + 0.06;
      ctx.fillStyle = k > 3 ? hue : '#ffffff';
      ctx.beginPath(); ctx.ellipse(0, 0, rx * k / 5, ry * k / 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
  return canvas;
}

// ---------------------------------------------------------------------------- one call

/**
 * Every layer a planet needs, in one go.
 *   planetTexture(planet, world, { size: 1024, lights: true })
 *   → { size, map, clouds, lights, emissive, bump, gas }
 * `world` may be null: gas and ice giants get their banded texture instead, and so does any planet
 * whose map has not been generated yet.
 */
export function planetTexture(planet, world = null, opts = {}) {
  const size = opts.size ?? 1024;
  if (!world || planet.giant) {
    return { size, map: gasTexture(planet, { size }), clouds: null, lights: null, emissive: null, bump: null, gas: true };
  }
  return {
    size, gas: false,
    map: surfaceTexture(planet, world, { size }),
    clouds: opts.clouds === false ? null : cloudTexture(planet, { size: Math.max(256, size >> 1) }),
    lights: opts.lights === false ? null : lightsTexture(planet, world, { size: Math.max(256, size >> 1) }),
    emissive: emissiveTexture(planet, world, { size: Math.max(256, size >> 1) }),
    bump: opts.bump === false ? null : bumpTexture(planet, world, { size: Math.max(256, size >> 1) }),
  };
}

/** A moon's face: grey cratered rock, ice, or cooling lava. Small and cheap. */
export function moonTexture(moon, { size = 256 } = {}) {
  const W = size, H = size >> 1;
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const base = hexToRgb(moon.color || '#8f8a82');
  const n = makeNoise3D(subSeed(moon.seed ?? 1, 'moon'));
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    const v = (y + 0.5) / H;
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W;
      const p = sphere(u, v);
      let f = 0, amp = 0.5, freq = 3;
      for (let o = 0; o < 4; o++) { f += amp * n(p.x * freq, p.y * freq, p.z * freq); amp *= 0.5; freq *= 2.1; }
      const k = 0.75 + f * 0.5;
      const o = (y * W + x) * 4;
      img.data[o] = clamp(base[0] * k, 0, 255); img.data[o + 1] = clamp(base[1] * k, 0, 255); img.data[o + 2] = clamp(base[2] * k, 0, 255); img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // craters
  const rng = makeRng(subSeed(moon.seed ?? 1, 'craters'));
  for (let i = 0; i < 40; i++) {
    const x = rng() * W, y = rng() * H, r = rng.range(1.5, W * 0.035);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(0,0,0,0.28)'); g.addColorStop(0.7, 'rgba(255,255,255,0.10)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  return canvas;
}
